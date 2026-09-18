// Agenda du groupe : Google est la reference, le CRM en garde un reflet.
//
// Le probleme que ca resout : lire Google a l'affichage oblige chaque personne a
// se connecter, et ne lui montre que les calendriers partages avec elle. En
// recopiant les rendez-vous dans la base, tout le monde voit la meme journee,
// sans connexion Google — et le CRM peut les trier, les colorer et les meler a
// ses propres taches.
//
// CE MODULE NE FAIT PLUS QUE LIRE. La recopie se fait cote serveur, hors du
// navigateur : aucune fenetre de consentement, aucun jeton Google ici, rien a
// cliquer. Le CRM affiche ce qu'il trouve dans agenda_events, c'est tout.
import { db } from './data/db.js';
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
