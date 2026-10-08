// Calendrier des contenus des réseaux sociaux — RGD Renova et BTP Expertise
// (08/10/2026, demandé par Élodie : un onglet « Communication » dans les deux
// tableaux de bord, « comme Metricool », en commençant par le calendrier).
//
// ⚠ ON PLANIFIE ET ON SUIT, ON NE PUBLIE PAS : aucune application Meta, TikTok
// ou LinkedIn n'est branchée. Le statut « Publié » se pose à la main, avec le
// lien du post. Le jour où une publication automatique arrivera, elle lira
// cette même table.
//
// ⚠ LES CONTENUS PRÉPARÉS AVEC CLAUDE ENTRENT PAR UNE SIMPLE INSERTION dans
// `communication_contenus` (`created_by` nul) : l'écran ne fait aucune
// différence, ils se modifient comme les autres.

import { db } from './db.js';

const TABLE = 'communication_contenus';

// Réseaux arbitrés le 08/10/2026 : Facebook et Instagram pour les deux,
// TikTok et LinkedIn en plus pour RGD Renova. ⚠ La base ne contraint pas la
// liste : un réseau ajouté ici ne demande aucune migration.
export const RESEAUX = {
  facebook: { label: 'Facebook', court: 'FB', couleur: '#1877F2' },
  instagram: { label: 'Instagram', court: 'IG', couleur: '#E1306C' },
  tiktok: { label: 'TikTok', court: 'TT', couleur: '#111111' },
  linkedin: { label: 'LinkedIn', court: 'IN', couleur: '#0A66C2' },
};
export const RESEAUX_DE = {
  rgd: ['facebook', 'instagram', 'tiktok', 'linkedin'],
  btp: ['facebook', 'instagram'],
};

// ⚠ MIROIR DE LA CONTRAINTE `check` de la colonne `statut` : une clé ajoutée
// ici sans migration ferait refuser l'enregistrement.
export const STATUTS = {
  idee: { label: 'Idée', couleur: '#94A3B8' },
  brouillon: { label: 'Brouillon', couleur: '#A16207' },
  a_valider: { label: 'À valider', couleur: '#D97706' },
  programme: { label: 'Programmé', couleur: '#2563EB' },
  publie: { label: 'Publié', couleur: '#16A34A' },
};
// Même règle : miroir de la contrainte `check` de `format`.
export const FORMATS = {
  post: 'Post',
  carrousel: 'Carrousel',
  reel: 'Reel',
  story: 'Story',
  video: 'Vidéo',
  article: 'Article',
};

// La longueur d'un texte compte surtout là où elle est coupée. On affiche la
// limite la plus courte parmi les réseaux cochés, pas une moyenne.
export const LIMITE_TEXTE = { facebook: 63206, instagram: 2200, tiktok: 2200, linkedin: 3000 };

// ⚠ LISTE BLANCHE DES CHAMPS, comme `CHAMPS` des sous-traitants : une clé
// inconnue ferait échouer la requête entière en production, et passerait sans
// rien dire en démo.
const CHAMPS = ['activity', 'date_prevue', 'heure', 'reseaux', 'format', 'titre', 'texte',
  'visuels', 'statut', 'lien_publication', 'notes'];

const propre = (v) => {
  const o = {};
  for (const k of CHAMPS) if (k in v) o[k] = v[k];
  for (const k of ['date_prevue', 'heure', 'format', 'titre', 'texte', 'lien_publication', 'notes']) {
    if (k in o && (o[k] === '' || o[k] == null)) o[k] = null;
  }
  if ('reseaux' in o) o.reseaux = [...new Set(o.reseaux || [])];
  if ('visuels' in o) o.visuels = o.visuels || [];
  return o;
};
const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });

export const contenusDe = (activity) => db.t(TABLE).filter(c => c.activity === activity);

export async function creerContenu(v) {
  try {
    return { ok: true, donnees: await db.insert(TABLE, { statut: 'brouillon', ...propre(v), updated_at: new Date().toISOString() }) };
  } catch (e) { return echec(e); }
}

export async function majContenu(id, v) {
  try {
    return { ok: true, donnees: await db.update(TABLE, id, { ...propre(v), updated_at: new Date().toISOString() }) };
  } catch (e) { return echec(e); }
}

export async function supprimerContenu(id) {
  try { await db.remove(TABLE, id); return { ok: true }; } catch (e) { return echec(e); }
}

// ⚠ LE FICHIER RESTE DANS LE SEAU quand on le retire d'un contenu : il est
// public et peut déjà avoir été posté ailleurs — l'effacer casserait un lien
// que le CRM ne connaît pas. Le nom est horodaté pour qu'aucun dépôt n'en
// écrase un autre.
const assaini = (n) => String(n || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fichier';
const ACCEPTES = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime))$/;
const MAX = 50 * 1048576;

export async function deposerVisuel(activity, fichier) {
  if (!ACCEPTES.test(fichier.type)) throw new Error(`${fichier.name} : format non accepté (images JPG, PNG, WebP, GIF ou vidéos MP4, MOV)`);
  if (fichier.size > MAX) throw new Error(`${fichier.name} : plus de 50 Mo`);
  const hasard = Math.random().toString(36).slice(2, 8);
  const chemin = `${activity}/${Date.now()}-${hasard}-${assaini(fichier.name)}`;
  const url = await db.deposerPhotoPublique(chemin, fichier, 'communication');
  return { url, type: fichier.type.startsWith('video/') ? 'video' : 'image', nom: fichier.name };
}
