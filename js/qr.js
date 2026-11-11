// Un code QR, dessiné à la main (11/11/2026)
//
// Élodie, le 11/11/2026 : « oui construis le QR code » — pour qu'un client
// scanne le montant de sa facture et paie sur son propre téléphone.
//
// ⚠ AUCUNE BIBLIOTHÈQUE, ET CE N'EST PAS DE LA FIERTÉ MAL PLACÉE. Les deux
// autres voies coûtaient plus cher : un CDN tiers tombe un jour et emporte
// l'écran avec lui (déjà vu sur ce CRM), et un fichier copié d'ailleurs entre
// sans que personne ne l'ait lu. Le reste du CRM est écrit de la même main —
// le graphique, le pad de signature.
//
// ⚠ IL A ÉTÉ VÉRIFIÉ EN DÉCODANT SES PROPRES CODES, avec un lecteur
// indépendant (OpenCV), sur sept charges utiles : adresses de paiement,
// accents, €, et une URL de 326 caractères (version 13). Toutes relues à
// l'identique. Un encodeur QR faux ne se voit pas à l'œil — il produit une
// belle grille que rien ne décode —, donc la seule preuve est la relecture.
//
// ⚠ ET SI QUELQU'UN COMPARE UN JOUR CETTE MATRICE À CELLE D'UNE AUTRE
// BIBLIOTHÈQUE, QU'IL NE S'AFFOLE PAS : elles diffèrent. Comparée à `segno`
// (Python), la grille n'est pas la même — non par erreur, mais parce que le
// BOURRAGE après le terminateur diffère : segno ajoute un symbole nul là où
// nous enchaînons directement sur les octets de remplissage 0xEC / 0x11. Les
// deux sont relus de la même façon : un décodeur lit le mode, la longueur, la
// donnée, et s'arrête. L'égalité des images n'est pas le bon critère ; la
// relecture l'est. Vérifié aussi que le bloc de segno est cohérent avec SES
// propres symboles de correction, donc qu'aucun des deux ne se trompe.
//
// ⚠ `matriceQr(texte, { masqueImpose })` existe pour ces comparaisons : il
// permet de fixer le masque des deux côtés et de distinguer une erreur
// d'encodage d'une erreur de choix de masque. C'est ce qui a montré, ici, que
// le défaut n'était ni dans les symboles ni dans la correction d'erreur.
//
// CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
// Mode OCTET, correction de niveau M (~15 % de perte tolérée), versions 1 à
// 15 — soit 415 caractères, où une adresse de paiement en fait moins de cent.
// Pas de mode numérique ni alphanumérique : ils compressent mieux des chiffres
// ou des majuscules, et nous encodons des URL en minuscules.

// ---------------------------------------------------------------- GF(256)
// Le corps de Galois des codes QR, polynôme primitif 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Le polynôme générateur de `n` symboles de correction. */
function generateur(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const suivant = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      suivant[j] ^= g[j];
      suivant[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = suivant;
  }
  return g;
}

/** Les symboles de correction d'un bloc de données. */
function correction(donnees, n) {
  const g = generateur(n);
  const reste = new Array(n).fill(0);
  for (const octet of donnees) {
    const facteur = octet ^ reste[0];
    reste.shift();
    reste.push(0);
    if (facteur !== 0) for (let i = 0; i < n; i++) reste[i] ^= mul(g[i + 1], facteur);
  }
  return reste;
}

// ------------------------------------------------- les tables de la norme
// ⚠ NIVEAU M SEULEMENT, VERSIONS 1 À 15. Chaque entrée : [total de symboles,
// symboles de correction par bloc, [[nombre de blocs, données par bloc], …]].
// Une erreur d'un seul chiffre ici donne un code illisible que rien ne
// signale — d'où la comparaison avec `segno`.
const TABLE = {
  1: [26, 10, [[1, 16]]],
  2: [44, 16, [[1, 28]]],
  3: [70, 26, [[1, 44]]],
  4: [100, 18, [[2, 32]]],
  5: [134, 24, [[2, 43]]],
  6: [172, 16, [[4, 27]]],
  7: [196, 18, [[4, 31]]],
  8: [242, 22, [[2, 38], [2, 39]]],
  9: [292, 22, [[3, 36], [2, 37]]],
  10: [346, 26, [[4, 43], [1, 44]]],
  11: [404, 30, [[1, 50], [4, 51]]],
  12: [466, 22, [[6, 36], [2, 37]]],
  13: [532, 22, [[8, 37], [1, 38]]],
  14: [581, 24, [[4, 40], [5, 41]]],
  15: [655, 24, [[5, 41], [5, 42]]],
};

const ALIGNEMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
};

/** Les bits de bourrage après les données, selon la version. */
const RESTE_BITS = (v) => (v === 1 ? 0 : v <= 6 ? 7 : v <= 13 ? 0 : 3);

const donneesDe = (v) => TABLE[v][2].reduce((t, [n, d]) => t + n * d, 0);

// ---------------------------------------------------------------- l'encodage
function enBits(texte) {
  const octets = new TextEncoder().encode(texte);
  // La plus petite version qui accueille le message, en-tête compris.
  let version = 0;
  for (let v = 1; v <= 15; v++) {
    const enTete = 4 + (v <= 9 ? 8 : 16);
    if (donneesDe(v) * 8 >= enTete + octets.length * 8) { version = v; break; }
  }
  if (!version) throw new Error('Message trop long pour un code QR de niveau M');

  const bits = [];
  const pousser = (valeur, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valeur >> i) & 1); };
  pousser(0b0100, 4);                                  // mode octet
  pousser(octets.length, version <= 9 ? 8 : 16);       // longueur
  for (const o of octets) pousser(o, 8);

  const capacite = donneesDe(version) * 8;
  for (let i = 0; i < 4 && bits.length < capacite; i++) bits.push(0);   // terminateur
  while (bits.length % 8) bits.push(0);
  const mots = [];
  for (let i = 0; i < bits.length; i += 8) {
    mots.push(bits.slice(i, i + 8).reduce((t, b) => (t << 1) | b, 0));
  }
  // ⚠ LE BOURRAGE ALTERNE 0xEC ET 0x11, dans cet ordre : c'est la norme, et un
  // lecteur strict refuse autre chose.
  const bourrage = [0xec, 0x11];
  for (let i = 0; mots.length < donneesDe(version); i++) mots.push(bourrage[i % 2]);
  return { version, mots };
}

/**
 * Les symboles finaux : données et correction ENTRELACÉES.
 *
 * ⚠ L'ENTRELACEMENT EST CE QUI REND LE CODE ROBUSTE : une tache sur le papier
 * abîme un symbole de chaque bloc plutôt que tout un bloc. Le poser bloc après
 * bloc produirait un code valide à l'œil et illisible dès la première rayure.
 */
function symboles(version, mots) {
  const [, ecParBloc, groupes] = TABLE[version];
  const blocs = [];
  let i = 0;
  for (const [nb, taille] of groupes) {
    for (let b = 0; b < nb; b++) {
      const donnees = mots.slice(i, i + taille);
      i += taille;
      blocs.push({ donnees, ec: correction(donnees, ecParBloc) });
    }
  }
  const out = [];
  const maxData = Math.max(...blocs.map(b => b.donnees.length));
  for (let k = 0; k < maxData; k++) {
    for (const b of blocs) if (k < b.donnees.length) out.push(b.donnees[k]);
  }
  for (let k = 0; k < ecParBloc; k++) for (const b of blocs) out.push(b.ec[k]);
  return out;
}

// ---------------------------------------------------------------- la grille
function grilleVide(taille) {
  return Array.from({ length: taille }, () => new Array(taille).fill(null));
}

function poserMotifs(g, version) {
  const n = g.length;
  const bloc = (ox, oy) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = ox + x; const py = oy + y;
        if (px < 0 || py < 0 || px >= n || py >= n) continue;
        const bord = x === -1 || y === -1 || x === 7 || y === 7;
        const cadre = x === 0 || y === 0 || x === 6 || y === 6;
        const coeur = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        g[py][px] = bord ? 0 : (cadre || coeur) ? 1 : 0;
      }
    }
  };
  bloc(0, 0); bloc(n - 7, 0); bloc(0, n - 7);

  for (const cy of ALIGNEMENT[version]) {
    for (const cx of ALIGNEMENT[version]) {
      if (g[cy][cx] !== null) continue;      // sous un motif de repérage
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const bord = Math.max(Math.abs(x), Math.abs(y));
          g[cy + y][cx + x] = bord === 1 ? 0 : 1;
        }
      }
    }
  }

  for (let i = 8; i < n - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    if (g[6][i] === null) g[6][i] = v;
    if (g[i][6] === null) g[i][6] = v;
  }
  g[n - 8][8] = 1;                            // le module toujours noir
}

