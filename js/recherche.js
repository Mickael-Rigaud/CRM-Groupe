// =====================================================================
//  Recherche universelle — une loupe en haut, Ctrl+K partout
// ---------------------------------------------------------------------
//  Demande d'Élodie, 19/11/2026 : « retrouver un nom, un téléphone ou un
//  dossier en tapant trois lettres, quelle que soit la structure ».
//
//  UNE LIGNE PAR PERSONNE (ou par entreprise), pas une par table : Paul
//  Lemaire client de RGD et prospect du courtage est UN résultat, avec une
//  pastille par structure. Toucher la pastille ouvre la fiche de CETTE
//  structure ; toucher la ligne ouvre la première.
//
//  ⚠ CHAQUE STRUCTURE OUVRE SA PROPRE FICHE, on ne les unifie pas ici :
//   - RGD : la fiche RGD (`ouvrirProspectRgd`), qui tranche entre une fiche
//     client et une demande du site — elles n'ont ni les mêmes colonnes ni la
//     même étape ;
//   - Courtage, BTP, Propulsion : le dossier (`openDeal`), le plus récent ;
//   - sans dossier : la fiche contact ou organisation.
//
//  ⚠ LES DROITS NE SE REFONT PAS ICI. En production le serveur n'envoie que
//  ce que la personne a le droit de lire ; on reprend en plus les miroirs du
//  client (`canSeeContact`, `canSeeOrg`, `canSeeDeal`, `canRgd`) pour que le
//  mode démo dise la même chose. Et on lit `db.t('rgd_…')`, PAS `scope.rgd` :
//  ce dernier applique la vue choisie dans l'espace RGD et ferait disparaître
//  des fiches de la recherche selon l'écran qu'on a quitté.
// =====================================================================
import { db } from './data/db.js';
import { scope } from './data/scope.js';
import { ACTIVITIES } from './data/schema.js';
import { esc, norm } from './ui.js';
import { icon } from './icons.js';

const MAX = 30;
const chiffres = (s) => String(s || '').replace(/\D/g, '').replace(/^33(?=\d{9}$)/, '0');
const nomContact = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
const dateDe = (r) => String(r.updated_at || r.created_at || '');

// Toutes les personnes et entreprises lisibles, chacune avec ses « portes » :
// une par structure où elle a quelque chose.
function index() {
  const parCle = new Map();
  const entree = (cle, base) => {
    if (!parCle.has(cle)) parCle.set(cle, { ...base, portes: new Map() });
    return parCle.get(cle);
  };
  const porte = (e, structure, ouvrir, quand = '') => {
    const deja = e.portes.get(structure);
    if (!deja || quand > deja.quand) e.portes.set(structure, { structure, ouvrir, quand });
  };

  // Les dossiers (courtage, BTP, Propulsion — et ceux de RGD qui passent par le pipeline)
  const deals = db.t('deals').filter(d => d.status !== 'deleted' && scope.canSeeDeal(d));
  const dealsDe = new Map();
  for (const d of deals) {
    for (const k of [d.contact_id && 'c:' + d.contact_id, d.organisation_id && 'o:' + d.organisation_id].filter(Boolean)) {
      if (!dealsDe.has(k)) dealsDe.set(k, []);
      dealsDe.get(k).push(d);
    }
  }

  // ⚠ L'OUVRIER n'a que ses fiches RGD : la fiche contact et les dossiers des
  // autres structures sont des écrans qui lui sont fermés (`ouvrierPeut`).
  if (!scope.isOuvrier) {
  for (const c of db.t('contacts')) {
    if (c.archived_at || c.deleted_at || !scope.canSeeContact(c)) continue;
    const e = entree('c:' + c.id, {
      genre: 'personne', nom: nomContact(c) || c.email || 'Sans nom',
      tel: c.phone || c.mobile || '', email: c.email || '',
      ville: [c.postal_code, c.city].filter(Boolean).join(' '), societe: c.company || '',
      ouvrirFiche: (apres) => import('./pages/contacts.js').then(m => m.openContact(c.id, apres)),
    });
    for (const d of dealsDe.get('c:' + c.id) || []) {
      if (d.activity === 'rgd') continue;   // RGD ouvre sa propre fiche, plus bas
      porte(e, d.activity, (apres) => import('./pages/deal.js').then(m => m.openDeal(d.id, apres)), dateDe(d));
    }
  }
  for (const o of db.t('organisations')) {
    if (o.archived_at || o.deleted_at || !scope.canSeeOrg(o)) continue;
    const e = entree('o:' + o.id, {
      genre: 'entreprise', nom: o.name || 'Sans nom',
      tel: o.phone || '', email: o.email || '',
      ville: [o.postal_code, o.city].filter(Boolean).join(' '), societe: '',
      ouvrirFiche: (apres) => import('./pages/organisations.js').then(m => m.openOrg(o.id, apres)),
    });
    for (const d of dealsDe.get('o:' + o.id) || []) {
      if (d.activity === 'rgd') continue;
      porte(e, d.activity, (apres) => import('./pages/deal.js').then(m => m.openDeal(d.id, apres)), dateDe(d));
    }
  }

  }

  if (scope.canRgd) {
    const ouvrirRgd = (ligne, genre) => (apres) =>
      import('./pages/rgd-clients.js').then(m => m.ouvrirProspectRgd(ligne, genre, apres));
    const rattacher = (ligne, genre) => {
      const cle = ligne.contact_id ? 'c:' + ligne.contact_id : ligne.organisation_id ? 'o:' + ligne.organisation_id : '';
      let e = cle && parCle.get(cle);
      // Une demande du site sans contact créé porte ses propres colonnes.
      if (!e) {
        e = entree(cle || `${genre}:${ligne.id}`, {
          genre: 'personne',
          nom: `${ligne.prenom || ''} ${ligne.nom || ''}`.trim() || 'Demande sans nom',
          tel: ligne.telephone || '', email: ligne.email || '',
          ville: [ligne.code_postal, ligne.ville].filter(Boolean).join(' '), societe: ligne.societe || '',
          ouvrirFiche: ouvrirRgd(ligne, genre),
        });
      }
      porte(e, 'rgd', ouvrirRgd(ligne, genre), (genre === 'fiche' ? '2' : '1') + dateDe(ligne));
    };
    for (const f of db.t('rgd_clients') || []) rattacher(f, 'fiche');
    // Une demande déjà devenue fiche client n'ouvre pas une seconde porte RGD :
    // `porte` garde la fiche (préfixe « 2 », plus fort que « 1 »).
    for (const d of db.t('rgd_demandes') || []) rattacher(d, 'demande');
  }
  return [...parCle.values()];
}

