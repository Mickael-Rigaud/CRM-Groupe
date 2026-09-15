// Point d'entrée : authentification, navigation (routes #/…), mise en page.
import { CONFIG } from './config.js';
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { ACTIVITIES, ROLES } from './data/schema.js';
import { esc, toast, isoDay, daysSince, closeModal, openModal } from './ui.js';
import { pages } from './pages/index.js';
import { icon } from './icons.js';


const app = document.getElementById('app');
let current = null; // page en cours
let unsubscribe = null;

// ---------- Connexion ----------
function renderLogin(error = '') {
  const users = db.t('profiles');
  app.innerHTML = `<div class="login"><div class="card">
    <div class="brand"><div class="logo">${esc(CONFIG.APP_NAME)}</div><small>RGD Renova · BTP Expertise · La Référence Courtage · Propulsion</small></div>
    ${db.demo ? `
      <p class="muted small">Mode démo — données d'exemple stockées dans ce navigateur. Choisissez un profil pour tester les droits :</p>
      <div class="userpick">${users.map(u => `<button data-u="${u.id}"><span class="avatar">${esc(u.full_name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><b>${esc(u.full_name)}</b><small>${esc(ROLES[u.role]?.label || u.role)} — ${esc(ROLES[u.role]?.description || '')}</small></span></button>`).join('')}</div>
    ` : `
      <form id="login-form" class="form">
        <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="username"></div>
        <div class="field"><label>Mot de passe</label><input type="password" name="password" required autocomplete="current-password"></div>
        ${error ? `<p style="color:var(--red);flex-basis:100%;margin:0">${esc(error)}</p>` : ''}
        <div class="form-actions"><a href="#" id="forgot" class="small muted" style="margin-right:auto">Mot de passe oublié ?</a><button class="btn" type="submit">Se connecter</button></div>
      </form>`}
  </div></div>`;
  app.querySelectorAll('[data-u]').forEach(b => b.onclick = async () => { const u = await db.signIn(b.dataset.u); start(u); });
  app.querySelector('#forgot')?.addEventListener('click', async e => {
    e.preventDefault(); const email = app.querySelector('[name="email"]').value.trim();
    if (!email) return renderLogin('Saisissez votre email, puis cliquez sur « Mot de passe oublié ? »');
    try { await db.resetPassword(email); renderLogin('Email envoyé : ouvrez le lien reçu pour choisir un nouveau mot de passe (vérifiez les spams).'); }
    catch (err) { renderLogin(err.message); }
  });
  app.querySelector('#login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const u = await db.signIn(f.get('email'), f.get('password')); if (!u) throw new Error('Profil utilisateur introuvable — demandez à la direction de créer votre profil.'); await db.loadAll(); start(u); }
    catch (err) { renderLogin(err.message); }
  });
}

// ---------- Mise en page ----------
// Navigation en rail : une icône par univers dans la colonne étroite, les écrans de
// l'univers ouvert dans un volet. Le volet se referme après la navigation, sauf s'il est épinglé.
const lateRent = () => { const k = isoDay().slice(0, 7); return db.t('leases').filter(l => l.active !== false && (!l.start_date || l.start_date.slice(0, 7) <= k) && (!l.end_date || l.end_date.slice(0, 7) >= k) && db.t('rent_payments').filter(x => x.lease_id === l.id && x.month.slice(0, 7) <= k).reduce((s, x) => s + (Number(x.due) || 0) - ((x.apl != null || x.tenant_paid != null) ? (Number(x.apl) || 0) + (Number(x.tenant_paid) || 0) : Number(x.amount) || 0) + (Number(x.adjustment) || 0), 0) > 0.005).length; };

