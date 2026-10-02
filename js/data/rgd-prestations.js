// Les visuels avant/après de la page « Nos prestations » de rgdrenova.fr
//
// CE QUE CE MODULE PORTE, ET POURQUOI IL EST SI PETIT
// La page `/nos-prestations/` montre six prestations, chacune avec un curseur
// avant/après. Les douze images sont écrites EN DUR dans le fichier HTML de
// l'export statique — mesuré le 02/10/2026 : aucun script ne les fabrique,
// `rgd-compare.js` ne fait que monter le curseur sur ce qui est déjà là.
// Les changer demandait donc de rouvrir le fichier et de le redéposer par FTP.
//
// ⚠ LA LISTE DES SIX EST FIGÉE, ET LE CRM NE PEUT PAS EN AJOUTER. Une
// prestation est une SECTION de la page statique, avec son titre, son texte et
// son bouton — tout cela vit dans le HTML. Ce module ne décide que des IMAGES,
// et l'écran le dit au lieu de proposer un « + » qui ne produirait rien.
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
  const dites = new Map((lu.donnees?.prestations || []).map(p => [p.id, p]));
  return {
    ok: true,
    donnees: PRESTATIONS.map(ref => {
      const d = dites.get(ref.id) || {};
      return { ...ref, avant: d.avant || '', apres: d.apres || '' };
    }),
  };
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
  const prestations = liste
    .filter(p => p.avant && p.apres)
    .map(p => ({ id: p.id, avant: p.avant, apres: p.apres }));
  return publierDocSite('prestations', { prestations });
}

/** Revenir à la version précédente. UNE seule, comme partout ici. */
export const restaurerPrestations = () => restaurerDocSite('prestations');
