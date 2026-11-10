// Espace RGD Renova — vue d'ensemble
//
// ÉTAPE 4 DE LA MIGRATION. C'est l'écran d'accueil du tableau de bord RGD,
// refait ici en lecture seule. Il passe avant le rang 6 parce que c'est celui
// que Mickael ouvre le matin.
//
// LES CHIFFRES SONT CEUX DU TABLEAU DE BORD, PAS LES MIENS
// Chaque KPI reprend la définition écrite dans `worker/src/routes/stats.js`,
// pas une définition plus simple qui aurait donné un nombre voisin. Deux écrans
// qui affichent deux vérités différentes sur le même chiffre, c'est pire que
// pas d'écran du tout : personne ne sait plus lequel croire.
//
// LE CA AFFICHÉ EST CELUI QUE LE CRM CALCULE — depuis le 23/09/2026
// `manual_ca_ht_exercice` et `manual_ca_ttc_exercice` (table `rgd_reglages`)
// l'emportent TOUJOURS sur le calcul quand elles portent une valeur, mais
// elles sont désormais VIDES, et c'est délibéré.
//
// ⚠ POURQUOI ON A COUPÉ CETTE CORRECTION, ET CE QU'ELLE A COÛTÉ.
// Elle existait parce que le calcul sous-estimait : la reprise Costructor
// était incomplète. Ce n'est plus vrai — la synchronisation a été réparée le
// 23/09/2026 et le calcul donne exactement le chiffre de Costructor.
//
// Mais elle a coûté cher avant d'être coupée. La synchronisation était en
// panne depuis le 27/07 ; le calcul était donc figé, et la valeur saisie
// aussi, puisqu'elle datait du même moment. **Les deux coïncidaient au
// centime**, ce qui donnait l'air d'une donnée saine — alors qu'il manquait
// 21 000 € et deux mois de factures. Une correction manuelle ne masque pas
// seulement un écart : elle masque le SIGNAL qu'un écart apparaîtrait.
//
// Si quelqu'un en repose une, l'écran le dit et rappelle de vérifier la date
// du dernier relevé avant de se rassurer. Ne pas retirer cet avertissement.
//
// CE QUE CET ÉCRAN NE SAIT PAS
// Les notes Google Keep (jamais reprises, elles vivent chez Google), les
// relances dues et les formations à recycler (tables `relances` et
// `competences`, vides dans D1 au 21/09/2026). Il le dit au lieu d'afficher
// zéro, qui se lirait comme un résultat.
import { scope } from '../data/scope.js';
import { esc, eur, isoDay, fmtDate, daysSince, openModal } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard, KEY } from './rgd-espace.js';
import { etapesRgd, ETAPES_HORS_CYCLE } from '../data/rgd-etapes.js';
import { objectifsMensuels, moisObjectifs, tauxPeriode, taux, detailMoisObjectif } from '../data/rgd-objectifs.js';
import { encadreCaOuvrier } from './rgd-ca-ouvrier.js';
import { carteBilan } from './rgd-bilan.js';
import { bilanCommercial } from '../data/rgd-bilan.js';

// L'exercice comptable de RGD Renova : 1er octobre → 30 septembre, aligné sur
// Costructor. Ce n'est pas l'année civile, et s'y tromper décale tout le CA.
const exercice = (d = new Date()) => {
  const a = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 10
    ? { du: `${a}-10-01`, au: `${a + 1}-09-30`, label: `${a}–${a + 1}` }
    : { du: `${a - 1}-10-01`, au: `${a}-09-30`, label: `${a - 1}–${a}` };
};

// LE PIPELINE COMMERCIAL — LES SEPT ÉTAPES DE « CLIENTS & PROSPECTS »
//
// ⚠ IL NE CALCULE PLUS RIEN : `etapesRgd()` fait foi (js/data/rgd-etapes.js).
// Avant le 23/09/2026 cet écran reprenait sept étapes d'une route du worker,
// bâties sur `statut_suivi` seul — deux écrans, deux vocabulaires, et des
// nombres qui ne se retrouvaient nulle part.
//
// J'avais d'abord réécrit le calcul ici. C'était l'erreur à ne pas faire :
// « deux écrans qui affichent deux vérités sur le même chiffre valent moins
// que pas d'écran du tout ». Et ma version se trompait déjà — il lui manquait
// le garde qui écarte les fiches Costructor restées au statut par défaut, donc
// les 158 de l'annuaire se seraient déversées dans « Nouvelle demande ».
//
// ⚠ CE N'EST PAS UNE COHORTE. Chaque étape compte ce qui s'y trouve
// AUJOURD'HUI, pas ce qu'est devenue une population arrivée à une date donnée.
// Les nombres ne décroissent donc pas forcément et il n'y a aucun taux de
// passage à en tirer — d'où une frise à colonnes de MÊME largeur, et surtout
// pas un entonnoir qui rétrécit : la forme raconterait ce que les chiffres
// démentent.
const COULEURS = {
  demande: '#9CA3AF', rdv: '#2A6FBF', devis_encours: '#B45C00',
  devis_accepte: '#FD7A2C', chantier_encours: '#22C55E',
  chantier_termine: '#059669', sav: '#D97706', archives: '#B91C1C', indesirable: '#7F1D1D',
};

// ⚠ IL N'Y A PLUS DE MENTION « DORMANT » SUR LES CARTES, et son calcul est
// parti avec elle (05/11/2026, Élodie : « enlève la mention 1 sans nouvelles
// depuis 30 jours »). Elle était née le 02/11 avec le montant, pour répondre à
// « qu'est-ce qui ne bouge plus » ; renommée le 05/11 parce qu'elle ne se
// comprenait pas, puis retirée le même jour. Ce qui a été supprimé avec :
// `VIEUX_JOURS`, `DATE_DE_L_ETAPE` et `dormants()`. Les garder « au cas où »
// aurait laissé une cinquantaine de lignes que plus rien ne lit — c'est
// précisément ce que cet écran a déjà nettoyé une fois, et la raison tient :
// du code mort se relit comme du code vivant, et on finit par le réparer.
//
// ⚠ `etapesRgd()` REND TOUJOURS `devis` PAR ÉTAPE. C'était la seule chose qui
// le lisait ici, mais il porte aussi le montant et le compte des dossiers
// chiffrés : la liste des devis vient de la même boucle et ne coûte rien. Si
// elle devait partir, c'est là-bas qu'il faudrait la retirer, pas ici.

/**
 * La frise du pipeline : une colonne par étape, cliquable vers son onglet.
 * ⚠ MÊME LARGEUR POUR TOUTES — voir plus haut : ce n'est pas un entonnoir.
 */
