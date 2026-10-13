// Les deux documents qu'on imprime depuis la fiche projet de RGD Renova :
// la FICHE PROJET, qu'on remplit à la main pendant la visite technique, et le
// PROCÈS-VERBAL DE RÉCEPTION, qu'on fait signer à la fin du chantier.
//
// (13/10/2026, demandé par Élodie : « je voudrais avoir la possibilité
// d'exporter deux documents […] que ça remplisse automatiquement les
// informations du projet et du client pour qu'on puisse l'imprimer et le faire
// signer au client ».)
//
// LE MÉCANISME EST CELUI DU CABINET BTP, PAS UN SECOND
// `imprimerPage` de `btp-fiche.js` rend la page dans un cadre invisible et la
// confie à l'impression du navigateur — « Enregistrer au format PDF » y est une
// destination comme une autre. Aucune bibliothèque PDF, et surtout pas un
// deuxième mécanisme : celui-là porte déjà deux corrections payées cher (la
// marge de page nulle, l'attente du chargement du logo).
//
// ⚠ LA MARGE DE `@page` EST NULLE, ET C'EST CE QUI RETIRE L'EN-TÊTE DU
// NAVIGATEUR. Tant qu'elle ne l'est pas, Chrome écrit son propre titre et son
// adresse en haut de la feuille, et la date en bas — sur un document qu'on fait
// signer à un client, ça n'a rien à y faire. Les vraies marges sont portées par
// le remplissage du corps.
//
// ⚠ AUCUN TEXTE CLAIR SUR UN FOND DE COULEUR, ET CE N'EST PAS UN GOÛT.
// Les navigateurs n'impriment PAS les fonds par défaut : il faut que la
// personne ait coché « Graphiques d'arrière-plan ». Un bandeau sombre avec un
// titre blanc dessus donnerait donc, une fois sur deux, un titre blanc sur du
// papier blanc — c'est-à-dire une section sans titre. Les titres de section
// sont ici en encre sombre, et ce qui les signale est un FILET ORANGE à gauche
// plus un trait : une bordure, elle, s'imprime toujours. Le fond gris très
// clair n'est qu'un bonus pour qui imprime les fonds.
// ⚠ MÊME RAISON POUR LE QUADRILLAGE DU CROQUIS : il est dessiné en SVG, pas en
// image de fond. Un fond non imprimé laisserait une page blanche là où l'on
// vient justement relever des cotes.
//
// ⚠ LE LOGO EST CELUI DU CRM, SUR FOND TRANSPARENT (`rgd-complet.png`), et
// c'est ce qui corrige le défaut signalé : les PDF d'origine portaient le logo
// sur un PAVÉ NOIR au milieu d'une page blanche. Celui-ci a l'orange de la
// caisse à outils et le nom en noir : sur blanc, il se pose tout seul. Une
// bannière sombre en tête reste possible, mais elle coûterait de l'encre sur
// chaque feuille d'un document qu'on imprime à l'unité, sur site.
import { esc } from '../ui.js';
import { imprimerPage } from './btp-fiche.js';
import { valeursProjet, personneDe, nomComplet, adresseChantier } from '../data/rgd-projet.js';
import { montantDevisDe, etapeAvecMontant } from '../data/rgd-etapes.js';

const LOGO = new URL('../../assets/logos/rgd-complet.png', import.meta.url).href;

const ORANGE = '#FC5D00';
const ENCRE = '#1A1714';
const GRIS = '#6E6760';
const FILET = '#D8D3CE';
// Le gris foncé des bandeaux du procès-verbal. ⚠ IL NE SERT QU'À LUI :
// c'est ce qui distingue les deux documents d'un coup d'œil, et la fiche
// projet reste en blanc.
const SOMBRE = '#2B2724';

const eur = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('fr-FR') + ' € HT');
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

/**
 * Ce que les deux documents savent du dossier. Une seule lecture : deux
 * traductions auraient fini par ne plus désigner la même adresse, et l'écart
 * ne se serait vu que sur un genre de fiche.
 *
 * ⚠ ON PASSE PAR `valeursProjet`, LA SEULE TRADUCTION fiche/demande. Les
 * colonnes ne portent pas les mêmes noms d'un genre à l'autre, et c'est
 * exactement le piège que cette fonction existe pour fermer.
 */
