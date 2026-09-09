// Module Vivier courtiers : recrutement de mandataires / courtiers pour La Référence Courtage.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, openModal, closeModal, renderForm, readForm, toast, fmtDate, confirm, csvDownload, userName, terms, hit, searchInput, bindSearch, restoreFocus, pickState, pickInit, multiPick, bindMultiPick } from '../ui.js';

export const PRIO = { '1': { label: 'Solo', desc: 'mandataire / indépendant (cible directe)', color: '#0A6F86' }, '2a': { label: 'En agence', desc: 'courtier en réseau, statut à qualifier', color: '#C4640F' }, '2b': { label: 'Dirigeant', desc: 'gérant / franchisé (partenariat)', color: '#4A6579' }, '3': { label: 'Solo · à vérifier', desc: 'EI au Sirene, ORIAS à confirmer', color: '#8CA2B3' } };
export const SUIVI = { new: { label: 'À contacter', cls: '' }, contact: { label: 'Contacté', cls: 'info' }, rdv: { label: 'RDV pris', cls: 'warn' }, ok: { label: 'Recruté', cls: 'ok' }, no: { label: 'Écarté', cls: 'bad' } };
const CERT = ['certain', 'probable', 'à vérifier'];
const DEPS = ['06', '83', '95', '60'];
const YEAR = new Date().getFullYear();

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const canSee = () => scope.isDirection || scope.activityKeys.includes('courtage');
const denied = (root) => { root.innerHTML = '<div class="card"><div class="empty">Module réservé à la direction et à l\'activité Courtage.</div></div>'; return {}; };

