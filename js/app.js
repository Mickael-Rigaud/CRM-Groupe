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
// Navigation horizontale : bande 1 = les univers, bande 2 = les écrans de l'univers ouvert.
// Un univers ou une entrée rattachée à une activité colore l'interface (voir applyBrand).
const lateRent = () => { const k = isoDay().slice(0, 7); return db.t('leases').filter(l => l.active !== false && (!l.start_date || l.start_date.slice(0, 7) <= k) && (!l.end_date || l.end_date.slice(0, 7) >= k) && db.t('rent_payments').filter(x => x.lease_id === l.id && x.month.slice(0, 7) <= k).reduce((s, x) => s + (Number(x.due) || 0) - ((x.apl != null || x.tenant_paid != null) ? (Number(x.apl) || 0) + (Number(x.tenant_paid) || 0) : Number(x.amount) || 0) + (Number(x.adjustment) || 0), 0) > 0.005).length; };

const NAV = [
  { key: 'home', icon: 'home', label: 'Tableau de bord', hash: '#/home' },
  { key: 'today', icon: 'check', label: "À faire aujourd'hui", hash: '#/today', count: () => scope.activities().filter(a => !a.done && a.due_date && daysSince(a.due_date) >= 0).length },
  {
    key: 'commercial', icon: 'kanban', label: 'Pilotage', items: [
      { hash: '#/dashboard', label: "Vue d'ensemble", direction: true },
      // Chaque structure ouvre son espace : RGD Renova son application, BTP Expertise ses
      // cinq écrans (onglets internes à la page). Les autres gardent leur pipeline.
      { hash: '#/rgd', label: ACTIVITIES.rgd.label, dot: ACTIVITIES.rgd.color, activity: 'rgd' },
      { hash: '#/btp', label: ACTIVITIES.btp.label, dot: ACTIVITIES.btp.color, activity: 'btp' },
      ...Object.values(ACTIVITIES).filter(a => !['rgd', 'btp'].includes(a.key)).map(a => ({ hash: `#/pipeline/${a.key}`, label: a.label, dot: a.color, activity: a.key, count: () => scope.deals().filter(d => d.activity === a.key && d.status === 'open').length })),
    ],
  },
  {
    // Répertoires et acquisition : sortis de Pilotage, qui ne garde que les structures.
    key: 'relations', icon: 'users', label: 'Contacts', items: [
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

// Logos des structures : testés une fois au démarrage, la pastille de couleur sert de repli
const LOGOS = new Set();
function probeLogos() {
  for (const k of Object.keys(ACTIVITIES)) {
    const im = new Image();
    im.onload = () => { LOGOS.add(k); renderNav(); };
    im.src = `assets/logos/${k}.png`;
  }
}
const navState = { open: null };   // menu « mon compte » ouvert ou non
// Entrées visibles d'un univers, selon le rôle et les activités du profil
const itemsOf = (g) => (g.items || []).filter(i => (!i.direction || scope.isDirection) && (!i.activity || scope.activityKeys.includes(i.activity)));
const groups = () => NAV.filter(g => !g.show || g.show()).filter(g => !g.items || itemsOf(g).length);
const isOn = (i, hash) => i.exact ? hash === i.hash : hash.startsWith(i.hash);
const groupOf = (hash) => groups().find(g => g.hash ? isOn(g, hash) : itemsOf(g).some(i => isOn(i, hash)));

function renderLayout() {
  app.innerHTML = `
    <header class="topnav" id="topnav">
      <div class="univ" id="univ"></div>
      <div class="topbar subnav" id="subnav"></div>
    </header>
    <main class="content" id="content"></main>`;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && navState.open) closeMenu(); });
  // Capture : la barre est réécrite à chaque rendu, la cible d'un clic « bulle » n'y est plus rattachée
  document.addEventListener('click', e => {
    if (navState.open && !e.target.closest('#acct')) closeMenu();
  }, { capture: true });
  renderNav();
}

function closeMenu() { navState.open = null; renderNav(); }

// ---------- Couleur de la structure ouverte ----------
// Sur un écran rattaché à une activité, l'interface prend la couleur de la structure ;
// partout ailleurs elle revient à l'indigo du groupe. Une seule source : ACTIVITIES.
const VARS = { accent: '--accent', accent2: '--accent-2', soft: '--accent-soft', ink: '--accent-ink', on: '--on-accent' };
function brandOf(hash) {
  // La structure se lit dans le menu, pas dans l'URL : un univers entier (BTP Expertise)
  // comme une simple entrée (un pipeline, l'application RGD) peut porter une activité.
  const g = groupOf(hash);
  if (!g) return null;
  const item = g.items ? itemsOf(g).find(i => isOn(i, hash)) : null;
  return item?.activity || g.activity || null;
}
function applyBrand(hash) {
  const a = ACTIVITIES[brandOf(hash)];
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(VARS)) a && a[k] ? root.setProperty(v, a[k]) : root.removeProperty(v);
  document.documentElement.dataset.brand = a ? a.key : '';
}

