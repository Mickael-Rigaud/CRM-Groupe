// Où en est un dossier RGD Renova — la source unique des sept étapes
//
// POURQUOI CE MODULE EXISTE
// Deux écrans montrent le même cycle : la base « Clients & prospects »
// (`js/pages/rgd-clients.js`) et le pipeline de la vue d'ensemble. Recopier le
// calcul de l'un vers l'autre fabriquerait la deuxième vérité que le CLAUDE.md
// interdit — deux écrans qui affichent deux chiffres sur la même chose valent
// moins que pas d'écran du tout. La définition vit donc ici, et eux la lisent.
//
// ⚠ LE RACCOURCI QUI NE MARCHE PAS
// Se contenter d'`ETAPE_DU_STATUT` donne le bon résultat partout SAUF sur les
// fiches restées à `nouveau_prospect`, là où les faits prennent la main — soit,
// au 23/09/2026, les 27 dont le chantier tourne. Un pipeline branché sur le
// seul statut les afficherait en « Nouvelle demande » quand la base les montre
// en « Chantier en cours ».
//
// LES TROIS RÈGLES, DANS L'ORDRE OÙ ELLES S'APPLIQUENT
//
// 1. PERDU SORT DU CYCLE. Une affaire perdue n'est pas « moins avancée »,
//    elle est dehors : elle va en « Archivés », quoi que disent les faits.
//
// 2. UNE SAISIE DÉLIBÉRÉE L'EMPORTE SUR LES FAITS. `nouveau_prospect` n'est
//    pas un statut, c'est une absence de statut — il dit « personne n'a rien
//    renseigné ». C'est là, et là seulement, que les devis et les chantiers
//    parlent à la place du suivi. Toute autre valeur est une décision de
//    quelqu'un, et une décision ne se fait pas contredire par une table.
//    Arbitré le 23/09/2026 : la règle précédente prenait la plus avancée des
//    deux sources, ce qui rendait ces 27 fiches IMMOBILES — changer leur
//    statut ne les déplaçait pas, le chantier les retenait.
//
// 3. LE CHANTIER LE PLUS VIVANT L'EMPORTE. Quelqu'un chez qui on travaille
//    aujourd'hui est « en cours », même s'il a d'anciens chantiers finis. Il
//    ne passe en « terminé » que quand plus rien ne tourne chez lui.
//
// ⚠ `demarrage` NE VEUT PAS DIRE « DÉMARRÉ » : il veut dire préparé, pas
// encore commencé. Le confondre avec « en cours » donnait six chantiers en
// cours là où il y en a un — c'est pourquoi il n'y va pas.
//
// ⚠ MAIS IL NE PROUVE PAS NON PLUS QU'UN DEVIS A ÉTÉ ACCEPTÉ, et c'est une
// correction du 24/09/2026. Cet état vient de Cloudflare, qui le pose parfois
// sans qu'aucun devis ne soit signé ni aucune facture émise. Un dossier dont
// le devis venait seulement d'être ENVOYÉ s'affichait « Devis accepté » dans
// la base et « Démarrage » dans la pipeline — signalé par Mickael, vérifié :
// devis en brouillon, jamais signé, zéro facture.
//
// Le devis signé est donc le SEUL fait qui vaut acceptation. Mesuré avant le
// changement : sur les six dossiers qui portaient un chantier « demarrage »,
// quatre avaient bien un devis signé et ne bougent pas ; les deux autres
// passent en « Devis en cours », ce qu'ils sont.
import { scope } from './scope.js';

// L'ordre du cycle. « archives » n'y figure pas : on n'y avance pas, on en sort.
export const ORDRE_ETAPES = ['demande', 'rdv', 'devis_encours', 'devis_envoye',
  'devis_accepte', 'chantier_encours', 'chantier_termine'];

