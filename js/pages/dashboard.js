// Vue d'ensemble dirigeant : les quatre structures sur la période, puis l'évolution du CA signé.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS } from '../data/schema.js';
import { chiffres, caMois, derniersMois, externe } from '../data/chiffres.js';
import { esc, eur, periodRange, PERIODS } from '../ui.js';

// Les logos des structures n'ont pas du tout le même format : bandeau très allongé
// pour RGD Renova et La Référence Courtage, presque carré pour BTP Expertise.
// À hauteur égale, le carré paraît deux fois plus petit que les bandeaux ; à largeur
// égale, c'est l'inverse. On leur donne donc la même SURFACE — c'est ce qui les fait
// peser pareil dans le tableau. Calculé sur les dimensions réelles du fichier : un
// logo remplacé se remet d'aplomb tout seul, sans règle CSS à retoucher.
const AIRE_LOGO = 1900;
function proportionner(im) {
  // Le repli est un pictogramme, pas un logo : il garde la taille fixe que lui donne
  // le CSS, sinon il se retrouve plus gros que les vrais logos parce qu'il est carré.
  if (im.classList.contains('picto')) { im.style.height = ''; im.style.width = ''; return; }
  const forme = im.naturalWidth / im.naturalHeight;
  if (!forme || !isFinite(forme)) return;
  const h = Math.round(Math.sqrt(AIRE_LOGO / forme));
  im.style.height = `${h}px`;
  im.style.width = `${Math.round(h * forme)}px`;
}

