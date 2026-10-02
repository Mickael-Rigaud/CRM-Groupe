// Espace RGD Renova — les visuels avant/après de la page « Nos prestations »
//
// POURQUOI UN PANNEAU DE PLUS DANS L'ATELIER
// Demandé par Mickael le 02/10/2026 : « pour les images de la page
// /nos-prestations/ je voudrais avoir la possibilité de les modifier moi-même
// depuis le CRM Groupe ». Elles étaient écrites en dur dans le fichier HTML de
// l'export statique : les changer demandait de rouvrir la page et de la
// redéposer par FTP — c'est-à-dire de passer par quelqu'un.
//
// ⚠ CE PANNEAU NE CHANGE QUE LES IMAGES, ET IL LE DIT. Le titre, le texte et
// le bouton de chaque prestation vivent dans la page statique ; les offrir ici
// donnerait un enregistrement qui répond « ok » sans rien changer — le défaut
// qui tenait une demande du site en lecture seule jusqu'au 25/09.
//
// ⚠ ON REMPLACE PAR PAIRE, JAMAIS PAR MOITIÉ. Le curseur superpose deux
// photos dans le même cadre : n'en changer qu'une donnerait un « avant » neuf
// glissé sur un « après » d'un autre chantier. Une prestation dont une seule
// image est déposée n'est donc pas publiée, et l'écran l'écrit.
//
// ⚠ LA PAGE GARDE SES IMAGES TANT QU'ON NE PUBLIE RIEN. Le script du site
// n'ENLÈVE jamais : une prestation absente du document, ou dont la réponse
// n'arrive pas, reste celle du fichier HTML. C'est la règle déjà posée pour le
// menu des catégories — un script de page capable de vider ce qu'il décore est
// pire que pas de script.
import { esc, toast } from '../ui.js';
import { scope } from '../data/scope.js';
import {
  PRESTATIONS, PAGE_PRESTATIONS, RATIO_PRESTA,
  lirePrestations, enregistrerPrestations, restaurerPrestations,
} from '../data/rgd-prestations.js';
import { deposerPhotosRealisations } from '../data/rgd-site.js';

/**
 * Charge le document et rend l'éditeur.
 * Même forme que `chargerEditeur`, `chargerCarrousel` et `chargerCategories` :
 * `{ ok, editeur }`, l'éditeur exposant `corps()` et `brancher(hote, opts)`.
 */
export async function chargerPrestations() {
  const lu = await lirePrestations();
  if (!lu.ok) return { ok: false, motif: lu.motif };
  return {
    ok: true,
    editeur: editeur({
      liste: lu.donnees.map(p => ({ ...p })),
      // L'état d'origine, pour dire ce qui a bougé sans le deviner.
      origine: new Map(lu.donnees.map(p => [p.id, `${p.avant}|${p.apres}`])),
      ligne: '', occupe: false,
    }),
  };
}

