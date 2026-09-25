// Marquer un devis signé — écrit dans le CRM
//
// SUPABASE PORTE LE GESTE DEPUIS LE 25/09/2026, mais **pas la vérité**.
//
// ⚠ AUCUNE COUPURE DE SYNCHRONISATION ICI, ET CE N'EST PAS UN OUBLI. Les deux
// bascules précédentes — sous-traitants, chantiers — allaient par paires :
// écrire dans le CRM ET fermer la porte qui reposait la valeur toutes les
// trente minutes. Ici la source n'est pas l'application RGD mais **Costructor**,
// et c'est la synchronisation des devis qui réécrit le statut et la date de
// signature depuis le statut du devis chez lui. Fermer quoi que ce soit
// reviendrait à couper la seule source vraie des devis.
//
// ⚠ LA CONSÉQUENCE EST DONC INCHANGÉE, ET L'ÉCRAN DOIT CONTINUER DE LE DIRE :
// une signature posée ici **revient en arrière** si le devis n'est pas accepté
// chez Costructor. Le bouton dépanne, il ne remplace pas l'acceptation. Seul
// son vocabulaire change — ce n'est plus « écrit dans le tableau de bord »,
// c'est écrit ici.
//
// ⚠ C'EST AUSSI POURQUOI LA CRÉATION DE DEVIS RESTE FERMÉE : un devis né dans
// le CRM serait un orphelin que Costructor ne connaît pas et ne corrigera
// jamais. Même raison pour les encaissements, en lecture seule.
//
// ⚠ POURQUOI UNE FONCTION DE BASE ET NON UN `db.update` : l'écriture relance le
// calcul de l'état du chantier dans la même transaction. Un devis signé change
// l'état, les montants et les dates de travaux de son chantier ; poser le seul
// statut laisserait l'autre écran affirmer le contraire pendant une demi-heure.
import { db } from './db.js';

const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });

/**
 * Marquer un devis signé, désigné par son **uuid** — plus par l'identifiant de
 * l'autre côté. Le bouton restait caché sur une ligne qui n'en avait pas ;
 * il n'y a plus de raison.
 *
 * Idempotente : une signature déjà datée n'est pas redatée.
 */
export async function signerDevis(id) {
  try {
    const r = await db.rpc('rgd_devis_signer', { p_id: id });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) { return echec(e); }
}
