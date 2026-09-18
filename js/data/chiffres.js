// Chiffres de pilotage — la seule source de vérité pour les indicateurs du groupe.
// Le tableau de bord (#/home) et la vue d'ensemble (#/dashboard) lisent ici : deux
// écrans qui affichent « le CA de septembre » doivent afficher le même nombre.
//
// Règle qui gouverne tout ce fichier : un chiffre a une source et une seule.
// Quand l'outil qui pilote réellement une structure dépose ses chiffres dans
// structure_stats (aujourd'hui le tableau de bord RGD Renova), ils priment sur
// le calcul interne — sinon on additionnerait deux comptages du même réel.
import { db } from './db.js';
import { scope } from './scope.js';
import { ACTIVITIES, ACTIVITY_KEYS, reachedRdv, stageIndex, stageOf } from './schema.js';
import { inRange, isoDay } from '../ui.js';

// ---------- Mois ----------
export const moisCle = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const moisLabel = (cle) => new Date(cle + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
export function derniersMois(n = 12, fin = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(fin.getFullYear(), fin.getMonth() - i, 1);
    out.push({ cle: moisCle(d), label: moisLabel(moisCle(d)) });
  }
  return out;
}
// Le mois qui précède celui de la période, pour les comparaisons « vs mois dernier »
export const moisPrecedent = (cle) => {
  const [a, m] = cle.split('-').map(Number);
  return moisCle(new Date(a, m - 2, 1));
};

// ---------- Chiffres déposés par un outil externe ----------
export const externe = (k) => db.t('structure_stats').find(x => x.activity === k) || null;
const aDesMoisExternes = (k) => { const e = externe(k); return !!(e && (e.revenue || []).length); };

// ---------- Leads ----------
// Un lead, c'est un prospect de la base de la structure : exactement ce que compte
// l'onglet « Prospects » de son espace. Volontairement hors période : sinon le
// tableau de bord et la base afficheraient deux nombres différents.
export function leads(k) {
  const e = externe(k);
  if (e && e.prospects != null) return e.prospects;
  return scope.contacts().filter(c => (c.activities || []).includes(k) && c.type === 'Prospect').length;
}
// Les leads d'un mois donné. L'outil externe peut les fournir mois par mois, en
// posant « leads » à côté du montant dans revenue ; sinon on compte les affaires
// créées dans le CRM, seul repère daté dont on dispose pour tout le monde.
// Les leads d'un mois viennent du compteur à plat, ou de la cohorte de ce mois :
// dans les deux cas ce sont les prospects arrivés ce mois-là, donc le même nombre.
const leadsDuMois = (m) => (m.leads != null ? m.leads : m.funnel?.leads);
export function leadsMois(k, cle, deals) {
  const e = externe(k);
  const ligne = e && (e.revenue || []).find(v => v.month === cle);
  const v = ligne && leadsDuMois(ligne);
  if (v != null) return Number(v) || 0;
  if (aDesLeadsExternes(k)) return 0;
  return deals.filter(d => d.activity === k && (d.created_at || '').slice(0, 7) === cle).length;
}
const aDesLeadsExternes = (k) => {
  const e = externe(k);
  return !!(e && (e.revenue || []).some(m => leadsDuMois(m) != null));
};
// Les leads entrés sur une période. Même règle : l'outil externe fait foi dès
// qu'il ventile ses leads par mois.
export function leadsPeriode(k, r, deals) {
  const e = externe(k);
  if (aDesLeadsExternes(k)) {
    return (e.revenue || []).filter(m => inRange(m.month + '-01', r))
      .reduce((s, m) => s + (Number(leadsDuMois(m)) || 0), 0);
  }
  return deals.filter(d => d.activity === k && inRange(d.created_at, r)).length;
}
// Une structure pilotée ailleurs qui n'envoie qu'un total de prospects : on sait
// combien elle en a, pas quand ils sont arrivés. À signaler plutôt qu'à ventiler
// au hasard — ou à afficher comme un zéro, ce qui serait faux.
export const leadsNonDates = (k) => {
  const e = externe(k);
  return !!(e && e.prospects != null && !aDesLeadsExternes(k));
};

