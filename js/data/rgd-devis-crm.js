// Les devis faits dans le CRM, à partir de la grille des tarifs (29/10/2026)
//
// Demandé par Élodie : « je viens d'avoir le tableau pour la tarification des
// prestations électriques dans le sud. Le but c'est de pouvoir faire des devis
// directement depuis le CRM avec les prestations et les tarifs donnés » — pour
// Franck d'abord. TVA à 10 % par défaut.
//
// ⚠ CE NE SONT PAS LES DEVIS COSTRUCTOR. Ceux-là vivent dans `rgd_devis`, que
// la synchronisation réécrit toutes les 30 minutes : un devis né ici y serait
// un second écrivain sur la même table. Les devis du CRM ont leur table,
// `rgd_devis_crm`, et leur numérotation (DE2026-0001, quand Costructor écrit
// D2026…) — aucun numéro ne peut désigner les deux.
//
// ⚠ LES MONTANTS SONT CALCULÉS PAR LA BASE, PAS PAR L'ÉCRAN. Le déclencheur
// `rgd_devis_crm_calcul` refait HT, TVA et TTC depuis les lignes à chaque
// écriture, pose le numéro et verrouille le contenu d'un devis signé. `totaux`
// ci-dessous dit la même chose pour l'affichage et pour le mode démo, qui n'a
// pas de base : si l'un change, l'autre change.
//
// ⚠ LA GRILLE VIT DANS `rgd_tarifs`, PAS DANS CE FICHIER. Le dépôt est public
// et Mickael change un prix sans déploiement. Elle est rangée par métier : une
// seconde grille (plomberie, peinture…) s'ajoute en base et cet écran la
// propose sans une ligne de code de plus.
import { db } from './db.js';
import { scope } from './scope.js';
import { CONFIG } from '../config.js';

export const TVA = [10, 20, 5.5];
export const TVA_DEFAUT = 10;

// ------------------------------------------------ devis ou facture
// Élodie, le 02/11/2026 : « je voudrais distinguer deux choses, les factures
// acquittées pour des dépannages et des travaux fait directement sur place, et
// des travaux à faire plus tard et ce sera plus un devis puisqu'il n'y aura pas
// de paiement au premier rdv […] On peut mettre un système avec une date de
// reglement pour savoir si c'est une facture acquittée ou une facture/devis ».
//
// ⚠ LA DATE DE RÈGLEMENT NE PEUT PAS PORTER CETTE DISTINCTION, et c'est ce qui
// a décidé du reste : elle dit si un document est PAYÉ, pas ce qu'il EST. Un
// dépannage réglé par virement deux jours plus tard a lui aussi un `regle_le`
// vide pendant deux jours — il serait lu comme « travaux à venir ». La nature
// du document se CHOISIT à la création ; `regle_le` garde exactement son rôle
// d'avant, acquittée ou due.
//
// ⚠ ET ON NE FACTURE PAS DES TRAVAUX QUI N'ONT PAS EU LIEU (l'autre branche
// qu'elle envisageait, « ou alors il faut facturer au premier rdv ») : une
// facture émise prend un numéro dans une suite sans trou et rend la TVA
// exigible. Si le chantier ne se fait pas, il faut un avoir pour l'annuler. Un
// devis, lui, n'engage que le prix et s'abandonne sans rien.
export const GENRES = {
  facture: {
    label: 'Facture', pluriel: 'Factures', le: 'la facture', cette: 'cette facture',
    nouveau: 'Nouvelle facture', signer: 'Faire signer',
    aide: 'Dépannage ou travaux faits sur place, réglés à la fin de l’intervention.',
  },
  devis: {
    label: 'Devis', pluriel: 'Devis', le: 'le devis', cette: 'ce devis',
    nouveau: 'Nouveau devis', signer: 'Faire accepter',
    aide: 'Travaux à faire plus tard : rien n’est dû au premier rendez-vous.',
  },
};

