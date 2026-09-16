// « To do list » : une colonne par personne, pour voir d'un coup d'œil qui porte quoi.
// Dans chaque colonne les tâches sont rangées par échéance, et chacune annonce sa
// structure — badge à sa couleur, filet sur le bord gauche. Les pastilles du haut
// filtrent le tableau entier sur une structure.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, daysSince, fmtDate, relDay, initials, userName, searchInput, bindSearch, restoreFocus, terms, hit } from '../ui.js';
import { actType, bindActivityRows, activityForm, nextActivity, structureDe } from './activity.js';
import { openDeal } from './deal.js';

// Les groupes d'échéance, dans l'ordre où ils se lisent. `test` reçoit l'écart en jours :
// positif = en retard, 0 = aujourd'hui, négatif = à venir.
const GROUPES = [
  { key: 'retard', titre: '⚠ En retard', test: (j) => j !== null && j > 0 },
  { key: 'jour', titre: "Aujourd'hui", test: (j) => j === 0 },
  { key: 'semaine', titre: 'Cette semaine', test: (j) => j !== null && j < 0 && j >= -7 },
  { key: 'plus', titre: 'Plus tard', test: (j) => j !== null && j < -7 },
  { key: 'sans', titre: 'Sans échéance', test: (j) => j === null },
];
const ecart = (a) => (a.due_date ? daysSince(a.due_date) : null);

// Une tâche en carte : case à cocher, badge de structure, contexte, échéance.
// Les attributs data-toggle / data-edit-act sont ceux que bindActivityRows attend.
function carte(a) {
  const j = ecart(a);
  const late = !a.done && j !== null && j > 0;
  const t = actType(a.type);
  const s = structureDe(a);
  const act = s ? ACTIVITIES[s] : null;
  const d = a.deal_id && db.byId('deals', a.deal_id);
  const c = a.contact_id && db.byId('contacts', a.contact_id);
  const o = a.organisation_id && db.byId('organisations', a.organisation_id);
  const ctx = [
    d && `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`,
    !d && c && esc(`${c.first_name || ''} ${c.last_name || ''}`.trim()),
    !d && !c && o && esc(o.name),
  ].filter(Boolean)[0] || '';

  return `<div class="todo-tache ${a.done ? 'done' : ''}" ${act ? `style="--c:${act.color};--b:${act.accent};--bt:${act.on}"` : ''}>
    <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${a.id}" title="Marquer comme fait">
    <div class="todo-tache-corps">
      ${act ? `<span class="todo-badge">${esc(act.short)}</span>` : ''}
      <b>${t.icon} ${esc(a.title)}</b>
      ${ctx ? `<div class="todo-ctx">${ctx}</div>` : ''}
      <div class="todo-when ${late ? 'late' : ''}">${a.due_date ? `${fmtDate(a.due_date)}${a.due_time ? ' ' + esc(a.due_time) : ''} · ${relDay(a.due_date)}` : 'Sans échéance'}</div>
    </div>
    <button class="icon-btn" data-edit-act="${a.id}" title="Modifier">✎</button>
  </div>`;
}

