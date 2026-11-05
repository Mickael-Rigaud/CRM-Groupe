// L'annuaire des écrans.
//
// ⚠ CHAQUE ÉCRAN EST UNE FONCTION QUI LE CHARGE, PAS L'ÉCRAN LUI-MÊME
// (05/11/2026, Élodie : « ça met du temps à charger »). Ce fichier importait
// les 33 écrans d'un bloc, en tête de module : ouvrir la vue d'ensemble de RGD
// téléchargeait aussi BTP Expertise, le Patrimoine, la Gestion locative et La
// Référence Courtage. Mesuré avant d'y toucher : 122 fichiers et 2,8 Mo
// (≈ 1 Mo compressé) à chaque chargement à froid, dont 79 % d'écrans jamais
// ouverts ce jour-là. Le strict nécessaire fait 26 fichiers et 206 Ko.
//
// ⚠ `pages[...]` NE REND DONC PLUS UN OBJET DE PAGE MAIS UNE PROMESSE. Le seul
// endroit qui lit cette table est `route()` dans `js/app.js`, qui l'attend.
// Ne pas lire `page.title` ou `page.directionOnly` sans avoir attendu : avant
// le chargement, ces champs n'existent pas encore.
//
// ⚠ PLUSIEURS CLÉS PARTAGENT UN MÊME FICHIER (les neuf écrans de `btp.js`,
// les cinq de `locatif.js`) : c'est voulu et sans coût. Le navigateur garde un
// module déjà chargé, le second `import()` ne repart pas sur le réseau.

// `ecran('./btp.js', 'btpHomePage')` rend la fonction qui, appelée, charge le
// fichier et en tire la page. ⚠ LE CHEMIN EST RELATIF À CE FICHIER-CI :
// `import()` résout comme un import statique, depuis le module qui l'écrit.
// ⚠ LE CHEMIN EST GARDÉ SUR LA FONCTION (`f.fichier`) : c'est lui qui donne la
// liste du rattrapage plus bas. Une seconde liste écrite à la main aurait
// dérivé de celle-ci au premier écran ajouté, et le jour où elle dérive, ce
// sont les écrans oubliés qui tombent à vide hors ligne — sans rien dire.
const ecran = (fichier, nom) => {
  const f = () => import(fichier).then(m => m[nom]);
  f.fichier = fichier;
  return f;
};

