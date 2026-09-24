// Les réponses possibles du formulaire RGD, déclarées UNE SEULE FOIS
//
// Ces listes viennent du formulaire de rgdrenova.fr, mot pour mot. Les
// reformuler donnerait deux vocabulaires pour une même question, et le jour où
// on comparera les réponses, personne ne saura si « Maison » et « Une maison »
// sont la même chose.
//
// ⚠ ELLES ÉTAIENT DANS `rgd-demande-saisie.js`, ET LA FICHE EN A BESOIN AUSSI
// depuis le 24/09/2026 — « pour les informations du projet tu peux reprendre
// les éléments de ce formulaire ». Les recopier dans le second écran aurait
// fabriqué le défaut que le commentaire ci-dessus annonce : deux listes qui se
// ressemblent le premier jour et divergent au premier ajout.

export const DEMANDEUR = ['Propriétaire', 'Futur acquéreur', 'Je me renseigne'];
export const BIEN = ['Un appartement', 'Une maison', 'Un immeuble'];
export const RESIDENCE = ['Une résidence principale', 'Une résidence secondaire',
  'Un investissement locatif'];
export const TRAVAUX = ['Électricité', 'Maçonnerie', 'Isolation', 'Peinture',
  'Plomberie', 'Terrassement', 'Menuiserie PVC'];
export const BUDGETS = ['Moins de 20 000€', '20 000€ - 35 000€', '35 000€ - 50 000€',
  '50 000€ - 80 000€', '80 000€ - 120 000€', 'Plus de 120 000€'];
export const CONNU = ['Recommandation', 'Recherche Google', 'Réseaux sociaux',
  'Publicité (flyer, affichage, panneaux...)', 'Chantier vu sur place',
  'BNI ou réseau professionnel'];

/**
 * Les types de travaux d'une ligne, quelle que soit la forme où ils dorment.
 *
 * ⚠ DEUX FORMES COHABITENT DANS LA COLONNE, et ce n'est pas près de changer :
 * un tableau JSON pour les lignes venues de l'application RGD, du texte séparé
 * par des virgules pour celles qu'écrivent l'Edge Function du site et la saisie
 * à la main. Afficher la première telle quelle donnait
 * `["Peinture","Plomberie"]` à l'écran.
 */
export const listeTravaux = (brut) => {
  const t = String(brut || '').trim();
  if (!t) return [];
  if (t.startsWith('[')) { try { return JSON.parse(t); } catch { return [t]; } }
  return t.split(',').map(x => x.trim()).filter(Boolean);
};

/** La forme dans laquelle on ÉCRIT : du texte séparé par des virgules. */
export const texteTravaux = (liste) => (liste || []).join(', ');
