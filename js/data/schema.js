// Référentiel métier du CRM — la seule source de vérité pour les pipelines,
// les champs par activité, les canaux et les listes de valeurs.

// Les deux metiers de BTP Expertise et leurs couleurs. Ce sont celles des deux agendas
// Google du cabinet — violet « Grape » pour l'expertise, orange « Tangerine » pour
// l'AMO —, pour qu'un rendez-vous ait la meme couleur dans l'agenda et dans le CRM.
// Une exception assumee a la regle « la couleur ne sert qu'au reperage des activites » :
// ici elle distingue deux metiers a l'interieur d'une meme structure.
export const MISSIONS_BTP = {
  expertise: { label: 'Expertise', couleur: '#8E24AA', clair: '#F6EAF9', encre: '#6A1B7D' },
  amo: { label: 'AMO', couleur: '#F09300', clair: '#FEF2DF', encre: '#9A5E00' },
};
export const couleurMission = (m) => (MISSIONS_BTP[m] || MISSIONS_BTP.expertise);

// Le systeme a points de BTP Expertise, repris du manuel operationnel V5.
// Une mission pese un nombre de points ; un charge d'affaires en porte 15 au plus, et
// trois AMO actives au plus. Les points d'une expertise se liberent a sa cloture, ceux
// d'une AMO occupent la capacite longtemps — d'ou le plafond separe sur les AMO.
// `contenu` et `tarif` viennent des catalogues du manuel (sections 2 et 3) : ils
// s'affichent au moment de classer une mission, pour deviser sans rouvrir le PDF.
export const NIVEAUX_BTP = [
  { key: 'exp_simple', label: 'Expertise simple', mission: 'expertise', points: 1,
    contenu: 'Visite, constat, avis technique, restitution.', tarif: '750 à 900 € HT' },
  { key: 'exp_rapport', label: 'Expertise avec rapport', mission: 'expertise', points: 2,
    contenu: 'Visite, analyse, photos, recherches utiles, rapport structuré.', tarif: '1 200 à 1 500 € HT' },
  { key: 'exp_complexe', label: 'Expertise complexe', mission: 'expertise', points: 3,
    contenu: 'Désordres multiples, litige, investigations et technicité renforcée.', tarif: 'à partir de 2 000 € HT' },
  { key: 'amo_ciblee', label: 'AMO ciblée', mission: 'amo', points: 3,
    contenu: 'Périmètre limité, peu de lots, durée courte, accompagnement contenu.', tarif: '5 à 8 % des travaux TTC' },
  { key: 'amo_etendue', label: 'AMO étendue', mission: 'amo', points: 5,
    contenu: 'Plusieurs lots, accompagnement régulier, durée intermédiaire.', tarif: '5 à 8 % des travaux TTC' },
  { key: 'amo_importante', label: 'AMO importante', mission: 'amo', points: 7,
    contenu: 'Nombreux lots, longue durée et/ou complexité élevée.', tarif: '5 à 8 % des travaux TTC' },
];
// Les honoraires d'AMO ne se lisent pas en euros mais en pourcentage des travaux,
// avec un plancher. La formulation est celle que le manuel recommande au client.
export const HONORAIRES_AMO = { taux: '5 à 8 % du montant TTC des travaux', minimum: 3500 };
// Plafonds au lancement. Le manuel les dit « à recalibrer sur données réelles » : ils
// sont ici pour qu'une seule ligne suffise à les changer.
export const CAPACITE_BTP = { points: 18, amoActives: 3 };
export const niveauDe = (deal) => NIVEAUX_BTP.find(n => n.key === deal?.fields?.niveau) || null;
export const pointsDe = (deal) => niveauDe(deal)?.points || 0;

// ---- Le référentiel AMO du manuel opérationnel V5 --------------------------
// Ces tableaux sont la doctrine du cabinet, pas des données : ils ne bougent qu'avec
// le manuel. Ils vivent ici, avec les niveaux et la capacité, pour qu'un écran n'ait
// jamais à les réécrire — et pour qu'une V6 se répercute d'un seul endroit.

// Barème indicatif d'honoraires : ce que donne le taux appliqué au montant des
// travaux. La ligne à 400 000 € redescend volontairement à 6 % — le manuel prévoit
// une dégressivité sur les grosses opérations, ce n'est pas une coquille.
// Plus affiché depuis que le calculateur d'honoraires fait le calcul sur le montant
export const BAREME_AMO = [
  { travaux: 50000, taux: null, honoraires: 3500, note: 'Minimum' },
  { travaux: 80000, taux: 5, honoraires: 4000 },
  { travaux: 100000, taux: 6, honoraires: 6000 },
  { travaux: 150000, taux: 6, honoraires: 9000 },
  { travaux: 200000, taux: 7, honoraires: 14000 },
  { travaux: 300000, taux: 7, honoraires: 21000 },
  { travaux: 400000, taux: 6, honoraires: 24000 },
];

// La matrice de complexité. Le taux ne se lit pas sur le seul budget : cinq critères,
// zéro à deux points chacun, et le total commande le taux suggéré.
export const MATRICE_AMO = {
  intro: 'Le score mesure le temps que la mission va réellement nous demander. Deux chargés d’affaires doivent obtenir le même score sur le même dossier.',
  // ⚠ LES CRITÈRES NE SONT PLUS DÉCLARÉS ICI : ils viennent de `CRITERES_V5`,
  // déclarés plus bas, que la fiche découverte lit déjà pour coter un vrai
  // dossier. Les deux écrans disaient le même barème avec des mots différents —
  // « Montant / taille » ici, « Budget / ampleur » là-bas — et rien ne les tenait
  // ensemble. La liste est reconstruite à la lecture (voir `criteresAmo`), pas
  // recopiée : une copie diverge au premier ajout.
  paliers: [
    { min: 0, max: 2, taux: 5, regle: 'Sous réserve du minimum de 3 500 € HT' },
    { min: 3, max: 5, taux: 6, regle: 'Mission intermédiaire' },
    { min: 6, max: 7, taux: 7, regle: 'Mission soutenue / complexe' },
    { min: 8, max: 10, taux: 8, regle: 'Mission très consommatrice de temps, contraintes fortes' },
  ],
  // La liste que les écrans parcourent. `get` plutôt qu'une valeur figée : au
  // moment où cet objet est construit, `CRITERES_V5` n'est pas encore défini.
  get criteres() { return CRITERES_V5; },
  reserve: "Le taux reste validé par BTP Expertise. Une dérogation sous 5 % demande une validation de la direction. La matrice devra être recalibrée sur les données réelles.",
};
// Les honoraires d'une AMO, de bout en bout :
//   honoraires HT = montant des travaux TTC × taux / 100
//   TVA           = honoraires HT × 20 / 100
//   honoraires TTC = honoraires HT + TVA
//
// ⚠ DEUX « TTC » QUI NE DÉSIGNENT PAS LA MÊME CHOSE, ET IL NE FAUT PAS LES
// CONFONDRE. Le montant des TRAVAUX est en TTC depuis le 25/09/2026, décision de
// Mickael : c'est ainsi qu'un client annonce son budget. NOS HONORAIRES, eux,
// restent calculés et affichés en HT, puis la TVA s'ajoute — c'est une facture,
// elle se fait comme ça. Renommer « Honoraires HT » en TTC casserait le calcul
// affiché juste en dessous, qui ajoute 20 % à ce montant.
//
// ⚠ ET LA BASE DE CALCUL A CHANGÉ AVEC LE LIBELLÉ. Le taux s'applique désormais
// au montant TTC : un chantier de 100 000 € HT, soit 120 000 € TTC à 20 %, donne
// 7 200 € d'honoraires à 6 % au lieu de 6 000 €. C'est une conséquence
// arithmétique du choix, pas un effet de bord à corriger — mais elle se voit sur
// chaque devis, et `BAREME_AMO` ci-dessus n'a pas été retouché : ses paliers
// (80 k€, 200 k€, et les honoraires en regard) ont été écrits pour des montants
// HT.
//
// Le taux est libre : la matrice du §41 en suggère un, elle ne l'impose pas, et le
// manuel prévoit lui-même un taux final distinct du taux suggéré.
//
// LE MINIMUM DE 3 500 € N'EST PLUS APPLIQUÉ AU RÉSULTAT. Le forcer faisait donner le
// même montant à 5, 6, 7 et 8 % sur les petites opérations, et le calculateur avait
// l'air d'ignorer le taux. La règle du manuel n'est pas perdue pour autant :
// `sousMinimum` la signale, à l'écran comme sur la fiche, sans toucher au nombre.
export const TVA_TAUX = 20;
export const honorairesAmo = (travaux, taux) => {
  const cents = (x) => Math.round(x * 100) / 100;
  const ht = cents((Number(travaux) || 0) * (Number(taux) || 0) / 100);
  const tva = cents(ht * TVA_TAUX / 100);
  return { ht, tva, ttc: cents(ht + tva), sousMinimum: ht > 0 && ht < HONORAIRES_AMO.minimum };
};
export const tauxSuggere = (score) =>
  MATRICE_AMO.paliers.find(p => score >= p.min && score <= p.max) || MATRICE_AMO.paliers[MATRICE_AMO.paliers.length - 1];

