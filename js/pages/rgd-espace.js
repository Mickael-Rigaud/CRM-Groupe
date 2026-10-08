// Espace RGD Renova — la coquille partagée par ses écrans
//
// Les onglets, le cadre et le bandeau vivaient dans `rgd-chantiers.js` tant
// qu'il n'y avait qu'un fichier d'écrans. Le rang 2 de la migration en ajoute
// un second : ils passent ici plutôt que d'être recopiés, sinon les deux
// listes d'onglets divergeraient au premier ajout.
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { coquilleEspace } from './espace.js';
import { db } from '../data/db.js';
import { esc } from '../ui.js';

export const KEY = 'rgd';
export const act = () => ACTIVITIES[KEY];

// L'ARBORESCENCE, telle que Mickael l'a dessinée le 21/09/2026. Trois groupes
// nommés par ce qu'ils contiennent, pas par l'ordre d'arrivée des écrans —
// l'ordre de la migration n'intéressait que nous.
//
// « Formations » est repris depuis le tableau de bord (21/09/2026) : c'était du
// contenu rédigé, sans base derrière, donc rien à relever. Restent trois écrans
// non repris — To-do, Équipe, Paramètres — accessibles par « Application RGD ».
export const ONGLETS = [
  { hash: '#/rgd', label: 'Vue d’ensemble' },
  { label: 'Base de données', sous: [
    { hash: '#/rgd/clients', label: 'Clients & prospects' },
    { hash: '#/rgd/partenaires', label: 'Partenaires' },
    { hash: '#/rgd/soustraitants', label: 'Sous-traitants' },
    // La veille hebdomadaire des sous-traitants (07/10/2026). Direction seule :
    // `cadre` retire l'entrée pour les autres.
    { hash: '#/rgd/prospection', label: 'Vivier sous-traitants' },
  ] },
  { hash: '#/rgd/agenda', label: 'Agenda' },
  { hash: '#/rgd/formations', label: 'Formations' },
  // ⚠ « TRAVAUX » A DISPARU LE 08/10/2026, ET CE N'EST PAS UN RETOUR SUR LA
  // DÉCISION DU 07/10 : Élodie a demandé de ranger « Réalisations » dans un
  // groupe « Communication », avec le calendrier des réseaux sociaux et
  // l'analyse. Le groupe ne portait plus rien. Les réalisations sont ce que
  // RGD MONTRE — sur le site et sur les réseaux —, c'est ce qui les met ici.
  // Placé SOUS « Formations », demandé le même jour.
  // Calendrier et Analyse sont réservés à la direction (`RESERVES_DIRECTION`) ;
  // un chargé d'affaires garde donc le groupe, avec les seules Réalisations.
  { label: 'Communication', sous: [
    { hash: '#/rgd/realisations', label: 'Réalisations' },
    { hash: '#/rgd/communication', label: 'Calendrier réseaux sociaux' },
    { hash: '#/rgd/analyse', label: 'Analyse' },
  ] },
  // LES CINQ ÉCRANS DE L'ARGENT ET DE SA PLOMBERIE, EN UN SEUL GROUPE
  // (25/09/2026, demandé par Mickael : « regroupe devis, encaissement,
  // costructor, réglages, application rgd »).
  //
  // Ils se suivent vraiment : un devis naît dans l'application RGD, Costructor
  // le rapatrie, il devient une facture puis un encaissement, et Réglages porte
  // les corrections manuelles du chiffre d'affaires. Quand un devis « n'arrive
  // jamais », la réponse est dans Costructor — deux entrées de menu plus bas.
  //
  // ⚠ CE GROUPE A ABSORBÉ « ADMINISTRATION », qui tenait Costructor, Réglages et
  // Application RGD à part depuis le 24/09. La raison écrite alors — « on ne les
  // ouvre pas pour travailler » — tenait tant qu'ils étaient seuls ; elle ne
  // tient plus maintenant que Devis et Encaissements les rejoignent, et ce n'est
  // pas une régression : c'est la facturation qui descend avec eux, pas les
  // coulisses qui remontent. Le trait de séparation (`bas: true`) reste, il dit
  // que ce bloc n'est pas la conduite des chantiers.
  //
  // ⚠ « Application RGD » DISPARAÎTRA — c'est l'étape 5 — et cette ligne partira
  // sans que le reste du menu bouge : c'est aussi pour ça qu'elle est ici, en
  // dernier.
  // ⚠ REPLIÉ PAR DÉFAUT (`pliable`), demandé par Mickael le 25/09/2026 : cinq
  // entrées qu'on n'ouvre pas tous les jours prenaient un tiers du menu. Le
  // groupe se rouvre d'un clic, l'état est gardé par navigateur, et il se déplie
  // tout seul quand on est sur l'un de ses écrans — sinon plus rien ne dirait où
  // l'on se trouve.
  // ⚠ LE LIBELLÉ SERT DE CLÉ AU RÉGLAGE DE PLI (`crm_menu_pli_rgd_<libellé>`).
  // Le renommer oublie donc le réglage mémorisé et le groupe revient à son état
  // par défaut — replié, c'est-à-dire ce qu'on veut de toute façon. Sans cette
  // coïncidence il faudrait une clé stable à part ; à retenir avant de renommer
  // un groupe dont le défaut serait « ouvert ».
  { label: 'Autres', bas: true, pliable: true, sous: [
    // ⚠ « Chantiers » S'APPELLE « PIPELINE » DEPUIS LE 25/09/2026, demandé par
    // Mickael. L'adresse `#/rgd/chantiers` ne change PAS : elle est écrite dans
    // des liens déjà partis et dans les deux CLAUDE.md. Un nom d'écran se
    // renomme, une adresse se casse.
    //
    // ⚠ IL EST DESCENDU ICI LE 07/10/2026, demandé par Élodie. Conséquence à
    // connaître avant de s'étonner : ce groupe est REPLIÉ PAR DÉFAUT, donc le
    // Pipeline est désormais derrière un clic. C'est le propre de ce bloc —
    // « cinq entrées qu'on n'ouvre pas tous les jours » — et c'est bien ce qui
    // a été demandé.
    //
    // ⚠ IL EST EN TÊTE ET NON À LA SUITE : les quatre autres se suivent dans
    // l'ordre de l'argent (un devis devient une facture, puis un encaissement,
    // et Réglages corrige le CA). Le Pipeline ne fait pas partie de cette
    // chaîne ; l'y intercaler la casserait, le poser devant la laisse intacte.
    { hash: '#/rgd/chantiers', label: 'Pipeline' },
    { hash: '#/rgd/devis', label: 'Devis' },
    { hash: '#/rgd/paiements', label: 'Encaissements' },
    { hash: '#/rgd/costructor', label: 'Costructor' },
    { hash: '#/rgd/reglages', label: 'Réglages' },
  ] },
];

