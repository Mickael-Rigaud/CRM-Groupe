// Jeu de données de démonstration (mode local uniquement).
import { SEED_BROKERS } from './seed-vivier.js';
import { SEED_VIVIER_BTP, SEED_VIVIER_BTP_EVENEMENTS } from './seed-vivier-btp.js';
import { SEED_ATLAS_BTP } from './seed-atlas-btp.js';
import { SEED_CHECKLIST_BTP } from './seed-checklist-btp.js';
import { SEED_SITE, deplierSite } from './seed-site.js';
const d = (offsetDays, h = 9) => {
  const x = new Date(); x.setHours(h, 0, 0, 0); x.setDate(x.getDate() + offsetDays); return x.toISOString();
};
const day = (offsetDays) => d(offsetDays).slice(0, 10);

// Une photo de visite de demonstration, DESSINEE et non telechargee : le mode
// demo n'a ni seau de stockage ni reseau. ⚠ L'ecran distingue les deux sortes
// de valeurs que porte la colonne `photos` — une adresse `data:` en demo, un
// CHEMIN a faire signer en production — et le test porte sur « c'est deja une
// adresse », jamais sur « ce n'est pas un chemin ».
const PHOTO_VISITE = (texte, fond) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'>`
  + `<rect width='320' height='240' fill='%23${fond}'/>`
  + `<text x='160' y='128' font-family='sans-serif' font-size='20' fill='%23405060' `
  + `text-anchor='middle'>${texte}</text></svg>`;

export const SEED_USERS = [
  { id: 'u-mickael', full_name: 'Mickael Rigaud', email: 'mickael@example.com', role: 'direction', activities: ['rgd', 'btp', 'courtage', 'propulsion'], active: true, patrimony_access: true },
  { id: 'u-stephanie', full_name: 'Stéphanie', email: 'stephanie@example.com', role: 'propulsion', activities: ['propulsion'], active: true, rental_access: true },
  { id: 'u-elodie', full_name: 'Élodie', email: 'elodie@example.com', role: 'propulsion', activities: ['propulsion'], active: true },
  { id: 'u-charge', full_name: "Chargé d'affaires (démo)", email: 'charge@example.com', role: 'charge_affaires', activities: ['rgd', 'btp'], active: true },
];

