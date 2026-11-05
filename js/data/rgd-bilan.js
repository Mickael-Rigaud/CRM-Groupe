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
//
// ⚠ UN DEVIS SIGNÉ COMPTE DANS L'EXERCICE DE SA SIGNATURE (05/11/2026). Élodie
// a d'abord choisi « date du devis », puis, devant D202600187 (créé le
// 10/07/2026, signé le 02/11/2026), l'a laissé en 2026/2027 : ce n'est donc PAS
// la date de création qui range un devis signé. Les exercices clos ne sont pas
// concernés — leurs devis signés viennent de ses captures Costructor
// (`bilan_details`), qui ne reprennent pas un devis signé après la clôture.
// Seul l'exercice en cours est calculé ici, et sans double compte.
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
function devisSignesCrm(a) {
  const estDans = dansEx(a);
  return [
    ...scope.rgd('rgd_devis').filter(d => estDans(d.date_signature)),
    ...scope.rgd('rgd_devis_crm').filter(d => d.genre === 'devis' && d.statut === 'signe'
      && estDans(d.date_signature || d.date_devis)),
  ];
}

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
    chantiers: chantiersDistincts(exercices.map(e => e.annee)), montantSigne: cumul('montantSigne'),
  });
  total.chantiersSelonCrm = exercices.some(e => e.chantiersSelonCrm);

  return { exercices, total, objectifs: objectifsExercice(), saisi: Object.keys(saisi).length > 0 };
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

// ---------------------------------------------------------------- Justification
// ⚠ CHAQUE CHIFFRE DU BILAN S'OUVRE SUR SA LISTE (05/11/2026, Élodie : « est-ce
// que tu peux justifier toutes les données en cliquant dessus et avoir les
// données et les informations pour que l'on comprenne bien »). `justifier`
// rend les lignes qui font le chiffre, et le chiffre se recalcule depuis elles :
// si le total de la liste diffère du chiffre affiché, la fenêtre le DIT
// (voir `note`) au lieu de le cacher.
//
// ⚠ POUR UN EXERCICE CLOS, LES DEVIS SIGNÉS VIENNENT DE `bilan_details`
// (rgd_reglages), PAS DU CRM : le CRM n'a pas tout l'historique Costructor.
// Pour 2024/2025, Élodie a fourni le 05/11/2026 ses captures Costructor des
// 41 devis acceptés ; elles sont recopiées dans ce réglage, avec une clé de
// chantier posée selon SA règle : « un client = un chantier, sauf si un client
// a deux chantiers avec deux adresses différentes » (SCI Bardock : Avesnes et
// Wignehies = deux chantiers). Ces données sont en base et NON dans ce fichier :
// le dépôt est public.

// ⚠ DANS LE CUMUL, UN CHANTIER NE COMPTE QU'UNE FOIS (05/11/2026, Élodie :
// « un chantier ne compte qu'une fois dans le cumul »). Additionner les
// exercices comptait deux fois Delong, Phanor, Betrancourt ou SCI Bardock
// (Avesnes, Wignehies), présents sur deux années. Il faut donc UNE clé de
// chantier commune à toutes les années : celle des listes saisies
// (`cle_chantier`, en majuscules, ex. « DELONG », « BARDOCK-AVESNES ») et,
// pour un devis lu dans le CRM, le NOM DE FAMILLE du contact (ou le nom de
// l'organisation), normalisé de la même façon. ⚠ Limite connue : deux
// chantiers d'un même client à deux adresses ne se distinguent que dans les
// listes saisies ; côté CRM, ils fusionnent sous le nom du client.
const normCle = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/^SCI\s+/, '').replace(/[^A-Z0-9-]+/g, ' ').trim();
const cleCrm = (d) => {
  const c = d.contact_id && db.byId('contacts', d.contact_id);
  if (c?.last_name) return normCle(c.last_name);
  const o = d.organisation_id && db.byId('organisations', d.organisation_id);
  if (o?.name) return normCle(o.name);
  return `ID:${d.id}`;
};

