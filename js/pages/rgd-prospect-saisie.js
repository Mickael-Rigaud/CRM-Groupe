// Créer et supprimer un prospect RGD, depuis les quatre sous-onglets
//
// POURQUOI C'EST POSSIBLE AUJOURD'HUI ET PAS HIER
// Jusqu'au 23/09/2026, `rgd_clients.d1_id` était `not null` : la table
// **refusait toute fiche qui ne venait pas de Cloudflare**. Et une suppression
// faite ici serait revenue au relevé suivant, puisque D1 gardait la ligne.
// Depuis que `d1_id` est facultatif, une fiche peut naître et mourir dans le
// CRM sans que Cloudflare ait son mot à dire.
//
// ⚠ DEUX POPULATIONS COHABITENT DANS LES MÊMES TABLEAUX, ET ELLES N'ONT PAS
// LES MÊMES DROITS.
//   · `d1_id` renseigné  → la fiche vient de Cloudflare. **On ne la supprime
//     pas** : le relevé la réécrirait au passage suivant, et la corbeille
//     donnerait l'illusion d'avoir agi. Le bouton n'apparaît donc pas, et la
//     note sous le tableau dit pourquoi.
//   · `d1_id` à NULL     → la fiche est née ici. Elle se supprime pour de bon.
// C'est la SEULE règle à retenir de ce fichier.
//
// ⚠ ON SUPPRIME LA FICHE RGD, ON ARCHIVE LE CONTACT.
// Deux raisons, et la seconde compte plus que la première. D'abord la policy :
// `contacts_delete` est réservée à la direction (`my_role() = 'direction'`),
// donc un bouton qui supprimerait le contact échouerait pour un chargé
// d'affaires. Ensuite le modèle : `contacts` est partagée par les quatre
// structures — la même personne peut être un prospect RGD **et** un client BTP.
// Effacer le contact pour retirer un prospect RGD emporterait une fiche qui ne
// nous appartient pas. On archive : elle sort des listes, elle reste
// récupérable, et rien d'autre ne casse.
//
// ⚠ LES QUATRE SOUS-ONGLETS NE LISENT PAS LA MÊME TABLE.
// « site » vient de `rgd_demandes`, les trois autres de `rgd_clients`. Les
// champs diffèrent donc, et ce n'est pas un caprice : ce sont les colonnes que
// chaque tableau AFFICHE. Un formulaire qui demanderait autre chose que ce que
// la liste montre produirait des lignes à moitié vides.
import { db } from '../data/db.js';
import { openModal, closeModal, confirm, renderForm, readForm, toast, esc } from '../ui.js';

