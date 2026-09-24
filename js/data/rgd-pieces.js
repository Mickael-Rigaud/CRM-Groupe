// Les pièces administratives des sous-traitants — dépôt, lecture, relance
//
// CE QUE CE MODULE A REPRIS, ET POURQUOI C'ÉTAIT LE PLUS URGENT
// Déposer une attestation et relancer un artisan par email étaient les deux
// derniers gestes de l'espace RGD à ne vivre QUE dans l'application d'origine :
// le fichier partait dans son stockage, l'email partait de son serveur. Tant
// que c'était vrai, l'éteindre éteignait le seul endroit où l'on peut prouver
// qu'un artisan est en règle — et sans attestation de vigilance à jour, c'est
// le donneur d'ordre qui répond du travail dissimulé.
//
// ⚠ LES PIÈCES NE S'ÉCRIVENT PAS DANS `rgd_sous_traitants`, ET CE N'EST PAS UN
// DÉTAIL DE RANGEMENT. Cette table est un reflet, réécrit toutes les 30 minutes
// par la synchronisation : elle repose les quatre dates (vigilance, décennale,
// URSSAF, Kbis) et les quatre `*_url` des pièces secondaires. Un dépôt écrit
// là-dedans disparaîtrait à la demi-heure suivante, sans un mot et sans erreur.
// `rgd_st_pieces` n'est envoyée par aucune porte de la synchronisation : elle
// appartient au CRM, et elle y restera quand la synchronisation s'arrêtera.
//
// ⚠ LES DATES CONTINUENT D'ARRIVER DE L'AUTRE CÔTÉ, ELLES. Une pièce peut donc
// avoir une date connue sans aucun document ici — c'est exactement ce que
// `etatPiece` nomme « date connue, aucun document », et c'est l'état le plus
// trompeur : il ressemble à une attestation valide et n'en est pas une.
//
// LES FICHIERS DÉJÀ DÉPOSÉS AILLEURS NE SONT PAS REPRIS (décision du
// 24/09/2026) : ce sont des essais. Ce module ne va donc jamais les chercher.
import { db } from './db.js';
import { scope } from './scope.js';
import { CONFIG } from '../config.js';
import { esc } from '../ui.js';

const SEAU = 'sous-traitants';

// Les huit pièces, dans l'ordre du risque. Déclarées ICI et nulle part
// ailleurs : l'écran de liste n'en montre que quatre, le panneau les huit, et
// c'est sur les huit que porte le mail de relance — trois listes qui doivent
// être la même. `date` est la colonne du reflet qui porte encore la date
// venue de l'autre côté ; `signature` dit que la date n'est pas une échéance.
export const PIECES_ST = [
  { key: 'vigilance', label: 'Attestation de vigilance', date: 'attestation_vigilance_expire',
    pourquoi: 'sans elle, le donneur d’ordre répond du travail dissimulé' },
  { key: 'decennale', label: 'Assurance décennale', date: 'assurance_decennale_expire',
    pourquoi: 'sans elle, c’est RGD Renova qui porte le sinistre' },
  { key: 'urssaf', label: 'Attestation URSSAF', date: 'attestation_urssaf_expire' },
  { key: 'kbis', label: 'Extrait Kbis', date: 'kbis_expire' },
  { key: 'rc_pro', label: 'Assurance RC Pro', date: 'rc_pro_expire' },
  { key: 'regularite_fiscale', label: 'Attestation de régularité fiscale',
    date: 'regularite_fiscale_expire' },
  // Un contrat signé ne périme pas : `contrat_st_date` est une date de
  // SIGNATURE. L'afficher comme une échéance le ferait passer rouge le
  // lendemain de la signature.
  { key: 'contrat_st', label: 'Contrat de sous-traitance signé', date: 'contrat_st_date',
    signature: true },
  { key: 'rib', label: 'RIB', date: null },
];

export const MAX_OCTETS = 24 * 1024 * 1024;   // la limite du seau, dite avant l'envoi

