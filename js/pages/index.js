import { dashboardPage } from './dashboard.js';
import { todayPage } from './today.js';
import { pipelinePage } from './pipeline.js';
import { contactsPage } from './contacts.js';
import { organisationsPage, partnersPage } from './organisations.js';
import { acquisitionPage } from './acquisition.js';
import { settingsPage } from './settings.js';
import { homePage } from './home.js';
import { patrimoinePage, propertiesPage, loansPage, rentsPage, expensesPage } from './patrimoine.js';
import { vivierPage } from './vivier.js';

export const pages = {
  home: homePage,
  patrimoine_home: patrimoinePage,
  patrimoine_biens: propertiesPage,
  patrimoine_prets: loansPage,
  patrimoine_loyers: rentsPage,
  patrimoine_charges: expensesPage,
  vivier: vivierPage,
  dashboard: dashboardPage,
  today: todayPage,
  pipeline: pipelinePage,
  contacts: contactsPage,
  organisations: organisationsPage,
  partners: partnersPage,
  acquisition: acquisitionPage,
  settings: settingsPage,
};
