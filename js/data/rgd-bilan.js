// Le bilan commercial de RGD Renova, exercice par exercice (05/11/2026).
//
// Élodie : « des indicateurs sur le bilan commercial de RGD Renova depuis sa
// création. Je rappelle que les bilans comptables se font du 1er octobre au
// 30 septembre », puis, le même jour, son document « Bilan commercial
// comparatif et objectifs 2026/2027 » avec : « voici les chiffres ».
//
// ⚠ LES EXERCICES CLOS SONT CEUX DU BILAN, PAS CEUX DU CRM, mais PAS pour la
// raison qui était écrite ici. Ce paragraphe affirmait : « le CRM ne porte que
// 31 des 43 devis de 2024/2025 et 468 916 € des 613 568 € facturés — la reprise
// Costructor ne remonte pas à tout l'historique ». La seconde moitié était
// FAUSSE. Le CRM porte 613 569 € de factures émises sur cet exercice, le
// chiffre du bilan à l'euro : les 144 653 € « manquants » étaient les AVOIRS,
// que le calcul du CA déduisait (corrigé le 05/11/2026, voir `rgd-objectifs.js`).
// Il ne manquait pas une donnée, on en soustrayait une.
//
// ⚠ CE QUI RESTE VRAI : le compte des DEVIS, lui, est bien incomplet — 31 sur
// 43 pour 2024/2025 — et c'est ce qui justifie encore de préférer la saisie
// d'Élodie sur un exercice clos. Ne pas reprendre l'ancienne conclusion sur le
// CA pour autant : les deux ne se comportent pas pareil.
// Élodie a tranché : pour un exercice clos, ce sont ses chiffres qui font foi.
// Ils vivent dans `rgd_reglages`, clé `bilan_exercices` (JSON indexé par
// l'année de début : { "2024": { devis_envoyes, devis_signes, montant_devis,
// ca } }), et NON dans ce fichier : le dépôt est public. Un exercice clos sans
// valeur saisie retombe sur le calcul du CRM, et l'écran le dit.
//
// ⚠ L'EXERCICE EN COURS EST CALCULÉ EN DIRECT, et le comptage est PAR DEVIS,
// comme dans le document d'Élodie (« 43 devis envoyés, 42 signés ») — choix
// fait par elle le 05/11/2026, alors que la carte des objectifs compte des
// CLIENTS (deux devis du même client = un). Les deux écrans ne mesurent donc
// pas la même chose sur la ligne des devis, et c'est voulu : le bilan se
// compare au bilan comptable, qui compte des devis.
//
// ⚠ LES FILTRES DES DEVIS SONT CEUX DE `moisObjectifs` (data/rgd-objectifs.js) :
// envoyé = date d'envoi dans l'exercice, ou, sans date d'envoi, signé dans
// l'exercice (un devis signé est forcément parti) ; côté CRM, un devis numéroté
// est parti. Le chiffre d'affaires vient de
// `moisObjectifs` lui-même, appelé sur la fenêtre de douze mois qui tombe pile
// sur l'exercice (celle qui finit en septembre).
import { db } from './db.js';
import { scope } from './scope.js';
import { moisObjectifs, objectifsMensuels } from './rgd-objectifs.js';

const mois7 = (v) => String(v || '').slice(0, 7);
const cleDuMois = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const anneeExercice = (cle) => {
  const a = Number(cle.slice(0, 4)), m = Number(cle.slice(5, 7));
  return m >= 10 ? a : a - 1;
};
const dansEx = (a) => (v) => { const c = mois7(v); return !!c && anneeExercice(c) === a; };
const sommeHt = (l) => l.reduce((t, d) => t + (Number(d.montant_ht) || 0), 0);

/** Les chiffres saisis du bilan comptable, par année de début d'exercice. */
export function bilanSaisi() {
  const brut = db.t('rgd_reglages').find(r => r.cle === 'bilan_exercices')?.valeur;
  if (!brut) return {};
  try { return typeof brut === 'string' ? JSON.parse(brut) : brut; } catch { return {}; }
}

// Un pourcentage à UNE décimale, comme le bilan d'Élodie (« 97,7 % ») : à
// l'entier, 42 sur 43 s'afficherait 98 % et ne se retrouverait pas dans son document.
const taux1 = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

// Les ratios d'une colonne, quelle qu'en soit la source.
function completer(c) {
  return {
    ...c,
    tauxSignature: c.envoyes != null && c.signes != null ? taux1(c.signes, c.envoyes) : null,
    moyenDevis: c.envoyes > 0 && c.montantDevis != null ? Math.round(c.montantDevis / c.envoyes) : null,
    panier: c.chantiers > 0 && c.montantSigne != null ? Math.round(c.montantSigne / c.chantiers) : null,
  };
}

