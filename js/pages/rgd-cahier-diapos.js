// Les diapositives du cahier des charges — PISTE A, « PLEIN CADRE »
// (11/11/2026). Élodie n'aimait pas la première présentation (calquée sur son
// PowerPoint) : « change totalement le visuel ». Trois pistes lui ont été
// montrées sur la diapositive Cuisine ; elle a choisi la A :
//   · la PHOTO DE LA PIÈCE EN PLEIN ÉCRAN, assombrie à gauche ;
//   · le nom de la pièce en très grand, en blanc (Inter Tight) ;
//   · les travaux dans un PANNEAU translucide, quantités en orange ;
//   · un grand numéro de pièce en filigrane, une barre de progression en bas.
// Ne pas revenir aux pistes B (cartes claires) ni C (éditorial sombre), ni à
// la mise en page du PowerPoint.
//
// ⚠ LA MÊME DIAPOSITIVE SERT À L'ÉCRAN ET AU PDF. `diapos()` rend le HTML ;
// la présentation l'affiche en 16:9, l'impression en A4 à l'italienne. Toutes
// les tailles sont en `cqw` (pour cent de la largeur de la diapositive) : le
// rendu suit la taille, quelle qu'elle soit.
//
// ⚠ LE FOND EST DU CONTENU, PAS UN `background` : la photo est un <img>, le
// noir et le dégradé sont dessinés en SVG. Un fond CSS ne s'imprime que si
// « Graphiques d'arrière-plan » est coché ; une page de texte blanc sur un
// fond qui ne s'imprime pas, c'est une page blanche. (Même règle que les
// autres documents RGD, voir `rgd-documents.js`.)
//
// ⚠ AUCUN PRIX. Une pièce de plus de 9 travaux continue sur une diapositive
// « suite », plutôt que de déborder.
import { esc } from '../ui.js';
import { finDe, dureeLue, versDate, lignesDe } from '../data/rgd-planning.js';
import { piecesDe } from '../data/rgd-cahier.js';
import { donnees } from './rgd-cahier-doc.js';

