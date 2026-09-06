// Module Patrimoine : référentiel et calculs financiers (amortissement, rendement, cash-flow).

export const INVEST_TYPES = ['Locatif nu', 'Meublé / LMNP', 'Colocation', 'Immeuble de rapport', 'Local commercial', 'Parking / garage', 'Résidence principale', 'Terrain', 'Autre'];
export const STRUCTURES = ['Nom propre', 'Indivision', 'SCI à l\'IR', 'SCI à l\'IS', 'SARL de famille', 'SAS / SASU', 'Holding', 'Autre'];
export const PROPERTY_STATUS = ['Loué', 'Vacant', 'En travaux', 'En vente', 'Vendu'];
export const EXPENSE_CATEGORIES = ['Taxe foncière', 'Charges de copropriété', 'Assurance PNO', 'Assurance emprunteur', 'Gestion locative', 'Entretien / réparations', 'Travaux', 'CFE', 'Comptable', 'Eau / électricité / gaz', 'Internet', 'Frais bancaires', 'Autre'];
export const RECURRENCES = [['monthly', 'Mensuelle'], ['quarterly', 'Trimestrielle'], ['yearly', 'Annuelle'], ['once', 'Ponctuelle']];

const r2 = (n) => Math.round(n * 100) / 100;

// Mensualité (hors assurance) d'un prêt amortissable à échéances constantes.
export function monthlyPayment(principal, annualRatePct, months) {
  const r = (Number(annualRatePct) || 0) / 100 / 12; const n = Number(months) || 0;
  if (!n || principal <= 0) return 0;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

// Tableau d'amortissement complet.
// loan: { principal, rate, duration_months, start_date, insurance_monthly, deferral_months (différé partiel : intérêts seuls), monthly_payment (facultatif : mensualité imposée) }
export function schedule(loan) {
  const P = Number(loan.principal) || 0; const n = Number(loan.duration_months) || 0; const r = (Number(loan.rate) || 0) / 100 / 12;
  const ins = Number(loan.insurance_monthly) || 0; const defer = Math.min(Number(loan.deferral_months) || 0, n);
  const amortMonths = n - defer;
  const pay = loan.monthly_payment ? Number(loan.monthly_payment) : monthlyPayment(P, loan.rate, amortMonths);
  const rows = []; let balance = P; const start = loan.start_date ? new Date(loan.start_date + 'T00:00:00') : new Date();
  for (let k = 1; k <= n; k++) {
    const d = new Date(start.getFullYear(), start.getMonth() + k - 1, start.getDate() > 28 ? 28 : start.getDate());
    const interest = balance * r;
    let capital = 0;
    if (k <= defer) capital = 0; else { capital = Math.min(pay - interest, balance); if (k === n) capital = balance; }
    balance = Math.max(0, balance - capital);
    rows.push({ k, date: d.toISOString().slice(0, 10), interest: r2(interest), capital: r2(capital), insurance: ins, payment: r2(interest + capital + ins), balance: r2(balance) });
  }
  return rows;
}

// Capital restant dû et cumul à une date donnée.
export function loanStatus(loan, at = new Date()) {
  const rows = schedule(loan); const atIso = at.toISOString().slice(0, 10);
  const paid = rows.filter(x => x.date <= atIso);
  const last = paid[paid.length - 1];
  const next = rows.find(x => x.date > atIso);
  return {
    balance: last ? last.balance : (Number(loan.principal) || 0),
    paidCount: paid.length, total: rows.length,
    interestPaid: r2(paid.reduce((s, x) => s + x.interest, 0)),
    capitalPaid: r2(paid.reduce((s, x) => s + x.capital, 0)),
    monthly: next ? next.payment : (last ? last.payment : 0),
    endDate: rows.length ? rows[rows.length - 1].date : null,
    next,
    totalInterest: r2(rows.reduce((s, x) => s + x.interest, 0)),
    totalCost: r2(rows.reduce((s, x) => s + x.interest + x.insurance, 0)),
  };
}

// Montant mensuel équivalent d'une charge selon sa récurrence.
export function monthlyEquivalent(exp) {
  const a = Number(exp.amount) || 0;
  switch (exp.recurrence) { case 'monthly': return a; case 'quarterly': return a / 3; case 'yearly': return a / 12; default: return 0; }
}

// Charges d'un bien sur une année civile (récurrentes converties + ponctuelles de l'année).
export function yearlyExpenses(expenses, year) {
  return expenses.reduce((s, e) => {
    if (e.recurrence === 'once') return s + ((e.date || '').startsWith(String(year)) ? Number(e.amount) || 0 : 0);
    return s + monthlyEquivalent(e) * 12;
  }, 0);
}

// Indicateurs d'un bien.
export function propertyMetrics(p, loans, leases, expenses, payments, year = new Date().getFullYear()) {
  const cost = (Number(p.price) || 0) + (Number(p.notary_fees) || 0) + (Number(p.works) || 0) + (Number(p.other_costs) || 0);
  const activeLeases = leases.filter(l => l.property_id === p.id && l.active !== false);
  const rentMonthly = activeLeases.reduce((s, l) => s + (Number(l.rent) || 0), 0);
  const chargesMonthly = expenses.filter(e => e.property_id === p.id).reduce((s, e) => s + monthlyEquivalent(e), 0);
  const pLoans = loans.filter(l => l.property_id === p.id);
  const statuses = pLoans.map(l => loanStatus(l));
  const debt = statuses.reduce((s, x) => s + x.balance, 0);
  const loanMonthly = statuses.reduce((s, x) => s + x.monthly, 0);
  const cashflow = rentMonthly - chargesMonthly - loanMonthly;
  const value = Number(p.current_value) || cost;
  const grossYield = cost ? (rentMonthly * 12) / cost * 100 : 0;
  const netYield = cost ? ((rentMonthly - chargesMonthly) * 12) / cost * 100 : 0;
  const yearPayments = payments.filter(x => activeLeases.some(l => l.id === x.lease_id) && (x.month || '').startsWith(String(year)));
  const received = yearPayments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return { cost, value, rentMonthly, chargesMonthly, loanMonthly, debt, cashflow, grossYield, netYield, equity: value - debt, receivedYear: received, leases: activeLeases.length };
}
