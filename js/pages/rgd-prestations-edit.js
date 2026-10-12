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
  PRESTATIONS, PAGE_PRESTATIONS, RATIO_PRESTA, idDepuisTitre,
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
      // ⚠ `cle` N'EST PAS `id`, ET C'EST VOLONTAIRE. L'identifiant d'une
      // prestation créée se déduit de son nom AU MOMENT DE PUBLIER : tant
      // qu'on tape le titre, il n'existe pas encore. Une clé interne, stable
      // pour la durée de l'écran, sert donc à désigner la ligne dans le DOM et
      // dans la carte des empreintes. Employer `id` ferait perdre le suivi
      // d'une ligne dès la première lettre du nom.
      liste: lu.donnees.map((p, i) => ({ ...p, cle: p.id || 'n' + i })),
      // L'état d'origine, pour dire ce qui a bougé sans le deviner.
      origine: new Map(lu.donnees.map((p, i) => [p.id || 'n' + i, empreinte(p)])),
      ligne: '', occupe: false, compteur: 0,
    }),
  };
}

// ⚠ L'EMPREINTE PORTE AUSSI LE CONTENU DEPUIS LE 12/10/2026. Elle ne tenait
// que les deux images, ce qui suffisait quand le panneau ne changeait qu'elles ;
// une prestation créée dont on corrige le texte n'aurait pas été vue comme
// modifiée, et le bouton « Publier » serait resté éteint sur un travail réel.
const empreinte = (p) => [p.avant, p.apres, p.titre, p.texte, p.bouton].join('|');

