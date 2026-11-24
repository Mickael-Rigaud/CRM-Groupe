// Module Gestion locative : lots, baux / locataires, suivi mensuel des loyers (reprend le suivi Excel),
// import de relevé bancaire, documents (quittance, relance, attestation). Accessible avec le droit rental_access
// (Stéphanie) ou l'accès patrimoine (Mickael).
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, num, pct, openModal, closeModal, renderForm, readForm, toast, fmtDate, confirm, csvDownload, isoDay, daysSince, terms, hit, searchInput, bindSearch, restoreFocus, pickState, pickInit, multiPick, pickChips, bindMultiPick } from '../ui.js';
import { documentsSection, bindDocuments } from '../documents.js';

const eur2 = (n) => eur(n, { maximumFractionDigits: 2 });
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const monthLabel = (k) => k ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : '';
const shiftMonth = (k, n) => { const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const lastDay = (k) => { const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0); return isoDay(d); };
const propName = (id) => db.byId('properties', id)?.name || '—';
const unitOf = (l) => l.unit_id ? db.byId('units', l.unit_id) : null;
const lotName = (l) => unitOf(l)?.name || l.lot || '';
const unitSort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name), 'fr', { numeric: true });
// Biens proposés dans les sélecteurs de la gestion locative : ceux qui ont au moins un lot ou un bail
const propItems = () => db.t('properties').filter(p => db.t('units').some(u => u.property_id === p.id) || db.t('leases').some(l => l.property_id === p.id))
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(p => { const n = db.t('units').filter(u => u.property_id === p.id && u.active !== false).length; return { id: p.id, name: p.name, sub: [p.city, n ? `${n} lot${n > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') }; });
const LEASE_TYPES = [['vide', 'Location vide'], ['meuble', 'Location meublée'], ['colocation', 'Colocation'], ['commercial', 'Bail commercial'], ['professionnel', 'Bail professionnel'], ['autre', 'Autre']];
const MODES = ['Virement', 'Chèque', 'Espèce', 'Prélèvement', 'CAF seule'];
const UNIT_TYPES = ['Studio', 'T1', 'T2', 'T3', 'T4', 'T5', 'Maison', 'Local commercial', 'Bureaux', 'Parking', 'Cave', 'Autre'];
const denied = (root) => { root.innerHTML = '<div class="card"><div class="empty">Module réservé aux profils ayant l\'accès « gestion locative ».</div></div>'; return {}; };

// ---------- Calculs ----------
export function activeInMonth(l, k) {
  const start = (l.start_date || '0000-01').slice(0, 7); const end = l.end_date ? l.end_date.slice(0, 7) : '9999-12';
  return start <= k && end >= k;
}
export function rowOf(leaseId, k) { return db.t('rent_payments').find(x => x.lease_id === leaseId && x.month === k); }
export function dueOf(l, row) { return row && row.due != null ? Number(row.due) : (Number(l.rent) || 0) + (Number(l.charges) || 0); }
export function receivedOf(row) { return row ? (row.apl != null || row.tenant_paid != null ? (Number(row.apl) || 0) + (Number(row.tenant_paid) || 0) : Number(row.amount) || 0) : 0; }
// Solde cumulé (dette locataire) jusqu'au mois k inclus (k = null → tout)
export function balanceOf(leaseId, k = null) {
  return db.t('rent_payments').filter(x => x.lease_id === leaseId && (!k || x.month.slice(0, 7) <= k))
    .reduce((s, x) => s + (Number(x.due) || 0) - receivedOf(x) + (Number(x.adjustment) || 0), 0);
}
export const round2 = (n) => Math.round(n * 100) / 100;

async function upsertRow(l, k, patch) {
  const row = rowOf(l.id, k);
  if (row) return db.update('rent_payments', row.id, { ...patch, amount: receivedOf({ ...row, ...patch }) });
  const base = { lease_id: l.id, month: k, due: dueOf(l, null), apl: Number(l.apl) || 0, tenant_paid: 0, mode: l.payment_mode || null, adjustment: 0, ...patch };
  return db.insert('rent_payments', { ...base, amount: receivedOf(base) });
}
// Prépare les lignes du mois pour tous les baux actifs (dû = loyer + charges, APL prévue)
async function prepareMonth(k) {
  let n = 0;
  for (const l of db.t('leases').filter(l => l.active !== false && activeInMonth(l, k))) if (!rowOf(l.id, k)) { await upsertRow(l, k, {}); n++; }
  return n;
}

// ---------- Formulaires ----------
export function unitForm(existing = null, presets = {}, onSaved, onClose = null) {
  const props = db.t('properties');
  const spec = [
    { key: 'property_id', label: 'Immeuble / bien', type: 'select', options: props.map(p => [p.id, p.name]), required: true, half: true },
    { key: 'name', label: 'Lot (n°, lettre, étage)', type: 'text', required: true, half: true, placeholder: 'Ex. A, 3, 290 bis' },
    { key: 'unit_type', label: 'Type', type: 'select', options: UNIT_TYPES, half: true },
    { key: 'surface', label: 'Surface (m²)', type: 'number', half: true, step: '0.1' },
    { key: 'dpe', label: 'DPE (énergie)', type: 'select', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Vierge'], half: true },
    { key: 'ges', label: 'GES', type: 'select', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], half: true },
    { key: 'water_flat', label: 'Forfait eau inclus', type: 'checkbox', hint: 'Oui', half: true },
    { key: 'sort_order', label: 'Ordre d\'affichage', type: 'number', half: true },
    { key: 'active', label: 'Lot en service', type: 'checkbox', hint: 'Actif', half: true, value: true },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ];
  const m = openModal(existing ? 'Modifier le lot' : 'Nouveau lot', `<form class="form" id="uf">${renderForm(spec, existing || { active: true, ...presets })}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="uf-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { onClose });
  const form = m.querySelector('#uf');
  form.onsubmit = async e => {
    e.preventDefault(); const v = readForm(form, spec);
    try { let id = existing?.id; if (existing) await db.update('units', id, v); else id = (await db.insert('units', v)).id; closeModal(true); toast('Lot enregistré'); onSaved?.(id); }
    catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#uf-del')?.addEventListener('click', async () => {
    if (db.t('leases').some(l => l.unit_id === existing.id)) return toast('Ce lot a des baux : supprimez-les ou archivez le lot (décochez « en service »)', 'warn');
    if (!await confirm('Supprimer ce lot ?')) return; await db.remove('units', existing.id); closeModal(true); onSaved?.(null);
  });
}

export function leaseForm(existing = null, presets = {}, onSaved, onClose = null) {
  const props = db.t('properties'); const units = db.t('units').filter(u => u.active !== false);
  const unitOpts = units.sort((a, b) => propName(a.property_id).localeCompare(propName(b.property_id)) || unitSort(a, b)).map(u => [u.id, `${propName(u.property_id)} — lot ${u.name}${u.unit_type ? ' (' + u.unit_type + ')' : ''}`]);
  const spec = [
    { key: 'unit_id', label: 'Lot', type: 'select', options: unitOpts, half: true, hint: 'Choisir le lot ; le bien se remplit automatiquement' },
    { key: 'property_id', label: 'Bien', type: 'select', options: props.map(p => [p.id, p.name]), required: true, half: true },
    { key: 'tenant', label: 'Locataire(s)', type: 'text', required: true, half: true },
    { key: 'lease_type', label: 'Type de bail', type: 'select', options: LEASE_TYPES, half: true, value: 'vide' },
    { key: 'tenant_phone', label: 'Téléphone', type: 'tel', half: true },
    { key: 'tenant_email', label: 'Email', type: 'email', half: true },
    { key: 'guardian_name', label: 'Tutelle / curatelle / garant — nom', type: 'text', half: true },
    { key: 'guardian_phone', label: 'Tutelle — téléphone', type: 'tel', half: true },
    { key: 'guardian_email', label: 'Tutelle — email', type: 'email', half: true },
    { key: 'payment_mode', label: 'Mode de paiement', type: 'select', options: MODES, half: true },
    { key: 'rent', label: 'Loyer hors charges (€/mois)', type: 'number', required: true, half: true, step: '0.01' },
    { key: 'charges', label: 'Charges (€/mois)', type: 'number', half: true, step: '0.01', value: 0 },
    { key: 'apl', label: 'APL / CAF attendue (€/mois)', type: 'number', half: true, step: '0.01', value: 0 },
    { key: 'deposit', label: 'Dépôt de garantie (€)', type: 'number', half: true },
    { key: 'start_date', label: 'Entrée du locataire', type: 'date', half: true },
    { key: 'end_date', label: 'Sortie (si bail terminé)', type: 'date', half: true },
    { key: 'payment_day', label: 'Jour de paiement prévu', type: 'number', half: true },
    { key: 'revision_date', label: 'Prochaine révision de loyer (IRL)', type: 'date', half: true },
    { key: 'irl_ref', label: 'Trimestre IRL de référence', type: 'text', half: true, placeholder: 'Ex. T2 2025' },
    { key: 'active', label: 'Bail en cours', type: 'checkbox', hint: 'Actif', half: true, value: true },
    { key: 'comments', label: 'Consignes / commentaires', type: 'textarea', rows: 2, hint: 'Ex. « en cas de problème appeler les parents », « paiement par la curatelle »' },
  ];
  const vals = existing || { active: true, lease_type: 'vide', ...presets };
  const m = openModal(existing ? 'Modifier le bail' : 'Nouveau bail', `<form class="form" id="bf">${renderForm(spec, vals)}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="bf-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true, onClose });
  const form = m.querySelector('#bf');
  form.querySelector('[name="unit_id"]').onchange = e => { const u = db.byId('units', e.target.value); if (u) form.querySelector('[name="property_id"]').value = u.property_id; };
  form.onsubmit = async e => {
    e.preventDefault(); const v = readForm(form, spec);
    for (const k of ['start_date', 'end_date', 'revision_date']) if (!v[k]) v[k] = null;
    if (!v.unit_id) v.unit_id = null; if (v.unit_id) v.lot = db.byId('units', v.unit_id)?.name || null;
    if (v.end_date && v.end_date <= isoDay()) v.active = false;
    try { let id = existing?.id; if (existing) await db.update('leases', id, v); else id = (await db.insert('leases', v)).id; closeModal(true); toast('Bail enregistré'); onSaved?.(id); }
    catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#bf-del')?.addEventListener('click', async () => {
    if (!await confirm('Supprimer ce bail et tout son historique de loyers ?')) return;
    for (const x of db.t('rent_payments').filter(x => x.lease_id === existing.id)) await db.remove('rent_payments', x.id);
    await db.remove('leases', existing.id); closeModal(true); toast('Bail supprimé'); onSaved?.(null);
  });
}

// ---------- Fiche bail ----------
export function openLease(id, onChange) {
  const render = () => {
    const l = db.byId('leases', id); if (!l) return closeModal();
    const u = unitOf(l); const bal = balanceOf(id);
    const rows = db.t('rent_payments').filter(x => x.lease_id === id).sort((a, b) => b.month.localeCompare(a.month));
    const html = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div><span class="pill ${l.active === false ? '' : 'ok'}">${l.active === false ? 'Bail terminé' : 'Bail en cours'}</span> <span class="pill info">${esc(LEASE_TYPES.find(t => t[0] === l.lease_type)?.[1] || l.lease_type || '')}</span> ${bal > 0.005 ? `<span class="pill bad">Reste à récupérer ${eur2(bal)}</span>` : bal < -0.005 ? `<span class="pill info">Trop-perçu ${eur2(-bal)}</span>` : '<span class="pill ok">À jour</span>'}
          <div class="muted small" style="margin-top:4px">${esc(propName(l.property_id))} · lot ${esc(lotName(l))}${u?.unit_type ? ' · ' + esc(u.unit_type) : ''}${u?.surface ? ' · ' + num(u.surface) + ' m²' : ''} · entrée ${fmtDate(l.start_date)}${l.end_date ? ' · sortie ' + fmtDate(l.end_date) : ''}</div></div>
        <div class="toolbar"><button class="btn sm" data-doc="quittance">Quittance</button><button class="btn ghost sm" data-doc="relance">Relance impayé</button><button class="btn ghost sm" data-doc="attestation">Attestation</button>${l.active !== false ? '<button class="btn ghost sm" id="lz-close">Clôturer le bail</button>' : ''}<button class="btn ghost sm" id="lz-edit">✎ Modifier</button></div>
      </div>
      <div class="detail">
        <div>
          <div class="section"><h3>Locataire</h3><dl>
            <dt>Nom</dt><dd>${esc(l.tenant)}</dd>
            <dt>Téléphone</dt><dd>${l.tenant_phone ? `<a href="tel:${esc(l.tenant_phone)}">${esc(l.tenant_phone)}</a>` : '—'}</dd>
            <dt>Email</dt><dd>${l.tenant_email ? `<a href="mailto:${esc(l.tenant_email)}">${esc(l.tenant_email)}</a>` : '—'}</dd>
            ${l.guardian_name || l.guardian_phone || l.guardian_email ? `<dt>Tutelle / garant</dt><dd>${esc([l.guardian_name, l.guardian_phone, l.guardian_email].filter(Boolean).join(' · '))}</dd>` : ''}
            <dt>Loyer</dt><dd>${eur2(l.rent)} + ${eur2(l.charges || 0)} de charges = <b>${eur2((Number(l.rent) || 0) + (Number(l.charges) || 0))}</b>/mois${Number(l.apl) ? ` · dont APL ${eur2(l.apl)}` : ''}</dd>
            <dt>Paiement</dt><dd>${esc(l.payment_mode || '—')}${l.payment_day ? ` · le ${l.payment_day}` : ''}</dd>
            <dt>Dépôt de garantie</dt><dd>${l.deposit ? eur2(l.deposit) : '—'}</dd>
            <dt>Révision IRL</dt><dd>${l.revision_date ? fmtDate(l.revision_date) : '—'}${l.irl_ref ? ' · ' + esc(l.irl_ref) : ''}</dd>
            ${l.comments ? `<dt>Consignes</dt><dd style="font-weight:400">${esc(l.comments)}</dd>` : ''}
          </dl></div>
          ${documentsSection('leases', id, { title: 'Documents du bail' })}
        </div>
        <div>
          <div class="section"><h3>Historique des loyers (${rows.length})</h3>
            <div class="table-wrap" style="max-height:360px;overflow:auto"><table><thead><tr><th>Mois</th><th class="num">Dû</th><th class="num">APL</th><th class="num">Locataire</th><th class="num">Reçu</th><th class="num">Écart</th><th>Note</th></tr></thead><tbody>
            ${rows.map(x => { const rec = receivedOf(x); const gap = (Number(x.due) || 0) - rec + (Number(x.adjustment) || 0); return `<tr><td class="nowrap">${x.month.endsWith('adj') ? 'Reprise solde' : monthLabel(x.month)}</td><td class="num">${eur2(x.due)}</td><td class="num">${eur2(x.apl)}</td><td class="num">${eur2(x.tenant_paid ?? x.amount)}</td><td class="num"><b>${eur2(rec)}</b></td><td class="num ${gap > 0.005 ? 'status-lost' : gap < -0.005 ? 'status-won' : ''}">${gap ? eur2(gap) : ''}</td><td class="small muted">${esc(x.note || '')}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Aucune ligne</td></tr>'}
            </tbody></table></div></div>
        </div>
      </div>`;
    const m = openModal(`${l.tenant} — ${propName(l.property_id)} · lot ${lotName(l)}`, html, { wide: true, onClose: () => onChange?.() });
    const refresh = () => { render(); onChange?.(); };
    m.querySelector('#lz-edit').onclick = () => leaseForm(l, {}, (nid) => nid ? refresh() : onChange?.(), render);
    m.querySelector('#lz-close')?.addEventListener('click', async () => {
      const d = prompt('Date de sortie du locataire (AAAA-MM-JJ) :', isoDay()); if (!d) return;
      await db.update('leases', id, { end_date: d, active: false }); toast('Bail clôturé'); refresh();
    });
    m.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => generateDocument(b.dataset.doc, l));
    bindDocuments(m, 'leases', id, render);
  };
  render();
}

// ---------- Documents générés (impression / PDF) ----------
function landlord() { return db.setting('rental_landlord') || {}; }
export function generateDocument(kind, l, k = null) {
  const p = db.byId('properties', l.property_id) || {}; const ld = landlord();
  const month = k || isoDay().slice(0, 7); const row = rowOf(l.id, month);
  const due = dueOf(l, row); const rec = receivedOf(row); const bal = balanceOf(l.id);
  const addr = [p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const bailleur = `<b>${esc(p.holding_name || ld.name || 'Le bailleur')}</b><br>${esc(ld.address || '')}${ld.phone ? '<br>' + esc(ld.phone) : ''}${ld.email ? '<br>' + esc(ld.email) : ''}`;
  const locataire = `<b>${esc(l.tenant)}</b><br>${esc(addr)}${lotName(l) ? ' — lot ' + esc(lotName(l)) : ''}`;
  const today = fmtDate(isoDay());
  let title = '', body = '';
  if (kind === 'quittance') {
    if (rec + 0.005 < due) { if (!confirm(`Le loyer de ${monthLabel(month)} n'est pas intégralement réglé (${eur2(rec)} reçu sur ${eur2(due)}). Une quittance ne peut être délivrée que pour un loyer soldé. Générer un reçu de paiement partiel à la place ?`)) return; title = 'REÇU DE PAIEMENT PARTIEL'; }
    else title = 'QUITTANCE DE LOYER';
    body = `<p>Période : <b>${monthLabel(month)}</b> (du 1er au ${lastDay(month).slice(8)} ${monthLabel(month)})</p>
      <table><tr><td>Loyer hors charges</td><td class="r">${eur2(l.rent)}</td></tr><tr><td>Provisions pour charges</td><td class="r">${eur2(l.charges || 0)}</td></tr><tr><th>Total dû</th><th class="r">${eur2(due)}</th></tr><tr><td>Montant reçu${row?.apl ? ` (dont APL ${eur2(row.apl)})` : ''}</td><td class="r">${eur2(rec)}</td></tr></table>
      <p>${title === 'QUITTANCE DE LOYER' ? `Je soussigné(e), bailleur du logement désigné ci-dessus, déclare avoir reçu de ${esc(l.tenant)} la somme de <b>${eur2(rec)}</b> au titre du loyer et des charges pour la période indiquée, et lui en donne quittance, sous réserve de tous mes droits.` : `Je soussigné(e), bailleur du logement désigné ci-dessus, déclare avoir reçu de ${esc(l.tenant)} la somme de <b>${eur2(rec)}</b> à valoir sur le loyer et les charges de la période indiquée. Reste dû sur cette période : <b>${eur2(due - rec)}</b>. Ce reçu ne vaut pas quittance.`}</p>
      <p class="small">Cette quittance annule tous les reçus qui auraient pu être établis pour acomptes versés au titre de la période. Elle est délivrée sans frais conformément à l'article 21 de la loi n° 89-462 du 6 juillet 1989.</p>`;
  } else if (kind === 'relance') {
    title = 'RAPPEL DE LOYER IMPAYÉ';
    body = `<p>Objet : <b>loyer(s) et charges impayés — mise en demeure amiable</b></p>
      <p>Madame, Monsieur,</p>
      <p>Sauf erreur ou omission de notre part, nous constatons qu'à ce jour le solde de votre compte locataire pour le logement désigné ci-dessus présente un <b>retard de ${eur2(bal)}</b>${row ? ` (loyer de ${monthLabel(month)} : ${eur2(due)} dû, ${eur2(rec)} reçu)` : ''}.</p>
      <p>Nous vous demandons de régulariser cette situation <b>sous 8 jours</b> à compter de la réception de ce courrier, par virement ou tout autre moyen convenu. Si vous rencontrez des difficultés, contactez-nous rapidement afin de convenir d'un échéancier.</p>
      <p>À défaut de règlement dans ce délai, nous nous verrons contraints d'engager les démarches prévues au bail et par la loi (commandement de payer, saisine de la CAF le cas échéant, recouvrement).</p>
      <p>Nous vous prions d'agréer, Madame, Monsieur, nos salutations distinguées.</p>`;
  } else {
    title = 'ATTESTATION DE LOYER';
    body = `<p>Je soussigné(e), bailleur du logement désigné ci-dessus, atteste que <b>${esc(l.tenant)}</b> est locataire de ce logement depuis le <b>${fmtDate(l.start_date)}</b>${l.end_date ? ` jusqu'au ${fmtDate(l.end_date)}` : ''}, pour un loyer mensuel de <b>${eur2(l.rent)}</b> hors charges${Number(l.charges) ? ` et ${eur2(l.charges)} de charges` : ''}.</p>
      <p>${bal > 0.005 ? `À la date de ce jour, le compte du locataire présente un solde restant dû de ${eur2(bal)}.` : 'À la date de ce jour, le locataire est à jour de ses loyers et charges.'}</p>
      <p>Attestation établie pour servir et valoir ce que de droit.</p>`;
  }
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title} — ${esc(l.tenant)}</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#11151C;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.5;font-size:14px}h1{font-size:20px;letter-spacing:.04em;margin:28px 0 18px;text-align:center}
    .parties{display:flex;justify-content:space-between;gap:24px;margin-bottom:24px}.parties div{flex:1}.small{font-size:11px;color:#59636F}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{padding:6px 8px;border-bottom:1px solid #E5E8ED;text-align:left}.r{text-align:right}
    .sig{margin-top:40px;display:flex;justify-content:space-between}.print{position:fixed;top:12px;right:12px;padding:8px 14px;border:0;border-radius:8px;background:#1A1D23;color:#fff;font-weight:600;cursor:pointer}@media print{.print{display:none}}</style></head><body>
    <button class="print" onclick="window.print()">Imprimer / enregistrer en PDF</button>
    <div class="parties"><div>${bailleur}</div><div style="text-align:right">${locataire}</div></div>
    <p>Fait le ${today}</p><h1>${title}</h1><p><b>Logement :</b> ${esc(addr)}${lotName(l) ? ' — lot ' + esc(lotName(l)) : ''}</p>${body}
    <div class="sig"><div></div><div>Le bailleur,<br><br><br>${esc(p.holding_name || ld.name || '')}</div></div></body></html>`);
  w.document.close();
}

function landlordForm(onSaved) {
  const v = landlord();
  const spec = [{ key: 'name', label: 'Nom du bailleur (tel qu\'il apparaît sur les documents)', type: 'text', required: true }, { key: 'address', label: 'Adresse', type: 'text' }, { key: 'phone', label: 'Téléphone', type: 'tel', half: true }, { key: 'email', label: 'Email', type: 'email', half: true }];
  const m = openModal('Coordonnées du bailleur (quittances, courriers)', `<form class="form" id="llf">${renderForm(spec, v)}<div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div></form>`);
  m.querySelector('#llf').onsubmit = async e => {
    e.preventDefault(); const val = readForm(e.target, spec);
    try { if (db.setting('rental_landlord') !== undefined) await db.update('settings', 'rental_landlord', { value: val }); else await db.insert('settings', { key: 'rental_landlord', value: val }); closeModal(true); toast('Coordonnées enregistrées'); onSaved?.(); }
    catch (err) { toast(err.message + ' (réservé à la direction)', 'err'); }
  };
}

// ---------- Import d'un relevé bancaire (CSV) ----------
const stripAcc = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase();
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(x => x.trim()); if (!lines.length) return [];
  const sep = [';', ',', '\t'].map(s => [s, (lines[0].match(new RegExp('\\' + s, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const split = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
  const rows = lines.map(split);
  const toNum = (s) => { const t = String(s).replace(/\s|€/g, '').replace(',', '.'); return /^[-+]?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
  const isDate = (s) => /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$|^\d{4}-\d{2}-\d{2}/.test(String(s));
  const out = [];
  for (const r of rows) {
    const dateIdx = r.findIndex(isDate); if (dateIdx < 0) continue;
    const nums = r.map((c, i) => [i, toNum(c)]).filter(([i, v]) => i !== dateIdx && v !== null && Math.abs(v) < 1e7);
    if (!nums.length) continue;
    // Montant : colonne « crédit » (dernier nombre positif) ou montant signé
    const credit = nums.filter(([, v]) => v > 0).pop(); const amount = credit ? credit[1] : nums[nums.length - 1][1];
    const label = r.filter((c, i) => i !== dateIdx && toNum(c) === null).sort((a, b) => b.length - a.length)[0] || '';
    out.push({ date: r[dateIdx], amount, label });
  }
  return out;
}
function bankImport(k, onDone) {
  const leases = db.t('leases').filter(l => l.active !== false && activeInMonth(l, k));
  const m = openModal(`Importer un relevé bancaire — ${monthLabel(k)}`, `
    <p class="small muted">Exportez depuis le site de la banque le relevé du compte qui reçoit les loyers (format CSV). Le CRM ne garde que les crédits et les rapproche des locataires par nom puis par montant. Vérifiez, corrigez si besoin, puis validez.</p>
    <label class="btn"><input type="file" accept=".csv,.txt" hidden id="bk-file"> Choisir le fichier CSV</label>
    <div id="bk-result" style="margin-top:14px"></div>`, { wide: true });
  m.querySelector('#bk-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text(); const ops = parseCsv(text).filter(x => x.amount > 0);
    if (!ops.length) return toast('Aucun crédit trouvé dans ce fichier', 'warn');
    const match = ops.map(op => {
      const L = stripAcc(op.label);
      let lease = leases.find(l => stripAcc(l.tenant).split(/[\s\/,-]+/).filter(t => t.length >= 4).some(t => L.includes(t)));
      let how = lease ? 'nom' : '';
      if (!lease) { const cands = leases.filter(l => Math.abs(dueOf(l, rowOf(l.id, k)) - op.amount) < 0.01 || Math.abs((Number(l.rent) || 0) - op.amount) < 0.01); if (cands.length === 1) { lease = cands[0]; how = 'montant'; } }
      const isCaf = /\bCAF\b|ALLOCATION|MSA/.test(L);
      return { ...op, lease, how, kind: isCaf ? 'apl' : 'tenant', keep: !!lease };
    });
    m.querySelector('#bk-result').innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>Date</th><th>Libellé</th><th class="num">Montant</th><th>Locataire</th><th>Type</th></tr></thead><tbody>
      ${match.map((x, i) => `<tr><td><input type="checkbox" data-i="${i}" ${x.keep ? 'checked' : ''}></td><td class="nowrap">${esc(x.date)}</td><td class="small">${esc(x.label.slice(0, 60))}</td><td class="num"><b>${eur2(x.amount)}</b></td>
        <td><select data-l="${i}"><option value="">— non rapproché —</option>${leases.map(l => `<option value="${l.id}" ${x.lease?.id === l.id ? 'selected' : ''}>${esc(l.tenant)} · ${esc(propName(l.property_id))} ${esc(lotName(l))}</option>`).join('')}</select>${x.how ? `<div class="small muted">rapproché par ${x.how}</div>` : ''}</td>
        <td><select data-k="${i}"><option value="tenant" ${x.kind === 'tenant' ? 'selected' : ''}>Locataire</option><option value="apl" ${x.kind === 'apl' ? 'selected' : ''}>APL / CAF</option></select></td></tr>`).join('')}
      </tbody></table></div><div class="form-actions"><span class="muted small">${match.filter(x => x.keep).length} rapproché(s) sur ${match.length} crédit(s)</span><span class="grow"></span><button class="btn" id="bk-save">Enregistrer les encaissements de ${monthLabel(k)}</button></div>`;
    m.querySelector('#bk-save').onclick = async () => {
      let n = 0;
      for (let i = 0; i < match.length; i++) {
        if (!m.querySelector(`[data-i="${i}"]`).checked) continue;
        const lid = m.querySelector(`[data-l="${i}"]`).value; if (!lid) continue;
        const kind = m.querySelector(`[data-k="${i}"]`).value; const l = db.byId('leases', lid); const row = rowOf(lid, k);
        const patch = kind === 'apl' ? { apl: round2((Number(row?.apl) || 0) + match[i].amount) } : { tenant_paid: round2((Number(row?.tenant_paid) || 0) + match[i].amount) };
        patch.note = [row?.note, `${match[i].date} ${match[i].label.slice(0, 40)}`].filter(Boolean).join(' · ');
        if (!row || !row.mode) patch.mode = 'Virement';
        await upsertRow(l, k, patch); n++;
      }
      closeModal(true); toast(`${n} encaissement(s) enregistré(s)`); onDone?.();
    };
  };
}

// ======================================================================
//  Page principale : suivi mensuel (réplique du suivi Excel)
// ======================================================================

export const locatifPage = {
  title: () => 'Gestion locative — suivi des loyers',
  render(root) {
    if (!scope.canRental) return denied(root);
    const state = { month: isoDay().slice(0, 7), q: '', focus: null };
    const pick = pickState('crm_locatif_props');
    let prepared = new Set();
    const drawInner = async () => {
      const k = state.month;
      if (!prepared.has(k) && k <= isoDay().slice(0, 7)) { prepared.add(k); try { const n = await prepareMonth(k); if (n) toast(`${n} ligne(s) préparée(s) pour ${monthLabel(k)}`); } catch (err) { toast('Préparation du mois : ' + err.message, 'err'); } }
      const items = propItems();
      const props = pickInit(pick, items).map(i => db.byId('properties', i.id));
      const allLeases = db.t('leases');
      const qt = terms(state.q);
      const groups = props.map(p => {
        const units = db.t('units').filter(u => u.property_id === p.id && u.active !== false).sort(unitSort);
        const lines = [];
        const leasesP = allLeases.filter(l => l.property_id === p.id && activeInMonth(l, k) && (l.active !== false || (l.end_date && l.end_date.slice(0, 7) >= k)));
        for (const u of units) {
          const ls = leasesP.filter(l => l.unit_id === u.id);
          if (ls.length) ls.forEach(l => lines.push({ u, l })); else lines.push({ u, l: null });
        }
        for (const l of leasesP.filter(l => !l.unit_id || !units.some(u => u.id === l.unit_id))) lines.push({ u: null, l });
        // Recherche : lot, locataire, contact, mode de paiement, commentaire du mois, immeuble
        const kept = qt.length ? lines.filter(({ u, l }) => { const row = l ? rowOf(l.id, k) : null; return hit([p.name, p.city, u?.name, u?.unit_type, l?.tenant, l?.lot, l?.tenant_phone, l?.tenant_email, l?.guardian_name, row?.note, row?.mode, l ? '' : 'vacant'], qt); }) : lines;
        return { p, lines: kept };
      }).filter(g => g.lines.length);
      const zero = () => ({ due: 0, apl: 0, tenant: 0, rec: 0, missing: 0, prev: 0, bal: 0, vacant: 0, leases: 0 });
      const tot = zero(); let sub = zero();
      const line = ({ u, l }) => {
        if (!l) { tot.vacant++; sub.vacant++; return `<tr class="vacant"><td><b>${esc(u.name)}</b><div class="small muted">${esc([u.unit_type, u.surface ? num(u.surface) + ' m²' : '', u.dpe ? 'DPE ' + u.dpe : ''].filter(Boolean).join(' · '))}</div></td><td colspan="11" class="muted"><span class="pill warn">Vacant</span> <button class="btn ghost sm" data-newlease="${u.id}">+ Bail</button></td><td></td></tr>`; }
        const row = rowOf(l.id, k); const due = dueOf(l, row); const apl = Number(row?.apl) || 0; const tp = Number(row?.tenant_paid ?? (row?.amount ?? 0)) || 0; const rec = apl + tp;
        const missing = round2(due - rec); const prev = round2(balanceOf(l.id, shiftMonth(k, -1))); const bal = round2(balanceOf(l.id, k));
        for (const t of [tot, sub]) { t.due += due; t.apl += apl; t.tenant += tp; t.rec += rec; t.missing += missing; t.prev += prev; t.bal += bal; t.leases++; }
        const inp = (name, val, w = 70) => `<input type="number" step="0.01" class="cell-in" style="width:${w}px" data-lease="${l.id}" data-f="${name}" value="${val ?? ''}">`;
        return `<tr>
          <td><b>${esc(u?.name || l.lot || '')}</b><div class="small muted">${esc([u?.unit_type, u?.surface ? num(u.surface) + ' m²' : '', u?.dpe ? 'DPE ' + u.dpe : ''].filter(Boolean).join(' · '))}</div></td>
          <td><a href="#" data-open="${l.id}"><b>${esc(l.tenant)}</b></a><div class="small muted">${l.start_date ? 'entré le ' + fmtDate(l.start_date) : ''}${l.end_date && l.end_date.slice(0, 7) === k ? ' · <span class="status-lost">sortie le ' + fmtDate(l.end_date) + '</span>' : ''}</div></td>
          <td class="num">${eur2(l.rent)}</td><td class="num">${eur2(l.charges || 0)}</td>
          <td class="num">${inp('due', due, 80)}</td>
          <td class="num">${inp('apl', apl)}</td><td class="num">${inp('tenant_paid', tp)}</td>
          <td class="num"><b>${eur2(rec)}</b></td>
          <td><select class="cell-in" data-lease="${l.id}" data-f="mode"><option value="">—</option>${MODES.map(x => `<option ${(row?.mode || l.payment_mode) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
          <td class="num ${missing > 0.005 ? 'status-lost' : missing < -0.005 ? 'status-won' : ''}">${missing ? eur2(missing) : '0 €'}</td>
          <td class="num ${prev > 0.005 ? 'status-lost' : prev < -0.005 ? 'status-won' : ''}">${prev ? eur2(prev) : ''}</td>
          <td class="num"><b class="${bal > 0.005 ? 'status-lost' : bal < -0.005 ? 'status-won' : ''}">${bal ? eur2(bal) : '0 €'}</b></td>
          <td><input type="text" class="cell-in" style="width:180px" data-lease="${l.id}" data-f="note" value="${esc(row?.note || '')}" placeholder="Commentaire"></td>
        </tr>`;
      };
      const totalRow = (label, t, cls = 'total') => `<tr class="${cls}"><td colspan="4">${label} <span class="muted small" style="font-weight:400">${t.leases} bail${t.leases > 1 ? 'x' : ''}${t.vacant ? ` · ${t.vacant} vacant${t.vacant > 1 ? 's' : ''}` : ''}${t.due ? ` · encaissé ${pct(t.rec / t.due * 100)}` : ''}</span></td><td class="num">${eur2(t.due)}</td><td class="num">${eur2(t.apl)}</td><td class="num">${eur2(t.tenant)}</td><td class="num">${eur2(t.rec)}</td><td></td><td class="num ${t.missing > 0.005 ? 'status-lost' : ''}">${eur2(t.missing)}</td><td class="num">${eur2(t.prev)}</td><td class="num ${t.bal > 0.005 ? 'status-lost' : ''}">${eur2(t.bal)}</td><td></td></tr>`;
      const body = groups.map(g => { sub = zero(); const rows = g.lines.map(line).join(''); return `<tr class="grp"><td colspan="13"><b>${esc(g.p.name)}</b> <span class="muted small">${esc([g.p.holding_name, g.p.address, g.p.city].filter(Boolean).join(' · '))}</span></td></tr>${rows}${totalRow('Sous-total ' + esc(g.p.name), sub, 'subtotal')}`; }).join('');
      const rate = tot.due ? tot.rec / tot.due * 100 : 0;
      const allPicked = items.length > 0 && items.every(i => pick.sel.has(i.id));
      root.innerHTML = `
        <div class="toolbar">
          <div class="seg"><button data-m="-1">‹</button><button class="active" style="min-width:150px;text-transform:capitalize">${monthLabel(k)}</button><button data-m="1">›</button></div>
          ${multiPick('lo-props', items, pick, { noun: 'bien' })}
          ${searchInput('lo-q', state, 'Rechercher un lot, un locataire, un commentaire…')}
          <button class="btn ghost sm" id="lo-bank">Importer un relevé bancaire</button><button class="btn ghost sm" id="lo-export">Export CSV</button><button class="btn ghost sm" id="lo-landlord">Bailleur</button><button class="btn sm" id="lo-newlease">+ Bail</button>
        </div>
        ${pickChips(items, pick, { q: state.q })}
        <div class="grid c4">
          <div class="card tight kpi"><div class="lbl">Attendu ce mois</div><div class="val">${eur(tot.due)}</div><div class="sub">${tot.leases} bail${tot.leases > 1 ? 'x' : ''} · ${tot.vacant} vacant${tot.vacant > 1 ? 's' : ''}</div></div>
          <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">Reçu</div><div class="val">${eur(tot.rec)}</div><div class="sub">APL ${eur(tot.apl)} · locataires ${eur(tot.tenant)} · ${pct(rate)}</div></div>
          <div class="card tight kpi" style="--kpi:#fee2e2;--kpi-c:var(--red)"><div class="lbl">Manquant ce mois</div><div class="val">${eur(tot.missing)}</div><div class="sub">loyers du mois non soldés</div></div>
          <div class="card tight kpi" style="--kpi:#fef3c7;--kpi-c:var(--amber)"><div class="lbl">Reste à récupérer</div><div class="val">${eur(tot.bal)}</div><div class="sub">cumul retards (dont antérieurs ${eur(tot.prev)})</div></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="rent-sheet"><thead><tr><th>Lot</th><th>Locataire</th><th class="num">Loyer HC</th><th class="num">Charges</th><th class="num">Dû</th><th class="num">APL</th><th class="num">Locataire</th><th class="num">Reçu</th><th>Mode</th><th class="num">Manquant</th><th class="num">Retard ant.</th><th class="num">Reste</th><th>Commentaire</th></tr></thead><tbody>
          ${body || `<tr><td colspan="13" class="empty">${pick.sel.size === 0 ? 'Aucun bien sélectionné — ouvrez le sélecteur de biens.' : state.q ? 'Aucun lot ne correspond à « ' + esc(state.q) + ' ».' : 'Aucun lot. Créez d\'abord les lots dans « Lots » ou importez le suivi Excel.'}</td></tr>`}
          ${body ? totalRow(`Total ${allPicked && !state.q ? 'tous les biens' : props.length + ' bien' + (props.length > 1 ? 's' : '') + (state.q ? ' · résultat filtré' : '')}`, tot) : ''}
        </tbody></table></div><p class="muted small">Saisie directe dans les cases (dû, APL, locataire, mode, commentaire) : enregistrement automatique. « Manquant » = dû − reçu du mois ; « Reste » = manquant + retards antérieurs.${state.q ? ' Les totaux portent sur les lignes filtrées.' : ''}</p></div>`;
      root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { state.month = shiftMonth(state.month, Number(b.dataset.m)); draw(); });
      bindMultiPick(root, 'lo-props', items, pick, draw, state);
      bindSearch(root, 'lo-q', state, draw);
      restoreFocus(root, state);
      root.querySelector('#lo-bank').onclick = () => bankImport(k, draw);
      root.querySelector('#lo-landlord').onclick = () => landlordForm();
      root.querySelector('#lo-newlease').onclick = () => leaseForm(null, {}, draw);
      root.querySelectorAll('[data-newlease]').forEach(b => b.onclick = () => { const u = db.byId('units', b.dataset.newlease); leaseForm(null, { unit_id: u.id, property_id: u.property_id, start_date: k + '-01' }, draw); });
      root.querySelectorAll('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); openLease(a.dataset.open, draw); });
      root.querySelectorAll('.cell-in').forEach(el => el.onchange = async () => {
        const l = db.byId('leases', el.dataset.lease); const f = el.dataset.f; const v = el.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value;
        try { await upsertRow(l, k, { [f]: v }); draw(); } catch (err) { toast(err.message, 'err'); }
      });
      root.querySelector('#lo-export').onclick = () => csvDownload(`loyers-${k}.csv`, groups.flatMap(g => g.lines.filter(x => x.l).map(({ u, l }) => { const row = rowOf(l.id, k); const due = dueOf(l, row); const rec = receivedOf(row); return { immeuble: g.p.name, lot: u?.name || l.lot, locataire: l.tenant, entree: l.start_date, loyer_hc: l.rent, charges: l.charges, du: due, apl: row?.apl || 0, locataire_paye: row?.tenant_paid || 0, recu: rec, mode: row?.mode || '', manquant: round2(due - rec), retard_anterieur: round2(balanceOf(l.id, shiftMonth(k, -1))), reste: round2(balanceOf(l.id, k)), commentaire: row?.note || '' }; })));
    };
    const draw = async () => { try { await drawInner(); } catch (err) { console.error(err); root.innerHTML = `<div class="card"><div class="empty">Erreur d'affichage : ${esc(err.message)}<br><span class="small">Faites une capture de ce message et envoyez-la à Claude.</span></div></div>`; } };
    draw();
    return { refresh: draw };
  },
};

// ======================================================================
//  Baux & locataires
// ======================================================================
export const leasesPage = {
  title: () => 'Baux et locataires',
  render(root) {
    if (!scope.canRental) return denied(root);
    const state = { q: '', status: 'active', focus: null };
    const pick = pickState('crm_locatif_props');
    const draw = () => {
      const items = propItems();
      const props = pickInit(pick, items);
      const qt = terms(state.q);
      const list = db.t('leases').filter(l => (state.status === 'all' || (state.status === 'active') === (l.active !== false)) && pick.sel.has(l.property_id)
        && hit([l.tenant, l.tenant_phone, l.tenant_email, l.guardian_name, l.comments, lotName(l), propName(l.property_id)], qt))
        .sort((a, b) => propName(a.property_id).localeCompare(propName(b.property_id)) || String(lotName(a)).localeCompare(String(lotName(b)), 'fr', { numeric: true }));
      root.innerHTML = `
        <div class="toolbar">${searchInput('lz-q', state, 'Locataire, téléphone, lot, consigne…')}
          ${multiPick('lz-props', items, pick, { noun: 'bien' })}
          <div class="seg">${[['active', 'En cours'], ['ended', 'Terminés'], ['all', 'Tous']].map(([v, t]) => `<button data-s="${v}" class="${state.status === v ? 'active' : ''}">${t}</button>`).join('')}</div>
          <button class="btn ghost sm" id="lz-export">Export CSV</button><button class="btn" id="lz-new">+ Bail</button></div>
        ${pickChips(items, pick, { q: state.q })}
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Immeuble · lot</th><th>Locataire</th><th>Contact</th><th>Tutelle / garant</th><th>Entrée</th><th class="num">Loyer + ch.</th><th class="num">APL</th><th>Mode</th><th class="num">Dépôt</th><th class="num">Reste dû</th><th>Révision</th></tr></thead><tbody>
          ${list.map(l => { const bal = round2(balanceOf(l.id)); const rev = l.revision_date ? daysSince(l.revision_date) : null; return `<tr class="click" data-lease="${l.id}"><td><b>${esc(propName(l.property_id))}</b><div class="small muted">lot ${esc(lotName(l))}</div></td><td><b>${esc(l.tenant)}</b>${l.active === false ? `<div class="small muted">sorti le ${fmtDate(l.end_date)}</div>` : ''}</td><td class="small">${esc(l.tenant_phone || '')}<br>${esc(l.tenant_email || '')}</td><td class="small">${esc([l.guardian_name, l.guardian_phone, l.guardian_email].filter(Boolean).join(' · '))}</td><td class="nowrap">${fmtDate(l.start_date)}</td><td class="num">${eur2((Number(l.rent) || 0) + (Number(l.charges) || 0))}</td><td class="num">${Number(l.apl) ? eur2(l.apl) : ''}</td><td class="small">${esc(l.payment_mode || '')}</td><td class="num">${l.deposit ? eur(l.deposit) : ''}</td><td class="num"><b class="${bal > 0.005 ? 'status-lost' : bal < -0.005 ? 'status-won' : ''}">${bal ? eur2(bal) : ''}</b></td><td class="small ${rev !== null && rev >= -30 ? 'status-lost' : ''}">${l.revision_date ? fmtDate(l.revision_date) : ''}</td></tr>`; }).join('') || `<tr><td colspan="11" class="empty">${state.q || props.length < items.length ? 'Aucun bail ne correspond à la recherche' : 'Aucun bail'}</td></tr>`}
        </tbody></table></div><p class="muted small">${list.length} bail${list.length > 1 ? 'x' : ''} · reste à récupérer ${eur2(list.reduce((s, l) => s + balanceOf(l.id), 0))}</p></div>`;
      bindSearch(root, 'lz-q', state, draw);
      bindMultiPick(root, 'lz-props', items, pick, draw, state);
      restoreFocus(root, state);
      root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { state.status = b.dataset.s; draw(); });
      root.querySelector('#lz-new').onclick = () => leaseForm(null, {}, (id) => { draw(); if (id) openLease(id, draw); });
      root.querySelectorAll('[data-lease]').forEach(tr => tr.onclick = () => openLease(tr.dataset.lease, draw));
      root.querySelector('#lz-export').onclick = () => csvDownload('baux.csv', list.map(l => ({ immeuble: propName(l.property_id), lot: lotName(l), locataire: l.tenant, telephone: l.tenant_phone, email: l.tenant_email, tutelle: l.guardian_name, tutelle_tel: l.guardian_phone, tutelle_email: l.guardian_email, type: l.lease_type, entree: l.start_date, sortie: l.end_date, loyer_hc: l.rent, charges: l.charges, apl: l.apl, mode: l.payment_mode, depot: l.deposit, reste_du: round2(balanceOf(l.id)), revision: l.revision_date, consignes: l.comments })));
    };
    draw();
    return { refresh: draw };
  },
};

// ======================================================================
//  Lots
// ======================================================================
export const unitsPage = {
  title: () => 'Lots et logements',
  render(root) {
    if (!scope.canRental) return denied(root);
    const state = { q: '', focus: null };
    const pick = pickState('crm_locatif_props');
    const draw = () => {
      const k = isoDay().slice(0, 7);
      const items = propItems();
      pickInit(pick, items);
      const qt = terms(state.q);
      const props = db.t('properties').filter(p => pick.sel.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
      const rowsOf = (p) => db.t('units').filter(u => u.property_id === p.id).sort(unitSort)
        .filter(u => { const l = db.t('leases').find(x => x.unit_id === u.id && x.active !== false && activeInMonth(x, k)); return hit([p.name, p.city, u.name, u.unit_type, u.dpe, u.notes, l?.tenant, l ? '' : 'vacant'], qt); });
      const cards = props.map(p => ({ p, units: rowsOf(p) })).filter(x => x.units.length || (!qt.length && scope.canPatrimony));
      const nb = cards.reduce((s, x) => s + x.units.length, 0);
      root.innerHTML = `<div class="toolbar">${searchInput('un-q', state, 'Lot, type, locataire, « vacant »…')}
          ${multiPick('un-props', items, pick, { noun: 'bien' })}
          <span class="muted small grow">${nb} lot${nb > 1 ? 's' : ''} affiché${nb > 1 ? 's' : ''}</span><button class="btn" id="un-new">+ Lot</button></div>
        ${pickChips(items, pick, { q: state.q })}
        ${cards.map(({ p, units }) => `<div class="card"><div class="card-head"><h2>${esc(p.name)}</h2><span class="muted small">${esc([p.holding_name, p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</span></div>
          <div class="table-wrap"><table><thead><tr><th>Lot</th><th>Type</th><th class="num">Surface</th><th>DPE</th><th>GES</th><th>Eau</th><th>Locataire actuel</th><th class="num">Loyer + ch.</th><th></th></tr></thead><tbody>
          ${units.map(u => { const l = db.t('leases').find(x => x.unit_id === u.id && x.active !== false && activeInMonth(x, k)); return `<tr class="${u.active === false ? 'muted' : ''}"><td><b>${esc(u.name)}</b>${u.active === false ? ' <span class="pill">hors service</span>' : ''}</td><td>${esc(u.unit_type || '')}</td><td class="num">${u.surface ? num(u.surface) + ' m²' : ''}</td><td>${u.dpe ? `<span class="pill ${'FG'.includes(u.dpe) ? 'bad' : 'ABC'.includes(u.dpe) ? 'ok' : ''}">${esc(u.dpe)}</span>` : ''}</td><td>${esc(u.ges || '')}</td><td class="small">${u.water_flat === true ? 'forfait' : u.water_flat === false ? 'non' : ''}</td><td>${l ? `<a href="#" data-lease="${l.id}">${esc(l.tenant)}</a>` : '<span class="pill warn">Vacant</span>'}</td><td class="num">${l ? eur2((Number(l.rent) || 0) + (Number(l.charges) || 0)) : ''}</td><td class="right"><button class="btn ghost sm" data-unit="${u.id}">✎</button>${l ? '' : ` <button class="btn ghost sm" data-newlease="${u.id}">+ Bail</button>`}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">Aucun lot</td></tr>'}
          </tbody></table></div></div>`).join('') || `<div class="card"><div class="empty">${qt.length ? 'Aucun lot ne correspond à « ' + esc(state.q) + ' »' : 'Aucun lot — les immeubles se créent dans Patrimoine › Biens'}</div></div>`}`;
      bindSearch(root, 'un-q', state, draw);
      bindMultiPick(root, 'un-props', items, pick, draw, state);
      restoreFocus(root, state);
      root.querySelector('#un-new').onclick = () => unitForm(null, {}, draw);
      root.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => unitForm(db.byId('units', b.dataset.unit), {}, draw));
      root.querySelectorAll('[data-newlease]').forEach(b => b.onclick = () => { const u = db.byId('units', b.dataset.newlease); leaseForm(null, { unit_id: u.id, property_id: u.property_id }, draw); });
      root.querySelectorAll('[data-lease]').forEach(a => a.onclick = e => { e.preventDefault(); openLease(a.dataset.lease, draw); });
    };
    draw();
    return { refresh: draw };
  },
};

// ======================================================================
//  À faire locatif : impayés, vacants, révisions, coordonnées manquantes
// ======================================================================
export const rentalTodoPage = {
  title: () => 'Gestion locative — à faire ce mois',
  render(root) {
    if (!scope.canRental) return denied(root);
    const state = { q: '', focus: null };
    const pick = pickState('crm_locatif_props');
    const draw = () => {
      const k = isoDay().slice(0, 7);
      const items = propItems();
      pickInit(pick, items);
      const qt = terms(state.q);
      const keepL = (l) => pick.sel.has(l.property_id) && hit([l.tenant, l.tenant_phone, l.tenant_email, l.guardian_name, l.comments, lotName(l), propName(l.property_id)], qt);
      const keepU = (u) => pick.sel.has(u.property_id) && hit([u.name, u.unit_type, propName(u.property_id), 'vacant'], qt);
      const current = db.t('leases').filter(l => l.active !== false && activeInMonth(l, k) && keepL(l));
      const withBal = current.map(l => ({ l, bal: round2(balanceOf(l.id, k)) }));
      const arrears = withBal.filter(x => x.bal > 0.005).sort((a, b) => b.bal - a.bal);
      const credit = withBal.filter(x => x.bal < -0.005).sort((a, b) => a.bal - b.bal);
      const inPlace = db.t('leases').filter(l => l.active !== false && activeInMonth(l, k));
      const vacants = db.t('units').filter(u => u.active !== false && !inPlace.some(l => l.unit_id === u.id) && keepU(u));
      const revisions = current.filter(l => l.revision_date && daysSince(l.revision_date) >= -60).sort((a, b) => a.revision_date.localeCompare(b.revision_date));
      const oldDebts = db.t('leases').filter(l => !inPlace.includes(l) && keepL(l)).map(l => round2(balanceOf(l.id))).filter(b => b > 0.005);
      const row = (l, right) => `<div class="act-row" style="cursor:pointer;margin-bottom:6px" data-lease="${l.id}"><div style="flex:1"><b>${esc(l.tenant)}</b> <span class="muted small">${esc(propName(l.property_id))} · lot ${esc(lotName(l))}</span></div>${right}</div>`;
      root.innerHTML = `<div class="toolbar">${searchInput('rt-q', state, 'Locataire, lot, immeuble…')}
          ${multiPick('rt-props', items, pick, { noun: 'bien' })}
          <span class="muted small">Situation au mois de <b style="text-transform:capitalize">${monthLabel(k)}</b></span></div>
        ${pickChips(items, pick, { q: state.q })}
        <div class="grid c2">
        <div class="card"><h3>Loyers en retard — ${eur2(arrears.reduce((s, x) => s + x.bal, 0))} · ${arrears.length} locataire${arrears.length > 1 ? 's' : ''}</h3>${arrears.map(({ l, bal }) => row(l, `<b class="status-lost">${eur2(bal)}</b> <button class="btn ghost sm" data-relance="${l.id}">Relance</button>`)).join('') || '<div class="empty">Aucun retard</div>'}
          ${oldDebts.length ? `<p class="muted small" style="margin:12px 0 0">+ ${oldDebts.length} ancien${oldDebts.length > 1 ? 's' : ''} locataire${oldDebts.length > 1 ? 's' : ''} parti${oldDebts.length > 1 ? 's' : ''} avec un reste dû (${eur2(oldDebts.reduce((s, b) => s + b, 0))}) — voir Baux › Terminés</p>` : ''}</div>
        <div>
          <div class="card" style="margin-bottom:18px"><h3>Lots vacants (${vacants.length})</h3>${vacants.map(u => `<div class="act-row" style="margin-bottom:6px"><div style="flex:1"><b>${esc(propName(u.property_id))}</b> · lot ${esc(u.name)} <span class="muted small">${esc(u.unit_type || '')}${u.surface ? ' · ' + num(u.surface) + ' m²' : ''}</span></div><button class="btn ghost sm" data-newlease="${u.id}">+ Bail</button></div>`).join('') || '<div class="empty">Aucun lot vacant</div>'}</div>
          <div class="card" style="margin-bottom:18px"><h3>Trop-perçus / avances (${credit.length})</h3>${credit.map(({ l, bal }) => row(l, `<b class="status-won">${eur2(-bal)}</b>`)).join('') || '<div class="empty">Aucun</div>'}</div>
          <div class="card"><h3>Révisions de loyer à venir / dépassées</h3>${revisions.map(l => row(l, `<span class="${daysSince(l.revision_date) >= 0 ? 'status-lost' : ''}">${fmtDate(l.revision_date)}</span>`)).join('') || '<div class="empty">Aucune révision planifiée — renseignez la date de révision IRL dans chaque bail</div>'}</div>
        </div></div>`;
      bindSearch(root, 'rt-q', state, draw);
      bindMultiPick(root, 'rt-props', items, pick, draw, state);
      restoreFocus(root, state);
      root.querySelectorAll('[data-lease]').forEach(el => el.onclick = () => openLease(el.dataset.lease, draw));
      root.querySelectorAll('[data-relance]').forEach(b => b.onclick = e => { e.stopPropagation(); generateDocument('relance', db.byId('leases', b.dataset.relance)); });
      root.querySelectorAll('[data-newlease]').forEach(b => b.onclick = () => { const u = db.byId('units', b.dataset.newlease); leaseForm(null, { unit_id: u.id, property_id: u.property_id }, draw); });
    };
    draw();
    return { refresh: draw };
  },
};

// ======================================================================
//  Professionnels : artisans, syndics, notaires, assureurs… (24/11/2026)
// ======================================================================
// Élodie : « rajouter une base de données pour les professionnels » — société,
// nom et prénom, profession, ville, téléphone, mail — « et pouvoir filtrer cette
// base de données par tous ces champs ».
//
// ⚠ UNE TABLE À ELLE, `locatif_pros`, et pas `organisations` : les partenaires des
// structures y sont cloisonnés par structure et remontent dans la recherche
// universelle. Le plombier d'un immeuble de rapport n'est le partenaire d'aucune
// structure ; il reste derrière l'accès « gestion locative » (`has_rental()`).
//
// ⚠ LES SIX FILTRES ET LEUR PRÉSENTATION : voir l'en-tête de `prosPage` plus bas.
const aplat = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nomPro = (p) => [p.prenom, p.nom].filter(Boolean).join(' ');
const villePro = (p) => String(p.ville || '').trim();

// ⚠ LE FORMULAIRE EST CELUI DE LA MAQUETTE VALIDÉE (24/11/2026, Élodie : « je
// voudrais que le formulaire soit plus moderne et dynamique », puis « c'est ok
// comme ça » sur la maquette cliquable). Une carte se construit en haut pendant
// la saisie, le métier se touche en pastille illustrée (« Autre… » ouvre un
// champ libre), la ville se pique parmi celles déjà dans la base, le téléphone se
// met en forme tout seul et se coche quand il a ses dix chiffres, le mail est
// vérifié en direct. Les six informations de la base sont comptées dans l'anneau.
//
// ⚠ LES STYLES VIVENT DANS LE FORMULAIRE (`<style>` en tête, classes `pf-*`) :
// app.css est partagé par plusieurs sessions au même moment, et ce formulaire
// n'existe que dans cette fenêtre.
const METIERS = [
  ['Plombier', '#2563EB', '<path d="M7 3v5a5 5 0 0 0 10 0V3M12 13v8M9 21h6"/>'],
  ['Électricien', '#D97706', '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'],
  ['Chauffagiste', '#E11D48', '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>'],
  ['Serrurier', '#475569', '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'],
  ['Peintre', '#9333EA', '<rect x="3" y="3" width="14" height="6" rx="1"/><path d="M17 6h3v5h-8v3M11 14h2v7h-2z"/>'],
  ['Menuisier', '#92400E', '<path d="M3 21l9-9M14 4l6 6-4 4-6-6zM12 12l-2 2"/>'],
  ['Multiservices', '#0D9488', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'],
  ['Syndic', '#4F46E5', '<path d="M3 21h18M5 21V8l7-5 7 5v13M10 21v-5h4v5"/>'],
  ['Notaire', '#1E3A8A', '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/>'],
  ['Assureur', '#059669', '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'],
  ['Diagnostiqueur', '#0891B2', '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'],
];
const AUTRE = ['Autre…', '#6B7280', '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'];
const ICO = {
  societe: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4"/>',
  personne: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  ville: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  notes: '<path d="M4 5h16M4 10h16M4 15h10"/>',
  crayon: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};
const COCHE = '<span class="pf-etat"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
const PF_CSS = `<style>
.pf { display: flex; flex-direction: column; gap: 20px; }
.pf-carte { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 18px; border: 1px solid var(--line);
  background: radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 55%),
  radial-gradient(90% 140% at 100% 0%, color-mix(in srgb, #F0802C 14%, transparent), transparent 60%), var(--card-2); }
.pf-pop { animation: pfPop .35s cubic-bezier(.2,.8,.2,1.4); }
@keyframes pfPop { from { transform: scale(.94); opacity: .5 } to { transform: none; opacity: 1 } }
.pf-avatar { flex: none; width: 54px; height: 54px; border-radius: 15px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 19px;
  background: linear-gradient(135deg, var(--pf-t, var(--accent)), color-mix(in srgb, var(--pf-t, var(--accent)) 55%, #F0802C)); }
.pf-avatar svg { width: 26px; height: 26px; stroke: #fff; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.pf-ctxt { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.pf-cnom { font-size: 17px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-cnom.vide, .pf-cl .vide { color: var(--muted); font-weight: 500; font-style: italic; }
.pf-cl { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--muted); font-size: 12.5px; }
.pf-pill { padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: var(--accent-soft); color: var(--accent); }
.pf-jauge { flex: none; position: relative; width: 46px; height: 46px; }
.pf-jauge svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.pf-jauge circle { fill: none; stroke-width: 5; }
.pf-jauge .f { stroke: var(--line); } .pf-jauge .p { stroke: var(--green); stroke-linecap: round; transition: stroke-dashoffset .5s cubic-bezier(.2,.8,.2,1); }
.pf-jauge b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.pf-bloc { display: flex; flex-direction: column; gap: 10px; }
.pf-leg { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.pf-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 560px) { .pf-duo { grid-template-columns: 1fr; } }
.pf-champ { position: relative; }
.pf-champ input, .pf-champ textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; color: var(--text); background: var(--card-2);
  border: 1.5px solid var(--line); border-radius: 13px; padding: 21px 38px 7px 40px; outline: none; transition: border-color .2s, background .2s, box-shadow .2s; }
.pf-champ textarea { min-height: 76px; resize: vertical; padding-top: 23px; }
.pf-champ label { position: absolute; left: 40px; top: 14px; color: var(--muted); font-size: 14px; pointer-events: none; transition: all .18s ease; }
.pf-champ input:focus, .pf-champ textarea:focus { border-color: var(--accent); background: var(--card); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 15%, transparent); }
.pf-champ input:focus + label, .pf-champ input:not(:placeholder-shown) + label,
.pf-champ textarea:focus + label, .pf-champ textarea:not(:placeholder-shown) + label { top: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; color: var(--accent); }
.pf-ico { position: absolute; left: 13px; top: 16px; width: 18px; height: 18px; stroke: var(--muted); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.pf-champ:focus-within .pf-ico { stroke: var(--accent); }
.pf-etat { position: absolute; right: 11px; top: 14px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; opacity: 0; transform: scale(.4); transition: all .25s cubic-bezier(.2,.8,.2,1.4); background: var(--green-soft); }
.pf-etat.ok { opacity: 1; transform: none; }
.pf-etat svg { width: 13px; height: 13px; fill: none; stroke: var(--green); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.pf-aide { margin: 4px 0 0 4px; font-size: 12px; color: var(--muted); }
.pf-aide.warn { color: var(--amber); }
.pf-metiers, .pf-villes { display: flex; flex-wrap: wrap; gap: 7px; }
.pf-metier { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px 7px 9px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--card);
  color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s; }
.pf-metier svg { width: 16px; height: 16px; stroke: var(--muted); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.pf-metier:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); transform: translateY(-1px); }
.pf-metier[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); box-shadow: 0 8px 18px -10px var(--accent); }
.pf-metier[aria-pressed="true"] svg { stroke: var(--on-accent, #fff); }
.pf-autre { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s ease; }
.pf-autre.ouvert { grid-template-rows: 1fr; } .pf-autre > div { overflow: hidden; }
.pf-ville { padding: 4px 11px; border-radius: 999px; border: 1px dashed var(--line-strong, var(--line)); background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.pf-ville:hover { color: var(--accent); border-color: var(--accent); border-style: solid; }
.pf-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pf-manque { flex: 1; min-width: 160px; color: var(--muted); font-size: 12.5px; }
.pf .btn[type="submit"]:disabled { opacity: .45; cursor: not-allowed; }
.pf-fini { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 26px 8px 10px; animation: pfPop .4s cubic-bezier(.2,.8,.2,1.4); }
.pf-coche { width: 68px; height: 68px; border-radius: 50%; background: var(--green-soft); display: grid; place-items: center; }
.pf-coche svg { width: 34px; height: 34px; stroke: var(--green); fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 40; stroke-dashoffset: 40; animation: pfTrace .5s .15s forwards ease-out; }
@keyframes pfTrace { to { stroke-dashoffset: 0 } }
.pf-fini h3 { margin: 6px 0 0; font-size: 18px; } .pf-fini p { margin: 0; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .pf *, .pf-fini, .pf-fini * { animation: none !important; transition: none !important; } .pf-coche svg { stroke-dashoffset: 0; } }
</style>`;

export function proForm(existing = null, onSaved, onClose = null) {
  const e0 = existing || {};
  const connu = METIERS.find(([m]) => aplat(m) === aplat(e0.profession));
  let metier = e0.profession ? (connu ? connu[0] : AUTRE[0]) : '';
  const villes = [...new Map(db.t('locatif_pros').map(villePro).filter(Boolean).map(v => [aplat(v), v])).values()]
    .sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 8);
  const champ = (id, label, ico, val, extra = '') => `<div class="pf-champ"><svg class="pf-ico" viewBox="0 0 24 24">${ico}</svg>
    <input id="${id}" placeholder=" " value="${esc(val || '')}" ${extra}><label for="${id}">${esc(label)}</label>${extra.includes('data-coche') ? COCHE : ''}</div>`;
  const autres = [...new Set(db.t('locatif_pros').map(p => p.profession).filter(Boolean))]
    .filter(p => !METIERS.some(([m]) => aplat(m) === aplat(p)));
  const corps = `${PF_CSS}
    <form class="pf" id="pf" novalidate>
      <div class="pf-carte" id="pf-carte">
        <div class="pf-avatar" id="pf-avatar" aria-hidden="true"></div>
        <div class="pf-ctxt"><div class="pf-cnom" id="pf-cnom"></div>
          <div class="pf-cl"><span id="pf-cmetier"></span><span id="pf-cqui"></span></div>
          <div class="pf-cl"><span id="pf-ccontact"></span></div></div>
        <div class="pf-jauge" title="Informations remplies"><svg viewBox="0 0 46 46"><circle class="f" cx="23" cy="23" r="19"/><circle class="p" id="pf-anneau" cx="23" cy="23" r="19" stroke-dasharray="119.4" stroke-dashoffset="119.4"/></svg><b id="pf-compte">0/6</b></div>
      </div>
      <div class="pf-bloc"><span class="pf-leg">Son métier</span>
        <div class="pf-metiers" role="group" aria-label="Profession">${[...METIERS, AUTRE].map(([m, , svg]) =>
          `<button type="button" class="pf-metier" data-m="${esc(m)}" aria-pressed="${m === metier}"><svg viewBox="0 0 24 24">${svg}</svg>${esc(m)}</button>`).join('')}</div>
        <div class="pf-autre ${metier === AUTRE[0] ? 'ouvert' : ''}" id="pf-autre"><div>
          ${champ('pf-f-autre', 'Quel métier ?', ICO.crayon, connu ? '' : e0.profession, 'autocomplete="off" list="pf-autres"')}
          <datalist id="pf-autres">${autres.map(a => `<option value="${esc(a)}">`).join('')}</datalist></div></div>
      </div>
      <div class="pf-bloc"><span class="pf-leg">La société et la personne</span>
        ${champ('pf-f-societe', 'Nom de la société', ICO.societe, e0.societe, 'autocomplete="organization"')}
        <div class="pf-duo">${champ('pf-f-prenom', 'Prénom', ICO.personne, e0.prenom, 'autocomplete="given-name"')}${champ('pf-f-nom', 'Nom', ICO.personne, e0.nom, 'autocomplete="family-name"')}</div>
        <div>${champ('pf-f-ville', 'Ville', ICO.ville, e0.ville, 'autocomplete="address-level2"')}
          ${villes.length ? `<div class="pf-villes" style="margin-top:7px">${villes.map(v => `<button type="button" class="pf-ville" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : ''}</div>
      </div>
      <div class="pf-bloc"><span class="pf-leg">Pour le joindre</span>
        <div class="pf-duo">
          <div>${champ('pf-f-tel', 'Téléphone', ICO.tel, e0.telephone, 'inputmode="tel" autocomplete="tel" data-coche')}<p class="pf-aide" id="pf-a-tel"></p></div>
          <div>${champ('pf-f-mail', 'Mail', ICO.mail, e0.email, 'inputmode="email" autocomplete="email" data-coche')}<p class="pf-aide" id="pf-a-mail"></p></div>
        </div>
        <div class="pf-champ"><svg class="pf-ico" viewBox="0 0 24 24">${ICO.notes}</svg>
          <textarea id="pf-f-notes" placeholder=" ">${esc(e0.notes || '')}</textarea><label for="pf-f-notes">Notes — immeubles, tarifs, disponibilités…</label></div>
      </div>
      <div class="pf-actions"><span class="pf-manque" id="pf-manque"></span>
        ${existing ? '<button type="button" class="btn ghost" id="pf-del">Supprimer</button>' : ''}
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button class="btn" type="submit" id="pf-ok">Enregistrer</button></div>
    </form>`;
  const m = openModal(existing ? 'Modifier le professionnel' : 'Nouveau professionnel', corps, { onClose });
  const $ = (id) => m.querySelector('#' + id);
  const val = (id) => ($(id)?.value || '').trim();
  const chiffres = (v) => String(v || '').replace(/\D/g, '');
  const formaterTel = (v) => {
    let d = chiffres(v);
    if (String(v).trim().startsWith('+33') || d.startsWith('33')) d = '0' + d.replace(/^33/, '');
    return d.slice(0, 10).replace(/(\d{2})(?=\d)/g, '$1 ');
  };
  const mailOk = (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);
  const leMetier = () => (metier === AUTRE[0] ? val('pf-f-autre') : metier);
  const teinte = () => ([...METIERS, AUTRE].find(([x]) => x === metier) || [])[1] || 'var(--accent)';
  const icone = () => ([...METIERS, AUTRE].find(([x]) => x === metier) || AUTRE)[2];

  const maj = (anime = false) => {
    const s = val('pf-f-societe'), qui = [val('pf-f-prenom'), val('pf-f-nom')].filter(Boolean).join(' ');
    const v = val('pf-f-ville'), t = val('pf-f-tel'), ml = val('pf-f-mail'), job = leMetier();
    const nom = $('pf-cnom');
    nom.textContent = s || qui || 'Nom de la société';
    nom.classList.toggle('vide', !s && !qui);
    $('pf-cmetier').innerHTML = job ? `<span class="pf-pill">${esc(job)}</span>` : '<span class="vide">métier ?</span>';
    $('pf-cqui').textContent = [s && qui ? qui : '', v].filter(Boolean).join(' · ');
    $('pf-ccontact').textContent = [t, ml].filter(Boolean).join(' · ');
    const ini = (s || qui).split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
    const av = $('pf-avatar');
    av.innerHTML = ini ? esc(ini) : `<svg viewBox="0 0 24 24">${icone()}</svg>`;
    av.style.setProperty('--pf-t', teinte());
    const telBon = chiffres(t).length === 10, mailBon = mailOk(ml);
    $('pf-f-tel').parentElement.querySelector('.pf-etat').classList.toggle('ok', telBon);
    $('pf-f-mail').parentElement.querySelector('.pf-etat').classList.toggle('ok', mailBon);
    const reste = 10 - chiffres(t).length;
    $('pf-a-tel').textContent = t && !telBon && reste > 0 ? `${reste} chiffre${reste > 1 ? 's' : ''} encore` : '';
    const mailFaux = !!(ml && !mailBon);
    $('pf-a-mail').textContent = mailFaux ? 'Il manque quelque chose : nom@domaine.fr' : '';
    $('pf-a-mail').classList.toggle('warn', mailFaux && document.activeElement !== $('pf-f-mail'));
    const remplis = [s, qui, job, v, telBon ? t : '', mailBon ? ml : ''].filter(Boolean).length;
    $('pf-compte').textContent = `${remplis}/6`;
    $('pf-anneau').style.strokeDashoffset = String(119.4 * (1 - remplis / 6));
    const peut = !!(s || qui);
    $('pf-ok').disabled = !peut;
    $('pf-manque').textContent = !peut ? 'Indiquez au moins une société ou un nom'
      : remplis === 6 ? 'Fiche complète' : `${6 - remplis} information${6 - remplis > 1 ? 's' : ''} à compléter, si vous les avez`;
    if (anime) { const c = $('pf-carte'); c.classList.remove('pf-pop'); void c.offsetWidth; c.classList.add('pf-pop'); }
  };

  m.querySelectorAll('.pf-metier').forEach(b => b.onclick = () => {
    metier = metier === b.dataset.m ? '' : b.dataset.m;
    m.querySelectorAll('.pf-metier').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.m === metier)));
    $('pf-autre').classList.toggle('ouvert', metier === AUTRE[0]);
    if (metier === AUTRE[0]) setTimeout(() => $('pf-f-autre')?.focus(), 250);
    maj(true);
  });
  m.querySelectorAll('.pf-ville').forEach(b => b.onclick = () => { $('pf-f-ville').value = b.dataset.v; maj(true); });
  $('pf-f-tel').addEventListener('input', (e) => {
    const el = e.target;
    // On ne reformate qu'un numéro français : un « +44 … » reste tel qu'on le tape.
    if (!/^\s*\+(?!33)/.test(el.value)) el.value = formaterTel(el.value);
    maj();
  });
  ['pf-f-societe', 'pf-f-prenom', 'pf-f-nom', 'pf-f-ville', 'pf-f-mail', 'pf-f-autre'].forEach(id => $(id)?.addEventListener('input', () => maj()));
  $('pf-f-mail').addEventListener('blur', () => maj());

  $('pf').onsubmit = async (e) => {
    e.preventDefault();
    if ($('pf-ok').disabled) return;
    const v = {
      societe: val('pf-f-societe') || null, prenom: val('pf-f-prenom') || null, nom: val('pf-f-nom') || null,
      profession: leMetier() || null, ville: val('pf-f-ville') || null,
      telephone: val('pf-f-tel') || null, email: val('pf-f-mail') || null, notes: val('pf-f-notes') || null,
    };
    $('pf-ok').disabled = true;
    try {
      let id = existing?.id;
      if (existing) await db.update('locatif_pros', id, { ...v, updated_at: new Date().toISOString() });
      else id = (await db.insert('locatif_pros', v)).id;
      onSaved?.(id);
      if (existing) { closeModal(true); toast('Professionnel enregistré'); return; }
      // La confirmation animée, et de quoi enchaîner sur le suivant.
      const nom = v.societe || [v.prenom, v.nom].filter(Boolean).join(' ');
      $('pf').outerHTML = `<div class="pf-fini"><div class="pf-coche"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h3>${esc(nom)} est dans la base</h3><p>Filtrable par métier, par ville et par chacun de ses champs.</p>
        <div class="form-actions" style="margin-top:12px"><button type="button" class="btn ghost" data-close>Fermer</button><button type="button" class="btn" id="pf-encore">Ajouter un autre professionnel</button></div></div>`;
      m.querySelector('#pf-encore')?.addEventListener('click', () => proForm(null, onSaved, onClose));
    } catch (err) { $('pf-ok').disabled = false; toast(err.message, 'err'); }
  };
  $('pf-del')?.addEventListener('click', async () => {
    if (!await confirm(`Supprimer ${existing.societe || nomPro(existing)} de la base des professionnels ?`)) return;
    await db.remove('locatif_pros', existing.id); closeModal(true); onSaved?.(null);
  });
  maj();
  if (!existing) setTimeout(() => $('pf-f-societe')?.focus(), 60);
}

// ⚠ L'ÉCRAN EST CELUI DE LA SECONDE MAQUETTE VALIDÉE (24/11/2026, Élodie : « juste
// l'écran professionnels, je voudrais qu'il soit plus moderne et dynamique aussi »,
// puis « vas-y »). Bandeau à compteurs, métiers en pastilles comptées qui filtrent,
// une carte par professionnel avec Appeler / Écrire / Copier, filtres fins dans un
// volet « Affiner », filtres actifs en puces retirables, bascule cartes ↔ tableau.
//
// ⚠ LES SIX FILTRES DE LA DEMANDE SONT TOUS LÀ : profession (pastilles), ville
// (liste), société, nom, téléphone, mail (volet « Affiner »). Ils se combinent.
//
// ⚠ L'ÉCRAN NE SE REDESSINE PAS EN ENTIER À CHAQUE FRAPPE. La coquille (bandeau,
// recherche, volet) est posée une fois ; seuls les pastilles, le résumé et la
// liste se refont. Sinon le champ en cours de saisie perdrait le curseur, et le
// volet « Affiner » se refermerait à chaque lettre.
//
// ⚠ COMPTE DES PASTILLES = CE QU'ON OBTIENDRAIT EN LA TOUCHANT : chaque nombre
// applique tous les autres filtres, sauf celui du métier.
const LPX_CSS = `<style>
.lpx { display: flex; flex-direction: column; gap: 14px; }
.lpx svg.i { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.lpx-tete { position: relative; overflow: hidden; border-radius: 22px; padding: 20px 22px; border: 1px solid var(--line);
  background: radial-gradient(90% 160% at 0% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 55%),
              radial-gradient(70% 140% at 100% 0%, color-mix(in srgb, #F0802C 16%, transparent), transparent 60%), var(--card);
  display: flex; flex-wrap: wrap; align-items: center; gap: 16px 28px; }
.lpx-tete h1 { margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -.02em; }
.lpx-tete p { margin: 4px 0 0; color: var(--muted); }
.lpx-chiffres { display: flex; gap: 22px; margin-left: auto; }
.lpx-chiffres b { display: block; font-size: 25px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.lpx-chiffres span { font-size: 12px; color: var(--muted); font-weight: 600; }
.lpx-barre { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.lpx-recherche { position: relative; flex: 1 1 280px; }
.lpx-recherche svg { position: absolute; left: 14px; top: 12px; color: var(--muted); }
.lpx-recherche input { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; color: var(--text); background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 11px 14px 11px 42px; outline: none; transition: border-color .2s, box-shadow .2s; }
.lpx-recherche input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 15%, transparent); }
.lpx-ville { font: inherit; font-size: 14px; font-weight: 600; color: var(--text); background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 10px 12px; }
.lpx-vues { display: inline-flex; padding: 3px; border-radius: 12px; background: var(--card); border: 1.5px solid var(--line); }
.lpx-vues button { border: 0; background: transparent; color: var(--muted); padding: 7px 9px; border-radius: 9px; cursor: pointer; display: grid; place-items: center; }
.lpx-vues button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.lpx-metiers { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: thin; }
.lpx-metier { flex: none; display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px 7px 9px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--card);
  color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s; }
.lpx-metier svg { width: 16px; height: 16px; stroke: var(--lpx-t, var(--muted)); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.lpx-metier .n { min-width: 20px; padding: 1px 6px; border-radius: 999px; background: var(--card-2); color: var(--muted); font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums; text-align: center; }
.lpx-metier:hover { transform: translateY(-1px); }
.lpx-metier[aria-pressed="true"] { background: var(--lpx-t, var(--accent)); border-color: var(--lpx-t, var(--accent)); color: #fff; box-shadow: 0 8px 18px -10px var(--lpx-t, var(--accent)); }
.lpx-metier[aria-pressed="true"] .n { background: rgba(255,255,255,.25); color: #fff; }
.lpx-metier[aria-pressed="true"] svg { stroke: #fff; }
.lpx-affiner { border: 1px solid var(--line); border-radius: 16px; background: var(--card); }
.lpx-affiner summary { list-style: none; cursor: pointer; padding: 10px 14px; display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--muted); font-size: 13px; }
.lpx-affiner summary::-webkit-details-marker { display: none; }
.lpx-affiner summary .actifs { margin-left: auto; color: var(--accent); }
.lpx-affiner[open] summary { border-bottom: 1px solid var(--line); }
.lpx-fins { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; padding: 12px 14px 14px; }
.lpx-fins label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.lpx-fins input { font: inherit; font-size: 14px; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--text); background: var(--card-2); border: 1.5px solid var(--line); border-radius: 11px; padding: 9px 11px; outline: none; }
.lpx-fins input:focus { border-color: var(--accent); background: var(--card); }
.lpx-resume { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; min-height: 28px; }
.lpx-resume b { color: var(--text); font-variant-numeric: tabular-nums; }
.lpx-puce { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 11px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 12px; }
.lpx-puce button { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 3px; }
.lpx-raz { border: 0; background: none; color: var(--accent); font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.lpx-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
.lpx-fiche { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 18px; background: var(--card); border: 1px solid var(--line); cursor: pointer;
  transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s, border-color .25s; animation: lpxEntre .45s both cubic-bezier(.2,.8,.2,1); animation-delay: calc(min(var(--i), 12) * 40ms); }
.lpx-fiche:hover { transform: translateY(-3px); box-shadow: 0 24px 48px -34px rgba(40,30,110,.5); border-color: color-mix(in srgb, var(--lpx-t) 40%, var(--line)); }
@keyframes lpxEntre { from { opacity: 0; transform: translateY(10px) scale(.98); } }
.lpx-fiche::before { content: ""; position: absolute; left: 16px; right: 16px; top: 0; height: 3px; border-radius: 0 0 4px 4px; background: var(--lpx-t); opacity: .85; }
.lpx-haut { display: flex; align-items: center; gap: 12px; }
.lpx-avatar { flex: none; width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 15px;
  background: linear-gradient(135deg, var(--lpx-t), color-mix(in srgb, var(--lpx-t) 55%, #F0802C)); }
.lpx-qui { min-width: 0; flex: 1; }
.lpx-qui b { display: block; font-size: 15px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lpx-qui span { display: block; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-height: 1.2em; }
.lpx-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px; border-radius: 999px; font-size: 11.5px; font-weight: 700;
  color: var(--lpx-t); background: color-mix(in srgb, var(--lpx-t) 12%, transparent); white-space: nowrap; }
.lpx-pill svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.lpx-infos { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
.lpx-infos div { display: flex; align-items: center; gap: 8px; min-width: 0; }
.lpx-infos div span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.lpx-infos .manque { color: var(--muted); font-style: italic; }
.lpx-infos svg.i { width: 15px; height: 15px; color: var(--muted); }
.lpx-gestes { display: flex; gap: 8px; margin-top: auto; }
.lpx-geste { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border-radius: 11px; border: 1.5px solid var(--line);
  background: var(--card-2); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; text-decoration: none; transition: all .2s; }
.lpx-geste:hover { border-color: var(--lpx-t); color: var(--lpx-t); }
.lpx-geste[aria-disabled="true"] { opacity: .4; pointer-events: none; }
.lpx-geste svg.i { width: 15px; height: 15px; }
.lpx-geste.copie { flex: none; }
.lpx-geste.copie.fait { color: var(--green); border-color: var(--green); background: var(--green-soft); }
.lpx-tableau { background: var(--card); border: 1px solid var(--line); border-radius: 18px; overflow-x: auto; }
.lpx-tableau table { width: 100%; border-collapse: collapse; min-width: 760px; }
.lpx-tableau th { text-align: left; font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); padding: 13px 16px; border-bottom: 1px solid var(--line); }
.lpx-tableau td { padding: 11px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.lpx-tableau tbody tr { cursor: pointer; transition: background .15s; }
.lpx-tableau tbody tr:hover { background: var(--card-2); }
.lpx-tableau tbody tr:last-child td { border-bottom: 0; }
.lpx-mini { display: flex; align-items: center; gap: 10px; font-weight: 700; }
.lpx-mini .lpx-avatar { width: 32px; height: 32px; border-radius: 9px; font-size: 12px; }
.lpx-vide { padding: 44px 20px; text-align: center; color: var(--muted); background: var(--card); border: 1.5px dashed var(--line); border-radius: 18px; }
.lpx-vide b { display: block; color: var(--text); font-size: 15px; margin-bottom: 4px; }
.lpx :is(button, a, summary, [tabindex]):focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 2px; }
@media (max-width: 560px) { .lpx-chiffres { margin-left: 0; } .lpx-tete h1 { font-size: 20px; } }
@media (prefers-reduced-motion: reduce) { .lpx *, .lpx *::before { animation: none !important; transition: none !important; } }
</style>`;

const LPX_ICO = {
  loupe: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cartes: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  lignes: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  export: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  filtre: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  ville: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  copie: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
};
const lpxSvg = (d, c = 'i') => `<svg class="${c}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const metierDe = (p) => METIERS.find(([x]) => aplat(x) === aplat(p.profession)) || AUTRE;
const VUE_CLE = 'crm_locatif_pros_vue';
const lireVue = () => { try { return localStorage.getItem(VUE_CLE) === 'tableau' ? 'tableau' : 'cartes'; } catch { return 'cartes'; } };

export const prosPage = {
  title: () => 'Professionnels',
  render(root) {
    if (!scope.canRental) return denied(root);
    const etat = { metier: '', ville: '', q: '', societe: '', nom: '', tel: '', mail: '', vue: lireVue() };
    const chiffres = (v) => String(v || '').replace(/\D/g, '').replace(/^33/, '0');
    // Les initiales ne prennent que des mots qui commencent par une lettre ou un
    // chiffre : « Pose & Co » donne « PC », pas « P& ».
    const ini = (p) => (p.societe || nomPro(p)).split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map(x => x[0].toUpperCase()).join('');
    const tous = () => db.t('locatif_pros');
    const filtrer = (sauf) => tous().filter(p => {
      const blob = aplat([p.societe, nomPro(p), p.profession, p.ville, p.telephone, p.email, p.notes].join(' '));
      const mots = aplat(etat.q).split(/\s+/).filter(Boolean);
      return mots.every(t => blob.includes(t) || (chiffres(t).length >= 2 && chiffres(p.telephone).includes(chiffres(t))))
        && (sauf === 'metier' || !etat.metier || aplat(p.profession) === aplat(etat.metier))
        && (!etat.ville || aplat(villePro(p)) === aplat(etat.ville))
        && (!etat.societe || aplat(p.societe).includes(aplat(etat.societe)))
        && (!etat.nom || aplat(nomPro(p)).includes(aplat(etat.nom)))
        && (!etat.tel || chiffres(p.telephone).includes(chiffres(etat.tel)) || String(p.telephone || '').includes(etat.tel))
        && (!etat.mail || aplat(p.email).includes(aplat(etat.mail)));
    });
    const valeurs = (fn) => [...new Map(tous().map(fn).filter(Boolean).map(v => [aplat(v), v])).values()].sort((a, b) => a.localeCompare(b, 'fr'));

    // ---- la coquille, posée une fois
    root.innerHTML = `${LPX_CSS}<div class="lpx">
      <header class="lpx-tete">
        <div><h1>Professionnels</h1><p>Artisans, syndics, notaires et assureurs des immeubles.</p></div>
        <div class="lpx-chiffres">
          <div><b id="lpx-k-total">0</b><span>professionnels</span></div>
          <div><b id="lpx-k-metiers">0</b><span>métiers</span></div>
          <div><b id="lpx-k-villes">0</b><span>villes</span></div>
        </div>
        <button class="btn" type="button" id="lpx-new">${lpxSvg(LPX_ICO.plus)} Professionnel</button>
      </header>
      <div class="lpx-barre">
        <div class="lpx-recherche">${lpxSvg(LPX_ICO.loupe)}<input id="lpx-q" type="search" placeholder="Rechercher un nom, une société, un numéro…" aria-label="Rechercher dans toute la base" autocomplete="off"></div>
        <select class="lpx-ville" id="lpx-ville" aria-label="Filtrer par ville"></select>
        <div class="lpx-vues" role="group" aria-label="Affichage">
          <button type="button" id="lpx-v-cartes" title="Cartes" aria-label="Affichage en cartes">${lpxSvg(LPX_ICO.cartes)}</button>
          <button type="button" id="lpx-v-tableau" title="Tableau" aria-label="Affichage en tableau">${lpxSvg(LPX_ICO.lignes)}</button>
        </div>
        <button class="btn ghost" type="button" id="lpx-export">${lpxSvg(LPX_ICO.export)} Export CSV</button>
      </div>
      <div class="lpx-metiers" id="lpx-metiers" role="group" aria-label="Filtrer par métier"></div>
      <details class="lpx-affiner" id="lpx-affiner">
        <summary>${lpxSvg(LPX_ICO.filtre)}Affiner par société, nom, téléphone ou mail<span class="actifs" id="lpx-actifs"></span></summary>
        <div class="lpx-fins">
          <label>Société<input id="lpx-f-societe" placeholder="Nom de la société" autocomplete="off"></label>
          <label>Nom et prénom<input id="lpx-f-nom" placeholder="Nom ou prénom" autocomplete="off"></label>
          <label>Téléphone<input id="lpx-f-tel" placeholder="Numéro" inputmode="tel" autocomplete="off"></label>
          <label>Mail<input id="lpx-f-mail" placeholder="Adresse mail" autocomplete="off"></label>
        </div>
      </details>
      <div class="lpx-resume" id="lpx-resume" aria-live="polite"></div>
      <div id="lpx-liste"></div>
    </div>`;
    const $ = (id) => root.querySelector('#' + id);
    const CHAMPS = { q: 'lpx-q', ville: 'lpx-ville', societe: 'lpx-f-societe', nom: 'lpx-f-nom', tel: 'lpx-f-tel', mail: 'lpx-f-mail' };

    const dessinerMetiers = () => {
      const base = filtrer('metier');
      const metiers = valeurs(p => p.profession);
      const n = (m) => base.filter(p => aplat(p.profession) === aplat(m)).length;
      $('lpx-metiers').innerHTML = `<button type="button" class="lpx-metier" aria-pressed="${!etat.metier}" data-m="">Tous <span class="n">${base.length}</span></button>`
        + metiers.map(m => { const [, t, d] = metierDe({ profession: m });
          return `<button type="button" class="lpx-metier" style="--lpx-t:${t}" aria-pressed="${aplat(etat.metier) === aplat(m)}" data-m="${esc(m)}">${lpxSvg(d, '')}${esc(m)} <span class="n">${n(m)}</span></button>`; }).join('');
      $('lpx-metiers').hidden = !metiers.length;
    };
    const dessinerVilles = () => {
      const v = valeurs(villePro);
      if (etat.ville && !v.some(x => aplat(x) === aplat(etat.ville))) etat.ville = '';
      $('lpx-ville').innerHTML = '<option value="">Toutes les villes</option>' + v.map(x => `<option ${aplat(x) === aplat(etat.ville) ? 'selected' : ''}>${esc(x)}</option>`).join('');
    };
    const dessinerChiffres = (anime) => {
      const l = tous();
      const cibles = { 'lpx-k-total': l.length, 'lpx-k-metiers': valeurs(p => p.profession).length, 'lpx-k-villes': valeurs(villePro).length };
      const poser = (k) => Object.entries(cibles).forEach(([id, v]) => { const el = $(id); if (el) el.textContent = Math.round(v * k); });
      if (!anime || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { poser(1); return; }
      const t0 = performance.now();
      const pas = (t) => { const k = Math.min(1, (t - t0) / 900); poser(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(pas); };
      requestAnimationFrame(pas);
    };
    const dessinerListe = () => {
      const tot = tous().length;
      const l = filtrer().sort((a, b) => String(a.profession || '~').localeCompare(String(b.profession || '~'), 'fr')
        || String(a.societe || nomPro(a)).localeCompare(String(b.societe || nomPro(b)), 'fr'));
      const puces = [];
      if (etat.metier) puces.push(['metier', etat.metier]);
      if (etat.ville) puces.push(['ville', etat.ville]);
      [['societe', 'Société'], ['nom', 'Nom'], ['tel', 'Tél.'], ['mail', 'Mail']].forEach(([k, lab]) => { if (etat[k]) puces.push([k, `${lab} : ${etat[k]}`]); });
      if (etat.q) puces.push(['q', `« ${etat.q} »`]);
      const fins = ['societe', 'nom', 'tel', 'mail'].filter(k => etat[k]).length;
      $('lpx-actifs').textContent = fins ? `${fins} filtre${fins > 1 ? 's' : ''} actif${fins > 1 ? 's' : ''}` : '';
      $('lpx-resume').innerHTML = `<span><b>${l.length}</b> professionnel${l.length > 1 ? 's' : ''}${l.length !== tot ? ` sur ${tot}` : ''}</span>`
        + puces.map(([k, t]) => `<span class="lpx-puce">${esc(t)}<button type="button" data-ote="${k}" aria-label="Retirer ce filtre">×</button></span>`).join('')
        + (puces.length > 1 ? '<button type="button" class="lpx-raz" data-ote="*">Tout effacer</button>' : '');
      $('lpx-v-cartes').setAttribute('aria-pressed', String(etat.vue === 'cartes'));
      $('lpx-v-tableau').setAttribute('aria-pressed', String(etat.vue === 'tableau'));
      const tel = (t) => String(t || '').replace(/[^\d+]/g, '');
      if (!l.length) {
        $('lpx-liste').innerHTML = tot
          ? '<div class="lpx-vide"><b>Aucun professionnel ne correspond</b>Retirez un filtre, ou ajoutez ce professionnel avec « + Professionnel ».</div>'
          : '<div class="lpx-vide"><b>La base est vide</b>« + Professionnel » ajoute le premier : plombier, syndic, notaire…</div>';
      } else if (etat.vue === 'cartes') {
        $('lpx-liste').innerHTML = `<div class="lpx-grille">${l.map((p, i) => { const [, t, d] = metierDe(p); return `
          <article class="lpx-fiche" tabindex="0" data-pro="${p.id}" style="--lpx-t:${t};--i:${i}" aria-label="${esc(p.societe || nomPro(p))}">
            <div class="lpx-haut"><div class="lpx-avatar" aria-hidden="true">${esc(ini(p))}</div>
              <div class="lpx-qui"><b>${esc(p.societe || nomPro(p))}</b><span>${p.societe ? esc(nomPro(p)) : ''}</span></div>
              ${p.profession ? `<span class="lpx-pill">${lpxSvg(d, '')}${esc(p.profession)}</span>` : ''}</div>
            <div class="lpx-infos">
              <div>${lpxSvg(LPX_ICO.ville)}${villePro(p) ? `<span>${esc(villePro(p))}</span>` : '<span class="manque">ville non renseignée</span>'}</div>
              <div>${lpxSvg(LPX_ICO.tel)}${p.telephone ? `<span>${esc(p.telephone)}</span>` : '<span class="manque">pas de téléphone</span>'}</div>
              <div>${lpxSvg(LPX_ICO.mail)}${p.email ? `<span>${esc(p.email)}</span>` : '<span class="manque">pas de mail</span>'}</div>
            </div>
            <div class="lpx-gestes">
              <button type="button" class="lpx-geste" data-appeler="${esc(p.telephone || '')}" ${p.telephone ? '' : 'aria-disabled="true" tabindex="-1"'}>${lpxSvg(LPX_ICO.tel)}Appeler</button>
              <button type="button" class="lpx-geste" data-ecrire="${esc(p.email || '')}" ${p.email ? '' : 'aria-disabled="true" tabindex="-1"'}>${lpxSvg(LPX_ICO.mail)}Écrire</button>
              <button type="button" class="lpx-geste copie" data-copie="${esc(p.telephone || '')}" ${p.telephone ? '' : 'aria-disabled="true" tabindex="-1"'} title="Copier le numéro" aria-label="Copier le numéro">${lpxSvg(LPX_ICO.copie)}</button>
            </div>
          </article>`; }).join('')}</div>`;
      } else {
        $('lpx-liste').innerHTML = `<div class="lpx-tableau"><table><thead><tr><th>Société</th><th>Nom et prénom</th><th>Profession</th><th>Ville</th><th>Téléphone</th><th>Mail</th></tr></thead><tbody>
          ${l.map(p => { const [, t, d] = metierDe(p); return `<tr data-pro="${p.id}" style="--lpx-t:${t}" tabindex="0">
            <td><span class="lpx-mini"><span class="lpx-avatar" aria-hidden="true">${esc(ini(p))}</span>${esc(p.societe || '—')}</span></td>
            <td>${esc(nomPro(p))}</td><td>${p.profession ? `<span class="lpx-pill">${lpxSvg(d, '')}${esc(p.profession)}</span>` : ''}</td>
            <td>${esc(villePro(p))}</td>
            <td style="white-space:nowrap">${p.telephone ? `<a href="tel:${esc(tel(p.telephone))}" data-appeler="${esc(p.telephone)}">${esc(p.telephone)}</a>` : '<span class="muted">—</span>'}</td>
            <td>${p.email ? `<a href="mailto:${esc(p.email)}" data-ecrire="${esc(p.email)}">${esc(p.email)}</a>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>`;
      }
    };
    const draw = (anime = false) => { dessinerVilles(); dessinerMetiers(); dessinerListe(); dessinerChiffres(anime); };
    const vider = (k) => { etat[k] = ''; if (CHAMPS[k] && $(CHAMPS[k])) $(CHAMPS[k]).value = ''; };
    const ouvrir = (id) => proForm(db.byId('locatif_pros', id), () => draw());

    $('lpx-metiers').addEventListener('click', (e) => {
      const b = e.target.closest('.lpx-metier'); if (!b) return;
      etat.metier = aplat(etat.metier) === aplat(b.dataset.m) ? '' : b.dataset.m;
      dessinerMetiers(); dessinerListe();
    });
    $('lpx-ville').addEventListener('change', (e) => { etat.ville = e.target.value; dessinerMetiers(); dessinerListe(); });
    Object.entries(CHAMPS).filter(([k]) => k !== 'ville').forEach(([k, id]) =>
      $(id).addEventListener('input', (e) => { etat[k] = e.target.value.trim(); dessinerMetiers(); dessinerListe(); }));
    $('lpx-resume').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ote]'); if (!b) return;
      if (b.dataset.ote === '*') ['metier', 'ville', 'q', 'societe', 'nom', 'tel', 'mail'].forEach(vider); else vider(b.dataset.ote);
      draw();
    });
    const changerVue = (v) => { etat.vue = v; try { localStorage.setItem(VUE_CLE, v); } catch { /* préférence perdue, sans gravité */ } dessinerListe(); };
    $('lpx-v-cartes').onclick = () => changerVue('cartes');
    $('lpx-v-tableau').onclick = () => changerVue('tableau');
    $('lpx-new').onclick = () => proForm(null, () => draw());
    $('lpx-export').onclick = () => csvDownload('professionnels.csv', filtrer().map(p => ({ societe: p.societe, nom: p.nom, prenom: p.prenom, profession: p.profession, ville: p.ville, telephone: p.telephone, email: p.email, notes: p.notes })));
    $('lpx-liste').addEventListener('click', async (e) => {
      const c = e.target.closest('[data-copie]');
      if (c) {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(c.dataset.copie); c.classList.add('fait'); setTimeout(() => c.classList.remove('fait'), 1400); toast('Numéro copié : ' + c.dataset.copie); }
        catch { toast('Copie impossible : sélectionnez le numéro sur la carte', 'warn'); }
        return;
      }
      // ⚠ « ÉCRIRE » OUVRE GMAIL, PAS `mailto:` (24/11/2026, Élodie : « le bouton
      // écrire ne fonctionne pas »). Un lien mailto: cherche un logiciel de
      // messagerie installé sur l'ordinateur ; il n'y en a pas, tout passe par
      // Gmail dans le navigateur, et le clic ne faisait rien. Même geste que la
      // prospection RGD (`rgd-prospection.js`) : la fenêtre de rédaction Gmail,
      // et l'adresse copiée au passage. `window.open` AVANT toute attente, sinon
      // le navigateur ne le compte plus comme un clic et bloque la fenêtre.
      const w = e.target.closest('[data-ecrire]');
      if (w) {
        e.preventDefault(); e.stopPropagation();
        const mail = w.dataset.ecrire;
        if (!mail) return;
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(mail)}`, '_blank', 'noopener');
        try { await navigator.clipboard.writeText(mail); toast(`Adresse copiée : ${mail}`); } catch { /* la fenêtre Gmail suffit */ }
        return;
      }
      // « Appeler » : sur téléphone, l'appel part ; sur ordinateur, qui ne sait pas
      // appeler, le numéro est copié — comme la prospection RGD.
      const a = e.target.closest('[data-appeler]');
      if (a) {
        e.preventDefault(); e.stopPropagation();
        const num = a.dataset.appeler;
        if (!num) return;
        if (window.matchMedia?.('(pointer: coarse)').matches) { window.location.href = `tel:${num.replace(/[^\d+]/g, '')}`; return; }
        try { await navigator.clipboard.writeText(num); toast(`Numéro copié : ${num}`); } catch { toast(`Numéro : ${num}`); }
        return;
      }
      if (e.target.closest('a')) return;
      const f = e.target.closest('[data-pro]'); if (f) ouvrir(f.dataset.pro);
    });
    $('lpx-liste').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const f = e.target.closest('[data-pro]'); if (!f || e.target !== f) return;
      e.preventDefault(); ouvrir(f.dataset.pro);
    });
    draw(true);
    return { refresh: () => draw() };
  },
};

// ======================================================================
//  Contacts locataires : téléphones, emails, tutelles, consignes
// ======================================================================
export const tenantContactsPage = {
  title: () => 'Contacts locataires',
  render(root) {
    if (!scope.canRental) return denied(root);
    const state = { q: '', ended: false, focus: null };
    const pick = pickState('crm_locatif_props');
    const draw = () => {
      const k = isoDay().slice(0, 7);
      const items = propItems();
      pickInit(pick, items);
      const qt = terms(state.q);
      const list = db.t('leases').filter(l => (state.ended || (l.active !== false && activeInMonth(l, k))) && pick.sel.has(l.property_id)
        && hit([l.tenant, l.tenant_phone, l.tenant_email, l.guardian_name, l.guardian_phone, l.guardian_email, l.comments, lotName(l), propName(l.property_id)], qt))
        .sort((a, b) => propName(a.property_id).localeCompare(propName(b.property_id)) || String(lotName(a)).localeCompare(String(lotName(b)), 'fr', { numeric: true }));
      const tel = (t) => t ? String(t).split(/\n|\/| ou /i).map(x => x.trim()).filter(Boolean).map(x => `<a href="tel:${esc(x.replace(/[^\d+]/g, ''))}">${esc(x)}</a>`).join('<br>') : '<span class="muted">—</span>';
      const mail = (m) => m ? String(m).split(/\s*\/\s*|\s+/).filter(x => x.includes('@')).map(x => `<a href="mailto:${esc(x)}">${esc(x)}</a>`).join('<br>') : '<span class="muted">—</span>';
      const missing = list.filter(l => !l.tenant_phone && !l.tenant_email && !l.guardian_phone).length;
      root.innerHTML = `
        <div class="toolbar">${searchInput('tc-q', state, 'Nom, téléphone, email, lot…')}
          ${multiPick('tc-props', items, pick, { noun: 'bien' })}
          <label class="check"><input type="checkbox" id="tc-ended" ${state.ended ? 'checked' : ''}> Inclure les anciens locataires</label>
          <button class="btn ghost sm" id="tc-export">Export CSV</button></div>
        ${pickChips(items, pick, { q: state.q })}
        ${missing ? `<div class="alert"><b>${missing}</b><div>locataire${missing > 1 ? 's' : ''} sans aucun téléphone ni email — à compléter (ouvrir la fiche, Modifier)</div></div>` : ''}
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Immeuble · lot</th><th>Locataire</th><th>Téléphone</th><th>Email</th><th>Tutelle / curatelle / garant</th><th>Consignes</th></tr></thead><tbody>
          ${list.map(l => `<tr class="click ${l.active === false ? 'muted' : ''}" data-lease="${l.id}"><td><b>${esc(propName(l.property_id).replace(/^Immeuble /, ''))}</b><div class="small muted">lot ${esc(lotName(l))}</div></td><td><b>${esc(l.tenant)}</b>${l.active === false ? '<div class="small muted">ancien locataire</div>' : ''}</td><td class="nowrap">${tel(l.tenant_phone)}</td><td>${mail(l.tenant_email)}</td><td class="small">${esc(l.guardian_name || '')}${l.guardian_name ? '<br>' : ''}${tel(l.guardian_phone).replace('<span class="muted">—</span>', '')}${l.guardian_phone && l.guardian_email ? '<br>' : ''}${mail(l.guardian_email).replace('<span class="muted">—</span>', '')}</td><td class="small">${esc(l.comments || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun locataire ne correspond</td></tr>'}
        </tbody></table></div><p class="muted small">${list.length} locataire${list.length > 1 ? 's' : ''} · cliquer sur une ligne pour ouvrir le bail et modifier les coordonnées</p></div>`;
      bindSearch(root, 'tc-q', state, draw);
      bindMultiPick(root, 'tc-props', items, pick, draw, state);
      restoreFocus(root, state);
      root.querySelector('#tc-ended').onchange = e => { state.ended = e.target.checked; draw(); };
      root.querySelectorAll('[data-lease]').forEach(tr => tr.onclick = e => { if (e.target.closest('a')) return; openLease(tr.dataset.lease, draw); });
      root.querySelector('#tc-export').onclick = () => csvDownload('contacts-locataires.csv', list.map(l => ({ immeuble: propName(l.property_id), lot: lotName(l), locataire: l.tenant, telephone: l.tenant_phone, email: l.tenant_email, tutelle: l.guardian_name, tutelle_tel: l.guardian_phone, tutelle_email: l.guardian_email, consignes: l.comments, statut: l.active === false ? 'ancien' : 'en place' })));
    };
    draw();
    return { refresh: draw };
  },
};
