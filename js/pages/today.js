// « To do list » : chacun la sienne.
//
// Deux onglets. « Ma to do list » ne montre que les taches dont je suis
// responsable — plus de colonnes par personne, plus de coup d'oeil sur le
// travail des autres, direction comprise. « Envoyees » montre celles que j'ai
// ecrites pour quelqu'un d'autre, avec leur etat : c'est ce qui permet de
// confier une tache sans la perdre de vue.
//
// Le cloisonnement n'est pas qu'un filtre d'affichage : les policies RLS de la
// table `activities` disent la meme chose (migration 20260918100000). Une tache
// rattachee a une affaire ou a une fiche reste visible par qui voit la fiche —
// sinon la « prochaine action » des pipelines se viderait. Ce qui devient prive,
// c'est le pense-bete rattache a rien.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { STRUCTURES_TACHE } from '../data/schema.js';
import { esc, daysSince, fmtDate, relDay, userName, searchInput, bindSearch, restoreFocus, terms, hit } from '../ui.js';
import { actType, bindActivityRows, activityForm, nextActivity, structureDe,
         toggleActivity, structuresDeLUtilisateur } from './activity.js';
import { kanbanHtml, dossiersDe, carteDossier } from './todo-kanban.js';
import { openDeal } from './deal.js';

// Les trois rangs de la liste, dans l'ordre où ils se lisent. Ils reprennent les
// degrés de traitement de schema.js : ce qu'on pose à la main et ce que l'échéance
// impose tombent dans le même rang. `test` reçoit la tâche et l'écart en jours —
// positif = en retard, 0 = aujourd'hui, négatif = à venir. L'échéance exacte reste
// lisible sur chaque carte : ce sont les en-têtes qui se simplifient, pas les dates.
const GROUPES = [
  { key: 'urgent', titre: '🔥 Urgent', test: (a) => a.priority === 'urgent' },
  // Une tâche est en retard parce qu'on l'a dit, OU parce que sa date est passée.
  { key: 'retard', titre: '⚠ Retard', test: (a, j) => a.priority === 'retard' || (j !== null && j > 0) },
  { key: 'afaire', titre: 'À faire', test: () => true },
];
const ecart = (a) => (a.due_date ? daysSince(a.due_date) : null);
// Une tâche ne figure que dans le premier rang qui la prend : urgente et en retard,
// elle est urgente — et sa date reste affichée en rouge.
const rangDe = (a) => GROUPES.find(gr => gr.test(a, ecart(a)));

// Une tâche qu'on vient de cocher ne s'efface pas sous les doigts : elle reste en
// place, barrée, le temps de la relire et de se raviser. Passé ce délai elle rejoint
// « Fait aujourd'hui », que la case de la barre d'outils affiche.
// ⚠ ET PENDANT CE DÉLAI, LA LIGNE DIT CE QUI VA LUI ARRIVER. Sans ça, une
// tâche cochée par un clic de trop disparaissait quinze secondes plus tard,
// sans un mot, vers un rang que la barre d'outils masque par défaut : vue de
// l'utilisateur, elle s'effaçait toute seule. La ligne porte donc « Annuler »
// tant qu'elle est là.
const GRACE_MS = 15000;
const recentes = new Map(); // id de la tâche -> minuteur de disparition

// Le logo de la structure sur fond de sa couleur : si le fichier manque, l'image se
// retire et il reste la pastille de couleur — le repli qu'utilise déjà le menu.
const logo = (a, cls = 'todo-logo') => `<i class="${cls}" style="background:${a.color}"><img src="assets/logos/${a.key}.png" alt="" onerror="this.remove()"></i>`;


