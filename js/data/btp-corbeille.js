// La corbeille des affaires BTP : jeter, reprendre, détruire.
//
// Demandé par Élodie le 06/10/2026 : « pour BTP Expertise, je veux un système
// de corbeille avant de supprimer définitivement une affaire ».
//
// ⚠ CE QUE LE BOUTON « SUPPRIMER » FAISAIT JUSQU'ICI, et qui explique pourquoi
// cette corbeille n'est pas un confort : il détruisait l'affaire SANS AUCUNE
// GARDE — n'importe qui, une seule confirmation — et la suppression emportait
// EN CASCADE, mesuré sur les clés étrangères, les `activities`, les `events`,
// le `btp_amo_suivi`, les `btp_releves` et les `henrri_documents`. Le message
// affiché annonçait « ses activités et ses notes » ; le reste partait sans
// être nommé.
//
// ⚠ LA COPIE PREND TOUT CE QUI SERAIT DÉTRUIT, c'est la fonction de base qui
// s'en charge. Sans ça, restaurer rendrait une coquille — une affaire sans ses
// relevés n'est pas l'affaire qu'on a jetée. C'est la différence entre une
// corbeille et un cimetière.
//
// ⚠ BTP SEULEMENT. Une affaire RGD traîne derrière elle des chantiers et des
// PAIEMENTS, qui tombent eux aussi en cascade. Les reprendre demande la logique
// de `rgd_supprimer_fiche`, qui sait déjà les compter. Ouvrir cette corbeille à
// RGD sans ça donnerait une restauration qui rend l'affaire et perd l'argent —
// pire que pas de corbeille, parce qu'on croirait avoir un filet.
import { db } from './db.js';
import { scope } from './scope.js';

const echec = (e) => ({ ok: false, motif: e?.message || 'erreur inconnue' });

/**
 * Jeter une affaire BTP : elle part dans la corbeille avec tout ce qui pend.
 *
 * ⚠ OUVERT AU PROPRIÉTAIRE, comme la corbeille RGD : jeter se répare, donc
 * n'a pas besoin d'être verrouillé. La fonction de base refuse l'affaire d'un
 * autre — ce garde-ci n'existe pas côté écran, c'est le serveur qui tranche.
 */
export async function jeterAffaireBtp(dealId) {
  try {
    const r = await db.rpc('btp_jeter_affaire', { p_id: dealId });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) { return echec(e); }
}

/** Remettre une affaire jetée, avec son suivi, ses relevés et ses documents. */
export async function restaurerAffaireBtp(corbeilleId) {
  try {
    const r = await db.rpc('btp_restaurer_affaire', { p_corbeille: corbeilleId });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) { return echec(e); }
}

/**
 * Détruire pour de bon la copie gardée.
 *
 * ⚠ RÉSERVÉE À LA DIRECTION, côté base comme à l'écran. C'est la seule moitié
 * du geste qui reste fermée.
 */
export async function purgerAffaireBtp(corbeilleId) {
  try {
    const r = await db.rpc('btp_purger_corbeille', { p_corbeille: corbeilleId });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) { return echec(e); }
}

/**
 * Les affaires jetées que la personne a le droit de voir.
 *
 * ⚠ LA POLICY LE DIT DÉJÀ CÔTÉ BASE et ne lui envoie rien d'autre ; ce filtre
 * est pour le mode démo, qui n'a pas de serveur pour le dire. Les lignes déjà
 * restaurées restent dans la table — elles racontent ce qui s'est passé — mais
 * l'écran ne les propose plus ni à reprendre ni à détruire.
 */
export function corbeilleBtp() {
  if (!scope.canBtp) return [];
  const lignes = db.t('btp_corbeille');
  if (scope.isDirection) return lignes;
  return lignes.filter(x => x.owner_id === scope.user?.id);
}

/** Celles qui attendent encore : ni reprises, ni détruites. */
export const corbeilleBtpEnAttente = () => corbeilleBtp().filter(x => !x.restauree_le);
