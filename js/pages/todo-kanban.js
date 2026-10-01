// To do list — la vue en colonnes de la direction
//
// Demandé par Élodie le 01/10/2026, image à l'appui : « chaque colonne
// représente une structure et comme ça la personne a un visuel sur tous les
// éléments de toutes les structures ». Pour la direction, cette vue REMPLACE
// « Ma to do list » — c'est son choix explicite.
//
// ⚠ CE QU'ELLE MONTRE, ET CE QU'ELLE NE PEUT PAS MONTRER. Les policies RLS de
// `activities` cloisonnent volontairement : une tâche rattachée à une affaire,
// un contact ou une organisation est visible de qui voit le dossier — donc de
// la direction. Un pense-bête personnel rattaché à RIEN reste privé, direction
// comprise (migration 20260918100000, et l'en-tête de `today.js` le dit). Cette
// vue montre donc tout le travail des dossiers, pas les notes intimes de
// chacun. L'écran l'écrit sous les colonnes plutôt que de laisser croire à un
// panorama complet.
//
// ⚠ UNE COLONNE PAR STRUCTURE, ET UNE DE PLUS. « Sans structure » n'est pas un
// repli technique : une tâche qui n'appartient à aucune activité est une tâche
// qu'on a oublié de ranger, et la voir est précisément l'intérêt du tableau.
// Elle ne s'affiche que si elle porte quelque chose.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES } from '../data/schema.js';
import { esc, daysSince, relDay, userName } from '../ui.js';
import { actType, structureDe } from './activity.js';

const ecart = (a) => (a.due_date ? daysSince(a.due_date) : null);

// Les initiales d'une personne : un rond coloré vaut mieux qu'un nom tronqué
// dans une carte large de deux cent cinquante pixels.
const initiales = (id) => {
  const n = userName(id) || '';
  const m = n.trim().split(/\s+/);
  return ((m[0]?.[0] || '') + (m[1]?.[0] || '')).toUpperCase() || '?';
};

