// Espace RGD Renova — l'atelier d'une réalisation publiée
//
// ⚠ PUBLIER ICI, C'EST ÉCRIRE SUR rgdrenova.fr.
// C'est le seul écran de l'espace dont l'écriture sort vers le public, et ce
// n'est pas un accident : c'est le fonctionnement voulu. On rédige, ça part.
// L'écran le dit clairement plutôt que de le déguiser en « enregistrement ».
//
// TROIS CONTRAINTES DU STOCKAGE, ET ELLES COMMANDENT TOUT LE FICHIER
//
// 1. LE DOCUMENT EST REMPLACÉ EN ENTIER. `rgd_publier_site` n'écrit pas un
//    champ, il écrase le JSON complet — 5 catégories, 31 projets. Envoyer un
//    document amputé supprimerait du site tout ce qui manque.
//
// 2. LE REFLET NE SUFFIT PAS À LE RECONSTRUIRE. `rgd_realisations` déplie le
//    JSON en lignes pour qu'on puisse le chercher et le trier, mais il n'a
//    aucune colonne pour les **descriptions des cinq catégories** — de longs
//    textes de référencement. Rebâtir le document depuis le reflet les
//    effacerait du site sans un mot. On relit donc TOUJOURS la source.
//
// 3. IL N'Y A QU'UN NIVEAU DE RETOUR ARRIÈRE. Chaque publication pousse
//    l'ancien document dans `doc_precedent` et écrase le précédent. Deux
//    mauvaises publications de suite, et la bonne version n'existe plus.
//
// POURQUOI ON RELIT JUSTE AVANT D'ÉCRIRE, ET PAS SEULEMENT À L'OUVERTURE
// Le document n'a pas de numéro de version : rien n'empêche deux personnes de
// l'enregistrer en même temps, et le second écrasement gagnerait en silence.
// On relit donc la source au moment du clic et on applique les modifications
// AU DOCUMENT FRAÎCHEMENT LU, repéré par le `slug` du projet. Une correction
// faite ailleurs pendant qu'on rédigeait survit ; si le projet a disparu entre
// les deux, on s'arrête et on le dit.
//
// ⚠ L'ATELIER COMPLET EST REVENU LE 23/09/2026, à la demande de Mickael.
// La première version ne portait que le titre, la ville, la surface,
// la durée, la description et l'ordre des photos. Il manquait tout ce qui fait
// la fiche publique : le **tag avant/après** de chaque photo, les **paires du
// curseur**, l'**avis client**, les **notes** et le bouton qui en tire une
// description. Un écran qui publie sur le site doit pouvoir écrire tout ce que
// le site affiche, sinon il faut retourner dans l'application d'origine pour
// la moitié du travail — et l'étape 5 n'avance pas.
//
// ⚠ L'ÉDITION SE FAIT DANS LE PANNEAU, PAS DANS UNE MODALE, et c'est délibéré.
// Il y a six sections, une grille de photos qu'on déplace à la souris et des
// listes déroulantes qui s'enchaînent : dans une modale de 1040 px, tout ça se
// lit à travers une fente. Conséquence à connaître : le panneau est redessiné
// par la page, donc l'état de saisie vit ICI, dans `etat`, et jamais dans le
// DOM — un redessin repart de `etat`, sans quoi la moindre photo déplacée
// effacerait le texte en cours de frappe.
import { esc, toast, confirm } from '../ui.js';
import { db } from '../data/db.js';
import { lienPhoto } from './rgd-espace.js';
import { lireRealisations, enregistrerRealisations, restaurerRealisations,
         deposerPhotosRealisations } from '../data/rgd-api.js';

// Dite AVANT l'envoi, pour ne pas faire monter vingt mégaoctets qui seront
// refusés à l'arrivée. `deposerPhotosRealisations` revérifie, et le bucket
// aussi : trois filets, parce que seul le dernier protège vraiment.
const MAX_OCTETS = 20 * 1024 * 1024;
const FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
              'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const ANNEES = [2026, 2025, 2024, 2023];

// ⚠ LA GAMME N'EXISTE PLUS NULLE PART (23/09/2026, demandé par Mickael :
// « on ne l'utilise plus du tout », puis « sur le site il n'y a pas de
// gamme »). Elle a quitté le formulaire, la fiche en lecture, `champsEdites()`
// ET `genererDescription` — ce dernier point n'est pas un détail : il était le
// SEUL endroit où ce champ avait encore un effet visible, puisqu'il choisissait
// entre « haut de gamme et raffiné » et « moderne et fonctionnel ». Le laisser
// aurait fait décider du texte publié par une donnée qu'on ne peut plus régler
// et qui ne s'affiche nulle part : deux brouillons différents pour deux
// chantiers semblables, sans que rien à l'écran n'en donne la raison.
// La valeur DORT dans le document (19 Essentielle, 12 Signature au 23/09) et
// n'est pas effacée : le site ne l'affiche pas, elle ne coûte donc rien, et
// réécrire trente et une fiches pour retirer un champ invisible serait un
// risque pris pour rien. Les descriptions déjà publiées ne bougent pas non
// plus — le générateur ne s'applique qu'au clic.

// Le cadrage d'une photo dans le curseur : c'est `background-position` côté
// site, d'où des valeurs qui ne se traduisent pas (« left top » est une paire
// de mots-clés CSS, pas une phrase).
const CADRAGES = ['center', 'top', 'bottom', 'left', 'right',
                  'left top', 'right top', 'left bottom', 'right bottom'];

