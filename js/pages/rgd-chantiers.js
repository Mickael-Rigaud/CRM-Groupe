// Espace RGD Renova — chantiers et clients, lus dans le CRM
//
// ÉTAPE 4 DE LA MIGRATION, RANG 1
// Ces deux écrans sont les premiers de RGD Renova à vivre dans le CRM plutôt
// que dans son application d'origine. Ils lisent `rgd_chantiers` et les
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
import { ACTIVITIES } from '../data/schema.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { coquilleEspace, poserEspace, kpiEspace } from './espace.js';
import { openDeal } from './deal.js';

const KEY = 'rgd';
const act = () => ACTIVITIES[KEY];

const ONGLETS = [
  { hash: '#/rgd', label: 'Chantiers' },
  { hash: '#/rgd/clients', label: 'Clients' },
  // Tout ce qui n'est pas encore repris vit toujours dans l'application
  // d'origine. L'onglet reste tant qu'il y a des écrans dedans.
  { hash: '#/rgd/app', label: 'Application RGD' },
];

const cadre = (actif, titre, corps) => coquilleEspace({
  actif, titre, corps,
  cle: KEY, marque: act().label, baseline: 'Rénovation tous corps d’état', onglets: ONGLETS,
});

// Le bandeau qui dit d'où viennent ces chiffres et pourquoi on ne les modifie
// pas ici. Il disparaîtra à l'étape 5, quand le CRM deviendra la source.
const BANDEAU = `<div class="alert rgd-source">
  <b>i</b>
  <div>Ces écrans <b>lisent</b> les données du tableau de bord RGD Renova, relevées
  toutes les 30 minutes. Pour créer ou modifier, passez par l&rsquo;onglet
  <a href="#/rgd/app">Application RGD</a> — une modification faite ici serait
  écrasée au relevé suivant.</div>
</div>`;

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n’avez pas accès à l’activité RGD Renova.</div></div>';
  return true;
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

const clientDe = (affaire) => {
  if (!affaire) return null;
  if (affaire.contact_id) {
    const c = db.byId('contacts', affaire.contact_id);
    return c ? { nom: `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—', id: c.id, genre: 'contact' } : null;
  }
  if (affaire.organisation_id) {
    const o = db.byId('organisations', affaire.organisation_id);
    return o ? { nom: o.name, id: o.id, genre: 'organisation' } : null;
  }
  return null;
};

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
        ${BANDEAU}
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

      root.innerHTML = cadre('#/rgd', 'Chantiers', corps);
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

// ------------------------------------------------------------------ Clients
export const rgdClientsPage = {
  title: () => 'RGD Renova — Clients',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { type: '', q: '', focus: null };

    const draw = () => {
      const contacts = scope.contacts().filter(c => (c.activities || []).includes(KEY))
        .map(c => ({ ...c, _nom: `${c.first_name || ''} ${c.last_name || ''}`.trim(), _genre: 'Particulier' }));
      const orgs = scope.orgs().filter(o => (o.activities || []).includes(KEY))
        .map(o => ({ ...o, _nom: o.name, _genre: 'Professionnel' }));
      const tous = [...contacts, ...orgs].sort((a, b) => a._nom.localeCompare(b._nom, 'fr'));

      const ts = terms(state.q);
      const vus = tous
        .filter(c => !state.type || c.type === state.type)
        .filter(c => hit([c._nom, c.email, c.phone, c.city], ts));

      // Une demande de devis est un signal : quelqu'un revient. On compte
      // celles qui n'ont pas encore été traitées.
      const demandes = scope.rgd('rgd_demandes');
      const aTraiter = demandes.filter(d => d.statut === 'nouveau_prospect');

      const parType = [...new Set(tous.map(c => c.type).filter(Boolean))];

      const corps = `
        ${BANDEAU}
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Clients et prospects', valeur: tous.length,
            sous: `${contacts.length} particuliers, ${orgs.length} professionnels`, icone: '👥', href: '#/rgd/clients' })}
          ${kpiEspace({ label: 'Clients', valeur: tous.filter(c => c.type === 'Client').length,
            sous: 'ont déjà signé', icone: '🤝', ton: 'green', href: '#/rgd/clients' })}
          ${kpiEspace({ label: 'Demandes de devis', valeur: demandes.length,
            sous: `${aTraiter.length} à traiter`, icone: '📨', ton: aTraiter.length ? 'amber' : 'accent', href: '#/rgd/clients' })}
        </div>

        ${aTraiter.length ? `<section class="card">
          <div class="card-head"><h2>Demandes à traiter</h2><span class="muted small">reçues par le formulaire du site</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Reçue le</th><th>Demandeur</th><th>Projet</th><th>Budget</th><th>Ville</th></tr></thead>
            <tbody>${aTraiter.slice(0, 10).map(d => `<tr>
              <td>${d.date_demande ? fmtDate(d.date_demande) : '—'}</td>
              <td>${esc(`${d.prenom || ''} ${d.nom || ''}`.trim() || '—')}</td>
              <td>${esc(d.type_projet || '—')}</td>
              <td>${esc(String(d.budget || '—').trim())}</td>
              <td>${esc(d.ville || '—')}</td>
            </tr>`).join('')}</tbody>
          </table></div>
          ${aTraiter.length > 10 ? `<p class="small muted">10 des ${aTraiter.length} demandes en attente.</p>` : ''}
        </section>` : ''}

        <div class="pill-tabs">
          <button type="button" data-type="" class="${state.type ? '' : 'on'}">Tous<span>${tous.length}</span></button>
          ${parType.map(t => `<button type="button" data-type="${esc(t)}" class="${state.type === t ? 'on' : ''}">${esc(t)}<span>${tous.filter(c => c.type === t).length}</span></button>`).join('')}
        </div>

        <div class="toolbar">
          ${searchInput('rcl-q', state, 'Rechercher un client, un email, une ville…')}
          <span class="grow"></span>
          <span class="muted small">${vus.length} fiche${vus.length > 1 ? 's' : ''}</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Nature</th><th>Statut</th><th>Ville</th><th>Téléphone</th><th>Email</th><th class="num">Chantiers</th></tr></thead>
            <tbody>${vus.map(c => {
              const n = scope.rgd('rgd_chantiers').filter(ch => {
                const d = db.byId('deals', ch.deal_id);
                return d && (d.contact_id === c.id || d.organisation_id === c.id);
              }).length;
              return `<tr>
                <td><b>${esc(c._nom || '—')}</b></td>
                <td class="muted">${esc(c._genre)}</td>
                <td>${c.type ? `<span class="chip">${esc(c.type)}</span>` : '<span class="muted">—</span>'}</td>
                <td>${esc(c.city || '—')}</td>
                <td>${esc(c.phone || '—')}</td>
                <td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="muted">—</span>'}</td>
                <td class="num">${n || '<span class="muted">—</span>'}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="7"><div class="empty">Aucune fiche ne correspond.</div></td></tr>'}</tbody>
          </table>
        </section>`;

      root.innerHTML = cadre('#/rgd/clients', 'Clients', corps);
      bindSearch(root, 'rcl-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
        state.type = state.type === b.dataset.type ? '' : b.dataset.type; draw();
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};

