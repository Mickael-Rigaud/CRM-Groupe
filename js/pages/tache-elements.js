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
//   — un commentaire et une pièce jointe partent TOUT DE SUITE sur une tâche
//     qui existe. Ce sont des ajouts, pas des corrections : les perdre sur un
//     « Annuler » serait absurde.
//
// ⚠ À LA CRÉATION, LES PIÈCES JOINTES ATTENDENT (06/10/2026, demandé par
// Mickael : « les pièces jointes je voudrais avoir la possibilité de les
// déposer lorsque je crée la tâche »). Une pièce jointe a besoin d'une tâche à
// laquelle se rattacher, et celle-ci n'a pas encore d'identifiant : les
// fichiers sont tenus en mémoire et partent juste après l'insertion
// (`envoyerPieces`). Annuler la création n'envoie donc rien — aucun fichier
// orphelin dans le seau. Les commentaires, eux, restent fermés à la création :
// un fil de discussion sur une tâche qui n'existe pas n'a personne à qui parler.
//
// ⚠ LES NOTES SONT DEVENUES DES SOUS-TÂCHES (même demande : « pour les notes je
// voudrais finalement que ce soit des sous-tâches que l'on cocherait »). Le
// champ « Notes » a quitté le formulaire. Une tâche qui porte encore une note —
// celles des autres structures, et les remarques que la conversion de la
// gestion locative a laissées (totaux, « en attente de paiement ») — la montre
// en lecture, avec « Convertir en sous-tâches ». On ne l'efface jamais en
// silence : un formulaire sans le champ aurait écrit une note vide au premier
// enregistrement.
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

/**
 * Une note → des sous-tâches. LA MÊME RÈGLE que la migration
 * `taches_partage_et_notes_en_sous_taches`, qui a converti la gestion
 * locative : un tiret ouvre une sous-tâche ; dans une note qui en porte, une
 * ligne sans tiret est une remarque (un total, « en attente de paiement ») et
 * reste en note ; dans une note qui n'en porte aucun, chaque ligne est une
 * sous-tâche, sauf un intitulé terminé par « : ». Deux règles pour la même
 * conversion donneraient deux résultats selon qu'elle a été faite par la base
 * ou par l'écran.
 */
