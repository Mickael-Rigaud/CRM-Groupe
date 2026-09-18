// « To do list » : chacun la sienne.
//
// Deux onglets. « Ma to do list » ne montre que les taches dont je suis
// responsable — plus de colonnes par personne, plus de coup d'oeil sur le
// travail des autres, direction comprise. « Envoyees » montre celles que j'ai
// ecrites pour quelqu'un d'autre, avec leur etat : c'est ce qui permet de
// confier une tache sans la perdre de vue.
//
// Le cloisonnement n'est pas qu'un filtre d'affichage : les policies RLS de la
// table `activities` disent la meme chose (migration 20260918100000). Une tache
// rattachee a une affaire ou a une fiche reste visible par qui voit la fiche —
// sinon la « prochaine action » des pipelines se viderait. Ce qui devient prive,
// c'est le pense-bete rattache a rien.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, daysSince, fmtDate, relDay, userName, searchInput, bindSearch, restoreFocus, terms, hit } from '../ui.js';
import { actType, bindActivityRows, activityForm, nextActivity, structureDe, toggleActivity } from './activity.js';
import { openDeal } from './deal.js';

// Les degrés de traitement, dans l'ordre où ils se lisent. « Urgent » se pose à la
// main sur la tâche ; les autres se déduisent de l'échéance — `test` reçoit la tâche
// et l'écart en jours : positif = en retard, 0 = aujourd'hui, négatif = à venir.
const GROUPES = [
  { key: 'urgent', titre: '🔥 Urgent', test: (a) => a.priority === 'urgent' },
  { key: 'retard', titre: '⚠ En retard', test: (a, j) => j !== null && j > 0 },
  { key: 'jour', titre: "Aujourd'hui", test: (a, j) => j === 0 },
  { key: 'semaine', titre: 'Cette semaine', test: (a, j) => j !== null && j < 0 && j >= -7 },
  { key: 'plus', titre: 'Plus tard', test: (a, j) => j !== null && j < -7 },
  { key: 'sans', titre: 'Sans échéance', test: () => true },
];
const ecart = (a) => (a.due_date ? daysSince(a.due_date) : null);
// Une tâche ne figure que dans le premier rang qui la prend : urgente et en retard,
// elle est urgente — et sa date reste affichée en rouge.
const rangDe = (a) => GROUPES.find(gr => gr.test(a, ecart(a)));

// Une tâche qu'on vient de cocher ne s'efface pas sous les doigts : elle reste en
// place, barrée, le temps de la relire et de se raviser. Passé ce délai elle rejoint
// « Fait aujourd'hui », que la case de la barre d'outils affiche.
const GRACE_MS = 15000;
const recentes = new Map(); // id de la tâche -> minuteur de disparition

// Le logo de la structure sur fond de sa couleur : si le fichier manque, l'image se
// retire et il reste la pastille de couleur — le repli qu'utilise déjà le menu.
const logo = (a, cls = 'todo-logo') => `<i class="${cls}" style="background:${a.color}"><img src="assets/logos/${a.key}.png" alt="" onerror="this.remove()"></i>`;


// Une tâche en carte : case à cocher, badge de structure, contexte, échéance.
// Les attributs data-toggle / data-edit-act sont ceux que bindActivityRows attend.
function carte(a, pour = false) {
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

  return `<div class="todo-tache ${a.done ? 'done' : ''} ${recentes.has(a.id) ? 'recente' : ''} ${a.priority === 'urgent' && !a.done ? 'urgent' : ''}" ${act ? `style="--c:${act.color};--b:${act.accent};--bt:${act.on}"` : ''}>
    <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${a.id}" title="Marquer comme fait">
    <div class="todo-tache-corps">
      ${act ? `<span class="todo-badge">${logo(act, 'todo-badge-logo')}${esc(act.short)}</span>` : ''}
      <b>${t.icon} ${esc(a.title)}</b>
      ${pour ? `<div class="todo-pour">pour <b>${esc(userName(a.assignee_id))}</b>${a.done ? ' · <span class="todo-ok">faite</span>' : ''}</div>` : ''}
      ${ctx ? `<div class="todo-ctx">${ctx}</div>` : ''}
      <div class="todo-when ${late ? 'late' : ''}">${a.due_date ? `${fmtDate(a.due_date)}${a.due_time ? ' ' + esc(a.due_time) : ''} · ${relDay(a.due_date)}` : 'Sans échéance'}</div>
    </div>
    <button class="icon-btn" data-edit-act="${a.id}" title="Modifier">✎</button>
  </div>`;
}