// ⚠ UN CHANTIER N'EST PAS UN DEVIS (05/11/2026, Élodie : « il faut qu'on
// arrive à distinguer la différence entre un devis et un chantier, parce qu'un
// chantier peut avoir plusieurs devis », puis « généralement un client
// représente un chantier »). On compte donc les CLIENTS distincts qui ont signé
// dans l'exercice, avec la clé de `moisObjectifs` (contact, sinon organisation,
// sinon le devis lui-même — deux devis anonymes ne fusionnent jamais).
const cleClient = (d) => d.contact_id || d.organisation_id || d.id;

/**
 * Les chantiers signés d'un exercice et leur montant, selon le CRM.
 *
 * ⚠ POUR LES EXERCICES CLOS, C'EST UNE APPROXIMATION ASSUMÉE ET AFFICHÉE.
 * Le bilan d'Élodie ne donne ni chantiers ni montant signé ; elle n'a pas ces
 * chiffres et a choisi le 05/11/2026 « les chiffres du CRM, signalés ». Or le
 * CRM ne voit qu'une partie de l'historique : 24 devis signés en 2024/2025 contre
 * 42 au bilan, et 21 en 2025/2026 contre 17 (le bilan date sans doute autrement).
 * L'écran écrit donc « selon le CRM » sous ces deux chiffres. Un exercice saisi
 * qui porte `chantiers_signes` et `montant_signe` l'emporte sur ce calcul.
 */
function chantiersCrm(a) {
  const estDans = dansEx(a);
  const signes = [
    ...scope.rgd('rgd_devis').filter(d => estDans(d.date_signature)),
    ...scope.rgd('rgd_devis_crm').filter(d => d.genre === 'devis' && d.statut === 'signe'
      && estDans(d.date_signature || d.date_devis)),
  ];
  return { chantiers: new Set(signes.map(cleClient)).size, montantSigne: sommeHt(signes) };
}

/** Ce que le CRM sait d'un exercice, compté par devis. */
function calculCrm(a, ceMois) {
  const estDans = dansEx(a);
  const devis = scope.rgd('rgd_devis');
  const crm = scope.rgd('rgd_devis_crm').filter(d => d.genre === 'devis');
  // ⚠ UN BROUILLON N'EST JAMAIS ENVOYÉ, MÊME DATÉ (05/11/2026) : Costructor a
  // laissé D202600196, brouillon identique à D202600192 (même client, même
  // montant), avec une date d'envoi. Compté, il faisait 5 devis envoyés au lieu
  // de 4 et Élodie ne retrouvait pas le cinquième.
  const envoyes = [
    ...devis.filter(d => d.statut !== 'brouillon'
      && (estDans(d.date_envoi) || (!d.date_envoi && estDans(d.date_signature)))),
    ...crm.filter(d => d.numero && estDans(d.date_devis)),
  ];
  const signes = [
    ...devis.filter(d => estDans(d.date_signature)),
    ...crm.filter(d => d.statut === 'signe' && estDans(d.date_signature || d.date_devis)),
  ];
  const mois = moisObjectifs(new Date(a + 1, 8, 1)).filter(m => m.cle <= ceMois);
  return {
    nbMois: mois.length,
    envoyes: envoyes.length, signes: signes.length,
    montantDevis: sommeHt(envoyes),
    ca: mois.reduce((t, m) => t + (Number(m.ca) || 0), 0),
  };
}

/**
 * Les devis envoyés dans le mois en cours, et combien d'entre eux sont déjà
 * signés (05/11/2026, Élodie : « mettre les devis signés parmi les devis
 * envoyés sur le mois en cours », puis « les devis envoyés le mois en cours
 * seulement »). ⚠ « dont signés » compte les devis ENVOYÉS CE MOIS-CI qui sont
 * signés, pas les signatures du mois : un devis d'octobre signé en novembre
 * n'y entre pas. Mêmes filtres que `calculCrm` (brouillons exclus).
 */
function moisCourant(ceMois) {
  const estCeMois = (v) => mois7(v) === ceMois;
  const devis = scope.rgd('rgd_devis').filter(d => d.statut !== 'brouillon'
    && (estCeMois(d.date_envoi) || (!d.date_envoi && estCeMois(d.date_signature))));
  const crm = scope.rgd('rgd_devis_crm').filter(d => d.genre === 'devis' && d.numero && estCeMois(d.date_devis));
  const envoyes = [...devis, ...crm];
  return {
    cle: ceMois,
    envoyes: envoyes.length,
    dontSignes: devis.filter(d => d.date_signature).length + crm.filter(d => d.statut === 'signe').length,
    montant: sommeHt(envoyes),
  };
}

/** Le premier mois où le CRM a une trace commerciale. */
function premiereTrace() {
  return [
    ...scope.rgd('rgd_paiements').filter(p => p.statut !== 'annule').map(p => mois7(p.date_facturation)),
    ...scope.rgd('rgd_devis').flatMap(d => [mois7(d.date_envoi), mois7(d.date_signature)]),
  ].filter(Boolean).sort()[0] || null;
}

