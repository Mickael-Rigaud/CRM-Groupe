// Les partenaires de RGD Renova et leurs apports — écrits dans le CRM
//
// SUPABASE EST LA SOURCE DES PARTENAIRES DEPUIS LE 22/09/2026 : le worker a
// cessé ce jour-là d'envoyer la charge `apporteurs`, et l'écran écrit en direct.
//
// ⚠ LA PORTE SQL, ELLE, EST RESTÉE OUVERTE JUSQU'AU 25/09.
// `push_rgd_partenaires` gardait son `insert … on conflict do update` sur
// `rgd_apporteurs`. Personne ne la franchissait — vérifié des deux côtés,
// aucune donnée perdue — mais un ancien worker redéployé aurait suffi à
// ressusciter l'écrasement, et `type_partenaire` comme `actif` seraient
// revenus à la version de l'autre côté sans erreur et sans un mot. Fermée par
// la migration `rgd_apports_et_partenaires_supabase`, qui fait ignorer les
// charges `apporteurs` et `apporteurs_extra` et COMPTE ce qu'elle jette.
//
// ⚠ CE QUI CONTINUE D'ARRIVER : `rgd_clients.apporteur_id`, le lien entre un
// prospect et son apporteur. Il se pose dans l'application RGD et le CRM ne
// l'écrit pas — d'où une fiche créée ici, sans `d1_id`, à laquelle aucun
// prospect ne peut être rattaché pour l'instant. Ses apports se saisissent dans
// le tableau, qui ne dépend d'aucun identifiant de l'autre côté.
import { db } from './db.js';

const TABLE = 'rgd_apporteurs';

// ⚠ UNE LISTE BLANCHE, pas un `...champs`. Ce qui passait par le worker était
// filtré par SA liste ; en écriture directe, un nom inconnu ferait échouer la
// requête entière — ou pire, écraserait une colonne du reflet qu'on ne voulait
// pas toucher. `d1_id`, `source` et `apports_declares` n'y sont volontairement
// pas : les deux premiers viennent de l'autre côté, le troisième est un compte
// saisi à la main que le tableau des apports remplace.
const CHAMPS = ['nom', 'prenom', 'societe', 'raison_sociale', 'profession',
  'email', 'telephone', 'adresse', 'code_postal', 'ville',
  'type_partenaire', 'actif', 'partenariat_signe', 'date_signature', 'notes'];

// ⚠ `apporte_par` N'EST PAS UN SECOND APPORTEUR : c'est un nom dans l'équipe du
// partenaire, en texte libre. L'apport reste rattaché au PARTENAIRE, donc ses
// totaux et sa place dans les sections ne bougent pas — créer une fiche par
// collaborateur aurait éclaté un cabinet de cinq personnes en cinq partenaires,
// avec des commissions qu'il aurait fallu ré-additionner à la main.
const CHAMPS_APPORT = ['apporteur_id', 'apporte_par', 'date_apport', 'client',
  'issue', 'montant_devis', 'montant_commission', 'notes'];

const filtrer = (champs, liste) => {
  const out = {};
  for (const k of liste) if (k in champs) out[k] = champs[k];
  return out;
};

const echec = (e) => ({ ok: false, motif: String(e.message || e).slice(0, 160) });

// ---------------------------------------------------------------- partenaires

/** Créer une fiche. Elle apparaît tout de suite : plus rien à attendre. */
export async function creerPartenaire(champs) {
  if (!String(champs.nom || '').trim() && !String(champs.societe || '').trim()) {
    return { ok: false, motif: 'un nom ou une société, au moins' };
  }
  try {
    const ligne = await db.insert(TABLE, {
      ...filtrer(champs, CHAMPS),
      type_partenaire: champs.type_partenaire || 'apporteur',
      actif: champs.actif !== false,
      source: 'crm',
    });
    return { ok: true, ligne };
  } catch (e) { return echec(e); }
}

