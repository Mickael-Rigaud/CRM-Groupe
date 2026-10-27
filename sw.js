// Service worker du CRM : la copie locale du CODE, et les notifications d'échéance.
//
// ⚠ IL N'Y AVAIT PAS DE GESTIONNAIRE `fetch` JUSQU'AU 27/10/2026, ET LA RAISON
// TIENT TOUJOURS : un cache naïf ferait tourner l'ancienne version du CRM
// indéfiniment, bien au-delà des dix minutes de GitHub Pages, et `js/maj.js` ne
// pourrait plus rien y faire. Ce qui a changé : sur téléphone, recharger les
// ~120 fichiers du code à chaque ouverture coûtait plusieurs secondes en 4G.
// Le cache ci-dessous est donc construit pour que les mises à jour PASSENT :
//
// 1. On sert la copie locale tout de suite (ouverture instantanée).
// 2. À chaque ouverture, on demande au serveur l'empreinte (`ETag`) de
//    `index.html`. GitHub Pages change l'empreinte de TOUS les fichiers à chaque
//    mise en ligne (voir `js/maj.js`) : celle de la page suffit à savoir.
// 3. Si elle a changé, la nouvelle version est téléchargée EN ENTIER dans un
//    cache neuf, et l'on ne bascule dessus qu'une fois tout arrivé. Jamais de
//    mélange de deux versions dans la copie ; l'ouverture suivante est à jour.
//
// Les demandes de `js/maj.js` gardent leur sens, c'est ce qui le laisse marcher :
// `cache: 'force-cache'` lit la copie (« ce qui tourne »), `cache: 'no-store'`
// va au serveur sans rien toucher (« ce qui est en ligne »), et `cache: 'reload'`
// va au serveur ET remplace la copie (le bouton « Recharger » du bandeau).
//
// Seul le code passe ici (js, css, html, json) : ni la base, ni les images, ni
// rien qui vienne d'un autre domaine.

const META = 'crm-meta';
const CLE_COURANT = new URL('./__version-courante', self.registration.scope).href;
const PAGE = new URL('./index.html', self.registration.scope).href;
const RACINE = new URL('./', self.registration.scope).href;

const empreinte = (r) => r.headers.get('ETag') || r.headers.get('Last-Modified') || null;

// Le nom du cache de la version en service, gardé dans un petit cache à part :
// le service worker peut être arrêté et relancé à tout moment par le navigateur.
let courant = null;
async function nomCourant() {
  if (courant) return courant;
  const m = await (await caches.open(META)).match(CLE_COURANT);
  courant = m ? await m.text() : 'crm-code-1';
  return courant;
}
async function fixerCourant(nom) {
  courant = nom;
  await (await caches.open(META)).put(CLE_COURANT, new Response(nom));
}

// La clé d'un fichier dans la copie : son adresse sans la requête. La page
// d'accueil, qu'on l'ouvre par `/` ou `/index.html`, est une seule entrée.
function cleDe(url, navigation) {
  if (navigation) return PAGE;
  return url.origin + url.pathname;
}
function estDuCode(url) {
  return url.href.startsWith(RACINE) && /\.(js|css|html|json)$/i.test(url.pathname) && !url.pathname.endsWith('/sw.js');
}
function estLaPage(url) {
  return url.origin + url.pathname === RACINE || url.origin + url.pathname === PAGE;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  const navigation = r.mode === 'navigate';
  if (navigation ? !estLaPage(url) : !(estDuCode(url) || estLaPage(url))) return;
  // `js/maj.js` demande aussi la page par son adresse, hors navigation : même
  // entrée, sinon « Recharger » rafraîchirait les modules et pas la page.
  e.respondWith(servir(r, cleDe(url, navigation || estLaPage(url)), navigation, e));
});