const parCle = Object.fromEntries(PIECES_ST.map(p => [p.key, p]));

// Jours restants avant l'échéance : négatif = déjà passée.
const joursRestants = (d) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
const fr = (d) => String(d || '').split('-').reverse().join('/');

/** Les pièces déposées pour un sous-traitant, rangées par type. */
export function piecesDe(sousTraitantId) {
  const out = {};
  for (const p of scope.rgd('rgd_st_pieces')) {
    if (p.sous_traitant_id === sousTraitantId) out[p.type] = p;
  }
  return out;
}

/** La date qui compte pour une pièce : celle du document déposé ici s'il
 *  existe, sinon celle que la synchronisation a rapportée. Le document prime —
 *  c'est le seul des deux dont on sache qu'il y a un fichier derrière. */
export function dateDe(st, pieces, p) {
  const deposee = pieces[p.key];
  if (deposee) return deposee.expire_le || null;
  return p.date ? (st[p.date] || null) : null;
}

/**
 * L'état d'une pièce, en trois questions : y a-t-il un document, y a-t-il une
 * date, la date est-elle passée. Les deux premières comptent autant que la
 * troisième — une pièce absente n'est pas « à jour », c'est « on ne sait pas »,
 * ce qui est pire qu'expiré puisque personne ne l'a jamais demandée.
 *
 * `poids` sert au tri des relances : plus c'est bas, plus c'est urgent.
 */
export function etatPiece(st, pieces, p) {
  const doc = pieces[p.key];
  const quand = dateDe(st, pieces, p);
  if (!doc && !quand) return { cle: 'absent', texte: 'Absente', ton: 'red', poids: 0 };
  if (!doc) return { cle: 'sans-doc', texte: 'Date connue, aucun document', ton: 'red', poids: 1 };
  if (p.signature) return { cle: 'ok', texte: quand ? `Signé le ${fr(quand)}` : 'Déposé', ton: 'green', poids: 4 };
  if (!p.date) return { cle: 'ok', texte: 'Déposé', ton: 'green', poids: 4 };
  if (!quand) return { cle: 'sans-date', texte: 'Déposée, sans date de validité', ton: 'amber', poids: 3 };
  const j = joursRestants(quand);
  if (j < 0) return { cle: 'expire', texte: `Expirée le ${fr(quand)}`, ton: 'red', poids: 1 };
  if (j <= 30) return { cle: 'bientot', texte: `Expire dans ${j} j`, ton: 'amber', poids: 2 };
  return { cle: 'ok', texte: `Valable jusqu’au ${fr(quand)}`, ton: 'green', poids: 4 };
}

// ------------------------------------------------------------------- dépôt

/**
 * Déposer une pièce : le fichier dans le seau, la ligne dans la table.
 *
 * ⚠ LE CHEMIN EST DÉTERMINISTE (`<id>/<type>.pdf`) et le dépôt se fait en
 * remplacement. Un chemin daté laisserait un fichier orphelin à chaque
 * « Remplacer », que plus rien ne désignerait et que personne n'irait effacer.
 *
 * ⚠ LE FICHIER D'ABORD, LA LIGNE ENSUITE. Dans l'autre sens, une ligne
 * annoncerait une attestation dont le fichier n'est jamais arrivé — c'est-à-dire
 * exactement le mensonge que cet écran existe pour empêcher.
 */
