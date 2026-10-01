// Espace RGD Renova — l'organisation du site : catégories, ordres, mises en avant
//
// POURQUOI UN PANNEAU À PART, ET PAS UN BOUT DE L'ATELIER PROJET
// L'atelier répond à « cette réalisation-là ». Ici on répond à « à quoi
// ressemble le site » : quelles pages existent, dans quel ordre, et ce qui
// s'affiche en premier. Ce sont deux gestes qu'on ne fait ni au même moment ni
// à la même fréquence — on publie un chantier toutes les semaines, on range les
// catégories deux fois par an.
//
// ⚠ LES TROIS CONTRAINTES DU DOCUMENT S'APPLIQUENT ICI AUSSI, à la lettre.
// Elles sont écrites en tête de `rgd-realisation-edit.js` : le document est
// REMPLACÉ EN ENTIER, le reflet ne suffit pas à le reconstruire (il n'a aucune
// colonne pour les descriptions de catégories — celles que cet écran édite
// justement), et il n'y a qu'UN seul niveau de retour arrière. D'où la règle
// qu'on ne contourne pas : on relit le document AU MOMENT DE PUBLIER, et on y
// repose nos champs. Jamais l'inverse.
//
// ⚠ CE QUE CET ÉCRAN NE PEUT PAS FAIRE, ET IL LE DIT
// Créer une catégorie ici ne crée PAS sa page sur rgdrenova.fr. Le site est un
// export statique : chaque catégorie est un dossier `/nos-realisations/<slug>/`
// avec son `index.html`. Tant que le dossier n'est pas déposé, la vignette de
// la catégorie mène à une page introuvable — vérifié. Le panneau affiche donc
// le chemin exact à créer, et le dit avant de publier plutôt qu'après.
import { esc, toast } from '../ui.js';
import { lireRealisations, enregistrerRealisations } from '../data/rgd-site.js';
import { db } from '../data/db.js';

// Le même découpage que l'atelier projet : un slug est une clé d'URL, donc pas
// d'accent, pas d'espace, rien qui demande à être encodé.
const slugifier = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export const TRIS = [
  ['manuel', 'Dans l’ordre choisi ici'],
  ['recent', 'Du plus récent au plus ancien'],
  ['ancien', 'Du plus ancien au plus récent'],
];

/**
 * Charge le document et rend l'éditeur.
 * Même forme que `chargerEditeur` et `chargerCarrousel` : `{ ok, editeur }`,
 * l'éditeur exposant `corps()` et `brancher(hote, opts)`.
 */
export async function chargerCategories() {
  const lu = await lireRealisations();
  if (!lu.ok) return { ok: false, motif: lu.motif };
  const cats = (lu.donnees.categories || []).map(c => ({
    slug: c.slug,
    nom: c.name || c.slug,
    description: c.description || '',
    tri: TRIS.some(([k]) => k === c.tri) ? c.tri : 'manuel',
    // On ne garde que les clés des projets : leur contenu vient du document
    // frais au moment de publier. Tenir une copie des 31 projets ici, c'est
    // s'exposer à republier une version vieille de dix minutes.
    projets: (c.projects || []).map(p => ({
      slug: p.slug, titre: p.title || '(sans titre)',
      // ⚠ `a_la_une` PORTE LE RANG, pas `true` : ce panneau ne fait que
      // l'afficher, c'est l'écran « Mises en avant » qui l'écrit.
      alaune: Number.isInteger(Number(p.a_la_une)) && Number(p.a_la_une) > 0 ? Number(p.a_la_une) : null,
      brouillon: p.brouillon === true,
    })),
    neuve: false,
  }));
  return { ok: true, editeur: editeur({ cats, ouverte: cats[0]?.slug || null, ligne: '', occupe: false }) };
}