// ---------------------------------------------------------------- utilitaires
//
// Le site enregistre la surface et la durée en TEXTE (« 8 m² », « 3 semaines »)
// parce que c'est ce qu'il affiche. Le formulaire, lui, propose un nombre et
// une unité : on découpe à l'ouverture, on recompose à la saisie. Stocker un
// nombre à la place casserait l'affichage public.
const slugifier = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // les accents, en échappement : invisibles à l'œil dans le source
  .replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const lireSurface = (s) => { const m = String(s || '').match(/([\d.,]+)/); return m ? m[1].replace(',', '.') : ''; };
const ecrireSurface = (n) => (String(n || '').trim() ? `${String(n).trim()} m²` : '');

function lireDuree(s) {
  const m = String(s || '').match(/([\d.,]+)\s*(jour|semaine|mois)/i);
  if (!m) return { n: '', unite: 'semaines' };
  const u = m[2].toLowerCase();
  return { n: m[1].replace(',', '.'), unite: u === 'jour' ? 'jours' : u === 'semaine' ? 'semaines' : 'mois' };
}
function ecrireDuree(n, unite) {
  const v = parseFloat(String(n || '').replace(',', '.'));
  if (!v && v !== 0) return '';
  if (!String(n || '').trim()) return '';
  if (unite === 'mois') return `${v} mois`;
  if (unite === 'jours') return v <= 1 ? `${v} jour` : `${v} jours`;
  return v <= 1 ? `${v} semaine` : `${v} semaines`;
}
function lireDateAvis(s) {
  const parts = String(s || '').trim().split(/\s+/);
  const mois = MOIS.find(m => m.toLowerCase() === (parts[0] || '').toLowerCase()) || '';
  const an = /^\d{4}$/.test(parts[parts.length - 1] || '') ? parts[parts.length - 1] : '';
  return { mois, an };
}
const ecrireDateAvis = (mois, an) => [mois, an].filter(Boolean).join(' ');

// Un projet du document peut être incomplet : `photo_tags`, `ba_pairs`,
// `testimonial` et `notes` n'existent que depuis que l'atelier les écrit. On
// les pose à l'ouverture, sur la COPIE de travail, pour que le reste du
// fichier n'ait pas à se demander à chaque ligne si le champ est là.
// ⚠ Le tag par défaut est « après » : une photo non taguée est presque
// toujours un résultat, et c'est aussi la règle de l'application d'origine.
function normaliser(p) {
  p.images = Array.isArray(p.images) ? p.images.slice() : [];
  p.ba_pairs = Array.isArray(p.ba_pairs) ? p.ba_pairs.map(x => ({ ...x })) : [];
  p.photo_tags = (p.photo_tags && typeof p.photo_tags === 'object') ? { ...p.photo_tags } : {};
  const t = (p.testimonial && typeof p.testimonial === 'object') ? p.testimonial : {};
  p.testimonial = { text: t.text || '', author: t.author || '', date: t.date || '',
                    stars: Number(t.stars) || 5 };
  p.notes = p.notes || '';
  for (const u of p.images) {
    if (!p.photo_tags[u]) p.photo_tags[u] = /[-_/]avant[-_.\d]/i.test(u) ? 'avant' : 'apres';
  }
  return p;
}

// Retrouver un projet dans le document, et sa catégorie. Le `slug` est la clé :
// c'est lui que le site emploie dans ses adresses, il ne bouge pas.
function trouver(doc, slug) {
  for (const cat of doc.categories || []) {
    const i = (cat.projects || []).findIndex(p => p.slug === slug);
    if (i >= 0) return { cat, i, projet: cat.projects[i] };
  }
  return null;
}

// ⚠ FONCTION LOCALE, AUCUNE IA, AUCUN APPEL RÉSEAU — reprise de l'application
// d'origine, à la virgule près sauf sur un point : elle assemble trois
// paragraphes à partir des notes en vrac, du titre, de la ville, de la surface
// et de la durée, mais PLUS de la gamme (voir plus haut). Le résultat est un
// BROUILLON qui atterrit dans le champ « Description publiée » : rien ne part
// sur le site tant qu'on n'a pas relu et publié. Ne pas la réécrire « en
// mieux » pour autant : le texte du site ne doit pas dépendre de l'outil qui
// l'a produit.
function genererDescription(p) {
  const notes = (p.notes || '').split(/\n+|[·•]/).map(s => s.trim()).filter(Boolean);
  const type = /cuisine/i.test(p.title) ? 'cuisine'
             : /salle de bain/i.test(p.title) ? 'salle de bain'
             : /sanitaire|toilettes|wc/i.test(p.title) ? 'espace sanitaire'
             : /appartement|studio|maison/i.test(p.title) ? 'lieu de vie'
             : 'espace';
  const surfaceTxt = p.surface ? `(${p.surface})` : '';
  const durTxt = p.duration ? `en ${p.duration}` : '';
  const cityTxt = p.city ? ` à ${p.city.replace(/\s*\(.+\)/, '')}` : '';
  const p1 = `Cette ${type}${cityTxt} ${surfaceTxt} a été entièrement repensée par nos équipes RGD Renova${durTxt ? ' ' + durTxt : ''}. L'objectif : gagner en confort, en lumière et en esthétisme.`.replace(/ {2,}/g, ' ');
  let p2;
  if (notes.length === 1) {
    p2 = `Les travaux ont notamment inclus ${notes[0].toLowerCase().replace(/\.$/, '')}, dans le respect des standards de qualité RGD Renova.`;
  } else if (notes.length > 1) {
    const liste = notes.slice(0, -1).map(n => n.toLowerCase().replace(/\.$/, '')).join(', ');
    const fin = notes[notes.length - 1].toLowerCase().replace(/\.$/, '');
    p2 = `Les travaux ont inclus ${liste} et ${fin}. Chaque étape a été coordonnée par notre chef de chantier.`;
  } else {
    p2 = `Les travaux ont couvert l'ensemble des corps d'état nécessaires : dépose, plomberie, électricité, revêtements et finitions.`;
  }
  const p3 = `Le résultat livre un espace moderne et fonctionnel, où chaque détail a été pensé pour durer. Découvrez ci-dessous la transformation en images.`;
  return [p1, p2, p3].join('\n\n');
}