function editeur(etat) {
  const modifiee = (p) => etat.origine.get(p.cle) !== empreinte(p);
  const complete = (p) => Boolean(p.avant && p.apres);

  const corps = () => {
    const bougees = etat.liste.filter(modifiee);
    // ⚠ UNE PRESTATION CRÉÉE SANS AUCUNE PHOTO COMPTE AUSSI, et c'est un
    // défaut vécu (12/10/2026). Le test exigeait au moins UNE image : Élodie a
    // ajouté « Ravalement de façade », publié, puis cherché sur le site pourquoi
    // rien n'apparaissait. Une création vierge n'était nommée nulle part —
    // exactement le cas où l'on ne peut PAS deviner ce qui manque, puisqu'il
    // n'y a rien à l'écran qui ressemble à un début de réponse.
    const boiteuses = etat.liste.filter(p => !complete(p) && (p.avant || p.apres || p.creee));
    return `<div class="rpr-atelier">
      <div class="rpr-tete">
        <div>
          <h2>Visuels des prestations</h2>
          <p class="muted small">Les curseurs avant/après de
            <a href="${PAGE_PRESTATIONS}" target="_blank" rel="noopener">la page « Nos prestations »</a>.
            Déposez une photo pour la remplacer. Pour les six que la page porte déjà,
            le titre et le texte vivent dans la page et ne se modifient pas d’ici ;
            une prestation que vous ajoutez porte les siens.</p>
        </div>
        <span class="grow"></span>
        ${scope.canRgd ? `<button type="button" class="btn primary" id="rpr-ajouter"
          ${etat.occupe ? 'disabled' : ''}>+ Ajouter une prestation</button>` : ''}
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
      ${/* ⚠ ON NOMME CE QUI MANQUE, PAS SEULEMENT QU'IL MANQUE. « Il manque une
            des deux photos » était faux quand il n'y en a aucune, et ne disait pas
            laquelle quand il n'en manque qu'une — on relisait la carte pour le
            savoir. */''}
      ${boiteuses.length ? `<p class="rpr-manque">⚠ ${boiteuses.map(p => {
        const quoi = !p.avant && !p.apres ? 'aucune photo déposée'
          : !p.avant ? 'il manque la photo <b>Avant</b>'
          : 'il manque la photo <b>Après</b>';
        return `<b>${esc(p.titre || 'Nouvelle prestation')}</b> — ${quoi}`;
      }).join(' · ')}. ${boiteuses.length > 1 ? 'Ces prestations ne partiront pas' : 'Cette prestation ne partira pas'}
        sur le site tant que les deux photos n'y sont pas.</p>` : ''}
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
    return `<div class="rpr-case" data-zone="${esc(p.cle)}" data-quoi="${quoi}">
      <span class="rpr-case-nom">${nom}</span>
      <div class="rpr-cadre" style="aspect-ratio:${RATIO_PRESTA}">
        ${url
          ? `<img src="${esc(url)}" alt="${esc(p.titre)} — ${nom.toLowerCase()}" loading="lazy">`
          : '<span class="rpr-vide">Aucune photo</span>'}
      </div>
      ${scope.canRgd ? `<div class="rpr-case-actions">
        <button type="button" class="btn small" data-choisir="${esc(p.cle)}|${quoi}">Remplacer…</button>
      </div>` : ''}
    </div>`;
  };

  // ⚠ LES CHAMPS DE CONTENU N'EXISTENT QUE SUR UNE PRESTATION CRÉÉE. Les
  // offrir sur les six donnerait un enregistrement qui répond « ok » sans rien
  // changer — la page garde les siens, écrits dans son HTML, et on afficherait
  // deux titres pour une même prestation.
  const contenu = (p) => !p.creee ? '' : `
    <div class="rpr-contenu">
      <label class="mail-champ plein"><span>Nom de la prestation</span>
        <input data-champ="titre" data-cle="${esc(p.cle)}" value="${esc(p.titre || '')}"
          placeholder="Carrelage · Faïence" maxlength="60"></label>
      <label class="mail-champ plein"><span>Texte de présentation</span>
        <textarea data-champ="texte" data-cle="${esc(p.cle)}" rows="3"
          placeholder="Ce que RGD Renova fait pour cette prestation, en trois ou quatre phrases."
        >${esc(p.texte || '')}</textarea></label>
      <label class="mail-champ plein"><span>Libellé du bouton</span>
        <input data-champ="bouton" data-cle="${esc(p.cle)}" value="${esc(p.bouton || '')}"
          placeholder="Refaire mes sols et murs" maxlength="48"></label>
      <p class="muted small">Le bouton mène à la page « Demandez un devis », comme les autres.</p>
    </div>`;

  const carte = (p) => `
    <section class="rpr-carte${modifiee(p) ? ' est-modifiee' : ''}${p.creee ? ' est-creee' : ''}">
      <header class="rpr-carte-tete">
        <span class="rpr-num">${esc(p.num)}</span>
        <b>${esc(p.titre || (p.creee ? 'Nouvelle prestation' : ''))}</b>
        ${p.creee ? '<span class="chip accent">Ajoutée depuis le CRM</span>' : ''}
        ${modifiee(p)
          ? `<span class="chip amber">${complete(p) ? 'À publier' : 'Incomplète'}</span>`
          : ''}
        ${p.creee ? '' : `<a class="rpr-ancre muted small" href="${PAGE_PRESTATIONS}#${encodeURIComponent(p.id)}"
           target="_blank" rel="noopener">Voir sur le site</a>`}
        ${p.creee && scope.canRgd
          ? `<button type="button" class="pat-x" data-retirer="${esc(p.cle)}"
               title="Retirer cette prestation">✕</button>`
          : ''}
      </header>
      ${contenu(p)}
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

    const deposer = async (cle, quoi, fichier) => {
      if (!fichier) return;
      const p = etat.liste.find(x => x.cle === cle);
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
      const [cle, quoi] = String(champ.dataset.cible || '').split('|');
      const f = champ.files && champ.files[0];
      champ.value = '';
      if (cle && quoi) deposer(cle, quoi, f);
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

    // ⚠ LA SAISIE N'EST PAS REDESSINÉE À LA FRAPPE. `input` part à chaque
    // lettre ; redessiner là remplacerait le champ sous le doigt et emporterait
    // le curseur avec lui — défaut déjà payé sur le montant de la fiche projet
    // BTP. On écrit dans l'état, et seul le bouton « Publier » est réveillé.
    hote.querySelectorAll('[data-champ]').forEach(el => {
      el.oninput = () => {
        const p = etat.liste.find(x => x.cle === el.dataset.cle);
        if (!p) return;
        p[el.dataset.champ] = el.value;

        // ⚠ LE TITRE DE L'EN-TÊTE SUIT LA FRAPPE, EN PLACE. Il est rendu au
        // dessin et l'écran ne se redessine pas à chaque lettre — un redessin
        // remplacerait le champ sous le doigt et emporterait le curseur. Sans
        // cette ligne, la carte s'intitulerait « Nouvelle prestation » alors
        // que son nom est écrit juste en dessous.
        if (el.dataset.champ === 'titre') {
          const tete = el.closest('.rpr-carte')?.querySelector('.rpr-carte-tete b');
          if (tete) tete.textContent = p.titre || 'Nouvelle prestation';
        }

        const b = $('#rpr-publier');
        if (b) b.disabled = etat.occupe || !etat.liste.some(modifiee);
      };
    });

    // ⚠ ELLE NAÎT SANS IDENTIFIANT : celui-ci se déduit du nom au moment de
    // publier (`idDepuisTitre`), parce qu'il n'y a pas de nom tant qu'on n'a
    // pas tapé. La clé interne, elle, existe tout de suite — c'est elle qui
    // désigne la ligne dans le DOM.
    $('#rpr-ajouter')?.addEventListener('click', () => {
      etat.compteur += 1;
      etat.liste.push({
        cle: 'neuve-' + etat.compteur,
        id: '', creee: true,
        num: ('0' + (etat.liste.length + 1)).slice(-2),
        titre: '', texte: '', bouton: '', avant: '', apres: '',
      });
      redessiner();
      hote.querySelector('.rpr-carte.est-creee:last-of-type [data-champ="titre"]')?.focus();
    });

    // ⚠ RETIRER N'EFFACE RIEN EN LIGNE TANT QU'ON N'A PAS PUBLIÉ, et l'écran
    // ne le prétend pas : la ligne quitte l'état, et c'est la publication qui
    // fait disparaître la section du site — le script ne crée que ce que le
    // document nomme. Deux clics sur le même bouton, jamais le `confirm()` de
    // `ui.js` : il remplacerait le panneau et sa saisie.
    hote.querySelectorAll('[data-retirer]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.arme !== '1') {
          b.dataset.arme = '1';
          b.textContent = 'Retirer ?';
          b.classList.add('arme');
          setTimeout(() => {
            if (!b.isConnected || b.dataset.arme !== '1') return;
            b.dataset.arme = '0'; b.textContent = '✕'; b.classList.remove('arme');
          }, 4000);
          return;
        }
        etat.liste = etat.liste.filter(x => x.cle !== b.dataset.retirer);
        redessiner();
      };
    });

    $('#rpr-publier')?.addEventListener('click', async () => {
      const sansNom = etat.liste.filter(p => p.creee && !p.titre.trim());
      if (sansNom.length) {
        toast('Donnez un nom à la prestation ajoutée : sans lui, rien ne peut être créé sur le site.', 'err');
        return;
      }
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
      // ⚠ « PUBLIÉ » TOUT COURT ÉTAIT TROMPEUR quand une prestation reste de
      // côté : le 12/10/2026 une création sans photo a été publiée, le message a
      // dit « Publié sur rgdrenova.fr », le panneau s'est fermé, et il a fallu
      // aller lire la base pour comprendre pourquoi le site ne montrait rien.
      // Le message nomme désormais ce qui n'est pas parti.
      const restees = etat.liste.filter(p => !p.avant || !p.apres);
      toast(restees.length
        ? `Publié — ${restees.map(p => p.titre || 'une prestation ajoutée').join(', ')} n'est pas en ligne : il y manque une photo.`
        : 'Publié sur rgdrenova.fr');
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
    get sale() { return etat.liste.some(modifiee) || etat.liste.some(p => p.creee && !etat.origine.has(p.cle)); },
  };
}
