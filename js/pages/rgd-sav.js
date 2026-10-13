// L'écran d'un dossier SAV et le tableau de l'onglet « SAV » (13/10/2026).
//
// ⚠ UNE SEULE FENÊTRE POUR OUVRIR ET POUR SUIVRE : créer un dossier et le
// faire avancer posent les mêmes questions, deux formulaires auraient fini par
// ne plus les poser pareil. Le fil du suivi n'apparaît qu'une fois le dossier
// créé — il n'a rien à raconter avant.
//
// ⚠ AUCUN `confirm()` DE `ui.js` : il remplacerait cette fenêtre, saisie
// comprise. La suppression se fait en deux clics sur le même bouton.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, fmtDateTime, openModal, closeModal, toast, armerCroix, userName } from '../ui.js';
import {
  STATUTS_SAV, statutSav, PRISE_EN_CHARGE, garantie, finDuChantier,
  ouvrirSav, majSav, supprimerSav, deposerPiecesSav, piecesSav, dossiersDe,
} from '../data/rgd-sav.js';

const jourLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Les vrais chantiers de la personne — une visite technique n'en est pas un —,
// le plus récemment terminé d'abord : c'est presque toujours celui du SAV.
export function chantiersDe(f) {
  return scope.rgd('rgd_chantiers')
    .filter(c => c.statut_d1 !== 'visite_technique'
      && ((f.contact_id && c.contact_id === f.contact_id)
        || (f.organisation_id && c.organisation_id === f.organisation_id)))
    .sort((a, b) => finDuChantier(b).localeCompare(finDuChantier(a)));
}

const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
const pastille = (g) => `<span class="chip ${g.ton}" title="${esc(g.detail || '')}">${esc(g.label)}</span>`;

/**
 * Ouvrir la fenêtre d'un dossier.
 * @param {object} fiche  la ligne `rgd_clients`
 * @param {object|null} sav  le dossier, ou null pour en ouvrir un
 * @param {function} [retour] ce qu'on rouvre en fermant (la fiche, le plus souvent)
 */
