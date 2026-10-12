// L'onglet « Site internet » de l'écran Analyse (12/10/2026, Élodie : « sépare
// les réseaux sociaux et le site internet […] quelque chose de plus punchy […]
// une capture d'écran de l'accueil »).
//
// DEUX SOURCES DE FRÉQUENTATION, UNE SEULE À L'ÉCRAN :
//   • le compteur sans cookie (`site_stats_jour`) — complet, puisqu'il ne
//     dépend d'aucun consentement ; il fait foi dès qu'il couvre la période ;
//   • Google Analytics (`site_google_periode`, outil `analytics`) — partiel sur
//     rgdrenova.fr, dont le bandeau refuse les cookies par défaut. Il sert en
//     attendant que le compteur ait assez d'historique.
// La recherche Google vient de Search Console (outil `search_console`).
//
// ⚠ LA CAPTURE EST UNE IMAGE FIXE (`assets/captures/<site>.jpg`), faite le
// 12/10/2026 : elle illustre, elle ne prétend pas montrer l'état du jour.

import { db } from '../data/db.js';
import { esc } from '../ui.js';

const INFOS = {
  rgd: { site: 'rgdrenova.fr', capture: 'assets/captures/rgdrenova.jpg' },
  btp: { site: 'btpexpertise.fr', capture: 'assets/captures/btpexpertise.jpg' },
  courtage: { site: 'lareferencecourtage.fr', capture: 'assets/captures/lareferencecourtage.jpg' },
};
// Une couleur par provenance : la même d'un écran à l'autre.
const COULEURS = {
  Google: '#4285F4', 'Recherche Google et moteurs': '#4285F4', 'Autres moteurs': '#7BAAF7',
  'Accès direct': '#64748B', Instagram: '#E1306C', Facebook: '#1877F2', 'Réseaux sociaux': '#C13584',
  LinkedIn: '#0A66C2', TikTok: '#111111', 'Autres sites': '#F59E0B', 'Assistants IA': '#10A37F',
  'Annonces Google': '#FBBC04', 'Google Maps': '#34A853', 'Non attribué': '#CBD5E1',
};
const couleur = (nom, i) => COULEURS[nom] || ['#F97316', '#14B8A6', '#A855F7', '#EAB308', '#EF4444'][i % 5];

const nombre = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const jourIl = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const fr = (iso) => iso.split('-').reverse().join('/');

function ecart(actuel, avant, inverse = false) {
  if (actuel == null || avant == null || avant === 0) return '';
  const p = Math.round(((actuel - avant) / avant) * 100);
  if (!p) return '<span class="as-ecart">= période d’avant</span>';
  const bon = inverse ? p < 0 : p > 0;
  return `<span class="as-ecart ${bon ? 'bon' : 'mauvais'}">${p > 0 ? '▲ +' : '▼ '}${p} %</span>`;
}

