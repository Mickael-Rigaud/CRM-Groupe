// Le cahier des charges imprimé, en deux versions (11/11/2026, Élodie).
//
// · VERSION CLIENT : les travaux poste par poste, les dates, ce qui est à la
//   charge du client, et un cadre « Bon pour accord » — signé au doigt dans le
//   CRM (l'image s'imprime), ou à la main sur la feuille.
// · VERSION OUVRIERS : les mêmes postes avec une case à cocher, les consignes
//   techniques, les listes matériaux et outils du chantier, le téléphone du
//   client. Jamais remise au client : elle porte des consignes internes.
//
// ⚠ AUCUN PRIX, SUR AUCUNE DES DEUX. Les postes n'en portent pas (voir
// `data/rgd-cahier.js`) ; ne pas en ajouter ici.
//
// Même mécanisme d'impression que les autres documents RGD (`imprimerPage`,
// marge de page nulle, aucun texte clair sur un fond : voir l'en-tête de
// `rgd-documents.js`, dont on reprend les règles).
import { esc } from '../ui.js';
import { imprimerPage } from './btp-fiche.js';
import { donneesDocument } from './rgd-documents.js';
import { lignesDe, finDe, dureeLue, versDate } from '../data/rgd-planning.js';

const LOGO = new URL('../../assets/logos/rgd-complet.png', import.meta.url).href;
const ORANGE = '#FC5D00';
const ENCRE = '#1A1714';
const GRIS = '#6E6760';
const FILET = '#D8D3CE';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => { if (!iso) return ''; const d = versDate(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const quand = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const style = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 13mm 14mm; font: 10.5pt/1.45 Arial, Helvetica, sans-serif; color: ${ENCRE};
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; align-items: flex-end; gap: 16px; padding-bottom: 8px; border-bottom: 2.5pt solid ${ORANGE}; }
  header img { width: 58mm; height: auto; }
  header .t { flex: 1; text-align: right; }
  header h1 { margin: 0; font-size: 15pt; letter-spacing: .02em; }
  header h1 small { display: block; font-size: 10.5pt; font-weight: 700; color: ${GRIS}; letter-spacing: .04em; }
  h2 { margin: 14px 0 6px; padding: 4px 9px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .06em;
    color: ${ENCRE}; background: #F4F1EE; border-left: 4pt solid ${ORANGE}; break-after: avoid; }
  .champs { display: flex; gap: 14px; margin-top: 6px; }
  .champ { flex: 1; min-width: 0; }
  .champ > span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: ${GRIS}; }
  .champ > b { display: block; min-height: 1.5em; line-height: 1.5; padding: 2px 0 3px; font-size: 10.5pt; border-bottom: .75pt solid ${FILET}; }
  .champ.etroit { flex: 0 0 40mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: ${GRIS};
    padding: 4px 6px; border-bottom: 1pt solid ${ENCRE}; }
  td { padding: 6px 6px; border-bottom: .75pt solid ${FILET}; vertical-align: top; }
  td.q, th.q { width: 22mm; text-align: right; white-space: nowrap; }
  td.c, th.c { width: 9mm; text-align: center; }
  td small { display: block; color: ${GRIS}; font-size: 9pt; margin-top: 2px; white-space: pre-wrap; }
  tr { break-inside: avoid; }
  tr.lot td { padding-top: 10px; font-weight: 700; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em;
    border-bottom: 1pt solid ${ORANGE}; }
  .case { display: inline-block; width: 4mm; height: 4mm; border: 1pt solid ${ENCRE}; }
  .case.ok { background: ${ENCRE}; }
  .texte { white-space: pre-wrap; margin: 4px 0 0; }
  .vide { color: ${GRIS}; font-style: italic; }
  .accord { margin-top: 14px; border: 1pt solid ${ENCRE}; padding: 10px 12px; break-inside: avoid; }
  .accord p { margin: 0 0 8px; }
  .accord .zone { display: flex; gap: 20px; align-items: flex-end; }
  .accord .zone > div { flex: 1; }
  .accord .sig { height: 30mm; border-bottom: .75pt solid ${GRIS}; display: flex; align-items: flex-end; }
  .accord .sig img { max-height: 28mm; max-width: 100%; }
  .accord span { display: block; font-size: 8pt; color: ${GRIS}; margin-top: 3px; }
  .listes { display: flex; gap: 14px; }
  .listes > div { flex: 1; min-width: 0; }
  footer { margin-top: 14px; padding-top: 6px; border-top: .75pt solid ${FILET};
    display: flex; justify-content: space-between; gap: 14px; font-size: 8pt; color: ${GRIS}; }
  footer b { color: ${ORANGE}; }
`;

const page = (titre, corps) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<style>${style}</style></head><body>${corps}</body></html>`;
const champ = (l, v, c = '') => `<div class="champ ${c}"><span>${esc(l)}</span><b>${v ? esc(v) : '&nbsp;'}</b></div>`;
const entete = (titre, sous) => `<header><img src="${LOGO}" alt="RGD Renova">
  <div class="t"><h1>${esc(titre)}${sous ? `<small>${esc(sous)}</small>` : ''}</h1></div></header>`;
const pied = (g) => `<footer><span>${esc(g)}</span><b>rgdrenova.fr</b></footer>`;

// Les postes, rangés par lot dans l'ordre où ils viennent.
function tableauPostes(postes, avecCase) {
  if (!postes.length) return '<p class="vide">Aucun poste de travaux renseigné.</p>';
  let lot = null;
  const lignes = [];
  for (const p of postes) {
    if ((p.lot || '') !== lot) {
      lot = p.lot || '';
      if (lot) lignes.push(`<tr class="lot"><td colspan="${avecCase ? 3 : 2}">${esc(lot)}</td></tr>`);
    }
    lignes.push(`<tr>${avecCase ? '<td class="c"><span class="case"></span></td>' : ''}
      <td>${esc(p.designation)}${p.detail ? `<small>${esc(p.detail)}</small>` : ''}</td>
      <td class="q">${esc([p.quantite, p.unite].filter(Boolean).join(' '))}</td></tr>`);
  }
  return `<table><thead><tr>${avecCase ? '<th class="c">Fait</th>' : ''}<th>Travaux</th><th class="q">Quantité</th></tr></thead>
    <tbody>${lignes.join('')}</tbody></table>`;
}

const titreFichier = (quoi, d) => {
  const n = String(d.nomFichier || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n ? `${quoi} - ${n}` : quoi;
};

function donnees(chantier, dossier) {
  const d = dossier ? donneesDocument(dossier) : { nom: '', telephone: '', email: '', adresseChantier: '', nomFichier: '' };
  return { ...d, adresse: chantier.adresse || d.adresseChantier || '' };
}

export function cahierClientHtml(chantier, cahier, dossier) {
  const d = donnees(chantier, dossier);
  const postes = Array.isArray(cahier.postes) ? cahier.postes : [];
  const signe = cahier.signature && cahier.signe_le;
  return page(titreFichier('Cahier des charges', d), `
    ${entete('CAHIER DES CHARGES', cahier.objet || chantier.titre)}
    <h2>Client et chantier</h2>
    <div class="champs">${champ('Client', d.nom)}${champ('Téléphone', d.telephone, 'etroit')}</div>
    <div class="champs">${champ('Adresse du chantier', d.adresse)}</div>
    <div class="champs">${champ('Début prévu', dateLongue(chantier.date_debut))}${champ('Fin prévue', dateLongue(finDe(chantier)))}${
      champ('Durée', dureeLue(chantier).texte, 'etroit')}${cahier.devis_numero ? champ('Devis', cahier.devis_numero, 'etroit') : ''}</div>
    <h2>Description des travaux</h2>
    ${tableauPostes(postes, false)}
    ${cahier.precisions ? `<h2>Précisions — à la charge du client</h2><p class="texte">${esc(cahier.precisions)}</p>` : ''}
    <div class="accord">
      <p><b>Bon pour accord.</b> Je soussigné(e) déclare avoir pris connaissance du présent cahier des charges
      et en valider le contenu avant le démarrage des travaux. Il complète le devis${cahier.devis_numero ? ` n° ${esc(cahier.devis_numero)}` : ''},
      qui reste seul à faire foi pour les prix.</p>
      <div class="zone">
        <div><div class="sig">${signe ? `<img src="${cahier.signature}" alt="Signature du client">` : ''}</div>
          <span>Signature du client${signe && cahier.signe_par ? ` — ${esc(cahier.signe_par)}` : ''}</span></div>
        <div style="flex:0 0 55mm"><div class="sig" style="height:auto;min-height:8mm">${signe ? esc(quand(cahier.signe_le)) : ''}</div>
          <span>Date</span></div>
      </div>
    </div>
    ${pied('RGD Renova — cahier des charges remis au client')}`);
}

export function cahierOuvriersHtml(chantier, cahier, dossier) {
  const d = donnees(chantier, dossier);
  const postes = Array.isArray(cahier.postes) ? cahier.postes : [];
  const liste = (nom, l) => `<div><h2>${esc(nom)}</h2>${l.length ? `<table><tbody>${l.map(x => `<tr>
      <td class="c"><span class="case${x.deja_la || x.achete ? ' ok' : ''}"></span></td>
      <td>${esc(x.libelle)}</td><td class="q">${esc(x.quantite || '')}</td></tr>`).join('')}</tbody></table>`
    : '<p class="vide">Rien de prévu.</p>'}</div>`;
  return page(titreFichier('Cahier des charges équipe', d), `
    ${entete('CAHIER DES CHARGES — ÉQUIPE', cahier.objet || chantier.titre)}
    <h2>Chantier</h2>
    <div class="champs">${champ('Adresse', d.adresse)}</div>
    <div class="champs">${champ('Client', d.nom)}${champ('Téléphone du client', d.telephone, 'etroit')}</div>
    <div class="champs">${champ('Début', dateLongue(chantier.date_debut))}${champ('Fin prévue', dateLongue(finDe(chantier)))}${
      champ('Durée', dureeLue(chantier).texte, 'etroit')}</div>
    <h2>Travaux à réaliser</h2>
    ${tableauPostes(postes, true)}
    ${cahier.consignes ? `<h2>Consignes</h2><p class="texte">${esc(cahier.consignes)}</p>` : ''}
    ${cahier.precisions ? `<h2>Convenu avec le client</h2><p class="texte">${esc(cahier.precisions)}</p>` : ''}
    <div class="listes">${liste('Matériaux', lignesDe(chantier.id, 'materiaux'))}${liste('Outils', lignesDe(chantier.id, 'outils'))}</div>
    ${chantier.notes ? `<h2>Notes du chantier</h2><p class="texte">${esc(chantier.notes)}</p>` : ''}
    ${pied('RGD Renova — document interne, ne pas remettre au client')}`);
}

export const imprimerCahierClient = (chantier, cahier, dossier) => {
  const d = donnees(chantier, dossier);
  imprimerPage(cahierClientHtml(chantier, cahier, dossier), titreFichier('Cahier des charges', d));
};
export const imprimerCahierOuvriers = (chantier, cahier, dossier) => {
  const d = donnees(chantier, dossier);
  imprimerPage(cahierOuvriersHtml(chantier, cahier, dossier), titreFichier('Cahier des charges équipe', d));
};