// Une tâche en ligne. Le titre à gauche, puis structure, contexte, destinataire
// et échéance dans des colonnes de largeur fixe : d'une ligne à l'autre elles
// tombent au même endroit, et l'oeil descend la colonne des échéances sans avoir
// à relire chaque tâche. Le contenu est le même qu'avant, c'est le contenant qui
// disparaît — plus de carte, plus de fond, plus de remplissage.
//
// `.todo-meta` regroupe les colonnes de droite pour le seul besoin du téléphone,
// où elles passent ensemble à la ligne ; sur grand écran elle s'efface
// (display: contents) et ses enfants sont des colonnes de la ligne.
//
// La classe .todo-tache est conservée : c'est elle que draw() et
// bindActivityRows cherchent pour brancher les cases et le crayon.
function carte(a, pour = false) {
  const j = ecart(a);
  const t = actType(a.type);
  const s = structureDe(a);
  // ⚠ `STRUCTURES_TACHE` ET PAS `ACTIVITIES` : une tâche de gestion locative
  // porte une structure qui n'est pas une activité, et `ACTIVITIES[s]` aurait
  // rendu `undefined` — la ligne perdait sa couleur et son nom de structure.
  const act = s ? STRUCTURES_TACHE[s] : null;
  const d = a.deal_id && db.byId('deals', a.deal_id);
  const c = a.contact_id && db.byId('contacts', a.contact_id);
  const o = a.organisation_id && db.byId('organisations', a.organisation_id);
  const ctx = [
    d && `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`,
    !d && c && esc(`${c.first_name || ''} ${c.last_name || ''}`.trim()),
    !d && !c && o && esc(o.name),
  ].filter(Boolean)[0] || '';

  // L'échéance se lit à sa couleur avant de se lire au texte : rouge en retard,
  // ambre aujourd'hui, neutre au-delà.
  const quand = a.due_date
    ? `<span class="todo-quand ${!a.done && j > 0 ? 'late' : ''} ${!a.done && j === 0 ? 'today' : ''}">${
        j === 0 ? "Aujourd'hui" : esc(relDay(a.due_date))}${a.due_time ? ' · ' + esc(a.due_time) : ''}</span>`
    : '<span class="todo-quand vide">—</span>';

  return `<div class="todo-tache ${a.done ? 'done' : ''} ${recentes.has(a.id) ? 'recente' : ''} ${a.priority === 'urgent' && !a.done ? 'urgent' : ''}" ${act ? `style="--c:${act.color};--b:${act.accent};--bt:${act.on}"` : ''}>
    <label class="todo-case" title="${a.done ? 'Rouvrir' : 'Marquer comme fait'}">
      <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${a.id}"><span></span></label>
    <b class="todo-t">${t.icon} ${esc(a.title)}</b>
    <div class="todo-meta">
      <span class="todo-struct">${act ? `<span class="todo-badge">${logo(act, 'todo-badge-logo')}${esc(act.short)}</span>` : ''}</span>
      <span class="todo-ctx">${ctx}</span>
      ${pour ? `<span class="todo-pour"><i>→</i>${esc(userName(a.assignee_id))}${a.done ? ' · faite' : ''}</span>` : ''}
      ${quand}
    </div>
    ${recentes.has(a.id) ? `<button type="button" class="todo-annuler" data-annuler="${a.id}"
      title="Décocher : la tâche revient dans la liste">↩ Annuler</button>` : ''}
    <button class="icon-btn todo-editer" data-edit-act="${a.id}" title="Modifier">✎</button>
  </div>`;
}

// Les deux onglets, et ce que chacun retient.
// Une tache que j'ai ecrite sans l'assigner reste chez moi : personne d'autre ne
// l'a prise, ce n'est pas une tache « envoyee ».
const ONGLETS = [
  { key: 'mienne', label: 'Ma to do list',
    garde: (a, moi) => a.assignee_id === moi || (!a.assignee_id && a.created_by === moi) },
  { key: 'envoyees', label: 'Envoyées',
    garde: (a, moi) => a.created_by === moi && !!a.assignee_id && a.assignee_id !== moi },
];

// ⚠ POUR LA DIRECTION, LE TABLEAU REMPLACE « Ma to do list » — demandé ainsi le
// 01/10/2026, pas ajouté à côté. Les autres gardent la liste : une seule
// colonne n'est pas un tableau.
//
// ⚠ ET IL NE MONTRE QUE MES TÂCHES, EXACTEMENT COMME LA LISTE QU'IL REMPLACE.
// La première version portait `garde: () => true` : le tableau affichait alors
// tout ce que la direction a le droit de voir, c'est-à-dire les tâches des
// chargés d'affaires rattachées à un dossier. C'était enfreindre la règle
// écrite en tête de ce fichier — « chacun la sienne », direction comprise —
// et rappelée par Élodie le jour même. **Le garde est donc le MÊME que celui de
// « Ma to do list »**, au mot près : ce qui change, c'est la mise en page, pas
// ce qui entre.
const ONGLET_KANBAN = { key: 'structures', label: 'Mes tâches par structure',
  garde: (a, moi) => ONGLETS[0].garde(a, moi) };
