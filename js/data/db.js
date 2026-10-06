// Couche données : un cache mémoire alimenté soit par le navigateur (mode démo),
// soit par Supabase (production). Les pages lisent le cache ; les écritures
// passent par l'adaptateur puis mettent le cache à jour.
import { CONFIG } from '../config.js';
import { SEED, SEED_USERS } from './seed.js';
import { estUnRendezVousRgd } from './schema.js';
import { SEED_SITE, deplierSite } from './seed-site.js';

export const TABLES = ['profiles', 'organisations', 'contacts', 'deals', 'activities', 'events', 'settings',
  // module Patrimoine
  'properties', 'units', 'loans', 'leases', 'rent_payments', 'expenses',
  // module Vivier courtiers
  'broker_profiles',
  // documents (pièces jointes)
  'documents',
  // espace BTP Expertise : référentiels internes
  'dtu_sheets', 'mail_templates',
  // chiffres poussés par les outils externes (tableau de bord RGD Renova)
  'structure_stats',
  // réseau de chargés d'affaires de BTP Expertise
  'btp_charges_affaires',
  // vivier Experts & AMO de BTP Expertise (recrutement de l'équipe terrain)
  'btp_vivier', 'btp_vivier_evenements',
  // Atlas visuel des pathologies : l'index des 50 fiches et les 12 signaux
  // d'alerte. ⚠ Le CONTENU n'est pas dans le dépôt — produit sous licence,
  // importé à la main ; les planches vivent dans le seau PRIVÉ `btp-atlas`.
  'btp_atlas_fiches', 'btp_signaux_alerte', 'btp_visites_guidees',
  // La check-list de visite : le REFERENTIEL (zones et points, le meme pour
  // tous) et le RELEVE (ce qui a ete constate chez un client, ce jour-la).
  // ⚠ Les deux ne se melangent pas : corriger un libelle de point ne doit
  // jamais reecrire un constat d'expert.
  'btp_checklist_zones', 'btp_checklist_points',
  'btp_releves', 'btp_releve_reponses',
  // Le RAPPORT de visite. ⚠ Il ne recopie AUCUN désordre : ses lignes pointent
  // les réponses du relève et n'ajoutent que ce que la check-list ne pouvait pas
  // savoir — la priorité, la préconisation, la fiche retenue. Deux copies
  // auraient divergé dès la première correction, et c'est le document SIGNÉ qui
  // aurait fini par mentir.
  'btp_rapports', 'btp_rapport_lignes',
  // Le suivi d'une mission AMO. ⚠ Il se rattache a l'AFFAIRE et non a une
  // visite : une mission est une duree de plusieurs mois, pas un moment. Son
  // referentiel (38 points, 6 phases) vit dans le depot du front et non en
  // base — il est ecrit pour le cabinet, rien a proteger.
  'btp_amo_suivi',
  // espace RGD Renova : le relevé déposé toutes les 30 min par son worker.
  // Cloudflare D1 reste la source ; ces tables en sont le reflet, personne
  // n'y écrit depuis le CRM tant que la migration n'est pas terminée.
  'rgd_chantiers', 'rgd_devis', 'rgd_paiements', 'rgd_demandes',
  'rgd_sous_traitants', 'rgd_missions', 'rgd_st_paiements', 'rgd_st_commissions',
  // ⚠ `rgd_st_pieces` n'est PAS un reflet : c'est du Supabase pur, écrit par le
  // CRM et par personne d'autre. Le relevé ne l'envoie pas et ne l'écrasera pas.
  'rgd_st_pieces',
  // ⚠ `rgd_apports` non plus n'est pas un reflet : les apports d'affaires d'un
  // partenaire se saisissent dans le CRM, et depuis le 25/09/2026 `rgd_apporteurs`
  // a rejoint ce cas — le relevé ignore désormais sa charge.
  // ⚠ `dtu_revisions` est le JOURNAL de la veille DTU : une ligne par réécriture
  // automatique, avec le contenu précédent. C'est lui qui rend la publication
  // sans relecture réversible — sans lui, une mauvaise passe effacerait un
  // travail de rédaction qui n'existe nulle part ailleurs.
  'dtu_revisions',
  'rgd_apports',
  // ⚠ `rgd_apports_sortants` est le SENS INVERSE : les affaires que RGD
  // apporte à un partenaire. Saisie dans le CRM elle aussi, et jamais relevée.
  'rgd_apports_sortants',
  'rgd_apporteurs', 'rgd_fournitures', 'rgd_realisations', 'rgd_carrousel',
  // ⚠ `rgd_corbeille` est la seule table du CRM qui porte des lignes MORTES :
  // le contenu des fiches supprimées, pour pouvoir les remettre. Sa policy ne
  // la rend qu'à la direction, donc un chargé d'affaires la charge vide.
  'rgd_corbeille',
  'rgd_reglages', 'rgd_clients', 'rgd_costructor_etat',
  'rgd_costructor_journal', 'rgd_costructor_ignores',
  // messagerie interne (canaux par structure + conversations privées)
  'conversations', 'conversation_members', 'messages', 'message_reads',
  // agenda du groupe : le reflet des rendez-vous Google, recopié par la direction
  'agenda_events',
  // ⚠ QUEL AGENDA GOOGLE APPARTIENT À QUI. Lecture seule pour tout le monde
  // (`select` accordé à `authenticated`, aucune policy d'écriture) : seule la
  // fonction qui crée réellement le calendrier y écrit, en `service_role`.
  // Sans elle, `scope.voitAgenda` ne saurait rien et l'agenda resterait
  // commun à la structure. Une table absente ne casse rien : `load` se
  // contente d'un avertissement et `db.t` rend un tableau vide.
  'agendas_personnels'];
