// Espace RGD Renova — clients & prospects
//
// TROIS RUBRIQUES, CELLES DU TABLEAU DE BORD
// Clients, Prospects, Contacts. Ce sont les tris que Mickael a faits, repris
// tels quels plutôt que remplacés par des tris « plus propres » : deux écrans
// qui rangent les mêmes gens différemment, c'est un écran de trop.
// « Partenaires » a quitté cette page le 21/09/2026 pour la sienne.
//
// ELLES SE CHEVAUCHENT, ET C'EST NORMAL
// Ce ne sont pas trois parts d'un tout : un client figure aussi dans Contacts.
//   Clients   — au moins un devis ACCEPTÉ chez Costructor
//   Contacts  — connu de Costructor, devis accepté ou non
//   Prospects — pas encore chez Costructor : demande du site, lead Meta, apport
//
// LE CHIFFRE « CLIENTS » MÉRITE UNE EXPLICATION
// Le badge du tableau de bord affiche 34, mais 41 fiches portent un devis
// accepté. Costructor dédoublonne par nom+prénom pour le compte et pas pour la
// liste : sept fiches sont donc le même client en double. Cet écran montre les
// 41 lignes — ce sont celles qu'on peut ouvrir — et dit d'où vient le 34.
// Masquer l'écart aurait donné un écran qui se contredit tout seul.
//
// CE QUE LE CRM NE PEUT PAS RECALCULER
// La liste des devis acceptés vit chez Costructor, pas dans D1. Le relevé va
// la chercher une fois par jour et pose `rgd_clients.client_confirme`. Une
// fiche à `null` n'est pas « non client » : c'est « le relevé n'a pas regardé ».
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';

import { poserEspace, kpiEspace } from './espace.js';
import { cadre, BANDEAU, guard, KEY } from './rgd-espace.js';
// Les accords. Un « 1 clients distincts » dans un écran de direction fait
// douter du reste : si le français est faux, le chiffre l'est peut-être aussi.
const s_ = (n) => (n > 1 ? 's' : '');


const RUBRIQUES = [
  { key: 'clients', label: 'Clients' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'contacts', label: 'Contacts' },
];

