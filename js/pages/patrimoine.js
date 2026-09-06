// Module Patrimoine immobilier : vue d'ensemble, biens, prêts, loyers, charges.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { INVEST_TYPES, STRUCTURES, PROPERTY_STATUS, EXPENSE_CATEGORIES, RECURRENCES, schedule, loanStatus, monthlyPayment, monthlyEquivalent, propertyMetrics, totalMonths } from '../data/finance.js';
import { documentsSection, bindDocuments } from '../documents.js';
import { leaseForm, openLease } from './locatif.js';
import { esc, eur, pct, num, openModal, closeModal, renderForm, readForm, toast, fmtDate, confirm, csvDownload, isoDay } from '../ui.js';

const eur2 = (n) => eur(n, { maximumFractionDigits: 2 });
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const propName = (id) => db.byId('properties', id)?.name || '—';
const denied = (root) => { root.innerHTML = '<div class="card"><div class="empty">Module réservé à la direction (accès patrimoine).</div></div>'; return {}; };

function allMetrics(year) {
  const loans = db.t('loans'), leases = db.t('leases'), expenses = db.t('expenses'), payments = db.t('rent_payments');
  return db.t('properties').filter(p => p.status !== 'Vendu').map(p => ({ p, m: propertyMetrics(p, loans, leases, expenses, payments, year) }));
}

