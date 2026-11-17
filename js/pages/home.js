// Tableau de bord du groupe : ce qui s'est passé sur la période, structure par
// structure, puis ce qu'il y a à faire aujourd'hui. Tous les chiffres viennent de
// js/data/chiffres.js — la vue d'ensemble de Pilotage lit la même source.
import { db } from '../data/db.js';
import { chargerChart } from '../chart.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS } from '../data/schema.js';
import { propertyMetrics, loanStatus } from '../data/finance.js';
import {
  chiffres, total, entonnoir, entonnoirParCohorte, structuresHorsEntonnoir, caMois, leadsMois, derniersMois, moisCle, moisPrecedent,
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
  esc, eur, daysSince, periodRange, inRange, isoDay, userName,
  openModal, closeModal, toast,
} from '../ui.js';
import { activeInMonth, rowOf, dueOf, receivedOf, balanceOf } from './locatif.js';
import {
  idsDe, idsDeTous, structuresRaccordees, cadreJour, noteAgenda, modeEmploi,
  champsAgendas, enregistrerAgendas, peutRaccorder,
} from '../agenda.js';
import { evenementsEnregistres, derniereSync, agendasDe } from '../agenda-sync.js';
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

      // Les deux taux se lisent sur l'entonnoir, c'est-à-dire sur les affaires nées
      // pendant la période. Les calculer sur des populations différentes (RDV du mois
      // ÷ leads du mois) donnerait des taux que l'entonnoir juste en dessous contredit.
      // ⚠ CALCULÉ ICI, PAS DANS LE GABARIT : le gabarit en a besoin deux
      // fois (choisir, puis afficher), et l'appeler deux fois relirait les
      // deux tables pour rien.
      const reseau = state.filtre === 'groupe' ? '' : carteReseau(cles);
      const ent = entonnoir(cles, r, deals);
      const jalon = (champ) => ent.find(x => x.champ === champ)?.n ?? null;
      const recus = jalon('leads'), avecRdv = jalon('rdv'), conclus = jalon('signed');
      const tauxRdv = recus && avecRdv !== null ? avecRdv / recus : null;
      const tauxVente = avecRdv && conclus !== null ? conclus / avecRdv : null;
      const entAvant = comparaisonEntonnoir(cles, r, deals);
      const horsEntonnoir = structuresHorsEntonnoir(cles);
      const parCohorte = entonnoirParCohorte(cles);
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
              colonnes figées ont disparu, « Ma journée » et « À traiter »
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
          ${(() => {
            const argent = carteArgent(cles, r, state);
            return taille(argent, 'tb-x7')
              + (scope.canPilotage ? taille(carteObjectifs(cles, deals), argent ? 'tb-x5' : 'tb-x12') : '');
          })()}

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
                continue de nourrir l'entonnoir, le panier et le taux de
                transformation, qui parlent bien de signatures. */ ''}
          ${kpi(cles.length === 1 && cles[0] === 'rgd' ? 'Chantiers' : 'Affaires signées',
            chantiersDuMois(cles, r, t) ?? '—',
            evolution(chantiersDuMois(cles, periodePrecedente(r), t), chantiersDuMois(cles, r, t)),
            serieDe(cle => cles.reduce((s, k) => s + signeesMois(k, cle, deals), 0)),
            sousChantiers(cles, r, t), false, '', '',
            detailsPeriode(cles, r, 'chantiers'))}
          ${kpi('CA facturé HT', eur(t.ca), evolution(avant?.ca, t.ca), serieDe(caDu),
            obj ? `objectif ${eur(obj)}` : scope.canPilotage ? 'aucun objectif fixé' : 'sur vos affaires', false, '', '',
            detailsPeriode(cles, r, 'ca'))}

          ${/* ⚠ EN VUE FILTRÉE, LE RÉSEAU PREND LA PLACE DE L'ENTONNOIR
                (17/11/2026). Élodie : « j'ai l'impression que pipeline &
                conversion répète vraiment les données que l'on retrouve juste
                au-dessus ». En vue GROUPE l'entonnoir reste : c'est le cumul
                des structures, que l'écran RGD ne peut pas donner.

                ⚠ ET IL REVIENT SI LE RÉSEAU N'A RIEN À DIRE : `carteReseau`
                rend '' hors RGD, et sans ce repli, filtrer sur BTP ou Courtage
                laisserait un trou de 7 colonnes dans la rangée. */ ''}
          ${reseau ? taille(reseau, 'tb-x7') : `
          <section class="card tb-x7">
            <div class="card-head"><h2>Pipeline &amp; conversion</h2>
              <span class="muted small">${parCohorte ? 'prospects arrivés sur la période, suivis jusqu\'à aujourd\'hui'
                : cles.every(k => externe(k)?.direct) ? 'demandes, rendez-vous, devis envoyés et signés de la période'
                : 'affaires créées sur la période'} · taux de passage</span></div>
            ${!parCohorte && ent.some((s, i) => i && s.n > ent[i - 1].n) ? `<p class="muted small tb-hors">
              <span class="ag-abs">Une étape dépasse la précédente : ces affaires sont arrivées avant la période. Un entonnoir ne se lit bien que sur une période assez longue.</span></p>` : ''}
            ${horsEntonnoir.length ? `<p class="muted small tb-hors">${horsEntonnoir.map(k =>
              `<span class="ag-src"><span class="dot" style="background:${ACTIVITIES[k].color}"></span>${esc(ACTIVITIES[k].label)}</span>`).join('')}
              ${horsEntonnoir.length > 1 ? "n'apparaissent pas ici : leurs outils envoient" : "n'apparaît pas ici : son outil envoie"} des totaux, pas le détail des étapes.</p>` : ''}
            ${/* ⚠ LES ÉTAPES SONT DES LIGNES, PAS DES BARRES PLEINES (05/11/2026,
                  Élodie : « mettre le même tableau que l'on retrouve dans vue
                  d'ensemble du tableau de bord RGD Renova »). Le nombre reste
                  HORS de la barre : dans la barre, « Signés : 0 » n'aurait plus
                  de place où s'écrire, et c'est justement la ligne qu'on regarde.

                  ⚠ LA BARRE SE MESURE SUR L'ÉTAPE LA PLUS HAUTE, pas sur la
                  précédente : c'est elle qui donne la forme de l'entonnoir. */ ''}
            <div class="tb-etapes">
              ${ent.map((s, i) => {
                const prev = i ? ent[i - 1].n : null;
                const haut = Math.max(...ent.map(x => x.n)) || 1;
                const large = Math.min(100, s.n / haut * 100);
                const fin = i === ent.length - 1;
                const taux = prev ? Math.round(s.n / prev * 100) : null;
                return `<div class="tb-et">
                  <div class="h"><b>${s.nom}</b>${taux === null ? (prev === null ? '' : '<span>—</span>') : taux > 100
                    ? `<span title="Plus d'affaires à cette étape qu'à la précédente : elles viennent de mois antérieurs.">↑ ${taux} %</span>`
                    : `<span>↓ ${taux} %</span>`}${s.partiel ? '<span title="Toutes les structures ne comptent pas cette étape.">partiel</span>' : ''}
                    <em>${s.n}</em></div>
                  <div class="tb-piste"><i data-large="${Math.max(large, s.n ? 4 : 0).toFixed(1)}"
                    style="background:${degradeEtape(i, ent.length, fin)}"></i></div>
                </div>`;
              }).join('')}
            </div>
            <div class="tb-funnel-out">
              <b>${recus && conclus !== null ? pct(conclus / recus) + ' %' : '—'}</b>
              <span class="muted small">${recus && conclus !== null
                ? `des leads reçus sur la période sont déjà signés${conclus ? ` · ${conclus} affaire${conclus > 1 ? 's' : ''}` : ''}`
                : 'taux de transformation indisponible sur cette période'}</span>
            </div>
            ${/* ⚠ CES DEUX TAUX ÉTAIENT DEUX TUILES DU BANDEAU, et ils ont failli
                  disparaître en passant de six indicateurs à quatre (12/11/2026).
                  L'entonnoir au-dessus montre bien le passage d'une étape à
                  l'autre, mais PAS son évolution : « 100 % » ne dit pas si c'était
                  60 % le mois dernier. C'est cette comparaison-là qu'on reperd en
                  supprimant une tuile, et elle revient ici — à sa place, sous
                  l'entonnoir qu'elle commente.

                  ⚠ EN POINTS, PAS EN POURCENTAGE : un taux qui passe de 40 % à
                  60 % gagne 20 points, pas 50 %. */ ''}
            <div class="tb-taux">
              <div><span>Lead → RDV</span><b>${tauxRdv === null ? '—' : pct(tauxRdv) + ' %'}</b>${delta(ecart(entAvant?.tauxRdv, tauxRdv), true)}
                <em>${tauxRdv === null ? (recus === 0 ? 'aucun lead sur la période' : 'étape non comptée')
                  : `${avecRdv} RDV sur ${recus} lead${recus > 1 ? 's' : ''}`}</em></div>
              <div><span>RDV → devis signé</span><b>${tauxVente === null ? '—' : pct(tauxVente) + ' %'}</b>${delta(ecart(entAvant?.tauxVente, tauxVente), true)}
                <em>${tauxVente === null ? (avecRdv === 0 ? 'aucun RDV sur la période' : 'étape non comptée')
                  : `${conclus} signé${conclus > 1 ? 's' : ''} sur ${avecRdv} RDV`}</em></div>
            </div>
          </section>`}

          ${carteMeta(cles)}

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

          ${/* ⚠ SEULEMENT EN VUE GROUPE (17/11/2026). Élodie : « mets-le que dans
                "groupe" pour voir tous les chiffres d'affaires de toutes les
                structures ». Filtré sur une seule structure, la courbe n'avait
                plus qu'une ligne et le CA du mois était déjà dit deux fois —
                par l'encadré « CA facturé HT » et par « Objectifs & performance ».
                En vue groupe elle montre ce qu'aucun autre écran ne montre :
                les structures côte à côte sur douze mois.

                ⚠ `dessineCourbe` SUPPORTE L'ABSENCE : `if (!canvas) return;`.
                Ne pas retirer cette garde en croyant la carte toujours là.

                ⚠ ET ELLE PREND LES 12 COLONNES, pas 7. La rangee doit se
                refermer : « Ma journée » est passée de 5 à 6 colonnes quand
                « À traiter » a été retiré, et 7 + 6 = 13 débordait. */ ''}
          ${state.filtre === 'groupe' ? `
          <section class="card tb-x12">
            <div class="card-head"><h2>Évolution du chiffre d'affaires</h2>
              <span class="muted small">CA HT · 12 derniers mois · toutes les structures</span></div>
            <div class="tb-chartwrap">
              <div class="chart-box tb-chart"><canvas id="tb-canvas"></canvas></div>
              <div class="tb-totals">
                <h3>${esc(moisSerie[moisSerie.length - 1].label)}</h3>
                ${cles.map(k => `<div class="tb-trow"><span class="dot" style="background:${ACTIVITIES[k].color}"></span>
                  <span class="tb-tnm">${esc(ACTIVITIES[k].label)}</span><b>${eur(caMois(k, moisCle(), deals))}</b></div>`).join('')}
              </div>
            </div>
          </section>` : ''}

          ${/* ⚠ « À TRAITER » A ÉTÉ RETIRÉ LE 17/11/2026. Élodie : « il ne sert à
                rien je trouve » — et elle a raison : « Ma journée » affiche déjà
                `tachesDuJour()`, donc son bloc « Aujourd'hui ». Il n'ajoutait
                que « En retard » et « Cette semaine », que l'écran #/today
                donne en entier.

                ⚠ « MA JOURNÉE » EST SEULE SUR SA RANGÉE depuis que
                « Patrimoine » a sa propre vue (17/11/2026) : elle prend donc les
                12 colonnes. Lui en donner 6 laisserait une demi-rangée vide,
                et il n'y a plus rien pour la combler. */ ''}
          ${taille(carteJournee(visibles), 'tb-x12')}`}

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

// L'entonnoir de la période précédente, pour comparer les taux à population comparable
function comparaisonEntonnoir(cles, r, deals) {
  const e = entonnoir(cles, periodePrecedente(r), deals);
  const j = (champ) => e.find(x => x.champ === champ)?.n ?? null;
  const recus = j('leads'), rdv = j('rdv'), signes = j('signed');
  return {
    tauxRdv: recus && rdv !== null ? rdv / recus : null,
    tauxVente: rdv && signes !== null ? signes / rdv : null,
  };
}
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
function carteObjectifs(cles, deals) {
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
    `data-go="${lienStructure(k)}"`));
  // ⚠ LE TOTAL « GROUPE » N'ADDITIONNE QUE CE QU'ON SAIT MESURER (12/11/2026).
  // Y laisser l'objectif d'une structure dont aucun euro ne passe par le CRM
  // fabriquait un retard permanent et inrattrapable : un objectif en face
  // d'un réalisé qui restera nul par construction. On les sort du calcul
  // et on dit lesquels — les retirer en silence ferait croire à une erreur de
  // saisie la prochaine fois que quelqu'un additionnera les lignes.
  const mesurables = avecObjectif.filter(k => argentConnu(k, deals));
  const horsMesure = avecObjectif.filter(k => !argentConnu(k, deals));
  if (mesurables.length > 1) {
    blocs.push(blocObjectif(mesurables, 'var(--accent)', deals, '<span class="ob-groupe">Groupe</span>', ''));
  }
  return `<section class="card">${entete}<div class="ob-liste">${blocs.join('')}</div>
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