export const rgdClientsPage = {
  title: () => 'RGD Renova — Clients & prospects',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'clients', q: '', focus: null };

    const draw = () => {
      const fiches = scope.rgd('rgd_clients');
      const apporteurs = scope.rgd('rgd_apporteurs');
      const demandes = scope.rgd('rgd_demandes');
      const chantiers = scope.rgd('rgd_chantiers');
      const reglage = (cle) => scope.rgd('rgd_reglages').find(r => r.cle === cle)?.valeur ?? null;

      // La personne derrière la fiche : un particulier est un contact, un
      // professionnel une organisation. `push_rgd` range, on relit.
      const qui = (f) => {
        if (f.contact_id) {
          const c = db.byId('contacts', f.contact_id);
          return c && { id: c.id, nom: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                        email: c.email, tel: c.phone, ville: c.city, cp: c.postal_code,
                        genre: 'Particulier', type: c.type };
        }
        if (f.organisation_id) {
          const o = db.byId('organisations', f.organisation_id);
          return o && { id: o.id, nom: o.name, email: o.email, tel: o.phone,
                        ville: o.city, cp: o.postal_code, genre: 'Professionnel', type: o.type };
        }
        return null;
      };

      const clients = fiches.filter(f => f.client_confirme);
      const contacts = fiches.filter(f => f.costructor_id);
      // Un prospect n'est pas encore chez Costructor. Les demandes du site sont
      // d'une AUTRE table : une demande n'a pas forcément de fiche client.
      const prospectsFiches = fiches.filter(f => f.source === 'meta_ads' || f.apporteur_id);
      const nProspects = prospectsFiches.length + demandes.length;
      const metas = fiches.filter(f => f.source === 'meta_ads');
      const badge = reglage('costructor_clients_uniques');
      const doublons = badge != null ? clients.length - Number(badge) : 0;
      const jamaisReleve = fiches.filter(f => f.client_confirme == null).length;

      const nbChantiers = (p) => p ? chantiers.filter(ch => {
        const d = db.byId('deals', ch.deal_id);
        return d && (d.contact_id === p.id || d.organisation_id === p.id);
      }).length : 0;

      const ts = terms(state.q);
      const listeDe = (vue) => (vue === 'clients' ? clients : vue === 'contacts' ? contacts : prospectsFiches)
        .map(f => ({ f, p: qui(f) }))
        .filter(({ f, p }) => hit([p?.nom, p?.email, p?.tel, p?.ville, f.type_bien, f.nature_travaux], ts))
        .sort((a, b) => String(a.p?.nom || '').localeCompare(String(b.p?.nom || ''), 'fr'));

      const vus = listeDe(state.vue);

      const ligne = ({ f, p }) => {
        const ap = f.apporteur_id && apporteurs.find(a => a.id === f.apporteur_id);
        return `<tr>
          <td><b>${esc(p?.nom || '(fiche sans contact)')}</b>
              ${f.source === 'meta_ads' ? '<span class="chip accent" title="Lead Facebook ou Instagram">Meta</span>' : ''}
              ${p?.email ? `<div class="s muted">${esc(p.email)}</div>` : ''}</td>
          <td class="muted">${esc(p?.genre || '—')}</td>
          <td>${f.statut ? `<span class="chip ${f.statut === 'client' ? 'green' : ''}">${esc(f.statut)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="muted">${esc([f.type_bien, f.nature_travaux].filter(Boolean).join(' · ') || '—')}</td>
          <td class="muted">${ap ? esc(ap.societe || [ap.prenom, ap.nom].filter(Boolean).join(' ')) : '—'}</td>
          <td class="muted">${esc([p?.cp, p?.ville].filter(Boolean).join(' ') || '—')}</td>
          <td>${esc(p?.tel || '—')}</td>
          <td class="num">${Number(f.budget_travaux) ? eur(f.budget_travaux) : '<span class="muted">—</span>'}</td>
          <td class="num">${nbChantiers(p) || '<span class="muted">—</span>'}</td>
        </tr>`;
      };

      const tableau = (rows, vide) => `<section class="card table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Nature</th><th>Statut</th><th>Projet</th><th>Apporteur</th>
            <th>Ville</th><th>Téléphone</th><th class="num">Budget</th><th class="num">Chantiers</th></tr></thead>
          <tbody>${rows.map(ligne).join('') || `<tr><td colspan="9"><div class="empty">${esc(vide)}</div></td></tr>`}</tbody>
        </table>
      </section>`;

      const corps = `
        ${BANDEAU}
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Clients', valeur: clients.length,
            sous: badge != null && doublons > 0
              ? `Costructor en compte ${badge} distinct${s_(Number(badge))}` : 'au moins un devis accepté',
            icone: '🤝', ton: 'green', href: '#/rgd/clients' })}
          ${kpiEspace({ label: 'Prospects', valeur: nProspects,
            sous: `${demandes.length} demande${s_(demandes.length)} du site, ${metas.length} Meta, `
              + `${prospectsFiches.length - metas.length} apporté${s_(prospectsFiches.length - metas.length)}`,
            icone: '🌱', ton: 'accent', href: '#/rgd/clients' })}
          ${kpiEspace({ label: 'Contacts', valeur: contacts.length,
            sous: 'connus de Costructor', icone: '📇', href: '#/rgd/clients' })}
          ${kpiEspace({ label: 'Fiches au total', valeur: fiches.length,
            sous: `${fiches.length - contacts.length} hors Costructor`, icone: '👥', href: '#/rgd/clients' })}
        </div>

        ${doublons > 0 ? `<div class="alert">
          <b>i</b>
          <div><b>${clients.length} fiche${s_(clients.length)} ${clients.length > 1 ? 'portent' : 'porte'} un devis accepté,
          pour ${esc(badge)} client${s_(Number(badge))} distinct${s_(Number(badge))}.</b>
          Costructor dédoublonne par nom et prénom pour son compteur, pas pour sa liste :
          <b>${doublons} fiche${doublons > 1 ? 's sont donc des doublons' : ' est donc un doublon'}</b>
          du même client. Le tableau ci-dessous montre les ${clients.length} lignes,
          parce que ce sont celles qu’on peut ouvrir. Les doublons se fusionnent
          dans Costructor, pas ici.</div>
        </div>` : ''}

        ${jamaisReleve ? `<div class="alert">
          <b>!</b>
          <div>${jamaisReleve} fiche${jamaisReleve > 1 ? 's n’ont' : ' n’a'} jamais été
          confrontée${jamaisReleve > 1 ? 's' : ''} à Costructor — le relevé quotidien n’a pas
          encore tourné depuis leur arrivée. Elles ne sont ni « clients » ni « pas clients ».</div>
        </div>` : ''}

        <div class="pill-tabs">
          ${RUBRIQUES.map(r => `<button type="button" data-vue="${r.key}" class="${state.vue === r.key ? 'on' : ''}">${r.label}<span>${
            r.key === 'clients' ? clients.length : r.key === 'contacts' ? contacts.length : nProspects
          }</span></button>`).join('')}
        </div>

        <div class="toolbar">
          ${searchInput('rcl-q', state, 'Rechercher un nom, un email, une ville, un projet…')}
          <span class="grow"></span>
          <span class="muted small">${vus.length} fiche${s_(vus.length)} affichée${s_(vus.length)}</span>
        </div>

        ${state.vue === 'prospects' && demandes.length ? `
        <section class="card">
          <div class="card-head"><h2>Demandes reçues par le site</h2>
            <span class="muted small">${demandes.length} demande${s_(demandes.length)}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Reçue le</th><th>Demandeur</th><th>Projet</th><th>Budget annoncé</th><th>Ville</th><th>Suite donnée</th></tr></thead>
            <tbody>${demandes.slice()
              .sort((a, b) => String(b.date_demande || '').localeCompare(String(a.date_demande || '')))
              .map(d => `<tr>
                <td>${d.date_demande ? fmtDate(d.date_demande) : '<span class="muted">—</span>'}</td>
                <td><b>${esc(`${d.prenom || ''} ${d.nom || ''}`.trim() || '—')}</b>
                    ${d.email ? `<div class="s muted">${esc(d.email)}</div>` : ''}</td>
                <td>${esc(d.type_projet || '—')}</td>
                <td class="muted">${esc(String(d.budget || '—').trim())}</td>
                <td class="muted">${esc(d.ville || '—')}</td>
                <td>${d.statut === 'nouveau_prospect'
                  ? '<span class="chip amber">à traiter</span>'
                  : `<span class="chip muted">${esc(d.statut || '—')}</span>`}</td>
              </tr>`).join('')}</tbody>
          </table></div>
          <p class="small muted">Une demande du site n’est pas forcément devenue une fiche client :
          les deux se comptent séparément, comme dans le tableau de bord.</p>
        </section>` : ''}

        ${tableau(vus, state.q
          ? 'Aucune fiche ne correspond.'
          : state.vue === 'clients' ? 'Aucun devis accepté relevé chez Costructor.'
          : state.vue === 'prospects' ? 'Aucun prospect hors Costructor.'
          : 'Aucun contact Costructor.')}

        ${state.vue === 'prospects' && metas.length ? `
        <section class="card">
          <div class="card-head"><h2>D’où viennent les leads Meta</h2>
            <span class="muted small">${metas.length} lead${s_(metas.length)}</span></div>
          <div class="toolbar">${[...new Set(metas.map(m => m.meta_campaign || '(sans campagne)'))]
            .map(nom => `<span class="chip accent">${esc(nom)} · ${metas.filter(m => (m.meta_campaign || '(sans campagne)') === nom).length}</span>`)
            .join(' ')}</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Reçu le</th><th>Campagne</th><th>Publicité</th><th>Formulaire</th>
              <th>Projet</th><th>Budget annoncé</th></tr></thead>
            <tbody>${metas.slice()
              .sort((a, b) => String(b.meta_received_at || '').localeCompare(String(a.meta_received_at || '')))
              .map(m => `<tr>
                <td>${m.meta_received_at ? fmtDate(m.meta_received_at) : '<span class="muted">—</span>'}</td>
                <td>${esc(m.meta_campaign || '—')}</td>
                <td class="muted">${esc(m.meta_ad_name || '—')}</td>
                <td class="muted">${esc(m.meta_form_name || '—')}</td>
                <td>${esc(m.meta_type_projet || '—')}</td>
                <td class="muted">${esc(m.meta_budget || '—')}</td>
              </tr>`).join('')}</tbody>
          </table></div>
          <p class="small muted">Le budget annoncé est ce que la personne a coché dans le
          formulaire Meta : une fourchette déclarée, pas un montant de devis.</p>
        </section>` : ''}`;

      root.innerHTML = cadre('#/rgd/clients', 'Clients & prospects', corps);
      bindSearch(root, 'rcl-q', state, draw);
      restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        state.vue = b.dataset.vue; state.q = ''; draw();
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
