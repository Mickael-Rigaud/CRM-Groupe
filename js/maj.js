// Détection d'une nouvelle version mise en ligne.
//
// ⚠ LE PROBLÈME QU'ON RÉSOUT, ET POURQUOI IL N'A PAS DE SOLUTION SIMPLE.
// GitHub Pages sert ce dépôt avec `Cache-Control: max-age=600` — dix minutes —
// et l'application charge ses modules ES **sans numéro de version**. Après une
// mise en ligne, le navigateur continue donc d'exécuter l'ancien code pendant
// dix minutes, sans rien afficher qui le signale. Ça a coûté trois allers-
// retours en deux jours (28, 29 et 30/09/2026), à chaque fois sur le même
// malentendu : « ça ne marche pas » alors que le code en ligne était juste.
//
// ⚠ NUMÉROTER LES FICHIERS EST IMPOSSIBLE ICI, et c'est la raison d'être de ce
// module. Le remède habituel — `app.js?v=12` — demande de réécrire l'URL de
// CHAQUE import à chaque livraison, donc une étape de build, que ce projet
// s'interdit. Une `importmap` ne sauve pas non plus : les imports d'ici sont
// relatifs (`./x.js`, `../data/y.js`) et se résolvent contre l'URL du module
// AVANT tout remappage.
//
// ⚠ ON NE PEUT PAS NON PLUS RACCOURCIR LE CACHE : l'en-tête vient de GitHub
// Pages, pas du dépôt.
//
// Ce qui reste, et ce que fait ce fichier : CONSTATER l'écart et le DIRE, puis
// offrir un rechargement qui contourne vraiment le cache.
import { esc } from './ui.js';

// ⚠ ON NE VÉRIFIE PAS EN BOUCLE : le contrôle part quand on REVIENT sur
// l'onglet, c'est-à-dire au moment où l'on se remet à travailler. Une minuterie
// ferait trente requêtes toutes les deux minutes sur un onglet que personne ne
// regarde. Le délai de garde évite d'enchaîner les contrôles quand on passe
// d'une fenêtre à l'autre.
const GARDE_MS = 2 * 60 * 1000;

// L'empreinte d'un fichier, telle que le serveur la donne. GitHub Pages rend un
// `ETag` ; un serveur de développement peut n'avoir que `Last-Modified`.
// ⚠ SANS L'UNE NI L'AUTRE ON IGNORE LE FICHIER plutôt que de deviner : un
// contrôle qui se trompe annoncerait une version qui n'existe pas, et la
// bannière cesserait d'être crue au deuxième faux signal.
const empreinte = (r) => r.headers.get('ETag') || r.headers.get('Last-Modified') || null;

// Les fichiers que l'application a réellement chargés, y compris ceux arrivés
// par import dynamique après le démarrage — d'où une relecture à chaque
// contrôle et non une liste figée.
function fichiers() {
  const base = location.origin;
  const vus = new Set([location.origin + location.pathname]);
  performance.getEntriesByType('resource').forEach(e => {
    if (!e.name.startsWith(base)) return;
    const sans = e.name.split('?')[0];
    if (/\.(js|css)$/i.test(sans)) vus.add(sans);
  });
  return [...vus];
}

// Ce que le navigateur EXÉCUTE. ⚠ `force-cache` est essentiel : un `fetch`
// ordinaire peut repartir au réseau si l'entrée a expiré et rapporter la
// version NEUVE, alors que le module en mémoire est l'ancien — on conclurait
// « rien de nouveau » précisément quand il y a du nouveau.
const empreintesLocales = async (liste) => {
  const paires = await Promise.all(liste.map(async u => {
    try { return [u, empreinte(await fetch(u, { cache: 'force-cache' }))]; }
    catch { return [u, null]; }
  }));
  return new Map(paires.filter(([, e]) => e));
};

