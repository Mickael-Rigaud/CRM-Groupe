// Les deux documents du site RGD Renova, en mode démo uniquement.
//
// POURQUOI CE FICHIER EXISTE
// L'écran « Réalisations » est le seul du CRM dont l'écriture sort vers le
// public. Il était donc aussi le seul qu'on ne pouvait PAS essayer en mode
// démo : la liste lit `rgd_realisations`, qui n'avait aucun exemple, et
// l'atelier lit le document par `rgd_lire_site`, une fonction de la base. On
// se retrouvait à vérifier six cents lignes d'interface en production, sur le
// site d'une entreprise en activité. Ce fichier donne à la démo de quoi jouer
// la même mécanique en local.
//
// ⚠ CE N'EST PAS UNE COPIE DES DONNÉES RÉELLES, et il ne faut pas en faire une.
// Le dépôt est public : les réalisations du site le sont aussi, mais un jeu de
// démo qui recopie la production finit par diverger et par mentir. Trois
// catégories, quatre projets, cinq images de carrousel, et des photos dessinées
// en SVG — la démo marche donc sans réseau, et on voit d'un coup d'œil qu'on
// n'est pas en production.
//
// ⚠ `deplierSite` EST LE DOUBLE DE LA RPC `rgd_publier_site`. Elle fait, en
// JavaScript, ce que le SQL fait côté base : déplier le document en lignes de
// reflet. Si le dépliage change là-bas — une colonne ajoutée, un renommage —
// il faut le changer ici, sinon la démo montre autre chose que la production.
// Les deux sont écrits pour se ressembler ligne à ligne, exprès.

// Une photo de démonstration, dessinée plutôt que téléchargée : aucun appel
// réseau, et l'étiquette dit ce qu'elle représente.
const photo = (texte, fond, encre = '405060') =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'>` +
  `<rect width='320' height='240' fill='%23${fond}'/>` +
  `<text x='160' y='128' font-family='sans-serif' font-size='22' fill='%23${encre}' ` +
  `text-anchor='middle'>${texte}</text></svg>`;

const AV1 = photo('avant', 'c9cfd8');
const AP1 = photo('après', 'a8d5c2');
const AV2 = photo('avant%20cuisine', 'd8d0c9');
const AP2 = photo('après%20cuisine', 'f0d6a8');
const AP3 = photo('après%20studio', 'c9d8f0');
const AP4 = photo('chaufferie', 'd9d9d9');