export function brokerForm(existing = null, onSaved, onClose = null) {
  const reseaux = [...new Set(db.t('broker_profiles').map(r => r.reseau_key).filter(Boolean))].sort();
  const spec = [
    { key: 'prenom', label: 'Prénom', type: 'text', half: true },
    { key: 'nom', label: 'Nom', type: 'text', required: true, half: true },
    { key: 'ville', label: 'Ville / secteur', type: 'text', required: true, half: true, placeholder: 'Nice / Antibes' },
    { key: 'dep', label: 'Département', type: 'select', options: [['06', '06 · Alpes-Maritimes'], ['83', '83 · Var'], ['95', "95 · Val-d'Oise"], ['60', '60 · Oise'], ['autre', 'Autre']], required: true, half: true, value: '06' },
    { key: 'reseau', label: 'Réseau / entreprise', type: 'text', half: true, placeholder: 'Meilleurtaux Nice Gambetta' },
    { key: 'reseau_key', label: 'Réseau (filtre)', type: 'select', options: ['Indépendant / autre', ...reseaux.filter(r => r !== 'Indépendant / autre')], half: true, value: 'Indépendant / autre' },
    { key: 'statut', label: 'Statut pro', type: 'text', half: true, placeholder: 'mandataire IOBSP, indépendant, salarié…' },
    { key: 'poste', label: 'Poste affiché', type: 'text', half: true },
    { key: 'exp', label: "Indice d'expérience", type: 'text', half: true, placeholder: 'ORIAS 2019 (~7 ans) ; ex-banquier' },
    { key: 'exp_years', label: 'Ancienneté (années)', type: 'number', half: true },
    { key: 'orias', label: 'N° ORIAS', type: 'text', half: true },
    { key: 'orias_year', label: 'Année ORIAS', type: 'number', half: true },
    { key: 'email', label: 'Email', type: 'email', half: true },
    { key: 'email_ok', label: 'Email nominatif', type: 'checkbox', hint: 'Adresse nominative (pas générique)', half: true },
    { key: 'tel', label: 'Téléphone', type: 'tel', half: true },
    { key: 'tel_type', label: 'Type de téléphone', type: 'select', options: [['', 'Inconnu'], ['direct', 'Ligne directe'], ['agence', 'Standard agence']], half: true },
    { key: 'prio', label: 'Profil', type: 'select', options: Object.entries(PRIO).map(([k, v]) => [k, `${v.label} — ${v.desc}`]), required: true, half: true, value: '2a' },
    { key: 'cert', label: 'Certitude', type: 'select', options: CERT, required: true, half: true, value: 'à vérifier' },
    { key: 'sources', label: 'Sources (une URL par ligne)', type: 'textarea', rows: 2 },
  ];
  const vals = existing ? { ...existing, sources: (existing.sources || []).join('\n') } : {};
  const m = openModal(existing ? 'Modifier la fiche' : 'Ajouter un profil', `<form class="form" id="bkf">${renderForm(spec, vals)}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="bk-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true, onClose });
  const form = m.querySelector('#bkf');
  form.querySelector('[name="orias"]').addEventListener('input', e => { const v = e.target.value.replace(/\D/g, ''); const y = form.querySelector('[name="orias_year"]'); if (!y.value && v.length >= 7) y.value = 2000 + Number(v.length === 8 ? v.slice(0, 2) : v.slice(0, 1)); });
  form.onsubmit = async e => {
    e.preventDefault(); const v = readForm(form, spec);
    v.nom = v.nom.toUpperCase(); v.sources = v.sources.split(/\n+/).map(s => s.trim()).filter(Boolean);
    v.ville_key = v.ville.split(/\s*[\/(]/)[0].trim() || '—';
    if (v.email && !v.email_ok && !/^(contact|info|agence|bonjour|hello|accueil|commercial)@/i.test(v.email)) v.email_ok = true;
    if (!v.tel) v.tel_type = '';
    if (!existing) {
      const dup = db.t('broker_profiles').find(x => norm(x.nom) === norm(v.nom) && norm(x.prenom) === norm(v.prenom));
      if (dup && !await confirm(`Un profil « ${dup.prenom} ${dup.nom} » existe déjà (${dup.ville}). Créer quand même une seconde fiche ?`)) return;
    }
    try {
      let id = existing?.id;
      if (existing) await db.update('broker_profiles', id, v); else id = (await db.insert('broker_profiles', { ...v, suivi: 'new', archive: false })).id;
      closeModal(true); toast(existing ? 'Fiche mise à jour' : 'Profil ajouté'); onSaved?.(id);
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#bk-del')?.addEventListener('click', async () => { if (!await confirm('Supprimer définitivement cette fiche ? (préférez « Archiver »)')) return; await db.remove('broker_profiles', existing.id); closeModal(true); toast('Fiche supprimée'); onSaved?.(null); });
}

export function openBroker(id, onChange) {
  const render = () => {
    const r = db.byId('broker_profiles', id); if (!r) return closeModal();
    const p = PRIO[r.prio] || PRIO['3'];
    const html = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div><span class="badge" style="--c:${p.color}">${esc(p.label)}</span> <span class="pill">${esc(r.cert || '')}</span> ${r.archive ? '<span class="pill bad">Archivé</span>' : ''}<div class="muted small" style="margin-top:4px">${esc(r.poste || '')}${r.reseau ? ' · ' + esc(r.reseau) : ''} · ${esc(r.ville || '')} (${esc(r.dep || '')})</div></div>
        <div class="toolbar"><button class="btn ghost sm" id="bk-edit">✎ Modifier</button><button class="btn ghost sm" id="bk-arch">${r.archive ? '↺ Restaurer' : '⌫ Archiver'}</button></div>
      </div>
      <div class="detail">
        <div>
          <div class="section"><h3>Contact</h3><dl>
            <dt>Email</dt><dd>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a> ${r.email_ok ? '' : '<span class="pill warn">générique</span>'}` : '—'}</dd>
            <dt>Téléphone</dt><dd>${r.tel ? `<a href="tel:${esc(r.tel)}">${esc(r.tel)}</a> ${r.tel_type === 'agence' ? '<span class="pill">standard agence</span>' : r.tel_type === 'direct' ? '<span class="pill ok">ligne directe</span>' : ''}` : '—'}</dd>
            <dt>Statut pro</dt><dd>${esc(r.statut || '—')}</dd>
            <dt>Expérience</dt><dd>${esc(r.exp || '—')}${r.exp_years != null ? ` (${r.exp_years} ans)` : ''}</dd>
            <dt>ORIAS</dt><dd>${r.orias ? `${esc(r.orias)}${r.orias_year ? ` · depuis ${r.orias_year} (${YEAR - r.orias_year} an${YEAR - r.orias_year > 1 ? 's' : ''})` : ''}` : '—'}</dd>
            <dt>Sources</dt><dd style="font-weight:400">${(r.sources || []).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}${u.length > 68 ? '…' : ''}</a>`).join('<br>') || '—'}</dd>
          </dl></div>
        </div>
        <div>
          <div class="section"><h3>Suivi du recrutement</h3>
            <div class="field"><label>Statut</label><select id="bk-suivi">${Object.entries(SUIVI).map(([k, v]) => `<option value="${k}" ${(r.suivi || 'new') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
            <div class="field" style="margin-top:10px"><label>Notes (appel, retour, disponibilité, volume de dossiers…)</label><textarea id="bk-notes" rows="6">${esc(r.notes || '')}</textarea></div>
            <div class="form-actions"><span class="muted small left">${r.last_contact_at ? 'Dernier contact : ' + fmtDate(r.last_contact_at) : ''}</span><button class="btn sm" id="bk-save">Enregistrer le suivi</button></div>
          </div>
        </div>
      </div>`;
    const m = openModal(`${r.prenom || ''} ${r.nom || ''}`.trim(), html, { wide: true, onClose: () => onChange?.() });
    m.querySelector('#bk-edit').onclick = () => brokerForm(r, (nid) => nid ? render() : onChange?.(), render);
    m.querySelector('#bk-arch').onclick = async () => { await db.update('broker_profiles', id, { archive: !r.archive }); toast(r.archive ? 'Profil restauré' : 'Profil archivé'); render(); };
    m.querySelector('#bk-save').onclick = async () => {
      const suivi = m.querySelector('#bk-suivi').value; const notes = m.querySelector('#bk-notes').value;
      const patch = { suivi, notes }; if (suivi !== 'new' && suivi !== (r.suivi || 'new')) patch.last_contact_at = new Date().toISOString();
      await db.update('broker_profiles', id, patch); toast('Suivi enregistré'); render();
    };
  };
  render();
}

export const vivierPage = {
  title: () => 'Vivier courtiers — La Référence Courtage',
  render(root) {
    if (!canSee()) return denied(root);
    const state = { q: '', dep: new Set(), prio: new Set(), suivi: '', cert: '', email: false, tel: false, arch: false, sort: 'prio', dir: 1, focus: null };
    const pVille = pickState(); const pReseau = pickState();
    const PORD = { '1': 0, '2a': 1, '2b': 2, '3': 3 }, SORD = { ok: 0, rdv: 1, contact: 2, new: 3, no: 4 };
    const draw = () => {
      const all = db.t('broker_profiles');
      const live = all.filter(r => !r.archive);
      const villes = [...new Set(all.map(r => r.ville_key).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
      const reseaux = [...new Set(all.map(r => r.reseau_key).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
      const qt = terms(state.q);
      const villeItems = villes.map(v => ({ id: v, name: v, sub: live.filter(r => r.ville_key === v).length + ' profils' }));
      const reseauItems = reseaux.map(v => ({ id: v, name: v, sub: live.filter(r => r.reseau_key === v).length + ' profils' }));
      pickInit(pVille, villeItems); pickInit(pReseau, reseauItems);
      let rows = all.filter(r => !!r.archive === state.arch
        && (!state.dep.size || state.dep.has(r.dep)) && (!r.ville_key || pVille.sel.has(r.ville_key)) && (!r.reseau_key || pReseau.sel.has(r.reseau_key))
        && (!state.prio.size || state.prio.has(r.prio)) && (!state.suivi || (r.suivi || 'new') === state.suivi) && (!state.cert || r.cert === state.cert)
        && (!state.email || r.email_ok) && (!state.tel || r.tel_type === 'direct')
        && hit([r.prenom, r.nom, r.ville, r.reseau, r.statut, r.poste, r.exp, r.email, r.tel, r.orias, r.notes], qt));
      const val = r => ({ nom: (r.nom || '') + ' ' + (r.prenom || ''), ville: r.ville || '', dep: r.dep || '', reseau: r.reseau || '', prio: PORD[r.prio] ?? 9, suivi: SORD[r.suivi || 'new'] ?? 9, exp: r.exp_years == null ? 999 : -r.exp_years, orias: r.orias_year == null ? 9999 : r.orias_year, cert: CERT.indexOf(r.cert) })[state.sort];
      rows.sort((a, b) => { const x = val(a), y = val(b); let c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr'); if (!c) c = (PORD[a.prio] ?? 9) - (PORD[b.prio] ?? 9) || (a.nom || '').localeCompare(b.nom || '', 'fr'); return c * state.dir; });
      const byP = p => live.filter(r => r.prio === p).length;
      const followed = live.filter(r => ['contact', 'rdv'].includes(r.suivi)).length, recruited = live.filter(r => r.suivi === 'ok').length;
      const chip = (f, v, label, on) => `<button class="btn ghost sm" data-chip="${f}" data-v="${v}" style="${on ? 'background:var(--orange-soft);border-color:var(--orange)' : ''}">${label}</button>`;
      const th = (k, label) => `<th data-sort="${k}" style="cursor:pointer">${label}${state.sort === k ? (state.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      root.innerHTML = `
        <div class="grid c4">
          <div class="card tight kpi"><div class="lbl">Profils</div><div class="val">${live.length}</div><div class="sub">${DEPS.map(d => `${d} : ${live.filter(r => r.dep === d).length}`).join(' · ')}</div></div>
          <div class="card tight kpi" style="--kpi:#D8F1F8;--kpi-c:#0A6F86"><div class="lbl">Mandataires & indépendants</div><div class="val">${byP('1') + byP('3')}</div><div class="sub">dont ${byP('3')} à vérifier</div></div>
          <div class="card tight kpi" style="--kpi:#FFEAD1;--kpi-c:#C4640F"><div class="lbl">En agence · dirigeants</div><div class="val">${byP('2a')} <span style="font-size:16px;color:var(--muted)">· ${byP('2b')}</span></div><div class="sub">à qualifier · partenariats</div></div>
          <div class="card tight kpi" style="--kpi:#dcfce7;--kpi-c:var(--green)"><div class="lbl">Suivi</div><div class="val">${followed} <span style="font-size:16px;color:var(--muted)">· ${recruited}</span></div><div class="sub">en cours (contactés, RDV) · recrutés</div></div>
        </div>
        <div class="card tight">
          <div class="toolbar">
            ${searchInput('vq', state, 'Nom, ville, réseau, poste, ORIAS…')}
            ${multiPick('v-ville', villeItems, pVille, { noun: 'ville', nounPlural: 'villes', allLabel: 'Toutes les villes' })}
            ${multiPick('v-reseau', reseauItems, pReseau, { noun: 'réseau', nounPlural: 'réseaux', allLabel: 'Tous les réseaux' })}
            <select id="v-suivi"><option value="">Tout suivi</option>${Object.entries(SUIVI).map(([k, v]) => `<option value="${k}" ${state.suivi === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
            <select id="v-cert"><option value="">Toute certitude</option>${CERT.map(c => `<option ${state.cert === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
          </div>
          <div class="toolbar" style="margin-top:8px">
            <span class="muted small">Dépt</span>${DEPS.map(d => chip('dep', d, d, state.dep.has(d))).join('')}
            <span class="muted small" style="margin-left:8px">Profil</span>${Object.entries(PRIO).map(([k, v]) => chip('prio', k, v.label, state.prio.has(k))).join('')}
            <span class="muted small" style="margin-left:8px">Contact</span>${chip('email', '1', 'Mail nominatif', state.email)}${chip('tel', '1', 'Ligne directe', state.tel)}
            <span class="grow"></span>${chip('arch', '1', state.arch ? 'Voir les actifs' : 'Voir les archivés', state.arch)}
            <button class="btn ghost sm" id="v-reset">Réinitialiser</button><button class="btn ghost sm" id="v-export">Export CSV</button><button class="btn sm" id="v-new">+ Profil</button>
          </div>
        </div>
        <div class="card"><div class="card-head"><h2>${rows.length} profil${rows.length > 1 ? 's' : ''} affiché${rows.length > 1 ? 's' : ''}${state.arch ? ' (archivés)' : ''}</h2><span class="muted small">Le statut de suivi se change directement dans la liste ; cliquez sur une ligne pour la fiche et les notes.</span></div>
          <div class="table-wrap"><table><thead><tr>${th('nom', 'Nom')}${th('ville', 'Ville')}${th('dep', 'Dépt')}${th('reseau', 'Réseau / entreprise')}<th>Statut pro</th>${th('exp', 'Expérience')}${th('orias', 'ORIAS')}<th>Email</th><th>Téléphone</th>${th('prio', 'Profil')}${th('cert', 'Certitude')}${th('suivi', 'Suivi')}</tr></thead><tbody>
            ${rows.map(r => { const p = PRIO[r.prio] || PRIO['3']; const s = r.suivi || 'new'; return `<tr class="click" data-bk="${r.id}"><td><b>${esc(r.prenom || '')} ${esc(r.nom || '')}</b><div class="small muted">${esc(r.poste || '')}</div></td><td>${esc(r.ville || '')}</td><td>${esc(r.dep || '')}</td><td class="small">${esc(r.reseau || '')}</td><td class="small">${esc(r.statut || '')}</td><td class="small">${esc(r.exp || '')}${r.exp_years != null ? ` <span class="muted">(${r.exp_years} ans)</span>` : ''}</td><td class="small nowrap">${r.orias ? esc(r.orias) + (r.orias_year ? `<div class="muted">depuis ${r.orias_year}</div>` : '') : '—'}</td><td class="small">${r.email ? `<a href="mailto:${esc(r.email)}" onclick="event.stopPropagation()" class="${r.email_ok ? '' : 'muted'}" title="${r.email_ok ? '' : 'Adresse générique'}">${esc(r.email)}</a>` : '—'}</td><td class="small nowrap">${r.tel ? esc(r.tel) + (r.tel_type === 'agence' ? ' <span class="muted">(agence)</span>' : '') : '—'}</td><td><span class="badge" style="--c:${p.color}">${esc(p.label)}</span></td><td class="small">${esc(r.cert || '')}</td><td><select class="filter-input" style="padding:4px 8px;min-width:120px;font-size:12px" data-suivi="${r.id}" onclick="event.stopPropagation()">${Object.entries(SUIVI).map(([k, v]) => `<option value="${k}" ${s === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></td></tr>`; }).join('') || '<tr><td colspan="12" class="empty">Aucun profil ne correspond à ces filtres.</td></tr>'}
          </tbody></table></div>
          <p class="muted small" style="margin-top:12px">${Object.entries(PRIO).map(([k, v]) => `<span class="badge" style="--c:${v.color}">${v.label}</span> ${esc(v.desc)}`).join(' &nbsp; ')}</p>
        </div>`;
      bindSearch(root, 'vq', state, draw);
      bindMultiPick(root, 'v-ville', villeItems, pVille, draw, state);
      bindMultiPick(root, 'v-reseau', reseauItems, pReseau, draw, state);
      restoreFocus(root, state);
      root.querySelector('#v-suivi').onchange = e => { state.suivi = e.target.value; draw(); };
      root.querySelector('#v-cert').onchange = e => { state.cert = e.target.value; draw(); };
      root.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { const f = b.dataset.chip, v = b.dataset.v; if (f === 'dep' || f === 'prio') { state[f].has(v) ? state[f].delete(v) : state[f].add(v); } else state[f] = !state[f]; draw(); });
      root.querySelectorAll('[data-sort]').forEach(t => t.onclick = () => { if (state.sort === t.dataset.sort) state.dir *= -1; else { state.sort = t.dataset.sort; state.dir = 1; } draw(); });
      root.querySelector('#v-reset').onclick = () => { Object.assign(state, { q: '', dep: new Set(), prio: new Set(), suivi: '', cert: '', email: false, tel: false, arch: false, focus: null }); pVille.sel = null; pReseau.sel = null; pVille.q = ''; pReseau.q = ''; draw(); };
      root.querySelector('#v-new').onclick = () => brokerForm(null, (id) => { draw(); if (id) openBroker(id, draw); });
      root.querySelector('#v-export').onclick = () => csvDownload('vivier-courtiers.csv', rows.map(r => ({ prenom: r.prenom, nom: r.nom, ville: r.ville, departement: r.dep, reseau: r.reseau, statut_pro: r.statut, poste: r.poste, experience: r.exp, anciennete_ans: r.exp_years, orias: r.orias, orias_annee: r.orias_year, email: r.email, telephone: r.tel, type_tel: r.tel_type, profil: PRIO[r.prio]?.label, certitude: r.cert, suivi: SUIVI[r.suivi || 'new']?.label, notes: r.notes, sources: (r.sources || []).join(' ; ') })));
      root.querySelectorAll('[data-bk]').forEach(tr => tr.onclick = () => openBroker(tr.dataset.bk, draw));
      root.querySelectorAll('[data-suivi]').forEach(sel => sel.onchange = async () => { const r = db.byId('broker_profiles', sel.dataset.suivi); const patch = { suivi: sel.value }; if (sel.value !== 'new') patch.last_contact_at = new Date().toISOString(); await db.update('broker_profiles', r.id, patch); toast(`Suivi : ${SUIVI[sel.value].label}`); draw(); });
    };
    draw();
    return { refresh: draw };
  },
};
