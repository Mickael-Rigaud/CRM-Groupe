// Le rapport de visite de BTP Expertise : ce que le document ajoute au relevé,
// et la façon dont il en tire ses désordres.
//
// ⚠ LES DÉSORDRES NE SONT PAS STOCKÉS ICI, ILS SONT CALCULÉS. La pièce, le
// constat, la fiche, la couleur et les photos vivent dans le relevé : le
// rapport les LIT. Les recopier donnerait deux vérités, et c'est le document
// signé qui finirait par mentir — on corrige un constat le soir de la visite,
// et le rapport doit suivre, pas rester sur la version du matin.
//
// Ce qui est stocké, à côté, est ce que la check-list ne pouvait pas savoir :
// la priorité, la préconisation, la reformulation pour le client, et le choix
// de la fiche quand le point en propose plusieurs.
//
// ⚠ UNE LIGNE N'EST CRÉÉE QUE QUAND ON ÉCRIT DEDANS. Ouvrir un rapport
// n'insère rien pour les douze anomalies déjà relevées : elles s'affichent
// parce qu'elles sont dans le relevé. Créer les lignes d'avance obligerait à
// les resynchroniser à chaque anomalie ajoutée après coup — et c'est
// exactement le genre de synchronisation qui se met à dériver en silence.
import { db } from './db.js';
import { scope } from './scope.js';
import { zones, pointsDe, reponsesDe, releves } from './btp-releve.js';

// ⚠ TROIS PRIORITÉS, ET CE SONT LES TROIS COULEURS DE L'ATLAS. Le modèle
// papier dit « 🔴 Haute · 🟠 Moyenne · 🟢 Basse » et l'atlas classe déjà chaque
// pathologie en rouge, orange ou vert : ce sont deux noms pour une seule
// échelle, et les tenir pour distinctes obligerait à ressaisir une gravité déjà
// tranchée.
export const PRIORITES = {
  haute:   { mot: 'Haute',   couleur: 'rouge',  faire: 'Sécuriser sans attendre' },
  moyenne: { mot: 'Moyenne', couleur: 'orange', faire: 'Investiguer la cause' },
  basse:   { mot: 'Basse',   couleur: 'vert',   faire: 'Surveiller et entretenir' },
};

export const ORDRE_PRIORITES = ['haute', 'moyenne', 'basse'];

const DE_LA_COULEUR = { rouge: 'haute', orange: 'moyenne', vert: 'basse' };

// ⚠ AUCUNE PRIORITÉ PAR DÉFAUT QUAND RIEN NE PERMET DE TRANCHER. Un désordre
// sans fiche identifiée ne reçoit pas « moyenne » en silence : il reste sans
// priorité, l'écran le montre et le range à part dans les préconisations. Une
// valeur inventée serait indiscernable d'une valeur choisie.
export const prioriteDeCouleur = (code) => DE_LA_COULEUR[code] || null;

// ------------------------------------------------------------ les rapports

export const rapports = () => scope.canBtp ? db.t('btp_rapports') : [];

export const rapportDe = (releveId) =>
  rapports().find(r => r.releve_id === releveId) || null;

export const lignesDe = (rapportId) => rapportId
  ? db.t('btp_rapport_lignes').filter(l => l.rapport_id === rapportId)
  : [];

// Le texte que le cabinet propose pour l'objet de la visite. ⚠ C'EST UN
// BROUILLON, PAS UNE FORMULE OFFICIELLE : il est là pour que la section ne
// reste pas vide, et Mickael le remplacera par la formulation du cabinet —
// c'est elle qui engage, et elle ne s'invente pas ici.
export const OBJET_PROPOSE =
  "Visite sur site à la demande du maître d'ouvrage, en vue de constater les "
  + "désordres apparents et d'en proposer une interprétation. Les constats sont "
  + "faits à vue, sans sondage, démontage ni essai. Ils portent sur ce qui était "
  + "accessible le jour de la visite.";

