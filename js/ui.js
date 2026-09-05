// Utilitaires d'interface : formatage, modales, formulaires, toasts.
import { db } from './data/db.js';
import { ACTIVITIES } from './data/schema.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const eur = (n, opts = {}) => (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, ...opts });
export const num = (n) => (Number(n) || 0).toLocaleString('fr-FR');
export const pct = (n) => (isFinite(n) ? Math.round(n) : 0) + ' %';
export const today = () => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; };
export const isoDay = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export const fmtDate = (s) => s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (s) => s ? new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const daysSince = (s) => s ? Math.floor((today() - new Date(s.length === 10 ? s + 'T00:00:00' : s).setHours(0, 0, 0, 0)) / 86400000) : null;
export const relDay = (s) => {
  const n = daysSince(s);
  if (n === null) return '—';
  if (n === 0) return "Aujourd'hui";
  if (n === -1) return 'Demain';
  if (n === 1) return 'Hier';
  return n > 0 ? `Il y a ${n} j` : `Dans ${-n} j`;
};
export const userName = (id) => db.byId('profiles', id)?.full_name || '—';
export const initials = (id) => (db.byId('profiles', id)?.full_name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const contactName = (c) => c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '—' : '—';
export const dealParty = (d) => {
  const c = d.contact_id && db.byId('contacts', d.contact_id);
  const o = d.organisation_id && db.byId('organisations', d.organisation_id);
  return [c && contactName(c), o && o.name].filter(Boolean).join(' · ') || '—';
};
export const actBadge = (key) => { const a = ACTIVITIES[key]; return a ? `<span class="badge" style="--c:${a.color}">${esc(a.short)}</span>` : ''; };

// ---------- Toasts ----------
export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = msg;
  box.appendChild(el); setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

// ---------- Modales ----------
let modalOnClose = null;
export function openModal(title, bodyHtml, { wide = false, onOpen, onClose = null } = {}) {
  closeModal(true);
  modalOnClose = onClose;
  const wrap = document.createElement('div'); wrap.className = 'modal-backdrop'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></div>
    <div class="modal-body">${bodyHtml}</div></div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  onOpen?.(wrap.querySelector('.modal'));
  return wrap.querySelector('.modal');
}
// closeModal(true) = fermeture pour remplacement (n'appelle pas onClose)
export function closeModal(replacing = false) {
  const el = document.getElementById('modal'); if (!el) return;
  el.remove(); document.body.classList.remove('no-scroll');
  const cb = modalOnClose; modalOnClose = null;
  if (!replacing && cb) cb();
}
export function confirm(msg) {
  return new Promise(res => {
    const m = openModal('Confirmation', `<p>${esc(msg)}</p><div class="form-actions"><button class="btn ghost" data-close>Annuler</button><button class="btn danger" id="cf-ok">Confirmer</button></div>`);
    m.querySelector('#cf-ok').onclick = () => { closeModal(); res(true); };
    m.querySelector('[data-close]').addEventListener('click', () => res(false));
  });
}

// ---------- Formulaires ----------
// spec: [{key,label,type:'text|number|date|select|multiselect|checkbox|textarea|ref', options:[], required, value, half}]
export function renderForm(spec, values = {}) {
  return spec.map(f => {
    const v = values[f.key] ?? f.value ?? (f.type === 'multiselect' ? [] : '');
    const req = f.required ? 'required' : '';
    const cls = `field ${f.half ? 'half' : ''}`;
    let input = '';
    switch (f.type) {
      case 'select':
        input = `<select name="${f.key}" ${req}><option value="">—</option>${(f.options || []).map(o => {
          const [val, lab] = Array.isArray(o) ? o : [o, o];
          return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`;
        }).join('')}</select>`; break;
      case 'multiselect':
        input = `<div class="checks">${(f.options || []).map(o => {
          const [val, lab] = Array.isArray(o) ? o : [o, o];
          return `<label class="check"><input type="checkbox" name="${f.key}" value="${esc(val)}" ${(v || []).includes(val) ? 'checked' : ''}> ${esc(lab)}</label>`;
        }).join('')}</div>`; break;
      case 'checkbox':
        input = `<label class="check"><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}> ${esc(f.hint || 'Oui')}</label>`; break;
      case 'textarea':
        input = `<textarea name="${f.key}" rows="${f.rows || 3}" ${req}>${esc(v)}</textarea>`; break;
      default:
        input = `<input type="${f.type || 'text'}" name="${f.key}" value="${esc(v)}" ${req} ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
    }
    return `<div class="${cls}"><label>${esc(f.label)}${f.required ? ' *' : ''}</label>${input}</div>`;
  }).join('');
}
export function readForm(formEl, spec) {
  const out = {};
  for (const f of spec) {
    if (f.type === 'multiselect') out[f.key] = [...formEl.querySelectorAll(`input[name="${f.key}"]:checked`)].map(i => i.value);
    else if (f.type === 'checkbox') out[f.key] = !!formEl.querySelector(`input[name="${f.key}"]`)?.checked;
    else if (f.type === 'number') { const v = formEl.querySelector(`[name="${f.key}"]`)?.value; out[f.key] = v === '' || v == null ? null : Number(v); }
    else out[f.key] = formEl.querySelector(`[name="${f.key}"]`)?.value ?? '';
  }
  return out;
}

