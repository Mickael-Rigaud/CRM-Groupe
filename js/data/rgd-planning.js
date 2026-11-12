// Planning des chantiers de RGD Renova (10/11/2026, demandé par Élodie)
//
// Un chantier planifié : une date de début, une durée en jours CALENDAIRES
// (week-end compris — son choix), un rattachement à une fiche client ou à une
// demande, et deux listes cochables, matériaux et outils.
//
// ⚠ TABLES À PART (`rgd_planning`, `rgd_planning_lignes`), PAS `rgd_chantiers` :
// celle-ci est écrite par la synchronisation Costructor et porte aussi les
// visites techniques. Deux écrivains sur les mêmes dates s'effacent l'un
// l'autre (voir la migration 20261110 du dépôt Backend).
//
// ⚠ LES CHANTIERS PEUVENT SE SUPERPOSER, et c'est demandé : rien ici ne refuse
// deux chantiers sur les mêmes jours. Le calendrier les empile.
//
// ⚠ LES LISTES STANDARD SONT UN MODÈLE, PAS UN LIEN. Ajouter les matériaux
// standard à un chantier RECOPIE les lignes : on les coche, on les retouche,
// on en retire, sans toucher au modèle ni aux autres chantiers. Le modèle vit
// dans `rgd_reglages`, clé `planning_listes_standard`, et se modifie depuis
// l'écran.
import { db } from './db.js';
import { scope } from './scope.js';
// ⚠ POUR APPELER LA FONCTION SERVEUR, PAS POUR LIRE LA BASE : `db` passe déjà
// par Supabase. `CONFIG` ne sert qu'à `demanderAvis`, qui frappe une Edge
// Function avec le jeton de la session.
import { CONFIG } from '../config.js';

export const LISTES = {
  materiaux: { label: 'Matériaux', court: 'matériau' },
  outils: { label: 'Outils', court: 'outil' },
};

// Un premier modèle, pour ne pas partir d'une page blanche. Élodie le modifie
// depuis l'écran ; dès qu'il est enregistré, c'est le sien qui fait foi.
const STANDARD_DE_DEPART = {
  materiaux: ['Câble électrique', 'Gaines', 'Boîtes d’encastrement', 'Plaques de plâtre',
    'Rails et montants', 'Enduit', 'Bandes à joint', 'Vis', 'Chevilles', 'Mastic / silicone',
    'Peinture', 'Bâche de protection', 'Sacs à gravats'],
  outils: ['Perceuse-visseuse', 'Perforateur', 'Scie sauteuse', 'Meuleuse', 'Niveau laser',
    'Mètre', 'Escabeau', 'Aspirateur de chantier', 'Rallonges', 'Projecteur',
    'Testeur de tension', 'Caisse à outils', 'EPI (gants, lunettes, casque)'],
};

const CLE_STANDARD = 'planning_listes_standard';

export function listesStandard() {
  const l = db.t('rgd_reglages').find(x => x.cle === CLE_STANDARD);
  try {
    const v = l ? JSON.parse(l.valeur) : null;
    if (v && Array.isArray(v.materiaux) && Array.isArray(v.outils)) return v;
  } catch { /* réglage illisible : on repart du modèle de départ */ }
  return { materiaux: [...STANDARD_DE_DEPART.materiaux], outils: [...STANDARD_DE_DEPART.outils] };
}

export async function enregistrerStandard(listes) {
  const valeur = JSON.stringify({
    materiaux: listes.materiaux.map(s => String(s).trim()).filter(Boolean),
    outils: listes.outils.map(s => String(s).trim()).filter(Boolean),
  });
  const existe = db.t('rgd_reglages').some(x => x.cle === CLE_STANDARD);
  return existe
    ? db.update('rgd_reglages', CLE_STANDARD, { valeur })
    : db.insert('rgd_reglages', { cle: CLE_STANDARD, valeur });
}

