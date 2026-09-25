// Configuration de l'application.
// Mode démo : données locales (navigateur) avec jeu d'exemple — pour découvrir l'outil.
// Mode production : URL et clé publique ("publishable" / anon) du projet Supabase.
export const CONFIG = {
  APP_NAME: 'CRM Groupe',
  SUPABASE_URL: 'https://qnidmkufauzguultdmky.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_WVEzYagxnp1SoSn-AXJUBg_Ar9_iSpP',
  // Application RGD Renova affichee dans l'onglet « Tableau de bord RGD » (site a part, connexion propre).
  RGD_DASHBOARD_URL: 'https://rgd-renova-dashboard.surge.sh',
  // L'API du tableau de bord. ⚠ ELLE NE SERT PLUS QU'À LA CONNEXION UNIQUE de
  // l'onglet « Application RGD » (#/rgd/app) : depuis le 25/09/2026 plus aucun
  // écran du CRM n'y écrit. Elle partira avec l'onglet, à l'étape 5.
  RGD_API_URL: 'https://rgd-renova-api.rgdrenova.workers.dev',
  // Ecrans internes de cette application, pour y arriver directement depuis le CRM
  // (#/rgd/<cle>) plutot que sur son accueil. La valeur est ce qui suit l'adresse
  // de base : un chemin (« /prospects »), un fragment (« #/prospects ») ou une
  // adresse complete. Une valeur vide ouvre l'accueil : jamais de lien casse.
  RGD_VUES: {
    prospects: 'index.html#/clients',   // Clients & prospects → Prospects
  },
  get DEMO() { return !this.SUPABASE_URL || !this.SUPABASE_ANON_KEY; },
};
