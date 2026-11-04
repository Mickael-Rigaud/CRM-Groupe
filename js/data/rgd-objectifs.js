// Les objectifs mensuels de RGD Renova, et ce qui les mesure (04/11/2026)
//
// Demandé par Élodie : « un graphique qui synthétise toutes les demandes
// mensuelles ainsi que leurs objectifs et performances », avec le taux de
// transformation à chaque étape, et à part le taux devis envoyés → signés.
//
// ⚠ LES DÉFINITIONS VIVENT ICI, PAS DANS L'ÉCRAN, et c'est la règle posée en
// tête de `pages/rgd-pilotage.js` : deux écrans qui affichent deux vérités sur
// le même chiffre valent moins que pas d'écran du tout. Le jour où ces nombres
// apparaissent ailleurs, ils viennent de ce fichier.
//
// ⚠ CE N'EST PAS UNE COHORTE, pas plus que le pipeline au-dessus. Chaque mois
// compte ce qui S'EST PASSÉ ce mois-là : des demandes reçues, des rendez-vous
// tenus, des devis signés, des factures émises. Un devis signé en novembre a
// pu naître d'une demande de septembre. Les taux rapprochent donc deux volumes
// du MÊME mois, ce qui mesure un rythme, pas un parcours — c'est écrit sous le
// graphique, parce que la nuance décide de ce qu'on peut en conclure.
import { db } from './db.js';
import { scope } from './scope.js';
import { estVisiteTechnique } from './rgd-etapes.js';

// Les objectifs, fixés par Élodie le 04/11/2026.
//
// ⚠ ILS SE CHANGENT SANS DÉPLOIEMENT : `rgd_reglages`, clé `objectifs_mensuels`,
// un objet JSON aux mêmes quatre clés. Cette table se LIT avec l'activité RGD
// et ne s'ÉCRIT que par la direction — c'est déjà là que vit le cachet des
// factures. Une valeur absente ou illisible retombe sur celles-ci.
export const OBJECTIFS_DEFAUT = { demandes: 20, rdv: 10, devis: 5, ca: 35000 };

export function objectifsMensuels() {
  const brut = db.t('rgd_reglages').find(r => r.cle === 'objectifs_mensuels')?.valeur;
  if (!brut) return { ...OBJECTIFS_DEFAUT };
  try {
    const v = typeof brut === 'string' ? JSON.parse(brut) : brut;
    const nombre = (x, repli) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : repli);
    return {
      demandes: nombre(v.demandes, OBJECTIFS_DEFAUT.demandes),
      rdv: nombre(v.rdv, OBJECTIFS_DEFAUT.rdv),
      devis: nombre(v.devis, OBJECTIFS_DEFAUT.devis),
      ca: nombre(v.ca, OBJECTIFS_DEFAUT.ca),
    };
  } catch {
    // Un réglage illisible ne doit pas emporter l'écran : on reprend les
    // objectifs d'origine, comme si rien n'avait été saisi.
    return { ...OBJECTIFS_DEFAUT };
  }
}

const mois7 = (v) => String(v || '').slice(0, 7);

// ⚠ UN CLIENT QUI A DEUX DEVIS COMPTE POUR UN (04/11/2026, Élodie : « deux
// devis pour un client doivent compter pour un, sinon les données ne seront
// pas du tout réelles »). Costructor produit une seconde version d'un devis
// plutôt que de corriger la première : relevé en base, `D202600192` et
// `D202600196` portent le même montant, la même date d'envoi et le MÊME
// `contact_id`. Comptés séparément, un seul client qui hésite ressemblait à
// deux affaires. L'effet n'est pas marginal — juin 2026 tombe de 3 devis
// signés à 1 client.
//
// ⚠ LE REPLI SUR L'IDENTIFIANT DU DEVIS EST VOLONTAIRE ET IMPORTANT : sans
// contact ni organisation, deux devis SANS client se seraient fondus en un
// seul « client inconnu », et toute une campagne de devis anonymes aurait
// compté pour une affaire. Faute de savoir qui c'est, on ne fusionne rien.
const cleClient = (d) => d.contact_id || d.organisation_id || d.id;
const uniques = (liste) => [...new Set(liste.map(cleClient).filter(Boolean))];

