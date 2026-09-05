// Pipeline kanban d'une activité, avec glisser-déposer entre étapes.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, weightedAmount } from '../data/schema.js';
import { esc, eur, toast, daysSince, initials, dealParty, userName, csvDownload, fmtDate } from '../ui.js';
import { openDeal, dealForm, moveStage } from './deal.js';
import { nextActivity } from './activity.js';

const ROTTING_DAYS = 10; // affaire « qui dort » : plus de X jours sans changement d'étape

export const pipelinePage = {
  title: (k) => `Pipeline ${ACTIVITIES[k]?.label || ''}`,
  render(root, key) {
    const act = ACTIVITIES[key]; if (!act) { root.innerHTML = '<div class="empty">Activité inconnue</div>'; return {}; }
    const state = { q: '', owner: '', view: 'open', page: null };
    const users = scope.users();

    const draw = () => {
      const all = scope.deals().filter(d => d.activity === key);
      const filtered = all.filter(d => (!state.owner || d.owner_id === state.owner) && (!state.q || (d.title + ' ' + dealParty(d)).toLowerCase().includes(state.q.toLowerCase())));
      const open = filtered.filter(d => d.status === 'open');
      const won = filtered.filter(d => d.status === 'won');
      const lost = filtered.filter(d => d.status === 'lost');
      const potential = open.reduce((s, d) => s + weightedAmount(d), 0);
      const noNext = open.filter(d => !nextActivity(d.id));
      const rotting = open.filter(d => daysSince(d.stage_changed_at) > ROTTING_DAYS);

      root.innerHTML = `
        <div class="toolbar">
          <input type="search" class="grow" placeholder="Rechercher une affaire, un contact…" value="${esc(state.q)}" id="p-q">
          <select id="p-owner"><option value="">Tous les responsables</option>${users.map(u => `<option value="${u.id}" ${state.owner === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>
          <div class="seg"><button data-view="open" class="${state.view === 'open' ? 'active' : ''}">Kanban</button><button data-view="list" class="${state.view === 'list' ? 'active' : ''}">Liste</button><button data-view="closed" class="${state.view === 'closed' ? 'active' : ''}">Gagnées / perdues</button></div>
          <button class="btn ghost sm" id="p-export">Export CSV</button>
          <button class="btn" id="p-new">+ Nouvelle affaire</button>
        </div>
        <div class="grid c4">
          <div class="card tight kpi" style="--kpi:${act.color}22;--kpi-c:${act.color}"><div class="lbl">Affaires ouvertes</div><div class="val">${open.length}</div><div class="sub">${eur(open.reduce((s, d) => s + (Number(d.amount) || 0), 0))} en cours</div></div>
          <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">CA potentiel pondéré</div><div class="val">${eur(potential)}</div><div class="sub">selon la probabilité de chaque étape</div></div>
          <div class="card tight kpi" style="--kpi:#fef3c7;--kpi-c:var(--amber)"><div class="lbl">Sans prochaine action</div><div class="val">${noNext.length}</div><div class="sub">à corriger aujourd'hui</div></div>
          <div class="card tight kpi" style="--kpi:#fee2e2;--kpi-c:var(--red)"><div class="lbl">Qui dorment (&gt; ${ROTTING_DAYS} j)</div><div class="val">${rotting.length}</div><div class="sub">sans changement d'étape</div></div>
        </div>
        <div id="p-body"></div>`;

      const body = root.querySelector('#p-body');
      if (state.view === 'open') body.innerHTML = kanbanHtml(act, open.concat(won.filter(d => act.stages.find(s => s.key === d.stage)?.delivery)));
      else if (state.view === 'list') body.innerHTML = listHtml(act, open);
      else body.innerHTML = closedHtml(act, won, lost);

      root.querySelector('#p-q').oninput = e => { state.q = e.target.value; draw(); root.querySelector('#p-q').focus(); };
      root.querySelector('#p-owner').onchange = e => { state.owner = e.target.value; draw(); };
      root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { state.view = b.dataset.view; draw(); });
      root.querySelector('#p-new').onclick = () => dealForm(key, null, {}, draw);
      root.querySelector('#p-export').onclick = () => csvDownload(`affaires-${key}.csv`, filtered.map(d => ({ titre: d.title, statut: d.status, etape: act.stages.find(s => s.key === d.stage)?.label, montant: d.amount, contact: dealParty(d), responsable: userName(d.owner_id), canal: d.channel, campagne: d.campaign, cree_le: fmtDate(d.created_at), gagne_le: fmtDate(d.won_at), motif_perte: d.lost_reason, ...(d.fields || {}) })));
      root.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, draw));
      bindDragDrop(root, draw);
    };

    const kanbanHtml = (act, deals) => `<div class="kanban">${act.stages.map(s => {
      const col = deals.filter(d => d.stage === s.key);
      const sum = col.reduce((t, d) => t + (Number(d.amount) || 0), 0);
      return `<div class="col" data-col="${s.key}"><div class="col-head"><div><b>${esc(s.label)}</b><span class="sum">${eur(sum)}${s.delivery ? ' · gagné' : ' · ' + s.p + ' %'}</span></div><span>${col.length}</span></div>
        ${col.map(d => cardHtml(act, d)).join('')}</div>`;
    }).join('')}</div>`;

    const cardHtml = (act, d) => {
      const nx = nextActivity(d.id);
      const late = nx && daysSince(nx.due_date) > 0; const todayA = nx && daysSince(nx.due_date) === 0;
      const rot = d.status === 'open' && daysSince(d.stage_changed_at) > ROTTING_DAYS;
      return `<div class="dcard" draggable="true" data-deal="${d.id}" style="--c:${act.color}">
        <div class="t">${esc(d.title)}</div><div class="p">${esc(dealParty(d))}</div>
        <div class="foot"><span class="amt">${d.amount ? eur(d.amount) : '<span class="muted">— €</span>'}</span><span class="avatar" title="${esc(userName(d.owner_id))}">${initials(d.owner_id)}</span></div>
        ${nx ? `<div class="next ${late ? 'late' : todayA ? 'today' : ''}">${late ? '⚠ ' : ''}${esc(nx.title)} · ${fmtDate(nx.due_date)}</div>` : d.status === 'open' ? `<div class="next none">Aucune prochaine action</div>` : ''}
        ${rot ? `<div class="small rot" style="margin-top:6px">${daysSince(d.stage_changed_at)} j sans mouvement</div>` : ''}
      </div>`;
    };

    const listHtml = (act, deals) => `<div class="card"><div class="table-wrap"><table><thead><tr><th>Affaire</th><th>Contact / organisation</th><th>Étape</th><th class="num">Montant</th><th>Prochaine action</th><th>Responsable</th><th>Canal</th><th class="num">Dans l'étape</th></tr></thead><tbody>
      ${deals.sort((a, b) => (a.stage_changed_at || '').localeCompare(b.stage_changed_at || '')).map(d => { const nx = nextActivity(d.id); return `<tr class="click" data-deal="${d.id}"><td><b>${esc(d.title)}</b></td><td>${esc(dealParty(d))}</td><td><span class="pill">${esc(act.stages.find(s => s.key === d.stage)?.label || d.stage)}</span></td><td class="num">${eur(d.amount)}</td><td>${nx ? `${esc(nx.title)} <span class="small ${daysSince(nx.due_date) > 0 ? 'status-lost' : 'muted'}">${fmtDate(nx.due_date)}</span>` : '<span class="pill warn">Aucune</span>'}</td><td>${esc(userName(d.owner_id))}</td><td class="small">${esc(d.channel || '—')}</td><td class="num ${daysSince(d.stage_changed_at) > ROTTING_DAYS ? 'status-lost' : ''}">${daysSince(d.stage_changed_at) ?? 0} j</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Aucune affaire</td></tr>'}
    </tbody></table></div></div>`;

    const closedHtml = (act, won, lost) => `<div class="grid c2">
      <div class="card"><h3>Gagnées (${won.length}) — ${eur(won.reduce((s, d) => s + (Number(d.amount) || 0), 0))}</h3><div class="table-wrap"><table><tbody>${won.sort((a, b) => (b.won_at || '').localeCompare(a.won_at || '')).map(d => `<tr class="click" data-deal="${d.id}"><td><b>${esc(d.title)}</b><div class="small muted">${esc(dealParty(d))} · ${esc(d.channel || '')}</div></td><td class="num">${eur(d.amount)}</td><td class="num small muted">${fmtDate(d.won_at)}</td></tr>`).join('') || '<tr><td class="empty">Aucune</td></tr>'}</tbody></table></div></div>
      <div class="card"><h3>Perdues (${lost.length})</h3><div class="table-wrap"><table><tbody>${lost.sort((a, b) => (b.lost_at || '').localeCompare(a.lost_at || '')).map(d => `<tr class="click" data-deal="${d.id}"><td><b>${esc(d.title)}</b><div class="small muted">${esc(dealParty(d))}</div></td><td><span class="pill bad">${esc(d.lost_reason || '—')}</span></td><td class="num">${eur(d.amount)}</td><td class="num small muted">${fmtDate(d.lost_at)}</td></tr>`).join('') || '<tr><td class="empty">Aucune</td></tr>'}</tbody></table></div></div>
    </div>`;

    function bindDragDrop(root, redraw) {
      let dragId = null;
      root.querySelectorAll('.dcard').forEach(c => {
        c.addEventListener('dragstart', e => { dragId = c.dataset.deal; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        c.addEventListener('dragend', () => c.classList.remove('dragging'));
      });
      root.querySelectorAll('.col').forEach(col => {
        col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
        col.addEventListener('dragleave', () => col.classList.remove('over'));
        col.addEventListener('drop', async e => {
          e.preventDefault(); col.classList.remove('over');
          const d = db.byId('deals', dragId); if (!d) return;
          const st = act.stages.find(s => s.key === col.dataset.col);
          if (d.status === 'won' && !st.delivery) return toast('Affaire gagnée : réouvrez-la depuis sa fiche pour la remettre en cours', 'warn');
          await moveStage(d, col.dataset.col); redraw();
        });
      });
    }

    draw();
    return { refresh: draw };
  },
};
