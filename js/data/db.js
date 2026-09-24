// Couche données : un cache mémoire alimenté soit par le navigateur (mode démo),
// soit par Supabase (production). Les pages lisent le cache ; les écritures
// passent par l'adaptateur puis mettent le cache à jour.
import { CONFIG } from '../config.js';
import { SEED, SEED_USERS } from './seed.js';
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
  // espace RGD Renova : le relevé déposé toutes les 30 min par son worker.
  // Cloudflare D1 reste la source ; ces tables en sont le reflet, personne
  // n'y écrit depuis le CRM tant que la migration n'est pas terminée.
  'rgd_chantiers', 'rgd_devis', 'rgd_paiements', 'rgd_demandes',
  'rgd_sous_traitants', 'rgd_missions', 'rgd_st_paiements', 'rgd_st_commissions',
  // ⚠ `rgd_st_pieces` n'est PAS un reflet : c'est du Supabase pur, écrit par le
  // CRM et par personne d'autre. Le relevé ne l'envoie pas et ne l'écrasera pas.
  'rgd_st_pieces',
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
const LS_SITE = 'crm_local_site_v1';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

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
      if (cle !== 'realisations' && cle !== 'carrousel') throw new Error('document inconnu : ' + cle);
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
      const table = cle === 'carrousel' ? 'rgd_carrousel' : 'rgd_realisations';
      const lignes = deplierSite(cle, docs[cle]);
      if (lignes.length) { this.data[table] = lignes; this.save(); }
      return { ok: true, cle };
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