// ---------- RDV et signatures ----------
const rdvDuMois = (m) => (m.rdv != null ? m.rdv : m.funnel?.rdv);
const aDesRdvExternes = (k) => {
  const e = externe(k);
  return !!(e && (e.revenue || []).some(m => rdvDuMois(m) != null));
};
export function rdvPeriode(k, r, deals) {
  const e = externe(k);
  if (aDesRdvExternes(k)) {
    return (e.revenue || []).filter(m => inRange(m.month + '-01', r))
      .reduce((s, m) => s + (Number(rdvDuMois(m)) || 0), 0);
  }
  return deals.filter(d =>
    d.activity === k && reachedRdv(d)
    && inRange((d.stage_history || []).find(h => h.stage === ACTIVITIES[k].rdvStage)?.at || d.won_at || d.created_at, r)).length;
}
export const signees = (k, r, deals) => deals.filter(d => d.activity === k && d.status === 'won' && inRange(d.won_at, r));

// ---------- Chiffre d'affaires ----------
// CA d'une structure sur un mois donné. L'outil externe fait foi dès qu'il a
// déposé des mois — y compris quand il annonce zéro.
export function caMois(k, cle, deals) {
  const e = externe(k);
  const ligne = e && (e.revenue || []).find(v => v.month === cle);
  if (ligne) return Number(ligne.amount) || 0;
  if (aDesMoisExternes(k)) return 0;
  return deals.filter(d => d.activity === k && d.status === 'won' && (d.won_at || '').slice(0, 7) === cle)
    .reduce((s, d) => s + (Number(d.amount) || 0), 0);
}
// CA sur une période quelconque, et nombre d'affaires derrière ce CA.
// Le compte reste null quand le CA vient de l'extérieur sans le nombre d'affaires :
// diviser un CA externe par un compte interne donnerait un panier moyen faux.
export function ca(k, r, deals) {
  const e = externe(k);
  if (aDesMoisExternes(k)) {
    const mois = (e.revenue || []).filter(m => inRange(m.month + '-01', r));
    const nb = mois.some(m => m.deals != null) ? mois.reduce((s, m) => s + (Number(m.deals) || 0), 0) : null;
    return { montant: mois.reduce((s, m) => s + (Number(m.amount) || 0), 0), nb, source: e.source || 'son outil', maj: e.updated_at };
  }
  const won = signees(k, r, deals);
  return { montant: won.reduce((s, d) => s + (Number(d.amount) || 0), 0), nb: won.length, source: null, maj: null };
}

// ---------- Tableau de bord d'une structure ----------
export function chiffres(k, r, deals = scope.deals()) {
  const c = ca(k, r, deals);
  const nbRdv = rdvPeriode(k, r, deals);
  const nbLeads = leadsPeriode(k, r, deals);
  return {
    cle: k,
    leads: leads(k), leadsPeriode: nbLeads,
    rdv: nbRdv, signees: c.nb, ca: c.montant,
    panier: c.nb ? c.montant / c.nb : null,
    tauxRdv: nbLeads ? nbRdv / nbLeads : null,
    tauxVente: nbRdv && c.nb !== null ? c.nb / nbRdv : null,
    leadsNonDates: leadsNonDates(k),
    source: c.source, maj: c.maj,
  };
}
// Total du groupe : on additionne, sans jamais additionner un ratio.
export function total(cles, r, deals = scope.deals()) {
  const l = cles.map(k => chiffres(k, r, deals));
  const nb = l.every(x => x.signees !== null) ? l.reduce((s, x) => s + x.signees, 0) : null;
  const somme = (f) => l.reduce((s, x) => s + (f(x) || 0), 0);
  const leadsP = somme(x => x.leadsPeriode), rdv = somme(x => x.rdv), montant = somme(x => x.ca);
  return {
    lignes: l, leads: somme(x => x.leads), leadsPeriode: leadsP, rdv, signees: nb, ca: montant,
    // Vrai dès qu'une structure ne sait donner qu'un total de prospects : le
    // compte « sur la période » est alors incomplet, il faut le dire.
    leadsNonDates: l.some(x => x.leadsNonDates),
    panier: nb ? montant / nb : null,
    tauxRdv: leadsP ? rdv / leadsP : null,
    tauxVente: rdv && nb !== null ? nb / rdv : null,
  };
}

// ---------- Entonnoir ----------
// Cinq jalons communs aux quatre pipelines, dont chacun garde ses propres étapes.
// L'ordre est garanti décroissant : atteindre une proposition suppose d'avoir
// dépassé le RDV, qui suppose d'avoir quitté « nouveau lead ».
const pMax = (d) => Math.max(
  stageOf(d.activity, d.stage)?.p || 0,
  ...(d.stage_history || []).map(h => stageOf(d.activity, h.stage)?.p || 0));
