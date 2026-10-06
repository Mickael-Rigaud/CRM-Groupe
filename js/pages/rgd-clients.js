// Espace RGD Renova — clients & prospects
//
// LA MISE EN PAGE EST CELLE DU TABLEAU DE BORD, DÉLIBÉRÉMENT
// Onglets à compteur, barre de filtres, tableau. Pas d'indicateurs en tête :
// Mickael les a fait retirer le 22/09/2026 — sur un écran d'annuaire, quatre
// grandes cartes repoussent la liste sous la ligne de flottaison pour répéter
// ce que les onglets disent déjà.
//
// SEPT ÉTAPES, PLUS L'ANNUAIRE — refondu le 23/09/2026
// L'écran suivait trois rubriques qui se chevauchaient (Clients, Prospects,
// Contacts). Il suit désormais le CYCLE D'UN DOSSIER, comme la base de BTP
// Expertise : Nouvelle demande · RDV · Devis en cours · Devis accepté ·
// Chantier en cours · Chantier terminé · Archivés. Une personne n'apparaît
// qu'une fois, à l'endroit où elle en est — **l'étape la plus avancée gagne**,
// sinon on compte les gens deux fois.
//
// « Contacts » reste à part, et c'est voulu : ce n'est pas une étape, c'est
// l'annuaire des fiches connues de Costructor, avec ses propres filtres.
//
// ⚠ CE QUI DÉCIDE DE L'ÉTAPE, CE SONT DES FAITS — PAS DES ÉTIQUETTES
// Mesuré le 23/09/2026, trois champs de statut mentent dans cette base :
//   `statut_suivi`    vaut « nouveau_prospect » sur 190 fiches sur 194
//   `client_confirme` veut dire « devis accepté », pas « client »
//   `date_debut_reelle` / `date_fin_reelle` : VIDES sur les 26 chantiers
// L'étape se lit donc sur les devis et les chantiers eux-mêmes.
//
// ⚠ ET `etat` DE CHANTIER A TROIS VALEURS, PAS DEUX
// `demarrage` ne veut PAS dire « démarré » : il veut dire préparé, pas encore
// commencé. Il va donc en « Devis accepté », avec les devis signés dont le
// chantier n'a pas commencé. Les avoir confondus donnait six chantiers en
// cours là où il y en a un — arbitré par Mickael le 23/09/2026.
//
// ⚠ ON NE CORRIGE PAS UNE ÉTIQUETTE AVEC LES DATES PRÉVUES
// Essayé le même jour, et faux dans les deux sens : Gouvieux tourne alors que
// sa fin prévue est dépassée de 45 jours, et Saint Quentin est dans sa fenêtre
// sans avoir commencé. Les dates de chantier sont des PRÉVISIONS. Une ligne
// fausse se corrige à la source — c'est ce qui a été fait pour Saint Vaast les
// mello — et surtout pas par une règle taillée sur elle, qui finirait par
// écarter un chantier vrai.
//
// CE QUI FAIT UN CLIENT : UN CHANTIER DÉMARRÉ
// Définition de Mickael, 23/09/2026. Donc les étapes « Chantier en cours » et
// « Chantier terminé » réunies — et c'est ce que vaut le filtre « Clients » de
// l'annuaire, pas `client_confirme`.
//
// LE CHIFFRE « CLIENTS » A DEUX VALEURS, ET CE N'EST PAS NOUS
// Le badge du tableau de bord affiche 34 quand 41 fiches portent un devis
// accepté : Costructor dédoublonne par nom+prénom pour le compte, pas pour la
// liste. L'onglet montre 41 — ce sont les lignes qu'on peut ouvrir — et
// l'infobulle dit d'où vient le 34.
//
// LES PROSPECTS VIENNENT DE DEUX TABLES
// « Prospect site » lit `rgd_demandes`, une table à part : une demande du
// formulaire n'a pas forcément de fiche client. Les trois autres lisent
// `rgd_clients`. Les colonnes diffèrent donc d'un sous-onglet à l'autre, comme
// dans l'original — une demande a un projet et un budget annoncés, une fiche a
// un statut et une adresse.
//
// LE STATUT ET LE COMMENTAIRE S'ÉCRIVENT ICI, DANS LE CRM
// ⚠ ET C'ÉTAIT L'INVERSE JUSQU'AU 25/09/2026, ce qui explique la forme de ce
// fichier. L'écran lisait un reflet relevé toutes les 30 minutes, donc écrire
// dedans n'aurait servi à rien : le relevé suivant l'aurait écrasé sans un
// mot. Le menu partait à la SOURCE, dans l'application RGD, avec le jeton de
// la connexion unique. La synchronisation a cessé de reposer `statut_suivi`,
// `notes`, `statut` et `commentaire_admin`
// (`rgd_clients_et_demandes_sortent_du_releve`) : le CRM est la source, et
// une simple écriture tient.
//
// ⚠ CE QUI A DISPARU AVEC LE DÉTOUR, ET QU'IL NE FAUT PAS REMETTRE :
//   · le second chemin d'écriture. Une fiche venue de l'application s'écrivait
//     là-bas, une fiche née ici dans Supabase ; `data-id` disait laquelle on
//     tenait. Il n'y a plus qu'une adresse, et `data-uuid` suffit.
//   · les deux effets de bord — le renvoi des champs portables vers Costructor
//     et l'email à l'apporteur. Le premier est une décision de Mickael : la
//     base de référence est celle du CRM. Le second est inerte, `apporteur_id`
//     étant nul sur les 192 fiches.
//   · la condition « avoir un compte de l'application RGD ». Le seul droit qui
//     compte est `has_activity('rgd')`, dont `scope.canRgd` est le miroir : le
//     menu se ferme à qui la base le ferme, plus à qui n'a pas de second
//     compte.
//
// L'AFFICHAGE AVANCE, ET REVIENT SI ÇA ÉCHOUE
// Il n'y a plus de reflet à avancer — `db.update` remet la ligne dans le
// cache — mais la pastille, elle, est repeinte avant le redessin : redessiner
// tout de suite remplacerait le menu que la personne vient d'ouvrir. En cas de
// refus, la ligne reprend sa valeur d'avant et le motif s'affiche.
import { scope } from '../data/scope.js';
// ⚠ LES DÉFINITIONS D'ÉTAPE VIVENT DANS `rgd-etapes.js`, PAS ICI.
// Le pipeline de la vue d'ensemble les lit aussi : les garder dans cet écran
// obligerait l'autre à les recopier, et deux copies dérivent toujours. Ce
// fichier n'en garde que l'usage.
import { ORDRE_ETAPES, ETAPES_RGD, ETAPES_CLES, ETAPE_DU_STATUT, STATUT_DE_L_ETAPE,
         etapeDeFiche, etapeDeDemande, estProspectParSource,
         joursDeVisite, statutsDeLEtape, statutSuiviLu,
         montantDevisDe, etapeAvecMontant, ecrireStatut, derniereRelance,
         rangRelanceDuStatut, majDateRelance, aujourdhui,
         visiteDeLaFiche } from '../data/rgd-etapes.js';