// Les deux onglets, et ce que chacun retient.
// Une tache que j'ai ecrite sans l'assigner reste chez moi : personne d'autre ne
// l'a prise, ce n'est pas une tache « envoyee ».
const ONGLETS = [
  { key: 'mienne', label: 'Ma to do list',
    garde: (a, moi) => a.assignee_id === moi || (!a.assignee_id && a.created_by === moi) },
  { key: 'envoyees', label: 'Envoyées',
    garde: (a, moi) => a.created_by === moi && !!a.assignee_id && a.assignee_id !== moi },
];

export const todayPage = {
  title: () => 'To do list',
  render(root) {
    const state = { onglet: 'mienne', structure: '', q: '', showDone: false, focus: null };
    const moi = scope.user.id;

    const draw = () => {
      const onglet = ONGLETS.find(o => o.key === state.onglet) || ONGLETS[0];
      const ts = terms(state.q);
      const surStructure = (a) => !state.structure
        || (state.structure === '—' ? !structureDe(a) : structureDe(a) === state.structure);

      // Le compteur de chaque onglet se lit avant tout filtre : il dit ce qu'il y a
      // derriere, pas ce qui reste une fois la recherche tapee.
      const toutes = scope.activities();
      const compte = (o) => toutes.filter(a => !a.done && o.garde(a, moi)).length;

      const vues = toutes.filter(a => onglet.garde(a, moi))
        .filter(a => hit([a.title, a.notes, userName(a.assignee_id)], ts));
      const ouvertes = vues.filter(a => !a.done);

      // Les pastilles de structure ignorent le filtre de structure : sinon il ne
      // resterait plus rien à comparer une fois l'une d'elles ouverte.
      const parStructure = Object.values(ACTIVITIES)
        .filter(a => scope.activityKeys.includes(a.key))
        .map(a => ({ ...a, n: ouvertes.filter(t => structureDe(t) === a.key).length }));
      const sansStructure = ouvertes.filter(a => !structureDe(a)).length;

      // Les fraîchement cochées restent à leur place au lieu de disparaître aussitôt.
      const retenues = vues.filter(a => !a.done || recentes.has(a.id)).filter(surStructure);
      const faites = state.showDone
        ? vues.filter(a => a.done && a.done_at && daysSince(a.done_at) === 0).filter(surStructure)
        : [];

      const tri = (l) => l.slice().sort((x, y) => (x.due_date || '9999').localeCompare(y.due_date || '9999')
        || (x.due_time || '99').localeCompare(y.due_time || '99'));
      const pour = onglet.key === 'envoyees';
      const groupes = GROUPES.map(gr => ({ ...gr, l: retenues.filter(a => rangDe(a) === gr) })).filter(gr => gr.l.length);

      const sansProchaine = onglet.key === 'mienne'
        ? scope.deals().filter(d => d.status === 'open' && d.owner_id === moi && !nextActivity(d.id)
            && (!state.structure || state.structure === '—' || d.activity === state.structure))
        : [];

      root.innerHTML = `
        <div class="pill-tabs todo-onglets">
          ${ONGLETS.map(o => `<button type="button" data-onglet="${o.key}" class="${state.onglet === o.key ? 'on' : ''}">${esc(o.label)}<span>${compte(o)}</span></button>`).join('')}
        </div>

        <div class="pill-tabs todo-structures">
          <button type="button" data-struct="" class="${state.structure ? '' : 'on'}">Toutes<span>${ouvertes.length}</span></button>
          ${parStructure.map(a => `<button type="button" data-struct="${a.key}" class="${state.structure === a.key ? 'on' : ''}">${logo(a)}${esc(a.label)}<span>${a.n}</span></button>`).join('')}
          ${sansStructure ? `<button type="button" data-struct="—" class="${state.structure === '—' ? 'on' : ''}">Sans structure<span>${sansStructure}</span></button>` : ''}
        </div>

        <div class="toolbar">
          ${searchInput('t-q', state, 'Rechercher une tâche…')}
          <span class="muted small">${retenues.filter(a => ecart(a) > 0 && !a.done).length} en retard · ${retenues.filter(a => ecart(a) === 0 && !a.done).length} aujourd&rsquo;hui</span>
          <span class="grow"></span>
          <label class="check"><input type="checkbox" id="t-done" ${state.showDone ? 'checked' : ''}> Ce qui est fait</label>
          <button class="btn" id="t-new">+ Tâche</button>
        </div>

        ${sansProchaine.length ? `<div class="alert"><b>${sansProchaine.length}</b><div><b>affaire${sansProchaine.length > 1 ? 's' : ''} sans prochaine action</b> — ${sansProchaine.slice(0, 6).map(d => `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`).join(', ')}${sansProchaine.length > 6 ? '…' : ''}</div></div>` : ''}

        <section class="card todo-liste">
          ${groupes.map(gr => `<div class="todo-groupe ${gr.key}">${gr.titre}<i>${gr.l.filter(a => !a.done).length}</i></div>${tri(gr.l).map(a => carte(a, pour)).join('')}`).join('')}
          ${faites.length ? `<div class="todo-groupe fait">Fait aujourd&rsquo;hui<i>${faites.length}</i></div>${tri(faites).map(a => carte(a, pour)).join('')}` : ''}
          ${!retenues.length && !faites.length ? `<div class="empty">${onglet.key === 'mienne'
            ? 'Rien à faire — tout est à jour.'
            : 'Aucune tâche envoyée. Le champ « Responsable » du formulaire sert à en confier une.'}</div>` : ''}
        </section>`;

      bindSearch(root, 't-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => {
        state.onglet = b.dataset.onglet; state.structure = ''; draw();
      });
      root.querySelectorAll('[data-struct]').forEach(b => b.onclick = () => {
        state.structure = state.structure === b.dataset.struct ? '' : b.dataset.struct; draw();
      });
      root.querySelector('#t-done').onchange = e => { state.showDone = e.target.checked; draw(); };
      // Une tâche créée ici hérite de ce qui est à l'écran : la structure ouverte,
      // et le responsable — moi dans ma liste, à choisir dans « Envoyées ».
      root.querySelector('#t-new').onclick = () => activityForm({
        ...(state.onglet === 'mienne' ? { assignee_id: moi } : {}),
        ...(state.structure && state.structure !== '—' ? { activity: state.structure } : {}),
      }, null, draw);
      root.querySelectorAll('[data-open-deal]').forEach(a => a.onclick = e => { e.preventDefault(); openDeal(a.dataset.openDeal, draw); });
      bindActivityRows(root, draw);
      // Posé après bindActivityRows, qui pose son propre gestionnaire sur ces cases.
      // Décocher pendant le délai annule la disparition ; recocher le relance.
      root.querySelectorAll('.todo-tache input[data-toggle]').forEach(cb => cb.onchange = async () => {
        const id = cb.dataset.toggle;
        clearTimeout(recentes.get(id));
        recentes.delete(id);
        try { await toggleActivity(id, cb.checked); }
        catch { draw(); return; }
        if (cb.checked) recentes.set(id, setTimeout(() => { recentes.delete(id); draw(); }, GRACE_MS));
        draw();
      });
    };

    draw();
    return {
      refresh: draw,
      // Quitter l'écran emporte les minuteurs avec lui, sinon ils redessineraient
      // une page qui n'est plus là.
      destroy() { recentes.forEach(clearTimeout); recentes.clear(); },
    };
  },
};
