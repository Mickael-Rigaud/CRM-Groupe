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
