// La fiche projet de RGD Renova — ce qu'elle lit, ce qu'elle écrit
//
// ⚠ UNE SEULE FICHE POUR LES DEUX PORTES (01/10/2026, demandé par Mickael :
// « je voudrais créer une fiche projet pour rgd quand on clique sur + nouvelle
// demande et quand on veut modifier les informations de la fiche »). C'est le
// mouvement déjà fait chez BTP Expertise le 25/09 : trois formulaires qui
// écrivaient dans la même table ont laissé la place à une seule fiche projet,
// et les trois portes d'entrée ouvrent la même chose.
//
// CE QUI EXISTAIT AVANT, ET CE QUE ÇA COÛTAIT. Deux formulaires :
// `rgd-demande-saisie.js` pour créer, `rgd-fiche-modif.js` pour corriger. Ils
// ne posaient PAS les mêmes questions, et l'écart se voyait dans les deux sens :
//
//   — la création demandait le type de demandeur, le « connu via », la
//     recommandation, l'apporteur et un commentaire ; **aucun des cinq ne se
//     corrigeait ensuite**. Une faute de frappe sur l'apporteur était
//     définitive, alors que la fiche l'affiche en toutes lettres ;
//   — la modification demandait l'adresse du chantier ; **la création ne la
//     proposait pas**, bien qu'un chantier se fasse souvent ailleurs que chez
//     la personne, et qu'elle le dise au téléphone.
//
// Les deux écarts tombent ici : les mêmes questions, dans le même ordre, quelle
// que soit la porte.
//
// ⚠ TROIS DESTINATIONS, ET ELLES NE PORTENT PAS LES MÊMES COLONNES — c'est
// mesuré, pas supposé (01/10/2026) :
//
//   création          → `contacts` + `rgd_demandes`
//   genre 'demande'   → `rgd_demandes` (+ l'identité sur le contact)
//   genre 'fiche'     → `rgd_clients`  (+ l'identité sur le contact ou l'orga)
//
// `rgd_demandes` a la forme du formulaire du site : `type_projet`, `budget`,
// `type_demandeur`, `comment_connu`, `recommandation`, `commentaire_admin`.
// `rgd_clients` a la forme de l'application RGD : `type_bien`, `budget_annonce`,
// `nature_travaux`, `notes` — et **pas** de type de demandeur, pas de « connu
// via », pas de recommandation. Ces trois-là ne s'affichent donc pas sur une
// fiche client : montrer un champ qu'aucune colonne ne peut recevoir donnerait
// un enregistrement qui répond « ok » sans rien changer — c'est exactement la
// raison pour laquelle une demande du site est restée en lecture seule jusqu'au
// 25/09.
//
// ⚠ AUCUNE DE CES COLONNES N'EST REPOSÉE PAR LA SYNCHRONISATION, vérifié ligne
// à ligne avant d'ouvrir la saisie : `push_rgd_demandes` ne remet que
// `traite_le`, `contact_id` et `organisation_id` ; la porte des fiches compte
// sa charge et la jette depuis le 28/09. Le contraire aurait refait la perte du
// 24/09 — « quand je refresh, les modifications sont perdues » —, et elle ne se
// voit pas : pas d'erreur, pas de message, la valeur revient en arrière dans la
// demi-heure.
import { db } from './db.js';
import { CONFIG } from '../config.js';
import { scope } from './scope.js';
import { texteTravaux } from './rgd-formulaire.js';
import { COLONNE_NOTE } from './rgd-clients.js';
import { creerEvenement, finApres } from './evenements.js';
import { DUREES } from './rgd-creneaux.js';

const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });
const txt = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };

export const nomComplet = (v) =>
  (v.raison_sociale || [v.prenom, v.nom].filter(Boolean).join(' ')).trim();

/**
 * La personne derrière la fiche, telle qu'on peut l'écrire. Un particulier est
 * un contact, un professionnel une organisation : deux tables, deux jeux de
 * colonnes, et le formulaire ne montre que celles qui existent.
 */
export const personneDe = (f) => {
  const c = f.contact_id && db.byId('contacts', f.contact_id);
  if (c) return { table: 'contacts', ligne: c, pro: false };
  const o = f.organisation_id && db.byId('organisations', f.organisation_id);
  if (o) return { table: 'organisations', ligne: o, pro: true };
  return null;
};

/**
 * Peut-on modifier cette fiche, et sinon pourquoi ? Rend `null` quand c'est
 * possible, et la raison quand ça ne l'est pas — l'écran l'affiche telle quelle.
 *
 * ⚠ IL Y AVAIT UN PREMIER REFUS ICI, RETIRÉ LE 25/09/2026 : une demande venue
 * du formulaire du site était en lecture seule, parce que la route de
 * l'application RGD n'acceptait que son statut et son commentaire. Elle n'est
 * plus dans la boucle. Ne pas le remettre.
 */
export function refusDeProjet(x) {
  if (!personneDe(x.ligne) && x.genre !== 'demande') {
    return 'Cette fiche n’est rattachée à aucun contact ni à aucune organisation : '
      + 'il n’y a rien à modifier tant que le rattachement n’est pas fait.';
  }
  return null;
}

