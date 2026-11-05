// Le bilan commercial de RGD Renova, exercice par exercice (05/11/2026).
//
// Élodie : « des indicateurs sur le bilan commercial de RGD Renova depuis sa
// création. Je rappelle que les bilans comptables se font du 1er octobre au
// 30 septembre », puis, le même jour, son document « Bilan commercial
// comparatif et objectifs 2026/2027 » avec : « voici les chiffres ».
//
// ⚠ LES EXERCICES CLOS SONT CEUX DU BILAN, PAS CEUX DU CRM. Recoupé le
// 05/11/2026 : le CRM ne porte que 31 des 43 devis de 2024/2025 et 468 916 € des
// 613 568 € facturés — la reprise Costructor ne remonte pas à tout l'historique.
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
import { moisObjectifs } from './rgd-objectifs.js';

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
  };
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
    } else {
      col = { source: 'crm', ...calculCrm(a, ceMois) };
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
  });

  return { exercices, total, saisi: Object.keys(saisi).length > 0 };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