// ⚠ REGARDER L'ESPACE COMME UN CHARGÉ D'AFFAIRES (06/10/2026, demandé par
// Élodie). Le sélecteur est dans l'EN-TÊTE de la coquille, donc présent sur les
// treize écrans de l'espace : le filtre vit dans `scope.rgd()`, un seul point de
// passage, et tous les écrans suivent sans être retouchés.
//
// ⚠ IL N'EXISTE QUE POUR LA DIRECTION. Pour un chargé d'affaires il n'y a rien
// à choisir : il ne voit que ses dossiers, et lui proposer une liste de
// collègues ferait croire à un accès qu'il n'a pas.
//
// ⚠ LE BANDEAU N'EST PAS DE LA DÉCORATION. Un filtre qui se mémorise d'une
// session à l'autre se fait oublier, et on finit par lire « il n'y a que trois
// chantiers » en croyant regarder l'entreprise entière. Il dit QUI on regarde,
// et ce que le filtre ne porte PAS.
const vueChoisie = () => (scope.isDirection ? scope.vueRgd : null);

const selecteurVue = () => {
  if (!scope.isDirection) return '';
  const vue = scope.vueRgd;
  const gens = scope.chargesRgd();
  // ⚠ TROIS ENTRÉES, DANS L'ORDRE DEMANDÉ LE 07/10/2026 : Toute l'équipe,
  // Mickael, Antoine. « Mickael » est la vue DIRECTION (leads sans responsable
  // compris), nommée d'après ceux de la direction qui portent des dossiers —
  // voir `producteursDirectionRgd`. Elle reste la vue par défaut.
  const nomDirection = scope.producteursDirectionRgd()
    .map(u => u.full_name || u.email).filter(Boolean).join(' · ') || 'La direction';
  return `<label class="esp-vue${vue !== 'direction' ? ' est-filtree' : ''}">
    <span>Vue</span>
    <select id="rgd-vue-charge" aria-label="Regarder l’espace comme">
      <option value=""${!vue ? ' selected' : ''}>Toute l’équipe</option>
      <option value="direction"${vue === 'direction' ? ' selected' : ''}>${esc(nomDirection)}</option>
      ${gens.map(u => `<option value="${esc(u.id)}"${vue === u.id ? ' selected' : ''}>${
        esc(u.full_name || u.email || 'sans nom')}</option>`).join('')}
    </select></label>`;
};

