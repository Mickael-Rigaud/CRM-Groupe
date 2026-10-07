// Droits côté client : ce que l'utilisateur connecté voit.
// (En production, les mêmes règles sont imposées côté serveur par les politiques RLS Supabase.)
import { db } from './db.js';

export const scope = {
  user: null,
  set(user) { this.user = user; },
  // Le role le moins dote par defaut : un profil incomplet ne doit jamais
  // se retrouver avec plus de droits qu'il n'en a.
  get role() { return this.user?.role || 'charge_affaires'; },
  get isDirection() { return this.role === 'direction'; },
  get canPatrimony() { return this.isDirection && this.user?.patrimony_access === true; },
  get canRental() { return this.canPatrimony || this.user?.rental_access === true; },
  // Supprimer definitivement une fiche : la direction, et elle seule. Un charge
  // d'affaires archive — il met de cote, il ne detruit pas. Miroir exact des
  // policies contacts_delete et orgs_delete (migration 20260918200000) : le
  // serveur refuse de toute facon, ceci evite d'offrir un bouton qui echouerait.
  get canSupprimerFiche() { return this.isDirection; },
  // Les chiffres de pilotage — objectifs de CA et de volume, chiffres consolidés
  // poussés par les outils des structures — ne regardent que la direction.
  // Miroir des policies settings_read et stats_read (migrations 20260921100000 et
  // 20260921100100) : en production le serveur ne les envoie déjà plus, ceci évite
  // d'afficher des cadres vides et garde le mode démo fidèle à la production.
  get canPilotage() { return this.isDirection; },
  get activityKeys() { return this.isDirection ? ['rgd', 'btp', 'courtage', 'propulsion'] : (this.user?.activities || []); },

  // Une affaire appartient à une structure autant qu'à une personne. Porter
  // l'affaire ne suffit donc pas : encore faut-il être de sa structure. Sans cette
  // condition, une affaire attribuée par erreur à quelqu'un d'une autre structure
  // entrerait dans ses totaux — invisible tant qu'il n'y a qu'un chargé d'affaires
  // par structure, gênant dès qu'il y en a plusieurs.
  // Miroir de can_see_deal (migration 20260921110000).
  canSeeDeal(d) {
    if (this.isDirection) return true;
    if (d.owner_id === this.user.id && this.activityKeys.includes(d.activity)) return true;
    if (this.role === 'propulsion') return d.activity === 'propulsion';
    return false;
  },
  canSeeContact(c) {
    if (this.isDirection) return true;
    if (c.owner_id === this.user.id) return true;
    if (this.role === 'propulsion' && (c.activities || []).includes('propulsion')) return true;
    return db.t('deals').some(d => d.contact_id === c.id && this.canSeeDeal(d));
  },
  canSeeOrg(o) {
    if (this.isDirection) return true;
    if (o.owner_id === this.user.id || o.account_manager_id === this.user.id) return true;
    if (this.role === 'propulsion' && (o.activities || []).includes('propulsion')) return true;
    return db.t('deals').some(d => d.organisation_id === o.id && this.canSeeDeal(d));
  },
  // Miroir de la policy activities_select. La direction n'a PLUS de passe-droit
  // ici : une tache rattachee a rien est un pense-bete, il n'appartient qu'a son
  // auteur et a la personne qui la porte. Une tache accrochee a une fiche reste
  // visible par qui voit la fiche — sinon la « prochaine action » des pipelines
  // disparaitrait pour tout le monde.
  canSeeActivity(a) {
    if (a.assignee_id === this.user.id) return true;
    if (a.created_by && a.created_by === this.user.id) return true;
    // Miroir de `can_see_activity` (06/10/2026) : une tâche partagée se voit.
    if (a.shared_with && a.shared_with === this.user.id) return true;
    if (a.deal_id) { const d = db.byId('deals', a.deal_id); return d ? this.canSeeDeal(d) : false; }
    if (a.contact_id) { const c = db.byId('contacts', a.contact_id); return c ? this.canSeeContact(c) : false; }
    if (a.organisation_id) { const o = db.byId('organisations', a.organisation_id); return o ? this.canSeeOrg(o) : false; }
    return false;
  },

  // Messagerie, cloisonnée par structure (miroir de la migration 20260918100050).
  //
  // Deux personnes ne peuvent se parler que si elles partagent au moins une
  // structure. La direction les porte toutes : elle joint tout le monde et
  // reste joignable par tout le monde. Soi-même compte toujours — le créateur
  // d'une conversation doit pouvoir s'y inscrire, même s'il n'a aucune
  // structure sur son profil.
  partageStructure(u) {
    if (!u || !this.user) return false;
    if (u.id === this.user.id) return true;
    if (this.isDirection || u.role === 'direction') return true;
    return (u.activities || []).some(a => this.activityKeys.includes(a));
  },

  // Un canal de structure se voit comme le reste de la structure (miroir de
  // has_activity côté serveur). Le canal « Groupe » n'a pas de structure : il
  // n'est plus ouvert à tous, sinon un commercial de RGD y lirait ce qu'écrit
  // un commercial de BTP. La direction le garde.
  // Une conversation privée demande d'y être nommément ET de partager une
  // structure avec chacun des autres participants.
  canSeeConversation(c) {
    if (!c) return false;
    if (c.kind === 'canal') return c.activity ? this.activityKeys.includes(c.activity) : this.isDirection;
    const membres = db.t('conversation_members').filter(m => m.conversation_id === c.id);
    if (!membres.some(m => m.user_id === this.user.id)) return false;
    return membres.every(m => m.user_id === this.user.id
      || this.partageStructure(db.byId('profiles', m.user_id)));
  },

  deals() { return db.t('deals').filter(d => this.canSeeDeal(d)); },
  conversations() { return db.t('conversations').filter(c => this.canSeeConversation(c)); },
  contacts() { return db.t('contacts').filter(c => this.canSeeContact(c)); },
  orgs() { return db.t('organisations').filter(o => this.canSeeOrg(o)); },
  activities() { return db.t('activities').filter(a => this.canSeeActivity(a)); },
  // Espace RGD Renova. Miroir exact des policies `rgd_*`.
  //
  // ⚠ APPARTENIR À RGD NE DONNE PLUS TOUT RGD (25/09/2026, demandé par
  // Mickael : « le chargé doit constituer à lui tout seul sa base de données
  // clients, partenaires et sous-traitants »). Les policies ne tiennent plus
  // en `has_activity('rgd')` : la structure ouvre la porte, le propriétaire
  // désigne les lignes. Migration `20260925170000_rgd_portefeuille_par_personne`.
  //
  // ⚠ POURQUOI LE FRONT REFAIT LE TRAVAIL DU SERVEUR. En vrai la RLS a déjà
  // filtré : `RGD_PORTEFEUILLE` ne retire alors plus rien, et c'est le signe
  // que les deux disent la même chose. Mais **le mode démo n'a pas de
  // serveur** — il lit un jeu inventé dans le navigateur. Sans cette règle
  // ici, la démonstration montrerait un cloisonnement qui n'existe pas, ou
  // pire l'absence d'un cloisonnement qui existe. Les deux doivent rester
  // cohérents : si une policy bouge là-bas, cette table bouge ici.
  //
  // ⚠ CES TABLES NE SONT PLUS TOUTES DES REFLETS (depuis le 22/09/2026).
  // La phase 2 les fait basculer une par une : celles que Supabase possède
  // s'écrivent EN DIRECT, celles qui restent un reflet du worker se lisent
  // seulement. `rgd_apporteurs` est la première à avoir basculé. Pour savoir
  // où en est une table, chercher `d1_id` : `not null` = encore un reflet,
  // nullable = Supabase fait foi.
  //
  // ⚠ `rgd_st_pieces` (24/09/2026) N'A AUCUN `d1_id` et n'en aura jamais :
  // elle n'est le reflet de rien. Les attestations des sous-traitants sont
  // nées dans le CRM, avec leurs fichiers dans le seau privé du même nom —
  // dont les quatre policies disent, elles aussi, `has_activity('rgd')`.
  //
  // ⚠ `rgd_suppressions` (25/09/2026) EST LA SEULE QUI N'A PAS SA PLACE ICI,
  // et c'est voulu. Elle ne porte pas des données mais des PIERRES TOMBALES —
  // le `d1_id` des fiches supprimées, que les portes de la synchronisation
  // consultent avant d'insérer, faute de quoi une fiche effacée reviendrait au
  // passage suivant. Aucun écran ne la lit, elle n'est donc pas chargée : la
  // mettre dans le cache ferait une requête de plus à chaque ouverture pour
  // une liste que personne n'affiche. Ses policies disent la même chose que
  // les autres (`has_activity('rgd')` en lecture ET en insertion), avec une
  // différence assumée : **ni UPDATE ni DELETE**. On ne retire pas une pierre
  // tombale — la retirer ressusciterait la fiche au relevé suivant.
  // Miroir de `has_activity('btp')`, qui garde les deux tables de l'atlas
  // (`btp_atlas_fiches`, `btp_signaux_alerte`) et le seau `btp-atlas`.
  get canBtp() { return this.activityKeys.includes('btp'); },
  get canRgd() { return this.activityKeys.includes('rgd'); },

  // ⚠ JETER N'EST PAS DÉTRUIRE, et la distinction date du 06/10/2026 (Élodie :
  // « les chargés d'affaires ne pourront pas supprimer définitivement mais ils
  // peuvent mettre dans la corbeille »). Elle revient sur sa propre règle du
  // matin — « la suppression n'est que pour les profils direction » — et la
  // précise : la corbeille n'existait pas quand celle-ci a été écrite. Jeter
  // est devenu un geste réparable, et un geste réparable n'a pas besoin
  // d'être verrouillé.
  //
  // ⚠ UNE FICHE SANS PROPRIÉTAIRE RESTE À LA DIRECTION : c'est le cas des
  // demandes venues du site, que la fonction d'entrée crée sans utilisateur.
  // Les ouvrir à tous reviendrait à dire qu'une fiche que personne ne porte
  // appartient à n'importe qui.
  //
  // Miroir EXACT du garde de `rgd_supprimer_fiche` (migration
  // `20261006133019`), qui refuse côté base — un bouton caché n'est pas un
  // droit retiré ; l'écran évite seulement d'offrir ce qui échouerait.
  peutJeterFicheRgd(fiche) {
    if (!this.canRgd) return false;
    if (this.isDirection) return true;
    return !!fiche?.owner_id && fiche.owner_id === this.user?.id;
  },

  // Détruire pour de bon la copie gardée : la direction, et elle seule.
  // Miroir de `rgd_purger_corbeille` (migration `20261006133118`).
  get canPurgerCorbeilleRgd() { return this.isDirection && this.canRgd; },

  // ⚠ `rgd_corbeille` (06/10/2026) GARDE LE CONTENU des fiches supprimées —
  // la ligne entière, l'affaire et le chantier emportés, qui a supprimé et
  // quand. C'est la pièce qui manquait pour qu'une erreur se répare :
  // `rgd_suppressions`, elle, ne porte qu'un identifiant et n'a jamais servi
  // qu'à empêcher une fiche de revenir. Sa policy ne la rend qu'à la direction ;
  // ce filtre dit la même chose, pour que le mode démo — qui n'a pas de
  // serveur — montre le même cloisonnement.
  rgdCorbeille() {
    if (!this.canRgd) return [];
    const lignes = db.t('rgd_corbeille');
    // ⚠ UN CHARGÉ D'AFFAIRES NE VOIT QUE CE QU'IL A JETÉ. La policy le dit
    // déjà côté base depuis le 06/10/2026 et ne lui envoie rien d'autre ;
    // ceci est pour le mode démo, qui n'a pas de serveur pour le dire.
    if (!this.isDirection) {
      return lignes.filter(x => x.fiche?.owner_id === this.user?.id);
    }
    // ⚠ ELLE SUIT LA VUE PAR CHARGÉ D'AFFAIRES, et c'est la cohérence qui
    // l'exige : regarder l'espace comme quelqu'un et y voir les fiches
    // supprimées d'un autre ferait mentir le bandeau. Le propriétaire se lit
    // dans la copie gardée — la fiche, elle, n'existe plus.
    const vue = this.vueRgd;
    if (!vue) return lignes;
    if (vue === 'direction') {
      return lignes.filter(x => !x.fiche?.owner_id || this.estDeLaDirection(x.fiche.owner_id));
    }
    return lignes.filter(x => x.fiche?.owner_id === vue);
  },

  // À quoi se reconnaît le propriétaire d'une ligne, table par table. Quatre
  // tables le portent elles-mêmes ; les autres le tiennent de ce dont elles
  // pendent — une affaire, un sous-traitant, un apporteur. Aucune ne porte
  // DEUX fois la réponse : c'est ce qui évite qu'un chantier et son affaire
  // finissent par désigner deux personnes différentes.
  //
  // Une table absente de cette table-ci reste commune à la structure : le
  // contenu du site, les réglages, la plomberie de la synchronisation. Là,
  // c'est l'ÉCRITURE qui est réservée à la direction, côté serveur — un chargé
  // d'affaires ne publie pas sur rgdrenova.fr.
  RGD_PORTEFEUILLE: {
    rgd_clients: 'moi', rgd_demandes: 'moi', rgd_apporteurs: 'moi', rgd_sous_traitants: 'moi',
    rgd_chantiers: 'affaire', rgd_devis: 'affaire', rgd_paiements: 'affaire', rgd_fournitures: 'affaire',
    rgd_missions: 'sous_traitant', rgd_st_commissions: 'sous_traitant',
    rgd_st_paiements: 'sous_traitant', rgd_st_pieces: 'sous_traitant',
    rgd_apports: 'apporteur',
    // Le sens inverse — ce que RGD a apporté au partenaire — pend du même
    // partenaire, donc du même propriétaire. ⚠ MAIS SON PARTENAIRE PEUT N'ÊTRE
    // QU'UN NOM, sans fiche d'annuaire : d'où un cas à lui, et non `apporteur`.
    rgd_apports_sortants: 'apporteur_ou_libre',
  },

  rgdVoitLigne(table, r) {
    switch (this.RGD_PORTEFEUILLE[table]) {
      case 'moi': return r.owner_id === this.user.id;
      // `deal_id` vide → l'affaire n'existe pas → personne. C'est le cas des
      // paiements venus de Costructor avec une référence client seule : ils
      // restent à la direction, faute de savoir à qui ils sont.
      case 'affaire': return !!r.deal_id && this.canSeeDeal(db.byId('deals', r.deal_id));
      case 'sous_traitant': return db.byId('rgd_sous_traitants', r.sous_traitant_id)?.owner_id === this.user.id;
      case 'apporteur': return db.byId('rgd_apporteurs', r.apporteur_id)?.owner_id === this.user.id;
      // ⚠ SANS FICHE D'ANNUAIRE, LA LIGNE RESTE VISIBLE — à l'inverse du cas
      // `affaire` juste au-dessus, et pour une raison qui n'est pas la même.
      // Un apport sortant peut désigner quelqu'un qui n'est pas fiché : son nom
      // est alors du texte libre, et il n'y a aucun propriétaire à lire. La
      // cacher la rendrait invisible à celui qui vient de l'écrire, alors que la
      // policy, elle, la rend à tout le monde (`has_activity('rgd')`, sans
      // filtre par personne) — ce filtre-ci est plus strict qu'elle, pas
      // l'inverse. Un paiement sans affaire, lui, a bien un propriétaire : on
      // ne sait simplement pas lequel, et c'est pourquoi il reste à la direction.
      case 'apporteur_ou_libre':
        return !r.apporteur_id
          || db.byId('rgd_apporteurs', r.apporteur_id)?.owner_id === this.user.id;
      default: return true;
    }
  },

  // ⚠ REGARDER L'ESPACE RGD COMME QUELQU'UN D'AUTRE (06/10/2026, demandé par
  // Élodie : « je voudrais que chaque chargé d'affaires ait sa propre base de
  // données, mais il faudrait que la direction puisse voir toutes les
  // informations du tableau de bord de chaque chargé d'affaires »).
  //
  // ⚠ CE N'EST PAS SE CONNECTER À SA PLACE, et la différence n'est pas théorique :
  // l'usurpation ferait signer ses écritures par quelqu'un d'autre, et
  // l'historique — qui a changé ce statut, qui a posé ce rappel — cesserait de
  // dire la vérité. Ici seule la POPULATION REGARDÉE change ; les droits, les
  // boutons et la signature restent ceux de la direction.
  //
  // ⚠ C'EST UN SEUL POINT DE PASSAGE, ET C'EST TOUT L'INTÉRÊT : `scope.rgd()`
  // est lu par la vue d'ensemble, Clients & prospects, le Pipeline, les
  // Partenaires et les Sous-traitants. Filtrer ici les sert tous sans en
  // retoucher un seul, et aucun ne peut « oublier » de suivre.
  //
  // ⚠ UNE TABLE SANS PROPRIÉTAIRE RESTE GLOBALE (agenda, réglages, état de la
  // synchronisation, documents du site) : elle n'est pas dans
  // `RGD_PORTEFEUILLE`, donc elle n'a personne à qui appartenir. Le bandeau de
  // l'écran le dit, plutôt que de laisser croire à un filtre qui porterait sur
  // tout.
  CLE_VUE_RGD: 'crm_rgd_vue_charge',

  // ⚠ LA VUE PAR DÉFAUT DE LA DIRECTION EST « LA DIRECTION », PAS « TOUT »
  // (06/10/2026, demandé par Élodie : « si on les attribue à une autre personne,
  // je voudrais que le lead disparaisse du tableau de la direction sans pour
  // autant être supprimé — je voudrais que la direction puisse y avoir accès »).
  // Confier un dossier doit le faire SORTIR de la liste qu'on travaille ; sinon
  // la répartition ne soulage rien, elle ajoute une colonne.
  //
  // ⚠ « SANS RESPONSABLE » VEUT DÉJÀ DIRE « À LA DIRECTION », et c'est ce qui
  // évite de choisir entre Mickael et Élodie comme destinataire par défaut : un
  // lead du site arrive orphelin (`rgd_demande_depuis_deal` ne pose pas
  // d'`owner_id`, vérifié), donc il tombe dans cette vue tout seul — et il y
  // reste marqué « À attribuer », ce qu'un propriétaire posé d'office effacerait.
  //
  // ⚠ C'EST LA DIRECTION ENTIÈRE, PAS « MES DOSSIERS » : avec 191 fiches sur 194
  // au nom de Mickael, une vue par personne viderait l'écran de l'autre. La
  // question posée était « confié à quelqu'un d'autre », pas « confié à un
  // collègue de la direction ».
  //
  // Trois valeurs : `'direction'` (le défaut), `null` (toute l'équipe, stocké
  // en chaîne vide) ou l'identifiant d'une personne.
  get vueRgd() {
    if (!this.isDirection) return null;
    try {
      const v = localStorage.getItem(this.CLE_VUE_RGD);
      if (v === null) return 'direction';
      // Une personne de la direction choisie avant le 07/10/2026 : elle n'a
      // plus d'entrée à elle, c'est l'entrée « direction » qui la porte.
      if (v && this.estDeLaDirection(v)) return 'direction';
      return v || null;
    } catch { return 'direction'; }
  },

  estDeLaDirection(id) {
    return !!id && db.byId('profiles', id)?.role === 'direction';
  },

  // Le propriétaire d'une ligne, table par table — `null` quand personne ne la
  // porte. ⚠ UNE TABLE COMMUNE REND `undefined` : elle n'appartient à personne
  // et ne se filtre pas, ce qui n'est pas la même chose qu'appartenir à personne.
  rgdProprietaire(table, r) {
    switch (this.RGD_PORTEFEUILLE[table]) {
      case 'moi': return r.owner_id || null;
      case 'affaire': return (r.deal_id && db.byId('deals', r.deal_id)?.owner_id) || null;
      case 'sous_traitant': return db.byId('rgd_sous_traitants', r.sous_traitant_id)?.owner_id || null;
      case 'apporteur': return db.byId('rgd_apporteurs', r.apporteur_id)?.owner_id || null;
      case 'apporteur_ou_libre':
        return (r.apporteur_id && db.byId('rgd_apporteurs', r.apporteur_id)?.owner_id) || null;
      default: return undefined;
    }
  },

  // ⚠ UNE LIGNE SANS PROPRIÉTAIRE EST À LA DIRECTION, et ce n'est pas un repli
  // commode : c'est là qu'arrivent les leads neufs. Les laisser hors de cette
  // vue les ferait disparaître de partout.
  rgdEstDeLaDirection(table, r) {
    const p = this.rgdProprietaire(table, r);
    return p === null || this.estDeLaDirection(p);
  },

  poserVueRgd(id) {
    try {
      // ⚠ LA CHAÎNE VIDE EST UN CHOIX — « Toute l'équipe » —, pas une absence de
      // choix. La retirer ferait retomber sur « La direction » au redessin
      // suivant : l'option serait proposée et impossible à garder. Seul `null`
      // efface le réglage et rend la main au défaut.
      if (id == null) localStorage.removeItem(this.CLE_VUE_RGD);
      else localStorage.setItem(this.CLE_VUE_RGD, id);
    } catch { /* navigation privée : la vue ne se mémorise pas, elle marche quand même */ }
  },

  // Le même raisonnement que `rgdVoitLigne`, mais pour QUELQU'UN D'AUTRE.
  // ⚠ IL NE RÉUTILISE PAS `canSeeDeal` : celle-ci répond « oui » d'emblée à la
  // direction, donc elle ne filtrerait rien ici — c'est précisément la
  // direction qui regarde.
  rgdVoitLignePour(table, r, qui) {
    switch (this.RGD_PORTEFEUILLE[table]) {
      case 'moi': return r.owner_id === qui;
      case 'affaire': return !!r.deal_id && db.byId('deals', r.deal_id)?.owner_id === qui;
      case 'sous_traitant': return db.byId('rgd_sous_traitants', r.sous_traitant_id)?.owner_id === qui;
      case 'apporteur': return db.byId('rgd_apporteurs', r.apporteur_id)?.owner_id === qui;
      // Même nuance que dans `rgdVoitLigne` : sans fiche d'annuaire, la ligne
      // n'a aucun propriétaire à lire. Elle reste visible dans toutes les vues
      // plutôt que d'appartenir à personne et de disparaître de toutes.
      case 'apporteur_ou_libre':
        return !r.apporteur_id
          || db.byId('rgd_apporteurs', r.apporteur_id)?.owner_id === qui;
      default: return true;
    }
  },

  rgd(table) {
    if (!this.canRgd) return [];
    const lignes = db.t(table);
    const vue = this.vueRgd;
    if (vue && this.RGD_PORTEFEUILLE[table]) {
      return lignes.filter(r => (vue === 'direction'
        ? this.rgdEstDeLaDirection(table, r)
        : this.rgdVoitLignePour(table, r, vue)));
    }
    if (this.isDirection || !this.RGD_PORTEFEUILLE[table]) return lignes;
    return lignes.filter(r => this.rgdVoitLigne(table, r));
  },

  // Qui peut recevoir un dossier RGD : la direction, et les chargés d'affaires
  // qui portent RGD. Même règle que `candidatsResponsable` pour une affaire —
  // attribuer une demande à quelqu'un qui ne porte pas l'activité la lui
  // ferait disparaître aussitôt.
  // Les entrées du sélecteur « Vue » de l'espace RGD (07/10/2026, demandé :
  // « Toute l'équipe, Mickael, Antoine »). ⚠ LA DIRECTION N'Y EST QU'UNE FOIS,
  // sous le nom de ceux qui PRODUISENT — qui portent au moins un dossier :
  // Élodie est dans la direction pour administrer le CRM, pas pour vendre, et
  // une vue à son nom serait vide. ⚠ ET CETTE ENTRÉE GARDE LA VALEUR
  // `direction`, PAS L'IDENTIFIANT DE MICKAEL : les leads neufs arrivent sans
  // responsable et ne sont visibles que dans la vue direction — une vue
  // « fiches de Mickael » au sens strict les ferait disparaître.
  producteursDirectionRgd() {
    const porteurs = new Set([...db.t('rgd_clients'), ...db.t('rgd_demandes')]
      .map(r => r.owner_id).filter(Boolean));
    return this.users().filter(u => u.role === 'direction' && porteurs.has(u.id));
  },
  chargesRgd() {
    return this.users().filter(u => u.role !== 'direction' && (u.activities || []).includes('rgd'));
  },

  candidatsRgd() { return this.users().filter(u => u.role === 'direction' || (u.activities || []).includes('rgd')); },

  // ---------- La même vue, pour BTP Expertise (07/10/2026, demandé par
  // Élodie : « une vue du chargé d'affaires qui appartient à la structure,
  // même fonctionnement que RGD Renova »).
  //
  // ⚠ LE POINT DE PASSAGE N'EST PAS LE MÊME QUE CHEZ RGD, ET C'EST LE MODÈLE
  // QUI LE DIT. RGD possède ses propres tables (`rgd_clients`,
  // `rgd_demandes`…), d'où `RGD_PORTEFEUILLE` et un filtre table par table.
  // BTP n'en a aucune : son portefeuille, ce sont les AFFAIRES de `deals`
  // dont l'`activity` vaut `btp`. Un seul critère — `owner_id` — et une seule
  // porte côté écran, `deals()` dans `btp.js`, que lisent le tableau de bord,
  // les deux pipelines, la charge, le CA et la pile des leads.
  //
  // ⚠ CE N'EST PAS UNE PROTECTION, c'est un cloisonnement d'affichage : la
  // policy rend les mêmes lignes qu'avant à la direction. Ce qui change, c'est
  // la POPULATION REGARDÉE, jamais les droits ni la signature de ce qu'on
  // écrit — même arbitrage que côté RGD.
  CLE_VUE_BTP: 'crm_btp_vue_charge',

  // Trois valeurs, comme pour RGD : `'direction'` (le défaut), la chaîne vide
  // pour « toute l'équipe », ou l'identifiant d'une personne.
  // ⚠ « SANS RESPONSABLE » VEUT DIRE « À LA DIRECTION », et ici ce n'est pas une
  // commodité : `creer_prospect_btp` et `intake_lead` créent l'affaire SANS
  // `owner_id`, exprès (arbitré le 18/09/2026, la direction distribue à la
  // main). Un lead neuf n'appartient donc à personne, et il doit rester sous
  // les yeux de ceux qui le distribuent.
  get vueBtp() {
    if (!this.isDirection) return null;
    try {
      const v = localStorage.getItem(this.CLE_VUE_BTP);
      if (v === null) return 'direction';
      if (v && this.estDeLaDirection(v)) return 'direction';
      return v || null;
    } catch { return 'direction'; }
  },

  poserVueBtp(id) {
    try {
      // Même nuance que `poserVueRgd` : la chaîne vide est un CHOIX (« toute
      // l'équipe »), seul `null` efface le réglage. Les confondre rendrait ce
      // choix impossible à garder — il reviendrait au défaut au redessin.
      if (id == null) localStorage.removeItem(this.CLE_VUE_BTP);
      else localStorage.setItem(this.CLE_VUE_BTP, id);
    } catch { /* navigation privée : la vue ne se mémorise pas, elle marche */ }
  },

  // La vue appliquée à une liste d'affaires BTP.
  // ⚠ ELLE NE RÉUTILISE PAS `canSeeDeal` : celle-ci répond « oui » d'emblée à la
  // direction, donc elle ne filtrerait rien — or c'est précisément la
  // direction qui regarde. Même raison que `rgdVoitLignePour`.
  btpVue(affaires) {
    const vue = this.vueBtp;
    if (!vue) return affaires;
    if (vue === 'direction') {
      return affaires.filter(d => !d.owner_id || this.estDeLaDirection(d.owner_id));
    }
    return affaires.filter(d => d.owner_id === vue);
  },

  // Ceux de la direction qui PORTENT des affaires BTP : c'est leur nom que
  // prend l'entrée « direction » du sélecteur. ⚠ L'ENTRÉE GARDE LA VALEUR
  // `direction`, PAS LEUR IDENTIFIANT : les leads neufs arrivent sans
  // responsable, et une vue « les affaires de Mickael » au sens strict les
  // ferait disparaître de l'écran où on les distribue.
  producteursDirectionBtp() {
    const porteurs = new Set(db.t('deals')
      .filter(d => d.activity === 'btp').map(d => d.owner_id).filter(Boolean));
    return this.users().filter(u => u.role === 'direction' && porteurs.has(u.id));
  },

  chargesBtp() {
    return this.users().filter(u => u.role !== 'direction' && (u.activities || []).includes('btp'));
  },

  users() { return db.t('profiles').filter(u => u.active !== false); },
  // Ceux a qui l'on peut ecrire. `users()` reste entier a cote : confier une
  // tache ou nommer un responsable d'affaire n'est pas cloisonne.
  collegues() { return this.users().filter(u => this.partageStructure(u)); },

  // ---------- Agendas ----------
  // Les calendriers Google qui appartiennent EN PROPRE à la personne
  // connectée, pour une structure. Créés un par un depuis l'écran des
  // comptes, ils sont la seule façon de savoir qu'un rendez-vous est le sien
  // plutôt que celui de la structure : `agenda_events` ne porte PAS de
  // propriétaire, il ne porte qu'un `calendar_id`.
  mesAgendas(structure) {
    if (!this.user) return [];
    return db.t('agendas_personnels')
      .filter(a => a.profile_id === this.user.id && a.structure === structure)
      .map(a => a.calendar_id).filter(Boolean);
  },

  // Les structures dont l'agenda reste COMMUN, quoi qu'il arrive.
  //
  // ⚠ BTP EXPERTISE EN FAIT PARTIE, ET CE N'EST PAS UN OUBLI : le cabinet
  // tient deux agendas, expertise et AMO, et le métier d'un rendez-vous se
  // DÉDUIT DU CALENDRIER dont il vient (`btp_projets_depuis_agenda` ne lit
  // que ces deux-là). Les ranger par personne reviendrait à perdre le métier,
  // donc la fiche projet — silencieusement. Tant que le pipeline lit les
  // calendriers, ces deux agendas restent l'outil de travail commun.
  STRUCTURES_A_AGENDA_COMMUN: ['btp'],

  /**
   * Cette personne doit-elle voir ce rendez-vous dans SON agenda ?
   *
   * Décision d'Élodie du 06/10/2026 : « strictement privé, personne ne voit
   * les autres ». La direction n'y échappe pas — c'est le seul endroit du CRM
   * où elle ne voit pas tout, et c'est voulu : la vue d'ensemble des affaires
   * est donnée par les pipelines, pas par l'agenda de chacun.
   *
   * ⚠ SANS AGENDA À SOI, ON NE VOIT RIEN — ET SURTOUT PAS CELUI DE LA
   * STRUCTURE. La première version retombait sur l'agenda commun tant qu'on
   * n'avait pas le sien : un garde pensé pour ne vider l'écran de personne le
   * jour de la mise en ligne, qui montrait donc à chacun les rendez-vous des
   * autres. Éprouvé par Élodie le 06/10/2026 sur un compte de chargé
   * d'affaires : « il ne doit pas voir l'agenda de Mickael, dans l'idéal je
   * voudrais que rien ne s'affiche en disant qu'il faut qu'il connecte son
   * agenda ». Un écran vide AVEC SA RAISON vaut mieux qu'un écran plein de ce
   * qui ne vous regarde pas — à charge pour les écrans d'expliquer et de
   * proposer le bouton, ce que font `#/rgd/agenda` et « Ma journée ».
   *
   * ⚠ ON NE FILTRE QUE L'AGENDA, jamais le rendez-vous attaché à une fiche :
   * le propriétaire d'un dossier doit voir la visite qui le concerne même
   * quand elle a été posée depuis le calendrier d'un autre. Les écrans de
   * fiche lisent donc `agenda_events` sans passer par ici.
   */
  // Les agendas de la structure que PERSONNE NE PORTE en propre.
  //
  // ⚠ C'EST L'AGENDA D'ENTRÉE, et il se définit par soustraction plutôt que
  // par un réglage de plus : le réglage `<structure>_calendar_id` accumule
  // désormais TOUS les agendas, y compris ceux créés pour chaque personne,
  // parce que le relevé doit tous les lire. Ce qui reste une fois retirés
  // ceux qui appartiennent à quelqu'un, c'est l'agenda commun — pour RGD, la
  // boîte où arrivent les leads.
  agendasDeStructure(structure) {
    const bruts = String(db.setting(`${structure}_calendar_id`) || '')
      .split(',').map(c => c.trim()).filter(Boolean);
    const portes = new Set(db.t('agendas_personnels').map(a => a.calendar_id));
    return bruts.filter(c => !portes.has(c));
  },

  // A-t-on quelque chose à regarder dans cette structure ? Lu par l'écran
  // agenda, qui propose de créer le sien quand la réponse est non.
  aUnAgendaAVoir(structure) {
    if (this.mesAgendas(structure).length) return true;
    return this.isDirection && this.agendasDeStructure(structure).length > 0;
  },

  voitAgenda(e) {
    const structure = e?.activity;
    if (!structure || this.STRUCTURES_A_AGENDA_COMMUN.includes(structure)) return true;
    if (this.mesAgendas(structure).includes(e.calendar_id)) return true;
    // ⚠ LA DIRECTION PARTAGE L'AGENDA D'ENTRÉE (06/10/2026, Élodie : « remets
    // la connexion du Google Agenda m.rigaud@rgdrenova.fr pour Mickael et
    // Élodie »). Ce n'est pas un retour en arrière sur « strictement privé » :
    // cette règle visait les chargés d'affaires, qui ne doivent pas voir les
    // rendez-vous les uns des autres. L'agenda où ARRIVENT les leads, lui,
    // n'appartient à personne — c'est l'outil commun de la direction, celui
    // depuis lequel elle répartit.
    //
    // ⚠ ELLE NE VOIT PAS POUR AUTANT LES AGENDAS DES AUTRES : seuls les
    // calendriers que PERSONNE ne porte entrent ici. Celui d'Antoine lui
    // appartient, il reste invisible à tout le monde sauf à lui.
    if (this.isDirection) return this.agendasDeStructure(structure).includes(e.calendar_id);
    return false;
  },
};