const NAV = [
  { key: 'home', icon: 'home', label: 'Tableau de bord', hash: '#/home' },
  { key: 'today', icon: 'check', label: "À faire aujourd'hui", hash: '#/today', count: () => scope.activities().filter(a => !a.done && a.due_date && daysSince(a.due_date) >= 0).length },
  {
    key: 'commercial', icon: 'kanban', label: 'Commercial', items: [
      { hash: '#/dashboard', label: "Vue d'ensemble", direction: true },
      ...Object.values(ACTIVITIES).map(a => ({ hash: `#/pipeline/${a.key}`, label: a.label, dot: a.color, activity: a.key, count: () => scope.deals().filter(d => d.activity === a.key && d.status === 'open').length })),
      { hash: '#/contacts', label: 'Contacts' },
      { hash: '#/partners', label: 'Partenaires' },
      { hash: '#/acquisition', label: 'Acquisition', direction: true },
    ],
  },
  {
    key: 'recrutement', icon: 'target', label: 'Recrutement', show: () => scope.isDirection || scope.activityKeys.includes('courtage'), items: [
      { hash: '#/vivier', label: 'Vivier courtiers', count: () => db.t('broker_profiles').filter(r => !r.archive && ['contact', 'rdv'].includes(r.suivi)).length },
    ],
  },
  {
    key: 'patrimoine', icon: 'building', label: 'Patrimoine', show: () => scope.canPatrimony, items: [
      { hash: '#/patrimoine', label: "Vue d'ensemble", exact: true },
      { hash: '#/patrimoine/biens', label: 'Biens' },
      { hash: '#/patrimoine/prets', label: 'Prêts' },
      { hash: '#/patrimoine/charges', label: 'Charges' },
    ],
  },
  {
    key: 'locatif', icon: 'key', label: 'Gestion locative', show: () => scope.canRental, items: [
      { hash: '#/locatif', label: 'Suivi des loyers', exact: true },
      { hash: '#/locatif/baux', label: 'Baux et locataires' },
      { hash: '#/locatif/contacts', label: 'Contacts locataires' },
      { hash: '#/locatif/lots', label: 'Lots' },
      { hash: '#/locatif/suivi', label: 'À faire locatif', count: lateRent },
    ],
  },
  { key: 'settings', icon: 'gear', label: 'Paramètres', hash: '#/settings', bottom: true },
];

const PIN_KEY = 'crm_nav_pin';
let lastHash = null;
const navState = {
  open: null,                                   // univers dont le volet est ouvert
  get pinned() { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } },
  set pinned(v) { try { localStorage.setItem(PIN_KEY, v ? '1' : '0'); } catch { /* navigation privée */ } },
};
// Entrées visibles d'un univers, selon le rôle et les activités du profil
const itemsOf = (g) => (g.items || []).filter(i => (!i.direction || scope.isDirection) && (!i.activity || scope.activityKeys.includes(i.activity)));
const groups = () => NAV.filter(g => !g.show || g.show()).filter(g => !g.items || itemsOf(g).length);
const isOn = (i, hash) => i.exact ? hash === i.hash : hash.startsWith(i.hash);
const groupOf = (hash) => groups().find(g => g.hash ? isOn(g, hash) : itemsOf(g).some(i => isOn(i, hash)));

function renderLayout() {
  const u = scope.user;
  app.innerHTML = `
    <aside class="rail" id="rail" aria-label="Navigation principale"></aside>
    <div class="flyout" id="flyout" hidden></div>
    <div class="main">
      <header class="topbar"><h1 id="page-title">—</h1><div class="datepill"><span>Aujourd'hui</span>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></header>
      <main class="content" id="content"></main>
    </div>`;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && navState.open && !navState.pinned) closeFlyout(); });
  // En phase de capture : le rail est réécrit à chaque rendu, la cible d'un clic « bulle »
  // n'est donc plus rattachée au document quand ce test s'exécute.
  document.addEventListener('click', e => {
    if (!navState.open || navState.pinned) return;
    if (!e.target.closest('#flyout') && !e.target.closest('#rail')) closeFlyout();
  }, { capture: true });
  renderNav();
}

function closeFlyout() { navState.open = null; renderNav(); }

