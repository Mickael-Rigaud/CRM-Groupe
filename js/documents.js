// Documents : pièces jointes rattachées à une fiche (bien, prêt, contact, entreprise, affaire…).
// Table `documents` + fichiers dans le stockage Supabase (bucket « documents ») ; en mode démo, fichiers gardés dans le navigateur.
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { esc, fmtDate, toast, confirm, userName } from './ui.js';

export const DOC_CATEGORIES = ['Offre de prêt', "Tableau d'amortissement", 'Acte / compromis', 'Bail', 'État des lieux', 'Diagnostic', 'Devis', 'Facture', 'Assurance', 'Taxe / impôts', 'Relevé bancaire', 'Pièce d\'identité', 'Justificatif', 'Rapport', 'Photo', 'Autre'];
const MAX_MB = 25;
const ENTITY_LABEL = { properties: 'bien', loans: 'prêt', leases: 'bail', contacts: 'contact', organisations: 'entreprise', deals: 'affaire', broker_profiles: 'courtier' };

const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
const icon = (mime = '', name = '') => /pdf/.test(mime) || /\.pdf$/i.test(name) ? '📄' : /^image\//.test(mime) ? '🖼' : /sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name) ? '📊' : /word|document/.test(mime) || /\.docx?$/i.test(name) ? '📝' : '📎';

export function docsOf(entityType, entityId) {
  return db.t('documents').filter(d => d.entity_type === entityType && d.entity_id === entityId).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// Bloc HTML à insérer dans une fiche. À compléter par bindDocuments() une fois la modale ouverte.
export function documentsSection(entityType, entityId, { title = 'Documents' } = {}) {
  const docs = docsOf(entityType, entityId);
  return `<div class="section docs" data-docs="${entityType}:${entityId}">
    <h3 style="display:flex;justify-content:space-between;align-items:center">${esc(title)} (${docs.length})
      <span><select class="doc-cat" title="Catégorie du prochain envoi"><option value="">Catégorie…</option>${DOC_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select> <label class="btn sm">+ Ajouter <input type="file" multiple hidden class="doc-input"></label></span></h3>
    <div class="doc-list">${docs.length ? docs.map(d => `<div class="doc-row" data-doc="${d.id}">
        <span class="doc-ico">${icon(d.mime, d.name)}</span>
        <div class="grow"><a href="#" class="doc-open"><b>${esc(d.name)}</b></a><div class="small muted">${d.category ? esc(d.category) + ' · ' : ''}${fmtSize(d.size || 0)} · ${fmtDate(d.created_at)} · ${esc(userName(d.created_by))}</div></div>
        <button class="icon-btn doc-del" title="Supprimer">🗑</button>
      </div>`).join('') : `<div class="empty">Aucun document — offre de prêt, acte, bail, factures… (${MAX_MB} Mo max par fichier)</div>`}</div>
  </div>`;
}

export function bindDocuments(root, entityType, entityId, refresh) {
  const sec = root.querySelector(`[data-docs="${entityType}:${entityId}"]`); if (!sec) return;
  const input = sec.querySelector('.doc-input');
  input.onchange = async () => {
    const files = [...input.files]; if (!files.length) return;
    const category = sec.querySelector('.doc-cat').value || null;
    let ok = 0;
    for (const f of files) {
      if (f.size > MAX_MB * 1048576) { toast(`${f.name} : fichier trop lourd (${MAX_MB} Mo max)`, 'warn'); continue; }
      try {
        const path = `${entityType}/${entityId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
        await db.uploadFile(path, f);
        await db.insert('documents', { entity_type: entityType, entity_id: entityId, name: f.name, mime: f.type || null, size: f.size, storage_path: path, category, created_by: scope.user?.id || null });
        ok++;
      } catch (err) { toast(`${f.name} : ${err.message}`, 'err'); }
    }
    if (ok) { toast(`${ok} document${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''}`); refresh?.(); }
  };
  sec.querySelectorAll('.doc-row').forEach(row => {
    const d = db.byId('documents', row.dataset.doc); if (!d) return;
    row.querySelector('.doc-open').onclick = async e => {
      e.preventDefault();
      try { const url = await db.fileUrl(d.storage_path); window.open(url, '_blank', 'noopener'); }
      catch (err) { toast(err.message, 'err'); }
    };
    row.querySelector('.doc-del').onclick = async () => {
      if (!await confirm(`Supprimer « ${d.name} » ?`)) return;
      try { await db.deleteFile(d.storage_path); } catch { /* fichier déjà absent */ }
      await db.remove('documents', d.id); toast('Document supprimé'); refresh?.();
    };
  });
}

export function entityLabel(t) { return ENTITY_LABEL[t] || t; }