// Les six phases d'une AMO, et le poids que chacune pèse dans la mission. Les poids
// font 100 % : ils servent aussi de clé de facturation par phase.
export const PHASES_AMO = [
  { num: 1, label: 'Cadrage', contenu: 'Besoins, contraintes, priorités, enveloppe, calendrier général.', poids: 10, etape: 'amo_cadrage' },
  { num: 2, label: 'Préparation', contenu: 'Définition fonctionnelle, préconisations, budget, prestations attendues.', poids: 15, etape: 'amo_programme' },
  { num: 3, label: 'Consultation', contenu: 'Analyse et comparaison des offres, documents, aide au choix et à la négociation.', poids: 20, etape: 'amo_consultation' },
  { num: 4, label: 'Accompagnement travaux', contenu: 'Points réguliers, avancement, situations, avenants, alertes et conseil.', poids: 35, etape: 'amo_chantier' },
  { num: 5, label: 'Réception', contenu: 'Préparation, assistance, réserves, conseils sur les paiements.', poids: 15, etape: 'amo_reception' },
  { num: 6, label: 'Clôture', contenu: 'Documents, suivi des réserves, clôture.', poids: 5 },
];

// La frontière avec la maîtrise d'œuvre. C'est la règle qui protège le cabinet : la
// franchir fait basculer la mission dans la responsabilité décennale du constructeur.
export const FRONTIERE_AMO = {
  regles: [
    "L'AMO assiste et conseille le maître d'ouvrage ; elle n'est jamais présentée comme une mission de maîtrise d'œuvre.",
    'Le contrat définit les actes inclus et les exclusions.',
    "Tout acte de conception, prescription d'exécution, direction d'entreprise ou pilotage assimilable à une mission de constructeur doit être signalé avant engagement.",
    'En cas de doute sur une mission : validation direction et assureur avant devis.',
  ],
  reference: "Code civil, art. 1792 et 1792-1 ; Code des assurances, art. L241-1. Toute personne dont la responsabilité décennale peut être engagée doit être assurée pour cette responsabilité.",
};

// Les exemples de charge du manuel, donnés en compositions de niveaux plutôt qu'en
// totaux écrits : le total et le verdict se recalculent sur la capacité en vigueur.
// Le manuel les présentait sur 15 points, la capacité retenue au lancement est dans
// CAPACITE_BTP — les deux ne peuvent pas diverger si on ne les écrit qu'une fois.
// ---- Le référentiel Expertise du manuel V6 ---------------------------------
// Le V6 est un document propre au pôle Expertise, postérieur au manuel V5. Il en
// reprend les niveaux et les tarifs à l'identique — d'où l'absence de doublon ici —
// mais il ajoute ce qui manquait : le positionnement, la typologie des missions, une
// grille de qualification plus fine, une échelle de gravité et la limite au-delà de
// laquelle on passe la main.

// §1 — ce que le cabinet est, et ce qu'il n'est pas. La dernière ligne est la plus
// importante : c'est elle qui sépare le technique du juridique.
export const POSITIONNEMENT_EXPERTISE = {
  intro: "Expert bâtiment non judiciaire, sur des missions amiables, techniques et documentées. Le cabinet peut être missionné par un particulier, un maître d'ouvrage, un acquéreur, un bailleur, un syndic, un artisan ou une entreprise.",
  principes: [
    ['Rôle', 'Constater, analyser, documenter, expliquer et préconiser dans les limites de la mission.'],
    ['Posture', "Technique, factuelle, indépendante dans l'analyse ; ni avocat, ni juge, ni expert judiciaire."],
    ['Clients', "Particuliers et professionnels, y compris artisans et entreprises confrontés à une réclamation ou un litige."],
    ['Livrables', 'Restitution technique, rapport structuré, avis sur pièces, assistance technique contradictoire selon la mission.'],
    ['Limite', "Ne jamais présenter une conclusion juridique comme une décision de responsabilité : distinguer le technique du droit."],
  ],
  // La chaîne de rédaction : chaque maillon doit rester séparé des autres dans le
  // rapport. Mélanger la déclaration du client et le constat est l'erreur classique.
  redaction: ['Déclaration du client', 'Constat objectif', 'Mesure', 'Analyse',
    'Hypothèse / cause probable', 'Niveau de confiance', 'Risque', 'Préconisation'],
};

// §2 — ce qu'on sait faire, rangé par famille.
export const TYPOLOGIE_EXPERTISE = [
  ['Désordres / pathologies', 'Fissures, humidité, infiltrations, condensation, remontées capillaires, moisissures, déformations.'],
  ['Malfaçons / non-conformités', "Travaux contestés, défauts d'exécution, réserves, écarts aux documents contractuels ou aux règles techniques."],
  ['Second œuvre / équipements', 'Plomberie, évacuations, sanitaire, électricité, revêtements, menuiseries, ventilation.'],
  ['Structure / enveloppe', 'Maçonnerie, planchers, façades, toiture, étanchéité ; recours à un spécialiste si nécessaire.'],
  ['Réception', 'Assistance technique avant ou lors de la réception, identification des désordres et des réserves.'],
  ['Avant achat / avant travaux', 'Repérage visuel des points techniques sensibles et des risques apparents, dans le périmètre contractuel.'],
  ['Litige amiable', "Analyse technique pour un particulier, un artisan ou une entreprise ; préparation d'arguments techniques."],
  ['Contradictoire amiable', 'Participation à une réunion avec les parties et experts, observations techniques et compte rendu.'],
  ['Avis sur pièces', 'Analyse de devis, photos, factures, plans, rapports et échanges, avec limites explicites.'],
];

export const OFFRE_EXPERTISE_NOTE = "Le tarif final dépend du déplacement, du volume documentaire, du nombre de désordres, des mesures nécessaires, du nombre d'intervenants, du contradictoire et du temps de rédaction. Ces tarifs sont des bases de travail, à recalibrer sur les temps réels.";

// §4 — la grille de qualification du V6 : six critères là où le V5 en donnait cinq,
// et des repères plus concrets. Chaque critère désigne un niveau, rien ne s'additionne.
export const QUALIF_EXPERTISE_V6 = [
  { key: 'desordres', label: 'Désordres', valeurs: ['1 sujet ciblé', '1 à 3 sujets liés', 'Multiples / imbriqués'] },
  { key: 'documents', label: 'Documents', valeurs: ['Faibles', 'Volume moyen', 'Volume important / historique long'] },
  { key: 'intervenants', label: 'Intervenants', valeurs: ['1 à 2', 'Plusieurs', 'Multiples parties / assureurs / experts'] },
  { key: 'mesures', label: 'Mesures', valeurs: ['Simples', 'Plusieurs mesures', 'Investigations poussées / spécialiste'] },
  { key: 'enjeu', label: 'Enjeu', valeurs: ['Information / décision', 'Réclamation / réception', 'Litige sensible / contradictoire'] },
  { key: 'livrable', label: 'Livrable', valeurs: ['Restitution', 'Rapport complet', 'Rapport renforcé + annexes / réunions'] },
];
export const QUALIF_EXPERTISE_REGLE = "Le chargé d'affaires propose le niveau ; BTP Expertise peut reclasser la mission avant signature, ou après analyse des pièces si le périmètre réel est supérieur.";

// §17 — l'échelle de gravité. Elle commande l'urgence de la visite et le ton de
// l'alerte, pas la qualification réglementaire du désordre.
export const GRAVITE_EXPERTISE = [
  { code: 'G0', ton: 'ok', definition: 'Esthétique ou mineur, sans aggravation identifiée.', action: 'Rapport et conseil normaux.' },
  { code: 'G1', ton: 'info', definition: "Désordre fonctionnel, ou risque d'aggravation modérée.", action: 'Préconisation et délai de traitement.' },
  { code: 'G2', ton: 'warn', definition: 'Aggravation probable, dommage actif ou usage fortement affecté.', action: 'Alerte client, action rapide ou investigation.' },
  { code: 'G3', ton: 'bad', definition: 'Risque potentiel pour la sécurité des personnes ou la stabilité.', action: 'Alerte immédiate ; sécurisation, spécialiste ou autorité compétente selon le cas.' },
];
export const GRAVITE_REGLE = "Outil interne de priorisation, et non une qualification réglementaire universelle.";

