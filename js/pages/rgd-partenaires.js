// Espace RGD Renova — partenaires et achats
//
// ÉTAPE 4 DE LA MIGRATION, RANG 5. Lecture seule, comme les rangs précédents.
//
// POURQUOI LES DEUX SUR LE MÊME ÉCRAN
// Un apporteur envoie du travail, un fournisseur en vend la matière : ce sont
// deux faces de la même question, « avec qui on travaille ». Et surtout, les
// achats tiennent aujourd'hui en UNE ligne — leur consacrer un écran entier
// ferait une page vide avec un titre dessus.
//
// DEUX COMPTES D'APPORTS, ET C'EST VOULU
// `apports_declares` vient de `nb_prospects_manuel` : quelqu'un l'a saisi à la
// main. « Rattachés » est le nombre de fiches clients qui désignent vraiment ce
// partenaire (`rgd_clients.apporteur_id`), repris au rang 6.
//
// Jusqu'au rang 6, cet écran affichait « le CRM ne sait pas rattacher une
// affaire à son apporteur ». C'était vrai, mais la raison n'était pas celle
// qu'on croyait : le lien existait dans D1 depuis le début, il n'était
// simplement pas relevé. La phrase est tombée avec la colonne.
//
// Les deux comptes peuvent diverger, et c'est une information : un apporteur
// crédité à la main sans aucune fiche rattachée, c'est soit une saisie
// optimiste, soit un rattachement oublié. L'écran montre les deux plutôt que
// d'en choisir un.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, BANDEAU, guard } from './rgd-espace.js';

// Les trois rôles que D1 range dans la même table. L'ordre est celui de
// l'intérêt commercial : celui qui apporte des affaires d'abord.
const ROLES = {
  apporteur:  { label: 'Apporteur', ton: 'green' },
  commercial: { label: 'Commercial', ton: 'accent' },
  fournisseur: { label: 'Fournisseur', ton: 'muted' },
};
const role = (k) => ROLES[k] || { label: k || 'Non précisé', ton: 'muted' };

const nomDe = (a) => [a.prenom, a.nom].filter(Boolean).join(' ').trim() || a.societe || '—';

