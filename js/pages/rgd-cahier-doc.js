// Le cahier des charges en PDF (11/11/2026).
//
// ⚠ LE PDF EST LA PRÉSENTATION, PAGE POUR DIAPOSITIVE. Élodie a choisi la
// « piste A » (photo de la pièce en plein cadre, panneau translucide, grand
// numéro) pour la présentation dans le CRM, et le PDF remis aux ouvriers et
// aux clients reprend exactement les mêmes diapositives (`rgd-cahier-diapos.js`),
// une par page A4 à l'italienne. Deux versions : client (Bon pour accord,
// signature) et équipe (cases à cocher, Préparation). Aucun prix.
//
// La première version, calquée sur son PowerPoint (garde orange, Baguet
// Script, Garamond), a été refusée le même jour : ne pas y revenir.
//
// On l'obtient par l'impression du navigateur (« Enregistrer au format PDF »),
// marge de page nulle comme les autres documents RGD — ce qui retire l'en-tête
// et le pied que Chrome ajoute sinon.
import { esc } from '../ui.js';
import { donneesDocument } from './rgd-documents.js';
import { liensDuCahier } from '../data/rgd-cahier.js';
import { diapos, STYLE_DIAPOS, POLICES } from './rgd-cahier-diapos.js';

const titreFichier = (quoi, d) => {
  const n = String(d.nomFichier || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n ? `${quoi} - ${n}` : quoi;
};

// Ce que le cahier sait du dossier : nom, téléphone, adresse du chantier, et la
// page de garde (type de bien, nature des travaux), reprise du dossier tant
// qu'on ne l'a pas retouchée.
export function donnees(chantier, cahier, dossier) {
  const d = dossier ? donneesDocument(dossier) : { nom: '', telephone: '', email: '', adresseChantier: '', nomFichier: '', typeBien: '', travaux: '' };
  return {
    ...d,
    adresse: chantier.adresse || d.adresseChantier || '',
    typeBien: cahier.type_bien || d.typeBien || '',
    nature: cahier.nature || d.travaux || '',
  };
}

const STYLE_PAGE = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #14110E; }
  .page { position: relative; width: 297mm; height: 210mm; overflow: hidden; container-type: inline-size;
    break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }
  .cd-tuile { cursor: default; }
`;

export async function cahierHtml(chantier, cahier, dossier, version = 'client') {
  const d = donnees(chantier, cahier, dossier);
  const urls = await liensDuCahier(cahier);
  const pages = diapos(chantier, cahier, dossier, version, urls).map(s => `<section class="page">${s.html}</section>`).join('');
  const titre = titreFichier(version === 'equipe' ? 'Cahier des charges équipe' : 'Cahier des charges', d);
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${POLICES}" rel="stylesheet">
<style>${STYLE_PAGE}${STYLE_DIAPOS}</style></head><body>${pages}</body></html>`;
  return { titre, html };
}

// ⚠ ON ATTEND LES POLICES ET LES PHOTOS AVANT D'IMPRIMER : sans ça, les
// titres sortaient dans la police de secours et les photos, lues par lien
// signé, n'étaient pas encore arrivées. Cadre invisible comme `imprimerPage`
// (titre = nom du fichier proposé), avec cette attente en plus.
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
