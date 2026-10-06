// Créer, déplacer et supprimer un rendez-vous — dans Google, depuis le CRM
//
// ⚠ IL S'APPELAIT `rgd-evenements.js` JUSQU'AU 30/09/2026, et le renommer n'est
// pas cosmétique : depuis que le tableau de bord de BTP Expertise crée ses
// rendez-vous par ici, un fichier nommé « rgd » enverrait chercher au mauvais
// endroit celui qui débogue un rendez-vous du cabinet. Même raison que
// `rgd-api.js` devenu `rgd-site.js` le 25/09.
//
// LE DERNIER GESTE DE L'AGENDA QUI PASSAIT PAR L'APPLICATION RGD (25/09/2026).
// Elle écrivait dans sa propre base puis poussait vers Google ; le CRM, lui, ne
// lit que Google relu (`agenda_events`). Le détour ne servait qu'à laisser une
// copie dans une base qu'on est en train de quitter.
//
// ⚠ GOOGLE RESTE LA SOURCE, ET ÇA NE CHANGE PAS. On crée là-bas, puis on
// relève. Écrire directement dans le reflet donnerait une ligne que le relevé
// suivant effacerait, Google ne la connaissant pas — le défaut silencieux que
// toute la bascule cherche à éviter. Il n'y a donc **aucune synchronisation à
// couper ici** : le relevé est le chemin de retour, pas un concurrent.
//
// ⚠ LE RENDEZ-VOUS EST DÉJÀ REVENU QUAND LA RÉPONSE ARRIVE. Le serveur relève
// la journée visée **et attend** avant de répondre. C'est le gain réel de la
// bascule : l'ancienne route rendait la main dès que Google avait accepté, et
// le rendez-vous n'apparaissait qu'au relevé suivant — une demi-heure, ou le
// lendemain pour un autre jour.
//
// ⚠ LE NAVIGATEUR NE CHOISIT PAS L'AGENDA et ne connaît aucune clé : il
// présente son jeton de session, le serveur lit le calendrier réglé dans le CRM
// et revérifie le droit auprès de la base. Le laisser nommer un calendrier
// reviendrait à le laisser écrire dans n'importe lequel.
import { db } from './db.js';
import { CONFIG } from '../config.js';