export function noteEnSousTaches(texte) {
  const TIRET = /^\s*[-–—•*]+\s*/;
  const lignes = String(texte || '').replace(/\r/g, '').split('\n')
    .map(l => ({ tiret: TIRET.test(l), t: l.replace(TIRET, '').trim() }))
    .filter(l => l.t);
  const aDesTirets = lignes.some(l => l.tiret);
  const sous = [], reste = [];
  for (const l of lignes) {
    if (l.tiret || (!aDesTirets && !/:$/.test(l.t))) sous.push({ t: l.t, f: false });
    else reste.push(l.t);
  }
  return { sous, reste: reste.join('\n') };
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

// ⚠ LA NOTE N'APPARAÎT QUE SI ELLE EXISTE : le champ est parti, on ne propose
// plus d'en écrire une, mais on ne cache pas celle qui est là.
const htmlNote = (note) => !note ? '' : `<div class="tel-bloc" data-bloc="note">
  <div class="tel-tete"><h4>Note</h4></div>
  <p class="tel-note">${esc(note)}</p>
  <div class="tel-note-actions">
    <button type="button" class="btn ghost sm" id="tel-note-convertir">Convertir en sous-tâches</button>
  </div>
  <p class="tel-aide">Les notes sont devenues des sous-tâches. Celle-ci date d’avant : un tiret ouvre une sous-tâche, les remarques sans tiret restent ici.</p>
</div>`;

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
const ko = (n) => n ? Math.max(1, Math.round(n / 1024)) + ' Ko' : '';
const htmlPieces = (liste, attente, occupe, nouvelle) => `<div class="tel-bloc" data-bloc="pieces">
  <div class="tel-tete"><h4>Pièces jointes</h4>${liste.length + attente.length ? `<span class="tel-compte">${liste.length + attente.length}</span>` : ''}</div>
  ${liste.length || attente.length ? `<ul class="tel-pieces">${liste.map(d => `<li>
    <a href="#" data-piece="${esc(d.id)}">${esc(d.name)}</a>
    <span class="tel-aide">${ko(d.size)}</span>
  </li>`).join('')}${attente.map((f, i) => `<li class="est-attente">
    <span class="tel-piece-nom">${esc(f.name)}</span>
    <span class="tel-aide">${ko(f.size)} · à l’enregistrement</span>
    <button type="button" class="tel-x" data-attente-suppr="${i}" title="Retirer">✕</button>
  </li>`).join('')}</ul>` : ''}
  <label class="tel-depot ${occupe ? 'est-occupe' : ''}">
    <input type="file" id="tel-fichier" multiple hidden>
    <span>${occupe ? 'Envoi en cours…' : '+ Déposer un document'}</span>
  </label>
  <p class="tel-aide">${nouvelle
    ? 'Les documents partent avec la tâche, au clic sur « Enregistrer ». Annuler n’envoie rien.'
    : 'Le document part tout de suite : il ne dépend pas du bouton « Enregistrer ».'}</p>
</div>`;

// ⚠ LE MÊME CHEMIN QUE PARTOUT AILLEURS : un fichier dans le seau, une ligne
// dans `documents`. On ne réutilise pas `bindDocuments` parce qu'il supprime
// derrière le `confirm()` de `ui.js`, qui remplacerait ce formulaire — mais
// l'écriture, elle, est la même, à la lettre. Écrite UNE fois, appelée au dépôt
// sur une tâche existante et après l'insertion sur une tâche neuve.
async function deposer(tacheId, fichiers) {
  let n = 0;
  for (const f of fichiers) {
    try {
      const chemin = `${ENTITE}/${tacheId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
      await db.uploadFile(chemin, f);
      await db.insert('documents', {
        entity_type: ENTITE, entity_id: tacheId, name: f.name,
        mime: f.type || null, size: f.size, storage_path: chemin,
        category: null, created_by: scope.user?.id || null,
      });
      n++;
    } catch (e) { toast(`${f.name} — ${String(e.message || e).slice(0, 90)}`, 'err'); }
  }
  return n;
}

const tropLourd = (f) => {
  if (f.size <= MAX_MO * 1048576) return false;
  toast(`${f.name} : trop lourd (${MAX_MO} Mo max)`, 'warn');
  return true;
};

/**
 * Monte les blocs dans un hôte, et rend ce que le formulaire devra enregistrer
 * avec le reste : `checklist()`, `notes()` et, pour une tâche neuve,
 * `envoyerPieces(id)` à appeler une fois l'insertion faite.
 *
 * `tache` peut ne pas avoir d'`id` : c'est une création. Les sous-tâches et les
 * pièces jointes s'y saisissent, les commentaires non.
 */
export function monterElements(hote, tache = {}, { redessiner } = {}) {
  const nouvelle = !tache.id;
  let liste = checklistDe(tache);
  let note = String(tache.notes || '').trim();
  let pieces = nouvelle ? [] : docsOf(ENTITE, tache.id);
  const attente = [];
  let occupe = false;

  const dessiner = () => {
    hote.innerHTML = htmlNote(note) + htmlChecklist(liste) + htmlPieces(pieces, attente, occupe, nouvelle)
      + (nouvelle ? '' : htmlCommentaires(tache.id));
    brancher();
  };

  const brancher = () => {
    // -- l'ancienne note
    const conv = hote.querySelector('#tel-note-convertir');
    if (conv) conv.onclick = () => {
      const { sous, reste } = noteEnSousTaches(note);
      if (!sous.length) { toast('Rien à convertir : cette note ne porte que des remarques.', 'warn'); return; }
      liste.push(...sous);
      note = reste;
      dessiner();
      toast(`${sous.length} sous-tâche${sous.length > 1 ? 's' : ''} — à enregistrer`);
    };

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

    // -- commentaires (tâche existante seulement)
    const neuf = hote.querySelector('#tel-com-neuf');
    if (neuf) {
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
    }

    // -- pièces jointes
    const recevoir = async (choisis) => {
      choisis = choisis.filter(f => !tropLourd(f));
      if (!choisis.length) return;
      if (nouvelle) { attente.push(...choisis); dessiner(); return; }
      occupe = true; dessiner();
      const n = await deposer(tache.id, choisis);
      occupe = false;
      rafraichir();
      if (n) toast(`${n} document${n > 1 ? 's déposés' : ' déposé'}`);
    };
    const fichier = hote.querySelector('#tel-fichier');
    fichier.onchange = () => recevoir([...(fichier.files || [])]);
    // ⚠ `dragover` DOIT ÊTRE ANNULÉ POUR QUE `drop` EXISTE : sans
    // `preventDefault`, le navigateur ouvre le fichier dans l'onglet et le
    // formulaire entier est perdu.
    const depot = hote.querySelector('.tel-depot');
    depot.ondragover = (e) => { e.preventDefault(); depot.classList.add('survol'); };
    depot.ondragleave = () => depot.classList.remove('survol');
    depot.ondrop = (e) => {
      e.preventDefault(); depot.classList.remove('survol');
      if (!occupe) recevoir([...(e.dataTransfer?.files || [])]);
    };
    hote.querySelectorAll('[data-attente-suppr]').forEach(b => b.onclick = (e) => {
      e.preventDefault();
      attente.splice(Number(b.dataset.attenteSuppr), 1);
      dessiner();
    });
    hote.querySelectorAll('[data-piece]').forEach(a => a.onclick = async (e) => {
      e.preventDefault();
      const d = db.byId('documents', a.dataset.piece);
      if (!d) return;
      try { window.open(await db.fileUrl(d.storage_path), '_blank', 'noopener'); }
      catch (err) { toast(String(err.message || err).slice(0, 120), 'err'); }
    });
  };

  const rafraichir = () => { if (!nouvelle) pieces = docsOf(ENTITE, tache.id); dessiner(); redessiner?.(); };

  rafraichir();

  return {
    // ⚠ LA CHECKLIST SE LIT À L'ENREGISTREMENT, depuis l'état et non depuis le
    // DOM : le bloc a pu être redessiné dix fois entre-temps.
    checklist: () => liste.map(x => ({ t: x.t, f: x.f === true })),
    // Ce qui reste de l'ancienne note, `null` si plus rien.
    notes: () => note || null,
    // ⚠ APPELÉ APRÈS L'INSERTION, avec l'identifiant qu'elle vient de rendre.
    // Un fichier qui échoue n'annule pas la tâche : il est dit, la tâche reste.
    envoyerPieces: async (id) => {
      if (!attente.length || !id) return 0;
      return deposer(id, attente.splice(0));
    },
  };
}