async function servir(r, cle, navigation, e) {
  if (r.cache === 'no-store') return fetch(r);
  const cache = await caches.open(await nomCourant());
  if (r.cache === 'reload') {
    const rep = await fetch(r);
    if (rep.ok) await cache.put(cle, rep.clone());
    return rep;
  }
  if (navigation) e.waitUntil(verifierVersion());
  const garde = await cache.match(cle);
  if (garde) return garde;
  const rep = await fetch(r);
  if (rep.ok && rep.type === 'basic') await cache.put(cle, rep.clone());
  return rep;
}

// ⚠ UN SEUL CONTRÔLE À LA FOIS, et pas plus d'un par minute : plusieurs onglets
// ouverts ensemble ne doivent pas télécharger la nouvelle version chacun.
let dernierControle = 0;
let controleEnCours = null;
function verifierVersion() {
  if (controleEnCours || Date.now() - dernierControle < 60_000) return controleEnCours || Promise.resolve();
  dernierControle = Date.now();
  controleEnCours = basculerSiNouvelle().catch(() => {}).finally(() => { controleEnCours = null; });
  return controleEnCours;
}

async function basculerSiNouvelle() {
  const nom = await nomCourant();
  const cache = await caches.open(nom);
  const garde = await cache.match(PAGE);
  if (!garde) return; // rien de copié encore : la page s'en chargera (message « garder »)
  const neuve = await fetch(PAGE, { cache: 'no-store' });
  if (!neuve.ok || !empreinte(neuve) || empreinte(neuve) === empreinte(garde)) return;
  const nomNeuf = 'crm-code-' + Date.now();
  const neuf = await caches.open(nomNeuf);
  try {
    await neuf.put(PAGE, neuve);
    const adresses = (await cache.keys()).map(q => q.url).filter(u => u !== PAGE);
    for (let i = 0; i < adresses.length; i += 8) {
      await Promise.all(adresses.slice(i, i + 8).map(async (u) => {
        const rep = await fetch(u, { cache: 'no-store' });
        if (!rep.ok && rep.status !== 404) throw new Error(`${u} : ${rep.status}`);
        if (rep.ok) await neuf.put(u, rep); // un fichier retiré du dépôt sort de la copie
      }));
    }
  } catch {
    await caches.delete(nomNeuf); // réseau coupé en route : on garde l'ancienne, on réessaiera
    return;
  }
  await fixerCourant(nomNeuf);
  for (const k of await caches.keys()) if (k.startsWith('crm-code-') && k !== nomNeuf) await caches.delete(k);
}

// La page envoie, une fois ouverte, la liste des fichiers qu'elle a chargés.
// La toute première ouverture n'est pas encore passée par ce service worker :
// sans ce message, il faudrait attendre la troisième pour aller vite.
// `force-cache` reprend la version que la page EXÉCUTE, pas une plus récente.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'garder' || !Array.isArray(e.data.adresses)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(await nomCourant());
    for (const brute of e.data.adresses) {
      try {
        const url = new URL(brute);
        const page = estLaPage(url);
        if (!page && !estDuCode(url)) continue;
        const cle = cleDe(url, page);
        if (await cache.match(cle)) continue;
        const rep = await fetch(page ? PAGE : cle, { cache: 'force-cache' });
        if (rep.ok) await cache.put(cle, rep);
      } catch { /* un fichier manquant n'empêche pas les autres */ }
    }
  })());
});

// ---------- Notifications d'échéance ----------
// Le message vient de l'Edge Function `rappels-echeances` :
// { titre, corps, url, tag }.

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { corps: e.data && e.data.text() }; }
  const titre = m.titre || 'CRM Groupe — échéance';
  e.waitUntil(self.registration.showNotification(titre, {
    body: m.corps || '',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    // Le même `tag` remplace la notification précédente de la même tâche au lieu
    // d'en empiler deux si l'échéance a été déplacée puis atteinte à nouveau.
    tag: m.tag || undefined,
    data: { url: m.url || './#/today' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = new URL(e.notification.data?.url || './#/today', self.registration.scope).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of fenetres) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        try { await c.navigate(cible); } catch { /* le CRM déjà ouvert suffit */ }
        return;
      }
    }
    await self.clients.openWindow(cible);
  })());
});