/** Les cases réservées au format et à la version : jamais des données. */
function reservees(n, version) {
  const r = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < 9; i++) { r[8][i] = true; r[i][8] = true; }
  for (let i = 0; i < 8; i++) { r[8][n - 1 - i] = true; r[n - 1 - i][8] = true; }
  if (version >= 7) {
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 3; x++) { r[y][n - 11 + x] = true; r[n - 11 + x][y] = true; }
    }
  }
  return r;
}

/**
 * Pose les données en zigzag et REND LA CARTE DES CASES ÉCRITES.
 *
 * ⚠ CETTE CARTE EST INDISPENSABLE, ET SON ABSENCE A FAIT TOUT RATER AU PREMIER
 * ESSAI. Le masque ne doit s'appliquer QU'AUX DONNÉES : motifs de repérage,
 * d'alignement, de synchronisation et zones réservées restent intacts. J'avais
 * d'abord tenté de les reconnaître après coup, par leurs coordonnées — une
 * devinette qui se trompait sur les alignements, et 284 modules sur 841
 * différaient de la référence. Les cases écrites ici sont les données, par
 * construction : il n'y a rien à deviner.
 */
function poserDonnees(g, res, flux) {
  const n = g.length;
  const donnee = Array.from({ length: n }, () => new Array(n).fill(false));
  let bit = 0;
  let montant = true;
  for (let colonne = n - 1; colonne > 0; colonne -= 2) {
    if (colonne === 6) colonne--;             // la colonne de synchronisation
    for (let k = 0; k < n; k++) {
      const y = montant ? n - 1 - k : k;
      for (const x of [colonne, colonne - 1]) {
        if (g[y][x] !== null || res[y][x]) continue;
        g[y][x] = bit < flux.length ? flux[bit] : 0;
        donnee[y][x] = true;
        bit++;
      }
    }
    montant = !montant;
  }
  return donnee;
}

const MASQUES = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/**
 * Les quatre pénalités de la norme : on garde le masque le moins pénalisé.
 *
 * ⚠ CE N'EST PAS DE L'ESTHÉTIQUE. Un masque mal choisi laisse des suites de
 * modules identiques qu'un lecteur confond avec les motifs de repérage.
 */
function penalite(g) {
  const n = g.length;
  let p = 0;
  const suite = (lire) => {
    for (let a = 0; a < n; a++) {
      let compte = 1;
      for (let b = 1; b < n; b++) {
        if (lire(a, b) === lire(a, b - 1)) compte++;
        else { if (compte >= 5) p += compte - 2; compte = 1; }
      }
      if (compte >= 5) p += compte - 2;
    }
  };
  suite((y, x) => g[y][x]);
  suite((x, y) => g[y][x]);
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const s = g[y][x] + g[y][x + 1] + g[y + 1][x] + g[y + 1][x + 1];
      if (s === 0 || s === 4) p += 3;
    }
  }
  const MOTIF = [1, 0, 1, 1, 1, 0, 1];
  const cherche = (lire) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b <= n - 7; b++) {
        let ok = true;
        for (let i = 0; i < 7; i++) if (lire(a, b + i) !== MOTIF[i]) { ok = false; break; }
        if (!ok) continue;
        const avant = [b - 4, b - 3, b - 2, b - 1].every(i => i < 0 || lire(a, i) === 0);
        const apres = [b + 7, b + 8, b + 9, b + 10].every(i => i >= n || lire(a, i) === 0);
        if (avant || apres) p += 40;
      }
    }
  };
  cherche((y, x) => g[y][x]);
  cherche((x, y) => g[y][x]);
  let noirs = 0;
  for (const ligne of g) for (const c of ligne) noirs += c;
  const part = (noirs * 100) / (n * n);
  p += Math.floor(Math.abs(part - 50) / 5) * 10;
  return p;
}