import { sansNoteAuto } from '../data/rgd-projet.js';
import { db } from '../data/db.js';
import { esc, eur, fmtDate, fmtDateTime, relDay, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { majNote } from '../data/rgd-clients.js';
import { toast } from '../ui.js';
import { supprimerFiche, boutonSuppression, restaurerFiche, purgerFiche } from './rgd-prospect-saisie.js';
import { nouvelleDemandeRgd } from './rgd-projet.js';
import { attribuerEnLotRgd } from './rgd-attribuer-lot.js';
import { ouvrirFicheRgd } from './rgd-fiche.js';

const s_ = (n) => (n > 1 ? 's' : '');

// Combien de lignes par page. Quinze, arbitre par Mickael le 24/09/2026 apres
// avoir essaye vingt-cinq : ca tient dans un ecran sans faire defiler, et une
// liste qu'on parcourt du regard vaut mieux qu'une page de moins a tourner.
// C'est le seul chiffre a changer.
const PAR_PAGE = 15;

// LES STATUTS DE SUIVI, dans l'ordre du tableau de bord (`STATUTS_DEMANDE`).
// Ils décrivent l'avancement d'un prospect, du premier contact au chantier.
// Les tons suivent ceux de l'original : gris au départ, ambre quand on a
// parlé, bleu quand un rendez-vous est posé, orange sur le devis, vert quand
// le chantier tourne, rouge quand c'est perdu.
const STATUTS_SUIVI = [
  { key: 'nouveau_prospect',  label: 'Nouveau prospect',    ton: 'muted' },
  { key: 'relance_1',         label: 'Relance 1',           ton: 'muted' },
  { key: 'relance_2',         label: 'Relance 2',           ton: 'muted' },
  { key: 'relance_3',         label: 'Relance 3',           ton: 'muted' },
  { key: 'a_contacter',       label: 'Contacté',            ton: 'amber' },
  { key: 'rdv_planifie',      label: 'Rendez-vous planifié', ton: 'bleu' },
  { key: 'devis_en_cours',    label: 'Devis en cours',      ton: 'accent' },
  { key: 'devis_envoye',      label: 'Devis envoyé',        ton: 'accent' },
  { key: 'devis_accepte',     label: 'Devis accepté',       ton: 'accent' },
  { key: 'chantier_en_cours', label: 'Chantier en cours',   ton: 'green' },
  { key: 'chantier_termine',  label: 'Chantier terminé',    ton: 'green' },
  { key: 'perdu',             label: 'Perdu',               ton: 'red' },
];

// Les statuts de FICHE, qui sont autre chose : ils disent ce qu'est la
// personne, pas où en est l'affaire. Deux vocabulaires, deux colonnes
// (`statut` et `statut_suivi`), et les confondre ferait un filtre qui ne rend
// jamais rien.
const STATUTS_FICHE = [
  { key: 'prospect',   label: 'Prospect',   ton: '' },
  { key: 'client',     label: 'Client',     ton: 'green' },
  { key: 'partenaire', label: 'Partenaire', ton: 'accent' },
  { key: 'qualifie',   label: 'Qualifié',   ton: 'amber' },
  { key: 'inactif',    label: 'Inactif',    ton: 'muted' },
  { key: 'perdu',      label: 'Perdu',      ton: 'red' },
];

const dit = (liste, cle) => liste.find(x => x.key === cle)
  || { key: cle, label: String(cle || '').replace(/_/g, ' '), ton: '' };

// Un statut absent vaut « nouveau prospect » côté suivi, comme dans le
// tableau de bord : une fiche jamais touchée n'est pas une fiche sans état.
const pastilleSuivi = (cle) => {
  const st = dit(STATUTS_SUIVI, cle || 'nouveau_prospect');
  return `<span class="chip st-${esc(st.key)}">${esc(st.label)}</span>`;
};

// Le menu déroulant, aux couleurs du statut courant — comme dans le tableau de
// bord, où la couleur se lit sans ouvrir la liste. `data-cible` dit quelle
// table écrire, `data-uuid` quelle ligne.
// ⚠ IL PORTAIT LES DEUX IDENTIFIANTS jusqu'au 25/09/2026 — celui du CRM et
// celui de l'application RGD — parce que la destination dépendait de l'origine
// de la fiche. Une seule adresse, un seul identifiant : `d1_id` n'a plus rien
// à faire ici.
const menuStatut = (cle, cible, uuid) => {
  const courant = cle || 'nouveau_prospect';
  return `<select class="statut-menu st-${esc(courant)}" data-cible="${esc(cible)}"
    data-uuid="${esc(String(uuid ?? ''))}"
    data-avant="${esc(courant)}" aria-label="Statut">
    ${STATUTS_SUIVI.map(st => `<option value="${esc(st.key)}" ${st.key === courant ? 'selected' : ''}>${esc(st.label)}</option>`).join('')}
  </select>`;
};
// Le commentaire libre, modifiable sur place. Deux colonnes selon la table :
// `notes` pour une fiche client, `commentaire_admin` pour une demande du site.
// Ce sont les noms d'origine ; les renommer aurait cassé la lecture pour rien.
//
// ⚠ QUI PEUT ÉCRIRE NE DÉPEND PLUS DE LA LIGNE mais de l'écran, depuis le
// 25/09/2026. Il fallait auparavant un compte de l'application RGD pour
// toucher à une fiche qui en venait, et rien de plus que l'activité RGD pour
// une fiche née ici : deux droits sur la même colonne, selon d'où la ligne
// arrivait. `scope.canRgd` décide pour les deux.
// ⚠ C'EST UN `textarea` DEPUIS LE 30/09/2026, ET PLUS UN `input` (demandé par
// Mickael : « il faut dérouler toute la ligne pour voir l'entièreté du
// commentaire »). Un champ d'une seule ligne cache tout ce qui dépasse derrière
// un défilement horizontal qu'on ne voit pas : le commentaire était là, mais
// illisible sans cliquer dedans et parcourir au clavier. Un commentaire qu'on
// ne lit pas d'un coup d'œil ne sert à rien dans un tableau.
//
// ⚠ IL N'A PAS DE `rows` FIXE : `ajusterNotes()` cale sa hauteur sur son
// contenu, après le rendu et à chaque frappe. Une hauteur figée à deux ou trois
// lignes remplacerait un défilement horizontal par un vertical, dans une case
// encore plus petite.
//
// ⚠ ENTRÉE Y FAIT UN RETOUR À LA LIGNE, et c'est voulu — un commentaire d'appel
// s'écrit souvent en deux temps. L'enregistrement part au `change`, donc en
// quittant le champ, exactement comme avant : le gestionnaire n'a pas changé.
// ⚠ LA COLONNE DIT LA MÊME CHOSE QUE LA FICHE (02/10/2026, demandé : « je veux
// que ces commentaires là soient liés avec la colonne commentaire du
// tableau »). Les deux écrivent la même colonne par `majNote`, et depuis le
// 05/10/2026 elles affichent la même chose aussi : RIEN QUE CE QU'ON A ÉCRIT.
//
// ⚠ LA REPRISE DE LA DESCRIPTION DU RENDEZ-VOUS A ÉTÉ RETIRÉE le 05/10/2026
// (demandé : « dans commentaires, je ne veux que les commentaires que nous
// laissons »). Sur une note vide, la colonne montrait le texte noté dans Google
// Agenda, en italique atténué, jusqu'au premier mot tapé. **Ne pas la
// remettre**, et surtout pas d'un seul côté : c'est précisément l'écart
// d'affichage entre la fiche et la colonne qui avait été signalé le 02/10.
//
// Sont partis avec elle `repriseDuRdv`, la classe `est-repris` et l'infobulle
// « Repris du rendez-vous » ; `rendezVousDeLaFiche` et
// `coordonneesDuRendezVous` ne sont plus lus ici.

const champNote = (ligne, cible) => {
  // ⚠ LA NOTE DU ROBOT N'EST PAS UN COMMENTAIRE : « Créé automatiquement depuis
  // Google Agenda le … » occupait la colonne où l'on écrit ce qu'on retient
  // d'un appel. `sansNoteAuto` est la MÊME règle que la fiche et le formulaire
  // — une règle d'affichage appliquée à un seul endroit sur trois n'en est pas
  // une.
  const v = sansNoteAuto(cible === 'demande' ? ligne.commentaire_admin : ligne.notes);
  // ⚠ EN LECTURE SEULE AUSSI LE TEXTE S'ENROULE : `.rcl-note` porte le
  // `white-space` qu'il faut, sinon une longue note sortirait du tableau au
  // lieu d'être tronquée — et personne ne verrait qu'il en manque.
  if (!scope.canRgd) return v
    ? `<span class="note-lue" title="Commentaire">${esc(v)}</span>`
    : '<span class="muted">—</span>';
  return `<textarea class="note-champ" data-cible="${esc(cible)}"
    data-uuid="${esc(ligne.id)}" rows="1" title="Commentaire"
    placeholder="Commentaire…" aria-label="Commentaire">${esc(v)}</textarea>`;
};

// La hauteur suit le contenu. `scrollHeight` se lit après avoir remis la
// hauteur à zéro : sans cette remise, un champ qu'on raccourcit garderait la
// hauteur qu'il avait au plus long.
function ajusterNote(champ) {
  champ.style.height = 'auto';
  champ.style.height = `${Math.min(champ.scrollHeight, 220)}px`;
}

const pastilleFiche = (cle) => cle
  ? `<span class="chip st-${esc(dit(STATUTS_FICHE, cle).key)}">${esc(dit(STATUTS_FICHE, cle).label)}</span>`
  : '<span class="muted">—</span>';

// Les quatre provenances de prospect du tableau de bord, dans son ordre.
// L'annuaire n'est pas une étape : on n'y cherche pas « où en est le dossier »
// mais « qui est cette personne ». Ses filtres sont donc des natures, pas des
// moments — et « Client » y vaut CHANTIER DÉMARRÉ, la définition de Mickael.
// ⚠ LES SOUS-ONGLETS « Tous / Partenaires / Clients / Prospects » ONT ETE
// RETIRES le 24/09/2026, a la demande de Mickael. Ils faisaient une seconde
// rangee d'onglets sous les sept etapes, pour dire la meme chose que le menu
// de statut d'a cote — deux commandes pour un seul choix, et aucune des deux
// ne montrait ce que l'autre avait retenu.
//
// Le choix vit desormais dans le menu deroulant. Il n'est pas perdu :
// `?vue=clients`, que portent des mails de notification deja partis, y arrive
// toujours (voir l'etat initial).

// Les huit onglets de l'ecran : les sept etapes du module, plus l'annuaire,
// qui n'est PAS une etape — d'ou la separation visuelle dans la barre.
const ONGLETS_CLES = [...ETAPES_CLES, 'contacts'];

// D'OÙ VIENT UN PROSPECT — une colonne, plus quatre sous-onglets
// Les sous-onglets « Prospect site / partenaire / Meta Ads / autre » ont été
// retirés le 23/09/2026 : découper la liste par provenance obligeait à ouvrir
// quatre onglets pour voir quinze personnes. La provenance est une PROPRIÉTÉ
// d'un prospect, pas un endroit où le ranger — elle devient une colonne.
//
// ⚠ LA MEILLEURE SOURCE, C'EST LA PERSONNE ELLE-MÊME.
// Le formulaire du site demande « comment nous avez-vous connus », et la
// réponse est plus fiable que tout ce qu'on pourrait déduire : elle distingue
// une recommandation d'un passage par les réseaux, ce qu'aucun champ technique
// ne sait faire. Elle passe donc AVANT la déduction par `source`.
//
// L'ordre ci-dessous est celui de la décision, du plus sûr au plus vague, et
// « Direct » est le dernier recours — jamais un défaut qu'on attribue vite.
const PROVENANCES = [
  { key: 'partenaire',  label: 'Partenaire',      ton: 'prov-partenaire' },
  { key: 'meta',        label: 'Meta Ads',        ton: 'prov-meta' },
  { key: 'reco',        label: 'Recommandation',  ton: 'prov-reco' },
  { key: 'reseaux',     label: 'Réseaux sociaux', ton: 'prov-reseaux' },
  { key: 'site',        label: 'Site',            ton: 'prov-site' },
  { key: 'direct',      label: 'Direct',          ton: 'prov-direct' },
];
const ditProvenance = (cle) => PROVENANCES.find(x => x.key === cle) || PROVENANCES[5];

// Le « connu via » du formulaire, tel que la personne l'a coché.
const VIA = (txt) => {
  const t = String(txt || '').toLowerCase();
  if (t.includes('recommand') || t.includes('bouche')) return 'reco';
  if (t.includes('réseau') || t.includes('reseau') || t.includes('facebook')
      || t.includes('instagram') || t.includes('linkedin')) return 'reseaux';
  return null;   // « Recherche Google », « Publicité »… restent du site
};

// Reculer une personne dans le cycle, sans ouvrir le menu.
// ⚠ LE BOUTON ÉCRIT UN STATUT, il ne déplace pas une ligne : c'est le statut
// qui décide de l'onglet, donc tout passe par lui. Un bouton qui bougerait
// l'affichage sans écrire mentirait dès le prochain relevé.
//
// ⚠ LA FLÈCHE « AVANCER » A ÉTÉ RETIRÉE LE 30/09/2026, demandée. Elle faisait
// franchir une étape d'un seul clic, sur une ligne d'un tableau qu'on parcourt
// à la souris — et avancer un prospect n'est pas un geste anodin : ça le sort
// de la liste qu'on est en train de travailler, et depuis le 30/09 ça DATE une
// relance. Le menu de statut reste, juste à côté : il demande de choisir où
// l'on va, ce qui est le bon niveau d'intention pour une étape franchie.
// **Ne pas la remettre** sans en reparler.
//
// ⚠ LE RETOUR EN ARRIÈRE RESTE : il répare, il n'engage rien. C'est
// précisément ce qu'on cherche après un clic de trop.
const flechesEtape = (etape, ecriture) => {
  if (!ecriture) return '';
  const i = ORDRE_ETAPES.indexOf(etape);
  // « Archivés » est hors du cycle : depuis là, le retour ramène au début.
  const avant = etape === 'archives' ? 'a_contacter'
    : i > 0 ? STATUT_DE_L_ETAPE[ORDRE_ETAPES[i - 1]] || 'a_contacter' : null;
  if (!avant) return '';
  return `<span class="rcl-fleches">
    <button type="button" class="rcl-fleche" data-vers="${avant}"
      title="Reculer d’une étape">‹</button>
  </span>`;
};

// ⚠ ON DIT LES JOURS, PAS SEULEMENT LA DATE : au téléphone la question est
// « ça fait combien de temps ? », et personne ne compte les jours de tête entre
// le 24 et aujourd'hui. Le rang (« R2 ») dit où on en est des trois relances.
// ⚠ « dans n j » EXISTE BIEN QUE LA SAISIE REFUSE LE FUTUR : une date déjà en
// base peut l'être, et « il y a -340 j » ne se lit pas.
// Le format du champ de saisie juste au-dessus (28/09/2026), pas celui de
// `fmtDate` (« 28 sept. 2026 ») : deux écritures d'une date dans la même
// cellule se lisent comme deux natures de date, et la forme longue passait à la
// ligne dès qu'il y avait deux relances à rappeler.
const jourCourt = (jour) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR');

const anciennete = (jour) => {
  const j = Math.round((Date.now() - new Date(`${jour}T12:00:00`).getTime()) / 86400000);
  return j === 0 ? 'aujourd’hui' : j === 1 ? 'hier'
    : j < 0 ? `dans ${-j} j` : `il y a ${j} j`;
};

// ⚠ LA DATE SE SAISIT DANS LE TABLEAU DEPUIS LE 01/10/2026, demandé : « je ne
// veux pas être obligée d'ouvrir la fiche client pour sélectionner la date ».
// On relance au téléphone en descendant cette liste : ouvrir une fiche pour
// corriger un jour, la refermer, passer à la ligne suivante, c'est trois gestes
// là où il en faut un, vingt-cinq fois de suite.
//
// ⚠ UN SEUL CHAMP, PAS TROIS : trois sélecteurs par ligne feraient
// soixante-quinze champs sur une page, dont les deux tiers vides. Le champ
// porte LA relance en cours (`rangRelanceDuStatut`), les autres dates se lisent
// dessous. La fiche garde les trois — c'est là qu'on rattrape une R1 jamais
// datée.
//
// ⚠ ET IL N'APPARAÎT QUE SUR « Relance 1 · 2 · 3 », demandé le jour même : un
// champ vide sur chaque ligne de l'onglet posait la question à des dossiers que
// personne n'a jamais rappelés. Partout ailleurs la cellule se LIT — elle ne
// disparaît pas : un prospect revenu à « À contacter » garde ses relances
// passées, et les cacher les rendrait introuvables depuis la liste.
//
// ⚠ LES DEUX LIGNES DE DESSOUS SONT TOUJOURS RENDUES, VIDES AU BESOIN, et le
// CSS les efface par `:empty` : après une écriture on remet un `textContent`
// au lieu de refabriquer la cellule. Refabriquer voudrait dire rebrancher le
// gestionnaire, et remplacer le champ sous le doigt de qui vient d'y saisir.
const celluleRelance = (ligne, statut, cible) => {
  const r = derniereRelance(ligne);
  // Au-delà de deux semaines sans nouvelle, le rang se signale : c'est le
  // moment où l'on perd le dossier sans s'en apercevoir. ⚠ Le signal se lit sur
  // la relance LA PLUS RÉCENTE, pas sur le champ proposé : c'est le dossier qui
  // refroidit, pas la case.
  const froid = r && r.jours >= 14 ? ' est-vieux' : '';
  const lecture = () => (r
    ? `<b class="rcl-relance${froid}">R${r.rang}</b> ${esc(fmtDate(r.jour))}
       <span class="muted">(${esc(anciennete(r.jour))})</span>`
    : '<span class="muted">—</span>');
  const rang = rangRelanceDuStatut(statut);
  if (!scope.canRgd || !rang) return lecture();
  const jour = ligne[`relance_${rang}_le`] || '';
  // Les relances d'avant, en lecture : la colonne dit « dernière relance », mais
  // on appelle quelqu'un en sachant qu'on l'a déjà appelé deux fois. Les
  // montrer coûte une ligne, les cacher coûte un aller-retour dans la fiche.
  const autres = [1, 2, 3]
    .filter(n => n !== rang && ligne[`relance_${n}_le`])
    .map(n => `R${n} ${esc(jourCourt(ligne[`relance_${n}_le`]))}`)
    .join(' · ');
  return `<div class="rcl-rel-cell">
    <div class="rcl-rel-ligne"><b class="rcl-relance${froid}">R${rang}</b>
      <input type="date" class="rcl-rel-champ" value="${esc(jour)}"
        max="${esc(aujourdhui())}" data-rel-uuid="${esc(ligne.id)}"
        data-rel-cible="${esc(cible)}" data-rel-rang="${rang}"
        aria-label="Date de la relance ${rang}"></div>
    <span class="muted rcl-rel-age">${jour ? esc(anciennete(jour)) : ''}</span>
    <span class="muted rcl-rel-avant">${autres}</span>
  </div>`;
};

// Ce qui change dans la cellule après une écriture, et rien d'autre : la
// durée écoulée, et l'ambre du rang. Le champ lui-même n'est pas touché.
const rafraichirRelance = (champ, ligne, jour) => {
  const cell = champ.closest('.rcl-rel-cell');
  if (!cell) return;
  cell.querySelector('.rcl-rel-age').textContent = jour ? anciennete(jour) : '';
  const r = derniereRelance(ligne);
  cell.querySelector('.rcl-relance').classList.toggle('est-vieux', !!(r && r.jours >= 14));
};

const pastilleProvenance = (cle) => {
  const p = ditProvenance(cle);
  return `<span class="chip prov ${p.ton}">${esc(p.label)}</span>`;
};

// ⚠ LA FICHE D'UNE PERSONNE SE FABRIQUE ICI, ET NULLE PART AILLEURS.
// L'écran Chantiers ouvre la même (voir `ouvrirFicheDuClient` plus bas) : la
// recopier là-bas donnerait deux fiches pour une même personne, qui
// divergeraient à la première colonne ajoutée. C'est la règle du projet —
// une définition, un endroit.
//
// `etapeDe` est passée en argument plutôt que recalculée : l'appelant tient
// déjà les tables des devis, des chantiers et de l'agenda, et les relire par
// fiche multiplierait le travail par deux cents.
// ⚠ CES TROIS-LÀ VIVENT AU NIVEAU DU MODULE, ET C'EST UNE CORRECTION.
// Elles étaient définies DANS `render`, alors que `ficheDe` — exportée, et
// appelée depuis l'écran Chantiers — les utilise. Résultat : un
// `ReferenceError: qui is not defined` à chaque ouverture de fiche, et comme
// `render` vide sa zone avant de lever, un écran blanc sans un mot. Signalé
// par Mickael le 24/09/2026 ; c'est le garde-fou posé le même jour dans
// `app.js` qui a fini par nommer la cause.
//
// Aucune ne dépend de la portée qu'elle a quittée : `qui` et `adresseDe` ne
// lisent que `db`, `provenanceFiche` que les champs de la fiche. Rien à
// passer en argument, rien à recalculer.

// La personne derrière la fiche : un particulier est un contact, un
// professionnel une organisation. `push_rgd` range, on relit.
const qui = (f) => {
  const c = f.contact_id && db.byId('contacts', f.contact_id);
  if (c) return { nom: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
                  famille: c.last_name || c.first_name || '',
                  prenom: c.first_name || '', cree: c.created_at,
                  email: c.email,
                  tel: c.phone, adresse: c.address, cp: c.postal_code, ville: c.city,
                  type: 'particulier' };
  const o = f.organisation_id && db.byId('organisations', f.organisation_id);
  if (o) return { nom: o.name, famille: o.name || '', prenom: '', cree: o.created_at,
                  email: o.email, tel: o.phone, adresse: o.address,
                  cp: o.postal_code, ville: o.city, type: 'professionnel' };
  return null;
};
const adresseDe = (p) => [p?.adresse, [p?.cp, p?.ville].filter(Boolean).join(' ')]
  .filter(Boolean).join(' ') || '—';

// Dans l'annuaire, le nom de famille passe devant. Demande de Mickael le
// 24/09/2026, et c'est la suite logique du tri : la colonne est rangee par nom
// de famille, donc lire « Mickael Rigaud » dans une liste classee a R oblige a
// sauter du debut a la fin de chaque ligne pour suivre l'ordre.
//
// ⚠ AILLEURS ON NE TOUCHE A RIEN. La frise se lit par date d'arrivee, pas par
// nom, et la fiche ouverte porte un titre, pas une entree d'index. Inverser
// partout ferait un « Rigaud Mickael » en en-tete de fiche, ce qui ne se dit
// pas.
//
// ⚠ DEUX CAS OU L'ON N'INVERSE PAS, et ils ne sont pas theoriques :
//   · une organisation n'a pas de prenom, son nom s'ecrit tel quel ;
//   · un contact sans nom de famille voit `famille` retomber sur son prenom,
//     et l'inversion ecrirait deux fois le meme mot.
const nomIndexe = (p) => {
  if (!p) return '';
  if (!p.prenom || p.famille === p.prenom) return p.nom || '';
  return `${p.famille} ${p.prenom}`;
};

// ⚠ LA FICHE SAISIE À LA MAIN SE RECONNAÎT PAR `source === 'manuel'`, pas par
// la négation « ni Costructor, ni Meta, ni le site » : cette négation ramasse
// les 18 fiches marquées `Costructor` sans identifiant et celles venues de
// Google Agenda, soit vingt lignes là où le tableau de bord n'en montre aucune.
const provenanceFiche = (f) => f.apporteur_id ? 'partenaire'
  : f.source === 'meta_ads' ? 'meta'
  : f.source === 'Formulaire site' ? 'site'
  : 'direct';

// Deux formes cohabitent dans `types_travaux` : un tableau JSON pour les
// lignes relevées de D1, du texte séparé par des virgules pour celles
// qu'écrivent l'Edge Function et la saisie à la main.
const travauxDe = (d) => {
  const brut = String(d.types_travaux || '').trim();
  if (!brut) return '';
  if (!brut.startsWith('[')) return brut;
  try { return JSON.parse(brut).join(', '); } catch { return brut; }
};

// ⚠ L'APPORTEUR PASSE AVANT TOUT LE RESTE. Un nom de partenaire est un fait
// vérifiable ; « Recommandation » coché dans la liste d'à côté est une
// catégorie, et c'est souvent la même chose dite plus vaguement. Le fait gagne
// — sinon un prospect apporté par un partenaire nommé se rangerait en
// « Recommandation », et le décompte des apports du partenaire ne le verrait
// jamais.
const provenanceDemande = (d) => d.apporteur_id ? 'partenaire'
  : VIA(d.comment_connu) || (d.source === 'manuel' ? 'direct' : 'site');

/**
 * L'instantané d'une demande du site, pour la fiche.
 *
 * ⚠ ELLE ÉTAIT ÉCRITE DANS `render`, ET ELLE EN EST SORTIE LE 01/10/2026 —
 * même raison que `ficheDe` en son temps : la to do list doit pouvoir ouvrir la
 * fiche d'une demande depuis une tâche, et elle n'a pas les quatre tables sous
 * la main. Une seconde copie aurait fini par décrire la demande autrement que
 * la liste qui la range.
 */
export function demandeDe(d) {
  return {
    genre: 'demande', ligne: d, cible: 'demande',
    provenance: provenanceDemande(d),
    provenanceLabel: ditProvenance(provenanceDemande(d)).label,
    etape: etapeDeDemande(d),
    statutBrut: d.statut || 'nouveau_prospect',
    recu: d.date_demande || '', nom: `${d.prenom || ''} ${d.nom || ''}`.trim(), type: null,
    email: d.email, tel: d.telephone,
    ville: d.ville, adresse: [d.adresse, [d.code_postal, d.ville].filter(Boolean).join(' ')]
      .filter(Boolean).join(' '),
    projet: travauxDe(d) || d.projet_description || d.type_projet, budget: d.budget,
    statut: statutSuiviLu(d.statut) || 'nouveau_prospect',
  };
}

export function ficheDe(f, etapeDe) {
  const q = qui(f);
  return {
    genre: 'fiche', ligne: f, cible: 'client',
    provenance: provenanceFiche(f),
    provenanceLabel: ditProvenance(provenanceFiche(f)).label,
    etape: etapeDe(f),
    recu: f.meta_received_at || q?.cree || '', nom: q?.nom || '(fiche sans contact)',
    type: q?.type || null, email: q?.email, tel: q?.tel,
    ville: q?.ville, adresse: adresseDe(q),
    projet: f.meta_type_projet, budget: f.meta_budget,
    // ⚠ LE STATUT AFFICHÉ EST CELUI DE L'ÉTAPE, pas la valeur brute.
    // Quand les faits ont pris de l'avance — un chantier tourne, le suivi est
    // resté à « nouveau prospect » — c'est l'étape qui dit vrai. Afficher la
    // valeur brute mettrait « Nouveau prospect » dans l'onglet « Chantier en
    // cours ». La base n'est pas touchée : elle se corrige au premier
    // changement fait depuis ce menu.
    statut: STATUT_DE_L_ETAPE[etapeDe(f)] || statutSuiviLu(f.statut_suivi) || 'nouveau_prospect',
  };
}

/**
 * Ouvrir la fiche d'un prospect RGD depuis n'importe où, sans savoir d'avance
 * si c'est une fiche client ou une demande du site.
 *
 * ⚠ LES DEUX GENRES N'ONT NI LES MÊMES COLONNES NI LA MÊME ÉTAPE : une demande
 * se lit par `etapeDeDemande`, une fiche par les faits (chantiers, devis,
 * visites). Laisser l'appelant deviner, c'est l'obliger à charger quatre
 * tables pour ouvrir une fenêtre.
 */
export function ouvrirProspectRgd(ligne, genre, onChange, retour = null) {
  if (genre === 'demande') {
    ouvrirFicheRgd(demandeDe(ligne), onChange, retour);
    return;
  }
  ouvrirFicheDuClient(ligne, onChange, retour);
}

// Ouvrir la fiche d'une personne depuis n'importe quel écran de l'espace.
// Elle recalcule l'étape elle-même : l'appelant n'a qu'une fiche sous la main,
// pas les quatre tables, et le coût d'une seule lecture est nul.
export function ouvrirFicheDuClient(f, onChange, retour = null) {
  const chantiers = scope.rgd('rgd_chantiers');
  const devis = scope.rgd('rgd_devis');
  const joursVisite = joursDeVisite(scope.rgd('agenda_events'));
  const etapeDe = (x) => etapeDeFiche(x, chantiers, devis, joursVisite);
  ouvrirFicheRgd(ficheDe(f, etapeDe), onChange, retour);
}

export const rgdClientsPage = {
  title: () => 'RGD Renova — Clients & prospects',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // ⚠ L'ONGLET D'ARRIVÉE PEUT ÊTRE DEMANDÉ DANS L'ADRESSE.
    // `#/rgd/clients?vue=prospects&onglet=meta` ouvre directement les prospects
    // Meta Ads. C'est le mail de notification d'un nouveau lead qui s'en sert :
    // il ne peut PAS viser la fiche elle-même — au moment où il part, le relevé
    // n'a pas encore tourné, la fiche n'existe donc pas dans le CRM et n'a pas
    // d'identifiant à citer. Ouvrir sur la bonne liste est ce qu'on peut
    // promettre sans mentir.
    //
    // Les valeurs sont VÉRIFIÉES contre les listes existantes : une adresse
    // bricolée ne doit pas laisser l'écran dans un état qu'aucun bouton ne
    // produit, avec des compteurs qui ne correspondent à rien.
    const params = new URLSearchParams((location.hash.split('?')[1] || ''));
    const vueDemandee = params.get('vue');
    const ongletDemande = params.get('onglet');
    const state = {
      // ⚠ Les trois onglets sont construits dans `draw()`, pas dans une
      // constante : on liste leurs clés ici. Les tenir à jour ensemble est le
      // prix d'une adresse qui ne casse pas — et une valeur inconnue retombe
      // simplement sur « clients ».
      // ⚠ « prospects » et « clients » restent acceptés : ce sont les valeurs
      // que portent les mails de notification déjà partis, et un lien reçu
      // hier ne doit pas tomber sur un écran vide. Ils mènent respectivement à
      // « Nouvelle demande » et à l'annuaire filtré sur les clients.
      vue: ONGLETS_CLES.includes(vueDemandee) ? vueDemandee
        : vueDemandee === 'prospects' ? 'demande'
        : vueDemandee === 'clients' ? 'contacts'
        : 'demande',

      // ⚠ L'ANCIEN PARAMÈTRE `onglet=meta` DOIT CONTINUER DE MARCHER : les
      // mails de notification déjà partis le portent, et un lien reçu hier ne
      // doit pas tomber sur une liste filtrée sur rien. Il devient un filtre
      // de provenance au lieu d'un sous-onglet.
      provenance: PROVENANCES.some(x => x.key === ongletDemande) ? ongletDemande : '',
      q: '', type: '',
      // ⚠ `?vue=clients` DOIT CONTINUER D'OUVRIR LES CLIENTS. Des mails de
      // notification deja partis le portent. Il visait le sous-onglet retire ;
      // il vise maintenant le menu, ou il se voit et se defait.
      statut: vueDemandee === 'clients' ? 'client' : '', focus: null,
      // ⚠ PLUS DE QUESTION POSÉE AU DÉMARRAGE. L'écran demandait à
      // l'application RGD si un compte y répondait au même email, puis
      // redessinait sur la réponse. Le seul droit qui compte est celui de la
      // base, que la session porte déjà — et que les fonctions revérifient.
      ecriture: scope.canRgd,
      page: 1, signature: null,
    };

    const draw = () => {
      const fiches = scope.rgd('rgd_clients');
      const apporteurs = scope.rgd('rgd_apporteurs');
      const demandes = scope.rgd('rgd_demandes');
      const badge = scope.rgd('rgd_reglages').find(r => r.cle === 'costructor_clients_uniques')?.valeur ?? null;


      // ---------- l'étape d'une personne, lue sur ses devis et ses chantiers
      const chantiers = scope.rgd('rgd_chantiers');
      const devis = scope.rgd('rgd_devis');
      // Le rattachement vient de la migration 20260923120000 : un devis et un
      // chantier portent désormais le contact ou l'organisation de leur
      // affaire. Un professionnel se rattache par l'organisation — six affaires
      // sur vingt-sept n'ont que celle-là.
      // Les jours où l'agenda porte une visite technique, calculés une fois
      // pour toute la liste : c'est l'agenda qui dit si le rendez-vous tient.
      const joursVisite = joursDeVisite(scope.rgd('agenda_events'));
      const etapeDe = (f) => etapeDeFiche(f, chantiers, devis, joursVisite);
      const contacts = fiches.filter(f => f.costructor_id);

      // ⚠ ON DÉDOUBLONNE À L'AFFICHAGE, JAMAIS EN BASE. Costructor lui-même
      // signale un écart entre son compte de clients distincts et le nombre de
      // fiches : plusieurs lignes désignent la même personne. Les fusionner
      // serait décider, sur une ressemblance de nom, que deux dossiers n'en
      // font qu'un — on ne supprime rien, on regroupe ce qui s'affiche.
      // ⚠ ON PREND LE PLUS FORT DES IDENTIFIANTS, PAS LES TROIS À LA FOIS.
      // Exiger que l'email ET le téléphone ET le nom coïncident ne
      // dédoublonnerait presque rien : deux saisies de la même personne
      // diffèrent presque toujours par un champ. L'email d'abord, le téléphone
      // ensuite, le nom en dernier recours — et une fiche sans aucun des trois
      // reste seule, faute de quoi toutes se confondraient.
      const propre = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9@.]/g, '');
      const cleIdentite = (f) => {
        const q = qui(f);
        return propre(q?.email) || propre(q?.tel) || propre(q?.nom) || `fiche:${f.id}`;
      };

      // ⚠ ON DÉDOUBLONNE AVANT DE FILTRER, ET ON GARDE LA FICHE LA PLUS
      // AVANCÉE. Filtrer d'abord faisait apparaître la même personne en
      // « Client » sous un filtre et en « Prospect » sous un autre : sur deux
      // fiches d'un même client, une seule porte le chantier, et c'est l'autre
      // qui survivait au hasard de l'ordre de la liste. Constaté le
      // 23/09/2026 sur un jeu d'essai — deux « Alain Bernard », deux réponses.
      const RANG = ['archives', 'devis_encours', 'devis_accepte',
                    'chantier_termine', 'chantier_encours'];
      const rangDe = (f) => RANG.indexOf(etapeDe(f));
      const meilleures = new Map();
      for (const f of contacts) {
        const k = cleIdentite(f);
        const tenante = meilleures.get(k);
        if (!tenante || rangDe(f) > rangDe(tenante)) meilleures.set(k, f);
      }
      const contactsUniques = [...meilleures.values()];
      const doublons = contacts.length - contactsUniques.length;

      // L'annuaire entier : c'est le menu de statut, plus bas, qui le reduit.
      const contactsVus = contactsUniques;
      // ---------- les prospects, une seule liste venue de DEUX tables
      // `rgd_demandes` porte les demandes du formulaire du site, `rgd_clients`
      // les fiches. Une demande n'a pas forcément de fiche, et l'inverse est
      // vrai aussi : il faut donc les deux, ramenées à une forme commune.
      //
      // ⚠ LA FICHE SAISIE À LA MAIN SE RECONNAÎT PAR `source === 'manuel'`,
      // pas par la négation « ni Costructor, ni Meta, ni le site » : cette
      // négation ramasse les 18 fiches marquées `Costructor` sans identifiant
      // et celles venues de Google Agenda, soit vingt lignes là où le tableau
      // de bord n'en montre aucune.
      // ⚠ LE DERNIER RECOURS DÉPEND DE L'ORIGINE DE LA LIGNE. Une demande
      // venue du formulaire est du site, forcément. Une demande SAISIE à la
      // main ne l'est pas : la personne a appelé, croisé un chantier, été
      // adressée par quelqu'un. La ranger en « Site » gonflerait d'autant le
      // seul chiffre qui dit ce que le site rapporte.
      // ⚠ « PROJET » VEUT DIRE LES TRAVAUX, PAS LE BIEN. `type_projet` du
      // formulaire du site vaut « Une maison » : mis dans cette colonne, il
      // répondait à une autre question que celle du titre, et le budget d'à
      // côté semblait porter sur l'achat de la maison. Les travaux d'abord,
      // la description ensuite, le bien en dernier recours.
      const prospects = [
        ...demandes.map(demandeDe),
        ...fiches
          .filter(f => {
            const e = etapeDe(f);
            return e !== null && (e !== 'demande' || estProspectParSource(f));
          })
          .map(f => ficheDe(f, etapeDe)),
      ];
      const aEtape = (cle) => prospects.filter(x => x.etape === cle);

      // L'ordre est celui du dossier, pas celui des volumes : on lit l'écran
      // de gauche à droite comme une affaire avance.
      const ETAPES = ETAPES_RGD.map(e => ({ ...e, n: aEtape(e.key).length }));
      // ⚠ L'ANNUAIRE N'EST PAS UNE ÉTAPE, et il ne doit pas en avoir l'air.
      // Mis au bout de la frise, il se lisait comme le huitième moment d'un
      // dossier — « après chantier terminé vient contacts », ce qui ne veut
      // rien dire. Il a sa propre barre, à part.
      // Son compteur compte l'annuaire ENTIER, pas la liste filtrée : sinon
      // cliquer « Prospects » ferait changer le nombre de l'onglet lui-même.
      const ONGLET_ANNUAIRE = { key: 'contacts', label: 'Tous les contacts',
        n: contactsUniques.length,
        titre: badge != null ? `Annuaire Costructor — il en compte ${badge} distinct${s_(Number(badge))}` : 'Annuaire Costructor' };

      const ts = terms(state.q);
      const surDemande = state.vue === 'demande';

      // ⚠ LA CORBEILLE (06/10/2026, demandée par Élodie : « rajoute un truc
      // corbeille pour qu'on puisse retrouver si on supprime par erreur »). Elle
      // n'est ni une étape ni l'annuaire : une fiche qui y est N'EST PLUS dans
      // la base, elle attend qu'on la remette ou qu'on l'oublie. Elle a donc sa
      // place à côté de l'annuaire, hors de la frise.
      //
      // ⚠ ELLE NE S'AFFICHE QU'À LA DIRECTION, miroir de sa policy : la lecture
      // d'une fiche supprimée est le même droit que sa suppression.
      // ⚠ CONFIER PLUSIEURS DOSSIERS D'UN GESTE (06/10/2026). Le
      // cloisonnement par personne existe depuis le 25/09, mais **191 fiches
      // sur 194** appartenaient à Mickael : l'écran fiche par fiche est correct
      // pour dix dossiers, intenable pour deux cents.
      //
      // ⚠ LA SÉLECTION VIT DANS `state`, PAS DANS LE DOM : le tableau est
      // reconstruit à chaque `draw()` — un changement de statut, une note
      // écrite — et des cases cochées dans le HTML disparaîtraient sans un mot,
      // au milieu d'un tri de deux cents lignes.
      const peutAttribuer = scope.isDirection;
      if (!(state.selection instanceof Set)) state.selection = new Set();
      const surCorbeille = state.vue === 'corbeille';
      const corbeille = scope.rgdCorbeille().slice()
        .sort((a, b) => String(b.supprime_le || '').localeCompare(String(a.supprime_le || '')));
      const lignesCorbeille = corbeille.filter(x => hit([x.nom], ts));

      // La frise, c'est tout sauf l'annuaire et la corbeille : sept étapes,
      // un seul tableau.
      const surFrise = state.vue !== 'contacts' && !surCorbeille;
      // ⚠ À PARTIR DE « DEVIS ACCEPTÉ », LA COLONNE « BUDGET » DEVIENT
      // « MONTANT HT » (25/09/2026, demandé par Mickael : « je voudrais que le
      // montant apparaisse aussi dans ce tableau à partir de devis accepté »).
      // Une fois le devis signé, le budget annoncé au téléphone n'a plus d'usage :
      // la colonne porte l'engagement, comme la tuile de la fiche.
      //
      // ⚠ LE TITRE SUIT L'ONGLET, PAS LA LIGNE. Les onglets ÉTANT les étapes,
      // toutes les lignes d'un onglet sont au même stade : un en-tête qui dirait
      // « Budget / Montant HT » ferait deviner, colonne par colonne, ce que la
      // barre d'onglets dit déjà.
      // ⚠ LA COLONNE COMMENCE À « DEVIS EN COURS », pas à « Devis accepté »
      // (25/09/2026, second passage de Mickael : « je voudrais cette colonne avec
      // le montant HT des devis en cours avec le total »). C'est l'onglet où l'on
      // vient voir ce qu'on est en train de chiffrer — y montrer le budget
      // annoncé pendant que le devis existe déjà n'apprend rien.
      //
      // ⚠ CE N'EST PAS LE MÊME DEVIS D'UNE ÉTAPE À L'AUTRE : brouillon ici,
      // envoyé là, signé ensuite. `montantDevisDe` porte cette table, la même
      // que celle qui range les dossiers dans les onglets.
      const surMontant = etapeAvecMontant(state.vue);

      const listeBrute = surFrise ? [] : contactsVus;

      // Sur les prospects on filtre l'AVANCEMENT (`statut_suivi`, onze valeurs) ;
      // sur les clients et les contacts, la NATURE de la fiche (`statut`). Le
      // menu propose la liste complète du tableau de bord même quand une valeur
      // n'est pas encore présente : c'est ainsi qu'on voit qu'aucune affaire
      // n'est au stade « devis envoyé », ce qu'une liste réduite cacherait.
      // ⚠ PLUS DE FILTRE DE STATUT SUR LA FRISE, et c'est une conséquence, pas
      // un choix d'ergonomie : depuis que le statut décide de l'onglet, chaque
      // onglet EST un groupe de statuts. Un menu « Tous statuts » par-dessus
      // ne pourrait que vider la liste qu'on vient d'ouvrir.
      //
      // ⚠ UNE CONDITION, UN USAGE. `surProspects` en portait DEUX : le filtre
      // de statut et le bouton « + Nouveau prospect ». La passer à `false` pour
      // retirer le premier a emporté le second sans un mot, et la création a
      // disparu de l'écran — signalé par Mickael le 23/09/2026. Deux réglages
      // qui n'ont rien à voir ne partagent pas un drapeau.
      const surProspects = false;

      // ⚠ ET POURTANT UN FILTRE DE STATUT REVIENT SUR LA FRISE — la règle
      // ci-dessus n'est pas contredite, elle est lue jusqu'au bout.
      // Elle dit qu'un menu de statut par-dessus un onglet qui EST un statut ne
      // peut que vider la liste. Vrai pour six onglets sur sept. Le septième,
      // « Nouvelle demande », en réunit CINQ : nouveau prospect, trois relances,
      // à contacter. C'est justement là qu'on ne voit pas la différence entre
      // quelqu'un qui vient d'arriver et quelqu'un qu'on a relancé trois fois,
      // et c'est la seule liste de l'écran qu'on travaille au téléphone.
      //
      // Le menu n'apparaît donc que là où il y a un choix à faire. Demandé par
      // Mickael le 24/09/2026.
      const dansOnglet = surFrise ? aEtape(state.vue) : [];
      // Les statuts du menu : ceux que l'étape appelle, PLUS ceux réellement
      // présents. Le second terme n'est pas de la prudence gratuite —
      // `etapeDeFiche` range ici tout statut qu'elle ne reconnaît pas, et une
      // ligne hors menu ferait un total qui ne fait pas la somme de ses parts.
      const statutsFrise = (() => {
        if (!surFrise) return [];
        const cles = [...new Set([...statutsDeLEtape(state.vue),
                                  ...dansOnglet.map(x => x.statut)])];
        return cles.length > 1 ? cles.map(k => dit(STATUTS_SUIVI, k)) : [];
      })();
      // Sans menu, pas de filtre : un `state.statut` resté d'un autre onglet
      // retirerait des lignes sans que rien à l'écran ne dise pourquoi.
      const statutFrise = statutsFrise.length ? state.statut : '';

      // ⚠ CHAQUE MENU COMPTE SUR CE QUE L'AUTRE LAISSE PASSER.
      // Les deux filtres se croisent : compter chacun sur l'onglet entier
      // afficherait « Relance 2 (3) » et rendrait une liste vide dès qu'une
      // provenance est choisie. Un compte qu'on clique doit être le nombre
      // qu'on obtient.
      const baseProv = dansOnglet.filter(x => !statutFrise || x.statut === statutFrise);
      const baseStatut = dansOnglet.filter(x => !state.provenance || x.provenance === state.provenance);

      // Le plus récent en haut : c'est celui qu'on n'a pas encore rappelé.
      const lignesProspects = (surFrise ? dansOnglet : [])
        .filter(x => (!state.provenance || x.provenance === state.provenance)
          && (!statutFrise || x.statut === statutFrise)
          && hit([x.nom, x.email, x.tel, x.ville, x.adresse, x.projet], ts))
        .sort((a, b) => String(b.recu || '').localeCompare(String(a.recu || '')));

      // ⚠ L'ONGLET « RDV » SE TRIE PAR DATE DE RENDEZ-VOUS, pas par date de
      // réception (02/10/2026, demandé par Élodie). On y vient pour préparer
      // ses visites : l'ordre d'arrivée des demandes n'a aucun rapport avec
      // l'ordre dans lequel on va les voir.
      //
      // ⚠ C'EST LA MÊME DATE QUE CELLE DE LA COLONNE, et ce n'est pas un
      // confort : elle vient du CHANTIER par `visiteDeLaFiche` — la date qui a
      // rangé la fiche dans cet onglet. Trier sur l'agenda rapproché par le
      // nom classerait une personne revue deux fois à une date que sa propre
      // ligne ne montre pas.
      //
      // ⚠ CHRONOLOGIQUE CROISSANT, DONC LES VISITES PASSÉES EN TÊTE — et c'est
      // voulu, pas un effet de bord. Une visite ne reste dans cet onglet que si
      // l'agenda la confirme (`visiteEnCours`), soit au plus J-7 : ce sont les
      // visites de la semaine écoulée qui n'ont pas encore de devis derrière,
      // c'est-à-dire exactement celles qu'il faut relancer. L'écran les grise
      // déjà (`.est-passe`), elles ne se confondent pas avec ce qui vient.
      //
      // ⚠ SANS DATE EN DERNIER, jamais en premier : une fiche dont on ne
      // connaît aucune visite n'est pas « le prochain rendez-vous ».
      //
      // ⚠ LE JOUR SE CALCULE UNE FOIS PAR LIGNE, pas à chaque comparaison :
      // `visiteDeLaFiche` parcourt tous les chantiers, et un `sort` l'appelle
      // n·log(n) fois là où une table n'en demande que n.
      if (state.vue === 'rdv') {
        const jourDeVisite = (x) => {
          if (x.cible === 'demande') return '';
          const vis = visiteDeLaFiche(x.ligne, chantiers, joursVisite);
          return vis ? String(vis.date_debut_prevue || vis.work_start_at || '').slice(0, 10) : '';
        };
        const jours = new Map(lignesProspects.map(x => [x, jourDeVisite(x)]));
        // `sort` est stable : à date égale — et entre les fiches sans date —
        // l'ordre de réception posé juste au-dessus est conservé.
        lignesProspects.sort((a, b) => {
          const ja = jours.get(a), jb = jours.get(b);
          if (!ja !== !jb) return ja ? -1 : 1;
          return ja.localeCompare(jb);
        });
      }
      // Les prospects filtrent leur `statut` dans `lignesProspects` ; ici il ne
      // reste que les fiches des étapes suivantes, qui portent `statut`.
      const champStatut = (x) => x.statut;
      // ⚠ LE MENU NE PROPOSE QUE DES STATUTS QUI EXISTENT DANS L'ANNUAIRE.
      // Il en listait six. Or les 158 fiches connues de Costructor n'en portent
      // que trois — prospect, client, partenaire. « Qualifie », « Inactif » et
      // « Perdu » etaient donc trois entrees qui ne pouvaient rien rendre, et
      // c'est ce que Mickael a signale le 24/09/2026 : un choix qui ne mene
      // nulle part se lit comme une liste cassee.
      //
      // ⚠ ET ON GARDE CELUI QUI EST CHOISI, meme s'il vient de disparaitre.
      // Le filtre survit a un changement de donnees : sans cette precaution le
      // menu retomberait sur « Tous » en affichant une liste vide, sans rien
      // pour dire pourquoi.
      //
      // C'est la meme regle que sur la frise, appliquee a l'autre vocabulaire :
      // proposer ce qui est la, plutot qu'un catalogue theorique.
      const statutsPresents = new Set(listeBrute.map(f => f.statut).filter(Boolean));
      const statuts = (surProspects ? STATUTS_SUIVI : STATUTS_FICHE)
        .filter(st => statutsPresents.has(st.key) || state.statut === st.key);
      // Le compte de chaque statut porte sur ce que le filtre de type laisse
      // passer : le nombre qu'on clique doit etre celui qu'on obtient.
      const baseFiches = listeBrute.filter(f => !state.type || qui(f)?.type === state.type);

      const recuLe = ({ f, p }) => f.meta_received_at || p?.cree || '';

      const lignesFiches = listeBrute
        .map(f => ({ f, p: qui(f) }))
        .filter(({ f, p }) => (!state.type || p?.type === state.type)
          && (!state.statut || champStatut(f) === state.statut)
          && hit([p?.nom, p?.email, p?.tel, p?.ville, p?.adresse], ts))
        // ⚠ DEUX TRIS, PARCE QUE CE SONT DEUX USAGES.
        // Un prospect se travaille dans l'ordre d'arrivée : le plus récent en
        // haut, c'est celui qu'on n'a pas encore rappelé. Un client ou un
        // contact se CHERCHE : on connaît son nom, pas sa date d'entrée, donc
        // l'alphabétique par nom de FAMILLE.
        //
        // ⚠ La date d'arrivée d'un prospect n'est pas dans `rgd_clients` : la
        // table n'a pas de `created_at`. Seuls les leads Meta portent une date
        // propre (`meta_received_at`) ; pour les autres, c'est la création du
        // CONTACT qui fait foi. Une fiche sans ni l'un ni l'autre part en bas
        // plutôt qu'en haut : « je ne sais pas quand » n'est pas « à l'instant ».
        .sort(surProspects
          ? (a, b) => String(recuLe(b) || '').localeCompare(String(recuLe(a) || ''))
          : (a, b) => String(a.p?.famille || '').localeCompare(String(b.p?.famille || ''), 'fr'));

      const affichees = surFrise ? lignesProspects.length : lignesFiches.length;

      // ---------- la liste se lit par pages
      // 183 contacts sur une seule page, c'est une page dont on ne voit jamais
      // le bas. Demande de Mickael le 24/09/2026.
      //
      // ⚠ LA PAGE SE REMET A 1 DES QUE LA LISTE CHANGE, ET CE N'EST PAS AU
      // BOUTON DE LE FAIRE. Poser le rappel sur chaque menu marche jusqu'au
      // jour ou l'on en ajoute un — et la recherche, elle, passe par
      // `bindSearch` dans `ui.js`, qui ecrit `state.q` sans rien savoir d'une
      // pagination. Un oubli ne se voit pas a la relecture : il se voit en
      // production, sous la forme d'une liste vide sur une page qui n'existe
      // plus. On compare donc ce qui DEFINIT la liste, une fois, ici.
      const signature = JSON.stringify([state.vue, state.provenance,
                         state.statut, state.type, state.q]);
      if (signature !== state.signature) { state.signature = signature; state.page = 1; }

      const pages = Math.max(1, Math.ceil(affichees / PAR_PAGE));
      // ⚠ ON BORNE AU LIEU DE FAIRE CONFIANCE. La signature couvre les filtres,
      // pas la donnee : une fiche supprimee ou un releve qui passe peut raccourcir
      // la liste sans qu'aucun filtre ne bouge.
      state.page = Math.min(Math.max(1, state.page), pages);
      // ⚠ LE TOTAL PORTE SUR L'ONGLET ENTIER, PAS SUR LA PAGE (25/09/2026,
      // demandé par Mickael : « une vue d'ensemble sur les projets de cette
      // étape »). Un total qui changerait en tournant la page ne serait pas une
      // vue d'ensemble ; il suit en revanche les filtres, parce qu'un total qui
      // ne correspond pas aux lignes qu'on a sous les yeux est pire que pas de
      // total du tout.
      //
      // ⚠ ON COMPTE AUSSI LES DOSSIERS CHIFFRÉS, et on le dit quand ils ne sont
      // pas tous : à « Devis en cours », une partie des dossiers n'a pas encore
      // de devis: un total seul laisserait croire à une somme sur tout l'onglet.
      const totalEtape = !surMontant ? 0
        : lignesProspects.reduce((t, x) => t + montantDevisDe(x.ligne, devis, state.vue), 0);
      const chiffres = !surMontant ? 0
        : lignesProspects.filter(x => montantDevisDe(x.ligne, devis, state.vue) > 0).length;

      const debut = (state.page - 1) * PAR_PAGE;
      const tranche = (liste) => liste.slice(debut, debut + PAR_PAGE);

      // Rien a afficher quand tout tient sur une page : un pied de liste qui
      // annonce « 1-3 sur 3 » entre deux boutons eteints n'apprend rien.
      const pagination = () => pages <= 1 ? '' : `<div class="pager">
        <button type="button" class="btn ghost sm" id="rcl-prec"
          ${state.page === 1 ? 'disabled' : ''}>Précédent</button>
        <span class="muted small">${debut + 1}–${Math.min(debut + PAR_PAGE, affichees)}
          sur ${affichees}</span>
        <button type="button" class="btn ghost sm" id="rcl-suiv"
          ${state.page === pages ? 'disabled' : ''}>Suivant</button>
      </div>`;

      // ⚠ LA COLONNE DE LA CORBEILLE RESTE COLLEE A DROITE (05/10/2026,
      // demande par Elodie : « je voudrais avoir la possibilite de supprimer
      // les prospects »). Le bouton EXISTAIT depuis le 25/09 — il etait
      // simplement hors de l'ecran : sur l'onglet « Nouvelle demande », qui
      // porte une colonne de plus, le tableau deborde de 96 px et la
      // corbeille tombait a x=1491 dans une fenetre de 1500. Mesure, pas
      // devine. Il fallait faire defiler le tableau lateralement pour la
      // trouver, et rien ne disait qu'elle etait la.
      //
      // ⚠ CE N'EST PAS UNE FONCTION NEUVE, c'est la meme porte rendue
      // atteignable : `supprimerFiche` garde son refus sur les fiches qui
      // portent des devis ou des chantiers, et sa pierre tombale.
      // ---------- les deux tableaux ----------
      // ⚠ CE TABLEAU NE PAGINE PAS, et ce n'est pas un oubli : une corbeille
      // qui déborde est un symptôme, pas un volume normal. Le jour où elle
      // compte cent lignes, c'est la question « qui supprime quoi » qu'il faut
      // poser, pas une pagination.
      // ⚠ PAS `qui` : ce nom est DEJA pris dans cette fonction (`cleIdentite`
      // l'emploie pour l'identite d'un contact), et le redeclarer ici cassait
      // l'ecran entier au chargement — « Cannot access 'qui' before
      // initialization », une erreur de zone morte que ni le controle de
      // syntaxe ni la relecture ne voient.
      const nomDuProfil = (id) => db.byId('profiles', id)?.full_name || '—';
      const compteOrphelins = (o) => [
        [o?.devis, 'devis', 'devis'], [o?.paiements, 'paiement', 'paiements'],
        [o?.chantiers, 'chantier', 'chantiers'], [o?.autres, 'autre', 'autres'],
      ].filter(([n]) => n > 0).map(([n, un, pl]) => `${n} ${n > 1 ? pl : un}`).join(', ');

      const tableauCorbeille = () => `<section class="card table-wrap">
        <table>
          <thead><tr><th>Qui</th><th>Supprimée le</th><th>Par</th>
            <th>Parti avec la fiche</th><th>Resté sans fiche</th><th></th></tr></thead>
          <tbody>${lignesCorbeille.map(x => {
            const emporte = [
              x.affaires?.length ? `${x.affaires.length} affaire${s_(x.affaires.length)}` : '',
              x.chantiers?.length ? `${x.chantiers.length} rendez-vous` : '',
              x.contact_archive ? 'contact archivé' : '',
            ].filter(Boolean).join(', ');
            const laisse = compteOrphelins(x.orphelins);
            return `<tr class="${x.restauree_le ? 'est-restauree' : ''}">
              <td><b>${esc(x.nom || '(fiche sans nom)')}</b>
                <div class="s muted">${x.source === 'demandes' ? 'demande du site' : 'fiche client'}</div></td>
              <td class="muted small">${esc(fmtDateTime(x.supprime_le))}</td>
              <td class="muted small">${esc(nomDuProfil(x.par))}</td>
              <td class="muted small">${esc(emporte || '—')}</td>
              <td class="small">${laisse
                ? `<span class="chip amber" title="Ces lignes existent toujours, sans fiche à qui les rattacher">${esc(laisse)}</span>`
                : '<span class="muted">—</span>'}</td>
              <!-- ⚠ « Supprimer définitivement » N'APPARAÎT QUE POUR LA DIRECTION
                   (06/10/2026). Un chargé d'affaires jette et reprend ; il ne
                   détruit pas. Le serveur refuse de toute façon. -->
              <td>${x.restauree_le
                ? `<span class="muted small">remise le ${esc(fmtDate(x.restauree_le))}</span>`
                : `<button type="button" class="btn ghost sm" data-restaurer-fiche="${esc(x.id)}">Restaurer</button>${scope.canPurgerCorbeilleRgd
                    ? `<button type="button" class="btn ghost sm danger" data-purger-fiche="${esc(x.id)}" title="Supprimer définitivement : la copie gardée disparaît, la fiche ne pourra plus être remise">Supprimer définitivement</button>`
                    : ''}`}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="6"><div class="empty">${
            state.q ? 'Aucune fiche supprimée ne correspond à la recherche.'
              : 'La corbeille est vide — aucune fiche n’a été supprimée.'}</div></td></tr>`}</tbody>
        </table>
      </section>`;

      const tableauFiches = () => `<section class="card table-wrap">
        <table>
          <thead><tr><th>Nom, prénom</th><th>Type</th><th>Statut</th><th>Email</th>
            <th>Téléphone</th><th>Adresse</th><th>Maj</th><th>Commentaire</th><th class="rcl-suppr"></th></tr></thead>
          <tbody>${tranche(lignesFiches).map(({ f, p }) => {
            const ap = f.apporteur_id && apporteurs.find(a => a.id === f.apporteur_id);
            return `<tr>
              <td><b>${esc(nomIndexe(p) || '(fiche sans contact)')}</b>
                  ${f.source === 'meta_ads' ? '<span class="chip accent" title="Lead Facebook ou Instagram">Meta</span>' : ''}
                  ${ap ? `<div class="s muted">apporté par ${esc(ap.societe || [ap.prenom, ap.nom].filter(Boolean).join(' '))}</div>` : ''}</td>
              <td class="muted">${esc(p?.type || '—')}</td>
              <td>${!surProspects ? pastilleFiche(f.statut)
                : state.ecriture ? menuStatut(f.statut_suivi, 'client', f.id)
                : pastilleSuivi(f.statut_suivi)}</td>
              <td>${p?.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '<span class="muted">—</span>'}</td>
              <td>${esc(p?.tel || '—')}</td>
              <td class="muted">${esc(adresseDe(p))}</td>
              <td class="muted small">${f.maj ? esc(relDay(f.maj)) : '—'}</td>
              <td class="rcl-note">${champNote(f, 'client')}</td>
              <td class="rcl-suppr">${boutonSuppression(f)}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="9"><div class="empty">${esc(vide())}</div></td></tr>`}</tbody>
        </table>
        ${pagination()}
      </section>`;

      // UN SEUL TABLEAU POUR LES DEUX TABLES. Les colonnes sont celles que les
      // deux populations savent remplir ; « Projet » et « Budget » lisent la
      // demande du site OU les réponses au formulaire Meta, pour ne rien
      // perdre de ce que la personne a écrit elle-même.
      // ⚠ LE TOTAL EST EN TÊTE, PAS EN PIED (25/09/2026, corrigé par Mickael :
      // « je voyais plutôt les totaux en haut du tableau et pas en bas de la
      // page »). Un total qu'il faut aller chercher sous vingt-cinq lignes n'est
      // pas une vue d'ensemble : on l'ouvre POUR lui, il doit être là à
      // l'ouverture. La première version l'alignait sous la colonne, ce qui
      // était joli et inutile.
      const bandeauTotal = () => !surMontant || !lignesProspects.length ? '' : `
        <div class="rcl-total">
          <span>Total de l’étape
            <span class="s muted">· ${lignesProspects.length} dossier${lignesProspects.length > 1 ? 's' : ''}${
              chiffres < lignesProspects.length
                ? `, dont ${chiffres} chiffré${chiffres > 1 ? 's' : ''}` : ''}</span></span>
          <b>${esc(eur(totalEtape))}</b>
        </div>`;

      // ⚠ LA COLONNE « RENDEZ-VOUS » N'EXISTE QUE SUR L'ONGLET « RDV »
      // (30/09/2026, demandé par Mickael). Ailleurs elle serait vide de haut en
      // bas : une visite technique en cours EST ce qui range une fiche dans cet
      // onglet, donc partout ailleurs il n'y en a pas. Une colonne vide prend
      // la place des autres et fait chercher une donnée qui n'a pas lieu d'être.
      const surRdv = state.vue === 'rdv';
      // ⚠ LA COLONNE DES RELANCES NE S'AFFICHE QUE SUR « NOUVELLE DEMANDE » :
      // les trois statuts de relance n'existent que là, et une colonne vide sur
      // six onglets coûterait de la largeur à tous pour n'informer qu'un seul.
      const surRelances = state.vue === 'demande';

      // ⚠ LA DATE VIENT DU CHANTIER, L'HEURE DE L'AGENDA, et les deux sources
      // ne sont pas interchangeables : c'est `date_debut_prevue` qui décide du
      // classement dans l'onglet (voir `visiteDeLaFiche`), et `date_debut_prevue`
      // est un `date` — l'heure n'y est pas. On la cherche sur l'événement lié
      // par `source_event_id`, le lien exact posé par le relevé.
      //
      // ⚠ SANS ÉVÉNEMENT, LA DATE SEULE — jamais une heure inventée. Une visite
      // sur six n'a pas de `source_event_id` (mesuré le 30/09/2026), et une
      // journée entière n'a pas d'heure non plus : afficher « 00:00 » ferait
      // croire à un rendez-vous à minuit, le défaut déjà corrigé sur la fiche.
      const evenements = surRdv ? scope.rgd('agenda_events') : [];
      const celluleRdv = (f) => {
        const visite = visiteDeLaFiche(f, chantiers, joursVisite);
        if (!visite) return '<span class="muted">—</span>';
        const jour = String(visite.date_debut_prevue || visite.work_start_at || '').slice(0, 10);
        const ev = visite.source_event_id
          ? evenements.find(e => e.google_id === visite.source_event_id) : null;
        const heure = ev && !ev.all_day && ev.starts_at
          ? new Date(ev.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : '';
        // Passé = grisé, jamais caché : une visite d'hier sans devis derrière
        // est précisément ce qu'on vient chercher dans cet onglet.
        const passe = jour && jour < new Date().toISOString().slice(0, 10);
        return `<span class="rcl-rdv${passe ? ' est-passe' : ''}">
          <b>${jour ? esc(fmtDate(jour)) : '—'}</b>
          ${heure ? `<span>${esc(heure)}</span>`
            : '<span class="muted" title="Aucun rendez-vous lié dans l’agenda : l’heure n’est pas connue">heure inconnue</span>'}
        </span>`;
      };

      // Ce que la sélection retient : des lignes de l'onglet ouvert, jamais des
      // identifiants orphelins. Changer d'onglet la vide (voir le gestionnaire
      // de `[data-vue]`) — garder une sélection invisible serait un piège.
      const sel = () => lignesProspects.filter(x => state.selection.has(x.ligne.id));

      const barreLot = () => {
        if (!peutAttribuer) return '';
        const n = sel().length;
        if (!n) return '';
        return `<div class="rcl-lot">
          <span><b>${n}</b> fiche${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}</span>
          ${n < lignesProspects.length ? `<button type="button" class="btn ghost sm" id="rcl-lot-tout">Sélectionner les ${lignesProspects.length} de l’onglet</button>` : ''}
          <button type="button" class="btn ghost sm" id="rcl-lot-rien">Tout désélectionner</button>
          <span class="grow"></span>
          <button type="button" class="btn" id="rcl-lot-confier">Confier à…</button>
        </div>`;
      };

      // ⚠ À QUI EST CE DOSSIER, LU SANS OUVRIR LA FICHE (06/10/2026, demandé :
      // « avec une mention lead Antoine »). Sans cette colonne, le filtre d'à
      // côté serait le seul moyen de le savoir — on lirait une liste sans pouvoir
      // dire de qui elle est.
      //
      // ⚠ « À ATTRIBUER » N'EST PAS UN TIRET : un dossier sans responsable est un
      // dossier qui attend quelqu'un, et un tiret ne dit pas qu'il y a quelque
      // chose à faire. Même règle que la pile des leads BTP depuis le 18/09.
      // « Leads de Mickael » mais « Leads d’Antoine » : une liste déroulante se
      // lit à voix basse, et un « de Antoine » accroche l'œil à chaque ouverture.
      // On garde le nom ENTIER — le prénom seul rend « Leads de Chargé » sur un
      // compte nommé par sa fonction.
      const deQui = (nom) => (/^[aeiouyéèêh]/i.test(nom) ? 'd’' + nom : 'de ' + nom);

      const celluleResponsable = (f) => {
        const u = f.owner_id && db.byId('profiles', f.owner_id);
        if (!u) return '<span class="chip amber" title="Personne n’en est responsable">À attribuer</span>';
        return `<span class="${u.role === 'direction' ? 'muted' : ''}">${esc(u.full_name || '—')}</span>`;
      };

      const tableauProspects = () => `<section class="card table-wrap">
        ${barreLot()}
        ${bandeauTotal()}
        <table>
          <thead><tr>${peutAttribuer ? `<th class="rcl-coche"><input type="checkbox" id="rcl-coche-page"
              title="Sélectionner les lignes de cette page"${
              tranche(lignesProspects).every(x => state.selection.has(x.ligne.id))
                && lignesProspects.length ? ' checked' : ''}></th>` : ''}
            <th>Reçu</th><th>Provenance</th><th>Nom</th><th>Contact</th>
            ${surRdv ? '<th>Rendez-vous</th>' : ''}
            <th>Projet</th><th>${surMontant ? 'Montant HT' : 'Budget'}</th><th>Ville</th>
            ${peutAttribuer ? '<th>Responsable</th>' : ''}<th>Statut</th>
            ${surRelances ? '<th>Dernière relance</th>' : ''}
            <th>Commentaire</th><th class="rcl-suppr"></th></tr></thead>
          <!-- ⚠ L'INDEX EST CELUI DE LA LISTE ENTIERE, PAS DE LA PAGE.
               L'attribut data-fiche sert au clic, qui relit la liste entiere.
               Numeroter la tranche a partir de zero ferait ouvrir, en page 2,
               la fiche de la personne qui occupe le meme rang en page 1 —
               une erreur muette, qui montre un vrai dossier, celui de
               quelqu'un d'autre. D'ou le decalage ajoute ici.
               ⚠ PAS D'ACCENT GRAVE ICI : ce commentaire est DANS un litteral
               de gabarit, un seul le referme et l'ecran reste sur Chargement. -->
          <tbody>${tranche(lignesProspects).map((x, i) => { const n = debut + i; return `<tr class="click" data-fiche="${n}">
            ${peutAttribuer ? `<td class="rcl-coche"><input type="checkbox" data-coche="${esc(x.ligne.id)}"${
              state.selection.has(x.ligne.id) ? ' checked' : ''}></td>` : ''}
            <td class="small">${x.recu ? esc(fmtDate(x.recu)) : '<span class="muted">—</span>'}</td>
            <td>${pastilleProvenance(x.provenance)}</td>
            <td><b>${esc(x.nom || '—')}</b>
                ${x.type ? `<div class="s muted">${esc(x.type)}</div>` : ''}</td>
            <td>${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}
                ${x.tel ? `<div class="s">${esc(x.tel)}</div>` : ''}
                ${!x.email && !x.tel ? '<span class="muted">—</span>' : ''}</td>
            ${surRdv ? `<td class="rcl-rdv-cell">${x.cible === 'demande'
              ? '<span class="muted">—</span>' : celluleRdv(x.ligne)}</td>` : ''}
            <td class="muted">${esc(x.projet || '—')}</td>
            <td class="${surMontant ? 'num' : 'muted'}">${surMontant
              ? (montantDevisDe(x.ligne, devis, state.vue) > 0
                  ? esc(eur(montantDevisDe(x.ligne, devis, state.vue)))
                  : '<span class="muted">—</span>')
              : esc(String(x.budget || '—').trim())}</td>
            <td class="muted">${esc(x.ville || '—')}</td>
            ${peutAttribuer ? `<td class="small">${celluleResponsable(x.ligne)}</td>` : ''}
            <td class="rcl-statut-cell">${state.ecriture
              ? menuStatut(x.statut, x.cible, x.ligne.id) + flechesEtape(x.etape, true)
              : pastilleSuivi(x.statut)}</td>
            ${surRelances ? `<td class="small rcl-rel-td">${celluleRelance(x.ligne, x.statut, x.cible)}</td>` : ''}
            <td class="rcl-note">${champNote(x.ligne, x.cible)}</td>
            <td class="rcl-suppr">${boutonSuppression(x.ligne)}</td>
          </tr>`; }).join('') || `<tr><td colspan="${10 + (surRdv ? 1 : 0) + (surRelances ? 1 : 0) + (peutAttribuer ? 2 : 0)}"><div class="empty">${esc(vide())}</div></td></tr>`}</tbody>
        </table>
        ${pagination()}
        <p class="small muted">${state.ecriture
          ? `Le statut${surRelances ? ', la date de relance' : ''} et le commentaire se changent ici et sont enregistrés tout de suite. Ils ne repartent plus vers l’application RGD : le CRM en est la source.`
          : 'Le statut et le commentaire sont lus, pas saisis : leur modification est réservée à l’équipe RGD.'}</p>
      </section>`;

      function vide() {
        if (state.q || state.type || state.statut) return 'Aucune fiche ne correspond aux filtres.';
        if (state.vue === 'contacts') return 'Aucun contact Costructor.';
        if (state.provenance) return 'Aucun prospect de cette provenance à cette étape.';
        return ({
          devis_encours: 'Aucun devis en attente de réponse.',
          devis_accepte: 'Aucun devis signé dont le chantier n’a pas commencé.',
          chantier_encours: 'Aucun chantier en cours.',
          chantier_termine: 'Aucun chantier terminé.',
          archives: 'Aucun contact perdu.',
        })[state.vue] || 'Personne à cette étape.';
      }

      const corps = `

        <div class="rcl-barres">
          <div class="pill-tabs rcl-etapes" role="tablist" aria-label="Suivi du dossier">
            ${ETAPES.map(r => `<button type="button" data-vue="${r.key}"
              class="${state.vue === r.key ? 'on' : ''}"${r.titre ? ` title="${esc(r.titre)}"` : ''}>${
              r.label}<span>${r.n}</span></button>`).join('')}
          </div>
          <div class="rcl-annuaire">
            <button type="button" data-vue="${ONGLET_ANNUAIRE.key}"
              class="rcl-onglet-annuaire ${state.vue === 'contacts' ? 'on' : ''}"
              title="${esc(ONGLET_ANNUAIRE.titre)}">${ONGLET_ANNUAIRE.label}<span>${ONGLET_ANNUAIRE.n}</span></button>
            ${scope.canRgd ? `<button type="button" data-vue="corbeille"
              class="rcl-onglet-annuaire ${surCorbeille ? 'on' : ''}"
              title="Les fiches supprimées, et de quoi les remettre">🗑 Corbeille<span>${
              corbeille.filter(x => !x.restauree_le).length}</span></button>` : ''}
          </div>
        </div>





        <!-- Le message ne s'affiche QUE si l'etape est vide. Il annoncait
             « pas encore alimentee » y compris au-dessus d'une liste remplie,
             ce qui revenait a dementir ce que la page montrait juste en
             dessous. Son contenu etait faux depuis le 24/09/2026 : le releve
             transmet desormais les adresses des invites, et un rendez-vous de
             visite technique cree sa fiche tout seul. -->
        ${state.vue === 'rdv' && !dansOnglet.length ? `<div class="alert">
          <b>i</b>
          <div><b>Aucun rendez-vous à cette étape.</b> Ils arrivent tout seuls de
          Google Agenda, à deux conditions : le titre de l’événement doit commencer par
          « Visite technique : », et le client doit être invité au rendez-vous — c’est son
          adresse email qui permet de le reconnaître. Sans invité identifiable, le
          rendez-vous est signalé plutôt que rattaché au hasard.</div>
        </div>` : ''}

        ${state.vue === 'contacts' && doublons ? `<p class="small muted rcl-intro">
          ${doublons} fiche${s_(doublons)} en double ${doublons > 1 ? 'sont regroupées' : 'est regroupée'}
          avec ${doublons > 1 ? 'leurs homologues' : 'son homologue'} : même nom, même email ou même
          téléphone. Rien n’est supprimé — les fiches existent toujours dans l’application RGD.</p>` : ''}

        <div class="toolbar">
          ${searchInput('rcl-q', state, surDemande
            ? 'Recherche nom, email, ville, projet…' : 'Rechercher nom, email, téléphone…')}
          ${!surCorbeille && peutAttribuer ? `<select id="rcl-resp" aria-label="Responsable"
            class="${scope.vueRgd !== 'direction' ? 'actif' : ''}"
            title="À qui sont les dossiers affichés">
            <!-- La direction d'abord : c'est la liste qu'on travaille. Les
                 personnes ensuite, et « tous » entre les deux pour repasser au
                 complet sans chercher. -->
            <option value="direction"${scope.vueRgd === 'direction' ? ' selected' : ''}>Leads de la direction</option>
            <option value=""${!scope.vueRgd ? ' selected' : ''}>Tous les leads</option>
            ${scope.candidatsRgd().map(u => `<option value="${esc(u.id)}"${
              scope.vueRgd === u.id ? ' selected' : ''}>Leads ${esc(deQui(u.full_name || 'ce membre'))}</option>`).join('')}
          </select>` : ''}
          ${surCorbeille ? '' : surFrise ? `<select id="rcl-prov" aria-label="Provenance" class="${state.provenance ? 'actif' : ''}">
            <!-- ⚠ TOUS LES COMPTES PORTENT SUR LA MÊME POPULATION, y compris
                 celui de « Toutes ». Il comptait la frise ENTIÈRE pendant que
                 les autres comptaient l'étape : 51 en face de six lignes dont
                 la somme faisait 16. Un total qui ne fait pas la somme de ce
                 qu'il chapeaute se lit comme une erreur, et c'en était une.
                 Cette population, c'est baseProv : l'onglet ouvert, moins ce
                 que le filtre de statut écarte déjà.
                 ⚠ PAS D'ACCENT GRAVE DANS CE COMMENTAIRE. Il est DANS un
                 littéral de gabarit : un seul le referme, et l'écran reste
                 sur « Chargement… » sans que node --check y voie rien. -->
            <option value="">Toutes provenances (${baseProv.length})</option>
            ${PROVENANCES.map(pr => {
              const n = baseProv.filter(x => x.provenance === pr.key).length;
              return `<option value="${pr.key}" ${state.provenance === pr.key ? 'selected' : ''}>${esc(pr.label)} (${n})</option>`;
            }).join('')}
          </select>
          ${statutsFrise.length ? `<select id="rcl-statut" aria-label="Statut" class="${statutFrise ? 'actif' : ''}">
            <option value="">Tous statuts (${baseStatut.length})</option>
            ${statutsFrise.map(st => {
              const n = baseStatut.filter(x => x.statut === st.key).length;
              return `<option value="${esc(st.key)}" ${statutFrise === st.key ? 'selected' : ''}>${esc(st.label)} (${n})</option>`;
            }).join('')}
          </select>` : ''}` : `<select id="rcl-type" aria-label="Type" class="${state.type ? 'actif' : ''}">
            <option value="">Tous types</option>
            <option value="particulier" ${state.type === 'particulier' ? 'selected' : ''}>Particulier</option>
            <option value="professionnel" ${state.type === 'professionnel' ? 'selected' : ''}>Professionnel</option>
          </select>
          ${statuts.length > 1 ? `<select id="rcl-statut" aria-label="Statut" class="${state.statut ? 'actif' : ''}">
            <option value="">Tous statuts (${baseFiches.length})</option>
            ${statuts.map(st => {
              const n = baseFiches.filter(f => champStatut(f) === st.key).length;
              return `<option value="${esc(st.key)}" ${state.statut === st.key ? 'selected' : ''}>${esc(st.label)} (${n})</option>`;
            }).join('')}
          </select>` : ''}`}
          <span class="grow"></span>
          <span class="muted small">${surCorbeille ? lignesCorbeille.length : affichees} ligne${
            s_(surCorbeille ? lignesCorbeille.length : affichees)}</span>
          ${surDemande && scope.canRgd
            ? '<button class="btn" id="rcl-nouveau">+ Nouvelle demande</button>' : ''}
        </div>

        ${surCorbeille ? tableauCorbeille() : surFrise ? tableauProspects() : tableauFiches()}`;

      root.innerHTML = cadre('#/rgd/clients', 'Clients & prospects', corps);
      bindSearch(root, 'rcl-q', state, draw);
      restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        // Les filtres appartiennent à la liste qu'on quitte : un statut de
        // demande n'existe pas chez les clients, et le garder viderait l'écran
        // sans qu'on comprenne pourquoi.
        // ⚠ LA SÉLECTION SE VIDE AVEC LES FILTRES, et pour la même raison :
        // elle appartient à la liste qu'on quitte. La garder confierait, d'un
        // clic, des dossiers qu'on ne voit plus.
        state.selection = new Set();
        state.vue = b.dataset.vue; state.q = ''; state.type = ''; state.statut = ''; draw();
      });
      // ⚠ La ligne entière ouvre la fiche, MAIS PAS SES COMMANDES : un clic sur
      // le menu de statut, une flèche, un lien ou la corbeille doit faire ce
      // qu'il annonce, pas ouvrir une modale par-dessus.
      root.querySelectorAll('tr[data-fiche]').forEach(tr => tr.onclick = (e) => {
        if (e.target.closest('select, button, a, input, textarea')) return;
        const x = lignesProspects[Number(tr.dataset.fiche)];
        if (x) ouvrirFicheRgd(x, draw);
      });

      // Changer de page fait remonter la liste. Sans ce geste on reste au bas
      // de l'ecran, devant le milieu de la page suivante, et on croit que rien
      // ne s'est passe. `scrollIntoView` sur le tableau vaut mieux qu'un
      // `window.scrollTo` : c'est le conteneur de l'application qui defile, pas
      // la fenetre.
      const allerPage = (n) => {
        state.page = n;
        draw();
        root.querySelector('.table-wrap')?.scrollIntoView({ block: 'start' });
      };
      const prec = root.querySelector('#rcl-prec');
      if (prec) prec.onclick = () => allerPage(state.page - 1);
      const suiv = root.querySelector('#rcl-suiv');
      if (suiv) suiv.onclick = () => allerPage(state.page + 1);

      // ⚠ LE FILTRE ET LE SÉLECTEUR DE L'EN-TÊTE SONT LE MÊME RÉGLAGE, pas deux :
      // ils écrivent tous les deux `scope.poserVueRgd`, et `draw()` reconstruit la
      // coquille, donc les deux montrent toujours la même valeur. Deux filtres qui
      // peuvent se contredire sur le même écran sont une question posée deux fois.
      const selResp = root.querySelector('#rcl-resp');
      if (selResp) selResp.onchange = () => {
        scope.poserVueRgd(selResp.value);
        state.selection = new Set();
        state.page = 1;
        draw();
      };

      const selProv = root.querySelector('#rcl-prov');
      if (selProv) selProv.onchange = () => { state.provenance = selProv.value; draw(); };

      // Creer une fiche : elle nait dans le CRM, sans `d1_id`, donc le releve
      // Cloudflare ne la verra jamais. `draw` suffit a la faire apparaitre —
      // `db.insert` a deja pousse la ligne dans le cache local.
      const nouveau = root.querySelector('#rcl-nouveau');
      // La saisie à la main crée une fiche « manuel », donc une provenance
      // « Direct » — c'est ce que le formulaire produisait déjà sous l'onglet
      // « Autre prospect ».
      // La saisie à la main crée une fiche « manuel », donc une provenance
      // « Direct », et elle naît à la première étape. Le bouton ne s'affiche
      // donc que là : créé depuis « Chantier terminé », le prospect
      // apparaîtrait dans un autre onglet que celui qu'on regarde.
      if (nouveau) nouveau.onclick = () => nouvelleDemandeRgd(apporteurs, draw);

      // Supprimer : le bouton n'existe que sur les fiches nees dans le CRM
      // (`boutonSuppression` ne rend rien autrement), et `supprimerProspect`
      // reverifie — un ecran est un garde-fou, pas une garantie.
      // La sélection : une case par ligne, une case par page, deux raccourcis.
      // On redessine à chaque coche — c'est la barre du haut qui doit suivre, et
      // rien n'est en cours de frappe dans ce tableau à ce moment-là.
      root.querySelectorAll('[data-coche]').forEach(c => c.onchange = () => {
        if (c.checked) state.selection.add(c.dataset.coche);
        else state.selection.delete(c.dataset.coche);
        draw();
      });
      const cochePage = root.querySelector('#rcl-coche-page');
      if (cochePage) cochePage.onchange = () => {
        tranche(lignesProspects).forEach(x => {
          if (cochePage.checked) state.selection.add(x.ligne.id);
          else state.selection.delete(x.ligne.id);
        });
        draw();
      };
      const lotTout = root.querySelector('#rcl-lot-tout');
      if (lotTout) lotTout.onclick = () => {
        lignesProspects.forEach(x => state.selection.add(x.ligne.id));
        draw();
      };
      const lotRien = root.querySelector('#rcl-lot-rien');
      if (lotRien) lotRien.onclick = () => { state.selection = new Set(); draw(); };
      const lotConfier = root.querySelector('#rcl-lot-confier');
      if (lotConfier) lotConfier.onclick = () => attribuerEnLotRgd(
        sel().map(x => ({ cible: x.cible, ligne: x.ligne, nom: x.nom })),
        () => { state.selection = new Set(); draw(); });

      root.querySelectorAll('[data-restaurer-fiche]').forEach(b => b.onclick = () => {
        const x = corbeille.find(y => y.id === b.dataset.restaurerFiche);
        if (x) restaurerFiche(x, draw);
      });

      root.querySelectorAll('[data-purger-fiche]').forEach(b => b.onclick = () => {
        const x = corbeille.find(y => y.id === b.dataset.purgerFiche);
        if (x) purgerFiche(x, draw);
      });

      root.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () => {
        const ligne = [...demandes, ...fiches].find(x => x.id === b.dataset.suppr);
        if (!ligne) return;
        // Une demande du site et une fiche ne se suppriment pas au même
        // endroit : on prend le genre de la ligne, pas celui de l'onglet.
        supprimerFiche(demandes.includes(ligne) ? 'site' : 'client', ligne, draw);
      });

      // L'écriture du commentaire, sur le même principe que le statut :
      // l'ancienne valeur revient si l'enregistrement échoue. On écrit au
      // `change` (sortie du champ), pas à chaque frappe : un appel par lettre
      // ferait une écriture par lettre.
      root.querySelectorAll('.note-champ').forEach(i => {
        i.dataset.avant = i.value;
        // La hauteur se cale au rendu, puis à chaque frappe : le champ grandit
        // sous la main pendant qu'on écrit, au lieu d'attendre un redessin.
        ajusterNote(i);
        i.oninput = () => ajusterNote(i);
        i.onchange = async () => {
          const avant = i.dataset.avant;
          const apres = i.value.trim();
          if (avant === apres) return;
          i.disabled = true;
          // Un champ vide efface : on envoie `null`, pas la chaîne vide, pour
          // pouvoir distinguer plus tard « effacé » de « jamais rempli ».
          const r = await majNote({
            uuid: i.dataset.uuid, cible: i.dataset.cible,
            valeur: apres === '' ? null : apres,
          });
          i.disabled = false;
          if (r.ok) {
            i.dataset.avant = apres;
            toast('Commentaire enregistré');
          } else {
            i.value = avant;
            // La valeur revient, la hauteur doit revenir avec : un champ resté
            // haut sur un texte court se lit comme un enregistrement réussi.
            ajusterNote(i);
            toast(`Commentaire non enregistré — ${r.motif}`, 'err');
          }
        };
      });

      // La date d'une relance, saisie dans la cellule. ⚠ AU `change`, PAS À LA
      // FRAPPE, ET SANS REDESSINER : un champ date émet pendant qu'on le
      // remplit, et un redessin du tableau ferait glisser la ligne sous la
      // main — le statut peut l'envoyer dans un autre onglet. Même règle que
      // le commentaire d'à côté.
      // ⚠ NOMMÉ PARCE QU'IL SE REBRANCHE : la cellule est refaite quand le
      // statut passe en relance (voir plus bas), et un gestionnaire posé en
      // boucle au rendu ne suivrait pas le champ qui vient de naître.
      const lierChampRelance = (i) => {
        i.dataset.avant = i.value;
        i.onchange = async () => {
          const avant = i.dataset.avant;
          const apres = i.value;
          if (avant === apres) return;
          // ⚠ LA LIGNE SE RETROUVE PAR L'INDEX DE SON `<tr>` : `db.update`
          // REMPLACE la ligne du cache, donc sans report sur la référence que
          // le tableau tient, le prochain redessin réafficherait l'ancienne
          // date — base juste, écran faux. Piège déjà payé sur la fiche.
          const x = lignesProspects[Number(i.closest('tr')?.dataset.fiche)];
          i.disabled = true;
          const r = await majDateRelance({
            uuid: i.dataset.relUuid, cible: i.dataset.relCible,
            rang: i.dataset.relRang, jour: apres || null,
          });
          i.disabled = false;
          if (r.ok) {
            i.dataset.avant = apres;
            if (x && r.ligne) x.ligne = r.ligne;
            rafraichirRelance(i, x?.ligne || {}, apres);
            toast(apres ? 'Date de relance enregistrée' : 'Date de relance effacée');
          } else {
            i.value = avant;
            toast(`Date non enregistrée — ${r.motif}`, 'err');
          }
        };
      };
      root.querySelectorAll('.rcl-rel-champ').forEach(lierChampRelance);

      const t = root.querySelector('#rcl-type');
      if (t) t.onchange = () => { state.type = t.value; draw(); };
      const st = root.querySelector('#rcl-statut');
      if (st) st.onchange = () => { state.statut = st.value; draw(); };

      // L'écriture du statut. On ne redessine PAS tout de suite : redessiner
      // remplacerait le menu que la personne vient d'ouvrir, et lui ferait
      // perdre le fil. On repeint la seule pastille concernée, et on attend le
      // prochain rendu naturel pour le reste.
      // ⚠ LES FLÈCHES PASSENT PAR LE MENU, elles ne dupliquent pas son code.
      // Poser la valeur puis déclencher `change` rejoue exactement le même
      // chemin : même écriture, même avance du reflet local, même retour en
      // arrière si le worker refuse, même glissement. Un second chemin
      // d'écriture aurait dérivé du premier à la première correction.
      root.querySelectorAll('.rcl-fleche[data-vers]').forEach(b => b.onclick = () => {
        const menu = b.closest('.rcl-statut-cell')?.querySelector('.statut-menu');
        if (!menu || menu.disabled) return;
        menu.value = b.dataset.vers;
        menu.dispatchEvent(new Event('change'));
      });

      root.querySelectorAll('.statut-menu').forEach(m => {
        m.onchange = async () => {
          const avant = m.dataset.avant;
          const apres = m.value;
          if (avant === apres) return;
          m.disabled = true;
          m.className = `statut-menu st-${apres} en-cours`;
          // ⚠ UNE SEULE PORTE, ET ELLE N'EST PAS ICI. Cet écran s'était
          // fabriqué son propre chemin d'écriture, à côté de celui que la
          // fiche et le pipeline appellent ; ils ont vécu séparément trois
          // jours. `ecrireStatut` est la seule — deux copies auraient dérivé
          // à la première correction, et c'est exactement ce qui était en
          // train d'arriver.
          const r = await ecrireStatut({
            uuid: m.dataset.uuid, cible: m.dataset.cible, statut: apres,
          });
          m.disabled = false;
          if (r.ok) {
            m.dataset.avant = apres;
            m.className = `statut-menu st-${apres}`;
            // ⚠ LE CHAMP DE DATE APPARAÎT AVEC LE STATUT, ET RIEN NE LE
            // REDESSINAIT : passer une fiche de « Nouveau prospect » à
            // « Relance 1 » ne change pas d'onglet, donc le redessin complet
            // n'a pas lieu — la date était posée en base et la cellule
            // affichait encore « — ». On refait la seule cellule concernée, et
            // on rebranche son champ.
            const trStatut = m.closest('tr');
            const tdRel = trStatut?.querySelector('.rcl-rel-td');
            const xStatut = lignesProspects[Number(trStatut?.dataset.fiche)];
            if (tdRel && xStatut) {
              if (r.ligne) xStatut.ligne = r.ligne;
              xStatut.statut = apres;
              tdRel.innerHTML = celluleRelance(xStatut.ligne, apres, xStatut.cible);
              const neuf = tdRel.querySelector('.rcl-rel-champ');
              if (neuf) lierChampRelance(neuf);
            }
            // Rien à avancer à la main : `db.update` a remplacé la ligne dans
            // le cache, et le redessin la retrouve à sa place.
            // ⚠ LA LIGNE GLISSE VERS SON NOUVEL ONGLET, ET CE N'EST PAS
            // DÉCORATIF. Sans cela, changer un statut fait disparaître la ligne
            // d'un coup : on ne sait pas si elle est partie quelque part ou si
            // elle s'est effacée. L'animation montre OÙ elle va, et l'onglet de
            // destination clignote pour qu'on le retrouve.
            // ⚠ L'ÉTAPE D'ARRIVÉE SE RECALCULE, elle ne se lit pas dans la
            // table. Prendre `ETAPE_DU_STATUT[apres]` faisait glisser la ligne
            // puis la ramenait : le redessin, lui, repassait par `etapeDe` et
            // pouvait rendre autre chose. Une ligne qui part et revient est
            // pire que pas d'animation du tout.
            const versEtape = apres === 'perdu' ? 'archives'
              : (ETAPE_DU_STATUT[apres] || 'demande');
            const changeDOnglet = versEtape !== state.vue;
            if (changeDOnglet) {
              const tr = m.closest('tr');
              const cible = root.querySelector(`.rcl-etapes [data-vue="${versEtape}"]`);
              // Le sens du glissement suit le sens de la frise : vers la droite
              // si l'affaire avance, vers la gauche si elle recule.
              const av = ORDRE_ETAPES.indexOf(state.vue);
              const ap = ORDRE_ETAPES.indexOf(versEtape);
              const versLaDroite = versEtape === 'archives' || ap > av;
              if (tr) tr.classList.add(versLaDroite ? 'rcl-part-droite' : 'rcl-part-gauche');
              cible?.classList.add('rcl-arrive');
              // On redessine APRÈS l'animation : redessiner tout de suite
              // effacerait la ligne avant qu'elle ait bougé.
              setTimeout(draw, 420);
            }
            toast('Statut mis à jour');
          } else {
            m.value = avant;
            m.className = `statut-menu st-${avant}`;
            toast(`Statut non enregistré — ${r.motif}`, 'err');
          }
        };
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