export const todayPage = {
  title: () => 'To do list',
  render(root) {
    const state = { structure: '', q: '', showDone: false, focus: null };

    const draw = () => {
      const ts = terms(state.q);
      const surStructure = (a) => !state.structure
        || (state.structure === '—' ? !structureDe(a) : structureDe(a) === state.structure);

      const vues = scope.activities().filter(a => hit([a.title, a.notes, userName(a.assignee_id)], ts));
      const ouvertes = vues.filter(a => !a.done);

      // Les compteurs des pastilles ignorent le filtre de structure : sinon il ne
      // resterait plus rien à comparer une fois l'une d'elles ouverte.
      const parStructure = Object.values(ACTIVITIES)
        .filter(a => scope.activityKeys.includes(a.key))
        .map(a => ({ ...a, n: ouvertes.filter(t => structureDe(t) === a.key).length }));
      const sansStructure = ouvertes.filter(a => !structureDe(a)).length;
      const total = ouvertes.length;

      const retenues = ouvertes.filter(surStructure);
      const faites = state.showDone
        ? vues.filter(a => a.done && a.done_at && daysSince(a.done_at) === 0).filter(surStructure)
        : [];

      // Une colonne par personne. L'utilisateur connecté vient en tête — c'est sa liste
      // qu'il ouvre en premier — puis les autres, du plus chargé au moins chargé.
      const gens = scope.users().map(u => {
        const siennes = retenues.filter(a => a.assignee_id === u.id);
        return {
          id: u.id, nom: u.full_name, taches: siennes,
          faites: faites.filter(a => a.assignee_id === u.id),
          retard: siennes.filter(a => ecart(a) > 0).length,
        };
      }).sort((x, y) => (y.id === scope.user.id) - (x.id === scope.user.id)
        || y.taches.length - x.taches.length
        || x.nom.localeCompare(y.nom, 'fr'));

      const orphelines = retenues.filter(a => !a.assignee_id || !db.byId('profiles', a.assignee_id));
      if (orphelines.length) {
        gens.push({ id: '', nom: 'Non assigné', taches: orphelines, faites: [], retard: orphelines.filter(a => ecart(a) > 0).length });
      }

      const colonne = (g) => {
        const groupes = GROUPES.map(gr => ({ ...gr, l: g.taches.filter(a => gr.test(ecart(a))) })).filter(gr => gr.l.length);
        const tri = (l) => l.slice().sort((x, y) => (x.due_date || '9999').localeCompare(y.due_date || '9999')
          || (x.due_time || '99').localeCompare(y.due_time || '99'));
        return `<section class="todo-col">
          <header class="todo-col-head">
            <span class="todo-av">${g.id ? esc(initials(g.id)) : '—'}</span>
            <span class="todo-col-nom">${esc(g.nom)}<i>${g.taches.length} tâche${g.taches.length > 1 ? 's' : ''}</i></span>
            ${g.retard ? `<span class="todo-col-retard" title="${g.retard} en retard">${g.retard}</span>` : ''}
            ${g.id ? `<button class="icon-btn" data-new-for="${g.id}" title="Ajouter une tâche à ${esc(g.nom)}">+</button>` : ''}
          </header>
          <div class="todo-col-body">
            ${groupes.map(gr => `<div class="todo-groupe ${gr.key}">${gr.titre}<i>${gr.l.length}</i></div>${tri(gr.l).map(carte).join('')}`).join('')}
            ${!g.taches.length ? '<div class="todo-vide">Rien à faire</div>' : ''}
            ${g.faites.length ? `<div class="todo-groupe fait">Fait aujourd&rsquo;hui<i>${g.faites.length}</i></div>${g.faites.map(carte).join('')}` : ''}
          </div>
        </section>`;
      };

      const sansProchaine = scope.deals().filter(d => d.status === 'open' && !nextActivity(d.id)
        && (!state.structure || state.structure === '—' || d.activity === state.structure));

      root.innerHTML = `
        <div class="pill-tabs todo-structures">
          <button type="button" data-struct="" class="${state.structure ? '' : 'on'}">Toutes<span>${total}</span></button>
          ${parStructure.map(a => `<button type="button" data-struct="${a.key}" class="${state.structure === a.key ? 'on' : ''}"><i class="todo-puce" style="background:${a.color}"></i>${esc(a.label)}<span>${a.n}</span></button>`).join('')}
          ${sansStructure ? `<button type="button" data-struct="—" class="${state.structure === '—' ? 'on' : ''}">Sans structure<span>${sansStructure}</span></button>` : ''}
        </div>

        <div class="toolbar">
          ${searchInput('t-q', state, 'Rechercher une tâche…')}
          <span class="muted small">${retenues.filter(a => ecart(a) > 0).length} en retard · ${retenues.filter(a => ecart(a) === 0).length} aujourd&rsquo;hui</span>
          <span class="grow"></span>
          <label class="check"><input type="checkbox" id="t-done" ${state.showDone ? 'checked' : ''}> Ce qui est fait</label>
          <button class="btn" id="t-new">+ Tâche</button>
        </div>

        ${sansProchaine.length ? `<div class="alert"><b>${sansProchaine.length}</b><div><b>affaire${sansProchaine.length > 1 ? 's' : ''} sans prochaine action</b> — ${sansProchaine.slice(0, 6).map(d => `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`).join(', ')}${sansProchaine.length > 6 ? '…' : ''}</div></div>` : ''}

        <div class="todo-board">${gens.map(colonne).join('')}</div>
        ${!retenues.length ? '<div class="card"><div class="empty">Rien à faire — tout est à jour.</div></div>' : ''}`;

      bindSearch(root, 't-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-struct]').forEach(b => b.onclick = () => {
        state.structure = state.structure === b.dataset.struct ? '' : b.dataset.struct; draw();
      });
      root.querySelector('#t-done').onchange = e => { state.showDone = e.target.checked; draw(); };
      // Une tâche créée depuis le tableau hérite de ce qui est déjà à l'écran : la
      // personne dont on a cliqué la colonne, et la structure ouverte s'il y en a une.
      const contexte = (assignee) => ({
        ...(assignee ? { assignee_id: assignee } : {}),
        ...(state.structure && state.structure !== '—' ? { activity: state.structure } : {}),
      });
      root.querySelector('#t-new').onclick = () => activityForm(contexte(''), null, draw);
      root.querySelectorAll('[data-new-for]').forEach(b => b.onclick = () => activityForm(contexte(b.dataset.newFor), null, draw));
      root.querySelectorAll('[data-open-deal]').forEach(a => a.onclick = e => { e.preventDefault(); openDeal(a.dataset.openDeal, draw); });
      bindActivityRows(root, draw);
    };

    draw();
    return { refresh: draw };
  },
};
