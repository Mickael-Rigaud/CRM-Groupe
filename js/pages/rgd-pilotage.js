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
import { esc, eur, isoDay, fmtDate, daysSince } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard, KEY } from './rgd-espace.js';
import { etapesRgd, ETAPES_HORS_CYCLE } from '../data/rgd-etapes.js';
import { objectifsMensuels, moisObjectifs, tauxPeriode, taux } from '../data/rgd-objectifs.js';
import { encadreCaOuvrier } from './rgd-ca-ouvrier.js';
import { carteBilan } from './rgd-bilan.js';

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
  const max = Math.max(1, ...etapes.map(e => e.n));
  const total = etapes.filter(e => !e.hors).reduce((t, e) => t + e.n, 0);
  // ⚠ « 3 dossiers chiffrés » EST ÉCRIT EN TOUTES LETTRES à côté du montant :
  // à « Devis en cours », une partie des dossiers n'a pas encore de devis, et
  // un montant seul laisserait croire à une somme sur l'étape entière. C'est
  // le mot que « Clients & prospects » emploie sous son total.
  const poidsCarte = (e) => !e.avecMontant ? '<span class="rgd-et-poids"></span>'
    : `<span class="rgd-et-poids">
      <b>${esc(eur(e.montant))}</b>
      <em>${e.chiffres} chiffré${e.chiffres > 1 ? 's' : ''}</em>
    </span>`;
  const carte = (e) => `<a class="rgd-et${e.hors ? ' hors' : ''}"
      href="#/rgd/clients?vue=${esc(e.cle)}" style="--c:${esc(e.couleur)}"
      title="${esc(e.titre || e.label)} — ouvrir dans Clients &amp; prospects">
    <span class="rgd-et-n">${e.n}</span>
    <span class="rgd-et-label">${esc(e.label)}</span>
    <span class="rgd-et-piste"><i style="height:${Math.round((e.n / max) * 100)}%"></i></span>
    ${poidsCarte(e)}
    <span class="rgd-et-part">${total && !e.hors ? Math.round((e.n / total) * 100) + ' %' : ''}</span>
  </a>`;
  return `<div class="rgd-frise">
    ${etapes.filter(e => !e.hors).map(carte).join('')}
    <span class="rgd-frise-sep" aria-hidden="true"></span>
    ${etapes.filter(e => e.hors).map(carte).join('')}
  </div>`;
}


/**
 * Le CA facturé mois par mois sur UN exercice donné.
 *
 * ⚠ LES MOIS À VENIR NE SONT PAS RENDUS : une barre à zéro pour un mois qui
 * n'a pas eu lieu se lit comme un mois sans activité. Sur un exercice CLOS la
 * condition ne retire rien — ses douze mois sont tous derrière nous — et c'est
 * ce qui permet de passer l'un ou l'autre à la même fonction.
 *
 * ⚠ L'EXERCICE EST UN PARAMÈTRE DEPUIS LE 02/10/2026 : il se déduisait de la
 * date du jour, donc la courbe ne savait montrer QUE l'exercice en cours — et
 * elle ne pouvait pas suivre la tuile le jour où celle-ci affiche le précédent.
 */
