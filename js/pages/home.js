// Tableau de bord du groupe : ce qui s'est passé sur la période, structure par
// structure, puis ce qu'il y a à faire aujourd'hui. Tous les chiffres viennent de
// js/data/chiffres.js — la vue d'ensemble de Pilotage lit la même source.
import { db } from '../data/db.js';
import { chargerChart } from '../chart.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS } from '../data/schema.js';
import { propertyMetrics, loanStatus } from '../data/finance.js';
import {
  // ⚠ `entonnoir`, `entonnoirParCohorte` et `structuresHorsEntonnoir` NE SONT
  // PLUS IMPORTÉS depuis le 18/11/2026 : leur unique lecteur, « Pipeline &
  // conversion », a été retiré. Elles restent dans chiffres.js avec leurs
  // contrôles — les retirer d'ici évite de croire que cet écran les dessine
  // encore.
  chiffres, total, caMois, leadsMois, derniersMois, moisCle, moisPrecedent,
  objectifs, objectif, objectifAnnuel, enregistrerObjectifs, ecoule, anneeEnCours, CLES_VISIBLES,
  rdvMois, signeesMois, periodePrecedente, moisEnCours, externe, exerciceDe,
  // Les quatre cartes ajoutées le 12/11/2026. Elles rendent `null` quand la
  // structure filtrée ne porte pas la donnée : l'écran masque la carte.
  // ⚠ `envoisAuto` N'EST PLUS IMPORTÉ depuis le 17/11/2026 : son unique
  // lecteur, la tuile « Ce qui part tout seul », a été retiré. La fonction
  // reste dans chiffres.js avec ses contrôles — la retirer d'ici évite de
  // croire que le tableau de bord surveille encore les envois.
  cheminDesSignes, publicite, argentConnu, cumulMensuel, detailsPeriode, reseauApporteurs,
} from '../data/chiffres.js';
// `finDe` tient compte de la fin déclarée à la main et des jours ouvrés d'une
// formation : refaire ce calcul ici donnerait une date différente du planning.
import { finDe } from '../data/rgd-planning.js';
// Les objectifs de volume de RGD : un seul écrivain, partagé avec Réglages RGD.
import { objectifsMensuels, enregistrerObjectifsMensuels } from '../data/rgd-objectifs.js';
import {
  esc, eur, daysSince, periodRange, inRange, isoDay,
  openModal, closeModal, toast,
} from '../ui.js';
import { activeInMonth, rowOf, dueOf, receivedOf, balanceOf } from './locatif.js';
import {
  idsDe, idsDeTous, structuresRaccordees, cadreJour, noteAgenda, modeEmploi,
  champsAgendas, enregistrerAgendas, peutRaccorder,
} from '../agenda.js';
import { lignesEnregistrees, derniereSync, agendasDe, jourCle } from '../agenda-sync.js';
// ⚠ LA GRILLE HEBDOMADAIRE VIENT DE L'ÉCRAN AGENDA, ce n'est pas une copie :
// elle sait déjà placer deux rendez-vous qui se chevauchent côte à côte, tracer
// l'heure qu'il est et choisir sa plage horaire selon ce qu'il y a dedans. Deux
// calendriers hebdomadaires dans la même application auraient divergé au
// premier correctif.
import { grille } from './rgd-agenda.js';
import { creerAgendaPersonnel } from '../comptes.js';

