// Service worker du CRM — UNIQUEMENT pour les notifications d'échéance.
//
// ⚠ AUCUN GESTIONNAIRE `fetch`, ET C'EST DÉLIBÉRÉ : un service worker qui met en
// cache ferait servir l'ancienne version du CRM bien au-delà des dix minutes de
// GitHub Pages, et `js/maj.js` ne pourrait plus rien y faire. Celui-ci ne touche
// à aucune requête : il reçoit un message, il l'affiche, il ouvre le CRM au clic.
//
// Le message vient de l'Edge Function `rappels-echeances` :
// { titre, corps, url, tag }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
