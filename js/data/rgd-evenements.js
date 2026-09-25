// Créer un rendez-vous — écrit dans Google Agenda depuis le CRM
//
// LE DERNIER GESTE DE L'AGENDA QUI PASSAIT PAR L'APPLICATION RGD (25/09/2026).
// Elle écrivait dans sa propre base puis poussait vers Google ; le CRM, lui, ne
// lit que Google relu (`agenda_events`). Le détour ne servait qu'à laisser une
// copie dans une base qu'on est en train de quitter.
//
// ⚠ GOOGLE RESTE LA SOURCE, ET ÇA NE CHANGE PAS. On crée là-bas, puis on
// relève. Écrire directement dans le reflet donnerait une ligne que le relevé
// suivant effacerait, Google ne la connaissant pas — le défaut silencieux que
// toute la bascule cherche à éviter. Il n'y a donc **aucune synchronisation à
// couper ici** : le relevé est le chemin de retour, pas un concurrent.
//
// ⚠ LE RENDEZ-VOUS EST DÉJÀ REVENU QUAND LA RÉPONSE ARRIVE. Le serveur relève
// la journée visée **et attend** avant de répondre. C'est le gain réel de la
// bascule : l'ancienne route rendait la main dès que Google avait accepté, et
// le rendez-vous n'apparaissait qu'au relevé suivant — une demi-heure, ou le
// lendemain pour un autre jour.
//
// ⚠ LE NAVIGATEUR NE CHOISIT PAS L'AGENDA et ne connaît aucune clé : il
// présente son jeton de session, le serveur lit le calendrier réglé dans le CRM
// et revérifie le droit auprès de la base. Le laisser nommer un calendrier
// reviendrait à le laisser écrire dans n'importe lequel.
import { db } from './db.js';
import { CONFIG } from '../config.js';

/**
 * Créer un rendez-vous dans l'agenda RGD.
 *
 * `champs` : `titre`, `date_debut`, `date_fin` (heure LOCALE,
 * « AAAA-MM-JJTHH:MM:SS »), `all_day`, et facultativement `lieu` et
 * `description`. ⚠ Les trois premiers sont obligatoires — un rendez-vous sans
 * fin n'a pas de place dans une grille horaire —, contrat inchangé pour que
 * l'écran n'ait pas à être réécrit.
 *
 * Rend `{ ok, donnees }` ou `{ ok: false, motif }`. ⚠ `donnees.releve` dit si
 * la journée a pu être relue : **faux ne veut pas dire échec** — le rendez-vous
 * est dans Google, il arrivera au relevé suivant. Le confondre avec une erreur
 * ferait recommencer, donc créer deux fois.
 */
export async function creerEvenement(champs) {
  // Le mode démo n'a ni fonction serveur ni Google. On le dit au lieu de
  // laisser l'appel échouer sur une adresse vide, comme l'écran Agenda le fait
  // déjà pour son relevé.
  if (db.demo) {
    return { ok: false, motif: 'Indisponible en mode démo : aucun agenda raccordé.' };
  }
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/creer-evenement`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(champs),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok || rep.ok === false) {
      return { ok: false, motif: rep.erreur || rep.detail || `Erreur ${r.status}` };
    }
    return { ok: true, donnees: rep };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}