const LS_FILTRE = 'crm_home_filtre';
// ⚠ « PATRIMOINE » N'EST PAS UNE STRUCTURE (17/11/2026, Élodie : « ça doit
// être une nouvelle vue, ne mélange pas les structures »). Les biens, les prêts
// et les baux ne portent AUCUNE activité : `cartePatrimoine()` ne recevait
// même pas la structure filtrée, et s'affichait donc à l'identique dans RGD
// Renova, BTP Expertise, La Référence Courtage et Propulsion — donnant à lire
// comme patrimoine d'entreprise ce qui est celui de Mickael.
const VUE_PATRIMOINE = 'patrimoine';
const peutPatrimoine = () => scope.canPatrimony || scope.canRental;
const BASE_PROSPECTS = {
  rgd: '#/rgd/clients',         // Clients & prospects → l'écran Clients du CRM (repris de l'application)
  btp: '#/btp/base',
  courtage: '#/courtage/base',
  propulsion: '#/pipeline/propulsion',
};
// Les périodes du tableau de bord (04/11/2026, demandé par Élodie : « le mois
// dernier », et « la possibilité de voir sur l'année ou le trimestre, c'est
// tout »), puis « pouvoir sélectionner une période mensuelle aussi ».
//
// ⚠ « MOIS » OUVRE SUR LE MOIS EN COURS DEPUIS LE 12/11/2026, et ce
// commentaire garde la trace du revirement parce qu'il annule une demande
// précédente de la même personne. Le choix initial — le mois DERNIER, clos,
// dont les chiffres ne bougent plus — se défendait seul. Mais la vue
// d'ensemble RGD (`pages/rgd-pilotage.js`) ouvre, elle, sur le mois EN COURS :
// le même mot désignait donc deux mois différents d'un écran à l'autre, et pas
// un seul des sept indicateurs ne coïncidait alors que les calculs sont les
// mêmes. Élodie a tranché pour le mois en cours.
//
// ⚠ NE PAS REVENIR EN ARRIÈRE SANS TOUCHER L'AUTRE ÉCRAN : remettre le mois
// dernier ici recréerait le désaccord. Les deux écrans ouvrent ensemble ou
// changent ensemble. Le mois dernier reste à un clic, dans la liste.
const PERIODES_TB = [['mois', 'Mois'], ['quarter', 'Trimestre'], ['year', 'Année']];
const moisDernier = () => { const d = new Date(); return moisCle(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
// La période affichée. Un mois choisi se lit comme n'importe quelle période.
// ⚠ « Année » sur RGD Renova seule = son exercice (1er octobre → 30 septembre).
const plageDe = (state, cles = []) => {
  if (state.periode === 'year' && cles.length === 1 && exerciceDe(cles[0]).label.includes('–')) {
    const ex = exerciceDe(cles[0]);
    return { start: ex.start, end: ex.end };
  }
  if (state.periode !== 'mois') return periodRange(state.periode);
  const [a, m] = state.mois.split('-').map(Number);
  return { start: new Date(a, m - 1, 1), end: new Date(a, m, 1) };
};
const pct = (v) => Math.round((v || 0) * 100);
const eur2 = (n) => eur(n, { maximumFractionDigits: 2 });

// Micro-courbe des douze derniers mois, posée au fond d'un indicateur : le chiffre
// du mois ne dit pas s'il s'agit d'une tendance ou d'un accident.
function spark(serie, couleur, cls = 'tb-spark') {
  if (!serie.some(v => v)) return '';
  const w = 200, h = 34, mn = Math.min(...serie), mx = Math.max(...serie), sp = (mx - mn) || 1;
  const pts = serie.map((v, i) => [i / (serie.length - 1) * w, h - 2 - ((v - mn) / sp) * (h - 9)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d} L${w} ${h} L0 ${h} Z" fill="${couleur}" opacity=".11"></path>
    <path d="${d}" fill="none" stroke="${couleur}" stroke-width="1.6" stroke-linejoin="round"
      stroke-linecap="round" vector-effect="non-scaling-stroke"></path></svg>`;
}
const delta = (v, points = false) => {
  if (v === null) return '<span class="tb-d neutre">—</span>';
  if (!v) return '<span class="tb-d neutre">=</span>';
  // Passé quelques centaines de pour cent, le pourcentage ne se lit plus : « ×15 » si.
  const txt = !points && v > 400 ? '×' + Math.round(v / 100 + 1)
    : `${v > 0 ? '+' : ''}${v}${points ? ' pts' : ' %'}`;
  return `<span class="tb-d ${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲ ' : '▼ '}${txt}</span>`;
};
const evolution = (avant, apres) => {
  if (!avant) return apres ? null : 0;
  return Math.round((apres - avant) / avant * 100);
};

export const homePage = {
  title: () => 'Tableau de bord',
  render(root) {
    root.classList.add('ecran-tb');
    let chart = null;
    const state = {
      periode: 'mois',
      // ⚠ LE MOIS EN COURS, ET C'EST UN REVIREMENT ASSUMÉ (12/11/2026). Cet
      // écran ouvrait sur le mois DERNIER depuis le 04/11, à la demande
      // d'Élodie : un mois clos ne bouge plus. Mais la vue d'ensemble RGD, elle,
      // ouvre sur le mois EN COURS — et le même mot « Mois » désignait donc
      // deux mois différents d'un écran à l'autre. Pas un seul des sept
      // indicateurs ne coïncidait, alors que les calculs sont identiques :
      // « tu ne reprends pas du tout les informations qu'il y a dans le CRM de
      // RGD Renova, je veux qu'elles soient SYNCHRONISÉES ». Elle a tranché
      // pour le mois en cours. Le mois dernier reste à un clic, dans la liste.
      mois: moisCle(),
      filtre: (() => { try { return localStorage.getItem(LS_FILTRE) || 'groupe'; } catch { return 'groupe'; } })(),
      // La semaine montrée par « Ma semaine », en nombre de semaines à partir
      // de celle-ci. ⚠ ELLE NE SURVIT PAS À LA FERMETURE, délibérément : un
      // tableau de bord qui rouvre sur la semaine dernière ne dit plus ce qui
      // arrive, et c'est ce qu'on lui demande.
      sem: 0,
    };

    const draw = () => {
      const visibles = CLES_VISIBLES();
      // ⚠ LE FILTRE SURVIT DANS `localStorage`, ET IL SURVIT AU COMPTE : une
      // clé « patrimoine » posée par Mickael sur un navigateur partagé, ou un
      // accès retiré depuis, doit retomber sur « Groupe » plutôt qu'ouvrir une
      // vue vide. On vérifie le DROIT, pas seulement la valeur.
      const vueP = state.filtre === VUE_PATRIMOINE && peutPatrimoine();
      if (state.filtre === VUE_PATRIMOINE && !vueP) state.filtre = 'groupe';
      if (!vueP && state.filtre !== 'groupe' && !visibles.includes(state.filtre)) state.filtre = 'groupe';
      const cles = state.filtre === 'groupe' || vueP ? visibles : [state.filtre];
      const r = plageDe(state, cles);
      const deals = scope.deals();
      const t = total(cles, r, deals);

      // Comparaison : la même période, un cran plus tôt. Seul le mois est comparé
      // mois à mois ; sur « Tout » la comparaison n'a pas de sens.
      const avant = total(cles, periodePrecedente(r), deals);
      const moisSerie = derniersMois(12);
      const serieDe = (f) => moisSerie.map(m => f(m.cle));
      const caDu = (cle) => cles.reduce((s, k) => s + caMois(k, cle, deals), 0);

      // ⚠ `enFiltre` COMMANDE TOUTE LA MOITIÉ HAUTE DE L'ÉCRAN (17/11/2026).
      // Élodie : « supprime pipeline & conversion, publicité meta et les
      // encadrés demandes, rendez-vous, affaires signées et ca facturé ht ».
      // C'est la VUE GROUPE qu'elle vide, pas les vues filtrées : dans l'espace
      // RGD ces quatre nombres sont le résumé du mois, et la pub Meta y est la
      // seule trace des campagnes. Un seul booléen pour les cinq blocs, parce
      // qu'ils partent et reviennent ensemble.
      const enFiltre = state.filtre !== 'groupe';
      // ⚠ CALCULÉ ICI PARCE QUE DEUX CARTES EN DÉPENDENT, et pas seulement
      // pour l'afficher : sa présence décide de la largeur de « Ma semaine » et
      // de l'enjambement des objectifs. L'appeler deux fois relirait les devis,
      // les paiements et les factures pour rien.
      const argent = vueP ? '' : carteArgent(cles, r, state);
      // ⚠ « MA JOURNÉE » SE COLLE SOUS LE CHEMIN DE L'ARGENT QUAND LES DEUX
      // CONDITIONS SONT RÉUNIES, dans TOUTES les vues depuis le 17/11/2026
      // (Élodie : « fais pareil pour ma journée dans la vue de rgd renova »).
      // Sans chemin de l'argent, les objectifs prennent les 12 colonnes et rien
      // ne peut se glisser à côté ; sans pilotage, il n'y a pas de carte à
      // faire enjamber et les deux sont déjà collées. Dans ces deux cas
      // « Ma semaine » reprend les 12 colonnes.
      const semaineCollee = !!argent && scope.canPilotage;
      const objectifs = scope.canPilotage ? carteObjectifs(cles, deals, semaineCollee) : '';
      // ⚠ ON NE S'ÉTIRE QUE S'IL Y A UNE FRISE À NOURRIR. Sans objectif fixé,
      // la carte n'affiche qu'une phrase — étirée sur la hauteur des deux
      // rangées, elle devenait un rectangle blanc de 670 px. Vu en démo, où
      // aucun objectif n'est saisi. La frise des douze mois est le seul élément
      // qui sache absorber de la hauteur : sa présence EST la condition.
      const etire = semaineCollee && objectifs.includes('ob-frise');
      const obj = cles.reduce((s, k) => s + objectif(k, r), 0);
      const sources = cles.map(k => chiffres(k, r, deals)).filter(x => x.source);

      root.innerHTML = `
        ${db.demo ? '<div class="demo-banner"><b>Mode démo</b> — données d\'exemple stockées dans ce navigateur.</div>' : ''}

        ${/* ⚠ LE FOND QUI DÉRIVE VIT DANS L'ÉCRAN, PAS DANS LA PAGE (12/11/2026,
              Élodie : « ça c'est super, branche-la »). Il est posé ici et non
              dans `index.html` pour qu'il disparaisse avec le tableau de bord :
              trois halos flous en `position:fixed` derrière TOUTES les pages
              coûteraient cher sur téléphone pour un écran qu'on ne regarde
              pas. `aria-hidden` parce qu'il ne dit rien. */ ''}
        <div class="tb-fond" aria-hidden="true"><span class="tb-tache t1"></span><span class="tb-tache t2"></span><span class="tb-tache t3"></span></div>

        <header class="tb-hero">
          <div class="tb-salut">
            <h1>${prenomDe(scope.user)}<span>${vueP ? 'voici ce que vous d\u00e9tenez.' : esc(phraseHero(state, cles))}</span></h1>
            ${/* ⚠ PAS DE PÉRIODE DANS CETTE VUE : un patrimoine est un ÉTAT, pas
                  un flux. La valeur du parc et le capital restant dû se lisent à
                  la seconde où l'on regarde, et les loyers sont ceux du mois en
                  cours quoi qu'on choisisse. Afficher « novembre 2026 » au-dessus
                  promettrait un filtre qui n'existe pas. */ ''}
            <p><span class="tb-vivant"></span>${vueP ? 'patrimoine et gestion locative · aujourd\'hui'
              : `${state.filtre === 'groupe'
              ? `les ${visibles.length} structures` : esc(ACTIVITIES[state.filtre].label)} · ${esc(periodeAffichee(state, cles))}`}</p>
          </div>
          <div class="tb-bfiltres">
            <div class="tb-chips">
              <button class="tb-chip" data-f="groupe" aria-pressed="${state.filtre === 'groupe'}">
                <span class="tb-glyph">G</span><span>Groupe</span></button>
              ${visibles.map(k => `<button class="tb-chip" data-f="${k}" aria-pressed="${state.filtre === k}" style="--marque:${ACTIVITIES[k].color}">
                <img class="tb-logo" src="assets/logos/${k}.png" alt="" data-cle="${k}"><span>${esc(ACTIVITIES[k].label)}</span></button>`).join('')}
              ${/* ⚠ LA PUCE N'APPARAÎT QUE POUR QUI A L'ACCÈS, et c'est déjà la
                    règle des sections « Patrimoine » et « Gestion locative » du
                    menu. Elle n'a pas de logo : ce n'est pas une marque. */ ''}
              ${peutPatrimoine() ? `<button class="tb-chip" data-f="${VUE_PATRIMOINE}" aria-pressed="${vueP}" style="--marque:#6366F1">
                <span class="tb-glyph">P</span><span>Patrimoine</span></button>` : ''}
            </div>
            ${vueP ? '' : `
            <div class="tb-periodes">
              <div class="seg tb-periode">${PERIODES_TB.map(([k, l]) => `<button data-p="${k}" class="${state.periode === k ? 'active' : ''}"${k === 'year' && cles.length === 1 && exerciceDe(cles[0]).label.includes('–') ? ` title="Exercice ${exerciceDe(cles[0]).label} : du 1er octobre au 30 septembre"` : ''}>${k === 'year' && cles.length === 1 && exerciceDe(cles[0]).label.includes('–') ? 'Exercice ' + exerciceDe(cles[0]).label : l}</button>`).join('')}</div>
              ${state.periode === 'mois' ? `<select class="tb-mois" id="tb-mois" aria-label="Choisir le mois">${derniersMois(24, new Date()).reverse().map(m => {
                const nom = new Date(m.cle + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                return `<option value="${m.cle}"${m.cle === state.mois ? ' selected' : ''}>${esc(nom)}${m.cle === moisCle() ? ' (en cours)' : m.cle === moisDernier() ? ' (mois dernier)' : ''}</option>`;
              }).join('')}</select>` : ''}
            </div>`}
          </div>
        </header>

        ${/* ⚠ DES TUILES DE TAILLES INÉGALES, ET CHACUNE PREND SA HAUTEUR. C'est
              ce qui distingue le bento du tableau de cartes d'avant : les deux
              colonnes figées ont disparu, « Ma semaine » et « À traiter »
              descendent avec le reste au lieu de former une colonne qui
              s'allongeait toute seule. */ ''}
        <div class="tb-bento">
          ${vueP ? taille(cartePatrimoine(), 'tb-x12') + `
          <section class="card tb-x12">
            <p class="muted small" style="margin:0">Le détail est dans
              <a href="#/patrimoine">Patrimoine</a> (biens, prêts, charges) et dans
              <a href="#/locatif">Gestion locative</a> (baux, loyers, impayés).</p>
          </section>` : `
          ${/* ⚠ LA RANGÉE S'ADAPTE, parce que « Le chemin de l'argent » peut être
                ABSENT : il part des chantiers signés sur la période, et un mois
                sans signature n'en a aucun — septembre 2026 était dans ce cas.
                Fixer les objectifs à 5 colonnes laisserait alors un trou de 7.
                Vu en démo, où aucun devis n'est signé dans le mois. */ ''}
          ${taille(argent, 'tb-x7')
              + (scope.canPilotage ? taille(objectifs, argent ? 'tb-x5' : 'tb-x12',
                  // ⚠ LES OBJECTIFS ENJAMBENT DEUX RANGÉES POUR QUE « MA JOURNÉE »
                  // VIENNE SE COLLER SOUS LE CHEMIN DE L'ARGENT (17/11/2026, Élodie :
                  // « je veux que ce soit collé le chemin de l'argent et ma journée »).
                  // Le blanc entre les deux ne venait PAS d'une marge : dans une
                  // grille, la hauteur d'une rangée est celle de sa carte la plus
                  // haute, et les objectifs dépassent le chemin de l'argent. « Ma
                  // journée », sur la rangée suivante, commençait donc sous le bas
                  // DES OBJECTIFS. Les faire enjamber rend à chaque colonne sa propre
                  // hauteur. Changer la marge n'y aurait rien fait.
                  //
                  // ⚠ ET C'EST L'ENJAMBEMENT QUI REND LES VUES FILTRÉES POSSIBLES.
                  // Sans lui, « Ma semaine » à 7 colonnes laissait 5 colonnes libres
                  // à sa droite, et le PREMIER des quatre encadrés (3 colonnes) y
                  // remontait — les trois autres laissaient un trou sur la rangée
                  // d'après. Les objectifs occupent maintenant ces 5 colonnes : les
                  // encadrés repartent proprement d'une rangée neuve.
                  //
                  // ⚠ ET `align-self: stretch` AVEC, depuis le 17/11/2026 : la
                  // grille pose `align-items: start`, donc la carte s'arrêtait à la
                  // hauteur de son contenu et la colonne de droite se terminait bien
                  // avant la gauche. Les deux vont ensemble — enjamber sans s'étirer
                  // ne fait que réserver de la place vide.
                  semaineCollee
                    ? `style="grid-row:span 2${etire
                        ? ';align-self:stretch;display:flex;flex-direction:column' : ''}"`
                    : '') : '')}

          ${/* ⚠ « MA JOURNÉE » EST REMONTÉE ICI LE 17/11/2026, sous le chemin de
                l'argent. Élodie : « je pense qu'il a plus sa place juste en
                dessous du chemin de l'argent ». Elle était tout en bas, après
                les chiffres du mois ; ce qu'on fait aujourd'hui passe donc
                avant ce qu'on a fait depuis le 1er. Dans TOUTES les vues : le
                même agenda ne doit pas se chercher selon la puce choisie.

                ⚠ SEPT COLONNES, ALIGNÉE SUR LA CARTE DU DESSUS. Élodie, le même
                jour : « je veux que ça prenne seulement la place en dessous du
                chemin de l'argent, même largeur », puis « fais pareil pour ma
                journée dans la vue de rgd renova » (la carte montre la semaine
                entière depuis le 19/11). C'est `semaineCollee` qui
                en décide, et il retombe à 12 colonnes sans chemin de l'argent
                ou sans accès pilotage — les deux cas où aucune carte ne peut
                tenir à sa droite.

                ⚠ CE COMMENTAIRE A DIT L'INVERSE PENDANT UNE HEURE : « 12
                colonnes dans les vues filtrées, par nécessité », parce que le
                premier des quatre encadrés (3 colonnes) remontait se coller à
                côté d'elle. C'est l'enjambement des objectifs qui l'a levé — ce
                sont eux qui occupent désormais ces 5 colonnes. Le placement de
                la grille reste « sparse » : un bloc libre n'est jamais comblé
                par une carte plus large que lui, mais il l'est par une plus
                étroite. Vérifier ce point avant de réduire une carte. */ ''}
          ${/* ⚠ EN VUE FILTRÉE, L'AGENDA DE LA STRUCTURE ET RIEN D'AUTRE
                (17/11/2026). Élodie : « je ne veux que les rendez-vous du jour
                du google agenda de rgd renova ». Deux changements, pas un :
                la carte ne reçoit plus que la structure filtrée — elle recevait
                toutes les structures visibles quelle que soit la puce — et elle
                laisse de côté les tâches horodatées du CRM, celles qui portent
                l'étiquette « CRM ».

                ⚠ CE QU'ON NE VOIT DONC PLUS DANS CES VUES : un rappel du CRM
                avec une heure (« Appeler le prospect à 9 h 30 »). Il n'est pas
                perdu — l'écran #/today le porte en entier, et la vue groupe
                continue de le mêler aux rendez-vous. C'est un choix de lecture,
                pas une suppression. */ ''}
          ${taille(carteSemaine(enFiltre ? cles : visibles, state.sem), semaineCollee ? 'tb-x7' : 'tb-x12')}

          ${/* ⚠ LES QUATRE ENCADRÉS NE SORTENT PLUS EN VUE GROUPE (17/11/2026).
                Ils donnaient le CUMUL des structures : quatre nombres du groupe
                qu'aucune décision ne suit, puisqu'on ne pilote pas « le groupe »,
                on pilote RGD, BTP ou Courtage. La carte « Qui tire le groupe »,
                plus bas, dit le même chiffre d'affaires RÉPARTI — c'est la
                lecture que la vue groupe peut avoir et que les autres non.
                Filtré sur une structure, ils reviennent intacts. */ ''}
          ${enFiltre ? `
            ${/* ⚠ LES MOTS SONT CEUX DE LA VUE D'ENSEMBLE RGD, pas les miens
                  (12/11/2026). « Leads » et « Demandes » désignaient le même
                  nombre, « RDV » et « Rendez-vous » aussi : deux écrans qui
                  nomment différemment la même chose se lisent comme deux chiffres
                  différents. Un seul vocabulaire, celui de l'écran métier. */ ''}
            ${kpi('Demandes', t.leadsNonDates ? t.leads : t.leadsPeriode,
              // Sans date d'arrivée, aucune évolution n'est calculable : mieux vaut
              // ne rien afficher qu'un pourcentage qui ne compare pas ce qu'il dit.
              t.leadsNonDates ? null : evolution(avant?.leadsPeriode, t.leadsPeriode),
              serieDe(cle => cles.reduce((s, k) => s + leadsMois(k, cle, deals), 0)),
              repartitionLeads(t, cles),
              false,
              t.leadsNonDates ? 'Total en base : ces outils ne datent pas l\'arrivée des prospects.' : '',
              cles.length === 1 ? BASE_PROSPECTS[cles[0]] : '',
              detailsPeriode(cles, r, 'demandes'))}
            ${kpi('Rendez-vous', t.rdv, evolution(avant?.rdv, t.rdv), serieDe(cle => cles.reduce((s, k) => s + rdvMois(k, cle, deals), 0)),
              'visites techniques tenues sur la période', false, '', '',
              detailsPeriode(cles, r, 'rdv'))}
            ${/* ⚠ CE NOMBRE COMPTE DES CLIENTS, PAS DES DEVIS, et c'est précisément
                  ce que la vue d'ensemble RGD appelle « Chantiers » — un client qui
                  signe deux devis fait UN chantier. Le mot « Affaires signées »
                  laissait croire à un compte de devis, et l'écart avec « Devis
                  signés » passait pour une erreur. On prend son mot quand la
                  structure a un espace à elle ; ailleurs, « affaires » reste le
                  terme générique du groupe. Et le compte par devis est dit juste
                  en dessous : les deux nombres de l'autre écran sont là. */ ''}
            ${/* ⚠ POUR RGD, CE N'EST PLUS LE COMPTE DES SIGNATURES (17/11/2026) :
                  c'est celui du PLANNING. Un devis signé en novembre dont le
                  chantier démarre en janvier n'est pas un chantier de novembre.
                  `t.signees` reste ce qu'il est — des clients qui ont signé — et
                  continue de nourrir le panier et le taux de transformation,
                  qui parlent bien de signatures. */ ''}
            ${kpi(cles.length === 1 && cles[0] === 'rgd' ? 'Chantiers' : 'Affaires signées',
              chantiersDuMois(cles, r, t) ?? '—',
              evolution(chantiersDuMois(cles, periodePrecedente(r), t), chantiersDuMois(cles, r, t)),
              serieDe(cle => cles.reduce((s, k) => s + signeesMois(k, cle, deals), 0)),
              sousChantiers(cles, r, t), false, '', '',
              detailsPeriode(cles, r, 'chantiers'))}
            ${kpi('CA facturé HT', eur(t.ca), evolution(avant?.ca, t.ca), serieDe(caDu),
              obj ? `objectif ${eur(obj)}` : scope.canPilotage ? 'aucun objectif fixé' : 'sur vos affaires', false, '', '',
              detailsPeriode(cles, r, 'ca'))}
          ` : ''}

          ${/* ⚠ « PIPELINE & CONVERSION » A ÉTÉ RETIRÉ LE 18/11/2026, et il n'en
                reste rien nulle part : la vue groupe l'avait perdu la veille, et
                ici il ne subsistait que comme REPLI, pour une structure dont la
                carte du réseau n'avait rien à dire. Cette carte sort désormais
                pour toutes les structures, même vide — le repli n'est donc plus
                jamais atteint, et du code qu'on ne peut plus atteindre ment sur
                ce que fait l'écran.

                ⚠ OÙ LE RETROUVER : le gabarit complet, ses cinq jalons, ses deux
                taux de passage et leur évolution sont dans le commit d'avant
                celui-ci. `entonnoir`, `entonnoirParCohorte` et
                `structuresHorsEntonnoir` restent dans data/chiffres.js avec
                leurs contrôles ; elles n'ont simplement plus de lecteur. Le jour
                où l'on voudra ce dessin, il est prêt — ne pas le réécrire. */ ''}
          ${enFiltre ? taille(carteReseau(cles), 'tb-x7') : ''}

          ${/* ⚠ LA PUB META RESTE DANS LES VUES FILTRÉES SEULEMENT, et c'est le
                choix d'Élodie du 17/11 : en vue groupe, cumuler les dépenses de
                quatre structures ne décide de rien.

                ⚠ ET ELLE SORT POUR LES TROIS STRUCTURES depuis le 18/11, même
                sans campagne. Seule RGD en a relevé jusqu'ici ; les autres
                voient la carte vide, qui se remplira d'elle-même. */ ''}
          ${enFiltre ? carteMeta(cles) : ''}

          ${/* ⚠ LA RANGÉE DU BAS A ÉTÉ VIDÉE LE 17/11/2026, en trois temps.
                « Publicité Meta » est montée dans la grande carte chaude ;
                « Chantiers » répétait l'encadré du haut, qui porte le même
                nombre ET la même liste ; « Ce qui part tout seul » est parti
                avec — Élodie : « je veux supprimer ces deux éléments, qui ne
                servent à rien ».

                ⚠ CE QU'ON NE VOIT PLUS NULLE PART : un envoi automatique
                DÉFINITIVEMENT perdu. `envoisAuto` (data/chiffres.js) sait le
                distinguer d'une tentative rattrapée, et il reste en place avec
                ses contrôles ; il n'a simplement plus de lecteur. Le jour où
                l'on voudra ce signal, il est prêt — ne pas le réécrire. */ ''}

          ${/* ⚠ LES DEUX CARTES DE CETTE RANGÉE NE SORTENT QU'EN VUE GROUPE, et
                elles y sont CÔTE À CÔTE depuis le 17/11/2026 (Élodie : « et si
                on met l'évolution du chiffre d'affaires et les ca des
                structures sur la même ligne »). Elles racontent la même chose
                dans les deux dimensions : la courbe donne le temps — douze mois
                quoi qu'on choisisse — et « Qui tire le groupe » donne le
                partage, sur la période choisie en haut d'écran.

                ⚠ LA COURBE RESTE RÉSERVÉE AU GROUPE. Filtrée sur une seule
                structure elle n'avait plus qu'une ligne, et le CA du mois était
                déjà dit deux fois — par l'encadré « CA facturé HT » et par
                « Objectifs & performance ».

                ⚠ 7 + 5 = 12, ET LA RANGÉE DOIT SE REFERMER. La courbe prend la
                largeur parce que `.tb-chart` réclame 360 px avant de se replier,
                et douze étiquettes de mois en dessous. Si l'une des deux cartes
                venait à disparaître, l'autre ne rattraperait PAS la largeur
                perdue : `carteGroupe` se tait quand il n'y a qu'une structure,
                et c'est justement le cas où la courbe n'a qu'une ligne à tracer
                — les deux s'en vont ensemble.

                ⚠ `dessineCourbe` SUPPORTE L'ABSENCE : `if (!canvas) return;`.
                Ne pas retirer cette garde en croyant la carte toujours là.

                ⚠ LE PANNEAU DES TOTAUX A QUITTÉ LA COURBE LE MÊME JOUR. Il
                listait les quatre structures avec leur CA DU DERNIER MOIS. Posé
                à côté d'une carte qui liste les quatre mêmes structures avec
                leur CA DE LA PÉRIODE, il offrait deux colonnes de nombres
                voisines, aux mêmes noms, qui ne disent pas la même chose — on
                ne peut pas demander à quelqu'un de ne pas les comparer. Le
                total sur douze mois de chaque structure reste écrit dans la
                légende de la courbe, et le détail d'un mois s'obtient en
                survolant le point. */ ''}
          ${state.filtre === 'groupe' ? `
          <section class="card tb-x7">
            <div class="card-head"><h2>Évolution du chiffre d'affaires</h2>
              <span class="muted small">CA HT · 12 derniers mois · toutes les structures</span></div>
            <div class="tb-chartwrap">
              <div class="chart-box tb-chart"><canvas id="tb-canvas"></canvas></div>
            </div>
          </section>` : ''}
          ${enFiltre ? '' : taille(carteGroupe(cles, r, deals, state), 'tb-x5')}
`}

        </div>

        ${/* ⚠ PAS DE PIED DE PAGE DANS LA VUE PATRIMOINE. Cette phrase nomme les
              outils d'où viennent les chiffres des STRUCTURES ; sous un parc
              immobilier, « RGD Renova : chiffres lus en direct… » rattache à
              l'entreprise un patrimoine qui est celui de Mickael. C'est
              exactement le mélange que cette vue existe pour défaire. */ ''}
        ${!vueP && sources.length ? `<p class="muted small tb-source">${sources.map(x => externe(x.cle)?.direct
          ? `${esc(ACTIVITIES[x.cle].label)} : chiffres lus en direct dans ${esc(x.source)} (demandes reçues, rendez-vous, devis envoyés et signés, CA facturé)`
          : `${esc(ACTIVITIES[x.cle].label)} : chiffres déposés par ${esc(x.source)}, mis à jour le ${new Date(x.maj).toLocaleDateString('fr-FR')}`).join(' · ')}
          — chaque outil applique ses propres définitions : un CA peut être facturé chez l'un et signé chez l'autre.</p>` : ''}`;

      // ---- interactions
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
        state.filtre = b.dataset.f;
        try { localStorage.setItem(LS_FILTRE, state.filtre); } catch { /* navigation privée */ }
        draw();
      });
      root.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { state.periode = b.dataset.p; draw(); });
      root.querySelector('#tb-mois')?.addEventListener('change', (e) => { state.mois = e.target.value; draw(); });
      root.querySelectorAll('[data-ouvre]').forEach(el => {
        const cible = root.querySelector('#' + el.dataset.ouvre);
        if (!cible) return;
        const basculer = () => {
          const ouvre = cible.hidden;
          cible.hidden = !ouvre;
          el.setAttribute('aria-expanded', String(ouvre));
          const c = el.querySelector('.tb-caret');
          if (c) c.textContent = ouvre ? '\u25be' : '\u25b8';
        };
        el.onclick = basculer;
        // ⚠ LE CLAVIER AUSSI : `role="button"` promet la barre d'espace et
        // Entrée, et un div ne les donne pas tout seul. Promettre le rôle sans
        // le tenir est pire que ne rien promettre.
        el.onkeydown = (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); basculer(); }
        };
      });
      root.querySelectorAll('[data-go]').forEach(el => el.onclick = (e) => {
        e.stopPropagation();          // une pastille est posée dans une tuile cliquable
        location.hash = el.dataset.go;
      });
      // Pictogramme manquant : on retombe sur une pastille de couleur plutôt qu'une image cassée
      root.querySelectorAll('.tb-struct img').forEach(im => im.onerror = () => {
        if (im.dataset.repli) return im.replaceWith(document.createTextNode(im.dataset.nom));
        im.dataset.repli = '1'; im.classList.add('picto'); im.src = `assets/logos/${im.dataset.cle}.png`;
      });
      root.querySelectorAll('.tb-logo').forEach(im => im.onerror = () => {
        const p = document.createElement('span');
        p.className = 'tb-glyph'; p.style.background = ACTIVITIES[im.dataset.cle].color; p.style.color = '#fff';
        p.textContent = ACTIVITIES[im.dataset.cle].short.slice(0, 2).toUpperCase();
        im.replaceWith(p);
      });
      root.querySelector('#tb-obj')?.addEventListener('click', () => formObjectifs(draw, cles));
      root.querySelector('#tb-ag')?.addEventListener('click', () => formAgendas(visibles, draw));

      // Les flèches de « Ma semaine ». « Cette semaine » remet à zéro, les
      // flèches avancent d'un cran : `data-sem` porte le pas, pas la cible.
      root.querySelectorAll('[data-sem]').forEach(b => b.onclick = () => {
        const pas = Number(b.dataset.sem);
        state.sem = pas === 0 ? 0 : state.sem + pas;
        draw();
      });
      // Un rendez-vous de la grille mène à l'agenda de sa structure, quand elle
      // en a un à elle. Le
      // tableau de bord ne sait pas déplacer ni supprimer un rendez-vous — c'est
      // le métier de l'écran Agenda, et il vaut mieux y emmener que l'imiter.
      root.querySelectorAll('#tb-jour .ag-evt').forEach(b => b.onclick = () => {
        // ⚠ BTP EXPERTISE N'A PAS D'ÉCRAN AGENDA À LUI : son agenda s'affiche
        // dans l'accueil de l'espace, en cadre Google. Propulsion n'en a aucun,
        // et son rendez-vous reste alors sans destination plutôt que d'emmener
        // quelque part au hasard.
        const ou = { rgd: '#/rgd/agenda', courtage: '#/courtage/agenda', btp: '#/btp' }[
          db.byId('agenda_events', b.dataset.ev)?.activity];
        if (ou) location.hash = ou;
      });
      // ⚠ ON NE REDESSINE QUE SI L'ÉCRAN EST ENCORE LÀ : le relevé prend
      // plusieurs secondes, et d'ici là on peut avoir changé de page. Écrire
      // dans un hôte détaché ne lève rien et ne se voit nulle part.
      {
        const { du, au } = bornesSemaine(state.sem);
        releverSemaine(du, au, () => { if (document.body.contains(root)) draw(); });
      }

      /* ⚠ LE RETOUR S'ÉCRIT DANS UN BLOC, PAS DANS UN `toast` : il porte
         l'identifiant du calendrier créé, qu'un message qui s'efface au bout
         de trois secondes perdrait. Même choix que l'écran des comptes. */
      root.querySelectorAll('[data-mon-agenda]').forEach(b => b.onclick = async () => {
        const k = b.dataset.monAgenda;
        const cible = root.querySelector('#tb-mon-agenda');
        b.disabled = true; b.textContent = 'Création…';
        try {
          const r = await creerAgendaPersonnel(scope.user.id, k);
          cible.innerHTML = r.deja
            ? `<p class="muted small">Vous avez déjà un agenda ${esc(ACTIVITIES[k].label)}.</p>`
            : `<p class="muted small">Agenda « ${esc(r.nom)} » créé.
               ${r.partage ? 'Une invitation Google vient de vous être envoyée : acceptez-la pour le voir.'
                           : 'Le partage a échoué : ' + esc(r.motif_partage || '')}</p>`;
          await db.recharger('agendas_personnels').catch(() => {});
          draw();
        } catch (e) {
          cible.innerHTML = `<p class="muted small" style="color:var(--red)">${esc(e.message)}</p>`;
          b.disabled = false; b.textContent = `Créer mon agenda ${ACTIVITIES[k].label}`;
        }
      });

      dessineCourbe(cles, moisSerie, deals);
      animerTableau(root);
    };

    // ---------- indicateurs ----------
    // `sous` peut contenir du balisage (les pastilles de structure) : il est
    // composé ici, jamais saisi par quelqu'un.
    // ⚠ UNE TUILE DE BENTO, PAS UNE CASE DE BANDEAU (12/11/2026). La micro-courbe
    // revient sur fond clair : elle reprend donc les couleurs d'encre du thème,
    // et non les teintes pâles qu'il fallait sur le bandeau sombre.
    // ⚠ LA COURBE EST PASSÉE EN VIGNETTE, À CÔTÉ DU CHIFFRE (17/11/2026). Elle
    // occupait le bas de la tuile, qui revient au détail demandé par Élodie —
    // les noms derrière le nombre. Garder les deux l'un sur l'autre rendait la
    // liste illisible ; la supprimer aurait retiré la tendance sans qu'on l'ait
    // demandé. Elle rétrécit, elle ne disparaît pas.
    const kpi = (libelle, valeur, d, serie, sous, points = false, titre = '', vers = '', lignes = null) => `
      <article class="card tb-x3 tb-k${vers ? ' click' : ''}"${vers ? ` data-go="${vers}"` : ''}${titre ? ` title="${esc(titre)}"` : ''}>
        <h2>${libelle}</h2>
        <div class="tb-ind"><b>${valeur}</b>${delta(d, points)}<span class="tb-vs">${comparaisonLabel(state.periode)}</span>
          ${spark(serie, d === null || d >= 0 ? 'var(--green)' : 'var(--red)', 'tb-mini')}</div>
        <span class="tb-sous">${sous}</span>
        ${listeDetail(lignes)}
      </article>`;

    // ---------- courbe ----------
    // Voir `js/chart.js` : la bibliothèque arrive à la demande, et la garde
    // reste pour le cas où elle n'arrive pas.
    const dessineCourbe = async (cles, mois, deals) => {
      const canvas = root.querySelector('#tb-canvas');
      if (!canvas) return;
      await chargerChart().catch(() => {});
      if (!root.isConnected || !window.Chart) return;
      const datasets = cles.map(k => {
        const data = mois.map(m => caMois(k, m.cle, deals));
        const c = ACTIVITIES[k].color;
        return {
          label: `${ACTIVITIES[k].label} — ${eur(data.reduce((s, v) => s + v, 0))}`,
          data, borderColor: c, backgroundColor: c, borderWidth: 2, tension: 0.25, fill: false,
          pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: c,
          pointBorderColor: '#fff', pointBorderWidth: 2,
        };
      });
      chart?.destroy();
      chart = new Chart(canvas, {
        type: 'line',
        data: { labels: mois.map(m => m.label), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#5C5F7A' } },
            y: { beginAtZero: true, border: { display: false }, grid: { color: '#E6E6F0' },
                 ticks: { color: '#8C8FA8', callback: v => v ? (v / 1000) + ' k€' : '0' } },
          },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10, padding: 16, color: '#16172B', font: { size: 12.5, weight: '600' } } },
            tooltip: {
              callbacks: {
                label: c => `${c.dataset.label.split(' — ')[0]} : ${eur(c.raw)}`,
                footer: items => 'Total : ' + eur(items.reduce((s, i) => s + (Number(i.raw) || 0), 0)),
              },
            },
          },
        },
      });
    };

    draw();
    return { refresh: draw, destroy: () => { chart?.destroy(); root.classList.remove('ecran-tb'); } };
  },
};