function chercher(q, tout) {
  const mots = norm(q).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const num = chiffres(q);
  const res = [];
  for (const e of tout) {
    const texte = norm([e.nom, e.email, e.ville, e.societe].join(' '));
    const telOk = num.length >= 3 && chiffres(e.tel).includes(num);
    const motsOk = mots.every(m => texte.includes(m) || (/\d/.test(m) && chiffres(e.tel).includes(chiffres(m))));
    if (!telOk && !motsOk) continue;
    const n = norm(e.nom);
    // Le nom qui COMMENCE par ce qu'on tape d'abord, puis un mot du nom, puis le reste.
    const rang = n.startsWith(mots[0]) ? 0 : n.split(/\s+/).some(w => w.startsWith(mots[0])) ? 1 : telOk ? 2 : 3;
    res.push({ e, rang });
  }
  res.sort((a, b) => a.rang - b.rang || b.e.portes.size - a.e.portes.size || a.e.nom.localeCompare(b.e.nom, 'fr'));
  return res.slice(0, MAX).map(r => r.e);
}

// Les pastilles, dans l'ordre des structures de l'application.
const ORDRE = ['rgd', 'btp', 'courtage', 'propulsion'];
const portesDe = (e) => [...e.portes.values()].sort((a, b) => ORDRE.indexOf(a.structure) - ORDRE.indexOf(b.structure));

function surligner(texte, mots) {
  let h = esc(texte);
  for (const m of mots) {
    if (m.length < 2) continue;
    // Repère la position dans la version sans accents, surligne l'original.
    const n = norm(texte); const i = n.indexOf(m);
    if (i < 0) continue;
    const brut = texte.slice(i, i + m.length);
    h = h.replace(esc(brut), `<mark>${esc(brut)}</mark>`);
  }
  return h;
}

let ouvert = null;

