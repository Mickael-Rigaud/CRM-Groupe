// Espace RGD Renova — devis et encaissements
//
// ÉTAPE 4 DE LA MIGRATION, RANG 2
// Deux écrans de plus repris dans le CRM. Lecture seule comme le rang 1 :
// Cloudflare D1 fait foi jusqu'à l'étape 5.
//
// CE QUE LES CHIFFRES DE CETTE PAGE NE FONT PAS
// Ils n'additionnent pas tout. Trois réalités de la base l'interdisent, et
// les taire donnerait des totaux faux avec l'air d'être justes :
//
//   1. Un paiement ANNULÉ n'est pas de l'argent. Treize lignes, 139 748 € au
//      21/09/2026, qu'un `sum(montant_ht)` naïf ferait entrer dans le chiffre
//      d'affaires. Ils sont comptés à part et jamais dans un total.
//   2. Un REMBOURSEMENT porte un montant NÉGATIF. L'additionner aux
//      encaissements donne un net qui cache les deux mouvements : on montre
//      l'encaissé et les remboursements séparément, et le net en dessous.
//   3. Plus de la MOITIÉ des paiements n'a pas de chantier — 89 sur 165 au
//      21/09/2026. Ce n'est pas un défaut de la reprise : Cloudflare a
//      exactement le même compte, vérifié. Ils viennent de Costructor avec une
//      référence client mais sans chantier. Ils comptent dans l'argent, ils
//      n'ont simplement pas de client à afficher — et l'écran le dit.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { openDeal } from './deal.js';
import { cadre, guard, clientDe } from './rgd-espace.js';
import { peutEcrire, signerDevis } from '../data/rgd-api.js';
import { toast, confirm as demander } from '../ui.js';

// Le chantier et son client, pour une ligne qui porte un `deal_id`.
function rattachement(deal_id) {
  if (!deal_id) return null;
  const affaire = db.byId('deals', deal_id);
  if (!affaire) return null;
  const chantier = scope.rgd('rgd_chantiers').find(c => c.deal_id === deal_id) || null;
  return { affaire, chantier, client: clientDe(affaire, db) };
}

const cellRattachement = (r) => r
  ? `<a href="#" data-affaire="${r.affaire.id}">${esc(r.affaire.title)}</a>${r.client ? `<div class="s muted">${esc(r.client)}</div>` : ''}`
  : '<span class="muted small">sans chantier</span>';

// ------------------------------------------------------------------- Devis
const STATUTS_DEVIS = [
  { key: 'signe', label: 'Signé', ton: 'green' },
  { key: 'envoye', label: 'Envoyé', ton: 'accent' },
  { key: 'vu', label: 'Vu', ton: 'accent' },
  { key: 'brouillon', label: 'Brouillon', ton: 'muted' },
  { key: 'refuse', label: 'Refusé', ton: 'red' },
  { key: 'expire', label: 'Expiré', ton: 'muted' },
];