const iMax = (d) => Math.max(
  stageIndex(d.activity, d.stage),
  ...(d.stage_history || []).map(h => stageIndex(d.activity, h.stage)));

// ---------- Entonnoir ----------
// Deux façons dont un outil externe peut décrire son parcours, et elles ne se
// mélangent pas :
//
//  1. `funnel` — LA COHORTE : parmi les prospects ARRIVÉS ce mois-là, combien ont
//     atteint chaque statut depuis. { leads, rdv, quotes, signed }. C'est le vrai
//     entonnoir : décroissant par construction, ses taux ont un sens.
//  2. les compteurs à plat `rdv` / `quotes` / `deals` — DES FLUX : ce qui s'est
//     passé pendant le mois, quelle que soit la date d'arrivée du prospect. Utile,
//     mais un prospect de juin qui signe en août fait remonter l'étape d'août.
//
// `funnel` prime quand il est là. `deals` reste le nombre d'affaires signées dans
// le mois : c'est lui qui donne le panier moyen, il ne doit pas devenir un jalon
// de cohorte.
const JALONS = [
  { champ: 'leads', nom: 'Leads reçus', flux: 'leads' },
  { champ: 'contacted', nom: 'Contactés', flux: 'contacted' },
  { champ: 'rdv', nom: 'RDV réalisés', flux: 'rdv' },
  { champ: 'quotes', nom: 'Devis / propositions', flux: 'quotes' },
  { champ: 'signed', nom: 'Signés', flux: 'deals' },
];
const aUneCohorte = (k) => {
  const e = externe(k);
  return !!(e && (e.revenue || []).some(m => m.funnel && typeof m.funnel === 'object'));
};
const fournit = (k, j) => {
  const e = externe(k);
  if (!e) return false;
  const lignes = e.revenue || [];
  return aUneCohorte(k)
    ? lignes.some(m => m.funnel && m.funnel[j.champ] != null)
    : lignes.some(m => m[j.flux] != null);
};
const aUnEntonnoirExterne = (k) => aUneCohorte(k) || JALONS.some(j => j.flux !== 'deals' && fournit(k, j));

// Entonnoir d'une structure, jalon par jalon. `null` veut dire « cet outil ne
// sait pas compter cette étape » — à ne pas confondre avec zéro.
function entonnoirDe(k, r, deals) {
  if (aUnEntonnoirExterne(k)) {
    const mois = (externe(k).revenue || []).filter(m => inRange(m.month + '-01', r));
    const cohorte = aUneCohorte(k);
    return JALONS.map(j => fournit(k, j)
      ? mois.reduce((s, m) => s + (Number(cohorte ? m.funnel?.[j.champ] : m[j.flux]) || 0), 0)
      : null);
  }
  const lot = deals.filter(d => d.activity === k && inRange(d.created_at, r));
  const gagne = d => d.status === 'won';
  return [
    lot.length,
    lot.filter(d => gagne(d) || iMax(d) >= 1).length,
    lot.filter(d => reachedRdv(d)).length,
    lot.filter(d => gagne(d) || pMax(d) >= 55).length,
    lot.filter(gagne).length,
  ];
}

// L'entonnoir du groupe. Un jalon qu'aucune structure ne sait compter n'apparaît
// pas : mieux vaut quatre étapes justes que cinq dont une est fausse.
export function entonnoir(cles, r, deals = scope.deals()) {
  const lignes = cles.map(k => entonnoirDe(k, r, deals));
  return JALONS.map((j, i) => {
    const connus = lignes.map(l => l[i]).filter(v => v !== null);
    return { nom: j.nom, champ: j.champ, n: connus.length ? connus.reduce((a, b) => a + b, 0) : null,
             partiel: connus.length > 0 && connus.length < lignes.length };
    // Un jalon que seule une partie des structures sait compter, et qui vaut zéro,
    // n'apprend rien et casse la lecture de l'entonnoir : on le retire aussi.
  }).filter(j => j.n !== null && !(j.partiel && j.n === 0));
}
// Vrai quand l'entonnoir suit des cohortes : ses étapes décroissent alors
// naturellement, et l'avertissement sur les périodes n'a pas lieu d'être.
export const entonnoirParCohorte = (cles) => cles.some(aUneCohorte);
// Les structures dont l'outil ne raconte pas le parcours : leur pipeline reste
// invisible ici, et il vaut mieux l'écrire que laisser croire à un entonnoir vide.
export const structuresHorsEntonnoir = (cles) =>
  cles.filter(k => externe(k) && !aUnEntonnoirExterne(k));

