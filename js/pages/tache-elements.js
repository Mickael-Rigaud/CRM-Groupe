// Ce qu'on ajoute à une tâche : sous-tâches, pièces jointes, commentaires
//
// Demandé par Élodie le 01/10/2026 : « je voudrais aussi avoir la possibilité
// de modifier la tâche en question en y ajoutant des éléments » — précisé
// ensuite en trois choses, et ce sont ces trois-là.
//
// ⚠ DEUX DES TROIS AVAIENT DÉJÀ LEUR MAISON, et on ne leur en a pas construit
// une nouvelle : les commentaires sont des `events` (comme sur une affaire ou
// une fiche), les pièces jointes des `documents` avec
// `entity_type = 'activities'`. Seules les sous-tâches sont neuves, dans une
// colonne `jsonb` de la tâche — elles n'ont aucune vie propre.
//
// ⚠ LES TROIS N'ONT PAS LE MÊME MOMENT D'ÉCRITURE, et c'est voulu :
//   — la checklist part avec le formulaire, au clic sur « Enregistrer » : on
//     coche trois cases d'affilée, écrire à chaque clic ferait trois appels ;
//   — un commentaire et une pièce jointe partent TOUT DE SUITE. Ce sont des
//     ajouts, pas des corrections : les perdre sur un « Annuler » serait
//     absurde, et un fil de discussion qu'il faut enregistrer n'en est pas un.
//
// ⚠ AUCUN `confirm()` DE `ui.js` ICI. Il appelle `closeModal(true)` et REMPLACE
// la fenêtre courante : le formulaire de la tâche disparaîtrait avec la saisie
// en cours. C'est la raison pour laquelle `documentsSection()` de
// `documents.js` n'est pas réutilisé tel quel — il supprime derrière ce
// `confirm()`. Neuvième occurrence du piège dans ce dépôt.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, toast, userName, fmtDateTime } from '../ui.js';
import { docsOf } from '../documents.js';

const ENTITE = 'activities';
const MAX_MO = 25;

// ---------------------------------------------------------------- la checklist
// ⚠ ELLE VIT DANS L'ÉTAT, PAS DANS LE DOM : le bloc est redessiné à chaque
// coche et à chaque ajout, et ce qui n'est lu qu'au moment d'enregistrer serait
// perdu entre-temps.
export function checklistDe(a) {
  const l = Array.isArray(a?.checklist) ? a.checklist : [];
  return l.filter(x => x && typeof x === 'object').map(x => ({ t: String(x.t || ''), f: x.f === true }));
}

const htmlChecklist = (liste) => {
  const faites = liste.filter(x => x.f).length;
  return `<div class="tel-bloc" data-bloc="checklist">
    <div class="tel-tete"><h4>Sous-tâches</h4>
      ${liste.length ? `<span class="tel-compte ${faites === liste.length ? 'est-complete' : ''}">${faites}/${liste.length}</span>` : ''}
    </div>
    ${liste.map((x, i) => `<label class="tel-sous ${x.f ? 'est-faite' : ''}">
      <input type="checkbox" data-sous="${i}" ${x.f ? 'checked' : ''}>
      <span>${esc(x.t)}</span>
      <button type="button" class="tel-x" data-sous-suppr="${i}" title="Retirer">✕</button>
    </label>`).join('')}
    <div class="tel-ajout">
      <input type="text" id="tel-sous-neuve" placeholder="Ajouter une sous-tâche…" maxlength="140">
      <button type="button" class="btn ghost sm" id="tel-sous-ajouter">Ajouter</button>
    </div>
    <p class="tel-aide">Elles n’ont ni échéance ni responsable : s’il en faut un, c’est une vraie tâche qu’il faut créer.</p>
  </div>`;
};

// ------------------------------------------------------------ les commentaires
const commentairesDe = (id) => db.t('events')
  .filter(e => e.activity_id === id)
  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

const htmlCommentaires = (id) => {
  const l = commentairesDe(id);
  return `<div class="tel-bloc" data-bloc="commentaires">
    <div class="tel-tete"><h4>Commentaires</h4>${l.length ? `<span class="tel-compte">${l.length}</span>` : ''}</div>
    <div class="tel-ajout">
      <input type="text" id="tel-com-neuf" placeholder="Noter un appel, un échange, une décision…" maxlength="500">
      <button type="button" class="btn ghost sm" id="tel-com-ajouter">Ajouter</button>
    </div>
    ${l.length ? `<ul class="tel-fil">${l.map(e => `<li>
      <span class="tel-fil-quand">${esc(fmtDateTime(e.created_at))} · ${esc(userName(e.author_id))}</span>
      <span class="tel-fil-texte">${esc(e.body || '')}</span>
    </li>`).join('')}</ul>` : '<p class="tel-aide">Rien de noté pour l’instant.</p>'}
  </div>`;
};

// ------------------------------------------------------------ les pièces jointes
// ⚠ `docsOf` LIT LE CACHE, elle ne va pas sur le réseau : la liste est donc
// juste après un dépôt sans qu'on ait à la recharger. C'est `db.insert` qui a
// déjà posé la ligne.
const htmlPieces = (liste, occupe) => `<div class="tel-bloc" data-bloc="pieces">
  <div class="tel-tete"><h4>Pièces jointes</h4>${liste.length ? `<span class="tel-compte">${liste.length}</span>` : ''}</div>
  ${liste.length ? `<ul class="tel-pieces">${liste.map(d => `<li>
    <a href="#" data-piece="${esc(d.id)}">${esc(d.name)}</a>
    <span class="tel-aide">${d.size ? Math.max(1, Math.round(d.size / 1024)) + ' Ko' : ''}</span>
  </li>`).join('')}</ul>` : ''}
  <label class="tel-depot ${occupe ? 'est-occupe' : ''}">
    <input type="file" id="tel-fichier" multiple hidden>
    <span>${occupe ? 'Envoi en cours…' : '+ Déposer un document'}</span>
  </label>
  <p class="tel-aide">Le document part tout de suite : il ne dépend pas du bouton « Enregistrer ».</p>
</div>`;

