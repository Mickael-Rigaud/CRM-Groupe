// Affaires : fiche détaillée (modale), création / édition, changement d'étape, gagné / perdu.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, CHANNELS, LOST_REASONS, stageOf, stageIndex } from '../data/schema.js';
import { esc, eur, openModal, closeModal, renderForm, readForm, refField, bindRefFields, toast, fmtDate, fmtDateTime, userName, contactName, dealParty, actBadge, daysSince, confirm } from '../ui.js';
import { activityForm, activityRowHtml, bindActivityRows, nextActivity } from './activity.js';
import { documentsSection, bindDocuments } from '../documents.js';

const contactLabel = c => `${contactName(c)}${c.city ? ' (' + c.city + ')' : ''}`;
const orgLabel = o => o.name;

async function logEvent(deal, kind, body) {
  await db.insert('events', { deal_id: deal.id, contact_id: deal.contact_id || null, organisation_id: deal.organisation_id || null, kind, body, author_id: scope.user.id });
}

export async function moveStage(deal, stageKey, { silent = false } = {}) {
  const act = ACTIVITIES[deal.activity]; const st = stageOf(deal.activity, stageKey);
  if (!st || deal.stage === stageKey) return;
  const patch = { stage: stageKey, stage_changed_at: new Date().toISOString(), stage_history: [...(deal.stage_history || []), { stage: stageKey, at: new Date().toISOString() }] };
  if (st.delivery && deal.status !== 'won') Object.assign(patch, { status: 'won', won_at: new Date().toISOString(), closed_at: new Date().toISOString(), lost_reason: null });
  const updated = await db.update('deals', deal.id, patch);
  await logEvent(updated, 'stage', `Étape → ${st.label}${patch.status === 'won' ? ' (affaire gagnée)' : ''}`);
  if (!silent) toast(`Étape : ${st.label}`);
  return updated;
}

export async function setWon(deal) {
  const act = ACTIVITIES[deal.activity];
  const firstDelivery = act.stages.find(s => s.delivery);
  const patch = { status: 'won', won_at: new Date().toISOString(), closed_at: new Date().toISOString(), lost_reason: null };
  if (firstDelivery && stageIndex(deal.activity, deal.stage) < stageIndex(deal.activity, firstDelivery.key)) {
    Object.assign(patch, { stage: firstDelivery.key, stage_changed_at: new Date().toISOString(), stage_history: [...(deal.stage_history || []), { stage: firstDelivery.key, at: new Date().toISOString() }] });
  }
  const u = await db.update('deals', deal.id, patch);
  await logEvent(u, 'stage', '🎉 Affaire gagnée');
  // Tâche de suite automatique selon l'activité
  const follow = { rgd: 'Créer le client et le chantier dans Costructor', btp: 'Planifier la mission', courtage: 'Suivre le déblocage et facturer la commission', propulsion: 'Lancer l\'onboarding et renseigner l\'abonnement sur l\'organisation' }[deal.activity];
  if (follow) await db.insert('activities', { deal_id: deal.id, contact_id: deal.contact_id || null, organisation_id: deal.organisation_id || null, type: 'appel', title: follow, due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), assignee_id: deal.owner_id || scope.user.id, done: false });
  toast('Affaire gagnée 🎉');
  return u;
}

export function setLost(deal, onDone, onClose = null) {
  const m = openModal('Affaire perdue', `<form class="form" id="lost-form">
    ${renderForm([{ key: 'lost_reason', label: 'Motif de perte', type: 'select', options: LOST_REASONS, required: true }, { key: 'note', label: 'Commentaire', type: 'textarea', rows: 2 }])}
    <div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn danger" type="submit">Marquer perdue</button></div></form>`, { onClose });
  m.querySelector('#lost-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const u = await db.update('deals', deal.id, { status: 'lost', lost_reason: f.get('lost_reason'), lost_at: new Date().toISOString(), closed_at: new Date().toISOString() });
    await logEvent(u, 'stage', `Affaire perdue — ${f.get('lost_reason')}${f.get('note') ? ' : ' + f.get('note') : ''}`);
    // Les tâches ouvertes n'ont plus de sens
    for (const a of db.t('activities').filter(a => a.deal_id === deal.id && !a.done)) await db.update('activities', a.id, { done: true, done_at: new Date().toISOString() });
    closeModal(true); toast('Affaire marquée perdue'); onDone?.();
  };
}