// ---------- Objectifs de chiffre d'affaires ----------
// Stockés dans « settings » (clé objectifs_ca), lisible par tous, modifiable par la
// direction — les policies existent déjà, aucune table à créer. Format :
// { "periode": "annuel", "rgd": 480000, …, "mois": { "2026-09": { "rgd": 52000 } } }
// Le montant par structure est l'objectif de CA HT sur l'année ; toute période plus
// courte en prend sa part. « mois » permet de forcer un mois précis, en euros, sans
// toucher à l'objectif annuel — utile pour un mois creux ou une grosse affaire.
export const OBJECTIFS_CLE = 'objectifs_ca';
export function objectifs() {
  const v = db.setting(OBJECTIFS_CLE);
  if (!v) return { base: {}, mois: {}, annuel: true };
  try {
    const o = (typeof v === 'string' ? JSON.parse(v) : v) || {};
    // Les objectifs ont d'abord été saisis au mois, sans marqueur. Un enregistrement
    // n'est annuel que s'il le dit : sans quoi un objectif mensuel saisi avant ce
    // changement serait relu comme annuel, donc divisé par douze.
    const annuel = o.periode === 'annuel';
    return { base: o, mois: o.mois || {}, annuel };
  } catch { return { base: {}, mois: {}, annuel: true }; }
}
// Objectif annuel d'une structure, quelle que soit la façon dont il a été saisi.
export function objectifAnnuel(k) {
  const { base, annuel } = objectifs();
  const v = Number(base[k]) || 0;
  return annuel ? v : v * 12;
}
const AN = 365 * 24 * 3600 * 1000;
// Objectif d'une période : l'objectif annuel au prorata de sa durée. Un mois vaut
// un douzième, un trimestre un quart. Au-delà de dix-huit mois (la période « Tout »),
// un objectif n'a plus de sens : on n'en affiche pas plutôt que d'en inventer un.
export function objectif(k, r) {
  const duree = r.end - r.start;
  if (duree > 1.5 * AN) return 0;
  const { mois } = objectifs();
  const socle = objectifAnnuel(k);
  // Mois, trimestre, année : la période couvre des mois entiers, chacun vaut un
  // douzième de l'année. Pas de prorata par jours — un objectif annuel de 480 000 €
  // vaut 40 000 € en février comme en juillet.
  if (r.start.getDate() === 1 && r.end.getDate() === 1) {
    let cumul = 0, n = 0;
    const d = new Date(r.start);
    while (d < r.end && n < 24) {
      const sur = mois?.[moisCle(d)]?.[k];       // un mois forcé à la main garde la priorité
      cumul += sur != null ? Number(sur) || 0 : socle / 12;
      n++; d.setMonth(d.getMonth() + 1);
    }
    return cumul;
  }
  // Journée ou semaine : là, le prorata sur l'année est le seul repère honnête.
  return socle * (duree / AN);
}

// L'année civile en cours, pour rappeler l'avancement annuel sur tous les écrans
export const anneeEnCours = () => {
  const a = new Date().getFullYear();
  return { start: new Date(a, 0, 1), end: new Date(a + 1, 0, 1), annee: a };
};
export async function enregistrerObjectifs(valeurs) {
  const { mois } = objectifs();
  const o = { ...valeurs, periode: 'annuel', mois };
  const existe = db.t('settings').some(s => s.key === OBJECTIFS_CLE);
  const payload = JSON.stringify(o);
  if (existe) await db.update('settings', OBJECTIFS_CLE, { value: payload });
  else await db.insert('settings', { key: OBJECTIFS_CLE, value: payload });
}
// Part de la période déjà écoulée : sert à dire « en avance » ou « en retard »
// plutôt que d'afficher un pourcentage brut qui ne veut rien dire le 3 du mois.
export function ecoule(r) {
  const now = Date.now(), a = r.start.getTime(), b = r.end.getTime();
  if (now <= a) return 0;
  if (now >= b) return 1;
  return (now - a) / (b - a);
}

export const CLES_VISIBLES = () => ACTIVITY_KEYS.filter(k => scope.activityKeys.includes(k));
export { ACTIVITIES, ACTIVITY_KEYS, isoDay };
