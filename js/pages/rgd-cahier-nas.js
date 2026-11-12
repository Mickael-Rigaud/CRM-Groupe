// Importer les photos d'un chantier depuis le NAS (12/11/2026, Élodie :
// « pour les photos, il y a moyen de les récupérer sur la NAS ? Dans RGD
// Renova > Les chantiers > Chantiers en attente ou Chantiers en cours »).
//
// ⚠ LE CRM NE VOIT PAS LE NAS, ET C'EST NORMAL : c'est un site internet, le
// NAS (\\192.168.1.110, lecteur R: sur les PC) n'existe que sur le réseau du
// bureau. C'est donc LE PC qui ouvre le dossier : on choisit le dossier du
// client (« 1- Chantiers en cours › DELONG - … »), le navigateur en lit les
// photos — sous-dossiers compris, vidéos et documents ignorés — et rien ne
// quitte le PC tant qu'on n'a pas cliqué « Ajouter ». Depuis un téléphone,
// pas de NAS : on garde « + Photo » dans chaque pièce.
//
// Mesuré le 12/11/2026 sur le NAS : environ 1 200 photos dans « Devis en
// attente », « Chantiers en cours » et « Chantiers en attente », toutes en
// JPEG (aucun HEIC), de 2 à 3 Mo ; elles sont réduites avant l'envoi
// (`ajouterPhotos`).
//
// La galerie : à gauche les pièces du cahier (et le plan) ; on en choisit une,
// puis on clique les photos qui vont avec. Un second clic retire la photo.
import { esc, toast } from '../ui.js';

const IMAGE = /\.(jpe?g|png|webp)$/i;

/**
 * Ouvre le choix du dossier, puis la galerie.
 * ⚠ À APPELER DIRECTEMENT DANS LE CLIC : le navigateur n'ouvre un sélecteur de
 * dossier qu'en réponse immédiate à un geste de l'utilisateur.
 *
 * @param pieces    les noms des pièces du cahier
 * @param envoyer   async (lot, fichiers) => …   ajoute des photos à une pièce
 * @param poserPlan async (fichier) => …         pose le plan du logement
 * @param apres     () => …                      redessine le cahier
 */
export function importerDepuisNas({ pieces, envoyer, poserPlan, apres }) {
  const choix = document.createElement('input');
  choix.type = 'file';
  choix.webkitdirectory = true;
  choix.multiple = true;
  choix.style.display = 'none';
  document.body.appendChild(choix);
  choix.onchange = () => {
    const tous = [...choix.files];
    choix.remove();
    const photos = tous.filter(f => IMAGE.test(f.name)).sort((a, b) =>
      (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'fr', { numeric: true }));
    if (!photos.length) { toast('Aucune photo dans ce dossier.', 'error'); return; }
    galerie(photos, { pieces, envoyer, poserPlan, apres });
  };
  choix.click();
}

// La « pièce » du plan. ⚠ PAS DE CARACTÈRE NUL : il passe par un attribut
// HTML (`data-piece`), où le navigateur le remplace — la comparaison ratait.
const PLAN = '__plan__';

