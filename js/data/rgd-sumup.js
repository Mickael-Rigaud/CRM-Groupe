// L'encaissement par carte : le pont vers SumUp (11/11/2026)
//
// ⚠ LE COMPTE SUMUP EST CELUI DE RGD RENOVA, PAS CELUI DE FRANCK
// (11/11/2026, Élodie : « ce n'est pas le lecteur de franck c'est le compte
// sumup de rgd, c'est juste que franck y aura accès »). Ce n'est pas qu'une
// affaire de mots : un compte d'entreprise porte PLUSIEURS lecteurs, un par
// personne qui encaisse. Le CRM doit donc savoir AUQUEL envoyer le montant —
// d'où `sumup_lecteur` dans les réglages, et le choix à l'écran quand il y en
// a plus d'un. Si le lecteur avait appartenu à Franck, la question ne se
// serait jamais posée et le premier lecteur trouvé aurait suffi.
//
// Élodie, le 11/11/2026 : « ensuite nous voulons mettre en place sumup […] je
// ne sais pas ce qu'il est possible de faire avec sumup, si tu peux m'aiguiller
// dessus stp ».
//
// CE QU'IL EST POSSIBLE DE FAIRE, LU SUR LA DOCUMENTATION SUMUP LE 11/11/2026
// La « Cloud API » laisse un logiciel — n'importe lequel, y compris une page
// web — LANCER une transaction sur un lecteur appairé au compte, et en
// recevoir le résultat. C'est le seul chemin qui évite de retaper le montant
// sur le terminal puis de pointer les deux listes le soir.
//
// ⚠ ELLE NE PARLE QU'AU LECTEUR **SOLO**. Le **Go** la supporte aussi mais
// n'est vendu qu'en Australie, au Mexique et au Canada. Un **Air**, un **Solo
// Lite**, un **3G** ou un **PIN+** se jumellent en Bluetooth à l'application
// SumUp : aucune API ne les atteint, et le CRM ne pourra qu'enregistrer le
// paiement après coup. C'est pourquoi le premier geste de cet écran n'est pas
// de payer, mais de DEMANDER QUELS LECTEURS SONT RELIÉS — la réponse vient de
// SumUp, pas d'un appareil qu'il faudrait retourner.
//
// ⚠ ET RIEN NE PASSE PAR LE NAVIGATEUR. Les deux clés vivent dans les secrets
// de la fonction `sumup` côté serveur ; cet écran ne fait que lui parler, avec
// la session du CRM. Une clé API SumUp permet d'encaisser : la poser dans une
// page publique reviendrait à la donner.
import { db } from './db.js';
import { CONFIG } from '../config.js';

/** Les modèles que la Cloud API sait piloter. Tout le reste passe par l'appli. */
export const MODELES_PILOTABLES = ['solo', 'go'];

export const estPilotable = (modele) =>
  MODELES_PILOTABLES.includes(String(modele || '').toLowerCase().replace(/[\s_-]/g, ''));

async function appeler(corps) {
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée — reconnectez-vous' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/sumup`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corps),
    });
    const rep = await r.json().catch(() => ({}));
    // ⚠ UN REFUS N'EST PAS UNE PANNE, ET LE MOTIF COMPTE : « SUMUP_API_KEY
    // n'est pas posée » et « SumUp 401 » envoient chercher le défaut à deux
    // endroits opposés. Le réduire à « erreur » ferait perdre une demi-heure.
    if (!r.ok || rep.ok === false) {
      return { ok: false, motif: rep.erreur || rep.detail || `Erreur ${r.status}` };
    }
    return { ok: true, donnees: rep };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 200) };
  }
}

/** Ce que SumUp sait du compte : code marchand, lecteurs reliés, clés posées. */
export const lireCompteSumUp = () => appeler({ action: 'info' });

/**
 * Appairer un lecteur avec le code affiché sur son écran.
 *
 * ⚠ LE CODE EXPIRE EN CINQ MINUTES et ne sert qu'une fois. On le fait naître
 * sur le lecteur DÉCONNECTÉ (Connexions → API → Connecter), et on appelle ceci
 * dans la foulée — pas après être allé chercher un café.
 */
export const appairerLecteurSumUp = (code, nom) =>
  appeler({ action: 'appairer', code, nom });

const CLE_LECTEUR = 'sumup_lecteur';

/** Le lecteur que le CRM adresse, parmi ceux du compte. */
export function lecteurSumUp() {
  const v = db.t('rgd_reglages').find(r => r.cle === CLE_LECTEUR)?.valeur;
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

/**
 * Choisir le lecteur que le CRM adressera.
 *
 * ⚠ UN COMPTE D'ENTREPRISE EN PORTE PLUSIEURS, et le CRM n'en pousse qu'un :
 * envoyer un montant sur le mauvais terminal ferait sonner la carte à l'autre
 * bout du département. Le choix est donc explicite, et il se change.
 *
 * ⚠ IL S'ÉCRIT DEPUIS LE NAVIGATEUR, PAS PAR LA FONCTION : `rgd_reglages`
 * s'écrit déjà ainsi pour les CGV et les objectifs, en direction seule
 * (policy `rgd_reglages_maj`). Passer par le serveur pour poser un identifiant
 * qui n'a rien de secret aurait ajouté un aller-retour sans rien fermer.
 */
export async function choisirLecteurSumUp(lecteur) {
  const valeur = JSON.stringify({
    id: lecteur.id, nom: lecteur.nom, modele: lecteur.modele,
    marchand: lecteur.marchand || null, choisi_le: new Date().toISOString(),
  });
  const existe = db.t('rgd_reglages').some(x => x.cle === CLE_LECTEUR);
  return existe
    ? db.update('rgd_reglages', CLE_LECTEUR, { valeur })
    : db.insert('rgd_reglages', { cle: CLE_LECTEUR, valeur });
}