/** Les clés de chantier signées d'un exercice : liste saisie si elle existe, sinon le CRM. */
function clesChantier(an) {
  const d = bilanDetails()[an]?.signes;
  if (d?.length && bilanSaisi()[an]) return d.map(x => normCle(x.cle_chantier || x.client));
  return devisSignesCrm(an).map(cleCrm);
}

function chantiersDistincts(annees) {
  return new Set(annees.flatMap(clesChantier)).size;
}

/** Les listes de devis saisies à la main, par année de début d'exercice. */
export function bilanDetails() {
  const brut = db.t('rgd_reglages').find(r => r.cle === 'bilan_details')?.valeur;
  if (!brut) return {};
  try { return typeof brut === 'string' ? JSON.parse(brut) : brut; } catch { return {}; }
}

const nomDe = (r) => {
  const c = r.contact_id && db.byId('contacts', r.contact_id);
  // ⚠ Un contact porte first_name / last_name (pas prenom / nom, qui sont les
  // champs du FORMULAIRE de fiche) : avec les mauvais, toute la colonne valait « — ».
  if (c) return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
  const o = r.organisation_id && db.byId('organisations', r.organisation_id);
  return o?.name || o?.raison_sociale || '—';
};
// ⚠ LE CHANTIER SE CHERCHE PAR LE CLIENT DU DEVIS, PUIS PAR L'AFFAIRE
// (05/11/2026). Par l'affaire seule, D202600193 (Herlin, Monchy) affichait
// l'adresse de Prié à Gouvieux : la synchronisation l'a rattaché à l'affaire de
// Prié, alors que la fiche chantier d'Herlin existe, à son nom. Et D202600195
// (Mace, Pontarmé) n'a aucune affaire. On prend donc le chantier du même client
// — celui de la même affaire s'il y en a plusieurs — et l'affaire seulement
// quand le devis n'a pas de client (une facture, par exemple).
const chantierDe = (r) => {
  const tous = db.t('rgd_chantiers');
  const duClient = r.contact_id ? tous.filter(x => x.contact_id === r.contact_id)
    : r.organisation_id ? tous.filter(x => x.organisation_id === r.organisation_id) : [];
  const c = duClient.find(x => x.deal_id === r.deal_id) || duClient[0]
    || (r.deal_id && tous.find(x => x.deal_id === r.deal_id
      && (!r.contact_id || !x.contact_id || x.contact_id === r.contact_id)));
  if (c) return [c.adresse, c.ville].filter(Boolean).join(', ');
  return (r.deal_id && db.byId('deals', r.deal_id)?.title) || r.objet || '';
};
const ligneDevis = (d, date) => ({
  numero: d.numero || '—', client: nomDe(d), chantier: chantierDe(d), date,
  montant: Number(d.montant_ht) || 0, cle: cleClient(d), cleCumul: cleCrm(d),
});

/** Les devis envoyés et signés d'un exercice, tels que le CRM les voit. */
function listesCrm(a) {
  const estDans = dansEx(a);
  const devis = scope.rgd('rgd_devis');
  const crm = scope.rgd('rgd_devis_crm').filter(d => d.genre === 'devis');
  return {
    envoyes: [
      ...devis.filter(d => d.statut !== 'brouillon'
        && (estDans(d.date_envoi) || (!d.date_envoi && estDans(d.date_signature))))
        .map(d => ligneDevis(d, d.date_envoi || d.date_signature)),
      ...crm.filter(d => d.numero && estDans(d.date_devis)).map(d => ligneDevis(d, d.date_devis)),
    ],
    signes: [
      ...devis.filter(d => estDans(d.date_signature)).map(d => ligneDevis(d, d.date_signature)),
      ...crm.filter(d => d.statut === 'signe' && estDans(d.date_signature || d.date_devis))
        .map(d => ligneDevis(d, d.date_signature || d.date_devis)),
    ],
  };
}