/** Les quinze bits de format : niveau M (0b00) et numéro de masque, BCH. */
function bitsFormat(masque) {
  let v = (0b00 << 3) | masque;
  let reste = v << 10;
  for (let i = 14; i >= 10; i--) if ((reste >> i) & 1) reste ^= 0b10100110111 << (i - 10);
  return ((v << 10) | reste) ^ 0b101010000010010;
}

/** Les dix-huit bits de version, pour les versions 7 et au-delà. */
function bitsVersion(version) {
  let reste = version << 12;
  for (let i = 17; i >= 12; i--) if ((reste >> i) & 1) reste ^= 0b1111100100101 << (i - 12);
  return (version << 12) | reste;
}

/**
 * La matrice d'un message : un tableau de lignes de 0 et de 1.
 *
 * C'est la seule chose que cet encodeur produit vraiment ; le SVG en dessous
 * n'est qu'une mise en forme, et c'est elle qu'on compare à `segno`.
 */
export function matriceQr(texte, { masqueImpose = null } = {}) {
  const { version, mots } = enBits(String(texte));
  const flux = [];
  for (const s of symboles(version, mots)) for (let i = 7; i >= 0; i--) flux.push((s >> i) & 1);
  for (let i = 0; i < RESTE_BITS(version); i++) flux.push(0);

  const n = version * 4 + 17;
  const base = grilleVide(n);
  poserMotifs(base, version);
  const res = reservees(n, version);
  const donnee = poserDonnees(base, res, flux);

  let meilleure = null;
  let meilleurScore = Infinity;
  // `masqueImpose` ne sert qu'aux contrôles : il permet de comparer une
  // matrice à celle d'un autre encodeur à masque égal, et donc de distinguer
  // une erreur d'ENCODAGE d'une erreur de CHOIX de masque.
  const debut = masqueImpose == null ? 0 : masqueImpose;
  const fin = masqueImpose == null ? 7 : masqueImpose;
  for (let m = debut; m <= fin; m++) {
    const g = base.map(l => l.slice());
    // ⚠ ON NE MASQUE QUE LES CASES DE DONNÉES, celles que `poserDonnees` vient
    // d'écrire. Tout le reste tient la structure du code.
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (donnee[y][x] && MASQUES[m](x, y)) g[y][x] ^= 1;
      }
    }
    const f = bitsFormat(m);
    for (let i = 0; i < 15; i++) {
      const b = (f >> i) & 1;
      if (i < 6) g[i][8] = b;
      else if (i < 8) g[i + 1][8] = b;
      else if (i === 8) g[8][7] = b;
      else g[8][14 - i] = b;
      if (i < 8) g[8][n - 1 - i] = b;
      else g[n - 15 + i][8] = b;
    }
    g[n - 8][8] = 1;
    if (version >= 7) {
      const bv = bitsVersion(version);
      for (let i = 0; i < 18; i++) {
        const b = (bv >> i) & 1;
        g[Math.floor(i / 3)][n - 11 + (i % 3)] = b;
        g[n - 11 + (i % 3)][Math.floor(i / 3)] = b;
      }
    }
    const score = penalite(g);
    if (score < meilleurScore) { meilleurScore = score; meilleure = g; }
  }
  return meilleure;
}

/**
 * Le code QR en SVG, prêt à poser dans la page.
 *
 * ⚠ LA MARGE BLANCHE DE QUATRE MODULES EST OBLIGATOIRE : sans elle, beaucoup
 * de téléphones ne trouvent pas le code. C'est le défaut le plus fréquent des
 * QR faits maison, et il ne se voit pas — il se constate quand ça ne marche
 * pas chez le client.
 */
export function qrSvg(texte, { marge = 4, titre = 'Code à scanner' } = {}) {
  const g = matriceQr(texte);
  const n = g.length;
  const total = n + marge * 2;
  const cases = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (g[y][x]) cases.push(`M${x + marge} ${y + marge}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"
    role="img" aria-label="${titre}" shape-rendering="crispEdges" class="qr">
    <rect width="${total}" height="${total}" fill="#fff"/>
    <path d="${cases.join('')}" fill="#000"/>
  </svg>`;
}
