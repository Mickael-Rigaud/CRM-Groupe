// Organisations (clients, prospects B2B, banques) et Partenaires / apporteurs avec leurs résultats.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, ORG_TYPES, PARTNER_JOBS, CLIENT_STATUS } from '../data/schema.js';
import { esc, eur, openModal, closeModal, renderForm, readForm, toast, fmtDate, fmtDateTime, userName, contactName, actBadge, daysSince, csvDownload, confirm, isoDay, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { openDeal, dealForm } from './deal.js';
import { activityForm, activityRowHtml, bindActivityRows } from './activity.js';
import { openContact } from './contacts.js';
import { documentsSection, bindDocuments } from '../documents.js';

export function orgForm(existing = null, onSaved, onClose = null, presetType = null, switchTo = null) {
  const users = scope.users();
  const spec = [
    { key: 'name', label: 'Nom', type: 'text', required: true, half: true },
    { key: 'type', label: 'Type', type: 'select', options: ORG_TYPES, required: true, half: true, value: presetType || 'Client' },
    { key: 'partner_job', label: 'Métier (partenaire)', type: 'select', options: PARTNER_JOBS, half: true },
    { key: 'zone', label: 'Zone géographique', type: 'text', half: true },
    { key: 'phone', label: 'Téléphone', type: 'tel', half: true },
    { key: 'email', label: 'Email', type: 'email', half: true },
    { key: 'address', label: 'Adresse', type: 'text' },
    { key: 'postal_code', label: 'Code postal', type: 'text', half: true },
    { key: 'city', label: 'Ville', type: 'text', half: true },
    { key: 'siren', label: 'SIREN', type: 'text', half: true },
    { key: 'owner_id', label: 'Responsable de la relation', type: 'select', options: users.map(u => [u.id, u.full_name]), required: true, half: true, value: scope.user.id },
    { key: 'activities', label: 'Activités concernées', type: 'multiselect', options: ACTIVITY_KEYS.map(k => [k, ACTIVITIES[k].label]) },
    { key: 'last_contact_at', label: 'Dernier contact', type: 'date', half: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const propulsion = [
    { key: 'client_status', label: 'Statut client Propulsion', type: 'select', options: CLIENT_STATUS, half: true },
    { key: 'account_manager_id', label: 'Responsable du compte', type: 'select', options: users.map(u => [u.id, u.full_name]), half: true },
    { key: 'offer', label: 'Offre / prestation', type: 'text', half: true },
    { key: 'monthly_amount', label: 'Montant mensuel HT (€)', type: 'number', half: true },
    { key: 'commitment_months', label: 'Engagement (mois)', type: 'number', half: true },
    { key: 'start_date', label: 'Date de démarrage', type: 'date', half: true },
    { key: 'renewal_date', label: 'Date de renouvellement', type: 'date', half: true },
  ];
  const vals = existing ? { ...existing, last_contact_at: existing.last_contact_at ? existing.last_contact_at.slice(0, 10) : '' } : {};
  const kindSwitch = !existing && switchTo ? `<div class="kind-switch"><button type="button" data-kind="person">👤 Personne</button><button type="button" class="active" data-kind="org">🏢 Entreprise / structure</button></div>` : '';
  const m = openModal(existing ? "Modifier l'entreprise" : 'Nouvelle entreprise / structure', `${kindSwitch}<form class="form" id="o-form">${renderForm(spec, vals)}
    <div class="field"><label style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">Abonnement Propulsion (si client Propulsion)</label></div>${renderForm(propulsion, vals)}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="o-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true, onClose });
  const form = m.querySelector('#o-form');
  m.querySelector('[data-kind="person"]')?.addEventListener('click', () => switchTo(form.querySelector('[name="name"]').value));
  form.onsubmit = async e => {
    e.preventDefault();
    const v = { ...readForm(form, spec), ...readForm(form, propulsion) };
    if (v.last_contact_at) v.last_contact_at = new Date(v.last_contact_at + 'T12:00:00').toISOString(); else v.last_contact_at = null;
    for (const k of ['start_date', 'renewal_date']) if (!v[k]) v[k] = null;
    if (!v.account_manager_id) v.account_manager_id = null;
    try {
      let id = existing?.id;
      if (existing) await db.update('organisations', id, v); else id = (await db.insert('organisations', v)).id;
      closeModal(true); toast('Entreprise enregistrée'); onSaved?.(id);
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#o-del')?.addEventListener('click', async () => {
    if (db.t('deals').some(d => d.organisation_id === existing.id || d.referrer_org_id === existing.id)) return toast('Cette entreprise est liée à des affaires', 'warn');
    if (!await confirm('Supprimer cette entreprise ?')) return;
    await db.remove('organisations', existing.id); closeModal(true); toast('Entreprise supprimée'); onSaved?.(null);
  });
}

// Résultats apportés par un partenaire : leads, ventes, CA (affaires dont il est l'apporteur)
export function partnerStats(orgId) {
  const brought = db.t('deals').filter(d => d.referrer_org_id === orgId);
  const won = brought.filter(d => d.status === 'won');
  return { leads: brought.length, won: won.length, revenue: won.reduce((s, d) => s + (Number(d.amount) || 0), 0), open: brought.filter(d => d.status === 'open').length, contacts: db.t('contacts').filter(c => c.referrer_org_id === orgId).length };
}

export function openOrg(id, onChange) {
  const render = () => {
    const o = db.byId('organisations', id); if (!o) return closeModal();
    const contacts = db.t('contacts').filter(c => c.organisation_id === id);
    const deals = db.t('deals').filter(d => d.organisation_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const brought = db.t('deals').filter(d => d.referrer_org_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const acts = db.t('activities').filter(a => a.organisation_id === id && !a.done).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    const st = partnerStats(id);
    const isPartner = o.type === 'Partenaire';
    const html = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div><span class="pill">${esc(o.type)}</span> ${o.partner_job ? `<span class="pill info">${esc(o.partner_job)}</span>` : ''} ${o.client_status ? `<span class="pill ${o.client_status === 'Client actif' ? 'ok' : ''}">${esc(o.client_status)}</span>` : ''} ${(o.activities || []).map(actBadge).join(' ')}<div class="muted small" style="margin-top:4px">${esc(userName(o.owner_id))} · dernier contact : ${o.last_contact_at ? fmtDate(o.last_contact_at) + ' (' + daysSince(o.last_contact_at) + ' j)' : 'jamais'}</div></div>
        <div class="toolbar"><button class="btn sm" id="o-new-deal">+ Affaire</button><button class="btn ghost sm" id="o-new-act">+ Activité</button><button class="btn ghost sm" id="o-touch">Contact fait aujourd'hui</button><button class="btn ghost sm" id="o-edit">✎ Modifier</button></div>
      </div>
      ${isPartner ? `<div class="grid c4" style="margin-bottom:18px">
        <div class="card tight kpi"><div class="lbl">Leads apportés</div><div class="val">${st.leads}</div><div class="sub">${st.open} en cours</div></div>
        <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">Ventes</div><div class="val">${st.won}</div><div class="sub">${st.leads ? Math.round(st.won / st.leads * 100) : 0} % de transformation</div></div>
        <div class="card tight kpi" style="--kpi:#dbeafe;--kpi-c:var(--blue)"><div class="lbl">CA généré</div><div class="val">${eur(st.revenue)}</div><div class="sub">affaires gagnées</div></div>
        <div class="card tight kpi" style="--kpi:#fef3c7;--kpi-c:var(--amber)"><div class="lbl">Dernier contact</div><div class="val">${o.last_contact_at ? daysSince(o.last_contact_at) + ' j' : '—'}</div><div class="sub">${o.last_contact_at && daysSince(o.last_contact_at) > 60 ? 'à relancer' : 'relation active'}</div></div>
      </div>` : ''}
      ${o.type === 'Client' && o.monthly_amount ? `<div class="alert blue" style="margin-bottom:16px"><b>${eur(o.monthly_amount)}</b><div>par mois · ${esc(o.offer || '')} · engagement ${o.commitment_months || '—'} mois · renouvellement le <b>${fmtDate(o.renewal_date)}</b>${o.renewal_date && daysSince(o.renewal_date) >= -45 ? ' <span class="pill warn">à préparer</span>' : ''}</div></div>` : ''}
      <div class="detail">
        <div>
          <div class="section"><h3>Coordonnées</h3><dl>
            <dt>Téléphone</dt><dd>${esc(o.phone || '—')}</dd><dt>Email</dt><dd>${esc(o.email || '—')}</dd>
            <dt>Adresse</dt><dd>${esc([o.address, o.postal_code, o.city].filter(Boolean).join(', ') || '—')}</dd>
            <dt>Zone</dt><dd>${esc(o.zone || '—')}</dd>${o.siren ? `<dt>SIREN</dt><dd>${esc(o.siren)}</dd>` : ''}
            ${o.notes ? `<dt>Notes</dt><dd style="font-weight:400">${esc(o.notes)}</dd>` : ''}
          </dl></div>
          <div class="section"><h3>Contacts (${contacts.length})</h3>${contacts.map(c => `<div class="act-row" style="cursor:pointer;margin-bottom:6px" data-contact="${c.id}"><div style="flex:1"><b>${esc(contactName(c))}</b><div class="small muted">${esc(c.phone || '')} ${esc(c.email || '')}</div></div></div>`).join('') || '<div class="empty">Aucun contact rattaché</div>'}</div>
          <div class="section"><h3>Affaires de l'entreprise (${deals.length})</h3>${deals.map(d => dealRow(d)).join('') || '<div class="empty">Aucune</div>'}</div>
          ${isPartner ? `<div class="section"><h3>Affaires apportées (${brought.length})</h3>${brought.map(d => dealRow(d)).join('') || '<div class="empty">Aucune — renseignez cet apporteur sur les affaires qu\'il vous envoie</div>'}</div>` : ''}
        </div>
        <div>
          <div class="section"><h3>Actions à venir</h3><div id="o-acts" style="display:flex;flex-direction:column;gap:8px">${acts.length ? acts.map(a => activityRowHtml(a)).join('') : '<div class="empty">Aucune</div>'}</div></div>
          ${documentsSection('organisations', id)}
        </div>
      </div>`;
    const m = openModal(o.name, html, { wide: true, onClose: () => onChange?.() });
    const refresh = () => { render(); onChange?.(); };
    m.querySelector('#o-edit').onclick = () => orgForm(o, (nid) => nid ? refresh() : onChange?.(), render);
    m.querySelector('#o-new-act').onclick = () => activityForm({ organisation_id: id }, null, refresh, render);
    m.querySelector('#o-touch').onclick = async () => { await db.update('organisations', id, { last_contact_at: new Date().toISOString() }); toast('Dernier contact mis à jour'); refresh(); };
    m.querySelector('#o-new-deal').onclick = () => { const act = (o.activities || [])[0] || scope.activityKeys[0]; dealForm(act, null, { organisation_id: id, title: `${ACTIVITIES[act].short} — ${o.name}`, ...(isPartner ? { channel: 'Partenaire / apporteur', referrer_org_id: id, organisation_id: null } : {}) }, (did) => did ? openDeal(did, refresh) : refresh(), render); };
    m.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, refresh));
    m.querySelectorAll('[data-contact]').forEach(el => el.onclick = () => openContact(el.dataset.contact, refresh));
    bindActivityRows(m.querySelector('#o-acts'), refresh, render);
    bindDocuments(m, 'organisations', id, render);
  };
  const dealRow = d => `<div class="act-row" style="cursor:pointer;margin-bottom:6px" data-deal="${d.id}"><div style="flex:1">${actBadge(d.activity)} <b>${esc(d.title)}</b><div class="small muted">${d.status === 'won' ? '<span class="status-won">Gagnée</span>' : d.status === 'lost' ? '<span class="status-lost">Perdue</span>' : esc(ACTIVITIES[d.activity].stages.find(s => s.key === d.stage)?.label)} · ${eur(d.amount)} · ${fmtDate(d.created_at)}</div></div></div>`;
  render();
}

function listPage(kind) {
  return {
    title: () => kind === 'partners' ? 'Partenaires & apporteurs' : 'Organisations',
    render(root, param) {
      const state = { q: '', job: '', type: '', focus: null };
      const draw = () => {
        let list = scope.orgs();
        list = kind === 'partners' ? list.filter(o => o.type === 'Partenaire') : list.filter(o => o.type !== 'Partenaire');
        list = list.filter(o => (!state.job || o.partner_job === state.job) && (!state.type || o.type === state.type) && hit([o.name, o.city, o.zone, o.email, o.phone, o.partner_job, o.notes], terms(state.q)));
        const stats = Object.fromEntries(list.map(o => [o.id, partnerStats(o.id)]));
        if (kind === 'partners') list.sort((a, b) => stats[b.id].revenue - stats[a.id].revenue || stats[b.id].leads - stats[a.id].leads);
        else list.sort((a, b) => a.name.localeCompare(b.name));
        const mrr = list.filter(o => o.client_status === 'Client actif').reduce((s, o) => s + (Number(o.monthly_amount) || 0), 0);
        root.innerHTML = `
          <div class="toolbar">
            ${searchInput('o-q', state, 'Nom, ville, zone, métier, téléphone…')}
            ${kind === 'partners' ? `<select id="o-job"><option value="">Tous les métiers</option>${PARTNER_JOBS.map(j => `<option ${state.job === j ? 'selected' : ''}>${j}</option>`).join('')}</select>` : `<select id="o-type"><option value="">Tous les types</option>${ORG_TYPES.filter(t => t !== 'Partenaire').map(t => `<option ${state.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`}
            <button class="btn ghost sm" id="o-export">Export CSV</button>
            <button class="btn" id="o-new">+ ${kind === 'partners' ? 'Partenaire' : 'Organisation'}</button>
          </div>
          ${kind === 'partners' ? `<div class="grid c3">
            <div class="card tight kpi"><div class="lbl">Partenaires</div><div class="val">${list.length}</div><div class="sub">${list.filter(o => !o.last_contact_at || daysSince(o.last_contact_at) > 60).length} sans contact depuis 60 j</div></div>
            <div class="card tight kpi" style="--kpi:#dbeafe;--kpi-c:var(--blue)"><div class="lbl">Leads apportés</div><div class="val">${Object.values(stats).reduce((s, x) => s + x.leads, 0)}</div><div class="sub">toutes activités</div></div>
            <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">CA généré par les partenaires</div><div class="val">${eur(Object.values(stats).reduce((s, x) => s + x.revenue, 0))}</div><div class="sub">affaires gagnées</div></div>
          </div>` : (mrr ? `<div class="alert blue"><b>${eur(mrr)}</b><div>de revenu mensuel récurrent Propulsion (clients actifs)</div></div>` : '')}
          <div class="card"><div class="table-wrap"><table><thead><tr><th>Nom</th>${kind === 'partners' ? '<th>Métier</th><th>Zone</th>' : '<th>Type</th><th>Ville</th>'}<th>Activités</th><th>Responsable</th><th>Dernier contact</th>${kind === 'partners' ? '<th class="num">Leads</th><th class="num">Ventes</th><th class="num">CA généré</th>' : '<th>Statut</th><th class="num">Mensuel</th><th>Renouvellement</th>'}</tr></thead><tbody>
            ${list.map(o => { const s = stats[o.id]; const lc = o.last_contact_at ? daysSince(o.last_contact_at) : null; return `<tr class="click" data-o="${o.id}"><td><b>${esc(o.name)}</b></td>${kind === 'partners' ? `<td>${esc(o.partner_job || '')}</td><td>${esc(o.zone || '')}</td>` : `<td><span class="pill">${esc(o.type)}</span></td><td>${esc(o.city || '')}</td>`}<td>${(o.activities || []).map(actBadge).join(' ')}</td><td class="small">${esc(userName(o.owner_id))}</td><td class="${lc === null || lc > 60 ? 'status-lost' : ''}">${lc === null ? 'Jamais' : lc + ' j'}</td>${kind === 'partners' ? `<td class="num">${s.leads}</td><td class="num">${s.won}</td><td class="num"><b>${eur(s.revenue)}</b></td>` : `<td>${o.client_status ? `<span class="pill ${o.client_status === 'Client actif' ? 'ok' : ''}">${esc(o.client_status)}</span>` : ''}</td><td class="num">${o.monthly_amount ? eur(o.monthly_amount) : ''}</td><td class="${o.renewal_date && daysSince(o.renewal_date) >= -45 ? 'status-lost' : ''}">${o.renewal_date ? fmtDate(o.renewal_date) : ''}</td>`}</tr>`; }).join('') || `<tr><td colspan="9" class="empty">Aucune entrée</td></tr>`}
          </tbody></table></div></div>`;
        bindSearch(root, 'o-q', state, draw); restoreFocus(root, state);
        root.querySelector('#o-job')?.addEventListener('change', e => { state.job = e.target.value; draw(); });
        root.querySelector('#o-type')?.addEventListener('change', e => { state.type = e.target.value; draw(); });
        root.querySelector('#o-new').onclick = () => orgForm(null, (id) => { draw(); if (id) openOrg(id, draw); }, null, kind === 'partners' ? 'Partenaire' : 'Client');
        root.querySelector('#o-export').onclick = () => csvDownload(kind === 'partners' ? 'partenaires.csv' : 'organisations.csv', list.map(o => ({ nom: o.name, type: o.type, metier: o.partner_job, zone: o.zone, ville: o.city, telephone: o.phone, email: o.email, activites: (o.activities || []).join('|'), responsable: userName(o.owner_id), dernier_contact: fmtDate(o.last_contact_at), leads_apportes: stats[o.id].leads, ventes: stats[o.id].won, ca_genere: stats[o.id].revenue, statut_client: o.client_status, mensuel: o.monthly_amount, renouvellement: o.renewal_date })));
        root.querySelectorAll('[data-o]').forEach(tr => tr.onclick = () => openOrg(tr.dataset.o, draw));
      };
      draw();
      if (param && db.byId('organisations', param)) openOrg(param, draw);
      return { refresh: draw };
    },
  };
}
export const partnersPage = listPage('partners');