export async function reopen(deal) {
  const u = await db.update('deals', deal.id, { status: 'open', won_at: null, lost_at: null, closed_at: null, lost_reason: null });
  await logEvent(u, 'stage', 'Affaire réouverte'); toast('Affaire réouverte');
}

// ---------- Formulaire création / édition ----------
export function dealForm(activityKey, existing = null, presets = {}, onSaved, onClose = null) {
  const act = ACTIVITIES[activityKey];
  const users = scope.users();
  const contacts = scope.contacts(); const orgs = scope.orgs();
  const base = [
    { key: 'title', label: "Intitulé de l'affaire", type: 'text', required: true, placeholder: 'Ex. Rénovation appartement — Dupont' },
    { key: 'owner_id', label: 'Responsable', type: 'select', options: users.map(u => [u.id, u.full_name]), required: true, half: true, value: scope.user.id },
    { key: 'amount', label: act.amountLabel, type: 'number', half: true, step: '1' },
    { key: 'channel', label: "Canal d'origine", type: 'select', options: CHANNELS, required: true, half: true },
    { key: 'campaign', label: 'Campagne (nom exact Meta / Google)', type: 'text', half: true },
  ];
  const specific = act.fields.map(f => ({ ...f, half: f.type !== 'textarea' }));
  const vals = existing ? { ...existing, ...(existing.fields || {}) } : { ...presets, ...(presets.fields || {}) };
  const html = `<form class="form" id="deal-form">
    ${renderForm(base, vals)}
    ${refField('contact_id', 'Contact', contacts, contactLabel, vals.contact_id)}
    ${refField('organisation_id', 'Entreprise / structure', orgs, orgLabel, vals.organisation_id)}
    ${refField('referrer_org_id', 'Apporteur (organisation)', orgs, orgLabel, vals.referrer_org_id)}
    ${refField('referrer_contact_id', 'Apporteur (contact)', contacts, contactLabel, vals.referrer_contact_id)}
    <div class="field"><label style="font-size:12px;text-transform:uppercase;letter-spacing:.06em">Informations ${esc(act.label)}</label></div>
    ${renderForm(specific, vals)}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="deal-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
  </form>`;
  const m = openModal(existing ? "Modifier l'affaire" : `Nouvelle affaire — ${act.label}`, html, { wide: true, onClose });
  const form = m.querySelector('#deal-form');
  bindRefFields(form, { contact_id: { rows: contacts, labelFn: contactLabel }, organisation_id: { rows: orgs, labelFn: orgLabel }, referrer_org_id: { rows: orgs, labelFn: orgLabel }, referrer_contact_id: { rows: contacts, labelFn: contactLabel } });
  form.onsubmit = async e => {
    e.preventDefault();
    const b = readForm(form, base); const s = readForm(form, specific);
    const refs = {};
    for (const k of ['contact_id', 'organisation_id', 'referrer_org_id', 'referrer_contact_id']) refs[k] = form.querySelector(`[name="${k}"]`).value || null;
    if (!refs.contact_id && !refs.organisation_id) return toast('Indiquez au moins un contact ou une organisation', 'warn');
    if (activityKey === 'propulsion' && !b.amount && s.montant_mensuel && s.duree_mois) b.amount = s.montant_mensuel * s.duree_mois;
    if (b.channel === 'Partenaire / apporteur' && !refs.referrer_org_id && !refs.referrer_contact_id) return toast("Canal « Partenaire / apporteur » : indiquez l'apporteur", 'warn');
    try {
      if (existing) { await db.update('deals', existing.id, { ...b, ...refs, fields: s }); toast('Affaire mise à jour'); closeModal(true); onSaved?.(existing.id); }
      else {
        const stage = act.stages[0].key;
        const d = await db.insert('deals', { ...b, ...refs, activity: activityKey, stage, status: 'open', fields: s, stage_history: [{ stage, at: new Date().toISOString() }], stage_changed_at: new Date().toISOString() });
        // Activité concernée ajoutée sur le contact / l'organisation
        for (const [t, id] of [['contacts', refs.contact_id], ['organisations', refs.organisation_id]]) {
          if (!id) continue; const r = db.byId(t, id); if (r && !(r.activities || []).includes(activityKey)) await db.update(t, id, { activities: [...(r.activities || []), activityKey] });
        }
        await db.insert('activities', { deal_id: d.id, contact_id: refs.contact_id, organisation_id: refs.organisation_id, type: 'appel', title: 'Contacter le prospect', due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), assignee_id: b.owner_id, done: false });
        toast('Affaire créée avec une première action « Contacter le prospect »'); closeModal(true); onSaved?.(d.id);
      }
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#deal-del')?.addEventListener('click', async () => {
    if (!await confirm('Supprimer définitivement cette affaire et ses activités ?')) return;
    for (const a of db.t('activities').filter(a => a.deal_id === existing.id)) await db.remove('activities', a.id);
    for (const ev of db.t('events').filter(a => a.deal_id === existing.id)) await db.remove('events', ev.id);
    await db.remove('deals', existing.id); closeModal(true); toast('Affaire supprimée'); onSaved?.(null);
  });
}