// ⚠ LA COULEUR D'UN ROND VIENT DU NOM, PAS DU HASARD : la même personne garde
// la même teinte d'une colonne à l'autre et d'un jour à l'autre. Un hasard
// recalculé à chaque rendu ferait clignoter le tableau.
const TEINTES = ['#4f46c8', '#0e7c66', '#b3261e', '#9a6412', '#6d28d9', '#0369a1', '#be185d'];
const teinteDe = (id) => {
  const s = String(id || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return TEINTES[n % TEINTES.length];
};

// Une carte. Elle dit, dans cet ordre : ce qu'il faut faire, pour quel dossier,
// quand, et par qui. L'échéance porte sa couleur avant son texte.
// ⚠ `recentes` VIENT DE L'APPELANT : c'est `today.js` qui tient les minuteurs
// des quinze secondes, et une seconde copie ici aurait fait disparaitre les
// cartes a un autre moment que les lignes. On ne le recalcule pas, on le lit.
function carte(a, recentes) {
  const j = ecart(a);
  const t = actType(a.type);
  const d = a.deal_id && db.byId('deals', a.deal_id);
  const c = a.contact_id && db.byId('contacts', a.contact_id);
  const o = a.organisation_id && db.byId('organisations', a.organisation_id);
  const ctx = d ? d.title
    : c ? `${c.first_name || ''} ${c.last_name || ''}`.trim()
    : o ? o.name : '';
  const sousTaches = Array.isArray(a.checklist) ? a.checklist : [];
  const faites = sousTaches.filter(x => x && x.f).length;

  return `<article class="kb-carte ${a.done ? 'est-faite' : ''} ${!a.done && a.priority === 'urgent' ? 'est-urgente' : ''}"
    data-tache="${esc(a.id)}" tabindex="0">
    <label class="kb-case" title="${a.done ? 'Rouvrir' : 'Marquer comme fait'}">
      <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${esc(a.id)}"><span></span></label>
    <div class="kb-corps">
      <p class="kb-titre">${t.icon} ${esc(a.title)}</p>
      ${recentes && recentes.has(a.id) ? `<button type="button" class="todo-annuler kb-annuler"
        data-annuler="${esc(a.id)}" title="Décocher : la tâche revient">↩ Annuler</button>` : ''}
      ${ctx ? `<p class="kb-ctx">${esc(ctx)}</p>` : ''}
      ${sousTaches.length ? `<p class="kb-checklist ${faites === sousTaches.length ? 'est-complete' : ''}">
        ☑ ${faites}/${sousTaches.length}</p>` : ''}
      <div class="kb-pied">
        ${a.priority === 'urgent' ? '<span class="kb-etiq urgent">Urgent</span>' : ''}
        ${a.priority === 'retard' ? '<span class="kb-etiq retard">En retard</span>' : ''}
        <span class="kb-quand ${!a.done && j > 0 ? 'est-tard' : ''} ${!a.done && j === 0 ? 'est-aujourdhui' : ''}">${
          a.due_date ? (j === 0 ? "Aujourd’hui" : esc(relDay(a.due_date))) : '—'}${
          a.due_time ? ' · ' + esc(a.due_time) : ''}</span>
        <span class="grow"></span>
        <span class="kb-qui" style="background:${teinteDe(a.assignee_id)}"
          title="${esc(userName(a.assignee_id) || 'Sans responsable')}">${esc(initiales(a.assignee_id))}</span>
      </div>
    </div>
  </article>`;
}

/**
 * Le tableau entier. Rend le HTML ; le branchement est fait par l'appelant,
 * qui tient déjà les gestionnaires de coche et de modification.
 *
 * `taches` est déjà filtré (recherche, « ce qui est fait ») par l'appelant :
 * cette fonction range, elle ne décide pas de ce qui entre.
 */
export function kanbanHtml(taches, recentes) {
  const colonnes = Object.values(ACTIVITIES)
    .filter(a => scope.activityKeys.includes(a.key))
    .map(a => ({ cle: a.key, nom: a.label, court: a.short, couleur: a.color, encre: a.accent,
                 l: taches.filter(t => structureDe(t) === a.key) }));
  const orphelines = taches.filter(t => !structureDe(t));
  if (orphelines.length) {
    colonnes.push({ cle: '', nom: 'Sans structure', court: '—', couleur: '#8a8fa3', encre: '#5b6070', l: orphelines });
  }

  const tri = (l) => l.slice().sort((x, y) => {
    // L'urgent remonte, puis le retard, puis l'échéance. Une colonne se lit du
    // haut : ce qui brûle doit y être.
    const poids = (a) => (a.done ? 3 : a.priority === 'urgent' ? 0 : (ecart(a) ?? -1) > 0 ? 1 : 2);
    return poids(x) - poids(y)
      || (x.due_date || '9999').localeCompare(y.due_date || '9999')
      || (x.due_time || '99').localeCompare(y.due_time || '99');
  });

  return `<div class="kb-plateau">
    ${colonnes.map(c => {
      const ouvertes = c.l.filter(t => !t.done);
      const tard = ouvertes.filter(t => ecart(t) > 0).length;
      return `<section class="kb-col" data-col="${esc(c.cle)}" style="--c:${c.couleur};--ci:${c.encre}">
        <header class="kb-tete">
          <div class="kb-tete-haut">
            <h3>${esc(c.nom)}</h3>
            <button type="button" class="kb-plus" data-col-neuve="${esc(c.cle)}"
              title="Nouvelle tâche dans ${esc(c.nom)}">+</button>
          </div>
          <p class="kb-compte">${ouvertes.length} tâche${ouvertes.length > 1 ? 's' : ''}${
            tard ? ` · <b class="est-tard">${tard} en retard</b>` : ''}</p>
        </header>
        <div class="kb-pile">
          ${tri(c.l).map(t => carte(t, recentes)).join('')
            || '<p class="kb-vide">Rien ici.</p>'}
        </div>
      </section>`;
    }).join('')}
  </div>
  <p class="kb-note muted small">Les tâches rattachées à un dossier — affaire, client, entreprise —
    sont visibles ici. Les pense-bêtes personnels rattachés à rien restent privés,
    y compris pour la direction : c'est la règle posée en base, pas un filtre d'affichage.</p>`;
}
