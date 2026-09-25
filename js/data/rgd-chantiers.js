// Les chantiers de RGD Renova — écrits dans le CRM
//
// SUPABASE EST LA SOURCE DU STATUT DES CHANTIERS DEPUIS LE 25/09/2026. Le
// statut et la création s'écrivent ici, et la synchronisation a cessé le même
// jour d'apporter la traduction du statut.
//
// ⚠ LES DEUX MOITIÉS SONT INDISSOCIABLES, même leçon que les sous-traitants le
// 24/09 : `push_rgd_chantiers_statut` reposait `statut_d1` toutes les 30
// minutes, et `push_rgd` reposait avec lui `deals.stage`, `deals.status` et
// `rgd_chantiers.etat`, qui en sont les traductions. Écrire ici sans couper là
// aurait fait revenir le statut en arrière tout seul, sans erreur et sans un
// mot. La coupure est côté Supabase, pas côté worker : la bascule ne dépend
// alors d'aucun déploiement à orchestrer, et un ancien worker redéployé ne peut
// pas ressusciter l'écrasement. C'est le précédent posé par
// `push_rgd_pilotage` pour les dates de chantier.
//
// ⚠ CE QUI CHANGE POUR QUI APPELLE : on désigne un chantier par son **uuid**,
// plus par l'identifiant de l'autre côté ; la création apparaît **tout de
// suite** ; et il n'y a plus de compte de l'application RGD à avoir — le seul
// droit qui compte est `has_activity('rgd')`, dont `scope.canRgd` est le
// miroir, et la fonction le revérifie côté serveur.
//
// ⚠ POURQUOI DES RPC ICI, alors que les partenaires écrivent en direct : un
// changement de statut doit poser `statut_d1`, traduire vers l'affaire et
// relancer le calcul de l'état **dans la même transaction** ; une création doit
// fabriquer l'affaire ET le chantier. Trois écritures à moitié faites
// laisseraient un chantier sans affaire, que le filtre de l'écran ferait
// disparaître sans rien dire.
import { db } from './db.js';

const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });

const reponse = (r) => (r?.ok === false
  ? { ok: false, motif: r.error || 'refusé' }
  : { ok: true, donnees: r });

/**
 * Changer le statut d'un chantier, aux dix valeurs du tableau de bord.
 *
 * ⚠ EFFET DE BORD CONSERVÉ : la fonction propage vers le `statut_suivi` du
 * prospect quand celui-ci a un apporteur — même règle qu'avant, garde compris,
 * et sans recul ni écrasement d'un « perdu ». Elle rend `notifier: true` quand
 * l'email à l'apporteur serait dû.
 *
 * ⚠ CET EMAIL N'EST PAS PORTÉ, ET C'EST DÉLIBÉRÉ : `apporteur_id` est nul sur
 * les 192 fiches, donc la propagation elle-même ne se déclenche aujourd'hui
 * pour personne. Écrire un gabarit qu'on ne peut pas éprouver serait pire que
 * de laisser le point d'accroche visible. Le jour où un apporteur est rattaché,
 * le branchement se fait sur `notifier`.
 *
 * L'état, les montants et les dates se recalculent dans la même transaction :
 * l'appelant recharge donc la table plutôt que d'avancer sa ligne, son cache
 * est en retard sur plus que le seul statut.
 */
export async function majStatutChantier(id, statut) {
  try {
    return reponse(await db.rpc('rgd_chantier_statut', { p_id: id, p_statut: statut }));
  } catch (e) { return echec(e); }
}

/**
 * Créer un chantier. `contact` est l'**uuid du contact** dans le CRM.
 *
 * Seuls le contact et le nom sont exigés — comme l'ancienne route, et pour la
 * même raison : un formulaire qui réclamerait douze champs ferait qu'on ouvre
 * le chantier ailleurs.
 *
 * ⚠ `montant_ht` est une ENTRÉE, pas une vérité : le calcul le reprend depuis
 * les devis signés dès qu'il y en a. Ce qui est saisi ici ne vaut que tant que
 * le chantier n'a pas de devis.
 */
export async function creerChantier(champs) {
  if (!champs.contact) return { ok: false, motif: 'un chantier sans client' };
  if (!String(champs.nom || '').trim()) return { ok: false, motif: 'un chantier sans nom' };
  try {
    return reponse(await db.rpc('rgd_chantier_creer', {
      p_contact: champs.contact,
      p_nom: String(champs.nom).trim(),
      p_statut: champs.statut || 'en_preparation',
      p_adresse: champs.adresse || null,
      p_code_postal: champs.code_postal || null,
      p_ville: champs.ville || null,
      p_description: champs.description || null,
      p_montant_ht: champs.montant_ht ?? null,
      p_date_debut_prevue: champs.date_debut_prevue || null,
    }));
  } catch (e) { return echec(e); }
}
