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

// ⚠ « Je me renseigne » A ÉTÉ RETIRÉ LE 01/10/2026, demandé par Mickael :
// « Type de demandeur : Propriétaire, futur acquéreur ». Les deux valeurs
// restantes disent quelque chose d'actionnable — on parle au propriétaire du
// bien, ou à quelqu'un qui ne l'a pas encore acheté ; la troisième ne disait
// que « cette personne n'a rien décidé », ce que l'étape du suivi dit déjà.
// ⚠ UNE DEMANDE QUI LA PORTE DÉJÀ NE LA PERD PAS : le formulaire ajoute en
// bout de liste, cochée et en trait discontinu, toute valeur présente en base
// qu'il ne propose plus. C'est la règle de `avecLesPresentes`.
export const DEMANDEUR = ['Propriétaire', 'Futur acquéreur'];
export const BIEN = ['Un appartement', 'Une maison', 'Un immeuble'];
export const RESIDENCE = ['Une résidence principale', 'Une résidence secondaire',
  'Un investissement locatif'];

// ⚠ DEUX NATURES DANS UNE SEULE QUESTION, ET C'EST DEMANDÉ (01/10/2026,
// Mickael : « rajoute rénovation complète, rénovation salle de bain, rénovation
// cuisine... »). Un CHANTIER (« rénovation cuisine ») et un CORPS DE MÉTIER
// (« plomberie ») ne répondent pas à la même question — le premier dit ce qu'on
// refait, le second qui intervient —, mais au téléphone la personne donne l'un
// ou l'autre indifféremment, et lui imposer deux champs la ferait hésiter.
//
// ⚠ LES CHANTIERS PASSENT DEVANT, et ce n'est pas un détail de rangement :
// c'est ce qu'on coche en premier neuf fois sur dix, et une liste qui commence
// par « Électricité » fait parcourir sept puces avant d'arriver à la bonne.
//
// ⚠ LES SEPT CORPS DE MÉTIER VIENNENT DU SITE, MOT POUR MOT, et ne se
// retouchent pas : une demande arrivée de rgdrenova.fr écrit ces libellés-là.
// « Menuiseries » d'un côté et « Menuiserie PVC » de l'autre feraient deux
// populations qu'aucun décompte ne réunit. Les cinq premiers, eux, n'existent
// que dans le CRM — le site ne les propose pas.
export const CHANTIERS = ['Rénovation complète', 'Rénovation salle de bain',
  'Rénovation cuisine', 'Aménagement intérieur', 'Extension / surélévation'];
export const CORPS_METIER = ['Électricité', 'Maçonnerie', 'Isolation', 'Peinture',
  'Plomberie', 'Terrassement', 'Menuiserie PVC'];
export const TRAVAUX = [...CHANTIERS, ...CORPS_METIER];
export const BUDGETS = ['Moins de 20 000€', '20 000€ - 35 000€', '35 000€ - 50 000€',
  '50 000€ - 80 000€', '80 000€ - 120 000€', 'Plus de 120 000€'];
// ⚠ DEUX DE CES VALEURS COMMANDENT UN CHAMP, d'où les constantes : la liste et
// la condition qui l'écoute ne doivent pas pouvoir diverger sur une virgule.
export const CONNU_RECOMMANDATION = 'Recommandation';
export const CONNU_APPORTEUR = 'Partenaire / apporteur';

// ⚠ REFAITE LE 01/10/2026, demandée mot pour mot. « Partenaire / apporteur »
// entre — c'est la provenance la plus fréquente après le bouche-à-oreille et
// elle n'était nulle part —, « Autre » ferme la liste, et les six tiennent sur
// une seule ligne.
//
// ⚠ « Chantier vu sur place » et « BNI ou réseau professionnel » SORTENT de la
// liste mais pas des données : le formulaire de rgdrenova.fr les propose
// toujours, donc une demande du site peut encore les porter. Elle s'affichera
// alors en bout de liste, cochée, en trait discontinu — la règle de
// `avecLesPresentes`. On ne perd rien, on ne les propose plus à la saisie.
export const CONNU = [CONNU_RECOMMANDATION, CONNU_APPORTEUR, 'Recherche Google',
  'Réseaux sociaux', 'Publicité (flyer, affichage…)', 'Autre'];

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
