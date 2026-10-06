// La corbeille des affaires BTP : ce qu'on a jeté, et ce qu'on peut reprendre.
//
// Demandé par Élodie le 06/10/2026 : « pour BTP Expertise, je veux un système
// de corbeille avant de supprimer définitivement une affaire ».
//
// ⚠ C'EST UNE FENÊTRE, PAS UN ONGLET DE L'ESPACE, et c'est un choix de place :
// les vues de `#/btp/base` décrivent des CONTACTS (leurs colonnes sont nom,
// canal, affaire, chiffre). Y glisser des affaires jetées aurait donné un
// tableau dont la moitié des colonnes n'ont pas de sens. La corbeille s'ouvre
// donc d'où les affaires vivent — l'en-tête de la liste des missions.
//
// ⚠ ON NE MONTRE PAS CE QUI A DÉJÀ ÉTÉ REPRIS DANS LA MÊME LISTE : une ligne
// restaurée raconte ce qui s'est passé, elle ne se reprend ni ne se détruit
// plus. Elle reste lisible, en bas, grisée — l'effacer de l'écran ferait
// douter de ce qu'on a fait il y a dix minutes.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, openModal, toast, fmtDateTime, userName, confirm } from '../ui.js';
import {
  corbeilleBtp, restaurerAffaireBtp, purgerAffaireBtp,
} from '../data/btp-corbeille.js';

// Ce que la suppression aurait détruit, dit en clair. ⚠ ON NOMME LES CINQ
// NATURES SÉPARÉMENT : « 12 éléments » ne dit pas qu'il y avait des relevés
// dedans, et c'est précisément ce qu'on veut savoir avant de détruire.
const emporte = (x) => [
  (x.activites || []).length && `${(x.activites || []).length} tâche${(x.activites || []).length > 1 ? 's' : ''}`,
  (x.echanges || []).length && `${(x.echanges || []).length} ligne${(x.echanges || []).length > 1 ? 's' : ''} d’historique`,
  (x.suivi_amo || []).length && `${(x.suivi_amo || []).length} point${(x.suivi_amo || []).length > 1 ? 's' : ''} de suivi AMO`,
  (x.releves || []).length && `${(x.releves || []).length} relevé${(x.releves || []).length > 1 ? 's' : ''}`,
  (x.documents || []).length && `${(x.documents || []).length} document${(x.documents || []).length > 1 ? 's' : ''}`,
  // ⚠ LE CONTACT EST NOMMÉ À PART : c'est une PERSONNE, pas une pièce du
  // dossier, et c'est la ligne qu'on relit avant de détruire pour de bon.
  x.contact_supprime && 'le contact',
].filter(Boolean).join(' · ');

export function ouvrirCorbeilleBtp(apres) {
  const m = openModal('Corbeille — affaires BTP Expertise', '<div id="bcb"></div>');

  const dessine = () => {
    const toutes = corbeilleBtp().slice()
      .sort((a, b) => String(b.supprimee_le || '').localeCompare(String(a.supprimee_le || '')));
    const vives = toutes.filter(x => !x.restauree_le);
    const reprises = toutes.filter(x => x.restauree_le);

    const ligne = (x) => {
      const quoi = emporte(x);
      return `
        <tr>
          <td>
            <b>${esc(x.titre || 'affaire sans titre')}</b>
            ${quoi ? `<div class="small muted">avec ${esc(quoi)}</div>` : ''}
          </td>
          <td class="num">${x.affaire?.amount ? esc(eur(x.affaire.amount)) : '<span class="muted">—</span>'}</td>
          <td class="small">${esc(fmtDateTime(x.supprimee_le))}
            <div class="muted">${x.par ? esc(userName(x.par)) : ''}</div></td>
          <td class="num acts">
            <button type="button" class="btn ghost sm" data-reprendre="${esc(x.id)}">↩ Reprendre</button>
            <!-- ⚠ « Supprimer définitivement » N'APPARAÎT QUE POUR LA DIRECTION.
                 Un chargé d'affaires jette et reprend ; il ne détruit pas. Le
                 serveur refuse de toute façon. -->
            ${scope.isDirection
              ? `<button type="button" class="btn ghost sm danger" data-detruire="${esc(x.id)}"
                   title="Détruire la copie gardée : l’affaire ne pourra plus être reprise">Supprimer définitivement</button>`
              : ''}
          </td>
        </tr>`;
    };

    m.querySelector('#bcb').innerHTML = `
      <p class="muted small">Une affaire jetée quitte le pipeline mais <b>rien n’est détruit</b>&nbsp;:
        ses tâches, son historique, son suivi AMO, ses relevés et ses documents sont gardés avec elle
        et reviennent si on la reprend.${scope.isDirection ? '' : ' Seule la direction peut détruire une copie.'}</p>

      ${vives.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Affaire</th><th class="num">Montant</th><th>Jetée le</th><th></th></tr></thead>
          <tbody>${vives.map(ligne).join('')}</tbody>
        </table></div>` : `<div class="empty">La corbeille est vide — aucune affaire n’a été jetée.</div>`}

      ${reprises.length ? `
        <div class="mf-bloc-titre">Déjà reprises</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Affaire</th><th>Jetée le</th><th>Reprise le</th></tr></thead>
          <tbody>${reprises.map(x => `<tr class="muted">
            <td>${esc(x.titre || 'affaire sans titre')}</td>
            <td class="small">${esc(fmtDateTime(x.supprimee_le))}</td>
            <td class="small">${esc(fmtDateTime(x.restauree_le))}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : ''}`;

    m.querySelectorAll('[data-reprendre]').forEach(b => b.onclick = async () => {
      const x = vives.find(y => y.id === b.dataset.reprendre);
      if (!x) return;
      b.disabled = true;
      const r = await restaurerAffaireBtp(x.id);
      b.disabled = false;
      if (!r.ok) return toast(`Reprise impossible : ${r.motif}`, 'err');
      // ⚠ QUATRE TABLES À RECHARGER, et aucune n'est de trop : la fonction de
      // base écrit sans passer par le cache, donc le pipeline continuerait
      // d'ignorer une affaire pourtant revenue.
      await db.recharger('deals').catch(() => {});
      await db.recharger('activities').catch(() => {});
      await db.recharger('events').catch(() => {});
      await db.recharger('btp_corbeille').catch(() => {});
      // ⚠ ET LE CONTACT, QUAND IL ÉTAIT PARTI AVEC L'AFFAIRE.
      if (r.donnees?.contact_remis) await db.recharger('contacts').catch(() => {});
      toast('Affaire reprise');
      dessine();
      apres?.();
    });

    m.querySelectorAll('[data-detruire]').forEach(b => b.onclick = async () => {
      const x = vives.find(y => y.id === b.dataset.detruire);
      if (!x) return;
      const quoi = emporte(x);
      // ⚠ LA CONFIRMATION NOMME CE QUI DISPARAÎT. C'est le seul geste de cet
      // écran après lequel il n'y a plus rien à reprendre : la corbeille ÉTAIT
      // le filet, et on retire le filet.
      if (!await confirm(
        `Supprimer définitivement « ${x.titre || 'cette affaire'} »${quoi ? `, avec ${quoi}` : ''} ? `
        + 'Elle ne pourra plus être reprise : c’est irréversible.')) return;
      b.disabled = true;
      const r = await purgerAffaireBtp(x.id);
      b.disabled = false;
      if (!r.ok) return toast(`Suppression impossible : ${r.motif}`, 'err');
      await db.recharger('btp_corbeille').catch(() => {});
      toast('Affaire supprimée définitivement');
      dessine();
      apres?.();
    });
  };

  dessine();
}
