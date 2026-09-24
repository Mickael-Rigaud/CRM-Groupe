// La fiche d'un sous-traitant — les six gestes, écrits dans le CRM
//
// ⚠ SUPABASE EST LA SOURCE DEPUIS LE 24/09/2026 (étapes 2 et 3 de la sortie).
// Jusqu'ici ces six gestes appelaient l'application RGD, et le CRM n'en voyait
// le résultat qu'au relevé suivant — trente minutes plus tard. Ils écrivent
// désormais dans `rgd_sous_traitants` directement, et la ligne bouge à l'écran
// dans la seconde.
//
// ⚠ LES DEUX MOITIÉS DU CHANGEMENT SONT INDISSOCIABLES, et c'est la seule
// chose à retenir avant d'y toucher. Le relevé reposait la version de D1 dans
// cette table toutes les 30 minutes : livrer ces écritures sans couper cette
// porte les aurait fait disparaître dans la demi-heure, sans erreur et sans un
// mot. La coupure est la migration `20260924101553_rgd_st_supabase`, qui fait
// ignorer les charges `sous_traitants` et `st_extra`. L'une ne va pas sans
// l'autre, dans un sens comme dans l'autre.
//
// CE QUI DISPARAÎT AVEC CE MODULE, ET CE QUE ÇA SIMPLIFIE
//   - plus de `d1_id` : une fiche se désigne par son uuid, et une fiche créée
//     ici n'en a pas du tout ;
//   - plus de conversion 0/1 : `actif` est un vrai booléen côté Postgres, là
//     où D1 ne savait pas lier un `true` ;
//   - plus de suppression en deux temps : une seule base, un seul effacement ;
//   - plus de jeton de l'application RGD : le droit est `has_activity('rgd')`,
//     dont `scope.canRgd` est le miroir exact ;
//   - plus d'attente du relevé : une création apparaît immédiatement.
//
// ⚠ CE QUI EST PERDU, ET C'EST VOULU : une fiche modifiée désormais dans
// l'application RGD n'arrivera plus jamais ici. Deux endroits où saisir la
// même fiche, c'est deux vérités — c'est précisément ce qu'on vient de fermer.
import { db } from './db.js';
import { piecesDe } from './rgd-pieces.js';

const TABLE = 'rgd_sous_traitants';

// Les champs que l'écran a le droit d'écrire. Une liste blanche plutôt qu'un
// `...champs` : ce qui passait avant par le worker était filtré par SA liste,
// et rien ne filtre plus rien depuis qu'on écrit en direct. Sans elle, une
// faute de frappe dans un formulaire ferait échouer la requête entière au lieu
// d'être ignorée — pire, un champ du reflet pourrait être écrasé par accident.
const CHAMPS = ['raison_sociale', 'contact_nom', 'email', 'telephone', 'siret',
  'specialites', 'adresse', 'notes'];

const filtrer = (champs) => {
  const out = {};
  for (const k of CHAMPS) if (k in champs) out[k] = champs[k];
  return out;
};

// `updated_at` n'a pas de déclencheur sur cette table : il portait la date du
// relevé, qui l'écrivait lui-même. Il faut donc le poser à la main, sinon une
// fiche modifiée garderait la date de son dernier passage par la synchro.
const horodate = (champs) => ({ ...champs, updated_at: new Date().toISOString() });

const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });

/** Créer une fiche. `statut_relation` dit si c'est un sous-traitant avec qui on
 *  travaille ou un artisan repéré en prospection ; `actif` a pour défaut `true`
 *  côté base. La ligne est visible tout de suite — plus rien à attendre. */
export async function creerSousTraitant(champs) {
  if (!champs.raison_sociale) return { ok: false, motif: 'le nom est obligatoire' };
  try {
    const ligne = {
      ...filtrer(champs),
      statut_relation: champs.statut_relation === 'potentiel' ? 'potentiel' : 'actif',
    };
    return { ok: true, donnees: await db.insert(TABLE, ligne) };
  } catch (e) { return echec(e); }
}

