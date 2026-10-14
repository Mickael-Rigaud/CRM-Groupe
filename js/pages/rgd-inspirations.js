// La page « Inspirations » de RGD Renova (14/10/2026, Élodie : « une page pour
// que Mickael puisse montrer toutes les réalisations en rdv client pour des
// inspirations »), rangée par les catégories du site, du plus récent au plus
// ancien — voir `js/data/rgd-inspirations.js` pour les deux sources et la date.
//
// ⚠ C'EST UN ÉCRAN DE PRÉSENTATION : on l'ouvre devant un client, sur une
// tablette ou un portable. D'où les grandes vignettes et le plein écran au
// doigt comme au clavier. Les titres du site sont déjà publics ; ceux qu'on
// saisit ici s'affichent aussi devant le client — le formulaire le rappelle.
//
// ⚠ UNE INSPIRATION AJOUTÉE ICI NE PART JAMAIS SUR LE SITE (Élodie, le même
// jour). Elle se reconnaît à sa pastille « Pas sur le site » et se modifie
// d'ici ; une réalisation du site, elle, se modifie dans Réalisations.
//
// ⚠ LE PLEIN ÉCRAN N'EST PAS `openModal` : `openModal` remplace la fenêtre
// courante et pose une croix et un titre faits pour un formulaire. Ici c'est un
// calque posé sur `document.body`, retiré quand on quitte la page.
import { esc, toast, openModal, closeModal, armerCroix } from '../ui.js';
import { scope } from '../data/scope.js';
import { poserEspace } from './espace.js';
import { cadre, guard, lienPhoto } from './rgd-espace.js';
import { categoriesDesInspirations, categoriesDuSite, deposerPhotosInspiration,
  enregistrerInspiration, supprimerInspiration, lienPhotoInspiration, SEAU_INSPIRATIONS } from '../data/rgd-inspirations.js';
import { db } from '../data/db.js';

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisLisible = (m) => { const [a, n] = String(m || '').split('-'); return a && n ? `${MOIS[Number(n) - 1]} ${a}` : ''; };

// L'image d'une photo : directe pour le site, signée pour le seau privé.
// Celle du seau part SANS `src` et se remplit après (`remplirPhotos`).
const imgDe = (ph, cls = '') => ph.url
  ? `<img src="${esc(lienPhoto(ph.url))}" alt="" loading="lazy"${cls ? ` class="${cls}"` : ''}>`
  : `<img data-chemin="${esc(ph.chemin)}" alt="" loading="lazy"${cls ? ` class="${cls}"` : ''}>`;

