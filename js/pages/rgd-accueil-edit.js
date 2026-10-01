// Espace RGD Renova — ce que la page d'accueil met en avant
//
// POURQUOI UN ÉCRAN À LUI SEUL
// Une première version posait une étoile sous chaque catégorie, dans le panneau
// d'organisation. Élodie, en le voyant : « je crois que tu n'as pas compris
// pour la mise en avant des dernières réalisations, je voudrais avoir la
// possibilité de choisir les dernières réalisations parmi TOUTES les
// réalisations du site ». Elle avait raison : pour composer cinq vignettes il
// fallait ouvrir les cinq catégories l'une après l'autre, sans jamais voir la
// sélection en entier.
//
// ⚠ UNE SÉLECTION DE CINQ CHOSES SE REGARDE D'UN BLOC. Cet écran montre donc
// deux listes : ce qui est retenu, dans l'ordre, et toute la bibliothèque en
// dessous. Ranger la commande là où vit la donnée — dans la catégorie — était
// logique pour la base, pas pour la personne qui compose une page d'accueil.
//
// ⚠ L'ORDRE EST LA MOITIÉ DE LA DEMANDE, pas un supplément : choisir cinq
// chantiers sans dire lequel passe en premier, c'est laisser l'ordre des
// catégories décider à sa place.
//
// ⚠ `a_la_une` PORTE LE RANG, PAS `true` — dans le document, dans la base et
// dans la réponse publique. Un booléen « est choisi » à côté d'un entier « à
// quelle place » aurait été deux vérités sur la même chose.
//
// Les trois contraintes du document s'appliquent (voir `rgd-realisation-edit.js`) :
// il est remplacé en entier, le reflet ne suffit pas à le reconstruire, et il
// n'y a qu'un seul niveau de retour arrière. D'où la règle : on relit au moment
// de publier, et on y repose nos champs.
import { esc, toast, terms, hit } from '../ui.js';
import { lireRealisations, enregistrerRealisations } from '../data/rgd-site.js';
import { db } from '../data/db.js';

// Ce que la page d'accueil affiche au plus. ⚠ C'EST `NOMBRE` DANS
// `assets/rgd-realisations.js`, CÔTÉ SITE : les deux doivent dire le même
// nombre, sinon l'écran promet une sixième vignette que personne ne verra.
export const VIGNETTES_ACCUEIL = 5;

export async function chargerAccueil() {
  const lu = await lireRealisations();
  if (!lu.ok) return { ok: false, motif: lu.motif };

  // Tous les chantiers du site, à plat, avec leur catégorie. ⚠ LES BROUILLONS
  // SONT ÉCARTÉS : ils ne sortent pas sur le site (la porte publique les
  // filtre), donc les proposer serait offrir un choix sans effet.
  const tous = [];
  for (const cat of lu.donnees.categories || []) {
    for (const p of cat.projects || []) {
      if (!p.slug || p.brouillon === true) continue;
      const rang = Number(p.a_la_une);
      tous.push({
        slug: p.slug, titre: p.title || '(sans titre)',
        ville: p.city || '', categorie: cat.name || cat.slug,
        rang: Number.isInteger(rang) && rang > 0 ? rang : null,
      });
    }
  }
  const choisis = tous.filter(p => p.rang).sort((a, b) => a.rang - b.rang).map(p => p.slug);
  return { ok: true, editeur: editeur({ tous, choisis, q: '', ligne: '', occupe: false }) };
}

