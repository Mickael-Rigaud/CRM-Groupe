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
import { scope } from './scope.js';
import { texteTravaux } from './rgd-formulaire.js';
import { COLONNE_NOTE } from './rgd-clients.js';

const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });
const txt = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };

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
  };
  return {
    type_projet: f.type_bien || '',
    type_intervention: f.type_intervention || '',
    superficie: f.superficie || '',
    types_travaux: f.types_travaux || '',
    budget_annonce: f.budget_annonce || '',
    projet_description: f.projet_description || '',
    adresse_chantier: f.adresse_chantier || '',
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
export function valeursSuivi(x) {
  const f = x.ligne;
  if (x.genre === 'demande') return {
    aLeContexte: true,
    type_demandeur: f.type_demandeur || '',
    comment_connu: f.comment_connu || '',
    recommandation: f.recommandation || '',
    apporteur_id: f.apporteur_id || '',
    commentaire: f.commentaire_admin || '',
  };
  return {
    aLeContexte: false,
    type_demandeur: '', comment_connu: '', recommandation: '',
    apporteur_id: f.apporteur_id || '',
    commentaire: f.notes || '',
  };
}

// L'identité, dans les colonnes de la table qui la porte.
const identite = (v, pro) => (pro
  ? { name: txt(v.raison_sociale) }
  : { first_name: txt(v.prenom), last_name: txt(v.nom) });

const coordonnees = (v) => ({
  email: txt(v.email), phone: txt(v.telephone), address: txt(v.adresse),
  postal_code: txt(v.code_postal), city: txt(v.ville),
});

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
  const demande = await db.insert('rgd_demandes', {
    contact_id: contact.id,
    date_demande: new Date().toISOString(),
    source: 'manuel', statut: 'nouveau_prospect',
    // `rgd_demandes` porte l'identité EN DOUBLE du contact : c'est une table en
    // forme de celle de l'application RGD, et la liste lit ses colonnes à elle.
    // Ne pas les remplir donnerait une ligne sans nom à l'écran.
    nom: txt(v.nom), prenom: txt(v.prenom),
    email: txt(v.email), telephone: txt(v.telephone),
    adresse: txt(v.adresse), code_postal: txt(v.code_postal), ville: txt(v.ville),
    type_demandeur: txt(v.type_demandeur),
    type_projet: txt(v.type_projet), type_intervention: txt(v.type_intervention),
    superficie: txt(v.superficie), types_travaux: travaux,
    budget: txt(v.budget_annonce), projet_description: txt(v.projet_description),
    adresse_chantier: txt(v.adresse_chantier),
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
    if (!x) return { ok: true, creee: await creer(v) };

    const f = x.ligne;
    const p = personneDe(f);
    const travaux = txt(texteTravaux(v.types_travaux));
    const note = COLONNE_NOTE(x.cible);

    if (x.genre === 'demande') {
      await db.update('rgd_demandes', f.id, {
        nom: txt(v.nom), prenom: txt(v.prenom),
        email: txt(v.email), telephone: txt(v.telephone),
        adresse: txt(v.adresse), code_postal: txt(v.code_postal), ville: txt(v.ville),
        type_demandeur: txt(v.type_demandeur),
        type_projet: txt(v.type_projet), type_intervention: txt(v.type_intervention),
        superficie: txt(v.superficie), types_travaux: travaux,
        budget: txt(v.budget_annonce), projet_description: txt(v.projet_description),
        adresse_chantier: txt(v.adresse_chantier),
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
        type_bien: txt(v.type_projet),
        apporteur_id: txt(v.apporteur_id),
        [note]: txt(v.commentaire),
      });
    }
    if (p) await db.update(p.table, p.ligne.id, { ...identite(v, p.pro), ...coordonnees(v) });
    avancerVue(x, v);
    return { ok: true };
  } catch (e) { return echec(e); }
}

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
  f.apporteur_id = txt(v.apporteur_id);
  f[COLONNE_NOTE(x.cible)] = txt(v.commentaire);

  if (x.genre === 'demande') {
    f.nom = txt(v.nom); f.prenom = txt(v.prenom);
    f.email = txt(v.email); f.telephone = txt(v.telephone);
    f.adresse = txt(v.adresse); f.code_postal = txt(v.code_postal); f.ville = txt(v.ville);
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
  x.ville = txt(v.ville) || '';
  x.adresse = [txt(v.adresse), [txt(v.code_postal), txt(v.ville)].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const nomComplet = txt(v.raison_sociale)
    || [txt(v.prenom), txt(v.nom)].filter(Boolean).join(' ');
  if (nomComplet) x.nom = nomComplet;
}