/** Le genre d'un document. Une ligne d'avant le 02/11 n'en porte pas : facture. */
export const genreDe = (d) => (d && d.genre === 'devis' ? 'devis' : 'facture');
export const estDevis = (d) => genreDe(d) === 'devis';
/** « Facture » / « Devis », pour un titre. */
export const motDoc = (d) => GENRES[genreDe(d)].label;
/** « la facture » / « le devis », pour une phrase. */
export const leDoc = (d) => GENRES[genreDe(d)].le;

// ⚠ UN DEVIS N'EST PAS « SIGNÉ », IL EST ACCEPTÉ — et un devis refusé est
// refusé, pas « annulé ». Les clés en base ne bougent pas (`signe`, `refuse`,
// et la contrainte `rgd_devis_crm_statut_check` les impose) : ce sont les mots
// LUS qui suivent le document. Un même écran dirait sinon « facture signée »
// d'un devis que le client a seulement accepté.
const STATUTS_FACTURE = {
  brouillon: { label: 'Brouillon', ton: 'muted' },
  envoye: { label: 'Envoyée', ton: 'amber' },
  signe: { label: 'Signée', ton: 'green' },
  refuse: { label: 'Annulée', ton: 'red' },
};
const STATUTS_DEVIS = {
  brouillon: { label: 'Brouillon', ton: 'muted' },
  envoye: { label: 'Envoyé', ton: 'amber' },
  signe: { label: 'Accepté', ton: 'green' },
  refuse: { label: 'Refusé', ton: 'red' },
};
export const statutsDe = (genre) => (genre === 'devis' ? STATUTS_DEVIS : STATUTS_FACTURE);
/** L'étiquette du statut d'un document, dans les mots de son genre. */
export const statutDoc = (d) => statutsDe(genreDe(d))[d.statut] || statutsDe(genreDe(d)).brouillon;

// `ml` (mètre linéaire) depuis le 29/10/2026 : le passage des câbles.
export const UNITES = { forfait: 'u', heure: 'h', m2: 'm²', ml: 'ml' };

// Les moyens de paiement, tels qu'ils s'impriment sur une facture acquittée.
// La clé est ce qui va en base, la valeur ce que lit le client.
export const MOYENS_PAIEMENT = {
  especes: 'espèces',
  cheque: 'chèque',
  carte: 'carte bancaire',
  virement: 'virement',
};
export const PAR_UNITE = { heure: '/h', m2: '/m²', ml: '/ml' };

export const METIERS = { electricite: 'Électricité' };

// ⚠ LES PRESTATIONS SONT RANGÉES PAR CATÉGORIE (29/10/2026, Élodie : « je
// voudrais que ce soit plus clair visuellement, sépare les prestations »). La
// catégorie vit sur le tarif (`rgd_tarifs.categorie`) et chaque ligne de devis
// en garde une copie, comme le libellé et le prix : un devis se relit tel
// qu'il a été fait. Une ligne libre, ou un tarif sans catégorie, tombe dans
// « Autres », toujours en dernier.
export const AUTRES = 'Autres';

/** La catégorie d'une ligne : sa copie, sinon celle de son tarif, sinon « Autres ». */
export function categorieDe(l) {
  if (l.categorie) return l.categorie;
  const t = l.code ? db.t('rgd_tarifs').find(x => x.code === l.code && (!l.metier || x.metier === l.metier)) : null;
  return t?.categorie || AUTRES;
}

// La place d'une catégorie : celle de sa première prestation dans la grille.
// Les lignes d'un devis se rangent ainsi dans le même ordre que la grille, et
// non dans l'ordre où l'on a cliqué.
const rangCategorie = (c) => {
  const ordres = db.t('rgd_tarifs').filter(t => t.categorie === c).map(t => Number(t.ordre) || 0);
  return ordres.length ? Math.min(...ordres) : Infinity;
};

/**
 * Regroupe une liste par catégorie, dans l'ordre de la grille ; dans une
 * catégorie, les éléments gardent leur ordre. « Autres » ferme la marche.
 * Rend [{ categorie, items: [{ item, i }] }] — `i` est l'index d'origine.
 */