function galerie(photos, { pieces, envoyer, poserPlan, apres }) {
  const dossier = (photos[0].webkitRelativePath || '').split('/')[0] || 'Dossier';
  const urls = photos.map(f => URL.createObjectURL(f));
  const affecte = new Map();                     // index de la photo → pièce
  let active = pieces[0] ?? PLAN;
  let envoi = false;

  // Les photos rangées par sous-dossier, comme sur le NAS.
  const groupes = new Map();
  photos.forEach((f, i) => {
    const parts = (f.webkitRelativePath || f.name).split('/');
    const sous = parts.slice(1, -1).join(' › ') || 'Dossier principal';
    if (!groupes.has(sous)) groupes.set(sous, []);
    groupes.get(sous).push(i);
  });

  const ecran = document.createElement('div');
  ecran.className = 'cn-ecran';
  document.body.appendChild(ecran);
  document.body.classList.add('no-scroll');

  const nomDe = (lot) => (lot === PLAN ? 'Plan du logement' : (lot || 'Travaux'));
  const compte = (lot) => [...affecte.values()].filter(x => x === lot).length;

  const fermer = () => {
    urls.forEach(u => URL.revokeObjectURL(u));
    ecran.remove();
    if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', clavier);
  };
  const clavier = (e) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); fermer(); } };
  document.addEventListener('keydown', clavier);

  const dessiner = () => {
    const total = affecte.size;
    ecran.innerHTML = `
      <header class="cn-haut">
        <div><b>${esc(dossier)}</b><span>${photos.length} photo${photos.length > 1 ? 's' : ''} sur le NAS · ${total} choisie${total > 1 ? 's' : ''}</span></div>
        <span class="grow"></span>
        <button type="button" class="btn ghost" id="cn-annuler"${envoi ? ' disabled' : ''}>Annuler</button>
        <button type="button" class="btn primary" id="cn-ok"${!total || envoi ? ' disabled' : ''}>${envoi ? esc(envoi) : `Ajouter ${total || ''} photo${total > 1 ? 's' : ''} au cahier`}</button>
      </header>
      <div class="cn-corps">
        <aside class="cn-pieces">
          <p class="cn-aide">Choisissez une pièce, puis cliquez ses photos. Deux par pièce sont présentées ; le plan n’en prend qu’une.</p>
          ${[...pieces, PLAN].map(lot => `<button type="button" class="cn-piece${lot === active ? ' on' : ''}" data-piece="${esc(lot)}">
            <span>${esc(nomDe(lot))}</span><em>${compte(lot) || ''}</em></button>`).join('')}
        </aside>
        <div class="cn-photos">${[...groupes].map(([sous, idx]) => `
          <section><h3>${esc(sous)} <span>${idx.length}</span></h3>
            <div class="cn-grille">${idx.map(i => {
              const lot = affecte.get(i);
              return `<button type="button" class="cn-photo${lot !== undefined ? ' prise' : ''}${lot === active ? ' ici' : ''}" data-i="${i}" title="${esc(photos[i].name)}">
                <img src="${urls[i]}" alt="" loading="lazy" decoding="async">${lot !== undefined ? `<span class="cn-badge">${esc(nomDe(lot))}</span>` : ''}</button>`;
            }).join('')}</div></section>`).join('')}</div>
      </div>`;
    brancher();
  };

  function brancher() {
    ecran.querySelector('#cn-annuler').onclick = () => { if (!envoi) fermer(); };
    ecran.querySelectorAll('[data-piece]').forEach(b => b.onclick = () => { active = b.dataset.piece; dessiner(); });
    ecran.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      if (envoi) return;
      const i = Number(b.dataset.i);
      if (affecte.get(i) === active) affecte.delete(i);
      else {
        // Le plan est unique : en choisir un autre remplace le premier.
        if (active === PLAN) for (const [j, l] of affecte) if (l === PLAN) affecte.delete(j);
        affecte.set(i, active);
      }
      // Garder la position de défilement pendant le redessin.
      const zone = ecran.querySelector('.cn-photos'); const y = zone.scrollTop;
      dessiner(); ecran.querySelector('.cn-photos').scrollTop = y;
    });
    ecran.querySelector('#cn-ok').onclick = async () => {
      const parPiece = new Map();
      for (const [i, lot] of affecte) { if (!parPiece.has(lot)) parPiece.set(lot, []); parPiece.get(lot).push(photos[i]); }
      const total = affecte.size;
      let faits = 0;
      try {
        for (const [lot, fichiers] of parPiece) {
          envoi = `Envoi ${faits + 1}/${total}…`; dessiner();
          if (lot === PLAN) { await poserPlan(fichiers[0]); faits += 1; continue; }
          // Une à une : la barre avance, et une erreur ne perd pas les précédentes.
          for (const f of fichiers) {
            envoi = `Envoi ${faits + 1}/${total}…`; dessiner();
            await envoyer(lot, [f]); faits += 1;
          }
        }
        toast(`${faits} photo${faits > 1 ? 's' : ''} ajoutée${faits > 1 ? 's' : ''} au cahier`);
        envoi = false; fermer(); apres?.();
      } catch (e) {
        envoi = false;
        toast(`${faits} photo${faits > 1 ? 's' : ''} ajoutée${faits > 1 ? 's' : ''}, puis : ${e.message}`, 'error');
        fermer(); apres?.();
      }
    };
  }

  dessiner();
}