const LOGO_CLAIR = new URL('../../assets/logos/rgd-complet-clair.png', import.meta.url).href;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => { if (!iso) return ''; const d = versDate(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const qte = (p) => [p.quantite, p.unite].filter(Boolean).join(' ');
const PAR_DIAPO = 9;

export const POLICES = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=block';

// Le fond : une photo (ou rien), le noir dessous et le voile dégradé dessus,
// tous en contenu. `n` rend les identifiants SVG uniques dans la page.
let compteur = 0;
function fond(url, { voile = 'gauche' } = {}) {
  const id = `cdv${++compteur}`;
  const arrets = voile === 'plein'
    ? '<stop offset="0" stop-color="#0A0806" stop-opacity=".78"/><stop offset="1" stop-color="#0A0806" stop-opacity=".88"/>'
    : '<stop offset="0" stop-color="#0A0806" stop-opacity=".93"/><stop offset=".42" stop-color="#0A0806" stop-opacity=".76"/>'
      + '<stop offset=".75" stop-color="#0A0806" stop-opacity=".16"/><stop offset="1" stop-color="#0A0806" stop-opacity=".36"/>';
  return `<svg class="cd-base" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="100" fill="#14110E"/>
      ${url ? '' : `<radialGradient id="${id}h" cx=".85" cy=".1" r=".9"><stop offset="0" stop-color="#FC5D00" stop-opacity=".35"/><stop offset="1" stop-color="#FC5D00" stop-opacity="0"/></radialGradient>
      <rect width="100" height="100" fill="url(#${id}h)"/>`}</svg>
    ${url ? `<img class="cd-photo" src="${esc(url)}" alt="">` : ''}
    <svg class="cd-voile" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".25">${arrets}</linearGradient></defs>
      <rect width="100" height="100" fill="url(#${id})"/></svg>`;
}

const barres = (n, total) => `<div class="cd-barres">${Array.from({ length: total }, (_, j) =>
  `<i class="${j <= n ? 'on' : ''}"></i>`).join('')}</div>`;

/**
 * Les diapositives, dans l'ordre : couverture, interventions, plan, une (ou
 * plusieurs) par pièce, puis Bon pour accord (client) ou Préparation (équipe).
 * @returns [{ nom, piece?, vignette, html }]
 */
export function diapos(chantier, k, dossier, version, urls) {
  const d = donnees(chantier, k, dossier);
  const equipe = version === 'equipe';
  const postes = Array.isArray(k.postes) ? k.postes : [];
  const pieces = piecesDe(postes);
  const photosDe = (lot) => (k.photos || []).filter(p => (p.lot || '') === lot).map(p => urls[p.chemin]).filter(Boolean);
  const premiere = (k.photos || []).map(p => urls[p.chemin]).find(Boolean) || null;
  const sur = [k.objet || chantier.titre, d.adresse].filter(Boolean).join(' · ');
  const liste = [];

  liste.push({ nom: 'Couverture', vignette: premiere, html: `
    <div class="cd cd-couv">${fond(premiere)}
      <div class="cd-in">
        <div class="cd-sur"><i></i>${equipe ? 'Version équipe' : 'Cahier des charges'}</div>
        <h1 class="cd-titre">Cahier<br>des charges</h1>
        ${d.adresse ? `<p class="cd-adresse">${esc(d.adresse)}</p>` : ''}
        <div class="cd-pastilles">${[d.typeBien, d.nature, k.devis_numero ? `Devis ${k.devis_numero}` : ''].filter(Boolean)
          .map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="cd-dates"><b>${esc(dateLongue(chantier.date_debut))}</b> → <b>${esc(dateLongue(finDe(chantier)))}</b>
          <span>${esc(dureeLue(chantier).texte)}</span></div>
      </div>
      <img class="cd-logo" src="${LOGO_CLAIR}" alt="RGD Renova">
    </div>` });

  liste.push({ nom: 'Interventions', vignette: null, html: `
    <div class="cd cd-resume">${fond(null)}
      <div class="cd-in">
        <div class="cd-sur"><i></i>${esc(sur)}</div>
        <h2 class="cd-titre moyen">Interventions</h2>
        <p class="cd-sous">${pieces.length} pièce${pieces.length > 1 ? 's' : ''} · ${postes.length} travaux${
          d.nom ? ` · ${esc(d.nom)}` : ''}${equipe && d.telephone ? ` · ${esc(d.telephone)}` : ''}</p>
        <div class="cd-tuiles">${pieces.map((lot, n) => {
          const ph = photosDe(lot)[0];
          const nb = postes.filter(p => (p.lot || '') === lot).length;
          return `<button type="button" class="cd-tuile" style="--i:${n}" data-aller-piece="${esc(lot)}">
            ${ph ? `<img src="${esc(ph)}" alt="">` : '<span class="cd-tuile-vide"></span>'}
            <span class="cd-tuile-voile"></span>
            <em>${String(n + 1).padStart(2, '0')}</em><b>${esc(lot || 'Travaux')}</b><small>${nb} travaux</small></button>`;
        }).join('')}</div>
      </div>
    </div>` });

  if (k.plan && urls[k.plan]) {
    liste.push({ nom: 'Plan', vignette: urls[k.plan], html: `
      <div class="cd cd-plan">${fond(null)}
        <div class="cd-in"><div class="cd-sur"><i></i>${esc(sur)}</div><h2 class="cd-titre moyen">Plan</h2>
          <div class="cd-plan-carte"><img src="${esc(urls[k.plan])}" alt="Plan du logement"></div></div>
      </div>` });
  }

  pieces.forEach((lot, n) => {
    const tous = postes.filter(p => (p.lot || '') === lot);
    const ph = photosDe(lot);
    for (let debut = 0, morceau = 0; debut < Math.max(tous.length, 1); debut += PAR_DIAPO, morceau++) {
      const l = tous.slice(debut, debut + PAR_DIAPO);
      const suite = morceau > 0;
      const photo = ph[morceau % Math.max(ph.length, 1)] || null;
      const vignette2 = ph.length > 1 ? ph[(morceau + 1) % ph.length] : null;
      liste.push({ nom: suite ? `${lot || 'Travaux'} (suite)` : (lot || 'Travaux'), piece: suite ? null : lot, vignette: photo, html: `
        <div class="cd cd-piece">${fond(photo)}
          <div class="cd-in">
            <div class="cd-sur"><i></i>Pièce ${n + 1} sur ${pieces.length} · ${esc(k.objet || chantier.titre || '')}</div>
            <h2 class="cd-titre${(lot || '').length > 13 ? ' long' : ''}">${esc(lot || 'Travaux')}${suite ? '<small> suite</small>' : ''}</h2>
            <p class="cd-sous">${tous.length} travaux prévus${d.adresse ? ` · ${esc(d.adresse)}` : ''}</p>
            <div class="cd-panneau${l.length > 6 ? ' serre' : ''}"><ul class="cd-travaux${equipe ? ' cases' : ''}">${l.map((p, i) => `
              <li style="--i:${i}"><div><b>${esc(p.designation)}</b>${p.detail ? `<small>${esc(p.detail)}</small>` : ''}</div>${
                qte(p) ? `<span>${esc(qte(p))}</span>` : ''}</li>`).join('')}</ul></div>
            ${barres(n, pieces.length)}
          </div>
          ${vignette2 ? `<div class="cd-vignette"><img src="${esc(vignette2)}" alt=""></div>` : ''}
          <div class="cd-num">${String(n + 1).padStart(2, '0')}</div>
        </div>` });
    }
  });

  if (equipe) {
    const bloc = (titre, l) => `<div class="cd-panneau petit"><h3>${titre}</h3>${l.length ? `<ul class="cd-travaux cases">${l.map((x, i) =>
      `<li style="--i:${i}"><div><b>${esc(x.libelle)}</b></div>${x.quantite ? `<span>${esc(x.quantite)}</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="cd-vide">Rien de prévu.</p>'}</div>`;
    const textes = [['Consignes', k.consignes], ['Convenu avec le client', k.precisions], ['Notes du chantier', chantier.notes]].filter(x => x[1]);
    liste.push({ nom: 'Préparation', vignette: null, html: `
      <div class="cd cd-fin">${fond(null)}
        <div class="cd-in">
          <div class="cd-sur"><i></i>${esc(sur)}</div>
          <h2 class="cd-titre moyen">Préparation</h2>
          <div class="cd-prepa">
            <div class="cd-panneau petit">${textes.length ? textes.map(([t, v]) => `<h3>${t}</h3><p class="cd-libre">${esc(v)}</p>`).join('')
              : '<p class="cd-vide">Aucune consigne.</p>'}</div>
            ${bloc('Matériaux', lignesDe(chantier.id, 'materiaux'))}
            ${bloc('Outils', lignesDe(chantier.id, 'outils'))}
          </div>
          <p class="cd-pied">Document interne — ne pas remettre au client</p>
        </div>
      </div>` });
  } else {
    const signe = k.signature && k.signe_le;
    liste.push({ nom: 'Bon pour accord', vignette: null, html: `
      <div class="cd cd-fin">${fond(null)}
        <div class="cd-in">
          <div class="cd-sur"><i></i>${esc(sur)}</div>
          <h2 class="cd-titre moyen">Bon pour accord</h2>
          ${k.precisions ? `<div class="cd-panneau petit large"><h3>À la charge du client</h3><p class="cd-libre">${esc(k.precisions)}</p></div>` : ''}
          <div class="cd-accord">
            <p>Je soussigné(e) déclare avoir pris connaissance du présent cahier des charges et en valider le contenu
              avant le démarrage des travaux. Il complète le devis${k.devis_numero ? ` n° ${esc(k.devis_numero)}` : ''}, qui reste seul à faire foi pour les prix.</p>
            <div class="cd-signature">${signe ? `<img src="${k.signature}" alt="Signature du client">` : ''}</div>
            <p class="cd-signe">${signe ? `Signé par <b>${esc(k.signe_par || 'le client')}</b> le ${esc(new Date(k.signe_le).toLocaleString('fr-FR'))}${
              k.signe_mode === 'a_distance' ? ' (en ligne)' : ''}` : 'Signature du client et date'}</p>
          </div>
        </div>
        <img class="cd-logo" src="${LOGO_CLAIR}" alt="RGD Renova">
      </div>` });
  }
  return liste;
}

// Le style des diapositives, partagé par l'écran et le PDF. Le conteneur
// (`.cd-cadre`) doit être un conteneur de requête (`container-type`).
export const STYLE_DIAPOS = `
.cd { position: absolute; inset: 0; overflow: hidden; color: #fff; font-family: Inter, Arial, sans-serif; background: #14110E;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cd .cd-base, .cd .cd-voile { position: absolute; inset: 0; width: 100%; height: 100%; }
.cd .cd-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cd-in { position: absolute; inset: 0; padding: 4.4cqw 5cqw 4cqw; display: flex; flex-direction: column; }
.cd-sur { display: flex; align-items: center; gap: 1.1cqw; font: 600 1.02cqw/1.2 Inter, Arial, sans-serif; letter-spacing: .18em;
  text-transform: uppercase; color: #F6C08A; }
.cd-sur i { flex: none; width: 2.7cqw; height: .16cqw; background: #FC5D00; }
.cd-titre { font: 800 8.1cqw/.95 'Inter Tight', Inter, Arial, sans-serif; letter-spacing: -.03em; margin: 1.4cqw 0 .8cqw; color: #fff; }
.cd-titre.moyen { font-size: 5.6cqw; }
/* Le nom de la pièce ne passe pas sous la vignette (en haut à droite) : un nom
   long passe à la ligne, en plus petit. */
.cd-piece .cd-titre { max-width: 64cqw; }
.cd-piece .cd-titre.long { font-size: 6cqw; }
.cd-titre small { font-size: .32em; font-weight: 600; letter-spacing: 0; color: #F6C08A; margin-left: 1cqw; }
.cd-sous { font-size: 1.42cqw; color: #D6CFC8; margin: 0 0 2.4cqw; }
.cd-panneau { width: 46cqw; background: rgba(28, 24, 20, .5); border: .08cqw solid rgba(255,255,255,.16); border-radius: 1.7cqw;
  padding: 1.1cqw 1.8cqw; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.cd-panneau.petit { width: auto; }
.cd-panneau.large { width: 62cqw; margin-bottom: 1.6cqw; }
ul.cd-travaux { list-style: none; margin: 0; padding: 0; }
ul.cd-travaux li { display: flex; align-items: baseline; justify-content: space-between; gap: 1.4cqw; padding: .82cqw 0;
  border-bottom: .08cqw solid rgba(255,255,255,.1); font-size: 1.36cqw; }
.cd-panneau.serre ul.cd-travaux li { padding: .6cqw 0; font-size: 1.24cqw; }
ul.cd-travaux li:last-child { border-bottom: 0; }
ul.cd-travaux li b { font-weight: 500; }
ul.cd-travaux li small { display: block; font-size: .82em; color: #BDB4AB; margin-top: .2cqw; }
ul.cd-travaux li span { flex: none; color: #FC5D00; font-weight: 700; white-space: nowrap; }
ul.cd-travaux.cases li > div { display: flex; gap: 1cqw; align-items: baseline; flex-wrap: wrap; }
ul.cd-travaux.cases li > div::before { content: ""; flex: none; width: 1.15cqw; height: 1.15cqw; border: .13cqw solid #fff;
  border-radius: .25cqw; transform: translateY(.15cqw); }
ul.cd-travaux.cases li small { flex-basis: 100%; padding-left: 2.15cqw; }
.cd-barres { margin-top: auto; display: flex; gap: .6cqw; }
.cd-barres i { flex: 1; height: .32cqw; border-radius: .32cqw; background: rgba(255,255,255,.18); }
.cd-barres i.on { background: #FC5D00; }
.cd-num { position: absolute; right: 4.4cqw; bottom: -3.4cqw; font: 900 26.5cqw/1 'Inter Tight', Inter, Arial, sans-serif;
  color: rgba(255,255,255,.08); pointer-events: none; }
.cd-vignette { position: absolute; right: 5cqw; top: 4.4cqw; width: 17cqw; height: 12cqw; border-radius: 1.2cqw; overflow: hidden;
  border: .3cqw solid rgba(255,255,255,.85); box-shadow: 0 1.5cqw 3cqw rgba(0,0,0,.4); }
.cd-vignette img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cd-logo { position: absolute; right: 5cqw; bottom: 4cqw; width: 19cqw; }
.cd-adresse { font-size: 2cqw; font-weight: 600; margin: .6cqw 0 1.6cqw; }
.cd-pastilles { display: flex; flex-wrap: wrap; gap: .8cqw; }
.cd-pastilles span { border: .1cqw solid rgba(255,255,255,.35); border-radius: 99cqw; padding: .4cqw 1.2cqw; font-size: 1.15cqw; font-weight: 600; }
.cd-dates { margin-top: auto; font-size: 1.4cqw; color: #D6CFC8; }
.cd-dates b { color: #fff; font-weight: 600; } .cd-dates span { margin-left: 1.2cqw; color: #F6C08A; }
.cd-couv .cd-titre { font-size: 9cqw; }
.cd-tuiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(20cqw, 1fr)); gap: 1.3cqw; }
.cd-tuile { position: relative; height: 11.5cqw; border: 0; border-radius: 1.4cqw; overflow: hidden; padding: 0; cursor: pointer;
  text-align: left; color: #fff; font: inherit; background: #2A231D; }
.cd-tuile img, .cd-tuile .cd-tuile-vide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cd-tuile .cd-tuile-vide { background: #3A2E24; }
.cd-tuile .cd-tuile-voile { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(10,8,6,.85), rgba(10,8,6,.1) 70%); }
.cd-tuile em, .cd-tuile b, .cd-tuile small { position: absolute; left: 1.2cqw; }
.cd-tuile em { top: 1cqw; font: 800 1.2cqw 'Inter Tight', Inter, sans-serif; font-style: normal; color: #FC5D00; }
.cd-tuile b { bottom: 2.6cqw; font: 700 1.75cqw/1.1 'Inter Tight', Inter, sans-serif; right: 1.2cqw; }
.cd-tuile small { bottom: 1.1cqw; font-size: 1.05cqw; color: #D6CFC8; }
.cd-plan-carte { flex: 1; min-height: 0; background: #fff; border-radius: 1.6cqw; padding: 1.6cqw; display: flex; align-items: center; justify-content: center; }
.cd-plan-carte img { max-width: 100%; max-height: 100%; object-fit: contain; }
.cd-prepa { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 1.6cqw; align-items: start; }
.cd h3 { font: 700 1.05cqw Inter, Arial, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #F6C08A; margin: .4cqw 0 .8cqw; }
.cd-libre { white-space: pre-wrap; font-size: 1.3cqw; margin: 0 0 1.2cqw; color: #EDE6DF; }
.cd-vide { font-size: 1.2cqw; color: #9C928A; font-style: italic; margin: 0; }
.cd-pied { margin-top: auto; font-size: 1.05cqw; color: #9C928A; letter-spacing: .08em; text-transform: uppercase; }
.cd-accord { width: 62cqw; background: #fff; color: #1A1714; border-radius: 1.7cqw; padding: 2cqw 2.4cqw; font-size: 1.32cqw; line-height: 1.45; }
.cd-accord p { margin: 0; }
.cd-signature { height: 9cqw; margin: 1.4cqw 0 .6cqw; border-bottom: .1cqw solid #c9c1b9; display: flex; align-items: flex-end; }
.cd-signature img { max-height: 8.6cqw; max-width: 60%; }
.cd-accord .cd-signe { font-size: 1.1cqw; color: #6E6760; }
`;

// Les entrées animées, À L'ÉCRAN SEULEMENT (la présentation ajoute
// `.active` à la diapositive affichée).
export const STYLE_ANIMATIONS = `
.cp-diapo.active .cd-photo { animation: cd-zoom 12s ease-out both; }
.cp-diapo.active .cd-titre { animation: cd-monte .7s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-sur, .cp-diapo.active .cd-sous { animation: cd-monte .6s .08s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-panneau { animation: cd-monte .7s .15s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active ul.cd-travaux li { animation: cd-ligne .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(.3s + var(--i) * 55ms); }
.cp-diapo.active .cd-tuile { animation: cd-monte .55s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(.15s + var(--i) * 70ms); }
.cp-diapo.active .cd-num { animation: cd-num 1.1s .2s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-vignette { animation: cd-glisse .8s .35s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-barres i.on { animation: cd-barre .6s .3s ease both; transform-origin: left; }
.cd-tuile:hover img { transform: scale(1.06); } .cd-tuile img { transition: transform .5s ease; }
@keyframes cd-zoom { from { transform: scale(1.1); } to { transform: scale(1); } }
@keyframes cd-monte { from { opacity: 0; transform: translateY(1.6cqw); } to { opacity: 1; transform: none; } }
@keyframes cd-ligne { from { opacity: 0; transform: translateX(-1.4cqw); } to { opacity: 1; transform: none; } }
@keyframes cd-num { from { opacity: 0; transform: translateY(6cqw); } to { opacity: 1; transform: none; } }
@keyframes cd-glisse { from { opacity: 0; transform: translateX(4cqw) rotate(3deg); } to { opacity: 1; transform: none; } }
@keyframes cd-barre { from { transform: scaleX(0); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .cp-diapo.active * { animation: none !important; } }
`;
