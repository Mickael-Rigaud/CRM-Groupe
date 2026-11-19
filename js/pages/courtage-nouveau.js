// « + Prospect » de La Référence Courtage : la saisie d'une demande, pas à pas.
//
// ⚠ DEUX MODÈLES, ET AUCUN N'EST RECOPIÉ (17/11/2026, Élodie : « pour le
// formulaire + Prospect, inspire-toi de la base de données de RGD Renova avec
// les différentes étapes, et du nouveau simulateur de lareferencecourtage.fr ») :
//  - de RGD (`rgd-projet.js`), le déroulé en étapes numérotées, plusieurs
//    questions par écran pour aller vite, et « Créer » possible à toute étape ;
//  - du simulateur, l'habit : les étapes en colonne à gauche, une grande carte,
//    la rubrique en pastille, la question en Fraunces, des tuiles à pictogramme
//    orange.
// Les questions sont celles d'un courtier qui décroche son téléphone, pas les
// vingt et un écrans du simulateur : ce qui qualifie un dossier, sans plus.
//
// ⚠ PAS D'AGENDA GOOGLE POUR LE COURTAGE (vérifié le 17/11 : ni
// `courtage_calendar_id` dans settings, ni agenda personnel « courtage »). Le
// rendez-vous est donc une ACTION du CRM datée et rattachée au dossier : elle
// sonne dans les échéances et s'affiche dans « À faire ». Le jour où un agenda
// sera raccordé, `creer-evenement` sait déjà viser `activite: 'courtage'`.
//
// Ce qui naît : un contact « Prospect » rattaché au courtage (ou le contact
// existant s'il a le même e-mail ou le même téléphone), une affaire « Nouveau
// lead », et l'action de premier contact si on en a choisi une.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, eur, openModal, closeModal, toast, contactName } from '../ui.js';

const KEY = 'courtage';

// Pictogrammes au trait, dans l'esprit de ceux du simulateur.
const I = {
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  couches: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  bouclier: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  mallette: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>',
  cible: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  poignee: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2 2 0 0 0-2.8 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a4 4 0 0 1 4.7-.6l.4.2a3 3 0 0 0 2 .3L21 6"/><path d="m3 6 2.6.6a3 3 0 0 0 2-.3"/><path d="M3 13l6 6a1.4 1.4 0 0 0 2-2"/>',
  coeur: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  telephone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  visio: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  agence: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
  rappel: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
  rien: '<path d="M6 12h12"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

const FINANCEMENTS = [
  ['Crédit immobilier', 'maison', 'Achat, construction, rachat'],
  ['Regroupement de crédits', 'couches', 'Une seule mensualité'],
  ['Assurance emprunteur', 'bouclier', 'Changer ou souscrire'],
  // ⚠ « Crédit professionnel » est la valeur du schéma (filtres, listes) ; le
  // site dit « Financement professionnel » — on affiche le second, on garde le premier.
  ['Crédit professionnel', 'mallette', 'Création, reprise, matériel', 'Financement professionnel'],
];
const OBJECTIFS = () => ACTIVITIES[KEY].fields.find(f => f.key === 'objectif')?.options || [];
// ⚠ CES LIBELLÉS SONT CEUX QUI ARRIVENT DANS LA FICHE, relevés dans la table de
// traduction `recap()` du simulateur (lareferencecourtage.fr/simulateur), pas
// dans ses boutons. Le site AFFICHE « Je me renseigne » au visiteur et ENVOIE
// « Se renseigne » au CRM ; c'est la seconde forme qui compte ici, sinon une
// même réponse s'écrit de deux façons selon la porte d'entrée et plus aucun
// filtre ne les réunit. Règle posée le 18/11/2026 par Christophe : « je veux
// exactement la même chose dans la fiche prospect, formulaire et simulateur ».
const AVANCEMENTS = ['Se renseigne', 'Recherche active', 'Offre faite', 'Offre acceptée', 'Compromis signé'];
const DUREES = ['15 ans', '20 ans', '25 ans'];
// ⚠ « Un seul » / « Deux », PAS « Seul » / « À deux » : c'est ce que le
// simulateur écrit dans `emprunteurs`. Mesuré sur un vrai dossier du site —
// il portait « Un seul », que l'ancien formulaire ne reconnaissait pas, donc
// le choix revenait VIDE à la réouverture et l'enregistrement l'effaçait.
const EMPRUNTEURS = ['Un seul', 'Deux'];
// Les huit régions du simulateur, dans son ordre.
const REGIONS = ['Île-de-France', 'Auvergne-Rhône-Alpes', 'PACA / Sud', 'Ouest',
  'Nouvelle-Aquitaine', 'Occitanie', 'Grand Est / Hauts-de-France', 'Autre / DOM-TOM'];
// Les dix statuts professionnels, écrits comme le simulateur les envoie.
const STATUTS = ['CDI', 'CDI période essai', 'Fonctionnaire', 'CDD', 'Intérim',
  'Libéral', 'TNS/gérant', 'Auto-entrepreneur', 'Retraité', 'Sans emploi/autre'];
const TYPES_CREDIT = ['Crédit conso', 'Crédit auto', 'LOA / Leasing', 'Prêt immobilier', 'Autre'];
const AUTRES_REVENUS = ['Pension de retraite', 'Pension alimentaire reçue',
  'Revenus fonciers / BIC-BNC', 'Rente / dividendes réguliers'];
// Ce que le prospect compte faire de son logement, et où en est la vente.
const DEVENIR_RP = ['Vente prévue', 'Mise en location prévue', 'Conservé sans location'];
const VENTE_AVANCEMENT = ['Pas en vente', 'Démarches débutées',
  'Sous mandat de vente exclusif', 'Offre acceptée', 'Compromis signé'];
const PRET_RELAIS = ['Oui', 'Non', 'Ne sait pas encore'];
// ⚠ LES LIBELLÉS SONT CEUX DU SIMULATEUR, relevés dans ses propres tables de
// traduction (`NB` et `LG` dans la page) et non réécrits de mémoire
// (18/11/2026, Christophe : « je veux exactement la même chose dans la fiche
// prospect, formulaire et simulateur du site internet »). Une même réponse
// doit s'écrire pareil qu'elle vienne du site ou du téléphone : « Appart.
// neuf » d'un côté et « Appartement neuf » de l'autre, et plus aucun filtre
// ni aucun comptage ne les réunit.
const TYPES_BIEN = ['Logement ancien', 'Appartement neuf', 'Terrain + construction', 'Autre'];
const LOGEMENTS = ['Locataire', 'Propriétaire', 'Hébergé à titre gratuit', 'Logé par l’employeur'];
const OUI_NON = ['Oui', 'Non'];
// La provenance : le libellé dit à l'écran, puis le canal du CRM qu'il range.
const ORIGINES = [
  ['Site internet', 'globe', 'Site internet direct'],
  ['Simulateur', 'cible', 'Simulateur du site'],
  // 19/11/2026 — les rendez-vous pris sur le site entrent dans le CRM
  // (fonction `rdv-courtage`) et arrivent sous ce canal. Il doit figurer
  // ICI, sinon il n'est proposé par aucun formulaire et n'apparaît dans
  // aucun filtre : une source qu'on ne peut plus ni saisir ni mesurer.
  ['Rendez-vous en ligne', 'rappel', 'Rendez-vous en ligne'],
  ['Partenaire', 'poignee', 'Partenaire / apporteur'],
  ['Recommandation', 'coeur', 'Recommandation client'],
  ['Meta Ads', 'megaphone', 'Meta Ads'],
  ['Téléphone / autre', 'telephone', 'Téléphone / autre'],
];
const CONTACTS = [
  ['rappel', 'Le rappeler', 'rappel', 'appel'],
  ['tel', 'RDV téléphone', 'telephone', 'rdv'],
  ['visio', 'RDV visio', 'visio', 'rdv'],
  ['agence', 'RDV à l’agence', 'agence', 'rdv'],
  ['rien', 'Rien pour l’instant', 'rien', null],
];
const HEURES = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

// ⚠ L'ORDRE EST CELUI DU SIMULATEUR DU SITE, SECTION PAR SECTION (19/11/2026,
// Élodie : « je veux tout dans le même ordre que le simulateur !!!! »). Relevé
// dans sa table `SCREENS`, lue en direct sur la page et non devinée : Projet,
// Situation perso, Situation pro, Revenus, Charges, Apport, Financement, puis
// VOS COORDONNÉES — et ses 105 écrans finissent bien par l'identité.
//
// ⚠ LES COORDONNÉES SONT DONC L'AVANT-DERNIÈRE ÉTAPE, pas la première. Je les
// avais mises en tête le matin même, en croyant suivre l'ordre d'un appel ;
// Élodie a tranché l'inverse — et c'est le site qui fait foi, parce qu'une même
// personne peut arriver par les deux portes et que les deux fiches doivent se
// lire pareil. Le simulateur le dit dans son propre commentaire : « c'est son
// rang DANS CETTE TABLE qui fixe l'ordre ».
//
// ⚠ PLUS D'ÉTAPE DÉSIGNÉE PAR SON NUMÉRO. `deal.js` ouvrait le rendez-vous avec
// `etape: 3` ; en passant de quatre à neuf sections, ce 3 serait tombé sur
// « Ses revenus », sans erreur et sans que rien ne le dise. Les appelants
// nomment désormais la section (`etape: 'rdv'`), et `rangEtape` traduit.
// ⚠ CES VINGT-DEUX QUESTIONS SONT CELLES D'ÉLODIE, DANS SON ORDRE, ÉCRITES
// SOUS SA DICTÉE LE 19/11/2026 — « je vais devoir te donner toutes les
// questions dans l'ordre des questions ». C'est la troisième version de la
// journée : j'avais d'abord inventé un ordre, puis déduit celui du simulateur
// section par section, et les deux étaient encore à côté. Cette liste-ci est
// la référence ; elle prime sur ma lecture de `SCREENS`.
//
// ⚠ LE RENDEZ-VOUS PASSE AVANT LES COORDONNÉES, et ce n'est pas une coquille
// de sa part : c'est l'ordre qu'elle a écrit. Les coordonnées ferment le
// parcours, comme sur le site.
const ETAPES = [
  { cle: 'projet', titre: 'Projet', question: 'Quel est son projet ?', aide: 'Dix questions : le bien, le budget, qui emprunte et où il habite.' },
  { cle: 'perso', titre: 'Situation personnelle et professionnelle', question: 'Qui emprunte ?', aide: 'L’âge et le statut comptent autant que le salaire pour une banque.' },
  { cle: 'revenus', titre: 'Revenus', question: 'Ce qui entre chaque mois', aide: 'Salaires, primes, loyers perçus, autres revenus.' },
  { cle: 'ptz', titre: 'Prêt à taux zéro', question: 'Le prêt à taux zéro', aide: 'Trois réponses suffisent à l’estimer.' },
  { cle: 'charges', titre: 'Charges', question: 'Ce qui sort chaque mois', aide: 'Les crédits en cours et les pensions versées.' },
  { cle: 'apport', titre: 'Apport', question: 'Ce qu’il met sur la table', aide: 'Et ce qui lui reste après.' },
  { cle: 'financement', titre: 'Financement', question: 'Sur combien de temps emprunter ?', aide: 'Le calcul se met à jour à chaque réponse.' },
  { cle: 'rdv', titre: 'Rendez-vous', question: 'Et ensuite ?', aide: 'Le premier contact devient une action datée dans le CRM.' },
  { cle: 'coordonnees', titre: 'Coordonnées du prospect', question: 'Qui est-ce ?', aide: 'En dernier, comme sur le simulateur.' },
];
/** Le rang d'une section, par sa clé. Rend 0 pour une clé inconnue. */
const rangEtape = (x) => {
  if (typeof x === 'number') return Math.max(0, Math.min(ETAPES.length - 1, x));
  const i = ETAPES.findIndex(e => e.cle === x);
  return i < 0 ? 0 : i;
};

const jourLocal = (d) => d.toLocaleDateString('sv-SE');
const nombre = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
// ⚠ UN CHAMP `number` N'AFFICHE RIEN SI SA VALEUR N'EST PAS UN NOMBRE, et ne
// le dit pas. Le simulateur écrit « 10 000 € » ou « 400 € /mois » : sans cette
// conversion, rouvrir un dossier venu du site montrait des cases vides, et
// « Enregistrer » effaçait pour de bon ce qu'il avait apporté.
// Rend '' pour « aucun », « Aucune » ou « — » : ce sont des absences.
// ⚠ `zeroCompte` N'EST PAS UN DÉTAIL : pour un montant, 0 est une absence
// (pas de pension versée) et la case doit rester vide ; pour les personnes à
// charge, « 0 enfant » EST la réponse. Éprouvé : sans ce drapeau, rouvrir un
// dossier venu du site montrait « Personnes à charge » vide alors que le
// visiteur avait répondu, et la question paraissait restée sans réponse.
const nombreTxt = (v, zeroCompte = false) => {
  const brut = String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');
  if (!brut) return '';
  const n = Number(brut);
  if (!Number.isFinite(n)) return '';
  return (n !== 0 || zeroCompte) ? String(n) : '';
};
const telNet = (t) => String(t || '').replace(/\D/g, '').replace(/^33/, '0');

// ⚠ LE SIMULATEUR N'ÉCRIT QUE LA PHRASE, PAS SES MORCEAUX (19/11/2026, signalé
// par Élodie sur un dossier venu du site : « les valeurs ne correspondent pas à
// ce qu'a laissé le prospect »). Il pose `emprunteur_1` — « 35 ans, CDI,
// 3 900 € /mois + primes 18 000 € /an (soit 1 500 € /mois) » — et jamais
// `age_1`, `statut_1`, `salaire_1`, `primes_1`. L'étape « Situation personnelle
// et professionnelle » s'ouvrait donc VIDE sur un dossier qui portait tout.
//
// On relit donc la phrase. C'est une lecture, pas une devinette : elle est
// composée par le site selon un gabarit fixe (`emp()` dans son `recap()`), et
// c'est le même que celui que ce formulaire écrit depuis ce matin.
//
// ⚠ LA PARENTHÈSE FINALE EST UN CALCUL, PAS UNE DONNÉE : « (soit 1 500 € /mois) »
// est la mensualisation des primes. La prendre pour le salaire doublerait les
// revenus. On la retire avant de lire.
export function litEmprunteur(phrase) {
  const t = String(phrase || '').replace(/\s*\(soit[^)]*\)\s*/i, ' ').trim();
  if (!t) return null;
  const age = /(\d{1,3})\s*ans/i.exec(t);
  const salaire = /([\d   .]+)\s*€\s*\/\s*mois/i.exec(t);
  const primes = /primes\s*([\d   .]+)\s*€\s*\/\s*an/i.exec(t);
  // Le statut est le morceau entre la première et la deuxième virgule.
  const bouts = t.split(',').map(x => x.trim());
  const statut = bouts.length > 1 ? bouts[1] : '';
  const n = (m) => (m ? String(Number(String(m[1]).replace(/[^\d]/g, '')) || '') : '');
  return { age: n(age), statut, salaire: n(salaire), primes: n(primes) };
}