// §18 — là où l'expertise s'arrête et où un spécialiste prend le relais. Le pendant,
// côté expertise, de la frontière AMO / maîtrise d'œuvre.
export const SPECIALISTES_EXPERTISE = [
  ['Structure complexe, mouvement important', 'Ingénieur structure / bureau d’études.'],
  ['Sol et fondations', 'Géotechnicien selon la problématique.'],
  ['Étanchéité complexe', 'Spécialiste enveloppe et étanchéité.'],
  ['Installation électrique à diagnostic réglementaire', 'Professionnel habilité ou diagnostiqueur selon la mission.'],
  ['Recherche de fuite invasive', 'Entreprise spécialisée.'],
  ['Amiante, plomb, termites, DPE', 'Diagnostiqueur certifié selon le diagnostic.'],
  ['Calcul thermique ou acoustique', 'Bureau d’études spécialisé.'],
  ['Chiffrage détaillé multi-lots', 'Économiste de la construction si nécessaire.'],
];

// ---- La fiche découverte Expertise du manuel V5 (§36) ----------------------
// Même esprit que la fiche AMO, mais l'expertise se qualifie autrement : pas un score
// de 0 à 10, une grille où chaque critère désigne directement un niveau. Le manuel ne
// donne pas de formule — voir `niveauExpertise` pour ce que le CRM en fait.

export const FICHE_EXPERTISE = {
  profils: ['Propriétaire occupant', 'Propriétaire bailleur', 'Acquéreur / vendeur',
    'Entreprise / artisan', 'Syndic / copropriété', 'Avocat / assureur / autre professionnel', 'Autre'],
  motifs: ['Fissures', 'Humidité / remontées capillaires', 'Infiltration', 'Condensation / moisissures',
    'Toiture / étanchéité', 'Façade', 'Structure / maçonnerie', 'Plomberie / évacuation', 'Électricité',
    'Isolation / thermique', 'Menuiseries', 'Sol / parquet / carrelage', 'Réception de travaux',
    'Malfaçons / non-conformités', 'Litige client / artisan', 'Avis avant achat', 'Autre'],
  documents: ['Photos / vidéos', 'Devis', 'Factures', 'Plans', 'Contrats / marchés', 'PV de réception',
    'Courriers / emails', 'Constat commissaire de justice', 'Rapport expert / assureur',
    "Attestations d'assurance", 'Autres'],
  controles: ['RC Pro du chargé valide', 'Habilitation suffisante', 'Zone compatible',
    'Capacité disponible', 'Lettre de mission à envoyer'],
  occupation: ['Occupé par le propriétaire', 'Loué', 'Vacant', 'Non déterminé'],
};

// §36 G — la grille de qualification. Chaque critère désigne un niveau, il n'y a pas
// d'addition : « Livrable : rapport structuré » dit à lui seul « expertise avec
// rapport ». Les trois colonnes sont les trois niveaux d'expertise, dans l'ordre.
export const QUALIF_EXPERTISE = [
  { key: 'etendue', label: 'Étendue', valeurs: ['Point isolé', 'Plusieurs constats liés', 'Multiples désordres / enjeux'] },
  { key: 'livrable', label: 'Livrable', valeurs: ['Avis / restitution', 'Rapport structuré', 'Rapport approfondi / litige'] },
  { key: 'documents', label: 'Documents', valeurs: ['Faibles', 'Normaux', 'Volumineux / contradictoires'] },
  { key: 'enjeu', label: 'Enjeu', valeurs: ['Faible', 'Moyen', 'Fort / contentieux'] },
  { key: 'temps', label: 'Temps', valeurs: ['Court', 'Intermédiaire', 'Important'] },
];

// Le manuel donne la grille mais aucune règle d'arbitrage : il écrit « Niveau retenu »
// et laisse juger. Le CRM propose donc le niveau le plus souvent désigné par les cinq
// critères, et tranche vers le HAUT en cas d'égalité — sous-estimer une expertise
// coûte plus cher que la sur-estimer, on s'engage sur un tarif. Ce n'est qu'une
// proposition : le niveau reste choisi à la main.
export const niveauExpertise = (cotes, grille = QUALIF_EXPERTISE) => {
  const niveaux = NIVEAUX_BTP.filter(n => n.mission === 'expertise');   // simple, rapport, complexe
  const comptes = [0, 0, 0];
  for (const c of grille) {
    const v = cotes?.[c.key];
    if (v === 0 || v === 1 || v === 2) comptes[v] += 1;
  }
  if (!comptes.some(Boolean)) return null;
  let meilleur = 0;
  comptes.forEach((n, i) => { if (n >= comptes[meilleur]) meilleur = i; });   // >= : l'égalité monte
  return { niveau: niveaux[meilleur], comptes };
};

// ---- La fiche découverte AMO du manuel V5 (§40 à §42) ----------------------
// Le §40 donne les rubriques à remplir en rendez-vous, le §41 la règle de calcul du
// taux, le §42 celle du niveau. Les trois vont ensemble : on coche, et le taux, les
// honoraires et les points de charge en découlent.

export const FICHE_AMO = {
  travaux: ['Rénovation complète', 'Rénovation partielle', 'Extension', 'Réaménagement intérieur',
    'Salle de bains', 'Cuisine', 'Électricité', 'Plomberie', 'Chauffage / climatisation', 'Isolation',
    'Menuiseries', 'Façade', 'Toiture', 'Structure / maçonnerie', 'Extérieurs', 'Autre'],
  avancement: ['Idée / cadrage', 'Plans disponibles', 'Devis déjà reçus', 'Entreprises déjà identifiées',
    'Travaux déjà commencés', 'Architecte / BET présent', 'Autorisations obtenues', 'Financement validé'],
  besoins: ['Cadrage du besoin', 'Analyse budget', 'Définition des lots', 'Consultation entreprises',
    'Analyse / comparaison devis', 'Vérification assurances entreprises', 'Aide à la négociation',
    'Accompagnement pendant travaux', 'Analyse situations / avenants', 'Assistance réception',
    'Suivi réserves', 'Clôture documentaire'],
  risques: ['Copropriété', 'Site occupé', 'Accès difficile', 'Délais courts', 'Budget contraint',
    'Nombreux intervenants', 'Travaux structurels', 'Patrimoine / contraintes urbanisme',
    'Sinistre / litige existant', 'Travaux en site sensible', 'Autre'],
  occupation: ['Logement occupé', 'Logement vacant', 'Occupation partielle', 'Non déterminé'],
};

