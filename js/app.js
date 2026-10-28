// Point d'entrée : authentification, navigation (routes #/…), mise en page.
import { CONFIG } from './config.js';
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { ACTIVITIES, ROLES } from './data/schema.js';
import { esc, toast, isoDay, daysSince, closeModal, openModal } from './ui.js';
import { pages } from './pages/index.js';
import { messagesNonLus, monterBulle } from './pages/messagerie.js';
import { icon } from './icons.js';
import { actualiser, poserGesteActualiser } from './actualiser.js';
import { surveillerVersion } from './maj.js';
import { monterRappels, demonterRappels } from './rappels.js';


// ⚠ L'ADRESSE D'ARRIVÉE EST CAPTURÉE ICI, AVANT TOUT LE RESTE, ET C'EST CE QUI
// REND POSSIBLE DEUX CHOSES QUI ONT MANQUÉ (28-29/09/2026).
//
// Le client Supabase examine le fragment à sa création pour y trouver une
// session, puis **l'efface**. Tout code qui lit `location.hash` après lui lit
// une adresse vide — et se trompe en silence, puisque le reste marche.
//
// Deux lecteurs en dépendent : le message d'un lien périmé (`refusDeLien`) et
// la reconnaissance d'un retour de lien (`retourDeLien`), qui déclenche le
// formulaire de mot de passe. Le second avait été oublié : la personne
// arrivait, se retrouvait connectée, et **on ne lui demandait jamais de
// choisir un mot de passe**.
const HASH_AU_DEMARRAGE = location.hash || '';

const app = document.getElementById('app');
let current = null; // page en cours
let unsubscribe = null;