export const ETAPES_RGD = [
  { key: 'demande', label: 'Nouvelle demande',
    titre: 'Statut « nouveau prospect », relance ou « contacté »' },
  { key: 'rdv', label: 'RDV', titre: 'Statut « rendez-vous planifié »' },
  { key: 'devis_encours', label: 'Devis en cours',
    titre: 'Devis en préparation, pas encore envoyé au client' },
  { key: 'devis_envoye', label: 'Devis envoyé',
    titre: 'Devis envoyé au client, ni signé ni refusé' },
  { key: 'devis_accepte', label: 'Devis accepté', titre: 'Devis signé' },
  { key: 'chantier_encours', label: 'Chantier en cours',
    titre: 'Chantier commencé, pas encore terminé' },
  { key: 'chantier_termine', label: 'Chantier terminé',
    titre: 'Plus aucun chantier en cours chez cette personne' },
  { key: 'archives', label: 'Archivés', titre: 'Perdus et mis de côté' },
];
export const ETAPES_CLES = ETAPES_RGD.map(e => e.key);

// Le statut de suivi du tableau de bord RGD range une à une sur ces étapes :
// il décrivait déjà ce cycle, il le nommait simplement autrement.
export const ETAPE_DU_STATUT = {
  nouveau_prospect: 'demande', relance_1: 'demande', relance_2: 'demande',
  relance_3: 'demande', a_contacter: 'demande',
  rdv_planifie: 'rdv',
  // ⚠ `devis_envoye` MENAIT À « DEVIS EN COURS » jusqu'au 25/09/2026, et les
  // deux libellés se contredisaient déjà à l'écran : la pastille disait « Devis
  // envoyé », l'onglet « Devis en cours ». Mickael a demandé de séparer les
  // deux — préparer un devis et l'avoir envoyé ne sont pas le même moment, et
  // c'est entre ces deux-là qu'on relance.
  devis_en_cours: 'devis_encours',
  devis_envoye: 'devis_envoye',
  devis_accepte: 'devis_accepte',
  chantier_en_cours: 'chantier_encours',
  chantier_termine: 'chantier_termine',
  perdu: 'archives',
};

// L'inverse : le statut que porte une étape. « demande » n'y figure pas, et
// c'est voulu — cinq statuts y mènent (nouveau, trois relances, contacté), et
// les écraser par un seul perdrait où en est la relance.
export const STATUT_DE_L_ETAPE = {
  rdv: 'rdv_planifie',
  devis_encours: 'devis_en_cours',
  devis_envoye: 'devis_envoye',
  devis_accepte: 'devis_accepte',
  chantier_encours: 'chantier_en_cours',
  chantier_termine: 'chantier_termine',
  archives: 'perdu',
};

// ⚠ « REJETÉE » N'EST PAS UN STATUT DE LA FRISE, ET IL SE LIT « NOUVEAU PROSPECT ».
// `rgd_demandes.statut` peut valoir `rejetee` — deux demandes d'avril 2026 le
// portent. Cette valeur n'a jamais figuré dans le vocabulaire des sept étapes,
// donc elle retombait dans « Nouvelle demande » par le repli, sans que rien ne
// la nomme. Tant qu'aucun menu ne listait les statuts, ça ne se voyait pas ;
// depuis qu'il y en a un, elle y apparaissait comme une étape à part entière.
//
// Règle posée par Mickael le 24/09/2026 : ces demandes SONT des nouveaux
// prospects. On les lit donc comme telles partout — pastille, menu, compte —
// au lieu de les écarter du menu en les laissant dans la liste, ce qui aurait
// donné un total qui ne fait pas la somme de ses parts.
//
// ⚠ LA BASE N'EST PAS TOUCHÉE. C'est une lecture, pas une écriture : les deux
// demandes gardent `rejetee`. Traduire à l'affichage n'autorise pas à réécrire
// une saisie qu'on n'a pas faite. Elle se corrigera d'elle-même au premier
// changement de statut depuis l'écran, qui envoie l'option choisie.
//
// ⚠ ET LE MENU DE SAISIE MENTAIT DÉJÀ, avant tout filtre. `menuStatut` est un
// `<select>` dont les options sont les onze statuts connus : sur une valeur
// absente de la liste, aucune option n'est sélectionnée et le navigateur
// affiche la PREMIÈRE — donc « Nouveau prospect », sans le dire. L'alias rend
// vrai ce que l'écran montrait déjà.
export const ALIAS_STATUT_SUIVI = { rejetee: 'nouveau_prospect' };
export const statutSuiviLu = (v) => ALIAS_STATUT_SUIVI[v] || v;