/**
 * Les six réponses « projet » d'une fiche, d'où qu'elle vienne.
 *
 * ⚠ UNE SEULE TRADUCTION, LUE PAR LE FORMULAIRE ET PAR LA FICHE EN LECTURE.
 * Les deux écrans montraient les mêmes questions à partir de colonnes
 * différentes selon le genre de la ligne ; deux traductions auraient fini par
 * ne plus dire la même chose, et l'écart ne se serait vu que sur un genre de
 * fiche.
 *
 * ⚠ ON NE PRÉ-REMPLIT PAS DEPUIS LES COLONNES `meta_*`. Un lead Facebook répond
 * dans SON vocabulaire : sa valeur ne figure pas forcément dans les listes
 * d'ici, la puce resterait décochée, et enregistrer effacerait ce que la
 * personne avait répondu. La fiche en lecture les affiche toujours, en repli.
 */
export function valeursProjet(x) {
  const f = x.ligne;
  if (x.genre === 'demande') return {
    type_projet: f.type_projet || '',
    type_intervention: f.type_intervention || '',
    superficie: f.superficie || '',
    types_travaux: f.types_travaux || '',
    budget_annonce: f.budget || '',
    projet_description: f.projet_description || '',
    adresse_chantier: f.adresse_chantier || '',
    code_postal_chantier: f.code_postal_chantier || '',
    ville_chantier: f.ville_chantier || '',
  };
  return {
    type_projet: f.type_bien || '',
    type_intervention: f.type_intervention || '',
    superficie: f.superficie || '',
    types_travaux: f.types_travaux || '',
    budget_annonce: f.budget_annonce || '',
    projet_description: f.projet_description || '',
    adresse_chantier: f.adresse_chantier || '',
    code_postal_chantier: f.code_postal_chantier || '',
    ville_chantier: f.ville_chantier || '',
  };
}

/**
 * Les réponses de l'étape « Le suivi » — d'où vient la personne, qui l'a
 * envoyée, ce qu'on retient d'elle.
 *
 * ⚠ TROIS DES CINQ N'EXISTENT QUE SUR UNE DEMANDE, et `aLeContexte` le dit à
 * l'écran plutôt que de rendre des chaînes vides qu'un champ afficherait comme
 * « pas encore renseigné ». Une fiche client n'a pas de colonne pour eux : ce
 * n'est pas un oubli du CRM, c'est que la question ne lui a jamais été posée.
 */
/**
 * Un commentaire débarrassé de la note posée par le robot.
 *
 * ⚠ « Créé automatiquement depuis Google Agenda le … » N'EST PAS UN
 * COMMENTAIRE : c'est `rgd_visites_depuis_agenda` qui l'écrit dans `notes` en
 * créant la fiche. Sous le titre « Commentaire », elle passe pour un mot de
 * Mickael, et elle occupe la place de ce qu'on aurait vraiment noté.
 *
 * ⚠ ELLE SE RETIRE OÙ QU'ELLE SOIT, PAS SEULEMENT EN TÊTE. La fiche la filtrait
 * déjà, mais par un test ancré au début du texte : dès qu'on écrivait une ligne
 * au-dessus, elle repassait — et elle restait de toute façon dans le tableau et
 * dans le formulaire, qui ne filtraient rien. Une règle d'affichage appliquée à
 * un seul endroit sur trois n'est pas une règle.
 *
 * ⚠ ON NE TOUCHE PAS AUX DONNÉES : la note dit quand et comment la fiche est
 * née, ce qui a une valeur le jour où l'on se demande d'où elle sort. On cesse
 * de l'afficher comme un commentaire, on ne l'efface pas de la base.
 */
const NOTE_AUTO = /^[ \t]*Cr[ée]{2}\s+automatiquement\s+depuis\s+Google\s+Agenda[^\r\n]*$/gim;

