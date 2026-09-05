// Contacts : liste, fiche, création / édition.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, CHANNELS, CONTACT_TYPES } from '../data/schema.js';
import { esc, eur, openModal, closeModal, renderForm, readForm, refField, bindRefFields, toast, fmtDate, fmtDateTime, userName, contactName, actBadge, csvDownload, confirm } from '../ui.js';
import { openDeal, dealForm } from './deal.js';
import { activityForm, activityRowHtml, bindActivityRows } from './activity.js';

const orgLabel = o => o.name;
const contactLabel = c => `${contactName(c)}${c.city ? ' (' + c.city + ')' : ''}`;

export function contactForm(existing = null, onSaved, onClose = null) {
  const users = scope.users(); const orgs = scope.orgs(); const contacts = scope.contacts().filter(c => c.id !== existing?.id);
  const spec = [
    { key: 'first_name', label: 'Prénom', type: 'text', half: true },
    { key: 'last_name', label: 'Nom', type: 'text', required: true, half: true },
    { key: 'phone', label: 'Téléphone', type: 'tel', half: true },
    { key: 'email', label: 'Email', type: 'email', half: true },
    { key: 'address', label: 'Adresse', type: 'text' },
    { key: 'postal_code', label: 'Code postal', type: 'text', half: true },
    { key: 'city', label: 'Ville', type: 'text', half: true },
    { key: 'type', label: 'Type', type: 'select', options: CONTACT_TYPES, required: true, half: true, value: 'Prospect' },
    { key: 'owner_id', label: 'Responsable', type: 'select', options: users.map(u => [u.id, u.full_name]), required: true, half: true, value: scope.user.id },
    { key: 'activities', label: 'Activités concernées', type: 'multiselect', options: ACTIVITY_KEYS.map(k => [k, ACTIVITIES[k].label]) },
    { key: 'channel', label: "Canal d'origine", type: 'select', options: CHANNELS, half: true },
    { key: 'campaign', label: 'Campagne', type: 'text', half: true },
    { key: 'consent', label: 'Consentement contact commercial (RGPD)', type: 'checkbox', hint: 'Le contact accepte d\'être recontacté', half: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const m = openModal(existing ? 'Modifier le contact' : 'Nouveau contact', `<form class="form" id="c-form">${renderForm(spec, existing || {})}
    ${refField('organisation_id', 'Organisation', orgs, orgLabel, existing?.organisation_id)}
    ${refField('referrer_org_id', 'Apporteur (organisation)', orgs, orgLabel, existing?.referrer_org_id)}
    ${refField('referrer_contact_id', 'Apporteur (contact)', contacts, contactLabel, existing?.referrer_contact_id)}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="c-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true, onClose });
  const form = m.querySelector('#c-form');
  bindRefFields(form, { organisation_id: { rows: orgs, labelFn: orgLabel }, referrer_org_id: { rows: orgs, labelFn: orgLabel }, referrer_contact_id: { rows: contacts, labelFn: contactLabel } });
  form.onsubmit = async e => {
    e.preventDefault();
    const v = readForm(form, spec);
    for (const k of ['organisation_id', 'referrer_org_id', 'referrer_contact_id']) v[k] = form.querySelector(`[name="${k}"]`).value || null;
    // Doublon simple : même email ou même téléphone
    const dup = db.t('contacts').find(c => c.id !== existing?.id && ((v.email && c.email && c.email.toLowerCase() === v.email.toLowerCase()) || (v.phone && c.phone && c.phone.replace(/\D/g, '') === v.phone.replace(/\D/g, ''))));
    if (dup && !existing && !await confirm(`Un contact existe déjà avec cet email ou ce téléphone (${contactName(dup)}). Créer quand même ?`)) return;
    try {
      let id = existing?.id;
      if (existing) await db.update('contacts', id, v); else id = (await db.insert('contacts', v)).id;
      closeModal(true); toast('Contact enregistré'); onSaved?.(id);
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#c-del')?.addEventListener('click', async () => {
    if (db.t('deals').some(d => d.contact_id === existing.id)) return toast('Ce contact a des affaires : supprimez-les d\'abord', 'warn');
    if (!await confirm('Supprimer ce contact ?')) return;
    await db.remove('contacts', existing.id); closeModal(true); toast('Contact supprimé'); onSaved?.(null);
  });
}

export function openContact(id, onChange) {
  const render = () => {
    const c = db.byId('contacts', id); if (!c) return closeModal();
    const org = c.organisation_id && db.byId('organisations', c.organisation_id);
    const deals = db.t('deals').filter(d => d.contact_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const acts = db.t('activities').filter(a => a.contact_id === id && !a.done).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    const events = db.t('events').filter(e => e.contact_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15);
    const refOrg = c.referrer_org_id && db.byId('organisations', c.referrer_org_id);
    const html = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div><span class="pill">${esc(c.type || 'Prospect')}</span> ${(c.activities || []).map(actBadge).join(' ')}<div class="muted small" style="margin-top:4px">Créé le ${fmtDate(c.created_at)} · ${esc(userName(c.owner_id))}</div></div>
        <div class="toolbar"><button class="btn sm" id="c-new-deal">+ Affaire</button><button class="btn ghost sm" id="c-new-act">+ Activité</button><button class="btn ghost sm" id="c-edit">✎ Modifier</button></div>
      </div>
      <div class="detail">
        <div>
          <div class="section"><h3>Coordonnées</h3><dl>
            <dt>Téléphone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</dd>
            <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
            <dt>Adresse</dt><dd>${esc([c.address, c.postal_code, c.city].filter(Boolean).join(', ') || '—')}</dd>
            <dt>Organisation</dt><dd>${org ? esc(org.name) : '—'}</dd>
            <dt>Origine</dt><dd>${esc(c.channel || '—')}${c.campaign ? ` <span class="pill">${esc(c.campaign)}</span>` : ''}${refOrg ? ` · via ${esc(refOrg.name)}` : ''}</dd>
            <dt>RGPD</dt><dd>${c.consent ? '<span class="pill ok">Consentement OK</span>' : '<span class="pill warn">Consentement non renseigné</span>'}</dd>
            ${c.notes ? `<dt>Notes</dt><dd style="font-weight:400">${esc(c.notes)}</dd>` : ''}
          </dl></div>
          <div class="section"><h3>Affaires (${deals.length})</h3>${deals.length ? deals.map(d => `<div class="act-row" style="cursor:pointer;margin-bottom:6px" data-deal="${d.id}"><div style="flex:1">${actBadge(d.activity)} <b>${esc(d.title)}</b><div class="small muted">${d.status === 'won' ? '<span class="status-won">Gagnée</span>' : d.status === 'lost' ? '<span class="status-lost">Perdue</span>' : esc(ACTIVITIES[d.activity].stages.find(s => s.key === d.stage)?.label)} · ${eur(d.amount)}</div></div></div>`).join('') : '<div class="empty">Aucune affaire</div>'}</div>
        </div>
        <div>
          <div class="section"><h3>Actions à venir</h3><div id="c-acts" style="display:flex;flex-direction:column;gap:8px">${acts.length ? acts.map(a => activityRowHtml(a)).join('') : '<div class="empty">Aucune</div>'}</div></div>
          <div class="section"><h3>Derniers échanges</h3><div class="timeline">${events.length ? events.map(e => `<div class="tl ${e.kind}"><div class="meta">${fmtDateTime(e.created_at)} · ${esc(userName(e.author_id))}</div>${esc(e.body)}</div>`).join('') : '<div class="empty">Aucun</div>'}</div></div>
        </div>
      </div>`;
    const m = openModal(contactName(c), html, { wide: true, onClose: () => onChange?.() });
    const refresh = () => { render(); onChange?.(); };
    m.querySelector('#c-edit').onclick = () => contactForm(c, (nid) => nid ? refresh() : onChange?.(), render);
    m.querySelector('#c-new-act').onclick = () => activityForm({ contact_id: id, organisation_id: c.organisation_id || null }, null, refresh, render);
    m.querySelector('#c-new-deal').onclick = () => {
      const act = (c.activities || [])[0] || scope.activityKeys[0];
      dealForm(act, null, { contact_id: id, organisation_id: c.organisation_id || null, channel: c.channel || '', campaign: c.campaign || '', referrer_org_id: c.referrer_org_id || null, referrer_contact_id: c.referrer_contact_id || null, title: `${ACTIVITIES[act].short} — ${contactName(c)}` }, (did) => { if (did) openDeal(did, refresh); else refresh(); }, render);
    };
    m.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, refresh));
    bindActivityRows(m.querySelector('#c-acts'), refresh, render);
  };
  render();
}