export function bilanCommercial(aujourdhui = new Date()) {
  const ceMois = cleDuMois(aujourdhui);
  const anneeCourante = anneeExercice(ceMois);
  const saisi = bilanSaisi();
  const annees = [
    ...Object.keys(saisi).map(Number).filter(Number.isFinite),
    ...(premiereTrace() ? [anneeExercice(premiereTrace())] : []),
  ];
  if (!annees.length) return null;
  const premiere = Math.min(...annees, anneeCourante);

  const exercices = [];
  for (let a = premiere; a <= anneeCourante; a++) {
    const enCours = a === anneeCourante;
    const s = saisi[a];
    let col;
    if (!enCours && s) {
      // ⚠ UN EXERCICE CLOS SAISI NE MONTRE QUE CE QUE LE BILAN DONNE : y mêler
      // le CRM, incomplet sur ces années, ferait des ratios entre deux sources.
      col = {
        source: 'bilan', nbMois: 12,
        envoyes: num(s.devis_envoyes), signes: num(s.devis_signes),
        montantDevis: num(s.montant_devis), ca: num(s.ca),
      };
      const crm = chantiersCrm(a);
      const saisiChantiers = num(s.chantiers_signes) != null && num(s.montant_signe) != null;
      Object.assign(col, saisiChantiers
        ? { chantiers: num(s.chantiers_signes), montantSigne: num(s.montant_signe) }
        : { ...crm, chantiersSelonCrm: true });
    } else {
      col = { source: 'crm', ...calculCrm(a, ceMois), ...chantiersCrm(a) };
    }
    exercices.push(completer({ annee: a, label: `${a}/${a + 1}`, enCours, ...col }));
  }

  // Depuis la création : on n'additionne une ligne que si TOUTES les colonnes
  // la connaissent, sans quoi le total serait celui de quelques exercices
  // présenté comme celui de tous.
  const cumul = (champ) => (exercices.every(e => e[champ] != null)
    ? exercices.reduce((t, e) => t + e[champ], 0) : null);
  const total = completer({
    envoyes: cumul('envoyes'), signes: cumul('signes'), montantDevis: cumul('montantDevis'), ca: cumul('ca'),
    chantiers: cumul('chantiers'), montantSigne: cumul('montantSigne'),
  });
  total.chantiersSelonCrm = exercices.some(e => e.chantiersSelonCrm);

  return { exercices, total, mois: moisCourant(ceMois), objectifs: objectifsExercice(), saisi: Object.keys(saisi).length > 0 };
}

/**
 * Les objectifs de l'exercice en cours, posés dans SA colonne (05/11/2026,
 * Élodie : « dans ce tableau je veux que tu mettes les objectifs de l'exercice
 * 2026-2027 dans la colonne 2026/2027 »).
 *
 * ⚠ ILS NE SONT PAS SAISIS ICI : ce sont les objectifs MENSUELS de la carte du
 * dessus (`objectifsMensuels`, réglage `objectifs_mensuels`) fois douze. Son
 * document dit la même chose : 10 devis envoyés par mois = 120 sur l'année,
 * 35 000 € = 420 000 €. Changer un objectif mensuel change donc ce chiffre.
 * ⚠ LE TAUX SE DÉDUIT (5 signés sur 10 envoyés = 50 %), il ne se saisit pas.
 * ⚠ `envoyes` n'existe pas encore dans `objectifsMensuels` au 05/11/2026 (la
 * session des objectifs l'ajoute) : d'ici là, le 10 du document d'Élodie.
 * Montant des devis et montant moyen par devis n'ont pas d'objectif dans son
 * document : ils n'en ont pas ici non plus.
 */
function objectifsExercice() {
  const o = objectifsMensuels();
  const envoyes = Number(o.envoyes) > 0 ? Number(o.envoyes) : 10;
  // ⚠ « Chantiers / devis signés : 5 par mois », dit le document : l'objectif
  // porte sur les CHANTIERS, la ligne qui compte des affaires. Le panier visé
  // (20 000 € par chantier signé) n'est pas mensuel, il se lit tel quel.
  //
  // ⚠ LE MENSUEL EST RENDU AVEC L'ANNUEL (05/11/2026, Élodie : « pour 2026/2027
  // je veux que tu mettes les objectifs mensuels et annuels »). Taux et panier
  // n'ont qu'une valeur : ils sont les mêmes au mois et à l'année.
  return {
    envoyes: envoyes * 12,
    chantiers: o.devis * 12,
    tauxSignature: taux1(o.devis, envoyes),
    panier: Number(o.panier) > 0 ? Number(o.panier) : 20000,
    ca: o.ca * 12,
    mensuel: { envoyes, chantiers: o.devis, ca: o.ca },
  };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