export function donneesDocument(x, devis = []) {
  const f = x.ligne;
  const v = valeursProjet(x);
  const p = personneDe(f);
  const ch = adresseChantier(v);
  // Le nom affiché par l'écran d'abord : c'est celui que l'utilisateur voit.
  // ⚠ ET LE REPLI NE PASSE PAS PAR `nomComplet` SUR UN CONTACT — DÉFAUT VU À
  // L'IMPRESSION, PAS À LA RELECTURE : cette fonction lit `prenom`/`nom`,
  // c'est-à-dire les champs du FORMULAIRE, quand la table `contacts` porte
  // `first_name`/`last_name` et `organisations` un `name`. Elle rendait donc
  // une chaîne vide, et le document sortait avec un cadre « CLIENT » blanc —
  // sur la feuille qu'on fait signer. `rgd_clients` n'ayant AUCUNE colonne de
  // nom, ce repli est le seul filet quand l'appelant n'en fournit pas.
  const nomDe = (q) => (!q ? ''
    : q.pro ? String(q.ligne.name || '').trim()
      : [q.ligne.first_name, q.ligne.last_name].filter(Boolean).join(' ').trim());
  const nom = x.nom || nomDe(p) || nomComplet(f) || '';
  const perso = p ? p.ligne : f;

  // ⚠ LE MONTANT D'UN DEVIS SIGNÉ L'EMPORTE SUR LE BUDGET ANNONCÉ, et c'est la
  // règle déjà appliquée par la fiche et par le tableau (`etapeAvecMontant`).
  // Imprimer « budget : 30 000 € » sur un chantier chiffré à 42 000 € ferait
  // signer un document qui contredit le devis.
  const chiffre = etapeAvecMontant(x.etape) ? montantDevisDe(f, devis, x.etape) : null;
  const signes = devis.filter(d => d.statut === 'signe')
    .sort((a, b) => String(b.date_creation || '').localeCompare(String(a.date_creation || '')));
  const devisRetenu = signes[0] || devis[0] || null;

  return {
    nom,
    telephone: perso.phone || perso.telephone || f.telephone || '',
    email: perso.email || f.email || '',
    adresseChantier: [ch.adresse, [ch.code_postal, ch.ville].filter(Boolean).join(' ')]
      .filter(Boolean).join(', '),
    villeChantier: ch.ville || '',
    budget: chiffre ? eur(chiffre) : (v.budget_annonce || ''),
    budgetTitre: chiffre ? 'MONTANT HT' : 'BUDGET',
    typeBien: v.type_projet || '',
    superficie: v.superficie || '',
    travaux: Array.isArray(v.types_travaux) ? v.types_travaux.join(', ') : (v.types_travaux || ''),
    devisRef: devisRetenu ? (devisRetenu.numero || '') : '',
    devisDate: devisRetenu ? jour(devisRetenu.date_creation) : '',
  };
}

// --------------------------------------------------------------------- style
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

  h2 { margin: 11px 0 6px; padding: 4px 9px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .06em;
    color: ${ENCRE}; background: #F4F1EE; border-left: 4pt solid ${ORANGE}; }

  .champs { display: flex; gap: 14px; }
  .champ { flex: 1; min-width: 0; }
  .champ > span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: ${GRIS}; }
  .champ > b { display: block; min-height: 15px; padding: 2px 0 3px; font-size: 11pt;
    border-bottom: .75pt solid ${FILET}; }
  .champ.etroit { flex: 0 0 42mm; }
  .champ.moyen { flex: 0 0 58mm; }

  .ligne { height: 8.4mm; border-bottom: .75pt solid ${FILET}; }
  .cases { display: flex; flex-wrap: wrap; gap: 3px 14px; margin: 2px 0 0; font-size: 9.5pt; color: ${GRIS}; }

  .choix { display: flex; align-items: center; gap: 9px; margin: 7px 0; font-size: 10.5pt; }
  .choix i { flex: none; width: 4.5mm; height: 4.5mm; border: 1pt solid ${ENCRE}; }

  .sign { display: flex; gap: 22px; margin-top: 8px; }
  .sign div { flex: 1; }
  .sign b { display: block; font-size: 10pt; }
  .sign span { display: block; font-size: 8.5pt; color: ${GRIS}; }
  .sign u { display: block; margin-top: 22mm; border-top: .75pt solid ${GRIS}; text-decoration: none; }

  footer { margin-top: 12px; padding-top: 6px; border-top: .75pt solid ${FILET};
    display: flex; justify-content: space-between; gap: 14px; font-size: 8pt; color: ${GRIS}; }
  footer b { color: ${ORANGE}; }

  /* ⚠ UNE PAGE, PAS DEUX : on fait signer une feuille, pas une liasse dont la
     seconde porte trois lignes vides. Le corps est une colonne de la hauteur
     EXACTE d'un A4 (padding compris, box-sizing border-box) et la zone de
     lignes absorbe la place restante. ⚠ LE NOMBRE DE LIGNES NE SE DEVINE PLUS :
     il etait fige a 12, et le simple ajout de « Appartement · Salle de bain »
     poussait le pied 53 px sous le bord — defaut mesure, invisible a la
     relecture. On en dessine plus qu'il n'en faut et overflow:hidden coupe
     le surplus : une ligne VIDE coupee ne perd rien, un paragraphe si — c'est
     pourquoi seules les lignes vierges vivent dans ce conteneur.
     ⚠ min-height:0 N'EST PAS DECORATIF : un enfant flex refuse par defaut
     de devenir plus petit que son contenu, donc sans lui le conteneur pousse
     le pied dehors au lieu de rogner. */
  body.page-une { height: 297mm; display: flex; flex-direction: column; }
  .remplir { flex: 1 1 0; min-height: 0; overflow: hidden; }

  .bandeau { display: block; margin: 12px 0 7px; }
  .bandeau + .champs, .bandeau + p { margin-top: 0; }
  @media print { h2, .bandeau { break-after: avoid; } .sign, .choix, header, .champs { break-inside: avoid; } }
