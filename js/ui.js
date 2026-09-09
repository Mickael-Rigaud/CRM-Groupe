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
    const hint = f.hint && f.type !== 'checkbox' ? `<div class="small muted" style="margin-top:4px">${esc(f.hint)}</div>` : '';
    return `<div class="${cls}"><label>${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${hint}</div>`;
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

// ---------- Recherche et filtres (partagés par toutes les pages) ----------
// Comparaison insensible à la casse et aux accents ; tous les mots saisis doivent être présents.
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const terms = (q) => norm(q).split(/\s+/).filter(Boolean);
export const hit = (haystack, ts) => { if (!ts.length) return true; const H = Array.isArray(haystack) ? norm(haystack.filter(Boolean).join(' ')) : norm(haystack); return ts.every(t => H.includes(t)); };

// Barre de recherche standard. state.q porte la saisie, state.focus le champ à re-focaliser après redraw.
export function searchInput(id, state, placeholder) {
  return `<input type="search" class="grow" id="${id}" placeholder="${esc(placeholder)}" value="${esc(state.q || '')}" autocomplete="off">`;
}
export function bindSearch(root, id, state, draw) {
  const el = root.querySelector('#' + id); if (!el) return;
  el.oninput = e => { state.q = e.target.value; state.focus = id; draw(); };
  el.onkeydown = e => { if (e.key === 'Escape' && state.q) { state.q = ''; state.focus = id; draw(); } };
}
// Restaure le curseur après un redraw complet (les pages réécrivent tout leur HTML)
export function restoreFocus(root, state) {
  if (!state.focus) return;
  const el = root.querySelector('#' + state.focus); if (!el) return;
  el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* input search */ }
}

