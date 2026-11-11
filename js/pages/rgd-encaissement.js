// Encaisser une facture du CRM (11/11/2026)
//
// Élodie, le 11/11/2026 : « une fois que le bon d'attachement est envoyé, il se
// passe quoi après ??? Il faut l'encaissement, comment on peut faire ça ??? »
//
// ⚠ C'EST LA DERNIÈRE MARCHE DU PARCOURS, ET ELLE MANQUAIT. Le dépannage se
// terminait sur un bon d'attachement parti par mail, et plus rien : la facture
// restait due sans que rien ne demande jamais comment le client avait payé.
// L'écran arrive donc TOUT DE SUITE APRÈS L'ENVOI DU BON, là où Franck est
// encore chez le client, et pas dans une liste qu'il faudrait penser à ouvrir.
//
// ⚠ UNE SEULE PORTE POUR UN SEUL GESTE. La fenêtre de la facture portait déjà
// une rangée « Règlement » avec un menu déroulant et un bouton ; elle ouvre
// maintenant CET écran. Deux endroits où marquer une facture payée auraient
// fini par ne plus faire la même chose — c'est arrivé au bon d'attachement,
// dont la signature avait deux portes avant le 02/11.
//
// ⚠ ET IL NE S'IMPOSE PAS : « Plus tard » ferme sans rien écrire. Un client
// qui paie par virement à trente jours est le cas normal, pas l'exception ;
// forcer une réponse ferait saisir n'importe quoi pour sortir de l'écran.
import { esc, eur, toast, openModal, closeModal, fmtDate } from '../ui.js';
import { MOYENS_PAIEMENT, marquerReglee, annulerReglement } from '../data/rgd-devis-crm.js';

const euros = (n) => eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// ⚠ L'ORDRE EST CELUI D'UN DÉPANNAGE CHEZ UN PARTICULIER, pas l'alphabet : la
// carte d'abord parce que c'est ce que Franck tendra au client sur place, les
// espèces ensuite, le virement et le chèque après — ceux-là arrivent plus tard
// et se saisissent au bureau.
const MOYENS = [
  { cle: 'carte', icone: '💳', aide: 'sur place, au lecteur' },
  { cle: 'especes', icone: '💶', aide: 'réglé de la main à la main' },
  { cle: 'virement', icone: '🏦', aide: 'reçu sur le compte' },
  { cle: 'cheque', icone: '🧾', aide: 'remis ou envoyé' },
];

/**
 * La fenêtre d'encaissement d'une facture.
 *
 * `retour` est rappelé à la fermeture, quelle qu'en soit la cause : l'écran
 * d'où l'on vient se redessine, sinon la facture y resterait « à encaisser »
 * alors qu'elle vient d'être payée.
 */
export function ouvrirEncaissement(x, devis, retour = null) {
  if (!devis) { toast('Aucune facture à encaisser', 'error'); return; }
  let moyen = devis.regle_par || 'carte';
  let date = devis.regle_le || aujourdhui();
  let courant = devis;

  const m = openModal(`Encaisser ${devis.numero || 'la facture'}`,
    '<div id="renc"></div>', { onClose: retour });
  const hote = m.querySelector('#renc');

  const dessine = () => {
    const paye = !!courant.regle_le;
    hote.innerHTML = `
      ${/* ⚠ LE MONTANT TTC EN GRAND, LE HT EN PETIT : c'est le TTC que le
            client paie, et c'est le seul chiffre qu'on tape sur un lecteur de
            carte. Mettre le HT en avant ferait encaisser le mauvais montant,
            une fois. */ ''}
      <div class="renc-somme">
        <span class="renc-ttc">${euros(courant.montant_ttc)}</span>
        <span class="renc-mot">à encaisser</span>
        <span class="renc-ht">${euros(courant.montant_ht)} HT · TVA ${euros(courant.montant_tva)}</span>
      </div>

      ${paye ? `<div class="renc-paye">
        <b>Facture réglée le ${esc(fmtDate(courant.regle_le))}</b>
        <span>${esc(MOYENS_PAIEMENT[courant.regle_par] || courant.regle_par || 'moyen non précisé')}</span>
      </div>
      <div class="form-actions">
        <button type="button" class="btn ghost" id="renc-defaire">Ce n’était pas payé</button>
        <button type="button" class="btn" data-close>Fermer</button>
      </div>`
      : `<p class="rdc-aide">Comment le client a-t-il payé&nbsp;?</p>
      <div class="renc-moyens">
        ${MOYENS.map(o => `<button type="button" class="renc-moyen${moyen === o.cle ? ' est-choisi' : ''}"
          data-moyen="${esc(o.cle)}">
          <span class="renc-ic" aria-hidden="true">${o.icone}</span>
          <b>${esc(MOYENS_PAIEMENT[o.cle])}</b>
          <small>${esc(o.aide)}</small></button>`).join('')}
      </div>
      <div class="form"><div class="field half"><label>Date du règlement</label>
        <input type="date" id="renc-date" value="${esc(date)}" max="${esc(aujourdhui())}"></div></div>
      ${/* ⚠ LA DATE EST MODIFIABLE ET PART D'AUJOURD'HUI : un virement se
            constate au bureau, parfois trois jours après être tombé. C'est
            elle qui range l'argent dans le mois du CA encaissé — la poser
            d'office au jour de la saisie décalerait un encaissement de fin de
            mois sur le mois suivant. */ ''}
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Plus tard</button>
        <button type="button" class="btn" id="renc-ok">Encaisser ${euros(courant.montant_ttc)}</button>
      </div>`}`;

    hote.querySelectorAll('[data-moyen]').forEach(b => b.onclick = () => {
      moyen = b.dataset.moyen;
      date = hote.querySelector('#renc-date')?.value || date;
      dessine();
    });

    const ok = hote.querySelector('#renc-ok');
    if (ok) ok.onclick = async () => {
      date = hote.querySelector('#renc-date')?.value || aujourdhui();
      ok.disabled = true;
      try {
        courant = await marquerReglee(courant, moyen, date);
        toast(`Facture ${courant.numero || ''} encaissée — ${MOYENS_PAIEMENT[moyen]}`);
        dessine();
      } catch (e) {
        ok.disabled = false;
        toast(e.message || 'Encaissement impossible', 'error');
      }
    };

    const off = hote.querySelector('#renc-defaire');
    if (off) off.onclick = async () => {
      try {
        courant = await annulerReglement(courant);
        // ⚠ ET LA DATE REPART D'AUJOURD'HUI. Elle gardait celle de l'ancien
        // règlement : défaire un encaissement du 7 puis le refaire le 11 le
        // redatait du 7, en silence, parce que le champ affichait encore la
        // vieille valeur. Mesuré dans le navigateur, pas deviné.
        date = aujourdhui();
        toast('La facture redevient due');
        dessine();
      } catch (e) { toast(e.message || 'Impossible', 'error'); }
    };
  };

  dessine();
}

/**
 * Proposer l'encaissement à la fin du parcours, après l'envoi du bon.
 *
 * ⚠ ON NE LE PROPOSE PAS SUR UNE FACTURE DÉJÀ RÉGLÉE, ni sur un bon sans
 * facture : dans le premier cas la question est déjà répondue, dans le second
 * il n'y a aucune somme à encaisser — un bon d'attachement ne porte pas de
 * montant, c'est tout son principe.
 */
export function proposerEncaissement(x, devis, retour = null) {
  if (!devis || devis.regle_le) { closeModal(); return false; }
  closeModal(true);
  ouvrirEncaissement(x, devis, retour);
  return true;
}
