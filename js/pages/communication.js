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
import { db } from '../data/db.js';
import { logoReseau } from '../data/logos-reseaux.js';
import { vueSite } from './analyse-site.js';
import { vueFiche, lierFiche } from './analyse-fiche.js';
import { raccordementTiktok, demarrerRaccordementTiktok, retirerRaccordementTiktok, messageRetourTiktok } from '../data/tiktok.js';
import { cadreCourtage } from './courtage.js';
import { esc, toast, openModal, closeModal, armerCroix } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre as cadreRgd } from './rgd-espace.js';
import { cadreBtp } from './btp.js';
import {
  RESEAUX, RESEAUX_DE, STATUTS, FORMATS, LIMITE_TEXTE, PUBLICATION_AUTO,
  contenusDe, creerContenu, majContenu, supprimerContenu, deposerVisuel,
} from '../data/communication.js';

const CADRES = { rgd: cadreRgd, btp: cadreBtp, courtage: cadreCourtage };
const NOMS = { rgd: 'RGD Renova', btp: 'BTP Expertise', courtage: 'La Référence Courtage' };
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Le jour LOCAL, jamais `toISOString()` : un contenu posé à 23 h serait daté
// du lendemain.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aujourdhui = () => iso(new Date());
const nomMois = (a, m) => new Date(a, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const jourLong = (s) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const pastilles = (reseaux) => (reseaux || []).filter(r => RESEAUX[r])
  .map(r => logoReseau(r, 15)).join('');
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
                  style="--rs:${RESEAUX[r].couleur}">${logoReseau(r, 16)}${esc(RESEAUX[r].label)}</button>`).join('')}
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
        data-rs="${r}" style="--rs:${RESEAUX[r]?.couleur || '#475569'}">${logoReseau(r, 16)}${esc(RESEAUX[r]?.label || r)}</button>`).join('')}</div>
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
      <div class="com-choix">${Object.entries(STATUTS).filter(([k, s]) => !s.auto || v.statut === k).map(([k, s]) => `<button type="button"
        class="com-chip com-chip-st${v.statut === k ? ' actif' : ''}" data-statut="${k}" style="--st:${s.couleur}">${esc(s.label)}</button>`).join('')}</div>
    </div>

    <div class="com-suivi"></div>
    <div class="com-apercu" hidden></div>

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
  // L'APERÇU MONTRE LE POST COMME IL SERA VU : la diapo en grand, au format du
  // fichier, ses flèches et ses points, et la légende à côté avec ses retours
  // à la ligne (demandé le 08/10/2026 : « voir chaque slide avec les
  // légendes »). Les liens Canva/Drive n'y entrent pas : ce ne sont pas des
  // images. Il suit la frappe sans redessiner le champ.
  let diapo = 0;
  const apercu = () => {
    const z = f.querySelector('.com-apercu');
    const medias = v.visuels.filter(x => x.type !== 'lien');
    z.hidden = !medias.length;
    if (!medias.length) { z.innerHTML = ''; return; }
    diapo = Math.min(diapo, medias.length - 1);
    const x = medias[diapo];
    z.innerHTML = `<div class="com-ap-diapo">
        ${x.type === 'video' ? `<video src="${esc(x.url)}" controls muted></video>` : `<img src="${esc(x.url)}" alt="">`}
        ${medias.length > 1 ? `<button type="button" class="com-ap-fl g" data-diapo="-1" ${diapo ? '' : 'disabled'} aria-label="Diapo précédente">‹</button>
          <button type="button" class="com-ap-fl d" data-diapo="1" ${diapo < medias.length - 1 ? '' : 'disabled'} aria-label="Diapo suivante">›</button>
          <span class="com-ap-num">${diapo + 1} / ${medias.length}</span>` : ''}
      </div>
      <div class="com-ap-cote">
        ${medias.length > 1 ? `<div class="com-ap-points">${medias.map((_, i) => `<button type="button" data-aller="${i}" class="${i === diapo ? 'actif' : ''}" aria-label="Diapo ${i + 1}"></button>`).join('')}</div>` : ''}
        <div class="com-ap-legende"></div>
      </div>`;
    z.querySelector('.com-ap-legende').textContent = f.elements.texte.value || 'Pas encore de légende.';
    z.querySelectorAll('[data-diapo]').forEach(b => b.onclick = () => { diapo += Number(b.dataset.diapo); apercu(); });
    z.querySelectorAll('[data-aller]').forEach(b => b.onclick = () => { diapo = Number(b.dataset.aller); apercu(); });
  };
  f.elements.texte.oninput = () => {
    compteur();
    const l = f.querySelector('.com-ap-legende');
    if (l) l.textContent = f.elements.texte.value || 'Pas encore de légende.';
  };

  const visuels = () => {
    const z = f.querySelector('.com-visuels');
    z.innerHTML = v.visuels.map((x, i) => `<figure class="com-visuel">
      ${x.type === 'video' ? `<video src="${esc(x.url)}" muted preload="metadata"></video>`
        : x.type === 'lien' ? `<a class="com-visuel-lien" href="${esc(x.url)}" target="_blank" rel="noopener">🔗 ${esc(x.nom || x.url)}</a>`
          : `<img src="${esc(x.url)}" alt="">`}
      <button type="button" data-retirer="${i}" title="Retirer du contenu">✕</button>
    </figure>`).join('');
    z.querySelectorAll('[data-retirer]').forEach(b => b.onclick = (e) => { e.stopPropagation(); v.visuels.splice(Number(b.dataset.retirer), 1); visuels(); });
    // Un clic sur une vignette l'affiche dans l'aperçu.
    const medias = v.visuels.filter(x => x.type !== 'lien');
    z.querySelectorAll('.com-visuel').forEach((fig, i) => {
      const k = medias.indexOf(v.visuels[i]);
      if (k >= 0) fig.onclick = () => { diapo = k; apercu(); };
    });
    apercu();
    suivi();
  };
  visuels(); compteur();

  // CE QUE L'OUTIL DE PUBLICATION FERA — OU A FAIT — DE CE CONTENU. Il ne
  // publie que les structures et réseaux de `PUBLICATION_AUTO`, et seulement
  // ce qui est « Programmé » ; le dire évite de croire qu'un post LinkedIn
  // partira tout seul.
  // Déclaration de fonction, pas `const` : `visuels()` l'appelle avant cette
  // ligne, et une constante y serait encore en zone morte.
  function suivi() {
    const auto = (PUBLICATION_AUTO[cle] || []).filter(r => v.reseaux.includes(r));
    const noms = auto.map(r => RESEAUX[r].label).join(' et ');
    const z = f.querySelector('.com-suivi');
    let html = '';
    if (v.statut === 'erreur') {
      html = `<div class="com-note est-erreur"><b>L’envoi a échoué.</b> ${esc(existant?.erreur || '')}
        <br>Corrigez, puis remettez le statut sur « Programmé » : il repartira au passage suivant (15 min).</div>`;
    } else if (v.statut === 'en_cours') {
      html = `<div class="com-note est-attention"><b>Envoi en cours</b> depuis ${esc(existant?.envoi_le ? new Date(existant.envoi_le).toLocaleString('fr-FR') : '—')}.
        S’il reste bloqué, vérifiez sur Instagram s’il est parti avant de le remettre en « Programmé » — sinon il sortira deux fois.</div>`;
    } else if (v.statut === 'publie' && existant?.media_id) {
      html = `<div class="com-note est-ok"><b>Publié automatiquement</b>${existant.publie_le ? ` le ${esc(new Date(existant.publie_le).toLocaleString('fr-FR'))}` : ''}.
        ${existant.lien_publication ? `<a href="${esc(existant.lien_publication)}" target="_blank" rel="noopener">Voir le post ↗</a>` : ''}
        Le modifier ici ne change plus rien en ligne.</div>`;
    } else if (auto.length && v.statut === 'programme') {
      const jpeg = v.visuels.some(x => x.type === 'image' && !/\.jpe?g(\?|$)/i.test(x.url));
      html = `<div class="com-note est-auto"><b>Publication automatique sur ${esc(noms)}</b> à la date et à l’heure prévues (dans les 15 minutes).
        Sans heure, à 9 h.${jpeg ? ' <b class="com-rouge">⚠ Instagram n’accepte que des images JPEG : remplacez les autres.</b>' : ''}</div>`;
    } else if (auto.length) {
      html = `<div class="com-note">Passez en « Programmé » pour qu’il soit publié automatiquement sur ${esc(noms)}.</div>`;
    }
    z.innerHTML = html;
  }
  suivi();

  m.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => {
    const r = b.dataset.rs;
    v.reseaux = v.reseaux.includes(r) ? v.reseaux.filter(x => x !== r) : [...v.reseaux, r];
    b.classList.toggle('actif'); compteur(); suivi();
  });
  m.querySelectorAll('[data-format]').forEach(b => b.onclick = () => {
    v.format = b.dataset.format;
    m.querySelectorAll('[data-format]').forEach(x => x.classList.toggle('actif', x === b));
  });
  m.querySelectorAll('[data-statut]').forEach(b => b.onclick = () => {
    v.statut = b.dataset.statut;
    m.querySelectorAll('[data-statut]').forEach(x => x.classList.toggle('actif', x === b));
    suivi();
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
      const { id, created_at, created_by, updated_at, lien_publication, envoi_le, publie_le, media_id, erreur, ...reste } = v;
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
// (08/10/2026, raccordée à Facebook et Instagram le 12/10/2026).
//
// Les chiffres viennent de `communication_stats_jour` (une ligne par jour et
// par réseau) et `communication_stats_posts` (une ligne par post), relevées
// chaque matin à 6 h 30 UTC par l'Edge Function `communication-stats`.
//
// ⚠ UNE SOURCE NON RACCORDÉE N'AFFICHE AUCUN CHIFFRE : des zéros se liraient
// comme « personne ne nous voit ». Elle reste marquée « À raccorder ».
// ⚠ UN NULL N'EST PAS UN ZÉRO : Meta retire des métriques ; une valeur
// inconnue est exclue des sommes et s'affiche « — ».
// ⚠ LES CHIFFRES SONT CEUX DE META, PAS UNE SOMME DE JOURS (12/10/2026, « je
// veux exactement la même chose » qu'Instagram) : la portée compte des
// personnes uniques sur la fenêtre, que seul Meta sait dédoublonner. L'écart
// se lit sur la fenêtre d'avant, relevée en même temps. Les jours ne servent
// plus qu'à l'histogramme.
const SITES = { rgd: 'rgdrenova.fr', btp: 'btpexpertise.fr' };
// ⚠ « RACCORDÉ » NE VEUT PAS DIRE « RELEVÉ » : TikTok y est depuis le
// 12/10/2026, mais sa carte reste « À raccorder » tant que personne n'a
// autorisé le CRM depuis le compte — c'est `tiktok_raccordement` qui le dit,
// pas cette liste. LinkedIn n'y est pas : son autorisation de développeur
// n'est pas accordée.
const RACCORDES = ['facebook', 'instagram', 'tiktok'];
// Les autorisations TikTok sans lesquelles la carte reste muette sur un
// point. ⚠ EN BAC À SABLE, `user.info.stats` ET `video.list` NE RÉPONDENT
// QUE POUR LES COMPTES DÉCLARÉS DANS L'APPLICATION : un compte autorisé
// sans eux est un cas normal, pas une panne, et l'écran doit le nommer.
const AUTORISATIONS_TIKTOK = [
  ['user.info.stats', 'le nombre d’abonnés'],
  ['video.list', 'les vidéos et leurs chiffres'],
];
// ⚠ LES FENÊTRES DE L'APPLICATION INSTAGRAM, PAS D'AUTRES (12/10/2026) : les
// chiffres affichés sont les totaux que Meta calcule lui-même sur 7, 14 et 30
// jours (table `communication_stats_periode`). Au-delà de 30 jours l'API
// refuse, d'où l'absence de 90 jours.
const PERIODES = [[7, '7 jours'], [14, '14 jours'], [30, '30 jours']];
const nombre = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
// Une date d'horodatage rendue lisible : « 29 juin 2026 ».
const fmtJour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const isoJour = (d) => d.toISOString().slice(0, 10);

function bilanPeriode(lignes, debut, fin) {
  const dans = lignes.filter(l => l.jour >= debut && l.jour <= fin);
  const somme = (k) => {
    const v = dans.map(l => l[k]).filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  return { jours: dans.length, portee: somme('portee'), vues: somme('vues'), interactions: somme('interactions'),
    visites_profil: somme('visites_profil'), nouveaux_abonnes: somme('nouveaux_abonnes') };
}

function ecart(actuel, avant, complet) {
  if (!complet || actuel == null || avant == null) return '';
  if (avant === 0) return actuel > 0 ? '<span class="ana-ecart hausse">nouveau</span>' : '';
  const p = Math.round(((actuel - avant) / avant) * 100);
  if (p === 0) return '<span class="ana-ecart">=</span>';
  return `<span class="ana-ecart ${p > 0 ? 'hausse' : 'baisse'}">${p > 0 ? '+' : ''}${p} %</span>`;
}

// Un histogramme en SVG, sans bibliothèque : une série de jours, les vides
// laissés vides (un jour non relevé n'est pas un jour à zéro).
function histogramme(lignes, debut, nbJours, cle, couleur) {
  const jours = [];
  const d0 = new Date(debut + 'T12:00:00Z');
  for (let i = 0; i < nbJours; i++) jours.push(isoJour(new Date(d0.getTime() + i * 86400000)));
  const parJour = Object.fromEntries(lignes.map(l => [l.jour, l[cle]]));
  const max = Math.max(1, ...jours.map(j => parJour[j] || 0));
  const l = 100 / jours.length;
  const barres = jours.map((j, i) => {
    const v = parJour[j];
    if (v == null) return '';
    const h = Math.max(v > 0 ? 2 : 0, (v / max) * 100);
    return `<rect x="${(i * l + l * 0.15).toFixed(2)}" y="${(100 - h).toFixed(2)}" width="${(l * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="0.6"><title>${j.split('-').reverse().join('/')} : ${nombre(v)}</title></rect>`;
  }).join('');
  return `<svg class="ana-histo" viewBox="0 0 100 100" preserveAspectRatio="none" style="--rs:${couleur}" role="img" aria-label="Évolution quotidienne">${barres}</svg>`;
}

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
      // ⚠ TROIS ONGLETS, UN SEUL ÉCRAN (12/10/2026, Élodie : « sépare les réseaux
      // sociaux et le site internet dans deux écrans différents mais dans la
      // même page analyse » ; la fiche Google s'y est ajoutée le 13/10) : la
      // période se partage entre les deux premiers, la mise en page non.
      //
      // ⚠ `mois` N'APPARTIENT QU'À L'ONGLET « FICHE GOOGLE », et il vit ICI et
      // non dans la vue : celle-ci est reconstruite à chaque enregistrement, et
      // un mois gardé là-bas repartirait au plus récent sous les yeux de qui
      // venait d'en ouvrir un autre.
      const state = { periode: 30, tri: 'portee', reseau: '', vue: 'reseaux', mois: null };
      // ⚠ LU UNE SEULE FOIS, HORS DE `draw()`, ET LA QUESTION EST RETIRÉE DE
      // L'ADRESSE EN MÊME TEMPS : `draw()` est rappelé à chaque clic de période,
      // donc une lecture là-dedans effacerait le message avant qu'il s'affiche
      // — ou le réafficherait à chaque redessin.
      const retourTiktok = messageRetourTiktok();
      try {
        const memo = Number(localStorage.getItem('crm_ana_periode'));
        if (PERIODES.some(([n]) => n === memo)) state.periode = memo;
        const vue = localStorage.getItem('crm_ana_vue');
        if (vue === 'site' || vue === 'fiche') state.vue = vue;
      } catch { /* sans stockage */ }

      // ⚠ UNE STRUCTURE SANS RÉSEAU N'A PAS CET ONGLET (La Référence Courtage,
      // 12/10/2026) : un onglet « Réseaux sociaux » vide se lirait comme une
      // panne. Elle garde les deux autres — la barre ne disparaît donc plus,
      // elle n'avait disparu que parce qu'il ne restait qu'un onglet.
      const sansReseau = !(RESEAUX_DE[cle] || []).length;
      if (sansReseau && state.vue === 'reseaux') state.vue = 'site';

      const draw = () => {
        if (!scope.isDirection) {
          root.innerHTML = cadre(hash, 'Analyse',
            '<section class="card"><div class="empty">L’analyse est réservée à la direction.</div></section>');
          return;
        }
        const jours = db.t('communication_stats_jour').filter(l => l.activity === cle);
        const posts = db.t('communication_stats_posts').filter(p => p.activity === cle);
        const totaux = db.t('communication_stats_periode').filter(t => t.activity === cle && Number(t.periode) === state.periode);
        const contenus = contenusDe(cle);
        const dernierReleve = [...jours, ...posts].map(x => x.releve_le).sort().pop();

        // La période se termine hier : aujourd'hui n'est jamais complet.
        const hier = new Date(Date.now() - 86400000);
        const fin = isoJour(hier);
        const debut = isoJour(new Date(hier.getTime() - (state.periode - 1) * 86400000));

        // ⚠ META REND DES SOLDES : des enregistrements retirés donnent -19. Un
        // total ne s'affiche pas en négatif.
        const net = (v) => (v == null ? null : Math.max(0, Number(v)));
        const tuile = (libelle, valeur, avant, aide) => `<div class="ana-tuile" title="${esc(aide)}">
          <span>${esc(libelle)}</span><b>${nombre(net(valeur))}</b>${ecart(net(valeur), net(avant), true)}</div>`;

        // ⚠ TIKTOK A SA PROPRE CARTE, ET CE N'EST PAS UNE AFFAIRE DE MISE EN
        // PAGE. Son API ne donne NI portée (personnes uniques), NI série par
        // jour, NI visites du profil : la carte de Meta aurait affiché trois
        // tirets et un histogramme vide. Pire, elle aurait fait lire ses vues
        // comme celles d'Instagram, alors que ce n'est pas la même grandeur —
        // ici ce sont les vues des vidéos PUBLIÉES sur la période, et une
        // ancienne vidéo qui repart n'y entre pas. La carte l'écrit.
        const carteTiktok = (def) => {
          const compte = raccordementTiktok(cle);
          const tete = `${logoReseau('tiktok', 30)}<h3>${esc(def.label)}</h3>`;
          if (!compte) {
            return `<section class="ana-carte est-vide" style="--rs:${def.couleur}">
              <header>${tete}<span class="ana-etat">À raccorder</span></header>
              <p class="small muted">Le raccordement se fait depuis le compte TikTok de ${esc(NOMS[cle])} : vous serez envoyée sur TikTok pour autoriser le CRM à lire ses chiffres, puis ramenée ici. Aucune publication n’est possible par ce raccordement, seulement la lecture.</p>
              <p><button type="button" class="btn" id="ana-tt-brancher">Raccorder TikTok</button></p>
            </section>`;
          }
          const t = totaux.find(x => x.reseau === 'tiktok');
          const prec = t ? (t.precedent || {}) : {};
          const abonnes = compte.abonnes ?? [...jours].reverse().find(l => l.reseau === 'tiktok' && l.abonnes != null)?.abonnes ?? null;
          const videos = posts.filter(p => p.reseau === 'tiktok');
          // ⚠ QUATRE ZÉROS NE SONT PAS UNE MESURE, C'EST UNE ABSENCE DE
          // PUBLICATION — constaté au premier relevé réel (13/10/2026) : le
          // compte n'avait rien posté depuis le 29 juin, et la carte annonçait
          // « Vues 0 · J'aime 0 · Commentaires 0 · Partages 0 ». Or ces quatre
          // chiffres portent sur les vidéos PUBLIÉES dans la fenêtre : zéro
          // vidéo publiée, donc rien à compter — ce qui n'a rien à voir avec
          // « personne ne nous regarde », puisque les anciennes vidéos
          // continuent d'être vues. On le dit en toutes lettres.
          const dansLaPeriode = videos.filter(v => {
            const j = (v.publie_le || '').slice(0, 10);
            return j >= debut && j <= fin;
          });
          const derniereVideo = videos.map(v => v.publie_le).filter(Boolean).sort().pop();
          const premiereVideo = videos.map(v => v.publie_le).filter(Boolean).sort()[0];
          // ⚠ SANS PUBLICATION RECENTE, LA CARTE N'AVAIT PLUS RIEN A DIRE —
          // signale le 13/10/2026 : « je n'ai que ces infos pour tiktok ». Elle
          // ne montrait que les abonnes et une phrase d'excuse, alors que les
          // 200 videos relevees portent 199 947 vues. Le cumul ne depend
          // d'aucune fenetre : c'est ce que le compte a fait depuis sa premiere
          // video, et c'est la seule chose qui vaille quand rien n'est publie.
          // ⚠ IL SE CALCULE SUR CE QU'ON A RELEVE, PAS SUR LE COMPTE ENTIER :
          // TikTok ne rend que les dernieres videos (200 sur 206 ici), et la
          // carte le dit au lieu de laisser croire a un total exhaustif.
          const somme = (cle) => {
            const v = videos.map(x => x[cle]).filter(x => x != null);
            return v.length ? v.reduce((a, b) => a + b, 0) : null;
          };
          const cumul = { vues: somme('vues'), likes: somme('likes'),
            commentaires: somme('commentaires'), partages: somme('partages') };
          // ⚠ PAS D'ÉCART QUAND LA FENÊTRE D'AVANT N'AVAIT AUCUNE VIDÉO : on
          // compare ici ce qu'ont fait les vidéos PUBLIÉES dans chaque fenêtre,
          // donc une fenêtre sans publication vaut zéro — et `ecart` l'annonce
          // alors comme « nouveau », c'est-à-dire une percée, pour une semaine
          // où l'on n'a simplement rien posté. Quatre pastilles vertes de suite
          // sur un compte en sommeil : constaté en démo, pas à la relecture.
          const comparable = Number(prec.publiees) > 0;
          const tuileTT = (libelle, valeur, avant, aide) => tuile(libelle, valeur, comparable ? avant : null, aide);
          const manque = AUTORISATIONS_TIKTOK.filter(([a]) => !(compte.autorisations || '').includes(a));
          // Le raccordement vit un an à partir du dernier relevé. On ne le dit
          // qu'à deux mois de la fin : plus tôt, c'est une alarme qui ne
          // s'éteint jamais, et une alarme permanente cesse d'être lue.
          const finRac = compte.refresh_expire_le ? Date.parse(compte.refresh_expire_le) : null;
          const bientot = finRac && finRac - Date.now() < 60 * 86400000;
          return `<section class="ana-carte" style="--rs:${def.couleur}">
            <header>${tete}
              <span class="ana-abonnes"><b>${nombre(abonnes)}</b> abonnés
                ${t?.nouveaux_abonnes ? `<em>+${nombre(t.nouveaux_abonnes)} sur la période</em>` : ''}</span>
            </header>
            ${dansLaPeriode.length ? `
            <div class="ana-tuiles">
              ${tuileTT('Vues', t?.vues, prec.vues, 'Vues des vidéos publiées sur la période, depuis leur publication')}
              ${tuileTT('J’aime', t?.likes, prec.likes, 'J’aime reçus par les vidéos publiées sur la période')}
              ${tuileTT('Commentaires', t?.commentaires, prec.commentaires, 'Commentaires reçus par les vidéos publiées sur la période')}
              ${tuileTT('Partages', t?.partages, prec.partages, 'Partages des vidéos publiées sur la période')}
            </div>
            <p class="small muted ana-note">Ces quatre chiffres sont ceux des <b>vidéos publiées sur la période</b> — TikTok ne sait dire ni combien de personnes vous ont vue entre deux dates, ni donner un chiffre par jour. Une vidéo plus ancienne qui repart n’y entre donc pas. Les abonnés, eux, sont relevés chaque matin.</p>
            <p class="small muted ana-note">Sur l’ensemble du compte : ${nombre(videos.length)} vidéos relevées, ${nombre(cumul.vues)} vues, ${nombre(cumul.likes)} j’aime.</p>`
            : `<p class="ana-rien">Aucune vidéo publiée sur cette période${derniereVideo ? ` — la dernière date du ${esc(fmtJour(derniereVideo))}` : ''}.</p>
            <div class="ana-tuiles">
              ${tuile('Vidéos', videos.length, null, 'Vidéos relevées sur le compte')}
              ${tuile('Vues', cumul.vues, null, 'Vues cumulées de ces vidéos depuis leur publication')}
              ${tuile('J’aime', cumul.likes, null, 'J’aime cumulés de ces vidéos')}
              ${tuile('Partages', cumul.partages, null, 'Partages cumulés de ces vidéos')}
            </div>
            <p class="small muted ana-note">Ces chiffres sont ceux du <b>compte depuis sa première vidéo</b>${premiereVideo ? ` (${esc(fmtJour(premiereVideo))})` : ''}, pas ceux de la période : ils ne dépendent d’aucune fenêtre et continuent de monter sans qu’on publie. TikTok ne rend que les dernières vidéos, le cumul porte donc sur celles qui sont relevées.</p>`}
            <div class="ana-tt-pied">
              <span class="small muted">Compte raccordé${compte.display_name ? ` : <b>${esc(compte.display_name)}</b>` : ''}${videos.length ? ` · ${nombre(videos.length)} vidéo${videos.length > 1 ? 's' : ''} relevée${videos.length > 1 ? 's' : ''}` : ''}</span>
              <button type="button" class="btn ghost small" id="ana-tt-detacher" title="Détacher le compte TikTok">Détacher</button>
            </div>
            ${manque.length ? `<p class="small ana-note est-manque">TikTok n’a pas accordé ${esc(manque.map(([, l]) => l).join(' ni '))} : l’examen de l’application n’est pas terminé, ou le compte n’est pas déclaré comme compte d’essai. Le reste est relevé normalement.</p>` : ''}
            ${compte.dernier_motif ? `<p class="small ana-note est-manque">Dernier relevé incomplet : ${esc(compte.dernier_motif)}</p>` : ''}
            ${bientot ? `<p class="small ana-note est-manque">Le raccordement expire le ${esc(new Date(finRac).toLocaleDateString('fr-FR'))} : il faudra réautoriser le CRM depuis le compte TikTok.</p>` : ''}
          </section>`;
        };

        const carteReseau = (r) => {
          const def = RESEAUX[r];
          const siennes = jours.filter(l => l.reseau === r).sort((a, b) => a.jour.localeCompare(b.jour));
          if (r === 'tiktok') return carteTiktok(def);
          if (!RACCORDES.includes(r) || !siennes.length) {
            return `<section class="ana-carte est-vide" style="--rs:${def.couleur}">
              <header>${logoReseau(r, 30)}<h3>${esc(def.label)}</h3><span class="ana-etat">À raccorder</span></header>
              <p class="small muted">${r === 'linkedin'
                ? `${esc(def.label)} demande une autorisation de développeur, accordée après examen : le raccordement viendra ensuite.`
                : 'Aucun relevé pour l’instant.'}</p></section>`;
          }
          // Les chiffres affichés : le total de Meta sur la fenêtre. À défaut
          // (premier jour, réseau pas encore relevé ainsi), la somme des jours,
          // et l'écran le dit.
          const t = totaux.find(x => x.reseau === r);
          const act = t || bilanPeriode(siennes, debut, fin);
          const prec = t ? (t.precedent || {}) : {};
          const abonnes = t?.abonnes ?? [...siennes].reverse().find(l => l.abonnes != null)?.abonnes ?? null;
          const du = t ? t.du : debut, au = t ? t.au : fin;
          return `<section class="ana-carte" style="--rs:${def.couleur}">
            <header>
              ${logoReseau(r, 30)}<h3>${esc(def.label)}</h3>
              <span class="ana-abonnes"><b>${nombre(abonnes)}</b> abonnés
                ${act.nouveaux_abonnes ? `<em>+${nombre(act.nouveaux_abonnes)} sur la période</em>` : ''}</span>
            </header>
            <div class="ana-tuiles">
              ${tuile(r === 'instagram' ? 'Comptes touchés' : 'Spectateurs', act.portee, prec.portee, 'Personnes uniques qui ont vu vos contenus sur la période, calculé par Meta')}
              ${tuile('Vues', act.vues, prec.vues, 'Nombre de fois où vos contenus ont été vus')}
              ${tuile('Interactions', act.interactions, prec.interactions, 'J’aime, commentaires, partages, enregistrements')}
              ${tuile('Visites du profil', act.visites_profil, prec.visites_profil, 'Visites de la page ou du profil')}
            </div>
            <div class="ana-histo-tete"><span>Vues par jour</span><span class="small muted">${esc(du.split('-').reverse().join('/'))} → ${esc(au.split('-').reverse().join('/'))}</span></div>
            ${histogramme(siennes, debut, state.periode, 'vues', def.couleur)}
            ${t ? '' : '<p class="small muted ana-note">Totaux de Meta pas encore relevés pour cette période : somme des jours, provisoire.</p>'}
          </section>`;
        };

        // Les meilleurs posts des 12 derniers mois. Un post publié depuis le
        // calendrier y retrouve son titre (`media_id`).
        const titreDuPost = Object.fromEntries(contenus.filter(c => c.media_id).map(c => [c.media_id, c.titre]));
        const an = isoJour(new Date(Date.now() - 365 * 86400000));
        const liste = posts
          .filter(p => (p.publie_le || '').slice(0, 10) >= an && (!state.reseau || p.reseau === state.reseau))
          .sort((a, b) => (b[state.tri] ?? -1) - (a[state.tri] ?? -1))
          .slice(0, 10);
        const TRIS = [['portee', 'Portée'], ['vues', 'Vues'], ['interactions', 'Interactions'], ['enregistrements', 'Enregistrements']];
        const opt = (k, l, cur) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`;
        const blocPosts = `<section class="ana-bloc ana-posts">
          <header class="ana-posts-tete"><h3>Meilleurs posts — 12 derniers mois</h3>
            <select id="ana-reseau" class="filter-input">${opt('', 'Tous les réseaux', state.reseau)}${RACCORDES.map(r => opt(r, RESEAUX[r].label, state.reseau)).join('')}</select>
            <select id="ana-tri" class="filter-input">${TRIS.map(([k, l]) => opt(k, `Trier par ${l.toLowerCase()}`, state.tri)).join('')}</select>
          </header>
          ${liste.length ? `<div class="table-wrap"><table class="ana-table">
            <thead><tr><th></th><th>Publié</th><th>Post</th><th>Portée</th><th>Vues</th><th>J’aime</th><th>Comm.</th><th>Enreg.</th><th></th></tr></thead>
            <tbody>${liste.map(p => `<tr>
              <td>${logoReseau(p.reseau, 18)}</td>
              <td class="nowrap">${esc((p.publie_le || '').slice(0, 10).split('-').reverse().join('/'))}</td>
              <td class="ana-apercu">${titreDuPost[p.post_id] ? `<b>${esc(titreDuPost[p.post_id])}</b><br>` : ''}${esc(p.apercu || (p.type || 'Sans texte'))}</td>
              <td><b>${nombre(p.portee)}</b></td><td>${nombre(p.vues)}</td><td>${nombre(p.likes)}</td>
              <td>${nombre(p.commentaires)}</td><td>${nombre(p.enregistrements)}</td>
              <td>${p.lien ? `<a href="${esc(p.lien)}" target="_blank" rel="noopener" title="Voir le post">↗</a>` : ''}</td>
            </tr>`).join('')}</tbody></table></div>`
            : '<div class="empty">Aucun post relevé sur cette période.</div>'}
        </section>`;

        const onglet = (k, libelle, icone) => `<button type="button" data-vue="${k}" class="${state.vue === k ? 'actif' : ''}"
          role="tab" aria-selected="${state.vue === k}">${icone}<span>${esc(libelle)}</span></button>`;
        const onglets = [
          ...(sansReseau ? [] : [onglet('reseaux', 'Réseaux sociaux', '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" stroke="currentColor" stroke-width="1.8"/></svg>')]),
          onglet('site', 'Site internet', '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'),
          onglet('fiche', 'Fiche Google', '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 22s7-6.3 7-12a7 7 0 10-14 0c0 5.7 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'),
        ];
        // ⚠ LA PÉRIODE N'EST PAS RENDUE SUR « FICHE GOOGLE » : les deux autres
        // onglets se lisent sur 7, 14 ou 30 jours glissants, celui-ci sur des
        // mois calendaires. Un bouton « 7 jours » qui ne filtrerait rien est une
        // question posée pour rien. Elle n'est pas CACHÉE mais absente : sur un
        // élément qui porte un `display`, `[hidden]` ne ferait rien — le piège
        // s'est déjà payé six fois dans ce dépôt.
        const corps = `
          <section class="ana-barre">
            <div class="ana-onglets" role="tablist"${onglets.length < 2 ? ' hidden' : ''}>${onglets.join('')}</div>
            ${state.vue === 'fiche' ? '' : `<div class="com-rs-filtre">${PERIODES.map(([n, l]) => `<button type="button" data-periode="${n}" class="${state.periode === n ? 'actif' : ''}">${esc(l)}</button>`).join('')}</div>`}
          </section>
          ${state.vue === 'fiche' ? vueFiche(cle, state.mois)
            : state.vue === 'site' ? vueSite(cle, state.periode) : `
            ${retourTiktok ? `<p class="ana-retour est-${retourTiktok.ton}">${esc(retourTiktok.texte)}</p>` : ''}
            <p class="small muted ana-releve">${dernierReleve ? `Relevé chaque matin — dernier relevé le ${esc(new Date(dernierReleve).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.` : 'Premier relevé demain matin.'}</p>
            <div class="ana-cartes">${RESEAUX_DE[cle].map(carteReseau).join('')}</div>
            ${blocPosts}`}`;
        root.innerHTML = cadre(hash, 'Analyse', corps);
        root.querySelectorAll('[data-periode]').forEach(b => b.onclick = () => {
          state.periode = Number(b.dataset.periode);
          try { localStorage.setItem('crm_ana_periode', String(state.periode)); } catch { /* sans stockage */ }
          draw();
        });
        root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
          state.vue = b.dataset.vue;
          try { localStorage.setItem('crm_ana_vue', state.vue); } catch { /* sans stockage */ }
          draw();
        });
        // ⚠ LE MOIS REMONTE ICI, et `null` veut dire « le plus récent saisi » :
        // après une suppression, le mois qu'on regardait n'existe plus.
        if (state.vue === 'fiche') {
          lierFiche(root, cle, state.mois, (m) => { state.mois = m; draw(); });
        }
        const tri = root.querySelector('#ana-tri');
        if (tri) tri.onchange = (e) => { state.tri = e.target.value; draw(); };
        const res = root.querySelector('#ana-reseau');
        if (res) res.onchange = (e) => { state.reseau = e.target.value; draw(); };

        // ⚠ LE BOUTON NE BRANCHE RIEN, IL FAIT QUITTER LE CRM : c'est TikTok qui
        // demande l'autorisation, sur son site, puis ramène le navigateur sur
        // l'Edge Function `tiktok-retour`. L'adresse vient du serveur et non
        // d'ici : elle porte un jeton d'état qu'il vient de poser en base, et
        // c'est la seule chose qui empêche un inconnu de raccorder SON compte à
        // la place du nôtre.
        const brancher = root.querySelector('#ana-tt-brancher');
        if (brancher) brancher.onclick = async () => {
          brancher.disabled = true;
          brancher.textContent = 'Ouverture de TikTok…';
          try {
            location.assign(await demarrerRaccordementTiktok(cle));
          } catch (e) {
            brancher.disabled = false;
            brancher.textContent = 'Raccorder TikTok';
            toast(e.message || 'Raccordement impossible', 'error');
          }
        };
        // Détacher efface le jeton : deux clics sur le même bouton, jamais le
        // `confirm()` de `ui.js` qui remplacerait la fenêtre courante.
        const detacher = root.querySelector('#ana-tt-detacher');
        if (detacher) armerCroix(detacher, async () => {
          try {
            await retirerRaccordementTiktok(cle);
            await db.recharger('tiktok_raccordement');
            toast('TikTok détaché');
            draw();
          } catch (e) { toast(e.message || 'Impossible de détacher', 'error'); }
        }, { repos: 'Détacher', arme: 'Confirmer le détachement', titre: 'Détacher le compte TikTok' });
      };
      draw();
      return { refresh: draw, destroy() { coquille.retirer(); } };
    },
  };
}

export const rgdAnalysePage = pageAnalyse('rgd');
export const btpAnalysePage = pageAnalyse('btp');
export const courtageAnalysePage = pageAnalyse('courtage');
