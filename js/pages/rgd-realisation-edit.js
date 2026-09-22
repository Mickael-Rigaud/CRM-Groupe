// Espace RGD Renova — modifier une réalisation publiée
//
// ⚠ ENREGISTRER ICI, C'EST PUBLIER SUR rgdrenova.fr.
// C'est le seul écran de l'espace dont l'écriture sort vers le public, et ce
// n'est pas un accident : c'est le fonctionnement voulu. On rédige, ça part.
// L'écran le dit clairement plutôt que de le déguiser en « enregistrement ».
//
// TROIS CONTRAINTES DU STOCKAGE, ET ELLES COMMANDENT TOUT LE FICHIER
//
// 1. LE DOCUMENT EST REMPLACÉ EN ENTIER. `POST /api/realisations` n'écrit pas
//    un champ, il écrase le JSON complet — 5 catégories, 31 projets. Envoyer un
//    document amputé supprimerait du site tout ce qui manque.
//
// 2. LE REFLET NE SUFFIT PAS À LE RECONSTRUIRE. `rgd_realisations` déplie le
//    JSON en lignes pour qu'on puisse le chercher et le trier, mais il n'a
//    aucune colonne pour les **descriptions des cinq catégories** — de longs
//    textes de référencement. Rebâtir le document depuis le reflet les
//    effacerait du site sans un mot. On relit donc TOUJOURS la source.
//
// 3. IL N'Y A QU'UN NIVEAU DE RETOUR ARRIÈRE. Chaque enregistrement pousse
//    l'ancien document dans `data_backup` et écrase le précédent. Deux mauvais
//    enregistrements de suite, et la bonne version n'existe plus nulle part.
//
// POURQUOI ON RELIT JUSTE AVANT D'ÉCRIRE, ET PAS SEULEMENT À L'OUVERTURE
// Le document n'a pas de numéro de version : rien n'empêche deux personnes de
// l'enregistrer en même temps, et le second écrasement gagnerait en silence.
// On relit donc la source au moment du clic et on applique les modifications
// AU DOCUMENT FRAÎCHEMENT LU, repéré par le `slug` du projet. Une correction
// faite ailleurs pendant qu'on rédigeait survit ; si le projet a disparu entre
// les deux, on s'arrête et on le dit.
import { esc, toast, openModal, closeModal } from '../ui.js';
import { lireRealisations, enregistrerRealisations, restaurerRealisations,
         deposerPhotosRealisations } from '../data/rgd-api.js';

const MAX_OCTETS = 20 * 1024 * 1024;   // la limite du worker, dite avant l'envoi
const FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

// Les champs modifiables, et RIEN D'AUTRE. `slug` et `url` n'y sont pas : le
// premier est la clé qui relie le CRM au document, le second une adresse
// WordPress que le CRM ne fabrique pas. Les changer ici casserait le lien sans
// rien changer sur le site.
const CHAMPS = [
  { cle: 'title', label: 'Titre', large: true },
  { cle: 'city', label: 'Ville' },
  { cle: 'gamme', label: 'Gamme' },
  { cle: 'surface', label: 'Surface' },
  { cle: 'duration', label: 'Durée' },
];

// Retrouver un projet dans le document, et sa catégorie. Le `slug` est la clé :
// c'est lui que le site emploie dans ses adresses, il ne bouge pas.
function trouver(doc, slug) {
  for (const cat of doc.categories || []) {
    const i = (cat.projects || []).findIndex(p => p.slug === slug);
    if (i >= 0) return { cat, i, projet: cat.projects[i] };
  }
  return null;
}

function vignettes(images) {
  if (!images.length) return '<p class="muted small">Aucune photo sur cette réalisation.</p>';
  return `<div class="rea-edit-photos">${images.map((u, i) => `
    <figure>
      <img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <figcaption>
        <span class="chip muted">${i + 1}</span>
        <button type="button" class="btn ghost sm" data-monter="${i}" ${i === 0 ? 'disabled' : ''}
          title="Remonter">↑</button>
        <button type="button" class="btn ghost sm" data-retirer="${i}" title="Retirer">✕</button>
      </figcaption>
    </figure>`).join('')}</div>`;
}

