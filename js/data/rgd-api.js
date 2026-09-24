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

// Le statut de suivi d'un client. `d1Id` est `rgd_clients.d1_id`, l'identifiant
// côté Cloudflare — surtout pas l'uuid du CRM, que le worker ne connaît pas.
export const majStatutClient = (d1Id, statutSuivi) =>
  envoyer(`/api/clients/${encodeURIComponent(d1Id)}`, { statut_suivi: statutSuivi });

// Le statut d'une demande du formulaire. Autre table, autre colonne : une
// demande porte `statut`, un client porte `statut_suivi`.
export const majStatutDemande = (d1Id, statut) =>
  envoyer(`/api/demandes/${encodeURIComponent(d1Id)}`, { statut });

// Le commentaire libre. Deux tables, deux noms de colonne — `notes` pour un
// client, `commentaire_admin` pour une demande du site : ce sont les noms de
// D1, et le worker n'accepte QUE les champs de sa liste `FIELDS`. Un nom qui
// n'y figure pas est ignoré **sans un mot**, puis la route répond `{ok: true}` :
// on croirait avoir enregistré. Les deux ci-dessous ont été vérifiés dans
// `routes/clients.js` et `routes/leads.js` le 23/09/2026.
export const majNoteClient = (d1Id, notes) =>
  envoyer(`/api/clients/${encodeURIComponent(d1Id)}`, { notes });

export const majCommentaireDemande = (d1Id, commentaire) =>
  envoyer(`/api/demandes/${encodeURIComponent(d1Id)}`, { commentaire_admin: commentaire });

// ⚠ SUPPRIMER À LA SOURCE, ET C'EST LA MOITIÉ DU GESTE.
// Le relevé ne fait que des `insert … on conflict do update`, sans aucun
// `delete` : une ligne effacée dans le CRM seul reviendrait au passage suivant.
// Une suppression se fait donc des DEUX côtés — ici d'abord, Supabase ensuite.
// Si cet appel échoue, il ne faut PAS effacer côté CRM : mieux vaut une fiche
// toujours là qu'une fiche qui disparaît puis réapparaît sans explication.
//
// Côté worker, `clients.remove` fait un geste de plus qu'un simple DELETE : si
// la fiche vient de Costructor, il inscrit son identifiant dans
// `costructor_contacts_ignored` pour que la synchronisation ne la recrée pas.
// Sans cela, une fiche Costructor supprimée revient au prochain passage.
export const supprimerClientSource = (d1Id) =>
  envoyer(`/api/clients/${encodeURIComponent(d1Id)}`, {}, 'DELETE');

export const supprimerDemandeSource = (d1Id) =>
  envoyer(`/api/demandes/${encodeURIComponent(d1Id)}`, {}, 'DELETE');

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
// ⚠ LES PIÈCES ADMINISTRATIVES NE PASSENT PLUS PAR ICI — 24/09/2026, étape 1
// de la sortie. Déposer une attestation et relancer un artisan par email
// étaient les deux derniers gestes de l'espace RGD à ne vivre que dans
// l'application d'origine : le fichier partait dans son stockage, l'email de
// son serveur. Tant que c'était vrai, l'éteindre éteignait le seul endroit où
// l'on peut prouver qu'un artisan est en règle.
//
// Tout cela vit désormais dans `js/data/rgd-pieces.js` : le fichier dans le
// stockage privé du CRM, la ligne dans `rgd_st_pieces`, le mail par la
// fonction d'envoi du CRM. Cinq fonctions ont disparu d'ici avec ce
// déménagement — `ficheSousTraitant`, `deposerPieceSt`, `pieceStFichier`,
// `apercuRelanceSt` et `envoyerRelanceSt` — et avec elles deux des quinze
// chemins que ce module appelait encore. Il en reste treize.
//
// ⚠ LES FICHIERS DÉJÀ DÉPOSÉS LÀ-BAS NE SONT PAS REPRIS (décision du
// 24/09/2026 : ce sont des essais). Les DATES, elles, continuent d'arriver par
// la synchronisation — d'où l'état « date connue, aucun document », que
// l'écran nomme au lieu de le laisser passer pour une attestation valide.

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

