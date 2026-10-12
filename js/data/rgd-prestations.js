// Les visuels avant/après de la page « Nos prestations » de rgdrenova.fr
//
// CE QUE CE MODULE PORTE, ET POURQUOI IL EST SI PETIT
// La page `/nos-prestations/` montre six prestations, chacune avec un curseur
// avant/après. Les douze images sont écrites EN DUR dans le fichier HTML de
// l'export statique — mesuré le 02/10/2026 : aucun script ne les fabrique,
// `rgd-compare.js` ne fait que monter le curseur sur ce qui est déjà là.
// Les changer demandait donc de rouvrir le fichier et de le redéposer par FTP.
//
// ⚠ LES SIX SONT FIGÉES, MAIS ON PEUT EN AJOUTER DEPUIS LE 12/10/2026
// (demandé par Élodie). La phrase d'avant disait « le CRM ne peut pas en
// ajouter », et elle était vraie : une prestation est une SECTION de la page
// statique. Ce qui a changé, c'est que le script du site sait maintenant
// CLONER une section voisine pour en fabriquer une — le balisage fait 1 771
// octets, il est propre, et aucun menu ne pointe dessus.
//
// ⚠ D'OÙ DEUX RÉGIMES, ET IL FAUT LES DISTINGUER. Les six d'origine portent
// déjà leur titre, leur texte et leur bouton dans le HTML : le CRM ne décide
// que de leurs images, et leur en donner un titre ici en afficherait deux. Une
// prestation CRÉÉE n'a aucune section où se poser : le CRM porte donc tout son
// contenu, sinon la section clonée afficherait le titre de sa voisine.
// `creee` dit de quel régime relève chaque ligne.
//
// ⚠ ET LA CHAÎNE A TROIS MAILLONS, PAS UN. Publier ici ne suffit pas : la
// porte publique doit relayer `titre`, `texte` et `bouton` (fait le 12/10,
// version 24 de `site-realisations`), et `assets/rgd-compare.js` doit porter le
// code qui crée les sections. Le 05/10, ce dernier a été écrasé par sa propre
// version d'origine 35 minutes après son dépôt, et le panneau a écrit dans le
// vide pendant une semaine sans que rien ne le signale.
//
// ⚠ L'IDENTIFIANT EST L'ANCRE DE LA SECTION, AU CARACTÈRE PRÈS — `Menuiserie`
// porte donc une majuscule, et ce n'est pas une faute de frappe : c'est ce que
// le HTML écrit (`<section … id="Menuiserie">`). Le script du site cherche la
// section par cet identifiant ; le « corriger » le ferait chercher une section
// qui n'existe pas, en silence.
//
// ⚠ ET LE DOCUMENT NE PORTE QUE LES ADRESSES. Les titres ci-dessous servent à
// l'écran du CRM, pas au site : celui-ci garde les siens, qui sont dans sa
// page. Les mettre dans le document donnerait deux titres pour une prestation,
// dont un seul s'afficherait.
import {
  lireDocSite, publierDocSite, restaurerDocSite,
} from './rgd-site.js';

/** Les six prestations de la page, dans l'ordre où elle les présente. */
export const PRESTATIONS = [
  { id: 'isolation',       num: '01', titre: 'Isolation · Plâtrerie · Peinture' },
  { id: 'Menuiserie',      num: '02', titre: 'Menuiserie PVC' },
  { id: 'electricite',     num: '03', titre: 'Électricité' },
  { id: 'plomberie',       num: '04', titre: 'Plomberie' },
  { id: 'revetementssols', num: '05', titre: 'Revêtements de sols' },
  { id: 'terrassement',    num: '06', titre: 'Terrassement' },
];

/** Les six que la page porte dans son propre HTML. */
export const ID_DU_SITE = new Set(PRESTATIONS.map(p => p.id));

/**
 * L'identifiant d'une prestation créée, à partir de son nom.
 *
 * ⚠ C'EST UNE ANCRE HTML, PAS UN LIBELLÉ : accents retirés, espaces en tirets,
 * minuscules. Le script du site pose cette valeur en `id` de section ; un
 * caractère qu'une URL doit encoder rendrait le lien « Voir sur le site »
 * illisible, et une ancre vide ferait une section que rien ne désigne.
 *
 * ⚠ ET L'UNICITÉ EST VÉRIFIÉE CONTRE LES SIX AUSSI : deux sections de même
 * `id` dans une page, c'est `getElementById` qui n'en rend qu'une — la
 * prestation créée remplacerait silencieusement celle du site.
 */