// ------------------------------------------------------------ les dates
// Les dates sont des chaînes « AAAA-MM-JJ » lues en heure LOCALE : passer par
// `toISOString()` rendrait de l'UTC, et un chantier posé tard le soir
// glisserait au lendemain.
export const versDate = (iso) => {
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, j);
};
export const versIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const ajouterJours = (iso, n) => {
  const d = versDate(iso);
  d.setDate(d.getDate() + n);
  return versIso(d);
};
// Le dernier jour du chantier : un chantier d'un jour finit le jour où il commence.
//
// ⚠ UNE FIN DÉCLARÉE L'EMPORTE SUR LA PRÉVISION (12/11/2026, Élodie : « un
// bouton pour déclarer la fin du chantier »). `date_debut + duree_jours` est ce
// qu'on avait prévu ; `fin_reelle` est ce qui s'est passé. Les deux coexistent
// exprès — écraser la durée au moment de déclarer la fin effacerait l'écart
// entre le prévu et le réel, qui est la seule chose permettant de dire un jour
// « nos chantiers débordent de trois jours en moyenne ».
export const finPrevue = (c) =>
  ajouterJours(c.date_debut, Math.max(1, Number(c.duree_jours) || 1) - 1);

// ⚠ UNE FIN NE PRÉCÈDE JAMAIS UN DÉBUT, ET LA GARDE N'EST PAS THÉORIQUE
// (12/11/2026, Élodie : « j'ai mis deux chantiers au même moment pour un test
// et je n'en vois qu'un »). Le chantier manquant commençait le 17/11 et
// portait une fin déclarée le 12/11 — déclarée terminée AVANT de reculer sa
// date de départ. Sa barre allait alors de la droite vers la gauche : aucune
// semaine du calendrier ne pouvait la contenir, et elle avait purement disparu
// de l'écran. Un jour de barre vaut mieux qu'une ligne invisible.
export const finDe = (c) => {
  const f = c?.fin_reelle || finPrevue(c);
  return f < c.date_debut ? c.date_debut : f;
};

// ⚠ TANT QU'UN CHANTIER N'EST PAS DÉCLARÉ TERMINÉ, IL COURT JUSQU'À AUJOURD'HUI
// (12/11/2026, Élodie : « tant qu'un chantier n'est pas déclaré terminé je veux
// qu'il continue au jour le jour par rapport à la date du jour »). La durée
// saisie est une PRÉVISION ; seule la déclaration de fin arrête la barre. Un
// chantier de six jours commencé il y a dix en occupe dix, et en occupera onze
// demain.
//
// ⚠ UNE FORMATION NE DÉBORDE PAS : ses dates sont celles d'un organisme, pas
// d'un chantier qui prend du retard. Elle garde donc sa fin prévue et passe en
// gris le lendemain, comme avant.
//
// ⚠ ET `finDe` N'A PAS CHANGÉ DE SENS : elle dit toujours ce qui était PRÉVU
// (ou ce qui a été déclaré). Les deux coexistent exprès — c'est l'écart entre
// les deux qui permet de dire « ce chantier déborde de quatre jours », et
// confondre les deux l'effacerait.
export const finAuJour = (c) => {
  const f = finDe(c);
  if (estTermine(c) || estFormation(c)) return f;
  const auj = aujourdhuiIso();
  return f < auj ? auj : f;
};

// Les jours courus au-delà du prévu — 0 quand le chantier est dans les temps.
export const joursEnPlus = (c) =>
  Math.round((versDate(finAuJour(c)) - versDate(finDe(c))) / 86400000);

// Un chantier dont la fin a été déclarée. Le planning le grise, la fiche
// propose de le rouvrir, et l'étape du dossier passe à « Chantier terminé ».
export const estTermine = (c) => !!c?.fin_reelle;

// Le jour, en heure LOCALE : `toISOString()` rendrait de l'UTC, et déclarer la
// fin d'un chantier à 23 h la daterait du lendemain.
export const aujourdhuiIso = () => versIso(new Date());