// Qui apporte les leads : en vue Groupe, un nombre seul ne dit pas de quelle
// structure il vient. Une pastille par structure qui en a, dans sa couleur.
function repartitionLeads(t, cles) {
  // Le nombre de la pastille est celui de la tuile : les leads DE LA PÉRIODE,
  // sauf pour un outil qui ne sait pas les dater (son total, signalé).
  const n = (x) => (x.leadsNonDates ? x.leads : x.leadsPeriode);
  const avec = t.lignes.filter(x => n(x) > 0);
  if (!avec.length) return 'aucun prospect en base';
  if (cles.length === 1) {
    return t.leadsNonDates ? 'prospects en base · arrivée non datée'
      : 'nouveaux contacts sur la période';
  }
  // Le nom court plutôt qu'une pastille seule : à cette taille, une couleur ne
  // suffit pas à reconnaître une structure.
  // Chaque pastille ouvre la base de sa structure : en vue Groupe, c'est le seul
  // moyen de passer d'un nombre à la liste qui est derrière.
  return `<span class="tb-part">${avec.map(x =>
    `<button type="button" class="tb-pp" style="--c:${ACTIVITIES[x.cle].color}" data-go="${BASE_PROSPECTS[x.cle]}"
       title="Ouvrir les prospects — ${esc(ACTIVITIES[x.cle].label)} (${n(x)})">
       <i></i>${esc(ACTIVITIES[x.cle].short)} <b>${n(x)}</b></button>`).join('')}</span>`;
}

// ---------- comparaison avec la période précédente ----------
const comparaisonLabel = (p) => ({
  today: '', week: 'vs semaine dernière', month: 'vs mois dernier', mois: 'vs mois précédent',
  quarter: 'vs trimestre dernier', year: 'vs an dernier', all: '',
}[p] || '');
// Les taux se comparent en points de pourcentage, pas en pourcentage de pourcentage
const ecart = (avant, apres) => (avant == null || apres == null) ? null : Math.round((apres - avant) * 100);

// CA porté par les affaires nées ET signées dans la période — le chiffre qui va avec l'entonnoir
const montantCohorte = (cles, r, deals) => deals
  .filter(d => cles.includes(d.activity) && d.status === 'won' && inRange(d.created_at, r))
  .reduce((s, d) => s + (Number(d.amount) || 0), 0);

// ---------- objectifs ----------
/**
 * « Objectifs & performance » — refait le 04/11/2026 (Élodie : « plus intuitif
 * visuellement, et que l'on voie l'avancée sur l'année et le mois en cours »).
 *
 * ⚠ CETTE CARTE NE SUIT PAS LE SÉLECTEUR DE PÉRIODE, et c'est voulu : elle
 * répond toujours aux deux mêmes questions — où en est le MOIS EN COURS, où en
 * est l'ANNÉE — alors que les tuiles du haut lisent le mois dernier, clos.
 *
 * ⚠ LE VERDICT SE LIT CONTRE LE RYTHME, PAS CONTRE L'OBJECTIF ENTIER : le 4 du
 * mois, 12 % de l'objectif n'est pas un retard. Le repère vertical marque où il
 * faudrait être aujourd'hui ; l'écart en euros dit de combien on s'en écarte.
 */
/**
 * ⚠ `grand` FAIT REMPLIR À LA CARTE LA HAUTEUR QU'ELLE OCCUPE DÉJÀ
 * (17/11/2026). Élodie : « si ça peut prendre un peu plus de place en hauteur
 * ce serait mieux pour rattraper un peu le décalage avec l'encadré ma
 * journée ». La carte enjambe deux rangées depuis le matin, mais s'arrêtait à
 * la hauteur de son contenu : la colonne de droite se terminait bien avant la
 * gauche. Elle s'étire maintenant, et c'est la FRISE DES DOUZE MOIS qui prend
 * la place — des barres de 56 px qui en font le double se lisent mieux.
 *
 * ⚠ `flex: 1 1 auto`, PAS `flex: 1`. Avec une base à zéro, la frise
 * s'effondrerait quand il n'y a pas de place en trop ; avec `auto`, elle part
 * de sa hauteur naturelle et ne fait que grandir.
 *
 * ⚠ ET RIEN POUR UN BLOC « SANS DONNÉE » : il n'a pas de frise, lui donner
 * la place en ferait du blanc. BTP Expertise et La Référence Courtage sont
 * dans ce cas.
 *
 * ⚠ TOUT EN STYLE EN LIGNE : app.css est le fichier d'une autre session.
 */
