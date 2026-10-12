// Les logos des réseaux sociaux (12/10/2026, demandé par Élodie : « mets les
// logos des entreprises facebook, instagram, tiktok et linkedin »).
//
// En SVG écrit ici, pas en images téléchargées : rien à héberger, net à toutes
// les tailles, et aucune requête vers un site tiers à chaque affichage.
// Facebook, TikTok et LinkedIn reprennent les tracés de Simple Icons (CC0) ;
// Instagram est redessiné (carré arrondi, objectif, point) sur son dégradé.

const FB = '<path fill="#1877F2" d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>';

const IG = `<defs><radialGradient id="ig-degrade" cx="30%" cy="107%" r="150%">
    <stop offset="0" stop-color="#FDF497"/><stop offset=".05" stop-color="#FDF497"/>
    <stop offset=".45" stop-color="#FD5949"/><stop offset=".6" stop-color="#D6249F"/><stop offset=".9" stop-color="#285AEB"/>
  </radialGradient></defs>
  <rect width="24" height="24" rx="6" fill="url(#ig-degrade)"/>
  <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/>
  <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" stroke-width="1.8"/>
  <circle cx="16.3" cy="7.7" r="1.05" fill="#fff"/>`;

const TT = `<rect width="24" height="24" rx="6" fill="#000"/>
  <g transform="translate(4.2 4) scale(.65)">
    <path fill="#25F4EE" transform="translate(-.6 -.6)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    <path fill="#FE2C55" transform="translate(.6 .6)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    <path fill="#fff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </g>`;

const IN = `<rect width="24" height="24" rx="4" fill="#0A66C2"/>
  <g transform="translate(2.4 2.4) scale(.8)"><path fill="#fff" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/></g>`;

const DESSINS = { facebook: FB, instagram: IG, tiktok: TT, linkedin: IN };
const NOMS = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn' };

// ⚠ L'IDENTIFIANT DU DÉGRADÉ INSTAGRAM EST RENDU UNIQUE À CHAQUE APPEL : vingt
// logos dans une page partageraient sinon le même `id`, et un navigateur peut
// alors n'en peindre qu'un.
let numero = 0;

/** Le logo d'un réseau, en SVG, à la taille demandée (px). */
export function logoReseau(reseau, taille = 20) {
  const d = DESSINS[reseau];
  if (!d) return '';
  const id = `ig-degrade-${++numero}`;
  return `<svg class="logo-reseau" width="${taille}" height="${taille}" viewBox="0 0 24 24" role="img" aria-label="${NOMS[reseau]}">`
    + `<title>${NOMS[reseau]}</title>${d.replaceAll('ig-degrade', id)}</svg>`;
}
