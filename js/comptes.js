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

/**
 * Ouvrir à quelqu'un les agendas Google des structures qu'il porte.
 *
 * Demandé par Élodie le 05/10/2026 : « lorsque l'on crée un nouveau profil, que
 * ce soit son mail qui soit synchronisé au Google Agenda » — au sens, précisé
 * avec elle, de « qu'elle voie les rendez-vous de ses structures dans son
 * propre agenda ».
 *
 * ⚠ L'AUTRE SENS N'EST PAS AUTOMATISABLE, et c'est ce qui a tranché : faire
 * remonter l'agenda PERSONNEL de quelqu'un dans le CRM exige que cette personne
 * le partage depuis son compte Google. Cinq des six profils sont sur gmail.com
 * ou hotmail.fr, hors du domaine : aucun compte de service ne peut s'accorder
 * ce droit. Ici c'est l'inverse — les agendas sont à nous, donc on peut les
 * ouvrir.
 *
 * ⚠ LE NAVIGATEUR NE DIT PAS QUELS AGENDAS : il nomme une personne, le serveur
 * lit ses structures dans la base. Envoyer la liste depuis l'écran reviendrait
 * à laisser ouvrir n'importe quel agenda à n'importe qui.
 *
 * ⚠ SON ÉCHEC NE REMET RIEN EN CAUSE : le compte est créé, la personne a son
 * lien. Un agenda mal réglé se rattrape d'un bouton, et la fonction est
 * idempotente — chez Google, reposer une règle qui existe la met à jour.
 */
export async function ouvrirAgendas(profil_id, { inclure_personnels = false } = {}) {
  if (CONFIG.DEMO) throw new Error('Mode démo : aucun agenda n’est ouvert.');
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');

  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/agenda-partager`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profil_id, inclure_personnels }),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) throw new Error(rep.erreur || `Erreur ${r.status}`);
  return rep;
}

/**
 * Créer l'agenda Google propre à une personne dans une structure.
 *
 * Demandé par Élodie le 05/10/2026 : « je veux que les chargés d'affaires de RGD
 * Renova aient leur propre Google Agenda avec leurs mails ».
 *
 * ⚠ UN AGENDA CRÉÉ POUR ELLE, PAS SON AGENDA PERSONNEL. Prendre son calendrier
 * privé ferait entrer ses rendez-vous personnels dans le CRM — et demanderait
 * qu'elle le partage elle-même, son adresse étant hors du domaine. On crée donc
 * un agenda que le cabinet possède et on le lui partage en écriture : il
 * apparaît dans son Google, le CRM le lit parce qu'il est à nous.
 *
 * ⚠ ELLE NE CRÉE JAMAIS DEUX FOIS : si la personne en a déjà un pour cette
 * structure, le serveur le rend tel quel (`deja: true`) sans rien fabriquer.
 */
export async function creerAgendaPersonnel(profil_id, structure) {
  if (CONFIG.DEMO) throw new Error('Mode démo : aucun agenda n’est créé.');
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');

  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/agenda-personnel`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profil_id, structure }),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) throw new Error(rep.erreur || `Erreur ${r.status}`);
  return rep;
}

// Renvoyer à quelqu'un son lien pour créer son espace.
//
// ⚠ ON NE DIT PAS « INVITATION » À L'UTILISATEUR (29/09/2026, demandé par
// Mickael : « je ne veux pas de lien d'invitation mais un lien pour créer son
// espace et son mot de passe »). Le mot `invite` reste dans les échanges avec
// la plateforme, où il désigne un type de lien : c'est son vocabulaire.
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
export async function renvoyerLienAcces(email) {
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