function carteObjectifs(cles, deals, grand = false) {
  const mois = moisEnCours();
  const avecObjectif = cles.filter(k => objectifAnnuel(k) > 0);
  const nomMois = mois.start.toLocaleDateString('fr-FR', { month: 'long' });
  const entete = `<div class="card-head"><h2>Objectifs &amp; performance</h2>
    <span class="muted small">${esc(nomMois)} et année d'objectif de chaque structure · CA HT</span>
    ${scope.isDirection ? '<button class="btn ghost sm" id="tb-obj">Fixer les objectifs</button>' : ''}</div>`;
  if (!avecObjectif.length) {
    return `<section class="card">${entete}<p class="empty" style="padding:22px">Aucun objectif fixé.${scope.isDirection
      ? ' Utilisez « Fixer les objectifs » pour définir un objectif de CA annuel par structure.' : ''}</p></section>`;
  }
  const blocs = avecObjectif.map(k => blocObjectif([k], ACTIVITIES[k].color, deals,
    `<img src="assets/logos/${k}-complet.png" alt="${esc(ACTIVITIES[k].label)}" data-cle="${k}" data-nom="${esc(ACTIVITIES[k].label)}">`,
    `data-go="${lienStructure(k)}"`, grand));
  // ⚠ LE TOTAL « GROUPE » N'ADDITIONNE QUE CE QU'ON SAIT MESURER (12/11/2026).
  // Y laisser l'objectif d'une structure dont aucun euro ne passe par le CRM
  // fabriquait un retard permanent et inrattrapable : un objectif en face
  // d'un réalisé qui restera nul par construction. On les sort du calcul
  // et on dit lesquels — les retirer en silence ferait croire à une erreur de
  // saisie la prochaine fois que quelqu'un additionnera les lignes.
  const mesurables = avecObjectif.filter(k => argentConnu(k, deals));
  const horsMesure = avecObjectif.filter(k => !argentConnu(k, deals));
  if (mesurables.length > 1) {
    blocs.push(blocObjectif(mesurables, 'var(--accent)', deals, '<span class="ob-groupe">Groupe</span>', '', grand));
  }
  return `<section class="card">${entete}<div class="ob-liste"${grand ? ' style="flex:1 1 auto"' : ''}>${blocs.join('')}</div>
    <p class="muted small tb-legend"><i></i> Le trait marque où il faudrait être aujourd'hui pour tenir l'objectif.</p>
    ${/* ⚠ LE RETRAIT SE DIT, IL NE SE DEVINE PAS. Sans cette phrase, quelqu'un
          qui additionne les objectifs affichés ne retombe pas sur le total et
          croit à une erreur de saisie. Elle n'apparaît que s'il reste quelque
          chose à quoi comparer : seule, la carte « sans donnée » se suffit. */ ''}
    ${horsMesure.length && mesurables.length ? `<p class="muted small" style="margin:6px 0 0">
      ${esc(horsMesure.map(k => ACTIVITIES[k].label).join(' et '))}
      (${eur(horsMesure.reduce((s, k) => s + objectifAnnuel(k), 0))} d'objectif)
      ${horsMesure.length > 1 ? "n'entrent" : "n'entre"} dans aucun total :
      ${horsMesure.length > 1 ? 'leurs chiffres ne passent pas' : 'ses chiffres ne passent pas'} par le CRM,
      et les additionner créerait un retard que rien ne pourrait combler.</p>` : ''}</section>`;
}
const lienStructure = (k) => (k === 'rgd' ? '#/rgd' : k === 'btp' ? '#/btp' : k === 'courtage' ? '#/courtage' : '#/pipeline/' + k);

function blocObjectif(cles, couleur, deals, titre, attrs, grand = false) {
  const mois = moisEnCours();
  const somme = (f) => cles.reduce((s, k) => s + f(k), 0);
  const caDe = (r) => somme(k => chiffres(k, r, deals).ca);
  const objAn = somme(k => objectifAnnuel(k));
  const objMois = somme(k => objectif(k, mois));
  // L'année d'objectif : l'exercice de la structure (RGD : octobre → septembre).
  // ⚠ Le bloc Groupe additionne chaque structure SUR SON PROPRE EXERCICE ; ses
  // années ne coïncidant pas, il n'a pas de frise mois par mois.
  const exercices = cles.map(k => exerciceDe(k));
  const memeAnnee = exercices.every(e => +e.start === +exercices[0].start);
  const an = exercices[0];
  const caAnnee = somme(k => chiffres(k, exerciceDe(k), deals).ca);
  const nomAnnee = memeAnnee ? (an.label.includes('–') ? `Exercice ${an.label}` : `Année ${an.label}`) : 'Année d\'objectif';
  const partAnnee = memeAnnee ? an : null;

  // Les douze mois de l'exercice, chacun contre son propre objectif mensuel.
  const cleMoisCourant = moisCle();
  const colonnes = !memeAnnee ? [] : Array.from({ length: 12 }, (_, i) => {
    const r = { start: new Date(an.start.getFullYear(), an.start.getMonth() + i, 1), end: new Date(an.start.getFullYear(), an.start.getMonth() + i + 1, 1) };
    const cle = moisCle(r.start);
    return {
      cle, o: somme(k => objectif(k, r)), v: cle > cleMoisCourant ? null : caDe(r),
      label: r.start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    };
  });
  // ⚠ DE LA PLACE AU-DESSUS DU TRAIT D'OBJECTIF (19/11/2026, Élodie : « que les
  // barres aillent au delà de la ligne des objectifs pour que l'on voie
  // réellement cette ligne »). L'échelle s'arrêtait au plus haut des objectifs :
  // un mois sans dépassement posait son trait sur le BORD SUPÉRIEUR de la
  // colonne, où il se confondait avec l'arrondi. Un tiers de marge le décolle,
  // et une barre qui dépasse l'objectif a de quoi le montrer.
  const haut = Math.max(1, ...colonnes.map(c => Math.max(c.o, c.v || 0))) * 1.35;
  const frise = !colonnes.length ? '' : `<div class="ob-frise" aria-label="CA mois par mois"${grand ? ' style="flex:1 1 auto"' : ''}>${colonnes.map(c => {
    const futur = c.v === null, courant = c.cle === cleMoisCourant;
    const atteint = !futur && c.o > 0 && c.v >= c.o;
    return `<div class="ob-col${futur ? ' futur' : ''}${courant ? ' courant' : ''}"
        title="${esc(c.label)} : ${futur ? 'à venir' : eur(c.v)} · objectif ${eur(c.o)}">
      <div class="ob-col-zone" style="overflow:visible${grand ? ';flex:1 1 auto' : ''}">
        ${futur ? '' : `<span class="ob-col-val${atteint ? ' ok' : ''}" style="height:${Math.max(c.v > 0 ? 3 : 0, c.v / haut * 100).toFixed(1)}%"></span>`}
        ${/* Le trait déborde de la colonne de 3 px de chaque côté et passe
              à 3 px d'encre pleine : on le voit d'un mois à l'autre comme une
              ligne, et non plus comme un liseré du fond. */ ''}
        ${c.o > 0 ? `<span class="ob-col-obj" style="bottom:${(c.o / haut * 100).toFixed(1)}%;left:-3px;right:-3px;height:3px;margin-bottom:-1.5px;border-radius:2px;opacity:.9;z-index:1"></span>` : ''}
      </div>
      <span class="ob-col-nom">${esc(c.label)}</span></div>`;
  }).join('')}</div>`;

  // ⚠ UNE STRUCTURE DONT LE CRM N'A JAMAIS VU UN EURO N'EST PAS « EN RETARD »
  // (12/11/2026, demandé par Élodie). BTP Expertise et La Référence Courtage
  // portent un objectif annuel ; ni l'une ni l'autre ne facture dans le
  // CRM. L'écran leur annonçait « 0 % · en retard sur le rythme »,
  // ce qui désigne un manque de travail là où il n'y a qu'un manque de mesure.
  // On garde l'objectif affiché — il a été fixé, il existe — et on remplace le
  // verdict par ce qu'on sait vraiment.
  //
  // ⚠ RÉVISÉ LE 19/11/2026 — Élodie : « je voudrais quand même voir les
  // graphiques de btp expertise et la référence courtage même si les résultats
  // sont à zéro ». Le bloc complet s'affiche donc toujours (jauges et frise) ;
  // ce qui reste du 12/11, c'est la PHRASE qui dit pourquoi c'est à zéro, posée
  // sous le titre, et la sortie du total « Groupe » (`mesurables` plus haut).
  const connu = cles.some(k => argentConnu(k, deals));
  const sansDonnee = connu ? '' : `<p class="muted small" style="margin:2px 0 8px">Aucun chiffre d'affaires encore enregistré dans le CRM pour cette structure : les barres restent à zéro.</p>`;

  return `<article class="ob-bloc${attrs ? ' click' : ''}" style="--c:${couleur}${
    grand && frise ? ';flex:1 1 auto;display:flex;flex-direction:column' : ''}" ${attrs}>
    <header class="ob-tete"><span class="tb-struct">${titre}</span>
      <span class="muted small">objectif annuel <b>${eur(objAn)}</b></span></header>
    ${sansDonnee}
    <div class="ob-jauges">
      ${jaugeObjectif(`${mois.start.toLocaleDateString('fr-FR', { month: 'long' })} · en cours`, caDe(mois), objMois, mois, 'jour')}
      ${jaugeObjectif(nomAnnee, caAnnee, objAn, partAnnee || exercices[0], partAnnee ? 'mois' : '',
        // Années décalées (Groupe) : le rythme attendu est la somme de celui de
        // chaque structure sur son propre exercice.
        partAnnee ? null : (objAn ? cles.reduce((s, k) => s + objectifAnnuel(k) * ecoule(exerciceDe(k)), 0) / objAn : 0))}
    </div>
    ${frise}
    ${colonnes.length ? `<p class="ob-legende muted small"><span class="ob-l-ok"></span>objectif du mois atteint
      <span class="ob-l-val"></span>réalisé <span class="ob-l-obj"></span>objectif du mois</p>` : ''}
  </article>`;
}

function jaugeObjectif(libelle, realise, vise, r, unite, partForcee = null) {
  if (!vise) {
    return `<div class="ob-jauge"><span class="ob-lbl">${esc(libelle)}</span>
      <p class="muted small">Pas d'objectif sur cette période.</p></div>`;
  }
  const part = partForcee ?? ecoule(r);
  const ecart = realise - vise * part;
  const p = realise / vise;
  const reste = Math.max(0, vise - realise);
  // Ce qu'il reste à faire, ramené au temps qu'il reste.
  let rythme = '';
  if (reste && part < 1) {
    if (unite === 'mois') {
      const n = new Date();
      const moisRestants = (r.end.getFullYear() - n.getFullYear()) * 12 + r.end.getMonth() - n.getMonth();
      rythme = moisRestants > 1 ? `, soit ${eur(reste / moisRestants)} par mois sur ${moisRestants} mois` : ' ce mois-ci';
    } else if (unite === 'jour') {
      const jours = Math.max(1, Math.ceil((r.end - Date.now()) / 86400000));
      rythme = ` en ${jours} jour${jours > 1 ? 's' : ''}`;
    }
  }
  const etat = p >= 1 || ecart >= 0 ? 'ok' : 'ko';
  // ⚠ PLUS DE VERDICT DE RYTHME (17/11/2026). Élodie : « enlève les "en
  // retard de … sur le rythme", ça porte à confusion ». Ce nombre comparait le
  // réalisé à un prorata LINÉAIRE du temps écoulé — en novembre, sur un
  // exercice ouvert en octobre, il annonçait 156 916 € de retard sur 180 000 €
  // d'objectif. Le chantier ne se facture pas au douzième près, et la phrase
  // se lisait comme un jugement là où il n'y avait qu'une règle de trois.
  //
  // ⚠ « OBJECTIF ATTEINT » RESTE : c'est un fait, pas une comparaison au
  // calendrier. Ce qui part, ce sont les deux variantes de rythme — « en
  // avance » autant qu'« en retard » : n'en garder qu'une donnerait une carte
  // qui ne commente que les bonnes nouvelles.
  //
  // ⚠ LE REPÈRE SUR LA BARRE RESTE AUSSI, lui, avec sa légende : il montre
  // où l'on devrait être sans mettre un euro sur l'écart. C'est le même calcul,
  // dit sans le chiffrer, et `ecart` continue de colorer le pourcentage.
  const verdict = p >= 1 ? `Objectif atteint${realise > vise ? `, dépassé de ${eur(realise - vise)}` : ''}` : '';
  return `<div class="ob-jauge">
    <div class="ob-ligne"><span class="ob-lbl">${esc(libelle)}</span><span class="ob-pct ${etat}">${pct(p)} %</span></div>
    <div class="ob-montants"><b>${eur(realise)}</b><span class="muted"> sur ${eur(vise)}</span></div>
    <div class="ob-barre"><span class="ob-rempli" style="width:${Math.min(100, p * 100).toFixed(1)}%"></span>
      ${part > 0 && part < 1 ? `<span class="ob-repere" style="left:${(part * 100).toFixed(1)}%" title="Où il faudrait être aujourd'hui"></span>` : ''}</div>
    ${verdict ? `<p class="ob-verdict ${etat}">${verdict}</p>` : ''}
    <p class="muted small">${reste ? `Reste ${eur(reste)}${rythme}` : 'Plus rien à faire sur cette période.'}</p>
  </div>`;
}
/**
 * « Fixer les objectifs » — refait le 17/11/2026 (Élodie : « je voudrais que le
 * formulaire soit plus moderne et complet et que l'on ne voie que RGD Renova,
 * je ne veux pas voir les autres structures »).
 *
 * ⚠ IL SUIT LE FILTRE DE L'ÉCRAN. Quand une structure est sélectionnée, le
 * formulaire ne parle que d'elle : afficher les quatre quand on en regarde une
 * oblige à chercher sa ligne, et invite à modifier celle du voisin par
 * mégarde. En vue Groupe, les quatre reviennent — c'est là qu'on arbitre.
 *
 * ⚠ « COMPLET » VEUT DIRE LES OBJECTIFS DE VOLUME, PAS SEULEMENT LE CA. RGD
 * Renova en a cinq (demandes, rendez-vous, devis envoyés, chantiers, CA) et ce
 * sont eux que la vue d'ensemble affiche en anneaux. Ils n'étaient saisissables
 * que dans Réglages RGD, un écran qu'on n'ouvre pas pour fixer un objectif.
 *
 * ⚠ ET ON SAISIT AU MOIS, EN ÉCRIVANT L'ANNÉE. C'est la convention déjà posée
 * pour BTP Expertise : « vingt demandes par mois » se pense, « deux cent
 * quarante par an » non. Le CA mensuel saisi ici écrit son douze-fois dans
 * l'objectif annuel partagé — une seule vérité stockée, deux lectures.
 */
function formObjectifs(onSaved, cles = []) {
  const seule = cles.length === 1 ? cles[0] : null;
  const visees = seule ? [seule] : ACTIVITY_KEYS.filter(k => CLES_VISIBLES().includes(k));
  // Les objectifs de volume n'existent que pour RGD Renova : c'est la seule
  // structure dont le CRM suit le parcours mois par mois.
  const volumes = seule === 'rgd' ? objectifsMensuels() : null;

  const ligne = (id, libelle, valeur, unite, aide) => `
    <label class="ob-f-ligne">
      <span class="ob-f-nom">${esc(libelle)}${aide ? `<em>${esc(aide)}</em>` : ''}</span>
      <span class="ob-f-saisie"><input id="${id}" type="number" min="0" step="${unite === '€' ? '100' : '1'}"
        inputmode="numeric" value="${valeur == null ? '' : valeur}"><i>${unite}</i></span>
    </label>`;

  const corps = volumes ? `
    <p class="ob-f-chapeau">Les objectifs de <b>${esc(ACTIVITIES.rgd.label)}</b>, par mois.
      Ce sont eux que la vue d'ensemble affiche en anneaux.</p>
    <div class="ob-f-grille">
      ${ligne('ob-dem', 'Demandes', volumes.demandes, '/ mois', 'site, téléphone et publicité')}
      ${ligne('ob-rdv', 'Rendez-vous', volumes.rdv, '/ mois', 'visites techniques tenues')}
      ${ligne('ob-env', 'Devis envoyés', volumes.envoyes, '/ mois', '')}
      ${ligne('ob-dev', 'Chantiers', volumes.devis, '/ mois', 'clients qui signent')}
      ${ligne('ob-ca', 'Chiffre d\'affaires HT', volumes.ca, '€ / mois', 'facturé dans le mois')}
    </div>
    <p class="ob-f-total" id="ob-total"></p>`
    : `
    <p class="ob-f-chapeau">Objectif de chiffre d'affaires <b>HT sur l'année</b>.
      Le mois et le trimestre en prennent leur part.</p>
    <div class="ob-f-grille">
      ${visees.map(k => ligne('ob-ca-' + k, ACTIVITIES[k].label, objectifAnnuel(k) || '', '€ / an', '')).join('')}
    </div>`;

  openModal(seule ? `Objectifs — ${ACTIVITIES[seule].label}` : 'Objectifs de chiffre d\'affaires',
    `<div class="ob-f">${corps}</div>
     <div class="form-actions"><button class="btn ghost" id="obj-x">Annuler</button><button class="btn" id="obj-ok">Enregistrer</button></div>`,
    { onOpen: (m) => {
      const lu = (id) => Number(m.querySelector('#' + id)?.value);
      // Le rappel à l'année se met à jour pendant la saisie : on saisit un mois,
      // on veut voir tout de suite ce que ça fait sur l'exercice.
      const totalAnnuel = () => {
        const t = m.querySelector('#ob-total');
        if (!t) return;
        const ca = lu('ob-ca');
        t.innerHTML = Number.isFinite(ca) && ca > 0
          ? `Soit <b>${eur(ca * 12)}</b> sur l'exercice ${exerciceDe('rgd').label}.`
          : '<span class="muted">Saisir un chiffre d\'affaires mensuel pour voir l\'objectif de l\'exercice.</span>';
      };
      m.querySelectorAll('.ob-f input').forEach(i => i.addEventListener('input', totalAnnuel));
      totalAnnuel();
      m.querySelector('#obj-x').onclick = () => closeModal();
      m.querySelector('#obj-ok').onclick = async () => {
        try {
          if (volumes) {
            const neuf = { demandes: lu('ob-dem'), rdv: lu('ob-rdv'), envoyes: lu('ob-env'),
                           devis: lu('ob-dev'), ca: lu('ob-ca') };
            if (Object.values(neuf).some(v => !Number.isFinite(v) || v <= 0)) {
              toast('Un objectif n\'est pas un nombre positif', 'err'); return;
            }
            await enregistrerObjectifsMensuels(neuf);
            // ⚠ ET L'OBJECTIF ANNUEL SUIT, sinon le tableau de bord et la vue
            // d'ensemble repartiraient sur deux chiffres de CA différents.
            const base = Object.fromEntries(ACTIVITY_KEYS.map(k => [k, objectifAnnuel(k) || 0]));
            await enregistrerObjectifs({ ...base, rgd: neuf.ca * 12 });
          } else {
            const base = Object.fromEntries(ACTIVITY_KEYS.map(k => [k, objectifAnnuel(k) || 0]));
            for (const k of visees) base[k] = Math.max(0, lu('ob-ca-' + k) || 0);
            await enregistrerObjectifs(base);
          }
          closeModal(true); toast('Objectifs enregistrés'); onSaved();
        } catch (e) { toast(e.message, 'err'); }
      };
    } });
}

const libellePeriode = (p) => ({
  today: 'à la journée', week: 'à la semaine', month: 'au mois', lastmonth: 'au mois',
  quarter: 'au trimestre', year: "sur l'année", all: '',
}[p] || '');

// ---------- la semaine ----------
// La semaine entière, dessinée par le CRM : les rendez-vous lus dans les agendas
// Google des structures et les tâches horodatées du CRM, un jour par ligne, chacun
// à la couleur de sa structure. Le cadre intégré de Google ne sert plus que de
// repli, tant qu'aucun identifiant client n'est renseigné.
//
// ⚠ C'ÉTAIT « MA JOURNÉE » JUSQU'AU 19/11/2026. Élodie : « remplacer la liste
// des rendez-vous du jour par une vue d'ensemble de la semaine des 4 agendas ».
// La journée seule ne montrait rien dès qu'aucun rendez-vous ne tombait le jour
// même — c'est le cas la plupart des jours pour trois structures sur quatre, et
// la carte laissait croire à un agenda vide alors que la semaine est pleine.
/**
 * ⚠ LES TÂCHES DU CRM N'Y SONT PLUS (19/11/2026, Élodie : « ah bah enlève les
 * tâches du crm stp »). Elles se mêlaient aux rendez-vous depuis que la carte
 * existe, en gris et sous l'étiquette CRM ; la vue filtrée les laissait déjà
 * de côté depuis le 17/11.
 *
 * ⚠ CE QUI A TRANCHÉ, C'EST LE DOUBLON. Un dossier du courtage né d'une prise
 * de rendez-vous en ligne porte une tâche « Rendez-vous téléphone » à l'heure
 * du rendez-vous — qui est AUSSI dans l'agenda Google. Le même rendez-vous
 * sortait donc deux fois dans la même colonne, à la même heure. Élodie :
 * « il sort d'où celui-là ?? ». Cette carte montre LES AGENDAS et rien
 * d'autre ; les rappels du CRM vivent dans « À traiter » et dans `#/today`.
 */
function carteSemaine(cles, sem = 0) {
  const ids = idsDeTous(cles);
  const { du, au, jours } = bornesSemaine(sem);
  const rdv = lignesEnregistrees(cles, du, au);
  const entete = `<div class="card-head"><h2>Ma semaine</h2>
    <span class="muted small">${libelleSemaine(du, au)}${
      rdv.length ? ` · ${rdv.length} rendez-vous` : ''}</span>
    <span class="tb-sem-nav">
      <button type="button" class="tb-sem-fl" data-sem="-1" aria-label="Semaine précédente">‹</button>
      ${sem ? '<button type="button" class="tb-sem-ajd" data-sem="0">Cette semaine</button>' : ''}
      <button type="button" class="tb-sem-fl" data-sem="1" aria-label="Semaine suivante">›</button>
    </span>
    ${peutRaccorder() ? `<button class="btn ghost sm" id="tb-ag">${ids.length ? 'Agendas' : 'Raccorder les agendas'}</button>` : ''}</div>`;

  if (!ids.length) {
    return `<section class="card">${entete}
      <div class="tb-ag-vide">
        <p><b>Aucun agenda n'est encore raccordé.</b> Une fois les calendriers des structures renseignés,
        leurs rendez-vous sont recopiés automatiquement dans le CRM.
        Personne n'a de connexion à faire. Chacun ne voit que les agendas qui lui
        appartiennent dès qu'on lui en a créé un&nbsp;; sans agenda à lui, il voit
        celui de sa structure.</p>
        ${peutRaccorder() ? modeEmploi() + '<p class="muted small">Puis « Raccorder les agendas » ci-dessus.</p>'
          : '<p class="muted small">La direction peut les renseigner depuis cet écran.</p>'}
      </div>
      <div id="tb-jour">${dessinerSemaine([], jours)}</div>
    </section>`;
  }
  // La semaine est lue dans le CRM, pas chez Google : elle s'affiche aussitôt,
  // pour tout le monde. La recopie, elle, se fait en fond et n'appartient qu'à
  // la direction — c'est elle qui a accès aux calendriers.
  return `<section class="card">${entete}
    <div id="tb-jour">${dessinerSemaine(rdv, jours)}</div>
    ${monAgendaHtml(cles)}
    <p class="muted small tb-ag-src">${sourcesHtml(cles)}<span id="tb-maj">${etatSync(cles, du, au)}</span></p>
  </section>`;
}

// Le lundi de la semaine affichée, et les sept clés de jour qui la composent.
// `sem` est un nombre de semaines à partir de celle-ci : 0 aujourd'hui, -1 la
// précédente. ⚠ LA SEMAINE COMMENCE LE LUNDI, comme l'écran Agenda : les deux
// doivent montrer la même découpe, sinon « la semaine » désigne deux choses
// d'un écran à l'autre. Midi, et non minuit : un jour de changement d'heure,
// ajouter sept jours à minuit peut retomber sur la veille 23 h.
function bornesSemaine(sem = 0) {
  const l = new Date();
  l.setHours(12, 0, 0, 0);
  l.setDate(l.getDate() - ((l.getDay() + 6) % 7) + sem * 7);
  const jours = [...Array(7)].map((_, i) => {
    const d = new Date(l); d.setDate(l.getDate() + i); return isoDay(d);
  });
  return { du: jours[0], au: jours[6], jours };
}
const libelleSemaine = (du, au) => {
  const a = new Date(`${du}T12:00:00`), b = new Date(`${au}T12:00:00`);
  const mois = (d) => d.toLocaleDateString('fr-FR', { month: 'long' });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${mois(b)}`
    : `${a.getDate()} ${mois(a)} – ${b.getDate()} ${mois(b)}`;
};

// ⚠ LA SEMAINE AFFICHÉE EST RELEVÉE À L'OUVERTURE, ET CE N'EST PAS UN LUXE :
// le relevé automatique des 30 minutes ne rapporte QUE LA JOURNÉE EN COURS, et
// seul le passage large de 10 h va chercher les trente jours suivants. Sans cet
// appel, un rendez-vous pris ce matin pour jeudi n'apparaîtrait que demain — et
// la carte dirait « aucun rendez-vous » avec aplomb. C'est la même RPC que
// l'écran Agenda appelle à chaque semaine ouverte.
//
// Même registre que lui : une semaine déjà relevée il y a moins d'une minute ne
// rappelle pas Google, sans quoi chaque changement de période ou de structure —
// qui redessine l'écran — relancerait sept requêtes.
const RELEVE_SEMAINE = new Map();
async function releverSemaine(du, au, apres) {
  if (db.demo || !scope.user) return;
  if (Date.now() - (RELEVE_SEMAINE.get(du) || 0) < 60000) return;
  RELEVE_SEMAINE.set(du, Date.now());
  try {
    await db.rpc('declencher_releve_agenda_fenetre', { du, au });
    for (const attente of [2500, 4000]) {
      await new Promise(r => setTimeout(r, attente));
      // `recharger` ne prévient que si les lignes ont VRAIMENT changé : un
      // relevé qui ne trouve rien de neuf ne fait pas sauter l'écran.
      if (await db.recharger('agenda_events')) break;
    }
    apres();
  } catch {
    // Un relevé raté n'efface rien : la carte garde le reflet précédent. On le
    // retire du registre pour que le prochain passage le retente.
    RELEVE_SEMAINE.delete(du);
  }
}
// Les structures que la personne porte et pour lesquelles elle n'a pas encore
// d'agenda à elle. Tant qu'elle n'en a pas, elle voit celui de sa structure —
// partagé avec les autres — et ses propres rendez-vous s'y mêlent.
//
// ⚠ AUCUNE CONNEXION GOOGLE À FAIRE, et c'est le point qui surprend : le
// cabinet crée le calendrier et le lui partage en écriture. Pas de fenêtre de
// consentement, pas de mot de passe, rien à autoriser — seulement une
// invitation Google à accepter. Brancher son agenda PERSONNEL aurait fait
// entrer ses rendez-vous privés dans le CRM, ce qui est précisément ce qu'on
// refuse.
//
// ⚠ BTP EXPERTISE N'Y FIGURE JAMAIS (`scope.STRUCTURES_A_AGENDA_COMMUN`) :
// le métier d'un rendez-vous s'y déduit du calendrier, un agenda personnel ne
// recevrait rien. On y invite la personne au lieu de lui en créer un.
//
// ⚠ NI UNE STRUCTURE SANS LE MOINDRE CALENDRIER RACCORDÉ (19/11/2026,
// Élodie : « supprime "créer mon agenda propulsion" »). Propulsion n'a pas de
// `propulsion_calendar_id` : l'agenda personnel qu'on y aurait créé serait le
// PREMIER de la structure, c'est-à-dire un calendrier commun déguisé en agenda
// privé, et personne ne l'attend. On raccorde d'abord la structure — bouton
// « Agendas » ci-dessus —, on distribue ensuite.
const structuresSansMonAgenda = (cles) => (cles || []).filter(
  k => !scope.STRUCTURES_A_AGENDA_COMMUN.includes(k)
    && idsDe(k).length && !scope.aUnAgendaAVoir(k));

const monAgendaHtml = (cles) => {
  const manquantes = structuresSansMonAgenda(cles);
  if (!manquantes.length || db.demo) return '';
  return `<p class="muted small tb-ag-mien">Vos rendez-vous arrivent dans l’agenda de votre structure,
      que vous partagez avec les autres. Vous pouvez avoir le vôtre — rien à connecter, vous
      recevrez une invitation Google à accepter.<br>
      ${manquantes.map(k => `<button class="btn ghost sm" data-mon-agenda="${k}">Créer mon agenda ${esc(ACTIVITIES[k].label)}</button>`).join(' ')}
    </p><div id="tb-mon-agenda"></div>`;
};

const etatSync = (cles, du, au) => {
  const d = derniereSync(cles, du, au);
  if (!d) return '<span class="ag-abs">pas encore relevé</span>';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  const quand = min < 1 ? 'à l\'instant' : min < 60 ? `il y a ${min} min`
    : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `<span class="ag-abs">agendas relevés ${quand}</span>`;
};
const sourcesHtml = (cles) => {
  const raccordees = structuresRaccordees(cles);
  const manquantes = cles.filter(k => !raccordees.includes(k));
  return raccordees.map(k => `<span class="ag-src"><span class="dot" style="background:${ACTIVITIES[k].color}"></span>${esc(ACTIVITIES[k].label)}</span>`).join('')
    + (manquantes.length ? `<span class="ag-abs">sans agenda : ${manquantes.map(k => esc(ACTIVITIES[k].label)).join(', ')}</span>` : '');
};

// La semaine, en colonnes. Élodie, 19/11/2026 : « je ne voulais pas cette
// présentation en ligne mais plutôt des colonnes comme un calendrier
// hebdomadaire ». C'est la grille de l'écran Agenda, pas une seconde.
//
// ⚠ LA COULEUR VIENT DE LA STRUCTURE, PAS DU CALENDRIER. La grille accepte une
// palette `calendar_id → teinte` (elle sert à l'écran Agenda pour donner une
// couleur par personne) : on lui en donne une qui range tous les calendriers
// d'une structure sous sa couleur de charte. C'est ce que la légende du pied de
// carte annonce, et les agendas personnels d'une même structure ne doivent pas
// s'y distinguer — ici on regarde le groupe, pas qui fait quoi.
//
// ⚠ LE TÉLÉPHONE GARDE LA LISTE. Sept colonnes dans 375 px font 46 px par jour :
// l'écran Agenda lui-même n'y montre qu'une journée à la fois. Une semaine en
// lignes dit plus qu'une colonne unique, et c'est la même matière.
function dessinerSemaine(lignes, jours) {
  const parJour = new Map(jours.map(j => [j, []]));
  lignes.forEach(e => parJour.get(e.day)?.push(e));
  const teinte = (e) => (e.activity && ACTIVITIES[e.activity]
    ? ACTIVITIES[e.activity].color : 'var(--muted-2)');
  const palette = new Map(lignes.map(e => [e.calendar_id, teinte(e)]));

  if (!matchMedia('(max-width: 820px)').matches) {
    // ⚠ 52 PX PAR HEURE, PAS MOINS, ET C'EST UNE MESURE : un rendez-vous d'une
    // demi-heure occupe alors 26 px, de quoi poser le titre ET l'heure en
    // dessous (12 + 10,5 px, plus 2 de marge). À 44 px par heure il n'en
    // restait que 22 et la seconde ligne était tranchée en son milieu — vu sur
    // une planche agrandie, pas dans le code.
    return `<div class="tb-cal">${grille(jours, parJour, palette, false, 52)}</div>`;
  }
  return listeSemaine(parJour, jours);
}

// Le repli du téléphone : un jour par ligne, les rendez-vous les uns sous les
// autres. ⚠ LES JOURS VIDES RESTENT À L'ÉCRAN — les retirer donnerait une
// semaine qui se rétrécit à trois lignes et ne se lirait plus comme une
// semaine : c'est justement de voir où il reste de la place qu'il s'agit.
function listeSemaine(parJour, jours) {
  const maintenant = new Date();
  const ajd = jourCle();
  const hhmm = (d) => d.toTimeString().slice(0, 5);

  const ligne = (e) => {
    const c = e.activity && ACTIVITIES[e.activity]
      ? ACTIVITIES[e.activity].color : 'var(--muted-2)';
    const debut = new Date(e.starts_at);
    const fin = e.ends_at ? new Date(e.ends_at) : debut;
    const passe = !e.all_day && fin < maintenant;
    const encours = !e.all_day && debut <= maintenant && fin > maintenant;
    const min = Math.max(0, Math.round((fin - debut) / 60000));
    return `<div class="tb-ev${passe ? ' passe' : ''}${encours ? ' encours' : ''}" style="--c:${c}">
      <span class="tb-ev-h">${e.all_day ? '<i>jour</i>' : hhmm(debut)}</span>
      <span class="tb-ev-b">
        <span class="tb-ev-t">${esc(e.title || '(sans titre)')}</span>
        <span class="tb-ev-d">${[
          e.activity && ACTIVITIES[e.activity] ? esc(ACTIVITIES[e.activity].label) : 'Groupe',
          e.all_day ? 'toute la journée'
            : (min >= 60 ? Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + String(min % 60).padStart(2, '0') : '') : min + ' min'),
          e.location ? esc(e.location) : '',
          e.attendees > 1 ? e.attendees + ' participants' : '',
        ].filter(Boolean).join(' · ')}</span>
      </span>
    </div>`;
  };

  return `<div class="tb-sem">${jours.map(j => {
    const l = parJour.get(j) || [];
    const d = new Date(`${j}T12:00:00`);
    const cls = [j === ajd ? 'ajd' : '', j < ajd ? 'avant' : '', l.length ? '' : 'vide']
      .filter(Boolean).join(' ');
    return `<div class="tb-sj${cls ? ' ' + cls : ''}">
      <div class="tb-sj-d">
        <b>${esc(d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''))}</b>
        <i>${d.getDate()}</i>
      </div>
      <div class="tb-sj-c">${l.length ? l.map(ligne).join('')
        : '<span class="tb-sj-rien">—</span>'}</div>
    </div>`;
  }).join('')}</div>`;
}

function formAgendas(cles, onSaved) {
  openModal('Agendas des structures',
    `<div id="f-ag">${champsAgendas(cles)}
     <details class="ag-aide"><summary>Où trouver l'identifiant d'un calendrier ?</summary>${modeEmploi()}</details>
</div>
     <div class="form-actions"><button class="btn ghost" id="ag-x">Annuler</button><button class="btn" id="ag-ok">Enregistrer</button></div>`,
    { wide: true, onOpen: (m) => {
      m.querySelector('#ag-x').onclick = () => closeModal();
      m.querySelector('#ag-ok').onclick = async () => {
        try {
          await enregistrerAgendas(m.querySelector('#f-ag'), cles);
          closeModal(true); onSaved();
        } catch (e) { toast(e.message, 'err'); }
      };
    } });
}
async function enregistrerReglage(cle, valeur) {
  const existe = db.t('settings').some(s => s.key === cle);
  if (!existe && !valeur) return;
  if (existe) await db.update('settings', cle, { value: valeur });
  else await db.insert('settings', { key: cle, value: valeur });
}

// ---------- patrimoine et locatif ----------
function cartePatrimoine() {
  if (!scope.canPatrimony && !scope.canRental) return '';
  const cellules = [];
  if (scope.canPatrimony) {
    const biens = db.t('properties').filter(p => p.status !== 'Vendu');
    const prets = db.t('loans'), baux = db.t('leases'), charges = db.t('expenses'), loyers = db.t('rent_payments');
    const m = biens.map(p => propertyMetrics(p, prets, baux, charges, loyers));
    const vendus = prets.filter(l => db.t('properties').some(p => p.id === l.property_id && p.status === 'Vendu')).map(l => loanStatus(l)).filter(st => st.balance > 0);
    const valeur = m.reduce((s, x) => s + x.value, 0);
    const dette = m.reduce((s, x) => s + x.debt, 0) + vendus.reduce((s, st) => s + st.balance, 0);
    const cf = m.reduce((s, x) => s + x.cashflow, 0) - vendus.reduce((s, st) => s + st.monthly, 0);
    cellules.push(
      { l: 'Valeur du parc', v: eur(valeur), s: `${biens.length} bien${biens.length > 1 ? 's' : ''}`, go: '#/patrimoine/biens' },
      { l: 'Capital restant dû', v: eur(dette), s: `${prets.length} prêt${prets.length > 1 ? 's' : ''}`, go: '#/patrimoine/prets' },
      { l: 'Cash-flow mensuel', v: eur2(cf), s: 'après charges', cls: cf >= 0 ? 'pos' : 'neg', go: '#/patrimoine' });
  }
  if (scope.canRental) {
    const mk = isoDay().slice(0, 7);
    const actifs = db.t('leases').filter(l => l.active !== false && activeInMonth(l, mk));
    const du = actifs.reduce((s, l) => s + dueOf(l, rowOf(l.id, mk)), 0);
    const recu = actifs.reduce((s, l) => s + receivedOf(rowOf(l.id, mk)), 0);
    const impayes = db.t('leases').map(l => balanceOf(l.id)).filter(b => b > 0.005);
    const vacants = db.t('units').filter(u => u.active !== false && !actifs.some(l => l.unit_id === u.id)).length;
    cellules.push({
      l: 'Loyers du mois', v: `${eur(recu)} <small>/ ${eur(du)}</small>`,
      s: `${impayes.length} retard${impayes.length > 1 ? 's' : ''} · ${vacants} lot${vacants > 1 ? 's' : ''} vacant${vacants > 1 ? 's' : ''}`,
      cls: impayes.length || vacants ? 'neg' : '', go: '#/locatif',
    });
  }
  return `<section class="card">
    <div class="card-head"><h2>Patrimoine &amp; locatif</h2></div>
    <div class="tb-pat">${cellules.map(c => `<div class="tb-pcell click" data-go="${c.go}">
      <span class="lbl">${c.l}</span><span class="v ${c.cls || ''}">${c.v}</span><span class="s">${c.s}</span></div>`).join('')}</div>
  </section>`;
}

/* ==========================================================================
   AJOUTÉ LE 12/11/2026 — ce que le tableau de bord ne montrait pas encore.
   Le chemin de l'argent, les chantiers, la publicité, les envois automatiques.
   Les quatre lisent `js/data/chiffres.js` : aucune définition n'est écrite ici.
   ========================================================================== */

// Le nom de la période affichée, pour le bandeau. ⚠ Il dit l'EXERCICE quand la
// structure en a un : « année 2026 » sur RGD Renova serait faux de trois mois.
// Le nom à mettre dans une phrase. Une seule structure : son nom. Plusieurs :
// une formule neutre, parce qu'énumérer quatre marques au milieu d'une phrase
// la rend illisible.
// Le tiret des cartes sans donnée : plus petit et plus pâle que le chiffre
// qu'il remplace, pour qu'une absence ne pèse pas autant qu'une valeur.
const STYLE_TIRET = 'style="font-size:30px;opacity:.55"';
const nomDesStructures = (cles) => (cles.length === 1 && ACTIVITIES[cles[0]]
  ? ACTIVITIES[cles[0]].label : 'ces structures');

function periodeAffichee(state, cles) {
  if (state.periode === 'mois') {
    return new Date(state.mois + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  if (state.periode === 'quarter') return 'trimestre en cours';
  const ex = cles.length === 1 ? exerciceDe(cles[0]) : null;
  return ex && ex.label.includes('–') ? `exercice ${ex.label}` : `année ${new Date().getFullYear()}`;
}

const jourCourt = (iso) => (iso
  ? new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  : '');
// L'âge d'une échéance dépassée, en mots. ⚠ C'est lui qui fait agir, pas le

/**
 * Le chemin de l'argent — mise en page du 17/11/2026, proposée par Élodie :
 * « facturé / encaissé, et le chiffre en haut en gros le reste à facturer ».
 *
 * ⚠ TROIS PASSES LE MÊME JOUR, et chacune corrige la précédente. Les lire
 * dans l'ordre évite de refaire le chemin :
 * 1. La carte comparait signé / facturé / encaissé d'une même fenêtre : trois
 *    cohortes d'euros sans rapport. Voir `cheminDesSignes` pour les mesures qui
 *    l'ont établi, et pourquoi AUCUNE période ne répare ça.
 * 2. Refaite sur la cohorte des signés — Élodie a corrigé : elle veut le CA
 *    facturé DU MOIS (12 253 €), celui de sa comptabilité, pas la part
 *    facturée des seuls chantiers signés en novembre (9 093 €).
 * 3. Et le montant signé en tête portait à confusion : c'est le RESTE À
 *    FACTURER qui monte en gros. C'est le seul des quatre nombres sur lequel
 *    on peut agir.
 *
 * ⚠ LA TÊTE ET LES TUILES NE PARLENT PAS DU MÊME ARGENT, et les libellés le
 * portent. Le reste à facturer ne concerne que les chantiers SIGNÉS sur la
 * période ; le CA facturé contient des factures de chantiers signés il y a six
 * mois. Aucune soustraction entre eux ne tombe juste. Ne pas réintroduire le
 * montant signé « pour le contexte » : il invite précisément à cette
 * soustraction, et c'est ce qu'Élodie a fait retirer.
 *
 * ⚠ PAS DE BARRE DE PROGRESSION. Elles se mesuraient sur le montant signé ;
 * sans lui, elles rapporteraient des populations différentes l'une à l'autre.
 * Une barre fausse se lit, une barre absente ne ment pas.
 *
 * ⚠ LA CARTE SURVIT À UN MOIS SANS SIGNATURE, et c'est délibéré : septembre
 * 2026 n'a eu aucune signature mais 16 479 € de factures. Rendre '' aurait
 * fait disparaître le CA du mois avec le reste à facturer, et ouvert un trou
 * de 7 colonnes dans la rangée.
 *
 * ⚠ « RESTE À FACTURER » N'EST PAS UN IMPAYÉ : c'est du chantier en cours.
 * Élodie a écarté une carte sur l'argent non rentré le même jour.
 */
function carteArgent(cles, r, state) {
  // ⚠ ELLE SORT POUR TOUTES LES STRUCTURES DEPUIS LE 18/11/2026, et elle
  // était réservée à RGD. Élodie : « la présentation de la vue de rgd renova,
  // je veux exactement la même pour btp expertise et la référence courtage ».
  //
  // ⚠ MAIS SEULE RGD A DES DEVIS SUIVIS DANS LE CRM, et ça, ça ne change pas :
  // le reste à facturer se calcule sur `rgd_devis` et `rgd_devis_crm`. Ailleurs
  // la tête affiche « — » et la ligne du dessous dit pourquoi. Écrire « 0 € »
  // annoncerait qu'il ne reste rien à facturer : ce n'est pas la même chose que
  // « on ne le sait pas encore ». Même règle pour l'encaissé, que seules les
  // structures dont l'outil le dépose savent donner.
  //
  // ⚠ ELLE NE REND PLUS JAMAIS '' : la rangée du haut n'a donc plus à s'adapter,
  // et `semaineCollee` est vrai partout où il y a le pilotage. C'est ce qui rend
  // les trois vues identiques, y compris un mois sans la moindre signature.
  //
  // En vue groupe, la tête reste celle de RGD tandis que les deux tuiles portent
  // le cumul des structures — c'est ce que dit chaque libellé.
  const suitLesDevis = cles.includes('rgd') && scope.canRgd;
  const a = suitLesDevis ? cheminDesSignes(cles, r) : null;
  const t = total(cles, r, scope.deals());
  const encaisse = cumulMensuel(cles, r, 'encaisse');
  // ⚠ DEUX ABSENCES QUI NE SE DISENT PAS PAREIL, et la carte les a confondues
  // pendant une demi-journée (18/11/2026) : une structure qui NE SUIT PAS ses
  // devis dans le CRM rend « — », une structure qui les suit mais n'a RIEN
  // SIGNÉ sur la période rend « 0 € ». La première ne sait pas, la seconde sait
  // que c'est zéro. Confondre les deux annonçait à RGD, un mois creux, que ses
  // devis n'étaient pas suivis.
  const reste = suitLesDevis ? (a ? a.reste : 0) : null;
  const nb = a ? a.nb : 0;
  // ⚠ EN VUE GROUPE, LE DÉTAIL EST PAR STRUCTURE ET NON PAR CHANTIER
  // (18/11/2026, Élodie : « le chemin de l'argent est très ciblé pour rgd
  // renova, réadapte-le pour toutes les structures »). Lister trois chantiers
  // RGD sous deux tuiles qui cumulent le groupe faisait lire la carte comme
  // celle de RGD seule.
  //
  // ⚠ `t.lignes` PORTE DÉJÀ LE CA DE CHAQUE STRUCTURE : `total()` les calcule
  // une par une avant de les additionner. Le relire ici donnerait un second
  // calcul du même nombre, qui finirait par diverger du cumul affiché juste
  // au-dessus.
  //
  // ⚠ ET LE RESTE À FACTURER SE DEMANDE STRUCTURE PAR STRUCTURE : hors RGD,
  // `cheminDesSignes` rend `null` dès sa première ligne — ce n'est pas trois
  // parcours de plus, c'est trois sorties immédiates. `null` veut dire « cette
  // structure ne suit pas ses devis ici », et s'écrit « — », jamais « 0 € ».
  const groupe = cles.length > 1;
  const parStructure = !groupe ? [] : cles.map((k) => {
    const c = cheminDesSignes([k], r);
    return {
      cle: k, label: ACTIVITIES[k].label,
      ca: t.lignes.find(x => x.cle === k)?.ca || 0,
      reste: c ? c.reste : null,
      nb: c ? c.nb : 0,
    };
  }).sort((x, y) => (y.reste ?? -1) - (x.reste ?? -1) || y.ca - x.ca);
  const suivies = parStructure.filter(x => x.reste !== null).map(x => x.label);
  const pct = (l) => (l.montant ? Math.round(l.facture / l.montant * 100) : 0);
  return `<section class="card tb-argent">
    <h2>Le chemin de l'argent</h2>
    <span class="tb-sous">ce qui reste \u00e0 facturer, et l'argent du mois \u00b7 ${esc(periodeAffichee(state, cles))}</span>
    ${/* ⚠ LE TIRET EST PLUS PETIT QUE LE CHIFFRE QU'IL REMPLACE : à 46 px,
          un cadratin devient une barre pleine aussi lourde qu'un montant, et
          l'œil la lit comme une valeur. Une absence doit peser moins. */ ''}
    ${reste === null ? `<div class="tb-gros" ${STYLE_TIRET}>\u2014</div>`
      : `<div class="tb-gros"><span class="tb-nb" data-n="${reste}" data-eur="1">${eur(reste)}</span></div>`}
    ${/* ⚠ EN VUE GROUPE, LA LIGNE NOMME SON PÉRIMÈTRE. Le grand chiffre ne
          cumule que les structures qui suivent leurs devis dans le CRM — une
          seule aujourd'hui. Sans ce mot, il se lisait comme le reste à facturer
          du groupe entier, alors que deux structures sur trois n'y entrent pas. */ ''}
    <span class="tb-sous">${reste === null
      ? `les devis de ${esc(nomDesStructures(cles))} ne sont pas encore suivis dans le CRM`
      : nb ? `restant \u00e0 facturer sur ${nb} chantier${nb > 1 ? 's' : ''} sign\u00e9${nb > 1 ? 's' : ''} sur la p\u00e9riode${
          groupe && suivies.length ? ` \u00b7 ${esc(suivies.join(' et '))}` : ''}`
      : 'aucun chantier sign\u00e9 sur la p\u00e9riode'}</span>
    ${/* ⚠ DEUX TUILES, PAS TROIS : `tb-flux` est une grille de trois colonnes
          dans app.css, qu'on ne touche pas (une autre session y travaille). */ ''}
    <div class="tb-flux" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="tb-fx">
        <span class="lb">Factur\u00e9</span>
        <b class="tb-nb" data-n="${t.ca}" data-eur="1">${eur(t.ca)}</b>
        <span class="ss">CA HT \u00e9mis \u00b7 tous chantiers confondus</span></div>
      ${/* ⚠ « — » ET NON « 0 € » QUAND L'OUTIL NE DONNE PAS L'ENCAISSÉ :
            `cumulMensuel` rend `null` pour une structure qui ne dépose pas ce
            champ. Un zéro dirait « rien n'est rentré ». */ ''}
      <div class="tb-fx">
        <span class="lb">Encaiss\u00e9</span>
        ${encaisse === null ? '<b>\u2014</b>'
          : `<b class="tb-nb" data-n="${encaisse}" data-eur="1">${eur(encaisse)}</b>`}
        <span class="ss">${encaisse === null ? 'pas encore suivi pour cette structure'
          : 'r\u00e8glements re\u00e7us sur la p\u00e9riode'}</span></div>
    </div>
    ${/* ⚠ LE DÉTAIL EST STYLÉ EN LIGNE : `tb-detail` est dessiné pour les
          cartes claires et disparaîtrait sur le dégradé. */ ''}
    ${/* ⚠ UN SEUL DÉTAIL, DEUX DÉCOUPAGES : par structure en vue groupe, par
          chantier dans l'espace d'une structure. C'est la même question — d'où
          vient ce qui reste à facturer — posée à l'échelle qu'on regarde.

          ⚠ LE DÉTAIL EST STYLÉ EN LIGNE : `tb-detail` est dessiné pour les
          cartes claires et disparaîtrait sur le dégradé. */ ''}
    ${groupe ? `<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,.22);padding-top:6px">
      <span class="tb-sous" style="display:block;margin-bottom:2px">structure par structure</span>
      ${parStructure.map(x => `<div style="display:flex;align-items:baseline;gap:10px;padding:6px 0;font-size:12.5px">
        <span style="font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:42%">${esc(x.label)}</span>
        <span style="opacity:.8;font-size:11.5px">${eur(x.ca)} factur\u00e9${x.reste !== null && x.nb
          ? ` \u00b7 ${x.nb} chantier${x.nb > 1 ? 's' : ''} sign\u00e9${x.nb > 1 ? 's' : ''}` : ''}</span>
        <b style="margin-left:auto;font-variant-numeric:tabular-nums${x.reste === null ? ';opacity:.6' : ''}"${
          x.reste === null ? ' title="Les devis de cette structure ne sont pas suivis dans le CRM"' : ''}>${
          x.reste === null ? '\u2014' : x.reste ? eur(x.reste) : 'sold\u00e9'}</b>
      </div>`).join('')}
      <div style="font-size:11.5px;opacity:.78;padding-top:2px">à droite, ce qui reste \u00e0 facturer</div>
    </div>`
    : a && a.lignes.length ? `<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,.22);padding-top:6px">
      <span class="tb-sous" style="display:block;margin-bottom:2px">chantier par chantier</span>
      ${a.lignes.slice(0, 3).map(l => `<div style="display:flex;align-items:baseline;gap:10px;padding:6px 0;font-size:12.5px">
        <span style="font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:42%">${esc(l.client)}</span>
        <span style="opacity:.8;font-size:11.5px">${eur(l.montant)} sign\u00e9s \u00b7 ${pct(l)}\u00a0% factur\u00e9</span>
        <b style="margin-left:auto;font-variant-numeric:tabular-nums">${l.reste ? eur(l.reste) : 'sold\u00e9'}</b>
      </div>`).join('')}
      ${a.lignes.length > 3 ? `<div style="font-size:11.5px;opacity:.78;padding-top:2px">+ ${a.lignes.length - 3} autre${a.lignes.length - 3 > 1 ? 's' : ''}</div>` : ''}
    </div>` : ''}
    ${/* ⚠ CE SIGNAL NE PEUT PAS APPARAÎTRE DANS UNE VUE AU MOIS : un devis
          signé depuis plus de deux mois n'est pas dans le mois en cours. Il ne
          se montre que sur Trimestre, Exercice ou Tout. C'est le banc d'essai
          qui l'a établi, pas une relecture. */ ''}
    ${a && a.oublies.length ? `<p class="tb-sous" style="margin:10px 0 0">${a.oublies.length === 1
      ? `${esc(a.oublies[0].client)} a sign\u00e9 il y a ${Math.round(a.oublies[0].jours / 30)} mois (${eur(a.oublies[0].montant)}) et aucune facture n'y est rattach\u00e9e.`
      : `${a.oublies.length} chantiers sign\u00e9s depuis plus de deux mois n'ont aucune facture rattach\u00e9e.`}</p>` : ''}
  </section>`;
}

