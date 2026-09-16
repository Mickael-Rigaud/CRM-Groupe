// « To do list » : une colonne par personne, filtrable par structure.
// Chaque tâche porte sa structure — celle qu'on lui a donnée, sinon celle de son affaire.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, daysSince, userName, initials, searchInput, bindSearch, restoreFocus, terms, hit } from '../ui.js';
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

      const filtrees = toutes
        .filter(a => !state.structure || structureDe(a) === state.structure)
        .filter(a => hit([a.title, a.notes, userName(a.assignee_id)], ts));
      const ouvertes = filtrees.filter(a => !a.done);

      const enRetard = (a) => a.due_date && daysSince(a.due_date) > 0;
      const duJour = (a) => a.due_date && daysSince(a.due_date) === 0;

      // Une colonne par personne — celles qui n'ont rien à faire restent visibles,
      // c'est une information en soi quand on répartit le travail.
      const colonnes = users.map(u => {
        const siennes = ouvertes.filter(a => a.assignee_id === u.id);
        return {
          u,
          retard: siennes.filter(enRetard).sort((x, y) => x.due_date.localeCompare(y.due_date)),
          jour: siennes.filter(duJour).sort((x, y) => (x.due_time || '99').localeCompare(y.due_time || '99')),
          suite: siennes.filter(a => !enRetard(a) && !duJour(a))
            .sort((x, y) => (x.due_date || '9999').localeCompare(y.due_date || '9999')),
          faitesCeJour: filtrees.filter(a => a.done && a.assignee_id === u.id && a.done_at && daysSince(a.done_at) === 0),
        };
      });
      const visibles = state.qui ? colonnes.filter(c => c.u.id === state.qui) : colonnes;

      const totalRetard = ouvertes.filter(enRetard).length;
      const totalJour = ouvertes.filter(duJour).length;
      const sansStructure = ouvertes.filter(a => !structureDe(a)).length;
      const sansProchaine = scope.deals().filter(d => d.status === 'open' && !nextActivity(d.id)
        && (!state.structure || d.activity === state.structure));

      const bloc = (titre, liste, cls = '') => liste.length ? `
        <div class="todo-bloc ${cls}"><h4>${titre}<span>${liste.length}</span></h4>
          ${liste.map(a => activityRowHtml(a, { showContext: true })).join('')}</div>` : '';

      root.innerHTML = `
        <div class="pill-tabs todo-gens">
          <button type="button" data-qui="" class="${state.qui ? '' : 'on'}">Toute l&rsquo;équipe<span>${ouvertes.length}</span></button>
          ${colonnes.map(c => `<button type="button" data-qui="${c.u.id}" class="${state.qui === c.u.id ? 'on' : ''}">
            ${esc(c.u.full_name)}<span>${c.retard.length + c.jour.length + c.suite.length}</span></button>`).join('')}
        </div>

        <div class="toolbar">
          ${searchInput('t-q', state, 'Rechercher une tâche…')}
          <select id="t-struct">
            <option value="">Toutes les structures</option>
            ${Object.values(ACTIVITIES).filter(a => scope.activityKeys.includes(a.key))
              .map(a => `<option value="${a.key}" ${state.structure === a.key ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}
          </select>
          <span class="muted small">${totalRetard} en retard · ${totalJour} aujourd&rsquo;hui${sansStructure ? ` · ${sansStructure} sans structure` : ''}</span>
          <span class="grow"></span>
          <button class="btn" id="t-new">+ Tâche</button>
        </div>

        ${sansProchaine.length ? `<div class="alert"><b>${sansProchaine.length}</b><div><b>affaire${sansProchaine.length > 1 ? 's' : ''} sans prochaine action</b> — ${sansProchaine.slice(0, 6).map(d => `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`).join(', ')}${sansProchaine.length > 6 ? '…' : ''}</div></div>` : ''}

        <div class="todo-cols ${visibles.length === 1 ? 'seule' : ''}">
          ${visibles.map(c => `
            <section class="card todo-col">
              <header class="todo-col-tete">
                <span class="avatar">${esc(initials(c.u.id))}</span>
                <div><b>${esc(c.u.full_name)}</b><span class="muted small">${c.retard.length + c.jour.length + c.suite.length} à faire${c.faitesCeJour.length ? ` · ${c.faitesCeJour.length} fait${c.faitesCeJour.length > 1 ? 's' : ''}` : ''}</span></div>
                <button type="button" class="btn ghost sm" data-new-pour="${c.u.id}" title="Nouvelle tâche pour ${esc(c.u.full_name)}">+</button>
              </header>
              ${bloc('⚠ En retard', c.retard, 'retard')}
              ${bloc('Aujourd&rsquo;hui', c.jour)}
              ${bloc('À venir', c.suite)}
              ${state.showDone ? bloc('Fait aujourd&rsquo;hui', c.faitesCeJour, 'faites') : ''}
              ${!c.retard.length && !c.jour.length && !c.suite.length ? '<div class="empty">Rien à faire.</div>' : ''}
            </section>`).join('')}
        </div>

        <div class="toolbar"><label class="check"><input type="checkbox" id="t-done" ${state.showDone ? 'checked' : ''}> Afficher ce qui a été fait aujourd&rsquo;hui</label></div>`;

      bindSearch(root, 't-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-qui]').forEach(b => b.onclick = () => { state.qui = b.dataset.qui; draw(); });
      root.querySelector('#t-struct').onchange = e => { state.structure = e.target.value; draw(); };
      root.querySelector('#t-done').onchange = e => { state.showDone = e.target.checked; draw(); };
      root.querySelector('#t-new').onclick = () => activityForm({ activity: state.structure || undefined }, null, draw);
      root.querySelectorAll('[data-new-pour]').forEach(b => b.onclick = () =>
        activityForm({ assignee_id: b.dataset.newPour, activity: state.structure || undefined }, null, draw));
      root.querySelectorAll('[data-open-deal]').forEach(a => a.onclick = e => { e.preventDefault(); openDeal(a.dataset.openDeal, draw); });
      bindActivityRows(root, draw);
    };

    draw();
    return { refresh: draw };
  },
};