export const rgdPartenairesPage = {
  title: () => 'RGD Renova — Partenaires',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'partenaires', q: '', focus: null };

    const draw = () => {
      const tous = scope.rgd('rgd_apporteurs');
      const achats = scope.rgd('rgd_fournitures');
      const fiches = scope.rgd('rgd_clients');
      const rattaches = (a) => fiches.filter(c => c.apporteur_id === a.id).length;
      const actifs = tous.filter(a => a.actif !== false);
      const declares = tous.reduce((t, a) => t + (Number(a.apports_declares) || 0), 0);
      const signes = tous.filter(a => a.partenariat_signe).length;
      const totalAchats = achats.reduce((t, f) => t + (Number(f.montant_ht) || 0), 0);

      const ts = terms(state.q);
      const vus = tous
        .filter(a => hit([nomDe(a), a.societe, a.profession, a.ville, a.email, a.telephone], ts))
        .slice()
        // Les actifs d'abord, puis ceux qui apportent le plus : c'est une liste
        // de gens à rappeler, pas un annuaire alphabétique.
        .sort((a, b) => (a.actif === false) - (b.actif === false)
          || rattaches(b) - rattaches(a)
          || (Number(b.apports_declares) || 0) - (Number(a.apports_declares) || 0)
          || String(nomDe(a)).localeCompare(String(nomDe(b)), 'fr'));

      const corps = `
        ${BANDEAU}
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Partenaires actifs', valeur: actifs.length,
            sous: tous.length > actifs.length ? `${tous.length - actifs.length} inactif${tous.length - actifs.length > 1 ? 's' : ''}` : 'tous actifs',
            icone: '🤝', href: '#/rgd/partenaires' })}
          ${kpiEspace({ label: 'Clients apportés', valeur: tous.reduce((t, a) => t + rattaches(a), 0),
            sous: `${declares} déclaré${declares > 1 ? 's' : ''} à la main côté RGD`, icone: '↗',
            ton: 'accent', href: '#/rgd/partenaires' })}
          ${kpiEspace({ label: 'Partenariats signés', valeur: signes,
            sous: signes < tous.length ? `${tous.length - signes} sans convention` : 'tous signés',
            icone: '✍', ton: signes ? 'green' : 'amber', href: '#/rgd/partenaires' })}
          ${kpiEspace({ label: 'Achats fournisseurs', valeur: eur(totalAchats),
            sous: `${achats.length} achat${achats.length > 1 ? 's' : ''} enregistré${achats.length > 1 ? 's' : ''}`,
            icone: '🧾', href: '#/rgd/partenaires' })}
        </div>

        ${signes === 0 && tous.length ? `<div class="alert">
          <b>!</b>
          <div><b>Aucun partenariat n’est signé.</b> Les ${tous.length} partenaires
          travaillent sans convention enregistrée — ce qui ne les empêche pas
          d’apporter des affaires, mais ne fixe rien sur la rémunération de
          l’apport. Les conventions se saisissent dans l’<a href="#/rgd/app">application RGD</a>.</div>
        </div>` : ''}

        <div class="pill-tabs">
          <button type="button" data-vue="partenaires" class="${state.vue === 'partenaires' ? 'on' : ''}">Partenaires<span>${tous.length}</span></button>
          <button type="button" data-vue="achats" class="${state.vue === 'achats' ? 'on' : ''}">Achats<span>${achats.length}</span></button>
        </div>

        ${state.vue === 'partenaires' ? `
        <div class="toolbar">
          ${searchInput('rpa-q', state, 'Rechercher un partenaire, un métier, une ville…')}
          <span class="grow"></span>
          <span class="muted small">ceux qui apportent le plus en premier</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Partenaire</th><th>Rôle</th><th>Métier</th><th>Ville</th>
              <th>Contact</th><th>Convention</th>
              <th class="num" title="Fiches clients qui désignent ce partenaire">Rattachés</th>
              <th class="num" title="Compté à la main dans l’application RGD">Déclarés</th></tr></thead>
            <tbody>${vus.map(a => { const r = role(a.type_partenaire); return `<tr class="${a.actif === false ? 'muted' : ''}">
              <td><b>${esc(nomDe(a))}</b>
                  ${a.actif === false ? '<span class="chip">Inactif</span>' : ''}
                  ${a.societe ? `<div class="s muted">${esc(a.societe)}</div>` : ''}</td>
              <td><span class="chip ${r.ton}">${esc(r.label)}</span></td>
              <td class="muted">${esc(a.profession || '—')}</td>
              <td class="muted">${esc([a.ville, a.code_postal].filter(Boolean).join(' · ') || '—')}</td>
              <td>${a.telephone ? esc(a.telephone) : '<span class="muted">—</span>'}
                  ${a.email ? `<div class="s muted">${esc(a.email)}</div>` : ''}</td>
              <td>${a.partenariat_signe
                ? `<span class="chip green">Signée${a.date_signature ? ' · ' + esc(fmtDate(a.date_signature)) : ''}</span>`
                : '<span class="chip amber">Non signée</span>'}</td>
              <td class="num">${rattaches(a) || '<span class="muted">—</span>'}</td>
              <td class="num muted">${Number(a.apports_declares) ? esc(String(a.apports_declares)) : '—'}</td>
            </tr>`; }).join('') || '<tr><td colspan="8"><div class="empty">Aucun partenaire ne correspond.</div></td></tr>'}</tbody>
          </table>
          <p class="small muted"><b>Rattachés</b> compte les fiches clients qui désignent
          vraiment ce partenaire ; <b>Déclarés</b> est le compte tenu à la main dans
          l&rsquo;application RGD. Un écart entre les deux n&rsquo;est pas une erreur du CRM :
          c&rsquo;est soit une saisie optimiste, soit un rattachement oublié à la création
          du client.</p>
        </section>` : `
        <div class="toolbar">
          <span class="muted small">${achats.length} achat${achats.length > 1 ? 's' : ''}
          pour ${eur(totalAchats)} HT</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Achat</th><th>Fournisseur</th><th>Chantier</th>
              <th>Matériaux</th><th class="num">Montant HT</th></tr></thead>
            <tbody>${achats.slice()
              .sort((a, b) => String(b.date_achat || '').localeCompare(String(a.date_achat || '')))
              .map(f => {
                const affaire = f.deal_id ? db.byId('deals', f.deal_id) : null;
                // `materiau` est la liste que D1 stocke en JSON. Une liste vide
                // et une liste absente se disent pareil à l'écran : rien.
                const mats = Array.isArray(f.materiau) ? f.materiau : [];
                return `<tr>
                  <td>${f.date_achat ? fmtDate(f.date_achat) : '<span class="muted">—</span>'}</td>
                  <td><b>${esc(f.libelle || '—')}</b>
                      ${f.reference_facture ? `<div class="s muted">Facture ${esc(f.reference_facture)}</div>` : ''}</td>
                  <td>${esc(f.fournisseur || '—')}</td>
                  <td>${affaire ? esc(affaire.title) : '<span class="muted small">sans chantier</span>'}</td>
                  <td>${mats.length ? mats.map(m => `<span class="chip">${esc(m)}</span>`).join(' ') : '<span class="muted">—</span>'}</td>
                  <td class="num">${eur(f.montant_ht)}</td>
                </tr>`;
              }).join('') || '<tr><td colspan="6"><div class="empty">Aucun achat enregistré.</div></td></tr>'}</tbody>
          </table>
        </section>`}`;

      root.innerHTML = cadre('#/rgd/partenaires', 'Partenaires', corps);
      if (state.vue === 'partenaires') { bindSearch(root, 'rpa-q', state, draw); restoreFocus(root, state); }
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