function renderNav() {
  const univ = document.getElementById('univ'); if (!univ) return;
  const hash = location.hash || '#/home';
  const u = scope.user;
  const gs = groups();
  const here = groupOf(hash);

  // ---- Bande 1 : les univers
  const tab = (g) => {
    const items = itemsOf(g);
    const cnt = g.count ? g.count() : items.reduce((s, i) => s + (i.count ? i.count() : 0), 0);
    return `<a href="${g.hash || itemsOf(g)[0].hash}" class="u-tab ${here?.key === g.key ? 'on' : ''}" data-univ="${g.key}">
      ${icon(g.icon, 17)}<span>${esc(g.label)}</span>${cnt ? `<i class="u-cnt">${cnt}</i>` : ''}</a>`;
  };
  const ini = (u.full_name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  univ.innerHTML = `
    <a class="u-mark" href="#/home">${esc(CONFIG.APP_NAME)}</a>
    <nav class="u-set" aria-label="Univers">${gs.filter(g => !g.bottom).map(tab).join('')}</nav>
    <div class="u-right">
      ${gs.filter(g => g.bottom).map(g => `<a href="${g.hash}" class="u-ico ${here?.key === g.key ? 'on' : ''}" title="${esc(g.label)}" aria-label="${esc(g.label)}">${icon(g.icon, 18)}</a>`).join('')}
      <div class="acct" id="acct">
        <button type="button" class="u-me" id="me-btn" aria-expanded="${navState.open === '__me'}"><span class="av">${esc(ini)}</span><span class="nm">${esc((u.full_name || '').split(' ')[0])}</span></button>
        ${navState.open === '__me' ? `<div class="acct-menu">
          <div class="acct-head"><div class="role">${esc(ROLES[u.role]?.label || u.role)}</div><div class="name">${esc(u.full_name)}</div>${u.email ? `<div class="mail">${esc(u.email)}</div>` : ''}</div>
          ${db.demo ? '' : '<button type="button" class="acct-act" id="pwd">Changer mon mot de passe</button>'}
          <button type="button" class="acct-act danger" id="logout">Déconnexion</button>
        </div>` : ''}
      </div>
    </div>`;

  // ---- Bande 2 : les écrans de l'univers ouvert
  const sub = document.getElementById('subnav');
  const items = here && here.items ? itemsOf(here) : [];
  let sep = false;   // un trait sépare les écrans transverses des structures
  const screens = items.map(i => {
    const cnt = i.count ? i.count() : 0;
    // Logo de la structure s'il a été déposé dans assets/logos/, pastille de couleur sinon
    const mark = i.activity && LOGOS.has(i.activity) ? `<span class="brandmark"><img src="assets/logos/${i.activity}.png" alt=""></span>`
      : i.dot ? `<span class="dot" style="background:${i.dot}"></span>` : '';
    const trait = i.dot && !sep ? (sep = true, '<span class="s-sep" aria-hidden="true"></span>') : '';
    return `${trait}<a href="${i.hash}" class="s-tab ${i.dot ? 'brand' : ''} ${isOn(i, hash) ? 'on' : ''}" ${i.dot ? `style="--c:${i.dot}"` : ''} ${isOn(i, hash) ? 'aria-current="page"' : ''}>${mark}${esc(i.label)}${cnt ? `<i class="s-cnt">${cnt}</i>` : ''}</a>`;
  }).join('');
  const posted = sub.querySelector('.embed-actions');   // commandes posées par la page ouverte
  sub.innerHTML = `<h1 id="page-title" class="sr-only">—</h1>
    <nav class="s-set" aria-label="Écrans">${screens}</nav>
    <div class="datepill"><span>Aujourd'hui</span>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>`;
  if (posted) sub.insertBefore(posted, sub.querySelector('.datepill'));
  sub.hidden = !items.length && !posted;

  // Garder l'onglet courant sous les yeux quand les barres défilent (mobile)
  for (const el of [univ.querySelector('.u-tab.on'), sub.querySelector('.s-tab.on')]) {
    const box = el?.parentElement;
    if (el && box && box.scrollWidth > box.clientWidth) el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  univ.querySelector('#me-btn').onclick = () => { navState.open = navState.open === '__me' ? null : '__me'; renderNav(); };
  univ.querySelector('#pwd')?.addEventListener('click', () => { closeMenu(); passwordForm(false); });
  univ.querySelector('#logout')?.addEventListener('click', async () => { await db.signOut(); location.hash = ''; scope.set(null); navState.open = null; renderLogin(); });
  // Un univers ouvert conduit à son premier écran ; la bande 2 fait le reste
  univ.querySelectorAll('[data-univ]').forEach(a => a.onclick = () => { navState.open = null; });
}

// ---------- Routeur ----------
function route() {
  if (!scope.user) return;
  const hash = location.hash || '#/home';
  const [, name, param] = hash.split('/');
  let page = pages[name] || pages.home;
  if (name === 'patrimoine') page = pages['patrimoine_' + (param || 'home')] || pages.patrimoine_home;
  if (name === 'locatif') page = pages['locatif_' + (param || 'home')] || pages.locatif_home;
  if (name === 'btp') page = pages['btp_' + (param || 'home')] || pages.btp_home;
  if (page.directionOnly && !scope.isDirection) page = pages.today;
  if (name === 'pipeline' && !scope.activityKeys.includes(param)) { location.hash = `#/pipeline/${scope.activityKeys[0] || 'rgd'}`; return; }
  closeModal(true);
  current?.destroy?.();
  const content = document.getElementById('content');
  document.getElementById('page-title').textContent = page.title(param);
  // Une page qui affiche une application entière (RGD Renova) garde la barre pour ses
  // commandes et la navigation, mais sans la date.
  document.querySelector('.topbar').classList.toggle('bare', !!page.fullBleed);
  content.innerHTML = '';
  applyBrand(hash);
  renderNav();
  current = page.render(content, param);
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
  probeLogos();
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
