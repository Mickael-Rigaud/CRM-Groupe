// Espace RGD Renova — la coquille partagée par ses écrans
//
// Les onglets, le cadre et le bandeau vivaient dans `rgd-chantiers.js` tant
// qu'il n'y avait qu'un fichier d'écrans. Le rang 2 de la migration en ajoute
// un second : ils passent ici plutôt que d'être recopiés, sinon les deux
// listes d'onglets divergeraient au premier ajout.
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { coquilleEspace } from './espace.js';

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
  ] },
  { label: 'Travaux', sous: [
    { hash: '#/rgd/chantiers', label: 'Chantiers' },
    { hash: '#/rgd/realisations', label: 'Réalisations' },
  ] },
  { label: 'Facturation', sous: [
    { hash: '#/rgd/devis', label: 'Devis' },
    { hash: '#/rgd/paiements', label: 'Encaissements' },
  ] },
  { hash: '#/rgd/agenda', label: 'Agenda' },
  { hash: '#/rgd/formations', label: 'Formations' },
  // ⚠ LES COULISSES DESCENDENT EN BAS, ENSEMBLE ET SÉPARÉES (24/09/2026, demandé
  // par Mickael). Ces trois écrans ne se ressemblent pas mais ils ont en commun
  // l'essentiel : on ne les ouvre pas pour travailler, on les ouvre quand quelque
  // chose cloche ou qu'il faut régler l'outil. Au milieu des chantiers et des
  // devis, ils se lisaient comme du travail quotidien.
  // Ils sont gardés pour une raison chacun : Costructor n'a aucune autre porte —
  // sans ce lien, l'écran qui dit pourquoi un devis n'arrive pas devient
  // introuvable ; Réglages porte les corrections manuelles du CA ; et
  // « Application RGD » mène au tableau de bord d'origine, seul endroit où se
  // saisissent encore la clé Costructor et la connexion Google Agenda.
  // ⚠ « Application RGD » DISPARAÎTRA — c'est l'étape 5 — et cette ligne partira
  // avec, sans que le reste du menu bouge : c'est aussi pour ça qu'elle est ici.
  { label: 'Administration', bas: true, sous: [
    { hash: '#/rgd/costructor', label: 'Costructor' },
    { hash: '#/rgd/reglages', label: 'Réglages' },
    { hash: '#/rgd/app', label: 'Application RGD' },
  ] },
];

export const cadre = (actif, titre, corps) => coquilleEspace({
  actif, titre, corps,
  cle: KEY, marque: act().label, baseline: 'Rénovation tous corps d’état', onglets: ONGLETS,
});

// LE BANDEAU « CES ÉCRANS LISENT… » A ÉTÉ RETIRÉ le 22/09/2026.
// Il s'affichait en tête de chaque écran de l'espace et répétait la même
// phrase huit fois. Deux raisons de le supprimer plutôt que de le déplacer :
// aucun écran n'offre de contrôle d'écriture là où l'écriture est impossible,
// donc il n'y avait rien à empêcher ; et le statut, lui, s'écrit désormais
// vraiment (voir `js/data/rgd-api.js`), ce qui rendait la phrase à moitié
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
export function signalerPhotosCassees(hote) {
  const compteur = hote.querySelector('[data-photos-ko]');
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
        + 'Survolez une vignette barrée pour voir l’adresse ; il faut redéposer la photo.';
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
