import { dashboardPage } from './dashboard.js';
import { todayPage } from './today.js';
import { pipelinePage } from './pipeline.js';
import { contactsPage } from './contacts.js';
import { partnersPage } from './organisations.js';
import { acquisitionPage } from './acquisition.js';
import { settingsPage } from './settings.js';
import { homePage } from './home.js';
import { patrimoinePage, propertiesPage, loansPage, expensesPage } from './patrimoine.js';
import { vivierPage } from './vivier.js';

import { locatifPage, leasesPage, unitsPage, rentalTodoPage } from './locatif.js';
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
  patrimoine_charges: expensesPage,
  vivier: vivierPage,
  dashboard: dashboardPage,
  today: todayPage,
  pipeline: pipelinePage,
  contacts: contactsPage,
  organisations: contactsPage,
  partners: partnersPage,
  acquisition: acquisitionPage,
  settings: settingsPage,
};