// Tous les statuts qui mènent à une étape — la relation complète, là où
// `STATUT_DE_L_ETAPE` ne garde que le représentant unique.
//
// ⚠ UNE SEULE ÉTAPE EN RENVOIE PLUS D'UN : « Nouvelle demande », avec ses cinq
// (nouveau, trois relances, à contacter). C'est exactement ce qui justifie un
// filtre de statut là-bas et nulle part ailleurs — sur les six autres onglets
// le menu n'aurait qu'une entrée, c'est-à-dire aucun choix.
//
// ⚠ ELLE NE SUFFIT PAS À CONSTRUIRE UN MENU. `etapeDeFiche` range dans
// « demande » TOUT statut qu'elle ne reconnaît pas (`ETAPE_DU_STATUT[brut] ||
// 'demande'`). Une valeur inattendue en base apparaîtrait donc dans la liste
// sans figurer au menu, et les comptes ne feraient plus la somme de l'onglet.
// L'appelant complète avec les statuts réellement présents.
export const statutsDeLEtape = (etape) =>
  Object.keys(ETAPE_DU_STATUT).filter(k => ETAPE_DU_STATUT[k] === etape);

const JAMAIS_RENSEIGNE = ['nouveau_prospect', '', null, undefined];

// ⚠ UN DEVIS ACCEPTÉ QUI NE DÉMARRE PAS FINIT PAR NE PLUS EN ÊTRE UN.
// Règle posée par Mickael le 24/09/2026 : passé six mois sans que les travaux
// commencent, le dossier part en « Archivés ». Il ne disparaît pas — il quitte
// la liste de travail, où il occupait une place qu'il ne méritait plus.
//
// « Pas démarré » se lit sur l'étape elle-même : `devis_accepte` veut dire
// qu'aucun chantier de cette personne n'est `en_cours` ni `termine`. Une
// facture d'acompte ne compte donc pas comme un démarrage, et c'est voulu —
// les deux dossiers que la règle archive aujourd'hui en ont une chacun, émise
// puis jamais suivie.
const MOIS_AVANT_ARCHIVAGE = 6;

const devisDormant = (f, devis) => {
  const signatures = devis
    .filter(v => memeQue(v, f) && v.statut === 'signe' && v.date_signature)
    .map(v => String(v.date_signature).slice(0, 10));
  if (!signatures.length) return false;
  const derniere = signatures.sort()[signatures.length - 1];
  const limite = new Date();
  limite.setMonth(limite.getMonth() - MOIS_AVANT_ARCHIVAGE);
  return derniere < limite.toISOString().slice(0, 10);
};

// Un devis ou un chantier se rattache à la personne par son contact OU par son
// organisation — un professionnel n'a que la seconde (migration 20260923120000).
const memeQue = (x, f) => (!!x.contact_id && x.contact_id === f.contact_id)
  || (!!x.organisation_id && x.organisation_id === f.organisation_id);

// ⚠ UNE VISITE TECHNIQUE N'EST PAS UN CHANTIER, et on la reconnaît enfin.
// Le commentaire précédent disait qu'elles arrivaient « sans état ET sans
// aucune date », faute de mieux — il annonçait que le test tomberait le jour
// où le relevé passerait la valeur. Ce jour est venu : `statut_d1` est
// transmis depuis le 22/09/2026, et les trois visites techniques portent bien
// une `date_debut_prevue`. L'ancien test les comptait donc comme des
// chantiers ; il ne se voyait pas, aucune n'ayant d'`etat`.
export const estVisiteTechnique = (c) => c.statut_d1 === 'visite_technique';
const estUnChantier = (c) => !estVisiteTechnique(c)
  && (!!c.etat || !!c.date_debut_prevue || !!c.work_start_at);
