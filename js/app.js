// Point d'entrée : authentification, navigation (routes #/…), mise en page.
import { CONFIG } from './config.js';
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { ACTIVITIES, ROLES } from './data/schema.js';
import { esc, toast, isoDay, daysSince, closeModal, openModal } from './ui.js';
import { pages } from './pages/index.js';
import { messagesNonLus, monterBulle } from './pages/messagerie.js';
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

// Structures dont la ligne du menu ouvre un espace (menu vertical interne) plutôt
// qu'un pipeline. Le recrutement de La Référence Courtage — le vivier courtiers —
// est un écran de son espace, pas un univers du CRM.
const ESPACES = ['rgd', 'btp', 'courtage'];

const NAV = [
  { key: 'home', icon: 'home', label: 'Tableau de bord', hash: '#/home' },
  { key: 'today', icon: 'check', label: 'To do list', hash: '#/today', count: () => scope.activities().filter(a => !a.done && a.due_date && daysSince(a.due_date) >= 0).length },
  {
    key: 'commercial', icon: 'kanban', label: 'Pilotage', items: [
      // « Vue d'ensemble » a quitté ce menu le 2026-09-18. L'écran existe
      // toujours et reste joignable à #/dashboard — il porte sa propre garde
      // (`directionOnly`), le retirer d'ici n'ouvre donc rien à personne. Même
      // traitement que le vivier courtiers et les DTU : on sort du menu, on
      // n'efface pas.
      // Une structure qui a son espace l'ouvre ici au lieu de son pipeline : RGD Renova
      // son application, BTP Expertise et La Référence Courtage leurs écrans internes.
      // Les pipelines restent joignables à #/pipeline/<clé>.
      ...ESPACES.map(k => ({ hash: `#/${k}`, label: ACTIVITIES[k].label, dot: ACTIVITIES[k].color, activity: k })),
      ...Object.values(ACTIVITIES).filter(a => !ESPACES.includes(a.key)).map(a => ({ hash: `#/pipeline/${a.key}`, label: a.label, dot: a.color, activity: a.key, count: () => scope.deals().filter(d => d.activity === a.key && d.status === 'open').length })),
      // Pilotage ne montre que la vue d'ensemble et les quatre structures. Le répertoire
      // global des contacts, les partenaires et l'acquisition ont quitté le menu :
      // leurs écrans restent joignables par leur adresse (#/partners, #/acquisition).
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
  // La messagerie porte ses conversations dans sa propre colonne : une seule entrée
  // ici, avec le nombre de messages non lus.
  { key: 'messagerie', icon: 'chat', label: 'Messagerie', hash: '#/messagerie', count: () => messagesNonLus() },
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
const navState = { open: null, tiroir: false };   // menu « mon compte », tiroir de navigation
// Entrées visibles d'un univers, selon le rôle et les activités du profil
const itemsOf = (g) => (g.items || []).filter(i => (!i.direction || scope.isDirection) && (!i.activity || scope.activityKeys.includes(i.activity)));
const groups = () => NAV.filter(g => !g.show || g.show()).filter(g => !g.items || itemsOf(g).length);
const isOn = (i, hash) => i.exact ? hash === i.hash : hash.startsWith(i.hash);
const groupOf = (hash) => groups().find(g => g.hash ? isOn(g, hash) : itemsOf(g).some(i => isOn(i, hash)));

// La hauteur de la barre du haut, publiee en variable CSS
//
// ⚠ ELLE NE PEUT PAS ETRE ECRITE EN DUR DANS LE CSS. Le menu d'espace se cale
// dessous pour rester en place quand la page defile, et il lui faut donc un
// decalage exact. Or cette barre change de hauteur : deux rangees sur poste,
// une seule en mode formulaire imprimable, et `.subnav` passe a la ligne quand
// les onglets ne tiennent plus — ce qui depend du nombre d'activites du profil,
// pas seulement de la largeur de l'ecran. Mesure en direct : 116 px a 1280,
// 98 a 700. Une constante serait juste sur le poste ou on l'a prise et fausse
// ailleurs, avec un menu glisse sous la barre ou flottant en dessous.
//
// ⚠ ON MESURE A CHAQUE RENDU DE LA BARRE, ET PAS SEULEMENT SUR EVENEMENT.
// `renderNav` s'execute a chaque navigation et a chaque changement de donnees :
// c'est le moment sur, celui qui ne depend de rien. Les trois autres declencheurs
// rattrapent ce qui bouge SANS nouveau rendu — les logos qui finissent de
// charger et grandissent la barre, et le redimensionnement de la fenetre.
let observateurBarre = null;
function mesurerBarre() {
  const barre = document.getElementById('topnav');
  if (!barre || !barre.offsetHeight) return;
  document.documentElement.style.setProperty('--h-topnav', barre.offsetHeight + 'px');
}
function suivreBarre() {
  const barre = document.getElementById('topnav');
  if (!barre) return;
  mesurerBarre();
  observateurBarre?.disconnect();
  observateurBarre = new ResizeObserver(mesurerBarre);
  observateurBarre.observe(barre);
  window.addEventListener('resize', mesurerBarre);
  window.addEventListener('load', mesurerBarre);
}

function renderLayout() {
  app.innerHTML = `
    <header class="topnav" id="topnav">
      <div class="univ" id="univ"></div>
      <div class="topbar subnav" id="subnav"></div>
    </header>
    <main class="content" id="content"></main>
    <div id="tiroir" hidden></div>`;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (navState.tiroir) fermerTiroir(); else if (navState.open) closeMenu();
  });
  // Capture : la barre est réécrite à chaque rendu, la cible d'un clic « bulle » n'y est plus rattachée
  document.addEventListener('click', e => {
    if (navState.open && !e.target.closest('#acct')) closeMenu();
  }, { capture: true });
  renderNav();
  suivreBarre();
}

function closeMenu() { navState.open = null; renderNav(); }
function fermerTiroir() { navState.tiroir = false; renderNav(); }

// ---------- Tiroir de navigation (écrans étroits) ----------
// Il ne remplace pas la barre : il la remplace *sur téléphone*, là où elle ne
// savait plus rien montrer. Les univers portent leur nom et leur compteur, et
// celui qui est ouvert déplie ses écrans — la même information que les deux
// bandes du grand écran, mais lisible d'un coup d'oeil au lieu de deux barres
// qui défilent.
function renderTiroir(gs, here, hash, u, ini) {
  const hote = document.getElementById('tiroir'); if (!hote) return;
  document.body.classList.toggle('tiroir-ouvert', navState.tiroir);
  if (!navState.tiroir) { hote.innerHTML = ''; hote.hidden = true; return; }
  hote.hidden = false;

  const ligne = (g) => {
    const items = itemsOf(g);
    const cnt = g.count ? g.count() : items.reduce((s, i) => s + (i.count ? i.count() : 0), 0);
    const ouvert = here?.key === g.key;
    // Seul l'univers ouvert déplie ses écrans : tout déplier ferait une liste de
    // vingt lignes où l'on ne retrouverait plus la sienne.
    const ecrans = ouvert && items.length ? `<div class="tir-ecrans">${items.map(i => {
      const c = i.count ? i.count() : 0;
      const mark = i.activity && LOGOS.has(i.activity) ? `<span class="brandmark"><img src="assets/logos/${i.activity}.png" alt=""></span>`
        : `<span class="dot" style="background:${i.dot || 'var(--line-strong)'}"></span>`;
      return `<a href="${i.hash}" class="tir-ecran ${isOn(i, hash) ? 'on' : ''}">${mark}<span>${esc(i.label)}</span>${c ? `<i>${c}</i>` : ''}</a>`;
    }).join('')}</div>` : '';
    return `<a href="${g.hash || items[0].hash}" class="tir-univ ${ouvert ? 'on' : ''}">${icon(g.icon, 19)}<span>${esc(g.label)}</span>${cnt ? `<i>${cnt}</i>` : ''}</a>${ecrans}`;
  };

  hote.innerHTML = `
    <div class="tir-fond" id="tir-fond"></div>
    <aside class="tir" role="dialog" aria-modal="true" aria-label="Navigation">
      <div class="tir-tete">
        <span class="tir-av">${esc(ini)}</span>
        <div class="tir-qui"><b>${esc(u.full_name)}</b><span>${esc(ROLES[u.role]?.label || u.role)}</span></div>
        <button type="button" class="tir-x" id="tir-x" aria-label="Fermer le menu">${icon('x', 18)}</button>
      </div>
      <nav class="tir-nav" aria-label="Univers">${gs.filter(g => !g.bottom).map(ligne).join('')}</nav>
      <div class="tir-pied">
        ${gs.filter(g => g.bottom).map(g => `<a href="${g.hash}" class="tir-univ ${here?.key === g.key ? 'on' : ''}">${icon(g.icon, 19)}<span>${esc(g.label)}</span></a>`).join('')}
        ${db.demo ? '' : '<button type="button" class="tir-act" id="tir-pwd">Changer mon mot de passe</button>'}
        <button type="button" class="tir-act danger" id="tir-out">Déconnexion</button>
      </div>
    </aside>`;

  hote.querySelector('#tir-fond').onclick = fermerTiroir;
  hote.querySelector('#tir-x').onclick = fermerTiroir;
  // Toucher une entrée ferme le tiroir, y compris quand l'adresse ne change pas
  // (on retouche l'écran où l'on est déjà) : sinon il resterait ouvert sur place.
  hote.querySelectorAll('a').forEach(a => a.addEventListener('click', fermerTiroir));
  hote.querySelector('#tir-pwd')?.addEventListener('click', () => { fermerTiroir(); passwordForm(false); });
  hote.querySelector('#tir-out')?.addEventListener('click', async () => {
    await db.signOut(); location.hash = ''; scope.set(null);
    navState.open = null; navState.tiroir = false;
    document.body.classList.remove('tiroir-ouvert');
    document.getElementById('msg-bulle')?.remove(); renderLogin();
  });
}

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
  queueMicrotask(mesurerBarre);   // apres que le navigateur ait pose la barre
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
    <button type="button" class="u-burger" id="burger" aria-label="Ouvrir le menu" aria-expanded="${navState.tiroir}">${icon('menu', 21)}</button>
    <a class="u-mark" href="#/home">${esc(CONFIG.APP_NAME)}</a>
    <span class="u-ici">${esc(here?.label || CONFIG.APP_NAME)}</span>
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
  let transverse = false;   // un écran sans structure a-t-il été posé avant ?
  const screens = items.map((i) => {
    const cnt = i.count ? i.count() : 0;
    // Logo de la structure s'il a été déposé dans assets/logos/, pastille de couleur sinon
    const mark = i.activity && LOGOS.has(i.activity) ? `<span class="brandmark"><img src="assets/logos/${i.activity}.png" alt=""></span>`
      : i.dot ? `<span class="dot" style="background:${i.dot}"></span>` : '';
    // Le trait sépare les écrans transverses des structures : il ne se pose que
    // si un écran transverse l'a précédé. Depuis que « Vue d'ensemble » a quitté
    // Pilotage, ce menu n'en a plus aucun — le trait ne doit donc plus paraître
    // du tout, ni en tête de barre ni entre deux structures.
    const trait = i.dot && transverse && !sep ? (sep = true, '<span class="s-sep" aria-hidden="true"></span>') : '';
    if (!i.dot) transverse = true;
    return `${trait}<a href="${i.hash}" class="s-tab ${i.dot ? 'brand' : ''} ${isOn(i, hash) ? 'on' : ''}" ${i.dot ? `style="--c:${i.dot}"` : ''} ${isOn(i, hash) ? 'aria-current="page"' : ''}>${mark}${esc(i.label)}${cnt ? `<i class="s-cnt">${cnt}</i>` : ''}</a>`;
  }).join('');
  const posted = sub.querySelector('.embed-actions');   // commandes posées par la page ouverte
  // La barre est réécrite à chaque changement de données, pas seulement au
  // changement d'écran : le titre doit survivre à ces redessins, sinon il
  // retombe sur le tiret du gabarit dès la première écriture en base.
  const titre = sub.querySelector('#page-title')?.textContent || '—';
  sub.innerHTML = `<h1 id="page-title" class="sr-only">${esc(titre)}</h1>
    <nav class="s-set" aria-label="Écrans">${screens}</nav>
    <div class="datepill"><span>Aujourd'hui</span>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>`;
  if (posted) sub.insertBefore(posted, sub.querySelector('.datepill'));
  sub.hidden = !items.length && !posted;

  renderTiroir(gs, here, hash, u, ini);

  // Garder l'onglet courant sous les yeux quand les barres défilent (mobile)
  for (const el of [univ.querySelector('.u-tab.on'), sub.querySelector('.s-tab.on')]) {
    const box = el?.parentElement;
    if (el && box && box.scrollWidth > box.clientWidth) el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  univ.querySelector('#burger').onclick = () => { navState.tiroir = !navState.tiroir; navState.open = null; renderNav(); };
  univ.querySelector('#me-btn').onclick = () => { navState.open = navState.open === '__me' ? null : '__me'; renderNav(); };
  univ.querySelector('#pwd')?.addEventListener('click', () => { closeMenu(); passwordForm(false); });
  univ.querySelector('#logout')?.addEventListener('click', async () => { await db.signOut(); location.hash = ''; scope.set(null); navState.open = null; document.getElementById('msg-bulle')?.remove(); renderLogin(); });
  // Un univers ouvert conduit à son premier écran ; la bande 2 fait le reste
  univ.querySelectorAll('[data-univ]').forEach(a => a.onclick = () => { navState.open = null; });
}

// ---------- Routeur ----------
function route() {
  if (!scope.user) return;
  const hash = location.hash || '#/home';
  // ⚠ LA CHAINE DE REQUETE NE FAIT PAS PARTIE DU NOM DE LA PAGE.
  // `#/rgd/clients?vue=prospects&onglet=meta` se découpe en `rgd` et
  // `clients?vue=prospects&onglet=meta` : sans ce retrait, la recherche
  // `pages['rgd_' + param]` échoue et l'adresse retombe sur l'accueil de
  // l'activité — silencieusement, puisqu'un repli n'est pas une erreur.
  //
  // Les écrans qui acceptent des paramètres les relisent eux-mêmes depuis
  // `location.hash`, qui reste entier : on ne retire la requête que du nom de
  // page, pas du hash. C'est ce que fait `rgd-clients.js`, qui ouvre ainsi
  // directement un onglet donné depuis un lien de mail.
  const [, name, paramEtRequete] = hash.split('/');
  const param = (paramEtRequete || '').split('?')[0];
  // Le vivier courtiers a rejoint l'espace La Référence Courtage : l'ancienne adresse y mène.
  if (name === 'vivier') { location.hash = '#/courtage/vivier'; return; }
  // La to do list de BTP Expertise a disparu au profit de celle du CRM, commune
  // aux quatre structures : un signet sur l'ancienne adresse y mene.
  if (name === 'btp' && param === 'todo') { location.hash = '#/today'; return; }
  let page = pages[name] || pages.home;
  if (name === 'patrimoine') page = pages['patrimoine_' + (param || 'home')] || pages.patrimoine_home;
  if (name === 'locatif') page = pages['locatif_' + (param || 'home')] || pages.locatif_home;
  if (name === 'btp') page = pages['btp_' + (param || 'home')] || pages.btp_home;
  if (name === 'courtage') page = pages['courtage_' + (param || 'home')] || pages.courtage_home;
  if (name === 'rgd') page = pages['rgd_' + (param || 'home')] || pages.rgd_home;
  if (page.directionOnly && !scope.isDirection) page = pages.today;
  if (name === 'pipeline' && !scope.activityKeys.includes(param)) { location.hash = `#/pipeline/${scope.activityKeys[0] || 'rgd'}`; return; }
  closeModal(true);
  current?.destroy?.();
  const content = document.getElementById('content');
  // Une page qui affiche une application entière (RGD Renova) garde la barre pour ses
  // commandes et la navigation, mais sans la date.
  document.querySelector('.topbar').classList.toggle('bare', !!page.fullBleed);
  content.innerHTML = '';
  applyBrand(hash);
  renderNav();
  // Après renderNav() et pas avant : c'est elle qui réécrit la barre, donc le
  // titre posé plus tôt était systématiquement remplacé par le tiret du gabarit.
  // Ce titre est lu par les lecteurs d'écran, et la bulle de messagerie s'en
  // sert pour nommer l'écran d'où part un message.
  document.getElementById('page-title').textContent = page.title(param);
  // ⚠ UN ÉCRAN QUI ÉCHOUE DOIT LE DIRE, PAS DISPARAÎTRE (24/09/2026).
  // `render` commence par vider `content` : s'il lève ensuite, la zone reste
  // blanche et rien ne l'explique — ni message, ni trace visible. Mickael a
  // signalé « l'écran est blanc » sans que rien ne permette d'aller plus loin,
  // et c'est cette absence-là qu'on corrige : la cause change à chaque fois,
  // le silence était constant.
  //
  // ⚠ LA CAUSE LA PLUS FRÉQUENTE N'EST PAS UN BOGUE DE L'ÉCRAN. Les pages sont
  // toutes importées d'un bloc par `pages/index.js`, et le navigateur garde
  // les modules en cache : après une mise en ligne, un module neuf peut se
  // retrouver à côté d'un module périmé qui ne fournit plus ce qu'il demande.
  // Un seul suffit à éteindre l'application entière. D'où le conseil donné en
  // premier, avant même le détail technique.
  try {
    current = page.render(content, param);
  } catch (e) {
    console.error('Écran en échec —', e);
    current = null;
    content.innerHTML = `<section class="card">
      <div class="card-head"><h2>Cet écran n’a pas pu s’afficher</h2></div>
      <p>Le plus souvent, une version du logiciel vient d’être mise en ligne et
      votre navigateur en garde une partie de l’ancienne. Un rechargement complet
      suffit : <b>Ctrl + Maj + R</b> (ou <b>Cmd + Maj + R</b> sur Mac).</p>
      <p class="small muted">Si le message revient après le rechargement, ce n’est pas
      le cache — envoyez la ligne ci-dessous, elle nomme la cause :</p>
      <pre class="small">${esc(String(e && e.message || e))}</pre>
      <div class="toolbar"><button type="button" class="btn" id="ecran-recharger">Recharger la page</button></div>
    </section>`;
    const b = document.getElementById('ecran-recharger');
    if (b) b.onclick = () => location.reload();
  }
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
  // La bulle de messagerie vit sur <body>, hors de #content : elle reste en place
  // d'un écran à l'autre, donc un message en cours de frappe survit à une
  // vérification dans une fiche.
  monterBulle(document.body);
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
