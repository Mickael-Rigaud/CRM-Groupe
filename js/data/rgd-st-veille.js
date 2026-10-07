// Veille hebdomadaire des sous-traitants de RGD Renova (07/10/2026).
//
// Chaque lundi, l'Edge Function `veille-sous-traitants` lit l'annuaire public
// des entreprises et dépose dans `rgd_st_veille` deux artisans par corps de
// métier, à 25 km de Chantilly au plus. L'écran Prospection (`rgd-prospection.js`)
// les suit comme le vivier BTP suit ses profils : contact, suivi, relance.
//
// ⚠ ON NE SUPPRIME JAMAIS UNE TROUVAILLE : c'est sa ligne qui empêche la veille
// de la reproposer la semaine suivante. Écarter = changer son état.
//
// ⚠ « GARDÉ » EST LA SEULE PORTE VERS `rgd_sous_traitants`, et elle passe par
// `creerSousTraitant` — pas par un `db.insert` à côté, qui contournerait la
// liste blanche des champs. Les étapes d'avant restent dans la veille.

import { db } from './db.js';
import { scope } from './scope.js';
import { creerSousTraitant } from './rgd-st.js';

const TABLE = 'rgd_st_veille';

// Le suivi, dans l'ordre du déroulé. `fin` = sorti de la liste de travail.
export const SUIVI_VEILLE = {
  a_valider: { label: 'À valider' },
  a_contacter: { label: 'À contacter' },
  contacte: { label: 'Contacté' },
  interesse: { label: 'Intéressé' },
  retenu: { label: 'Gardé', fin: true },
  ecarte: { label: 'Écarté', fin: true },
};
export const ORDRE_SUIVI = Object.fromEntries(Object.keys(SUIVI_VEILLE).map((k, i) => [k, i]));

/** Les trouvailles qui attendent une décision (le renvoi de Sous-traitants). */
export const trouvaillesAValider = () => db.t(TABLE).filter(t => t.etat === 'a_valider');

const trace = () => ({ traite_par: scope.user?.id || null, traite_le: new Date().toISOString() });
const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });

/** Le dirigeant sans sa qualité : « Marc BOSQUET (Gérant) » → « Marc BOSQUET ». */
export const nomDirigeant = (d) => String(d || '').replace(/\s*\(.*\)\s*$/, '').trim();

async function garder(t) {
  const profil = [t.effectif, t.date_creation ? `créée en ${t.date_creation.slice(0, 4)}` : '',
    t.est_rge ? 'RGE' : ''].filter(Boolean).join(' · ');
  const r = await creerSousTraitant({
    raison_sociale: t.raison_sociale,
    contact_nom: nomDirigeant(t.dirigeant) || null,
    telephone: t.telephone || null,
    email: t.email || null,
    siret: t.siret,
    specialites: t.corps_metier,
    adresse: t.adresse || null,
    notes: `Trouvé par la veille (${t.lot}) — ${profil || 'profil inconnu'}, à ${String(t.distance_km).replace('.', ',')} km de Chantilly.`,
    statut_relation: 'potentiel',
  });
  if (!r.ok) return r;
  try {
    await db.update(TABLE, t.id, { etat: 'retenu', sous_traitant_id: r.donnees?.id || null, ...trace() });
  } catch (e) {
    // L'artisan est créé : la trouvaille gardera simplement son ancien suivi.
    return { ok: true, donnees: r.donnees, avertissement: String(e.message || e).slice(0, 120) };
  }
  return r;
}

/** Changer le suivi. « Gardé » crée l'artisan dans Sous-traitants. */
export async function changerSuivi(t, etat) {
  if (!SUIVI_VEILLE[etat]) return { ok: false, motif: 'suivi inconnu' };
  if (t.etat === 'retenu') return { ok: false, motif: 'déjà gardé — il se suit désormais dans Sous-traitants' };
  if (etat === 'retenu') return garder(t);
  try {
    const fin = SUIVI_VEILLE[etat].fin;
    return { ok: true, donnees: await db.update(TABLE, t.id,
      { etat, ...(fin ? trace() : { traite_par: null, traite_le: null }) }) };
  } catch (e) { return echec(e); }
}

// Ce que l'écran peut écrire sur une trouvaille, et rien d'autre.
const CHAMPS = ['telephone', 'email', 'prochaine_relance'];

export async function majTrouvaille(t, champs) {
  const out = {};
  for (const k of CHAMPS) if (k in champs) out[k] = String(champs[k] ?? '').trim() || null;
  try { return { ok: true, donnees: await db.update(TABLE, t.id, out) }; }
  catch (e) { return echec(e); }
}