export function ouvrirEditionRealisation(slugOuProjet, apresPublication) {
  const slug = typeof slugOuProjet === 'string' ? slugOuProjet : slugOuProjet.slug;

  openModal('Modifier la réalisation', '<div class="empty">Lecture du document publié…</div>',
    { wide: true, onOpen: async (m) => {
      const corps = m.querySelector('.modal-body');
      const lu = await lireRealisations();
      if (!lu.ok) {
        corps.innerHTML = `<div class="alert"><b>!</b><div>Document illisible — ${esc(lu.motif)}.
          Rien n'a été modifié.</div></div>`;
        return;
      }
      const trouve = trouver(lu.donnees, slug);
      if (!trouve) {
        corps.innerHTML = `<div class="alert"><b>!</b><div>Cette réalisation n'existe plus dans
          le document publié. Elle a pu être retirée du site depuis le dernier relevé.</div></div>`;
        return;
      }

      // On travaille sur une COPIE. Tant qu'on n'a pas publié, rien ne doit
      // pouvoir partir — y compris si l'utilisateur ferme la modale.
      const projet = JSON.parse(JSON.stringify(trouve.projet));
      projet.images = Array.isArray(projet.images) ? projet.images.slice() : [];
      const categorieNom = trouve.cat.name || trouve.cat.slug;

      const dessiner = () => {
        corps.innerHTML = `
          <div class="alert">
            <b>!</b>
            <div><b>Enregistrer publie sur rgdrenova.fr.</b> Il n'y a pas de brouillon :
            la page <a href="${esc(projet.url || 'https://rgdrenova.fr')}" target="_blank"
            rel="noopener">de cette réalisation</a> changera dans la minute.
            Le retour arrière ne remonte que d&rsquo;<b>un seul</b> enregistrement.</div>
          </div>

          <form id="re-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
            ${CHAMPS.map(c => `<label class="reg-champ" ${c.large ? 'style="grid-column:1/-1"' : ''}>
              <span>${esc(c.label)}</span>
              <input name="${esc(c.cle)}" value="${esc(projet[c.cle] || '')}">
            </label>`).join('')}
            <label class="reg-champ" style="grid-column:1/-1">
              <span>Description</span>
              <textarea name="description" rows="7">${esc(projet.description || '')}</textarea>
            </label>
          </form>
          <p class="small muted">Catégorie : <b>${esc(categorieNom)}</b> —
          elle ne se change pas ici. L&rsquo;adresse de la page et son identifiant non plus :
          ce sont eux qui relient cette fiche au site.</p>

          <h3 style="margin-top:18px">Photos <span class="muted">(${projet.images.length})</span></h3>
          ${vignettes(projet.images)}
          <input type="file" id="re-fichiers" accept="image/*" multiple hidden>
          <div class="toolbar" style="margin-top:10px">
            <button type="button" class="btn ghost" id="re-ajouter">Ajouter des photos…</button>
            <span class="muted small">JPEG, PNG, WebP, GIF ou AVIF — 20 Mo par image.</span>
          </div>
          <p class="small muted">Une photo déposée est rangée chez Cloudflare tout de suite,
          mais elle n&rsquo;apparaît sur le site qu&rsquo;une fois la réalisation <b>publiée</b>.
          Retirer une photo la retire de cette réalisation, pas du stockage.</p>

          <div class="form-actions" style="margin-top:16px">
            <button type="button" class="btn ghost" data-close>Annuler</button>
            <button type="button" class="btn ghost" id="re-restaurer">Restaurer la version précédente…</button>
            <span class="grow"></span>
            <span class="muted small" id="re-etat"></span>
            <button type="button" class="btn primary" id="re-publier">Publier sur le site</button>
          </div>`;
        brancher();
      };

      const lireFormulaire = () => {
        const f = corps.querySelector('#re-form');
        const d = Object.fromEntries(new FormData(f).entries());
        for (const c of CHAMPS) projet[c.cle] = d[c.cle].trim();
        projet.description = d.description.trim();
      };

      const brancher = () => {
        const champ = corps.querySelector('#re-fichiers');

        corps.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
          lireFormulaire();                       // ne pas perdre la saisie en cours
          projet.images.splice(Number(b.dataset.retirer), 1);
          dessiner();
        });
        corps.querySelectorAll('[data-monter]').forEach(b => b.onclick = () => {
          lireFormulaire();
          const i = Number(b.dataset.monter);
          [projet.images[i - 1], projet.images[i]] = [projet.images[i], projet.images[i - 1]];
          dessiner();
        });

        corps.querySelector('#re-ajouter').onclick = () => { champ.value = ''; champ.click(); };
        champ.onchange = async () => {
          const fichiers = [...champ.files];
          if (!fichiers.length) return;
          // Le worker refuse TOUT LE LOT si une image cloche : on le dit ici,
          // avant l'envoi, pour ne pas faire monter 40 Mo pour rien.
          for (const f of fichiers) {
            const t = (f.type || '').toLowerCase();
            if (t && !FORMATS.includes(t)) { toast(`« ${f.name} » n’est pas une image acceptée.`, 'err'); return; }
            if (f.size > MAX_OCTETS) { toast(`« ${f.name} » dépasse 20 Mo.`, 'err'); return; }
          }
          lireFormulaire();
          const etat = corps.querySelector('#re-etat');
          etat.textContent = `Dépôt de ${fichiers.length} photo${fichiers.length > 1 ? 's' : ''}…`;
          const r = await deposerPhotosRealisations(fichiers);
          etat.textContent = '';
          if (!r.ok) {
            toast(r.motif === 'pas-de-compte'
              ? 'Aucun compte RGD à votre adresse : rien n’a été déposé.'
              : `Dépôt refusé — ${r.motif}`, 'err');
            return;
          }
          projet.images.push(...(r.donnees?.urls || []));
          toast(`${fichiers.length} photo${fichiers.length > 1 ? 's ajoutées' : ' ajoutée'} — à publier pour la voir en ligne`);
          dessiner();
        };

        // LE GARDE-FOU TIENT EN DEUX CLICS SUR LE MÊME BOUTON, pas dans une
        // seconde modale : `confirm()` du CRM appelle `closeModal(true)` et
        // REMPLACE celle-ci. On perdrait la saisie en cours pour demander
        // « êtes-vous sûr ? », et un refus laisserait l'écran vide.
        const restaurer = corps.querySelector('#re-restaurer');
        let arme = false;
        restaurer.onclick = async () => {
          if (!arme) {
            arme = true;
            restaurer.classList.add('danger');
            restaurer.textContent = 'Confirmer le retour arrière';
            corps.querySelector('#re-etat').textContent =
              'Annule le dernier enregistrement, sur TOUTES les réalisations. Pas de second retour.';
            return;
          }
          restaurer.disabled = true;
          const r = await restaurerRealisations();
          if (!r.ok) {
            restaurer.disabled = false; arme = false;
            restaurer.classList.remove('danger');
            restaurer.textContent = 'Restaurer la version précédente…';
            corps.querySelector('#re-etat').textContent = '';
            toast(r.motif === 'pas-de-compte'
              ? 'Aucun compte RGD à votre adresse : rien n’a été restauré.'
              : `Restauration impossible — ${r.motif}`, 'err');
            return;
          }
          closeModal();
          toast('Version précédente rétablie sur le site');
          apresPublication?.();
        };

        corps.querySelector('#re-publier').onclick = async (e) => {
          lireFormulaire();
          if (!projet.title) { toast('Le titre ne peut pas être vide : c’est lui qui s’affiche sur le site.', 'err'); return; }
          const b = e.currentTarget;
          const etat = corps.querySelector('#re-etat');

          b.disabled = true;
          etat.textContent = 'Relecture du document…';
          // ⚠ ON RELIT MAINTENANT, pas à l'ouverture. Quelqu'un a pu publier
          // pendant qu'on rédigeait ; repartir du document lu tout à l'heure
          // annulerait son travail sans que personne le voie.
          const frais = await lireRealisations();
          if (!frais.ok) {
            b.disabled = false; etat.textContent = '';
            toast(`Document illisible — ${frais.motif}. Rien n’a été publié.`, 'err');
            return;
          }
          const cible = trouver(frais.donnees, slug);
          if (!cible) {
            b.disabled = false; etat.textContent = '';
            toast('Cette réalisation a disparu du document entre-temps : rien n’a été publié.', 'err');
            return;
          }
          // On repose nos champs sur la version fraîche, sans toucher au reste
          // du projet (photo_tags, ba_pairs, testimonial, notes…) ni aux
          // trente autres.
          cible.cat.projects[cible.i] = { ...cible.projet, ...projet };

          etat.textContent = 'Publication…';
          const r = await enregistrerRealisations(frais.donnees);
          b.disabled = false; etat.textContent = '';
          if (!r.ok) {
            toast(r.motif === 'pas-de-compte'
              ? 'Aucun compte RGD à votre adresse : rien n’a été publié.'
              : `Non publié — ${r.motif}`, 'err');
            return;
          }
          closeModal();
          toast('Publié sur rgdrenova.fr — visible ici au prochain relevé');
          apresPublication?.();
        };
      };

      dessiner();
    } });
}