// ------------------------------------------------- les jours ouvrés (formations)
// ⚠ UNE FORMATION SE COMPTE EN JOURS OUVRÉS, PAS EN JOURS CALENDAIRES
// (11/11/2026, Élodie : « en ajoutant les dates d'une formation, je veux que ce
// soit des jours ouvrés et pas des jours calendaires »). Le défaut se voyait en
// base le jour même : « formation », 4 jours à partir du mercredi 11/11,
// finissait le SAMEDI 14. Elle finit maintenant le lundi 16.
//
// ⚠ ET C'EST LA SEULE CHOSE QUI CHANGE : `duree_jours` reste la durée
// CALENDAIRE, parce que c'est elle que lisent `finDe`, le calendrier, la frise,
// le tableau et `etapeDuPlanning`. Une formation de 4 jours ouvrés à partir du
// mercredi porte donc `duree_jours = 6`. Faire de `duree_jours` un compte de
// jours ouvrés aurait demandé de corriger tous ces lecteurs, et le premier
// oublié aurait dessiné une barre fausse sans que rien ne le dise.
//
// ⚠ « OUVRÉ » EXCLUT LES JOURS FÉRIÉS, pas seulement le week-end, et c'est le
// sens du mot : personne ne se forme un 1er mai. Le cas s'est posé tout de
// suite — le 11 novembre est férié. Les onze fériés français se CALCULENT
// plutôt qu'ils ne se listent : une liste à tenir à la main est fausse l'année
// où personne ne pense à la rallonger.
const paquesDe = (an) => {
  // Meeus / Jones / Butcher, le calcul grégorien. Rend [mois, jour].
  const a = an % 19, b = Math.floor(an / 100), c = an % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
};

const _feries = new Map();
const feriesDe = (an) => {
  if (_feries.has(an)) return _feries.get(an);
  const [mois, jour] = paquesDe(an);
  const paques = versIso(new Date(an, mois - 1, jour));
  const s = new Set([
    `${an}-01-01`,                  // Jour de l'An
    ajouterJours(paques, 1),        // lundi de Pâques
    `${an}-05-01`,                  // Fête du Travail
    `${an}-05-08`,                  // Victoire 1945
    ajouterJours(paques, 39),       // Ascension
    ajouterJours(paques, 50),       // lundi de Pentecôte
    `${an}-07-14`,                  // Fête nationale
    `${an}-08-15`,                  // Assomption
    `${an}-11-01`,                  // Toussaint
    `${an}-11-11`,                  // Armistice
    `${an}-12-25`,                  // Noël
  ]);
  _feries.set(an, s);
  return s;
};

export const estOuvre = (iso) => {
  const d = versDate(iso);
  const j = d.getDay();
  if (j === 0 || j === 6) return false;
  return !feriesDe(d.getFullYear()).has(String(iso).slice(0, 10));
};

// Le premier jour ouvré à partir de cette date, elle comprise.
// ⚠ LA BOUCLE EST BORNÉE : sans borne, une date illisible la ferait tourner
// sans fin et figerait l'écran au lieu d'afficher une erreur.
export const prochainOuvre = (iso) => {
  let d = String(iso).slice(0, 10);
  for (let i = 0; i < 30; i++) { if (estOuvre(d)) return d; d = ajouterJours(d, 1); }
  return d;
};

// Le dernier jour ouvré à cette date ou avant — pour quand on RACCOURCIT une
// formation en tirant son bord droit sur un samedi.
export const ouvrePrecedent = (iso) => {
  let d = String(iso).slice(0, 10);
  for (let i = 0; i < 30; i++) { if (estOuvre(d)) return d; d = ajouterJours(d, -1); }
  return d;
};

// ⚠ UNE FORMATION NE SE COMPTE QU'EN JOURS OU EN SEMAINES, et « mois » a quitté
// son menu : un mois de formation en jours ouvrés n'a pas de définition qui
// tienne — 20 jours ? 22 ? celle du mois courant ? Toutes se défendent, donc
// aucune ne s'impose, et un chiffre arbitraire se serait lu comme une vérité.
// Quatre semaines le disent sans ambiguïté.
export const OUVRES_PAR_SEMAINE = 5;
export const UNITES_FORMATION = ['jours', 'semaines'];
export const ouvresPour = (nombre, unite) => {
  const n = Math.max(1, parseInt(nombre, 10) || 1);
  return unite === 'semaines' ? n * OUVRES_PAR_SEMAINE : n;
};

// Le dernier jour d'une formation de `nOuvres` jours ouvrés commencée ce
// jour-là. Le début est reporté au premier jour ouvré : une formation ne
// commence pas un dimanche, et l'écran le dit avant d'enregistrer.
export const finOuvree = (debut, nOuvres) => {
  let d = prochainOuvre(debut);
  let restants = Math.max(1, nOuvres) - 1;
  // Borne : 366 jours ouvrés au plus, comme les durées calendaires.
  for (let i = 0; restants > 0 && i < 700; i++) {
    d = ajouterJours(d, 1);
    if (estOuvre(d)) restants--;
  }
  return d;
};

