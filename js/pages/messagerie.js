// Messagerie interne : les échanges de l'équipe entre elle.
//
// Deux formes, la même table : les CANAUX (un par structure), où l'on entre
// parce que la structure est sur son profil, et les MESSAGES DIRECTS à deux.
// Rien ici n'est rattaché à un client : l'historique d'un contact ou d'une
// affaire, c'est la table `events`, ailleurs.
//
// CLOISONNEMENT PAR STRUCTURE (2026-09-18). On ne parle qu'aux gens avec qui
// l'on partage une structure : un commercial de BTP Expertise ne voit ni
// n'atteint ceux de RGD Renova. La direction porte les quatre structures, elle
// reste donc joignable par tous et joint tout le monde. Le canal « Groupe »,
// qui était ouvert à tous les comptes, ne l'est plus qu'à la direction. La
// règle vit dans scope.canSeeConversation / scope.partageStructure, et les
// policies RLS disent la même chose (migration 20260918140000) : ce qui est
// masqué ici serait de toute façon refusé par le serveur.
//
// La liste des messages directs montre tous les COLLÈGUES joignables, pas
// seulement les conversations déjà ouvertes : on écrit à quelqu'un en le
// choisissant, la conversation se crée toute seule au premier message envoyé.
// Personne n'a à « créer une conversation » avant de parler, et aucune
// conversation vide ne traîne si on a seulement cliqué.
//
// Deux façons de l'ouvrir, un seul code : l'écran plein (#/messagerie) et la
// bulle posée en bas à droite de toutes les pages. `vueConversation()` rend le
// fil et la zone de saisie ; la page y ajoute sa colonne, la bulle son panneau.
//
// Les pièces jointes passent par la table `documents` et le bucket du même nom,
// avec entity_type = 'messages' — rien de nouveau à installer côté stockage.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, toast, confirm, userName, initials, fmtDate, daysSince, terms, hit } from '../ui.js';
import { poserEspace } from './espace.js';

const MAX_MO = 25;
const RAFRAICHIR_MS = 8000;          // le CRM n'a pas de temps réel : on va voir de temps en temps
const RAFRAICHIR_FERME_MS = 60000;   // bulle fermée : juste de quoi tenir la pastille à jour
const TABLES = ['conversations', 'conversation_members', 'messages', 'message_reads', 'documents'];
const DERNIERE = 'crm_msg_derniere';  // ce qui était ouvert dans la bulle, d'une visite à l'autre

// Les brouillons survivent au changement de conversation et au redessin.
const brouillons = new Map();
// Les liens de téléchargement Supabase sont signés une heure : on les garde le temps de la visite.
const liens = new Map();

const estImage = (d) => /^image\//.test(d.mime || '') || /\.(jpe?g|png|gif|webp|avif|heic)$/i.test(d.name || '');
const poids = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const jourCourt = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

// ---------- Lecture des données ----------
const messagesDe = (cid) => cid ? db.t('messages').filter(m => m.conversation_id === cid)
  .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')) : [];
const piecesDe = (mid) => db.t('documents').filter(d => d.entity_type === 'messages' && d.entity_id === mid);
const membresDe = (cid) => db.t('conversation_members').filter(m => m.conversation_id === cid).map(m => m.user_id);
const dernier = (cid) => { const l = messagesDe(cid); return l[l.length - 1] || null; };

const luJusqua = (cid) => db.t('message_reads')
  .find(r => r.conversation_id === cid && r.user_id === scope.user?.id)?.last_read_at || '';

const nonLus = (cid) => {
  if (!cid) return 0;
  const depuis = luJusqua(cid);
  return messagesDe(cid).filter(m => m.author_id !== scope.user?.id && (m.created_at || '') > depuis).length;
};

// Les personnes d'un canal : celles dont le profil porte la structure. Le canal
// « Groupe » les réunit toutes. C'est la même règle que côté serveur — la
// composition n'est écrite nulle part, elle se déduit des profils.
function gensDe(c) {
  if (c.kind !== 'canal') return membresDe(c.id);
  return scope.users()
    .filter(u => (c.activity ? (u.role === 'direction' || (u.activities || []).includes(c.activity))
                             : u.role === 'direction'))
    .map(u => u.id);
}

