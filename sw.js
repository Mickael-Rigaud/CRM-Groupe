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
// Les applications de structure : la même application, ouverte sur une
// structure, avec son nom et son icône — autant de pages d'entrée. RGD Renova
// a inauguré le procédé le 27/10/2026, les trois autres ont suivi le 28.
//
// ⚠ CHACUNE EST UNE ENTRÉE À PART ENTIÈRE DANS LA COPIE LOCALE, et il le faut :
// un téléphone n'installe pas forcément `index.html`. Sur celui où seule
// l'application BTP est posée, c'est `btp.html` qui est copiée, et c'est elle
// qu'il faut interroger pour savoir s'il existe une version plus récente.
const PAGES_STRUCTURE = ['rgd', 'btp', 'courtage', 'propulsion']
  .map(k => new URL(`./${k}.html`, self.registration.scope).href);
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

// La page d'entrée que désigne une adresse, ou `null`. La page du CRM, qu'on
// l'ouvre par `/` ou `/index.html`, est une seule entrée.
function pageDe(url) {
  const sans = url.origin + url.pathname;
  if (sans === RACINE || sans === PAGE) return PAGE;
  return PAGES_STRUCTURE.includes(sans) ? sans : null;
}
// La clé d'un fichier dans la copie : son adresse sans la requête.
function cleDe(url) {
  return pageDe(url) || url.origin + url.pathname;
}
function estDuCode(url) {
  return url.href.startsWith(RACINE) && /\.(js|css|html|json)$/i.test(url.pathname) && !url.pathname.endsWith('/sw.js');
}
const estLaPage = (url) => !!pageDe(url);

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
  e.respondWith(servir(r, cleDe(url), navigation, e));
});

async function servir(r, cle, navigation, e) {
  if (r.cache === 'no-store') return fetch(r);
  const cache = await caches.open(await nomCourant());
  if (r.cache === 'reload') {
    const rep = await fetch(r);
    if (rep.ok) await cache.put(cle, rep.clone());
    return rep;
  }
  if (navigation) e.waitUntil(verifierVersion(cle));
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
function verifierVersion(page) {
  if (controleEnCours || Date.now() - dernierControle < 60_000) return controleEnCours || Promise.resolve();
  dernierControle = Date.now();
  controleEnCours = basculerSiNouvelle(page).catch(() => {}).finally(() => { controleEnCours = null; });
  return controleEnCours;
}

// `page` : celle qu'on ouvre. ⚠ PAS TOUJOURS `index.html` : sur un téléphone où
// seule une application de structure est installée, `index.html` n'est jamais
// copiée, et un contrôle fondé sur elle ne verrait jamais aucune nouvelle
// version.
async function basculerSiNouvelle(page = PAGE) {
  const nom = await nomCourant();
  const cache = await caches.open(nom);
  const garde = await cache.match(page);
  if (!garde) return; // rien de copié encore : la page s'en chargera (message « garder »)
  const neuve = await fetch(page, { cache: 'no-store' });
  if (!neuve.ok || !empreinte(neuve) || empreinte(neuve) === empreinte(garde)) return;
  const nomNeuf = 'crm-code-' + Date.now();
  const neuf = await caches.open(nomNeuf);
  try {
    await neuf.put(page, neuve);
    const adresses = (await cache.keys()).map(q => q.url).filter(u => u !== page);
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
// « Actualiser » demandé par la page (28/10/2026) : on va voir TOUT DE SUITE
// s'il existe une version plus récente, et on répond si l'on a basculé.
//
// ⚠ IL CONTOURNE LE DÉLAI DE GARDE DE 60 s de `verifierVersion`, et c'est tout
// son intérêt : ce délai évite d'interroger le réseau à chaque fetch, mais il
// rendait le geste inopérant — on tirait, rien ne changeait, on recommençait.
// Ici la demande est explicite et rare : elle mérite un aller-retour.
//
// ⚠ ON RÉPOND TOUJOURS, MÊME EN CAS D'ÉCHEC : sans réponse, la page attendrait
// son délai de garde entier avant de continuer, et le voyant tournerait pour
// rien pendant huit secondes.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'verifier') {
    const port = e.ports && e.ports[0];
    e.waitUntil((async () => {
      let nouvelle = false;
      try {
        // ⚠ LA PAGE DIT LAQUELLE ELLE EST, et ce n'est pas toujours
        // `index.html` : sur un téléphone où seule l'application BTP est
        // installée, c'est `btp.html` qui est copiée, et un contrôle fondé sur
        // `index.html` ne verrait jamais aucune nouvelle version.
        const quelle = typeof e.data.page === 'string'
          && new URL(e.data.page).origin === self.location.origin
          ? e.data.page : PAGE;
        const avant = await nomCourant();
        await basculerSiNouvelle(quelle);
        nouvelle = (await nomCourant()) !== avant;
      } catch { /* hors reseau : on garde la copie en place */ }
      dernierControle = Date.now();
      port?.postMessage({ nouvelle });
    })());
    return;
  }
  if (e.data?.type !== 'garder' || !Array.isArray(e.data.adresses)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(await nomCourant());
    for (const brute of e.data.adresses) {
      try {
        const url = new URL(brute);
        if (!estLaPage(url) && !estDuCode(url)) continue;
        const cle = cleDe(url);
        if (await cache.match(cle)) continue;
        const rep = await fetch(cle, { cache: 'force-cache' });
        if (rep.ok) await cache.put(cle, rep);
      } catch { /* un fichier manquant n'empêche pas les autres */ }
    }
  })());
});

// ---------- Notifications ----------
// Le message vient de l'Edge Function `rappels-echeances` (échéances) ou de
// `notifications-crm` (rendez-vous de l'ouvrier, messages, depuis le
// 28/10/2026) : { titre, corps, url, tag }.

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
  const cible = new URL(e.notification.data?.url || './#/today', self.registration.scope);
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of fenetres) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        // ⚠ ON GARDE LA PAGE OUVERTE, ON NE CHANGE QUE L'ÉCRAN : une
        // application de structure (`rgd.html`, `btp.html`…) ne doit pas se
        // changer en CRM Groupe parce que l'adresse de la notification désigne
        // `index.html`.
        const ici = new URL(c.url);
        try { await c.navigate(cible.hash ? ici.origin + ici.pathname + ici.search + cible.hash : cible.href); }
        catch { /* le CRM déjà ouvert suffit */ }
        return;
      }
    }
    await self.clients.openWindow(cible.href);
  })());
});
