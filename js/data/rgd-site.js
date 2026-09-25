// Publier sur rgdrenova.fr depuis le CRM
//
// ⚠ CE FICHIER S'APPELAIT `rgd-api.js` JUSQU'AU 25/09/2026, et il portait tout
// autre chose : les quinze chemins par lesquels le CRM écrivait dans
// l'application RGD, jeton de connexion unique compris. Ils sont tous partis,
// un lot par jour, du 24 au 25 septembre — les six gestes des sous-traitants et
// le dépôt de leurs pièces, les photos, les partenaires, les chantiers, les
// devis, les rendez-vous, puis les clients et les demandes. Il ne reste ici que
// ce qui n'a jamais eu affaire à eux : la publication du site.
//
// ⚠ IL A ÉTÉ RENOMMÉ POUR CETTE RAISON. Un fichier nommé « api » qui ne parle
// plus qu'à Supabase enverrait chercher au mauvais endroit le jour où quelqu'un
// suivra un chemin d'écriture. Ce qui a disparu avec les appels — `obtenirJeton`,
// `peutEcrire`, `envoyer`, `televerser`, l'adresse du worker — ne doit pas
// revenir : `has_activity('rgd')`, dont `scope.canRgd` est le miroir, est
// désormais le seul droit qui compte.
//
// ⚠ CE SONT LES SEULES ÉCRITURES DE L'ESPACE QUI SORTENT VERS LE PUBLIC.
// `rgd_publier_site` ne modifie pas une ligne : il REMPLACE le document
// entier, et c'est ce document que rgdrenova.fr lit pour sa page « Nos
// réalisations ». Enregistrer ici, c'est publier.
//
// ⚠ IL FAUT TOUJOURS RELIRE AVANT D'ÉCRIRE, ET NE JAMAIS RECONSTRUIRE
// LE DOCUMENT DEPUIS LE REFLET. `rgd_realisations` déplie le JSON en lignes
// pour qu'on puisse le chercher et le trier, mais il PERD les descriptions
// des cinq catégories — de longs textes de référencement qui n'ont pas de
// colonne. Repartir du reflet les effacerait du site sans que rien ne le dise.
//
// ⚠ ET IL N'Y A QU'UN SEUL NIVEAU DE RETOUR ARRIÈRE. Chaque enregistrement
// pousse l'ancien document dans `data_backup` et écrase le précédent : deux
// mauvais enregistrements de suite, et la bonne version n'existe plus nulle
// part. L'écran doit le dire avant de proposer « restaurer ».
import { db } from './db.js';

// ⚠ DEUX DOCUMENTS, UNE SEULE MÉCANIQUE. `rgd_site_documents` porte
// `realisations` (5 catégories, 31 projets) ET `carrousel` (les images du
// haut de la page d'accueil). Mêmes RPC, même remplacement en entier, même
// unique niveau de retour arrière — les trois fonctions ci-dessous sont donc
// écrites une fois et paramétrées par la clé. Les dédoubler ferait deux
// endroits où corriger le jour où la mécanique bouge.
async function lireDoc(cle, valide) {
  try {
    // ⚠ On passe par `rgd_lire_site`, PAS par la fonction publique du site :
    // celle-ci sert un cache d'une minute aux visiteurs, et republier une
    // version vieille d'une minute annulerait la modification de quelqu'un
    // d'autre — exactement ce que la relecture avant publication protège.
    const d = await db.rpc('rgd_lire_site', { p_cle: cle });
    if (!valide(d)) return { ok: false, motif: 'document inattendu' };
    return { ok: true, donnees: d };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 120) };
  }
}

async function publierDoc(cle, doc) {
  try {
    // L'auteur n'est pas passé : la fonction le lit dans le jeton, où
    // personne ne peut l'inventer.
    const r = await db.rpc('rgd_publier_site', { p_cle: cle, p_doc: doc });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

async function restaurerDoc(cle) {
  try {
    const r = await db.rpc('rgd_restaurer_site', { p_cle: cle });
    if (r?.ok === false) return { ok: false, motif: r.error || 'refusé' };
    return { ok: true, donnees: r };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 160) };
  }
}

