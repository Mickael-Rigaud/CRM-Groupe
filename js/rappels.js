// Les échéances des tâches — le pop-up permanent et les notifications du téléphone.
//
// Demandé le 06/10/2026 : « je voudrais avoir un système de notification par
// rapport à l'échéance indiquée, comme une date butoir. Je voudrais recevoir une
// notification sur le téléphone à la date et heure de l'échéance et un système
// de pop-up permanent en bas à droite sur le CRM Groupe ». Trois réponses
// arbitrées le même jour : notification du CRM (Web Push, pas Google Agenda ni
// e-mail), tâche sans heure prévenue le jour même à 8 h, et pop-up qui montre
// les tâches ÉCHUES ET DU JOUR.
//
// ⚠ DEUX MOITIÉS, ET UNE SEULE VIT ICI. Le pop-up se calcule dans le navigateur,
// depuis le cache. La notification, elle, part du SERVEUR — l'Edge Function
// `rappels-echeances`, appelée toutes les cinq minutes — parce qu'une
// notification qui ne part que si le CRM est ouvert n'en est pas une. Ce module
// ne fait qu'ABONNER l'appareil : il enregistre où envoyer, pas quand.
//
// ⚠ LES TÂCHES DU POP-UP SONT CELLES DE « MA TO DO LIST », À LA LETTRE
// (`estMaTache` de `today.js`) : une définition recopiée ici finirait par
// montrer une tâche que la to do list ne montre pas.
//
// ⚠ L'HEURE PAR DÉFAUT EST 8 H, ET C'EST LA MÊME DES DEUX CÔTÉS : le serveur
// prévient à 8 h une tâche sans heure, le pop-up la compte « à faire
// aujourd'hui » dès minuit et « en retard » à partir du lendemain — on ne dit pas
// d'une tâche sans heure qu'elle est en retard à 8 h 01.
//
// ⚠ IL NE DISPARAÎT PAS, IL SE RÉDUIT : « permanent » était la demande. Réduit,
// il reste une pastille avec le nombre ; il ne se cache tout à fait que quand il
// n'y a rien à dire ET que l'appareil reçoit déjà les notifications.
//
// ⚠ IL SE RANGE AU-DESSUS DE LA BULLE DE MESSAGERIE, et s'efface quand celle-ci
// s'ouvre : le panneau de messagerie fait 640 px de haut, les deux se
// recouvriraient.

import { CONFIG } from './config.js';
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { esc, toast, daysSince } from './ui.js';
import { activityForm, actType } from './pages/activity.js';
import { estMaTache } from './pages/today.js';

const CLE_REDUIT = 'crm_rappels_reduit';
const HEURE_DEFAUT = '08:00';

const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* rien */ } };

// ---------------------------------------------------------------- les tâches

/** L'instant de l'échéance, en heure locale. Sans date, pas d'échéance. */
function echeanceDe(a) {
  if (!a.due_date) return null;
  const [h, m] = String(a.due_time || HEURE_DEFAUT).split(':').map(Number);
  const [y, mo, d] = String(a.due_date).slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d, h || 0, m || 0);
}

/** Les tâches à montrer : les miennes, ouvertes, échues ou du jour. */
export function tachesEcheance(maintenant = new Date()) {
  const moi = scope.user?.id;
  if (!moi) return [];
  return scope.activities()
    .filter(a => !a.done && a.due_date && estMaTache(a, moi))
    .map(a => {
      const j = daysSince(a.due_date);          // > 0 : jour passé, 0 : aujourd'hui
      const quand = echeanceDe(a);
      const retard = j > 0 || (j === 0 && !!a.due_time && quand <= maintenant);
      return { a, j, quand, retard };
    })
    .filter(x => x.j >= 0)
    .sort((x, y) => (y.retard - x.retard) || (x.quand - y.quand));
}

const libelleQuand = (x) => {
  const heure = x.a.due_time ? String(x.a.due_time).slice(0, 5) : '';
  if (x.j > 1) return `En retard · ${x.j} j`;
  if (x.j === 1) return `En retard · hier${heure ? ' ' + heure : ''}`;
  if (x.retard) return `En retard · ${heure}`;
  return heure ? `Aujourd'hui · ${heure}` : "Aujourd'hui";
};

// ------------------------------------------------------------ notifications

const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const estIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// L'état de l'appareil, relu à la demande : 'demo', 'ios-installer', 'impossible',
// 'refuse', 'actif' ou 'a-activer'.
let etatPush = 'a-activer';

async function lireEtatPush() {
  if (db.demo) return 'demo';
  if (!pushPossible()) return estIos() && !estInstallee() ? 'ios-installer' : 'impossible';
  if (Notification.permission === 'denied') return 'refuse';
  try {
    const reg = await navigator.serviceWorker.getRegistration('./');
    const abo = await reg?.pushManager.getSubscription();
    if (abo && Notification.permission === 'granted') return 'actif';
  } catch { /* on retombe sur « à activer » */ }
  return 'a-activer';
}

// La clé publique arrive en base64url ; `subscribe` veut des octets.
function cleServeur() {
  const b = CONFIG.VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(b + '='.repeat((4 - b.length % 4) % 4));
  return Uint8Array.from(brut, c => c.charCodeAt(0));
}

