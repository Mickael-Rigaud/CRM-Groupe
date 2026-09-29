// Le schema dessine du bien, pour l'etape « Le desordre » de la fiche projet.
//
// ⚠ C'EST UNE COUPE SCHEMATIQUE, PAS UN PLAN. Le CRM connait le type de bien,
// la surface et le nombre de pieces ; il ne connait NI la forme des murs, NI
// leur disposition. Le dessin respecte les trois groupes du modele
// (principales / service / annexes) et ne pretend a aucune disposition reelle
// — c'est ce qui le rend juste quel que soit le logement.
//
// ⚠ CE MODULE NE PORTE AUCUN ETAT : il recoit la liste des espaces et rend du
// SVG. Les clics sont branches par `btp-projet.js` sur `[data-espace]`, le meme
// attribut que les cartes, pour qu'il n'y ait qu'un seul gestionnaire.
//
// ⚠ UNE COUPE QUI CONTREDIT LA REALITE PHYSIQUE SE LIT PLUS MAL QU'UNE LISTE :
// premiere version, la cave flottait AU-DESSUS du trait de terre et
// l'exterieur etait un rectangle pose a cote, qui se lisait comme une piece de
// plus. Constate en fabriquant une planche des quatre types et en la regardant,
// pas en relisant le code.

const W = 900, H = 520;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const pastille = (n, cx, cy) => (n
  ? `<circle class="pl-pt" cx="${cx}" cy="${cy}" r="9"/><text class="pl-ptn" x="${cx}" y="${cy + 3.5}">${n}</text>`
  : '');

// Une zone cliquable rectangulaire : le cas courant.
function zone(e, x, y, w, h, opt = {}) {
  const n = e.desordres?.length || 0;
  const petit = w < 124 || h < 46;
  const cls = ['pl-z', n ? 'a-desordre' : '', opt.cls || ''].filter(Boolean).join(' ');
  return `<g class="${cls}" data-espace="${e.i}" tabindex="0" role="button" aria-label="${esc(e.nom)}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opt.rx ?? 5}"/>
    <text class="pl-nom ${petit ? 'pl-nom-p' : ''}" x="${x + w / 2}" y="${y + (n && !petit ? h / 2 - 3 : h / 2 + 4)}">${esc(e.nom)}</text>
    ${n && !petit ? `<text class="pl-sub" x="${x + w / 2}" y="${y + h / 2 + 14}">${e.desordres.length} désordre${n > 1 ? 's' : ''}</text>` : ''}
    ${pastille(n, x + w - 12, y + 12)}
  </g>`;
}

// Une zone dessinee (toit, montants de facade, sol) : la forme est fournie.
function forme(e, d, tx, ty, opt = {}) {
  const n = e.desordres?.length || 0;
  const cls = ['pl-z', opt.cls || '', n ? 'a-desordre' : ''].filter(Boolean).join(' ');
  return `<g class="${cls}" data-espace="${e.i}" tabindex="0" role="button" aria-label="${esc(e.nom)}">
    ${d}
    <text class="pl-nom ${opt.petit ? 'pl-nom-p' : ''}" x="${tx}" y="${ty}"
      ${opt.rotation ? `transform="rotate(-90 ${tx} ${ty})"` : ''}>${esc(e.nom)}</text>
    ${pastille(n, opt.px ?? tx, opt.py ?? ty - 20)}
  </g>`;
}

// Repartit n zones sur une largeur, ecart constant.
function bande(liste, x, y, w, h, gap = 6) {
  if (!liste.length) return '';
  const lw = (w - gap * (liste.length - 1)) / liste.length;
  return liste.map((e, k) => zone(e, x + k * (lw + gap), y, lw, h)).join('');
}