function editeur(etat) {
  const modifiee = (p) => etat.origine.get(p.id) !== `${p.avant}|${p.apres}`;
  const complete = (p) => Boolean(p.avant && p.apres);

  const corps = () => {
    const bougees = etat.liste.filter(modifiee);
    const boiteuses = etat.liste.filter(p => (p.avant || p.apres) && !complete(p));
    return `<div class="rpr-atelier">
      <div class="rpr-tete">
        <div>
          <h2>Visuels des prestations</h2>
          <p class="muted small">Les six curseurs avant/après de
            <a href="${PAGE_PRESTATIONS}" target="_blank" rel="noopener">la page « Nos prestations »</a>.
            Déposez une photo pour la remplacer ; le reste de la page — titres, textes,
            boutons — ne se modifie pas d’ici.</p>
        </div>
      </div>

      <p class="rpr-avis">Une prestation se publie <b>par paire</b> : tant que l’avant et
        l’après ne sont pas tous les deux déposés, la page garde ses images actuelles.</p>

      <div class="rpr-liste">
        ${etat.liste.map(p => carte(p)).join('')}
      </div>

      <div class="rpr-pied">
        <span class="cat-ligne" id="rpr-ligne">${esc(etat.ligne)}</span>
        <button type="button" class="btn" id="rpr-annuler" data-arme="0"
          ${etat.occupe ? 'disabled' : ''}>Revenir à la version précédente…</button>
        <button type="button" class="btn primary" id="rpr-publier"
          ${etat.occupe || !bougees.length ? 'disabled' : ''}>
          ${etat.occupe ? 'Publication…'
            // ⚠ LE COMPTE EST CELUI DES PRESTATIONS QU'ON VIENT DE TOUCHER,
            // pas de ce qui part : le document est republié en entier, comme
            // les deux autres. « Publier 1 prestation » se lirait « seule
            // celle-ci sera en ligne », ce qui est faux et inquiétant.
            : bougees.length ? `Publier ${bougees.length} changement${bougees.length > 1 ? 's' : ''}`
            : 'Publier sur le site'}</button>
      </div>
      ${boiteuses.length ? `<p class="rpr-manque">⚠ ${boiteuses.map(p => esc(p.titre)).join(', ')} :
        il manque une des deux photos — cette prestation ne partira pas.</p>` : ''}
      <p class="muted small">Le retour arrière ne remonte que d’un cran : deux publications
        de suite, et la version d’avant n’existe plus nulle part.</p>
    </div>`;
  };

  // ⚠ LE CADRE DE L'APERÇU REPREND CELUI DU SITE (940 × 788, `cover`) : une
  // vignette carrée montrerait un cadrage que la page ne fera pas, et on
  // choisirait une photo sur une image qui n'est pas celle qui sera publiée.
  const vignette = (p, quoi) => {
    const url = p[quoi];
    const nom = quoi === 'avant' ? 'Avant' : 'Après';
    return `<div class="rpr-case" data-zone="${esc(p.id)}" data-quoi="${quoi}">
      <span class="rpr-case-nom">${nom}</span>
      <div class="rpr-cadre" style="aspect-ratio:${RATIO_PRESTA}">
        ${url
          ? `<img src="${esc(url)}" alt="${esc(p.titre)} — ${nom.toLowerCase()}" loading="lazy">`
          : '<span class="rpr-vide">Aucune photo</span>'}
      </div>
      ${scope.canRgd ? `<div class="rpr-case-actions">
        <button type="button" class="btn small" data-choisir="${esc(p.id)}|${quoi}">Remplacer…</button>
      </div>` : ''}
    </div>`;
  };

  const carte = (p) => `
    <section class="rpr-carte${modifiee(p) ? ' est-modifiee' : ''}">
      <header class="rpr-carte-tete">
        <span class="rpr-num">${esc(p.num)}</span>
        <b>${esc(p.titre)}</b>
        ${modifiee(p)
          ? `<span class="chip amber">${complete(p) ? 'À publier' : 'Incomplète'}</span>`
          : ''}
        <a class="rpr-ancre muted small" href="${PAGE_PRESTATIONS}#${encodeURIComponent(p.id)}"
           target="_blank" rel="noopener">Voir sur le site</a>
      </header>
      <div class="rpr-paire">
        ${vignette(p, 'avant')}
        ${vignette(p, 'apres')}
      </div>
    </section>`;

  function brancher(hote, opts = {}) {
    const { redessiner = () => {}, fermer = () => {} } = opts;
    const $ = (s) => hote.querySelector(s);
    const ligne = (t) => { etat.ligne = t || ''; const e = $('#rpr-ligne'); if (e) e.textContent = etat.ligne; };

    // ⚠ UN SEUL CHAMP DE FICHIER POUR LES DOUZE CASES, replacé à chaque clic :
    // douze `<input type="file">` dans la page coûteraient douze gestionnaires
    // à rebrancher à chaque redessin, et le panneau est redessiné à chaque
    // dépôt. Celui-ci vit hors du flux et ne porte qu'une cible.
    let champ = hote.querySelector('#rpr-fichier');
    if (!champ) {
      champ = document.createElement('input');
      champ.type = 'file';
      champ.id = 'rpr-fichier';
      champ.accept = 'image/jpeg,image/png,image/webp,image/avif';
      champ.hidden = true;
      hote.appendChild(champ);
    }

    const deposer = async (id, quoi, fichier) => {
      if (!fichier) return;
      const p = etat.liste.find(x => x.id === id);
      if (!p) return;
      ligne(`Dépôt de ${fichier.name}…`);
      const r = await deposerPhotosRealisations([fichier]);
      ligne('');
      if (!r.ok) { toast(`Photo non déposée — ${r.motif}`, 'err'); return; }
      p[quoi] = r.donnees.urls[0];
      redessiner();
      toast('Photo déposée — elle n’est pas encore en ligne, publiez pour la mettre sur le site.');
    };

    champ.onchange = () => {
      const [id, quoi] = String(champ.dataset.cible || '').split('|');
      const f = champ.files && champ.files[0];
      champ.value = '';
      if (id && quoi) deposer(id, quoi, f);
    };

    hote.querySelectorAll('[data-choisir]').forEach(b => b.onclick = () => {
      champ.dataset.cible = b.dataset.choisir;
      champ.click();
    });

    // ⚠ LA CIBLE DU GLISSER EST LA CASE ENTIÈRE, pas son titre — le défaut
    // déjà payé sur la fiche projet BTP le 30/09 : `data-zone` était posé sur
    // le libellé, le dépôt n'avait donc aucun écouteur et le retour visuel ne
    // s'allumait jamais, alors que le clic, lui, marchait.
    // ⚠ Et `dragover` DOIT ÊTRE ANNULÉ pour que `drop` existe : sans
    // `preventDefault`, le navigateur ouvre le fichier dans l'onglet et le
    // panneau entier est perdu.
    if (scope.canRgd) hote.querySelectorAll('.rpr-case').forEach(z => {
      z.ondragover = (e) => { e.preventDefault(); z.classList.add('survol'); };
      z.ondragleave = () => z.classList.remove('survol');
      z.ondrop = (e) => {
        e.preventDefault();
        z.classList.remove('survol');
        deposer(z.dataset.zone, z.dataset.quoi, e.dataTransfer?.files?.[0]);
      };
    });

    $('#rpr-publier')?.addEventListener('click', async () => {
      const partantes = etat.liste.filter(p => p.avant && p.apres);
      if (!partantes.length) { toast('Aucune prestation complète à publier.', 'err'); return; }
      etat.occupe = true; redessiner();
      ligne('Publication…');
      const r = await enregistrerPrestations(etat.liste);
      etat.occupe = false;
      ligne('');
      if (!r.ok) {
        redessiner();
        toast(/42501|RGD/.test(r.motif)
          ? 'Réservé à l’équipe RGD : rien n’a été publié.'
          : `Non publié — ${r.motif}`, 'err');
        return;
      }
      toast('Publié sur rgdrenova.fr');
      fermer();
    });

    // ⚠ DEUX CLICS SUR LE MÊME BOUTON, PAS DE `confirm()` : celui de `ui.js`
    // appelle `closeModal(true)` et remplace la fenêtre courante — le panneau
    // disparaîtrait. Dixième occurrence du piège dans ce dépôt.
    const annuler = $('#rpr-annuler');
    if (annuler) annuler.onclick = async () => {
      if (annuler.dataset.arme !== '1') {
        annuler.dataset.arme = '1';
        annuler.textContent = 'Confirmer le retour arrière';
        annuler.classList.add('arme');
        setTimeout(() => {
          if (!annuler.isConnected || annuler.dataset.arme !== '1') return;
          annuler.dataset.arme = '0';
          annuler.textContent = 'Revenir à la version précédente…';
          annuler.classList.remove('arme');
        }, 4000);
        return;
      }
      ligne('Retour arrière…');
      const r = await restaurerPrestations();
      ligne('');
      if (!r.ok) { toast(`Retour impossible — ${r.motif}`, 'err'); return; }
      toast('Version précédente rétablie sur le site');
      fermer();
    };
  }

  return {
    corps, brancher,
    get slug() { return null; },
    get nouveau() { return false; },
    // Rien de ce qui est dans cet écran n'est perdu sans qu'on l'ait voulu :
    // une photo déposée vit déjà dans le stockage, mais la PAIRE choisie, elle,
    // n'existe que dans cet état tant qu'on n'a pas publié.
    get sale() { return etat.liste.some(p => etat.origine.get(p.id) !== `${p.avant}|${p.apres}`); },
  };
}
