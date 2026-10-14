// Les inspirations de RGD Renova (14/10/2026, Élodie : « une page pour que
// Mickael puisse montrer toutes les réalisations en rdv client pour des
// inspirations », puis « mets toutes les pièces que l'on retrouve sur le
// site », puis « pouvoir ajouter des inspirations sans les ajouter sur le
// site » et « du plus récent au plus ancien »).
//
// ⚠ DEUX SOURCES, UNE SEULE PAGE :
//   - les réalisations du SITE (`rgd_realisations`, reflet du document publié),
//     en lecture seule ici — elles se modifient dans Réalisations ;
//   - les inspirations du CRM (`rgd_inspirations`), qui ne partent JAMAIS sur
//     rgdrenova.fr, avec leurs photos dans le seau PRIVÉ `inspirations`.
// Elles se rangent ensemble par le NOM de catégorie : une inspiration
// « Cuisine » s'affiche avec les cuisines du site.
//
// ⚠ LES CATÉGORIES SONT CELLES DU SITE, DANS SON ORDRE (`rang` du reflet suit le
// document : catégories dans leur ordre, chantiers dans le leur). Une
// inspiration rangée sous un nom que le site n'a pas ouvre sa propre vignette,
// après celles du site. Un rangement photo par photo (séjour, chambre…) a été
// construit puis écarté le même jour : la page montre ce que le site montre.
//
// ⚠ DANS UNE CATÉGORIE, DU PLUS RÉCENT AU PLUS ANCIEN, ET LA DATE A TROIS
// SOURCES, dans cet ordre : `realise_le` (saisi, `AAAA-MM`), sinon la date que
// portent les NOMS des photos (« 20250120_100709.jpg », « IMG-20230707-WA0011 »,
// « WhatsApp Image 2026-07-03 » — c'est l'appareil qui les a nommées), sinon
// le mois de mise en ligne des vieilles photos WordPress (« /medias/2025/09/ »),
// sinon rien : le chantier passe en fin de liste, dans l'ordre du site. Le 14/10/2026,
// 11 réalisations sur 37 portaient `realise_le`.
import { db } from './db.js';

export const SEAU_INSPIRATIONS = 'inspirations';

// Le nom d'un fichier tel que l'appareil l'a donné : le CRM préfixe ses dépôts
// par « <horodatage>-<hasard>- », dont les chiffres ressembleraient à une date.
const nomBrut = (u) => decodeURIComponent(String(u).split('/').pop() || '').replace(/^\d{10,}-[a-z0-9]{4,8}-/i, '');
const RE_DATE = /(20[12]\d)[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/;

/** Le mois (`AAAA-MM`) écrit dans le nom d'une photo, ou null. */
export function moisDuFichier(u) {
  const m = nomBrut(u).match(RE_DATE);
  return m ? `${m[1]}-${m[2]}` : null;
}

// La date d'un chantier : la saisie, sinon la photo « après » la plus récente,
// sinon la plus récente tout court. `source` dit d'où elle vient.
function dateDe(saisie, photos) {
  if (saisie) return { mois: saisie, source: 'saisie' };
  const de = (liste) => liste.map(p => moisDuFichier(p.cle)).filter(Boolean).sort().pop() || null;
  const m = de(photos.filter(p => p.moment === 'apres')) || de(photos);
  if (m) return { mois: m, source: 'photos' };
  // Dernier recours : le mois de MISE EN LIGNE des vieilles photos WordPress
  // (« /medias/2025/09/… »). Ce n'est pas la date du chantier, mais il suit de
  // peu, et c'est mieux que de laisser le chantier en fin de liste.
  const enLigne = photos.map(p => String(p.cle).match(/\/medias\/(20\d\d)\/(0[1-9]|1[0-2])\//)).filter(Boolean)
    .map(x => `${x[1]}-${x[2]}`).sort().pop();
  return enLigne ? { mois: enLigne, source: 'mise_en_ligne' } : { mois: null, source: null };
}

const cleCat = (nom) => String(nom || 'Autres').trim().toLowerCase();

/**
 * Les catégories, chacune avec ses chantiers du plus récent au plus ancien.
 * Une photo : { cle, url?, chemin?, moment, projet }. `url` est directe pour le
 * site ; `chemin` désigne un fichier du seau privé, dont le lien signé est
 * demandé à l'affichage.
 */
export function categoriesDesInspirations() {
  const cats = new Map();
  const cat = (nom, rangSite) => {
    const k = cleCat(nom);
    if (!cats.has(k)) cats.set(k, { cle: k, nom: String(nom || 'Autres').trim(), rang: rangSite ?? Infinity, projets: [] });
    const c = cats.get(k);
    if (rangSite != null && rangSite < c.rang) c.rang = rangSite;
    return c;
  };

  // Le site : brouillons et chantiers sans photo exclus — rien à montrer.
  for (const r of db.t('rgd_realisations')) {
    if (r.brouillon || !Array.isArray(r.images) || !r.images.length) continue;
    const tags = r.photo_tags || {};
    // Une photo sans étiquette compte comme « après » : ce sont des photos de résultat.
    const photos = [...new Set(r.images.filter(Boolean))]
      .map(url => ({ cle: url, url, moment: tags[url] === 'avant' ? 'avant' : 'apres' }));
    const p = { source: 'site', id: r.id, titre: r.titre || r.ville || 'Chantier', ville: r.ville,
      details: [r.surface, r.duree].filter(Boolean).join(' · '), ordre: r.rang ?? 0,
      date: dateDe(r.realise_le, photos), photos, ligne: r };
    photos.forEach(ph => { ph.projet = p; });
    cat(r.categorie_nom, r.rang ?? 0).projets.push(p);
  }

  // Le CRM.
  for (const r of db.t('rgd_inspirations')) {
    const photos = (Array.isArray(r.photos) ? r.photos : []).filter(x => x?.chemin)
      .map(x => ({ cle: x.chemin, chemin: x.chemin, moment: x.moment === 'avant' ? 'avant' : 'apres' }));
    const p = { source: 'crm', id: r.id, titre: r.titre, ville: r.ville, details: r.notes || '',
      ordre: Infinity, date: dateDe(r.realise_le, photos), photos, ligne: r };
    photos.forEach(ph => { ph.projet = p; });
    // Une inspiration sans photo reste listée dans sa catégorie : on vient de
    // la créer, et la cacher ferait croire qu'elle n'a pas été enregistrée.
    cat(r.categorie, null).projets.push(p);
  }

  for (const c of cats.values()) {
    c.projets.sort((a, b) =>
      (b.date.mois ? 1 : 0) - (a.date.mois ? 1 : 0)
      || String(b.date.mois || '').localeCompare(String(a.date.mois || ''))
      || a.ordre - b.ordre);
  }
  return [...cats.values()].sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom, 'fr'));
}

/** Les noms de catégorie du site, dans son ordre — ceux que propose le formulaire. */
export function categoriesDuSite() {
  const vues = new Map();
  for (const r of db.t('rgd_realisations').slice().sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0))) {
    if (r.categorie_nom && !vues.has(cleCat(r.categorie_nom))) vues.set(cleCat(r.categorie_nom), r.categorie_nom);
  }
  return [...vues.values()];
}