export const contactsPage = {
  title: () => 'Contacts',
  render(root, param) {
    const state = { q: '', act: '', type: '' };
    const draw = () => {
      const list = scope.contacts().filter(c => (!state.act || (c.activities || []).includes(state.act)) && (!state.type || c.type === state.type) && (!state.q || [c.first_name, c.last_name, c.email, c.phone, c.city, db.byId('organisations', c.organisation_id)?.name].join(' ').toLowerCase().includes(state.q.toLowerCase()))).sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
      root.innerHTML = `
        <div class="toolbar">
          <input type="search" class="grow" id="c-q" placeholder="Nom, email, téléphone, ville, société…" value="${esc(state.q)}">
          <select id="c-act"><option value="">Toutes les activités</option>${ACTIVITY_KEYS.map(k => `<option value="${k}" ${state.act === k ? 'selected' : ''}>${esc(ACTIVITIES[k].label)}</option>`).join('')}</select>
          <select id="c-type"><option value="">Tous les types</option>${CONTACT_TYPES.map(t => `<option ${state.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <button class="btn ghost sm" id="c-export">Export CSV</button>
          <button class="btn" id="c-new">+ Contact</button>
        </div>
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Ville</th><th>Organisation</th><th>Activités</th><th>Type</th><th>Origine</th><th class="num">Affaires</th><th>Responsable</th></tr></thead><tbody>
          ${list.map(c => { const n = db.t('deals').filter(d => d.contact_id === c.id).length; return `<tr class="click" data-c="${c.id}"><td><b>${esc(contactName(c))}</b></td><td class="nowrap">${esc(c.phone || '')}</td><td>${esc(c.email || '')}</td><td>${esc(c.city || '')}</td><td>${esc(db.byId('organisations', c.organisation_id)?.name || '')}</td><td>${(c.activities || []).map(actBadge).join(' ')}</td><td><span class="pill">${esc(c.type || '')}</span></td><td class="small">${esc(c.channel || '')}</td><td class="num">${n}</td><td class="small">${esc(userName(c.owner_id))}</td></tr>`; }).join('') || '<tr><td colspan="10" class="empty">Aucun contact</td></tr>'}
        </tbody></table></div><p class="muted small">${list.length} contact${list.length > 1 ? 's' : ''}</p></div>`;
      root.querySelector('#c-q').oninput = e => { state.q = e.target.value; draw(); const i = root.querySelector('#c-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
      root.querySelector('#c-act').onchange = e => { state.act = e.target.value; draw(); };
      root.querySelector('#c-type').onchange = e => { state.type = e.target.value; draw(); };
      root.querySelector('#c-new').onclick = () => contactForm(null, (id) => { draw(); if (id) openContact(id, draw); });
      root.querySelector('#c-export').onclick = () => csvDownload('contacts.csv', list.map(c => ({ prenom: c.first_name, nom: c.last_name, telephone: c.phone, email: c.email, adresse: c.address, cp: c.postal_code, ville: c.city, organisation: db.byId('organisations', c.organisation_id)?.name, type: c.type, activites: (c.activities || []).join('|'), canal: c.channel, campagne: c.campaign, responsable: userName(c.owner_id), consentement: c.consent ? 'oui' : 'non', cree_le: fmtDate(c.created_at) })));
      root.querySelectorAll('[data-c]').forEach(tr => tr.onclick = () => openContact(tr.dataset.c, draw));
    };
    draw();
    if (param && db.byId('contacts', param)) openContact(param, draw);
    return { refresh: draw };
  },
};
