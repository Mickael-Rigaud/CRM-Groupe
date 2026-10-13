// La page « SAV » de RGD Renova (13/10/2026, Élodie : « le SAV, je le voyais
// plus à part, dans le menu du tableau de bord »).
//
// ⚠ ELLE A ÉTÉ UN ONGLET DE « CLIENTS & PROSPECTS » PENDANT UNE HEURE, ET
// C'ÉTAIT MOINS BIEN : la frise suit l'avancée COMMERCIALE d'un dossier, le SAV
// commence quand elle est finie, et il se suit DOSSIER par dossier — un client
// peut en avoir deux, avec des colonnes que la frise n'a pas (garantie,
// intervenant, coût). C'est une liste de travail quotidienne : elle a sa place
// dans le menu, avec son compteur.
//
// ⚠ LE STATUT `sav` DE LA FICHE RESTE : il la sort de « Chantier terminé », et
// Clients & prospects dit combien de fiches sont ici. La mécanique des dossiers
// (ouvrir, résoudre, rendre la fiche à « Chantier terminé ») ne bouge pas, elle
// vit dans `js/data/rgd-sav.js`.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, terms, hit, searchInput, bindSearch, restoreFocus, openModal, closeModal } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { dossiersDe } from '../data/rgd-sav.js';
import { fenetreSav, celluleSav } from './rgd-sav.js';
import { ouvrirFicheDuClient } from './rgd-clients.js';

// Le nom et le téléphone d'une fiche : une personne OU une entreprise.
export function quiEst(f) {
  const c = f.contact_id ? db.byId('contacts', f.contact_id) : null;
  const o = f.organisation_id ? db.byId('organisations', f.organisation_id) : null;
  const nom = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : (o?.name || '');
  return { ligne: f, nom: nom || 'Sans nom', tel: c?.phone || o?.phone || '' };
}