// Ce que chaque sous-onglet réclame, en plus de l'identité.
// `table` dit où atterrit la fiche, `fixe` les colonnes imposées par la
// provenance — celles qui font qu'elle retombera dans le bon onglet.
const FORMES = {
  site: {
    table: 'rgd_demandes',
    titre: 'Nouveau prospect du site',
    fixe: { source: 'formulaire_site', statut: 'nouveau_prospect' },
    champs: [
      { key: 'type_projet', label: 'Projet', half: true,
        hint: 'Ce que la personne veut faire — cuisine, salle de bain…' },
      { key: 'budget', label: 'Budget', half: true },
      { key: 'superficie', label: 'Surface (m²)', half: true },
      { key: 'type_demandeur', label: 'Statut du demandeur', half: true,
        type: 'select', options: ['Propriétaire', 'Futur acquéreur', 'Locataire', 'Professionnel'] },
      { key: 'comment_connu', label: 'Connu via', half: true },
      { key: 'projet_description', label: 'Description du projet', type: 'textarea', rows: 3 },
    ],
  },
  meta: {
    table: 'rgd_clients',
    titre: 'Nouveau prospect Meta Ads',
    fixe: { source: 'meta_ads', statut: 'qualifie', statut_suivi: 'nouveau_prospect',
            type_d1: 'particulier' },
    champs: [
      { key: 'meta_type_projet', label: 'Projet', half: true },
      { key: 'meta_type_bien', label: 'Type de bien', half: true },
      { key: 'meta_budget', label: 'Budget', half: true },
      { key: 'meta_campaign', label: 'Campagne', half: true,
        hint: 'Le nom de la campagne Meta, si vous le connaissez' },
    ],
  },
  partenaire: {
    table: 'rgd_clients',
    titre: 'Nouveau prospect apporté',
    fixe: { source: 'apporteur', statut: 'prospect', statut_suivi: 'nouveau_prospect',
            type_d1: 'particulier' },
    champs: [
      // ⚠ L'APPORTEUR EST OBLIGATOIRE, et c'est lui qui définit l'onglet :
      // le sous-onglet « partenaire » liste les fiches qui portent un
      // `apporteur_id`. Sans lui, la fiche serait créée puis introuvable.
      { key: 'apporteur_id', label: 'Apporteur', type: 'select', required: true, options: [] },
      { key: 'nature_travaux', label: 'Nature des travaux', half: true },
      { key: 'budget_travaux', label: 'Budget (€)', type: 'number', half: true },
    ],
  },
  autre: {
    table: 'rgd_clients',
    titre: 'Nouveau prospect',
    // ⚠ `source: 'manuel'` N'EST PAS DÉCORATIF. Le sous-onglet « autre » se
    // définit par `source === 'manuel'` et pas par une négation — une fiche
    // créée ici avec une autre source disparaîtrait des quatre onglets.
    fixe: { source: 'manuel', statut: 'prospect', statut_suivi: 'nouveau_prospect',
            type_d1: 'particulier' },
    champs: [
      { key: 'nature_travaux', label: 'Nature des travaux', half: true },
      { key: 'budget_travaux', label: 'Budget (€)', type: 'number', half: true },
      { key: 'notes', label: 'Note', type: 'textarea', rows: 3 },
    ],
  },
};

const IDENTITE = [
  { key: 'prenom', label: 'Prénom', half: true },
  { key: 'nom', label: 'Nom', half: true, required: true },
  { key: 'email', label: 'Email', type: 'email', half: true },
  { key: 'telephone', label: 'Téléphone', half: true },
  { key: 'adresse', label: 'Adresse' },
  { key: 'code_postal', label: 'Code postal', half: true },
  { key: 'ville', label: 'Ville', half: true },
];

// Un champ vide ne part pas : écrire une chaîne vide là où `null` a du sens
// remplit la base de blancs qu'on ne distingue plus d'une valeur saisie.
const propre = (o) => Object.fromEntries(
  Object.entries(o).filter(([, v]) => v !== '' && v != null));

