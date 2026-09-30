// La check-list visuelle de visite — BTP Expertise.
//
// À quoi sert cet écran : on est devant le bâtiment, souvent une tablette à
// la main, et il faut passer 54 points sans en oublier un. Ce n'est pas un
// formulaire qu'on remplit au bureau après coup : c'est l'outil DE la visite,
// et tout y est pensé pour être tapé debout, au froid, avec des gants.
//
// ⚠ DEUX CHOSES QUI NE SE MÉLANGENT PAS. Le RÉFÉRENTIEL dit ce qu'on va
// regarder, il est le même pour tous. Le RELEVÉ dit ce qu'on a constaté chez
// CE client, ce jour-là. C'est le modèle des tables, et l'écran le respecte :
// il ne propose jamais de corriger un libellé de point depuis une visite.
//
// ⚠ LE CONTENU DU RÉFÉRENTIEL NE VIT PAS DANS CE DÉPÔT (produit tiers, dépôt
// public) : les 8 zones et les 54 points sont en base, importés à la main.
// L'écran sait le dire quand ils manquent plutôt que de s'afficher vide.
//
// ⚠ UN RELEVÉ SE RATTACHE À UNE AFFAIRE, et c'est de l'affaire qu'il tient
// son droit : un chargé d'affaires ne voit que les visites de ses dossiers.
// Imposé par la base (policies via `can_see_deal`, éprouvé en recette en
// lecture ET en écriture) ; l'écran n'en est que le miroir.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, toast, confirm as confirmer, openModal, closeModal } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadreBtp as cadre } from './btp.js';
import {
  ETATS, SEAU_RELEVES, zones, pointsDe, tousLesPoints,
  releves, reponsesDe, bilan, creerReleve, majReleve, repondre, deposerPhoto,
} from '../data/btp-releve.js';

const KEY = 'btp';

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

const num = (n) => String(n).padStart(2, '0');

// ⚠ UN VRAI LIEN, PAS UN BOUTON QUI AFFICHE UN MESSAGE. Il menait à l'écran
// Formation en disant « ouvrez la fiche 14 » : on arrivait sur le sommaire avec
// un numéro à chercher à la main, c'est-à-dire le travail qu'un renvoi doit
// précisément éviter. L'adresse porte désormais la fiche (`?fiche=14`), donc la
// planche s'ouvre — et le lien se partage.
//
// ⚠ UNE FICHE NON IMPORTÉE N'EST PAS UN LIEN MORT : son numéro s'affiche en
// clair, et on voit qu'il manque quelque chose au lieu de cliquer dans le vide.
function lienFiche(n) {
  const f = db.t('btp_atlas_fiches').find(x => x.numero === n);
  if (!f) return `<span class="cl-fiche est-absente" title="Fiche non import\u00e9e">${num(n)}</span>`;
  return `<a class="cl-fiche" href="#/btp/atlas?fiche=${n}" title="${esc(f.titre)}">${num(n)}</a>`;
}
const jour = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR',
  { day: '2-digit', month: 'long', year: 'numeric' }) : '';

// Les affaires BTP où poser une visite. ⚠ `scope.deals()` filtre déjà ce que
// la personne a le droit de voir : on ne propose pas un dossier sur lequel
// l'écriture serait refusée par la base.
const affairesBtp = () => scope.deals()
  .filter(d => d.activity === 'btp')
  .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

// Le nom qui s'affiche pour une affaire : celui du client d'abord, le titre
// de l'affaire ensuite. On cherche « la visite de Mme Herlin », pas
// « l'affaire #4 ».
function nomAffaire(dealId) {
  const d = db.t('deals').find(x => x.id === dealId);
  if (!d) return 'Affaire introuvable';
  const c = d.contact_id && db.t('contacts').find(x => x.id === d.contact_id);
  const qui = c ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() : '';
  return qui || d.title || 'Sans nom';
}

const adresseAffaire = (dealId) => {
  const d = db.t('deals').find(x => x.id === dealId);
  const f = d?.fields || {};
  return [f.adresse, f.code_postal, f.ville].filter(Boolean).join(' ');
};