function renderNav() {
  const rail = document.getElementById('rail'); if (!rail) return;
  const hash = location.hash || '#/home';
  const u = scope.user;
  const here = groupOf(hash);
  // Volet épinglé : il suit la page ouverte, mais seulement quand on vient de naviguer —
  // sinon il écraserait l'univers que l'on est en train de parcourir.
  if (hash !== lastHash) { lastHash = hash; if (navState.pinned) navState.open = here?.items ? here.key : null; }
  if (navState.open && navState.open !== '__me' && !groups().some(g => g.key === navState.open)) navState.open = null;

  const btn = (g) => {
    const items = itemsOf(g);
    const single = g.hash || items.length === 1;
    const cnt = g.count ? g.count() : items.reduce((s, i) => s + (i.count ? i.count() : 0), 0);
    const on = here?.key === g.key || navState.open === g.key;
    return `<button type="button" class="rail-i ${on ? 'on' : ''}" data-nav="${g.key}" aria-label="${esc(g.label)}" ${navState.open === g.key ? 'aria-expanded="true"' : ''} title="${esc(g.label)}">
      ${icon(g.icon)}<span class="rail-lbl">${esc(g.label)}</span>${cnt ? `<span class="b">${cnt}</span>` : ''}${single ? '' : '<span class="more" aria-hidden="true"></span>'}
      <span class="tip">${esc(g.label)}</span></button>`;
  };
  const gs = groups();
  rail.innerHTML = `
    <a class="rail-logo" href="#/home" title="${esc(CONFIG.APP_NAME)}"><span>CG</span></a>
    <div class="rail-set">${gs.filter(g => !g.bottom).map(btn).join('')}</div>
    <div class="rail-set bottom">${gs.filter(g => g.bottom).map(btn).join('')}
      <button type="button" class="rail-i avatar" data-nav="__me" aria-label="Mon compte"><span class="ini">${esc((u.full_name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span class="rail-lbl">Mon compte</span><span class="tip">${esc(u.full_name)}</span></button>
    </div>`;

  const fly = document.getElementById('flyout');
  const g = navState.open === '__me' ? null : gs.find(x => x.key === navState.open);
  if (navState.open === '__me') {
    fly.hidden = false;
    fly.innerHTML = `<div class="fly-head"><h2>Mon compte</h2></div>
      <div class="fly-me"><div class="role">${esc(ROLES[u.role]?.label || u.role)}</div><div class="name">${esc(u.full_name)}</div>${u.email ? `<div class="mail">${esc(u.email)}</div>` : ''}</div>
      <div class="fly-list">${db.demo ? '' : '<button type="button" class="fly-act" id="pwd">Changer mon mot de passe</button>'}<button type="button" class="fly-act danger" id="logout">Déconnexion</button></div>`;
    fly.querySelector('#pwd')?.addEventListener('click', () => { closeFlyout(); passwordForm(false); });
    fly.querySelector('#logout').onclick = async () => { await db.signOut(); location.hash = ''; scope.set(null); navState.open = null; renderLogin(); };
  } else if (g) {
    fly.hidden = false;
    fly.innerHTML = `<div class="fly-head"><h2>${esc(g.label)}</h2><button type="button" class="pin ${navState.pinned ? 'on' : ''}" id="nav-pin" aria-pressed="${navState.pinned}" title="${navState.pinned ? 'Détacher le volet' : 'Garder le volet ouvert'}">${navState.pinned ? '◉' : '○'}</button></div>
      <nav class="fly-list">${itemsOf(g).map(i => {
        const cnt = i.count ? i.count() : 0;
        return `<a href="${i.hash}" class="${isOn(i, hash) ? 'on' : ''}" ${isOn(i, hash) ? 'aria-current="page"' : ''}>${i.dot ? `<span class="dot" style="background:${i.dot}"></span>` : ''}${esc(i.label)}${cnt ? `<span class="cnt">${cnt}</span>` : ''}</a>`;
      }).join('')}</nav>`;
    fly.querySelector('#nav-pin').onclick = () => { navState.pinned = !navState.pinned; renderNav(); };
    fly.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { if (!navState.pinned) navState.open = null; }));
  } else {
    fly.hidden = true; fly.innerHTML = '';
  }

  // Barre horizontale (mobile) : garder l'univers en cours sous les yeux
  if (rail.scrollWidth > rail.clientWidth) rail.querySelector('.rail-i.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  rail.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const key = b.dataset.nav;
    if (key === '__me') { navState.open = navState.open === '__me' ? null : '__me'; return renderNav(); }
    const grp = gs.find(x => x.key === key); const items = itemsOf(grp);
    if (grp.hash) { navState.open = null; location.hash = grp.hash; return renderNav(); }
    if (items.length === 1) { navState.open = null; location.hash = items[0].hash; return renderNav(); }
    navState.open = navState.open === key ? null : key;
    renderNav();
  });
}

