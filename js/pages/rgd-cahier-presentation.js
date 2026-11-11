// La présentation du cahier des charges, PIÈCE PAR PIÈCE, à l'écran
// (11/11/2026, Élodie : « quelque chose pièce par pièce, une présentation
// moderne et dynamique sur le CRM, que l'on puisse exporter en PDF pour les
// ouvriers et les clients »).
//
// Plein écran, une diapositive par pièce, comme son modèle PowerPoint :
// garde orange, « Interventions », plan, puis chaque pièce (son nom dans
// l'écriture manuscrite, ses travaux qui apparaissent l'un après l'autre, ses
// photos qui avancent doucement), et la fin — « Bon pour accord » pour le
// client, « Préparation » pour l'équipe. On passe d'une pièce à l'autre aux
// flèches, au clavier, en glissant du doigt, ou par la bande de vignettes.
//
// ⚠ LE PDF EST CELUI DE `rgd-cahier-doc.js`, la même mise en page à
// l'italienne : « Exporter en PDF » ouvre l'impression, où l'on choisit
// « Enregistrer au format PDF ». Une seule source de vérité pour le contenu :
// les deux lisent le cahier de la même façon (`donnees`, `liensDuCahier`,
// `piecesDe`). AUCUN PRIX, nulle part.
import { esc } from '../ui.js';
import { finDe, dureeLue, versDate, lignesDe } from '../data/rgd-planning.js';
import { liensDuCahier, piecesDe } from '../data/rgd-cahier.js';
import { TACHE, donnees, imprimerCahierClient, imprimerCahierOuvriers } from './rgd-cahier-doc.js';

