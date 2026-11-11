// Le cahier des charges d'un chantier, ouvert depuis sa fiche dans le
// Planning chantier (11/11/2026, Élodie). Voir `data/rgd-cahier.js` pour les
// règles : postes SANS PRIX, collés depuis le devis, figés une fois signés.
//
// Direction : on choisit le devis signé, on colle ses lignes (ou on reprend
// celles d'un devis du CRM), on retouche les postes, on ajoute les consignes
// pour l'équipe et les précisions pour le client, puis on imprime l'une ou
// l'autre version et on fait signer le client au doigt.
// Membre de l'équipe avec qui le chantier est partagé : lecture, et la
// version « équipe » à imprimer.
import { scope } from '../data/scope.js';
import { esc, toast, openModal, confirm } from '../ui.js';
import { posePadSignature } from '../pad-signature.js';
import { COSTRUCTOR_APP } from '../data/rgd-cgv.js';
import { cahierDe, estSigne, creerCahier, majCahier, signerCahier, retirerSignature,
         devisSignesDu, postesDuDevisCrm, decouperCollage, lireDevisCostructor } from '../data/rgd-cahier.js';
import { imprimerCahierClient, imprimerCahierOuvriers } from './rgd-cahier-doc.js';

const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');
const eurHt = (n) => (n == null ? '' : `${Number(n).toLocaleString('fr-FR')} € HT`);

/**
 * @param chantier  la ligne `rgd_planning`
 * @param dossier   `{ nom, ligne, genre }` du dossier rattaché, ou null
 * @param retour    rouvre la fiche du chantier
 */