export const pages = {
  home: ecran('./home.js', 'homePage'),
  patrimoine_home: ecran('./patrimoine.js', 'patrimoinePage'),
  patrimoine_biens: ecran('./patrimoine.js', 'propertiesPage'),
  patrimoine_prets: ecran('./patrimoine.js', 'loansPage'),
  patrimoine_loyers: ecran('./locatif.js', 'locatifPage'),
  locatif_home: ecran('./locatif.js', 'locatifPage'),
  locatif_baux: ecran('./locatif.js', 'leasesPage'),
  locatif_lots: ecran('./locatif.js', 'unitsPage'),
  locatif_suivi: ecran('./locatif.js', 'rentalTodoPage'),
  locatif_contacts: ecran('./locatif.js', 'tenantContactsPage'),
  patrimoine_charges: ecran('./patrimoine.js', 'expensesPage'),
  // Espace RGD Renova. Tous les écrans vivent dans le CRM : l'onglet qui
  // affichait l'application d'origine est parti le 28/09/2026, avec elle.
  // L'accueil est la vue d'ensemble, comme dans le tableau de bord d'origine.
  rgd_home: ecran('./rgd-pilotage.js', 'rgdPilotagePage'),
  rgd_pilotage: ecran('./rgd-pilotage.js', 'rgdPilotagePage'),
  rgd_chantiers: ecran('./rgd-chantiers.js', 'rgdChantiersPage'),
  rgd_clients: ecran('./rgd-clients.js', 'rgdClientsPage'),
  rgd_agenda: ecran('./rgd-agenda.js', 'rgdAgendaPage'),
  rgd_devis: ecran('./rgd-facturation.js', 'rgdDevisPage'),
  rgd_paiements: ecran('./rgd-facturation.js', 'rgdPaiementsPage'),
  rgd_soustraitants: ecran('./rgd-soustraitants.js', 'rgdSousTraitantsPage'),
  rgd_prospection: ecran('./rgd-prospection.js', 'rgdProspectionPage'),
  rgd_sav: ecran('./rgd-sav-page.js', 'rgdSavPage'),
  rgd_inspirations: ecran('./rgd-inspirations.js', 'rgdInspirationsPage'),
  rgd_communication: ecran('./communication.js', 'rgdCommunicationPage'),
  rgd_analyse: ecran('./communication.js', 'rgdAnalysePage'),
  rgd_partenaires: ecran('./rgd-partenaires.js', 'rgdPartenairesPage'),
  rgd_realisations: ecran('./rgd-realisations.js', 'rgdRealisationsPage'),
  rgd_costructor: ecran('./rgd-costructor.js', 'rgdCostructorPage'),
  rgd_formations: ecran('./rgd-formations.js', 'rgdFormationsPage'),
  rgd_reglages: ecran('./rgd-reglages.js', 'rgdReglagesPage'),
  // La grille des tarifs des devis du CRM (29/10/2026), direction seule.
  rgd_tarifs: ecran('./rgd-tarifs.js', 'rgdTarifsPage'),
  rgd_factures: ecran('./rgd-factures.js', 'rgdFacturesPage'),
  // `#/rgd/prospects` menait à l'écran Clients de l'application, `#/rgd/app`
  // à l'application elle-même. Les deux mènent maintenant aux nôtres : un
  // signet ou un lien ancien continue de marcher au lieu de tomber à vide.
  rgd_prospects: ecran('./rgd-clients.js', 'rgdClientsPage'),
  rgd_app: ecran('./rgd-pilotage.js', 'rgdPilotagePage'),
  btp_home: ecran('./btp.js', 'btpHomePage'),
  btp_expertise: ecran('./btp.js', 'btpExpertisePage'),
  btp_amo: ecran('./btp.js', 'btpAmoPage'),
  btp_charges: ecran('./btp.js', 'btpChargesPage'),
  btp_vivier: ecran('./btp.js', 'btpVivierPage'),
  btp_communication: ecran('./communication.js', 'btpCommunicationPage'),
  btp_analyse: ecran('./communication.js', 'btpAnalysePage'),
  btp_base: ecran('./btp.js', 'btpBasePage'),
  btp_dtu: ecran('./btp.js', 'btpDtuPage'),
  btp_mails: ecran('./btp.js', 'btpMailsPage'),
  btp_facturation: ecran('./btp.js', 'btpFacturationPage'),
  // Les cinq écrans neufs de BTP Expertise (29/09/2026). Les clés portent un
  // TIRET parce que l'adresse en porte un : `route()` compose
  // `pages['btp_' + param]` à partir du second segment du hash, et le routeur
  // n'en lit que deux — `#/btp/expertise/checklist` n'irait nulle part.
  // ⚠ L'ecran de check-list n'est plus un placeholder : il porte le releve
  // de visite (`btp-checklist.js`). Les trois autres ecrans BTP restent en
  // attente de leur contenu.
  'btp_expertise-checklist': ecran('./btp-checklist.js', 'btpChecklistPage'),
  'btp_expertise-rapport': ecran('./btp-rapport.js', 'btpRapportPage'),
  'btp_amo-checklist': ecran('./btp-amo-checklist.js', 'btpAmoChecklistPage'),
  'btp_amo-rapport': ecran('./btp-pages.js', 'btpRapportAmoPage'),
  btp_atlas: ecran('./btp-atlas.js', 'btpAtlasPage'),
  courtage_home: ecran('./courtage.js', 'courtageHomePage'),
  courtage_base: ecran('./courtage.js', 'courtageBasePage'),
  courtage_vivier: ecran('./courtage.js', 'courtageVivierPage'),
  courtage_analyse: ecran('./communication.js', 'courtageAnalysePage'),
  dashboard: ecran('./dashboard.js', 'dashboardPage'),
  messagerie: ecran('./messagerie.js', 'messageriePage'),
  today: ecran('./today.js', 'todayPage'),
  pipeline: ecran('./pipeline.js', 'pipelinePage'),
  contacts: ecran('./contacts.js', 'contactsPage'),
  organisations: ecran('./contacts.js', 'contactsPage'),
  settings: ecran('./settings.js', 'settingsPage'),
};

// ⚠ LES ÉCRANS NON OUVERTS SONT QUAND MÊME CHARGÉS, MAIS APRÈS COUP, ET C'EST
// CE QUI SAUVE LE MODE HORS LIGNE. Le service worker ne garde en copie que ce
// que la page a réellement chargé : sans ce rattrapage, une application
// installée sur un téléphone n'aurait dans sa copie que les écrans déjà
// visités, et les autres tomberaient à vide dans le métro. On paie donc le
// même volume qu'avant — mais plus tard, et jamais devant quelqu'un qui
// attend.
//
// ⚠ UN PAR UN, PAS TOUS EN MÊME TEMPS : lancés d'un bloc, les trente requêtes
// se mettent en travers des appels de données de l'écran ouvert, et on
// rendrait la lenteur qu'on vient d'enlever.
let rattrapageLance = false;
export function prechargerLesEcrans(delai = 4000) {
  if (rattrapageLance) return;
  rattrapageLance = true;
  const fichiers = [...new Set(Object.values(pages).map(f => f.fichier))];
  const suivant = () => {
    const f = fichiers.shift();
    if (!f) return;
    import(f).catch(() => {}).then(() => setTimeout(suivant, 120));
  };
  setTimeout(suivant, delai);
}