// ---------- Connexion ----------
function renderLogin(error = '') {
  const users = db.t('profiles');
  app.innerHTML = `<div class="login"><div class="card">
    <div class="brand"><div class="logo">${esc(CONFIG.APP_NAME)}</div><small>RGD Renova · BTP Expertise · La Référence Courtage · Propulsion</small></div>
    <!-- Un refus se dit avant le formulaire, et dans les DEUX modes : il etait
         enferme dans la branche non-demo, donc invisible a la demonstration —
         c'est-a-dire au seul endroit ou l'on peut l'eprouver sans casser un
         vrai lien. Un message d'erreur qu'on ne peut pas essayer finit par ne
         plus s'afficher sans que personne le remarque. -->
    ${error ? `<p class="mf-aide attention" style="margin:0 0 14px">${esc(error)}</p>` : ''}
    ${db.demo ? `
      <p class="muted small">Mode démo — données d'exemple stockées dans ce navigateur. Choisissez un profil pour tester les droits :</p>
      <div class="userpick">${users.map(u => `<button data-u="${u.id}"><span class="avatar">${esc(u.full_name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><span><b>${esc(u.full_name)}</b><small>${esc(ROLES[u.role]?.label || u.role)} — ${esc(ROLES[u.role]?.description || '')}</small></span></button>`).join('')}</div>
    ` : `
      <form id="login-form" class="form">
        <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="username"></div>
        <div class="field"><label>Mot de passe</label><input type="password" name="password" required autocomplete="current-password"></div>
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
    try { const u = await db.signIn(f.get('email'), f.get('password')); if (!u) throw new Error('Profil utilisateur introuvable — demandez à la direction de créer votre profil.'); await db.loadAll(u); start(u); }
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
// ⚠ L'OUVRIER NE VOIT QUE SES ÉCRANS (27/10/2026) : la liste est dans
// `scope.ouvrierPeut`, une seule source pour le menu et le routeur.
const pourOuvrier = (hash) => !scope.isOuvrier || scope.ouvrierPeut(hash);
const itemsOf = (g) => (g.items || []).filter(i => (!i.direction || scope.isDirection) && (!i.activity || scope.activityKeys.includes(i.activity)) && pourOuvrier(i.hash));
const groups = () => NAV.filter(g => !g.show || g.show()).filter(g => !g.hash || pourOuvrier(g.hash)).filter(g => !g.items || itemsOf(g).length);
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
    <nav class="barre-bas" id="barre-bas" aria-label="Navigation principale"></nav>
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
// ⚠ CE QUI EST DEJA SOUS LE POUCE NE SE REPETE PAS DANS LE MENU (28/10/2026,
// Elodie : « je voudrais que le menu soit plus allege et clair, la je trouve
// qu'il y a trop d'elements »). Quatre des sept univers sont les quatre
// entrees de la barre du bas — Accueil, To do, Pilotage, Messages : les
// reprendre dans le tiroir allongeait la liste d'un tiers sans rien ouvrir de
// nouveau. On ne retire donc AUCUN acces, on retire une redite.
//
// ⚠ « Pilotage » RESTE, ET CE N'EST PAS UNE EXCEPTION ARBITRAIRE : c'est la
// SEULE porte pour changer de structure sur telephone (ses entrees sont RGD,
// BTP, Courtage, Propulsion). Le bouton de la barre du bas, lui, mene a la
// structure ou l'on est deja. Le retirer enfermerait dans son espace.
//
// ⚠ ET IL NE S'AGIT PAS DE RELIRE `BAS_CRM` ICI : la barre de l'application
// RGD (`BAS_RGD`) ne porte pas les memes entrees, et un ouvrier n'en voit pas
// toutes. On nomme donc les deux qui se repetent VRAIMENT dans les deux
// barres, et `Messagerie` qui y est aussi.
const TIROIR_SANS = new Set(['home', 'today', 'messagerie']);
// ⚠ ET « Pilotage » DISPARAIT AUSSI QUAND IL N'Y A QU'UNE STRUCTURE : il n'est
// garde que pour CHANGER d'espace, et on ne change pas pour celui ou l'on est.
// Chez un ouvrier de RGD, il affichait « Pilotage » puis « RGD Renova » en
// dessous — deux lignes pour l'ecran que le pouce ouvre deja depuis la barre
// du bas.
const montrerDansLeTiroir = (g) => !g.bottom && !TIROIR_SANS.has(g.key)
  && !(g.key === 'commercial' && itemsOf(g).length < 2);

function renderTiroir(gs, here, hash, u, ini) {
  const hote = document.getElementById('tiroir'); if (!hote) return;
  document.body.classList.toggle('tiroir-ouvert', navState.tiroir);
  if (!navState.tiroir) { hote.innerHTML = ''; hote.hidden = true; return; }
  hote.hidden = false;

  // ⚠ SOUS LA STRUCTURE **SEULEMENT S'IL Y EN A PLUSIEURS**, et c'est la demande
  // mot pour mot : « quand il y a plusieurs structures ». Chez quelqu'un qui
  // n'en a qu'une, « Pilotage » ne s'affiche pas du tout (voir
  // `montrerDansLeTiroir`) — y ranger ses écrans les ferait DISPARAÎTRE. Ils
  // restent donc en tête du tiroir pour lui, où ils sont sans ambiguïté :
  // il n'y a pas d'autre entreprise à confondre.
  const sousLaStructure = gs.some(g => g.key === 'commercial' && montrerDansLeTiroir(g));

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
      const ici = isOn(i, hash);
      // ⚠ LES ÉCRANS DE LA STRUCTURE SE RANGENT SOUS ELLE (28/10/2026, Élodie :
      // « je trouve ça bizarre d'avoir le menu au-dessus de l'activité. On ne
      // pourrait pas plutôt mettre le menu de l'activité correspondante en
      // dessous de l'entreprise dans pilotage ? »). Ils étaient en TÊTE du
      // tiroir, donc avant la ligne dont ils dépendent : on lisait vingt écrans
      // sans savoir de quelle entreprise, puis on trouvait l'entreprise plus
      // bas. L'ordre dit maintenant l'appartenance.
      const dedans = ici && sousLaStructure ? ecransDeLEspace(false) : '';
      return `<a href="${i.hash}" class="tir-ecran ${ici ? 'on' : ''}">${mark}<span>${esc(i.label)}</span>${c ? `<i>${c}</i>` : ''}</a>${dedans}`;
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
      ${'' /* ⚠ UN SEUL BLOC QUI DEFILE (28/10/2026) : les ecrans de l'espace et
         les univers etaient deux fenetres a ascenseur, posees l'une sur
         l'autre dans 310 px de large. Voir `.tir-corps` dans app.css. */}
      <div class="tir-corps">
        ${sousLaStructure ? '' : ecransDeLEspace(true)}
        <nav class="tir-nav" aria-label="Univers">${gs.filter(montrerDansLeTiroir).map(ligne).join('')}</nav>
      </div>
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
    document.getElementById('msg-bulle')?.remove(); demonterRappels(); renderLogin();
  });
}