/**
 * Monte les trois blocs dans un hôte, et rend `{ checklist() }` — ce que le
 * formulaire devra enregistrer avec le reste.
 *
 * ⚠ IL N'Y A RIEN POUR UNE TÂCHE QUI N'EXISTE PAS ENCORE : une pièce jointe et
 * un commentaire ont besoin d'un identifiant auquel se rattacher. L'appelant
 * n'appelle donc ceci qu'en modification, et c'est dit à l'écran à la création.
 */
export function monterElements(hote, tache, { redessiner } = {}) {
  let liste = checklistDe(tache);
  let pieces = docsOf(ENTITE, tache.id);
  let occupe = false;

  const dessiner = () => {
    hote.innerHTML = htmlChecklist(liste) + htmlPieces(pieces, occupe) + htmlCommentaires(tache.id);
    brancher();
  };

  const brancher = () => {
    // -- sous-tâches
    hote.querySelectorAll('[data-sous]').forEach(cb => cb.onchange = () => {
      liste[Number(cb.dataset.sous)].f = cb.checked;
      dessiner();
    });
    hote.querySelectorAll('[data-sous-suppr]').forEach(b => b.onclick = () => {
      liste.splice(Number(b.dataset.sousSuppr), 1);
      dessiner();
    });
    const champ = hote.querySelector('#tel-sous-neuve');
    const ajouter = () => {
      const t = (champ.value || '').trim();
      if (!t) return;
      liste.push({ t, f: false });
      dessiner();
      // ⚠ LE CURSEUR REVIENT DANS LE CHAMP : on en saisit trois à la suite, et
      // le bloc vient d'être reconstruit sous la main.
      hote.querySelector('#tel-sous-neuve')?.focus();
    };
    hote.querySelector('#tel-sous-ajouter').onclick = ajouter;
    // ⚠ Entrée AJOUTE et n'envoie PAS le formulaire : sans ce garde, saisir une
    // sous-tâche et appuyer sur Entrée enregistrait la tâche entière.
    champ.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } };

    // -- commentaires
    const neuf = hote.querySelector('#tel-com-neuf');
    const poster = async () => {
      const body = (neuf.value || '').trim();
      if (!body) return;
      neuf.disabled = true;
      try {
        await db.insert('events', {
          activity_id: tache.id, kind: 'note', author_id: scope.user?.id || null, body,
          // Un commentaire de tâche porte aussi les rattachements de la tâche :
          // c'est ce qui le fait remonter dans l'historique du dossier.
          deal_id: tache.deal_id || null, contact_id: tache.contact_id || null,
          organisation_id: tache.organisation_id || null,
        });
        neuf.value = '';
        dessiner();
        hote.querySelector('#tel-com-neuf')?.focus();
      } catch (e) { toast(String(e.message || e).slice(0, 120), 'err'); }
      finally { const n = hote.querySelector('#tel-com-neuf'); if (n) n.disabled = false; }
    };
    hote.querySelector('#tel-com-ajouter').onclick = poster;
    neuf.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); poster(); } };

    // -- pièces jointes
    // ⚠ LE MÊME CHEMIN QUE PARTOUT AILLEURS : un fichier dans le seau, une
    // ligne dans `documents`. On ne réutilise pas `bindDocuments` parce qu'il
    // supprime derrière le `confirm()` de `ui.js`, qui remplacerait ce
    // formulaire — mais l'écriture, elle, est la même, à la lettre.
    const fichier = hote.querySelector('#tel-fichier');
    fichier.onchange = async () => {
      const choisis = [...(fichier.files || [])];
      if (!choisis.length) return;
      occupe = true; dessiner();
      let n = 0;
      for (const f of choisis) {
        if (f.size > MAX_MO * 1048576) { toast(`${f.name} : trop lourd (${MAX_MO} Mo max)`, 'warn'); continue; }
        try {
          const chemin = `${ENTITE}/${tache.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
          await db.uploadFile(chemin, f);
          await db.insert('documents', {
            entity_type: ENTITE, entity_id: tache.id, name: f.name,
            mime: f.type || null, size: f.size, storage_path: chemin,
            category: null, created_by: scope.user?.id || null,
          });
          n++;
        } catch (e) { toast(`${f.name} — ${String(e.message || e).slice(0, 90)}`, 'err'); }
      }
      occupe = false;
      rafraichir();
      if (n) toast(`${n} document${n > 1 ? 's déposés' : ' déposé'}`);
    };
    hote.querySelectorAll('[data-piece]').forEach(a => a.onclick = async (e) => {
      e.preventDefault();
      const d = db.byId('documents', a.dataset.piece);
      if (!d) return;
      try { window.open(await db.fileUrl(d.storage_path), '_blank', 'noopener'); }
      catch (err) { toast(String(err.message || err).slice(0, 120), 'err'); }
    });
  };

  const rafraichir = () => { pieces = docsOf(ENTITE, tache.id); dessiner(); redessiner?.(); };

  rafraichir();

  // ⚠ LA CHECKLIST SE LIT À L'ENREGISTREMENT, depuis l'état et non depuis le
  // DOM : le bloc a pu être redessiné dix fois entre-temps.
  return { checklist: () => liste.map(x => ({ t: x.t, f: x.f === true })) };
}
