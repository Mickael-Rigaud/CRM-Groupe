// Agendas Google des structures — mécanisme partagé par l'espace BTP Expertise
// et par « Ma journée » du tableau de bord.
//
// Ce que le CRM fait, et ce qu'il ne fait pas : un agenda Google s'affiche ici
// dans un cadre intégré, mais son contenu reste chez Google. Le CRM ne peut pas
// lire les rendez-vous, donc pas les mélanger à ses propres tâches dans une même
// liste. En revanche Google sait superposer plusieurs agendas dans un seul cadre,
// chacun gardant SA couleur : c'est ainsi qu'on obtient « tous les agendas ».
//
// Les identifiants vivent dans les réglages, jamais dans le code : dépôt public.
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS } from './data/schema.js';
import { esc, toast } from './ui.js';

// Une clé de réglage par structure. « btp_calendar_id » existait avant ce module :
// on garde son nom pour ne pas perdre l'agenda déjà raccordé du cabinet.
export const CLES_AGENDA = {
  rgd: 'rgd_calendar_id',
  btp: 'btp_calendar_id',
  courtage: 'courtage_calendar_id',
  propulsion: 'propulsion_calendar_id',
};

// Plusieurs identifiants possibles par structure, séparés par une virgule, un
// point-virgule ou un retour à la ligne.
const decouper = (v) => String(v || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
export const idsDe = (cle) => decouper(db.setting(CLES_AGENDA[cle]));
// Tous les agendas des structures demandées, sans doublon : deux structures qui
// partagent un calendrier ne doivent pas le superposer à lui-même.
export const idsDeTous = (cles = ACTIVITY_KEYS) => [...new Set(cles.flatMap(idsDe))];
export const structuresRaccordees = (cles = ACTIVITY_KEYS) => cles.filter(k => idsDe(k).length);

// Les modes acceptés par le cadre Google : WEEK, MONTH, AGENDA. Il n'y a PAS de
// mode « DAY » — passer une valeur inconnue fait silencieusement retomber Google
// sur la vue mois. Une journée s'obtient avec AGENDA borné à la date du jour.
export const VUES = [['WEEK', 'Semaine'], ['MONTH', 'Mois'], ['AGENDA', 'Planning']];

// Teintes du cadre intégré, une par agenda, dans l'ordre des identifiants.
//
// Le cadre de Google n'hérite PAS des couleurs réglées dans le compte : sans
// consigne il peint tous les agendas pareil, et deux calendriers distincts
// deviennent impossibles à séparer à l'œil. Le paramètre `color` se place
// juste après le `src` qu'il concerne — il ne repeint donc pas tout, contrairement
// à ce qu'on pourrait croire : il y en a un par agenda.
//
// Ce sont les teintes de la palette de Google, pour que le cadre montre les
// mêmes couleurs que Google Agenda ouvert à côté. L'ORDRE DES IDENTIFIANTS dans
// le réglage décide donc de la couleur de chaque agenda.
const TEINTES = ['#3F51B5', '#AD1457', '#EF6C00', '#0B8043', '#8E24AA', '#039BE5'];

// Google reprend notre couleur de fond pour que le cadre se fonde dans la page.
export function urlAgenda(ids, mode, { jour = null } = {}) {
  const lire = (v, repli) => (getComputedStyle(document.documentElement).getPropertyValue(v).trim() || repli);
  const p = new URLSearchParams({
    ctz: 'Europe/Paris', mode,
    wkst: '2',                       // la semaine commence le lundi
    showTitle: '0', showPrint: '0', showTabs: '0', showCalendars: '0', showTz: '0',
    showNav: jour ? '0' : '1',       // borné à un jour, la navigation n'a plus de sens
    bgcolor: lire('--card', '#FFFFFF'),
  });
  if (jour) p.set('dates', `${jour}/${jour}`);
  // src puis color, agenda par agenda : l'ordre compte, Google rattache chaque
  // couleur au src qui la précède.
  ids.forEach((id, i) => {
    p.append('src', id);
    p.append('color', TEINTES[i % TEINTES.length]);
  });
  return 'https://calendar.google.com/calendar/embed?' + p;
}
// La journée en cours : la liste des rendez-vous, bornée à aujourd'hui.
export const urlJour = (ids) => {
  const d = new Date();
  const aujourdhui = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return urlAgenda(ids, 'AGENDA', { jour: aujourdhui });
};

export const cadreAgenda = (ids, vue, titre) =>
  `<div class="agenda-cadre agenda-${vue.toLowerCase()}">
     <iframe src="${esc(urlAgenda(ids, vue))}" title="${esc(titre)}" loading="lazy"></iframe>
   </div>`;
export const cadreJour = (ids, titre) =>
  `<div class="agenda-cadre agenda-jour">
     <iframe src="${esc(urlJour(ids))}" title="${esc(titre)}" loading="lazy"></iframe>
   </div>`;

export const noteAgenda = () =>
  `<p class="muted small">Cet agenda est celui de Google : ce qui est modifié là-bas apparaît ici, et inversement.
   Si le cadre reste vide, votre adresse n&rsquo;a pas encore été ajoutée au partage du calendrier, ou votre
   navigateur refuse la mémorisation des sites affichés dans un autre site.</p>`;

// ---------- Raccordement ----------
export const modeEmploi = () => `<ol>
  <li>Ouvrez Google Agenda avec le compte qui tient le calendrier.</li>
  <li>Passez la souris sur le calendrier, <b>⋮</b> → <b>Paramètres et partage</b>.</li>
  <li>Dans <b>Partager avec des personnes en particulier</b>, ajoutez l&rsquo;adresse Google de chaque personne qui doit le voir, en « Voir tous les détails ».</li>
  <li>Plus bas, dans <b>Intégrer le calendrier</b>, copiez l&rsquo;<b>identifiant du calendrier</b> (il ressemble à une adresse e-mail).</li>
</ol>`;

// Formulaire de raccordement, une ligne par structure. Réservé à la direction :
// la policy d'écriture sur « settings » l'impose déjà côté serveur.
export function champsAgendas(cles = ACTIVITY_KEYS) {
  return `<div class="form ag-form">${cles.map(k => `<div class="field">
    <label><span class="dot" style="background:${ACTIVITIES[k].color}"></span> ${esc(ACTIVITIES[k].label)}</label>
    <input id="ag-${k}" value="${esc(db.setting(CLES_AGENDA[k]) || '')}" placeholder="identifiant@group.calendar.google.com">
  </div>`).join('')}
  <p class="muted small">Plusieurs agendas pour une même structure ? Séparez les identifiants par une virgule : chacun gardera sa couleur.</p></div>`;
}
export async function enregistrerAgendas(racine, cles = ACTIVITY_KEYS) {
  for (const k of cles) {
    const champ = racine.querySelector(`#ag-${k}`);
    if (!champ) continue;
    const valeur = decouper(champ.value).join(',');
    const cleReglage = CLES_AGENDA[k];
    const existe = db.t('settings').some(s => s.key === cleReglage);
    if (!existe && !valeur) continue;                       // rien à écrire
    if (existe) await db.update('settings', cleReglage, { value: valeur });
    else await db.insert('settings', { key: cleReglage, value: valeur });
  }
  toast('Agendas enregistrés');
}
export const peutRaccorder = () => scope.isDirection;