// ⚠ CE QUE CHAQUE DESSIN SAIT PORTER, declare ici et nulle part ailleurs.
// `btp-projet.js` s'en sert pour savoir quels espaces tombent en cartes sous le
// schema. Deux listes qui divergeraient donneraient soit un espace affiche deux
// fois, soit un espace qui n'apparait nulle part — et le second est pire : on
// perdrait un desordre de vue sans qu'aucun compteur ne le dise.
// Les pieces principales et de service sont toujours dessinees, quel que soit
// leur nombre ; seules les annexes dependent du type de bien.
const ANNEXES_DESSINEES = {
  Appartement: ['Façade', 'Parties communes', 'Balcon / terrasse', 'Cave'],
  Immeuble: ['Façade', 'Toiture', 'Parties communes', 'Sous-sol / cave', 'Extérieur'],
  'Local pro': ['Façade', 'Toiture', 'Réserve / local technique', 'Extérieur'],
  defaut: ['Façade', 'Toiture', 'Combles', 'Sous-sol / cave', 'Extérieur'],
};
export const DESSINES = (type) => ANNEXES_DESSINEES[type] || ANNEXES_DESSINEES.defaut;

const HAUTEUR = { Maison: 496, Appartement: 400, Immeuble: 436, 'Local pro': 496 };

export function planSvg(espaces, type) {
  // ⚠ Les principales et les services entrent par leur GROUPE, les annexes par
  // leur NOM : c'est pourquoi `DESSINES` ne liste que les secondes.
  const E = espaces.map((e, i) => ({ ...e, i }));
  const par = nom => E.find(e => e.nom === nom);
  const principales = E.filter(e => e.groupe === 'principal');
  const service = E.filter(e => e.groupe === 'service');
  const dessin = { Appartement: appart, Immeuble: immeuble, 'Local pro': local }[type] || maison;
  return `<svg class="pl-svg" viewBox="0 0 ${W} ${HAUTEUR[type] || HAUTEUR.Maison}" xmlns="http://www.w3.org/2000/svg">
    ${dessin({ par, principales, service })}
  </svg>`;
}

// ---------------------------------------------------------------- MAISON
// ⚠ C'EST UNE COUPE, DONC LE SOL EST UNE LIGNE ET LA CAVE EST DESSOUS. Premiere
// version : la cave flottait sous les pieces de service mais AU-DESSUS du trait
// de terre, et l'exterieur etait un grand rectangle pose a cote, qui se lisait
// comme une piece de plus. Une coupe qui contredit la realite physique se lit
// plus mal qu'une liste.
function maison({ par, principales, service }) {
  const toit = par('Toiture'), comb = par('Combles'), fac = par('Façade');
  const sol = par('Extérieur'), cave = par('Sous-sol / cave');
  const X = 180, Wm = 540, mur = 32, D = X + Wm, MI = X + Wm / 2;
  const ix = X + mur + 8, iw = Wm - 2 * mur - 16;
  const TERRE = 372;
  return `
  <!-- le terrain : une bande SOUS le trait de sol, dans laquelle la cave est creusee -->
  ${sol ? forme(sol, `<rect x="36" y="${TERRE}" width="${W - 72}" height="100" rx="8"/>`,
    100, TERRE + 26, { cls: 'pl-sol', px: 166, py: TERRE + 22 }) : ''}
  ${toit ? forme(toit, `<path d="M${X - 46} 146 L${MI} 32 L${D + 46} 146 Z"/>`,
    MI, 112, { px: MI + 68, py: 96 }) : ''}
  ${fac ? forme(fac,
    `<rect x="${X}" y="146" width="${mur}" height="${TERRE - 146}"/><rect x="${D - mur}" y="146" width="${mur}" height="${TERRE - 146}"/>`,
    X + mur / 2, 280, { rotation: true, px: X + mur / 2, py: 168 }) : ''}
  ${comb ? zone(comb, ix, 152, iw, 44) : ''}
  ${bande(principales, ix, 204, iw, 78)}
  ${bande(service, ix, 290, iw, 60)}
  <line class="pl-terre" x1="36" y1="${TERRE}" x2="${W - 36}" y2="${TERRE}"/>
  ${cave ? zone(cave, ix, TERRE + 22, iw, 54, { cls: 'pl-creuse' }) : ''}`;
}