function editeur(etat) {
  const parSlug = () => new Map(etat.tous.map(p => [p.slug, p]));

  const corps = () => {
    const index = parSlug();
    const retenus = etat.choisis.map(s => index.get(s)).filter(Boolean);
    const mots = terms(etat.q);
    const reste = etat.tous.filter(p => !etat.choisis.includes(p.slug))
      .filter(p => hit([p.titre, p.ville, p.categorie], mots));

    return `<div class="acc-atelier">
      <div class="acc-tete">
        <div>
          <h2>Mises en avant — page d’accueil</h2>
          <p class="muted small">Le bloc « Nos dernières réalisations » de
            <b>rgdrenova.fr</b> montre les <b>${VIGNETTES_ACCUEIL} premières</b> de cette liste,
            dans cet ordre.</p>
        </div>
      </div>

      <section class="acc-choix">
        <h3>Choisies <span class="muted">${retenus.length}</span></h3>
        ${retenus.length ? retenus.map((p, i) => `
          <div class="acc-ligne${i >= VIGNETTES_ACCUEIL ? ' est-hors' : ''}">
            <span class="acc-place">${i + 1}</span>
            <span class="cat-fleches">
              <button type="button" data-monte="${i}" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
              <button type="button" data-descend="${i}" ${i === retenus.length - 1 ? 'disabled' : ''} title="Descendre">↓</button>
            </span>
            <span class="acc-nom">${esc(p.titre)}
              <span class="muted">${esc([p.ville, p.categorie].filter(Boolean).join(' · '))}</span></span>
            <button type="button" class="acc-retirer" data-retirer="${esc(p.slug)}"
              title="Retirer de la page d’accueil">✕</button>
          </div>`).join('')
        : `<p class="muted small">Aucune. L’accueil montre alors les
            ${VIGNETTES_ACCUEIL} premiers chantiers du site, comme aujourd’hui —
            il ne reste jamais vide.</p>`}
        ${retenus.length > VIGNETTES_ACCUEIL
          ? `<p class="acc-avis">⚠ Les ${retenus.length - VIGNETTES_ACCUEIL} dernières ne s’afficheront pas :
             l’accueil s’arrête à ${VIGNETTES_ACCUEIL}. Elles restent ici, prêtes à remonter.</p>` : ''}
      </section>

      <section class="acc-source">
        <h3>Toutes les réalisations <span class="muted">${etat.tous.length}</span></h3>
        <input type="search" id="acc-q" value="${esc(etat.q)}" placeholder="Chercher un chantier, une ville…">
        <div class="acc-liste">
          ${reste.length ? reste.map(p => `
            <button type="button" class="acc-item" data-ajouter="${esc(p.slug)}">
              <span class="acc-plus">+</span>
              <span class="acc-nom">${esc(p.titre)}
                <span class="muted">${esc([p.ville, p.categorie].filter(Boolean).join(' · '))}</span></span>
            </button>`).join('')
          : `<p class="muted small">${etat.q ? 'Aucun chantier ne correspond.' : 'Tous les chantiers sont déjà choisis.'}</p>`}
        </div>
        <p class="muted small">Les brouillons n’y sont pas : ils ne sortent pas sur le site,
          les proposer serait offrir un choix sans effet.</p>
      </section>

      <div class="cat-pied">
        <span class="cat-ligne" id="acc-ligne">${esc(etat.ligne)}</span>
        <button type="button" class="btn primary" id="acc-publier" ${etat.occupe ? 'disabled' : ''}>
          ${etat.occupe ? 'Publication…' : 'Publier sur le site'}</button>
      </div>
    </div>`;
  };

  function brancher(hote, opts = {}) {
    const { redessiner = () => {} } = opts;
    const $ = (s) => hote.querySelector(s);
    const ligne = (t) => { etat.ligne = t || ''; const e = $('#acc-ligne'); if (e) e.textContent = etat.ligne; };

    hote.querySelectorAll('[data-ajouter]').forEach(b => b.onclick = () => {
      etat.choisis.push(b.dataset.ajouter);
      redessiner();
    });
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      etat.choisis = etat.choisis.filter(s => s !== b.dataset.retirer);
      redessiner();
    });
    const bouger = (de, vers) => {
      if (vers < 0 || vers >= etat.choisis.length) return;
      const [x] = etat.choisis.splice(de, 1);
      etat.choisis.splice(vers, 0, x);
      redessiner();
    };
    hote.querySelectorAll('[data-monte]').forEach(b => b.onclick = () => bouger(Number(b.dataset.monte), Number(b.dataset.monte) - 1));
    hote.querySelectorAll('[data-descend]').forEach(b => b.onclick = () => bouger(Number(b.dataset.descend), Number(b.dataset.descend) + 1));

    // ⚠ LA RECHERCHE REDESSINE, DONC LE CURSEUR SE REMET : sans ça, taper la
    // deuxième lettre se ferait dans un champ qui vient d'être reconstruit, et
    // le curseur repartirait au début. Même remède que la barre de recherche
    // des autres écrans.
    const q = $('#acc-q');
    if (q) q.oninput = () => {
      etat.q = q.value;
      redessiner();
      const neuf = hote.querySelector('#acc-q');
      if (neuf) { neuf.focus(); neuf.setSelectionRange(neuf.value.length, neuf.value.length); }
    };

    $('#acc-publier')?.addEventListener('click', async () => {
      etat.occupe = true; redessiner();
      const r = await publier();
      etat.occupe = false; redessiner();
      if (r) toast(etat.choisis.length ? 'Mises en avant publiées' : 'Mises en avant retirées');
    });

    /**
     * Relit le document, y repose les rangs, publie.
     *
     * ⚠ ON NE TOUCHE QU'À `a_la_une`, projet par projet : cet écran ne connaît
     * ni les photos, ni les descriptions, ni l'ordre des catégories. Reposer
     * autre chose écraserait le travail de quelqu'un qui publiait pendant qu'on
     * composait la page d'accueil.
     * ⚠ UN CHANTIER DISPARU ENTRE-TEMPS EST SIMPLEMENT SAUTÉ : il ne reste pas
     * un trou dans la numérotation, les rangs se recalculent à la suite.
     */
    async function publier() {
      ligne('Relecture du document…');
      const frais = await lireRealisations();
      if (!frais.ok) { ligne(''); toast(`Document illisible — ${frais.motif}. Rien n’a été publié.`, 'err'); return null; }

      const place = new Map();
      let n = 0;
      for (const slug of etat.choisis) place.set(slug, ++n);

      for (const cat of frais.donnees.categories || []) {
        for (const p of cat.projects || []) {
          const rang = place.get(p.slug);
          if (rang) p.a_la_une = rang;
          else if (p.a_la_une !== undefined) delete p.a_la_une;
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
      await db.recharger('rgd_realisations');
      // L'état local suit ce qui vient d'être écrit : les rangs sont maintenant
      // ceux de la liste, dans l'ordre, sans trou.
      etat.tous.forEach(p => { p.rang = place.get(p.slug) || null; });
      return { ok: true };
    }
  }

  return {
    corps, brancher,
    get slug() { return null; },
    get nouveau() { return false; },
  };
}
