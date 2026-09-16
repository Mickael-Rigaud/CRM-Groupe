// Espace BTP Expertise : le cabinet pilote son activité ici, sans quitter le CRM.
// Les écrans lisent les données communes (affaires, contacts, activités) filtrées sur
// l'activité « btp », et deux référentiels qui lui appartiennent : fiches DTU et mails types.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, CHANNELS, weightedAmount } from '../data/schema.js';
import {
  esc, eur, daysSince, fmtDate, userName, contactName, dealParty, toast,
  openModal, closeModal, confirm, renderForm, readForm, terms, hit,
  searchInput, bindSearch, restoreFocus, csvDownload,
} from '../ui.js';
import { openDeal, dealForm } from './deal.js';
import { contactForm, openContact } from './contacts.js';
import { orgForm, openOrg } from './organisations.js';
import { activityRowHtml, bindActivityRows, activityForm, nextActivity } from './activity.js';
import { coquilleEspace, poserEspace, kpiEspace } from './espace.js';

const KEY = 'btp';
const act = () => ACTIVITIES[KEY];
const isBtp = (row) => !!row && (row.activities || []).includes(KEY);
const deals = () => scope.deals().filter(d => d.activity === KEY);
const activities = () => {
  const ids = new Set(deals().map(d => d.id));
  return scope.activities().filter(a => (a.deal_id && ids.has(a.deal_id))
    || isBtp(db.byId('contacts', a.contact_id)) || isBtp(db.byId('organisations', a.organisation_id)));
};

// Les cinq écrans du cabinet, présentés comme le tableau de bord RGD Renova :
// un menu vertical à gauche, le contenu à droite. « BTP Expertise » reste une ligne
// du menu Pilotage du CRM ; cette coquille vit à l'intérieur de la page.
const ONGLETS = [
  { hash: '#/btp', label: "Vue d'ensemble" },
  { hash: '#/btp/todo', label: 'To-do list' },
  { hash: '#/btp/base', label: 'Base de données' },
  { hash: '#/btp/dtu', label: 'DTU' },
  { hash: '#/btp/facturation', label: 'Facturation' },
  { hash: '#/btp/mails', label: 'Mails types' },
];
// Enveloppe un écran dans la coquille commune aux espaces de structure.
const cadre = (actif, titre, corps) => coquilleEspace({
  actif, titre, corps,
  cle: KEY, marque: act().label, baseline: 'Expertise et conseil bâtiment', onglets: ONGLETS,
});
const poser = poserEspace;

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

// ---------------------------------------------------------------- Vue d'ensemble
// Trois blocs : les chiffres clés, la pipeline des missions, l'agenda Google du cabinet.
const kpi = kpiEspace;

// L'agenda du cabinet, tenu dans Google Agenda et affiché ici. L'identifiant du
// calendrier est rangé dans les réglages du CRM, pas dans le code : le dépôt est public.
// Vue semaine par défaut, le choix reste d'une visite à l'autre.
const CLE_AGENDA = 'btp_calendar_id';
const CLE_VUE = 'crm_btp_agenda_vue';
const VUES_AGENDA = [['WEEK', 'Semaine'], ['MONTH', 'Mois'], ['AGENDA', 'Planning']];
const TITRES_VUE = { WEEK: 'Agenda de la semaine', MONTH: 'Agenda du mois', AGENDA: 'Prochains rendez-vous' };

const vueChoisie = () => { try { return localStorage.getItem(CLE_VUE) || 'WEEK'; } catch { return 'WEEK'; } };
const retenirVue = (v) => { try { localStorage.setItem(CLE_VUE, v); } catch { /* navigation privée */ } };

// Google reprend nos couleurs pour le fond et les évènements : le cadre se fond
// dans la page et suit la structure ouverte.
function urlAgenda(id, mode) {
  const lire = (v, repli) => (getComputedStyle(document.documentElement).getPropertyValue(v).trim() || repli);
  return 'https://calendar.google.com/calendar/embed?' + new URLSearchParams({
    src: id, ctz: 'Europe/Paris', mode,
    wkst: '2',                       // la semaine commence le lundi
    showTitle: '0', showPrint: '0', showTabs: '0', showCalendars: '0', showTz: '0', showNav: '1',
    bgcolor: lire('--card', '#FFFFFF'),
    color: lire('--accent-ink', '#004B62'),
  });
}

function agenda() {
  const id = (db.setting(CLE_AGENDA) || '').trim();
  if (!id) {
    return `<div class="card">
      <div class="agenda-head"><span class="agenda-ico">📅</span><h2>Agenda</h2></div>
      <div class="btp-setup">
        <p><b>L&rsquo;agenda Google du cabinet n&rsquo;est pas encore raccordé.</b></p>
        <ol>
          <li>Ouvrez Google Agenda avec le compte du cabinet.</li>
          <li>Passez la souris sur le calendrier à afficher, <b>⋮</b> → <b>Paramètres et partage</b>.</li>
          <li>Dans <b>Partager avec des personnes en particulier</b>, ajoutez l&rsquo;adresse Google de chaque personne du cabinet qui doit le voir, en « Voir tous les détails ».</li>
          <li>Plus bas, dans <b>Intégrer le calendrier</b>, copiez l&rsquo;<b>identifiant du calendrier</b> (il ressemble à une adresse e-mail).</li>
          <li>Collez-le ci-dessous.</li>
        </ol>
        ${scope.isDirection ? `<div class="form">
          <div class="field"><label>Identifiant du calendrier</label><input id="cal-id" placeholder="identifiant@example.com"></div>
          <div class="form-actions"><button class="btn" id="cal-save">Enregistrer</button></div>
        </div>` : '<p class="muted small">La direction peut le renseigner depuis cet écran.</p>'}
        <p class="muted small">Chaque personne verra l&rsquo;agenda avec son propre compte Google, après avoir été ajoutée au partage. Rien n&rsquo;est rendu public, et aucun mot de passe n&rsquo;est demandé.</p>
      </div>
    </div>`;
  }

  const vue = vueChoisie();
  return `<div class="card agenda-card">
    <div class="agenda-head">
      <span class="agenda-ico">📅</span>
      <h2>${TITRES_VUE[vue] || 'Agenda'}</h2>
      <div class="seg agenda-vues">${VUES_AGENDA.map(([v, l]) => `<button type="button" data-vue="${v}" class="${v === vue ? 'active' : ''}">${l}</button>`).join('')}</div>
      <span class="grow"></span>
      ${scope.isDirection ? '<button type="button" class="btn ghost sm" id="cal-edit">Changer de calendrier</button>' : ''}
      <a class="btn ghost sm" href="https://calendar.google.com/calendar/r/week" target="_blank" rel="noopener">Ouvrir dans Google Agenda ↗</a>
    </div>
    <div class="agenda-cadre agenda-${vue.toLowerCase()}">
      <iframe src="${esc(urlAgenda(id, vue))}" title="Agenda BTP Expertise" loading="lazy"></iframe>
    </div>
    <p class="muted small">Cet agenda est celui de Google : ce qui est modifié là-bas apparaît ici, et inversement. Si le cadre reste vide, votre adresse n&rsquo;a pas encore été ajoutée au partage du calendrier, ou votre navigateur refuse la mémorisation des sites affichés dans un autre site.</p>
  </div>`;
}

