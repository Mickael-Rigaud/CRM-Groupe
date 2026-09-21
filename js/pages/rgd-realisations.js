// Espace RGD Renova — réalisations et carrousel
//
// ÉTAPE 4 DE LA MIGRATION, RANG 5. Lecture seule, comme les rangs précédents.
//
// CE QUE CET ÉCRAN MONTRE, ET À QUI IL SERT
// Les 31 chantiers publiés sur rgdrenova.fr, avec leur ville, leur surface, leur
// durée et leur gamme. Ce n'est pas un écran de gestion : c'est la bibliothèque
// de références. Quelqu'un au téléphone avec un prospect de Chantilly qui
// hésite sur une salle de bain doit pouvoir trouver en dix secondes une salle
// de bain faite à Chantilly, et lui en envoyer le lien.
//
// D'OÙ VIENT LE DÉCOUPAGE EN LIGNES
// Côté Cloudflare, tout ça tient dans UNE ligne : un document JSON. C'est le
// relevé qui le déplie en projets et en images — voir la migration
// 20260921250000. Un blob ne se cherche pas, ne se compte pas, ne se trie pas ;
// une table, si. Le découpage suit la structure du JSON, il n'en invente pas.
//
// ET C'EST LE SITE QUI FAIT FOI
// Ces contenus sont ceux d'un site web que le CRM ne publie pas. Une correction
// se fait dans l'application RGD, qui écrit sur rgdrenova.fr ; faite ici, elle
// serait écrasée au relevé suivant — et ne serait de toute façon jamais partie
// en ligne.
import { scope } from '../data/scope.js';
import { esc, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';

// La première photo d'un projet, quand il y en a une. Deux projets sur
// trente et un n'en ont aucune : la vignette se tait plutôt que de montrer un
// cadre cassé.
const vignette = (p) => (Array.isArray(p.images) && p.images[0]) || null;

// Le nombre de photos, avant/après compris. C'est ce qui dit si une référence
// est montrable ou si elle n'est qu'un titre.
const nbPhotos = (p) => (Array.isArray(p.images) ? p.images.length : 0);

// Un témoignage existe toujours dans le JSON du site, mais presque toujours
// vide (`{text: "", author: "", stars: 5}`). Cinq étoiles sur un texte vide ne
// sont pas un avis : on ne le compte que s'il a un texte.
const temoignageDe = (p) => {
  const t = p.temoignage;
  return t && typeof t === 'object' && String(t.text || '').trim() ? t : null;
};

export const rgdRealisationsPage = {
  title: () => 'RGD Renova — Réalisations',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'realisations', q: '', cat: '', focus: null };

    const draw = () => {
      const tous = scope.rgd('rgd_realisations').slice()
        .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
      const images = scope.rgd('rgd_carrousel').slice()
        .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));

      // Les catégories telles que le site les ordonne, sans doublon.
      const cats = [];
      for (const p of tous) {
        if (p.categorie_slug && !cats.some(c => c.slug === p.categorie_slug)) {
          cats.push({ slug: p.categorie_slug, nom: p.categorie_nom || p.categorie_slug,
                      n: tous.filter(x => x.categorie_slug === p.categorie_slug).length });
        }
      }

      const avecPhotos = tous.filter(p => nbPhotos(p) > 0).length;
      const avecTemoignage = tous.filter(temoignageDe).length;
      const avantApres = tous.filter(p => Array.isArray(p.avant_apres) && p.avant_apres.length).length;

      const ts = terms(state.q);
      const vus = tous
        .filter(p => !state.cat || p.categorie_slug === state.cat)
        .filter(p => hit([p.titre, p.ville, p.gamme, p.description, p.categorie_nom], ts));

      const corps = `
        <div class="alert rgd-source">
          <b>i</b>
          <div>Ces réalisations sont celles publiées sur <b>rgdrenova.fr</b>. Elles
          se modifient dans l’<a href="#/rgd/app">application RGD</a>, qui écrit sur
          le site — une correction faite ici ne partirait pas en ligne et serait
          écrasée au relevé suivant.</div>
        </div>

        <div class="esp-kpis">
          ${kpiEspace({ label: 'Réalisations publiées', valeur: tous.length,
            sous: `${cats.length} catégorie${cats.length > 1 ? 's' : ''}`, icone: '🏗', href: '#/rgd/realisations' })}
          ${kpiEspace({ label: 'Avec photos', valeur: avecPhotos,
            sous: avecPhotos < tous.length ? `${tous.length - avecPhotos} sans aucune photo` : 'toutes illustrées',
            icone: '📷', ton: avecPhotos < tous.length ? 'amber' : 'green', href: '#/rgd/realisations' })}
          ${kpiEspace({ label: 'Avant / après', valeur: avantApres,
            sous: 'paires de photos comparables', icone: '↔',
            ton: avantApres ? 'accent' : 'muted', href: '#/rgd/realisations' })}
          ${kpiEspace({ label: 'Témoignages clients', valeur: avecTemoignage,
            sous: avecTemoignage ? 'avec un texte' : 'aucun texte saisi',
            icone: '💬', ton: avecTemoignage ? 'green' : 'muted', href: '#/rgd/realisations' })}
        </div>

        <div class="pill-tabs">
          <button type="button" data-vue="realisations" class="${state.vue === 'realisations' ? 'on' : ''}">Réalisations<span>${tous.length}</span></button>
          <button type="button" data-vue="carrousel" class="${state.vue === 'carrousel' ? 'on' : ''}">Carrousel d’accueil<span>${images.length}</span></button>
        </div>

        ${state.vue === 'realisations' ? `
        <div class="toolbar">
          ${searchInput('rre-q', state, 'Rechercher une ville, une gamme, un type de travaux…')}
          <span class="grow"></span>
          <select id="rre-cat" aria-label="Catégorie">
            <option value="">Toutes les catégories</option>
            ${cats.map(c => `<option value="${esc(c.slug)}" ${state.cat === c.slug ? 'selected' : ''}>${esc(c.nom)} (${c.n})</option>`).join('')}
          </select>
        </div>

        <div class="rea-grille">
          ${vus.map(p => { const img = vignette(p); const t = temoignageDe(p); return `
            <article class="card rea-carte">
              <div class="rea-photo">${img
                ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
                : '<span class="muted small">pas de photo</span>'}</div>
              <div class="rea-corps">
                <b>${esc(p.titre || '(sans titre)')}</b>
                <div class="s muted">${esc([p.ville, p.categorie_nom].filter(Boolean).join(' · ') || '—')}</div>
                <div class="rea-faits">
                  ${p.gamme ? `<span class="chip accent">${esc(p.gamme)}</span>` : ''}
                  ${p.surface ? `<span class="chip">${esc(p.surface)}</span>` : ''}
                  ${p.duree ? `<span class="chip">${esc(p.duree)}</span>` : ''}
                  ${nbPhotos(p) ? `<span class="chip muted">${nbPhotos(p)} photo${nbPhotos(p) > 1 ? 's' : ''}</span>` : ''}
                  ${Array.isArray(p.avant_apres) && p.avant_apres.length ? '<span class="chip green">avant / après</span>' : ''}
                </div>
                ${t ? `<p class="s rea-avis">« ${esc(String(t.text).slice(0, 160))} »
                  ${t.author ? `<span class="muted">— ${esc(t.author)}</span>` : ''}</p>` : ''}
                ${p.url ? `<a class="s" href="${esc(p.url)}" target="_blank" rel="noopener">voir sur le site</a>` : ''}
              </div>
            </article>`; }).join('') || `<div class="card"><div class="empty">${
              state.q || state.cat ? 'Aucune réalisation ne correspond.' : 'Aucune réalisation relevée.'
            }</div></div>`}
        </div>` : `
        <div class="toolbar">
          <span class="muted small">${images.length} image${images.length > 1 ? 's' : ''},
          dans l’ordre d’affichage sur la page d’accueil</span>
        </div>

        <div class="rea-grille">
          ${images.map(i => `<article class="card rea-carte">
            <div class="rea-photo"><img src="${esc(i.url.startsWith('http') ? i.url : 'https://rgdrenova.fr' + i.url)}"
              alt="" loading="lazy" referrerpolicy="no-referrer"></div>
            <div class="rea-corps">
              <span class="chip muted">${(i.rang ?? 0) + 1}</span>
              <div class="s">${esc(i.legende || '(sans légende)')}</div>
            </div>
          </article>`).join('') || '<div class="card"><div class="empty">Aucune image relevée.</div></div>'}
        </div>
        <p class="small muted">Les images du carrousel sont enregistrées en chemin relatif
        côté site (<code>/medias/…</code>) : elles sont affichées ici depuis rgdrenova.fr.</p>`}`;

      root.innerHTML = cadre('#/rgd/realisations', 'Réalisations', corps);
      if (state.vue === 'realisations') {
        bindSearch(root, 'rre-q', state, draw);
        restoreFocus(root, state);
        const sel = root.querySelector('#rre-cat');
        if (sel) sel.onchange = () => { state.cat = sel.value; draw(); };
      }
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        state.vue = b.dataset.vue; state.q = ''; state.cat = ''; draw();
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