export function formulaireProspect(sousVue, apporteurs, apresEnregistrement) {
  const forme = FORMES[sousVue];
  if (!forme) return;

  // L'apporteur se choisit dans la liste relevée ; on montre la société quand
  // elle existe, sinon le nom de la personne.
  const champs = forme.champs.map(c => c.key !== 'apporteur_id' ? c : {
    ...c,
    options: (apporteurs || []).map(a => [a.id,
      a.societe || [a.prenom, a.nom].filter(Boolean).join(' ') || '(sans nom)']),
  });
  const spec = [...IDENTITE, ...champs];

  const m = openModal(forme.titre, `<form id="pf">
    <div class="form-grid">${renderForm(spec)}</div>
    <p class="small muted">Cette fiche est créée <b>dans le CRM</b>, pas dans le tableau de bord
      RGD. Elle apparaît tout de suite et ne sera jamais écrasée par la synchronisation
      Cloudflare — c'est aussi pour ça qu'elle pourra être supprimée d'un clic.</p>
    <div class="form-actions">
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn">Créer le prospect</button>
    </div></form>`, { wide: true });

  m.querySelector('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const bouton = m.querySelector('button[type=submit]');
    const v = readForm(m.querySelector('#pf'), spec);
    if (!String(v.nom || '').trim()) return toast('Le nom est obligatoire', 'warn');
    bouton.disabled = true; bouton.textContent = 'Création…';

    try {
      // 1. Le contact. `activities: ['rgd']` est ce qui le rend visible aux
      //    comptes RGD : sans lui, la fiche serait créée et invisible.
      const contact = await db.insert('contacts', propre({
        first_name: v.prenom, last_name: v.nom,
        email: v.email, phone: v.telephone,
        address: v.adresse, postal_code: v.code_postal, city: v.ville,
        type: 'Prospect', channel: sousVue === 'meta' ? 'meta_ads' : 'Saisie manuelle',
        activities: ['rgd'],
      }));

      // 2. La fiche RGD, dans la table de son onglet. `d1_id` reste absent :
      //    c'est ce qui la protège du relevé et permettra de la supprimer.
      const metier = propre(Object.fromEntries(
        champs.map(c => [c.key, v[c.key]])));

      const ligne = forme.table === 'rgd_demandes'
        ? { contact_id: contact.id, date_demande: new Date().toISOString(),
            // `rgd_demandes` porte l'identité EN DOUBLE du contact — c'est une
            // table en forme de D1, et le tableau lit ses colonnes à elle.
            // Ne pas les remplir donnerait une ligne sans nom à l'écran.
            nom: v.nom, prenom: v.prenom, email: v.email, telephone: v.telephone,
            adresse: v.adresse, code_postal: v.code_postal, ville: v.ville,
            ...forme.fixe, ...metier }
        : { contact_id: contact.id, ...forme.fixe, ...metier,
            ...(sousVue === 'meta' ? { meta_received_at: new Date().toISOString() } : {}) };

      await db.insert(forme.table, propre(ligne));
      closeModal();
      toast('Prospect créé');
      apresEnregistrement?.();
    } catch (err) {
      bouton.disabled = false; bouton.textContent = 'Créer le prospect';
      toast(`Création impossible : ${String(err.message || err).slice(0, 120)}`, 'warn');
    }
  };
}

// ⚠ NE JAMAIS APPELER CECI SUR UNE FICHE QUI PORTE UN `d1_id`.
// L'appelant ne montre le bouton que sur les fiches nées dans le CRM, mais on
// revérifie ici : un écran est un garde-fou, pas une garantie.
export async function supprimerProspect(sousVue, ligne, apresSuppression) {
  const forme = FORMES[sousVue];
  if (!forme) return;
  if (ligne.d1_id != null) {
    return toast('Cette fiche vient du tableau de bord RGD : elle doit y être supprimée.', 'warn');
  }

  // `rgd_demandes` porte le nom en propre ; `rgd_clients` ne l'a pas et il faut
  // aller le chercher sur le contact. Sans ce repli, la confirmation demandait
  // « Supprimer undefined ? ».
  const c = ligne.contact_id ? db.byId('contacts', ligne.contact_id) : null;
  const nom = [ligne.prenom, ligne.nom].filter(Boolean).join(' ')
    || [c?.first_name, c?.last_name].filter(Boolean).join(' ')
    || 'cette fiche';
  if (!await confirm(`Supprimer ${nom} ? La fiche est retirée définitivement. `
    + `Le contact, lui, est archivé et reste récupérable.`)) return;

  try {
    await db.remove(forme.table, ligne.id);
    // Le contact suit, mais archivé et non supprimé — voir l'en-tête.
    if (ligne.contact_id) {
      try { await db.update('contacts', ligne.contact_id, { archived_at: new Date().toISOString() }); }
      catch { /* L'archivage est un confort : son échec ne doit pas annuler la suppression. */ }
    }
    toast('Prospect supprimé');
    apresSuppression?.();
  } catch (err) {
    toast(`Suppression impossible : ${String(err.message || err).slice(0, 120)}`, 'warn');
  }
}

// Le bouton de suppression d'une ligne — rendu seulement quand la fiche est
// née dans le CRM. Sur une fiche venue de Cloudflare on ne met rien : une
// corbeille grisée invite à cliquer pour comprendre pourquoi elle est grisée.
export const boutonSuppression = (ligne) => ligne.d1_id == null
  ? `<button class="icon-btn" data-suppr="${esc(ligne.id)}" title="Supprimer cette fiche">🗑</button>`
  : '';
