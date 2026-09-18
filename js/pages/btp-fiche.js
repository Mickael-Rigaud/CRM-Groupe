// L'impression des fiches du cabinet : le mécanisme, et l'habillage commun.
//
// PAS DE BIBLIOTHÈQUE PDF
// Une fiche est une page HTML mise en page pour l'A4, rendue dans un cadre invisible
// et confiée à l'impression du navigateur : « Enregistrer au format PDF » y est une
// destination comme une autre. Un cadre plutôt qu'une fenêtre séparée — une fenêtre
// s'ouvre au bon vouloir du bloqueur de publicités, un cadre non.
//
// LA MARGE DE PAGE EST NULLE, ET C'EST VOULU
// Tant que `@page` a une marge, le navigateur s'en sert pour écrire son propre
// en-tête (le titre, l'adresse) et son pied de page (la date, le numéro de page) —
// sur une fiche remise au client, ça n'a rien à y faire. À marge nulle, il n'a plus
// où les poser et les abandonne. Les vraies marges sont alors portées par le
// remplissage du corps ; la deuxième page, qui n'en hériterait pas, reçoit la sienne
// par `.p2`, qui force aussi la coupure au bon endroit plutôt que de la subir.
import { esc } from '../ui.js';

export const LOGO = new URL('../../assets/logos/btp-complet.png', import.meta.url).href;

export const CABINET_PIED = {
  ligne1: 'BTP Expertise — Expertise technique du bâtiment & Assistance à Maîtrise d’Ouvrage',
  ligne2: '18 rue Masséna, Nice · 06 81 65 15 91 · btpexpertise.fr',
};

const MARGE = '12mm 13mm';

export const styleFiche = (c) => `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: ${MARGE}; font: 10.5pt/1.45 Arial, Helvetica, sans-serif; color: #1F2A37; }
  .p2 { break-before: page; page-break-before: always; padding-top: 12mm; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 9px; border-bottom: 2.5px solid ${c.couleur}; }
  header img { width: 112px; height: auto; }
  header .t { flex: 1; }
  header h1 { margin: 0; font-size: 14pt; color: #004B62; }
  header p { margin: 2px 0 0; font-size: 8.5pt; color: #5B6B7A; }
  header .ref { text-align: right; font-size: 8.5pt; line-height: 1.5; color: #5B6B7A; }
  h2 { margin: 12px 0 5px; font-size: 10pt; color: ${c.encre}; text-transform: uppercase; letter-spacing: .04em; }
  table.i { width: 100%; border-collapse: collapse; }
  table.i th { width: 36%; text-align: left; font-weight: 600; color: #5B6B7A; padding: 2.5px 8px 2.5px 0; vertical-align: top; }
  table.i td { padding: 2.5px 0; vertical-align: top; }
  table.i i { color: #9AA6B2; }
  .cases { display: flex; flex-wrap: wrap; gap: 2px 13px; }
  .cases .c { font-size: 9pt; color: #7B8794; white-space: nowrap; }
  .cases .c.on { color: #1F2A37; font-weight: 700; }
  .desc { margin: 4px 0 0; padding: 6px 9px; background: #F4F6F8; border-left: 2.5px solid ${c.couleur}; white-space: pre-wrap; font-size: 9.5pt; }
  table.s { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9pt; }
  table.s th, table.s td { border: 1px solid #D8DEE5; padding: 4px 7px; text-align: left; }
  table.s thead th { background: #F4F6F8; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #5B6B7A; }
  table.s td.on { background: ${c.clair}; font-weight: 700; color: ${c.encre}; }
  .bilan { display: flex; gap: 9px; margin-top: 9px; }
  .bilan div { flex: 1; padding: 8px 10px; border: 1px solid #D8DEE5; border-radius: 4px; }
  .bilan span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: #5B6B7A; }
  .bilan b { font-size: 13pt; color: ${c.encre}; }
  .bilan.fort div { background: ${c.clair}; border-color: ${c.couleur}; }
  .note { margin: 6px 0 0; font-size: 8.5pt; color: #8A6D3B; }
  .sign { margin-top: 14px; display: flex; gap: 30px; font-size: 9pt; color: #5B6B7A; }
  .sign div { flex: 1; }
  .sign u { display: block; margin-top: 24px; border-top: 1px solid #9AA6B2; text-decoration: none; }
  footer { margin-top: 14px; padding-top: 7px; border-top: 1px solid #D8DEE5; font-size: 8pt; color: #5B6B7A;
    display: flex; justify-content: space-between; gap: 12px; }
  @media print { .cases, .bilan, table.s, header, .sign { break-inside: avoid; } h2 { break-after: avoid; } }
`;

export const enteteFiche = ({ titre, sous, droite }) => `
<header>
  <img src="${LOGO}" alt="BTP Expertise">
  <div class="t"><h1>${esc(titre)}</h1><p>${esc(sous)}</p></div>
  <div class="ref">${droite}</div>
</header>`;

export const piedFiche = () => `
<footer><span>${esc(CABINET_PIED.ligne1)}</span><span>${esc(CABINET_PIED.ligne2)}</span></footer>`;

export const signatures = (gauche, droite) => `
<div class="sign"><div>${esc(gauche)}<u></u></div><div>${esc(droite)}<u></u></div></div>`;

export const cases = (liste, retenus = []) => liste.map(x =>
  `<span class="c ${retenus.includes(x) ? 'on' : ''}">${retenus.includes(x) ? '☒' : '☐'} ${esc(x)}</span>`).join('');

export const ligne = (lbl, val) => `<tr><th>${esc(lbl)}</th><td>${val ? esc(val) : '<i>—</i>'}</td></tr>`;

export const pageFiche = ({ titre, couleurs, corps }) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<style>${styleFiche(couleurs)}</style></head><body>${corps}</body></html>`;

// Le seul point d'entrée pour imprimer la fiche d'une affaire. La mise en page est
// choisie par le métier écrit dans la fiche — les fiches d'avant, qui ne le disent
// pas, sont des AMO. Le module de mise en page n'est chargé qu'ici, au moment du
// clic : les espaces qui n'impriment jamais de fiche n'ont pas à le télécharger.
export async function imprimerFicheDeal(fiche) {
  const mod = await import(fiche?.metier === 'expertise' ? './btp-expertise.js' : './btp-amo.js');
  imprimerPage(mod.ficheHtml(fiche));
}

// On attend le chargement avant d'imprimer : sans cela le logo manque à la feuille.
export function imprimerPage(html) {
  const cadre = document.createElement('iframe');
  cadre.setAttribute('aria-hidden', 'true');
  cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(cadre);
  cadre.onload = () => {
    const f = cadre.contentWindow;
    const lancer = () => { try { f.focus(); f.print(); } finally { setTimeout(() => cadre.remove(), 1000); } };
    if (f.document.readyState === 'complete') lancer();
    else f.addEventListener('load', lancer, { once: true });
  };
  cadre.srcdoc = html;
}
