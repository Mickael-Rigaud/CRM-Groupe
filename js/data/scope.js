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
  get canRgd() { return this.activityKeys.includes('rgd'); },

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
      default: return true;
    }
  },

  rgd(table) {
    if (!this.canRgd) return [];
    const lignes = db.t(table);
    if (this.isDirection || !this.RGD_PORTEFEUILLE[table]) return lignes;
    return lignes.filter(r => this.rgdVoitLigne(table, r));
  },

  // Qui peut recevoir un dossier RGD : la direction, et les chargés d'affaires
  // qui portent RGD. Même règle que `candidatsResponsable` pour une affaire —
  // attribuer une demande à quelqu'un qui ne porte pas l'activité la lui
  // ferait disparaître aussitôt.
  candidatsRgd() { return this.users().filter(u => u.role === 'direction' || (u.activities || []).includes('rgd')); },

  users() { return db.t('profiles').filter(u => u.active !== false); },
  // Ceux a qui l'on peut ecrire. `users()` reste entier a cote : confier une
  // tache ou nommer un responsable d'affaire n'est pas cloisonne.
  collegues() { return this.users().filter(u => this.partageStructure(u)); },
};