// ⚠ LES PLAGES DE JOURS OUVRÉS CONSÉCUTIFS entre deux dates, les deux
// comprises (11/11/2026, Élodie : « si la formation dure 4 jours du jeudi au
// mardi enlève la barre de suivi sur le week-end, ça porte à confusion »).
// Une formation du jeudi au mardi rend [[jeudi, vendredi], [lundi, mardi]] :
// le calendrier et la frise dessinent une pilule par plage au lieu d'une barre
// qui enjambe le week-end. Un chantier, lui, garde sa barre d'un seul tenant —
// on y travaille le samedi.
export const plagesOuvrees = (debut, fin) => {
  const plages = [];
  let d = String(debut).slice(0, 10);
  const stop = String(fin).slice(0, 10);
  let courante = null;
  for (let i = 0; d <= stop && i < 1100; i++) {
    if (estOuvre(d)) {
      if (courante) courante[1] = d; else { courante = [d, d]; plages.push(courante); }
    } else courante = null;
    d = ajouterJours(d, 1);
  }
  return plages;
};

// Combien de jours ouvrés entre ces deux dates, les deux comprises — la lecture
// inverse, pour quand on tire le bord d'une barre à la souris.
export const ouvresEntre = (debut, fin) => {
  let n = 0, d = String(debut).slice(0, 10);
  const stop = String(fin).slice(0, 10);
  for (let i = 0; d <= stop && i < 1100; i++) { if (estOuvre(d)) n++; d = ajouterJours(d, 1); }
  return n;
};

// La durée CALENDAIRE que `duree_jours` doit porter pour couvrir ces jours
// ouvrés — le pont entre les deux comptes.
export const joursPourFormation = (debut, nombre, unite) => {
  const d = prochainOuvre(debut);
  const f = finOuvree(d, ouvresPour(nombre, unite));
  return Math.round((versDate(f) - versDate(debut)) / 86400000) + 1;
};

// ⚠ LA DURÉE SE SAISIT EN JOURS, SEMAINES OU MOIS (10/11/2026, Élodie), et
// on garde la saisie (`duree_nombre`, `duree_unite`) pour la réafficher telle
// quelle. Le calendrier, lui, ne lit que `duree_jours`, calculé ici :
//   · une semaine = 7 jours calendaires ;
//   · un mois va jusqu'à la VEILLE du même quantième le mois suivant
//     (2 mois à partir du 15 janvier : jusqu'au 14 mars). Un mois qui n'a pas
//     ce quantième (31 → février) s'arrête au dernier jour du mois.
export const UNITES = {
  jours: { un: 'jour', plusieurs: 'jours', max: 366 },
  semaines: { un: 'semaine', plusieurs: 'semaines', max: 52 },
  mois: { un: 'mois', plusieurs: 'mois', max: 12 },
};
export function joursPour(debut, nombre, unite) {
  const n = Math.max(1, parseInt(nombre, 10) || 1);
  if (unite === 'semaines') return n * 7;
  if (unite === 'mois') {
    const d = versDate(debut);
    const cible = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const dernierDuMois = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
    // Pas de 31 en février : le chantier va jusqu'au dernier jour du mois,
    // compris (d'où le +1 : sans lui il s'arrêterait l'avant-veille).
    const rogne = d.getDate() > dernierDuMois;
    cible.setDate(Math.min(d.getDate(), dernierDuMois));
    return Math.round((cible - d) / 86400000) + (rogne ? 1 : 0);
  }
  return n;
}
// La durée telle qu'on l'a saisie ; les chantiers d'avant le 10/11 n'ont que
// des jours.
//
// ⚠ UNE FORMATION DIT « OUVRÉS » (11/11/2026). « 4 jours » et « 4 jours
// ouvrés » ne désignent pas la même fin dès qu'un week-end traverse ; écrire
// les deux pareil laisserait croire à un chantier de même durée, et au report
// d'une formation à un défaut. Les semaines n'en ont pas besoin : une semaine
// de formation, c'est cinq jours, personne n'attend sept.
export const dureeLue = (c) => {
  const formation = estFormation(c);
  const dispo = formation ? UNITES_FORMATION : Object.keys(UNITES);
  const unite = dispo.includes(c.duree_unite) ? c.duree_unite : 'jours';
  const nombre = c.duree_nombre || (unite === 'jours' ? c.duree_jours : 1) || 1;
  const mot = nombre > 1 ? UNITES[unite].plusieurs : UNITES[unite].un;
  const ouvres = formation && unite === 'jours' ? (nombre > 1 ? ' ouvrés' : ' ouvré') : '';
  return { nombre, unite, texte: `${nombre} ${mot}${ouvres}` };
};