// La fréquentation de la période, d'où qu'elle vienne, sous une même forme.
function frequentation(cle, periode) {
  const { site } = INFOS[cle];
  const lignes = db.t('site_stats_jour').filter(l => l.site === site);
  const debut = jourIl(periode - 1), fin = jourIl(0);
  const premier = lignes.map(l => l.jour).sort()[0];
  const ga = db.t('site_google_periode').find(x => x.site === site && x.outil === 'analytics' && Number(x.periode) === periode);

  const compteurCouvre = premier && premier <= debut;
  if (lignes.length && (compteurCouvre || !ga)) {
    const cur = lignes.filter(l => l.jour >= debut && l.jour <= fin);
    const avant = lignes.filter(l => l.jour >= jourIl(2 * periode - 1) && l.jour <= jourIl(periode));
    const tot = (l, k) => l.reduce((a, x) => a + (x[k] || 0), 0);
    const groupe = (champ, k) => {
      const m = new Map();
      for (const l of cur) m.set(l[champ], (m.get(l[champ]) || 0) + (l[k] || 0));
      return [...m.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    };
    const jours = [];
    for (let i = periode - 1; i >= 0; i--) {
      const j = jourIl(i);
      // Avant le premier jour mesuré, on ne sait pas : pas de zéro qui se lirait « personne ».
      if (j >= premier) jours.push([j, tot(cur.filter(l => l.jour === j), 'visites')]);
    }
    return {
      source: 'compteur', libelle: `Compteur sans cookie, depuis le ${fr(premier)}`, du: debut, au: fin,
      visites: tot(cur, 'visites'), pagesVues: tot(cur, 'vues'), visiteurs: null,
      avant: premier <= jourIl(2 * periode - 1) ? { visites: tot(avant, 'visites'), pagesVues: tot(avant, 'vues') } : {},
      provenance: groupe('source', 'visites'), pages: groupe('page', 'vues'),
      appareils: groupe('appareil', 'visites').map(([a, n]) => [a.charAt(0).toUpperCase() + a.slice(1), n]),
      jours, partiel: false,
    };
  }
  if (ga) {
    const g = ga.donnees || {};
    return {
      source: 'analytics', libelle: 'Google Analytics', du: ga.du, au: ga.au,
      visites: g.visites, pagesVues: g.pages_vues, visiteurs: g.visiteurs,
      avant: { visites: ga.precedent?.visites, pagesVues: ga.precedent?.pages_vues, visiteurs: ga.precedent?.visiteurs },
      provenance: g.provenance || [], pages: g.pages || [], appareils: g.appareils || [],
      jours: g.jours || [], partiel: true,
    };
  }
  return null;
}

// Sans Search Console, les pages vues sont déjà dans l'en-tête : la tuile dit d'où l'on vient.
const premiere = (liste) => (liste || []).reduce((m, x) => (!m || x[1] > m[1] ? x : m), null);

// La courbe des visites : une aire lissée en SVG, sans bibliothèque.
function courbe(jours) {
  // Une carte vide se lirait comme « personne n'est venu » : on dit plutôt ce qui manque.
  if (!jours.length) return '<p class="as-vide">Le détail par jour arrivera au prochain relevé.</p>';
  const max = Math.max(1, ...jours.map(([, v]) => v));
  const W = 600, H = 140;
  const pts = jours.map(([, v], i) => [jours.length === 1 ? W / 2 : (i / (jours.length - 1)) * W, H - (v / max) * (H - 14) - 4]);
  const ligne = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const pic = jours.reduce((a, b) => (b[1] > a[1] ? b : a));
  return `<svg class="as-courbe" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Visites par jour">
    <defs><linearGradient id="as-degrade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    <path d="${ligne} L${W},${H} L0,${H} Z" fill="url(#as-degrade)"/>
    <path d="${ligne}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    ${pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="transparent"><title>${fr(jours[i][0])} : ${nombre(jours[i][1])} visite${jours[i][1] > 1 ? 's' : ''}</title></circle>`).join('')}
  </svg>
  <div class="as-courbe-pied"><span>${fr(jours[0][0])}</span><span>Pic : ${nombre(pic[1])} le ${fr(pic[0])}</span><span>${fr(jours[jours.length - 1][0])}</span></div>`;
}

// L'anneau de la provenance.
function anneau(liste) {
  const total = liste.reduce((a, [, n]) => a + n, 0);
  if (!total) return '<div class="as-vide">—</div>';
  let angle = 0;
  const r = 52, c = 2 * Math.PI * r;
  const arcs = liste.map(([nom, n], i) => {
    const part = n / total;
    const s = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${couleur(nom, i)}" stroke-width="22"
      stroke-dasharray="${(part * c).toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-angle * c).toFixed(2)}"><title>${esc(nom)} : ${nombre(n)}</title></circle>`;
    angle += part;
    return s;
  }).join('');
  return `<div class="as-anneau">
    <svg viewBox="0 0 140 140" class="as-anneau-svg"><g transform="rotate(-90 70 70)">${arcs}</g>
      <text x="70" y="66" text-anchor="middle" class="as-anneau-n">${nombre(total)}</text>
      <text x="70" y="84" text-anchor="middle" class="as-anneau-l">visites</text></svg>
    <ul class="as-legende">${liste.map(([nom, n], i) => `<li><i style="background:${couleur(nom, i)}"></i>${esc(nom)}<b>${Math.round((n / total) * 100)} %</b></li>`).join('')}</ul>
  </div>`;
}

const ICONES_APPAREIL = {
  Mobile: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18" r="1.1" fill="currentColor"/></svg>',
  Ordinateur: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="1.8"/></svg>',
  Tablette: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>',
};

function appareils(liste) {
  const total = liste.reduce((a, [, n]) => a + n, 0);
  if (!total) return '<div class="as-vide">—</div>';
  return `<div class="as-appareils">${liste.map(([nom, n]) => `<div class="as-appareil">
      <span class="as-appareil-ico">${ICONES_APPAREIL[nom] || ''}</span>
      <b>${Math.round((n / total) * 100)} %</b><span>${esc(nom)}</span></div>`).join('')}</div>`;
}

function classement(liste, unite) {
  const max = Math.max(1, ...liste.map(([, n]) => n));
  return liste.length ? `<ol class="as-classement">${liste.map(([nom, n], i) => `<li>
      <span class="as-rang">${i + 1}</span>
      <span class="as-classement-nom" title="${esc(nom)}">${esc(nom)}</span>
      <span class="as-classement-piste"><i style="width:${(n / max) * 100}%"></i></span>
      <b>${nombre(n)}</b></li>`).join('')}</ol>` : `<div class="as-vide">Pas encore de ${unite}.</div>`;
}

