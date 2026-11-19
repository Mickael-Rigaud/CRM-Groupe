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
const ETAPES = [
  { cle: 'projet', titre: 'Le projet', question: 'Quel est son projet ?', aide: 'Ce qu’il veut financer, et où il en est.' },
  { cle: 'perso', titre: 'Sa situation', question: 'Où en est-il aujourd’hui ?', aide: 'Son logement actuel, et ce qu’il compte en faire.' },
  { cle: 'pro', titre: 'Son métier', question: 'Ce qu’il fait', aide: 'Le statut compte autant que le salaire pour une banque.' },
  { cle: 'revenus', titre: 'Ses revenus', question: 'Ce qui entre chaque mois', aide: 'Salaires, primes, loyers perçus, autres revenus.' },
  { cle: 'charges', titre: 'Ses charges', question: 'Ce qui sort chaque mois', aide: 'Les crédits en cours et les pensions versées.' },
  { cle: 'apport', titre: 'Son apport', question: 'Ce qu’il met sur la table', aide: 'Et ce qui lui reste après.' },
  { cle: 'financement', titre: 'Le financement', question: 'Sur combien de temps ?', aide: 'Le calcul se met à jour à chaque réponse.' },
  { cle: 'coordonnees', titre: 'Ses coordonnées', question: 'Qui est-ce ?', aide: 'Comme sur le simulateur : on les demande à la fin.' },
  { cle: 'rdv', titre: 'Le rendez-vous', question: 'Et ensuite ?', aide: 'Le premier contact devient une action datée dans le CRM.' },
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
    montant_financement: nombreTxt(f0.montant_financement),
    duree: DUREES.includes(f0.duree) ? f0.duree : '', emprunteurs: EMPRUNTEURS.includes(f0.emprunteurs) ? f0.emprunteurs : '',
    revenus_foyer: nombreTxt(f0.revenus_foyer), credits_en_cours: nombreTxt(f0.credits_en_cours),
    ville_projet: txt(f0.ville),
    // 19/11/2026 — les questions du simulateur que le formulaire ne posait pas
    // du tout. Mêmes clés, mêmes libellés : une fiche se lit pareil qu'elle
    // vienne du site ou du téléphone.
    region: REGIONS.includes(f0.region) ? f0.region : '',
    taux_actuel: txt(f0.taux_actuel),
    statut_1: STATUTS.includes(f0.statut_1) ? f0.statut_1 : '',
    statut_2: STATUTS.includes(f0.statut_2) ? f0.statut_2 : '',
    age_1: nombreTxt(f0.age_1), age_2: nombreTxt(f0.age_2),
    salaire_1: nombreTxt(f0.salaire_1), salaire_2: nombreTxt(f0.salaire_2),
    primes_1: nombreTxt(f0.primes_1), primes_2: nombreTxt(f0.primes_2),
    type_autres_revenus: AUTRES_REVENUS.includes(f0.type_autres_revenus) ? f0.type_autres_revenus : '',
    devenir_rp: DEVENIR_RP.includes(f0.logement_actuel_devenir) ? f0.logement_actuel_devenir : '',
    valeur_rp: nombreTxt(f0.logement_actuel_valeur),
    loyer_espere_rp: nombreTxt(f0.logement_actuel_loyer_espere),
    vente_avancement: VENTE_AVANCEMENT.includes(f0.vente_avancement) ? f0.vente_avancement : '',
    crd_rp: nombreTxt(f0.vente_capital_restant_du),
    pret_relais: PRET_RELAIS.includes(f0.pret_relais) ? f0.pret_relais : '',
    regroupement: OUI_NON.includes(f0.regroupement_credits) ? f0.regroupement_credits : '',
    assurance: txt(f0.assurance),
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

  // Les questions RÉELLEMENT posées à cette étape — pas une liste figée.
  // ⚠ LE COMPTEUR MENTAIT : il annonçait « 0/8 réponses » sur l'étape qui en
  // posait dix-huit, et comptait des questions que l'écran ne montrait pas.
  const clesDe = (i) => {
    const rachat = v.type_financement === 'Regroupement de crédits'
      || v.objectif === 'Rachat / renégociation';
    const aDeux = v.emprunteurs === 'Deux';
    const proprio = v.logement_actuel === 'Propriétaire';
    const vend = v.devenir_rp === 'Vente prévue';
    switch (ETAPES[i].cle) {
      case 'projet': return ['type_financement', 'objectif',
        ...(montre('type_bien', immo() && !rachat) ? ['type_bien'] : []),
        ...(montre('avancement', (immo() || pro()) && !rachat) ? ['avancement'] : []),
        ...(montre('primo', immo() && !rachat) ? ['primo'] : []),
        ...(montre('region', immo() && !rachat) ? ['region'] : []),
        'montant_projet', 'apport', 'emprunteurs'];
      case 'perso': return ['logement_actuel', 'loyer_actuel', 'enfants_a_charge',
        ...(montre('devenir_rp', proprio) ? ['devenir_rp'] : []),
        ...(montre('vente_avancement', vend) ? ['vente_avancement', 'valeur_rp'] : [])];
      case 'pro': return ['statut_1', 'age_1', ...(aDeux ? ['statut_2', 'age_2'] : [])];
      case 'revenus': return ['salaire_1', 'revenus_foyer', ...(aDeux ? ['salaire_2'] : [])];
      case 'charges': return [...(q.credits === 'Oui' ? ['credits_en_cours', 'detail_credits'] : []),
        ...(q.pension === 'Oui' ? ['pension_versee'] : []), 'credits_en_cours'].filter((x, j, t) => t.indexOf(x) === j);
      case 'apport': return ['apport', 'epargne_restante'];
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

    // ========================================================= 1. LE PROJET
    // L'ordre est celui du simulateur : ce qu'on finance, le type de bien, où
    // on en est, le premier achat, la région, puis les montants et la durée.
    if (E === 'projet') {
      const rachat = v.type_financement === 'Regroupement de crédits'
        || v.objectif === 'Rachat / renégociation';
      return `
      ${tuiles('type_financement', FINANCEMENTS, v.type_financement)}
      ${v.type_financement || v.objectif ? `<h4>Pour quel projet ?</h4>${puces('objectif', OBJECTIFS(), v.objectif)}` : ''}
      ${montre('type_bien', immo() && !rachat) ? `<h4>Quel type de bien ?</h4>${puces('type_bien', TYPES_BIEN, v.type_bien)}` : ''}
      ${montre('avancement', (immo() || pro()) && !rachat) ? `<h4>Où en est-il ?</h4>${puces('avancement', AVANCEMENTS, v.avancement)}` : ''}
      ${'' /* ⚠ LA QUESTION DU PRIMO EST CELLE DU PTZ, et le simulateur la pose
             en toutes lettres : « avez-vous été propriétaire de votre résidence
             principale au cours des 2 dernières années ? ». « Est-ce son premier
             achat ? » n'est pas la même question — quelqu'un qui a vendu il y a
             cinq ans rachète, et reste primo-accédant au sens du prêt. */}
      ${montre('primo', immo() && !rachat) ? `<h4>Propriétaire de sa résidence principale ces 2 dernières années ?</h4>
        ${puces('primo', OUI_NON, v.primo)}` : ''}
      ${montre('region', immo() && !rachat) ? `<h4>Où se situe le bien ?</h4>${puces('region', REGIONS, v.region)}` : ''}
      ${'' /* ⚠ ON NE CACHE JAMAIS UN CHIFFRE DÉJÀ SAISI. La cascade n'ouvre les
             montants qu'une fois le financement choisi — mais un dossier venu
             du site porte un budget SANS type de financement, et il devenait
             alors invisible : attrapé par le banc d'essai, pas à l'œil. Masquer
             une réponse, c'est l'effacer à l'enregistrement suivant. */}
      ${v.type_financement || v.montant_projet || v.apport || v.montant_financement || v.emprunteurs ? `
        <div class="lrc-grille est-trois">
          ${champ('montant_projet', rachat ? 'Capital restant dû' : 'Le budget du projet', { type: 'number', ph: '300 000', suffixe: '€' })}
          ${champ('apport', 'Apport', { type: 'number', ph: '30 000', suffixe: '€' })}
          ${champ('montant_financement', 'Montant à financer', { type: 'number', ph: '270 000', suffixe: '€' })}
        </div>
        <p class="lrc-lien">Les trois se tiennent : projet = apport + montant à financer. Changez-en un, les autres suivent.</p>
        ${rachat ? `<div class="lrc-grille est-deux">${champ('taux_actuel', 'À quel taux est-il aujourd’hui ?', { ph: '3,45 % — ou « inconnu »' })}</div>` : ''}
        ${ouinon('travaux', 'Des travaux sont-ils prévus ?')}
        ${q.travaux === 'Oui' ? `<div class="lrc-grille est-deux">${champ('travaux', 'Combien', { type: 'number', ph: '20 000', suffixe: '€' })}</div>` : ''}
        <div class="lrc-grille est-deux">${champ('ville_projet', 'Ville du projet', { ph: 'Nice' })}</div>
        <h4>Il emprunte…</h4>${puces('emprunteurs', EMPRUNTEURS, v.emprunteurs)}` : ''}`;
    }

    // ================================================== 2. SA SITUATION PERSO
    // Le logement d'aujourd'hui, ce qu'il compte en faire, et les personnes à
    // charge. Tout ce bloc est en cascade : propriétaire ouvre la mensualité et
    // le devenir du bien, « vendre » ouvre la valeur, la vente et le relais.
    if (E === 'perso') {
      const proprio = v.logement_actuel === 'Propriétaire';
      const vend = v.devenir_rp === 'Vente prévue';
      const loue = v.devenir_rp === 'Mise en location prévue';
      return `
      <h4>Aujourd’hui, il est…</h4>${puces('logement_actuel', LOGEMENTS, v.logement_actuel)}
      ${v.logement_actuel || v.loyer_actuel ? `<div class="lrc-grille est-deux">
        ${champ('loyer_actuel', proprio ? 'Sa mensualité de crédit' : 'Son loyer actuel',
          { type: 'number', ph: proprio ? '950' : '800', suffixe: '€ / mois' })}
      </div>` : ''}
      ${montre('crd_rp', proprio) ? `<div class="lrc-grille est-deux">
        ${champ('crd_rp', 'Capital restant dû sur ce bien', { type: 'number', ph: '120 000', suffixe: '€' })}
      </div>` : ''}
      ${montre('devenir_rp', proprio) ? `<h4>Que compte-t-il en faire ?</h4>${puces('devenir_rp', DEVENIR_RP, v.devenir_rp)}` : ''}
      ${montre('valeur_rp', vend) ? `<div class="lrc-grille est-deux">
        ${champ('valeur_rp', 'À combien l’estime-t-il ?', { type: 'number', ph: '250 000', suffixe: '€' })}
      </div>` : ''}
      ${montre('vente_avancement', vend) ? `<h4>Où en est cette vente ?</h4>${puces('vente_avancement', VENTE_AVANCEMENT, v.vente_avancement)}` : ''}
      ${montre('pret_relais', vend) ? `<h4>Un prêt relais est-il envisagé ?</h4>${puces('pret_relais', PRET_RELAIS, v.pret_relais)}` : ''}
      ${montre('loyer_espere_rp', loue) ? `<div class="lrc-grille est-deux">
        ${champ('loyer_espere_rp', 'Quel loyer en espère-t-il ?', { type: 'number', ph: '750', suffixe: '€ / mois' })}
      </div>` : ''}
      <div class="lrc-grille est-deux">
        ${champ('enfants_a_charge', 'Personnes à charge (enfants)', { type: 'number', ph: '0' })}
      </div>`;
    }

    // ===================================================== 3. SON MÉTIER (PRO)
    // ⚠ UN STATUT CHOISI, PAS UNE PHRASE LIBRE. Le simulateur pose dix statuts
    // et le courtier en déduit le type de contrat des mois plus tard ; « 35 ans,
    // CDI, 3 000 € » tapé à la main ne se filtre ni ne se compte.
    if (E === 'pro') {
      const aDeux = v.emprunteurs === 'Deux';
      return `
      <h4>Sa situation professionnelle</h4>${puces('statut_1', STATUTS, v.statut_1)}
      <div class="lrc-grille est-deux">${champ('age_1', 'Son âge', { type: 'number', ph: '35' })}</div>
      ${aDeux ? `<h4>La situation du second emprunteur</h4>${puces('statut_2', STATUTS, v.statut_2)}
        <div class="lrc-grille est-deux">${champ('age_2', 'Son âge', { type: 'number', ph: '33' })}</div>`
        : `<p class="lrc-lien">Le second emprunteur apparaîtra ici si vous répondez « Deux » à « Il emprunte… », à l’étape du projet.</p>`}`;
    }

    // ======================================================== 4. SES REVENUS
    if (E === 'revenus') {
      const aDeux = v.emprunteurs === 'Deux';
      return `
      <div class="lrc-grille est-deux">
        ${champ('salaire_1', 'Son salaire net mensuel', { type: 'number', ph: '2 400', suffixe: '€ / mois' })}
        ${champ('primes_1', 'Ses primes / 13e mois', { type: 'number', ph: '0', suffixe: '€ / an' })}
      </div>
      ${aDeux ? `<div class="lrc-grille est-deux">
        ${champ('salaire_2', 'Le salaire net du second', { type: 'number', ph: '2 200', suffixe: '€ / mois' })}
        ${champ('primes_2', 'Ses primes / 13e mois', { type: 'number', ph: '0', suffixe: '€ / an' })}
      </div>` : ''}
      ${'' /* `revenus_foyer` reste la ligne que lisent la fiche et le calcul :
             elle se déduit des salaires, ou se saisit seule si on ne les a pas. */}
      <div class="lrc-grille est-deux">
        ${champ('revenus_foyer', 'Revenus nets du foyer', { type: 'number', ph: '4 500', suffixe: '€ / mois' })}
      </div>
      <p class="lrc-lien">C’est ce total qui sert au calcul d’endettement. Il se remplit tout seul à partir des salaires et des primes.</p>
      ${ouinon('locatif', 'Possède-t-il déjà des biens en location ?')}
      ${q.locatif === 'Oui' ? `<div class="lrc-grille est-deux">
        ${champ('revenus_locatifs', 'Loyers perçus en tout', { type: 'number', ph: '600', suffixe: '€ / mois' })}
      </div>` : ''}
      ${ouinon('autres', 'A-t-il d’autres revenus réguliers ?')}
      ${q.autres === 'Oui' ? `<h4>De quelle nature ?</h4>${puces('type_autres_revenus', AUTRES_REVENUS, v.type_autres_revenus)}
        <div class="lrc-grille est-deux">
          ${champ('autres_revenus', 'À combien par mois', { type: 'number', ph: '0', suffixe: '€ / mois' })}
        </div>` : ''}`;
    }

    // ======================================================== 5. SES CHARGES
    if (E === 'charges') return `
      ${ouinon('credits', 'A-t-il des crédits en cours ?')}
      ${q.credits === 'Oui' ? `<div class="lrc-grille est-deux">
        ${champ('credits_en_cours', 'Total des mensualités', { type: 'number', ph: '350', suffixe: '€ / mois' })}
        ${champ('detail_credits', 'Lesquels', { ph: 'Crédit auto 250 €, conso 100 €…' })}
      </div>
      <p class="lrc-lien">Le simulateur détaille jusqu’à douze crédits ; ici une ligne suffit — c’est le total qui entre dans le calcul.</p>
      <h4>Un regroupement de crédits l’intéresserait-il ?</h4>${puces('regroupement', OUI_NON, v.regroupement)}` : ''}
      ${ouinon('pension', 'Verse-t-il une pension alimentaire ?')}
      ${q.pension === 'Oui' ? `<div class="lrc-grille est-deux">
        ${champ('pension_versee', 'Combien par mois', { type: 'number', ph: '200', suffixe: '€ / mois' })}
      </div>` : ''}`;

    // ========================================================= 6. SON APPORT
    if (E === 'apport') return `
      <div class="lrc-grille est-deux">
        ${champ('apport', 'Son apport personnel', { type: 'number', ph: '30 000', suffixe: '€' })}
        ${champ('epargne_restante', 'Épargne restante après apport', { type: 'number', ph: '10 000', suffixe: '€' })}
      </div>
      <p class="lrc-lien">L’apport est repris de l’étape du projet : le changer ici le change là-bas, c’est le même chiffre.</p>
      <div class="lrc-grille est-deux">${champ('assurance', 'Assurance emprunteur', { ph: '32 €/mois (0,25 %)' })}</div>`;

    // ===================================================== 7. LE FINANCEMENT
    if (E === 'financement') return `
      <h4>Sur combien de temps emprunter ?</h4>${puces('duree', DUREES, v.duree)}
      <div class="lrc-calcul" id="lrc-calcul">${panneau()}</div>`;

    // ====================================================== 8. SES COORDONNÉES
    // ⚠ EN AVANT-DERNIER, COMME SUR LE SITE (19/11/2026). Le simulateur garde
    // l'identité pour la fin : on a d'abord un projet, on sait à qui il est
    // ensuite. Le formulaire les demandait en premier depuis le matin même.
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
      <label class="lrc-champ large"><span>Ce qu’il a dit</span><textarea name="message" rows="3" placeholder="Sa situation, ses délais, ce qui l’inquiète…">${esc(v.message)}</textarea></label>`;
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
  function lireChamps() {
    hote.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
      if (el.name in v) v[el.name] = el.value;
    });
  }
  function brancher() {
    hote.querySelectorAll('[data-choix]').forEach(b => b.onclick = () => {
      lireChamps();
      const k = b.dataset.choix;
      v[k] = (v[k] === b.dataset.val && k !== 'contact') ? '' : b.dataset.val;
      if (k === 'canal' && v.canal !== 'Partenaire / apporteur') v.apporteur = '';
      draw();
    });
    // Une question fermée : « Non » referme ET efface ce qu'elle avait ouvert.
    hote.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
      lireChamps();
      const k = b.dataset.q;
      q[k] = q[k] === b.dataset.val ? '' : b.dataset.val;
      if (q[k] !== 'Oui') for (const c of (VIDER[k] || [])) v[c] = '';
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
        v[el.name] = el.value;
        if (['montant_projet', 'apport', 'montant_financement', 'revenus_foyer', 'credits_en_cours',
          'salaire_1', 'salaire_2', 'primes_1', 'primes_2'].includes(el.name)) lier(el.name);
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
        assurance: v.assurance.trim(),
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