// ⚠ UN CHANTIER PEUT ÊTRE PARTAGÉ AVEC UN MEMBRE DE L'ÉQUIPE (11/11/2026) :
// `partage_avec` porte les identifiants. La base ne renvoie à un non-direction
// QUE les chantiers partagés avec lui (policy `rgd_planning_partage_lecture`) ;
// le filtre ci-dessous dit la même chose pour le mode démo, qui n'a pas de
// serveur pour le dire.
export const estPartageAvec = (c, id = scope.user?.id) => !!id && (c.partage_avec || []).includes(id);
export const chantiersPlanifies = () => db.t('rgd_planning')
  .filter(c => scope.isDirection || estPartageAvec(c))
  .slice().sort((a, b) => String(a.date_debut).localeCompare(String(b.date_debut))
    || String(a.created_at).localeCompare(String(b.created_at)));

export const lignesDe = (id, liste) => db.t('rgd_planning_lignes')
  .filter(l => l.planning_id === id && (!liste || l.liste === liste))
  .sort((a, b) => (a.ordre - b.ordre) || String(a.created_at).localeCompare(String(b.created_at)));

// Ce qui reste à trouver : ni en stock, ni acheté.
export const resteA = (id) => lignesDe(id).filter(l => !l.deja_la && !l.achete).length;

// ------------------------------------------------------------ écritures
// ⚠ UNE LIGNE DU PLANNING EST UN CHANTIER OU UNE FORMATION (11/11/2026,
// Élodie : « rajouter des périodes de formations »). Même table, colonne
// `genre`. Une formation n'a ni dossier client ni listes ; `adresse` y porte
// l'organisme ou le lieu, `partage_avec` les participants (elle apparaît dans
// leur planning, comme un chantier partagé).
export const estFormation = (c) => c?.genre === 'formation';

const propre = (champs) => {
  const formation = champs.genre === 'formation';
  // ⚠ UNE FORMATION N'A QUE DEUX UNITÉS, et un `mois` qui arriverait quand même
  // — un ancien enregistrement, une formation changée en chantier puis
  // l'inverse — retombe sur « jours » plutôt que de lire `UNITES.mois.max`
  // pour une durée qui ne veut rien dire ici.
  const dispo = formation ? UNITES_FORMATION : Object.keys(UNITES);
  const unite = dispo.includes(champs.duree_unite) ? champs.duree_unite : 'jours';
  const nombre = Math.max(1, Math.min(UNITES[unite].max, parseInt(champs.duree_nombre, 10) || 1));
  // ⚠ LE DÉBUT D'UNE FORMATION EST REPORTÉ AU PREMIER JOUR OUVRÉ : une
  // formation ne commence pas un samedi ni un 1er mai. L'écran l'annonce avant
  // d'enregistrer, il n'y a donc pas de date changée en douce.
  const debut = formation && champs.date_debut ? prochainOuvre(champs.date_debut) : champs.date_debut;
  return {
  titre: String(champs.titre || '').trim(),
  date_debut: debut,
  duree_nombre: nombre,
  duree_unite: unite,
  duree_jours: !debut ? nombre : Math.min(366, formation
    ? joursPourFormation(debut, nombre, unite)
    : joursPour(debut, nombre, unite)),
  genre: formation ? 'formation' : 'chantier',
  fiche_id: formation ? null : champs.fiche_id || null,
  demande_id: formation ? null : champs.demande_id || null,
  adresse: String(champs.adresse || '').trim() || null,
  couleur: formation ? null : champs.couleur || null,   // une formation est toujours indigo
  notes: String(champs.notes || '').trim() || null,
  partage_avec: Array.isArray(champs.partage_avec) ? [...new Set(champs.partage_avec.filter(Boolean))] : [],
  };
};

