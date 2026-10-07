// Espace RGD Renova — Prospection (la veille hebdomadaire des sous-traitants)
//
// Demandé le 07/10/2026 : « je voudrais le nom de l'écran dans le menu
// "prospection" pour retrouver cette veille », puis, le même jour, « reprends
// cette présentation pour Prospection de RGD Renova » — celle du vivier Experts
// & AMO de BTP Expertise. Les colonnes sont les siennes, moins celles qui
// n'ont de sens que pour recruter un expert (cible, expérience, scores,
// certitude) : Nom · Ville · Dépt · Métier · Entreprise · Contact · Suivi · Relance.
//
// Chaque lundi, l'Edge Function `veille-sous-traitants` dépose deux artisans
// par corps de métier (annuaire public des entreprises, 25 km de Chantilly).
// Le suivi les mène de « À valider » à « Gardé », qui les fait entrer dans
// Sous-traitants, ou à « Écarté ». Voir `js/data/rgd-st-veille.js`.
//
// ⚠ LE CONTACT ET LA RELANCE S'ÉCRIVENT DANS LA LIGNE, AU `change`, SANS
// REDESSIN : un redessin remplacerait le champ sous le doigt de qui vient d'y
// taper, et ferait glisser la ligne si le tri porte sur la relance. Seul le
// suivi redessine — il peut faire sortir la ligne de la vue, c'est voulu.
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
const km = (t) => (t.distance_km != null ? `${String(t.distance_km).replace('.', ',')} km` : '');
const qualite = (d) => (String(d || '').match(/\(([^)]*)\)\s*$/) || [])[1] || '';
const majuscule = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

// Le jour LOCAL, jamais `toISOString()` (UTC : une relance posée à 23 h serait
// datée du lendemain).
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const enRetard = (t) => !!t.prochaine_relance && t.prochaine_relance < aujourdhui();

const VUES = [['cours', 'En cours'], ['gardes', 'Gardés'], ['ecartes', 'Écartés']];
const DANS_LA_VUE = {
  cours: (t) => !SUIVI_VEILLE[t.etat]?.fin,
  gardes: (t) => t.etat === 'retenu',
  ecartes: (t) => t.etat === 'ecarte',
};