// ---------------------------------------------------------------- L'écran
export const btpChecklistPage = {
  title: () => 'BTP Expertise — Check-list de visite',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // `ouvert` : l'identifiant du relevé affiché, ou null pour la liste.
    // `zone` : la zone dépliée, une seule à la fois — voir plus bas.
    const etat = { ouvert: null, zone: 1, point: null };

    const dessine = () => {
      const r = etat.ouvert ? releves().find(x => x.id === etat.ouvert) : null;
      root.innerHTML = cadre('#/btp/expertise-checklist', 'Check-list de visite',
        r ? vueReleve(r, etat) : vueListe());
      lier(root, etat, dessine);
    };

    dessine();
    return { refresh: dessine, destroy: coquille.retirer };
  },
};

// ------------------------------------------------------------- La liste
function vueListe() {
  const l = releves();
  const pretes = tousLesPoints().length;
  return `
    <div class="card">
      <div class="card-head">
        <h2>Visites relevées</h2>
        <span class="grow"></span>
        ${pretes ? '<button type="button" class="btn primary sm" data-neuve="1">+ Nouvelle visite</button>' : ''}
      </div>
      ${!pretes ? `
        <div class="empty">La check-list n'a pas encore été importée.<br>
          <span class="small muted">Les 8 zones et leurs points de contrôle s'importent à la main :
          c'est un document sous licence, il n'est pas dans le dépôt.</span></div>`
      : !l.length ? `
        <div class="empty">Aucune visite relevée pour l'instant.<br>
          <span class="small muted">« + Nouvelle visite » ouvre une check-list rattachée à une affaire.</span></div>`
      : `
        <div class="cl-liste">
          ${l.map(r => {
            const b = bilan(r.id);
            const pct = b.total ? Math.round(b.repondus / b.total * 100) : 0;
            return `
            <button type="button" class="cl-carte${b.anomalies ? ' a-des-anomalies' : ''}" data-ouvrir="${r.id}">
              <div class="cl-carte-tete">
                <b>${esc(nomAffaire(r.deal_id))}</b>
                <span class="cl-date">${esc(jour(r.date_visite))}</span>
              </div>
              ${adresseAffaire(r.deal_id) ? `<span class="cl-adresse">${esc(adresseAffaire(r.deal_id))}</span>` : ''}
              <!-- ⚠ L'AVANCEMENT AVANT TOUT LE RESTE : une visite à moitié
                   relevée est la seule chose qu'on cherche en rouvrant cet
                   écran, et un compte d'anomalies sur 12 points vus n'a pas
                   le même sens que sur 54. -->
              <div class="cl-jauge"><span style="width:${pct}%"></span></div>
              <div class="cl-compte">
                <span>${b.repondus} / ${b.total} points</span>
                ${b.anomalies ? `<span class="cl-pastille est-anomalie">${b.anomalies} anomalie${b.anomalies > 1 ? 's' : ''}</span>` : ''}
                ${b.nv ? `<span class="cl-pastille est-nv">${b.nv} non vérifiable${b.nv > 1 ? 's' : ''}</span>` : ''}
                ${b.photos ? `<span class="cl-pastille">${b.photos} photo${b.photos > 1 ? 's' : ''}</span>` : ''}
              </div>
            </button>`;
          }).join('')}
        </div>`}
    </div>`;
}

