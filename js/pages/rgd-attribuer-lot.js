// Confier PLUSIEURS fiches RGD d'un seul geste.
//
// Demandé le 06/10/2026 par Élodie, après le constat qui l'a rendu nécessaire :
// le cloisonnement par personne existe depuis le 25/09, mais **191 fiches sur
// 194 appartiennent à Mickael** et le seul chargé d'affaires de la structure
// voyait zéro dossier. L'écran d'attribution déplace une fiche à la fois —
// correct pour dix, intenable pour deux cents.
//
// ⚠ IL NE RÉÉCRIT PAS L'ATTRIBUTION, IL LA RÉPÈTE. `confierFicheRgd` fait déjà
// le travail d'une fiche — l'owner de la fiche, l'affaire par
// `assignerResponsable` (donc ses tâches et sa trace dans l'historique), et le
// contact. En écrire une seconde version pour le lot, c'était se garantir que
// les deux chemins finiraient par ne plus confier la même chose.
//
// ⚠ LE RENDEZ-VOUS NE SUIT PAS EN LOT, ET C'EST DIT À L'ÉCRAN. Le passer veut
// dire le déplacer dans Google, un appel réseau par événement : sur cinquante
// dossiers c'est long, c'est faillible au milieu, et ça touche l'agenda d'une
// entreprise en activité. L'écran fiche par fiche le propose toujours, coché
// par défaut — c'est là que ça se fait, en connaissance de cause.
//
// ⚠ C'EST UN ACTE DE DIRECTION, ET LE SERVEUR EST D'ACCORD : les policies
// `rgd_*_maj` n'acceptent un `owner_id` différent de soi que de la direction
// (migration `20260925170000_rgd_portefeuille_par_personne`). Le garde d'ici
// évite seulement de proposer un geste qui échouerait ligne après ligne.
import { db } from '../data/db.js';
import { esc, openModal, closeModal, toast, userName } from '../ui.js';
import { scope } from '../data/scope.js';
import { confierFicheRgd } from './rgd-attribuer.js';

// Ce qu'on annonce avant de lancer : combien de fiches, et combien d'entre
// elles ont déjà un propriétaire. ⚠ LA SECONDE MOITIÉ COMPTE AUTANT QUE LA
// PREMIÈRE — répartir des dossiers orphelins et prendre le portefeuille d'un
// collègue sont deux gestes différents, et la seule chose qui les distingue à
// l'écran est ce compte.
const bilanDuLot = (lignes) => {
  const avec = lignes.filter(x => x.ligne.owner_id);
  const autres = new Set(avec.map(x => x.ligne.owner_id));
  return { total: lignes.length, deja: avec.length, gens: [...autres] };
};

export function attribuerEnLotRgd(lignes, onDone) {
  if (!scope.isDirection) {
    return toast('Confier des dossiers est réservé à la direction.', 'warn');
  }
  if (!lignes.length) return;

  const { total, deja, gens } = bilanDuLot(lignes);
  const candidats = scope.candidatsRgd();
  let arreter = false;

  const m = openModal(`Confier ${total} fiche${total > 1 ? 's' : ''}`, `
    <form class="form" id="rgdl-form">
      <label class="mail-champ"><span>Membre de l’équipe RGD</span>
        <select name="owner_id" required>
          <option value="">— Choisir —</option>
          ${candidats.map(u => `<option value="${esc(u.id)}">${esc(u.full_name)}${
            u.role === 'direction' ? ' (direction)' : ''}</option>`).join('')}
        </select>
      </label>
      <p class="muted small">
        ${deja
          ? `<b>${deja}</b> de ces fiches ${deja > 1 ? 'ont' : 'a'} déjà un responsable${
              gens.length === 1 ? ` (${esc(userName(gens[0]))})` : ''} : ${
              deja > 1 ? 'elles changeront' : 'elle changera'} de main.`
          : 'Aucune de ces fiches n’a de responsable aujourd’hui : elles ne sont visibles que de la direction.'}
        Les affaires nées de chaque fiche suivent, avec leurs devis, chantiers et
        paiements, et le contact suit aussi.</p>
      <p class="mf-aide attention">Les rendez-vous ne sont pas déplacés : ils
        restent dans l’agenda où ils sont posés. Pour en passer un, ouvrez la
        fiche et utilisez « Attribuer » — c’est là que le choix se pose.</p>
      <div id="rgdl-progres" class="muted small" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button class="btn" type="submit" id="rgdl-go">Confier les ${total}</button>
      </div>
    </form>`);

  const progres = m.querySelector('#rgdl-progres');
  const bouton = m.querySelector('#rgdl-go');
  const choix = m.querySelector('[name="owner_id"]');

  m.querySelector('#rgdl-form').onsubmit = async e => {
    e.preventDefault();
    const id = choix.value;
    if (!id) return;

    // ⚠ ON NE REDESSINE PAS LA MODALE PENDANT LA BOUCLE, on écrit dans un seul
    // élément : un `innerHTML` emporterait le bouton qu'on vient de cliquer, et
    // avec lui le moyen d'arrêter.
    choix.disabled = true;
    bouton.textContent = 'Arrêter';
    bouton.type = 'button';
    bouton.onclick = () => { arreter = true; bouton.textContent = 'Arrêt…'; };
    progres.hidden = false;

    let faites = 0;
    let echecs = 0;
    let premierSouci = '';

    for (const x of lignes) {
      if (arreter) break;
      progres.textContent = `${faites + echecs} / ${total} — ${x.nom || 'fiche sans nom'}…`;
      try {
        await confierFicheRgd(x.cible, x.ligne, id);
        faites += 1;
      } catch (err) {
        // ⚠ ON CONTINUE APRÈS UN ÉCHEC, ET ON LE COMPTE. Chaque fiche est
        // indépendante : s'arrêter à la première laisserait un lot à moitié
        // confié, dont personne ne saurait dire où il s'est interrompu.
        echecs += 1;
        if (!premierSouci) premierSouci = err.message || 'écriture refusée';
      }
    }

    closeModal(true);
    const qui = userName(id);
    if (echecs) {
      toast(`${faites} fiche${faites > 1 ? 's' : ''} confiée${faites > 1 ? 's' : ''} à ${qui}, `
        + `${echecs} en échec — ${premierSouci}`, 'warn');
    } else if (arreter) {
      toast(`Arrêté : ${faites} fiche${faites > 1 ? 's' : ''} confiée${faites > 1 ? 's' : ''} à ${qui}.`);
    } else {
      toast(`${faites} fiche${faites > 1 ? 's' : ''} confiée${faites > 1 ? 's' : ''} à ${qui}`);
    }

    // Le contact et l'affaire ont changé de main par `db.update`, qui tient le
    // cache à jour. L'agenda, lui, n'a pas bougé — on ne le recharge pas.
    onDone?.();
  };
}
