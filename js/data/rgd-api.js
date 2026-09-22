// Écrire dans RGD Renova depuis le CRM
//
// LE PREMIER CHEMIN D'ÉCRITURE, ET POURQUOI IL PASSE PAR LE WORKER
// Tout l'espace RGD du CRM lit un REFLET : les tables `rgd_*` sont recopiées
// depuis Cloudflare D1 toutes les 30 minutes. Écrire dans ce reflet ne servirait
// à rien — le relevé suivant l'écraserait, sans un mot. Pour qu'une modification
// tienne, il faut la porter à la SOURCE, c'est-à-dire à D1, à travers l'API du
// tableau de bord. C'est ce que fait ce module.
//
// L'AUTORISATION EXISTAIT DÉJÀ
// La connexion unique posée le 21/09/2026 échange le jeton Supabase du CRM
// contre un jeton RGD de 8 h (`POST /api/auth/crm`), à condition qu'un compte
// RGD actif porte le même email. Ce module réutilise cette porte : personne ne
// gagne de droit au passage, et quelqu'un sans compte RGD ne peut rien écrire.
//
// LE JETON EST GARDÉ EN MÉMOIRE, PAS SUR LE DISQUE
// Une page qui redessine à chaque frappe ne doit pas redemander un jeton à
// chaque fois. Il vit dans une variable, le temps de l'onglet — pas dans
// `localStorage`, qui le laisserait traîner après la fermeture.
//
// CE QUE L'APPELANT DOIT SAVOIR DES EFFETS DE BORD
// Changer `statut_suivi` d'un client ne fait pas que changer une colonne :
// le worker pousse les champs portables vers Costructor, et **envoie un email
// à l'apporteur** quand le client en a un. C'est le comportement du tableau de
// bord, pas une invention d'ici — mais un écran qui ouvre ce menu doit le dire.
import { db } from './db.js';
import { CONFIG } from '../config.js';

const API = (CONFIG.RGD_API_URL || 'https://rgd-renova-api.rgdrenova.workers.dev').replace(/\/$/, '');

// Le jeton RGD dure 8 h côté worker ; on le lâche un peu avant pour ne pas
// tomber sur une expiration en plein milieu d'un clic.
const MARGE_MS = 5 * 60 * 1000;
let jeton = null;
let expire = 0;
let enCours = null;

