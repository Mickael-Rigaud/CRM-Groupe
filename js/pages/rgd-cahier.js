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
import { esc, toast, openModal, closeModal, confirm } from '../ui.js';
import { posePadSignature } from '../pad-signature.js';
import { COSTRUCTOR_APP } from '../data/rgd-cgv.js';
import { cahierDe, estSigne, creerCahier, majCahier, signerCahier, retirerSignature,
         preparerLien, lienSignature, lienValable, envoyerPourSignature,
         devisSignesDu, postesDuDevisCrm, decouperCollage, lireDevisCostructor,
         ajouterPhotos, retirerPhoto, poserPlan, liensDuCahier, piecesDe, renommerPhotos, deplacerPhoto,
         FAMILLES, biblioElements, biblioRangee, enregistrerBiblio, garderDansBiblio, elementsDe, renommerElements,
         derniereDemandeNas, dossiersNas, enCoursNas, demanderPhotosNas, RESERVE } from '../data/rgd-cahier.js';
import { trierPhotos } from './rgd-cahier-tri.js';
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
    // ⚠ LES ÉLÉMENTS VIVENT DANS L'ÉTAT COMME LES POSTES : on les retouche
    // plusieurs fois avant d'enregistrer, et un aller-retour en base à chaque
    // case cochée aurait rendu l'écran poussif.
    elements: elementsDe(k),
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

  // La hauteur du champ de détail : une ligne par ligne du descriptif, six au
  // plus — au-delà on fait défiler plutôt que d'étirer la pièce sur un écran.
  const lignesDuDetail = (t) => Math.min(6, Math.max(1, String(t || '').split('\n').length));
  const ligneP = (p, i, fige, pieces) => `
    <div class="ca-poste" data-i="${i}">
      <div class="ca-poste-texte">
        <input data-c="designation" value="${esc(p.designation)}" placeholder="Travaux" aria-label="Désignation"${fige ? ' disabled' : ''}>
        ${'' /* ⚠ UN TEXTAREA, PLUS UN INPUT (17/11/2026). Depuis que le devis est
             lu en entier, un descriptif porte jusqu'à dix lignes : dans un champ
             d'une seule ligne, les retours disparaissaient à l'affichage et on
             lisait « ouvrages conservésApprovisionnement ». Et surtout, un
             input AURAIT ÉCRASÉ ces retours au premier enregistrement — le
             texte serait revenu en pavé dans les deux documents. */}
        <textarea data-c="detail" rows="${lignesDuDetail(p.detail)}"
          placeholder="Précision (facultatif)" aria-label="Détail" class="ca-detail"${fige ? ' disabled' : ''}>${esc(p.detail)}</textarea>
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
      ${blocElements(null, fige)}
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
    // Une vignette : la photo, une croix pour la retirer, et un menu pour la
    // changer de pièce (« tu corriges d'un clic si l'IA se trompe »).
    const vignette = (x, retirable) => `<span class="ca-vignette${x.source === 'nas' ? ' nas' : ''}"><img data-chemin="${esc(x.chemin)}" alt="">${
      retirable ? `<button type="button" class="ca-vignette-x" data-retirer-photo="${esc(x.chemin)}" title="Retirer la photo">✕</button>
        ${pieces.length > 1 ? `<select class="ca-vignette-piece" data-photo-piece="${esc(x.chemin)}" title="Changer de pièce" aria-label="Changer la photo de pièce">
          <option value="__">⇄</option>${pieces.filter(l => l !== (x.lot || '')).map(l => `<option value="${esc(l)}">${esc(l || 'Travaux')}</option>`).join('')}</select>` : ''}` : ''}</span>`;
    const nas = derniereDemandeNas(k);
    return `<div class="ca-titre"><h4 class="ca-h">Travaux par pièce <span>${pieces.length} pièce${pieces.length > 1 ? 's' : ''} · ${s.postes.length} poste${s.postes.length > 1 ? 's' : ''}</span></h4>
        <span class="muted small">Aucun prix : ce document va aux ouvriers et au client. Une page par pièce, avec ses photos (deux au plus).</span>
        </div>
      ${fige || !pieces.length ? '' : etatNas(nas)}
      ${fige || !pieces.length || !photos.length ? '' : `<div class="ca-trier">
        <span>${photos.filter(p => p.lot !== RESERVE).length} photo(s) dans les pièces${
          photos.some(p => p.lot === RESERVE) ? ` · ${photos.filter(p => p.lot === RESERVE).length} en réserve` : ''}</span>
        <button type="button" class="btn sm" id="ca-trier">Trier les photos</button></div>`}
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
            <div class="ca-vignettes">${ph.map(x => vignette(x, !fige)).join('')}${fige ? '' : `<label class="btn ghost sm ca-ajout-photo">${
              s.envoiPhoto === lot ? 'Envoi…' : '+ Photo'}<input type="file" accept="image/*" multiple hidden data-photo-lot="${esc(lot)}"></label>`}</div>
            <div class="ca-postes">${lignes.map(x => ligneP(x.p, x.i, fige, pieces)).join('')}</div>
            ${fige ? '' : '<button type="button" class="btn ghost sm" data-ajouter-poste>+ Ajouter un poste</button>'}
            ${blocElements(lot, fige)}
          </section>`;
        }).join('')}
        ${fige ? '' : '<button type="button" class="btn sm ca-ajouter-piece" id="ca-ajouter-piece">+ Ajouter une pièce</button>'}
      </div>
      ${blocPlan(fige)}`;
  }

  // ⚠ LE MÊME BLOC SERT AU CHANTIER ET À CHAQUE PIÈCE (17/11/2026). `ou` vaut
  // `null` pour le chantier entier, ou le nom du lot. Les éléments retenus se
  // listent, chacun avec sa case « vu par le client » ; on en ajoute depuis la
  // bibliothèque (un clic) ou à la main (et on peut alors le garder).
  // ⚠ UN SEUL CHAMP, ET LA BIBLIOTHÈQUE SE FILTRE SOUS LES DOIGTS (17/11/2026,
  // Élodie : « la bibliothèque n'est pas très claire […] on se perd trop dans
  // les informations »). La première version demandait CINQ gestes pour une
  // phrase : une liste, un menu de famille, un champ, un bouton « Ajouter » et
  // un bouton qui ouvrait encore une fenêtre à deux colonnes.
  //
  // Deux maquettes vivantes lui ont été soumises (A : on écrit, ça propose ;
  // B : tout est affiché, on coche). Elle a choisi A — ne pas revenir à B ni
  // à la fenêtre de cases.
  //
  // ⚠ LA FAMILLE N'EST PLUS UN MENU : elle est portée par la phrase de la
  // bibliothèque. Pour une phrase neuve, deux pastilles de création — un clic,
  // pas un menu à dérouler puis un bouton à viser.
  function blocElements(ou, fige) {
    const l = ou === null ? s.elements.chantier : (s.elements.pieces[ou] || []);
    const cle = ou === null ? '__chantier' : ou;
    return `<div class="ca-elements" data-elements="${esc(cle)}">
      <div class="ca-el-tete"><h5>Technique et contraintes${ou === null ? ' du chantier' : ''}</h5>
        ${fige || ou !== null ? '' : '<button type="button" class="ca-el-tenir" id="ca-el-tenir">Modifier la bibliothèque</button>'}</div>
      <div class="ca-el-puces">${l.length ? l.map((e, i) => `
        <span class="ca-el-puce fam-${esc(e.famille)}">
          <span class="ca-el-texte">${esc(e.texte)}</span>
          ${fige ? (e.client ? '<span class="ca-el-oeil on">client</span>' : '')
            : `<button type="button" class="ca-el-oeil${e.client ? ' on' : ''}" data-el-client="${esc(cle)}" data-i="${i}"
                title="${e.client ? 'Visible par le client — cliquer pour la garder à l’équipe'
                  : 'Équipe seulement — cliquer pour la montrer au client'}">client</button>
               <button type="button" class="ca-el-x" data-el-retirer="${esc(cle)}" data-i="${i}" title="Retirer">✕</button>`}
        </span>`).join('')
        : '<span class="ca-el-vide">Rien pour l’instant.</span>'}</div>
      ${fige ? '' : `<div class="ca-el-chercher">
        <input type="text" data-el-q="${esc(cle)}" autocomplete="off"
          placeholder="Ajouter : tape un mot — ascenseur, amiante, plâtre, horaires…">
        <div class="ca-el-sug" data-el-sug="${esc(cle)}"></div>
      </div>`}
    </div>`;
  }

  // ⚠ LES PHOTOS DU NAS (12/11/2026) : l'état de la dernière demande, et de quoi
  // choisir le dossier quand le NAS ne l'a pas trouvé ou s'est trompé.
  function etatNas(d) {
    const liste = dossiersNas();
    const choixDossier = (proposes) => {
      const vus = new Set();
      const options = [...(proposes || []), ...liste].filter(x => x && !vus.has(x.chemin) && vus.add(x.chemin));
      return options.length ? `<select id="ca-nas-dossier" aria-label="Dossier du client sur le NAS">
          <option value="">Choisir le dossier du client…</option>
          ${options.map(x => `<option value="${esc(x.chemin)}"${x.chemin === (d?.dossier || k?.nas_dossier) ? ' selected' : ''}>${
            esc(`${x.nom}${x.etat ? ` — ${x.etat}` : ''}${x.nb_photos != null ? ` (${x.nb_photos} photos)` : ''}`)}</option>`).join('')}
        </select><button type="button" class="btn sm" id="ca-nas-prendre">Prendre ce dossier</button>` : '';
    };
    if (!d) {
      return `<div class="ca-nas"><span class="ca-nas-ico">NAS</span><span>Les photos du projet seront cherchées sur le NAS dès que le cahier est enregistré.</span>
        <span class="grow"></span><button type="button" class="btn ghost sm" id="ca-nas-relancer">Chercher maintenant</button></div>`;
    }
    if (enCoursNas(d)) {
      return `<div class="ca-nas en-cours"><span class="ca-nas-ico">NAS</span><span class="ca-lecture">${
        d.statut === 'en_cours' ? 'Le NAS trie les photos du projet par pièce…' : 'Demande envoyée au NAS — il passe toutes les minutes…'}</span></div>`;
    }
    if (d.statut === 'fait') {
      return `<div class="ca-nas fait"><span class="ca-nas-ico">NAS</span><span>${esc(d.message || 'Photos rangées.')}</span>
        <span class="grow"></span><button type="button" class="btn ghost sm" id="ca-nas-relancer">Relancer</button>
        <details class="ca-nas-autre"><summary>Pas le bon dossier ?</summary>${choixDossier(d.candidats)}</details></div>`;
    }
    return `<div class="ca-nas alerte"><span class="ca-nas-ico">NAS</span><span>${esc(d.message || 'Le NAS n’a pas pu traiter la demande.')}</span>
      <span class="grow"></span>${d.statut === 'erreur' ? '<button type="button" class="btn ghost sm" id="ca-nas-relancer">Réessayer</button>' : ''}
      <div class="ca-nas-choix">${choixDossier(d.candidats)}</div></div>`;
  }

  // Déposer une demande au NAS (le cahier doit exister et avoir des pièces).
  async function demanderNas(dossier_force = null) {
    if (!k || estSigne(k) || !piecesDe(k.postes).length) return;
    const c = dossier ? donneesDocument(dossier) : {};
    await demanderPhotosNas(k, {
      client_nom: c.nom || dossier?.nom || chantier.titre, ville: c.villeChantier || '', adresse: chantier.adresse || c.adresseChantier || '',
      pieces: piecesDe(k.postes), dossier_force,
    });
  }

  // Tant qu'une demande est en cours, on regarde toutes les 4 secondes si le
  // NAS a répondu (le temps réel met la base à jour ; ceci redessine l'écran).
  let veille = null;
  function surveiller() {
    clearInterval(veille);
    const d = derniereDemandeNas(k);
    if (!enCoursNas(d)) return;
    veille = setInterval(() => {
      if (!hote?.isConnected) { clearInterval(veille); return; }
      const n = derniereDemandeNas(k);
      if (!enCoursNas(n)) {
        clearInterval(veille);
        lire();
        k = cahierDe(chantier.id) || k;
        if (n?.statut === 'fait') toast('Photos du NAS rangées par pièce');
        dessiner();
      }
    }, 4000);
  }

  // Le plan, et les photos dont la pièce a disparu.
  function blocPlan(fige) {
    const pieces = piecesEcran();
    const photos = k?.photos || [];
    const vignette = (chemin, retirable) => `<span class="ca-vignette"><img data-chemin="${esc(chemin)}" alt="">${
      retirable ? `<button type="button" class="ca-vignette-x" data-retirer-photo="${esc(chemin)}" title="Retirer la photo">✕</button>` : ''}</span>`;
    const orphelines = photos.filter(p => p.lot !== RESERVE && !pieces.includes(p.lot || ''));
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
        // ⚠ LES ÉLÉMENTS SUIVENT LA PIÈCE, comme les photos : sans ça, les
        // contraintes resteraient attachées à un nom qui n'existe plus.
        s.elements = renommerElements(s.elements, { [ancien]: nom });
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

  let enregistrer = async () => {
    lire();
    const choisi = devisChoisi();
    const champs = {
      devis_id: choisi?.source === 'costructor' ? choisi.id : null,
      devis_crm_id: choisi?.source === 'crm' ? choisi.id : null,
      devis_numero: choisi?.numero || null,
      objet: s.objet, postes: s.postes, consignes: s.consignes, precisions: s.precisions,
      type_bien: s.type_bien, nature: s.nature, elements: s.elements,
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

  // ---------------------------------------------- tenir la bibliothèque
  //
  // ⚠ DEUX ONGLETS, UNE FAMILLE À LA FOIS, RANGÉE PAR RUBRIQUE (19/11/2026).
  // Élodie : « je voudrais que le pop-up modifier la bibliothèque soit plus
  // sympa visuellement que deux grands blocs où tout est mélangé », puis, devant
  // trois maquettes cliquables, elle a choisi celle-ci. C'était deux `textarea`
  // de douze lignes côte à côte : vingt et une phrases techniques à la suite,
  // sans titre, dans une fenêtre où l'on n'en voyait que la moitié.
  //
  // ⚠ LES PHRASES SONT ADRESSÉES PAR `id`, PAS PAR RANG, et il le faut : relire
  // l'écran retire au passage les phrases vidées à la main, ce qui DÉCALE les
  // rangs. Une croix aurait alors supprimé la ligne suivante. Les `id` ne
  // vivent que le temps de la fenêtre et ne sont jamais enregistrés.
  function ouvrirBiblioTenir() {
    const b = biblioRangee();
    let compteur = 0;
    Object.keys(FAMILLES).forEach(f => b[f].forEach(e => { e.id = ++compteur; }));
    const etat = { famille: 'technique', q: '', neuves: [], replie: new Set() };
    const sansAcc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const propre = (t) => String(t || '').replace(/\s+/g, ' ').trim();

    // ⚠ LA FENÊTRE DU CAHIER EST REMPLACÉE, PAS SUPERPOSÉE : `openModal` ferme
    // celle qui est ouverte. En sortant d'ici, il faut donc la REMONTER —
    // exactement ce que fait `demander` après une question.
    //
    // ⚠ C'EST UN DÉFAUT QUI EXISTAIT DÉJÀ, et il se voyait (vérifié sur la
    // version publiée, 19/11/2026) : « Enregistrer » comme « Annuler »
    // renvoyaient au Planning chantier, le cahier en cours de préparation
    // disparu. `dessiner()` écrivait alors dans un `hote` détaché de la page,
    // c'est-à-dire nulle part, et rien ne le signalait.
    //
    // ⚠ ET C'EST `onClose` QUI LE FAIT, pas le bouton : la fenêtre se ferme
    // aussi par la croix et par le fond. Les trois sorties doivent remonter le
    // cahier, pas seulement celle qu'on a sous la main.
    const m = openModal('Modifier la bibliothèque', '<div id="bi"></div>', {
      wide: true,
      onClose: () => { monter(); dessiner(); },
    });
    const hote2 = () => m.querySelector('#bi');

    // L'ordre des rubriques : celui d'apparition des phrases, puis celles qu'on
    // vient de créer et qui n'ont encore rien dedans. « Sans rubrique » en
    // dernier — c'est là que tombent les phrases écrites au fil d'un cahier.
    const rubriques = (f) => {
      const vues = [...new Set(b[f].map(e => e.r))];
      const out = vues.filter(Boolean);
      for (const r of etat.neuves) if (!out.includes(r)) out.push(r);
      if (vues.includes('')) out.push('');
      return out;
    };
    // ⚠ UNE PHRASE QUI CHANGE DE RUBRIQUE CHANGE AUSSI DE PLACE DANS LA LISTE,
    // et sans cela l'ordre des rubriques SAUTE sous les yeux : il se lit de la
    // première phrase de chaque groupe, et déplacer la première phrase de
    // « Murs et peinture » faisait passer « Électricité » en tête (vu à
    // l'essai, 19/11/2026). La phrase se range donc derrière ses nouvelles
    // voisines, et l'ordre affiché est celui de la liste enregistrée.
    const placer = (e, rub) => {
      const l = b[etat.famille];
      const i = l.indexOf(e);
      if (i >= 0) l.splice(i, 1);
      e.r = rub;
      let dernier = -1;
      l.forEach((x, j) => { if (x.r === rub) dernier = j; });
      l.splice(dernier + 1, 0, e);
    };
    const nomNeuf = () => {
      const pris = new Set(rubriques(etat.famille));
      let n = 'Nouvelle rubrique';
      for (let i = 2; pris.has(n); i++) n = `Nouvelle rubrique ${i}`;
      return n;
    };

    // ⚠ ON RELIT L'ÉCRAN AVANT CHAQUE REDESSIN. Les phrases et les titres de
    // rubrique sont des champs libres : un redessin les réécrit depuis `b`, et
    // sans cette lecture une correction tapée puis suivie d'un repli, d'une
    // recherche ou d'un ajout serait perdue sans un bruit.
    const lireB = () => {
      const h = hote2(); if (!h) return;
      h.querySelectorAll('[data-bi-id]').forEach(el => {
        const e = b[etat.famille].find(x => x.id === +el.dataset.biId);
        if (e) e.t = propre(el.textContent);
      });
      h.querySelectorAll('[data-bi-rub]').forEach(el => {
        const avant = el.dataset.biRub;
        const apres = propre(el.textContent);
        if (apres === avant) return;
        // Renommer une rubrique renomme toutes ses phrases : c'est le même geste
        // vu de l'autre côté. Un titre vidé renvoie ses phrases dans « Sans
        // rubrique », ce qui est la seule lecture possible d'un nom effacé.
        b[etat.famille].forEach(e => { if (e.r === avant) e.r = apres; });
        etat.neuves = etat.neuves.map(r => (r === avant ? apres : r)).filter(Boolean);
        el.dataset.biRub = apres;
      });
      b[etat.famille] = b[etat.famille].filter(e => e.t);
    };

    const dessinerB = () => {
      const f = etat.famille;
      const q = sansAcc(etat.q);
      const toutes = rubriques(f);
      // Le menu de déplacement, calculé une fois : il est le même sur toutes les
      // lignes de la famille.
      const choix = (courante) => toutes.filter(Boolean).map(x =>
        `<option value="${esc(x)}"${x === courante ? ' selected' : ''}>${esc(x)}</option>`).join('')
        + `<option value=""${courante ? '' : ' selected'}>Sans rubrique</option>`
        + '<option value="__neuve">Nouvelle rubrique…</option>';

      const bloc = (r) => {
        const phrases = b[f].filter(e => e.r === r && (!q || sansAcc(e.t).includes(q)));
        if (q && !phrases.length) return '';
        const sans = !r;
        // ⚠ « SANS RUBRIQUE » N'EST PAS UN NOM, C'EST UNE ABSENCE : le titre ne
        // doit donc pas être modifiable. Le rendre éditable aurait fait, à la
        // première relecture, une VRAIE rubrique appelée « Sans rubrique ».
        const titre = sans
          ? '<span class="bi-nom est-sans">Sans rubrique</span>'
          : `<span class="bi-nom" contenteditable="true" spellcheck="false" data-bi-rub="${esc(r)}">${esc(r)}</span>`;
        return `<details class="bi-rub"${q || !etat.replie.has(r) ? ' open' : ''} data-bi-bloc="${esc(r)}">
          <summary>${titre}<i>${phrases.length}</i></summary>
          <div class="bi-lignes">
            ${phrases.map(e => `<div class="bi-ph">
              <span class="bi-pou" aria-hidden="true"></span>
              <span class="bi-txt" contenteditable="true" spellcheck="false" data-bi-id="${e.id}">${esc(e.t)}</span>
              <span class="bi-bouger">⇅<select data-bi-move="${e.id}" aria-label="Rubrique de la phrase">${choix(e.r)}</select></span>
              <button type="button" class="bi-x" data-bi-x="${e.id}" aria-label="Retirer cette phrase">✕</button>
            </div>`).join('')}
            <div class="bi-ajout"><input type="text" placeholder="Ajouter une phrase…" data-bi-add="${esc(r)}"></div>
          </div></details>`;
      };

      const liste = toutes.map(bloc).join('');
      hote2().innerHTML = `
        <p class="muted small" style="margin:0 0 14px">Une ligne par phrase. Ce que vous écrivez à la main dans un
          cahier s’ajoute ici tout seul, sans rubrique. Modifier la bibliothèque ne change pas les cahiers
          déjà préparés.</p>
        <div class="bi-onglets">${Object.entries(FAMILLES).map(([k, info]) =>
          `<button type="button" class="${k === f ? 'on' : ''}" data-bi-fam="${k}">${esc(info.label)}<i>${b[k].length}</i></button>`).join('')}</div>
        <div class="bi-cherche"><input type="search" id="bi-q" placeholder="Chercher dans ${esc(FAMILLES[f].label.toLowerCase())}…" value="${esc(etat.q)}"></div>
        <div class="bi-liste">${liste || `<div class="bi-vide">${q ? 'Aucune phrase ne correspond.' : 'Cette famille est vide.'}</div>`}</div>
        <button type="button" class="bi-neuve" id="bi-neuve">+ Nouvelle rubrique</button>
        <div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button>
          <button type="button" class="btn primary" id="ca-biblio-save">Enregistrer</button></div>`;
      brancherB();
    };

    const ajouter = (rub, champ) => {
      const t = propre(champ.value);
      if (!t) return;
      lireB();
      if (b[etat.famille].some(e => sansAcc(e.t) === sansAcc(t))) {
        toast('Cette phrase est déjà dans la bibliothèque'); return;
      }
      placer({ t, r: rub, id: ++compteur }, rub);
      etat.q = '';
      dessinerB();
      // On en ajoute souvent deux ou trois d'affilée : on rend la main dans le
      // champ de la même rubrique.
      hote2().querySelector(`[data-bi-add="${CSS.escape(rub)}"]`)?.focus();
    };

    function brancherB() {
      const h = hote2();
      h.querySelectorAll('[data-bi-fam]').forEach(btn => btn.onclick = () => {
        lireB(); etat.famille = btn.dataset.biFam; etat.q = ''; etat.neuves = []; dessinerB();
      });
      const champQ = h.querySelector('#bi-q');
      champQ.oninput = () => {
        const pos = champQ.selectionStart;
        lireB(); etat.q = champQ.value; dessinerB();
        const n = hote2().querySelector('#bi-q');
        n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* type search : pas toujours permis */ }
      };
      h.querySelectorAll('[data-bi-x]').forEach(btn => btn.onclick = () => {
        lireB();
        b[etat.famille] = b[etat.famille].filter(e => e.id !== +btn.dataset.biX);
        dessinerB();
      });
      h.querySelectorAll('[data-bi-move]').forEach(sel => sel.onchange = () => {
        const id = +sel.dataset.biMove;
        const neuve = sel.value === '__neuve' ? nomNeuf() : null;
        lireB();
        const e = b[etat.famille].find(x => x.id === id);
        if (e) placer(e, neuve || sel.value);
        if (neuve) etat.neuves.push(neuve);
        dessinerB();
      });
      h.querySelectorAll('[data-bi-add]').forEach(champ => champ.onkeydown = (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        ajouter(champ.dataset.biAdd, champ);
      });
      // Un repli survit au redessin : sans cela, replier une rubrique puis taper
      // une lettre dans la recherche la rouvrirait.
      h.querySelectorAll('[data-bi-bloc]').forEach(d => d.addEventListener('toggle', () => {
        if (etat.q) return;             // en recherche, tout est ouvert : on ne retient rien
        if (d.open) etat.replie.delete(d.dataset.biBloc); else etat.replie.add(d.dataset.biBloc);
      }));
      h.querySelector('#bi-neuve').onclick = () => {
        lireB();
        const nom = nomNeuf();
        etat.neuves.push(nom); etat.q = '';
        dessinerB();
        const t = [...hote2().querySelectorAll('[data-bi-rub]')].find(x => x.dataset.biRub === nom);
        if (t) { t.focus(); getSelection().selectAllChildren(t); }
      };
      h.querySelector('#ca-biblio-save').onclick = async () => {
        lireB();
        try {
          // ⚠ UNE RUBRIQUE VIDE NE S'ENREGISTRE PAS : la bibliothèque est une
          // liste de phrases, et une rubrique n'existe que par celles qu'elle
          // porte. Celle qu'on vient de créer sans rien mettre dedans disparaît
          // donc à la fermeture — il n'y a rien à garder.
          await enregistrerBiblio(b);
          closeModal();                   // `onClose` remonte le cahier et le redessine
          toast('Bibliothèque enregistrée');
        } catch (e) { toast(e.message || 'Enregistrement impossible', 'erreur'); }
      };
    }

    dessinerB();
  }

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
    // ⚠ TRIER LES PHOTOS (12/11/2026) : l'écran plein cadre pour changer une
    // photo de pièce, puiser dans la réserve, choisir les deux imprimées.
    const bTrier = hote.querySelector('#ca-trier');
    if (bTrier) bTrier.onclick = async () => {
      try {
        await enregistrer();
        // ⚠ AU RETOUR, LA FENÊTRE DU CAHIER EST REMONTÉE SI ELLE A DISPARU
        // (12/11/2026, Élodie : « quand je fais Terminé, j'apparais dans
        // Clients & prospects »). Pendant le tri, une autre fenêtre a pu
        // remplacer celle du cahier ; on la rouvre au lieu de laisser voir la
        // page du dessous.
        await trierPhotos(chantier, k, piecesEcran(), () => {
          k = cahierDe(chantier.id) || k;
          if (!hote?.isConnected) monter();
          dessiner();
        }, { ajouterPiece: (n) => { if (!piecesEcran().includes(n)) s.piecesVides.push(n); } });
      } catch (e) { toast(e.message, 'error'); }
    };
    // Les photos du NAS : relancer, ou imposer le dossier du client.
    const bRelancer = hote.querySelector('#ca-nas-relancer');
    if (bRelancer) bRelancer.onclick = async () => {
      try { await enregistrer(); await demanderNas(k.nas_dossier || null); dessiner(); surveiller(); }
      catch (e) { toast(e.message, 'error'); }
    };
    const bPrendre = hote.querySelector('#ca-nas-prendre');
    if (bPrendre) bPrendre.onclick = async () => {
      const chemin = hote.querySelector('#ca-nas-dossier')?.value;
      if (!chemin) { toast('Choisissez le dossier du client dans la liste.', 'error'); return; }
      try { await enregistrer(); await demanderNas(chemin); dessiner(); surveiller(); }
      catch (e) { toast(e.message, 'error'); }
    };
    hote.querySelectorAll('[data-photo-piece]').forEach(sel => sel.onchange = async () => {
      if (sel.value === '__') return;
      lire();
      try { k = await deplacerPhoto(k, sel.dataset.photoPiece, sel.value); k = cahierDe(chantier.id) || k; }
      catch (e) { toast(e.message, 'error'); }
      dessiner();
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
    // ---------------------------------------- technique et contraintes
    // Le tableau visé par un bloc : celui du chantier, ou celui d'une pièce
    // (créé à la volée la première fois qu'on y met quelque chose).
    const listeDe = (cle) => {
      if (cle === '__chantier') return s.elements.chantier;
      if (!s.elements.pieces[cle]) s.elements.pieces[cle] = [];
      return s.elements.pieces[cle];
    };
    // ⚠ ON NE REDESSINE PAS L'ÉCRAN À CHAQUE FRAPPE : seule la bande de
    // suggestions se refait, sinon le champ perdrait le focus à la première
    // lettre. L'écran entier n'est redessiné qu'à l'ajout ou au retrait.
    const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const ajouter = async (cle, famille, texte, garder) => {
      lire();
      listeDe(cle).push({ texte, famille, client: false });
      // ⚠ CE QU'ON ÉCRIT À LA MAIN ENTRE DANS LA BIBLIOTHÈQUE : c'est ce qui la
      // fait grossir toute seule, sans séance de paramétrage. Un doublon est
      // ignoré sans bruit.
      if (garder) { try { await garderDansBiblio(famille, texte); } catch { /* lecture seule */ } }
      s.modifie = true;
      dessiner();
      // On rend la main dans le champ de ce bloc : on en ajoute souvent deux
      // ou trois d'affilée.
      hote.querySelector(`[data-el-q="${CSS.escape(cle)}"]`)?.focus();
    };
    const suggerer = (cle) => {
      const zone = hote.querySelector(`[data-el-sug="${CSS.escape(cle)}"]`);
      const champ = hote.querySelector(`[data-el-q="${CSS.escape(cle)}"]`);
      if (!zone || !champ) return;
      const q = sansAccent(champ.value.trim());
      const pris = new Set(listeDe(cle).map(e => sansAccent(e.texte)));
      const b = biblioElements();
      const toutes = [...b.contrainte.map(t => ['contrainte', t]), ...b.technique.map(t => ['technique', t])];
      const libres = toutes.filter(([, t]) => !pris.has(sansAccent(t)) && (!q || sansAccent(t).includes(q)));
      // ⚠ AU REPOS, ON ALTERNE LES DEUX FAMILLES (17/11/2026, Élodie : « je ne
      // vois que les pastilles contraintes, c'est normal ? » — non). Les
      // contraintes étaient listées en premier et la bande s'arrête à huit :
      // avec neuf contraintes, aucune phrase technique n'apparaissait tant
      // qu'on n'avait pas tapé. Une famille entière était invisible.
      // En recherche, on garde l'ordre de pertinence : le filtre a déjà trié.
      let trouves;
      if (q) trouves = libres.slice(0, 8);
      else {
        const parF = { contrainte: libres.filter(x => x[0] === 'contrainte'), technique: libres.filter(x => x[0] === 'technique') };
        trouves = [];
        for (let i = 0; trouves.length < 8 && (parF.contrainte[i] || parF.technique[i]); i++) {
          if (parF.contrainte[i]) trouves.push(parF.contrainte[i]);
          if (trouves.length < 8 && parF.technique[i]) trouves.push(parF.technique[i]);
        }
      }
      const connue = toutes.some(([, t]) => sansAccent(t) === q);
      const brut = champ.value.trim();
      // ⚠ LA BIBLIOTHÈQUE D'ABORD, LA CRÉATION ENSUITE, et pas avant quatre
      // lettres. Dans l'autre ordre, taper « digicode » proposait d'abord de
      // CRÉER une phrase « digicode » — et c'est elle que prenaient le premier
      // clic et la touche Entrée, à la place de la phrase déjà écrite dans la
      // bibliothèque (vu à l'essai, 17/11/2026).
      const creer = brut.length >= 4 && !connue;
      zone.innerHTML = [
        ...trouves.map(([f, t], i) =>
          `<button type="button" class="ca-sug fam-${esc(f)}" style="--i:${i}" data-f="${esc(f)}" data-t="${esc(t)}">
            <small>${esc(FAMILLES[f].court)}</small>${esc(t)}</button>`),
        ...(creer ? Object.entries(FAMILLES).map(([f, info], i) =>
          `<button type="button" class="ca-sug neuf" style="--i:${trouves.length + i}"
            data-f="${esc(f)}" data-t="${esc(brut)}" data-neuf="1">
            <small>Créer · ${esc(info.court)}</small>${esc(brut)}</button>`) : []),
      ].join('') || '<span class="ca-el-vide">Rien d’autre dans la bibliothèque.</span>';
      zone.querySelectorAll('.ca-sug').forEach(b2 => b2.onclick = () =>
        ajouter(cle, b2.dataset.f, b2.dataset.t, b2.dataset.neuf === '1'));
    };
    hote.querySelectorAll('[data-el-q]').forEach(champ => {
      const cle = champ.dataset.elQ;
      champ.oninput = () => suggerer(cle);
      champ.onkeydown = (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        hote.querySelector(`[data-el-sug="${CSS.escape(cle)}"] .ca-sug`)?.click();
      };
      suggerer(cle);
    });
    hote.querySelectorAll('[data-el-retirer]').forEach(b => b.onclick = () => {
      lire();
      const l = listeDe(b.dataset.elRetirer);
      l.splice(Number(b.dataset.i), 1);
      s.modifie = true; dessiner();
    });
    hote.querySelectorAll('[data-el-client]').forEach(c => c.onchange = () => {
      const l = listeDe(c.dataset.elClient);
      const e = l[Number(c.dataset.i)];
      if (e) { e.client = c.checked; s.modifie = true; }
    });
    const bTenir = hote.querySelector('#ca-el-tenir');
    if (bTenir) bTenir.onclick = () => { lire(); ouvrirBiblioTenir(null); };

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

  // ⚠ LA DEMANDE AU NAS PART TOUTE SEULE : dès qu'un cahier a des pièces et
  // qu'aucune demande n'a encore été faite pour lui. Elle n'est jamais refaite
  // d'office ensuite (« Relancer » est là pour ça) : rouvrir le cahier ne doit
  // pas re-trier et remplacer des photos déjà corrigées à la main.
  async function demandeInitiale() {
    if (!direction || !k || estSigne(k) || derniereDemandeNas(k) || !piecesDe(k.postes).length) { surveiller(); return; }
    try { await demanderNas(k.nas_dossier || null); dessiner(); } catch (e) { console.warn('[NAS]', e.message); }
    surveiller();
  }
  const enregistrerSansNas = enregistrer;
  enregistrer = async () => { const r = await enregistrerSansNas(); await demandeInitiale(); return r; };

  if (direction && !estSigne(k) && !s.postes.length && devisChoisi()) remplirDepuisDevis();
  else { dessiner(); demandeInitiale(); }
}