function caParMois(paiements, ex, d = new Date()) {
  const debut = Number(ex.du.slice(0, 4));
  const mois = [];
  for (let i = 0; i < 12; i++) {
    const m = new Date(debut, 9 + i, 1);
    if (m > d) break;
    const cle = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    mois.push({
      cle, label: m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      ht: paiements.filter(p => p.statut !== 'annule' && String(p.date_facturation || '').slice(0, 7) === cle)
        .reduce((t, p) => t + (Number(p.montant_ht) || 0), 0),
    });
  }
  return mois;
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
 * Les douze mois d'un indicateur, dans sa propre vignette.
 *
 * ⚠ QUATRE VIGNETTES, PAS UN CADRE À QUATRE COURBES (05/11/2026, Élodie :
 * « mouais non je ne trouve pas cela ouf finalement »). Le cadre unique avait
 * deux défauts que seul le rendu a montrés : son axe en POURCENTAGE de
 * l'objectif était juste mais abstrait — « 60 % » ne dit pas si ce sont six
 * rendez-vous ou trois devis — et quatre lignes qui se croisent sur douze
 * mois, aux volumes de RGD, s'enchevêtrent au lieu de se lire.
 *
 * ⚠ CHAQUE VIGNETTE GARDE SON UNITÉ ET SA PROPRE ÉCHELLE, et c'est tout
 * l'intérêt : des demandes d'un côté, des euros de l'autre, sans rien
 * convertir. NE PAS chercher à leur donner une échelle commune « pour pouvoir
 * comparer » : 20 demandes et 35 000 € ne se comparent pas, c'est précisément
 * ce qui a fait échouer le cadre unique.
 *
 * ⚠ LA MARGE DE GAUCHE SE CALCULE SUR LE PLUS LONG LIBELLÉ D'AXE : « 35 000 € »
 * mesure trois fois « 20 ». Une marge fixe tronquait l'un ou gaspillait
 * l'autre.
 */
function vignetteObjectif(mois, se, cible, formate) {
  const valeurs = mois.map(m => m[se.champ]);
  const connues = valeurs.filter(v => v !== null && v !== undefined);
  const dernier = valeurs[valeurs.length - 1];
  const part = (dernier !== null && dernier !== undefined && cible > 0)
    ? Math.round((dernier / cible) * 100) : null;

  const etiquettes = ['0', formate(cible)];
  const gauche = 18 + Math.max(...etiquettes.map(t => t.length)) * 6.2;
  const L = 560, H = 168, bas = H - 22, droite = 10;
  const large = L - gauche - droite, pas = large / mois.length;
  const max = Math.max(cible, ...connues, 1);
  const y = (v) => bas - (v / max) * (bas - 18);

  // ⚠ L'AXE NE PORTE QUE LE ZÉRO ET L'OBJECTIF. Une troisième graduation sur
  // une vignette de cette taille vient se coucher sur l'une des deux autres.
  const axe = `<line x1="${gauche}" x2="${L - droite}" y1="${y(0)}" y2="${y(0)}" class="rgd-grille"></line>
    <text x="${gauche - 8}" y="${y(0) + 4}" class="rgd-axe" text-anchor="end">0</text>
    <line x1="${gauche}" x2="${L - droite}" y1="${y(cible).toFixed(1)}" y2="${y(cible).toFixed(1)}" class="rgd-objectif"></line>
    <text x="${gauche - 8}" y="${(y(cible) + 4).toFixed(1)}" class="rgd-axe" text-anchor="end">${esc(formate(cible))}</text>`;

  // ⚠ LES COLONNES D'ABORD, LES BULLES ENSUITE, ET C'EST LE POINT DE CE
  // DÉCOUPAGE EN DEUX PASSES. Une bulle enfermée dans le groupe de SON mois se
  // dessine avant les colonnes des mois SUIVANTS : en SVG, ce qui vient après
  // passe par-dessus, et une bulle de 124 px à cheval sur trois colonnes
  // serait mangée par celles de droite. Les zones de survol sont donc posées
  // toutes ensemble APRÈS les colonnes, chacune avec sa bulle.
  const colonnes = mois.map((m, i) => {
    const v = m[se.champ];
    if (v === null || v === undefined) return '';
    return `<rect x="${(gauche + pas * i + pas * 0.2).toFixed(1)}" y="${y(v).toFixed(1)}"
      width="${(pas * 0.6).toFixed(1)}" height="${Math.max(0, bas - y(v)).toFixed(1)}" rx="4"
      class="rgd-ob-colonne" style="fill:${se.couleur}"></rect>`;
  }).join('');

  // ⚠ LA BULLE EST CELLE DU GRAPHIQUE DU CHIFFRE D'AFFAIRES (05/11/2026,
  // Élodie : « quand on survole les graphiques je voudrais avoir les chiffres
  // par mois »). `rgd-info`, `rgd-bulle`, `rgd-bulle-mois` et `rgd-bulle-ca`
  // existent depuis cet écran-là : aucune classe neuve, et le jour où l'une
  // d'elles change, les deux graphiques suivent ensemble.
  //
  // ⚠ LE `<title>` RESTE SOUS LA BULLE, et ce n'est pas un doublon : la bulle
  // se dessine au survol, que le doigt n'a pas. Sur téléphone, un appui long
  // reste le seul moyen de lire le chiffre d'un mois.
  const LARGE_BULLE = 124, HAUT_BULLE = 38;
  const survols = mois.map((m, i) => {
    const v = m[se.champ];
    const connu = v !== null && v !== undefined;
    const part = connu && cible > 0 ? Math.round((v / cible) * 100) : null;
    const dit = connu ? `${formate(v)}${part === null ? '' : ' · ' + part + ' %'}` : 'pas de donnée';
    const cy = connu ? y(v) : bas;
    // ⚠ LA BULLE SE RABAT SOUS LE SOMMET DE LA COLONNE quand elle sortirait
    // par le haut, et se recadre sur les bords : aux mois extrêmes elle
    // débordait du cadre.
    const bx = Math.min(Math.max(gauche + pas * i + pas / 2 - LARGE_BULLE / 2, 2), L - LARGE_BULLE - 2);
    const haut = cy - HAUT_BULLE - 8;
    const by = haut < 2 ? Math.min(cy + 10, bas - HAUT_BULLE) : haut;
    return `<g class="rgd-mois">
      <rect class="rgd-zone" x="${(gauche + pas * i).toFixed(1)}" y="0" width="${pas.toFixed(1)}" height="${bas}"></rect>
      ${/* ⚠ LA COLONNE EST REDESSINÉE PAR-DESSUS LA BANDE DE SURVOL. La bande
            se peint après les colonnes — il le faut, puisque les bulles doivent
            passer au-dessus de tout — et elle délavait la colonne du mois
            pointé, le seul qu'on regarde. Ce doublon la remet au premier plan,
            à sa couleur pleine. */ ''}
      <g class="rgd-info">
        ${connu ? `<rect x="${(gauche + pas * i + pas * 0.2).toFixed(1)}" y="${y(v).toFixed(1)}"
          width="${(pas * 0.6).toFixed(1)}" height="${Math.max(0, bas - y(v)).toFixed(1)}" rx="4"
          style="fill:${se.couleur}"></rect>` : ''}
        <g transform="translate(${bx.toFixed(1)},${by.toFixed(1)})">
          <rect width="${LARGE_BULLE}" height="${HAUT_BULLE}" rx="8" class="rgd-bulle"></rect>
          <text x="${LARGE_BULLE / 2}" y="15" text-anchor="middle" class="rgd-bulle-mois">${esc(m.label)}</text>
          <text x="${LARGE_BULLE / 2}" y="31" text-anchor="middle" class="rgd-bulle-ca">${esc(dit)}</text>
        </g>
      </g>
      <title>${esc(m.label)} · ${esc(dit)}${connu ? ' sur ' + esc(formate(cible)) : ''}</title>
    </g>`;
  }).join('');

  // ⚠ LE MOIS SANS SON ANNEE SOUS LES VIGNETTES : a douze colonnes sur une
  // demi-largeur de carte, « déc. 25 » et « janv. 26 » se marchaient dessus et
  // la ligne des mois devenait un pâté. La fenêtre glisse sur douze mois :
  // l'année n'y lève aucune ambiguïté, et l'en-tête de la carte la porte déjà.
  const court = (m) => String(m.label).replace(/\s*\d{2}$/, '');
  const legendes = mois.map((m, i) => `<text x="${(gauche + pas * i + pas / 2).toFixed(1)}" y="${H - 5}"
    class="rgd-axe" text-anchor="middle">${esc(court(m))}</text>`).join('');

  return `<div class="rgd-ob-vignette">
    <div class="rgd-ob-vt"><b style="color:${se.couleur}">${esc(se.label)}</b>
      <span>${dernier === null || dernier === undefined ? '—' : esc(formate(dernier))} sur ${esc(formate(cible))}${part === null ? '' : ' · ' + part + ' %'}</span></div>
    <svg viewBox="0 0 ${L} ${H}" role="img"
      aria-label="${esc(se.label)} mois par mois, face à l’objectif de ${esc(formate(cible))}">
      ${axe}${colonnes}${legendes}${survols}
    </svg>
  </div>`;
}

/**
 * La carte entière, dans la langue de l'écran.
 *
 * ⚠ LES QUATRE CARTES SONT CELLES DU PIPELINE, AU MÊME BALISAGE : `rgd-et`,
 * son grand nombre, son libellé, sa jauge verticale et son pourcentage. Elles
 * ne sont pas des liens, faute d'un écran où mener — c'est la seule différence,
 * et elle ne se voit pas.
 *
 * ⚠ LE MOIS EN COURS EST INCOMPLET PAR CONSTRUCTION : le 5 novembre, « 5 % »
 * n'est pas un échec, c'est le cinquième jour. L'en-tête le dit, parce que sans
 * cela la carte annonce une catastrophe tous les débuts de mois.
 */
function carteObjectifs(mois, obj) {
  if (!mois.length) return '';
  const courant = mois[mois.length - 1];
  const t = tauxPeriode(mois);
  const maintenant = new Date();
  const jour = maintenant.getDate();
  const joursDuMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0).getDate();

  const euros = (v) => eur(Math.round(v));
  const nombre = (v) => String(v);
  const formats = { demandes: nombre, rdv: nombre, devisSignes: nombre, ca: euros };
  // ⚠ DES RANGÉES, PAS DES CARTES, ET C'EST LE POINT DE CETTE VERSION
  // (05/11/2026, Élodie : « c'est la même présentation qu'en haut, on ne
  // distingue pas les deux éléments »). La version d'avant reprenait les
  // cartes `rgd-et` du pipeline au balisage près : même langue, certes, mais
  // deux blocs devenus indiscernables l'un de l'autre à trente centimètres.
  //
  // ⚠ ON NE SORT PAS DE LA LANGUE DU CRM POUR AUTANT : `rgd-pipe-table` et sa
  // piste horizontale sont déjà dans la feuille de style — elles y dormaient,
  // plus aucun écran ne les appelait. La forme change, le vocabulaire non, et
  // aucune ligne de style n'est ajoutée.
  const rangee = (se) => {
    const v = courant[se.champ];
    const cible = obj[se.cible];
    const connu = v !== null && v !== undefined;
    const part = connu && cible > 0 ? Math.round((v / cible) * 100) : null;
    const formate = formats[se.champ];
    return `<tr>
      <th scope="row">${esc(se.label)}</th>
      <td class="rgd-pipe-barre">
        <div class="rgd-pipe-piste"><i style="width:${Math.min(100, part || 0)}%;background:${se.couleur}"></i></div>
      </td>
      <td class="rgd-pipe-n"><b style="color:${se.couleur}">${connu ? esc(formate(v)) : '—'}</b><span class="rgd-ob-sur">sur ${esc(formate(cible))}</span></td>
      <td class="rgd-ob-pct${part !== null && part >= 100 ? ' atteint' : ''}">${part === null ? '' : part + ' %'}</td>
    </tr>`;
  };

  const pc = (v) => (v === null ? '—' : v + ' %');

  return `
        <section class="card rgd-ob">
          <div class="card-head"><h2>Objectifs du mois</h2>
            <span class="grow"></span>
            <span class="muted small">${esc(courant.label)} — jour ${jour} sur ${joursDuMois}</span></div>

          <table class="rgd-pipe-table rgd-ob-table"><tbody>${SERIES.map(rangee).join('')}</tbody></table>

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

          ${/* ⚠ NI ONGLETS NI LÉGENDE : chaque vignette porte son nom et sa
                couleur. Une légende commune supposerait une échelle commune,
                que ces quatre grandeurs n'ont pas. */ ''}
          <div class="rgd-ob-vignettes">
            ${SERIES.map(se => vignetteObjectif(mois, se, obj[se.cible], formats[se.champ])).join('')}
          </div>

          <p class="small muted rgd-ob-pied">Chaque mois compte ce qui s’y est <b>passé</b> :
          demandes reçues, rendez-vous tenus, devis signés, factures émises. Un <b>rendez-vous</b> est
          une visite technique, la même que la colonne « RDV » ci-dessus.
          <b>Deux devis pour un même client comptent pour un.</b>
          La ligne pointillée est l’objectif ; une colonne qui la dépasse est un mois tenu. Un mois sans colonne veut dire que le CRM n’a pas la donnée, pas qu’elle vaut zéro. Chaque vignette garde son unité : elles ne se comparent pas entre elles.
          Objectifs modifiables dans les <a href="#/rgd/reglages">réglages</a>.</p>
        </section>
`;
}

