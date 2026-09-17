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
    contenu: 'Périmètre limité, peu de lots, durée courte, accompagnement contenu.', tarif: '5 à 8 % des travaux HT' },
  { key: 'amo_etendue', label: 'AMO étendue', mission: 'amo', points: 5,
    contenu: 'Plusieurs lots, accompagnement régulier, durée intermédiaire.', tarif: '5 à 8 % des travaux HT' },
  { key: 'amo_importante', label: 'AMO importante', mission: 'amo', points: 7,
    contenu: 'Nombreux lots, longue durée et/ou complexité élevée.', tarif: '5 à 8 % des travaux HT' },
];
// Les honoraires d'AMO ne se lisent pas en euros mais en pourcentage des travaux,
// avec un plancher. La formulation est celle que le manuel recommande au client.
export const HONORAIRES_AMO = { taux: '5 à 8 % du montant HT des travaux', minimum: 3500 };
// Plafonds au lancement. Le manuel les dit « à recalibrer sur données réelles » : ils
// sont ici pour qu'une seule ligne suffise à les changer.
export const CAPACITE_BTP = { points: 18, amoActives: 3 };
export const niveauDe = (deal) => NIVEAUX_BTP.find(n => n.key === deal?.fields?.niveau) || null;
export const pointsDe = (deal) => niveauDe(deal)?.points || 0;

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
      { key: 'rdv1', label: 'RDV 1', p: 10 },
      // Expertise : du constat au rapport
      { key: 'qualifie', label: 'Qualifié', p: 20, mission: 'expertise' },
      { key: 'proposition', label: 'Lettre de mission', p: 60, mission: 'expertise' },
      { key: 'rdv', label: 'RDV sur place', p: 100, delivery: true, mission: 'expertise' },
      { key: 'mission_realisee', label: 'Rédaction du rapport', p: 100, delivery: true, mission: 'expertise' },
      { key: 'rdv_complementaire', label: 'RDV complémentaire', p: 100, delivery: true, mission: 'expertise' },
      { key: 'rapport_remis', label: 'Rapport émis', p: 100, delivery: true, mission: 'expertise' },
      // AMO : de la définition du besoin à la réception des travaux
      { key: 'amo_cadrage', label: 'Besoin cadré', p: 20, mission: 'amo' },
      { key: 'amo_contrat', label: 'Contrat AMO', p: 60, mission: 'amo' },
      { key: 'amo_programme', label: 'Programme et budget', p: 100, delivery: true, mission: 'amo' },
      { key: 'amo_consultation', label: 'Consultation entreprises', p: 100, delivery: true, mission: 'amo' },
      { key: 'amo_chantier', label: 'Suivi de chantier', p: 100, delivery: true, mission: 'amo' },
      { key: 'amo_reception', label: 'Réception des travaux', p: 100, delivery: true, mission: 'amo' },
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
        hint: "Sert au calcul de la charge du chargé d'affaires (15 points maximum)." },
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

export const CHANNELS = [
  'Google organique / SEO', 'Google Ads', 'Meta Ads', 'Instagram organique', 'Facebook organique', 'LinkedIn',
  'Site internet direct', 'Recommandation client', 'Ancien client', 'Partenaire / apporteur', 'Prospection directe',
  'Réseau professionnel', 'Téléphone / autre',
];
export const PAID_CHANNELS = ['Google Ads', 'Meta Ads'];

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

// Le degré de traitement qu'on pose à la main sur une tâche. « En retard » et
// « aujourd'hui » n'y figurent pas : ils se calculent depuis l'échéance, ils ne se
// saisissent pas. Stocké dans activities.priority — texte libre, donc une valeur
// intermédiaire s'ajoute ici sans migration.
export const PRIORITES = [
  { key: 'urgent', label: 'Urgent', icon: '🔥' },
];

export const CONTACT_TYPES = ['Prospect', 'Client', 'Partenaire', 'Apporteur', 'Fournisseur'];
export const ORG_TYPES = ['Client', 'Prospect', 'Partenaire', 'Banque', 'Fournisseur'];
export const PARTNER_JOBS = ['Agent immobilier', 'Agence immobilière', 'Notaire', 'Avocat', 'Syndic', 'Administrateur de biens', 'Courtier', 'Expert-comptable', 'Banque', 'Artisan', 'Architecte', 'Investisseur', 'Chasseur immobilier', 'Autre'];
export const CLIENT_STATUS = ['Prospect', 'Client actif', 'Ancien client'];

export const ROLES = {
  direction: { label: 'Direction', description: 'Vision complète, tableaux de bord, paramétrage' },
  propulsion: { label: 'Propulsion', description: 'Pipeline Propulsion, contacts et organisations liés' },
  commercial: { label: "Chargé d'affaires", description: 'Uniquement les affaires et contacts dont il est responsable' },
};

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