// Les écrans de l'espace ouvert (RGD Renova, BTP Expertise, La Référence
// Courtage), en tête du tiroir. ⚠ SUR TÉLÉPHONE, LE MENU DE L'ESPACE N'EST
// PLUS AFFICHÉ DANS LA PAGE (27/10/2026, Élodie : « trop de bandeaux en
// haut ») : il faisait une bande noire qui défilait de côté, et on n'y voyait
// que deux entrées et demie. Il vit désormais ici, en entier et dans l'ordre.
// Lu dans la page plutôt que recopié : c'est `coquilleEspace` qui sait quelles
// entrées ce profil peut voir, et il n'y aurait pas deux listes à tenir.
function ecransDeLEspace(avecLaMarque) {
  const nav = document.querySelector('#content .esp-side-nav');
  if (!nav) return '';
  // ⚠ LE NOM DE L'ENTREPRISE NE SE RÉPÈTE PAS quand le bloc est rangé SOUS la
  // ligne qui le porte déjà : « RGD Renova » suivi de « RGD Renova » se lirait
  // comme deux niveaux là où il n'y en a qu'un.
  const marque = document.querySelector('#content .esp-side-brand b')?.textContent || '';
  const lien = (a) => `<a href="${esc(a.getAttribute('href'))}" class="tir-ecran ${a.classList.contains('on') ? 'on' : ''}"><span>${esc(a.textContent.trim())}</span></a>`;
  // ⚠ UN GROUPE SE REPLIE, SAUF CELUI OU L'ON EST (28/10/2026). L'espace RGD
  // compte vingt ecrans : tout deplier faisait un menu de trente lignes ou l'on
  // ne retrouvait plus la sienne — le reproche exact d'Elodie. Le groupe qui
  // porte l'ecran ouvert reste deplie, les autres se touchent pour s'ouvrir.
  //
  // ⚠ `<details>` PLUTOT QU'UN ETAT EN MEMOIRE, et c'est ce qui rend la chose
  // sure : le navigateur garde l'ouverture tant que le noeud vit, il n'y a
  // aucun registre a tenir, et toucher une entree ferme le tiroir de toute
  // facon. Un `Set` ici aurait survecu a la fermeture du menu et rouvert des
  // groupes qu'on avait laisses fermes.
  const blocs = [...nav.children].map(el => {
    if (el.matches('a')) return lien(el);
    const titre = el.querySelector('.esp-side-titre')?.textContent.trim();
    const as = [...el.querySelectorAll('a')];
    const liens = as.map(lien).join('');
    if (!titre) return liens;
    // ⚠ UN GROUPE DE UNE OU DEUX ENTREES NE SE REPLIE PAS : le titre et son
    // chevron prennent autant de place que ce qu'ils cachent, et il faudrait
    // un geste pour atteindre un ecran qui tenait deja sous les yeux. C'est le
    // cas du menu de l'ouvrier, qui ne porte que trois ecrans en tout.
    if (as.length < 3) return `<span class="tir-esp-titre">${esc(titre)}</span>${liens}`;
    const ici = as.some(a2 => a2.classList.contains('on'));
    return `<details class="tir-grp"${ici ? ' open' : ''}>
      <summary class="tir-esp-titre">${esc(titre)}<i>${as.length}</i></summary>${liens}</details>`;
  }).join('');
  return `<nav class="tir-espace ${avecLaMarque ? '' : 'est-imbrique'}" aria-label="Écrans ${esc(marque)}">
    ${avecLaMarque ? `<span class="tir-esp-marque">${esc(marque)}</span>` : ''}${blocs}</nav>`;
}

