// Messagerie interne : les échanges de l'équipe entre elle.
//
// Deux formes, la même table : les CANAUX (un par structure, plus « Groupe »),
// où l'on entre parce que la structure est sur son profil, et les conversations
// PRIVÉES à deux, nominatives. Rien ici n'est rattaché à un client : l'historique
// d'un contact ou d'une affaire, c'est la table `events`, ailleurs.
//
// Les pièces jointes passent par la table `documents` et le bucket du même nom,
// avec entity_type = 'messages' — rien de nouveau à installer côté stockage.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, toast, confirm, userName, initials, fmtDate, daysSince, openModal, closeModal, terms, hit } from '../ui.js';
import { poserEspace } from './espace.js';

const MAX_MO = 25;
const RAFRAICHIR_MS = 8000;          // le CRM n'a pas de temps réel : on va voir de temps en temps
const TABLES = ['conversations', 'conversation_members', 'messages', 'message_reads', 'documents'];

// Les brouillons survivent au changement de conversation et au redessin.
const brouillons = new Map();
// Les liens de téléchargement Supabase sont signés une heure : on les garde le temps de la visite.
const liens = new Map();

const estImage = (d) => /^image\//.test(d.mime || '') || /\.(jpe?g|png|gif|webp|avif|heic)$/i.test(d.name || '');
const poids = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const jourCourt = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

// ---------- Lecture des données ----------
const messagesDe = (cid) => db.t('messages').filter(m => m.conversation_id === cid)
  .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
const piecesDe = (mid) => db.t('documents').filter(d => d.entity_type === 'messages' && d.entity_id === mid);
const membresDe = (cid) => db.t('conversation_members').filter(m => m.conversation_id === cid).map(m => m.user_id);
const dernier = (cid) => { const l = messagesDe(cid); return l[l.length - 1] || null; };

const luJusqua = (cid) => db.t('message_reads')
  .find(r => r.conversation_id === cid && r.user_id === scope.user?.id)?.last_read_at || '';

const nonLus = (cid) => {
  const depuis = luJusqua(cid);
  return messagesDe(cid).filter(m => m.author_id !== scope.user?.id && (m.created_at || '') > depuis).length;
};

// Le nom d'une conversation privée, c'est celui d'en face.
function nomDe(c) {
  if (c.kind === 'canal') return c.title || c.slug;
  const autres = membresDe(c.id).filter(u => u !== scope.user?.id);
  return autres.length ? autres.map(userName).join(', ') : 'Conversation';
}
const teinteDe = (c) => (c.kind === 'canal' && c.activity && ACTIVITIES[c.activity]?.color) || null;

// Canaux dans l'ordre du CRM, puis les privées, la plus récemment active en tête.
function listeVisible() {
  const vues = scope.conversations();
  const ordre = ['groupe', 'rgd', 'btp', 'courtage', 'propulsion'];
  const canaux = vues.filter(c => c.kind === 'canal')
    .sort((a, b) => ordre.indexOf(a.slug) - ordre.indexOf(b.slug));
  const privees = vues.filter(c => c.kind === 'prive')
    .sort((a, b) => ((dernier(b.id)?.created_at) || b.created_at || '').localeCompare((dernier(a.id)?.created_at) || a.created_at || ''));
  return [...canaux, ...privees];
}

// Total pour la pastille du menu — exporté, app.js s'en sert.
export function messagesNonLus() {
  if (!scope.user) return 0;
  return listeVisible().reduce((s, c) => s + nonLus(c.id), 0);
}

