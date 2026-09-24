// Espace RGD Renova — formations
//
// Quatre fiches de poste : conducteur de travaux, chargé d'affaires,
// sous-traitance, assistante administrative. Vingt fiches, cinquante-sept
// sections, reprises du tableau de bord le 21/09/2026.
//
// CE N'EST PAS UN ÉCRAN DE DONNÉES
// Aucune table, aucun relevé, rien à synchroniser : du texte que quelqu'un a
// écrit. Il n'y a donc pas de bandeau « lecture seule » — il n'y a rien qui
// puisse être écrasé. Le texte vit dans `js/data/rgd-formations.js`.
//
// ⚠ REFAIT LE 24/09/2026 SUR LA MAQUETTE DE MICKAEL — « je n'aime pas du tout
// comment c'est présenté ». Ce qu'il y avait avant : un bandeau technique, une
// rangée de quatre tuiles affichant « 5 » quatre fois, les quatre mêmes noms
// répétés juste en dessous en onglets, puis un accordéon. Six cents pixels
// avant la première ligne utile, et trois façons de dire la même chose.
//
// LA NOUVELLE FORME EST UN PARCOURS À TROIS NIVEAUX, et c'est ce qui la rend
// juste : une fiche de poste ne se consulte pas comme un tableau, elle se LIT
// en entier, du début à la fin, et se DONNE à quelqu'un qu'on recrute ou qu'on
// forme. D'où :
//   1. l'accueil — quatre cartes de métier, une par poste ;
//   2. la rubrique — les cinq fiches du poste en ÉTAPES, dans l'ordre ;
//   3. la fiche — le texte entier, sections numérotées, rien à déplier.
// L'accordéon faisait exactement l'inverse : il cachait le texte derrière un
// clic et ne disait jamais dans quel ordre lire.
//
// ⚠ L'ÉTAT EST DANS L'ADRESSE, PAS DANS UNE VARIABLE (`?poste=…&fiche=…`).
// C'est ce qui rend une fiche ENVOYABLE : « lis celle-là » se fait avec un
// lien. Le bouton « précédent » du navigateur remonte alors d'un niveau, ce
// qu'un état interne n'aurait pas donné — et le « ← Toutes les rubriques » de
// la maquette aurait été le seul chemin de retour. Le routeur retire déjà la
// chaîne de requête du nom de page (voir `route()` dans `app.js`), l'écran la
// relit lui-même.
//
// ⚠ LA FICHE S'IMPRIME, et c'est une fonction de l'écran, pas un accident du
// navigateur : `@media print` retire la navigation, les boutons et les fonds,
// remet les puces en liste, et pose un pied « Document interne · Édité le … ».
// C'est ce qui permet de tendre la fiche à un conducteur de travaux le jour de
// son arrivée sans lui ouvrir le CRM.
import { esc, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { RUBRIQUES } from '../data/rgd-formations.js';

// Le texte d'une fiche, pour la recherche. LES PUCES EN FONT PARTIE : une
// section porte soit un paragraphe (`contenu`), soit une liste (`puces`), et
// c'est la liste qui domine — 43 sections sur 57, 177 puces. Les oublier
// revenait à chercher dans un quart du référentiel.
const texteDe = (f) => [f.titre, f.resume,
  ...(f.sections || []).flatMap(s => [s.titre, s.contenu, ...(s.puces || [])])];

const TOTAL = RUBRIQUES.reduce((t, r) => t + r.fiches.length, 0);

const lien = (poste, fiche) => '#/rgd/formations'
  + (poste ? `?poste=${encodeURIComponent(poste)}` : '')
  + (poste && fiche != null ? `&fiche=${fiche}` : '');

const jourFr = () => new Date().toLocaleDateString('fr-FR',
  { day: '2-digit', month: '2-digit', year: 'numeric' });

// ------------------------------------------------------------------- niveau 1
const accueil = (vues, cherche, state) => `
  <header class="fo-intro">
    <p class="fo-surtitre">Centre de ressources</p>
    <h1>Formations métiers</h1>
    <p class="fo-chapo">Fiches synthétiques par poste pour élever le niveau technique
    de l’équipe. Chaque fiche s’imprime ou s’enregistre en PDF pour être remise
    à quelqu’un qui arrive.</p>
    ${searchInput('fo-q', state, 'Rechercher dans les vingt fiches…')}
  </header>

  ${cherche ? resultats(vues, state.q) : `
    <div class="fo-metiers">
      ${RUBRIQUES.map(r => `
        <a class="fo-metier" href="${lien(r.key)}" style="--tint:${esc(r.tint)}">
          <span class="fo-ico">${r.icon}</span>
          <p class="fo-surtitre">Fiche métier</p>
          <h2>${esc(r.titre)}</h2>
          <p class="fo-desc">${esc(r.description)}</p>
          <footer>
            <span class="fo-pastille">${r.fiches.length} fiches</span>
            <span class="grow"></span>
            <span class="fo-suite">Explorer →</span>
          </footer>
        </a>`).join('')}
    </div>`}`;

/** Les fiches trouvées, toutes rubriques confondues : personne ne sait dans
 *  quel poste dort la réponse, et l'obliger à chercher quatre fois serait lui
 *  faire faire le travail de l'écran. */
const resultats = (vues, q) => {
  const n = vues.reduce((t, r) => t + r.index.length, 0);
  if (!n) return `<div class="card"><div class="empty">Aucune fiche ne parle de « ${esc(q)} ».</div></div>`;
  return `<p class="muted small fo-compte">${n} fiche${n > 1 ? 's' : ''} sur ${TOTAL}, toutes rubriques</p>
    ${vues.map(r => `
      <section class="fo-groupe" style="--tint:${esc(r.tint)}">
        <h2><span class="fo-ico-s">${r.icon}</span> ${esc(r.titre)}</h2>
        ${grilleFiches(r, r.index)}
      </section>`).join('')}`;
};

// ------------------------------------------------------------------- niveau 2
const rubrique = (r) => `
  <a class="fo-retour" href="#/rgd/formations">← Toutes les rubriques</a>

  <header class="fo-banniere" style="--tint:${esc(r.tint)}">
    <span class="fo-ico">${r.icon}</span>
    <div>
      <h1>${esc(r.titre)}</h1>
      <p class="fo-desc">${esc(r.description)}</p>
      <p class="fo-surtitre">${r.fiches.length} fiches à explorer</p>
    </div>
  </header>

  <div style="--tint:${esc(r.tint)}">${grilleFiches(r, r.fiches.map((_, i) => i))}</div>`;

/** Les fiches d'un poste, en cartes. Le numéro n'est pas décoratif : les cinq
 *  fiches suivent le déroulé du métier — préparation, suivi, réception — et se
 *  lisent dans cet ordre. « Étape » le dit, « Fiche 3 » ne l'aurait pas dit. */
const grilleFiches = (r, index) => `
  <div class="fo-fiches">
    ${index.map(i => {
      const f = r.fiches[i];
      return `<a class="fo-carte" href="${lien(r.key, i)}">
        <span class="fo-etape">Étape ${i + 1}</span>
        <h3>${esc(f.titre)}</h3>
        ${f.resume ? `<p class="fo-desc">${esc(f.resume)}</p>` : ''}
        <span class="fo-suite">Lire la fiche →</span>
      </a>`;
    }).join('')}
  </div>`;

// ------------------------------------------------------------------- niveau 3
const fiche = (r, i) => {
  const f = r.fiches[i];
  const prec = i > 0 ? r.fiches[i - 1] : null;
  const suiv = i < r.fiches.length - 1 ? r.fiches[i + 1] : null;
  return `
  <div class="fo-barre">
    <a class="fo-retour" href="${lien(r.key)}">← ${esc(r.titre)}</a>
    <span class="grow"></span>
    <button type="button" class="btn ghost sm" id="fo-imprimer">🖨 Imprimer / PDF</button>
  </div>

  <article class="fo-doc" style="--tint:${esc(r.tint)}">
    <header class="fo-doc-tete">
      <span class="fo-ico">${r.icon}</span>
      <div>
        <p class="fo-surtitre">${esc(r.titre)} · Étape ${i + 1} sur ${r.fiches.length}</p>
        <h1>${esc(f.titre)}</h1>
        ${f.resume ? `<p class="fo-desc">${esc(f.resume)}</p>` : ''}
      </div>
    </header>

    <div class="fo-doc-corps">
      ${(f.sections || []).map((s, n) => `
        <section class="fo-sec">
          <h2><span class="fo-num">${n + 1}</span> ${esc(s.titre)}</h2>
          ${s.contenu ? `<p>${esc(s.contenu)}</p>` : ''}
          ${(s.puces || []).length ? `<ul class="fo-puces">${
            s.puces.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </section>`).join('')}
    </div>

    <footer class="fo-doc-pied">
      <span>RGD Renova · ${esc(r.titre)}</span>
      <span class="grow"></span>
      <span>Document interne · Édité le ${jourFr()}</span>
    </footer>
  </article>

  <nav class="fo-suivant">
    ${prec ? `<a class="btn ghost" href="${lien(r.key, i - 1)}">← ${esc(prec.titre)}</a>` : '<span></span>'}
    <span class="grow"></span>
    ${suiv ? `<a class="btn ghost" href="${lien(r.key, i + 1)}">${esc(suiv.titre)} →</a>` : ''}
  </nav>`;
};

export const rgdFormationsPage = {
  title: () => 'RGD Renova — Formations',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { q: '', focus: null };

    const draw = () => {
      // L'adresse fait foi, pas une variable : une fiche ouverte doit pouvoir
      // s'envoyer par message, et le bouton « précédent » doit remonter.
      const p = new URLSearchParams(location.hash.split('?')[1] || '');
      const r = RUBRIQUES.find(x => x.key === p.get('poste'));
      const i = Number(p.get('fiche'));
      const surFiche = r && p.get('fiche') !== null && r.fiches[i];

      const ts = terms(state.q);
      const cherche = !r && ts.length > 0;
      // ⚠ ON FILTRE DES INDEX, PAS LA LISTE. Le rang d'une fiche EST son
      // « Étape n » et la clé de son adresse : filtrer `fiches` puis lire
      // l'index dans la liste réduite aurait renuméroté les résultats et
      // ouvert la mauvaise fiche — la troisième trouvée pointant sur la
      // troisième du poste.
      const vues = cherche
        ? RUBRIQUES
            .map(x => ({ ...x, index: x.fiches.map((f, n) => n).filter(n => hit(texteDe(x.fiches[n]), ts)) }))
            .filter(x => x.index.length)
        : [];

      const corps = surFiche ? fiche(r, i)
        : r ? rubrique(r)
        : accueil(vues, cherche, state);

      root.innerHTML = cadre('#/rgd/formations', 'Formations', corps);
      if (!r) { bindSearch(root, 'fo-q', state, draw); restoreFocus(root, state); }
      const imp = root.querySelector('#fo-imprimer');
      if (imp) imp.onclick = () => window.print();
    };

    // Un clic sur une carte change le hash, donc le routeur relance `render()`
    // en entier : rien à écouter ici. La recherche, elle, redessine sur place.
    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
