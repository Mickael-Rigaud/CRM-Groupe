// Espace RGD Renova — réalisations et carrousel
//
// ÉTAPE 4 DE LA MIGRATION, RANG 5 — en écriture depuis le 22/09/2026, et
// c'est le SEUL écran de l'espace dont l'écriture sort vers le public.
// L'atelier complet vit dans `js/pages/rgd-realisation-edit.js`, celui du
// carrousel dans `js/pages/rgd-carrousel-edit.js` : lire les contraintes de
// stockage en tête de ces fichiers avant d'y toucher.
//
// CE QUE CET ÉCRAN MONTRE, ET À QUI IL SERT
// Les 31 chantiers publiés sur rgdrenova.fr, avec leur ville, leur surface et
// leur durée. C'est à la fois la bibliothèque de références — quelqu'un
// au téléphone avec un prospect de Chantilly doit trouver en dix secondes une
// salle de bain faite à Chantilly — et l'endroit d'où l'on met une nouvelle
// réalisation en ligne.
//
// D'OÙ VIENT LE DÉCOUPAGE EN LIGNES
// Côté base, tout ça tient dans UNE ligne : un document JSON. C'est la RPC de
// publication qui le déplie en projets et en images. Un blob ne se cherche pas,
// ne se compte pas, ne se trie pas ; une table, si. Le découpage suit la
// structure du JSON, il n'en invente pas.
//
// LA LISTE LIT LE REFLET, L'ATELIER LIT LA SOURCE — ET C'EST VOULU
// La liste se cherche, se trie, se filtre : elle a besoin de lignes, donc du
// reflet. L'atelier, lui, republie le document entier : il ne peut pas partir
// d'un reflet qui a perdu les descriptions de catégories. Il relit la source à
// l'ouverture, et une seconde fois au moment de publier.
//
// ⚠ LES AVERTISSEMENTS « CECI PUBLIE SUR rgdrenova.fr » ONT TOUS ÉTÉ RETIRÉS
// LE 23/09/2026, sur demande — le bandeau de cet écran d'abord, puis ceux des
// deux ateliers. Ne pas les remettre. Ce que le bouton dit suffit : il
// s'appelle « Publier sur le site », pas « Enregistrer ». Un avertissement
// qu'on voit à chaque ouverture cesse d'être lu, et il finissait par occuper
// le haut de l'écran pour répéter ce que l'intitulé du bouton annonce.
// Ce qui ne se devine PAS reste écrit, à l'endroit concerné : le retour
// arrière dit qu'il ne remonte que d'un cran, et il le dit au moment où on
// l'arme, pas avant.
import { scope } from '../data/scope.js';
import { esc, toast, confirm as demander } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard, lienPhoto, signalerPhotosCassees } from './rgd-espace.js';
import { chargerEditeur } from './rgd-realisation-edit.js';
import { chargerCarrousel } from './rgd-carrousel-edit.js';

// Le nombre de photos, avant/après compris. C'est ce qui dit si une référence
// est montrable ou si elle n'est qu'un titre.
const nbPhotos = (p) => (Array.isArray(p.images) ? p.images.length : 0);

// Un témoignage existe toujours dans le JSON du site, mais presque toujours
// vide (`{text: "", author: "", stars: 5}`). Cinq étoiles sur un texte vide ne
// sont pas un avis : on ne le compte que s'il a un texte.
const temoignageDe = (p) => {
  const t = p.temoignage;
  return t && typeof t === 'object' && String(t.text || '').trim() ? t : null;
};

const pairesDe = (p) => (Array.isArray(p.avant_apres) ? p.avant_apres : [])
  .filter(x => x && x.before && x.after);

/** Le panneau d'accueil, tant qu'aucun projet n'est choisi. Il dit à quoi sert
 *  l'écran plutôt que de laisser une moitié de page blanche. */
