// Les cahiers des charges des chantiers RGD Renova (11/11/2026, Élodie)
//
// « Générer un cahier des charges à partir du devis signé, à remettre aux
// ouvriers pour qu'ils sachent ce qu'il y a à faire, et aux clients pour
// valider le cahier des charges avant les travaux — les clients doivent
// pouvoir signer. »
//
// Un cahier par chantier du planning (`rgd_cahiers.planning_id`, unique).
// Il porte les POSTES de travaux, JAMAIS DE PRIX : ni l'ouvrier ni le client
// n'en ont besoin sur ce document, et un prix recopié ici finirait par
// contredire le devis.
//
// ⚠ LES POSTES SONT COLLÉS, PAS LUS CHEZ COSTRUCTOR. Une sonde du 11/11/2026
// l'a établi : l'API Costructor ne rend aucune ligne de devis, et le PDF exige
// une session. Élodie colle donc les lignes du devis ; `decouperCollage` les
// range en postes et jette les montants. Le résultat reste modifiable : c'est
// une aide à la saisie, pas une lecture qui ferait foi.
// Les devis faits DANS le CRM portent leurs lignes : ils se reprennent d'un clic.
//
// ⚠ SIGNÉ = FIGÉ. Tant que la signature est là, `majCahier` refuse d'écrire
// le contenu ; la direction doit d'abord la retirer (`retirerSignature`).
import { db } from './db.js';
import { scope } from './scope.js';
import { CONFIG } from '../config.js';

export const cahierDe = (planningId) => db.t('rgd_cahiers').find(x => x.planning_id === planningId) || null;
export const estSigne = (k) => !!(k && k.signature && k.signe_le);

const propres = (postes) => (Array.isArray(postes) ? postes : [])
  .map(p => ({
    lot: String(p.lot || '').trim(),
    designation: String(p.designation || '').trim(),
    detail: String(p.detail || '').trim(),
    quantite: String(p.quantite ?? '').trim(),
    unite: String(p.unite || '').trim(),
  }))
  .filter(p => p.designation || p.detail);

export async function creerCahier(planningId, champs = {}) {
  const deja = cahierDe(planningId);
  if (deja) return deja;
  return db.insert('rgd_cahiers', {
    planning_id: planningId,
    devis_id: champs.devis_id || null,
    devis_crm_id: champs.devis_crm_id || null,
    devis_numero: champs.devis_numero || null,
    objet: champs.objet || null,
    postes: propres(champs.postes),
    consignes: champs.consignes || null,
    precisions: champs.precisions || null,
    type_bien: champs.type_bien || null,
    nature: champs.nature || null,
  });
}

export async function majCahier(k, champs) {
  if (estSigne(k)) throw new Error('Le cahier est signé : retirez la signature avant de le modifier.');
  const patch = {};
  for (const c of ['devis_id', 'devis_crm_id', 'devis_numero', 'objet', 'consignes', 'precisions', 'type_bien', 'nature']) {
    if (c in champs) patch[c] = (typeof champs[c] === 'string' ? champs[c].trim() : champs[c]) || null;
  }
  if ('postes' in champs) patch.postes = propres(champs.postes);
  return db.update('rgd_cahiers', k.id, patch);
}

// Ce que le client a signé, figé à part (sur place comme à distance) : retirer
// la signature puis modifier le cahier ne doit pas effacer la preuve.
const contenuSigne = (k) => ({ objet: k.objet, postes: k.postes, precisions: k.precisions, devis_numero: k.devis_numero,
  photos: k.photos || [], plan: k.plan || null, type_bien: k.type_bien || null, nature: k.nature || null });

export async function signerCahier(k, { image, nom }) {
  if (!image) throw new Error('La signature manque.');
  return db.update('rgd_cahiers', k.id, {
    signature: image, signe_par: String(nom || '').trim() || null, signe_le: new Date().toISOString(),
    signe_mode: 'sur_place', contenu_signe: contenuSigne(k),
  });
}

export async function retirerSignature(k) {
  if (!scope.isDirection) throw new Error('Seule la direction peut retirer une signature.');
  return db.update('rgd_cahiers', k.id, {
    signature: null, signe_par: null, signe_le: null, signe_mode: null, signe_ip: null, signe_agent: null,
  });
}

