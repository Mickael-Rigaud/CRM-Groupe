// Espace RGD Renova — clients & prospects
//
// LA MISE EN PAGE EST CELLE DU TABLEAU DE BORD, DÉLIBÉRÉMENT
// Onglets à compteur, barre de filtres, tableau. Pas d'indicateurs en tête :
// Mickael les a fait retirer le 22/09/2026 — sur un écran d'annuaire, quatre
// grandes cartes repoussent la liste sous la ligne de flottaison pour répéter
// ce que les onglets disent déjà.
//
// TROIS RUBRIQUES, CELLES QU'IL A TRIÉES
// « Partenaires » a quitté cette page le 21/09/2026 pour la sienne. Restent :
//   Clients   — au moins un devis ACCEPTÉ chez Costructor
//   Prospects — pas encore chez Costructor : site, apport, Meta, saisie
//   Contacts  — connu de Costructor, devis accepté ou non
// Elles se CHEVAUCHENT : un client figure aussi dans Contacts. Ce ne sont pas
// trois parts d'un tout, et c'est ainsi dans le tableau de bord.
//
// LE CHIFFRE « CLIENTS » A DEUX VALEURS, ET CE N'EST PAS NOUS
// Le badge du tableau de bord affiche 34 quand 41 fiches portent un devis
// accepté : Costructor dédoublonne par nom+prénom pour le compte, pas pour la
// liste. L'onglet montre 41 — ce sont les lignes qu'on peut ouvrir — et
// l'infobulle dit d'où vient le 34.
//
// LES PROSPECTS VIENNENT DE DEUX TABLES
// « Prospect site » lit `rgd_demandes`, une table à part : une demande du
// formulaire n'a pas forcément de fiche client. Les trois autres lisent
// `rgd_clients`. Les colonnes diffèrent donc d'un sous-onglet à l'autre, comme
// dans l'original — une demande a un projet et un budget annoncés, une fiche a
// un statut et une adresse.
//
// CE QUI EST EN LECTURE SEULE ET NE FAIT PAS SEMBLANT
// Le tableau de bord met un menu déroulant dans la colonne Statut et un champ
// de note dans Commentaire. Ici ce sont du texte : un contrôle qui a l'air de
// s'ouvrir et ne fait rien est pire qu'un texte. La saisie reste dans
// l'application RGD tant que l'étape 5 n'est pas faite.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, fmtDate, fmtDateTime, relDay, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, BANDEAU, guard } from './rgd-espace.js';

const s_ = (n) => (n > 1 ? 's' : '');

// Les quatre provenances de prospect du tableau de bord, dans son ordre.
const SOURCES = [
  { key: 'site', label: 'Prospect site' },
  { key: 'partenaire', label: 'Prospect partenaire' },
  { key: 'meta', label: 'Prospect Meta Ads' },
  { key: 'autre', label: 'Autre prospect' },
];