/* ==========================================================================
   LE BENTO ANIMÉ (12/11/2026) — Élodie, après une maquette vivante :
   « ça c'est super, branche-la sur la vraie base ».

   Ce qui a été refusé avant, et pourquoi c'est noté : trois directions, un
   mélange, trois palettes et trois menus. Le verdict était « on dirait un
   vieux CRM ». Le défaut n'était pas la couleur : c'était que TOUT ÉTAIT
   FIGÉ, et qu'une grille de cartes rectangulaires identiques reste une
   grille de cartes rectangulaires identiques, quelle que soit sa teinte.
   ========================================================================== */

/**
 * Pose la taille d'une tuile sur la carte elle-même, et au besoin un attribut
 * de plus (`attrs`, par exemple `style="grid-row:span 2"`).
 *
 * ⚠ PAS D'EMBALLAGE AUTOUR : un enfant de grille supplémentaire recevrait la
 * largeur, et la carte flotterait dedans sans la remplir. Et ce n'est plus
 * seulement une question de largeur depuis le 17/11/2026 : `.tb-bento > div`
 * porte dans app.css un fond, une bordure et une ombre — un emballage
 * DEVIENDRAIT une carte, avec les vraies cartes dedans.
 *
 * ⚠ LES ATTRIBUTS S'INSÈRENT APRÈS LE GUILLEMET FERMANT DE `class=`, pas au
 * milieu de l'attribut : la carte arrive avec ses propres classes derrière
 * `card` (`tb-argent`, `tb-chaud`…), et écrire le style juste après `card`
 * les avalerait dans la valeur de `style`.
 */
