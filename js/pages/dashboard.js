// Vue d'ensemble dirigeant : les 4 activités, période, responsable, canal.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, CHANNELS, reachedRdv, weightedAmount } from '../data/schema.js';
import { esc, eur, pct, num, periodRange, inRange, PERIODS, daysSince, userName, dealParty, fmtDate } from '../ui.js';
import { nextActivity } from './activity.js';
import { openDeal } from './deal.js';

export const dashboardPage = {
  title: () => "Vue d'ensemble",
  directionOnly: true,
  render(root) {
    const state = { period: 'month', owner: '', channel: '' };
    let chart = null;

    const draw = () => {
      const r = periodRange(state.period);
      const users = scope.users();
      const all = scope.deals().filter(d => (!state.owner || d.owner_id === state.owner) && (!state.channel || d.channel === state.channel));
      const rows = ACTIVITY_KEYS.map(k => {
        const ds = all.filter(d => d.activity === k);
        const leads = ds.filter(d => inRange(d.created_at, r));
        const rdv = ds.filter(d => reachedRdv(d) && inRange((d.stage_history || []).find(h => h.stage === ACTIVITIES[k].rdvStage)?.at || d.won_at || d.created_at, r));
        const open = ds.filter(d => d.status === 'open');
        const won = ds.filter(d => d.status === 'won' && inRange(d.won_at, r));
        const lost = ds.filter(d => d.status === 'lost' && inRange(d.lost_at, r));
        const closed = won.length + lost.length;
        const delay = won.length ? won.reduce((s, d) => s + Math.max(0, (new Date(d.won_at) - new Date(d.created_at)) / 86400000), 0) / won.length : null;
        return { k, leads: leads.length, rdv: rdv.length, open: open.length, potential: open.reduce((s, d) => s + weightedAmount(d), 0), pipeline: open.reduce((s, d) => s + (Number(d.amount) || 0), 0), wonN: won.length, won: won.reduce((s, d) => s + (Number(d.amount) || 0), 0), rate: closed ? (won.length / closed) * 100 : null, basket: won.length ? won.reduce((s, d) => s + (Number(d.amount) || 0), 0) / won.length : null, delay };
      });
      const tot = rows.reduce((t, x) => ({ leads: t.leads + x.leads, rdv: t.rdv + x.rdv, open: t.open + x.open, potential: t.potential + x.potential, pipeline: t.pipeline + x.pipeline, wonN: t.wonN + x.wonN, won: t.won + x.won }), { leads: 0, rdv: 0, open: 0, potential: 0, pipeline: 0, wonN: 0, won: 0 });

      const openDeals = all.filter(d => d.status === 'open');
      const noNext = openDeals.filter(d => !nextActivity(d.id));
      const rotting = openDeals.filter(d => daysSince(d.stage_changed_at) > 10);
      const lateActs = scope.activities().filter(a => !a.done && daysSince(a.due_date) > 0);
      const renewals = scope.orgs().filter(o => o.renewal_date && daysSince(o.renewal_date) >= -45 && o.client_status === 'Client actif');

      // Sources : CA gagné par canal (période)
      const wonP = all.filter(d => d.status === 'won' && inRange(d.won_at, r));
      const byChannel = {};
      for (const d of wonP) { byChannel[d.channel || 'Non renseigné'] = (byChannel[d.channel || 'Non renseigné'] || 0) + (Number(d.amount) || 0); }
      const chanRows = Object.entries(byChannel).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const leadsByChannel = {};
      for (const d of all.filter(d => inRange(d.created_at, r))) leadsByChannel[d.channel || 'Non renseigné'] = (leadsByChannel[d.channel || 'Non renseigné'] || 0) + 1;

      root.innerHTML = `
        ${db.demo ? '<div class="demo-banner"><b>Mode démo</b> — données d\'exemple stockées dans ce navigateur. Renseignez Supabase dans <code>js/config.js</code> pour passer en production.</div>' : ''}
        <div class="toolbar">
          <div class="seg">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${state.period === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          <select id="db-owner"><option value="">Tous les responsables</option>${users.map(u => `<option value="${u.id}" ${state.owner === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>
          <select id="db-channel"><option value="">Tous les canaux</option>${CHANNELS.map(c => `<option ${state.channel === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        </div>
        <div class="grid c4">
          <div class="card kpi"><div class="lbl">Leads (période)</div><div class="val">${tot.leads}</div><div class="sub">${tot.rdv} RDV obtenus</div></div>
          <div class="card kpi" style="--kpi:#dbeafe;--kpi-c:var(--blue)"><div class="lbl">Affaires en cours</div><div class="val">${tot.open}</div><div class="sub">${eur(tot.pipeline)} brut · ${eur(tot.potential)} pondéré</div></div>
          <div class="card kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">CA signé (période)</div><div class="val">${eur(tot.won)}</div><div class="sub">${tot.wonN} affaire${tot.wonN > 1 ? 's' : ''} gagnée${tot.wonN > 1 ? 's' : ''}</div></div>
          <div class="card kpi" style="--kpi:#fee2e2;--kpi-c:var(--red)"><div class="lbl">À corriger</div><div class="val">${noNext.length + lateActs.length}</div><div class="sub">${noNext.length} sans action · ${lateActs.length} en retard</div></div>
        </div>
        <div class="card"><div class="card-head"><h2>Les 4 activités</h2><span class="muted small">Leads et CA signé sur la période · affaires en cours à date</span></div>
          <div class="table-wrap"><table><thead><tr><th>Activité</th><th class="num">Leads</th><th class="num">RDV</th><th class="num">En cours</th><th class="num">CA potentiel pondéré</th><th class="num">Gagnées</th><th class="num">CA signé</th><th class="num">Transfo</th><th class="num">Panier moyen</th><th class="num">Délai moyen</th></tr></thead><tbody>
            ${rows.map(x => `<tr class="click" data-go="#/pipeline/${x.k}"><td><span class="badge" style="--c:${ACTIVITIES[x.k].color}">${esc(ACTIVITIES[x.k].label)}</span></td><td class="num">${x.leads}</td><td class="num">${x.rdv}</td><td class="num">${x.open}</td><td class="num">${eur(x.potential)}</td><td class="num">${x.wonN}</td><td class="num"><b>${eur(x.won)}</b></td><td class="num">${x.rate === null ? '—' : pct(x.rate)}</td><td class="num">${x.basket === null ? '—' : eur(x.basket)}</td><td class="num">${x.delay === null ? '—' : Math.round(x.delay) + ' j'}</td></tr>`).join('')}
            <tr class="total"><td>Total</td><td class="num">${tot.leads}</td><td class="num">${tot.rdv}</td><td class="num">${tot.open}</td><td class="num">${eur(tot.potential)}</td><td class="num">${tot.wonN}</td><td class="num">${eur(tot.won)}</td><td colspan="3"></td></tr>
          </tbody></table></div></div>
        <div class="grid c2">
          <div class="card"><div class="card-head"><h2>CA signé par mois</h2><span class="muted small">12 derniers mois, par activité</span></div><div class="chart-box"><canvas id="db-chart"></canvas></div></div>
          <div class="card"><div class="card-head"><h2>Origine du CA signé</h2><span class="muted small">période sélectionnée</span></div>
            <div class="table-wrap"><table><thead><tr><th>Canal</th><th class="num">Leads</th><th class="num">CA signé</th></tr></thead><tbody>
              ${chanRows.length ? chanRows.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${leadsByChannel[c] || 0}</td><td class="num"><b>${eur(v)}</b></td></tr>`).join('') : '<tr><td colspan="3" class="empty">Aucune vente sur la période</td></tr>'}
            </tbody></table></div></div>
        </div>
        <div class="grid c3">
          <div class="card"><h3>Affaires sans prochaine action (${noNext.length})</h3>${noNext.length ? noNext.slice(0, 8).map(d => `<div class="act-row" style="margin-bottom:6px;cursor:pointer" data-deal="${d.id}"><div style="flex:1"><b>${esc(d.title)}</b><div class="small muted">${esc(ACTIVITIES[d.activity].short)} · ${esc(userName(d.owner_id))}</div></div></div>`).join('') : '<div class="empty">Tout est planifié</div>'}</div>
          <div class="card"><h3>Affaires qui dorment &gt; 10 j (${rotting.length})</h3>${rotting.length ? rotting.slice(0, 8).map(d => `<div class="act-row" style="margin-bottom:6px;cursor:pointer" data-deal="${d.id}"><div style="flex:1"><b>${esc(d.title)}</b><div class="small muted">${daysSince(d.stage_changed_at)} j dans « ${esc(ACTIVITIES[d.activity].stages.find(s => s.key === d.stage)?.label)} » · ${esc(userName(d.owner_id))}</div></div></div>`).join('') : '<div class="empty">Aucune</div>'}</div>
          <div class="card"><h3>Renouvellements Propulsion &lt; 45 j (${renewals.length})</h3>${renewals.length ? renewals.map(o => `<div class="act-row" style="margin-bottom:6px"><div style="flex:1"><b>${esc(o.name)}</b><div class="small muted">${fmtDate(o.renewal_date)} · ${eur(o.monthly_amount)}/mois · ${esc(userName(o.account_manager_id))}</div></div></div>`).join('') : '<div class="empty">Aucun</div>'}
            <h3 style="margin-top:16px">Activités en retard (${lateActs.length})</h3>${lateActs.slice(0, 5).map(a => `<div class="small">⚠ ${esc(a.title)} · <span class="muted">${esc(userName(a.assignee_id))} · ${fmtDate(a.due_date)}</span></div>`).join('') || '<div class="empty">Aucune</div>'}
          </div>
        </div>`;

      root.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { state.period = b.dataset.period; draw(); });
      root.querySelector('#db-owner').onchange = e => { state.owner = e.target.value; draw(); };
      root.querySelector('#db-channel').onchange = e => { state.channel = e.target.value; draw(); };
      root.querySelectorAll('[data-go]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.go);
      root.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, draw));
      drawChart(all);
    };

    const drawChart = (deals) => {
      const canvas = root.querySelector('#db-chart'); if (!canvas || !window.Chart) return;
      const months = []; const now = new Date();
      for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) }); }
      const datasets = ACTIVITY_KEYS.map(k => ({ label: ACTIVITIES[k].label, backgroundColor: ACTIVITIES[k].color, borderRadius: 6, data: months.map(m => deals.filter(d => d.activity === k && d.status === 'won' && (d.won_at || '').slice(0, 7) === m.key).reduce((s, d) => s + (Number(d.amount) || 0), 0)) }));
      chart?.destroy();
      chart = new Chart(canvas, { type: 'bar', data: { labels: months.map(m => m.label), datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => (v / 1000) + ' k€' }, grid: { color: '#eef0f3' } } }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => `${c.dataset.label} : ${eur(c.raw)}` } } } } });
    };

    draw();
    return { refresh: draw, destroy: () => chart?.destroy() };
  },
};
