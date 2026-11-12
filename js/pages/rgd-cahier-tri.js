// « Trier les photos » du cahier des charges (12/11/2026, Élodie, après le
// premier tri automatique sur PRIE : « ce n'est pas totalement correct, je
// voudrais avoir la possibilité de changer et d'affilier une photo à une
// autre pièce »).
//
// Plein écran : une colonne par pièce, puis la RÉSERVE — les photos que le
// NAS a regardées sans les retenir (voir `RESERVE` dans data/rgd-cahier.js).
// On clique une photo, puis la pièce où elle va (ou on la fait glisser à la
// souris). « ★ » la met en tête de sa pièce : seules les deux premières de
// chaque pièce s'impriment et se montrent au client. « ✕ » la renvoie en
// réserve (ou la supprime si c'était une photo ajoutée à la main).
//
// Chaque geste est enregistré aussitôt : il n'y a pas de bouton « valider »
// à oublier en partant.
import { esc, toast } from '../ui.js';
import { cahierDe, liensDuCahier, remplacerPhotos, retirerPhoto, ajouterPhotos, RESERVE } from '../data/rgd-cahier.js';

const PAR_PAGE = 2;                               // photos imprimées par pièce

// ⚠ AJOUTER DES PHOTOS ET DES PIÈCES D'ICI (12/11/2026, Élodie : « quand on
// fait trier photos je voudrais avoir accès directement au dossier sur le NAS
// pour ajouter des photos si je le souhaite et des pièces si je le souhaite
// aussi »). Tout le dossier NAS arrive en Réserve (voir crm-photos-nas) ;
// « + Photos » sur une pièce ouvre en plus le sélecteur de fichiers du PC —
// sur un PC du bureau, le lecteur R: du NAS y est. « + Ajouter une pièce »
// crée une colonne ; `ajouterPiece` la transmet au cahier (pièce sans poste :
// elle s'imprime dès qu'on lui donne un travail).
export async function trierPhotos(chantier, k, pieces, apres, { ajouterPiece } = {}) {
  let photos = (k.photos || []).map(p => ({ ...p }));
  let urls = await liensDuCahier(k);
  pieces = [...pieces];
  let envoi = '';                                  // la pièce dont les photos partent
  let choisie = null;                              // chemin de la photo sélectionnée
  let enCours = false;

  const ecran = document.createElement('div');
  ecran.className = 'ct-ecran';
  document.body.appendChild(ecran);
  document.body.classList.add('no-scroll');
  const colonnes = () => [...pieces, RESERVE];
  const nom = (lot) => (lot === RESERVE ? 'Réserve' : (lot || 'Travaux'));

  const fermer = () => {
    document.removeEventListener('keydown', clavier);
    ecran.remove();
    if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('no-scroll');
    apres?.();
  };
  const clavier = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (choisie) { choisie = null; dessiner(); } else fermer(); } };
  document.addEventListener('keydown', clavier);

  // Enregistrer le nouvel ordre / les nouvelles pièces.
  const enregistrer = async (nouvelles) => {
    if (enCours) return;
    enCours = true;
    const avant = photos;
    photos = nouvelles; dessiner();
    try {
      k = await remplacerPhotos(k, photos);
      k = cahierDe(chantier.id) || k;
    } catch (e) {
      photos = avant; toast(e.message, 'error'); dessiner();
    } finally { enCours = false; }
  };

  // Déplacer une photo vers une pièce (à la fin de cette pièce).
  const deplacer = (chemin, lot) => {
    const p = photos.find(x => x.chemin === chemin);
    if (!p || (p.lot || '') === lot) { choisie = null; dessiner(); return; }
    const reste = photos.filter(x => x.chemin !== chemin);
    choisie = null;
    enregistrer([...reste, { ...p, lot }]);
  };
  const enTete = (chemin) => {
    const p = photos.find(x => x.chemin === chemin);
    if (!p) return;
    choisie = null;
    enregistrer([p, ...photos.filter(x => x.chemin !== chemin)]);
  };
  const retirer = async (chemin) => {
    const p = photos.find(x => x.chemin === chemin);
    if (!p) return;
    choisie = null;
    if (p.source === 'nas') { deplacer(chemin, RESERVE); return; }   // une photo du NAS retourne en réserve
    if (enCours) return;
    enCours = true;
    try { k = await retirerPhoto(k, chemin); k = cahierDe(chantier.id) || k; photos = (k.photos || []).map(x => ({ ...x })); }
    catch (e) { toast(e.message, 'error'); }
    finally { enCours = false; dessiner(); }
  };

  const carte = (p, rang) => `<div class="ct-photo${p.chemin === choisie ? ' choisie' : ''}${p.lot !== RESERVE && rang < PAR_PAGE ? ' imprimee' : ''}"
      draggable="true" data-chemin="${esc(p.chemin)}">
      <img src="${esc(urls[p.chemin] || '')}" alt="" loading="lazy" decoding="async">
      ${p.lot !== RESERVE && rang < PAR_PAGE ? '<span class="ct-badge">Imprimée</span>' : ''}
      ${p.lot === RESERVE && p.suggestion ? `<span class="ct-sug" title="Pièce proposée par l’IA">${esc(p.suggestion)}</span>` : ''}
      <div class="ct-actions">
        ${p.lot !== RESERVE && rang > 0 ? '<button type="button" data-tete title="Mettre en premier">★</button>' : ''}
        <button type="button" data-retirer title="${p.source === 'nas' ? 'Renvoyer en réserve' : 'Retirer la photo'}">✕</button>
      </div>
    </div>`;

  const dessiner = () => {
    const nbReserve = photos.filter(p => p.lot === RESERVE).length;
    ecran.innerHTML = `
      <header class="ct-haut">
        <div><b>Trier les photos — ${esc(chantier.titre)}</b>
          <span>${choisie ? 'Cliquez maintenant la pièce où va la photo (Échap pour annuler).'
            : 'Cliquez une photo, puis sa pièce — ou faites-la glisser. Les 2 premières de chaque pièce s’impriment ; ★ met une photo en tête.'}</span></div>
        <span class="grow"></span>
        <button type="button" class="btn ghost" id="ct-piece">+ Ajouter une pièce</button>
        <button type="button" class="btn primary" id="ct-fermer">Terminé</button>
      </header>
      <div class="ct-colonnes">${colonnes().map(lot => {
        const l = photos.filter(p => (p.lot || '') === lot);
        return `<section class="ct-col${lot === RESERVE ? ' reserve' : ''}${choisie ? ' cible' : ''}" data-lot="${esc(lot)}">
          <h3><span>${esc(nom(lot))}</span><em>${l.length}</em></h3>
          ${lot === RESERVE ? `<p class="ct-aide">Tout le dossier du NAS, sauf ce qui est déjà dans les pièces. Rien ici ne s’imprime.</p>`
            : `<label class="btn ghost sm ct-ajout">${envoi === lot ? 'Envoi…' : '+ Photos'}<input type="file" accept="image/*" multiple hidden data-ajout="${esc(lot)}"></label>`}
          <div class="ct-liste">${l.map((p, i) => carte(p, i)).join('') || `<p class="ct-vide">${lot === RESERVE ? 'Aucune photo en réserve.' : 'Aucune photo : cliquez une photo puis ici.'}</p>`}</div>
        </section>`;
      }).join('')}</div>
      ${nbReserve === 0 && !photos.length ? '<p class="ct-vide grand">Aucune photo dans ce cahier pour l’instant.</p>' : ''}`;
    brancher();
  };

  function brancher() {
    ecran.querySelector('#ct-fermer').onclick = fermer;
    ecran.querySelector('#ct-piece').onclick = () => {
      const n = (prompt('Nom de la nouvelle pièce (par exemple « Cellier ») :') || '').trim();
      if (!n) return;
      if (pieces.includes(n)) { toast('Cette pièce existe déjà.', 'error'); return; }
      pieces.push(n);
      ajouterPiece?.(n);
      dessiner();
      ecran.querySelector('.ct-colonnes').scrollLeft = 1e6;
    };
    ecran.querySelectorAll('input[data-ajout]').forEach(inp => inp.onchange = async () => {
      const fichiers = [...inp.files];
      const lot = inp.dataset.ajout;
      if (!fichiers.length || enCours) return;
      enCours = true; envoi = lot; dessiner();
      try {
        k = await ajouterPhotos(k, lot, fichiers);
        k = cahierDe(chantier.id) || k;
        photos = (k.photos || []).map(x => ({ ...x }));
        urls = await liensDuCahier(k);
        toast(`${fichiers.length} photo${fichiers.length > 1 ? 's' : ''} ajoutée${fichiers.length > 1 ? 's' : ''}`);
      } catch (e) { toast(e.message, 'error'); }
      finally { enCours = false; envoi = ''; dessiner(); }
    });
    ecran.querySelectorAll('.ct-photo').forEach(el => {
      const chemin = el.dataset.chemin;
      el.onclick = (e) => {
        if (e.target.closest('[data-tete]')) { enTete(chemin); return; }
        if (e.target.closest('[data-retirer]')) { retirer(chemin); return; }
        choisie = choisie === chemin ? null : chemin;
        dessiner();
      };
      el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', chemin); e.dataTransfer.effectAllowed = 'move'; el.classList.add('glisse'); };
      el.ondragend = () => el.classList.remove('glisse');
    });
    ecran.querySelectorAll('.ct-col').forEach(col => {
      col.onclick = (e) => {
        if (!choisie || e.target.closest('.ct-photo')) return;
        deplacer(choisie, col.dataset.lot);
      };
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('survol'); };
      col.ondragleave = () => col.classList.remove('survol');
      col.ondrop = (e) => {
        e.preventDefault(); col.classList.remove('survol');
        const chemin = e.dataTransfer.getData('text/plain');
        if (chemin) deplacer(chemin, col.dataset.lot);
      };
    });
  }

  dessiner();
}
