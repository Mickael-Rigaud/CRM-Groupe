// Le cahier des charges de l'ÉQUIPE, fait pour le papier (12/11/2026).
//
// ⚠ CE N'EST PLUS UNE DIAPOSITIVE, ET C'EST LE POINT (Élodie, 12/11/2026 :
// « pour les ouvriers on va alléger le visuel, puisque le but c'est de
// l'imprimer »). La version équipe reprenait les diapositives du client :
// fond sombre plein cadre, photo de la pièce en pleine page, grand numéro en
// filigrane. Imprimée, chaque feuille vidait la cartouche, le texte blanc sur
// noir se lisait mal sous une lampe de chantier, et on ne pouvait rien écrire
// dessus. Ses deux choix, le même jour : **papier blanc, aucune photo** et
// **une page par pièce, en portrait**.
//
// ⚠ LA VERSION CLIENT NE CHANGE PAS : elle reste la présentation en
// diapositives (`rgd-cahier-diapos.js` + `rgd-cahier-doc.js`). Élodie :
// « pour les clients on va faire quelque chose de plus technique, on verra ça
// plus tard ». Les deux documents ont désormais deux gabarits distincts, et
// c'est voulu — ils ne servent pas au même usage.
//
// ⚠ LA PAGINATION EST LAISSÉE AU NAVIGATEUR, pas calculée. Chaque pièce
// commence sur une page (`break-before`), chaque ligne reste entière
// (`break-inside: avoid`), et l'en-tête de la pièce se répète si elle déborde
// — c'est à quoi sert le `<thead>` d'un `<table>`, seule méthode fiable pour
// répéter quelque chose en haut de chaque page. Compter les lignes « qui
// tiennent » aurait été faux au premier détail un peu long.
//
// ⚠ LES MARGES SONT CELLES DE `@page`, PAS UN PADDING DE BODY. Avec
// `@page { margin: 0 }`, le padding du `body` ne s'applique qu'au haut de la
// PREMIÈRE page et au bas de la DERNIÈRE : le texte de la page 2 collerait au
// bord. Ici le document coule sur plusieurs pages, donc les marges sont
// portées par `@page`.
import { esc } from '../ui.js';
import { lignesDe, versDate } from '../data/rgd-planning.js';
import { finDe, dureeLue } from '../data/rgd-planning.js';
import { piecesDe, pointsDuDetail, elementsDe, FAMILLES } from '../data/rgd-cahier.js';
import { donnees } from './rgd-cahier-doc.js';
import { POLICES } from './rgd-cahier-diapos.js';

