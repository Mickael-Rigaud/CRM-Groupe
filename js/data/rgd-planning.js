// Planning des chantiers de RGD Renova (10/11/2026, demandé par Élodie)
//
// Un chantier planifié : une date de début, une durée en jours CALENDAIRES
// (week-end compris — son choix), un rattachement à une fiche client ou à une
// demande, et deux listes cochables, matériaux et outils.
//
// ⚠ TABLES À PART (`rgd_planning`, `rgd_planning_lignes`), PAS `rgd_chantiers` :
// celle-ci est écrite par la synchronisation Costructor et porte aussi les
// visites techniques. Deux écrivains sur les mêmes dates s'effacent l'un
// l'autre (voir la migration 20261110 du dépôt Backend).
//
// ⚠ LES CHANTIERS PEUVENT SE SUPERPOSER, et c'est demandé : rien ici ne refuse
// deux chantiers sur les mêmes jours. Le calendrier les empile.
//
// ⚠ LES LISTES STANDARD SONT UN MODÈLE, PAS UN LIEN. Ajouter les matériaux
// standard à un chantier RECOPIE les lignes : on les coche, on les retouche,
// on en retire, sans toucher au modèle ni aux autres chantiers. Le modèle vit
// dans `rgd_reglages`, clé `planning_listes_standard`, et se modifie depuis
// l'écran.
import { db } from './db.js';
import { scope } from './scope.js';

export const LISTES = {
  materiaux: { label: 'Matériaux', court: 'matériau' },
  outils: { label: 'Outils', court: 'outil' },
};

// Un premier modèle, pour ne pas partir d'une page blanche. Élodie le modifie
// depuis l'écran ; dès qu'il est enregistré, c'est le sien qui fait foi.
const STANDARD_DE_DEPART = {
  materiaux: ['Câble électrique', 'Gaines', 'Boîtes d’encastrement', 'Plaques de plâtre',
    'Rails et montants', 'Enduit', 'Bandes à joint', 'Vis', 'Chevilles', 'Mastic / silicone',
    'Peinture', 'Bâche de protection', 'Sacs à gravats'],
  outils: ['Perceuse-visseuse', 'Perforateur', 'Scie sauteuse', 'Meuleuse', 'Niveau laser',
    'Mètre', 'Escabeau', 'Aspirateur de chantier', 'Rallonges', 'Projecteur',
    'Testeur de tension', 'Caisse à outils', 'EPI (gants, lunettes, casque)'],
};

const CLE_STANDARD = 'planning_listes_standard';

export function listesStandard() {
  const l = db.t('rgd_reglages').find(x => x.cle === CLE_STANDARD);
  try {
    const v = l ? JSON.parse(l.valeur) : null;
    if (v && Array.isArray(v.materiaux) && Array.isArray(v.outils)) return v;
  } catch { /* réglage illisible : on repart du modèle de départ */ }
  return { materiaux: [...STANDARD_DE_DEPART.materiaux], outils: [...STANDARD_DE_DEPART.outils] };
}

export async function enregistrerStandard(listes) {
  const valeur = JSON.stringify({
    materiaux: listes.materiaux.map(s => String(s).trim()).filter(Boolean),
    outils: listes.outils.map(s => String(s).trim()).filter(Boolean),
  });
  const existe = db.t('rgd_reglages').some(x => x.cle === CLE_STANDARD);
  return existe
    ? db.update('rgd_reglages', CLE_STANDARD, { valeur })
    : db.insert('rgd_reglages', { cle: CLE_STANDARD, valeur });
}

// ------------------------------------------------------------ les dates
// Les dates sont des chaînes « AAAA-MM-JJ » lues en heure LOCALE : passer par
// `toISOString()` rendrait de l'UTC, et un chantier posé tard le soir
// glisserait au lendemain.
export const versDate = (iso) => {
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, j);
};
export const versIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const ajouterJours = (iso, n) => {
  const d = versDate(iso);
  d.setDate(d.getDate() + n);
  return versIso(d);
};
// Le dernier jour du chantier : un chantier d'un jour finit le jour où il commence.
export const finDe = (c) => ajouterJours(c.date_debut, Math.max(1, Number(c.duree_jours) || 1) - 1);