/** Les factures d'un exercice : celles que compte le CA (ni annulées, ni avoirs). */
function facturesCrm(a) {
  const estDans = dansEx(a);
  return scope.rgd('rgd_paiements')
    .filter(p => p.statut !== 'annule' && p.type !== 'remboursement' && estDans(p.date_facturation))
    .map(p => {
      const deal = p.deal_id && db.byId('deals', p.deal_id);
      return {
        numero: p.reference_facture || p.libelle || '—',
        client: deal ? nomDe(deal) : '—', chantier: chantierDe(p),
        date: p.date_facturation, montant: Number(p.montant_ht) || 0,
      };
    });
}

// Les devis regroupés par chantier, pour les lignes « Chantiers » et « Panier ».
function parChantier(lignes) {
  const g = new Map();
  for (const l of lignes) {
    const x = g.get(l.cle) || { client: l.client, chantier: l.chantier, devis: [], montant: 0 };
    x.devis.push(l.numero); x.montant += l.montant;
    if (!x.chantier && l.chantier) x.chantier = l.chantier;
    g.set(l.cle, x);
  }
  return [...g.values()].sort((p, q) => q.montant - p.montant);
}

const parDate = (l) => [...l].sort((p, q) => String(q.date).localeCompare(String(p.date)));

/**
 * Ce qui fait un chiffre du bilan : `{ titre, source, lignes | groupes, total,
 * note }`. `mesure` vaut envoyes, signes, chantiers, panier ou ca ; `a` est
 * l'année de début d'exercice, ou 'total' pour « Depuis la création ».
 */