/**
 * Abonne CET appareil. ⚠ DEMANDÉ AU CLIC, JAMAIS AU CHARGEMENT : les navigateurs
 * refusent une demande de permission qui ne suit pas un geste, et Safari la
 * refuse définitivement — on ne pourrait plus la reposer.
 */
export async function activerNotifications() {
  if (!pushPossible()) throw new Error("Ce navigateur ne sait pas recevoir de notifications.");
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error("Les notifications ont été refusées sur cet appareil.");
  const abo = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleServeur() });
  const j = abo.toJSON();
  await db.rpc('push_abonner', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
    p_appareil: navigator.userAgent.slice(0, 200),
  });
}

// ---------------------------------------------------------------- le pop-up

let racine = null;
let minuteur = null;
let desabonner = null;

export function monterRappels(parent = document.body) {
  if (document.getElementById('rappels')) return;
  racine = document.createElement('aside');
  racine.id = 'rappels';
  racine.className = 'rappels';
  racine.setAttribute('aria-label', 'Échéances');
  parent.appendChild(racine);

  racine.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-rap]');
    if (!t) return;
    const geste = t.dataset.rap;
    if (geste === 'reduire') { ecrire(CLE_REDUIT, '1'); dessiner(); }
    else if (geste === 'ouvrir') { ecrire(CLE_REDUIT, null); dessiner(); }
    else if (geste === 'tache') {
      const a = db.byId('activities', t.dataset.id);
      if (a) activityForm({}, a, dessiner);
    } else if (geste === 'activer') {
      t.disabled = true; t.textContent = 'Activation…';
      try {
        await activerNotifications();
        toast('Notifications activées sur cet appareil');
      } catch (err) { toast(err.message || String(err), 'err'); }
      etatPush = await lireEtatPush();
      dessiner();
    }
  });

  desabonner = db.onChange(dessiner);
  // Une tâche du jour passe « en retard » à son heure : sans réveil, le pop-up
  // garderait l'ancien libellé jusqu'au prochain changement de données.
  minuteur = setInterval(dessiner, 60_000);
  lireEtatPush().then(e => { etatPush = e; dessiner(); });
  dessiner();
}

export function demonterRappels() {
  clearInterval(minuteur); minuteur = null;
  desabonner?.(); desabonner = null;
  document.getElementById('rappels')?.remove();
  racine = null;
}

function ligneNotif() {
  switch (etatPush) {
    case 'actif': return '';
    case 'demo': return `<p class="rap-notif muted">Notifications indisponibles en mode démo.</p>`;
    case 'ios-installer': return `<p class="rap-notif">Pour les recevoir sur iPhone : <b>Partager → Sur l'écran d'accueil</b>, puis ouvrez le CRM depuis son icône.</p>`;
    case 'impossible': return `<p class="rap-notif muted">Ce navigateur ne reçoit pas de notifications.</p>`;
    case 'refuse': return `<p class="rap-notif">Notifications bloquées sur cet appareil : autorisez-les dans les réglages du navigateur.</p>`;
    default: return `<button type="button" class="rap-activer" data-rap="activer">🔔 Recevoir les échéances sur cet appareil</button>`;
  }
}

function dessiner() {
  if (!racine) return;
  const liste = tachesEcheance();
  const retards = liste.filter(x => x.retard).length;
  const reduit = lire(CLE_REDUIT) === '1';

  // Rien à dire et rien à proposer : on ne laisse pas une pastille vide à l'écran.
  if (!liste.length && (etatPush === 'actif' || etatPush === 'demo' || reduit)) {
    racine.hidden = true; racine.innerHTML = ''; return;
  }
  racine.hidden = false;
  racine.classList.toggle('est-reduit', reduit);
  racine.classList.toggle('a-du-retard', retards > 0);

  if (reduit) {
    racine.innerHTML = `<button type="button" class="rap-pastille" data-rap="ouvrir"
      title="Afficher les échéances">⏰ <b>${liste.length}</b>${retards ? `<i>${retards} en retard</i>` : ''}</button>`;
    return;
  }

  racine.innerHTML = `
    <header class="rap-tete">
      <span class="rap-titre">⏰ Échéances${liste.length ? ` <b>${liste.length}</b>` : ''}</span>
      ${retards ? `<span class="rap-retards">${retards} en retard</span>` : ''}
      <span class="grow"></span>
      <button type="button" class="icon-btn" data-rap="reduire" title="Réduire">–</button>
    </header>
    ${liste.length ? `<ul class="rap-liste">${liste.map(x => `
      <li><button type="button" class="rap-tache ${x.retard ? 'est-retard' : ''}" data-rap="tache" data-id="${esc(x.a.id)}">
        <span class="rap-t">${actType(x.a.type).icon} ${esc(x.a.title || 'Tâche')}</span>
        <span class="rap-q">${esc(libelleQuand(x))}</span>
      </button></li>`).join('')}</ul>`
      : `<p class="rap-vide">Aucune échéance aujourd'hui.</p>`}
    ${ligneNotif()}`;
}