// Combien de dossiers la vue courante met de côté. ⚠ LE CHIFFRE EST LA MOITIÉ
// DU MESSAGE : « des dossiers sont ailleurs » se lit comme une généralité,
// « 37 dossiers sont ailleurs » se vérifie et se clique.
const horsDeLaVue = () => {
  const total = db.t('rgd_clients').length + db.t('rgd_demandes').length;
  const vus = scope.rgd('rgd_clients').length + scope.rgd('rgd_demandes').length;
  return Math.max(0, total - vus);
};

// ⚠ LE BANDEAU NE S'AFFICHE QUE QUAND LA VUE CACHE QUELQUE CHOSE. Sur
// « Toute l'équipe » il n'y a rien à prévenir ; sur les deux autres si, et c'est
// là qu'une liste incomplète se lit comme une entreprise au ralenti.
const bandeauVue = () => {
  const vue = vueChoisie();
  if (!vue) return '';

  // ⚠ RIEN À DIRE SUR LA VUE PAR DÉFAUT (retiré le 06/10/2026, demandé :
  // « enlève cette mention en haut, je t'ai dit que c'est forcément la direction
  // le responsable donc pas besoin de le mentionner »). Un bandeau qui s'affiche
  // à chaque ouverture pour énoncer l'état normal cesse d'être lu, et il occupe la
  // place de ce qu'on vient voir. **Ne pas le remettre** : ce qui manquait —
  // savoir à qui est un dossier et retrouver celui d'un autre — se dit mieux
  // dans le tableau, par une colonne et un filtre.
  if (vue === 'direction') return '';

  const u = db.byId('profiles', vue);
  return `<div class="alert esp-vue-bandeau"><b>👁</b><div>
    <b>Vous regardez l’espace comme ${esc(u?.full_name || 'ce membre de l’équipe')}.</b>
    Les dossiers, partenaires et sous-traitants affichés sont les siens, et les
    chiffres sont calculés sur eux seuls. Ce qui n’appartient à personne —
    l’agenda, les réglages, l’état de la synchronisation — reste commun.
    Vos droits ne changent pas : ce que vous écrivez reste signé de votre nom.
    </div></div>`;
};