// ---------- Barre du bas (téléphone) ----------
// Demandée le 27/10/2026 (Élodie : une application « intuitive » sur téléphone
// et tablette). Les quatre écrans qu'on ouvre le plus, sous le pouce, et
// « Menu » pour tout le reste : c'est le tiroir, qui garde toute la carte.
// Elle n'existe qu'en dessous de 820 px — le CSS la cache ailleurs
// (`css/mobile.css`) —, le grand écran garde ses deux bandes du haut.
//
// ⚠ DEUX APPLICATIONS, UNE SEULE BARRE À CHANGER : `rgd.html` est le même CRM
// ouvert sur l'espace RGD (son nom et son icône sont dans manifest-rgd.json).
// Seules ses quatre entrées diffèrent. Quelqu'un qui n'a pas RGD dans ses
// activités retombe sur la barre du CRM.
const APPLI_RGD = /\/rgd\.html$/.test(location.pathname);
const BAS_CRM = [
  { cle: 'home', hash: '#/home', icon: 'home', label: 'Accueil' },
  { cle: 'today', hash: '#/today', icon: 'check', label: 'To do', count: () => NAV[1].count() },
  { cle: 'commercial', icon: 'kanban', label: 'Pilotage' },
  { cle: 'messagerie', hash: '#/messagerie', icon: 'chat', label: 'Messages', count: () => messagesNonLus() },
];
const BAS_RGD = [
  { hash: '#/rgd', icon: 'home', label: 'Accueil', ici: (h) => h === '#/rgd' || h.startsWith('#/rgd/pilotage') },
  { hash: '#/rgd/clients', icon: 'users', label: 'Clients' },
  { hash: '#/rgd/chantiers', icon: 'kanban', label: 'Pipeline' },
  { hash: '#/rgd/agenda', icon: 'calendar', label: 'Agenda' },
];
const appliRgd = () => APPLI_RGD && scope.activityKeys.includes('rgd');

