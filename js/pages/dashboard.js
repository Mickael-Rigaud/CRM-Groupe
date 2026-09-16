// Vue d'ensemble dirigeant : les quatre structures sur la période, puis l'évolution du CA signé.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, reachedRdv } from '../data/schema.js';
import { esc, eur, periodRange, inRange, PERIODS } from '../ui.js';

export const dashboardPage = {
  title: () => "Vue d'ensemble",
  directionOnly: true,
  render(root) {
    const state = { period: 'month' };
    let chart = null;

    const draw = () => {
      const r = periodRange(state.period);
      const all = scope.deals();
      // Chiffres deposes par un outil externe (tableau de bord RGD Renova) : ils priment
      // sur le calcul interne, puisque la structure se pilote ailleurs.
      const pousse = (k) => db.t('structure_stats').find(x => x.activity === k);
      // Leads = les prospects de la structure, exactement ce que compte l'onglet « Prospects »
      // de sa base de données (contacts portant l'activité, type « Prospect »). Ce total
      // ignore volontairement la période : sinon les deux écrans afficheraient deux nombres.
      const prospects = (k) => scope.contacts().filter(c => (c.activities || []).includes(k) && c.type === 'Prospect').length;
      const rows = ACTIVITY_KEYS.map(k => {
        const ds = all.filter(d => d.activity === k);
        const ext = pousse(k);
        const leads = ext && ext.prospects != null ? ext.prospects : prospects(k);
        // Un RDV compte au moment où l'affaire a atteint l'étape de rendez-vous de son pipeline
        const rdv = ds.filter(d => reachedRdv(d) && inRange((d.stage_history || []).find(h => h.stage === ACTIVITIES[k].rdvStage)?.at || d.won_at || d.created_at, r)).length;
        const won = ds.filter(d => d.status === 'won' && inRange(d.won_at, r));
        // Mois déposés par l'outil externe qui tombent dans la période choisie
        const mois = ext ? (ext.revenue || []).filter(m => inRange(m.month + '-01', r)) : [];
        const dehors = ext && (ext.revenue || []).length > 0;   // l'outil externe fait foi pour cette structure
        const ca = dehors ? mois.reduce((s, m) => s + (Number(m.amount) || 0), 0) : won.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        // Panier moyen = CA ÷ affaires signées : les deux nombres doivent venir de la même
        // source, sinon on divise un CA externe par un compte interne. L'outil externe peut
        // envoyer « deals » avec chaque mois ; sans lui, le panier reste inconnu.
        const signees = dehors
          ? (mois.some(m => m.deals != null) ? mois.reduce((s, m) => s + (Number(m.deals) || 0), 0) : null)
          : won.length;
        return { k, leads, rdv, wonN: signees, ca, basket: signees ? ca / signees : null, ext };
      });
      const tot = rows.reduce((t, x) => ({ leads: t.leads + x.leads, rdv: t.rdv + x.rdv, wonN: t.wonN + (x.wonN || 0), ca: t.ca + x.ca }), { leads: 0, rdv: 0, wonN: 0, ca: 0 });
      const totFiable = rows.every(x => x.wonN !== null || !x.ca);   // un CA sans compte d'affaires fausserait le panier global

      root.innerHTML = `
        ${db.demo ? '<div class="demo-banner"><b>Mode démo</b> — données d\'exemple stockées dans ce navigateur.</div>' : ''}
        <div class="toolbar">
          <div class="seg">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${state.period === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          <span class="muted small">Leads = prospects de la base de chaque structure (tous) · RDV, CA HT et panier moyen sur la période choisie.</span>
        </div>

        <div class="card"><div class="table-wrap"><table>
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
      root.querySelectorAll('.act-logo').forEach(im => im.onerror = () => {
        if (im.dataset.repli) return im.replaceWith(document.createTextNode(im.dataset.nom));
        im.dataset.repli = '1'; im.classList.add('picto'); im.src = `assets/logos/${im.dataset.cle}.png`;
      });
      drawChart(all);
    };

    const drawChart = (deals) => {
      const canvas = root.querySelector('#db-chart'); if (!canvas || !window.Chart) return;
      const months = []; const now = new Date();
      for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) }); }
      const caOf = (k, m) => {
        const ext = db.t('structure_stats').find(x => x.activity === k);
        const ligne = ext && (ext.revenue || []).find(v => v.month === m);
        if (ligne) return Number(ligne.amount) || 0;
        if (ext && (ext.revenue || []).length) return 0;   // l'outil externe fait foi, même à zéro
        return deals.filter(d => d.activity === k && d.status === 'won' && (d.won_at || '').slice(0, 7) === m).reduce((s, d) => s + (Number(d.amount) || 0), 0);
      };
      // Le total de chaque structure est écrit dans la légende : la couleur n'est jamais seule à porter l'information
      const datasets = ACTIVITY_KEYS.map(k => {
        const data = months.map(m => caOf(k, m.key));
        return { label: `${ACTIVITIES[k].label} — ${eur(data.reduce((s, v) => s + v, 0))}`, backgroundColor: ACTIVITIES[k].color, borderColor: '#fff', borderWidth: 2, borderRadius: 4, borderSkipped: false, data };
      });
      chart?.destroy();
      chart = new Chart(canvas, {
        type: 'bar',
        data: { labels: months.map(m => m.label), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: '#5C5F7A' } },
            y: { stacked: true, border: { display: false }, ticks: { callback: v => v ? (v / 1000) + ' k€' : '0', color: '#8C8FA8' }, grid: { color: '#E6E6F0' } },
          },
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, padding: 16, color: '#16172B', font: { size: 12.5, weight: '600' } } },
            tooltip: { callbacks: { label: c => `${c.dataset.label.split(' — ')[0]} : ${eur(c.raw)}` } },
          },
        },
      });
    };

    draw();
    return { refresh: draw, destroy: () => chart?.destroy() };
  },
};
