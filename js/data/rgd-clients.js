// Les clients et les demandes de RGD Renova — écrits dans le CRM
//
// SUPABASE EST LA SOURCE DES FICHES DEPUIS LE 25/09/2026, et c'est le dernier
// lot de la sortie : plus aucun geste de l'espace RGD ne passe par
// l'application RGD.
//
// ⚠ LES DEUX MOITIÉS SONT INDISSOCIABLES, troisième fois en trois jours après
// les sous-traitants et les chantiers : `push_rgd_clients` reposait
// `statut_suivi`, `notes`, `type_bien`, `nature_travaux`, `budget_travaux` et
// `adresse_chantier` toutes les 30 minutes, **sans `coalesce`** ;
// `push_rgd_demandes` reposait `statut` et `commentaire_admin`. Écrire ici sans
// couper là aurait fait disparaître la saisie dans la demi-heure, sans erreur
// et sans un mot — la perte que Mickael a signalée le 24/09 (« quand je
// refresh, les modifications sont perdues »). La coupure est
// `rgd_clients_et_demandes_sortent_du_releve`, côté Supabase et non côté
// worker, pour les trois raisons désormais habituelles : aucun déploiement à
// orchestrer, un ancien worker redéployé ne peut pas ressusciter l'écrasement,
// et c'est le précédent de `push_rgd_pilotage`.
//
// ⚠ CE QUI EST PERDU, ET C'EST LE BUT : une fiche modifiée dans l'application
// RGD n'arrivera plus jamais dans le CRM. Ce qui continue d'arriver est ce que
// le CRM ne saisit pas — l'identité venue de Costructor à la PREMIÈRE reprise,
// les colonnes `*_extra`, les affaires.
//
// ⚠ ET UN EFFET DE BORD EST PERDU AVEC : changer un statut ne pousse plus les
// champs portables vers Costructor, et n'envoie plus d'email à l'apporteur.
// Le premier est une décision de Mickael — la base de référence est celle du
// CRM, celle de Costructor « était un peu fausse finalement ». Le second est
// inerte : `apporteur_id` est nul sur les 192 fiches.
//
// ⚠ POURQUOI LA SUPPRESSION PASSE PAR UNE FONCTION DE BASE, alors que le
// statut et la note s'écrivent en direct : **le relevé n'efface jamais rien**.
// `push_rgd` et ses sœurs ne font que des `insert … on conflict do update`, donc
// une ligne effacée ici seulement reviendrait au passage suivant, avec son
// ancien statut. Il faut donc une PIERRE TOMBALE — une ligne dans
// `rgd_suppressions` que les deux portes du relevé consultent avant d'insérer.
// Effacer et poser la pierre sont deux écritures qui doivent réussir ou échouer
// ensemble : d'où la fonction. C'est le même geste que le worker faisait de son
// côté avec `costructor_contacts_ignored`.
import { db } from './db.js';

const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });

/**
 * Le commentaire libre d'une fiche.
 *
 * Deux tables, deux noms de colonne — `notes` pour un client,
 * `commentaire_admin` pour une demande du site. Ce sont les noms d'origine, et
 * les renommer aurait cassé la lecture de l'écran pour un gain nul.
 *
 * `cible` vaut `'demande'` ou autre chose, comme partout dans cet espace.
 */
export async function majNote({ uuid, cible, valeur }) {
  const table = cible === 'demande' ? 'rgd_demandes' : 'rgd_clients';
  const champ = cible === 'demande' ? 'commentaire_admin' : 'notes';
  try {
    await db.update(table, uuid, { [champ]: valeur });
    return { ok: true };
  } catch (e) { return echec(e); }
}

/**
 * Supprimer une fiche pour de bon, pierre tombale comprise.
 *
 * `source` vaut `'clients'` ou `'demandes'` — ce sont les noms que la fonction
 * de base attend, et elle refuse tout le reste plutôt que de deviner.
 *
 * ⚠ ELLE NE TOUCHE PAS AU CONTACT : celui-ci est partagé par les quatre
 * structures et s'archive, il ne se supprime pas. L'appelant s'en charge.
 *
 * Rend `{ ok, donnees }`, où `donnees.marquee` dit si une pierre a été posée —
 * elle ne l'est que pour une fiche qui venait de l'application RGD. Une fiche
 * née ici n'a rien à empêcher de revenir.
 */
export async function supprimerFicheRgd(source, id) {
  try {
    const r = await db.rpc('rgd_supprimer_fiche', { p_source: source, p_id: id });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) { return echec(e); }
}