const accueilVide = (n, ecriture) => `<div class="rea-vide">
  <h2>Choisissez une réalisation à gauche</h2>
  <p class="muted">Les ${n} chantiers publiés sur rgdrenova.fr, rangés par catégorie.
  C’est la bibliothèque de références : au téléphone avec un prospect de Chantilly
  qui hésite sur une salle de bain, on y trouve en dix secondes une salle de bain
  faite à Chantilly, et on lui en envoie le lien.</p>
  <ul class="muted">
    <li>Le nombre à droite de chaque ligne est son nombre de photos.</li>
    <li>Une étoile signale un avis client rattaché.</li>
    <li><b>Carrousel du site</b>, tout en haut, montre les images de la page d’accueil.</li>
  </ul>
  ${ecriture ? `<p class="muted">Pour mettre un nouveau chantier en ligne :
    <b>+ Nouvelle réalisation</b>, en haut de la liste. Informations, description,
    photos, curseurs avant/après et avis client s’écrivent au même endroit, et
    partent sur le site d’un seul bouton.</p>` : ''}
</div>`;

/** La fiche d'un projet, EN LECTURE. « Modifier » ouvre l'atelier dans ce même
 *  panneau — pas dans une modale : six sections et une grille de photos qu'on
 *  déplace à la souris ne se lisent pas à travers une fente. */
function fiche(p, ecriture) {
  const photos = Array.isArray(p.images) ? p.images : [];
  const tags = (p.photo_tags && typeof p.photo_tags === 'object') ? p.photo_tags : {};
  const paires = pairesDe(p);
  const t = temoignageDe(p);
  return `
    <div class="rea-fiche-tete">
      <div>
        <h2>${esc(p.titre || '(sans titre)')}</h2>
        <p class="muted small">${esc([p.ville, p.categorie_nom].filter(Boolean).join(' · ') || '—')}</p>
      </div>
      <span class="grow"></span>
      ${p.url ? `<a class="btn ghost sm" href="${esc(p.url)}" target="_blank" rel="noopener">↗ Voir sur le site</a>` : ''}
      ${ecriture && p.slug ? `<button type="button" class="btn primary" data-modifier="${esc(p.slug)}">Modifier</button>` : ''}
    </div>

    <div class="rea-faits">
      ${p.surface ? `<span class="chip">${esc(p.surface)}</span>` : ''}
      ${p.duree ? `<span class="chip">${esc(p.duree)}</span>` : ''}
      ${paires.length ? `<span class="chip green">${paires.length} curseur${paires.length > 1 ? 's' : ''} avant / après</span>` : ''}
    </div>

    ${p.description ? `<div class="rea-bloc"><h3>Description publiée</h3>
      <p class="rea-desc">${esc(p.description)}</p></div>` : ''}

    <div class="rea-bloc">
      <h3>Photos <span class="muted small">${photos.length}</span></h3>
      ${photos.length ? `<div class="rea-photos">${photos.map(u => `
        <a class="rea-vignette" href="${esc(lienPhoto(u))}" target="_blank" rel="noopener">
          <img src="${esc(lienPhoto(u))}" alt="" loading="lazy" referrerpolicy="no-referrer">
          ${tags[u] === 'avant' ? '<span class="rea-etiq">avant</span>' : ''}
        </a>`).join('')}</div>`
        : '<div class="empty">Aucune photo — cette référence n’est qu’un titre tant qu’elle n’en a pas.</div>'}
      <p class="small photos-ko" data-photos-ko hidden></p>
    </div>

    ${paires.length ? `<div class="rea-bloc"><h3>Curseurs avant / après</h3>
      <div class="rea-photos">${paires.map(x => `
        <div class="rea-duo">
          <img src="${esc(lienPhoto(x.before))}" alt="avant" loading="lazy" referrerpolicy="no-referrer">
          <img src="${esc(lienPhoto(x.after))}" alt="après" loading="lazy" referrerpolicy="no-referrer">
        </div>`).join('')}</div></div>` : ''}

    ${t ? `<div class="rea-bloc"><h3>Avis client</h3>
      <blockquote class="rea-avis">« ${esc(t.text)} »
        <footer class="muted small">${esc(t.author || 'client')}${
          t.date ? ' · ' + esc(t.date) : ''}${
          t.stars ? ' · ' + '★'.repeat(Math.min(5, Number(t.stars) || 0)) : ''}</footer>
      </blockquote></div>` : ''}

    ${String(p.notes || '').trim() ? `<div class="rea-bloc"><h3>Notes de chantier</h3>
      <p class="rea-desc muted">${esc(p.notes)}</p>
      <p class="small muted">Ce sont elles qui alimentent le bouton « Générer la
      description » de l’atelier.</p></div>` : ''}`;
}

