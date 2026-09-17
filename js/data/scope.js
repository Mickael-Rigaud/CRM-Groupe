// Droits côté client : ce que l'utilisateur connecté voit.
// (En production, les mêmes règles sont imposées côté serveur par les politiques RLS Supabase.)
import { db } from './db.js';

export const scope = {
  user: null,
  set(user) { this.user = user; },
  get role() { return this.user?.role || 'commercial'; },
  get isDirection() { return this.role === 'direction'; },
  get canPatrimony() { return this.isDirection && this.user?.patrimony_access === true; },
  get canRental() { return this.canPatrimony || this.user?.rental_access === true; },
  get activityKeys() { return this.isDirection ? ['rgd', 'btp', 'courtage', 'propulsion'] : (this.user?.activities || []); },

  canSeeDeal(d) {
    if (this.isDirection) return true;
    if (d.owner_id === this.user.id) return true;
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
  canSeeActivity(a) {
    if (this.isDirection) return true;
    if (a.assignee_id === this.user.id) return true;
    if (a.deal_id) { const d = db.byId('deals', a.deal_id); return d ? this.canSeeDeal(d) : false; }
    if (a.organisation_id) { const o = db.byId('organisations', a.organisation_id); return o ? this.canSeeOrg(o) : false; }
    if (a.contact_id) { const c = db.byId('contacts', a.contact_id); return c ? this.canSeeContact(c) : false; }
    return false;
  },

  // Messagerie. Un canal de structure se voit comme le reste de la structure
  // (miroir de has_activity côté serveur) ; le canal Groupe est ouvert à tous ;
  // une conversation privée se voit si on y est nommément.
  canSeeConversation(c) {
    if (!c) return false;
    if (c.kind === 'canal') return c.activity ? this.activityKeys.includes(c.activity) : true;
    return db.t('conversation_members').some(m => m.conversation_id === c.id && m.user_id === this.user.id);
  },

  deals() { return db.t('deals').filter(d => this.canSeeDeal(d)); },
  conversations() { return db.t('conversations').filter(c => this.canSeeConversation(c)); },
  contacts() { return db.t('contacts').filter(c => this.canSeeContact(c)); },
  orgs() { return db.t('organisations').filter(o => this.canSeeOrg(o)); },
  activities() { return db.t('activities').filter(a => this.canSeeActivity(a)); },
  users() { return db.t('profiles').filter(u => u.active !== false); },
};
