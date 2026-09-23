// Où en est un dossier RGD Renova — la source unique des sept étapes
//
// POURQUOI CE MODULE EXISTE
// Deux écrans montrent le même cycle : la base « Clients & prospects »
// (`js/pages/rgd-clients.js`) et le pipeline de la vue d'ensemble. Recopier le
// calcul de l'un vers l'autre fabriquerait la deuxième vérité que le CLAUDE.md
// interdit — deux écrans qui affichent deux chiffres sur la même chose valent
// moins que pas d'écran du tout. La définition vit donc ici, et eux la lisent.
//
// ⚠ LE RACCOURCI QUI NE MARCHE PAS
// Se contenter d'`ETAPE_DU_STATUT` donne le bon résultat partout SAUF sur les
// fiches restées à `nouveau_prospect`, là où les faits prennent la main — soit,
// au 23/09/2026, les 27 dont le chantier tourne. Un pipeline branché sur le
// seul statut les afficherait en « Nouvelle demande » quand la base les montre
// en « Chantier en cours ».
//
// LES TROIS RÈGLES, DANS L'ORDRE OÙ ELLES S'APPLIQUENT
//
// 1. PERDU SORT DU CYCLE. Une affaire perdue n'est pas « moins avancée »,
//    elle est dehors : elle va en « Archivés », quoi que disent les faits.
//
// 2. UNE SAISIE DÉLIBÉRÉE L'EMPORTE SUR LES FAITS. `nouveau_prospect` n'est
//    pas un statut, c'est une absence de statut — il dit « personne n'a rien
//    renseigné ». C'est là, et là seulement, que les devis et les chantiers
//    parlent à la place du suivi. Toute autre valeur est une décision de
//    quelqu'un, et une décision ne se fait pas contredire par une table.
//    Arbitré le 23/09/2026 : la règle précédente prenait la plus avancée des
//    deux sources, ce qui rendait ces 27 fiches IMMOBILES — changer leur
//    statut ne les déplaçait pas, le chantier les retenait.
//
// 3. LE CHANTIER LE PLUS VIVANT L'EMPORTE. Quelqu'un chez qui on travaille
//    aujourd'hui est « en cours », même s'il a d'anciens chantiers finis. Il
//    ne passe en « terminé » que quand plus rien ne tourne chez lui.
//
// ⚠ `demarrage` NE VEUT PAS DIRE « DÉMARRÉ » : il veut dire préparé, pas
// encore commencé. Il va donc en « Devis accepté ». Les avoir confondus
// donnait six chantiers en cours là où il y en a un.
import { scope } from './scope.js';

// L'ordre du cycle. « archives » n'y figure pas : on n'y avance pas, on en sort.
export const ORDRE_ETAPES = ['demande', 'rdv', 'devis_encours', 'devis_accepte',
  'chantier_encours', 'chantier_termine'];

export const ETAPES_RGD = [
  { key: 'demande', label: 'Nouvelle demande',
    titre: 'Statut « nouveau prospect », relance ou « contacté »' },
  { key: 'rdv', label: 'RDV', titre: 'Statut « rendez-vous planifié »' },
  { key: 'devis_encours', label: 'Devis en cours', titre: 'Devis envoyé, ni signé ni refusé' },
  { key: 'devis_accepte', label: 'Devis accepté',
    titre: 'Devis signé, ou chantier préparé mais pas commencé' },
  { key: 'chantier_encours', label: 'Chantier en cours',
    titre: 'Chantier commencé, pas encore terminé' },
  { key: 'chantier_termine', label: 'Chantier terminé',
    titre: 'Plus aucun chantier en cours chez cette personne' },
  { key: 'archives', label: 'Archivés', titre: 'Perdus et mis de côté' },
];
export const ETAPES_CLES = ETAPES_RGD.map(e => e.key);

// Le statut de suivi du tableau de bord RGD range une à une sur ces étapes :
// il décrivait déjà ce cycle, il le nommait simplement autrement.
export const ETAPE_DU_STATUT = {
  nouveau_prospect: 'demande', relance_1: 'demande', relance_2: 'demande',
  relance_3: 'demande', a_contacter: 'demande',
  rdv_planifie: 'rdv',
  devis_envoye: 'devis_encours',
  devis_accepte: 'devis_accepte',
  chantier_en_cours: 'chantier_encours',
  chantier_termine: 'chantier_termine',
  perdu: 'archives',
};

// L'inverse : le statut que porte une étape. « demande » n'y figure pas, et
// c'est voulu — cinq statuts y mènent (nouveau, trois relances, contacté), et
// les écraser par un seul perdrait où en est la relance.
export const STATUT_DE_L_ETAPE = {
  rdv: 'rdv_planifie',
  devis_encours: 'devis_envoye',
  devis_accepte: 'devis_accepte',
  chantier_encours: 'chantier_en_cours',
  chantier_termine: 'chantier_termine',
  archives: 'perdu',
};

const JAMAIS_RENSEIGNE = ['nouveau_prospect', '', null, undefined];

// Un devis ou un chantier se rattache à la personne par son contact OU par son
// organisation — un professionnel n'a que la seconde (migration 20260923120000).
const memeQue = (x, f) => (!!x.contact_id && x.contact_id === f.contact_id)
  || (!!x.organisation_id && x.organisation_id === f.organisation_id);