function frisePipeline(etapes) {
  // ⚠ UNE CARTE `horsEchelle` NE RENTRE NI DANS LE MAX NI DANS LE TOTAL.
  // « Chantier terminé » porte des chantiers d'historique au milieu d'une
  // douzaine de personnes du jour : comptée, elle écrasait toutes les autres
  // barres à 6 % de hauteur et s'affichait elle-même « 362 % ». Les deux
  // mesures ne sont pas du même ordre, on ne les met donc pas sur la même
  // échelle — c'est la raison du drapeau, pas une coquetterie d'affichage.
  const echelle = etapes.filter(e => !e.horsEchelle);
  const max = Math.max(1, ...echelle.map(e => e.n));
  const total = echelle.filter(e => !e.hors).reduce((t, e) => t + e.n, 0);
  // ⚠ « 3 dossiers chiffrés » EST ÉCRIT EN TOUTES LETTRES à côté du montant :
  // à « Devis en cours », une partie des dossiers n'a pas encore de devis, et
  // un montant seul laisserait croire à une somme sur l'étape entière. C'est
  // le mot que « Clients & prospects » emploie sous son total.
  const poidsCarte = (e) => !e.avecMontant ? '<span class="rgd-et-poids"></span>'
    : `<span class="rgd-et-poids">
      <b>${esc(eur(e.montant))}</b>
      ${'' /* ⚠ « N CHIFFRÉS » COMPTE LES DOSSIERS DU CRM QUI PORTENT DÉJÀ UN
         DEVIS. Sur la carte d'historique, dont le montant vient du bilan, le mot
         n'a pas d'objet — « 47 chiffrés » se lirait comme un second compte. */}
      ${e.horsEchelle ? '<em>signés</em>'
        : `<em>${e.chiffres} chiffré${e.chiffres > 1 ? 's' : ''}</em>`}
    </span>`;
  const carte = (e) => `<a class="rgd-et${e.hors ? ' hors' : ''}"
      href="#/rgd/clients?vue=${esc(e.cle)}" style="--c:${esc(e.couleur)}"
      title="${esc(e.titre || e.label)} — ouvrir dans Clients &amp; prospects">
    <span class="rgd-et-n">${e.n}</span>
    <span class="rgd-et-label">${esc(e.label)}</span>
    <span class="rgd-et-piste"><i style="height:${e.horsEchelle ? 100 : Math.round((e.n / max) * 100)}%"></i></span>
    ${poidsCarte(e)}
    ${'' /* ⚠ PAS DE POURCENTAGE SUR UNE CARTE HORS ÉCHELLE : « 47 sur 13 » ne
       veut rien dire. À la place, la période que le chiffre couvre — sans quoi on
       le lirait comme l'état du jour, comme ses voisines. */}
    <span class="rgd-et-part">${e.horsEchelle ? 'depuis la création'
      : (total && !e.hors ? Math.round((e.n / total) * 100) + ' %' : '')}</span>
  </a>`;
  return `<div class="rgd-frise">
    ${etapes.filter(e => !e.hors).map(carte).join('')}
    <span class="rgd-frise-sep" aria-hidden="true"></span>
    ${etapes.filter(e => e.hors).map(carte).join('')}
  </div>`;
}



// ------------------------------------------------ LES OBJECTIFS DU MOIS
// Élodie, le 04/11/2026 : « un graphique qui synthétise toutes les demandes
// mensuelles ainsi que leurs objectifs et performances ».
//
// ⚠ IL EST POSÉ ENTRE LE PIPELINE ET LE CHIFFRE D'AFFAIRES, à sa demande, et
// l'ordre a du sens : le pipeline dit où en sont les affaires AUJOURD'HUI,
// celui-ci dit à quel RYTHME elles entrent, et le chiffre d'affaires ce que ce
// rythme a produit. Les trois se lisent de haut en bas comme une même phrase.
//
// ⚠ CE QUI SÉPARE CE TABLEAU DU PIPELINE, et qu'il ne faut pas confondre : le
// pipeline compte des affaires PRÉSENTES dans une étape, celui-ci compte des
// événements DATÉS d'un mois. Un même dossier n'apparaît qu'une fois dans le
// pipeline, et autant de fois ici qu'il a franchi d'étapes.

// La couleur d'une performance. Trois paliers seulement : atteint, en chemin,
// loin. Un dégradé continu se lit moins vite qu'un feu à trois couleurs.
const tonObjectif = (part) => (part >= 1 ? 'vert' : part >= 0.5 ? 'ambre' : 'rouge');

// ------------------------------------------------ LES QUATRE INDICATEURS
// ⚠ AUCUNE FORME NOUVELLE ICI, ET C'EST LA CONSIGNE (05/11/2026, Élodie :
// « reprends le style du reste du CRM »). Trois dessins ont été écartés avant
// celui-ci — quatre frises de barres, puis un graphique groupé, puis des
// anneaux animés —, le dernier parce qu'il parlait une langue à lui au milieu
// d'un écran qui en parle déjà une : « trop de blocs différents ».
//
// Cette carte n'emploie donc QUE ce qui existe au-dessus et en dessous d'elle :
// les rangees `rgd-pipe-table` du CRM, ses pistes horizontales, et
// le graphique du chiffre d'affaires, classes comprises. Si l'un de ces trois
// change de style un jour, celle-ci suit toute seule — c'était tout l'intérêt.
//
// ⚠ NE PAS Y RAJOUTER D'ANNEAUX, DE DÉGRADÉS NI DE PASTILLES COLORÉES. Ce qui
// a été reproché n'est pas la couleur, c'est le nombre de langages.
const SERIES = [
  { champ: 'demandes', cible: 'demandes', label: 'Demandes', court: 'Demandes', couleur: 'var(--blue)' },
  { champ: 'rdv', cible: 'rdv', label: 'Rendez-vous', court: 'RDV', couleur: 'var(--violet)' },
  { champ: 'devisSignes', cible: 'devis', label: 'Devis signés', court: 'Devis', couleur: 'var(--amber)' },
  { champ: 'ca', cible: 'ca', label: 'Chiffre d’affaires', court: 'CA', couleur: 'var(--green)' },
];

/**
 * Les douze derniers mois des quatre indicateurs, sur UN SEUL graphique.
 *
 * ⚠ UN CADRE À QUATRE COURBES, ET C'EST UN RETOUR EN ARRIÈRE ASSUMÉ
 * (10/11/2026, Élodie : « je n'aime pas du tout comment c'est présenté et les
 * 4 graphiques en dessous prennent trop de place. Je voudrais que tu fasses un
 * seul graphique avec 4 courbes différentes »). La même forme avait été
 * écartée le 05/11 ; elle lui a été remontrée à côté de deux autres, sur ses
 * VRAIS chiffres, et c'est celle-là qu'elle a retenue. Les quatre vignettes
 * mesuraient 331 px à elles seules (mesuré dans le navigateur) ; ce cadre en
 * fait 200.
 *
 * ⚠ LES DEUX DÉFAUTS DE LA PREMIÈRE TENTATIVE SONT TRAITÉS, PAS OUBLIÉS :
 *   1. son axe était en POURCENTAGE DE L'OBJECTIF — juste, mais abstrait :
 *      « 60 % » ne dit pas si ce sont six rendez-vous ou trois devis. Il y a
 *      donc DEUX échelles, les comptages à gauche et les euros à droite. Rien
 *      n'est converti. ⚠ ET L'AXE DE DROITE EST ÉCRIT EN VERT, la couleur de
 *      la seule courbe qui s'y lit : sans cela rien ne dirait laquelle.
 *   2. les quatre lignes s'enchevêtraient. Le survol donne maintenant les
 *      QUATRE valeurs du mois pointé dans une seule bulle, avec une ligne
 *      guide : on n'a plus à suivre une courbe de l'œil.
 *
 * ⚠ L'ÉCHELLE DE GAUCHE SE MESURE SUR LES DONNÉES, PAS SUR LES OBJECTIFS :
 * tirer l'axe jusqu'à 20 (l'objectif de demandes) sur une année qui plafonne à
 * 11 écraserait les trois courbes dans le quart bas du cadre. Les objectifs
 * sont dans les tuiles, où ils se lisent en chiffres.
 *
 * ⚠ ET LE VOCABULAIRE RESTE CELUI DE L'ÉCRAN : `rgd-courbe`, `rgd-grille`,
 * `rgd-axe`, `rgd-trait`, `rgd-mois`, `rgd-zone`, `rgd-info`, `rgd-bulle` sont
 * ceux du graphique du chiffre d'affaires, vingt lignes plus bas.
 */