async function obtenirJeton() {
  if (jeton && Date.now() < expire - MARGE_MS) return jeton;
  // Plusieurs lignes modifiées coup sur coup ne doivent pas déclencher trois
  // échanges de jeton en parallèle : on partage la même promesse.
  if (enCours) return enCours;
  enCours = (async () => {
    const session = await db.accessToken();
    if (!session) return null;            // mode démo, ou pas de session Supabase
    const r = await fetch(`${API}/api/auth/crm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      // 403 = aucun compte RGD à cet email. Ce n'est pas une panne : tout le
      // monde n'a pas accès au tableau de bord.
      const d = await r.json().catch(() => ({}));
      console.info('[RGD] écriture indisponible :', d.error || r.status);
      return null;
    }
    const d = await r.json();
    jeton = d.token || null;
    expire = Date.now() + 8 * 3600 * 1000;
    return jeton;
  })().finally(() => { enCours = null; });
  return enCours;
}

// Y a-t-il un chemin d'écriture ? Sert aux écrans pour afficher un menu actif
// ou un texte figé, plutôt qu'un contrôle qui échouerait au premier clic.
export async function peutEcrire() {
  return !!(await obtenirJeton());
}

async function envoyer(chemin, corps, methode = 'PATCH') {
  const t = await obtenirJeton();
  if (!t) return { ok: false, motif: 'pas-de-compte' };
  const r = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
  if (r.ok) return { ok: true, donnees: await r.json().catch(() => ({})) };
  // Un jeton périmé se reconnaît à un 401 : on l'oublie pour que l'appel
  // suivant en redemande un, au lieu de rejouer le même échec.
  if (r.status === 401) { jeton = null; expire = 0; }
  const d = await r.json().catch(() => ({}));
  return { ok: false, motif: d.error || `HTTP ${r.status}` };
}

// Lire à la SOURCE, pas dans le reflet. Le reflet a jusqu'à trente minutes de
// retard et, pour les sous-traitants, il ne porte que les DATES d'expiration —
// pas les `*_url` qui disent si la pièce a vraiment été déposée. Un écran de
// conformité qui affiche « à jour » sans savoir si le document existe ment.
async function lire(chemin) {
  const t = await obtenirJeton();
  if (!t) return { ok: false, motif: 'pas-de-compte' };
  const r = await fetch(`${API}${chemin}`, { headers: { Authorization: `Bearer ${t}` } });
  if (r.ok) return { ok: true, donnees: await r.json() };
  if (r.status === 401) { jeton = null; expire = 0; }
  const d = await r.json().catch(() => ({}));
  return { ok: false, motif: d.error || `HTTP ${r.status}` };
}

// Envoyer un fichier. ⚠ NE JAMAIS POSER `Content-Type` ICI : c'est le
// navigateur qui doit l'écrire, parce que lui seul connaît la frontière
// (`boundary`) qu'il vient de tirer au sort. L'imposer à la main donne un
// en-tête sans frontière, et le worker reçoit un corps qu'il ne sait pas
// découper — une erreur qui ressemble à « aucun fichier fourni ».
async function televerser(chemin, formulaire) {
  const t = await obtenirJeton();
  if (!t) return { ok: false, motif: 'pas-de-compte' };
  const r = await fetch(`${API}${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
    body: formulaire,
  });
  if (r.ok) return { ok: true, donnees: await r.json().catch(() => ({})) };
  if (r.status === 401) { jeton = null; expire = 0; }
  const d = await r.json().catch(() => ({}));
  return { ok: false, motif: d.error || `HTTP ${r.status}` };
}

// Récupérer le PDF d'une pièce. Il faut le jeton, donc un `<a href>` ne suffit
// pas : on rapatrie le corps et on fabrique une URL d'objet, que l'appelant
// révoque. Le lien direct renverrait un 401 dans un onglet vide.
export async function pieceStFichier(d1Id, type) {
  const t = await obtenirJeton();
  if (!t) return { ok: false, motif: 'pas-de-compte' };
  const r = await fetch(`${API}/api/sous-traitants/${encodeURIComponent(d1Id)}/documents/${encodeURIComponent(type)}`,
    { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) {
    if (r.status === 401) { jeton = null; expire = 0; }
    const d = await r.json().catch(() => ({}));
    return { ok: false, motif: d.error || `HTTP ${r.status}` };
  }
  return { ok: true, url: URL.createObjectURL(await r.blob()) };
}

// Le statut de suivi d'un client. `d1Id` est `rgd_clients.d1_id`, l'identifiant
// côté Cloudflare — surtout pas l'uuid du CRM, que le worker ne connaît pas.
export const majStatutClient = (d1Id, statutSuivi) =>
  envoyer(`/api/clients/${encodeURIComponent(d1Id)}`, { statut_suivi: statutSuivi });

// Le statut d'une demande du formulaire. Autre table, autre colonne : une
// demande porte `statut`, un client porte `statut_suivi`.
export const majStatutDemande = (d1Id, statut) =>
  envoyer(`/api/demandes/${encodeURIComponent(d1Id)}`, { statut });

// Les corrections manuelles du chiffre d'affaires de l'exercice. Elles vivent
// dans `app_settings` côté D1 et l'emportent sur le calcul automatique, parce
// que la reprise Costructor est incomplète.
//
// ⚠ ENVOYER 0 REND LA MAIN AU CALCUL, il n'écrit pas « zéro euro ». C'est le
// comportement de la route côté worker (`effaceOuEcrit`) : la valeur est
// effacée, et le tableau de bord recalcule. Un écran qui ne le dirait pas
// ferait croire à une saisie perdue.
export const majCaManuel = ({ ht, ttc }) => {
  const corps = {};
  if (ht !== undefined) corps.ht = ht;
  if (ttc !== undefined) corps.ttc = ttc;
  return envoyer('/api/stats/manual-ca', corps);
};

// Le statut d'un chantier, aux dix valeurs du tableau de bord. `d1Id` est
// `rgd_chantiers.d1_id`.
//
// ⚠ EFFET DE BORD : le worker propage vers le `statut_suivi` du prospect, ce
// qui peut déclencher un email à son apporteur. C'est le comportement du
// tableau de bord ; l'écran le dit.
//
// ⚠ ET LE CRM NE VOIT PAS LE CHANGEMENT TOUT DE SUITE : `deals.stage`,
// `deals.status` et `rgd_chantiers.etat` sont des TRADUCTIONS calculées par
// `push_rgd`. Elles ne se recalculent qu'au relevé suivant. L'écran avance
// donc le statut brut et laisse le reste rattraper.
export const majStatutChantier = (d1Id, statut) =>
  envoyer(`/api/chantiers/${encodeURIComponent(d1Id)}`, { statut });

// Créer un chantier. `client_d1Id` est l'identifiant CÔTÉ CLOUDFLARE du client
// (`rgd_clients.d1_id`), pas l'uuid du contact dans le CRM.
//
// ⚠ DEUX CHOSES À DIRE À QUI APPELLE.
// 1. Le worker fait passer le prospect en « chantier en cours », ce qui
//    **envoie un email à son apporteur** s'il en a un.
// 2. Le chantier n'apparaîtra PAS tout de suite dans le CRM : celui-ci lit un
//    reflet relevé toutes les 30 minutes. Un écran qui ferait croire le
//    contraire enverrait quelqu'un chercher une ligne qui n'existe pas encore.
export const creerChantier = (champs) => envoyer('/api/chantiers', champs, 'POST');

// Marquer un devis signé. `d1Id` est `rgd_devis.d1_id`.
//
// ⚠ CE N'EST PAS LA SOURCE DE VÉRITÉ, ET C'EST IMPORTANT.
// Les devis viennent de Costructor, dont la synchro réécrit `statut` ET
// `date_signature` à chaque passage, depuis le statut du devis chez lui. Ce
// bouton pose donc une valeur que Costructor peut défaire à la synchro
// suivante s'il ne considère pas le devis comme accepté.
//
// Le tableau de bord expose le même bouton, sans le dire. On le reprend
// — c'est un geste que Mickael utilise — mais l'écran prévient.
export const signerDevis = (d1Id) =>
  envoyer(`/api/devis/${encodeURIComponent(d1Id)}/signer`, {}, 'POST');

// ---------------------------------------------------------------- sous-traitants
//
// POURQUOI CET ÉCRAN ÉCRIT PLUS QUE LES AUTRES
// Les pièces administratives d'un sous-traitant ne se déposent nulle part
// ailleurs que dans le tableau de bord. Tant que c'était vrai, couper Surge
// aurait coupé le seul endroit où l'on peut prouver qu'un artisan est en règle.
// Le CRM reprend donc le dépôt lui-même ; les fichiers, eux, restent chez
// Cloudflare (KV) jusqu'à la phase 3 du plan de sortie.

// La fiche complète, à la source. Donne les `*_url` que le relevé ne porte pas,
// et donc la seule réponse honnête à « la pièce existe-t-elle ? ».
export const ficheSousTraitant = (d1Id) =>
  lire(`/api/sous-traitants/${encodeURIComponent(d1Id)}`);

// Déposer une pièce. `type` est une clé du worker (kbis, urssaf, vigilance,
// decennale, rc_pro, regularite_fiscale, contrat_st, rib), `fichier` un PDF de
// 24 Mo au plus — le worker refuse tout le reste, et l'écran le dit avant.
// `dateExpire` est facultative : le RIB et le contrat n'expirent pas.
export function deposerPieceSt(d1Id, type, fichier, dateExpire) {
  const f = new FormData();
  f.append('file', fichier);
  // Une chaîne vide n'est pas une date : la laisser passer écrirait '' dans une
  // colonne qui doit rester nulle, et la pastille deviendrait « expiré » au
  // lieu d'« absent ».
  if (dateExpire) f.append('expire_date', dateExpire);
  return televerser(`/api/sous-traitants/${encodeURIComponent(d1Id)}/documents/${encodeURIComponent(type)}`, f);
}

// L'aperçu de la relance : le worker rend le HTML du mail SANS l'envoyer.
// On le montre toujours avant l'envoi — un mail part chez un artisan, il n'y a
// pas de retour en arrière.
export const apercuRelanceSt = (d1Id) =>
  envoyer(`/api/sous-traitants/${encodeURIComponent(d1Id)}/relance-documents`, { preview: true }, 'POST');

// ⚠ CELLE-CI ENVOIE VRAIMENT UN EMAIL, via Brevo, au sous-traitant.
// Le worker refuse (400) s'il n'y a rien à relancer ou si la fiche n'a pas
// d'email, et note la date d'envoi dans `date_dernier_email_relance_docs`.
export const envoyerRelanceSt = (d1Id) =>
  envoyer(`/api/sous-traitants/${encodeURIComponent(d1Id)}/relance-documents`, {}, 'POST');

// Faire passer un artisan repéré en prospection au rang de sous-traitant.
// ⚠ CE GESTE OUVRE LES OBLIGATIONS DE CONFORMITÉ : à partir de là, l'absence
// d'attestation de vigilance engage le donneur d'ordre. L'écran doit le dire,
// pas le faire glisser dans un menu.
export const convertirSt = (d1Id, champs = {}) =>
  envoyer(`/api/sous-traitants/${encodeURIComponent(d1Id)}/convertir`, champs, 'POST');

// La fiche elle-même : coordonnées, spécialités, notes. Sans email, la relance
// est impossible — le worker la refuse — et trois des onze artisans en
// prospection n'en ont pas.
export const majSousTraitant = (d1Id, champs) =>
  envoyer(`/api/sous-traitants/${encodeURIComponent(d1Id)}`, champs);

// ------------------------------------------------- partenaires et achats
//
// ⚠ LE CRM ET D1 N'EMPLOIENT PAS LES MÊMES NOMS, ET LE RELEVÉ TRADUIT.
// `reprise_crm.js` renomme en chemin. Envoyer le nom du CRM au worker ne
// produit PAS d'erreur : `update` ne retient que les champs qu'il connaît et
// ignore les autres en silence, puis répond `{ ok: true }`. On croirait avoir
// enregistré. La traduction se fait donc ICI, une fois, et pas dans l'écran.
//
//   CRM                  D1
//   partenariat_signe →  signed_partnership   (booléen → 0/1)
//   apports_declares  →  nb_prospects_manuel
//   actif             →  actif                (booléen → 0/1)
//   deal_id           →  chantier_id          (et c'est le `d1_id` du chantier)
//   materiau (liste)  →  materiau             (une CHAÎNE JSON, pas un tableau)
const versD1Apporteur = (c) => {
  const d = { ...c };
  if ('partenariat_signe' in d) { d.signed_partnership = d.partenariat_signe ? 1 : 0; delete d.partenariat_signe; }
  if ('apports_declares' in d) { d.nb_prospects_manuel = d.apports_declares; delete d.apports_declares; }
  if ('actif' in d) d.actif = d.actif ? 1 : 0;
  return d;
};

// `materiau` est stocké en TEXTE dans D1 et le worker lie la valeur telle
// quelle : passer le tableau ferait échouer la requête (D1 ne sait pas lier un
// tableau), et le passer en objet écrirait « [object Object] ».
const versD1Fourniture = (c) => {
  const d = { ...c };
  if ('materiau' in d) d.materiau = Array.isArray(d.materiau) ? JSON.stringify(d.materiau) : d.materiau;
  return d;
};

// Aucun effet de bord côté worker pour ces quatre routes : pas d'email, pas de
// poussée vers Costructor. Ce sont les écritures les plus simples de l'espace.
export const creerApporteur = (champs) => envoyer('/api/apporteurs', versD1Apporteur(champs), 'POST');
export const majApporteur = (d1Id, champs) =>
  envoyer(`/api/apporteurs/${encodeURIComponent(d1Id)}`, versD1Apporteur(champs));

// ⚠ `chantier_id` est EXIGÉ à la création (le worker répond 400 sans lui),
// alors que le relevé accepte une fourniture sans chantier. On ne peut donc pas
// créer ici un achat non rattaché : l'écran le dit plutôt que de le découvrir.
export const creerFourniture = (champs) => envoyer('/api/fournitures', versD1Fourniture(champs), 'POST');
export const majFourniture = (d1Id, champs) =>
  envoyer(`/api/fournitures/${encodeURIComponent(d1Id)}`, versD1Fourniture(champs));

// ------------------------------------------------------------- réalisations
//
// ⚠ CE SONT LES SEULES ÉCRITURES DE L'ESPACE QUI SORTENT VERS LE PUBLIC.
// `POST /api/realisations` ne modifie pas une ligne : il REMPLACE le document
// entier, et c'est ce document que rgdrenova.fr lit pour sa page « Nos
// réalisations ». Enregistrer ici, c'est publier.
//
// ⚠ IL FAUT DONC TOUJOURS RELIRE AVANT D'ÉCRIRE, ET NE JAMAIS RECONSTRUIRE
// LE DOCUMENT DEPUIS LE REFLET. `rgd_realisations` déplie le JSON en lignes
// pour qu'on puisse le chercher et le trier, mais il PERD les descriptions
// des cinq catégories — de longs textes de référencement qui n'ont pas de
// colonne. Repartir du reflet les effacerait du site sans que rien ne le dise.
//
// ⚠ ET IL N'Y A QU'UN SEUL NIVEAU DE RETOUR ARRIÈRE. Chaque enregistrement
// pousse l'ancien document dans `data_backup` et écrase le précédent : deux
// mauvais enregistrements de suite, et la bonne version n'existe plus nulle
// part. L'écran doit le dire avant de proposer « restaurer ».

// Le document complet, lu à la source. Route PUBLIQUE (le site s'en sert),
// donc sans jeton — mais on coupe le cache : le worker répond avec un
// `max-age=60`, et relire une version d'il y a une minute avant de la
// réécrire ferait perdre la modification de quelqu'un d'autre.
export async function lireRealisations() {
  try {
    const r = await fetch(`${API}/api/realisations`, { cache: 'no-store' });
    if (!r.ok) return { ok: false, motif: `HTTP ${r.status}` };
    const d = await r.json();
    if (!Array.isArray(d?.categories)) return { ok: false, motif: 'document inattendu' };
    return { ok: true, donnees: d };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 120) };
  }
}

// Publier le document. `doc` doit être le document ENTIER — le worker refuse
// (400) tout ce qui n'a pas de `categories`, ce qui est le garde-fou minimal
// contre un envoi tronqué.
export const enregistrerRealisations = (doc) =>
  envoyer('/api/realisations', doc, 'POST');

// Revenir à la version précédente. UNE seule, voir plus haut.
export const restaurerRealisations = () =>
  envoyer('/api/realisations/restore', {}, 'POST');

// Déposer une ou plusieurs photos. Elles vont dans le KV de Cloudflare et le
// worker rend leurs URL publiques — à poser ensuite dans `images` d'un projet,
// puis à enregistrer : le dépôt seul ne publie rien.
// 20 Mo par image, formats jpeg/png/webp/gif/avif. Le worker refuse TOUT LE
// LOT si une seule image cloche, pour qu'on voie ce qui ne va pas au lieu de
// chercher la photo manquante.
export function deposerPhotosRealisations(fichiers) {
  const f = new FormData();
  for (const x of fichiers) f.append('file', x);
  return televerser('/api/realisations/upload', f);
}