// Le nom lisible d'une photo dans une liste déroulante. ⚠ Le seul bout
// d'adresse ne suffit plus : depuis la reprise vers Supabase Storage, une
// photo s'appelle « 17884258524 ». Le rang et le tag sont ce qui permet de la
// reconnaître, l'atelier les affiche déjà sur la vignette.
const nomPhoto = (u, i, tag) => {
  const rang = `${i + 1} · ${tag === 'avant' ? 'avant' : 'après'}`;
  // ⚠ Toutes les adresses n'ont pas de nom de fichier au bout. Une image en
  // `data:` n'en a aucun, et un objet de Storage s'appelle « 17884258524 » :
  // découper bêtement sur « / » donnait « svg> » ou un numéro, c'est-à-dire du
  // bruit là où le rang et le tag, eux, désignent vraiment la vignette.
  const fin = /^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:/i.test(u)
    ? '' : String(u).split('/').pop().split('?')[0];
  return /[.][a-z0-9]{2,5}$/i.test(fin) ? `${rang} — ${fin.slice(0, 42)}` : rang;
};

// ------------------------------------------------------------------ chargement
/**
 * Prépare l'atelier d'une réalisation. `cible` est soit un slug existant, soit
 * `{ nouveau: true, catSlug }` pour créer.
 * Rend `{ ok: false, motif }` ou `{ ok: true, editeur }` ; l'éditeur porte son
 * propre état et s'affiche par `corps()` + `brancher()`.
 */
export async function chargerEditeur(cible) {
  const lu = await lireRealisations();
  if (!lu.ok) return { ok: false, motif: lu.motif };

  const categories = (lu.donnees.categories || [])
    .map(c => ({ slug: c.slug, nom: c.name || c.slug }));
  if (!categories.length) return { ok: false, motif: 'le document ne porte aucune catégorie' };

  const nouveau = !!(cible && cible.nouveau);
  let projet, catSlug;
  if (nouveau) {
    catSlug = cible.catSlug || categories[0].slug;
    projet = normaliser({ slug: '', title: '', city: '', surface: '', duration: '',
                          description: '', notes: '', images: [] });
  } else {
    const slug = typeof cible === 'string' ? cible : cible.slug;
    const trouve = trouver(lu.donnees, slug);
    if (!trouve) return { ok: false, motif: 'cette réalisation n’est plus dans le document publié' };
    // On travaille sur une COPIE. Tant qu'on n'a pas publié, rien ne doit
    // pouvoir partir — y compris si l'utilisateur quitte l'écran.
    projet = normaliser(JSON.parse(JSON.stringify(trouve.projet)));
    catSlug = trouve.cat.slug;
  }

  // ⚠ LES DEUX DROITS N'EN FONT PLUS QU'UN (24/09/2026). Publier et déposer
  // étaient gardés différemment : publier par `has_activity('rgd')` côté base,
  // déposer par un compte de l'application RGD au même email, puisque le dépôt
  // passait par le worker Cloudflare. Il passe maintenant par le bucket
  // Supabase, dont la politique d'écriture est gardée par `has_activity('rgd')`
  // — le même garde que publier. Qui voit cet écran peut donc déposer, et le
  // bouton n'a plus de raison de se cacher.
  //
  // Le garde reste posé en BASE : l'écran ne fait que ne pas proposer
  // l'impossible, il ne protège rien.

  const etat = {
    nouveau, projet, catSlug,
    catOrigine: nouveau ? null : catSlug,
    slug: nouveau ? null : projet.slug,
    categories,
    ligne: '', armeSuppr: false, armeRestaure: false, occupe: false,
  };
  return { ok: true, editeur: editeur(etat) };
}

