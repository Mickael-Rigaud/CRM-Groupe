// Espace RGD Renova — chantiers
//
// ÉTAPE 4 DE LA MIGRATION, RANG 1
// Le premier écran de RGD Renova à vivre dans le CRM plutôt que dans son
// application d'origine. « Clients & prospects » le suivait ici jusqu'au
// 21/09/2026 ; il est parti dans `rgd-clients.js` en gagnant ses trois
// rubriques, et ce fichier est passé de 301 à 150 lignes. La coquille — onglets, cadre, bandeau — est
// partagée avec les écrans des rangs suivants et vit dans `rgd-espace.js`. Ils lisent `rgd_chantiers` et les
// contacts marqués `rgd` — c'est-à-dire le relevé que le worker dépose toutes
// les demi-heures. Les douze autres écrans restent dans l'application, qui
// garde son onglet : la bascule se fait un rang à la fois.
//
// LECTURE SEULE, ET CE N'EST PAS UN OUBLI
// Cloudflare D1 reste la vérité tant que l'étape 5 n'est pas franchie. Écrire
// ici créerait deux sources qui divergent : la modification serait écrasée au
// relevé suivant, sans bruit. Tant que la flèche ne va que dans un sens, on ne
// peut pas se tromper — et le bandeau le dit à celui qui regarde.
//
// L'AFFAIRE ET LE CHANTIER
// Un chantier RGD est deux choses : une affaire qu'on vend, puis des travaux
// qu'on exécute. Le pipeline du CRM porte la vente et s'arrête à
// « Négociation » ; `rgd_chantiers` porte l'exécution. Ces écrans montrent les
// deux ensemble, ce que ni l'un ni l'autre ne sait faire seul.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { openDeal } from './deal.js';

import { KEY, act, cadre, guard, clientDe as clientDeAffaire } from './rgd-espace.js';

// Le client d'une affaire, avec la forme attendue par cet écran.
const clientDe = (affaire) => {
  const nom = clientDeAffaire(affaire, db);
  return nom ? { nom } : null;
};

// Les états d'exécution, dans l'ordre du chantier. `null` = pas encore vendu :
// l'affaire est toujours en discussion, il n'y a pas de travaux.
const ETATS = [
  { key: 'signe', label: 'Signé', ton: 'accent' },
  { key: 'demarrage', label: 'Démarrage', ton: 'amber' },
  { key: 'en_cours', label: 'En cours', ton: 'green' },
  { key: 'termine', label: 'Terminé', ton: 'muted' },
];
const etatDe = (c) => ETATS.find(e => e.key === c.etat) || null;

// Un chantier, vu avec son affaire. Les deux vont toujours ensemble : sans
// l'affaire on ne sait pas à qui c'est, sans le chantier on ne sait pas où ça
// en est.
function chantiers() {
  const affaires = new Map(scope.deals().filter(d => d.activity === KEY).map(d => [d.id, d]));
  return scope.rgd('rgd_chantiers')
    .map(c => ({ ...c, affaire: affaires.get(c.deal_id) || null }))
    // Un chantier dont l'affaire ne nous est pas visible ne nous regarde pas.
    .filter(c => c.affaire)
    .sort((a, b) => String(b.date_debut_prevue || '').localeCompare(String(a.date_debut_prevue || '')));
}