export const sansNoteAuto = (texte) => String(texte || '')
  .replace(NOTE_AUTO, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export function valeursSuivi(x) {
  const f = x.ligne;
  if (x.genre === 'demande') return {
    aLeContexte: true,
    type_demandeur: f.type_demandeur || '',
    comment_connu: f.comment_connu || '',
    recommandation: f.recommandation || '',
    apporteur_id: f.apporteur_id || '',
    commentaire: sansNoteAuto(f.commentaire_admin),
  };
  // ⚠ UNE FICHE CLIENT PORTE LE CONTEXTE DEPUIS LE 02/10/2026 (migration
  // `20261002133202_rgd_clients_contexte_du_lead`). Ces trois champs
  // disparaissaient faute de colonnes, et c'était écrit ici comme une limite
  // assumée — mais un prospect devient client, et c'est précisément au moment
  // où il signe qu'on ne pouvait plus corriger sa provenance. « Connu via » dit
  // d'où vient le chiffre d'affaires : le masquer sur ceux qui ont signé le
  // rendait inexploitable sur la seule population qui compte.
  return {
    aLeContexte: true,
    type_demandeur: f.type_demandeur || '',
    comment_connu: f.comment_connu || '',
    recommandation: f.recommandation || '',
    apporteur_id: f.apporteur_id || '',
    commentaire: sansNoteAuto(f.notes),
  };
}

// L'identité, dans les colonnes de la table qui la porte.
const identite = (v, pro) => (pro
  ? { name: txt(v.raison_sociale) }
  : { first_name: txt(v.prenom), last_name: txt(v.nom) });

/** L'adresse du chantier, en trois morceaux. */
export const adresseChantier = (v) => ({
  adresse: txt(v.adresse_chantier),
  code_postal: txt(v.code_postal_chantier),
  ville: txt(v.ville_chantier),
});

/**
 * L'adresse du PROSPECT — celle du chantier tant qu'on n'a pas dit le contraire.
 *
 * Demandé le 01/10/2026 : « pour l'adresse du prospect je voudrais un champ
 * pré-rempli de l'adresse du projet et une possibilité de cocher ou décocher si
 * l'adresse est différente ». Neuf fois sur dix c'est la même, et la retaper
 * est du travail pour rien.
 *
 * ⚠ UN CHANTIER SANS ADRESSE N'EFFACE PAS CELLE DU PROSPECT. Sans ce garde,
 * ouvrir une fiche dont l'adresse du chantier n'a jamais été renseignée, puis
 * enregistrer, VIDERAIT l'adresse du contact — en silence, et sur la table que
 * les quatre structures partagent. On ne recopie que ce qui existe.
 */
export function adresseProspect(v) {
  const ch = adresseChantier(v);
  const propre = {
    adresse: txt(v.adresse), code_postal: txt(v.code_postal), ville: txt(v.ville),
  };
  if (v.adresse_differente) return propre;
  if (!ch.adresse && !ch.code_postal && !ch.ville) return propre;
  return ch;
}

const coordonnees = (v) => {
  const a = adresseProspect(v);
  return {
    email: txt(v.email), phone: txt(v.telephone),
    address: a.adresse, postal_code: a.code_postal, city: a.ville,
  };
};

// `rgd_demandes` porte l'identité EN DOUBLE du contact, sa propre adresse
// comprise : elle suit donc la même règle que celle du contact, sinon le
// tableau et la fiche afficheraient deux adresses différentes pour la même
// personne.
const adressePourLaDemande = (v) => {
  const a = adresseProspect(v);
  return { adresse: a.adresse, code_postal: a.code_postal, ville: a.ville };
};

/**
 * Créer une demande saisie à la main.
 *
 * ⚠ `source: 'manuel'` ET NON `formulaire_site`. La fiche n'est pas venue du
 * site, et le dire fausserait la seule mesure qui compte sur les campagnes :
 * combien de demandes le site rapporte. C'est aussi ce qui la fait tomber sur
 * la provenance « Direct » quand la personne ne dit pas comment elle nous a
 * connus.
 *
 * ⚠ ELLE ÉCRIT DANS `rgd_demandes`, PAS DANS `rgd_clients`, et ce n'est pas un
 * détail de rangement : `rgd_demandes` porte déjà `type_demandeur`,
 * `type_projet`, `superficie`, `types_travaux`, `budget`, `comment_connu` et
 * `recommandation`. Les écrire dans `rgd_clients` demanderait sept colonnes
 * nouvelles qui doubleraient celles-ci — deux endroits pour la même
 * information, et la certitude qu'ils divergeront.
 */
async function creer(v) {
  const travaux = txt(texteTravaux(v.types_travaux));
  // ⚠ `activities: ['rgd']` NE REND RIEN VISIBLE : la policy `contacts_select`
  // ne regarde `activities` que pour le rôle `propulsion`, et demande
  // `owner_id = auth.uid()` pour tous les autres. Tant que les seuls comptes
  // RGD étaient des directions, l'erreur ne se voyait pas — la direction voit
  // tout. Un chargé d'affaires, lui, aurait créé un prospect sans jamais le
  // retrouver. D'où `owner_id`, qui est ce qui ouvre vraiment ; `activities`
  // reste, il sert au marquage par structure dans les listes.
  const contact = await db.insert('contacts', {
    ...identite(v, false), ...coordonnees(v),
    type: 'Prospect', channel: 'Saisie manuelle', activities: ['rgd'],
    owner_id: scope.user?.id || null,
  });

  // Pas de `d1_id` : elle naît ici, la synchronisation ne la verra jamais et ne
  // pourra donc jamais l'écraser.
  //
  // ⚠ `owner_id` SUR LA DEMANDE AUSSI, ET PAS SEULEMENT SUR LE CONTACT — défaut
  // trouvé à l'essai le 01/10/2026, hérité de `rgd-demande-saisie.js` : le
  // commentaire ci-dessus décrivait le piège pour `contacts` et le laissait
  // ouvert ici. `rgd_demandes` est une table « moi » (voir `RGD_PORTEFEUILLE`
  // dans `scope.js`, miroir de la policy) : sans porteur, la demande est
  // invisible à TOUT LE MONDE sauf la direction — y compris à celui qui vient
  // de la saisir. Mesuré en démo avec le compte chargé d'affaires : « Demande
  // créée », ligne écrite en base, et zéro ligne à l'écran.
  const demande = await db.insert('rgd_demandes', {
    contact_id: contact.id,
    owner_id: scope.user?.id || null,
    date_demande: new Date().toISOString(),
    source: 'manuel', statut: 'nouveau_prospect',
    // `rgd_demandes` porte l'identité EN DOUBLE du contact : c'est une table en
    // forme de celle de l'application RGD, et la liste lit ses colonnes à elle.
    // Ne pas les remplir donnerait une ligne sans nom à l'écran.
    nom: txt(v.nom), prenom: txt(v.prenom),
    email: txt(v.email), telephone: txt(v.telephone),
    ...adressePourLaDemande(v),
    type_demandeur: txt(v.type_demandeur),
    type_projet: txt(v.type_projet), type_intervention: txt(v.type_intervention),
    superficie: txt(v.superficie), types_travaux: travaux,
    budget: txt(v.budget_annonce), projet_description: txt(v.projet_description),
    adresse_chantier: txt(v.adresse_chantier),
    code_postal_chantier: txt(v.code_postal_chantier),
    ville_chantier: txt(v.ville_chantier),
    comment_connu: txt(v.comment_connu), recommandation: txt(v.recommandation),
    apporteur_id: txt(v.apporteur_id),
    commentaire_admin: txt(v.commentaire),
  });
  return { contact, demande };
}

/**
 * Enregistre la fiche projet. `x` vaut `null` pour une création.
 *
 * Rend `{ ok: true, creee }` ou `{ ok: false, motif }`.
 *
 * ⚠ LE COMMENTAIRE PASSE PAR `COLONNE_NOTE`, la même déclaration que lit
 * `majNote` — c'est-à-dire le champ « Note » du tableau Clients & prospects.
 * Deux endroits qui décideraient chacun du nom de colonne finiraient par écrire
 * dans deux colonnes différentes selon l'écran, et la note disparaîtrait d'une
 * vue à l'autre sans que rien ne le dise.
 */
export async function enregistrerProjet(x, v) {
  try {
    if (!x) {
      const creee = await creer(v);
      // ⚠ LE RENDEZ-VOUS VIENT APRÈS LA FICHE, TOUJOURS : il se rattache au
      // contact, qui n'existe pas tant qu'elle n'est pas écrite. Et son échec
      // ne remet pas la fiche en cause — on a noté un prospect, c'est l'essentiel.
      const rdv = await avecRendezVous(v, { contactId: creee.contact?.id });
      const rappel = await poserRappel(v, { contactId: creee.contact?.id });
      return { ok: true, creee, rdv, rappel };
    }

    const f = x.ligne;
    const p = personneDe(f);
    const travaux = txt(texteTravaux(v.types_travaux));
    const note = COLONNE_NOTE(x.cible);

    if (x.genre === 'demande') {
      await db.update('rgd_demandes', f.id, {
        nom: txt(v.nom), prenom: txt(v.prenom),
        email: txt(v.email), telephone: txt(v.telephone),
        ...adressePourLaDemande(v),
        type_demandeur: txt(v.type_demandeur),
        type_projet: txt(v.type_projet), type_intervention: txt(v.type_intervention),
        superficie: txt(v.superficie), types_travaux: travaux,
        budget: txt(v.budget_annonce), projet_description: txt(v.projet_description),
        adresse_chantier: txt(v.adresse_chantier),
        code_postal_chantier: txt(v.code_postal_chantier),
        ville_chantier: txt(v.ville_chantier),
        comment_connu: txt(v.comment_connu), recommandation: txt(v.recommandation),
        apporteur_id: txt(v.apporteur_id),
        [note]: txt(v.commentaire),
      });
    } else {
      // ⚠ `nature_travaux` REÇOIT LA MÊME LISTE QUE `types_travaux` : c'est la
      // colonne que lisent les écrans venus du tableau de bord, la laisser en
      // arrière ferait dire deux choses différentes à deux endroits du CRM.
      await db.update('rgd_clients', f.id, {
        type_intervention: txt(v.type_intervention),
        superficie: txt(v.superficie),
        types_travaux: travaux, nature_travaux: travaux,
        projet_description: txt(v.projet_description),
        budget_annonce: txt(v.budget_annonce),
        adresse_chantier: txt(v.adresse_chantier),
        code_postal_chantier: txt(v.code_postal_chantier),
        ville_chantier: txt(v.ville_chantier),
        type_bien: txt(v.type_projet),
        // Les trois champs de contexte, désormais portés par la table.
        type_demandeur: txt(v.type_demandeur),
        comment_connu: txt(v.comment_connu),
        recommandation: txt(v.recommandation),
        apporteur_id: txt(v.apporteur_id),
        [note]: txt(v.commentaire),
      });
    }
    if (p) await db.update(p.table, p.ligne.id, { ...identite(v, p.pro), ...coordonnees(v) });
    avancerVue(x, v);
    const cles = { contactId: f.contact_id || null, organisationId: f.organisation_id || null };
    const rdv = await avecRendezVous(v, cles);
    const rappel = await poserRappel(v, cles);
    return { ok: true, rdv, rappel };
  } catch (e) { return echec(e); }
}

/**
 * Ce que la to-do affichera. ⚠ C'EST LE SEUL TEXTE QU'ON Y VOIT : la liste des
 * tâches ne rend que `title` — `notes` est cherchable mais pas affichée, et ne
 * se lit qu'en ouvrant la tâche (mesuré dans `today.js`). L'objet du rappel
 * doit donc y monter, sinon « Rappeler Untel » ne dit jamais pourquoi.
 *
 * ⚠ ON NE REMET PAS LE NOM DEDANS : la ligne de la to-do affiche déjà le
 * contact rattaché, à côté du titre. L'y répéter mangerait la moitié de la
 * largeur pour une information déjà là.
 *
 * ⚠ UNE SEULE RÈGLE, PAS DEUX : le texte entier est ramené sur une ligne et
 * coupé à 80 caractères. Prendre « la première ligne » puis couper ferait deux
 * comportements à expliquer, et un titre vide sur un texte qui commence par un
 * retour à la ligne. Le texte complet reste dans les notes, rien n'est perdu.
 */
const titreRappel = (v) => {
  const brut = String(v.rappel_objet || '').replace(/\s+/g, ' ').trim();
  if (!brut) return `Rappeler ${nomComplet(v) || 'ce prospect'}`;
  return brut.length > 80 ? `${brut.slice(0, 79)}…` : brut;
};

/**
 * Ce qu'on lira en ouvrant la tâche.
 *
 * ⚠ LES DEUX COMMENTAIRES NE DISENT PAS LA MÊME CHOSE, et c'est pourquoi les
 * deux y sont : celui du rappel dit POURQUOI on rappelle, celui de la fiche dit
 * ce qu'on sait de la personne (« à rappeler après 18 h »). Garder le second
 * seul était le choix d'hier ; il perdait l'objet, qui est précisément ce que
 * Mickael est venu ajouter.
 */
const notesRappel = (v) => {
  const objet = txt(v.rappel_objet);
  const fiche = txt(v.commentaire);
  if (!objet) return fiche;
  if (!fiche) return objet;
  return `${objet}\n\n— Sur le prospect : ${fiche}`;
};

/** Le titre que la to-do affichera, pour le montrer avant d'enregistrer. */
export const apercuRappel = (v) => titreRappel(v);

/**
 * Pose le rappel dans la to-do du CRM.
 *
 * ⚠ DANS `activities`, LA VRAIE TABLE DES TÂCHES — pas dans une liste à part
 * (01/10/2026, demandé : « un système où on peut planifier des rappels qui
 * seront automatiquement inscrits dans la to do list du CRM Groupe »). C'est
 * elle que lisent « Ma journée », l'écran des tâches et les compteurs.
 *
 * ⚠ LA TÂCHE EST POUR SOI, jamais pour un collègue : un déclencheur serveur
 * (`tache_destinataire`) refuse un destinataire hors de ses structures, et
 * surtout personne n'a demandé à recevoir le rappel de quelqu'un d'autre.
 *
 * ⚠ LES DEUX COMMENTAIRES SONT RECOPIÉS, et c'est un INSTANTANÉ assumé : quand
 * le rappel sonne dans trois semaines, « relancer sur le devis » et « rappeler
 * après 18 h » sont précisément ce qu'il faut avoir sous les yeux, et aller les
 * rechercher sur la fiche est le geste qu'on ne fera pas. Ils ne suivront pas
 * une correction faite ensuite sur la fiche — c'est le prix, et il est petit.
 *
 * ⚠ SON ÉCHEC NE REMET RIEN EN CAUSE : la fiche est enregistrée, le rendez-vous
 * pris. On le dit, on ne recommence pas.
 */
// ⚠ EXPORTÉE DEPUIS LE 05/10/2026 : la FICHE pose un rappel elle aussi, sous
// son historique (« en dessous de historique je voudrais avoir le système de
// rappel relié à la to do list »). Elle appelle CETTE fonction, jamais un
// second `db.insert` : le titre coupé à 80 caractères, les deux commentaires
// recopiés dans les notes, la tâche assignée à soi — tout cela est la règle du
// rappel, et une seconde copie aurait fini par ne plus l'appliquer pareil.
export async function poserRappel(v, { contactId, organisationId }) {
  const jour = txt(v.rappel_jour);
  if (!jour) return null;
  try {
    await db.insert('activities', {
      contact_id: contactId || null,
      organisation_id: organisationId || null,
      activity: 'rgd',
      type: 'relance',
      title: titreRappel(v),
      due_date: jour,
      due_time: txt(v.rappel_heure),
      notes: notesRappel(v),
      assignee_id: scope.user?.id || null,
      done: false,
      created_by: scope.user?.id || null,
    });
    // ⚠ RIEN À RECHARGER ICI, contrairement au rendez-vous : `db.insert` pose
    // la ligne dans le cache ET appelle `emit()`, donc « Ma journée » et
    // l'écran des tâches se redessinent seuls. C'est la RPC du rendez-vous qui
    // ne le fait pas — une fonction de base écrit sans passer par le cache.
    return { ok: true, jour, heure: txt(v.rappel_heure) };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 140) };
  }
}