// ---------- Sélecteur multiple recherchable (biens, immeubles, listes de référence) ----------
// st = pickState(clé de mémorisation) ; items = [{id, name, sub}]
export function pickState(key = null) { return { key, open: false, q: '', sel: null }; }
function pickLoad(st) { if (!st.key) return null; try { const v = JSON.parse(localStorage.getItem(st.key)); return Array.isArray(v) && v.length ? v : null; } catch { return null; } }
function pickSave(st) { if (!st.key) return; try { localStorage.setItem(st.key, JSON.stringify([...st.sel])); } catch { /* navigation privée */ } }
// À appeler avant multiPick : initialise la sélection (mémorisée si possible, sinon tout)
export function pickInit(st, items) {
  if (st.sel === null) { const saved = pickLoad(st); const keep = (saved || []).filter(id => items.some(i => i.id === id)); st.sel = new Set(keep.length ? keep : items.map(i => i.id)); st.known = new Set(items.map(i => i.id)); }
  else {
    // Un élément créé après coup n'apparaît d'office que si rien n'était filtré
    const wasAll = [...st.known].every(id => st.sel.has(id));
    for (const i of items) if (!st.known.has(i.id)) { st.known.add(i.id); if (wasAll) st.sel.add(i.id); }
  }
  return items.filter(i => st.sel.has(i.id));
}
export function multiPick(id, items, st, { noun = 'bien', nounPlural = null, allLabel = null } = {}) {
  const nP = nounPlural || noun + 's';
  const picked = items.filter(i => st.sel.has(i.id));
  const all = picked.length === items.length && items.length > 0;
  const shown = items.filter(i => hit([i.name, i.sub], terms(st.q)));
  const allShown = shown.length > 0 && shown.every(i => st.sel.has(i.id));
  const label = items.length === 0 ? `Aucun ${noun}` : picked.length === 0 ? `Aucun ${noun} sélectionné` : all ? (allLabel || `Tous les ${nP} (${items.length})`) : picked.length === 1 ? picked[0].name : `${picked.length} ${nP} sur ${items.length}`;
  return `<div class="dd" id="${id}"><button type="button" class="dd-btn ${all ? '' : 'on'}" data-pick-btn>${esc(label)} ▾</button>
    <div class="dd-panel wide" ${st.open ? '' : 'hidden'}>
      <input type="search" class="dd-search" id="${id}-q" placeholder="Rechercher un ${esc(noun)}…" value="${esc(st.q)}" autocomplete="off">
      <div class="dd-list">${shown.map(i => `<label class="check"><input type="checkbox" data-pick="${esc(i.id)}" ${st.sel.has(i.id) ? 'checked' : ''}> <span>${esc(i.name)}${i.sub ? `<span class="muted small"> · ${esc(i.sub)}</span>` : ''}</span></label>`).join('') || `<div class="empty small">Aucun ${esc(noun)} ne correspond</div>`}</div>
      <div class="dd-foot"><span class="muted small grow">${picked.length} sélectionné${picked.length > 1 ? 's' : ''}</span><button type="button" class="btn ghost sm" data-pick-all>${st.q ? (allShown ? 'Retirer ces ' + nP : 'Ajouter ces ' + nP) : (all ? 'Aucun' : 'Tous')}</button><button type="button" class="btn sm" data-pick-close>Fermer</button></div>
    </div></div>`;
}
// Puces des éléments sélectionnés (retrait au clic) + réinitialisation
export function pickChips(items, st, { q = '' } = {}) {
  const picked = items.filter(i => st.sel.has(i.id));
  const all = picked.length === items.length;
  if (all && !q) return '';
  // Sélection complète : inutile de lister tous les éléments, seule la recherche est affichée
  const chips = all ? '' : picked.map(i => `<button type="button" class="chip" data-unpick="${esc(i.id)}" title="Retirer">${esc(i.name)} <span>✕</span></button>`).join('');
  return `<div class="chips">${chips}${q ? `<button type="button" class="chip q" data-clear-q title="Effacer la recherche">« ${esc(q)} » <span>✕</span></button>` : ''}<button type="button" class="btn ghost sm" data-pick-reset>Réinitialiser</button></div>`;
}
let pickOutsideBound = false; const openPicks = new Set();
export function bindMultiPick(root, id, items, st, draw, state = null) {
  const box = root.querySelector('#' + id);
  const shown = items.filter(i => hit([i.name, i.sub], terms(st.q)));
  const allShown = shown.length > 0 && shown.every(i => st.sel.has(i.id));
  const all = items.length > 0 && items.every(i => st.sel.has(i.id));
  const focusQ = () => { if (state) state.focus = id + '-q'; };
  if (box) {
    if (st.open) openPicks.add(st); else openPicks.delete(st);
    box.querySelector('[data-pick-btn]').onclick = () => { st.open = !st.open; if (st.open) focusQ(); else if (state) state.focus = null; draw(); };
    box.querySelector('[data-pick-close]')?.addEventListener('click', () => { st.open = false; if (state) state.focus = null; draw(); });
    const q = box.querySelector(`#${id}-q`);
    if (q) {
      q.oninput = e => { st.q = e.target.value; focusQ(); draw(); };
      q.onkeydown = e => {
        if (e.key === 'Escape') { st.q = ''; st.open = false; if (state) state.focus = null; draw(); }
        // Entrée : ne garder que les éléments trouvés
        if (e.key === 'Enter' && shown.length) { e.preventDefault(); st.sel = new Set(shown.map(i => i.id)); st.q = ''; st.open = false; pickSave(st); if (state) state.focus = null; draw(); }
      };
    }
    box.querySelectorAll('[data-pick]').forEach(cb => cb.onchange = () => { if (cb.checked) st.sel.add(cb.dataset.pick); else st.sel.delete(cb.dataset.pick); pickSave(st); focusQ(); draw(); });
    box.querySelector('[data-pick-all]').onclick = () => {
      if (st.q) { for (const i of shown) allShown ? st.sel.delete(i.id) : st.sel.add(i.id); }
      else st.sel = all ? new Set() : new Set(items.map(i => i.id));
      pickSave(st); focusQ(); draw();
    };
    if (!pickOutsideBound) {
      pickOutsideBound = true;
      document.addEventListener('click', e => {
        let changed = false;
        for (const s of openPicks) if (s.open && !e.target.closest('.dd')) { s.open = false; changed = true; }
        if (changed) document.querySelectorAll('.dd-panel').forEach(p => { p.hidden = true; });
      }, { capture: true });
    }
  }
  root.querySelectorAll('[data-unpick]').forEach(b => b.onclick = () => { st.sel.delete(b.dataset.unpick); pickSave(st); draw(); });
  root.querySelector('[data-pick-reset]')?.addEventListener('click', () => { st.sel = new Set(items.map(i => i.id)); st.q = ''; if (state) { state.q = ''; state.focus = null; } pickSave(st); draw(); });
  root.querySelector('[data-clear-q]')?.addEventListener('click', () => { if (state) { state.q = ''; state.focus = null; } draw(); });
}
