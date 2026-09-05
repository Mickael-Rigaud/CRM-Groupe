// Paramètres : utilisateurs et droits, import CSV, référentiel, entrée des leads (Make), démo.
import { CONFIG } from '../config.js';
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, CHANNELS, ROLES, LOST_REASONS, ACTIVITY_TYPES } from '../data/schema.js';
import { esc, toast, openModal, closeModal, renderForm, readForm, confirm, csvDownload } from '../ui.js';

function parseCsv(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map(h => h.replace(/^﻿/, '').trim().toLowerCase());
  return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}
const ALIASES = { prenom: 'first_name', prénom: 'first_name', firstname: 'first_name', nom: 'last_name', lastname: 'last_name', telephone: 'phone', téléphone: 'phone', tel: 'phone', mobile: 'phone', email: 'email', mail: 'email', adresse: 'address', cp: 'postal_code', code_postal: 'postal_code', 'code postal': 'postal_code', ville: 'city', societe: 'org', société: 'org', organisation: 'org', entreprise: 'org', type: 'type', canal: 'channel', origine: 'channel', source: 'channel', campagne: 'campaign', activites: 'activities', activités: 'activities', activite: 'activities', notes: 'notes', note: 'notes', consentement: 'consent' };

export const settingsPage = {
  title: () => 'Paramètres',
  render(root) {
    const draw = () => {
      const users = db.t('profiles');
      root.innerHTML = `
        <div class="grid c2">
          <div class="card"><div class="card-head"><h2>Utilisateurs et droits</h2>${scope.isDirection && db.demo ? '<button class="btn sm" id="u-new">+ Utilisateur (démo)</button>' : ''}</div>
            <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Activités</th><th>Actif</th></tr></thead><tbody>
              ${users.map(u => `<tr><td><b>${esc(u.full_name)}</b><div class="small muted">${esc(u.email || '')}</div></td><td><span class="pill">${esc(ROLES[u.role]?.label || u.role)}</span></td><td>${(u.activities || []).map(k => `<span class="badge" style="--c:${ACTIVITIES[k]?.color}">${esc(ACTIVITIES[k]?.short || k)}</span>`).join(' ')}</td><td>${u.active === false ? '<span class="pill bad">Non</span>' : '<span class="pill ok">Oui</span>'}</td></tr>`).join('')}
            </tbody></table></div>
            <p class="muted small">${Object.entries(ROLES).map(([k, r]) => `<b>${r.label}</b> : ${r.description}`).join('<br>')}</p>
            ${!db.demo ? '<p class="muted small">En production, les comptes se créent dans Supabase (Authentication → Users), puis une ligne dans la table <code>profiles</code> fixe le rôle et les activités.</p>' : ''}
          </div>
          <div class="card"><div class="card-head"><h2>Import de contacts (CSV)</h2></div>
            <p class="muted small">Colonnes reconnues : prénom, nom, téléphone, email, adresse, code postal, ville, société, type, canal, campagne, activités (rgd|btp|courtage|propulsion), notes. Séparateur ; ou ,. Les doublons (même email ou téléphone) sont ignorés.</p>
            <div class="form"><div class="field half"><label>Fichier CSV</label><input type="file" id="imp-file" accept=".csv,text/csv"></div>
              <div class="field half"><label>Activité par défaut</label><select id="imp-act"><option value="">— aucune —</option>${ACTIVITY_KEYS.map(k => `<option value="${k}">${esc(ACTIVITIES[k].label)}</option>`).join('')}</select></div>
              <div class="field half"><label>Canal par défaut</label><select id="imp-channel"><option value="">— aucun —</option>${CHANNELS.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
              <div class="field half"><label>Type par défaut</label><select id="imp-type"><option>Client</option><option>Prospect</option><option>Partenaire</option></select></div>
              <div class="form-actions"><button class="btn ghost sm" id="imp-model">Télécharger un modèle</button><button class="btn" id="imp-go">Importer</button></div></div>
            <div id="imp-result" class="small muted"></div>
          </div>
        </div>
        <div class="grid c2">
          <div class="card"><div class="card-head"><h2>Entrée automatique des leads</h2></div>
            <p class="small">Les formulaires des sites et les Meta Lead Ads créent les leads via un scénario Make (gratuit) qui appelle la fonction <code>intake_lead</code> de Supabase. Le jeton ci-dessous protège l'accès : à copier dans Make, jamais sur un site.</p>
            <div class="form"><div class="field"><label>Jeton d'entrée (intake_token)</label><input id="tok" value="${esc(db.setting('intake_token') || '')}" ${scope.isDirection ? '' : 'disabled'}></div>${scope.isDirection ? '<div class="form-actions"><button class="btn ghost sm" id="tok-gen">Générer</button><button class="btn sm" id="tok-save">Enregistrer</button></div>' : ''}</div>
            <p class="muted small">Mode d'emploi complet dans le fichier <code>README.md</code> (section « Entrée des leads »).${db.demo ? ' En mode démo, ce jeton n\'est pas utilisé.' : ''}</p>
          </div>
          <div class="card"><div class="card-head"><h2>Référentiel</h2></div>
            <p class="small"><b>Canaux</b> : ${CHANNELS.map(esc).join(' · ')}</p>
            <p class="small"><b>Motifs de perte</b> : ${LOST_REASONS.map(esc).join(' · ')}</p>
            <p class="small"><b>Types d'activités</b> : ${ACTIVITY_TYPES.map(t => t.icon + ' ' + esc(t.label)).join(' · ')}</p>
            <p class="muted small">Les pipelines, étapes, probabilités et champs par activité sont définis dans <code>js/data/schema.js</code> — un seul fichier à modifier pour faire évoluer le CRM.</p>
            <div class="card-head" style="margin-top:12px"><h2>Données</h2></div>
            <div class="toolbar"><button class="btn ghost sm" id="exp-all">Exporter toute la base (JSON)</button>${db.demo ? '<button class="btn danger sm" id="reset-demo">Réinitialiser la démo</button>' : ''}</div>
            <p class="muted small">Mode : <b>${db.demo ? 'démo (navigateur)' : 'production (Supabase)'}</b>${!db.demo ? ' · ' + esc(CONFIG.SUPABASE_URL) : ''}</p>
          </div>
        </div>`;

      root.querySelector('#imp-model').onclick = () => csvDownload('modele-contacts.csv', [{ prenom: 'Julie', nom: 'Bernard', telephone: '06 11 22 33 44', email: 'julie@exemple.fr', adresse: '12 rue Nationale', code_postal: '37000', ville: 'Tours', societe: '', type: 'Client', canal: 'Recommandation client', campagne: '', activites: 'rgd', notes: '' }]);
      root.querySelector('#imp-go').onclick = async () => {
        const f = root.querySelector('#imp-file').files[0]; if (!f) return toast('Choisissez un fichier CSV', 'warn');
        const text = await f.text(); const rows = parseCsv(text);
        const defAct = root.querySelector('#imp-act').value, defChan = root.querySelector('#imp-channel').value, defType = root.querySelector('#imp-type').value;
        let created = 0, skipped = 0, orgsCreated = 0;
        const norm = p => (p || '').replace(/\D/g, '');
        for (const raw of rows) {
          const r = {}; for (const [k, v] of Object.entries(raw)) { const key = ALIASES[k] || k; r[key] = v; }
          if (!r.last_name && !r.email && !r.phone) { skipped++; continue; }
          const dup = db.t('contacts').find(c => (r.email && c.email && c.email.toLowerCase() === r.email.toLowerCase()) || (r.phone && c.phone && norm(c.phone) === norm(r.phone)));
          if (dup) { skipped++; continue; }
          let organisation_id = null;
          if (r.org) { let o = db.t('organisations').find(x => x.name.toLowerCase() === r.org.toLowerCase()); if (!o) { o = await db.insert('organisations', { name: r.org, type: defType === 'Partenaire' ? 'Partenaire' : 'Client', owner_id: scope.user.id, activities: defAct ? [defAct] : [] }); orgsCreated++; } organisation_id = o.id; }
          const activities = (r.activities || '').split(/[|,]/).map(s => s.trim().toLowerCase()).filter(k => ACTIVITIES[k]);
          await db.insert('contacts', { first_name: r.first_name || '', last_name: r.last_name || '', phone: r.phone || '', email: r.email || '', address: r.address || '', postal_code: r.postal_code || '', city: r.city || '', organisation_id, type: r.type || defType, channel: CHANNELS.includes(r.channel) ? r.channel : defChan, campaign: r.campaign || '', activities: activities.length ? activities : (defAct ? [defAct] : []), notes: r.notes || '', consent: /oui|yes|1|true/i.test(r.consent || ''), owner_id: scope.user.id });
          created++;
        }
        root.querySelector('#imp-result').innerHTML = `<b>${created}</b> contact(s) créé(s), ${skipped} ignoré(s) (doublons ou lignes vides), ${orgsCreated} organisation(s) créée(s).`;
        toast(`${created} contacts importés`);
      };
      root.querySelector('#tok-gen')?.addEventListener('click', () => { root.querySelector('#tok').value = 'tok_' + [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, '0')).join(''); });
      root.querySelector('#tok-save')?.addEventListener('click', async () => { const v = root.querySelector('#tok').value.trim(); if (v.length < 12) return toast('Jeton trop court', 'warn'); if (db.setting('intake_token') !== undefined) await db.update('settings', 'intake_token', { value: v }); else await db.insert('settings', { key: 'intake_token', value: v }); toast('Jeton enregistré'); });
      root.querySelector('#exp-all').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db.cache, null, 2)], { type: 'application/json' })); a.download = `crm-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
      root.querySelector('#reset-demo')?.addEventListener('click', async () => { if (await confirm('Effacer les données de démo de ce navigateur et recharger l\'exemple ?')) { db.resetDemo(); location.reload(); } });
      root.querySelector('#u-new')?.addEventListener('click', () => {
        const spec = [{ key: 'full_name', label: 'Nom complet', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', half: true }, { key: 'role', label: 'Rôle', type: 'select', options: Object.entries(ROLES).map(([k, r]) => [k, r.label]), required: true, half: true }, { key: 'activities', label: 'Activités', type: 'multiselect', options: ACTIVITY_KEYS.map(k => [k, ACTIVITIES[k].label]) }];
        const m = openModal('Nouvel utilisateur (démo)', `<form class="form" id="u-form">${renderForm(spec)}<div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn">Créer</button></div></form>`);
        m.querySelector('#u-form').onsubmit = async e => { e.preventDefault(); await db.insert('profiles', { ...readForm(e.target, spec), active: true }); closeModal(true); draw(); };
      });
    };
    draw();
    return { refresh: draw };
  },
};