const LS_FILES = 'crm_local_files';
const LS_KEY = 'crm_local_v1';
const LS_USER = 'crm_local_user';
const LS_SITE = 'crm_local_site_v1';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

// ⚠ DOUBLE DE `rgd_chantier_traduction` EN BASE, pour le mode démo. Les dix
// statuts de chantier vers l'étape et le statut de l'affaire. La traduction
// est LOSSY — `relance_1` et `relance_2` donnent la même étape —, c'est
// précisément pourquoi `rgd_chantiers.statut_d1` porte le brut à côté.
const TRADUCTION_CHANTIER = {
  en_preparation:   { etape: 'lead',          statut: 'open' },
  visite_technique: { etape: 'visite',        statut: 'open' },
  devis_en_cours:   { etape: 'devis_encours', statut: 'open' },
  devis_presente:   { etape: 'devis_envoye',  statut: 'open' },
  relance_1:        { etape: 'nego',          statut: 'open' },
  relance_2:        { etape: 'nego',          statut: 'open' },
  devis_signe:      { etape: 'nego',          statut: 'won'  },
  demarrage:        { etape: 'nego',          statut: 'won'  },
  en_cours:         { etape: 'nego',          statut: 'won'  },
  termine:          { etape: 'nego',          statut: 'won'  },
};

// Les tables qui ne sont pas clées sur `id`.
//
// C'était un ternaire (`table === 'settings' ? 'key' : 'id'`), ce qui allait
// tant qu'il n'y avait qu'une exception. `rgd_reglages` est la deuxième — clée
// sur `cle` — et une troisième viendra avec la suite de la bascule. Une carte
// se lit ; un ternaire imbriqué se relit trois fois.
//
// ⚠ Les DEUX adaptateurs la lisent. Les faire diverger donnerait un mode démo
// qui marche là où la production échoue, ou l'inverse — et ce genre d'écart ne
// se voit qu'en production.
//
// Déclarée AVANT les deux adaptateurs, et pas entre eux : un `const` utilisé
// plus haut que sa déclaration marche tant que l'usage est dans une fonction,
// et casse le jour où quelqu'un le sort de la fonction. Autant ne pas laisser
// le piège en place.
const CLE_PRIMAIRE = {
  settings: 'key',
  rgd_reglages: 'cle',
};

// ---------- Adaptateur local (démo) ----------
// Les tables dont une ligne suffit a retenir une affaire. Memes noms, meme ordre
// que dans la fonction SQL.
const PORTEURS_AFFAIRE = [
  'rgd_devis', 'rgd_paiements', 'rgd_fournitures', 'rgd_missions',
  'rgd_st_paiements', 'rgd_st_commissions', 'henrri_documents',
];

// Celles qui comptent dans « autres » quand on dit ce qui restera sans fiche :
// les mêmes, moins les devis et les paiements, qui sont nommés à part parce
// qu'ils portent de l'argent qu'on lit dans les totaux.
const PORTEURS_AUTRES = [
  'rgd_fournitures', 'rgd_missions', 'rgd_st_paiements',
  'rgd_st_commissions', 'henrri_documents',
];