// ⚠ LES LIMITES SE PROPOSENT DEPUIS LES POINTS « NON VÉRIFIABLE », et c'est la
// pièce la plus utile du raccordement. Sur place on note « pas pu monter sur le
// toit » ; trois jours plus tard, au moment de rédiger, c'est précisément ce
// qu'on oublie d'écrire — et c'est la section qui protège le cabinet. Dire
// « conforme » de ce qu'on n'a pas regardé est la faute qui engage.
export function limitesProposees(releveId) {
  const nv = detailReponses(releveId).filter(d => d.reponse.etat === 'nv');
  if (!nv.length) return '';
  const par = new Map();
  for (const d of nv) {
    if (!par.has(d.piece)) par.set(d.piece, []);
    par.get(d.piece).push(d.libelle + (d.reponse.note ? ` (${d.reponse.note})` : ''));
  }
  return "N'ont pas pu être vérifiés le jour de la visite :\n"
    + [...par].map(([piece, l]) => `— ${piece} : ${l.join(' ; ')}.`).join('\n');
}

export async function creerRapport(releveId) {
  const rel = db.byId('btp_releves', releveId);
  const info = rel ? informations(rel) : {};
  return db.insert('btp_rapports', {
    releve_id: releveId,
    objet: OBJET_PROPOSE,
    limites: limitesProposees(releveId),
    // La ville du bien, parce qu'un rapport se signe à l'endroit d'où on
    // l'envoie et que c'est presque toujours le cabinet — mais la ville du
    // chantier est un meilleur point de départ que le vide.
    lieu_signature: info.ville || '',
    date_signature: new Date().toISOString().slice(0, 10),
    statut: 'brouillon',
  });
}

export const majRapport = (id, champs) => db.update('btp_rapports', id, champs);

// ⚠ INSÉRER OU METTRE À JOUR, sur la paire (rapport, réponse) : on repasse sur
// un désordre pour compléter sa préconisation, et deux lignes pour un même
// constat donneraient deux préconisations contradictoires dans le document.
export async function ecrireLigne(rapportId, reponseId, champs) {
  const deja = db.t('btp_rapport_lignes')
    .find(l => l.rapport_id === rapportId && l.reponse_id === reponseId);
  if (deja) return db.update('btp_rapport_lignes', deja.id, champs);
  return db.insert('btp_rapport_lignes',
                   { rapport_id: rapportId, reponse_id: reponseId, ...champs });
}

// Une ligne qui ne vient d'aucun point : on voit sur place des choses que la
// check-list ne demande pas.
export async function ajouterLigneLibre(rapportId, champs) {
  const rangs = lignesDe(rapportId).map(l => l.rang || 0);
  return db.insert('btp_rapport_lignes', {
    rapport_id: rapportId, reponse_id: null,
    rang: (rangs.length ? Math.max(...rangs) : 0) + 1,
    retenu: true, ...champs,
  });
}

export const retirerLigne = (id) => db.remove('btp_rapport_lignes', id);

// ------------------------------------------------------- ce que dit l'affaire

