// Espace RGD Renova — formations
//
// Quatre fiches de poste : conducteur de travaux, chargé d'affaires,
// sous-traitance, assistante administrative. Vingt fiches, cinquante-sept
// sections, reprises du tableau de bord le 21/09/2026.
//
// CE N'EST PAS UN ÉCRAN DE DONNÉES
// Aucune table, aucun relevé, rien à synchroniser : du texte que quelqu'un a
// écrit. Il n'y a donc pas de bandeau « lecture seule » ici — il n'y a rien
// qui puisse être écrasé au relevé suivant. Le texte se modifie dans
// `js/data/rgd-formations.js`.
//
// POURQUOI DES <details> ET PAS DES ONGLETS
// Une fiche fait cinq à dix paragraphes. Vingt fiches en accordéon tiennent sur
// un écran replié et se lisent au clavier ; en onglets, il faudrait vingt clics
// pour savoir ce que le référentiel contient. Le premier de chaque rubrique est
// ouvert, pour qu'on voie tout de suite à quoi ressemble une fiche.
//
// UNE SECTION, DEUX FORMES
// Une section porte soit un paragraphe (`contenu`), soit une liste (`puces`).
// La liste est la forme dominante : 43 sections sur 57 et 177 puces. Rendre
// seulement `contenu` — ce que faisait la première version de cet écran —
// affichait 43 titres suivis de rien, et personne ne l'aurait vu autrement
// qu'en cherchant un mot qui ne se trouvait pas.
//
// LA RECHERCHE PORTE SUR LE CORPS DU TEXTE
// Chercher « décennale » doit trouver le paragraphe qui en parle, pas seulement
// un titre qui la nommerait. Les fiches trouvées s'ouvrent d'office : replier
// un résultat de recherche reviendrait à le cacher.
import { esc, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { RUBRIQUES } from '../data/rgd-formations.js';

// Le texte d'une fiche, pour la recherche. LES PUCES EN FONT PARTIE : une
// section porte soit un paragraphe (`contenu`), soit une liste (`puces`), et
// c'est la liste qui domine — 43 sections sur 57, 177 puces. Les oublier
// revenait à chercher dans un quart du référentiel.
const texteDe = (f) => [f.titre, f.resume,
  ...(f.sections || []).flatMap(s => [s.titre, s.contenu, ...(s.puces || [])])];

export const rgdFormationsPage = {
  title: () => 'RGD Renova — Formations',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { rubrique: RUBRIQUES[0]?.key || '', q: '', focus: null };

    const draw = () => {
      const ts = terms(state.q);
      const cherche = ts.length > 0;

      // Pendant une recherche, on traverse TOUTES les rubriques : personne ne
      // sait dans quelle fiche de poste dort la réponse, et l'obliger à
      // chercher quatre fois serait lui faire faire le travail de l'écran.
      const vues = RUBRIQUES
        .filter(r => cherche || r.key === state.rubrique)
        .map(r => ({ ...r, fiches: r.fiches.filter(f => hit(texteDe(f), ts)) }))
        .filter(r => r.fiches.length);

      const total = RUBRIQUES.reduce((t, r) => t + r.fiches.length, 0);
      const trouvees = vues.reduce((t, r) => t + r.fiches.length, 0);

      const corps = `
        <div class="alert rgd-source">
          <b>i</b>
          <div>Ces fiches sont du <b>contenu rédigé</b>, pas des données : rien n’est
          relevé depuis le tableau de bord et rien ne sera écrasé. Pour les corriger,
          il faut modifier le fichier <code>js/data/rgd-formations.js</code> du CRM.</div>
        </div>

        <div class="esp-kpis">
          ${RUBRIQUES.map(r => kpiEspace({
            label: r.titre, valeur: r.fiches.length,
            sous: r.description, icone: r.icon,
            ton: r.key === state.rubrique && !cherche ? 'accent' : 'muted',
            href: '#/rgd/formations',
          })).join('')}
        </div>

        <div class="pill-tabs">
          ${RUBRIQUES.map(r => `<button type="button" data-rub="${esc(r.key)}"
            class="${!cherche && state.rubrique === r.key ? 'on' : ''}">${esc(r.titre)}<span>${r.fiches.length}</span></button>`).join('')}
        </div>

        <div class="toolbar">
          ${searchInput('rfo-q', state, 'Rechercher dans les vingt fiches…')}
          <span class="grow"></span>
          <span class="muted small">${cherche
            ? `${trouvees} fiche${trouvees > 1 ? 's' : ''} sur ${total}, toutes rubriques`
            : `${total} fiches au total`}</span>
        </div>

        ${vues.map(r => `
          <section class="card fo-rubrique" style="--tint:${esc(r.tint || 'var(--accent)')}">
            <div class="card-head">
              <h2><span class="fo-ico">${r.icon}</span> ${esc(r.titre)}</h2>
              <span class="muted small">${esc(r.description)}</span>
            </div>
            ${r.fiches.map((f, i) => `
              <details class="fo-fiche" ${cherche || i === 0 ? 'open' : ''}>
                <summary>
                  <b>${esc(f.titre)}</b>
                  ${f.resume ? `<span class="s muted">${esc(f.resume)}</span>` : ''}
                </summary>
                ${(f.sections || []).map(s => `<div class="fo-section">
                  <b>${esc(s.titre)}</b>
                  ${s.contenu ? `<p>${esc(s.contenu)}</p>` : ''}
                  ${(s.puces || []).length
                    ? `<ul class="fo-puces">${s.puces.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
                    : ''}
                </div>`).join('')}
              </details>`).join('')}
          </section>`).join('') || `<div class="card"><div class="empty">
            Aucune fiche ne parle de « ${esc(state.q)} ».</div></div>`}`;

      root.innerHTML = cadre('#/rgd/formations', 'Formations', corps);
      bindSearch(root, 'rfo-q', state, draw);
      restoreFocus(root, state);
      root.querySelectorAll('[data-rub]').forEach(b => b.onclick = () => {
        state.rubrique = b.dataset.rub; state.q = ''; draw();
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
