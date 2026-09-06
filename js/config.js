// Configuration de l'application.
// Mode démo : données locales (navigateur) avec jeu d'exemple — pour découvrir l'outil.
// Mode production : URL et clé publique ("publishable" / anon) du projet Supabase.
export const CONFIG = {
  APP_NAME: 'CRM Groupe',
  SUPABASE_URL: 'https://qnidmkufauzguultdmky.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_WVEzYagxnp1SoSn-AXJUBg_Ar9_iSpP',
  get DEMO() { return !this.SUPABASE_URL || !this.SUPABASE_ANON_KEY; },
};
