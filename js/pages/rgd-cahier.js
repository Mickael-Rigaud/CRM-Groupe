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
         preparerLien, lienSignature, lienValable, envoyerPourSignature,
         devisSignesDu, postesDuDevisCrm, decouperCollage, lireDevisCostructor,
         ajouterPhotos, retirerPhoto, poserPlan, liensDuCahier, piecesDe, renommerPhotos } from '../data/rgd-cahier.js';
import { imprimerCahierClient, imprimerCahierOuvriers } from './rgd-cahier-doc.js';
import { donneesDocument } from './rgd-documents.js';

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
    // La page de garde (modèle d'Élodie) : repris du dossier tant qu'on ne
    // les a pas retouchés.
    type_bien: k?.type_bien || (dossier ? donneesDocument(dossier).typeBien : '') || '',
    nature: k?.nature || (dossier ? donneesDocument(dossier).travaux : '') || '',
    envoiPhoto: '',      // la pièce dont les photos partent en ce moment
    piecesVides: [],     // les pièces ajoutées à la main, pas encore garnies
    renommes: {},        // ancien nom de pièce → nouveau, pour emmener les photos
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
  // L'e-mail du client, lus comme le font les documents imprimés.
  const coordonnees = async () => {
    if (!dossier) return { nom: '', email: '' };
    const { donneesDocument } = await import('./rgd-documents.js');
    const d = donneesDocument(dossier);
    return { nom: d.nom || dossier.nom || '', email: d.email || '' };
  };

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
        ${k ? `<button type="button" class="btn ghost" id="ca-presenter-lect">▶ Présentation</button>
          <button type="button" class="btn primary" id="ca-ouvriers">PDF équipe</button>` : ''}
      </div>`;
    hote.querySelector('#ca-retour').onclick = () => retour?.();
    const b = hote.querySelector('#ca-ouvriers');
    if (b) b.onclick = () => imprimerCahierOuvriers(chantier, k, dossier);
    const bp = hote.querySelector('#ca-presenter-lect');
    if (bp) bp.onclick = async () => {
      const { ouvrirPresentation } = await import('./rgd-cahier-presentation.js');
      ouvrirPresentation(chantier, k, dossier, { version: 'equipe' });
    };
  };

  const ligneP = (p, i, fige, pieces) => `
    <div class="ca-poste" data-i="${i}">
      <div class="ca-poste-texte">
        <input data-c="designation" value="${esc(p.designation)}" placeholder="Travaux" aria-label="Désignation"${fige ? ' disabled' : ''}>
        <input data-c="detail" value="${esc(p.detail)}" placeholder="Précision (facultatif)" aria-label="Détail" class="ca-detail"${fige ? ' disabled' : ''}>
      </div>
      <input data-c="quantite" value="${esc(p.quantite)}" placeholder="Qté" aria-label="Quantité" class="ca-qte"${fige ? ' disabled' : ''}>
      <input data-c="unite" value="${esc(p.unite)}" placeholder="Unité" aria-label="Unité" class="ca-unite"${fige ? ' disabled' : ''}>
      ${fige || pieces.length < 2 ? '<span></span>' : `<select class="ca-deplacer" data-deplacer aria-label="Déplacer vers une autre pièce" title="Déplacer vers une autre pièce">
        <option value="__">Déplacer…</option>${pieces.filter(x => x !== (p.lot || '')).map(x => `<option value="${esc(x)}">${esc(x || 'Travaux')}</option>`).join('')}</select>`}
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
        <label class="pl-champ"><span>Type de bien <em class="muted">(page de garde)</em></span>
          <input id="ca-type" value="${esc(s.type_bien)}" placeholder="Appartement, maison…"${fige ? ' disabled' : ''}></label>
        <label class="pl-champ"><span>Nature des travaux <em class="muted">(page de garde)</em></span>
          <input id="ca-nature" value="${esc(s.nature)}" placeholder="Rénovation, salle de bain…"${fige ? ' disabled' : ''}></label>
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
      ${blocSalles(fige)}
      <div class="ca-textes">
        <label class="pl-champ"><span>Consignes pour l’équipe <em>(version équipe seulement)</em></span>
          <textarea id="ca-consignes" rows="3" placeholder="Accès, horaires, protections, points de vigilance…"${fige ? ' disabled' : ''}>${esc(s.consignes)}</textarea></label>
        <label class="pl-champ"><span>Précisions pour le client <em>(les deux versions)</em></span>
          <textarea id="ca-precisions" rows="3" placeholder="Ce qui reste à la charge du client, pièces à vider, accès à l’eau et l’électricité…"${fige ? ' disabled' : ''}>${esc(s.precisions)}</textarea></label>
      </div>
      ${fige ? `<div class="ca-signe">
        <img src="${k.signature}" alt="Signature du client">
        <div><b>Signé${k.signe_mode === 'a_distance' ? ' à distance' : k.signe_mode === 'sur_place' ? ' sur place' : ''}${k.signe_par ? ` par ${esc(k.signe_par)}` : ''}</b><span>le ${esc(new Date(k.signe_le).toLocaleString('fr-FR'))}</span>
          <small class="muted">Le cahier est figé. Pour le modifier, retirez d’abord la signature : il faudra le faire signer à nouveau.</small></div>
        <button type="button" class="btn ghost sm" id="ca-retirer">Retirer la signature</button>
      </div>` : k?.envoye_le ? `<div class="ca-envoye">
        <b>Envoyé pour signature</b> le ${esc(new Date(k.envoye_le).toLocaleString('fr-FR'))}${k.envoye_a ? ` à ${esc(k.envoye_a)}` : ''} — en attente de la signature du client.
        ${lienValable(k) ? '<button type="button" class="btn ghost sm" id="ca-copier">Copier le lien</button>' : '<span class="muted small">Le lien a expiré : renvoyez-le.</span>'}
      </div>` : ''}
      <div id="ca-pad"></div>
      <div class="form-actions ca-actions">
        <button type="button" class="btn ghost" id="ca-retour">← Retour au chantier</button>
        <span class="grow"></span>
        <button type="button" class="btn ghost ca-presenter" id="ca-presenter">▶ Présentation</button>
        <button type="button" class="btn ghost" id="ca-ouvriers">PDF équipe</button>
        <button type="button" class="btn ghost" id="ca-client">PDF client</button>
        ${fige ? '' : `<button type="button" class="btn ghost" id="ca-distance">${k?.envoye_le ? 'Renvoyer pour signature' : 'Envoyer pour signature'}</button>
        <button type="button" class="btn ghost" id="ca-signer">Faire signer sur place</button>
        <button type="button" class="btn primary" id="ca-enregistrer">Enregistrer</button>`}
      </div>`;
    brancher(fige);
    if (!fige) brancherPhotos();
    remplirVignettes();
  };

  // ⚠ LES POSTES SONT CLASSÉS PAR PIÈCE (11/11/2026, Élodie : « les postes de
  // travaux je voudrais qu'ils soient classés par pièce aussi »). Un bloc par
  // pièce — son nom (modifiable, il renomme tout), ses travaux, ses photos —
  // comme une page du document. La pièce d'un poste est son `lot`.
  const piecesEcran = () => {
    const l = piecesDe(s.postes);
    for (const v of s.piecesVides) if (!l.includes(v)) l.push(v);
    return l;
  };
  function blocSalles(fige) {
    const pieces = piecesEcran();
    const photos = k?.photos || [];
    const vignette = (chemin, retirable) => `<span class="ca-vignette"><img data-chemin="${esc(chemin)}" alt="">${
      retirable ? `<button type="button" class="ca-vignette-x" data-retirer-photo="${esc(chemin)}" title="Retirer la photo">✕</button>` : ''}</span>`;
    return `<div class="ca-titre"><h4 class="ca-h">Travaux par pièce <span>${pieces.length} pièce${pieces.length > 1 ? 's' : ''} · ${s.postes.length} poste${s.postes.length > 1 ? 's' : ''}</span></h4>
        <span class="muted small">Aucun prix : ce document va aux ouvriers et au client. Une page par pièce, avec ses photos (deux au plus).</span></div>
      <div class="ca-salles">
        ${!pieces.length ? `<p class="muted small">${s.lecture ? 'Les postes arrivent…' : 'Aucune pièce pour l’instant.'}</p>` : pieces.map(lot => {
          const lignes = s.postes.map((p, i) => ({ p, i })).filter(x => (x.p.lot || '') === lot);
          const ph = photos.filter(x => (x.lot || '') === lot);
          return `<section class="ca-salle" data-piece="${esc(lot)}">
            <div class="ca-salle-tete">
              <input class="ca-salle-nom" data-piece-nom value="${esc(lot)}" placeholder="Nom de la pièce" aria-label="Nom de la pièce"${fige ? ' disabled' : ''}>
              <span class="muted small">${lignes.length} poste${lignes.length > 1 ? 's' : ''}</span>
              ${fige || lignes.length ? '' : '<button type="button" class="btn ghost sm" data-retirer-piece>Retirer la pièce</button>'}
            </div>
            <div class="ca-vignettes">${ph.map(x => vignette(x.chemin, !fige)).join('')}${fige ? '' : `<label class="btn ghost sm ca-ajout-photo">${
              s.envoiPhoto === lot ? 'Envoi…' : '+ Photo'}<input type="file" accept="image/*" multiple hidden data-photo-lot="${esc(lot)}"></label>`}</div>
            <div class="ca-postes">${lignes.map(x => ligneP(x.p, x.i, fige, pieces)).join('')}</div>
            ${fige ? '' : '<button type="button" class="btn ghost sm" data-ajouter-poste>+ Ajouter un poste</button>'}
          </section>`;
        }).join('')}
        ${fige ? '' : '<button type="button" class="btn sm ca-ajouter-piece" id="ca-ajouter-piece">+ Ajouter une pièce</button>'}
      </div>
      ${blocPlan(fige)}`;
  }

  // Le plan, et les photos dont la pièce a disparu.
  function blocPlan(fige) {
    const pieces = piecesEcran();
    const photos = k?.photos || [];
    const vignette = (chemin, retirable) => `<span class="ca-vignette"><img data-chemin="${esc(chemin)}" alt="">${
      retirable ? `<button type="button" class="ca-vignette-x" data-retirer-photo="${esc(chemin)}" title="Retirer la photo">✕</button>` : ''}</span>`;
    const orphelines = photos.filter(p => !pieces.includes(p.lot || ''));
    return `<div class="ca-pieces">
        <div class="ca-piece"><b>Plan du logement</b>
          <div class="ca-vignettes">${k?.plan ? vignette(k.plan, false) : ''}${fige ? '' : `<label class="btn ghost sm ca-ajout-photo">${
            s.envoiPhoto === '__plan' ? 'Envoi…' : k?.plan ? 'Remplacer' : '+ Plan'}<input type="file" accept="image/*" hidden data-plan></label>${
            k?.plan ? '<button type="button" class="btn ghost sm" id="ca-plan-retirer">Retirer</button>' : ''}`}</div></div>
        ${orphelines.length ? `<div class="ca-piece"><b class="muted">Photos d’une pièce renommée</b>
          <div class="ca-vignettes">${orphelines.map(p => vignette(p.chemin, !fige)).join('')}</div>
          <small class="muted">Elles ne s’impriment pas : retirez-les et rajoutez-les dans la bonne pièce.</small></div>` : ''}
      </div>`;
  }

  async function remplirVignettes() {
    const imgs = [...hote.querySelectorAll('img[data-chemin]')];
    if (!imgs.length || !k) return;
    const urls = await liensDuCahier(k);
    for (const i of imgs) if (urls[i.dataset.chemin]) i.src = urls[i.dataset.chemin];
  }

  function brancherPhotos() {
    hote.querySelectorAll('input[data-photo-lot]').forEach(inp => inp.onchange = async () => {
      const fichiers = [...inp.files];
      if (!fichiers.length) return;
      const nom = inp.closest('.ca-salle')?.querySelector('[data-piece-nom]')?.value.trim();
      const lot = nom ?? inp.dataset.photoLot;
      try {
        await enregistrer();
        s.envoiPhoto = lot; dessiner();
        k = await ajouterPhotos(k, lot, fichiers); k = cahierDe(chantier.id) || k;
        toast(`${fichiers.length} photo${fichiers.length > 1 ? 's' : ''} ajoutée${fichiers.length > 1 ? 's' : ''}`);
      } catch (e) { toast(e.message, 'error'); }
      s.envoiPhoto = ''; dessiner();
    });
    const plan = hote.querySelector('input[data-plan]');
    if (plan) plan.onchange = async () => {
      const f = plan.files[0];
      if (!f) return;
      try {
        await enregistrer();
        s.envoiPhoto = '__plan'; dessiner();
        k = await poserPlan(k, f); k = cahierDe(chantier.id) || k;
        toast('Plan ajouté');
      } catch (e) { toast(e.message, 'error'); }
      s.envoiPhoto = ''; dessiner();
    };
    const bPlanX = hote.querySelector('#ca-plan-retirer');
    if (bPlanX) bPlanX.onclick = async () => {
      lire();
      try { k = await poserPlan(k, null); k = cahierDe(chantier.id) || k; } catch (e) { toast(e.message, 'error'); }
      dessiner();
    };
    hote.querySelectorAll('[data-retirer-photo]').forEach(b => b.onclick = async () => {
      lire();
      try { k = await retirerPhoto(k, b.dataset.retirerPhoto); k = cahierDe(chantier.id) || k; } catch (e) { toast(e.message, 'error'); }
      dessiner();
    });
  }

  // Ce qui est à l'écran passe dans le brouillon avant tout redessin.
  const lire = () => {
    if (!direction || estSigne(k)) return;
    const v = (id) => hote.querySelector(id)?.value ?? '';
    s.devis = v('#ca-devis'); s.objet = v('#ca-objet');
    s.consignes = v('#ca-consignes'); s.precisions = v('#ca-precisions');
    s.type_bien = v('#ca-type'); s.nature = v('#ca-nature');
    hote.querySelectorAll('.ca-salle').forEach(bloc => {
      const ancien = bloc.dataset.piece;
      const nom = (bloc.querySelector('[data-piece-nom]')?.value || '').trim();
      if (nom !== ancien) {
        s.renommes[ancien] = nom;
        s.piecesVides = s.piecesVides.map(v => (v === ancien ? nom : v));
        bloc.dataset.piece = nom;
      }
      bloc.querySelectorAll('.ca-poste[data-i]').forEach(r => {
        const p = s.postes[Number(r.dataset.i)];
        r.querySelectorAll('[data-c]').forEach(inp => { p[inp.dataset.c] = inp.value; });
        p.lot = nom;
      });
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
      type_bien: s.type_bien, nature: s.nature,
    };
    k = k ? await majCahier(k, champs) : await creerCahier(chantier.id, champs);
    k = cahierDe(chantier.id) || k;
    if (Object.keys(s.renommes).length) {
      await renommerPhotos(k, s.renommes);
      k = cahierDe(chantier.id) || k;
      s.renommes = {};
    }
    s.postes = (k.postes || []).map(p => ({ ...p }));
    s.piecesVides = s.piecesVides.filter(v => !piecesDe(s.postes).includes(v));
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
    // ⚠ LA PRÉSENTATION PIÈCE PAR PIÈCE (11/11/2026, Élodie : « moderne et
    // dynamique sur le CRM, exportable en PDF ») : plein écran, par-dessus
    // cette fenêtre, qu'on retrouve en la fermant.
    hote.querySelector('#ca-presenter').onclick = async () => {
      try {
        if (!fige) await enregistrer();
        if (!k?.postes?.length) { toast('Ajoutez au moins un poste avant de présenter.', 'error'); dessiner(); return; }
        const { ouvrirPresentation } = await import('./rgd-cahier-presentation.js');
        await ouvrirPresentation(chantier, k, dossier, { version: 'client' });
        dessiner();
      } catch (e) { toast(e.message, 'error'); }
    };
    const bCopier = hote.querySelector('#ca-copier');
    if (bCopier) bCopier.onclick = async () => {
      try { await navigator.clipboard.writeText(lienSignature(k)); toast('Lien copié : vous pouvez le transmettre au client'); }
      catch { prompt('Copiez ce lien :', lienSignature(k)); }
    };
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
    hote.querySelectorAll('[data-ajouter-poste]').forEach(b => b.onclick = () => {
      lire();
      const lot = b.closest('.ca-salle').dataset.piece;
      // Le nouveau poste se range à la fin de SA pièce, pas à la fin du cahier.
      let apres = -1;
      s.postes.forEach((p, n) => { if ((p.lot || '') === lot) apres = n; });
      // Une pièce encore vide : le poste va à la fin, la pièce reste en dernier.
      s.postes.splice(apres === -1 ? s.postes.length : apres + 1, 0, { lot, designation: '', detail: '', quantite: '', unite: '' });
      s.modifie = true; dessiner();
      const bloc = [...hote.querySelectorAll('.ca-salle')].find(x => x.dataset.piece === lot);
      [...(bloc?.querySelectorAll('[data-c="designation"]') || [])].pop()?.focus();
    });
    hote.querySelector('#ca-ajouter-piece').onclick = () => {
      lire();
      const deja = piecesEcran();
      let nom = 'Nouvelle pièce', n = 2;
      while (deja.includes(nom)) nom = `Nouvelle pièce ${n++}`;
      s.piecesVides.push(nom); s.modifie = true; dessiner();
      const bloc = [...hote.querySelectorAll('.ca-salle')].find(x => x.dataset.piece === nom);
      const champ = bloc?.querySelector('[data-piece-nom]');
      if (champ) { champ.focus(); champ.select(); bloc.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };
    hote.querySelectorAll('[data-retirer-piece]').forEach(b => b.onclick = () => {
      lire();
      const lot = b.closest('.ca-salle').dataset.piece;
      s.piecesVides = s.piecesVides.filter(v => v !== lot);
      s.modifie = true; dessiner();
    });
    hote.querySelectorAll('[data-deplacer]').forEach(sel => sel.onchange = () => {
      if (sel.value === '__') return;
      lire();
      const p = s.postes[Number(sel.closest('[data-i]').dataset.i)];
      // Le poste part à la fin de sa nouvelle pièce, pour que les pièces
      // restent d'un seul tenant dans le document.
      const cible = sel.value;
      s.postes = s.postes.filter(x => x !== p);
      p.lot = cible;
      let apres = -1;
      s.postes.forEach((x, n) => { if ((x.lot || '') === cible) apres = n; });
      s.postes.splice(apres === -1 ? s.postes.length : apres + 1, 0, p);
      s.modifie = true; dessiner();
    });
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      lire();
      s.postes.splice(Number(b.closest('[data-i]').dataset.i), 1);
      s.modifie = true; dessiner();
    });
    hote.querySelector('#ca-enregistrer').onclick = async () => {
      try { await enregistrer(); toast('Cahier des charges enregistré'); dessiner(); }
      catch (e) { toast(e.message, 'error'); }
    };
    // ⚠ LA SIGNATURE À DISTANCE (11/11/2026) : on enregistre, puis on envoie
    // le lien PAR MAIL (le SMS a été écarté par Élodie le même jour). Le client signe sur la page publique ; le
    // CRM le voit au retour (temps réel) et RGD Renova reçoit un mail.
    hote.querySelector('#ca-distance').onclick = async () => {
      try { await enregistrer(); } catch (e) { toast(e.message, 'error'); return; }
      if (!k.postes?.length) { toast('Ajoutez au moins un poste avant d’envoyer.', 'error'); dessiner(); return; }
      const coord = await coordonnees();
      const zone = hote.querySelector('#ca-pad');
      hote.querySelectorAll('.ca-actions button').forEach(b => { b.disabled = true; });
      zone.innerHTML = `<div class="ca-envoi">
        <p class="rdc-aide">Le client reçoit par mail un lien vers son cahier des charges, sans les prix. Il le relit et signe au doigt ;
          vous recevez un mail sur contact@rgdrenova.fr dès qu’il a signé. Le lien est valable 30 jours.</p>
        <div class="ca-envoi-grille">
          <label class="ca-coche" for="ca-email">E-mail du client</label>
          <input id="ca-email" type="email" value="${esc(coord.email)}" placeholder="adresse@client.fr">
        </div>
        <div class="form-actions"><button type="button" class="btn ghost" id="ca-envoi-annuler">Annuler</button>
          <button type="button" class="btn ghost" id="ca-envoi-copier">Copier le lien seulement</button>
          <span class="grow"></span><button type="button" class="btn primary" id="ca-envoi-ok">Envoyer</button></div>
      </div>`;
      zone.querySelector('#ca-envoi-annuler').onclick = () => dessiner();
      zone.querySelector('#ca-envoi-copier').onclick = async () => {
        try { k = await preparerLien(k); k = cahierDe(chantier.id) || k; } catch (e) { toast(e.message, 'error'); return; }
        try { await navigator.clipboard.writeText(lienSignature(k)); toast('Lien copié'); } catch { prompt('Copiez ce lien :', lienSignature(k)); }
      };
      zone.querySelector('#ca-envoi-ok').onclick = async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Envoi…';
        try {
          k = await envoyerPourSignature(k, {
            email: zone.querySelector('#ca-email').value, nom: coord.nom, objet: k.objet || chantier.titre,
          });
          k = cahierDe(chantier.id) || k;
          toast('Cahier des charges envoyé pour signature');
          dessiner();
        } catch (e) { toast(e.message, 'error'); b.disabled = false; b.textContent = 'Envoyer'; }
      };
      zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