/** Le carrousel de la page d'accueil, EN LECTURE. Les images y sont rangées
 *  dans l'ordre d'affichage : le rang EST l'information, d'où le numéro. */
const carrousel = (images, ecriture) => `
  <div class="rea-fiche-tete">
    <div>
      <h2>Carrousel du site</h2>
      <p class="muted small">${images.length} image${images.length > 1 ? 's' : ''},
      dans l’ordre d’affichage sur la page d’accueil</p>
    </div>
    <span class="grow"></span>
    <a class="btn ghost sm" href="https://rgdrenova.fr/" target="_blank" rel="noopener">↗ Voir le site</a>
    ${ecriture ? '<button type="button" class="btn primary" data-modif-carrousel>Modifier</button>' : ''}
  </div>
  <p class="small photos-ko" data-photos-ko hidden></p>
  ${images.length ? `<div class="rea-photos">${images.map(i => `
    <figure class="rea-vignette rea-vignette-num">
      <img src="${esc(lienPhoto(i.url))}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <span class="rea-rang">${(i.rang ?? 0) + 1}</span>
      ${i.legende ? `<figcaption class="s">${esc(i.legende)}</figcaption>` : ''}
    </figure>`).join('')}</div>` : '<div class="empty">Aucune image relevée.</div>'}
  <p class="small muted">La légende sert d’attribut <code>alt</code> : c’est elle que
  lisent Google et les lecteurs d’écran. Certaines images sont enregistrées en chemin
  relatif côté site (<code>/medias/…</code>) et affichées ici depuis rgdrenova.fr.</p>`;

