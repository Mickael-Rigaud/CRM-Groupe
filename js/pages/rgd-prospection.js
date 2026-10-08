// Espace RGD Renova — Prospection (la veille hebdomadaire des sous-traitants)
//
// Demandé le 07/10/2026 : « je voudrais le nom de l'écran dans le menu
// "prospection" pour retrouver cette veille », puis « reprends cette
// présentation pour Prospection » (celle du vivier Experts & AMO de BTP), puis
// « améliore le design du tableau, je veux quelque chose de plus moderne et
// dynamique, et si tu peux faire un tableau par corps de métier ».
//
// ⚠ UNE CARTE PAR CORPS DE MÉTIER, et la colonne « Métier » est partie avec :
// c'est le titre de la carte. Les autres colonnes du vivier restent — Nom,
// Entreprise, Ville, Dépt, Contact, Suivi, Relance — et elles ont la même
// largeur d'une carte à l'autre (`table-layout: fixed` + `<colgroup>`), sans
// quoi dix tableaux empilés se liraient comme dix tableaux différents.
//
// ⚠ LES COMPTEURS DU HAUT SONT LES FILTRES : un clic sur « À contacter »
// ne montre que ceux-là, un second clic rend tout. Un chiffre qui ne se clique
// pas oblige à chercher ailleurs le geste qu'il suggère.
//
// Chaque lundi, l'Edge Function `veille-sous-traitants` dépose vingt artisans
// RGE à 25 km de Chantilly, tous avec un téléphone ou un e-mail. Le suivi les
// mène de « À valider » à « Gardé », qui les fait entrer dans Sous-traitants,
// ou à « Écarté ». Voir `js/data/rgd-st-veille.js`.
//
// ⚠ LE CONTACT ET LA RELANCE S'ÉCRIVENT DANS LA LIGNE, AU `change`, SANS
// REDESSIN : un redessin remplacerait le champ sous le doigt de qui vient d'y
// taper. Seul le suivi redessine — il peut faire sortir la ligne de la vue.
//
// ⚠ DIRECTION SEULE : la table lui est réservée (policies `my_role()`), et
// l'entrée de menu n'est montrée qu'à elle — voir `cadre` dans rgd-espace.js.

import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, toast, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { SUIVI_VEILLE, ORDRE_SUIVI, changerSuivi, majTrouvaille, nomDirigeant } from '../data/rgd-st-veille.js';

