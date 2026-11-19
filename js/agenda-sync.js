// Agenda du groupe : Google est la reference, le CRM en garde un reflet.
//
// Le probleme que ca resout : lire Google a l'affichage oblige chaque personne a
// se connecter, et ne lui montre que les calendriers partages avec elle. En
// recopiant les rendez-vous dans la base, la journee s'affiche sans connexion
// Google — et le CRM peut les trier, les colorer et les meler a ses propres
// taches.
//
// ⚠ LA BASE CONTIENT TOUT, L'ECRAN N'EN MONTRE PAS TOUT (06/10/2026). Le
// releve rapatrie les agendas de la structure sans distinction ; c'est
// `scope.voitAgenda` qui ne garde ensuite que ceux de la personne connectee,
// quand elle en a. Ce n'est donc PAS une protection — la policy rend bien
// toutes les lignes a qui porte l'activite — mais un cloisonnement
// d'affichage, demande par Elodie : « chaque personne son agenda ».
//
// CE MODULE NE FAIT PLUS QUE LIRE. La recopie se fait cote serveur, hors du
// navigateur : aucune fenetre de consentement, aucun jeton Google ici, rien a
// cliquer. Le CRM affiche ce qu'il trouve dans agenda_events, c'est tout.
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { idsDe } from './agenda.js';
import { ACTIVITY_KEYS } from './data/schema.js';

// Jour local au format AAAA-MM-JJ : c'est la clé de synchronisation et d'affichage.
export const jourCle = (d = new Date()) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};

export const agendasDe = (cles = ACTIVITY_KEYS) =>
  cles.flatMap(k => idsDe(k).map(c => ({ structure: k, calendrier: c })));

// ---------- Lecture ----------
// Les rendez-vous d'un jour — ou d'une PLAGE de jours, bornes comprises.
//
// ⚠ LA PLAGE A ÉTÉ AJOUTÉE LE 19/11/2026 SANS CHANGER LA SIGNATURE : `au`
// vaut `du` par défaut, donc tous les appels à un seul jour restent ce qu'ils
// étaient. La semaine du tableau de bord lit la même fonction que la journée,
// avec le même cloisonnement — deux lectures différentes de `agenda_events`
// auraient fini par ne plus montrer la même chose.
//
// ⚠ ON REND LES LIGNES TELLES QU'ELLES SONT EN BASE, et non une forme
// remaniée : la grille hebdomadaire de l'écran Agenda, que le tableau de bord
// emprunte, lit `starts_at`, `ends_at`, `all_day` et `calendar_id`. Les
// traduire ici obligeait à les retraduire là-bas.
//
// `day` est la clé AAAA-MM-JJ qui range le rendez-vous dans sa colonne : c'est
// elle qui fait apparaître un « journée entière » de trois jours les trois
// jours — le relevé en écrit une ligne par jour occupé, l'heure de début, elle,
// ne change pas.
export function lignesEnregistrees(cles, du = jourCle(), au = du) {
  return db.t('agenda_events')
    .filter(e => e.day >= du && e.day <= au && cles.includes(e.activity) && scope.voitAgenda(e))
    .sort((a, b) => (a.day === b.day
      ? (!!a.all_day === !!b.all_day
        ? new Date(a.starts_at) - new Date(b.starts_at) : a.all_day ? -1 : 1)
      : (a.day < b.day ? -1 : 1)));
}