export async function creerChantier(champs) {
  const ligne = propre(champs);
  if (!ligne.titre) throw new Error(ligne.genre === 'formation' ? 'Donnez un nom à la formation.' : 'Donnez un nom au chantier.');
  if (!ligne.date_debut) throw new Error('La date de début manque.');
  return db.insert('rgd_planning', ligne);
}

export async function majChantier(id, champs) {
  const ligne = propre(champs);
  if (!ligne.titre) throw new Error(ligne.genre === 'formation' ? 'Donnez un nom à la formation.' : 'Donnez un nom au chantier.');
  if (!ligne.date_debut) throw new Error('La date de début manque.');
  return db.update('rgd_planning', id, ligne);
}

// ⚠ CHANGER LA FIN À LA SOURIS (11/11/2026, Élodie : « modifier la date de fin
// et la durée du chantier directement sur le planning avec la souris »). On
// tire le bord droit d'une barre : le début ne bouge pas, la durée devient le
// nombre de jours entre le début et la nouvelle fin. Elle est réécrite EN
// JOURS — « 2 semaines » étiré de trois jours n'est plus un nombre de semaines,
// et l'afficher en semaines mentirait.
export async function changerFin(c, fin) {
  const jours = Math.round((versDate(fin) - versDate(c.date_debut)) / 86400000) + 1;
  if (jours < 1) throw new Error('La fin ne peut pas précéder le début.');
  // ⚠ UNE FORMATION NE PEUT PAS FINIR UN SAMEDI (11/11/2026). Lâchée sur un
  // jour non ouvré, la barre recule au dernier jour ouvré, et la durée
  // s'enregistre en jours OUVRÉS — sans quoi le geste à la souris rendrait
  // calendaire ce que la fiche compte en ouvrés, et les deux chemins
  // d'écriture ne diraient plus la même chose.
  if (estFormation(c)) {
    const f = ouvrePrecedent(fin);
    if (f < c.date_debut) throw new Error('La fin ne peut pas précéder le début.');
    const ouvres = Math.min(366, Math.max(1, ouvresEntre(c.date_debut, f)));
    const cal = Math.round((versDate(f) - versDate(c.date_debut)) / 86400000) + 1;
    return db.update('rgd_planning', c.id,
      { duree_jours: Math.min(366, cal), duree_nombre: ouvres, duree_unite: 'jours' });
  }
  const n = Math.min(366, jours);
  return db.update('rgd_planning', c.id, { duree_jours: n, duree_nombre: n, duree_unite: 'jours' });
}

// ⚠ DÉPLACER UN CHANTIER À LA SOURIS (11/11/2026, Élodie). Seul le début
// change : la durée reste celle saisie (3 semaines restent 3 semaines).
export async function deplacerChantier(c, debut) {
  if (!debut) throw new Error('La date de début manque.');
  // ⚠ DÉPLACER UNE FORMATION GARDE SES JOURS OUVRÉS, PAS SA LARGEUR
  // (11/11/2026). Quatre jours ouvrés posés un lundi tiennent quatre cases ;
  // les mêmes posés un jeudi en tiennent six. Ne changer que `date_debut`
  // aurait fait finir la barre un samedi — exactement le défaut signalé.
  // Et un lâcher sur un week-end ou un férié glisse au premier jour ouvré.
  if (!estFormation(c)) return db.update('rgd_planning', c.id, { date_debut: debut });
  const d = prochainOuvre(debut);
  const { nombre, unite } = dureeLue(c);
  return db.update('rgd_planning', c.id,
    { date_debut: d, duree_jours: Math.min(366, joursPourFormation(d, nombre, unite)) });
}

