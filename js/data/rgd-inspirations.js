// Les photos des réalisations, rangées comme sur le site (14/10/2026, Élodie :
// « une page pour que Mickael puisse montrer toutes les réalisations en rdv
// client pour des inspirations », puis « mets toutes les pièces que l'on
// retrouve sur le site »).
//
// ⚠ LES « PIÈCES » SONT LES CATÉGORIES DU SITE, TELLES QUELLES : Salle de bain,
// Sanitaire, Cuisine, Rénovation complète, Travaux techniques, Immeuble de
// rapport. Un rangement photo par photo (séjour, chambre, combles…) a été
// construit puis écarté le même jour, avant toute mise en ligne : la page
// montre ce que le site montre, et une catégorie créée sur le site y apparaît
// d'elle-même. Rien n'est saisi ici, donc rien n'est stocké.
//
// ⚠ L'ORDRE EST CELUI DU SITE : `rang` du reflet suit le document publié —
// catégories dans leur ordre, puis chantiers dans le leur. Trier dessus suffit,
// sans charger `rgd_categories`.
import { db } from './db.js';

/**
 * Les catégories publiées, chacune avec ses chantiers et leurs photos.
 * Les brouillons n'y sont pas : ce qui n'est pas sur le site ne se montre pas
 * en rendez-vous. Un chantier sans photo non plus — il n'a rien à montrer.
 */
export function categoriesDesRealisations() {
  const projets = db.t('rgd_realisations')
    .filter(r => !r.brouillon && Array.isArray(r.images) && r.images.length)
    .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
  const parCat = new Map();
  for (const r of projets) {
    const cle = r.categorie_slug || r.categorie_nom || 'autres';
    if (!parCat.has(cle)) parCat.set(cle, { cle, nom: r.categorie_nom || 'Autres', projets: [] });
    const tags = r.photo_tags || {};
    // Une photo sans étiquette compte comme « après » : c'est le cas de la
    // plupart des photos d'avant le marquage, et ce sont des photos de résultat.
    const photos = [...new Set(r.images.filter(Boolean))]
      .map(url => ({ url, projet: r, moment: tags[url] === 'avant' ? 'avant' : 'apres' }));
    parCat.get(cle).projets.push({ r, photos });
  }
  return [...parCat.values()];
}