const lienAnnuaire = (t) => `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(t.siret)}`;
const lienRecherche = (t) => `https://www.google.com/search?q=${encodeURIComponent(`${t.raison_sociale} ${t.ville || ''}`)}`;
// Le site tel que la liste RGE l'écrit, parfois sans « http » : sans lui, le
// lien serait lu comme une adresse relative au CRM.
const lienSite = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
// Le site lu d'un coup d'œil : « cactus-protection.fr », pas une adresse entière.
const domaine = (u) => String(u || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
const km = (t) => (t.distance_km != null ? `${String(t.distance_km).replace('.', ',')} km` : '');
const qualite = (d) => (String(d || '').match(/\(([^)]*)\)\s*$/) || [])[1] || '';
const majuscule = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
const initiales = (s) => String(s || '?').split(/[\s'-]+/).filter(Boolean).slice(0, 2)
  .map(m => m[0]).join('').toUpperCase();

// Le jour LOCAL, jamais `toISOString()` (UTC : une relance posée à 23 h serait
// datée du lendemain).
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const enRetard = (t) => !!t.prochaine_relance && t.prochaine_relance < aujourdhui();

// L'identité de chaque carte. ⚠ La teinte est écrite ici, pas tirée au
// hasard : recalculée à chaque rendu, elle ferait clignoter l'écran.
const METIERS = {
  'Électricité': { icone: '⚡', teinte: '#E9A100' },
  'Plomberie / chauffage': { icone: '🔧', teinte: '#2563EB' },
  'Maçonnerie': { icone: '🧱', teinte: '#B45309' },
  'Isolation': { icone: '🧶', teinte: '#0D9488' },
  'Plâtrerie': { icone: '🪣', teinte: '#64748B' },
  'Menuiserie': { icone: '🪟', teinte: '#7C3AED' },
  'Carrelage': { icone: '🔲', teinte: '#0891B2' },
  'Revêtements de sols': { icone: '🪵', teinte: '#A16207' },
  // L'ancien intitulé des premiers essais, gardé pour qu'ils restent habillés.
  'Carrelage / revêtements': { icone: '🔲', teinte: '#0891B2' },
  'Peinture': { icone: '🎨', teinte: '#DB2777' },
  'Couverture': { icone: '🏠', teinte: '#DC2626' },
  'Terrassement': { icone: '🚜', teinte: '#65A30D' },
};
const identite = (m) => METIERS[m] || { icone: '🛠', teinte: '#475569' };

const VUES = [['cours', 'En cours'], ['gardes', 'Gardés'], ['ecartes', 'Écartés']];
const DANS_LA_VUE = {
  cours: (t) => !SUIVI_VEILLE[t.etat]?.fin && !SUIVI_VEILLE[t.etat]?.cache,
  gardes: (t) => t.etat === 'retenu',
  ecartes: (t) => t.etat === 'ecarte',
};
const TRIS = [['suivi', 'Suivi'], ['distance', 'Distance'], ['relance', 'Relance'], ['nom', 'Nom']];

export const rgdProspectionPage = {
  title: () => 'RGD Renova — Vivier sous-traitants',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { q: '', focus: null, vue: 'cours', suivi: '', retard: false, sort: 'suivi' };

    const draw = () => {
      if (!scope.isDirection) {
        root.innerHTML = cadre('#/rgd/prospection', 'Vivier sous-traitants',
          '<section class="card"><div class="empty">La veille de prospection est réservée à la direction.</div></section>');
        return;
      }
      const toutes = db.t('rgd_st_veille');
      const enCours = toutes.filter(DANS_LA_VUE.cours);
      const enRecherche = toutes.filter(t => t.etat === 'en_recherche').length;
      const qt = terms(state.q);
      const val = (t) => ({
        suivi: ORDRE_SUIVI[t.etat] ?? 99, distance: Number(t.distance_km ?? 99),
        relance: t.prochaine_relance || '9999', nom: nomDirigeant(t.dirigeant) || t.raison_sociale,
      })[state.sort];
      const lignes = toutes
        .filter(DANS_LA_VUE[state.vue])
        .filter(t => (!state.suivi || t.etat === state.suivi) && (!state.retard || enRetard(t)))
        .filter(t => hit([t.raison_sociale, t.dirigeant, t.ville, t.corps_metier, t.telephone, t.email], qt))
        .sort((a, b) => {
          const x = val(a), y = val(b);
          const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr');
          return c || (b.score || 0) - (a.score || 0);
        });

      // Les cartes, dans l'ordre de METIERS ; un métier inconnu passe en bout.
      const ordre = Object.keys(METIERS);
      const groupes = new Map();
      for (const t of lignes) {
        if (!groupes.has(t.corps_metier)) groupes.set(t.corps_metier, []);
        groupes.get(t.corps_metier).push(t);
      }
      const cartes = [...groupes.entries()].sort(([a], [b]) =>
        ((ordre.indexOf(a) + 1) || 99) - ((ordre.indexOf(b) + 1) || 99) || a.localeCompare(b, 'fr'));

      const opt = (liste, cur) => liste.map(([k, l]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
      const compteur = (k, label, n, extra = '') => `<button type="button" class="rpv-kpi rpv-kpi-${k}${
        (k === 'retard' ? state.retard : state.suivi === k) ? ' actif' : ''}" data-kpi="${k}"${extra}>
        <b>${n}</b><span>${esc(label)}</span></button>`;
      const retards = enCours.filter(enRetard).length;

      const selectSuivi = (t) => t.etat === 'retenu'
        ? '<span class="rpv-statut st-retenu">✓ Gardé</span><a class="small" href="#/rgd/soustraitants">Dans Sous-traitants →</a>'
        : `<select class="rpv-statut st-${esc(t.etat)}" data-suivi="${esc(t.id)}">
            ${opt(Object.entries(SUIVI_VEILLE).filter(([, v]) => !v.cache).map(([k, v]) => [k, v.label]), t.etat)}</select>`;

      // ⚠ DES BOUTONS, PAS DES LIENS `tel:` / `mailto:` (corrigé le 07/10/2026,
      // « les boutons téléphone et mail ne fonctionnent pas »). Sur un ordinateur,
      // `tel:` n'ouvre rien quand aucune application de téléphonie n'est
      // installée, et `mailto:` dépend d'une messagerie par défaut — ici une
      // boîte Gmail dans le navigateur, que `mailto:` n'atteint pas. Le clic est
      // traité plus bas : il copie toujours la valeur, appelle sur un téléphone,
      // et ouvre un message Gmail prêt à écrire.
      // ⚠ ET PLUS DANS UN `<label>` : un bouton logé dans le libellé d'un champ
      // renvoie son clic au champ dans certains navigateurs.
      const champ = (t, cle, type, icone, action, place) => `<div class="rpv-champ">
        <span class="rpv-ico">${icone}</span>
        <input type="${type}" data-champ="${cle}" data-id="${esc(t.id)}" value="${esc(t[cle] || '')}" placeholder="${place}">
        ${t[cle] ? `<button type="button" class="rpv-agir" data-${action}="${esc(t[cle])}"
          title="${action === 'appeler' ? 'Appeler (copie le numéro sur ordinateur)' : 'Écrire un e-mail'}">${action === 'appeler' ? '📞' : '✉'}</button>` : ''}
      </div>`;

      const ligne = (t, i) => {
        const nom = nomDirigeant(t.dirigeant);
        return `<tr class="${t.etat === 'ecarte' ? 'est-ecarte' : ''}" style="--i:${i}">
          <td><div class="rpv-qui">
            <span class="rpv-avatar">${esc(initiales(nom || t.raison_sociale))}</span>
            <div><b>${nom ? esc(majuscule(nom)) : '<span class="muted">Dirigeant inconnu</span>'}</b>
              ${qualite(t.dirigeant) ? `<div class="small muted">${esc(qualite(t.dirigeant))}</div>` : ''}</div>
          </div></td>
          <td><b class="rpv-ent">${esc(t.raison_sociale)}</b>
            <div class="rpv-puces">
              ${t.est_rge ? '<span class="rpv-puce rpv-rge">RGE</span>' : ''}
              ${t.effectif ? `<span class="rpv-puce">${esc(t.effectif)}</span>` : ''}
              ${t.date_creation ? `<span class="rpv-puce">depuis ${esc(t.date_creation.slice(0, 4))}</span>` : ''}
            </div>
            ${t.site_internet ? `<a class="rpv-site" href="${esc(lienSite(t.site_internet))}" target="_blank" rel="noopener"
              title="Ouvrir le site de l’entreprise">🌐 ${esc(domaine(t.site_internet))}</a>` : ''}
            <div class="rpv-liens"><a href="${esc(lienAnnuaire(t))}" target="_blank" rel="noopener">Fiche entreprise ↗</a></div></td>
          <td><b>${esc(majuscule(t.ville || '—'))}</b><div class="rpv-km">📍 ${esc(km(t))}</div></td>
          <td><span class="rpv-dept">${esc(String(t.code_postal || '').slice(0, 2))}</span></td>
          <td class="rpv-contact">
            ${champ(t, 'telephone', 'tel', '☎', 'appeler', 'Téléphone')}
            ${champ(t, 'email', 'email', '@', 'ecrire', 'E-mail')}
            ${!t.telephone && !t.email ? `<a class="small" href="${esc(lienRecherche(t))}" target="_blank" rel="noopener">Chercher ses coordonnées ↗</a>` : ''}</td>
          <td>${selectSuivi(t)}</td>
          <td class="${enRetard(t) ? 'rpv-retard' : ''}">
            <input type="date" class="rpv-date" data-champ="prochaine_relance" data-id="${esc(t.id)}" value="${esc(t.prochaine_relance || '')}">
            ${enRetard(t) ? '<div class="rpv-alerte">⏰ en retard</div>' : ''}</td>
        </tr>`;
      };

      const carte = ([metier, liste]) => {
        const id = identite(metier);
        const aValider = liste.filter(t => t.etat === 'a_valider').length;
        return `<section class="rpv-carte" style="--m:${id.teinte}">
          <header class="rpv-carte-tete">
            <span class="rpv-carte-ico">${id.icone}</span>
            <h2>${esc(metier)}</h2>
            <span class="rpv-carte-nb">${liste.length} artisan${liste.length > 1 ? 's' : ''}</span>
            ${aValider ? `<span class="rpv-carte-new">${aValider} à valider</span>` : ''}
          </header>
          <div class="table-wrap"><table class="rpv-table">
            <colgroup><col style="width:17%"><col style="width:21%"><col style="width:11%"><col style="width:5%">
              <col style="width:22%"><col style="width:13%"><col style="width:11%"></colgroup>
            <thead><tr><th>Nom</th><th>Entreprise</th><th>Ville</th><th>Dépt</th><th>Contact</th><th>Suivi</th><th>Relance</th></tr></thead>
            <tbody>${liste.map(ligne).join('')}</tbody>
          </table></div>
        </section>`;
      };

      const corps = `
        <section class="rpv-hero">
          <div>
            <h2>Veille sous-traitants</h2>
            <p>Chaque lundi, des artisans à 25 km de Chantilly, RGE ou non, <b>tous joignables</b> — téléphone ou
            e-mail, trouvés dans la liste de l’ADEME ou sur le web. Passer le suivi à « Gardé » les fait entrer
            dans Sous-traitants.</p>
            ${enRecherche ? `<p class="rpv-recherche">🔎 ${enRecherche} artisan${enRecherche > 1 ? 's' : ''} de plus
              en cours de recherche de coordonnées — ${enRecherche > 1 ? 'ils apparaîtront' : 'il apparaîtra'} ici dès qu’un contact sera trouvé.</p>` : ''}
          </div>
          <div class="rpv-kpis">
            ${compteur('a_valider', 'À valider', enCours.filter(t => t.etat === 'a_valider').length)}
            ${compteur('a_contacter', 'À contacter', enCours.filter(t => t.etat === 'a_contacter').length)}
            ${compteur('contacte', 'Contactés', enCours.filter(t => t.etat === 'contacte').length)}
            ${compteur('interesse', 'Intéressés', enCours.filter(t => t.etat === 'interesse').length)}
            ${compteur('retard', 'Relances dues', retards)}
          </div>
        </section>

        <div class="toolbar rpv-barre">
          ${searchInput('rpv-q', state, 'Nom, entreprise, ville, téléphone…')}
          <label class="rpv-select"><span>Trier</span><select id="rpv-tri" class="filter-input">${opt(TRIS, state.sort)}</select></label>
          <span class="grow"></span>
          <div class="rpv-onglets">${VUES.map(([k, l]) => `<button type="button" data-vue="${k}"
            class="${state.vue === k ? 'actif' : ''}">${esc(l)} <span>${toutes.filter(DANS_LA_VUE[k]).length}</span></button>`).join('')}</div>
        </div>

        ${cartes.length ? cartes.map(carte).join('') : `<section class="card"><div class="empty">
          <b>${state.q || state.suivi || state.retard ? 'Aucun artisan ne correspond à ces filtres' : 'Rien ici pour l’instant'}</b><br>
          ${state.vue === 'cours' ? 'Les prochaines trouvailles arrivent lundi matin.' : ''}</div></section>`}`;

      root.innerHTML = cadre('#/rgd/prospection', 'Vivier sous-traitants', corps);
      bindSearch(root, 'rpv-q', state, draw);
      restoreFocus(root, state);

      root.querySelector('#rpv-tri').onchange = (e) => { state.sort = e.target.value; draw(); };
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        state.vue = b.dataset.vue; state.suivi = ''; state.retard = false; draw();
      });
      root.querySelectorAll('[data-kpi]').forEach(b => b.onclick = () => {
        const k = b.dataset.kpi;
        state.vue = 'cours';
        if (k === 'retard') { state.retard = !state.retard; state.suivi = ''; }
        else { state.suivi = state.suivi === k ? '' : k; state.retard = false; }
        draw();
      });

      const copier = async (texte) => {
        try { await navigator.clipboard.writeText(texte); return true; } catch { return false; }
      };
      const surTelephone = () => window.matchMedia('(pointer: coarse)').matches;
      root.querySelectorAll('[data-appeler]').forEach(b => b.onclick = async () => {
        const num = b.dataset.appeler;
        if (surTelephone()) { window.location.href = `tel:${num.replace(/\s/g, '')}`; return; }
        toast(await copier(num) ? `Numéro copié : ${num}` : `Numéro : ${num}`);
      });
      root.querySelectorAll('[data-ecrire]').forEach(b => b.onclick = async () => {
        const mail = b.dataset.ecrire;
        await copier(mail);
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(mail)}`, '_blank', 'noopener');
        toast(`Adresse copiée : ${mail}`);
      });

      const parId = (id) => db.t('rgd_st_veille').find(t => t.id === id);
      root.querySelectorAll('[data-suivi]').forEach(s => s.onchange = async () => {
        const t = parId(s.dataset.suivi);
        if (!t) return;
        s.disabled = true;
        const r = await changerSuivi(t, s.value);
        if (!r.ok) { toast(`Non enregistré — ${r.motif}`, 'err'); draw(); return; }
        if (s.value === 'retenu') toast(`${t.raison_sociale} rejoint les sous-traitants en prospection`);
        else if (s.value === 'ecarte') toast(`${t.raison_sociale} est écarté — la veille ne le reproposera pas`);
        draw();
      });
      root.querySelectorAll('[data-champ]').forEach(i => i.onchange = async () => {
        const t = parId(i.dataset.id);
        if (!t) return;
        const r = await majTrouvaille(t, { [i.dataset.champ]: i.value });
        if (!r.ok) { toast(`Non enregistré — ${r.motif}`, 'err'); return; }
        if (i.dataset.champ === 'prochaine_relance') {
          const td = i.closest('td');
          const retard = enRetard({ prochaine_relance: i.value });
          td.classList.toggle('rpv-retard', retard);
          td.querySelector('.rpv-alerte')?.remove();
          if (retard) td.insertAdjacentHTML('beforeend', '<div class="rpv-alerte">⏰ en retard</div>');
        }
      });
    };

    draw();
    // ⚠ `db.update` émet, et l'émission redessine la page : sans ce garde, passer
    // du téléphone à l'e-mail au clavier ferait disparaître le champ qu'on
    // vient d'atteindre. On attend que la saisie soit finie.
    const refresh = () => {
      const ici = document.activeElement;
      if (ici && root.contains(ici) && ici.matches('[data-champ]')) return;
      draw();
    };
    return { refresh, destroy() { coquille.retirer(); } };
  },
};