export const rgdSavPage = {
  title: () => 'RGD Renova — SAV',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { q: '', focus: null, filtre: 'encours', urgents: false, intervenant: '' };

    const draw = () => {
      const fiches = scope.rgd('rgd_clients');
      const dossiers = scope.rgd('rgd_sav');
      const parFiche = new Map(fiches.map(f => [f.id, f]));

      // Les lignes : chaque dossier, plus les fiches rangées en « SAV » sans
      // dossier encore ouvert — sinon elles ne seraient nulle part.
      let lignes = dossiers
        .filter(s => (state.filtre === 'resolus') === (s.statut === 'resolu'))
        .map(s => ({ x: s.fiche_id && parFiche.get(s.fiche_id) ? quiEst(parFiche.get(s.fiche_id)) : null, s }));
      if (state.filtre === 'encours') {
        for (const f of fiches.filter(f => f.statut_suivi === 'sav')) {
          if (!dossiersDe(f).some(s => s.statut !== 'resolu')) lignes.push({ x: quiEst(f), s: null });
        }
      }
      const intervenants = [...new Set(dossiers.map(s => s.intervenant === 'sous_traitant' ? s.sous_traitant_id : s.intervenant).filter(Boolean))];
      const qt = terms(state.q);
      lignes = lignes
        .filter(l => !state.urgents || l.s?.urgence === 'urgente')
        .filter(l => !state.intervenant || (l.s && (l.s.intervenant === 'sous_traitant' ? l.s.sous_traitant_id : l.s.intervenant) === state.intervenant))
        .filter(l => hit([l.x?.nom, l.x?.tel, l.s?.objet], qt));
      if (state.filtre === 'resolus') {
        lignes.sort((a, b) => String(b.s.resolu_le || '').localeCompare(String(a.s.resolu_le || '')));
      } else {
        // Les urgents d'abord, puis le plus ancien : c'est celui qui attend le plus.
        lignes.sort((a, b) => (b.s?.urgence === 'urgente') - (a.s?.urgence === 'urgente')
          || String(a.s?.ouvert_le || '').localeCompare(String(b.s?.ouvert_le || '')));
      }
      const nEnCours = dossiers.filter(s => s.statut !== 'resolu').length;
      const nResolus = dossiers.length - nEnCours;
      const nomIntervenant = (k) => k === 'rgd' ? 'RGD Renova'
        : (db.byId('rgd_sous_traitants', k)?.raison_sociale || 'Sous-traitant');

      const corps = `
        <div class="toolbar">
          ${searchInput('sav-q', state, 'Rechercher un client, un objet…')}
          <div class="sav-filtre">
            <button type="button" data-filtre="encours" class="${state.filtre === 'encours' ? 'on' : ''}">En cours <span>${nEnCours}</span></button>
            <button type="button" data-filtre="resolus" class="${state.filtre === 'resolus' ? 'on' : ''}">Résolus <span>${nResolus}</span></button>
            <button type="button" id="sav-urgents" class="${state.urgents ? 'on' : ''}">Urgents seulement</button>
          </div>
          ${intervenants.length ? `<select id="sav-inter" aria-label="Intervenant" class="${state.intervenant ? 'actif' : ''}">
            <option value="">Tous les intervenants</option>
            ${intervenants.map(k => `<option value="${esc(k)}"${state.intervenant === k ? ' selected' : ''}>${esc(nomIntervenant(k))}</option>`).join('')}
          </select>` : ''}
          <span class="grow"></span>
          ${scope.canRgd ? '<button class="btn" id="sav-nouveau">+ Nouveau dossier SAV</button>' : ''}
        </div>
        <section class="card table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Dossier</th><th>Chantier</th><th>Garantie</th>
              <th>Intervention</th><th>Statut</th><th>Dernier suivi</th><th class="num">Coût</th><th></th></tr></thead>
            <tbody>${lignes.map((l, i) => { const c = celluleSav(l); return `<tr class="click" data-sav="${i}">
              <td>${c.client}</td><td>${c.dossier}</td><td class="small">${c.chantier}</td><td>${c.garantie}</td>
              <td class="small">${c.intervention}</td><td>${c.statut}</td><td class="sav-dernier">${c.suivi}</td>
              <td class="num small">${c.cout}</td>
              <td>${l.x ? `<button type="button" class="btn ghost sm" data-fiche="${i}" title="Ouvrir la fiche projet">Fiche</button>` : ''}</td>
            </tr>`; }).join('') || `<tr><td colspan="9"><div class="empty">${state.filtre === 'resolus'
              ? 'Aucun dossier SAV résolu.' : 'Aucun dossier SAV en cours.'}</div></td></tr>`}</tbody>
          </table>
        </section>
        <p class="small muted">Un dossier s’ouvre aussi depuis la fiche projet d’un client, ou en passant sa fiche en « SAV »
          dans Clients &amp; prospects. Résoudre le dernier dossier ouvert rend la fiche à « Chantier terminé ».</p>`;

      root.innerHTML = cadre('#/rgd/sav', 'SAV', corps);
      bindSearch(root, 'sav-q', state, draw);
      restoreFocus(root, state);
      root.querySelectorAll('[data-filtre]').forEach(b => b.onclick = () => { state.filtre = b.dataset.filtre; draw(); });
      root.querySelector('#sav-urgents').onclick = () => { state.urgents = !state.urgents; draw(); };
      const inter = root.querySelector('#sav-inter');
      if (inter) inter.onchange = () => { state.intervenant = inter.value; draw(); };
      root.querySelectorAll('tr[data-sav]').forEach(tr => tr.onclick = (e) => {
        if (e.target.closest('select, button, a, input, textarea')) return;
        const l = lignes[Number(tr.dataset.sav)];
        if (l?.x) fenetreSav({ ...l.x.ligne, __nom: l.x.nom }, l.s, draw);
      });
      root.querySelectorAll('[data-fiche]').forEach(b => b.onclick = () => {
        const l = lignes[Number(b.dataset.fiche)];
        if (l?.x) ouvrirFicheDuClient(l.x.ligne, draw);
      });
      root.querySelector('#sav-nouveau')?.addEventListener('click', () => choisirClient(fiches, draw));
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};

// « + Nouveau dossier SAV » : on choisit d'abord le client. Les fiches dont le
// chantier est terminé passent en tête, ce sont elles qui appellent un SAV.
function choisirClient(fiches, apres) {
  const tous = fiches.map(quiEst)
    .sort((a, b) => (['chantier_termine', 'sav'].includes(b.ligne.statut_suivi) - ['chantier_termine', 'sav'].includes(a.ligne.statut_suivi))
      || a.nom.localeCompare(b.nom, 'fr'));
  const liste = (q) => {
    const t = terms(q);
    return tous.filter(x => hit([x.nom, x.tel], t)).slice(0, 30).map((x, i) => `<button type="button" class="rgdf-sav-ligne" data-i="${tous.indexOf(x)}">
      <span class="rgdf-sav-objet"><b>${esc(x.nom)}</b>${x.tel ? `<span class="s muted"> · ${esc(x.tel)}</span>` : ''}${
        ['chantier_termine', 'sav'].includes(x.ligne.statut_suivi) ? '<span class="s muted"> · chantier terminé</span>' : ''}</span>
    </button>`).join('') || '<p class="muted">Aucun client ne correspond.</p>';
  };
  openModal('Nouveau dossier SAV — quel client ?', `
    <input type="search" id="sav-choix-q" class="filter-input" placeholder="Nom ou téléphone…" style="width:100%;margin-bottom:10px">
    <div id="sav-choix">${liste('')}</div>`, { onOpen: (m) => {
    const q = m.querySelector('#sav-choix-q');
    const zone = m.querySelector('#sav-choix');
    const lier = () => zone.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      const x = tous[Number(b.dataset.i)];
      closeModal(true);
      fenetreSav({ ...x.ligne, __nom: x.nom }, null, apres);
    });
    q.oninput = () => { zone.innerHTML = liste(q.value); lier(); };
    lier();
    q.focus();
  } });
}