const localAdapter = {
  name: 'local',
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(LS_KEY)); } catch { this.data = null; }
    if (!this.data) {
      this.data = { profiles: structuredClone(SEED_USERS), ...structuredClone(SEED) };
      this.save();
    } else {
      // Nouvelles tables ajoutées après une première utilisation : on complète avec l'exemple
      let changed = false;
      for (const t of TABLES) if (!this.data[t]) { this.data[t] = structuredClone(SEED[t] || []); changed = true; }
      for (const u of this.data.profiles) { const su = SEED_USERS.find(x => x.id === u.id); if (su && u.patrimony_access === undefined) { u.patrimony_access = su.patrimony_access; changed = true; } }
      if (changed) this.save();
    }
    return structuredClone(this.data);
  },
  save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch { /* quota */ } },
  async insert(table, row) {
    const r = { ...row, id: row.id || uid(), created_at: row.created_at || new Date().toISOString() };
    this.data[table].push(r); this.save(); return structuredClone(r);
  },
  async update(table, id, patch) {
    const col = CLE_PRIMAIRE[table] || 'id';
    const i = this.data[table].findIndex(r => r[col] === id);
    if (i < 0) throw new Error('Introuvable');
    this.data[table][i] = { ...this.data[table][i], ...patch, updated_at: new Date().toISOString() };
    this.save(); return structuredClone(this.data[table][i]);
  },
  async remove(table, id) {
    const col = CLE_PRIMAIRE[table] || 'id';
    this.data[table] = this.data[table].filter(r => r[col] !== id); this.save();
  },
  reset() {
    localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_FILES); localStorage.removeItem(LS_SITE);
  },

  // Les deux documents du site RGD Renova (réalisations, carrousel), rangés à
  // part de `crm_local_v1` : ce ne sont pas des tables, et les mêler au cache
  // des tables les ferait recharger comme telles.
  docsSite() {
    try { const d = JSON.parse(localStorage.getItem(LS_SITE)); if (d) return d; } catch { /* illisible */ }
    return structuredClone(SEED_SITE);
  },
  ecrireDocsSite(d) { try { localStorage.setItem(LS_SITE, JSON.stringify(d)); } catch { /* quota */ } },

  // ⚠ MODE DÉMO : LES FONCTIONS DE LA BASE SONT REJOUÉES ICI, PAS IGNORÉES.
  // Celles qui reçoivent des données de l'extérieur (`push_agenda`,
  // `push_structure_stats`) n'ont rien à faire dans le navigateur et restent
  // inconnues. Mais les trois du SITE sont appelées PAR UN ÉCRAN : sans elles,
  // l'atelier des réalisations — le seul endroit du CRM dont l'écriture sort
  // vers le public — ne pouvait s'essayer qu'en production, sur le site d'une
  // entreprise en activité. On rejoue donc leur effet : même document remplacé
  // en entier, même unique niveau de retour arrière, même dépliage du reflet.
  async rpc(nom, args = {}) {
    const cle = args.p_cle;
    if (nom === 'rgd_lire_site' || nom === 'rgd_publier_site' || nom === 'rgd_restaurer_site') {
      if (cle !== 'realisations' && cle !== 'carrousel' && cle !== 'prestations') {
        throw new Error('document inconnu : ' + cle);
      }
      const docs = this.docsSite();
      if (nom === 'rgd_lire_site') return structuredClone(docs[cle]);

      if (nom === 'rgd_publier_site') {
        docs[cle + '_precedent'] = docs[cle];
        docs[cle] = structuredClone(args.p_doc);
      } else {
        const prec = docs[cle + '_precedent'];
        if (!prec) return { ok: false, error: 'aucune version précédente' };
        docs[cle + '_precedent'] = docs[cle];
        docs[cle] = prec;
      }
      this.ecrireDocsSite(docs);
      // Le dépliage dans le MÊME geste que l'écriture, comme la RPC : l'écran
      // recharge la table juste après et doit y trouver la nouvelle version.
      // Garde-fou identique : un document vide ne vide pas le reflet.
      // ⚠ LE DÉPLIAGE REND DEUX TABLES DEPUIS LE 01/10/2026, comme la RPC :
      // `rgd_categories` n'avait aucun écrivain et gardait l'instantané de sa
      // création — une catégorie renommée dans le CRM restait à son ancien nom
      // sur le site. Côté carrousel, rien n'a changé : une seule liste.
      // ⚠ LES PRESTATIONS N'ONT PAS DE REFLET À REMPLIR : rien à déplier, et
      // c'est aussi vrai côté base. Le document est servi tel quel au site.
      if (cle === 'prestations') return { ok: true, cle };
      if (cle === 'carrousel') {
        const images = deplierSite(cle, docs[cle]);
        if (images.length) { this.data.rgd_carrousel = images; this.save(); }
        return { ok: true, cle };
      }
      const { realisations, categories } = deplierSite(cle, docs[cle]);
      // Garde-fou identique au SQL : un document vide ne vide pas le reflet,
      // et c'est le NOMBRE DE CATÉGORIES qui le décide, là-bas comme ici.
      if (categories.length) {
        this.data.rgd_realisations = realisations;
        this.data.rgd_categories = categories;
        this.save();
      }
      return { ok: true, cle };
    }

    // ── Les chantiers, depuis le 25/09/2026 ───────────────────────────────
    // ⚠ CE SONT DES DOUBLES DU SQL, comme `deplierSite` : si
    // `rgd_chantier_statut` ou `rgd_chantier_creer` changent en base, il faut
    // les changer ici aussi, sinon la démo montre autre chose que la
    // production. Les deux sont écrits pour se ressembler ligne à ligne.
    if (nom === 'rgd_chantier_statut') {
      const trad = TRADUCTION_CHANTIER[args.p_statut];
      if (!trad) throw new Error('statut de chantier inconnu : ' + args.p_statut);
      const c = (this.data.rgd_chantiers || []).find(x => x.id === args.p_id);
      if (!c) return { ok: false, error: 'chantier introuvable' };

      c.statut_d1 = args.p_statut;
      // Symétrique : posée au premier passage à « terminé », retirée à la
      // descente — sans quoi un chantier rouvert resterait hors des
      // « chantiers en cours » pour toujours.
      c.date_passage_termine = args.p_statut === 'termine'
        ? (c.date_passage_termine || new Date().toISOString()) : null;
      c.updated_at = new Date().toISOString();

      const d = (this.data.deals || []).find(x => x.id === c.deal_id);
      if (d) {
        d.stage = trad.etape;
        d.status = trad.statut;
        d.won_at = trad.statut === 'won' ? (d.won_at || new Date().toISOString()) : null;
        d.updated_at = c.updated_at;
      }
      // La propagation vers `statut_suivi` n'est pas rejouée : elle est gardée
      // par `apporteur_id`, nul partout, donc inerte des deux côtés.
      this.save();
      return { ok: true, statut: args.p_statut, etape: trad.etape,
        statut_affaire: trad.statut, notifier: false };
    }

    if (nom === 'rgd_chantier_creer') {
      const trad = TRADUCTION_CHANTIER[args.p_statut || 'en_preparation'];
      if (!trad) throw new Error('statut de chantier inconnu : ' + args.p_statut);
      if (!args.p_contact || !String(args.p_nom || '').trim()) {
        throw new Error('le client et le nom du chantier sont obligatoires');
      }
      const nom_ = String(args.p_nom).trim();
      const fiche = (this.data.rgd_clients || []).find(x => x.contact_id === args.p_contact);
      // ⚠ L'AFFAIRE PUIS LE CHANTIER, jamais l'inverse : `deal_id` est
      // obligatoire, et une affaire sans son chantier n'apparaît nulle part.
      const deal = {
        id: uid(), title: nom_, activity: 'rgd', stage: trad.etape,
        status: trad.statut, contact_id: args.p_contact,
        organisation_id: fiche?.organisation_id || null, channel: 'En direct',
        amount: args.p_montant_ht ?? null,
        fields: { ne_ici: true }, created_at: new Date().toISOString(),
      };
      const chantier = {
        id: uid(), deal_id: deal.id, contact_id: args.p_contact, reference: nom_,
        adresse: args.p_adresse || null, code_postal: args.p_code_postal || null,
        ville: args.p_ville || null, description: args.p_description || null,
        statut_d1: args.p_statut || 'en_preparation',
        montant_ht: args.p_montant_ht ?? null,
        date_debut_prevue: args.p_date_debut_prevue || null,
        created_at: deal.created_at, updated_at: deal.created_at,
      };
      (this.data.deals ||= []).push(deal);
      (this.data.rgd_chantiers ||= []).push(chantier);
      this.save();
      return { ok: true, id: chantier.id, deal_id: deal.id };
    }

    // ── La visite posée depuis la fiche projet, depuis le 01/10/2026 ──────
    // ⚠ DOUBLE DU SQL `rgd_visite_planifiee`, même règle que ci-dessus. Sans
    // lui, prendre un rendez-vous depuis la fiche n'était essayable que sur
    // la production, c'est-à-dire sur l'agenda d'une entreprise en activité.
    // ⚠ IDEMPOTENTE comme elle : `source_event_id` porte un index UNIQUE en
    // base, et un second appel y échouerait après que Google a déjà créé le
    // rendez-vous. Ici on rend le chantier existant, exactement pareil.
    if (nom === 'rgd_visite_planifiee') {
      if (!String(args.p_event_id || '').trim()) throw new Error('identifiant de rendez-vous requis');
      if (!args.p_jour) throw new Error('jour du rendez-vous requis');
      if (!args.p_contact && !args.p_organisation) {
        throw new Error('un contact ou une organisation est requis');
      }
      const deja = (this.data.rgd_chantiers || [])
        .find(c => c.source_event_id === args.p_event_id);
      if (deja) return { ok: true, chantier: deja.id, deja: true };

      const quand = new Date().toISOString();
      const titre = String(args.p_titre || '').trim() || 'Visite technique';
      const deal = {
        id: uid(), title: titre, activity: 'rgd', stage: 'visite', status: 'open',
        contact_id: args.p_contact || null, organisation_id: args.p_organisation || null,
        channel: 'En direct',
        fields: { google_event_id: args.p_event_id, ne_ici: true },
        created_at: quand,
      };
      const chantier = {
        id: uid(), deal_id: deal.id,
        contact_id: args.p_contact || null, organisation_id: args.p_organisation || null,
        source_event_id: args.p_event_id, statut_d1: 'visite_technique',
        reference: `VT-${String(args.p_jour).slice(0, 4)}-${String(args.p_event_id).slice(0, 8)}`,
        adresse: args.p_adresse || null, code_postal: args.p_code_postal || null,
        ville: args.p_ville || null, description: args.p_description || null,
        date_debut_prevue: args.p_jour,
        created_at: quand, updated_at: quand,
      };
      (this.data.deals ||= []).push(deal);
      (this.data.rgd_chantiers ||= []).push(chantier);
      this.save();
      return { ok: true, chantier: chantier.id, affaire: deal.id, deja: false };
    }

    // ── Les devis, depuis le 25/09/2026 ───────────────────────────────────
    // ⚠ DOUBLE DU SQL, comme ci-dessus et comme `deplierSite` : si
    // `rgd_devis_signer` change en base, il change ici aussi. Le recalcul de
    // l'état du chantier n'est PAS rejoué — il se déduit des devis et des
    // factures, et la démo n'en sème pas assez pour que le résultat veuille
    // dire quelque chose ; ce qui se vérifie ici, c'est le statut et la date.
    if (nom === 'rgd_devis_signer') {
      const d = (this.data.rgd_devis || []).find(x => x.id === args.p_id);
      if (!d) return { ok: false, error: 'devis introuvable' };
      const ancien = d.statut;
      d.statut = 'signe';
      // `coalesce` : on date la PREMIÈRE signature, pas le dernier clic.
      d.date_signature = d.date_signature || new Date().toISOString().slice(0, 10);
      d.updated_at = new Date().toISOString();
      this.save();
      return { ok: true, id: d.id, ancien_statut: ancien, date_signature: d.date_signature };
    }

    // ── Supprimer une fiche, et la garder dans la corbeille ───────────────
    // ⚠ DOUBLE DU SQL de `rgd_supprimer_fiche`, même règle que les trois
    // ci-dessus : si les bornes bougent en base, elles bougent ici aussi.
    //
    // ⚠ LA PIERRE TOMBALE EST REJOUÉE ALORS QUE LA DÉMO N'A AUCUN RELEVÉ,
    // et ce n'est pas du zèle : c'est la seule partie du geste qu'on puisse
    // éprouver avant la production. En l'omettant, la démo montrerait une
    // suppression qui marche là où la vraie ferait revenir la fiche une
    // demi-heure plus tard.
    //
    // ⚠ ET LE RÔLE EST VÉRIFIÉ ICI AUSSI : sans ça la démo laisserait un
    // chargé d'affaires supprimer, c'est-à-dire qu'elle montrerait l'absence
    // d'un cloisonnement qui existe. Le pire des deux mondes pour une
    // démonstration.
    if (nom === 'rgd_supprimer_fiche') {
      if (this.monRole() !== 'direction') {
        throw new Error("la suppression d'une fiche est réservée à la direction");
      }
      if (!['clients', 'demandes'].includes(args.p_source)) {
        throw new Error('source inconnue : ' + args.p_source);
      }
      const table = 'rgd_' + args.p_source;
      const lignes = this.data[table] || [];
      const i = lignes.findIndex(x => x.id === args.p_id);
      if (i < 0) return { ok: false, error: 'fiche introuvable' };

      // On lit TOUT avant de toucher à quoi que ce soit : après, ni le contenu
      // ni le lien vers le contact n'existent plus. Même ordre que le SQL.
      const fiche = { ...lignes[i] };
      const contact = fiche.contact_id ?? null;
      const d1 = fiche.d1_id ?? null;
      const c = contact ? (this.data.contacts || []).find(x => x.id === contact) : null;
      const nomFiche = [c?.first_name, c?.last_name].filter(Boolean).join(' ')
        || c?.email || 'fiche sans nom';

      const siennes = (this.data.deals || []).filter(d => d.contact_id === contact);
      const ids = new Set(siennes.map(d => d.id));
      const parAffaire = (n) => (this.data[n] || []).filter(x => ids.has(x.deal_id)).length;
      const devis = (this.data.rgd_devis || [])
        .filter(x => x.contact_id === contact || ids.has(x.deal_id)).length;
      const paiements = parAffaire('rgd_paiements');
      const chantiers = (this.data.rgd_chantiers || [])
        .filter(x => ids.has(x.deal_id) && !estUnRendezVousRgd(x)).length;
      const autres = PORTEURS_AUTRES.reduce((n, nom2) => n + parAffaire(nom2), 0);
      const pend = devis + paiements + chantiers + autres;
      const orphelins = { devis, paiements, chantiers, autres };

      // ⚠ LE REFUS REND UN OBJET, IL NE LÈVE PAS D'ERREUR : l'écran doit
      // pouvoir NOMMER ce qui bloque et proposer de forcer.
      if (!args.p_forcer && pend > 0) {
        return { ok: false, motif: 'rattachements', ...orphelins };
      }

      // Les affaires qui ne portent QUE le rendez-vous. Trois bornes, les
      // mêmes qu'en base : chez RGD, sans montant à elles, et qui portent
      // vraiment un rendez-vous.
      const reste = (this.data.rgd_clients || []).filter(x => x.contact_id === contact && x.id !== args.p_id).length
        + (this.data.rgd_demandes || []).filter(x => x.contact_id === contact && x.id !== args.p_id).length;
      let vides = [];
      if (contact != null && reste === 0) {
        const porte = (id) => PORTEURS_AFFAIRE.some(
          (n) => (this.data[n] || []).some(x => x.deal_id === id))
          || (this.data.rgd_chantiers || []).some(
            x => x.deal_id === id && !estUnRendezVousRgd(x));
        const porteUnRdv = (id) => (this.data.rgd_chantiers || []).some(x => x.deal_id === id);
        vides = siennes
          .filter(d => d.activity === 'rgd' && !(d.amount || 0)
            && porteUnRdv(d.id) && !porte(d.id))
          .map(d => d.id);
      }

      const affairesGardees = (this.data.deals || []).filter(d => vides.includes(d.id));
      const chantiersGardes = (this.data.rgd_chantiers || []).filter(x => vides.includes(x.deal_id));

      // Le contact : archivé seulement s'il ne lui reste aucune fiche, et
      // seulement s'il ne l'était pas déjà. La corbeille garde la réponse,
      // sinon restaurer sortirait des archives une fiche rangée exprès.
      let archive = false;
      if (c && reste === 0 && !c.archived_at) {
        c.archived_at = new Date().toISOString();
        archive = true;
      }

      const ligneCorbeille = {
        id: uid(), source: args.p_source, fiche_id: args.p_id, contact_id: contact,
        nom: nomFiche, fiche, affaires: affairesGardees.map(d => ({ ...d })),
        chantiers: chantiersGardes.map(x => ({ ...x })), orphelins,
        forcee: !!args.p_forcer && pend > 0, contact_archive: archive,
        supprime_le: new Date().toISOString(), par: this.moi()?.id || null,
        restauree_le: null, restauree_par: null,
      };
      this.data.rgd_corbeille = this.data.rgd_corbeille || [];
      this.data.rgd_corbeille.push(ligneCorbeille);

      lignes.splice(i, 1);

      if (d1 != null) {
        this.data.rgd_suppressions = this.data.rgd_suppressions || [];
        const dejaLa = this.data.rgd_suppressions
          .some(x => x.source === args.p_source && x.d1_id === d1);
        if (!dejaLa) {
          this.data.rgd_suppressions.push({
            source: args.p_source, d1_id: d1, supprime_le: new Date().toISOString(), par: null,
          });
        }
      }

      if (vides.length) {
        // ⚠ LA DÉMO N'A AUCUNE CASCADE : le chantier du rendez-vous resterait
        // derrière son affaire, et l'onglet « RDV » le lirait encore.
        this.data.rgd_chantiers = (this.data.rgd_chantiers || [])
          .filter(x => !vides.includes(x.deal_id));
        this.data.deals = (this.data.deals || []).filter(d => !vides.includes(d.id));
      }

      this.save();
      return { ok: true, d1_id: d1, marquee: d1 != null,
        affaires_retirees: vides.length, corbeille: ligneCorbeille.id,
        contact_archive: archive, orphelins };
    }

    // ── Remettre une fiche prise dans la corbeille ────────────────────────
    // ⚠ DOUBLE DE `rgd_restaurer_fiche`. Elle remet la fiche, ses affaires et
    // leurs chantiers, retire la pierre tombale et désarchive le contact — mais
    // SEULEMENT si c'est la suppression qui l'avait archivé.
    if (nom === 'rgd_restaurer_fiche') {
      if (this.monRole() !== 'direction') {
        throw new Error("la restauration d'une fiche est réservée à la direction");
      }
      const r = (this.data.rgd_corbeille || []).find(x => x.id === args.p_corbeille);
      if (!r) return { ok: false, error: 'ligne de corbeille introuvable' };
      if (r.restauree_le) return { ok: false, error: 'cette fiche a déjà été restaurée' };

      const table = 'rgd_' + r.source;
      this.data[table] = this.data[table] || [];
      if (this.data[table].some(x => x.id === r.fiche_id)) {
        return { ok: false, error: 'une fiche porte déjà cet identifiant' };
      }
      this.data[table].push({ ...r.fiche });

      // L'affaire d'abord, le chantier ensuite : `deal_id` pointe sur elle.
      this.data.deals = this.data.deals || [];
      (r.affaires || []).forEach(d => {
        if (!this.data.deals.some(x => x.id === d.id)) this.data.deals.push({ ...d });
      });
      this.data.rgd_chantiers = this.data.rgd_chantiers || [];
      (r.chantiers || []).forEach(x => {
        if (!this.data.rgd_chantiers.some(y => y.id === x.id)) this.data.rgd_chantiers.push({ ...x });
      });

      if (r.contact_archive && r.contact_id) {
        const ct = (this.data.contacts || []).find(x => x.id === r.contact_id);
        if (ct) ct.archived_at = null;
      }

      const d1 = r.fiche?.d1_id ?? null;
      if (d1 != null) {
        this.data.rgd_suppressions = (this.data.rgd_suppressions || [])
          .filter(x => !(x.source === r.source && x.d1_id === d1));
      }

      r.restauree_le = new Date().toISOString();
      r.restauree_par = this.moi()?.id || null;
      this.save();
      return { ok: true, fiche_id: r.fiche_id, source: r.source,
        affaires: (r.affaires || []).length, chantiers: (r.chantiers || []).length,
        contact_desarchive: !!r.contact_archive };
    }

    throw new Error('Fonction inconnue en mode démo : ' + nom);
  },
  // fichiers (démo) : conservés dans le navigateur en base64, petits fichiers uniquement
  files() { try { return JSON.parse(localStorage.getItem(LS_FILES)) || {}; } catch { return {}; } },
  // En démo il n'y a pas de bucket : la photo devient son propre contenu. Une
  // adresse `data:` s'affiche dans une vignette exactement comme une autre, ce
  // qui permet d'éprouver l'atelier sans rien déposer nulle part.
  async deposerPhotoPublique(chemin, fichier) {
    if (fichier.size > 3 * 1048576) throw new Error('En mode démo, 3 Mo max par photo (sans limite en production)');
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result)); r.onerror = rej;
      r.readAsDataURL(fichier);
    });
  },
  // Le seau fait partie de la clé : deux seaux peuvent porter le même chemin,
  // et les confondre ici ferait passer la démo là où la production échoue.
  async uploadFile(path, file, { bucket = 'documents', upsert = false } = {}) {
    if (file.size > 3 * 1048576) throw new Error('En mode démo, 3 Mo max par fichier (sans limite en production)');
    const cle = `${bucket}/${path}`;
    const all = this.files();
    if (all[cle] && !upsert) throw new Error('Un fichier porte déjà ce nom');
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    all[cle] = dataUrl;
    try { localStorage.setItem(LS_FILES, JSON.stringify(all)); } catch { throw new Error('Espace du navigateur saturé (mode démo)'); }
  },
  async fileUrl(path, { bucket = 'documents' } = {}) { const u = this.files()[`${bucket}/${path}`]; if (!u) throw new Error('Fichier introuvable'); return u; },
  async deleteFile(path, { bucket = 'documents' } = {}) { const all = this.files(); delete all[`${bucket}/${path}`]; localStorage.setItem(LS_FILES, JSON.stringify(all)); },
  // auth
  async currentUser() { const id = localStorage.getItem(LS_USER); return this.data.profiles.find(u => u.id === id) || null; },
  // Qui regarde, en démo — lu de la même façon que `currentUser`, mais sans
  // attendre : les doubles des fonctions de base sont synchrones, et deux
  // d'entre eux ont besoin du rôle pour refuser ce que la base refuse.
  moi() { const id = localStorage.getItem(LS_USER); return (this.data.profiles || []).find(u => u.id === id) || null; },
  monRole() { return this.moi()?.role || null; },
  async signIn(userId) { localStorage.setItem(LS_USER, userId); return this.data.profiles.find(u => u.id === userId); },
  async signOut() { localStorage.removeItem(LS_USER); },
  async resetPassword() { throw new Error('Pas de mot de passe en mode démo'); },
  async updatePassword() { throw new Error('Pas de mot de passe en mode démo'); },
  isRecovery() { return false; },
  // Pas de session en mode démo : un appel qui l'exige doit le voir tout de suite.
  async accessToken() { return null; },
};