// ---------------------------------------------------------------- écriture
const CHAMPS = ['categorie', 'titre', 'ville', 'realise_le', 'notes', 'photos'];
const filtrer = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => CHAMPS.includes(k)));

/**
 * Déposer des photos dans le seau privé. Le nom garde la convention du seau
 * des réalisations (`horodatage-hasard-nom`), ce qui laisse lisible la date
 * que l'appareil a mise dans le nom — c'est elle qui date l'inspiration.
 */
export async function deposerPhotosInspiration(fichiers) {
  const chemins = [];
  for (const f of fichiers) {
    if (!/^image\//.test(f.type || '')) throw new Error(`${f.name} n’est pas une image`);
    if (f.size > 25 * 1048576) throw new Error(`${f.name} : trop lourd (25 Mo max)`);
    const chemin = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
    await db.uploadFile(chemin, f, { bucket: SEAU_INSPIRATIONS });
    chemins.push(chemin);
  }
  return chemins;
}

export async function enregistrerInspiration(id, champs) {
  try {
    const ligne = id ? await db.update('rgd_inspirations', id, filtrer(champs))
      : await db.insert('rgd_inspirations', filtrer(champs));
    return { ok: true, ligne };
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 140) }; }
}

/** Supprimer une inspiration et ses photos (le seau est privé, rien d'autre ne les lit). */
export async function supprimerInspiration(ligne) {
  try {
    for (const p of (ligne.photos || [])) {
      if (p?.chemin) { try { await db.deleteFile(p.chemin, { bucket: SEAU_INSPIRATIONS }); } catch { /* déjà absente */ } }
    }
    await db.remove('rgd_inspirations', ligne.id);
    return { ok: true };
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 140) }; }
}

// Les liens signés durent une heure : on les garde 50 minutes, sinon chaque
// redessin redemanderait un lien par photo.
const liens = new Map();
export async function lienPhotoInspiration(chemin) {
  const l = liens.get(chemin);
  if (l && l.fin > Date.now()) return l.url;
  const url = await db.fileUrl(chemin, { bucket: SEAU_INSPIRATIONS });
  liens.set(chemin, { url, fin: Date.now() + 50 * 60 * 1000 });
  return url;
}
