// Confier une fiche RGD à quelqu'un de l'équipe.
//
// Demandé le 25/09/2026 : « pour RGD également je voudrais avoir la possibilité
// pour Mickael d'attribuer une nouvelle demande à un membre de RGD ».
//
// ⚠ C'EST UN ACTE DE DIRECTION, ET LE SERVEUR EST D'ACCORD. Les policies
// `rgd_*_maj` n'acceptent un `owner_id` différent de soi que de la direction
// (migration `20260925170000_rgd_portefeuille_par_personne`) : un chargé
// d'affaires ne peut ni prendre le dossier d'un collègue, ni se débarrasser du
// sien. Le bouton caché ailleurs qu'à la direction n'est donc pas la sécurité,
// seulement la politesse de ne pas proposer un geste qui échouerait.
//
// ⚠ UNE DEMANDE DU SITE N'A PAS DE PROPRIÉTAIRE, ET C'EST POUR ÇA QU'IL FAUT
// CET ÉCRAN. La fonction qui reçoit le formulaire tourne côté serveur, sans
// utilisateur : la case reste vide, et une fiche sans propriétaire n'est
// visible que de la direction. C'est la même règle que les leads BTP depuis le
// 18/09 — « une affaire orpheline doit se remarquer, sinon elle est perdue ».
//
// ⚠ TROIS CHOSES CHANGENT DE MAIN, PAS UNE. La fiche, l'affaire qui en est née,
// et le contact. Ne déplacer que la fiche donnerait à quelqu'un un dossier dont
// le pipeline, les devis, les chantiers et les paiements resteraient invisibles
// — parce que TOUT ÇA pend de l'affaire, pas de la fiche. L'oubli ne se
// verrait pas depuis la direction, qui voit tout : il ne se verrait que de la
// personne à qui on vient de confier un dossier vide.
import { db } from '../data/db.js';
import { esc, openModal, closeModal, toast, userName } from '../ui.js';
import { scope } from '../data/scope.js';
import { assignerResponsable } from './deal.js';

const TABLE = { demande: 'rgd_demandes', client: 'rgd_clients' };

// Les affaires RGD nées de cette fiche. Le lien se fait par le contact : c'est
// la seule clé que les deux tables partagent avec `deals`.
const affairesDeLaFiche = (ligne) => !ligne?.contact_id ? []
  : db.t('deals').filter(d => d.activity === 'rgd' && d.contact_id === ligne.contact_id);

export function proprietaireDeLaFiche(ligne) {
  return ligne?.owner_id ? db.byId('profiles', ligne.owner_id) : null;
}

export async function confierFicheRgd(cible, ligne, beneficiaire) {
  const table = TABLE[cible];
  if (!table) throw new Error(`Cible inconnue : ${cible}`);
  const neuve = await db.update(table, ligne.id, { owner_id: beneficiaire });

  // ⚠ L'APPELANT TIENT UN INSTANTANÉ, PAS LA LIGNE. La fiche a capturé
  // `x.ligne` à son ouverture ; `db.update` range un nouvel objet dans le
  // cache sans toucher à celui-là. Sans cette recopie, l'attribution
  // s'enregistrait bel et bien — éprouvé — mais la fiche rouverte derrière
  // affichait encore « À attribuer », ce qui donne à penser que le geste a
  // échoué alors qu'il a réussi. Le pire des deux mondes : juste en base,
  // faux à l'écran.
  Object.assign(ligne, neuve || { owner_id: beneficiaire });

  // L'affaire suit, et `assignerResponsable` fait le reste de son côté : les
  // tâches que personne ne porte, et la trace dans l'historique de l'affaire.
  for (const d of affairesDeLaFiche(ligne)) await assignerResponsable(d, beneficiaire);

  // Le contact suit aussi. Sans lui, la personne verrait le dossier et pas le
  // nom de qui l'appelle : `contacts_select` ne s'ouvre que par le propriétaire
  // ou par une affaire visible, jamais par la structure.
  if (ligne.contact_id) {
    const c = db.byId('contacts', ligne.contact_id);
    if (c && c.owner_id !== beneficiaire) await db.update('contacts', c.id, { owner_id: beneficiaire });
  }
}

// ⚠ `onClose` N'EST PAS UN LUXE. `openModal` ferme celle qui est ouverte pour
// prendre sa place : ouvrir celle-ci fait donc disparaître la fiche. Sans
// `onClose` qui la redessine, annuler l'attribution laisserait l'écran vide et
// il faudrait rouvrir la fiche à la main. Même mécanique que `attribuerDeal`.
export function attribuerFicheRgd(x, onDone, onClose = null) {
  const ligne = x.ligne;
  const actuel = proprietaireDeLaFiche(ligne);
  const candidats = scope.candidatsRgd();
  const affaires = affairesDeLaFiche(ligne);

  const m = openModal(actuel ? 'Changer de responsable' : 'Attribuer cette fiche', `
    <form class="form" id="rgda-form">
      <label class="mail-champ"><span>Membre de l'équipe RGD</span>
        <select name="owner_id" required>
          <option value="">— Choisir —</option>
          ${candidats.map(u => `<option value="${esc(u.id)}"${u.id === ligne.owner_id ? ' selected' : ''}>${esc(u.full_name)}${u.role === 'direction' ? ' (direction)' : ''}</option>`).join('')}
        </select>
      </label>
      <p class="muted small">${actuel
        ? `Actuellement : <b>${esc(actuel.full_name)}</b>.`
        : "Personne n'en est responsable : la fiche n'apparaît aujourd'hui que pour la direction."}
        ${affaires.length
          ? ` L'affaire${affaires.length > 1 ? 's' : ''} qui en ${affaires.length > 1 ? 'sont nées' : 'est née'} suivra${affaires.length > 1 ? 'ont' : ''}, avec ${affaires.length > 1 ? 'leurs' : 'ses'} devis, chantiers et paiements.`
          : " Elle n'a pas encore d'affaire : il n'y a que la fiche à confier."}
        Le contact suit dans tous les cas.</p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button class="btn" type="submit">${actuel ? 'Changer' : 'Attribuer'}</button>
      </div>
    </form>`, { onClose });

  m.querySelector('#rgda-form').onsubmit = async e => {
    e.preventDefault();
    const id = new FormData(e.target).get('owner_id');
    if (!id || id === ligne.owner_id) { closeModal(true); return onDone?.(); }
    try {
      await confierFicheRgd(x.cible, ligne, id);
      closeModal(true);
      toast(`Confiée à ${userName(id)}`);
      onDone?.();
    } catch (err) {
      toast(err.message || "L'attribution a échoué", 'warn');
    }
  };
}