// ---------------------------------------------------------------- Chantiers
export const rgdChantiersPage = {
  title: () => 'RGD Renova — Chantiers',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { etat: '', q: '', focus: null };

    const draw = () => {
      const tous = chantiers();
      const ts = terms(state.q);
      const vus = tous
        .filter(c => !state.etat || (state.etat === '—' ? !c.etat : c.etat === state.etat))
        .filter(c => hit([c.affaire?.title, c.ville, c.reference, clientDe(c.affaire)?.nom], ts));

      const enCours = tous.filter(c => c.etat === 'en_cours' || c.etat === 'demarrage');
      const somme = (l) => l.reduce((t, c) => t + (Number(c.montant_ht) || 0), 0);
      const aVendre = tous.filter(c => !c.etat);

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Chantiers en cours', valeur: enCours.length,
            sous: `${eur(somme(enCours))} HT engagés`, icone: '🏗', href: '#/rgd' })}
          ${kpiEspace({ label: 'Terminés', valeur: tous.filter(c => c.etat === 'termine').length,
            sous: `${eur(somme(tous.filter(c => c.etat === 'termine')))} HT réalisés`, icone: '✅', ton: 'green', href: '#/rgd' })}
          ${kpiEspace({ label: 'En discussion', valeur: aVendre.length,
            sous: aVendre.length ? 'affaires pas encore signées' : 'aucune affaire ouverte', icone: '💬', ton: 'amber', href: '#/rgd' })}
          ${kpiEspace({ label: 'Total suivi', valeur: tous.length,
            sous: `${eur(somme(tous))} HT tous chantiers`, icone: '📋', href: '#/rgd' })}
        </div>

        <div class="pill-tabs">
          <button type="button" data-etat="" class="${state.etat ? '' : 'on'}">Tous<span>${tous.length}</span></button>
          ${ETATS.map(e => `<button type="button" data-etat="${e.key}" class="${state.etat === e.key ? 'on' : ''}">${esc(e.label)}<span>${tous.filter(c => c.etat === e.key).length}</span></button>`).join('')}
          ${aVendre.length ? `<button type="button" data-etat="—" class="${state.etat === '—' ? 'on' : ''}">En discussion<span>${aVendre.length}</span></button>` : ''}
        </div>

        <div class="toolbar">
          ${searchInput('rc-q', state, 'Rechercher un chantier, une ville, un client…')}
          <span class="grow"></span>
          <span class="muted small">${vus.length} chantier${vus.length > 1 ? 's' : ''}</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr>
              <th>Chantier</th><th>Client</th><th>Ville</th>
              <th>État</th><th>Étape commerciale</th><th class="num">Montant HT</th><th>Début prévu</th>
            </tr></thead>
            <tbody>${vus.map(c => {
              const cl = clientDe(c.affaire);
              const e = etatDe(c);
              return `<tr>
                <td><a href="#" data-affaire="${c.affaire.id}"><b>${esc(c.affaire.title)}</b></a>
                    ${c.reference ? `<div class="s muted">${esc(c.reference)}</div>` : ''}</td>
                <td>${cl ? esc(cl.nom) : '<span class="muted">—</span>'}</td>
                <td>${esc(c.ville || '—')}</td>
                <td>${e ? `<span class="chip ${e.ton}">${esc(e.label)}</span>` : '<span class="muted small">pas encore vendu</span>'}</td>
                <td class="muted">${esc(etapeLabel(c.affaire))}</td>
                <td class="num">${c.montant_ht ? eur(c.montant_ht) : '<span class="muted">—</span>'}</td>
                <td>${c.date_debut_prevue ? fmtDate(c.date_debut_prevue) : '<span class="muted">—</span>'}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="7"><div class="empty">Aucun chantier ne correspond.</div></td></tr>'}</tbody>
          </table>
        </section>`;

      root.innerHTML = cadre('#/rgd/chantiers', 'Chantiers', corps);
      bindSearch(root, 'rc-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-etat]').forEach(b => b.onclick = () => {
        state.etat = state.etat === b.dataset.etat ? '' : b.dataset.etat; draw();
      });
      root.querySelectorAll('[data-affaire]').forEach(a => a.onclick = (e) => {
        e.preventDefault(); openDeal(a.dataset.affaire, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};

// L'étape commerciale telle que le CRM la nomme, pas telle que Cloudflare la code.
function etapeLabel(affaire) {
  if (!affaire) return '—';
  if (affaire.status === 'won') return 'Gagnée';
  if (affaire.status === 'lost') return 'Perdue';
  const st = (act().stages || []).find(s => s.key === affaire.stage);
  return st ? st.label : (affaire.stage || '—');
}