// ------------------------------------------------------------ APPARTEMENT
function appart({ par, principales, service }) {
  const fac = par('Façade'), pc = par('Parties communes');
  const balc = par('Balcon / terrasse'), cave = par('Cave');
  const X = 130, Wm = 540;
  return `
  <rect class="pl-cadre" x="96" y="44" width="716" height="330" rx="12"/>
  <text class="pl-etiq" x="114" y="70">L’immeuble</text>
  ${fac ? zone(fac, X, 92, Wm, 30, { rx: 4 }) : ''}
  ${bande(principales, X, 132, Wm, 86)}
  ${bande(service, X, 226, Wm, 68)}
  ${balc ? zone(balc, X, 302, Wm, 46) : ''}
  ${pc ? zone(pc, 694, 132, 102, 162, { cls: 'pl-annexe' }) : ''}
  ${cave ? zone(cave, 694, 302, 102, 46, { cls: 'pl-annexe' }) : ''}`;
}

// --------------------------------------------------------------- IMMEUBLE
function immeuble({ par, principales, service }) {
  const toit = par('Toiture'), fac = par('Façade'), pc = par('Parties communes');
  const ss = par('Sous-sol / cave'), ext = par('Extérieur');
  const X = 190, Wm = 520, mur = 28, D = X + Wm;
  const TERRE = 320;
  return `
  ${ext ? forme(ext, `<rect x="36" y="${TERRE}" width="${W - 72}" height="96" rx="8"/>`,
    100, TERRE + 26, { cls: 'pl-sol', px: 166, py: TERRE + 22 }) : ''}
  ${toit ? zone(toit, X - mur, 38, Wm + 2 * mur, 38, { rx: 4 }) : ''}
  ${fac ? forme(fac,
    `<rect x="${X - mur}" y="84" width="${mur}" height="${TERRE - 84}"/><rect x="${D}" y="84" width="${mur}" height="${TERRE - 84}"/>`,
    X - mur / 2, 250, { rotation: true, px: X - mur / 2, py: 106 }) : ''}
  ${bande(principales, X, 88, Wm, 82)}
  ${bande(service, X, 178, Wm, 64)}
  ${pc ? zone(pc, X, 250, Wm, 48) : ''}
  <line class="pl-terre" x1="36" y1="${TERRE}" x2="${W - 36}" y2="${TERRE}"/>
  ${ss ? zone(ss, X, TERRE + 20, Wm, 52, { cls: 'pl-creuse' }) : ''}`;
}

// -------------------------------------------------------------- LOCAL PRO
function local({ par, principales, service }) {
  const toit = par('Toiture'), fac = par('Façade');
  const res = par('Réserve / local technique'), ext = par('Extérieur');
  const X = 170, Wm = 560, D = X + Wm;
  const TERRE = 392;
  return `
  ${ext ? forme(ext, `<rect x="36" y="${TERRE}" width="${W - 72}" height="82" rx="8"/>`,
    100, TERRE + 30, { cls: 'pl-sol', px: 166, py: TERRE + 26 }) : ''}
  ${toit ? forme(toit, `<path d="M${X - 38} 104 L${D + 38} 104 L${D} 48 L${X} 48 Z"/>`,
    X + Wm / 2, 84, { px: X + Wm / 2 + 80, py: 76 }) : ''}
  ${fac ? zone(fac, X, 116, Wm, 32, { rx: 4 }) : ''}
  ${bande(principales, X, 158, Wm, 86)}
  ${bande(service, X, 252, Wm, 64)}
  ${res ? zone(res, X, 324, Wm, 50) : ''}
  <line class="pl-terre" x1="36" y1="${TERRE}" x2="${W - 36}" y2="${TERRE}"/>`;
}