const LOGO = new URL('../../assets/logos/rgd-complet.png', import.meta.url).href;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => { if (!iso) return ''; const d = versDate(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };

// Les deux polices du modèle, chargées une fois dans le CRM.
function polices() {
  if (document.getElementById('cp-polices')) return;
  const l = document.createElement('link');
  l.id = 'cp-polices'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Baguet+Script&family=EB+Garamond:wght@400;600&display=swap';
  document.head.appendChild(l);
}

const quantite = (p) => [p.quantite, p.unite].filter(Boolean).join(' ');

// Les diapositives, dans l'ordre du document imprimé.
function diapos(chantier, k, dossier, version, urls) {
  const d = donnees(chantier, k, dossier);
  const postes = Array.isArray(k.postes) ? k.postes : [];
  const pieces = piecesDe(postes);
  const photosDe = (lot) => (k.photos || []).filter(p => (p.lot || '') === lot).map(p => urls[p.chemin]).filter(Boolean);
  const equipe = version === 'equipe';
  const premiere = (k.photos || []).map(p => urls[p.chemin]).find(Boolean);
  const liste = [];

  liste.push({ nom: 'Couverture', vignette: null, html: `
    <div class="cp-d cp-garde">${TACHE}
      <div class="cp-garde-bloc">
        <h1>Cahier des charges</h1>
        ${d.adresse ? `<p class="cp-adresse">${esc(d.adresse)}</p>` : ''}
        ${d.typeBien ? `<p class="cp-info">${esc(d.typeBien)}</p>` : ''}
        ${d.nature ? `<p class="cp-info">${esc(d.nature)}</p>` : ''}
        ${equipe ? '<span class="cp-equipe">Version équipe</span>' : ''}
      </div>
      <img class="cp-garde-logo" src="${LOGO}" alt="RGD Renova">
    </div>` });

  liste.push({ nom: 'Interventions', vignette: premiere, html: `
    <div class="cp-d cp-colonnes">
      <div class="cp-texte">
        <h2 class="cp-sobre">Interventions</h2>
        <div class="cp-infos">
          ${d.nom ? `<span>Client <b>${esc(d.nom)}</b></span>` : ''}
          <span>Du <b>${esc(dateLongue(chantier.date_debut))}</b> au <b>${esc(dateLongue(finDe(chantier)))}</b></span>
          <span>Durée <b>${esc(dureeLue(chantier).texte)}</b></span>
          ${k.devis_numero ? `<span>Devis <b>${esc(k.devis_numero)}</b></span>` : ''}
          ${equipe && d.telephone ? `<span>Tél. client <b>${esc(d.telephone)}</b></span>` : ''}
        </div>
        <div class="cp-tuiles">${pieces.map((lot, i) => {
          const n = postes.filter(p => (p.lot || '') === lot).length;
          const ph = photosDe(lot)[0];
          return `<button type="button" class="cp-tuile" style="--i:${i}" data-aller-piece="${esc(lot)}">
            ${ph ? `<img src="${esc(ph)}" alt="">` : '<i></i>'}<b>${esc(lot || 'Travaux')}</b><span>${n} travaux</span></button>`;
        }).join('')}</div>
      </div>
      ${premiere ? `<div class="cp-photos une"><div class="cp-cadre"><img src="${esc(premiere)}" alt=""></div></div>` : ''}
    </div>` });

  if (k.plan && urls[k.plan]) {
    liste.push({ nom: 'Plan', vignette: urls[k.plan], html: `
      <div class="cp-d"><h2 class="cp-sobre">Plan</h2><div class="cp-plan"><img src="${esc(urls[k.plan])}" alt="Plan du logement"></div></div>` });
  }

  pieces.forEach((lot, n) => {
    const l = postes.filter(p => (p.lot || '') === lot);
    const ph = photosDe(lot).slice(0, 2);
    liste.push({ nom: lot || 'Travaux', piece: lot, vignette: ph[0] || null, html: `
      <div class="cp-d cp-colonnes${ph.length ? '' : ' sans-photo'}">
        <div class="cp-texte">
          <span class="cp-num">Pièce ${n + 1} / ${pieces.length}</span>
          <h2 class="cp-piece">${esc(lot || 'Travaux')}</h2>
          <ul class="cp-travaux${equipe ? ' cases' : ''}">${l.map((p, i) => `<li style="--i:${i}">
            <div><span>${esc(p.designation)}</span>${p.detail ? `<small>${esc(p.detail)}</small>` : ''}</div>
            ${quantite(p) ? `<em>${esc(quantite(p))}</em>` : ''}</li>`).join('')}</ul>
        </div>
        ${ph.length ? `<div class="cp-photos ${ph.length > 1 ? 'deux' : 'une'}">${ph.map((u, i) =>
          `<div class="cp-cadre" style="--i:${i}"><img src="${esc(u)}" alt=""></div>`).join('')}</div>` : ''}
      </div>` });
  });

  if (equipe) {
    const bloc = (titre, l) => `<div><h3>${titre}</h3>${l.length ? `<ul class="cp-travaux cases petite">${l.map((x, i) =>
      `<li style="--i:${i}"><div><span>${esc(x.libelle)}</span></div>${x.quantite ? `<em>${esc(x.quantite)}</em>` : ''}</li>`).join('')}</ul>`
      : '<p class="cp-vide">Rien de prévu.</p>'}</div>`;
    liste.push({ nom: 'Préparation', vignette: null, html: `
      <div class="cp-d">
        <h2 class="cp-piece">Préparation</h2>
        <div class="cp-prepa">
          <div>${k.consignes ? `<h3>Consignes</h3><p class="cp-libre">${esc(k.consignes)}</p>` : ''}
            ${k.precisions ? `<h3>Convenu avec le client</h3><p class="cp-libre">${esc(k.precisions)}</p>` : ''}
            ${chantier.notes ? `<h3>Notes du chantier</h3><p class="cp-libre">${esc(chantier.notes)}</p>` : ''}
            ${!k.consignes && !k.precisions && !chantier.notes ? '<p class="cp-vide">Aucune consigne.</p>' : ''}</div>
          ${bloc('Matériaux', lignesDe(chantier.id, 'materiaux'))}
          ${bloc('Outils', lignesDe(chantier.id, 'outils'))}
        </div>
      </div>` });
  } else {
    const signe = k.signature && k.signe_le;
    liste.push({ nom: 'Bon pour accord', vignette: null, html: `
      <div class="cp-d">
        <h2 class="cp-piece">Bon pour accord</h2>
        ${k.precisions ? `<h3>À la charge du client</h3><p class="cp-libre">${esc(k.precisions)}</p>` : ''}
        <div class="cp-accord">
          <p>Je soussigné(e) déclare avoir pris connaissance du présent cahier des charges et en valider le contenu avant
            le démarrage des travaux. Il complète le devis${k.devis_numero ? ` n° ${esc(k.devis_numero)}` : ''}, qui reste seul à faire foi pour les prix.</p>
          ${signe ? `<div class="cp-signe"><img src="${k.signature}" alt="Signature"><span>Signé par <b>${esc(k.signe_par || 'le client')}</b>
            le ${esc(new Date(k.signe_le).toLocaleString('fr-FR'))}${k.signe_mode === 'a_distance' ? ' (en ligne)' : ''}</span></div>`
            : '<p class="cp-attente">En attente de la signature du client.</p>'}
        </div>
      </div>` });
  }
  return liste;
}

export async function ouvrirPresentation(chantier, k, dossier, { version = 'client' } = {}) {
  polices();
  const urls = await liensDuCahier(k);
  let v = version;
  let liste = diapos(chantier, k, dossier, v, urls);
  let i = 0;

  const ecran = document.createElement('div');
  ecran.className = 'cp-ecran';
  ecran.setAttribute('role', 'dialog');
  ecran.setAttribute('aria-label', 'Présentation du cahier des charges');
  document.body.appendChild(ecran);
  document.body.classList.add('no-scroll');

  const dessiner = () => {
    ecran.innerHTML = `
      <header class="cp-haut">
        <div class="cp-bascule" role="tablist">
          <button type="button" data-version="client" class="${v === 'client' ? 'on' : ''}">Client</button>
          <button type="button" data-version="equipe" class="${v === 'equipe' ? 'on' : ''}">Équipe</button>
        </div>
        <span class="cp-titre">${esc(chantier.titre)}</span>
        <span class="grow"></span>
        <button type="button" class="cp-btn" id="cp-pdf">Exporter en PDF</button>
        <button type="button" class="cp-btn ghost" id="cp-fermer" aria-label="Fermer">✕</button>
      </header>
      <div class="cp-scene-zone">
        <button type="button" class="cp-fleche gauche" id="cp-prec" aria-label="Diapositive précédente">‹</button>
        <div class="cp-scene"><div class="cp-diapos">${liste.map((s, n) => `<section class="cp-diapo" data-n="${n}" aria-hidden="true">${s.html}</section>`).join('')}</div></div>
        <button type="button" class="cp-fleche droite" id="cp-suiv" aria-label="Diapositive suivante">›</button>
      </div>
      <footer class="cp-bas">
        <div class="cp-progres"><i></i></div>
        <div class="cp-bande">${liste.map((s, n) => `<button type="button" class="cp-vig" data-aller="${n}" title="${esc(s.nom)}">
          ${s.vignette ? `<img src="${esc(s.vignette)}" alt="">` : '<i></i>'}<span>${esc(s.nom)}</span></button>`).join('')}</div>
      </footer>`;
    brancher();
    montrer(i, 0);
  };

  // Afficher la diapositive n : celle qui part glisse d'un côté, celle qui
  // arrive de l'autre ; ses travaux et ses photos rejouent leur entrée.
  const montrer = (n, sens) => {
    i = Math.max(0, Math.min(liste.length - 1, n));
    ecran.querySelectorAll('.cp-diapo').forEach(el => {
      const m = Number(el.dataset.n);
      el.classList.remove('avant', 'apres', 'active', 'entre-gauche', 'entre-droite');
      if (m === i) {
        el.classList.add('active', sens < 0 ? 'entre-gauche' : 'entre-droite');
        el.setAttribute('aria-hidden', 'false');
        void el.offsetWidth;                                     // relance les animations
      } else { el.classList.add(m < i ? 'avant' : 'apres'); el.setAttribute('aria-hidden', 'true'); }
    });
    ecran.querySelectorAll('.cp-vig').forEach(b => b.classList.toggle('on', Number(b.dataset.aller) === i));
    ecran.querySelector('.cp-vig.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    ecran.querySelector('.cp-progres i').style.width = `${((i + 1) / liste.length) * 100}%`;
    ecran.querySelector('#cp-prec').disabled = i === 0;
    ecran.querySelector('#cp-suiv').disabled = i === liste.length - 1;
  };

  const fermer = () => {
    document.removeEventListener('keydown', clavier);
    ecran.remove();
    if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('no-scroll');
  };
  const clavier = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); montrer(i + 1, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); montrer(i - 1, -1); }
    else if (e.key === 'Home') montrer(0, -1);
    else if (e.key === 'End') montrer(liste.length - 1, 1);
    else if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
  };
  document.addEventListener('keydown', clavier);

  function brancher() {
    ecran.querySelector('#cp-fermer').onclick = fermer;
    ecran.querySelector('#cp-prec').onclick = () => montrer(i - 1, -1);
    ecran.querySelector('#cp-suiv').onclick = () => montrer(i + 1, 1);
    ecran.querySelectorAll('[data-aller]').forEach(b => b.onclick = () => { const n = Number(b.dataset.aller); montrer(n, n < i ? -1 : 1); });
    ecran.querySelectorAll('[data-aller-piece]').forEach(b => b.onclick = () => {
      const n = liste.findIndex(s => s.piece === b.dataset.allerPiece);
      if (n >= 0) montrer(n, 1);
    });
    ecran.querySelectorAll('[data-version]').forEach(b => b.onclick = () => {
      if (b.dataset.version === v) return;
      const nom = liste[i]?.nom;
      v = b.dataset.version;
      liste = diapos(chantier, k, dossier, v, urls);
      const n = liste.findIndex(s => s.nom === nom);
      i = n >= 0 ? n : Math.min(i, liste.length - 1);
      dessiner();
    });
    ecran.querySelector('#cp-pdf').onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Préparation…';
      try { await (v === 'equipe' ? imprimerCahierOuvriers : imprimerCahierClient)(chantier, k, dossier); }
      finally { b.disabled = false; b.textContent = 'Exporter en PDF'; }
    };
    // Glisser du doigt (ou de la souris) sur la diapositive.
    const scene = ecran.querySelector('.cp-scene');
    let x0 = null;
    scene.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) x0 = e.clientX; });
    scene.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) montrer(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
  }

  dessiner();
}