// Petit utilitaire de datalist pour choisir un contact ou une organisation par nom.
export function refField(key, label, rows, labelFn, value, { half = true, required = false } = {}) {
  const listId = `dl-${key}-${Math.random().toString(36).slice(2, 7)}`;
  const current = rows.find(r => r.id === value);
  return `<div class="field ${half ? 'half' : ''}" data-ref="${key}">
    <label>${esc(label)}${required ? ' *' : ''}</label>
    <input type="text" list="${listId}" name="${key}__label" value="${esc(current ? labelFn(current) : '')}" placeholder="Rechercher…" autocomplete="off">
    <input type="hidden" name="${key}" value="${esc(value || '')}">
    <datalist id="${listId}">${rows.map(r => `<option value="${esc(labelFn(r))}"></option>`).join('')}</datalist>
  </div>`;
}
export function bindRefFields(formEl, defs) {
  // defs: {key: {rows, labelFn}}
  for (const [key, { rows, labelFn }] of Object.entries(defs)) {
    const lab = formEl.querySelector(`[name="${key}__label"]`); const hid = formEl.querySelector(`[name="${key}"]`);
    if (!lab) continue;
    lab.addEventListener('input', () => { const r = rows.find(x => labelFn(x) === lab.value); hid.value = r ? r.id : ''; });
  }
}

// ---------- Période ----------
export function periodRange(key) {
  const now = new Date(); const start = today(); const end = new Date(today()); end.setDate(end.getDate() + 1);
  switch (key) {
    case 'today': break;
    case 'week': { const dow = (start.getDay() + 6) % 7; start.setDate(start.getDate() - dow); end.setTime(start.getTime()); end.setDate(end.getDate() + 7); break; }
    case 'month': start.setDate(1); end.setTime(start.getTime()); end.setMonth(end.getMonth() + 1); break;
    case 'quarter': { const q = Math.floor(start.getMonth() / 3) * 3; start.setMonth(q, 1); end.setTime(start.getTime()); end.setMonth(end.getMonth() + 3); break; }
    case 'year': start.setMonth(0, 1); end.setTime(start.getTime()); end.setFullYear(end.getFullYear() + 1); break;
    case 'all': start.setFullYear(2000, 0, 1); end.setFullYear(now.getFullYear() + 10); break;
  }
  return { start, end };
}
export const inRange = (iso, r) => { if (!iso) return false; const t = new Date(iso); return t >= r.start && t < r.end; };
export const PERIODS = [['today', "Aujourd'hui"], ['week', 'Semaine'], ['month', 'Mois'], ['quarter', 'Trimestre'], ['year', 'Année'], ['all', 'Tout']];

export function csvDownload(filename, rows) {
  if (!rows.length) return toast('Rien à exporter', 'warn');
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => { const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [cols.join(';'), ...rows.map(r => cols.map(c => cell(r[c])).join(';'))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = filename; a.click();
}
