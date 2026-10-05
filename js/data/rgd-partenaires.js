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
// ⚠ LE JOUR COURANT EST IMPORTÉ, JAMAIS RECALCULÉ : `aujourdhui()` est écrit
// une seule fois dans tout le projet, et il refuse `toISOString()` — celui-ci
// rend de l'UTC, donc une ligne transmise à 23 h serait datée du lendemain.
import { aujourdhui } from './rgd-etapes.js';

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
 *
 * ⚠ ET SES AFFAIRES SORTANTES AVEC, pour la même raison (05/10/2026). La
 * cascade est en base, vérifiée en préproduction ; c'est la démo qui laisserait
 * les lignes derrière elle.
 */
export async function supprimerPartenaire(id) {
  try {
    for (const a of apportsDe(id)) await db.remove('rgd_apports', a.id);
    for (const a of sortantsDe(id)) await db.remove('rgd_apports_sortants', a.id);
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

// ------------------------------------------- ce que RGD apporte à ses partenaires
//
// LE SENS INVERSE DES APPORTS (05/10/2026, demandé par Élodie : « un tableau
// des affaires que RGD aurait pu apporter à ses partenaires »).
//
// ⚠ UNE AUTRE TABLE, PAS UNE COLONNE DE PLUS SUR `rgd_apports`. Celle-là dit
// ce qu'un partenaire PRÉSENTE à RGD : son devis, la commission que RGD lui
// doit. Ici tout est renversé — l'affaire naît chez RGD, et c'est RGD qui
// attend la commission. Les deux sens dans la même table auraient obligé
// chaque total de l'écran à préciser lequel il compte.
//
// ⚠ RIEN N'EST DEVINÉ. Une liste automatique des affaires « qui auraient pu »
// intéresser un partenaire supposerait de savoir ce que chaque client achète :
// au 05/10/2026, `type_demandeur` est renseigné sur 2 fiches sur 194 et un
// budget sur 3. Elle aurait montré une ou deux lignes en ayant l'air complète.
// La ligne se saisit, et l'écran dit ce qui la remplit.

// ⚠ LA LISTE EST LE MIROIR DE LA CONTRAINTE `check` DE LA TABLE, et elle est
// déclarée ICI et pas dans l'écran : le libellé, le ton et l'ordre de lecture
// suivent la valeur. Deux déclarations auraient fini par proposer un état que
// la base refuse.
//
// ⚠ UN SEUL AXE, ET `a_transmettre` EST LA RÉPONSE À LA DEMANDE : une ligne
// qui y reste est exactement une affaire que RGD aurait pu apporter et ne lui
// a pas passée. D'où `rang`, qui la fait remonter en tête de tableau — c'est
// la seule colonne sur laquelle il y a quelque chose à faire.
export const ETATS_SORTANT = {
  a_transmettre: { label: 'À transmettre', ton: 'amber', rang: 0 },
  transmise: { label: 'Transmise', ton: 'accent', rang: 1 },
  gagnee: { label: 'Gagnée', ton: 'green', rang: 2 },
  sans_suite: { label: 'Sans suite', ton: 'muted', rang: 3 },
};

const CHAMPS_SORTANT = ['apporteur_id', 'date_repere', 'client', 'objet',
  'etat', 'transmise_le', 'montant_estime', 'commission', 'notes'];

/** Ce que RGD a repéré pour un partenaire, du plus récent au plus ancien. */
export const sortantsDe = (apporteurId) => db.t('rgd_apports_sortants')
  .filter(a => a.apporteur_id === apporteurId)
  .sort((a, b) => String(b.date_repere || '').localeCompare(String(a.date_repere || '')));

/**
 * L'ordre de lecture de l'écran, tous partenaires confondus.
 *
 * ⚠ CE QUI EST À TRANSMETTRE PASSE DEVANT, puis le plus récent. C'est une
 * liste de gestes à faire avant d'être un historique — ranger par date seule
 * enterrerait une affaire repérée il y a trois semaines sous celles d'hier.
 * Le tri de `sort` est stable, donc l'ordre secondaire tient.
 *
 * ⚠ ELLE PREND SES LIGNES EN ARGUMENT ET NE LIT PAS `db` : l'écran les reçoit
 * de `scope.rgd('rgd_apports_sortants')`, qui applique le miroir de la policy
 * — `db.t()` rendrait le cache entier, donc les affaires de partenaires qu'un
 * chargé d'affaires ne doit pas voir.
 */
export const trierSortants = (lignes) => (lignes || []).slice()
  .sort((a, b) => String(b.date_repere || '').localeCompare(String(a.date_repere || '')))
  .sort((a, b) => (ETATS_SORTANT[a.etat]?.rang ?? 9) - (ETATS_SORTANT[b.etat]?.rang ?? 9));

/**
 * Ce que RGD lui a apporté, et ce qu'il reste à lui passer.
 *
 * ⚠ LES MONTANTS NE PORTENT PAS SUR LA MÊME POPULATION, exactement comme
 * `totauxDe` dans l'autre sens : le montant estimé compte dès qu'il est
 * chiffré, quel que soit l'état ; la commission ne compte QUE sur une affaire
 * `gagnee` — on n'attend pas de commission sur une affaire que le partenaire
 * n'a pas signée, ni sur une affaire qu'on ne lui a même pas passée.
 *
 * ⚠ LE CALCUL PREND DES LIGNES, PAS UN PARTENAIRE, parce que l'écran en fait
 * le total de TOUS les partenaires et la fiche celui d'un seul. Deux additions
 * séparées auraient fini par ne plus compter la même chose, et l'écart ne se
 * serait vu que sur un écran des deux.
 */
export function bilanDesSortants(lignes_) {
  let lignes = 0, aTransmettre = 0, transmis = 0, estime = 0, commission = 0;
  for (const a of (lignes_ || [])) {
    lignes += 1;
    estime += Number(a.montant_estime) || 0;
    if (a.etat === 'a_transmettre') aTransmettre += 1;
    if (a.etat === 'transmise' || a.etat === 'gagnee') transmis += 1;
    if (a.etat === 'gagnee') commission += Number(a.commission) || 0;
  }
  return { lignes, aTransmettre, transmis, estime, commission };
}

/** Le même bilan, pour un partenaire. */
export const bilanSortantsDe = (apporteurId) => bilanDesSortants(sortantsDe(apporteurId));

/**
 * Repérer une affaire pour un partenaire.
 *
 * ⚠ L'ÉTAT EST POSÉ ICI, ET PAS LAISSÉ AU `default` DE LA COLONNE — défaut
 * trouvé à l'essai le 05/10/2026, pas à la relecture. Postgres remplit bien
 * `a_transmettre` tout seul, mais le mode démo n'a aucune valeur par défaut :
 * la ligne y naissait SANS état, le tableau l'affichait « À transmettre » par
 * son repli d'affichage pendant que le bilan, lui, ne la comptait pas. Un
 * écran qui se contredit sur la seule chose qu'on vient y lire.
 *
 * ⚠ `filtrer` passe APRÈS, pour qu'un état explicite l'emporte ; il ne pose que
 * les clés réellement présentes, un appel sans état ne l'écrase donc pas.
 */
export async function creerSortant(champs) {
  if (!champs.apporteur_id) return { ok: false, motif: 'affaire sans partenaire' };
  try {
    const ligne = await db.insert('rgd_apports_sortants', {
      etat: 'a_transmettre',
      ...filtrer(champs, CHAMPS_SORTANT),
    });
    return { ok: true, ligne };
  } catch (e) { return echec(e); }
}

/**
 * Modifier une ligne.
 *
 * ⚠ C'EST ICI QUE SE POSE LA DATE DE TRANSMISSION, pas dans l'écran : deux
 * portes vers la même colonne finiraient par ne plus appliquer la même règle,
 * et l'écran de la fiche n'est déjà pas le seul à écrire cette table.
 *
 * ⚠ ELLE EST SYMÉTRIQUE, comme `date_passage_termine` sur un chantier : posée
 * au premier passage hors de « À transmettre », RETIRÉE si la ligne y revient.
 * La garder ferait une ligne qui dit « pas encore transmise » en portant la
 * date du jour où elle l'a été.
 *
 * ⚠ ET ELLE NE S'ÉCRASE PAS : passer de « Transmise » à « Gagnée » ne redate
 * pas une transmission faite la semaine dernière.
 */
export async function majSortant(id, champs) {
  try {
    const patch = { ...filtrer(champs, CHAMPS_SORTANT), updated_at: new Date().toISOString() };
    if ('etat' in patch && !('transmise_le' in champs)) {
      const avant = db.byId('rgd_apports_sortants', id);
      if (patch.etat === 'a_transmettre') patch.transmise_le = null;
      else if (!avant?.transmise_le) patch.transmise_le = aujourdhui();
    }
    const ligne = await db.update('rgd_apports_sortants', id, patch);
    return { ok: true, ligne };
  } catch (e) { return echec(e); }
}

export async function supprimerSortant(id) {
  try { await db.remove('rgd_apports_sortants', id); return { ok: true }; }
  catch (e) { return echec(e); }
}
