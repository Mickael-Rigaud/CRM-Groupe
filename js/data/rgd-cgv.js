// Les conditions générales de vente de RGD Renova (11/11/2026, Élodie)
//
// Elles s'écrivent dans le CRM et s'impriment en dernière page des devis et
// factures faits dans le CRM (dépannage électrique, « Cotation dépannage
// électrique »).
//
// ⚠ ELLES NE PARTENT PAS TOUTES SEULES DANS COSTRUCTOR, ET CE N'EST PAS UN
// OUBLI. Élodie voulait une mise à jour simultanée des deux plateformes ;
// l'API publique de Costructor (costructor.readme.io, lue le 11/11/2026)
// n'expose AUCUN réglage d'entreprise — contacts, demandes, projets, produits,
// devis, factures, paiements, rien d'autre. Choix retenu (sur trois) : le CRM
// fait foi, et l'écran donne un bouton « Copier pour Costructor » qui copie le
// texte et ouvre Costructor, où on le colle dans Réglages > CGV. Le jour où
// l'API l'expose, c'est ici que l'écriture se branche.
//
// Rangées dans `rgd_reglages` (clé `cgv`), en JSON : le texte, la date et
// l'auteur de la dernière modification. Écriture direction seule (policy
// `rgd_reglages_maj`), lecture par toute l'équipe RGD — Franck imprime aussi
// ses factures.
import { db } from './db.js';
import { scope } from './scope.js';

const CLE = 'cgv';

export function lireCgv() {
  const l = db.t('rgd_reglages').find(x => x.cle === CLE);
  if (!l?.valeur) return { texte: '', maj_le: null, maj_par: null };
  try {
    const v = JSON.parse(l.valeur);
    return { texte: String(v.texte || ''), maj_le: v.maj_le || null, maj_par: v.maj_par || null };
  } catch {
    return { texte: String(l.valeur), maj_le: null, maj_par: null };
  }
}

export async function enregistrerCgv(texte) {
  const valeur = JSON.stringify({
    texte: String(texte || '').replace(/\r\n/g, '\n').trim(),
    maj_le: new Date().toISOString(),
    maj_par: scope.user?.full_name || scope.user?.email || null,
  });
  const existe = db.t('rgd_reglages').some(x => x.cle === CLE);
  return existe
    ? db.update('rgd_reglages', CLE, { valeur })
    : db.insert('rgd_reglages', { cle: CLE, valeur });
}

// Le texte découpé pour l'impression : une ligne vide sépare deux
// paragraphes, une ligne qui commence par « Article », un numéro (« 1. »,
// « 2) ») ou qui est écrite en MAJUSCULES devient un intertitre.
export function cgvEnBlocs(texte) {
  return String(texte || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
    const [premiere, ...reste] = p.split('\n');
    const titre = /^(article\s+\d+|\d+[.)]\s|[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ0-9 '’.,:-]{4,}$)/i.test(premiere.trim())
      && premiere.trim().length <= 90
      && (/^(article|\d)/i.test(premiere.trim()) || premiere.trim() === premiere.trim().toUpperCase());
    return titre ? { titre: premiere.trim(), texte: reste.join('\n').trim() } : { titre: '', texte: p };
  });
}

// Où l'on colle les CGV dans Costructor (aide en ligne de Costructor,
// « Insérer mes CGV » : Réglages > CGV > Devis et/ou Factures > « Rédiger les
// conditions ci-dessous »).
export const COSTRUCTOR_APP = 'https://app.costructor.co';