export const rgdProspectionPage = {
  title: () => 'RGD Renova — Prospection',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { q: '', focus: null, vue: 'cours', metier: '', suivi: '', sort: 'suivi', dir: 1 };

    const draw = () => {
      if (!scope.isDirection) {
        root.innerHTML = cadre('#/rgd/prospection', 'Prospection',
          '<section class="card"><div class="empty">La veille de prospection est réservée à la direction.</div></section>');
        return;
      }
      const toutes = db.t('rgd_st_veille');
      const metiers = [...new Set(toutes.map(t => t.corps_metier))].sort((a, b) => a.localeCompare(b, 'fr'));
      const qt = terms(state.q);
      const val = (t) => ({
        nom: nomDirigeant(t.dirigeant) || t.raison_sociale, ville: t.ville || '', metier: t.corps_metier || '',
        entreprise: t.raison_sociale || '', suivi: ORDRE_SUIVI[t.etat] ?? 99, relance: t.prochaine_relance || '9999',
      })[state.sort];
      const lignes = toutes
        .filter(DANS_LA_VUE[state.vue])
        .filter(t => (!state.metier || t.corps_metier === state.metier) && (!state.suivi || t.etat === state.suivi))
        .filter(t => hit([t.raison_sociale, t.dirigeant, t.ville, t.corps_metier, t.telephone, t.email], qt))
        .sort((a, b) => {
          const x = val(a), y = val(b);
          const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr');
          return (c || (b.score || 0) - (a.score || 0)) * state.dir;
        });
      const nb = (k) => toutes.filter(t => t.etat === k).length;
      const retards = toutes.filter(t => DANS_LA_VUE.cours(t) && enRetard(t)).length;

      const th = (k, label) => `<th data-sort="${k}" style="cursor:pointer;white-space:nowrap">${label}${
        state.sort === k ? (state.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
      const opt = (liste, cur) => liste.map(([k, l]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
      const selectSuivi = (t) => t.etat === 'retenu'
        ? '<span class="chip green">Gardé</span><div class="small"><a href="#/rgd/soustraitants">Dans Sous-traitants →</a></div>'
        : `<select class="filter-input" style="padding:4px 8px;min-width:130px;font-size:12px" data-suivi="${esc(t.id)}">
            ${opt(Object.entries(SUIVI_VEILLE).map(([k, v]) => [k, v.label]), t.etat)}</select>`;

      const corps = `
        <section class="st-tete st-tete-veille">
          <div>
            <h2>Veille sous-traitants <span class="chip accent">◇ ${nb('a_valider')} à valider</span></h2>
            <p class="muted small">Chaque lundi matin, vingt artisans à 25 km de Chantilly au plus, pris dans la
            liste des entreprises RGE de l’ADEME : <b>tous ont un téléphone ou un e-mail</b>. Deux par corps de
            métier quand il y en a ; plâtrerie, carrelage et terrassement y sont rares. Passer le suivi à
            « Gardé » les fait entrer dans Sous-traitants, en prospection.</p>
          </div>
        </section>

        <div class="card tight">
          <div class="toolbar">
            ${searchInput('rpv-q', state, 'Nom, entreprise, ville, métier, téléphone…')}
            <select id="rpv-metier"><option value="">Tous les métiers</option>${opt(metiers.map(m => [m, m]), state.metier)}</select>
            <select id="rpv-suivi"><option value="">Tout suivi</option>${opt(Object.entries(SUIVI_VEILLE)
              .filter(([, v]) => !v.fin).map(([k, v]) => [k, v.label]), state.suivi)}</select>
            <span class="grow"></span>
            ${retards ? `<span class="small vb-retard">${retards} relance${retards > 1 ? 's' : ''} due${retards > 1 ? 's' : ''}</span>` : ''}
            <select id="rpv-vue">${opt(VUES.map(([k, l]) => [k, `${l} (${toutes.filter(DANS_LA_VUE[k]).length})`]), state.vue)}</select>
          </div>
        </div>

        <div class="card"><div class="card-head"><h2>${lignes.length} artisan${lignes.length > 1 ? 's' : ''}</h2>
          <span class="muted small">Le suivi, le contact et la relance se changent dans la liste.</span></div>
          <div class="table-wrap"><table class="vb-table rpv-table"><thead><tr>
            ${th('nom', 'Nom')}${th('ville', 'Ville')}<th>Dépt</th>${th('metier', 'Métier')}${th('entreprise', 'Entreprise')}<th>Contact</th>${th('suivi', 'Suivi')}${th('relance', 'Relance')}
          </tr></thead><tbody>
            ${lignes.map(t => {
              const nom = nomDirigeant(t.dirigeant);
              return `<tr class="${t.etat === 'ecarte' ? 'muted' : ''}">
              <td><b>${nom ? esc(majuscule(nom)) : '<span class="muted">—</span>'}</b>
                ${qualite(t.dirigeant) ? `<div class="small muted">${esc(qualite(t.dirigeant))}</div>` : ''}</td>
              <td>${esc(majuscule(t.ville || ''))}<div class="small muted">${km(t)}</div></td>
              <td>${esc(String(t.code_postal || '').slice(0, 2))}</td>
              <td class="small">${esc(t.corps_metier || '')}</td>
              <td class="small"><b>${esc(t.raison_sociale)}</b>
                <div class="muted">${t.est_rge ? '<span class="chip green">RGE</span> ' : ''}${esc(t.effectif || '')}${
                  t.date_creation ? ` · depuis ${esc(t.date_creation.slice(0, 4))}` : ''}</div>
                <div><a href="${esc(lienAnnuaire(t))}" target="_blank" rel="noopener">Fiche entreprise ↗</a>${
                  t.site_internet ? ` · <a href="${esc(lienSite(t.site_internet))}" target="_blank" rel="noopener">Site ↗</a>` : ''}</div></td>
              <td class="small rpv-contact">
                <input type="tel" class="filter-input" data-champ="telephone" data-id="${esc(t.id)}"
                  value="${esc(t.telephone || '')}" placeholder="Téléphone">
                <input type="email" class="filter-input" data-champ="email" data-id="${esc(t.id)}"
                  value="${esc(t.email || '')}" placeholder="E-mail">
                ${!t.telephone && !t.email ? `<a href="${esc(lienRecherche(t))}" target="_blank" rel="noopener"
                  title="L’annuaire ne donne ni téléphone ni e-mail">Chercher ses coordonnées ↗</a>` : ''}</td>
              <td>${selectSuivi(t)}</td>
              <td class="small nowrap${enRetard(t) ? ' vb-retard' : ''}">
                <input type="date" class="filter-input" data-champ="prochaine_relance" data-id="${esc(t.id)}"
                  value="${esc(t.prochaine_relance || '')}"></td>
            </tr>`;
            }).join('') || '<tr><td colspan="8" class="empty">Aucun artisan ne correspond à ces filtres.</td></tr>'}
          </tbody></table></div>
        </div>`;

      root.innerHTML = cadre('#/rgd/prospection', 'Prospection', corps);
      bindSearch(root, 'rpv-q', state, draw);
      restoreFocus(root, state);

      const sel = (id, cle) => { const s = root.querySelector(id); if (s) s.onchange = () => { state[cle] = s.value; draw(); }; };
      sel('#rpv-metier', 'metier'); sel('#rpv-suivi', 'suivi'); sel('#rpv-vue', 'vue');
      root.querySelectorAll('[data-sort]').forEach(h => h.onclick = () => {
        if (state.sort === h.dataset.sort) state.dir *= -1;
        else { state.sort = h.dataset.sort; state.dir = 1; }
        draw();
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
          i.closest('td').classList.toggle('vb-retard', enRetard({ prochaine_relance: i.value }));
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