// ---------- Adaptateur Supabase ----------
const supabaseAdapter = {
  name: 'supabase',
  client: null,
  async connect() {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    this.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  },
  // `tables` sert à ne recharger qu'une partie du cache : la messagerie se
  // rafraîchit toutes les quelques secondes, il serait absurde de retélécharger
  // les loyers et le patrimoine à chaque fois.
  async load(tables = TABLES) {
    const out = {};
    const PAGE = 1000; // Supabase limite chaque requête à 1 000 lignes : on pagine
    for (const t of tables) {
      const rows = []; let from = 0; let failed = false;
      while (true) {
        const { data, error } = await this.client.from(t).select('*').range(from, from + PAGE - 1);
        if (error) { console.warn(`Table ${t} : ${error.message}`); failed = true; break; } // table absente (module non installé) : on continue
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      out[t] = failed ? [] : rows;
    }
    // Gestion locative sans accès patrimoine : les biens viennent d'une vue allégée (sans prix ni financement)
    if (out.properties && !out.properties.length) { const { data } = await this.client.from('v_properties_rental').select('*'); if (data?.length) out.properties = data; }
    return out;
  },
  async insert(table, row) {
    const { data, error } = await this.client.from(table).insert(row).select().single();
    if (error) throw new Error(error.message); return data;
  },
  async update(table, id, patch) {
    const col = CLE_PRIMAIRE[table] || 'id';
    const { data, error } = await this.client.from(table).update(patch).eq(col, id).select().single();
    if (error) throw new Error(error.message); return data;
  },
  async remove(table, id) {
    const { error } = await this.client.from(table).delete().eq(CLE_PRIMAIRE[table] || 'id', id);
    if (error) throw new Error(error.message);
  },
  async rpc(nom, args) {
    const { data, error } = await this.client.rpc(nom, args);
    if (error) throw new Error(error.message); return data;
  },
  async currentUser() {
    const { data: { session } } = await this.client.auth.getSession();
    if (!session) return null;
    const { data } = await this.client.from('profiles').select('*').eq('id', session.user.id).single();
    return data ? { ...data, email: session.user.email } : null;
  },
  async signIn(email, password) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return this.currentUser();
  },
  async signOut() { await this.client.auth.signOut(); },
  // Le jeton de la session, pour les appels qui sortent du client Supabase —
  // aujourd'hui l'Edge Function `henrri-amo`, qui s'en sert pour vérifier les
  // droits côté serveur. Il passe par la façade : le client lui-même n'est PAS
  // exposé hors de ce fichier, sinon chaque page finirait par requêter à côté
  // du cache et de la pagination.
  async accessToken() {
    const { data } = await this.client.auth.getSession();
    return data?.session?.access_token || null;
  },
  async resetPassword(email) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    if (error) throw new Error(error.message);
  },
  async updatePassword(password) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },
  isRecovery() { return /type=recovery/.test(location.hash) || /type=recovery/.test(location.search); },
  // fichiers : seaux privés, accès par lien signé (1 h). « documents » est le
  // seau par défaut — celui des pièces jointes de fiches ; « sous-traitants »
  // porte les attestations, avec ses propres policies.
  async uploadFile(path, file, { bucket = 'documents', upsert = false } = {}) {
    const { error } = await this.client.storage.from(bucket).upload(path, file, { upsert, contentType: file.type || undefined });
    if (error) throw new Error(error.message);
  },
  async fileUrl(path, { bucket = 'documents' } = {}) {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw new Error(error.message); return data.signedUrl;
  },
  async deleteFile(path, { bucket = 'documents' } = {}) {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) throw new Error(error.message);
  },
  // ⚠ UN SECOND BUCKET, ET IL N'A RIEN À VOIR AVEC LE PREMIER.
  // « documents » est PRIVÉ : on en sort par un lien signé d'une heure.
  // « realisations » est PUBLIC, parce que ses photos s'affichent sur
  // rgdrenova.fr sans que personne ne soit connecté. Les confondre donnerait
  // soit des documents lisibles par tous, soit des photos que le site ne peut
  // pas afficher. D'où deux méthodes plutôt qu'un paramètre : un nom de bucket
  // qui se passe en argument finit par se tromper d'appelant.
  async deposerPhotoPublique(chemin, fichier) {
    const { error } = await this.client.storage.from('realisations')
      .upload(chemin, fichier, { upsert: false, contentType: fichier.type || undefined });
    if (error) throw new Error(error.message);
    const { data } = this.client.storage.from('realisations').getPublicUrl(chemin);
    return data.publicUrl;
  },
};

