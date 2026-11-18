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
const AVANCEMENTS = ['Se renseigne', 'Cherche activement', 'Offre faite', 'Offre acceptée', 'Compromis signé'];
const DUREES = ['15 ans', '20 ans', '25 ans'];
const EMPRUNTEURS = ['Seul', 'À deux'];
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

const ETAPES = [
  { cle: 'projet', titre: 'Le projet', question: 'Quel est son projet ?', aide: 'Ce qu’il veut financer, et où il en est.' },
  { cle: 'chiffres', titre: 'Les chiffres', question: 'Les grandes lignes du budget', aide: 'Des ordres de grandeur suffisent : le dossier les précisera.' },
  { cle: 'prospect', titre: 'Le prospect', question: 'Qui est-ce ?', aide: 'Un téléphone ou un e-mail au moins, pour pouvoir le recontacter.' },
  { cle: 'rdv', titre: 'Le rendez-vous', question: 'Et ensuite ?', aide: 'Le premier contact devient une action datée dans le CRM.' },
];

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
    montant_projet: txt(f0.montant_projet), apport: txt(typeof f0.apport === 'number' ? f0.apport : ''), montant_financement: txt(f0.montant_financement),
    duree: DUREES.includes(f0.duree) ? f0.duree : '', emprunteurs: EMPRUNTEURS.includes(f0.emprunteurs) ? f0.emprunteurs : '',
    revenus_foyer: txt(f0.revenus_foyer), credits_en_cours: txt(f0.credits_en_cours), ville_projet: txt(f0.ville),
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
    contact: edition ? (etapeDepart === 3 ? 'tel' : 'rien') : 'rappel', jour: jourLocal(new Date(Date.now() + 86400000)), heure: '10:00',
    responsable: dossier?.owner_id || moi,
  };
  let etape = etapeDepart;
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
  const reponses = (i) => {
    const k = [['type_financement', 'objectif', 'type_bien', 'avancement', 'primo'],
      ['montant_projet', 'apport', 'revenus_foyer', 'credits_en_cours', 'duree',
        'emprunteurs', 'logement_actuel', 'emprunteur_1'],
      ['first_name', 'last_name', 'phone', 'email', 'canal'],
      ['contact']][i];
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
    if (source === 'montant_projet' || source === 'apport') { if (P) poser('montant_financement', P - A); }
    else if (source === 'montant_financement') {
      if (P && F !== null) poser('apport', P - F);
      else if (!P && F) poser('montant_projet', F + A);
    }
    const c = hote.querySelector('#lrc-calcul'); if (c) c.innerHTML = panneau();
  }

  const corps = () => {
    if (etape === 0) return `
      <h4>Le financement</h4>${tuiles('type_financement', FINANCEMENTS, v.type_financement)}
      <h4>Pour quel projet ?</h4>${puces('objectif', OBJECTIFS(), v.objectif)}
      <h4>Quel type de bien ?</h4>${puces('type_bien', TYPES_BIEN, v.type_bien)}
      <h4>Où en est-il ?</h4>${puces('avancement', AVANCEMENTS, v.avancement)}
      <div class="lrc-duo">
        <div><h4>Primo-accédant ?</h4>${puces('primo', OUI_NON, v.primo)}</div>
        <div><h4>Son logement actuel</h4>${puces('logement_actuel', LOGEMENTS, v.logement_actuel)}</div>
      </div>`;
    if (etape === 1) return `
      <div class="lrc-grille est-trois">
        ${champ('montant_projet', 'Montant du projet', { type: 'number', ph: '300 000', suffixe: '€' })}
        ${champ('apport', 'Apport', { type: 'number', ph: '30 000', suffixe: '€' })}
        ${champ('montant_financement', 'Montant à financer', { type: 'number', ph: '270 000', suffixe: '€' })}
        ${champ('travaux', 'Travaux à prévoir', { type: 'number', ph: '0', suffixe: '€' })}
        ${champ('epargne_restante', 'Épargne restante', { type: 'number', ph: '10 000', suffixe: '€' })}
        ${champ('ville_projet', 'Ville du projet', { ph: 'Nice' })}
      </div>
      <p class="lrc-lien">Les trois montants se tiennent : projet = apport + montant à financer. Changez-en un, les autres suivent.</p>
      <h4>Ce qui entre</h4>
      <div class="lrc-grille est-trois">
        ${champ('revenus_foyer', 'Revenus nets du foyer', { type: 'number', ph: '4 500', suffixe: '€ / mois' })}
        ${champ('autres_revenus', 'Autres revenus', { type: 'number', ph: '0', suffixe: '€ / mois' })}
        ${champ('revenus_locatifs', 'Revenus locatifs', { type: 'number', ph: '0', suffixe: '€ / mois' })}
      </div>
      <h4>Ce qui sort</h4>
      <div class="lrc-grille est-trois">
        ${champ('credits_en_cours', 'Crédits en cours', { type: 'number', ph: '0', suffixe: '€ / mois' })}
        ${champ('pension_versee', 'Pension versée', { type: 'number', ph: '0', suffixe: '€ / mois' })}
        ${champ('loyer_actuel', 'Loyer ou mensualité actuelle', { type: 'number', ph: '0', suffixe: '€ / mois' })}
      </div>
      ${champ('detail_credits', 'Quels crédits ?', { ph: 'Crédit auto, crédit conso…', large: true })}
      <h4>Qui emprunte</h4>
      <div class="lrc-grille">
        ${champ('emprunteur_1', 'Emprunteur 1', { ph: '35 ans, CDI, 3 000 € / mois' })}
        ${champ('emprunteur_2', 'Emprunteur 2', { ph: 'Si le projet se fait à deux' })}
      </div>
      <div class="lrc-duo">
        <div><h4>Durée souhaitée</h4>${puces('duree', DUREES, v.duree)}</div>
        <div><h4>Emprunteurs</h4>${puces('emprunteurs', EMPRUNTEURS, v.emprunteurs)}</div>
      </div>
      ${champ('enfants_a_charge', 'Personnes à charge (enfants)', { type: 'number', ph: '0' })}
      <div class="lrc-calcul" id="lrc-calcul">${panneau()}</div>`;
    if (etape === 2) {
      const d = doublon();
      return `
      <div class="lrc-grille">
        ${champ('first_name', 'Prénom')}${champ('last_name', 'Nom')}
        ${champ('phone', 'Téléphone', { type: 'tel', ph: '06 12 34 56 78' })}${champ('email', 'E-mail', { type: 'email', ph: 'nom@exemple.fr' })}
        ${champ('address', 'Adresse', { ph: '30 rue …' })}
        <div class="lrc-grille est-cp">${champ('postal_code', 'Code postal', { ph: '06000' })}${champ('city', 'Ville', { ph: 'Nice' })}</div>
      </div>
      <div id="lrc-doublon">${d ? `<p class="lrc-note est-doublon">Déjà dans la base de La Référence Courtage : <b>${esc(contactName(d))}</b>. ${edition ? 'Vérifiez qu’il ne s’agit pas de la même personne.' : 'La demande sera rattachée à sa fiche, rien ne sera créé en double.'}</p>` : ''}</div>
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
        if (['montant_projet', 'apport', 'montant_financement', 'revenus_foyer', 'credits_en_cours'].includes(el.name)) lier(el.name);
        const r = hote.querySelector('.lrc-recap'); if (r) r.innerHTML = recap();
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
    if (!v.first_name.trim() && !v.last_name.trim()) { etape = 2; draw(); hote.querySelector('#lrc-erreur').textContent = 'Il faut au moins un nom.'; return; }
    if (t.length < 9 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) {
      etape = 2; draw(); hote.querySelector('#lrc-erreur').textContent = 'Il faut un téléphone ou un e-mail valable.'; return;
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
        emprunteur_1: v.emprunteur_1.trim(), emprunteur_2: v.emprunteur_2.trim(),
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
