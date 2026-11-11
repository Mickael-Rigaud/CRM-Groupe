// Le cahier des charges imprimé — LA MISE EN PAGE D'ÉLODIE (11/11/2026).
//
// ⚠ ELLE REPREND SON MODÈLE, « Cahier des charges - JUSTE.pptx » : des pages
// A4 À L'ITALIENNE, une page de garde orange (adresse, type de bien, nature des
// travaux, logo), une page « Interventions » qui résume, le plan du logement,
// puis UNE PAGE PAR PIÈCE — le nom en grand dans une écriture manuscrite
// orange (Baguet Script, sa police), la liste des travaux en Garamond, la
// photo de la pièce à droite dans un cadre aux coins coupés — et le logo pour
// finir. Ne pas revenir au tableau de la première version, refait sur ce
// modèle le jour même.
//
// Deux versions :
// · CLIENT : les pages ci-dessus, puis « Précisions » et « Bon pour accord »
//   avec la signature (au doigt dans le CRM, ou à distance).
// · ÉQUIPE : les mêmes pages avec une case « fait » devant chaque travail,
//   puis une page « Préparation » : consignes, convenu avec le client, listes
//   matériaux et outils, notes du chantier. Jamais remise au client.
//
// ⚠ AUCUN PRIX, SUR AUCUNE DES DEUX (les postes n'en portent pas).
// ⚠ AUCUN TEXTE CLAIR SUR UN FOND : l'orange de la page de garde est un dessin
// SVG (du contenu, il s'imprime toujours), et le texte posé dessus est noir —
// comme sur le modèle. Un `background` CSS ne s'imprime que si « Graphiques
// d'arrière-plan » est coché.
import { esc } from '../ui.js';
import { donneesDocument } from './rgd-documents.js';
import { lignesDe, finDe, dureeLue, versDate } from '../data/rgd-planning.js';
import { liensDuCahier, piecesDe } from '../data/rgd-cahier.js';