// ⚠ LE RENDEZ-VOUS NE SE COMPTE PAS DANS L'AGENDA, ET C'EST LE PIÈGE DE CET
// ÉCRAN. `agenda_events` n'est PAS un historique : `relever-agenda` tient une
// fenêtre glissante de J-7 à J+30 et VIDE chaque jour les journées J-8 et J-9
// (constantes PASSE et OUBLI de la fonction). Une frise bâtie dessus aurait
// donné des mois qui se vident tout seuls en vieillissant — octobre encore
// honnête en novembre, à zéro en janvier, sans que rien ne le signale. Le
// défaut a été signalé par la session qui travaille sur le tableau de bord du
// groupe, puis vérifié dans le code de la fonction et dans les données :
// l'agenda ne portait plus qu'UN rendez-vous d'octobre, contre NEUF visites
// techniques réellement tenues.
//
// ⚠ LA SOURCE DURABLE EST `rgd_chantiers`, et la définition existe déjà :
// `estVisiteTechnique` (`statut_d1 === 'visite_technique'`, js/data/rgd-etapes.js),
// celle-là même que le pipeline emploie pour sa colonne « RDV ». On ne l'écrit
// donc pas une seconde fois ici — deux écrans, deux vérités sur le même
// chiffre, c'est la règle que l'en-tête de `pages/rgd-pilotage.js` interdit.
// La date du rendez-vous est `date_debut_prevue` : les onze visites connues
// en portent une, aucune n'est vide.

/**
 * Les douze derniers mois, avec ce qui s'y est passé. Le dernier est le mois
 * en cours, forcément incomplet — l'écran le dit.
 *
 * ⚠ DOUZE MOIS GLISSANTS, ET NON L'EXERCICE COMPTABLE de la courbe juste en
 * dessous, alors que la tentation était de les aligner. Deux raisons, et la
 * première a été mesurée : au 04/11/2026 l'exercice 2026-2027 a DEUX mois, donc
 * la frise aurait eu deux colonnes et n'aurait rien montré — et elle serait
 * retombée à une seule chaque 1er octobre. La seconde est de fond : un objectif
 * mensuel n'est pas une donnée comptable. Le chiffre d'affaires se lit par
 * exercice parce qu'il se déclare par exercice ; un rythme de prospection se
 * lit sur les douze derniers mois, qu'un changement d'exercice ne remet pas à
 * zéro.
 */
export function moisObjectifs(aujourdhui = new Date()) {
  const demandes = scope.rgd('rgd_demandes');
  const clients = scope.rgd('rgd_clients');
  const devis = scope.rgd('rgd_devis');
  const devisCrm = scope.rgd('rgd_devis_crm');
  const paiements = scope.rgd('rgd_paiements');
  const visites = scope.rgd('rgd_chantiers').filter(estVisiteTechnique);

  // ⚠ LES VISITES NE REMONTENT PAS LOIN, et un zéro mentirait. `statut_d1`
  // n'est transmis par le relevé Costructor que depuis le 22/09/2026 : avant
  // la première visite connue, le CRM ne sait pas s'il y en a eu, il sait
  // qu'il n'en a aucune trace. Les mois antérieurs rendent donc `null`, que
  // l'écran affiche « — » et non « 0 ». Même règle que le bas de cet écran
  // pour les relances et les formations.
  const premiereVisite = visites
    .map(c => mois7(c.date_debut_prevue)).filter(Boolean).sort()[0] || null;

  // ⚠ ET LA MÊME RÈGLE POUR LES DEMANDES, pour la même raison, mesurée sur la
  // base le 04/11/2026 : la première demande enregistrée date de mars 2026 et
  // le premier lead Meta de juillet. Décembre, janvier et février auraient donc
  // affiché « 0 demande » sur des mois à 29 000, 15 000 et 36 000 € de chiffre
  // d'affaires — il y a bien eu des affaires, elles ne sont simplement pas
  // entrées par le CRM. Un zéro s'y serait lu comme un effondrement de la
  // prospection ; c'est la mémoire du CRM qui commence là, pas l'activité.
  //
  // ⚠ CE N'EST QUE LE DÉBUT DE L'HISTORIQUE, PAS LES TROUS : un mois à zéro
  // ENTRE deux mois connus reste un vrai zéro et s'affiche comme tel. On ne
  // masque que ce qui précède la première trace.
  const premiereDemande = [
    ...scope.rgd('rgd_demandes').map(d => mois7(d.date_demande || d.created_at)),
    ...scope.rgd('rgd_clients').map(c => mois7(c.meta_received_at)),
  ].filter(Boolean).sort()[0] || null;

  const liste = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() - i, 1);
    const cle = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;

    // ⚠ LES DEUX PORTES D'ENTRÉE D'UNE DEMANDE, « tous canaux confondus » :
    // le formulaire du site atterrit dans `rgd_demandes`, les leads Meta Ads
    // dans `rgd_clients` (voir la fonction `leads-meta`). Ils ne se recoupent
    // pas — un lead Meta ne crée aucune ligne de demande — donc on additionne
    // sans risque de compter deux fois.
    const parFormulaire = demandes.filter(d => mois7(d.date_demande || d.created_at) === cle).length;
    const parMeta = clients.filter(c => mois7(c.meta_received_at) === cle).length;

    // ⚠ LES DEUX ORIGINES D'UN DEVIS : Costructor (`rgd_devis`, relevé toutes
    // les 30 minutes) et ceux faits dans le CRM depuis la grille des tarifs
    // (`rgd_devis_crm`, genre `devis` — les factures n'en sont pas). Ne lire
    // que Costructor ferait disparaître le travail de Franck du tableau.
    const signes = uniques([
      ...devis.filter(d => mois7(d.date_signature) === cle),
      ...devisCrm.filter(d => d.genre === 'devis' && d.statut === 'signe'
        && mois7(d.date_signature || d.date_devis) === cle),
    ]);

    // ⚠ « ENVOYÉ » SE LIT SUR LA DATE, PAS SUR LE STATUT : un devis signé est
    // forcément parti, et son statut ne dit plus « envoyé ». Côté CRM, un devis
    // est parti dès qu'il porte un numéro — c'est ce que l'émission lui donne.
    const envoyes = uniques([
      ...devis.filter(d => mois7(d.date_envoi) === cle),
      ...devisCrm.filter(d => d.genre === 'devis' && d.numero && mois7(d.date_devis) === cle),
    ]);

    liste.push({
      cle,
      label: m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      demandes: premiereDemande && cle < premiereDemande ? null : parFormulaire + parMeta,
      rdv: premiereVisite && cle < premiereVisite
        ? null
        : visites.filter(c => mois7(c.date_debut_prevue) === cle).length,
      // ⚠ LES CLÉS SONT EXPOSÉES, PAS SEULEMENT LEUR NOMBRE. Le tableau de
      // bord du groupe dédoublonne sur un trimestre ou un exercice : le même
      // client qui signe en octobre puis en novembre doit compter une fois sur
      // la période. Additionner douze nombres mensuels le compterait deux fois
      // — seule l'union des clés donne le bon total.
      clientsSignes: signes,
      clientsEnvoyes: envoyes,
      devisSignes: signes.length,
      devisEnvoyes: envoyes.length,
      ca: paiements.filter(p => p.statut !== 'annule' && mois7(p.date_facturation) === cle)
        .reduce((t, p) => t + (Number(p.montant_ht) || 0), 0),
    });
  }
  return liste;
}

