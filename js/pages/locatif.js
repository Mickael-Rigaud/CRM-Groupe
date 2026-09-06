// Module Gestion locative : lots, baux / locataires, suivi mensuel des loyers (reprend le suivi Excel),
// import de relevé bancaire, documents (quittance, relance, attestation). Accessible avec le droit rental_access
// (Stéphanie) ou l'accès patrimoine (Mickael).
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, num, pct, openModal, closeModal, renderForm, readForm, toast, fmtDate, confirm, csvDownload, isoDay, daysSince } from '../ui.js';
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
    body{font-family:Inter,Arial,sans-serif;color:#15384E;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.5;font-size:14px}h1{font-size:20px;letter-spacing:.04em;margin:28px 0 18px;text-align:center}
    .parties{display:flex;justify-content:space-between;gap:24px;margin-bottom:24px}.parties div{flex:1}.small{font-size:11px;color:#4A6579}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{padding:6px 8px;border-bottom:1px solid #F2E3CE;text-align:left}.r{text-align:right}
    .sig{margin-top:40px;display:flex;justify-content:space-between}.print{position:fixed;top:12px;right:12px;padding:8px 14px;border:0;border-radius:999px;background:#F4801C;color:#fff;font-weight:700;cursor:pointer}@media print{.print{display:none}}</style></head><body>
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
    const state = { month: isoDay().slice(0, 7), prop: '' };
    let prepared = new Set();
    const draw = async () => {
      const k = state.month;
      if (!prepared.has(k) && k <= isoDay().slice(0, 7)) { prepared.add(k); const n = await prepareMonth(k); if (n) toast(`${n} ligne(s) préparée(s) pour ${monthLabel(k)}`); }
      const props = db.t('properties').filter(p => !state.prop || p.id === state.prop).sort((a, b) => a.name.localeCompare(b.name));
      const allLeases = db.t('leases');
      const groups = props.map(p => {
        const units = db.t('units').filter(u => u.property_id === p.id && u.active !== false).sort(unitSort);
        const lines = [];
        const leasesP = allLeases.filter(l => l.property_id === p.id && activeInMonth(l, k) && (l.active !== false || (l.end_date && l.end_date.slice(0, 7) >= k)));
        for (const u of units) {
          const ls = leasesP.filter(l => l.unit_id === u.id);
          if (ls.length) ls.forEach(l => lines.push({ u, l })); else lines.push({ u, l: null });
        }
        for (const l of leasesP.filter(l => !l.unit_id || !units.some(u => u.id === l.unit_id))) lines.push({ u: null, l });
        return { p, lines };
      }).filter(g => g.lines.length);
      const tot = { due: 0, apl: 0, tenant: 0, rec: 0, missing: 0, prev: 0, bal: 0, vacant: 0 };
      const line = ({ u, l }) => {
        if (!l) { tot.vacant++; return `<tr class="vacant"><td><b>${esc(u.name)}</b><div class="small muted">${esc([u.unit_type, u.surface ? num(u.surface) + ' m²' : '', u.dpe ? 'DPE ' + u.dpe : ''].filter(Boolean).join(' · '))}</div></td><td colspan="11" class="muted"><span class="pill warn">Vacant</span> <button class="btn ghost sm" data-newlease="${u.id}">+ Bail</button></td><td></td></tr>`; }
        const row = rowOf(l.id, k); const due = dueOf(l, row); const apl = Number(row?.apl) || 0; const tp = Number(row?.tenant_paid ?? (row?.amount ?? 0)) || 0; const rec = apl + tp;
        const missing = round2(due - rec); const prev = round2(balanceOf(l.id, shiftMonth(k, -1))); const bal = round2(missing + prev + (Number(row?.adjustment) || 0));
        tot.due += due; tot.apl += apl; tot.tenant += tp; tot.rec += rec; tot.missing += missing; tot.prev += prev; tot.bal += bal;
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
      const body = groups.map(g => `<tr class="grp"><td colspan="13"><b>${esc(g.p.name)}</b> <span class="muted small">${esc([g.p.holding_name, g.p.address, g.p.city].filter(Boolean).join(' · '))}</span></td></tr>${g.lines.map(line).join('')}`).join('');
      const rate = tot.due ? tot.rec / tot.due * 100 : 0;
      root.innerHTML = `
        <div class="toolbar">
          <div class="seg"><button data-m="-1">‹</button><button class="active" style="min-width:150px;text-transform:capitalize">${monthLabel(k)}</button><button data-m="1">›</button></div>
          <select id="lo-prop"><option value="">Tous les immeubles</option>${db.t('properties').map(p => `<option value="${p.id}" ${state.prop === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <span class="grow"></span>
          <button class="btn ghost sm" id="lo-bank">Importer un relevé bancaire</button><button class="btn ghost sm" id="lo-export">Export CSV</button><button class="btn ghost sm" id="lo-landlord">Bailleur</button><button class="btn sm" id="lo-newlease">+ Bail</button>
        </div>
        <div class="grid c4">
          <div class="card tight kpi"><div class="lbl">Attendu ce mois</div><div class="val">${eur(tot.due)}</div><div class="sub">${groups.reduce((s, g) => s + g.lines.filter(x => x.l).length, 0)} baux · ${tot.vacant} vacant${tot.vacant > 1 ? 's' : ''}</div></div>
          <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">Reçu</div><div class="val">${eur(tot.rec)}</div><div class="sub">APL ${eur(tot.apl)} · locataires ${eur(tot.tenant)} · ${pct(rate)}</div></div>
          <div class="card tight kpi" style="--kpi:#fee2e2;--kpi-c:var(--red)"><div class="lbl">Manquant ce mois</div><div class="val">${eur(tot.missing)}</div><div class="sub">loyers du mois non soldés</div></div>
          <div class="card tight kpi" style="--kpi:#fef3c7;--kpi-c:var(--amber)"><div class="lbl">Reste à récupérer</div><div class="val">${eur(tot.bal)}</div><div class="sub">cumul retards (dont antérieurs ${eur(tot.prev)})</div></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="rent-sheet"><thead><tr><th>Lot</th><th>Locataire</th><th class="num">Loyer HC</th><th class="num">Charges</th><th class="num">Dû</th><th class="num">APL</th><th class="num">Locataire</th><th class="num">Reçu</th><th>Mode</th><th class="num">Manquant</th><th class="num">Retard ant.</th><th class="num">Reste</th><th>Commentaire</th></tr></thead><tbody>
          ${body || '<tr><td colspan="13" class="empty">Aucun lot. Créez d\'abord les lots dans « Lots » ou importez le suivi Excel.</td></tr>'}
          <tr class="total"><td colspan="4">Total ${state.prop ? '' : 'tous immeubles'}</td><td class="num">${eur2(tot.due)}</td><td class="num">${eur2(tot.apl)}</td><td class="num">${eur2(tot.tenant)}</td><td class="num">${eur2(tot.rec)}</td><td></td><td class="num">${eur2(tot.missing)}</td><td class="num">${eur2(tot.prev)}</td><td class="num">${eur2(tot.bal)}</td><td></td></tr>
        </tbody></table></div><p class="muted small">Saisie directe dans les cases (dû, APL, locataire, mode, commentaire) : enregistrement automatique. « Manquant » = dû − reçu du mois ; « Reste » = manquant + retards antérieurs.</p></div>`;
      root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { state.month = shiftMonth(state.month, Number(b.dataset.m)); draw(); });
      root.querySelector('#lo-prop').onchange = e => { state.prop = e.target.value; draw(); };
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
    const state = { q: '', status: 'active', prop: '' };
    const draw = () => {
      const q = state.q.toLowerCase();
      const list = db.t('leases').filter(l => (state.status === 'all' || (state.status === 'active') === (l.active !== false)) && (!state.prop || l.property_id === state.prop) && (!q || [l.tenant, l.tenant_phone, l.tenant_email, lotName(l), propName(l.property_id)].join(' ').toLowerCase().includes(q)))
        .sort((a, b) => propName(a.property_id).localeCompare(propName(b.property_id)) || String(lotName(a)).localeCompare(String(lotName(b)), 'fr', { numeric: true }));
      root.innerHTML = `
        <div class="toolbar"><input type="search" class="grow" id="lz-q" placeholder="Locataire, téléphone, lot…" value="${esc(state.q)}">
          <select id="lz-prop"><option value="">Tous les immeubles</option>${db.t('properties').map(p => `<option value="${p.id}" ${state.prop === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <div class="seg">${[['active', 'En cours'], ['ended', 'Terminés'], ['all', 'Tous']].map(([v, t]) => `<button data-s="${v}" class="${state.status === v ? 'active' : ''}">${t}</button>`).join('')}</div>
          <button class="btn ghost sm" id="lz-export">Export CSV</button><button class="btn" id="lz-new">+ Bail</button></div>
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Immeuble · lot</th><th>Locataire</th><th>Contact</th><th>Tutelle / garant</th><th>Entrée</th><th class="num">Loyer + ch.</th><th class="num">APL</th><th>Mode</th><th class="num">Dépôt</th><th class="num">Reste dû</th><th>Révision</th></tr></thead><tbody>
          ${list.map(l => { const bal = round2(balanceOf(l.id)); const rev = l.revision_date ? daysSince(l.revision_date) : null; return `<tr class="click" data-lease="${l.id}"><td><b>${esc(propName(l.property_id))}</b><div class="small muted">lot ${esc(lotName(l))}</div></td><td><b>${esc(l.tenant)}</b>${l.active === false ? `<div class="small muted">sorti le ${fmtDate(l.end_date)}</div>` : ''}</td><td class="small">${esc(l.tenant_phone || '')}<br>${esc(l.tenant_email || '')}</td><td class="small">${esc([l.guardian_name, l.guardian_phone, l.guardian_email].filter(Boolean).join(' · '))}</td><td class="nowrap">${fmtDate(l.start_date)}</td><td class="num">${eur2((Number(l.rent) || 0) + (Number(l.charges) || 0))}</td><td class="num">${Number(l.apl) ? eur2(l.apl) : ''}</td><td class="small">${esc(l.payment_mode || '')}</td><td class="num">${l.deposit ? eur(l.deposit) : ''}</td><td class="num"><b class="${bal > 0.005 ? 'status-lost' : bal < -0.005 ? 'status-won' : ''}">${bal ? eur2(bal) : ''}</b></td><td class="small ${rev !== null && rev >= -30 ? 'status-lost' : ''}">${l.revision_date ? fmtDate(l.revision_date) : ''}</td></tr>`; }).join('') || '<tr><td colspan="11" class="empty">Aucun bail</td></tr>'}
        </tbody></table></div><p class="muted small">${list.length} bail${list.length > 1 ? 'x' : ''} · reste à récupérer ${eur2(list.reduce((s, l) => s + balanceOf(l.id), 0))}</p></div>`;
      root.querySelector('#lz-q').oninput = e => { state.q = e.target.value; draw(); const i = root.querySelector('#lz-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
      root.querySelector('#lz-prop').onchange = e => { state.prop = e.target.value; draw(); };
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
    const draw = () => {
      const k = isoDay().slice(0, 7);
      const props = db.t('properties').sort((a, b) => a.name.localeCompare(b.name));
      root.innerHTML = `<div class="toolbar"><span class="muted small">Un lot = un logement ou un local loué séparément. Les immeubles se créent dans Patrimoine › Biens.</span><span class="grow"></span><button class="btn" id="un-new">+ Lot</button></div>
        ${props.map(p => { const units = db.t('units').filter(u => u.property_id === p.id).sort(unitSort); if (!units.length && !scope.canPatrimony) return ''; return `<div class="card"><div class="card-head"><h2>${esc(p.name)}</h2><span class="muted small">${esc([p.holding_name, p.address, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</span></div>
          <div class="table-wrap"><table><thead><tr><th>Lot</th><th>Type</th><th class="num">Surface</th><th>DPE</th><th>GES</th><th>Eau</th><th>Locataire actuel</th><th class="num">Loyer + ch.</th><th></th></tr></thead><tbody>
          ${units.map(u => { const l = db.t('leases').find(x => x.unit_id === u.id && x.active !== false && activeInMonth(x, k)); return `<tr class="${u.active === false ? 'muted' : ''}"><td><b>${esc(u.name)}</b>${u.active === false ? ' <span class="pill">hors service</span>' : ''}</td><td>${esc(u.unit_type || '')}</td><td class="num">${u.surface ? num(u.surface) + ' m²' : ''}</td><td>${u.dpe ? `<span class="pill ${'FG'.includes(u.dpe) ? 'bad' : 'ABC'.includes(u.dpe) ? 'ok' : ''}">${esc(u.dpe)}</span>` : ''}</td><td>${esc(u.ges || '')}</td><td class="small">${u.water_flat === true ? 'forfait' : u.water_flat === false ? 'non' : ''}</td><td>${l ? `<a href="#" data-lease="${l.id}">${esc(l.tenant)}</a>` : '<span class="pill warn">Vacant</span>'}</td><td class="num">${l ? eur2((Number(l.rent) || 0) + (Number(l.charges) || 0)) : ''}</td><td class="right"><button class="btn ghost sm" data-unit="${u.id}">✎</button>${l ? '' : ` <button class="btn ghost sm" data-newlease="${u.id}">+ Bail</button>`}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">Aucun lot</td></tr>'}
          </tbody></table></div></div>`; }).join('')}`;
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
  title: () => 'Gestion locative — à faire',
  render(root) {
    if (!scope.canRental) return denied(root);
    const draw = () => {
      const k = isoDay().slice(0, 7);
      const leases = db.t('leases');
      const arrears = leases.map(l => ({ l, bal: round2(balanceOf(l.id)) })).filter(x => x.bal > 0.005).sort((a, b) => b.bal - a.bal);
      const vacants = db.t('units').filter(u => u.active !== false && !leases.some(l => l.unit_id === u.id && l.active !== false && activeInMonth(l, k)));
      const revisions = leases.filter(l => l.active !== false && l.revision_date && daysSince(l.revision_date) >= -60).sort((a, b) => a.revision_date.localeCompare(b.revision_date));
      const noContact = leases.filter(l => l.active !== false && !l.tenant_phone && !l.tenant_email && !l.guardian_phone);
      const credit = leases.map(l => ({ l, bal: round2(balanceOf(l.id)) })).filter(x => x.bal < -0.005);
      const row = (l, right) => `<div class="act-row" style="cursor:pointer;margin-bottom:6px" data-lease="${l.id}"><div style="flex:1"><b>${esc(l.tenant)}</b> <span class="muted small">${esc(propName(l.property_id))} · lot ${esc(lotName(l))}${l.active === false ? ' · bail terminé' : ''}</span></div>${right}</div>`;
      root.innerHTML = `<div class="grid c2">
        <div class="card"><h3>Loyers en retard — ${eur2(arrears.reduce((s, x) => s + x.bal, 0))} sur ${arrears.length} locataire${arrears.length > 1 ? 's' : ''}</h3>${arrears.map(({ l, bal }) => row(l, `<b class="status-lost">${eur2(bal)}</b> <button class="btn ghost sm" data-relance="${l.id}">Relance</button>`)).join('') || '<div class="empty">Aucun retard</div>'}</div>
        <div>
          <div class="card" style="margin-bottom:18px"><h3>Lots vacants (${vacants.length})</h3>${vacants.map(u => `<div class="act-row" style="margin-bottom:6px"><div style="flex:1"><b>${esc(propName(u.property_id))}</b> · lot ${esc(u.name)} <span class="muted small">${esc(u.unit_type || '')}${u.surface ? ' · ' + num(u.surface) + ' m²' : ''}</span></div><button class="btn ghost sm" data-newlease="${u.id}">+ Bail</button></div>`).join('') || '<div class="empty">Aucun lot vacant</div>'}</div>
          <div class="card" style="margin-bottom:18px"><h3>Révisions de loyer à venir / dépassées</h3>${revisions.map(l => row(l, `<span class="${daysSince(l.revision_date) >= 0 ? 'status-lost' : ''}">${fmtDate(l.revision_date)}</span>`)).join('') || '<div class="empty">Aucune révision planifiée — renseignez la date de révision IRL dans chaque bail</div>'}</div>
          <div class="card" style="margin-bottom:18px"><h3>Trop-perçus / avances (${credit.length})</h3>${credit.map(({ l, bal }) => row(l, `<b class="status-won">${eur2(-bal)}</b>`)).join('') || '<div class="empty">Aucun</div>'}</div>
          <div class="card"><h3>Baux sans coordonnées (${noContact.length})</h3>${noContact.map(l => row(l, '')).join('') || '<div class="empty">Tous les locataires ont un contact</div>'}</div>
        </div></div>`;
      root.querySelectorAll('[data-lease]').forEach(el => el.onclick = () => openLease(el.dataset.lease, draw));
      root.querySelectorAll('[data-relance]').forEach(b => b.onclick = e => { e.stopPropagation(); generateDocument('relance', db.byId('leases', b.dataset.relance)); });
      root.querySelectorAll('[data-newlease]').forEach(b => b.onclick = () => { const u = db.byId('units', b.dataset.newlease); leaseForm(null, { unit_id: u.id, property_id: u.property_id }, draw); });
    };
    draw();
    return { refresh: draw };
  },
};
