import { dashboardPage } from './dashboard.js';
import { todayPage } from './today.js';
import { pipelinePage } from './pipeline.js';
import { contactsPage } from './contacts.js';
import { settingsPage } from './settings.js';
import { homePage } from './home.js';
import { patrimoinePage, propertiesPage, loansPage, expensesPage } from './patrimoine.js';
import { rgdDashboardPage } from './rgd.js';
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
import { btpHomePage, btpExpertisePage, btpAmoPage, btpChargesPage, btpBasePage, btpDtuPage, btpMailsPage, btpFacturationPage } from './btp.js';
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
  // Espace RGD Renova. Les écrans repris vivent dans le CRM ; l'application
  // d'origine garde son onglet pour les douze autres, le temps de l'étape 4.
  rgd: rgdDashboardPage,          // conservé : ancienne adresse plate
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
  rgd_app: rgdDashboardPage,
  // `#/rgd/prospects` menait à l'écran Clients de l'application. Il mène
  // maintenant au nôtre : un signet ou un lien ancien continue de marcher.
  rgd_prospects: rgdClientsPage,
  btp_home: btpHomePage,
  btp_expertise: btpExpertisePage,
  btp_amo: btpAmoPage,
  btp_charges: btpChargesPage,
  btp_base: btpBasePage,
  btp_dtu: btpDtuPage,
  btp_mails: btpMailsPage,
  btp_facturation: btpFacturationPage,
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
