// Paramètres : utilisateurs et droits, import CSV, référentiel, entrée des leads (Make), démo.
import { CONFIG } from '../config.js';
import { db } from '../data/db.js';
import { creerCompte } from '../comptes.js';
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
          <div class="card"><div class="card-head"><h2>Utilisateurs et droits</h2>${scope.isDirection ? `<button class="btn sm" id="u-new">+ ${db.demo ? 'Utilisateur (démo)' : 'Compte'}</button>` : ''}</div>
            <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Activités</th><th>Actif</th></tr></thead><tbody>
              ${users.map(u => `<tr><td><b>${esc(u.full_name)}</b><div class="small muted">${esc(u.email || '')}</div></td><td><span class="pill">${esc(ROLES[u.role]?.label || u.role)}</span></td><td>${(u.activities || []).map(k => `<span class="badge" style="--c:${ACTIVITIES[k]?.color}">${esc(ACTIVITIES[k]?.short || k)}</span>`).join(' ')}</td><td>${u.active === false ? '<span class="pill bad">Non</span>' : '<span class="pill ok">Oui</span>'}</td></tr>`).join('')}
            </tbody></table></div>
            <p class="muted small">${Object.entries(ROLES).map(([k, r]) => `<b>${r.label}</b> : ${r.description}`).join('<br>')}</p>
            ${!db.demo && scope.isDirection ? '<p class="muted small">« + Compte » crée le compte et envoie un lien d\'invitation : la personne choisit son mot de passe. Le rôle et les structures se règlent à la création — sans structure, elle ne verrait aucune donnée.</p>' : ''}
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
            ${[...new Set(ACTIVITY_TYPES.map(t => t.groupe))].map(g => `<p class="small"><b>Types d'activités — ${esc(g)}</b> : ${ACTIVITY_TYPES.filter(t => t.groupe === g).map(t => t.icon + ' ' + esc(t.label)).join(' · ')}</p>`).join('')}
            <p class="muted small">Les pipelines, étapes, probabilités et champs par activité sont définis dans <code>js/data/schema.js</code> — un seul fichier à modifier pour faire évoluer le CRM.</p>
            <div class="card-head" style="margin-top:12px"><h2>Données</h2></div>
            <div class="toolbar"><button class="btn ghost sm" id="exp-all">Exporter toute la base (JSON)</button>${db.demo ? '<button class="btn danger sm" id="reset-demo">Réinitialiser la démo</button>' : ''}</div>
            <p class="muted small">Mode : <b>${db.demo ? 'démo (navigateur)' : 'production (Supabase)'}</b>${!db.demo ? ' · ' + esc(CONFIG.SUPABASE_URL) : ''}</p>
          </div>
        </div>`;

      root.querySelector('#imp-model').onclick = () => csvDownload('modele-contacts.csv', [{ prenom: 'Julie', nom: 'Bernard', telephone: '06 39 98 00 01', email: 'julie@example.com', adresse: '12 rue Nationale', code_postal: '37000', ville: 'Tours', societe: '', type: 'Client', canal: 'Recommandation client', campagne: '', activites: 'rgd', notes: '' }]);
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
      // ---- Créer le compte d'une personne
      // En démo, on écrit simplement une ligne `profiles` : il n'y a pas
      // d'authentification. En production, la création d'un compte demande la clé
      // de service, qui ne descend jamais dans le navigateur — c'est l'Edge
      // Function `creer-utilisateur` qui s'en charge, et elle vérifie elle-même
      // que l'appelant est de la direction.
      root.querySelector('#u-new')?.addEventListener('click', () => {
        const v = { nom: '', email: '', role: 'charge_affaires', structures: [] };

        const corps = (etat) => `
          <div class="mf-grille">
            <label class="mail-champ"><span>Nom et prénom *</span>
              <input id="u-nom" value="${esc(v.nom)}" placeholder="Patrick Martin"></label>
            <label class="mail-champ"><span>Adresse e-mail *</span>
              <input id="u-mail" type="email" value="${esc(v.email)}" placeholder="patrick@exemple.fr"></label>
          </div>

          <div class="mf-bloc-titre">Rôle</div>
          <div class="mf-seg mf-seg-large">
            ${Object.entries(ROLES).map(([k, r]) =>
              `<button type="button" data-role="${k}" class="${k === v.role ? 'on' : ''}">${esc(r.label)}</button>`).join('')}
          </div>
          <p class="mf-aide">${esc(ROLES[v.role]?.description || '')}</p>

          <div class="mf-bloc-titre">Structures</div>
          <div class="fa-chips" data-structures>
            ${ACTIVITY_KEYS.map(k => `<button type="button" class="fa-chip ${v.structures.includes(k) ? 'on' : ''}"
              data-val="${k}">${esc(ACTIVITIES[k].label)}</button>`).join('')}
          </div>
          <p class="mf-aide ${v.role !== 'direction' && !v.structures.length ? 'attention' : ''}">${
            v.role === 'direction'
              ? 'La direction voit les quatre structures, quel que soit ce qui est coché ici.'
              : v.structures.length
                ? 'Cette personne ne verra que ses propres affaires, et seulement dans ces structures.'
                : 'Sans structure, la personne ne verrait aucune donnée : choisissez-en au moins une.'}</p>

          <div id="u-retour"></div>
          <div class="form-actions">
            <button type="button" class="btn ghost" data-close>Annuler</button>
            <button type="button" class="btn" id="u-creer">${db.demo ? 'Créer (démo)' : 'Créer le compte'}</button>
          </div>`;

        const m = openModal(db.demo ? 'Nouvel utilisateur (démo)' : 'Nouveau compte', '<div id="u-corps"></div>', { wide: true });
        const zone = m.querySelector('#u-corps');

        const dessine = () => {
          zone.innerHTML = corps();
          zone.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { v.role = b.dataset.role; dessine(); });
          zone.querySelectorAll('[data-structures] .fa-chip').forEach(b => b.onclick = () => {
            const k = b.dataset.val;
            v.structures = v.structures.includes(k) ? v.structures.filter(x => x !== k) : [...v.structures, k];
            dessine();
          });
          const nom = zone.querySelector('#u-nom'); nom.oninput = () => { v.nom = nom.value; };
          const mail = zone.querySelector('#u-mail'); mail.oninput = () => { v.email = mail.value; };
          zone.querySelector('#u-creer').onclick = creer;
        };

        async function creer() {
          if (!v.nom.trim()) return toast('Le nom est nécessaire', 'warn');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return toast('Adresse e-mail invalide', 'warn');
          if (v.role !== 'direction' && !v.structures.length) {
            return toast('Choisissez au moins une structure', 'warn');
          }
          const bouton = zone.querySelector('#u-creer');
          bouton.disabled = true;
          try {
            if (db.demo) {
              await db.insert('profiles', {
                full_name: v.nom.trim(), email: v.email.trim().toLowerCase(),
                role: v.role, activities: v.structures, active: true,
              });
              closeModal(true); toast('Utilisateur de démonstration créé'); draw();
              return;
            }
            const rep = await creerCompte({
              email: v.email.trim(), full_name: v.nom.trim(),
              role: v.role, activities: v.structures,
            });
            // Le lien vaut mot de passe tant qu'il n'a pas servi : on l'affiche une
            // fois, à la personne qui vient de créer le compte, et on ne l'écrit
            // nulle part. Il se regénère depuis Supabase s'il se perd.
            zone.querySelector('#u-retour').innerHTML = `
              <div class="card" style="margin-top:14px">
                <p class="mf-aide ok" style="margin-bottom:8px">Compte créé pour ${esc(v.nom)}.</p>
                ${rep.lien
                  ? `<label class="mail-champ"><span>Lien d'invitation — à transmettre à la personne</span>
                      <input id="u-lien" value="${esc(rep.lien)}" readonly></label>
                     <p class="mf-aide">Elle choisira son mot de passe elle-même. Ce lien ne s'affichera plus : copiez-le maintenant.</p>
                     <button type="button" class="btn ghost sm" id="u-copier">Copier le lien</button>`
                  : '<p class="mf-aide attention">Le compte existe, mais le lien d\'invitation n\'a pas pu être produit. Il se regénère depuis Supabase (Authentication → Users).</p>'}
              </div>`;
            zone.querySelector('#u-copier')?.addEventListener('click', async () => {
              try { await navigator.clipboard.writeText(rep.lien); toast('Lien copié'); }
              catch { zone.querySelector('#u-lien')?.select(); toast('Copiez le lien sélectionné', 'warn'); }
            });
            bouton.textContent = 'Compte créé';
            draw();
          } catch (err) {
            bouton.disabled = false;
            toast(err.message, 'err');
          }
        }

        dessine();
      });
    };
    draw();
    return { refresh: draw };
  },
};
