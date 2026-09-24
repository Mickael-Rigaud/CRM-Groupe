// Vivier Experts & AMO de BTP Expertise : référentiels et scoring.
// Le module recrute l'équipe terrain (experts, AMO, mixtes). Il ne gère PAS les
// apporteurs d'affaires — ce sera un autre module, avec sa propre base.
//
// Tout ce qui est « liste de valeurs » vit ici, une seule fois : la page, le jeu de
// démo et la veille du lundi (qui écrit en base depuis l'extérieur) lisent les
// mêmes clés. Changer un libellé ne casse rien ; changer une CLÉ demande de
// mettre à jour les lignes déjà en base.
import { MISSIONS_BTP } from './schema.js';

// ---------------------------------------------------------------- Profil cible
// Expertise = violet, AMO = orange (couleurs des missions du cabinet) ; Mixte =
// les deux à la fois, rendu par un dégradé violet → orange.
export const CIBLES = {
  expertise: { label: 'Expertise', couleur: MISSIONS_BTP.expertise.couleur, clair: MISSIONS_BTP.expertise.clair, encre: MISSIONS_BTP.expertise.encre },
  amo: { label: 'AMO', couleur: MISSIONS_BTP.amo.couleur, clair: MISSIONS_BTP.amo.clair, encre: MISSIONS_BTP.amo.encre },
  mixte: { label: 'Mixte', couleur: '#B5591F', clair: 'linear-gradient(90deg,#F6EAF9,#FEF2DF)', encre: '#5C3A6B' },
};
export const badgeCible = (k) => {
  const c = CIBLES[k] || CIBLES.mixte;
  if (k === 'mixte') return `<span class="badge" style="background:${c.clair};color:${c.encre};border:1px solid #D9C3E3">Mixte</span>`;
  return `<span class="badge" style="--c:${c.couleur}">${c.label}</span>`;
};

// ---------------------------------------------------------------- Familles métiers
export const FAMILLES = {
  experts: 'Experts bâtiment',
  inspecteurs: 'Inspecteurs bâtiment',
  moe: 'MOE',
  moex: 'MOEX',
  opc: 'OPC',
  conduite: 'Conduite de travaux',
  direction: 'Direction de travaux',
  charges: "Chargés d'affaires BTP",
  economistes: 'Économistes',
  be: "Bureaux d'études",
  ingenieurs: 'Ingénieurs',
  diag: 'Diagnostiqueurs',
  archi: 'Architectes / techniciens architectes',
  artisans: 'Artisans',
  dirigeants: 'Dirigeants / anciens dirigeants BTP',
  chefs: "Chefs de chantier / chefs d'équipe",
  sav: 'SAV / sinistres',
  autres: 'Autres profils techniques',
};

// ---------------------------------------------------------------- Fonction dominante
export const FONCTIONS = {
  expertise: 'Expertise', inspection: 'Inspection', amo: 'AMO', moe: 'MOE', moex: 'MOEX', opc: 'OPC',
  conduite: 'Conduite de travaux', direction: 'Direction travaux', economie: 'Économie de la construction',
  be: "Bureau d'études", diagnostic: 'Diagnostic', artisan: 'Artisan', sav: 'SAV / sinistre', autre: 'Autre',
};
// La fonction la plus probable pour une famille : proposée au formulaire, jamais imposée.
export const FONCTION_PAR_FAMILLE = {
  experts: 'expertise', inspecteurs: 'inspection', moe: 'moe', moex: 'moex', opc: 'opc', conduite: 'conduite',
  direction: 'direction', charges: 'conduite', economistes: 'economie', be: 'be', ingenieurs: 'be', diag: 'diagnostic',
  archi: 'moe', artisans: 'artisan', dirigeants: 'artisan', chefs: 'conduite', sav: 'sav', autres: 'autre',
};

export const STATUTS_PRO = {
  independant: 'Indépendant', micro: 'Micro-entreprise', ei: 'EI', dirigeant: 'Dirigeant', societe: 'Société',
  salarie: 'Salarié', consultant: 'Consultant', inconnu: 'Inconnu', a_verifier: 'À vérifier',
};

export const DEPS = [['06', '06 · Alpes-Maritimes'], ['83', '83 · Var'], ['MC', 'Monaco'], ['autre', 'Autre']];
export const CERTS = { certain: 'Certain', probable: 'Probable', a_verifier: 'À vérifier' };
export const SOURCES = {
  linkedin: 'LinkedIn', google: 'Google', maps: 'Google Maps', site: 'Site entreprise', annuaire: 'Annuaire professionnel',
  cv: 'CV public', annonce: 'Annonce', reseau: 'Réseau / recommandation', autre: 'Autre',
};