/** Modifier une fiche, désignée par son uuid — jamais par `d1_id`. */
export async function majPartenaire(id, champs) {
  try {
    const ligne = await db.update(TABLE, id, filtrer(champs, CHAMPS));
    return { ok: true, ligne };
  } catch (e) { return echec(e); }
}

/**
 * Activer ou désactiver un apporteur.
 *
 * ⚠ C'EST UN GESTE À PART, pas une case du formulaire. Le formulaire sert à
 * corriger des coordonnées ; changer l'activité d'un partenaire le fait passer
 * d'une section à l'autre, ce qui se décide en le voyant dans sa liste. Deux
 * chemins vers le même changement finissent par diverger — c'est la règle déjà
 * posée pour « Convertir en actif » chez les sous-traitants.
 */
export const basculerActif = (id, actif) => majPartenaire(id, { actif: !!actif });

/**
 * Supprimer une fiche.
 *
 * ⚠ ELLE EMPORTE SES APPORTS, et c'est explicite plutôt que laissé au
 * `on delete cascade` : la base l'a bien, mais le mode démo n'a aucune cascade
 * — une fiche partait et ses apports restaient, rattachés à personne.
 */
export async function supprimerPartenaire(id) {
  try {
    for (const a of apportsDe(id)) await db.remove('rgd_apports', a.id);
    await db.remove(TABLE, id);
    return { ok: true };
  } catch (e) { return echec(e); }
}

// -------------------------------------------------------------------- apports

/**
 * Les noms déjà employés dans l'équipe d'un partenaire, pour ne pas les
 * réécrire à chaque ligne. Rendus triés et sans doublon.
 */
export const equipeDe = (apporteurId) => [...new Set(
  apportsDe(apporteurId).map(a => String(a.apporte_par || '').trim()).filter(Boolean),
)].sort((a, b) => a.localeCompare(b, 'fr'));

/** Les apports d'un partenaire, du plus récent au plus ancien. */
export const apportsDe = (apporteurId) => db.t('rgd_apports')
  .filter(a => a.apporteur_id === apporteurId)
  .sort((a, b) => String(b.date_apport || '').localeCompare(String(a.date_apport || '')));

/**
 * Ce qu'un partenaire a rapporté : devis présentés et commissions.
 *
 * ⚠ LES DEUX TOTAUX NE PORTENT PAS SUR LA MÊME POPULATION, et les confondre
 * donnerait un taux de commission absurde. Le devis compte dès qu'il est
 * chiffré, quelle que soit l'issue ; la commission ne compte QUE sur les
 * affaires GAGNÉES — on ne commissionne pas une affaire perdue. La colonne du
 * tableau dit donc deux choses différentes, et c'est voulu.
 */
export function totauxDe(apporteurId) {
  let devis = 0, commission = 0, gagnes = 0, apports = 0;
  for (const a of apportsDe(apporteurId)) {
    apports += 1;
    devis += Number(a.montant_devis) || 0;
    if (a.issue === 'gagne') {
      gagnes += 1;
      commission += Number(a.montant_commission) || 0;
    }
  }
  return { devis, commission, gagnes, apports };
}

export async function creerApport(champs) {
  if (!champs.apporteur_id) return { ok: false, motif: 'apport sans partenaire' };
  try {
    const ligne = await db.insert('rgd_apports', filtrer(champs, CHAMPS_APPORT));
    return { ok: true, ligne };
  } catch (e) { return echec(e); }
}

export async function majApport(id, champs) {
  try {
    const ligne = await db.update('rgd_apports', id, {
      ...filtrer(champs, CHAMPS_APPORT),
      updated_at: new Date().toISOString(),
    });
    return { ok: true, ligne };
  } catch (e) { return echec(e); }
}

export async function supprimerApport(id) {
  try { await db.remove('rgd_apports', id); return { ok: true }; }
  catch (e) { return echec(e); }
}
