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
// LE STATUT S'ÉCRIT D'ICI — LE PREMIER CHAMP DE L'ESPACE RGD À LE FAIRE
// Le reste de l'écran lit un reflet relevé toutes les 30 minutes ; le statut,
// lui, part à la SOURCE. Écrire dans le reflet n'aurait servi à rien : le
// relevé suivant l'écraserait sans un mot. Le menu appelle donc l'API du
// tableau de bord (`js/data/rgd-api.js`), qui écrit dans Cloudflare D1 avec le
// jeton de la connexion unique — personne ne gagne de droit au passage.
//
// DEUX EFFETS DE BORD, ET CE SONT CEUX DU TABLEAU DE BORD
// Changer le statut d'un client pousse les champs portables vers Costructor,
// et **envoie un email à l'apporteur** quand le client en a un. Ce n'est pas
// une invention d'ici, c'est ce que fait déjà le menu de l'application — mais
// un écran qui ouvre ce menu doit le dire, et il le dit.
//
// L'AFFICHAGE AVANCE AVANT LE RELEVÉ, ET REVIENT SI ÇA ÉCHOUE
// Une fois l'écriture acceptée, le reflet local est mis à jour tout de suite :
// attendre le relevé ferait revenir l'ancienne valeur sous les yeux de qui
// vient de la changer. En cas de refus, la ligne reprend sa valeur d'avant et
// le motif s'affiche — un menu qui ne dit rien laisserait croire que c'est
// passé.
//
// LE RESTE DE L'ÉCRAN NE S'ÉCRIT TOUJOURS PAS
// Le champ « Note » du tableau de bord reste du texte ici. Il n'a pas été
// demandé, et chaque champ ouvert est un chemin d'écriture de plus à tenir.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, fmtDate, fmtDateTime, relDay, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { peutEcrire, majStatutClient, majStatutDemande } from '../data/rgd-api.js';
import { toast } from '../ui.js';
import { formulaireProspect, supprimerProspect, boutonSuppression } from './rgd-prospect-saisie.js';

const s_ = (n) => (n > 1 ? 's' : '');

// LES STATUTS DE SUIVI, dans l'ordre du tableau de bord (`STATUTS_DEMANDE`).
// Ils décrivent l'avancement d'un prospect, du premier contact au chantier.
// Les tons suivent ceux de l'original : gris au départ, ambre quand on a
// parlé, bleu quand un rendez-vous est posé, orange sur le devis, vert quand
// le chantier tourne, rouge quand c'est perdu.
const STATUTS_SUIVI = [
  { key: 'nouveau_prospect',  label: 'Nouveau prospect',    ton: 'muted' },
  { key: 'relance_1',         label: 'Relance 1',           ton: 'muted' },
  { key: 'relance_2',         label: 'Relance 2',           ton: 'muted' },
  { key: 'relance_3',         label: 'Relance 3',           ton: 'muted' },
  { key: 'a_contacter',       label: 'Contacté',            ton: 'amber' },
  { key: 'rdv_planifie',      label: 'Rendez-vous planifié', ton: 'bleu' },
  { key: 'devis_envoye',      label: 'Devis envoyé',        ton: 'accent' },
  { key: 'devis_accepte',     label: 'Devis accepté',       ton: 'accent' },
  { key: 'chantier_en_cours', label: 'Chantier en cours',   ton: 'green' },
  { key: 'chantier_termine',  label: 'Chantier terminé',    ton: 'green' },
  { key: 'perdu',             label: 'Perdu',               ton: 'red' },
];

// Les statuts de FICHE, qui sont autre chose : ils disent ce qu'est la
// personne, pas où en est l'affaire. Deux vocabulaires, deux colonnes
// (`statut` et `statut_suivi`), et les confondre ferait un filtre qui ne rend
// jamais rien.
const STATUTS_FICHE = [
  { key: 'prospect',   label: 'Prospect',   ton: '' },
  { key: 'client',     label: 'Client',     ton: 'green' },
  { key: 'partenaire', label: 'Partenaire', ton: 'accent' },
  { key: 'qualifie',   label: 'Qualifié',   ton: 'amber' },
  { key: 'inactif',    label: 'Inactif',    ton: 'muted' },
  { key: 'perdu',      label: 'Perdu',      ton: 'red' },
];

const dit = (liste, cle) => liste.find(x => x.key === cle)
  || { key: cle, label: String(cle || '').replace(/_/g, ' '), ton: '' };