export function vueSite(cle, periode) {
  const { site, capture } = INFOS[cle];
  const f = frequentation(cle, periode);
  const sc = db.t('site_google_periode').find(x => x.site === site && x.outil === 'search_console' && Number(x.periode) === periode);
  const s = sc?.donnees || {}, sp = sc?.precedent || {};
  const pos = (v) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
  const ecartPos = (a, b) => {
    if (a == null || !b) return '';
    const d = Math.round((a - b) * 10) / 10;
    if (!d) return '<span class="as-ecart">= période d’avant</span>';
    return `<span class="as-ecart ${d < 0 ? 'bon' : 'mauvais'}">${d < 0 ? '▲ gagne' : '▼ perd'} ${Math.abs(d).toLocaleString('fr-FR')} place${Math.abs(d) >= 2 ? 's' : ''}</span>`;
  };

  const chiffre = (classe, libelle, valeur, detail, aide = '') => `<div class="as-chiffre ${classe}" title="${esc(aide)}">
    <span class="as-chiffre-l">${esc(libelle)}</span><b>${valeur}</b>${detail || ''}</div>`;

  const hero = `<section class="as-hero">
    <a class="as-capture" href="https://${site}/" target="_blank" rel="noopener" title="Ouvrir ${esc(site)}">
      <span class="as-navigateur"><i></i><i></i><i></i><span>${esc(site)}</span></span>
      <img src="${capture}" alt="Page d’accueil de ${esc(site)}" loading="lazy">
    </a>
    <div class="as-hero-texte">
      <span class="as-pastille-ligne"><i></i> En ligne</span>
      <h2>${esc(site)}</h2>
      <p>${f ? `${esc(f.libelle)} · ${esc(fr(f.du))} → ${esc(fr(f.au))}` : 'La mesure démarre : les premières visites arrivent.'}</p>
      <div class="as-hero-chiffres">
        ${chiffre('vif', 'Visites', nombre(f?.visites), f ? ecart(f.visites, f.avant?.visites) : '', 'Arrivées sur le site depuis l’extérieur')}
        ${sc ? chiffre('google', 'Clics depuis Google', nombre(s.clics), ecart(s.clics, sp.clics), 'Search Console') : chiffre('', 'Pages vues', nombre(f?.pagesVues), f ? ecart(f.pagesVues, f.avant?.pagesVues) : '')}
      </div>
    </div>
  </section>`;

  const tuiles = `<div class="as-tuiles">
    ${sc ? chiffre('t1', 'Pages vues', nombre(f?.pagesVues), f ? ecart(f.pagesVues, f.avant?.pagesVues) : '')
      : chiffre('t1', 'Première provenance', esc(premiere(f?.provenance)?.[0] || '—'), premiere(f?.provenance) && f.visites ? `<span class="as-ecart">${Math.round(premiere(f.provenance)[1] / f.visites * 100)} % des visites</span>` : '')}
    ${chiffre('t2', f?.visiteurs != null ? 'Visiteurs' : 'Pages par visite',
      f?.visiteurs != null ? nombre(f.visiteurs) : (f?.visites ? (f.pagesVues / f.visites).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'),
      f?.visiteurs != null ? ecart(f.visiteurs, f.avant?.visiteurs) : '')}
    ${sc ? chiffre('t3', 'Apparitions dans Google', nombre(s.impressions), ecart(s.impressions, sp.impressions), 'Affichages du site dans les résultats de recherche') : ''}
    ${sc ? chiffre('t4', 'Position moyenne', pos(s.position), ecartPos(s.position, sp.position), '1 = en tête des résultats Google') : ''}
  </div>`;

  const recherches = sc ? `<section class="as-carte as-large">
      <header><h3>Ce que les gens tapent dans Google</h3><span class="small muted">Search Console · ${esc(fr(sc.du))} → ${esc(fr(sc.au))} · trois jours de retard</span></header>
      <div class="table-wrap"><table class="as-table">
        <thead><tr><th>Recherche</th><th>Clics</th><th>Apparitions</th><th>Position</th></tr></thead>
        <tbody>${(s.recherches || []).map(r => `<tr><td>${esc(r.cle)}</td><td><b>${nombre(r.clics)}</b></td><td>${nombre(r.impressions)}</td>
          <td><span class="as-position ${r.position <= 3 ? 'top' : r.position <= 10 ? 'p1' : ''}">${pos(r.position)}</span></td></tr>`).join('')
          || '<tr><td colspan="4" class="muted">Aucune recherche sur la période.</td></tr>'}</tbody>
      </table></div>
    </section>` : '';

  return `${hero}${tuiles}
    <div class="as-grille">
      <section class="as-carte as-large"><header><h3>Visites jour par jour</h3></header>${courbe(f?.jours || [])}</section>
      <section class="as-carte"><header><h3>D’où viennent les visiteurs</h3></header>${anneau(f?.provenance || [])}</section>
      <section class="as-carte"><header><h3>Sur quel écran</h3></header>${appareils(f?.appareils || [])}</section>
      <section class="as-carte as-large"><header><h3>Pages les plus vues</h3></header>${classement((f?.pages || []).slice(0, 8), 'page vue')}</section>
      ${recherches}
    </div>
    ${f?.partiel ? '<p class="small muted ana-note">Google Analytics ne compte que les visiteurs qui acceptent les cookies du site : ces chiffres sont en dessous de la fréquentation réelle. Le compteur sans cookie prendra le relais dès qu’il couvrira toute la période.</p>' : ''}`;
}