/**
 * La courbe du CA : une barre par mois, une ligne pour la suivre, et le montant
 * du mois au survol.
 *
 * ⚠ PAS DE BIBLIOTHÈQUE. Chart.js est vendu dans le CRM, mais douze valeurs ne
 * justifient pas de le charger sur l'écran qu'on ouvre le matin.
 *
 * ⚠ LE SURVOL EST EN CSS, PAS EN JAVASCRIPT. Chaque mois est un `<g>` qui
 * porte une zone de capture invisible sur TOUTE la hauteur : on n'a pas à
 * viser la barre, qui est minuscule les mois creux — août fait 4 518 € contre
 * 67 000 € en mai. Sans cette zone, le mois le plus intéressant à survoler
 * serait le plus difficile à atteindre.
 *
 * ⚠ LA BULLE EST RECADRÉE AUX BORDS. Centrée sur le premier ou le dernier
 * mois, elle sortirait du cadre et serait coupée — un SVG ne déborde pas.
 */
function courbeCa(mois) {
  // ⚠ UNE COURBE DE ZÉROS N'EST PAS UNE COURBE, et le cas est arrivé le
  // 02/10/2026 : au lendemain du changement d'exercice il reste UN mois,
  // à zéro, donc `mois.length` valait 1 et l'écran traçait une ligne plate
  // avec une échelle inventée (`max` retombe à 1). On teste donc s'il y a
  // quelque chose à tracer, pas s'il y a des mois.
  if (!mois.some(m => m.ht)) return '<div class="empty">Aucune facture sur cet exercice.</div>';
  const L = 960, H = 260, bas = H - 34, gauche = 56, droite = 14;
  const large = L - gauche - droite, pas = large / mois.length;
  const max = Math.max(1, ...mois.map(m => m.ht));
  const y = (v) => bas - (v / max) * (bas - 30);
  const x = (i) => gauche + pas * i + pas / 2;

  const graduations = [0, 0.25, 0.5, 0.75, 1].map(f => `<g>
    <line x1="${gauche}" x2="${L - droite}" y1="${y(max * f)}" y2="${y(max * f)}" class="rgd-grille"></line>
    <text x="${gauche - 10}" y="${y(max * f) + 4}" class="rgd-axe" text-anchor="end">${Math.round(max * f / 1000)}k€</text></g>`).join('');

  // L'aire sous la courbe, en dégradé : elle donne le volume que douze barres
  // seules ne montrent pas, et se referme sur la ligne du zéro.
  const aire = `M${x(0).toFixed(1)},${bas} `
    + mois.map((m, i) => `L${x(i).toFixed(1)},${y(m.ht).toFixed(1)}`).join(' ')
    + ` L${x(mois.length - 1).toFixed(1)},${bas} Z`;
  const trait = mois.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.ht).toFixed(1)}`).join(' ');

  const LARGE_BULLE = 108, HAUT_BULLE = 40;
  const colonnes = mois.map((m, i) => {
    const cx = x(i);
    // Recadrage : la bulle reste entière dans le cadre.
    const bx = Math.min(Math.max(cx - LARGE_BULLE / 2, 2), L - LARGE_BULLE - 2);
    // Au-dessus du point, sauf quand le point est trop haut : elle passe dessous.
    const haut = y(m.ht) - HAUT_BULLE - 10;
    const by = haut < 2 ? y(m.ht) + 12 : haut;
    return `<g class="rgd-mois">
      <rect class="rgd-zone" x="${(gauche + pas * i).toFixed(1)}" y="0" width="${pas.toFixed(1)}" height="${bas}"></rect>
      <rect class="rgd-barre" x="${(gauche + pas * i + pas * 0.24).toFixed(1)}" y="${y(m.ht).toFixed(1)}"
        width="${(pas * 0.52).toFixed(1)}" height="${Math.max(0, bas - y(m.ht)).toFixed(1)}" rx="4"></rect>
      <circle class="rgd-point" cx="${cx.toFixed(1)}" cy="${y(m.ht).toFixed(1)}" r="4.5"></circle>
      <g class="rgd-info" transform="translate(${bx.toFixed(1)},${by.toFixed(1)})">
        <rect width="${LARGE_BULLE}" height="${HAUT_BULLE}" rx="8" class="rgd-bulle"></rect>
        <text x="${LARGE_BULLE / 2}" y="16" text-anchor="middle" class="rgd-bulle-mois">${esc(m.label)}</text>
        <text x="${LARGE_BULLE / 2}" y="32" text-anchor="middle" class="rgd-bulle-ca">${esc(eur(m.ht))}</text>
      </g>
      <title>${esc(m.label)} · ${esc(eur(m.ht))} HT</title>
    </g>`;
  }).join('');

  const legendes = mois.map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="rgd-axe" text-anchor="middle">${esc(m.label)}</text>`).join('');

  return `<svg class="rgd-courbe" viewBox="0 0 ${L} ${H}" role="img"
    aria-label="Chiffre d'affaires HT facturé mois par mois sur l'exercice">
    <defs><linearGradient id="rgd-aire" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity=".28"></stop>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"></stop>
    </linearGradient></defs>
    ${graduations}
    <path d="${aire}" fill="url(#rgd-aire)"></path>
    <path d="${trait}" class="rgd-trait"></path>
    ${colonnes}${legendes}</svg>`;
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
      const ex = exercice();

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

      // CA DE L'EXERCICE — calculé, puis la correction manuelle par-dessus.
      // Les deux sont montrés : l'écart dit à quel point Costructor est en retard.
      const surExercice = (e) => paiements.filter(p => p.statut !== 'annule'
        && p.date_facturation && p.date_facturation >= e.du && p.date_facturation <= e.au);

      // ⚠ TANT QUE LE NOUVEL EXERCICE NE PORTE AUCUNE FACTURE, ON AFFICHE LE
      // PRÉCÉDENT (02/10/2026, demandé par Mickael : « tant qu'il n'y a pas de
      // CA sur le nouvel exercice tu peux conserver l'ancien »). Le 1er octobre
      // l'exercice bascule : le 30 au soir la tuile affichait 382 620 €, le 1er
      // au matin 0 €, et un grand zéro sur l'écran qu'on ouvre le matin se lit
      // comme une panne — « pourquoi je n'ai plus le CA de Costructor ? ».
      //
      // ⚠ LE BASCULEMENT SE FAIT TOUT SEUL, SUR UN FAIT ET NON SUR UNE DATE :
      // dès la PREMIÈRE facture du nouvel exercice, c'est lui qui s'affiche.
      // Un délai en jours (« les trois premières semaines d'octobre ») aurait
      // été un réglage à retenir, et il aurait caché un vrai début d'activité.
      //
      // ⚠ ET L'ÉCRAN DIT QUEL EXERCICE IL MONTRE, à trois endroits — le titre,
      // une pastille « clos », et la phrase sous le montant. Montrer l'ancien
      // chiffre sans le nommer serait pire que le zéro : on lirait 382 620 €
      // comme le chiffre de l'année en cours.
      const exCourant = ex;
      const exPrecedent = {
        du: `${Number(ex.du.slice(0, 4)) - 1}-10-01`, au: `${Number(ex.au.slice(0, 4)) - 1}-09-30`,
        label: `${Number(ex.du.slice(0, 4)) - 1}–${Number(ex.au.slice(0, 4)) - 1}`,
      };
      const facturesCourant = surExercice(exCourant);
      const facturesPrecedent = surExercice(exPrecedent);
      const surLePrecedent = facturesCourant.length === 0 && facturesPrecedent.length > 0;

      const exVu = surLePrecedent ? exPrecedent : exCourant;
      const facturesEx = surLePrecedent ? facturesPrecedent : facturesCourant;
      const calculeHt = facturesEx.reduce((t, p) => t + (Number(p.montant_ht) || 0), 0);
      const precedentHt = facturesPrecedent.reduce((t, p) => t + (Number(p.montant_ht) || 0), 0);

      // ⚠ LA CORRECTION MANUELLE NE PORTE AUCUNE ANNÉE, et c'est un piège à
      // retardement : `manual_ca_ht_exercice` est une clé unique, donc une
      // valeur saisie pour 2025–2026 s'afficherait telle quelle comme le CA de
      // 2026–2027 dès le 1er octobre. Les deux clés sont vides aujourd'hui
      // (vérifié en production), le trou n'a donc rien cassé — mais il faut le
      // dire à l'écran plutôt que d'attendre la prochaine bascule. Tant qu'on
      // montre l'exercice précédent, elle s'applique à LUI, ce qui est aussi
      // l'exercice pour lequel elle a été saisie.
      const corrigeHt = reglage('manual_ca_ht_exercice');
      const caHt = corrigeHt !== null ? Number(corrigeHt) : calculeHt;
      const corrige = corrigeHt !== null && Math.round(Number(corrigeHt)) !== Math.round(calculeHt);

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
      const mois = caParMois(paiements, exVu);
      // ⚠ LES OBJECTIFS SE LISENT SUR DOUZE MOIS GLISSANTS, PAS SUR L'EXERCICE
      // de la courbe juste en dessous — voir l'en-tête de `data/rgd-objectifs.js`.
      // Mesuré le 04/11/2026 : calés sur l'exercice, ils n'auraient eu que deux
      // colonnes, et une seule chaque 1er octobre.
      const objectifs = objectifsMensuels();
      const moisObj = moisObjectifs();
      const moyenne = mois.length ? Math.round(caHt / mois.length) : 0;
      // Les sept étapes viennent du module commun : le pipeline et la liste
      // comptent forcément les mêmes personnes, y compris les gardes.
      const etapes = etapesRgd().map(e => ({
        ...e, cle: e.key, couleur: COULEURS[e.key] || 'var(--accent)',
        hors: ETAPES_HORS_CYCLE.includes(e.key),
      }));
      const totalEtapes = etapes.filter(e => !e.hors).reduce((t, e) => t + e.n, 0);

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
            deux côtés. <b>Chiffré</b> compte les dossiers qui portent déjà un devis ;
            à « Devis en cours », tous n’en ont pas encore.