export const SEED_SITE = {
  realisations: {
    categories: [
      {
        slug: 'salle-de-bain', name: 'Salle de bain',
        // ⚠ Les descriptions de catégorie n'ont AUCUNE colonne dans le reflet.
        // C'est la raison pour laquelle l'atelier relit toujours le document :
        // le rebâtir depuis les lignes les effacerait du site sans un mot. La
        // démo en porte donc, sinon ce piège ne se reproduit pas ici.
        description: 'Douches à l’italienne, meubles sur mesure et carrelage grand format (texte de démonstration).',
        projects: [
          {
            slug: 'salle-de-bain-demo-chantilly',
            title: 'Rénovation d’une salle de bain à Chantilly',
            url: 'https://rgdrenova.fr/nos-realisations/projet/?p=salle-de-bain-demo-chantilly',
            city: 'Chantilly (60)', surface: '6 m²', duration: '3 semaines', gamme: 'Signature',
            description: 'Salle de bain entièrement repensée : douche à l’italienne, meuble double vasque et carrelage effet marbre. (Démonstration.)',
            notes: 'Douche italienne\nMeuble double vasque\nCarrelage effet marbre',
            images: [AV1, AP1],
            photo_tags: { [AV1]: 'avant', [AP1]: 'apres' },
            ba_pairs: [{ before: AV1, after: AP1, before_pos: 'center', after_pos: 'center' }],
            testimonial: { text: 'Équipe ponctuelle et chantier tenu propre. (Avis de démonstration.)', author: 'Marie D.', date: 'Mars 2026', stars: 5 },
          },
          {
            slug: 'salle-de-bain-demo-senlis',
            title: 'Salle de bain à Senlis', url: '',
            city: 'Senlis (60)', surface: '4 m²', duration: '2 semaines', gamme: 'Essentielle',
            description: '', notes: '', images: [], photo_tags: {}, ba_pairs: [],
            testimonial: { text: '', author: '', date: '', stars: 5 },
          },
        ],
      },
      {
        slug: 'cuisine', name: 'Cuisine',
        description: 'Cuisines ouvertes, plans de travail et électricité remise à neuf (texte de démonstration).',
        projects: [
          {
            slug: 'cuisine-demo-gouvieux',
            title: 'Rénovation d’une cuisine à Gouvieux', url: '',
            city: 'Gouvieux (60)', surface: '12 m²', duration: '4 semaines', gamme: 'Essentielle',
            description: 'Cuisine ouverte sur le séjour, électricité refaite et plan de travail en quartz. (Démonstration.)',
            notes: 'Ouverture sur le séjour\nÉlectricité refaite\nPlan de travail quartz',
            images: [AV2, AP2],
            photo_tags: { [AV2]: 'avant', [AP2]: 'apres' },
            ba_pairs: [],
            testimonial: { text: '', author: '', date: '', stars: 5 },
          },
        ],
      },
      {
        slug: 'renovation-complete', name: 'Rénovation complète',
        description: 'Appartements et studios repris entièrement (texte de démonstration).',
        projects: [
          {
            slug: 'renovation-complete-demo-meaux',
            title: 'Rénovation complète d’un studio à Meaux', url: '',
            city: 'Meaux (77)', surface: '28 m²', duration: '2 mois', gamme: 'Signature',
            description: '', notes: '',
            images: [AP3, AP4],
            photo_tags: { [AP3]: 'apres', [AP4]: 'apres' },
            ba_pairs: [],
            testimonial: { text: '', author: '', date: '', stars: 5 },
          },
        ],
      },
    ],
  },
  carrousel: {
    images: [
      { url: AP1, legende: 'Rénovation d’une salle de bain à Chantilly (60)' },
      { url: AP2, legende: 'Rénovation d’une cuisine à Gouvieux (60)' },
      { url: AP3, legende: 'Rénovation complète d’un studio à Meaux (77)' },
      { url: AP4, legende: '' },
      { url: AV1, legende: 'Avant travaux — exemple' },
    ],
  },
};

/**
 * Déplie un document en lignes de reflet, comme le fait `rgd_publier_site`.
 * Rend les lignes de `rgd_realisations` ou de `rgd_carrousel` selon la clé.
 *
 * ⚠ Le rang est GLOBAL pour les réalisations — catégorie puis projet — parce
 * que c'est lui qui donne l'ordre du site, et que l'écran trie dessus.
 */
export function deplierSite(cle, doc) {
  if (cle === 'carrousel') {
    return (doc?.images || [])
      .filter(i => i && i.url)
      .map((i, rang) => ({ id: `car-${rang}`, url: i.url, legende: i.legende || '', rang }));
  }
  const lignes = [];
  for (const cat of doc?.categories || []) {
    for (const p of cat.projects || []) {
      if (!p.slug) continue;
      lignes.push({
        id: `rea-${p.slug}`, slug: p.slug,
        categorie_slug: cat.slug, categorie_nom: cat.name || cat.slug,
        titre: p.title, url: p.url || null, ville: p.city, surface: p.surface,
        duree: p.duration, gamme: p.gamme, description: p.description,
        images: p.images || [], photo_tags: p.photo_tags || {},
        // `ba_pairs` côté site, « avant_apres » dans le reflet — comme en SQL.
        avant_apres: p.ba_pairs || [], temoignage: p.testimonial || null,
        notes: p.notes || '', rang: lignes.length,
      });
    }
  }
  return lignes;
}