const devisOuvert = (v) => !['signe', 'refuse', 'expire'].includes(v.statut);
// ⚠ « ENVOYÉ » SE LIT SUR LE DEVIS, PAS SUR LE SUIVI. `rgd_devis.statut`
// distingue déjà `brouillon` de `envoye` — au 25/09/2026, un brouillon et trois
// envoyés. La distinction existait donc dans les données avant d'exister à
// l'écran ; il n'y avait rien à inventer, juste à cesser de les confondre.
// `vu` est du vocabulaire Costructor : un devis consulté par le client a bien
// été envoyé.
const devisEnvoye = (v) => ['envoye', 'vu'].includes(v.statut);

// ⚠ C'EST L'AGENDA QUI DIT SI LE RENDEZ-VOUS EXISTE ENCORE, pas le CRM.
// Une visite technique naît d'un événement Google intitulé « Visite technique :
// … » ; le rendez-vous vit là-bas, et il peut y être déplacé ou annulé sans que
// personne ne vienne le dire ici. On relit donc l'agenda plutôt que de faire
// confiance à une date recopiée.
//
// Le rapprochement se fait par le JOUR, pas par le titre : le chantier reprend
// la date de l'événement au moment où il est créé, alors que les deux libellés
// divergent dès la première correction — l'agenda dit « murs humides » là où le
// chantier a gardé « mur humides ».
//
// ⚠ LA FENÊTRE RELEVÉE EST J-7 → J+30. Au-delà, l'absence d'événement ne prouve
// rien : une visite prévue dans deux mois n'est pas encore relevée. D'où le
// second terme de la règle — une visite à venir compte, même sans événement.
// ⚠ CE MOTIF EXISTE EN DEUX EXEMPLAIRES ET NE PEUT PAS ÊTRE PARTAGÉ.
// L'autre vit dans `supabase/functions/relever-agenda/index.ts` du dépôt
// backend, sous le nom `MOTIF_VISITE` : ce fichier-ci est un module de
// navigateur, celui-là du Deno côté serveur, aucun ne peut importer l'autre.
//
// Là-bas il décide si l'événement laisse son e-mail et sa description dans la
// base ; ici, si le dossier compte comme un rendez-vous. Élargir l'un sans
// l'autre fait remonter des visites que l'écran ne reconnaît pas, ou l'inverse
// — et dans les deux cas le défaut est SILENCIEUX. Les changer ensemble.
const VISITE = /^\s*visite\s+technique/i;
export function joursDeVisite(agenda) {
  const jours = new Set();
  for (const e of agenda || []) {
    if (e.activity !== 'rgd' || !e.day) continue;
    if (VISITE.test(String(e.title || ''))) jours.add(String(e.day).slice(0, 10));
  }
  return jours;
}

// Quels devis comptent à quelle étape.
//
// ⚠ CE N'EST PAS TOUJOURS « LE SIGNÉ », et c'est tout l'objet de cette table.
// À « Devis en cours » rien n'est encore signé : compter les signés afficherait
// une colonne vide sur l'onglet où l'on vient précisément voir ce qu'on est en
// train de chiffrer. Chaque étape compte donc les devis QUI L'Y ONT MISE — les
// mêmes que lit `etapeParLesFaits`, sans quoi un dossier serait rangé dans un
// onglet par un devis et chiffré par un autre.
const DEVIS_DE_L_ETAPE = {
  devis_encours: (v) => devisOuvert(v) && !devisEnvoye(v),
  devis_envoye: devisEnvoye,
  devis_accepte: (v) => v.statut === 'signe',
  chantier_encours: (v) => v.statut === 'signe',
  chantier_termine: (v) => v.statut === 'signe',
};

