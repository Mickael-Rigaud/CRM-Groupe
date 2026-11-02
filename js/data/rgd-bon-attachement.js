// Le bon d'attachement : ce qui se remplit à l'écran (02/11/2026)
//
// Élodie : « je voudrais pouvoir remplir directement depuis l'interface pour
// pouvoir l'envoyer aussi par mail au client ». Le bon existait déjà,
// pré-rempli depuis la facture et SORTI À IMPRIMER : constats, contrôles,
// heures et fournitures restaient blancs, à écrire au stylo. Un document qu'on
// envoie par mail ne peut pas avoir de blancs — on ne remplit pas un PDF à la
// main dans la boîte du client.
//
// ⚠ UNE SEULE DÉCLARATION, DEUX LECTEURS. Les groupes de cases vivent ICI, et
// le formulaire comme le gabarit imprimé les lisent tous les deux. Les écrire
// aux deux endroits, c'est la dérive garantie : une case ajoutée au formulaire
// que le PDF n'imprime pas, donc une observation saisie qui n'arrive jamais
// chez le client — et rien pour le dire.
//
// ⚠ ON ENREGISTRE DES CODES, PAS DES LIBELLÉS. Un libellé se reformule (« Local
// pro » devient « Local professionnel »), et un bon signé l'an dernier
// perdrait sa coche sans que personne ne le voie. Le code ne bouge jamais ;
// c'est le libellé qui s'affiche.
//
// ⚠ ET ON NE PRÉ-COCHE AUCUN CONTRÔLE. Les essais de différentiels, la
// résistance de terre, la remise sous tension : ce sont des gestes faits sur
// place. Les proposer cochés ferait attester des contrôles que personne n'a
// faits, sur un document que le client signe.
import { db } from './db.js';
import { scope } from './scope.js';

/**
 * Les groupes de cases du bon, dans l'ordre du papier.
 *
 * `mode` vaut `une` (un seul choix, enregistré en texte) ou `plusieurs`
 * (enregistré en liste). `aussi` nomme le champ libre qu'une option ouvre :
 * « Autre : … », « Non, motif : … », les kilomètres.
 */
export const GROUPES = {
  client_type: {
    titre: 'Type de client', mode: 'une',
    options: [
      { c: 'particulier', l: 'Particulier' },
      { c: 'syndic', l: 'Syndic / bailleur' },
      { c: 'pro', l: 'Professionnel' },
      { c: 'sous_traitance', l: 'Sous-traitance' },
    ],
  },
  lieu_type: {
    titre: 'Nature du lieu', mode: 'une',
    options: [
      { c: 'logement', l: 'Logement' },
      { c: 'local_pro', l: 'Local pro' },
      { c: 'communes', l: 'Parties communes' },
      { c: 'exterieur', l: 'Extérieur' },
    ],
  },
  nature: {
    titre: 'Nature de l’intervention', mode: 'plusieurs',
    options: [
      { c: 'depannage', l: 'Dépannage / recherche de panne' },
      { c: 'securite', l: 'Mise en sécurité' },
      { c: 'normes', l: 'Mise aux normes NF C 15-100' },
      { c: 'tableau', l: 'Remplacement de tableau' },
      { c: 'neuve', l: 'Installation neuve' },
      { c: 'renovation', l: 'Rénovation partielle / totale' },
      { c: 'prises', l: 'Prises, circuits spécialisés' },
      { c: 'eclairage', l: 'Éclairage int. / ext.' },
      { c: 'irve', l: 'Borne de recharge (IRVE)' },
      { c: 'chauffage', l: 'Chauffage, VMC, chauffe-eau' },
      { c: 'reseau', l: 'Réseau, interphone' },
      // `long` : un trait large pour ecrire ; `large` : la case prend toute la
      // largeur de la grille, sinon le mot se replie au-dessus de son trait.
      { c: 'autre', l: 'Autre', aussi: 'nature_autre', long: true, large: true },
    ],
  },
  regime: {
    titre: 'Conditions', mode: 'une',
    options: [
      // Le papier validé la mettait en gras : une urgence doit sauter aux yeux.
      { c: 'urgence', l: 'Urgence', gras: true },
      { c: 'programmee', l: 'Intervention programmée' },
      { c: 'astreinte', l: 'Astreinte (soir, week-end, jour férié)' },
    ],
  },
  deplacement: {
    titre: 'Déplacement', mode: 'une',
    options: [
      { c: 'forfait', l: 'Forfait' },
      { c: 'km', l: 'Kilométrique', aussi: 'deplacement_km' },
    ],
  },
  controles: {
    titre: 'Contrôles avant remise sous tension', mode: 'plusieurs',
    options: [
      { c: 'differentiels', l: 'Essai des différentiels 30 mA' },
      { c: 'continuite', l: 'Continuité des conducteurs de protection' },
      { c: 'terre', l: 'Résistance de terre', aussi: 'controle_terre', unite: 'Ω' },
      { c: 'isolement', l: 'Résistance d’isolement', aussi: 'controle_isolement', unite: 'MΩ' },
      { c: 'serrage', l: 'Serrage des connexions, repérage des circuits' },
      { c: 'essai', l: 'Essai de fonctionnement devant le client' },
    ],
  },
  sous_tension: {
    titre: 'Installation remise sous tension', mode: 'une',
    options: [
      { c: 'oui', l: 'Oui' },
      { c: 'non', l: 'Non, motif', aussi: 'sous_tension_motif', long: true },
    ],
  },
  materiel: {
    titre: 'Matériel déposé', mode: 'une',
    options: [
      { c: 'client', l: 'Laissé au client' },
      { c: 'rgd', l: 'Évacué par RGD Renova' },
    ],
  },
  suite: {
    titre: 'Suite à donner', mode: 'plusieurs',
    options: [
      { c: 'termines', l: 'Travaux terminés' },
      { c: 'passage', l: 'Nouveau passage à prévoir' },
      { c: 'devis', l: 'Devis complémentaire à établir' },
      { c: 'consuel', l: 'Attestation Consuel à prévoir' },
    ],
  },
  reception: {
    titre: 'Réception par le client', mode: 'une',
    options: [
      { c: 'sans_reserve', l: 'Travaux réceptionnés sans réserve' },
      { c: 'reserves', l: 'Avec réserves (voir anomalies)' },
    ],
  },
};

