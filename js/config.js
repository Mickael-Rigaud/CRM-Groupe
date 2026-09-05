// Configuration de l'application.
// Mode démo : données locales (navigateur) avec jeu d'exemple — pour découvrir l'outil.
// Mode production : renseigner l'URL et la clé "anon" du projet Supabase (Paramètres > API).
export const CONFIG = {
  APP_NAME: 'CRM Groupe',
  SUPABASE_URL: '',      // ex. 'https://xxxxxxxx.supabase.co'
  SUPABASE_ANON_KEY: '', // clé publique "anon"
  get DEMO() { return !this.SUPABASE_URL || !this.SUPABASE_ANON_KEY; },
};