// ---------- Écriture ----------
async function marquerLu(cid) {
  if (!scope.user) return;
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

async function envoyer(cid, texte, fichiers) {
  const corps = (texte || '').trim();
  if (!corps && !fichiers.length) return;
  const msg = await db.insert('messages', { conversation_id: cid, author_id: scope.user.id, body: corps || null });
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

// ---------- La page ----------
export const messageriePage = {
  title: () => 'Messagerie',
  render(root, param) {
    const liste = listeVisible();
    if (!liste.length) {
      root.innerHTML = '<div class="card"><div class="empty">Aucune conversation. Vérifiez que le lot 12 est bien passé dans Supabase.</div></div>';
      return {};
    }
    // L'adresse porte le raccourci du canal (#/messagerie/rgd) ou l'identifiant d'une privée.
    const ouverte = liste.find(c => c.slug === param) || liste.find(c => c.id === param) || liste[0];
    const etat = { q: '', bas: true };

    // On reprend la coquille pleine hauteur des espaces de structure : deux colonnes,
    // plus de marges du CRM, la date du jour masquée (c'est `.esp-app` qui la masque).
    const pose = poserEspace(root);
    root.innerHTML = `
      <div class="esp-app msg-app" ${teinteDe(ouverte) ? `style="--t:${teinteDe(ouverte)}"` : ''}>
        <aside class="msg-cote">
          <div class="msg-cote-tete">
            <input type="search" id="msg-q" placeholder="Rechercher…" autocomplete="off">
            <button class="btn sm" id="msg-new" title="Nouvelle conversation privée">+</button>
          </div>
          <nav class="msg-liste" id="msg-liste"></nav>
        </aside>
        <section class="msg-vue">
          <header class="msg-tete">
            <div>
              <h2>${teinteDe(ouverte) ? `<i class="msg-puce" style="background:${teinteDe(ouverte)}"></i>` : ''}${esc(nomDe(ouverte))}</h2>
              <span class="muted small" id="msg-sous"></span>
            </div>
            ${ouverte.kind === 'prive' ? '<button class="btn ghost sm" id="msg-quitter">Quitter</button>' : ''}
          </header>
          <div class="msg-fil" id="msg-fil"></div>
          <form class="msg-ecrire" id="msg-form">
            <div class="msg-jointes" id="msg-jointes" hidden></div>
            <div class="msg-saisie">
              <label class="msg-trombone" title="Joindre un document ou une photo">📎<input type="file" id="msg-fichiers" multiple hidden></label>
              <textarea id="msg-texte" rows="1" placeholder="Écrire à ${esc(nomDe(ouverte))}… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"></textarea>
              <button class="btn" type="submit" id="msg-envoi">Envoyer</button>
            </div>
          </form>
        </section>
      </div>`;

    const fil = root.querySelector('#msg-fil');
    const texte = root.querySelector('#msg-texte');
    const champFichiers = root.querySelector('#msg-fichiers');
    let enAttente = [];        // fichiers choisis, pas encore envoyés

    // ----- Dessin -----
    const dessinerListe = () => {
      const ts = terms(etat.q);
      const gardees = listeVisible().filter(c => !ts.length
        || hit([nomDe(c)], ts)
        || messagesDe(c.id).some(m => hit([m.body], ts)));
      root.querySelector('#msg-liste').innerHTML = gardees.map(c => {
        const d = dernier(c.id);
        const n = nonLus(c.id);
        const t = teinteDe(c);
        return `<a href="#/messagerie/${c.slug || c.id}" class="msg-item ${c.id === ouverte.id ? 'on' : ''}" ${t ? `style="--t:${t}"` : ''}>
          <span class="msg-item-ico">${c.kind === 'canal'
            ? (t ? `<i class="msg-puce" style="background:${t}"></i>` : '<i class="msg-puce msg-puce-groupe"></i>')
            : `<span class="avatar sm">${esc(initials(membresDe(c.id).find(u => u !== scope.user?.id)))}</span>`}</span>
          <span class="msg-item-corps">
            <b>${esc(nomDe(c))}</b>
            <small class="muted">${d ? esc((d.body || '📎 pièce jointe').replace(/\s+/g, ' ').slice(0, 60)) : 'Aucun message'}</small>
          </span>
          ${n ? `<i class="msg-cnt">${n}</i>` : d ? `<time class="muted">${daysSince(d.created_at) === 0 ? heure(d.created_at) : jourCourt(d.created_at)}</time>` : ''}
        </a>`;
      }).join('') || '<div class="empty small">Aucune conversation ne correspond.</div>';
    };

    const sousTitre = () => {
      const el = root.querySelector('#msg-sous'); if (!el) return;
      if (ouverte.kind === 'canal') {
        el.textContent = ouverte.activity
          ? `Canal de structure — visible par l’équipe ${ACTIVITIES[ouverte.activity].label} et la direction`
          : 'Canal ouvert à toute l’équipe';
      } else {
        el.textContent = `Conversation privée — ${membresDe(ouverte.id).map(userName).join(' et ')}`;
      }
    };

    const dessinerFil = () => {
      const msgs = messagesDe(ouverte.id);
      if (!msgs.length) {
        fil.innerHTML = '<div class="empty">Rien encore. Écrivez le premier message.</div>';
        return;
      }
      let jour = '';
      let precedent = null;
      fil.innerHTML = msgs.map(m => {
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
              : `<a href="#" class="msg-fichier" data-piece="${p.id}"><span class="msg-fichier-ico">📄</span><span><b>${esc(p.name)}</b><small class="muted">${poids(p.size || 0)}</small></span></a>`).join('')}</div>` : ''}
          </div>
          ${moi ? '<span class="msg-actions"><button class="icon-btn" data-editer title="Modifier">✎</button><button class="icon-btn" data-suppr title="Supprimer">🗑</button></span>' : ''}
        </div>`;
        return bloc;
      }).join('');

      brancherFil();
      chargerImages();
      if (etat.bas) fil.scrollTop = fil.scrollHeight;
    };

    // Les liens du corps d'un message sont cliquables, le reste est échappé.
    function lier(s) {
      return esc(s).replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
    }

    // Les vignettes demandent un lien signé ; on ne le demande qu'une fois par fichier.
    async function chargerImages() {
      for (const im of fil.querySelectorAll('img[data-src]')) {
        const chemin = im.dataset.src;
        delete im.dataset.src;
        try {
          if (!liens.has(chemin)) liens.set(chemin, await db.fileUrl(chemin));
          im.src = liens.get(chemin);
        } catch { im.closest('.msg-photo')?.classList.add('absente'); }
      }
    }

    function brancherFil() {
      fil.querySelectorAll('[data-piece]').forEach(a => a.onclick = async e => {
        e.preventDefault();
        const p = db.byId('documents', a.dataset.piece); if (!p) return;
        try { window.open(await db.fileUrl(p.storage_path), '_blank', 'noopener'); }
        catch (err) { toast(err.message, 'err'); }
      });
      fil.querySelectorAll('[data-suppr]').forEach(b => b.onclick = async () => {
        const m = db.byId('messages', b.closest('[data-msg]').dataset.msg);
        if (m) { try { await supprimerMessage(m); } catch (err) { toast(err.message, 'err'); } }
      });
      fil.querySelectorAll('[data-editer]').forEach(b => b.onclick = () => editer(b.closest('[data-msg]').dataset.msg));
    }

    function editer(id) {
      const m = db.byId('messages', id); if (!m) return;
      const ligne = fil.querySelector(`[data-msg="${id}"] .msg-corps`); if (!ligne) return;
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

    const dessinerJointes = () => {
      const bac = root.querySelector('#msg-jointes');
      bac.hidden = !enAttente.length;
      bac.innerHTML = enAttente.map((f, i) => `<span class="msg-jointe">${estImage({ mime: f.type, name: f.name }) ? '🖼' : '📄'} ${esc(f.name)} <button type="button" data-retirer="${i}" title="Retirer">×</button></span>`).join('');
      bac.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
        enAttente.splice(Number(b.dataset.retirer), 1); dessinerJointes();
      });
    };

    const dessiner = () => { dessinerListe(); dessinerFil(); sousTitre(); };

    // ----- Interactions -----
    root.querySelector('#msg-q').oninput = (e) => { etat.q = e.target.value; dessinerListe(); };
    root.querySelector('#msg-new').onclick = () => nouvelleConversation();
    root.querySelector('#msg-quitter')?.addEventListener('click', async () => {
      if (!await confirm(`Quitter la conversation avec ${nomDe(ouverte)} ? Vous ne la verrez plus, mais elle reste chez l’autre.`)) return;
      const moi = db.t('conversation_members').find(m => m.conversation_id === ouverte.id && m.user_id === scope.user.id);
      try {
        if (moi) await db.remove('conversation_members', moi.id);
        location.hash = '#/messagerie';
      } catch (err) { toast(err.message, 'err'); }
    });

    // Le fil ne se recolle en bas que si on y était déjà : sinon on arracherait
    // la lecture de quelqu'un en train de remonter l'historique.
    fil.onscroll = () => { etat.bas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 60; };

    texte.value = brouillons.get(ouverte.id) || '';
    const hauteurAuto = () => { texte.style.height = 'auto'; texte.style.height = Math.min(160, texte.scrollHeight) + 'px'; };
    texte.oninput = () => { brouillons.set(ouverte.id, texte.value); hauteurAuto(); };
    texte.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); root.querySelector('#msg-form').requestSubmit(); }
    };
    // Coller une capture d'écran ou glisser une photo revient à joindre un fichier.
    texte.onpaste = (e) => {
      const fs = [...(e.clipboardData?.files || [])];
      if (fs.length) { e.preventDefault(); enAttente.push(...fs); dessinerJointes(); }
    };
    const zone = root.querySelector('.msg-vue');
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('depot'); };
    zone.ondragleave = () => zone.classList.remove('depot');
    zone.ondrop = (e) => {
      e.preventDefault(); zone.classList.remove('depot');
      const fs = [...(e.dataTransfer?.files || [])];
      if (fs.length) { enAttente.push(...fs); dessinerJointes(); }
    };
    champFichiers.onchange = () => { enAttente.push(...champFichiers.files); champFichiers.value = ''; dessinerJointes(); };

    root.querySelector('#msg-form').onsubmit = async (e) => {
      e.preventDefault();
      const bouton = root.querySelector('#msg-envoi');
      const corps = texte.value;
      const fichiers = enAttente;
      if (!corps.trim() && !fichiers.length) return;
      bouton.disabled = true;
      try {
        texte.value = ''; enAttente = []; brouillons.delete(ouverte.id); dessinerJointes(); hauteurAuto();
        etat.bas = true;
        await envoyer(ouverte.id, corps, fichiers);
        await marquerLu(ouverte.id);
      } catch (err) {
        toast(err.message, 'err');
        texte.value = corps; enAttente = fichiers; dessinerJointes();
      } finally { bouton.disabled = false; }
    };

    function nouvelleConversation() {
      const autres = scope.users().filter(u => u.id !== scope.user?.id);
      const deja = new Map(listeVisible().filter(c => c.kind === 'prive')
        .map(c => [membresDe(c.id).find(u => u !== scope.user?.id), c.id]));
      const m = openModal('Nouvelle conversation', `<div class="msg-gens">
        ${autres.map(u => `<button type="button" data-qui="${u.id}"><span class="avatar">${esc(initials(u.id))}</span>
          <span><b>${esc(u.full_name)}</b>${deja.has(u.id) ? '<small class="muted">Conversation déjà ouverte</small>' : ''}</span></button>`).join('')
        || '<div class="empty">Vous êtes seul dans le CRM pour le moment.</div>'}
      </div>`);
      m.querySelectorAll('[data-qui]').forEach(b => b.onclick = async () => {
        const qui = b.dataset.qui;
        if (deja.has(qui)) { closeModal(true); location.hash = `#/messagerie/${deja.get(qui)}`; return; }
        try {
          const c = await db.insert('conversations', { kind: 'prive', slug: null, activity: null, title: null, created_by: scope.user.id });
          await db.insert('conversation_members', { conversation_id: c.id, user_id: scope.user.id });
          await db.insert('conversation_members', { conversation_id: c.id, user_id: qui });
          closeModal(true);
          location.hash = `#/messagerie/${c.id}`;
        } catch (err) { toast(err.message, 'err'); }
      });
    }

    // ----- Cycle de vie -----
    dessiner();
    hauteurAuto();
    texte.focus();
    marquerLu(ouverte.id);

    // Le CRM n'a pas de canal temps réel : on redemande les messages régulièrement,
    // et seulement ces tables-là. `db.refresh` ne prévient que s'il y a du nouveau.
    const minuteur = setInterval(async () => {
      if (document.hidden) return;
      try { if (await db.refresh(TABLES)) marquerLu(ouverte.id); } catch { /* réseau : on réessaiera */ }
    }, RAFRAICHIR_MS);

    return {
      refresh: dessiner,
      destroy() { clearInterval(minuteur); pose.retirer(); },
    };
  },
};