// §41 — LES CINQ CRITÈRES, SOURCE UNIQUE DES DEUX MATRICES DE L'APPLICATION.
//
// ⚠ IL Y EN AVAIT DEUX, ET ELLES NE DISAIENT PAS LA MÊME CHOSE. La page de
// référence AMO lisait `MATRICE_AMO.criteres` (« Montant / taille », « Opération
// limitée ») pendant que la fiche découverte — celle qui COTE VRAIMENT un
// dossier — lisait celle-ci. Un chargé d'affaires lisait donc un vocabulaire sur
// l'écran qui explique, un autre sur l'écran qui décide.
// `MATRICE_AMO.criteres` dérive maintenant d'ici : une seule vérité.
//
// RÉÉCRITS LE 25/09/2026, DEMANDE DE MICKAEL : « rendre la matrice
// compréhensible sans le manuel. Un chargé d'affaires doit obtenir le même score
// que moi sur un même dossier. » D'où trois choses : des noms qui disent ce
// qu'on mesure, une ligne d'aide par critère, et des seuils concrets à la place
// des adjectifs — « opération limitée » s'interprète, « moins de 80 k€ » se
// mesure.
//
// ⚠ SEUILS DE BUDGET : 40 ET 120 k€, arbitrés par Mickael le 25/09/2026. Le
// code portait 80 et 200 ; les deux ont été changés ENSEMBLE, ici et dans
// `coteBudget`, sans quoi la cotation automatique aurait contredit la case
// cochée sans que rien ne le dise.
//
// ⚠ TOUTE LA CHAÎNE EST EN TTC DEPUIS LE 25/09/2026 (« mets TTC partout »).
// L'aide, le champ de la fiche, le simulateur et le libellé du taux parlent du
// montant TTC des travaux — celui qu'un client annonce. `coteBudget` lit ce
// même montant, donc les seuils 40/120 s'appliquent bien à du TTC.
//
// ⚠ `budget_ht` A GARDÉ SON NOM DE VARIABLE. Il porte désormais du TTC. Le
// renommer toucherait les fiches déjà enregistrées, qui rangent la valeur sous
// cette clé — un renommage sans reprise des données les viderait. Le libellé
// affiché fait foi ; ce nom est une trace d'histoire, pas une unité.
//
// ⚠ NOS HONORAIRES RESTENT EN HT, et ce n'est pas une exception oubliée : on
// les calcule en HT puis on ajoute la TVA, comme sur une facture. Le montant
// des travaux est ce que le CLIENT dépense, les honoraires ce que NOUS
// facturons — deux choses, deux unités.
//
// ⚠ ET `BAREME_AMO` N'A PAS ÉTÉ RETOUCHÉ. Ses paliers (80 k€, 200 k€) et les
// honoraires en regard ont été écrits pour des montants HT. Il n'est plus
// articulé ni sur les seuils de la matrice ni sur la même unité : à reprendre
// avec le manuel.
export const CRITERES_V5 = [
  { key: 'budget', label: 'Budget travaux',
    aide: "Montant TTC estimé des travaux à piloter, selon l'estimation du chargé d'affaires (pas le budget annoncé par le client).",
    valeurs: ['Moins de 40 k€', '40 à 120 k€', 'Plus de 120 k€'], auto: 'budget' },
  { key: 'lots', label: "Nombre de corps d'état",
    aide: 'Métiers différents à consulter et coordonner (maçonnerie, plâtrerie, électricité, plomberie, menuiseries, carrelage, peinture, isolation, VMC…).',
    valeurs: ['1 à 3 métiers (ex. salle de bain)', '4 à 6 métiers (ex. appartement partiel)', '7 métiers et plus (rénovation complète)'], auto: 'lots' },
  { key: 'duree', label: 'Durée du chantier',
    aide: "De la préparation à la réception. Plus c'est long, plus il y a de visites, de comptes rendus et de risques de dérive.",
    valeurs: ['Moins de 3 mois', '3 à 6 mois', 'Plus de 6 mois'], auto: 'duree' },
  { key: 'intensite', label: 'Présence attendue par le client',
    aide: 'Fréquence des points, visites et comptes rendus que le client attend de nous. Dans tous les cas, le client reste décisionnaire et donneur d’ordres : nous préparons, contrôlons et alertons, nous ne dirigeons pas les entreprises.',
    valeurs: ['Client autonome : visites aux étapes clés, compte rendu à chaque étape',
              'Client peu disponible : visite et compte rendu hebdomadaires, préparation de ses décisions et de ses échanges avec les entreprises',
              'Client à distance ou peu à l’aise : visites et points fréquents, chaque décision préparée et expliquée avant qu’il la prenne, disponibilité élevée'] },
  { key: 'contraintes', label: 'Complexité du contexte',
    aide: 'Tout ce qui complique le chantier en dehors des travaux : occupants, copropriété, autres intervenants, sinistre, litige, délais imposés.',
    valeurs: ['Logement vide, accès simple, pas de tiers',
              'Occupé, copropriété ou autres intervenants (architecte, BE, diagnostiqueur)',
              'Structure, sinistre/assurance, litige en cours, ABF, délai imposé'] },
];

// Ce que le manuel demande au CRM de déduire tout seul. Les seuils sont les siens ;
// la cotation reste modifiable, le score n'est qu'une aide.
// ⚠ CES SEUILS SONT CEUX QUE LA MATRICE AFFICHE, ET ILS DOIVENT LE RESTER.
// 40 et 120 k€ depuis le 25/09/2026, sur décision de Mickael. Ils valaient
// 80 et 200 — les changer à l'écran sans les changer ici aurait fait coter
// automatiquement un dossier autrement que ce que la case cochée annonce, sans
// que rien ne le dise. Les deux bougent ensemble ou pas du tout.
//
// ⚠ À SAVOIR : `BAREME_AMO` garde ses paliers d'origine (80 k€ → 5 %, 200 k€ →
// 7 %). Ce barème répond à une autre question — ce qu'on facture — que la
// matrice, qui mesure le temps que la mission demande. Ils ne sont plus alignés
// sur les mêmes montants ; c'est à vérifier avec le manuel si un écart se voit
// sur un devis.
export const coteBudget = (travauxHt) => {
  const m = Number(travauxHt) || 0;
  if (!m) return null;
  return m < 40000 ? 0 : m <= 120000 ? 1 : 2;
};
export const coteDuree = (debut, fin) => {
  if (!debut || !fin) return null;
  const mois = (new Date(fin) - new Date(debut)) / (30.44 * 86400000);
  if (!isFinite(mois) || mois <= 0) return null;
  return mois < 3 ? 0 : mois <= 6 ? 1 : 2;
};
export const coteLots = (nbTravaux) => (nbTravaux ? (nbTravaux <= 3 ? 0 : nbTravaux <= 6 ? 1 : 2) : null);

// §42 — le niveau suggéré par le score. « Le score est une aide et non une règle
// absolue » : on suggère, on n'impose pas.
export const niveauSuggere = (score) => {
  const cle = score <= 3 ? 'amo_ciblee' : score <= 6 ? 'amo_etendue' : 'amo_importante';
  return NIVEAUX_BTP.find(n => n.key === cle);
};

// §41 — le garde-fou. Un taux différent du suggéré demande un motif écrit ; sous 5 %,
// c'est la direction qui tranche.
export const controleTaux = (suggere, final, motif) => {
  const ecart = Number(final) !== Number(suggere);
  return {
    ecart,
    motifManquant: ecart && !String(motif || '').trim(),
    validationDirection: Number(final) < 5,
  };
};

// Plus affiché : le système de points se lit sur l'écran des chargés d'affaires.
export const EXEMPLES_CHARGE = [
  ['amo_importante', 'amo_etendue', 'exp_complexe'],
  ['amo_ciblee', 'amo_ciblee', 'amo_etendue', 'exp_complexe'],
  ['amo_etendue', 'exp_rapport', 'exp_rapport', 'exp_simple'],
];

// ---- Le modèle de rémunération du réseau (§13) ------------------------------
// Ce qui revient au chargé d'affaires indépendant, et ce qui reste au cabinet. La
// clé dépend de l'origine du dossier : un client que BTP Expertise a apporté ne se
// partage pas comme un client que le chargé d'affaires amène lui-même.
//
// LE SENS DE LA GRILLE, a garder en tete si les taux rebougent : l'independant
// prend TOUJOURS plus quand il amene le client (70 contre 60). C'est ce qui
// recompense l'apport. Une grille ou l'apporteur toucherait moins que sur un
// client du cabinet inverserait l'interet du reseau — releve le 18/09/2026 sur
// une consigne ambigue, et tranche dans ce sens.
//
// Les montants du tableau ne sont pas recopiés du manuel, ils s'en recalculent : le
// manuel dit lui-même que « les pourcentages restent paramétrables dans le CRM », et
// des colonnes figées mentiraient le jour où la clé change. Contrôlé sur les six
// lignes du document.
// ⚠ LES DEUX CLÉS ONT ÉTÉ RÉVISÉES le 20/09/2026, à la baisse pour le chargé
// d'affaires : 60/40 et 70/30 sont devenus 55/45 et 65/35. Elles ne sont écrites
// qu'ICI — l'écran « Chargés d'affaires » et le tableau de bord les lisent, ils ne
// les recopient pas. Une révision se fait donc sur ces deux lignes, nulle part ailleurs.
export const REMUNERATION_BTP = {
  origines: [
    { cle: 'cabinet', label: 'Client BTP Expertise', court: 'Client cabinet', independant: 55, cabinet: 45 },
    // Ce qui fait d'un dossier un CLIENT APPORTE, ce n'est pas une case a cocher : c'est
    // l'origine du lead choisie sur la fiche decouverte, expertise comme AMO. Deux
    // canaux disent que le chargé d'affaires est alle chercher le client lui-meme —
    // une recommandation obtenue de sa clientele, ou sa propre prospection. Tous les
    // autres canaux decrivent un lead venu au cabinet (site, publicite, partenaire,
    // telephone), donc un client du cabinet. Arbitre le 18/09/2026.
    { cle: 'apporte', label: "Client apporté par le chargé d'affaires", court: 'Client apporté',
      independant: 65, cabinet: 35, canaux: ['Recommandation client', 'Prospection directe'] },
  ],
  // Les honoraires servant d'exemples sont ceux du barème AMO du §3.
  exemples: [3500, 6000, 9000, 14000, 21000, 24000],
  regle: "La part de l'indépendant se calcule et se paie sur les sommes effectivement encaissées par BTP Expertise, pas sur les montants facturés.",
};
export const partRemuneration = (honoraires, pourcentage) =>
  Math.round((Number(honoraires) || 0) * (Number(pourcentage) || 0)) / 100;

// Quelle clé de partage s'applique à une affaire. La source est `deals.channel`,
// c'est-à-dire l'« Origine du lead » saisie au moment de la fiche découverte : elle
// est déjà écrite sur l'affaire, il n'y a donc aucun champ à ajouter ni à ressaisir.
// Un canal non déclaré retombe sur la clé du cabinet — le cas de loin le plus
// fréquent, et le moins généreux : on n'attribue jamais un apport par défaut.
export const cleRemuneration = (deal) => {
  const canal = deal?.channel || '';
  return REMUNERATION_BTP.origines.find(o => o.canaux?.includes(canal))
    || REMUNERATION_BTP.origines.find(o => !o.canaux);
};

