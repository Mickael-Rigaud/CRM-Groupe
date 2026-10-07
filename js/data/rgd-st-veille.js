// Veille hebdomadaire des sous-traitants de RGD Renova (07/10/2026).
//
// Chaque lundi, l'Edge Function `veille-sous-traitants` lit l'annuaire public
// des entreprises et dépose dans `rgd_st_veille` deux artisans par corps de
// métier, à 25 km de Chantilly au plus. Ce module porte les deux gestes de
// l'écran : GARDER (l'artisan rejoint « En prospection ») et ÉCARTER.
//
// ⚠ ON NE SUPPRIME JAMAIS UNE TROUVAILLE : c'est sa ligne qui empêche la veille
// de la reproposer la semaine suivante. Écarter = changer son état.
//
// ⚠ GARDER PASSE PAR `creerSousTraitant`, la porte de l'écran — pas par un
// `db.insert` à côté, qui contournerait la liste blanche des champs.

import { db } from './db.js';
import { scope } from './scope.js';
import { creerSousTraitant } from './rgd-st.js';

const TABLE = 'rgd_st_veille';

/** Les trouvailles qui attendent une décision, les meilleures d'abord. */
export const trouvaillesAValider = () => db.t(TABLE)
  .filter(t => t.etat === 'a_valider')
  .sort((a, b) => String(a.corps_metier).localeCompare(String(b.corps_metier), 'fr')
    || (b.score || 0) - (a.score || 0));

const trace = () => ({ traite_par: scope.user?.id || null, traite_le: new Date().toISOString() });

/** Le dirigeant sans sa qualité : « Marc BOSQUET (Gérant) » → « Marc BOSQUET ». */
const nomDirigeant = (d) => String(d || '').replace(/\s*\(.*\)\s*$/, '').trim();

export async function garderTrouvaille(t) {
  const profil = [t.effectif, t.date_creation ? `créée en ${t.date_creation.slice(0, 4)}` : '',
    t.est_rge ? 'RGE' : ''].filter(Boolean).join(' · ');
  const r = await creerSousTraitant({
    raison_sociale: t.raison_sociale,
    contact_nom: nomDirigeant(t.dirigeant) || null,
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
    // L'artisan est créé : on le dit, la trouvaille restera simplement à valider.
    return { ok: true, donnees: r.donnees, avertissement: String(e.message || e).slice(0, 120) };
  }
  return r;
}

export async function ecarterTrouvaille(t) {
  try {
    return { ok: true, donnees: await db.update(TABLE, t.id, { etat: 'ecarte', ...trace() }) };
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 160) }; }
}

/** Revenir sur un « Écarter » donné trop vite : la trouvaille repasse à valider. */
export async function reprendreTrouvaille(t) {
  try {
    return { ok: true, donnees: await db.update(TABLE, t.id, { etat: 'a_valider', traite_par: null, traite_le: null }) };
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 160) }; }
}