function taille(html, cls, attrs = '') {
  const t = String(html || '').trim();
  if (!t) return '';
  const m = '<section class="card';
  const a = attrs ? ' ' + attrs : '';
  if (!t.startsWith(m)) return `<div class="${cls}"${a}>${t}</div>`;
  const fin = t.indexOf('"', m.length);
  return t.slice(0, m.length) + ' ' + cls + t.slice(m.length, fin + 1) + a + t.slice(fin + 1);
}

// Sous la tuile des chantiers : le compte PAR DEVIS, puis le panier. C'est la
// ligne qui réconcilie les deux écrans — « 2 chantiers · 3 devis signés » dit
// d'un trait pourquoi la vue d'ensemble RGD affiche 3 et celle-ci 2.
// Le nombre affiché par la tuile : les chantiers du planning quand la
// structure les tient (RGD), sinon les affaires gagnées du CRM.
function chantiersDuMois(cles, r, t) {
  const n = cumulMensuel(cles, r, 'chantiers');
  return n == null ? (t.signees ?? null) : n;
}

// ⚠ LA LIGNE QUI RÉCONCILIE. « 1 chantier · 2 devis signés » dit d'un trait
// pourquoi les deux nombres diffèrent : les devis se signent ce mois-ci, les
// chantiers démarrent quand ils démarrent.
function sousChantiers(cles, r, t) {
  const n = cumulMensuel(cles, r, 'devisSignes');
  const bouts = [];
  if (n != null) bouts.push(`${n} devis signé${n > 1 ? 's' : ''} sur la période`);
  bouts.push(t.panier ? `panier ${eur(t.panier)}` : 'panier moyen indisponible');
  return bouts.join(' · ');
}