function editeur(etat) {
  const laCat = () => etat.cats.find(c => c.slug === etat.ouverte) || null;

  const corps = () => {
    const c = laCat();
    return `<div class="cat-atelier">
      <div class="cat-tete">
        <div>
          <h2>Organisation du site</h2>
          <p class="muted small">Les pages de <b>rgdrenova.fr/nos-realisations</b> : leurs catégories,
            l’ordre des chantiers, et ce qui s’affiche en premier sur la page d’accueil.</p>
        </div>
        <button type="button" class="btn" id="cat-neuve">+ Nouvelle catégorie</button>
      </div>

      <p class="cat-avis">Créer une catégorie ici ne crée pas sa page sur le site :
        le dossier <code>/nos-realisations/&lt;adresse&gt;/</code> est à déposer sur le serveur.
        Tant qu'il n'y est pas, la catégorie reste invisible — une catégorie sans chantier
        publié ne s'affiche nulle part.</p>

      <div class="cat-liste">
        ${etat.cats.map((x, i) => `
          <div class="cat-rang${x.slug === etat.ouverte ? ' on' : ''}" data-cat="${esc(x.slug)}">
            <span class="cat-fleches">
              <button type="button" data-monte="${i}" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
              <button type="button" data-descend="${i}" ${i === etat.cats.length - 1 ? 'disabled' : ''} title="Descendre">↓</button>
            </span>
            <button type="button" class="cat-nom" data-ouvrir="${esc(x.slug)}">
              ${esc(x.nom)}${x.neuve ? ' <span class="cat-neuf">nouvelle</span>' : ''}
              <span class="muted">${x.projets.length}</span>
            </button>
          </div>`).join('')}
      </div>

      ${c ? detail(c) : '<p class="muted">Aucune catégorie.</p>'}

      <div class="cat-pied">
        <span class="cat-ligne" id="cat-ligne">${esc(etat.ligne)}</span>
        <button type="button" class="btn primary" id="cat-publier" ${etat.occupe ? 'disabled' : ''}>
          ${etat.occupe ? 'Publication…' : 'Publier sur le site'}</button>
      </div>
    </div>`;
  };

  const detail = (c) => `
    <section class="cat-detail">
      <label class="cat-champ"><span>Nom affiché</span>
        <input id="cat-nom" value="${esc(c.nom)}" maxlength="60"></label>

      <label class="cat-champ"><span>Adresse de la page</span>
        <input id="cat-slug" value="${esc(c.slug)}" ${c.neuve ? '' : 'disabled'}
          aria-describedby="cat-slug-aide"></label>
      <p class="muted small" id="cat-slug-aide">
        ${c.neuve
          ? `La page du site sera <code>/nos-realisations/${esc(c.slug || '…')}/</code>.
             ⚠ Elle n’existe pas encore : il faut y déposer le dossier modèle, sinon le lien
             tombera sur une page introuvable.`
          : `<code>/nos-realisations/${esc(c.slug)}/</code> — l’adresse ne se change plus :
             elle est dans Google et dans les liens déjà partis.`}</p>

      <label class="cat-champ"><span>Description (référencement)</span>
        <textarea id="cat-desc" rows="3" maxlength="600">${esc(c.description)}</textarea></label>
      <p class="muted small">Ce texte s’affiche en tête de la page et sert à Google.
        Il ne vit que dans ce document : il n’existe nulle part ailleurs.</p>

      <label class="cat-champ"><span>Ordre des chantiers</span>
        <select id="cat-tri">${TRIS.map(([k, l]) =>
          `<option value="${k}"${c.tri === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${c.tri === 'manuel'
        ? '<p class="muted small">Les flèches ci-dessous décident de l’ordre sur la page.</p>'
        : `<p class="muted small">⚠ Le tri se fait sur le champ <b>« Réalisé en »</b> de chaque chantier.
           Ceux qui n’en ont pas restent à la fin, dans l’ordre d’ici —
           ${c.projets.length ? 'à remplir dans l’atelier de chaque réalisation.' : ''}</p>`}

      <div class="cat-projets">
        ${c.projets.length ? c.projets.map((p, i) => `
          <div class="cat-projet">
            ${c.tri === 'manuel' ? `<span class="cat-fleches">
              <button type="button" data-pmonte="${i}" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
              <button type="button" data-pdescend="${i}" ${i === c.projets.length - 1 ? 'disabled' : ''} title="Descendre">↓</button>
            </span>` : '<span class="cat-fleches vide"></span>'}
            <span class="cat-projet-nom">${esc(p.titre)}
              ${p.brouillon ? '<span class="cat-brouillon">Brouillon</span>' : ''}</span>
            ${p.alaune ? `<span class="cat-alaune" title="Mise en avant sur la page d’accueil">★ ${p.alaune}</span>` : ''}
          </div>`).join('')
        : '<p class="muted small">Aucun chantier dans cette catégorie.</p>'}
      </div>
      <p class="muted small">⚠ <b>L’étoile se lit ici, elle ne se met pas ici.</b>
        La page d’accueil se compose dans <b>« Mises en avant »</b>, à gauche : on y voit
        les cinq vignettes d’un bloc et on les range, ce qu’une étoile posée catégorie par
        catégorie ne permettait pas.</p>

      ${c.projets.length === 0 ? `
        <button type="button" class="btn danger" id="cat-suppr" data-arme="0">Supprimer cette catégorie</button>
        <p class="muted small">Une catégorie qui porte des chantiers ne se supprime pas :
          il faudrait décider où ils vont.</p>` : ''}
    </section>`;

  function brancher(hote, opts = {}) {
    const { redessiner = () => {} } = opts;
    const $ = (s) => hote.querySelector(s);
    const ligne = (t) => { etat.ligne = t || ''; const e = $('#cat-ligne'); if (e) e.textContent = etat.ligne; };

    // ⚠ LA SAISIE EN COURS SE RELIT AVANT CHAQUE REDESSIN, jamais après : le
    // panneau est reconstruit à chaque flèche, et ce qui n'est pas relu est
    // perdu. Même règle que l'atelier des réalisations.
    const relire = () => {
      const c = laCat();
      if (!c) return;
      if ($('#cat-nom')) c.nom = $('#cat-nom').value;
      if ($('#cat-desc')) c.description = $('#cat-desc').value;
      if ($('#cat-tri')) c.tri = $('#cat-tri').value;
      if (c.neuve && $('#cat-slug')) c.slug = slugifier($('#cat-slug').value);
    };
    const refaire = () => { relire(); redessiner(); };

    hote.querySelectorAll('[data-ouvrir]').forEach(b => b.onclick = () => {
      relire(); etat.ouverte = b.dataset.ouvrir; redessiner();
    });

    const bouger = (liste, de, vers) => {
      if (vers < 0 || vers >= liste.length) return;
      const [x] = liste.splice(de, 1);
      liste.splice(vers, 0, x);
    };
    hote.querySelectorAll('[data-monte]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.monte); relire(); bouger(etat.cats, i, i - 1); redessiner();
    });
    hote.querySelectorAll('[data-descend]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.descend); relire(); bouger(etat.cats, i, i + 1); redessiner();
    });
    hote.querySelectorAll('[data-pmonte]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.pmonte); relire(); bouger(laCat().projets, i, i - 1); redessiner();
    });
    hote.querySelectorAll('[data-pdescend]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.pdescend); relire(); bouger(laCat().projets, i, i + 1); redessiner();
    });

    const tri = $('#cat-tri');
    if (tri) tri.onchange = refaire;

    const neuve = $('#cat-neuve');
    if (neuve) neuve.onclick = () => {
      relire();
      // ⚠ LE SLUG EST PROVISOIRE ET MODIFIABLE TANT QUE LA CATÉGORIE EST NEUVE :
      // il devient l'adresse d'une page du site, donc il se décide avant de
      // publier, pas après — après, on casserait un lien.
      let base = 'nouvelle-categorie';
      let s = base;
      for (let n = 2; etat.cats.some(c => c.slug === s); n++) s = `${base}-${n}`;
      etat.cats.push({ slug: s, nom: 'Nouvelle catégorie', description: '', tri: 'manuel', projets: [], neuve: true });
      etat.ouverte = s;
      redessiner();
    };

    // ⚠ DEUX CLICS SUR LE MÊME BOUTON, PAS DE `confirm()` : celui de `ui.js`
    // appelle `closeModal(true)` et remplace la fenêtre courante — le panneau
    // disparaîtrait avec tout ce qui n'a pas encore été publié. Septième
    // occurrence du piège dans ce dépôt.
    const suppr = $('#cat-suppr');
    if (suppr) suppr.onclick = () => {
      if (suppr.dataset.arme !== '1') {
        suppr.dataset.arme = '1';
        suppr.textContent = 'Confirmer la suppression';
        suppr.classList.add('arme');
        setTimeout(() => {
          if (!suppr.isConnected || suppr.dataset.arme !== '1') return;
          suppr.dataset.arme = '0';
          suppr.textContent = 'Supprimer cette catégorie';
          suppr.classList.remove('arme');
        }, 4000);
        return;
      }
      relire();
      etat.cats = etat.cats.filter(c => c.slug !== etat.ouverte);
      etat.ouverte = etat.cats[0]?.slug || null;
      redessiner();
    };

    $('#cat-publier')?.addEventListener('click', async () => {
      relire();
      const vides = etat.cats.filter(c => !c.nom.trim() || !c.slug);
      if (vides.length) { toast('Une catégorie sans nom ni adresse ne peut pas être publiée.', 'err'); return; }
      const doublons = etat.cats.map(c => c.slug).filter((s, i, t) => t.indexOf(s) !== i);
      if (doublons.length) { toast(`Deux catégories portent la même adresse : ${doublons[0]}.`, 'err'); return; }

      etat.occupe = true; redessiner();
      const r = await publier();
      etat.occupe = false;
      redessiner();
      if (!r) return;
      toast(r.neuves.length
        ? `Publié — ${r.neuves.length} page${r.neuves.length > 1 ? 's' : ''} à déposer sur le serveur`
        : 'Publié sur rgdrenova.fr');
    });

    /**
     * Relit le document à la source, y repose notre organisation, publie.
     *
     * ⚠ ON NE REPUBLIE PAS LA COPIE OUVERTE : quelqu'un a pu publier un
     * chantier pendant qu'on rangeait, et cet écran ne tient QUE des noms et
     * des ordres — le contenu des projets vient du document frais, toujours.
     * Un projet apparu entre-temps est gardé, à la fin de sa catégorie : le
     * perdre parce qu'on ne le connaissait pas serait le pire des défauts.
     */
    async function publier() {
      ligne('Relecture du document…');
      const frais = await lireRealisations();
      if (!frais.ok) { ligne(''); toast(`Document illisible — ${frais.motif}. Rien n’a été publié.`, 'err'); return null; }

      const parSlug = new Map((frais.donnees.categories || []).map(c => [c.slug, c]));
      const neuves = [];
      const categories = etat.cats.map((x) => {
        const source = parSlug.get(x.slug);
        const projetsSource = source ? (source.projects || []) : [];
        const index = new Map(projetsSource.map(p => [p.slug, p]));
        // Nos projets, dans notre ordre…
        const ordonnes = [];
        for (const p of x.projets) {
          const vrai = index.get(p.slug);
          if (!vrai) continue;           // disparu entre-temps : il n'existe plus
          index.delete(p.slug);
          // ⚠ LE PROJET EST REPOSÉ TEL QUEL : `a_la_une` appartient à l'écran
          // « Mises en avant », et deux écrans qui écrivent le même champ
          // finissent par s'effacer l'un l'autre.
          ordonnes.push(vrai);
        }
        // … puis ceux qu'on ne connaissait pas, à la fin, intacts.
        for (const reste of index.values()) ordonnes.push(reste);
        if (!source) neuves.push(x.slug);
        return {
          ...(source || {}),
          slug: x.slug,
          name: x.nom.trim(),
          description: x.description,
          // 'manuel' est le défaut : on ne l'écrit pas, un document sans la
          // clé se lit exactement pareil, côté site comme ici.
          ...(x.tri === 'manuel' ? { tri: undefined } : { tri: x.tri }),
          projects: ordonnes,
        };
      }).map(nettoyer);

      ligne('Publication…');
      const r = await enregistrerRealisations({ ...frais.donnees, categories });
      ligne('');
      if (!r.ok) {
        toast(r.motif.includes('42501') || /RGD/.test(r.motif)
          ? 'Réservé à l’équipe RGD : rien n’a été publié.'
          : `Non publié — ${r.motif}`, 'err');
        return null;
      }
      await db.recharger('rgd_realisations');
      etat.cats.forEach(c => { c.neuve = false; });
      return { neuves };
    }

    // `undefined` dans un objet part bien en JSON — mais pas dans une copie
    // faite par `{...}` sur un objet qui portait déjà la clé. On l'enlève.
    function nettoyer(c) {
      const o = { ...c };
      if (o.tri === undefined) delete o.tri;
      return o;
    }
  }

  return {
    corps, brancher,
    get slug() { return null; },
    get nouveau() { return false; },
  };
}