// Créer un sous-traitant, actif ou en prospection (23/09/2026).
//
// ⚠ RIEN À TRADUIRE ICI, et c'est l'exception : `sous_traitants` porte les
// MÊMES noms des deux côtés — `raison_sociale`, `specialites`, `telephone`,
// `email`, `adresse`, `notes`, `actif`, `statut_relation`. Vérifié contre la
// liste `FIELDS` du worker, qui ignore en silence tout champ qu'il ne connaît
// pas et répond quand même `{ ok: true }` : un nom inventé ne se verrait pas.
// Seuls les booléens se convertissent, D1 ne liant pas un `true` JavaScript.
//
// Le worker exige `raison_sociale` (400 sans elle) et rien d'autre.
export const creerSousTraitant = (champs) => envoyer('/api/sous-traitants', {
  ...champs,
  ...(champs.actif === undefined ? {} : { actif: champs.actif ? 1 : 0 }),
}, 'POST');

// ------------------------------------------------------------------ agenda
//
// Créer un rendez-vous (23/09/2026). `POST /api/evenements` écrit dans D1 PUIS
// pousse vers Google (`syncEventToGoogle` côté worker) : le rendez-vous part
// donc bien dans l'agenda.
//
// ⚠ MAIS IL NE REVIENT PAS TOUT DE SUITE DANS LE CRM, et ce n'est pas un défaut :
// `#/rgd/agenda` lit `agenda_events`, c'est-à-dire **Google relu**, pas `evenements`
// de D1. Le nouveau rendez-vous n'apparaît donc qu'au relevé suivant — trente
// minutes pour aujourd'hui, le lendemain pour un autre jour. La modale le dit.
//
// Le worker exige `titre`, `date_debut` et `date_fin` : un 400 sans l'une des
// trois. Les noms sont ceux de D1 (`titre`, `lieu`), pas ceux du CRM.
export const creerEvenement = (champs) => envoyer('/api/evenements', champs, 'POST');

// Les trois bascules de l'écran (23/09/2026). Elles passent toutes par le même
// `PATCH`, mais chacune a son nom : `majSousTraitant(id, { actif: false })`
// écrirait un booléen que D1 ne sait pas lier, et un appel écrit une fois par
// écran finit toujours par oublier la conversion quelque part.
export const activerSousTraitant = (d1Id, actif) =>
  majSousTraitant(d1Id, { actif: actif ? 1 : 0 });

// ⚠ RETOUR EN PROSPECTION, et ce n'est PAS l'inverse d'un bouton manquant :
// la montée passe par `/convertir`, qui refuse une fiche déjà active et trace
// l'événement ; la descente n'a pas de route à elle. Ce n'est pas gênant parce
// que `convertir` ne fait rien d'autre qu'écrire `statut_relation = 'actif'`
// (vérifié dans le worker) — aucun email, aucune poussée. Les deux sens sont
// donc bien symétriques ; si `convertir` gagne un effet un jour, il faudra une
// route de descente plutôt que ce PATCH.
export const remettreEnProspection = (d1Id) =>
  majSousTraitant(d1Id, { statut_relation: 'potentiel' });

// ⚠ SUPPRIMER SE FAIT DES DEUX CÔTÉS, et l'ordre compte.
//
// Le relevé n'efface jamais rien : `push_rgd_st` ne fait que des `insert … on
// conflict do update`. Une ligne supprimée dans D1 resterait donc dans le CRM
// POUR TOUJOURS, sans plus jamais être rafraîchie. À l'inverse, effacer la
// seule ligne du CRM la ferait revenir au relevé suivant.
//
// D1 d'abord — c'est la source, et c'est l'appel qui peut refuser —, Supabase
// ensuite. Le retour dit lequel des deux a échoué : « supprimé à moitié » est
// un état qu'il faut pouvoir nommer, pas une erreur générique.
export async function supprimerSousTraitant(d1Id, idCrm) {
  const r = await envoyer(`/api/sous-traitants/${encodeURIComponent(d1Id)}`, {}, 'DELETE');
  if (!r.ok) return r;
  try {
    await db.remove('rgd_sous_traitants', idCrm);
  } catch (e) {
    return { ok: false, motif: `supprimé dans le tableau de bord, mais pas dans le CRM (${e.message})` };
  }
  return { ok: true };
}