/** Un pourcentage entier, ou `null` quand le dénominateur ne permet rien. */
export const taux = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);

/**
 * Les taux de l'ensemble de la période affichée.
 *
 * ⚠ ON LES CALCULE SUR LES TOTAUX, PAS EN MOYENNANT DES TAUX MENSUELS. Un mois
 * à une demande et un rendez-vous vaudrait 100 % et pèserait autant qu'un mois
 * à vingt demandes : la moyenne des pourcentages donne le poids aux mois vides.
 *
 * ⚠ ET LE TAUX ENVOYÉS → SIGNÉS RAPPROCHE DEUX MOIS QUI PEUVENT DIFFÉRER : un
 * devis parti en octobre se signe en novembre. Sur douze mois l'écart se dilue,
 * c'est pourquoi Élodie l'a demandé « à part » et qu'on le donne en global.
 */
export function tauxPeriode(mois) {
  const somme = (champ) => mois.reduce((t, m) => t + (Number(m[champ]) || 0), 0);
  const demandes = somme('demandes');
  // ⚠ UN TAUX NE SE CALCULE QUE SUR LES MOIS OÙ LES DEUX TERMES EXISTENT.
  // Diviser des rendez-vous d'octobre par douze mois de demandes donnerait un
  // pourcentage minuscule qui ne dirait rien de la réalité du mois d'octobre.
  const rdvConnus = mois.filter(m => m.rdv !== null && m.demandes !== null);
  const rdv = rdvConnus.reduce((t, m) => t + m.rdv, 0);
  // ⚠ SUR LA PÉRIODE ON FAIT L'UNION DES CLIENTS, PAS LA SOMME DES MOIS : un
  // client qui signe en octobre puis en novembre est UN client sur l'année, et
  // l'additionner deux fois gonflerait le taux de transformation.
  const union = (champ) => new Set(mois.flatMap(m => m[champ] || [])).size;
  const signes = union('clientsSignes');
  const envoyes = union('clientsEnvoyes');
  const ca = somme('ca');
  return {
    demandes, rdv, signes, envoyes, ca,
    // Le rendez-vous ne se compare qu'aux demandes des mois où l'agenda existe,
    // sans quoi on diviserait des rendez-vous d'octobre par un an de demandes.
    demandesVersRdv: taux(rdv, rdvConnus.reduce((t, m) => t + m.demandes, 0)),
    rdvVersSignes: rdvConnus.length ? taux(
      new Set(rdvConnus.flatMap(m => m.clientsSignes || [])).size, rdv) : null,
    envoyesVersSignes: taux(signes, envoyes),
    // Pas un taux : deux unités différentes. Ce qui relie un devis signé au
    // chiffre d'affaires, c'est le montant moyen qu'il rapporte.
    panier: signes > 0 ? Math.round(ca / signes) : null,
  };
}