// ⚠ UNE VISITE TECHNIQUE N'EST PAS UN CHANTIER. D1 les marque
// `visite_technique`, mais le relevé ne transmet pas cette valeur : elles
// arrivent sans état ET sans aucune date. C'est à ça qu'on les reconnaît,
// faute de mieux ; le jour où le relevé passera la valeur, ce test tombera.
const estUnChantier = (c) => !!c.etat || !!c.date_debut_prevue || !!c.work_start_at;
const devisOuvert = (v) => !['signe', 'refuse', 'expire'].includes(v.statut);

// L'étape lue sur les FAITS seuls. Elle ne dépend d'aucune saisie, donc elle
// ne ment pas — mais elle ne sait rien avant le premier devis.
export function etapeParLesFaits(f, chantiers, devis) {
  const ch = chantiers.filter(c => estUnChantier(c) && memeQue(c, f));
  if (ch.some(c => c.etat === 'en_cours')) return 'chantier_encours';
  if (ch.some(c => c.etat === 'termine')) return 'chantier_termine';
  const dv = devis.filter(v => memeQue(v, f));
  if (ch.some(c => c.etat === 'demarrage') || dv.some(v => v.statut === 'signe')) return 'devis_accepte';
  if (dv.some(devisOuvert)) return 'devis_encours';
  return null;
}

// L'étape d'une fiche `rgd_clients`. Les deux tables sont passées en argument
// pour que l'appelant qui en tient déjà une copie ne la relise pas à chaque
// ligne — `etapesRgd()` ci-dessous les lit une fois pour toutes.
export function etapeDeFiche(f, chantiers, devis) {
  if (f.statut === 'perdu' || f.statut_suivi === 'perdu') return 'archives';
  const brut = f.statut_suivi;
  if (!JAMAIS_RENSEIGNE.includes(brut)) return ETAPE_DU_STATUT[brut] || 'demande';
  return etapeParLesFaits(f, chantiers, devis) || 'demande';
}

// L'étape d'une demande du formulaire du site. Elle n'a ni devis ni chantier
// rattaché : son statut seul décide.
export function etapeDeDemande(d) {
  if (d.statut === 'perdu') return 'archives';
  return ETAPE_DU_STATUT[d.statut] || 'demande';
}

// ⚠ UNE FICHE N'ENTRE DANS LA FRISE QUE SI ELLE VIENT D'UNE PROSPECTION, OU
// SI ELLE A DÉPASSÉ LA PREMIÈRE ÉTAPE. Les 158 fiches Costructor dorment à
// « nouveau_prospect » : sans ce garde, elles rempliraient « Nouvelle demande »
// de gens qui ne sont pas des demandes.
export const estProspectParSource = (f) => !!f.apporteur_id || f.source === 'meta_ads'
  || f.source === 'Formulaire site' || f.source === 'manuel';

// Les sept étapes avec leur compte, sur la même population que l'écran
// « Clients & prospects ». C'est ce que lit le pipeline de la vue d'ensemble.
export function etapesRgd() {
  const fiches = scope.rgd('rgd_clients');
  const demandes = scope.rgd('rgd_demandes');
  const chantiers = scope.rgd('rgd_chantiers');
  const devis = scope.rgd('rgd_devis');

  const comptes = Object.fromEntries(ETAPES_CLES.map(k => [k, 0]));
  for (const d of demandes) comptes[etapeDeDemande(d)] += 1;
  for (const f of fiches) {
    const e = etapeDeFiche(f, chantiers, devis);
    if (e === 'demande' && !estProspectParSource(f)) continue;
    comptes[e] += 1;
  }
  return ETAPES_RGD.map(e => ({ ...e, n: comptes[e.key] }));
}

// ---------------------------------------------------------------- écriture
// Changer l'étape d'une personne, c'est écrire son STATUT — il n'y a pas
// d'autre levier, et c'est voulu : un bouton qui déplacerait l'affichage sans
// écrire mentirait dès le relevé suivant.
//
// ⚠ DEUX CHEMINS D'ÉCRITURE, ET LE BON DÉPEND DE L'ORIGINE DE LA FICHE.
// Une fiche venue de Cloudflare s'écrit À LA SOURCE : l'écrire dans le reflet
// ne servirait à rien, le relevé suivant rétablirait l'ancienne valeur. Une
// fiche née dans le CRM n'existe pas chez le worker — lui envoyer un `d1_id`
// vide donnerait une erreur, et Supabase est sa seule adresse.
//
// Cette fonction est la SEULE porte : la liste et la fiche l'appellent toutes
// les deux. Deux chemins auraient dérivé l'un de l'autre à la première
// correction.
export async function ecrireStatut({ d1Id, uuid, cible, statut }) {
  const { db } = await import('./db.js');
  const { majStatutClient, majStatutDemande } = await import('./rgd-api.js');
  const table = cible === 'demande' ? 'rgd_demandes' : 'rgd_clients';
  const champ = cible === 'demande' ? 'statut' : 'statut_suivi';

  if (!d1Id) {
    return db.update(table, uuid, { [champ]: statut })
      .then(() => ({ ok: true, natif: true }))
      .catch(e => ({ ok: false, motif: String(e.message || e).slice(0, 80) }));
  }
  const r = cible === 'demande'
    ? await majStatutDemande(d1Id, statut)
    : await majStatutClient(d1Id, statut);
  // On avance le reflet local : le relevé confirmera dans la demi-heure, mais
  // l'écran ne doit pas revenir en arrière sous les yeux de qui vient de
  // changer la valeur.
  if (r.ok) {
    const ligne = scope.rgd(table).find(x => String(x.d1_id) === String(d1Id));
    if (ligne) ligne[champ] = statut;
  }
  return { ...r, natif: false };
}
