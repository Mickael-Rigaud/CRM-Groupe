// Ce qui est propre à une personne de RGD : son métier, son secteur, ses heures.
//
// ⚠ CE FICHIER S'EST APPELÉ `rgd-aiguillage.js` PENDANT UNE HEURE, le temps que
// la demande se précise. Le nom décrivait l'aiguillage seul ; le module porte
// désormais aussi le formulaire simplifié et les heures de rendez-vous, et un
// fichier nommé d'après un de ses trois usages se serait fait oublier par les
// deux autres.
//
// Demandé par Élodie le 28/10/2026, le lendemain de la création du compte de
// Franck : « je voudrais qu'on adapte le formulaire de la nouvelle demande
// puisque lui sera spécialisé dans l'électricité » et « dans le profil de
// mickael quand il soumet une nouvelle demande je voudrais que les demandes qui
// concernent l'électricité avec un code postal commençant par 06 ou 83, soit
// directement envoyé à Franck puisque c'est lui qui s'occupera des rendez-vous
// électricité dans le sud ».
//
// ⚠ UNE SEULE DÉCLARATION POUR TROIS COMPORTEMENTS, ET C'EST VOULU. Le même
// `AIGUILLAGES` dit à qui va la demande, de quel métier est la personne —
// c'est-à-dire quel formulaire elle voit — et quand elle peut recevoir un
// rendez-vous. Les écrire à trois endroits aurait permis qu'un jour Franck voie
// un formulaire d'électricien sans plus recevoir les demandes d'électricité, ou
// qu'on l'aiguille sur des créneaux où il est sur un chantier — et rien ne
// l'aurait dit.
//
// ⚠ LA RÈGLE EST DANS LE CODE, C'EST UN CHOIX (Élodie, 28/10/2026, entre trois
// propositions). Conséquence à assumer : **changer un département ou nommer
// quelqu'un d'autre demande de repasser par le code.** La fiche de compte ne
// porte ni spécialité ni secteur. Le jour où il y a un second spécialiste, ou
// un troisième département, c'est le moment de remonter ces deux lignes dans
// `profiles` plutôt que d'allonger la liste ici.
import { db } from './db.js';

// ⚠ `ids` PORTE LA PRODUCTION **ET** LA DÉMO, dans cet ordre. La démo a ses
// propres profils (`u-*`, voir `seed.js`) : sans son identifiant ici, l'écran
// de démonstration n'aiguillerait rien et le défaut ne se verrait qu'en vrai.
// On prend le PREMIER qui existe dans `profiles`, jamais les deux.
//
// ⚠ ET `nom` N'EST PAS DÉCORATIF : c'est le dernier recours si aucun des
// identifiants ne répond — un compte recréé change d'identifiant sans prévenir.
// Il sert aussi à écrire le message à l'écran avant que le profil soit connu.
export const AIGUILLAGES = [
  {
    metier: 'Électricité',
    // Alpes-Maritimes et Var. Les deux premiers chiffres du code postal, pas le
    // département : c'est ce qu'on a sous la main dans la demande.
    departements: ['06', '83'],
    vers: { ids: ['0bdd0a27-3f26-4501-9c68-ffbbf10a8ccd', 'u-franck'], nom: 'Franck' },
    // ⚠ CE SONT SES HEURES DISPONIBLES, PAS SES INDISPONIBILITÉS (arbitré par
    // Élodie le 28/10/2026 : « c'est quand il EST dispo »). La phrase d'origine
    // — « ne peut prendre de rendez-vous les lundis, mercredis, vendredi à
    // partir de 16h et les samedis matin » — se lisait dans les deux sens, et
    // les deux donnaient des semaines opposées. Hors de ces fenêtres il est sur
    // un chantier : mardi, jeudi et dimanche ne proposent RIEN.
    //
    // `jour` suit `Date.getUTCDay()` : 0 dimanche, 1 lundi… 6 samedi. Les
    // bornes sont en minutes après minuit, comme tout `rgd-creneaux.js`.
    //
    // ⚠ RESSERRÉES LE 28/10/2026 PAR ÉLODIE : « mets 12h et mets 16h à 18h pour
    // lundi, mercredi et vendredi ». Le samedi s'arrêtait à 13 h pour qu'un
    // rendez-vous d'une heure commencé à midi tienne ; il s'arrête désormais à
    // midi, donc le dernier départ d'une visite d'une heure est 11 h. Et la
    // semaine finit à 18 h, plus à la fermeture de 19 h.
    disponibilites: [
      { jour: 1, de: 16 * 60, a: 18 * 60 },   // lundi, de 16 h à 18 h
      { jour: 3, de: 16 * 60, a: 18 * 60 },   // mercredi
      { jour: 5, de: 16 * 60, a: 18 * 60 },   // vendredi
      { jour: 6, de: 8 * 60,  a: 12 * 60 },   // samedi, de 8 h à midi
    ],
  },
];

