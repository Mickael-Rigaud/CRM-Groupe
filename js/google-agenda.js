// Lecture réelle des agendas Google — pour dessiner la journée nous-mêmes.
//
// Pourquoi ce module existe : le cadre intégré de Google affiche un agenda mais
// reste une boîte noire. Impossible d'en borner l'affichage à la journée, d'en
// reprendre les couleurs de nos structures, ni de mélanger ses rendez-vous aux
// tâches du CRM. Ici on demande les événements à l'API, et le CRM dessine.
//
// Comment ça marche sans serveur : Google Identity Services délivre au navigateur
// un jeton d'accès temporaire (environ une heure) après que la personne a accepté.
// L'identifiant client est public par nature — ce n'est pas un secret, il désigne
// l'application, pas le compte. Aucun mot de passe ne transite, et le jeton reste
// en mémoire : ni localStorage, ni base, ni dépôt.
//
// Chacun voit ce à quoi SON compte Google a accès : les droits restent ceux de
// Google, le CRM n'en accorde aucun.
import { db } from './data/db.js';

export const CLE_CLIENT = 'google_client_id';
const PORTEE = 'https://www.googleapis.com/auth/calendar.readonly';
const GSI = 'https://accounts.google.com/gsi/client';

export const clientId = () => (db.setting(CLE_CLIENT) || '').trim();
export const configure = () => !!clientId();

// ---------- Jeton ----------
let jeton = null;          // { valeur, expire }
let clientJeton = null;
let scriptCharge = null;

const chargerGsi = () => {
  if (scriptCharge) return scriptCharge;
  scriptCharge = new Promise((ok, ko) => {
    if (window.google?.accounts?.oauth2) return ok();
    const s = document.createElement('script');
    s.src = GSI; s.async = true; s.defer = true;
    s.onload = () => ok();
    s.onerror = () => ko(new Error('Google est injoignable depuis ce navigateur.'));
    document.head.appendChild(s);
  });
  return scriptCharge;
};

const valide = () => jeton && jeton.expire > Date.now() + 60_000;

// `interactif` : false tente un renouvellement silencieux (la personne a déjà
// accepté), true ouvre la fenêtre de consentement. On n'ouvre jamais de fenêtre
// sans un geste de la personne : les navigateurs la bloqueraient.
export async function obtenirJeton({ interactif = false } = {}) {
  if (valide()) return jeton.valeur;
  const id = clientId();
  if (!id) throw new Error('Aucun identifiant client Google n\'est renseigné.');
  await chargerGsi();
  if (!clientJeton) {
    clientJeton = window.google.accounts.oauth2.initTokenClient({
      client_id: id, scope: PORTEE, callback: () => {},
    });
  }
  return new Promise((ok, ko) => {
    clientJeton.callback = (r) => {
      if (r.error) return ko(new Error(r.error === 'access_denied' ? 'Accès refusé.' : r.error));
      jeton = { valeur: r.access_token, expire: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
      ok(jeton.valeur);
    };
    clientJeton.error_callback = (e) => ko(new Error(e?.type === 'popup_closed' ? 'Fenêtre Google fermée.' : 'Connexion Google impossible.'));
    try { clientJeton.requestAccessToken({ prompt: interactif ? 'consent' : '' }); }
    catch (e) { ko(e); }
  });
}
export const connecte = () => valide();
export function deconnecter() {
  if (jeton && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(jeton.valeur); } catch { /* déjà expiré */ }
  }
  jeton = null;
}

// ---------- Événements ----------
const iso = (d) => d.toISOString();
export const bornesDuJour = (date = new Date()) => {
  const debut = new Date(date); debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut); fin.setDate(fin.getDate() + 1);
  return { debut, fin };
};

// Les événements d'un calendrier sur une plage. `singleEvents` déplie les
// répétitions : sans lui, un rendez-vous hebdomadaire ne remonte qu'une fois.
async function evenementsDe(calendrier, debut, fin, token) {
  const p = new URLSearchParams({
    timeMin: iso(debut), timeMax: iso(fin),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '50',
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendrier)}/events?${p}`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 404) throw new Error('introuvable');
  if (r.status === 403) throw new Error('non partagé');
  if (r.status === 401) { jeton = null; throw new Error('session expirée'); }
  if (!r.ok) throw new Error('erreur ' + r.status);
  return (await r.json()).items || [];
}

// Tous les agendas demandés, en parallèle. Un calendrier inaccessible ne fait pas
// échouer les autres : il est signalé à part, pour qu'une liste incomplète ne
// passe jamais pour une journée vide.
export async function evenementsDuJour(agendas, date = new Date(), { interactif = false } = {}) {
  const token = await obtenirJeton({ interactif });
  const { debut, fin } = bornesDuJour(date);
  const resultats = await Promise.all(agendas.map(async (a) => {
    try {
      const items = await evenementsDe(a.calendrier, debut, fin, token);
      return { ok: true, structure: a.structure, items };
    } catch (e) { return { ok: false, structure: a.structure, calendrier: a.calendrier, motif: e.message }; }
  }));
  const evenements = [];
  for (const r of resultats) {
    if (!r.ok) continue;
    for (const e of r.items) {
      if (e.status === 'cancelled') continue;
      const journee = !e.start?.dateTime;
      const d = journee ? new Date(e.start.date + 'T00:00:00') : new Date(e.start.dateTime);
      const f = journee ? new Date(e.end.date + 'T00:00:00') : new Date(e.end.dateTime);
      evenements.push({
        id: e.id, titre: e.summary || '(sans titre)', lieu: e.location || '',
        debut: d, fin: f, journee, structure: r.structure,
        lien: e.htmlLink || '', invites: (e.attendees || []).length,
      });
    }
  }
  evenements.sort((a, b) => (a.journee === b.journee ? a.debut - b.debut : a.journee ? -1 : 1));
  return { evenements, echecs: resultats.filter(r => !r.ok) };
}

// ---------- Mode d'emploi du raccordement ----------
export const modeEmploiClient = () => `<ol class="ag-pas">
  <li>Ouvrez <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">console.cloud.google.com/apis/credentials</a> avec votre compte Google.</li>
  <li>Créez un projet si vous n'en avez pas, puis activez l'<b>API Google Calendar</b> (menu « API et services » → « Activer des API »).</li>
  <li>« Créer des identifiants » → <b>ID client OAuth</b> → type <b>Application Web</b>.</li>
  <li>Dans <b>Origines JavaScript autorisées</b>, ajoutez exactement&nbsp;: <code>${location.origin}</code></li>
  <li>Copiez l'<b>ID client</b> (il se termine par <code>.apps.googleusercontent.com</code>) et collez-le ci-dessous.</li>
</ol>
<p class="muted small">Cet identifiant désigne l'application, pas votre compte&nbsp;: il n'est pas secret. Aucun mot de passe n'est demandé, et chaque personne ne verra que les agendas partagés avec elle.</p>`;