function renderBarreBas(gs, here, hash) {
  const hote = document.getElementById('barre-bas'); if (!hote) return;
  const entrees = appliRgd()
    ? BAS_RGD.filter(e => pourOuvrier(e.hash)).map(e => ({ ...e, on: e.ici ? e.ici(hash) : hash.startsWith(e.hash) }))
    : BAS_CRM.map(e => {
      // Pilotage mène au premier écran de son univers, comme son onglet du haut.
      const g = gs.find(x => x.key === e.cle);
      if (!g || (e.hash && !pourOuvrier(e.hash))) return null;
      return { ...e, hash: e.hash || g.hash || itemsOf(g)[0].hash, on: here?.key === e.cle };
    }).filter(Boolean);
  hote.innerHTML = entrees.map(e => {
    const n = e.count ? e.count() : 0;
    return `<a href="${e.hash}" class="bb-lien ${e.on ? 'on' : ''}" ${e.on ? 'aria-current="page"' : ''}>
      <span class="bb-ico">${icon(e.icon, 22)}${n ? `<i>${n > 99 ? '99+' : n}</i>` : ''}</span><span>${esc(e.label)}</span></a>`;
  }).join('') + `<button type="button" class="bb-lien ${navState.tiroir ? 'on' : ''}" id="bb-menu" aria-expanded="${navState.tiroir}">
      <span class="bb-ico">${icon('menu', 22)}</span><span>Menu</span></button>`;
  hote.querySelector('#bb-menu').onclick = () => { navState.tiroir = !navState.tiroir; navState.open = null; renderNav(); };
  // Toucher l'écran où l'on est déjà ramène en haut de page, comme partout ailleurs.
  hote.querySelectorAll('a.bb-lien.on').forEach(a => a.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })));
  document.body.classList.toggle('appli-rgd', appliRgd());
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
    <span class="u-ici">${esc(appliRgd() && hash.startsWith('#/rgd') ? ACTIVITIES.rgd.label : here?.label || CONFIG.APP_NAME)}</span>
    <nav class="u-set" aria-label="Univers">${gs.filter(g => !g.bottom).map(tab).join('')}</nav>
    <div class="u-right">
      ${gs.filter(g => g.bottom).map(g => `<a href="${g.hash}" class="u-ico ${here?.key === g.key ? 'on' : ''}" title="${esc(g.label)}" aria-label="${esc(g.label)}">${icon(g.icon, 18)}</a>`).join('')}
      <div class="acct" id="acct">
        <button type="button" class="u-me" id="me-btn" aria-expanded="${navState.open === '__me'}"><span class="av">${esc(ini)}</span><span class="nm">${esc((u.full_name || '').split(' ')[0])}</span></button>
        ${navState.open === '__me' ? `<div class="acct-menu">
          <div class="acct-head"><div class="role">${esc(ROLES[u.role]?.label || u.role)}</div><div class="name">${esc(u.full_name)}</div>${u.email ? `<div class="mail">${esc(u.email)}</div>` : ''}</div>
          <button type="button" class="acct-act" id="actu">↻ Actualiser l’application</button>
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
  renderBarreBas(gs, here, hash);

  // Garder l'onglet courant sous les yeux quand les barres défilent (mobile)
  for (const el of [univ.querySelector('.u-tab.on'), sub.querySelector('.s-tab.on')]) {
    const box = el?.parentElement;
    if (el && box && box.scrollWidth > box.clientWidth) el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  univ.querySelector('#burger').onclick = () => { navState.tiroir = !navState.tiroir; navState.open = null; renderNav(); };
  univ.querySelector('#me-btn').onclick = () => { navState.open = navState.open === '__me' ? null : '__me'; renderNav(); };
  // ⚠ L'ENTRÉE DU MENU DOUBLE LE GESTE, ELLE NE LE REMPLACE PAS : le geste
  // n'existe qu'au doigt, et l'application se consulte aussi au bureau.
  univ.querySelector('#actu')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = 'Actualisation…';
    try {
      const { recharge } = await actualiser();
      // Si la page recharge, inutile de remettre le bouton : il disparaît avec.
      if (!recharge) { closeMenu(); toast('Application à jour'); }
    } catch {
      b.disabled = false; b.textContent = '↻ Actualiser l’application';
      toast('Actualisation impossible — réseau indisponible');
    }
  });
  univ.querySelector('#pwd')?.addEventListener('click', () => { closeMenu(); passwordForm(false); });
  univ.querySelector('#logout')?.addEventListener('click', async () => { await db.signOut(); location.hash = ''; scope.set(null); navState.open = null; document.getElementById('msg-bulle')?.remove(); demonterRappels(); renderLogin(); });
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
  // Un écran fermé à l'ouvrier — y compris l'accueil `#/home` par défaut — le
  // renvoie à l'espace RGD, ou à sa to do list s'il n'a pas RGD.
  if (scope.isOuvrier && !scope.ouvrierPeut(hash)) { location.hash = scope.accueilOuvrier; return; }
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
  // ⚠ « NOUVEAU mot de passe » ÉTAIT FAUX POUR LA MOITIÉ DES CAS. Ce formulaire
  // s'ouvre sur DEUX arrivées : quelqu'un qui découvre le CRM et n'en a jamais
  // eu, et quelqu'un qui a oublié le sien. Un titre qui parle de « nouveau »
  // fait chercher l'ancien au premier, qui n'existe pas. Le titre retenu est
  // vrai dans les deux cas, et la phrase dessous dit à quoi il sert — c'est
  // l'écran où quelqu'un entre pour la première fois dans l'outil.
  const m = openModal(forced ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe', `<form class="form" id="pw-form">
    ${forced ? '<p class="mf-aide" style="flex-basis:100%">Il vous servira à vous connecter au CRM Groupe. Votre espace est déjà prêt : il s\'ouvrira juste après.</p>' : ''}
    <div class="field"><label>Mot de passe (8 caractères minimum)</label><input type="password" name="p1" required minlength="8" autocomplete="new-password"></div>
    <div class="field"><label>Confirmer</label><input type="password" name="p2" required minlength="8" autocomplete="new-password"></div>
    <div class="form-actions">${forced ? '' : '<button type="button" class="btn ghost" data-close>Annuler</button>'}<button class="btn" type="submit">Enregistrer</button></div></form>`);
  // ⚠ LE BOUTON « ANNULER » ÉTAIT RETIRÉ, LA CROIX NON — et la croix ferme
  // aussi bien. Quelqu'un qui arrive par son lien pouvait donc entrer sans
  // jamais poser de mot de passe, c'est-à-dire repartir sans pouvoir se
  // reconnecter : exactement ce que ce formulaire existe pour éviter. On ôte
  // la croix et on neutralise le clic sur le fond.
  //
  // Ce n'est pas un verrou et ça ne prétend pas l'être : la session est ouverte,
  // un rechargement laisse entrer. C'est une porte qu'on ne montre plus, pas
  // une porte qu'on ferme — et à cet instant précis, c'est ce qu'il faut.
  if (forced) {
    m.querySelector('.modal-head [data-close]')?.remove();
    const fond = m.parentElement;
    fond?.addEventListener('click', (e) => {
      if (e.target === fond) e.stopImmediatePropagation();
    }, true);
  }

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
  // Le geste « tirer vers le bas », posé une seule fois, à l'ouverture d'une
  // session : avant la connexion il n'y a rien à actualiser.
  poserGesteActualiser();
  renderLayout();
  // La bulle de messagerie vit sur <body>, hors de #content : elle reste en place
  // d'un écran à l'autre, donc un message en cours de frappe survit à une
  // vérification dans une fiche.
  monterBulle(document.body);
  // Les échéances des tâches, au-dessus de la bulle : voir js/rappels.js.
  monterRappels(document.body);
  probeLogos();
  unsubscribe?.();
  unsubscribe = db.onChange(() => { renderNav(); current?.refresh?.(); });
  // L'application RGD s'ouvre sur son espace, pas sur le tableau du groupe.
  if (appliRgd() && !location.hash) history.replaceState(null, '', location.pathname + location.search + '#/rgd');
  route();
  db.ecouterLesChangements();
  if (retourDeLien()) setTimeout(() => passwordForm(true), 300);
}

window.addEventListener('hashchange', route);

// Derrière une ouverture sur la copie locale. Le profil d'abord : supprimé, on
// déconnecte ; modifié (rôle, accès), on repart du profil neuf, car les droits
// de tout l'écran en dépendent. Hors ligne, on garde la copie à l'écran.
async function rafraichirApresCopie(copie) {
  let u;
  try { u = await db.currentUser(); } catch { return; }
  if (!u) { await db.signOut(); location.reload(); return; }
  try { await db.rafraichirTout(u); } catch { return; }
  if (JSON.stringify(u) !== JSON.stringify(copie)) { await db.memoriser(u, 0); location.reload(); }
}

// Copie locale du CODE : voir sw.js. On lui passe la liste de ce que la page a
// chargé, puisque la toute première ouverture ne passe pas encore par lui.
// ⚠ PAS EN DÉMO : servie depuis un dossier de test, la copie survivrait aux
// modifications qu'on y fait et fausserait l'essai suivant.
function garderLeCode() {
  if (db.demo || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(() => navigator.serviceWorker.ready).then((reg) => {
    setTimeout(() => {
      const adresses = performance.getEntriesByType('resource').map(e => e.name).concat(location.href);
      reg.active?.postMessage({ type: 'garder', adresses });
    }, 5000);
  }).catch(() => { /* sans service worker, le CRM marche comme avant */ });
}

// Un lien d'accès qui n'a pas abouti, DIT EN FRANÇAIS.
//
// ⚠ CE SILENCE A COÛTÉ DEUX JOURS (28-29/09/2026). Quand un lien d'invitation
// ou de réinitialisation est périmé ou déjà servi, la plateforme renvoie bien
// au CRM — mais avec l'échec rangé dans l'adresse
// (`#error=access_denied&error_code=otp_expired&…`). Le CRM l'ignorait et
// affichait un écran de connexion nu : la personne voyait un formulaire vide
// et n'avait aucun moyen de savoir que son lien était mort, ni qu'il fallait
// en redemander un. Elle réessayait le même, évidemment.
//
// ⚠ ET C'EST DANS LE FRAGMENT, PAS DANS LA REQUÊTE : après `#`, donc jamais
// envoyé au serveur — seul le navigateur le voit, et seul ce code peut le lire.
// Arrive-t-on d'un lien d'accès ? Si oui, la personne doit choisir un mot de
// passe avant de faire quoi que ce soit.
//
// ⚠ `invite` AUTANT QUE `recovery`, ET L'OUBLI SE PAIE SUR LE PREMIER CAS.
// `db.isRecovery()` ne connaissait que `recovery` : quelqu'un qui ouvre une
// INVITATION (compte neuf, aucun mot de passe) arrivait donc connecté, sans
// qu'on lui en demande un — il ne pouvait plus jamais se reconnecter seul une
// fois la session expirée. C'est le cas de tout nouvel arrivant.
//
// ⚠ ET ON LIT L'INSTANTANÉ, PAS `location.hash` : le client Supabase a déjà
// effacé le fragment quand `start()` s'exécute. C'est exactement pour ça que
// le formulaire ne s'ouvrait pas, alors que le lien fonctionnait.
//
// `db.isRecovery()` reste consulté en second : il regarde aussi la chaîne de
// requête, que le client, lui, ne touche pas.
function retourDeLien() {
  return /(^|[#&])type=(recovery|invite)/.test(HASH_AU_DEMARRAGE) || db.isRecovery();
}

function refusDeLien() {
  const brut = HASH_AU_DEMARRAGE.replace(/^#/, '');
  if (!/(^|&)error/.test(brut)) return '';
  const p = new URLSearchParams(brut);
  const code = p.get('error_code') || '';
  // On efface l'adresse pour qu'un rechargement ne réaffiche pas l'erreur
  // d'un lien qu'on a depuis remplacé.
  history.replaceState(null, '', location.pathname + location.search);
  if (/expired|otp/.test(code)) {
    return "Ce lien d'accès n'est plus valable : il a déjà servi, ou il a plus de 24 heures. "
         + 'Demandez-en un nouveau à la direction (Réglages → Utilisateurs → « Renvoyer le lien d\'accès »).';
  }
  return p.get('error_description')
    ? `Le lien n'a pas abouti : ${p.get('error_description')}`
    : "Le lien d'accès n'a pas abouti. Demandez-en un nouveau à la direction.";
}

(async () => {
  try {
    // Dit quand une nouvelle version est en ligne : voir js/maj.js.
    surveillerVersion();
    await db.init();
    // En démo, les données sont locales et `currentUser` les lit : on charge
    // d'abord. En production, on regarde d'abord s'il y a une session, et on ne
    // charge qu'une fois — et seulement si quelqu'un est connecté. Le
    // chargement fait avant la session partait pour rien (RLS renvoie vide sans
    // elle), puis recommençait en entier une fois connecté : deux fois les
    // 75 tables à chaque ouverture. Le formulaire de connexion charge de son côté.
    if (db.demo) await db.loadAll();
    garderLeCode();
    // Ouverture sur la copie locale : l'écran s'affiche avec ce que l'appareil a
    // gardé de la dernière fois, et tout se recharge derrière (voir
    // `db.reprendreCopie`). Pas sur un retour de lien : la session vient de
    // changer de mains, la copie peut être celle de quelqu'un d'autre.
    const copie = retourDeLien() ? null : await db.reprendreCopie();
    if (copie) { start(copie); rafraichirApresCopie(copie); return; }
    const u = await db.currentUser();
    if (u) { if (!db.demo) await db.loadAll(u); start(u); } else renderLogin(refusDeLien());
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="login"><div class="card"><h2>Erreur de démarrage</h2><p>${esc(e.message)}</p><p class="muted small">Vérifiez la configuration dans <code>js/config.js</code>.</p></div></div>`;
  }
})();
