// Les performances de la fiche d'établissement Google, saisies à la main
// (13/10/2026, demandé par Élodie).
//
// ⚠ IL N'Y A PAS DE RELEVÉ AUTOMATIQUE, ET C'EST UNE DÉCISION D'ÉLODIE, PAS UN
// RESTE À FAIRE. Elle a demandé le raccordement de la fiche de RGD Renova puis
// l'a écarté le même jour : « on a peur qu'ils demandent une vidéo pour valider
// ou autre et on ne veut pas sinon la fiche sera masquée ». Ce qui a été mesuré
// ce jour-là, pour ne pas refaire la recherche :
//   • la note, le nombre d'avis et cinq avis s'obtiennent par l'API Places
//     (New) avec une simple clé, SANS autorisation Google — la facturation doit
//     seulement être activée sur le projet Cloud ;
//   • TOUT LE RESTE, les performances comprises, passe par l'API Business
//     Profile, dont le quota est à ZÉRO tant que Google n'a pas approuvé une
//     demande déposée par un propriétaire ou gestionnaire de la fiche.
// Ne pas reproposer le raccordement sans qu'elle en reparle.
//
// ⚠ LE BESOIN RÉEL ÉTAIT L'ANALYSE, PAS LE RELEVÉ : « le but était d'avoir les
// performances pour faire une analyse ». Les chiffres existent déjà dans
// l'appli Google Business Profile ; ce qui manquait, c'était de pouvoir les
// suivre dans le temps et les mettre en face de Search Console et d'Analytics,
// tous deux déjà raccordés sur le même écran.
//
// ⚠ ET GOOGLE NE LES GARDE QUE SIX MOIS : un mois non saisi à temps est perdu.
// C'est la raison d'être de cette table, et l'écran le dit.

import { db } from './db.js';

/** Les six compteurs de la section « Performances », dans l'ordre de l'appli. */
export const COMPTEURS = [
  { cle: 'vues_recherche', label: 'Vues sur la recherche Google', vue: true,
    aide: 'Personnes qui ont vu la fiche dans les résultats de recherche Google.' },
  { cle: 'vues_maps', label: 'Vues sur Google Maps', vue: true,
    aide: 'Personnes qui ont vu la fiche dans Maps.' },
  { cle: 'appels', label: 'Appels', action: true,
    aide: 'Appuis sur le bouton d’appel de la fiche. Compté seulement si un numéro y figure.' },
  { cle: 'itineraires', label: 'Demandes d’itinéraire', action: true,
    aide: 'Personnes qui ont demandé la route vers l’adresse.' },
  { cle: 'clics_site', label: 'Clics vers le site', action: true,
    aide: 'Appuis sur le lien du site depuis la fiche.' },
  { cle: 'messages', label: 'Messages', action: true,
    aide: 'Messages envoyés depuis la fiche. À laisser vide si la messagerie n’est pas activée.' },
];

const VUES = COMPTEURS.filter(c => c.vue).map(c => c.cle);
const ACTIONS = COMPTEURS.filter(c => c.action).map(c => c.cle);

/* ------------------------------------------------------------------ le mois */