// ⚠ LE BANDEAU NE S'AFFICHE PAS SUR CLIENTS & PROSPECTS, et ce n'est pas une
// exception de confort : cet écran porte une colonne « Responsable » sur
// chaque ligne (le filtre « Leads de… » qui la doublait est parti le 07/10). Il dit donc à qui est ce qu'on
// regarde, mieux et plus précisément qu'une phrase en tête. Ailleurs — la vue
// d'ensemble, le Pipeline — rien ne le dit, et des chiffres qui ne sont pas
// ceux de l'entreprise se lisent comme une entreprise au ralenti.
const SANS_BANDEAU = ['#/rgd/clients'];

// Les écrans réservés à la direction sortent du menu des autres : une entrée
// qui n'ouvre qu'un « réservé à la direction » est une porte peinte au mur.
const RESERVES_DIRECTION = ['#/rgd/prospection', '#/rgd/communication', '#/rgd/analyse'];
const sansDirection = (liste) => liste
  .filter(o => !RESERVES_DIRECTION.includes(o.hash))
  .map(o => (o.sous ? { ...o, sous: sansDirection(o.sous) } : o))
  // Un groupe vidé par le filtre partirait en intitulé seul, au-dessus de rien.
  .filter(o => !o.sous || o.sous.length);

export const cadre = (actif, titre, corps) => coquilleEspace({
  actif, titre,
  corps: (SANS_BANDEAU.includes(actif) ? '' : bandeauVue()) + corps,
  commandes: selecteurVue(),
  cle: KEY, marque: act().label, baseline: 'Rénovation tous corps d’état',
  onglets: scope.isDirection ? ONGLETS : sansDirection(ONGLETS),
});

// ⚠ L'ÉCOUTEUR EST POSÉ UNE SEULE FOIS, SUR LE DOCUMENT, et pas sur le champ :
// l'en-tête est réécrit à chaque `draw()` d'un écran, donc un gestionnaire
// attaché au `<select>` disparaîtrait au premier redessin — et le sélecteur
// cesserait de répondre sans que rien ne le dise. Même remède que le pliage du
// menu.
//
// ⚠ ON RE-ROUTE, ON NE RECHARGE PAS : `route()` écoute `hashchange`, donc un
// événement suffit à refaire l'écran courant avec le nouveau filtre. Un
// `location.reload()` reprendrait toutes les données pour un changement qui ne
// touche qu'un filtre d'affichage.
let vueEcoutee = false;
function ecouterLaVue() {
  if (vueEcoutee) return;
  vueEcoutee = true;
  document.addEventListener('change', (e) => {
    const sel = e.target.closest('#rgd-vue-charge');
    if (!sel) return;
    // ⚠ LA CHAÎNE VIDE EST UN CHOIX, PAS UNE ABSENCE : « Toute l'équipe » se
    // stocke en chaîne vide, et `vueRgd` ne retombe sur « La direction » que
    // lorsque la clé n'existe PAS. Les confondre rendrait « Toute l'équipe »
    // impossible à choisir : le réglage reviendrait au défaut au redessin suivant.
    scope.poserVueRgd(sel.value);
    window.dispatchEvent(new Event('hashchange'));
  });
}
ecouterLaVue();

// LE BANDEAU « CES ÉCRANS LISENT… » A ÉTÉ RETIRÉ le 22/09/2026.
// Il s'affichait en tête de chaque écran de l'espace et répétait la même
// phrase huit fois. Deux raisons de le supprimer plutôt que de le déplacer :
// aucun écran n'offre de contrôle d'écriture là où l'écriture est impossible,
// donc il n'y avait rien à empêcher ; et le statut, lui, s'écrit désormais
// vraiment (voir `js/data/rgd-clients.js`), ce qui rendait la phrase à moitié
// fausse. Ce qui doit se dire se dit à l'endroit concerné, sous le tableau.

export const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n’avez pas accès à l’activité RGD Renova.</div></div>';
  return true;
};

