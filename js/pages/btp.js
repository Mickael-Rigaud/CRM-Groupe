// Espace BTP Expertise : le cabinet pilote son activité ici, sans quitter le CRM.
// Les écrans lisent les données communes (affaires, contacts, activités) filtrées sur
// l'activité « btp », et deux référentiels qui lui appartiennent : fiches DTU et mails types.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, CHANNELS, weightedAmount } from '../data/schema.js';
import {
  esc, eur, daysSince, userName, contactName, dealParty, toast,
  openModal, closeModal, confirm, renderForm, readForm, terms, hit,
  searchInput, bindSearch, restoreFocus, csvDownload,
} from '../ui.js';
import { openDeal, dealForm } from './deal.js';
import { activityRowHtml, bindActivityRows, activityForm, nextActivity } from './activity.js';

const KEY = 'btp';
const act = () => ACTIVITIES[KEY];
const isBtp = (row) => !!row && (row.activities || []).includes(KEY);
const deals = () => scope.deals().filter(d => d.activity === KEY);
const activities = () => {
  const ids = new Set(deals().map(d => d.id));
  return scope.activities().filter(a => (a.deal_id && ids.has(a.deal_id))
    || isBtp(db.byId('contacts', a.contact_id)) || isBtp(db.byId('organisations', a.organisation_id)));
};

// Habillage : sur ces écrans seulement, l'accent prend les couleurs du logo BTP Expertise.
const skin = (root) => { root.classList.add('btp-skin'); return () => root.classList.remove('btp-skin'); };
const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

// ---------------------------------------------------------------- Vue d'ensemble
export const btpHomePage = {
  title: () => 'BTP Expertise',
  render(root) {
    if (guard(root)) return {};
    const off = skin(root);

    const draw = () => {
      const a = act();
      const all = deals();
      const open = all.filter(d => d.status === 'open');
      const won = all.filter(d => d.status === 'won');
      const potential = open.reduce((s, d) => s + weightedAmount(d), 0);
      const noNext = open.filter(d => !nextActivity(d.id));
      const missions = all.filter(d => a.stages.find(s => s.key === d.stage)?.delivery && d.status !== 'lost');
      const maxCol = Math.max(1, ...a.stages.map(s => open.filter(d => d.stage === s.key).length));

      // Agenda : ce qui est prévu dans les quinze jours, et ce qui traîne
      const proches = activities().filter(x => !x.done && x.due_date && daysSince(x.due_date) >= -15)
        .sort((x, y) => x.due_date.localeCompare(y.due_date));
      const retard = proches.filter(x => daysSince(x.due_date) > 0);
      const avenir = proches.filter(x => daysSince(x.due_date) <= 0).slice(0, 8);
      const recentes = open.slice().sort((x, y) => (y.created_at || '').localeCompare(x.created_at || '')).slice(0, 8);

      root.innerHTML = `
        <div class="grid c4">
          <div class="card tight kpi" style="--kpi:var(--accent-soft);--kpi-c:var(--accent)"><div class="lbl">Affaires ouvertes</div><div class="val">${open.length}</div><div class="sub">${eur(open.reduce((s, d) => s + (Number(d.amount) || 0), 0))} en cours</div></div>
          <div class="card tight kpi" style="--kpi:#E1F4FC;--kpi-c:#0094C8"><div class="lbl">CA potentiel pondéré</div><div class="val">${eur(potential)}</div><div class="sub">selon l&rsquo;étape de chaque affaire</div></div>
          <div class="card tight kpi" style="--kpi:#FFEBD6;--kpi-c:#C4640F"><div class="lbl">Missions en cours</div><div class="val">${missions.length}</div><div class="sub">planifiées, réalisées, à remettre</div></div>
          <div class="card tight kpi" style="--kpi:var(--red-soft);--kpi-c:var(--red)"><div class="lbl">Sans prochaine action</div><div class="val">${noNext.length}</div><div class="sub">à corriger aujourd&rsquo;hui</div></div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Pipeline</h2><a class="btn ghost sm" href="#/pipeline/btp">Ouvrir le pipeline complet</a></div>
          <div class="btp-pipe">${a.stages.map(s => {
            const col = open.filter(d => d.stage === s.key);
            const sum = col.reduce((t, d) => t + (Number(d.amount) || 0), 0);
            return `<div class="btp-stage">
              <div class="btp-stage-head"><b>${esc(s.label)}</b><span>${col.length}</span></div>
              <div class="btp-bar"><i style="width:${Math.round((col.length / maxCol) * 100)}%"></i></div>
              <div class="small muted">${sum ? eur(sum) : '—'}</div>
            </div>`;
          }).join('')}</div>
        </div>

        <div class="grid c2">
          <div class="card">
            <div class="card-head"><h2>Agenda</h2><button class="btn sm" id="b-new-act">+ Rendez-vous</button></div>
            ${retard.length ? `<div class="alert"><b>${retard.length}</b><div>en retard — à traiter avant le reste</div></div>` : ''}
            ${avenir.length ? avenir.map(x => activityRowHtml(x, { showContext: true })).join('') : '<div class="empty">Rien de prévu dans les quinze jours.</div>'}
            <p class="small muted" style="margin:12px 0 0">Ces échéances viennent du CRM. Le calendrier Google du cabinet n&rsquo;est pas encore raccordé.</p>
          </div>
          <div class="card">
            <div class="card-head"><h2>Affaires récentes</h2><button class="btn sm" id="b-new-deal">+ Affaire</button></div>
            ${recentes.map(d => `
              <div class="btp-line" data-deal="${d.id}">
                <span class="grow"><b>${esc(d.title)}</b><br><small class="muted">${esc(dealParty(d))} · ${esc(a.stages.find(s => s.key === d.stage)?.label || d.stage)}</small></span>
                <span class="num">${d.amount ? eur(d.amount) : '—'}</span>
              </div>`).join('') || '<div class="empty">Aucune affaire ouverte.</div>'}
            ${won.length ? `<p class="small muted" style="margin:12px 0 0">${won.length} mission${won.length > 1 ? 's' : ''} gagnée${won.length > 1 ? 's' : ''} au total.</p>` : ''}
          </div>
        </div>`;

      root.querySelector('#b-new-act').onclick = () => activityForm({}, null, draw);
      root.querySelector('#b-new-deal').onclick = () => dealForm(KEY, null, {}, draw);
      root.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, draw));
      bindActivityRows(root, draw);
    };

    draw();
    return { refresh: draw, destroy: off };
  },
};