// ---------------------------------------------------------------- Pipeline de suivi
// Ordre = le déroulé. `fin` = statuts secondaires (sortie du pipeline).
export const STATUTS = {
  detecte: { label: 'Détecté', cls: 'muted' },
  verifier: { label: 'À vérifier', cls: 'muted' },
  valide: { label: 'Validé', cls: 'info' },
  contacter: { label: 'À contacter', cls: 'info' },
  contacte: { label: 'Contacté', cls: 'warn' },
  rdv: { label: 'RDV', cls: 'warn' },
  interesse: { label: 'Intéressé', cls: 'warn' },
  qualification: { label: 'En qualification', cls: 'warn' },
  recrute: { label: 'Recruté', cls: 'ok' },
  plus_tard: { label: 'À revoir plus tard', cls: 'muted', fin: true },
  refuse: { label: 'Refusé', cls: 'bad', fin: true },
  inadapte: { label: 'Inadapté', cls: 'bad', fin: true },
  archive: { label: 'Archivé', cls: 'muted', fin: true },
};
export const PIPELINE = Object.keys(STATUTS).filter(k => !STATUTS[k].fin);
export const ORDRE_STATUT = Object.fromEntries(Object.keys(STATUTS).map((k, i) => [k, i]));
// Ce qui compte comme « contacté » : au moins un contact sortant a eu lieu.
export const CONTACTES = new Set(['contacte', 'rdv', 'interesse', 'qualification', 'recrute', 'refuse']);

export const TYPES_EVENEMENT = {
  note: 'Note', appel: 'Appel', email: 'Email', linkedin: 'Message LinkedIn', sms: 'SMS', rdv: 'RDV', autre: 'Échange', statut: 'Statut', veille: 'Veille',
};
// Ce qui vaut « contact » quand on le journalise : met à jour `dernier_contact`.
export const EVENEMENTS_CONTACT = new Set(['appel', 'email', 'linkedin', 'sms', 'rdv']);

// ---------------------------------------------------------------- Compétences
// Niveaux 0 (—) 1 (notions) 2 (maîtrise) 3 (expert). Groupées pour la fiche.
export const NIVEAUX = ['—', 'Notions', 'Maîtrise', 'Expert'];
export const COMPETENCES = [
  { groupe: 'Structure & enveloppe', items: { gros_oeuvre: 'Gros œuvre', maconnerie: 'Maçonnerie', beton: 'Béton', structure: 'Structure', fissures: 'Fissures', fondations: 'Fondations', facade: 'Façade', toiture: 'Toiture', charpente: 'Charpente', etancheite: 'Étanchéité' } },
  { groupe: 'Humidité & air', items: { humidite: 'Humidité', infiltrations: 'Infiltrations', remontees: 'Remontées capillaires', ventilation: 'Ventilation' } },
  { groupe: 'Lots techniques', items: { plomberie: 'Plomberie', sanitaire: 'Sanitaire', chauffage: 'Chauffage', climatisation: 'Climatisation', electricite: 'Électricité' } },
  { groupe: 'Second œuvre', items: { menuiseries: 'Menuiseries', isolation: 'Isolation', doublage: 'Doublage', platrerie: 'Plâtrerie', peinture: 'Peinture', revetements: 'Revêtements', carrelage: 'Carrelage', parquet: 'Parquet', second_oeuvre: 'Second œuvre (global)' } },
  { groupe: 'Analyse & économie', items: { lecture_plans: 'Lecture de plans', lecture_cctp: 'Lecture de CCTP', lecture_devis: 'Lecture de devis', analyse_devis: 'Analyse de devis', chiffrage: 'Chiffrage', metres: 'Métrés', consultation: 'Consultation entreprises' } },
  { groupe: 'Chantier & mission', items: { suivi_chantier: 'Suivi de chantier', coordination: 'Coordination', reception: 'Réception', reserves: 'Réserves', pathologies: 'Pathologies bâtiment', rapports: 'Rédaction de rapports', photo: 'Photographie technique', relation_client: 'Relation client' } },
];
export const COMPETENCE_LABELS = Object.assign({}, ...COMPETENCES.map(g => g.items));
const COMP_EXPERTISE = ['fissures', 'humidite', 'infiltrations', 'remontees', 'pathologies', 'structure', 'toiture', 'etancheite', 'rapports', 'photo', 'lecture_plans', 'reception', 'reserves'];
const COMP_AMO = ['lecture_devis', 'analyse_devis', 'chiffrage', 'metres', 'consultation', 'suivi_chantier', 'coordination', 'reception', 'reserves', 'lecture_cctp', 'lecture_plans', 'relation_client'];

