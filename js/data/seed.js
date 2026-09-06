// Jeu de données de démonstration (mode local uniquement).
import { SEED_BROKERS } from './seed-vivier.js';
const d = (offsetDays, h = 9) => {
  const x = new Date(); x.setHours(h, 0, 0, 0); x.setDate(x.getDate() + offsetDays); return x.toISOString();
};
const day = (offsetDays) => d(offsetDays).slice(0, 10);

export const SEED_USERS = [
  { id: 'u-mickael', full_name: 'Mickael Rigaud', email: 'mickael@exemple.fr', role: 'direction', activities: ['rgd', 'btp', 'courtage', 'propulsion'], active: true, patrimony_access: true },
  { id: 'u-stephanie', full_name: 'Stéphanie', email: 'stephanie@exemple.fr', role: 'propulsion', activities: ['propulsion'], active: true },
  { id: 'u-elodie', full_name: 'Élodie', email: 'elodie@exemple.fr', role: 'propulsion', activities: ['propulsion'], active: true },
  { id: 'u-charge', full_name: "Chargé d'affaires (démo)", email: 'charge@exemple.fr', role: 'commercial', activities: ['rgd', 'btp'], active: true },
];

export const SEED = {
  organisations: [
    { id: 'o1', name: 'Agence Immo Centre', type: 'Partenaire', partner_job: 'Agence immobilière', zone: 'Tours', activities: ['btp', 'courtage'], phone: '02 47 00 00 01', email: 'contact@agenceimmocentre.fr', city: 'Tours', owner_id: 'u-mickael', last_contact_at: d(-12), created_at: d(-200) },
    { id: 'o2', name: 'Étude Notariale Martin', type: 'Partenaire', partner_job: 'Notaire', zone: 'Indre-et-Loire', activities: ['btp'], phone: '02 47 00 00 02', email: 'etude@notaire-martin.fr', city: 'Amboise', owner_id: 'u-mickael', last_contact_at: d(-40), created_at: d(-300) },
    { id: 'o3', name: 'Boulangerie Dupuis', type: 'Client', client_status: 'Client actif', activities: ['propulsion'], phone: '02 47 00 00 03', city: 'Tours', owner_id: 'u-stephanie', offer: 'Réseaux sociaux + Meta Ads', monthly_amount: 450, commitment_months: 12, start_date: day(-250), renewal_date: day(30), account_manager_id: 'u-stephanie', created_at: d(-260) },
    { id: 'o4', name: 'SCI Les Tilleuls', type: 'Client', activities: ['rgd'], city: 'Saint-Avertin', owner_id: 'u-mickael', created_at: d(-90) },
    { id: 'o5', name: 'Cabinet Avocats Leroy', type: 'Partenaire', partner_job: 'Avocat', zone: 'Tours', activities: ['btp'], email: 'contact@leroy-avocats.fr', city: 'Tours', owner_id: 'u-mickael', last_contact_at: d(-70), created_at: d(-150) },
    { id: 'o6', name: 'Garage Moreau', type: 'Prospect', client_status: 'Prospect', activities: ['propulsion'], city: 'Joué-lès-Tours', owner_id: 'u-stephanie', created_at: d(-10) },
  ],
  contacts: [
    { id: 'c1', first_name: 'Julie', last_name: 'Bernard', phone: '06 11 22 33 44', email: 'julie.bernard@mail.fr', city: 'Tours', postal_code: '37000', activities: ['rgd'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', consent: true, created_at: d(-6) },
    { id: 'c2', first_name: 'Karim', last_name: 'Haddad', phone: '06 22 33 44 55', email: 'k.haddad@mail.fr', city: 'Saint-Cyr-sur-Loire', postal_code: '37540', activities: ['rgd', 'courtage'], type: 'Client', owner_id: 'u-mickael', channel: 'Recommandation client', consent: true, created_at: d(-120) },
    { id: 'c3', first_name: 'Sophie', last_name: 'Garnier', phone: '06 33 44 55 66', email: 'sophie.garnier@mail.fr', city: 'Amboise', postal_code: '37400', activities: ['btp'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Partenaire / apporteur', referrer_org_id: 'o1', consent: true, created_at: d(-15) },
    { id: 'c4', first_name: 'Thomas', last_name: 'Petit', phone: '06 44 55 66 77', email: 'thomas.petit@mail.fr', city: 'Tours', postal_code: '37100', activities: ['btp'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Google organique / SEO', consent: true, created_at: d(-3) },
    { id: 'c5', first_name: 'Marc', last_name: 'Dupuis', phone: '06 55 66 77 88', email: 'marc@boulangerie-dupuis.fr', organisation_id: 'o3', city: 'Tours', activities: ['propulsion'], type: 'Client', owner_id: 'u-stephanie', channel: 'Réseau professionnel', consent: true, created_at: d(-260) },
    { id: 'c6', first_name: 'Nadia', last_name: 'Moreau', phone: '06 66 77 88 99', email: 'nadia@garage-moreau.fr', organisation_id: 'o6', city: 'Joué-lès-Tours', activities: ['propulsion'], type: 'Prospect', owner_id: 'u-stephanie', channel: 'Instagram organique', consent: true, created_at: d(-10) },
    { id: 'c7', first_name: 'Paul', last_name: 'Lemaire', phone: '06 77 88 99 00', email: 'paul.lemaire@mail.fr', city: 'Montlouis-sur-Loire', postal_code: '37270', activities: ['courtage'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Site internet direct', consent: true, created_at: d(-20) },
    { id: 'c8', first_name: 'Claire', last_name: 'Fontaine', phone: '06 88 99 00 11', email: 'claire.fontaine@mail.fr', city: 'Tours', postal_code: '37200', activities: ['rgd'], type: 'Client', owner_id: 'u-mickael', channel: 'Google Ads', campaign: 'RGD-SdB-2026', consent: true, created_at: d(-75) },
    { id: 'c9', first_name: 'Antoine', last_name: 'Roux', phone: '06 99 00 11 22', email: 'antoine.roux@mail.fr', city: 'Chambray-lès-Tours', postal_code: '37170', activities: ['rgd'], type: 'Prospect', owner_id: 'u-charge', channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', consent: true, created_at: d(-2) },
    { id: 'c10', first_name: 'Isabelle', last_name: 'Marchand', phone: '06 10 20 30 40', email: 'i.marchand@mail.fr', city: 'Tours', postal_code: '37000', activities: ['btp'], type: 'Client', owner_id: 'u-mickael', channel: 'Partenaire / apporteur', referrer_org_id: 'o2', consent: true, created_at: d(-60) },
    { id: 'c11', first_name: 'Hugo', last_name: 'Blanc', phone: '06 12 34 56 78', email: 'hugo.blanc@mail.fr', city: 'La Riche', postal_code: '37520', activities: ['courtage'], type: 'Prospect', owner_id: 'u-mickael', channel: 'Meta Ads', campaign: 'RAC-Regroupement-Sept26', consent: true, created_at: d(-1) },
  ],
  deals: [
    { id: 'd1', title: 'Rénovation appartement — Bernard', activity: 'rgd', stage: 'visite', status: 'open', contact_id: 'c1', owner_id: 'u-mickael', amount: 28000, channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', fields: { type_travaux: 'Rénovation complète', adresse_chantier: '12 rue Nationale, Tours', budget_annonce: 30000, date_visite: day(1) }, stage_history: [{ stage: 'lead', at: d(-6) }, { stage: 'qualifie', at: d(-5) }, { stage: 'visite', at: d(-3) }], created_at: d(-6), stage_changed_at: d(-3) },
    { id: 'd2', title: 'Salle de bain — Fontaine', activity: 'rgd', stage: 'devis_envoye', status: 'open', contact_id: 'c8', owner_id: 'u-mickael', amount: 11500, channel: 'Google Ads', campaign: 'RGD-SdB-2026', fields: { type_travaux: 'Salle de bain', num_devis: 'DEV-2026-118' }, stage_history: [{ stage: 'lead', at: d(-20) }, { stage: 'visite', at: d(-14) }, { stage: 'devis_envoye', at: d(-8) }], created_at: d(-20), stage_changed_at: d(-8) },
    { id: 'd3', title: 'Réaménagement maison — Haddad', activity: 'rgd', stage: 'nego', status: 'won', contact_id: 'c2', owner_id: 'u-mickael', amount: 42000, channel: 'Recommandation client', fields: { type_travaux: 'Réaménagement', num_devis: 'DEV-2026-097' }, stage_history: [{ stage: 'lead', at: d(-120) }, { stage: 'visite', at: d(-110) }, { stage: 'devis_envoye', at: d(-95) }, { stage: 'nego', at: d(-80) }], created_at: d(-120), won_at: d(-70), closed_at: d(-70), stage_changed_at: d(-80) },
    { id: 'd4', title: 'Cuisine — Roux', activity: 'rgd', stage: 'lead', status: 'open', contact_id: 'c9', owner_id: 'u-charge', amount: 0, channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', fields: { type_travaux: 'Cuisine', budget_annonce: 15000 }, stage_history: [{ stage: 'lead', at: d(-2) }], created_at: d(-2), stage_changed_at: d(-2) },
    { id: 'd5', title: 'Isolation combles — SCI Les Tilleuls', activity: 'rgd', stage: 'devis_envoye', status: 'lost', lost_reason: 'Prix', organisation_id: 'o4', owner_id: 'u-mickael', amount: 9800, channel: 'Site internet direct', fields: { type_travaux: 'Plâtrerie / isolation' }, stage_history: [{ stage: 'lead', at: d(-90) }, { stage: 'devis_envoye', at: d(-75) }], created_at: d(-90), lost_at: d(-50), closed_at: d(-50), stage_changed_at: d(-75) },
    { id: 'd6', title: 'Fissures façade — Garnier', activity: 'btp', stage: 'proposition', status: 'open', contact_id: 'c3', owner_id: 'u-mickael', amount: 900, channel: 'Partenaire / apporteur', referrer_org_id: 'o1', fields: { problematique: 'Fissures', type_bien: 'Maison', contexte: 'Achat immobilier', adresse: 'Amboise' }, stage_history: [{ stage: 'lead', at: d(-15) }, { stage: 'rdv', at: d(-10) }, { stage: 'proposition', at: d(-7) }], created_at: d(-15), stage_changed_at: d(-7) },
    { id: 'd7', title: 'Humidité sous-sol — Petit', activity: 'btp', stage: 'qualifie', status: 'open', contact_id: 'c4', owner_id: 'u-mickael', amount: 750, channel: 'Google organique / SEO', fields: { problematique: 'Humidité', type_bien: 'Maison', contexte: 'Particulier', urgence: true }, stage_history: [{ stage: 'lead', at: d(-3) }, { stage: 'qualifie', at: d(-1) }], created_at: d(-3), stage_changed_at: d(-1) },
    { id: 'd8', title: 'Malfaçons carrelage — Marchand', activity: 'btp', stage: 'rapport_remis', status: 'won', contact_id: 'c10', owner_id: 'u-mickael', amount: 1200, channel: 'Partenaire / apporteur', referrer_org_id: 'o2', fields: { problematique: 'Malfaçons', type_bien: 'Appartement', contexte: 'Litige', date_visite: day(-30), date_rapport: day(-20) }, stage_history: [{ stage: 'lead', at: d(-60) }, { stage: 'rdv', at: d(-50) }, { stage: 'proposition', at: d(-45) }, { stage: 'mission_planifiee', at: d(-40) }, { stage: 'rapport_remis', at: d(-20) }], created_at: d(-60), won_at: d(-40), closed_at: d(-40), stage_changed_at: d(-20) },
    { id: 'd9', title: 'Crédit immo — Lemaire', activity: 'courtage', stage: 'pieces', status: 'open', contact_id: 'c7', owner_id: 'u-mickael', amount: 2100, channel: 'Site internet direct', fields: { type_financement: 'Crédit immobilier', montant_projet: 240000, montant_financement: 210000, apport: 30000, objectif: 'Résidence principale', pieces_manquantes: 'Avis d\'imposition 2025, 3 derniers bulletins' }, stage_history: [{ stage: 'lead', at: d(-20) }, { stage: 'rdv', at: d(-12) }, { stage: 'pieces', at: d(-10) }], created_at: d(-20), stage_changed_at: d(-10) },
    { id: 'd10', title: 'Regroupement crédits — Blanc', activity: 'courtage', stage: 'lead', status: 'open', contact_id: 'c11', owner_id: 'u-mickael', amount: 1500, channel: 'Meta Ads', campaign: 'RAC-Regroupement-Sept26', fields: { type_financement: 'Regroupement de crédits' }, stage_history: [{ stage: 'lead', at: d(-1) }], created_at: d(-1), stage_changed_at: d(-1) },
    { id: 'd11', title: 'Rachat crédit — Haddad', activity: 'courtage', stage: 'banque', status: 'open', contact_id: 'c2', owner_id: 'u-mickael', amount: 1800, channel: 'Ancien client', fields: { type_financement: 'Crédit immobilier', montant_financement: 180000, objectif: 'Rachat / renégociation', partenaire_banque: 'Crédit Agricole' }, stage_history: [{ stage: 'lead', at: d(-35) }, { stage: 'rdv', at: d(-28) }, { stage: 'etude', at: d(-15) }, { stage: 'banque', at: d(-6) }], created_at: d(-35), stage_changed_at: d(-6) },
    { id: 'd12', title: 'Réseaux sociaux — Garage Moreau', activity: 'propulsion', stage: 'proposition', status: 'open', contact_id: 'c6', organisation_id: 'o6', owner_id: 'u-stephanie', amount: 4200, channel: 'Instagram organique', fields: { activite_client: 'Garage automobile', prestations: 'Réseaux sociaux', montant_mensuel: 350, duree_mois: 12, reseaux: 'Instagram, Facebook' }, stage_history: [{ stage: 'lead', at: d(-10) }, { stage: 'audit', at: d(-6) }, { stage: 'proposition', at: d(-4) }], created_at: d(-10), stage_changed_at: d(-4) },
    { id: 'd13', title: 'Pack complet — Boulangerie Dupuis', activity: 'propulsion', stage: 'onboarding', status: 'won', contact_id: 'c5', organisation_id: 'o3', owner_id: 'u-stephanie', amount: 5400, channel: 'Réseau professionnel', fields: { activite_client: 'Boulangerie', prestations: 'Pack complet', montant_mensuel: 450, duree_mois: 12, date_demarrage: day(-250) }, stage_history: [{ stage: 'lead', at: d(-270) }, { stage: 'proposition', at: d(-262) }, { stage: 'onboarding', at: d(-255) }], created_at: d(-270), won_at: d(-255), closed_at: d(-255), stage_changed_at: d(-255) },
  ],
  activities: [
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
  ad_spend: [
    { id: 's1', activity: 'rgd', channel: 'Meta Ads', campaign: 'RGD-Renov-Sept26', month: day(0).slice(0, 7) + '-01', amount: 420 },
    { id: 's2', activity: 'rgd', channel: 'Google Ads', campaign: 'RGD-SdB-2026', month: day(-75).slice(0, 7) + '-01', amount: 300 },
    { id: 's3', activity: 'courtage', channel: 'Meta Ads', campaign: 'RAC-Regroupement-Sept26', month: day(0).slice(0, 7) + '-01', amount: 180 },
  ],
  settings: [
    { key: 'intake_token', value: 'demo-token-a-changer' },
  ],
  broker_profiles: SEED_BROKERS,
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
  leases: [
    { id: 'b1', property_id: 'p1', lot: 'T2', tenant: 'Léa Martin', rent: 620, charges: 40, deposit: 620, start_date: '2024-09-01', end_date: null, active: true, created_at: d(-400) },
    { id: 'b2', property_id: 'p2', lot: 'RDC — T2', tenant: 'M. et Mme Petit', rent: 560, charges: 50, deposit: 560, start_date: '2023-11-01', end_date: null, active: true, created_at: d(-650) },
    { id: 'b3', property_id: 'p2', lot: '1er — T2', tenant: 'Nadia Benali', rent: 580, charges: 50, deposit: 580, start_date: '2024-02-01', end_date: null, active: true, created_at: d(-580) },
    { id: 'b4', property_id: 'p2', lot: '2e — T3', tenant: 'Famille Roux', rent: 720, charges: 60, deposit: 720, start_date: '2023-12-15', end_date: null, active: true, created_at: d(-620) },
    { id: 'b5', property_id: 'p3', lot: 'Place 14', tenant: 'Thomas Girard', rent: 75, charges: 0, deposit: 75, start_date: '2022-10-01', end_date: null, active: true, created_at: d(-790) },
  ],
  rent_payments: (() => {
    const out = []; const now = new Date(); const rents = { b1: 620, b2: 560, b3: 580, b4: 720, b5: 75 };
    for (let i = 8; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1); const key = m.toISOString().slice(0, 7);
      for (const [lease, rent] of Object.entries(rents)) {
        if (i === 0 && (lease === 'b3' || lease === 'b4')) continue; // loyers du mois en cours pas encore reçus
        if (i === 2 && lease === 'b2') { out.push({ id: `rp-${lease}-${key}`, lease_id: lease, month: key, amount: 300, received_at: key + '-12', note: 'Paiement partiel' }); continue; }
        out.push({ id: `rp-${lease}-${key}`, lease_id: lease, month: key, amount: rent, received_at: key + '-05' });
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
};