// Ce que pèse une affaire pour le chargé d'affaires qui la porte.
// ⚠ Sur du prévisionnel c'est une PROJECTION : la règle du manuel (§13) dit que la
// part se calcule et se paie sur les sommes effectivement encaissées, pas sur les
// montants facturés. À l'écran, le libellé doit le dire.
export const partChargeAffaires = (deal) =>
  partRemuneration(deal?.amount, cleRemuneration(deal).independant);

// La fiche métier du réseau. Sert à recruter, à cadrer l'entretien et à rappeler ce
// qui est attendu une fois la personne habilitée.
export const FICHE_CHARGE_BTP = {
  intitule: "Chargé d'affaires indépendant — Expertise bâtiment & AMO",
  dimensions: [
    ['Technique', "Culture tous corps d'état, devis, plans, pathologies, règles de l'art."],
    ['Analyse', 'Constater, documenter, rechercher, et savoir limiter ses conclusions.'],
    ['Rédaction', 'Rapports factuels, structurés, lisibles et exploitables.'],
    ['Relation client', 'Pédagogie, neutralité, capacité à expliquer et à alerter.'],
    ['Organisation', 'CRM, délais, photos, documents et traçabilité.'],
    ['Autonomie', 'Gestion de portefeuille et remontée des informations.'],
    ['Mobilité', 'Intervention terrain sur sa zone.'],
    ['Statut', 'Entreprise indépendante : micro, EI, EURL ou SASU selon la situation.'],
    ['Assurance', 'RC Pro adaptée, valide et vérifiée.'],
  ],
  missions: [
    'Prendre en charge les rendez-vous découverte qui lui sont attribués.',
    'Réaliser les visites et constats terrain.',
    'Analyser les documents, devis, désordres et éléments techniques.',
    "Produire ou préparer les rapports selon son niveau d'habilitation.",
    'Assurer les phases AMO qui lui sont confiées.',
    'Maintenir le dossier et les temps à jour dans le CRM.',
    'Respecter les méthodes, modèles, délais et contrôles qualité BTP Expertise.',
  ],
};