</p>
        </section>
${carteObjectifs(moisObj, objectifs)}
        <div class="rgd-duo">

        <section class="card rgd-ca">
          <div class="card-head"><h2>Chiffre d’affaires ${esc(exVu.label)}</h2>
            <span class="grow"></span>
            <span class="muted small">exercice du 1<sup>er</sup> octobre au 30 septembre</span></div>
          <div class="rgd-ca-ligne">
            <b class="rgd-ca-montant">${eur(caHt)}</b>
            <span class="muted">HT</span>
            ${surLePrecedent ? '<span class="chip muted">exercice clos</span>' : ''}
            ${corrige ? '<span class="chip amber">corrigé à la main</span>' : ''}
          </div>
          ${!facturesCourant.length ? `<p class="rgd-ca-neuf">L’exercice
              <b>${esc(exCourant.label)}</b> a commencé le 1<sup>er</sup> octobre et
              <b>ne porte encore aucune facture</b>.${surLePrecedent
                ? ` L’écran montre donc le dernier exercice clos, et basculera tout
                  seul sur ${esc(exCourant.label)} dès la première facture.` : ''}</p>` : ''}
          ${facturesEx.length ? `<p class="small muted rgd-ca-sous">Moyenne mensuelle ${eur(moyenne)} HT sur
            ${mois.length} mois${surLePrecedent ? '' : ` écoulé${mois.length > 1 ? 's' : ''}`}.${!surLePrecedent && precedentHt
              ? ` Exercice ${esc(exPrecedent.label)} : ${eur(precedentHt)} HT.` : ''}</p>` : ''}
          ${courbeCa(mois)}
          ${corrige ? `<p class="small">
            <b>Ce chiffre est saisi à la main</b> et masque le calcul, qui donne
            ${eur(calculeHt)}. Tant qu’une correction existe, l’écran ne peut plus
            signaler que la synchronisation Costructor est en retard : c’est
            exactement ce qui a caché deux mois de factures absentes jusqu’au
            23/09/2026. Si les deux valeurs se ressemblent, vérifiez la date du
            dernier relevé avant de conclure que tout va bien.
            Pour rendre la main au calcul : saisir <b>0</b> dans les
            <a href="#/rgd/reglages">réglages</a>.
            <b>Elle ne porte aucune année</b> : elle a été saisie pour un exercice
            et s’applique à celui-ci, à revérifier après chaque 1<sup>er</sup> octobre.
            <b>La courbe, elle, montre le calculé</b> — mois par mois, il n’existe pas
            de saisie manuelle, et lisser la correction sur douze mois inventerait
            une répartition que personne n’a constatée.</p>`
            : '<p class="small muted">Calculé sur les factures de l’exercice, avoirs déduits, annulées exclues.</p>'}
          ${reglage('manual_clients_actifs') !== null ? `<p class="small muted">
            Clients actifs déclarés : <b>${esc(reglage('manual_clients_actifs'))}</b>,
            également saisi à la main côté RGD.</p>` : ''}
          <p class="rgd-ca-frais small ${syncKo ? 'ko' : 'ok'}">
            <span class="chip ${syncKo ? 'red' : 'green'}">${syncKo ? 'Factures en retard' : 'Factures à jour'}</span>
            <span class="grow">${syncFactures?.dernier_succes
              ? `Dernier relevé Costructor des factures ${esc(fmtDate(syncFactures.dernier_succes))}${ageSync > 2
                ? `, il y a ${ageSync} jours : <b>le CA calculé est celui de cette date</b>, pas celui d’aujourd’hui.` : '.'}`
              : 'Aucun relevé Costructor des factures n’est enregistré : rien ne dit de quand date ce CA.'}
            ${dernierEncaissement ? ` Dernière facture connue : ${esc(fmtDate(dernierEncaissement))}.` : ''}</span>
            <a href="#/rgd/costructor">Voir la synchronisation</a>
          </p>
        </section>

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

${carteBilan()}

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
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
