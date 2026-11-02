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

export const STATUTS_DEVIS_CRM = {
  brouillon: { label: 'Brouillon', ton: 'muted' },
  envoye: { label: 'Envoyée', ton: 'amber' },
  signe: { label: 'Signée', ton: 'green' },
  refuse: { label: 'Annulée', ton: 'red' },
};

// `ml` (mètre linéaire) depuis le 29/10/2026 : le passage des câbles.
export const UNITES = { forfait: 'u', heure: 'h', m2: 'm²', ml: 'ml' };
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
const numeroDemo = (statut) => {
  if (statut === 'brouillon') return null;
  const an = new Date().getFullYear();
  const n = db.t('rgd_devis_crm').filter(d => String(d.numero || '').startsWith(`FA${an}-`)).length + 1;
  return `FA${an}-${String(n).padStart(4, '0')}`;
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
    ...(CONFIG.DEMO ? { numero: numeroDemo(valeurs.statut || 'brouillon'), date_devis: new Date().toISOString().slice(0, 10) } : {}),
  });
}

export const changerStatutDevisCrm = (d, statut) => db.update('rgd_devis_crm', d.id, {
  statut,
  ...(statut === 'signe' && !d.date_signature ? { date_signature: new Date().toISOString().slice(0, 10) } : {}),
});

export const supprimerDevisCrm = (d) => db.remove('rgd_devis_crm', d.id);

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
export async function enregistrerSignatureRgd({ image, nom }) {
  const valeur = JSON.stringify({ image, nom: String(nom || '').trim(), le: new Date().toISOString() });
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
  ...(CONFIG.DEMO && !d.numero ? { numero: numeroDemo('signe') } : {}),
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

/** Le message par défaut, modifiable avant l'envoi. */
export function messageDevisCrm(devis, nomClient) {
  const salut = nomClient ? `Bonjour ${nomClient},` : 'Bonjour,';
  return `${salut}

Vous trouverez ci-joint notre facture n° ${devis.numero || ''} d’un montant de ${Number(devis.montant_ttc || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € TTC, à régler sous ${devis.validite_jours || 30} jours.

Nous vous remercions de votre confiance.

Nous restons à votre disposition pour toute question.

Bien cordialement,
L’équipe RGD Renova`;
}

const echappe = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Le texte tapé devient des paragraphes : une ligne vide sépare deux blocs.
const enParagraphes = (t) => String(t || '').trim().split(/\n\s*\n/)
  .map(p => `<p>${echappe(p).replace(/\n/g, '<br>')}</p>`).join('');

/**
 * Envoyer le devis. `pdf` vient de `pdfDevisCrm` : { base64, nom }.
 * Rend { ok } ou { ok: false, motif }. Un brouillon passe en « Envoyé ».
 */
export async function envoyerDevisCrm(devis, { a, nom, objet, message, copie }, pdf) {
  if (CONFIG.DEMO) return { ok: false, motif: 'Mode démonstration : aucun mail ne part.' };
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/envoyer-email`, {
      method: 'POST',
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: { email: a, name: nom || a },
        subject: objet,
        html: enParagraphes(message),
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