export const ACTIVITIES = {
  rgd: {
    key: 'rgd', label: 'RGD Renova', short: 'RGD', color: '#FD7A2D',
    accent: '#FD7A2D', on: '#56290F', accent2: '#E96A1D', soft: '#FFF2EA', ink: '#6D3413',
    amountLabel: 'Montant devis HT (€)',
    rdvStage: 'visite',
    stages: [
      { key: 'lead', label: 'Nouveau lead', p: 5 },
      { key: 'qualifie', label: 'Qualifié', p: 15 },
      { key: 'visite', label: 'Visite planifiée', p: 30 },
      { key: 'devis_encours', label: 'Devis en cours', p: 40 },
      { key: 'devis_envoye', label: 'Devis envoyé', p: 55 },
      { key: 'nego', label: 'Négociation', p: 75 },
    ],
    fields: [
      { key: 'type_travaux', label: 'Type de travaux', type: 'select', options: ['Rénovation complète', 'Salle de bain', 'Cuisine', 'Électricité', 'Plomberie', 'Maçonnerie', 'Plâtrerie / isolation', 'Revêtements', 'Réaménagement', 'Autre'] },
      { key: 'adresse_chantier', label: 'Adresse chantier', type: 'text' },
      { key: 'budget_annonce', label: 'Budget annoncé (€)', type: 'number' },
      { key: 'delai_souhaite', label: 'Délai souhaité', type: 'text' },
      { key: 'date_visite', label: 'Date de visite', type: 'date' },
      { key: 'num_devis', label: 'N° devis Costructor', type: 'text' },
    ],
  },
  btp: {
    key: 'btp', label: 'BTP Expertise', short: 'BTP Exp.', color: '#00BBF6',
    accent: '#00BBF6', on: '#00455B', accent2: '#00A8DD', soft: '#E6F8FF', ink: '#004B62',
    amountLabel: 'Montant mission HT (€)',
    rdvStage: 'rdv1',
    // Tant qu'une affaire est a l'une de ces etapes, c'est un NOUVEAU LEAD : le
    // premier entretien telephonique n'a pas eu lieu. Les deux sont communes a
    // l'expertise et a l'AMO, et garanties en tete de liste (voir le commentaire
    // de `stages`). Passer au-dela fait sortir le lead de la pile de l'espace BTP
    // et promeut son contact en client.
    avantEntretien: ['lead', 'rdv1'],
    // A partir de cette etape, la mission est ENGAGEE : le client a accepte, meme si
    // rien n'est encore realise ni facture. C'est le seuil du CA previsionnel du
    // tableau de bord. Une etape par metier, parce que l'engagement ne porte pas le
    // meme nom des deux cotes — « Lettre de mission » en expertise, « Mission AMO »
    // en AMO — mais dit la meme chose. Tout ce qui suit dans le deroule du metier
    // compte aussi : on n'enleve pas du previsionnel une mission qui avance.
    engagement: { expertise: 'proposition', amo: 'amo_contrat' },
    // LA DERNIÈRE ÉTAPE DU DÉROULÉ, par métier. Y être n'est pas l'avoir terminée :
    // une mission arrivée à la réception des chantiers est encore en cours tant que
    // la réception n'est pas faite. Le gain ne se déduit donc PAS de l'étape — il se
    // déclare, par « Marquer gagnée », une fois le travail réellement fini. Cette
    // déclaration sert à deux choses : savoir où poser une affaire qu'on gagne, et
    // savoir qu'une affaire gagnée qu'on recule doit se rouvrir.
    // Arbitré le 19/09/2026, en deux temps : d'abord « gagnée seulement à la dernière
    // étape », puis « gagnée une fois cette étape terminée ».
    gain: { expertise: 'rdv_complementaire', amo: 'amo_reception' },
    // LES JALONS SUIVIS PAR L'OBJECTIF MENSUEL, et rien d'autre. Le bloc posé au-dessus
    // des deux pipelines de missions compare, sur la période choisie, ce qui est fait à
    // ce qui était visé. Les valeurs, elles, ne sont pas ici : elles se règlent à l'écran
    // et vivent dans `settings` — ce tableau ne dit que CE QU'ON COMPTE.
    //
    // ⚠ Chaque jalon nomme UNE ÉTAPE PAR MÉTIER, jamais une seule pour les deux. Les
    // deux déroulés se répondent un à un mais n'ont pas les mêmes clés : « Qualifié »
    // s'appelle `qualifie` en expertise et `amo_cadrage` en AMO, et le RDV sur le terrain
    // `rdv` d'un côté, `amo_programme` de l'autre. Comparer des rangs dans la liste
    // fusionnée ne marcherait pas — les étapes de l'AMO suivent celles de l'expertise,
    // donc « Qualifié » côté AMO passerait pour postérieur à « Clôturé facturé » côté
    // expertise. C'est `aAtteint()` qui fait la comparaison, dans la liste du métier.
    //
    // Le dernier jalon n'a pas d'étape : c'est du CHIFFRE D'AFFAIRES, et il lit
    // l'objectif de CA déjà saisi pour la structure — un chiffre, une source.
    objectifs: [
      { cle: 'leads', label: 'Leads', unite: 'nombre' },
      { cle: 'qualifie', label: 'Qualifiés', unite: 'nombre', etape: { expertise: 'qualifie', amo: 'amo_cadrage' } },
      { cle: 'rdv', label: 'RDV terrain', unite: 'nombre', etape: { expertise: 'rdv', amo: 'amo_programme' } },
      { cle: 'ca', label: 'Missions signées', unite: 'euros' },
    ],
    // COMMENT UNE MISSION SE FACTURE, en trois fois. Arbitré par Mickael le
    // 19/09/2026 : 40 % à la signature, 40 % au suivi intermédiaire, 20 % à la
    // réception. Chaque échéance est accrochée à une ÉTAPE du pipeline :
    // avancer la mission débloque la facture, plutôt que de laisser quelqu'un
    // décider de tête quand appeler l'argent.
    // ⚠ L'ACOMPTE PART DE LA SIGNATURE, pas du démarrage du chantier — corrigé le
    // même jour. Entre « Mission AMO signée » et « Démarrage chantier » il y a la
    // consultation des entreprises : des semaines de travail que l'acompte est
    // précisément là pour couvrir. L'attacher au démarrage revenait à les avancer.
    // ⚠ Les parts sont déclarées ici et nulle part ailleurs. Le dernier montant est
    // calculé par DIFFÉRENCE (voir `echeancesDe`) : trois pourcentages arrondis
    // chacun de leur côté ne retombent pas toujours sur le total, et une mission
    // facturée à un centime près du contrat est un litige en puissance.
    // Seule l'AMO en a un — une expertise se facture en une fois, et ira sur Stripe.
    echeances: {
      amo: [
        { cle: 'acompte', label: 'Acompte', part: 40, stage: 'amo_contrat' },
        { cle: 'intermediaire', label: 'Situation intermédiaire', part: 40, stage: 'amo_chantier' },
        { cle: 'solde', label: 'Solde', part: 20, stage: 'amo_reception' },
      ],
    },
    // Le cabinet mène deux métiers au déroulé différent : l'expertise, qui va du
    // constat au rapport, et l'AMO, qui accompagne un chantier de la définition du
    // besoin à la réception. D'où deux pipelines — `mission` dit à laquelle une étape
    // appartient, une étape sans `mission` étant commune aux deux.
    //
    // Une seule liste, et non deux tableaux séparés : les clés y restent uniques, donc
    // stageOf(), stageIndex() et weightedAmount() continuent de retrouver une étape à
    // partir de la seule affaire, sans qu'on ait à leur passer son type de mission.
    //
    // Les clés « lead » et « rdv1 » sont celles qu'écrit la prise de rendez-vous du site
    // btpexpertise.fr (fonction creer_prospect_btp de Supabase) : ne pas les renommer,
    // et les garder communes — un lead arrive avant qu'on sache de quoi il s'agit.
    //
    // ⚠ Ces deux-là doivent rester les DEUX PREMIÈRES de la liste, toutes missions
    // confondues. reachedRdv() compare des rangs dans cette liste fusionnée pour dire
    // si le rendez-vous a eu lieu : toute étape propre à une mission se trouvant après
    // rdv1, l'atteindre prouve que le RDV est passé. Glisser une étape de mission avant
    // rdv1 ferait mentir la colonne « RDV » de la vue d'ensemble, sans rien casser
    // d'autre — le genre de défaut qu'on ne voit qu'en relisant les chiffres.
    // À partir du RDV sur place (expertise) ou du contrat signé (AMO), la mission est
    // engagée : ces étapes comptent en réalisation (`delivery`).
    stages: [
      { key: 'lead', label: 'Nouveau', p: 5 },
      { key: 'rdv1', label: 'RDV tel', p: 10 },
      // Expertise : du constat au rapport
      { key: 'qualifie', label: 'Qualifié', p: 20, mission: 'expertise' },
      { key: 'proposition', label: 'Lettre de mission', p: 60, mission: 'expertise' },
      { key: 'rdv', label: 'RDV sur place', p: 100, delivery: true, mission: 'expertise' },
      { key: 'mission_realisee', label: 'Rédaction en cours', p: 100, delivery: true, mission: 'expertise' },
      { key: 'rapport_remis', label: 'Rapport émis', p: 100, delivery: true, mission: 'expertise' },
      { key: 'rdv_complementaire', label: 'Clôturé facturé', p: 100, delivery: true, mission: 'expertise' },
      // AMO : de la définition du besoin à la réception des travaux
      { key: 'amo_cadrage', label: 'Qualifié', p: 20, mission: 'amo' },
      // La signature de la mission AMO ouvre la réalisation — c'est ce que dit le
      // commentaire ci-dessus depuis le début, le `delivery` manquait seulement. Une
      // mission signée n'est plus une probabilité : d'où p: 100, comme toute étape de
      // réalisation. Le seuil du CA prévisionnel reste déclaré par `engagement`, par
      // clé et non par p — les deux notions ne se confondent pas.
      { key: 'amo_contrat', label: 'Mission AMO signée', p: 100, delivery: true, mission: 'amo' },
      { key: 'amo_programme', label: 'RDV terrain', p: 100, delivery: true, mission: 'amo' },
      { key: 'amo_consultation', label: 'Démarrage chantier', p: 100, delivery: true, mission: 'amo' },
      { key: 'amo_chantier', label: 'Suivi intermédiaire', p: 100, delivery: true, mission: 'amo' },
      { key: 'amo_reception', label: 'Réception chantiers', p: 100, delivery: true, mission: 'amo' },
    ],
    fields: [
      // Vit dans deals.fields (jsonb) : pas de colonne, donc pas de migration.
      // Vide = expertise, le métier historique et le cas du lead venu du site.
      { key: 'type_mission', label: 'Type de mission', type: 'select', options: [['expertise', 'Expertise'], ['amo', 'AMO / accompagnement']], value: 'expertise', half: true },
      // Le niveau commande les points de charge du chargé d'affaires. Les six valeurs
      // sont rangées par métier dans la liste déroulante.
      { key: 'niveau', label: 'Niveau de mission', type: 'select', half: true,
        options: ['expertise', 'amo'].map(m => ({
          groupe: m === 'amo' ? 'AMO' : 'Expertise',
          options: NIVEAUX_BTP.filter(n => n.mission === m).map(n => [n.key, `${n.label} — ${n.points} pt${n.points > 1 ? 's' : ''} · ${n.tarif}`]),
        })),
        hint: `Sert au calcul de la charge du chargé d'affaires (${CAPACITE_BTP.points} points maximum).` },
      { key: 'problematique', label: 'Type de problématique', type: 'select', options: ['Malfaçons', 'Fissures', 'Humidité', 'Plomberie', 'Électricité', 'Non-conformité', 'Litige travaux', 'Réception de travaux', 'AMO / accompagnement', 'Avant achat', 'Autre'] },
      { key: 'type_bien', label: 'Type de bien', type: 'select', options: ['Maison', 'Appartement', 'Immeuble', 'Local pro', 'Autre'] },
      { key: 'contexte', label: 'Contexte', type: 'select', options: ['Particulier', 'Entreprise', 'Litige', 'Achat immobilier', 'Travaux en cours'] },
      { key: 'adresse', label: 'Adresse du bien', type: 'text' },
      { key: 'urgence', label: 'Urgent', type: 'checkbox' },
      { key: 'date_visite', label: 'Date de visite', type: 'date' },
      { key: 'date_rapport', label: 'Date remise rapport', type: 'date' },
      // Facturation : suivi à la main en attendant le raccordement à Stripe.
      { key: 'facture_num', label: 'N° de facture', type: 'text', half: true },
      { key: 'facture_date', label: 'Facturée le', type: 'date', half: true },
      { key: 'paiement_date', label: 'Payée le', type: 'date', half: true },
    ],
  },
  courtage: {
    key: 'courtage', label: 'La Référence Courtage', short: 'Courtage', color: '#1D5B78',
    accent: '#1D5B78', on: '#FFFFFF', accent2: '#184C65', soft: '#E8EFF2', ink: '#174A61',
    amountLabel: 'Commission estimée (€)',
    rdvStage: 'rdv',
    stages: [
      { key: 'lead', label: 'Nouveau lead', p: 5 },
      { key: 'qualifie', label: 'Qualifié', p: 15 },
      { key: 'rdv', label: 'RDV réalisé', p: 30 },
      { key: 'pieces', label: 'Pièces en attente', p: 40 },
      { key: 'etude', label: 'Dossier complet / étude', p: 55 },
      { key: 'banque', label: 'Transmis banque', p: 70 },
      { key: 'offre', label: 'Offre éditée', p: 90 },
    ],
    fields: [
      { key: 'type_financement', label: 'Type de financement', type: 'select', options: ['Crédit immobilier', 'Regroupement de crédits', 'Assurance emprunteur', 'Crédit professionnel'] },
      { key: 'montant_projet', label: 'Montant du projet (€)', type: 'number' },
      { key: 'montant_financement', label: 'Montant à financer (€)', type: 'number' },
      { key: 'apport', label: 'Apport (€)', type: 'number' },
      { key: 'objectif', label: 'Objectif', type: 'select', options: ['Résidence principale', 'Investissement locatif', 'Résidence secondaire', 'Rachat / renégociation', 'Trésorerie', 'Professionnel'] },
      { key: 'partenaire_banque', label: 'Partenaire bancaire', type: 'text' },
      { key: 'pieces_manquantes', label: 'Pièces manquantes', type: 'textarea' },
      { key: 'commission_reelle', label: 'Commission réelle (€)', type: 'number' },
      { key: 'date_offre', label: "Date de l'offre", type: 'date' },
    ],
  },
  propulsion: {
    key: 'propulsion', label: 'Propulsion', short: 'Propulsion', color: '#E24C86',
    accent: '#E24C86', on: '#2F101C', accent2: '#D03C75', soft: '#FCEDF3', ink: '#782847',
    amountLabel: 'Valeur du contrat HT (€)',
    rdvStage: 'audit',
    stages: [
      { key: 'lead', label: 'Prospect', p: 5 },
      { key: 'qualifie', label: 'Qualifié', p: 15 },
      { key: 'audit', label: 'Audit / RDV', p: 30 },
      { key: 'proposition', label: 'Proposition envoyée', p: 55 },
      { key: 'nego', label: 'Négociation', p: 75 },
      { key: 'onboarding', label: 'Onboarding', p: 100, delivery: true },
    ],
    fields: [
      { key: 'activite_client', label: 'Activité du client', type: 'text' },
      { key: 'besoins', label: 'Besoins', type: 'textarea' },
      { key: 'reseaux', label: 'Réseaux concernés', type: 'text' },
      { key: 'prestations', label: 'Prestations demandées', type: 'select', options: ['Réseaux sociaux', 'Meta Ads', 'Création de contenus', 'Site internet', 'Génération de leads', 'Pack complet'] },
      { key: 'budget', label: 'Budget client (€/mois)', type: 'number' },
      { key: 'montant_mensuel', label: 'Montant mensuel HT (€)', type: 'number' },
      { key: 'duree_mois', label: "Durée d'engagement (mois)", type: 'number' },
      { key: 'date_demarrage', label: 'Date de démarrage', type: 'date' },
    ],
  },
};