/** Les étapes où un montant de devis a un sens. */
export const etapeAvecMontant = (etape) => !!DEVIS_DE_L_ETAPE[etape];

/**
 * Le montant HT des devis de cette personne à cette étape.
 *
 * ⚠ UNE SEULE DÉFINITION, LUE PAR LA FICHE ET PAR LE TABLEAU (25/09/2026) :
 * deux calculs séparés auraient fini par ne plus dire la même chose, et l'écart
 * se serait vu comme une erreur de l'un des deux écrans.
 *
 * Rend 0 aux étapes où aucun devis n'existe encore — l'appelant distingue
 * « zéro » de « rien à montrer » avec `etapeAvecMontant`.
 */
export function montantDevisDe(f, devis, etape) {
  const compte = DEVIS_DE_L_ETAPE[etape];
  if (!compte) return 0;
  return (devis || [])
    .filter(v => memeQue(v, f) && compte(v))
    .reduce((t, v) => t + (Number(v.montant_ht) || 0), 0);
}


// L'étape lue sur les FAITS seuls. Elle ne dépend d'aucune saisie, donc elle
// ne ment pas — mais elle ne sait rien avant le premier devis.
export function etapeParLesFaits(f, chantiers, devis, joursVisite) {
  const miens = chantiers.filter(c => memeQue(c, f));
  const ch = miens.filter(estUnChantier);
  if (ch.some(c => c.etat === 'en_cours')) return 'chantier_encours';
  if (ch.some(c => c.etat === 'termine')) return 'chantier_termine';
  const dv = devis.filter(v => memeQue(v, f));
  // ⚠ SEUL UN DEVIS SIGNÉ VAUT ACCEPTATION. Voir l'en-tête : l'état
  // `demarrage` d'un chantier ne le prouve pas, il vient de l'ancien système
  // et peut précéder toute signature.
  if (dv.some(v => v.statut === 'signe')) return 'devis_accepte';
  if (dv.some(devisEnvoye)) return 'devis_envoye';
  if (dv.some(devisOuvert)) return 'devis_encours';
  // ⚠ LE RENDEZ-VOUS EST LE DERNIER FAIT, et il vient après les devis à dessein :
  // quelqu'un chez qui on a déjà signé n'est plus « en rendez-vous », même si
  // une visite reste au calendrier.
  if (miens.filter(estVisiteTechnique).some(c => visiteEnCours(c, joursVisite))) return 'rdv';
  return null;
}

// ⚠ LA FENÊTRE GARANTIE RELEVÉE : J-7 → J+30. C'est un PLANCHER, pas la
// couverture réelle — et la nuance décide du sens de l'erreur.
//
// Le cron relève ces jours-là, toujours. L'écran Agenda en relève d'autres au
// passage, ceux de la semaine qu'on ouvre : la couverture réelle est donc plus
// large, mais elle dépend de ce que quelqu'un a consulté, ce qu'aucun code ne
// peut savoir.
//
// ⚠ NE PAS L'ÉLARGIR À CE QUE L'ÉCRAN *PEUT* COUVRIR. Au-delà de ce plancher,
// l'absence d'événement ne prouve rien, et c'est la date qui décide — lecture
// prudente. Élargir la constante ferait l'erreur inverse, la seule qui coûte :
// une visite supprimée dans Google, un jour que personne n'a ouvert, passerait
// pour encore présente.
//
// Le défaut qui reste est une imprécision, pas une faute : une visite à J+45
// relevée par l'écran sera traitée par sa date alors qu'on sait ce que l'agenda
// en dit. La forme propre n'est pas d'agrandir ce nombre mais de tenir un
// registre des jours relevés — un jour relevé et vide ne laisse aucune trace
// dans `agenda_events`, donc il ne peut pas se déduire des données. Personne ne
// le réclame aujourd'hui.
const FENETRE_RELEVEE = { avant: 7, apres: 30 };

