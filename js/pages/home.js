// Tableau de bord du groupe : ce qui s'est passé sur la période, structure par
// structure, puis ce qu'il y a à faire aujourd'hui. Tous les chiffres viennent de
// js/data/chiffres.js — la vue d'ensemble de Pilotage lit la même source.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS } from '../data/schema.js';
import { propertyMetrics, loanStatus } from '../data/finance.js';
import {
  chiffres, total, entonnoir, caMois, derniersMois, moisCle, moisPrecedent,
  objectifs, objectif, objectifAnnuel, enregistrerObjectifs, ecoule, anneeEnCours, CLES_VISIBLES,
} from '../data/chiffres.js';
import {
  esc, eur, daysSince, periodRange, inRange, isoDay, userName, PERIODS,
  openModal, closeModal, renderForm, readForm, toast,
} from '../ui.js';
import { activeInMonth, rowOf, dueOf, receivedOf, balanceOf } from './locatif.js';
import {
  idsDeTous, structuresRaccordees, cadreAgenda, noteAgenda, modeEmploi,
  champsAgendas, enregistrerAgendas, peutRaccorder,
} from '../agenda.js';

const LS_FILTRE = 'crm_home_filtre';
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
    let chart = null;
    const state = {
      periode: 'month',
      filtre: (() => { try { return localStorage.getItem(LS_FILTRE) || 'groupe'; } catch { return 'groupe'; } })(),
    };

    const draw = () => {
      const visibles = CLES_VISIBLES();
      if (state.filtre !== 'groupe' && !visibles.includes(state.filtre)) state.filtre = 'groupe';
      const cles = state.filtre === 'groupe' ? visibles : [state.filtre];
      const r = periodRange(state.periode);
      const deals = scope.deals();
      const t = total(cles, r, deals);

      // Comparaison : la même période, un cran plus tôt. Seul le mois est comparé
      // mois à mois ; sur « Tout » la comparaison n'a pas de sens.
      const avant = comparaison(cles, state.periode, deals);
      const moisSerie = derniersMois(12);
      const serieDe = (f) => moisSerie.map(m => f(m.cle));
      const caDu = (cle) => cles.reduce((s, k) => s + caMois(k, cle, deals), 0);

      // Les deux taux se lisent sur l'entonnoir, c'est-à-dire sur les affaires nées
      // pendant la période. Les calculer sur des populations différentes (RDV du mois
      // ÷ leads du mois) donnerait des taux que l'entonnoir juste en dessous contredit.
      const ent = entonnoir(cles, r, deals);
      const [recus, , avecRdv, , conclus] = ent.map(x => x.n);
      const tauxRdv = recus ? avecRdv / recus : null;
      const tauxVente = avecRdv ? conclus / avecRdv : null;
      const entAvant = comparaisonEntonnoir(cles, state.periode, deals);
      const part = ecoule(r);
      const obj = cles.reduce((s, k) => s + objectif(k, r), 0);
      // L'objectif se fixe à l'année : on rappelle toujours où en est l'année,
      // même quand l'écran est filtré sur le mois ou le trimestre.
      const an = anneeEnCours();
      const objAn = cles.reduce((s, k) => s + objectifAnnuel(k), 0);
      const caAn = cles.reduce((s, k) => s + chiffres(k, an, deals).ca, 0);
      const sources = cles.map(k => chiffres(k, r, deals)).filter(x => x.source);

      root.innerHTML = `
        ${db.demo ? '<div class="demo-banner"><b>Mode démo</b> — données d\'exemple stockées dans ce navigateur.</div>' : ''}

        <div class="tb-filtres">
          <span class="tb-flabel">Filtrer par entité</span>
          <div class="tb-chips">
            <button class="tb-chip" data-f="groupe" aria-pressed="${state.filtre === 'groupe'}">
              <span class="tb-glyph">G</span><span>Groupe</span></button>
            ${visibles.map(k => `<button class="tb-chip" data-f="${k}" aria-pressed="${state.filtre === k}" style="--marque:${ACTIVITIES[k].color}">
              <img class="tb-logo" src="assets/logos/${k}.png" alt="" data-cle="${k}"><span>${esc(ACTIVITIES[k].label)}</span></button>`).join('')}
          </div>
          <div class="seg tb-periode">${PERIODS.map(([k, l]) => `<button data-p="${k}" class="${state.periode === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        </div>

        <section class="tb-kpis">
          ${kpi('Leads du mois', t.leadsPeriode, evolution(avant?.leadsPeriode, t.leadsPeriode), serieDe(cle => nbLeadsMois(cles, cle, deals)), `${t.leads} prospects en base`)}
          ${kpi('RDV', t.rdv, evolution(avant?.rdv, t.rdv), serieDe(cle => nbRdvMois(cles, cle, deals)), 'atteints sur la période')}
          ${kpi('Affaires signées', t.signees ?? '—', evolution(avant?.signees, t.signees), serieDe(cle => nbSigneesMois(cles, cle, deals)), t.panier ? `panier ${eur(t.panier)}` : 'panier moyen indisponible')}
          ${kpi('CA HT signé', eur(t.ca), evolution(avant?.ca, t.ca), serieDe(caDu), obj ? `objectif ${eur(obj)}` : 'aucun objectif fixé')}
          ${kpi('Lead → RDV', tauxRdv === null ? '—' : pct(tauxRdv) + ' %', ecart(entAvant?.tauxRdv, tauxRdv), [], `${avecRdv} RDV sur ${recus} lead${recus > 1 ? 's' : ''} reçu${recus > 1 ? 's' : ''}`, true)}
          ${kpi('RDV → vente', tauxVente === null ? '—' : pct(tauxVente) + ' %', ecart(entAvant?.tauxVente, tauxVente), [], `${conclus} signé${conclus > 1 ? 's' : ''} sur ${avecRdv} RDV`, true)}
        </section>

        <div class="tb-grid">
          <div class="tb-col">

            <section class="card">
              <div class="card-head"><h2>Pipeline &amp; conversion</h2>
                <span class="muted small">affaires créées sur la période · taux de passage</span></div>
              <div class="tb-funnel">
                ${ent.map((s, i) => {
                  const prev = i ? ent[i - 1].n : null;
                  const large = ent[0].n ? s.n / ent[0].n * 100 : 0;
                  const fin = i === ent.length - 1;
                  return `<div class="tb-step">
                    <span class="tb-nm">${s.nom}</span>
                    <div class="tb-bar" style="width:${Math.max(large, s.n ? 4 : 0)}%;${fin ? 'background:var(--green)' : `opacity:${(1 - i * 0.13).toFixed(2)}`}"><span>${s.n}</span></div>
                    <span class="tb-rate">${prev === null ? '' : prev ? '↓ ' + Math.round(s.n / prev * 100) + ' %' : '—'}</span>
                  </div>`;
                }).join('')}
              </div>
              <div class="tb-funnel-out">
                <b>${pct(recus ? conclus / recus : 0)} %</b>
                <span class="muted small">des leads reçus sur la période sont déjà signés${conclus ? ` · ${eur(montantCohorte(cles, r, deals))} de CA sur ces ${conclus} affaire${conclus > 1 ? 's' : ''}` : ''}</span>
              </div>
            </section>

            <section class="card">
              <div class="card-head"><h2>Objectifs &amp; performance</h2>
                ${objAn ? `<span class="muted small tb-an">Année ${an.annee} : <b>${eur(caAn)}</b> sur ${eur(objAn)} · ${pct(caAn / objAn)} %
                  <span class="tb-track" style="width:70px"><span class="tb-fill" style="width:${Math.min(100, pct(caAn / objAn))}%;background:var(--accent)"></span><span class="tb-today" style="left:${Math.min(100, pct(ecoule(an)))}%"></span></span></span>` : ''}
                ${scope.isDirection ? '<button class="btn ghost sm" id="tb-obj">Fixer les objectifs</button>' : ''}</div>
              ${obj ? `<div class="table-wrap"><table class="tb-goals">
                <thead><tr><th>Structure</th><th class="num">Objectif ${esc(libellePeriode(state.periode))}</th><th class="num">Signé</th><th class="num">Reste</th><th class="num">Avancement</th></tr></thead>
                <tbody>
                  ${cles.map(k => ligneObjectif(k, r, deals, part)).join('')}
                  ${cles.length > 1 ? ligneTotal(t.ca, obj, part) : ''}
                </tbody></table></div>
                <p class="muted small tb-legend"><i></i> Objectif annuel ramené ${esc(libellePeriode(state.periode))} ; le repère marque ${pct(part)} % de la période écoulée. À droite du repère, la structure est en avance.</p>`
              : `<p class="empty" style="padding:22px">${objAn ? 'Pas d\'objectif calculable sur cette période.' : 'Aucun objectif fixé.'}${scope.isDirection && !objAn ? ' Utilisez « Fixer les objectifs » pour définir un objectif de CA annuel par structure.' : ''}</p>`}
            </section>

            <section class="card">
              <div class="card-head"><h2>Évolution du chiffre d'affaires</h2>
                <span class="muted small">CA HT signé · 12 derniers mois</span></div>
              <div class="tb-chartwrap">
                <div class="chart-box tb-chart"><canvas id="tb-canvas"></canvas></div>
                <div class="tb-totals">
                  <h3>${esc(moisSerie[moisSerie.length - 1].label)}</h3>
                  ${cles.map(k => `<div class="tb-trow"><span class="dot" style="background:${ACTIVITIES[k].color}"></span>
                    <span class="tb-tnm">${esc(ACTIVITIES[k].label)}</span><b>${eur(caMois(k, moisCle(), deals))}</b></div>`).join('')}
                </div>
              </div>
            </section>

          </div>

          <div class="tb-col">
            ${carteJournee(visibles)}
            ${carteTaches()}
            ${cartePatrimoine()}
          </div>
        </div>

        ${sources.length ? `<p class="muted small tb-source">${sources.map(x =>
          `${esc(ACTIVITIES[x.cle].label)} : chiffres déposés par ${esc(x.source)}, mis à jour le ${new Date(x.maj).toLocaleDateString('fr-FR')}`).join(' · ')}</p>` : ''}`;

      // ---- interactions
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
        state.filtre = b.dataset.f;
        try { localStorage.setItem(LS_FILTRE, state.filtre); } catch { /* navigation privée */ }
        draw();
      });
      root.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { state.periode = b.dataset.p; draw(); });
      root.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { location.hash = el.dataset.go; });
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

      dessineCourbe(cles, moisSerie, deals);
    };

    // ---------- indicateurs ----------
    const kpi = (libelle, valeur, d, serie, sous, points = false) => `
      <article class="tb-kpi">
        <span class="tb-lbl">${libelle}</span>
        <span class="tb-val">${valeur}</span>
        <span class="tb-sub">${delta(d, points)}<span class="muted">${comparaisonLabel(state.periode)}</span></span>
        <span class="tb-sub muted">${esc(sous)}</span>
        ${spark(serie, d === null || d >= 0 ? 'var(--green)' : 'var(--red)')}
      </article>`;

    // ---------- courbe ----------
    const dessineCourbe = (cles, mois, deals) => {
      const canvas = root.querySelector('#tb-canvas');
      if (!canvas || !window.Chart) return;
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
    return { refresh: draw, destroy: () => chart?.destroy() };
  },
};

// ---------- comparaison avec la période précédente ----------
function comparaison(cles, periode, deals) {
  if (periode === 'all' || periode === 'today') return null;
  const r = periodRange(periode);
  const duree = r.end - r.start;
  const precedent = { start: new Date(r.start.getTime() - duree), end: new Date(r.start.getTime()) };
  return total(cles, precedent, deals);
}
const comparaisonLabel = (p) => ({
  today: '', week: 'vs semaine dernière', month: 'vs mois dernier',
  quarter: 'vs trimestre dernier', year: 'vs an dernier', all: '',
}[p] || '');
// Les taux se comparent en points de pourcentage, pas en pourcentage de pourcentage
const ecart = (avant, apres) => (avant == null || apres == null) ? null : Math.round((apres - avant) * 100);

// L'entonnoir de la période précédente, pour comparer les taux à population comparable
function comparaisonEntonnoir(cles, periode, deals) {
  if (periode === 'all' || periode === 'today') return null;
  const r = periodRange(periode);
  const duree = r.end - r.start;
  const e = entonnoir(cles, { start: new Date(r.start.getTime() - duree), end: new Date(r.start.getTime()) }, deals);
  const [recus, , rdv, , signes] = e.map(x => x.n);
  return { tauxRdv: recus ? rdv / recus : null, tauxVente: rdv ? signes / rdv : null };
}
// CA porté par les affaires nées ET signées dans la période — le chiffre qui va avec l'entonnoir
const montantCohorte = (cles, r, deals) => deals
  .filter(d => cles.includes(d.activity) && d.status === 'won' && inRange(d.created_at, r))
  .reduce((s, d) => s + (Number(d.amount) || 0), 0);

// ---------- séries mensuelles ----------
const enMois = (d, cle) => (d || '').slice(0, 7) === cle;
const nbLeadsMois = (cles, cle, deals) => deals.filter(d => cles.includes(d.activity) && enMois(d.created_at, cle)).length;
const nbSigneesMois = (cles, cle, deals) => deals.filter(d => cles.includes(d.activity) && d.status === 'won' && enMois(d.won_at, cle)).length;
const nbRdvMois = (cles, cle, deals) => deals.filter(d => {
  if (!cles.includes(d.activity)) return false;
  const at = (d.stage_history || []).find(h => h.stage === ACTIVITIES[d.activity]?.rdvStage)?.at || d.won_at;
  return enMois(at, cle);
}).length;

// ---------- objectifs ----------
function ligneObjectif(k, r, deals, part) {
  const c = chiffres(k, r, deals);
  const o = objectif(k, r);
  const avance = o ? c.ca / o : 0;
  const reste = Math.max(0, o - c.ca);
  return `<tr class="click" data-go="${k === 'rgd' ? '#/rgd' : k === 'btp' ? '#/btp' : k === 'courtage' ? '#/courtage' : '#/pipeline/' + k}">
    <td><span class="tb-struct"><img src="assets/logos/${k}-complet.png" alt="${esc(ACTIVITIES[k].label)}" data-cle="${k}" data-nom="${esc(ACTIVITIES[k].label)}"></span></td>
    <td class="num">${o ? eur(o) : '—'}</td>
    <td class="num"><b>${eur(c.ca)}</b></td>
    <td class="num">${o ? (reste ? eur(reste) : 'atteint') : '—'}</td>
    <td class="num">${jauge(avance, part, ACTIVITIES[k].color, o)}</td>
  </tr>`;
}
const ligneTotal = (ca, obj, part) => `<tr class="total">
  <td>Groupe</td><td class="num">${eur(obj)}</td><td class="num">${eur(ca)}</td>
  <td class="num">${Math.max(0, obj - ca) ? eur(obj - ca) : 'atteint'}</td>
  <td class="num">${jauge(obj ? ca / obj : 0, part, 'var(--accent)', obj)}</td></tr>`;
function jauge(avance, part, couleur, objectifFixe) {
  if (!objectifFixe) return '—';
  const p = pct(avance);
  return `<span class="tb-jauge" title="${p} % de l'objectif, ${pct(part)} % de la période écoulée">
    <span class="tb-track"><span class="tb-fill" style="width:${Math.min(100, p)}%;background:${couleur}"></span>
    <span class="tb-today" style="left:${Math.min(100, pct(part))}%"></span></span>
    <b class="${avance >= part ? 'status-won' : ''}">${p} %</b></span>`;
}
function formObjectifs(onSaved) {
  const valeurs = Object.fromEntries(ACTIVITY_KEYS.map(k => [k, objectifAnnuel(k) || '']));
  const spec = ACTIVITY_KEYS.map(k => ({
    key: k, label: ACTIVITIES[k].label, type: 'number',
    hint: k === ACTIVITY_KEYS[0] ? 'Objectif de CA HT signé sur l\'année. Le mois et le trimestre en prennent leur part : un objectif de 480 000 € vaut 40 000 € par mois.' : '',
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
  today: 'à la journée', week: 'à la semaine', month: 'au mois',
  quarter: 'au trimestre', year: "sur l'année", all: '',
}[p] || '');

// ---------- journée ----------
// Les agendas Google des structures, superposés dans un seul cadre : c'est Google
// qui colore par agenda. Le CRM ne peut pas lire leur contenu, il ne les mélange
// donc pas à ses propres tâches — celles du jour sont listées juste en dessous.
function carteJournee(cles) {
  const ids = idsDeTous(cles);
  const raccordees = structuresRaccordees(cles);
  // Vue « jour » seulement : le tableau de bord montre la journée en cours. La
  // semaine et le mois se consultent dans Google Agenda, lien à droite.
  const entete = `<div class="card-head"><h2>Ma journée</h2>
    <span class="muted small">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    ${ids.length ? '<a class="btn ghost sm" href="https://calendar.google.com/calendar/r/day" target="_blank" rel="noopener">Ouvrir Google Agenda ↗</a>' : ''}
    ${peutRaccorder() ? `<button class="btn ghost sm" id="tb-ag">${ids.length ? 'Agendas' : 'Raccorder les agendas'}</button>` : ''}</div>`;

  if (!ids.length) {
    return `<section class="card">${entete}
      <div class="tb-ag-vide">
        <p><b>Aucun agenda n'est encore raccordé.</b> Une fois les calendriers Google des structures renseignés,
        ils s'afficheront ici superposés, chacun avec sa couleur.</p>
        ${peutRaccorder() ? modeEmploi() + '<p class="muted small">Puis « Raccorder les agendas » ci-dessus.</p>'
          : '<p class="muted small">La direction peut les renseigner depuis cet écran.</p>'}
      </div>
      ${listeDuJour(true)}
    </section>`;
  }
  const manquantes = cles.filter(k => !raccordees.includes(k));
  return `<section class="card">${entete}
    ${cadreAgenda(ids, 'DAY', 'Agendas du groupe')}
    <p class="muted small tb-ag-src">${raccordees.map(k => `<span class="ag-src"><span class="dot" style="background:${ACTIVITIES[k].color}"></span>${esc(ACTIVITIES[k].label)}</span>`).join('')}
      ${manquantes.length ? `<span class="ag-abs">sans agenda : ${manquantes.map(k => esc(ACTIVITIES[k].label)).join(', ')}</span>` : ''}</p>
    ${listeDuJour(false)}
    ${noteAgenda()}
  </section>`;
}
// Les rendez-vous notés dans le CRM lui-même : ils ne sont pas dans Google, donc
// ils seraient invisibles si on ne les affichait pas à part.
function listeDuJour(seul) {
  const jour = isoDay();
  const rdv = scope.activities()
    .filter(a => !a.done && a.due_date === jour && a.due_time)
    .sort((a, b) => a.due_time.localeCompare(b.due_time));
  if (!rdv.length) return seul ? '<div class="empty" style="padding:14px 0">Aucun rendez-vous noté dans le CRM aujourd\'hui.</div>' : '';
  const maintenant = new Date().toTimeString().slice(0, 5);
  let corps = '';
  rdv.forEach((a, i) => {
    if (rdv[i - 1] && rdv[i - 1].due_time < maintenant && a.due_time > maintenant)
      corps += `<div class="tb-now"><span class="h">${maintenant}</span><span class="line"></span></div>`;
    const act = ACTIVITIES[db.byId('deals', a.deal_id)?.activity];
    corps += `<div class="tb-slot click" data-go="#/today">
      <span class="h">${esc(a.due_time)}</span>
      <span class="tb-rail"><i style="background:${act ? act.color : 'var(--muted-2)'}"></i></span>
      <span><span class="t">${esc(a.title)}</span><span class="m">${esc(a.type || 'Tâche')}${act ? ' · ' + esc(act.label) : ''}</span></span>
    </div>`;
  });
  return `${seul ? '' : '<h3 class="tb-ag-titre">Noté dans le CRM aujourd\'hui</h3>'}<div class="tb-day">${corps}</div>`;
}
function formAgendas(cles, onSaved) {
  openModal('Agendas des structures',
    `<div id="f-ag">${champsAgendas(cles)}
     <details class="ag-aide"><summary>Où trouver l'identifiant d'un calendrier ?</summary>${modeEmploi()}</details></div>
     <div class="form-actions"><button class="btn ghost" id="ag-x">Annuler</button><button class="btn" id="ag-ok">Enregistrer</button></div>`,
    { wide: true, onOpen: (m) => {
      m.querySelector('#ag-x').onclick = () => closeModal();
      m.querySelector('#ag-ok').onclick = async () => {
        try { await enregistrerAgendas(m.querySelector('#f-ag'), cles); closeModal(true); onSaved(); }
        catch (e) { toast(e.message, 'err'); }
      };
    } });
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