export const rgdDevisPage = {
  title: () => 'RGD Renova — Devis',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { statut: '', q: '', focus: null, ecriture: false };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

    const draw = () => {
      const tous = scope.rgd('rgd_devis')
        .slice()
        .sort((a, b) => String(b.date_creation || '').localeCompare(String(a.date_creation || '')));
      const ts = terms(state.q);
      const vus = tous
        .filter(d => !state.statut || d.statut === state.statut)
        .filter(d => hit([d.numero, d.objet, rattachement(d.deal_id)?.affaire.title, rattachement(d.deal_id)?.client], ts));

      const somme = (l) => l.reduce((t, d) => t + (Number(d.montant_ht) || 0), 0);
      const signes = tous.filter(d => d.statut === 'signe');
      const enCours = tous.filter(d => ['brouillon', 'envoye', 'vu'].includes(d.statut));
      const refuses = tous.filter(d => ['refuse', 'expire'].includes(d.statut));
      // Un taux ne se lit que sur une population tranchée : un devis encore en
      // cours n'a ni gagné ni perdu, l'inclure ferait baisser le taux à mesure
      // qu'on envoie des devis.
      const tranches = signes.length + refuses.length;

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Devis signés', valeur: signes.length,
            sous: `${eur(somme(signes))} HT`, icone: '✍', ton: 'green', href: '#/rgd/devis' })}
          ${kpiEspace({ label: 'En cours', valeur: enCours.length,
            sous: enCours.length ? `${eur(somme(enCours))} HT en jeu` : 'aucun devis en attente', icone: '⏳', ton: 'amber', href: '#/rgd/devis' })}
          ${kpiEspace({ label: 'Refusés ou expirés', valeur: refuses.length,
            sous: `${eur(somme(refuses))} HT`, icone: '✕', ton: 'red', href: '#/rgd/devis' })}
          ${kpiEspace({ label: 'Taux de signature', valeur: tranches ? Math.round(signes.length / tranches * 100) + ' %' : '—',
            sous: tranches ? `sur ${tranches} devis tranchés` : 'aucun devis tranché', icone: '📈', href: '#/rgd/devis' })}
        </div>

        <div class="pill-tabs">
          <button type="button" data-statut="" class="${state.statut ? '' : 'on'}">Tous<span>${tous.length}</span></button>
          ${STATUTS_DEVIS.filter(s => tous.some(d => d.statut === s.key)).map(s =>
            `<button type="button" data-statut="${s.key}" class="${state.statut === s.key ? 'on' : ''}">${esc(s.label)}<span>${tous.filter(d => d.statut === s.key).length}</span></button>`).join('')}
        </div>

        <div class="toolbar">
          ${searchInput('rd-q', state, 'Rechercher un numéro, un objet, un client…')}
          <span class="grow"></span>
          <span class="muted small">${vus.length} devis</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Numéro</th><th>Chantier</th><th>Objet</th><th>Statut</th>
              <th class="num">Montant HT</th><th>Créé le</th><th>Signé le</th>
              ${state.ecriture ? '<th></th>' : ''}</tr></thead>
            <tbody>${vus.map(d => {
              const r = rattachement(d.deal_id);
              const s = STATUTS_DEVIS.find(x => x.key === d.statut);
              return `<tr>
                <td><b>${esc(d.numero)}</b></td>
                <td>${cellRattachement(r)}</td>
                <td class="muted">${esc(d.objet || '—')}</td>
                <td>${s ? `<span class="chip ${s.ton}">${esc(s.label)}</span>` : esc(d.statut || '—')}</td>
                <td class="num">${eur(d.montant_ht)}</td>
                <td>${d.date_creation ? fmtDate(d.date_creation) : '<span class="muted">—</span>'}</td>
                <td>${d.date_signature ? fmtDate(d.date_signature) : '<span class="muted">—</span>'}</td>
                ${state.ecriture ? `<td>${d.statut === 'signe' || !d.d1_id ? ''
                  : `<button type="button" class="btn ghost sm" data-signer="${esc(String(d.d1_id))}">Marquer signé</button>`}</td>` : ''}
              </tr>`;
            }).join('') || `<tr><td colspan="${state.ecriture ? 8 : 7}"><div class="empty">Aucun devis ne correspond.</div></td></tr>`}</tbody>
          </table>
          ${state.ecriture ? `<p class="small muted">⚠ <b>Costructor reste la source des devis.</b>
          « Marquer signé » écrit dans le tableau de bord, mais la synchronisation
          Costructor réécrit le statut et la date de signature à chaque passage :
          si le devis n'est pas accepté <b>chez Costructor</b>, il y reviendra.
          Le bouton dépanne, il ne remplace pas l'acceptation là-bas.</p>` : ''}
        </section>`;

      root.innerHTML = cadre('#/rgd/devis', 'Devis', corps);
      bindSearch(root, 'rd-q', state, draw); restoreFocus(root, state);

      // On demande confirmation avec la modale du CRM, pas celle du navigateur :
      // la seconde ne se met pas aux couleurs de l'application et, sur certains
      // navigateurs, se fait bloquer sans un mot.
      root.querySelectorAll('[data-signer]').forEach(b => b.onclick = async () => {
        const ok = await demander(
          'Marquer ce devis comme signé dans le tableau de bord RGD ? '
          + 'Costructor reste la source : si le devis n’y est pas accepté, le statut '
          + 'y reviendra à la prochaine synchronisation.');
        if (!ok) return;
        b.disabled = true;
        const r = await signerDevis(b.dataset.signer);
        b.disabled = false;
        if (!r.ok) {
          toast(r.motif === 'pas-de-compte'
            ? 'Aucun compte RGD à votre adresse : rien n’a été changé.'
            : `Non enregistré — ${r.motif}`, 'err');
          return;
        }
        const ligne = scope.rgd('rgd_devis').find(x => String(x.d1_id) === b.dataset.signer);
        if (ligne) { ligne.statut = 'signe'; ligne.date_signature = new Date().toISOString().slice(0, 10); }
        toast('Devis marqué signé dans le tableau de bord RGD');
        draw();
      });
      root.querySelectorAll('[data-statut]').forEach(b => b.onclick = () => {
        state.statut = state.statut === b.dataset.statut ? '' : b.dataset.statut; draw();
      });
      root.querySelectorAll('[data-affaire]').forEach(a => a.onclick = (e) => {
        e.preventDefault(); openDeal(a.dataset.affaire, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};

// ----------------------------------------------------------- Encaissements
const TYPES_PAIEMENT = {
  acompte: 'Acompte', situation: 'Situation', solde: 'Solde',
  avenant: 'Avenant', remboursement: 'Remboursement',
};

export const rgdPaiementsPage = {
  title: () => 'RGD Renova — Encaissements',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'recu', q: '', focus: null };

    const draw = () => {
      const tous = scope.rgd('rgd_paiements')
        .slice()
        .sort((a, b) => String(b.date_reception || b.date_facturation || b.date_echeance || '')
          .localeCompare(String(a.date_reception || a.date_facturation || a.date_echeance || '')));

      const somme = (l) => l.reduce((t, p) => t + (Number(p.montant_ht) || 0), 0);
      // Les trois populations ne se recouvrent jamais, et les remboursements
      // sortent des encaissements : un montant négatif dans un total d'argent
      // rentré ne se voit pas, il se soustrait en silence.
      const rembourses = tous.filter(p => p.type === 'remboursement' && p.statut !== 'annule');
      const recus = tous.filter(p => p.statut === 'recu' && p.type !== 'remboursement');
      const attendus = tous.filter(p => p.statut === 'facture' && p.type !== 'remboursement');
      const annules = tous.filter(p => p.statut === 'annule');

      const VUES = [
        { key: 'recu', label: 'Encaissés', liste: recus },
        { key: 'facture', label: 'Facturés, pas encore reçus', liste: attendus },
        { key: 'remboursement', label: 'Remboursements', liste: rembourses },
        { key: 'annule', label: 'Annulés', liste: annules },
        { key: 'tous', label: 'Tout', liste: tous },
      ];
      const vue = VUES.find(v => v.key === state.vue) || VUES[0];

      const ts = terms(state.q);
      const vus = vue.liste.filter(p => hit([p.libelle, p.reference_facture, p.costructor_quote_number,
        rattachement(p.deal_id)?.affaire.title, rattachement(p.deal_id)?.client], ts));

      const sansChantier = tous.filter(p => !p.deal_id).length;

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Encaissé', valeur: eur(somme(recus)),
            sous: `${recus.length} règlement${recus.length > 1 ? 's' : ''} reçu${recus.length > 1 ? 's' : ''}`, icone: '💶', ton: 'green', href: '#/rgd/paiements' })}
          ${kpiEspace({ label: 'Facturé, pas encore reçu', valeur: eur(somme(attendus)),
            sous: `${attendus.length} facture${attendus.length > 1 ? 's' : ''} en attente`, icone: '⏳', ton: 'amber', href: '#/rgd/paiements' })}
          ${kpiEspace({ label: 'Remboursements', valeur: eur(Math.abs(somme(rembourses))),
            sous: `${rembourses.length} mouvement${rembourses.length > 1 ? 's' : ''} sortant${rembourses.length > 1 ? 's' : ''}`, icone: '↩', ton: 'red', href: '#/rgd/paiements' })}
          ${kpiEspace({ label: 'Net encaissé', valeur: eur(somme(recus) + somme(rembourses)),
            sous: 'encaissé moins remboursements', icone: '🧮', href: '#/rgd/paiements' })}
        </div>

        ${annules.length || sansChantier ? `<div class="alert">
          <b>!</b>
          <div>${annules.length ? `<b>${annules.length} paiement${annules.length > 1 ? 's' : ''} annulé${annules.length > 1 ? 's' : ''}</b> (${eur(somme(annules))}) ${annules.length > 1 ? 'sont exclus' : 'est exclu'} de tous les totaux ci-dessus.` : ''}
          ${annules.length && sansChantier ? ' ' : ''}
          ${sansChantier ? `<b>${sansChantier} paiement${sansChantier > 1 ? 's' : ''} sur ${tous.length}</b> ${sansChantier > 1 ? 'ne sont rattachés' : "n'est rattaché"} à aucun chantier : ${sansChantier > 1 ? 'ils viennent' : 'il vient'} de Costructor avec une référence client mais sans chantier. ${sansChantier > 1 ? 'Ils comptent' : 'Il compte'} dans l&rsquo;argent, ${sansChantier > 1 ? 'ils n&rsquo;ont' : 'il n&rsquo;a'} simplement pas de chantier à afficher.` : ''}</div>
        </div>` : ''}

        <div class="pill-tabs">
          ${VUES.map(v => `<button type="button" data-vue="${v.key}" class="${state.vue === v.key ? 'on' : ''}">${esc(v.label)}<span>${v.liste.length}</span></button>`).join('')}
        </div>

        <div class="toolbar">
          ${searchInput('rp-q', state, 'Rechercher un libellé, une facture, un client…')}
          <span class="grow"></span>
          <span class="muted small">${vus.length} ligne${vus.length > 1 ? 's' : ''} · ${eur(somme(vus))} HT</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Chantier</th><th>Libellé</th>
              <th>Facture</th><th>Statut</th><th class="num">Montant HT</th></tr></thead>
            <tbody>${vus.map(p => {
              const r = rattachement(p.deal_id);
              const quand = p.date_reception || p.date_facturation || p.date_echeance;
              const negatif = Number(p.montant_ht) < 0;
              return `<tr>
                <td>${quand ? fmtDate(quand) : '<span class="muted">—</span>'}</td>
                <td>${esc(TYPES_PAIEMENT[p.type] || p.type || '—')}</td>
                <td>${cellRattachement(r)}</td>
                <td class="muted">${esc(p.libelle || '—')}</td>
                <td class="muted">${esc(p.reference_facture || p.costructor_quote_number || '—')}</td>
                <td>${p.statut === 'recu' ? '<span class="chip green">Reçu</span>'
                     : p.statut === 'facture' ? '<span class="chip amber">Facturé</span>'
                     : p.statut === 'annule' ? '<span class="chip">Annulé</span>'
                     : esc(p.statut || '—')}</td>
                <td class="num${negatif ? ' status-lost' : ''}">${eur(p.montant_ht)}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="7"><div class="empty">Aucun règlement ne correspond.</div></td></tr>'}</tbody>
          </table>
        </section>`;

      root.innerHTML = cadre('#/rgd/paiements', 'Encaissements', corps);
      bindSearch(root, 'rp-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });
      root.querySelectorAll('[data-affaire]').forEach(a => a.onclick = (e) => {
        e.preventDefault(); openDeal(a.dataset.affaire, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
