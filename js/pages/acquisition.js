// Pilotage de l'acquisition : dépense → leads → joignables → RDV → ventes → CA, par canal et campagne.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, CHANNELS, PAID_CHANNELS, reachedRdv, stageIndex } from '../data/schema.js';
import { esc, eur, pct, periodRange, inRange, PERIODS, openModal, closeModal, renderForm, readForm, toast, csvDownload, isoDay, confirm, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';

export const acquisitionPage = {
  title: () => "Pilotage de l'acquisition",
  directionOnly: true,
  render(root) {
    const state = { period: 'quarter', activity: '', groupBy: 'campaign', q: '', focus: null };
    const draw = () => {
      const r = periodRange(state.period);
      const deals = scope.deals().filter(d => inRange(d.created_at, r) && (!state.activity || d.activity === state.activity));
      const spend = db.t('ad_spend').filter(s => inRange(s.month, r) && (!state.activity || s.activity === state.activity));
      const keyOf = (x) => state.groupBy === 'campaign' ? `${x.activity}||${x.channel || 'Non renseigné'}||${x.campaign || '(sans campagne)'}` : `${x.activity}||${x.channel || 'Non renseigné'}||`;
      const rows = {};
      const get = (k, x) => rows[k] ||= { activity: x.activity, channel: x.channel || 'Non renseigné', campaign: state.groupBy === 'campaign' ? (x.campaign || '(sans campagne)') : '', spend: 0, leads: 0, reachable: 0, rdv: 0, won: 0, revenue: 0 };
      for (const s of spend) get(keyOf(s), s).spend += Number(s.amount) || 0;
      for (const d of deals) {
        const row = get(keyOf(d), d);
        row.leads++;
        if (d.status === 'won' || stageIndex(d.activity, d.stage) >= 1 || (d.stage_history || []).length > 1) row.reachable++;
        if (reachedRdv(d)) row.rdv++;
        if (d.status === 'won') { row.won++; row.revenue += Number(d.amount) || 0; }
      }
      const qt = terms(state.q);
      const list = Object.values(rows).filter(x => hit([x.channel, x.campaign, ACTIVITIES[x.activity]?.label], qt)).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
      const tot = list.reduce((t, x) => ({ spend: t.spend + x.spend, leads: t.leads + x.leads, reachable: t.reachable + x.reachable, rdv: t.rdv + x.rdv, won: t.won + x.won, revenue: t.revenue + x.revenue }), { spend: 0, leads: 0, reachable: 0, rdv: 0, won: 0, revenue: 0 });
      const ratio = (a, b) => b ? a / b : null;
      const cell = (v, f = eur) => v === null ? '<span class="muted">—</span>' : f(v);

      root.innerHTML = `
        <div class="toolbar">
          <div class="seg">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${state.period === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          <select id="a-act"><option value="">Toutes les activités</option>${ACTIVITY_KEYS.map(k => `<option value="${k}" ${state.activity === k ? 'selected' : ''}>${esc(ACTIVITIES[k].label)}</option>`).join('')}</select>
          <div class="seg"><button data-g="campaign" class="${state.groupBy === 'campaign' ? 'active' : ''}">Par campagne</button><button data-g="channel" class="${state.groupBy === 'channel' ? 'active' : ''}">Par canal</button></div>
          ${searchInput('a-q', state, 'Canal, campagne…')}
          <button class="btn ghost sm" id="a-export">Export CSV</button>
          <button class="btn" id="a-spend">+ Dépense publicitaire</button>
        </div>
        <div class="grid c4">
          <div class="card tight kpi"><div class="lbl">Dépense pub</div><div class="val">${eur(tot.spend)}</div><div class="sub">période · leads créés dans la période</div></div>
          <div class="card tight kpi" style="--kpi:#dbeafe;--kpi-c:var(--blue)"><div class="lbl">Coût par lead</div><div class="val">${cell(ratio(tot.spend, tot.leads))}</div><div class="sub">${tot.leads} leads · ${tot.reachable} joignables</div></div>
          <div class="card tight kpi" style="--kpi:#fef3c7;--kpi-c:var(--amber)"><div class="lbl">Coût par RDV</div><div class="val">${cell(ratio(tot.spend, tot.rdv))}</div><div class="sub">${tot.rdv} RDV · ${pct((ratio(tot.rdv, tot.leads) || 0) * 100)} des leads</div></div>
          <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">ROAS</div><div class="val">${tot.spend ? (tot.revenue / tot.spend).toFixed(1) + '×' : '—'}</div><div class="sub">${eur(tot.revenue)} de CA · CAC ${cell(ratio(tot.spend, tot.won))}</div></div>
        </div>
        <div class="card"><div class="card-head"><h2>Parcours par ${state.groupBy === 'campaign' ? 'campagne' : 'canal'}</h2><span class="muted small">Leads = affaires créées sur la période · Joignables = passés au-delà de « Nouveau lead » · CA = affaires gagnées parmi ces leads</span></div>
          <div class="table-wrap"><table><thead><tr><th>Activité</th><th>Canal</th>${state.groupBy === 'campaign' ? '<th>Campagne</th>' : ''}<th class="num">Dépense</th><th class="num">Leads</th><th class="num">Joignables</th><th class="num">RDV</th><th class="num">Ventes</th><th class="num">CA</th><th class="num">CPL</th><th class="num">Coût/RDV</th><th class="num">CAC</th><th class="num">Transfo</th><th class="num">ROAS</th></tr></thead><tbody>
            ${list.map(x => `<tr><td><span class="badge" style="--c:${ACTIVITIES[x.activity]?.color}">${esc(ACTIVITIES[x.activity]?.short || x.activity)}</span></td><td>${esc(x.channel)}</td>${state.groupBy === 'campaign' ? `<td class="small">${esc(x.campaign)}</td>` : ''}<td class="num">${x.spend ? eur(x.spend) : '<span class="muted">—</span>'}</td><td class="num">${x.leads}</td><td class="num">${x.reachable}</td><td class="num">${x.rdv}</td><td class="num">${x.won}</td><td class="num"><b>${eur(x.revenue)}</b></td><td class="num">${x.spend ? cell(ratio(x.spend, x.leads)) : '—'}</td><td class="num">${x.spend ? cell(ratio(x.spend, x.rdv)) : '—'}</td><td class="num">${x.spend ? cell(ratio(x.spend, x.won)) : '—'}</td><td class="num">${x.leads ? pct(x.won / x.leads * 100) : '—'}</td><td class="num">${x.spend ? (x.revenue / x.spend).toFixed(1) + '×' : '—'}</td></tr>`).join('') || '<tr><td colspan="14" class="empty">Aucune donnée sur la période</td></tr>'}
            <tr class="total"><td colspan="${state.groupBy === 'campaign' ? 3 : 2}">Total</td><td class="num">${eur(tot.spend)}</td><td class="num">${tot.leads}</td><td class="num">${tot.reachable}</td><td class="num">${tot.rdv}</td><td class="num">${tot.won}</td><td class="num">${eur(tot.revenue)}</td><td class="num">${cell(ratio(tot.spend, tot.leads))}</td><td class="num">${cell(ratio(tot.spend, tot.rdv))}</td><td class="num">${cell(ratio(tot.spend, tot.won))}</td><td class="num">${tot.leads ? pct(tot.won / tot.leads * 100) : '—'}</td><td class="num">${tot.spend ? (tot.revenue / tot.spend).toFixed(1) + '×' : '—'}</td></tr>
          </tbody></table></div></div>
        <div class="card"><div class="card-head"><h2>Dépenses publicitaires saisies</h2><span class="muted small">une ligne par mois, canal et campagne — le nom de campagne doit être identique à celui saisi sur les affaires</span></div>
          <div class="table-wrap"><table><thead><tr><th>Mois</th><th>Activité</th><th>Canal</th><th>Campagne</th><th class="num">Montant</th><th></th></tr></thead><tbody>
            ${db.t('ad_spend').filter(s => (!state.activity || s.activity === state.activity) && hit([s.channel, s.campaign, ACTIVITIES[s.activity]?.label], qt)).sort((a, b) => b.month.localeCompare(a.month)).map(s => `<tr><td>${new Date(s.month + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</td><td>${esc(ACTIVITIES[s.activity]?.short || '')}</td><td>${esc(s.channel)}</td><td>${esc(s.campaign || '')}</td><td class="num">${eur(s.amount)}</td><td class="right"><button class="icon-btn" data-edit-spend="${s.id}">✎</button><button class="icon-btn" data-del-spend="${s.id}">🗑</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucune dépense saisie</td></tr>'}
          </tbody></table></div></div>`;

      root.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { state.period = b.dataset.period; draw(); });
      root.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { state.groupBy = b.dataset.g; draw(); });
      root.querySelector('#a-act').onchange = e => { state.activity = e.target.value; draw(); };
      bindSearch(root, 'a-q', state, draw); restoreFocus(root, state);
      root.querySelector('#a-spend').onclick = () => spendForm(null, draw);
      root.querySelectorAll('[data-edit-spend]').forEach(b => b.onclick = () => spendForm(db.byId('ad_spend', b.dataset.editSpend), draw));
      root.querySelectorAll('[data-del-spend]').forEach(b => b.onclick = async () => { if (await confirm('Supprimer cette dépense ?')) { await db.remove('ad_spend', b.dataset.delSpend); draw(); } });
      root.querySelector('#a-export').onclick = () => csvDownload('acquisition.csv', list.map(x => ({ activite: ACTIVITIES[x.activity]?.label, canal: x.channel, campagne: x.campaign, depense: x.spend, leads: x.leads, joignables: x.reachable, rdv: x.rdv, ventes: x.won, ca: x.revenue })));
    };

    const spendForm = (existing, onSaved) => {
      const spec = [
        { key: 'month', label: 'Mois', type: 'month', required: true, half: true, value: isoDay().slice(0, 7) },
        { key: 'activity', label: 'Activité', type: 'select', options: ACTIVITY_KEYS.map(k => [k, ACTIVITIES[k].label]), required: true, half: true },
        { key: 'channel', label: 'Canal', type: 'select', options: PAID_CHANNELS.concat(CHANNELS.filter(c => !PAID_CHANNELS.includes(c))), required: true, half: true },
        { key: 'campaign', label: 'Campagne (nom exact)', type: 'text', half: true },
        { key: 'amount', label: 'Montant dépensé HT (€)', type: 'number', required: true, half: true, step: '0.01' },
      ];
      const vals = existing ? { ...existing, month: existing.month.slice(0, 7) } : {};
      const m = openModal(existing ? 'Modifier la dépense' : 'Dépense publicitaire', `<form class="form" id="s-form">${renderForm(spec, vals)}<div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`);
      m.querySelector('#s-form').onsubmit = async e => {
        e.preventDefault();
        const v = readForm(e.target, spec); v.month = v.month + '-01';
        try { if (existing) await db.update('ad_spend', existing.id, v); else await db.insert('ad_spend', v); closeModal(true); toast('Dépense enregistrée'); onSaved(); } catch (err) { toast(err.message, 'err'); }
      };
    };

    draw();
    return { refresh: draw };
  },
};
