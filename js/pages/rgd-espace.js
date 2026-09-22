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
  // Les deux derniers ne sont pas dans l'arborescence demandee, et sont gardes
  // pour une raison chacun. Costructor n'a aucune autre porte : sans ce lien,
  // l'ecran qui dit pourquoi un devis n'arrive pas devient introuvable.
  // « Application RGD » mene au tableau de bord d'origine, qui reste l'outil de
  // SAISIE tant que l'etape 5 n'est pas faite — le CRM ne sait que lire.
  // Les deux disparaitront quand le CRM ecrira et que Surge sera debranche.
  { hash: '#/rgd/costructor', label: 'Costructor' },
  { hash: '#/rgd/reglages', label: 'Réglages' },
  { hash: '#/rgd/app', label: 'Application RGD' },
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
