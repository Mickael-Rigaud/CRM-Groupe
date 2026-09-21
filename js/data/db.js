// Couche données : un cache mémoire alimenté soit par le navigateur (mode démo),
// soit par Supabase (production). Les pages lisent le cache ; les écritures
// passent par l'adaptateur puis mettent le cache à jour.
import { CONFIG } from '../config.js';
import { SEED, SEED_USERS } from './seed.js';

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
  // espace RGD Renova : le relevé déposé toutes les 30 min par son worker.
  // Cloudflare D1 reste la source ; ces tables en sont le reflet, personne
  // n'y écrit depuis le CRM tant que la migration n'est pas terminée.
  'rgd_chantiers', 'rgd_devis', 'rgd_paiements', 'rgd_demandes',
  'rgd_sous_traitants', 'rgd_missions', 'rgd_st_paiements', 'rgd_st_commissions',
  'rgd_apporteurs', 'rgd_fournitures', 'rgd_realisations', 'rgd_carrousel',
  'rgd_reglages', 'rgd_clients', 'rgd_costructor_etat',
  'rgd_costructor_journal', 'rgd_costructor_ignores',
  // messagerie interne (canaux par structure + conversations privées)
  'conversations', 'conversation_members', 'messages', 'message_reads',
  // agenda du groupe : le reflet des rendez-vous Google, recopié par la direction
  'agenda_events'];
const LS_FILES = 'crm_local_files';
const LS_KEY = 'crm_local_v1';
const LS_USER = 'crm_local_user';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

// ---------- Adaptateur local (démo) ----------
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
    const i = this.data[table].findIndex(r => (r.id ?? r.key) === id);
    if (i < 0) throw new Error('Introuvable');
    this.data[table][i] = { ...this.data[table][i], ...patch, updated_at: new Date().toISOString() };
    this.save(); return structuredClone(this.data[table][i]);
  },
  async remove(table, id) {
    this.data[table] = this.data[table].filter(r => (r.id ?? r.key) !== id); this.save();
  },
  reset() { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_USER); localStorage.removeItem(LS_FILES); },
  // Mode démo : aucune fonction SQL n'est appelée depuis le navigateur aujourd'hui.
  // Celles qui existent (push_agenda, push_structure_stats) sont appelées par
  // l'outil qui pousse les données, pas par le CRM. Si une page venait à en
  // appeler une, c'est ici qu'on rejouerait son effet à la main.
  async rpc(nom) { throw new Error('Fonction inconnue en mode démo : ' + nom); },
  // fichiers (démo) : conservés dans le navigateur en base64, petits fichiers uniquement
  files() { try { return JSON.parse(localStorage.getItem(LS_FILES)) || {}; } catch { return {}; } },
  async uploadFile(path, file) {
    if (file.size > 3 * 1048576) throw new Error('En mode démo, 3 Mo max par fichier (sans limite en production)');
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const all = this.files(); all[path] = dataUrl;
    try { localStorage.setItem(LS_FILES, JSON.stringify(all)); } catch { throw new Error('Espace du navigateur saturé (mode démo)'); }
  },
  async fileUrl(path) { const u = this.files()[path]; if (!u) throw new Error('Fichier introuvable'); return u; },
  async deleteFile(path) { const all = this.files(); delete all[path]; localStorage.setItem(LS_FILES, JSON.stringify(all)); },
  // auth
  async currentUser() { const id = localStorage.getItem(LS_USER); return this.data.profiles.find(u => u.id === id) || null; },
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
    const col = table === 'settings' ? 'key' : 'id';
    const { data, error } = await this.client.from(table).update(patch).eq(col, id).select().single();
    if (error) throw new Error(error.message); return data;
  },
  async remove(table, id) {
    const { error } = await this.client.from(table).delete().eq('id', id);
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
  // fichiers : bucket privé « documents », accès par lien signé (1 h)
  async uploadFile(path, file) {
    const { error } = await this.client.storage.from('documents').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw new Error(error.message);
  },
  async fileUrl(path) {
    const { data, error } = await this.client.storage.from('documents').createSignedUrl(path, 3600);
    if (error) throw new Error(error.message); return data.signedUrl;
  },
  async deleteFile(path) {
    const { error } = await this.client.storage.from('documents').remove([path]);
    if (error) throw new Error(error.message);
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

  // fichiers
  uploadFile(path, file) { return this.adapter.uploadFile(path, file); },
  fileUrl(path) { return this.adapter.fileUrl(path); },
  deleteFile(path) { return this.adapter.deleteFile(path); },
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