// Une photo du site peut être enregistrée en chemin relatif (`/medias/…`,
// héritage WordPress) ou en adresse complète (Supabase Storage, Cloudflare).
// La rendre telle quelle donnerait un cadre cassé dans le CRM, qui n'est pas
// servi par le même domaine. Partagée par les trois écrans des réalisations :
// la recopier ferait trois versions d'une règle qui doit être unique.
// ⚠ On complète UNIQUEMENT ce qui commence par « / », c'est-à-dire un chemin
// depuis la racine du site. Tester « ça ne commence pas par http » préfixerait
// aussi une image en `data:`, et le cadre resterait vide sans rien dire.
export const lienPhoto = (u) => {
  const s = String(u || '');
  return s.startsWith('/') ? 'https://rgdrenova.fr' + s : s;
};

// ⚠ UNE PHOTO QUI NE CHARGE PAS DOIT SE VOIR (23/09/2026).
// Les adresses des photos du site viennent de trois endroits — WordPress via
// i0.wp.com, Supabase Storage, et cinq reliquats en `/uploads/…` qui ne sont
// servis par PERSONNE (ni WordPress, qui sert sous `/wp-content/uploads/`, ni
// le worker, qui sert sous `/api/realisations/photo/`). Le CRM ne peut pas
// savoir d'avance laquelle répond : il ne l'apprend qu'au chargement. Sans ce
// signalement, une photo morte donne un cadre vide, qui se lit comme « le CRM
// n'a pas repris la photo » alors que l'adresse est bien là et que c'est le
// FICHIER qui manque. Deux causes opposées, une seule apparence : d'où le
// compteur, qui nomme le vrai problème et dit combien de fois il se pose.
//
// ⚠ ELLE RÉVÈLE AUSSI LE BOUTON DE RETRAIT, quand l'hôte en propose un
// (24/09/2026). Signaler un défaut sans donner le moyen de le corriger oblige
// à retirer les vignettes barrées une par une — sur une fiche où les six sont
// mortes, c'est six gestes pour un seul constat. Le bouton porte
// `data-photos-purger` ; ce qu'il FAIT appartient à l'écran qui l'affiche,
// parce qu'une photo ne se retire pas de la même façon d'une réalisation et
// du carrousel. Ici on ne fait que le montrer et le compter.
export function signalerPhotosCassees(hote) {
  const compteur = hote.querySelector('[data-photos-ko]');
  const purger = hote.querySelector('[data-photos-purger]');
  let n = 0;
  const marquer = (img) => {
    if (img.classList.contains('photo-ko')) return;
    img.classList.add('photo-ko');
    img.title = 'Fichier introuvable à l’adresse enregistrée : ' + img.getAttribute('src');
    n++;
    if (compteur) {
      compteur.hidden = false;
      compteur.textContent = `⚠ ${n} photo${n > 1 ? 's' : ''} ne se charge${n > 1 ? 'nt' : ''} pas : `
        + 'l’adresse est bien enregistrée, mais le fichier ne répond pas. '
        + 'Survolez une vignette barrée pour voir l’adresse.';
    }
    if (purger) {
      purger.hidden = false;
      purger.textContent = `✕ Retirer ${n === 1 ? 'la photo' : `les ${n} photos`} qui ne charge${n > 1 ? 'nt' : ''} pas`;
    }
  };
  for (const img of hote.querySelectorAll('img[src]')) {
    // Une image déjà chargée n'émettra plus d'événement : on lit son état.
    if (img.complete) { if (img.naturalWidth === 0) marquer(img); }
    else img.addEventListener('error', () => marquer(img), { once: true });
  }
}

// Le client d'une affaire, particulier ou entreprise. Rendu `null` quand
// l'affaire n'en désigne aucun — ce qui arrive, et se dit à l'écran.
export function clientDe(affaire, db) {
  if (!affaire) return null;
  if (affaire.contact_id) {
    const c = db.byId('contacts', affaire.contact_id);
    return c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—' : null;
  }
  if (affaire.organisation_id) {
    const o = db.byId('organisations', affaire.organisation_id);
    return o ? o.name : null;
  }
  return null;
}
