// Demander un avis Google à un client dont le chantier est terminé
// (13/10/2026, demandé par Élodie).
//
// ⚠ C'EST TOUT CE QUI RESTE DU RACCORDEMENT DE LA FICHE, ET CE N'EST PAS UN LOT
// DE CONSOLATION. Les trois voies pour FAIRE ENTRER les avis dans le CRM sont
// fermées — l'API Business Profile demande un dossier examiné par Google
// (refusé), l'API Places une facturation Google Cloud (refusée), et
// l'association Analytics ne sert à rien puisque Google n'expose pas ces
// données à son API (mesuré le 13/10). Celle-ci va dans l'autre sens : elle
// n'importe rien, elle aide à en OBTENIR. Elle ne demande donc ni clé, ni
// carte, ni autorisation.
//
// ⚠ LE LIEN EST CELUI QUE GOOGLE FOURNIT, JAMAIS FABRIQUÉ : l'interface
// Business Profile donne un lien court (`https://g.page/r/…/review`) sous
// « Demander des avis ». Le reconstruire à partir d'un identifiant trouvé
// ailleurs, c'est risquer d'envoyer trente clients vers la fiche d'un autre.
//
// ⚠ IL VIT DANS `settings`, PAS DANS UNE TABLE NEUVE : une clé, une valeur,
// des policies qui existent déjà (lecture pour tous, écriture direction) —
// donc aucune migration. Il se règle dans `#/rgd/reglages`.

import { db } from './db.js';
import { CONFIG } from '../config.js';

export const CLE_LIEN_AVIS = 'rgd_avis_google_lien';

const txt = (v) => String(v ?? '').trim();

/** Le lien de demande d'avis, ou une chaîne vide s'il n'est pas réglé. */
export function lienAvis() {
  const l = db.t('settings').find(s => s.key === CLE_LIEN_AVIS);
  const v = l?.value;
  return txt(typeof v === 'string' ? v : v?.url);
}

/**
 * ⚠ ON REFUSE CE QUI N'EST PAS UNE ADRESSE GOOGLE : ce lien part à des clients
 * au nom de RGD Renova. Une faute de frappe ou un collage à côté enverrait des
 * gens n'importe où, et personne ne s'en apercevrait avant longtemps.
 */
export function lienAvisValide(url) {
  const u = txt(url);
  if (!u) return { ok: false, motif: 'Le lien est vide.' };
  let h;
  try { h = new URL(u); } catch { return { ok: false, motif: 'Ce n’est pas une adresse valide.' }; }
  if (h.protocol !== 'https:') return { ok: false, motif: 'Le lien doit commencer par https://' };
  const hote = h.hostname.replace(/^www\./, '');
  const connus = ['g.page', 'search.google.com', 'maps.app.goo.gl', 'goo.gl'];
  if (!connus.includes(hote)) {
    return { ok: false, motif: `Ce lien pointe vers ${hote}, pas vers Google. Reprenez celui que donne « Demander des avis » dans votre fiche d’établissement.` };
  }
  return { ok: true };
}

export async function enregistrerLienAvis(url) {
  const v = txt(url);
  const existe = db.t('settings').some(s => s.key === CLE_LIEN_AVIS);
  if (existe) await db.update('settings', CLE_LIEN_AVIS, { value: v });
  else await db.insert('settings', { key: CLE_LIEN_AVIS, value: v });
}

/* ------------------------------------------------------------- le message */

/**
 * ⚠ LE DESCRIPTEUR DE FICHE N'A PAS DE PRÉNOM — mesuré : `ficheDe` ne rend que
 * `nom`, le nom complet. On va donc le chercher dans la LIGNE quand elle est
 * fournie, et on retombe sur le nom complet sinon.
 *
 * ⚠ ET ON NE DÉCOUPE PAS LE NOM COMPLET POUR EN TIRER UN PRÉNOM : « Bonjour
 * Dupont » sur une fiche « Dupont Jean » est pire que « Bonjour Jean Dupont ».
 * Le découpage au jugé se trompe une fois sur deux — c'est la raison pour
 * laquelle `rgd_visites_depuis_agenda` a cessé de le faire.
 */