export const EXPERIENCES = {
  exp_renovation: 'Rénovation', exp_neuf: 'Neuf', exp_suivi_chantier: 'Suivi de chantier', exp_reception: 'Réception',
  exp_reserves: 'Réserves', exp_sav: 'SAV', exp_litiges: 'Litiges', exp_sinistres: 'Sinistres', exp_pathologies: 'Pathologies bâtiment',
  exp_redaction: 'Rédaction', exp_relation_client: 'Relation client',
};

// ---------------------------------------------------------------- Scoring
// Neuf sous-scores, sur 100 au total (la grille validée le 24/09/2026) :
export const CRITERES = [
  { key: 'experience', label: 'Expérience bâtiment', max: 20 },
  { key: 'competences', label: 'Compétences techniques', max: 20 },
  { key: 'adeq_expertise', label: 'Adéquation Expertise', max: 15 },
  { key: 'adeq_amo', label: 'Adéquation AMO', max: 15 },
  { key: 'autonomie', label: 'Autonomie', max: 10 },
  { key: 'relation', label: 'Relation client', max: 5 },
  { key: 'redaction', label: 'Capacité rédactionnelle', max: 5 },
  { key: 'suivi', label: 'Suivi / coordination chantier', max: 5 },
  { key: 'proximite', label: 'Proximité géographique', max: 5 },
];
// Le score Expertise et le score AMO repondèrent les mêmes sous-scores (poids en %) :
// ce que pèse un critère dans une mission n'est pas ce qu'il pèse dans l'autre.
const POIDS_EXPERTISE = { experience: 20, competences: 20, adeq_expertise: 30, adeq_amo: 0, autonomie: 10, relation: 5, redaction: 10, suivi: 0, proximite: 5 };
const POIDS_AMO = { experience: 15, competences: 15, adeq_expertise: 0, adeq_amo: 35, autonomie: 10, relation: 10, redaction: 0, suivi: 10, proximite: 5 };

const borne = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const pondere = (s, poids) => Math.round(CRITERES.reduce((t, c) => t + (borne(s[c.key], c.max) / c.max) * poids[c.key], 0));

// Les trois scores à partir des neuf sous-scores.
export function calculerScores(s) {
  const global = CRITERES.reduce((t, c) => t + borne(s[c.key], c.max), 0);
  return { score_global: global, score_expertise: pondere(s, POIDS_EXPERTISE), score_amo: pondere(s, POIDS_AMO) };
}

// Le profil cible que les scores suggèrent. Reste une suggestion : la direction tranche.
export function cibleSuggeree({ score_expertise: e, score_amo: a }) {
  if (e >= 60 && a >= 60 && Math.abs(e - a) <= 15) return 'mixte';
  return e >= a ? 'expertise' : 'amo';
}

// Qualification interne (jamais affichée à la personne).
export const QUALIFS = [
  { min: 80, label: 'Profil prioritaire', cls: 'green' },
  { min: 65, label: 'Bon profil', cls: 'accent' },
  { min: 50, label: 'Profil à étudier', cls: 'amber' },
  { min: 0, label: 'Faible priorité', cls: 'muted' },
];
export const qualifDe = (score) => QUALIFS.find(q => (Number(score) || 0) >= q.min);
export const TRANCHES_SCORE = [['80', '80 à 100'], ['65', '65 à 79'], ['50', '50 à 64'], ['0', 'moins de 50']];
export const TRANCHES_EXP = [['0', 'moins de 5 ans'], ['5', '5 à 10 ans'], ['10', '10 à 20 ans'], ['20', 'plus de 20 ans']];
export const trancheExp = (n) => n == null ? null : n < 5 ? '0' : n < 10 ? '5' : n < 20 ? '10' : '20';
export const trancheScore = (n) => (n >= 80 ? '80' : n >= 65 ? '65' : n >= 50 ? '50' : '0');

// Villes du 06 par proximité de Nice/Antibes : le cœur de cible vaut 5, la
// périphérie 4, le reste du 06 et Monaco 4, le Var 3, ailleurs 1.
const COEUR_06 = ['nice', 'antibes', 'cannes', 'cagnes', 'villeneuve-loubet', 'villeneuve loubet', 'sophia', 'valbonne', 'biot', 'saint-laurent-du-var', 'saint laurent du var', 'vallauris', 'juan', 'mougins', 'le cannet', 'mandelieu'];
const normv = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function proximite(ville, dep) {
  const v = normv(ville);
  if (dep === '06') return COEUR_06.some(c => v.includes(c)) ? 5 : 4;
  if (dep === 'MC') return 4;
  if (dep === '83') return 3;
  return 1;
}