/** « 2026-09 » → « septembre 2026 ». */
export function libelleMois(mois) {
  const [a, m] = String(mois || '').split('-').map(Number);
  if (!a || !m) return String(mois || '');
  return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/** « 2026-09 » → « sept. 2026 », pour les axes et les cellules étroites. */
export function moisCourt(mois) {
  const [a, m] = String(mois || '').split('-').map(Number);
  if (!a || !m) return String(mois || '');
  return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

/**
 * Le mois le plus récent qu'on puisse saisir, c'est-à-dire le dernier COMPLET.
 *
 * ⚠ LE MOIS EN COURS N'EST JAMAIS PROPOSÉ : Google en donne les chiffres au
 * jour où on regarde, donc une saisie faite le 5 mettrait quatre jours dans une
 * barre mensuelle — elle se lirait comme un effondrement. Même règle que la
 * courbe de CA de RGD, qui ne trace pas les mois à venir.
 */
export function dernierMoisComplet() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Les `n` mois complets, du plus récent au plus ancien. */
export function moisProposes(n = 12) {
  const [a, m] = dernierMoisComplet().split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(a, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Le mois d'avant, pour comparer. */
export function moisAvant(mois) {
  const [a, m] = String(mois || '').split('-').map(Number);
  if (!a || !m) return null;
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ----------------------------------------------------------------- lectures */

/**
 * Les mois saisis pour une structure, du plus ANCIEN au plus récent.
 *
 * Le tri lexicographique sur « AAAA-MM » est l'ordre chronologique : c'est
 * pour cela que le mois est stocké sous cette forme et pas en « Mars 2025 ».
 */
export const moisSaisis = (cle) => db.t('fiche_google_mois')
  .filter(l => l.activity === cle)
  .sort((x, y) => String(x.mois).localeCompare(String(y.mois)));

export const ligneDuMois = (cle, mois) => moisSaisis(cle).find(l => l.mois === mois) || null;

/**
 * La somme d'un groupe de compteurs.
 *
 * ⚠ ELLE DIT CE QU'ELLE N'A PAS PU COMPTER (`manquants`), et l'écran s'en sert :
 * additionner en traitant un champ vide comme zéro donnerait un total qui a
 * l'air juste et qui minore. « On ne sait pas » et « personne n'a appelé » ne
 * se disent pas de la même façon — même règle que la rentabilité des chantiers
 * RGD, qui affiche « — » et non « 0 % » quand aucun coût n'est saisi.
 */
function cumul(ligne, cles) {
  if (!ligne) return { valeur: null, manquants: cles.length, partiel: true };
  let valeur = null, manquants = 0;
  for (const k of cles) {
    const v = ligne[k];
    if (v == null || v === '') { manquants++; continue; }
    valeur = (valeur || 0) + Number(v);
  }
  return { valeur, manquants, partiel: manquants > 0 };
}

export const vuesDe = (ligne) => cumul(ligne, VUES);
export const actionsDe = (ligne) => cumul(ligne, ACTIONS);

/**
 * La part des vues qui mènent à un geste — le seul chiffre de cet écran qui
 * dise quelque chose que les compteurs ne disent pas séparément.
 *
 * ⚠ LES DEUX CÔTÉS NE SE TRAITENT PAS PAREIL, ET C'EST MESURÉ. Des VUES
 * partielles rendent `null` : le dénominateur serait trop petit, donc le taux
 * trop beau — c'est l'erreur qui flatte, celle qu'on ne va pas chercher. Des
 * INTERACTIONS partielles, elles, se calculent quand même sur ce qu'on connaît,
 * et `tauxEstMinimum` le dit : exiger les quatre donnerait « — » pour toujours
 * sur une fiche dont la messagerie n'est pas activée, c'est-à-dire un chiffre
 * qui ne s'afficherait jamais.
 */
export function tauxAction(ligne) {
  const v = vuesDe(ligne), a = actionsDe(ligne);
  if (v.partiel || !v.valeur || a.valeur == null) return null;
  return (a.valeur / v.valeur) * 100;
}

/** Vrai quand des interactions manquent : le taux est alors un plancher. */
export const tauxEstMinimum = (ligne) => tauxAction(ligne) != null && actionsDe(ligne).partiel;

/** Une ligne qui ne porte aucun compteur n'est qu'une note : elle ne se trace pas. */
export const aDesChiffres = (ligne) => COMPTEURS.some(c => ligne?.[c.cle] != null);

/* ---------------------------------------------------------------- écritures */

/** Un champ vide reste VIDE, il ne devient pas zéro. */
function nombreOuRien(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Enregistre un mois : on écrase la ligne existante, ou on en crée une.
 *
 * ⚠ PAS D'`upsert` : `db` n'en expose pas, et l'index unique (activity, mois)
 * ferait échouer un second `insert` — ce qui est le bon comportement en base,
 * mais se présenterait à l'écran comme une erreur technique au lieu d'une mise
 * à jour. On regarde donc avant d'écrire.
 */
export async function enregistrerMois(cle, mois, saisie) {
  const valeurs = {};
  for (const c of COMPTEURS) valeurs[c.cle] = nombreOuRien(saisie[c.cle]);
  valeurs.note = String(saisie.note || '').trim() || null;

  const deja = ligneDuMois(cle, mois);
  if (deja) {
    await db.update('fiche_google_mois', deja.id, { ...valeurs, updated_at: new Date().toISOString() });
    return deja.id;
  }
  const cree = await db.insert('fiche_google_mois', { activity: cle, mois, ...valeurs });
  return cree?.id;
}

export const supprimerMois = (id) => db.remove('fiche_google_mois', id);
