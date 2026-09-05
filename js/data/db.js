// Couche données : un cache mémoire alimenté soit par le navigateur (mode démo),
// soit par Supabase (production). Les pages lisent le cache ; les écritures
// passent par l'adaptateur puis mettent le cache à jour.
import { CONFIG } from '../config.js';
import { SEED, SEED_USERS } from './seed.js';

export const TABLES = ['profiles', 'organisations', 'contacts', 'deals', 'activities', 'events', 'ad_spend', 'settings'];
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
  reset() { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_USER); },
  // auth
  async currentUser() { const id = localStorage.getItem(LS_USER); return this.data.profiles.find(u => u.id === id) || null; },
  async signIn(userId) { localStorage.setItem(LS_USER, userId); return this.data.profiles.find(u => u.id === userId); },
  async signOut() { localStorage.removeItem(LS_USER); },
};

// ---------- Adaptateur Supabase ----------
const supabaseAdapter = {
  name: 'supabase',
  client: null,
  async connect() {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    this.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  },
  async load() {
    const out = {};
    for (const t of TABLES) {
      const { data, error } = await this.client.from(t).select('*').limit(10000);
      if (error) throw new Error(`${t}: ${error.message}`);
      out[t] = data || [];
    }
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
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } },

  // auth
  currentUser() { return this.adapter.currentUser(); },
  signIn(a, b) { return this.adapter.signIn(a, b); },
  signOut() { return this.adapter.signOut(); },
  resetDemo() { if (this.demo) localAdapter.reset(); },
};