// Estimation automatique des neuf sous-scores à partir de la fiche. C'est un
// PREMIER score, celui de la veille ; il se corrige à la main après le premier
// échange (`scores_manuels` = true fige alors les valeurs saisies).
export function estimerSousScores(f) {
  const comp = f.competences || {};
  const niv = (k) => Number(comp[k]) || 0;
  const fam = f.famille || 'autres';
  const y = f.exp_years;
  const maitrisees = Object.values(comp).filter(v => Number(v) >= 2).length;

  // Expérience bâtiment /20 : l'ancienneté d'abord, la largeur du vécu ensuite.
  let experience = y == null ? 8 : y < 3 ? 4 : y < 5 ? 7 : y < 10 ? 10 : y < 20 ? 14 : 17;
  experience += (f.exp_renovation ? 1.5 : 0) + (f.exp_neuf ? 1 : 0) + (f.exp_suivi_chantier ? 0.5 : 0);
  // Compétences /20 : la somme des niveaux ; 15 compétences au niveau expert font le plein.
  const total = Object.values(comp).reduce((t, v) => t + (Number(v) || 0), 0);
  const competences = Math.min(20, (total / 45) * 20);
  // Adéquation Expertise /15 : la famille donne la base, le vécu pathologies/litiges complète.
  const baseExp = { experts: 12, inspecteurs: 11, sav: 9, be: 8, ingenieurs: 8, moex: 7, moe: 6, direction: 6, conduite: 6, diag: 6, opc: 5, archi: 5, charges: 5, dirigeants: 5, economistes: 4, chefs: 4, artisans: 3, autres: 3 }[fam] ?? 3;
  const adeq_expertise = Math.min(15, baseExp + (f.exp_pathologies ? 1.5 : 0) + (f.exp_sinistres || f.exp_litiges ? 1 : 0) + (f.exp_reception || f.exp_reserves ? 0.5 : 0)
    + Math.min(2, COMP_EXPERTISE.filter(k => niv(k) >= 2).length / 3) - (fam === 'artisans' && maitrisees < 6 ? 1 : 0));
  // Adéquation AMO /15 : piloter des travaux pour un client, lire et comparer des offres.
  const baseAmo = { moex: 12, moe: 11, opc: 11, economistes: 11, direction: 10, conduite: 9, archi: 9, charges: 8, dirigeants: 7, chefs: 6, experts: 6, inspecteurs: 5, be: 5, ingenieurs: 5, sav: 5, artisans: 4, diag: 3, autres: 3 }[fam] ?? 3;
  const adeq_amo = Math.min(15, baseAmo + (f.exp_suivi_chantier ? 1 : 0) + (f.exp_reception ? 0.5 : 0) + (f.exp_reserves ? 0.5 : 0)
    + Math.min(2, COMP_AMO.filter(k => niv(k) >= 2).length / 4) - (fam === 'artisans' && maitrisees < 6 ? 1 : 0));
  // Autonomie /10 : un indépendant sait déjà travailler seul et se vendre.
  const autonomie = { independant: 8, consultant: 8, dirigeant: 8, micro: 7, ei: 7, societe: 7, salarie: 5, inconnu: 4, a_verifier: 4 }[f.statut_pro] ?? 4;
  // Relation client /5
  const relation = Math.min(5, 2 + (f.exp_relation_client ? 2 : 0) + (['artisans', 'dirigeants', 'charges', 'moe', 'moex', 'archi'].includes(fam) ? 0.5 : 0) + (niv('relation_client') >= 2 ? 0.5 : 0));
  // Rédaction /5
  const redaction = Math.min(5, 1 + (f.exp_redaction ? 2 : 0) + (['experts', 'inspecteurs', 'be', 'ingenieurs', 'moe', 'economistes', 'sav', 'diag'].includes(fam) ? 1 : 0) + (niv('rapports') >= 2 ? 1 : 0));
  // Suivi / coordination /5
  const suivi = Math.min(5, 1 + (f.exp_suivi_chantier ? 2 : 0) + (f.exp_reception ? 1 : 0) + (niv('coordination') >= 2 || niv('suivi_chantier') >= 2 ? 1 : 0));
  const prox = proximite(f.ville, f.dep);

  const s = { experience, competences, adeq_expertise, adeq_amo, autonomie, relation, redaction, suivi, proximite: prox };
  for (const c of CRITERES) s[c.key] = borne(s[c.key], c.max);
  return s;
}

// La fiche complète, scores à jour : sous-scores estimés sauf s'ils sont manuels,
// puis les trois totaux. Ne touche pas au profil cible choisi.
export function scorer(f) {
  const scores = f.scores_manuels && f.scores && Object.keys(f.scores).length ? f.scores : estimerSousScores(f);
  return { ...f, scores, ...calculerScores(scores) };
}

// Semaine ISO courante, pour étiqueter une veille : '2026-S40'.
export function lotSemaine(d = new Date()) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-S${String(Math.ceil(((x - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
