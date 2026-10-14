// La page « Inspirations » de RGD Renova (14/10/2026, Élodie : « une page pour
// que Mickael puisse montrer toutes les réalisations en rdv client pour des
// inspirations »), rangée par les catégories du site (`rgd-inspirations.js`).
//
// ⚠ C'EST UN ÉCRAN DE PRÉSENTATION, PAS UN ÉCRAN DE TRAVAIL : on l'ouvre devant
// un client, sur une tablette ou un portable. D'où les grandes vignettes, rien
// à modifier, et le plein écran au doigt comme au clavier. Les titres sont ceux
// du site, donc déjà publics : aucun nom de client n'y figure.
//
// ⚠ LE PLEIN ÉCRAN N'EST PAS `openModal` : `openModal` remplace la fenêtre
// courante et pose une croix et un titre faits pour un formulaire. Ici c'est un
// calque posé sur `document.body`, retiré quand on quitte la page.
import { esc } from '../ui.js';
import { scope } from '../data/scope.js';
import { poserEspace } from './espace.js';
import { cadre, guard, lienPhoto } from './rgd-espace.js';
import { categoriesDesRealisations } from '../data/rgd-inspirations.js';

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export const rgdInspirationsPage = {
  title: () => 'RGD Renova — Inspirations',
  render(root) {
    if (guard(root)) return {};
    // Direction seule, comme tout le groupe « Communication » : l'entrée sort
    // du menu des autres, et l'adresse tapée à la main ne l'ouvre pas non plus.
    if (!scope.isDirection) {
      root.innerHTML = '<div class="card"><div class="empty">Les inspirations sont réservées à la direction.</div></div>';
      return {};
    }
    const coquille = poserEspace(root);
    const state = { cat: null, avant: false };
    let calque = null;

    const draw = () => {
      const cats = categoriesDesRealisations();

      // ---------- l'accueil : une vignette par catégorie du site
      const cat = cats.find(c => c.cle === state.cat);
      if (!cat) {
        state.cat = null;
        const tuiles = cats.map(c => {
          const toutes = c.projets.flatMap(p => p.photos);
          // La couverture est une photo « après » : c'est le résultat qu'on montre.
          const couv = toutes.find(x => x.moment === 'apres') || toutes[0];
          return `<button type="button" class="ins-tuile" data-cat="${esc(c.cle)}">
            <img src="${esc(lienPhoto(couv.url))}" alt="" loading="lazy">
            <span class="ins-tuile-txt"><b>${esc(c.nom)}</b>
              <span>${pluriel(c.projets.length, 'chantier')} · ${pluriel(toutes.filter(x => x.moment === 'apres').length, 'photo')}</span></span>
          </button>`;
        }).join('');
        root.innerHTML = cadre('#/rgd/inspirations', 'Inspirations', `
          <p class="muted ins-intro">Les réalisations du site, rangées comme sur rgdrenova.fr. Touchez une catégorie pour voir ses chantiers.</p>
          <div class="ins-tuiles">${tuiles || '<div class="empty">Aucune réalisation publiée.</div>'}</div>`);
        root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
          state.cat = b.dataset.cat;
          state.avant = false;
          draw();
          window.scrollTo?.(0, 0);
        });
        return;
      }

      // ---------- une catégorie : ses chantiers, l'un sous l'autre
      // Les « après » d'abord ; les « avant » seulement si on les demande.
      const garde = (ph) => state.avant || ph.moment === 'apres';
      const blocs = cat.projets.map(p => ({ r: p.r, photos: p.photos.filter(garde) })).filter(b => b.photos.length);
      // Le plein écran parcourt toute la catégorie, d'un chantier au suivant.
      const suite = blocs.flatMap(b => b.photos);
      const nAvant = cat.projets.flatMap(p => p.photos).filter(x => x.moment === 'avant').length;
      let n = 0;

      root.innerHTML = cadre('#/rgd/inspirations', 'Inspirations', `
        <div class="ins-barre">
          <button type="button" class="btn ghost sm" id="ins-retour">← Toutes les catégories</button>
          <h2 class="ins-titre">${esc(cat.nom)} <span class="muted">${pluriel(blocs.length, 'chantier')}</span></h2>
          <span class="grow"></span>
          ${nAvant ? `<button type="button" class="btn ghost sm" id="ins-avant">${state.avant ? 'Masquer les « avant »' : `Voir aussi les « avant » (${nAvant})`}</button>` : ''}
        </div>
        ${blocs.map(b => `
          <section class="ins-chantier">
            <h3>${esc(b.r.titre || b.r.ville || 'Chantier')}</h3>
            ${[b.r.surface, b.r.duree].filter(Boolean).length ? `<p class="small muted">${esc([b.r.surface, b.r.duree].filter(Boolean).join(' · '))}</p>` : ''}
            <div class="ins-grille">${b.photos.map(ph => `
              <button type="button" class="ins-ouvrir${ph.moment === 'avant' ? ' est-avant' : ''}" data-i="${n++}" aria-label="Agrandir">
                <img src="${esc(lienPhoto(ph.url))}" alt="" loading="lazy">
                ${ph.moment === 'avant' ? '<span class="ins-badge">Avant</span>' : ''}
              </button>`).join('')}</div>
          </section>`).join('') || '<div class="empty">Aucune photo à montrer ici.</div>'}`);

      root.querySelector('#ins-retour').onclick = () => { state.cat = null; draw(); };
      root.querySelector('#ins-avant')?.addEventListener('click', () => { state.avant = !state.avant; draw(); });
      root.querySelectorAll('.ins-ouvrir').forEach(b => b.onclick = () => pleinEcran(suite, Number(b.dataset.i)));
    };

    // ---------- le plein écran : flèches, clavier, glisser du doigt
    function pleinEcran(liste, depart) {
      fermer();
      let i = depart;
      calque = document.createElement('div');
      calque.className = 'ins-plein';
      calque.innerHTML = `
        <button type="button" class="ins-plein-fermer" aria-label="Fermer">✕</button>
        <button type="button" class="ins-plein-nav prec" aria-label="Précédente">‹</button>
        <figure><img alt=""><figcaption></figcaption></figure>
        <button type="button" class="ins-plein-nav suiv" aria-label="Suivante">›</button>`;
      const img = calque.querySelector('img');
      const cap = calque.querySelector('figcaption');
      const montre = () => {
        const p = liste[i];
        img.src = lienPhoto(p.url);
        cap.textContent = `${p.moment === 'avant' ? 'Avant · ' : ''}${p.projet.titre || p.projet.ville || ''}  —  ${i + 1} / ${liste.length}`;
      };
      const aller = (d) => { i = (i + d + liste.length) % liste.length; montre(); };
      calque.querySelector('.prec').onclick = (e) => { e.stopPropagation(); aller(-1); };
      calque.querySelector('.suiv').onclick = (e) => { e.stopPropagation(); aller(1); };
      calque.querySelector('.ins-plein-fermer').onclick = fermer;
      calque.onclick = (e) => { if (e.target === calque) fermer(); };
      let x0 = null;
      calque.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      calque.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 40) aller(dx < 0 ? 1 : -1);
      });
      calque._clavier = (e) => {
        if (e.key === 'ArrowRight') aller(1);
        else if (e.key === 'ArrowLeft') aller(-1);
        else if (e.key === 'Escape') fermer();
      };
      document.addEventListener('keydown', calque._clavier);
      document.body.appendChild(calque);
      montre();
    }
    function fermer() {
      if (!calque) return;
      document.removeEventListener('keydown', calque._clavier);
      calque.remove();
      calque = null;
    }

    draw();
    return { refresh: () => { if (!calque) draw(); }, destroy() { fermer(); coquille.retirer(); } };
  },
};