// ---------------------------------------------------------------- l'heure
// ⚠ CES DEUX FONCTIONS SONT LA CORRECTION D'UN DÉFAUT VÉCU, pas des utilitaires
// de confort (25/09/2026, signalé par Mickael : « Google Agenda : The specified
// time range is empty »).
//
// ⚠ NE JAMAIS CALCULER UNE FIN AVEC `new Date(...).toISOString()`. Une chaîne
// sans fuseau — « 2026-09-25T18:00:00 » — est lue par le navigateur comme de
// l'heure LOCALE, puis `toISOString()` la rend en UTC : 18:00 à Paris devenait
// « 17:00 ». Or le serveur envoie cette chaîne à Google **étiquetée
// Europe/Paris**, sans la reconvertir. La fin partait donc une heure AVANT le
// début, deux en été, et Google appelle ça une plage vide.
//
// ⚠ PAS D'ARITHMÉTIQUE SUR UN `Date` NON PLUS : « une heure » sur un agenda
// veut dire 18:00 → 19:00, y compris la nuit du changement d'heure, où soixante
// minutes réelles déplaceraient la pendule de deux heures. On compte en minutes
// de pendule, et on change de jour si l'on passe minuit — `decale` s'en charge,
// lui est ancré à midi UTC et ne dérive pas.
//
// ⚠ ELLES VIVAIENT DANS `js/pages/evenement-form.js` JUSQU'AU 01/10/2026. Elles
// en sont sorties quand la fiche projet RGD a eu besoin de calculer la fin d'un
// créneau : c'est un module de DONNÉES, qui ne peut pas importer une page sans
// inverser les couches — et les recopier aurait fait deux exemplaires d'une
// correction, dont un seul serait corrigé le jour venu.
export const decale = (jour, n) =>
  new Date(new Date(jour + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

const p2h = (n) => String(n).padStart(2, '0');

/** ⚠ `heure` EST UNE CHAÎNE « HH:MM », JAMAIS UN NOMBRE : avec un nombre,
 *  `String(14).split(':')` rend `['14']`, les minutes valent `undefined` et la
 *  fin part en « TNaN:NaN ». Ça ne se voit ni à l'écran ni au contrôle de
 *  syntaxe — seulement en lisant ce qui est réellement envoyé. */
export const finApres = (jour, heure, minutes) => {
  const [h, m] = String(heure || '09:00').split(':').map(Number);
  const total = h * 60 + m + minutes;
  const jours = Math.floor(total / 1440);
  const reste = ((total % 1440) + 1440) % 1440;
  return `${jours ? decale(jour, jours) : jour}T${p2h(Math.floor(reste / 60))}:${p2h(reste % 60)}:00`;
};

/**
 * Créer un rendez-vous dans l'agenda d'une structure.
 *
 * `champs` : `titre`, `date_debut`, `date_fin` (heure LOCALE,
 * « AAAA-MM-JJTHH:MM:SS »), `all_day`, et facultativement `lieu`,
 * `description`, `invites`. ⚠ Les trois premiers sont obligatoires — un
 * rendez-vous sans fin n'a pas de place dans une grille horaire —, contrat
 * inchangé pour que l'écran n'ait pas à être réécrit.
 *
 * ⚠ `activite` EST FACULTATIVE ET VAUT « rgd » PAR DÉFAUT, côté serveur comme
 * ici : l'écran Agenda de RGD n'a donc rien eu à changer le jour où BTP est
 * arrivé. `metier` ne concerne que les structures qui tiennent plusieurs
 * agendas — aujourd'hui BTP Expertise seule, « expertise » ou « amo » —, et le
 * serveur le REFUSE absent pour celles-là plutôt que d'en choisir un.
 *
 * Rend `{ ok, donnees }` ou `{ ok: false, motif }`. ⚠ `donnees.releve` dit si
 * la journée a pu être relue : **faux ne veut pas dire échec** — le rendez-vous
 * est dans Google, il arrivera au relevé suivant. Le confondre avec une erreur
 * ferait recommencer, donc créer deux fois.
 */
// ⚠ UN SEUL CHEMIN POUR LES TROIS GESTES : ils présentent le même jeton, au
// même serveur, et rendent le même couple `{ ok, motif }`. Trois copies de cet
// appel auraient fini par traiter l'échec de trois façons différentes — et
// c'est l'échec qu'on lit le moins souvent, donc celui qui dérive en silence.
async function appeler(fonction, champs) {
  // Le mode démo n'a ni fonction serveur ni Google. On le dit au lieu de
  // laisser l'appel échouer sur une adresse vide, comme l'écran Agenda le fait
  // déjà pour son relevé.
  if (db.demo) {
    return { ok: false, motif: 'Indisponible en mode démo : aucun agenda raccordé.' };
  }
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${fonction}`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(champs),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok || rep.ok === false) {
      return { ok: false, motif: rep.erreur || rep.detail || `Erreur ${r.status}` };
    }
    return { ok: true, donnees: rep };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

/**
 * Le détail VRAI d'un rendez-vous, tel que Google le porte.
 *
 * ⚠ IL FAUT LIRE AVANT DE MODIFIER LES INVITÉS, et ce n'est pas un confort :
 * `agenda_events.invites` ne porte que les participants EXTERNES, et seulement
 * pour les visites ; `attendees` n'est qu'un compte. Un `PATCH` chez Google
 * REMPLACE la liste entière — envoyer ce que le CRM affiche retirerait
 * l'organisateur, et sur un rendez-vous ordinaire tous les participants, qui
 * recevraient une annulation que personne n'a demandée.
 *
 * Rend aussi `organisateurs` : ils s'affichent, ils ne se retirent pas d'ici.
 */
export const lireEvenement = (champs) => appeler('lire-evenement', champs);

export const creerEvenement = (champs) => appeler('creer-evenement', champs);

/**
 * Passer un rendez-vous à quelqu'un, en même temps que son dossier.
 *
 * `champs` : `evenement` (l'identifiant de la LIGNE `agenda_events`, jamais
 * un identifiant Google) et `beneficiaire` (un profil).
 *
 * ⚠ LE GESTE N'EST PAS LE MÊME DES DEUX CÔTÉS, et c'est le serveur qui
 * tranche, pas l'écran. Pour RGD le rendez-vous est **déplacé** dans
 * l'agenda de la personne — il quitte celui de la direction, ce qui est tout
 * l'intérêt. Pour BTP la personne est **invitée** et l'événement reste dans
 * l'agenda du cabinet : `btp_projets_depuis_agenda` déduit le métier du
 * calendrier, le déplacer ferait disparaître la fiche projet sans rien dire.
 * La réponse porte `mode` : `deplace` ou `invite`.
 *
 * ⚠ 409 QUAND LA PERSONNE N'A PAS ENCORE D'AGENDA, et c'est un refus utile :
 * retomber sur l'agenda de la structure ne déplacerait rien tout en ayant
 * l'air d'avoir marché.
 */
export const transfererRendezVous = (champs) => appeler('transferer-rendez-vous', champs);

/**
 * Déplacer ou corriger un rendez-vous existant.
 *
 * `champs` : `evenement` (l'identifiant de la LIGNE `agenda_events`, jamais un
 * identifiant Google), et ce qui change — `date_debut` + `date_fin` ensemble,
 * `titre`, `lieu`, `description`.
 *
 * ⚠ LES INVITÉS REÇOIVENT UN MESSAGE DE REPORT (décision du 30/09/2026) :
 * l'écran doit se comporter comme Google Agenda. Sans invité, rien ne part.
 *
 * ⚠ `donnees.releve` à faux NE VEUT PAS DIRE ÉCHEC : le changement est dans
 * Google, le relevé suivant le rapportera. Le confondre avec une erreur ferait
 * recommencer — donc prévenir le client deux fois.
 */
export const modifierEvenement = (champs) => appeler('modifier-evenement', champs);

/**
 * Supprimer un rendez-vous. `champs` : `evenement`, l'identifiant de la ligne.
 *
 * ⚠ LA SUPPRESSION SE FAIT DANS GOOGLE, ET C'EST LA SEULE QUI TIENNE : une
 * ligne effacée dans le reflet seul reviendrait au relevé suivant, Google
 * étant la source. ⚠ ELLE ENVOIE UNE ANNULATION AUX INVITÉS.
 */
export const supprimerEvenement = (champs) => appeler('supprimer-evenement', champs);