// ---------- Fiche affaire ----------
export function openDeal(id, onChange) {
  const render = () => {
    const d = db.byId('deals', id); if (!d) return closeModal();
    const act = ACTIVITIES[d.activity];
    const acts = db.t('activities').filter(a => a.deal_id === id).sort((x, y) => (x.done - y.done) || (x.due_date || '').localeCompare(y.due_date || ''));
    const events = db.t('events').filter(e => e.deal_id === id).sort((x, y) => y.created_at.localeCompare(x.created_at));
    const contact = d.contact_id && db.byId('contacts', d.contact_id);
    const org = d.organisation_id && db.byId('organisations', d.organisation_id);
    const refOrg = d.referrer_org_id && db.byId('organisations', d.referrer_org_id);
    const refC = d.referrer_contact_id && db.byId('contacts', d.referrer_contact_id);
    const curIdx = stageIndex(d.activity, d.stage);
    const status = d.status === 'won' ? `<span class="status-won">GAGNÉE ${fmtDate(d.won_at)}</span>` : d.status === 'lost' ? `<span class="status-lost">PERDUE — ${esc(d.lost_reason || '')}</span>` : `<span class="pill info">En cours · ${daysSince(d.stage_changed_at) ?? 0} j dans l'étape</span>`;
    const next = nextActivity(id);
    const html = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px">
        <div>${actBadge(d.activity)} &nbsp; ${status}<div class="muted small" style="margin-top:4px">Créée le ${fmtDate(d.created_at)} · Responsable : ${esc(userName(d.owner_id))}</div></div>
        <div class="toolbar">
          ${d.status === 'open' ? `<button class="btn green sm" id="d-won">✓ Gagnée</button><button class="btn danger sm" id="d-lost">✕ Perdue</button>` : `<button class="btn ghost sm" id="d-reopen">Réouvrir</button>`}
          <button class="btn ghost sm" id="d-edit">✎ Modifier</button>
        </div>
      </div>
      <div class="stage-steps" style="margin-bottom:18px">${act.stages.map((s, i) => `<button data-stage="${s.key}" class="${i === curIdx ? 'cur' : i < curIdx ? 'past' : ''}" title="${s.delivery ? 'Étape de réalisation (affaire gagnée)' : 'Probabilité ' + s.p + ' %'}">${esc(s.label)}</button>`).join('')}</div>
      ${d.status === 'open' && !next ? `<div class="alert" style="margin-bottom:16px"><b>!</b><div>Aucune prochaine action planifiée — <a href="#" id="d-add-act-inline">en ajouter une maintenant</a>.</div></div>` : ''}
      <div class="detail">
        <div>
          <div class="section"><h3>Informations</h3><dl>
            <dt>Contact</dt><dd>${contact ? `<a href="#/contacts/${contact.id}" data-close>${esc(contactName(contact))}</a> ${contact.phone ? '· <a href="tel:' + esc(contact.phone) + '">' + esc(contact.phone) + '</a>' : ''} ${contact.email ? '· <a href="mailto:' + esc(contact.email) + '">' + esc(contact.email) + '</a>' : ''}` : '—'}</dd>
            <dt>Entreprise</dt><dd>${org ? `<a href="#/contacts/${org.id}" data-close>${esc(org.name)}</a>` : '—'}</dd>
            <dt>${esc(act.amountLabel)}</dt><dd>${eur(d.amount)}</dd>
            <dt>Canal</dt><dd>${esc(d.channel || '—')}${d.campaign ? ` <span class="pill">${esc(d.campaign)}</span>` : ''}</dd>
            <dt>Apporteur</dt><dd>${refOrg ? esc(refOrg.name) : refC ? esc(contactName(refC)) : '—'}</dd>
            ${act.fields.map(f => { const v = d.fields?.[f.key]; if (v === undefined || v === '' || v === null || v === false) return ''; return `<dt>${esc(f.label)}</dt><dd>${f.type === 'checkbox' ? 'Oui' : f.type === 'date' ? fmtDate(v) : f.type === 'number' && /€/.test(f.label) ? eur(v) : esc(v)}</dd>`; }).join('')}
          </dl></div>
          <div class="section"><h3>Historique</h3>
            <form id="note-form" style="display:flex;gap:8px;margin-bottom:10px"><input class="filter-input" style="flex:1" name="body" placeholder="Ajouter une note (appel, échange, décision…)" required><button class="btn sm">Ajouter</button></form>
            <div class="timeline">${events.length ? events.map(e => `<div class="tl ${e.kind}"><div class="meta">${fmtDateTime(e.created_at)} · ${esc(userName(e.author_id))}</div>${esc(e.body)}</div>`).join('') : '<div class="empty">Aucun échange enregistré</div>'}</div>
          </div>
        </div>
        <div>
          <div class="section"><h3 style="display:flex;justify-content:space-between;align-items:center">Activités <button class="btn sm" id="d-add-act">+ Activité</button></h3>
            <div style="display:flex;flex-direction:column;gap:8px" id="d-acts">${acts.length ? acts.map(a => activityRowHtml(a)).join('') : '<div class="empty">Aucune activité</div>'}</div>
          </div>
          ${documentsSection('deals', id)}
        </div>
      </div>`;
    const m = openModal(d.title, html, { wide: true, onClose: () => onChange?.() });
    const refresh = () => { render(); onChange?.(); };
    m.querySelectorAll('[data-stage]').forEach(b => b.onclick = async () => { const dd = db.byId('deals', id); const st = stageOf(dd.activity, b.dataset.stage); if (dd.status === 'lost') return toast('Réouvrez l\'affaire avant de changer d\'étape', 'warn'); if (dd.status === 'won' && !st.delivery) return toast('Affaire gagnée : réouvrez-la pour revenir à une étape commerciale', 'warn'); await moveStage(dd, b.dataset.stage); refresh(); });
    m.querySelector('#d-won')?.addEventListener('click', async () => { await setWon(db.byId('deals', id)); refresh(); });
    m.querySelector('#d-lost')?.addEventListener('click', () => setLost(db.byId('deals', id), refresh, render));
    m.querySelector('#d-reopen')?.addEventListener('click', async () => { await reopen(db.byId('deals', id)); refresh(); });
    m.querySelector('#d-edit').onclick = () => dealForm(d.activity, db.byId('deals', id), {}, (nid) => { if (nid) refresh(); else { onChange?.(); } }, render);
    const addAct = () => activityForm({ deal_id: id, contact_id: d.contact_id || null, organisation_id: d.organisation_id || null }, null, refresh, render);
    m.querySelector('#d-add-act').onclick = addAct;
    m.querySelector('#d-add-act-inline')?.addEventListener('click', e => { e.preventDefault(); addAct(); });
    m.querySelector('#note-form').onsubmit = async e => { e.preventDefault(); const body = e.target.body.value.trim(); if (!body) return; await logEvent(d, 'note', body); refresh(); };
    bindActivityRows(m.querySelector('#d-acts'), refresh, render);
    bindDocuments(m, 'deals', id, render);
  };
  render();
}