const prenomDe = (f) => {
  // Le prénom est une donnée EXACTE quand elle existe : `contacts.first_name`.
  // Mesuré : `rgd_clients` n'a aucune colonne de nom, c'est le contact lié qui
  // les porte, et l'instantané de fiche ne rend que le nom complet.
  const l = f?.ligne;
  if (l?.contact_id) {
    const c = db.t('contacts').find(x => x.id === l.contact_id);
    if (txt(c?.first_name)) return txt(c.first_name);
  }
  // Une entreprise n'a pas de prénom : on l'appelle par son nom, ce qui est
  // l'usage et jamais faux.
  if (l?.organisation_id) {
    const o = db.t('organisations').find(x => x.id === l.organisation_id);
    if (txt(o?.name)) return txt(o.name);
  }
  return txt(f?.prenom) || txt(f?.nom) || '';
};

/**
 * Le message proposé, en deux formes.
 *
 * ⚠ LES DEUX DISENT LA MÊME CHOSE, ET C'EST VOLONTAIRE : on envoie par mail à
 * l'un, par SMS à l'autre, et deux textes qui divergeraient feraient parler RGD
 * Renova de deux façons selon le canal.
 *
 * ⚠ IL EST COURT EXPRÈS. Un client qui vient de voir son chantier fini donne
 * trente secondes, pas trois minutes : on remercie, on demande, on donne le
 * lien. Tout paragraphe de plus fait baisser le taux de réponse — et c'est
 * précisément ce qu'on cherche à monter.
 */
export function messageAvis(fiche, lien = lienAvis()) {
  const prenom = prenomDe(fiche);
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const texte = [
    bonjour,
    '',
    'Nous espérons que votre chantier vous donne entière satisfaction.',
    '',
    'Si vous avez été content de notre travail, un avis sur Google nous aiderait '
      + 'beaucoup — cela prend une minute et c’est ce qui permet à d’autres '
      + 'personnes de nous trouver.',
    '',
    lien,
    '',
    'Merci beaucoup,',
    'RGD Renova',
  ].join('\n');

  const e = (t) => String(t ?? '').replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // ⚠ PAS D'EN-TÊTE DE MARQUE ICI : `envoyer-email` enveloppe déjà le contenu.
  // En poser un second donnerait deux logos — le piège déjà rencontré sur la
  // relance des sous-traitants et sur la confirmation de rendez-vous.
  const html = `
    <p>${e(bonjour)}</p>
    <p>Nous espérons que votre chantier vous donne entière satisfaction.</p>
    <p>Si vous avez été content de notre travail, <strong>un avis sur Google</strong>
       nous aiderait beaucoup — cela prend une minute, et c’est ce qui permet à
       d’autres personnes de nous trouver.</p>
    <p style="margin:22px 0;text-align:center">
      <a href="${e(lien)}" style="display:inline-block;padding:13px 26px;border-radius:8px;
         background:#FD7A2D;color:#fff;text-decoration:none;font-weight:600">Laisser un avis</a>
    </p>
    <p>Merci beaucoup,<br><strong>RGD Renova</strong></p>`;

  return { objet: 'Votre avis compte pour nous', texte, html };
}

/**
 * Un texte retouché, rendu en HTML pour l'e-mail.
 *
 * ⚠ TOUT EST ÉCHAPPÉ : ce texte vient d'un champ libre, et il part dans un
 * message HTML. Sans échappement, un client dont le nom porte un chevron
 * casserait la mise en page — et pire, on enverrait du balisage saisi à la main.
 *
 * ⚠ LA LIGNE QUI EST LE LIEN DEVIENT LE BOUTON, et on ne la laisse pas aussi en
 * texte : l'afficher deux fois ferait croire à deux adresses différentes.
 */