function nomDe(c, u) {
  if (u) return u.full_name;
  if (!c) return 'Conversation';
  if (c.kind === 'canal') return c.title || c.slug;
  const autres = membresDe(c.id).filter(x => x !== scope.user?.id);
  return autres.length ? autres.map(userName).join(', ') : 'Conversation';
}
const teinteDe = (c) => (c?.kind === 'canal' && c.activity && ACTIVITIES[c.activity]?.color) || null;

// ---------- La liste, en deux familles ----------
// Un « fil » = ce qu'on peut ouvrir : un canal, ou une personne (avec sa
// conversation si elle existe déjà, sinon rien encore).
function fils() {
  const vues = scope.conversations();
  const ordre = ['groupe', 'rgd', 'btp', 'courtage', 'propulsion'];
  const canaux = vues.filter(c => c.kind === 'canal')
    .sort((a, b) => ordre.indexOf(a.slug) - ordre.indexOf(b.slug))
    .map(c => ({ cle: c.slug, genre: 'canal', conv: c, user: null }));

  const privees = vues.filter(c => c.kind === 'prive');
  const gens = scope.collegues().filter(u => u.id !== scope.user?.id).map(u => ({
    cle: u.id, genre: 'direct', user: u,
    conv: privees.find(c => membresDe(c.id).includes(u.id)) || null,
  }));
  // Celui à qui on a parlé le plus récemment en premier ; les autres par nom.
  gens.sort((a, b) => {
    const da = dernier(a.conv?.id)?.created_at || '';
    const dbb = dernier(b.conv?.id)?.created_at || '';
    if (da || dbb) return dbb.localeCompare(da);
    return (a.user.full_name || '').localeCompare(b.user.full_name || '', 'fr');
  });
  return [...canaux, ...gens];
}

const filPar = (cle) => fils().find(f => f.cle === cle || f.conv?.id === cle) || null;

// Total pour la pastille du menu et de la bulle — exporté, app.js s'en sert.
export function messagesNonLus() {
  if (!scope.user) return 0;
  return fils().reduce((s, f) => s + nonLus(f.conv?.id), 0);
}

// ---------- Écriture ----------
async function marquerLu(cid) {
  if (!scope.user || !cid) return;
  const d = dernier(cid);
  if (!d) return;
  const ligne = db.t('message_reads').find(r => r.conversation_id === cid && r.user_id === scope.user.id);
  if (ligne && (ligne.last_read_at || '') >= d.created_at) return;
  const quand = new Date().toISOString();
  try {
    if (ligne) await db.update('message_reads', ligne.id, { last_read_at: quand });
    else await db.insert('message_reads', { conversation_id: cid, user_id: scope.user.id, last_read_at: quand });
  } catch { /* la pastille se recalera au prochain passage */ }
}

// La conversation d'un message direct n'existe qu'au moment où l'on parle.
async function assurerConversation(fil) {
  if (fil.conv) return fil.conv;
  const c = await db.insert('conversations', { kind: 'prive', slug: null, activity: null, title: null, created_by: scope.user.id });
  await db.insert('conversation_members', { conversation_id: c.id, user_id: scope.user.id });
  await db.insert('conversation_members', { conversation_id: c.id, user_id: fil.user.id });
  fil.conv = c;
  return c;
}

