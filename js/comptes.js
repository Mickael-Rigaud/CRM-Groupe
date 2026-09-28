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

// Renvoyer à quelqu'un son lien d'accès.
//
// ⚠ LE GESTE QUI MANQUAIT, ET IL A COÛTÉ UN COMPTE INUTILISABLE (28/09/2026).
// Un lien d'invitation ne sert QU'UNE FOIS et expire au bout de 24 h. Le
// premier compte créé de l'extérieur a été ouvert une fois — donc consommé —
// et il n'existait alors aucun moyen d'en produire un second depuis le CRM :
// il fallait passer par la console de la plateforme, que personne n'ouvre.
//
// C'est le serveur qui choisit le type de lien (`invite` avant la première
// connexion, `recovery` après) : demander le mauvais échoue, et le front n'a
// pas à connaître cette subtilité.
export async function renvoyerInvitation(email) {
  if (CONFIG.DEMO) throw new Error('Mode démo : aucun lien réel n’est envoyé.');
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');

  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/creer-utilisateur`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'renvoyer', email }),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) throw new Error(rep.erreur || `Erreur ${r.status}`);
  return rep;
}

// Supprimer un compte : geste irréversible, donc en deux temps.
//
// Premier appel sans `confirmer` : la fonction rend l'inventaire de ce que la
// personne porte, sans rien toucher. Second appel avec `confirmer` : elle
// supprime, et refuse si l'inventaire n'est pas vide.
//
// Ce n'est pas de la prudence décorative. La base REFUSE de supprimer quelqu'un
// qui porte des affaires — mais elle EFFACE ses messages en cascade, sans rien
// demander. L'inventaire sert à montrer les deux avant d'agir.
export async function supprimerCompte(id, { confirmer = false } = {}) {
  if (CONFIG.DEMO) throw new Error('Mode démo : aucun compte réel n’est supprimé.');
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');

  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/supprimer-utilisateur`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, confirmer }),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) {
    throw Object.assign(new Error(rep.erreur || `Erreur ${r.status}`), { bloquant: rep.bloquant });
  }
  if (confirmer) {
    // Le profil est parti avec le compte : on le retire du cache pour que la
    // liste se referme sans attendre un rechargement.
    if (db.cache?.profiles) db.cache.profiles = db.cache.profiles.filter(u => u.id !== id);
  }
  return rep;
}