// Ce que le serveur a. `no-store` ne lit ni n'écrit le cache : la réponse ne
// remplace pas la copie en place, donc constater ne change rien à ce qui tourne.
//
// ⚠ ON S'ARRÊTE AU PREMIER ÉCART, ET ON AVANCE PAR PETITS LOTS. L'application
// charge près de quatre-vingts modules : les interroger tous d'un coup ferait
// quatre-vingts requêtes parallèles à chaque retour sur l'onglet, qui
// passeraient devant celles d'une page en train de s'ouvrir. Un seul écart
// suffit à conclure — on n'a pas besoin de la liste complète, seulement de
// savoir qu'il y a du neuf.
//
// ⚠ EN PRATIQUE LE PREMIER LOT SUFFIT TOUJOURS SUR GITHUB PAGES : l'`ETag` y
// est `<horodatage du déploiement>-<taille>`, donc TOUS les fichiers changent
// d'empreinte à chaque mise en ligne, y compris ceux que le commit n'a pas
// touchés (vérifié : `app.js` et `btp-projet.js` portaient le même préfixe
// `6abccbbc` après une livraison qui ne modifiait que le second). On ne s'y
// FIE pas pour autant — la liste entière reste parcourue si besoin — mais
// c'est ce qui rend le contrôle bon marché.
const LOT = 8;

async function aDuNeuf(local) {
  const liste = [...local];
  for (let i = 0; i < liste.length; i += LOT) {
    const reponses = await Promise.all(liste.slice(i, i + LOT).map(async ([u, avant]) => {
      try {
        const r = await fetch(u, { method: 'HEAD', cache: 'no-store' });
        return r.ok && empreinte(r) && empreinte(r) !== avant;
      } catch { return false; } // hors ligne : on réessaiera au prochain retour
    }));
    if (reponses.some(Boolean)) return true;
  }
  return false;
}

function bandeau(surRechargement) {
  if (document.getElementById('maj-bandeau')) return;
  const el = document.createElement('div');
  el.id = 'maj-bandeau';
  el.className = 'maj-bandeau';
  el.innerHTML = `
    <span class="maj-texte">${esc('Une nouvelle version est en ligne.')}</span>
    <button type="button" class="maj-oui">Recharger</button>
    <button type="button" class="maj-non" aria-label="Plus tard">×</button>`;
  el.querySelector('.maj-non').onclick = () => el.remove();
  el.querySelector('.maj-oui').onclick = async () => {
    const b = el.querySelector('.maj-oui');
    b.disabled = true; b.textContent = 'Chargement…';
    await surRechargement();
  };
  document.body.appendChild(el);
}

export function surveillerVersion() {
  // Un onglet ouvert depuis longtemps a pu voir passer plusieurs mises en
  // ligne : on garde l'empreinte du DÉMARRAGE, jamais celle du dernier
  // contrôle, sinon un écart constaté puis ignoré ne se redirait plus.
  let local = null;
  let dernier = 0;
  let enCours = false;

  const controler = async () => {
    if (enCours || document.hidden) return;
    if (Date.now() - dernier < GARDE_MS) return;
    enCours = true;
    try {
      if (!local) local = await empreintesLocales(fichiers());
      // Un fichier arrivé depuis (import dynamique) entre dans le relevé sans
      // compter comme un écart : on ne connaît pas encore sa version d'origine.
      const neufs = fichiers().filter(u => !local.has(u));
      if (neufs.length) (await empreintesLocales(neufs)).forEach((e, u) => local.set(u, e));

      dernier = Date.now();
      if (await aDuNeuf(local)) {
        bandeau(async () => {
          // ⚠ C'EST `cache: 'reload'` QUI FAIT TOUT LE TRAVAIL : il va au réseau
          // sans regarder le cache ET REMPLACE l'entrée mise en cache. Le
          // `location.reload()` qui suit sert donc les fichiers neufs. Un
          // simple `location.reload()` seul ne suffirait pas : il revalide le
          // document, pas ses sous-ressources encore valides.
          await Promise.all(fichiers().map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
          location.reload();
        });
      }
    } finally { enCours = false; }
  };

  document.addEventListener('visibilitychange', controler);
  window.addEventListener('focus', controler);
  // Un premier contrôle à l'ouverture : la page a pu être servie depuis le
  // cache alors qu'une version plus récente était déjà en ligne.
  setTimeout(controler, 4000);
}