// ======================================================================
//  Formulaires
// ======================================================================
export function propertyForm(existing = null, onSaved, onClose = null) {
  const spec = [
    { key: 'name', label: 'Nom du bien', type: 'text', required: true, half: true, placeholder: 'Ex. T2 rue des Halles' },
    { key: 'status', label: 'Statut', type: 'select', options: PROPERTY_STATUS, required: true, half: true, value: 'Loué' },
    { key: 'invest_type', label: "Type d'investissement", type: 'select', options: INVEST_TYPES, required: true, half: true },
    { key: 'structure', label: 'Structure de détention', type: 'select', options: STRUCTURES, required: true, half: true },
    { key: 'address', label: 'Adresse', type: 'text' },
    { key: 'postal_code', label: 'Code postal', type: 'text', half: true },
    { key: 'city', label: 'Ville', type: 'text', half: true },
    { key: 'surface', label: 'Surface (m²)', type: 'number', half: true, step: '0.1' },
    { key: 'purchase_date', label: "Date d'achat", type: 'date', half: true },
    { key: 'price', label: "Prix d'achat (€)", type: 'number', half: true },
    { key: 'notary_fees', label: 'Frais de notaire (€)', type: 'number', half: true },
    { key: 'works', label: 'Travaux (€)', type: 'number', half: true },
    { key: 'other_costs', label: 'Autres frais (€) — agence, courtage, mobilier', type: 'number', half: true },
    { key: 'current_value', label: 'Valeur estimée actuelle (€)', type: 'number', half: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const m = openModal(existing ? 'Modifier le bien' : 'Nouveau bien', `<form class="form" id="pf">${renderForm(spec, existing || {})}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="pf-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true, onClose });
  const form = m.querySelector('#pf');
  form.onsubmit = async e => {
    e.preventDefault(); const v = readForm(form, spec); if (!v.purchase_date) v.purchase_date = null;
    try { let id = existing?.id; if (existing) await db.update('properties', id, v); else id = (await db.insert('properties', v)).id; closeModal(true); toast('Bien enregistré'); onSaved?.(id); }
    catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#pf-del')?.addEventListener('click', async () => {
    if (db.t('loans').some(l => l.property_id === existing.id) || db.t('leases').some(l => l.property_id === existing.id)) return toast('Supprimez d\'abord les prêts et baux de ce bien', 'warn');
    if (!await confirm('Supprimer ce bien et ses charges ?')) return;
    for (const x of db.t('expenses').filter(x => x.property_id === existing.id)) await db.remove('expenses', x.id);
    await db.remove('properties', existing.id); closeModal(true); toast('Bien supprimé'); onSaved?.(null);
  });
}

export function loanForm(existing = null, presets = {}, onSaved, onClose = null) {
  const props = db.t('properties');
  const spec = [
    { key: 'property_id', label: 'Bien financé', type: 'select', options: props.map(p => [p.id, p.name]), required: true, half: true },
    { key: 'bank', label: 'Banque', type: 'text', half: true },
    { key: 'label', label: 'Intitulé', type: 'text', half: true, placeholder: 'Ex. Prêt principal' },
    { key: 'loan_number', label: 'N° de crédit', type: 'text', half: true },
    { key: 'principal', label: 'Capital emprunté (€)', type: 'number', required: true, half: true, step: '0.01' },
    { key: 'rate', label: 'Taux nominal annuel (%)', type: 'number', required: true, half: true, step: '0.001' },
    { key: 'start_date', label: '1re échéance (date)', type: 'date', required: true, half: true, hint: 'Date du premier prélèvement (différé compris), pas la date de déblocage' },
    { key: 'duration_months', label: "Durée d'amortissement (mois, hors différé)", type: 'number', required: true, half: true },
    { key: 'deferral_months', label: 'Différé (mois)', type: 'number', half: true, value: 0 },
    { key: 'deferral_type', label: 'Type de différé', type: 'select', options: [['partial', 'Partiel — intérêts payés, capital gelé'], ['total', 'Total — rien payé, intérêts ajoutés au capital']], half: true, value: 'partial' },
    { key: 'insurance_monthly', label: 'Assurance (€/mois)', type: 'number', half: true, step: '0.01' },
    { key: 'monthly_payment', label: 'Mensualité hors assurance imposée (€) — facultatif', type: 'number', half: true, step: '0.01', hint: 'À renseigner seulement si la banque affiche une mensualité différente du calcul' },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ];
  const m = openModal(existing ? 'Modifier le prêt' : 'Nouveau prêt', `<form class="form" id="lf">${renderForm(spec, existing || presets)}
    <div class="field"><div class="small muted" id="lf-preview"></div></div>
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="lf-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true, onClose });
  const form = m.querySelector('#lf');
  const preview = () => {
    const v = readForm(form, spec); const el = m.querySelector('#lf-preview');
    if (!(v.principal && v.duration_months && v.start_date)) { el.textContent = ''; return; }
    const st = loanStatus(v); const rows = schedule(v); const first = rows.find(r => !r.deferred);
    el.innerHTML = `Mensualité d'amortissement : <b>${eur2(first ? first.payment - (v.insurance_monthly || 0) : 0)}</b> hors assurance, ${eur2(first ? first.payment : 0)} avec assurance${v.deferral_months ? ` · pendant le différé : ${eur2(rows[0].payment)}/mois` : ''} · ${totalMonths(v)} échéances · dernière le <b>${fmtDate(st.endDate)}</b> · coût total ${eur(st.totalCost)}`;
  };
  form.addEventListener('input', preview); form.addEventListener('change', preview); preview();
  form.onsubmit = async e => {
    e.preventDefault(); const v = readForm(form, spec);
    try { let id = existing?.id; if (existing) await db.update('loans', id, v); else id = (await db.insert('loans', v)).id; closeModal(true); toast('Prêt enregistré'); onSaved?.(id); }
    catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#lf-del')?.addEventListener('click', async () => { if (!await confirm('Supprimer ce prêt ?')) return; await db.remove('loans', existing.id); closeModal(true); toast('Prêt supprimé'); onSaved?.(null); });
}

export function expenseForm(existing = null, presets = {}, onSaved, onClose = null) {
  const props = db.t('properties');
  const spec = [
    { key: 'property_id', label: 'Bien', type: 'select', options: props.map(p => [p.id, p.name]), required: true, half: true },
    { key: 'category', label: 'Catégorie', type: 'select', options: EXPENSE_CATEGORIES, required: true, half: true },
    { key: 'label', label: 'Libellé', type: 'text', required: true, half: true },
    { key: 'amount', label: 'Montant (€)', type: 'number', required: true, half: true, step: '0.01' },
    { key: 'recurrence', label: 'Récurrence', type: 'select', options: RECURRENCES, required: true, half: true, value: 'yearly' },
    { key: 'date', label: 'Date (ponctuelle) ou prochaine échéance', type: 'date', half: true },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
  ];
  const m = openModal(existing ? 'Modifier la charge' : 'Nouvelle charge', `<form class="form" id="xf">${renderForm(spec, existing || presets)}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="xf-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { onClose });
  const form = m.querySelector('#xf');
  form.onsubmit = async e => {
    e.preventDefault(); const v = readForm(form, spec); if (!v.date) v.date = null;
    try { let id = existing?.id; if (existing) await db.update('expenses', id, v); else id = (await db.insert('expenses', v)).id; closeModal(true); toast('Charge enregistrée'); onSaved?.(id); }
    catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#xf-del')?.addEventListener('click', async () => { if (!await confirm('Supprimer cette charge ?')) return; await db.remove('expenses', existing.id); closeModal(true); toast('Charge supprimée'); onSaved?.(null); });
}

// ======================================================================
//  Fiches (modales)
// ======================================================================
export function openLoanSchedule(id, onChange) {
  const render = () => {
    const l = db.byId('loans', id); if (!l) return closeModal();
    const rows = schedule(l); const st = loanStatus(l);
    const todayIso = isoDay();
    const byYear = {};
    for (const r of rows) { const y = r.date.slice(0, 4); byYear[y] ||= { interest: 0, capital: 0, insurance: 0, payment: 0, balance: 0 }; byYear[y].interest += r.interest; byYear[y].capital += r.capital; byYear[y].insurance += r.insurance; byYear[y].payment += r.payment; byYear[y].balance = r.balance; }
    const html = `
      <div class="loan-summary">
        <div><span>Montant emprunté</span><b>${eur2(l.principal)}</b></div>
        <div><span>Capital restant dû</span><b>${eur2(st.balance)}</b></div>
        <div><span>Déjà remboursé (capital)</span><b>${eur2(st.capitalPaid)}</b></div>
        <div><span>Prochaine échéance</span><b>${st.nextDate ? fmtDate(st.nextDate) : '—'}</b></div>
        <div><span>Montant de l'échéance</span><b>${eur2(st.monthly)}</b></div>
        <div><span>Taux fixe</span><b>${num(l.rate)} %</b></div>
        <div><span>Durée</span><b>${l.duration_months} mois${l.deferral_months ? ` + ${l.deferral_months} de différé ${l.deferral_type === 'total' ? 'total' : 'partiel'}` : ''}</b></div>
        <div><span>1re échéance</span><b>${fmtDate(st.startDate)}</b></div>
        <div><span>Dernière échéance</span><b>${fmtDate(st.endDate)}</b></div>
        ${l.loan_number ? `<div><span>N° de crédit</span><b>${esc(l.loan_number)}</b></div>` : ''}
        ${l.insurance_monthly ? `<div><span>Assurance</span><b>${eur2(l.insurance_monthly)}/mois</b></div>` : ''}
      </div>
      <div class="grid c4" style="margin-bottom:16px">
        <div class="card tight kpi"><div class="lbl">Capital restant dû</div><div class="val">${eur(st.balance)}</div><div class="sub">${st.paidCount}/${st.total} échéances réglées</div></div>
        <div class="card tight kpi" style="--kpi:#dbeafe;--kpi-c:var(--blue)"><div class="lbl">Mensualité</div><div class="val">${eur2(st.monthly)}</div><div class="sub">assurance incluse</div></div>
        <div class="card tight kpi" style="--kpi:#fef3c7;--kpi-c:var(--amber)"><div class="lbl">Intérêts payés</div><div class="val">${eur(st.interestPaid)}</div><div class="sub">sur ${eur(st.totalInterest)} au total</div></div>
        <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">Fin du prêt</div><div class="val" style="font-size:22px">${fmtDate(st.endDate)}</div><div class="sub">coût total ${eur(st.totalCost)}</div></div>
      </div>
      <div class="toolbar" style="margin-bottom:10px"><div class="seg"><button data-v="year" class="active">Par année</button><button data-v="month">Mois par mois</button></div><span class="grow"></span><button class="btn ghost sm" id="ls-export">Export CSV</button><button class="btn ghost sm" id="ls-edit">✎ Modifier le prêt</button></div>
      <div class="table-wrap" id="ls-year"><table><thead><tr><th>Année</th><th class="num">Échéances</th><th class="num">Intérêts</th><th class="num">Capital</th><th class="num">Assurance</th><th class="num">CRD fin d'année</th></tr></thead><tbody>
        ${Object.entries(byYear).map(([y, v]) => `<tr><td><b>${y}</b></td><td class="num">${eur2(v.payment)}</td><td class="num">${eur2(v.interest)}</td><td class="num">${eur2(v.capital)}</td><td class="num">${eur2(v.insurance)}</td><td class="num"><b>${eur(v.balance)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <div class="table-wrap" id="ls-month" hidden style="max-height:420px;overflow:auto"><table><thead><tr><th>#</th><th>Date</th><th class="num">Échéance</th><th class="num">Intérêts</th><th class="num">Capital</th><th class="num">Assurance</th><th class="num">CRD</th></tr></thead><tbody>
        ${rows.map(r => `<tr style="${r.date <= todayIso ? 'color:var(--muted)' : ''}${st.next && r.k === st.next.k ? ';background:#fff7ed;font-weight:700' : ''}"><td>${r.k}${r.deferred ? ' <span class="pill warn" style="font-size:10px;padding:1px 6px">différé</span>' : ''}</td><td class="nowrap">${fmtDate(r.date)}</td><td class="num">${eur2(r.payment)}</td><td class="num">${eur2(r.interest)}</td><td class="num">${eur2(r.capital)}</td><td class="num">${eur2(r.insurance)}</td><td class="num">${eur2(r.balance)}</td></tr>`).join('')}
      </tbody></table></div>
      ${documentsSection('loans', l.id)}`;
    const m = openModal(`${l.label || 'Prêt'} — ${propName(l.property_id)}${l.bank ? ' · ' + l.bank : ''}`, html, { wide: true, onClose: () => onChange?.() });
    m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { m.querySelectorAll('[data-v]').forEach(x => x.classList.remove('active')); b.classList.add('active'); m.querySelector('#ls-year').hidden = b.dataset.v !== 'year'; m.querySelector('#ls-month').hidden = b.dataset.v !== 'month'; });
    m.querySelector('#ls-export').onclick = () => csvDownload(`amortissement-${(l.label || 'pret').replace(/\s+/g, '-')}.csv`, rows.map(r => ({ echeance: r.k, date: r.date, mensualite: r.payment, interets: r.interest, capital: r.capital, assurance: r.insurance, capital_restant_du: r.balance })));
    m.querySelector('#ls-edit').onclick = () => loanForm(l, {}, (nid) => nid ? render() : onChange?.(), render);
    bindDocuments(m, 'loans', l.id, render);
  };
  render();
}

export function openProperty(id, onChange) {
  const render = () => {
    const p = db.byId('properties', id); if (!p) return closeModal();
    const year = new Date().getFullYear();
    const m0 = propertyMetrics(p, db.t('loans'), db.t('leases'), db.t('expenses'), db.t('rent_payments'), year);
    const loans = db.t('loans').filter(l => l.property_id === id);
    const leases = db.t('leases').filter(l => l.property_id === id).sort((a, b) => (b.active === true) - (a.active === true));
    const expenses = db.t('expenses').filter(x => x.property_id === id).sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));
    const html = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div><span class="pill ${p.status === 'Loué' ? 'ok' : p.status === 'Vacant' ? 'bad' : p.status === 'Résidence principale' ? 'info' : 'warn'}">${esc(p.status)}</span> <span class="pill">${esc(p.invest_type || '')}</span> <span class="pill info">${esc(p.structure || '')}</span><div class="muted small" style="margin-top:4px">${esc([p.address, p.postal_code, p.city].filter(Boolean).join(', '))}${p.surface ? ' · ' + num(p.surface) + ' m²' : ''}${p.purchase_date ? ' · acheté le ' + fmtDate(p.purchase_date) : ''}</div></div>
        <div class="toolbar"><button class="btn sm" id="p-loan">+ Prêt</button><button class="btn sm" id="p-lease">+ Bail</button><button class="btn sm" id="p-exp">+ Charge</button><button class="btn ghost sm" id="p-edit">✎ Modifier</button></div>
      </div>
      <div class="grid c4" style="margin-bottom:18px">
        <div class="card tight kpi"><div class="lbl">Coût total d'acquisition</div><div class="val">${eur(m0.cost)}</div><div class="sub">valeur estimée ${eur(m0.value)}</div></div>
        <div class="card tight kpi" style="--kpi:#fee2e2;--kpi-c:var(--red)"><div class="lbl">Capital restant dû</div><div class="val">${eur(m0.debt)}</div><div class="sub">mensualités ${eur2(m0.loanMonthly)}/mois</div></div>
        <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">Loyers</div><div class="val">${eur(m0.rentMonthly)}<span style="font-size:14px">/mois</span></div><div class="sub">charges ${eur(m0.chargesMonthly)}/mois</div></div>
        <div class="card tight kpi" style="--kpi:${m0.cashflow >= 0 ? '#dcfce7' : '#fee2e2'};--kpi-c:${m0.cashflow >= 0 ? 'var(--green)' : 'var(--red)'}"><div class="lbl">Cash-flow mensuel</div><div class="val">${eur2(m0.cashflow)}</div><div class="sub">brut ${pct(m0.grossYield)} · net ${pct(m0.netYield)}</div></div>
      </div>
      <div class="detail">
        <div>
          <div class="section"><h3>Prêts (${loans.length})</h3>${loans.map(l => { const st = loanStatus(l); return `<div class="act-row" style="cursor:pointer;margin-bottom:6px" data-loan="${l.id}"><div style="flex:1"><b>${esc(l.label || 'Prêt')}</b> <span class="muted small">${esc(l.bank || '')} · ${num(l.rate)} % · ${totalMonths(l)} mois</span><div class="small muted">CRD ${eur(st.balance)} · ${eur2(st.monthly)}/mois · fin ${fmtDate(st.endDate)}</div></div></div>`; }).join('') || '<div class="empty">Aucun prêt (bien payé comptant ?)</div>'}</div>
          <div class="section"><h3>Baux (${leases.length})</h3>${leases.map(l => `<div class="act-row ${l.active === false ? 'done' : ''}" style="cursor:pointer;margin-bottom:6px" data-lease="${l.id}"><div style="flex:1"><b>${esc(l.lot || 'Logement')}</b> — ${esc(l.tenant)}<div class="small muted">${eur(l.rent)}/mois${l.charges ? ' + ' + eur(l.charges) + ' charges' : ''} · depuis ${fmtDate(l.start_date)}${l.end_date ? ' → ' + fmtDate(l.end_date) : ''}</div></div></div>`).join('') || '<div class="empty">Aucun bail</div>'}</div>
        </div>
        <div>
          <div class="section"><h3>Charges — ${eur(m0.chargesMonthly)}/mois équivalent</h3>${expenses.map(x => `<div class="act-row" style="cursor:pointer;margin-bottom:6px" data-exp="${x.id}"><div style="flex:1"><b>${esc(x.label)}</b> <span class="muted small">${esc(x.category)}</span><div class="small muted">${eur2(x.amount)} · ${esc(RECURRENCES.find(r => r[0] === x.recurrence)?.[1] || '')}${x.date ? ' · ' + fmtDate(x.date) : ''}</div></div></div>`).join('') || '<div class="empty">Aucune charge saisie</div>'}</div>
          ${p.notes ? `<div class="section"><h3>Notes</h3><div class="small">${esc(p.notes)}</div></div>` : ''}
          ${documentsSection('properties', p.id)}
        </div>
      </div>`;
    const m = openModal(p.name, html, { wide: true, onClose: () => onChange?.() });
    const refresh = () => { render(); onChange?.(); };
    m.querySelector('#p-edit').onclick = () => propertyForm(p, (nid) => nid ? refresh() : onChange?.(), render);
    m.querySelector('#p-loan').onclick = () => loanForm(null, { property_id: id }, refresh, render);
    m.querySelector('#p-lease').onclick = () => leaseForm(null, { property_id: id }, refresh, render);
    m.querySelector('#p-exp').onclick = () => expenseForm(null, { property_id: id }, refresh, render);
    bindDocuments(m, 'properties', id, render);
    m.querySelectorAll('[data-loan]').forEach(el => el.onclick = () => openLoanSchedule(el.dataset.loan, render));
    m.querySelectorAll('[data-lease]').forEach(el => el.onclick = () => openLease(el.dataset.lease, render));
    m.querySelectorAll('[data-exp]').forEach(el => el.onclick = () => expenseForm(db.byId('expenses', el.dataset.exp), {}, refresh, render));
  };
  render();
}

// ======================================================================
//  Pages
// ======================================================================
export const patrimoinePage = {
  title: () => 'Patrimoine immobilier',
  render(root) {
    if (!scope.canPatrimony) return denied(root);
    let charts = [];
    const draw = () => {
      const year = new Date().getFullYear(); const monthKey = isoDay().slice(0, 7);
      const rows = allMetrics(year);
      const tot = rows.reduce((t, { m }) => ({ cost: t.cost + m.cost, value: t.value + m.value, debt: t.debt + m.debt, rent: t.rent + m.rentMonthly, charges: t.charges + m.chargesMonthly, loan: t.loan + m.loanMonthly, cashflow: t.cashflow + m.cashflow }), { cost: 0, value: 0, debt: 0, rent: 0, charges: 0, loan: 0, cashflow: 0 });
      const activeLeases = db.t('leases').filter(l => l.active !== false);
      const expectedMonth = activeLeases.reduce((s, l) => s + (Number(l.rent) || 0), 0);
      const receivedMonth = db.t('rent_payments').filter(x => x.month === monthKey && activeLeases.some(l => l.id === x.lease_id)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const unpaid = activeLeases.filter(l => { const paid = db.t('rent_payments').filter(x => x.lease_id === l.id && x.month === monthKey).reduce((s, x) => s + (Number(x.amount) || 0), 0); return paid < (Number(l.rent) || 0); });
      const byType = {}, byStruct = {};
      for (const { p, m } of rows) { byType[p.invest_type || 'Autre'] = (byType[p.invest_type || 'Autre'] || 0) + m.value; byStruct[p.structure || 'Autre'] = (byStruct[p.structure || 'Autre'] || 0) + m.value; }
      // Désendettement : CRD total au 31/12 de chaque année
      const loans = db.t('loans'); const years = []; const y0 = year;
      const maxEnd = loans.reduce((mx, l) => { const st = loanStatus(l); return st.endDate && st.endDate > mx ? st.endDate : mx; }, `${y0}-01-01`);
      const yEnd = Math.min(Number(maxEnd.slice(0, 4)), y0 + 25);
      for (let y = y0; y <= yEnd; y++) years.push({ y, debt: loans.reduce((s, l) => s + loanStatus(l, new Date(y, 11, 31)).balance, 0) });

      root.innerHTML = `
        ${db.demo ? '<div class="demo-banner"><b>Mode démo</b> — biens et prêts d\'exemple.</div>' : ''}
        <div class="grid c4">
          <div class="card kpi"><div class="lbl">Valeur du patrimoine</div><div class="val">${eur(tot.value)}</div><div class="sub">${rows.length} bien${rows.length > 1 ? 's' : ''} · coût d'acquisition ${eur(tot.cost)}</div></div>
          <div class="card kpi" style="--kpi:#fee2e2;--kpi-c:var(--red)"><div class="lbl">Capital restant dû</div><div class="val">${eur(tot.debt)}</div><div class="sub">patrimoine net ${eur(tot.value - tot.debt)} · ${tot.value ? pct(tot.debt / tot.value * 100) : '—'} d'endettement</div></div>
          <div class="card kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">Loyers ${MONTHS[new Date().getMonth()]}</div><div class="val">${eur(receivedMonth)}<span style="font-size:16px;color:var(--muted)"> / ${eur(expectedMonth)}</span></div><div class="sub">${unpaid.length ? `<span class="status-lost">${unpaid.length} loyer${unpaid.length > 1 ? 's' : ''} en attente</span>` : 'tous les loyers encaissés'}</div></div>
          <div class="card kpi" style="--kpi:${tot.cashflow >= 0 ? '#dcfce7' : '#fee2e2'};--kpi-c:${tot.cashflow >= 0 ? 'var(--green)' : 'var(--red)'}"><div class="lbl">Cash-flow mensuel</div><div class="val">${eur2(tot.cashflow)}</div><div class="sub">loyers ${eur(tot.rent)} − charges ${eur(tot.charges)} − crédits ${eur(tot.loan)}</div></div>
        </div>
        <div class="card"><div class="card-head"><h2>Les biens</h2><div class="toolbar"><button class="btn ghost sm" id="pt-export">Export CSV</button><button class="btn sm" id="pt-new">+ Bien</button></div></div>
          <div class="table-wrap"><table><thead><tr><th>Bien</th><th>Type</th><th>Structure</th><th class="num">Coût total</th><th class="num">Valeur</th><th class="num">CRD</th><th class="num">Loyer/mois</th><th class="num">Charges/mois</th><th class="num">Crédit/mois</th><th class="num">Cash-flow</th><th class="num">Rdt brut</th><th class="num">Rdt net</th></tr></thead><tbody>
            ${rows.map(({ p, m }) => `<tr class="click" data-prop="${p.id}"><td><b>${esc(p.name)}</b><div class="small muted">${esc(p.city || '')} · <span class="${p.status === 'Loué' ? 'status-won' : 'status-lost'}">${esc(p.status)}</span></div></td><td class="small">${esc(p.invest_type || '')}</td><td class="small">${esc(p.structure || '')}</td><td class="num">${eur(m.cost)}</td><td class="num">${eur(m.value)}</td><td class="num">${eur(m.debt)}</td><td class="num">${eur(m.rentMonthly)}</td><td class="num">${eur(m.chargesMonthly)}</td><td class="num">${eur(m.loanMonthly)}</td><td class="num ${m.cashflow >= 0 ? 'status-won' : 'status-lost'}">${eur2(m.cashflow)}</td><td class="num">${pct(m.grossYield)}</td><td class="num">${pct(m.netYield)}</td></tr>`).join('') || '<tr><td colspan="12" class="empty">Aucun bien — commencez par « + Bien »</td></tr>'}
            ${rows.length ? `<tr class="total"><td colspan="3">Total</td><td class="num">${eur(tot.cost)}</td><td class="num">${eur(tot.value)}</td><td class="num">${eur(tot.debt)}</td><td class="num">${eur(tot.rent)}</td><td class="num">${eur(tot.charges)}</td><td class="num">${eur(tot.loan)}</td><td class="num">${eur2(tot.cashflow)}</td><td class="num">${tot.cost ? pct(tot.rent * 12 / tot.cost * 100) : '—'}</td><td class="num">${tot.cost ? pct((tot.rent - tot.charges) * 12 / tot.cost * 100) : '—'}</td></tr>` : ''}
          </tbody></table></div></div>
        <div class="grid c3">
          <div class="card"><div class="card-head"><h2>Désendettement</h2><span class="muted small">CRD au 31/12</span></div><div class="chart-box"><canvas id="ch-debt"></canvas></div></div>
          <div class="card"><div class="card-head"><h2>Par type</h2><span class="muted small">valeur</span></div><div class="chart-box"><canvas id="ch-type"></canvas></div></div>
          <div class="card"><div class="card-head"><h2>Par structure</h2><span class="muted small">valeur</span></div><div class="chart-box"><canvas id="ch-struct"></canvas></div></div>
        </div>`;
      root.querySelector('#pt-new').onclick = () => propertyForm(null, (id) => { draw(); if (id) openProperty(id, draw); });
      root.querySelector('#pt-export').onclick = () => csvDownload('patrimoine.csv', rows.map(({ p, m }) => ({ bien: p.name, type: p.invest_type, structure: p.structure, statut: p.status, cout_total: m.cost, valeur: m.value, crd: m.debt, loyer_mensuel: m.rentMonthly, charges_mensuelles: m.chargesMonthly, credit_mensuel: m.loanMonthly, cashflow_mensuel: m.cashflow, rendement_brut: m.grossYield.toFixed(2), rendement_net: m.netYield.toFixed(2) })));
      root.querySelectorAll('[data-prop]').forEach(tr => tr.onclick = () => openProperty(tr.dataset.prop, draw));
      charts.forEach(c => c.destroy()); charts = [];
      if (window.Chart) {
        const palette = ['#f26522', '#2563eb', '#0f9d58', '#7c3aed', '#d97706', '#0891b2', '#be123c', '#4b5563'];
        charts.push(new Chart(root.querySelector('#ch-debt'), { type: 'line', data: { labels: years.map(x => x.y), datasets: [{ label: 'CRD', data: years.map(x => x.debt), borderColor: '#f26522', backgroundColor: 'rgba(242,101,34,.12)', fill: true, tension: .3, pointRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => eur(c.raw) } } }, scales: { y: { ticks: { callback: v => (v / 1000) + ' k€' }, grid: { color: '#eef0f3' } }, x: { grid: { display: false } } } } }));
        const donut = (el, obj) => new Chart(el, { type: 'doughnut', data: { labels: Object.keys(obj), datasets: [{ data: Object.values(obj), backgroundColor: palette, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => `${c.label} : ${eur(c.raw)}` } } } } });
        charts.push(donut(root.querySelector('#ch-type'), byType), donut(root.querySelector('#ch-struct'), byStruct));
      }
    };
    draw();
    return { refresh: draw, destroy: () => charts.forEach(c => c.destroy()) };
  },
};

export const loansPage = {
  title: () => 'Prêts immobiliers',
  render(root) {
    if (!scope.canPatrimony) return denied(root);
    const draw = () => {
      const loans = db.t('loans').map(l => ({ l, st: loanStatus(l) })).sort((a, b) => b.st.balance - a.st.balance);
      const tot = loans.reduce((t, { l, st }) => ({ principal: t.principal + (Number(l.principal) || 0), balance: t.balance + st.balance, monthly: t.monthly + st.monthly, interest: t.interest + st.totalInterest }), { principal: 0, balance: 0, monthly: 0, interest: 0 });
      root.innerHTML = `
        <div class="toolbar"><span class="muted small">${loans.length} prêt${loans.length > 1 ? 's' : ''}</span><span class="grow"></span><button class="btn" id="ln-new">+ Prêt</button></div>
        <div class="grid c4">
          <div class="card tight kpi"><div class="lbl">Emprunté</div><div class="val">${eur(tot.principal)}</div><div class="sub">capital initial cumulé</div></div>
          <div class="card tight kpi" style="--kpi:#fee2e2;--kpi-c:var(--red)"><div class="lbl">Capital restant dû</div><div class="val">${eur(tot.balance)}</div><div class="sub">${tot.principal ? pct(tot.balance / tot.principal * 100) : '—'} du capital initial</div></div>
          <div class="card tight kpi" style="--kpi:#dbeafe;--kpi-c:var(--blue)"><div class="lbl">Mensualités</div><div class="val">${eur2(tot.monthly)}</div><div class="sub">assurances incluses</div></div>
          <div class="card tight kpi" style="--kpi:#fef3c7;--kpi-c:var(--amber)"><div class="lbl">Coût des intérêts</div><div class="val">${eur(tot.interest)}</div><div class="sub">sur la durée totale</div></div>
        </div>
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Prêt</th><th>Bien</th><th>Banque</th><th class="num">Capital</th><th class="num">Taux</th><th class="num">Durée</th><th>Début</th><th class="num">Mensualité</th><th class="num">CRD</th><th>Avancement</th><th>Fin</th></tr></thead><tbody>
          ${loans.map(({ l, st }) => `<tr class="click" data-loan="${l.id}"><td><b>${esc(l.label || 'Prêt')}</b></td><td>${esc(propName(l.property_id))}</td><td class="small">${esc(l.bank || '')}</td><td class="num">${eur(l.principal)}</td><td class="num">${num(l.rate)} %</td><td class="num">${totalMonths(l)} mois</td><td class="nowrap">${fmtDate(l.start_date)}</td><td class="num">${eur2(st.monthly)}</td><td class="num"><b>${eur(st.balance)}</b></td><td><div style="background:#eee;border-radius:99px;height:8px;width:120px;overflow:hidden"><div style="background:var(--green);height:8px;width:${st.total ? Math.round(st.paidCount / st.total * 100) : 0}%"></div></div><span class="small muted">${st.paidCount}/${st.total}</span></td><td class="nowrap">${fmtDate(st.endDate)}</td></tr>`).join('') || '<tr><td colspan="11" class="empty">Aucun prêt</td></tr>'}
        </tbody></table></div></div>`;
      root.querySelector('#ln-new').onclick = () => loanForm(null, {}, (id) => { draw(); if (id) openLoanSchedule(id, draw); });
      root.querySelectorAll('[data-loan]').forEach(tr => tr.onclick = () => openLoanSchedule(tr.dataset.loan, draw));
    };
    draw();
    return { refresh: draw };
  },
};

export const expensesPage = {
  title: () => 'Charges et frais',
  render(root) {
    if (!scope.canPatrimony) return denied(root);
    const state = { prop: '' };
    const draw = () => {
      const props = db.t('properties');
      const list = db.t('expenses').filter(x => !state.prop || x.property_id === state.prop).sort((a, b) => propName(a.property_id).localeCompare(propName(b.property_id)) || monthlyEquivalent(b) - monthlyEquivalent(a));
      const monthly = list.reduce((s, x) => s + monthlyEquivalent(x), 0);
      const year = new Date().getFullYear();
      const once = list.filter(x => x.recurrence === 'once' && (x.date || '').startsWith(String(year))).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const byCat = {}; for (const x of list) byCat[x.category] = (byCat[x.category] || 0) + (x.recurrence === 'once' ? ((x.date || '').startsWith(String(year)) ? Number(x.amount) || 0 : 0) : monthlyEquivalent(x) * 12);
      root.innerHTML = `
        <div class="toolbar"><select id="xp-prop"><option value="">Tous les biens</option>${props.map(p => `<option value="${p.id}" ${state.prop === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <span class="muted small">Récurrent : ${eur(monthly)}/mois (${eur(monthly * 12)}/an) · ponctuel ${year} : ${eur(once)}</span><span class="grow"></span><button class="btn ghost sm" id="xp-export">Export CSV</button><button class="btn" id="xp-new">+ Charge</button></div>
        <div class="grid c2">
          <div class="card"><div class="table-wrap"><table><thead><tr><th>Bien</th><th>Libellé</th><th>Catégorie</th><th class="num">Montant</th><th>Récurrence</th><th class="num">/mois</th><th>Date</th></tr></thead><tbody>
            ${list.map(x => `<tr class="click" data-exp="${x.id}"><td class="small"><b>${esc(propName(x.property_id))}</b></td><td>${esc(x.label)}</td><td class="small">${esc(x.category)}</td><td class="num">${eur2(x.amount)}</td><td class="small">${esc(RECURRENCES.find(r => r[0] === x.recurrence)?.[1] || '')}</td><td class="num">${x.recurrence === 'once' ? '—' : eur2(monthlyEquivalent(x))}</td><td class="nowrap small">${x.date ? fmtDate(x.date) : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Aucune charge</td></tr>'}
          </tbody></table></div></div>
          <div class="card"><h3>Par catégorie (base annuelle ${year})</h3><div class="table-wrap"><table><tbody>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num"><b>${eur(v)}</b></td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div></div>
        </div>`;
      root.querySelector('#xp-prop').onchange = e => { state.prop = e.target.value; draw(); };
      root.querySelector('#xp-new').onclick = () => expenseForm(null, { property_id: state.prop || undefined }, draw);
      root.querySelector('#xp-export').onclick = () => csvDownload('charges.csv', list.map(x => ({ bien: propName(x.property_id), libelle: x.label, categorie: x.category, montant: x.amount, recurrence: x.recurrence, date: x.date, equivalent_mensuel: monthlyEquivalent(x).toFixed(2) })));
      root.querySelectorAll('[data-exp]').forEach(tr => tr.onclick = () => expenseForm(db.byId('expenses', tr.dataset.exp), {}, draw));
    };
    draw();
    return { refresh: draw };
  },
};

export const propertiesPage = {
  title: () => 'Biens immobiliers',
  render(root) {
    if (!scope.canPatrimony) return denied(root);
    const draw = () => {
      const year = new Date().getFullYear();
      const rows = db.t('properties').map(p => ({ p, m: propertyMetrics(p, db.t('loans'), db.t('leases'), db.t('expenses'), db.t('rent_payments'), year) })).sort((a, b) => a.p.name.localeCompare(b.p.name));
      root.innerHTML = `
        <div class="toolbar"><span class="muted small">${rows.length} bien${rows.length > 1 ? 's' : ''}</span><span class="grow"></span><button class="btn" id="pb-new">+ Bien</button></div>
        <div class="grid c3">${rows.map(({ p, m }) => `<div class="card click" data-prop="${p.id}" style="cursor:pointer;border-top:4px solid ${p.status === 'Loué' ? 'var(--green)' : p.status === 'Vacant' ? 'var(--red)' : 'var(--amber)'}">
          <div class="card-head"><h2>${esc(p.name)}</h2><span class="pill ${p.status === 'Loué' ? 'ok' : p.status === 'Vacant' ? 'bad' : p.status === 'Résidence principale' ? 'info' : 'warn'}">${esc(p.status)}</span></div>
          <div class="muted small">${esc([p.address, p.city].filter(Boolean).join(', '))}</div>
          <div class="small" style="margin:6px 0 12px"><span class="pill">${esc(p.invest_type || '')}</span> <span class="pill info">${esc(p.structure || '')}</span>${p.surface ? ` <span class="pill">${num(p.surface)} m²</span>` : ''}</div>
          <div class="hub-kpis"><div><b>${eur(m.value)}</b><span>valeur</span></div><div><b>${eur(m.debt)}</b><span>CRD</span></div><div><b>${eur(m.rentMonthly)}</b><span>loyer / mois</span></div><div><b class="${m.cashflow >= 0 ? 'status-won' : 'status-lost'}">${eur2(m.cashflow)}</b><span>cash-flow</span></div></div>
          <div class="small muted" style="margin-top:8px">Rendement brut ${pct(m.grossYield)} · net ${pct(m.netYield)} · ${m.leases} bail${m.leases > 1 ? 'x' : ''}</div>
        </div>`).join('') || '<div class="card"><div class="empty">Aucun bien — commencez par « + Bien »</div></div>'}</div>`;
      root.querySelector('#pb-new').onclick = () => propertyForm(null, (id) => { draw(); if (id) openProperty(id, draw); });
      root.querySelectorAll('[data-prop]').forEach(el => el.onclick = () => openProperty(el.dataset.prop, draw));
    };
    draw();
    return { refresh: draw };
  },
};