// Un statut absent vaut « nouveau prospect » côté suivi, comme dans le
// tableau de bord : une fiche jamais touchée n'est pas une fiche sans état.
const pastilleSuivi = (cle) => {
  const st = dit(STATUTS_SUIVI, cle || 'nouveau_prospect');
  return `<span class="chip st-${esc(st.key)}">${esc(st.label)}</span>`;
};

// Le menu déroulant, aux couleurs du statut courant — comme dans le tableau de
// bord, où la couleur se lit sans ouvrir la liste. `data-cible` dit quelle
// table écrire, `data-id` l'identifiant CÔTÉ CLOUDFLARE : le worker ne connaît
// pas les uuid du CRM.
// ⚠ IL PORTE LES DEUX IDENTIFIANTS, et ce n'est pas une ceinture de plus.
// Depuis le 23/09/2026 une fiche peut naître dans le CRM : elle n'a alors
// AUCUN `d1_id`, et l'envoyer au worker reviendrait à lui demander de modifier
// une fiche qu'il n'a jamais vue. `data-uuid` sert à ces fiches-là, qui
// s'écrivent directement dans Supabase.
const menuStatut = (cle, cible, d1Id, uuid) => {
  const courant = cle || 'nouveau_prospect';
  return `<select class="statut-menu st-${esc(courant)}" data-cible="${esc(cible)}"
    data-id="${esc(String(d1Id ?? ''))}" data-uuid="${esc(String(uuid ?? ''))}"
    data-avant="${esc(courant)}" aria-label="Statut">
    ${STATUTS_SUIVI.map(st => `<option value="${esc(st.key)}" ${st.key === courant ? 'selected' : ''}>${esc(st.label)}</option>`).join('')}
  </select>`;
};
const pastilleFiche = (cle) => cle
  ? `<span class="chip st-${esc(dit(STATUTS_FICHE, cle).key)}">${esc(dit(STATUTS_FICHE, cle).label)}</span>`
  : '<span class="muted">—</span>';

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
    // ⚠ L'ONGLET D'ARRIVÉE PEUT ÊTRE DEMANDÉ DANS L'ADRESSE.
    // `#/rgd/clients?vue=prospects&onglet=meta` ouvre directement les prospects
    // Meta Ads. C'est le mail de notification d'un nouveau lead qui s'en sert :
    // il ne peut PAS viser la fiche elle-même — au moment où il part, le relevé
    // n'a pas encore tourné, la fiche n'existe donc pas dans le CRM et n'a pas
    // d'identifiant à citer. Ouvrir sur la bonne liste est ce qu'on peut
    // promettre sans mentir.
    //
    // Les valeurs sont VÉRIFIÉES contre les listes existantes : une adresse
    // bricolée ne doit pas laisser l'écran dans un état qu'aucun bouton ne
    // produit, avec des compteurs qui ne correspondent à rien.
    const params = new URLSearchParams((location.hash.split('?')[1] || ''));
    const vueDemandee = params.get('vue');
    const ongletDemande = params.get('onglet');
    const state = {
      // ⚠ Les trois onglets sont construits dans `draw()`, pas dans une
      // constante : on liste leurs clés ici. Les tenir à jour ensemble est le
      // prix d'une adresse qui ne casse pas — et une valeur inconnue retombe
      // simplement sur « clients ».
      vue: ['clients', 'prospects', 'contacts'].includes(vueDemandee) ? vueDemandee : 'clients',
      sousVue: SOURCES.some(x => x.key === ongletDemande) ? ongletDemande : 'site',
      q: '', type: '', statut: '', focus: null, ecriture: false,
    };

    // On demande une fois si l'écriture est possible, puis on redessine. Sans
    // compte RGD au même email — ou en mode démo — le menu reste une pastille :
    // mieux vaut un texte figé qu'un contrôle qui échoue au premier clic.
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

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
        // La définition du tableau de bord, mot pour mot : une fiche SAISIE À
        // LA MAIN et sans apporteur. Ma première version prenait « tout ce qui
        // n'est ni Costructor, ni Meta, ni le site », une négation qui ramassait
        // les 18 fiches marquées `Costructor` sans identifiant et les 2 venues
        // de Google Agenda — vingt lignes là où l'original en montre zéro.
        autre: fiches.filter(f => f.source === 'manuel' && !f.apporteur_id),
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
      const surMeta = state.vue === 'prospects' && state.sousVue === 'meta';

      const listeBrute = state.vue === 'clients' ? clients
        : state.vue === 'contacts' ? contacts
        : parSource[state.sousVue];

      // Sur les prospects on filtre l'AVANCEMENT (`statut_suivi`, onze valeurs) ;
      // sur les clients et les contacts, la NATURE de la fiche (`statut`). Le
      // menu propose la liste complète du tableau de bord même quand une valeur
      // n'est pas encore présente : c'est ainsi qu'on voit qu'aucune affaire
      // n'est au stade « devis envoyé », ce qu'une liste réduite cacherait.
      const surProspects = state.vue === 'prospects';
      const champStatut = (x) => surProspects
        ? (state.sousVue === 'site' ? x.statut : (x.statut_suivi || 'nouveau_prospect'))
        : x.statut;
      const statuts = surProspects ? STATUTS_SUIVI : STATUTS_FICHE;

      const lignesFiches = listeBrute
        .filter(f => !surDemandes)
        .map(f => ({ f, p: qui(f) }))
        .filter(({ f, p }) => (!state.type || p?.type === state.type)
          && (!state.statut || champStatut(f) === state.statut)
          && hit([p?.nom, p?.email, p?.tel, p?.ville, p?.adresse], ts))
        .sort((a, b) => String(a.p?.nom || '').localeCompare(String(b.p?.nom || ''), 'fr'));

      const lignesDemandes = (surDemandes ? demandes : [])
        .filter(d => (!state.statut || (d.statut || 'nouveau_prospect') === state.statut)
          && hit([`${d.prenom || ''} ${d.nom || ''}`, d.email, d.telephone, d.ville,
                  d.adresse, d.type_projet, d.projet_description], ts))
        .sort((a, b) => String(b.date_demande || '').localeCompare(String(a.date_demande || '')));

      const affichees = surDemandes ? lignesDemandes.length : lignesFiches.length;

      // ---------- les deux tableaux ----------
      const tableauFiches = () => `<section class="card table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Type</th><th>Statut</th><th>Email</th>
            <th>Téléphone</th><th>Adresse</th><th>Maj</th>${surProspects ? '<th></th>' : ''}</tr></thead>
          <tbody>${lignesFiches.map(({ f, p }) => {
            const ap = f.apporteur_id && apporteurs.find(a => a.id === f.apporteur_id);
            return `<tr>
              <td><b>${esc(p?.nom || '(fiche sans contact)')}</b>
                  ${f.source === 'meta_ads' ? '<span class="chip accent" title="Lead Facebook ou Instagram">Meta</span>' : ''}
                  ${ap ? `<div class="s muted">apporté par ${esc(ap.societe || [ap.prenom, ap.nom].filter(Boolean).join(' '))}</div>` : ''}</td>
              <td class="muted">${esc(p?.type || '—')}</td>
              <td>${!surProspects ? pastilleFiche(f.statut)
                : state.ecriture ? menuStatut(f.statut_suivi, 'client', f.d1_id, f.id)
                : pastilleSuivi(f.statut_suivi)}</td>
              <td>${p?.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '<span class="muted">—</span>'}</td>
              <td>${esc(p?.tel || '—')}</td>
              <td class="muted">${esc(adresseDe(p))}</td>
              <td class="muted small">${f.maj ? esc(relDay(f.maj)) : '—'}</td>
              ${surProspects ? `<td>${boutonSuppression(f)}</td>` : ''}
            </tr>`;
          }).join('') || `<tr><td colspan="${surProspects ? 8 : 7}"><div class="empty">${esc(vide())}</div></td></tr>`}</tbody>
        </table>
      </section>`;

      const tableauDemandes = () => `<section class="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Nom</th><th>Email</th><th>Téléphone</th><th>Projet</th>
            <th>Budget</th><th>Adresse</th><th>Connu via</th><th>Statut</th><th>Commentaire</th><th></th></tr></thead>
          <tbody>${lignesDemandes.map(d => `<tr>
            <td class="small">${d.date_demande ? esc(fmtDateTime(d.date_demande)) : '<span class="muted">—</span>'}</td>
            <td><b>${esc(`${d.prenom || ''} ${d.nom || ''}`.trim() || '—')}</b></td>
            <td>${d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : '<span class="muted">—</span>'}</td>
            <td>${esc(d.telephone || '—')}</td>
            <td class="muted">${esc(d.type_projet || d.projet_description || '—')}</td>
            <td class="muted">${esc(String(d.budget || '—').trim())}</td>
            <td class="muted">${esc([d.adresse, [d.code_postal, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(' ') || '—')}</td>
            <td class="muted">${esc(d.comment_connu || '—')}</td>
            <td>${state.ecriture ? menuStatut(d.statut, 'demande', d.d1_id, d.id) : pastilleSuivi(d.statut)}</td>
            <td class="muted small">${esc(d.commentaire_admin || '—')}</td>
            <td>${boutonSuppression(d)}</td>
          </tr>`).join('') || `<tr><td colspan="11"><div class="empty">${esc(vide())}</div></td></tr>`}</tbody>
        </table>
        <p class="small muted">${state.ecriture
          ? 'Le statut se change ici et part directement dans le tableau de bord RGD. Le commentaire, lui, se saisit dans l’<a href="#/rgd/app">application RGD</a>.'
          : 'Le statut et le commentaire se modifient dans l’<a href="#/rgd/app">application RGD</a> : ici ils sont lus, pas saisis.'}</p>
      </section>`;

      // LES LEADS META ONT LEURS PROPRES COLONNES, et pour une raison : ce
      // sont LES QUESTIONS DU FORMULAIRE Facebook. Projet, type de bien,
      // ville, budget — la personne y a répondu elle-même. Les ranger dans le
      // tableau générique des fiches reviendrait à jeter ce qu'elle a dit pour
      // afficher ce que la base en a fait.
      const tableauMeta = () => `<p class="small muted rcl-intro">Leads reçus depuis les campagnes
        Facebook et Instagram (webhook Zapier). Chaque prospect a reçu un email de
        confirmation automatique.</p>
        <section class="card table-wrap">
        <table>
          <thead><tr><th>Reçu</th><th>Nom</th><th>Contact</th><th>Projet</th><th>Bien</th>
            <th>Ville</th><th>Budget</th><th>Statut</th><th>Note</th><th></th></tr></thead>
          <tbody>${lignesFiches.map(({ f, p }) => `<tr>
            <td class="small">${f.meta_received_at
              ? esc(new Date(f.meta_received_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }))
              : '<span class="muted">—</span>'}</td>
            <td><b>${esc(p?.nom || '—')}</b></td>
            <td>${p?.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ''}
                ${p?.tel ? `<div class="s">${esc(p.tel)}</div>` : ''}
                ${!p?.email && !p?.tel ? '<span class="muted">—</span>' : ''}</td>
            <td>${esc(f.meta_type_projet || '—')}</td>
            <td class="muted">${esc(f.meta_type_bien || '—')}</td>
            <td class="muted">${esc(p?.ville || '—')}</td>
            <td class="muted">${esc(f.meta_budget || '—')}</td>
            <td>${state.ecriture ? menuStatut(f.statut_suivi, 'client', f.d1_id, f.id) : pastilleSuivi(f.statut_suivi)}</td>
            <td class="muted small">${esc(f.notes || '—')}</td>
            <td>${boutonSuppression(f)}</td>
          </tr>`).join('') || `<tr><td colspan="10"><div class="empty">${esc(vide())}</div></td></tr>`}</tbody>
        </table>
        <p class="small muted">${state.ecriture
          ? 'Le statut se change ici et part directement dans le tableau de bord RGD — et, si le lead a un apporteur, celui-ci en est averti par email. La note se saisit dans l’<a href="#/rgd/app">application RGD</a>.'
          : 'Le statut et la note se modifient dans l’<a href="#/rgd/app">application RGD</a> : ici ils sont lus, pas saisis.'}</p>
      </section>`;

      function vide() {
        if (state.q || state.type || state.statut) return 'Aucune fiche ne correspond aux filtres.';
        if (state.vue === 'clients') return 'Aucun devis accepté relevé chez Costructor.';
        if (state.vue === 'contacts') return 'Aucun contact Costructor.';
        return 'Aucun prospect de cette provenance.';
      }

      const corps = `

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
          ${searchInput('rcl-q', state, surDemandes || surMeta
            ? 'Recherche nom, email, ville…' : 'Rechercher nom, email, téléphone…')}
          ${surDemandes || surMeta ? '' : `<select id="rcl-type" aria-label="Type">
            <option value="">Tous types</option>
            <option value="particulier" ${state.type === 'particulier' ? 'selected' : ''}>Particulier</option>
            <option value="professionnel" ${state.type === 'professionnel' ? 'selected' : ''}>Professionnel</option>
          </select>`}
          <select id="rcl-statut" aria-label="Statut">
            <option value="">Tous statuts</option>
            ${statuts.map(st => `<option value="${esc(st.key)}" ${state.statut === st.key ? 'selected' : ''}>${esc(st.label)}</option>`).join('')}
          </select>
          <span class="grow"></span>
          <span class="muted small">${affichees} ligne${s_(affichees)}</span>
          ${surProspects && scope.canRgd
            ? '<button class="btn" id="rcl-nouveau">+ Nouveau prospect</button>' : ''}
        </div>

        ${surDemandes ? tableauDemandes()
          : state.vue === 'prospects' && state.sousVue === 'meta' ? tableauMeta()
          : tableauFiches()}`;

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
      // Creer une fiche : elle nait dans le CRM, sans `d1_id`, donc le releve
      // Cloudflare ne la verra jamais. `draw` suffit a la faire apparaitre —
      // `db.insert` a deja pousse la ligne dans le cache local.
      const nouveau = root.querySelector('#rcl-nouveau');
      if (nouveau) nouveau.onclick = () => formulaireProspect(state.sousVue, apporteurs, draw);

      // Supprimer : le bouton n'existe que sur les fiches nees dans le CRM
      // (`boutonSuppression` ne rend rien autrement), et `supprimerProspect`
      // reverifie — un ecran est un garde-fou, pas une garantie.
      root.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () => {
        const table = surDemandes ? demandes : fiches;
        const ligne = table.find(x => x.id === b.dataset.suppr);
        if (ligne) supprimerProspect(state.sousVue, ligne, draw);
      });

      const t = root.querySelector('#rcl-type');
      if (t) t.onchange = () => { state.type = t.value; draw(); };
      const st = root.querySelector('#rcl-statut');
      if (st) st.onchange = () => { state.statut = st.value; draw(); };

      // L'écriture du statut. On ne redessine PAS tout de suite : redessiner
      // remplacerait le menu que la personne vient d'ouvrir, et lui ferait
      // perdre le fil. On repeint la seule pastille concernée, et on attend le
      // prochain rendu naturel pour le reste.
      root.querySelectorAll('.statut-menu').forEach(m => {
        m.onchange = async () => {
          const avant = m.dataset.avant;
          const apres = m.value;
          if (avant === apres) return;
          m.disabled = true;
          m.className = `statut-menu st-${apres} en-cours`;
          const table = m.dataset.cible === 'demande' ? 'rgd_demandes' : 'rgd_clients';
          const champ = m.dataset.cible === 'demande' ? 'statut' : 'statut_suivi';
          // ⚠ DEUX CHEMINS D'ÉCRITURE, ET LE BON DÉPEND DE L'ORIGINE DE LA FICHE.
          // Une fiche venue de Cloudflare s'écrit À LA SOURCE : l'écrire ici ne
          // servirait à rien, le relevé suivant rétablirait l'ancienne valeur.
          // Une fiche née dans le CRM, elle, n'existe pas chez le worker — lui
          // envoyer un `d1_id` vide donnerait une erreur, et Supabase est sa
          // seule adresse. `data-id` vide dit laquelle des deux on tient.
          const natif = !m.dataset.id;
          const r = natif
            ? await db.update(table, m.dataset.uuid, { [champ]: apres })
                .then(() => ({ ok: true }))
                .catch(e => ({ ok: false, motif: String(e.message || e).slice(0, 80) }))
            : m.dataset.cible === 'demande'
              ? await majStatutDemande(m.dataset.id, apres)
              : await majStatutClient(m.dataset.id, apres);
          m.disabled = false;
          if (r.ok) {
            m.dataset.avant = apres;
            m.className = `statut-menu st-${apres}`;
            // On avance le reflet local : le relevé confirmera dans la
            // demi-heure, mais l'écran ne doit pas revenir en arrière entre-temps.
            // Sur une fiche native il n'y a rien à avancer : `db.update` a déjà
            // remplacé la ligne dans le cache.
            if (!natif) {
              const ligne = scope.rgd(table).find(x => String(x.d1_id) === m.dataset.id);
              if (ligne) ligne[champ] = apres;
            }
            toast(natif ? 'Statut mis à jour'
              : 'Statut mis à jour dans le tableau de bord RGD');
          } else {
            m.value = avant;
            m.className = `statut-menu st-${avant}`;
            toast(r.motif === 'pas-de-compte'
              ? 'Aucun compte RGD à votre adresse : le statut n’a pas été changé.'
              : `Statut non enregistré — ${r.motif}`, 'err');
          }
        };
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
