// Les créneaux de l'agenda RGD — ce qui est pris, et ce qui reste
//
// ⚠ ON LIT GOOGLE EN DIRECT, PAS `agenda_events`, et c'est la seule décision
// qui compte dans ce fichier (01/10/2026, demandé par Mickael : « Google agenda
// pour prendre rendez-vous directement depuis cette page avec les rendez-vous
// déjà pris et dispo »). Le reflet est relevé **une fois par jour** sur la
// fenêtre large, et toutes les 30 minutes pour la seule journée courante : un
// rendez-vous pris ce matin pour jeudi prochain N'Y EST PAS avant demain.
// Proposer des créneaux là-dessus ferait poser une visite par-dessus un
// rendez-vous réel — et l'erreur ne se verrait que le jour dit, devant le
// client. L'Edge Function `agenda-creneaux` interroge donc Google.
//
// ⚠ LE SERVEUR DIT CE QUI EST PRIS, L'ÉCRAN CALCULE CE QUI EST LIBRE. Les
// horaires de travail, le pas et la durée d'une visite sont des règles d'ici :
// les poser côté serveur obligerait à redéployer une fonction pour avancer
// l'ouverture d'une heure.
//
// ⚠ TOUT SE COMPTE EN MINUTES DE PENDULE PARISIENNE, jamais en `Date` décalés.
// Le navigateur peut être réglé sur n'importe quel fuseau, et Google rend des
// horodatages avec décalage ; on ramène donc chaque borne à « combien de
// minutes après minuit, à Paris » par `Intl`, qui connaît les changements
// d'heure. C'est la même précaution que `finApres` côté formulaire — l'erreur
// inverse avait fait partir une fin avant son début le 25/09/2026.
import { db } from './db.js';
import { CONFIG } from '../config.js';
import { scope } from './scope.js';
// ⚠ `decale` EST IMPORTÉ, PAS REFAIT : il est ancré à midi UTC pour ne pas
// tomber sur une heure qui n'existe pas la nuit du changement d'heure, et une
// seconde version de ce calcul finirait par ne plus dire le même jour.
import { decale } from './evenements.js';

export const FUSEAU = 'Europe/Paris';

// La journée de travail et le pas des propositions. Un pas de 30 minutes donne
// vingt-deux départs possibles : assez pour caler une visite entre deux
// rendez-vous, assez peu pour que la colonne se lise d'un coup.
export const OUVERTURE = 8 * 60;
export const FERMETURE = 19 * 60;
export const PAS = 30;

// ⚠ LA DURÉE EST UN CHOIX, PAS UNE CONSTANTE : une visite de salle de bain et
// la visite d'une maison entière ne prennent pas le même temps, et c'est elle
// qui décide quels créneaux sont assez larges.
export const DUREES = [[60, '1 h'], [90, '1 h 30'], [120, '2 h']];

const fJour = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
});
const fHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false,
});

const p2 = (n) => String(n).padStart(2, '0');

/** « HH:MM » depuis un nombre de minutes après minuit. */
export const hhmm = (min) => `${p2(Math.floor(min / 60))}:${p2(min % 60)}`;

/** Le jour parisien d'un instant, « AAAA-MM-JJ ». */
export const jourDe = (d) => fJour.format(d);

/** Les minutes après minuit, à Paris, d'un instant. */
const minutesDe = (d) => {
  const [h, m] = fHeure.format(d).split(':').map(Number);
  return h * 60 + m;
};

/** Aujourd'hui à Paris, « AAAA-MM-JJ ». */
export const aujourdhuiParis = () => fJour.format(new Date());

/** L'heure courante à Paris, en minutes après minuit. */
export const maintenantParis = () => minutesDe(new Date());

/** Le lundi de la semaine d'un jour donné. */
export function lundiDe(jour) {
  const d = new Date(`${jour}T12:00:00Z`);
  // `getUTCDay()` : 0 = dimanche. On veut lundi comme premier jour.
  const recul = (d.getUTCDay() + 6) % 7;
  return decale(jour, -recul);
}