// ---------- Façade ----------
export const db = {
  adapter: null,
  cache: {},
  listeners: new Set(),
  get demo() { return CONFIG.DEMO; },

  async init() {
    this.adapter = CONFIG.DEMO ? localAdapter : supabaseAdapter;
    if (!CONFIG.DEMO) await this.adapter.connect();
    else this.adapter.load();
  },
  async loadAll() {
    this.cache = await this.adapter.load();
    for (const t of TABLES) this.cache[t] ||= [];
    this.emit();
  },
  // Recharge quelques tables seulement, sans toucher au reste du cache.
  // N'émet que si quelque chose a bougé : autrement un rafraîchissement
  // périodique redessinerait la page sous les doigts de l'utilisateur.
  async refresh(tables) {
    const out = await this.adapter.load(tables);
    let change = false;
    for (const t of tables) {
      const rows = out[t] || [];
      if (JSON.stringify(rows) !== JSON.stringify(this.cache[t] || [])) { this.cache[t] = rows; change = true; }
    }
    if (change) this.emit();
    return change;
  },
  t(table) { return this.cache[table] || []; },
  byId(table, id) { return this.t(table).find(r => r.id === id); },
  setting(key) { return this.t('settings').find(s => s.key === key)?.value; },

  async insert(table, row) {
    const r = await this.adapter.insert(table, row);
    this.cache[table].push(r); this.emit(); return r;
  },
  async update(table, id, patch) {
    const r = await this.adapter.update(table, id, patch);
    const i = this.cache[table].findIndex(x => (x.id ?? x.key) === id);
    if (i >= 0) this.cache[table][i] = r; else this.cache[table].push(r);
    this.emit(); return r;
  },
  async remove(table, id) {
    await this.adapter.remove(table, id);
    this.cache[table] = this.cache[table].filter(x => x.id !== id); this.emit();
  },
  // Appel d'une fonction côté base (ou son équivalent en mode démo). Le cache
  // n'est pas mis à jour tout seul : la table touchée est rechargée après coup.
  async rpc(nom, args) { return this.adapter.rpc(nom, args); },
  // Recharge une table après un appel de fonction. Passe par `refresh`, qui
  // pagine : un `select('*')` direct serait tronqué à 1 000 lignes sans le dire.
  async recharger(table) { return this.refresh([table]); },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } },

  // fichiers. `options` porte le seau (`bucket`) et le remplacement (`upsert`) :
  // les pièces jointes des fiches vivent dans « documents », les attestations
  // des sous-traitants dans « sous-traitants », qui n'a pas les mêmes droits.
  uploadFile(path, file, options) { return this.adapter.uploadFile(path, file, options); },
  deposerPhotoPublique(chemin, fichier) { return this.adapter.deposerPhotoPublique(chemin, fichier); },
  fileUrl(path, options) { return this.adapter.fileUrl(path, options); },
  deleteFile(path, options) { return this.adapter.deleteFile(path, options); },
  // auth
  currentUser() { return this.adapter.currentUser(); },
  signIn(a, b) { return this.adapter.signIn(a, b); },
  signOut() { return this.adapter.signOut(); },
  resetPassword(email) { return this.adapter.resetPassword(email); },
  updatePassword(pw) { return this.adapter.updatePassword(pw); },
  isRecovery() { return this.adapter.isRecovery(); },
  accessToken() { return this.adapter.accessToken(); },
  resetDemo() { if (this.demo) localAdapter.reset(); },
};