export const ACTIVITY_KEYS = Object.keys(ACTIVITIES);

// Une affaire encore en attente du premier entretien. Une activite qui ne declare
// pas `avantEntretien` n'a pas cette notion : la fonction repond alors non, et rien
// ne change pour elle — c'est voulu, seul BTP Expertise sépare sa base en deux.
export const estNouveauLead = (deal) =>
  deal?.status === 'open' && !!ACTIVITIES[deal.activity]?.avantEntretien?.includes(deal.stage);

// Une affaire dont le client s'est engage : elle a atteint l'etape declaree par
// `engagement` pour son metier, ou une etape posterieure du meme deroule. Le rang
// se lit dans la liste du metier, jamais dans la liste complete : les
// etapes d'AMO suivent celles de l'expertise dans le tableau, comparer les deux
// n'aurait pas de sens. Une affaire perdue ne compte plus ; une affaire encore aux
// etapes communes (avant l'entretien) n'a pas de metier, donc pas d'engagement.
export const estEngagee = (deal) => {
  const a = ACTIVITIES[deal?.activity];
  if (!a?.engagement || deal.status === 'lost') return false;
  const mission = missionDe(deal);
  const etapes = a.stages.filter(st => st.mission === mission);
  const seuil = etapes.findIndex(st => st.key === a.engagement[mission]);
  const rang = etapes.findIndex(st => st.key === deal.stage);
  return seuil >= 0 && rang >= seuil;
};

export const CHANNELS = [
  'Google organique / SEO', 'Google Ads', 'Meta Ads', 'Instagram organique', 'Facebook organique', 'LinkedIn',
  'Site internet direct', 'Recommandation client', 'Ancien client', 'Partenaire / apporteur', 'Prospection directe',
  'Réseau professionnel', 'Téléphone / autre',
];
export const PAID_CHANNELS = ['Google Ads', 'Meta Ads'];

// D'ou vient une demande, en cinq mots. Les treize canaux ci-dessus servent a la
// SAISIE, au detail pres ; cette table sert a la LECTURE : ce qu'on veut savoir
// d'un coup d'oeil, c'est par quelle porte l'affaire est entree, pas le canal
// exact. Un canal absent de la table tombe dans « En direct » — le cas de la
// prospection, du telephone et de tout ce qui arrive sans intermediaire.
//
// « Partenaire » ne figure pas ici : il se lit sur l'apporteur de l'affaire
// (`referrer_org_id` / `referrer_contact_id`), qui porte un nom, et un nom vaut
// mieux qu'une categorie. Voir `origineDe` dans btp.js.
export const ORIGINE_PAR_CANAL = {
  'Site internet direct': 'Site internet',
  'Google organique / SEO': 'Site internet',
  'Google Ads': 'Site internet',
  'Meta Ads': 'Meta Ads',
  'Instagram organique': 'Meta Ads',
  'Facebook organique': 'Meta Ads',
  'Recommandation client': 'Recommandation client',
  'Ancien client': 'Recommandation client',
};
export const ORIGINE_DEFAUT = 'En direct';

export const LOST_REASONS = ['Prix', 'Délai', 'Concurrent', 'Sans réponse', 'Hors cible', 'Projet abandonné', 'Autre'];

// Ce qu'une tâche peut être. Le groupe ne sert qu'à ranger la liste déroulante : la
// colonne `activities.type` est un texte libre, sans contrainte en base, et `actType`
// sait afficher une valeur qu'il ne connaît pas. Ajouter une ligne ici suffit donc,
// et rien ne casse sur les tâches déjà enregistrées.
export const ACTIVITY_TYPES = [
  // Commercial : la relation avec un client ou un prospect
  { key: 'appel', label: 'Appel', icon: '📞', groupe: 'Commercial' },
  { key: 'rdv', label: 'RDV', icon: '📅', groupe: 'Commercial' },
  { key: 'visite', label: 'Visite', icon: '🏠', groupe: 'Commercial' },
  { key: 'envoi', label: 'Envoi devis / proposition', icon: '📄', groupe: 'Commercial' },
  { key: 'relance', label: 'Relance', icon: '🔁', groupe: 'Commercial' },
  { key: 'pieces', label: 'Récupération pièces', icon: '📎', groupe: 'Commercial' },
  { key: 'signature', label: 'Signature / closing', icon: '✍️', groupe: 'Commercial' },
  { key: 'avis', label: "Demande d'avis", icon: '⭐', groupe: 'Commercial' },
  { key: 'partenaire', label: 'Contact partenaire', icon: '🤝', groupe: 'Commercial' },
  // Communication et marketing : ce qui se fait sans interlocuteur en face
  { key: 'contenu', label: 'Création de contenu', icon: '🎬', groupe: 'Communication & marketing' },
  { key: 'publication', label: 'Publication réseaux sociaux', icon: '📣', groupe: 'Communication & marketing' },
  { key: 'campagne', label: 'Campagne publicitaire', icon: '🎯', groupe: 'Communication & marketing' },
  { key: 'emailing', label: 'Emailing / newsletter', icon: '✉️', groupe: 'Communication & marketing' },
  { key: 'site', label: 'Site internet', icon: '🌐', groupe: 'Communication & marketing' },
  // Interne : ce qui fait tourner la structure
  { key: 'reunion', label: 'Réunion interne', icon: '👥', groupe: 'Interne' },
  { key: 'recrutement', label: 'Recrutement', icon: '🧑‍💼', groupe: 'Interne' },
  { key: 'admin', label: 'Administratif', icon: '🗂', groupe: 'Interne' },
  { key: 'compta', label: 'Comptabilité / facturation', icon: '💶', groupe: 'Interne' },
  { key: 'autre', label: 'Autre', icon: '•', groupe: 'Interne' },
];

// Le degré de traitement d'une tâche. Trois valeurs, et c'est volontairement
// court : au-delà, plus personne ne les distingue au moment de saisir.
//
// « Retard » se POSE à la main tout en se CALCULANT aussi depuis l'échéance :
// une tâche dont la date est passée tombe dans ce rang sans qu'on ait à y
// penser, et on peut l'y mettre soi-même pour un retard que la date ne dit pas
// (un dossier qui traîne, une relance oubliée). Les deux chemins mènent au
// même endroit, c'est ce qui évite d'avoir à choisir entre eux.
//
// Stocké dans activities.priority — texte libre, donc une valeur s'ajoute ici
// sans migration. NULL vaut « À faire » : l'écrasante majorité des tâches.
export const PRIORITES = [
  { key: 'urgent', label: 'Urgent', icon: '🔥' },
  { key: 'retard', label: 'Retard', icon: '⚠' },
  { key: 'afaire', label: 'À faire', icon: '•' },
];

export const CONTACT_TYPES = ['Prospect', 'Client', 'Partenaire', 'Apporteur', 'Fournisseur'];
export const ORG_TYPES = ['Client', 'Prospect', 'Partenaire', 'Banque', 'Fournisseur'];
export const PARTNER_JOBS = ['Agent immobilier', 'Agence immobilière', 'Notaire', 'Avocat', 'Syndic', 'Administrateur de biens', 'Courtier', 'Expert-comptable', 'Banque', 'Artisan', 'Architecte', 'Investisseur', 'Chasseur immobilier', 'Autre'];
export const CLIENT_STATUS = ['Prospect', 'Client actif', 'Ancien client'];

export const ROLES = {
  direction: { label: 'Direction', description: 'Vision complète, tableaux de bord, paramétrage' },
  propulsion: { label: 'Propulsion', description: 'Pipeline Propulsion, contacts et organisations liés' },
  // La cle est la valeur STOCKEE dans profiles.role, et la contrainte CHECK
  // de la base n'accepte qu'elle : direction, propulsion, charge_affaires.
  // 'commercial' a ete renomme le 18/09/2026, en base et ici d'un seul geste.
  charge_affaires: { label: "Chargé d'affaires", description: 'Uniquement les affaires et contacts dont il est responsable' },
};

