// Agenda du groupe : Google est la référence, le CRM en garde un reflet.
//
// Le problème que ça résout : lire Google à l'affichage oblige chaque personne à
// se connecter, et ne lui montre que les calendriers partagés avec elle. En
// recopiant les rendez-vous dans la base, tout le monde voit la même journée,
// sans connexion Google — et le CRM peut les trier, les colorer et les mêler à
// ses propres tâches.
//
// Qui recopie : la direction, quand elle ouvre le CRM avec son compte Google.
// C'est elle qui a accès aux calendriers ; les autres se contentent de lire la
// table. Aucune machine à faire tourner, aucun serveur.
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { idsDe } from './agenda.js';
import { configure as googleConfigure, evenementsDuJour } from './google-agenda.js';
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
// Les rendez-vous d'un jour, tels qu'ils sont enregistrés dans le CRM.
export function evenementsEnregistres(cles, jour = jourCle()) {
  return db.t('agenda_events')
    .filter(e => e.day === jour && cles.includes(e.activity))
    .map(e => ({
      id: e.id, titre: e.title || '(sans titre)', lieu: e.location || '',
      debut: new Date(e.starts_at), fin: e.ends_at ? new Date(e.ends_at) : new Date(e.starts_at),
      journee: !!e.all_day, structure: e.activity,
      invites: e.attendees || 0, lien: e.link || '',
    }))
    .sort((a, b) => (a.journee === b.journee ? a.debut - b.debut : a.journee ? -1 : 1));
}
// Quand la dernière copie a-t-elle eu lieu ? Sert à dire « à jour il y a 10 min »
// plutôt que de laisser croire que la journée est vide.
export function derniereSync(cles, jour = jourCle()) {
  const dates = db.t('agenda_events')
    .filter(e => e.day === jour && cles.includes(e.activity) && e.synced_at)
    .map(e => new Date(e.synced_at).getTime());
  return dates.length ? new Date(Math.max(...dates)) : null;
}

// ---------- Écriture ----------
// Peut-on recopier ? Il faut la direction (la policy l'impose côté serveur),
// un identifiant client Google, et au moins un calendrier raccordé.
export const peutSynchroniser = (cles) => scope.isDirection && googleConfigure() && agendasDe(cles).length > 0;

// Recopie la journée. `interactif` ouvre la fenêtre de consentement Google ;
// sans geste de la personne, on tente seulement un renouvellement silencieux.
export async function synchroniser(cles, { interactif = false, jour = new Date() } = {}) {
  const agendas = agendasDe(cles);
  if (!agendas.length) return { evenements: [], echecs: [], copies: 0 };
  const { evenements, echecs } = await evenementsDuJour(agendas, jour, { interactif });
  const cle = jourCle(jour);

  // On n'efface que les calendriers qu'on a pu lire : si l'agenda BTP est
  // momentanément illisible, ses rendez-vous de la veille restent en place
  // plutôt que de disparaître de l'écran de tout le monde.
  const lisibles = agendas
    .filter(a => !echecs.some(x => x.calendrier === a.calendrier))
    .map(a => a.calendrier);
  if (!lisibles.length) return { evenements: evenementsEnregistres(cles, cle), echecs, copies: 0 };

  const lignes = evenements
    .filter(e => lisibles.includes(e.calendrier))
    .map(e => ({
      id: `${e.calendrier}|${e.id}`,
      activity: e.structure, calendar_id: e.calendrier || '', google_id: e.id,
      title: e.titre, location: e.lieu,
      starts_at: e.debut.toISOString(), ends_at: e.fin ? e.fin.toISOString() : null,
      all_day: e.journee, attendees: e.invites || null, link: e.lien || null,
    }));

  await db.rpc('remplacer_agenda', { p_jour: cle, p_calendriers: lisibles, p_evenements: lignes });
  await db.recharger('agenda_events');
  return { evenements: evenementsEnregistres(cles, cle), echecs, copies: lignes.length };
}