`;

const page = (titre, corps) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titre)}</title>
<style>${style}</style></head><body class="page-une">${corps}</body></html>`;

const entete = (titre, sous) => `
<header>
  <img src="${LOGO}" alt="RGD Renova">
  <div class="t"><h1>${esc(titre)}${sous ? `<small>${esc(sous)}</small>` : ''}</h1></div>
</header>`;

const pied = (gauche) => `
<footer><span>${esc(gauche)}</span><b>rgdrenova.fr</b></footer>`;

const champ = (libelle, valeur, classe = '') =>
  `<div class="champ ${classe}"><span>${esc(libelle)}</span><b>${esc(valeur || '')}</b></div>`;

const lignes = (n) => Array.from({ length: n }, () => '<div class="ligne"></div>').join('');

/**
 * Le bandeau de section du PROCÈS-VERBAL : fond gris foncé, texte blanc.
 *
 * ⚠ IL EST DESSINÉ EN SVG, ET CE N'EST PAS UN CAPRICE — demandé le 13/10/2026
 * pour distinguer les deux documents d'un coup d'œil, et le piège est connu :
 * les navigateurs n'impriment PAS les fonds CSS tant que « Graphiques
 * d'arrière-plan » n'est pas coché. Un `background` sombre avec du texte blanc
 * dessus donnerait, une fois sur deux, un titre BLANC SUR DU PAPIER BLANC —
 * c'est-à-dire une section sans titre, sur le document qu'on fait signer.
 * Un rectangle et un texte SVG sont du CONTENU : ils s'impriment toujours.
 *
 * ⚠ PAS DE `viewBox` : sans lui, les unités du SVG sont des pixels et le texte
 * garde sa taille réelle. Avec un `viewBox` et une largeur en pourcentage, le
 * dessin s'étirerait à la largeur de la page et le titre avec lui.
 */
const bandeau = (titre) => `
<svg class="bandeau" width="100%" height="26" role="img" aria-label="${esc(titre)}">
  <rect x="0" y="0" width="100%" height="26" fill="${SOMBRE}"></rect>
  <rect x="0" y="0" width="4" height="26" fill="${ORANGE}"></rect>
  <text x="13" y="17.5" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif"
    font-size="12" font-weight="bold" letter-spacing="0.8">${esc(titre.toUpperCase())}</text>
</svg>`;

/**
 * Le quadrillage des croquis, en SVG.
 * ⚠ PAS UNE IMAGE DE FOND : un navigateur qui n'imprime pas les fonds rendrait
 * une zone blanche, sur la seule partie de la feuille qui sert à relever des
 * cotes. Un tracé SVG est du contenu, il s'imprime toujours.
 */
function quadrillage(largeurMm, hauteurMm, pasMm = 5) {
  const t = [];
  for (let x = 0; x <= largeurMm; x += pasMm) {
    t.push(`<line x1="${x}" y1="0" x2="${x}" y2="${hauteurMm}"/>`);
  }
  for (let y = 0; y <= hauteurMm; y += pasMm) {
    t.push(`<line x1="0" y1="${y}" x2="${largeurMm}" y2="${y}"/>`);
  }
  return `<svg width="${largeurMm}mm" height="${hauteurMm}mm" viewBox="0 0 ${largeurMm} ${hauteurMm}"
    style="display:block" stroke="#E2DDD8" stroke-width="0.2">${t.join('')}</svg>`;
}

