// Créer et supprimer un prospect RGD, depuis les quatre sous-onglets
//
// POURQUOI C'EST POSSIBLE AUJOURD'HUI ET PAS HIER
// Jusqu'au 23/09/2026, `rgd_clients.d1_id` était `not null` : la table
// **refusait toute fiche qui ne venait pas de Cloudflare**. Et une suppression
// faite ici serait revenue au relevé suivant, puisque D1 gardait la ligne.
// Depuis que `d1_id` est facultatif, une fiche peut naître et mourir dans le
// CRM sans que Cloudflare ait son mot à dire.
//
// ⚠ DEUX POPULATIONS COHABITENT DANS LES MÊMES TABLEAUX, ET ELLES NE SE
// SUPPRIMENT PLUS DE LA MÊME FAÇON — mais les deux se suppriment, depuis le
// 25/09/2026, et d'un seul côté.
//   · `d1_id` à NULL     → la fiche est née ici. Rien ne peut la ramener.
//   · `d1_id` renseigné  → elle venait de l'application RGD. L'effacer ne
//     suffit pas : **le relevé n'efface jamais rien**, il ne fait que des
//     `insert … on conflict do update`, donc la ligne reviendrait au passage
//     suivant avec son ancien statut. On pose donc une PIERRE TOMBALE que les
//     portes du relevé consultent avant d'insérer, dans la même transaction
//     que l'effacement — `supprimerFicheRgd`, `js/data/rgd-clients.js`.
//
// ⚠ IL Y AVAIT UN TROISIÈME CAS, ET IL A DISPARU : jusqu'au 25/09 une fiche
// venue de l'application se supprimait **des deux côtés**, ici et là-bas. Ce
// n'est plus la peine, et ce n'est plus possible non plus : la synchronisation
// n'apporte plus ces fiches. Ce que ça coûte est nommé — une fiche supprimée
// ici reste dans l'application RGD, où plus personne ne va.
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
import { scope } from '../data/scope.js';
import { supprimerFicheRgd } from '../data/rgd-clients.js';

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
    <p class="small muted">Cette fiche est créée <b>dans le CRM</b>, pas dans l'application
      RGD. Elle apparaît tout de suite et aucune synchronisation ne l'écrasera — c'est
      aussi pour ça qu'elle pourra être supprimée d'un clic.</p>
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
      // 1. Le contact.
      //
      // ⚠ `activities: ['rgd']` NE REND RIEN VISIBLE, malgré ce que ce
      // commentaire affirmait jusqu'au 25/09/2026. La policy `contacts_select`
      // ne regarde `activities` que pour le rôle `propulsion` ; pour tous les
      // autres elle demande `owner_id = auth.uid()` ou une affaire visible.
      // Tant que les seuls comptes RGD étaient des directions, l'erreur ne se
      // voyait pas — la direction voit tout. Un chargé d'affaires, lui, aurait
      // créé un prospect et ne l'aurait PAS retrouvé : la fiche `rgd_clients`
      // serait bien à lui, mais le contact qui porte le nom et le téléphone
      // lui serait resté fermé. D'où `owner_id` ci-dessous, qui est ce qui
      // ouvre vraiment. `activities` reste : il sert au marquage par structure
      // dans les listes.
      const contact = await db.insert('contacts', propre({
        first_name: v.prenom, last_name: v.nom,
        email: v.email, phone: v.telephone,
        address: v.adresse, postal_code: v.code_postal, city: v.ville,
        type: 'Prospect', channel: sousVue === 'meta' ? 'meta_ads' : 'Saisie manuelle',
        activities: ['rgd'],
        owner_id: scope.user?.id || null,
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

// ---------------------------------------------------------------- supprimer
//
// ⚠ UNE SUPPRESSION SE FAIT D'UN SEUL CÔTÉ DEPUIS LE 25/09/2026, ET LA PIERRE
// TOMBALE EST CE QUI LE PERMET.
// Le relevé Cloudflare ne fait que des `insert … on conflict do update`, sans
// aucun `delete` : une ligne effacée dans le CRM seul **reviendrait** au
// passage suivant. On effaçait donc à la SOURCE d'abord, et ici ensuite.
// `rgd_supprimer_fiche` inscrit à la place le `d1_id` dans `rgd_suppressions`,
// que `push_rgd_clients` et `push_rgd_demandes` consultent avant d'insérer :
// la ligne peut rester chez Cloudflare, elle ne repassera plus la porte.
//
// Deux raisons de préférer cela au double effacement, dans cet ordre. Le CRM
// est désormais la base de référence, donc ce qui reste là-bas n'a plus de
// lecteur ; et l'effacement à la source dépendait d'un compte de l'application
// RGD, que tout le monde n'a pas — la suppression était fermée à des gens à
// qui la base l'ouvrait.
//
// Une fiche née ici (`d1_id` à NULL) n'a rien à empêcher de revenir : la
// fonction ne pose alors aucune pierre, et le dit (`marquee`).

// Ce qui pend à une fiche. On compte AVANT de proposer quoi que ce soit : un
// client qui porte des devis, des chantiers ou des paiements ne se supprime
// pas d'un clic — ces lignes portent de l'argent, et les orpheliner fausserait
// le chiffre d'affaires sans que rien ne le signale.
function rattachements(contactId) {
  if (!contactId) return { total: 0, detail: [] };
  const affaires = db.t('deals').filter(d => d.contact_id === contactId);
  const idsAffaires = new Set(affaires.map(d => d.id));
  const devis = db.t('rgd_devis').filter(d => d.contact_id === contactId);
  const chantiers = db.t('rgd_chantiers').filter(c => idsAffaires.has(c.deal_id));
  const idsChantiers = new Set(chantiers.map(c => c.id));
  // Un paiement se rattache à son chantier, jamais directement au client.
  const paiements = db.t('rgd_paiements').filter(p => idsChantiers.has(p.chantier_id));

  const detail = [
    [devis.length, 'devis', 'devis'],
    [chantiers.length, 'chantier', 'chantiers'],
    [paiements.length, 'paiement', 'paiements'],
  ].filter(([n]) => n > 0)
   .map(([n, un, plusieurs]) => `${n} ${n > 1 ? plusieurs : un}`);

  return { total: devis.length + chantiers.length + paiements.length, detail };
}

// `sousVue` vaut `site` pour une demande du formulaire, autre chose pour une
// fiche client. Les onglets Clients et Contacts appellent donc avec autre chose
// que `site` et tombent sur `rgd_clients`, ce qui est correct.
export async function supprimerFiche(sousVue, ligne, apresSuppression) {
  const surDemande = sousVue === 'site';
  const table = surDemande ? 'rgd_demandes' : 'rgd_clients';

  const c = ligne.contact_id ? db.byId('contacts', ligne.contact_id) : null;
  const nom = [ligne.prenom, ligne.nom].filter(Boolean).join(' ')
    || [c?.first_name, c?.last_name].filter(Boolean).join(' ')
    || 'cette fiche';

  // ⚠ LE REFUS PASSE AVANT LA CONFIRMATION. Demander « êtes-vous sûr ? » puis
  // répondre « en fait non » fait perdre du temps et de la confiance.
  const liens = rattachements(ligne.contact_id);
  if (liens.total) {
    return toast(`${nom} porte ${liens.detail.join(', ')} : la fiche ne peut pas être `
      + `supprimée sans les orpheliner. Retirez-les d'abord.`, 'warn');
  }

  if (!await confirm(`Supprimer ${nom} ? La fiche est retirée définitivement. `
    + `Le contact, lui, est archivé et reste récupérable.`)) return;

  // 1. La fiche et, s'il y a lieu, sa pierre tombale — une seule transaction.
  //    ⚠ `db.remove` ne suffirait pas : sans la pierre, une fiche venue de
  //    l'application reviendrait au relevé suivant, et la corbeille aurait
  //    donné l'illusion d'avoir agi.
  const r = await supprimerFicheRgd(surDemande ? 'demandes' : 'clients', ligne.id);
  if (!r.ok) return toast(`Suppression impossible : ${r.motif}`, 'err');

  // Le cache tient encore la ligne : la fonction a écrit en base sans passer
  // par `db.remove`, le seul chemin qui retire du cache. On recharge la table
  // plutôt que de la retirer à la main — un `filter` ici et la ligne
  // reviendrait au premier rafraîchissement, la base ayant raison.
  await db.recharger(table);

  // 2. Le contact suit, mais ARCHIVÉ et non supprimé — voir l'en-tête.
  if (ligne.contact_id) {
    try { await db.update('contacts', ligne.contact_id, { archived_at: new Date().toISOString() }); }
    catch { /* L'archivage est un confort : son échec n'annule pas la suppression. */ }
  }
  toast('Fiche supprimée');
  apresSuppression?.();
}

// La corbeille d'une ligne. Elle s'affiche partout, et son infobulle ne dit
// plus d'où vient la fiche : depuis le 25/09/2026 le geste est le même pour
// les deux populations, et distinguer deux cas identiques à l'usage ne sert
// qu'à faire hésiter.
export const boutonSuppression = (ligne) =>
  `<button class="icon-btn" data-suppr="${esc(ligne.id)}" title="Supprimer cette fiche">🗑</button>`;
