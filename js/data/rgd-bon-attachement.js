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
import { isoDay } from '../ui.js';

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
export const lignesHeure = (devis) => (devis?.lignes || []).filter(l => l.unite === 'heure');

// ⚠ LE DÉPLACEMENT N'EST PAS UNE FOURNITURE POSÉE (11/11/2026, Élodie : « pour
// le déplacement c'est un forfait établi dans la facture, donc inspire-toi en »).
// Il arrivait dans le tableau des fournitures, entre un disjoncteur et une
// gaine — on ne pose pas un déplacement. Il a sa propre case, « Forfait », que
// la facture remplit désormais toute seule.
const EST_DEPLACEMENT = (l) => l.code === 'deplacement';
/** Les autres : ce sont les fournitures posées. */
export const lignesFourniture = (devis) => (devis?.lignes || [])
  .filter(l => l.unite !== 'heure' && !EST_DEPLACEMENT(l));

/**
 * Une ligne de facture, écrite comme on la raconte sur un bon.
 *
 * ⚠ LA QUANTITÉ NE S'ÉCRIT QUE SI ELLE DIT QUELQUE CHOSE : « Diagnostic — 1 »
 * n'apprend rien, « Passage de câble — 12 ml » si. Et « forfait » ne
 * s'imprime pas comme une unité : un forfait n'a pas de quantité à montrer.
 */
export const ligneRacontee = (l) => {
  const nom = [l.libelle, l.variante, l.precision].filter(Boolean).join(' — ');
  if (!nom) return '';
  const q = Number(String(l.quantite ?? '').replace(',', '.'));
  const u = l.unite && !['forfait', 'u'].includes(l.unite) ? ` ${l.unite}` : '';
  return Number.isFinite(q) && q > 1 ? `${nom} — ${String(l.quantite).replace('.', ',')}${u}` : nom;
};

/** Le bon d'une facture, s'il existe. Un seul par facture, la base le garantit. */
export const bonDuDevis = (devis) =>
  (devis ? db.t('rgd_bons').find(b => b.devis_id === devis.id) : null) || null;

/** Les bons d'un dossier, le plus récent en tête. */
export const bonsDeLaFiche = (x) => {
  const id = x?.ligne?.id;
  if (!id) return [];
  const cle = x.genre === 'demande' ? 'demande_id' : 'fiche_id';
  return db.t('rgd_bons').filter(b => b[cle] === id)
    .sort((a, b) => String(b.date_bon || '').localeCompare(String(a.date_bon || '')));
};

/**
 * À qui appartient un bon.
 *
 * ⚠ LA RÈGLE EST CELLE DES DEVIS, COPIÉE ET NON RÉÉCRITE (`enregistrerDevisCrm`).
 * Elle a DEUX sens, et n'en lire qu'un fabrique la panne inverse :
 *   · la direction qui travaille sur le dossier de quelqu'un lui laisse ce
 *     qu'elle crée — Mickael remplit, Franck doit le voir ;
 *   · mais celui qui n'est PAS direction garde ce qu'il crée, même sur une
 *     fiche dont un autre est propriétaire : c'est lui qui était sur place et
 *     qui a fait signer, il doit retrouver son bon.
 * Et un bon rattaché à une facture suit d'abord SA FACTURE : les deux
 * documents du même chantier ne doivent pas se retrouver dans deux portefeuilles.
 */
export const proprietaireDuBon = (x, devis = null) => devis?.owner_id
  || (scope.isDirection ? (x?.ligne?.owner_id || null) : null)
  || scope.user?.id || null;

/**
 * Créer un bon. `devis` est la facture quand il y en a une, `null` sinon.
 *
 * ⚠ IL NAÎT NUMÉROTÉ, SANS BROUILLON. Un bon se crée pour être rempli tout de
 * suite, sur place ; lui donner un état « brouillon » qui retiendrait son
 * numéro ferait un document sans identité au moment précis où on le fait
 * signer.
 */
export function creerBon(x, devis = null, objet = null) {
  const f = x.ligne || {};
  return db.insert('rgd_bons', {
    date_bon: devis?.date_devis || isoDay(),
    objet: objet || devis?.objet || null,
    fiche_id: x.genre === 'fiche' ? f.id : null,
    demande_id: x.genre === 'demande' ? f.id : null,
    contact_id: f.contact_id || null,
    organisation_id: f.organisation_id || null,
    devis_id: devis?.id || null,
    owner_id: proprietaireDuBon(x, devis),
  });
}