export function fenetreSav(fiche, sav, retour) {
  const creation = !sav;
  const v = sav ? { ...sav } : { ouvert_le: jourLocal(), urgence: 'normale', statut: 'ouvert' };
  const chantiers = chantiersDe(fiche);
  if (creation && !v.chantier_id && chantiers[0]) v.chantier_id = chantiers[0].id;
  const sts = scope.rgd('rgd_sous_traitants').filter(s => s.actif !== false)
    .sort((a, b) => String(a.raison_sociale || '').localeCompare(String(b.raison_sociale || ''), 'fr'));
  const enAttente = [];
  const nom = fiche.__nom || '';

  const garantieDe = () => {
    const c = chantiers.find(x => x.id === v.chantier_id);
    return garantie(finDuChantier(c), v.ouvert_le || jourLocal());
  };

  const corps = () => `
    <form class="sav" id="sav-form">
      <div class="sav-tete">
        <div><b>${esc(nom || 'Dossier SAV')}</b>
          ${sav ? `<span class="chip ${statutSav(v.statut).ton}">${esc(statutSav(v.statut).label)}</span>` : ''}</div>
        <div class="sav-garantie" id="sav-garantie">${pastille(garantieDe())}
          <span class="small muted">${esc(garantieDe().detail || '')}</span></div>
      </div>

      <section class="sav-bloc"><h4>Le problème</h4>
        <label class="sav-champ sav-large"><span>Objet *</span>
          <textarea name="objet" rows="2" required placeholder="Ce qui ne va pas, tel que le client le décrit">${esc(v.objet || '')}</textarea></label>
        <div class="sav-grille">
          <label class="sav-champ"><span>Ouvert le</span><input type="date" name="ouvert_le" value="${esc(v.ouvert_le || '')}"></label>
          <label class="sav-champ"><span>Urgence</span><select name="urgence">
            ${opt('normale', 'Normale', v.urgence)}${opt('urgente', 'Urgente', v.urgence)}</select></label>
          <label class="sav-champ"><span>Chantier concerné</span><select name="chantier_id">
            ${opt('', chantiers.length ? '— Aucun —' : 'Aucun chantier connu', v.chantier_id)}
            ${chantiers.map(c => opt(c.id, `${c.reference || c.description || 'Chantier'}${finDuChantier(c) ? ' · fin ' + fmtDate(finDuChantier(c)) : ''}`, v.chantier_id)).join('')}
          </select></label>
          ${sav ? `<label class="sav-champ"><span>Statut</span><select name="statut">
            ${STATUTS_SAV.map(s => opt(s.key, s.label, v.statut)).join('')}</select></label>` : ''}
        </div>
      </section>

      <section class="sav-bloc"><h4>L’intervention</h4>
        <div class="sav-grille">
          <label class="sav-champ"><span>Qui intervient</span><select name="intervenant">
            ${opt('', '— À décider —', v.intervenant)}${opt('rgd', 'RGD Renova', v.intervenant)}${opt('sous_traitant', 'Un sous-traitant', v.intervenant)}</select></label>
          <label class="sav-champ" ${v.intervenant === 'sous_traitant' ? '' : 'hidden'} id="sav-st"><span>Sous-traitant</span><select name="sous_traitant_id">
            ${opt('', '— Choisir —', v.sous_traitant_id)}
            ${sts.map(s => opt(s.id, s.raison_sociale || s.contact_nom || 'Sans nom', v.sous_traitant_id)).join('')}</select></label>
          <label class="sav-champ"><span>Date d’intervention</span><input type="date" name="intervention_le" value="${esc(v.intervention_le || '')}"></label>
          <label class="sav-champ"><span>Heure</span><input type="time" name="intervention_heure" value="${esc(v.intervention_heure || '')}"></label>
          <label class="sav-champ"><span>À la charge de</span><select name="prise_en_charge">
            ${opt('', '— À décider —', v.prise_en_charge)}
            ${Object.entries(PRISE_EN_CHARGE).map(([k, l]) => opt(k, l, v.prise_en_charge)).join('')}</select></label>
          <label class="sav-champ"><span>Coût (€)</span><input type="number" step="0.01" min="0" name="cout" value="${esc(v.cout ?? '')}"></label>
        </div>
      </section>

      <section class="sav-bloc"><h4>Photos et documents</h4>
        <ul class="sav-pieces">${sav ? piecesSav(sav.id).map(d => `<li><button type="button" class="lien" data-piece="${esc(d.storage_path)}">${esc(d.name)}</button></li>`).join('') : ''}</ul>
        <label class="sav-depot"><input type="file" id="sav-fichiers" multiple accept="image/*,application/pdf">
          <span>⬆ Ajouter des photos ou des documents</span></label>
        <p class="small muted" id="sav-attente">${creation ? 'Ils partiront à l’enregistrement du dossier.' : 'Ils partent à l’enregistrement.'}</p>
      </section>

      <section class="sav-bloc"><h4>Suivi</h4>
        <label class="sav-champ sav-large"><span>${creation ? 'Premier commentaire' : 'Ajouter un commentaire'}</span>
          <textarea name="commentaire" rows="2" placeholder="Appel du client, constat sur place, décision…"></textarea></label>
        ${sav ? `<ol class="sav-fil">${[...(sav.suivi || [])].reverse().map(e => `<li>
          <div class="small muted">${esc(fmtDateTime(e.le))}${e.par ? ' · ' + esc(userName(e.par)) : ''}</div>
          <div>${esc(e.texte)}</div></li>`).join('') || '<li class="muted">Rien pour l’instant.</li>'}</ol>` : ''}
      </section>

      <div class="sav-pied">
        ${sav ? '<button type="button" class="btn ghost danger" id="sav-suppr">Supprimer le dossier</button>' : ''}
        <span class="grow"></span>
        <button type="button" class="btn ghost" id="sav-annuler">Annuler</button>
        <button type="submit" class="btn primary" id="sav-ok">${creation ? 'Ouvrir le dossier' : 'Enregistrer'}</button>
      </div>
    </form>`;

  const fermer = () => { closeModal(true); retour?.(); };

  openModal(creation ? 'Nouveau dossier SAV' : 'Dossier SAV', corps(), { wide: true, onClose: () => retour?.(), onOpen: (m) => {
    const form = m.querySelector('#sav-form');
    const lire = () => Object.fromEntries([...form.querySelectorAll('[name]')].map(i => [i.name, i.value.trim()]));
    const rafraichirGarantie = () => {
      const l = lire(); v.chantier_id = l.chantier_id || null; v.ouvert_le = l.ouvert_le;
      const g = garantieDe();
      m.querySelector('#sav-garantie').innerHTML = `${pastille(g)} <span class="small muted">${esc(g.detail || '')}</span>`;
    };
    form.chantier_id.onchange = rafraichirGarantie;
    form.ouvert_le.onchange = rafraichirGarantie;
    form.intervenant.onchange = () => { m.querySelector('#sav-st').hidden = form.intervenant.value !== 'sous_traitant'; };
    m.querySelector('#sav-fichiers').onchange = (e) => {
      for (const f of e.target.files) {
        if (f.size > 25 * 1048576) { toast(`${f.name} : trop lourd (25 Mo max)`, 'warn'); continue; }
        enAttente.push(f);
      }
      m.querySelector('#sav-attente').textContent = enAttente.length
        ? `${enAttente.length} fichier${enAttente.length > 1 ? 's' : ''} en attente : ${enAttente.map(f => f.name).join(', ')}`
        : '';
    };
    m.querySelectorAll('[data-piece]').forEach(b => b.onclick = async () => {
      try { window.open(await db.fileUrl(b.dataset.piece), '_blank', 'noopener'); }
      catch (e) { toast(String(e.message || e), 'err'); }
    });
    m.querySelector('#sav-annuler').onclick = fermer;
    const suppr = m.querySelector('#sav-suppr');
    if (suppr) armerCroix(suppr, async () => {
      const r = await supprimerSav(sav);
      if (!r.ok) return toast(`Non supprimé — ${r.motif}`, 'err');
      toast('Dossier SAV supprimé'); fermer();
    }, { repos: 'Supprimer le dossier', arme: 'Confirmer la suppression', titre: 'Supprimer ce dossier SAV' });

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const l = lire();
      if (!l.objet) return toast('Il manque l’objet du SAV', 'warn');
      const champs = {
        objet: l.objet, ouvert_le: l.ouvert_le || jourLocal(), urgence: l.urgence || 'normale',
        chantier_id: l.chantier_id || null,
        intervenant: l.intervenant || null,
        sous_traitant_id: l.intervenant === 'sous_traitant' ? (l.sous_traitant_id || null) : null,
        intervention_le: l.intervention_le || null, intervention_heure: l.intervention_heure || null,
        prise_en_charge: l.prise_en_charge || null,
        cout: l.cout === '' ? null : Number(l.cout),
      };
      if (sav && l.statut) champs.statut = l.statut;
      const ok = m.querySelector('#sav-ok'); ok.disabled = true; ok.textContent = 'Enregistrement…';
      let r;
      if (creation) {
        r = await ouvrirSav(fiche, champs);
        if (r.ok && l.commentaire) r = await majSav(r.ligne, {}, l.commentaire);
      } else {
        r = await majSav(sav, champs, l.commentaire);
      }
      if (!r.ok) { ok.disabled = false; ok.textContent = creation ? 'Ouvrir le dossier' : 'Enregistrer'; return toast(`Non enregistré — ${r.motif}`, 'err'); }
      // ⚠ UN DÉPÔT QUI ÉCHOUE N'ANNULE PAS LE DOSSIER : il est enregistré, on
      // dit quel fichier n'est pas passé.
      if (enAttente.length) {
        try { await deposerPiecesSav(r.ligne.id, enAttente); }
        catch (e) { toast(`Dossier enregistré, mais un fichier n’est pas passé — ${String(e.message || e).slice(0, 80)}`, 'warn'); }
      }
      toast(creation ? 'Dossier SAV ouvert — la fiche passe en « SAV »'
        : champs.statut === 'resolu' && sav.statut !== 'resolu' ? 'SAV résolu' : 'Dossier enregistré');
      fermer();
    };
  } });
}