// ⚠ DÉCLARER LA FIN D'UN CHANTIER (12/11/2026, Élodie : « je ne veux plus que
// le SMS parte 5 jours après la fin du chantier sur le planning chantier. Je
// voudrais sur le planning chantier un bouton pour déclarer la fin du chantier
// et déclencher le SMS des avis google »).
//
// ⚠ ON ÉCRIT EN BASE D'ABORD, ON APPELLE LE SERVEUR ENSUITE, ET L'ORDRE EST LA
// GARANTIE : `avis_demande` posé, la demande existe. Si l'appel échoue — réseau
// coupé, fonction en cours de déploiement, clic à 22 h — la tâche de 11 h la
// trouvera demain. L'inverse (appeler puis écrire) perdrait la demande au
// premier pépin, sans que personne ne s'en aperçoive.
//
// ⚠ ET LE SERVEUR GARDE LE DERNIER MOT SUR L'ENVOI : facture impayée, SAV
// ouvert, client déjà sollicité, pas de mobile. Le bouton demande, il
// n'ordonne pas. Ce qu'il rend dit lequel de ces cas s'est présenté.
export async function declarerFin(c, { avis = false, jour = null } = {}) {
  const fin = jour || aujourdhuiIso();
  await db.update('rgd_planning', c.id, {
    fin_reelle: fin,
    avis_demande: !!avis,
    fin_declaree_par: scope.user?.id || null,
    fin_declaree_le: new Date().toISOString(),
  });
  if (!avis) return { ok: true, fin, sms: null };
  return { ok: true, fin, sms: await demanderAvis(c.id) };
}

// ⚠ ROUVRIR EXISTE PARCE QU'UN BOUTON QUI NE SE DÉFAIT PAS EST UN PIÈGE : un
// clic de trop sur la mauvaise ligne, et le chantier est « terminé » sans
// retour. Rouvrir efface le constat, PAS le journal des envois : un SMS déjà
// parti ne se rappelle pas, et le client ne sera pas sollicité deux fois.
export async function rouvrirChantier(c) {
  return db.update('rgd_planning', c.id, {
    fin_reelle: null, avis_demande: false,
    fin_declaree_par: null, fin_declaree_le: null,
  });
}

// Demande au serveur de traiter TOUT DE SUITE la demande d'avis de cette ligne.
// Rend ce qui s'est passé, pour que l'écran le dise au lieu de laisser croire
// que le SMS est parti.
async function demanderAvis(planningId) {
  if (db.demo) return { ok: false, motif: 'Mode démonstration : aucun SMS n’est envoyé.' };
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };
  try {
    const r = await fetch(
      `${CONFIG.SUPABASE_URL}/functions/v1/rgd-envois-auto`
      + `?avis_planning=${encodeURIComponent(planningId)}`,
      { method: 'POST',
        headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${jeton}` } });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, motif: rep.erreur || `Erreur ${r.status}` };
    return { ok: true, rep };
  } catch (e) {
    // ⚠ UN ÉCHEC ICI N'EST PAS UNE PERTE : la demande est déjà en base.
    return { ok: false, motif: String(e.message || e).slice(0, 160), rattrapable: true };
  }
}

// Les lignes partent avec le chantier (`on delete cascade` en base) ; en
// démo il n'y a pas de cascade, on les retire à la main.
export async function supprimerChantier(id) {
  if (db.demo) for (const l of lignesDe(id)) await db.remove('rgd_planning_lignes', l.id);
  await db.remove('rgd_planning', id);
}

const ordreSuivant = (id, liste) => lignesDe(id, liste).reduce((m, l) => Math.max(m, l.ordre || 0), 0) + 1;

export async function ajouterLigne(id, liste, libelle) {
  const texte = String(libelle || '').trim();
  if (!texte) return null;
  return db.insert('rgd_planning_lignes', {
    planning_id: id, liste, libelle: texte, ordre: ordreSuivant(id, liste),
  });
}

// Recopie le modèle dans le chantier, sans doublon de libellé : cliquer deux
// fois n'ajoute pas deux fois la même perceuse.
export async function ajouterStandard(id, liste) {
  const deja = new Set(lignesDe(id, liste).map(l => l.libelle.trim().toLowerCase()));
  let ordre = ordreSuivant(id, liste);
  let n = 0;
  for (const libelle of listesStandard()[liste]) {
    if (deja.has(libelle.trim().toLowerCase())) continue;
    await db.insert('rgd_planning_lignes', { planning_id: id, liste, libelle, ordre: ordre++ });
    n++;
  }
  return n;
}

export const majLigne = (id, patch) => db.update('rgd_planning_lignes', id, patch);
export const retirerLigne = (id) => db.remove('rgd_planning_lignes', id);
