// Tableau de bord central : l'essentiel de chaque module en un coup d'œil.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, weightedAmount } from '../data/schema.js';
import { propertyMetrics, loanStatus } from '../data/finance.js';
import { esc, eur, eur as _e, daysSince, periodRange, inRange, isoDay, userName } from '../ui.js';
import { nextActivity } from './activity.js';
import { SUIVI } from './vivier.js';

const eur2 = (n) => eur(n, { maximumFractionDigits: 2 });

export const homePage = {
  title: () => 'Tableau de bord',
  render(root) {
    const draw = () => {
      const u = scope.user; const month = periodRange('month');
      const deals = scope.deals(); const open = deals.filter(d => d.status === 'open');
      const leadsM = deals.filter(d => inRange(d.created_at, month)).length;
      const wonM = deals.filter(d => d.status === 'won' && inRange(d.won_at, month));
      const acts = scope.activities().filter(a => !a.done);
      const late = acts.filter(a => daysSince(a.due_date) > 0).length, today = acts.filter(a => daysSince(a.due_date) === 0).length;
      const noNext = open.filter(d => !nextActivity(d.id)).length;
      const hour = new Date().getHours(); const hello = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

      const modules = [];
      // ---- Commercial
      modules.push({ key: 'crm', title: 'Commercial', icon: '📈', color: 'var(--orange)', link: scope.isDirection ? '#/dashboard' : '#/today', body: `
        <div class="hub-kpis">
          <div><b>${leadsM}</b><span>leads ce mois</span></div>
          <div><b>${open.length}</b><span>affaires en cours</span></div>
          <div><b>${eur(open.reduce((s, d) => s + weightedAmount(d), 0))}</b><span>CA potentiel pondéré</span></div>
          <div><b>${eur(wonM.reduce((s, d) => s + (Number(d.amount) || 0), 0))}</b><span>CA signé ce mois</span></div>
        </div>
        <div class="hub-lines">${ACTIVITY_KEYS.filter(k => scope.activityKeys.includes(k)).map(k => { const o = open.filter(d => d.activity === k); return `<a href="#/pipeline/${k}"><span class="dot" style="background:${ACTIVITIES[k].color}"></span>${esc(ACTIVITIES[k].label)}<span class="grow"></span><b>${o.length}</b><span class="muted small">· ${eur(o.reduce((s, d) => s + (Number(d.amount) || 0), 0))}</span></a>`; }).join('')}</div>` });
      // ---- Aujourd'hui
      modules.push({ key: 'today', title: "À faire aujourd'hui", icon: '☑', color: late ? 'var(--red)' : 'var(--green)', link: '#/today', body: `
        <div class="hub-kpis"><div><b class="${late ? 'status-lost' : ''}">${late}</b><span>en retard</span></div><div><b>${today}</b><span>aujourd'hui</span></div><div><b class="${noNext ? 'status-lost' : ''}">${noNext}</b><span>affaires sans action</span></div></div>
        <div class="hub-lines">${acts.filter(a => daysSince(a.due_date) >= 0).sort((x, y) => (x.due_date || '').localeCompare(y.due_date || '')).slice(0, 5).map(a => `<a href="#/today"><span>${daysSince(a.due_date) > 0 ? '⚠' : '•'}</span>${esc(a.title)}<span class="grow"></span><span class="muted small">${esc(userName(a.assignee_id))}</span></a>`).join('') || '<div class="empty" style="padding:8px">Rien à faire — tout est à jour.</div>'}</div>` });
      // ---- Patrimoine
      if (scope.canPatrimony) {
        const props = db.t('properties').filter(p => p.status !== 'Vendu'); const loans = db.t('loans'), leases = db.t('leases'), exps = db.t('expenses'), pays = db.t('rent_payments');
        const ms = props.map(p => propertyMetrics(p, loans, leases, exps, pays));
        const value = ms.reduce((s, m) => s + m.value, 0), debt = ms.reduce((s, m) => s + m.debt, 0), cf = ms.reduce((s, m) => s + m.cashflow, 0);
        const mk = isoDay().slice(0, 7); const active = leases.filter(l => l.active !== false);
        const expected = active.reduce((s, l) => s + (Number(l.rent) || 0), 0); const received = pays.filter(x => x.month === mk && active.some(l => l.id === x.lease_id)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
        modules.push({ key: 'pat', title: 'Patrimoine immobilier', icon: '🏠', color: '#0f9d58', link: '#/patrimoine', body: `
          <div class="hub-kpis"><div><b>${eur(value)}</b><span>valeur · ${props.length} bien${props.length > 1 ? 's' : ''}</span></div><div><b>${eur(debt)}</b><span>capital restant dû</span></div><div><b class="${cf >= 0 ? 'status-won' : 'status-lost'}">${eur2(cf)}</b><span>cash-flow / mois</span></div><div><b>${eur(received)}<span style="font-size:12px;color:var(--muted)"> / ${eur(expected)}</span></b><span>loyers du mois</span></div></div>
          <div class="hub-lines"><a href="#/patrimoine/biens">Biens<span class="grow"></span><b>${props.length}</b></a><a href="#/patrimoine/prets">Prêts<span class="grow"></span><b>${loans.length}</b></a><a href="#/patrimoine/loyers">Loyers<span class="grow"></span><b>${active.length} bau${active.length > 1 ? 'x' : 'l'}</b></a><a href="#/patrimoine/charges">Charges<span class="grow"></span><b>${exps.length}</b></a></div>` });
      }
      // ---- Vivier courtiers
      if (scope.isDirection || scope.activityKeys.includes('courtage')) {
        const bk = db.t('broker_profiles').filter(r => !r.archive);
        const cnt = k => bk.filter(r => (r.suivi || 'new') === k).length;
        modules.push({ key: 'viv', title: 'Vivier courtiers', icon: '🏦', color: '#0A6F86', link: '#/vivier', body: `
          <div class="hub-kpis"><div><b>${bk.length}</b><span>profils</span></div><div><b>${cnt('contact') + cnt('rdv')}</b><span>en cours</span></div><div><b class="status-won">${cnt('ok')}</b><span>recrutés</span></div><div><b>${cnt('new')}</b><span>à contacter</span></div></div>
          <div class="hub-lines">${Object.entries(SUIVI).map(([k, v]) => `<a href="#/vivier"><span class="pill ${v.cls}" style="font-size:11px">${v.label}</span><span class="grow"></span><b>${cnt(k)}</b></a>`).join('')}</div>` });
      }
      // ---- Modules à venir
      const soon = ['Partenaires & réseau', 'Formation', 'Process & procédures', 'Mentoring', 'Agenda'];

      root.innerHTML = `
        ${db.demo ? '<div class="demo-banner"><b>Mode démo</b> — données d\'exemple stockées dans ce navigateur.</div>' : ''}
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;background:linear-gradient(120deg,#15384E,#0A6F86);color:#fff;border:0">
          <div><div style="font-size:12px;text-transform:uppercase;letter-spacing:.1em;opacity:.7">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h2 style="font-size:24px;margin-top:4px">${hello}, ${esc((u.full_name || '').split(' ')[0])}.</h2>
            <div style="opacity:.8;margin-top:4px">${late ? `<b style="color:#fca5a5">${late} action${late > 1 ? 's' : ''} en retard</b> · ` : ''}${today} à faire aujourd'hui · ${noNext ? `<b style="color:#fcd34d">${noNext} affaire${noNext > 1 ? 's' : ''} sans prochaine action</b>` : 'toutes les affaires ont une prochaine action'}</div></div>
          <a class="btn" href="#/today" style="background:var(--orange)">Ouvrir ma journée →</a>
        </div>
        <div class="hub-grid">${modules.map(m => `<div class="card hub-card" style="--c:${m.color}"><div class="card-head"><h2><span class="hub-icon">${m.icon}</span>${esc(m.title)}</h2><a href="${m.link}" class="btn ghost sm">Ouvrir →</a></div>${m.body}</div>`).join('')}
          <div class="card hub-card soon"><div class="card-head"><h2><span class="hub-icon">🧩</span>Modules à venir</h2></div><div class="hub-lines">${soon.map(s => `<span><span class="muted">○</span>${esc(s)}<span class="grow"></span><span class="pill">bientôt</span></span>`).join('')}</div><p class="muted small" style="margin:10px 0 0">Chaque module s'ajoute ici avec ses propres droits, sur la même base et la même connexion.</p></div>
        </div>`;
    };
    draw();
    return { refresh: draw };
  },
};
