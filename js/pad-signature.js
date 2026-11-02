// Le pad de signature — on signe au doigt, sur l'écran.
//
// ⚠ IL EXISTAIT DÉJÀ, ENFERMÉ DANS L'ÉCRAN DE FACTURE. Il sert maintenant à
// deux endroits : le client qui signe sa facture sur le téléphone de Franck
// (29/10/2026), et la direction qui enregistre une fois pour toutes la
// signature de RGD Renova pour les factures envoyées par mail (02/11/2026,
// Élodie : « on pourrait mettre en place la signature sur la facture numérique
// avant de l'envoyer au client »). Le recopier aurait garanti que les deux
// versions divergent — ce dépôt en a déjà fait les frais ailleurs.
//
// ⚠ IL REMPLACE LE CONTENU DE SON HÔTE, IL N'OUVRE PAS DE FENÊTRE. Deux
// modales superposées partagent `closeModal` et se ferment mal ; et quand on
// tend le téléphone au client, il ne doit rien y avoir d'autre à l'écran que
// ce qu'il signe.

import { esc, toast } from './ui.js';

/**
 * Pose un pad dans `hote`.
 *
 * `surValider` reçoit `{ image, nom }` — l'image est un PNG en data URL, fond
 * transparent. Elle peut être `async` : le bouton reste désactivé le temps de
 * l'enregistrement, et se réactive si elle lève.
 */
