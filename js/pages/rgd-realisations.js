// Espace RGD Renova — réalisations et carrousel
//
// ÉTAPE 4 DE LA MIGRATION, RANG 5 — en écriture depuis le 22/09/2026, et
// c'est le SEUL écran de l'espace dont l'écriture sort vers le public.
// La modification passe par `js/pages/rgd-realisation-edit.js`, qui relit le
// document publié à la source et le republie entier : lire les trois
// contraintes de stockage en tête de ce fichier avant d'y toucher.
//
// CE QUE CET ÉCRAN MONTRE, ET À QUI IL SERT
// Les 31 chantiers publiés sur rgdrenova.fr, avec leur ville, leur surface, leur
// durée et leur gamme. Ce n'est pas un écran de gestion : c'est la bibliothèque
// de références. Quelqu'un au téléphone avec un prospect de Chantilly qui
// hésite sur une salle de bain doit pouvoir trouver en dix secondes une salle
// de bain faite à Chantilly, et lui en envoyer le lien.
//
// D'OÙ VIENT LE DÉCOUPAGE EN LIGNES
// Côté Cloudflare, tout ça tient dans UNE ligne : un document JSON. C'est le
// relevé qui le déplie en projets et en images — voir la migration
// 20260921250000. Un blob ne se cherche pas, ne se compte pas, ne se trie pas ;
// une table, si. Le découpage suit la structure du JSON, il n'en invente pas.
//
// LA LISTE LIT LE REFLET, L'ÉDITEUR LIT LA SOURCE — ET C'EST VOULU
// La liste se cherche, se trie, se filtre : elle a besoin de lignes, donc du
// reflet, avec son retard de trente minutes. L'éditeur, lui, republie le
// document entier : il ne peut pas partir d'une copie vieille d'une demi-heure
// ni d'un reflet qui a perdu les descriptions de catégories. Il relit la
// source à l'ouverture, et une seconde fois au moment de publier.
import { scope } from '../data/scope.js';
import { esc } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { peutEcrire } from '../data/rgd-api.js';
import { ouvrirEditionRealisation } from './rgd-realisation-edit.js';

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

/** Le panneau d'accueil, tant qu'aucun projet n'est choisi. Il dit à quoi sert
 *  l'écran plutôt que de laisser une moitié de page blanche. */
const accueilVide = (n) => `<div class="rea-vide">
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
</div>`;

/** La fiche d'un projet. En LECTURE : « Modifier » ouvre l'éditeur, qui relit le
 *  document à la source et le republie entier — voir `rgd-realisation-edit.js`.
 *  L'original édite directement dans ce panneau ; on ne l'a pas repris, parce
 *  que la mécanique de publication est délicate (un seul retour arrière, le
 *  document remplacé en entier) et qu'elle est éprouvée telle quelle. */
