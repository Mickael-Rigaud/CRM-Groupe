// Espace RGD Renova — agenda
//
// LA PRÉSENTATION EST CELLE DU TABLEAU DE BORD (23/09/2026, demandée par
// Mickael) : un hub en deux colonnes — mini-calendrier et prochains rendez-vous
// à gauche, la journée ou la semaine en grille horaire à droite —, la bascule
// Jour / Semaine, les flèches ‹ ›, et « + Événement ». La liste « À venir /
// Passés » qu'il y avait ici est remplacée : elle disait les mêmes rendez-vous,
// mais on ne lit pas une journée dans un tableau de lignes.
//
// D'OÙ VIENNENT CES RENDEZ-VOUS, ET PAS D'OÙ ON CROYAIT
// Le tableau de bord RGD a une table `evenements` (232 lignes), et j'avais écrit
// dans la migration du rang 1 qu'elle n'avait pas à être reprise puisqu'elle
// était « déjà poussée vers Google ». C'était faux dans le détail : `evenements`
// porte un `google_event_id` sur **toutes** ses lignes — c'est elle qui est une
// copie de Google, pas l'inverse. Cet écran lit `agenda_events`, c'est-à-dire
// Google relu par le worker, qui est la source.
//
// ⚠ TROIS ÉCARTS AVEC L'ORIGINAL, ET AUCUN N'EST UN OUBLI.
//
// 1. LA FENÊTRE. L'original interroge Google en direct pour le mois affiché ;
//    ici on lit un reflet qui ne couvre que **J-7 → J+30**. Un calendrier où
//    l'on peut naviguer donne envie de reculer de deux mois, et l'écran serait
//    vide — non pas parce qu'il n'y a rien, mais parce que rien n'a été relevé.
//    La navigation est donc **bornée à la fenêtre relevée**, les flèches se
//    grisent au bout, et les bornes sont écrites sous le calendrier. Un agenda
//    incomplet se lit sinon comme un agenda libre, ce qui est pire que faux.
//
// 2. LES COULEURS. L'original teinte chaque rendez-vous avec le `colorId` de
//    Google. `agenda_events` **n'a pas cette colonne** — le relevé ne la
//    rapatrie pas. On colore donc par **calendrier**, ce que l'on sait
//    (`calendar_id`) : ça rend le même service — distinguer d'un coup d'œil —
//    sans prétendre reproduire la couleur choisie dans Google.
//
// 3. LA FRAÎCHEUR. Pas de pastille « ● Temps réel » : elle lit
//    `/api/google/status`, qui dit si le *watch* Google est actif côté worker.
//    Ce n'est pas ce qui compte ici — ce qui compte, c'est la date du dernier
//    relevé arrivé dans le CRM, et c'est elle qui est affichée.
//
// CRÉER UN RENDEZ-VOUS
// `POST /api/evenements` écrit dans D1 **puis pousse vers Google**
// (`syncEventToGoogle`). Le rendez-vous part donc bien dans l'agenda. ⚠ Mais il
// ne revient dans cet écran qu'au relevé suivant, puisqu'on lit Google et non
// D1 : trente minutes pour aujourd'hui, demain pour un autre jour. La modale le
// dit, sinon on le chercherait en vain dans la grille.
import { scope } from '../data/scope.js';
import { esc, isoDay, relDay, toast, openModal, closeModal } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard, KEY } from './rgd-espace.js';
import { peutEcrire, creerEvenement } from '../data/rgd-api.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