export const rgdClientsPage = {
  title: () => 'RGD Renova — Clients & prospects',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'clients', sousVue: 'site', q: '', type: '', statut: '', focus: null };

    const draw = () => {
      const fiches = scope.rgd('rgd_clients');
      const apporteurs = scope.rgd('rgd_apporteurs');
      const demandes = scope.rgd('rgd_demandes');
      const badge = scope.rgd('rgd_reglages').find(r => r.cle === 'costructor_clients_uniques')?.valeur ?? null;

      // La personne derrière la fiche : un particulier est un contact, un
      // professionnel une organisation. `push_rgd` range, on relit.
      const qui = (f) => {
        const c = f.contact_id && db.byId('contacts', f.contact_id);
        if (c) return { nom: `${c.first_name || ''} ${c.last_name || ''}`.trim(), email: c.email,
                        tel: c.phone, adresse: c.address, cp: c.postal_code, ville: c.city,
                        type: 'particulier' };
        const o = f.organisation_id && db.byId('organisations', f.organisation_id);
        if (o) return { nom: o.name, email: o.email, tel: o.phone, adresse: o.address,
                        cp: o.postal_code, ville: o.city, type: 'professionnel' };
        return null;
      };
      const adresseDe = (p) => [p?.adresse, [p?.cp, p?.ville].filter(Boolean).join(' ')]
        .filter(Boolean).join(' ') || '—';

      const clients = fiches.filter(f => f.client_confirme);
      const contacts = fiches.filter(f => f.costructor_id);
      const parSource = {
        site: demandes,
        partenaire: fiches.filter(f => f.apporteur_id),
        meta: fiches.filter(f => f.source === 'meta_ads'),
        autre: fiches.filter(f => !f.costructor_id && !f.apporteur_id
          && f.source !== 'meta_ads' && f.source !== 'Formulaire site'),
      };
      const nProspects = SOURCES.reduce((t, s) => t + parSource[s.key].length, 0);

      const RUBRIQUES = [
        { key: 'clients', label: 'Clients', n: clients.length,
          titre: badge != null ? `Costructor en compte ${badge} distinct${s_(Number(badge))} : des fiches font doublon` : '' },
        { key: 'prospects', label: 'Prospects', n: nProspects, titre: '' },
        { key: 'contacts', label: 'Contacts', n: contacts.length, titre: 'Connus de Costructor' },
      ];

      const ts = terms(state.q);
      const surDemandes = state.vue === 'prospects' && state.sousVue === 'site';

      // Les statuts réellement présents, pour ne pas proposer un filtre qui ne
      // rend jamais rien. Ceux des demandes et ceux des fiches sont deux jeux
      // différents : on prend celui de la liste affichée.
      const listeBrute = state.vue === 'clients' ? clients
        : state.vue === 'contacts' ? contacts
        : parSource[state.sousVue];
      const statuts = [...new Set(listeBrute.map(x => x.statut).filter(Boolean))].sort();

      const lignesFiches = listeBrute
        .filter(f => !surDemandes)
        .map(f => ({ f, p: qui(f) }))
        .filter(({ f, p }) => (!state.type || p?.type === state.type)
          && (!state.statut || f.statut === state.statut)
          && hit([p?.nom, p?.email, p?.tel, p?.ville, p?.adresse], ts))
        .sort((a, b) => String(a.p?.nom || '').localeCompare(String(b.p?.nom || ''), 'fr'));

      const lignesDemandes = (surDemandes ? demandes : [])
        .filter(d => (!state.statut || d.statut === state.statut)
          && hit([`${d.prenom || ''} ${d.nom || ''}`, d.email, d.telephone, d.ville,
                  d.adresse, d.type_projet, d.projet_description], ts))
        .sort((a, b) => String(b.date_demande || '').localeCompare(String(a.date_demande || '')));

      const affichees = surDemandes ? lignesDemandes.length : lignesFiches.length;

      // ---------- les deux tableaux ----------
      const tableauFiches = () => `<section class="card table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Type</th><th>Statut</th><th>Email</th>
            <th>Téléphone</th><th>Adresse</th><th>Maj</th></tr></thead>
          <tbody>${lignesFiches.map(({ f, p }) => {
            const ap = f.apporteur_id && apporteurs.find(a => a.id === f.apporteur_id);
            return `<tr>
              <td><b>${esc(p?.nom || '(fiche sans contact)')}</b>
                  ${f.source === 'meta_ads' ? '<span class="chip accent" title="Lead Facebook ou Instagram">Meta</span>' : ''}
                  ${ap ? `<div class="s muted">apporté par ${esc(ap.societe || [ap.prenom, ap.nom].filter(Boolean).join(' '))}</div>` : ''}</td>
              <td class="muted">${esc(p?.type || '—')}</td>
              <td>${f.statut
                ? `<span class="chip ${f.statut === 'client' ? 'green' : f.statut === 'perdu' ? 'red' : ''}">${esc(f.statut)}</span>`
                : '<span class="muted">—</span>'}</td>
              <td>${p?.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '<span class="muted">—</span>'}</td>
              <td>${esc(p?.tel || '—')}</td>
              <td class="muted">${esc(adresseDe(p))}</td>
              <td class="muted small">${f.maj ? esc(relDay(f.maj)) : '—'}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="7"><div class="empty">${esc(vide())}</div></td></tr>`}</tbody>
        </table>
      </section>`;

      const tableauDemandes = () => `<section class="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Nom</th><th>Email</th><th>Téléphone</th><th>Projet</th>
            <th>Budget</th><th>Adresse</th><th>Connu via</th><th>Statut</th><th>Commentaire</th></tr></thead>
          <tbody>${lignesDemandes.map(d => `<tr>
            <td class="small">${d.date_demande ? esc(fmtDateTime(d.date_demande)) : '<span class="muted">—</span>'}</td>
            <td><b>${esc(`${d.prenom || ''} ${d.nom || ''}`.trim() || '—')}</b></td>
            <td>${d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : '<span class="muted">—</span>'}</td>
            <td>${esc(d.telephone || '—')}</td>
            <td class="muted">${esc(d.type_projet || d.projet_description || '—')}</td>
            <td class="muted">${esc(String(d.budget || '—').trim())}</td>
            <td class="muted">${esc([d.adresse, [d.code_postal, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(' ') || '—')}</td>
            <td class="muted">${esc(d.comment_connu || '—')}</td>
            <td>${d.statut
              ? `<span class="chip ${d.statut === 'nouveau_prospect' ? 'amber' : ''}">${esc(d.statut.replace(/_/g, ' '))}</span>`
              : '<span class="muted">—</span>'}</td>
            <td class="muted small">${esc(d.commentaire_admin || '—')}</td>
          </tr>`).join('') || `<tr><td colspan="10"><div class="empty">${esc(vide())}</div></td></tr>`}</tbody>
        </table>
        <p class="small muted">Le statut et le commentaire se modifient dans
        l&rsquo;<a href="#/rgd/app">application RGD</a> : ici ils sont lus, pas saisis.</p>
      </section>`;

      function vide() {
        if (state.q || state.type || state.statut) return 'Aucune fiche ne correspond aux filtres.';
        if (state.vue === 'clients') return 'Aucun devis accepté relevé chez Costructor.';
        if (state.vue === 'contacts') return 'Aucun contact Costructor.';
        return 'Aucun prospect de cette provenance.';
      }

      const corps = `
        ${BANDEAU}

        <div class="pill-tabs">
          ${RUBRIQUES.map(r => `<button type="button" data-vue="${r.key}"
            class="${state.vue === r.key ? 'on' : ''}"${r.titre ? ` title="${esc(r.titre)}"` : ''}>${
            r.label}<span>${r.n}</span></button>`).join('')}
        </div>

        ${state.vue === 'prospects' ? `<div class="pill-tabs sous">
          ${SOURCES.map(s => `<button type="button" data-sous="${s.key}"
            class="${state.sousVue === s.key ? 'on' : ''}">${s.label}<span>${parSource[s.key].length}</span></button>`).join('')}
        </div>` : ''}

        <div class="toolbar">
          ${searchInput('rcl-q', state, surDemandes
            ? 'Recherche nom, email, ville…' : 'Rechercher nom, email, téléphone…')}
          ${surDemandes ? '' : `<select id="rcl-type" aria-label="Type">
            <option value="">Tous types</option>
            <option value="particulier" ${state.type === 'particulier' ? 'selected' : ''}>Particulier</option>
            <option value="professionnel" ${state.type === 'professionnel' ? 'selected' : ''}>Professionnel</option>
          </select>`}
          <select id="rcl-statut" aria-label="Statut">
            <option value="">Tous statuts</option>
            ${statuts.map(st => `<option value="${esc(st)}" ${state.statut === st ? 'selected' : ''}>${esc(st.replace(/_/g, ' '))}</option>`).join('')}
          </select>
          <span class="grow"></span>
          <span class="muted small">${affichees} ligne${s_(affichees)}</span>
        </div>

        ${surDemandes ? tableauDemandes() : tableauFiches()}`;

      root.innerHTML = cadre('#/rgd/clients', 'Clients & prospects', corps);
      bindSearch(root, 'rcl-q', state, draw);
      restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        // Les filtres appartiennent à la liste qu'on quitte : un statut de
        // demande n'existe pas chez les clients, et le garder viderait l'écran
        // sans qu'on comprenne pourquoi.
        state.vue = b.dataset.vue; state.q = ''; state.type = ''; state.statut = ''; draw();
      });
      root.querySelectorAll('[data-sous]').forEach(b => b.onclick = () => {
        state.sousVue = b.dataset.sous; state.q = ''; state.type = ''; state.statut = ''; draw();
      });
      const t = root.querySelector('#rcl-type');
      if (t) t.onchange = () => { state.type = t.value; draw(); };
      const st = root.querySelector('#rcl-statut');
      if (st) st.onchange = () => { state.statut = st.value; draw(); };
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