export const SEED = {
  organisations: [
    { id: 'o1', name: 'Agence Immo Centre', type: 'Partenaire', partner_job: 'Agence immobilière', zone: 'Tours', activities: ['btp', 'courtage'], phone: '02 61 91 00 01', email: 'contact@example.com', city: 'Tours', owner_id: 'u-mickael', last_contact_at: d(-12), created_at: d(-200) },
    { id: 'o2', name: 'Étude Notariale Martin', type: 'Partenaire', partner_job: 'Notaire', zone: 'Indre-et-Loire', activities: ['btp'], phone: '02 61 91 00 02', email: 'etude@example.com', city: 'Amboise', owner_id: 'u-mickael', last_contact_at: d(-40), created_at: d(-300) },
    { id: 'o3', name: 'Boulangerie Dupuis', type: 'Client', client_status: 'Client actif', activities: ['propulsion'], phone: '02 61 91 00 03', city: 'Tours', owner_id: 'u-stephanie', offer: 'Réseaux sociaux + Meta Ads', monthly_amount: 450, commitment_months: 12, start_date: day(-250), renewal_date: day(30), account_manager_id: 'u-stephanie', created_at: d(-260) },
    { id: 'o4', name: 'SCI Les Tilleuls', type: 'Client', activities: ['rgd'], city: 'Saint-Avertin', owner_id: 'u-mickael', created_at: d(-90) },
    { id: 'o5', name: 'Cabinet Avocats Leroy', type: 'Partenaire', partner_job: 'Avocat', zone: 'Tours', activities: ['btp'], email: 'contact@example.com', city: 'Tours', owner_id: 'u-mickael', last_contact_at: d(-70), created_at: d(-150) },
    { id: 'o6', name: 'Garage Moreau', type: 'Prospect', client_status: 'Prospect', activities: ['propulsion'], city: 'Joué-lès-Tours', owner_id: 'u-stephanie', created_at: d(-10) },
  ],
  contacts: [
    { id: 'c1', first_name: 'Julie', last_name: 'Bernard', phone: '06 39 98 00 01', email: 'julie.bernard@example.com', city: 'Tours', postal_code: '37000', activities: ['rgd'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', consent: true, created_at: d(-6) },
    { id: 'c2', first_name: 'Karim', last_name: 'Haddad', phone: '06 39 98 00 02', email: 'k.haddad@example.com', city: 'Saint-Cyr-sur-Loire', postal_code: '37540', activities: ['rgd', 'courtage'], type: 'Client', owner_id: 'u-mickael', channel: 'Recommandation client', consent: true, created_at: d(-120) },
    { id: 'c3', first_name: 'Sophie', last_name: 'Garnier', phone: '06 39 98 00 03', email: 'sophie.garnier@example.com', city: 'Amboise', postal_code: '37400', activities: ['btp'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Partenaire / apporteur', referrer_org_id: 'o1', consent: true, created_at: d(-15) },
    { id: 'c4', first_name: 'Thomas', last_name: 'Petit', phone: '06 39 98 00 04', email: 'thomas.petit@example.com', city: 'Tours', postal_code: '37100', activities: ['btp'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Google organique / SEO', consent: true, created_at: d(-3) },
    { id: 'c5', first_name: 'Marc', last_name: 'Dupuis', phone: '06 39 98 00 05', email: 'marc@example.com', organisation_id: 'o3', city: 'Tours', activities: ['propulsion'], type: 'Client', owner_id: 'u-stephanie', channel: 'Réseau professionnel', consent: true, created_at: d(-260) },
    { id: 'c6', first_name: 'Nadia', last_name: 'Moreau', phone: '06 39 98 00 06', email: 'nadia@example.com', organisation_id: 'o6', city: 'Joué-lès-Tours', activities: ['propulsion'], type: 'Prospect', owner_id: 'u-stephanie', channel: 'Instagram organique', consent: true, created_at: d(-10) },
    { id: 'c7', first_name: 'Paul', last_name: 'Lemaire', phone: '06 39 98 00 07', email: 'paul.lemaire@example.com', city: 'Montlouis-sur-Loire', postal_code: '37270', activities: ['courtage'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Site internet direct', consent: true, created_at: d(-20) },
    { id: 'c8', first_name: 'Claire', last_name: 'Fontaine', phone: '06 39 98 00 08', email: 'claire.fontaine@example.com', city: 'Tours', postal_code: '37200', activities: ['rgd'], type: 'Client', owner_id: 'u-mickael', channel: 'Google Ads', campaign: 'RGD-SdB-2026', consent: true, created_at: d(-75) },
    { id: 'c9', first_name: 'Antoine', last_name: 'Roux', phone: '06 39 98 00 09', email: 'antoine.roux@example.com', city: 'Chambray-lès-Tours', postal_code: '37170', activities: ['rgd'], type: 'Prospect', owner_id: 'u-charge', channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', consent: true, created_at: d(-2) },
    { id: 'c10', first_name: 'Isabelle', last_name: 'Marchand', phone: '06 39 98 00 10', email: 'i.marchand@example.com', city: 'Tours', postal_code: '37000', activities: ['btp'], type: 'Client', owner_id: 'u-mickael', channel: 'Partenaire / apporteur', referrer_org_id: 'o2', consent: true, created_at: d(-60) },
    { id: 'c11', first_name: 'Hugo', last_name: 'Blanc', phone: '06 39 98 00 11', email: 'hugo.blanc@example.com', city: 'La Riche', postal_code: '37520', activities: ['courtage'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Meta Ads', campaign: 'RAC-Regroupement-Sept26', consent: true, created_at: d(-1) },
    // Les quatre suivants ne servent qu'aux fiches RGD ci-dessous : une fiche
    // sans contact s'affiche « (fiche sans contact) » et ne prouve rien.
    { id: 'c12', first_name: 'Léa', last_name: 'Chevalier', phone: '06 39 98 00 12', email: 'lea.chevalier@example.com', city: 'Ballan-Miré', postal_code: '37510', activities: ['rgd'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Site internet direct', consent: true, created_at: d(-4) },
    { id: 'c13', first_name: 'Olivier', last_name: 'Barre', phone: '06 39 98 00 13', email: 'o.barre@example.com', city: 'Tours', postal_code: '37100', activities: ['rgd'], type: 'Prospect', owner_id: 'u-charge', channel: 'Recommandation client', consent: true, created_at: d(-30) },
    { id: 'c14', first_name: 'Sonia', last_name: 'Aubert', phone: '06 39 98 00 14', email: 'sonia.aubert@example.com', city: 'Joué-lès-Tours', postal_code: '37300', activities: ['rgd'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Site internet direct', consent: true, created_at: d(-1) },
    // ⚠ UN CONTACT SANS NOM DE FAMILLE — le cas que l'annuaire doit survivre.
    // La colonne y affiche « nom, prenom » ; quand le nom manque, `famille`
    // retombe sur le prenom et l'inversion ecrirait deux fois le meme mot.
    // ⚠ CE CONTACT EST ARCHIVÉ, et c'est le seul du jeu : sa fiche est dans
    // la corbeille. Sans lui, l'onglet « Corbeille » s'ouvrait vide et la
    // restauration ne s'essayait nulle part — or c'est tout l'intérêt d'une
    // corbeille. Il n'apparaît dans aucune liste tant que la fiche n'est pas
    // remise, exactement comme en production.
    { id: 'c17', first_name: 'Nadia', last_name: 'Lemoine', phone: '06 39 98 00 17', email: 'nadia.lemoine@example.com', city: 'Tours', postal_code: '37100', activities: ['rgd'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Formulaire site', consent: true, created_at: d(-30), archived_at: d(-2) },
    { id: 'c16', first_name: 'Farid', phone: '06 39 98 00 16', email: 'farid@example.com', city: 'Tours', postal_code: '37000', activities: ['rgd'], type: 'Client', owner_id: 'u-mickael', channel: 'Recommandation client', consent: true, created_at: d(-200) },
    { id: 'c15', first_name: 'Damien', last_name: 'Rey', phone: '06 39 98 00 15', email: 'damien.rey@example.com', city: 'Tours', postal_code: '37200', activities: ['rgd'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Site internet direct', consent: true, created_at: d(-2) },
  ],
  deals: [
    { id: 'd1', title: 'Rénovation appartement — Bernard', activity: 'rgd', stage: 'visite', status: 'open', contact_id: 'c1', owner_id: 'u-mickael', amount: 28000, channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', fields: { type_travaux: 'Rénovation complète', adresse_chantier: '12 rue Nationale, Tours', budget_annonce: 30000, date_visite: day(1) }, stage_history: [{ stage: 'lead', at: d(-6) }, { stage: 'qualifie', at: d(-5) }, { stage: 'visite', at: d(-3) }], created_at: d(-6), stage_changed_at: d(-3) },
    // ⚠ L'AFFAIRE QUI NE PORTE QU'UN RENDEZ-VOUS, semee le 06/10/2026 :
    // c'est tout ce que `rgd_visite_planifiee` fabrique quand on prend une
    // visite depuis la fiche projet — une affaire et un chantier, sans un euro.
    // Sans elle, la demo ne montrait que des visites a `deal_id` nul, donc
    // invisibles du Pipeline, et la suppression d'une fiche qui ne porte QUE
    // son rendez-vous ne s'essayait nulle part : c'est pourtant le cas qui
    // rendait le prospect indeboulonnable en production.
    { id: 'd-rdv', title: 'Visite technique : Camille Petit / RGD Renova', activity: 'rgd', stage: 'visite', status: 'open', contact_id: 'c4', owner_id: 'u-mickael', amount: null, fields: {}, stage_history: [{ stage: 'visite', at: d(-1) }], created_at: d(-1), stage_changed_at: d(-1) },
    { id: 'd2', title: 'Salle de bain — Fontaine', activity: 'rgd', stage: 'devis_envoye', status: 'open', contact_id: 'c8', owner_id: 'u-mickael', amount: 11500, channel: 'Google Ads', campaign: 'RGD-SdB-2026', fields: { type_travaux: 'Salle de bain', num_devis: 'DEV-2026-118' }, stage_history: [{ stage: 'lead', at: d(-20) }, { stage: 'visite', at: d(-14) }, { stage: 'devis_envoye', at: d(-8) }], created_at: d(-20), stage_changed_at: d(-8) },
    { id: 'd3', title: 'Réaménagement maison — Haddad', activity: 'rgd', stage: 'nego', status: 'won', contact_id: 'c2', owner_id: 'u-mickael', amount: 42000, channel: 'Recommandation client', fields: { type_travaux: 'Réaménagement', num_devis: 'DEV-2026-097' }, stage_history: [{ stage: 'lead', at: d(-120) }, { stage: 'visite', at: d(-110) }, { stage: 'devis_envoye', at: d(-95) }, { stage: 'nego', at: d(-80) }], created_at: d(-120), won_at: d(-70), closed_at: d(-70), stage_changed_at: d(-80) },
    { id: 'd4', title: 'Cuisine — Roux', activity: 'rgd', stage: 'lead', status: 'open', contact_id: 'c9', owner_id: 'u-charge', amount: 0, channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', fields: { type_travaux: 'Cuisine', budget_annonce: 15000 }, stage_history: [{ stage: 'lead', at: d(-2) }], created_at: d(-2), stage_changed_at: d(-2) },
    { id: 'd5', title: 'Isolation combles — SCI Les Tilleuls', activity: 'rgd', stage: 'devis_envoye', status: 'lost', lost_reason: 'Prix', organisation_id: 'o4', owner_id: 'u-mickael', amount: 9800, channel: 'Site internet direct', fields: { type_travaux: 'Plâtrerie / isolation' }, stage_history: [{ stage: 'lead', at: d(-90) }, { stage: 'devis_envoye', at: d(-75) }], created_at: d(-90), lost_at: d(-50), closed_at: d(-50), stage_changed_at: d(-75) },
    { id: 'd6', title: 'Fissures façade — Garnier', activity: 'btp', stage: 'proposition', status: 'open', contact_id: 'c3', owner_id: 'u-mickael', amount: 900, channel: 'Partenaire / apporteur', referrer_org_id: 'o1', fields: { problematique: 'Fissures', type_bien: 'Maison', contexte: 'Achat immobilier', adresse: 'Amboise' }, stage_history: [{ stage: 'lead', at: d(-15) }, { stage: 'rdv', at: d(-10) }, { stage: 'proposition', at: d(-7) }], created_at: d(-15), stage_changed_at: d(-7) },
    { id: 'd7', title: 'Humidité sous-sol — Petit', activity: 'btp', stage: 'qualifie', status: 'open', contact_id: 'c4', owner_id: 'u-mickael', amount: 750, channel: 'Google organique / SEO', fields: { problematique: 'Humidité', type_bien: 'Maison', contexte: 'Particulier', urgence: true }, stage_history: [{ stage: 'lead', at: d(-3) }, { stage: 'qualifie', at: d(-1) }], created_at: d(-3), stage_changed_at: d(-1) },
    // ⚠ LA SEULE MISSION AMO DU JEU D'ESSAI, et elle y est pour une raison :
    // sans elle l'écran AMO est vide, la pipeline du tableau de bord affiche huit
    // colonnes à zéro et la répartition du CA donne 100 % à l'expertise. Rien de
    // ce qui distingue les deux métiers n'était vérifiable hors production.
    // `type_mission` est ce qui range une affaire dans l'un ou l'autre déroulé.
    { id: 'd8b', title: 'Rénovation lourde — SCI Les Tilleuls', activity: 'btp', stage: 'amo_programme', status: 'open', organisation_id: 'o4', owner_id: 'u-mickael', amount: 14000, channel: 'Réseau professionnel', fields: { type_mission: 'amo', problematique: 'Assistance à maîtrise d’ouvrage', type_bien: 'Immeuble', contexte: 'Rénovation lourde' }, stage_history: [{ stage: 'lead', at: d(-70) }, { stage: 'rdv1', at: d(-62) }, { stage: 'amo_cadrage', at: d(-50) }, { stage: 'amo_contrat', at: d(-38) }, { stage: 'amo_programme', at: d(-20) }], created_at: d(-70), stage_changed_at: d(-20) },
    { id: 'd8', title: 'Malfaçons carrelage — Marchand', activity: 'btp', stage: 'rapport_remis', status: 'won', contact_id: 'c10', owner_id: 'u-mickael', amount: 1200, channel: 'Partenaire / apporteur', referrer_org_id: 'o2', fields: { problematique: 'Malfaçons', type_bien: 'Appartement', contexte: 'Litige', date_visite: day(-30), date_rapport: day(-20) }, stage_history: [{ stage: 'lead', at: d(-60) }, { stage: 'rdv', at: d(-50) }, { stage: 'proposition', at: d(-45) }, { stage: 'mission_planifiee', at: d(-40) }, { stage: 'rapport_remis', at: d(-20) }], created_at: d(-60), won_at: d(-40), closed_at: d(-40), stage_changed_at: d(-20) },
    { id: 'd9', title: 'Crédit immo — Lemaire', activity: 'courtage', stage: 'pieces', status: 'open', contact_id: 'c7', owner_id: 'u-mickael', amount: 2100, channel: 'Site internet direct', fields: { type_financement: 'Crédit immobilier', montant_projet: 240000, montant_financement: 210000, apport: 30000, objectif: 'Résidence principale', pieces_manquantes: 'Avis d\'imposition 2025, 3 derniers bulletins' }, stage_history: [{ stage: 'lead', at: d(-20) }, { stage: 'rdv', at: d(-12) }, { stage: 'pieces', at: d(-10) }], created_at: d(-20), stage_changed_at: d(-10) },
    { id: 'd10', title: 'Regroupement crédits — Blanc', activity: 'courtage', stage: 'lead', status: 'open', contact_id: 'c11', owner_id: 'u-mickael', amount: 1500, channel: 'Meta Ads', campaign: 'RAC-Regroupement-Sept26', fields: { type_financement: 'Regroupement de crédits' }, stage_history: [{ stage: 'lead', at: d(-1) }], created_at: d(-1), stage_changed_at: d(-1) },
    { id: 'd11', title: 'Rachat crédit — Haddad', activity: 'courtage', stage: 'banque', status: 'open', contact_id: 'c2', owner_id: 'u-mickael', amount: 1800, channel: 'Ancien client', fields: { type_financement: 'Crédit immobilier', montant_financement: 180000, objectif: 'Rachat / renégociation', partenaire_banque: 'Crédit Agricole' }, stage_history: [{ stage: 'lead', at: d(-35) }, { stage: 'rdv', at: d(-28) }, { stage: 'etude', at: d(-15) }, { stage: 'banque', at: d(-6) }], created_at: d(-35), stage_changed_at: d(-6) },
    { id: 'd12', title: 'Réseaux sociaux — Garage Moreau', activity: 'propulsion', stage: 'proposition', status: 'open', contact_id: 'c6', organisation_id: 'o6', owner_id: 'u-stephanie', amount: 4200, channel: 'Instagram organique', fields: { activite_client: 'Garage automobile', prestations: 'Réseaux sociaux', montant_mensuel: 350, duree_mois: 12, reseaux: 'Instagram, Facebook' }, stage_history: [{ stage: 'lead', at: d(-10) }, { stage: 'audit', at: d(-6) }, { stage: 'proposition', at: d(-4) }], created_at: d(-10), stage_changed_at: d(-4) },
    { id: 'd13', title: 'Pack complet — Boulangerie Dupuis', activity: 'propulsion', stage: 'onboarding', status: 'won', contact_id: 'c5', organisation_id: 'o3', owner_id: 'u-stephanie', amount: 5400, channel: 'Réseau professionnel', fields: { activite_client: 'Boulangerie', prestations: 'Pack complet', montant_mensuel: 450, duree_mois: 12, date_demarrage: day(-250) }, stage_history: [{ stage: 'lead', at: d(-270) }, { stage: 'proposition', at: d(-262) }, { stage: 'onboarding', at: d(-255) }], created_at: d(-270), won_at: d(-255), closed_at: d(-255), stage_changed_at: d(-255) },
  ],
  activities: [
    // ⚠ CELLES-CI PORTENT UN MODULE, PAS UNE STRUCTURE (`activity: 'locatif'`,
    // 05/10/2026). Sans elles, la colonne « Gestion locative » du tableau et sa
    // pastille dans la liste restaient vides : on ne voyait ni la couleur, ni le
    // compte, ni le « + » qui cree dedans. Elles n'ont ni affaire ni contact —
    // une tache de gestion locative se rattache a un bail, pas a un prospect.
    { id: 'a0a', activity: 'locatif', type: 'relance', title: 'Relancer le loyer de septembre — M. Said', due_date: day(-1), done: false, assignee_id: 'u-mickael', created_at: d(-4) },
    { id: 'a0b', activity: 'locatif', type: 'pieces', title: 'Demander l attestation d assurance habitation', due_date: day(4), done: false, assignee_id: 'u-mickael', created_at: d(-1) },
    { id: 'a1', deal_id: 'd1', contact_id: 'c1', type: 'visite', title: 'Visite chantier rue Nationale', due_date: day(1), due_time: '10:00', done: false, assignee_id: 'u-mickael', created_at: d(-3) },
    { id: 'a2', deal_id: 'd2', contact_id: 'c8', type: 'relance', title: 'Relancer devis salle de bain', due_date: day(-2), done: false, assignee_id: 'u-mickael', created_at: d(-6) },
    { id: 'a3', deal_id: 'd4', contact_id: 'c9', type: 'appel', title: 'Appeler le prospect (lead Meta)', due_date: day(0), due_time: '09:30', done: false, assignee_id: 'u-charge', created_at: d(-2) },
    { id: 'a4', deal_id: 'd6', contact_id: 'c3', type: 'relance', title: 'Relancer proposition expertise fissures', due_date: day(0), done: false, assignee_id: 'u-mickael', created_at: d(-3) },
    { id: 'a5', deal_id: 'd9', contact_id: 'c7', type: 'pieces', title: "Récupérer avis d'imposition et bulletins", due_date: day(-1), done: false, assignee_id: 'u-mickael', created_at: d(-5) },
    { id: 'a6', deal_id: 'd10', contact_id: 'c11', type: 'appel', title: 'Appeler le prospect (lead Meta RAC)', due_date: day(0), due_time: '11:00', done: false, assignee_id: 'u-mickael', created_at: d(-1) },
    { id: 'a7', deal_id: 'd12', contact_id: 'c6', type: 'relance', title: 'Relancer proposition Garage Moreau', due_date: day(0), done: false, assignee_id: 'u-stephanie', created_at: d(-2) },
    { id: 'a8', organisation_id: 'o3', contact_id: 'c5', type: 'partenaire', title: 'Préparer renouvellement Boulangerie Dupuis', due_date: day(3), done: false, assignee_id: 'u-stephanie', created_at: d(-1) },
    { id: 'a9', organisation_id: 'o5', type: 'partenaire', title: 'Relancer Cabinet Leroy (pas de contact depuis 70 j)', due_date: day(2), done: false, assignee_id: 'u-mickael', created_at: d(-1) },
    { id: 'a10', deal_id: 'd8', contact_id: 'c10', type: 'avis', title: 'Demander un avis Google', due_date: day(-15), done: true, done_at: d(-15), assignee_id: 'u-mickael', created_at: d(-20) },
    { id: 'a11', deal_id: 'd11', contact_id: 'c2', type: 'appel', title: 'Point avec le Crédit Agricole', due_date: day(1), due_time: '14:00', done: false, assignee_id: 'u-mickael', created_at: d(-2) },
  ],
  events: [
    { id: 'e1', deal_id: 'd1', contact_id: 'c1', kind: 'note', body: 'Appartement T3 ancien, souhaite tout refaire avant emménagement en janvier. Budget 30 k€ annoncé.', author_id: 'u-mickael', created_at: d(-5) },
    { id: 'e2', deal_id: 'd2', contact_id: 'c8', kind: 'note', body: 'Devis DEV-2026-118 envoyé par email. Compare avec un autre artisan.', author_id: 'u-mickael', created_at: d(-8) },
    { id: 'e3', deal_id: 'd9', contact_id: 'c7', kind: 'note', body: 'RDV réalisé, projet cohérent. Manque avis d\'imposition et bulletins.', author_id: 'u-mickael', created_at: d(-12) },
    { id: 'e4', deal_id: 'd12', contact_id: 'c6', kind: 'note', body: 'Audit réalisé : page Instagram inactive depuis 8 mois. Proposition 350 €/mois sur 12 mois.', author_id: 'u-stephanie', created_at: d(-4) },
  ],
  settings: [
    { key: 'intake_token', value: 'demo-token-a-changer' },
    // ⚠ SANS OBJECTIFS, LE BLOC « OBJECTIFS » DES ECRANS BTP N'EST QU'UN MESSAGE
    // VIDE — ni barres, ni pourcentages, ni taux de passage. Il n'etait donc
    // essayable que sur la production, et une retouche s'y verifiait a l'aveugle.
    // Les volumes se saisissent AU MOIS, le CA reste ANNUEL : deux conventions,
    // une seule source par chiffre (voir `chiffres.js`).
    { key: 'objectifs_volume', value: { btp: { leads: 10, qualifie: 6, rdv: 4 } } },
    { key: 'objectifs_ca', value: { periode: 'annuel', btp: 180000 } },
    // ⚠ SANS CES TROIS CLÉS, L'AGENDA DU TABLEAU DE BORD BTP AFFICHE SON ÉCRAN
    // DE RACCORDEMENT, et le bouton « + Rendez-vous » n'existe pas : le
    // formulaire de création n'était donc essayable que sur la production
    // (30/09/2026). Les identifiants sont INVENTÉS — le dépôt est public, et
    // un vrai identifiant de calendrier est une adresse à part entière.
    // ⚠ CONSÉQUENCE À CONNAÎTRE : le cadre Google affichera « calendrier
    // introuvable », puisque ces agendas n'existent pas. C'est le prix à payer
    // pour pouvoir ouvrir le formulaire ; l'alternative était de ne jamais le
    // voir hors production.
    { key: 'btp_calendar_expertise', value: 'demo-expertise@group.calendar.google.com' },
    { key: 'btp_calendar_amo', value: 'demo-amo@group.calendar.google.com' },
    { key: 'btp_calendar_id', value: 'demo-expertise@group.calendar.google.com,demo-amo@group.calendar.google.com' },
  ],
  // Messagerie : les canaux existent d'office, un par structure plus le canal Groupe.
  // En production ils sont créés par supabase/lot12-messagerie.sql.
  conversations: [
    { id: 'cv-groupe', kind: 'canal', slug: 'groupe', activity: null, title: 'Groupe', created_at: d(-400) },
    { id: 'cv-rgd', kind: 'canal', slug: 'rgd', activity: 'rgd', title: 'RGD Renova', created_at: d(-400) },
    { id: 'cv-btp', kind: 'canal', slug: 'btp', activity: 'btp', title: 'BTP Expertise', created_at: d(-400) },
    { id: 'cv-courtage', kind: 'canal', slug: 'courtage', activity: 'courtage', title: 'La Référence Courtage', created_at: d(-400) },
    { id: 'cv-propulsion', kind: 'canal', slug: 'propulsion', activity: 'propulsion', title: 'Propulsion', created_at: d(-400) },
    { id: 'cv-p1', kind: 'prive', slug: null, activity: null, title: null, created_by: 'u-mickael', created_at: d(-9) },
  ],
  conversation_members: [
    { id: 'cm1', conversation_id: 'cv-p1', user_id: 'u-mickael', created_at: d(-9) },
    { id: 'cm2', conversation_id: 'cv-p1', user_id: 'u-elodie', created_at: d(-9) },
  ],
  messages: [
    { id: 'm1', conversation_id: 'cv-groupe', author_id: 'u-mickael', body: 'Point d’équipe lundi 9 h, en visio. Ordre du jour : chiffres du mois et répartition des rendez-vous.', created_at: d(-5, 8) },
    { id: 'm2', conversation_id: 'cv-groupe', author_id: 'u-stephanie', body: 'Noté. Je prépare les chiffres Propulsion.', created_at: d(-5, 9) },
    { id: 'm3', conversation_id: 'cv-rgd', author_id: 'u-charge', body: 'Visite faite chez Mme Bernard. Appartement en bon état général, la salle de bain est à reprendre entièrement. Je monte le devis cette semaine.', created_at: d(-3, 17) },
    { id: 'm4', conversation_id: 'cv-rgd', author_id: 'u-mickael', body: 'Parfait. Pense à chiffrer le remplacement de la VMC, elle datait de l’origine.', created_at: d(-3, 18) },
    { id: 'm5', conversation_id: 'cv-btp', author_id: 'u-mickael', body: 'Rapport Marchand envoyé ce matin. Dossier clos, on peut facturer.', created_at: d(-2, 11) },
    { id: 'm6', conversation_id: 'cv-p1', author_id: 'u-mickael', body: 'Tu peux relancer le notaire pour le dossier Haddad ?', created_at: d(-1, 15) },
    { id: 'm7', conversation_id: 'cv-p1', author_id: 'u-elodie', body: 'C’est fait, il rappelle demain matin.', created_at: d(-1, 16) },
  ],
  message_reads: [],
  broker_profiles: SEED_BROKERS,
  btp_vivier: SEED_VIVIER_BTP,
  btp_vivier_evenements: SEED_VIVIER_BTP_EVENEMENTS,
  // Atlas BTP : six fiches et deux signaux INVENTÉS. Le vrai contenu est
  // sous licence et n'entre dans aucun dépôt — voir seed-atlas-btp.js.
  btp_atlas_fiches: SEED_ATLAS_BTP.btp_atlas_fiches,
  btp_signaux_alerte: SEED_ATLAS_BTP.btp_signaux_alerte,
  btp_visites_guidees: SEED_ATLAS_BTP.btp_visites_guidees,
  // Le REFERENTIEL de la check-list de visite (invente, voir le fichier).
  btp_checklist_zones: SEED_CHECKLIST_BTP.btp_checklist_zones,
  btp_checklist_points: SEED_CHECKLIST_BTP.btp_checklist_points,
  // ⚠ UN RELEVE DEJA COMMENCE, ET C'EST DELIBERE : un ecran d'avancement
  // essaye sur une liste vide ne montre ni jauge, ni compteur d'anomalies, ni
  // zone partiellement faite. Il porte donc trois reponses sur dix points,
  // dont une anomalie avec sa note — l'etat le plus courant en pleine visite.
  btp_releves: [
    { id: 'rel1', deal_id: 'd6', date_visite: day(-2), auteur_id: 'u-mickael',
      notes: 'Acces par le portail lateral. Proprietaire present.' },
    // ⚠ UNE SECONDE VISITE SANS AUCUNE REPONSE, ET SANS RAPPORT : c'est le
    // SEUL moyen d'eprouver l'ecran qui annonce ce qu'un rapport reprendra
    // avant de le creer. Avec un seul releve deja rapporte, ce chemin-la ne
    // s'ouvrait jamais — ni en demonstration, ni au controle.
    { id: 'rel2', deal_id: 'd7', date_visite: day(0), auteur_id: 'u-charge',
      notes: null },
  ],
  // ⚠ QUATRE ANOMALIES ET NON UNE SEULE, DEPUIS LE 30/09/2026 : l'ecran du
  // RAPPORT tire son tableau de desordres de ces lignes, et une seule anomalie
  // sans photo ne montrait ni la numerotation, ni le reportage photo, ni le
  // choix de fiche quand un point en propose plusieurs. Les quatre cas qui
  // comptent sont donc representes, et chacun pour une raison :
  //   rep1 — point aux DEUX fiches candidates (2 et 5) : il faut choisir ;
  //   rep4 — une seule fiche candidate, avec PHOTOS : numerotation et reportage ;
  //   rep5 — fiche ABSENTE du jeu (44) : ni couleur, ni priorite deduite ;
  //   rep3 — non verifiable : c'est lui qui alimente les LIMITES du rapport.
  btp_releve_reponses: [
    { id: 'rep1', releve_id: 'rel1', point_id: 1, etat: 'anomalie',
      note: 'Fissure en biais a l’angle de la porte, environ 0,5 mm, bords nets.', photos: [] },
    { id: 'rep2', releve_id: 'rel1', point_id: 2, etat: 'ok', note: null, photos: [] },
    { id: 'rep3', releve_id: 'rel1', point_id: 4, etat: 'nv',
      note: 'Toiture non accessible le jour de la visite.', photos: [] },
    { id: 'rep4', releve_id: 'rel1', point_id: 6, etat: 'anomalie',
      note: 'Fissure verticale au-dessus de la fenetre du sejour, traversant l’enduit.',
      photos: [PHOTO_VISITE('fissure%20sejour', 'd8d0c9'), PHOTO_VISITE('detail%20au%20metre', 'cfd6dd')] },
    { id: 'rep5', releve_id: 'rel1', point_id: 5, etat: 'anomalie',
      note: 'Descente d’eau pluviale debouchant au pied du mur, sans regard.',
      photos: [PHOTO_VISITE('descente%20EP', 'c9cfd8')] },
    { id: 'rep6', releve_id: 'rel1', point_id: 7, etat: 'anomalie',
      note: 'Bande humide sur 40 cm en pied de mur nord, salpetre par endroits.', photos: [] },
    // ⚠ CELUI-CI CITE LA FICHE 14, LA SEULE ROUGE DU JEU : sans lui, ni la
    // priorite « haute » ni le groupe rouge des preconisations ne se voyaient
    // — et c'est justement l'ordre de lecture du document (les rouges d'abord)
    // qu'on veut pouvoir regarder.
    { id: 'rep7', releve_id: 'rel1', point_id: 8, etat: 'anomalie',
      note: 'Bombement du plafond sur environ 1 m², un fragment tombe au sol.',
      photos: [PHOTO_VISITE('plafond%20sejour', 'e0dcd4')] },
  ],

  // ⚠ UN RAPPORT A MOITIE REDIGE, ET C'EST TOUT L'INTERET : la frise des six
  // sections, les avertissements « preconisation a ecrire » et le bouton
  // « marquer comme finalise » ne se voient que sur un document incomplet.
  // L'objet et les limites sont ecrits, les hypotheses et les conclusions non.
  btp_rapports: [
    { id: 'rap1', releve_id: 'rel1', statut: 'brouillon',
      bien: null, maitre_ouvrage: null, intervenant: null,
      meteo: 'Temps sec, 16 °C, apres deux jours sans pluie.',
      objet: 'Visite sur site a la demande du maitre d’ouvrage, en vue de constater '
           + 'les desordres apparents et d’en proposer une interpretation. Les constats '
           + 'sont faits a vue, sans sondage ni essai.',
      limites: 'N’ont pas pu etre verifies le jour de la visite :\n'
             + '— EXTÉRIEURS (démonstration) : Couverture : elements deplaces '
             + '(Toiture non accessible le jour de la visite).',
      hypotheses: null, conclusions: null,
      lieu_signature: 'Nice', date_signature: day(0) },
  ],

  // ⚠ DEUX LIGNES SEULEMENT POUR SIX DESORDRES, ET C'EST LE MODELE LUI-MEME :
  // une ligne n'existe que quand l'expert a ecrit dedans. Les quatre autres
  // desordres s'affichent quand meme — ils viennent du releve.
  btp_rapport_lignes: [
    // Une fiche choisie parmi deux, et une preconisation ecrite.
    { id: 'rli1', rapport_id: 'rap1', reponse_id: 'rep1', retenu: true,
      fiche_numero: 5, desordre: null, priorite: null,
      preconisation: 'Poser deux temoins platre et revoir dans six semaines. '
                   + 'Si l’ouverture progresse, sondage de fondation a prevoir.', rang: 1 },
    // Un desordre ECARTE du rapport : il reste dans la check-list.
    { id: 'rli2', rapport_id: 'rap1', reponse_id: 'rep6', retenu: false,
      fiche_numero: null, desordre: null, priorite: null, preconisation: null, rang: 2 },
  ],
  // ⚠ UNE MISSION AMO A MI-PARCOURS, ET C'EST DELIBERE : un ecran d'avancement
  // essaye sur une liste vide ne montre ni jauge, ni phase complete, ni point de
  // vigilance. Le jeu porte donc la phase 1 entierement traitee, la phase 2
  // entamee, un point ECARTE (« sans objet ») et une ALERTE sur un point de
  // frontiere — les quatre etats qu'on veut pouvoir regarder.
  //
  // ⚠ LES POINTS SONT DESIGNES PAR LEUR NUMERO, qui vit dans
  // `btp-amo-checklist.js` : 7 = la lettre de mission, 13 = « aucune
  // preconisation ne vaut prescription », tous deux des points de frontiere.
  btp_amo_suivi: [
    { id: 'am1', deal_id: 'd8b', point_id: 1, etat: 'fait', fait_le: day(-48), auteur_id: 'u-mickael',
      note: 'Besoin relu avec le gerant de la SCI, valide par mail le lendemain.' },
    { id: 'am2', deal_id: 'd8b', point_id: 2, etat: 'fait', fait_le: day(-48), auteur_id: 'u-mickael', note: null },
    { id: 'am3', deal_id: 'd8b', point_id: 3, etat: 'fait', fait_le: day(-46), auteur_id: 'u-mickael',
      note: 'Enveloppe de 180 000 €, hors honoraires, provision aleas 8 %.' },
    { id: 'am4', deal_id: 'd8b', point_id: 4, etat: 'fait', fait_le: day(-46), auteur_id: 'u-mickael', note: null },
    { id: 'am5', deal_id: 'd8b', point_id: 5, etat: 'fait', fait_le: day(-44), auteur_id: 'u-mickael',
      note: 'Pas de maitre d’œuvre. Perimetre rappele par ecrit au client.' },
    { id: 'am6', deal_id: 'd8b', point_id: 6, etat: 'fait', fait_le: day(-42), auteur_id: 'u-mickael', note: null },
    { id: 'am7', deal_id: 'd8b', point_id: 7, etat: 'fait', fait_le: day(-38), auteur_id: 'u-mickael',
      note: 'Lettre de mission signee, exclusions en annexe 2.' },

    { id: 'am8', deal_id: 'd8b', point_id: 8, etat: 'fait', fait_le: day(-30), auteur_id: 'u-mickael', note: null },
    { id: 'am9', deal_id: 'd8b', point_id: 9, etat: 'fait', fait_le: day(-28), auteur_id: 'u-mickael',
      note: 'Sept lots. Les menuiseries exterieures restent hors perimetre.' },
    { id: 'am10', deal_id: 'd8b', point_id: 10, etat: 'fait', fait_le: day(-26), auteur_id: 'u-mickael', note: null },
    // Ne s'applique pas : l'immeuble est posterieur a 1997.
    { id: 'am11', deal_id: 'd8b', point_id: 12, etat: 'sans_objet', fait_le: day(-24), auteur_id: 'u-mickael',
      note: 'Immeuble de 2004 : ni amiante ni plomb. DPE deja fourni.' },
    // Un point de frontiere signale par ecrit, pas simplement coche.
    { id: 'am12', deal_id: 'd8b', point_id: 13, etat: 'alerte', fait_le: day(-22), auteur_id: 'u-mickael',
      note: 'Le client demandait un descriptif d’execution lot par lot. Refuse par mail du 08 : cela releve de la maitrise d’œuvre.' },
  ],

  dtu_sheets: [
    // Une fiche reecrite par la veille et une simplement verifiee : sans les
    // deux, le bandeau n'etait essayable que sur la production.
    { id: 'dtu-20-1', version: 'P1-1 juillet 2020 + A1 mars 2026',
      verifie_le: d(-2), maj_auto_le: d(-2),
      revision_source: 'https://www.boutique.afnor.org/', code: 'NF DTU 20.1', title: 'Maçonnerie de petits éléments', domain: 'Maçonnerie', essential: true, position: 10,
      summary: 'Cadre la maçonnerie de petits éléments pour murs porteurs, refends et chaînages.',
      key_points: [
        { titre: 'Chaînages horizontaux obligatoires', detail: 'Ceinturage en tête de chaque plancher, section mini 15×15 cm en béton armé. Sans chaînage, les murs travaillent isolément et fissurent au moindre tassement.' },
        { titre: 'Joints verticaux décalés', detail: 'Décalage d’un tiers de bloc minimum, jamais de joints alignés sur deux rangées consécutives.' },
      ],
      common_errors: [
        { titre: 'Linteaux sans appui suffisant', detail: 'Appui inférieur à 20 cm de chaque côté : la maçonnerie fissure aux angles de la baie, puis le linteau bascule.' },
      ],
      link: 'https://www.boutique.afnor.org/fr-fr/recherche/dtu-20-1', checkpoints: '', notes: '' },
    { id: 'dtu-25-41', version: 'P1-1 decembre 2012', verifie_le: d(-2),
      code: 'NF DTU 25.41', title: 'Ouvrages en plaques de plâtre', domain: 'Plâtrerie', essential: false, position: 40,
      summary: 'Cloisons, doublages et plafonds en plaques de plâtre sur ossature métallique.',
      key_points: [
        { titre: 'Entraxe des montants', detail: '60 cm en courant, 40 cm sous carrelage mural ou en local humide.' },
      ],
      common_errors: [], link: '', checkpoints: '', notes: '' },
    { id: 'dtu-43-1', code: 'NF DTU 43.1', title: 'Étanchéité des toitures-terrasses', domain: 'Étanchéité', essential: true, position: 60,
      summary: 'Toitures-terrasses avec éléments porteurs en maçonnerie.',
      key_points: [], common_errors: [], link: '', checkpoints: '', notes: '' },
  ],

  mail_templates: [
    { id: 'mt-1', activity: 'btp', ref: 'C1', theme: 'Avant le rendez-vous téléphonique', title: 'Confirmation du rendez-vous',
      subject: 'Votre rendez-vous est confirmé', mode: 'Automatique', position: 10,
      trigger_text: 'Dès la réservation du créneau sur le site',
      body: 'Bonjour [Prénom],\n\nVotre rendez-vous est confirmé.\n\nDate : [DATE]\nHeure : [HEURE]\n\nÀ très bientôt,' },
    { id: 'mt-2', activity: 'btp', ref: 'E2', theme: 'Séquence expertise', title: 'Relance devis',
      subject: 'Votre devis d\'expertise', mode: 'Manuel', position: 20,
      trigger_text: 'Trois jours après l\'envoi du devis, sans réponse',
      body: 'Bonjour [Prénom],\n\nJe reviens vers vous au sujet du devis adressé le [DATE].\n\nBien à vous,' },
    { id: 'mt-3', activity: 'btp', ref: 'E10', theme: 'Séquence expertise', title: 'Transmission du rapport',
      subject: 'Votre rapport d\'expertise', mode: 'Manuel', position: 30,
      trigger_text: 'À la remise du rapport',
      body: 'Bonjour [Prénom],\n\nVous trouverez ci-joint le rapport.\n\nBien à vous,' },
  ],
  // ---------- Patrimoine (démo) ----------
  properties: [
    { id: 'p1', name: 'T2 rue des Halles', address: '8 rue des Halles', city: 'Tours', postal_code: '37000', invest_type: 'Meublé / LMNP', structure: 'Nom propre', status: 'Loué', purchase_date: '2021-03-15', price: 118000, notary_fees: 9200, works: 14000, other_costs: 0, current_value: 150000, surface: 42, notes: 'Meublé étudiant, proche fac', created_at: d(-900) },
    { id: 'p2', name: 'Immeuble Saint-Pierre', address: '21 rue Saint-Pierre', city: 'Joué-lès-Tours', postal_code: '37300', invest_type: 'Immeuble de rapport', structure: 'SCI à l\'IS', status: 'Loué', purchase_date: '2023-06-01', price: 265000, notary_fees: 20500, works: 48000, other_costs: 2500, current_value: 360000, surface: 190, notes: '3 lots : 2 T2 + 1 T3', created_at: d(-700) },
    { id: 'p3', name: 'Parking Gare', address: 'Résidence Le Quai, place 14', city: 'Tours', postal_code: '37000', invest_type: 'Parking / garage', structure: 'Nom propre', status: 'Loué', purchase_date: '2022-09-10', price: 14000, notary_fees: 1900, works: 0, other_costs: 0, current_value: 15000, surface: 12, created_at: d(-800) },
  ],
  loans: [
    { id: 'l1', property_id: 'p1', bank: 'Crédit Agricole', label: 'Prêt T2 Halles', principal: 130000, rate: 1.35, duration_months: 240, start_date: '2021-04-05', insurance_monthly: 28.5, deferral_months: 0, created_at: d(-900) },
    { id: 'l2', property_id: 'p2', bank: 'BNP Paribas', label: 'Prêt SCI Saint-Pierre', principal: 300000, rate: 3.85, duration_months: 228, start_date: '2023-07-05', insurance_monthly: 62, deferral_months: 12, deferral_type: 'partial', created_at: d(-700) },
  ],
  units: [
    { id: 'un1', property_id: 'p1', name: 'T2', unit_type: 'T2', surface: 42, dpe: 'D', ges: 'D', sort_order: 1, active: true, created_at: d(-400) },
    { id: 'un2', property_id: 'p2', name: 'RDC', unit_type: 'T2', surface: 45, dpe: 'E', ges: 'D', sort_order: 1, active: true, created_at: d(-650) },
    { id: 'un3', property_id: 'p2', name: '1er', unit_type: 'T2', surface: 47, dpe: 'D', ges: 'D', sort_order: 2, active: true, created_at: d(-650) },
    { id: 'un4', property_id: 'p2', name: '2e', unit_type: 'T3', surface: 64, dpe: 'C', ges: 'C', sort_order: 3, active: true, created_at: d(-650) },
    { id: 'un5', property_id: 'p2', name: '3e', unit_type: 'Studio', surface: 22, dpe: 'F', ges: 'E', sort_order: 4, active: true, created_at: d(-650) },
    { id: 'un6', property_id: 'p3', name: 'Place 14', unit_type: 'Parking', sort_order: 1, active: true, created_at: d(-790) },
  ],
  leases: [
    { id: 'b1', unit_id: 'un1', tenant_phone: '06 39 98 00 11', tenant_email: 'lea.martin@example.com', apl: 0, payment_mode: 'Virement', lease_type: 'meuble', property_id: 'p1', lot: 'T2', tenant: 'Léa Martin', rent: 620, charges: 40, deposit: 620, start_date: '2024-09-01', end_date: null, active: true, created_at: d(-400) },
    { id: 'b2', unit_id: 'un2', tenant_phone: '06 39 98 00 12', apl: 180, payment_mode: 'Virement', lease_type: 'vide', property_id: 'p2', lot: 'RDC — T2', tenant: 'M. et Mme Petit', rent: 560, charges: 50, deposit: 560, start_date: '2023-11-01', end_date: null, active: true, created_at: d(-650) },
    { id: 'b3', unit_id: 'un3', tenant_phone: '06 39 98 00 13', apl: 0, payment_mode: 'Prélèvement', lease_type: 'vide', revision_date: '2026-10-01', property_id: 'p2', lot: '1er — T2', tenant: 'Nadia Benali', rent: 580, charges: 50, deposit: 580, start_date: '2024-02-01', end_date: null, active: true, created_at: d(-580) },
    { id: 'b4', unit_id: 'un4', guardian_name: 'Curatelle UDAF 37', guardian_phone: '02 61 91 00 04', apl: 250, payment_mode: 'Virement', lease_type: 'vide', property_id: 'p2', lot: '2e — T3', tenant: 'Famille Roux', rent: 720, charges: 60, deposit: 720, start_date: '2023-12-15', end_date: null, active: true, created_at: d(-620) },
    { id: 'b5', unit_id: 'un6', apl: 0, payment_mode: 'Virement', lease_type: 'autre', property_id: 'p3', lot: 'Place 14', tenant: 'Thomas Girard', rent: 75, charges: 0, deposit: 75, start_date: '2022-10-01', end_date: null, active: true, created_at: d(-790) },
  ],
  rent_payments: (() => {
    const out = []; const now = new Date(); const rents = { b1: 660, b2: 610, b3: 630, b4: 780, b5: 75 }; const apls = { b1: 0, b2: 180, b3: 0, b4: 250, b5: 0 };
    for (let i = 8; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1); const key = m.toISOString().slice(0, 7);
      for (const [lease, rent] of Object.entries(rents)) {
        if (i === 0 && (lease === 'b3' || lease === 'b4')) continue; // loyers du mois en cours pas encore reçus
        if (i === 2 && lease === 'b2') { out.push({ id: `rp-${lease}-${key}`, lease_id: lease, month: key, due: rent, apl: apls[lease], tenant_paid: 300 - apls[lease], amount: 300, mode: 'Virement', received_at: key + '-12', note: 'Paiement partiel' }); continue; }
        out.push({ id: `rp-${lease}-${key}`, lease_id: lease, month: key, due: rent, apl: apls[lease], tenant_paid: rent - apls[lease], amount: rent, mode: 'Virement', received_at: key + '-05' });
      }
    }
    return out;
  })(),
  expenses: [
    { id: 'x1', property_id: 'p1', category: 'Taxe foncière', label: 'Taxe foncière 2026', amount: 890, recurrence: 'yearly', date: '2026-10-15', created_at: d(-30) },
    { id: 'x2', property_id: 'p1', category: 'Charges de copropriété', label: 'Copropriété', amount: 95, recurrence: 'monthly', date: null, created_at: d(-300) },
    { id: 'x3', property_id: 'p1', category: 'Assurance PNO', label: 'PNO', amount: 145, recurrence: 'yearly', date: '2026-03-01', created_at: d(-300) },
    { id: 'x4', property_id: 'p2', category: 'Taxe foncière', label: 'Taxe foncière 2026', amount: 2650, recurrence: 'yearly', date: '2026-10-15', created_at: d(-30) },
    { id: 'x5', property_id: 'p2', category: 'Assurance PNO', label: 'PNO immeuble', amount: 420, recurrence: 'yearly', date: '2026-06-01', created_at: d(-300) },
    { id: 'x6', property_id: 'p2', category: 'Comptable', label: 'Bilan SCI', amount: 780, recurrence: 'yearly', date: '2026-04-30', created_at: d(-300) },
    { id: 'x7', property_id: 'p2', category: 'Entretien / réparations', label: 'Chauffe-eau lot 1er', amount: 640, recurrence: 'once', date: d(-45).slice(0, 10), created_at: d(-45) },
    { id: 'x8', property_id: 'p2', category: 'Eau / électricité / gaz', label: 'Électricité parties communes', amount: 38, recurrence: 'monthly', date: null, created_at: d(-300) },
    { id: 'x9', property_id: 'p3', category: 'Taxe foncière', label: 'Taxe foncière parking', amount: 110, recurrence: 'yearly', date: '2026-10-15', created_at: d(-30) },
  ],
  // Le reflet des deux documents du site, déplié exactement comme le fait la
  // RPC en production : une seule source (`SEED_SITE`), deux vues. Les écrire
  // à la main à côté du document, c'est signer une divergence.
  // ⚠ `deplierSite` REND DEUX TABLES POUR LES RÉALISATIONS depuis le
  // 01/10/2026, comme la RPC : les projets ET les catégories. Le carrousel,
  // lui, n'en a qu'une — c'est pour ça que l'appel n'a pas la même forme.
  rgd_realisations: deplierSite('realisations', SEED_SITE.realisations).realisations,
  rgd_categories: deplierSite('realisations', SEED_SITE.realisations).categories,
  rgd_carrousel: deplierSite('carrousel', SEED_SITE.carrousel),

  // Quelques sous-traitants, pour que l'écran de conformité soit essayable
  // sans toucher à la production. ⚠ NOMS ET COORDONNÉES INVENTÉS : le dépôt
  // est public, et un jeu de démo qui recopie la réalité finit par la publier.
  // Les trois cas qui comptent sont représentés : un dossier tenu, un dossier
  // en défaut, un artisan repéré en prospection.
  // Partenaires et apports d'affaires. Sans eux l'ecran Partenaires n'etait
  // essayable que sur la production — meme raison que pour les sous-traitants.
  // Noms inventes : le depot est public.
  dtu_revisions: [
    { id: 'rev1', sheet_id: 'dtu-20-1', code: 'NF DTU 20.1',
      constat: 'Amendement A1 de mars 2026 : epaisseur minimale des chainages horizontaux revue. Point cle 3 corrige.',
      version_avant: 'P1-1 juillet 2020', version_apres: 'P1-1 juillet 2020 + A1 mars 2026',
      source: 'https://www.boutique.afnor.org/',
      avant: { title: 'Maconnerie de petits elements',
               summary: 'Ancien resume, avant la passe de la veille.',
               key_points: [{ titre: 'Ancien point cle', detail: 'Tel qu il etait avant.' }],
               common_errors: [], checkpoints: '' },
      cree_le: d(-2) },
  ],

  rgd_apporteurs: [
    { id: 'ap1', owner_id: 'u-mickael', d1_id: 8001, nom: 'Vasseur', prenom: 'Claire', societe: 'Cabinet Vasseur',
      profession: 'Courtier en prets', telephone: '03 44 00 11 22', email: 'claire@example.com',
      adresse: '18 rue des Tilleuls', code_postal: '60300', ville: 'Senlis',
      type_partenaire: 'apporteur', actif: true, partenariat_signe: true,
      date_signature: '2026-03-14', source: 'demo' },
    { id: 'ap2', owner_id: 'u-charge', d1_id: 8002, nom: 'Bouchard', prenom: 'Yanis', societe: 'Archi Bouchard',
      profession: 'Architecte', telephone: '03 44 00 11 23',
      adresse: '5 place du Marche', code_postal: '60500', ville: 'Chantilly',
      type_partenaire: 'apporteur', actif: true, partenariat_signe: false, source: 'demo' },
    { id: 'ap3', owner_id: 'u-mickael', d1_id: 8003, nom: 'Leroy', prenom: 'Sabine', societe: 'Leroy Immobilier',
      profession: 'Agent immobilier', telephone: '03 44 00 11 24',
      code_postal: '60200', ville: 'Compiegne',
      // Inactif : c'est lui qui fait apparaitre la troisieme section.
      type_partenaire: 'apporteur', actif: false, partenariat_signe: false, source: 'demo' },
    { id: 'ap4', owner_id: 'u-mickael', d1_id: 8004, nom: 'Materiaux du Valois', societe: 'Materiaux du Valois',
      profession: 'Negoce de materiaux', telephone: '03 44 00 11 25',
      adresse: '2 zone de la Gare', code_postal: '60800', ville: 'Crepy-en-Valois',
      type_partenaire: 'fournisseur', actif: true, partenariat_signe: false, source: 'demo' },
  ],

  rgd_apports: [
    // Deux collaborateurs du meme cabinet : l'apport reste sur la fiche du
    // partenaire, et on sait quand meme qui a travaille.
    { id: 'apt1', apporteur_id: 'ap1', date_apport: '2026-06-12', client: 'Famille Renard',
      apporte_par: 'Lucie Berton', issue: 'gagne', montant_devis: 48000, montant_commission: 2400 },
    { id: 'apt2', apporteur_id: 'ap1', date_apport: '2026-08-03', client: 'M. Delaunay',
      apporte_par: 'Hugo Marchand', issue: 'perdu', montant_devis: 21000, montant_commission: 1050 },
    { id: 'apt3', apporteur_id: 'ap1', date_apport: '2026-09-18', client: 'Mme Chevalier',
      // Pas encore tranche : la commission ne doit PAS entrer dans le total.
      issue: null, montant_devis: 63500, montant_commission: 3175 },
    { id: 'apt4', apporteur_id: 'ap2', date_apport: '2026-07-22', client: 'SCI des Ormes',
      issue: 'gagne', montant_devis: 112000, montant_commission: 5600 },
    { id: 'apt5', apporteur_id: 'ap3', date_apport: '2026-02-09', client: 'M. et Mme Pires',
      issue: 'gagne', montant_devis: 29000, montant_commission: 1450 },
  ],

  // Le sens inverse : ce que RGD A APPORTE a ses partenaires. Sans ces lignes,
  // le tableau de l'ecran Partenaires et le bloc de la fiche ne s'essayaient
  // que sur la production.
  //
  // Memes colonnes que `rgd_apports` en face, `issue` comprise — et deux cas
  // distinguent ici le juste du faux :
  //  · `srt2` et `srt3` portent une commission SANS etre gagnees : elle ne doit
  //    PAS entrer dans le total, on n'attend rien d'une affaire que le
  //    partenaire n'a pas signee ;
  //  · `srt4` est perdue, sa ligne reste au registre.
  // Seule `srt1` compte, soit 700 € sur la fiche de Claire Vasseur.
  //
  // `srt5` est sur un FOURNISSEUR : on lui envoie un client comme a un
  // courtier, et c'est ce qui prouve que le tableau ne se limite pas aux
  // apporteurs. Les clients sont ceux des apports, dans l'autre sens : la meme
  // famille peut arriver par un partenaire et repartir vers un autre.
  //
  // Les textes de `objet` sont des PHRASES, pas des etiquettes : c'est ce qui
  // met a l'epreuve la zone de texte qui grandit avec son contenu.
  rgd_apports_sortants: [
    { id: 'srt1', apporteur_id: 'ap1', date_apport: '2026-08-18', client: 'Famille Ferrand',
      objet: 'Le financement du projet : compromis signe, pas encore de pret.',
      issue: 'gagne', montant_estime: 142000, commission: 700,
      // Le commentaire se relit SOUS ce qu'on a apporte, dans la meme
      // cellule : sans cette ligne de demo, le champ du formulaire
      // s'enregistrait sans que rien ne le reaffiche.
      notes: 'Commission versee a la signature, pas au depot du dossier.' },
    { id: 'srt2', apporteur_id: 'ap1', date_apport: '2026-09-19', client: 'Mme Chevalier',
      objet: 'Le financement des 63 500 € de travaux, elle cherchait une banque.',
      issue: null, montant_estime: 63500, commission: 500 },
    { id: 'srt3', apporteur_id: 'ap2', date_apport: '2026-09-24', client: 'SCI du Pre Long',
      objet: 'Les plans de la surelevation et le depot du permis.',
      issue: null, montant_estime: 9000, commission: 450 },
    { id: 'srt4', apporteur_id: 'ap2', date_apport: '2026-07-05', client: 'M. Delaunay',
      objet: 'Des plans pour l\'extension. Le client a renonce au chantier.',
      issue: 'perdu', montant_estime: 7000 },
    { id: 'srt5', apporteur_id: 'ap4', date_apport: '2026-09-30', client: 'Famille Renard',
      objet: 'La fourniture de la cuisine.', issue: null, montant_estime: 11000 },
    // ⚠ CELLE-CI N'A PAS DE FICHE D'ANNUAIRE : son partenaire est un NOM, en
    // texte libre (`apporteur_id` nul). Sans elle, rien n'eprouvait le cas
    // demande le 05/10 — ni l'affichage du nom, ni le filtre de l'ecran qui
    // jetait ces lignes, ni le formulaire qui est leur SEULE porte de
    // correction : elle n'apparait dans la fiche d'aucun partenaire.
    { id: 'srt6', apporteur_id: null, partenaire: 'Maitre Berthier, notaire a Senlis',
      date_apport: '2026-09-12', client: 'SCI des Ormes',
      objet: 'La vente du lot une fois les travaux termines.',
      issue: null, montant_estime: 3200 },
  ],

  rgd_sous_traitants: [
    { id: 'st1', owner_id: 'u-mickael', d1_id: 9001, raison_sociale: 'Élec Démo SARL', contact_nom: 'Paul Martin',
      email: 'paul@example.com', telephone: '02 61 91 00 21', siret: '00000000000001',
      specialites: 'Électricité', adresse: '4 rue de la Démo, 37000 Tours',
      actif: true, statut_relation: 'actif', updated_at: d(-1) },
    { id: 'st2', owner_id: 'u-charge', d1_id: 9002, raison_sociale: 'Plomberie Exemple', contact_nom: 'Sonia Blanc',
      email: 'sonia@example.com', telephone: '02 61 91 00 22', siret: '00000000000002',
      specialites: 'Plomberie', adresse: '12 avenue du Test, 37100 Tours',
      // Une date venue de la synchronisation SANS document derrière : c'est le
      // cas que l'écran doit dénoncer, et il faut pouvoir le voir en démo.
      attestation_vigilance_expire: day(120),
      actif: true, statut_relation: 'actif', updated_at: d(-1) },
    { id: 'st3', owner_id: 'u-mickael', d1_id: 9003, raison_sociale: 'Couverture du Val', contact_nom: 'Karim Lefèvre',
      telephone: '02 61 91 00 23', specialites: 'Couverture',
      actif: true, statut_relation: 'potentiel', updated_at: d(-1) },
    { id: 'st4', owner_id: 'u-mickael', d1_id: 9004, raison_sociale: 'Peinture Ancienne', contact_nom: 'Yves Roux',
      email: 'yves@example.com', specialites: 'Peinture',
      actif: false, statut_relation: 'actif', updated_at: d(-30) },
  ],
  // Les chantiers de l'espace RGD.
  //
  // ⚠ SANS EUX L'ÉCRAN EST VIDE EN DÉMO, donc inessayable : le statut et la
  // création s'y écrivent depuis le 25/09/2026 dans Supabase, et c'était le
  // dernier écran d'écriture de l'espace qu'on ne pouvait éprouver qu'en
  // production. ⚠ NOMS INVENTÉS, comme pour les sous-traitants : le dépôt est
  // public.
  //
  // ⚠ CHAQUE CHANTIER PORTE SON AFFAIRE, et c'est obligatoire : le filtre
  // `.filter(c => c.affaire)` écarte tout chantier dont le `deal_id` ne
  // retrouve pas son affaire, donc un chantier semé seul laisserait la liste
  // vide sans rien dire. Le `contact_id` compte lui aussi : c'est par lui que
  // l'écriture retrouve la fiche du prospect à faire avancer.
  //
  // Les quatre cas qui ne se lisent pas pareil à l'écran : une visite
  // technique (la première colonne de la pipeline), un devis présenté, un
  // chantier en cours, et un terminé — celui-là porte `date_passage_termine`,
  // qui doit DISPARAÎTRE si on le fait reculer.
  // ⚠ LA CORBEILLE (06/10/2026). Une seule ligne, et elle porte le cas le
  // moins évident : une suppression FORCÉE, qui a laissé un devis sans fiche.
  // Une corbeille semée vide montrerait un écran mort ; une ligne ordinaire ne
  // montrerait pas la pastille ambre de ce qui reste orphelin, qui est
  // précisément ce qu'on vient y lire.
  //
  // ⚠ `fiche` EST LA LIGNE ENTIÈRE, telle qu'elle était : c'est elle que la
  // restauration remet, avec son identifiant d'origine. Un résumé ne
  // suffirait pas — ce serait une trace, pas une corbeille.
  rgd_corbeille: [
    { id: 'corb1', source: 'clients', fiche_id: 'rc-supprimee', contact_id: 'c17',
      nom: 'Nadia Lemoine',
      fiche: { id: 'rc-supprimee', contact_id: 'c17', owner_id: 'u-mickael',
        statut: 'prospect', statut_suivi: 'devis_en_cours', source: 'site',
        notes: 'Devis envoyé, sans réponse depuis trois semaines.', maj: d(-2) },
      affaires: [], chantiers: [],
      orphelins: { devis: 1, paiements: 0, chantiers: 0, autres: 0 },
      forcee: true, contact_archive: true,
      supprime_le: d(-2), par: 'u-mickael', restauree_le: null, restauree_par: null },
  ],
  rgd_chantiers: [
    { id: 'rch1', deal_id: 'd1', contact_id: 'c1', reference: 'Rénovation appartement — Bernard',
      adresse: '12 rue Nationale', code_postal: '37000', ville: 'Tours',
      statut_d1: 'visite_technique', date_debut_prevue: day(1),
      // ⚠ LE LIEN VERS L'AGENDA EST CE QUI DONNE L'HEURE. Sans lui la colonne
      // « Rendez-vous » de l'onglet RDV n'affiche que la date — le cas de la
      // sixième visite en production. Les deux cas sont donc semés : celui-ci
      // avec son événement, `rch5` sans.
      source_event_id: 'demo-visite-bernard',
      created_at: d(-6), updated_at: d(-3) },
    // ⚠ CES DEUX VISITES SONT LÀ POUR LES DEUX CAS DE LA COLONNE « Rendez-vous »
    // de `#/rgd/clients`, et elles portent sur des fiches DÉJÀ dans l'onglet RDV
    // (`rc5` et `rc6`, nées d'un rendez-vous) — une visite sur une fiche qui a
    // déjà un devis ne s'y affiche pas, le devis l'emportant sur le rendez-vous.
    // `rch6` est liée à son événement : date ET heure. `rch5` ne l'est pas :
    // date seule, « heure inconnue » — l'état d'une visite sur six en production.
    // ⚠ UNE VISITE PASSÉE NE RESTE DANS L'ONGLET QUE SI L'AGENDA LA CONFIRME
    // (`visiteEnCours`) : d'où l'événement `demo-visite-garnier` posé le même
    // jour. Sans lui cette ligne disparaîtrait, et le cas « passé en tête du
    // tri chronologique » ne serait pas éprouvable.
    { id: 'rch7', deal_id: null, contact_id: 'c3', reference: 'Visite technique — Garnier',
      ville: 'Amboise', statut_d1: 'visite_technique', date_debut_prevue: day(-2),
      source_event_id: 'demo-visite-garnier', created_at: d(-40), updated_at: d(-3) },
    { id: 'rch8', deal_id: 'd-rdv', contact_id: 'c4', reference: 'Visite technique — Petit',
      ville: 'Tours', statut_d1: 'visite_technique', date_debut_prevue: day(21),
      source_event_id: 'demo-visite-petit',
      created_at: d(-1), updated_at: d(-1) },
    { id: 'rch5', deal_id: null, contact_id: 'c15', reference: 'Visite technique — Leclerc',
      ville: 'Tours', statut_d1: 'visite_technique', date_debut_prevue: day(3),
      created_at: d(-2), updated_at: d(-2) },
    { id: 'rch6', deal_id: null, contact_id: 'c14', reference: 'Visite technique — Dumas',
      ville: 'Tours', statut_d1: 'visite_technique', date_debut_prevue: day(2),
      source_event_id: 'demo-visite-dumas',
      created_at: d(-1), updated_at: d(-1) },
    { id: 'rch2', deal_id: 'd2', contact_id: 'c8', reference: 'Salle de bain — Fontaine',
      ville: 'Tours', statut_d1: 'devis_presente', montant_ht: 11500,
      created_at: d(-20), updated_at: d(-8) },
    { id: 'rch3', deal_id: 'd3', contact_id: 'c2', reference: 'Réaménagement maison — Haddad',
      ville: 'Joué-lès-Tours', statut_d1: 'en_cours', etat: 'en_cours',
      montant_ht: 42000, work_start_at: day(-40),
      created_at: d(-120), updated_at: d(-40) },
    { id: 'rch4', deal_id: 'd4', contact_id: 'c9', reference: 'Cuisine — Roux',
      ville: 'Tours', statut_d1: 'termine', etat: 'termine',
      date_passage_termine: d(-10), created_at: d(-2), updated_at: d(-10) },
  ],
  // ⚠ L'AGENDA RELEVÉ, ABSENT DU JEU D'EXEMPLE JUSQU'AU 30/09/2026. Sans lui la
  // colonne « Rendez-vous » de `#/rgd/clients` n'affiche jamais d'heure, et le
  // bloc « Aujourd'hui » de la vue d'ensemble reste vide : les deux n'étaient
  // essayables qu'en production. Ce sont des rendez-vous INVENTÉS — le dépôt
  // est public.
  // ⚠ `google_id` est ce que le chantier désigne par `source_event_id` : c'est
  // le lien exact, celui que le relevé pose, et pas un rapprochement par nom.
  agenda_events: [
    // ⚠ UNE VISITE PASSÉE, ET ELLE N'EXISTE QUE PARCE QUE CET ÉVÉNEMENT EXISTE :
    // `visiteEnCours` ne garde un jour révolu que si l'agenda le confirme
    // (`joursDeVisite`). Sans cette ligne, le chantier `rch7` sortirait de
    // l'onglet et le tri chronologique n'aurait aucun passé à placer en tête.
    // ⚠ CELUI-CI DIT UNE RÈGLE QU'ON OUBLIE : dans la fenêtre relevée
    // (J-7 → J+30), c'est l'AGENDA qui tranche, pas le chantier. `rch8` est daté
    // de J+21 ; sans cet événement, `visiteEnCours` répond NON et la fiche
    // tombe en « sans date » — elle reste dans l'onglet par son `statut_suivi`,
    // mais le tri n'a rien à placer. Constaté en lisant l'ordre produit.
    // ⚠ CELUI-CI PORTE UNE DESCRIPTION, et c'est le seul du jeu : c'est la
    // forme REELLE d'un rendez-vous pris au telephone — Mickael pose le
    // numero et deux lignes sur le projet dans la description de l'evenement,
    // et c'est de la que la fiche tire son commentaire et son telephone.
    // Sans elle, le bloc « Commentaire » de la fiche n'etait essayable que
    // sur la production, dans son cas le plus courant.
    { id: 'rgd|demo-visite-petit|' + day(21), activity: 'rgd',
      calendar_id: 'demo-rgd@group.calendar.google.com', google_id: 'demo-visite-petit',
      title: 'Visite technique: M. Petit', location: 'Tours',
      description: 'coordonnée du client: 06 39 98 00 04\nProjet: rénovation d’une salle de bain',
      starts_at: d(21, 10), ends_at: d(21, 11), all_day: false, day: day(21) },
    { id: 'rgd|demo-visite-garnier|' + day(-2), activity: 'rgd',
      calendar_id: 'demo-rgd@group.calendar.google.com', google_id: 'demo-visite-garnier',
      title: 'Visite technique: Mme Garnier', location: 'Amboise',
      starts_at: d(-2, 11), ends_at: d(-2, 12), all_day: false, day: day(-2) },
    { id: 'rgd|demo-visite-bernard|' + day(1), activity: 'rgd',
      calendar_id: 'demo-rgd@group.calendar.google.com', google_id: 'demo-visite-bernard',
      title: 'Visite technique: Mme Bernard', location: '12 rue Nationale, Tours',
      starts_at: d(1, 14), ends_at: d(1, 15), all_day: false, day: day(1) },
    // ⚠ CELUI-CI EST POSÉ SANS LIEN SUR LE CHANTIER, et c'est le second cas à
    // éprouver : la visite tient (l'agenda porte bien un rendez-vous ce
    // jour-là, donc `joursDeVisite` la confirme) mais aucun `source_event_id`
    // ne la relie, donc l'heure reste inconnue. C'est l'état d'une visite sur
    // six en production.
    { id: 'rgd|demo-visite-leclerc|' + day(3), activity: 'rgd',
      calendar_id: 'demo-rgd@group.calendar.google.com', google_id: 'demo-visite-leclerc',
      title: 'Visite technique: M. Leclerc', location: 'Tours',
      starts_at: d(3, 9), ends_at: d(3, 10), all_day: false, day: day(3) },
    { id: 'rgd|demo-visite-dumas|' + day(2), activity: 'rgd',
      calendar_id: 'demo-rgd@group.calendar.google.com', google_id: 'demo-visite-dumas',
      title: 'Visite technique: M. Dumas', location: 'Saint-Cyr-sur-Loire',
      starts_at: d(2, 16), ends_at: d(2, 17), all_day: false, day: day(2) },
    { id: 'rgd|demo-point-chantier|' + day(0), activity: 'rgd',
      calendar_id: 'demo-rgd@group.calendar.google.com', google_id: 'demo-point-chantier',
      title: 'Point chantier Haddad', location: 'Joué-lès-Tours',
      starts_at: d(0, 10), ends_at: d(0, 11), all_day: false, day: day(0) },
  ],
  // Les devis de l'espace RGD.
  //
  // ⚠ SANS EUX L'ÉCRAN `#/rgd/devis` EST VIDE EN DÉMO, donc « Marquer signé »
  // n'était essayable qu'en production — et c'est précisément le geste porté
  // dans le CRM le 25/09/2026. Quatre lignes pour les quatre cas que l'écran
  // distingue : un brouillon, un envoyé (le seul sur lequel le bouton a un
  // sens à deux reprises), un déjà signé (le bouton doit y DISPARAÎTRE) et un
  // refusé. ⚠ Numéros et objets inventés : le dépôt est public.
  // ⚠ UN DEVIS SE RATTACHE À UNE PERSONNE **OU** À UNE ENTREPRISE, jamais
  // seulement par son affaire : l'écran de synchronisation alerte sur les
  // devis qui n'ont ni l'un ni l'autre, et sans ces deux colonnes la démo
  // criait cette alerte sur ses quatre devis. Le troisième porte une
  // `organisation_id` parce que c'est le cas réel le plus fréquent en
  // production — SCI et sociétés — et celui qui avait fait lire l'alerte de
  // travers le 28/09/2026.
  rgd_devis: [
    { id: 'rdv1', deal_id: 'd1', contact_id: 'c1', numero: 'DEV-2026-201',
      objet: 'Rénovation appartement — lot peinture',
      montant_ht: 9800, montant_ttc: 11760, statut: 'brouillon',
      date_creation: day(-3) },
    { id: 'rdv2', deal_id: 'd2', contact_id: 'c8', numero: 'DEV-2026-118',
      objet: 'Salle de bain complète',
      montant_ht: 11500, montant_ttc: 13800, statut: 'envoye',
      date_creation: day(-20), date_envoi: day(-8) },
    { id: 'rdv3', deal_id: 'd3', organisation_id: 'o4', numero: 'DEV-2026-097',
      objet: 'Réaménagement maison',
      montant_ht: 42000, montant_ttc: 50400, statut: 'signe',
      date_creation: day(-120), date_envoi: day(-95), date_signature: day(-80) },
    { id: 'rdv4', deal_id: 'd4', contact_id: 'c9', numero: 'DEV-2026-205',
      objet: 'Cuisine équipée',
      montant_ht: 15200, montant_ttc: 18240, statut: 'refuse',
      date_creation: day(-15), date_envoi: day(-12) },
  ],
  // Une seule pièce déposée, chez le premier : assez pour voir la pastille
  // verte, le téléchargement et la relance qui ne réclame que ce qui manque.
  rgd_st_pieces: [
    { id: 'stp1', sous_traitant_id: 'st1', type: 'vigilance',
      chemin: 'st1/vigilance.pdf', nom_fichier: 'vigilance-demo.pdf',
      taille_octets: 12345, expire_le: day(90), deposee_le: d(-5) },
  ],

  // ⚠ LA DÉMO N'AVAIT AUCUNE FICHE RGD, ET ÇA A COÛTÉ UN ÉCRAN BLANC.
  // Le 24/09/2026, `ficheDe` a été sortie de `render` en laissant trois
  // fonctions derrière elle. Le défaut ne pouvait se voir qu'en ouvrant une
  // fiche — donc jamais en démo, puisqu'il n'y en avait pas une seule. Il est
  // parti en production et c'est Mickael qui l'a trouvé. Un jeu d'essai qui ne
  // couvre pas un écran ne le teste pas : il donne seulement l'impression de
  // l'avoir testé.
  //
  // Les cinq premières couvrent les cinq statuts de « Nouvelle demande », qui
  // est le seul onglet de la frise à en réunir plusieurs — et donc le seul qui
  // porte un filtre de statut. Les provenances sont volontairement croisées :
  // c'est ce qui permet de vérifier que les deux menus comptent l'un sur
  // l'autre au lieu de s'ignorer.
  //
  // `source` n'est pas décoratif : une fiche n'entre dans la frise que si elle
  // vient d'une prospection (`estProspectParSource`). Sans lui, ces lignes
  // seraient invisibles et la démo serait à nouveau vide sans le dire.
  // ⚠ DEUX FICHES PORTENT UN `d1_id` (rc4 et rd1), et ce n'est pas du décor.
  // En production, les 192 fiches en ont un : elles viennent de l'application
  // RGD, et les supprimer exige une PIERRE TOMBALE, sans quoi la
  // synchronisation les ramènerait au passage suivant. Sans une seule fiche de
  // ce genre, la démo ne montrait que le cas facile — la fiche née ici, qui
  // n'a rien à empêcher de revenir — et la moitié du geste ne s'essayait qu'en
  // production. Les valeurs sont hors des plages réelles pour qu'on ne les
  // prenne pas pour de vraies lignes. ⚠ Elles n'ont ni devis ni chantier : une
  // fiche qui en porte est refusée à la suppression AVANT même la question, et
  // la pierre tombale ne se serait jamais essayée.
  rgd_clients: [
    { id: 'rc1', owner_id: 'u-charge', contact_id: 'c1', statut: 'prospect', statut_suivi: 'nouveau_prospect',
      source: 'meta_ads', meta_received_at: d(-6), meta_type_projet: 'Rénovation complète',
      meta_budget: '30 000 €', notes: '', maj: d(-6) },
    // Trois dossiers portent des dates de relance : sans elles la colonne
    // « Derniere relance » est vide de haut en bas, et ni l'ambre des deux
    // semaines ni la ligne des relances precedentes ne s'essaient en demo.
    // ⚠ CETTE FICHE PORTE LES CHAMPS DU PROJET, les autres non — et c'est
    // volontaire : une tâche dont le projet est renseigné et une autre où il
    // manque doivent toutes deux s'essayer. Sans celle-ci, le bloc « ce que la
    // tâche concerne » ne montrait jamais sa ligne « projet ».
    { id: 'rc2', owner_id: 'u-charge', contact_id: 'c9', statut: 'prospect', statut_suivi: 'relance_1',
      type_bien: 'Appartement', types_travaux: ['Salle de bain', 'Plomberie'],
      budget_annonce: 'De 10 000 à 20 000 €', ville_chantier: 'Chantilly (60)',
      adresse_chantier: '12 rue des Lilas',
      relance_1_le: day(-3),
      source: 'meta_ads', meta_received_at: d(-2), meta_type_projet: 'Isolation',
      notes: 'Message laissé sur répondeur.', maj: d(-1) },
    { id: 'rc3', owner_id: 'u-mickael', contact_id: 'c12', statut: 'prospect', statut_suivi: 'relance_2',
      relance_1_le: day(-26), relance_2_le: day(-5),
      source: 'Formulaire site', notes: '', maj: d(-4) },
    { id: 'rc4', owner_id: 'u-mickael', contact_id: 'c13', d1_id: 7001, statut: 'prospect', statut_suivi: 'relance_3',
      relance_1_le: day(-45), relance_2_le: day(-31), relance_3_le: day(-22),
      source: 'manuel', notes: 'Ne répond plus depuis trois semaines.', maj: d(-9) },
    // ⚠ CES TROIS FICHES ÉPROUVENT LE TRI DE L'ONGLET « RDV » (02/10/2026), et
    // elles sont construites pour le DISTINGUER du tri par date de réception :
    // avec deux dossiers déjà dans le bon ordre, un tri juste et un tri faux
    // rendent la même liste, et le contrôle ne prouve rien.
    //   `rc13` — reçue il y a longtemps, visite DEMAIN : elle doit remonter en
    //            tête alors que l'ancien tri la mettait en bas ;
    //   `rc14` — reçue hier, visite dans trois semaines : l'inverse ;
    //   `rc15` — reçue hier, AUCUNE visite connue : elle doit finir dernière,
    //            jamais première.
    { id: 'rc13', owner_id: 'u-mickael', contact_id: 'c3', statut: 'qualifie', statut_suivi: 'rdv_planifie',
      source: 'manuel', notes: 'Visite avancée à la demande du client.', maj: d(-40) },
    // ⚠ SANS NOTE PROPRE, VOLONTAIREMENT : son commentaire vient de la
    // description du rendez-vous. C'est le cas le plus courant en production
    // et le seul qui montre le champ « repris du rendez-vous ».
    { id: 'rc14', owner_id: 'u-mickael', contact_id: 'c4', statut: 'qualifie', statut_suivi: 'rdv_planifie',
      source: 'site', notes: null, maj: d(-1) },
    { id: 'rc15', owner_id: 'u-mickael', contact_id: 'c11', statut: 'qualifie', statut_suivi: 'rdv_planifie',
      source: 'manuel', notes: 'Rendez-vous à caler, aucune date posée.', maj: d(-1) },
    { id: 'rc5', owner_id: 'u-mickael', contact_id: 'c14', statut: 'qualifie', statut_suivi: 'rdv_planifie',
      source: 'google_calendar', notes: 'Fiche créée depuis le rendez-vous.', maj: d(-1) },
    // Deux étapes plus loin, pour vérifier qu'aucun filtre de statut
    // n'apparaît là où l'onglet est déjà le statut.
    { id: 'rc6', owner_id: 'u-mickael', contact_id: 'c15', statut: 'qualifie', statut_suivi: 'rdv_planifie',
      source: 'google_calendar', notes: '', maj: d(-1) },
    { id: 'rc7', owner_id: 'u-mickael', contact_id: 'c8', statut: 'client', statut_suivi: 'devis_envoye',
      source: 'manuel', notes: '', maj: d(-8) },

    // ⚠ CELLES-CI PORTENT UN `costructor_id`, ET C'EST CE QUI LES FAIT ENTRER
    // DANS « TOUS LES CONTACTS ». L'annuaire ne montre que les fiches connues
    // de Costructor (`fiches.filter(f => f.costructor_id)`) : sans cette clef,
    // l'onglet restait a zero en demo et son tri comme sa colonne de nom ne
    // pouvaient pas s'y verifier.
    //
    // Les trois couvrent les trois formes que la colonne doit savoir ecrire :
    // un particulier avec nom et prenom, un professionnel qui n'a qu'une
    // raison sociale, et une personne sans nom de famille.
    { id: 'rc8', owner_id: 'u-mickael', contact_id: 'c2', costructor_id: 'cli_demo_01', statut: 'client',
      statut_suivi: 'chantier_termine', source: 'costructor', notes: '', maj: d(-40) },
    { id: 'rc9', organisation_id: 'o4', costructor_id: 'cli_demo_02', statut: 'client',
      statut_suivi: 'chantier_en_cours', source: 'costructor', notes: '', maj: d(-12) },
    { id: 'rc10', contact_id: 'c16', costructor_id: 'cli_demo_03', statut: 'client',
      statut_suivi: 'chantier_termine', source: 'costructor', notes: '', maj: d(-150) },
    // ⚠ LES TROIS NATURES DE L'ANNUAIRE, et pas une seule repetee. Le menu de
    // statut ne s'affiche que s'il y a un choix a faire : avec trois fiches
    // toutes « client », il disparaissait et la regle n'etait pas verifiable.
    // La production en porte trois — prospect, client, partenaire — et c'est ce
    // que la demo doit reproduire.
    { id: 'rc11', contact_id: 'c7', costructor_id: 'cli_demo_04', statut: 'prospect',
      statut_suivi: 'devis_envoye', source: 'costructor', notes: '', maj: d(-20) },
    { id: 'rc12', organisation_id: 'o1', costructor_id: 'cli_demo_05', statut: 'partenaire',
      statut_suivi: 'nouveau_prospect', source: 'costructor', notes: '', maj: d(-12) },
  ],

  // Les demandes du formulaire du site — une table à part des fiches.
  //
  // ⚠ LA DEUXIÈME PORTE `rejetee`, ET C'EST TOUT SON INTÉRÊT. Ce statut existe
  // en base mais pas dans le vocabulaire des sept étapes. Sans un exemple ici,
  // le cas ne se reproduit que sur la production : la valeur retombe dans
  // « Nouvelle demande », le menu de saisie n'a aucune option qui corresponde
  // et affiche silencieusement la première, et le filtre de statut la fait
  // apparaître comme une étape à part entière. Signalé par Mickael le
  // 24/09/2026. Elle se lit désormais « nouveau prospect » ; cette ligne est là
  // pour que la prochaine régression se voie sans ouvrir la production.
  rgd_demandes: [
    // ⚠ CETTE DEMANDE PORTE UN `contact_id`, les autres non. C'est le cas réel
    // d'une demande du site reprise dans l'annuaire — et le seul par lequel une
    // tâche peut remonter jusqu'à elle. Sans lui, le bouton « Ouvrir la fiche »
    // d'un rappel ne s'essayait que sur une fiche client, jamais sur une
    // demande : les deux n'ont ni les mêmes colonnes ni la même étape.
    { id: 'rd1', owner_id: 'u-charge', d1_id: 7101, contact_id: 'c12', prenom: 'Camille', nom: 'Vasseur', email: 'camille.vasseur@example.com',
      telephone: '06 39 98 00 21', ville: 'Tours', code_postal: '37000',
      adresse: '4 rue des Tanneurs', types_travaux: '["Isolation","Menuiseries"]',
      budget: '15 000 €', statut: 'nouveau_prospect', date_demande: d(-5),
      commentaire_admin: '' },
    { id: 'rd2', prenom: 'Bruno', nom: 'Tessier', email: 'bruno.tessier@example.com',
      telephone: '06 39 98 00 22', ville: 'Amboise', code_postal: '37400',
      types_travaux: 'Véranda', statut: 'rejetee', date_demande: d(-160),
      commentaire_admin: 'Hors zone d’intervention.' },
  ],
};
