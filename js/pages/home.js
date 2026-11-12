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
  cheminArgent, chantiersResume, publicite, envoisAuto, argentConnu,
} from '../data/chiffres.js';
// `finDe` tient compte de la fin déclarée à la main et des jours ouvrés d'une
// formation : refaire ce calcul ici donnerait une date différente du planning.
import { finDe } from '../data/rgd-planning.js';
import {
  esc, eur, daysSince, periodRange, inRange, isoDay, userName,
  openModal, closeModal, renderForm, readForm, toast,
} from '../ui.js';
import { activeInMonth, rowOf, dueOf, receivedOf, balanceOf } from './locatif.js';
import {
  idsDe, idsDeTous, structuresRaccordees, cadreJour, noteAgenda, modeEmploi,
  champsAgendas, enregistrerAgendas, peutRaccorder,
} from '../agenda.js';
import { evenementsEnregistres, derniereSync, agendasDe } from '../agenda-sync.js';
import { creerAgendaPersonnel } from '../comptes.js';

const LS_FILTRE = 'crm_home_filtre';
const BASE_PROSPECTS = {
  rgd: '#/rgd/clients',         // Clients & prospects → l'écran Clients du CRM (repris de l'application)
  btp: '#/btp/base',
  courtage: '#/courtage/base',
  propulsion: '#/pipeline/propulsion',
};
// Les périodes du tableau de bord (04/11/2026, demandé par Élodie : « le mois
// dernier », et « la possibilité de voir sur l'année ou le trimestre, c'est
// tout »), puis « pouvoir sélectionner une période mensuelle aussi ».
// « Mois » ouvre sur le mois DERNIER : c'est un mois CLOS, ses chiffres ne
// bougent plus — le mois en cours se lit dans « Objectifs & performance » —,
// et la liste à côté permet d'en choisir un autre.
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
function spark(serie, couleur) {
  if (!serie.some(v => v)) return '';
  const w = 200, h = 34, mn = Math.min(...serie), mx = Math.max(...serie), sp = (mx - mn) || 1;
  const pts = serie.map((v, i) => [i / (serie.length - 1) * w, h - 2 - ((v - mn) / sp) * (h - 9)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="tb-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
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
      mois: moisDernier(),
      filtre: (() => { try { return localStorage.getItem(LS_FILTRE) || 'groupe'; } catch { return 'groupe'; } })(),
    };

    const draw = () => {
      const visibles = CLES_VISIBLES();
      if (state.filtre !== 'groupe' && !visibles.includes(state.filtre)) state.filtre = 'groupe';
      const cles = state.filtre === 'groupe' ? visibles : [state.filtre];
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
            <h1>${prenomDe(scope.user)}<span>${esc(phraseHero(state, cles))}</span></h1>
            <p><span class="tb-vivant"></span>${state.filtre === 'groupe'
              ? `les ${visibles.length} structures` : esc(ACTIVITIES[state.filtre].label)} · ${esc(periodeAffichee(state, cles))}</p>
          </div>
          <div class="tb-bfiltres">
            <div class="tb-chips">
              <button class="tb-chip" data-f="groupe" aria-pressed="${state.filtre === 'groupe'}">
                <span class="tb-glyph">G</span><span>Groupe</span></button>
              ${visibles.map(k => `<button class="tb-chip" data-f="${k}" aria-pressed="${state.filtre === k}" style="--marque:${ACTIVITIES[k].color}">
                <img class="tb-logo" src="assets/logos/${k}.png" alt="" data-cle="${k}"><span>${esc(ACTIVITIES[k].label)}</span></button>`).join('')}
            </div>
            <div class="tb-periodes">
              <div class="seg tb-periode">${PERIODES_TB.map(([k, l]) => `<button data-p="${k}" class="${state.periode === k ? 'active' : ''}"${k === 'year' && cles.length === 1 && exerciceDe(cles[0]).label.includes('–') ? ` title="Exercice ${exerciceDe(cles[0]).label} : du 1er octobre au 30 septembre"` : ''}>${k === 'year' && cles.length === 1 && exerciceDe(cles[0]).label.includes('–') ? 'Exercice ' + exerciceDe(cles[0]).label : l}</button>`).join('')}</div>
              ${state.periode === 'mois' ? `<select class="tb-mois" id="tb-mois" aria-label="Choisir le mois">${derniersMois(24, new Date()).reverse().map(m => {
                const nom = new Date(m.cle + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                return `<option value="${m.cle}"${m.cle === state.mois ? ' selected' : ''}>${esc(nom)}${m.cle === moisCle() ? ' (en cours)' : m.cle === moisDernier() ? ' (mois dernier)' : ''}</option>`;
              }).join('')}</select>` : ''}
            </div>
          </div>
        </header>

        ${/* ⚠ DES TUILES DE TAILLES INÉGALES, ET CHACUNE PREND SA HAUTEUR. C'est
              ce qui distingue le bento du tableau de cartes d'avant : les deux
              colonnes figées ont disparu, « Ma journée » et « À traiter »
              descendent avec le reste au lieu de former une colonne qui
              s'allongeait toute seule. */ ''}
        <div class="tb-bento">

          ${taille(carteArgent(cles, r, state), 'tb-x7')}
          ${scope.canPilotage ? taille(carteObjectifs(cles, deals), 'tb-x5') : ''}

          ${kpi('Leads', t.leadsNonDates ? t.leads : t.leadsPeriode,
            // Sans date d'arrivée, aucune évolution n'est calculable : mieux vaut
            // ne rien afficher qu'un pourcentage qui ne compare pas ce qu'il dit.
            t.leadsNonDates ? null : evolution(avant?.leadsPeriode, t.leadsPeriode),
            serieDe(cle => cles.reduce((s, k) => s + leadsMois(k, cle, deals), 0)),
            repartitionLeads(t, cles),
            false,
            t.leadsNonDates ? 'Total en base : ces outils ne datent pas l\'arrivée des prospects.' : '',
            cles.length === 1 ? BASE_PROSPECTS[cles[0]] : '')}
          ${kpi('RDV', t.rdv, evolution(avant?.rdv, t.rdv), serieDe(cle => cles.reduce((s, k) => s + rdvMois(k, cle, deals), 0)),
            'rendez-vous tenus sur la période')}
          ${kpi('Affaires signées', t.signees ?? '—', evolution(avant?.signees, t.signees), serieDe(cle => cles.reduce((s, k) => s + signeesMois(k, cle, deals), 0)), t.panier ? `panier ${eur(t.panier)}` : 'panier moyen indisponible')}
          ${kpi('CA HT', eur(t.ca), evolution(avant?.ca, t.ca), serieDe(caDu),
            obj ? `objectif ${eur(obj)}` : scope.canPilotage ? 'aucun objectif fixé' : 'sur vos affaires')}

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
          </section>

          ${carteDette(cles, r)}

          ${taille(tuileChantiers(cles, r), 'tb-x4')}
          ${taille(tuilePublicite(cles), 'tb-x4')}
          ${taille(tuileEnvois(cles), 'tb-x4')}

          <section class="card tb-x7">
            <div class="card-head"><h2>Évolution du chiffre d'affaires</h2>
              <span class="muted small">CA HT · 12 derniers mois</span></div>
            <div class="tb-chartwrap">
              <div class="chart-box tb-chart"><canvas id="tb-canvas"></canvas></div>
              <div class="tb-totals">
                <h3>${esc(moisSerie[moisSerie.length - 1].label)}</h3>
                ${cles.map(k => `<div class="tb-trow"><span class="dot" style="background:${ACTIVITIES[k].color}"></span>
                  <span class="tb-tnm">${esc(ACTIVITIES[k].label)}</span><b>${eur(caMois(k, moisCle(), deals))}</b></div>`).join('')}
              </div>
            </div>
          </section>

          ${taille(carteJournee(visibles), 'tb-x5')}
          ${taille(carteTaches(), 'tb-x6')}
          ${taille(cartePatrimoine(), 'tb-x6')}

        </div>

        ${sources.length ? `<p class="muted small tb-source">${sources.map(x => externe(x.cle)?.direct
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
      root.querySelector('#tb-obj')?.addEventListener('click', () => formObjectifs(draw));
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
    const kpi = (libelle, valeur, d, serie, sous, points = false, titre = '', vers = '') => `
      <article class="card tb-x3 tb-k${vers ? ' click' : ''}"${vers ? ` data-go="${vers}"` : ''}${titre ? ` title="${esc(titre)}"` : ''}>
        <h2>${libelle}</h2>
        <div class="tb-ind"><b>${valeur}</b>${delta(d, points)}<span class="tb-vs">${comparaisonLabel(state.periode)}</span></div>
        <span class="tb-sous">${sous}</span>
        ${spark(serie, d === null || d >= 0 ? 'var(--green)' : 'var(--red)')}
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
function formObjectifs(onSaved) {
  const valeurs = Object.fromEntries(ACTIVITY_KEYS.map(k => [k, objectifAnnuel(k) || '']));
  const spec = ACTIVITY_KEYS.map(k => ({
    key: k, label: ACTIVITIES[k].label, type: 'number',
    hint: k === ACTIVITY_KEYS[0] ? 'Objectif de CA HT sur l\'année. Le mois et le trimestre en prennent leur part : un objectif de 480 000 € vaut 40 000 € par mois.' : '',
  }));
  openModal('Objectifs annuels de chiffre d\'affaires',
    `<form id="f-obj" class="form">${renderForm(spec, valeurs)}</form>
     <div class="form-actions"><button class="btn ghost" id="obj-x">Annuler</button><button class="btn" id="obj-ok">Enregistrer</button></div>`,
    { onOpen: (m) => {
      m.querySelector('#obj-x').onclick = () => closeModal();
      m.querySelector('#obj-ok').onclick = async () => {
        const v = readForm(m.querySelector('#f-obj'), spec);
        const valeurs = Object.fromEntries(ACTIVITY_KEYS.map(k => [k, Number(v[k]) || 0]));
        try { await enregistrerObjectifs(valeurs); closeModal(true); toast('Objectifs enregistrés'); onSaved(); }
        catch (e) { toast(e.message, 'err'); }
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

// ---------- tâches ----------
function carteTaches() {
  const ouvertes = scope.activities().filter(a => !a.done);
  const retard = ouvertes.filter(a => a.due_date && daysSince(a.due_date) > 0);
  const jour = ouvertes.filter(a => a.due_date && daysSince(a.due_date) === 0);
  const semaine = ouvertes.filter(a => a.due_date && daysSince(a.due_date) < 0 && daysSince(a.due_date) >= -7);
  const bloc = (cls, titre, arr, urgent) => arr.length ? `<div class="tb-grp ${cls}">
    <div class="tb-ghead">${titre}<span class="tb-cnt">${arr.length}</span></div>
    ${arr.slice(0, 5).map(a => `<div class="tb-task click" data-go="#/today">
      <span class="tb-box"></span><span class="t">${esc(a.title)}</span>
      <span class="who">${esc(userName(a.assignee_id))}</span>
      <span class="when ${urgent ? 'r' : 'n'}">${urgent ? Math.abs(daysSince(a.due_date)) + ' j' : cls === 'tdy' ? "aujourd'hui" : new Date(a.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
    </div>`).join('')}
    ${arr.length > 5 ? `<div class="tb-plus click" data-go="#/today">+ ${arr.length - 5} autre${arr.length - 5 > 1 ? 's' : ''}</div>` : ''}
  </div>` : '';
  const corps = bloc('late', 'En retard', retard, true) + bloc('tdy', "Aujourd'hui", jour, false) + bloc('week', 'Cette semaine', semaine, false);
  return `<section class="card">
    <div class="card-head"><h2>À traiter</h2><span class="muted small">${ouvertes.length} tâche${ouvertes.length > 1 ? 's' : ''} ouverte${ouvertes.length > 1 ? 's' : ''}</span></div>
    ${corps || '<div class="empty" style="padding:18px 0">Rien à faire — tout est à jour.</div>'}
  </section>`;
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
// montant : un total en attente se regarde, « due il y a plus d'un an » se traite.
const depuisQuand = (iso) => {
  const j = Math.round((Date.now() - new Date(String(iso).slice(0, 10) + 'T00:00:00')) / 86400000);
  if (j < 31) return `il y a ${j} jour${j > 1 ? 's' : ''}`;
  const m = Math.round(j / 30.4);
  return m < 12 ? `il y a ${m} mois` : `il y a plus de ${Math.floor(m / 12)} an${m >= 24 ? 's' : ''}`;
};

/**
 * « Le chemin de l'argent » : signé → facturé → encaissé → reste dû.
 *
 * ⚠ LE QUATRIÈME BARREAU N'EST PAS DE LA MÊME NATURE QUE LES TROIS AUTRES, et
 * l'écran doit le dire au lieu de le laisser deviner : les trois premiers
 * concernent la période choisie, le dernier est ce qu'on attend aujourd'hui,
 * toutes dates confondues. Sans cette mention, on soustrait de tête des nombres
 * qui ne parlent pas du même intervalle.
 */
/**
 * « Le chemin de l'argent » — la grande tuile du bento.
 *
 * ⚠ TROIS BARREAUX, PAS QUATRE. « Reste dû » a quitté cette carte le
 * 12/11/2026 pour la tuile rouge : les trois qui restent sont des FLUX de la
 * période choisie, le quatrième était un STOCK d'aujourd'hui. Alignés, on les
 * soustrayait de tête alors qu'ils ne parlent pas du même intervalle.
 *
 * ⚠ LES BARRES SE MESURENT SUR LE SIGNÉ, et c'est tout le propos : voir que
 * le facturé ne représente qu'un dixième de ce qui a été vendu. Mesurer
 * chacune sur elle-même les remplirait toutes et ne dirait plus rien.
 */
function carteArgent(cles, r, state) {
  const a = cheminArgent(cles, r);
  if (!a) return '';
  const haut = Math.max(a.signe, a.facture, a.encaisse, 1);
  const part = (v) => Math.max(v > 0 ? 3 : 0, Math.min(100, v / haut * 100)).toFixed(1);
  const barreaux = [
    { lb: 'Sign\u00e9', v: a.signe, ss: 'devis sign\u00e9s' },
    { lb: 'Factur\u00e9', v: a.facture, ss: 'factures \u00e9mises' },
    { lb: 'Encaiss\u00e9', v: a.encaisse, ss: 'r\u00e8glements re\u00e7us' },
  ];
  return `<section class="card tb-argent">
    <h2>Le chemin de l'argent</h2>
    <span class="tb-sous">du devis sign\u00e9 au compte en banque \u00b7 ${esc(periodeAffichee(state, cles))}</span>
    <div class="tb-gros"><span class="tb-nb" data-n="${a.signe}" data-eur="1">${eur(a.signe)}</span></div>
    <span class="tb-sous">sign\u00e9s sur la p\u00e9riode</span>
    <div class="tb-flux">
      ${barreaux.map(b => `<div class="tb-fx">
        <span class="lb">${b.lb}</span>
        <b class="tb-nb" data-n="${b.v}" data-eur="1">${eur(b.v)}</b>
        <span class="ss">${esc(b.ss)}</span>
        <div class="tb-piste"><i data-large="${part(b.v)}"></i></div></div>`).join('')}
    </div>
  </section>`;
}

const duo = (a, b) => `<div class="tb-duo">
  <div class="tb-du"><b>${a.v}</b><span>${a.l}</span></div>
  <div class="tb-du${b.ton ? ' ' + b.ton : ''}"><b>${b.v}</b><span>${b.l}</span></div></div>`;

function tuileChantiers(cles, r) {
  const c = chantiersResume(cles, r);
  if (!c) return '';
  // ⚠ UN CHANTIER « OUBLIÉ » EST LE SEUL QUI DEMANDE QUELQUE CHOSE : commencé,
  // sa date de fin passée, et personne n'a appuyé sur « Chantier terminé ».
  // Les autres n'ont besoin de rien, ils tournent. Il passe donc en tête.
  // ⚠ `oublies` EST UN SOUS-ENSEMBLE DE `enCours` : sans ce retrait, un
  // chantier qui a dépassé sa date apparaîtrait deux fois dans la même liste.
  const aClore = new Set(c.oublies.map(x => x.id));
  const lignes = [
    ...c.oublies.map(x => ({ x, ton: 'red', etat: 'à clôturer' })),
    ...c.enCours.filter(x => !aClore.has(x.id)).map(x => ({ x, ton: '', etat: 'en cours' })),
    ...c.aVenir.map(x => ({ x, ton: 'muet', etat: 'à venir' })),
  ].slice(0, 4);
  const couleur = (ton) => (ton === 'red' ? 'var(--red)' : ton === 'muet' ? 'var(--muted-2)' : ACTIVITIES.rgd.color);
  return `<section class="card tb-tuile">
    <div class="card-head"><h2>Chantiers</h2>
      <a class="muted small" href="#/rgd/planning">planning →</a></div>
    ${duo({ v: c.enCours.length, l: 'en cours' }, { v: c.termines.length, l: 'terminés sur la période' })}
    ${c.oublies.length ? `<p class="tb-alerte">
      <b>${c.oublies.length} chantier${c.oublies.length > 1 ? 's' : ''} ${c.oublies.length > 1 ? 'ont' : 'a'} dépassé sa date de fin</b>
      sans être clôturé${c.oublies.length > 1 ? 's' : ''} : la demande d'avis Google ne part pas tant que le bouton n'est pas appuyé.</p>` : ''}
    ${lignes.length ? `<div class="tb-liste">${lignes.map(({ x, ton, etat }) => `<div class="tb-lg">
      <i style="background:${couleur(ton)}"></i>
      <span class="tx">${esc(x.titre || 'Chantier')}<em>jusqu’au ${jourCourt(finDe(x))}</em></span>
      <b${ton === 'red' ? ' style="color:var(--red)"' : ''}>${etat}</b></div>`).join('')}</div>`
      : '<p class="muted small" style="margin-top:10px">Aucun chantier au planning.</p>'}
    ${c.avisDemandes ? `<p class="muted small" style="margin-top:9px">${c.avisDemandes} demande${c.avisDemandes > 1 ? 's' : ''} d'avis Google partie${c.avisDemandes > 1 ? 's' : ''} sur la période.</p>` : ''}
  </section>`;
}

/**
 * La publicité Meta — le CUMUL, pas les trente derniers jours (12/11/2026,
 * Élodie : « mets le montant total dépensé, le nombre de lead reçu et le coût
 * par lead », en donnant les valeurs qu'elle attendait — le dépôt est public,
 * elles ne sont pas recopiées ici).
 *
 * ⚠ ET LE COÛT PAR LEAD EST À DEUX DÉCIMALES. C'est le chiffre qu'elle
 * compare à ce que Meta lui annonce ; arrondi à l'euro, il ne se retrouve plus.
 */
function tuilePublicite(cles) {
  const p = publicite(cles);
  if (!p) return '';
  const virgule = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `<section class="card tb-tuile">
    <div class="card-head"><h2>Publicité Meta</h2>
      <a class="muted small" href="#/rgd/analyse">${p.du ? 'depuis le ' + jourCourt(p.du) : 'depuis le début'} →</a></div>
    ${duo({ v: eur(p.depense), l: 'dépensé en tout' },
      { v: p.coutParLead == null ? '—' : eur(p.coutParLead, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), l: 'par lead' })}
    <div class="tb-liste">
      <div class="tb-lg"><i style="background:var(--accent)"></i>
        <span class="tx">${p.leads} lead${p.leads > 1 ? 's' : ''} reçu${p.leads > 1 ? 's' : ''}<em>${p.clics} clic${p.clics > 1 ? 's' : ''} · ${p.campagnes} campagne${p.campagnes > 1 ? 's' : ''} qui ${p.campagnes > 1 ? 'ont' : 'a'} tourné</em></span>
        <b>${p.tauxLead == null ? '—' : virgule(p.tauxLead * 100) + ' %'}</b></div>
    </div>
  </section>`;
}

function tuileEnvois(cles) {
  const e = envoisAuto(cles);
  if (!e) return '';
  const l = [
    { n: e.relances, lb: 'Relances de devis', s: 'J+3, J+8, J+15', c: 'var(--accent)' },
    { n: e.confirmations, lb: 'Confirmations de RDV', s: 'la veille, par SMS', c: 'var(--blue)' },
    { n: e.avis, lb: 'Avis Google', s: 'au clic sur « Chantier terminé »', c: 'var(--green)' },
  ].filter(x => x.n);
  // ⚠ LES ÉCHECS SONT LE SUJET. Un envoi qui part n'a besoin de personne ; un
  // envoi qui échoue n'a prévenu personne. On nomme les destinataires : sans
  // eux, « 4 échecs » ne se répare pas.
  return `<section class="card tb-tuile">
    <div class="card-head"><h2>Ce qui part tout seul</h2>
      <span class="muted small">${e.jours} derniers jours</span></div>
    ${duo({ v: e.partis, l: 'partis' },
      { v: e.echecs.length, l: 'en échec', ton: e.echecs.length ? 'rouge' : '' })}
    ${l.length ? `<div class="tb-liste">${l.map(x => `<div class="tb-lg">
      <i style="background:${x.c}"></i><span class="tx">${x.lb}<em>${x.s}</em></span><b>${x.n}</b></div>`).join('')}</div>` : ''}
    ${e.echecs.length ? `<p class="tb-alerte">
      <b>${e.echecs.length} envoi${e.echecs.length > 1 ? 's' : ''} n’${e.echecs.length > 1 ? 'ont' : 'a'} pas pu partir.</b>
      ${esc(e.echecs.slice(0, 2).map(x => x.destinataire || 'destinataire absent').join(', '))}${e.echecs.length > 2 ? '…' : ''}</p>` : ''}
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
 * « Ce qui dort » — la tuile rouge : ce qui est facturé et pas rentré.
 *
 * ⚠ ELLE EST SORTIE DE LA CARTE DE L'ARGENT, et ce n'est pas qu'une question
 * de place. Les trois premiers barreaux sont des FLUX de la période ; celui-ci
 * est un STOCK d'aujourd'hui, toutes dates confondues. Côte à côte dans la
 * même carte, on les soustrayait mentalement les uns aux autres. Séparés, et
 * d'une couleur qui n'existe nulle part ailleurs sur l'écran, la question
 * qu'ils posent est différente — et c'est la bonne.
 */
function carteDette(cles, r) {
  const a = cheminArgent(cles, r);
  if (!a || a.resteDu == null || !a.nbDues) return '';
  const nb = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const lignes = [];
  if (a.nbEchues) {
    lignes.push(`<b>${a.nbEchues === a.nbDues ? `Les ${a.nbDues} factures en attente ont toutes dépassé leur échéance.`
      : `${nb(a.nbEchues, 'facture')} ${a.nbEchues > 1 ? 'ont' : 'a'} dépassé son échéance.`}</b>
      ${eur(a.montantEchu)}${a.plusAncienne ? ` — la plus ancienne était due le <b>${jourCourt(a.plusAncienne)}</b>, ${depuisQuand(a.plusAncienne)}` : ''}.`);
  }
  if (a.nbDuCrm) {
    lignes.push(`Dont <b>${nb(a.nbDuCrm, 'facture')} faite${a.nbDuCrm > 1 ? 's' : ''} dans le CRM</b>
      (${eur(a.montantDuCrm)}) qui ne figure${a.nbDuCrm > 1 ? 'nt' : ''} dans aucune liste d'impayés :
      l'écran Encaissements ne lit que Costructor.`);
  }
  return `<section class="card tb-x5 tb-dette">
    <h2>Ce qui dort</h2>
    <div class="tb-gros"><span class="tb-nb" data-n="${a.resteDu}" data-eur="1">${eur(a.resteDu)}</span></div>
    <span class="tb-sous">${nb(a.nbDues, 'facture')} émise${a.nbDues > 1 ? 's' : ''} et pas encore réglée${a.nbDues > 1 ? 's' : ''}</span>
    ${lignes.map(l => `<p>${l}</p>`).join('')}
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
