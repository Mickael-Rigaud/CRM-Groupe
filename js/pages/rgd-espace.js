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

// L'ordre de la bascule est celui du plan de migration : les écrans repris en
// haut, l'application d'origine en bas tant qu'il lui reste des écrans.
export const ONGLETS = [
  // L'accueil de l'espace est la vue d'ensemble, comme dans le tableau de bord
  // d'origine dont la route par defaut est `overview`. `#/rgd/chantiers` porte
  // desormais la liste ; l'ancienne adresse `#/rgd` ne pointe plus dessus.
  { hash: '#/rgd', label: 'Vue d’ensemble' },
  { hash: '#/rgd/chantiers', label: 'Chantiers' },
  { hash: '#/rgd/clients', label: 'Clients' },
  { hash: '#/rgd/agenda', label: 'Agenda' },
  { label: 'Facturation', sous: [
    { hash: '#/rgd/devis', label: 'Devis' },
    { hash: '#/rgd/paiements', label: 'Encaissements' },
  ] },
  { hash: '#/rgd/soustraitants', label: 'Sous-traitants' },
  { hash: '#/rgd/partenaires', label: 'Partenaires' },
  { hash: '#/rgd/realisations', label: 'Réalisations' },
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