export function idDepuisTitre(titre, pris = []) {
  const base = String(titre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'prestation';
  const interdits = new Set([...ID_DU_SITE, ...pris]);
  if (!interdits.has(base)) return base;
  for (let i = 2; i < 99; i++) {
    const essai = base + '-' + i;
    if (!interdits.has(essai)) return essai;
  }
  return base + '-' + Date.now();
}

/** L'adresse publique de la page, pour le lien « Voir la page ». */
export const PAGE_PRESTATIONS = 'https://www.rgdrenova.fr/nos-prestations/';

// ⚠ LE CADRE DU CURSEUR A UN RAPPORT FIXE, POSÉ EN CSS :
// `.rgdm-presta .rgd-ba { aspect-ratio: 940 / 788 }`, les deux images en
// `object-fit: cover`. C'est ce rapport que l'aperçu du CRM reprend, pour
// qu'une photo s'y voie exactement comme elle se verra en ligne — une vignette
// carrée montrerait un cadrage que le site ne fera pas.
export const RATIO_PRESTA = 940 / 788;

/**
 * Le document, à la source.
 * ⚠ UN DOCUMENT ABSENT N'EST PAS UNE ERREUR : il n'existe que depuis le
 * 02/10/2026, et une base neuve — la démo, la préproduction — n'en a pas.
 * On rend alors les six prestations sans image, ce que l'écran lit comme
 * « la page garde les siennes ».
 */
export async function lirePrestations() {
  const lu = await lireDocSite('prestations',
    (d) => d == null || Array.isArray(d?.prestations));
  if (!lu.ok) return lu;
  const toutes = (lu.donnees?.prestations || []).filter(p => p && p.id);
  const dites = new Map(toutes.map(p => [p.id, p]));

  // Les six de la page, dans son ordre à elle.
  const duSite = PRESTATIONS.map(ref => {
    const d = dites.get(ref.id) || {};
    return { ...ref, creee: false, texte: '', bouton: '',
             avant: d.avant || '', apres: d.apres || '' };
  });

  // ⚠ CELLES QUI NE SONT PAS DANS LA PAGE SONT DES CRÉATIONS, et elles
  // viennent APRÈS : le script du site les ajoute à la suite de la dernière
  // section, leur numéro continue donc la série. Les intercaler ici ferait
  // mentir l'écran sur l'ordre de la page.
  const creees = toutes
    .filter(p => !ID_DU_SITE.has(p.id))
    .map((p, i) => ({
      id: p.id,
      num: ('0' + (PRESTATIONS.length + i + 1)).slice(-2),
      creee: true,
      titre: p.titre || '',
      texte: p.texte || '',
      bouton: p.bouton || '',
      avant: p.avant || '',
      apres: p.apres || '',
    }));

  return { ok: true, donnees: [...duSite, ...creees] };
}

/**
 * Publier les visuels.
 *
 * ⚠ ON N'ÉCRIT QUE LES PRESTATIONS QUI PORTENT LEURS DEUX IMAGES. Une paire à
 * moitié remplie ferait un curseur qui révèle du vide : le site attend un
 * « avant » ET un « après ». Celles qu'on laisse de côté ne sont pas effacées
 * du site — le script ne touche qu'à ce que le document nomme ; elles gardent
 * donc l'image du fichier HTML.
 *
 * ⚠ ET ON NE RELIT RIEN AVANT : contrairement aux réalisations, ce document
 * n'a que douze adresses et aucun champ que cet écran ne connaîtrait pas. Il
 * n'y a donc rien à préserver d'une version fraîche — la relecture des
 * réalisations existe pour les descriptions de catégories, qui n'ont pas
 * d'équivalent ici.
 */
export function enregistrerPrestations(liste) {
  const pris = [];
  const prestations = [];

  for (const p of liste) {
    if (!p.creee) {
      // Régime d'origine : la page porte déjà son contenu, on ne pose que les
      // images, et seulement par paire complète.
      if (p.avant && p.apres) prestations.push({ id: p.id, avant: p.avant, apres: p.apres });
      continue;
    }

    // ⚠ UNE PRESTATION CRÉÉE S'ÉCRIT MÊME INCOMPLÈTE, et c'est la différence
    // qui compte. Pour les six, une paire à moitié déposée n'a rien à perdre :
    // son titre et son texte vivent dans le HTML. Ici, la jeter effacerait le
    // nom et le paragraphe que quelqu'un vient d'écrire — on publierait, et
    // son travail aurait disparu. La porte publique refiltre les paires
    // incomplètes : rien n'arrive sur le site tant qu'il manque une photo.
    if (!p.titre) continue;   // sans nom il n'y a pas de prestation
    const id = p.id && !ID_DU_SITE.has(p.id) ? p.id : idDepuisTitre(p.titre, pris);
    pris.push(id);
    prestations.push({
      id,
      avant: p.avant || '',
      apres: p.apres || '',
      titre: p.titre,
      ...(p.texte ? { texte: p.texte } : {}),
      ...(p.bouton ? { bouton: p.bouton } : {}),
    });
  }

  return publierDocSite('prestations', { prestations });
}

// ⚠ LES PRESTATIONS CRÉÉES SONT AUSSI DES TYPES DE TRAVAUX (12/10/2026,
// demandé par Élodie). Le formulaire de devis du site les propose depuis le
// même jour — `assets/rgd-formulaire.js` ajoute une case par prestation créée.
// Sans ce qui suit, une demande arrivée avec « Ravalement de façade »
// s'afficherait dans le CRM cochée mais EN TRAIT DISCONTINU, le signe réservé
// à un vocabulaire qui a bougé. Ici il n'a pas bougé : c'est une valeur qu'on
// propose exprès.
//
// ⚠ LES SEPT CORPS DE MÉTIER NE BOUGENT PAS, on ne fait qu'ajouter — même
// règle que côté site. Ce ne sont pas les mêmes listes : « type de travaux »
// ce sont des corps de métier, une prestation est une page vitrine. Une
// prestation AJOUTÉE, elle, est bien un travail qu'on propose.
let titresCrees = null;

/** Ce qu'on a déjà, sans attendre : vide avant le premier chargement. */
export const titresPrestationsCreees = () => titresCrees || [];

/**
 * Charge une fois les titres des prestations créées.
 *
 * ⚠ ON NE MET EN CACHE QU'EN CAS DE SUCCÈS : retenir un tableau vide après une
 * lecture ratée fermerait la liste pour toute la session, et l'écran dirait
 * « il n'y en a pas » là où il faut lire « on n'a pas pu savoir ».
 */
export async function chargerTitresPrestations() {
  if (titresCrees) return titresCrees;
  const lu = await lirePrestations();
  if (!lu.ok) return [];
  titresCrees = lu.donnees.filter(p => p.creee && p.titre).map(p => p.titre);
  return titresCrees;
}

/** Revenir à la version précédente. UNE seule, comme partout ici. */
export const restaurerPrestations = () => restaurerDocSite('prestations');