const decalerDeJours = (n) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Une visite technique tient-elle encore ?
//
// ⚠ DANS LA FENÊTRE RELEVÉE, L'AGENDA A LE DERNIER MOT — y compris quand il
// ne dit rien. Un rendez-vous supprimé dans Google disparaît de `agenda_events`
// au relevé suivant : son absence VAUT annulation, et le dossier quitte
// « Visite technique » sans que personne ait à le déplacer à la main. C'est
// tout l'objet de la synchronisation ; se contenter de la date recopiée dans
// le chantier ferait survivre des rendez-vous annulés depuis des semaines.
//
// ⚠ HORS FENÊTRE, L'ABSENCE NE PROUVE RIEN : une visite prévue dans deux mois
// n'est pas encore relevée. C'est la date qui décide alors, et elle seule.
//
// Une visite passée reste comptée tant que l'agenda la porte — Google garde les
// événements passés, donc environ une semaine. C'est la fenêtre pendant
// laquelle on a encore le rendez-vous en tête et un devis à envoyer.
function visiteEnCours(c, joursVisite) {
  const jour = String(c.date_debut_prevue || c.work_start_at || '').slice(0, 10);
  if (!jour) return false;
  if (joursVisite) {
    if (joursVisite.has(jour)) return true;
    if (jour >= decalerDeJours(-FENETRE_RELEVEE.avant)
      && jour <= decalerDeJours(FENETRE_RELEVEE.apres)) return false;
  }
  return jour >= decalerDeJours(0);
}

// L'étape d'une fiche `rgd_clients`. Les deux tables sont passées en argument
// pour que l'appelant qui en tient déjà une copie ne la relise pas à chaque
// ligne — `etapesRgd()` ci-dessous les lit une fois pour toutes.
export function etapeDeFiche(f, chantiers, devis, joursVisite) {
  if (f.statut === 'perdu' || f.statut_suivi === 'perdu') return 'archives';
  // Lu, pas brut : « rejetee » se lit « nouveau_prospect », donc il passe par
  // `etapeParLesFaits` comme lui au lieu de tomber dans le repli « demande ».
  const brut = statutSuiviLu(f.statut_suivi);
  const e = !JAMAIS_RENSEIGNE.includes(brut)
    ? (ETAPE_DU_STATUT[brut] || 'demande')
    : (etapeParLesFaits(f, chantiers, devis, joursVisite) || 'demande');
  // ⚠ LA SEULE RÈGLE OÙ UN FAIT DÉFAIT UNE SAISIE, et il faut le dire.
  // Partout ailleurs une valeur posée à la main l'emporte. Ici c'est cette
  // valeur même qui a expiré : quelqu'un a écrit « devis accepté » il y a plus
  // de six mois, et depuis rien n'a commencé. Respecter la saisie garderait le
  // dossier en tête de liste pour toujours, ce qui est précisément ce que la
  // règle vient corriger.
  if (e === 'devis_accepte' && devisDormant(f, devis)) return 'archives';
  return e;
}

// L'étape d'une demande du formulaire du site. Elle n'a ni devis ni chantier
// rattaché : son statut seul décide.
export function etapeDeDemande(d) {
  if (d.statut === 'perdu') return 'archives';
  return ETAPE_DU_STATUT[d.statut] || 'demande';
}