export function celluleSav({ x, s }) {
  const chantier = s?.chantier_id ? db.byId('rgd_chantiers', s.chantier_id) : null;
  const g = s ? garantie(finDuChantier(chantier), s.ouvert_le) : null;
  const dernier = s?.suivi?.length ? s.suivi[s.suivi.length - 1] : null;
  const st = s?.intervenant === 'sous_traitant' && s.sous_traitant_id ? db.byId('rgd_sous_traitants', s.sous_traitant_id) : null;
  return {
    client: `<b>${esc(x?.nom || '—')}</b>${x?.tel ? `<div class="s">${esc(x.tel)}</div>` : ''}`,
    dossier: s ? `${esc(s.objet)}<div class="s muted">ouvert le ${esc(fmtDate(s.ouvert_le))}${
      s.urgence === 'urgente' ? ' · <b class="sav-urgent">urgent</b>' : ''}</div>`
      : '<span class="muted">Aucun dossier ouvert</span>',
    chantier: chantier ? `${esc(chantier.reference || chantier.description || '—')}${
      finDuChantier(chantier) ? `<div class="s muted">fin ${esc(fmtDate(finDuChantier(chantier)))}</div>` : ''}` : '<span class="muted">—</span>',
    garantie: g ? pastille(g) : '<span class="muted">—</span>',
    intervention: !s ? '' : `${esc(s.intervenant === 'rgd' ? 'RGD Renova' : st ? (st.raison_sociale || st.contact_nom || 'Sous-traitant') : s.intervenant ? 'Sous-traitant' : '—')}${
      s.intervention_le ? `<div class="s muted">${esc(fmtDate(s.intervention_le))}${s.intervention_heure ? ' · ' + esc(s.intervention_heure) : ''}</div>` : ''}`,
    statut: s ? `<span class="chip ${statutSav(s.statut).ton}">${esc(statutSav(s.statut).label)}</span>${
      s.statut === 'resolu' && s.resolu_le ? `<div class="s muted">le ${esc(fmtDate(s.resolu_le))}</div>` : ''}` : '',
    suivi: dernier ? `<span class="small">${esc(dernier.texte)}</span>` : '',
    cout: s?.cout != null ? esc(eur(s.cout)) : '',
  };
}