const LOGO = new URL('../../assets/logos/rgd-complet.png', import.meta.url).href;
const ORANGE = '#E48312';                 // l'orange du modèle, relevé sur ses diapositives
const ENCRE = '#1A1714';
const GRIS = '#6E6760';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => { if (!iso) return ''; const d = versDate(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const quand = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const style = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font: 15pt/1.4 'EB Garamond', Garamond, Georgia, serif; color: ${ENCRE};
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 297mm; min-height: 210mm; padding: 16mm 18mm; overflow: hidden;
    break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }

  /* La page de garde : la tache orange, le titre, l'adresse, le logo. */
  .garde svg.tache { position: absolute; left: 0; top: 0; width: 215mm; height: 170mm; }
  .garde .bloc { position: relative; width: 165mm; margin-top: 30mm; text-align: center; }
  .garde h1 { font-weight: 400; font-size: 52pt; line-height: 1.05; margin: 0 0 12mm; }
  .garde .adresse { font-size: 21pt; font-weight: 600; margin: 0 0 5mm; }
  .garde .info { font-size: 15pt; font-weight: 600; margin: 1mm 0; }
  .garde .equipe { display: inline-block; margin-top: 6mm; padding: 1mm 4mm; border: 1.5pt solid ${ENCRE}; font-size: 12pt;
    letter-spacing: .08em; text-transform: uppercase; }
  .garde img.logo { position: absolute; right: 22mm; bottom: 18mm; width: 82mm; }

  /* Les titres : Garamond orange pour « Interventions », l'écriture manuscrite pour les pièces. */
  h2.sobre { font-weight: 400; color: ${ORANGE}; font-size: 34pt; margin: 6mm 0 4mm; padding-bottom: 4mm;
    border-bottom: .75pt solid #cfc8c1; width: 120mm; }
  h2.piece { font-family: 'Baguet Script', 'Brush Script MT', cursive; font-weight: 400; color: ${ORANGE};
    font-size: 46pt; line-height: 1.15; margin: 0 0 9mm; }

  .colonnes { display: flex; gap: 12mm; align-items: flex-start; }
  .colonnes > .texte { flex: 1; min-width: 0; padding-top: 2mm; }
  .colonnes > .photos { flex: 0 0 112mm; display: flex; flex-direction: column; gap: 6mm; }
  ul.travaux { margin: 0; padding-left: 5mm; }
  ul.travaux li { margin: 0 0 2.2mm; }
  ul.travaux li small { display: block; color: ${GRIS}; font-size: 12.5pt; white-space: pre-wrap; }
  ul.travaux li b { font-weight: 600; }
  ul.travaux .q { color: ${GRIS}; white-space: nowrap; }
  ul.cases { list-style: none; padding-left: 0; }
  ul.cases li { display: flex; gap: 3mm; }
  ul.cases li::before { content: ''; flex: none; width: 4.2mm; height: 4.2mm; margin-top: 1.6mm; border: 1pt solid ${ENCRE}; }

  /* Le cadre des photos, coins coupés comme sur le modèle (clip-path : du
     contenu, il s'imprime). */
  .cadre { position: relative; width: 100%; background: #fff; border: 1pt solid #d9d3cc;
    clip-path: polygon(0 0, calc(100% - 14mm) 0, 100% 14mm, 100% 100%, 14mm 100%, 0 calc(100% - 14mm)); }
  .cadre img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .photos.une .cadre { height: 160mm; }
  .photos.deux .cadre { height: 77mm; }

  .plan { display: flex; align-items: center; justify-content: center; height: 140mm; }
  .plan img { max-width: 100%; max-height: 100%; object-fit: contain; }

  .infos { display: flex; flex-wrap: wrap; gap: 3mm 12mm; margin: 0 0 6mm; font-size: 12pt; color: ${GRIS}; }
  .infos b { color: ${ENCRE}; font-weight: 600; }
  .texte-libre { white-space: pre-wrap; margin: 0 0 6mm; }
  h3 { font-weight: 600; font-size: 13pt; text-transform: uppercase; letter-spacing: .06em; color: ${ORANGE}; margin: 0 0 3mm; }

  .accord { margin-top: 6mm; border: 1pt solid ${ENCRE}; padding: 6mm 7mm; break-inside: avoid; }
  .accord p { margin: 0 0 5mm; }
  .accord .zone { display: flex; gap: 12mm; align-items: flex-end; }
  .accord .sig { height: 34mm; border-bottom: .75pt solid ${GRIS}; display: flex; align-items: flex-end; }
  .accord .sig img { max-height: 32mm; max-width: 100%; }
  .accord span { display: block; font-size: 10.5pt; color: ${GRIS}; margin-top: 1.5mm; }

  .listes { display: flex; gap: 12mm; }
  .listes > div { flex: 1; min-width: 0; }
  .fin { display: flex; align-items: center; justify-content: center; }
  .fin img { width: 150mm; }
  .bas { position: absolute; left: 18mm; right: 18mm; bottom: 8mm; display: flex; justify-content: space-between;
    font-size: 9.5pt; color: ${GRIS}; }
`;

const page = (titre, corps) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baguet+Script&family=EB+Garamond:wght@400;600&display=block" rel="stylesheet">
<style>${style}</style></head><body>${corps}</body></html>`;

// La tache orange de la page de garde : un aplat au bord droit fait de
// coups de pinceau, comme sur le modèle. Le bord est TIRÉ D'UN HASARD FIXE
// (graine constante) : la même tache à chaque impression, mais un trait
// irrégulier, pas des dents de scie.
export const TACHE = (() => {
  let g = 7;
  const hasard = () => { g = (g * 16807) % 2147483647; return g / 2147483647; };
  const pts = [];
  for (let y = 0; y <= 168; y += 3.2) {
    const base = 168 - y * 0.2;                         // le bord recule en descendant
    let x = base + (hasard() - 0.5) * 9;
    pts.push([x, y]);
    if (hasard() < 0.22) {                             // un poil de pinceau qui dépasse
      const long = 6 + hasard() * 16;
      pts.push([x + long, y + 0.6], [x + 1, y + 1.3]);
    }
  }
  const bord = pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return `<svg class="tache" viewBox="0 0 215 170" preserveAspectRatio="none" aria-hidden="true">
    <path fill="${ORANGE}" d="M0 0 L${pts[0][0].toFixed(1)} 0 ${bord} L120 170 L0 170 Z"/></svg>`;
})();

const titreFichier = (quoi, d) => {
  const n = String(d.nomFichier || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n ? `${quoi} - ${n}` : quoi;
};

export function donnees(chantier, cahier, dossier) {
  const d = dossier ? donneesDocument(dossier) : { nom: '', telephone: '', email: '', adresseChantier: '', nomFichier: '', typeBien: '', travaux: '' };
  return {
    ...d,
    adresse: chantier.adresse || d.adresseChantier || '',
    typeBien: cahier.type_bien || d.typeBien || '',
    nature: cahier.nature || d.travaux || '',
  };
}

const ligneTravail = (p) => `<li><div>${esc(p.designation)}${p.quantite || p.unite
  ? ` <span class="q">— ${esc([p.quantite, p.unite].filter(Boolean).join(' '))}</span>` : ''}${p.detail ? `<small>${esc(p.detail)}</small>` : ''}</div></li>`;

const cadres = (urls) => (urls.length
  ? `<div class="photos ${urls.length > 1 ? 'deux' : 'une'}">${urls.slice(0, 2).map(u => `<div class="cadre"><img src="${u}" alt=""></div>`).join('')}</div>`
  : '');

async function corps(chantier, cahier, dossier, version) {
  const d = donnees(chantier, cahier, dossier);
  const urls = await liensDuCahier(cahier);
  const postes = Array.isArray(cahier.postes) ? cahier.postes : [];
  const photosDe = (lot) => (cahier.photos || []).filter(p => (p.lot || '') === lot).map(p => urls[p.chemin]).filter(Boolean);
  const pieces = piecesDe(postes);
  const equipe = version === 'equipe';
  const signe = cahier.signature && cahier.signe_le;

  const garde = `<section class="page garde">${TACHE}
    <div class="bloc">
      <h1>Cahier des charges</h1>
      ${d.adresse ? `<p class="adresse">${esc(d.adresse)}</p>` : ''}
      ${d.typeBien ? `<p class="info">${esc(d.typeBien)}</p>` : ''}
      ${d.nature ? `<p class="info">${esc(d.nature)}</p>` : ''}
      ${equipe ? '<span class="equipe">Version équipe</span>' : ''}
    </div>
    <img class="logo" src="${LOGO}" alt="RGD Renova"></section>`;

  // « Interventions » : une ligne par pièce, ses premiers travaux, et la
  // première photo du chantier à droite.
  const premiere = (cahier.photos || []).map(p => urls[p.chemin]).find(Boolean);
  const resume = `<section class="page">
    <div class="colonnes"><div class="texte">
      <h2 class="sobre">Interventions</h2>
      <div class="infos">
        ${d.nom ? `<span>Client : <b>${esc(d.nom)}</b></span>` : ''}
        <span>Du <b>${esc(dateLongue(chantier.date_debut))}</b> au <b>${esc(dateLongue(finDe(chantier)))}</b> (${esc(dureeLue(chantier).texte)})</span>
        ${cahier.devis_numero ? `<span>Devis <b>${esc(cahier.devis_numero)}</b></span>` : ''}
        ${equipe && d.telephone ? `<span>Tél. client : <b>${esc(d.telephone)}</b></span>` : ''}
      </div>
      <ul class="travaux">${pieces.map(lot => {
        const l = postes.filter(p => (p.lot || '') === lot);
        const extrait = l.slice(0, 3).map(p => p.designation).join(', ') + (l.length > 3 ? '…' : '');
        return `<li><div><b>${esc(lot || 'Travaux')}</b> : ${esc(extrait)}</div></li>`;
      }).join('')}</ul>
    </div>${premiere ? `<div class="photos une"><div class="cadre" style="height:150mm"><img src="${premiere}" alt=""></div></div>` : ''}</div>
  </section>`;

  const plan = cahier.plan && urls[cahier.plan]
    ? `<section class="page"><h2 class="sobre">Plan</h2><div class="plan"><img src="${urls[cahier.plan]}" alt="Plan"></div></section>` : '';

  const pagesPieces = pieces.map(lot => {
    const l = postes.filter(p => (p.lot || '') === lot);
    const ph = photosDe(lot);
    return `<section class="page">
      <div class="colonnes"><div class="texte">
        <h2 class="piece">${esc(lot || 'Travaux')}</h2>
        <ul class="travaux${equipe ? ' cases' : ''}">${l.map(ligneTravail).join('')}</ul>
      </div>${cadres(ph)}</div>
    </section>`;
  }).join('');

  const fin = equipe ? `<section class="page">
      <h2 class="piece">Préparation</h2>
      ${cahier.consignes ? `<h3>Consignes</h3><p class="texte-libre">${esc(cahier.consignes)}</p>` : ''}
      ${cahier.precisions ? `<h3>Convenu avec le client</h3><p class="texte-libre">${esc(cahier.precisions)}</p>` : ''}
      <div class="listes">
        ${['materiaux', 'outils'].map(liste => {
          const l = lignesDe(chantier.id, liste);
          return `<div><h3>${liste === 'materiaux' ? 'Matériaux' : 'Outils'}</h3>${l.length
            ? `<ul class="travaux cases">${l.map(x => `<li><div>${esc(x.libelle)}${x.quantite ? ` <span class="q">— ${esc(x.quantite)}</span>` : ''}${
              x.deja_la ? ' <span class="q">(en stock)</span>' : x.achete ? ' <span class="q">(acheté)</span>' : ''}</div></li>`).join('')}</ul>`
            : '<p class="texte-libre" style="color:#6E6760">Rien de prévu.</p>'}</div>`;
        }).join('')}
      </div>
      ${chantier.notes ? `<h3>Notes du chantier</h3><p class="texte-libre">${esc(chantier.notes)}</p>` : ''}
      <div class="bas"><span>RGD Renova — document interne, ne pas remettre au client</span><span>rgdrenova.fr</span></div>
    </section>`
    : `<section class="page">
      <h2 class="piece">Bon pour accord</h2>
      ${cahier.precisions ? `<h3>À la charge du client</h3><p class="texte-libre">${esc(cahier.precisions)}</p>` : ''}
      <div class="accord">
        <p>Je soussigné(e) déclare avoir pris connaissance du présent cahier des charges et en valider le contenu avant le
          démarrage des travaux. Il complète le devis${cahier.devis_numero ? ` n° ${esc(cahier.devis_numero)}` : ''}, qui reste seul à faire foi pour les prix.</p>
        <div class="zone">
          <div style="flex:1"><div class="sig">${signe ? `<img src="${cahier.signature}" alt="Signature du client">` : ''}</div>
            <span>Signature du client${signe && cahier.signe_par ? ` — ${esc(cahier.signe_par)}` : ''}${
              signe && cahier.signe_mode === 'a_distance' ? ' (signé en ligne)' : ''}</span></div>
          <div style="flex:0 0 70mm"><div class="sig" style="height:auto;min-height:10mm">${signe ? esc(quand(cahier.signe_le)) : ''}</div>
            <span>Date</span></div>
        </div>
      </div>
    </section>
    <section class="page fin"><img src="${LOGO}" alt="RGD Renova"></section>`;

  return { d, html: garde + resume + plan + pagesPieces + fin };
}

export async function cahierHtml(chantier, cahier, dossier, version = 'client') {
  const { d, html } = await corps(chantier, cahier, dossier, version);
  const titre = titreFichier(version === 'equipe' ? 'Cahier des charges équipe' : 'Cahier des charges', d);
  return { titre, html: page(titre, html) };
}

// ⚠ ON ATTEND LES POLICES ET LES PHOTOS AVANT D'IMPRIMER : sans ça, la page de
// la pièce sortait dans la police de secours et les photos, lues par lien
// signé, n'étaient pas encore arrivées. Même cadre invisible que `imprimerPage`
// (marge de page nulle, titre = nom du fichier), avec cette attente en plus.
async function imprimer(html, titre) {
  const avant = document.title;
  document.title = titre;
  const cadre = document.createElement('iframe');
  cadre.setAttribute('aria-hidden', 'true');
  cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(cadre);
  await new Promise(ok => { cadre.onload = ok; cadre.srcdoc = html; });
  const f = cadre.contentWindow;
  try { await Promise.race([f.document.fonts.ready, new Promise(ok => setTimeout(ok, 4000))]); } catch { /* */ }
  await Promise.all([...f.document.images].map(i => (i.complete ? null
    : new Promise(ok => { i.onload = ok; i.onerror = ok; setTimeout(ok, 8000); }))));
  const remettre = () => { document.title = avant; };
  f.addEventListener('afterprint', remettre, { once: true });
  try { f.focus(); f.print(); } finally { setTimeout(() => cadre.remove(), 1000); setTimeout(remettre, 60000); }
}

export async function imprimerCahierClient(chantier, cahier, dossier) {
  const { titre, html } = await cahierHtml(chantier, cahier, dossier, 'client');
  await imprimer(html, titre);
}
export async function imprimerCahierOuvriers(chantier, cahier, dossier) {
  const { titre, html } = await cahierHtml(chantier, cahier, dossier, 'equipe');
  await imprimer(html, titre);
}