/**
 * La saisie au premier remplissage : ce que la facture et la fiche SAVENT déjà.
 *
 * Élodie : « rempli automatiquement avec les informations données au
 * préalable ». Donc la date, le code postal, l'objet des travaux, les heures
 * de chaque ligne, le nom de celui qui remplit. Et rien d'autre : voir
 * l'en-tête sur les contrôles.
 *
 * ⚠ SANS FACTURE, IL N'Y A RIEN À PRÉ-REMPLIR, et c'est à dire à l'écran :
 * une feuille d'heures vide et aucune fourniture. Les inventer serait pire
 * que de les demander.
 *
 * ⚠ UNE SAISIE DÉJÀ FAITE N'EST JAMAIS RECOUVERTE. On ne complète que les
 * champs absents — rouvrir le bon pour corriger une faute ne doit pas rendre
 * ses heures à ce que la facture disait.
 */
export function saisieDepart({ bon = null, devis = null, d = {} } = {}) {
  const faite = (bon?.saisie && typeof bon.saisie === 'object') ? { ...bon.saisie } : {};
  const vide = (k) => faite[k] === undefined || faite[k] === null || faite[k] === '';

  const objet = devis?.objet || bon?.objet || '';
  // ⚠ LE CONSTAT SE DEVINE DEPUIS LES LIGNES DE LA FACTURE (11/11/2026,
  // Élodie : « l'encadré ce qui a été fait je voudrais qu'il soit pré-rempli
  // par rapport aux fournitures, on peut le deviner »). Il ne portait que
  // l'objet — « Dépannage électrique » —, c'est-à-dire le titre, pas le
  // contenu : Franck devait retaper chez le client ce qu'il venait de cocher
  // dans la facture.
  //
  // ⚠ L'OBJET RESTE EN TÊTE, puis une ligne par prestation. Elles s'impriment
  // ligne par ligne, et chacune reste modifiable : ce bon dit ce qui a
  // RÉELLEMENT été fait, pas ce qui avait été chiffré.
  if (vide('constat')) {
    // ⚠ LES FOURNITURES, PAS TOUTES LES LIGNES (« pré-rempli par rapport aux
    // fournitures »). Le déplacement et les heures ont chacun leur bloc plus
    // bas : les répéter ici donnait un constat qui commence par
    // « Déplacement. Main-d'œuvre. » avant de dire ce qui a été fait.
    const racontees = lignesFourniture(devis).map(ligneRacontee).filter(Boolean);
    const tout = [objet, ...racontees].filter(Boolean);
    if (tout.length) faite.constat = tout.join('\n');
  }
  if (vide('lieu_cp_ville')) faite.lieu_cp_ville = [d.cpChantier, d.villeChantier].filter(Boolean).join(' ');
  // ⚠ L'INTERVENANT EST CELUI DU DOCUMENT, PAS CELUI QUI OUVRE L'ÉCRAN. La
  // direction consulte et imprime depuis le bureau : son nom se serait posé
  // dans la case « intervenant RGD » d'un chantier où elle n'était pas.
  if (vide('intervenant')) faite.intervenant = nomDuResponsable(bon || devis);

  // ⚠ LA FEUILLE D'HEURES EST UNE FEUILLE D'HEURES, PAS LA LISTE DES
  // PRESTATIONS. Une rangée par ligne à l'heure, avec SA durée et la date du
  // document ; le reste (qui, habilitation, arrivée, départ) reste à saisir,
  // parce que la facture ne le sait pas. Le libellé de la prestation n'y est
  // pas recopié : la colonne s'appelle « Intervenant(s) », et y imprimer
  // « Remplacement du tableau » donnerait un document qui dit faux.
  if (!Array.isArray(faite.mo) || !faite.mo.length) {
    const heures = lignesHeure(devis);
    const quand = devis?.date_devis || bon?.date_bon || '';
    faite.mo = (heures.length ? heures : [null]).map(l => ({
      date: quand,
      qui: faite.intervenant || '',
      habilitation: '', arrivee: '', depart: '', pause: '',
      duree: l ? String(l.quantite ?? '').replace('.', ',') : '',
    }));
  }

  // ⚠ LE DÉPLACEMENT EST COCHÉ PAR LA FACTURE, PAS PAR LA MÉMOIRE DE FRANCK.
  // S'il a facturé un déplacement, c'est un forfait, et le bon le sait. La
  // quantité devient le nombre de déplacements — deux passages se facturent
  // deux fois et se constatent deux fois.
  //
  // ⚠ ON NE COCHE RIEN SI LA FACTURE NE DIT RIEN : pas de ligne de
  // déplacement, pas de case. Un bon qui coche à la place de celui qui était
  // sur place ne constate plus, il suppose.
  const deplacement = (devis?.lignes || []).find(l => l.code === 'deplacement');
  if (deplacement) {
    if (vide('deplacement')) faite.deplacement = 'forfait';
    if (vide('deplacement_nb')) {
      const n = Number(String(deplacement.quantite ?? '').replace(',', '.'));
      faite.deplacement_nb = Number.isFinite(n) && n > 0 ? String(Math.round(n)) : '1';
    }
  }

  // ⚠ UNE FOURNITURE PORTE DÉSORMAIS TOUT CE QUI S'IMPRIME, pas seulement ce
  // que la facture ignore. Avant, c'était `{reference, fourni_par}` aligné par
  // RANG sur les lignes de la facture : un bon sans facture n'avait rien à
  // aligner, et l'alignement par rang se décale au premier changement. Chaque
  // rangée est maintenant complète et se suffit — on la dérive de la facture
  // UNE FOIS, à la création, puis elle ne bouge plus que par la main.
  if (!Array.isArray(faite.fournitures)) {
    faite.fournitures = lignesFourniture(devis).map(l => ({
      designation: [l.libelle, l.variante, l.precision].filter(Boolean).join(' — '),
      unite: l.unite || 'forfait',
      quantite: String(l.quantite ?? '').replace('.', ','),
      reference: l.reference || '',
      fourni_par: '',
    }));
  }
  return faite;
}