// Le document complet, lu à la source.
export const lireRealisations = () =>
  lireDoc('realisations', (d) => Array.isArray(d?.categories));

// Publier le document. `doc` doit être le document ENTIER — la RPC ne redéplie
// le reflet que si `categories` porte au moins une entrée, ce qui est le
// garde-fou minimal contre un envoi tronqué.
export const enregistrerRealisations = (doc) => publierDoc('realisations', doc);

// Revenir à la version précédente. UNE seule, voir plus haut.
export const restaurerRealisations = () => restaurerDoc('realisations');

// ⚠ Le carrousel a la MÊME contrainte de remplacement entier : `POST` écrase
// la liste des images de la page d'accueil. Une liste amputée retire du site
// les photos manquantes, et le retour arrière ne remonte que d'un cran.
// ⚠ Et une contrainte de plus, qui ne se voit pas : le reflet `rgd_carrousel`
// a une clé unique sur `url` et un `on conflict do nothing`. Deux fois la même
// photo dans la liste, et la seconde n'apparaît PAS dans le CRM alors qu'elle
// est bien sur le site — d'où le refus des doublons côté écran.
export const lireCarrousel = () =>
  lireDoc('carrousel', (d) => Array.isArray(d?.images));
export const enregistrerCarrousel = (images) => publierDoc('carrousel', { images });
export const restaurerCarrousel = () => restaurerDoc('carrousel');

// Déposer une ou plusieurs photos. Elles vont dans le bucket public
// `realisations` de Supabase, qui rend leurs adresses — à poser ensuite dans
// `images` d'un projet, puis à enregistrer : le dépôt seul ne publie rien.
//
// ⚠ ELLES ALLAIENT DANS LE KV DE CLOUDFLARE JUSQU'AU 24/09/2026, et c'était le
// dernier morceau des réalisations resté là-bas. Les 63 anciennes photos
// avaient bien été recopiées vers Supabase, mais tout NOUVEAU dépôt repartait
// chez le worker : cinq photos redéposées ce jour-là ont atterri dans le KV,
// et elles seraient mortes le jour où il s'éteindra. On ne répare pas une
// migration en recopiant à chaque fois ce qui vient d'arriver — on déplace la
// porte.
//
// ⚠ LE NOM DE FICHIER GARDE LA CONVENTION DU WORKER :
// `horodatage-hasard-nom_assaini`. Les 63 photos déjà en place le portent ;
// en changer ferait deux familles de noms dans un même bucket, sans que rien
// ne dise laquelle vient d'où.
//
// ⚠ ON REFUSE TOUT LE LOT si une seule image cloche, comme le faisait le
// worker : on voit ce qui ne va pas au lieu de chercher la photo manquante.
// La vérification est faite ICI et pas seulement par le bucket, parce qu'un
// refus du bucket arrive photo par photo, à moitié du dépôt, avec un message
// en anglais.
const PHOTO_MAX = 20 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export async function deposerPhotosRealisations(fichiers) {
  const liste = [...fichiers];
  if (!liste.length) return { ok: false, motif: 'aucun fichier' };

  for (const f of liste) {
    const type = String(f.type || '').toLowerCase();
    if (type && !PHOTO_TYPES.includes(type)) {
      return { ok: false, motif: `« ${f.name} » n’est pas une image (${type})` };
    }
    if (f.size > PHOTO_MAX) {
      return { ok: false, motif: `« ${f.name} » dépasse ${Math.round(PHOTO_MAX / 1048576)} Mo` };
    }
  }

  const urls = [];
  try {
    for (const f of liste) {
      const propre = String(f.name || 'photo').replace(/[^A-Za-z0-9._-]/g, '_');
      const nom = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${propre}`;
      urls.push(await db.deposerPhotoPublique(nom, f));
    }
  } catch (e) {
    const motif = String(e.message || e);
    // La politique d'écriture du bucket est gardée par `has_activity('rgd')` :
    // un compte d'une autre structure se voit refuser, et le message brut ne
    // le dirait pas.
    return { ok: false, motif: /row-level security|not authorized|403/i.test(motif)
      ? 'Réservé à l’équipe RGD : aucune photo n’a été déposée.'
      : motif.slice(0, 120) };
  }
  return { ok: true, donnees: { urls } };
}
