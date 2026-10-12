// Le raccordement TikTok, vu du navigateur.
//
// (12/10/2026, demandé par Élodie : « je voudrais raccorder le tiktok dans
// analyse ».)
//
// ⚠ LE NAVIGATEUR NE VOIT JAMAIS UN JETON TIKTOK. Le jeton de rafraîchissement
// vaut un an d'accès au compte : il vit dans `tiktok_comptes`, qui n'a AUCUNE
// policy — rien n'en sort côté client. Ce qu'on lit ici est la vue
// `tiktok_raccordement`, qui dit quel compte est raccordé, depuis quand et
// jusqu'à quand, et rien de plus. Même procédé que `v_properties_rental`, qui
// cache les prix à la gestion locative.
//
// ⚠ ET LE RACCORDEMENT NE SE FAIT PAS PAR UN APPEL, MAIS PAR UN ALLER-RETOUR :
// TikTok demande l'autorisation sur SON site, puis ramène le navigateur sur
// l'Edge Function `tiktok-retour`, qui échange le code contre les jetons et
// renvoie la personne ici. Le bouton ne « branche » donc rien : il obtient
// l'adresse où aller, et la page quitte le CRM le temps de l'autorisation.
import { CONFIG } from '../config.js';
import { db } from './db.js';

/** Le compte raccordé pour une structure, ou null. */
export const raccordementTiktok = (cle) =>
  db.t('tiktok_raccordement').find((r) => r.activity === cle) || null;

async function porte(action, activity) {
  if (CONFIG.DEMO) throw new Error('Mode démo : aucun compte n’est raccordé pour de vrai.');
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/tiktok-retour`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, activity }),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) throw new Error(rep.erreur || `Erreur ${r.status}`);
  return rep;
}

/**
 * Rend l'adresse TikTok où envoyer la personne. C'est le serveur qui la
 * fabrique, et pas l'écran : elle porte un `state` qu'il vient de poser en
 * base, et c'est la seule chose qui empêche un inconnu de raccorder SON compte
 * à la place du nôtre en appelant notre adresse de retour.
 */
export async function demarrerRaccordementTiktok(activity) {
  const r = await porte('demarrer', activity);
  if (!r.url) throw new Error('Adresse d’autorisation absente.');
  return r.url;
}

/** Coupe le raccordement : la ligne part, le jeton avec. */
export const retirerRaccordementTiktok = (activity) => porte('retirer', activity);

/**
 * Ce que l'Edge Function a écrit dans l'adresse en ramenant la personne.
 * ⚠ ELLE EST LUE SUR `location.search`, JAMAIS SUR L'ANCRE : le CRM route par
 * `#/…`, donc le serveur pose la question AVANT le `#`. Et elle est retirée
 * aussitôt lue — sinon un rafraîchissement de page réafficherait « raccordé »
 * une semaine plus tard.
 */
export function messageRetourTiktok() {
  let p;
  try { p = new URLSearchParams(location.search); } catch { return null; }
  const etat = p.get('tiktok');
  if (!etat) return null;
  const motif = p.get('motif') || '';
  const compte = p.get('compte') || '';
  try {
    p.delete('tiktok'); p.delete('motif'); p.delete('compte');
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  } catch { /* sans historique, le message se répétera : sans gravité */ }
  if (etat === 'ok') return { ton: 'ok', texte: `TikTok est raccordé${compte ? ` au compte ${compte}` : ''}. Les premiers chiffres arrivent demain matin.` };
  if (etat === 'refus') return { ton: 'refus', texte: motif || 'L’autorisation TikTok n’a pas été accordée.' };
  return { ton: 'erreur', texte: motif || 'Le raccordement TikTok a échoué.' };
}