/** Le total des heures saisies, pour le pied du tableau. */
export const totalHeures = (saisie) => (Array.isArray(saisie?.mo) ? saisie.mo : [])
  .reduce((n, r) => n + (nombre(r.duree) || 0), 0);

/** Vrai dès qu'on a saisi quelque chose : le bon n'est plus vierge. */
export const bonRempli = (bon) => {
  const s = bon?.saisie;
  if (!s || typeof s !== 'object') return false;
  return Object.entries(s).some(([k, v]) => {
    if (k === 'mo') return Array.isArray(v) && v.some(r => r && (r.qui || r.arrivee || r.depart || r.habilitation));
    if (k === 'fournitures') return Array.isArray(v) && v.some(r => r && (r.fourni_par || r.designation));
    return Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim();
  });
};

/** Enregistrer la saisie. */
export const enregistrerBonAttachement = (bon, saisie) =>
  db.update('rgd_bons', bon.id, { saisie });

/**
 * Le bon signé par le client, sur place.
 *
 * ⚠ DEUX SIGNATURES, DEUX DOCUMENTS. Sur la facture le client reconnaît une
 * somme ; ici il reconnaît des TEMPS PASSÉS et des FOURNITURES posées. C'est
 * ce document qu'on ressort si les heures sont contestées, et une signature
 * recopiée de la facture n'y servirait à rien.
 */
export const signerBonAttachement = (bon, { signature, nom }) =>
  db.update('rgd_bons', bon.id, {
    signature,
    signe_par: String(nom || '').trim() || null,
    signe_a: new Date().toISOString(),
  });

/** Supprimer un bon — la base refuse dès qu'il est signé. */
export const supprimerBon = (bon) => db.remove('rgd_bons', bon.id);

/**
 * Le numéro du bon.
 *
 * ⚠ IL NE SE DÉDUIT PLUS DE LA FACTURE (02/11/2026). Il valait `BA` + le
 * numéro de la facture ; un bon sans facture n'en aurait eu aucun, et deux
 * suites parallèles finissent par se percuter. Il vient d'une séquence à lui.
 */
export const numeroBon = (bon) => bon?.numero || '';

/**
 * Le message qui accompagne le bon.
 *
 * ⚠ IL NE PARLE PAS D'ARGENT. Un bon d'attachement constate des temps passés
 * et des fournitures posées ; annoncer un montant en ferait un second
 * document de facturation, et le client paierait deux fois ou croirait le
 * devoir. La facture a son propre mail.
 */
export function messageBonAttachement(bon, devis, nomClient) {
  const salut = nomClient ? `Bonjour ${nomClient},` : 'Bonjour,';
  // ⚠ SANS FACTURE, ON NE PROMET PAS QU'ELLE SUIVRA. « Il accompagne la
  // facture n° … » sur un bon autonome annoncerait un document qui n'existe
  // pas, et peut-être n'existera jamais (garantie, sous-traitance).
  const suite = devis?.numero
    ? `Il accompagne la facture n° ${devis.numero} et ne vous demande aucun règlement.`
    : 'Il ne porte aucun montant et ne vous demande aucun règlement.';
  return `${salut}

Vous trouverez ci-joint le bon d’attachement n° ${numeroBon(bon)} de notre intervention.

Il reprend le détail des temps passés, des fournitures posées et des contrôles effectués avant la remise sous tension. ${suite}

Nous vous invitons à le conserver avec vos documents.

Bien cordialement,
L’équipe RGD Renova`;
}