// ------------------------------------------------------------ fiche projet
export function ficheProjetHtml(d) {
  // ⚠ AUCUN TEXTE LIBRE DE LA FICHE SUR CETTE FEUILLE (demande d'Elodie le
// 13/10/2026 : « je ne veux pas les commentaires, ca c'est en interne dans le
// CRM »). « Details du projet » et le champ Commentaire sont des notes d'appel
// — ce qu'on retient de la personne, ce qu'on se dit entre nous — et cette
// feuille se remplit devant le client puis part au dossier. Ne restent que des
// FAITS : type de bien, surface, types de travaux.
// ⚠ ET LE PAVE N'EST PAS REMPLACE PAR DU VIDE : les lignes vierges reprennent
// la place, c'est a la visite qu'on ecrit ce qui compte.
const complement = [d.typeBien, d.superficie ? `${d.superficie} m²` : '', d.travaux]
    .filter(Boolean).join(' · ');
  return page('Fiche projet — RGD Renova', `
${entete('FICHE PROJET', jour(new Date()))}

<div class="champs" style="margin-top:10px">
  ${champ('Client', d.nom)}
  ${champ(d.budgetTitre, d.budget, 'etroit')}
</div>
<div class="champs" style="margin-top:7px">
  ${champ('Téléphone', d.telephone, 'etroit')}
  ${champ('E-mail', d.email)}
</div>
<div class="champs" style="margin-top:7px">
  ${champ('Adresse du chantier', d.adresseChantier)}
</div>

<h2>Projet · attentes client · observations techniques</h2>
${complement ? `<p class="cases">${esc(complement)}</p>` : ''}
<div class="remplir">${lignes(18)}</div>

<h2>Croquis · cotes · relevés</h2>
${quadrillage(182, 92)}

${pied('Document de visite — à conserver au dossier du chantier.')}`);
}

// ------------------------------------------------------ PV de réception
export function receptionHtml(d) {
  return page('Procès-verbal de réception — RGD Renova', `
${entete('PROCÈS-VERBAL', 'DE RÉCEPTION DES TRAVAUX')}

${bandeau('1 · Identification du chantier')}
<div class="champs">
  ${champ('Client / maître d’ouvrage', d.nom)}
</div>
<div class="champs" style="margin-top:7px">
  ${champ('Adresse du chantier', d.adresseChantier)}
</div>
<div class="champs" style="margin-top:7px">
  ${champ('Référence du devis / marché', d.devisRef, 'moyen')}
  ${champ('Date du devis', d.devisDate, 'etroit')}
  ${champ('Date de la réception', '', 'etroit')}
</div>

${bandeau('2 · Décision de réception')}
<p style="margin:4px 0 0;font-size:10pt">Après visite contradictoire des travaux, le maître d’ouvrage déclare :</p>
<div class="choix"><i></i><span>Prononcer la réception des travaux <b>sans réserve</b>.</span></div>
<div class="choix"><i></i><span>Prononcer la réception des travaux <b>avec les réserves</b> décrites ci-dessous.</span></div>
<div class="choix"><i></i><span><b>Refuser</b> la réception (motifs à préciser ci-dessous).</span></div>

${bandeau('3 · Réserves · motifs · observations')}
<div class="remplir">${lignes(12)}</div>
<div class="champs" style="margin-top:9px">
  ${champ('Délai de levée des réserves convenu (le cas échéant)', '')}
</div>

${bandeau('4 · Signatures')}
<div class="champs">
  ${champ('Fait à', d.villeChantier, 'etroit')}
  ${champ('Le', '', 'etroit')}
</div>
<div class="sign">
  <div><b>Le maître d’ouvrage</b><span>${esc(d.nom || 'Nom, signature')}</span><u></u></div>
  <div><b>Pour RGD Renova</b><span>Nom, signature</span><u></u></div>
</div>

${pied('Document à établir contradictoirement et à conserver par chaque partie.')}`);
}

// ------------------------------------------------------------------ portes
export const imprimerFicheProjet = (x, devis) => imprimerPage(ficheProjetHtml(donneesDocument(x, devis)));
export const imprimerReception = (x, devis) => imprimerPage(receptionHtml(donneesDocument(x, devis)));