// Appelée par `enregistrerProjet` quand un créneau a été choisi. Sans créneau
// elle ne fait rien — prendre un rendez-vous n'est pas obligatoire pour noter
// une demande, et l'exiger ferait saisir une date au hasard.
async function avecRendezVous(v, cles) {
  if (!txt(v.rdv_jour) || !txt(v.rdv_heure)) return null;
  try {
    return await poserRendezVous(v, cles);
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 140) };
  }
}

// ====================================================================
//  LE RENDEZ-VOUS
// ====================================================================
//
// ⚠ TROIS ÉCRITURES QUI NE PEUVENT PAS ÊTRE UNE TRANSACTION, et il faut le
// savoir avant de lire la suite : l'événement part chez Google, le chantier
// dans Supabase, le mail chez Brevo. Aucun des trois ne peut annuler le
// précédent. L'ordre est donc choisi pour que l'échec le plus probable coûte
// le moins cher, et **chaque manque est NOMMÉ** plutôt que tu :
//
//   1. Google — s'il refuse, il n'y a pas de rendez-vous : on s'arrête, et la
//      fiche reste enregistrée. Rien à rattraper.
//   2. Le chantier — s'il échoue, le rendez-vous EXISTE dans l'agenda et le
//      robot des visites en fera une seconde fiche à :15 ou :45. C'est le seul
//      échec qui salit la base, et l'écran le dit en toutes lettres.
//   3. Le mail — s'il échoue, le client n'est pas prévenu mais tout le reste
//      tient. On le dit ; on ne refait pas le rendez-vous.
//
// ⚠ LE PROSPECT N'EST PAS « INVITÉ » AU SENS DE GOOGLE, ET C'EST VOULU
// (01/10/2026, Mickael : « le prospect reçoit un mail de confirmation avec la
// DA de RGD Renova et plus le mail d'invitation Google »). Le poser en
// participant ferait partir l'invitation de Google — c'est `sendUpdates=all`,
// le comportement arbitré le 25/09 pour l'agenda — ou, si on l'éteignait,
// créerait un participant qui n'a rien reçu mais recevra les notifications de
// TOUTE modification future. Ses coordonnées vont donc dans la DESCRIPTION de
// l'événement, qui est précisément ce que Mickael a demandé d'y mettre.
//
// ⚠ ET C'EST AUSSI CE QUI REND LE RENDEZ-VOUS INOFFENSIF POUR LE ROBOT : sans
// invité, `rgd_visites_depuis_agenda` le classe « sans invité » et ne crée
// rien. Le `source_event_id` du chantier est la ceinture, ceci est la
// bretelle — les deux, parce que le coût d'un doublon est une fiche fantôme
// que personne ne comprend trois semaines plus tard.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « mardi 7 octobre 2026 », sans passer par un fuseau : le jour est déjà une clé. */
export function jourEnToutesLettres(jour) {
  const d = new Date(`${jour}T12:00:00Z`);
  if (Number.isNaN(+d)) return jour;
  // « 1er octobre », jamais « 1 octobre » : c'est la seule irrégularité du
  // français sur les quantièmes, et elle se voit dans un e-mail client.
  const n = d.getUTCDate();
  return `${JOURS[d.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Où la visite a lieu, en une ligne pour Google.
 *
 * ⚠ C'EST L'ADRESSE DU CHANTIER, et à défaut celle du prospect — jamais un
 * mélange des deux. Jusqu'au 01/10/2026 (après-midi) le chantier n'avait qu'un
 * champ libre, et la visite partait avec la rue du chantier mais le CODE
 * POSTAL ET LA VILLE DU PROSPECT : dès que les travaux étaient ailleurs que
 * chez la personne, le chantier était rangé dans la mauvaise commune. Défaut
 * introduit le matin même, trouvé en découpant l'adresse en trois.
 */
const uneLigne = (a) => [a.adresse, [a.code_postal, a.ville].filter(Boolean).join(' ')]
  .filter(Boolean).join(', ') || null;

const adresseVisite = (v) => uneLigne(adresseChantier(v)) || uneLigne(adresseProspect(v));

/**
 * Ce que Mickael lira sur son téléphone en ouvrant le rendez-vous.
 *
 * ⚠ C'EST LA SEULE COPIE DES COORDONNÉES QUI PARTE CHEZ GOOGLE, puisque le
 * prospect n'est pas participant. En retirer le téléphone obligerait à rouvrir
 * le CRM depuis un chantier pour rappeler quelqu'un.
 */
export function descriptionRendezVous(v) {
  const l = [`Client : ${nomComplet(v) || '—'}`];
  if (txt(v.telephone)) l.push(`Téléphone : ${v.telephone}`);
  if (txt(v.email)) l.push(`E-mail : ${v.email}`);
  if (txt(v.type_demandeur)) l.push(`Demandeur : ${v.type_demandeur}`);

  const projet = [];
  if (txt(v.type_projet)) projet.push(v.type_projet);
  if (txt(v.type_intervention)) projet.push(v.type_intervention);
  if (txt(v.superficie)) projet.push(`${v.superficie} m²`);
  if (projet.length) l.push('', `Bien : ${projet.join(' · ')}`);
  if (v.types_travaux?.length) l.push(`Travaux : ${v.types_travaux.join(', ')}`);
  if (txt(v.budget_annonce)) l.push(`Budget annoncé : ${v.budget_annonce}`);
  if (txt(v.projet_description)) l.push('', v.projet_description);
  return l.join('\n');
}

/**
 * Le mail de confirmation, dans l'identité de RGD Renova.
 *
 * ⚠ ON N'AJOUTE PAS D'EN-TÊTE DE MARQUE ICI : `envoyer-email` enveloppe déjà
 * le contenu. En poser un second donnerait deux logos dans le même message —
 * le piège déjà rencontré sur la relance des sous-traitants.
 *
 * ⚠ PAS DE NUMÉRO DE TÉLÉPHONE INVENTÉ. Le seul chemin de retour qu'on sait
 * vrai est la réponse au message, et `replyTo` l'envoie à l'entreprise.
 */
function corpsConfirmation(v, { jour, heure, duree, lieu }) {
  const e = (t) => String(t ?? '').replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const prenom = txt(v.prenom) || nomComplet(v);
  const quand = `${jourEnToutesLettres(jour)} à ${heure.replace(':', ' h ')}`;
  const combien = duree >= 120 ? '2 heures' : (duree >= 90 ? '1 h 30' : 'une heure');
  return `
    <p>Bonjour ${e(prenom)},</p>
    <p>Nous vous confirmons le rendez-vous pour la <strong>visite technique</strong>
       de votre projet.</p>
    <p style="margin:18px 0;padding:14px 16px;border-left:3px solid #FD7A2D;background:#FFF5EE">
      <strong style="font-size:16px">${e(quand)}</strong><br>
      ${lieu ? e(lieu) + '<br>' : ''}
      <span style="color:#666">Comptez environ ${e(combien)} sur place.</span>
    </p>
    <p>Cette visite nous permet de voir le bien, de préciser vos attentes et de
       vous remettre un chiffrage juste.</p>
    <p>Si vous devez décaler ce rendez-vous, répondez simplement à ce message.</p>
    <p>À très bientôt,<br><strong>RGD Renova</strong></p>`;
}

async function envoyerConfirmation(v, quand) {
  const email = txt(v.email);
  if (!email) return { ok: false, motif: 'aucune adresse e-mail' };
  if (db.demo) return { ok: false, motif: 'mode démo : aucun message envoyé' };
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'session expirée' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/envoyer-email`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: { email, name: nomComplet(v) || email },
        subject: `Votre visite technique — ${jourEnToutesLettres(quand.jour)}`,
        html: corpsConfirmation(v, quand),
        // La réponse du client doit arriver dans la boîte de l'entreprise, pas
        // dans celle de l'expéditeur technique.
        replyTo: { email: 'contact@rgdrenova.fr', name: 'RGD Renova' },
      }),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok || rep.ok === false) {
      return { ok: false, motif: rep.detail || rep.erreur || `erreur ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 120) };
  }
}

/**
 * Pose la visite : l'événement chez Google, le chantier dans le CRM, le mail au
 * client. Rend `{ ok, lien, manques: [] }` — `ok` ne porte que sur le
 * rendez-vous lui-même, les manques disent ce qui n'a pas suivi.
 */
export async function poserRendezVous(v, { contactId, organisationId }) {
  const jour = txt(v.rdv_jour);
  const heure = txt(v.rdv_heure);
  const duree = Number(v.rdv_duree) || 60;
  if (!jour || !heure) return { ok: false, motif: 'aucun créneau choisi' };

  const titre = `Visite technique : ${nomComplet(v) || 'client'} / RGD Renova`;
  const lieu = adresseVisite(v);
  const manques = [];

  // 1. Google. ⚠ `finApres` attend l'heure EN CHAÎNE, et la fin se calcule en
  //    minutes de pendule : voir l'en-tête de `data/evenements.js`.
  let eventId = null;
  let lien = null;
  if (db.demo) {
    // ⚠ LE MODE DÉMO FABRIQUE L'ÉVÉNEMENT LUI-MÊME, sinon toute cette mécanique
    // n'est éprouvable que sur la production — c'est-à-dire sur l'agenda d'une
    // entreprise en activité. Il dépose la même ligne que le relevé rapporterait.
    eventId = `demo-vt-${Date.now().toString(36)}`;
    try {
      await db.insert('agenda_events', {
        id: `rgd|${eventId}|${jour}`, activity: 'rgd',
        calendar_id: 'demo-rgd@group.calendar.google.com', google_id: eventId,
        title: titre, location: lieu || '', description: descriptionRendezVous(v),
        starts_at: `${jour}T${heure}:00`, ends_at: finApres(jour, heure, duree),
        all_day: false, day: jour,
      });
    } catch { /* la ligne de démo n'est pas le sujet */ }
  } else {
    const r = await creerEvenement({
      activite: 'rgd', titre,
      date_debut: `${jour}T${heure}:00`,
      date_fin: finApres(jour, heure, duree),
      all_day: false,
      lieu: lieu || undefined,
      description: descriptionRendezVous(v),
      // ⚠ PAS D'`invites` : voir l'en-tête de ce bloc.
    });
    if (!r.ok) return { ok: false, motif: r.motif };
    eventId = r.donnees?.id || null;
    lien = r.donnees?.lien || null;
    if (!eventId) {
      // Google a accepté sans rendre d'identifiant : on ne peut pas poser le
      // chantier, et le robot verra un rendez-vous qu'il ne sait pas rattacher.
      manques.push('le rendez-vous est dans l’agenda mais le CRM n’a pas pu s’y relier');
    }
  }

  // 2. Le chantier. ⚠ C'est lui qui fait exister la visite dans le CRM — onglet
  //    « RDV », colonne date-et-heure, bloc des rendez-vous de la fiche — ET qui
  //    empêche le robot d'en refaire une fiche.
  if (eventId) {
    try {
      const rep = await db.rpc('rgd_visite_planifiee', {
        p_event_id: eventId, p_jour: jour, p_titre: titre,
        p_contact: contactId || null, p_organisation: organisationId || null,
        // ⚠ LES TROIS MORCEAUX DU CHANTIER, pas ceux du prospect : voir
        // `adresseVisite`. À défaut d'adresse de chantier on retombe sur celle
        // du prospect, mais en entier — les trois ensemble, jamais panachés.
        ...(() => {
          const a = adresseChantier(v);
          const r = (a.adresse || a.code_postal || a.ville) ? a : adresseProspect(v);
          return { p_adresse: r.adresse, p_code_postal: r.code_postal, p_ville: r.ville };
        })(),
        p_description: descriptionRendezVous(v),
      });
      if (rep?.ok === false) throw new Error(rep.error || 'refusé');
      // ⚠ UNE RPC N'ALIMENTE PAS LE CACHE, et sans ce rechargement le
      // rendez-vous qu'on vient de poser N'APPARAÎT NULLE PART avant un
      // rafraîchissement de la page : la fiche lit `rgd_chantiers` et
      // `agenda_events` depuis le cache, et `db.rpc` n'y touche pas. Constaté
      // à l'essai — le chantier était bien écrit, l'écran disait le contraire.
      // ⚠ TROIS TABLES, PAS UNE : le chantier range la visite, l'affaire la
      // fait exister pour le Pipeline, l'événement porte l'heure.
      await Promise.all([
        db.recharger('rgd_chantiers'), db.recharger('deals'), db.recharger('agenda_events'),
      ]).catch(() => { /* l'affichage est en retard, la base est juste */ });
    } catch (e) {
      manques.push(
        'le rendez-vous est posé dans l’agenda, mais le CRM n’a pas pu l’enregistrer '
        + `(${String(e.message || e).slice(0, 80)}) — une fiche en double peut apparaître `
        + 'dans la demi-heure, à vérifier');
    }
  }

  // 3. Le mail. Son échec ne remet rien en cause.
  const mail = await envoyerConfirmation(v, { jour, heure, duree, lieu });
  if (!mail.ok) manques.push(`le client n’a pas reçu la confirmation (${mail.motif})`);

  return { ok: true, lien, jour, heure, duree, manques, mail: mail.ok };
}

/** Le libellé d'une durée, pris dans la table : « 1 h 30 », jamais « 90 min ». */
export const ditDuree = (m) =>
  (DUREES.find(([v]) => v === Number(m)) || [0, `${m} min`])[1];

/** Le libellé d'un créneau choisi, pour le pied du formulaire et les messages. */
export const ditCreneau = (v) => (v.rdv_jour && v.rdv_heure
  ? `${jourEnToutesLettres(v.rdv_jour)} à ${v.rdv_heure} (${ditDuree(v.rdv_duree || 60)})`
  : '');

/**
 * Reporte les valeurs enregistrées sur l'objet que la fiche a sous la main.
 *
 * ⚠ CE N'EST PAS UN CONFORT D'AFFICHAGE, C'EST CE QUI REND L'ÉCRAN EXACT.
 * `db.update` ne modifie pas la ligne, il la REMPLACE dans le cache
 * (`this.cache[table][i] = r`) : la fiche garde donc une référence orpheline, et
 * redessiner après un enregistrement réussi rendait les ANCIENNES valeurs.
 * Constaté à l'essai : budget passé à 52 000, tuile toujours à 45 000, avec
 * « Informations enregistrées » affiché par-dessus — le pire des deux mondes,
 * puisque la base était juste et l'écran faux.
 *
 * ⚠ `x` EST UN INSTANTANÉ, PAS LA LIGNE. `ficheDe()` a recopié le téléphone, le
 * mail et l'adresse depuis le contact au moment de l'ouverture ; avancer
 * `x.ligne` seul laisserait le bloc « Le prospect » sur les anciennes
 * coordonnées. Les deux sont donc avancés ensemble.
 */
function avancerVue(x, v) {
  const f = x.ligne;
  const travaux = txt(texteTravaux(v.types_travaux));

  f.type_intervention = txt(v.type_intervention);
  f.superficie = txt(v.superficie);
  f.types_travaux = travaux;
  f.projet_description = txt(v.projet_description);
  f.adresse_chantier = txt(v.adresse_chantier);
  f.code_postal_chantier = txt(v.code_postal_chantier);
  f.ville_chantier = txt(v.ville_chantier);
  f.apporteur_id = txt(v.apporteur_id);
  f[COLONNE_NOTE(x.cible)] = txt(v.commentaire);

  if (x.genre === 'demande') {
    f.nom = txt(v.nom); f.prenom = txt(v.prenom);
    f.email = txt(v.email); f.telephone = txt(v.telephone);
    const ap = adresseProspect(v);
    f.adresse = ap.adresse; f.code_postal = ap.code_postal; f.ville = ap.ville;
    f.type_projet = txt(v.type_projet);
    f.budget = txt(v.budget_annonce);
    f.type_demandeur = txt(v.type_demandeur);
    f.comment_connu = txt(v.comment_connu);
    f.recommandation = txt(v.recommandation);
  } else {
    f.nature_travaux = travaux;
    f.budget_annonce = txt(v.budget_annonce);
    f.type_bien = txt(v.type_projet);
  }

  x.tel = txt(v.telephone) || '';
  x.email = txt(v.email) || '';
  const ap = adresseProspect(v);
  x.ville = ap.ville || '';
  x.adresse = uneLigne(ap) || '';
  const nomComplet = txt(v.raison_sociale)
    || [txt(v.prenom), txt(v.nom)].filter(Boolean).join(' ');
  if (nomComplet) x.nom = nomComplet;
}