// ------------------------------------------------- partenaires et achats
//
// ⚠ LE CRM ET D1 N'EMPLOIENT PAS LES MÊMES NOMS, ET LE RELEVÉ TRADUIT.
// `reprise_crm.js` renomme en chemin. Envoyer le nom du CRM au worker ne
// produit PAS d'erreur : `update` ne retient que les champs qu'il connaît et
// ignore les autres en silence, puis répond `{ ok: true }`. On croirait avoir
// enregistré. La traduction se fait donc ICI, une fois, et pas dans l'écran.
//
//   CRM                  D1
//   deal_id           →  chantier_id          (et c'est le `d1_id` du chantier)
//   materiau (liste)  →  materiau             (une CHAÎNE JSON, pas un tableau)
//
// (La traduction des apporteurs a disparu avec leur bascule : ils s'écrivent
// désormais en direct dans Supabase, sans passer par D1 ni par ces noms-là.)
// `materiau` est stocké en TEXTE dans D1 et le worker lie la valeur telle
// quelle : passer le tableau ferait échouer la requête (D1 ne sait pas lier un
// tableau), et le passer en objet écrirait « [object Object] ».
const versD1Fourniture = (c) => {
  const d = { ...c };
  if ('materiau' in d) d.materiau = Array.isArray(d.materiau) ? JSON.stringify(d.materiau) : d.materiau;
  return d;
};

// ⚠ LES APPORTEURS NE PASSENT PLUS PAR ICI — 22/09/2026, phase 2.
// `rgd_apporteurs` n'est plus un reflet de Cloudflare : Supabase en est la
// source. L'écran écrit donc DIRECTEMENT dans la table, avec `db.insert` et
// `db.update`, sans traversée du worker et sans traduction de noms.
//
// Le relevé ne les envoie plus (`reprise_crm.js`), et `d1_id` est devenu
// nullable pour accueillir les fiches qui n'ont pas d'origine Cloudflare.
// `versD1Apporteur` n'a donc plus d'appelant pour la création et la
// modification — il reste pour les fournitures, qui, elles, passent encore.

// ⚠ `chantier_id` est EXIGÉ à la création (le worker répond 400 sans lui),
// alors que le relevé accepte une fourniture sans chantier. On ne peut donc pas
// créer ici un achat non rattaché : l'écran le dit plutôt que de le découvrir.
export const creerFourniture = (champs) => envoyer('/api/fournitures', versD1Fourniture(champs), 'POST');
export const majFourniture = (d1Id, champs) =>
  envoyer(`/api/fournitures/${encodeURIComponent(d1Id)}`, versD1Fourniture(champs));

// ------------------------------------------------------------- réalisations
//
// ⚠ CE SONT LES SEULES ÉCRITURES DE L'ESPACE QUI SORTENT VERS LE PUBLIC.
// `rgd_publier_site` ne modifie pas une ligne : il REMPLACE le document
// entier, et c'est ce document que rgdrenova.fr lit pour sa page « Nos
// réalisations ». Enregistrer ici, c'est publier.
//
// ⚠ PASSÉ À SUPABASE LE 22/09/2026 — le worker n'est plus dans la boucle.
// Le document vit dans `rgd_site_documents`, le site le lit par l'Edge
// Function `site-realisations`, et la RPC redéplie `rgd_realisations` dans la
// même transaction. Les PHOTOS, elles, sont encore chez Cloudflare : leur
// dépôt (`deposerPhotosRealisations`) passe toujours par le worker.
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

// ⚠ DEUX DOCUMENTS, UNE SEULE MÉCANIQUE. `rgd_site_documents` porte
// `realisations` (5 catégories, 31 projets) ET `carrousel` (les images du
// haut de la page d'accueil). Mêmes RPC, même remplacement en entier, même
// unique niveau de retour arrière — les trois fonctions ci-dessous sont donc
// écrites une fois et paramétrées par la clé. Les dédoubler ferait deux
// endroits où corriger le jour où la mécanique bouge.
async function lireDoc(cle, valide) {
  try {
    // ⚠ On passe par `rgd_lire_site`, PAS par la fonction publique du site :
    // celle-ci sert un cache d'une minute aux visiteurs, et republier une
    // version vieille d'une minute annulerait la modification de quelqu'un
    // d'autre — exactement ce que la relecture avant publication protège.
    const d = await db.rpc('rgd_lire_site', { p_cle: cle });
    if (!valide(d)) return { ok: false, motif: 'document inattendu' };
    return { ok: true, donnees: d };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 120) };
  }
}