export const dashboardPage = {
  title: () => "Vue d'ensemble",
  directionOnly: true,
  render(root) {
    const state = { period: 'month' };
    let chart = null;

    const draw = () => {
      const r = periodRange(state.period);
      const all = scope.deals();
      // Les chiffres viennent de js/data/chiffres.js, comme le tableau de bord : deux
      // écrans qui montrent « le CA de septembre » doivent montrer le même nombre.
      const rows = ACTIVITY_KEYS.map(k => {
        const c = chiffres(k, r, all);
        return { k, leads: c.leads, rdv: c.rdv, wonN: c.signees, ca: c.ca, basket: c.panier, ext: externe(k) };
      });
      const tot = rows.reduce((t, x) => ({ leads: t.leads + x.leads, rdv: t.rdv + x.rdv, wonN: t.wonN + (x.wonN || 0), ca: t.ca + x.ca }), { leads: 0, rdv: 0, wonN: 0, ca: 0 });
      const totFiable = rows.every(x => x.wonN !== null || !x.ca);   // un CA sans compte d'affaires fausserait le panier global

      root.innerHTML = `
        ${db.demo ? '<div class="demo-banner"><b>Mode démo</b> — données d\'exemple stockées dans ce navigateur.</div>' : ''}
        <div class="toolbar">
          <div class="seg">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${state.period === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          <span class="muted small">Leads = prospects de la base de chaque structure (tous) · RDV, CA HT et panier moyen sur la période choisie.</span>
        </div>

        <div class="card"><div class="table-wrap"><table class="tbl-structures">
          <thead><tr><th>Structure</th><th class="num">Leads</th><th class="num">RDV</th><th class="num">CA HT</th><th class="num">Panier moyen</th></tr></thead>
          <tbody>
            ${rows.map(x => `<tr class="click" data-go="${x.k === 'rgd' ? '#/rgd' : x.k === 'btp' ? '#/btp' : '#/pipeline/' + x.k}">
              <td><span class="act-name"><img class="act-logo" src="assets/logos/${x.k}-complet.png" alt="${esc(ACTIVITIES[x.k].label)}" title="${esc(ACTIVITIES[x.k].label)}" data-cle="${x.k}" data-nom="${esc(ACTIVITIES[x.k].label)}"></span></td>
              <td class="num">${x.leads}</td><td class="num">${x.rdv}</td>
              <td class="num"><b>${eur(x.ca)}</b></td>
              <td class="num">${x.basket === null ? '—' : eur(x.basket)}</td></tr>`).join('')}
            <tr class="total"><td>Total</td><td class="num">${tot.leads}</td><td class="num">${tot.rdv}</td><td class="num">${eur(tot.ca)}</td><td class="num">${totFiable && tot.wonN ? eur(tot.ca / tot.wonN) : '—'}</td></tr>
          </tbody></table></div>
          ${rows.filter(x => x.ext).length ? `<p class="muted small" style="margin:12px 0 0">${rows.filter(x => x.ext).map(x => `${esc(ACTIVITIES[x.k].label)} : chiffres déposés par ${esc(x.ext.source || 'son outil')}, mis à jour le ${new Date(x.ext.updated_at).toLocaleDateString('fr-FR')}`).join(' · ')}</p>` : ''}
        </div>

        <div class="card"><div class="card-head"><h2>CA HT par structure</h2><span class="muted small">12 derniers mois · une couleur par structure</span></div>
          <div class="chart-box" style="height:320px"><canvas id="db-chart"></canvas></div></div>`;

      root.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { state.period = b.dataset.period; draw(); });
      root.querySelectorAll('[data-go]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.go);
      // Logo complet (avec le nom écrit) ; à défaut le pictogramme du menu ; à défaut le nom
      root.querySelectorAll('.act-logo').forEach(im => {
        im.onerror = () => {
          if (im.dataset.repli) return im.replaceWith(document.createTextNode(im.dataset.nom));
          im.dataset.repli = '1'; im.classList.add('picto'); im.src = `assets/logos/${im.dataset.cle}.png`;
        };
        if (im.complete && im.naturalHeight) proportionner(im); else im.onload = () => proportionner(im);
      });
      drawChart(all);
    };

    const drawChart = (deals) => {
      const canvas = root.querySelector('#db-chart'); if (!canvas || !window.Chart) return;
      const months = derniersMois(12).map(m => ({ key: m.cle, label: m.label }));
      const caOf = (k, m) => caMois(k, m, deals);
      // Une courbe par structure, à sa couleur, pour les comparer sur le même axe.
      // Le total de chaque structure est écrit dans la légende : la couleur n'est jamais
      // seule à porter l'information. Les quatre structures restent affichées, même à zéro :
      // masquer les vides faisait barrer leur nom dans la légende, ce qui se lit mal.
      // Le libellé dit « pas encore de chiffres », la ligne plate ne trompe donc personne.
      const datasets = ACTIVITY_KEYS.map(k => {
        const data = months.map(m => caOf(k, m.key));
        const total = data.reduce((s, v) => s + v, 0);
        const c = ACTIVITIES[k].color;
        return {
          label: total ? `${ACTIVITIES[k].label} — ${eur(total)}` : `${ACTIVITIES[k].label} — pas encore de chiffres`,
          data,
          borderColor: c, backgroundColor: c,
          borderWidth: 2, tension: 0.25, fill: false,
          pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: c,
          pointBorderColor: '#fff', pointBorderWidth: 2,
        };
      });
      chart?.destroy();
      chart = new Chart(canvas, {
        type: 'line',
        data: { labels: months.map(m => m.label), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          // Survol au mois : toutes les structures du mois sont comparées d'un coup,
          // sans avoir à viser un point précis.
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#5C5F7A' } },
            y: { beginAtZero: true, border: { display: false }, ticks: { callback: v => v ? (v / 1000) + ' k€' : '0', color: '#8C8FA8' }, grid: { color: '#E6E6F0' } },
          },
          plugins: {
            // Pastille pleine à la couleur de la structure : le style « line » de Chart.js
            // donne un trait d'un pixel, illisible à côté du texte.
            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 10, boxHeight: 10, padding: 18, color: '#16172B', font: { size: 12.5, weight: '600' } } },
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