export function ouvrirCahier(chantier, dossier, retour) {
  const direction = scope.isDirection;
  let k = cahierDe(chantier.id);
  const devis = devisSignesDu(dossier?.ligne, dossier?.genre);
  // Le brouillon de l'écran : rien n'est écrit avant « Enregistrer ».
  const s = {
    devis: k ? (k.devis_crm_id ? `crm:${k.devis_crm_id}` : k.devis_id ? `costructor:${k.devis_id}` : '')
      : (devis[0] ? `${devis[0].source}:${devis[0].id}` : ''),
    objet: k?.objet || chantier.titre || '',
    postes: (k?.postes || []).map(p => ({ ...p })),
    consignes: k?.consignes || '',
    precisions: k?.precisions || '',
    collage: false,
    modifie: false,
    lecture: false,      // lecture du devis Costructor en cours
    erreur: '',          // ce que la lecture a répondu, si elle a échoué
  };
  // ⚠ `confirm` OUVRE SA PROPRE FENÊTRE ET REMPLACE CELLE-CI : après chaque
  // question on la remonte (`demander`), le brouillon `s` survit dans la
  // fermeture. Sans ça, répondre « Confirmer » laissait l'écran vide.
  let hote;
  const monter = () => {
    const m = openModal(`Cahier des charges — ${chantier.titre}`, '<div class="ca"></div>', { wide: true });
    hote = m.querySelector('.ca');
    hote.addEventListener('input', () => { s.modifie = true; });
  };
  const demander = async (question) => { const ok = await confirm(question); monter(); return ok; };
  monter();
  const devisChoisi = () => devis.find(v => `${v.source}:${v.id}` === s.devis) || null;

  const lecture = () => {
    const postes = k?.postes || [];
    hote.innerHTML = `
      ${k ? `<div class="ca-postes-lecture">${postes.length ? postes.map(p => `<div class="ca-pl">
          ${p.lot ? `<span class="ca-pl-lot">${esc(p.lot)}</span>` : ''}<b>${esc(p.designation)}</b>
          ${p.detail ? `<small>${esc(p.detail)}</small>` : ''}<em>${esc([p.quantite, p.unite].filter(Boolean).join(' '))}</em></div>`).join('')
        : '<p class="muted">Aucun poste.</p>'}</div>
        ${k.consignes ? `<h4 class="ca-h">Consignes</h4><p class="ca-texte">${esc(k.consignes)}</p>` : ''}`
      : '<div class="empty">La direction n’a pas encore préparé le cahier des charges de ce chantier.</div>'}
      <div class="form-actions">
        <button type="button" class="btn ghost" id="ca-retour">← Retour au chantier</button>
        <span class="grow"></span>
        ${k ? '<button type="button" class="btn primary" id="ca-ouvriers">Imprimer (équipe)</button>' : ''}
      </div>`;
    hote.querySelector('#ca-retour').onclick = () => retour?.();
    const b = hote.querySelector('#ca-ouvriers');
    if (b) b.onclick = () => imprimerCahierOuvriers(chantier, k, dossier);
  };

  const ligneP = (p, i, fige) => `
    <div class="ca-poste" data-i="${i}">
      <input data-c="lot" value="${esc(p.lot)}" placeholder="Lot" aria-label="Lot"${fige ? ' disabled' : ''}>
      <div class="ca-poste-texte">
        <input data-c="designation" value="${esc(p.designation)}" placeholder="Travaux" aria-label="Désignation"${fige ? ' disabled' : ''}>
        <input data-c="detail" value="${esc(p.detail)}" placeholder="Précision (facultatif)" aria-label="Détail" class="ca-detail"${fige ? ' disabled' : ''}>
      </div>
      <input data-c="quantite" value="${esc(p.quantite)}" placeholder="Qté" aria-label="Quantité" class="ca-qte"${fige ? ' disabled' : ''}>
      <input data-c="unite" value="${esc(p.unite)}" placeholder="Unité" aria-label="Unité" class="ca-unite"${fige ? ' disabled' : ''}>
      ${fige ? '<span></span>' : '<button type="button" class="icon-btn" data-retirer title="Retirer ce poste">✕</button>'}
    </div>`;

  const dessiner = () => {
    if (!direction) { lecture(); return; }
    const fige = estSigne(k);
    const choisi = devisChoisi();
    hote.innerHTML = `
      <div class="ca-source">
        <label class="pl-champ"><span>Devis signé</span>
          <select id="ca-devis"${fige ? ' disabled' : ''}>
            <option value="">— Aucun —</option>
            ${devis.map(v => `<option value="${v.source}:${esc(v.id)}"${s.devis === `${v.source}:${v.id}` ? ' selected' : ''}>${
              esc(`${v.numero || 'Sans numéro'} · ${date(v.date)} · ${eurHt(v.montant)}${v.source === 'crm' ? ' · CRM' : ''}`)}</option>`).join('')}
          </select></label>
        <label class="pl-champ ca-objet"><span>Objet des travaux</span>
          <input id="ca-objet" value="${esc(s.objet)}"${fige ? ' disabled' : ''}></label>
      </div>
      ${!dossier ? '<p class="muted small">Rattachez un dossier client au chantier pour retrouver ses devis signés.</p>'
        : !devis.length ? '<p class="muted small">Aucun devis signé pour ce dossier.</p>' : ''}
      ${fige ? '' : `<div class="ca-aide">
        ${choisi?.source === 'crm'
          ? `<span>Ce devis a été fait dans le CRM : ses lignes se reprennent directement.</span>
             <button type="button" class="btn sm" id="ca-reprendre">Reprendre ses ${choisi.lignes.length} lignes</button>`
          : choisi?.source === 'costructor'
            ? (s.lecture ? '<span class="ca-lecture">Lecture du devis dans Costructor…</span>'
              : s.erreur ? `<span><b>Lecture impossible :</b> ${esc(s.erreur)}</span>
                 <button type="button" class="btn sm" id="ca-relire">Réessayer</button>
                 <button type="button" class="btn ghost sm" id="ca-coller">${s.collage ? 'Fermer' : 'Coller à la main'}</button>`
              : `<span>Les postes sont lus automatiquement dans le devis Costructor, sans les prix.</span>
                 <button type="button" class="btn ghost sm" id="ca-relire">Relire le devis</button>
                 <button type="button" class="btn ghost sm" id="ca-coller">${s.collage ? 'Fermer' : 'Coller à la main'}</button>`)
            : `<span>Sans devis signé : collez des lignes, ou ajoutez les postes un à un.</span>
               <a class="btn ghost sm" href="${COSTRUCTOR_APP}" target="_blank" rel="noopener">Ouvrir Costructor</a>
               <button type="button" class="btn sm" id="ca-coller">${s.collage ? 'Fermer' : 'Coller des lignes'}</button>`}
      </div>
      ${s.collage ? `<div class="ca-collage">
        <textarea id="ca-collage" rows="7" placeholder="Collez ici les lignes du devis (Ctrl + V)"></textarea>
        <div class="ca-collage-actions"><span class="muted small">Les montants et la TVA sont retirés. Vous pourrez tout retoucher ensuite.</span>
          <span class="grow"></span><button type="button" class="btn primary sm" id="ca-decouper">Transformer en postes</button></div>
      </div>` : ''}`}
      <div class="ca-titre"><h4 class="ca-h">Postes de travaux <span>${s.postes.length}</span></h4>
        <span class="muted small">Aucun prix : ce document va aux ouvriers et au client.</span></div>
      <div class="ca-postes">
        ${s.postes.length ? `<div class="ca-poste ca-poste-tete"><span>Lot</span><span>Travaux</span><span>Qté</span><span>Unité</span><span></span></div>
          ${s.postes.map((p, i) => ligneP(p, i, fige)).join('')}`
          : `<p class="muted small">${s.lecture ? 'Les postes arrivent…' : 'Aucun poste pour l’instant.'}</p>`}
        ${fige ? '' : '<button type="button" class="btn ghost sm" id="ca-ajouter">+ Ajouter un poste</button>'}
      </div>
      <div class="ca-textes">
        <label class="pl-champ"><span>Consignes pour l’équipe <em>(version équipe seulement)</em></span>
          <textarea id="ca-consignes" rows="3" placeholder="Accès, horaires, protections, points de vigilance…"${fige ? ' disabled' : ''}>${esc(s.consignes)}</textarea></label>
        <label class="pl-champ"><span>Précisions pour le client <em>(les deux versions)</em></span>
          <textarea id="ca-precisions" rows="3" placeholder="Ce qui reste à la charge du client, pièces à vider, accès à l’eau et l’électricité…"${fige ? ' disabled' : ''}>${esc(s.precisions)}</textarea></label>
      </div>
      ${fige ? `<div class="ca-signe">
        <img src="${k.signature}" alt="Signature du client">
        <div><b>Signé${k.signe_par ? ` par ${esc(k.signe_par)}` : ''}</b><span>le ${esc(new Date(k.signe_le).toLocaleString('fr-FR'))}</span>
          <small class="muted">Le cahier est figé. Pour le modifier, retirez d’abord la signature : il faudra le faire signer à nouveau.</small></div>
        <button type="button" class="btn ghost sm" id="ca-retirer">Retirer la signature</button>
      </div>` : ''}
      <div id="ca-pad"></div>
      <div class="form-actions ca-actions">
        <button type="button" class="btn ghost" id="ca-retour">← Retour au chantier</button>
        <span class="grow"></span>
        <button type="button" class="btn ghost" id="ca-ouvriers">Imprimer (équipe)</button>
        <button type="button" class="btn ghost" id="ca-client">Imprimer (client)</button>
        ${fige ? '' : `<button type="button" class="btn ghost" id="ca-signer">Faire signer le client</button>
        <button type="button" class="btn primary" id="ca-enregistrer">Enregistrer</button>`}
      </div>`;
    brancher(fige);
  };

  // Ce qui est à l'écran passe dans le brouillon avant tout redessin.
  const lire = () => {
    if (!direction || estSigne(k)) return;
    const v = (id) => hote.querySelector(id)?.value ?? '';
    s.devis = v('#ca-devis'); s.objet = v('#ca-objet');
    s.consignes = v('#ca-consignes'); s.precisions = v('#ca-precisions');
    hote.querySelectorAll('.ca-poste[data-i]').forEach(r => {
      const p = s.postes[Number(r.dataset.i)];
      r.querySelectorAll('[data-c]').forEach(inp => { p[inp.dataset.c] = inp.value; });
    });
  };

  const enregistrer = async () => {
    lire();
    const choisi = devisChoisi();
    const champs = {
      devis_id: choisi?.source === 'costructor' ? choisi.id : null,
      devis_crm_id: choisi?.source === 'crm' ? choisi.id : null,
      devis_numero: choisi?.numero || null,
      objet: s.objet, postes: s.postes, consignes: s.consignes, precisions: s.precisions,
    };
    k = k ? await majCahier(k, champs) : await creerCahier(chantier.id, champs);
    k = cahierDe(chantier.id) || k;
    s.postes = (k.postes || []).map(p => ({ ...p }));
    s.modifie = false;
    return k;
  };

  function brancher(fige) {
    hote.querySelector('#ca-retour').onclick = async () => {
      lire();
      if (s.modifie && !fige && !await demander('Quitter sans enregistrer le cahier des charges ?')) { dessiner(); return; }
      retour?.();
    };
    const imprimer = async (quoi) => {
      try {
        if (!fige) await enregistrer();
        if (!k) return;
        (quoi === 'client' ? imprimerCahierClient : imprimerCahierOuvriers)(chantier, k, dossier);
        dessiner();
      } catch (e) { toast(e.message, 'error'); }
    };
    hote.querySelector('#ca-ouvriers').onclick = () => imprimer('ouvriers');
    hote.querySelector('#ca-client').onclick = () => imprimer('client');
    if (fige) {
      hote.querySelector('#ca-retirer').onclick = async () => {
        if (!await demander('Retirer la signature du client ? Le cahier redevient modifiable, et il faudra le faire signer à nouveau.')) { dessiner(); return; }
        try { k = await retirerSignature(k); k = cahierDe(chantier.id) || k; toast('Signature retirée'); }
        catch (e) { toast(e.message, 'error'); }
        dessiner();
      };
      return;
    }
    hote.querySelector('#ca-devis').onchange = () => {
      lire(); s.erreur = '';
      // Un autre devis, et rien encore dans le cahier : on le lit tout de suite.
      if (!s.postes.length) remplirDepuisDevis(); else dessiner();
    };
    const bRelire = hote.querySelector('#ca-relire');
    if (bRelire) bRelire.onclick = async () => {
      lire();
      if (s.postes.length && !await demander(`Relire le devis remplace les ${s.postes.length} postes actuels. Continuer ?`)) { dessiner(); return; }
      remplirDepuisDevis();
    };
    const bColler = hote.querySelector('#ca-coller');
    if (bColler) bColler.onclick = () => { lire(); s.collage = !s.collage; dessiner(); hote.querySelector('#ca-collage')?.focus(); };
    const bDecouper = hote.querySelector('#ca-decouper');
    if (bDecouper) bDecouper.onclick = async () => {
      const texte = hote.querySelector('#ca-collage').value;
      lire();
      const nouveaux = decouperCollage(texte);
      if (!nouveaux.length) { toast('Aucun poste reconnu dans ce texte.', 'error'); return; }
      if (s.postes.length && !await demander(`Remplacer les ${s.postes.length} postes actuels par les ${nouveaux.length} postes collés ?`)) { dessiner(); return; }
      s.postes = nouveaux; s.collage = false; s.modifie = true;
      toast(`${nouveaux.length} poste${nouveaux.length > 1 ? 's' : ''} créé${nouveaux.length > 1 ? 's' : ''} — relisez-les puis enregistrez`);
      dessiner();
    };
    const bReprendre = hote.querySelector('#ca-reprendre');
    if (bReprendre) bReprendre.onclick = async () => {
      lire();
      const nouveaux = postesDuDevisCrm(devisChoisi()?.lignes);
      if (s.postes.length && !await demander(`Remplacer les ${s.postes.length} postes actuels par les lignes du devis ?`)) { dessiner(); return; }
      s.postes = nouveaux; s.modifie = true; dessiner();
    };
    hote.querySelector('#ca-ajouter').onclick = () => {
      lire();
      const dernier = s.postes[s.postes.length - 1];
      s.postes.push({ lot: dernier?.lot || '', designation: '', detail: '', quantite: '', unite: '' });
      s.modifie = true; dessiner();
      hote.querySelector('.ca-poste[data-i]:last-of-type [data-c="designation"]')?.focus();
    };
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      lire();
      s.postes.splice(Number(b.closest('[data-i]').dataset.i), 1);
      s.modifie = true; dessiner();
    });
    hote.querySelector('#ca-enregistrer').onclick = async () => {
      try { await enregistrer(); toast('Cahier des charges enregistré'); dessiner(); }
      catch (e) { toast(e.message, 'error'); }
    };
    // ⚠ ON ENREGISTRE AVANT DE TENDRE LE TÉLÉPHONE : le client signe ce qui
    // est écrit, pas une version d'il y a dix minutes (même règle que le bon
    // d'attachement).
    hote.querySelector('#ca-signer').onclick = async () => {
      try { await enregistrer(); } catch (e) { toast(e.message, 'error'); return; }
      if (!k.postes?.length) { toast('Ajoutez au moins un poste avant de faire signer.', 'error'); dessiner(); return; }
      const pad = hote.querySelector('#ca-pad');
      hote.querySelectorAll('.ca-actions button').forEach(b => { b.disabled = true; });
      posePadSignature(pad, {
        aide: `Signature de <b>${esc(dossier?.nom || 'du client')}</b> sur le <b>cahier des charges</b>. `
          + 'Signer vaut accord sur les travaux décrits, avant leur démarrage. Le devis reste seul à faire foi pour les prix.',
        nom: dossier?.nom || '',
        surAnnuler: () => dessiner(),
        surValider: async ({ image, nom }) => {
          k = await signerCahier(k, { image, nom });
          k = cahierDe(chantier.id) || k;
          toast('Cahier des charges signé');
          dessiner();
        },
      });
      pad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  }

  // ⚠ LE CAHIER SE REMPLIT TOUT SEUL (11/11/2026, Élodie : « que le devis
  // soit automatiquement lu […] le minimum d'actions de notre part »). À
  // l'ouverture d'un cahier vide, le devis signé est lu et les postes ENREGISTRÉS
  // aussitôt : il ne reste qu'à relire, imprimer et faire signer. Un cahier
  // qui a déjà des postes n'est jamais réécrit sans qu'on le demande.
  async function remplirDepuisDevis() {
    const choisi = devisChoisi();
    if (!choisi || estSigne(k)) { dessiner(); return; }
    let postes = null;
    if (choisi.source === 'crm') postes = postesDuDevisCrm(choisi.lignes);
    else {
      s.lecture = true; s.erreur = ''; dessiner();
      const rep = await lireDevisCostructor(choisi.id);
      s.lecture = false;
      if (!rep.ok) { s.erreur = rep.motif; dessiner(); return; }
      postes = rep.postes;
    }
    if (!postes.length) { s.erreur = 'le devis ne contient aucune ligne de travaux.'; dessiner(); return; }
    s.postes = postes;
    // L'écran d'abord : `enregistrer` relit les champs affichés, et ceux de
    // l'ancien cahier écraseraient les postes qu'on vient de lire.
    dessiner();
    try {
      await enregistrer();
      toast(`${postes.length} poste${postes.length > 1 ? 's' : ''} repris du devis ${choisi.numero || ''} — relisez, puis imprimez`.trim());
    } catch (e) { toast(e.message, 'error'); s.modifie = true; }
    dessiner();
  }

  if (direction && !estSigne(k) && !s.postes.length && devisChoisi()) remplirDepuisDevis();
  else dessiner();
}