export const btpHomePage = {
  title: () => 'BTP Expertise',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);

    const draw = () => {
      const a = act();
      const all = deals();
      const open = all.filter(d => d.status === 'open');
      const potential = open.reduce((s, d) => s + weightedAmount(d), 0);
      const noNext = open.filter(d => !nextActivity(d.id));
      const enCours = all.filter(d => a.stages.find(s => s.key === d.stage)?.delivery && d.status !== 'lost');
      const nouveaux = all.filter(d => ['lead', 'rdv1'].includes(d.stage) && d.status === 'open');
      const anneeEnCours = String(new Date().getFullYear());
      // CA signé : les missions engagées ou gagnées dans l'année, montant HT de l'affaire
      const gagnees = all.filter(d => d.status !== 'lost' && a.stages.find(x => x.key === d.stage)?.delivery
        && (d.won_at || d.stage_changed_at || d.created_at || '').slice(0, 4) === anneeEnCours);
      const caAnnee = gagnees.reduce((s, d) => s + (Number(d.amount) || 0), 0);

      // La pipeline, colonne par colonne, avec les affaires dedans
      const colonnes = a.stages.map(s => {
        const cartes = open.concat(all.filter(d => d.status === 'won' && a.stages.find(x => x.key === d.stage)?.delivery))
          .filter((d, i, t) => d.stage === s.key && t.indexOf(d) === i);
        return { s, cartes, somme: cartes.reduce((t, d) => t + (Number(d.amount) || 0), 0) };
      });

      root.innerHTML = cadre('#/btp', "Vue d'ensemble", `
        <div class="esp-kpis">
          ${kpi({ label: 'Nouvelles demandes', valeur: nouveaux.length, sous: 'nouveau et RDV 1', icone: '📨', ton: 'accent', href: '#/pipeline/btp' })}
          ${kpi({ label: 'CA HT', valeur: eur(caAnnee), sous: `${gagnees.length} mission${gagnees.length > 1 ? 's' : ''} signée${gagnees.length > 1 ? 's' : ''} en ${anneeEnCours}`, icone: '💶', ton: 'green', href: '#/btp/facturation' })}
          ${kpi({ label: 'Missions en cours', valeur: enCours.length, sous: 'du RDV sur place au rapport', icone: '🏗', ton: 'amber', href: '#/pipeline/btp' })}
        </div>

        <div class="card">
          <div class="card-head"><h2>Pipeline missions</h2>
            <span class="muted small">${eur(potential)} de CA potentiel pondéré</span>
            <span class="grow"></span>
            <a class="btn ghost sm" href="#/pipeline/btp">Voir la page complète →</a>
          </div>
          <div class="esp-kanban">${colonnes.map(({ s, cartes, somme }) => `
            <div class="esp-col">
              <div class="esp-col-head"><b>${esc(s.label)}</b><span>${cartes.length}</span></div>
              <div class="esp-col-sum">${somme ? eur(somme) : '—'}</div>
              <div class="esp-col-body">${cartes.map(d => `
                <button type="button" class="esp-card-deal" data-deal="${d.id}">
                  <b>${esc(d.title)}</b>
                  <span class="muted">${esc(dealParty(d))}</span>
                  ${d.amount ? `<span class="esp-card-amount">${eur(d.amount)}</span>` : ''}
                </button>`).join('') || '<div class="esp-col-vide">—</div>'}</div>
            </div>`).join('')}</div>
        </div>

        ${agenda()}`);

      root.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, draw));
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { retenirVue(b.dataset.vue); draw(); });
      root.querySelector('#cal-save')?.addEventListener('click', async () => {
        const v = root.querySelector('#cal-id').value.trim();
        if (!v) return toast('Collez l\'identifiant du calendrier', 'warn');
        try {
          if (db.setting(CLE_AGENDA) !== undefined) await db.update('settings', CLE_AGENDA, { value: v });
          else await db.insert('settings', { key: CLE_AGENDA, value: v });
          toast('Agenda raccordé'); draw();
        } catch (err) { toast(err.message, 'err'); }
      });
      root.querySelector('#cal-edit')?.addEventListener('click', async () => {
        try { await db.update('settings', CLE_AGENDA, { value: '' }); toast('Calendrier détaché'); draw(); }
        catch (err) { toast(err.message, 'err'); }
      });
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- To-do list
export const btpTodoPage = {
  title: () => 'BTP Expertise — To-do',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { who: '', q: '', focus: null };

    const draw = () => {
      const users = scope.users();
      const liste = activities()
        .filter(x => !state.who || x.assignee_id === state.who)
        .filter(x => hit([x.title, x.notes, userName(x.assignee_id)], terms(state.q)));
      const ouvertes = liste.filter(x => !x.done);
      const retard = ouvertes.filter(x => daysSince(x.due_date) > 0).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const jour = ouvertes.filter(x => daysSince(x.due_date) === 0);
      const semaine = ouvertes.filter(x => daysSince(x.due_date) < 0 && daysSince(x.due_date) >= -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const plusTard = ouvertes.filter(x => daysSince(x.due_date) < -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const sansDate = ouvertes.filter(x => !x.due_date);
      const faitesCeJour = liste.filter(x => x.done && x.done_at && daysSince(x.done_at) === 0);
      const bloc = (titre, l) => l.length ? `<div class="card today-group"><h3>${titre} <span>${l.length}</span></h3>${l.map(x => activityRowHtml(x, { showContext: true })).join('')}</div>` : '';

      root.innerHTML = cadre('#/btp/todo', "To-do list", `
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher une tâche…')}
          <select id="b-who"><option value="">Toute l&rsquo;équipe</option>${users.map(u => `<option value="${u.id}" ${state.who === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>
          <span class="muted small">${retard.length} en retard · ${jour.length} aujourd&rsquo;hui</span>
          <span class="grow"></span>
          <button class="btn" id="b-new">+ Tâche</button>
        </div>
        ${bloc('⚠ En retard', retard)}
        ${bloc('Aujourd&rsquo;hui', jour)}
        ${bloc('Cette semaine', semaine)}
        ${bloc('Plus tard', plusTard)}
        ${bloc('Sans échéance', sansDate)}
        ${bloc('Fait aujourd&rsquo;hui', faitesCeJour)}
        ${!ouvertes.length ? '<div class="card"><div class="empty">Rien à faire — tout est à jour.</div></div>' : ''}`);

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelector('#b-who').onchange = e => { state.who = e.target.value; draw(); };
      root.querySelector('#b-new').onclick = () => activityForm({}, null, draw);
      bindActivityRows(root, draw);
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Base de données
// D'où viennent les prospects. Chaque origine regroupe les canaux du CRM qui lui
// correspondent — la prise de rendez-vous du site écrit « Site internet direct ».
// À ajuster ici si le cabinet range ses canaux autrement.
const ORIGINES = [
  { key: 'site', label: 'Prospect site', canaux: ['Site internet direct', 'Google organique / SEO', 'Google Ads'] },
  { key: 'partenaires', label: 'Prospect partenaire', canaux: ['Partenaire / apporteur', 'Recommandation client', 'Réseau professionnel'] },
  { key: 'meta', label: 'Prospect Meta Ads', canaux: ['Meta Ads', 'Instagram organique', 'Facebook organique'] },
  // Le reste : prospection directe, téléphone, ancien client… et les fiches dont le canal
  // n'est pas renseigné. La somme des quatre fait donc bien le total des prospects.
  { key: 'autre', label: 'Autre prospect', canaux: null },
];
const classees = ORIGINES.flatMap(o => o.canaux || []);
const estDeLOrigine = (c, o) => (o.canaux ? o.canaux.includes(c.channel) : !classees.includes(c.channel));

const VUES = [
  { key: 'clients', label: 'Clients' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'partenaires', label: 'Partenaires' },
  { key: 'courtiers', label: 'Courtiers' },
  { key: 'tous', label: 'Tous les contacts' },
];

export const btpBasePage = {
  title: () => 'BTP Expertise — Base de données',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { vue: 'clients', q: '', canal: '', origine: '', focus: null };

    // Créer depuis cet écran, c'est créer pour BTP Expertise : l'activité est cochée
    // d'avance, et le type suit la vue ouverte. Sans cela la fiche n'apparaîtrait pas ici.
    const nouveau = () => {
      const surOrg = ['partenaires', 'courtiers'].includes(state.vue);
      if (surOrg) orgForm(null, draw, null, 'Partenaire'); else contactForm(null, draw);
      const f = document.querySelector(surOrg ? '#o-form' : '#c-form');
      if (!f) return;
      const coche = f.querySelector(`input[name="activities"][value="${KEY}"]`);
      if (coche) coche.checked = true;
      // On est dans l'espace du cabinet : l'activité est décidée, inutile de la demander.
      coche?.closest('.field')?.setAttribute('hidden', '');
      if (surOrg && state.vue === 'courtiers') { const j = f.querySelector('[name="partner_job"]'); if (j) j.value = 'Courtier'; }
      if (!surOrg && state.vue !== 'tous') { const t = f.querySelector('[name="type"]'); if (t) t.value = state.vue === 'clients' ? 'Client' : 'Prospect'; }
    };

    const draw = () => {
      const ts = terms(state.q);
      const contacts = scope.contacts().filter(isBtp);
      const orgs = scope.orgs().filter(isBtp);
      const surOrg = ['partenaires', 'courtiers'].includes(state.vue);

      let lignes = [];
      let colonnes = [];
      if (surOrg) {
        const filtre = state.vue === 'courtiers' ? (o) => o.partner_job === 'Courtier' : (o) => o.type === 'Partenaire';
        lignes = orgs.filter(filtre)
          .filter(o => hit([o.name, o.partner_job, o.city, o.email, o.phone], ts))
          .map(o => ({
            id: o.id, org: true, nom: o.name, detail: o.partner_job || o.type, ville: o.city,
            tel: o.phone, mail: o.email, apports: deals().filter(d => d.referrer_org_id === o.id).length,
          }));
        colonnes = ['Nom', 'Métier', 'Ville', 'Téléphone', 'Email', 'Affaires apportées'];
      } else {
        const filtre = { clients: (c) => c.type === 'Client', prospects: (c) => c.type === 'Prospect', tous: () => true }[state.vue];
        const origine = ORIGINES.find(o => o.key === state.origine);
        lignes = contacts.filter(filtre)
          .filter(c => !state.canal || c.channel === state.canal)
          .filter(c => !origine || estDeLOrigine(c, origine))
          .filter(c => hit([contactName(c), c.email, c.phone, c.city, c.channel], ts))
          .map(c => {
            const d = deals().find(x => x.contact_id === c.id);
            return {
              id: c.id, nom: contactName(c), detail: c.type, ville: c.city, tel: c.phone, mail: c.email,
              canal: c.channel || '—', affaire: d ? d.title : null, dealId: d ? d.id : null,
            };
          });
        colonnes = ['Nom', 'Type', 'Ville', 'Téléphone', 'Email', 'Canal', 'Affaire'];
      }

      const compte = (v) => {
        if (v === 'partenaires') return orgs.filter(o => o.type === 'Partenaire').length;
        if (v === 'courtiers') return orgs.filter(o => o.partner_job === 'Courtier').length;
        if (v === 'tous') return contacts.length;
        return contacts.filter(c => c.type === (v === 'clients' ? 'Client' : 'Prospect')).length;
      };

      root.innerHTML = cadre('#/btp/base', "Base de données", `
        <div class="toolbar">
          <div class="seg">${VUES.map(v => `<button data-vue="${v.key}" class="${state.vue === v.key ? 'active' : ''}">${v.label} <span class="cnt">${compte(v.key)}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <button class="btn ghost sm" id="b-export">Export CSV</button>
          <button class="btn" id="b-new">+ ${surOrg ? (state.vue === 'courtiers' ? 'Courtier' : 'Partenaire') : 'Contact'}</button>
        </div>
        ${state.vue === 'prospects' ? `<div class="pill-tabs">
          ${ORIGINES.map(o => `<button type="button" data-origine="${o.key}" class="${state.origine === o.key ? 'on' : ''}"
            aria-pressed="${state.origine === o.key}">${o.label}<span>${contacts.filter(c => c.type === 'Prospect' && estDeLOrigine(c, o)).length}</span></button>`).join('')}
        </div>` : ''}
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un nom, une ville, un email…')}
          ${surOrg || state.vue === 'prospects' ? '' : `<select id="b-canal"><option value="">Tous les canaux</option>${CHANNELS.map(c => `<option ${state.canal === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`}
          <span class="muted small">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}</span>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr>${colonnes.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead>
            <tbody>${lignes.map(r => `<tr class="click" data-fiche="${r.id}">
              <td><b>${esc(r.nom)}</b></td>
              <td>${esc(r.detail || '—')}</td>
              <td>${esc(r.ville || '—')}</td>
              <td>${r.tel ? `<a href="tel:${esc(r.tel)}">${esc(r.tel)}</a>` : '—'}</td>
              <td>${r.mail ? `<a href="mailto:${esc(r.mail)}">${esc(r.mail)}</a>` : '—'}</td>
              ${r.org ? `<td class="num">${r.apports}</td>` : `<td>${esc(r.canal)}</td><td>${r.affaire ? esc(r.affaire) : '—'}</td>`}
              <td class="num"><button type="button" class="btn ghost sm" data-modif="${r.id}" title="Modifier ou supprimer">✎</button></td>
            </tr>`).join('') || `<tr><td colspan="${colonnes.length + 1}"><div class="empty">Aucune fiche dans cette vue.</div></td></tr>`}</tbody>
          </table></div>
        </div>`);

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; state.origine = ''; draw(); });
      // Recliquer sur l'onglet ouvert le relâche : on retrouve tous les prospects.
      root.querySelectorAll('[data-origine]').forEach(b => b.onclick = () => { state.origine = state.origine === b.dataset.origine ? '' : b.dataset.origine; draw(); });
      root.querySelector('#b-canal')?.addEventListener('change', e => { state.canal = e.target.value; draw(); });
      // La ligne ouvre la fiche complète ; le crayon va droit au formulaire, d'où l'on
      // peut aussi supprimer (le CRM refuse la suppression d'un contact qui porte des affaires).
      root.querySelectorAll('[data-fiche]').forEach(tr => tr.onclick = (e) => {
        if (e.target.closest('[data-modif]')) return;
        surOrg ? openOrg(tr.dataset.fiche, draw) : openContact(tr.dataset.fiche, draw);
      });
      root.querySelectorAll('[data-modif]').forEach(b => b.onclick = () => (surOrg
        ? orgForm(db.byId('organisations', b.dataset.modif), draw)
        : contactForm(db.byId('contacts', b.dataset.modif), draw)));
      root.querySelector('#b-new').onclick = () => nouveau();
      root.querySelector('#b-export').onclick = () => csvDownload(`btp-${state.vue}.csv`, lignes.map(({ id, org, dealId, ...reste }) => reste));
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Fiches DTU
// Présentation reprise du centre de ressources du tableau de bord RGD Renova :
// les fiches sont rangées en chapitres par domaine, et une fiche s'ouvre en pleine
// page — hero, points clés à maîtriser, erreurs fréquentes à éviter.
// Les teintes ci-dessous appartiennent au contenu (le domaine du bâtiment), pas à
// l'interface : l'accent du CRM reste celui de la structure ouverte.
const DOMAINES = {
  'Maçonnerie': { icon: '🧱', tint: '#a26a3c', tagline: 'Murs porteurs, chaînages, dallages et enduits — le squelette du bâtiment' },
  'Bois': { icon: '🪵', tint: '#8e6c3c', tagline: 'Ossature, charpente, panneaux — la structure qui travaille avec l’humidité' },
  'Charpente': { icon: '🪵', tint: '#8e6c3c', tagline: 'Structures bois, ossatures et façades — la colonne vertébrale' },
  'Couverture': { icon: '🏠', tint: '#d9472b', tagline: 'Tuiles, ardoises, zinc — la première ligne de défense contre les intempéries' },
  'Étanchéité': { icon: '💧', tint: '#3b9eae', tagline: 'Toitures-terrasses, planchers extérieurs — zéro tolérance à l\'infiltration' },
  'Façades': { icon: '🏛️', tint: '#a89478', tagline: 'Enduits, revêtements, chapes — la peau visible du bâti' },
  'Fondations': { icon: '⛰️', tint: '#7a6a55', tagline: 'Semelles, dallages, cuvelage — ce sur quoi tout repose' },
  'Plâtrerie': { icon: '🧰', tint: '#9a9a9a', tagline: 'Cloisons sèches, doublages, plafonds — le plus utilisé en rénovation' },
  'Isolation': { icon: '🧥', tint: '#d9a527', tagline: 'ITI, combles, planchers — au cœur de la rénovation énergétique' },
  'Plomberie': { icon: '🚿', tint: '#3b9eae', tagline: 'Alimentation, évacuation, ANC — hygiène et confort quotidien' },
  'Chauffage': { icon: '🔥', tint: '#FD7A2C', tagline: 'Chaudières, planchers chauffants — la performance thermique' },
  'Ventilation': { icon: '🌀', tint: '#5b8def', tagline: 'VMC simple et double flux — évacuation de l\'humidité intérieure' },
  'Sols': { icon: '🟫', tint: '#8e6c3c', tagline: 'Parquets, PVC, résines — le sol qui vit tous les jours' },
  'Carrelage': { icon: '◼️', tint: '#4a4a4a', tagline: 'Sols scellés et collés — un des DTU les plus expertisés' },
  'Parquet': { icon: '🪵', tint: '#8e6c3c', tagline: 'Cloué, collé, flottant — trois familles, trois DTU distincts' },
  'Peinture': { icon: '🎨', tint: '#FD7A2C', tagline: 'Peintures, papiers peints, revêtements muraux — la finition visible' },
  'Finitions': { icon: '🎨', tint: '#FD7A2C', tagline: 'Peintures et revêtements muraux — la finition visible' },
  'Menuiseries': { icon: '🪟', tint: '#5b8def', tagline: 'Fenêtres et portes — étanchéité à l\'air et à l\'eau critique' },
  'Électricité': { icon: '⚡', tint: '#d9a527', tagline: 'NF C 15-100 — la sécurité des personnes' },
  'Fumisterie': { icon: '🔥', tint: '#b0553a', tagline: 'Conduits de fumée et raccordements — risque incendie et monoxyde' },
};
const domaineMeta = (d) => DOMAINES[d] || { icon: '📐', tint: '#7a8794', tagline: 'Normes techniques du domaine' };

const DTU_FORM = [
  { key: 'code', label: 'Numéro', required: true, half: true, placeholder: 'NF DTU 20.1' },
  { key: 'domain', label: 'Domaine', half: true, placeholder: 'Maçonnerie' },
  { key: 'title', label: 'Intitulé', required: true },
  { key: 'summary', label: 'Ce que couvre la norme', type: 'textarea', rows: 3 },
  { key: 'key_points', label: 'Points clés à maîtriser', type: 'textarea', rows: 8, hint: 'Une ligne par point, sous la forme « Titre :: explication ».' },
  { key: 'common_errors', label: 'Erreurs fréquentes à éviter', type: 'textarea', rows: 6, hint: 'Même forme : « Titre :: ce qu\'on observe ».' },
  { key: 'checkpoints', label: 'Points de contrôle du cabinet', type: 'textarea', rows: 6, hint: 'Votre pratique de terrain, une ligne par point.' },
  { key: 'link', label: 'Lien vers la norme', half: true, placeholder: 'https://…' },
  { key: 'essential', label: 'Marquer « Top 10 »', type: 'checkbox', half: true },
  { key: 'notes', label: 'Notes internes', type: 'textarea', rows: 3 },
];

// Les listes {titre, detail} s'éditent en texte : une ligne, deux points doubles.
const listeVersTexte = (l) => (Array.isArray(l) ? l : []).map(p => `${p.titre} :: ${p.detail}`).join('\n');
const texteVersListe = (t) => String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.indexOf('::');
  return i === -1 ? { titre: l, detail: '' } : { titre: l.slice(0, i).trim(), detail: l.slice(i + 2).trim() };
});
const asListe = (v) => Array.isArray(v) ? v : [];
const enClair = (t) => esc(t).replace(/\n/g, '<br>');

export const btpDtuPage = {
  title: () => 'BTP Expertise — DTU',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { q: '', domaine: '', essentiels: false, fiche: null, focus: null };

    const editer = (f, apres) => {
      const valeurs = f ? { ...f, key_points: listeVersTexte(f.key_points), common_errors: listeVersTexte(f.common_errors) } : {};
      const m = openModal(f ? `Fiche ${f.code}` : 'Nouvelle fiche', `<form class="form" id="dtu-form">${renderForm(DTU_FORM, valeurs)}
        <div class="form-actions">${f ? '<button type="button" class="btn ghost" id="dtu-del">Supprimer</button>' : ''}
        <button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true });
      m.querySelector('#dtu-form').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(e.target, DTU_FORM);
        v.key_points = texteVersListe(v.key_points);
        v.common_errors = texteVersListe(v.common_errors);
        try {
          if (f) await db.update('dtu_sheets', f.id, v); else await db.insert('dtu_sheets', { ...v, position: 999 });
          closeModal(true); toast('Fiche enregistrée'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
      m.querySelector('#dtu-del')?.addEventListener('click', async () => {
        if (!await confirm(`Supprimer la fiche ${f.code} ?`)) return;
        await db.remove('dtu_sheets', f.id); closeModal(true); toast('Fiche supprimée'); state.fiche = null; apres();
      });
    };

    // ---- Une fiche, en pleine page
    const section = (titre, kicker, icone, items, type, tint) => asListe(items).length ? `
      <section class="fiche-section ${type}">
        <div class="fiche-section-head">
          <span class="fiche-section-icon" style="background:${tint}1e;color:${tint}">${icone}</span>
          <div><div class="fiche-section-kicker">${kicker}</div><h2>${esc(titre)}</h2></div>
        </div>
        <div class="fiche-points">${asListe(items).map((p, i) => `
          <div class="fiche-point">
            <span class="fiche-point-num" style="background:${tint}1e;color:${tint}">${i + 1}</span>
            <div><div class="fiche-point-title">${esc(p.titre)}</div>${p.detail ? `<div class="fiche-point-detail">${enClair(p.detail)}</div>` : ''}</div>
          </div>`).join('')}</div>
      </section>` : '';

    const ficheHtml = (f) => {
      const meta = domaineMeta(f.domain);
      const perso = (f.checkpoints || '').split('\n').filter(Boolean);
      return `
        <div class="fiche-topbar">
          <button type="button" class="btn ghost sm" id="f-back">← Toutes les fiches</button>
          <span class="grow"></span>
          ${f.link ? `<a class="btn ghost sm" href="${esc(f.link)}" target="_blank" rel="noopener">Voir la norme ↗</a>` : ''}
          <button type="button" class="btn ghost sm" id="f-pdf">⬇ PDF</button>
          <button type="button" class="btn sm" id="f-edit">Modifier</button>
        </div>
        <article class="fiche-detail">
          <header class="fiche-hero" style="background:linear-gradient(135deg,${meta.tint}18 0%,${meta.tint}08 100%)">
            <div class="fiche-hero-icon" style="background:${meta.tint}25;color:${meta.tint}">${meta.icon}</div>
            <div>
              <div class="fiche-hero-meta">
                <span class="fiche-hero-eyebrow" style="color:${meta.tint}">Normes DTU</span>
                ${f.domain ? `<span class="fiche-hero-sep">·</span><span>${esc(f.domain)}</span>` : ''}
                ${f.essential ? '<span class="fiche-hero-badge">★ Top 10</span>' : ''}
              </div>
              <h1 class="fiche-hero-title"><span style="color:${meta.tint}">${esc(f.code)}</span> — ${esc(f.title)}</h1>
              ${f.summary ? `<p class="fiche-hero-resume">${enClair(f.summary)}</p>` : ''}
            </div>
          </header>
          <div class="fiche-content">
            ${section('Points clés à maîtriser', 'À MAÎTRISER', '✓', f.key_points, 'ok', meta.tint)}
            ${section('Erreurs fréquentes à éviter', 'À ÉVITER', '⚠', f.common_errors, 'err', 'var(--red)')}
            ${section('Points de contrôle du cabinet', 'SUR PLACE', '☑', perso.map(l => ({ titre: l, detail: '' })), 'perso', 'var(--accent)')}
            ${!perso.length ? '<div class="card"><div class="empty">Aucun point de contrôle du cabinet. « Modifier » pour y mettre votre pratique de terrain.</div></div>' : ''}
            ${f.notes ? `<section class="fiche-section"><div class="fiche-section-head"><div><div class="fiche-section-kicker">INTERNE</div><h2>Notes</h2></div></div><p>${enClair(f.notes)}</p></section>` : ''}
          </div>
        </article>`;
    };

    // ---- La liste, en chapitres par domaine
    const carte = (f) => {
      const meta = domaineMeta(f.domain);
      const pts = asListe(f.key_points).length, errs = asListe(f.common_errors).length;
      const perso = (f.checkpoints || '').split('\n').filter(Boolean).length;
      return `<button type="button" class="fiche-card" data-f="${f.id}" style="--tint:${meta.tint}">
        <span class="fiche-card-accent"></span>
        <div class="fiche-card-head">
          <span class="fiche-card-code">${esc(f.code)}</span>
          ${f.essential ? '<span class="fiche-card-badge">★ Top 10</span>' : ''}
        </div>
        <div class="fiche-card-title">${esc(f.title)}</div>
        ${f.summary ? `<div class="fiche-card-resume">${esc(f.summary)}</div>` : ''}
        <div class="fiche-card-foot">
          <span class="muted small">${pts ? `${pts} point${pts > 1 ? 's' : ''} clé${pts > 1 ? 's' : ''}` : 'à documenter'}${errs ? ` · ${errs} erreur${errs > 1 ? 's' : ''}` : ''}${perso ? ` · ${perso} contrôle${perso > 1 ? 's' : ''}` : ''}</span>
          <span class="fiche-card-arrow">Lire la fiche →</span>
        </div>
      </button>`;
    };

    // Export : mise en page reprise de l'export PDF du tableau de bord RGD Renova.
    // Chaque fiche est un tableau : le thead et le tfoot se répètent sur chaque page
    // (seule méthode fiable en impression), d'où le bandeau de pied sur toutes les
    // pages. @page sans marge supprime les mentions automatiques du navigateur.
    const exporter = (fiches) => {
      const SAUT = String.fromCharCode(10);
      const jour = new Date().toLocaleDateString('fr-FR');
      const noms = [...new Set(fiches.map(f => f.domain || 'Sans domaine'))];
      const groupes = noms.map(d => [d, domaineMeta(d), fiches.filter(f => (f.domain || 'Sans domaine') === d)]);

      const section = (kicker, titre, icone, cls, items) => asListe(items).length ? `
        <section class="pdf-section">
          <div class="pdf-section-header">
            <div class="pdf-section-icon ${cls}-icon">${icone}</div>
            <div>
              <div class="pdf-section-kicker ${cls}-kicker">${kicker}</div>
              <h2 class="pdf-section-title">${esc(titre)}</h2>
            </div>
          </div>
          <div class="pdf-points">${asListe(items).map((p, i) => `
            <div class="pdf-point">
              <span class="pdf-point-num ${cls}-num">${String(i + 1).padStart(2, '0')}</span>
              <div class="pdf-point-body">
                <div class="pdf-point-title">${esc(p.titre)}</div>
                ${p.detail ? `<div class="pdf-point-detail">${enClair(p.detail)}</div>` : ''}
              </div>
            </div>`).join('')}</div>
        </section>` : '';

      const page = (f, meta) => {
        const perso = (f.checkpoints || '').split(SAUT).filter(Boolean);
        return `<table class="pdf-doc" style="--t:${meta.tint}">
          <thead><tr><td><div class="pdf-header-spacer"></div></td></tr></thead>
          <tfoot><tr><td>
            <div class="pdf-footer">
              <span class="pdf-footer-logo-wrap"><img class="pdf-footer-logo" src="assets/logos/btp.png" alt="BTP Expertise" onerror="this.remove()"></span>
              <span class="pdf-footer-text"><strong>Document interne</strong><br>${esc(f.code)} · édité le ${jour}</span>
            </div>
          </td></tr></tfoot>
          <tbody><tr><td>
            <div class="pdf-hero">
              <div class="pdf-hero-icon">${meta.icon}</div>
              <div class="pdf-hero-body">
                <div class="pdf-hero-kicker">NORMES DTU${f.domain ? ` · ${esc(f.domain.toUpperCase())}` : ''}${f.essential ? ' · ★ TOP 10' : ''}</div>
                <h1 class="pdf-hero-title"><span class="pdf-hero-code">${esc(f.code)}</span> — ${esc(f.title)}</h1>
                ${f.summary ? `<p class="pdf-hero-resume">${enClair(f.summary)}</p>` : ''}
              </div>
            </div>
            <div class="pdf-content-inner">
              ${section('À MAÎTRISER', 'Points clés à maîtriser', '✓', 'pdf-check', f.key_points)}
              ${section('À ÉVITER', 'Erreurs fréquentes à éviter', '⚠', 'pdf-warn', f.common_errors)}
              ${section('SUR PLACE', 'Points de contrôle du cabinet', '☑', 'pdf-site', perso.map(l => ({ titre: l, detail: '' })))}
              ${f.link ? `<p class="pdf-lien">Texte officiel : ${esc(f.link)}</p>` : ''}
            </div>
          </td></tr></tbody>
        </table>`;
      };

      const zone = document.getElementById('print-root') || Object.assign(document.createElement('div'), { id: 'print-root' });
      zone.innerHTML = `
        <table class="pdf-doc pdf-garde">
          <thead><tr><td><div class="pdf-header-spacer"></div></td></tr></thead>
          <tbody><tr><td>
            <div class="pdf-content-inner">
              <div class="pr-bandes">${groupes.map(([, m]) => `<i style="background:${m.tint}"></i>`).join('')}</div>
              <div class="pr-marque">BTP Expertise</div>
              <h1 class="pr-titre">Référentiel DTU</h1>
              <p class="pr-sous">${fiches.length} fiche${fiches.length > 1 ? 's' : ''} · ${groupes.length} domaine${groupes.length > 1 ? 's' : ''} · édition du ${jour}</p>
              <ol class="pr-somm">${groupes.map(([d, m, l], i) => `
                <li style="--t:${m.tint}">
                  <span class="pr-somm-num">${String(i + 1).padStart(2, '0')}</span>
                  <span class="pr-somm-ico">${m.icon}</span>
                  <span class="pr-somm-corps"><b>${esc(d)}</b><span>${l.map(f => esc(f.code)).join(' · ')}</span></span>
                  <span class="pr-somm-cnt">${l.length}</span>
                </li>`).join('')}</ol>
              <p class="pr-pied">Document de travail interne. Les valeurs sont données en ordre de grandeur et renvoient au texte officiel de la norme.</p>
            </div>
          </td></tr></tbody>
        </table>
        ${groupes.map(([, meta, l]) => l.map(f => page(f, meta)).join('')).join('')}`;

      if (!zone.parentNode) document.body.appendChild(zone);
      document.body.classList.add('impression');
      const fini = () => { document.body.classList.remove('impression'); window.removeEventListener('afterprint', fini); };
      window.addEventListener('afterprint', fini);
      setTimeout(() => window.print(), 60);
    };

    const draw = () => {
      const toutes = db.t('dtu_sheets').slice()
        .sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.code).localeCompare(String(b.code)));

      if (state.fiche) {
        const f = db.byId('dtu_sheets', state.fiche);
        if (!f) { state.fiche = null; return draw(); }
        root.innerHTML = cadre('#/btp/dtu', 'DTU', ficheHtml(f));
        root.querySelector('#f-back').onclick = () => { state.fiche = null; draw(); };
        root.querySelector('#f-edit').onclick = () => editer(f, draw);
        root.querySelector('#f-pdf').onclick = () => exporter([f]);
        return;
      }

      const ts = terms(state.q);
      const domaines = [...new Set(toutes.map(f => f.domain).filter(Boolean))];
      const liste = toutes
        .filter(f => !state.domaine || f.domain === state.domaine)
        .filter(f => !state.essentiels || f.essential)
        .filter(f => hit([f.code, f.title, f.domain, f.summary, f.checkpoints, f.notes,
          listeVersTexte(f.key_points), listeVersTexte(f.common_errors)], ts));
      const parDomaine = domaines
        .map(d => [d, liste.filter(f => f.domain === d)])
        .concat([['Sans domaine', liste.filter(f => !f.domain)]])
        .filter(([, l]) => l.length);

      root.innerHTML = cadre('#/btp/dtu', 'DTU', `
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un numéro, un mot du titre, un point de contrôle…')}
          <select id="b-dom"><option value="">Tous les domaines</option>${domaines.slice().sort().map(d => `<option ${state.domaine === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
          <button type="button" class="btn ghost sm ${state.essentiels ? 'on' : ''}" id="b-ess" aria-pressed="${state.essentiels}">★ Top 10</button>
          <span class="muted small">${liste.length} fiche${liste.length > 1 ? 's' : ''}</span>
          <span class="grow"></span>
          <button class="btn ghost sm" id="b-pdf">⬇ Exporter en PDF</button>
          <button class="btn" id="b-new">+ Fiche</button>
        </div>
        ${parDomaine.map(([d, l], i) => {
          const meta = domaineMeta(d);
          return `<section class="domaine-section">
            <div class="domaine-chapter" style="background:linear-gradient(135deg,${meta.tint}12 0%,${meta.tint}03 100%)">
              <div class="domaine-chapter-num" style="color:${meta.tint}">${String(i + 1).padStart(2, '0')}</div>
              <div class="domaine-chapter-icon" style="background:${meta.tint}22;color:${meta.tint}">${meta.icon}</div>
              <div class="domaine-chapter-body">
                <div class="domaine-chapter-kicker" style="color:${meta.tint}">CHAPITRE ${String(i + 1).padStart(2, '0')}</div>
                <h2>${esc(d)}</h2>
                <p>${esc(meta.tagline)}</p>
              </div>
              <div class="domaine-chapter-count" style="background:${meta.tint}">${l.length}</div>
            </div>
            <div class="fiches-grid">${l.map(carte).join('')}</div>
          </section>`;
        }).join('') || '<div class="card"><div class="empty">Aucune fiche. Lancez <code>supabase/lot7-btp-dtu.sql</code> pour charger le référentiel, ou créez la première.</div></div>'}`);

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelector('#b-dom').onchange = e => { state.domaine = e.target.value; draw(); };
      root.querySelector('#b-ess').onclick = () => { state.essentiels = !state.essentiels; draw(); };
      root.querySelector('#b-new').onclick = () => editer(null, draw);
      root.querySelector('#b-pdf').onclick = () => exporter(liste);
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { state.fiche = b.dataset.f; draw(); });
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Mails types
const MAIL_FORM = [
  { key: 'theme', label: 'Thématique', required: true, half: true, placeholder: 'Prise de contact' },
  { key: 'title', label: 'Nom du modèle', required: true, half: true, placeholder: 'Relance après devis' },
  { key: 'subject', label: 'Objet du mail' },
  { key: 'body', label: 'Corps du mail', type: 'textarea', rows: 14, required: true },
];

export const btpMailsPage = {
  title: () => 'BTP Expertise — Mails types',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { theme: '', q: '', focus: null };

    const editer = (m0, apres) => {
      const m = openModal(m0 ? m0.title : 'Nouveau modèle',
        `<form class="form" id="mail-form">${renderForm(MAIL_FORM, m0 || {})}
          <div class="form-actions">${m0 ? '<button type="button" class="btn ghost" id="mail-del">Supprimer</button>' : ''}
          <button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`,
        { wide: true });
      m.querySelector('#mail-form').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(e.target, MAIL_FORM);
        try {
          if (m0) await db.update('mail_templates', m0.id, v);
          else await db.insert('mail_templates', { ...v, activity: KEY, position: 999 });
          closeModal(true); toast('Modèle enregistré'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
      m.querySelector('#mail-del')?.addEventListener('click', async () => {
        if (!await confirm(`Supprimer le modèle « ${m0.title} » ?`)) return;
        await db.remove('mail_templates', m0.id); closeModal(true); toast('Modèle supprimé'); apres();
      });
    };

    const copier = async (texte) => {
      try { await navigator.clipboard.writeText(texte); toast('Modèle copié'); }
      catch { toast('Copie refusée par le navigateur', 'warn'); }
    };

    const draw = () => {
      const ts = terms(state.q);
      const tous = db.t('mail_templates').filter(m => m.activity === KEY);
      const themes = [...new Set(tous.map(m => m.theme).filter(Boolean))].sort();
      const liste = tous.filter(m => !state.theme || m.theme === state.theme)
        .filter(m => hit([m.title, m.theme, m.subject, m.body], ts));

      const groupes = themes.filter(t => !state.theme || t === state.theme)
        .map(t => [t, liste.filter(m => m.theme === t).sort((a, b) => (a.position || 0) - (b.position || 0))])
        .filter(([, g]) => g.length);

      root.innerHTML = cadre('#/btp/mails', "Mails types", `
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un modèle…')}
          <select id="b-theme"><option value="">Toutes les thématiques</option>${themes.map(t => `<option ${state.theme === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <span class="muted small">${liste.length} modèle${liste.length > 1 ? 's' : ''}</span>
          <span class="grow"></span>
          <button class="btn" id="b-new">+ Modèle</button>
        </div>
        ${groupes.length ? groupes.map(([t, g]) => `
          <div class="card">
            <div class="card-head"><h2>${esc(t)}</h2><span class="muted small">${g.length}</span></div>
            ${g.map(m => `<div class="btp-mail">
              <div class="btp-mail-head">
                <span class="grow"><b>${esc(m.title)}</b>${m.subject ? `<br><small class="muted">Objet : ${esc(m.subject)}</small>` : ''}</span>
                <button type="button" class="btn ghost sm" data-copy="${m.id}">Copier</button>
                <button type="button" class="btn ghost sm" data-edit="${m.id}">Modifier</button>
              </div>
              <pre class="btp-mail-body">${esc(m.body)}</pre>
            </div>`).join('')}
          </div>`).join('')
        : '<div class="card"><div class="empty">Aucun modèle pour l&rsquo;instant. Créez le premier avec « + Modèle » : la thématique que vous lui donnez (Prise de contact, Devis, Rapport…) sert de rangement.</div></div>'}`);

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelector('#b-theme').onchange = e => { state.theme = e.target.value; draw(); };
      root.querySelector('#b-new').onclick = () => editer(null, draw);
      root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editer(db.byId('mail_templates', b.dataset.edit), draw));
      root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
        const m = db.byId('mail_templates', b.dataset.copy);
        copier(m.subject ? `${m.subject}\n\n${m.body}` : m.body);
      });
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Facturation
// En attendant Stripe, la facturation se suit sur l'affaire elle-même : trois champs
// (n° de facture, facturée le, payée le) rangés dans `fields`, comme les autres champs
// métier de l'activité. Le jour où Stripe est raccordé, ces colonnes deviendront le
// reflet des factures Stripe sans que l'écran change de forme.
const FACTU_FORM = [
  { key: 'facture_num', label: 'N° de facture', half: true, placeholder: '2026-014' },
  { key: 'facture_date', label: 'Facturée le', type: 'date', half: true },
  { key: 'paiement_date', label: 'Payée le', type: 'date', half: true },
];

const FACTU_VUES = [
  { key: 'a_facturer', label: 'À facturer' },
  { key: 'impayees', label: 'En attente de paiement' },
  { key: 'payees', label: 'Payées' },
  { key: 'toutes', label: 'Toutes' },
];

// Une mission est facturable dès que la prestation est engagée : à partir du RDV sur place.
const facturables = () => {
  const a = act();
  return deals().filter(d => d.status !== 'lost' && a.stages.find(s => s.key === d.stage)?.delivery);
};
const champ = (d, k) => ((d.fields || {})[k] || '').toString().trim();

export const btpFacturationPage = {
  title: () => 'BTP Expertise — Facturation',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { vue: 'a_facturer', q: '', focus: null };

    const saisir = (d, apres) => {
      const m = openModal(`Facturation — ${d.title}`,
        `<form class="form" id="factu-form">${renderForm(FACTU_FORM, d.fields || {})}
          <p class="small muted" style="flex-basis:100%;margin:0">Montant de la mission : <b>${d.amount ? eur(d.amount) : 'non renseigné'}</b> HT. Il se modifie sur la fiche de l&rsquo;affaire.</p>
          <div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
        </form>`);
      m.querySelector('#factu-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await db.update('deals', d.id, { fields: { ...(d.fields || {}), ...readForm(e.target, FACTU_FORM) } });
          closeModal(true); toast('Facturation enregistrée'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
    };

    const draw = () => {
      const a = act();
      const toutes = facturables();
      const anneeEnCours = String(new Date().getFullYear());

      const aFacturer = toutes.filter(d => !champ(d, 'facture_date'));
      const impayees = toutes.filter(d => champ(d, 'facture_date') && !champ(d, 'paiement_date'));
      const payees = toutes.filter(d => champ(d, 'paiement_date'));
      const somme = (l) => l.reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const encaisse = somme(payees.filter(d => champ(d, 'paiement_date').slice(0, 4) === anneeEnCours));

      const listes = { a_facturer: aFacturer, impayees, payees, toutes };
      const lignes = (listes[state.vue] || toutes)
        .filter(d => hit([d.title, dealParty(d), champ(d, 'facture_num')], terms(state.q)))
        .sort((x, y) => (champ(y, 'facture_date') || y.stage_changed_at || '').localeCompare(champ(x, 'facture_date') || x.stage_changed_at || ''));

      root.innerHTML = cadre('#/btp/facturation', 'Facturation', `
        <div class="esp-kpis">
          ${kpi({ label: 'À facturer', valeur: eur(somme(aFacturer)), sous: `${aFacturer.length} mission${aFacturer.length > 1 ? 's' : ''} livrée${aFacturer.length > 1 ? 's' : ''} sans facture`, icone: '🧾', ton: 'accent', href: '#/btp/facturation' })}
          ${kpi({ label: 'En attente de paiement', valeur: eur(somme(impayees)), sous: `${impayees.length} facture${impayees.length > 1 ? 's' : ''} émise${impayees.length > 1 ? 's' : ''}`, icone: '⏳', ton: 'amber', href: '#/btp/facturation' })}
          ${kpi({ label: `Encaissé en ${anneeEnCours}`, valeur: eur(encaisse), sous: `${payees.length} mission${payees.length > 1 ? 's' : ''} payée${payees.length > 1 ? 's' : ''} au total`, icone: '✅', ton: 'green', href: '#/btp/facturation' })}
        </div>

        <div class="card btp-stripe">
          <div class="agenda-head"><span class="agenda-ico">💳</span><h2>Stripe</h2><span class="grow"></span><span class="badge-soft">pas encore raccordé</span></div>
          <p class="small muted" style="margin:0">En attendant, les trois colonnes ci-dessous se remplissent à la main : numéro de facture, date d&rsquo;émission, date de paiement. Une fois Stripe raccordé, elles suivront les factures automatiquement — l&rsquo;écran ne changera pas de forme, il cessera simplement d&rsquo;être tenu à la main.</p>
        </div>

        <div class="toolbar">
          <div class="seg">${FACTU_VUES.map(v => `<button data-vue="${v.key}" class="${state.vue === v.key ? 'active' : ''}">${v.label} <span class="cnt">${(listes[v.key] || []).length}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <button class="btn ghost sm" id="f-export">Export CSV</button>
        </div>
        <div class="toolbar">
          ${searchInput('f-q', state, 'Rechercher une mission, un client, un n° de facture…')}
          <span class="muted small">${lignes.length} ligne${lignes.length > 1 ? 's' : ''} · ${eur(somme(lignes))} HT</span>
        </div>

        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr><th>Mission</th><th>Client</th><th>Étape</th><th class="num">Montant HT</th><th>N° facture</th><th>Facturée le</th><th>Payée le</th><th></th></tr></thead>
            <tbody>${lignes.map(d => {
              const num = champ(d, 'facture_num'), fait = champ(d, 'facture_date'), paye = champ(d, 'paiement_date');
              const retard = fait && !paye && daysSince(fait) > 30;
              return `<tr>
                <td><b>${esc(d.title)}</b></td>
                <td>${esc(dealParty(d))}</td>
                <td>${esc(a.stages.find(s => s.key === d.stage)?.label || d.stage)}</td>
                <td class="num">${d.amount ? eur(d.amount) : '—'}</td>
                <td>${num ? esc(num) : '—'}</td>
                <td>${fait ? fmtDate(fait) : '<span class="muted">à émettre</span>'}</td>
                <td>${paye ? fmtDate(paye) : (fait ? `<span class="${retard ? 'retard' : 'muted'}">en attente${retard ? ` · ${daysSince(fait)} j` : ''}</span>` : '—')}</td>
                <td class="num"><button type="button" class="btn ghost sm" data-factu="${d.id}">Saisir</button></td>
              </tr>`;
            }).join('') || '<tr><td colspan="8"><div class="empty">Aucune mission dans cette vue.</div></td></tr>'}</tbody>
          </table></div>
        </div>`);

      bindSearch(root, 'f-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });
      root.querySelectorAll('[data-factu]').forEach(b => b.onclick = () => saisir(db.byId('deals', b.dataset.factu), draw));
      root.querySelector('#f-export').onclick = () => csvDownload('btp-facturation.csv', lignes.map(d => ({
        mission: d.title, client: dealParty(d), etape: a.stages.find(s => s.key === d.stage)?.label,
        montant_ht: d.amount, n_facture: champ(d, 'facture_num'), facturee_le: champ(d, 'facture_date'), payee_le: champ(d, 'paiement_date'),
      })));
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};