// ⚠ UNE FICHE N'ENTRE DANS LA FRISE QUE SI ELLE VIENT D'UNE PROSPECTION, OU
// SI ELLE A DÉPASSÉ LA PREMIÈRE ÉTAPE. Les 147 fiches Costructor dorment à
// « nouveau_prospect » : sans ce garde, elles rempliraient « Nouvelle demande »
// de gens qui ne sont pas des demandes.
//
// ⚠ `google_calendar` A ÉTÉ AJOUTÉ LE 24/09/2026, et son absence coûtait cher.
// Une fiche née d'une visite technique posée dans l'agenda EST une demande —
// c'en est même la forme la plus nette. Tant qu'elle restait hors de cette
// liste, elle ne se voyait qu'à partir de l'étape « RDV » : la ramener à
// « Nouvelle demande » la faisait DISPARAÎTRE de l'écran, sans message et sans
// trace. Mickael l'a signalé en croyant l'avoir supprimée — « il s'est
// supprimé, remets-le-moi » —, et il n'avait aucune raison de penser autre
// chose : la ligne s'évanouissait.
//
// Ce garde protège des fiches QUI N'ONT JAMAIS ÉTÉ DES DEMANDES — l'annuaire
// Costructor repris en bloc. Il n'a jamais eu pour but d'écarter une personne
// dont on a noté le rendez-vous.
export const estProspectParSource = (f) => !!f.apporteur_id || f.source === 'meta_ads'
  || f.source === 'Formulaire site' || f.source === 'manuel'
  || f.source === 'google_calendar';

// Les sept étapes avec leur compte, sur la même population que l'écran
// « Clients & prospects ». C'est ce que lit le pipeline de la vue d'ensemble.
export function etapesRgd() {
  const fiches = scope.rgd('rgd_clients');
  const demandes = scope.rgd('rgd_demandes');
  const chantiers = scope.rgd('rgd_chantiers');
  const devis = scope.rgd('rgd_devis');
  // Les jours de visite se calculent UNE FOIS : le faire par fiche relirait
  // l'agenda deux cents fois pour le même résultat.
  const joursVisite = joursDeVisite(scope.rgd('agenda_events'));

  const comptes = Object.fromEntries(ETAPES_CLES.map(k => [k, 0]));
  for (const d of demandes) comptes[etapeDeDemande(d)] += 1;
  for (const f of fiches) {
    const e = etapeDeFiche(f, chantiers, devis, joursVisite);
    if (e === 'demande' && !estProspectParSource(f)) continue;
    comptes[e] += 1;
  }
  return ETAPES_RGD.map(e => ({ ...e, n: comptes[e.key] }));
}

// ---------------------------------------------------------------- écriture
// Changer l'étape d'une personne, c'est écrire son STATUT — il n'y a pas
// d'autre levier, et c'est voulu : un bouton qui déplacerait l'affichage sans
// écrire mentirait dès le relevé suivant.
//
// ⚠ DEUX CHEMINS D'ÉCRITURE, ET LE BON DÉPEND DE L'ORIGINE DE LA FICHE.
// Une fiche venue de Cloudflare s'écrit À LA SOURCE : l'écrire dans le reflet
// ne servirait à rien, le relevé suivant rétablirait l'ancienne valeur. Une
// fiche née dans le CRM n'existe pas chez le worker — lui envoyer un `d1_id`
// vide donnerait une erreur, et Supabase est sa seule adresse.
//
// Cette fonction est la SEULE porte : la liste et la fiche l'appellent toutes
// les deux. Deux chemins auraient dérivé l'un de l'autre à la première
// correction.
export async function ecrireStatut({ d1Id, uuid, cible, statut }) {
  const { db } = await import('./db.js');
  const { majStatutClient, majStatutDemande } = await import('./rgd-api.js');
  const table = cible === 'demande' ? 'rgd_demandes' : 'rgd_clients';
  const champ = cible === 'demande' ? 'statut' : 'statut_suivi';

  if (!d1Id) {
    return db.update(table, uuid, { [champ]: statut })
      .then(() => ({ ok: true, natif: true }))
      .catch(e => ({ ok: false, motif: String(e.message || e).slice(0, 80) }));
  }
  const r = cible === 'demande'
    ? await majStatutDemande(d1Id, statut)
    : await majStatutClient(d1Id, statut);
  // On avance le reflet local : le relevé confirmera dans la demi-heure, mais
  // l'écran ne doit pas revenir en arrière sous les yeux de qui vient de
  // changer la valeur.
  if (r.ok) {
    const ligne = scope.rgd(table).find(x => String(x.d1_id) === String(d1Id));
    if (ligne) ligne[champ] = statut;
  }
  return { ...r, natif: false };
}