/**
 * Ce qui occupe l'agenda sur une fenêtre.
 *
 * Rend `{ ok, occupes, lu_a, demo }` ou `{ ok: false, motif }`.
 *
 * ⚠ EN MODE DÉMO ON RETOMBE SUR LE REFLET, ET L'ÉCRAN LE DIT. Il n'y a ni
 * fonction serveur ni Google ; lire `agenda_events` est le seul moyen d'avoir
 * quelque chose à montrer, mais c'est exactement la source que cette mécanique
 * existe pour ne PAS utiliser en production. Le drapeau `demo` remonte pour
 * que l'écran l'écrive au lieu de laisser croire à une lecture en direct.
 */
export async function lireCreneaux({ activite = 'rgd', metier = null, du, au }) {
  if (db.demo) return { ok: true, demo: true, lu_a: null, occupes: duReflet(activite, du, au) };

  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/agenda-creneaux`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ activite, metier, du, au }),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok || rep.ok === false) {
      return { ok: false, motif: rep.erreur || rep.detail || `Erreur ${r.status}` };
    }
    return { ok: true, demo: false, lu_a: rep.lu_a || null, occupes: rep.occupes || [] };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

// Le repli du mode démo : le reflet, remis à la forme que rend le serveur.
function duReflet(activite, du, au) {
  return (scope.rgd('agenda_events') || [])
    .filter(e => e.activity === activite && e.day >= du && e.day <= au)
    .map(e => ({
      id: e.google_id || e.id,
      titre: e.title || '(sans titre)',
      debut: e.all_day ? e.day : e.starts_at,
      fin: e.all_day ? decale(e.day, 1) : e.ends_at,
      journee: !!e.all_day,
    }))
    .filter(e => e.debut && e.fin);
}

/**
 * Ce qui occupe UN jour, en minutes de pendule, trié.
 *
 * ⚠ UN RENDEZ-VOUS À CHEVAL SUR DEUX JOURS EST COUPÉ, pas ignoré : il occupe
 * la fin du premier et le début du second. Le filtrer sur son seul jour de
 * départ laisserait libre une matinée qui ne l'est pas.
 *
 * ⚠ LA FIN D'UNE JOURNÉE ENTIÈRE EST EXCLUSIVE chez Google : un événement du
 * 7 au 8 ne dure qu'un jour. Tester `<=` bloquerait le 8 pour rien.
 */
export function occupationDuJour(occupes, jour) {
  const sur = [];
  for (const e of occupes || []) {
    if (e.journee) {
      const d = String(e.debut).slice(0, 10);
      const f = String(e.fin).slice(0, 10);
      if (jour >= d && jour < f) {
        sur.push({ titre: e.titre, journee: true, debut: OUVERTURE, fin: FERMETURE });
      }
      continue;
    }
    const d = new Date(e.debut);
    const f = new Date(e.fin);
    if (Number.isNaN(+d) || Number.isNaN(+f)) continue;
    const jd = jourDe(d);
    const jf = jourDe(f);
    if (jour < jd || jour > jf) continue;
    const debut = jour === jd ? minutesDe(d) : 0;
    const fin = jour === jf ? minutesDe(f) : 1440;
    // Un rendez-vous qui finit à minuit pile retombe sur le jour suivant avec
    // une durée nulle : il n'occupe rien là-bas.
    if (fin <= debut) continue;
    sur.push({ titre: e.titre, journee: false, debut, fin });
  }
  return sur.sort((a, b) => a.debut - b.debut);
}

/**
 * Les heures de départ encore possibles un jour donné.
 *
 * `avant` : les minutes en dessous desquelles on ne propose rien — l'heure
 * courante pour aujourd'hui, rien pour les autres jours. Proposer 9 h à 14 h
 * ferait prendre un rendez-vous dans le passé.
 */
export function placesLibres(occupation, { duree = 60, avant = null } = {}) {
  const libres = [];
  for (let t = OUVERTURE; t + duree <= FERMETURE; t += PAS) {
    if (avant != null && t < avant) continue;
    const pris = occupation.some(o => t < o.fin && (t + duree) > o.debut);
    if (!pris) libres.push(t);
  }
  return libres;
}