// Les rôles qu'on propose en créant un compte. « Propulsion » n'y figure plus :
// l'agence ne recrute pas par le CRM, et un rôle qu'on n'attribue jamais n'a pas
// sa place dans un choix. Il reste dans ROLES, sans quoi le compte qui le porte
// déjà s'afficherait avec sa clé brute au lieu de son libellé.
export const ROLES_ATTRIBUABLES = ['direction', 'charge_affaires'];

// À quelle mission une affaire appartient : 'amo' ou 'expertise'.
//
// Le type saisi fait foi. À défaut, on lit la problématique : le formulaire du site y
// range le besoin choisi en tête (« AMO / accompagnement ») quand il n'envoie pas de
// champ dédié, et les affaires créées avant l'ajout de type_mission n'ont que ça.
// Sans l'un ni l'autre, c'est une expertise — le métier historique du cabinet.
const DIT_AMO = /(^|[^a-zà-ÿ])amo([^a-zà-ÿ]|$)|ouvrage/i;
export const missionDe = (deal) => {
  const t = deal?.fields?.type_mission;
  if (t === 'amo' || t === 'expertise') return t;
  return DIT_AMO.test(deal?.fields?.besoin || deal?.fields?.problematique || '') ? 'amo' : 'expertise';
};

/**
 * L'échéancier d'une affaire : ce qu'il y a à facturer, quand, et pour combien.
 *
 * Rend une liste `{cle, label, part, stage, etape, montant, atteinte}`, ou `[]` pour
 * une activité ou un métier qui n'en déclare pas — une expertise se facture en une
 * fois, et rien ne change pour les trois autres pipelines.
 *
 * ⚠ LE DERNIER MONTANT EST LE RESTE, jamais un pourcentage. 40 %, 40 % et 20 % de
 * 3 333,33 € arrondis chacun de leur côté ne redonnent pas 3 333,33 € : la somme des
 * factures doit retomber au centime sur le montant de la mission, sinon le client a
 * raison de contester la dernière.
 *
 * `atteinte` dit si l'étape déclenchante est passée — le rang se compare DANS LA
 * LISTE DU MÉTIER, jamais dans la liste complète : les étapes de l'AMO suivent celles
 * de l'expertise dans le tableau, leurs indices ne sont pas comparables.
 */
export const echeancesDe = (deal) => {
  const a = ACTIVITIES[deal?.activity];
  const mission = missionDe(deal);
  const plan = a?.echeances?.[mission];
  if (!plan?.length) return [];
  const etapes = a.stages.filter(s => !s.mission || s.mission === mission);
  const rangAffaire = etapes.findIndex(s => s.key === deal.stage);
  const total = Math.round((Number(deal.amount) || 0) * 100) / 100;

  let reste = total;
  return plan.map((e, i) => {
    const dernier = i === plan.length - 1;
    const montant = dernier ? Math.round(reste * 100) / 100
                            : Math.round(total * e.part) / 100;
    reste = Math.round((reste - montant) * 100) / 100;
    const rangEtape = etapes.findIndex(s => s.key === e.stage);
    return {
      ...e,
      montant,
      etape: etapes[rangEtape]?.label ?? e.stage,
      atteinte: rangEtape >= 0 && rangAffaire >= rangEtape,
    };
  });
};

/** Une échéance par sa clé, avec son montant — pour la facturer. */
export const echeanceDe = (deal, cle) => echeancesDe(deal).find(e => e.cle === cle) ?? null;

// Traduire une étape d'un métier vers l'autre. Les deux déroulés de BTP Expertise se
// répondent un à un — Qualifié ↔ Qualifié, Lettre de mission ↔ Mission AMO, RDV sur
// place ↔ RDV terrain… — donc le RANG dans la liste du métier suffit : aucune table de
// correspondance à tenir à jour, elle se périmerait au premier renommage.
//
// Rend `null` quand il n'y a rien à faire : étape commune aux deux métiers (avant
// l'entretien), étape déjà du bon métier, ou activité sans métiers du tout — c'est le
// cas des trois autres pipelines, que cette fonction laisse donc intacts.
export const etapeEquivalente = (activity, stage, mission) => {
  const a = ACTIVITIES[activity];
  const st = a?.stages.find(x => x.key === stage);
  if (!st?.mission || st.mission === mission) return null;
  const depart = a.stages.filter(x => x.mission === st.mission);
  const arrivee = a.stages.filter(x => x.mission === mission);
  if (!arrivee.length) return null;
  const rang = depart.findIndex(x => x.key === stage);
  return arrivee[Math.min(rang, arrivee.length - 1)].key;
};

// L'étape où se tient une affaire gagnée : la dernière du déroulé de son métier.
// ⚠ Elle ne FAIT pas gagner — chez BTP Expertise le gain se déclare à la main, une
// fois la réception terminée. Elle sert à savoir où poser une affaire qu'on gagne, et
// à rouvrir celle qu'on recule. Une activité qui ne déclare pas `gain` garde l'ancienne
// règle, où toute étape de réalisation vaut gain : c'est le cas de Propulsion, et c'est
// pourquoi les trois autres pipelines ne changent pas. Une étape commune aux deux
// métiers (avant l'entretien) n'est jamais finale.
export const estEtapeFinale = (activity, stage) => {
  const a = ACTIVITIES[activity];
  const st = a?.stages.find(x => x.key === stage);
  if (!st) return false;
  if (!a.gain) return !!st.delivery;
  if (!st.mission) return false;
  const etapes = a.stages.filter(x => x.mission === st.mission);
  const seuil = etapes.findIndex(x => x.key === a.gain[st.mission]);
  const rang = etapes.findIndex(x => x.key === stage);
  return seuil >= 0 && rang >= seuil;
};

// Où « Marquer gagnée » emmène l'affaire, pour un métier donné. À défaut de
// déclaration, la première étape de réalisation — l'ancien comportement, conservé pour
// les activités sans métiers.
export const etapeFinale = (activity, mission) => {
  const a = ACTIVITIES[activity];
  if (!a) return null;
  if (a.gain?.[mission]) return a.gain[mission];
  return stagesDe(activity, mission).find(s => s.delivery)?.key || null;
};

// Les étapes d'une mission : les siennes, plus les communes. L'ordre de la liste est
// conservé, c'est celui du déroulé.
export const stagesDe = (activity, mission) =>
  (ACTIVITIES[activity]?.stages || []).filter(s => !s.mission || s.mission === mission);

export function stageOf(activity, key) {
  return ACTIVITIES[activity]?.stages.find(s => s.key === key);
}
export function stageIndex(activity, key) {
  return ACTIVITIES[activity]?.stages.findIndex(s => s.key === key) ?? -1;
}
/**
 * Cette affaire a-t-elle ATTEINT l'étape `cle` — maintenant, ou à un moment ?
 *
 * ⚠ LE RANG SE COMPARE DANS LA LISTE DU MÉTIER, jamais dans la liste complète des
 * étapes. Chez BTP Expertise, celles de l'AMO suivent celles de l'expertise dans le
 * tableau : « Qualifié » côté AMO est au rang 8 de la liste fusionnée, donc plus
 * loin que « Clôturé facturé » (rang 7) côté expertise, alors que les deux métiers
 * commencent au même endroit. C'est le même piège que celui d'`estEngagee()`.
 *
 * On regarde l'étape courante ET l'historique : une affaire qui avance vite peut
 * n'avoir jamais été vue à l'étape intermédiaire, elle l'a pourtant franchie. Une
 * affaire gagnée a tout franchi, par construction.
 */
export function aAtteint(deal, cle) {
  if (!deal || !cle) return false;
  if (deal.status === 'won') return true;
  const etapes = stagesDe(deal.activity, missionDe(deal));
  const cible = etapes.findIndex(s => s.key === cle);
  if (cible < 0) return false;   // étape d'un autre métier : ne rien affirmer
  const rang = (k) => etapes.findIndex(s => s.key === k);
  const vus = [rang(deal.stage), ...(deal.stage_history || []).map(h => rang(h.stage))];
  return Math.max(...vus) >= cible;
}

export function reachedRdv(deal) {
  const a = ACTIVITIES[deal.activity];
  if (!a) return false;
  if (deal.status === 'won') return true;
  const rdvIdx = stageIndex(deal.activity, a.rdvStage);
  const hist = (deal.stage_history || []).map(h => stageIndex(deal.activity, h.stage));
  return Math.max(stageIndex(deal.activity, deal.stage), ...hist) >= rdvIdx;
}
export function weightedAmount(deal) {
  if (deal.status === 'won') return Number(deal.amount) || 0;
  if (deal.status === 'lost') return 0;
  const s = stageOf(deal.activity, deal.stage);
  return ((Number(deal.amount) || 0) * (s ? s.p : 0)) / 100;
}