/** Qui a fourni le matériel, ligne par ligne. */
export const FOURNI_PAR = [
  { c: 'rgd', l: 'RGD Renova' },
  { c: 'client', l: 'Client' },
];
export const nomFourniPar = (code) => FOURNI_PAR.find(f => f.c === code)?.l || '';

/** Les colonnes de la feuille d'heures, dans l'ordre du tableau imprimé. */
export const COLONNES_MO = [
  { c: 'date', l: 'Date', type: 'date' },
  { c: 'qui', l: 'Intervenant(s)' },
  { c: 'habilitation', l: 'Habilitation' },
  { c: 'arrivee', l: 'Arrivée', type: 'time' },
  { c: 'depart', l: 'Départ', type: 'time' },
  { c: 'pause', l: 'Pause' },
  { c: 'duree', l: 'Durée (h)', num: true },
];

/** Vrai si cette coche est portée par la saisie — un choix unique ou une liste. */
export const coche = (saisie, nom, code) => {
  const v = saisie?.[nom];
  return Array.isArray(v) ? v.includes(code) : v === code;
};

/** Le libellé d'un code, pour l'afficher hors de son groupe. */
export const libelle = (nom, code) =>
  (GROUPES[nom]?.options.find(o => o.c === code)?.l) || '';

const nombre = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Celui à qui la facture appartient — à défaut, celui qui est connecté. */
export const nomDuResponsable = (devis) => {
  const p = devis?.owner_id ? db.byId('profiles', devis.owner_id) : null;
  return p?.full_name || scope.user?.full_name || '';
};

/** Les lignes à l'heure de la facture — celles qui alimentent la feuille d'heures. */
export const lignesHeure = (devis) => (devis.lignes || []).filter(l => l.unite === 'heure');
/** Les autres : ce sont les fournitures posées. */
export const lignesFourniture = (devis) => (devis.lignes || []).filter(l => l.unite !== 'heure');

/**
 * La saisie au premier remplissage : ce que la facture et la fiche SAVENT déjà.
 *
 * Élodie : « rempli automatiquement avec les informations données au
 * préalable ». Donc la date, le code postal, l'objet des travaux, les heures
 * de chaque ligne, le nom de celui qui remplit. Et rien d'autre : voir
 * l'en-tête sur les contrôles.
 *
 * ⚠ UNE SAISIE DÉJÀ FAITE N'EST JAMAIS RECOUVERTE. On ne complète que les
 * champs absents — rouvrir le bon pour corriger une faute ne doit pas rendre
 * ses heures à ce que la facture disait.
 */