/** Le profil visé par une règle, ou `null` si aucun compte ne répond. */
export const personneDe = (regle) => {
  for (const id of regle?.vers?.ids || []) {
    const p = db.byId('profiles', id);
    if (p) return p;
  }
  const nom = String(regle?.vers?.nom || '').trim().toLowerCase();
  if (!nom) return null;
  return db.t('profiles').find(p => String(p.full_name || '').trim().toLowerCase() === nom) || null;
};

/** La règle qui nomme cette personne, ou `null`. */
export const regleDe = (user) => {
  if (!user?.id) return null;
  const nom = String(user.full_name || '').trim().toLowerCase();
  return AIGUILLAGES.find(a => (a.vers?.ids || []).includes(user.id)
    || (!!nom && String(a.vers?.nom || '').trim().toLowerCase() === nom)) || null;
};

/**
 * Les fenêtres de rendez-vous d'une personne un jour donné, en minutes après
 * minuit — ou `null` quand elle n'a aucune contrainte déclarée.
 *
 * ⚠ `null` ET `[]` NE DISENT PAS LA MÊME CHOSE, et tout en dépend : `null`
 * signifie « cette personne n'a pas d'horaires à elle », donc la journée entière
 * comme avant ; `[]` signifie « ce jour-là, rien », donc aucun créneau. Les
 * confondre fermerait l'agenda de tout le monde, ou ouvrirait le mardi de
 * l'électricien.
 *
 * ⚠ LE JOUR DE LA SEMAINE SE LIT À MIDI UTC. `new Date('2026-11-02')` est
 * minuit UTC : dans un navigateur réglé à l'ouest de Greenwich, c'est encore la
 * veille, et le lundi devient dimanche. Même précaution que `decale`.
 */
export const fenetresDuJour = (user, jour) => {
  const r = regleDe(user);
  if (!r?.disponibilites) return null;
  const j = new Date(`${jour}T12:00:00Z`).getUTCDay();
  return r.disponibilites.filter(d => d.jour === j).map(d => [d.de, d.a]);
};

/**
 * Le métier déclaré pour quelqu'un, ou `null`.
 *
 * C'est ce que lit le formulaire pour se resserrer : une personne sans règle
 * voit la liste entière, exactement comme avant.
 */
export const metierDe = (user) => regleDe(user)?.metier || null;

// ⚠ LE CHANTIER D'ABORD, LE PROSPECT À DÉFAUT. C'est là que l'électricien se
// déplace, et les deux diffèrent plus souvent qu'on ne croit — un propriétaire
// à Paris, l'appartement à Antibes. La même règle que l'adresse du PV de
// réception (`adresseChantier`) : prendre le code postal du prospect quand
// celui du chantier manque vaut mieux que ne rien aiguiller, mais pas mieux que
// le bon.
const departementDe = (v) => {
  const cp = String(v?.code_postal_chantier || '').trim() || String(v?.code_postal || '').trim();
  return cp.slice(0, 2);
};

/**
 * La règle qui s'applique à une saisie, ou `null`.
 *
 * ⚠ ELLE NE REGARDE QUE LA SAISIE, PAS QUI SAISIT : c'est l'appelant qui
 * décide s'il a le droit de confier la demande à quelqu'un d'autre. Mêler les
 * deux ici rendrait la règle impossible à éprouver seule.
 */
export const regleQuiSApplique = (v) => {
  const travaux = Array.isArray(v?.types_travaux) ? v.types_travaux
    : String(v?.types_travaux || '').split(',').map(s => s.trim());
  const dep = departementDe(v);
  if (!dep) return null;
  return AIGUILLAGES.find(a =>
    travaux.includes(a.metier) && a.departements.includes(dep)) || null;
};

/**
 * À qui confier cette demande, ou `null` pour « à personne d'autre que moi ».
 *
 * ⚠ RÉSERVÉ À LA DIRECTION, ET CE N'EST PAS DE LA POLITESSE. Les policies
 * `rgd_*_maj` et `contacts_*` n'acceptent un `owner_id` autre que soi que de la
 * direction : un chargé d'affaires qui aiguillerait sa propre saisie écrirait
 * une fiche qu'il ne reverrait jamais — ou se ferait refuser l'écriture. La
 * demande du 28/10 parle d'ailleurs du profil de Mickael.
 *
 * ⚠ ET JAMAIS VERS SOI-MÊME : la direction qui serait elle-même la cible d'une
 * règle garderait sa fiche, sans message. Aiguiller vers soi n'est pas un
 * aiguillage, c'est le fonctionnement normal.
 */
export const aiguillagePour = (v, user) => {
  if (!user?.id || user.role !== 'direction') return null;
  const regle = regleQuiSApplique(v);
  if (!regle) return null;
  const profil = personneDe(regle);
  if (!profil || profil.id === user.id) return null;
  if (profil.active === false) return null;
  return { regle, profil };
};
