// « To do list » : une seule liste, rangée par échéance. Chaque tâche porte un trait
// de la couleur de sa structure — on compare d'un coup d'œil ce que pèse chacune.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, daysSince, userName, searchInput, bindSearch, restoreFocus, terms, hit } from '../ui.js';
import { activityRowHtml, bindActivityRows, activityForm, nextActivity, structureDe } from './activity.js';
import { openDeal } from './deal.js';

export const todayPage = {
  title: () => 'To do list',
  render(root) {
    const state = { qui: '', structure: '', q: '', showDone: false, focus: null };

    const draw = () => {
      const users = scope.users();
      const toutes = scope.activities();
      const ts = terms(state.q);

      const vues = toutes
        .filter(a => !state.qui || a.assignee_id === state.qui)
        .filter(a => hit([a.title, a.notes, userName(a.assignee_id)], ts));
      const ouvertes = vues.filter(a => !a.done);
      // La répartition se lit sur ce que filtrent la personne et la recherche,
      // mais pas sur la structure : sinon il n'y aurait plus rien à comparer.
      const parStructure = Object.values(ACTIVITIES)
        .filter(a => scope.activityKeys.includes(a.key))
        .map(a => ({ ...a, n: ouvertes.filter(t => structureDe(t) === a.key).length }));
      const sansStructure = ouvertes.filter(a => !structureDe(a)).length;
      const total = ouvertes.length;

      const liste = ouvertes.filter(a => !state.structure
        || (state.structure === '—' ? !structureDe(a) : structureDe(a) === state.structure));
      const faitesCeJour = vues.filter(a => a.done && a.done_at && daysSince(a.done_at) === 0)
        .filter(a => !state.structure || (state.structure === '—' ? !structureDe(a) : structureDe(a) === state.structure));

      const retard = liste.filter(a => daysSince(a.due_date) > 0).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const jour = liste.filter(a => daysSince(a.due_date) === 0).sort((x, y) => (x.due_time || '99').localeCompare(y.due_time || '99'));
      const semaine = liste.filter(a => daysSince(a.due_date) < 0 && daysSince(a.due_date) >= -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const plusTard = liste.filter(a => daysSince(a.due_date) < -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const sansDate = liste.filter(a => !a.due_date);

      const sansProchaine = scope.deals().filter(d => d.status === 'open' && !nextActivity(d.id)
        && (!state.structure || d.activity === state.structure));

      const bloc = (titre, l, cls = '') => l.length ? `
        <section class="card todo-bloc ${cls}">
          <h3>${titre}<span>${l.length}</span></h3>
          ${l.map(a => activityRowHtml(a, { showContext: true })).join('')}
        </section>` : '';

      // La barre de comparaison : une part par structure, à sa couleur
      const part = (n) => total ? Math.round((n / total) * 100) : 0;

      root.innerHTML = `
        <div class="todo-repartition">
          ${parStructure.map(a => a.n ? `<i style="width:${part(a.n)}%;background:${a.color}" title="${esc(a.label)} : ${a.n}"></i>` : '').join('')}
          ${sansStructure ? `<i style="width:${part(sansStructure)}%;background:var(--line-strong)" title="Sans structure : ${sansStructure}"></i>` : ''}
        </div>
        <div class="pill-tabs todo-structures">
          <button type="button" data-struct="" class="${state.structure ? '' : 'on'}">Toutes<span>${total}</span></button>
          ${parStructure.map(a => `<button type="button" data-struct="${a.key}" class="${state.structure === a.key ? 'on' : ''}"
            style="--t:${a.color}"><i class="todo-puce" style="background:${a.color}"></i>${esc(a.label)}<span>${a.n}</span></button>`).join('')}
          ${sansStructure ? `<button type="button" data-struct="—" class="${state.structure === '—' ? 'on' : ''}">Sans structure<span>${sansStructure}</span></button>` : ''}
        </div>

        <div class="toolbar">
          ${searchInput('t-q', state, 'Rechercher une tâche…')}
          <select id="t-qui">
            <option value="">Toute l'équipe</option>
            ${users.map(u => `<option value="${u.id}" ${state.qui === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}
          </select>
          <span class="muted small">${retard.length} en retard · ${jour.length} aujourd&rsquo;hui</span>
          <span class="grow"></span>
          <label class="check"><input type="checkbox" id="t-done" ${state.showDone ? 'checked' : ''}> Ce qui est fait</label>
          <button class="btn" id="t-new">+ Tâche</button>
        </div>

        ${sansProchaine.length ? `<div class="alert"><b>${sansProchaine.length}</b><div><b>affaire${sansProchaine.length > 1 ? 's' : ''} sans prochaine action</b> — ${sansProchaine.slice(0, 6).map(d => `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`).join(', ')}${sansProchaine.length > 6 ? '…' : ''}</div></div>` : ''}

        ${bloc('⚠ En retard', retard, 'retard')}
        ${bloc('Aujourd&rsquo;hui', jour)}
        ${bloc('Cette semaine', semaine)}
        ${bloc('Plus tard', plusTard)}
        ${bloc('Sans échéance', sansDate)}
        ${state.showDone ? bloc('Fait aujourd&rsquo;hui', faitesCeJour, 'faites') : ''}
        ${!liste.length ? '<div class="card"><div class="empty">Rien à faire — tout est à jour.</div></div>' : ''}`;

      bindSearch(root, 't-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-struct]').forEach(b => b.onclick = () => {
        state.structure = state.structure === b.dataset.struct ? '' : b.dataset.struct; draw();
      });
      root.querySelector('#t-qui').onchange = e => { state.qui = e.target.value; draw(); };
      root.querySelector('#t-done').onchange = e => { state.showDone = e.target.checked; draw(); };
      root.querySelector('#t-new').onclick = () => activityForm({
        ...(state.qui ? { assignee_id: state.qui } : {}),
        ...(state.structure && state.structure !== '—' ? { activity: state.structure } : {}),
      }, null, draw);
      root.querySelectorAll('[data-open-deal]').forEach(a => a.onclick = e => { e.preventDefault(); openDeal(a.dataset.openDeal, draw); });
      bindActivityRows(root, draw);
    };

    draw();
    return { refresh: draw };
  },
};