// ---------------------------------------------------------------- To-do list
export const btpTodoPage = {
  title: () => 'BTP Expertise — To-do',
  render(root) {
    if (guard(root)) return {};
    const off = skin(root);
    const state = { who: '', q: '', focus: null };

    const draw = () => {
      const users = scope.users();
      const liste = activities()
        .filter(x => !state.who || x.assignee_id === state.who)
        .filter(x => hit([x.title, x.notes, userName(x.assignee_id)], terms(state.q)));
      const ouvertes = liste.filter(x => !x.done);
      const retard = ouvertes.filter(x => daysSince(x.due_date) > 0).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const jour = ouvertes.filter(x => daysSince(x.due_date) === 0);
      const semaine = ouvertes.filter(x => daysSince(x.due_date) < 0 && daysSince(x.due_date) >= -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const plusTard = ouvertes.filter(x => daysSince(x.due_date) < -7).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const sansDate = ouvertes.filter(x => !x.due_date);
      const faitesCeJour = liste.filter(x => x.done && x.done_at && daysSince(x.done_at) === 0);
      const bloc = (titre, l) => l.length ? `<div class="card today-group"><h3>${titre} <span>${l.length}</span></h3>${l.map(x => activityRowHtml(x, { showContext: true })).join('')}</div>` : '';

      root.innerHTML = `
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher une tâche…')}
          <select id="b-who"><option value="">Toute l&rsquo;équipe</option>${users.map(u => `<option value="${u.id}" ${state.who === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>
          <span class="muted small">${retard.length} en retard · ${jour.length} aujourd&rsquo;hui</span>
          <span class="grow"></span>
          <button class="btn" id="b-new">+ Tâche</button>
        </div>
        ${bloc('⚠ En retard', retard)}
        ${bloc('Aujourd&rsquo;hui', jour)}
        ${bloc('Cette semaine', semaine)}
        ${bloc('Plus tard', plusTard)}
        ${bloc('Sans échéance', sansDate)}
        ${bloc('Fait aujourd&rsquo;hui', faitesCeJour)}
        ${!ouvertes.length ? '<div class="card"><div class="empty">Rien à faire — tout est à jour.</div></div>' : ''}`;

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelector('#b-who').onchange = e => { state.who = e.target.value; draw(); };
      root.querySelector('#b-new').onclick = () => activityForm({}, null, draw);
      bindActivityRows(root, draw);
    };

    draw();
    return { refresh: draw, destroy: off };
  },
};

// ---------------------------------------------------------------- Base de données
const VUES = [
  { key: 'clients', label: 'Clients' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'partenaires', label: 'Partenaires' },
  { key: 'courtiers', label: 'Courtiers' },
  { key: 'tous', label: 'Tous les contacts' },
];

export const btpBasePage = {
  title: () => 'BTP Expertise — Base de données',
  render(root) {
    if (guard(root)) return {};
    const off = skin(root);
    const state = { vue: 'clients', q: '', canal: '', focus: null };

    const draw = () => {
      const ts = terms(state.q);
      const contacts = scope.contacts().filter(isBtp);
      const orgs = scope.orgs().filter(isBtp);
      const surOrg = ['partenaires', 'courtiers'].includes(state.vue);

      let lignes = [];
      let colonnes = [];
      if (surOrg) {
        const filtre = state.vue === 'courtiers' ? (o) => o.partner_job === 'Courtier' : (o) => o.type === 'Partenaire';
        lignes = orgs.filter(filtre)
          .filter(o => hit([o.name, o.partner_job, o.city, o.email, o.phone], ts))
          .map(o => ({
            id: o.id, org: true, nom: o.name, detail: o.partner_job || o.type, ville: o.city,
            tel: o.phone, mail: o.email, apports: deals().filter(d => d.referrer_org_id === o.id).length,
          }));
        colonnes = ['Nom', 'Métier', 'Ville', 'Téléphone', 'Email', 'Affaires apportées'];
      } else {
        const filtre = { clients: (c) => c.type === 'Client', prospects: (c) => c.type === 'Prospect', tous: () => true }[state.vue];
        lignes = contacts.filter(filtre)
          .filter(c => !state.canal || c.channel === state.canal)
          .filter(c => hit([contactName(c), c.email, c.phone, c.city, c.channel], ts))
          .map(c => {
            const d = deals().find(x => x.contact_id === c.id);
            return {
              id: c.id, nom: contactName(c), detail: c.type, ville: c.city, tel: c.phone, mail: c.email,
              canal: c.channel || '—', affaire: d ? d.title : null, dealId: d ? d.id : null,
            };
          });
        colonnes = ['Nom', 'Type', 'Ville', 'Téléphone', 'Email', 'Canal', 'Affaire'];
      }

      const compte = (v) => {
        if (v === 'partenaires') return orgs.filter(o => o.type === 'Partenaire').length;
        if (v === 'courtiers') return orgs.filter(o => o.partner_job === 'Courtier').length;
        if (v === 'tous') return contacts.length;
        return contacts.filter(c => c.type === (v === 'clients' ? 'Client' : 'Prospect')).length;
      };

      root.innerHTML = `
        <div class="toolbar">
          <div class="seg">${VUES.map(v => `<button data-vue="${v.key}" class="${state.vue === v.key ? 'active' : ''}">${v.label} <span class="cnt">${compte(v.key)}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <button class="btn ghost sm" id="b-export">Export CSV</button>
        </div>
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un nom, une ville, un email…')}
          ${surOrg ? '' : `<select id="b-canal"><option value="">Tous les canaux</option>${CHANNELS.map(c => `<option ${state.canal === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`}
          <span class="muted small">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}</span>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr>${colonnes.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${lignes.map(r => `<tr class="${r.dealId ? 'click' : ''}" ${r.dealId ? `data-deal="${r.dealId}"` : ''}>
              <td><b>${esc(r.nom)}</b></td>
              <td>${esc(r.detail || '—')}</td>
              <td>${esc(r.ville || '—')}</td>
              <td>${r.tel ? `<a href="tel:${esc(r.tel)}">${esc(r.tel)}</a>` : '—'}</td>
              <td>${r.mail ? `<a href="mailto:${esc(r.mail)}">${esc(r.mail)}</a>` : '—'}</td>
              ${r.org ? `<td class="num">${r.apports}</td>` : `<td>${esc(r.canal)}</td><td>${r.affaire ? esc(r.affaire) : '—'}</td>`}
            </tr>`).join('') || `<tr><td colspan="${colonnes.length}"><div class="empty">Aucune fiche dans cette vue.</div></td></tr>`}</tbody>
          </table></div>
        </div>`;

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });
      root.querySelector('#b-canal')?.addEventListener('change', e => { state.canal = e.target.value; draw(); });
      root.querySelectorAll('[data-deal]').forEach(tr => tr.onclick = () => openDeal(tr.dataset.deal, draw));
      root.querySelector('#b-export').onclick = () => csvDownload(`btp-${state.vue}.csv`, lignes.map(({ id, org, dealId, ...reste }) => reste));
    };

    draw();
    return { refresh: draw, destroy: off };
  },
};

// ---------------------------------------------------------------- Fiches DTU
const DTU_FORM = [
  { key: 'code', label: 'Numéro', required: true, half: true, placeholder: 'NF DTU 20.1' },
  { key: 'domain', label: 'Domaine', half: true, placeholder: 'Maçonnerie' },
  { key: 'title', label: 'Intitulé', required: true },
  { key: 'scope_text', label: "Domaine d'application", type: 'textarea', rows: 3 },
  { key: 'checkpoints', label: 'Points de contrôle sur le terrain', type: 'textarea', rows: 8, hint: "Une ligne par point. C'est la pratique du cabinet, pas le texte de la norme." },
  { key: 'link', label: 'Lien', half: true, placeholder: 'https://…' },
  { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
];

export const btpDtuPage = {
  title: () => 'BTP Expertise — DTU',
  render(root) {
    if (guard(root)) return {};
    const off = skin(root);
    const state = { q: '', domaine: '', focus: null };

    const editer = (f, apres) => {
      const m = openModal(f ? `Fiche ${f.code}` : 'Nouvelle fiche DTU',
        `<form class="form" id="dtu-form">${renderForm(DTU_FORM, f || {})}
          <div class="form-actions">${f ? '<button type="button" class="btn ghost" id="dtu-del">Supprimer</button>' : ''}
          <button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`,
        { wide: true });
      m.querySelector('#dtu-form').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(e.target, DTU_FORM);
        try {
          if (f) await db.update('dtu_sheets', f.id, v);
          else await db.insert('dtu_sheets', { ...v, position: 999 });
          closeModal(true); toast('Fiche enregistrée'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
      m.querySelector('#dtu-del')?.addEventListener('click', async () => {
        if (!await confirm(`Supprimer la fiche ${f.code} ?`)) return;
        await db.remove('dtu_sheets', f.id); closeModal(true); toast('Fiche supprimée'); apres();
      });
    };

    const consulter = (f) => openModal(`${f.code} — ${f.title}`, `
      ${f.domain ? `<p class="small muted">${esc(f.domain)}</p>` : ''}
      ${f.scope_text ? `<h3>Domaine d&rsquo;application</h3><p>${esc(f.scope_text).replace(/\n/g, '<br>')}</p>` : ''}
      <h3>Points de contrôle</h3>
      ${f.checkpoints ? `<ul class="btp-points">${f.checkpoints.split('\n').filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        : '<div class="empty">Aucun point de contrôle saisi pour l&rsquo;instant.</div>'}
      ${f.notes ? `<h3>Notes</h3><p>${esc(f.notes).replace(/\n/g, '<br>')}</p>` : ''}
      ${f.link ? `<p><a href="${esc(f.link)}" target="_blank" rel="noopener">Ouvrir la référence ↗</a></p>` : ''}
      <div class="form-actions"><button type="button" class="btn ghost" data-close>Fermer</button><button type="button" class="btn" id="dtu-edit">Modifier</button></div>`,
      { wide: true, onOpen: (m) => { m.querySelector('#dtu-edit').onclick = () => { closeModal(true); editer(f, draw); }; } });

    const draw = () => {
      const ts = terms(state.q);
      const toutes = db.t('dtu_sheets').slice().sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.code).localeCompare(String(b.code)));
      const domaines = [...new Set(toutes.map(f => f.domain).filter(Boolean))].sort();
      const liste = toutes.filter(f => !state.domaine || f.domain === state.domaine)
        .filter(f => hit([f.code, f.title, f.domain, f.scope_text, f.checkpoints, f.notes], ts));

      root.innerHTML = `
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un numéro, un mot du titre, un point de contrôle…')}
          <select id="b-dom"><option value="">Tous les domaines</option>${domaines.map(d => `<option ${state.domaine === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
          <span class="muted small">${liste.length} fiche${liste.length > 1 ? 's' : ''}</span>
          <span class="grow"></span>
          <button class="btn" id="b-new">+ Fiche DTU</button>
        </div>
        <div class="btp-cards">${liste.map(f => `
          <button type="button" class="btp-card" data-f="${f.id}">
            <span class="btp-code">${esc(f.code)}</span>
            <span class="btp-title">${esc(f.title)}</span>
            <span class="small muted">${esc(f.domain || '—')}${f.checkpoints ? ` · ${f.checkpoints.split('\n').filter(Boolean).length} point(s) de contrôle` : ''}</span>
          </button>`).join('') || '<div class="card"><div class="empty">Aucune fiche. Lancez <code>supabase/lot5-btp.sql</code> pour charger les DTU courants, ou créez la première.</div></div>'}</div>`;

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelector('#b-dom').onchange = e => { state.domaine = e.target.value; draw(); };
      root.querySelector('#b-new').onclick = () => editer(null, draw);
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => consulter(db.byId('dtu_sheets', b.dataset.f)));
    };

    draw();
    return { refresh: draw, destroy: off };
  },
};

// ---------------------------------------------------------------- Mails types
const MAIL_FORM = [
  { key: 'theme', label: 'Thématique', required: true, half: true, placeholder: 'Prise de contact' },
  { key: 'title', label: 'Nom du modèle', required: true, half: true, placeholder: 'Relance après devis' },
  { key: 'subject', label: 'Objet du mail' },
  { key: 'body', label: 'Corps du mail', type: 'textarea', rows: 14, required: true },
];

export const btpMailsPage = {
  title: () => 'BTP Expertise — Mails types',
  render(root) {
    if (guard(root)) return {};
    const off = skin(root);
    const state = { theme: '', q: '', focus: null };

    const editer = (m0, apres) => {
      const m = openModal(m0 ? m0.title : 'Nouveau modèle',
        `<form class="form" id="mail-form">${renderForm(MAIL_FORM, m0 || {})}
          <div class="form-actions">${m0 ? '<button type="button" class="btn ghost" id="mail-del">Supprimer</button>' : ''}
          <button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`,
        { wide: true });
      m.querySelector('#mail-form').onsubmit = async (e) => {
        e.preventDefault();
        const v = readForm(e.target, MAIL_FORM);
        try {
          if (m0) await db.update('mail_templates', m0.id, v);
          else await db.insert('mail_templates', { ...v, activity: KEY, position: 999 });
          closeModal(true); toast('Modèle enregistré'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
      m.querySelector('#mail-del')?.addEventListener('click', async () => {
        if (!await confirm(`Supprimer le modèle « ${m0.title} » ?`)) return;
        await db.remove('mail_templates', m0.id); closeModal(true); toast('Modèle supprimé'); apres();
      });
    };

    const copier = async (texte) => {
      try { await navigator.clipboard.writeText(texte); toast('Modèle copié'); }
      catch { toast('Copie refusée par le navigateur', 'warn'); }
    };

    const draw = () => {
      const ts = terms(state.q);
      const tous = db.t('mail_templates').filter(m => m.activity === KEY);
      const themes = [...new Set(tous.map(m => m.theme).filter(Boolean))].sort();
      const liste = tous.filter(m => !state.theme || m.theme === state.theme)
        .filter(m => hit([m.title, m.theme, m.subject, m.body], ts));

      const groupes = themes.filter(t => !state.theme || t === state.theme)
        .map(t => [t, liste.filter(m => m.theme === t).sort((a, b) => (a.position || 0) - (b.position || 0))])
        .filter(([, g]) => g.length);

      root.innerHTML = `
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un modèle…')}
          <select id="b-theme"><option value="">Toutes les thématiques</option>${themes.map(t => `<option ${state.theme === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
          <span class="muted small">${liste.length} modèle${liste.length > 1 ? 's' : ''}</span>
          <span class="grow"></span>
          <button class="btn" id="b-new">+ Modèle</button>
        </div>
        ${groupes.length ? groupes.map(([t, g]) => `
          <div class="card">
            <div class="card-head"><h2>${esc(t)}</h2><span class="muted small">${g.length}</span></div>
            ${g.map(m => `<div class="btp-mail">
              <div class="btp-mail-head">
                <span class="grow"><b>${esc(m.title)}</b>${m.subject ? `<br><small class="muted">Objet : ${esc(m.subject)}</small>` : ''}</span>
                <button type="button" class="btn ghost sm" data-copy="${m.id}">Copier</button>
                <button type="button" class="btn ghost sm" data-edit="${m.id}">Modifier</button>
              </div>
              <pre class="btp-mail-body">${esc(m.body)}</pre>
            </div>`).join('')}
          </div>`).join('')
        : '<div class="card"><div class="empty">Aucun modèle pour l&rsquo;instant. Créez le premier avec « + Modèle » : la thématique que vous lui donnez (Prise de contact, Devis, Rapport…) sert de rangement.</div></div>'}`;

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelector('#b-theme').onchange = e => { state.theme = e.target.value; draw(); };
      root.querySelector('#b-new').onclick = () => editer(null, draw);
      root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editer(db.byId('mail_templates', b.dataset.edit), draw));
      root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
        const m = db.byId('mail_templates', b.dataset.copy);
        copier(m.subject ? `${m.subject}\n\n${m.body}` : m.body);
      });
    };

    draw();
    return { refresh: draw, destroy: off };
  },
};