export function parCategorie(liste, lire = categorieDe) {
  const groupes = new Map();
  liste.forEach((item, i) => {
    const c = lire(item) || AUTRES;
    if (!groupes.has(c)) groupes.set(c, []);
    groupes.get(c).push({ item, i });
  });
  const tous = [...groupes].map(([categorie, items]) => ({ categorie, items }))
    .sort((x, y) => rangCategorie(x.categorie) - rangCategorie(y.categorie));
  return [...tous.filter(g => g.categorie !== AUTRES), ...tous.filter(g => g.categorie === AUTRES)];
}
export const nomMetier = (m) => METIERS[m] || m;

const arrondi = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** La grille d'un métier, dans l'ordre où elle se lit. */
export const tarifsDe = (metier) => db.t('rgd_tarifs')
  .filter(t => t.actif !== false && t.metier === metier)
  .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

/** Les métiers qui ont une grille : c'est ce que l'écran propose. */
export const metiersAvecGrille = () =>
  [...new Set(db.t('rgd_tarifs').filter(t => t.actif !== false).map(t => t.metier))];

/** HT, TVA et TTC — miroir exact de `rgd_devis_crm_calcul`. */
export function totaux(lignes, taux = TVA_DEFAUT) {
  const ht = arrondi((lignes || []).reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_ht) || 0), 0));
  const tva = arrondi(ht * Number(taux) / 100);
  return { ht, tva, ttc: arrondi(ht + tva) };
}

/**
 * Le prix le plus bas qu'une ligne peut porter. Un « Dès 119 € » se monte, il
 * ne se baisse pas ; une variante choisie (2 rangées) fixe son propre plancher.
 * Une ligne libre n'en a pas.
 */
export function plancher(ligne) {
  const t = ligne.code ? db.t('rgd_tarifs').find(x => x.code === ligne.code && x.metier === ligne.metier) : null;
  if (!t) return 0;
  const v = (t.variantes || []).find(x => x.libelle === ligne.variante);
  return Number(v ? v.prix_ht : t.prix_ht) || 0;
}

/** Une ligne de devis tirée de la grille. `surface` sert aux prix au m². */
export function ligneDepuisTarif(t, { surface = null } = {}) {
  const v = (t.variantes || [])[0] || null;
  return {
    code: t.code,
    reference: t.reference || null,
    categorie: t.categorie || null,
    metier: t.metier,
    libelle: t.libelle,
    precision: t.precision || '',
    variante: v ? v.libelle : null,
    unite: t.unite,
    quantite: t.unite === 'm2' ? (Number(surface) || 1) : 1,
    prix_ht: Number(v ? v.prix_ht : t.prix_ht),
  };
}

