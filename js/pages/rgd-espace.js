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
// « Formations » figurait dans le dessin mais n'existe pas encore dans le CRM :
// mieux vaut un onglet absent qu'un lien mort. Il viendra avec les trois autres
// écrans non repris (To-do, Équipe, Paramètres).
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
  // Les deux derniers ne sont pas dans l'arborescence demandee, et sont gardes
  // pour une raison chacun. Costructor n'a aucune autre porte : sans ce lien,
  // l'ecran qui dit pourquoi un devis n'arrive pas devient introuvable.
  // « Application RGD » mene au tableau de bord d'origine, qui reste l'outil de
  // SAISIE tant que l'etape 5 n'est pas faite — le CRM ne sait que lire.
  // Les deux disparaitront quand le CRM ecrira et que Surge sera debranche.
  { hash: '#/rgd/costructor', label: 'Costructor' },
  { hash: '#/rgd/app', label: 'Application RGD' },
];

export const cadre = (actif, titre, corps) => coquilleEspace({
  actif, titre, corps,
  cle: KEY, marque: act().label, baseline: 'Rénovation tous corps d’état', onglets: ONGLETS,
});

// D'où viennent ces chiffres, et pourquoi on ne les modifie pas ici. Le
// bandeau disparaîtra à l'étape 5, quand le CRM deviendra la source.
export const BANDEAU = `<div class="alert rgd-source">
  <b>i</b>
  <div>Ces écrans <b>lisent</b> les données du tableau de bord RGD Renova, relevées
  toutes les 30 minutes. Pour créer ou modifier, passez par l&rsquo;onglet
  <a href="#/rgd/app">Application RGD</a> — une modification faite ici serait
  écrasée au relevé suivant.</div>
</div>`;

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