export function justifier(a, mesure, aujourdhui = new Date()) {
  const b = bilanCommercial(aujourdhui);
  if (!b) return null;
  const annees = a === 'total' ? b.exercices.map(e => e.annee) : [Number(a)];
  const colonne = a === 'total' ? b.total : b.exercices.find(e => e.annee === Number(a));
  if (!colonne) return null;
  const details = bilanDetails();
  const saisi = bilanSaisi();
  const notes = [];
  let lignes = [];
  let sourceListe = 'le CRM';

  const signesDe = (an) => {
    const d = details[an]?.signes;
    if (d?.length && saisi[an]) {
      return d.map(x => ({ numero: x.numero, client: x.client, chantier: x.chantier, date: x.date,
        montant: Number(x.montant_ht) || 0, cle: normCle(x.cle_chantier || x.client) }));
    }
    return listesCrm(an).signes.map(l => ({ ...l, cle: l.cleCumul }));
  };

  if (mesure === 'envoyes') {
    for (const an of annees) {
      if (saisi[an] && !details[an]?.envoyes) {
        // 2023/2024 n'a pas de nombre de devis envoyés (Élodie n'a que les devis
        // signés et facturés de cette année-là) : le dire, sans « — devis ».
        notes.push(saisi[an].devis_envoyes == null
          ? `${an}/${an + 1} : nombre de devis envoyés inconnu (seuls les devis signés et facturés ont été relevés).`
          : `${an}/${an + 1} : ${saisi[an].devis_envoyes} devis envoyés selon le bilan comptable, `
            + 'dont la liste n’a pas été relevée. Ceux que le CRM connaît sont listés ici.');
      }
      lignes.push(...listesCrm(an).envoyes);
    }
  } else if (mesure === 'ca') {
    for (const an of annees) {
      // Une liste de factures saisie (2023/2024 : le récapitulatif Excel d'Élodie,
      // que le CRM n'a pas) l'emporte sur les factures du CRM.
      const saisies = details[an]?.factures;
      if (saisies?.length) {
        lignes.push(...saisies.map(f => ({ numero: f.numero, client: f.client, chantier: f.devis || '',
          date: f.date, montant: Number(f.montant_ht) || 0 })));
        if (saisi[an]?.ca != null && Math.round(saisi[an].ca) !== Math.round(saisies.reduce((t, f) => t + (Number(f.montant_ht) || 0), 0))) {
          notes.push(`${an}/${an + 1} : ${eurTexte(saisi[an].ca)} retenus ; les factures listées totalisent un autre montant.`);
        }
        continue;
      }
      if (saisi[an]?.ca != null) {
        notes.push(`${an}/${an + 1} : ${eurTexte(saisi[an].ca)} selon le bilan comptable ; `
          + 'les factures ci-dessous sont celles du CRM (avoirs et annulées exclus).');
      }
      lignes.push(...facturesCrm(an));
    }
    const avecListe = annees.filter(an => details[an]?.factures?.length);
    sourceListe = avecListe.length === annees.length ? (details[avecListe[0]].source_factures || 'ta saisie')
      : avecListe.length ? 'ta saisie et les factures du CRM' : 'les factures du CRM';
  } else {
    for (const an of annees) {
      lignes.push(...signesDe(an));
      if (details[an]?.signes?.length && saisi[an]) sourceListe = details[an].source || 'ta saisie';
    }
  }

  const total = lignes.reduce((t, l) => t + l.montant, 0);
  const titres = { envoyes: 'Devis envoyés', signes: 'Devis signés', montantSigne: 'Montant des devis signés HT', chantiers: 'Chantiers', panier: 'Panier moyen par chantier', ca: 'CA facturé HT' };
  const res = { titre: titres[mesure], periode: a === 'total' ? 'Depuis la création' : colonne.label,
    source: sourceListe, total, nb: lignes.length, valeur: colonne[mesure === 'ca' ? 'ca' : mesure] };

  if (mesure === 'chantiers' || mesure === 'panier') {
    res.groupes = parChantier(lignes);
    res.nb = res.groupes.length;
    // ⚠ LE PANIER SE CALCULE SUR LE MONTANT SIGNÉ DE LA COLONNE, pas sur le
    // total de la liste : pour 2024/2025, Élodie a fixé ce montant à 613 568 €
    // (« change 593 244 € par 613 568 € »), alors que les 41 devis de ses
    // captures font 593 244,08 €. La fenêtre donne les deux, sans les confondre.
    if (mesure === 'panier' && res.nb) {
      const montant = colonne.montantSigne ?? total;
      const n = colonne.chantiers ?? res.nb;
      res.calcul = `${eurTexte(montant)} ÷ ${n} chantier${n > 1 ? 's' : ''} = ${eurTexte(montant / n)}`;
      if (Math.round(montant) !== Math.round(total)) {
        notes.push(`Le montant retenu pour le panier est ${eurTexte(montant)} ; les devis listés ci-dessous totalisent ${eurTexte(total)}.`);
      }
    }
    if (mesure === 'chantiers' && colonne.chantiers != null && colonne.chantiers !== res.nb) {
      notes.push(`La liste compte ${res.nb} chantier${res.nb > 1 ? 's' : ''}, le chiffre affiché ${colonne.chantiers}.`);
    }
  } else {
    res.lignes = parDate(lignes);
    const attendu = mesure === 'ca' ? colonne.ca : colonne[mesure];
    const dejaDit = mesure === 'envoyes' && annees.some(an => saisi[an] && !details[an]?.envoyes);
    // Pour un MONTANT, on compare le total de la liste au montant affiché (en
    // 2024/2025, Élodie a retenu 613 568 € quand ses captures font 593 244 €).
    if (mesure === 'montantSigne') {
      if (attendu != null && Math.round(attendu) !== Math.round(total)) {
        notes.push(`Le montant affiché est ${eurTexte(attendu)} ; les devis listés ci-dessous totalisent ${eurTexte(total)}.`);
      }
    } else if (mesure !== 'ca' && !dejaDit && attendu != null && attendu !== res.nb) {
      notes.push(`La liste compte ${res.nb} devis, le chiffre affiché ${attendu}`
        + (mesure === 'envoyes' ? ' (celui du bilan comptable).' : '.'));
    }
  }
  res.note = notes;
  return res;
}

const eurTexte = (v) => `${Math.round(Number(v) || 0).toLocaleString('fr-FR')} €`;