export function posePadSignature(hote, {
  aide = '',
  nom = '',
  labelNom = 'Nom du signataire',
  demanderNom = true,
  libelleValider = 'Valider la signature',
  importAutorise = false,
  surAnnuler = null,
  surValider,
}) {
  hote.innerHTML = `
    <div class="rdc-signature">
      ${aide ? `<p class="rdc-aide">${aide}</p>` : ''}
      ${demanderNom ? `<div class="form"><div class="field">
        <label>${esc(labelNom)}</label>
        <input id="rdc-signataire" value="${esc(nom)}" placeholder="Nom et prénom" autocomplete="off">
      </div></div>` : ''}
      <canvas id="rdc-toile" class="rdc-toile"></canvas>
      ${importAutorise ? '<img id="rdc-apercu" class="rdc-apercu" alt="Image importée" hidden>' : ''}
      <div class="rdc-boutons">
        ${surAnnuler ? '<button type="button" class="btn ghost" id="rdc-sign-annuler">Annuler</button>' : ''}
        ${importAutorise ? `<label class="btn ghost rdc-import">Importer une image
          <input type="file" id="rdc-fichier" accept="image/png,image/jpeg,image/webp" hidden></label>` : ''}
        <button type="button" class="btn ghost" id="rdc-sign-effacer">Effacer</button>
        <button type="button" class="btn" id="rdc-sign-valider" disabled>${esc(libelleValider)}</button>
      </div>
    </div>`;

  const toile = hote.querySelector('#rdc-toile');
  const valider = hote.querySelector('#rdc-sign-valider');
  const ctx = toile.getContext('2d');
  let vierge = true;

  // ⚠ ON DIMENSIONNE LA TOILE EN PIXELS RÉELS, pas en pixels CSS : sur un
  // téléphone à 3 points par pixel, une toile laissée à sa taille par défaut
  // rend un trait baveux une fois agrandi dans le PDF. Et fixer `width` remet
  // le contexte à zéro, d'où le réglage du trait APRÈS.
  const dimensionner = () => {
    const dpr = window.devicePixelRatio || 1;
    const large = Math.max(260, Math.round(toile.clientWidth || 320));
    toile.width = Math.round(large * dpr);
    toile.height = Math.round(190 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  };
  dimensionner();

  // ⚠ LA TOILE SE MESURE APRÈS LA MISE EN PAGE, PAS PENDANT. Posée dans une
  // fenêtre qui vient de s'ouvrir, elle annonce une largeur de ZERO : on
  // retombait sur le minimum de 260 px et la signature sortait écrasée en
  // timbre-poste — 520×380 au lieu de 1390×380, mesuré le 02/11/2026 sur le
  // réglage des factures. L'écran de facture, lui, était déjà en page et n'a
  // jamais montré le défaut : c'est la même fonction qui servait deux cadres.
  //
  // ⚠ ON NE REDIMENSIONNE QUE TANT QUE RIEN N'EST TRACÉ : fixer `width` remet
  // la toile à blanc, et un pivot de téléphone effacerait la signature en
  // cours sous les doigts du client.
  const suivi = new ResizeObserver(() => { if (vierge) dimensionner(); });
  suivi.observe(toile);

  // ⚠ FOND TRANSPARENT, PAS BLANC : la signature se pose sur le document, et
  // un rectangle blanc y dessinerait une tache là où le papier n'en a pas.
  const point = (e) => {
    const r = toile.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  let trace = false;
  toile.addEventListener('pointerdown', (e) => {
    trace = true;
    toile.setPointerCapture(e.pointerId);
    const [a, b] = point(e);
    ctx.beginPath(); ctx.moveTo(a, b);
    e.preventDefault();
  });
  toile.addEventListener('pointermove', (e) => {
    if (!trace) return;
    const [a, b] = point(e);
    ctx.lineTo(a, b); ctx.stroke();
    if (vierge) { vierge = false; valider.disabled = false; suivi.disconnect(); }
    e.preventDefault();
  });
  const relacher = () => { trace = false; };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => toile.addEventListener(n, relacher));

  // --------------------------------------------- importer une image existante
  // Élodie, le 02/11/2026 : « je voudrais importer le cachet de l'entreprise ».
  // Un cachet scanné dit ce qu'un tracé au doigt ne dira jamais — la raison
  // sociale, le SIRET, l'adresse — et c'est ce qu'un client reconnaît.
  let importee = null;            // { image, w, h } quand un fichier a été choisi
  const apercu = hote.querySelector('#rdc-apercu');
  const fichier = hote.querySelector('#rdc-fichier');

  const revenirAuTrace = () => {
    importee = null;
    if (apercu) { apercu.hidden = true; apercu.removeAttribute('src'); }
    toile.hidden = false;
    dimensionner();               // remet la toile à blanc et le trait en place
    vierge = true; valider.disabled = true;
    suivi.observe(toile);         // redevenue vierge, elle peut de nouveau se remesurer
  };

  hote.querySelector('#rdc-sign-effacer').onclick = revenirAuTrace;

  if (fichier) fichier.onchange = async () => {
    const f = fichier.files && fichier.files[0];
    fichier.value = '';           // rechoisir le MÊME fichier doit redéclencher
    if (!f) return;
    // ⚠ ON BORNE AVANT DE DÉCODER, pas après : une photo de 12 Mo dépliée en
    // pleine résolution fait tomber l'onglet du téléphone avant d'avoir pu
    // afficher le moindre message.
    if (f.size > 12 * 1024 * 1024) { toast('Image trop lourde — 12 Mo au plus', 'error'); return; }
    try {
      // ⚠ `imageOrientation` APPLIQUE LA ROTATION EXIF. Un cachet photographié
      // au téléphone arrive sinon couché sur le côté, et rien à l'écran
      // n'expliquerait pourquoi.
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      // ⚠ 900 PIXELS SUFFISENT LARGEMENT. Le cachet s'imprime autour de 25 mm :
      // 300 points par pouce n'en demandent que 300. Au-delà, on alourdirait
      // une ligne que TOUT LE MONDE charge au démarrage, pour des pixels que
      // personne ne verra.
      const ech = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * ech));
      const h = Math.max(1, Math.round(bmp.height * ech));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      // ⚠ PNG D'ABORD, JPEG EN SECOURS : un cachet a des aplats et des bords
      // nets, que le JPEG salit. Mais l'image vit dans une COLONNE DE TEXTE
      // relue à chaque chargement de l'application, par chacun — au-delà de
      // ~150 ko on repasse en JPEG plutôt que de faire payer à Franck, en
      // données mobiles, des pixels qui finiront sur 25 mm de papier.
      let data = c.toDataURL('image/png');
      if (data.length > 150000) data = c.toDataURL('image/jpeg', 0.9);
      importee = { image: data, w, h };
      if (apercu) { apercu.src = data; apercu.hidden = false; }
      toile.hidden = true;
      suivi.disconnect();
      valider.disabled = false;
    } catch (e) {
      toast('Image illisible — essayez un PNG ou un JPEG', 'error');
    }
  };
  if (surAnnuler) hote.querySelector('#rdc-sign-annuler').onclick = () => surAnnuler();

  valider.onclick = async () => {
    const saisi = demanderNom ? hote.querySelector('#rdc-signataire').value.trim() : nom;
    if (demanderNom && !saisi) { toast('Le nom du signataire est demandé', 'error'); return; }
    valider.disabled = true;
    try {
      // ⚠ ON TRANSPORTE AUSSI LES DIMENSIONS : c'est le document qui décidera
      // de la taille d'impression, et un cachet carré ne se pose pas comme un
      // paraphe large. Sans elles, il faudrait charger l'image pour la mesurer.
      const img = importee
        || { image: toile.toDataURL('image/png'), w: toile.width, h: toile.height };
      await surValider({ image: img.image, w: img.w, h: img.h, nom: saisi });
    } catch (e) {
      valider.disabled = false;
      toast(e.message || 'Signature non enregistrée', 'error');
    }
  };
}
