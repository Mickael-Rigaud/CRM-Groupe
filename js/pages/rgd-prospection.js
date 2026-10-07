// Espace RGD Renova — Prospection (la veille hebdomadaire des sous-traitants)
//
// Demandé le 07/10/2026 : « je voudrais le nom de l'écran dans le menu
// "prospection" pour retrouver cette veille ». La veille avait d'abord été
// posée en bloc sur l'écran Sous-traitants ; elle a son écran à elle, entrée
// « Prospection » du groupe « Base de données », et Sous-traitants ne garde
// qu'une ligne qui y renvoie quand des trouvailles attendent.
//
// Chaque lundi, l'Edge Function `veille-sous-traitants` dépose deux artisans
// par corps de métier (annuaire public des entreprises, 25 km de Chantilly).
// « Garder » les fait passer en prospection dans Sous-traitants, « Écarter »
// les retire pour de bon. Voir `js/data/rgd-st-veille.js`.
//
// ⚠ DIRECTION SEULE : la table lui est réservée (policies `my_role()`), et
// l'entrée de menu n'est montrée qu'à elle — voir `cadre` dans rgd-espace.js.

import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, fmtDate, toast } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { trouvaillesAValider, garderTrouvaille, ecarterTrouvaille, reprendreTrouvaille } from '../data/rgd-st-veille.js';

const lienAnnuaire = (t) => `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(t.siret)}`;
const lienRecherche = (t) => `https://www.google.com/search?q=${encodeURIComponent(`${t.raison_sociale} ${t.ville || ''}`)}`;
const km = (t) => (t.distance_km != null ? `${String(t.distance_km).replace('.', ',')} km` : '');

const celluleEntreprise = (t) => `<td><b>${esc(t.raison_sociale)}</b>
  ${t.dirigeant ? `<div class="s muted">${esc(t.dirigeant)}</div>` : ''}
  <div class="s"><a href="${esc(lienAnnuaire(t))}" target="_blank" rel="noopener">Fiche entreprise ↗</a>
  · <a href="${esc(lienRecherche(t))}" target="_blank" rel="noopener"
       title="Le téléphone et l’e-mail ne sont pas dans l’annuaire">Chercher ses coordonnées ↗</a></div></td>`;

const celluleProfil = (t) => `<td class="s">${t.est_rge ? '<span class="chip green">RGE</span> ' : ''}${esc(t.effectif || '')}
  ${t.date_creation ? `<div class="muted">depuis ${esc(t.date_creation.slice(0, 4))}</div>` : ''}</td>`;

export const rgdProspectionPage = {
  title: () => 'RGD Renova — Prospection',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);

    const draw = () => {
      if (!scope.isDirection) {
        root.innerHTML = cadre('#/rgd/prospection', 'Prospection',
          '<section class="card"><div class="empty">La veille de prospection est réservée à la direction.</div></section>');
        return;
      }
      const aValider = trouvaillesAValider();
      // Ce qui a déjà été tranché, le plus récent d'abord : c'est la mémoire de
      // la veille, et le seul endroit où reprendre un artisan écarté trop vite.
      const tranches = db.t('rgd_st_veille').filter(t => t.etat !== 'a_valider')
        .sort((a, b) => String(b.traite_le || '').localeCompare(String(a.traite_le || '')))
        .slice(0, 60);

      const corps = `
        <section class="st-tete st-tete-veille">
          <div>
            <h2>Veille sous-traitants <span class="chip accent">◇ ${aValider.length} à valider</span></h2>
            <p class="muted small">Chaque lundi matin, deux artisans par corps de métier, repérés dans l’annuaire
            public des entreprises : en activité, de 1 à 49 salariés, à 25 km de Chantilly au plus, les RGE en
            premier. « Garder » les fait passer en prospection dans Sous-traitants ; « Écarter » les retire,
            ils ne seront plus reproposés.</p>
          </div>
        </section>

        ${aValider.length ? `<section class="card table-wrap st-veille">
          <table>
            <thead><tr><th>Entreprise</th><th>Métier</th><th>Où</th><th>Profil</th><th></th></tr></thead>
            <tbody>${aValider.map(t => `<tr>
              ${celluleEntreprise(t)}
              <td>${esc(t.corps_metier)}</td>
              <td>${esc(t.ville || '—')}<div class="s muted">${km(t)}</div></td>
              ${celluleProfil(t)}
              <td class="num st-actions">
                <button type="button" class="btn primary sm" data-garder="${esc(t.id)}">Garder</button>
                <button type="button" class="btn ghost sm" data-ecarter="${esc(t.id)}">Écarter</button>
              </td>
            </tr>`).join('')}</tbody>
          </table>
        </section>` : `<section class="card"><div class="empty">
          <b>Rien à valider</b><br>Les prochaines trouvailles arrivent lundi matin.</div></section>`}

        ${tranches.length ? `<div class="st-separation"></div>
        <section class="card table-wrap">
          <div class="card-head"><h2>Déjà tranchés</h2><span class="grow"></span>
            <span class="muted small">${tranches.length} dernier${tranches.length > 1 ? 's' : ''}</span></div>
          <table>
            <thead><tr><th>Entreprise</th><th>Métier</th><th>Où</th><th>Décision</th><th></th></tr></thead>
            <tbody>${tranches.map(t => `<tr class="${t.etat === 'ecarte' ? 'muted' : ''}">
              ${celluleEntreprise(t)}
              <td>${esc(t.corps_metier)}</td>
              <td>${esc(t.ville || '—')}<div class="s muted">${km(t)}</div></td>
              <td>${t.etat === 'retenu' ? '<span class="chip green">Gardé</span>' : '<span class="chip">Écarté</span>'}
                ${t.traite_le ? `<div class="s muted">le ${esc(fmtDate(t.traite_le))}</div>` : ''}</td>
              <td class="num st-actions">${t.etat === 'retenu'
                ? '<a class="btn ghost sm" href="#/rgd/soustraitants">Voir dans Sous-traitants</a>'
                : `<button type="button" class="btn ghost sm" data-reprendre="${esc(t.id)}"
                     title="Le remettre parmi les trouvailles à valider">Reprendre</button>`}</td>
            </tr>`).join('')}</tbody>
          </table>
        </section>` : ''}`;

      root.innerHTML = cadre('#/rgd/prospection', 'Prospection', corps);

      const parId = (id) => db.t('rgd_st_veille').find(t => t.id === id);
      root.querySelectorAll('[data-garder]').forEach(b => b.onclick = async () => {
        const t = parId(b.dataset.garder);
        if (!t) return;
        b.disabled = true;
        const r = await garderTrouvaille(t);
        if (!r.ok) { b.disabled = false; toast(`Non enregistré — ${r.motif}`, 'err'); return; }
        toast(`${t.raison_sociale} rejoint les sous-traitants en prospection`);
        draw();
      });
      root.querySelectorAll('[data-ecarter]').forEach(b => b.onclick = async () => {
        const t = parId(b.dataset.ecarter);
        if (!t) return;
        const r = await ecarterTrouvaille(t);
        if (!r.ok) { toast(`Non enregistré — ${r.motif}`, 'err'); return; }
        toast(`${t.raison_sociale} est écarté — la veille ne le reproposera pas`);
        draw();
      });
      root.querySelectorAll('[data-reprendre]').forEach(b => b.onclick = async () => {
        const t = parId(b.dataset.reprendre);
        if (!t) return;
        const r = await reprendreTrouvaille(t);
        if (!r.ok) { toast(`Non enregistré — ${r.motif}`, 'err'); return; }
        toast(`${t.raison_sociale} est de nouveau à valider`);
        draw();
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
