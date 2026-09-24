// Vivier Experts & AMO — recrutement de l'équipe terrain de BTP Expertise.
// Même mécanique que le vivier courtiers de La Référence Courtage : cartes en
// haut, recherche, filtres rapides et avancés, tableau, fiche au clic, statut
// changeable dans la liste, journal, relances, export CSV.
//
// Ce n'est PAS la base des apporteurs d'affaires (module distinct à venir).
// Direction uniquement, côté serveur (RLS) comme ici.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import {
  esc, openModal, closeModal, renderForm, readForm, toast, fmtDate, fmtDateTime, isoDay, daysSince, confirm,
  csvDownload, userName, terms, hit, searchInput, bindSearch, restoreFocus, pickState, pickInit, multiPick, bindMultiPick, norm,
} from '../ui.js';
import {
  CIBLES, badgeCible, FAMILLES, FONCTIONS, FONCTION_PAR_FAMILLE, STATUTS_PRO, DEPS, CERTS, SOURCES, STATUTS, PIPELINE, ORDRE_STATUT,
  CONTACTES, TYPES_EVENEMENT, EVENEMENTS_CONTACT, NIVEAUX, COMPETENCES, COMPETENCE_LABELS, EXPERIENCES, CRITERES,
  calculerScores, cibleSuggeree, qualifDe, TRANCHES_SCORE, TRANCHES_EXP, trancheExp, trancheScore, estimerSousScores, scorer, lotSemaine,
} from '../data/vivier-btp.js';

