// Espace RGD Renova — synchronisation Costructor
//
// ÉTAPE 4 DE LA MIGRATION, RANG 6. Lecture seule.
//
// À QUOI SERT CET ÉCRAN
// Costructor est le logiciel de devis et de facturation de RGD Renova. Le
// tableau de bord en recopie les contacts, les devis, les factures et les
// paiements toutes les nuits — et c'est de cette recopie que viennent, de
// proche en proche, les chiffres du CRM. Quand un devis « n'arrive jamais »,
// la réponse est ici, et nulle part ailleurs.
//
// CE QUE LA SYNCHRO ÉCARTE N'EST PAS UNE PANNE
// Vingt-cinq lignes sont volontairement ignorées : deux contacts et
// vingt-trois devis, chacun avec son motif. Ce sont des décisions, pas des
// erreurs — mais invisibles, elles coûtent une heure de recherche à la
// première question. L'écran les montre avec leur motif, au même rang que
// l'état de la synchro.
//
// CE QUE CET ÉCRAN N'EST PAS
// L'archive du journal. Cloudflare en garde 292 lignes et en gardera plus ; le
// relevé n'en transmet que les cent dernières. C'est une fenêtre sur la santé
// de la synchro, pas un registre. Pour remonter plus loin, l'application RGD.
import { scope } from '../data/scope.js';
import { esc, num, fmtDateTime, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';

// Les quatre ressources synchronisées, en français. Une ressource inconnue
// s'affiche telle quelle plutôt que de disparaître.
const RESSOURCES = {
  contacts: 'Contacts', quotes: 'Devis', invoices: 'Factures', payments: 'Paiements',
};
const nomRessource = (r) => RESSOURCES[r] || r || '—';

// Depuis combien de temps une ressource n'a-t-elle pas réussi ? C'est le seul
// chiffre de cet écran qui demande parfois une action.
const retard = (iso) => {
  if (!iso) return { txt: 'jamais', ton: 'red', heures: Infinity };
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 2) return { txt: 'il y a moins de 2 h', ton: 'green', heures: h };
  if (h < 36) return { txt: `il y a ${Math.round(h)} h`, ton: 'green', heures: h };
  const j = Math.round(h / 24);
  return { txt: `il y a ${j} j`, ton: j > 3 ? 'red' : 'amber', heures: h };
};