// ------------------------------------------------------------- Un relevé
//
// ⚠ UNE SEULE ZONE DÉPLIÉE À LA FOIS, et ce n'est pas pour faire joli : on
// suit le parcours de la visite — extérieur vers intérieur, haut vers bas —
// et les 54 points affichés d'un coup font une page de trois mètres où l'on
// ne sait plus où l'on en est. La zone ouverte est celle qu'on est en train
// de faire.
function vueReleve(r, etat) {
  const zs = zones();
  const b = bilan(r.id);
  const pct = b.total ? Math.round(b.repondus / b.total * 100) : 0;
  const rep = reponsesDe(r.id);
  const parPoint = new Map(rep.map(x => [x.point_id, x]));

  return `
    <div class="card">
      <div class="cl-tete">
        <button type="button" class="at-retour" data-liste="1">← Toutes les visites</button>
        <div class="cl-tete-nom">
          <b>${esc(nomAffaire(r.deal_id))}</b>
          <span>${esc(adresseAffaire(r.deal_id) || 'Adresse non renseignée')}</span>
        </div>
        <span class="grow"></span>
        <label class="cl-date-champ">Visite du
          <input type="date" value="${esc(r.date_visite || '')}" data-date="1">
        </label>
      </div>

      <div class="cl-bandeau">
        <div class="cl-jauge grande"><span style="width:${pct}%"></span></div>
        <div class="cl-compte">
          <b>${b.repondus} / ${b.total}</b> points relevés
          <span class="cl-pastille est-ok">${b.ok} OK</span>
          <span class="cl-pastille est-anomalie">${b.anomalies} anomalie${b.anomalies > 1 ? 's' : ''}</span>
          <span class="cl-pastille est-nv">${b.nv} non vérifiable${b.nv > 1 ? 's' : ''}</span>
          ${b.photos ? `<span class="cl-pastille">${b.photos} photo${b.photos > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>

      ${zs.map(z => {
        const pts = pointsDe(z.rang);
        const faits = pts.filter(p => parPoint.has(p.id)).length;
        const anos = pts.filter(p => parPoint.get(p.id)?.etat === 'anomalie').length;
        const ouverte = etat.zone === z.rang;
        return `
        <section class="cl-zone${ouverte ? ' est-ouverte' : ''}${anos ? ' a-des-anomalies' : ''}">
          <button type="button" class="cl-zone-tete" data-zone="${z.rang}" aria-expanded="${ouverte}">
            <span class="cl-zone-n">${z.rang}</span>
            <span class="cl-zone-t">${esc(z.titre)}</span>
            <span class="grow"></span>
            ${anos ? `<span class="cl-pastille est-anomalie">${anos}</span>` : ''}
            <span class="cl-zone-avance${faits === pts.length ? ' est-complet' : ''}">${faits}/${pts.length}</span>
            <span class="cl-chevron" aria-hidden="true">${ouverte ? '▾' : '▸'}</span>
          </button>
          ${ouverte ? `
            <div class="cl-points">
              ${pts.map(p => unPoint(p, parPoint.get(p.id), etat)).join('')}
              ${z.photos_a_prendre ? `
                <!-- ⚠ LES PHOTOS À PRENDRE SONT EN PIED DE ZONE, pas en tête :
                     on les lit au moment de quitter la zone, quand il est
                     encore temps d'y retourner. En tête, on les aurait
                     oubliées huit points plus bas. -->
                <p class="cl-photos-zone"><em>Photos à rapporter</em>${esc(z.photos_a_prendre)}</p>` : ''}
            </div>` : ''}
        </section>`;
      }).join('')}

      <section class="cl-zone est-notes">
        <div class="cl-zone-tete sans-clic"><span class="cl-zone-t">Notes de visite</span></div>
        <div class="cl-points">
          <textarea class="cl-notes" data-notes="1" rows="3"
            placeholder="Ce qui ne rentre dans aucun point : l'accès, la météo, qui était présent…">${esc(r.notes || '')}</textarea>
        </div>
      </section>
    </div>`;
}

// ------------------------------------------------------------- Un point
//
// ⚠ TROIS BOUTONS, PAS UNE LISTE DÉROULANTE. On tape ça debout devant un mur,
// parfois avec des gants : un menu à ouvrir puis une option à viser, 54 fois,
// est le meilleur moyen pour que la check-list reste dans la voiture.
function unPoint(p, rep, etat) {
  const ouvert = etat.point === p.id;
  const e = rep?.etat;
  return `
    <div class="cl-point${e ? ' est-' + e : ''}">
      <div class="cl-point-haut">
        <span class="cl-point-t">${esc(p.libelle)}</span>
        <div class="cl-choix" role="group" aria-label="${esc(p.libelle)}">
          ${Object.entries(ETATS).map(([cle, o]) => `
            <button type="button" class="cl-b cl-b-${cle}${e === cle ? ' on' : ''}"
              data-etat="${cle}" data-point="${p.id}" title="${esc(o.aide)}"
              aria-pressed="${e === cle}">${esc(o.mot)}</button>`).join('')}
        </div>
      </div>

      <div class="cl-point-bas">
        <!-- ⚠ LES FICHES SONT VISIBLES DÈS LE DÉBUT, sur tous les points et
             sans rien avoir coché (30/09/2026, demandé par Mickael). Elles
             ne s'affichaient qu'une fois « Anomalie » posé, au motif que 54
             renvois permanents ne se liraient plus. C'ÉTAIT LE MAUVAIS
             RAISONNEMENT : on ouvre la fiche AVANT de trancher, pour savoir
             si ce qu'on voit en est une — les cacher jusqu'après le clic les
             rendait inutiles au moment précis où elles servent. Le document
             papier les imprime d'ailleurs sur chaque ligne, sans rien à
             cocher. -->
        ${p.fiches?.length ? `
          <span class="cl-fiches">${p.fiches.map(lienFiche).join('')}</span>` : ''}
        <span class="grow"></span>
        ${rep?.note ? `<span class="cl-a-note" title="${esc(rep.note)}">note</span>` : ''}
        ${rep?.photos?.length ? `<span class="cl-a-note">${rep.photos.length} photo${rep.photos.length > 1 ? 's' : ''}</span>` : ''}
        <button type="button" class="cl-plus" data-detail="${p.id}" aria-expanded="${ouvert}">
          ${ouvert ? 'Fermer' : 'Note et photos'}
        </button>
      </div>

      ${ouvert ? `
        <div class="cl-detail">
          <textarea class="cl-note" data-note="${p.id}" rows="2"
            placeholder="Ce qu'on a mesuré, où exactement, depuis quand…">${esc(rep?.note || '')}</textarea>
          <div class="cl-photos">
            ${(rep?.photos || []).map((c, i) => `
              <figure class="cl-vignette" data-photo="${esc(c)}" data-point="${p.id}" data-rang="${i}">
                <div class="cl-vignette-img">Chargement…</div>
                <button type="button" class="cl-retirer" data-retirer="${p.id}" data-rang="${i}"
                  title="Retirer cette photo">×</button>
              </figure>`).join('')}
            <label class="cl-ajout">
              <span>+ Photo</span>
              <!-- capture ouvre l'appareil photo sur un téléphone, et reste
                   sans effet sur un ordinateur : la visite se fait dehors. -->
              <input type="file" accept="image/*" capture="environment" multiple hidden
                     data-ajout="${p.id}">
            </label>
          </div>
        </div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------- Le liage
function lier(root, etat, dessine) {
  const q = (s) => [...root.querySelectorAll(s)];

  q('[data-ouvrir]').forEach(b => b.onclick = () => {
    etat.ouvert = b.dataset.ouvrir; etat.zone = 1; etat.point = null; dessine();
  });
  const versListe = root.querySelector('[data-liste]');
  if (versListe) versListe.onclick = () => { etat.ouvert = null; dessine(); };

  const neuve = root.querySelector('[data-neuve]');
  if (neuve) neuve.onclick = () => nouvelleVisite(etat, dessine);

  // ⚠ RECLIQUER LA ZONE OUVERTE LA REFERME : c'est le geste attendu d'un
  // accordéon, et sans lui on ne peut plus voir la liste des huit zones d'un
  // coup pour savoir où l'on en est.
  q('[data-zone]').forEach(b => b.onclick = () => {
    etat.zone = etat.zone === Number(b.dataset.zone) ? null : Number(b.dataset.zone);
    etat.point = null; dessine();
  });
  q('[data-detail]').forEach(b => b.onclick = () => {
    etat.point = etat.point === Number(b.dataset.detail) ? null : Number(b.dataset.detail);
    dessine();
  });

  // ⚠ RECLIQUER L'ÉTAT DÉJÀ CHOISI L'EFFACE. On se trompe de bouton en
  // tapant debout, et sans cela la seule sortie serait de laisser une réponse
  // fausse — pire que pas de réponse du tout sur un document qui engage.
  q('[data-etat]').forEach(b => b.onclick = async () => {
    const pointId = Number(b.dataset.point);
    const rep = reponsesDe(etat.ouvert).find(x => x.point_id === pointId);
    try {
      if (rep && rep.etat === b.dataset.etat) await db.remove('btp_releve_reponses', rep.id);
      else await repondre(etat.ouvert, pointId, { etat: b.dataset.etat });
      dessine();
    } catch (e) { toast('Enregistrement refusé : ' + e.message, 'warn'); }
  });

  // ⚠ LA NOTE S'ENREGISTRE AU `change`, PAS À LA FRAPPE : à chaque touche on
  // écrirait en base et on redessinerait sous le doigt. Et il faut un état
  // avant d'avoir une note — un point commenté mais non classé ne veut rien
  // dire, donc on pose « anomalie », qui est la raison d'écrire.
  q('[data-note]').forEach(t => t.onchange = async () => {
    const pointId = Number(t.dataset.note);
    const rep = reponsesDe(etat.ouvert).find(x => x.point_id === pointId);
    try {
      await repondre(etat.ouvert, pointId, { note: t.value.trim() || null, etat: rep?.etat || 'anomalie' });
      toast('Note enregistrée', 'ok');
      dessine();
    } catch (e) { toast('Note non enregistrée : ' + e.message, 'warn'); }
  });

  const notes = root.querySelector('[data-notes]');
  if (notes) notes.onchange = async () => {
    try { await majReleve(etat.ouvert, { notes: notes.value.trim() || null }); toast('Notes enregistrées', 'ok'); }
    catch (e) { toast('Notes non enregistrées : ' + e.message, 'warn'); }
  };

  const date = root.querySelector('[data-date]');
  if (date) date.onchange = async () => {
    if (!date.value) return;
    try { await majReleve(etat.ouvert, { date_visite: date.value }); toast('Date enregistrée', 'ok'); }
    catch (e) { toast('Date non enregistrée : ' + e.message, 'warn'); }
  };

  q('[data-ajout]').forEach(i => i.onchange = () => {
    if (i.files?.length) ajouterPhotos(etat, Number(i.dataset.ajout), i.files, dessine);
  });
  q('[data-retirer]').forEach(b => b.onclick = () => retirerPhoto(etat, b, dessine));

  // Les vignettes demandent leur URL signée après le rendu : le rendu est
  // synchrone, il ne peut pas l'attendre.
  q('[data-photo]').forEach(f => montrerVignette(f));
}

// ------------------------------------------------------- Les gestes lourds
async function nouvelleVisite(etat, dessine) {
  const l = affairesBtp();
  if (!l.length) return toast('Aucune affaire BTP \u00e0 laquelle rattacher une visite', 'warn');

  // ⚠ ON ÉCRIT LE NOM DU CLIENT, ON NE LE CHERCHE PLUS DANS UNE LISTE
  // (30/09/2026, demandé par Mickael). Un sélecteur va très bien à six
  // affaires et devient impraticable à deux cents : on sait qui on va voir,
  // on tape les trois premières lettres.
  //
  // ⚠ UN `datalist`, PAS UN COMPOSANT À ÉCRIRE : il filtre, il se navigue au
  // clavier, il s'ouvre en liste complète si on ne tape rien, et il se
  // comporte comme le champ natif du téléphone — or cet écran s'ouvre aussi
  // sur une tablette. Même choix que la colonne « Apporté par » des
  // partenaires RGD.
  //
  // ⚠ CE QUI EST TAPÉ EST UN LIBELLÉ, PAS UN IDENTIFIANT : on le retrouve
  // dans la table faite ici. Deux clients de même nom sont départagés par
  // l'adresse, déjà dans le libellé ; si le texte ne correspond à rien, on le
  // DIT au lieu de créer la visite sur la première affaire venue.
  const libelle = (d) => {
    const a = adresseAffaire(d.id);
    return `${nomAffaire(d.id)}${a ? ' \u00b7 ' + a : ''}`;
  };
  const parLibelle = new Map(l.map(d => [libelle(d), d.id]));
  const aujourdhui = new Date().toISOString().slice(0, 10);

  openModal('Nouvelle visite', `
    <form id="cl-neuve">
      <div class="field">
        <label>Client ou affaire *</label>
        <input id="cl-affaire" list="cl-affaires" autocomplete="off" required
               placeholder="Tapez les premi\u00e8res lettres du nom\u2026">
        <datalist id="cl-affaires">
          ${l.map(d => `<option value="${esc(libelle(d))}"></option>`).join('')}
        </datalist>
        <div class="small muted" style="margin-top:4px">
          ${l.length} affaire${l.length > 1 ? 's' : ''} BTP ouverte${l.length > 1 ? 's' : ''} \u00e0 votre nom.
        </div>
      </div>
      <div class="field">
        <label>Date de la visite</label>
        <input type="date" id="cl-date" value="${aujourdhui}">
        <div class="small muted" style="margin-top:4px">
          Le jour o\u00f9 l\u2019on est all\u00e9 sur place, pas celui de la saisie.
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button type="submit" class="btn primary">Ouvrir la check-list</button>
      </div>
    </form>`, { onOpen: (m) => {
      const champ = m.querySelector('#cl-affaire');
      champ.focus();
      m.querySelector('#cl-neuve').onsubmit = async (ev) => {
        ev.preventDefault();
        const saisi = champ.value.trim();
        let dealId = parLibelle.get(saisi);
        // Repli : on accepte une saisie partielle si elle ne désigne qu'UNE
        // affaire. Deux correspondances, on ne choisit pas à la place de
        // l'utilisateur.
        if (!dealId) {
          const bas = saisi.toLowerCase();
          const candidats = [...parLibelle.entries()].filter(([k]) => k.toLowerCase().includes(bas));
          if (saisi && candidats.length === 1) dealId = candidats[0][1];
          else if (candidats.length > 1) return toast(`\u00ab ${saisi} \u00bb d\u00e9signe ${candidats.length} affaires : pr\u00e9cisez`, 'warn');
        }
        if (!dealId) return toast('Aucune affaire ne correspond \u00e0 ce nom', 'warn');
        try {
          const r = await creerReleve(dealId, m.querySelector('#cl-date').value || aujourdhui);
          closeModal();
          etat.ouvert = r.id; etat.zone = 1; etat.point = null;
          dessine();
        } catch (e) { toast('Visite non cr\u00e9\u00e9e : ' + e.message, 'warn'); }
      };
    } });
}

async function ajouterPhotos(etat, pointId, fichiers, dessine) {
  const rep = reponsesDe(etat.ouvert).find(x => x.point_id === pointId);
  const deja = rep?.photos || [];
  const neufs = [];
  for (const f of fichiers) {
    try { neufs.push(await deposerPhoto(etat.ouvert, pointId, f)); }
    catch (e) { toast(`${f.name} : ${e.message}`, 'warn'); }
  }
  if (!neufs.length) return;
  try {
    // ⚠ L'ÉTAT SUIT LA PHOTO : on ne photographie pas ce qui va bien. Si le
    // point n'est pas encore classé, la photo vaut constat d'anomalie — mais
    // un état DÉJÀ posé n'est jamais écrasé, même « OK » (on garde parfois
    // une preuve de ce qui est conforme).
    await repondre(etat.ouvert, pointId, { photos: [...deja, ...neufs], etat: rep?.etat || 'anomalie' });
    toast(`${neufs.length} photo${neufs.length > 1 ? 's' : ''} ajoutée${neufs.length > 1 ? 's' : ''}`, 'ok');
    dessine();
  } catch (e) { toast('Photos non rattachées : ' + e.message, 'warn'); }
}

async function retirerPhoto(etat, bouton, dessine) {
  const pointId = Number(bouton.dataset.retirer);
  const rang = Number(bouton.dataset.rang);
  const rep = reponsesDe(etat.ouvert).find(x => x.point_id === pointId);
  if (!rep) return;
  // ⚠ UNE PHOTO RETIRÉE EST UNE PREUVE QUI PART : on demande, et le fichier
  // RESTE dans le stockage — le relevé cesse seulement de le désigner.
  // Effacer pour de bon un cliché de visite ne se fait pas d'un geste dans un
  // accordéon.
  if (!await confirmer('Retirer cette photo du relev\u00e9 ?')) return;
  const restantes = rep.photos.filter((_, i) => i !== rang);
  try { await repondre(etat.ouvert, pointId, { photos: restantes }); dessine(); }
  catch (e) { toast('Photo non retir\u00e9e : ' + e.message, 'warn'); }
}

async function montrerVignette(figure) {
  const zone = figure.querySelector('.cl-vignette-img');
  const brut = figure.dataset.photo;
  try {
    // Deux sortes de valeurs dans la même colonne : un chemin en production,
    // une adresse `data:` en démonstration. Le test porte sur « c'est déjà
    // une adresse », jamais sur « ce n'est pas un chemin ».
    const url = /^(data:|https?:)/.test(brut) ? brut : await db.fileUrl(brut, { bucket: SEAU_RELEVES });
    zone.innerHTML = `<img src="${esc(url)}" alt="Photo de visite">`;
  } catch (e) {
    zone.innerHTML = '<span class="cl-cassee" title="' + esc(e.message || '') + '">introuvable</span>';
  }
}
