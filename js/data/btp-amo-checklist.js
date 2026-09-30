// La check-list d'une mission AMO — BTP Expertise.
//
// ⚠ CE RÉFÉRENTIEL-CI VIT DANS LE DÉPÔT, à la différence de celui de la
// check-list d'expertise. La raison n'est pas un changement d'avis : les 8
// zones et 54 points de la visite viennent d'un produit commercial tiers et le
// dépôt est PUBLIC, donc ils s'importent à la main, hors dépôt. Ces points-ci
// sont écrits pour le cabinet — rien à protéger, et tout à gagner à les avoir
// versionnés, relisibles et corrigibles en un commit.
//
// ⚠ ILS ATTENDENT LA RELECTURE DE MICKAEL (30/09/2026). Élodie : « vas-y fais,
// on va tester ». C'est donc un POINT DE DÉPART éprouvable, pas la doctrine du
// cabinet : les délais contractuels, les mentions de la lettre de mission et la
// liste exacte des attestations exigées viennent de son contrat type, que le
// CRM n'a pas.
//
// ⚠ UNE MISSION AMO N'EST PAS UNE VISITE, et c'est ce qui commande toute la
// forme. La check-list d'expertise se remplit debout, en une fois, devant un
// bâtiment ; celle-ci se remplit au bureau sur plusieurs mois, phase par
// phase. Elle se rattache donc à l'AFFAIRE et non à un relevé, et chaque point
// garde la date et l'auteur de son geste — sans quoi on ne peut plus dire
// quand une alerte a été émise, ce qui est précisément ce qu'on vient
// chercher le jour où ça tourne mal.
//
// ⚠ LES PHASES NE SONT PAS RECOPIÉES : elles viennent de `PHASES_AMO`
// (`schema.js`), qui porte déjà leur libellé, leur contenu et leur poids de
// facturation. Deux listes auraient fini par ne plus dire la même chose, et
// l'écart ne se serait vu que sur une mission.
import { PHASES_AMO, FRONTIERE_AMO } from './schema.js';

export { PHASES_AMO, FRONTIERE_AMO };

// Les trois états d'un point. ⚠ CE NE SONT PAS CEUX DE LA VISITE : « OK /
// Anomalie / N.V. » décrit ce qu'on observe, alors qu'ici on décrit ce qu'on a
// FAIT. Et « à faire » n'est pas un état — c'est l'absence de ligne qui le dit,
// même principe que le relevé.
export const ETATS_AMO = {
  fait:       { mot: 'Fait',       aide: 'Le point est traité',                     ton: 'vert' },
  sans_objet: { mot: 'Sans objet', aide: 'Ne s’applique pas à cette mission',  ton: 'muted' },
  alerte:     { mot: 'Vigilance',  aide: 'Un point signalé par écrit au client',    ton: 'rouge' },
};

