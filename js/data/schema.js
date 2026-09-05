// Référentiel métier du CRM — la seule source de vérité pour les pipelines,
// les champs par activité, les canaux et les listes de valeurs.

export const ACTIVITIES = {
  rgd: {
    key: 'rgd', label: 'RGD Renova', short: 'RGD', color: '#f26522',
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
    key: 'btp', label: 'BTP Expertise', short: 'BTP Exp.', color: '#2563eb',
    amountLabel: 'Montant mission HT (€)',
    rdvStage: 'rdv',
    stages: [
      { key: 'lead', label: 'Nouveau lead', p: 5 },
      { key: 'qualifie', label: 'Qualifié', p: 15 },
      { key: 'rdv', label: 'RDV / visite planifié', p: 35 },
      { key: 'proposition', label: 'Proposition envoyée', p: 60 },
      { key: 'mission_planifiee', label: 'Mission planifiée', p: 100, delivery: true },
      { key: 'mission_realisee', label: 'Mission réalisée', p: 100, delivery: true },
      { key: 'rapport_remis', label: 'Rapport remis', p: 100, delivery: true },
    ],
    fields: [
      { key: 'problematique', label: 'Type de problématique', type: 'select', options: ['Malfaçons', 'Fissures', 'Humidité', 'Plomberie', 'Électricité', 'Non-conformité', 'Litige travaux', 'Réception de travaux', 'AMO / accompagnement', 'Avant achat', 'Autre'] },
      { key: 'type_bien', label: 'Type de bien', type: 'select', options: ['Maison', 'Appartement', 'Immeuble', 'Local pro', 'Autre'] },
      { key: 'contexte', label: 'Contexte', type: 'select', options: ['Particulier', 'Entreprise', 'Litige', 'Achat immobilier', 'Travaux en cours'] },
      { key: 'adresse', label: 'Adresse du bien', type: 'text' },
      { key: 'urgence', label: 'Urgent', type: 'checkbox' },
      { key: 'date_visite', label: 'Date de visite', type: 'date' },
      { key: 'date_rapport', label: 'Date remise rapport', type: 'date' },
    ],
  },
  courtage: {
    key: 'courtage', label: 'La Référence Courtage', short: 'Courtage', color: '#0f9d58',
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
    key: 'propulsion', label: 'Propulsion', short: 'Propulsion', color: '#7c3aed',
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

export const ACTIVITY_TYPES = [
  { key: 'appel', label: 'Appel', icon: '📞' },
  { key: 'rdv', label: 'RDV', icon: '📅' },
  { key: 'visite', label: 'Visite', icon: '🏠' },
  { key: 'envoi', label: 'Envoi devis / proposition', icon: '📄' },
  { key: 'relance', label: 'Relance', icon: '🔁' },
  { key: 'pieces', label: 'Récupération pièces', icon: '📎' },
  { key: 'avis', label: "Demande d'avis", icon: '⭐' },
  { key: 'partenaire', label: 'Contact partenaire', icon: '🤝' },
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
