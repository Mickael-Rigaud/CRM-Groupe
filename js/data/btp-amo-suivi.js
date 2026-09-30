// Le suivi d'une mission AMO : ce qui a été fait, phase par phase.
//
// ⚠ DEUX CHOSES QUI NE SE MÉLANGENT PAS, comme pour la visite. Le RÉFÉRENTIEL
// (`btp-amo-checklist.js`) dit ce qu'il faut faire : il est le même pour toutes
// les missions et vit dans le dépôt. Le SUIVI (`btp_amo_suivi`) dit ce qui a
// été fait sur CETTE mission, quand et par qui. Corriger le libellé d'un point
// ne doit jamais réécrire un geste déjà daté.
//
// ⚠ LE SUIVI SE RATTACHE À L'AFFAIRE, PAS À UNE VISITE. Une mission AMO est une
// durée — six phases sur plusieurs mois — et n'a pas de « passage » auquel
// s'accrocher. C'est ce qui la distingue de la check-list d'expertise, et ça
// change la table.
//
// ⚠ LE DROIT VIENT DE L'AFFAIRE : un chargé d'affaires ne suit que les missions
// dont il est responsable. Imposé par la base (policy via `btp_releve_visible`,
// qui répond « cette affaire m'est-elle visible ») ; ce qui suit n'en est que
// le miroir, et l'écran évite seulement d'offrir un bouton qui échouerait.
import { db } from './db.js';
import { scope } from './scope.js';
import { missionDe, echeancesDe } from './schema.js';
import { PHASES_AMO, pointsDePhase, tousLesPointsAmo, pointAmo } from './btp-amo-checklist.js';

// Les missions AMO visibles, la plus récemment bougée d'abord.
// ⚠ ON NE FILTRE PAS SUR UNE ÉTAPE : une mission se prépare avant d'être
// signée, et la phase de cadrage se remplit justement à ce moment-là.
export const missionsAmo = () => scope.canBtp
  ? scope.deals()
      .filter(d => d.activity === 'btp' && missionDe(d) === 'amo')
      .sort((a, b) => String(b.stage_changed_at || b.created_at || '')
                        .localeCompare(String(a.stage_changed_at || a.created_at || '')))
  : [];

export const suiviDe = (dealId) =>
  scope.canBtp ? db.t('btp_amo_suivi').filter(s => s.deal_id === dealId) : [];

export const etatDuPoint = (dealId, pointId) =>
  suiviDe(dealId).find(s => s.point_id === pointId) || null;

// ⚠ INSÉRER OU METTRE À JOUR sur la paire (affaire, point) : on repasse sur un
// point pour corriger sa date ou ajouter une note, et deux lignes donneraient
// deux vérités sur le même geste.
export async function noterPoint(dealId, pointId, champs) {
  const deja = db.t('btp_amo_suivi').find(s => s.deal_id === dealId && s.point_id === pointId);
  if (deja) return db.update('btp_amo_suivi', deja.id, champs);
  return db.insert('btp_amo_suivi', {
    deal_id: dealId, point_id: pointId,
    fait_le: new Date().toISOString().slice(0, 10),
    auteur_id: scope.user?.id || null,
    ...champs,
  });
}

// Retirer un point revient à le remettre « à faire » : c'est l'absence de
// ligne qui porte cet état, il n'y a donc rien à écrire.
export const effacerPoint = (id) => db.remove('btp_amo_suivi', id);

// ------------------------------------------------------------ l'avancement

const compte = (lignes, etat) => lignes.filter(l => l.etat === etat).length;

// ⚠ « SANS OBJET » SORT DU DÉNOMINATEUR, il ne compte pas comme fait. Une
// mission sans copropriété n'a pas à vérifier le règlement de copropriété :
// l'inclure ferait un avancement qui plafonne à 94 % sans que rien ne le dise,
// et le compter comme traité ferait croire à un contrôle qui n'a pas eu lieu.
export function bilanAmo(dealId) {
  const lignes = suiviDe(dealId);
  const total = tousLesPointsAmo().length;
  const horsJeu = compte(lignes, 'sans_objet');
  const faits = compte(lignes, 'fait');
  const alertes = compte(lignes, 'alerte');
  const attendus = total - horsJeu;
  return {
    total, faits, alertes, horsJeu, attendus,
    // Une alerte est un point TRAITÉ : on l'a vu, on l'a signalé par écrit.
    traites: faits + alertes,
    reste: attendus - faits - alertes,
    pourcent: attendus ? Math.round(((faits + alertes) / attendus) * 100) : 100,
  };
}

// Les six phases, chacune avec ses points et son propre avancement.
export function phasesAvecPoints(dealId) {
  const lignes = suiviDe(dealId);
  return PHASES_AMO.map(ph => {
    const points = pointsDePhase(ph.num).map(p => ({
      ...p, ligne: lignes.find(l => l.point_id === p.id) || null,
    }));
    const dedans = points.filter(p => p.ligne?.etat !== 'sans_objet');
    const traites = points.filter(p => p.ligne && p.ligne.etat !== 'sans_objet').length;
    return {
      ...ph, points,
      alertes: points.filter(p => p.ligne?.etat === 'alerte').length,
      traites, attendus: dedans.length,
      complete: dedans.length > 0 && traites === dedans.length,
      pourcent: dedans.length ? Math.round((traites / dedans.length) * 100) : 100,
    };
  });
}

// ⚠ LES POINTS DE FRONTIÈRE SE LISENT À PART. Ce sont ceux sur lesquels une
// mission bascule dans la responsabilité décennale du constructeur : les noyer
// dans les trente-huit autres reviendrait à ne pas les avoir écrits.
export function frontiereDe(dealId) {
  const lignes = suiviDe(dealId);
  const points = tousLesPointsAmo().filter(p => p.frontiere)
    .map(p => ({ ...p, ligne: lignes.find(l => l.point_id === p.id) || null }));
  return {
    points,
    traites: points.filter(p => p.ligne).length,
    total: points.length,
    alertes: points.filter(p => p.ligne?.etat === 'alerte').length,
  };
}

// ⚠ CE QUI RELIE LE SUIVI À L'ARGENT. Les trois échéances (40 / 40 / 20)
// tombent sur la signature, le suivi intermédiaire et la réception : à chaque
// jalon, on veut savoir si ce qui devait être fait l'a été AVANT de facturer.
// L'écran prévient, il n'interdit rien — une facture peut partir sur une phase
// incomplète en connaissance de cause, et bloquer forcerait à cocher pour
// passer.
const PHASE_DE_L_ECHEANCE = { acompte: [1, 2], intermediaire: [3, 4], solde: [5] };

export function jalonsAmo(deal) {
  const phases = phasesAvecPoints(deal.id);
  return echeancesDe(deal).map(e => {
    const nums = PHASE_DE_L_ECHEANCE[e.cle] || [];
    const concernees = phases.filter(p => nums.includes(p.num));
    const reste = concernees.reduce((n, p) => n + (p.attendus - p.traites), 0);
    return {
      ...e,
      phases: concernees.map(p => p.label),
      reste,
      pret: reste === 0,
      alertes: concernees.reduce((n, p) => n + p.alertes, 0),
    };
  });
}

export { PHASES_AMO, pointAmo };
