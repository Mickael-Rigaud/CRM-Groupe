// La page publique de signature du cahier des charges (11/11/2026).
//
// Le client arrive par un lien `signature.html?t=<jeton>` reçu par mail ou par
// SMS. La page lit son cahier auprès de l'Edge Function `cahier-signature`,
// l'affiche (travaux SANS PRIX, dates, précisions), et le fait signer au doigt.
//
// ⚠ AUCUN MODULE DU CRM ICI, ET C'EST VOULU : ni `db.js`, ni `ui.js`, ni le pad
// de signature de l'application (qui tire `ui.js`, donc la base). Cette page
// est ouverte par des clients, sans compte : elle ne doit rien charger qui
// tente une session ou lise une table. Seule `config.js` (l'adresse publique
// de Supabase) est reprise.
import { CONFIG } from './config.js';

const page = document.getElementById('page');
const LOGO = 'assets/logos/rgd-complet.png';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLongue = (iso) => { if (!iso) return ''; const [a, m, j] = iso.slice(0, 10).split('-').map(Number); return `${j} ${MOIS[m - 1]} ${a}`; };
const quand = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const jeton = new URLSearchParams(location.search).get('t') || '';

async function appeler(corps) {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/cahier-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY },
    body: JSON.stringify({ t: jeton, ...corps }),
  });
  const rep = await r.json().catch(() => ({}));
  if (!r.ok || rep.ok === false) { const e = new Error(rep.erreur || `Erreur ${r.status}`); e.cahier = rep.cahier; throw e; }
  return rep;
}

const entete = () => `<header><img src="${LOGO}" alt="RGD Renova"><span>Cahier des charges<br>à valider avant travaux</span></header>`;
const pied = () => '<footer>RGD Renova · <a href="https://rgdrenova.fr" style="color:inherit">rgdrenova.fr</a></footer>';

function postesHtml(postes) {
  let lot = null;
  return postes.map(p => {
    let t = '';
    if ((p.lot || '') !== lot) { lot = p.lot || ''; if (lot) t += `<div class="lot">${esc(lot)}</div>`; }
    return t + `<div class="poste"><div>${esc(p.designation)}${p.detail ? `<small>${esc(p.detail)}</small>` : ''}</div>
      <em>${esc([p.quantite, p.unite].filter(Boolean).join(' '))}</em></div>`;
  }).join('');
}

function dessiner(c, erreur = '') {
  page.innerHTML = `
    ${entete()}
    <h1>${esc(c.objet || 'Cahier des charges')}</h1>
    <p class="sous">${c.signe ? 'Cahier des charges signé.' : 'Merci de relire les travaux prévus, puis de signer en bas de page.'}</p>
    <section class="carte infos">
      <div><span>Client</span><b>${esc(c.client) || '—'}</b></div>
      <div><span>Devis</span><b>${esc(c.devis) || '—'}</b></div>
      <div class="large"><span>Adresse du chantier</span><b>${esc(c.adresse) || '—'}</b></div>
      <div><span>Début prévu</span><b>${esc(dateLongue(c.debut))}</b></div>
      <div><span>Fin prévue</span><b>${esc(dateLongue(c.fin))}</b></div>
    </section>
    <section class="carte"><h2>Travaux prévus</h2>${postesHtml(c.postes || [])}</section>
    ${c.precisions ? `<section class="carte"><h2>À la charge du client</h2><p class="texte">${esc(c.precisions)}</p></section>` : ''}
    ${erreur ? `<div class="message erreur">${esc(erreur)}</div>` : ''}
    ${c.signe ? `
      <section class="carte signe">
        <p class="titre">Signé${c.signe_par ? ` par ${esc(c.signe_par)}` : ''}</p>
        <div>le ${esc(quand(c.signe_le))}</div>
        ${c.signature ? `<img src="${c.signature}" alt="Signature">` : ''}
        <p class="aide">Merci. RGD Renova a reçu votre accord. Vous pouvez garder une copie de cette page.</p>
        <div class="boutons imprimer"><button type="button" id="imprimer">Imprimer ou enregistrer en PDF</button></div>
      </section>` : `
      <section class="carte accord">
        <h2>Bon pour accord</h2>
        <p>En signant, je déclare avoir pris connaissance du présent cahier des charges et en valider le contenu avant le
          démarrage des travaux. Il complète le devis${c.devis ? ` n° ${esc(c.devis)}` : ''}, qui reste seul à faire foi pour les prix.</p>
        <label class="case"><input type="checkbox" id="accepte"> J’ai lu le cahier des charges et je l’accepte.</label>
        <label class="champ"><span>Nom et prénom</span><input id="nom" autocomplete="name" value="${esc(c.client)}"></label>
        <span class="champ"><span>Signature</span></span>
        <canvas id="toile" aria-label="Zone de signature"></canvas>
        <p class="aide">Signez avec le doigt (ou la souris) dans le cadre.</p>
        <div class="boutons">
          <button type="button" id="effacer">Effacer</button>
          <button type="button" class="principal" id="signer" disabled>Signer le cahier des charges</button>
        </div>
      </section>`}
    ${pied()}`;
  if (c.signe) { document.getElementById('imprimer').onclick = () => window.print(); return; }
  brancherSignature(c);
}