async function publierDoc(cle, doc) {
  try {
    // L'auteur n'est pas passé : la fonction le lit dans le jeton, où
    // personne ne peut l'inventer.
    const r = await db.rpc('rgd_publier_site', { p_cle: cle, p_doc: doc });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

async function restaurerDoc(cle) {
  try {
    const r = await db.rpc('rgd_restaurer_site', { p_cle: cle });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

// Le document complet, lu à la source.
export const lireRealisations = () =>
  lireDoc('realisations', (d) => Array.isArray(d?.categories));

// Publier le document. `doc` doit être le document ENTIER — la RPC ne redéplie
// le reflet que si `categories` porte au moins une entrée, ce qui est le
// garde-fou minimal contre un envoi tronqué.
export const enregistrerRealisations = (doc) => publierDoc('realisations', doc);

// Revenir à la version précédente. UNE seule, voir plus haut.
export const restaurerRealisations = () => restaurerDoc('realisations');

// ⚠ Le carrousel a la MÊME contrainte de remplacement entier : `POST` écrase
// la liste des images de la page d'accueil. Une liste amputée retire du site
// les photos manquantes, et le retour arrière ne remonte que d'un cran.
// ⚠ Et une contrainte de plus, qui ne se voit pas : le reflet `rgd_carrousel`
// a une clé unique sur `url` et un `on conflict do nothing`. Deux fois la même
// photo dans la liste, et la seconde n'apparaît PAS dans le CRM alors qu'elle
// est bien sur le site — d'où le refus des doublons côté écran.
export const lireCarrousel = () =>
  lireDoc('carrousel', (d) => Array.isArray(d?.images));
export const enregistrerCarrousel = (images) => publierDoc('carrousel', { images });
export const restaurerCarrousel = () => restaurerDoc('carrousel');

// Déposer une ou plusieurs photos. Elles vont dans le bucket public
// `realisations` de Supabase, qui rend leurs adresses — à poser ensuite dans
// `images` d'un projet, puis à enregistrer : le dépôt seul ne publie rien.
//
// ⚠ ELLES ALLAIENT DANS LE KV DE CLOUDFLARE JUSQU'AU 24/09/2026, et c'était le
// dernier morceau des réalisations resté là-bas. Les 63 anciennes photos
// avaient bien été recopiées vers Supabase, mais tout NOUVEAU dépôt repartait
// chez le worker : cinq photos redéposées ce jour-là ont atterri dans le KV,
// et elles seraient mortes le jour où il s'éteindra. On ne répare pas une
// migration en recopiant à chaque fois ce qui vient d'arriver — on déplace la
// porte.
//
// ⚠ LE NOM DE FICHIER GARDE LA CONVENTION DU WORKER :
// `horodatage-hasard-nom_assaini`. Les 63 photos déjà en place le portent ;
// en changer ferait deux familles de noms dans un même bucket, sans que rien
// ne dise laquelle vient d'où.
//
// ⚠ ON REFUSE TOUT LE LOT si une seule image cloche, comme le faisait le
// worker : on voit ce qui ne va pas au lieu de chercher la photo manquante.
// La vérification est faite ICI et pas seulement par le bucket, parce qu'un
// refus du bucket arrive photo par photo, à moitié du dépôt, avec un message
// en anglais.
const PHOTO_MAX = 20 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export async function deposerPhotosRealisations(fichiers) {
  const liste = [...fichiers];
  if (!liste.length) return { ok: false, motif: 'aucun fichier' };

  for (const f of liste) {
    const type = String(f.type || '').toLowerCase();
    if (type && !PHOTO_TYPES.includes(type)) {
      return { ok: false, motif: `« ${f.name} » n’est pas une image (${type})` };
    }
    if (f.size > PHOTO_MAX) {
      return { ok: false, motif: `« ${f.name} » dépasse ${Math.round(PHOTO_MAX / 1048576)} Mo` };
    }
  }

  const { db } = await import('./db.js');
  const urls = [];
  try {
    for (const f of liste) {
      const propre = String(f.name || 'photo').replace(/[^A-Za-z0-9._-]/g, '_');
      const nom = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${propre}`;
      urls.push(await db.deposerPhotoPublique(nom, f));
    }
  } catch (e) {
    const motif = String(e.message || e);
    // La politique d'écriture du bucket est gardée par `has_activity('rgd')` :
    // un compte d'une autre structure se voit refuser, et le message brut ne
    // le dirait pas.
    return { ok: false, motif: /row-level security|not authorized|403/i.test(motif)
      ? 'Réservé à l’équipe RGD : aucune photo n’a été déposée.'
      : motif.slice(0, 120) };
  }
  return { ok: true, donnees: { urls } };
}