// ⚠ LE MÊME FORMULAIRE CRÉE ET MODIFIE (18/11/2026, Mickael : « je voudrais
// retrouver toutes les informations enregistrées dans le formulaire, que la
// fiche soit la même dans la base de données et la pipeline dossiers, et que
// toutes les données soient synchronisées »). Avec `dealId`, il s'ouvre rempli
// des valeurs du dossier et de son contact, et « Enregistrer » réécrit les deux.
// Il n'y a donc qu'UNE saisie pour un dossier de courtage, d'où qu'on l'ouvre :
// « Modifier » de la fiche (deal.js) et le crayon de la base passent ici. Le
// formulaire générique `dealForm` ne connaissait ni l'avancement, ni la durée,
// ni les revenus : modifier par lui, c'était laisser ces réponses figées.
export function nouveauProspectCourtage(apres, { dealId = null, retour = null, etape: etapeDepart = 0 } = {}) {
  const moi = scope.user?.id || null;
  const dossier = dealId ? db.byId('deals', dealId) : null;
  const fiche = dossier?.contact_id ? db.byId('contacts', dossier.contact_id) : null;
  const edition = !!dossier;
  const f0 = dossier?.fields || {};
  const txt = (x) => (x === null || x === undefined ? '' : String(x));
  // Un dossier venu du simulateur porte son projet sous `projet` et non `objectif`.
  const objectif0 = f0.objectif || (OBJECTIFS().includes(f0.projet) ? f0.projet : '');
  // Les deux phrases d'emprunteur, relues en morceaux. Voir `litEmprunteur`.
  const e1 = litEmprunteur(f0.emprunteur_1);
  const e2 = litEmprunteur(f0.emprunteur_2);
  const v = {
    type_financement: txt(f0.type_financement), objectif: objectif0, avancement: AVANCEMENTS.includes(f0.avancement) ? f0.avancement : '',
    // ⚠ CES CINQ-LÀ AUSSI PASSENT PAR `nombreTxt` (19/11/2026), et ils avaient
    // été oubliés le 18 : ce sont des champs `number`, et le simulateur du site
    // y écrit « 10 000 € » ou « 400 € /mois ». Mesuré sur un dossier du site —
    // APPORT et CRÉDITS EN COURS s'affichaient VIDES, et « Enregistrer »
    // effaçait pour de bon ce que le visiteur avait répondu. `apport` était
    // même explicitement jeté dès qu'il n'était pas un nombre.
    // ⚠ `budget` EN REPLI DE `montant_projet`, ET C'EST LE DÉFAUT LE PLUS VISIBLE
    // (19/11/2026). Le simulateur n'écrit pas `montant_projet` : il écrit
    // `budget`, « 180 000 € ». Vérifié sur le seul vrai dossier du site en base.
    // La case du budget s'ouvrait donc VIDE sur un dossier venu du simulateur, et
    // l'enregistrement effaçait le chiffre. `courtage.js` lisait déjà les deux
    // (`nb(f.montant_projet) ?? nb(f.budget)`) : le formulaire était le seul à
    // n'en connaître qu'une.
    montant_projet: nombreTxt(f0.montant_projet) || nombreTxt(f0.budget),
    apport: nombreTxt(f0.apport),
    // ⚠ `emprunt` EN REPLI, ET IL EST PRIORITAIRE SUR TOUT CALCUL (19/11/2026).
    // Le simulateur écrit le montant à financer sous `emprunt` (330200), jamais
    // sous `montant_financement`. La case s'ouvrait donc vide, puis la
    // déduction d'ouverture posait budget − apport = 290 000 — et ÉCRASAIT les
    // 330 200 réels à l'enregistrement. Le vrai montant comprend les frais, que
    // la soustraction ignore : il ne se recalcule pas, il se lit.
    montant_financement: nombreTxt(f0.montant_financement) || nombreTxt(f0.emprunt),
    duree: DUREES.includes(f0.duree) ? f0.duree : '', emprunteurs: EMPRUNTEURS.includes(f0.emprunteurs) ? f0.emprunteurs : '',
    revenus_foyer: nombreTxt(f0.revenus_foyer), credits_en_cours: nombreTxt(f0.credits_en_cours),
    ville_projet: txt(f0.ville),
    // 19/11/2026 — les questions du simulateur que le formulaire ne posait pas
    // du tout. Mêmes clés, mêmes libellés : une fiche se lit pareil qu'elle
    // vienne du site ou du téléphone.
    region: REGIONS.includes(f0.region) ? f0.region : '',
    taux_actuel: txt(f0.taux_actuel),
    // ⚠ LA PHRASE DU SIMULATEUR SERT DE REPLI, champ par champ : ce qui est
    // écrit en clair dans `fields` l'emporte, et la phrase comble le reste.
    // Sans cela l'étape « Situation personnelle et professionnelle » s'ouvrait
    // vide sur un dossier venu du site, qui portait pourtant tout.
    statut_1: STATUTS.includes(f0.statut_1) ? f0.statut_1
      : (STATUTS.includes(e1?.statut) ? e1.statut : ''),
    statut_2: STATUTS.includes(f0.statut_2) ? f0.statut_2
      : (STATUTS.includes(e2?.statut) ? e2.statut : ''),
    age_1: nombreTxt(f0.age_1) || txt(e1?.age), age_2: nombreTxt(f0.age_2) || txt(e2?.age),
    salaire_1: nombreTxt(f0.salaire_1) || txt(e1?.salaire),
    salaire_2: nombreTxt(f0.salaire_2) || txt(e2?.salaire),
    primes_1: nombreTxt(f0.primes_1) || txt(e1?.primes),
    primes_2: nombreTxt(f0.primes_2) || txt(e2?.primes),
    type_autres_revenus: AUTRES_REVENUS.includes(f0.type_autres_revenus) ? f0.type_autres_revenus : '',
    devenir_rp: DEVENIR_RP.includes(f0.logement_actuel_devenir) ? f0.logement_actuel_devenir : '',
    valeur_rp: nombreTxt(f0.logement_actuel_valeur),
    loyer_espere_rp: nombreTxt(f0.logement_actuel_loyer_espere),
    vente_avancement: VENTE_AVANCEMENT.includes(f0.vente_avancement) ? f0.vente_avancement : '',
    crd_rp: nombreTxt(f0.vente_capital_restant_du),
    pret_relais: PRET_RELAIS.includes(f0.pret_relais) ? f0.pret_relais : '',
    regroupement: OUI_NON.includes(f0.regroupement_credits) ? f0.regroupement_credits : '',
    assurance: txt(f0.assurance),
    ptz_rfr: nombreTxt(f0.ptz_rfr), ptz_occupants: nombreTxt(f0.ptz_occupants),
    // 19/11/2026 — les six dernières lignes du récapitulatif du simulateur,
    // chacune dans SA section (Élodie : « mets-les dans les bonnes catégories
    // et ne mélange pas tout, parce que là les champs étaient parfaits »).
    // Les huit autres y étaient déjà depuis le matin.
    // ⚠ DEUX SAISIES SEULEMENT SUR LES SIX. Relu dans le simulateur, à la
    // source : `apport_attendu` (10 % du budget, 5 % dans le neuf),
    // `apport_potentiel`, `apport_degage_par_la_vente` et `nombre_de_credits`
    // sont des CALCULS, pas des questions. Les redemander ferait diverger deux
    // chiffres qui doivent s'accorder. Restent deux vraies questions, et elles
    // ne se posent que dans leur cas : le complément quand l'apport est court,
    // la confirmation quand il dépasse le budget.
    apport_complement: OUI_NON.includes(f0.apport_complement_possible) ? f0.apport_complement_possible : '',
    apport_superieur: String(f0.apport_confirme_superieur || '').startsWith('Oui') ? 'Oui'
      : (String(f0.apport_confirme_superieur || '').trim() === 'Non' ? 'Non' : ''),
    // 18/11/2026 — les questions que le simulateur posait et que le formulaire
    // ignorait. Elles portent ICI les clés que le simulateur pose déjà sur
    // l'affaire : saisie au téléphone ou remplie sur le site, la fiche montre
    // la même ligne, au même endroit.
    // ⚠ `nombreTxt` et non `txt` : le simulateur écrit ses montants en toutes
    // lettres (« 10 000 € », « 400 € /mois »). Posés tels quels dans un champ
    // `number`, ils s'affichent VIDES — le navigateur refuse une valeur qui
    // n'est pas un nombre, sans erreur. Modifier un dossier venu du site
    // aurait alors effacé ce qu'il avait apporté.
    type_bien: TYPES_BIEN.includes(f0.type_bien) ? f0.type_bien : '',
    primo: OUI_NON.includes(f0.primo) ? f0.primo : '',
    travaux: nombreTxt(f0.travaux),
    epargne_restante: nombreTxt(f0.epargne_restante),
    autres_revenus: nombreTxt(f0.autres_revenus),
    revenus_locatifs: nombreTxt(f0.revenus_locatifs),
    pension_versee: nombreTxt(f0.pension_versee),
    detail_credits: txt(f0.detail_credits),
    logement_actuel: LOGEMENTS.includes(f0.logement_actuel) ? f0.logement_actuel : '',
    loyer_actuel: nombreTxt(f0.loyer_actuel),
    enfants_a_charge: nombreTxt(f0.enfants_a_charge, true),
    emprunteur_1: txt(f0.emprunteur_1), emprunteur_2: txt(f0.emprunteur_2),
    first_name: txt(fiche?.first_name), last_name: txt(fiche?.last_name === '—' ? '' : fiche?.last_name),
    phone: txt(fiche?.phone), email: txt(fiche?.email), address: txt(fiche?.address), postal_code: txt(fiche?.postal_code), city: txt(fiche?.city),
    canal: txt(fiche?.channel || dossier?.channel), apporteur: txt(dossier?.referrer_org_id), message: txt(f0.message),
    // En modification, aucune action n'est ajoutée d'office : le dossier a déjà les siennes.
    // Ouvrir directement sur le rendez-vous, c'est vouloir en poser un : on
    // propose « RDV téléphone » plutôt que « Rien pour l'instant ».
    contact: edition ? (rangEtape(etapeDepart) === rangEtape('rdv') ? 'tel' : 'rien') : 'rappel',
    jour: jourLocal(new Date(Date.now() + 86400000)), heure: '10:00',
    responsable: dossier?.owner_id || moi,
  };
  // ⚠ LE TROISIÈME MONTANT SE DÉDUIT À L'OUVERTURE, pas seulement à la frappe.
  // Un dossier venu du site porte souvent le projet et l'apport sans le montant
  // à financer : la carte s'ouvrait alors sur une mensualité « — » alors que les
  // deux chiffres qui la donnent étaient sous les yeux. Ce n'est pas une valeur
  // inventée, c'est la soustraction que la ligne d'explication promet déjà —
  // et `lier()` la fait de toute façon au premier caractère tapé.
  if (!v.montant_financement && nombre(v.montant_projet)) {
    v.montant_financement = String(Math.max(0, nombre(v.montant_projet) - (nombre(v.apport) || 0)));
  }
  let etape = rangEtape(etapeDepart);
  let enCours = false;
  const libCreer = edition ? 'Enregistrer' : 'Créer le prospect';

  const m = openModal(edition ? 'Modifier le dossier' : 'Nouveau prospect', '<div class="lrc-form" id="lrc-form"></div>',
    { wide: true, onClose: () => { if (!sauve) retour?.(); } });
  let sauve = false;
  // `openModal` rend la boîte `.modal` elle-même, pas son fond.
  m.classList.add('lrc-modal');
  const hote = m.querySelector('#lrc-form');

  const apporteurs = () => scope.orgs()
    .filter(o => (o.activities || []).includes(KEY) && o.type !== 'Banque' && o.partner_job !== 'Banque')
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  // Le même e-mail ou le même téléphone : c'est la même personne — MAIS
  // SEULEMENT DANS LA BASE DE LA RÉFÉRENCE COURTAGE.
  // ⚠ CHAQUE STRUCTURE A SA BASE (17/11/2026, Mickael : « j'ai fait un test avec
  // Élodie Carré et on m'a dit que le contact était déjà dans le CRM — rappelle-
  // toi que je veux distinguer les bases de données de chaque structure »). La
  // première version cherchait dans TOUS les contacts visibles : une cliente de
  // RGD Renova était proposée comme doublon, et sa fiche RGD aurait été
  // rattachée au courtage. Une personne connue ailleurs dans le groupe a donc
  // ici une fiche à elle, propre au courtage.
  const doublon = () => {
    const e = v.email.trim().toLowerCase();
    const t = telNet(v.phone);
    if (!e && t.length < 9) return null;
    return scope.contacts().filter(c => (c.activities || []).includes(KEY) && c.id !== fiche?.id).find(c => (e && String(c.email || '').trim().toLowerCase() === e)
      || (t.length >= 9 && telNet(c.phone) === t)) || null;
  };
  // ------------------------------------------------- ce qui se pose, ce qui attend
  //
  // ⚠ UNE QUESTION N'APPELLE LA SUIVANTE QUE SI ELLE Y MÈNE (19/11/2026, Élodie :
  // « je veux qu'il soit simple à remplir, par exemple : on demande d'abord s'il
  // y a des crédits en cours et si oui, quels crédits et combien ? »). L'étape
  // des chiffres posait SES DIX-HUIT QUESTIONS D'UN COUP — mesuré avant de
  // toucher au code : 16 cases et 2 rangées de choix, une carte qui dépassait de
  // 375 px un écran de 1000, et le panneau de calcul entièrement sous le pli.
  // Neuf fois sur dix, la moitié de ces cases valent zéro.
  //
  // ⚠ CE QUI EST REPLIÉ N'EST JAMAIS PERDU : un dossier qui porte déjà une de
  // ces réponses s'ouvre DÉPLIÉ. Sinon la question paraîtrait restée vide — et
  // c'est tout le propos de `nombreTxt` plus haut, qui a déjà coûté une
  // correction le 18/11.
  const ouverts = new Set();
  const DETAIL = ['travaux', 'epargne_restante', 'autres_revenus', 'revenus_locatifs',
    'pension_versee', 'logement_actuel', 'loyer_actuel', 'enfants_a_charge', 'ville_projet'];
  if (DETAIL.some(k => String(v[k] || '').trim())) ouverts.add('detail');
  if (v.address.trim() || v.postal_code.trim() || v.city.trim()) ouverts.add('adresse');

  // Les questions d'aiguillage : « y en a-t-il ? » avant « combien ? ».
  // ⚠ ELLES NE SONT PAS ENREGISTRÉES, et n'ont pas à l'être : `creer()` ne lit
  // que les clés qu'il nomme. Leur valeur se DÉDUIT des réponses à l'ouverture,
  // pour qu'un dossier venu du simulateur s'affiche déjà ouvert.
  const q = {
    travaux: nombre(v.travaux) ? 'Oui' : '',
    credits: (nombre(v.credits_en_cours) || v.detail_credits.trim()) ? 'Oui' : '',
    locatif: nombre(v.revenus_locatifs) ? 'Oui' : '',
    autres: (nombre(v.autres_revenus) || v.type_autres_revenus) ? 'Oui' : '',
    pension: nombre(v.pension_versee) ? 'Oui' : '',
  };
  // Répondre « Non » efface ce que la question ouvrait : un crédit saisi puis
  // démenti ne doit pas rester dans le dossier, invisible.
  const VIDER = {
    travaux: ['travaux'],
    credits: ['credits_en_cours', 'detail_credits', 'regroupement'],
    locatif: ['revenus_locatifs'],
    autres: ['autres_revenus', 'type_autres_revenus'],
    pension: ['pension_versee'],
  };

  // ⚠ « PRIMO-ACCÉDANT » N'A AUCUN SENS POUR UN REGROUPEMENT DE CRÉDITS, pas
  // plus que « quel type de bien ». Ces questions ne se posent que là où elles
  // veulent dire quelque chose — mais une réponse DÉJÀ DONNÉE reste visible,
  // sinon l'enregistrement suivant l'effacerait sans que personne la voie.
  const immo = () => v.type_financement === 'Crédit immobilier';
  const pro = () => v.type_financement === 'Crédit professionnel';
  const montre = (k, utile) => utile || !!String(v[k] || '').trim();

  // ⚠ LES TROIS CONDITIONS DU PRÊT À TAUX ZÉRO, celles du simulateur
  // (`ptzPossible`) : une résidence principale, un bien NEUF ou un terrain +
  // construction, et quelqu'un qui n'a pas été propriétaire de sa résidence
  // principale ces deux dernières années. Ailleurs la section n'a rien à
  // demander — et trois cases vides sur un dossier qui n'y a pas droit se
  // lisent comme un formulaire qu'on a oublié de remplir.
  const ptzPossible = () => v.objectif === 'Résidence principale'
    && (v.type_bien === 'Appartement neuf' || v.type_bien === 'Terrain + construction')
    && v.primo === 'Non';

  // ⚠ CE QUE LA BANQUE ATTEND D'APPORT SE CALCULE — c'est la règle du
  // simulateur (`apportAttendu`) : 10 % du budget, 5 % seulement dans le neuf,
  // où les frais de notaire sont bien moindres. Rien à demander au client, et
  // rien à taper : un courtier qui saisirait ce chiffre à la main finirait un
  // jour par en écrire un autre que celui du site, sur le même dossier.
  const TAUX_APPORT = () => (v.type_bien === 'Appartement neuf' ? 0.05 : 0.10);
  const apportAttendu = () => (v.objectif === 'Rachat / renégociation' ? 0
    : Math.round((nombre(v.montant_projet) || 0) * TAUX_APPORT()));
  const apportCourt = () => apportAttendu() > 0 && (nombre(v.apport) || 0) < apportAttendu();
  const complementApport = () => Math.max(0, apportAttendu() - (nombre(v.apport) || 0));
  // Un apport supérieur au prix du bien est presque toujours une erreur de
  // saisie (l'épargne totale à la place de l'apport). Le simulateur le fait
  // confirmer ; le formulaire aussi, sinon un zéro de trop traverse la fiche.
  const apportIncoherent = () => (nombre(v.montant_projet) || 0) > 0
    && (nombre(v.apport) || 0) > nombre(v.montant_projet)
    && v.objectif !== 'Rachat / renégociation';
  // L'apport dégagé par la vente : 70 % de la valeur estimée moins le capital
  // restant dû. Zéro quand le crédit en cours mange cette avance.
  const apportVente = () => {
    if (v.devenir_rp !== 'Vente prévue') return 0;
    const avance = Math.round((nombre(v.valeur_rp) || 0) * 0.70);
    return avance > (nombre(v.crd_rp) || 0) ? avance - (nombre(v.crd_rp) || 0) : 0;
  };

  // ⚠ LES BIENS LOCATIFS SE DÉTAILLENT UN PAR UN (19/11/2026, Élodie : « si
  // oui, combien de biens et combien de loyers et la valeur de chaque bien,
  // capital restant dû de chaque bien et mensualités de crédits »). Le
  // simulateur en pose jusqu'à six, avec ces quatre mêmes questions : on fait
  // pareil. Ils vivent dans une liste à part de `v`, et se replient en une
  // ligne de texte à l'enregistrement.
  const LOC_MAX = 6;
  const biens = (() => {
    const l = Array.isArray(f0.biens_locatifs) ? f0.biens_locatifs
      : (() => { try { return JSON.parse(String(f0.biens_locatifs || '[]')); } catch { return []; } })();
    const propre = (Array.isArray(l) ? l : []).slice(0, LOC_MAX)
      .map(b => ({ loyer: nombreTxt(b?.loyer), valeur: nombreTxt(b?.valeur), crd: nombreTxt(b?.crd), mensualite: nombreTxt(b?.mensualite) }));
    // Un dossier du site ne porte que le total : on ouvre un bien pour le tenir.
    if (!propre.length && nombre(v.revenus_locatifs)) {
      return [{ loyer: nombreTxt(v.revenus_locatifs), valeur: '', crd: '', mensualite: '' }];
    }
    return propre.length ? propre : [{ loyer: '', valeur: '', crd: '', mensualite: '' }];
  })();

  // ⚠ ET LES CRÉDITS AUSSI (« lesquels et le montant des mensualités »). Le
  // simulateur en accepte douze ; chacun a son type et sa mensualité.
  const CRED_MAX = 12;
  const credits = (() => {
    const l = Array.isArray(f0.liste_credits) ? f0.liste_credits
      : (() => { try { return JSON.parse(String(f0.liste_credits || '[]')); } catch { return []; } })();
    const propre = (Array.isArray(l) ? l : []).slice(0, CRED_MAX)
      .map(c => ({ type: TYPES_CREDIT.includes(c?.type) ? c.type : '', montant: nombreTxt(c?.montant) }));
    if (!propre.length && (nombre(v.credits_en_cours) || v.detail_credits.trim())) {
      return [{ type: '', montant: nombreTxt(v.credits_en_cours) }];
    }
    return propre.length ? propre : [{ type: '', montant: '' }];
  })();

  // Les questions RÉELLEMENT posées à cette étape — pas une liste figée.
  // ⚠ LE COMPTEUR MENTAIT : il annonçait « 0/8 réponses » sur l'étape qui en
  // posait dix-huit, et comptait des questions que l'écran ne montrait pas.
  const clesDe = (i) => {
    const rachat = v.type_financement === 'Regroupement de crédits'
      || v.objectif === 'Rachat / renégociation';
    const aDeux = v.emprunteurs === 'Deux';
    switch (ETAPES[i].cle) {
      // Les dix questions de la section « Projet », telles qu'Élodie les a
      // numérotées — celles qui ne se posent pas ne se comptent pas.
      case 'projet': return ['type_financement',
        ...(montre('type_bien', immo() && !rachat) ? ['type_bien'] : []),
        ...(montre('avancement', (immo() || pro()) && !rachat) ? ['avancement'] : []),
        ...(montre('primo', immo() && !rachat) ? ['primo'] : []),
        ...(montre('region', immo() && !rachat) ? ['region'] : []),
        'montant_projet', 'emprunteurs', 'logement_actuel', 'enfants_a_charge'];
      case 'perso': return ['age_1', 'statut_1', ...(aDeux ? ['age_2', 'statut_2'] : [])];
      case 'revenus': return ['salaire_1', 'primes_1', 'revenus_foyer',
        ...(aDeux ? ['salaire_2'] : [])];
      case 'ptz': return ptzPossible() ? ['ville_projet', 'ptz_rfr', 'ptz_occupants'] : [];
      case 'charges': return [...(q.credits === 'Oui' ? ['credits_en_cours'] : []),
        ...(q.pension === 'Oui' ? ['pension_versee'] : [])];
      case 'apport': return ['apport', 'epargne_restante',
        ...(apportCourt() ? ['apport_complement'] : []),
        ...(apportIncoherent() ? ['apport_superieur'] : [])];
      case 'financement': return ['duree'];
      case 'coordonnees': return ['first_name', 'last_name', 'phone', 'email', 'canal'];
      default: return ['contact'];
    }
  };
  const reponses = (i) => {
    const k = clesDe(i);
    return k.filter(x => String(v[x] || '').trim()).length + '/' + k.length;
  };

  const tuiles = (nom, liste, actif) => `<div class="lrc-tuiles">${liste.map(([val, icone, sous, affiche]) => `
    <button type="button" class="lrc-tuile ${actif === val ? 'on' : ''}" data-choix="${nom}" data-val="${esc(val)}">
      <span class="lrc-ico">${ico(icone)}</span><b>${esc(affiche || val)}</b>${sous ? `<em>${esc(sous)}</em>` : ''}</button>`).join('')}</div>`;
  const puces = (nom, liste, actif) => `<div class="lrc-puces">${liste.map(val => `
    <button type="button" class="lrc-puce ${actif === val ? 'on' : ''}" data-choix="${nom}" data-val="${esc(val)}">${esc(val)}</button>`).join('')}</div>`;
  const champ = (nom, label, { type = 'text', ph = '', suffixe = '', large = false } = {}) => `
    <label class="lrc-champ ${large ? 'large' : ''}"><span>${esc(label)}</span>
      <span class="lrc-saisie"><input name="${nom}" type="${type}" value="${esc(v[nom])}" placeholder="${esc(ph)}"
        ${type === 'number' ? 'inputmode="numeric" min="0" step="1000"' : ''} autocomplete="off">${suffixe ? `<i>${esc(suffixe)}</i>` : ''}</span></label>`;
  // Une question fermée, qui en ouvre d'autres. Elle se relit comme on la pose
  // au téléphone : « vous avez des crédits en cours ? » — oui, non, on passe.
  const ouinon = (nom, label) => `<h4>${esc(label)}</h4><div class="lrc-puces">${OUI_NON.map(o => `
    <button type="button" class="lrc-puce ${q[nom] === o ? 'on' : ''}" data-q="${nom}" data-val="${o}">${o}</button>`).join('')}</div>`;
  // ⚠ CE QUI MANQUE SE DIT, IL NE SE DEVINE PAS — et surtout pas sous la forme
  // de trois pastilles « obligatoire » sur le prénom, le nom et le téléphone :
  // ce serait FAUX. `creer()` demande (un prénom OU un nom) ET (un téléphone OU
  // un e-mail valable), donc l'étiquette aurait réclamé un numéro à quelqu'un
  // qui n'a laissé que son adresse. La ligne nomme ce qui manque vraiment, et
  // devient verte quand il ne manque plus rien.
  const manque = () => {
    const m = [];
    if (!v.first_name.trim() && !v.last_name.trim()) m.push('un nom');
    if (telNet(v.phone).length < 9 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) {
      m.push('un téléphone ou un e-mail');
    }
    return m;
  };
  const ditManque = () => {
    const m = manque();
    // « un nom, et un téléphone ou un e-mail » : la virgule sépare les deux
    // exigences, sans quoi les trois « ou » et « et » se lisent de travers.
    return m.length ? `Il manque ${m.join(', et ')} pour créer le prospect.`
      : 'C’est bon : le prospect peut être créé dès maintenant, le reste se complète après.';
  };
  // Les quatre cases d'un bien locatif, et les deux d'un crédit. Elles ne
  // passent pas par `champ()` : leur valeur vit dans une liste, pas dans `v`.
  const champBien = (i, k, label, ph, suffixe) => `
    <label class="lrc-champ"><span>${esc(label)}</span>
      <span class="lrc-saisie"><input name="bien_${i}_${k}" type="number" inputmode="numeric" min="0" step="100"
        value="${esc(biens[i][k])}" placeholder="${esc(ph)}" autocomplete="off"><i>${esc(suffixe)}</i></span></label>`;
  const champCredit = (i) => `
    <label class="lrc-champ"><span>Type du crédit ${i + 1}</span>
      <select name="credit_${i}_type"><option value="">— Choisir —</option>${TYPES_CREDIT.map(t =>
        `<option value="${esc(t)}" ${credits[i].type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const champCreditMontant = (i) => `
    <label class="lrc-champ"><span>Mensualité${credits.length > 1 ? ` (crédit ${i + 1})` : ''}
      ${i > 0 || credits.length > 1 ? `<button type="button" class="lrc-oter" data-oter-credit="${i}">retirer</button>` : ''}</span>
      <span class="lrc-saisie"><input name="credit_${i}_montant" type="number" inputmode="numeric" min="0" step="10"
        value="${esc(credits[i].montant)}" placeholder="250" autocomplete="off"><i>€ / mois</i></span></label>`;
  // Un repli : le titre reste visible, le contenu attend qu'on en ait besoin.
  const replie = (cle, label, dedans) => `<div class="lrc-repli ${ouverts.has(cle) ? 'est-ouvert' : ''}">
    <button type="button" class="lrc-replier" data-repli="${cle}"><i>${ouverts.has(cle) ? '−' : '+'}</i>${esc(label)}</button>
    ${ouverts.has(cle) ? `<div class="lrc-repli-corps">${dedans}</div>` : ''}</div>`;

  // ---------------------------------------------------------------- les calculs
  // ⚠ LES TAUX SONT CEUX DU SIMULATEUR DU SITE (CONFIG.TAUX de
  // lareferencecourtage.fr/simulateur : 15 ans 2,95 %, 20 ans 3,25 %, 25 ans
  // 3,45 %), et le seuil d'endettement est son repère de 35 % : le CRM et le site
  // rendent le même ordre de grandeur pour le même projet. Hors assurance, comme
  // le site. Indicatif : le dossier tranche.
  const TAUX = { 15: 0.0295, 20: 0.0325, 25: 0.0345 };
  const SEUIL = 35;
  function calculs() {
    const P = nombre(v.montant_projet), A = nombre(v.apport) || 0, F = nombre(v.montant_financement);
    const R = nombre(v.revenus_foyer), C = nombre(v.credits_en_cours) || 0;
    const ans = parseInt(v.duree, 10) || 25;
    const t = (TAUX[ans] || TAUX[25]) / 12, n = ans * 12;
    const facteur = (1 - Math.pow(1 + t, -n)) / t;            // capital pour 1 € par mois
    const mens = F ? Math.round(F / facteur) : null;
    const endet = R && mens ? Math.round(((mens + C) / R) * 1000) / 10 : null;
    const mensMax = R ? R * SEUIL / 100 - C : null;
    const capa = mensMax !== null ? Math.max(0, Math.floor((mensMax * facteur) / 1000) * 1000) : null;
    const apportPct = P && A ? Math.round((A / P) * 1000) / 10 : null;
    const ton = endet === null ? '' : endet <= SEUIL ? 'est-vert' : endet <= SEUIL + 3 ? 'est-orange' : 'est-rouge';
    return { P, A, F, R, C, ans, mens, endet, capa, apportPct, ton, taux: (TAUX[ans] || TAUX[25]) * 100 };
  }
  function panneau() {
    const k = calculs();
    const pct = (x) => String(x).replace('.', ',');
    const jauge = k.endet === null ? 0 : Math.min(100, (k.endet / 60) * 100);
    const avis = k.endet === null ? 'Renseignez le montant à financer et les revenus pour voir le taux d’endettement.'
      : k.ton === 'est-vert' ? 'Dans le repère des banques.'
      : k.ton === 'est-orange' ? 'À la limite : quelques dizaines d’euros font basculer.'
      : 'Au-dessus du repère : apport, durée ou montant à revoir.';
    const ecart = k.capa !== null && k.F ? k.capa - k.F : null;
    return `
      <div class="lrc-calc-cases">
        <div><span>Mensualité estimée</span><b>${k.mens ? esc(eur(k.mens)) : '—'}</b><em>sur ${k.ans} ans à ${pct(k.taux.toFixed(2))} %</em></div>
        <div class="${k.ton}"><span>Taux d’endettement</span><b>${k.endet !== null ? pct(k.endet) + ' %' : '—'}</b><em>${k.C ? 'crédits en cours compris' : 'hors assurance'}</em></div>
        <div><span>Capacité d’emprunt</span><b>${k.capa !== null ? esc(eur(k.capa)) : '—'}</b><em>${ecart === null ? `à ${SEUIL} % d’endettement` : ecart >= 0 ? `marge de ${esc(eur(ecart))}` : `manque ${esc(eur(-ecart))}`}</em></div>
        <div><span>Apport</span><b>${k.apportPct !== null ? pct(k.apportPct) + ' %' : '—'}</b><em>du projet</em></div>
      </div>
      <div class="lrc-jauge ${k.ton}"><i style="width:${jauge}%"></i><span class="lrc-repere" style="left:${(SEUIL / 60) * 100}%">${SEUIL} %</span></div>
      <p class="lrc-avis ${k.ton}">${esc(avis)}</p>`;
  }
  // Projet = apport + montant à financer : le champ qu'on tape commande, l'un
  // des deux autres suit. Les autres champs sont réécrits sans redessiner,
  // pour ne pas perdre le curseur.
  function lier(source) {
    const P = nombre(v.montant_projet), A = nombre(v.apport) || 0, F = nombre(v.montant_financement);
    const poser = (nom, val) => {
      v[nom] = val === null ? '' : String(Math.max(0, Math.round(val)));
      const el = hote.querySelector(`[name="${nom}"]`); if (el && el !== document.activeElement) el.value = v[nom];
    };
    // ⚠ LES REVENUS DU FOYER SE DÉDUISENT DES SALAIRES, mais on ne les écrase
    // jamais : c'est `revenus_foyer` que lisent la fiche, le calcul et le
    // pipeline, et quelqu'un peut l'avoir saisi seul, sans détailler. On ne le
    // pose donc que s'il est VIDE — ou s'il valait exactement la somme d'avant,
    // c'est-à-dire s'il venait déjà de ce calcul et non d'une saisie.
    if (source === 'salaire_1' || source === 'salaire_2' || source === 'primes_1' || source === 'primes_2') {
      const somme = (nombre(v.salaire_1) || 0) + (nombre(v.salaire_2) || 0)
        + Math.round(((nombre(v.primes_1) || 0) + (nombre(v.primes_2) || 0)) / 12);
      const avant = Number(v.__revenusCalcules || 0);
      if (somme && (!nombre(v.revenus_foyer) || nombre(v.revenus_foyer) === avant)) {
        poser('revenus_foyer', somme);
        v.__revenusCalcules = somme;
      }
    }
    if (source === 'montant_projet' || source === 'apport') { if (P) poser('montant_financement', P - A); }
    else if (source === 'montant_financement') {
      if (P && F !== null) poser('apport', P - F);
      else if (!P && F) poser('montant_projet', F + A);
    }
    const c = hote.querySelector('#lrc-calcul'); if (c) c.innerHTML = panneau();
  }

  const corps = () => {
    const E = ETAPES[etape].cle;
    const rachat = v.type_financement === 'Regroupement de crédits'
      || v.objectif === 'Rachat / renégociation';
    const aDeux = v.emprunteurs === 'Deux';

    // ======================================================== PROJET (1 à 10)
    // L'ordre est celui dicté par Élodie, numéro par numéro. Les questions
    // 9 et 10 — le logement d'aujourd'hui et les personnes à charge — sont
    // DANS le projet, pas dans une section à part : c'est là qu'elle les a
    // mises, et c'est là qu'elles restent.
    if (E === 'projet') {
      const proprio = v.logement_actuel === 'Propriétaire';
      return `
      ${'' /* 1 */}${tuiles('type_financement', FINANCEMENTS, v.type_financement)}
      ${v.type_financement || v.objectif ? `<h4>Pour quel projet ?</h4>${puces('objectif', OBJECTIFS(), v.objectif)}` : ''}
      ${'' /* 2 */}${montre('type_bien', immo() && !rachat) ? `<h4>Quel type de bien ?</h4>${puces('type_bien', TYPES_BIEN, v.type_bien)}` : ''}
      ${'' /* 3 */}${montre('avancement', (immo() || pro()) && !rachat) ? `<h4>Où en est-il ?</h4>${puces('avancement', AVANCEMENTS, v.avancement)}` : ''}
      ${'' /* 4 — la question du PTZ, en toutes lettres comme sur le site */}
      ${montre('primo', immo() && !rachat) ? `<h4>Propriétaire de sa résidence principale ces 2 dernières années ?</h4>
        ${puces('primo', OUI_NON, v.primo)}` : ''}
      ${'' /* 5 */}${montre('region', immo() && !rachat) ? `<h4>Où se situe le bien ?</h4>${puces('region', REGIONS, v.region)}` : ''}
      ${'' /* 6 — LE BUDGET SEUL : l'apport a sa propre section (20), et le
             montant à financer s'en déduit. Les mettre ici mélangeait trois
             chiffres là où elle n'en demande qu'un. */}
      ${'' /* ⚠ LE BUDGET SEUL, ET IL LE RESTE. Le montant à financer se déduit
             dans l'ombre (`lier`) mais ne s'affiche PAS ici : il n'a de sens
             qu'à côté de l'apport, question 20. Les faire apparaître dès la
             première frappe ramenait les trois chiffres à l'étape du projet —
             exactement le mélange qu'Élodie a fait retirer. */}
      <div class="lrc-grille est-deux">
        ${champ('montant_projet', rachat ? 'Capital restant dû' : 'Le budget du projet', { type: 'number', ph: '300 000', suffixe: '€' })}
      </div>
      ${rachat ? `<div class="lrc-grille est-deux">${champ('taux_actuel', 'À quel taux est-il aujourd’hui ?', { ph: '3,45 % — ou « inconnu »' })}</div>` : ''}
      ${'' /* 7 */}${ouinon('travaux', 'Des travaux sont-ils prévus ?')}
      ${q.travaux === 'Oui' ? `<div class="lrc-grille est-deux">${champ('travaux', 'Combien', { type: 'number', ph: '20 000', suffixe: '€' })}</div>` : ''}
      ${'' /* 8 */}<h4>Il emprunte seul ou à deux ?</h4>${puces('emprunteurs', EMPRUNTEURS, v.emprunteurs)}
      ${'' /* 9 */}<h4>Aujourd’hui, il est…</h4>${puces('logement_actuel', LOGEMENTS, v.logement_actuel)}
      ${'' /* 10 */}<div class="lrc-grille est-deux">
        ${champ('enfants_a_charge', 'Personnes à charge (enfants)', { type: 'number', ph: '0' })}
      </div>
      ${'' /* Ce que le simulateur demande en plus et qu'Élodie n'a pas listé :
             replié, jamais perdu. Un dossier qui en porte une s'ouvre dessus. */}
      ${replie('logement', 'Son logement actuel en détail', `
        <div class="lrc-grille est-deux">
          ${champ('loyer_actuel', proprio ? 'Sa mensualité de crédit' : 'Son loyer actuel',
            { type: 'number', ph: proprio ? '950' : '800', suffixe: '€ / mois' })}
          ${proprio ? champ('crd_rp', 'Capital restant dû sur ce bien', { type: 'number', ph: '120 000', suffixe: '€' }) : ''}
        </div>
        ${proprio ? `<h4>Que compte-t-il en faire ?</h4>${puces('devenir_rp', DEVENIR_RP, v.devenir_rp)}` : ''}
        ${v.devenir_rp === 'Vente prévue' ? `<div class="lrc-grille est-deux">
            ${champ('valeur_rp', 'À combien l’estime-t-il ?', { type: 'number', ph: '250 000', suffixe: '€' })}
          </div>
          <h4>Où en est cette vente ?</h4>${puces('vente_avancement', VENTE_AVANCEMENT, v.vente_avancement)}
          <h4>Un prêt relais est-il envisagé ?</h4>${puces('pret_relais', PRET_RELAIS, v.pret_relais)}` : ''}
        ${'' /* ⚠ L'APPORT DÉGAGÉ PAR LA VENTE SE CALCULE, IL NE SE SAISIT PAS :
               c'est 70 % de la valeur estimée moins le capital restant dû, la
               formule du simulateur (`apportVente`). Le demander serait faire
               faire au courtier une soustraction que l'écran sait poser — et
               deux chiffres qui doivent s'accorder finissent toujours par
               diverger. Il s'affiche dès que la valeur est connue. */}
        <div id="lrc-vente-apport">${v.devenir_rp === 'Vente prévue' && nombre(v.valeur_rp) ? `<p class="lrc-lien">${apportVente() > 0
          ? `La vente dégagerait environ <b>${esc(eur(apportVente()))}</b> d’apport — 70 % de la valeur estimée, moins le capital restant dû.`
          : 'La vente ne dégagerait aucun apport : le capital restant dû dépasse 70 % de la valeur estimée.'}</p>` : ''}</div>
        ${v.devenir_rp === 'Mise en location prévue' ? `<div class="lrc-grille est-deux">
          ${champ('loyer_espere_rp', 'Quel loyer en espère-t-il ?', { type: 'number', ph: '750', suffixe: '€ / mois' })}
        </div>` : ''}`)}`;
    }

    // ========================= SITUATION PERSONNELLE ET PROFESSIONNELLE (11, 12)
    if (E === 'perso') return `
      <div class="lrc-grille est-deux">${champ('age_1', 'Son âge', { type: 'number', ph: '35' })}</div>
      <h4>Sa situation professionnelle</h4>${puces('statut_1', STATUTS, v.statut_1)}
      ${aDeux ? `<h4>Le second emprunteur</h4>
        <div class="lrc-grille est-deux">${champ('age_2', 'Son âge', { type: 'number', ph: '33' })}</div>
        <h4>Sa situation professionnelle</h4>${puces('statut_2', STATUTS, v.statut_2)}`
        : '<p class="lrc-lien">Le second emprunteur apparaîtra ici si vous répondez « à deux » à la question 8.</p>'}`;

    // ===================================================== REVENUS (13 à 16)
    if (E === 'revenus') return `
      ${'' /* 13 et 14 */}
      <div class="lrc-grille est-deux">
        ${champ('salaire_1', 'Salaire net mensuel', { type: 'number', ph: '2 400', suffixe: '€ / mois' })}
        ${champ('primes_1', 'Primes / 13e mois', { type: 'number', ph: '0', suffixe: '€ / an' })}
      </div>
      ${aDeux ? `<h4>Le second emprunteur</h4><div class="lrc-grille est-deux">
        ${champ('salaire_2', 'Salaire net mensuel', { type: 'number', ph: '2 200', suffixe: '€ / mois' })}
        ${champ('primes_2', 'Primes / 13e mois', { type: 'number', ph: '0', suffixe: '€ / an' })}
      </div>` : ''}
      <div class="lrc-grille est-deux">
        ${champ('revenus_foyer', 'Revenus nets du foyer', { type: 'number', ph: '4 500', suffixe: '€ / mois' })}
      </div>
      <p class="lrc-lien">C’est ce total qui sert au calcul d’endettement. Il se remplit tout seul à partir des salaires et des primes.</p>
      ${'' /* 15 — chaque bien détaillé, comme sur le site : loyer, valeur,
             capital restant dû et mensualité. Jusqu'à six, comme lui. */}
      ${ouinon('locatif', 'Possède-t-il des biens en location ?')}
      ${q.locatif === 'Oui' ? `${biens.map((b, i) => `
        <h4>Bien ${i + 1}${biens.length > 1 ? ` sur ${biens.length}` : ''}
          <button type="button" class="lrc-oter" data-oter-bien="${i}" title="Retirer ce bien">retirer</button></h4>
        <div class="lrc-grille est-deux">
          ${champBien(i, 'loyer', 'Loyer perçu', '650', '€ / mois')}
          ${champBien(i, 'valeur', 'Valeur du bien', '180 000', '€')}
          ${champBien(i, 'crd', 'Capital restant dû', '90 000', '€')}
          ${champBien(i, 'mensualite', 'Mensualité du crédit', '450', '€ / mois')}
        </div>`).join('')}
        ${biens.length < 6 ? '<button type="button" class="lrc-ajouter" data-ajouter-bien>+ Ajouter un bien</button>' : '<p class="lrc-lien">Six biens au maximum, comme sur le simulateur.</p>'}`
        : ''}
      ${'' /* 16 */}${ouinon('autres', 'A-t-il d’autres revenus réguliers ?')}
      ${q.autres === 'Oui' ? `<h4>Lesquels ?</h4>${puces('type_autres_revenus', AUTRES_REVENUS, v.type_autres_revenus)}
        <div class="lrc-grille est-deux">
          ${champ('autres_revenus', 'À combien par mois', { type: 'number', ph: '0', suffixe: '€ / mois' })}
        </div>` : ''}`;

    // ================================================= PRÊT À TAUX ZÉRO (17)
    // ⚠ LA SECTION NE S'OUVRE QUE SI LE PRÊT EST POSSIBLE, et les trois
    // conditions sont celles du simulateur (`ptzPossible`) : une résidence
    // principale, un bien neuf ou un terrain + construction, et quelqu'un qui
    // n'a pas été propriétaire de sa résidence principale ces deux dernières
    // années. Ailleurs, la poser ferait remplir trois cases pour rien.
    if (E === 'ptz') {
      if (!ptzPossible()) return `
        <p class="lrc-note">Le prêt à taux zéro ne s’applique pas à ce dossier : il demande une
        <b>résidence principale</b>, un <b>appartement neuf</b> ou un <b>terrain + construction</b>,
        et quelqu’un qui n’a <b>pas été propriétaire de sa résidence principale ces 2 dernières années</b>.
        Ces trois réponses se donnent à l’étape « Projet ».</p>`;
      return `
      <div class="lrc-grille est-deux">
        ${champ('ville_projet', 'Commune du bien', { ph: 'Saint-Denis' })}
        ${champ('ptz_rfr', 'Revenu fiscal de référence', { type: 'number', ph: '32 000', suffixe: '€' })}
      </div>
      <div class="lrc-grille est-deux">
        ${champ('ptz_occupants', 'Personnes qui vivront dans le logement', { type: 'number', ph: '3' })}
      </div>
      <p class="lrc-lien">La commune donne la zone, le revenu fiscal donne la tranche : le simulateur du site en déduit le montant.</p>`;
    }

    // ===================================================== CHARGES (18, 19)
    if (E === 'charges') return `
      ${'' /* 18 */}${ouinon('credits', 'A-t-il des crédits en cours ?')}
      ${q.credits === 'Oui' ? `${credits.map((c, i) => `
        <div class="lrc-grille est-deux">
          ${champCredit(i)}
          ${champCreditMontant(i)}
        </div>`).join('')}
        ${credits.length < 12 ? '<button type="button" class="lrc-ajouter" data-ajouter-credit>+ Ajouter un crédit</button>' : ''}
        <h4>Un regroupement de crédits l’intéresserait-il ?</h4>${puces('regroupement', OUI_NON, v.regroupement)}` : ''}
      ${'' /* 19 */}${ouinon('pension', 'Verse-t-il une pension alimentaire ?')}
      ${q.pension === 'Oui' ? `<div class="lrc-grille est-deux">
        ${champ('pension_versee', 'Combien par mois', { type: 'number', ph: '200', suffixe: '€ / mois' })}
      </div>` : ''}`;

    // ====================================================== APPORT (20, 21)
    if (E === 'apport') return `
      <div class="lrc-grille est-deux">
        ${champ('apport', 'Son apport personnel', { type: 'number', ph: '30 000', suffixe: '€' })}
        ${champ('epargne_restante', 'Épargne restante après apport', { type: 'number', ph: '10 000', suffixe: '€' })}
      </div>
      ${'' /* Le montant à financer vit ICI, à côté de l'apport qui le décide,
             et nulle part ailleurs. Il reste modifiable : certains montages
             empruntent plus que le prix (frais inclus). */}
      <div class="lrc-grille est-deux">
        ${champ('montant_financement', 'Montant à financer', { type: 'number', ph: '270 000', suffixe: '€' })}
      </div>
      ${v.montant_projet ? `<p class="lrc-lien">Budget du projet : <b>${esc(eur(nombre(v.montant_projet)))}</b> —
        reste <b>${esc(eur(Math.max(0, (nombre(v.montant_projet) || 0) - (nombre(v.apport) || 0))))}</b> à financer.</p>` : ''}
      ${'' /* ⚠ L'APPORT ATTENDU NE SE TAPE PAS, IL SE DIT. Même règle que le
             simulateur : 10 % du budget, 5 % dans le neuf. Et la question qui
             suit n'a de sens que si l'apport est court — on ne demande pas un
             complément à quelqu'un qui a déjà ce qu'il faut. Le libellé parle
             du MANQUE, pas de la cible : c'est ce que le client doit trouver. */}
      <div id="lrc-apport-plus">${apportCourt() ? `
        <p class="lrc-lien">Les banques attendent en général <b>${esc(eur(apportAttendu()))}</b>
        sur ce projet (${v.type_bien === 'Appartement neuf' ? '5 %' : '10 %'} du budget) :
        il manque <b>${esc(eur(complementApport()))}</b>.</p>
        <h4>Pourrait-il réunir ${esc(eur(complementApport()))} de plus ?</h4>
        ${puces('apport_complement', OUI_NON, v.apport_complement)}
        ${v.apport_complement === 'Oui' ? `<p class="lrc-lien">Apport potentiel :
          <b>${esc(eur(apportAttendu()))}</b> — pas encore constitué.</p>` : ''}` : ''}
      ${'' /* Un apport qui dépasse le prix du bien est presque toujours
             l'épargne totale saisie à la place de l'apport. On le fait
             confirmer plutôt que de le laisser passer. */}
      ${apportIncoherent() ? `
        <h4>Son apport dépasse le budget du projet — est-ce bien exact ?</h4>
        <p class="lrc-note">Apport annoncé <b>${esc(eur(nombre(v.apport)))}</b> pour un projet de
        <b>${esc(eur(nombre(v.montant_projet)))}</b>. Si c’est son épargne totale, corrigez le champ ci-dessus :
        l’apport, c’est seulement ce qu’il met dans cet achat.</p>
        ${puces('apport_superieur', OUI_NON, v.apport_superieur)}` : ''}</div>
      ${replie('assurance', 'Assurance emprunteur', `<div class="lrc-grille est-deux">
        ${champ('assurance', 'Ce qu’elle coûte', { ph: '32 €/mois (0,25 %)' })}
      </div>`)}`;

    // ======================================================= FINANCEMENT (22)
    if (E === 'financement') return `
      ${puces('duree', DUREES, v.duree)}
      <div class="lrc-calcul" id="lrc-calcul">${panneau()}</div>`;

    // ==================================================== COORDONNÉES (fin)
    if (E === 'coordonnees') {
      const d = doublon();
      return `
      <div class="lrc-grille">
        ${champ('first_name', 'Prénom')}${champ('last_name', 'Nom')}
        ${champ('phone', 'Téléphone', { type: 'tel', ph: '06 12 34 56 78' })}${champ('email', 'E-mail', { type: 'email', ph: 'nom@exemple.fr' })}
      </div>
      <p class="lrc-lien ${manque().length ? 'est-manque' : 'est-bon'}" id="lrc-manque">${esc(ditManque())}</p>
      <div id="lrc-doublon">${d ? `<p class="lrc-note est-doublon">Déjà dans la base de La Référence Courtage : <b>${esc(contactName(d))}</b>. ${edition ? 'Vérifiez qu’il ne s’agit pas de la même personne.' : 'La demande sera rattachée à sa fiche, rien ne sera créé en double.'}</p>` : ''}</div>
      ${replie('adresse', 'Son adresse', `<div class="lrc-grille">
        ${champ('address', 'Adresse', { ph: '30 rue …' })}
        <div class="lrc-grille est-cp">${champ('postal_code', 'Code postal', { ph: '06000' })}${champ('city', 'Ville', { ph: 'Nice' })}</div>
      </div>`)}
      <h4>Comment nous a-t-il connus ?</h4>${tuiles('canal', ORIGINES.map(([l, i, c]) => [c, i, '', l]), v.canal)}
      ${v.canal === 'Partenaire / apporteur' ? `<label class="lrc-champ large"><span>Apporteur d’affaires</span>
        <select name="apporteur"><option value="">— Choisir —</option>${apporteurs().map(o => `<option value="${esc(o.id)}" ${v.apporteur === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>` : ''}
      <label class="lrc-champ large"><span>Ce qu’il a dit</span><textarea name="message" rows="3" placeholder="Sa situation, ses délais, ce qui l’inquiète…">${esc(v.message)}</textarea></label>
      <div class="lrc-recap">${recap()}</div>`;
    }
    const c = CONTACTS.find(x => x[0] === v.contact);
    const dates = [['Aujourd’hui', 0], ['Demain', 1], ['Dans 2 jours', 2], ['Dans 1 semaine', 7]];
    const collegues = scope.collegues?.() || [];
    return `
      ${tuiles('contact', CONTACTS.map(([k, l, i]) => [k, i, '', l]), v.contact)}
      ${c && c[3] ? `
        <h4>Quand ?</h4>
        <div class="lrc-puces">${dates.map(([l, n]) => { const j = jourLocal(new Date(Date.now() + n * 86400000)); return `<button type="button" class="lrc-puce ${v.jour === j ? 'on' : ''}" data-jour="${j}">${l}</button>`; }).join('')}
          <input type="date" name="jour" value="${esc(v.jour)}" class="lrc-date"></div>
        <h4>À quelle heure ?</h4>
        <div class="lrc-puces">${HEURES.map(h => `<button type="button" class="lrc-puce ${v.heure === h ? 'on' : ''}" data-heure="${h}">${h}</button>`).join('')}
          <input type="time" name="heure" value="${esc(v.heure)}" class="lrc-date"></div>
        ${collegues.length > 1 ? `<label class="lrc-champ"><span>Qui s’en charge ?</span><select name="responsable">${collegues.map(u => `<option value="${esc(u.id)}" ${v.responsable === u.id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></label>` : ''}` : ''}
      <div class="lrc-recap">${recap()}</div>`;
  };

  // La phrase que le simulateur compose pour chaque emprunteur, à l'identique :
  // « 25 ans, CDI, 2 400 € /mois + primes 5 000 € /an ». Elle est ce que la
  // fiche montre, donc elle doit s'écrire pareil des deux côtés.
  const ditEmprunteur = (n) => {
    const age = nombre(v[`age_${n}`]);
    const st = v[`statut_${n}`];
    const sal = nombre(v[`salaire_${n}`]);
    const pr = nombre(v[`primes_${n}`]);
    if (!age && !st && !sal) return '';
    const bout = [age ? `${age} ans` : '', st, sal ? `${eur(sal)} /mois` : ''].filter(Boolean);
    return bout.join(', ') + (pr ? ` + primes ${eur(pr)} /an` : '');
  };
  const nomComplet = () => [v.first_name.trim(), v.last_name.trim()].filter(Boolean).join(' ');
  const libelleAction = () => {
    const c = CONTACTS.find(x => x[0] === v.contact);
    if (!c || !c[3]) return '';
    return c[0] === 'rappel' ? `Rappeler ${nomComplet() || 'le prospect'}` : `${c[1]} — ${nomComplet() || 'prospect'}`;
  };
  function recap() {
    const fin = FINANCEMENTS.find(f => f[0] === v.type_financement);
    const montant = nombre(v.montant_financement);
    const action = libelleAction();
    return `<b>${edition ? 'Ce qui sera mis à jour' : 'Ce qui sera créé'}</b>
      <span>Le prospect <b>${esc(nomComplet() || '—')}</b>${!edition && doublon() ? ' (fiche existante)' : ''}</span>
      <span>Le dossier <b>${esc([fin ? (fin[3] || fin[0]) : 'Courtage', v.objectif].filter(Boolean).join(' · '))}</b>${montant ? ` — ${esc(eur(montant))} à financer` : ''}${edition ? '' : ', en « Nouveau lead »'}</span>
      ${action ? `<span>L’action <b>${esc(action)}</b> le ${esc(new Date(v.jour + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))} à ${esc(v.heure)}</span>` : `<span>${edition ? 'Aucune action ajoutée' : 'Aucune action programmée'}</span>`}`;
  }

  const draw = () => {
    const e = ETAPES[etape];
    hote.innerHTML = `
      <aside class="lrc-etapes">${ETAPES.map((x, i) => `
        <button type="button" class="lrc-etape ${i === etape ? 'on' : ''} ${i < etape ? 'fait' : ''}" data-aller="${i}">
          <span class="lrc-num">${i + 1}</span><span><b>${esc(x.titre)}</b>${i === etape ? `<em>${reponses(i)} réponses</em>` : ''}</span></button>`).join('')}
        <div class="lrc-astuce"><span class="lrc-ico">${ico('cible')}</span><b>${edition ? 'Enregistrer à tout moment' : 'Créer à tout moment'}</b><em>${edition ? 'Les changements valent pour la base de données et la pipeline : c’est le même dossier.' : 'Seuls un nom et un moyen de contact sont indispensables.'}</em></div>
      </aside>
      <section class="lrc-carte">
        <div class="lrc-carte-tete"><span class="lrc-rubrique">${esc(e.titre)}</span><span class="lrc-compteur">${etape + 1} / ${ETAPES.length}</span></div>
        ${etape ? '<button type="button" class="lrc-retour" data-retour>← Retour</button>' : ''}
        <h3>${esc(e.question)}</h3>
        <p class="lrc-aide">${esc(e.aide)}</p>
        <div class="lrc-corps">${corps()}</div>
        <div class="lrc-pied">
          <button type="button" class="lrc-annuler" data-annuler>Annuler</button>
          <span class="lrc-erreur" id="lrc-erreur"></span>
          ${etape < ETAPES.length - 1 ? '<button type="button" class="lrc-btn est-second" data-suivant>Suivant →</button>' : ''}
          <button type="button" class="lrc-btn" data-creer>${libCreer}</button>
        </div>
      </section>`;
    brancher();
  };

  // Les saisies au clavier vivent dans `v` sans redessiner (on perdrait le curseur) ;
  // seuls les choix par tuile ou par puce redessinent.
  // ⚠ UN SEUL ENDROIT RANGE UNE CASE, et c'est tout l'objet de cette fonction.
  // Le gestionnaire de frappe faisait `v[el.name] = el.value` pour n'importe
  // quel champ : il CRÉAIT donc `v.bien_0_loyer` à la première lettre tapée, et
  // le test `el.name in v` d'ici devenait vrai — la valeur n'arrivait jamais
  // dans la liste des biens. Symptôme : ajouter un second bien effaçait le
  // loyer du premier. Attrapé par le banc d'essai, invisible à la relecture.
  const poserChamp = (el) => {
    // Les cases des biens locatifs et des crédits vivent dans leurs listes,
    // pas dans `v` : leur nom porte le rang et la colonne. On les teste EN
    // PREMIER, avant toute écriture dans `v`.
    const b = /^bien_(\d+)_(loyer|valeur|crd|mensualite)$/.exec(el.name);
    if (b) { if (biens[+b[1]]) biens[+b[1]][b[2]] = el.value; return; }
    const c = /^credit_(\d+)_(type|montant)$/.exec(el.name);
    if (c) { if (credits[+c[1]]) credits[+c[1]][c[2]] = el.value; return; }
    if (el.name in v) v[el.name] = el.value;
  };
  function lireChamps() {
    hote.querySelectorAll('input[name], select[name], textarea[name]').forEach(poserChamp);
    // Le total des loyers suit le détail : c'est lui que lisent la fiche et le
    // simulateur (`revenus_locatifs`), le détail n'en est que la justification.
    if (q.locatif === 'Oui') {
      const t = biens.reduce((n, b) => n + (nombre(b.loyer) || 0), 0);
      if (t) v.revenus_locatifs = String(t);
    }
    if (q.credits === 'Oui') {
      const t = credits.reduce((n, c) => n + (nombre(c.montant) || 0), 0);
      if (t) v.credits_en_cours = String(t);
      const d = credits.filter(c => c.type || nombre(c.montant))
        .map(c => [c.type, nombre(c.montant) ? `${nombre(c.montant)} € /mois` : ''].filter(Boolean).join(' '))
        .filter(Boolean).join(', ');
      if (d) v.detail_credits = d;
    }
  }
  // Les choix (tuiles et puces) d'une portion de l'écran — `brancher()` les
  // reprend tous, et le rafraîchissement partiel de l'apport ceux de sa zone.
  const brancherChoix = (racine) => racine.querySelectorAll('[data-choix]').forEach(b => b.onclick = () => {
    lireChamps();
    const k = b.dataset.choix;
    v[k] = (v[k] === b.dataset.val && k !== 'contact') ? '' : b.dataset.val;
    if (k === 'canal' && v.canal !== 'Partenaire / apporteur') v.apporteur = '';
    draw();
  });
  // ⚠ LA QUESTION DU COMPLÉMENT DOIT APPARAÎTRE PENDANT LA FRAPPE — elle dépend
  // du montant qu'on est en train de taper. Mais un `draw()` complet reposerait
  // le curseur ailleurs à chaque chiffre (le piège du 18/11) : on ne réécrit
  // donc QUE cette zone, et on rebranche ses seuls boutons.
  // Une zone de l'écran réécrite seule, à partir d'un corps neuf. Elle sert aux
  // deux lignes qui dépendent d'un montant qu'on est en train de taper.
  function rafraichirZone(id) {
    const zone = hote.querySelector('#' + id);
    if (!zone) return null;
    const tmp = document.createElement('div');
    tmp.innerHTML = corps();
    zone.innerHTML = tmp.querySelector('#' + id)?.innerHTML || '';
    return zone;
  }
  function rafraichirApport() { const z = rafraichirZone('lrc-apport-plus'); if (z) brancherChoix(z); }
  function brancher() {
    brancherChoix(hote);
    // Une question fermée : « Non » referme ET efface ce qu'elle avait ouvert.
    hote.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      lireChamps();
      const k = b.dataset.q;
      q[k] = q[k] === b.dataset.val ? '' : b.dataset.val;
      if (q[k] !== 'Oui') for (const c of (VIDER[k] || [])) v[c] = '';
      draw();
    });
    hote.querySelector('[data-ajouter-bien]')?.addEventListener('click', () => {
      lireChamps();
      if (biens.length < LOC_MAX) biens.push({ loyer: '', valeur: '', crd: '', mensualite: '' });
      draw();
    });
    hote.querySelectorAll('[data-oter-bien]').forEach(b => b.onclick = () => {
      lireChamps();
      biens.splice(Number(b.dataset.oterBien), 1);
      if (!biens.length) biens.push({ loyer: '', valeur: '', crd: '', mensualite: '' });
      // Le total doit suivre une suppression, sinon il garde le loyer d'un bien
      // qui n'existe plus — et `lireChamps` ne baisse jamais un total.
      v.revenus_locatifs = String(biens.reduce((n, x) => n + (nombre(x.loyer) || 0), 0) || '');
      draw();
    });
    hote.querySelector('[data-ajouter-credit]')?.addEventListener('click', () => {
      lireChamps();
      if (credits.length < CRED_MAX) credits.push({ type: '', montant: '' });
      draw();
    });
    hote.querySelectorAll('[data-oter-credit]').forEach(b => b.onclick = () => {
      lireChamps();
      credits.splice(Number(b.dataset.oterCredit), 1);
      if (!credits.length) credits.push({ type: '', montant: '' });
      v.credits_en_cours = String(credits.reduce((n, x) => n + (nombre(x.montant) || 0), 0) || '');
      v.detail_credits = credits.filter(c => c.type || nombre(c.montant))
        .map(c => [c.type, nombre(c.montant) ? `${nombre(c.montant)} € /mois` : ''].filter(Boolean).join(' '))
        .filter(Boolean).join(', ');
      draw();
    });
    hote.querySelectorAll('[data-repli]').forEach(b => b.onclick = () => {
      lireChamps();
      const k = b.dataset.repli;
      if (ouverts.has(k)) ouverts.delete(k); else ouverts.add(k);
      draw();
    });
    hote.querySelectorAll('[data-jour]').forEach(b => b.onclick = () => { lireChamps(); v.jour = b.dataset.jour; draw(); });
    hote.querySelectorAll('[data-heure]').forEach(b => b.onclick = () => { lireChamps(); v.heure = b.dataset.heure; draw(); });
    hote.querySelectorAll('[data-aller]').forEach(b => b.onclick = () => { lireChamps(); etape = Number(b.dataset.aller); draw(); });
    hote.querySelector('[data-retour]')?.addEventListener('click', () => { lireChamps(); etape = Math.max(0, etape - 1); draw(); });
    hote.querySelector('[data-suivant]')?.addEventListener('click', () => { lireChamps(); etape = Math.min(ETAPES.length - 1, etape + 1); draw(); });
    hote.querySelector('[data-annuler]').onclick = () => closeModal();
    hote.querySelector('[data-creer]').onclick = creer;
    hote.querySelectorAll('input[name], textarea[name], select[name]').forEach(el => {
      el.addEventListener('input', () => {
        poserChamp(el);
        if (['montant_projet', 'apport', 'montant_financement', 'revenus_foyer', 'credits_en_cours',
          'salaire_1', 'salaire_2', 'primes_1', 'primes_2'].includes(el.name)) lier(el.name);
        if (['apport', 'montant_projet', 'montant_financement'].includes(el.name)) rafraichirApport();
        // ⚠ CELLE-CI AUSSI SE RÉÉCRIT PENDANT LA FRAPPE : mesuré au banc, la
        // ligne « la vente dégagerait… » restait invisible tant qu'on ne
        // cliquait pas ailleurs. Le chiffre était juste et pourtant absent.
        if (['valeur_rp', 'crd_rp'].includes(el.name)) rafraichirZone('lrc-vente-apport');
        const r = hote.querySelector('.lrc-recap'); if (r) r.innerHTML = recap();
        // ⚠ SANS REDESSINER : la ligne se réécrit pendant la frappe, et un
        // `draw()` ici reposerait le curseur ailleurs à chaque lettre tapée.
        const mq = hote.querySelector('#lrc-manque');
        if (mq) { mq.textContent = ditManque(); mq.className = `lrc-lien ${manque().length ? 'est-manque' : 'est-bon'}`; }
      });
      // Le doublon se vérifie en quittant le champ : pendant la frappe, il clignoterait.
      // ⚠ SANS REDESSINER (18/11/2026) : redessiner remettait le curseur dans le
      // téléphone au moment où l'on cliquait l'adresse, et l'adresse partait dans
      // le téléphone. Seul l'avertissement se met à jour.
      if (['email', 'phone'].includes(el.name)) el.addEventListener('change', () => {
        lireChamps();
        const zone = hote.querySelector('#lrc-doublon');
        if (zone) { const tmp = document.createElement('div'); tmp.innerHTML = corps(); zone.innerHTML = tmp.querySelector('#lrc-doublon')?.innerHTML || ''; }
        const r = hote.querySelector('.lrc-recap'); if (r) r.innerHTML = recap();
      });
      if (el.type === 'date' || el.type === 'time' || el.tagName === 'SELECT') el.addEventListener('change', () => { lireChamps(); draw(); });
    });
    hote.querySelector('.lrc-corps input[name]:not([type="date"]):not([type="time"])')?.focus();
  }

  async function creer() {
    if (enCours) return;
    lireChamps();
    const err = hote.querySelector('#lrc-erreur');
    const t = telNet(v.phone);
    // ⚠ LA PREMIÈRE ÉTAPE, PAS LA TROISIÈME : « Le prospect » a pris la tête du
    // parcours le 19/11/2026. Laisser `2` ici aurait renvoyé sur les chiffres
    // en annonçant qu'il manque un nom — l'écran et le message se seraient
    // contredits, et c'est précisément le genre de défaut muet qu'un numéro
    // d'étape écrit en dur fabrique.
    if (!v.first_name.trim() && !v.last_name.trim()) { etape = 0; draw(); hote.querySelector('#lrc-erreur').textContent = 'Il faut au moins un nom.'; return; }
    if (t.length < 9 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) {
      etape = 0; draw(); hote.querySelector('#lrc-erreur').textContent = 'Il faut un téléphone ou un e-mail valable.'; return;
    }
    enCours = true;
    hote.querySelector('[data-creer]').disabled = true;
    try {
      // 1. Le contact. En modification, c'est celui du dossier qu'on réécrit.
      const coord = {
        first_name: v.first_name.trim(), last_name: v.last_name.trim() || '—',
        phone: v.phone.trim() || null, email: v.email.trim() || null,
        address: v.address.trim() || null, postal_code: v.postal_code.trim() || null, city: v.city.trim() || null,
        channel: v.canal || null,
      };
      let c = edition ? fiche : doublon();
      if (edition && c) { await db.update('contacts', c.id, coord); c = db.byId('contacts', c.id) || c; }
      else if (edition && !c) c = await db.insert('contacts', { ...coord, type: 'Prospect', activities: [KEY], owner_id: v.responsable || moi });
      if (!c) {
        c = await db.insert('contacts', {
          ...coord, type: 'Prospect', activities: [KEY], owner_id: v.responsable || moi,
        });
      }
      // 2. Le dossier. Les champs du schéma d'abord (ils nourrissent les filtres et
      //    la fiche), puis ce que la fiche « Le projet en détail » sait lire.
      const k = calculs();
      const saisis = {
        type_financement: v.type_financement, objectif: v.objectif, projet: v.objectif,
        montant_projet: nombre(v.montant_projet), apport: nombre(v.apport),
        montant_financement: nombre(v.montant_financement),
        mensualite: k.mens, endettement: k.endet, capacite: k.capa, credits_en_cours: nombre(v.credits_en_cours),
        avancement: v.avancement, duree: v.duree, emprunteurs: v.emprunteurs,
        revenus_foyer: nombre(v.revenus_foyer), ville: v.ville_projet.trim(), message: v.message.trim(),
        // 18/11/2026 — les mêmes clés que celles posées par le simulateur
        // (fonction `simulateur-courtage`), pour que la fiche n'ait qu'une
        // ligne par question, d'où que vienne la réponse.
        // ⚠ CHACUNE DOIT FIGURER DANS `fn_fields_whitelist` : une clé qui n'y
        // est pas est écartée sans la moindre erreur. Elles y sont toutes
        // depuis la migration 20261118193000.
        type_bien: v.type_bien, primo: v.primo, travaux: nombre(v.travaux),
        epargne_restante: nombre(v.epargne_restante),
        autres_revenus: nombre(v.autres_revenus),
        revenus_locatifs: nombre(v.revenus_locatifs),
        pension_versee: nombre(v.pension_versee),
        detail_credits: v.detail_credits.trim(),
        logement_actuel: v.logement_actuel,
        loyer_actuel: nombre(v.loyer_actuel),
        // ⚠ `nombre()` REFUSE ZÉRO (il ne garde que les valeurs > 0), et « 0
        // enfant » est une réponse, pas une absence de réponse. D'où la
        // chaîne : elle s'affiche, et le champ cesse de paraître non rempli.
        enfants_a_charge: String(v.enfants_a_charge).trim(),
        // 19/11/2026 — LES QUESTIONS DU SIMULATEUR QUE LE FORMULAIRE NE POSAIT
        // PAS (Élodie : « il manque beaucoup d'informations »). Les clés sont
        // celles du RÉCAPITULATIF du simulateur, relevées dans sa fonction
        // `recap()` : `logement_actuel_devenir`, `vente_capital_restant_du`…
        // Les reprendre à l'identique est ce qui fait qu'une fiche se lit
        // pareil, qu'elle vienne du site ou du téléphone.
        //
        // ⚠ QUATORZE DE CES LIGNES N'ARRIVENT PAS ENCORE DU SITE : le
        // simulateur les met dans le mail interne et sa fonction ne les
        // recopie pas dans le dossier. Le formulaire, lui, les écrit — et
        // chacune doit entrer dans `fn_fields_whitelist`, sans quoi elle est
        // écartée sans un mot. C'est le piège du 18/11, refermé une 3e fois.
        region: v.region,
        taux_actuel: v.taux_actuel.trim(),
        statut_1: v.statut_1, statut_2: v.statut_2,
        age_1: nombre(v.age_1), age_2: nombre(v.age_2),
        salaire_1: nombre(v.salaire_1), salaire_2: nombre(v.salaire_2),
        primes_1: nombre(v.primes_1), primes_2: nombre(v.primes_2),
        type_autres_revenus: v.type_autres_revenus,
        logement_actuel_devenir: v.devenir_rp,
        logement_actuel_valeur: nombre(v.valeur_rp),
        logement_actuel_loyer_espere: nombre(v.loyer_espere_rp),
        vente_avancement: v.vente_avancement,
        vente_capital_restant_du: nombre(v.crd_rp),
        pret_relais: v.pret_relais,
        regroupement_credits: v.regroupement,
        // 19/11/2026 — LES SIX DERNIÈRES, chacune dans SA section (Élodie :
        // « mets-les dans les bonnes catégories et ne mélange pas tout »).
        // ⚠ QUATRE SUR SIX SONT DES CALCULS, pas des champs : elles se
        // déduisent de ce qui est déjà saisi, exactement comme le simulateur
        // les déduit. Les faire taire à la main aurait mis deux chiffres
        // contradictoires sur la même fiche.
        // ⚠ ET PAS `apportVente()` TOUT COURT : il rend 0 quand il n'y a pas de
        // vente, et 0 s'écrit (seuls '' et null s'effacent) — la ligne serait
        // apparue sur tous les dossiers. Une vente qui ne dégage rien, elle,
        // est une information : le simulateur l'écrit en toutes lettres.
        apport_degage_par_la_vente: apportVente() || (v.devenir_rp === 'Vente prévue' && nombre(v.valeur_rp)
          ? 'aucun — le capital restant dû dépasse 70 % de la valeur' : null),
        nombre_de_credits: q.credits === 'Oui'              // combien, pas le total
          ? String(credits.filter(c => nombre(c.montant)).length) : '',
        apport_attendu: apportCourt() ? apportAttendu() : null,
        apport_potentiel: (apportCourt() && v.apport_complement === 'Oui') ? apportAttendu() : null,
        apport_complement_possible: apportCourt() ? v.apport_complement : '',
        apport_confirme_superieur: apportIncoherent() && v.apport_superieur === 'Oui'
          ? 'Oui — le client confirme un apport supérieur au prix du bien'
          : (apportIncoherent() ? v.apport_superieur : ''),
        assurance: v.assurance.trim(),
        ptz_rfr: nombre(v.ptz_rfr), ptz_occupants: nombre(v.ptz_occupants),
        // ⚠ LE DÉTAIL DES BIENS ET DES CRÉDITS EST ÉCRIT EN JSON, à côté des
        // totaux que lisent déjà la fiche et le simulateur. Les totaux restent
        // la vérité affichée ; le détail est ce qui permet de les rouvrir et
        // de les corriger un par un, sans retaper.
        biens_locatifs: q.locatif === 'Oui'
          ? JSON.stringify(biens.filter(b => nombre(b.loyer) || nombre(b.valeur) || nombre(b.crd) || nombre(b.mensualite))) : '',
        liste_credits: q.credits === 'Oui'
          ? JSON.stringify(credits.filter(c => c.type || nombre(c.montant))) : '',
        // ⚠ `emprunteur_1` / `emprunteur_2` SE COMPOSENT MAINTENANT, comme le
        // simulateur les compose : « 35 ans, CDI, 2 400 € /mois ». C'est cette
        // phrase que la fiche affiche et que le courtier relit des mois plus
        // tard ; la laisser en saisie libre faisait écrire la même chose de
        // quinze façons. Si rien n'est renseigné, l'ancienne valeur tient.
        emprunteur_1: ditEmprunteur(1) || v.emprunteur_1.trim(),
        emprunteur_2: v.emprunteurs === 'Deux' ? (ditEmprunteur(2) || v.emprunteur_2.trim()) : '',
        source: 'Saisie CRM',
      };
      // En modification : ce qui est vidé s'efface, ce que le formulaire ne connaît
      // pas (verdict du simulateur, banque, pièces…) reste tel quel, et la source
      // d'origine n'est pas remplacée.
      if (edition) delete saisis.source;
      const base = edition ? { ...f0 } : {};
      for (const [cle, x] of Object.entries(saisis)) {
        if (x === '' || x === null || x === undefined) {
          // `projet` d'une simulation n'est effacé que si le formulaire l'avait repris.
          if (cle === 'projet' && edition && !objectif0) continue;
          delete base[cle];
        } else base[cle] = x;
      }
      const fields = base;
      const fin = FINANCEMENTS.find(f => f[0] === v.type_financement);
      const titre = `${fin ? (fin[3] || fin[0]) : 'Courtage'} — ${nomComplet() || contactName(c)}`;
      const maintenant = new Date().toISOString();
      let d;
      if (edition) {
        // Le titre d'une simulation garde son verdict ; les autres suivent le formulaire.
        const garderTitre = /^Simulateur/i.test(dossier.title || '');
        await db.update('deals', dossier.id, {
          ...(garderTitre ? {} : { title: titre }), contact_id: c.id, owner_id: v.responsable || dossier.owner_id,
          channel: v.canal || null, referrer_org_id: v.apporteur || null, fields,
        });
        d = db.byId('deals', dossier.id) || dossier;
      } else d = await db.insert('deals', {
        activity: KEY, title: titre, contact_id: c.id, owner_id: v.responsable || moi,
        channel: v.canal || null, referrer_org_id: v.apporteur || null,
        stage: 'lead', status: 'open', fields,
        stage_history: [{ stage: 'lead', at: maintenant }], stage_changed_at: maintenant,
      });
      // 3. Le premier contact.
      const ch = CONTACTS.find(x => x[0] === v.contact);
      if (ch && ch[3]) {
        await db.insert('activities', {
          type: ch[3], title: libelleAction(), deal_id: d.id, contact_id: c.id, activity: KEY,
          due_date: v.jour || null, due_time: v.heure || null,
          assignee_id: v.responsable || moi, done: false, created_by: moi,
        });
      }
      sauve = true;
      closeModal(true);
      toast(edition ? (ch && ch[3] ? 'Dossier mis à jour, action ajoutée' : 'Dossier mis à jour')
        : (ch && ch[3] ? 'Prospect créé, premier contact programmé' : 'Prospect créé'));
      apres?.(d.id);
    } catch (e) {
      enCours = false;
      const b = hote.querySelector('[data-creer]'); if (b) b.disabled = false;
      if (err) err.textContent = `Enregistrement impossible : ${String(e.message || e).slice(0, 140)}`;
    }
  }

  draw();
}
