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
// LE CA AFFICHÉ EST CELUI QUE LE CRM CALCULE, ET IL N'Y A PLUS DE CORRECTION
// POSSIBLE — depuis le 10/11/2026, `manual_ca_ht_exercice`,
// `manual_ca_ttc_exercice` et `manual_clients_actifs` ne se saisissent plus
// nulle part : leurs champs ont quitté les réglages. Les lignes restent en
// base, aucun écran ne les lit.
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
// ⚠ LE BANDEAU « À REPRENDRE » VIT SUR CET ÉCRAN, et pas sur la fiche : c'est
// celui qu'on ouvre en arrivant, et le propre d'une intervention interrompue
// est qu'on ne sait plus chez QUI on en était.
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
// ⚠ DEUX ÉTAPES NE SE DESSINENT PAS DANS LA FRISE (10/11/2026, Élodie :
// « supprime juste les archivés et clients indésirables »). Elles existent
// toujours — dans `etapesRgd()`, dans « Clients & prospects », dans la frise
// d'une fiche, dans les flèches de passage : c'est l'AFFICHAGE DE CET ÉCRAN qui
// les écarte, pas la donnée. Ne pas « simplifier » en les retirant de
// `ETAPES_HORS_CYCLE` (js/data/rgd-etapes.js), que trois écrans partagent.
//
// ⚠ « SAV » RESTE, et ce n'est pas un oubli : c'est du travail en cours qu'on
// veut voir au tableau de bord. Les deux autres sont des rangements — on n'y
// avance pas, on y range —, et une vue d'ensemble n'a pas à compter ce qui
// dort. Le total « affaires suivies » ne change pas : il excluait déjà les
// étapes hors cycle.
const ETAPES_HORS_FRISE = ['archives', 'indesirable'];

