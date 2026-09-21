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
  // Espace RGD Renova. Miroir exact des policies `rgd_*_acces`, qui tiennent
  // toutes en `has_activity('rgd')` — l'équipe RGD et la direction, personne
  // d'autre. Ces tables sont le reflet du relevé déposé par le worker toutes
  // les 30 minutes : on les lit, on n'y écrit pas tant que Cloudflare fait foi.
  get canRgd() { return this.activityKeys.includes('rgd'); },
  rgd(table) { return this.canRgd ? db.t(table) : []; },

  users() { return db.t('profiles').filter(u => u.active !== false); },
  // Ceux a qui l'on peut ecrire. `users()` reste entier a cote : confier une
  // tache ou nommer un responsable d'affaire n'est pas cloisonne.
  collegues() { return this.users().filter(u => this.partageStructure(u)); },
};