export function saisieDepart(devis, d = {}, saisie = null) {
  const faite = saisie && typeof saisie === 'object' ? { ...saisie } : {};
  const vide = (k) => faite[k] === undefined || faite[k] === null || faite[k] === '';

  if (vide('constat') && devis.objet) faite.constat = devis.objet;
  if (vide('lieu_cp_ville')) faite.lieu_cp_ville = [d.cpChantier, d.villeChantier].filter(Boolean).join(' ');
  // ⚠ L'INTERVENANT EST CELUI DE LA FACTURE, PAS CELUI QUI OUVRE L'ÉCRAN. La
  // direction consulte et imprime depuis le bureau : son nom se serait posé
  // dans la case « intervenant RGD » d'un chantier où elle n'était pas.
  if (vide('intervenant')) faite.intervenant = nomDuResponsable(devis);

  // ⚠ LA FEUILLE D'HEURES EST UNE FEUILLE D'HEURES, PAS LA LISTE DES
  // PRESTATIONS. Une rangée par ligne à l'heure, avec SA durée et la date de
  // la facture ; le reste (qui, habilitation, arrivée, départ) reste à saisir,
  // parce que la facture ne le sait pas. Le libellé de la prestation n'y est
  // pas recopié : la colonne s'appelle « Intervenant(s) », et y imprimer
  // « Remplacement du tableau » donnerait un document qui dit faux.
  if (!Array.isArray(faite.mo) || !faite.mo.length) {
    const heures = lignesHeure(devis);
    faite.mo = (heures.length ? heures : [null]).map(l => ({
      date: devis.date_devis || '',
      qui: faite.intervenant || '',
      habilitation: '', arrivee: '', depart: '', pause: '',
      duree: l ? String(l.quantite ?? '').replace('.', ',') : '',
    }));
  }

  // Les fournitures suivent l'ordre des lignes de la facture : on n'ajoute
  // que ce que la facture ne sait pas — la marque exacte et qui l'a fournie.
  const fournitures = lignesFourniture(devis);
  if (!Array.isArray(faite.fournitures) || faite.fournitures.length !== fournitures.length) {
    const avant = Array.isArray(faite.fournitures) ? faite.fournitures : [];
    faite.fournitures = fournitures.map((l, i) => ({
      reference: avant[i]?.reference ?? (l.reference || ''),
      fourni_par: avant[i]?.fourni_par ?? '',
    }));
  }
  return faite;
}

/** Le total des heures saisies, pour le pied du tableau. */
export const totalHeures = (saisie) => (Array.isArray(saisie?.mo) ? saisie.mo : [])
  .reduce((n, r) => n + (nombre(r.duree) || 0), 0);

/** Vrai dès qu'on a saisi quelque chose : le bon n'est plus vierge. */
export const bonRempli = (devis) => {
  const s = devis?.bon_saisie;
  if (!s || typeof s !== 'object') return false;
  return Object.entries(s).some(([k, v]) => {
    if (k === 'mo') return Array.isArray(v) && v.some(r => r && (r.qui || r.arrivee || r.depart || r.habilitation));
    if (k === 'fournitures') return Array.isArray(v) && v.some(r => r && r.fourni_par);
    return Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim();
  });
};

/**
 * Enregistrer la saisie.
 *
 * ⚠ ON N'ÉCRIT QUE `bon_saisie`, ET C'EST CE QUI PERMET DE LE REMPLIR APRÈS
 * SIGNATURE. Le déclencheur de la base refuse toute modification de `lignes`
 * ou du taux de TVA sur un document signé — et le bon se remplit justement à
 * la FIN de l'intervention, quand la facture est déjà signée. Lui envoyer la
 * facture entière la ferait refuser.
 */
export const enregistrerBonAttachement = (devis, saisie) =>
  db.update('rgd_devis_crm', devis.id, { bon_saisie: saisie });

/** Le numéro du bon : celui de la facture, sur sa propre suite. */
export const numeroBon = (devis) =>
  (devis.numero ? 'BA' + String(devis.numero).replace(/^(FA|DV)/, '') : '');

/**
 * Le message qui accompagne le bon.
 *
 * ⚠ IL NE PARLE PAS D'ARGENT. Un bon d'attachement constate des temps passés
 * et des fournitures posées ; annoncer un montant en ferait un second
 * document de facturation, et le client paierait deux fois ou croirait le
 * devoir. La facture a son propre mail.
 */
export function messageBonAttachement(devis, nomClient) {
  const salut = nomClient ? `Bonjour ${nomClient},` : 'Bonjour,';
  return `${salut}

Vous trouverez ci-joint le bon d’attachement n° ${numeroBon(devis)} de notre intervention.

Il reprend le détail des temps passés, des fournitures posées et des contrôles effectués avant la remise sous tension. Il accompagne la facture n° ${devis.numero || ''} et ne vous demande aucun règlement.

Nous vous invitons à le conserver avec votre facture.

Bien cordialement,
L’équipe RGD Renova`;
}