// ------------------------------------------------------------ les photos
// ⚠ LA MISE EN PAGE D'ÉLODIE (11/11/2026, modèle « Cahier des charges -
// JUSTE.pptx ») : une page par pièce, avec la PHOTO de la pièce à côté de la
// liste des travaux, une page de garde et le plan. Les photos vont dans le
// seau PRIVÉ `rgd-cahiers`, sous `<chantier>/…` ; le cahier garde
// `photos = [{ lot, chemin }]` et `plan = chemin`.
//
// ⚠ ON RÉDUIT AVANT D'ENVOYER : une photo de téléphone pèse 4 à 8 Mo et le
// cahier en porte une dizaine. 1600 px de large et un JPEG à 82 % suffisent
// largement à une page A4, et l'envoi depuis le chantier reste rapide.
export const SEAU_CAHIERS = 'rgd-cahiers';

async function reduire(fichier, cote = 1600) {
  if (!/^image\//.test(fichier.type || '')) throw new Error(`${fichier.name} n’est pas une image.`);
  let img;
  try { img = await createImageBitmap(fichier, { imageOrientation: 'from-image' }); }
  catch { return fichier; }                           // format que le navigateur ne lit pas : envoyé tel quel
  const r = Math.min(1, cote / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82));
  return blob ? new File([blob], fichier.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : fichier;
}

async function deposer(k, fichier) {
  const f = await reduire(fichier);
  const chemin = `${k.planning_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await db.uploadFile(chemin, f, { bucket: SEAU_CAHIERS });
  return chemin;
}

export async function ajouterPhotos(k, lot, fichiers) {
  if (estSigne(k)) throw new Error('Le cahier est signé : retirez la signature avant de le modifier.');
  const nouvelles = [];
  for (const f of fichiers) nouvelles.push({ lot: String(lot || ''), chemin: await deposer(k, f) });
  const a_jour = cahierDe(k.planning_id) || k;
  return db.update('rgd_cahiers', k.id, { photos: [...(a_jour.photos || []), ...nouvelles] });
}

export async function retirerPhoto(k, chemin) {
  if (estSigne(k)) throw new Error('Le cahier est signé : retirez la signature avant de le modifier.');
  const a_jour = cahierDe(k.planning_id) || k;
  const ligne = await db.update('rgd_cahiers', k.id, { photos: (a_jour.photos || []).filter(p => p.chemin !== chemin) });
  try { await db.deleteFile(chemin, { bucket: SEAU_CAHIERS }); } catch { /* déjà absente */ }
  return ligne;
}

// Une pièce renommée emmène ses photos : sans ça, elles resteraient
// rattachées à l'ancien nom et ne s'imprimeraient plus.
export async function renommerPhotos(k, renommes) {
  const a_jour = cahierDe(k.planning_id) || k;
  const photos = a_jour.photos || [];
  if (!photos.some(p => renommes[p.lot || ''] !== undefined)) return a_jour;
  return db.update('rgd_cahiers', k.id, {
    photos: photos.map(p => (renommes[p.lot || ''] !== undefined ? { ...p, lot: renommes[p.lot || ''] } : p)),
  });
}

export async function poserPlan(k, fichier) {
  if (estSigne(k)) throw new Error('Le cahier est signé : retirez la signature avant de le modifier.');
  const ancien = k.plan;
  const ligne = await db.update('rgd_cahiers', k.id, { plan: fichier ? await deposer(k, fichier) : null });
  if (ancien) { try { await db.deleteFile(ancien, { bucket: SEAU_CAHIERS }); } catch { /* déjà absente */ } }
  return ligne;
}

// Liens signés d'une heure, gardés 50 minutes.
const liens = new Map();
export async function lienPhoto(chemin) {
  if (!chemin) return '';
  const l = liens.get(chemin);
  if (l && l.fin > Date.now()) return l.url;
  const url = await db.fileUrl(chemin, { bucket: SEAU_CAHIERS });
  liens.set(chemin, { url, fin: Date.now() + 50 * 60 * 1000 });
  return url;
}
export async function liensDuCahier(k) {
  const tous = [...(k?.photos || []).map(p => p.chemin), k?.plan].filter(Boolean);
  const out = {};
  await Promise.all(tous.map(async c => { try { out[c] = await lienPhoto(c); } catch { /* photo perdue */ } }));
  return out;
}

// Les pièces du cahier, dans l'ordre des postes : ce sont les lots.
export const piecesDe = (postes) => [...new Set((postes || []).map(p => p.lot || ''))];

// ------------------------------------------------------------ à distance
// ⚠ LA SIGNATURE À DISTANCE (11/11/2026) : le client reçoit un lien vers la
// page publique `signature.html?t=<jeton>`, qui ne parle qu'à l'Edge Function
// `cahier-signature`. Le JETON est la seule clé : 20 octets aléatoires (40
// caractères), valable 30 jours, tiré ici par
// le navigateur de la direction. Un jeton encore valable est réutilisé : un
// second envoi ne rend pas caduc le lien déjà reçu.
const JOURS_VALIDITE = 30;
export const lienValable = (k) => !!(k?.jeton && (!k.jeton_expire_le || new Date(k.jeton_expire_le) > new Date(Date.now() + 86400000)));

export async function preparerLien(k) {
  if (lienValable(k)) return k;
  const octets = crypto.getRandomValues(new Uint8Array(20));
  const jeton = [...octets].map(b => b.toString(16).padStart(2, '0')).join('');
  return db.update('rgd_cahiers', k.id, {
    jeton, jeton_expire_le: new Date(Date.now() + JOURS_VALIDITE * 86400000).toISOString(),
  });
}

// L'adresse de la page, à côté de l'application qui tourne (GitHub Pages en
// production, le serveur local en démo).
export const lienSignature = (k) => (k?.jeton ? new URL(`signature.html?t=${k.jeton}`, location.href.split('#')[0]).href : '');

const appel = async (fonction, corps) => {
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${fonction}`, {
    method: 'POST',
    headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) throw new Error(rep.detail || rep.erreur || `Erreur ${r.status}`);
  return rep;
};

// ⚠ LE MAIL N'A PAS DE BOUTON PLEIN : un aplat de couleur fait classer le
// message en indésirables ou en « Promotions » (mesuré, voir la mémoire du
// projet). Lien en bouton à contour, enveloppe sobre, réponse vers contact@.
function mailSignature({ nom, objet, lien }) {
  const html = `<p>Bonjour${nom ? ` ${nom}` : ''},</p>
<p>Avant le démarrage de vos travaux, voici le <b>cahier des charges</b>${objet ? ` « ${objet} »` : ''} : la liste des travaux prévus, sans les prix, qui complète votre devis.</p>
<p>Merci de le relire, puis de le signer en ligne :</p>
<p style="margin:22px 0;"><a href="${lien}" style="display:inline-block;padding:11px 20px;border:2px solid #FC5D00;border-radius:8px;color:#FC5D00;text-decoration:none;font-weight:700;">Relire et signer le cahier des charges</a></p>
<p style="color:#6b7280;font-size:13px;">Le lien est valable ${JOURS_VALIDITE} jours. Une question ? Répondez simplement à ce message.</p>`;
  return html.replace(/\n/g, '');
}
// ⚠ PAR MAIL SEULEMENT (11/11/2026, Élodie : « pas par SMS, on fait par mail
// c'est mieux »). Le SMS avait été proposé puis retiré : lien compris, il
// coûtait deux SMS (environ 9 crédits Brevo). Pour un client sans e-mail, le
// bouton « Copier le lien » permet de l'envoyer soi-même.
export async function envoyerPourSignature(k, { email, nom, objet }) {
  if (db.demo) throw new Error('Mode démo : aucun message envoyé.');
  if (!/.+@.+\..+/.test(String(email || ''))) throw new Error('Adresse e-mail manquante ou invalide.');
  const pret = await preparerLien(k);
  const lien = lienSignature(pret);
  await appel('envoyer-email', {
    to: { email: String(email).trim(), name: String(nom || email).trim() },
    subject: `Votre cahier des charges${objet ? ` — ${objet}` : ''} à signer`,
    html: mailSignature({ nom, objet, lien }),
    sobre: true,
    replyTo: { email: 'contact@rgdrenova.fr', name: 'RGD Renova' },
  });
  return db.update('rgd_cahiers', pret.id, { envoye_le: new Date().toISOString(), envoye_a: String(email).trim() });
}

// ------------------------------------------------------------ les devis
// Les devis SIGNÉS du dossier rattaché au chantier : ceux de Costructor
// (`rgd_devis`, sans lignes) et ceux du CRM (`rgd_devis_crm`, avec lignes).
// Le lien passe par la personne (contact ou organisation), comme partout
// ailleurs dans le CRM, et par la fiche pour les devis du CRM.
export function devisSignesDu(dossier, genre) {
  if (!dossier) return [];
  const meme = (v) => (!!v.contact_id && v.contact_id === dossier.contact_id)
    || (!!v.organisation_id && v.organisation_id === dossier.organisation_id);
  const costructor = db.t('rgd_devis')
    .filter(v => v.statut === 'signe' && meme(v))
    .map(v => ({ source: 'costructor', id: v.id, numero: v.numero || '', montant: v.montant_ht,
      date: v.date_signature || v.date_creation, lignes: null, ligne: v }));
  const crm = db.t('rgd_devis_crm')
    .filter(v => v.statut === 'signe' && (v.genre || 'devis') === 'devis' && (meme(v)
      || (genre === 'fiche' ? v.fiche_id === dossier.id : v.demande_id === dossier.id)))
    .map(v => ({ source: 'crm', id: v.id, numero: v.numero || '', montant: v.montant_ht,
      date: v.date_signature || v.date_devis, lignes: Array.isArray(v.lignes) ? v.lignes : [], ligne: v }));
  return [...crm, ...costructor].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// ⚠ LES LIGNES D'UN DEVIS COSTRUCTOR SE LISENT TOUTES SEULES (11/11/2026,
// Élodie : « le minimum d'actions de notre part »). L'Edge Function
// `cahier-devis-costructor` passe par la page client du devis — la seule porte
// qui rende ses lignes, voir son en-tête — et renvoie des postes SANS PRIX.
// Le collage à la main reste en secours si Costructor change cette page.
export async function lireDevisCostructor(devisId) {
  if (db.demo) return { ok: false, motif: 'Lecture automatique indisponible en mode démo.' };
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/cahier-devis-costructor`, {
      method: 'POST',
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ devis_id: devisId }),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok || rep.ok === false) return { ok: false, motif: rep.erreur || `Erreur ${r.status}` };
    return { ok: true, postes: rep.postes || [], numero: rep.numero || null };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

// Les lignes d'un devis du CRM, en postes : la catégorie devient le lot, la
// précision le détail. Le prix reste sur le devis.
export const postesDuDevisCrm = (lignes) => (lignes || []).map(l => ({
  lot: l.categorie || '',
  designation: l.libelle || '',
  detail: [l.variante, l.precision].filter(Boolean).join(' — '),
  quantite: l.quantite == null ? '' : String(l.quantite).replace('.', ','),
  unite: l.unite || '',
}));

// ------------------------------------------------------------ le collage
// Ce qu'on colle vient d'un devis Costructor : copié depuis le PDF (une ligne
// de texte par poste, colonnes séparées par des espaces) ou depuis l'écran
// (colonnes séparées par des tabulations). On ne connaît pas la mise en page
// d'avance, alors on lit chaque ligne pour ce qu'elle contient :
//   · les MONTANTS (« 1 250,00 € », « 20 % ») sont jetés — jamais de prix ;
//   · une quantité suivie d'une unité en fin de ligne fait un POSTE ;
//   · une ligne sans quantité, courte ou en majuscules, ou qui commence par
//     « Lot » ou un numéro simple (« 2. »), ouvre un LOT ;
//   · une autre ligne sans quantité complète le poste précédent (son détail) ;
//   · les totaux, la TVA, les acomptes et l'en-tête du tableau sont ignorés.
const UNITES_CONNUES = 'u|un|unité|unités|unite|unites|ens|ensemble|forfait|forf|ft|fft|m²|m2|m³|m3|ml|m|h|heure|heures|jour|jours|j|kg|t|l|litre|litres|pce|pièce|pièces|piece|pieces|lot|pt|point|points|sac|sacs|rouleau|rouleaux';
const RE_FIN = new RegExp(`(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(${UNITES_CONNUES})\\.?$`, 'i');
const RE_FIN_UNITE_AVANT = new RegExp(`(?:^|\\s)(${UNITES_CONNUES})\\.?\\s+(\\d+(?:[.,]\\d+)?)$`, 'i');
const RE_ARGENT = /-?\d{1,3}(?:[\s  .]\d{3})*(?:,\d{1,2})?\s*€|€\s*-?\d[\d\s  .]*(?:,\d{1,2})?/g;
const RE_POURCENT = /\d+(?:[.,]\d+)?\s*%/g;
const RE_IGNORE = /^(sous[- ]?total|total|tva|t\.v\.a|net\s+à\s+payer|montant|acompte|remise|désignation|designation|description|qté|quantité|prix|p\.u|réf\.?|page\s+\d|report|base\s+ht|éco[- ]?part|eco[- ]?part|dont\s)/i;
const RE_NUMERO = /^(\d+(?:\.\d+)*)\.?\s+/;

// Les montants SANS « € » (« 1,00 u 350,00 350,00 ») se retirent par la fin :
// tant que la ligne se termine par un nombre à deux décimales, c'est un prix,
// un total ou un taux. La quantité, elle, est suivie de son unité.
const RE_MONTANT_FINAL = /\s-?\d{1,3}(?:[\s  .]\d{3})*,\d{2}$/;
function nettoyer(s) {
  let t = ` ${s.replace(RE_ARGENT, ' ').replace(RE_POURCENT, ' ').replace(/[\t ]+/g, ' ').trim()}`;
  while (RE_MONTANT_FINAL.test(t) && !RE_FIN.test(t.trim())) t = t.replace(RE_MONTANT_FINAL, '');
  return t.trim();
}

export function decouperCollage(texte) {
  const postes = [];
  let lot = '';
  const lignes = String(texte || '').replace(/\r/g, '').split('\n');
  for (const brute of lignes) {
    // Les colonnes collées depuis l'écran : désignation | quantité | unité | prix…
    const colonnes = brute.split('\t').map(c => c.trim()).filter(Boolean);
    let ligne = colonnes.length > 1 ? colonnes.join(' ') : brute.trim();
    if (!ligne) continue;
    if (RE_IGNORE.test(ligne)) continue;
    const sansArgent = nettoyer(ligne);
    if (!sansArgent || /^[\d\s.,-]+$/.test(sansArgent)) continue;     // il ne restait que des montants

    let quantite = '', unite = '', designation = sansArgent;
    let m = sansArgent.match(RE_FIN);
    if (m) { quantite = m[1]; unite = m[2]; designation = sansArgent.slice(0, m.index).trim(); }
    else if ((m = sansArgent.match(RE_FIN_UNITE_AVANT))) { unite = m[1]; quantite = m[2]; designation = sansArgent.slice(0, m.index).trim(); }
    // Un numéro de poste en tête (« 1.2 ») ne sert pas sur le chantier.
    const num = designation.match(RE_NUMERO);
    const niveau = num ? num[1].split('.').length : 0;
    if (num) designation = designation.slice(num[0].length).trim();
    if (!designation) continue;

    if (quantite) {
      postes.push({ lot, designation, detail: '', quantite: quantite.replace('.', ','), unite });
      continue;
    }
    const titre = /^lot\b/i.test(designation) || niveau === 1
      || (designation.length <= 60 && designation === designation.toUpperCase() && /[A-ZÀ-Ü]/.test(designation))
      || /:$/.test(designation);
    const p = postes[postes.length - 1];
    // Un titre, ou un texte avant tout poste du lot en cours : un lot.
    if (titre || !p || p.lot !== lot) { lot = designation.replace(/:$/, '').trim(); continue; }
    // Un texte qui suit un poste : son détail.
    p.detail = p.detail ? `${p.detail} ${designation}` : designation;
  }
  return postes;
}