const LOGO = new URL('../../assets/logos/rgd-complet.png', import.meta.url).href;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => {
  if (!iso) return '';
  const d = versDate(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
};
const qte = (p) => [p.quantite, p.unite].filter(Boolean).join(' ');
const CASE = '<i class="co-case" aria-hidden="true"></i>';
const points = (detail) => {
  const l = pointsDuDetail(detail);
  if (!l.length) return '';
  return `<ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
};

export const STYLE_OUVRIERS = `
  @page { size: A4; margin: 12mm 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #14110E;
    font: 400 10.5pt/1.4 Inter, Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* L'en-tête du document, sur la première page seulement. */
  .co-tete { display: flex; align-items: flex-start; gap: 10mm; border-bottom: 1.1mm solid #FC5D00;
    padding-bottom: 4mm; margin-bottom: 6mm; }
  .co-tete img { width: 42mm; flex: none; }
  .co-tete .co-t { flex: 1; }
  .co-sur { font: 700 7.5pt/1.2 Inter, Arial, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: #8A7F76; }
  .co-tete h1 { font: 800 19pt/1.1 'Inter Tight', Inter, Arial, sans-serif; letter-spacing: -.02em; margin: 1.5mm 0 2mm; }
  .co-tete p { margin: 0; font-size: 9.5pt; color: #3F3933; }
  .co-tete b { font-weight: 700; color: #14110E; }

  /* Le sommaire : deux colonnes de pièces, et ce qu'il y a à faire dans chacune. */
  .co-bloc { break-inside: avoid; margin-bottom: 6mm; }
  .co-bloc h2 { font: 800 11pt/1.2 'Inter Tight', Inter, Arial, sans-serif; letter-spacing: -.01em;
    text-transform: uppercase; margin: 0 0 2.5mm; padding-left: 3mm; border-left: 1.1mm solid #FC5D00; }
  .co-somm { column-count: 2; column-gap: 8mm; }
  .co-somm div { break-inside: avoid; display: flex; gap: 3mm; padding: 1.5mm 0;
    border-bottom: .2mm solid #E4DFD9; font-size: 10pt; }
  .co-somm em { font-style: normal; font-weight: 700; color: #FC5D00; width: 7mm; flex: none; }
  .co-somm b { flex: 1; font-weight: 600; }
  .co-somm span { color: #6B625B; font-size: 9pt; }
  .co-libre { white-space: pre-wrap; margin: 0 0 2mm; font-size: 10pt; }
  /* Matériaux et outils côte à côte sur la page de tête : les deux listes se
     lisent d'un coup d'œil au moment de charger le camion. */
  .co-emporter { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8mm; }
  .co-emporter .co-piece td { padding: .9mm 0; }
  .co-emporter .co-d b { font-size: 9.5pt; }

  /* ⚠ UNE PIÈCE EST UNE FICHE ENCADRÉE — PISTE C, CHOISIE PAR ÉLODIE LE
     17/11/2026 (« les travaux ne se distinguent pas entre eux, on ne comprend
     pas trop quel travail appartient à quelle pièce »). Avant, un simple filet
     orange passait SOUS le titre : il fermait le titre au lieu d'ouvrir le
     bloc, et rien ne tenait les travaux ensemble. Trois pistes lui ont été
     imprimées (bandeau plein, barre latérale, cadre et pastille) ; ne pas
     revenir aux deux autres.
     Le cadre tient la pièce même quand la feuille est pliée en quatre dans une
     poche, et une ligne sur deux est grisée pour suivre le texte jusqu'à la
     quantité. */
  /* ⚠ UNE PAGE PAR PIÈCE, ET C'EST UNE AFFICHE (17/11/2026, Élodie : « je veux
     que chaque pièce soit sur une page différente pour pouvoir afficher les
     feuilles au mur de chaque pièce »). La raison change le dessin : la feuille
     ne se feuillette pas, elle se regarde de loin et punaisée. D'où le nom de
     la pièce en 24 points, le chantier rappelé au-dessus pour ne pas mélanger
     deux affaires, et le rappel « document interne » sur chaque feuille — une
     feuille au mur est vue par le client. */
  table.co-piece { width: 100%; border-collapse: collapse; break-inside: avoid;
    break-before: page; border: .45mm solid #14110E; border-radius: 2mm; }
  /* ⚠ LES LISTES « À EMPORTER » EMPRUNTENT CE TABLEAU SANS ÊTRE DES PIÈCES :
     sans ce rattrapage, matériaux et outils réclamaient chacun leur page, et
     la fin du cahier passait de une à trois feuilles (vu à l'essai, 17/11). */
  table.co-piece.premiere { break-before: auto; border: 0; }
  .co-piece thead th { text-align: left; padding: 0; }
  .co-piece-tete { display: flex; align-items: center; gap: 3.5mm;
    padding: 3mm 4.5mm 2.8mm; border-bottom: .45mm solid #14110E; }
  .co-piece-tete em { font-style: normal; font-weight: 800; color: #fff; background: #FC5D00;
    border-radius: 99mm; width: 10mm; height: 10mm; display: grid; place-items: center;
    font-size: 12pt; flex: none; }
  .co-piece-tete .co-nom { flex: 1; }
  .co-piece-tete .co-ou { font: 700 7.5pt/1.2 Inter, Arial, sans-serif; letter-spacing: .14em;
    text-transform: uppercase; color: #8A7F76; display: block; margin-bottom: .8mm; }
  .co-piece-tete h2 { font: 800 21pt/1.05 'Inter Tight', Inter, Arial, sans-serif;
    letter-spacing: -.025em; margin: 0; }
  .co-piece-tete .co-compte { font: 700 9pt/1.2 Inter, Arial, sans-serif; color: #3F3933; flex: none;
    background: #F3EFEA; border-radius: 99mm; padding: 1.4mm 4mm; }

  .co-piece td { vertical-align: top; padding: .9mm 0; break-inside: avoid; }
  .co-piece td:first-child { padding-left: 3.5mm; }
  .co-piece td:last-child { padding-right: 3.5mm; }
  .co-piece tbody tr { break-inside: avoid; }
  /* Une ligne sur deux grisée : l'œil suit le texte jusqu'à la quantité. */
  .co-piece tbody tr:nth-child(even) td { background: #F7F4F1; }
  /* 11 mm, pas 8 : le cadre de la piste C ajoute 3,5 mm de retrait à gauche,
     et la case venait toucher le nom du travail. */
  .co-c { width: 11mm; }
  .co-case { display: inline-block; width: 4.2mm; height: 4.2mm; border: .4mm solid #14110E; border-radius: .8mm;
    margin-top: .4mm; }
  .co-d b { display: block; font-weight: 700; font-size: 9.5pt; }
  /* ⚠ LE DÉTAIL EN POINTS, PAS EN PAVÉ (12/11/2026, Élodie : « le détail ligne
     par ligne »). Un tiret par étape, aligné : sur le chantier on cherche
     l'étape qu'on fait, on ne lit pas un paragraphe de 367 caractères. */
  .co-d ul { margin: .8mm 0 0; padding: 0; list-style: none; }
  .co-d li { break-inside: avoid; }
  /* 8 points et une interligne serrée : c'est ce qui fait tenir une chambre de
     six travaux sur UNE feuille, et une feuille affichée au mur ne doit pas
     être en deux morceaux (17/11/2026). */
  .co-d li { position: relative; padding-left: 3.4mm; font-size: 7.4pt; line-height: 1.25;
    color: #3F3933; margin-bottom: .2mm; }
  .co-d li::before { content: ''; position: absolute; left: 0; top: 1.6mm;
    width: 2mm; height: .35mm; background: #B9B1AA; }
  .co-q { width: 22mm; text-align: right; font-weight: 800; font-size: 10.5pt; white-space: nowrap; }
  .co-piece tfoot td { border-top: .25mm solid #D6D0C9; }
  .co-vide { color: #6B625B; font-style: italic; }

  /* De quoi écrire sous chaque pièce — deux lignes, pas un cadre : le cadre
     de 42 mm coûtait une demi-page par pièce, et les pièces s'enchaînent
     désormais. Une page d'observations pleine attend à la fin du cahier. */
  .co-notes { break-inside: avoid; margin: 1.5mm 3.5mm 1mm; }
  .co-notes span { font: 700 7pt/1.2 Inter, Arial, sans-serif; letter-spacing: .14em;
    text-transform: uppercase; color: #A79D94; }
  .co-notes i { display: block; border-bottom: .2mm dashed #CFC8C1; height: 6mm; }
  .co-notes.grand i { height: 9mm; }

  /* Le descriptif des ouvrages, en fin de cahier : chaque prestation décrite
     UNE fois, avec son repère. */
  .co-ouvrage { break-inside: avoid; margin-bottom: 4.5mm; }
  .co-ouvrage h3 { font: 700 10pt/1.3 Inter, Arial, sans-serif; margin: 0 0 1mm; }
  .co-ouvrage h3 em { font-style: normal; font-weight: 800; color: #FC5D00; margin-right: 2.5mm; }
  .co-ouvrage .co-ou { font-size: 8.2pt; color: #8A7F76; font-weight: 600; }
  /* Répétée sous chaque pièce : les feuilles se baladent une à une sur le
     chantier, et celle qui traîne doit dire d'où elle vient. */
  .co-marque { font-size: 8pt; color: #8A7F76; margin: 1.5mm 4.5mm 2.5mm; display: flex;
    justify-content: space-between; gap: 6mm; }
  .co-marque b { color: #5A524B; font-weight: 700; }

  /* Technique et contraintes (17/11/2026) : l'équipe voit tout. */
  ul.co-el { list-style: none; margin: 1.5mm 0 0; padding: 0; }
  ul.co-el li { position: relative; padding: 1mm 0; font-size: 8.6pt; line-height: 1.35;
    border-top: .2mm solid #EDE9E4; }
  ul.co-el em { font-style: normal; font-weight: 800; font-size: 7pt; letter-spacing: .08em;
    text-transform: uppercase; color: #B45309; margin-right: 2.5mm; }
  .co-el-piece { padding: 0 4.5mm; }

  .co-pied { border-top: .3mm solid #E4DFD9; margin-top: 6mm; padding-top: 2.5mm;
    font-size: 8.5pt; color: #6B625B; display: flex; justify-content: space-between; gap: 6mm; }
  .co-pied b { color: #14110E; }
`;

// ⚠ LES PETITES LIGNES SOUS LES GRANDES, DANS LA PIÈCE (17/11/2026, Élodie :
// « n'oublie pas, je veux les petites lignes et les grandes lignes des
// devis »). Une étape intermédiaire les avait renvoyées en fin de cahier sous
// un repère A/B/C, pour tenir en 7 pages ; elle les veut là où le travail est
// listé. Un ouvrier ne retourne pas la liasse pour savoir ce que recouvre la
// ligne qu'il est en train de faire.
//
// ⚠ LE PRIX EST CONNU, ET ASSUMÉ : le descriptif se répète. Mesuré sur son
// devis — 9 prestations distinctes pour 30 postes, 168 lignes de descriptif
// dont 68 seulement sont différentes. « Dépose et repose de radiateur » est
// décrit à l'identique dans cinq pièces. C'est ce qui fait la longueur du
// document, et c'est voulu.
//
/**
 * Le cahier des charges de l'équipe, en A4 portrait : une page de tête
 * (chantier, sommaire, consignes), les pièces à la suite, le descriptif des
 * ouvrages, puis matériaux et outils.
 */
export function corpsOuvriers(chantier, k, dossier) {
  const d = donnees(chantier, k, dossier);
  const postes = Array.isArray(k.postes) ? k.postes : [];
  const pieces = piecesDe(postes);
  // ⚠ L'ÉQUIPE VOIT TOUT, y compris ce qui n'est pas coché « client » : c'est
  // pour elle que la distinction existe.
  const elems = elementsDe(k);
  const blocEl = (l) => (l && l.length ? `<ul class="co-el">${l.map(e =>
    `<li><em>${esc(FAMILLES[e.famille].court)}</em>${esc(e.texte)}</li>`).join('')}</ul>` : '');

  const materiaux = lignesDe(chantier.id, 'materiaux');
  const outils = lignesDe(chantier.id, 'outils');
  const dates = [chantier.date_debut ? `${dateLongue(chantier.date_debut)} → ${dateLongue(finDe(chantier))}` : '',
    dureeLue(chantier).texte].filter(Boolean).join(' · ');
  const textes = [['Consignes', k.consignes], ['Convenu avec le client', k.precisions],
    ['Notes du chantier', chantier.notes]].filter(x => x[1]);

  const tete = `
    <div class="co-tete">
      <img src="${LOGO}" alt="RGD Renova">
      <div class="co-t">
        <div class="co-sur">Cahier des charges · équipe</div>
        <h1>${esc(k.objet || chantier.titre || 'Chantier')}</h1>
        <p>${[d.adresse, d.nom, d.telephone].filter(Boolean).map(esc).join(' · ')}</p>
        <p>${[dates, k.devis_numero ? `Devis ${esc(k.devis_numero)}` : ''].filter(Boolean).join(' · ')}</p>
        <p><b>${pieces.length} pièce${pieces.length > 1 ? 's' : ''} · ${postes.length} ${postes.length > 1 ? 'travaux' : 'travail'}</b></p>
      </div>
    </div>`;

  const sommaire = `
    <div class="co-bloc">
      <h2>Les pièces</h2>
      <div class="co-somm">${pieces.map((lot, n) => `
        <div><em>${String(n + 1).padStart(2, '0')}</em><b>${esc(lot || 'Travaux')}</b>
          <span>${postes.filter(p => (p.lot || '') === lot).length} trav.</span></div>`).join('')}</div>
    </div>`;

  const avant = (textes.length || elems.chantier.length) ? `
    <div class="co-bloc">
      <h2>À savoir avant de commencer</h2>
      ${textes.map(([t, v]) => `<p class="co-libre"><b>${esc(t)} :</b> ${esc(v)}</p>`).join('')}
      ${blocEl(elems.chantier)}
    </div>` : '';

  // Une pièce = un tableau compact. Le `<thead>` se répète en haut de la page
  // suivante si une grande pièce déborde quand même.
  const blocPiece = (lot, n) => {
    const l = postes.filter(p => (p.lot || '') === lot);
    return `
    <table class="co-piece">
      <thead><tr><th colspan="3">
        <div class="co-piece-tete">
          <em>${String(n + 1).padStart(2, '0')}</em>
          <span class="co-nom">
            <span class="co-ou">${esc(k.objet || chantier.titre || '')}${d.adresse ? ` · ${esc(d.adresse)}` : ''}</span>
            <h2>${esc(lot || 'Travaux')}</h2>
          </span>
          <span class="co-compte">${l.length} ${l.length > 1 ? 'travaux' : 'travail'}</span>
        </div></th></tr></thead>
      <tbody>${l.length ? l.map(p => `
        <tr><td class="co-c">${CASE}</td>
          <td class="co-d"><b>${esc(p.designation)}</b>${points(p.detail)}</td>
          <td class="co-q">${esc(qte(p))}</td></tr>`).join('')
        : '<tr><td colspan="3" class="co-vide">Rien de prévu dans cette pièce.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="3">
        ${blocEl(elems.pieces[lot]) ? `<div class="co-el-piece">${blocEl(elems.pieces[lot])}</div>` : ''}
        <div class="co-notes"><span>Observations</span><i></i><i></i></div>
        <p class="co-marque"><span><b>Document interne</b> — ne pas remettre au client.</span>
          <span>${esc(lot || 'Travaux')}${k.devis_numero ? ` · devis ${esc(k.devis_numero)}` : ''}</span></p>
      </td></tr></tfoot>
    </table>`;
  };

  const liste = (titre, l) => `
    <div class="co-bloc">
      <h2>${titre}</h2>
      ${l.length ? `<table class="co-piece premiere"><tbody>${l.map(x => `
        <tr><td class="co-c">${CASE}</td><td class="co-d"><b>${esc(x.libelle)}</b></td>
          <td class="co-q">${x.quantite ? esc(x.quantite) : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="co-vide">Rien dans la liste.</p>'}
    </div>`;

  // ⚠ « À EMPORTER » EST SUR LA PAGE DE TÊTE, PLUS À LA FIN (17/11/2026,
  // Élodie : « les informations de la dernière page, on ne pourrait pas les
  // mettre à la première page »). C'est l'endroit juste : on charge le camion
  // avant de partir, pas après avoir fait les pièces. La page de tête était à
  // moitié vide, et le cahier perd une feuille (10 → 9).
  const emporter = (materiaux.length || outils.length) ? `
    <div class="co-emporter">${liste('Matériaux', materiaux)}${liste('Outils', outils)}</div>` : '';

  return `${tete}${sommaire}${avant}${emporter}
    ${pieces.map((lot, n) => blocPiece(lot, n)).join('')}
    <div class="co-pied"><span><b>Document interne</b> — ne pas remettre au client.</span>
      <span>RGD Renova · ${esc(k.objet || chantier.titre || '')}</span></div>`;
}

export function htmlOuvriers(chantier, k, dossier, titre) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${POLICES}" rel="stylesheet">
<style>${STYLE_OUVRIERS}</style></head><body>${corpsOuvriers(chantier, k, dossier)}</body></html>`;
}
