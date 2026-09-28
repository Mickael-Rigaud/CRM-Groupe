// Configuration de l'application.
// Mode démo : données locales (navigateur) avec jeu d'exemple — pour découvrir l'outil.
// Mode production : URL et clé publique ("publishable" / anon) du projet Supabase.
export const CONFIG = {
  APP_NAME: 'CRM Groupe',
  SUPABASE_URL: 'https://qnidmkufauzguultdmky.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_WVEzYagxnp1SoSn-AXJUBg_Ar9_iSpP',
  // ⚠ RGD_DASHBOARD_URL, RGD_API_URL ET RGD_VUES SONT PARTIS LE 28/09/2026,
  // avec l'onglet « Application RGD » (#/rgd/app) et l'ancien écran qu'il
  // affichait. C'était l'étape 5. Les trois ne servaient plus qu'à lui : plus
  // aucun écran du CRM n'écrit ni ne lit là-bas depuis le 25/09, et les deux
  // réglages qui l'avaient retenu jusqu'ici — la clé Costructor et la
  // connexion Google Agenda — sont devenus des secrets de la plateforme
  // (`COSTRUCTOR_API_KEY`, `GOOGLE_SA_JSON`), lus par les fonctions serveur.
  // Ne pas les remettre : `#/rgd/app` mène désormais à la vue d'ensemble,
  // pour qu'un ancien signet arrive quelque part au lieu de tomber à vide.
  get DEMO() { return !this.SUPABASE_URL || !this.SUPABASE_ANON_KEY; },
};