// ⚠ LES INFORMATIONS SONT DÉDUITES, PAS SAISIES. L'adresse du bien est dans la
// fiche projet, le maître d'ouvrage est son contact, l'intervenant est l'auteur
// du relevé, la date est celle de la visite : les redemander serait demander
// quatre fois ce que le CRM sait déjà — et créer quatre occasions de
// divergence. Le rapport ne stocke que les CORRECTIONS.
export function informations(releve) {
  const deal = db.byId('deals', releve.deal_id) || {};
  const f = deal.fields || {};
  const contact = deal.contact_id ? db.byId('contacts', deal.contact_id) : null;
  const auteur = releve.auteur_id ? db.byId('profiles', releve.auteur_id) : null;
  const proprio = deal.owner_id ? db.byId('profiles', deal.owner_id) : null;

  const bien = [f.adresse, [f.code_postal, f.ville].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const nom = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
    : '';

  return {
    dealId: deal.id, titre: deal.title || '',
    bien, ville: f.ville || '',
    typeBien: f.type_bien || '', annee: f.annee || '', surface: f.surface || '',
    mission: f.type_mission || '',
    maitreOuvrage: nom,
    telephone: contact?.phone || '', email: contact?.email || '',
    adresseClient: f.adresse_client || [contact?.address, contact?.postal_code, contact?.city]
      .filter(Boolean).join(', '),
    intervenant: (auteur || proprio)?.full_name || '',
    dateVisite: releve.date_visite || '',
  };
}

// Ce que le document affiche vraiment : la déduction, sauf si l'expert a
// corrigé.
//
// ⚠ VIDER LE CHAMP REPREND LA FICHE PROJET, ce n'est pas « effacer
// l'information ». La règle inverse (vide = correction volontaire) laisserait
// une seule façon de revenir à la déduction : un bouton de plus à découvrir, et
// un rapport à en-tête vide le jour où on a effacé pour retaper. Taire une
// information sur le document se fait donc en écrivant un tiret, pas en
// laissant blanc — c'est plus explicite, et ça se voit à la relecture.
const retenu = (surcharge, deduit) =>
  String(surcharge ?? '').trim() ? surcharge : deduit;

export function enTete(releve, rapport) {
  const i = informations(releve);
  return {
    ...i,
    bien: retenu(rapport?.bien, i.bien),
    maitreOuvrage: retenu(rapport?.maitre_ouvrage, i.maitreOuvrage),
    intervenant: retenu(rapport?.intervenant, i.intervenant),
  };
}

// --------------------------------------------------------- les désordres

// Toutes les réponses d'un relevé, remises dans l'ordre de la visite et
// accompagnées de ce que le référentiel en dit. Sert aux limites (les « N.V. »)
// comme aux désordres (les anomalies).
function detailReponses(releveId) {
  const rep = reponsesDe(releveId);
  if (!rep.length) return [];
  const out = [];
  for (const z of zones()) {
    for (const p of pointsDe(z.rang)) {
      const r = rep.find(x => x.point_id === p.id);
      if (r) out.push({ reponse: r, point: p, piece: z.titre, libelle: p.libelle });
    }
  }
  // ⚠ UNE RÉPONSE DONT LE POINT A DISPARU DU RÉFÉRENTIEL NE S'ÉVAPORE PAS : le
  // référentiel peut être réimporté, le constat d'un expert reste. Elle est
  // remise à la fin plutôt que perdue dans la boucle des zones.
  for (const r of rep) {
    if (!out.some(d => d.reponse.id === r.id)) {
      out.push({ reponse: r, point: null, piece: '—',
                 libelle: `Point ${r.point_id} (retiré du référentiel)` });
    }
  }
  return out;
}

const fiche = (n) => db.t('btp_atlas_fiches').find(f => f.numero === n) || null;

// Le tableau des désordres, tel que le document l'affiche. ⚠ IL EST CALCULÉ À
// CHAQUE RENDU : rien à synchroniser, jamais.
//
// L'ordre est celui de la VISITE, pas celui de la gravité — la colonne « N° »
// du modèle papier suit le parcours. Les préconisations, elles, se regroupent
// par priorité : ce sont deux lectures du même matériau, et c'est voulu.
export function desordres(releveId, rapport) {
  const lignes = lignesDe(rapport?.id);
  const out = [];

  for (const d of detailReponses(releveId)) {
    if (d.reponse.etat !== 'anomalie') continue;
    const ligne = lignes.find(l => l.reponse_id === d.reponse.id) || null;
    const candidates = d.point?.fiches || [];
    // La fiche retenue : celle que l'expert a désignée, ou la seule candidate.
    // ⚠ PAS « LA PREMIÈRE DE LA LISTE » QUAND IL Y EN A PLUSIEURS : ce serait
    // choisir à sa place, et le code couleur du document en dépend.
    const numero = ligne?.fiche_numero
      ?? (candidates.length === 1 ? candidates[0] : null);
    const f = numero ? fiche(numero) : null;
    const code = f?.code_couleur || null;
    out.push({
      cle: d.reponse.id, ligne, reponse: d.reponse, point: d.point,
      piece: d.piece, libelle: d.libelle,
      constatReleve: d.reponse.note || '',
      constat: ligne?.desordre || d.reponse.note || '',
      candidates, ficheNumero: numero, fiche: f, code,
      aChoisir: candidates.length > 1 && !ligne?.fiche_numero,
      priorite: ligne?.priorite || prioriteDeCouleur(code),
      prioriteForcee: !!ligne?.priorite,
      preconisation: ligne?.preconisation || '',
      photos: d.reponse.photos || [],
      retenu: ligne ? ligne.retenu !== false : true,
      libre: false,
    });
  }

  for (const l of lignes.filter(x => !x.reponse_id).sort((a, b) => (a.rang || 0) - (b.rang || 0))) {
    const f = l.fiche_numero ? fiche(l.fiche_numero) : null;
    const code = l.code_couleur || f?.code_couleur || null;
    out.push({
      cle: l.id, ligne: l, reponse: null, point: null,
      piece: l.piece || '—', libelle: l.desordre_libre || 'Désordre ajouté',
      constatReleve: '', constat: l.desordre || l.desordre_libre || '',
      candidates: l.fiche_numero ? [l.fiche_numero] : [],
      ficheNumero: l.fiche_numero || null, fiche: f, code, aChoisir: false,
      priorite: l.priorite || prioriteDeCouleur(code),
      prioriteForcee: !!l.priorite,
      preconisation: l.preconisation || '',
      photos: [], retenu: l.retenu !== false, libre: true,
    });
  }

  // ⚠ LA NUMÉROTATION NE COMPTE QUE LES DÉSORDRES RETENUS, et les photos avec
  // elle. Écarter le désordre n° 4 doit renuméroter le 5 en 4 : un rapport où
  // les numéros sautent se lit comme un rapport auquel il manque une page.
  let n = 0, photo = 0;
  for (const d of out) {
    if (!d.retenu) { d.numero = null; d.numerosPhotos = []; continue; }
    d.numero = ++n;
    d.numerosPhotos = d.photos.map(() => ++photo);
  }
  return out;
}

// Les préconisations, regroupées comme le modèle papier les veut : par
// priorité, les rouges d'abord. ⚠ CE QUI N'A PAS DE PRIORITÉ N'EST PAS RANGÉ
// EN « BASSE » : il apparaît dans un groupe à part, en tête, parce qu'un
// arbitrage qui manque doit se voir avant d'être remis au client.
export function parPriorite(liste) {
  const retenus = liste.filter(d => d.retenu);
  const groupes = ORDRE_PRIORITES.map(k => ({
    cle: k, ...PRIORITES[k], lignes: retenus.filter(d => d.priorite === k),
  }));
  const sans = retenus.filter(d => !d.priorite);
  return sans.length
    ? [{ cle: null, mot: 'Priorité à définir', couleur: null,
         faire: 'Choisir la fiche ou la priorité', lignes: sans }, ...groupes]
    : groupes;
}

// L'avancement du document, pour la liste des visites et pour le bandeau.
export function etatRapport(releveId) {
  const r = rapportDe(releveId);
  const d = desordres(releveId, r);
  const retenus = d.filter(x => x.retenu);
  return {
    rapport: r,
    existe: !!r,
    statut: r?.statut || null,
    desordres: retenus.length,
    ecartes: d.length - retenus.length,
    sansPriorite: retenus.filter(x => !x.priorite).length,
    sansPreconisation: retenus.filter(x => !x.preconisation.trim()).length,
    photos: retenus.reduce((n, x) => n + x.photos.length, 0),
  };
}

// Les visites qui peuvent donner un rapport : toutes celles qu'on voit.
// ⚠ Y COMPRIS CELLES SANS AUCUNE ANOMALIE : un rapport qui conclut « rien à
// signaler » est un rapport, et c'est même le meilleur des résultats pour le
// client.
export const visites = () => releves();
