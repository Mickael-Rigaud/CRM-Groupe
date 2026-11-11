// La présentation du cahier des charges, PIÈCE PAR PIÈCE, à l'écran
// (11/11/2026, Élodie : « quelque chose pièce par pièce, une présentation
// moderne et dynamique sur le CRM, que l'on puisse exporter en PDF pour les
// ouvriers et les clients »).
//
// ⚠ LE VISUEL EST LA « PISTE A » (plein cadre), choisie par Élodie parmi trois
// après avoir refusé la première présentation. Les diapositives elles-mêmes
// vivent dans `rgd-cahier-diapos.js`, partagées avec le PDF : ce module-ci
// n'est que la visionneuse — plein écran, une diapositive à la fois, passage
// aux flèches, au clavier, en glissant du doigt, ou par la bande de vignettes,
// bascule Client / Équipe, et « Exporter en PDF ».
import { esc } from '../ui.js';
import { liensDuCahier } from '../data/rgd-cahier.js';
import { imprimerCahierClient, imprimerCahierOuvriers } from './rgd-cahier-doc.js';
import { diapos, STYLE_DIAPOS, STYLE_ANIMATIONS, POLICES } from './rgd-cahier-diapos.js';

// Les polices et le style des diapositives, posés une fois dans le CRM.
function preparer() {
  if (!document.getElementById('cp-polices')) {
    const l = document.createElement('link');
    l.id = 'cp-polices'; l.rel = 'stylesheet'; l.href = POLICES;
    document.head.appendChild(l);
  }
  if (!document.getElementById('cp-style-diapos')) {
    const s = document.createElement('style');
    s.id = 'cp-style-diapos';
    s.textContent = STYLE_DIAPOS + STYLE_ANIMATIONS;
    document.head.appendChild(s);
  }
}

export async function ouvrirPresentation(chantier, k, dossier, { version = 'client' } = {}) {
  preparer();
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
        <div class="cp-scene"><div class="cp-diapos">${liste.map((s, n) =>
          `<section class="cp-diapo" data-n="${n}" aria-hidden="true">${s.html}</section>`).join('')}</div></div>
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

  // Afficher la diapositive n : celle qui part s'efface, celle qui arrive
  // glisse ; ses travaux, sa photo et son numéro rejouent leur entrée.
  const montrer = (n, sens) => {
    i = Math.max(0, Math.min(liste.length - 1, n));
    ecran.querySelectorAll('.cp-diapo').forEach(el => {
      const m = Number(el.dataset.n);
      el.classList.remove('avant', 'apres', 'active');
      if (m === i) {
        el.classList.add('active');
        el.setAttribute('aria-hidden', 'false');
        void el.offsetWidth;
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
