// Onglet « Communication » de RGD Renova et de BTP Expertise — le calendrier
// des contenus (08/10/2026, demandé par Élodie : « comme Metricool », en
// commençant par le calendrier ; le reporting des réseaux et des sites viendra
// ensuite, dans le même onglet).
//
// ⚠ UN SEUL FICHIER POUR LES DEUX STRUCTURES : `pageCommunication(cle)` rend
// l'écran de l'une ou de l'autre. Deux copies auraient divergé au premier
// réglage — c'est le même geste, seule la liste des réseaux change
// (`RESEAUX_DE` dans `js/data/communication.js`).
//
// ⚠ LE MOIS EST UNE GRILLE, LES IDÉES SONT À CÔTÉ : un contenu sans date n'a
// pas de case où se poser, et le cacher le ferait oublier. Le panneau « Idées
// et sans date » est le réservoir où l'on pioche ; on y glisse aussi un
// contenu qu'on retire du calendrier.
//
// ⚠ ON DÉPLACE AU GLISSER-DÉPOSER *ET* PAR LE FORMULAIRE : le glisser ne marche
// pas au doigt (déjà constaté sur les photos des réalisations), et il ne peut
// pas viser un jour d'un autre mois.
//
// ⚠ AUCUN `confirm()` DE `ui.js` : il remplacerait le formulaire ouvert, saisie
// comprise. La suppression se fait en deux clics sur le même bouton.
//
// ⚠ DIRECTION SEULE, miroir de la policy `communication_contenus_direction`.

import { scope } from '../data/scope.js';
import { esc, toast, openModal, closeModal, armerCroix } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre as cadreRgd } from './rgd-espace.js';
import { cadreBtp } from './btp.js';
import {
  RESEAUX, RESEAUX_DE, STATUTS, FORMATS, LIMITE_TEXTE,
  contenusDe, creerContenu, majContenu, supprimerContenu, deposerVisuel,
} from '../data/communication.js';