async function remplirPhotos(hote) {
  for (const img of hote.querySelectorAll('img[data-chemin]:not([src])')) {
    try { img.src = await lienPhotoInspiration(img.dataset.chemin); }
    catch { img.classList.add('photo-ko'); img.title = 'Photo introuvable'; }
  }
}

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
      const cats = categoriesDesInspirations();

      // ---------- l'accueil : une vignette par catégorie
      const cat = cats.find(c => c.cle === state.cat);
      if (!cat) {
        state.cat = null;
        const tuiles = cats.map(c => {
          const toutes = c.projets.flatMap(p => p.photos);
          // La couverture est une photo « après » du chantier le plus récent.
          const couv = toutes.find(x => x.moment === 'apres') || toutes[0];
          return `<button type="button" class="ins-tuile" data-cat="${esc(c.cle)}">
            ${couv ? imgDe(couv) : '<span class="ins-tuile-vide">+</span>'}
            <span class="ins-tuile-txt"><b>${esc(c.nom)}</b>
              <span>${c.projets.length ? `${pluriel(c.projets.length, 'chantier')} · ${pluriel(toutes.filter(x => x.moment === 'apres').length, 'photo')}` : 'Rien encore — touchez pour ajouter'}</span></span>
          </button>`;
        }).join('');
        root.innerHTML = cadre('#/rgd/inspirations', 'Inspirations', `
          <div class="ins-barre">
            <p class="muted ins-intro">Les réalisations du site et celles ajoutées ici, du plus récent au plus ancien. Touchez une catégorie.</p>
            <span class="grow"></span>
            <button type="button" class="btn sm" id="ins-ajouter">+ Ajouter une inspiration</button>
          </div>
          <div class="ins-tuiles">${tuiles || '<div class="empty">Aucune réalisation publiée.</div>'}</div>`);
        remplirPhotos(root);
        root.querySelector('#ins-ajouter').onclick = () => formulaire(null, null);
        root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
          state.cat = b.dataset.cat;
          state.avant = false;
          draw();
          window.scrollTo?.(0, 0);
        });
        return;
      }

      // ---------- une catégorie : ses chantiers, du plus récent au plus ancien
      const garde = (ph) => state.avant || ph.moment === 'apres';
      const blocs = cat.projets.map(p => ({ p, photos: p.photos.filter(garde) }))
        // Une inspiration du CRM sans photo reste visible : on doit pouvoir la compléter.
        .filter(b => b.photos.length || b.p.source === 'crm');
      // Le plein écran parcourt toute la catégorie, d'un chantier au suivant.
      const suite = blocs.flatMap(b => b.photos);
      const nAvant = cat.projets.flatMap(p => p.photos).filter(x => x.moment === 'avant').length;
      let n = 0;
      const quand = (p) => p.date.mois
        ? `${moisLisible(p.date.mois)}${p.date.source === 'photos' ? ' (date des photos)' : p.date.source === 'mise_en_ligne' ? ' (mise en ligne)' : ''}`
        : 'date inconnue';

      root.innerHTML = cadre('#/rgd/inspirations', 'Inspirations', `
        <div class="ins-barre">
          <button type="button" class="btn ghost sm" id="ins-retour">← Toutes les catégories</button>
          <h2 class="ins-titre">${esc(cat.nom)} <span class="muted">${pluriel(blocs.length, 'chantier')}</span></h2>
          <span class="grow"></span>
          ${nAvant ? `<button type="button" class="btn ghost sm" id="ins-avant">${state.avant ? 'Masquer les « avant »' : `Voir aussi les « avant » (${nAvant})`}</button>` : ''}
          <button type="button" class="btn sm" id="ins-ajouter">+ Ajouter une inspiration</button>
        </div>
        ${blocs.map(b => `
          <section class="ins-chantier">
            <div class="ins-chantier-tete">
              <h3>${esc(b.p.titre)}</h3>
              ${b.p.source === 'crm' ? `<span class="chip amber">Pas sur le site</span>
                <button type="button" class="btn ghost sm" data-modifier="${esc(b.p.id)}">Modifier</button>` : ''}
            </div>
            <p class="small muted">${esc([quand(b.p), b.p.source === 'crm' ? b.p.ville : '', b.p.details].filter(Boolean).join(' · '))}</p>
            ${b.photos.length ? `<div class="ins-grille">${b.photos.map(ph => `
              <button type="button" class="ins-ouvrir${ph.moment === 'avant' ? ' est-avant' : ''}" data-i="${n++}" aria-label="Agrandir">
                ${imgDe(ph)}
                ${ph.moment === 'avant' ? '<span class="ins-badge">Avant</span>' : ''}
              </button>`).join('')}</div>` : '<p class="small muted">Aucune photo pour l’instant — « Modifier » pour en ajouter.</p>'}
          </section>`).join('') || `<div class="empty">${cat.projets.length ? 'Aucune photo à montrer ici.' : 'Aucune inspiration pour l’instant — « + Ajouter une inspiration » pour la première.'}</div>`}`);

      remplirPhotos(root);
      root.querySelector('#ins-retour').onclick = () => { state.cat = null; draw(); };
      root.querySelector('#ins-avant')?.addEventListener('click', () => { state.avant = !state.avant; draw(); });
      root.querySelector('#ins-ajouter').onclick = () => formulaire(null, cat.nom);
      root.querySelectorAll('[data-modifier]').forEach(b => b.onclick = () => {
        const l = db.byId('rgd_inspirations', b.dataset.modifier);
        if (l) formulaire(l, null);
      });
      root.querySelectorAll('.ins-ouvrir').forEach(b => b.onclick = () => pleinEcran(suite, Number(b.dataset.i)));
    };

    // ---------- ajouter / modifier une inspiration du CRM
    function formulaire(ligne, catDepart) {
      const site = categoriesDuSite();
      const autres = [...new Set(db.t('rgd_inspirations').map(r => r.categorie).filter(c => c && !site.includes(c)))];
      const choix = [...site, ...autres];
      const v = {
        categorie: ligne?.categorie || catDepart || choix[0] || '',
        titre: ligne?.titre || '', ville: ligne?.ville || '',
        realise_le: ligne?.realise_le || '', notes: ligne?.notes || '',
        photos: (ligne?.photos || []).map(p => ({ ...p })),
      };
      const retirees = [];   // chemins à effacer du seau, une fois l'enregistrement passé
      const nouvelles = [];  // { fichier, moment, apercu }
      const autre = v.categorie && !choix.includes(v.categorie);

      const listePhotos = () => [
        ...v.photos.map((p, i) => ({ k: 'e' + i, img: `<img data-chemin="${esc(p.chemin)}" alt="">`, moment: p.moment })),
        ...nouvelles.map((p, i) => ({ k: 'n' + i, img: `<img src="${esc(p.apercu)}" alt="">`, moment: p.moment })),
      ].map(p => `<div class="insf-photo">${p.img}
          <div class="insf-photo-pied">
            <button type="button" class="insf-moment${p.moment === 'avant' ? ' est-avant' : ''}" data-moment="${p.k}">${p.moment === 'avant' ? 'Avant' : 'Après'}</button>
            <button type="button" class="insf-retirer" data-retirer="${p.k}" aria-label="Retirer" title="Retirer">✕</button>
          </div></div>`).join('');

      openModal(ligne ? 'Modifier l’inspiration' : 'Ajouter une inspiration', `
        <form class="insf" id="insf">
          <p class="small muted">Elle n’apparaît que dans le CRM, jamais sur rgdrenova.fr. Elle s’affiche devant le client : pas de nom de client dans le titre.</p>
          <div class="insf-grille">
            <label class="mail-champ"><span>Catégorie</span>
              <select id="insf-cat">${choix.map(c => `<option${c === v.categorie ? ' selected' : ''}>${esc(c)}</option>`).join('')}
                <option value="__autre"${autre ? ' selected' : ''}>Autre catégorie…</option></select></label>
            <label class="mail-champ" id="insf-autre-l"${autre ? '' : ' hidden'}><span>Nom de la catégorie</span>
              <input id="insf-autre" value="${esc(autre ? v.categorie : '')}"></label>
            <label class="mail-champ plein"><span>Titre</span>
              <input id="insf-titre" required value="${esc(v.titre)}" placeholder="Rénovation d’une salle de bain à Senlis"></label>
            <label class="mail-champ"><span>Ville</span><input id="insf-ville" value="${esc(v.ville)}"></label>
            <label class="mail-champ"><span>Réalisée en</span><input id="insf-mois" type="month" value="${esc(v.realise_le)}"></label>
            <label class="mail-champ plein"><span>Détails (facultatif)</span>
              <textarea id="insf-notes" rows="2" placeholder="Surface, matériaux, durée…">${esc(v.notes)}</textarea></label>
          </div>
          <div class="insf-depot" id="insf-depot">
            <input type="file" id="insf-fichiers" accept="image/*" multiple hidden>
            <b>Glissez les photos ici</b> ou <button type="button" class="btn ghost sm" id="insf-choisir">choisir des fichiers</button>
            <span class="small muted">Un clic sur « Après » / « Avant » change l’étiquette de la photo.</span>
          </div>
          <div class="insf-photos" id="insf-photos">${listePhotos()}</div>
          <div class="insf-pied">
            ${ligne ? '<button type="button" class="btn ghost sm insf-suppr" id="insf-suppr">Supprimer</button>' : ''}
            <span class="grow"></span>
            <button type="button" class="btn ghost" id="insf-annuler">Annuler</button>
            <button type="submit" class="btn" id="insf-ok">${ligne ? 'Enregistrer' : 'Ajouter'}</button>
          </div>
        </form>`, { wide: true, onOpen: (m) => {
        const zone = m.querySelector('#insf-photos');
        const relire = () => {
          const c = m.querySelector('#insf-cat').value;
          v.categorie = c === '__autre' ? m.querySelector('#insf-autre').value.trim() : c;
          v.titre = m.querySelector('#insf-titre').value.trim();
          v.ville = m.querySelector('#insf-ville').value.trim();
          v.realise_le = m.querySelector('#insf-mois').value;
          v.notes = m.querySelector('#insf-notes').value.trim();
        };
        const peindre = () => {
          zone.innerHTML = listePhotos();
          remplirPhotos(zone);
          zone.querySelectorAll('[data-moment]').forEach(b => b.onclick = () => {
            const k = b.dataset.moment, liste = k[0] === 'e' ? v.photos : nouvelles, p = liste[Number(k.slice(1))];
            p.moment = p.moment === 'avant' ? 'apres' : 'avant';
            peindre();
          });
          zone.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
            const k = b.dataset.retirer, i = Number(k.slice(1));
            if (k[0] === 'e') retirees.push(v.photos.splice(i, 1)[0].chemin);
            else { URL.revokeObjectURL(nouvelles[i].apercu); nouvelles.splice(i, 1); }
            peindre();
          });
        };
        peindre();
        const ajouter = (fichiers) => {
          for (const f of fichiers) {
            if (!/^image\//.test(f.type || '')) { toast(`${f.name} n’est pas une image`, 'warn'); continue; }
            if (f.size > 25 * 1048576) { toast(`${f.name} : trop lourd (25 Mo max)`, 'warn'); continue; }
            nouvelles.push({ fichier: f, moment: 'apres', apercu: URL.createObjectURL(f) });
          }
          peindre();
        };
        const fichiers = m.querySelector('#insf-fichiers');
        m.querySelector('#insf-choisir').onclick = () => fichiers.click();
        fichiers.onchange = () => { ajouter([...fichiers.files]); fichiers.value = ''; };
        const depot = m.querySelector('#insf-depot');
        depot.addEventListener('dragover', (e) => { e.preventDefault(); depot.classList.add('survol'); });
        depot.addEventListener('dragleave', () => depot.classList.remove('survol'));
        depot.addEventListener('drop', (e) => { e.preventDefault(); depot.classList.remove('survol'); ajouter([...e.dataTransfer.files]); });
        m.querySelector('#insf-cat').onchange = (e) => { m.querySelector('#insf-autre-l').hidden = e.target.value !== '__autre'; };
        m.querySelector('#insf-annuler').onclick = () => closeModal();
        const suppr = m.querySelector('#insf-suppr');
        if (suppr) armerCroix(suppr, async () => {
          const r = await supprimerInspiration(ligne);
          if (!r.ok) return toast(`Non supprimée — ${r.motif}`, 'err');
          toast('Inspiration supprimée');
          closeModal();
          draw();
        }, { repos: 'Supprimer', arme: 'Confirmer la suppression' });

        m.querySelector('#insf').onsubmit = async (e) => {
          e.preventDefault();
          relire();
          if (!v.categorie) return toast('Il manque la catégorie', 'warn');
          if (!v.titre) return toast('Il manque le titre', 'warn');
          const ok = m.querySelector('#insf-ok');
          ok.disabled = true; ok.textContent = nouvelles.length ? 'Envoi des photos…' : 'Enregistrement…';
          let chemins = [];
          try { chemins = await deposerPhotosInspiration(nouvelles.map(p => p.fichier)); }
          catch (err) { ok.disabled = false; ok.textContent = ligne ? 'Enregistrer' : 'Ajouter'; return toast(`Photos non envoyées — ${String(err.message || err).slice(0, 100)}`, 'err'); }
          const photos = [...v.photos, ...chemins.map((chemin, i) => ({ chemin, moment: nouvelles[i].moment }))];
          const r = await enregistrerInspiration(ligne?.id, {
            categorie: v.categorie, titre: v.titre, ville: v.ville || null,
            realise_le: v.realise_le || null, notes: v.notes || null, photos,
          });
          if (!r.ok) {
            // Les photos déjà déposées ne servent à rien sans la ligne : on les retire.
            for (const c of chemins) { try { await db.deleteFile(c, { bucket: SEAU_INSPIRATIONS }); } catch { /* tant pis */ } }
            ok.disabled = false; ok.textContent = ligne ? 'Enregistrer' : 'Ajouter';
            return toast(`Non enregistrée — ${r.motif}`, 'err');
          }
          // Les photos retirées ne s'effacent qu'une fois la ligne enregistrée.
          for (const c of retirees) { try { await db.deleteFile(c, { bucket: SEAU_INSPIRATIONS }); } catch { /* déjà absente */ } }
          nouvelles.forEach(p => URL.revokeObjectURL(p.apercu));
          toast(ligne ? 'Inspiration enregistrée' : 'Inspiration ajoutée — elle n’est pas sur le site');
          closeModal();
          state.cat = v.categorie.trim().toLowerCase();
          draw();
        };
      } });
    }

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
      const montre = async () => {
        const p = liste[i], ici = i;
        cap.textContent = `${p.moment === 'avant' ? 'Avant · ' : ''}${p.projet.titre || ''}  —  ${i + 1} / ${liste.length}`;
        if (p.url) img.src = lienPhoto(p.url);
        else {
          img.removeAttribute('src');
          try { const u = await lienPhotoInspiration(p.chemin); if (ici === i) img.src = u; } catch { /* reste vide */ }
        }
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
    return { refresh: () => { if (!calque && !document.querySelector('#insf')) draw(); }, destroy() { fermer(); coquille.retirer(); } };
  },
};
