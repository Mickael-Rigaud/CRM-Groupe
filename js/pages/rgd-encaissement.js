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

// ⚠ DES DESSINS, PLUS DES ÉMOJIS (11/11/2026, Élodie : « les icônes ne sont
// pas les mêmes que celles que tu m'as présenté »). Un émoji est rendu par la
// police du SYSTÈME : le même caractère donne une carte bleue plate sur un
// Windows, une carte dorée sur un iPhone, un carré vide sur une machine qui ne
// l'a pas. On ne peut donc ni le montrer d'avance, ni l'accorder au reste de
// l'écran. Un trait dessiné ici prend la couleur du thème et ne bouge nulle
// part — et il s'affine quand la tuile est choisie.
const ic = (d, large = false) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="${large ? 2.4 : 1.7}" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">${d}</svg>`;

const COCHE = ic('<path d="M4 12.5l5 5L20 6.5"/>', true);

// ⚠ L'ORDRE EST CELUI D'UN DÉPANNAGE CHEZ UN PARTICULIER, pas l'alphabet : la
// carte d'abord parce que c'est ce que Franck tendra au client sur place, les
// espèces ensuite, le virement et le chèque après — ceux-là arrivent plus tard
// et se saisissent au bureau.
const MOYENS = [
  { cle: 'carte', aide: 'sur place, au lecteur',
    icone: ic('<rect x="2" y="5" width="20" height="14" rx="2.6"/><path d="M2 10h20"/><path d="M5.5 14.8h3.2"/>') },
  { cle: 'especes', aide: 'de la main à la main',
    icone: ic('<rect x="2" y="6" width="20" height="12" rx="2.2"/><circle cx="12" cy="12" r="2.7"/><path d="M5.6 12h.02M18.4 12h.02"/>') },
  { cle: 'virement', aide: 'reçu sur le compte',
    icone: ic('<path d="M3 9.8l9-5.6 9 5.6"/><path d="M5.6 10.4v8.2M18.4 10.4v8.2M10 10.4v8.2M14 10.4v8.2"/><path d="M3 19.4h18"/>') },
  // ⚠ LE CHÈQUE EST UNE SIGNATURE, PAS UN RECTANGLE : dessiné en cadre, il
  // devenait le jumeau du billet et de la carte — trois boîtes à 21 px, qu'on
  // ne distingue qu'en les lisant. Un paraphe au-dessus d'une ligne ne
  // ressemble à rien d'autre sur cet écran.
  { cle: 'cheque', aide: 'remis ou envoyé',
    icone: ic('<path d="M3 15.6c2.4 0 2.9-9 4.8-9s1.7 9 3.9 9 2.4-5 3.9-5 1.9 2 4.4 2"/><path d="M3 20h18"/>') },
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
            une fois.
            ⚠ ET LA TUILE EST CELLE DU TABLEAU DE BORD, pas une invention :
            même dégradé à 135°, même pastille claire en haut à droite, même
            ombre portée que `rgd-bil-tuile`. Élodie a validé cette présentation
            le 10/11 (« j'adore cette présentation ») ; en refaire une autre ici
            aurait donné deux langages visuels pour le même CRM. Vert, parce que
            c'est de l'argent qui entre. */ ''}
      <div class="renc-somme${paye ? ' est-paye' : ''}">
        <span class="renc-mot">${paye ? 'Encaissé' : 'À encaisser'}</span>
        <span class="renc-ttc">${euros(courant.montant_ttc)}</span>
        <span class="renc-ht">${euros(courant.montant_ht)} HT · TVA ${euros(courant.montant_tva)}</span>
      </div>

      ${paye ? `<div class="renc-paye">
        <span class="renc-paye-ic">${COCHE}</span>
        <span class="renc-paye-txt">
          <b>Réglée le ${esc(fmtDate(courant.regle_le))}</b>
          <small>${esc(MOYENS_PAIEMENT[courant.regle_par] || courant.regle_par || 'moyen non précisé')}</small>
        </span>
      </div>
      <div class="form-actions">
        <button type="button" class="btn ghost" id="renc-defaire">Ce n’était pas payé</button>
        <button type="button" class="btn" data-close>Fermer</button>
      </div>`
      : `<p class="renc-question">Comment le client a-t-il payé&nbsp;?</p>
      <div class="renc-moyens">
        ${MOYENS.map(o => `<button type="button" class="renc-moyen${moyen === o.cle ? ' est-choisi' : ''}"
          data-moyen="${esc(o.cle)}" aria-pressed="${moyen === o.cle}">
          <span class="renc-ic">${o.icone}</span>
          <span class="renc-txt"><b>${esc(MOYENS_PAIEMENT[o.cle])}</b><small>${esc(o.aide)}</small></span>
          <span class="renc-coche">${COCHE}</span>
        </button>`).join('')}
      </div>
      <label class="renc-date"><span>Date du règlement</span>
        <input type="date" id="renc-date" value="${esc(date)}" max="${esc(aujourdhui())}"></label>
      ${/* ⚠ LA DATE EST MODIFIABLE ET PART D'AUJOURD'HUI : un virement se
            constate au bureau, parfois trois jours après être tombé. C'est
            elle qui range l'argent dans le mois du CA encaissé — la poser
            d'office au jour de la saisie décalerait un encaissement de fin de
            mois sur le mois suivant. */ ''}
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Plus tard</button>
        ${/* ⚠ LE BOUTON DIT LE MOYEN CHOISI, et change quand on change de
              tuile : c'est la seule confirmation qu'on lit vraiment avant
              d'appuyer, et elle évite d'encaisser en espèces un virement. */ ''}
        <button type="button" class="btn" id="renc-ok">Encaisser ${euros(courant.montant_ttc)}
          en ${esc(MOYENS_PAIEMENT[moyen] || '')}</button>
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