// ⚠ LES IDENTIFIANTS SONT STABLES ET NE SE RÉEMPLOIENT JAMAIS. Ils sont la clé
// du suivi en base (`btp_amo_suivi.point_id`) : renuméroter en insérant un
// point au milieu rattacherait des gestes déjà faits au mauvais libellé, sur
// des missions en cours. Pour retirer un point, on le marque `retire: true`
// plutôt que d'effacer sa ligne — ce qui a été coché reste lisible.
//
// `frontiere: true` marque les points qui touchent la limite entre l'assistance
// et la maîtrise d'œuvre. Ce n'est pas une décoration : la franchir fait
// basculer la mission dans la responsabilité décennale du constructeur
// (`FRONTIERE_AMO`, déjà affichée sur l'écran AMO). Ce sont les points sur
// lesquels une mission se perd, et ils doivent se voir avant les autres.
export const POINTS_AMO = [
  // ---- 1. Cadrage
  { id: 1, phase: 1, rang: 1, libelle: 'Besoin du maître d’ouvrage écrit dans ses mots, et relu avec lui',
    aide: 'Ce qu’il demande, pas ce qu’on a compris.' },
  { id: 2, phase: 1, rang: 2, libelle: 'Contraintes recensées : occupation, délais imposés, voisinage, copropriété' },
  { id: 3, phase: 1, rang: 3, libelle: 'Enveloppe annoncée, et ce qu’elle comprend',
    aide: 'Travaux seuls ? Honoraires compris ? Provision pour aléas ?' },
  { id: 4, phase: 1, rang: 4, libelle: 'Calendrier général et date butoir s’il y en a une' },
  { id: 5, phase: 1, rang: 5, libelle: 'Architecte ou maître d’œuvre déjà missionné ?', frontiere: true,
    aide: 'S’il y en a un, notre périmètre s’arrête où le sien commence. S’il n’y en a pas, c’est le cas où l’on nous demandera de le remplacer.' },
  { id: 6, phase: 1, rang: 6, libelle: 'Autorisations d’urbanisme nécessaires, et qui les dépose' },
  { id: 7, phase: 1, rang: 7, libelle: 'Lettre de mission signée, exclusions écrites noir sur blanc', frontiere: true,
    aide: 'Le contrat définit les actes inclus ET les exclusions. C’est lui qu’on relira en cas de litige.' },

  // ---- 2. Préparation
  { id: 8,  phase: 2, rang: 1, libelle: 'Programme fonctionnel : pièce par pièce, ce qui est attendu' },
  { id: 9,  phase: 2, rang: 2, libelle: 'Découpage en lots, et lesquels sont hors périmètre' },
  { id: 10, phase: 2, rang: 3, libelle: 'Budget par lot, avec une provision pour aléas' },
  { id: 11, phase: 2, rang: 4, libelle: 'Ce que le maître d’ouvrage fournit lui-même' },
  { id: 12, phase: 2, rang: 5, libelle: 'Diagnostics obligatoires commandés et reçus',
    aide: 'Amiante, plomb, DPE selon l’âge du bien et la nature des travaux.' },
  { id: 13, phase: 2, rang: 6, libelle: 'Aucune préconisation écrite ne vaut prescription d’exécution', frontiere: true,
    aide: 'Décrire un besoin est de l’assistance ; écrire comment exécuter est un acte de conception.' },

  // ---- 3. Consultation
  { id: 14, phase: 3, rang: 1, libelle: 'Au moins trois entreprises consultées par lot' },
  { id: 15, phase: 3, rang: 2, libelle: 'Dossier de consultation identique pour tous' },
  { id: 16, phase: 3, rang: 3, libelle: 'Décennale à jour, et couvrant l’activité exacte du lot',
    aide: 'Une décennale « maçonnerie » ne couvre pas l’électricité. C’est l’activité qui compte, pas l’existence de l’attestation.' },
  { id: 17, phase: 3, rang: 4, libelle: 'Attestation de vigilance URSSAF et Kbis de moins de trois mois' },
  { id: 18, phase: 3, rang: 5, libelle: 'Tableau comparatif des offres, à périmètre égal' },
  { id: 19, phase: 3, rang: 6, libelle: 'Écarts et manques relevés lot par lot' },
  { id: 20, phase: 3, rang: 7, libelle: 'Le choix de l’entreprise est celui du maître d’ouvrage, par écrit', frontiere: true,
    aide: 'On compare, on éclaire, on recommande. On ne choisit pas à sa place.' },

  // ---- 4. Accompagnement travaux
  { id: 21, phase: 4, rang: 1, libelle: 'Réunion de lancement tenue, compte rendu diffusé' },
  { id: 22, phase: 4, rang: 2, libelle: 'Périodicité des points de chantier fixée, et tenue' },
  { id: 23, phase: 4, rang: 3, libelle: 'Compte rendu après chaque visite, envoyé sous 48 h' },
  { id: 24, phase: 4, rang: 4, libelle: 'Avancement constaté avant chaque situation de paiement' },
  { id: 25, phase: 4, rang: 5, libelle: 'Aucun avenant accepté sans chiffrage écrit et accord du client' },
  { id: 26, phase: 4, rang: 6, libelle: 'Alertes formalisées par écrit : retard, malfaçon, dérive budgétaire',
    aide: 'Une alerte dite au téléphone n’a jamais eu lieu.' },
  { id: 27, phase: 4, rang: 7, libelle: 'Aucune instruction donnée directement à une entreprise', frontiere: true,
    aide: 'Tout passe par le maître d’ouvrage. Diriger une entreprise, c’est piloter le chantier.' },

  // ---- 5. Réception
  { id: 28, phase: 5, rang: 1, libelle: 'Pré-réception : réserves repérées avant le jour J' },
  { id: 29, phase: 5, rang: 2, libelle: 'Liste des réserves par lot, avec photo' },
  { id: 30, phase: 5, rang: 3, libelle: 'Procès-verbal signé, réserves annexées' },
  { id: 31, phase: 5, rang: 4, libelle: 'DOE et notices remis au client' },
  { id: 32, phase: 5, rang: 5, libelle: 'Conseil donné sur la retenue de garantie et le solde' },
  { id: 33, phase: 5, rang: 6, libelle: 'Date de départ de la garantie de parfait achèvement notée',
    aide: 'C’est elle qui fixe le rendez-vous des onze mois.' },

  // ---- 6. Clôture
  { id: 34, phase: 6, rang: 1, libelle: 'Levée des réserves suivie jusqu’au bout' },
  { id: 35, phase: 6, rang: 2, libelle: 'Attestations et garanties classées' },
  { id: 36, phase: 6, rang: 3, libelle: 'Décompte final vérifié' },
  { id: 37, phase: 6, rang: 4, libelle: 'Bilan de fin de mission remis au client' },
  { id: 38, phase: 6, rang: 5, libelle: 'Point à onze mois programmé, avant la fin de la GPA',
    aide: 'Le dernier moment pour faire jouer la garantie de parfait achèvement.' },
];

export const pointsDePhase = (num) =>
  POINTS_AMO.filter(p => p.phase === num && !p.retire).sort((a, b) => a.rang - b.rang);

export const tousLesPointsAmo = () => POINTS_AMO.filter(p => !p.retire);

export const pointAmo = (id) => POINTS_AMO.find(p => p.id === id) || null;

// ⚠ LES POINTS DE FRONTIÈRE SE COMPTENT À PART, et l'écran les montre à part.
// Ce sont ceux sur lesquels une mission bascule dans la responsabilité
// décennale ; les noyer dans les trente-huit autres reviendrait à ne pas les
// avoir écrits.
export const pointsFrontiere = () => POINTS_AMO.filter(p => p.frontiere && !p.retire);
