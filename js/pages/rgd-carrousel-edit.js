// Espace RGD Renova — le carrousel de la page d'accueil
//
// ⚠ PUBLIER ICI, C'EST ÉCRIRE SUR LA PAGE D'ACCUEIL DE rgdrenova.fr.
// Ces images défilent en haut du site, dans cet ordre. Il n'y a pas de
// brouillon : on publie, ça part.
//
// MÊME MÉCANIQUE QUE LES RÉALISATIONS, ET LES MÊMES TROIS CONTRAINTES
// Le document est remplacé EN ENTIER (une liste amputée retire du site les
// photos manquantes), le reflet `rgd_carrousel` ne sert qu'à l'affichage, et
// le retour arrière ne remonte que d'UN cran. On relit donc la source au
// moment de publier, jamais seulement à l'ouverture.
//
// ⚠ UNE CONTRAINTE DE PLUS, PROPRE AU CARROUSEL, ET ELLE NE SE VOIT PAS.
// `rgd_carrousel` a une clé unique sur `url` et un `on conflict do nothing` :
// deux fois la même photo dans la liste, et la seconde n'apparaît PAS dans le
// CRM alors qu'elle est bien sur le site. L'écran refuse donc les doublons —
// une liste qui ne se relit pas telle qu'elle a été écrite est un piège.
//
// POURQUOI « REPRENDRE LES PHOTOS DES CHANTIERS » N'A PAS ÉTÉ REPRIS
// L'application d'origine a un bouton qui remplace toute la liste par une
// photo « après » par chantier. Il écrase les légendes — écrites une à une,
// et ce sont elles que lisent Google et les lecteurs d'écran. Le jour où il
// faut repartir de zéro, on ajoute les photos à la main ; le reste du temps,
// ce bouton ne sert qu'à perdre du travail.
import { esc, toast } from '../ui.js';
import { db } from '../data/db.js';
import { lienPhoto } from './rgd-espace.js';
import { lireCarrousel, enregistrerCarrousel, restaurerCarrousel,
         deposerPhotosRealisations } from '../data/rgd-site.js';

const MAX_OCTETS = 20 * 1024 * 1024;
const FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_IMAGES = 60;          // la borne du site, dite avant d'être atteinte
const MAX_LEGENDE = 160;        // la légende sert d'attribut `alt` : elle est coupée à 160

/** Prépare l'atelier du carrousel. Rend `{ ok, editeur }` ou `{ ok: false, motif }`. */
export async function chargerCarrousel() {
  const lu = await lireCarrousel();
  if (!lu.ok) return { ok: false, motif: lu.motif };

  const images = (lu.donnees.images || [])
    .filter(i => i && typeof i.url === 'string' && i.url.trim())
    .map(i => ({ url: i.url.trim(), legende: String(i.legende || '') }));

  // ⚠ DÉPOSER ET PUBLIER SONT LE MÊME DROIT DEPUIS LE 24/09/2026. Le dépôt
  // passait par le worker Cloudflare, qui exigeait un compte de l'application
  // RGD au même email ; il passe maintenant par le bucket Supabase, gardé par
  // `has_activity('rgd')` — comme publier. Le bouton n'a donc plus de raison
  // de se cacher, et le garde reste posé en base.
  return { ok: true, editeur: editeur({ images, ligne: '', armeRestaure: false, occupe: false }) };
}