/** Les devis du CRM d'une fiche (client ou demande), le plus récent d'abord. */
export function devisCrmDe(x) {
  const f = x.ligne;
  return scope.rgd('rgd_devis_crm')
    .filter(d => (x.genre === 'fiche' ? d.fiche_id === f.id : d.demande_id === f.id)
      || (!!f.contact_id && d.contact_id === f.contact_id)
      || (!!f.organisation_id && d.organisation_id === f.organisation_id))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// En démo, aucune base ne pose le numéro : on l'imite, pour que l'écran et le
// PDF se lisent comme en production.
//
// ⚠ UN BROUILLON N'A PAS DE NUMÉRO, ici comme en production : une facture
// reçoit le sien en SORTANT du brouillon, sans quoi un brouillon abandonné
// laisserait un trou dans une suite qui ne doit pas en avoir.
//
// ⚠ DEUX SUITES, PAS UNE, ici comme en production : un devis qui puiserait
// dans la numérotation des factures y creuserait un trou à chaque fois —
// précisément ce qu'une numérotation continue interdit. Les factures sont
// `FA<an>-<rang>`, les devis `DV<an>-<rang>`. Le préfixe est « DV » et non
// « DE » parce que Costructor écrit `D2026-…` dans `rgd_devis` : à l'œil nu,
// `DE2026-…` se lirait comme l'un des siens.
const numeroDemo = (statut, genre) => {
  if (statut === 'brouillon') return null;
  const pre = genre === 'devis' ? 'DV' : 'FA';
  const an = new Date().getFullYear();
  const n = db.t('rgd_devis_crm').filter(d => String(d.numero || '').startsWith(`${pre}${an}-`)).length + 1;
  return `${pre}${an}-${String(n).padStart(4, '0')}`;
};

/**
 * Créer ou modifier un devis. `x` est la fiche telle que l'écran la tient.
 *
 * ⚠ LE DEVIS PREND LE PROPRIÉTAIRE DE LA FICHE, pas celui qui le tape : quand
 * Mickael chiffre un dossier de Franck, c'est Franck qui doit le voir. Une
 * fiche sans propriétaire donne le devis à son auteur.
 */
export async function enregistrerDevisCrm(x, valeurs, existant = null) {
  const f = x.ligne;
  const lignes = (valeurs.lignes || []).map(l => ({
    code: l.code || null, reference: l.reference || null, categorie: l.code ? categorieDe(l) : AUTRES,
    metier: l.metier || null, libelle: String(l.libelle || '').trim(),
    precision: String(l.precision || '').trim(), variante: l.variante || null, unite: l.unite || 'forfait',
    quantite: Number(l.quantite) || 0, prix_ht: arrondi(l.prix_ht),
  })).filter(l => l.libelle);
  const t = totaux(lignes, valeurs.tva_taux);
  const commun = {
    objet: String(valeurs.objet || '').trim() || null,
    lignes,
    tva_taux: Number(valeurs.tva_taux) || TVA_DEFAUT,
    validite_jours: Number(valeurs.validite_jours) || 30,
    notes: String(valeurs.notes || '').trim() || null,
    montant_ht: t.ht, montant_tva: t.tva, montant_ttc: t.ttc,
  };
  if (existant) return db.update('rgd_devis_crm', existant.id, commun);
  const moi = scope.user?.id || null;
  return db.insert('rgd_devis_crm', {
    ...commun,
    metier: valeurs.metier || 'electricite',
    fiche_id: x.genre === 'fiche' ? f.id : null,
    demande_id: x.genre === 'demande' ? f.id : null,
    contact_id: f.contact_id || null,
    organisation_id: f.organisation_id || null,
    owner_id: (scope.isDirection ? f.owner_id : null) || moi,
    statut: 'brouillon',
    // ⚠ LE GENRE NE SE DONNE QU'À LA CRÉATION. La base refuse de le changer
    // une fois le numéro attribué : il viendrait d'une suite qui n'est plus la
    // bonne. On ne le repasse donc pas dans `commun`, qui sert aussi aux
    // modifications.
    genre: valeurs.genre === 'devis' ? 'devis' : 'facture',
    ...(CONFIG.DEMO ? { numero: numeroDemo(valeurs.statut || 'brouillon', valeurs.genre), date_devis: new Date().toISOString().slice(0, 10) } : {}),
  });
}

/**
 * Les travaux du devis sont faits : on en établit la facture.
 *
 * ⚠ ON CRÉE UNE FACTURE, ON NE CONVERTIT PAS LE DEVIS. Le basculer lui ferait
 * porter un numéro `DV` dans la suite des factures, et surtout effacerait la
 * preuve de son acceptation — c'est le document que le client a signé AVANT
 * les travaux, celui qu'on ressort si le prix est contesté. Les deux
 * coexistent : le devis reste accepté, la facture naît à côté et le cite
 * (`issu_de`).
 *
 * ⚠ ELLE NAÎT EN BROUILLON, DONC SANS NUMÉRO, et ce n'est pas une étape de
 * plus pour rien : les travaux diffèrent presque toujours un peu du devis — une
 * prise en plus, une heure de moins. On corrige, puis on émet.
 */
export async function facturerLeDevis(d) {
  const lignes = structuredClone(d.lignes || []);
  const t = totaux(lignes, d.tva_taux);
  return db.insert('rgd_devis_crm', {
    genre: 'facture',
    issu_de: d.id,
    objet: d.objet || null,
    lignes,
    tva_taux: Number(d.tva_taux) || TVA_DEFAUT,
    validite_jours: Number(d.validite_jours) || 30,
    notes: d.notes || null,
    metier: d.metier || 'electricite',
    fiche_id: d.fiche_id || null,
    demande_id: d.demande_id || null,
    contact_id: d.contact_id || null,
    organisation_id: d.organisation_id || null,
    owner_id: d.owner_id || scope.user?.id || null,
    statut: 'brouillon',
    // En démonstration, aucun déclencheur ne refait les montants.
    ...(CONFIG.DEMO
      ? { montant_ht: t.ht, montant_tva: t.tva, montant_ttc: t.ttc, date_devis: new Date().toISOString().slice(0, 10) }
      : {}),
  });
}

// ⚠ CES DEUX-LÀ LISENT `db.t`, PAS `scope.rgd`, ET LE CONTRAIRE A ÉTÉ MESURÉ :
// `scope.rgd` applique la VUE choisie dans l'en-tête de l'espace (regarder
// comme tel chargé d'affaires), et elle rendait ZÉRO ligne sur un devis
// appartenant à quelqu'un d'autre — alors que le document était ouvert à
// l'écran. Conséquences : la facture n'annonçait plus de quel devis elle
// venait, et surtout le devis reproposait « Établir la facture » alors qu'elle
// existait déjà. On aurait facturé deux fois les mêmes travaux.
//
// La base reste le vrai garde : `rgd_voit_ligne(owner_id)` ne rend à personne
// ce qu'il n'a pas le droit de voir. Une préférence d'affichage n'a pas à
// rompre le lien entre deux documents qu'on a déjà sous les yeux.
/** La facture née de ce devis, s'il en existe une. */
export const factureDuDevis = (d) => db.t('rgd_devis_crm').find(f => f.issu_de === d.id) || null;

/** Le devis dont cette facture est née, s'il y en a un. */
export const devisDeLaFacture = (f) => (f.issu_de
  ? db.t('rgd_devis_crm').find(d => d.id === f.issu_de) || null
  : null);

export const changerStatutDevisCrm = (d, statut) => db.update('rgd_devis_crm', d.id, {
  statut,
  ...(statut === 'signe' && !d.date_signature ? { date_signature: new Date().toISOString().slice(0, 10) } : {}),
});

export const supprimerDevisCrm = (d) => db.remove('rgd_devis_crm', d.id);

/**
 * La facture est réglée : elle cesse de réclamer.
 *
 * ⚠ ON DATE DU JOUR, PAS DE LA FACTURE. Le règlement a lieu quand on le
 * constate ; une facture d'hier payée aujourd'hui porte la date d'aujourd'hui,
 * sinon la mention d'acquittement dirait faux.
 */
export const marquerReglee = (d, moyen) => db.update('rgd_devis_crm', d.id, {
  regle_le: new Date().toISOString().slice(0, 10),
  regle_par: moyen || null,
});

/**
 * Le bon d'attachement signé par le client, sur place.
 *
 * ⚠ SA SIGNATURE EST DISTINCTE DE CELLE DE LA FACTURE, et ce n'est pas une
 * lourdeur : le bon CONSTATE des temps et des fournitures, la facture RÉCLAME
 * une somme. Une seule signature reportée sur les deux ne prouverait ni l'un
 * ni l'autre — et c'est précisément le bon d'attachement qu'on produit en cas
 * de contestation sur les heures.
 */
export const signerBonAttachement = (d, { signature, nom }) => db.update('rgd_devis_crm', d.id, {
  bon_signature: signature,
  bon_signe_par: String(nom || '').trim() || null,
  bon_signe_a: new Date().toISOString(),
});

/** Un clic malheureux se défait : la facture redevient due, échéance comprise. */
export const annulerReglement = (d) =>
  db.update('rgd_devis_crm', d.id, { regle_le: null, regle_par: null });

// ------------------------------------------ la signature de RGD Renova
// Élodie, le 02/11/2026 : « on pourrait mettre en place la signature sur la
// facture numérique avant de l'envoyer au client ». Jusqu'ici une facture
// envoyée par mail partait avec le bloc « Pour RGD Renova » VIDE : une ligne
// à remplir à la main sur un document que personne n'imprime.
//
// ⚠ ELLE VIT DANS `rgd_reglages`, ET C'EST TOUT L'INTÉRÊT : cette table se
// LIT avec l'activité RGD — donc Franck aussi — et ne s'ÉCRIT que par la
// direction. La signature de l'entreprise se pose donc UNE fois, par Élodie
// ou Mickael, et toutes les factures la portent, y compris celles que Franck
// envoie depuis son téléphone. Aucune policy à créer : `settings`, l'autre
// candidat, ne se lit QUE par la direction, et les factures de Franck seraient
// parties sans rien.
//
// ⚠ CE N'EST PAS LA SIGNATURE DU CLIENT. Celle-là se trace sur place, à la
// fin de l'intervention, et vit dans la facture elle-même (`signature`).
// Celle-ci est l'engagement de l'entreprise, apposée d'avance sur le document.
const CLE_SIGNATURE_RGD = 'signature_facture';

/** La signature de l'entreprise : `{ image, nom, le }`, ou `null`. */
export function signatureRgd() {
  const brut = db.t('rgd_reglages').find(r => r.cle === CLE_SIGNATURE_RGD)?.valeur;
  if (!brut) return null;
  try {
    const v = typeof brut === 'string' ? JSON.parse(brut) : brut;
    return v && v.image ? v : null;
  } catch {
    // Une valeur illisible ne doit pas emporter le document : la facture sort
    // sans signature, comme avant, plutôt que de ne pas sortir du tout.
    return null;
  }
}

// ⚠ ON RECHARGE LA TABLE APRÈS AVOIR ÉCRIT. `db.insert` et `db.update`
// envoient à Supabase et rendent la ligne, mais ne touchent PAS au cache que
// `db.t` relit — l'écran des réglages le contourne en recopiant à la main. Sans
// ce rechargement, le document continuerait à sortir sans signature jusqu'au
// prochain chargement de l'application, et on croirait l'enregistrement perdu.
export async function enregistrerSignatureRgd({ image, nom, w, h }) {
  const valeur = JSON.stringify({ image, nom: String(nom || '').trim(), w: w || null, h: h || null, le: new Date().toISOString() });
  const existe = db.t('rgd_reglages').some(r => r.cle === CLE_SIGNATURE_RGD);
  if (existe) await db.update('rgd_reglages', CLE_SIGNATURE_RGD, { valeur });
  else await db.insert('rgd_reglages', { cle: CLE_SIGNATURE_RGD, valeur });
  await db.recharger('rgd_reglages');
}

/** On efface la valeur, on ne supprime pas la ligne : le réglage reste visible. */
export async function retirerSignatureRgd() {
  await db.update('rgd_reglages', CLE_SIGNATURE_RGD, { valeur: null });
  await db.recharger('rgd_reglages');
}

/**
 * La facture signée par le client, sur place, au doigt.
 *
 * ⚠ SIGNER, C'EST ÉMETTRE. Le passage en `signe` fait sortir la facture du
 * brouillon, et c'est à cet instant que la base lui donne son numéro
 * définitif (voir le trigger `rgd_devis_crm_calcul`). Après quoi son contenu
 * ne se modifie plus : c'est ce que le client a reconnu avoir reçu.
 *
 * ⚠ `signe_par` N'EST PAS LE NOM DE LA FICHE. Celui qui signe n'est pas
 * toujours le titulaire du dossier — un conjoint, un gardien, un locataire. On
 * enregistre le nom tel qu'il a été confirmé devant le client, pas celui qu'on
 * avait déjà.
 */
export const signerSurPlace = (d, { signature, signe_par }) => db.update('rgd_devis_crm', d.id, {
  signature,
  // En démo, c'est ici qu'on imite ce que le trigger fait en production :
  // sortir du brouillon donne son numéro à la facture.
  ...(CONFIG.DEMO && !d.numero ? { numero: numeroDemo('signe', genreDe(d)) } : {}),
  signe_par: String(signe_par || '').trim() || null,
  signe_a: new Date().toISOString(),
  statut: 'signe',
  ...(d.date_signature ? {} : { date_signature: new Date().toISOString().slice(0, 10) }),
});

// ------------------------------------------------------ l'envoi par mail
// ⚠ IL PART PAR `envoyer-email`, LA MÊME PORTE QUE LES RELANCES : même
// expéditeur (contact@rgdrenova.fr), même fournisseur. La réponse du client
// revient à contact@rgdrenova.fr.
//
// ⚠ ENVELOPPE DE MARQUE, PAS LA SOBRE : Élodie a fixé le périmètre de la sobre
// (les trois relances et la demande d'avis) et demande qu'on ne l'élargisse
// pas sans elle. La question lui est posée le 29/10 ; d'ici sa réponse, le
// devis part dans l'enveloppe par défaut.
//
// ⚠ CE N'EST PAS LA RELANCE AUTOMATIQUE J+3/8/15 : celle-ci ne suit que les
// devis Costructor (`rgd_devis`). Un devis du CRM envoyé ici ne sera relancé
// par personne d'autre que Franck ou Mickael.

/**
 * Le message par défaut, modifiable avant l'envoi.
 *
 * ⚠ PAS DE DÉLAI DE PAIEMENT DANS CE MAIL (02/11/2026, Élodie : « la facture
 * arrive au moment du paiement, le paiement se fait directement sur place à la
 * fin de la prestation avec le client »). « À régler sous 30 jours » réclamait
 * donc un paiement DÉJÀ REÇU : au mieux on passe pour désorganisé, au pire le
 * client paie une seconde fois.
 *
 * ⚠ LE PDF, LUI, PORTE ENCORE « À régler avant le … » ET LES PÉNALITÉS DE
 * RETARD. Ces mentions ne sont pas des formules : les retirer ou les remplacer
 * par « facture acquittée » change la nature du document. La question est posée
 * à Élodie le 02/11 ; d'ici sa réponse, le PDF est inchangé et seul le mail
 * cesse de réclamer.
 */
export function messageDevisCrm(devis, nomClient) {
  const salut = nomClient ? `Bonjour ${nomClient},` : 'Bonjour,';
  const montant = Number(devis.montant_ttc || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // ⚠ UN DEVIS NE REMERCIE PAS DE LA CONFIANCE, IL ATTEND UNE RÉPONSE. Le même
  // texte pour les deux donnait à un devis le ton d'une affaire conclue — et
  // taisait la seule chose qui compte au client à cet instant : jusqu'à quand
  // le prix tient, et comment il dit oui.
  if (estDevis(devis)) {
    return `${salut}

Vous trouverez ci-joint votre devis n° ${devis.numero || ''} d’un montant de ${montant} € TTC.

Ce devis est valable ${Number(devis.validite_jours) || 30} jours. Pour lancer les travaux, retournez-le nous signé, ou confirmez-nous simplement votre accord par retour de mail.

Nous restons à votre disposition pour toute question.

Bien cordialement,
L’équipe RGD Renova`;
  }
  return `${salut}

Vous trouverez ci-joint votre facture n° ${devis.numero || ''} d’un montant de ${montant} € TTC.

Nous vous remercions de votre confiance.

Nous restons à votre disposition pour toute question.

Bien cordialement,
L’équipe RGD Renova`;
}

const echappe = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Le texte tapé devient des paragraphes : une ligne vide sépare deux blocs.
const enParagraphes = (t) => String(t || '').trim().split(/\n\s*\n/)
  .map(p => `<p>${echappe(p).replace(/\n/g, '<br>')}</p>`);

/**
 * Le bouton qui ouvre la facture.
 *
 * Élodie, le 02/11/2026 : « je voudrais que tu rajoutes un bouton pour cliquer
 * et avoir la facture. Le fait qu'elle soit en bas, je ne trouve pas ça
 * intuitif. »
 *
 * ⚠ EN CONTOUR, JAMAIS EN APLAT. Mesuré sur les envois de RGD : un bouton
 * plein part en indésirables, le même en contour arrive en boîte de réception.
 * Une facture dans les spams, c'est un client qui ne paie pas et une relance
 * pour rien.
 *
 * ⚠ STYLES EN LIGNE ET `<table>` : les clients mail ignorent les feuilles de
 * style, et Outlook ne centre pas un bloc autrement.
 */
const boutonFacture = (lien, mot = 'ma facture') => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
  <tr><td style="border:2px solid #FC5D00;border-radius:8px">
    <a href="${echappe(lien)}" style="display:inline-block;padding:12px 26px;color:#FC5D00;text-decoration:none;font-weight:700;font-family:Arial,Helvetica,sans-serif;font-size:15px">Voir ${echappe(mot)}</a>
  </td></tr></table>`;

/**
 * Le corps du mail : les paragraphes, et le bouton POSÉ JUSTE APRÈS LA PHRASE
 * QUI ANNONCE LA FACTURE — pas à la fin. C'était tout le reproche : ce qui
 * compte ne doit pas être en bas.
 */
const corpsMail = (texte, lien, mot) => {
  const blocs = enParagraphes(texte);
  if (!lien) return blocs.join('');
  // Le premier bloc est la salutation, le second annonce la facture. Si le
  // texte a été réécrit et tient en un bloc, le bouton le suit quand même.
  blocs.splice(Math.min(2, blocs.length), 0, boutonFacture(lien, mot));
  return blocs.join('');
};

/**
 * Envoyer le devis. `pdf` vient de `pdfDevisCrm` : { base64, nom }.
 * Rend { ok } ou { ok: false, motif }. Un brouillon passe en « Envoyé ».
 */
export async function envoyerDevisCrm(devis, { a, nom, objet, message, copie }, pdf) {
  if (CONFIG.DEMO) return { ok: false, motif: 'Mode démonstration : aucun mail ne part.' };
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };

  // ⚠ LE DÉPÔT NE DOIT PAS POUVOIR EMPÊCHER L'ENVOI. Le bouton est un confort ;
  // la facture, elle, part en PIÈCE JOINTE quoi qu'il arrive. Un seau plein,
  // une coupure, une policy modifiée — on perd le bouton, pas le mail.
  //
  // ⚠ UN AN, PARCE QUE CE LIEN PART CHEZ LE CLIENT et qu'on ne peut pas le
  // régénérer dans sa boîte. Il finira par expirer, et c'est sans gravité : la
  // pièce jointe, elle, ne s'éteint jamais.
  let lien = null;
  try {
    const octets = Uint8Array.from(atob(pdf.base64), (c) => c.charCodeAt(0));
    // ⚠ MÊME SEAU POUR LES DEUX, ET C'EST VOULU : le nom du fichier est l'`id`
    // du document, qui est unique dans toute la table. Un second seau aurait
    // demandé une seconde policy, pour ranger des PDF que personne ne liste
    // par dossier.
    const chemin = `${devis.id}.pdf`;
    await db.uploadFile(chemin, new Blob([octets], { type: 'application/pdf' }),
      { bucket: 'factures', upsert: true });
    lien = await db.fileUrl(chemin, { bucket: 'factures', secondes: 31536000 });
  } catch (e) {
    console.warn('[RGD] facture non déposée, le mail part sans bouton :', e.message);
  }
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/envoyer-email`, {
      method: 'POST',
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: { email: a, name: nom || a },
        subject: objet,
        html: corpsMail(message, lien, estDevis(devis) ? 'mon devis' : 'ma facture'),
        replyTo: { email: 'contact@rgdrenova.fr', name: 'RGD Renova' },
        ...(copie ? { bcc: [{ email: 'contact@rgdrenova.fr', name: 'RGD Renova' }] } : {}),
        attachment: [{ name: pdf.nom, content: pdf.base64 }],
      }),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok || rep.ok === false) return { ok: false, motif: rep.detail || rep.erreur || `Erreur ${r.status}` };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
  // Le mail est parti : une trace qui échoue ne le rend pas non envoyé.
  if (devis.statut === 'brouillon') {
    try { await changerStatutDevisCrm(devis, 'envoye'); } catch (e) { console.warn('[RGD] devis envoyé, statut non changé :', e.message); }
  }
  return { ok: true };
}