const jourLong = (j) => new Date(j + 'T00:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// La première lettre seulement. `text-transform: capitalize` en CSS les met
// toutes — « Semaine Du Lundi 21 Septembre » — et ce n'est pas du français.
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const decale = (jour, n) =>
  new Date(new Date(jour + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

// Le lundi de la semaine d'un jour. `getDay()` rend 0 pour dimanche : le `+ 6`
// puis `% 7` ramène lundi à 0, sans quoi une semaine commencerait le dimanche.
const lundiDe = (jour) => {
  const d = new Date(jour + 'T12:00:00');
  return decale(jour, -((d.getDay() + 6) % 7));
};

const minutes = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// « il y a 12 min », pour savoir si l'écran est frais ou si le relevé est en
// panne. Un agenda muet sans cette indication se lit comme un agenda vide.
const depuis = (d) => {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
};

// La couleur d'un rendez-vous vient de SON CALENDRIER, pas de Google — voir le
// commentaire d'en-tête. Six teintes qui se distinguent entre elles, prises
// dans les variables du thème ; au-delà on recommence, deux calendriers de la
// même couleur valant mieux qu'une teinte inventée à l'exécution.
const TEINTES = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--violet)', 'var(--amber)', 'var(--sea)'];
const teinteDe = (calendriers, id) => {
  const i = calendriers.indexOf(id);
  return TEINTES[(i < 0 ? 0 : i) % TEINTES.length];
};

/**
 * Le mini-calendrier de navigation. Les jours hors de la fenêtre relevée sont
 * éteints et non cliquables : proposer un jour dont on ne sait rien reviendrait
 * à promettre une réponse qu'on n'a pas.
 */
function miniCalendrier(mois, jourSel, parJour, min, max) {
  const premier = new Date(mois + '-01T12:00:00');
  const debut = lundiDe(premier.toISOString().slice(0, 10));
  const dansLeMois = (j) => j.slice(0, 7) === mois;
  const cases = [];
  for (let i = 0; i < 42; i++) {
    const j = decale(debut, i);
    if (i >= 35 && !dansLeMois(j)) break;
    const dispo = j >= min && j <= max;
    const n = (parJour.get(j) || []).length;
    cases.push(`<button type="button" class="ag-case${dansLeMois(j) ? '' : ' hors'}${
      j === jourSel ? ' on' : ''}${j === isoDay() ? ' auj' : ''}"
      ${dispo ? `data-jour="${j}"` : 'disabled'}
      title="${esc(jourLong(j))}${n ? ` — ${n} rendez-vous` : ''}">
      ${Number(j.slice(8))}${n ? `<i class="ag-pt"></i>` : ''}</button>`);
  }
  const [a, m] = mois.split('-').map(Number);
  const precedent = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  const suivant = `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  return `<div class="ag-mini">
    <div class="ag-mini-tete">
      <button type="button" class="icon-btn" data-mois="${precedent}"
        ${precedent + '-28' >= min.slice(0, 7) + '-01' ? '' : 'disabled'}>‹</button>
      <b>${esc(MOIS[m - 1])} ${a}</b>
      <button type="button" class="icon-btn" data-mois="${suivant}"
        ${suivant + '-01' <= max ? '' : 'disabled'}>›</button>
    </div>
    <div class="ag-mini-grille">
      ${JOURS.map(j => `<span class="ag-mini-j">${j[0].toUpperCase()}</span>`).join('')}
      ${cases.join('')}
    </div>
  </div>`;
}

/**
 * Une grille horaire. Les rendez-vous sont posés en absolu sur une échelle de
 * minutes, comme dans un vrai calendrier — et non empilés dans l'ordre, ce qui
 * masquerait les chevauchements, justement ce qu'on vient vérifier.
 *
 * ⚠ LA PLAGE S'ADAPTE : 8 h → 19 h par défaut, élargie si un rendez-vous sort
 * de ces bornes. Une plage fixe ferait disparaître un rendez-vous de 7 h.
 */
function grille(jours, parJour, calendriers) {
  const evts = jours.flatMap(j => parJour.get(j) || []).filter(e => !e.all_day);
  let debut = 8 * 60, fin = 19 * 60;
  for (const e of evts) {
    debut = Math.min(debut, Math.floor(minutes(e.starts_at) / 60) * 60);
    fin = Math.max(fin, Math.ceil(minutes(e.ends_at || e.starts_at) / 60) * 60);
  }
  const hauteur = (fin - debut) / 60 * 52;
  const y = (min) => (min - debut) / (fin - debut) * hauteur;

  const heures = [];
  for (let h = debut / 60; h <= fin / 60; h++) {
    heures.push(`<div class="ag-heure" style="top:${y(h * 60)}px">${String(h).padStart(2, '0')}:00</div>`);
  }

  const colonnes = jours.map(j => {
    const duJour = (parJour.get(j) || []);
    const journee = duJour.filter(e => e.all_day);
    const cales = duJour.filter(e => !e.all_day)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    return `<div class="ag-col${j === isoDay() ? ' auj' : ''}">
      <div class="ag-col-tete">
        <span class="ag-col-j">${esc(JOURS[(new Date(j + 'T12:00:00').getDay() + 6) % 7])}</span>
        <b>${Number(j.slice(8))}</b>
        ${journee.length ? `<span class="ag-journee" title="${esc(journee.map(e => e.title).join(' · '))}">
          ${journee.length} journée${journee.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="ag-piste" style="height:${hauteur}px">
        ${heures.map((_, i) => `<div class="ag-ligne" style="top:${y((debut / 60 + i) * 60)}px"></div>`).join('')}
        ${j === isoDay() ? (() => {
          const m = new Date().getHours() * 60 + new Date().getMinutes();
          return m >= debut && m <= fin ? `<div class="ag-now" style="top:${y(m)}px"></div>` : '';
        })() : ''}
        ${cales.map(e => {
          const d = minutes(e.starts_at);
          const f = e.ends_at ? Math.max(minutes(e.ends_at), d + 30) : d + 60;
          return `<a class="ag-evt" style="top:${y(d)}px;height:${Math.max(18, y(f) - y(d))}px;
                --ag-teinte:${teinteDe(calendriers, e.calendar_id)}"
                ${e.link ? `href="${esc(e.link)}" target="_blank" rel="noopener"` : ''}
                title="${esc(e.title || '')}${e.location ? ' — ' + esc(e.location) : ''}">
            <b>${esc(e.title || '(sans titre)')}</b>
            <span>${esc(hhmm(e.starts_at))}${e.location ? ' · ' + esc(e.location) : ''}</span>
          </a>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  return `<div class="ag-grille">
    <div class="ag-heures" style="height:${hauteur}px">${heures.join('')}</div>
    <div class="ag-cols">${colonnes}</div>
  </div>`;
}

/**
 * Créer un rendez-vous. ⚠ Il part dans Google par le worker, mais ne revient
 * dans cet écran qu'au relevé suivant — la modale le dit.
 */
function formulaireEvenement(jour, apres) {
  const corps = `
    <form id="ev-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
      <label class="reg-champ" style="grid-column:1/-1"><span>Titre *</span>
        <input name="titre" required placeholder="RDV chantier, visite, rappel…"></label>
      <label class="reg-champ"><span>Date *</span>
        <input name="date" type="date" required value="${esc(jour)}"></label>
      <label class="reg-champ"><span>Durée</span>
        <select name="duree">
          <option value="30">30 minutes</option>
          <option value="60" selected>1 heure</option>
          <option value="90">1 h 30</option>
          <option value="120">2 heures</option>
          <option value="0">Journée entière</option>
        </select></label>
      <label class="reg-champ"><span>Heure de début</span>
        <input name="heure" type="time" value="09:00"></label>
      <label class="reg-champ"><span>Lieu</span>
        <input name="lieu" placeholder="Adresse du chantier…"></label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Description</span>
        <textarea name="description" rows="2"></textarea></label>
    </form>
    <p class="small muted">Le rendez-vous est créé dans le tableau de bord, qui le pousse
    dans <b>Google Agenda</b>. ⚠ Il <b>n’apparaîtra pas tout de suite ici</b> : cet écran lit
    un relevé de Google — trente minutes pour aujourd’hui, demain pour un autre jour.</p>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn primary" id="ev-ok">Créer le rendez-vous</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <span class="grow"></span><span class="muted small" id="ev-etat"></span>
    </div>`;

  openModal('Nouveau rendez-vous', corps, { onOpen: (m) => {
    m.querySelector('#ev-ok').onclick = async () => {
      const f = m.querySelector('#ev-form');
      if (!f.reportValidity()) return;
      const d = Object.fromEntries(new FormData(f).entries());
      const duree = Number(d.duree);
      // Une journée entière va de minuit à minuit ; sinon on part de l'heure
      // saisie. Le worker exige `date_debut` ET `date_fin` (400 sans elles),
      // donc la fin est toujours calculée, jamais laissée vide.
      const debut = duree === 0 ? `${d.date}T00:00:00` : `${d.date}T${d.heure || '09:00'}:00`;
      const fin = duree === 0
        ? `${decale(d.date, 1)}T00:00:00`
        : new Date(new Date(debut).getTime() + duree * 60000).toISOString().slice(0, 19);
      const champs = {
        titre: d.titre.trim(),
        date_debut: debut,
        date_fin: fin,
        all_day: duree === 0 ? 1 : 0,
      };
      if (d.lieu.trim()) champs.lieu = d.lieu.trim();
      if (d.description.trim()) champs.description = d.description.trim();

      const b = m.querySelector('#ev-ok');
      b.disabled = true;
      m.querySelector('#ev-etat').textContent = 'Envoi vers Google…';
      const r = await creerEvenement(champs);
      b.disabled = false;
      m.querySelector('#ev-etat').textContent = '';
      if (!r.ok) {
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : rien n’a été créé.'
          : `Non créé — ${r.motif}`, 'err');
        return;
      }
      closeModal();
      toast('Rendez-vous créé — il apparaîtra ici au prochain relevé');
      apres?.();
    };
  } });
}

export const rgdAgendaPage = {
  title: () => 'RGD Renova — Agenda',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // L'échelle et le jour choisis sont une préférence d'écran, pas une donnée :
    // localStorage, comme l'original (`rgd_agenda_view` / `rgd_agenda_day`).
    const state = {
      vue: localStorage.getItem('crm_rgd_agenda_vue') || 'jour',
      jour: isoDay(),
      mois: isoDay().slice(0, 7),
      ecriture: false,
    };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

    const draw = () => {
      const aujourdhui = isoDay();
      const tous = scope.rgd('agenda_events').filter(e => e.activity === KEY);

      // La fenêtre RÉELLEMENT relevée. Sans ces bornes, naviguer hors d'elle
      // montrerait un agenda vide qu'on lirait comme un agenda libre.
      const jours = tous.map(e => e.day).filter(Boolean).sort();
      const min = jours[0] || aujourdhui;
      const max = jours[jours.length - 1] || aujourdhui;
      if (state.jour < min) state.jour = min;
      if (state.jour > max) state.jour = max;

      const parJour = new Map();
      for (const e of tous) {
        if (!parJour.has(e.day)) parJour.set(e.day, []);
        parJour.get(e.day).push(e);
      }
      const calendriers = [...new Set(tous.map(e => e.calendar_id).filter(Boolean))].sort();
      const vu = tous.map(e => e.synced_at).filter(Boolean)
        .reduce((m, s) => Math.max(m, new Date(s).getTime()), 0);

      const affiches = state.vue === 'jour'
        ? [state.jour]
        : Array.from({ length: 7 }, (_, i) => decale(lundiDe(state.jour), i));
      const pas = state.vue === 'jour' ? 1 : 7;
      const precedent = decale(state.jour, -pas);
      const suivant = decale(state.jour, pas);

      // Les prochains rendez-vous, toutes dates confondues : c'est ce qu'on
      // vient chercher quand on ouvre un agenda sans savoir quel jour regarder.
      const maintenant = Date.now();
      const prochains = tous
        .filter(e => e.all_day ? e.day >= aujourdhui : new Date(e.starts_at).getTime() >= maintenant)
        .sort((a, b) => String(a.day).localeCompare(String(b.day))
          || (a.all_day === b.all_day ? new Date(a.starts_at) - new Date(b.starts_at) : a.all_day ? -1 : 1))
        .slice(0, 6);

      const titre = majuscule(state.vue === 'jour'
        ? jourLong(state.jour)
        : `semaine du ${jourLong(lundiDe(state.jour))}`);

      const corps = `
        <div class="ag-hub">
          <aside class="ag-cote">
            ${miniCalendrier(state.mois, state.jour, parJour, min, max)}

            <section class="card ag-prochains">
              <div class="card-head"><h2>Prochains rendez-vous</h2></div>
              ${prochains.length ? prochains.map(e => `
                <a class="ag-prochain" ${e.link ? `href="${esc(e.link)}" target="_blank" rel="noopener"` : ''}
                   style="--ag-teinte:${teinteDe(calendriers, e.calendar_id)}">
                  <span class="ag-prochain-q">${esc(relDay(e.day))}</span>
                  <b>${esc(e.title || '(sans titre)')}</b>
                  <span class="muted s">${e.all_day ? 'journée entière' : esc(hhmm(e.starts_at))}${
                    e.location ? ' · ' + esc(e.location) : ''}</span>
                </a>`).join('') : '<div class="empty">Aucun rendez-vous à venir dans la fenêtre relevée.</div>'}
            </section>

            <p class="small muted ag-fenetre">
              Relevé du <b>${esc(jourLong(min))}</b> au <b>${esc(jourLong(max))}</b>${
                vu ? `, ${esc(depuis(new Date(vu)))}` : ''}.
              Au-delà, l’écran ne sait rien : ce n’est pas un agenda vide, c’est la fin de
              la fenêtre. La journée en cours est relevée toutes les 30 minutes, les jours
              suivants une fois par jour — <b>un rendez-vous pris aujourd’hui pour plus tard
              n’apparaît que demain</b>.
              ${calendriers.length ? `<br>Agendas lus : ${esc(calendriers.join(' · '))}.` : ''}
            </p>
          </aside>

          <section class="ag-principal">
            <div class="ag-barre">
              <div class="pill-tabs">
                <button type="button" data-vue="jour" class="${state.vue === 'jour' ? 'on' : ''}">Jour</button>
                <button type="button" data-vue="semaine" class="${state.vue === 'semaine' ? 'on' : ''}">Semaine</button>
              </div>
              <button type="button" class="icon-btn" data-aller="${precedent}"
                ${precedent >= min ? '' : 'disabled'} title="Précédent">‹</button>
              <b class="ag-titre">${esc(titre)}</b>
              <button type="button" class="icon-btn" data-aller="${suivant}"
                ${suivant <= max ? '' : 'disabled'} title="Suivant">›</button>
              ${state.jour !== aujourdhui ? `<button type="button" class="btn ghost sm" data-aller="${aujourdhui}">Aujourd’hui</button>` : ''}
              <span class="grow"></span>
              ${state.ecriture ? '<button type="button" class="btn primary" id="ag-nouveau">+ Événement</button>' : ''}
            </div>

            <section class="card ag-cadre">
              ${affiches.some(j => (parJour.get(j) || []).length)
                ? grille(affiches, parJour, calendriers)
                : `<div class="empty"><b>Aucun rendez-vous</b><br>${
                    state.vue === 'jour' ? 'Journée libre' : 'Semaine libre'} dans le relevé.</div>`}
            </section>
          </section>
        </div>`;

      root.innerHTML = cadre('#/rgd/agenda', 'Agenda', corps);

      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        state.vue = b.dataset.vue;
        localStorage.setItem('crm_rgd_agenda_vue', state.vue);
        draw();
      });
      root.querySelectorAll('[data-aller]').forEach(b => b.onclick = () => {
        state.jour = b.dataset.aller;
        state.mois = state.jour.slice(0, 7);
        draw();
      });
      root.querySelectorAll('[data-jour]').forEach(b => b.onclick = () => {
        state.jour = b.dataset.jour;
        draw();
      });
      root.querySelectorAll('[data-mois]').forEach(b => b.onclick = () => {
        state.mois = b.dataset.mois;
        draw();
      });
      const nouveau = root.querySelector('#ag-nouveau');
      if (nouveau) nouveau.onclick = () => formulaireEvenement(state.jour, draw);
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