// LES COULEURS DE LA FRISE — DEUX TONS PAR ÉTAPE (10/11/2026, Élodie : « je
// voudrais que les couleurs soient plus pétantes, c'est un peu trop triste »).
//
// ⚠ POURQUOI DEUX ET PAS UN : le premier (`c`) écrit le CHIFFRE, en grand, sur
// du blanc — il doit rester lisible, donc assez foncé. Le second (`p`) ne
// touche jamais au texte : il teinte le fond de la carte, la piste et le haut
// du remplissage. C'est lui qui pétille. Avec une seule couleur il fallait
// choisir entre un chiffre lisible et un fond vif, et c'est ce compromis qui
// rendait la frise terne — du brun à « Devis en cours », du gris à « Nouvelle
// demande ».
//
// ⚠ « DEVIS ENVOYÉ » N'AVAIT PAS DE COULEUR ET TOMBAIT SUR `var(--accent)`,
// qui vaut l'orange RGD — exactement la couleur de « Devis accepté », juste à
// côté. Deux étapes voisines de la même teinte : ça ne se voyait que lorsque
// les deux portaient un chiffre. Chaque étape a désormais la sienne.
//
// L'ordre des teintes suit le parcours d'une affaire : violet à l'entrée, bleu
// au rendez-vous, or puis orange pendant le devis, et trois verts qui montent
// quand ça se signe et se construit. Le turquoise du SAV est à part, comme la
// carte l'est derrière son trait.
//
// ⚠ « Archivés » et « Clients indésirables » GARDENT LEUR ENTRÉE bien qu'ils
// ne soient plus dessinés (voir `ETAPES_HORS_FRISE`) : si on les remet un jour,
// ils reviendront colorés et non pas en « accent » par défaut.
const COULEURS = {
  demande:          { c: '#7C3AED', p: '#A78BFA' },
  rdv:              { c: '#2563EB', p: '#60A5FA' },
  devis_encours:    { c: '#CA8A04', p: '#FACC15' },
  devis_envoye:     { c: '#EA580C', p: '#FB923C' },
  devis_accepte:    { c: '#65A30D', p: '#A3E635' },
  chantier_encours: { c: '#16A34A', p: '#4ADE80' },
  chantier_termine: { c: '#047857', p: '#34D399' },
  sav:              { c: '#0E7490', p: '#22D3EE' },
  archives:         { c: '#B91C1C', p: '#F87171' },
  indesirable:      { c: '#7F1D1D', p: '#FCA5A5' },
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
  // ⚠ `i` EST LE RANG DE LA CARTE DANS LA RANGÉE, et il sert à une seule chose :
  // décaler son arrivée pour que la frise se monte en cascade (`--i` dans
  // `css/app.css`). Il ne veut rien dire de métier — surtout pas un ordre
  // d'avancement, que le numéro d'étape porte déjà.
  // ⚠ ET `vide` N'EST PAS « RIEN À AFFICHER » : la carte reste entière, à sa
  // place et à sa taille, elle pâlit seulement. « Personne à cette étape » est
  // une information de l'écran, pas un trou à boucher.
  const carte = (e, i) => `<a class="rgd-et${e.hors ? ' hors' : ''}${e.n ? '' : ' vide'}"
      href="#/rgd/clients?vue=${esc(e.cle)}"
      style="--c:${esc(e.couleur)};--p:${esc(e.petant)};--i:${i}"
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
  // ⚠ LA CASCADE NE REPART PAS DE ZÉRO APRÈS LE TRAIT : les cartes hors cycle
  // continuent la numérotation, sinon « Archivés » arriverait en même temps que
  // « Nouvelle demande » et le mouvement se lirait comme deux frises séparées.
  const cycle = etapes.filter(e => !e.hors);
  const horsCycle = etapes.filter(e => e.hors);
  return `<div class="rgd-frise">
    ${cycle.map((e, i) => carte(e, i)).join('')}
    <span class="rgd-frise-sep" aria-hidden="true"></span>
    ${horsCycle.map((e, i) => carte(e, cycle.length + i)).join('')}
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

// ------------------------------------------------ LES SEPT INDICATEURS
// ⚠ LA CONSIGNE DU 05/11 A ÉTÉ LEVÉE PAR ÉLODIE ELLE-MÊME, ET IL FAUT SAVOIR
// POURQUOI AVANT DE LA REMETTRE. Il était écrit ici : « aucune forme nouvelle,
// ne pas y rajouter d'anneaux, de dégradés ni de pastilles colorées ». Trois
// dessins avaient été refusés avant — frises de barres, graphique groupé,
// anneaux animés — le dernier parce qu'il parlait une langue à lui au milieu
// d'un écran qui en parlait déjà une : « trop de blocs différents ».
//
// Ce qui a changé le 10/11 : le bilan commercial, JUSTE EN DESSOUS, a pris ce
// dessin-là — tuiles en dégradé, anneau d'avancement — et elle l'a choisi
// entre trois maquettes. Le même jour : « j'adore cette présentation et je
// voudrais que ces encadrés soient en dessus de la pipeline ». Reprendre ce
// dessin ne rajoute donc PAS une langue de plus, il en retire une : c'est
// l'ancienne carte à rangées qui faisait le troisième bloc.
//
// ⚠ LA RÈGLE DE FOND, ELLE, N'A PAS BOUGÉ : ne pas inventer de forme ici. Si
// une quatrième langue devait apparaître sur cet écran, ce serait à refuser.
const SERIES = [
  { champ: 'demandes', cible: 'demandes', label: 'Demandes', court: 'Demandes',
    c1: '#93a5c4', c2: '#5c7093' },
  { champ: 'rdv', cible: 'rdv', label: 'Rendez-vous', court: 'RDV',
    c1: '#5b8cff', c2: '#3657d6' },
  { champ: 'nbDevisEnvoyes', cible: 'envoyes', label: 'Devis envoyés', court: 'Envoyés',
    c1: '#ff9a4d', c2: '#e8622a' },
  // ⚠ CETTE TUILE N'A PAS D'OBJECTIF À ELLE, ELLE PORTE UN TAUX : « 3 devis
  // signés, 75 % des devis envoyés », exactement la tuile bleue du bilan
  // commercial. Mettre « sur 5 » ici ET sur « Chantiers » afficherait deux fois
  // le même objectif sur deux nombres différents — le document d'Élodie n'en
  // fixe qu'un, « chantiers / devis signés : 5 par mois ».
  // ⚠ `taux` EST UN CHAMP DU MOIS, PAS UNE CLÉ D'OBJECTIF : il portait
  // 'envoyes' (le nom de l'objectif) et la tuile restait sans anneau — vu à
  // l'écran en vue Exercice, « 3 » sans son « 75 % des devis envoyés ».
  { champ: 'nbDevisSignes', taux: 'nbDevisEnvoyes', label: 'Devis signés', court: 'Signés',
    c1: '#f6b93b', c2: '#bd7b00' },
  { champ: 'chantiers', cible: 'devis', label: 'Chantiers', court: 'Chantiers',
    c1: '#34c48b', c2: '#16855a' },
  { champ: 'ca', cible: 'ca', label: 'CA facturé HT', court: 'Facturé',
    c1: '#a77bff', c2: '#6a3fd0', euro: true },
  // Pas d'objectif non plus : son repère naturel est ce qui a été facturé.
  { champ: 'encaisse', taux: 'ca', label: 'CA encaissé HT', court: 'Encaissé',
    c1: '#2ed3c6', c2: '#0d8f8a', euro: true },
];

// ⚠ SEPT INDICATEURS DEPUIS LE 10/11/2026, ET LEUR ORDRE EST CELUI D'ÉLODIE :
// demandes, rendez-vous, devis envoyés, devis signés, chantiers, CA facturé,
// CA encaissé. C'est le parcours d'une affaire, de la demande à l'argent reçu.
//
// ⚠ « DEVIS SIGNÉS » ET « CHANTIERS » NE COMPTENT PAS LA MÊME CHOSE, et les
// voir côte à côte est tout l'intérêt : la première compte des DEVIS, la
// seconde des CLIENTS distincts (« généralement un client représente un
// chantier », Élodie le 05/11). Jusqu'ici une seule tuile existait et elle
// comptait des clients ; le nombre affiché sous « Devis signés » peut donc
// AUGMENTER par rapport à hier, sans qu'aucune donnée n'ait changé. C'est le
// vocabulaire du bilan commercial, juste en dessous sur le même écran : les
// deux cartes ne pouvaient pas appeler « devis signés » deux nombres différents.
//
// ⚠ « CA ENCAISSÉ » NE SUIT PAS « CA FACTURÉ » À UN MOIS PRÈS, c'est normal :
// le facturé se date de l'émission, l'encaissé de la réception du paiement
// (`date_reception`). Une facture de juillet payée en septembre est dans les
// deux mois à la fois, chacun dans sa courbe.
//
// ⚠ LES COULEURS SONT CELLES DES COURBES, ET RÉCIPROQUEMENT : chaque tuile est
// la légende de sa courbe, ce qui évite d'en poser une septième ligne sous le
// graphique. Changer une couleur ici change les deux.

/**
 * Les sept indicateurs mois par mois, sur UN SEUL graphique.
 *
 * ⚠ UN CADRE À PLUSIEURS COURBES, ET C'EST UN RETOUR EN ARRIÈRE ASSUMÉ
 * (10/11/2026, Élodie : « je n'aime pas du tout comment c'est présenté et les
 * 4 graphiques en dessous prennent trop de place. Je voudrais que tu fasses un
 * seul graphique avec 4 courbes différentes »). La même forme avait été
 * écartée le 05/11 ; elle lui a été remontrée à côté de deux autres, sur ses
 * VRAIS chiffres, et c'est celle-là qu'elle a retenue.
 *
 * ⚠ LES DEUX DÉFAUTS DE LA PREMIÈRE TENTATIVE SONT TRAITÉS, PAS OUBLIÉS :
 *   1. son axe était en POURCENTAGE DE L'OBJECTIF — juste, mais abstrait :
 *      « 60 % » ne dit pas si ce sont six rendez-vous ou trois devis. Il y a
 *      donc DEUX échelles, les comptages à gauche et les euros à droite. Rien
 *      n'est converti.
 *   2. les lignes s'enchevêtraient. Le survol donne maintenant TOUTES les
 *      valeurs du mois pointé dans une seule bulle, avec une ligne guide : on
 *      n'a plus à suivre une courbe de l'œil. Et depuis qu'elles sont sept,
 *      survoler une TUILE éteint les autres courbes (voir `.rgd-ob-serie`).
 *
 * ⚠ L'AXE DE DROITE N'EST PLUS ÉCRIT EN VERT (10/11/2026) : il l'était quand
 * une seule courbe s'y lisait, pour dire laquelle. Ils sont deux maintenant —
 * CA facturé et CA encaissé —, aucune couleur ne peut les désigner tous les
 * deux, et les euros se reconnaissent à leur unité. Le pied le dit aussi.
 *
 * ⚠ L'ÉCHELLE DE GAUCHE SE MESURE SUR LES DONNÉES, PAS SUR LES OBJECTIFS :
 * tirer l'axe jusqu'à 20 (l'objectif de demandes) sur une année qui plafonne à
 * 11 écraserait les courbes dans le quart bas du cadre. Les objectifs sont dans
 * les tuiles, où ils se lisent en chiffres.
 *
 * ⚠ ET LE VOCABULAIRE RESTE CELUI DE L'ÉCRAN : `rgd-courbe`, `rgd-grille`,
 * `rgd-axe`, `rgd-trait`, `rgd-mois`, `rgd-zone`, `rgd-info`, `rgd-bulle` sont
 * ceux du graphique du chiffre d'affaires qui vivait sur cet écran.
 */
function grapheObjectifs(mois, formats, marques, cleEnCours) {
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
  const comptes = SERIES.filter(s => !s.euro);
  const sous = SERIES.filter(s => s.euro);
  const hautN = rond(Math.max(1, ...comptes.flatMap(s => valeurs(s.champ))));
  // ⚠ LES DEUX COURBES EN EUROS PARTAGENT LEUR ÉCHELLE, sans quoi un mois à
  // 4 000 € encaissés et un mois à 40 000 € facturés se dessineraient à la
  // même hauteur et la comparaison — celle qu'on vient faire — serait fausse.
  const hautCa = rond(Math.max(1, ...sous.flatMap(s => valeurs(s.champ))));
  const fraction = (se, v) => (se.euro ? v / hautCa : v / hautN);
  // Sous dix mille euros, « 0 k€ » sur les trois graduations ne dirait rien.
  const etiqCa = (v) => (hautCa >= 10000 ? Math.round(v / 1000) + ' k€' : formats.ca(v));

  const crans = [0, 0.5, 1];
  const grille = crans.map(f => `<line class="rgd-grille" x1="${gauche}" x2="${L - droite}"
    y1="${y(f).toFixed(1)}" y2="${y(f).toFixed(1)}"></line>`).join('');
  const axeG = crans.map(f => `<text class="rgd-axe" x="${gauche - 9}" y="${(y(f) + 4).toFixed(1)}"
    text-anchor="end">${Math.round(f * hautN)}</text>`).join('');
  const axeD = crans.map(f => `<text class="rgd-axe" x="${L - droite + 9}"
    y="${(y(f) + 4).toFixed(1)}">${esc(etiqCa(f * hautCa))}</text>`).join('');

  // ⚠ LE MOIS SANS SON ANNÉE : à douze colonnes, « déc. 25 » et « janv. 26 »
  // se marchaient dessus. L'en-tête de la carte porte déjà la période.
  const court = (m) => String(m.label).replace(/\s*\d{2}$/, '');
  const legendes = mois.map((m, i) => `<text class="rgd-axe" x="${x(i).toFixed(1)}" y="${H - 8}"
    text-anchor="middle">${esc(court(m))}</text>`).join('');

  // La période montrée par les tuiles, marquée sur le graphique : sans cela
  // les tuiles parlent d'un mois que rien ne désigne parmi les douze.
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
  // ⚠ LE MOIS EN COURS EST INCOMPLET : son segment est en pointillé et son
  // point reste creux. Sans cela, chaque début de mois dessine sept
  // effondrements. ⚠ ET IL SE RECONNAÎT À SA CLÉ, PAS À SON RANG : en vue
  // Exercice la liste va jusqu'en septembre, huit mois après aujourd'hui ;
  // keyé sur le dernier indice, plus rien n'aurait été marqué.
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
      const finEnCours = mois[pts[pts.length - 1][2]].cle === cleEnCours && pts.length > 1;
      const plein = finEnCours ? pts.slice(0, -1) : pts;
      const bout = finEnCours ? pts.slice(-2) : null;
      return (plein.length > 1 ? `<path class="rgd-trait" style="stroke:${se.c2}" fill="none" d="${vers(plein)}"></path>` : '')
        + (bout ? `<path class="rgd-trait" style="stroke:${se.c2}" fill="none"
             stroke-dasharray="4 4" d="${vers(bout)}"></path>` : '');
    }).join('');
    const ronds = suites.flat().map(p => {
      const enCours = mois[p[2]].cle === cleEnCours;
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${enCours ? 4.2 : 3}"
        style="fill:${enCours ? 'var(--card)' : se.c2};stroke:${se.c2}"
        stroke-width="${enCours ? 2.2 : 0}"></circle>`;
    }).join('');
    return `<g class="rgd-ob-serie" data-serie="${esc(se.champ)}">${traits}${ronds}</g>`;
  }).join('');

  // ⚠ UNE SEULE BULLE POUR TOUTES, et c'est elle qui répond à l'enchevêtrement :
  // au lieu de suivre une courbe de l'œil jusqu'à son mois, on pointe le mois et
  // on lit les sept lignes. Elle se pose du côté OPPOSÉ au curseur, sans quoi
  // elle cacherait justement ce qu'on désigne.
  //
  // ⚠ LE `<title>` RESTE SOUS LA BULLE : la bulle naît du survol, que le
  // doigt n'a pas. Sur téléphone, l'appui long reste le seul moyen de lire.
  // ⚠ LA BULLE EST ÉCRITE EN UNITÉS DU `viewBox`, PAS EN PIXELS, et c'est ce
  // qui a trompé : le cadre fait 940 de large pour environ 1215 px à l'écran,
  // donc tout ce qu'on écrit ici est AGRANDI D'UN TIERS. À sept lignes de 16,
  // elle faisait 253 × 176 px et couvrait les deux tiers de la hauteur du
  // graphique (Élodie, 10/11/2026 : « les éléments sont beaucoup trop gros »).
  // Elle en fait maintenant 191 × 141. Si on y ajoute une huitième ligne un
  // jour, c'est `LIG` qu'il faut regarder, pas `HB`.
  const LIG = 12.5, LB = 148, HB = 34 + (SERIES.length - 1) * LIG;
  const survols = mois.map((m, i) => {
    if (!SERIES.some(se => connu(m[se.champ]))) return '';
    const cx = x(i);
    const bx = cx < L / 2 ? Math.min(cx + 14, L - LB - 2) : Math.max(cx - LB - 14, 2);
    const lignes = SERIES.map((se, k) => {
      const v = m[se.champ];
      return `<text class="rgd-bulle-mois" style="font-size:9.5px;opacity:.72" x="9" y="${28 + k * LIG}">${esc(se.label)}</text>
        <text class="rgd-bulle-ca" style="font-size:10px" x="${LB - 9}" y="${28 + k * LIG}"
          text-anchor="end">${connu(v) ? esc(formats[se.champ](v)) : '—'}</text>`;
    }).join('');
    const dit = SERIES.map(se => `${se.court} ${connu(m[se.champ]) ? formats[se.champ](m[se.champ]) : '—'}`).join(' · ');
    return `<g class="rgd-mois">
      <rect class="rgd-zone" x="${(cx - pas / 2).toFixed(1)}" y="0" width="${pas.toFixed(1)}" height="${bas}"></rect>
      <g class="rgd-info">
        <line class="rgd-ob-guide" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${cime - 6}" y2="${bas}"></line>
        <g transform="translate(${bx.toFixed(1)},6)">
          <rect width="${LB}" height="${HB}" rx="9" class="rgd-bulle"></rect>
          <text class="rgd-bulle-mois" style="font-size:10px" x="9" y="14.5">${esc(m.label)}</text>
          ${lignes}
        </g>
      </g>
      <title>${esc(m.label)} · ${esc(dit)}</title>
    </g>`;
  }).join('');

  return `<div class="rgd-ob-graphe"><svg class="rgd-courbe" viewBox="0 0 ${L} ${H}" role="img"
    aria-label="Les sept indicateurs mois par mois">
    ${grille}${bande}${axeG}${axeD}${legendes}${courbes}${survols}
  </svg></div>`;
}

// ---------------------------------------------------------------- Les tuiles
// ⚠ C'EST LE VISUEL DU BILAN COMMERCIAL, REPRIS TEL QUEL À SA DEMANDE
// (10/11/2026, Élodie : « j'adore cette présentation et je voudrais que ces
// encadrés soient en dessus de la pipeline »). Les classes `rgd-bil-tuile`,
// `rgd-bil-lib`, `rgd-bil-gros`, `rgd-bil-anneau` viennent de là.
//
// ⚠ ET CETTE FOIS L'EMPRUNT EST SÛR, alors qu'il avait échoué le 10/11 au
// matin : ce jour-là une autre session était EN TRAIN de redessiner ces tuiles
// (dégradés, texte blanc) et les miennes en héritaient à moitié — elles
// s'affichaient blanc sur blanc. Le dessin est maintenant arrêté, c'est celui
// qu'Élodie a choisi, et les tuiles du bilan ont été RETIRÉES de leur carte :
// plus personne ne bouge sous nos pieds, et il n'y a plus qu'un seul endroit
// où ce dessin vit.
//
// ⚠ LE DÉGRADÉ VIENT DE `SERIES`, PAS D'UNE CLASSE `t-*` : sept couleurs, et
// chacune doit être la même que celle de sa courbe. Deux endroits où écrire la
// couleur, c'est un endroit de trop.
const lirePct = (part) => (part > 0 && part < 1
  ? part.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : String(Math.round(part)));

function anneau(part, legende) {
  const p = Math.max(0, part || 0);
  const trace = Math.min(100, p > 0 ? Math.max(2, p) : 0);
  return `<svg class="rgd-bil-anneau" viewBox="0 0 36 36" role="img" aria-label="${lirePct(p)} % ${esc(legende)}">
      <circle cx="18" cy="18" r="15" class="fond"></circle>
      ${trace > 0 ? `<circle cx="18" cy="18" r="15" class="plein" pathLength="100"
        stroke-dasharray="${trace.toFixed(1)} ${(100 - trace).toFixed(1)}" transform="rotate(-90 18 18)"></circle>` : ''}
      <text x="18" y="18.5" text-anchor="middle" class="pct">${lirePct(p)} %</text>
      <text x="18" y="25" text-anchor="middle" class="leg">${esc(legende)}</text>
    </svg>`;
}

/**
 * La carte entière : sept tuiles, un graphique, les taux et le mode d'emploi.
 *
 * ⚠ LE MOIS EN COURS EST INCOMPLET PAR CONSTRUCTION : le 10 novembre, « 5 % »
 * n'est pas un échec, c'est le dixième jour. L'en-tête le dit, parce que sans
 * cela la carte annonce une catastrophe tous les débuts de mois.
 */
// ⚠ LE MOIS AFFICHÉ SE CHOISIT (05/11/2026, Élodie : « pour la section
// objectifs du mois je voudrais pouvoir sélectionner les mois précédents »).
// Le choix vit ici, hors de `draw`, pour survivre aux rafraîchissements de
// l'écran ; `null` = le mois en cours.
let moisObjectifChoisi = null;
// ⚠ MOIS OU EXERCICE (10/11/2026, Élodie : « je voudrais avoir une option dans
// la section des objectifs du mois pour avoir le cumul de chiffre d'affaires de
// l'année comptable »). La carte « Chiffre d'affaires » qui vivait en dessous a
// été retirée dans le même mouvement : son exercice se lit ici, et le détail
// par exercice dans « Bilan commercial ».
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
  const formats = Object.fromEntries(SERIES.map(se => [se.champ, se.euro ? euros : nombre]));

  // ⚠ L'EXERCICE COMPTABLE, PAS L'ANNÉE CIVILE : 1er octobre → 30 septembre.
  // Les douze mois glissants couvrent toujours l'exercice en cours, qui en
  // compte douze au plus — il n'y a donc rien d'autre à relever en base.
  const ex = exercice();
  const dansEx = mois.filter(m => m.cle >= ex.du.slice(0, 7) && m.cle <= ex.au.slice(0, 7));
  const vue = dansEx.length ? vueObjectif : 'mois';

  // ⚠ LE CUMUL D'UN EXERCICE N'EST PAS UNE SOMME POUR LES CHANTIERS : un
  // client qui signe en octobre puis en novembre est UN chantier sur l'exercice.
  // C'est déjà la règle de `tauxPeriode`, et additionner les mois gonflerait
  // le cumul — on fait donc l'union des clés, comme là-bas. Les DEVIS, eux,
  // s'additionnent : deux devis restent deux devis.
  //
  // ⚠ ET UN MOIS INCONNU N'EST PAS UN ZÉRO : si aucun mois de l'exercice ne
  // porte la donnée, le cumul vaut `null` et la tuile affiche « — ». Les
  // demandes ne sont suivies que depuis mars 2026, les visites depuis août.
  const cumul = (champ) => {
    if (champ === 'chantiers') return new Set(dansEx.flatMap(m => m.clientsSignes || [])).size;
    const connus = dansEx.map(m => m[champ]).filter(v => v !== null && v !== undefined);
    return connus.length ? connus.reduce((a, b) => a + b, 0) : null;
  };
  const valeur = (champ) => (vue === 'exercice' ? cumul(champ) : courant[champ]);

  // ⚠ L'OBJECTIF D'UN EXERCICE EST CELUI DE L'ANNÉE ENTIÈRE, pas au prorata
  // des mois écoulés : c'est ce que dit déjà le bilan commercial en dessous
  // (« sur 120 cette année »), et deux cartes du même écran qui divisent le
  // même objectif autrement ne se réconcilient jamais à l'œil. Le « mois N sur
  // 12 » de l'en-tête dit où l'on en est dans l'année.
  //
  // ⚠ EN VUE EXERCICE, LE GRAPHIQUE PREND LE CADRE DE L'ANNÉE COMPTABLE
  // (10/11/2026, Élodie : « juste pour l'exercice je voudrais que le graphique
  // s'adapte à la période du 1er octobre au 30 septembre »). Douze cases,
  // octobre → septembre, et non plus les douze mois glissants.
  //
  // ⚠ LES MOIS À VENIR RESTENT VIDES, ILS NE VALENT PAS ZÉRO. Une courbe qui
  // retombe à zéro sur les huit mois qui n'ont pas encore eu lieu se lirait
  // comme un effondrement ; elle s'arrête donc au mois en cours, et les cases
  // suivantes restent en blanc.
  //
  // ⚠ ET LA FENÊTRE GLISSANTE SUFFIT À LA REMPLIR : l'exercice en cours a au
  // plus douze mois, son premier est donc toujours dans les douze derniers.
  const moisExercice = () => {
    const a = Number(ex.du.slice(0, 4));
    const vide = Object.fromEntries(SERIES.map(se => [se.champ, null]));
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(a, 9 + i, 1);
      const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return mois.find(m => m.cle === cle) || {
        cle, label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), ...vide,
      };
    });
  };

  const periode = vue === 'exercice'
    ? { cible: (se) => obj[se.cible] * 12, cles: dansEx.map(m => m.cle),
        titre: 'Objectifs de l’exercice', note: `mois ${dansEx.length} sur 12`,
        quand: `Exercice ${ex.label}` }
    : { cible: (se) => obj[se.cible], cles: [courant.cle],
        titre: 'Objectifs du mois',
        note: enCours ? `jour ${jour} sur ${joursDuMois}` : 'mois terminé',
        quand: courant.label };

  // ⚠ TROIS FORMES DE TUILE, TOUTES PRISES AU BILAN COMMERCIAL, AUCUNE NEUVE :
  //   • celles qui ont un objectif (demandes, rendez-vous, devis envoyés,
  //     chantiers, CA facturé) : le nombre, « sur X », l'anneau d'avancement ;
  //   • « Devis signés » : le nombre et le TAUX de signature dans l'anneau,
  //     l'objectif de taux en bas — la tuile bleue du bilan, à l'identique ;
  //   • « CA encaissé » : la part du CA facturé qui est rentrée.
  //
  // ⚠ LE CLIC NE CHANGE PAS DE PORTE : `data-ob-detail` et `data-ob-cles` sont
  // lus par le gestionnaire posé sur `root`, qui ne regarde ni la balise ni la
  // classe.
  const pct1 = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
  const tuile = (se) => {
    const v = valeur(se.champ);
    const connu = v !== null && v !== undefined;
    const formate = formats[se.champ];
    // Au survol, les premiers noms ; au clic, la liste complète. Sur un
    // exercice, les listes de ses mois mises bout à bout.
    const lignes = periode.cles.flatMap(c => detailMoisObjectif(c, se.champ).lignes);
    const noms = [...new Set(lignes.map(l => l.client))];
    const bulle = lignes.length
      ? `${noms.slice(0, 6).join(', ')}${noms.length > 6 ? ` et ${noms.length - 6} autre${noms.length > 7 ? 's' : ''}` : ''} — cliquer pour le détail`
      : (vue === 'exercice' ? 'Rien sur cet exercice' : 'Rien ce mois-ci');

    let sous = '', rond = '', bas = '';
    if (se.cible) {
      const cible = periode.cible(se);
      sous = `sur ${esc(formate(cible))}`;
      rond = anneau(connu && cible > 0 ? (v / cible) * 100 : 0, 'de l’objectif');
    } else {
      // Un taux : le repère n'est pas un objectif mais l'étape d'avant.
      const base = valeur(se.taux);
      const p = connu ? pct1(v, base) : null;
      const quoi = se.champ === 'encaisse' ? 'du CA facturé' : 'des devis envoyés';
      // ⚠ PAS D'ANNEAU QUAND LE TAUX N'EXISTE PAS, et surtout pas un anneau
      // à zéro : en novembre 2026, deux devis signés et AUCUN parti dans le
      // mois donnaient « 2 » surmonté de « 0 % signés ». Le taux n'est pas
      // nul, il n'a pas de dénominateur — ces devis étaient partis avant.
      sous = p === null ? '' : `${lirePct(p)} % ${quoi}`;
      rond = p === null ? '' : anneau(p, se.champ === 'encaisse' ? 'encaissé' : 'signés');
      if (se.champ === 'nbDevisSignes' && obj.envoyes > 0) {
        bas = `objectif ${lirePct(pct1(obj.devis, obj.envoyes))} %`;
      }
    }
    return `<article class="rgd-bil-tuile rgd-bil-clic rgd-ob-tuile"
      style="--c1:${se.c1};--c2:${se.c2}"
      data-ob-detail="${se.champ}" data-ob-cles="${esc(periode.cles.join(','))}"
      data-ob-quand="${esc(periode.quand)}"
      role="button" tabindex="0" title="${esc(bulle)}">
      <div class="rgd-bil-lib">${esc(se.label)}</div>
      <div class="rgd-bil-ligne">
        <div><div class="rgd-bil-gros">${connu ? esc(formate(v)) : '—'}</div>
          ${sous ? `<div class="rgd-bil-sur">${sous}</div>` : ''}</div>
        ${rond}
      </div>
      <div class="rgd-bil-bas">${bas || '&nbsp;'}</div>
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
                par mois — un taux mensuel est du bruit, pas une mesure. */ ''}
          <p class="small muted rgd-ob-taux">Sur douze mois :
            <b>${pc(t.demandesVersRdv)}</b> des demandes ont donné un rendez-vous,
            <b>${pc(t.rdvVersSignes)}</b> des rendez-vous un devis signé,
            <b>${pc(t.envoyesVersSignes)}</b> des devis envoyés sont signés
            (${t.envoyes} envoyés, ${t.signes} signés)${t.panier === null ? ''
              : `. Un devis signé rapporte <b>${esc(eur(t.panier))}</b> en moyenne`}.</p>

          ${/* ⚠ PAS DE LÉGENDE SOUS LE GRAPHIQUE : les tuiles au-dessus en
                tiennent lieu, chacune à la couleur de sa courbe.
                ⚠ PAS DE BANDE EN VUE EXERCICE : le cadre EST l'exercice, la
                marquer en entier ne désignerait rien. */ ''}
          ${grapheObjectifs(vue === 'exercice' ? moisExercice() : mois, formats,
            vue === 'exercice' ? [] : periode.cles, dernier.cle)}

          <p class="small muted rgd-ob-pied">Chaque mois compte ce qui s’y est <b>passé</b> :
          demandes reçues, rendez-vous tenus, devis partis, devis signés, factures émises,
          paiements reçus. Un <b>rendez-vous</b> est une visite technique, la même que la
          colonne « RDV » du pipeline. <b>« Devis signés » compte des devis, « Chantiers »
          des clients</b> : deux devis d’un même client font deux devis et un chantier.
          Le <b>CA facturé</b> se date de l’émission de la facture, le <b>CA encaissé</b> du
          jour où l’argent est arrivé : les deux courbes ne se suivent pas, et c’est normal.
          Sur le graphique, les <b>comptages se lisent à gauche</b> et les <b>deux montants
          à droite</b>, en euros. Survolez un mois pour avoir les sept chiffres, ou une
          tuile pour isoler sa courbe.
          ${vue === 'exercice'
            ? 'Le graphique couvre l’exercice, du 1<sup>er</sup> octobre au 30 septembre : les mois à venir restent vides, ils ne valent pas zéro.'
            : 'Le graphique couvre les douze derniers mois.'}
          Un mois sans point veut dire que le CRM n’a pas la donnée, pas qu’elle vaut zéro ; le mois
          en cours est le dernier point, d’où son pointillé.
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
      // ⚠ ET LES DEUX RÉGLAGES DEVENUS INERTES ONT ÉTÉ RETIRÉS LE MÊME JOUR
      // (Élodie : « corrige les deux réglages inertes ») : `manual_ca_ht_exercice`
      // et `manual_clients_actifs` ne se saisissent plus. Ils étaient les SEULS
      // affichages de cette carte, et un champ qui s'enregistre sans que rien ne
      // change se lit comme une panne. Le tableau « Ce qui n'est pas réglable
      // ici », dans les réglages, dit où ils sont passés.

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
      const etapes = etapesRgd()
        .filter(e => !ETAPES_HORS_FRISE.includes(e.key))
        .map(e => ({
        ...e, cle: e.key,
        couleur: (COULEURS[e.key] || {}).c || 'var(--accent)',
        petant: (COULEURS[e.key] || {}).p || 'var(--accent)',
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
        ${/* ⚠ LE BANDEAU « À REPRENDRE » A QUITTÉ CET ÉCRAN LE JOUR OÙ IL Y EST
              ARRIVÉ (11/11/2026, Élodie : « enlève "à reprendre" dans la vue
              d'ensemble, je voudrais les retrouver les "à reprendre" dans la
              fiche projet »). Il vit désormais dans la fiche, au-dessus des
              factures du dossier — voir `blocReprise` dans rgd-devis-crm.js.
              Ne pas le ramener ici sans elle. */ ''}
        ${/* ⚠ L'ORDRE DE L'ÉCRAN, ARRÊTÉ PAR ÉLODIE LE 10/11/2026 : le pipeline
              et la journée d'abord, les objectifs EN DESSOUS, le bilan en
              dernier. Les tuiles sont montées tout en haut pendant une heure ce
              jour-là, puis elle a tranché l'inverse : « les objectifs du mois
              doivent être en dessous de la pipeline et des rendez-vous du
              jour ». Ne pas les faire remonter.

              Et cet ordre a sa logique : le pipeline dit où en sont les affaires
              AUJOURD'HUI — c'est ce qu'on ouvre le matin —, les objectifs à
              quel RYTHME elles entrent, le bilan ce que ce rythme a produit sur
              l'année. Du jour à l'année, de haut en bas.

              ⚠ LA JOURNÉE EST À DROITE DU PIPELINE, pas des objectifs : ceux-ci
              prennent toute la largeur, leurs sept tuiles tiennent sur une
              seule ligne. */ ''}
        <div class="rgd-duo">

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

${carteObjectifs(moisObj, objectifs)}

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
        <thead><tr><th>Date</th><th>Client</th><th>${se.euro ? 'Facture'
          : ['nbDevisEnvoyes', 'nbDevisSignes', 'chantiers'].includes(se.champ) ? 'Devis' : 'Détail'}</th>${avecMontant ? '<th class="num">Montant HT</th>' : ''}</tr></thead>
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