// ⚠ LA DURÉE SE SAISIT EN JOURS, SEMAINES OU MOIS (10/11/2026, Élodie), et
// on garde la saisie (`duree_nombre`, `duree_unite`) pour la réafficher telle
// quelle. Le calendrier, lui, ne lit que `duree_jours`, calculé ici :
//   · une semaine = 7 jours calendaires ;
//   · un mois va jusqu'à la VEILLE du même quantième le mois suivant
//     (2 mois à partir du 15 janvier : jusqu'au 14 mars). Un mois qui n'a pas
//     ce quantième (31 → février) s'arrête au dernier jour du mois.
export const UNITES = {
  jours: { un: 'jour', plusieurs: 'jours', max: 366 },
  semaines: { un: 'semaine', plusieurs: 'semaines', max: 52 },
  mois: { un: 'mois', plusieurs: 'mois', max: 12 },
};
export function joursPour(debut, nombre, unite) {
  const n = Math.max(1, parseInt(nombre, 10) || 1);
  if (unite === 'semaines') return n * 7;
  if (unite === 'mois') {
    const d = versDate(debut);
    const cible = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const dernierDuMois = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
    // Pas de 31 en février : le chantier va jusqu'au dernier jour du mois,
    // compris (d'où le +1 : sans lui il s'arrêterait l'avant-veille).
    const rogne = d.getDate() > dernierDuMois;
    cible.setDate(Math.min(d.getDate(), dernierDuMois));
    return Math.round((cible - d) / 86400000) + (rogne ? 1 : 0);
  }
  return n;
}
// La durée telle qu'on l'a saisie ; les chantiers d'avant le 10/11 n'ont que
// des jours.
export const dureeLue = (c) => {
  const unite = UNITES[c.duree_unite] ? c.duree_unite : 'jours';
  const nombre = c.duree_nombre || (unite === 'jours' ? c.duree_jours : 1) || 1;
  return { nombre, unite, texte: `${nombre} ${nombre > 1 ? UNITES[unite].plusieurs : UNITES[unite].un}` };
};

export const chantiersPlanifies = () => (scope.isDirection ? db.t('rgd_planning') : [])
  .slice().sort((a, b) => String(a.date_debut).localeCompare(String(b.date_debut))
    || String(a.created_at).localeCompare(String(b.created_at)));

export const lignesDe = (id, liste) => db.t('rgd_planning_lignes')
  .filter(l => l.planning_id === id && (!liste || l.liste === liste))
  .sort((a, b) => (a.ordre - b.ordre) || String(a.created_at).localeCompare(String(b.created_at)));

// Ce qui reste à trouver : ni en stock, ni acheté.
export const resteA = (id) => lignesDe(id).filter(l => !l.deja_la && !l.achete).length;

// ------------------------------------------------------------ écritures
const propre = (champs) => {
  const unite = UNITES[champs.duree_unite] ? champs.duree_unite : 'jours';
  const nombre = Math.max(1, Math.min(UNITES[unite].max, parseInt(champs.duree_nombre, 10) || 1));
  return {
  titre: String(champs.titre || '').trim(),
  date_debut: champs.date_debut,
  duree_nombre: nombre,
  duree_unite: unite,
  duree_jours: champs.date_debut ? Math.min(366, joursPour(champs.date_debut, nombre, unite)) : nombre,
  fiche_id: champs.fiche_id || null,
  demande_id: champs.demande_id || null,
  adresse: String(champs.adresse || '').trim() || null,
  couleur: champs.couleur || null,
  notes: String(champs.notes || '').trim() || null,
  };
};

export async function creerChantier(champs) {
  const ligne = propre(champs);
  if (!ligne.titre) throw new Error('Donnez un nom au chantier.');
  if (!ligne.date_debut) throw new Error('La date de début manque.');
  return db.insert('rgd_planning', ligne);
}

export async function majChantier(id, champs) {
  const ligne = propre(champs);
  if (!ligne.titre) throw new Error('Donnez un nom au chantier.');
  if (!ligne.date_debut) throw new Error('La date de début manque.');
  return db.update('rgd_planning', id, ligne);
}

// Les lignes partent avec le chantier (`on delete cascade` en base) ; en
// démo il n'y a pas de cascade, on les retire à la main.
export async function supprimerChantier(id) {
  if (db.demo) for (const l of lignesDe(id)) await db.remove('rgd_planning_lignes', l.id);
  await db.remove('rgd_planning', id);
}

const ordreSuivant = (id, liste) => lignesDe(id, liste).reduce((m, l) => Math.max(m, l.ordre || 0), 0) + 1;

export async function ajouterLigne(id, liste, libelle) {
  const texte = String(libelle || '').trim();
  if (!texte) return null;
  return db.insert('rgd_planning_lignes', {
    planning_id: id, liste, libelle: texte, ordre: ordreSuivant(id, liste),
  });
}

// Recopie le modèle dans le chantier, sans doublon de libellé : cliquer deux
// fois n'ajoute pas deux fois la même perceuse.
export async function ajouterStandard(id, liste) {
  const deja = new Set(lignesDe(id, liste).map(l => l.libelle.trim().toLowerCase()));
  let ordre = ordreSuivant(id, liste);
  let n = 0;
  for (const libelle of listesStandard()[liste]) {
    if (deja.has(libelle.trim().toLowerCase())) continue;
    await db.insert('rgd_planning_lignes', { planning_id: id, liste, libelle, ordre: ordre++ });
    n++;
  }
  return n;
}

export const majLigne = (id, patch) => db.update('rgd_planning_lignes', id, patch);
export const retirerLigne = (id) => db.remove('rgd_planning_lignes', id);
