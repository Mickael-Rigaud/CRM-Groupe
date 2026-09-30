import { dashboardPage } from './dashboard.js';
import { todayPage } from './today.js';
import { pipelinePage } from './pipeline.js';
import { contactsPage } from './contacts.js';
import { settingsPage } from './settings.js';
import { homePage } from './home.js';
import { patrimoinePage, propertiesPage, loansPage, expensesPage } from './patrimoine.js';
import { rgdChantiersPage } from './rgd-chantiers.js';
import { rgdClientsPage } from './rgd-clients.js';
import { rgdDevisPage, rgdPaiementsPage } from './rgd-facturation.js';
import { rgdSousTraitantsPage } from './rgd-soustraitants.js';
import { rgdAgendaPage } from './rgd-agenda.js';
import { rgdPartenairesPage } from './rgd-partenaires.js';
import { rgdRealisationsPage } from './rgd-realisations.js';
import { rgdPilotagePage } from './rgd-pilotage.js';
import { rgdCostructorPage } from './rgd-costructor.js';
import { rgdFormationsPage } from './rgd-formations.js';
import { rgdReglagesPage } from './rgd-reglages.js';
import { btpHomePage, btpExpertisePage, btpAmoPage, btpChargesPage, btpBasePage, btpDtuPage, btpMailsPage, btpFacturationPage, btpVivierPage } from './btp.js';
import { btpChecklistPage } from './btp-checklist.js';
import { btpRapportPage } from './btp-rapport.js';
import { btpChecklistAmoPage, btpRapportAmoPage } from './btp-pages.js';
import { btpAtlasPage } from './btp-atlas.js';
import { courtageHomePage, courtageBasePage, courtageVivierPage } from './courtage.js';
import { messageriePage } from './messagerie.js';

import { locatifPage, leasesPage, unitsPage, rentalTodoPage, tenantContactsPage } from './locatif.js';
export const pages = {
  home: homePage,
  patrimoine_home: patrimoinePage,
  patrimoine_biens: propertiesPage,
  patrimoine_prets: loansPage,
  patrimoine_loyers: locatifPage,
  locatif_home: locatifPage,
  locatif_baux: leasesPage,
  locatif_lots: unitsPage,
  locatif_suivi: rentalTodoPage,
  locatif_contacts: tenantContactsPage,
  patrimoine_charges: expensesPage,
  // Espace RGD Renova. Tous les écrans vivent dans le CRM : l'onglet qui
  // affichait l'application d'origine est parti le 28/09/2026, avec elle.
  // L'accueil est la vue d'ensemble, comme dans le tableau de bord d'origine.
  rgd_home: rgdPilotagePage,
  rgd_pilotage: rgdPilotagePage,
  rgd_chantiers: rgdChantiersPage,
  rgd_clients: rgdClientsPage,
  rgd_agenda: rgdAgendaPage,
  rgd_devis: rgdDevisPage,
  rgd_paiements: rgdPaiementsPage,
  rgd_soustraitants: rgdSousTraitantsPage,
  rgd_partenaires: rgdPartenairesPage,
  rgd_realisations: rgdRealisationsPage,
  rgd_costructor: rgdCostructorPage,
  rgd_formations: rgdFormationsPage,
  rgd_reglages: rgdReglagesPage,
  // `#/rgd/prospects` menait à l'écran Clients de l'application, `#/rgd/app`
  // à l'application elle-même. Les deux mènent maintenant aux nôtres : un
  // signet ou un lien ancien continue de marcher au lieu de tomber à vide.
  rgd_prospects: rgdClientsPage,
  rgd_app: rgdPilotagePage,
  btp_home: btpHomePage,
  btp_expertise: btpExpertisePage,
  btp_amo: btpAmoPage,
  btp_charges: btpChargesPage,
  btp_vivier: btpVivierPage,
  btp_base: btpBasePage,
  btp_dtu: btpDtuPage,
  btp_mails: btpMailsPage,
  btp_facturation: btpFacturationPage,
  // Les cinq écrans neufs de BTP Expertise (29/09/2026). Les clés portent un
  // TIRET parce que l'adresse en porte un : `route()` compose
  // `pages['btp_' + param]` à partir du second segment du hash, et le routeur
  // n'en lit que deux — `#/btp/expertise/checklist` n'irait nulle part.
  // ⚠ L'ecran de check-list n'est plus un placeholder : il porte le releve
  // de visite (`btp-checklist.js`). Les trois autres ecrans BTP restent en
  // attente de leur contenu.
  'btp_expertise-checklist': btpChecklistPage,
  'btp_expertise-rapport': btpRapportPage,
  'btp_amo-checklist': btpChecklistAmoPage,
  'btp_amo-rapport': btpRapportAmoPage,
  btp_atlas: btpAtlasPage,
  courtage_home: courtageHomePage,
  courtage_base: courtageBasePage,
  courtage_vivier: courtageVivierPage,
  dashboard: dashboardPage,
  messagerie: messageriePage,
  today: todayPage,
  pipeline: pipelinePage,
  contacts: contactsPage,
  organisations: contactsPage,
  settings: settingsPage,
};