function editeur(etat) {
  const corps = () => {
    const n = etat.images.length;
    // Un doublon existant (posé ailleurs, ou avant ce garde-fou) ne se voit
    // pas dans le CRM : la ligne en trop est avalée par le reflet. On le dit.
    const doublons = n - new Set(etat.images.map(i => i.url)).size;
    return `
    <div class="rea-fiche-tete">
      <div>
        <h2>Carrousel du site</h2>
        <p class="muted small">${n} image${n > 1 ? 's' : ''}, dans l’ordre d’affichage
        sur la page d’accueil de rgdrenova.fr</p>
      </div>
      <span class="grow"></span>
      <a class="btn ghost sm" href="https://rgdrenova.fr/" target="_blank" rel="noopener">↗ Voir le site</a>
    </div>

    ${doublons > 0 ? `<div class="alert"><b>!</b><div>${doublons} image${doublons > 1 ? 's apparaissent' : ' apparaît'}
      deux fois dans la liste. Le site les affichera, mais le CRM n’en montrera
      qu’une : retirez le doublon pour que les deux vues concordent.</div></div>` : ''}

    <div class="toolbar" style="margin:12px 0">
      <button type="button" class="btn ghost" id="ca-ajouter">Ajouter des photos…</button>
      <input type="file" id="ca-fichiers" accept="image/*" multiple hidden>
      <input id="ca-url" class="rea-url" placeholder="…ou coller l’adresse d’une image">
      <button type="button" class="btn ghost" id="ca-url-ok">+ Ajouter l’adresse</button>
    </div>

    ${etat.images.length ? `<div class="car-liste" id="ca-liste">${etat.images.map((im, i) => `
      <div class="car-ligne" draggable="true" data-i="${i}">
        <span class="car-poignee" title="Glisser pour changer l’ordre">⠿</span>
        <span class="car-rang">${i + 1}</span>
        <img src="${esc(lienPhoto(im.url))}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <input class="car-legende" data-legende="${i}" maxlength="${MAX_LEGENDE}"
               value="${esc(im.legende)}"
               placeholder="Décrivez la photo (ex. Rénovation d’une salle de bain à Senlis)">
        <button type="button" class="rea-fleche" data-monter="${i}" ${i === 0 ? 'disabled' : ''} title="Monter">↑</button>
        <button type="button" class="rea-fleche" data-descendre="${i}" ${i === etat.images.length - 1 ? 'disabled' : ''} title="Descendre">↓</button>
        <button type="button" class="btn ghost sm" data-retirer="${i}" title="Retirer">✕</button>
      </div>`).join('')}</div>`
      : '<div class="empty">Aucune image dans le carrousel.</div>'}

    <p class="small photos-ko" data-photos-ko hidden></p>
    <p class="small muted">Glissez une ligne pour changer l’ordre, ou utilisez les
    flèches. ${MAX_IMAGES} images au maximum. Une photo retirée d’ici reste dans le
    stockage et sur les réalisations où elle figure. La légende sert d’attribut
    <code>alt</code> : c’est elle que lisent Google et les lecteurs d’écran.</p>

    <div class="form-actions rea-pied">
      <button type="button" class="btn ghost" id="ca-annuler">Annuler</button>
      <button type="button" class="btn ghost${etat.armeRestaure ? ' danger' : ''}" id="ca-restaurer">${
        etat.armeRestaure ? 'Confirmer le retour arrière' : 'Restaurer la version précédente…'}</button>
      <span class="grow"></span>
      <span class="muted small" id="ca-ligne">${esc(etat.ligne)}</span>
      <button type="button" class="btn primary" id="ca-publier" ${etat.occupe ? 'disabled' : ''}>Publier sur le site</button>
    </div>`;
  };

  function brancher(hote, opts = {}) {
    const { redessiner = () => {}, fermer = () => {}, apresPublication } = opts;
    const $ = (s) => hote.querySelector(s);
    const ligne = (t) => { etat.ligne = t || ''; const e = $('#ca-ligne'); if (e) e.textContent = etat.ligne; };

    // La légende s'écrit à la frappe, SANS redessiner : redessiner à chaque
    // lettre ferait sauter le curseur au début du champ.
    hote.querySelectorAll('[data-legende]').forEach(el => el.addEventListener('input', () => {
      etat.images[Number(el.dataset.legende)].legende = el.value;
    }));

    const bouger = (de, vers) => {
      if (vers < 0 || vers >= etat.images.length) return;
      const [x] = etat.images.splice(de, 1);
      etat.images.splice(vers, 0, x);
      redessiner();
    };
    hote.querySelectorAll('[data-monter]').forEach(b => b.onclick = () =>
      bouger(Number(b.dataset.monter), Number(b.dataset.monter) - 1));
    hote.querySelectorAll('[data-descendre]').forEach(b => b.onclick = () =>
      bouger(Number(b.dataset.descendre), Number(b.dataset.descendre) + 1));
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      etat.images.splice(Number(b.dataset.retirer), 1);
      redessiner();
    });

    // Glisser-déposer. ⚠ Les flèches restent : le glisser ne marche pas au
    // doigt, et cet écran s'ouvre aussi sur une tablette.
    const liste = $('#ca-liste');
    if (liste) {
      let source = null;
      liste.querySelectorAll('.car-ligne').forEach(el => {
        el.addEventListener('dragstart', () => { source = el; el.classList.add('glisse'); });
        el.addEventListener('dragend', () => {
          el.classList.remove('glisse');
          liste.querySelectorAll('.cible').forEach(c => c.classList.remove('cible'));
        });
        el.addEventListener('dragover', (e) => { e.preventDefault(); if (el !== source) el.classList.add('cible'); });
        el.addEventListener('dragleave', () => el.classList.remove('cible'));
        el.addEventListener('drop', (e) => {
          e.preventDefault(); el.classList.remove('cible');
          if (!source || source === el) return;
          bouger(Number(source.dataset.i), Number(el.dataset.i));
        });
      });
    }

    const ajouter = (url) => {
      if (etat.images.some(i => i.url === url)) {
        toast('Cette photo est déjà dans le carrousel.', 'err');
        return false;
      }
      if (etat.images.length >= MAX_IMAGES) {
        toast(`${MAX_IMAGES} images au maximum dans le carrousel.`, 'err');
        return false;
      }
      etat.images.push({ url, legende: '' });
      return true;
    };

    const fichiers = $('#ca-fichiers');
    $('#ca-ajouter')?.addEventListener('click', () => { fichiers.value = ''; fichiers.click(); });
    if (fichiers) fichiers.onchange = async () => {
      const lot = [...fichiers.files];
      if (!lot.length) return;
      for (const f of lot) {
        const t = (f.type || '').toLowerCase();
        if (t && !FORMATS.includes(t)) { toast(`« ${f.name} » n’est pas une image acceptée.`, 'err'); return; }
        if (f.size > MAX_OCTETS) { toast(`« ${f.name} » dépasse 20 Mo.`, 'err'); return; }
      }
      ligne(`Dépôt de ${lot.length} photo${lot.length > 1 ? 's' : ''}…`);
      const r = await deposerPhotosRealisations(lot);
      ligne('');
      if (!r.ok) {
        toast(`Dépôt refusé — ${r.motif}`, 'err');
        return;
      }
      for (const u of (r.donnees?.urls || [])) ajouter(u);
      toast('Photos ajoutées — à publier pour les voir sur la page d’accueil');
      redessiner();
    };

    $('#ca-url-ok')?.addEventListener('click', () => {
      const u = ($('#ca-url')?.value || '').trim();
      if (!u) { toast('Collez l’adresse d’une image avant de cliquer.', 'err'); return; }
      if (ajouter(u)) redessiner();
    });

    $('#ca-annuler')?.addEventListener('click', () => fermer());

    // Deux clics sur le même bouton, jamais une modale : elle remplacerait
    // l'écran et emporterait les légendes en cours de saisie.
    $('#ca-restaurer')?.addEventListener('click', async () => {
      if (!etat.armeRestaure) {
        etat.armeRestaure = true;
        etat.ligne = 'Annule la DERNIÈRE publication du carrousel. Pas de second retour.';
        redessiner();
        return;
      }
      etat.occupe = true; redessiner();
      const r = await restaurerCarrousel();
      etat.occupe = false; etat.armeRestaure = false; etat.ligne = '';
      if (!r.ok) { redessiner(); toast(`Restauration impossible — ${r.motif}`, 'err'); return; }
      await db.recharger('rgd_carrousel');
      toast('Carrousel précédent rétabli');
      apresPublication?.();
      fermer();
    });

    $('#ca-publier')?.addEventListener('click', async () => {
      if (!etat.images.length) {
        // ⚠ La RPC ne redéplie le reflet que si la liste n'est pas vide : une
        // liste vide viderait la page d'accueil du site SANS vider le CRM, qui
        // continuerait d'afficher 21 images. Deux vérités, et la fausse est
        // celle qu'on regarde.
        toast('Un carrousel vide n’est pas publiable : retirez-le du site depuis l’application RGD.', 'err');
        return;
      }
      etat.occupe = true; redessiner();
      ligne('Relecture du document…');
      // On ne relit ici que pour signaler une publication concurrente : la
      // liste est remplacée en entier, il n'y a rien à fusionner. Prévenir
      // vaut mieux qu'écraser en silence le travail de quelqu'un d'autre.
      const frais = await lireCarrousel();
      const avant = frais.ok ? (frais.donnees.images || []).length : null;
      ligne('Publication…');
      const r = await enregistrerCarrousel(etat.images.map(i => ({
        url: i.url, legende: String(i.legende || '').trim().slice(0, MAX_LEGENDE),
      })));
      etat.occupe = false; etat.ligne = '';
      if (!r.ok) {
        redessiner();
        toast(r.motif.includes('42501') || /RGD/.test(r.motif)
          ? 'Réservé à l’équipe RGD : rien n’a été publié.'
          : `Non publié — ${r.motif}`, 'err');
        return;
      }
      await db.recharger('rgd_carrousel');
      toast(avant !== null && avant !== etat.images.length
        ? `Carrousel publié (${avant} → ${etat.images.length} images)`
        : 'Carrousel publié sur rgdrenova.fr');
      apresPublication?.();
      fermer();
    });
  }

  return { corps, brancher };
}