// ---------------------------------------------------------------------- rendu
function editeur(etat) {
  const p = etat.projet;

  const sectionInfos = () => {
    const dur = lireDuree(p.duration);
    return `
    <section class="rea-sec">
      <h3>Informations générales</h3>
      <div class="rea-form">
        <label class="rea-champ rea-large"><span>Titre</span>
          <input id="re-title" value="${esc(p.title || '')}"
                 placeholder="Rénovation d’une salle de bain à Chantilly"></label>
        <label class="rea-champ"><span>Catégorie</span>
          <select id="re-cat">${etat.categories.map(c =>
            `<option value="${esc(c.slug)}" ${c.slug === etat.catSlug ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}
          </select></label>
        <label class="rea-champ"><span>Ville</span>
          <input id="re-city" value="${esc(p.city || '')}" placeholder="Chantilly (60)"></label>
        <label class="rea-champ"><span>Surface</span>
          <span class="rea-combo">
            <input id="re-surface" type="number" min="0" step="0.5" value="${esc(lireSurface(p.surface))}" placeholder="8">
            <span class="rea-unite">m²</span>
          </span></label>
        <label class="rea-champ"><span>Durée</span>
          <span class="rea-combo">
            <input id="re-duree" type="number" min="0" step="1" value="${esc(dur.n)}" placeholder="3">
            <select id="re-duree-unite">
              ${['jours', 'semaines', 'mois'].map(u =>
                `<option value="${u}" ${u === dur.unite ? 'selected' : ''}>${u === 'mois' ? 'mois' : u.slice(0, -1) + '(s)'}</option>`).join('')}
            </select>
          </span></label>
      </div>
      ${etat.nouveau ? `<p class="small muted">L’adresse de la page publique sera fabriquée
        à partir du titre : <b>${esc(slugifier(p.title) || '…')}</b>. Elle ne se change plus ensuite.</p>`
        : `<p class="small muted">Identifiant : <b>${esc(p.slug)}</b> — il ne se change pas,
        c’est lui qui relie cette fiche au site.</p>`}
    </section>`;
  };

  const sectionDescription = () => `
    <section class="rea-sec">
      <h3>Description</h3>
      <p class="small muted">Jetez vos notes en vrac ci-dessous, une par ligne, puis
      cliquez sur <b>Générer</b> : le brouillon arrive dans la description, que vous
      relisez avant de publier. Rien ne part sans le bouton « Publier ».</p>
      <div class="rea-form">
        <label class="rea-champ rea-large"><span>Notes de chantier</span>
          <textarea id="re-notes" rows="4" placeholder="Douche italienne&#10;Meuble double vasque&#10;Carrelage effet marbre">${esc(p.notes || '')}</textarea></label>
      </div>
      <div class="toolbar" style="margin:10px 0">
        <button type="button" class="btn ghost" id="re-generer">✨ Générer la description</button>
      </div>
      <div class="rea-form">
        <label class="rea-champ rea-large"><span>Description publiée</span>
          <textarea id="re-desc" rows="9">${esc(p.description || '')}</textarea></label>
      </div>
    </section>`;

  const sectionPhotos = () => `
    <section class="rea-sec">
      <h3>Photos <span class="muted small">${p.images.length}</span></h3>
      <p class="small muted">Glissez une vignette pour changer l’ordre — le site les
      affiche dans celui-ci. Le tag <b>Avant</b> / <b>Après</b> sert aux curseurs
      plus bas et au tri de la fiche publique.</p>
      <div class="toolbar" style="margin-bottom:10px">
        <button type="button" class="btn ghost" id="re-ajouter">Ajouter des photos…</button>
        <input type="file" id="re-fichiers" accept="image/*" multiple hidden>
        <input id="re-url" class="rea-url" placeholder="…ou coller l’adresse d’une image">
        <button type="button" class="btn ghost" id="re-url-ok">+ Ajouter l’adresse</button>
      </div>
      ${p.images.length ? `<div class="rea-photos-edit" id="re-grille">${p.images.map((u, i) => {
        const tag = p.photo_tags[u] === 'avant' ? 'avant' : 'apres';
        return `<figure class="rea-pcarte" draggable="true" data-i="${i}">
          <span class="rea-rang">${i + 1}</span>
          <button type="button" class="rea-psup" data-retirer="${i}" title="Retirer">✕</button>
          <img src="${esc(lienPhoto(u))}" alt="" loading="lazy" referrerpolicy="no-referrer">
          <figcaption>
            <button type="button" class="rea-tag${tag === 'avant' ? ' on-avant' : ''}" data-tag="avant" data-i="${i}">Avant</button>
            <button type="button" class="rea-tag${tag === 'apres' ? ' on-apres' : ''}" data-tag="apres" data-i="${i}">Après</button>
            <span class="grow"></span>
            <button type="button" class="rea-fleche" data-monter="${i}" ${i === 0 ? 'disabled' : ''} title="Vers la gauche">‹</button>
            <button type="button" class="rea-fleche" data-descendre="${i}" ${i === p.images.length - 1 ? 'disabled' : ''} title="Vers la droite">›</button>
          </figcaption>
        </figure>`;
      }).join('')}</div>`
        : '<div class="empty">Aucune photo — cette référence n’est qu’un titre tant qu’elle n’en a pas.</div>'}
      <p class="small photos-ko" data-photos-ko hidden></p>
      <button type="button" class="btn ghost sm danger rea-purger" data-photos-purger hidden></button>
      <p class="small muted">JPEG, PNG, WebP, GIF ou AVIF, 20 Mo par image. Une photo
      déposée est rangée tout de suite, mais elle n’apparaît sur le site qu’une fois
      la réalisation <b>publiée</b>. La retirer ici la retire de la réalisation, pas du stockage.</p>
    </section>`;

  const sectionPaires = () => {
    const opt = (sel, filtre) => {
      const liste = p.images.map((u, i) => ({ u, i, tag: p.photo_tags[u] === 'avant' ? 'avant' : 'apres' }))
        .filter(x => !filtre || x.tag === filtre);
      const choix = liste.length ? liste
        : p.images.map((u, i) => ({ u, i, tag: p.photo_tags[u] === 'avant' ? 'avant' : 'apres' }));
      return `<option value="">— Choisir —</option>` + choix.map(x =>
        `<option value="${esc(x.u)}" ${x.u === sel ? 'selected' : ''}>${esc(nomPhoto(x.u, x.i, x.tag))}</option>`).join('');
    };
    const cadrage = (sel) => CADRAGES.map(c =>
      `<option value="${c}" ${c === (sel || 'center') ? 'selected' : ''}>${c}</option>`).join('');

    return `
    <section class="rea-sec">
      <h3>Curseurs Avant / Après <span class="muted small">${p.ba_pairs.length}</span></h3>
      <p class="small muted">Chaque paire devient un curseur sur la fiche publique.
      Le cadrage dit quelle partie de la photo reste visible quand elle est recadrée.</p>
      ${p.ba_pairs.length ? p.ba_pairs.map((paire, i) => `
        <div class="rea-paire" data-paire="${i}">
          <div class="rea-paire-num">#${i + 1}</div>
          <div class="rea-paire-col">
            <label class="rea-champ"><span>Photo avant</span>
              <select data-p-avant>${opt(paire.before, 'avant')}</select></label>
            <label class="rea-champ"><span>Cadrage</span>
              <select data-p-avant-pos>${cadrage(paire.before_pos)}</select></label>
            ${paire.before ? `<img class="rea-paire-vue" src="${esc(lienPhoto(paire.before))}" alt=""
              loading="lazy" referrerpolicy="no-referrer" style="object-position:${esc(paire.before_pos || 'center')}">` : ''}
          </div>
          <div class="rea-paire-fleche">→</div>
          <div class="rea-paire-col">
            <label class="rea-champ"><span>Photo après</span>
              <select data-p-apres>${opt(paire.after, 'apres')}</select></label>
            <label class="rea-champ"><span>Cadrage</span>
              <select data-p-apres-pos>${cadrage(paire.after_pos)}</select></label>
            ${paire.after ? `<img class="rea-paire-vue" src="${esc(lienPhoto(paire.after))}" alt=""
              loading="lazy" referrerpolicy="no-referrer" style="object-position:${esc(paire.after_pos || 'center')}">` : ''}
          </div>
          <button type="button" class="btn ghost sm danger" data-p-sup="${i}" title="Retirer la paire">✕</button>
        </div>`).join('')
        : '<div class="empty">Aucune paire — la fiche publique n’affichera pas de curseur.</div>'}
      <div class="toolbar" style="margin-top:10px">
        <button type="button" class="btn ghost" id="re-paire-plus" ${p.images.length < 2 ? 'disabled' : ''}>+ Ajouter une paire</button>
        ${p.images.length < 2 ? '<span class="muted small">Il faut au moins deux photos.</span>' : ''}
      </div>
    </section>`;
  };

  const sectionAvis = () => {
    const d = lireDateAvis(p.testimonial.date);
    const n = Number(p.testimonial.stars) || 0;
    return `
    <section class="rea-sec">
      <h3>Avis client</h3>
      <p class="small muted">Laissé vide, aucun avis ne s’affiche sur la fiche —
      cinq étoiles sur un texte vide ne sont pas un avis.</p>
      <div class="rea-form">
        <label class="rea-champ rea-large"><span>Texte de l’avis</span>
          <textarea id="re-t-text" rows="3" placeholder="Une équipe à l’écoute, ponctuelle…">${esc(p.testimonial.text)}</textarea></label>
        <label class="rea-champ"><span>Nom du client</span>
          <input id="re-t-auteur" value="${esc(p.testimonial.author)}" placeholder="Marie D."></label>
        <label class="rea-champ"><span>Date de l’avis</span>
          <span class="rea-combo">
            <select id="re-t-mois"><option value="">Mois…</option>
              ${MOIS.map(m => `<option ${d.mois === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
            <select id="re-t-an"><option value="">Année…</option>
              ${ANNEES.map(a => `<option ${String(d.an) === String(a) ? 'selected' : ''}>${a}</option>`).join('')}</select>
          </span></label>
        <label class="rea-champ"><span>Note</span>
          <span class="rea-etoiles" id="re-etoiles">
            ${[1, 2, 3, 4, 5].map(i => `<button type="button" data-n="${i}" class="${i <= n ? 'on' : ''}">★</button>`).join('')}
          </span></label>
      </div>
    </section>`;
  };

  const corps = () => `
    <div class="rea-fiche-tete">
      <div>
        <h2>${esc(etat.nouveau ? 'Nouvelle réalisation' : (p.title || '(sans titre)'))}</h2>
        <p class="muted small">${etat.nouveau
          ? 'Elle n’existera sur le site qu’après publication.'
          : esc([p.city, etat.categories.find(c => c.slug === etat.catSlug)?.nom].filter(Boolean).join(' · ') || '—')}</p>
      </div>
      <span class="grow"></span>
      ${!etat.nouveau && p.url ? `<a class="btn ghost sm" href="${esc(p.url)}" target="_blank" rel="noopener">↗ Voir sur le site</a>` : ''}
      ${!etat.nouveau ? `<button type="button" class="btn ghost sm${etat.armeSuppr ? ' danger' : ''}" id="re-supprimer">${
        etat.armeSuppr ? 'Confirmer le retrait du site' : 'Retirer du site…'}</button>` : ''}
    </div>

    ${sectionInfos()}
    ${sectionDescription()}
    ${sectionPhotos()}
    ${sectionPaires()}
    ${sectionAvis()}

    <div class="form-actions rea-pied">
      <button type="button" class="btn ghost" id="re-annuler">Annuler</button>
      ${!etat.nouveau ? `<button type="button" class="btn ghost${etat.armeRestaure ? ' danger' : ''}" id="re-restaurer">${
        etat.armeRestaure ? 'Confirmer le retour arrière' : 'Restaurer la version précédente…'}</button>` : ''}
      <span class="grow"></span>
      <span class="muted small" id="re-ligne">${esc(etat.ligne)}</span>
      <button type="button" class="btn primary" id="re-publier" ${etat.occupe ? 'disabled' : ''}>
        ${etat.nouveau ? 'Créer et publier' : 'Publier sur le site'}</button>
    </div>`;

  // ------------------------------------------------------------- branchements
  function brancher(hote, opts = {}) {
    const { redessiner = () => {}, fermer = () => {}, apresPublication } = opts;
    const $ = (s) => hote.querySelector(s);
    const ligne = (t) => { etat.ligne = t || ''; const e = $('#re-ligne'); if (e) e.textContent = etat.ligne; };

    // ⚠ TOUT PASSE PAR ICI AVANT UN REDESSIN. Le panneau est reconstruit en
    // entier : ce qui n'a pas été relu dans `etat` est perdu. Une photo
    // déplacée effacerait le paragraphe en cours de frappe.
    const relire = () => {
      const v = (s) => $(s)?.value ?? '';
      p.title = v('#re-title').trim();
      p.city = v('#re-city').trim();
      p.surface = ecrireSurface(v('#re-surface'));
      p.duration = ecrireDuree(v('#re-duree'), v('#re-duree-unite'));
      p.description = v('#re-desc').trim();
      p.notes = v('#re-notes');
      p.testimonial.text = v('#re-t-text').trim();
      p.testimonial.author = v('#re-t-auteur').trim();
      p.testimonial.date = ecrireDateAvis(v('#re-t-mois'), v('#re-t-an'));
      if ($('#re-cat')) etat.catSlug = $('#re-cat').value;
    };

    const redessinerAvecSaisie = () => { relire(); redessiner(); };

    // Le titre et la catégorie changent le repère dans la liste de gauche :
    // on redessine la page entière, pas seulement le panneau.
    // La catégorie change l'en-tête du panneau : on redessine. La liste de
    // gauche, elle, ne bouge PAS — elle montre le publié, et le déplacement
    // n'a pas encore eu lieu sur le site.
    $('#re-cat')?.addEventListener('change', () => { relire(); redessiner(); });

    $('#re-generer')?.addEventListener('click', () => {
      relire();
      p.description = genererDescription(p);
      $('#re-desc').value = p.description;
      ligne('Brouillon écrit — relisez-le avant de publier.');
    });

    // ---- photos
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      relire();
      const i = Number(b.dataset.retirer);
      const u = p.images[i];
      p.images.splice(i, 1);
      delete p.photo_tags[u];
      // Une paire qui pointait sur cette photo garderait une adresse morte :
      // le curseur afficherait un cadre vide sur le site sans rien dire ici.
      for (const paire of p.ba_pairs) {
        if (paire.before === u) paire.before = '';
        if (paire.after === u) paire.after = '';
      }
      redessiner();
    });
    // ⚠ ON RETIRE PAR ADRESSE, PAS PAR RANG. Les `data-i` des vignettes sont
    // les rangs du DERNIER rendu ; retirer plusieurs photos en s'y fiant
    // décalerait tout après la première et emporterait les mauvaises. Les
    // adresses, elles, ne bougent pas pendant qu'on les retire.
    //
    // ⚠ ET RIEN N'EST PUBLIÉ. Comme le ✕ d'une vignette, ce bouton ne touche
    // que le brouillon ouvert : tant qu'on n'a pas cliqué « Publier », le site
    // et la base gardent leurs photos. C'est ce qui permet de proposer un
    // retrait en bloc sans filet — la confirmation dit ce qu'on enlève, et
    // fermer sans publier annule tout.
    const purger = hote.querySelector('[data-photos-purger]');
    if (purger) purger.onclick = async () => {
      relire();
      const mortes = [...hote.querySelectorAll('.rea-pcarte')]
        .filter(f => f.querySelector('img.photo-ko'))
        .map(f => p.images[Number(f.dataset.i)])
        .filter(Boolean);
      if (!mortes.length) return;
      const pluriel = mortes.length > 1;
      if (!await confirm(`Retirer ${pluriel ? `ces ${mortes.length} photos` : 'cette photo'} de la `
        + `réalisation ? ${pluriel ? 'Elles ne seront enlevées' : 'Elle ne sera enlevée'} du site `
        + 'qu’à la publication.')) return;
      const aRetirer = new Set(mortes);
      p.images = p.images.filter(u => !aRetirer.has(u));
      for (const u of aRetirer) delete p.photo_tags[u];
      // Une paire qui pointait sur une de ces photos garderait une adresse
      // morte : le curseur afficherait un cadre vide sur le site sans rien
      // dire ici.
      for (const paire of p.ba_pairs) {
        if (aRetirer.has(paire.before)) paire.before = '';
        if (aRetirer.has(paire.after)) paire.after = '';
      }
      toast(`${mortes.length} photo${mortes.length > 1 ? 's retirées' : ' retirée'} — `
        + 'publiez pour que le site suive');
      redessiner();
    };

    const bouger = (de, vers) => {
      relire();
      if (vers < 0 || vers >= p.images.length) return;
      const [x] = p.images.splice(de, 1);
      p.images.splice(vers, 0, x);
      redessiner();
    };
    hote.querySelectorAll('[data-monter]').forEach(b => b.onclick = () =>
      bouger(Number(b.dataset.monter), Number(b.dataset.monter) - 1));
    hote.querySelectorAll('[data-descendre]').forEach(b => b.onclick = () =>
      bouger(Number(b.dataset.descendre), Number(b.dataset.descendre) + 1));
    hote.querySelectorAll('.rea-tag').forEach(b => b.onclick = () => {
      relire();
      p.photo_tags[p.images[Number(b.dataset.i)]] = b.dataset.tag;
      redessiner();
    });

    // Glisser-déposer. ⚠ Les flèches restent à côté : le glisser ne marche
    // pas au doigt, et cet écran s'ouvre aussi sur une tablette de chantier.
    const grille = $('#re-grille');
    if (grille) {
      let source = null;
      grille.querySelectorAll('.rea-pcarte').forEach(carte => {
        carte.addEventListener('dragstart', () => { source = carte; carte.classList.add('glisse'); });
        carte.addEventListener('dragend', () => {
          carte.classList.remove('glisse');
          grille.querySelectorAll('.cible').forEach(c => c.classList.remove('cible'));
        });
        carte.addEventListener('dragover', (e) => { e.preventDefault(); if (carte !== source) carte.classList.add('cible'); });
        carte.addEventListener('dragleave', () => carte.classList.remove('cible'));
        carte.addEventListener('drop', (e) => {
          e.preventDefault(); carte.classList.remove('cible');
          if (!source || source === carte) return;
          bouger(Number(source.dataset.i), Number(carte.dataset.i));
        });
      });
    }

    const fichiers = $('#re-fichiers');
    $('#re-ajouter')?.addEventListener('click', () => { fichiers.value = ''; fichiers.click(); });
    if (fichiers) fichiers.onchange = async () => {
      const liste = [...fichiers.files];
      if (!liste.length) return;
      // Le worker refuse TOUT LE LOT si une image cloche : on le dit ici,
      // avant l'envoi, pour ne pas faire monter 40 Mo pour rien.
      for (const f of liste) {
        const t = (f.type || '').toLowerCase();
        if (t && !FORMATS.includes(t)) { toast(`« ${f.name} » n’est pas une image acceptée.`, 'err'); return; }
        if (f.size > MAX_OCTETS) { toast(`« ${f.name} » dépasse 20 Mo.`, 'err'); return; }
      }
      relire();
      ligne(`Dépôt de ${liste.length} photo${liste.length > 1 ? 's' : ''}…`);
      const r = await deposerPhotosRealisations(liste);
      ligne('');
      if (!r.ok) {
        toast(`Dépôt refusé — ${r.motif}`, 'err');
        return;
      }
      for (const u of (r.donnees?.urls || [])) {
        if (!p.images.includes(u)) { p.images.push(u); p.photo_tags[u] = 'apres'; }
      }
      toast(`${liste.length} photo${liste.length > 1 ? 's ajoutées' : ' ajoutée'} — à publier pour la voir en ligne`);
      redessiner();
    };

    $('#re-url-ok')?.addEventListener('click', () => {
      const u = ($('#re-url')?.value || '').trim();
      if (!u) { toast('Collez l’adresse d’une image avant de cliquer.', 'err'); return; }
      if (p.images.includes(u)) { toast('Cette adresse est déjà dans la liste.', 'err'); return; }
      relire();
      p.images.push(u);
      p.photo_tags[u] = /avant/i.test(u) ? 'avant' : 'apres';
      redessiner();
    });

    // ---- paires avant / après
    $('#re-paire-plus')?.addEventListener('click', () => {
      relire();
      const avant = p.images.find(u => p.photo_tags[u] === 'avant') || '';
      const apres = p.images.find(u => p.photo_tags[u] === 'apres') || '';
      p.ba_pairs.push({ before: avant, after: apres, before_pos: 'center', after_pos: 'center' });
      redessiner();
    });
    hote.querySelectorAll('[data-paire]').forEach(ligneEl => {
      const i = Number(ligneEl.dataset.paire);
      const paire = p.ba_pairs[i];
      const lier = (sel, cle) => {
        const el = ligneEl.querySelector(sel);
        if (el) el.onchange = () => { relire(); paire[cle] = el.value; redessiner(); };
      };
      lier('[data-p-avant]', 'before');
      lier('[data-p-apres]', 'after');
      lier('[data-p-avant-pos]', 'before_pos');
      lier('[data-p-apres-pos]', 'after_pos');
      const sup = ligneEl.querySelector('[data-p-sup]');
      if (sup) sup.onclick = () => { relire(); p.ba_pairs.splice(i, 1); redessiner(); };
    });

    // ---- avis
    hote.querySelectorAll('#re-etoiles button').forEach(b => b.onclick = () => {
      relire();
      p.testimonial.stars = Number(b.dataset.n);
      redessiner();
    });

    // ---- pied
    $('#re-annuler')?.addEventListener('click', () => fermer(etat.slug));

    // LE GARDE-FOU TIENT EN DEUX CLICS SUR LE MÊME BOUTON, jamais dans une
    // modale de confirmation : celle du CRM appelle `closeModal(true)` et
    // remplacerait l'écran, donc la saisie en cours partirait avec.
    $('#re-restaurer')?.addEventListener('click', async () => {
      if (!etat.armeRestaure) {
        relire();
        etat.armeRestaure = true;
        etat.ligne = 'Annule la DERNIÈRE publication, sur toutes les réalisations. Pas de second retour.';
        redessiner();
        return;
      }
      etat.occupe = true; redessinerAvecSaisie();
      const r = await restaurerRealisations();
      etat.occupe = false; etat.armeRestaure = false; etat.ligne = '';
      if (!r.ok) {
        redessiner();
        toast(`Restauration impossible — ${r.motif}`, 'err');
        return;
      }
      await db.recharger('rgd_realisations');
      toast('Version précédente rétablie sur le site');
      apresPublication?.();
      fermer(null);
    });

    $('#re-supprimer')?.addEventListener('click', async () => {
      if (!etat.armeSuppr) {
        relire();
        etat.armeSuppr = true;
        etat.ligne = 'Retire cette réalisation de rgdrenova.fr. Ses photos restent dans le stockage.';
        redessiner();
        return;
      }
      etat.occupe = true; redessinerAvecSaisie();
      const r = await publier({ retirer: true });
      etat.occupe = false;
      if (!r) { etat.armeSuppr = false; etat.ligne = ''; redessiner(); return; }
      toast('Réalisation retirée du site');
      apresPublication?.();
      fermer(null);
    });

    $('#re-publier')?.addEventListener('click', async () => {
      relire();
      if (!p.title) { toast('Le titre ne peut pas être vide : c’est lui qui s’affiche sur le site.', 'err'); return; }
      etat.occupe = true; redessiner();
      const r = await publier({});
      etat.occupe = false;
      if (!r) { redessiner(); return; }
      toast(etat.nouveau ? 'Créée et publiée sur rgdrenova.fr' : 'Publié sur rgdrenova.fr');
      apresPublication?.();
      fermer(r.slug);
    });

    /**
     * Relit le document à la source, y repose nos champs, publie.
     * Rend `{ slug }` en cas de succès, `null` sinon (le motif est dit par un toast).
     *
     * ⚠ ON RELIT MAINTENANT, pas à l'ouverture. Quelqu'un a pu publier pendant
     * qu'on rédigeait ; repartir du document lu tout à l'heure annulerait son
     * travail sans que personne le voie.
     */
    async function publier({ retirer = false }) {
      ligne('Relecture du document…');
      const frais = await lireRealisations();
      if (!frais.ok) { ligne(''); toast(`Document illisible — ${frais.motif}. Rien n’a été publié.`, 'err'); return null; }

      let slugFinal = etat.slug;

      if (retirer) {
        const cible = trouver(frais.donnees, etat.slug);
        if (!cible) { ligne(''); toast('Cette réalisation a déjà disparu du document.', 'err'); return null; }
        cible.cat.projects.splice(cible.i, 1);
      } else if (etat.nouveau) {
        // Le slug se fabrique à la création et ne change plus. On le rend
        // unique DANS LE DOCUMENT FRAIS : deux personnes peuvent créer la
        // même fiche en même temps, et deux projets de même slug se
        // recouvriraient sur le site comme dans le reflet.
        const base = slugifier(p.title);
        if (!base) { ligne(''); toast('Le titre ne donne aucun identifiant utilisable.', 'err'); return null; }
        slugFinal = base;
        for (let n = 2; trouver(frais.donnees, slugFinal); n++) slugFinal = `${base}-${n}`;
        const cat = (frais.donnees.categories || []).find(c => c.slug === etat.catSlug);
        if (!cat) { ligne(''); toast('La catégorie choisie n’existe plus dans le document.', 'err'); return null; }
        cat.projects = cat.projects || [];
        cat.projects.push({ ...champsEdites(), slug: slugFinal });
      } else {
        const cible = trouver(frais.donnees, etat.slug);
        if (!cible) { ligne(''); toast('Cette réalisation a disparu du document entre-temps : rien n’a été publié.', 'err'); return null; }
        // ⚠ On repose NOS CHAMPS sur la version fraîche, jamais la copie
        // entière : `slug`, `url` et tout ce que le document porterait en plus
        // viennent du document, pas de la copie ouverte il y a dix minutes.
        const fusion = { ...cible.projet, ...champsEdites() };
        if (etat.catSlug === cible.cat.slug) {
          cible.cat.projects[cible.i] = fusion;
        } else {
          const cat = (frais.donnees.categories || []).find(c => c.slug === etat.catSlug);
          if (!cat) { ligne(''); toast('La catégorie choisie n’existe plus dans le document.', 'err'); return null; }
          cible.cat.projects.splice(cible.i, 1);
          cat.projects = cat.projects || [];
          cat.projects.push(fusion);
        }
      }

      ligne('Publication…');
      const r = await enregistrerRealisations(frais.donnees);
      ligne('');
      if (!r.ok) {
        toast(r.motif.includes('42501') || /RGD/.test(r.motif)
          ? 'Réservé à l’équipe RGD : rien n’a été publié.'
          : `Non publié — ${r.motif}`, 'err');
        return null;
      }
      // ⚠ PAS D'ATTENTE : `rgd_publier_site` redéplie `rgd_realisations` dans
      // la MÊME transaction. La base est à jour avant cette ligne ; seul le
      // cache du navigateur est en retard, et on le recharge. Promettre « au
      // prochain relevé » enverrait attendre trente minutes pour rien.
      await db.recharger('rgd_realisations');
      return { slug: retirer ? null : slugFinal };
    }

    // Les champs que l'atelier possède — et rien d'autre. `slug` et `url` n'y
    // sont pas : le premier est la clé qui relie le CRM au document, le second
    // une adresse WordPress que le CRM ne fabrique pas.
    function champsEdites() {
      return {
        title: p.title, city: p.city, surface: p.surface,
        duration: p.duration, description: p.description, notes: p.notes,
        images: p.images.slice(),
        // Un tag orphelin (photo retirée entre-temps) n'a plus de sens : le
        // document ne doit porter que ce qu'il affiche.
        photo_tags: Object.fromEntries(p.images.map(u => [u, p.photo_tags[u] === 'avant' ? 'avant' : 'apres'])),
        ba_pairs: p.ba_pairs.filter(x => x.before && x.after).map(x => ({ ...x })),
        testimonial: { ...p.testimonial },
      };
    }
  }

  return {
    corps, brancher,
    get slug() { return etat.slug; },
    get nouveau() { return etat.nouveau; },
    get catSlug() { return etat.catSlug; },
  };
}
