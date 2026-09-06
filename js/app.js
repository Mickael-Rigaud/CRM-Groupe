// Point d'entrée : authentification, navigation (routes #/…), mise en page.
import { CONFIG } from './config.js';
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { ACTIVITIES, ROLES } from './data/schema.js';
import { esc, toast, isoDay, daysSince, closeModal } from './ui.js';
import { pages } from './pages/index.js';


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
        <div class="form-actions"><button class="btn" type="submit">Se connecter</button></div>
      </form>`}
  </div></div>`;
  app.querySelectorAll('[data-u]').forEach(b => b.onclick = async () => { const u = await db.signIn(b.dataset.u); start(u); });
  app.querySelector('#login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const u = await db.signIn(f.get('email'), f.get('password')); if (!u) throw new Error('Profil utilisateur introuvable — demandez à la direction de créer votre profil.'); await db.loadAll(); start(u); }
    catch (err) { renderLogin(err.message); }
  });
}

// ---------- Mise en page ----------
const NAV = [
  { hash: '#/home', label: 'Tableau de bord', icon: '◫' },
  { hash: '#/today', label: "À faire aujourd'hui", icon: '☑', count: () => scope.activities().filter(a => !a.done && a.due_date && daysSince(a.due_date) >= 0).length },
  { sep: 'Commercial' },
  { hash: '#/dashboard', label: "Vue d'ensemble", icon: '📊', direction: true },
  ...Object.values(ACTIVITIES).map(a => ({ hash: `#/pipeline/${a.key}`, label: a.label, dot: a.color, sub: true, activity: a.key, count: () => scope.deals().filter(d => d.activity === a.key && d.status === 'open').length })),
  { hash: '#/contacts', label: 'Contacts', icon: '👤' },
  { hash: '#/partners', label: 'Partenaires', icon: '🤝' },
  { hash: '#/acquisition', label: 'Acquisition', icon: '📈', direction: true },
  { sep: 'Recrutement', show: () => scope.isDirection || scope.activityKeys.includes('courtage') },
  { hash: '#/vivier', label: 'Vivier courtiers', icon: '🏦', show: () => scope.isDirection || scope.activityKeys.includes('courtage'), count: () => db.t('broker_profiles').filter(r => !r.archive && ['contact', 'rdv'].includes(r.suivi)).length },
  { sep: 'Patrimoine', show: () => scope.canPatrimony },
  { hash: '#/patrimoine', label: "Vue d'ensemble", icon: '🏠', show: () => scope.canPatrimony, exact: true },
  { hash: '#/patrimoine/biens', label: 'Biens', icon: '🏘', sub: true, show: () => scope.canPatrimony },
  { hash: '#/patrimoine/prets', label: 'Prêts', icon: '🏦', sub: true, show: () => scope.canPatrimony },
  { hash: '#/patrimoine/loyers', label: 'Loyers', icon: '💶', sub: true, show: () => scope.canPatrimony },
  { hash: '#/patrimoine/charges', label: 'Charges', icon: '🧾', sub: true, show: () => scope.canPatrimony },
  { sep: 'Réglages' },
  { hash: '#/settings', label: 'Paramètres', icon: '⚙' },
];

function renderLayout() {
  const u = scope.user;
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><div class="logo">${esc(CONFIG.APP_NAME)}</div><small>Pilotage des activités</small></div>
      <nav class="nav" id="nav"></nav>
      <div class="userbox"><div class="role">${esc(ROLES[u.role]?.label || u.role)}</div><div class="name">${esc(u.full_name)}</div><button class="btn ghost sm" id="logout" style="color:#fff;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.25)">Déconnexion</button></div>
    </aside>
    <div class="main">
      <header class="topbar"><h1 id="page-title">—</h1><div class="datepill"><span>Aujourd'hui</span>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></header>
      <main class="content" id="content"></main>
    </div>`;
  app.querySelector('#logout').onclick = async () => { await db.signOut(); location.hash = ''; scope.set(null); renderLogin(); };
  renderNav();
}
function renderNav() {
  const nav = document.getElementById('nav'); if (!nav) return;
  const hash = location.hash || '#/home';
  nav.innerHTML = NAV.filter(n => !n.direction || scope.isDirection).filter(n => !n.activity || scope.activityKeys.includes(n.activity)).filter(n => !n.show || n.show()).map(n => {
    if (n.sep) return `<div class="sep">${esc(n.sep)}</div>`;
    const active = (n.exact ? hash === n.hash : hash.startsWith(n.hash)) ? 'active' : '';
    const cnt = n.count ? n.count() : 0;
    return `<a href="${n.hash}" class="${active} ${n.sub ? 'sub' : ''}">${n.dot ? `<span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${n.dot};box-shadow:0 0 0 2px rgba(255,255,255,.35)"></span>` : `<span>${n.icon}</span>`}${esc(n.label)}${cnt ? `<span class="cnt">${cnt}</span>` : ''}</a>`;
  }).join('');
}

// ---------- Routeur ----------
function route() {
  if (!scope.user) return;
  const hash = location.hash || '#/home';
  const [, name, param] = hash.split('/');
  let page = pages[name] || pages.home;
  if (name === 'patrimoine') page = pages['patrimoine_' + (param || 'home')] || pages.patrimoine_home;
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

async function start(user) {
  scope.set(user);
  if (!scope.isDirection && location.hash === '#/dashboard') location.hash = '#/home';
  renderLayout();
  unsubscribe?.();
  unsubscribe = db.onChange(() => { renderNav(); current?.refresh?.(); });
  route();
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
