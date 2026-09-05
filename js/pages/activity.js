// Activités (tâches / RDV) : formulaire, liste, clôture.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITY_TYPES } from '../data/schema.js';
import { esc, openModal, closeModal, renderForm, readForm, toast, isoDay, daysSince, relDay, userName, fmtDate } from '../ui.js';

export const actType = (k) => ACTIVITY_TYPES.find(t => t.key === k) || { label: k, icon: '•' };

export function activityForm(link = {}, existing = null, onSaved, onClose = null) {
  const users = scope.users();
  const spec = [
    { key: 'type', label: 'Type', type: 'select', options: ACTIVITY_TYPES.map(t => [t.key, `${t.icon} ${t.label}`]), required: true, half: true, value: 'appel' },
    { key: 'assignee_id', label: 'Responsable', type: 'select', options: users.map(u => [u.id, u.full_name]), required: true, half: true, value: scope.user.id },
    { key: 'title', label: 'Intitulé', type: 'text', required: true, placeholder: 'Ex. Relancer le devis' },
    { key: 'due_date', label: 'Échéance', type: 'date', required: true, half: true, value: isoDay() },
    { key: 'due_time', label: 'Heure (optionnel)', type: 'time', half: true },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ];
  const m = openModal(existing ? "Modifier l'activité" : 'Nouvelle activité', `<form class="form" id="act-form">${renderForm(spec, existing || {})}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="act-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { onClose });
  const form = m.querySelector('#act-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(form, spec);
    try {
      if (existing) await db.update('activities', existing.id, v);
      else await db.insert('activities', { ...v, ...link, done: false });
      closeModal(true); toast('Activité enregistrée'); onSaved?.();
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#act-del')?.addEventListener('click', async () => { await db.remove('activities', existing.id); closeModal(true); toast('Activité supprimée'); onSaved?.(); });
}

export async function toggleActivity(id, done) {
  await db.update('activities', id, { done, done_at: done ? new Date().toISOString() : null });
}

export function activityRowHtml(a, { showContext = false } = {}) {
  const late = !a.done && a.due_date && daysSince(a.due_date) > 0;
  const t = actType(a.type);
  let ctx = '';
  if (showContext) {
    const d = a.deal_id && db.byId('deals', a.deal_id);
    const c = a.contact_id && db.byId('contacts', a.contact_id);
    const o = a.organisation_id && db.byId('organisations', a.organisation_id);
    ctx = [d && `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`, c && `${esc(c.first_name)} ${esc(c.last_name)}${c.phone ? ' · ' + esc(c.phone) : ''}`, o && esc(o.name)].filter(Boolean).join(' — ');
  }
  return `<div class="act-row ${a.done ? 'done' : ''}" data-act="${a.id}">
    <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${a.id}" title="Marquer comme fait">
    <div style="flex:1">
      <div><b>${t.icon} ${esc(a.title)}</b> <span class="muted small">· ${esc(userName(a.assignee_id))}</span></div>
      ${ctx ? `<div class="small muted">${ctx}</div>` : ''}
      ${a.notes ? `<div class="small muted">${esc(a.notes)}</div>` : ''}
      <div class="when ${late ? 'late' : ''}">${fmtDate(a.due_date)}${a.due_time ? ' ' + esc(a.due_time) : ''} · ${relDay(a.due_date)}</div>
    </div>
    <button class="icon-btn" data-edit-act="${a.id}" title="Modifier">✎</button>
  </div>`;
}

// Attache les gestionnaires (cocher, modifier) sur un conteneur qui contient des act-row.
export function bindActivityRows(container, onChange, onClose = null) {
  container.querySelectorAll('[data-toggle]').forEach(cb => cb.onchange = async () => { await toggleActivity(cb.dataset.toggle, cb.checked); onChange?.(); });
  container.querySelectorAll('[data-edit-act]').forEach(b => b.onclick = (e) => { e.stopPropagation(); const a = db.byId('activities', b.dataset.editAct); activityForm({}, a, onChange, onClose); });
}

// Prochaine activité ouverte d'une affaire.
export function nextActivity(dealId) {
  return db.t('activities').filter(a => a.deal_id === dealId && !a.done).sort((x, y) => (x.due_date || '').localeCompare(y.due_date || ''))[0] || null;
}