// ---------- Routeur ----------
function route() {
  if (!scope.user) return;
  const hash = location.hash || '#/home';
  const [, name, param] = hash.split('/');
  let page = pages[name] || pages.home;
  if (name === 'patrimoine') page = pages['patrimoine_' + (param || 'home')] || pages.patrimoine_home;
  if (name === 'locatif') page = pages['locatif_' + (param || 'home')] || pages.locatif_home;
  if (page.directionOnly && !scope.isDirection) page = pages.today;
  if (name === 'pipeline' && !scope.activityKeys.includes(param)) { location.hash = `#/pipeline/${scope.activityKeys[0] || 'rgd'}`; return; }
  closeModal(true);
  current?.destroy?.();
  const content = document.getElementById('content');
  document.getElementById('page-title').textContent = page.title(param);
  content.innerHTML = '';
  current = page.render(content, param);
  renderNav();
  window.scrollTo(0, 0);
}

export function passwordForm(forced = false) {
  const m = openModal(forced ? 'Choisissez votre nouveau mot de passe' : 'Changer mon mot de passe', `<form class="form" id="pw-form">
    <div class="field"><label>Nouveau mot de passe (8 caractères minimum)</label><input type="password" name="p1" required minlength="8" autocomplete="new-password"></div>
    <div class="field"><label>Confirmer</label><input type="password" name="p2" required minlength="8" autocomplete="new-password"></div>
    <div class="form-actions">${forced ? '' : '<button type="button" class="btn ghost" data-close>Annuler</button>'}<button class="btn" type="submit">Enregistrer</button></div></form>`);
  m.querySelector('#pw-form').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    if (f.get('p1') !== f.get('p2')) return toast('Les deux mots de passe sont différents', 'warn');
    try { await db.updatePassword(f.get('p1')); closeModal(true); toast('Mot de passe modifié'); if (forced) { history.replaceState(null, '', location.pathname); location.hash = '#/home'; } }
    catch (err) { toast(err.message, 'err'); }
  };
}

async function start(user) {
  scope.set(user);
  if (!scope.isDirection && location.hash === '#/dashboard') location.hash = '#/home';
  renderLayout();
  unsubscribe?.();
  unsubscribe = db.onChange(() => { renderNav(); current?.refresh?.(); });
  route();
  if (db.isRecovery()) setTimeout(() => passwordForm(true), 300);
}

window.addEventListener('hashchange', route);

(async () => {
  try {
    await db.init();
    await db.loadAll().catch(e => { if (db.demo) throw e; /* en prod, sans session, RLS renvoie vide : normal */ });
    const u = await db.currentUser();
    if (u) { if (!db.demo) await db.loadAll(); start(u); } else renderLogin();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="login"><div class="card"><h2>Erreur de démarrage</h2><p>${esc(e.message)}</p><p class="muted small">Vérifiez la configuration dans <code>js/config.js</code>.</p></div></div>`;
  }
})();