const T = 'btp_vivier';
const TE = 'btp_vivier_evenements';
const canSee = () => scope.isDirection;
const denied = (root) => { root.innerHTML = '<div class="card"><div class="empty">Le vivier est réservé à la direction.</div></div>'; return {}; };
const fiches = () => db.t(T);
const evenements = (id) => db.t(TE).filter(e => e.vivier_id === id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
const nomComplet = (r) => `${r.prenom || ''} ${r.nom || ''}`.trim();
const statutPill = (k) => { const s = STATUTS[k] || STATUTS.detecte; return `<span class="pill ${s.cls}">${esc(s.label)}</span>`; };
const qualifChip = (score) => { const q = qualifDe(score); return `<span class="chip ${q.cls}" style="font-size:11px;padding:2px 7px">${esc(q.label)}</span>`; };
const scoreHtml = (v, cls = '') => `<b class="vb-score ${cls}">${v ?? '—'}</b>`;
const selectStatut = (id, actuel, small = false) => `<select class="filter-input" ${small ? 'style="padding:4px 8px;min-width:130px;font-size:12px"' : ''} data-statut="${id}" onclick="event.stopPropagation()">
  <optgroup label="Pipeline">${PIPELINE.map(k => `<option value="${k}" ${actuel === k ? 'selected' : ''}>${STATUTS[k].label}</option>`).join('')}</optgroup>
  <optgroup label="Sortie">${Object.keys(STATUTS).filter(k => STATUTS[k].fin).map(k => `<option value="${k}" ${actuel === k ? 'selected' : ''}>${STATUTS[k].label}</option>`).join('')}</optgroup></select>`;

// ---------------------------------------------------------------- Journal
async function journaliser(vivierId, type, contenu, extra = {}) {
  return db.insert(TE, { vivier_id: vivierId, type, contenu: contenu || null, auteur_id: scope.user?.id || null, ...extra });
}

// Changer le statut d'une fiche : la date, l'auteur, l'ancien et le nouveau statut
// restent dans le journal. « Recruté » propose la fiche Chargé d'affaires.
export async function changerStatut(id, nouveau, commentaire = '') {
  const r = db.byId(T, id); if (!r || r.statut === nouveau) return;
  const patch = { statut: nouveau };
  if (CONTACTES.has(nouveau) && !r.dernier_contact) patch.dernier_contact = new Date().toISOString();
  await db.update(T, id, patch);
  await journaliser(id, 'statut', commentaire, { ancien_statut: r.statut, nouveau_statut: nouveau });
  toast(`Statut : ${STATUTS[nouveau].label}`);
  if (nouveau === 'recrute' && !r.charge_affaires_id) await proposerChargeAffaires(id);
}

async function proposerChargeAffaires(id) {
  const r = db.byId(T, id);
  if (!await confirm(`Créer ${nomComplet(r)} dans Chargés d'affaires ? La fiche vivier reste, avec son historique, et garde le lien.`)) return;
  const statut = ['independant', 'micro', 'ei', 'consultant', 'dirigeant', 'societe'].includes(r.statut_pro) ? 'Indépendant' : r.statut_pro === 'salarie' ? 'Salarié' : 'En cours de recrutement';
  const notes = [r.ville ? `Secteur : ${r.ville} (${r.dep})` : '', r.metier_actuel ? `Métier : ${r.metier_actuel}` : '',
    `Profil cible : ${CIBLES[r.profil_cible]?.label} · score ${r.score_global}/100 (Expertise ${r.score_expertise}, AMO ${r.score_amo})`,
    (r.specialites || []).length ? `Spécialités : ${r.specialites.join(', ')}` : '', 'Issu du vivier Experts & AMO.'].filter(Boolean).join('\n');
  try {
    const ca = await db.insert('btp_charges_affaires', { nom: nomComplet(r), email: r.email || null, telephone: r.telephone || null, statut, notes, actif: true });
    await db.update(T, id, { charge_affaires_id: ca.id });
    await journaliser(id, 'autre', "Fiche créée dans Chargés d'affaires.");
    toast("Chargé d'affaires créé");
  } catch (e) { toast(e.message, 'err'); }
}

// ---------------------------------------------------------------- Doublons
export function doublonsDe(v, saufId = null) {
  const tel = (s) => String(s || '').replace(/\D/g, '');
  const li = (s) => String(s || '').toLowerCase().replace(/\/+$/, '');
  return fiches().filter(x => x.id !== saufId && (
    (v.nom && norm(x.nom) === norm(v.nom) && norm(x.prenom) === norm(v.prenom))
    || (v.email && x.email && x.email.toLowerCase() === v.email.toLowerCase())
    || (tel(v.telephone) && tel(x.telephone) === tel(v.telephone))
    || (v.linkedin_url && li(x.linkedin_url) === li(v.linkedin_url))
    || (v.entreprise && v.ville && x.entreprise && norm(x.entreprise) === norm(v.entreprise) && norm(x.ville_key) === norm(v.ville_key) && norm(x.nom) === norm(v.nom))));
}
// Doublon potentiel : fusionner (ouvrir l'existant et y reporter), ignorer, ou créer quand même.
function demanderDoublon(dups) {
  return new Promise(res => {
    const m = openModal('Doublon potentiel', `<p class="muted">Une ou plusieurs fiches ressemblent à celle-ci :</p>
      <ul style="margin:8px 0 14px;padding-left:18px">${dups.map(d => `<li><b>${esc(nomComplet(d))}</b> — ${esc(d.ville || '')} · ${esc(d.metier_actuel || FAMILLES[d.famille] || '')} · ${statutPill(d.statut)}</li>`).join('')}</ul>
      <div class="form-actions"><button class="btn ghost left" data-close id="dd-ign">Ignorer</button><button class="btn ghost" id="dd-fus">Fusionner (ouvrir l'existante)</button><button class="btn" id="dd-crea">Créer quand même</button></div>`);
    m.querySelector('#dd-ign').onclick = () => res('ignorer');
    m.querySelector('#dd-fus').onclick = () => { closeModal(true); res('fusionner'); };
    m.querySelector('#dd-crea').onclick = () => { closeModal(true); res('creer'); };
  });
}

// ---------------------------------------------------------------- Formulaire
export function profilForm(existing = null, onSaved, onClose = null) {
  const users = scope.users();
  const spec = [
    { key: 'prenom', label: 'Prénom', type: 'text', half: true },
    { key: 'nom', label: 'Nom', type: 'text', required: true, half: true },
    { key: 'ville', label: 'Ville / secteur', type: 'text', required: true, half: true, placeholder: 'Nice / Sophia Antipolis' },
    { key: 'dep', label: 'Département', type: 'select', options: DEPS, required: true, half: true, value: '06' },
    { key: 'entreprise', label: 'Entreprise actuelle', type: 'text', half: true },
    { key: 'statut_pro', label: 'Statut professionnel', type: 'select', options: Object.entries(STATUTS_PRO), required: true, half: true, value: 'a_verifier' },
    { key: 'metier_actuel', label: 'Métier actuel (tel qu\'affiché)', type: 'text', half: true, placeholder: 'Maître d\'œuvre d\'exécution' },
    { key: 'metier_origine', label: "Métier d'origine", type: 'text', half: true, placeholder: 'Maçon, conducteur de travaux…' },
    { key: 'famille', label: 'Famille métier', type: 'select', options: Object.entries(FAMILLES), required: true, half: true, value: 'autres' },
    { key: 'fonction', label: 'Fonction dominante', type: 'select', options: Object.entries(FONCTIONS), required: true, half: true, value: 'autre' },
    { key: 'profil_cible', label: 'Profil cible BTP Expertise', type: 'select', options: Object.entries(CIBLES).map(([k, v]) => [k, v.label]), required: true, half: true, value: 'mixte', hint: 'Suggestion recalculée avec le score ; vous tranchez.' },
    { key: 'exp_years', label: "Années d'expérience bâtiment", type: 'number', half: true },
    { key: 'specialites', label: 'Spécialités (séparées par des virgules)', type: 'text', placeholder: 'fissures, humidité, rénovation lourde' },
    { key: 'parcours', label: 'Parcours (résumé)', type: 'textarea', rows: 2 },
    { key: 'email', label: 'Email', type: 'email', half: true },
    { key: 'telephone', label: 'Téléphone', type: 'tel', half: true },
    { key: 'linkedin_url', label: 'LinkedIn', type: 'url', half: true, placeholder: 'https://www.linkedin.com/in/…' },
    { key: 'site_web', label: 'Site', type: 'url', half: true },
    { key: 'source_principale', label: 'Source principale', type: 'select', options: Object.entries(SOURCES), half: true, value: 'linkedin' },
    { key: 'cert', label: 'Certitude globale', type: 'select', options: Object.entries(CERTS), required: true, half: true, value: 'a_verifier' },
    { key: 'sources', label: 'Sources (une URL par ligne)', type: 'textarea', rows: 2 },
    { key: 'responsable_id', label: 'Responsable du suivi', type: 'select', options: users.map(u => [u.id, u.full_name]), half: true, value: scope.user?.id || '' },
    { key: 'statut', label: 'Statut de suivi', type: 'select', options: Object.entries(STATUTS).map(([k, v]) => [k, v.label]), required: true, half: true, value: 'verifier' },
  ];
  const vals = existing ? { ...existing, sources: (existing.sources || []).join('\n'), specialites: (existing.specialites || []).join(', ') } : {};
  const comp = { ...(existing?.competences || {}) };
  const certd = { ...(existing?.cert_details || {}) };
  const expHtml = `<div class="field"><label>Expériences</label><div class="checks">${Object.entries(EXPERIENCES).map(([k, l]) => `<label class="check"><input type="checkbox" name="${k}" ${existing?.[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>`;
  const certHtml = `<div class="field"><label>Certitude par donnée</label><div class="vb-certs">${[['metier', 'Métier'], ['statut_pro', 'Statut pro'], ['telephone', 'Téléphone'], ['email', 'Email'], ['experience', 'Expérience']].map(([k, l]) => `<label>${esc(l)} <select data-cert="${k}">${['', ...Object.keys(CERTS)].map(c => `<option value="${c}" ${(certd[k] || '') === c ? 'selected' : ''}>${c ? CERTS[c] : '—'}</option>`).join('')}</select></label>`).join('')}</div></div>`;
  const compHtml = `<div class="field"><label>Compétences techniques <span class="muted small">(— · notions · maîtrise · expert)</span></label>
    ${COMPETENCES.map(g => `<div class="vb-comp-groupe"><div class="vb-comp-titre">${esc(g.groupe)}</div><div class="vb-comp-grille">${Object.entries(g.items).map(([k, l]) => `<div class="vb-comp"><span>${esc(l)}</span><div class="vb-niv" data-comp="${k}">${NIVEAUX.map((n, i) => `<button type="button" data-n="${i}" class="${(comp[k] || 0) === i ? 'on' : ''}" title="${esc(n)}">${i || '—'}</button>`).join('')}</div></div>`).join('')}</div></div>`).join('')}</div>`;

  const m = openModal(existing ? 'Modifier la fiche' : 'Ajouter un profil', `<form class="form" id="vbf">${renderForm(spec, vals)}${expHtml}${certHtml}${compHtml}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left" id="vb-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true, onClose });
  const form = m.querySelector('#vbf');
  // La famille propose sa fonction dominante quand rien n'est encore choisi.
  form.querySelector('[name="famille"]').addEventListener('change', e => { const f = form.querySelector('[name="fonction"]'); if (!existing || f.value === 'autre') f.value = FONCTION_PAR_FAMILLE[e.target.value] || 'autre'; });
  form.querySelectorAll('.vb-niv').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { comp[g.dataset.comp] = Number(b.dataset.n); g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }));
  form.onsubmit = async e => {
    e.preventDefault(); const v = readForm(form, spec);
    v.nom = v.nom.toUpperCase().trim();
    v.sources = v.sources.split(/\n+/).map(s => s.trim()).filter(Boolean);
    v.specialites = v.specialites.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    v.ville_key = v.ville.split(/\s*[\/(]/)[0].trim() || '—';
    v.responsable_id = v.responsable_id || null; v.exp_years = v.exp_years ?? null;
    for (const k of Object.keys(EXPERIENCES)) v[k] = !!form.querySelector(`input[name="${k}"]`)?.checked;
    v.competences = Object.fromEntries(Object.entries(comp).filter(([, n]) => n > 0));
    form.querySelectorAll('[data-cert]').forEach(s => { if (s.value) certd[s.dataset.cert] = s.value; else delete certd[s.dataset.cert]; });
    v.cert_details = certd;
    // Les scores suivent la fiche, sauf s'ils ont été fixés à la main.
    const scored = scorer({ ...(existing || {}), ...v });
    Object.assign(v, { scores: scored.scores, score_global: scored.score_global, score_expertise: scored.score_expertise, score_amo: scored.score_amo });
    if (!existing) {
      const dups = doublonsDe(v);
      if (dups.length) {
        const choix = await demanderDoublon(dups);
        if (choix === 'ignorer') return;
        if (choix === 'fusionner') { closeModal(true); openProfil(dups[0].id, () => onSaved?.(null)); return; }
      }
    }
    try {
      let id = existing?.id;
      if (existing) { await db.update(T, id, v); if (v.statut !== existing.statut) await journaliser(id, 'statut', 'Modifié depuis la fiche', { ancien_statut: existing.statut, nouveau_statut: v.statut }); }
      else { id = (await db.insert(T, { ...v, date_detection: isoDay(), veille_lot: lotSemaine(), scores_manuels: false })).id; await journaliser(id, 'note', 'Fiche créée à la main.'); }
      closeModal(true); toast(existing ? 'Fiche mise à jour' : 'Profil ajouté'); onSaved?.(id);
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#vb-del')?.addEventListener('click', async () => { if (!await confirm('Supprimer définitivement cette fiche et son journal ? (préférez le statut « Archivé »)')) return; await db.remove(T, existing.id); closeModal(true); toast('Fiche supprimée'); onSaved?.(null); });
}

// ---------------------------------------------------------------- Fiche
export function openProfil(id, onChange) {
  const render = () => {
    const r = db.byId(T, id); if (!r) return closeModal();
    const users = scope.users();
    const s = r.scores || {};
    const sugg = cibleSuggeree(r);
    const evts = evenements(id);
    const ca = r.charge_affaires_id ? db.byId('btp_charges_affaires', r.charge_affaires_id) : null;
    const lien = (u) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48))}${u.length > 56 ? '…' : ''}</a>` : '—';
    const cd = r.cert_details || {};
    const certOf = (k) => cd[k] ? ` <span class="pill ${cd[k] === 'certain' ? 'ok' : cd[k] === 'probable' ? 'info' : 'warn'}" style="font-size:10px">${CERTS[cd[k]]}</span>` : '';
    const retard = r.prochaine_relance && daysSince(r.prochaine_relance) > 0;
    const html = `
      <div class="vb-tete">
        <div>
          ${badgeCible(r.profil_cible)} ${qualifChip(r.score_global)} ${statutPill(r.statut)} <span class="pill">${esc(CERTS[r.cert] || '')}</span>
          ${ca ? `<span class="pill ok">Chargé d'affaires : ${esc(ca.nom)}</span>` : ''}
          <div class="muted small" style="margin-top:6px">${esc(r.metier_actuel || FAMILLES[r.famille] || '')}${r.entreprise ? ' · ' + esc(r.entreprise) : ''} · ${esc(r.ville || '')} (${esc(r.dep || '')})${r.exp_years != null ? ` · ${r.exp_years} ans` : ''}</div>
        </div>
        <div class="vb-scores3">
          <div><span>Expertise</span>${scoreHtml(r.score_expertise, 'exp')}</div>
          <div><span>AMO</span>${scoreHtml(r.score_amo, 'amo')}</div>
          <div><span>Global</span>${scoreHtml(r.score_global, 'glo')}</div>
        </div>
        <div class="toolbar"><button class="btn ghost sm" id="vb-edit">✎ Modifier</button></div>
      </div>
      <div class="detail">
        <div>
          <div class="section"><h3>Identité & contact</h3><dl>
            <dt>Email</dt><dd>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '—'}${certOf('email')}</dd>
            <dt>Téléphone</dt><dd>${r.telephone ? `<a href="tel:${esc(r.telephone)}">${esc(r.telephone)}</a>` : '—'}${certOf('telephone')}</dd>
            <dt>LinkedIn</dt><dd>${lien(r.linkedin_url)}</dd>
            <dt>Site</dt><dd>${lien(r.site_web)}</dd>
            <dt>Entreprise</dt><dd>${esc(r.entreprise || '—')}</dd>
            <dt>Statut pro</dt><dd>${esc(STATUTS_PRO[r.statut_pro] || '—')}${certOf('statut_pro')}</dd>
            <dt>Source</dt><dd>${esc(SOURCES[r.source_principale] || '—')} <span class="muted small">· détecté le ${fmtDate(r.date_detection)}${r.veille_lot ? ' · ' + esc(r.veille_lot) : ''}</span></dd>
            <dt>Liens</dt><dd style="font-weight:400">${(r.sources || []).map(u => lien(u)).join('<br>') || '—'}</dd>
          </dl></div>
          <div class="section"><h3>Profil BTP</h3><dl>
            <dt>Famille</dt><dd>${esc(FAMILLES[r.famille] || '')}</dd>
            <dt>Fonction dominante</dt><dd>${esc(FONCTIONS[r.fonction] || '')}</dd>
            <dt>Métier actuel</dt><dd>${esc(r.metier_actuel || '—')}${certOf('metier')}</dd>
            <dt>Métier d'origine</dt><dd>${esc(r.metier_origine || '—')}</dd>
            <dt>Expérience</dt><dd>${r.exp_years != null ? r.exp_years + ' ans' : '—'}${certOf('experience')}</dd>
            <dt>Spécialités</dt><dd>${(r.specialites || []).map(x => `<span class="pill">${esc(x)}</span>`).join(' ') || '—'}</dd>
            <dt>Parcours</dt><dd style="font-weight:400">${esc(r.parcours || '—')}</dd>
            <dt>Expériences</dt><dd>${Object.entries(EXPERIENCES).filter(([k]) => r[k]).map(([, l]) => `<span class="pill ok">${esc(l)}</span>`).join(' ') || '—'}</dd>
          </dl></div>
          <div class="section"><h3>Compétences</h3>
            <div class="vb-comp-lecture">${Object.entries(r.competences || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="pill ${n === 3 ? 'ok' : n === 2 ? 'info' : ''}">${esc(COMPETENCE_LABELS[k] || k)} <b>${n}</b></span>`).join(' ') || '<span class="muted">Aucune compétence renseignée.</span>'}</div>
          </div>
          <div class="section"><h3>Scoring <span class="muted small">${r.scores_manuels ? '· fixé à la main' : '· estimé automatiquement'}</span></h3>
            <div class="vb-crit">${CRITERES.map(c => `<label><span>${esc(c.label)}</span><input type="number" min="0" max="${c.max}" step="1" data-crit="${c.key}" value="${s[c.key] ?? 0}"><em>/${c.max}</em></label>`).join('')}</div>
            <div class="toolbar" style="margin-top:8px"><span class="muted small">Cible suggérée : ${badgeCible(sugg)}${sugg !== r.profil_cible ? ' <span class="pill warn">différente du choix</span>' : ''}</span><span class="grow"></span>
              <button class="btn ghost sm" id="vb-auto">↺ Ré-estimer</button><button class="btn sm" id="vb-score-save">Enregistrer les scores</button></div>
          </div>
        </div>
        <div>
          <div class="section"><h3>Suivi du recrutement</h3>
            <div class="field"><label>Statut</label>${selectStatut(r.id, r.statut)}</div>
            <div class="form">
              <div class="field half"><label>Prochaine action</label><input id="vb-pa" value="${esc(r.prochaine_action || '')}" placeholder="Appeler, envoyer la présentation…"></div>
              <div class="field half"><label>Date de relance ${retard ? '<span class="pill bad">en retard</span>' : ''}</label><input id="vb-rel" type="date" value="${esc(r.prochaine_relance || '')}"></div>
            </div>
            <div class="form" style="margin-top:12px">
              <div class="field half"><label>Responsable du suivi</label><select id="vb-resp"><option value="">—</option>${users.map(u => `<option value="${u.id}" ${u.id === r.responsable_id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></div>
              <div class="field half"><label>Dernier contact</label><div class="muted" style="padding-top:8px">${r.dernier_contact ? fmtDateTime(r.dernier_contact) : '—'}</div></div>
            </div>
            <div class="field"><label>Disponibilité</label><input id="vb-dispo" value="${esc(r.disponibilite || '')}"></div>
            <div class="field"><label>Attentes</label><input id="vb-att" value="${esc(r.attentes || '')}"></div>
            <div class="field"><label>Objections</label><input id="vb-obj" value="${esc(r.objections || '')}"></div>
            <div class="field"><label>Notes</label><textarea id="vb-notes" rows="3">${esc(r.notes || '')}</textarea></div>
            <div class="form-actions"><button class="btn sm" id="vb-suivi-save">Enregistrer le suivi</button></div>
          </div>
          <div class="section"><h3>Journal</h3>
            <div class="toolbar"><select id="vb-ev-type">${Object.entries(TYPES_EVENEMENT).filter(([k]) => !['statut', 'veille'].includes(k)).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
              <input id="vb-ev-txt" class="grow" placeholder="Appel : pas de réponse, rappeler jeudi…"><button class="btn sm" id="vb-ev-add">Ajouter</button></div>
            <div class="vb-journal">${evts.map(e => `<div class="vb-ev"><div class="small muted">${fmtDateTime(e.created_at)} · ${esc(TYPES_EVENEMENT[e.type] || e.type)}${e.auteur_id ? ' · ' + esc(userName(e.auteur_id)) : ''}</div>
              <div>${e.type === 'statut' ? `${statutPill(e.ancien_statut)} → ${statutPill(e.nouveau_statut)} ` : ''}${esc(e.contenu || '')}</div></div>`).join('') || '<div class="muted small">Aucun événement.</div>'}</div>
          </div>
        </div>
      </div>`;
    const m = openModal(nomComplet(r) || 'Fiche', html, { wide: true, onClose: () => onChange?.() });
    m.querySelector('#vb-edit').onclick = () => profilForm(r, (nid) => nid ? render() : onChange?.(), render);
    m.querySelector('[data-statut]').onchange = async e => { await changerStatut(id, e.target.value); render(); };
    m.querySelector('#vb-suivi-save').onclick = async () => {
      await db.update(T, id, { prochaine_action: m.querySelector('#vb-pa').value || null, prochaine_relance: m.querySelector('#vb-rel').value || null, responsable_id: m.querySelector('#vb-resp').value || null,
        disponibilite: m.querySelector('#vb-dispo').value || null, attentes: m.querySelector('#vb-att').value || null, objections: m.querySelector('#vb-obj').value || null, notes: m.querySelector('#vb-notes').value || null });
      toast('Suivi enregistré'); render();
    };
    m.querySelector('#vb-ev-add').onclick = async () => {
      const type = m.querySelector('#vb-ev-type').value, txt = m.querySelector('#vb-ev-txt').value.trim();
      if (!txt) return toast('Décrivez l\'échange', 'err');
      await journaliser(id, type, txt);
      const patch = {}; if (EVENEMENTS_CONTACT.has(type)) { patch.dernier_contact = new Date().toISOString(); if (r.statut === 'contacter' || r.statut === 'valide') patch.statut = 'contacte'; }
      if (Object.keys(patch).length) { await db.update(T, id, patch); if (patch.statut) await journaliser(id, 'statut', 'Premier contact journalisé', { ancien_statut: r.statut, nouveau_statut: 'contacte' }); }
      render();
    };
    m.querySelector('#vb-score-save').onclick = async () => {
      const sc = {}; m.querySelectorAll('[data-crit]').forEach(i => sc[i.dataset.crit] = Number(i.value) || 0);
      const tot = calculerScores(sc);
      await db.update(T, id, { scores: sc, scores_manuels: true, ...tot }); toast(`Score global ${tot.score_global}/100`); render();
    };
    m.querySelector('#vb-auto').onclick = async () => {
      const sc = estimerSousScores(r); const tot = calculerScores(sc);
      await db.update(T, id, { scores: sc, scores_manuels: false, ...tot }); toast('Scores ré-estimés'); render();
    };
  };
  render();
}

// ---------------------------------------------------------------- Page
export const vivierBtpPage = {
  title: () => 'Vivier Experts & AMO — BTP Expertise',
  render(root) {
    if (!canSee()) return denied(root);
    const vide = () => ({ q: '', dep: new Set(), cible: new Set(), famille: new Set(), statut: '', statutPro: '', exp: '', score: '', cert: '', resp: '', vue: 'actifs', relance: false, semaine: false, sort: 'score_global', dir: -1, focus: null });
    const state = vide();
    const pVille = pickState();
    const ORD_CIBLE = { expertise: 0, amo: 1, mixte: 2 };
    const semaine = () => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString(); };
    const mois = () => new Date().toISOString().slice(0, 7);
    const draw = () => {
      const all = fiches();
      const live = all.filter(r => r.statut !== 'archive');
      const villes = [...new Set(all.map(r => r.ville_key).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
      const villeItems = villes.map(v => ({ id: v, name: v, sub: live.filter(r => r.ville_key === v).length + ' profils' }));
      pickInit(pVille, villeItems);
      const qt = terms(state.q);
      let rows = all.filter(r => (state.vue === 'archives' ? r.statut === 'archive' : state.vue === 'sortis' ? (STATUTS[r.statut]?.fin && r.statut !== 'archive') : !STATUTS[r.statut]?.fin)
        && (!state.dep.size || state.dep.has(r.dep)) && (!r.ville_key || pVille.sel.has(r.ville_key))
        && (!state.cible.size || state.cible.has(r.profil_cible)) && (!state.famille.size || state.famille.has(r.famille))
        && (!state.statut || r.statut === state.statut) && (!state.statutPro || r.statut_pro === state.statutPro)
        && (!state.exp || trancheExp(r.exp_years) === state.exp) && (!state.score || trancheScore(r.score_global) === state.score)
        && (!state.cert || r.cert === state.cert) && (!state.resp || r.responsable_id === state.resp)
        && (!state.relance || (r.prochaine_relance && daysSince(r.prochaine_relance) >= 0))
        && (!state.semaine || (r.created_at || '') >= semaine())
        && hit([r.prenom, r.nom, r.ville, r.entreprise, r.metier_actuel, r.metier_origine, ...(r.specialites || []), r.telephone, r.email, r.notes, FAMILLES[r.famille]], qt));
      const val = r => ({ nom: (r.nom || '') + ' ' + (r.prenom || ''), ville: r.ville || '', score_global: r.score_global ?? -1, score_expertise: r.score_expertise ?? -1, score_amo: r.score_amo ?? -1,
        exp: r.exp_years ?? -1, prox: (r.scores || {}).proximite ?? -1, ajout: r.created_at || '', activite: r.updated_at || r.created_at || '', statut: ORDRE_STATUT[r.statut] ?? 99, relance: r.prochaine_relance || '9999', cible: ORD_CIBLE[r.profil_cible] ?? 9, famille: FAMILLES[r.famille] || '' })[state.sort];
      rows.sort((a, b) => { const x = val(a), y = val(b); let c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr'); if (!c) c = (b.score_global ?? 0) - (a.score_global ?? 0); return c * state.dir; });

      // Tableau de bord. Les « atteints » se lisent dans le journal : un profil recruté
      // a bien été contacté un jour, même si son statut courant ne le dit plus.
      const atteint = new Set(); const evs = db.t(TE);
      const aAtteint = (id, k) => { const r = db.byId(T, id); if (!r) return false; if (ORDRE_STATUT[r.statut] >= ORDRE_STATUT[k] && !STATUTS[r.statut].fin) return true; return evs.some(e => e.vivier_id === id && e.nouveau_statut === k); };
      const nb = (k) => live.filter(r => r.statut === k).length;
      const nbAtteint = (k) => live.filter(r => aAtteint(r.id, k)).length;
      const contactes = live.filter(r => CONTACTES.has(r.statut) || evs.some(e => e.vivier_id === r.id && (EVENEMENTS_CONTACT.has(e.type) || e.nouveau_statut === 'contacte'))).length;
      const reponses = live.filter(r => ['rdv', 'interesse', 'qualification', 'recrute', 'refuse'].includes(r.statut) || evs.some(e => e.vivier_id === r.id && ['rdv', 'interesse', 'refuse'].includes(e.nouveau_statut))).length;
      const rdv = nbAtteint('rdv'), interesses = nbAtteint('interesse'), recrutes = nb('recrute');
      const taux = (a, b) => b ? Math.round(100 * a / b) + ' %' : '—';
      const retard = live.filter(r => r.prochaine_relance && daysSince(r.prochaine_relance) > 0).length;
      const kpi = (lbl, v, c = '', sub = '') => `<div class="vb-kpi" style="${c ? `--kpi-c:${c}` : ''}"><div class="lbl">${lbl}</div><div class="val">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
      const chip = (f, v, label, on, style = '') => `<button class="btn ghost sm" data-chip="${f}" data-v="${v}" style="${on ? 'background:var(--accent-soft);border-color:var(--accent);' : ''}${style}">${label}</button>`;
      const th = (k, label) => `<th data-sort="${k}" style="cursor:pointer;white-space:nowrap">${label}${state.sort === k ? (state.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      const opt = (arr, cur) => arr.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(l)}</option>`).join('');

      root.innerHTML = `
        <div class="vb-kpis">
          ${kpi('Profils identifiés', live.length, 'var(--accent-ink)', `${live.filter(r => r.dep === '06').length} dans le 06 · ${live.filter(r => r.dep === '83').length} dans le 83`)}
          ${kpi('Expertise', live.filter(r => r.profil_cible === 'expertise').length, CIBLES.expertise.encre)}
          ${kpi('AMO', live.filter(r => r.profil_cible === 'amo').length, CIBLES.amo.encre)}
          ${kpi('Mixtes', live.filter(r => r.profil_cible === 'mixte').length, CIBLES.mixte.encre)}
          ${kpi('À vérifier', nb('detecte') + nb('verifier'))}
          ${kpi('Validés', nb('valide'))}
          ${kpi('À contacter', nb('contacter'), 'var(--sea-ink, #0A6F86)')}
          ${kpi('Contactés', nb('contacte'))}
          ${kpi('RDV', nb('rdv'), 'var(--amber)')}
          ${kpi('Intéressés', nb('interesse'), 'var(--amber)')}
          ${kpi('En qualification', nb('qualification'), 'var(--amber)')}
          ${kpi('Recrutés', recrutes, 'var(--green)')}
          ${kpi('Ajoutés / semaine', live.filter(r => (r.created_at || '') >= semaine()).length)}
          ${kpi('Ajoutés / mois', live.filter(r => (r.created_at || '').startsWith(mois())).length)}
          ${kpi('Contactés / mois', live.filter(r => (r.dernier_contact || '').startsWith(mois())).length)}
          ${kpi('Relances dues', retard, retard ? 'var(--red)' : '')}
        </div>
        <div class="card tight vb-perf">
          <span class="muted small"><b>Performance</b></span>
          <span>Détectés <b>${live.length}</b></span><span>Validés <b>${nbAtteint('valide')}</b></span><span>Contactés <b>${contactes}</b></span><span>Réponses <b>${reponses}</b></span><span>RDV <b>${rdv}</b></span><span>Intéressés <b>${interesses}</b></span><span>Qualification <b>${nbAtteint('qualification')}</b></span><span>Recrutés <b>${recrutes}</b></span>
          <span class="grow"></span>
          <span class="muted small">Contact → réponse <b>${taux(reponses, contactes)}</b> · Contact → RDV <b>${taux(rdv, contactes)}</b> · RDV → intéressé <b>${taux(interesses, rdv)}</b> · Intéressé → recruté <b>${taux(recrutes, interesses)}</b> · Détecté → recruté <b>${taux(recrutes, live.length)}</b></span>
        </div>
        <div class="card tight">
          <div class="toolbar">
            ${searchInput('vbq', state, 'Nom, ville, entreprise, métier, spécialité, téléphone, email…')}
            ${multiPick('vb-ville', villeItems, pVille, { noun: 'ville', nounPlural: 'villes', allLabel: 'Toutes les villes' })}
            <select id="vb-statut"><option value="">Tout statut</option>${opt(Object.entries(STATUTS).map(([k, v]) => [k, v.label]), state.statut)}</select>
            <select id="vb-statutpro"><option value="">Tout statut pro</option>${opt(Object.entries(STATUTS_PRO), state.statutPro)}</select>
            <select id="vb-exp"><option value="">Toute expérience</option>${opt(TRANCHES_EXP, state.exp)}</select>
            <select id="vb-scoref"><option value="">Tout score</option>${opt(TRANCHES_SCORE, state.score)}</select>
            <select id="vb-cert"><option value="">Toute certitude</option>${opt(Object.entries(CERTS), state.cert)}</select>
            <select id="vb-resp"><option value="">Tout responsable</option>${opt(scope.users().map(u => [u.id, u.full_name]), state.resp)}</select>
          </div>
          <div class="toolbar" style="margin-top:8px;row-gap:6px">
            <span class="muted small">Zone</span>${DEPS.map(([d, l]) => chip('dep', d, d === 'MC' ? 'Monaco' : d === 'autre' ? 'Autres' : d, state.dep.has(d))).join('')}
            <span class="muted small" style="margin-left:8px">Cible</span>${Object.entries(CIBLES).map(([k, v]) => chip('cible', k, v.label, state.cible.has(k), k === 'mixte' ? '' : `color:${v.encre}`)).join('')}
            <span class="muted small" style="margin-left:8px">Métier</span>${[['moe', 'MOE'], ['moex', 'MOEX'], ['inspecteurs', 'Inspecteurs'], ['experts', 'Experts'], ['artisans', 'Artisans'], ['conduite', 'Conducteurs']].map(([k, l]) => chip('famille', k, l, state.famille.has(k))).join('')}
            <select id="vb-famille" style="max-width:190px"><option value="">Autre famille…</option>${opt(Object.entries(FAMILLES), '')}</select>
          </div>
          <div class="toolbar" style="margin-top:8px;row-gap:6px">
            <span class="muted small">Vues</span>
            ${chip('score', '80', 'Score 80+', state.score === '80')}${chip('statut', 'contacter', 'À contacter', state.statut === 'contacter')}${chip('statut', 'rdv', 'RDV', state.statut === 'rdv')}${chip('statut', 'interesse', 'Intéressés', state.statut === 'interesse')}${chip('statut', 'recrute', 'Recrutés', state.statut === 'recrute')}${chip('relance', '1', `Relances dues${retard ? ` (${retard})` : ''}`, state.relance)}${chip('semaine', '1', 'Ajoutés cette semaine', state.semaine)}
            <span class="grow"></span>
            <select id="vb-vue"><option value="actifs" ${state.vue === 'actifs' ? 'selected' : ''}>Pipeline actif</option><option value="sortis" ${state.vue === 'sortis' ? 'selected' : ''}>Sortis (refusés, inadaptés, plus tard)</option><option value="archives" ${state.vue === 'archives' ? 'selected' : ''}>Archivés</option></select>
            <button class="btn ghost sm" id="vb-reset">Réinitialiser</button><button class="btn ghost sm" id="vb-export">Export CSV</button><button class="btn sm" id="vb-new">+ Profil</button>
          </div>
        </div>
        <div class="card"><div class="card-head"><h2>${rows.length} profil${rows.length > 1 ? 's' : ''}</h2><span class="muted small">Le statut se change dans la liste ; la ligne ouvre la fiche (scores, journal, relances).</span></div>
          <div class="table-wrap"><table class="vb-table"><thead><tr>${th('nom', 'Nom')}${th('ville', 'Ville')}<th>Dépt</th>${th('famille', 'Métier')}<th>Entreprise</th>${th('cible', 'Cible')}${th('exp', 'Exp.')}<th>Contact</th>${th('score_expertise', 'Exp.')}${th('score_amo', 'AMO')}${th('score_global', 'Global')}<th>Certitude</th>${th('statut', 'Suivi')}${th('relance', 'Relance')}</tr></thead><tbody>
            ${rows.map(r => `<tr class="click" data-fiche="${r.id}"><td><b>${esc(nomComplet(r))}</b><div class="small muted">${esc(r.metier_actuel || '')}</div></td><td>${esc(r.ville || '')}</td><td>${esc(r.dep || '')}</td><td class="small">${esc(FAMILLES[r.famille] || '')}<div class="muted">${esc(FONCTIONS[r.fonction] || '')}</div></td><td class="small">${esc(r.entreprise || '')}<div class="muted">${esc(STATUTS_PRO[r.statut_pro] || '')}</div></td><td>${badgeCible(r.profil_cible)}</td><td class="small">${r.exp_years != null ? r.exp_years + ' ans' : '—'}</td>
              <td class="small nowrap">${r.telephone ? `<a href="tel:${esc(r.telephone)}" onclick="event.stopPropagation()">${esc(r.telephone)}</a>` : ''}${r.telephone && r.email ? '<br>' : ''}${r.email ? `<a href="mailto:${esc(r.email)}" onclick="event.stopPropagation()">${esc(r.email)}</a>` : ''}${!r.telephone && !r.email ? (r.linkedin_url ? `<a href="${esc(r.linkedin_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">LinkedIn</a>` : '—') : ''}</td>
              <td class="num" style="color:${CIBLES.expertise.encre}">${r.score_expertise ?? '—'}</td><td class="num" style="color:${CIBLES.amo.encre}">${r.score_amo ?? '—'}</td><td class="num"><b>${r.score_global ?? '—'}</b><div>${qualifChip(r.score_global)}</div></td>
              <td class="small">${esc(CERTS[r.cert] || '')}</td><td>${selectStatut(r.id, r.statut, true)}</td><td class="small nowrap ${r.prochaine_relance && daysSince(r.prochaine_relance) > 0 ? 'vb-retard' : ''}">${r.prochaine_relance ? fmtDate(r.prochaine_relance) : '—'}${r.prochaine_action ? `<div class="muted">${esc(r.prochaine_action.slice(0, 40))}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="14" class="empty">Aucun profil ne correspond à ces filtres.</td></tr>'}
          </tbody></table></div>
        </div>`;
      bindSearch(root, 'vbq', state, draw);
      bindMultiPick(root, 'vb-ville', villeItems, pVille, draw, state);
      restoreFocus(root, state);
      const sel = (id, key) => { root.querySelector(id).onchange = e => { state[key] = e.target.value; draw(); }; };
      sel('#vb-statut', 'statut'); sel('#vb-statutpro', 'statutPro'); sel('#vb-exp', 'exp'); sel('#vb-scoref', 'score'); sel('#vb-cert', 'cert'); sel('#vb-resp', 'resp'); sel('#vb-vue', 'vue');
      root.querySelector('#vb-famille').onchange = e => { if (e.target.value) state.famille.add(e.target.value); draw(); };
      root.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => {
        const f = b.dataset.chip, v = b.dataset.v;
        if (state[f] instanceof Set) { state[f].has(v) ? state[f].delete(v) : state[f].add(v); }
        else if (f === 'relance') state.relance = !state.relance;
        else if (f === 'semaine') { state.semaine = !state.semaine; if (state.semaine) { state.sort = 'ajout'; state.dir = -1; } }
        else state[f] = state[f] === v ? '' : v;
        draw();
      });
      root.querySelectorAll('[data-sort]').forEach(t => t.onclick = () => { if (state.sort === t.dataset.sort) state.dir *= -1; else { state.sort = t.dataset.sort; state.dir = ['nom', 'ville', 'famille', 'statut', 'relance', 'cible'].includes(t.dataset.sort) ? 1 : -1; } draw(); });
      root.querySelector('#vb-reset').onclick = () => { Object.assign(state, vide()); pVille.sel = null; pVille.q = ''; draw(); };
      root.querySelector('#vb-new').onclick = () => profilForm(null, (id) => { draw(); if (id) openProfil(id, draw); });
      root.querySelector('#vb-export').onclick = () => csvDownload('vivier-experts-amo.csv', rows.map(r => ({
        nom: r.nom, prenom: r.prenom, ville: r.ville, departement: r.dep, metier: r.metier_actuel, famille: FAMILLES[r.famille], fonction_dominante: FONCTIONS[r.fonction], entreprise: r.entreprise,
        profil_cible: CIBLES[r.profil_cible]?.label, specialites: (r.specialites || []).join(' ; '), experience_ans: r.exp_years, statut_professionnel: STATUTS_PRO[r.statut_pro], email: r.email, telephone: r.telephone,
        linkedin: r.linkedin_url, site: r.site_web, score_expertise: r.score_expertise, score_amo: r.score_amo, score_global: r.score_global, qualification: qualifDe(r.score_global)?.label, certitude: CERTS[r.cert], statut_suivi: STATUTS[r.statut]?.label,
        source: SOURCES[r.source_principale], sources: (r.sources || []).join(' ; '), date_ajout: r.date_detection, dernier_contact: r.dernier_contact, prochaine_action: r.prochaine_action, prochaine_relance: r.prochaine_relance, responsable: r.responsable_id ? userName(r.responsable_id) : '',
      })));
      root.querySelectorAll('[data-fiche]').forEach(tr => tr.onclick = () => openProfil(tr.dataset.fiche, draw));
      root.querySelectorAll('[data-statut]').forEach(s => s.onchange = async () => { await changerStatut(s.dataset.statut, s.value); draw(); });
    };
    draw();
    return { refresh: draw };
  },
};