// Le pad : une toile en pixels réels, un trait continu, et « Signer » ne
// s'active qu'avec une signature, la case cochée et un nom.
function brancherSignature(c) {
  const toile = document.getElementById('toile');
  const ctx = toile.getContext('2d');
  const bouton = document.getElementById('signer');
  const accepte = document.getElementById('accepte');
  const nom = document.getElementById('nom');
  let vierge = true, trace = false, dernier = null;
  const dimensionner = () => {
    if (!vierge) return;
    const dpr = window.devicePixelRatio || 1;
    toile.width = Math.round(toile.clientWidth * dpr); toile.height = Math.round(toile.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
  };
  dimensionner(); requestAnimationFrame(dimensionner); window.addEventListener('resize', dimensionner);
  const point = (e) => { const r = toile.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const etat = () => { bouton.disabled = vierge || !accepte.checked || nom.value.trim().length < 2; };
  toile.addEventListener('pointerdown', (e) => { trace = true; dernier = point(e); try { toile.setPointerCapture(e.pointerId); } catch { /* */ } e.preventDefault(); });
  toile.addEventListener('pointermove', (e) => {
    if (!trace) return;
    const p = point(e);
    ctx.beginPath(); ctx.moveTo(dernier.x, dernier.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    dernier = p; vierge = false; etat(); e.preventDefault();
  });
  const fin = () => { trace = false; };
  toile.addEventListener('pointerup', fin); toile.addEventListener('pointercancel', fin); toile.addEventListener('pointerleave', fin);
  document.getElementById('effacer').onclick = () => { ctx.clearRect(0, 0, toile.width, toile.height); vierge = true; etat(); };
  accepte.onchange = etat; nom.oninput = etat;
  bouton.onclick = async () => {
    bouton.disabled = true; bouton.textContent = 'Envoi…';
    try {
      const rep = await appeler({ action: 'signer', nom: nom.value.trim(), image: toile.toDataURL('image/png'), accepte: accepte.checked });
      dessiner(rep.cahier);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      if (e.cahier) { dessiner(e.cahier, e.message); return; }
      bouton.textContent = 'Signer le cahier des charges'; etat();
      const m = document.createElement('div'); m.className = 'message erreur'; m.textContent = e.message;
      bouton.closest('section').appendChild(m);
    }
  };
}

(async () => {
  if (!jeton) { page.innerHTML = `${entete()}<p class="vide">Ce lien est incomplet. Utilisez le lien reçu de RGD Renova.</p>${pied()}`; return; }
  try {
    const rep = await appeler({ action: 'lire' });
    dessiner(rep.cahier);
  } catch (e) {
    page.innerHTML = `${entete()}<p class="vide">${esc(e.message)}</p>${pied()}`;
  }
})();
