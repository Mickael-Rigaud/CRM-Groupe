// Ce qu'un rendez-vous de visite technique apprend sur la personne
//
// Quand Mickael prend un appel, il pose un « Visite technique: Mme X » dans
// Google Agenda et écrit dans la description ce qu'il vient d'apprendre : le
// numéro de téléphone, puis le projet. Un robot crée ensuite la fiche à partir
// de l'événement — mais il ne reprend que le nom et l'adresse. Le téléphone et
// le projet restaient dans l'agenda, et la fiche ouvrait sur quelqu'un dont on
// ne savait rien.
//
// Ce module lit cette description et la rend à la fiche : le numéro dans le
// champ téléphone, le reste dans le commentaire. Demandé le 24/09/2026 — « je
// voulais que tu détectes le numéro de téléphone et que tu le mettes
// directement dans le champ correspondant ».
//
// ⚠ ON NE RECOPIE PAS LA DESCRIPTION DANS LA BASE, ON LA LIT À CHAQUE FOIS.
// C'est Google qui la porte, et Mickael l'y corrige. Une copie dans `notes`
// divergerait dès la première retouche de l'événement, et `push_rgd_clients`
// réécrit `notes` depuis l'application RGD à chaque relevé — elle ne tiendrait
// de toute façon pas une demi-heure. Le téléphone, lui, est une coordonnée :
// sa place est sur le contact, et le formulaire de modification le propose
// pré-rempli pour qu'un seul enregistrement l'y pose vraiment.

// ⚠ LE LIEN PAR `source_event_id` NE SUFFIT PAS : au 24/09/2026 une fiche sur
// quatre seulement le porte. Le repli compare le nom du contact au titre de
// l'événement, ce qui marche parce que le robot fabrique l'un à partir de
// l'autre — « Visite technique: Mme herlin / RGD Renova » donne un contact
// nommé « herlin », qui se retrouve donc dans le titre. Il ne s'applique
// QU'aux fiches nées de l'agenda : ailleurs, un homonyme accrocherait le
// mauvais rendez-vous.
//
// Le suffixe « / RGD Renova » du titre nomme l'entreprise chez qui le
// rendez-vous est pris ; il a été retiré des contacts le 24/09/2026 (migration
// `rgd_visites_nom_sans_rgd_renova`), donc la recherche porte sur un nom PLUS
// COURT que le titre — c'est bien le titre qui contient le nom, pas l'inverse.
const sansAccent = (s) => String(s || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Le rendez-vous d'où vient la fiche, ou `null`.
 * @param {object} f        la ligne `rgd_clients`
 * @param {object[]} chantiers  ses chantiers
 * @param {object[]} evenements `agenda_events`
 * @param {string} nom      le nom affiché de la personne
 */
export function rendezVousDeLaFiche(f, chantiers, evenements, nom) {
  const id = (chantiers || []).map(c => c.source_event_id).find(Boolean);
  if (id) {
    const exact = (evenements || []).find(e => e.google_id === id);
    if (exact) return exact;
  }
  if (f?.source !== 'google_calendar') return null;

  // ⚠ TROIS LETTRES, PAS QUATRE. Depuis le 24/09/2026 le contact ne porte plus
  // que son nom — le suffixe « / RGD Renova » a été retiré —, et des noms de
  // trois lettres existent (Roy, Gay, Fay). Le garde ne sert qu'à empêcher une
  // chaîne vide ou une initiale d'attraper n'importe quel rendez-vous.
  const cherche = sansAccent(nom);
  if (cherche.length < 3) return null;
  // Le plus récent d'abord : une personne peut avoir été revue.
  return (evenements || [])
    .filter(e => /visite technique/i.test(String(e.title || ''))
      && sansAccent(e.title).includes(cherche))
    .sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')))[0] || null;
}

// Un numéro français, écrit comme on l'écrit vraiment : « 0658209349 »,
// « 06 58 20 93 49 », « 06.58.20.93.49 », « +33 6 58 20 93 49 ».
// ⚠ LE PREMIER CHIFFRE EST `[1-9]`, jamais `\d` : sans ça, une date comme
// « 02/10/2026 » ou un montant « 0 05 12 » passeraient pour un téléphone.
const NUMERO = /(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/;

// Les mots qui annoncent un numéro, et ceux qui ne font que relier une étiquette
// à un nom. Ils ne comptent pas quand on cherche si la ligne dit autre chose.
const ANNONCE = /^(coordonn[ée]e?s?|t[ée]l[ée]phone|t[ée]l|contact|portable|mobile|num[ée]ro)$/i;
const LIAISON = /^(de|du|des|d|la|le|pour|m|mr|mme|madame|monsieur|mlle)$/i;

/**
 * Découpe la description d'un rendez-vous.
 *
 * ⚠ UNE LIGNE EST JETÉE EN ENTIER OU GARDÉE EN ENTIER, jamais amputée. Retirer
 * le numéro au milieu d'une phrase donnait « Tel — RDV confirmé », une ligne
 * que personne n'a écrite. Et jeter toute ligne qui annonce un numéro perdait
 * le « RDV confirmé » qui la suivait.
 *
 * ⚠ LA LIGNE N'EST JETÉE QUE SI ON PEUT PROUVER QU'ELLE NE DIT RIEN D'AUTRE :
 * une fois le numéro, le mot d'annonce et les mots de liaison retirés, il ne
 * doit plus rester que des mots du NOM de la personne. C'est pour ça que le nom
 * est demandé ici. « coordonnées de Mme Monteiro Magali: 0658209349 » ne laisse
 * que « monteiro magali », qui est son nom : la ligne ne servait qu'à porter le
 * numéro, elle part. « Tel 06… — RDV confirmé » laisse « rdv confirmé », qui
 * n'est dans aucun nom : elle reste, telle quelle.
 *
 * @param {string} description  la description de l'événement Google
 * @param {string} [nom]        le nom affiché de la personne
 * @returns {{ telephone: string, commentaire: string }}
 */
export function coordonneesDuRendezVous(description, nom) {
  const texte = String(description || '').replace(/\r\n?/g, '\n');
  if (!texte.trim()) return { telephone: '', commentaire: '' };

  const trouve = texte.match(NUMERO);
  const telephone = trouve ? trouve[0].replace(/[\s.\-]/g, '') : '';
  const motsDuNom = new Set(sansAccent(nom).split(/[^a-z0-9]+/).filter(Boolean));

  const lignes = texte.split('\n').filter((ligne) => {
    if (!telephone || !NUMERO.test(ligne)) return true;
    const restants = sansAccent(ligne.replace(NUMERO, ' '))
      .split(/[^a-z0-9']+/).filter(Boolean)
      .filter(mot => !ANNONCE.test(mot) && !LIAISON.test(mot) && !motsDuNom.has(mot));
    return restants.length > 0;
  });

  const commentaire = lignes.join('\n')
    .replace(/\n{3,}/g, '\n\n')   // trois sauts de ligne n'aèrent pas plus que deux
    .trim();
  return { telephone, commentaire };
}