export function ouvrirRecherche() {
  if (ouvert) { ouvert.querySelector('input')?.focus(); return; }
  const tout = index();
  let resultats = [];
  let actif = 0;
  const precedent = document.activeElement;

  const fond = document.createElement('div');
  fond.className = 'rch-fond';
  fond.innerHTML = `
    <div class="rch" role="dialog" aria-modal="true" aria-label="Rechercher">
      <div class="rch-champ">
        ${icon('search', 20)}
        <input type="search" placeholder="Un nom, un téléphone, un e-mail, une ville…" autocomplete="off" spellcheck="false" aria-label="Rechercher">
        <kbd>Échap</kbd>
      </div>
      <div class="rch-liste" role="listbox"></div>
      <div class="rch-pied"><span><kbd>↑</kbd><kbd>↓</kbd> choisir</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> depuis n’importe quel écran</span></div>
    </div>`;
  document.body.appendChild(fond);
  ouvert = fond;
  const champ = fond.querySelector('input');
  const liste = fond.querySelector('.rch-liste');

  const fermer = () => {
    fond.remove(); ouvert = null;
    document.removeEventListener('keydown', clavier, true);
    precedent?.focus?.();
  };
  const ouvrir = (e, structure) => {
    const p = structure ? e.portes.get(structure) : portesDe(e)[0];
    fermer();
    (p ? p.ouvrir : e.ouvrirFiche)(() => {});
  };

  const dessiner = () => {
    const q = champ.value.trim();
    resultats = chercher(q, tout);
    actif = Math.min(actif, Math.max(0, resultats.length - 1));
    if (!q) {
      liste.innerHTML = `<div class="rch-vide"><b>Tapez quelques lettres.</b>
        <span>${tout.length} personnes et entreprises dans ${scope.activityKeys.length > 1 ? 'vos structures' : 'votre structure'}.</span></div>`;
      return;
    }
    if (!resultats.length) {
      liste.innerHTML = `<div class="rch-vide"><b>Personne ne correspond à « ${esc(q)} ».</b>
        <span>Essayez le nom seul, ou les derniers chiffres du téléphone.</span></div>`;
      return;
    }
    const mots = norm(q).split(/\s+/).filter(Boolean);
    liste.innerHTML = resultats.map((e, i) => {
      const portes = portesDe(e);
      const sous = [e.societe, e.ville, e.tel, e.email].filter(Boolean).map(esc).join(' · ');
      return `<div class="rch-ligne ${i === actif ? 'actif' : ''}" role="option" aria-selected="${i === actif}" data-i="${i}">
        <span class="rch-av ${e.genre}">${e.genre === 'entreprise' ? icon('building', 16) : esc((e.nom.match(/\b\p{L}/gu) || ['?']).slice(0, 2).join('').toUpperCase())}</span>
        <span class="rch-txt"><b>${surligner(e.nom, mots)}</b><small>${sous || '&nbsp;'}</small></span>
        <span class="rch-portes">${portes.map(p => {
          const a = ACTIVITIES[p.structure];
          return `<button type="button" class="rch-porte" data-i="${i}" data-s="${esc(p.structure)}" style="--c:${esc(a?.color || '#6b7c89')}" title="Ouvrir dans ${esc(a?.label || p.structure)}">${esc(a?.short || a?.label || p.structure)}</button>`;
        }).join('') || '<span class="rch-porte sans">Fiche</span>'}</span>
      </div>`;
    }).join('');
    liste.querySelector('.actif')?.scrollIntoView({ block: 'nearest' });
  };

  const clavier = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fermer(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!resultats.length) return;
      ev.preventDefault();
      actif = (actif + (ev.key === 'ArrowDown' ? 1 : -1) + resultats.length) % resultats.length;
      dessiner();
    } else if (ev.key === 'Enter' && resultats[actif] && ev.target === champ) {
      ev.preventDefault(); ouvrir(resultats[actif]);
    }
  };
  document.addEventListener('keydown', clavier, true);
  champ.addEventListener('input', () => { actif = 0; dessiner(); });
  fond.addEventListener('mousedown', (ev) => { if (ev.target === fond) fermer(); });
  liste.addEventListener('click', (ev) => {
    const b = ev.target.closest('.rch-porte[data-s]');
    const l = ev.target.closest('.rch-ligne');
    if (!l) return;
    const e = resultats[Number(l.dataset.i)];
    if (e) ouvrir(e, b ? b.dataset.s : null);
  });
  liste.addEventListener('mousemove', (ev) => {
    const l = ev.target.closest('.rch-ligne');
    if (!l || Number(l.dataset.i) === actif) return;
    liste.querySelector('.actif')?.classList.remove('actif');
    l.classList.add('actif'); actif = Number(l.dataset.i);
  });
  dessiner();
  champ.focus();
}

// Ctrl+K (ou Cmd+K), et « / » hors d'un champ de saisie, comme dans la plupart des outils.
let branche = false;
export function brancherRecherche() {
  if (branche) return;
  branche = true;
  document.addEventListener('keydown', (ev) => {
    if (!scope.user) return;
    const saisie = ev.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.key.toLowerCase() === 'k') {
      ev.preventDefault(); ouvrirRecherche();
    } else if (ev.key === '/' && !saisie && !ev.ctrlKey && !ev.metaKey && !document.querySelector('.modal-backdrop, .modal')) {
      ev.preventDefault(); ouvrirRecherche();
    }
  });
}