function blocObjectif(cles, couleur, deals, titre, attrs) {
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
  const haut = Math.max(1, ...colonnes.map(c => Math.max(c.o, c.v || 0)));
  const frise = !colonnes.length ? '' : `<div class="ob-frise" aria-label="CA mois par mois">${colonnes.map(c => {
    const futur = c.v === null, courant = c.cle === cleMoisCourant;
    const atteint = !futur && c.o > 0 && c.v >= c.o;
    return `<div class="ob-col${futur ? ' futur' : ''}${courant ? ' courant' : ''}"
        title="${esc(c.label)} : ${futur ? 'à venir' : eur(c.v)} · objectif ${eur(c.o)}">
      <div class="ob-col-zone">
        ${futur ? '' : `<span class="ob-col-val${atteint ? ' ok' : ''}" style="height:${Math.max(c.v > 0 ? 3 : 0, c.v / haut * 100).toFixed(1)}%"></span>`}
        <span class="ob-col-obj" style="bottom:${(c.o / haut * 100).toFixed(1)}%"></span>
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
  const connu = cles.some(k => argentConnu(k, deals));
  if (!connu) {
    return `<article class="ob-bloc ob-muet${attrs ? ' click' : ''}" style="--c:${couleur}" ${attrs}>
      <header class="ob-tete"><span class="tb-struct">${titre}</span>
        <span class="muted small">objectif annuel <b>${eur(objAn)}</b></span></header>
      <p class="ob-sansdonnee"><b>Aucun chiffre d'affaires dans le CRM</b> pour cette structure :
        sa facturation ne passe pas par ici. L'objectif est affiché pour mémoire — l'avancement
        ne peut pas être calculé, et un « 0 % » dirait autre chose que la vérité.</p>
    </article>`;
  }

  return `<article class="ob-bloc${attrs ? ' click' : ''}" style="--c:${couleur}" ${attrs}>
    <header class="ob-tete"><span class="tb-struct">${titre}</span>
      <span class="muted small">objectif annuel <b>${eur(objAn)}</b></span></header>
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
  const verdict = p >= 1 ? `Objectif atteint${realise > vise ? `, dépassé de ${eur(realise - vise)}` : ''}`
    : ecart >= 0 ? `En avance de ${eur(ecart)} sur le rythme`
    : `En retard de ${eur(-ecart)} sur le rythme`;
  return `<div class="ob-jauge">
    <div class="ob-ligne"><span class="ob-lbl">${esc(libelle)}</span><span class="ob-pct ${etat}">${pct(p)} %</span></div>
    <div class="ob-montants"><b>${eur(realise)}</b><span class="muted"> sur ${eur(vise)}</span></div>
    <div class="ob-barre"><span class="ob-rempli" style="width:${Math.min(100, p * 100).toFixed(1)}%"></span>
      ${part > 0 && part < 1 ? `<span class="ob-repere" style="left:${(part * 100).toFixed(1)}%" title="Où il faudrait être aujourd'hui"></span>` : ''}</div>
    <p class="ob-verdict ${etat}">${verdict}</p>
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

// ---------- journée ----------
// Une seule journée, dessinée par le CRM : les rendez-vous lus dans les agendas
// Google des structures et les tâches horodatées du CRM, mélangés et triés, chacun
// à la couleur de sa structure. Le cadre intégré de Google ne sert plus que de
// repli, tant qu'aucun identifiant client n'est renseigné.
function carteJournee(cles) {
  const ids = idsDeTous(cles);
  const entete = `<div class="card-head"><h2>Ma journée</h2>
    <span class="muted small">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    ${peutRaccorder() ? `<button class="btn ghost sm" id="tb-ag">${ids.length ? 'Agendas' : 'Raccorder les agendas'}</button>` : ''}</div>`;

  if (!ids.length) {
    return `<section class="card">${entete}
      <div class="tb-ag-vide">
        <p><b>Aucun agenda n'est encore raccordé.</b> Une fois les calendriers des structures renseignés,
        leurs rendez-vous du jour sont recopiés automatiquement dans le CRM.
        Personne n'a de connexion à faire. Chacun ne voit que les agendas qui lui
        appartiennent dès qu'on lui en a créé un&nbsp;; sans agenda à lui, il voit
        celui de sa structure.</p>
        ${peutRaccorder() ? modeEmploi() + '<p class="muted small">Puis « Raccorder les agendas » ci-dessus.</p>'
          : '<p class="muted small">La direction peut les renseigner depuis cet écran.</p>'}
      </div>
      <div id="tb-jour">${dessinerJournee(tachesDuJour(), cles)}</div>
    </section>`;
  }
  // La journée est lue dans le CRM, pas chez Google : elle s'affiche aussitôt,
  // pour tout le monde. La recopie, elle, se fait en fond et n'appartient qu'à
  // la direction — c'est elle qui a accès aux calendriers.
  return `<section class="card">${entete}
    <div id="tb-jour">${dessinerJournee([...evenementsEnregistres(cles), ...tachesDuJour()], cles)}</div>
    ${monAgendaHtml(cles)}
    <p class="muted small tb-ag-src">${sourcesHtml(cles)}<span id="tb-maj">${etatSync(cles)}</span></p>
  </section>`;
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
const structuresSansMonAgenda = (cles) => (cles || []).filter(
  k => !scope.STRUCTURES_A_AGENDA_COMMUN.includes(k) && !scope.aUnAgendaAVoir(k));

const monAgendaHtml = (cles) => {
  const manquantes = structuresSansMonAgenda(cles);
  if (!manquantes.length || db.demo) return '';
  return `<p class="muted small tb-ag-mien">Vos rendez-vous arrivent dans l’agenda de votre structure,
      que vous partagez avec les autres. Vous pouvez avoir le vôtre — rien à connecter, vous
      recevrez une invitation Google à accepter.<br>
      ${manquantes.map(k => `<button class="btn ghost sm" data-mon-agenda="${k}">Créer mon agenda ${esc(ACTIVITIES[k].label)}</button>`).join(' ')}
    </p><div id="tb-mon-agenda"></div>`;
};

const etatSync = (cles) => {
  const d = derniereSync(cles);
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

// Les tâches du CRM qui ont une heure : elles rejoignent les rendez-vous Google
// dans la même journée, c'est tout l'intérêt de dessiner nous-mêmes.
function tachesDuJour() {
  const jour = isoDay();
  return scope.activities()
    .filter(a => !a.done && a.due_date === jour && a.due_time)
    .map(a => {
      const [h, m] = a.due_time.split(':').map(Number);
      const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
      const f = new Date(d.getTime() + 30 * 60000);
      return {
        id: 'crm-' + a.id, titre: a.title, lieu: '', debut: d, fin: f, journee: false,
        structure: db.byId('deals', a.deal_id)?.activity || null,
        crm: true, type: a.type || 'Tâche', qui: userName(a.assignee_id),
      };
    });
}

function dessinerJournee(elements, cles) {
  const maintenant = new Date();
  const hhmm = (d) => d.toTimeString().slice(0, 5);
  const journee = elements.filter(e => e.journee);
  const horaires = elements.filter(e => !e.journee).sort((a, b) => a.debut - b.debut);
  const duree = (e) => Math.max(0, Math.round((e.fin - e.debut) / 60000));

  const ligne = (e) => {
    const c = e.structure ? ACTIVITIES[e.structure]?.color : 'var(--muted-2)';
    const passe = e.fin < maintenant;
    const encours = e.debut <= maintenant && e.fin > maintenant;
    const min = duree(e);
    return `<div class="tb-rdv${passe ? ' passe' : ''}${encours ? ' encours' : ''}" style="--c:${c}">
      <span class="tb-h">${hhmm(e.debut)}<small>${hhmm(e.fin)}</small></span>
      <span class="tb-filet"></span>
      <span class="tb-corps">
        <span class="tb-titre">${esc(e.titre)}</span>
        <span class="tb-det">${[
          e.crm ? esc(e.type) : (min >= 60 ? Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + String(min % 60).padStart(2, '0') : '') : min + ' min'),
          e.structure ? esc(ACTIVITIES[e.structure].label) : 'Groupe',
          e.lieu ? esc(e.lieu) : '',
          e.crm ? esc(e.qui) : (e.invites > 1 ? e.invites + ' participants' : ''),
        ].filter(Boolean).join(' · ')}</span>
      </span>
      ${e.crm ? '<span class="tb-tag">CRM</span>' : ''}
    </div>`;
  };

  let corps = '';
  if (journee.length) corps += `<div class="tb-alljour">${journee.map(e =>
    `<span class="tb-puce" style="--c:${e.structure ? ACTIVITIES[e.structure]?.color : 'var(--muted-2)'}">${esc(e.titre)}</span>`).join('')}</div>`;
  if (horaires.length) {
    corps += '<div class="tb-jour">';
    horaires.forEach((e, i) => {
      const prec = horaires[i - 1];
      if (prec && prec.debut <= maintenant && e.debut > maintenant)
        corps += `<div class="tb-now"><span class="h">${hhmm(maintenant)}</span><span class="line"></span></div>`;
      corps += ligne(e);
    });
    corps += '</div>';
  }
  if (!journee.length && !horaires.length)
    corps = '<div class="empty" style="padding:20px 0">Aucun rendez-vous aujourd\'hui.</div>';

  return corps;
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
 * Le chemin de l'argent — refait le 17/11/2026 (Élodie : « ça ne va pas du
 * tout là »).
 *
 * ⚠ CE N'EST PLUS LA MÊME QUESTION. Avant : « combien a-t-on signé, facturé
 * et encaissé ce mois-ci » — trois cohortes d'euros sans rapport, qui
 * donnaient un mois à 133 346 € signés pour 12 253 € facturés, lu comme un
 * effondrement alors qu'un chantier signé en novembre se facture après.
 * Maintenant : « les chantiers signés sur la période, où en est leur
 * facturation » — les MÊMES euros, suivis. Voir `cheminDesSignes`.
 *
 * ⚠ LES TROIS TUILES SE MESURENT SUR LE SIGNÉ, et c'est désormais légitime :
 * facturé et encaissé sont des PARTS de ce signé-là, plus des totaux
 * étrangers. « Reste à facturer » complète « Facturé » jusqu'à 100 %.
 *
 * ⚠ « RESTE À FACTURER » N'EST PAS UN IMPAYÉ. C'est du chantier en cours, et
 * le libellé doit l'empêcher de se lire comme de l'argent en retard — Élodie
 * a écarté une carte sur l'argent non rentré le même jour.
 */
function carteArgent(cles, r, state) {
  const a = cheminDesSignes(cles, r);
  if (!a) return '';
  const part = (v) => Math.max(v > 0 ? 3 : 0, Math.min(100, a.signe ? v / a.signe * 100 : 0)).toFixed(1);
  const tuiles = [
    { lb: 'Factur\u00e9', v: a.facture, ss: 'sur ces chantiers' },
    { lb: 'Encaiss\u00e9', v: a.encaisse, ss: 'd\u00e9j\u00e0 r\u00e9gl\u00e9' },
    { lb: 'Reste \u00e0 facturer', v: a.reste, ss: 'travaux en cours' },
  ];
  const pct = (l) => (l.montant ? Math.round(l.facture / l.montant * 100) : 0);
  return `<section class="card tb-argent">
    <h2>Le chemin de l'argent</h2>
    <span class="tb-sous">les chantiers sign\u00e9s \u00b7 ${esc(periodeAffichee(state, cles))} \u00b7 suivis jusqu'\u00e0 leur facturation</span>
    <div class="tb-gros"><span class="tb-nb" data-n="${a.signe}" data-eur="1">${eur(a.signe)}</span></div>
    <span class="tb-sous">sign\u00e9s sur la p\u00e9riode \u00b7 ${a.nb} chantier${a.nb > 1 ? 's' : ''}</span>
    <div class="tb-flux">
      ${tuiles.map(b => `<div class="tb-fx">
        <span class="lb">${b.lb}</span>
        <b class="tb-nb" data-n="${b.v}" data-eur="1">${eur(b.v)}</b>
        <span class="ss">${esc(b.ss)}</span>
        <div class="tb-piste"><i data-large="${part(b.v)}"></i></div></div>`).join('')}
    </div>
    ${/* ⚠ LE DÉTAIL EST STYLÉ EN LIGNE : `tb-detail` est dessiné pour les
          cartes claires (trait `--line`, texte `--muted-2`) et disparaîtrait
          sur le dégradé. Et app.css porte le travail d'une autre session. */ ''}
    ${a.lignes.length ? `<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,.22);padding-top:6px">
      <span class="tb-sous" style="display:block;margin-bottom:2px">reste \u00e0 facturer, chantier par chantier</span>
      ${a.lignes.slice(0, 3).map(l => `<div style="display:flex;align-items:baseline;gap:10px;padding:6px 0;font-size:12.5px">
        <span style="font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:42%">${esc(l.client)}</span>
        <span style="opacity:.8;font-size:11.5px">${eur(l.montant)} sign\u00e9s \u00b7 ${pct(l)}\u00a0% factur\u00e9</span>
        <b style="margin-left:auto;font-variant-numeric:tabular-nums">${l.reste ? eur(l.reste) : 'sold\u00e9'}</b>
      </div>`).join('')}
      ${a.lignes.length > 3 ? `<div style="font-size:11.5px;opacity:.78;padding-top:2px">+ ${a.lignes.length - 3} autre${a.lignes.length - 3 > 1 ? 's' : ''}</div>` : ''}
    </div>` : ''}
    ${/* ⚠ CE SIGNAL N'EXISTAIT NULLE PART : un chantier signé depuis plus de
          deux mois dont AUCUNE facture ne pend. Deux mois, pas zéro jour —
          signaler un chantier signé la semaine dernière apprendrait à ignorer
          le signal. */ ''}
    ${a.oublies.length ? `<p class="tb-sous" style="margin:10px 0 0">${a.oublies.length === 1
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
 * Pose la taille d'une tuile sur la carte elle-même.
 *
 * ⚠ PAS D'EMBALLAGE AUTOUR : un enfant de grille supplémentaire recevrait la
 * largeur, et la carte flotterait dedans sans la remplir. Les cartes
 * existantes sortent toutes de leur fonction en `<section class="card">` ; si
 * l'une changeait de forme, on retombe sur l'emballage plutôt que de la
 * perdre — un bento dépareillé vaut mieux qu'une carte disparue.
 */
function taille(html, cls) {
  const t = String(html || '').trim();
  if (!t) return '';
  const m = '<section class="card';
  return t.startsWith(m) ? t.replace(m, `<section class="card ${cls}`) : `<div class="${cls}">${t}</div>`;
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

// L'entonnoir descend de l'indigo vers l'orange, en passant par le rose : la
// couleur fait la pente, pas seulement la longueur des barres.
const PENTE = ['#5B52F0', '#6B63F2', '#8B5BF0', '#C65AC8', '#FF4D8D', '#FF7A2D'];
function degradeEtape(i, n, fin) {
  const a = PENTE[Math.min(i, PENTE.length - 1)];
  const b = PENTE[Math.min(i + 1, PENTE.length - 1)];
  return fin && n <= PENTE.length ? `linear-gradient(90deg,${PENTE[PENTE.length - 1]},#FFB15C)`
    : `linear-gradient(90deg,${a},${b})`;
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
 * ⚠ ELLE REND '' SI LE RÉSEAU N'A RIEN APPORTÉ, et le gabarit remet alors
 * l'entonnoir. Sans ça, filtrer sur BTP ou Courtage ferait disparaître les
 * deux cartes et laisserait un trou de 7 colonnes.
 *
 * ⚠ LE MONTANT ANNONCÉ EST CELUI DES DEVIS GAGNÉS, pas du CA encaissé :
 * `rgd_apports` porte le montant du devis au moment de l'apport. Dire
 * « de chiffre d'affaires » promettrait un rapprochement avec la facturation
 * que ces lignes ne permettent pas.
 */
function carteReseau(cles) {
  const e = reseauApporteurs(cles);
  if (!e) return '';
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

function carteMeta(cles) {
  const p = publicite(cles);
  if (!p) return '';
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