function fiche(p, ecriture) {
  const photos = Array.isArray(p.images) ? p.images : [];
  const paires = Array.isArray(p.avant_apres) ? p.avant_apres : [];
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
      ${p.gamme ? `<span class="chip accent">${esc(p.gamme)}</span>` : ''}
      ${p.surface ? `<span class="chip">${esc(p.surface)}</span>` : ''}
      ${p.duree ? `<span class="chip">${esc(p.duree)}</span>` : ''}
      ${p.date ? `<span class="chip muted">${esc(p.date)}</span>` : ''}
      ${paires.length ? `<span class="chip green">${paires.length} avant / après</span>` : ''}
    </div>

    ${p.description ? `<div class="rea-bloc"><h3>Description publiée</h3>
      <p class="rea-desc">${esc(p.description)}</p></div>` : ''}

    <div class="rea-bloc">
      <h3>Photos <span class="muted small">${photos.length}</span></h3>
      ${photos.length ? `<div class="rea-photos">${photos.map(u => `
        <a class="rea-vignette" href="${esc(lienPhoto(u))}" target="_blank" rel="noopener">
          <img src="${esc(lienPhoto(u))}" alt="" loading="lazy" referrerpolicy="no-referrer">
        </a>`).join('')}</div>`
        : '<div class="empty">Aucune photo — cette référence n’est qu’un titre tant qu’elle n’en a pas.</div>'}
    </div>

    ${t ? `<div class="rea-bloc"><h3>Avis client</h3>
      <blockquote class="rea-avis">« ${esc(t.text)} »
        <footer class="muted small">${esc(t.author || 'client')}${
          t.date ? ' · ' + esc(t.date) : ''}${
          t.stars ? ' · ' + '★'.repeat(Math.min(5, Number(t.stars) || 0)) : ''}</footer>
      </blockquote></div>` : ''}`;
}

/** Le carrousel de la page d'accueil. Les images y sont rangées dans l'ordre
 *  d'affichage : le rang EST l'information, d'où le numéro sur chacune. */
const carrousel = (images) => `
  <div class="rea-fiche-tete">
    <div>
      <h2>Carrousel du site</h2>
      <p class="muted small">${images.length} image${images.length > 1 ? 's' : ''},
      dans l’ordre d’affichage sur la page d’accueil</p>
    </div>
  </div>
  ${images.length ? `<div class="rea-photos">${images.map(i => `
    <figure class="rea-vignette rea-vignette-num">
      <img src="${esc(lienPhoto(i.url))}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <span class="rea-rang">${(i.rang ?? 0) + 1}</span>
      ${i.legende ? `<figcaption class="s">${esc(i.legende)}</figcaption>` : ''}
    </figure>`).join('')}</div>` : '<div class="empty">Aucune image relevée.</div>'}
  <p class="small muted">Les images du carrousel sont enregistrées en chemin relatif
  côté site (<code>/medias/…</code>) : elles sont affichées ici depuis rgdrenova.fr.</p>`;

/** Une photo peut être enregistrée en chemin relatif côté site. La rendre telle
 *  quelle donnerait un cadre cassé dans le CRM, qui n'est pas servi par le même
 *  domaine. */
const lienPhoto = (u) => String(u || '').startsWith('http') ? u : 'https://rgdrenova.fr' + u;

export const rgdRealisationsPage = {
  title: () => 'RGD Renova — Réalisations',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // `vue` ne vaut plus que 'projet' ou 'carrousel' : la sidebar a remplacé
    // les onglets, et c'est elle qui filtre par catégorie — le `<select>` n'a
    // plus lieu d'être. `slug` dit quel projet est ouvert à droite.
    const state = { vue: 'projet', slug: null, ecriture: false };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

    const draw = () => {
      const tous = scope.rgd('rgd_realisations').slice()
        .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
      const images = scope.rgd('rgd_carrousel').slice()
        .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));

      // Les catégories telles que le site les ordonne, sans doublon.
      const cats = [];
      for (const p of tous) {
        if (p.categorie_slug && !cats.some(c => c.slug === p.categorie_slug)) {
          cats.push({ slug: p.categorie_slug, nom: p.categorie_nom || p.categorie_slug,
                      n: tous.filter(x => x.categorie_slug === p.categorie_slug).length });
        }
      }

      // Le projet ouvert. Il peut avoir disparu entre deux relevés (un projet
      // retiré du site s'efface vraiment, ces tables étant remplacées et non
      // accumulées) : on retombe alors sur le panneau d'accueil plutôt que sur
      // une fiche vide.
      const choisi = state.slug ? tous.find(p => p.slug === state.slug) : null;
      if (state.slug && !choisi) state.slug = null;

      // LA PRÉSENTATION EST CELLE DU TABLEAU DE BORD (23/09/2026, demandée par
      // Mickael) : un atelier en deux colonnes — la liste rangée PAR CATÉGORIE à
      // gauche, le projet choisi à droite. La galerie de cartes qu'il y avait ici
      // montrait les mêmes projets, mais elle répondait à « montre-moi tout »
      // quand cet écran sert à « ouvre-moi celui-là ».
      //
      // ⚠ LE BANDEAU RESTE, et ce n'est pas un oubli. Les chiffres clés en tête
      // sont partis comme sur Clients, Partenaires et Sous-traitants — mais
      // l'avertissement, lui, dit que ce qu'on modifie ici PART SUR LE SITE
      // PUBLIC dans la minute. C'est le seul écran de l'espace dont l'écriture
      // sort de l'entreprise : il ne se range pas avec les autres.
      const corps = `
        <div class="alert rgd-source">
          <b>i</b>
          <div>Ces réalisations sont celles publiées sur <b>rgdrenova.fr</b>.
          ${state.ecriture
            ? '<b>Les modifier ici les publie sur le site</b> — il n’y a pas de brouillon, et la page change dans la minute.'
            : 'Elles se modifient dans l’<a href="#/rgd/app">application RGD</a>, qui écrit sur le site — une correction faite ici ne partirait pas en ligne et serait écrasée au relevé suivant.'}</div>
        </div>

        <div class="rea-atelier">
          <aside class="rea-cote">
            <div class="rea-cote-tete">
              <b>${tous.length} projet${tous.length > 1 ? 's' : ''}</b>
              <span class="muted small">${cats.length} catégorie${cats.length > 1 ? 's' : ''}</span>
            </div>

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
                  <button type="button" class="rea-item${state.slug === p.slug ? ' on' : ''}"
                          data-projet="${esc(p.slug || '')}">
                    <span class="rea-item-nom">${esc(p.titre || '(sans titre)')}</span>
                    ${temoignageDe(p) ? '<span class="rea-item-avis" title="Avis client rattaché">★</span>' : ''}
                    <span class="rea-item-n">${nbPhotos(p)}</span>
                  </button>`).join('')}
              </div>`).join('')}
          </aside>

          <section class="rea-panneau">
            ${state.vue === 'carrousel' ? carrousel(images)
              : (choisi ? fiche(choisi, state.ecriture) : accueilVide(tous.length))}
          </section>
        </div>`;

      root.innerHTML = cadre('#/rgd/realisations', 'Réalisations', corps);

      root.querySelectorAll('[data-projet]').forEach(b => b.onclick = () => {
        state.vue = 'projet'; state.slug = b.dataset.projet; draw();
      });
      const carr = root.querySelector('[data-carrousel]');
      if (carr) carr.onclick = () => { state.vue = 'carrousel'; state.slug = null; draw(); };
      // Depuis la bascule du 22/09/2026, `draw` montre bien la nouvelle
      // version : la publication redéplie `rgd_realisations` dans la même
      // transaction, et l'éditeur recharge la table avant de rendre la main.
      root.querySelectorAll('[data-modifier]').forEach(b => b.onclick = () =>
        ouvrirEditionRealisation(b.dataset.modifier, draw));
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
