// Espace RGD Renova — agenda
//
// ÉTAPE 4 DE LA MIGRATION, RANG 4. Lecture seule, comme les rangs précédents.
//
// D'OÙ VIENNENT CES RENDEZ-VOUS, ET PAS D'OÙ ON CROYAIT
// Le tableau de bord RGD a une table `evenements` (232 lignes), et j'avais écrit
// dans la migration du rang 1 qu'elle n'avait pas à être reprise puisqu'elle
// était « déjà poussée vers Google ». C'était faux dans le détail : `evenements`
// porte un `google_event_id` sur **toutes** ses lignes — c'est elle qui est une
// copie de Google, pas l'inverse. Reprendre cette table revenait donc à copier
// une copie. Cet écran lit `agenda_events`, c'est-à-dire Google relu par le
// worker, qui est la source.
//
// CE QUE LA FENÊTRE CHANGE
// Jusqu'ici le worker ne relevait que la journée courante — assez pour
// « Ma journée », pas pour un agenda. Il relève désormais J-7 → J+30, mais une
// seule fois par jour : un rendez-vous pris ce matin pour la semaine prochaine
// n'apparaîtra que demain. L'écran le dit, sinon un agenda incomplet se lit
// comme un agenda vide.
import { scope } from '../data/scope.js';
import { esc, isoDay, relDay, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard, KEY } from './rgd-espace.js';