export function htmlDepuisTexte(texte, lien) {
  const e = (t) => String(t ?? '').replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bouton = `<p style="margin:22px 0;text-align:center">
      <a href="${e(lien)}" style="display:inline-block;padding:13px 26px;border-radius:8px;
         background:#FD7A2D;color:#fff;text-decoration:none;font-weight:600">Laisser un avis</a>
    </p>`;
  return String(texte).split(/\n{2,}/)
    .map((bloc) => {
      const net = bloc.trim();
      if (!net) return '';
      if (net === txt(lien)) return bouton;
      return `<p>${e(net).replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

/* ------------------------------------------------------------- l'aperçu */

/**
 * L'enveloppe de marque, demandée au serveur UNE fois et gardée en deux moitiés.
 *
 * ⚠ ON NE RECOPIE PAS L'ENVELOPPE DANS LE CRM : le bandeau au logo, le pied
 * orange et les couleurs vivent dans `envoyer-email`. En tenir une seconde
 * version ici, c'est se garantir qu'elles divergeront — et un aperçu qui ne
 * montre plus ce qui part vraiment est pire que pas d'aperçu.
 *
 * ⚠ UN SEUL APPEL RÉSEAU, PAS UN PAR FRAPPE : on demande l'enveloppe avec un
 * corps-sentinelle, on la coupe en deux, et le texte se réinsère entre les deux
 * moitiés localement. L'aperçu suit donc la frappe sans rien demander à
 * personne.
 */
const SENTINELLE = '@@CORPS@@';
let enveloppeEnCache = null;

export async function enveloppeApercu() {
  if (enveloppeEnCache) return enveloppeEnCache;
  if (db.demo) return null;
  const jeton = await db.accessToken();
  if (!jeton) return null;
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/envoyer-email`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apercu: true, to: { email: 'apercu@local' },
        subject: 'Aperçu', html: SENTINELLE,
      }),
    });
    const rep = await r.json().catch(() => ({}));
    const html = String(rep?.html || '');
    const i = html.indexOf(SENTINELLE);
    if (i < 0) return null;
    enveloppeEnCache = { avant: html.slice(0, i), apres: html.slice(i + SENTINELLE.length), de: rep.de || null };
    return enveloppeEnCache;
  } catch { return null; }
}

/* -------------------------------------------------------------- l'envoi */

/**
 * Envoie la demande par e-mail.
 *
 * Même chemin que la confirmation de rendez-vous : l'Edge Function
 * `envoyer-email`, et la réponse du client arrive chez l'entreprise et non chez
 * l'expéditeur technique.
 */
export async function envoyerDemandeAvis(fiche, { email, nom, texte, objet }) {
  const lien = lienAvis();
  if (!lien) return { ok: false, motif: 'aucun lien d’avis n’est réglé' };
  if (!txt(email)) return { ok: false, motif: 'cette fiche n’a pas d’adresse e-mail' };
  if (db.demo) return { ok: false, motif: 'mode démo : aucun message envoyé' };
  const jeton = await db.accessToken();
  if (!jeton) return { ok: false, motif: 'session expirée' };
  const m = messageAvis(fiche, lien);
  // ⚠ ON ENVOIE CE QUI EST À L'ÉCRAN, PAS CE QU'ON AVAIT PROPOSÉ : le texte est
  // modifiable, et repartir de la version d'origine ferait mentir l'aperçu —
  // la personne croirait avoir envoyé ce qu'elle vient de relire.
  if (txt(texte) && txt(texte) !== txt(m.texte)) m.html = htmlDepuisTexte(texte, lien);
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/envoyer-email`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: { email: txt(email), name: txt(nom) || txt(email) },
        // L'objet aussi est modifiable : on envoie celui de l'ecran.
        subject: String(objet || '').trim() || m.objet,
        html: m.html,
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

/* --------------------------------------------------------------- la trace */

/**
 * ⚠ ON GARDE LA TRACE, SINON ON REDEMANDE AU MÊME CLIENT. Trois personnes
 * travaillent la liste des chantiers terminés ; sans marque, le même client
 * reçoit la demande deux fois en une semaine, ce qui produit l'effet inverse de
 * celui qu'on cherche. C'est la même raison que `derniere_relance_pieces` chez
 * les sous-traitants.
 *
 * Elle vit dans l'historique (`events`) et nulle part ailleurs : c'est déjà là
 * que la fiche raconte ce qu'on a fait, et une colonne de plus pour une date
 * qu'on lit une fois ne vaut pas une migration.
 */
export const KIND_AVIS = 'avis_demande';

export const avisDejaDemande = (historique) =>
  (historique || []).find(e => e.kind === KIND_AVIS) || null;
