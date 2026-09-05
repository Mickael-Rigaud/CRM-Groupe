// « À faire aujourd'hui » : les actions en retard, du jour, de la semaine, par responsable.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, daysSince, userName } from '../ui.js';
import { activityRowHtml, bindActivityRows, activityForm, nextActivity } from './activity.js';
import { openDeal } from './deal.js';

export const todayPage = {
  title: () => "À faire aujourd'hui",
  render(root) {
    const state = { who: '', showDone: false };
    const draw = () => {
      const users = scope.users();
      const acts = scope.activities().filter(a => !state.who || a.assignee_id === state.who);
      const open = acts.filter(a => !a.done);
      const late = open.filter(a => daysSince(a.due_date) > 0).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const todayA = open.filter(a => daysSince(a.due_date) === 0).sort((x, y) => (x.due_time || '99').localeCompare(y.due_time || '99'));
      const week = open.filter(a => daysSince(a.due_date) < 0 && daysSince(a.due_date) >= -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const later = open.filter(a => daysSince(a.due_date) < -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const noDate = open.filter(a => !a.due_date);
      const doneToday = acts.filter(a => a.done && a.done_at && daysSince(a.done_at) === 0);
      const noNext = scope.deals().filter(d => d.status === 'open' && (!state.who || d.owner_id === state.who) && !nextActivity(d.id));

      const group = (title, list, cls = '') => list.length ? `<div class="card today-group"><h3>${title} <span>${list.length}</span></h3>${list.map(a => activityRowHtml(a, { showContext: true })).join('')}</div>` : '';
      root.innerHTML = `
        <div class="toolbar">
          ${`<select id="t-who"><option value="">Toute l'équipe</option>${users.map(u => `<option value="${u.id}" ${state.who === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>`}
          <span class="muted small">${late.length} en retard · ${todayA.length} aujourd'hui · ${week.length} cette semaine</span>
          <span class="grow"></span>
          <button class="btn" id="t-new">+ Activité</button>
        </div>
        ${noNext.length ? `<div class="alert"><b>${noNext.length}</b><div><b>affaire${noNext.length > 1 ? 's' : ''} sans prochaine action</b> — ${noNext.slice(0, 6).map(d => `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`).join(', ')}${noNext.length > 6 ? '…' : ''}</div></div>` : ''}
        ${group('⚠ En retard', late)}
        ${group("Aujourd'hui", todayA)}
        ${group('Cette semaine', week)}
        ${group('Plus tard', later)}
        ${group('Sans échéance', noDate)}
        ${doneToday.length ? `<div class="card today-group"><h3>Fait aujourd'hui <span>${doneToday.length}</span></h3>${doneToday.map(a => activityRowHtml(a, { showContext: true })).join('')}</div>` : ''}
        ${!open.length ? '<div class="card"><div class="empty">Rien à faire — tout est à jour.</div></div>' : ''}`;
      root.querySelector('#t-who')?.addEventListener('change', e => { state.who = e.target.value; draw(); });
      root.querySelector('#t-new').onclick = () => activityForm({}, null, draw);
      bindActivityRows(root, draw);
      root.querySelectorAll('[data-open-deal]').forEach(a => a.onclick = e => { e.preventDefault(); openDeal(a.dataset.openDeal, draw); });
    };
    draw();
    return { refresh: draw };
  },
};