/**
 * Les deux ou trois dernières lignes derrière un chiffre.
 *
 * ⚠ LE NOM D'ABORD, LE RESTE EN GRIS. C'est le nom qu'on cherche — « qui a
 * demandé », « quel chantier » — pas la référence ni la date. Le détail et
 * le jour suivent, plus petits, sur la même ligne.
 */
function listeDetail(d) {
  if (!d?.lignes?.length) return '';
  const jour = (v) => (v ? new Date(String(v).slice(0, 10) + 'T00:00:00')
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '') : '');
  return `<div class="tb-detail">
    ${d.lignes.map(l => `<div class="tb-dl">
      <span class="n">${esc(l.client || '\u2014')}</span>
      ${l.detail ? `<span class="d">${esc(l.detail)}</span>` : ''}
      <span class="j">${esc(jour(l.date))}</span>
    </div>`).join('')}
    ${d.reste ? `<div class="tb-dr">+ ${d.reste} autre${d.reste > 1 ? 's' : ''}</div>` : ''}
  </div>`;
}

const prenomDe = (u) => {
  const p = String(u?.full_name || '').trim().split(/\s+/)[0];
  return p ? `Bonjour ${esc(p)}, ` : 'Tableau de bord ';
};

// La phrase qui suit le bonjour. ⚠ Elle dit l'EXERCICE quand la structure en a
// un : « voici l'année 2026 » sur RGD Renova serait faux de trois mois.
function phraseHero(state, cles) {
  if (state.periode === 'mois') {
    return 'voici ' + new Date(state.mois + '-01T00:00:00')
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) + '.';
  }
  if (state.periode === 'quarter') return 'voici le trimestre.';
  const ex = cles.length === 1 ? exerciceDe(cles[0]) : null;
  return ex && ex.label.includes('–') ? `voici l'exercice ${ex.label}.` : `voici l'année ${new Date().getFullYear()}.`;
}
/**
 * La grande carte chaude — la publicité Meta (17/11/2026, Élodie : « l'encadré
 * "ce qui dort" je voudrais le remplacer par les données de la publicité meta
 * en conservant les couleurs de cet encadré »).
 *
 * ⚠ CE QUI PARTAIT AVEC ELLE : les factures émises et non réglées. Elles ne
 * sont plus nulle part sur le tableau de bord — elles se lisent dans l'écran
 * Encaissements. C'était un choix d'Élodie, pas un oubli.
 *
 * ⚠ LES TROIS CHIFFRES SONT CEUX QU'ELLE A DEMANDÉS le 12/11 : le montant total
 * dépensé, les leads reçus, et le coût par lead — ce dernier au CENTIME,
 * parce que c'est celui qu'elle compare à ce que Meta lui annonce.
 */
/**
 * Ce que le réseau d'apporteurs rapporte (17/11/2026).
 *
 * Élodie, de l'entonnoir en vue RGD : « j'ai l'impression que ça répète
 * vraiment les données que l'on retrouve juste au-dessus » — et c'était vrai :
 * ses deux premières étapes sont les encadrés « Demandes » et
 * « Rendez-vous », et « devis signés » est déjà écrit sous « Chantiers ».
 * Cette carte prend sa place, et ne répète rien : le tableau de bord ne
 * parlait nulle part des apporteurs.
 *
 * ⚠ ELLE NE REND PLUS JAMAIS '' depuis le 18/11/2026 : sans registre
 * d'apporteurs, elle sort dans son état vide (voir `carteReseauVide`). Le
 * gabarit n'a donc plus de repli — « Pipeline & conversion », qui tenait ce
 * rôle, a été retiré le même jour.
 *
 * ⚠ LE MONTANT ANNONCÉ EST CELUI DES DEVIS GAGNÉS, pas du CA encaissé :
 * `rgd_apports` porte le montant du devis au moment de l'apport. Dire
 * « de chiffre d'affaires » promettrait un rapprochement avec la facturation
 * que ces lignes ne permettent pas.
 */
/**
 * ⚠ LE REGISTRE DES APPORTEURS N'EXISTE QUE DANS L'ESPACE RGD RENOVA
 * (`rgd_apporteurs`). Depuis le 18/11/2026 la carte sort quand même pour les
 * autres structures, dans son état vide — Élodie veut la même présentation
 * partout. Elle le dit au lieu de faire croire à un réseau à zéro.
 *
 * ⚠ ELLE NE SE REMPLIRA PAS TOUTE SEULE : il faudrait un registre
 * d'apporteurs pour BTP Expertise et La Référence Courtage, qui n'existe pas
 * encore. Signalé à Élodie le jour de la livraison.
 */
