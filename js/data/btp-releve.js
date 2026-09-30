// Le relevé de visite de BTP Expertise : créer une check-list, répondre à un
// point, y déposer des photos.
//
// ⚠ DEUX CHOSES QUI NE SE MÉLANGENT PAS, et c'est tout le modèle. Le
// RÉFÉRENTIEL (`btp_checklist_zones`, `btp_checklist_points`) dit ce qu'on va
// regarder : il est le même pour tout le monde et ne bouge qu'à l'import. Le
// RELEVÉ (`btp_releves`, `btp_releve_reponses`) dit ce qu'on a constaté chez
// CE client, ce jour-là. Corriger le libellé d'un point de contrôle ne doit
// jamais réécrire un constat d'expert.
//
// ⚠ LE DROIT VIENT DE L'AFFAIRE, pas de l'activité : un chargé d'affaires ne
// lit que les relevés des dossiers dont il est responsable. C'est imposé par
// la base (policies via `can_see_deal`, prouvé en recette en lecture ET en
// écriture) ; `scope.canSeeDeal` en est le miroir côté écran, et l'écran
// évite seulement d'offrir un bouton qui échouerait.
import { db } from './db.js';
import { scope } from './scope.js';

export const SEAU_RELEVES = 'btp-releves';

// Les trois états d'un point. ⚠ « N.V. » N'EST PAS « OK » : c'est ce qu'on
// n'a PAS pu regarder — toit inaccessible, cave fermée — et cela doit se
// retrouver tel quel dans le rapport. Dire « conforme » de ce qu'on n'a pas
// vu est la faute qui engage la responsabilité du cabinet.
export const ETATS = {
  ok:       { mot: 'OK',       aide: 'Vérifié, rien à signaler',        ton: 'vert' },
  anomalie: { mot: 'Anomalie', aide: 'Un désordre constaté',            ton: 'rouge' },
  nv:       { mot: 'N.V.',     aide: 'Non vérifiable : pas pu regarder', ton: 'muted' },
};

export const zones = () => scope.canBtp
  ? db.t('btp_checklist_zones').slice().sort((a, b) => a.rang - b.rang) : [];

export const pointsDe = (zoneRang) => scope.canBtp
  ? db.t('btp_checklist_points').filter(p => p.zone_rang === zoneRang)
      .sort((a, b) => a.rang - b.rang) : [];

export const tousLesPoints = () => scope.canBtp ? db.t('btp_checklist_points') : [];

// Les relevés visibles, le plus récent d'abord. Le filtre par affaire double
// la RLS : en mode démonstration il n'y a pas de base pour l'imposer.
export const releves = () => scope.canBtp
  ? db.t('btp_releves')
      .filter(r => scope.deals().some(d => d.id === r.deal_id))
      .sort((a, b) => String(b.date_visite).localeCompare(String(a.date_visite)))
  : [];

export const reponsesDe = (releveId) =>
  db.t('btp_releve_reponses').filter(r => r.releve_id === releveId);

// ⚠ L'AVANCEMENT SE COMPTE SUR LES LIGNES EXISTANTES, jamais sur une valeur
// « pas encore vu » : un point sans ligne est un point qu'on n'a pas encore
// regardé, et l'absence le dit déjà. Créer les 54 lignes d'avance obligerait
// à inventer un quatrième état pour distinguer les deux.
export function bilan(releveId) {
  const rep = reponsesDe(releveId);
  const par = (e) => rep.filter(r => r.etat === e).length;
  return {
    repondus: rep.length,
    total: tousLesPoints().length,
    ok: par('ok'), anomalies: par('anomalie'), nv: par('nv'),
    photos: rep.reduce((n, r) => n + (r.photos?.length || 0), 0),
  };
}

export async function creerReleve(dealId, dateVisite) {
  return db.insert('btp_releves', {
    deal_id: dealId,
    date_visite: dateVisite || new Date().toISOString().slice(0, 10),
    auteur_id: scope.user?.id || null,
  });
}

export const majReleve = (id, champs) => db.update('btp_releves', id, champs);

// ⚠ UNE RÉPONSE S'ÉCRIT EN « INSÉRER OU METTRE À JOUR » : on repasse sur un
// point pour le corriger ou lui ajouter une note, et la clé est la paire
// (relevé, point). Deux lignes pour un même point donneraient deux états
// contradictoires sur la même observation.
export async function repondre(releveId, pointId, champs) {
  const existante = db.t('btp_releve_reponses')
    .find(r => r.releve_id === releveId && r.point_id === pointId);
  if (existante) return db.update('btp_releve_reponses', existante.id, champs);
  return db.insert('btp_releve_reponses', { releve_id: releveId, point_id: pointId, ...champs });
}

// ⚠ LE CHEMIN PORTE LE DROIT : `<releve_id>/<point_id>/<horodatage>-<nom>`.
// La policy du seau remonte au relevé par le premier segment, donc un fichier
// rangé ailleurs serait refusé — ce n'est pas une convention de nommage, c'est
// le contrôle d'accès lui-même.
export async function deposerPhoto(releveId, pointId, fichier) {
  const propre = fichier.name.replace(/[^\w.\-]+/g, '-').slice(-60);
  const chemin = `${releveId}/${pointId}/${Date.now()}-${propre}`;
  await db.uploadFile(chemin, fichier, { bucket: SEAU_RELEVES });
  return chemin;
}