export const rgdCostructorPage = {
  title: () => 'RGD Renova — Synchronisation Costructor',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'etat', q: '', focus: null };

    const draw = () => {
      const etats = scope.rgd('rgd_costructor_etat').slice()
        .sort((a, b) => nomRessource(a.ressource).localeCompare(nomRessource(b.ressource), 'fr'));
      const journal = scope.rgd('rgd_costructor_journal').slice()
        .sort((a, b) => String(b.debut || '').localeCompare(String(a.debut || '')));
      const ignores = scope.rgd('rgd_costructor_ignores');

      const enEchec = etats.filter(e => e.derniere_erreur);
      const jamais = etats.filter(e => !e.dernier_succes);
      const vieux = etats.filter(e => e.dernier_succes && retard(e.dernier_succes).heures > 36);
      const echecsJournal = journal.filter(l => l.statut && l.statut !== 'ok' && l.statut !== 'success');

      const ts = terms(state.q);
      const ignoresVus = ignores.slice()
        .filter(i => hit([i.reference, i.motif, i.nature], ts))
        .sort((a, b) => String(b.ignore_le || '').localeCompare(String(a.ignore_le || '')));

      const corps = `
        <div class="alert rgd-source">
          <b>i</b>
          <div>Costructor est le logiciel de devis et de facturation de RGD Renova.
          Cette page montre l&rsquo;état de sa recopie vers le tableau de bord — d&rsquo;où
          viennent, de proche en proche, les chiffres de tout cet espace. Elle ne
          déclenche rien : la synchronisation se relance depuis l&rsquo;<a href="#/rgd/app">application RGD</a>.</div>
        </div>

        <div class="esp-kpis">
          ${kpiEspace({ label: 'Ressources suivies', valeur: etats.length,
            sous: etats.map(e => nomRessource(e.ressource)).join(', ') || '—',
            icone: '🔄', href: '#/rgd/costructor' })}
          ${kpiEspace({ label: 'En erreur', valeur: enEchec.length,
            sous: enEchec.length ? enEchec.map(e => nomRessource(e.ressource)).join(', ') : 'aucune erreur enregistrée',
            icone: '⚠', ton: enEchec.length ? 'red' : 'green', href: '#/rgd/costructor' })}
          ${kpiEspace({ label: 'Sans succès récent', valeur: jamais.length + vieux.length,
            sous: jamais.length + vieux.length ? 'plus de 36 h sans passage réussi' : 'toutes à jour',
            icone: '⏰', ton: jamais.length + vieux.length ? 'amber' : 'green', href: '#/rgd/costructor' })}
          ${kpiEspace({ label: 'Écartés volontairement', valeur: ignores.length,
            sous: (() => { const nc = ignores.filter(i => i.nature === 'contact').length;
              const nd = ignores.filter(i => i.nature === 'devis').length;
              return `${nd} devis, ${nc} contact${nc > 1 ? 's' : ''}`; })(),
            icone: '🚫', ton: 'muted', href: '#/rgd/costructor' })}
        </div>

        <div class="pill-tabs">
          <button type="button" data-vue="etat" class="${state.vue === 'etat' ? 'on' : ''}">État<span>${etats.length}</span></button>
          <button type="button" data-vue="ignores" class="${state.vue === 'ignores' ? 'on' : ''}">Écartés<span>${ignores.length}</span></button>
          <button type="button" data-vue="journal" class="${state.vue === 'journal' ? 'on' : ''}">Journal<span>${journal.length}</span></button>
        </div>

        ${state.vue === 'etat' ? `
        <section class="card table-wrap">
          <table>
            <thead><tr><th>Ressource</th><th>Dernier essai</th><th>Dernier succès</th>
              <th class="num">Lignes</th><th>Erreur</th></tr></thead>
            <tbody>${etats.map(e => { const r = retard(e.dernier_succes); return `<tr>
              <td><b>${esc(nomRessource(e.ressource))}</b></td>
              <td class="muted">${e.dernier_essai ? fmtDateTime(e.dernier_essai) : '—'}</td>
              <td><span class="chip ${r.ton}">${esc(r.txt)}</span>
                  ${e.dernier_succes ? `<div class="s muted">${fmtDateTime(e.dernier_succes)}</div>` : ''}</td>
              <td class="num">${e.dernier_nombre != null ? num(e.dernier_nombre) : '<span class="muted">—</span>'}</td>
              <td>${e.derniere_erreur
                ? `<span class="chip red">${esc(String(e.derniere_erreur).slice(0, 80))}</span>`
                : '<span class="muted">—</span>'}</td>
            </tr>`; }).join('') || '<tr><td colspan="5"><div class="empty">Aucun état relevé.</div></td></tr>'}</tbody>
          </table>
        </section>` : state.vue === 'ignores' ? `
        <div class="toolbar">
          ${searchInput('rco-q', state, 'Rechercher une référence, un motif…')}
          <span class="grow"></span>
          <span class="muted small">des décisions, pas des erreurs</span>
        </div>
        <section class="card table-wrap">
          <table>
            <thead><tr><th>Nature</th><th>Référence Costructor</th><th>Écarté le</th><th>Motif</th></tr></thead>
            <tbody>${ignoresVus.map(i => `<tr>
              <td><span class="chip ${i.nature === 'devis' ? 'accent' : 'muted'}">${esc(i.nature === 'devis' ? 'Devis' : 'Contact')}</span></td>
              <td><code>${esc(i.reference)}</code></td>
              <td class="muted">${i.ignore_le ? fmtDateTime(i.ignore_le) : '—'}</td>
              <td>${esc(i.motif || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="4"><div class="empty">Rien n’est écarté.</div></td></tr>'}</tbody>
          </table>
          <p class="small muted">Ces lignes existent dans Costructor et n&rsquo;entrent
          volontairement pas dans le tableau de bord. Si un devis semble manquer quelque
          part, c&rsquo;est la première liste à regarder.</p>
        </section>` : `
        <div class="toolbar">
          <span class="muted small">les ${journal.length} derniers passages
          ${echecsJournal.length ? `· ${echecsJournal.length} en échec` : '· tous réussis'}</span>
        </div>
        <section class="card table-wrap">
          <table>
            <thead><tr><th>Début</th><th>Ressource</th><th>Statut</th>
              <th class="num">Lus</th><th class="num">Créés</th><th class="num">Mis à jour</th>
              <th class="num">Ignorés</th><th>Déclenché par</th></tr></thead>
            <tbody>${journal.map(l => `<tr>
              <td class="muted">${l.debut ? fmtDateTime(l.debut) : '—'}</td>
              <td>${esc(nomRessource(l.ressource))}</td>
              <td>${l.statut === 'ok' || l.statut === 'success'
                ? '<span class="chip green">OK</span>'
                : `<span class="chip red" title="${esc(l.erreur || '')}">${esc(l.statut || 'échec')}</span>`}</td>
              <td class="num">${num(l.lus || 0)}</td>
              <td class="num">${l.crees ? num(l.crees) : '<span class="muted">—</span>'}</td>
              <td class="num">${l.maj ? num(l.maj) : '<span class="muted">—</span>'}</td>
              <td class="num muted">${l.ignores ? num(l.ignores) : '—'}</td>
              <td class="muted">${esc(l.declenche_par || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="8"><div class="empty">Aucun passage relevé.</div></td></tr>'}</tbody>
          </table>
          <p class="small muted">Les <b>cent derniers</b> passages seulement. Cloudflare en
          garde davantage : cet écran est une fenêtre sur la santé de la synchronisation,
          pas son archive.</p>
        </section>`}`;

      root.innerHTML = cadre('#/rgd/costructor', 'Synchronisation Costructor', corps);
      if (state.vue === 'ignores') { bindSearch(root, 'rco-q', state, draw); restoreFocus(root, state); }
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; state.q = ''; draw(); });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
