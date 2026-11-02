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
import { parCategorie, signatureRgd, MOYENS_PAIEMENT, estDevis, estAnnulee } from '../data/rgd-devis-crm.js';
import {
  GROUPES, coche, totalHeures, numeroBon, nomFourniPar,
  lignesFourniture, saisieDepart,
} from '../data/rgd-bon-attachement.js';

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
  // ⚠ UNE ADRESSE DE CHANTIER VIDE RETOMBE SUR CELLE DU PROSPECT (demande du
  // 13/10/2026 : « si tu ne trouves pas d'adresse de chantier prends celle du
  // prospect »). Une feuille de visite sans aucune adresse ne sert a rien, et
  // sur un dossier pris au telephone on a souvent note l'adresse de la personne
  // avant celle des travaux. ⚠ ON NE PANACHE PAS LES TROIS CHAMPS : on prend
  // une adresse ENTIERE ou l'autre — melanger la rue de l'une avec la ville de
  // l'autre fabriquerait une adresse qui n'existe nulle part, et c'est le
  // defaut deja paye sur `poserRendezVous` le 01/10. ⚠ ET `adresseProspect`
  // RESTE LA SEULE TRADUCTION : avec un chantier vide elle rend precisement
  // l'adresse propre de la personne.
  const chantier = adresseChantier(v);
  const vide = (a) => !a.adresse && !a.code_postal && !a.ville;
  // ⚠ L'ADRESSE DE LA PERSONNE NE PASSE PAS PAR `valeursProjet`, ET LE CROIRE
  // RENDAIT DU VIDE (mesure : adresse '' sur un dossier dont le prospect habite
  // Senlis). Cette traduction ne porte que les champs du PROJET ; l'adresse de
  // la personne vit sur le contact, l'organisation ou la demande.
  // ⚠ ET LES DEUX CONVENTIONS DE NOMS COHABITENT : `contacts` et
  // `organisations` portent address/postal_code/city, `rgd_demandes` porte
  // adresse/code_postal/ville — n'en lire qu'une laisserait la moitie des
  // dossiers sans repli, sans que rien ne le dise.
  const dePersonne = (q) => ({
    adresse: String(q?.address || q?.adresse || '').trim(),
    code_postal: String(q?.postal_code || q?.code_postal || '').trim(),
    ville: String(q?.city || q?.ville || '').trim(),
  });
  // ⚠ ON PREND UNE ADRESSE ENTIERE OU L'AUTRE, JAMAIS UN PANACHAGE : melanger
  // la rue de l'une avec la ville de l'autre fabriquerait une adresse qui
  // n'existe nulle part — defaut deja paye sur `poserRendezVous` le 01/10.
  // (`perso` n'est declare que plus bas : on relit la personne ici.)
  const qui = p ? p.ligne : f;
  const ouSontLesTravaux = !vide(chantier) ? chantier
    : (!vide(dePersonne(qui)) ? dePersonne(qui) : dePersonne(f));
  const enUneLigne = (a) => [a.adresse, [a.code_postal, a.ville].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const ch = ouSontLesTravaux;
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

  // ⚠ LE NOM DU FICHIER MET LE NOM DE FAMILLE EN PREMIER (demande du
  // 14/10/2026) : un dossier de chantier se classe par nom, et c'est ainsi que
  // les PDF se rangent tout seuls dans un dossier.
  // ⚠ ON NE DECOUPE JAMAIS UN NOM COMPLET POUR L'INVERSER : « Monteiro Magali »
  // deviendrait prenom « Monteiro », nom « Magali » — le titre d'un rendez-vous
  // dit « Nom Prenom » aussi souvent que l'inverse, et se tromper INVERSE
  // l'identite de quelqu'un. C'est la regle qui a fait cesser le decoupage dans
  // `rgd_visites_depuis_agenda`. On n'inverse donc QUE lorsque les deux colonnes
  // existent separement ; sinon on garde le nom tel qu'il est affiche.
  const sep = (q) => (!q || q.pro ? null : {
    nom: String(q.ligne.last_name || '').trim(),
    prenom: String(q.ligne.first_name || '').trim(),
  });
  const deux = sep(p);
  const nomDeFichier = (deux && deux.nom && deux.prenom)
    ? `${deux.nom} ${deux.prenom}`
    : nom;
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
    nomFichier: nomDeFichier,
    adresseChantier: enUneLigne(ouSontLesTravaux),
    villeChantier: ch.ville || '',
    cpChantier: ch.code_postal || '',
    // La rue seule : le bon d'attachement porte le code postal et la ville sur
    // leur propre ligne, et l'adresse entiere les y repetait en debordant.
    rueChantier: ch.adresse || '',
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
  /* La hauteur d'un champ est celle d'une ligne de texte, line-height fixee des
     deux cotes. ⚠ CE N'EST PAS CE REGLAGE QUI ALIGNE LES TRAITS : essaye seul,
     il laissait encore 22 px contre 28, la hauteur d'une ligne dependant de la
     police du poste. C'est l'espace insecable de champ() qui tranche, voir son
     commentaire. Ces deux lignes restent le filet. Une valeur qui s'enroule sur
     deux lignes grandit toujours : c'est voulu. */
  .champ > b { display: block; min-height: 1.5em; line-height: 1.5; padding: 2px 0 3px;
    font-size: 11pt; border-bottom: .75pt solid ${FILET}; }
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

// ⚠ CE TITRE EST LE NOM DU FICHIER, pas une decoration : « Enregistrer au
// format PDF » propose le titre du document imprime. Sans nom de client, on
// garde le libelle seul plutot que de laisser un tiret pendre.
// ⚠ LES CARACTERES INTERDITS PAR LES SYSTEMES DE FICHIERS SONT RETIRES : une
// raison sociale comme « Dupont / Martin SCI » donnerait un chemin, pas un nom.
const titreDocument = (quoi, d) => {
  const propre = String(d.nomFichier || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return propre ? `${quoi} - ${propre}` : quoi;
};

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

// ⚠ UN CHAMP VIDE PORTE UNE ESPACE INSECABLE, ET CE N'EST PAS UNE ASTUCE DE
// MISE EN PAGE : sans elle il n'a aucune ligne de texte, donc il retombe sur sa
// hauteur minimale et son trait remonte au-dessus de celui de ses voisins —
// mesure sur le PV, « Date de la reception » etait 12 px plus haut que les deux
// dates du devis, sur la rangee qu'on lit en premier. Calculer cette hauteur en
// em ne suffit pas (essaye : 22 px contre 28), parce que la hauteur d'une ligne
// depend de la police du poste. Avec la meme ligne des deux cotes, les traits
// s'alignent par CONSTRUCTION, quelle que soit la police.
const champ = (libelle, valeur, classe = '') =>
  `<div class="champ ${classe}"><span>${esc(libelle)}</span><b>${valeur ? esc(valeur) : '&nbsp;'}</b></div>`;

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
  return page(titreDocument('Fiche projet', d), `
${entete('FICHE PROJET', jour(new Date()))}

<div class="champs" style="margin-top:10px">
  ${champ('Client', d.nom)}
  ${champ(d.budgetTitre, d.budget, 'etroit')}
</div>
<div class="champs" style="margin-top:7px">
  ${champ('Téléphone', d.telephone, 'etroit')}
  ${champ('E-mail', d.email)}
</div>
<!-- ⚠ MEME INTITULE QUE SUR LE PV, au mot pres : les deux feuilles partent au
     meme dossier, et deux noms pour la meme reference feraient chercher un
     second document. Vide tant qu'aucun devis n'existe — c'est une fiche de
     VISITE, le numero s'ecrit alors a la main, comme la date de reception du
     PV. ⚠ Et la largeur est celle dite moyenne (58 mm) : dans un champ etroit,
     l'intitule s'enroule et sa valeur tombe une ligne sous celle du voisin,
     defaut deja paye sur le PV. (Aucun accent grave ici : il FERME le
     gabarit.) -->
<div class="champs" style="margin-top:7px">
  ${champ('Adresse du chantier', d.adresseChantier)}
  ${champ('Référence du devis / marché', d.devisRef, 'moyen')}
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
  return page(titreDocument('PV de réception', d), `
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

// ------------------------------------------------- devis fait dans le CRM
// ⚠ LE PIED PORTE LES MENTIONS LÉGALES DE RGD RENOVA (Chantilly), celles du bon
// d'attachement validé le 28/10/2026 : un devis est un document commercial,
// et SIRET, RCS et TVA intracommunautaire y sont obligatoires.
const MENTIONS_RGD = 'RGD Renova · SASU au capital de 1 000 € · 20 avenue du Maréchal Joffre, 60500 Chantilly · RCS Compiègne · SIRET 979 294 030 00023 · TVA FR34979294030';

// ⚠ MENTION OBLIGATOIRE SUR UN DEVIS ET UNE FACTURE DE TRAVAUX — article
// L243-2 du code des assurances : l'assurance souscrite, les COORDONNÉES de
// l'assureur, et la COUVERTURE GÉOGRAPHIQUE du contrat. Les trois, pas une.
//
// ⚠ LA ZONE N'EST PAS DÉCORATIVE, c'est elle qui décidait si la mention
// pouvait seulement être écrite : RGD Renova siège à Chantilly et intervient
// dans le Sud. Un contrat limité aux Hauts-de-France aurait rendu la mention
// FAUSSE sur chaque facture d'Antibes — et une attestation qui ment vaut moins
// que pas de mention du tout. Relevé sur l'attestation le 02/11/2026 : zone
// « France », donc le Sud est couvert.
//
// ⚠ ÉCRIT EN DUR, COMME L'IDENTITÉ DE LA SOCIÉTÉ AU-DESSUS : ce numéro de
// contrat figure sur chaque facture remise à un client, la loi EXIGE qu'il y
// soit. Ce n'est pas un secret, et le dépôt est public : rien ici qui ne soit
// déjà entre les mains de tous les clients de RGD.
const MENTIONS_ASSURANCE = 'Assurance responsabilité civile et décennale : Mic insurance, '
  + 'rue de l’Amiral Hamelin, 75116 Paris · Contrat n° LUN2309302 · Couverture : France.';

// ⚠ MENTIONS OBLIGATOIRES D'UNE FACTURE, ET CE NE SONT PAS DES FORMULES DE
// STYLE : leur absence est sanctionnable, et sans elles les pénalités de
// retard ne sont pas exigibles. Les taux écrits ici sont ceux que la loi
// applique À DÉFAUT d'accord contraire — c'est le choix le plus sûr tant
// qu'Élodie n'a pas arrêté ses propres conditions (délai, acompte).
// Articles L441-10 et D441-5 du code de commerce.
const MENTIONS_PAIEMENT = 'Paiement à réception. Passé l’échéance, pénalités de retard au taux de '
  + 'trois fois l’intérêt légal, exigibles sans rappel, et indemnité forfaitaire pour frais de '
  + 'recouvrement de 40 € (articles L441-10 et D441-5 du code de commerce). Pas d’escompte pour '
  + 'paiement anticipé.';

// ⚠ CE QU'UN DEVIS DOIT DIRE, ET QUI N'EST PAS CE QUE DIT UNE FACTURE
// (02/11/2026, Élodie : « des travaux à faire plus tard et ce sera plus un
// devis puisqu'il n'y aura pas de paiement au premier rdv »).
//
// ⚠ LES PÉNALITÉS DE RETARD N'ONT RIEN À FAIRE SUR UN DEVIS, et les y laisser
// n'était pas une maladresse de style : rien n'est encore dû, donc rien ne
// peut être en retard. Un document qui menace de pénalités sur une somme non
// exigible se retourne contre celui qui l'envoie.
//
// ⚠ CE QU'UN DEVIS DOIT PORTER À LA PLACE : sa durée de validité, le
// caractère gratuit de l'établissement (sans quoi le prix de l'étude est dû à
// l'entreprise, et le client doit l'avoir su avant), et le fait que les
// travaux seront facturés à leur achèvement.
const MENTIONS_DEVIS = 'Devis gratuit, établi sans engagement. Les prix sont fermes pendant toute '
  + 'la durée de validité indiquée ci-dessus. Le devis signé vaut commande ; les travaux seront '
  + 'facturés à leur achèvement et réglés à ce moment-là.';

/**
 * Le moment de la signature, tel qu'il s'imprime sous le tracé.
 *
 * ⚠ ON PRÉFÈRE `signe_a` À `date_signature` : la seconde ne porte que le jour,
 * et l'heure fait partie de la preuve. On retombe sur le jour seul pour les
 * factures signées avant que `signe_a` n'existe (29/10/2026).
 */
const momentSignature = (devis) => {
  if (devis.signe_a) {
    const t = new Date(devis.signe_a);
    return `${jour(t)} à ${t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return devis.date_signature ? jour(devis.date_signature) : '';
};

// Pourquoi ce taux : la mention qui le justifie, telle que l'administration
// l'attend sur un devis de travaux dans un logement.
const MENTION_TVA = {
  10: 'TVA au taux de 10 % : travaux d’amélioration, de transformation, d’aménagement ou d’entretien portant sur un local à usage d’habitation achevé depuis plus de deux ans (article 279-0 bis du CGI).',
  5.5: 'TVA au taux de 5,5 % : travaux d’amélioration de la qualité énergétique d’un local à usage d’habitation achevé depuis plus de deux ans (article 278-0 bis A du CGI).',
};

const euros = (n) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const unite = { forfait: 'u', heure: 'h', m2: 'm²', ml: 'ml' };

const styleDevis = `
  /* ⚠ L'EN-TÊTE EST LE SEUL ENDROIT QUI A CHANGÉ (02/11/2026, Élodie :
     « reviens sur la toute première version et fais moi juste un en-tête sympa
     dynamique et design »). Tout le reste du document est celui d'origine,
     au pixel : six propositions de refonte ont été écartées avant d'arriver
     là, et la leçon est de ne plus toucher à ce qui n'a pas été demandé.
     ⚠ PAS D'APLAT DE COULEUR PLEIN : « le orange est trop pétant », dit d'un
     bandeau orange sur toute la largeur. Le mouvement vient d'un DÉGRADÉ qui
     s'éteint, pas d'une surface.
     ⚠ NI « background-clip: text » NI « clip-path » : html2canvas, qui fabrique le
     PDF envoyé au client, ne les rend pas — le titre serait sorti INVISIBLE.
     Dégradés de fond et coins arrondis, eux, passent. */
  /* ⚠ LA BORDURE DE L'EN-TÊTE PARTAGÉ EST NEUTRALISÉE ICI, et il le fallait :
     la règle « header » du gabarit commun (fiche projet, PV de réception) pose un
     filet orange plein de 2,5 points. Laissée en place, elle dessinait une
     SECONDE barre juste au-dessus du dégradé — vu sur la toile du PDF, pas à
     l'écran où les deux se confondaient. On ne touche pas à « header » lui-même :
     les deux autres documents s'en servent toujours.
     ⚠ LE DÉGRADÉ PASSE DANS LE PDF, mesuré sur la toile html2canvas :
     #FC5F03 → #FE954E → #FFC499 → blanc. */
  .fh { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
    border-bottom: 0; padding-bottom: 0; }
  .fh-g img { height: 15mm; display: block; }
  .fh-metiers { margin-top: 2.5mm; font-size: 7.4pt; letter-spacing: .1em; text-transform: uppercase;
    color: #9a938b; font-weight: 600; }
  .fh-d { text-align: right; flex: none; }
  .fh-mot { font-size: 25pt; font-weight: 700; letter-spacing: -.015em; line-height: 1; color: ${ENCRE}; }
  .fh-num { display: inline-block; margin-top: 2.5mm; padding: 1.4mm 3.4mm; border-radius: 10mm;
    background: linear-gradient(100deg, #FFE9D8 0%, #FFD9BC 100%); color: #B6460F;
    font-size: 8.4pt; font-weight: 700; letter-spacing: .05em; }
  .fh-filet { height: 1.5mm; border-radius: 1mm; margin: 3.5mm 0 0;
    background: linear-gradient(90deg, ${ORANGE} 0%, #FFA463 42%, #FFE2CA 72%, #FFFFFF 100%); }
  table.lignes { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.8pt; }
  table.lignes th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: ${GRIS};
    font-weight: 700; padding: 5px 6px; border-bottom: 1pt solid ${ENCRE}; }
  table.lignes td { padding: 6px; border-bottom: .75pt solid ${FILET}; vertical-align: top; }
  table.lignes td small { display: block; color: ${GRIS}; font-size: 8.5pt; }
  table.lignes .n { text-align: right; white-space: nowrap; }
  table.lignes tr { break-inside: avoid; }
  /* Une catégorie par bloc, son titre en tête et son sous-total au pied. */
  table.lignes tbody { break-inside: avoid; }
  table.lignes tr.cat td { padding: 10px 6px 4px; font-size: 8.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; color: ${ORANGE}; border-bottom: .75pt solid ${ORANGE}; }
  table.lignes tbody:first-of-type tr.cat td { padding-top: 6px; }
  table.lignes tr.sous-total td { padding: 4px 6px 8px; font-size: 9pt; color: ${GRIS}; text-align: right; border-bottom: 0; }
  .totaux { margin: 8px 0 0 auto; width: 72mm; font-size: 10pt; }
  .totaux div { display: flex; justify-content: space-between; padding: 3px 6px; }
  .totaux .ttc { margin-top: 3px; padding: 6px; font-weight: 700; font-size: 11.5pt; border-top: 1.5pt solid ${ORANGE}; }
  .parties { display: flex; gap: 14px; margin-top: 10px; }
  .partie { flex: 1; padding: 7px 9px; border: .75pt solid ${FILET}; font-size: 9.8pt; }
  .partie > span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; color: ${GRIS}; margin-bottom: 2px; }
  .mention { margin: 10px 0 0; font-size: 8.5pt; color: ${GRIS}; }
  .accord { break-inside: avoid; }
  .acquittee { border-left: 2.5pt solid ${ORANGE}; padding-left: 7px; color: #111827; }
  /* ⚠ UNE FACTURE ANNULÉE DOIT SE VOIR AU PREMIER COUP D'ŒIL, et de loin : une
     copie imprimée avant l'annulation circule encore, et les deux feuilles se
     ressemblent trait pour trait. D'où un bandeau en tête, pas une ligne
     perdue dans les mentions du bas.
     ⚠ UN CONTOUR, PAS UN APLAT ROUGE PLEIN : la feuille part aussi par mail, et
     un grand rectangle de couleur sur un PDF se photocopie en gris illisible.
     Le contour, lui, reste net en noir et blanc. */
  .annul-bandeau { margin: 4mm 0 0; padding: 2.4mm 3.4mm; border: 1.6pt solid #B91C1C;
    border-radius: 2mm; display: flex; align-items: baseline; gap: 8px; }
  .annul-bandeau b { font-size: 13.5pt; letter-spacing: .04em; text-transform: uppercase; color: #B91C1C; }
  .annul-bandeau span { font-size: 9pt; color: #7F1D1D; }
  .annulee-txt { border-left: 2.5pt solid #B91C1C; padding-left: 7px; color: #111827; }
  .pied-legal { margin-top: 14px; padding-top: 6px; border-top: .75pt solid ${FILET}; font-size: 7.6pt; color: ${GRIS}; }
`;

export function devisCrmHtml(d, devis) {
  const lignes = devis.lignes || [];
  const ech = new Date(`${devis.date_devis || new Date().toISOString().slice(0, 10)}T00:00:00`);
  ech.setDate(ech.getDate() + (Number(devis.validite_jours) || 30));
  const taux = Number(devis.tva_taux);

  // ⚠ UN SEUL GABARIT POUR LES DEUX DOCUMENTS, ET C'EST DÉLIBÉRÉ. Un devis et
  // une facture se ressemblent à neuf dixièmes : mêmes parties, mêmes lignes,
  // mêmes totaux, mêmes mentions d'entreprise et d'assurance. En écrire deux
  // aurait voulu dire corriger deux fois chaque réglage — la marge du PDF, le
  // cachet de l'entreprise, le taux de TVA — et en oublier un sur l'autre.
  // Ce qui change est nommé ici, en un endroit.
  const dev = estDevis(devis);
  const mot = dev ? 'Devis' : 'Facture';
  // ⚠ SEULE UNE FACTURE SE DIT « ANNULÉE » SUR LE PAPIER. Un devis refusé
  // porte le même statut en base, mais il ne se réimprime pas : c'est le
  // client qui a dit non, il n'y a rien à lui remettre.
  const annul = !dev && estAnnulee(devis) ? {
    le: devis.annule_le ? String(devis.annule_le).slice(0, 10) : null,
    motif: String(devis.annule_motif || '').trim(),
  } : null;

  // ⚠ UNE FACTURE RÉGLÉE NE RÉCLAME PLUS RIEN (02/11/2026, Élodie : « la
  // facture arrive au moment du paiement »). Tant que `regle_le` est vide, le
  // document garde son échéance et ses pénalités — elles restent OBLIGATOIRES
  // sur une facture non réglée, et les retirer du gabarit aurait rendu non
  // conforme la première facture payée plus tard.
  //
  // ⚠ UN DEVIS N'EST JAMAIS ACQUITTÉ, même si quelqu'un a coché « réglée » par
  // erreur : il n'appelle aucun paiement. On ferme la porte ici plutôt que de
  // compter sur l'écran, qui ne propose le règlement que sur une facture — un
  // document rendu au client ne doit pas dépendre d'un bouton caché.
  //
  // ⚠ ET UNE FACTURE ANNULÉE N'EST PAS « ACQUITTÉE » non plus, même si elle
  // avait été marquée réglée avant : les deux mentions côte à côte diraient à
  // la fois « tout est payé » et « rien n'est dû ». L'annulation prime, et un
  // encaissement à rendre se traite entre la facture annulée et le
  // remboursement, pas sur la feuille.
  const regle = (!dev && !estAnnulee(devis) && devis.regle_le)
    ? { le: devis.regle_le, par: MOYENS_PAIEMENT[devis.regle_par] || devis.regle_par || '' }
    : null;

  // ⚠ LA SIGNATURE DE L'ENTREPRISE EST APPOSÉE D'AVANCE, pas laissée en
  // blanc. Une facture envoyée par mail portait jusqu'ici un trait vide à
  // côté de « Pour RGD Renova » — et un trait vide sur un PDF ne se remplit
  // jamais : le client recevait une facture que personne n'avait signée.
  //
  // ⚠ SANS SIGNATURE ENREGISTRÉE, ON GARDE LE TRAIT. Le document reste
  // valable et imprimable, exactement comme avant ; on ne bloque pas une
  // facture parce qu'un réglage n'a pas été fait.
  const blocRgd = () => {
    const sig = signatureRgd();
    if (!sig) return '<div><b>Pour RGD Renova</b><span>Nom, signature</span><u></u></div>';
    // ⚠ UN CACHET NE SE POSE PAS COMME UN PARAPHE. Un tracé au doigt est large
    // et plat (presque 4 pour 1) ; un cachet scanné est souvent carré, et le
    // rendre à la même HAUTEUR le réduirait à un timbre de 15 mm où la raison
    // sociale serait illisible. On vise donc une LARGEUR constante, bornée en
    // hauteur pour qu'un cachet carré ne pousse pas le pied de page hors de la
    // feuille. 58 px reste le repli pour les signatures enregistrées avant que
    // les dimensions ne soient conservées (02/11/2026).
    const haut = sig.w && sig.h
      ? Math.max(30, Math.min(96, Math.round(200 * sig.h / sig.w)))
      : 58;
    return `<div><b>Pour RGD Renova</b><span>${esc(sig.nom || '')}</span>
      <img src="${esc(sig.image)}" alt="Signature RGD Renova" style="display:block;height:${haut}px;margin-top:2px"></div>`;
  };
  const pageDevis = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titreDocument(`${mot} ${devis.numero || ''}`.trim(), d))}</title>
<style>${style}${styleDevis}</style></head><body>
<header class="fh">
  <div class="fh-g">
    <img src="${LOGO}" alt="RGD Renova">
    <div class="fh-metiers">Électricité · Plomberie · Menuiserie · Carrelage · Peinture · Rénovation</div>
  </div>
  <div class="fh-d">
    <div class="fh-mot">${mot}</div>
    <div class="fh-num">${devis.numero ? 'N° ' + esc(devis.numero) : 'Brouillon'}</div>
  </div>
</header>
<div class="fh-filet"></div>
${annul ? `<div class="annul-bandeau"><b>Facture annulée</b>
  <span>${annul.le ? 'Le ' + esc(jour(annul.le)) + '. ' : ''}Cette facture ne donne lieu à aucun règlement.</span></div>` : ''}

<div class="parties">
  <div class="partie"><span>Entreprise</span><b>RGD Renova</b><br>
    20 avenue du Maréchal Joffre<br>60500 Chantilly</div>
  <div class="partie"><span>Client</span><b>${esc(d.nom || '')}</b><br>
    ${d.adresseChantier ? esc(d.adresseChantier) + '<br>' : ''}${[d.telephone, d.email].filter(Boolean).map(esc).join(' · ')}</div>
</div>

<div class="champs" style="margin-top:9px">
  ${champ(dev ? 'Date du devis' : 'Date de la facture', jour(devis.date_devis || new Date()), 'etroit')}
  ${dev ? champ('Valable jusqu’au', jour(ech), 'etroit')
    : annul ? champ('Annulée le', annul.le ? jour(annul.le) : '—', 'etroit')
    : regle ? champ('Réglée le', jour(regle.le) + (regle.par ? ' · ' + regle.par : ''), 'etroit')
    : champ('À régler avant le', jour(ech), 'etroit')}
  ${champ('Adresse des travaux', d.adresseChantier)}
</div>
${devis.objet ? `<div class="champs" style="margin-top:7px">${champ('Objet', devis.objet)}</div>` : ''}

<h2>Détail des prestations</h2>
<table class="lignes">
  <thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">Prix unitaire HT</th><th class="n">Total HT</th></tr></thead>
  ${parCategorie(lignes).map(({ categorie, items }) => `<tbody>
    <tr class="cat"><td colspan="4">${esc(categorie)}</td></tr>
    ${items.map(({ item: l }) => `<tr>
      <td><b>${esc(l.libelle)}</b>${l.variante ? ` — ${esc(l.variante)}` : ''}${l.precision ? `<small>${esc(l.precision)}</small>` : ''}${l.reference ? `<small>Réf. ${esc(l.reference)}</small>` : ''}</td>
      <td class="n">${esc(String(l.quantite).replace('.', ','))} ${esc(unite[l.unite] || '')}</td>
      <td class="n">${euros(l.prix_ht)}</td>
      <td class="n">${euros((Number(l.quantite) || 0) * (Number(l.prix_ht) || 0))}</td>
    </tr>`).join('')}
    ${items.length > 1 ? `<tr class="sous-total"><td colspan="3">Sous-total ${esc(categorie.toLowerCase())}</td>
      <td class="n">${euros(items.reduce((s, { item: l }) => s + (Number(l.quantite) || 0) * (Number(l.prix_ht) || 0), 0))}</td></tr>` : ''}
  </tbody>`).join('')}
</table>

<div class="totaux">
  <div><span>Total HT</span><span>${euros(devis.montant_ht)}</span></div>
  <div><span>TVA ${esc(String(taux).replace('.', ','))} %</span><span>${euros(devis.montant_tva)}</span></div>
  <div class="ttc"><span>Total TTC</span><span>${euros(devis.montant_ttc)}</span></div>
</div>

${MENTION_TVA[taux] ? `<p class="mention">${esc(MENTION_TVA[taux])}</p>` : ''}
${devis.notes ? `<h2>Remarques</h2><p style="margin:0;font-size:9.8pt;white-space:pre-line">${esc(devis.notes)}</p>` : ''}

${dev
  ? `<p class="mention">${esc(MENTIONS_DEVIS)}</p>`
  : annul
  ? `<p class="mention annulee-txt"><b>Facture annulée.</b> Cette facture a été annulée${
      annul.le ? ' le ' + esc(jour(annul.le)) : ''} et ne donne lieu à aucun règlement.${
      annul.motif ? ' Motif : ' + esc(annul.motif) + '.' : ''}</p>`
  : regle
  ? `<p class="mention acquittee"><b>Facture acquittée.</b> Le règlement de ${euros(devis.montant_ttc)} TTC
      a été reçu le ${esc(jour(regle.le))}${regle.par ? ' par ' + esc(regle.par) : ''}. Aucune somme ne reste due.</p>`
  : `<p class="mention">${esc(MENTIONS_PAIEMENT)}</p>`}

<div class="accord">
  <h2>${dev ? 'Bon pour accord' : 'Réception des travaux'}</h2>
  ${devis.signature ? `
  <p style="margin:0;font-size:9pt;color:${GRIS}">${dev
    ? 'Le client déclare avoir reçu le présent devis avant l’exécution des travaux et l’accepter sans réserve.'
    : 'Le client reconnaît que les prestations ci-dessus ont été exécutées et les accepte sans réserve.'}</p>
  <div class="sign">
    <div><b>Le client</b><span>${esc(devis.signe_par || d.nom || '')}</span>
      <img src="${esc(devis.signature)}" alt="Signature du client" style="display:block;height:58px;margin-top:2px">
      <small style="display:block;color:${GRIS};font-size:8pt">${dev ? 'Accepté' : 'Signé'} sur place le ${esc(momentSignature(devis))}</small></div>
    ${blocRgd()}
  </div>` : `
  <p style="margin:0;font-size:9pt;color:${GRIS}">Date et signature du client, précédées de la mention manuscrite
    « ${dev ? 'Devis reçu avant l’exécution des travaux' : 'Travaux reçus et acceptés'} ».</p>
  <div class="sign">
    <div><b>Le client</b><span>${esc(d.nom || 'Nom, signature')}</span><u></u></div>
    ${blocRgd()}
  </div>`}
</div>

<p class="pied-legal">${esc(MENTIONS_RGD)}<br>${esc(MENTIONS_ASSURANCE)}</p>
</body></html>`;
  return pageDevis;
}

// ------------------------------------------- le bon d'attachement
// Élodie, le 02/11/2026 : « avec cette facture je voudrais que cela génère
// automatiquement un bon d'attachement ». Le formulaire existait en A4
// recto-verso, vierge, dans `bon-attachement-rgd-electricite/` ; il est repris
// ici et PRÉ-REMPLI depuis la facture.
//
// ⚠ UN BON D'ATTACHEMENT N'EST PAS UNE FACTURE, et son propre encadré le dit :
// il constate contradictoirement les TEMPS PASSÉS et les FOURNITURES mises en
// œuvre. Le gabarit d'origine renvoyait au « devis référencé au recto » pour
// les prix ; généré depuis une facture, cette phrase tournerait en rond. Elle
// est donc réécrite pour dire ce qui est vrai ici : le bon accompagne la
// facture établie sur ces quantités.
//
// ⚠ CE QUI VIENT DE LA FACTURE, ET CE QUI RESTE BLANC. On remplit ce que la
// facture SAIT — client, chantier, date, numéro, prestations, heures,
// fournitures. Constats, contrôles, anomalies et suites à donner restent
// vierges : ce sont des observations de chantier, et les pré-cocher
// reviendrait à attester de contrôles que personne n'a faits.
//
// ⚠ LES LIGNES À L'HEURE VONT EN MAIN-D'ŒUVRE, LES AUTRES EN FOURNITURES. Le
// tri se fait sur l'unité (`heure`), pas sur le libellé : un intitulé se
// réécrit, une unité est structurelle.
const bonStyle = `
@page { size: A4; margin: 0; }
.ba { --or: #FD7A2C; --ink: #1A1A1A; --gris: #5e5e5e; --trait: #b9b9b9; --fond: #faf6f1; }
.ba * { box-sizing: border-box; }
.ba { font-family: "Segoe UI", Arial, sans-serif; color: #1A1A1A; font-size: 10pt; line-height: 1.3; }
.ba-page { width: 210mm; height: 296mm; padding: 11mm 13mm 8mm; display: flex; flex-direction: column; overflow: hidden; }
.ba-page + .ba-page { break-before: page; }
.ba header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5pt solid #FD7A2C; padding-bottom: 3.5mm; }
.ba .marque img { height: 13mm; display: block; }
.ba .coord { margin-top: 2mm; color: #5e5e5e; font-size: 8.8pt; line-height: 1.4; }
.ba .titre { text-align: right; }
.ba .titre h1 { margin: 0; font-size: 21pt; font-weight: 300; }
.ba .titre h1 b { font-weight: 700; }
.ba .sous { font-size: 9.5pt; color: #FD7A2C; font-weight: 600; text-transform: uppercase; letter-spacing: .8pt; margin-top: .6mm; }
.ba .ref { margin-top: 2.5mm; display: inline-grid; grid-template-columns: auto 44mm; gap: 1.6mm 2mm; font-size: 9.5pt; text-align: left; }
.ba .ref span:nth-child(odd) { color: #5e5e5e; text-align: right; }
.ba .ref span:nth-child(even) { border-bottom: .7pt solid #b9b9b9; font-weight: 600; }
.ba .rappel { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5pt solid #FD7A2C; padding-bottom: 3mm; }
.ba .rappel img { height: 9mm; }
.ba .rappel .ref { margin-top: 0; }
.ba h2 { margin: 5mm 0 2mm; font-size: 10.5pt; text-transform: uppercase; letter-spacing: .7pt; font-weight: 700; display: flex; align-items: center; gap: 2.5mm; }
.ba h2::before { content: ""; width: 5mm; height: 2pt; background: #FD7A2C; }
.ba .deux { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 0 8mm; }
.ba .champ { display: flex; align-items: flex-end; gap: 2mm; height: 7.5mm; }
.ba .champ label { color: #5e5e5e; white-space: nowrap; font-size: 9.5pt; padding-bottom: .4mm; }
.ba .champ i { flex: 1; border-bottom: .7pt solid #b9b9b9; height: 100%; font-style: normal; padding-bottom: .4mm; }
.ba .cases { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2.2mm 6mm; }
.ba .cases .c.large, .ba .controles .c.large { grid-column: 1 / -1; }
.ba .ligne-cases { display: flex; flex-wrap: wrap; gap: 2mm 7mm; margin-top: 2.6mm; }
/* ⚠ UN INTITULÉ DE RANGÉE N'EST PAS UNE CASE À COCHER. « Déplacement »,
   « Matériel déposé » et « Installation remise sous tension » portaient une
   case sur le papier : elle ne voulait rien dire (on coche Forfait ou
   Kilométrique, Oui ou Non), et maintenant que les cases se remplissent depuis
   l'écran elle resterait vide à jamais — on lirait un oubli. */
.ba .lc-titre { font-weight: 700; }
.ba .lc-nb { color: #5e5e5e; }
.ba .c { display: flex; align-items: center; gap: 2.2mm; }
.ba .c::before { content: ""; width: 4mm; height: 4mm; border: 1pt solid #1A1A1A; border-radius: .6mm; flex: none; }
/* ⚠ UNE CASE COCHÉE EST UNE CASE NOIRE, pas seulement un signe : les
   navigateurs n'impriment pas les fonds par défaut, mais ici la BORDURE reste
   et le ✓ est en blanc sur noir — si le fond ne sort pas, le ✓ disparaît avec
   lui et la case redevient vide. On garde donc les deux : le fond noir pour
   l'écran et le PDF (photographié, fonds compris), et le ✓ qui se lit même
   imprimé sans les fonds, en encre sur une case vide. */
.ba .c.on::before { content: "✓"; background: #1A1A1A; color: #fff; font-size: 8pt;
  line-height: 3.4mm; text-align: center; font-weight: 700; }
.ba .c.on { font-weight: 600; }
.ba .lignes div { height: 8mm; border-bottom: .7pt solid #b9b9b9; padding-top: 1mm; }
.ba .mesure { display: inline-block; width: 18mm; border-bottom: .7pt solid #b9b9b9; margin: 0 1mm; height: 4.5mm;
  vertical-align: bottom; text-align: center; font-weight: 600; }
.ba .mesure.long { width: 52mm; text-align: left; padding-left: 1mm; }
.ba table { width: 100%; border-collapse: collapse; }
.ba th { background: #1A1A1A; color: #fff; font-weight: 600; font-size: 9pt; text-align: left; padding: 1.6mm 2mm; }
.ba td { border-bottom: .7pt solid #b9b9b9; height: 8.5mm; padding: 0 2mm; }
.ba td + td { border-left: .7pt solid #dedede; }
.ba th + th { border-left: .7pt solid #444; }
.ba tfoot td { border-bottom: none; font-weight: 600; text-align: right; color: #5e5e5e; }
.ba tfoot td.tot { border: 1pt solid #1A1A1A; text-align: center; color: #1A1A1A; }
.ba .note { font-size: 8.8pt; color: #5e5e5e; margin-top: 1.6mm; }
.ba .controles { display: grid; grid-template-columns: 1fr 1fr; gap: 2.6mm 8mm; }
.ba .encadre { background: #faf6f1; border-left: 2.5pt solid #FD7A2C; padding: 2.6mm 3.5mm; font-size: 8.8pt; color: #333; margin-top: 5mm; }
.ba .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; margin-top: 5mm; flex: 1; min-height: 40mm; }
.ba .sig { border: 1pt solid #1A1A1A; border-radius: 1.2mm; padding: 3mm 4mm; display: flex; flex-direction: column; }
.ba .sig b { font-size: 10pt; text-transform: uppercase; letter-spacing: .6pt; }
.ba .sig .mention { color: #5e5e5e; font-size: 8.8pt; margin-top: .8mm; }
.ba .sig .cases { margin-top: 2.4mm; grid-template-columns: 1fr; gap: 1.8mm; }
.ba .sig img { display: block; max-height: 22mm; max-width: 100%; margin-top: 2mm; }
.ba .vide { flex: 1; }
.ba footer { margin-top: 4mm; padding-top: 2mm; border-top: .7pt solid #b9b9b9; font-size: 7.6pt; color: #5e5e5e; display: flex; justify-content: space-between; gap: 5mm; }
.ba footer span:last-child { white-space: nowrap; }
`;

/**
 * Les cases d'un groupe, cochées depuis la saisie.
 *
 * ⚠ C'EST LA DÉCLARATION DE `rgd-bon-attachement.js` QUI LES ÉCRIT, pas ce
 * fichier. Les douze natures d'intervention étaient ici en dur ; le jour où le
 * formulaire en a proposé une treizième, le PDF ne l'aurait pas imprimée — une
 * observation saisie qui n'arrive jamais chez le client, et rien pour le dire.
 */
const casesDu = (nom, s) => GROUPES[nom].options.map((o) => {
  const champ = o.aussi
    ? ` : <span class="mesure${o.long ? ' long' : ''}">${esc(s?.[o.aussi] || '')}</span>${o.unite ? ' ' + o.unite : ''}`
    : '';
  const mot = o.gras ? `<b>${esc(o.l)}</b>` : esc(o.l);
  // ⚠ UNE OPTION QUI OUVRE UN CHAMP LONG PREND TOUTE LA LARGEUR. Mesuré :
  // « Autre : ____ » dans une colonne de 60 mm repliait le mot au-dessus de son
  // trait, et on lisait « Autre » seul sur une ligne.
  return `<span class="c${coche(s, nom, o.c) ? ' on' : ''}${o.large ? ' large' : ''}">${mot}${champ}</span>`;
}).join('');

/** Le bon d'attachement, pré-rempli depuis une facture du CRM et sa saisie. */
export function bonAttachementHtml(d, devis) {
  // ⚠ `saisieDepart` RÉPOND MÊME SUR UN BON JAMAIS OUVERT : elle complète ce
  // qui manque depuis la facture. C'est ce qui garde au bon imprimé son
  // pré-remplissage d'avant le formulaire — date, objet, heures de chaque
  // ligne — sans qu'il faille d'abord le remplir à l'écran pour l'imprimer.
  const s = saisieDepart(devis, d, devis.bon_saisie);
  const fournitures = lignesFourniture(devis);
  const heures = totalHeures(s);
  const laDate = jour(devis.date_devis || new Date());
  const num = devis.numero || '';
  const sig = devis.bon_signature ? {
    image: devis.bon_signature,
    nom: devis.bon_signe_par || d.nom || '',
    quand: devis.bon_signe_a
      ? `${jour(new Date(devis.bon_signe_a))} à ${new Date(devis.bon_signe_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : laDate,
  } : null;

  // Le texte saisi devient des lignes écrites ; on complète toujours par des
  // lignes vides, pour qu'il reste de la place à la main sur le papier.
  // ⚠ UN BON ENVOYÉ PAR MAIL GARDE CES LIGNES VIDES, et c'est voulu : le
  // client doit voir ce qui n'a pas été renseigné. Les faire disparaître
  // donnerait un document qui a l'air complet quoi qu'on y ait mis.
  const vides = (n) => Array.from({ length: Math.max(0, n) }, () => '<div></div>').join('');
  const enLignes = (texte, mini) => {
    const l = String(texte || '').split('\n').filter(x => x.trim());
    return l.map(x => `<div>${esc(x)}</div>`).join('') + vides(mini - l.length);
  };
  const rangsMo = (Array.isArray(s.mo) ? s.mo : []).map(r => `<tr><td>${esc(r.date ? jour(r.date) : '')}</td>`
    + `<td>${esc(r.qui || '')}</td><td>${esc(r.habilitation || '')}</td><td>${esc(r.arrivee || '')}</td>`
    + `<td>${esc(r.depart || '')}</td><td>${esc(r.pause || '')}</td>`
    + `<td>${esc(String(r.duree ?? '').replace('.', ','))}</td></tr>`).join('')
    + Array.from({ length: Math.max(0, 3 - (s.mo?.length || 0)) }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
  const rangsFourn = fournitures.map((l, i) => {
    const f = (Array.isArray(s.fournitures) && s.fournitures[i]) || {};
    return `<tr><td>${esc(l.libelle)}${l.variante ? ' — ' + esc(l.variante) : ''}${l.precision ? ' — ' + esc(l.precision) : ''}</td>`
      + `<td>${esc(f.reference || l.reference || '')}</td><td>${esc(unite[l.unite] || '')}</td>`
      + `<td>${esc(String(l.quantite).replace('.', ','))}</td><td>${esc(nomFourniPar(f.fourni_par))}</td></tr>`;
  }).join('')
    + Array.from({ length: Math.max(1, 6 - fournitures.length) }, () => '<tr><td></td><td></td><td></td><td></td><td></td></tr>').join('');

  const piedLegal = `<footer>
    <span>${esc(MENTIONS_RGD)}</span>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(titreDocument(`Bon d'attachement ${num}`.trim(), d))}</title>
<style>${bonStyle}</style></head><body class="ba">

<div class="ba-page">
<header>
  <div class="marque">
    <img src="${LOGO}" alt="RGD Renova">
    <div class="coord">
      Électricité générale · Dépannage &amp; installation<br>
      Intervention Alpes-Maritimes (06) et Var (83)<br>
      06 72 06 88 36 · contact@rgdrenova.fr · rgdrenova.fr
    </div>
  </div>
  <div class="titre">
    <h1>Bon <b>d'attachement</b></h1>
    <div class="sous">Travaux d'électricité</div>
    <div class="ref">
      <span>N°</span><span>${esc(numeroBon(devis))}</span>
      <span>Date</span><span>${esc(laDate)}</span>
      <span>Facture n°</span><span>${esc(num)}</span>
    </div>
  </div>
</header>

<div class="deux">
  <div>
    <h2>Client / donneur d'ordre</h2>
    <div class="champ"><label>Nom / société</label><i>${esc(d.nom || '')}</i></div>
    <div class="champ"><label>Adresse</label><i>${esc(d.adresseChantier || '')}</i></div>
    <div class="champ"><label></label><i></i></div>
    <div class="champ"><label>Téléphone</label><i>${esc(d.telephone || '')}</i></div>
    <div class="champ"><label>E-mail</label><i>${esc(d.email || '')}</i></div>
    <div class="ligne-cases">${casesDu('client_type', s)}</div>
  </div>
  <div>
    <h2>Lieu d'intervention</h2>
    <div class="champ"><label>Adresse du chantier</label><i>${esc(d.rueChantier || d.adresseChantier || '')}</i></div>
    <div class="champ"><label>Code postal / ville</label><i>${esc(s.lieu_cp_ville || '')}</i></div>
    <div class="champ"><label>Bât. / étage / lot</label><i>${esc(s.lieu_batiment || '')}</i></div>
    <div class="champ"><label>Accès / code</label><i>${esc(s.lieu_acces || '')}</i></div>
    <div class="champ"><label>Contact sur place</label><i>${esc(s.lieu_contact || '')}</i></div>
    <div class="ligne-cases">${casesDu('lieu_type', s)}</div>
  </div>
</div>

<h2>Nature de l'intervention</h2>
<div class="cases" style="grid-template-columns: 1.25fr 1fr 1fr; gap: 2.2mm 4mm;">${casesDu('nature', s)}</div>
<div class="ligne-cases">${casesDu('regime', s)}</div>

<h2>Constat et travaux réalisés</h2>
<div class="lignes">${enLignes(s.constat, 5)}</div>

<h2>Main-d'œuvre</h2>
<table>
  <thead><tr><th style="width:15%">Date</th><th>Intervenant(s)</th><th style="width:14%">Habilitation</th><th style="width:11%">Arrivée</th><th style="width:11%">Départ</th><th style="width:10%">Pause</th><th style="width:12%">Durée (h)</th></tr></thead>
  <tbody>${rangsMo}</tbody>
  <tfoot><tr><td colspan="6">Total heures</td><td class="tot">${heures ? esc(String(heures).replace('.', ',')) : ''}</td></tr></tfoot>
</table>
<div class="ligne-cases">
  <span class="lc-titre">Déplacement</span>${casesDu('deplacement', s)}
  <span class="lc-nb">Nb : <span class="mesure" style="width:10mm">${esc(s.deplacement_nb || '')}</span></span>
</div>

<div class="vide"></div>
${piedLegal}
    <span>Recto 1/2 · suite au verso</span>
  </footer>
</div>

<div class="ba-page">
<div class="rappel">
  <img src="${LOGO}" alt="RGD Renova">
  <div class="ref"><span>Bon d'attachement n°</span><span>${esc(num ? 'BA' + num.replace(/^FA/, '') : '')}</span></div>
</div>

<h2>Fournitures posées</h2>
<table>
  <thead><tr><th>Désignation</th><th style="width:24%">Marque / référence</th><th style="width:10%">Unité</th><th style="width:11%">Quantité</th><th style="width:15%">Fourni par</th></tr></thead>
  <tbody>${rangsFourn}</tbody>
</table>
<div class="note">Fourni par : RGD (stock ou achat) ou client.</div>
<div class="ligne-cases" style="margin-top:2mm">
  <span class="lc-titre">Matériel déposé</span>${casesDu('materiel', s)}
</div>

<h2>Contrôles avant remise sous tension</h2>
<div class="controles">${casesDu('controles', s)}</div>
<div class="ligne-cases" style="margin-top:3mm">
  <span class="lc-titre">Installation remise sous tension</span>${casesDu('sous_tension', s)}
</div>

<h2>Anomalies constatées hors intervention</h2>
<div class="lignes">${enLignes(s.anomalies, 2)}</div>

<h2>Suite à donner</h2>
<div class="cases">${casesDu('suite', s)}</div>

<div class="encadre">
  Le présent bon constate contradictoirement les temps passés et les fournitures réellement mises en œuvre.
  Il ne vaut pas facture : il accompagne la facture n° ${esc(num || '—')}, établie sur ces quantités.
  Les anomalies signalées ci-dessus et non traitées restent sous la responsabilité du client jusqu'à leur reprise.
</div>

<div class="signatures">
  <div class="sig">
    <b>L'intervenant RGD Renova</b>
    ${s.signature_rgd
      ? `<div class="mention">${esc(s.intervenant || '')}${s.signature_rgd_le ? ' — le ' + esc(jour(s.signature_rgd_le)) : ''}</div>
         <img src="${esc(s.signature_rgd)}" alt="Signature de l'intervenant">`
      : `<div class="mention">${s.intervenant ? esc(s.intervenant) + ' — date et signature' : 'Nom, date et signature'}</div>`}
  </div>
  <div class="sig">
    <b>Le client</b>
    ${sig
      ? `<div class="mention">${esc(sig.nom)} — signé sur place le ${esc(sig.quand)}</div>
         <img src="${esc(sig.image)}" alt="Signature du client">`
      : '<div class="mention">Nom, date et signature précédés de « Lu et approuvé »</div>'}
    <div class="cases">${casesDu('reception', s)}</div>
  </div>
</div>

${piedLegal}
    <span>Verso 2/2 · Ex. 1 : client · Ex. 2 : RGD</span>
  </footer>
</div>

</body></html>`;
}

// ------------------------------------------------------------------ portes
// ⚠ `donneesDocument` N'EST LUE QU'UNE FOIS : elle interroge la base et calcule
// l'etape, et deux lectures pourraient rendre deux noms si une ecriture tombe
// entre les deux.
export const imprimerFicheProjet = (x, devis) => {
  const d = donneesDocument(x, devis);
  imprimerPage(ficheProjetHtml(d), titreDocument('Fiche projet', d));
};
export const imprimerReception = (x, devis) => {
  const d = donneesDocument(x, devis);
  imprimerPage(receptionHtml(d), titreDocument('PV de réception', d));
};
export const imprimerBonAttachement = (x, devis) => {
  const d = donneesDocument(x);
  imprimerPage(bonAttachementHtml(d, devis), titreDocument(`Bon d'attachement ${devis.numero || ''}`.trim(), d));
};
export const imprimerDevisCrm = (x, devis) => {
  const d = donneesDocument(x);
  imprimerPage(devisCrmHtml(d, devis), titreDocument(`${estDevis(devis) ? 'Devis' : 'Facture'} ${devis.numero || ''}`.trim(), d));
};

// ------------------------------------------- le devis en PDF, pour le mail
// ⚠ UN PDF FABRIQUÉ DANS LE NAVIGATEUR, PAS PAR L'IMPRESSION (29/10/2026,
// Élodie : « un bouton pour envoyer directement le devis par mail »). La boîte
// d'impression rend un fichier que la page ne peut pas reprendre ; pour le
// joindre au mail il faut ses octets. On photographie donc le même gabarit
// (`devisCrmHtml`, la seule mise en page du devis) et on le pose dans un A4.
//
// ⚠ LES DEUX BIBLIOTHÈQUES SONT DANS `assets/`, PAS SUR UN CDN : une version
// ouverte sur un CDN tiers a déjà fait tomber le CRM. Elles ne se chargent
// qu'au premier envoi — une fiche qu'on ouvre n'a pas à télécharger 560 ko.
const charge = (src) => new Promise((ok, ko) => {
  if (document.querySelector(`script[data-lib="${src}"]`)) return ok();
  const s = Object.assign(document.createElement('script'), { src: new URL(`../../assets/${src}`, import.meta.url).href });
  s.dataset.lib = src;
  s.onload = () => ok(); s.onerror = () => ko(new Error(`Bibliothèque ${src} introuvable`));
  document.head.appendChild(s);
});

/**
 * N'importe lequel de ces gabarits en PDF : { base64, nom }.
 *
 * ⚠ UN SEUL FABRICANT DE PDF, ET C'EST TOUT L'INTÉRÊT DE L'AVOIR SORTI DU
 * DEVIS (02/11/2026, en ajoutant l'envoi du bon d'attachement). Il porte
 * quatre corrections payées une à une — la marge, la coupe sur une ligne
 * blanche, la page blanche de fin, les bibliothèques servies depuis `assets/`.
 * Un second fabricant pour le bon aurait recommencé à les payer, une par une.
 *
 * ⚠ `feuilles` CHANGE LA DÉCOUPE, ET LE BON EN A BESOIN. Sans lui, on
 * photographie le corps entier et on le tranche tous les 277 mm : ça convient
 * à un devis, qui COULE sur autant de pages qu'il faut. Le bon, lui, est deux
 * A4 FIXES de 296 mm — la tranche serait tombée 9 mm dans le verso, et le pied
 * du recto aurait fini en haut de la page suivante. Avec un sélecteur, chaque
 * feuille est photographiée pour elle-même et posée sur sa propre page.
 */
async function pdfDepuisHtml(html, nom, { feuilles = null } = {}) {
  await charge('html2canvas.min.js');
  await charge('jspdf.umd.min.js');
  const cadre = document.createElement('iframe');
  // 794 px = un A4 à 96 points par pouce : la page se met en forme comme à
  // l'impression. Hors de l'écran, mais RENDUE (pas de display:none, sinon
  // rien à photographier).
  cadre.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden';
  document.body.appendChild(cadre);
  try {
    await new Promise((ok) => { cadre.onload = ok; cadre.srcdoc = html; });
    const doc = cadre.contentDocument;
    await Promise.all([...doc.images].map(i => (i.complete ? null : new Promise(r => { i.onload = r; i.onerror = r; }))));
    const photo = (el) => window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', windowWidth: 794, useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

    // Une feuille déjà au format A4 : on la pose entière, sans découpe.
    const pages = feuilles ? [...doc.querySelectorAll(feuilles)] : [];
    if (pages.length) {
      const MARGE_F = 10;
      const large = 210 - 2 * MARGE_F;
      const hauteurMax = 297 - 2 * MARGE_F;
      for (let n = 0; n < pages.length; n++) {
        const t = await photo(pages[n]);
        if (n) pdf.addPage();
        // On garde les proportions : c'est une page dessinée, pas une image à
        // étirer. Si elle dépasse en hauteur, c'est la hauteur qui commande.
        let l = large;
        let h = large * t.height / t.width;
        if (h > hauteurMax) { h = hauteurMax; l = hauteurMax * t.width / t.height; }
        pdf.addImage(t.toDataURL('image/jpeg', 0.92), 'JPEG', (210 - l) / 2, MARGE_F, l, h);
      }
      return { base64: pdf.output('datauristring').split(',')[1], nom };
    }

    const toile = await photo(doc.body);

    // ⚠ UNE MARGE, PARCE QUE L'IMAGE ÉTAIT POSÉE BORD À BORD (02/11/2026,
    // Élodie : « je voudrais avoir de la marge sur le pdf »). Elle occupait les
    // 210×297 entiers : rien ne respirait, et la moindre imprimante rognait.
    const MARGE = 10;                                   // mm
    const largeurUtile = 210 - 2 * MARGE;               // 190 mm
    const pxParMm = toile.width / largeurUtile;
    const hauteurPage = Math.floor((297 - 2 * MARGE) * pxParMm);

    // ⚠ ET ON NE COUPE PLUS AU MILIEU D'UNE LIGNE. Le découpage se faisait tous
    // les N pixels, à l'aveugle : une phrase se retrouvait tranchée en deux,
    // moitié en bas d'une page, moitié en haut de la suivante (constaté sur une
    // vraie facture, la mention de TVA coupée en son milieu). On cherche donc,
    // un peu AVANT la coupe idéale, une ligne de pixels entièrement blanche :
    // un interligne, un blanc entre deux rangées. Faute d'en trouver, on coupe
    // au plus juste comme avant — mieux vaut une page pleine qu'un document
    // qui ne sort pas.
    const ctx2 = toile.getContext('2d', { willReadFrequently: true });
    const ligneVide = (y) => {
      const px = ctx2.getImageData(0, y, toile.width, 1).data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] < 248 || px[i + 1] < 248 || px[i + 2] < 248) return false;
      }
      return true;
    };
    // 180 px à l'échelle 2, soit ~12 mm : de quoi enjamber une rangée de
    // tableau. Remonter plus laisserait un grand vide en bas de page.
    const FENETRE = 180;
    const coupeNette = (ideal) => {
      if (ideal >= toile.height) return toile.height;
      for (let y = ideal; y > ideal - FENETRE && y > 0; y--) if (ligneVide(y)) return y;
      return ideal;
    };

    let y = 0;
    for (let n = 0; y < toile.height; n++) {
      const fin = coupeNette(Math.min(y + hauteurPage, toile.height));
      const haut = fin - y;
      // Un reste de quelques pixels (la marge du bas) ferait une page blanche :
      // mesuré, le premier essai sortait 2 pages pour un devis qui en tient une.
      if (n && haut < hauteurPage * 0.05) break;
      const tranche = document.createElement('canvas');
      tranche.width = toile.width;
      tranche.height = haut;
      tranche.getContext('2d').drawImage(toile, 0, y, toile.width, haut, 0, 0, toile.width, haut);
      if (n) pdf.addPage();
      pdf.addImage(tranche.toDataURL('image/jpeg', 0.92), 'JPEG', MARGE, MARGE, largeurUtile, haut / pxParMm);
      y = fin;
    }
    return { base64: pdf.output('datauristring').split(',')[1], nom };
  } finally {
    cadre.remove();
  }
}

/** Le devis ou la facture en PDF, pour le mail. */
export async function pdfDevisCrm(x, devis) {
  const d = donneesDocument(x);
  const titre = `${estDevis(devis) ? 'Devis' : 'Facture'} ${devis.numero || ''}`.trim();
  return pdfDepuisHtml(devisCrmHtml(d, devis), `${titreDocument(titre, d)}.pdf`);
}

/** Le bon d'attachement en PDF, pour le mail — recto et verso. */
export async function pdfBonAttachement(x, devis) {
  const d = donneesDocument(x);
  const titre = `Bon d'attachement ${numeroBon(devis)}`.trim();
  return pdfDepuisHtml(bonAttachementHtml(d, devis), `${titreDocument(titre, d)}.pdf`, { feuilles: '.ba-page' });
}
