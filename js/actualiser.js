// Actualiser l'application : le geste « tirer vers le bas », et la fonction
// qu'il déclenche. (28/10/2026, demandé par Élodie.)
//
// ⚠ POURQUOI CE N'EST PAS UN SIMPLE `location.reload()`. Une fois installée sur
// un téléphone, l'application sert son code depuis une COPIE locale, tenue par
// `sw.js` — c'est ce qui la fait démarrer hors réseau. Recharger la page relit
// donc la même copie : on peut recharger dix fois sans jamais voir une
// correction publiée. Il faut d'abord demander au service worker d'aller voir
// s'il existe une version plus récente, ATTENDRE sa réponse, et recharger
// ensuite. C'est l'objet du message `verifier`.
//
// ⚠ ET IL N'Y A PAS DE BARRE D'ADRESSE pour s'en sortir à la main : installée,
// l'application n'a ni bouton « recharger » ni « vider le cache ». Sans ce
// geste, la seule issue était de désinstaller l'application.

import { db } from './data/db.js';

/** Le service worker a-t-il trouvé une version plus récente ? */
async function chercherNouvelleVersion() {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration('./').catch(() => null);
  const sw = reg?.active;
  if (!sw) return false;

  // ⚠ ON ATTEND LA RÉPONSE, AVEC UN DÉLAI DE GARDE : un service worker occupé,
  // ou un réseau qui ne répond pas, laisserait sinon l'écran tourner sans fin.
  // Au-delà, on continue sans savoir — mieux vaut recharger les données que
  // rester bloqué sur une roue qui tourne.
  return await new Promise((resolve) => {
    const canal = new MessageChannel();
    const fini = setTimeout(() => resolve(false), 8000);
    canal.port1.onmessage = (e) => { clearTimeout(fini); resolve(!!e.data?.nouvelle); };
    try { sw.postMessage({ type: 'verifier', page: location.href.split('#')[0] }, [canal.port2]); }
    catch { clearTimeout(fini); resolve(false); }
  });
}

/**
 * Actualise : nouvelle version du code si elle existe, puis données relues.
 *
 * ⚠ L'ORDRE COMPTE. Si une nouvelle version existe, on recharge la page et le
 * reste n'a pas lieu d'être : les données seront relues par le démarrage, et
 * les relire deux fois ferait deux fois le trajet pour rien.
 *
 * ⚠ EN MODE DÉMO, RIEN À CHERCHER : les données sont dans le navigateur et il
 * n'y a pas de service worker. On relit quand même l'écran, pour que le geste
 * ne reste pas sans effet — un geste qui ne fait rien se répète.
 */
export async function actualiser() {
  if (!db.demo && await chercherNouvelleVersion()) {
    location.reload();
    return { recharge: true };
  }
  // ⚠ `db.currentUser()` EST ASYNCHRONE ET PEUT RENDRE `null` : une session
  // expirée pendant que l'application dormait sur un téléphone est le cas
  // normal, pas l'exception. On ne relit alors rien — le démarrage se chargera
  // de renvoyer vers la connexion.
  if (!db.demo) {
    try {
      const u = await db.currentUser();
      if (u) await db.rafraichirTout(u);
    } catch { /* hors réseau : on garde ce qu'on a, c'est le but de la copie */ }
  }
  return { recharge: false };
}

// ---------- Le geste ----------
//
// ⚠ IL NE S'ARME QU'EN HAUT DE PAGE ET QUE VERS LE BAS : partout ailleurs le
// doigt doit faire défiler normalement. C'est la condition pour qu'un geste
// ajouté ne vole pas le geste existant — et c'est le défaut le plus courant des
// « tirer pour actualiser » faits à la main.
//
// ⚠ LE SEUIL EST FRANC (70 px) : un seuil court se déclenche quand on voulait
// seulement remonter la page, et une actualisation involontaire fait perdre ce
// qu'on était en train de lire.
const SEUIL = 70;
const COURSE_MAX = 110;

export function poserGesteActualiser() {
  // ⚠ UN SEUL POSAGE, MÊME SI L'APPEL EST RÉPÉTÉ : `renderNav()` tourne à
  // chaque écriture en base, et dix écouteurs tireraient dix actualisations.
  if (window.__gesteActualiser) return;
  window.__gesteActualiser = true;

  const voyant = document.createElement('div');
  voyant.className = 'pull-voyant';
  voyant.setAttribute('aria-hidden', 'true');
  voyant.innerHTML = '<span class="pull-rond"></span><b class="pull-mot"></b>';
  document.body.appendChild(voyant);

  let y0 = null, course = 0, enCours = false;

  const placer = (px, mot) => {
    voyant.style.transform = `translate(-50%, ${px}px)`;
    voyant.style.opacity = px > 6 ? '1' : '0';
    voyant.querySelector('.pull-mot').textContent = mot;
  };

  const finir = () => { y0 = null; course = 0; voyant.classList.remove('tourne'); placer(0, ''); };

  document.addEventListener('touchstart', (e) => {
    if (enCours || e.touches.length !== 1) return;
    // ⚠ `scrollY` SEUL NE SUFFIT PAS : un écran peut défiler dans un panneau
    // interne (une liste, une grille) alors que la page, elle, est en haut.
    // Tirer là-dedans doit faire défiler ce panneau, pas actualiser.
    const dansUnPanneau = e.target.closest('.modal, .drawer, [data-defile]');
    y0 = (scrollY <= 0 && !dansUnPanneau) ? e.touches[0].clientY : null;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (y0 === null || enCours) return;
    const d = e.touches[0].clientY - y0;
    if (d <= 0) { y0 = null; placer(0, ''); return; }
    course = Math.min(COURSE_MAX, d * 0.5);
    placer(course, course >= SEUIL ? 'Relâchez pour actualiser' : 'Tirez pour actualiser');
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (y0 === null || enCours) return;
    if (course < SEUIL) { finir(); return; }
    enCours = true;
    voyant.classList.add('tourne');
    placer(SEUIL, 'Actualisation…');
    try { await actualiser(); } finally { enCours = false; finir(); }
  }, { passive: true });
}