/** Modifier la fiche : coordonnées, corps de métier, commentaires. Le statut
 *  ne passe PAS par là — voir `convertirSt` et `remettreEnProspection`. */
export async function majSousTraitant(id, champs) {
  try {
    return { ok: true, donnees: await db.update(TABLE, id, horodate(filtrer(champs))) };
  } catch (e) { return echec(e); }
}

/** En service ou hors service. ⚠ Un vrai booléen : `actif` est `boolean not
 *  null` en Postgres, le 0/1 qu'exigeait D1 y serait refusé. */
export async function activerSousTraitant(id, actif) {
  try {
    return { ok: true, donnees: await db.update(TABLE, id, horodate({ actif: !!actif })) };
  } catch (e) { return echec(e); }
}

/**
 * Monter un artisan en prospection au rang de sous-traitant actif.
 *
 * ⚠ CE GESTE OUVRE LES OBLIGATIONS DE CONFORMITÉ : à partir de là, l'absence
 * d'attestation de vigilance engage le donneur d'ordre et l'absence de
 * décennale met le sinistre à la charge de RGD Renova. L'écran le dit avant.
 *
 * Le refus « déjà actif » que posait l'ancienne route n'a plus de raison
 * d'être : le bouton n'apparaît que sur un potentiel, et reconvertir un actif
 * ne ferait que réécrire la valeur qu'il porte déjà.
 */
export async function convertirSt(id, champs = {}) {
  try {
    return { ok: true, donnees: await db.update(TABLE, id,
      horodate({ ...filtrer(champs), statut_relation: 'actif' })) };
  } catch (e) { return echec(e); }
}

/** La descente. Symétrique de la montée, et désormais par le même chemin :
 *  l'asymétrie d'avant venait des deux routes du worker, pas du métier. */
export async function remettreEnProspection(id) {
  try {
    return { ok: true, donnees: await db.update(TABLE, id,
      horodate({ statut_relation: 'potentiel' })) };
  } catch (e) { return echec(e); }
}

/**
 * Effacer une fiche, définitivement.
 *
 * ⚠ CE N'EST PLUS UN GESTE À DEUX CÔTÉS. Il fallait effacer D1 puis Supabase,
 * parce que le relevé n'efface jamais rien et aurait laissé la ligne ici pour
 * toujours — ou l'aurait fait revenir. Une seule base, un seul effacement.
 *
 * ⚠ LES PIÈCES PARTENT D'ABORD, ET EXPLICITEMENT — fichier puis ligne.
 * La base a bien un `on delete cascade` sur `rgd_st_pieces`, mais s'en
 * remettre à lui coûterait deux choses : les PDF du seau, que rien d'autre ne
 * désigne et qui resteraient introuvables ; et le cache du navigateur, que la
 * cascade ne peut pas mettre à jour. ⚠ Le mode démo, lui, n'a AUCUNE cascade :
 * s'appuyer dessus ferait diverger la démo de la production, constaté à
 * l'essai — la fiche partait, sa pièce restait. Le `cascade` reste en base
 * comme filet, il n'est pas le chemin normal.
 *
 * Un fichier qui résiste n'annule pas la suppression : mieux vaut un PDF
 * orphelin qu'une fiche qu'on n'arrive pas à effacer.
 */
export async function supprimerSousTraitant(id) {
  for (const piece of Object.values(piecesDe(id))) {
    try { await db.deleteFile(piece.chemin, { bucket: 'sous-traitants' }); }
    catch (e) { console.warn('[RGD] pièce non effacée du stockage :', piece.chemin, e.message); }
    try { await db.remove('rgd_st_pieces', piece.id); }
    catch (e) { console.warn('[RGD] pièce non effacée de la base :', piece.id, e.message); }
  }
  try {
    await db.remove(TABLE, id);
  } catch (e) { return echec(e); }
  return { ok: true };
}