export const rgdRealisationsPage = {
  title: () => 'RGD Renova — Réalisations',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // `vue` vaut 'projet' ou 'carrousel' ; `slug` dit quel projet est ouvert à
    // droite ; `editeur` porte l'atelier quand on modifie — c'est LUI qui tient
    // la saisie en cours, jamais le DOM, puisque le panneau est redessiné.
    const state = { vue: 'projet', slug: null, editeur: null, occupe: false };

    // ⚠ LE DROIT D'ÉCRIRE EST `scope.canRgd`, PAS le jeton de l'application RGD.
    // Publier passe par `rgd_publier_site`, gardée côté base par
    // `has_activity('rgd')` — dont `scope.canRgd` est le miroir exact. Exiger en
    // plus un compte du tableau de bord fermerait l'atelier à quelqu'un que la
    // base laisse publier. Le jeton reste nécessaire pour DÉPOSER une photo,
    // qui passe encore par le worker : l'atelier gère ce second droit tout seul.
    // Le mode démo rejoue les trois fonctions du site en local (voir `db.js`) :
    // cet écran s'y essaie donc en entier, publication comprise, sans rien
    // envoyer sur rgdrenova.fr.
    const ecriture = scope.canRgd;

    // Quitter l'atelier perd la saisie : un rechargement de page aussi. Le
    // garde-fou du navigateur ne couvre que ce dernier cas, la demande
    // ci-dessous couvre la navigation interne.
    const garde = (e) => { e.preventDefault(); e.returnValue = ''; };
    const armerGarde = (on) => {
      window.removeEventListener('beforeunload', garde);
      if (on) window.addEventListener('beforeunload', garde);
    };

    const quitterAtelier = async () => {
      if (!state.editeur) return true;
      if (!await demander('Quitter l’atelier ? Ce qui n’a pas été publié sera perdu.')) return false;
      state.editeur = null; armerGarde(false);
      return true;
    };

    const fermerAtelier = (slug) => {
      state.editeur = null; armerGarde(false);
      if (slug !== undefined && slug !== null) { state.vue = 'projet'; state.slug = slug; }
      draw();
    };

    const ouvrirAtelier = async (cible) => {
      if (state.occupe) return;
      state.occupe = true;
      const r = await chargerEditeur(cible);
      state.occupe = false;
      if (!r.ok) { toast(`Atelier indisponible — ${r.motif}.`, 'err'); return; }
      state.editeur = r.editeur;
      state.vue = 'projet';
      if (!cible.nouveau) state.slug = r.editeur.slug;
      armerGarde(true);
      draw();
    };

    const ouvrirCarrousel = async () => {
      if (state.occupe) return;
      state.occupe = true;
      const r = await chargerCarrousel();
      state.occupe = false;
      if (!r.ok) { toast(`Atelier indisponible — ${r.motif}.`, 'err'); return; }
      state.editeur = r.editeur;
      state.vue = 'carrousel';
      armerGarde(true);
      draw();
    };

    // ---- rendu -------------------------------------------------------------
    const corpsPanneau = (tous, images) => {
      if (state.editeur) return state.editeur.corps();
      if (state.vue === 'carrousel') return carrousel(images, ecriture);
      const choisi = state.slug ? tous.find(p => p.slug === state.slug) : null;
      return choisi ? fiche(choisi, ecriture) : accueilVide(tous.length, ecriture);
    };

    // Redessin du SEUL panneau : c'est ce que l'atelier appelle à chaque photo
    // déplacée, paire ajoutée ou étoile cliquée. Redessiner la page entière
    // remonterait la vue en haut et repeindrait une liste qui n'a pas bougé —
    // et la liste, elle, montre le PUBLIÉ : elle n'a aucune raison de suivre
    // une saisie qui n'est pas partie.
    // ⚠ CHOISIR UN PROJET NE REDESSINE PAS LA PAGE — signalé le 24/09/2026 :
    // « le menu à gauche repart à 0 à chaque fois que je clique sur un projet ».
    // `draw()` remplace tout le `root`, donc la colonne de gauche est
    // reconstruite et son défilement revient en haut. Avec trente et un projets
    // rangés en cinq catégories, on remonte chercher celui qu'on regardait
    // juste avant — à chaque clic.
    //
    // Or rien à GAUCHE ne change quand on choisit : ni les projets, ni leurs
    // compteurs, ni les catégories. Seuls le panneau de droite et la pastille
    // active bougent. On ne refait donc que ça, et la colonne ne bouge pas
    // d'un pixel — ce qui est aussi plus rapide que de tout refaire.
    const choisir = (vue, slug) => {
      state.vue = vue; state.slug = slug;
      const cote = root.querySelector('.rea-cote');
      cote?.querySelectorAll('.rea-item.on').forEach(b => b.classList.remove('on'));
      const actif = vue === 'carrousel'
        ? cote?.querySelector('[data-carrousel]')
        // `CSS.escape` parce qu'un slug est du texte libre : un point ou un
        // deux-points casserait le sélecteur, et le projet resterait sans
        // marque alors qu'il est bien ouvert.
        : cote?.querySelector(`[data-projet="${(window.CSS && CSS.escape) ? CSS.escape(slug || '') : slug}"]`);
      actif?.classList.add('on');
      dessinerPanneau();
    };

    const dessinerPanneau = () => {
      const panneau = root.querySelector('.rea-panneau');
      if (!panneau) return;
      const { tous, images } = donnees();
      panneau.innerHTML = corpsPanneau(tous, images);
      brancherPanneau(panneau);
    };

    const brancherPanneau = (panneau) => {
      // Une photo morte se signale d'elle-même : on ne peut le savoir qu'au
      // chargement, donc après chaque rendu, atelier compris.
      signalerPhotosCassees(panneau);
      if (state.editeur) {
        // Rien à faire après publication : l'atelier a déjà rechargé la table
        // et appelle `fermer`, qui redessine la page entière sur le frais.
        state.editeur.brancher(panneau, { redessiner: dessinerPanneau, fermer: fermerAtelier });
        return;
      }
      panneau.querySelectorAll('[data-modifier]').forEach(b => b.onclick = () =>
        ouvrirAtelier({ slug: b.dataset.modifier }));
      const c = panneau.querySelector('[data-modif-carrousel]');
      if (c) c.onclick = ouvrirCarrousel;
    };

    const donnees = () => ({
      tous: scope.rgd('rgd_realisations').slice().sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0)),
      images: scope.rgd('rgd_carrousel').slice().sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0)),
    });

    const draw = () => {
      const { tous, images } = donnees();

      // Les catégories telles que le site les ordonne, sans doublon.
      const cats = [];
      for (const p of tous) {
        if (p.categorie_slug && !cats.some(c => c.slug === p.categorie_slug)) {
          cats.push({ slug: p.categorie_slug, nom: p.categorie_nom || p.categorie_slug,
                      n: tous.filter(x => x.categorie_slug === p.categorie_slug).length });
        }
      }

      // Le projet ouvert peut avoir disparu entre deux relevés (ces tables sont
      // remplacées et non accumulées) : on retombe alors sur le panneau
      // d'accueil plutôt que sur une fiche vide.
      if (state.slug && !state.editeur && !tous.some(p => p.slug === state.slug)) state.slug = null;

      // LA PRÉSENTATION EST CELLE DU TABLEAU DE BORD (23/09/2026, demandée par
      // Mickael) : un atelier en deux colonnes — la liste rangée PAR CATÉGORIE à
      // gauche, le projet choisi ou en cours de modification à droite.
      const corps = `
        <div class="rea-atelier">
          <aside class="rea-cote">
            <div class="rea-cote-tete">
              <b>${tous.length} projet${tous.length > 1 ? 's' : ''}</b>
              <span class="muted small">${cats.length} catégorie${cats.length > 1 ? 's' : ''}</span>
            </div>
            ${ecriture ? `<button type="button" class="btn primary rea-neuf" data-neuf>+ Nouvelle réalisation</button>` : ''}

            <div class="rea-groupe">
              <div class="rea-groupe-titre">Page d’accueil</div>
              <button type="button" class="rea-item${state.vue === 'carrousel' ? ' on' : ''}" data-carrousel>
                <span class="rea-item-nom">Carrousel du site</span>
                <span class="rea-item-n">${images.length}</span>
              </button>
            </div>

            ${cats.map(c => `
              <div class="rea-groupe">
                <div class="rea-groupe-titre">${esc(c.nom)} <span>${c.n}</span></div>
                ${tous.filter(p => p.categorie_slug === c.slug).map(p => `
                  <button type="button" class="rea-item${state.slug === p.slug && state.vue === 'projet' ? ' on' : ''}"
                          data-projet="${esc(p.slug || '')}">
                    <span class="rea-item-nom">${esc(p.titre || '(sans titre)')}</span>
                    ${p.brouillon ? '<span class="rea-item-brouillon" title="Brouillon — cette réalisation n’est pas sur le site">Brouillon</span>' : ''}
                    ${temoignageDe(p) ? '<span class="rea-item-avis" title="Avis client rattaché">★</span>' : ''}
                    <span class="rea-item-n">${nbPhotos(p)}</span>
                  </button>`).join('')}
              </div>`).join('')}
          </aside>

          <section class="rea-panneau">${corpsPanneau(tous, images)}</section>
        </div>`;

      // ⚠ ET QUAND `draw` TOURNE VRAIMENT — après une publication, après un
      // relevé — il garde la place où on en était. Ces passages-là sont rares,
      // mais ils tombent au pire moment : juste après avoir publié le projet
      // qu'on venait de trouver.
      const defilement = root.querySelector('.rea-cote')?.scrollTop || 0;
      root.innerHTML = cadre('#/rgd/realisations', 'Réalisations', corps);
      if (defilement) {
        const cote = root.querySelector('.rea-cote');
        if (cote) cote.scrollTop = defilement;
      }

      // ⚠ La liste de gauche montre le PUBLIÉ. Un clic dessus quitte l'atelier,
      // donc on demande avant : une description qu'on vient d'écrire ne doit
      // pas partir sur un clic distrait.
      root.querySelectorAll('[data-projet]').forEach(b => b.onclick = async () => {
        if (!await quitterAtelier()) return;
        choisir('projet', b.dataset.projet);
      });
      const carr = root.querySelector('[data-carrousel]');
      if (carr) carr.onclick = async () => {
        if (!await quitterAtelier()) return;
        choisir('carrousel', null);
      };
      const neuf = root.querySelector('[data-neuf]');
      if (neuf) neuf.onclick = async () => {
        if (!await quitterAtelier()) return;
        ouvrirAtelier({ nouveau: true, catSlug: cats[0]?.slug });
      };

      brancherPanneau(root.querySelector('.rea-panneau'));
    };

    draw();
    return {
      // Un relevé ne doit pas balayer une saisie en cours : tant que l'atelier
      // est ouvert, la page ne se redessine pas toute seule.
      refresh: () => { if (!state.editeur) draw(); },
      destroy() { armerGarde(false); coquille.retirer(); },
    };
  },
};