export async function deposerPiece(st, type, fichier, expireLe) {
  if (!parCle[type]) return { ok: false, motif: `type de pièce inconnu (${type})` };
  const chemin = `${st.id}/${type}.pdf`;
  try {
    await db.uploadFile(chemin, fichier, { bucket: SEAU, upsert: true });
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
  const ligne = {
    sous_traitant_id: st.id,
    type,
    chemin,
    nom_fichier: String(fichier.name || '').slice(0, 200),
    taille_octets: fichier.size,
    // Une chaîne vide n'est pas une date : la laisser passer ferait échouer
    // l'écriture, et pour le RIB il n'y a simplement rien à dater.
    expire_le: expireLe || null,
    deposee_le: new Date().toISOString(),
  };
  const existante = piecesDe(st.id)[type];
  try {
    if (existante) await db.update('rgd_st_pieces', existante.id, ligne);
    else await db.insert('rgd_st_pieces', ligne);
  } catch (e) {
    // Le fichier est bien arrivé, la ligne non : le dire, sinon on croirait
    // que rien n'est parti et on redéposerait sans fin.
    return { ok: false, motif: `fichier envoyé, fiche non enregistrée (${String(e.message || e).slice(0, 120)})` };
  }
  return { ok: true };
}

/** Le lien de téléchargement, signé une heure. On ne stocke jamais ce lien :
 *  il expire, et un lien mort se lit comme un document perdu. */
export async function lienPiece(piece) {
  try {
    return { ok: true, url: await db.fileUrl(piece.chemin, { bucket: SEAU }) };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

// ----------------------------------------------------------------- relance

/**
 * Ce que le mail va réclamer. Reprise à la règle près de l'application
 * d'origine : une pièce est « à renouveler » si elle est déposée ET que son
 * échéance tombe dans les trente jours (ou est passée) ; elle est « manquante »
 * si aucun document n'a été déposé.
 *
 * ⚠ UNE DATE SANS DOCUMENT COMPTE COMME MANQUANTE, et c'est un écart assumé
 * avec l'original — qui, lui, regardait l'URL du fichier, dont il disposait.
 * Ici la date peut venir de la synchronisation sans qu'aucun document n'existe
 * dans le CRM : réclamer la pièce est la bonne réponse, la taire serait
 * affirmer qu'on détient une preuve qu'on n'a pas.
 */
export function pieceAReclamer(st, pieces) {
  const expirees = [], manquantes = [];
  for (const p of PIECES_ST) {
    const doc = pieces[p.key];
    if (!doc) { manquantes.push({ label: p.label }); continue; }
    if (!p.date || p.signature) continue;     // le RIB et le contrat n'expirent pas
    const quand = doc.expire_le;
    if (!quand) continue;
    const j = joursRestants(quand);
    if (j > 30) continue;
    expirees.push({ label: p.label, echeance: fr(quand), jours: j });
  }
  return { expirees, manquantes };
}

/**
 * Le corps du mail. Repris mot pour mot de l'application d'origine — même
 * rappel des textes, même délai de quinze jours, même signature. Le réécrire
 * « en mieux » ferait dire deux choses différentes à RGD Renova selon l'outil
 * qui a envoyé le message.
 *
 * ⚠ SANS L'ENVELOPPE DE MARQUE : l'envoi l'ajoute (bandeau au logo, pied
 * orange). La poser ici aussi donnerait deux en-têtes dans le même message.
 */
export function corpsRelance(st, { expirees, manquantes }) {
  const prenom = String(st.contact_nom || '').split(' ')[0] || '';
  const salut = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const raison = st.raison_sociale || 'votre entreprise';

  let liste = '';
  if (expirees.length) {
    liste += '<p style="margin:14px 0 4px;font-weight:700;">Documents à renouveler :</p>'
      + '<ul style="margin:0 0 12px 0;padding-left:22px;">';
    for (const d of expirees) {
      const pastille = d.jours < 0
        ? `<span style="color:#d9472b;font-weight:700;">expiré depuis ${Math.abs(d.jours)} j</span>`
        : `<span style="color:#d9a527;font-weight:700;">expire dans ${d.jours} j</span>`;
      liste += `<li style="margin-bottom:4px;"><strong>${esc(d.label)}</strong> — ${pastille} (échéance ${esc(d.echeance)})</li>`;
    }
    liste += '</ul>';
  }
  if (manquantes.length) {
    liste += '<p style="margin:14px 0 4px;font-weight:700;">Documents manquants :</p>'
      + '<ul style="margin:0 0 12px 0;padding-left:22px;">';
    for (const d of manquantes) liste += `<li style="margin-bottom:4px;"><strong>${esc(d.label)}</strong></li>`;
    liste += '</ul>';
  }

  return `
    <p>${esc(salut)}</p>
    <p>Afin de rester en règle sur nos obligations de sous-traitance (loi du 31/12/1975 et art. L. 8222-1 du Code du travail), nous devons maintenir à jour votre dossier administratif pour <strong>${esc(raison)}</strong>.</p>
    ${liste}
    <p style="margin:16px 0 4px;">Merci de nous transmettre ces documents <strong>par retour de mail</strong> à <a href="mailto:contact@rgdrenova.fr" style="color:#FD7A2C;">contact@rgdrenova.fr</a> dans les meilleurs délais.</p>
    <p style="margin:4px 0;">Sans réponse sous 15 jours, nous serons contraints de suspendre les affectations sur les chantiers en cours et à venir.</p>
    <p style="margin:20px 0 4px;">Restant à votre disposition pour toute question,</p>
    <p style="margin:4px 0;">Bien cordialement,<br><strong>Mickael Rigaud</strong><br>RGD Renova</p>`;
}

export const objetRelance = (st) =>
  `RGD Renova — Documents administratifs à renouveler (${st.raison_sociale || 'votre entreprise'})`;

/**
 * Préparer la relance sans rien envoyer. Rend le refus tel quel quand il y en
 * a un : pas d'email sur la fiche, ou rien à réclamer. Ce ne sont pas des
 * pannes, ce sont des réponses — l'écran les montre au lieu de les traduire.
 */
export function preparerRelance(st) {
  if (!st.email) return { ok: false, motif: 'Aucun email renseigné pour ce sous-traitant.' };
  const aReclamer = pieceAReclamer(st, piecesDe(st.id));
  if (!aReclamer.expirees.length && !aReclamer.manquantes.length) {
    return { ok: false, motif: 'Aucun document expiré ou manquant — pas de relance à envoyer.' };
  }
  return {
    ok: true,
    donnees: {
      objet: objetRelance(st),
      corps: corpsRelance(st, aReclamer),
      expirees: aReclamer.expirees,
      manquantes: aReclamer.manquantes,
    },
  };
}

/**
 * Envoyer la relance. Le message part par la fonction d'envoi d'emails du CRM,
 * la même que les quatre accusés du formulaire du site : même expéditeur, même
 * enveloppe, même fournisseur. Rien ne passe plus par l'application d'origine.
 *
 * ⚠ LE NAVIGATEUR NE CONNAÎT AUCUNE CLÉ : il présente son jeton de session, et
 * c'est le serveur qui porte le secret. Sans session — en mode démo — l'appel
 * n'est même pas tenté.
 *
 * `objet` et `corps` viennent de l'aperçu qu'on avait sous les yeux, et pas
 * d'un second calcul : ce qu'on a lu est ce qui part.
 */
export async function envoyerRelance(st, { objet, corps }) {
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'Session expirée : reconnectez-vous.' };
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/envoyer-email`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: { email: st.email, name: st.contact_nom || st.raison_sociale || st.email },
        subject: objet,
        html: corps,
        // La réponse de l'artisan doit arriver dans la boîte de l'entreprise,
        // pas dans celle de l'expéditeur technique.
        replyTo: { email: 'contact@rgdrenova.fr', name: 'RGD Renova' },
      }),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok || rep.ok === false) {
      return { ok: false, motif: rep.detail || rep.erreur || `Erreur ${r.status}` };
    }
    // La trace de l'envoi, pour qu'on ne relance pas le même artisan trois fois
    // dans la journée, chacun croyant être le premier. Une trace qui échoue ne
    // rend pas le mail non envoyé : il est parti, on le dit et on continue.
    try {
      await db.update('rgd_sous_traitants', st.id, { derniere_relance_pieces: new Date().toISOString() });
    } catch (e) {
      console.warn('[RGD] relance envoyée, date non enregistrée :', e.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}