const ongletsDe = (direction) => (direction ? [ONGLET_KANBAN, ONGLETS[1]] : ONGLETS);

export const todayPage = {
  title: () => 'To do list',
  render(root) {
    // Le tableau par structures n'a de sens qu'avec plusieurs structures : la
    // direction les porte toutes, un chargé d'affaires souvent une seule.
    const enTableau = scope.isDirection;
    const onglets = ongletsDe(enTableau);
    const state = { onglet: onglets[0].key, structure: '', q: '', showDone: false, focus: null };
    const moi = scope.user.id;

    const draw = () => {
      const onglet = onglets.find(o => o.key === state.onglet) || onglets[0];
      const surTableau = onglet.key === 'structures';
      const ts = terms(state.q);
      // ⚠ « — » RAMASSE TOUT CE QU'AUCUNE PASTILLE NE PORTE, pas seulement les
      // tâches sans structure du tout : une tâche rangée dans une structure que
      // celui qui regarde ne porte pas — un module dont il n'a pas le droit, une
      // structure qui n'est pas la sienne — n'était comptée nulle part, et la
      // somme des pastilles ne faisait pas le total. Même règle que la colonne
      // « Sans structure » du tableau.
      const miennes = new Set(structuresDeLUtilisateur().map(x => x.key));
      const rangeeAilleurs = (a) => !miennes.has(structureDe(a));
      const surStructure = (a) => !state.structure
        || (state.structure === '—' ? rangeeAilleurs(a) : structureDe(a) === state.structure);

      // Le compteur de chaque onglet se lit avant tout filtre : il dit ce qu'il y a
      // derriere, pas ce qui reste une fois la recherche tapee.
      const toutes = scope.activities();
      const compte = (o) => toutes.filter(a => !a.done && o.garde(a, moi)).length;

      const vues = toutes.filter(a => onglet.garde(a, moi))
        .filter(a => hit([a.title, a.notes, userName(a.assignee_id)], ts));
      const ouvertes = vues.filter(a => !a.done);

      // Les pastilles de structure ignorent le filtre de structure : sinon il ne
      // resterait plus rien à comparer une fois l'une d'elles ouverte.
      // Mêmes structures que les colonnes du tableau : la liste est écrite une
      // seule fois, dans `activity.js`.
      const parStructure = structuresDeLUtilisateur()
        .map(a => ({ ...a, n: ouvertes.filter(t => structureDe(t) === a.key).length }));
      const sansStructure = ouvertes.filter(rangeeAilleurs).length;

      // Les fraîchement cochées restent à leur place au lieu de disparaître aussitôt.
      const retenues = vues.filter(a => !a.done || recentes.has(a.id)).filter(surStructure);
      // ⚠ LE COMPTE SE FAIT MÊME QUAND LA CASE EST DÉCOCHÉE : c'est lui qui dit
      // où est passée une tâche qu'on vient de cocher. Sans ce chiffre, la
      // seule trace d'une tâche disparue était son absence.
      const faitesDuJour = vues.filter(a => a.done && a.done_at && daysSince(a.done_at) === 0).filter(surStructure);
      const faitesAujourdhui = faitesDuJour.length;
      const faites = state.showDone ? faitesDuJour : [];

      const tri = (l) => l.slice().sort((x, y) => (x.due_date || '9999').localeCompare(y.due_date || '9999')
        || (x.due_time || '99').localeCompare(y.due_time || '99'));
      const pour = onglet.key === 'envoyees';
      const groupes = GROUPES.map(gr => ({ ...gr, l: retenues.filter(a => rangDe(a) === gr) })).filter(gr => gr.l.length);

      // ⚠ LES DOSSIERS EN ATTENTE SONT AUSSI DANS LA LISTE, et pas seulement dans
      // le tableau de la direction. La demande du 06/10/2026 disait « colonne »,
      // mais ce sont les CHARGÉS D'AFFAIRES qui écrivent les devis et les missions,
      // et eux n'ont pas le tableau : ne les mettre que là aurait livré la
      // fonction à tout le monde sauf à ceux qui en ont l'usage. Même source,
      // même carte, même filtre de structure — seule la mise en page change.
      // ⚠ L'ONGLET « Envoyées » N'EN PORTE PAS : il montre ce qu'on a confié à
      // quelqu'un d'autre, et un dossier n'est confié à personne.
      const dossiers = (surTableau || onglet.key !== 'mienne' || state.structure === '—')
        ? []
        : structuresDeLUtilisateur()
            .filter(a => !state.structure || state.structure === a.key)
            .flatMap(a => dossiersDe(a.key));

      const sansProchaine = onglet.key === 'mienne'
        ? scope.deals().filter(d => d.status === 'open' && d.owner_id === moi && !nextActivity(d.id)
            && (!state.structure || state.structure === '—' || d.activity === state.structure))
        : [];

      root.innerHTML = `
        <div class="todo-page">
        <div class="pill-tabs todo-onglets">
          ${onglets.map(o => `<button type="button" data-onglet="${o.key}" class="${state.onglet === o.key ? 'on' : ''}">${esc(o.label)}<span>${compte(o)}</span></button>`).join('')}
        </div>

        <div class="pill-tabs todo-structures" ${surTableau ? 'hidden' : ''}>
          <button type="button" data-struct="" class="${state.structure ? '' : 'on'}">Toutes<span>${ouvertes.length}</span></button>
          ${parStructure.map(a => `<button type="button" data-struct="${a.key}" class="${state.structure === a.key ? 'on' : ''}">${logo(a)}${esc(a.label)}<span>${a.n}</span></button>`).join('')}
          ${sansStructure ? `<button type="button" data-struct="—" class="${state.structure === '—' ? 'on' : ''}">Sans structure<span>${sansStructure}</span></button>` : ''}
        </div>

        <div class="toolbar">
          ${searchInput('t-q', state, 'Rechercher une tâche…')}
          <span class="muted small">${retenues.filter(a => ecart(a) > 0 && !a.done).length} en retard · ${retenues.filter(a => ecart(a) === 0 && !a.done).length} aujourd&rsquo;hui</span>
          <span class="grow"></span>
          <label class="check"><input type="checkbox" id="t-done" ${state.showDone ? 'checked' : ''}> Ce qui est fait${
            faitesAujourdhui ? ` <b>(${faitesAujourdhui})</b>` : ''}</label>
          <button class="btn ghost" id="t-new">+ Tâche</button>
          <button class="btn" id="t-send">Envoyer une tâche</button>
        </div>

        ${sansProchaine.length ? `<div class="alert"><b>${sansProchaine.length}</b><div><b>affaire${sansProchaine.length > 1 ? 's' : ''} sans prochaine action</b> — ${sansProchaine.slice(0, 6).map(d => `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`).join(', ')}${sansProchaine.length > 6 ? '…' : ''}</div></div>` : ''}

        ${surTableau
          ? kanbanHtml([...retenues, ...faites], recentes)
          : `<section class="card todo-liste">
          ${dossiers.length ? `<div class="todo-groupe dossiers">Dossiers en attente<i>${dossiers.length}</i></div>
            <div class="todo-dossiers">${dossiers.map(carteDossier).join('')}</div>` : ''}
          ${groupes.map(gr => `<div class="todo-groupe ${gr.key}">${gr.titre}<i>${gr.l.filter(a => !a.done).length}</i></div>${tri(gr.l).map(a => carte(a, pour)).join('')}`).join('')}
          ${faites.length ? `<div class="todo-groupe fait">Fait aujourd&rsquo;hui<i>${faites.length}</i></div>${tri(faites).map(a => carte(a, pour)).join('')}` : ''}
          ${!retenues.length && !faites.length && !dossiers.length ? `<div class="empty">${onglet.key === 'mienne'
            ? 'Rien à faire — tout est à jour.'
            : 'Aucune tâche envoyée. Le bouton « Envoyer une tâche » sert à en confier une.'}</div>` : ''}
        </section>`}
        </div>`;

      bindSearch(root, 't-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => {
        state.onglet = b.dataset.onglet; state.structure = ''; draw();
      });
      root.querySelectorAll('[data-struct]').forEach(b => b.onclick = () => {
        state.structure = state.structure === b.dataset.struct ? '' : b.dataset.struct; draw();
      });
      root.querySelector('#t-done').onchange = e => { state.showDone = e.target.checked; draw(); };
      // Décocher depuis la ligne : le même chemin que la case, pour que
      // l'annulation et la coche ne puissent pas diverger.
      root.querySelectorAll('[data-annuler]').forEach(b => b.onclick = () => {
        const cb = root.querySelector(`.todo-tache input[data-toggle="${b.dataset.annuler}"]`);
        if (!cb) return;
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
      });
      // Une tâche créée ici hérite de ce qui est à l'écran : la structure ouverte,
      // et le responsable — moi dans ma liste, à choisir dans « Envoyées ».
      const structureOuverte = () => (state.structure && state.structure !== '—' ? { activity: state.structure } : {});
      // « + Tâche » : pour moi. « Envoyer une tâche » : pour quelqu'un d'autre —
      // le responsable est laissé vide, c'est le choix qu'on vient faire, et on
      // bascule sur l'onglet « Envoyées » pour voir le résultat.
      root.querySelector('#t-new').onclick = () => activityForm({ assignee_id: moi, ...structureOuverte() }, null, draw);
      root.querySelector('#t-send').onclick = () => activityForm({ assignee_id: '', ...structureOuverte() }, null, () => {
        state.onglet = 'envoyees'; draw();
      });
      root.querySelectorAll('[data-open-deal]').forEach(a => a.onclick = e => { e.preventDefault(); openDeal(a.dataset.openDeal, draw); });
      // ⚠ UNE CARTE S'OUVRE EN ENTIER, pas seulement par un crayon : sur un
      // tableau on clique la carte. La case à cocher et ses boutons gardent
      // leur geste — un clic dessus ne doit pas ouvrir le formulaire.
      root.querySelectorAll('.kb-carte[data-tache]').forEach(el => {
        const ouvrir = () => {
          const a = db.byId('activities', el.dataset.tache);
          if (a) activityForm({}, a, draw);
        };
        el.onclick = (e) => { if (e.target.closest('label, input, button, a')) return; ouvrir(); };
        el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } };
      });
      // ⚠ UNE CARTE DE DOSSIER OUVRE LA FICHE, PAS UN FORMULAIRE DE TÂCHE : ce
      // n'est pas une tâche, elle ne vit dans aucune table de tâches, et il n'y a
      // rien à y cocher. On arrive d'ici pour écrire le devis ou la mission, donc
      // on veut la fiche.
      // ⚠ IMPORT PARESSEUX de l'écran Clients : les écrans de fiche importent
      // `activity.js`, les charger en tête ferait un cycle — même raison que dans
      // `activity.js` lui-même.
      root.querySelectorAll('.kb-dossier[data-dossier]').forEach(el => {
        const ouvrir = async () => {
          const { dossier: genre, dossierId } = el.dataset;
          if (genre === 'deal') { openDeal(dossierId, draw); return; }
          const table = genre === 'demande' ? 'rgd_demandes' : 'rgd_clients';
          const ligne = db.byId(table, dossierId);
          if (!ligne) { draw(); return; }
          const { ouvrirProspectRgd } = await import('./rgd-clients.js');
          ouvrirProspectRgd(ligne, genre, draw);
        };
        el.onclick = ouvrir;
        el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } };
      });
      // Le « + » d'une colonne crée dans SA structure : c'est tout l'intérêt
      // d'avoir une colonne par structure.
      root.querySelectorAll('[data-col-neuve]').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const k = b.dataset.colNeuve;
        activityForm({ assignee_id: moi, ...(k ? { activity: k } : {}) }, null, draw);
      });
      bindActivityRows(root, draw);
      // Posé après bindActivityRows, qui pose son propre gestionnaire sur ces cases.
      // Décocher pendant le délai annule la disparition ; recocher le relance.
      root.querySelectorAll('.todo-tache input[data-toggle], .kb-carte input[data-toggle]').forEach(cb => cb.onchange = async () => {
        const id = cb.dataset.toggle;
        clearTimeout(recentes.get(id));
        recentes.delete(id);
        try { await toggleActivity(id, cb.checked); }
        catch { draw(); return; }
        if (cb.checked) recentes.set(id, setTimeout(() => { recentes.delete(id); draw(); }, GRACE_MS));
        draw();
      });
    };

    draw();
    return {
      refresh: draw,
      // Quitter l'écran emporte les minuteurs avec lui, sinon ils redessineraient
      // une page qui n'est plus là.
      destroy() { recentes.forEach(clearTimeout); recentes.clear(); },
    };
  },
};