// L'heure d'un rendez-vous. Une journée entière n'en a pas : le dire vaut mieux
// que d'afficher le 00:00 qu'on a fabriqué à la copie.
const heure = (e) => e.all_day
  ? '<span class="muted">journée</span>'
  : new Date(e.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const jourLong = (j) => new Date(j + 'T00:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const decale = (jour, n) =>
  new Date(new Date(jour + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

// « il y a 12 min », pour savoir si l'écran est frais ou si le relevé est en
// panne. Un agenda muet sans cette indication se lit comme un agenda vide.
const depuis = (d) => {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
};

export const rgdAgendaPage = {
  title: () => 'RGD Renova — Agenda',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'avenir', q: '', focus: null };

    const draw = () => {
      const aujourdhui = isoDay();
      const tous = scope.rgd('agenda_events').filter(e => e.activity === KEY);

      const avenir = tous.filter(e => e.day >= aujourdhui);
      const passe = tous.filter(e => e.day < aujourdhui);
      const ceJour = tous.filter(e => e.day === aujourdhui);
      const semaine = tous.filter(e => e.day >= aujourdhui && e.day <= decale(aujourdhui, 6));

      // Jusqu'où le relevé est allé. Ce n'est pas la même chose que « il n'y a
      // rien après » : sans cette borne, un agenda relevé jusqu'au 21 octobre et
      // un agenda vide se ressemblent.
      const borne = tous.reduce((m, e) => (e.day > m ? e.day : m), aujourdhui);
      const vu = tous.map(e => e.synced_at).filter(Boolean)
        .reduce((m, s) => Math.max(m, new Date(s).getTime()), 0);

      // Le prochain rendez-vous encore à venir dans la journée.
      const maintenant = Date.now();
      const prochain = ceJour
        .filter(e => !e.all_day && new Date(e.starts_at).getTime() >= maintenant)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];

      // Quels calendriers alimentent l'écran. Se raccorde dans « Raccorder les
      // agendas » du CRM, pas ici : on se contente de nommer ce qu'on affiche.
      const calendriers = [...new Set(tous.map(e => e.calendar_id).filter(Boolean))];

      const ts = terms(state.q);
      const liste = (state.vue === 'avenir' ? avenir : passe)
        .filter(e => hit([e.title, e.location], ts))
        .sort((a, b) => state.vue === 'avenir'
          ? String(a.day).localeCompare(String(b.day)) || (a.all_day === b.all_day ? new Date(a.starts_at) - new Date(b.starts_at) : a.all_day ? -1 : 1)
          : String(b.day).localeCompare(String(a.day)) || new Date(b.starts_at) - new Date(a.starts_at));

      // Un en-tête par journée : sans lui, une liste de dates répétées oblige à
      // relire la colonne de gauche à chaque ligne.
      let jourCourant = null;
      const lignes = liste.map(e => {
        const entete = e.day === jourCourant ? '' : `<tr class="rdv-jour"><td colspan="4">
          <b>${esc(jourLong(e.day))}</b>
          <span class="muted small">${esc(relDay(e.day))}</span></td></tr>`;
        jourCourant = e.day;
        return `${entete}<tr>
          <td class="rdv-h">${heure(e)}</td>
          <td><b>${esc(e.title || '(sans titre)')}</b>
              ${e.link ? `<a class="s" href="${esc(e.link)}" target="_blank" rel="noopener">ouvrir</a>` : ''}</td>
          <td class="muted">${esc(e.location || '—')}</td>
          <td class="num muted">${e.attendees ? esc(String(e.attendees)) : '—'}</td>
        </tr>`;
      }).join('');

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Aujourd’hui', valeur: ceJour.length,
            sous: prochain ? `prochain à ${heure(prochain)}` : (ceJour.length ? 'journée terminée' : 'journée libre'),
            icone: '📅', ton: ceJour.length ? 'accent' : 'muted', href: '#/rgd/agenda' })}
          ${kpiEspace({ label: 'Sept prochains jours', valeur: semaine.length,
            sous: `jusqu’au ${jourLong(decale(aujourdhui, 6))}`, icone: '🗓', href: '#/rgd/agenda' })}
          ${kpiEspace({ label: 'À venir', valeur: avenir.length,
            sous: `relevé jusqu’au ${jourLong(borne)}`, icone: '→', href: '#/rgd/agenda' })}
          ${kpiEspace({ label: 'Rendez-vous relevés', valeur: tous.length,
            sous: vu ? `copiés depuis Google ${depuis(new Date(vu))}` : 'aucun relevé enregistré',
            icone: '↻', ton: !vu || Date.now() - vu > 36 * 3600000 ? 'amber' : 'accent', href: '#/rgd/agenda' })}
        </div>

        <div class="alert rgd-source">
          <b>i</b>
          <div>Ces rendez-vous sont <b>lus</b> dans Google Agenda ; ils se créent et
          se modifient là-bas, pas ici. La journée en cours est relevée toutes les
          30 minutes, les jours suivants une fois par jour : <b>un rendez-vous pris
          aujourd’hui pour plus tard n’apparaîtra que demain</b>. Et au-delà du
          ${esc(jourLong(borne))}, l’écran ne sait rien — ce n’est pas un agenda
          vide, c’est la fin de la fenêtre relevée.</div>
        </div>

        <div class="pill-tabs">
          <button type="button" data-vue="avenir" class="${state.vue === 'avenir' ? 'on' : ''}">À venir<span>${avenir.length}</span></button>
          <button type="button" data-vue="passe" class="${state.vue === 'passe' ? 'on' : ''}">Passés<span>${passe.length}</span></button>
        </div>

        <div class="toolbar">
          ${searchInput('rag-q', state, 'Rechercher un rendez-vous, un lieu…')}
          <span class="grow"></span>
          <span class="muted small">${calendriers.length
            ? esc(calendriers.join(' · '))
            : 'aucun agenda raccordé pour RGD Renova'}</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Heure</th><th>Rendez-vous</th><th>Lieu</th><th class="num">Invités</th></tr></thead>
            <tbody>${lignes || `<tr><td colspan="4"><div class="empty">${
              state.q ? 'Aucun rendez-vous ne correspond.'
              : state.vue === 'avenir' ? 'Aucun rendez-vous relevé à venir.'
              : 'Aucun rendez-vous passé conservé — le relevé n’en garde que sept jours.'
            }</div></td></tr>`}</tbody>
          </table>
        </section>`;

      root.innerHTML = cadre('#/rgd/agenda', 'Agenda', corps);
      bindSearch(root, 'rag-q', state, draw);
      restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; state.q = ''; draw(); });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
