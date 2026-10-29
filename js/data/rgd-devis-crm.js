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
  envoye: { label: 'Envoyé', ton: 'amber' },
  signe: { label: 'Signé', ton: 'green' },
  refuse: { label: 'Refusé', ton: 'red' },
};

// `ml` (mètre linéaire) depuis le 29/10/2026 : le passage des câbles.
export const UNITES = { forfait: 'u', heure: 'h', m2: 'm²', ml: 'ml' };
export const PAR_UNITE = { heure: '/h', m2: '/m²', ml: '/ml' };

export const METIERS = { electricite: 'Électricité' };
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
const numeroDemo = () => {
  const an = new Date().getFullYear();
  const n = db.t('rgd_devis_crm').filter(d => String(d.numero || '').startsWith(`DE${an}-`)).length + 1;
  return `DE${an}-${String(n).padStart(4, '0')}`;
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
    code: l.code || null, reference: l.reference || null, metier: l.metier || null, libelle: String(l.libelle || '').trim(),
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
    ...(CONFIG.DEMO ? { numero: numeroDemo(), date_devis: new Date().toISOString().slice(0, 10) } : {}),
  });
}

export const changerStatutDevisCrm = (d, statut) => db.update('rgd_devis_crm', d.id, {
  statut,
  ...(statut === 'signe' && !d.date_signature ? { date_signature: new Date().toISOString().slice(0, 10) } : {}),
});

export const supprimerDevisCrm = (d) => db.remove('rgd_devis_crm', d.id);