const CADRES = { rgd: cadreRgd, btp: cadreBtp };
const NOMS = { rgd: 'RGD Renova', btp: 'BTP Expertise' };
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Le jour LOCAL, jamais `toISOString()` : un contenu posé à 23 h serait daté
// du lendemain.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aujourdhui = () => iso(new Date());
const nomMois = (a, m) => new Date(a, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const jourLong = (s) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const pastilles = (reseaux) => (reseaux || []).filter(r => RESEAUX[r])
  .map(r => `<span class="com-rs" style="--rs:${RESEAUX[r].couleur}" title="${esc(RESEAUX[r].label)}">${esc(RESEAUX[r].court)}</span>`).join('');
const vignette = (c) => {
  const v = (c.visuels || [])[0];
  if (!v) return '';
  return v.type === 'video'
    ? '<span class="com-vign com-vign-video">▶</span>'
    : `<img class="com-vign" src="${esc(v.url)}" alt="" loading="lazy">`;
};
const titreDe = (c) => c.titre || (c.texte ? c.texte.split('\n')[0].slice(0, 60) : 'Sans titre');

export function pageCommunication(cle) {
  const hash = `#/${cle}/communication`;
  const cadre = CADRES[cle];
  return {
    title: () => `${NOMS[cle]} — Calendrier réseaux sociaux`,
    render(root) {
      if (!scope.activityKeys.includes(cle)) {
        root.innerHTML = `<div class="card"><div class="empty">Vous n’avez pas accès à ${esc(NOMS[cle])}.</div></div>`;
        return {};
      }
      const coquille = poserEspace(root);
      const auj = new Date();
      const state = { annee: auj.getFullYear(), mois: auj.getMonth(), reseau: '', statut: '' };

      const draw = () => {
        if (!scope.isDirection) {
          root.innerHTML = cadre(hash, 'Calendrier réseaux sociaux',
            '<section class="card"><div class="empty">La communication est réservée à la direction.</div></section>');
          return;
        }
        const tous = contenusDe(cle);
        const garde = (c) => (!state.reseau || (c.reseaux || []).includes(state.reseau))
          && (!state.statut || c.statut === state.statut);
        const visibles = tous.filter(garde);

        // La grille commence le lundi qui précède le 1er et finit le dimanche
        // qui suit le dernier jour : 5 ou 6 semaines selon le mois.
        const premier = new Date(state.annee, state.mois, 1);
        const debut = new Date(premier); debut.setDate(1 - ((premier.getDay() + 6) % 7));
        const dernier = new Date(state.annee, state.mois + 1, 0);
        const fin = new Date(dernier); fin.setDate(dernier.getDate() + (7 - ((dernier.getDay() + 6) % 7)) - 1);
        const jours = [];
        for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) jours.push(iso(d));

        const parJour = new Map();
        for (const c of visibles) {
          if (!c.date_prevue) continue;
          if (!parJour.has(c.date_prevue)) parJour.set(c.date_prevue, []);
          parJour.get(c.date_prevue).push(c);
        }
        for (const l of parJour.values()) l.sort((a, b) => String(a.heure || '99').localeCompare(String(b.heure || '99')));
        const sansDate = visibles.filter(c => !c.date_prevue)
          .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

        const prefixe = `${state.annee}-${String(state.mois + 1).padStart(2, '0')}`;
        const duMois = visibles.filter(c => (c.date_prevue || '').startsWith(prefixe));
        const ajd = aujourdhui();

        const puce = (c) => `<button type="button" class="com-puce" draggable="true" data-ouvrir="${esc(c.id)}"
            style="--st:${STATUTS[c.statut]?.couleur || '#94A3B8'}" title="${esc(STATUTS[c.statut]?.label || '')} — ${esc(titreDe(c))}">
          ${vignette(c)}
          <span class="com-puce-corps">
            <span class="com-puce-haut">${c.heure ? `<b>${esc(c.heure)}</b>` : ''}${pastilles(c.reseaux)}</span>
            <span class="com-puce-titre">${esc(titreDe(c))}</span>
          </span>
        </button>`;

        const caseJour = (j) => {
          const hors = !j.startsWith(prefixe);
          const liste = parJour.get(j) || [];
          return `<div class="com-jour${hors ? ' est-hors' : ''}${j === ajd ? ' est-auj' : ''}${j < ajd ? ' est-passe' : ''}" data-jour="${j}">
            <div class="com-jour-tete"><span class="com-num">${Number(j.slice(8))}</span>
              <button type="button" class="com-plus" data-nouveau="${j}" title="Nouveau contenu le ${esc(jourLong(j))}">+</button></div>
            ${liste.map(puce).join('')}
          </div>`;
        };

        // Sur téléphone la grille de sept colonnes est illisible : la même
        // donnée se lit en liste des seuls jours qui portent quelque chose.
        const liste = jours.filter(j => j.startsWith(prefixe) && parJour.has(j)).map(j => `
          <div class="com-ljour${j === ajd ? ' est-auj' : ''}">
            <div class="com-ljour-date">${esc(jourLong(j))}</div>
            ${parJour.get(j).map(puce).join('')}
          </div>`).join('') || '<div class="empty">Rien de prévu ce mois-ci.</div>';

        const reseaux = RESEAUX_DE[cle];
        const opt = (k, l, cur) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`;

        const corps = `
          <section class="com-barre">
            <div class="com-nav">
              <button type="button" class="btn ghost" data-mois="-1" aria-label="Mois précédent">‹</button>
              <h2>${esc(nomMois(state.annee, state.mois))}</h2>
              <button type="button" class="btn ghost" data-mois="1" aria-label="Mois suivant">›</button>
              <button type="button" class="btn ghost" data-mois="0">Aujourd’hui</button>
            </div>
            <div class="com-filtres">
              <div class="com-rs-filtre">
                <button type="button" data-reseau="" class="${!state.reseau ? 'actif' : ''}">Tous</button>
                ${reseaux.map(r => `<button type="button" data-reseau="${r}" class="${state.reseau === r ? 'actif' : ''}"
                  style="--rs:${RESEAUX[r].couleur}">${esc(RESEAUX[r].label)}</button>`).join('')}
              </div>
              <select id="com-statut" class="filter-input">${opt('', 'Tous les statuts', state.statut)}
                ${Object.entries(STATUTS).map(([k, v]) => opt(k, v.label, state.statut)).join('')}</select>
              <button type="button" class="btn" data-nouveau="">+ Nouveau contenu</button>
            </div>
          </section>

          <div class="com-legende">
            ${Object.entries(STATUTS).map(([k, v]) => `<span style="--st:${v.couleur}"><i></i>${esc(v.label)}
              <b>${duMois.filter(c => c.statut === k).length}</b></span>`).join('')}
            <span class="com-legende-total">${duMois.length} contenu${duMois.length > 1 ? 's' : ''} ce mois-ci</span>
          </div>

          <div class="com-corps">
            <section class="com-cal">
              <div class="com-grille">
                ${JOURS.map(j => `<div class="com-jsem">${j}</div>`).join('')}
                ${jours.map(caseJour).join('')}
              </div>
              <div class="com-liste">${liste}</div>
            </section>
            <aside class="com-idees" data-jour="">
              <h3>Idées et sans date <span>${sansDate.length}</span></h3>
              <p class="small muted">Glissez un contenu sur un jour pour le programmer, ou ici pour le retirer du calendrier.</p>
              ${sansDate.map(puce).join('') || '<div class="com-vide">Aucune idée en réserve.</div>'}
              <button type="button" class="btn ghost com-idee-plus" data-nouveau="" data-idee="1">+ Noter une idée</button>
            </aside>
          </div>`;

        root.innerHTML = cadre(hash, 'Calendrier réseaux sociaux', corps);

        root.querySelectorAll('[data-mois]').forEach(b => b.onclick = () => {
          const pas = Number(b.dataset.mois);
          if (!pas) { state.annee = auj.getFullYear(); state.mois = auj.getMonth(); }
          else {
            const d = new Date(state.annee, state.mois + pas, 1);
            state.annee = d.getFullYear(); state.mois = d.getMonth();
          }
          draw();
        });
        root.querySelectorAll('[data-reseau]').forEach(b => b.onclick = () => { state.reseau = b.dataset.reseau; draw(); });
        root.querySelector('#com-statut').onchange = (e) => { state.statut = e.target.value; draw(); };
        root.querySelectorAll('[data-nouveau]').forEach(b => b.onclick = (e) => {
          e.stopPropagation();
          formulaire(cle, null, { date_prevue: b.dataset.nouveau || null, statut: b.dataset.idee ? 'idee' : 'brouillon' });
        });
        root.querySelectorAll('[data-ouvrir]').forEach(b => b.onclick = (e) => {
          e.stopPropagation();
          const c = tous.find(x => x.id === b.dataset.ouvrir);
          if (c) formulaire(cle, c);
        });

        // Glisser-déposer : une puce vers un jour (ou vers les idées, pour la
        // sortir du calendrier). La DURÉE n'existe pas ici, seule la date bouge ;
        // reposée sur son propre jour, rien n'est écrit.
        root.querySelectorAll('.com-puce').forEach(p => p.ondragstart = (e) => {
          e.dataTransfer.setData('text/plain', p.dataset.ouvrir);
          e.dataTransfer.effectAllowed = 'move';
        });
        root.querySelectorAll('[data-jour]').forEach(z => {
          // ⚠ `dragover` DOIT ÊTRE ANNULÉ pour que `drop` existe.
          z.ondragover = (e) => { e.preventDefault(); z.classList.add('survol'); };
          z.ondragleave = () => z.classList.remove('survol');
          z.ondrop = async (e) => {
            e.preventDefault(); z.classList.remove('survol');
            const id = e.dataTransfer.getData('text/plain');
            const c = tous.find(x => x.id === id);
            const jour = z.dataset.jour || null;
            if (!c || (c.date_prevue || null) === jour) return;
            const r = await majContenu(id, { date_prevue: jour });
            if (!r.ok) toast(`Non déplacé — ${r.motif}`, 'err');
            else toast(jour ? `Programmé le ${jourLong(jour)}` : 'Retiré du calendrier');
          };
        });
      };

      draw();
      return { refresh: draw, destroy() { coquille.retirer(); } };
    },
  };
}

// ---------- Le formulaire d'un contenu ----------
// ⚠ L'ÉTAT DE LA SAISIE VIT DANS `v`, PAS DANS LE DOM : le bloc des visuels se
// redessine à chaque dépôt, et un `innerHTML` sur le formulaire entier
// emporterait le texte en cours de frappe. Seule la zone des visuels est refaite.
function formulaire(cle, existant, defauts = {}) {
  const v = existant
    ? { ...existant, reseaux: [...(existant.reseaux || [])], visuels: [...(existant.visuels || [])] }
    : { activity: cle, reseaux: [...RESEAUX_DE[cle].slice(0, 2)], visuels: [], format: 'post', statut: 'brouillon', ...defauts };
  const reseaux = RESEAUX_DE[cle];
  // Un réseau déjà enregistré mais plus proposé pour cette structure reste
  // affiché, sinon le premier enregistrement l'effacerait sans un mot.
  const proposes = [...reseaux, ...v.reseaux.filter(r => !reseaux.includes(r))];

  const html = `<form class="com-form" novalidate>
    <input class="com-titre" name="titre" placeholder="Titre du contenu (pour s’y retrouver)" value="${esc(v.titre || '')}">

    <div class="com-ligne">
      <span class="com-lib">Réseaux</span>
      <div class="com-choix">${proposes.map(r => `<button type="button" class="com-chip${v.reseaux.includes(r) ? ' actif' : ''}"
        data-rs="${r}" style="--rs:${RESEAUX[r]?.couleur || '#475569'}">${esc(RESEAUX[r]?.label || r)}</button>`).join('')}</div>
    </div>
    <div class="com-ligne">
      <span class="com-lib">Format</span>
      <div class="com-choix">${Object.entries(FORMATS).map(([k, l]) => `<button type="button"
        class="com-chip${v.format === k ? ' actif' : ''}" data-format="${k}">${esc(l)}</button>`).join('')}</div>
    </div>
    <div class="com-ligne com-quand">
      <span class="com-lib">Quand</span>
      <input type="date" name="date_prevue" value="${esc(v.date_prevue || '')}">
      <input type="time" name="heure" value="${esc(v.heure || '')}">
      <span class="small muted">Sans date, il reste dans « Idées et sans date ».</span>
    </div>
    <div class="com-ligne">
      <span class="com-lib">Statut</span>
      <div class="com-choix">${Object.entries(STATUTS).map(([k, s]) => `<button type="button"
        class="com-chip com-chip-st${v.statut === k ? ' actif' : ''}" data-statut="${k}" style="--st:${s.couleur}">${esc(s.label)}</button>`).join('')}</div>
    </div>

    <label class="com-bloc"><span class="com-lib">Texte de la publication</span>
      <textarea name="texte" rows="7" placeholder="Le texte tel qu’il sera publié, hashtags compris">${esc(v.texte || '')}</textarea>
      <span class="com-compteur"></span></label>

    <div class="com-bloc"><span class="com-lib">Visuels</span>
      <div class="com-visuels"></div>
      <label class="com-depot">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime" multiple hidden>
        <span>⬆ Déposer des images ou des vidéos — ou cliquer pour choisir</span>
      </label>
      <div class="com-lien-visuel">
        <input type="url" placeholder="… ou coller un lien (Canva, Drive)">
        <button type="button" class="btn ghost" data-ajout-lien>Ajouter</button>
      </div>
    </div>

    <div class="com-duo">
      <label class="com-bloc"><span class="com-lib">Lien de la publication</span>
        <input type="url" name="lien_publication" value="${esc(v.lien_publication || '')}" placeholder="Une fois en ligne"></label>
      <label class="com-bloc"><span class="com-lib">Notes internes</span>
        <textarea name="notes" rows="2" placeholder="Ce qui ne part pas en ligne">${esc(v.notes || '')}</textarea></label>
    </div>

    <div class="form-actions">
      ${existant ? '<button type="button" class="btn danger com-suppr">Supprimer</button><button type="button" class="btn ghost com-dupliquer">Dupliquer</button>' : ''}
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn">${existant ? 'Enregistrer' : 'Ajouter au calendrier'}</button>
    </div>
  </form>`;

  const m = openModal(existant ? 'Modifier le contenu' : 'Nouveau contenu', html, { wide: true });
  const f = m.querySelector('form');
  const lire = () => {
    for (const k of ['titre', 'date_prevue', 'heure', 'texte', 'lien_publication', 'notes']) v[k] = f.elements[k].value;
  };

  const compteur = () => {
    const n = f.elements.texte.value.length;
    const lim = Math.min(...v.reseaux.map(r => LIMITE_TEXTE[r] || Infinity));
    const el = f.querySelector('.com-compteur');
    el.textContent = isFinite(lim) ? `${n} / ${lim.toLocaleString('fr-FR')} caractères` : `${n} caractères`;
    el.classList.toggle('est-trop', isFinite(lim) && n > lim);
  };
  f.elements.texte.oninput = compteur;

  const visuels = () => {
    const z = f.querySelector('.com-visuels');
    z.innerHTML = v.visuels.map((x, i) => `<figure class="com-visuel">
      ${x.type === 'video' ? `<video src="${esc(x.url)}" muted preload="metadata"></video>`
        : x.type === 'lien' ? `<a class="com-visuel-lien" href="${esc(x.url)}" target="_blank" rel="noopener">🔗 ${esc(x.nom || x.url)}</a>`
          : `<img src="${esc(x.url)}" alt="">`}
      <button type="button" data-retirer="${i}" title="Retirer du contenu">✕</button>
    </figure>`).join('');
    z.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => { v.visuels.splice(Number(b.dataset.retirer), 1); visuels(); });
  };
  visuels(); compteur();

  m.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => {
    const r = b.dataset.rs;
    v.reseaux = v.reseaux.includes(r) ? v.reseaux.filter(x => x !== r) : [...v.reseaux, r];
    b.classList.toggle('actif'); compteur();
  });
  m.querySelectorAll('[data-format]').forEach(b => b.onclick = () => {
    v.format = b.dataset.format;
    m.querySelectorAll('[data-format]').forEach(x => x.classList.toggle('actif', x === b));
  });
  m.querySelectorAll('[data-statut]').forEach(b => b.onclick = () => {
    v.statut = b.dataset.statut;
    m.querySelectorAll('[data-statut]').forEach(x => x.classList.toggle('actif', x === b));
  });

  // Les fichiers partent tout de suite dans le seau public : ce sont des images
  // faites pour être publiées, et les tenir en mémoire jusqu'à l'enregistrement
  // ferait perdre un dépôt de 40 Mo sur un clic à côté de la fenêtre.
  const depot = f.querySelector('.com-depot');
  const envoyer = async (fichiers) => {
    for (const fi of fichiers) {
      depot.classList.add('en-cours');
      try { v.visuels.push(await deposerVisuel(cle, fi)); visuels(); }
      catch (e) { toast(String(e.message || e), 'err'); }
    }
    depot.classList.remove('en-cours');
  };
  depot.querySelector('input').onchange = (e) => { envoyer([...e.target.files]); e.target.value = ''; };
  depot.ondragover = (e) => { e.preventDefault(); depot.classList.add('survol'); };
  depot.ondragleave = () => depot.classList.remove('survol');
  depot.ondrop = (e) => { e.preventDefault(); depot.classList.remove('survol'); envoyer([...e.dataTransfer.files]); };
  f.querySelector('[data-ajout-lien]').onclick = () => {
    const i = f.querySelector('.com-lien-visuel input');
    const u = i.value.trim();
    if (!/^https?:\/\//i.test(u)) { toast('Collez une adresse complète (https://…)', 'err'); return; }
    v.visuels.push({ url: u, type: 'lien', nom: u.replace(/^https?:\/\//i, '').slice(0, 50) });
    i.value = ''; visuels();
  };

  f.onsubmit = async (e) => {
    e.preventDefault();
    lire();
    if (!v.titre && !v.texte) { toast('Donnez au moins un titre ou un texte', 'err'); f.elements.titre.focus(); return; }
    if (v.statut === 'programme' && !v.date_prevue) { toast('Un contenu programmé a besoin d’une date', 'err'); return; }
    const bouton = f.querySelector('[type=submit]'); bouton.disabled = true;
    const r = existant ? await majContenu(existant.id, v) : await creerContenu(v);
    if (!r.ok) { bouton.disabled = false; toast(`Non enregistré — ${r.motif}`, 'err'); return; }
    closeModal();
    toast(existant ? 'Contenu enregistré' : (v.date_prevue ? `Ajouté le ${jourLong(v.date_prevue)}` : 'Ajouté aux idées'));
  };

  if (existant) {
    armerCroix(f.querySelector('.com-suppr'), async () => {
      const r = await supprimerContenu(existant.id);
      if (!r.ok) { toast(`Non supprimé — ${r.motif}`, 'err'); return; }
      closeModal(); toast('Contenu supprimé');
    }, { repos: 'Supprimer', arme: 'Confirmer la suppression', classe: 'arme', titre: 'Supprimer ce contenu' });
    // La copie part en brouillon et sans date : on duplique pour décliner un
    // contenu sur un autre jour, pas pour le publier deux fois.
    f.querySelector('.com-dupliquer').onclick = async () => {
      lire();
      const { id, created_at, created_by, updated_at, lien_publication, ...reste } = v;
      const r = await creerContenu({ ...reste, titre: `${v.titre || titreDe(v)} (copie)`, date_prevue: null, heure: null, statut: 'brouillon' });
      if (!r.ok) { toast(`Non dupliqué — ${r.motif}`, 'err'); return; }
      formulaire(cle, r.donnees);
      toast('Copie créée dans « Idées et sans date »');
    };
  }
}

export const rgdCommunicationPage = pageCommunication('rgd');
export const btpCommunicationPage = pageCommunication('btp');

// ---------- Analyse : réseaux sociaux et site internet ----------
// (08/10/2026, demandé par Élodie dans le groupe « Communication »).
//
// ⚠ AUCUN CHIFFRE N'EST AFFICHÉ TANT QU'AUCUNE SOURCE N'EST RACCORDÉE, et
// c'est délibéré : des zéros se liraient comme « personne ne nous voit ».
// L'écran dit ce qu'il mesurera et ce qu'il attend pour le faire. Chaque
// source se branche côté serveur (comptes Meta, TikTok, LinkedIn, Google
// Analytics / Search Console) ; aucun jeton ne passe par le navigateur.
const SITES = { rgd: 'rgdrenova.fr', btp: 'btpexpertise.fr' };
const MESURES_RESEAU = 'abonnés, portée, interactions, meilleurs contenus';
const MESURES_SITE = 'visites, provenance, pages vues, recherches Google, demandes de devis';

export function pageAnalyse(cle) {
  const hash = `#/${cle}/analyse`;
  const cadre = CADRES[cle];
  return {
    title: () => `${NOMS[cle]} — Analyse`,
    render(root) {
      if (!scope.activityKeys.includes(cle)) {
        root.innerHTML = `<div class="card"><div class="empty">Vous n’avez pas accès à ${esc(NOMS[cle])}.</div></div>`;
        return {};
      }
      const coquille = poserEspace(root);
      const draw = () => {
        if (!scope.isDirection) {
          root.innerHTML = cadre(hash, 'Analyse',
            '<section class="card"><div class="empty">L’analyse est réservée à la direction.</div></section>');
          return;
        }
        const source = (nom, court, couleur, mesures) => `<div class="ana-source" style="--rs:${couleur}">
          <span class="ana-pastille">${esc(court)}</span>
          <div><b>${esc(nom)}</b><div class="small muted">${esc(mesures)}</div></div>
          <span class="ana-etat">À raccorder</span>
        </div>`;
        const corps = `
          <section class="ana-intro">
            <h2>Ce que cet écran va suivre</h2>
            <p>Les performances des réseaux sociaux et du site de ${esc(NOMS[cle])}, mois par mois, à côté des
            contenus du calendrier — pour voir ce qui a marché. Aucune source n’est encore raccordée : rien n’est
            affiché plutôt que des zéros trompeurs.</p>
          </section>
          <div class="ana-grille">
            <section class="ana-bloc"><h3>Réseaux sociaux</h3>
              ${RESEAUX_DE[cle].map(r => source(RESEAUX[r].label, RESEAUX[r].court, RESEAUX[r].couleur, MESURES_RESEAU)).join('')}
            </section>
            <section class="ana-bloc"><h3>Site internet</h3>
              ${source(SITES[cle], 'WEB', '#475569', MESURES_SITE)}
            </section>
          </div>`;
        root.innerHTML = cadre(hash, 'Analyse', corps);
      };
      draw();
      return { refresh: draw, destroy() { coquille.retirer(); } };
    },
  };
}

export const rgdAnalysePage = pageAnalyse('rgd');
export const btpAnalysePage = pageAnalyse('btp');
