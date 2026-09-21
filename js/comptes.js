// Créer le compte d'une personne, depuis le CRM.
//
// La création d'un compte d'authentification demande la clé de service, qui
// ouvre toute la base : elle ne descend jamais dans le navigateur. C'est l'Edge
// Function `creer-utilisateur` qui la détient, côté serveur, et qui vérifie
// elle-même que l'appelant est de la direction — le bouton caché dans l'écran
// n'est qu'une commodité, pas une sécurité.
import { CONFIG } from './config.js';
import { db } from './data/db.js';

export async function creerCompte({ email, full_name, role, activities }) {
  if (CONFIG.DEMO) throw new Error('Mode démo : aucun compte réel n’est créé.');
  // Par la façade, jamais par `db.client` : le client Supabase n'est pas exposé
  // hors de db.js.
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');

  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/creer-utilisateur`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, full_name, role, activities }),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) throw new Error(rep.erreur || `Erreur ${r.status}`);

  // Le profil vient d'être créé côté serveur : on le pose dans le cache pour que
  // la liste des utilisateurs le montre sans attendre un rechargement.
  if (rep.profil) db.cache?.profiles?.push(rep.profil);
  return rep;
}
