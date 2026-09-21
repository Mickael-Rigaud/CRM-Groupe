// Espace RGD Renova — chantiers et clients, lus dans le CRM
//
// ÉTAPE 4 DE LA MIGRATION, RANG 1
// Les deux premiers écrans de RGD Renova à vivre dans le CRM plutôt que dans
// son application d'origine. La coquille — onglets, cadre, bandeau — est
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

import { KEY, act, cadre, BANDEAU, guard, clientDe as clientDeAffaire } from './rgd-espace.js';

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

// ------------------------------------------------------------------ Clients
// Les leads venus de Facebook ou d'Instagram. Ils ont onze champs que les
// autres n'ont pas — campagne, ensemble de publicités, formulaire — et c'est
// tout l'intérêt : savoir quelle publicité rapporte quoi. Le bloc ne s'affiche
// que s'il y en a, plutôt que de montrer un tableau vide en permanence.
function blocMeta(metas, fiches) {
  if (!metas.length) return '';
  const parCampagne = [...new Set(metas.map(m => m.meta_campaign || '(sans campagne)'))]
    .map(nom => ({ nom, n: metas.filter(m => (m.meta_campaign || '(sans campagne)') === nom).length }))
    .sort((a, b) => b.n - a.n);
  return `<section class="card">
    <div class="card-head"><h2>Leads Meta Ads</h2>
      <span class="muted small">${metas.length} sur ${fiches.length} fiches</span></div>
    <div class="toolbar">${parCampagne.map(c =>
      `<span class="chip accent">${esc(c.nom)} · ${c.n}</span>`).join(' ')}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Reçu le</th><th>Campagne</th><th>Publicité</th><th>Formulaire</th>
        <th>Projet</th><th>Bien</th><th>Budget annoncé</th></tr></thead>
      <tbody>${metas.slice()
        .sort((a, b) => String(b.meta_received_at || '').localeCompare(String(a.meta_received_at || '')))
        .map(m => `<tr>
          <td>${m.meta_received_at ? fmtDate(m.meta_received_at) : '<span class="muted">—</span>'}</td>
          <td>${esc(m.meta_campaign || '—')}</td>
          <td class="muted">${esc(m.meta_ad_name || '—')}</td>
          <td class="muted">${esc(m.meta_form_name || '—')}</td>
          <td>${esc(m.meta_type_projet || '—')}</td>
          <td class="muted">${esc(m.meta_type_bien || '—')}</td>
          <td class="muted">${esc(m.meta_budget || '—')}</td>
        </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">Le budget annoncé est ce que la personne a coché dans le
    formulaire Meta : c&rsquo;est une fourchette déclarée, pas un montant de devis.</p>
  </section>`;
}

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

      // La fiche commerciale RGD d'une personne, reprise au rang 6 : budget,
      // nature des travaux, apporteur, origine Meta. Elle vit à côté de
      // `contacts`, qui est partagée par les quatre structures du groupe.
      const fiches = scope.rgd('rgd_clients');
      const apporteurs = scope.rgd('rgd_apporteurs');
      const ficheDe = (c) => fiches.find(f => f.contact_id === c.id || f.organisation_id === c.id);
      const metas = fiches.filter(f => f.source === 'meta_ads');

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
          ${kpiEspace({ label: 'Leads Meta Ads', valeur: metas.length,
            sous: (() => { if (!metas.length) return 'aucun lead Facebook ou Instagram';
              const n = new Set(metas.map(m => m.meta_campaign).filter(Boolean)).size;
              return n ? `${n} campagne${n > 1 ? 's' : ''}` : 'campagne non renseignée'; })(),
            icone: '📣', ton: metas.length ? 'accent' : 'muted', href: '#/rgd/clients' })}
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
            <thead><tr><th>Nom</th><th>Nature</th><th>Statut</th><th>Projet</th><th>Apporteur</th>
              <th>Ville</th><th>Téléphone</th><th class="num">Budget</th><th class="num">Chantiers</th></tr></thead>
            <tbody>${vus.map(c => {
              const n = scope.rgd('rgd_chantiers').filter(ch => {
                const d = db.byId('deals', ch.deal_id);
                return d && (d.contact_id === c.id || d.organisation_id === c.id);
              }).length;
              const f = ficheDe(c);
              const ap = f?.apporteur_id && apporteurs.find(a => a.id === f.apporteur_id);
              const projet = [f?.type_bien, f?.nature_travaux].filter(Boolean).join(' · ');
              return `<tr>
                <td><b>${esc(c._nom || '—')}</b>
                    ${f?.source === 'meta_ads' ? '<span class="chip accent" title="Lead Facebook ou Instagram">Meta</span>' : ''}
                    ${c.email ? `<div class="s muted">${esc(c.email)}</div>` : ''}</td>
                <td class="muted">${esc(c._genre)}</td>
                <td>${c.type ? `<span class="chip">${esc(c.type)}</span>` : '<span class="muted">—</span>'}</td>
                <td class="muted">${esc(projet || '—')}</td>
                <td class="muted">${ap ? esc(ap.societe || [ap.prenom, ap.nom].filter(Boolean).join(' ')) : '—'}</td>
                <td>${esc(c.city || '—')}</td>
                <td>${esc(c.phone || '—')}</td>
                <td class="num">${Number(f?.budget_travaux) ? eur(f.budget_travaux) : '<span class="muted">—</span>'}</td>
                <td class="num">${n || '<span class="muted">—</span>'}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="9"><div class="empty">Aucune fiche ne correspond.</div></td></tr>'}</tbody>
          </table>
        </section>`;

      root.innerHTML = cadre('#/rgd/clients', 'Clients', corps + blocMeta(metas, fiches));
      bindSearch(root, 'rcl-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
        state.type = state.type === b.dataset.type ? '' : b.dataset.type; draw();
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};