function carteReseau(cles) {
  const e = reseauApporteurs(cles);
  if (!e) return carteReseauVide(cles);
  const date = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR',
    { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  const decides = e.gagnes + e.perdus;
  return `<section class="card">
    <div class="card-head"><h2>Ce que le réseau rapporte</h2>
      <span class="muted small">apporteurs d'affaires · depuis le début</span></div>
    <div class="tb-gros"><span class="tb-nb" data-n="${e.ca}" data-eur="1">${eur(e.ca)}</span></div>
    <span class="tb-sous">de devis gagnés grâce au réseau${e.commissions
      ? ` · ${eur(e.commissions)} de commissions` : ''}</span>
    <div class="tb-duo">
      ${/* ⚠ UN DIV, PAS UN BOUTON : `.tb-du` est dessiné comme une tuile, et
            un élément <button> hériterait des styles de bouton du navigateur
            qu'il faudrait annuler dans app.css — où travaille une autre
            session. On garde le rôle et le clavier, qui sont ce qui compte.

            ⚠ ET LE CHEVRON EST LÀ POUR QU'ON SACHE QUE ÇA S'OUVRE : une tuile
            cliquable qui ne le dit pas est une fonctionnalité livrée et
            introuvable. */ ''}
      <div class="tb-du${e.gagnes ? ' click' : ''}"${e.gagnes ? ` role="button" tabindex="0"
        aria-expanded="false" aria-controls="reseau-gagnees" data-ouvre="reseau-gagnees"
        style="cursor:pointer"` : ''}><b>${e.gagnes}<small style="font-size:15px;opacity:.5"> / ${decides}</small></b>
        <span>affaires gagnées${e.gagnes ? ' <span class="tb-caret">\u25b8</span>' : ''}</span></div>
      <div class="tb-du"><b>${e.taux === null ? '\u2014' : Math.round(e.taux * 100) + '\u00a0%'}</b>
        <span>des affaires tranchées</span></div>
    </div>
    ${/* ⚠ LE TAUX SE LIT SUR LES AFFAIRES TRANCHÉES, et le libellé le dit.
          Une affaire encore ouverte n'est pas une affaire perdue ; la compter
          au dénominateur ferait baisser le taux à chaque nouvel apport. */ ''}
    ${e.enCours ? `<p class="muted small" style="margin:8px 0 0">${e.enCours} affaire${
      e.enCours > 1 ? 's' : ''} encore sans issue, hors du taux.</p>` : ''}
    ${/* ⚠ LE FILET VERT RATTACHE LE DÉTAIL À SA TUILE. Sans lui, la liste
          dépliée et celle des apporteurs ont la même forme, se touchent, et
          portent les mêmes montants : on ne sait plus où l'une finit. Le défaut
          se voit sur une capture, jamais dans un contrôle — tout était
          « présent ». Style en ligne : app.css porte le travail d'une autre
          session, on n'y ajoute rien. */ ''}
    ${e.gagnes ? `<div id="reseau-gagnees" hidden
      style="border-left:3px solid #22C55E;padding-left:13px;margin-top:10px">
      <p class="muted small" style="margin:0">Les ${e.gagnes} affaires gagnées, de la plus grosse à la plus petite :</p>
      <div class="tb-liste">
        ${e.gagnees.map(g => `<div class="tb-lg">
          <i style="background:#22C55E"></i>
          <span class="tx">${esc(g.client)}<em>${esc(g.apporteur)}${g.date ? ` · ${date(g.date)}` : ''}${
            g.commission ? ` · ${eur(g.commission)} de commission` : ''}</em></span>
          <b>${eur(g.montant)}</b></div>`).join('')}
      </div>
    </div>` : ''}
    ${/* ⚠ UN TITRE, PARCE QU'IL Y A DEUX LISTES. Celle-ci compte par
          APPORTEUR, celle du dessus par AFFAIRE : mêmes pastilles, mêmes
          montants, et rien ne les séparait. */ ''}
    <p class="muted small" style="margin:14px 0 0">Par apporteur :</p>
    <div class="tb-liste">
      ${e.parApporteur.slice(0, 4).map(a => `<div class="tb-lg click" data-go="#/rgd/apporteurs">
        <i style="background:var(--accent)"></i>
        <span class="tx">${esc(a.nom)}<em>${a.apports} apport${a.apports > 1 ? 's' : ''} · ${
          a.gagnes} gagné${a.gagnes > 1 ? 's' : ''}${a.dernier ? ` · dernier le ${date(a.dernier)}` : ''}</em></span>
        <b>${eur(a.ca)}</b></div>`).join('')}
    </div>
    ${/* ⚠ LA SEULE LIGNE SUR LAQUELLE ON PEUT AGIR, et le seul endroit où le
          mot « apporteur » compte au sens strict : `type_partenaire`. Compter
          les fournisseurs ici annoncerait quinze personnes à réactiver qui
          n'ont jamais eu à apporter quoi que ce soit. */ ''}
    ${e.dormants.length ? `<p class="muted small" style="margin:10px 0 0">
      ${e.dormants.length} apporteur${e.dormants.length > 1 ? 's' : ''} déclaré${
        e.dormants.length > 1 ? 's' : ''} n'${e.dormants.length > 1 ? 'ont' : 'a'} encore rien amené :
      ${esc(e.dormants.slice(0, 3).join(', '))}${e.dormants.length > 3
        ? ` et ${e.dormants.length - 3} autre${e.dormants.length - 3 > 1 ? 's' : ''}` : ''}.</p>` : ''}
  </section>`;
}

/**
 * « Qui tire le groupe » — la carte chaude de la vue groupe (17/11/2026).
 *
 * Élodie : « je veux un encadré de la même couleur que publicité meta mais je
 * ne sais pas quoi mettre dedans ». Elle a choisi celle-ci parmi quatre.
 *
 * ⚠ ELLE REMPLACE QUATRE NOMBRES CUMULÉS PAR LE MÊME, RÉPARTI. C'est tout
 * l'intérêt : « CA facturé HT : 18 400 € » ne dit pas d'où il vient, et aucun
 * autre écran ne met les structures côte à côte sur la période choisie. La
 * courbe du bas les compare sur douze mois, pas sur le trimestre en cours.
 *
 * ⚠ RIEN À DIRE À UNE SEULE STRUCTURE : un compte qui ne voit qu'un espace
 * verrait « 100 % du groupe vient de RGD Renova ». La carte se tait alors, et
 * la rangée disparaît avec elle — elle est seule sur douze colonnes, donc
 * aucun trou à reboucher.
 *
 * ⚠ `tb-chaud`, PAS UNE NOUVELLE COULEUR : la classe porte l'habillage orange
 * que la pub Meta occupait, et son commentaire dans app.css dit déjà pourquoi
 * elle n'est plus nommée d'après son contenu. Rien à ajouter à la feuille de
 * style, où travaille une autre session.
 *
 * ⚠ LES COLONNES S'ADAPTENT AU NOMBRE DE STRUCTURES : `auto-fit` plutôt que
 * `repeat(4)`, sinon quatre tuiles de 90 px sur un téléphone. L'inline passe
 * devant la règle mobile de `.tb-flux`, qui force une seule colonne.
 */
function carteReseauVide(cles) {
  const nom = esc(nomDesStructures(cles));
  return `<section class="card">
    <div class="card-head"><h2>Ce que le réseau rapporte</h2>
      <span class="muted small">apporteurs d'affaires · depuis le début</span></div>
    <div class="tb-gros" ${STYLE_TIRET}>—</div>
    <span class="tb-sous">aucun apporteur d'affaires enregistré pour ${nom}</span>
    <div class="tb-duo">
      <div class="tb-du"><b>—</b><span>affaires gagnées</span></div>
      <div class="tb-du"><b>—</b><span>des affaires tranchées</span></div>
    </div>
    <p class="muted small" style="margin:10px 0 0">Le registre des apporteurs vit
      aujourd'hui dans l'espace RGD Renova. Cette carte se remplira le jour où
      ${nom} en aura un.</p>
  </section>`;
}

function carteGroupe(cles, r, deals, state) {
  if (cles.length < 2) return '';
  const l = cles
    .map(k => ({ ...chiffres(k, r, deals), label: ACTIVITIES[k].label }))
    .sort((a, b) => (b.ca || 0) - (a.ca || 0));
  const caTotal = l.reduce((s, x) => s + (x.ca || 0), 0);
  const part = (x) => caTotal ? Math.round((x.ca || 0) / caTotal * 100) : null;
  const tete = l[0];
  return `<section class="card tb-chaud">
    <h2>Qui tire le groupe</h2>
    <span class="tb-sous">chiffre d'affaires facturé HT, structure par structure · ${esc(periodeAffichee(state, cles))}</span>
    <div class="tb-gros">${caTotal ? `<span class="tb-nb" data-n="${part(tete)}">${part(tete)}</span> %` : '—'}</div>
    <span class="tb-sous">${caTotal
      ? `du chiffre d'affaires du groupe vient de ${esc(tete.label)}`
      : 'aucune facture sur la période, toutes structures confondues'}</span>
    ${/* ⚠ 190 px, PAS 150 : la carte n'occupe plus que 5 colonnes depuis
          qu'elle est à côté de la courbe. À 150, quatre structures se
          rangeaient 3 + 1, avec une tuile orpheline sur la seconde ligne. */ ''}
    <div class="tb-flux" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
      ${l.map(x => `<div class="tb-fx">
        <span class="lb">${esc(x.label)}</span>
        <b class="tb-nb" data-n="${x.ca || 0}" data-eur="1">${eur(x.ca || 0)}</b>
        ${/* ⚠ « affaires non comptées » N'EST PAS « 0 affaire » : `signees` est
              nul quand l'outil d'une structure n'envoie qu'un total de chiffre
              d'affaires. Écrire 0 accuserait une structure qui vend. */ ''}
        ${/* ⚠ PAS DE PART QUAND IL N'Y A RIEN À PARTAGER : sans facture sur la
              période, « part du groupe indisponible » s'écrivait quatre fois de
              suite et donnait à lire une panne là où il n'y a qu'un mois calme. */ ''}
        <span class="ss">${part(x) === null ? '' : part(x) + '\u00a0% du groupe · '}${
          x.signees === null ? 'affaires non comptées'
            : `${x.signees} affaire${x.signees > 1 ? 's' : ''} signée${x.signees > 1 ? 's' : ''}`}</span>
        <div class="tb-piste"><i data-large="${caTotal ? ((x.ca || 0) / caTotal * 100).toFixed(1) : '0'}"></i></div>
      </div>`).join('')}
    </div>
  </section>`;
}

/**
 * ⚠ ELLE SORT MÊME SANS CAMPAGNE DEPUIS LE 18/11/2026, dans son état vide :
 * même présentation pour les trois structures. Contrairement au réseau, celle-ci
 * SE REMPLIRA toute seule — le relevé Meta range déjà ses lignes par structure
 * (`meta_ads_periode.activity`). Le jour où BTP Expertise ou La Référence
 * Courtage fera tourner une campagne, elle apparaît ici sans rien toucher.
 */
function carteMeta(cles) {
  const p = publicite(cles);
  if (!p) return carteMetaVide(cles);
  const virgule = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const bloc = (lb, val, ss) => `<div class="tb-fx"><span class="lb">${lb}</span>
    <b>${val}</b><span class="ss">${esc(ss)}</span></div>`;
  return `<section class="card tb-x5 tb-chaud">
    <h2>Publicité Meta</h2>
    <span class="tb-sous">${p.du ? 'depuis le ' + jourCourt(p.du) : 'depuis le d\u00e9but'}${p.au ? ', relev\u00e9 le ' + jourCourt(p.au) : ''}</span>
    <div class="tb-gros"><span class="tb-nb" data-n="${p.depense}" data-eur="1">${eur(p.depense)}</span></div>
    <span class="tb-sous">d\u00e9pens\u00e9s en tout</span>
    <div class="tb-flux">
      ${bloc('Leads', `<span class="tb-nb" data-n="${p.leads}">${p.leads}</span>`, 'coordonn\u00e9es re\u00e7ues')}
      ${bloc('Par lead', p.coutParLead == null ? '\u2014'
        : eur(p.coutParLead, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'd\u00e9pense \u00f7 leads')}
      ${bloc('Clics', `<span class="tb-nb" data-n="${p.clics}">${p.clics}</span>`,
        `${p.campagnes} campagne${p.campagnes > 1 ? 's' : ''}`)}
    </div>
    ${p.tauxLead != null ? `<p><b>${virgule(p.tauxLead * 100)} %</b> des clics laissent leurs coordonn\u00e9es.</p>` : ''}
  </section>`;
}

function carteMetaVide(cles) {
  const bloc = (lb, ss) => `<div class="tb-fx"><span class="lb">${lb}</span>
    <b>—</b><span class="ss">${esc(ss)}</span></div>`;
  // ⚠ `tb-x5` EST POSÉ ICI, PAS PAR `taille()` : cette carte n'est pas
  // emballée au point d'appel, contrairement aux autres. L'oublier a coûté
  // 5 colonnes aux vues BTP et Courtage — vu au relevé des rangées.
  return `<section class="card tb-x5 tb-chaud">
    <h2>Publicité Meta</h2>
    <span class="tb-sous">aucune campagne relevée pour ${esc(nomDesStructures(cles))}</span>
    <div class="tb-gros" ${STYLE_TIRET}>—</div>
    <span class="tb-sous">dépensés en tout</span>
    <div class="tb-flux">
      ${bloc('Leads', 'coordonn\u00e9es re\u00e7ues')}
      ${bloc('Par lead', 'd\u00e9pense \u00f7 leads')}
      ${bloc('Clics', 'aucune campagne')}
    </div>
    <p>Les relevés Meta sont rangés par structure : dès qu'une campagne tourne
      pour celle-ci, ses chiffres arrivent ici sans rien avoir à brancher.</p>
  </section>`;
}

/* ---------------------------------------------------------------------------
   L'ANIMATION

   ⚠ TROIS GARDE-FOUS, CHACUN POUR UNE PANNE CONSTATÉE :

   1. On compte des PAS, pas des millisecondes. La première version lisait
      `performance.now()` ; hors écran elle rendait un instant antérieur au
      départ, la progression passait en négatif et le compteur affichait
      un montant NÉGATIF. Borner la progression l'a figée à zéro — le défaut avait
      seulement changé de visage.
   2. `prefers-reduced-motion` coupe tout : les chiffres sont posés d'emblée.
      Un tableau de bord qu'on ouvre vingt fois par jour ne doit pas imposer
      son petit spectacle à qui ne le supporte pas.
   3. Un filet de sécurité pose l'état final au bout d'une seconde et demie,
      au cas où l'observateur ne se déclenche pas (aperçu figé, onglet caché).
      Une carte invisible parce que son animation n'est jamais partie serait
      une carte perdue.
--------------------------------------------------------------------------- */
const SANS_MOUVEMENT = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function compteur(el) {
  const fin = Number(el.dataset.n);
  if (!isFinite(fin)) return;
  const dec = Number(el.dataset.dec || 0), unite = el.dataset.eur ? ' €' : '';
  const ecrire = (v) => {
    el.textContent = el.dataset.eur ? eur(v) : v.toLocaleString('fr-FR',
      { minimumFractionDigits: dec, maximumFractionDigits: dec }) + unite;
  };
  if (SANS_MOUVEMENT()) return ecrire(fin);
  const total = 34;
  let i = 0;
  const pas = () => {
    i++;
    const p = i / total;
    ecrire(fin * (1 - Math.pow(1 - p, 3)));     // on ralentit en arrivant
    if (i < total) setTimeout(pas, 28); else ecrire(fin);
  };
  pas();
}

export function animerTableau(root) {
  const bento = root.querySelector('.tb-bento');
  if (!bento) return;
  const cartes = [...bento.children];
  const doux = !SANS_MOUVEMENT();
  // ⚠ C'EST LE SCRIPT QUI ARME L'ENTRÉE, et seulement une fois qu'il est sûr
  // de pouvoir la jouer : la feuille de style ne cache rien de son côté. Sans
  // cette ligne, l'écran s'affiche d'un bloc — sans animation, mais entier.
  if (doux) bento.classList.add('anime');
  const animer = (c) => {
    if (c.dataset.vu) return;
    c.dataset.vu = '1';
    c.classList.add('tb-vu');
    const poser = (f) => (doux ? setTimeout(f, 200) : f());
    c.querySelectorAll('[data-large]').forEach(b => poser(() => { b.style.width = b.dataset.large + '%'; }));
    c.querySelectorAll('[data-arc]').forEach(a => poser(() => {
      const c2 = Number(a.dataset.circ || 339);
      a.style.strokeDashoffset = c2 - c2 * Math.min(1, Number(a.dataset.arc) / 100);
    }));
    c.querySelectorAll('.tb-nb').forEach(n => compteur(n));
  };
  if (!doux) return cartes.forEach(animer);
  const obs = new IntersectionObserver((lot) => {
    lot.forEach(e => {
      if (!e.isIntersecting) return;
      setTimeout(() => animer(e.target), (cartes.indexOf(e.target) % 4) * 80);
      obs.unobserve(e.target);
    });
  }, { threshold: 0.12 });
  cartes.forEach(c => obs.observe(c));
  setTimeout(() => cartes.forEach(animer), 1500);
}