async function envoyer(fil, texte, fichiers, contexte) {
  let corps = (texte || '').trim();
  // Le renvoi vers l'écran d'où part le message s'écrit dans le corps, en clair.
  // Pas de colonne pour ça : un lien reste lisible même si un jour plus personne
  // ne l'affiche en joli, et il se tape à la main aussi bien qu'il se clique.
  if (contexte) corps = (corps ? corps + '\n' : '') + `↗ [${contexte.label}](${contexte.hash})`;
  if (!corps && !fichiers.length) return;
  const conv = await assurerConversation(fil);
  const msg = await db.insert('messages', { conversation_id: conv.id, author_id: scope.user.id, body: corps || null });
  for (const f of fichiers) {
    if (f.size > MAX_MO * 1048576) { toast(`${f.name} : trop lourd (${MAX_MO} Mo maximum)`, 'warn'); continue; }
    try {
      const chemin = `messages/${msg.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
      await db.uploadFile(chemin, f);
      await db.insert('documents', {
        entity_type: 'messages', entity_id: msg.id, name: f.name, mime: f.type || null,
        size: f.size, storage_path: chemin, created_by: scope.user.id,
      });
    } catch (err) { toast(`${f.name} : ${err.message}`, 'err'); }
  }
  return msg;
}

async function supprimerMessage(m) {
  if (!await confirm('Supprimer ce message ? La suppression est définitive.')) return;
  for (const d of piecesDe(m.id)) {
    try { await db.deleteFile(d.storage_path); } catch { /* fichier déjà parti */ }
    try { await db.remove('documents', d.id); } catch { /* le déclencheur SQL s'en charge aussi */ }
  }
  await db.remove('messages', m.id);
  toast('Message supprimé');
}

// ---------- De quoi parle-t-on ? ----------
// Ce que l'utilisateur a sous les yeux au moment où il ouvre la bulle : la fiche
// ouverte si une modale est là, sinon l'écran. L'adresse reste celle de l'écran —
// les fiches s'ouvrent en modale et n'ont pas d'adresse propre, donc le lien
// ramène au bon écran et le libellé nomme la fiche.
export function contexteCourant() {
  const hash = location.hash || '#/home';
  if (hash.startsWith('#/messagerie')) return null;
  const modale = document.querySelector('#modal .modal-head h2');
  const titre = document.getElementById('page-title');
  const label = (modale?.textContent || titre?.textContent || '').trim();
  if (!label || label === '—') return null;
  return { hash, label };
}

// Les liens du corps d'un message sont cliquables, le reste est échappé.
// Deux formes : une adresse http, et « [libellé](#/adresse) » — le renvoi vers
// un écran du CRM, qui ne recharge pas la page.
function lier(s) {
  return esc(s).replace(/\n/g, '<br>')
    .replace(/\[([^\]\n]{1,80})\]\((#\/[^)\s]{1,120})\)/g,
      (_, label, hash) => `<a href="${hash}" class="msg-renvoi">${label}</a>`)
    .replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

// ---------- Vignettes ----------
// Un canal porte la couleur de sa structure, une personne porte ses initiales.
function vignette(f, taille = '') {
  if (f.genre === 'direct') return `<span class="avatar ${taille}">${esc(initials(f.user.id))}</span>`;
  const t = teinteDe(f.conv);
  return `<span class="msg-ecu ${taille} ${t ? '' : 'groupe'}" ${t ? `style="--t:${t}"` : ''}>
    ${t ? `<img src="assets/logos/${esc(f.conv.activity)}.png" alt="" onerror="this.remove()">` : '<b>#</b>'}</span>`;
}

// =====================================================================
//  Le fil et la zone de saisie — utilisés par l'écran plein ET par la bulle
// =====================================================================
function vueConversation(hote, fil, { contexte = null, apresEnvoi = null, surRenvoi = null } = {}) {
  let enAttente = [];        // fichiers choisis, pas encore envoyés
  let contexteActif = contexte;
  let bas = true;            // le fil est-il collé en bas ?
  const cleBrouillon = fil.cle;

  hote.innerHTML = `
    <div class="msg-fil"></div>
    <form class="msg-ecrire">
      <div class="msg-contexte" hidden></div>
      <div class="msg-jointes" hidden></div>
      <div class="msg-saisie">
        <label class="msg-trombone" title="Joindre un document ou une photo">
          <svg viewBox="0 0 20 20" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.2 9.3 9.6 14.9a3.2 3.2 0 0 1-4.5-4.5l6.6-6.6a2.1 2.1 0 0 1 3 3l-6.6 6.6a1 1 0 0 1-1.4-1.4l5.6-5.6"/></svg>
          <input type="file" multiple hidden></label>
        <textarea rows="1" placeholder="Écrire à ${esc(nomDe(fil.conv, fil.user))}…"></textarea>
        <button class="btn msg-envoi" type="submit" title="Envoyer (Entrée)">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 14-6-5.5 14L9 11.5z"/></svg>
          <span>Envoyer</span></button>
      </div>
    </form>`;

  const zoneFil = hote.querySelector('.msg-fil');
  const form = hote.querySelector('.msg-ecrire');
  const texte = hote.querySelector('textarea');
  const champFichiers = hote.querySelector('input[type=file]');
  const bacContexte = hote.querySelector('.msg-contexte');
  const bacJointes = hote.querySelector('.msg-jointes');
  const bouton = hote.querySelector('.msg-envoi');

  // ----- Le fil -----
  const dessinerFil = () => {
    const msgs = messagesDe(fil.conv?.id);
    if (!msgs.length) {
      zoneFil.innerHTML = `<div class="msg-vide">
        ${vignette(fil, 'xl')}
        <b>${esc(nomDe(fil.conv, fil.user))}</b>
        <span class="muted small">${fil.genre === 'canal'
          ? 'Personne n’a encore écrit dans ce canal.'
          : 'Aucun message échangé. Écrivez le premier.'}</span>
      </div>`;
      return;
    }
    let jour = '';
    let precedent = null;
    zoneFil.innerHTML = msgs.map(m => {
      let bloc = '';
      const j = (m.created_at || '').slice(0, 10);
      if (j !== jour) {
        jour = j;
        const n = daysSince(m.created_at);
        bloc += `<div class="msg-jour"><span>${n === 0 ? 'Aujourd’hui' : n === 1 ? 'Hier' : esc(fmtDate(m.created_at))}</span></div>`;
        precedent = null;
      }
      // Messages d'affilée de la même personne à moins de cinq minutes : un seul en-tête.
      const suite = precedent && precedent.author_id === m.author_id
        && (new Date(m.created_at) - new Date(precedent.created_at)) < 300000;
      precedent = m;
      const moi = m.author_id === scope.user?.id;
      const pieces = piecesDe(m.id);
      bloc += `<div class="msg-ligne ${moi ? 'moi' : ''} ${suite ? 'suite' : ''}" data-msg="${m.id}">
        ${suite ? '<span class="msg-gouttiere"></span>' : `<span class="avatar sm">${esc(initials(m.author_id))}</span>`}
        <div class="msg-bulle">
          ${suite ? '' : `<div class="msg-qui"><b>${esc(userName(m.author_id))}</b><time>${heure(m.created_at)}</time>${m.edited_at ? '<em>modifié</em>' : ''}</div>`}
          ${m.body ? `<div class="msg-corps">${lier(m.body)}${suite && m.edited_at ? '<em class="msg-modifie">modifié</em>' : ''}</div>` : ''}
          ${pieces.length ? `<div class="msg-pieces">${pieces.map(p => estImage(p)
            ? `<a href="#" class="msg-photo" data-piece="${p.id}"><img alt="${esc(p.name)}" data-src="${esc(p.storage_path)}"><span>${esc(p.name)}</span></a>`
            : `<a href="#" class="msg-fichier" data-piece="${p.id}"><span class="msg-fichier-ico">📄</span><span class="msg-fichier-nom"><b>${esc(p.name)}</b><small class="muted">${poids(p.size || 0)}</small></span></a>`).join('')}</div>` : ''}
        </div>
        ${moi ? '<span class="msg-actions"><button type="button" class="icon-btn" data-editer title="Modifier">✎</button><button type="button" class="icon-btn" data-suppr title="Supprimer">🗑</button></span>' : ''}
      </div>`;
      return bloc;
    }).join('');

    brancherFil();
    chargerImages();
    if (bas) zoneFil.scrollTop = zoneFil.scrollHeight;
  };

  // Les vignettes demandent un lien signé ; on ne le demande qu'une fois par fichier.
  async function chargerImages() {
    for (const im of zoneFil.querySelectorAll('img[data-src]')) {
      const chemin = im.dataset.src;
      delete im.dataset.src;
      try {
        if (!liens.has(chemin)) liens.set(chemin, await db.fileUrl(chemin));
        im.src = liens.get(chemin);
      } catch { im.closest('.msg-photo')?.classList.add('absente'); }
    }
  }

  function brancherFil() {
    zoneFil.querySelectorAll('[data-piece]').forEach(a => a.onclick = async e => {
      e.preventDefault();
      const p = db.byId('documents', a.dataset.piece); if (!p) return;
      try { window.open(await db.fileUrl(p.storage_path), '_blank', 'noopener'); }
      catch (err) { toast(err.message, 'err'); }
    });
    zoneFil.querySelectorAll('.msg-renvoi').forEach(a => a.onclick = () => surRenvoi?.());
    zoneFil.querySelectorAll('[data-suppr]').forEach(b => b.onclick = async () => {
      const m = db.byId('messages', b.closest('[data-msg]').dataset.msg);
      if (m) { try { await supprimerMessage(m); } catch (err) { toast(err.message, 'err'); } }
    });
    zoneFil.querySelectorAll('[data-editer]').forEach(b => b.onclick = () => editer(b.closest('[data-msg]').dataset.msg));
  }

  function editer(id) {
    const m = db.byId('messages', id); if (!m) return;
    const ligne = zoneFil.querySelector(`[data-msg="${id}"] .msg-corps`); if (!ligne) return;
    const zone = document.createElement('textarea');
    zone.className = 'msg-edition';
    zone.value = m.body || '';
    ligne.replaceWith(zone);
    zone.focus(); zone.setSelectionRange(zone.value.length, zone.value.length);
    zone.onkeydown = async (e) => {
      if (e.key === 'Escape') return dessinerFil();
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const corps = zone.value.trim();
      if (!corps) return toast('Un message vide se supprime, il ne se modifie pas', 'warn');
      try { await db.update('messages', id, { body: corps, edited_at: new Date().toISOString() }); }
      catch (err) { toast(err.message, 'err'); dessinerFil(); }
    };
  }

  // ----- Ce dont on parle, et ce qu'on joint -----
  const dessinerContexte = () => {
    bacContexte.hidden = !contexteActif;
    if (!contexteActif) { bacContexte.innerHTML = ''; return; }
    bacContexte.innerHTML = `<span class="msg-apropos">↗ <b>${esc(contexteActif.label)}</b>
      <button type="button" title="Ne pas joindre ce renvoi">×</button></span>`;
    bacContexte.querySelector('button').onclick = () => { contexteActif = null; dessinerContexte(); texte.focus(); };
  };

  const dessinerJointes = () => {
    bacJointes.hidden = !enAttente.length;
    bacJointes.innerHTML = enAttente.map((f, i) => `<span class="msg-jointe">${estImage({ mime: f.type, name: f.name }) ? '🖼' : '📄'}<span>${esc(f.name)}</span><button type="button" data-retirer="${i}" title="Retirer">×</button></span>`).join('');
    bacJointes.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      enAttente.splice(Number(b.dataset.retirer), 1); dessinerJointes();
    });
  };

  // ----- Interactions -----
  // Le fil ne se recolle en bas que si on y était déjà : sinon on arracherait
  // la lecture de quelqu'un en train de remonter l'historique.
  zoneFil.onscroll = () => { bas = zoneFil.scrollHeight - zoneFil.scrollTop - zoneFil.clientHeight < 60; };

  texte.value = brouillons.get(cleBrouillon) || '';
  const hauteurAuto = () => { texte.style.height = 'auto'; texte.style.height = Math.min(160, texte.scrollHeight) + 'px'; };
  texte.oninput = () => { brouillons.set(cleBrouillon, texte.value); hauteurAuto(); };
  texte.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  };
  // Coller une capture d'écran ou glisser une photo revient à joindre un fichier.
  texte.onpaste = (e) => {
    const fs = [...(e.clipboardData?.files || [])];
    if (fs.length) { e.preventDefault(); enAttente.push(...fs); dessinerJointes(); }
  };
  hote.ondragover = (e) => { e.preventDefault(); hote.classList.add('depot'); };
  hote.ondragleave = () => hote.classList.remove('depot');
  hote.ondrop = (e) => {
    e.preventDefault(); hote.classList.remove('depot');
    const fs = [...(e.dataTransfer?.files || [])];
    if (fs.length) { enAttente.push(...fs); dessinerJointes(); }
  };
  champFichiers.onchange = () => { enAttente.push(...champFichiers.files); champFichiers.value = ''; dessinerJointes(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const corps = texte.value;
    const fichiers = enAttente;
    const ctx = contexteActif;
    if (!corps.trim() && !fichiers.length && !ctx) return;
    bouton.disabled = true;
    try {
      texte.value = ''; enAttente = []; contexteActif = null; brouillons.delete(cleBrouillon);
      dessinerJointes(); dessinerContexte(); hauteurAuto();
      bas = true;
      await envoyer(fil, corps, fichiers, ctx);
      await marquerLu(fil.conv?.id);
      apresEnvoi?.();
    } catch (err) {
      toast(err.message, 'err');
      texte.value = corps; enAttente = fichiers; contexteActif = ctx;
      dessinerJointes(); dessinerContexte();
    } finally { bouton.disabled = false; }
  };

  dessinerFil(); dessinerContexte(); dessinerJointes(); hauteurAuto();

  return {
    redessiner: dessinerFil,
    focus() { texte.focus(); },
  };
}

// ---------- Une ligne de la liste, partagée par l'écran et la bulle ----------
function rangee(f, active) {
  const d = dernier(f.conv?.id);
  const n = nonLus(f.conv?.id);
  const t = teinteDe(f.conv);
  const apercu = d ? esc((d.body || '📎 pièce jointe').replace(/\s+/g, ' ').slice(0, 64))
    : (f.genre === 'canal' ? 'Aucun message' : 'Démarrer la discussion');
  return `<a href="#/messagerie/${f.cle}" class="msg-item ${f.genre} ${active ? 'on' : ''} ${n ? 'a-lire' : ''}" data-cle="${f.cle}" ${t ? `style="--t:${t}"` : ''}>
    ${vignette(f)}
    <span class="msg-item-corps">
      <b>${esc(nomDe(f.conv, f.user))}</b>
      <small class="muted">${apercu}</small>
    </span>
    ${n ? `<i class="msg-cnt">${n}</i>` : d ? `<time class="muted">${daysSince(d.created_at) === 0 ? heure(d.created_at) : jourCourt(d.created_at)}</time>` : ''}
  </a>`;
}

// Les deux familles, chacune sous son intitulé : c'est ce qui distingue d'un
// coup d'œil un canal d'équipe d'un échange à deux.
function listeHtml(gardes, active) {
  const canaux = gardes.filter(f => f.genre === 'canal');
  const gens = gardes.filter(f => f.genre === 'direct');
  const bloc = (titre, l, note) => l.length ? `<div class="msg-famille">
      <div class="msg-famille-tete">${titre}<span>${l.length}</span></div>
      ${l.map(f => rangee(f, f.cle === active)).join('')}
      ${note ? `<p class="msg-famille-note">${note}</p>` : ''}
    </div>` : '';
  return bloc('Canaux d’équipe', canaux)
    + bloc('Messages directs', gens)
    || '<div class="empty small">Aucune conversation ne correspond.</div>';
}

function participantsHtml(f) {
  if (f.genre === 'direct') return `<span class="msg-gens-ligne">${esc(f.user.full_name)}</span>`;
  const ids = gensDe(f.conv);
  return `<span class="msg-gens-ligne">
    ${ids.slice(0, 6).map(id => `<span class="avatar xs" title="${esc(userName(id))}">${esc(initials(id))}</span>`).join('')}
    ${ids.length > 6 ? `<span class="avatar xs plus">+${ids.length - 6}</span>` : ''}
    <em>${ids.length} personne${ids.length > 1 ? 's' : ''}</em></span>`;
}

// =====================================================================
//  L'écran plein — #/messagerie
// =====================================================================
export const messageriePage = {
  title: () => 'Messagerie',
  render(root, param) {
    const tous = fils();
    if (!tous.length) {
      root.innerHTML = '<div class="card"><div class="empty">Aucune conversation. Vérifiez que la migration de messagerie est bien passée dans Supabase.</div></div>';
      return {};
    }
    const ouvert = filPar(param) || tous[0];
    const etat = { q: '' };
    const pose = poserEspace(root);
    const t = teinteDe(ouvert.conv);

    root.innerHTML = `
      <div class="esp-app msg-app" ${t ? `style="--t:${t}"` : ''}>
        <aside class="msg-cote">
          <div class="msg-cote-tete">
            <input type="search" id="msg-q" placeholder="Rechercher une personne, un message…" autocomplete="off">
          </div>
          <nav class="msg-liste" id="msg-liste"></nav>
        </aside>
        <section class="msg-vue">
          <header class="msg-tete ${ouvert.genre}">
            ${vignette(ouvert, 'lg')}
            <div>
              <h2>${esc(nomDe(ouvert.conv, ouvert.user))}</h2>
              <span class="muted small" id="msg-sous"></span>
            </div>
            <div class="msg-tete-gens">${participantsHtml(ouvert)}</div>
          </header>
          <div class="msg-hote" id="msg-hote"></div>
        </section>
      </div>`;

    const vue = vueConversation(root.querySelector('#msg-hote'), ouvert, { apresEnvoi: () => dessinerListe() });

    const dessinerListe = () => {
      const ts = terms(etat.q);
      const gardes = fils().filter(f => !ts.length
        || hit([nomDe(f.conv, f.user)], ts)
        || messagesDe(f.conv?.id).some(m => hit([m.body], ts)));
      root.querySelector('#msg-liste').innerHTML = listeHtml(gardes, ouvert.cle);
    };

    const sousTitre = () => {
      const el = root.querySelector('#msg-sous'); if (!el) return;
      el.textContent = ouvert.genre === 'canal'
        ? (ouvert.conv.activity
          ? `Canal de structure — toute l’équipe ${ACTIVITIES[ouvert.conv.activity].label} et la direction`
          : 'Canal de la direction — elle seule y accède')
        : 'Message direct — vous deux, personne d’autre';
    };

    root.querySelector('#msg-q').oninput = (e) => { etat.q = e.target.value; dessinerListe(); };

    const dessiner = () => { dessinerListe(); vue.redessiner(); sousTitre(); };
    dessiner();
    vue.focus();
    marquerLu(ouvert.conv?.id);

    const minuteur = setInterval(async () => {
      if (document.hidden) return;
      try { if (await db.refresh(TABLES)) marquerLu(ouvert.conv?.id); } catch { /* réseau : on réessaiera */ }
    }, RAFRAICHIR_MS);

    return {
      refresh: dessiner,
      destroy() { clearInterval(minuteur); pose.retirer(); },
    };
  },
};

// =====================================================================
//  La bulle — présente sur toutes les pages
// =====================================================================
// Montée une seule fois par app.js, en dehors de #content : elle survit aux
// changements d'écran, donc une conversation en cours de frappe n'est pas perdue
// quand on va vérifier une fiche. Deux vues : la liste, puis le fil choisi.
export function monterBulle(parent) {
  if (document.getElementById('msg-bulle')) return;

  const boite = document.createElement('div');
  boite.id = 'msg-bulle';
  boite.className = 'msg-bulle-zone';
  boite.innerHTML = `
    <section class="msg-panneau" hidden>
      <header class="msg-panneau-tete">
        <button type="button" class="icon-btn msg-retour" title="Toutes les conversations" hidden>←</button>
        <div class="msg-panneau-titre"></div>
        <button type="button" class="icon-btn" data-plein title="Ouvrir en grand">⤢</button>
        <button type="button" class="icon-btn" data-fermer title="Fermer">✕</button>
      </header>
      <div class="msg-panneau-corps">
        <div class="msg-panneau-liste">
          <div class="msg-cote-tete"><input type="search" class="msg-q-bulle" placeholder="Rechercher…" autocomplete="off"></div>
          <nav class="msg-liste"></nav>
        </div>
        <div class="msg-hote" hidden></div>
      </div>
    </section>
    <button type="button" class="msg-declencheur" title="Messagerie" aria-expanded="false">
      <svg viewBox="0 0 20 20" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v7a1.5 1.5 0 0 1-1.5 1.5H8l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5z"/><path d="M6.5 7.6h7M6.5 10.4h4.5"/></svg>
      <i class="msg-cnt" hidden></i>
    </button>`;
  parent.appendChild(boite);

  const panneau = boite.querySelector('.msg-panneau');
  const declencheur = boite.querySelector('.msg-declencheur');
  const titre = boite.querySelector('.msg-panneau-titre');
  const retour = boite.querySelector('.msg-retour');
  const vueListe = boite.querySelector('.msg-panneau-liste');
  const nav = boite.querySelector('.msg-panneau-liste .msg-liste');
  const recherche = boite.querySelector('.msg-q-bulle');
  const hote = boite.querySelector('.msg-panneau-corps .msg-hote');
  const pastille = declencheur.querySelector('.msg-cnt');

  let ouvert = false;
  let vue = null;
  let courant = null;        // clé du fil ouvert, ou null = on est sur la liste
  let q = '';
  let dernierTour = 0;

  const majPastille = () => {
    const n = messagesNonLus();
    pastille.hidden = !n;
    pastille.textContent = n > 99 ? '99+' : n;
  };

  const dessinerListe = () => {
    const ts = terms(q);
    const gardes = fils().filter(f => !ts.length
      || hit([nomDe(f.conv, f.user)], ts)
      || messagesDe(f.conv?.id).some(m => hit([m.body], ts)));
    nav.innerHTML = listeHtml(gardes, courant);
    nav.querySelectorAll('[data-cle]').forEach(a => a.onclick = (e) => { e.preventDefault(); ouvrirFil(a.dataset.cle); });
  };

  const montrerListe = () => {
    courant = null; vue = null;
    vueListe.hidden = false; hote.hidden = true;
    retour.hidden = true;
    titre.innerHTML = '<b>Messagerie</b>';
    panneau.style.removeProperty('--t');
    dessinerListe();
    recherche.focus();
  };

  const ouvrirFil = (cle) => {
    const f = filPar(cle); if (!f) return;
    courant = f.cle;
    localStorage.setItem(DERNIERE, f.cle);
    vueListe.hidden = true; hote.hidden = false;
    retour.hidden = false;
    const t = teinteDe(f.conv);
    if (t) panneau.style.setProperty('--t', t); else panneau.style.removeProperty('--t');
    titre.innerHTML = `${vignette(f, 'sm')}<span><b>${esc(nomDe(f.conv, f.user))}</b>
      <small class="muted">${f.genre === 'canal' ? `${gensDe(f.conv).length} personnes` : 'Message direct'}</small></span>`;
    vue = vueConversation(hote, f, {
      contexte: contexteCourant(),
      apresEnvoi: () => majPastille(),
      surRenvoi: () => fermer(),   // laisser voir l'écran vers lequel on renvoie
    });
    marquerLu(f.conv?.id);
    majPastille();
    vue.focus();
  };

  const ouvrir = () => {
    ouvert = true;
    panneau.hidden = false;
    declencheur.setAttribute('aria-expanded', 'true');
    boite.classList.add('ouverte');
    const derniere = localStorage.getItem(DERNIERE);
    const aLire = fils().find(f => nonLus(f.conv?.id));
    // Ce qui appelle d'abord : un message non lu, sinon la dernière conversation ouverte.
    if (aLire) ouvrirFil(aLire.cle);
    else if (derniere && filPar(derniere)) ouvrirFil(derniere);
    else montrerListe();
  };

  const fermer = () => {
    ouvert = false;
    panneau.hidden = true;
    declencheur.setAttribute('aria-expanded', 'false');
    boite.classList.remove('ouverte');
  };

  declencheur.onclick = () => ouvert ? fermer() : ouvrir();
  boite.querySelector('[data-fermer]').onclick = () => fermer();
  retour.onclick = () => montrerListe();
  boite.querySelector('[data-plein]').onclick = () => { const c = courant; fermer(); location.hash = `#/messagerie/${c || ''}`; };
  recherche.oninput = (e) => { q = e.target.value; dessinerListe(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvert && !document.getElementById('modal')) fermer(); });

  // Le CRM n'a pas de canal temps réel. Bulle ouverte, on va voir souvent ;
  // fermée, une fois par minute suffit à tenir la pastille à jour.
  setInterval(async () => {
    if (document.hidden || !scope.user) return;
    if (!ouvert && Date.now() - dernierTour < RAFRAICHIR_FERME_MS) return;
    dernierTour = Date.now();
    try {
      const change = await db.refresh(TABLES);
      if (change && ouvert && courant) marquerLu(filPar(courant)?.conv?.id);
    } catch { /* réseau : on réessaiera */ }
  }, RAFRAICHIR_MS);

  db.onChange(() => {
    majPastille();
    if (!ouvert) return;
    if (courant) vue?.redessiner(); else dessinerListe();
  });

  // La bulle n'a pas sa place sur l'écran de messagerie lui-même.
  const selonEcran = () => {
    const dessus = (location.hash || '').startsWith('#/messagerie');
    boite.hidden = dessus;
    if (dessus && ouvert) fermer();
  };
  window.addEventListener('hashchange', selonEcran);
  selonEcran();
  majPastille();
}