function grapheObjectifs(mois, formats, marques) {
  const L = 940, H = 206, gauche = 44, droite = 74, cime = 16, bas = H - 30;
  const pas = (L - gauche - droite) / (mois.length - 1);
  const x = (i) => gauche + pas * i;
  const y = (f) => bas - f * (bas - cime);
  const connu = (v) => v !== null && v !== undefined;

  // Une graduation ronde au-dessus du maximum. Les paliers courts d'abord :
  // sans eux une année à 11 demandes serait tracée sur un axe gradué à 20.
  const rond = (v) => {
    const p = [5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100].find(k => v <= k);
    if (p) return p;
    const e = Math.pow(10, String(Math.round(v)).length - 1);
    return Math.ceil(v / e) * e;
  };
  const valeurs = (champ) => mois.map(m => m[champ]).filter(connu);
  const comptes = SERIES.filter(s => s.champ !== 'ca');
  const hautN = rond(Math.max(1, ...comptes.flatMap(s => valeurs(s.champ))));
  const hautCa = rond(Math.max(1, ...valeurs('ca')));
  const fraction = (se, v) => (se.champ === 'ca' ? v / hautCa : v / hautN);
  // Sous dix mille euros, « 0 k€ » sur les trois graduations ne dirait rien.
  const etiqCa = (v) => (hautCa >= 10000 ? Math.round(v / 1000) + ' k€' : formats.ca(v));

  const crans = [0, 0.5, 1];
  const grille = crans.map(f => `<line class="rgd-grille" x1="${gauche}" x2="${L - droite}"
    y1="${y(f).toFixed(1)}" y2="${y(f).toFixed(1)}"></line>`).join('');
  const axeG = crans.map(f => `<text class="rgd-axe" x="${gauche - 9}" y="${(y(f) + 4).toFixed(1)}"
    text-anchor="end">${Math.round(f * hautN)}</text>`).join('');
  const axeD = crans.map(f => `<text class="rgd-axe" style="fill:var(--green)" x="${L - droite + 9}"
    y="${(y(f) + 4).toFixed(1)}">${esc(etiqCa(f * hautCa))}</text>`).join('');

  // ⚠ LE MOIS SANS SON ANNÉE : à douze colonnes, « déc. 25 » et « janv. 26 »
  // se marchaient dessus. La fenêtre glisse sur douze mois, l'année n'y lève
  // aucune ambiguïté et l'en-tête de la carte la porte déjà.
  const court = (m) => String(m.label).replace(/\s*\d{2}$/, '');
  const legendes = mois.map((m, i) => `<text class="rgd-axe" x="${x(i).toFixed(1)}" y="${H - 8}"
    text-anchor="middle">${esc(court(m))}</text>`).join('');

  // La période montrée par les tuiles, marquée sur le graphique : sans cela
  // les tuiles parlent d'un mois — ou d'un exercice — que rien ne désigne
  // parmi les douze. Un seul mois en vue « Mois », toute la tranche de
  // l'exercice en vue « Exercice ».
  // ⚠ LA BANDE SE RABOTE AUX BORDS DU CADRE : centrée sur le premier ou le
  // dernier mois, la moitié débordait dans la marge et venait se poser sur les
  // graduations en euros — vu à l'écran, le mois en cours étant le dernier.
  const dedans = mois.map(m => marques.includes(m.cle));
  const iDeb = dedans.indexOf(true), iFin = dedans.lastIndexOf(true);
  const bx0 = Math.max(gauche - 6, x(iDeb) - pas / 2);
  const bx1 = Math.min(L - droite + 6, x(iFin) + pas / 2);
  const bande = iDeb >= 0 ? `<rect class="rgd-ob-choisi" x="${bx0.toFixed(1)}"
    y="${cime - 6}" width="${(bx1 - bx0).toFixed(1)}" height="${(bas - cime + 6).toFixed(1)}" rx="5"></rect>` : '';

  // ⚠ UNE COURBE SE COUPE SUR LES MOIS INCONNUS, elle ne les enjambe pas :
  // relier mars à décembre en ligne droite ferait croire à trois mois suivis
  // alors que le CRM ne les connaît pas (les demandes ne sont suivies que
  // depuis mars 2026, les visites techniques depuis août).
  //
  // ⚠ LE DERNIER MOIS EST EN COURS, DONC INCOMPLET : son segment est en
  // pointillé et son point reste creux. Sans cela, chaque début de mois
  // dessine quatre effondrements.
  const courbes = SERIES.map(se => {
    const groupes = [];
    mois.forEach((m, i) => {
      const v = m[se.champ];
      if (!connu(v)) { groupes.push(null); return; }
      const pt = [x(i), y(fraction(se, v)), i];
      const dernier = groupes[groupes.length - 1];
      if (Array.isArray(dernier)) dernier.push(pt); else groupes.push([pt]);
    });
    const suites = groupes.filter(Array.isArray);
    if (!suites.length) return '';
    const vers = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const traits = suites.map(pts => {
      const finEnCours = pts[pts.length - 1][2] === mois.length - 1 && pts.length > 1;
      const plein = finEnCours ? pts.slice(0, -1) : pts;
      const bout = finEnCours ? pts.slice(-2) : null;
      return (plein.length > 1 ? `<path class="rgd-trait" style="stroke:${se.couleur}" fill="none" d="${vers(plein)}"></path>` : '')
        + (bout ? `<path class="rgd-trait" style="stroke:${se.couleur}" fill="none"
             stroke-dasharray="4 4" d="${vers(bout)}"></path>` : '');
    }).join('');
    const ronds = suites.flat().map(p => {
      const enCours = p[2] === mois.length - 1;
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${enCours ? 4.2 : 3}"
        style="fill:${enCours ? 'var(--card)' : se.couleur};stroke:${se.couleur}"
        stroke-width="${enCours ? 2.2 : 0}"></circle>`;
    }).join('');
    return `<g>${traits}${ronds}</g>`;
  }).join('');

  // ⚠ UNE SEULE BULLE POUR LES QUATRE, et c'est elle qui répond à
  // l'enchevêtrement : au lieu de suivre une courbe de l'œil jusqu'à son mois,
  // on pointe le mois et on lit les quatre lignes. Elle se pose du côté OPPOSÉ
  // au curseur, sans quoi elle cacherait justement ce qu'on désigne.
  //
  // ⚠ LE `<title>` RESTE SOUS LA BULLE : la bulle naît du survol, que le
  // doigt n'a pas. Sur téléphone, l'appui long reste le seul moyen de lire.
  const LB = 182, HB = 24 + SERIES.length * 16;
  const survols = mois.map((m, i) => {
    const cx = x(i);
    const bx = cx < L / 2 ? Math.min(cx + 14, L - LB - 2) : Math.max(cx - LB - 14, 2);
    const lignes = SERIES.map((se, k) => {
      const v = m[se.champ];
      return `<text class="rgd-bulle-mois" style="font-size:11.5px;opacity:.72" x="11" y="${36 + k * 16}">${esc(se.label)}</text>
        <text class="rgd-bulle-ca" style="font-size:12px" x="${LB - 11}" y="${36 + k * 16}"
          text-anchor="end">${connu(v) ? esc(formats[se.champ](v)) : '—'}</text>`;
    }).join('');
    const dit = SERIES.map(se => `${se.court} ${connu(m[se.champ]) ? formats[se.champ](m[se.champ]) : '—'}`).join(' · ');
    return `<g class="rgd-mois">
      <rect class="rgd-zone" x="${(cx - pas / 2).toFixed(1)}" y="0" width="${pas.toFixed(1)}" height="${bas}"></rect>
      <g class="rgd-info">
        <line class="rgd-ob-guide" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${cime - 6}" y2="${bas}"></line>
        <g transform="translate(${bx.toFixed(1)},6)">
          <rect width="${LB}" height="${HB}" rx="9" class="rgd-bulle"></rect>
          <text class="rgd-bulle-mois" x="11" y="18">${esc(m.label)}</text>
          ${lignes}
        </g>
      </g>
      <title>${esc(m.label)} · ${esc(dit)}</title>
    </g>`;
  }).join('');

  return `<div class="rgd-ob-graphe"><svg class="rgd-courbe" viewBox="0 0 ${L} ${H}" role="img"
    aria-label="Les quatre indicateurs mois par mois, sur les douze derniers mois">
    ${grille}${bande}${axeG}${axeD}${legendes}${courbes}${survols}
  </svg></div>`;
}

/**
 * La carte entière, dans la langue de l'écran.
 *
 * ⚠ LES QUATRE TUILES ONT LEURS PROPRES CLASSES, ET C'EST UN CHOIX, PAS UN
 * OUBLI. Elles ont d'abord emprunté `rgd-bil-tuile` au Bilan commercial — la
 * carte juste en dessous — pour ne pas inventer une forme de plus. Le rendu a
 * montré quatre tuiles à moitié invisibles : une autre session était en train
 * de redessiner cette carte-là (dégradés, texte blanc, anneaux) et mes tuiles
 * en héritaient. Emprunter n'est bon que si l'on emprunte à quelque chose de
 * stable ; ici le voisin bougeait sous nos pieds.
 *
 * ⚠ ELLES NE REPRENNENT PAS NON PLUS `rgd-et` DU PIPELINE, et c'est la
 * correction du 05/11 qu'il ne faut pas défaire : avec les cartes du pipeline,
 * les deux blocs devenaient indiscernables l'un de l'autre à trente
 * centimètres (« c'est la même présentation qu'en haut »).
 *
 * ⚠ CHAQUE TUILE PORTE LA COULEUR DE SA COURBE : c'est ce qui lui permet de
 * tenir lieu de légende au graphique, et pourquoi il n'y en a pas d'autre.
 *
 * ⚠ LE MOIS EN COURS EST INCOMPLET PAR CONSTRUCTION : le 5 novembre, « 5 % »
 * n'est pas un échec, c'est le cinquième jour. L'en-tête le dit, parce que sans
 * cela la carte annonce une catastrophe tous les débuts de mois.
 */
// ⚠ LE MOIS AFFICHÉ SE CHOISIT (05/11/2026, Élodie : « pour la section
// objectifs du mois je voudrais pouvoir sélectionner les mois précédents »).
// Le choix vit ici, hors de `draw`, pour survivre aux rafraîchissements de
// l'écran ; `null` = le mois en cours. Il ne porte que sur les quatre rangées
// du haut : les vignettes montrent déjà les douze mois, et les taux se lisent
// sur douze mois quel que soit le mois choisi.
let moisObjectifChoisi = null;
// ⚠ MOIS OU EXERCICE (10/11/2026, Élodie : « je voudrais avoir une option dans
// la section des objectifs du mois pour avoir le cumul de chiffre d'affaires de
// l'année comptable »). La carte « Chiffre d'affaires » qui vivait en dessous a
// été retirée dans le même mouvement : son exercice se lit ici, et le détail
// par exercice dans « Bilan commercial ». Le choix vit hors de `draw`, comme le
// mois, pour survivre aux rafraîchissements.
let vueObjectif = 'mois';

function carteObjectifs(mois, obj) {
  if (!mois.length) return '';
  const dernier = mois[mois.length - 1];
  const courant = mois.find(m => m.cle === moisObjectifChoisi) || dernier;
  const enCours = courant === dernier;
  const t = tauxPeriode(mois);
  const maintenant = new Date();
  const jour = maintenant.getDate();
  const joursDuMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0).getDate();

  const euros = (v) => eur(Math.round(v));
  const nombre = (v) => String(v);
  const formats = { demandes: nombre, rdv: nombre, devisSignes: nombre, ca: euros };

  // ⚠ L'EXERCICE COMPTABLE, PAS L'ANNÉE CIVILE : 1er octobre → 30 septembre.
  // Les douze mois glissants couvrent toujours l'exercice en cours, qui en
  // compte douze au plus — il n'y a donc rien d'autre à relever en base.
  const ex = exercice();
  const dansEx = mois.filter(m => m.cle >= ex.du.slice(0, 7) && m.cle <= ex.au.slice(0, 7));
  const vue = dansEx.length ? vueObjectif : 'mois';

  // ⚠ LE CUMUL D'UN EXERCICE N'EST PAS UNE SOMME POUR LES DEVIS SIGNÉS : un
  // client qui signe en octobre puis en novembre est UN client sur l'exercice.
  // C'est déjà la règle de `tauxPeriode`, et additionner les mois gonflerait
  // le cumul — on fait donc l'union des clés, comme là-bas.
  //
  // ⚠ ET UN MOIS INCONNU N'EST PAS UN ZÉRO : si aucun mois de l'exercice ne
  // porte la donnée, le cumul vaut `null` et la tuile affiche « — ». Les
  // demandes ne sont suivies que depuis mars 2026, les visites depuis août.
  const cumul = (se) => {
    if (se.champ === 'devisSignes') return new Set(dansEx.flatMap(m => m.clientsSignes || [])).size;
    const connus = dansEx.map(m => m[se.champ]).filter(v => v !== null && v !== undefined);
    return connus.length ? connus.reduce((a, b) => a + b, 0) : null;
  };

  // ⚠ L'OBJECTIF D'UN EXERCICE EST CELUI DE L'ANNÉE ENTIÈRE, pas au prorata
  // des mois écoulés : c'est ce que dit déjà la carte « Bilan commercial » en
  // dessous (« 1 sur 120 cette année »), et deux cartes du même écran qui
  // divisent le même objectif autrement ne se réconcilient jamais à l'œil.
  // Le « mois N sur 12 » de l'en-tête dit où l'on en est dans l'année.
  const periode = vue === 'exercice'
    ? { valeur: cumul, cible: (se) => obj[se.cible] * 12, cles: dansEx.map(m => m.cle),
        titre: 'Objectifs de l’exercice', note: `mois ${dansEx.length} sur 12`,
        quand: `Exercice ${ex.label}` }
    : { valeur: (se) => courant[se.champ], cible: (se) => obj[se.cible], cles: [courant.cle],
        titre: 'Objectifs du mois',
        note: enCours ? `jour ${jour} sur ${joursDuMois}` : 'mois terminé',
        quand: courant.label };
  // ⚠ DES TUILES, PAS DES RANGÉES (10/11/2026, Élodie : « je voudrais qu'on
  // revoie le visuel de la section »). Chacune porte la couleur de sa courbe :
  // la tuile est la légende du graphique, ce qui évite d'en poser une séparée.
  //
  // ⚠ LE CLIC NE CHANGE PAS DE PORTE : `data-ob-detail` et `data-ob-cle` sont
  // lus par le gestionnaire posé sur `root`, qui ne regarde ni la balise ni la
  // classe. Déplacer l'attribut d'un `<tr>` vers un `<article>` suffit, et la
  // liste du mois s'ouvre comme avant.
  const tuile = (se) => {
    const v = periode.valeur(se);
    const cible = periode.cible(se);
    const connu = v !== null && v !== undefined;
    const part = connu && cible > 0 ? Math.round((v / cible) * 100) : null;
    const formate = formats[se.champ];
    // Au survol, les premiers noms ; au clic, la liste complète. Sur un
    // exercice, les listes de ses mois mises bout à bout.
    const lignes = periode.cles.flatMap(c => detailMoisObjectif(c, se.champ).lignes);
    const noms = [...new Set(lignes.map(l => l.client))];
    const bulle = lignes.length
      ? `${noms.slice(0, 6).join(', ')}${noms.length > 6 ? ` et ${noms.length - 6} autre${noms.length > 7 ? 's' : ''}` : ''} — cliquer pour le détail`
      : (vue === 'exercice' ? 'Rien sur cet exercice' : 'Rien ce mois-ci');
    return `<article class="rgd-ob-tuile" style="--c:${se.couleur}"
      data-ob-detail="${se.champ}" data-ob-cles="${esc(periode.cles.join(','))}"
      data-ob-quand="${esc(periode.quand)}"
      role="button" tabindex="0" title="${esc(bulle)}">
      <div class="rgd-ob-lib">${esc(se.label)}</div>
      <div class="rgd-ob-gros">${connu ? esc(formate(v)) : '—'}<i>sur ${esc(formate(cible))}</i></div>
      <span class="rgd-ob-piste"><i style="width:${Math.min(100, part || 0)}%"></i></span>
      <div class="rgd-ob-part${part !== null && part >= 100 ? ' atteint' : ''}">${
        part === null ? '—' : part + ' % de l’objectif'}</div>
    </article>`;
  };
  const pc = (v) => (v === null ? '—' : v + ' %');

  return `
        <section class="card rgd-ob">
          ${/* ⚠ LE TITRE SUIT LA PÉRIODE : « Objectifs du mois » au-dessus d'un
                cumul d'exercice serait un contresens, et c'est le genre de
                détail qu'on ne voit plus après l'avoir lu dix fois. */ ''}
          <div class="card-head"><h2>${esc(periode.titre)}</h2>
            <span class="grow"></span>
            ${/* ⚠ MOIS OU EXERCICE, en segment : les deux choix se VOIENT, là où
                  une liste déroulante les cache. C'est `mf-seg`, le segment des
                  formulaires du CRM — aucune forme neuve. */ ''}
            <div class="mf-seg rgd-ob-vue">
              <button type="button" data-ob-vue="mois" class="${vue === 'mois' ? 'on' : ''}"
                aria-pressed="${vue === 'mois'}">Mois</button>
              <button type="button" data-ob-vue="exercice" class="${vue === 'exercice' ? 'on' : ''}"
                aria-pressed="${vue === 'exercice'}"${dansEx.length ? '' : ' disabled'}>Exercice</button>
            </div>
            ${/* ⚠ DES FLÈCHES, PAS UNE LISTE (05/11/2026, Élodie : « je voyais
                  plutôt une flèche pour passer d'un mois à un autre plutôt
                  qu'une liste déroulante »). ‹ recule d'un mois, › avance ;
                  chacune se grise au bout de la fenêtre de douze mois.
                  Sur l'exercice il n'y a rien à parcourir : l'année comptable
                  en cours est la seule que ces douze mois peuvent porter. */ ''}
            ${vue === 'mois' ? `<span class="rgd-ob-nav">
              <button type="button" class="rgd-ob-fleche" data-ob-pas="-1" aria-label="Mois précédent"
                ${mois.indexOf(courant) === 0 ? 'disabled' : ''}>‹</button>
              <b class="rgd-ob-mois">${esc(courant.label)}</b>
              <button type="button" class="rgd-ob-fleche" data-ob-pas="1" aria-label="Mois suivant"
                ${enCours ? 'disabled' : ''}>›</button>
            </span>` : `<b class="rgd-ob-mois rgd-ob-ex">${esc(ex.label)}</b>`}
            <span class="muted small">${esc(periode.note)}</span></div>

          <div class="rgd-ob-tuiles">${SERIES.map(tuile).join('')}</div>

          ${/* ⚠ LES TAUX SE LISENT SUR DOUZE MOIS, PAS SUR LE MOIS EN COURS, et
                c'est ce que les vrais chiffres ont imposé : au 5 novembre, une
                demande et un rendez-vous donnaient « 600 % des demandes ont
                donné un rendez-vous ». À ces volumes — une poignée de dossiers
                par mois — un taux mensuel est du bruit, pas une mesure. Sur
                douze mois il redevient lisible, et c'est la même base pour les
                trois, au lieu d'en mélanger deux dans une phrase. */ ''}
          <p class="small muted rgd-ob-taux">Sur douze mois :
            <b>${pc(t.demandesVersRdv)}</b> des demandes ont donné un rendez-vous,
            <b>${pc(t.rdvVersSignes)}</b> des rendez-vous un devis signé,
            <b>${pc(t.envoyesVersSignes)}</b> des devis envoyés sont signés
            (${t.envoyes} envoyés, ${t.signes} signés)${t.panier === null ? ''
              : `. Un devis signé rapporte <b>${esc(eur(t.panier))}</b> en moyenne`}.</p>

          ${/* ⚠ PAS DE LÉGENDE SOUS LE GRAPHIQUE : les quatre tuiles au-dessus
                en tiennent lieu, chacune à la couleur de sa courbe. Une
                légende de plus répéterait quatre noms déjà écrits. */ ''}
          ${grapheObjectifs(mois, formats, periode.cles)}

          ${/* ⚠ LE PIED SUIT LE DESSIN : il parlait de colonnes, de ligne
                pointillée d'objectif et de vignettes qui gardent leur unité —
                il n'y en a plus. Ce qu'il doit dire maintenant, c'est QUEL AXE
                lit quelle courbe, parce que c'est la seule chose que le
                graphique ne peut pas dire tout seul. */ ''}
          <p class="small muted rgd-ob-pied">Chaque mois compte ce qui s’y est <b>passé</b> :
          demandes reçues, rendez-vous tenus, devis signés, factures émises. Un <b>rendez-vous</b> est
          une visite technique, la même que la colonne « RDV » du pipeline.
          <b>Deux devis pour un même client comptent pour un.</b>
          Sur le graphique, les <b>comptages se lisent à gauche</b> et le <b>chiffre d’affaires à droite</b>,
          en euros — l’axe est écrit dans sa couleur. Survolez un mois pour avoir les quatre chiffres.
          Un mois sans point veut dire que le CRM n’a pas la donnée, pas qu’elle vaut zéro ; le dernier
          mois est en cours, d’où son pointillé.
          Objectifs modifiables dans les <a href="#/rgd/reglages">réglages</a>.</p>
        </section>
`;
}


// LA VUE D'ENSEMBLE DE L'OUVRIER (28/10/2026, Élodie : « pour la pipeline de
// la vue d'ensemble de Franck, je voudrais l'alléger. Il ne va faire que du
// dépannage, des petites interventions et des remises en état de
// l'installation complète »). Proposition retenue :
// - sa journée EN PREMIER : pour un technicien, c'est ce qu'on ouvre ;
// - CINQ étapes au lieu de dix (voir `GROUPES_OUVRIER`) ;
// - ni barres, ni pourcentages, ni paragraphe d'explication, ni chiffre
//   d'affaires de l'entreprise.
//
// ⚠ CE SONT DES REGROUPEMENTS D'AFFICHAGE, PAS DE NOUVELLES ÉTAPES. Les
// nombres viennent de `etapesRgd()`, comme pour tout le monde : quand Franck
// fait avancer un dossier, la direction le voit au bon endroit dans SA frise.
// Inventer ici des étapes propres à l'ouvrier aurait fait deux vocabulaires
// pour les mêmes personnes — exactement le défaut que `etapesRgd` a supprimé.
// ⚠ SAV, Archivés et Indésirables ne sont pas montrés : ce ne sont pas des
// étapes de son travail. Ils restent dans Clients & prospects.
// ⚠ LES CINQ ÉTAPES ET LEURS NOMS SONT CEUX D'ÉLODIE (28/10/2026, après une
// première version à quatre « mots de terrain » — « À planifier »,
// « Intervention prévue » — et « Terminé » relégué sous les tuiles) : « mets
// ces 5 étapes dans la pipeline : Nouvelle demande, RDV, Devis en cours /
// envoyé, En cours, Terminé ». Les noms restent ceux de Clients & prospects.
const GROUPES_OUVRIER = [
  { label: 'Nouvelle demande', cles: ['demande'], couleur: '#9CA3AF' },
  { label: 'RDV', cles: ['rdv'], couleur: '#2A6FBF' },
  { label: 'Devis en cours / envoyé', cles: ['devis_encours', 'devis_envoye'], couleur: '#B45C00' },
  { label: 'En cours', cles: ['devis_accepte', 'chantier_encours'], couleur: '#22C55E' },
  { label: 'Terminé', cles: ['chantier_termine'], couleur: '#059669' },
];

// ⚠ `vide` EST PASSÉ, PAS ÉCRIT ICI (28/10/2026). Depuis que la journée est
// filtrée par calendrier, une liste vide peut vouloir dire deux choses — rien
// de prévu, ou pas d'agenda connecté —, et l'ouvrier est celui qui a le plus de
// chances d'être dans le second cas : son compte vient d'être créé. Les deux
// écrans disent donc la même phrase, décidée au même endroit.
function vueOuvrier({ etapes, rdv, aujourdhui, vide }) {
  const n = (cles) => etapes.filter(e => cles.includes(e.key)).reduce((t, e) => t + e.n, 0);
  const tuiles = GROUPES_OUVRIER.map(g => `<a class="rgd-et" href="#/rgd/clients?vue=${esc(g.cles[0])}"
      style="--c:${esc(g.couleur)}" title="Ouvrir dans Clients &amp; prospects">
    <span class="rgd-et-n">${n(g.cles)}</span>
    <span class="rgd-et-label">${esc(g.label)}</span></a>`).join('');
  return `
    <section class="card rgd-jour">
      <div class="card-head"><h2>Aujourd’hui</h2>
        <span class="grow"></span>
        <span class="muted small">${fmtDate(aujourdhui)}</span></div>
      ${rdv.length ? `<ul class="pil-liste">${rdv
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
        .map(e => `<li>
          <b>${e.all_day ? 'journée' : esc(new Date(e.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</b>
          <span>${esc(e.title || '(sans titre)')}</span>
          ${e.location ? `<span class="muted small">${esc(e.location)}</span>` : ''}
        </li>`).join('')}</ul>`
        : `<div class="empty">${esc(vide || 'Aucune intervention prévue aujourd’hui.')}</div>`}
    </section>

    <section class="card rgd-pipe">
      <div class="card-head"><h2>Mes dossiers</h2>
        <span class="grow"></span>
        <a class="btn ghost sm" href="#/rgd/clients">Voir la liste →</a></div>
      <div class="rgd-frise rgd-frise-ouvrier">${tuiles}</div>
    </section>

    ${'' /* Son chiffre d'affaires du mois, en attente de la facturation : `null`
         = la facturation n'existe pas encore (voir rgd-ca-ouvrier.js). */}
    ${encadreCaOuvrier(null)}`;
}

export const rgdPilotagePage = {
  title: () => 'RGD Renova — Vue d’ensemble',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);

    const draw = () => {
      const aujourdhui = isoDay();

      const chantiers = scope.rgd('rgd_chantiers');
      const devis = scope.rgd('rgd_devis');
      const paiements = scope.rgd('rgd_paiements');
      const sousTraitants = scope.rgd('rgd_sous_traitants');
      const demandes = scope.rgd('rgd_demandes');
      // ⚠ SA JOURNÉE À LUI, PAS CELLE DE L'ÉQUIPE (28/10/2026, Élodie : « je
      // voudrais que ce soit les rendez-vous de la personne concernée et pas
      // ceux de mickael pour tout le monde »). `scope.rgd` ne filtre PAS
      // `agenda_events` — la table n'est pas dans `RGD_PORTEFEUILLE`, elle ne
      // porte aucun propriétaire, seulement un `calendar_id` —, donc cet écran
      // montrait à chacun la journée entière de RGD. `estMonRdv` tranche par le
      // calendrier ; ce n'est pas `voitAgenda`, qui répond « oui » à tout pour
      // la direction parce que l'écran Agenda, lui, doit la laisser REGARDER
      // chez les autres.
      const rdv = scope.rgd('agenda_events')
        .filter(e => e.activity === KEY && e.day === aujourdhui && scope.estMonRdv(e));

      // ⚠ UNE JOURNÉE VIDE DOIT DIRE POURQUOI. Depuis que la liste est filtrée
      // par calendrier, quelqu'un sans agenda à lui n'y verra JAMAIS rien — et
      // sans cette phrase il chercherait un défaut là où il n'y a qu'un agenda
      // à connecter. C'est la règle du 06/10 : un écran vide avec sa raison
      // vaut mieux qu'un écran plein de ce qui ne vous regarde pas.
      const journeeVide = (mot = 'rendez-vous') => scope.aUnAgendaAVoir(KEY)
        ? (mot === 'intervention'
          ? 'Aucune intervention prévue aujourd’hui.'
          : 'Aucun rendez-vous relevé aujourd’hui.')
        : 'Aucun agenda n’est encore connecté à votre compte : la direction peut vous en créer un depuis les réglages.';
      // L'ouvrier a sa propre vue, plus courte (voir `vueOuvrier`) : on s'arrête
      // avant de calculer un chiffre d'affaires qu'il ne verra pas.
      if (scope.isOuvrier) {
        root.innerHTML = cadre('#/rgd', 'Vue d’ensemble',
          vueOuvrier({ etapes: etapesRgd(), rdv, aujourdhui, vide: journeeVide('intervention') }));
        return;
      }
      const reglage =(cle) => scope.rgd('rgd_reglages').find(r => r.cle === cle)?.valeur ?? null;

      // ⚠ LE CALCUL DU CA D'EXERCICE A QUITTÉ CET ÉCRAN LE 10/11/2026, avec la
      // carte qui le portait. Ce qu'il faut savoir si on le ramène un jour :
      //   • les AVOIRS NE SE DÉDUISENT PAS — c'est ce qui réconcilie l'écran
      //     avec le bilan comptable d'Élodie ; les déduire retirait 144 653 €
      //     de 2024/2025 et faisait croire à une reprise Costructor incomplète.
      //     La règle vit désormais dans `data/rgd-objectifs.js` et
      //     `data/rgd-bilan.js`, qui calculent tous deux le CA.
      //   • la correction manuelle `manual_ca_ht_exercice` NE PORTAIT AUCUNE
      //     ANNÉE : une valeur saisie pour un exercice s'affichait telle quelle
      //     pour le suivant dès le 1er octobre.
      // ⚠ ET DEUX RÉGLAGES DEVIENNENT INERTES : `manual_ca_ht_exercice` et
      // `manual_clients_actifs` se saisissent toujours dans les réglages, mais
      // plus aucun écran ne les lit. Les deux étaient les SEULS affichages de
      // cette carte ; Élodie a choisi de ne garder que l'alerte Costructor.

      // DE QUAND DATE CE CA. Le CA calculé ne vaut que ce que vaut le dernier
      // relevé des encaissements Costructor, et ça, l'écran ne le disait pas :
      // la synchronisation des paiements s'est arrêtée le 24/07/2026 sans que
      // rien ne le signale, et deux mois plus tard le chiffre affiché était
      // toujours celui de juillet — avec l'air d'être à jour. Une donnée vieille
      // est plus dangereuse qu'une donnée absente, parce qu'elle se lit comme
      // fraîche : c'est la seule raison d'être de ce bloc.
      //
      // ⚠ LA RESSOURCE S'APPELLE `invoices`, PAS `payments` — défaut trouvé le
      // 02/10/2026 et introduit le 28/09, quand la ligne d'état `payments` a
      // été SUPPRIMÉE (le sujet des encaissements est clos : l'API ne relie pas
      // un encaissement à sa facture). Cet écran la cherchait toujours, ne la
      // trouvait plus, et affichait donc depuis quatre jours une pastille
      // ROUGE permanente — « Aucun relevé des paiements n'est enregistré » —
      // alors que les factures sont relevées toutes les heures et l'ont encore
      // été ce matin. Une alarme qui ne s'éteint jamais cesse d'être lue, et
      // celle-ci se serait tue le jour où elle aurait eu quelque chose à dire.
      const syncFactures = scope.rgd('rgd_costructor_etat').find(e => e.ressource === 'invoices');
      const ageSync = syncFactures?.dernier_succes ? daysSince(syncFactures.dernier_succes) : null;
      const syncKo = ageSync === null || ageSync > 2;
      const dernierEncaissement = paiements
        .map(p => p.date_facturation).filter(Boolean).sort().at(-1) || null;

      // Pièces de sous-traitants qui expirent sous 30 jours ou sont déjà passées.
      const docsSt = sousTraitants.filter(st => st.actif !== false
        && ['attestation_urssaf_expire', 'attestation_vigilance_expire', 'assurance_decennale_expire']
          .some(k => st[k] && daysSince(st[k]) > -30));

      const leads = demandes.filter(d => !d.statut || d.statut === 'nouvelle' || d.statut === 'en_attente');

      const clients = scope.rgd('rgd_clients');
      // ⚠ LE GRAPHIQUE SE LIT SUR DOUZE MOIS GLISSANTS, PAS SUR L'EXERCICE,
      // même quand les tuiles montrent le cumul de l'exercice — voir l'en-tête
      // de `data/rgd-objectifs.js`. Mesuré le 04/11/2026 : calé sur l'exercice
      // il n'aurait eu que deux points, et un seul chaque 1er octobre.
      const objectifs = objectifsMensuels();
      const moisObj = moisObjectifs();

      // ⚠ L'ALERTE DE SYNCHRONISATION SURVIT À LA CARTE QUI LA PORTAIT
      // (10/11/2026) : la carte « Chiffre d'affaires » a été retirée de cet
      // écran — son exercice se lit dans « Objectifs », vue Exercice, et le
      // détail par exercice dans « Bilan commercial ». Élodie a choisi de
      // garder CELLE-CI et de jeter le reste (moyenne mensuelle, clients
      // actifs déclarés, avertissement de correction manuelle).
      //
      // ⚠ ET IL FALLAIT LA GARDER : c'est le seul endroit de l'écran qui dise
      // DE QUAND date le chiffre. La synchronisation s'est arrêtée le
      // 24/07/2026 sans que rien ne le signale, et deux mois plus tard le CA
      // affiché était toujours celui de juillet, avec l'air d'être à jour. Une
      // donnée vieille est plus dangereuse qu'une donnée absente.
      const alerteSync = `<p class="rgd-ca-frais small ${syncKo ? 'ko' : 'ok'}">
        <span class="chip ${syncKo ? 'red' : 'green'}">${syncKo ? 'Factures en retard' : 'Factures à jour'}</span>
        <span class="grow">${syncFactures?.dernier_succes
          ? `Dernier relevé Costructor des factures ${esc(fmtDate(syncFactures.dernier_succes))}${ageSync > 2
            ? `, il y a ${ageSync} jours : <b>le CA calculé est celui de cette date</b>, pas celui d’aujourd’hui.` : '.'}`
          : 'Aucun relevé Costructor des factures n’est enregistré : rien ne dit de quand date ce CA.'}
        ${dernierEncaissement ? ` Dernière facture connue : ${esc(fmtDate(dernierEncaissement))}.` : ''}</span>
        <a href="#/rgd/costructor">Voir la synchronisation</a>
      </p>`;
      // Les sept étapes viennent du module commun : le pipeline et la liste
      // comptent forcément les mêmes personnes, y compris les gardes.
      // L'HISTORIQUE DU BILAN, pour la carte « Chantier terminé ».
      // ⚠ SANS ARGUMENT : `aujourdhui` est une CHAÎNE sur cet écran (`isoDay()`),
      // et `bilanCommercial(chaîne)` fait tomber l'écran entier avec
      // « d.getFullYear is not a function ». Et la fonction peut rendre `null`
      // quand aucune trace commerciale n'existe.
      const histo = bilanCommercial()?.total || {};

      // ⚠ « CHANTIER TERMINÉ » NE COMPTE PLUS CE QUE LE CRM SAIT, MAIS CE QUE LE
      // BILAN DÉCLARE (10/11/2026, Élodie : « le nombre de chantiers terminés et le
      // montant de ces chantiers terminés ne collent pas avec la réalité […] mets
      // les chiffres directement dans la pipeline »). Le CRM n'a que 43 des 69
      // devis signés de l'historique et aucune facture avant le 05/11/2024 : sa
      // carte annonçait 25 chantiers et 510 912 € quand le bilan en porte 47 et
      // 1 255 109 €.
      //
      // ⚠ TROIS CONSÉQUENCES ANNONCÉES À ÉLODIE ET ACCEPTÉES PAR ELLE, à ne pas
      // « corriger » sans la consulter :
      //   1. Ce sont les chantiers SIGNÉS, celui en cours compris — la carte
      //      « Chantier en cours » le compte donc une seconde fois.
      //   2. La carte compte des CHANTIERS, les autres comptent des PERSONNES.
      //   3. Le clic mène à la liste des dossiers que le CRM connaît, pas à 47
      //      lignes. C'est la limite de la donnée, pas un défaut d'écran.
      //
      // ⚠ L'ÉCRAN « Clients & prospects » N'EST PAS TOUCHÉ : la substitution est
      // ici, pas dans `etapesRgd()` (js/data/rgd-etapes.js), que les deux écrans
      // partagent. La déplacer là-bas ferait mentir la liste elle-même.
      const etapes = etapesRgd().map(e => ({
        ...e, cle: e.key, couleur: COULEURS[e.key] || 'var(--accent)',
        hors: ETAPES_HORS_CYCLE.includes(e.key),
        ...(e.key === 'chantier_termine' && histo.chantiers
          ? { n: histo.chantiers, horsEchelle: true,
              ...(histo.montantSigne != null
                ? { montant: histo.montantSigne, chiffres: histo.chantiers } : {}) }
          : {}),
      }));
      // ⚠ `horsEchelle` EXCLU : « 12 affaires suivies » compte des personnes du
      // jour, et y ajouter 47 chantiers d'historique n'aurait aucun sens.
      const totalEtapes = etapes.filter(e => !e.hors && !e.horsEchelle)
        .reduce((t, e) => t + e.n, 0);

      // L'ORDRE DE LA PAGE, REVU PAR MICKAEL LE 25/09/2026 : le pipeline
      // d'abord, puis le chiffre d'affaires et la journée côte à côte, les
      // alertes en bas.
      //
      // Il remplace l'ordre du 21/09 — chiffre d'affaires, quatre chiffres
      // clés, pipeline. Ce que le changement dit : on n'ouvre pas cet écran
      // le matin pour lire un montant, mais pour voir où en sont les affaires.
      // Le CA de l'exercice ne bouge pas d'un jour à l'autre ; le pipeline, si.
      //
      // ⚠ LES QUATRE CHIFFRES CLÉS SONT RETIRÉS, comme sur Clients, Partenaires,
      // Sous-traitants, Réalisations et Chantiers avant eux — c'est la cinquième
      // fois que la demande revient, et toujours pour la même raison : une
      // rangée de grandes cartes repousse sous la ligne de flottaison ce qu'on
      // est venu voir. Ne pas les remettre.
      //
      // ⚠ CE QUI EST PARTI AVEC EUX, ET C'EST VOULU : une cinquantaine de lignes
      // de calcul que plus rien ne lisait — rentabilité moyenne, chantiers en
      // cours au sens strict du tableau de bord, devis en attente, paiements en
      // retard — plus les lectures de `rgd_missions` et `rgd_fournitures` qui
      // n'alimentaient qu'eux. Les garder « au cas où » aurait refait ici le
      // défaut que le tableau de bord d'origine traîne dans `overview.js` :
      // cinq cents lignes mortes et quatre appels d'API que personne ne lit.
      // Elles restent dans l'historique Git, qui est fait pour ça.
      const corps = `

        <section class="card rgd-pipe">
          <div class="card-head"><h2>Pipeline</h2>
            <span class="grow"></span>
            <a class="btn ghost sm" href="#/rgd/clients">Ouvrir la base →</a></div>
          ${frisePipeline(etapes)}
          <p class="small muted rgd-pipe-pied">${totalEtapes
            ? `${totalEtapes} affaire${totalEtapes > 1 ? 's' : ''} suivie${totalEtapes > 1 ? 's' : ''}, toutes étapes confondues.`
            : 'Aucune affaire à suivre pour le moment.'}
            Chaque étape compte ce qui s’y trouve <b>aujourd’hui</b> : ce n’est pas une
            cohorte, les nombres ne décroissent donc pas forcément et il n’y a pas de
            taux de passage à en tirer.
            Chaque colonne mène à son onglet dans <a href="#/rgd/clients">Clients &amp; prospects</a>,
            où l’on retrouve exactement les mêmes personnes — <b>et le même montant</b> :
            c’est le total des devis de ces personnes à cette étape, le même calcul des
            deux côtés — <b>sauf « Chantier terminé »</b>, qui porte les chiffres du
            ${'' /* ⚠ PAS DE NOMBRE EN DUR DANS CETTE PHRASE : il dériverait du
               chiffre de la carte sans que personne ne s'en aperçoive. Même
               source que la carte, `histo`. */}
            <b>bilan commercial</b> : ${histo.chantiers} chantiers signés depuis la
            création, celui en cours compris, là où les autres colonnes comptent des
            personnes à leur étape du jour. La liste, elle, ne montrera que les
            dossiers que le CRM connaît. <b>Chiffré</b> compte les dossiers qui
            portent déjà un devis ;
            à « Devis en cours », tous n’en ont pas encore.
</p>
        </section>
        ${/* ⚠ LES OBJECTIFS À GAUCHE, LA JOURNÉE À DROITE (10/11/2026, Élodie :
              « on supprime le graphique chiffre d'affaires 2026-2027 et on met
              le récap des rendez-vous du jour à droite des objectifs du mois »).
              La carte « Chiffre d'affaires » occupait cette place : son exercice
              se lit maintenant dans « Objectifs », vue Exercice, et le détail
              par exercice dans « Bilan commercial » juste en dessous — trois
              endroits pour le même chiffre, il n'en reste que deux. */ ''}
        <div class="rgd-duo">

${carteObjectifs(moisObj, objectifs)}

        <section class="card rgd-jour">
          <div class="card-head"><h2>Aujourd’hui</h2>
            <span class="grow"></span>
            <span class="muted small">${fmtDate(aujourdhui)}</span></div>
          ${rdv.length ? `<ul class="pil-liste">${rdv
            .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
            .map(e => `<li>
              <b>${e.all_day ? 'journée' : esc(new Date(e.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</b>
              <span>${esc(e.title || '(sans titre)')}</span>
              ${e.location ? `<span class="muted small">${esc(e.location)}</span>` : ''}
            </li>`).join('')}</ul>`
            : `<div class="empty">${esc(journeeVide())}</div>`}
          <p class="small muted">Relevé depuis Google Agenda. Les notes Google Keep du
          tableau de bord ne sont pas reprises : elles vivent chez Google et le CRM
          ne les lit pas.</p>
        </section>

        </div>

${/* ⚠ `new Date()` EXPLICITE, PAS `aujourdhui` : sur cet écran `aujourdhui`
      est une CHAÎNE (`isoDay()`), et la passer à une fonction qui attend une
      Date fait tomber la vue d'ensemble entière en « Écran en échec ». Piège
      signalé par la session qui travaille sur le bilan, le 10/11/2026. */ ''}
${carteBilan(new Date(), alerteSync)}

        ${docsSt.length || leads.length ? `<div class="pil-alertes">
          ${leads.length ? `<a class="pil-alerte" href="#/rgd/clients">
            <b>${leads.length}</b><span>demande${leads.length > 1 ? 's' : ''} de devis à traiter</span></a>` : ''}
          ${docsSt.length ? `<a class="pil-alerte warn" href="#/rgd/soustraitants">
            <b>${docsSt.length}</b><span>document${docsSt.length > 1 ? 's' : ''} sous-traitants à renouveler</span></a>` : ''}
        </div>` : ''}

        <p class="small muted">Deux indicateurs de l’application RGD manquent ici :
        les <b>relances à envoyer</b> et les <b>formations à recycler</b>. Ces deux listes
        y sont vides, donc rien n’a été repris — afficher zéro laisserait croire qu’il n’y
        a rien à faire, alors que le CRM n’en sait rien.</p>`;

      root.innerHTML = cadre('#/rgd', 'Vue d’ensemble', corps);
    };

    draw();
    // Le choix du mois des objectifs : un seul écouteur sur la racine, qui
    // survit aux redessins (la carte est réécrite à chaque `draw`).
    // Le détail d'une rangée des objectifs : la liste de ce qui fait le chiffre.
    // ⚠ UNE TUILE PORTE MAINTENANT PLUSIEURS MOIS : en vue « Exercice » elle
    // en couvre jusqu'à douze, et la fenêtre met leurs listes bout à bout,
    // triées par date. En vue « Mois » il n'y en a qu'un, et rien ne change.
    //
    // ⚠ LES LIGNES NE SE DÉDOUBLONNENT PAS COMME LE COMPTE : sur un exercice,
    // un client qui signe deux fois compte pour UN dans la tuile (union des
    // clés) mais pour DEUX lignes ici — ce sont deux devis, et les cacher
    // ferait un total de montants faux. Le pied de la fenêtre compte donc des
    // lignes, jamais des clients.
    const ouvrirDetail = (tr) => {
      const se = SERIES.find(x => x.champ === tr.dataset.obDetail);
      const cles = String(tr.dataset.obCles || '').split(',').filter(Boolean);
      if (!se || !cles.length) return;
      const parts = cles.map(c => detailMoisObjectif(c, se.champ));
      const d = {
        lignes: parts.flatMap(p => p.lignes)
          .sort((a, b) => String(a.date).localeCompare(String(b.date))),
        note: parts.map(p => p.note).filter(Boolean)[0] || '',
      };
      const avecMontant = d.lignes.some(l => l.montant != null);
      const total = d.lignes.reduce((t, l) => t + (l.montant || 0), 0);
      const corps = d.lignes.length ? `<div class="table-wrap"><table class="rgd-bil-detail">
        <thead><tr><th>Date</th><th>Client</th><th>${se.champ === 'ca' ? 'Facture' : se.champ === 'devisSignes' ? 'Devis' : 'Détail'}</th>${avecMontant ? '<th class="num">Montant HT</th>' : ''}</tr></thead>
        <tbody>${d.lignes.map(l => `<tr><td>${fmtDate(String(l.date).slice(0, 10))}</td><td>${esc(l.client)}</td><td>${esc(l.detail || '—')}</td>
          ${avecMontant ? `<td class="num">${eur(l.montant, { maximumFractionDigits: 2 })}</td>` : ''}</tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="${avecMontant ? 3 : 3}"><b>${d.lignes.length} ligne${d.lignes.length > 1 ? 's' : ''}</b></td>
          ${avecMontant ? `<td class="num"><b>${eur(total, { maximumFractionDigits: 2 })}</b></td>` : ''}</tr></tfoot>
      </table></div>` : `<div class="empty">Rien sur ${esc(tr.dataset.obQuand || 'cette période')}.</div>`;
      openModal(`${se.label} · ${tr.dataset.obQuand || ''}`.trim(),
        `${d.note ? `<p class="rgd-bil-note">${esc(d.note)}</p>` : ''}${corps}`, { wide: true });
    };
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest?.('[data-ob-detail]');
      if (tr) { e.preventDefault(); ouvrirDetail(tr); }
    });
    root.addEventListener('click', (e) => {
      const tr = e.target.closest?.('[data-ob-detail]');
      if (tr) { ouvrirDetail(tr); return; }
      const v = e.target.closest?.('[data-ob-vue]');
      if (v && !v.disabled) { vueObjectif = v.dataset.obVue; draw(); return; }
      const b = e.target.closest?.('[data-ob-pas]');
      if (!b || b.disabled) return;
      const mois = moisObjectifs();
      const i = Math.max(0, mois.findIndex(m => m.cle === moisObjectifChoisi));
      const ici = moisObjectifChoisi && mois.some(m => m.cle === moisObjectifChoisi) ? i : mois.length - 1;
      const j = Math.min(mois.length - 1, Math.max(0, ici + Number(b.dataset.obPas)));
      moisObjectifChoisi = j === mois.length - 1 ? null : mois[j].cle;
      draw();
    });
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
