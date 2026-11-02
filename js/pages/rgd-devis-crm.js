// Faire un devis depuis la fiche RGD, avec la grille des tarifs (29/10/2026)
//
// Demandé par Élodie pour Franck : choisir les prestations dans la grille,
// les quantités, et sortir un devis numéroté en PDF. Voir l'en-tête de
// `data/rgd-devis-crm.js` pour ce qui est calculé où et pourquoi ces devis ne
// sont pas ceux de Costructor.
//
// CE QUE LA GRILLE IMPOSE À L'ÉCRAN
//   — un prix « Dès » se monte, il ne se baisse pas : le champ refuse moins
//     que le plancher, et le dit ;
//   — une prestation à variantes (le tableau en 1, 2 ou 3 rangées) porte un
//     choix, qui pose son prix ;
//   — un prix au m² part de la superficie de la fiche ;
//   — le diagnostic appelle la main-d'œuvre à l'heure (`ajoute_aussi`), qu'on
//     ajoute une fois, pas à chaque clic.
//
// ⚠ PAS DE `confirm()` ICI : il ouvre sa propre fenêtre et ferme celle du
// devis, avec tout ce qui était saisi. La suppression se confirme par un
// second clic sur le même bouton.
import { esc, eur, toast, openModal, closeModal, fmtDate } from '../ui.js';
import { scope } from '../data/scope.js';
import { valeursProjet } from '../data/rgd-projet.js';
import {
  TVA, TVA_DEFAUT, UNITES, PAR_UNITE, nomMetier, tarifsDe, metiersAvecGrille,
  totaux, plancher, ligneDepuisTarif, parCategorie, messageDevisCrm, envoyerDevisCrm, enregistrerDevisCrm, changerStatutDevisCrm, supprimerDevisCrm, signerSurPlace,
  MOYENS_PAIEMENT, marquerReglee, annulerReglement,
  signerBonAttachement,
  GENRES, genreDe, estDevis, statutsDe, statutDoc, facturerLeDevis, factureDuDevis, devisDeLaFacture,
  estAnnulee, annulerFacture, retablirFacture,
} from '../data/rgd-devis-crm.js';
import { posePadSignature } from '../pad-signature.js';
import { ouvrirImportFacture, peutImporterFacture } from './rgd-facture-import.js';
import { db } from '../data/db.js';
import { bonRempli } from '../data/rgd-bon-attachement.js';

const euros = (n) => eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Le bloc de la fiche : les factures, les devis, et le bouton pour en faire un.
 *
 * ⚠ DEUX TABLEAUX, PAS UN SEUL AVEC UNE COLONNE « nature » (02/11/2026,
 * Élodie : « je voudrais distinguer deux choses »). Mêlés, ils ne
 * s'additionnent pas : trois lignes à 1 200 € ne font pas 3 600 € de facturé
 * si l'une est un devis qui attend une réponse. Une pastille demanderait de
 * relire chaque ligne pour savoir ce qu'on regarde — et Élodie a déjà écarté
 * ce procédé le 27/10 sur un autre écran.
 */
/**
 * L'état du bon d'attachement, sur la ligne même de sa facture.
 *
 * ⚠ IL FALLAIT OUVRIR LA FACTURE ET DESCENDRE JUSQU'EN BAS (02/11/2026,
 * Élodie : « ce n'est pas intuitif pour trouver le bon d'attachement, parce
 * qu'il faut aller dans facture et en bas trouver le bon »). Trois gestes pour
 * le document qu'on remplit en sortant de chez le client, sur un téléphone.
 * Emplacement choisi par elle entre trois propositions : ici, sur la ligne.
 *
 * ⚠ PAS DE BON POUR UNE FACTURE IMPORTÉE : elle n'a aucune ligne, donc rien à
 * constater — son PDF vient d'ailleurs et le CRM n'a pas assisté aux travaux.
 *
 * ⚠ ET PAS D'INVITATION À EN REMPLIR UN SUR UNE FACTURE ANNULÉE. Un bon déjà
 * rempli reste accessible — c'est une pièce du dossier, on peut avoir à la
 * relire — mais proposer d'en commencer un attesterait de travaux pour un
 * document qui ne vaut plus rien.
 */
const bonDeLaLigne = (v) => {
  if (estDevis(v) || v.importe) return '';
  const signe = !!v.bon_signature;
  const fait = signe || bonRempli(v);
  // ⚠ ET PAS SUR UN BROUILLON : il n'a pas encore de numéro, donc le bon
  // n'aurait pas le sien (`BA` + celui de la facture) et porterait « accompagne
  // la facture n° — ». Le bon constate des travaux faits, après l'émission.
  if (!fait && (v.statut === 'brouillon' || estAnnulee(v) || !peutFaireDevisCrm())) return '';
  return `<div class="rdc-bon">
    <span class="rdc-bon-mot">Bon :</span>
    <span class="rdc-bon-etat${fait ? ' est-fait' : ''}">${signe ? 'Signé' : fait ? 'Rempli' : 'Vierge'}</span>
    <button type="button" class="btn ghost sm" data-bon="${esc(v.id)}">${fait ? 'Ouvrir' : 'Remplir'} ▸</button>
  </div>`;
};

export function blocDevisCrm(devis, peutFaire) {
  if (!devis.length && !peutFaire) return '';
  const factures = devis.filter(v => !estDevis(v));
  const lesDevis = devis.filter(v => estDevis(v));
  const rangee = (v) => { const e = statutDoc(v);
    // Un devis déjà facturé se dit sur sa propre ligne : sans cela on le
    // rouvre pour vérifier, ou on refacture les mêmes travaux deux fois.
    const suite = estDevis(v) && factureDuDevis(v);
    return `<tr class="rdc-ligne" data-devis-crm="${esc(v.id)}" tabindex="0">
      <td><b>${esc(v.numero || '—')}</b>
        <div class="s muted">${v.importe ? 'Importée · ' : ''}${esc(v.objet || nomMetier(v.metier))} · ${esc(fmtDate(v.date_devis || v.created_at))}${
          suite ? ' · facturé' : ''}</div></td>
      <td class="num">${euros(v.montant_ttc)} <span class="s muted">TTC</span></td>
      <td class="rgdf-fin"><span class="chip ${e.ton}">${esc(e.label)}</span>${bonDeLaLigne(v)}</td>
    </tr>`; };
  const tableau = (liste) => `<div class="rgdf-tableau"><table><tbody>${liste.map(rangee).join('')}</tbody></table></div>`;
  return `<section class="rgdf-bloc rdc-bloc">
    <h3>Factures ${factures.length ? `<span class="rgdf-compte">${factures.length}</span>` : ''}
      ${peutFaire ? `<button type="button" class="btn sm rdc-nouveau" id="rdc-nouveau">${libelleBoutonFacture()}</button>` : ''}</h3>
    ${factures.length ? tableau(factures)
      : '<p class="rgdf-rien">Aucune facture faite dans le CRM pour ce dossier.</p>'}
  </section>
  ${lesDevis.length ? `<section class="rgdf-bloc rdc-bloc">
    <h3>Devis <span class="rgdf-compte">${lesDevis.length}</span></h3>
    ${tableau(lesDevis)}
    <p class="small muted">Un devis annonce un prix pour des travaux à venir : il ne réclame rien.
    Quand les travaux sont faits, on ouvre le devis accepté et on en tire la facture.</p>
  </section>` : ''}`;
}

/**
 * La fenêtre du devis. `retour` est rappelé à la fermeture, quelle qu'en soit
 * la cause : la fiche se redessine derrière (même règle que « Modifier »).
 *
 * ⚠ ON SAISIT LÀ OÙ L'ON CHOISIT (29/10/2026, Élodie : « pas du tout
 * intuitif… quand on sélectionne un élément je voudrais que l'on voit
 * directement qu'il est sélectionné et pouvoir remplir directement les
 * informations pour ne pas avoir à descendre la page »). La première version
 * posait la grille en haut et un tableau des lignes en bas : un clic ajoutait
 * une ligne hors de la vue, sans que le bouton ne change. Désormais chaque
 * prestation est une rangée qui se coche ; cochée, elle s'ouvre sur place avec
 * sa quantité, son prix et sa précision. Le total reste collé en bas.
 *
 * ⚠ RE-TOUCHER UNE RANGÉE COCHÉE LA DÉCOCHE (29/10/2026, Élodie : « on ne peut
 * pas déselctionner facilement des éléments »). La version d'avant ne le
 * faisait pas, et pour une raison juste : on y perdait ce qu'on venait de
 * taper. Mais une rangée qui porte une coche et qui ne se décoche pas fait
 * l'inverse du geste attendu — on touchait une seconde fois en croyant
 * annuler, et il ne se passait rien.
 *
 * La protection reste, elle est seulement devenue conditionnelle :
 *   · rien n'a été saisi depuis qu'on l'a cochée → elle se décoche aussitôt,
 *     c'est l'annulation d'une touche malheureuse ;
 *   · une quantité, un prix, un choix ou une précision a changé → la rangée
 *     demande « Retirer ? » et il faut toucher une seconde fois.
 *
 * ⚠ LA QUESTION SE POSE SUR LA RANGÉE, PAS DANS UNE FENÊTRE. Une modale
 * par-dessus la modale du devis se ferme mal (les deux partagent `closeModal`),
 * et sur téléphone la réponse doit rester sous le doigt, pas à l'autre bout de
 * l'écran. Même procédé que `confirmerSuppr` pour la suppression du devis.
 */
export function ouvrirDevisCrm(x, existant = null, retour = null, genreNeuf = 'facture') {
  const metiers = metiersAvecGrille();
  if (!existant && !metiers.length) { toast('Aucune grille de tarifs n’est en place', 'error'); return; }
  const surface = Number(valeursProjet(x).superficie) || null;
  // ⚠ `signe` VEUT DIRE « FIGÉ », ET UNE FACTURE ANNULÉE L'EST AUSSI. Sans
  // cela, une annulée restait modifiable à l'écran — alors que la base la
  // refuse désormais, et que réécrire une pièce du dossier serait pire que de
  // l'effacer. Le mot est gardé parce qu'il porte déjà ce sens partout dans
  // cette fenêtre (champs grisés, « Retirer » caché, pas de nouvelle
  // signature) ; seule la phrase affichée distingue les deux cas.
  const annulee = estAnnulee(existant);
  const signe = existant?.statut === 'signe' || annulee;

  // ⚠ LE GENRE EST FIXÉ DÈS L'OUVERTURE ET NE SE CHOISIT PAS ICI. Un sélecteur
  // dans la fenêtre aurait laissé croire qu'on peut changer d'avis après coup :
  // la base refuse de basculer un document numéroté, parce que son numéro vient
  // d'une suite qui n'est plus la bonne. On choisit AVANT, dans « + Facture ou
  // devis » ; ensuite, toute la fenêtre parle le langage du document ouvert.
  const g = existant ? genreDe(existant) : (genreNeuf === 'devis' ? 'devis' : 'facture');
  const G = GENRES[g];
  const dev = g === 'devis';
  const STATUTS = statutsDe(g);

  const etat = {
    genre: g,
    metier: existant?.metier || metiers[0],
    objet: existant?.objet || '',
    tva_taux: existant ? Number(existant.tva_taux) : TVA_DEFAUT,
    validite_jours: existant?.validite_jours || 30,
    notes: existant?.notes || '',
    lignes: structuredClone(existant?.lignes || []),
  };
  let confirmerSuppr = false;
  // La demande d'annulation, et le motif en cours de frappe. ⚠ PAS DE FENÊTRE
  // PAR-DESSUS CELLE-CI : deux modales partagent `closeModal` et se ferment
  // mal. Même procédé que la suppression — on demande SUR la rangée.
  let demandeAnnulation = false;
  let motifAnnulation = '';
  // La prestation qui attend un second appui pour être retirée, s'il y en a une.
  let aRetirer = null;

  const titre = existant ? `${G.label} ${existant.numero || '(brouillon)'}` : `${G.nouveau}${x.nom ? ' — ' + x.nom : ''}`;
  const m = openModal(titre, '<div id="rdc-hote" class="rdc"></div>', { wide: true, onClose: () => retour?.() });
  const hote = m.querySelector('#rdc-hote');

  const totalLigne = (l) => (Number(l.quantite) || 0) * (Number(l.prix_ht) || 0);
  const dis = signe ? 'disabled' : '';
  // Le devis d'où vient cette facture, et la facture tirée de ce devis. Relus
  // à chaque dessin : établir la facture redessine, et le bloc doit montrer
  // celle qui vient de naître, pas l'absence d'il y a une seconde.
  const devisSource = () => (existant && !dev ? devisDeLaFacture(existant) : null);
  const factureSuite = () => (existant && dev ? factureDuDevis(existant) : null);

  /**
   * Une prestation est « intacte » quand rien n'y a été saisi depuis qu'on l'a
   * cochée : elle vaut encore exactement ce que la grille lui donnait.
   *
   * ⚠ ON COMPARE À UNE LIGNE NEUVE, PAS À DES VALEURS ÉCRITES ICI. Le prix de
   * départ, la quantité déduite de la surface, la variante par défaut — tout
   * cela vient de `ligneDepuisTarif`, et le recopier ferait diverger les deux
   * le jour où elle change. Une prestation dont le tarif a disparu de la grille
   * n'est jamais intacte : dans le doute, on demande.
   */
  const estIntacte = (l) => {
    const t = l.code ? tarifsDe(l.metier || etat.metier).find(g => g.code === l.code) : null;
    if (!t) return false;
    const neuve = ligneDepuisTarif(t, { surface });
    return Number(l.quantite) === Number(neuve.quantite)
      && Number(l.prix_ht) === Number(neuve.prix_ht)
      && String(l.variante ?? '') === String(neuve.variante ?? '')
      && String(l.precision || '') === String(neuve.precision || '');
  };

  // Les champs d'une ligne, sous la prestation cochée. Une ligne libre porte
  // en plus sa désignation, qu'aucune grille ne lui donne.
  const saisie = (l, i, libre) => {
    const t = l.code ? tarifsDe(l.metier || etat.metier).find(g => g.code === l.code) : null;
    const variantes = t?.variantes || [];
    const mini = plancher(l);
    return `<div class="rdc-saisie" data-i="${i}">
      ${libre ? `<label class="rdc-champ rdc-large"><span>Désignation</span>
        <input data-champ="libelle" value="${esc(l.libelle)}" ${dis}></label>` : ''}
      ${variantes.length ? `<label class="rdc-champ"><span>Choix</span>
        <select data-champ="variante" ${dis}>${variantes.map(v => `<option value="${esc(v.libelle)}" ${v.libelle === l.variante ? 'selected' : ''}>${esc(v.libelle)} — ${euros(v.prix_ht)}</option>`).join('')}</select></label>` : ''}
      <label class="rdc-champ rdc-court"><span>Quantité</span>
        <span class="rdc-unite"><input type="number" inputmode="decimal" min="0" step="${l.unite === 'forfait' ? '1' : '0.5'}" data-champ="quantite" value="${esc(l.quantite)}" ${dis}><i>${esc(UNITES[l.unite] || '')}</i></span></label>
      <label class="rdc-champ rdc-court"><span>Prix unitaire HT</span>
        <span class="rdc-unite"><input type="number" inputmode="decimal" min="${mini}" step="1" data-champ="prix_ht" value="${esc(l.prix_ht)}" ${dis}><i>€</i></span>
        ${mini && t?.a_partir_de ? `<small class="rdc-plancher ${Number(l.prix_ht) < mini ? 'rdc-alerte' : ''}">minimum ${euros(mini)}</small>` : ''}</label>
      <label class="rdc-champ rdc-large"><span>Précision, imprimée sur ${dev ? 'le devis' : 'la facture'}</span>
        <input data-champ="precision" value="${esc(l.precision || '')}" placeholder="Facultatif : pièce, détail…" ${dis}></label>
      <div class="rdc-champ rdc-court rdc-sous"><span>Total HT</span><b class="rdc-total">${euros(totalLigne(l))}</b></div>
      ${signe ? '' : `<button type="button" class="btn ghost sm rdc-retirer" data-retirer="${i}">Retirer</button>`}
    </div>`;
  };

  const dessine = () => {
    const t = totaux(etat.lignes, etat.tva_taux);
    const grille = tarifsDe(etat.metier);
    const codesGrille = new Set(grille.map(g => g.code));
    // Les lignes par prestation, avec leur index réel dans `etat.lignes`.
    const lignesDe = (code) => etat.lignes.map((l, i) => ({ l, i })).filter(({ l }) => l.code === code);
    const horsGrille = etat.lignes.map((l, i) => ({ l, i })).filter(({ l }) => !l.code || !codesGrille.has(l.code));
    const nbChoisies = etat.lignes.length;

    const familles = parCategorie(grille, g => g.categorie).map(({ categorie, items }) => {
      const rangées = items.map(({ item: g }) => {
        const siennes = lignesDe(g.code);
        const choisie = siennes.length > 0;
        if (signe && !choisie) return '';
        const enDoute = aRetirer === g.code;
        return `<div class="rdc-presta ${choisie ? 'est-choisie' : ''}${enDoute ? ' est-a-retirer' : ''}">
          <button type="button" class="rdc-presta-tete" data-tarif="${esc(g.code)}" aria-pressed="${choisie}" ${signe ? 'disabled' : ''}>
            <span class="rdc-coche" aria-hidden="true">${enDoute ? '✕' : choisie ? '✓' : '+'}</span>
            <span class="rdc-presta-nom">${g.reference ? `<small>${esc(g.reference)}</small>` : ''}${esc(g.libelle)}</span>
            ${enDoute
              ? '<b class="rdc-presta-prix rdc-alerte">Retirer ?</b>'
              : `<b class="rdc-presta-prix">${g.a_partir_de ? 'dès ' : ''}${euros(g.prix_ht)}${PAR_UNITE[g.unite] || ''}</b>`}
          </button>
          ${siennes.map(({ l, i }) => saisie(l, i, false)).join('')}
        </div>`;
      }).join('');
      if (!rangées.trim()) return '';
      const n = items.filter(({ item: g }) => lignesDe(g.code).length).length;
      return `<section class="rdc-famille">
        <h4 class="rdc-cat">${esc(categorie)}${n ? `<span class="rdc-compte">${n} choisie${n > 1 ? 's' : ''}</span>` : ''}</h4>
        ${rangées}
      </section>`;
    }).join('');

    // Relus À CHAQUE DESSIN, et pas une fois à l'ouverture : établir la
    // facture redessine la fenêtre, et le bloc doit montrer celle qui vient
    // de naître, pas l'absence d'il y a une seconde.
    const issu = devisSource();
    const suite = factureSuite();

    hote.innerHTML = `
      ${signe ? `<p class="rdc-note">${annulee
          ? 'Cette facture est annulée : son contenu ne se modifie plus. Elle garde son numéro et sa place dans la suite — c’est ce que la loi demande — mais elle ne réclame plus rien.'
          : dev
          ? 'Ce devis est accepté : son contenu ne se modifie plus. C’est le prix que le client a validé.'
          : 'Cette facture est signée : son contenu ne se modifie plus. Seul son statut peut encore changer.'}</p>`
        : `<p class="rdc-aide"><b>1.</b> Touchez les prestations ${dev ? 'à chiffrer' : 'à facturer'}
          <b>2.</b> Réglez quantité et prix juste en dessous <b>3.</b> Enregistrez ou sortez le PDF, en bas</p>`}
      ${issu ? `<p class="small muted">Établie depuis le devis <b>${esc(issu.numero || 'en brouillon')}</b>
        — ${euros(issu.montant_ttc)} TTC annoncés. Les écarts entre les deux sont normaux : on facture ce qui a été fait.</p>` : ''}
      <div class="form rdc-entete">
        <div class="field"><label>Objet ${dev ? 'du devis' : 'de la facture'}</label>
          <input id="rdc-objet" value="${esc(etat.objet)}" placeholder="${dev ? 'Rénovation électrique complète, mise aux normes…' : 'Dépannage électrique, mise aux normes du tableau…'}" ${dis}></div>
        ${metiers.length > 1 && !existant ? `<div class="field half"><label>Grille</label>
          <select id="rdc-metier">${metiers.map(k => `<option value="${esc(k)}" ${k === etat.metier ? 'selected' : ''}>${esc(nomMetier(k))}</option>`).join('')}</select></div>` : ''}
        <div class="field half"><label>TVA</label>
          <select id="rdc-tva" ${dis}>${TVA.map(v => `<option value="${v}" ${v === etat.tva_taux ? 'selected' : ''}>${String(v).replace('.', ',')} %${v === 10 ? ' — logement de plus de 2 ans' : v === 20 ? ' — neuf ou local professionnel' : ' — rénovation énergétique'}</option>`).join('')}</select></div>
        <div class="field half"><label>${dev ? 'Validité du devis' : 'Échéance de paiement'}</label>
          <select id="rdc-validite" ${dis}>${[15, 30, 60, 90].map(j => `<option value="${j}" ${j === Number(etat.validite_jours) ? 'selected' : ''}>${dev ? `valable ${j} jours` : `sous ${j} jours`}</option>`).join('')}</select></div>
      </div>

      ${familles}

      ${horsGrille.length || !signe ? `<section class="rdc-famille">
        <h4 class="rdc-cat">Hors grille${horsGrille.length ? `<span class="rdc-compte">${horsGrille.length}</span>` : ''}</h4>
        ${horsGrille.map(({ l, i }) => `<div class="rdc-presta est-choisie">
          <div class="rdc-presta-tete est-fixe"><span class="rdc-coche" aria-hidden="true">✓</span>
            <span class="rdc-presta-nom">${esc(l.libelle || 'Ligne libre')}</span></div>
          ${saisie(l, i, true)}
        </div>`).join('')}
        ${signe ? '' : '<button type="button" class="rdc-presta-tete rdc-libre" data-tarif=""><span class="rdc-coche" aria-hidden="true">+</span><span class="rdc-presta-nom">Ajouter une ligne libre (fournitures, prestation hors grille…)</span></button>'}
      </section>` : ''}

      <div class="form"><div class="field"><label>Remarques — imprimées sur ${dev ? 'le devis' : 'la facture'}</label>
        <textarea id="rdc-notes" rows="2" placeholder="${dev ? 'Délai de réalisation, fournitures comprises…' : 'Délai d’intervention, fournitures comprises…'}" ${dis}>${esc(etat.notes)}</textarea></div></div>

      ${existant ? `<div class="rdc-statut"><span class="muted small">Statut</span>
        ${Object.entries(STATUTS).filter(([k]) => !(k === 'refuse' && !dev)).map(([k, st]) => `<button type="button" class="chip ${k === existant.statut ? st.ton : ''}" data-statut="${k}">${esc(st.label)}</button>`).join('')}
        ${existant.statut === 'brouillon' ? `<button type="button" class="btn ghost sm rdc-suppr" id="rdc-suppr">${confirmerSuppr ? 'Confirmer la suppression' : 'Supprimer le brouillon'}</button>` : ''}
      </div>
      ${/* ⚠ « Annulée » N'EST PLUS UNE PASTILLE SUR UNE FACTURE (filtrée
            ci-dessus) : annuler se motive, et un clic sur une pastille ne
            demande rien. Le motif s'imprime sur le PDF remis au client, c'est
            lui qui explique pourquoi une somme facturée n'a pas été encaissée.
            Sur un DEVIS la pastille « Refusé » reste : un client qui dit non
            n'a aucune formalité à remplir. */ ''}
      ${dev || !existant.numero ? '' : `<div class="rdc-statut"><span class="muted small">Annulation</span>
        ${annulee
          ? `<span class="chip red">Annulée${existant.annule_le ? ' le ' + esc(fmtDate(String(existant.annule_le).slice(0, 10))) : ''}</span>
             ${existant.annule_motif ? `<span class="small muted">${esc(existant.annule_motif)}</span>` : ''}
             <button type="button" class="btn ghost sm" id="rdc-retablir">Rétablir</button>`
          : demandeAnnulation
          ? `<input id="rdc-annul-motif" class="rdc-motif" placeholder="Pourquoi ? (chantier annulé, erreur de montant…)" value="${esc(motifAnnulation)}">
             <button type="button" class="btn sm" id="rdc-annul-ok">Confirmer l’annulation</button>
             <button type="button" class="btn ghost sm" id="rdc-annul-non">Renoncer</button>`
          : '<button type="button" class="btn ghost sm" id="rdc-annuler">Annuler la facture</button>'}
      </div>
      ${demandeAnnulation && !annulee ? `<p class="small muted">Elle gardera son numéro ${esc(existant.numero)}
        et sortira des totaux. ${['envoye', 'signe'].includes(existant.statut)
          ? 'Elle est déjà sortie du brouillon : si le client l’a reçue, prévenez-le et remettez-lui la facture annulée.'
          : ''}</p>` : ''}`}
      ${dev ? '' : `<div class="rdc-statut"><span class="muted small">Règlement</span>
        ${existant.regle_le
          ? `<span class="chip green">Réglée le ${esc(fmtDate(existant.regle_le))}${existant.regle_par ? ' · ' + esc(MOYENS_PAIEMENT[existant.regle_par] || existant.regle_par) : ''}</span>
             <button type="button" class="btn ghost sm" id="rdc-regl-off">Annuler le règlement</button>`
          : `<select id="rdc-regl-moyen">${Object.entries(MOYENS_PAIEMENT).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select>
             <button type="button" class="btn sm" id="rdc-regl-on">Marquer réglée</button>`}
      </div>`}
      ${dev ? '' : `<div class="rdc-statut"><span class="muted small">Bon d’attachement</span>
        ${bonRempli(existant) ? '<span class="chip green">Rempli</span>' : '<span class="chip">Vierge</span>'}
        <button type="button" class="btn ghost sm" id="rdc-bon-remplir">Remplir et envoyer</button>
        ${existant.bon_signature
          ? `<span class="chip green">Signé${existant.bon_signe_par ? ' par ' + esc(existant.bon_signe_par) : ''}</span>`
          : '<button type="button" class="btn ghost sm" id="rdc-bon-signer">Faire signer</button>'}
        <button type="button" class="btn ghost sm" id="rdc-bon-pdf">Imprimer</button>
      </div>`}
      ${dev && existant.statut === 'signe' ? `<div class="rdc-statut"><span class="muted small">Travaux faits</span>
        ${suite
          ? `<span class="chip green">Facturés — ${esc(suite.numero || 'brouillon')}</span>
             <button type="button" class="btn ghost sm" id="rdc-voir-facture">Ouvrir la facture</button>`
          : '<button type="button" class="btn sm" id="rdc-facturer">Établir la facture</button>'}
      </div>` : ''}` : ''}

      <div class="rdc-pied">
        <div class="rdc-totaux">
          <span class="rdc-nb">${nbChoisies} ligne${nbChoisies > 1 ? 's' : ''}</span>
          <span>HT <b data-total="ht">${euros(t.ht)}</b></span>
          <span>TVA ${String(etat.tva_taux).replace('.', ',')} % <b data-total="tva">${euros(t.tva)}</b></span>
          <span class="rdc-ttc">TTC <b data-total="ttc">${euros(t.ttc)}</b></span>
        </div>
        <div class="rdc-boutons">
          <button type="button" class="btn ghost" data-close>Fermer</button>
          ${signe ? '' : '<button type="button" class="btn ghost" id="rdc-enregistrer">Enregistrer</button>'}
          ${signe ? '' : `<button type="button" class="btn ghost" id="rdc-signer">${esc(G.signer)}</button>`}
          <button type="button" class="btn ghost" id="rdc-mail">Envoyer par mail</button>
          <button type="button" class="btn" id="rdc-pdf">${signe ? 'Imprimer le PDF' : 'Enregistrer et PDF'}</button>
        </div>
      </div>`;
    lier();
  };

  // ------------------------------------------------ la signature sur place
  /**
   * Le client signe au doigt, sur le téléphone de Franck, à la fin de
   * l'intervention (29/10/2026, Élodie : « je voudrais que le client signe sur
   * place »).
   *
   * ⚠ ELLE REMPLACE LE CONTENU DE LA FENÊTRE, ELLE N'EN OUVRE PAS UNE AUTRE.
   * Deux fenêtres superposées partagent `closeModal` et se ferment mal ; et
   * surtout, on tend le téléphone au client : il ne doit rien y avoir d'autre
   * à l'écran que ce qu'il signe.
   *
   * ⚠ SIGNER ÉMET LA FACTURE. Le passage en `signe` lui donne son numéro
   * définitif et verrouille son contenu. On enregistre donc AVANT d'ouvrir le
   * tracé — sinon le client signerait une version qui n'est pas celle qui
   * partira.
   */
  const faireSigner = () => {
    posePadSignature(hote, {
      // ⚠ CE QU'ON LIT AU CLIENT N'EST PAS LA MÊME CHOSE DANS LES DEUX CAS, et
      // c'est tout l'objet de sa signature : sur une facture il reconnaît des
      // travaux FAITS, sur un devis il accepte un prix AVANT qu'ils ne
      // commencent. Lui faire reconnaître des travaux exécutés au premier
      // rendez-vous n'aurait aucune valeur — et serait faux.
      aide: dev
        ? `Signature de <b>${esc(x.nom || 'la personne présente')}</b>. Signer vaut acceptation du `
          + 'devis et des prix indiqués, avant l’exécution des travaux.'
        : `Signature de <b>${esc(x.nom || 'la personne présente')}</b>. Signer vaut reconnaissance `
          + 'que les prestations facturées ont été exécutées, et acceptation sans réserve.',
      nom: x.nom || '',
      surAnnuler: () => redessiner(),
      surValider: async ({ image, nom }) => {
        existant = await signerSurPlace(existant, { signature: image, signe_par: nom });
        toast(`${G.label} ${existant.numero || ''} ${dev ? 'accepté' : 'signée'}`);
        if (!dev && !bonRempli(existant)) { proposerLeBon(); return; }
        closeModal(true);
        ouvrirDevisCrm(x, existant, retour);
      },
    });
  };

  /**
   * Juste après la signature de la facture : on propose le bon d'attachement.
   *
   * ⚠ C'EST LE SEUL MOMENT OÙ LE CLIENT EST ENCORE LÀ (02/11/2026, Élodie, en
   * réponse à « faut-il aussi le proposer après la signature ? » : « oui,
   * enchaîner »). Le bon se signe à deux ; rempli le soir, de mémoire, il perd
   * la signature du client et la moitié de ce qu'il doit constater — et c'est
   * exactement le document qu'on ressort quand des heures sont contestées.
   *
   * ⚠ « PLUS TARD » EXISTE, ET SANS PÉNALITÉ. Enchaîner d'autorité sur un
   * formulaire de trente champs, sur un téléphone, devant un client pressé,
   * ferait fermer la fenêtre — et la fermer ici fermait aussi la facture.
   */
  function proposerLeBon() {
    m.querySelector('.modal-head h2').textContent = `${G.label} ${existant.numero || ''} signée`;
    hote.innerHTML = `
      <div class="rdc-apres">
        <p class="rdc-apres-titre">✓ ${esc(G.label)} ${esc(existant.numero || '')} signée</p>
        <p class="rdc-aide">Le client est encore là : son <b>bon d’attachement</b> se remplit et se
        signe maintenant. Il constate les heures passées et les fournitures posées — c’est la pièce
        qu’on ressort si elles sont contestées.</p>
        <div class="form-actions">
          <button type="button" class="btn ghost" id="rdc-apres-tard">Plus tard</button>
          <button type="button" class="btn" id="rdc-apres-bon">Remplir le bon ▸</button>
        </div>
      </div>`;
    hote.querySelector('#rdc-apres-tard').onclick = () => {
      closeModal(true);
      ouvrirDevisCrm(x, existant, retour);
    };
    hote.querySelector('#rdc-apres-bon').onclick = async () => {
      const { ouvrirBonAttachement } = await import('./rgd-bon-attachement.js');
      closeModal(true);
      ouvrirBonAttachement(x, existant, () => {
        ouvrirDevisCrm(x, db.byId('rgd_devis_crm', existant.id) || existant, retour);
      });
    };
  }

  /**
   * Le client signe le BON D'ATTACHEMENT — pas la facture.
   *
   * ⚠ DEUX SIGNATURES, DEUX DOCUMENTS. La mention qu'on lui lit n'est pas la
   * même : ici il reconnaît les TEMPS PASSÉS et les FOURNITURES posées, pas une
   * somme à payer. C'est ce document qu'on ressort si les heures sont
   * contestées, et une signature recopiée de la facture n'y servirait à rien.
   */
  const faireSignerBon = () => {
    posePadSignature(hote, {
      aide: 'Signature de <b>' + esc(x.nom || 'la personne présente') + '</b> sur le <b>bon d’attachement</b>. '
        + 'Signer vaut reconnaissance des temps passés et des fournitures posées.',
      nom: x.nom || '',
      surAnnuler: () => redessiner(),
      surValider: async ({ image, nom }) => {
        existant = await signerBonAttachement(existant, { signature: image, nom });
        toast('Bon d’attachement signé');
        closeModal(true);
        ouvrirDevisCrm(x, existant, retour);
      },
    });
  };

  // Redessiner sans faire sauter la page : la fenêtre garde sa position.
  const conteneurs = () => [m, m.querySelector('.modal-body'), document.getElementById('modal')].filter(Boolean);
  const redessiner = (puis) => {
    const pos = conteneurs().map(c => c.scrollTop);
    dessine();
    conteneurs().forEach((c, k) => { c.scrollTop = pos[k]; });
    puis?.();
  };

  // Ce qui est dans les champs passe dans `etat` sans redessiner : on ne perd
  // ni le curseur ni ce qu'on est en train de taper.
  const lire = () => {
    etat.objet = hote.querySelector('#rdc-objet')?.value ?? etat.objet;
    etat.notes = hote.querySelector('#rdc-notes')?.value ?? etat.notes;
  };

  const majTotaux = () => {
    const t = totaux(etat.lignes, etat.tva_taux);
    hote.querySelector('[data-total="ht"]').textContent = euros(t.ht);
    hote.querySelector('[data-total="tva"]').textContent = euros(t.tva);
    hote.querySelector('[data-total="ttc"]').textContent = euros(t.ttc);
  };

  // On met le curseur dans la quantité de ce qu'on vient d'ajouter : c'est
  // le prochain geste, et il est sous les yeux.
  const viser = (i) => {
    const champ = hote.querySelector(`.rdc-saisie[data-i="${i}"] [data-champ="${etat.lignes[i]?.code ? 'quantite' : 'libelle'}"]`);
    if (!champ) return;
    champ.focus({ preventScroll: true });
    if (champ.select) champ.select();
    // ⚠ PAS DE `scrollIntoView` : il ignore le pied collant, et la rangée
    // ouverte finissait dessous (mesuré : 85 px masqués). On fait défiler la
    // fenêtre juste de quoi la montrer au-dessus du pied.
    const rangee = champ.closest('.rdc-presta');
    const pied = hote.querySelector('.rdc-pied');
    // Ce qui défile n'est pas le même partout : le fond de la fenêtre sur
    // ordinateur, son corps sur téléphone (mobile.css). On prend le premier
    // parent qui défile vraiment.
    let defile = rangee?.parentElement;
    while (defile && !(/(auto|scroll)/.test(getComputedStyle(defile).overflowY) && defile.scrollHeight > defile.clientHeight)) defile = defile.parentElement;
    if (!rangee || !pied || !defile) return;
    const bas = rangee.getBoundingClientRect().bottom - pied.getBoundingClientRect().top + 12;
    const haut = rangee.getBoundingClientRect().top - defile.getBoundingClientRect().top - 12;
    if (bas > 0) defile.scrollTop += Math.min(bas, Math.max(0, haut));
  };

  const ajouter = (code) => {
    lire();
    // Toucher une AUTRE prestation annule la question en cours : on n'a pas
    // répondu, on est passé à autre chose.
    if (aRetirer && aRetirer !== code) aRetirer = null;
    if (!code) {
      etat.lignes.push({ code: null, metier: null, libelle: '', precision: '', variante: null, unite: 'forfait', quantite: 1, prix_ht: 0 });
      const i = etat.lignes.length - 1;
      return redessiner(() => viser(i));
    }
    const existante = etat.lignes.findIndex(l => l.code === code);
    if (existante >= 0) {
      // Déjà cochée : le second appui la retire. On ne demande que si quelque
      // chose y a été saisi — sinon ce serait un obstacle pour rien.
      if (!estIntacte(etat.lignes[existante]) && aRetirer !== code) {
        aRetirer = code;
        return redessiner();
      }
      aRetirer = null;
      etat.lignes.splice(existante, 1);
      return redessiner();
    }
    const grille = tarifsDe(etat.metier);
    const t = grille.find(g => g.code === code);
    if (!t) return;
    etat.lignes.push(ligneDepuisTarif(t, { surface }));
    const i = etat.lignes.length - 1;
    for (const autre of t.ajoute_aussi || []) {
      const a = grille.find(g => g.code === autre);
      if (a && !etat.lignes.some(l => l.code === autre)) etat.lignes.push(ligneDepuisTarif(a, { surface }));
    }
    redessiner(() => viser(i));
  };

  const verifier = () => {
    lire();
    if (!etat.lignes.length) return 'Choisissez au moins une prestation';
    for (const l of etat.lignes) {
      if (!String(l.libelle || '').trim()) return 'Une ligne libre n’a pas de désignation';
      if (!(Number(l.quantite) > 0)) return `« ${l.libelle} » : la quantité doit être supérieure à zéro`;
      const mini = plancher(l);
      if (mini && Number(l.prix_ht) < mini) return `« ${l.libelle} » : la grille ne descend pas sous ${euros(mini)} HT`;
    }
    return null;
  };

  const enregistrer = async () => {
    const motif = verifier();
    if (motif) { toast(motif, 'error'); return null; }
    try {
      const d = await enregistrerDevisCrm(x, etat, existant);
      existant = d;
      toast(`${G.label} ${d.numero || '(brouillon)'} ${dev ? 'enregistré' : 'enregistrée'}`);
      return d;
    } catch (e) {
      toast(e.message || 'Enregistrement impossible', 'error');
      return null;
    }
  };

  const imprimer = async (d) => {
    try {
      const mod = await import('./rgd-documents.js');
      mod.imprimerDevisCrm(x, d);
    } catch (e) {
      toast(e.message || 'Impression impossible', 'error');
    }
  };

  function lier() {
    hote.querySelectorAll('[data-tarif]').forEach(b => b.onclick = () => ajouter(b.dataset.tarif));
    hote.querySelector('#rdc-metier')?.addEventListener('change', (e) => { lire(); etat.metier = e.target.value; redessiner(); });
    hote.querySelector('#rdc-tva')?.addEventListener('change', (e) => { etat.tva_taux = Number(e.target.value); lire(); redessiner(); });
    hote.querySelector('#rdc-validite')?.addEventListener('change', (e) => { etat.validite_jours = Number(e.target.value); });
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      lire(); etat.lignes.splice(Number(b.dataset.retirer), 1); redessiner();
    });
    hote.querySelectorAll('.rdc-saisie[data-i]').forEach(bloc => {
      const l = etat.lignes[Number(bloc.dataset.i)];
      const total = bloc.querySelector('.rdc-total');
      const recompter = () => { total.textContent = euros(totalLigne(l)); majTotaux(); };
      bloc.querySelectorAll('[data-champ]').forEach(c => {
        const champ = c.dataset.champ;
        if (champ === 'variante') {
          c.onchange = () => {
            const t = tarifsDe(l.metier || etat.metier).find(g => g.code === l.code);
            const v = (t?.variantes || []).find(y => y.libelle === c.value);
            l.variante = c.value;
            if (v) {
              l.prix_ht = Number(v.prix_ht);
              bloc.querySelector('[data-champ="prix_ht"]').value = l.prix_ht;
              const p = bloc.querySelector('.rdc-plancher');
              if (p) { p.textContent = `minimum ${euros(l.prix_ht)}`; p.classList.remove('rdc-alerte'); }
            }
            recompter();
          };
          return;
        }
        c.oninput = () => {
          l[champ] = c.value;
          if (champ === 'quantite' || champ === 'prix_ht') recompter();
          if (champ === 'libelle') {
            const nom = bloc.closest('.rdc-presta')?.querySelector('.rdc-presta-nom');
            if (nom) nom.textContent = c.value || 'Ligne libre';
          }
        };
        // Le plancher se signale en quittant le champ, pas à chaque chiffre
        // tapé : « 1 » en route vers « 150 » n'est pas une erreur.
        if (champ === 'prix_ht') c.onchange = () => {
          const mini = plancher(l);
          bloc.querySelector('.rdc-plancher')?.classList.toggle('rdc-alerte', !!mini && Number(l.prix_ht) < mini);
        };
      });
    });
    hote.querySelectorAll('[data-statut]').forEach(b => b.onclick = async () => {
      if (!existant || b.dataset.statut === existant.statut) return;
      try {
        existant = await changerStatutDevisCrm(existant, b.dataset.statut);
        toast(`${G.label} ${existant.numero || ''} : ${statutDoc(existant).label.toLowerCase()}`);
        closeModal(true);
        ouvrirDevisCrm(x, existant, retour);
      } catch (e) { toast(e.message || 'Changement impossible', 'error'); }
    });
    const suppr = hote.querySelector('#rdc-suppr');
    if (suppr) suppr.onclick = async () => {
      if (!confirmerSuppr) { lire(); confirmerSuppr = true; redessiner(); return; }
      try {
        await supprimerDevisCrm(existant);
        toast(`Brouillon ${existant.numero || ''} supprimé`);
        closeModal();
      } catch (e) { toast(e.message || 'Suppression impossible', 'error'); }
    };
    const bEnr = hote.querySelector('#rdc-enregistrer');
    if (bEnr) bEnr.onclick = async () => {
      const d = await enregistrer();
      if (d) { closeModal(true); ouvrirDevisCrm(x, d, retour); }
    };
    // ⚠ MARQUER RÉGLÉE CHANGE LE DOCUMENT, PAS SEULEMENT UNE ÉTIQUETTE : la
    // facture perd son échéance et ses pénalités et porte « acquittée ». On
    // redéploie donc la fenêtre pour que le PDF suivant parte à jour.
    const bReglOn = hote.querySelector('#rdc-regl-on');
    if (bReglOn) bReglOn.onclick = async () => {
      bReglOn.disabled = true;
      try {
        existant = await marquerReglee(existant, hote.querySelector('#rdc-regl-moyen').value);
        toast('Facture marquée réglée');
        redessiner();
      } catch (e) {
        bReglOn.disabled = false;
        toast(e.message || 'Non enregistré', 'error');
      }
    };
    const bReglOff = hote.querySelector('#rdc-regl-off');
    if (bReglOff) bReglOff.onclick = async () => {
      bReglOff.disabled = true;
      try {
        existant = await annulerReglement(existant);
        toast('Règlement annulé — la facture redevient due');
        redessiner();
      } catch (e) {
        bReglOff.disabled = false;
        toast(e.message || 'Non enregistré', 'error');
      }
    };
    const bBonPdf = hote.querySelector('#rdc-bon-pdf');
    if (bBonPdf) bBonPdf.onclick = async () => {
      try {
        const mod = await import('./rgd-documents.js');
        mod.imprimerBonAttachement(x, existant);
      } catch (e) {
        toast(e.message || 'Impression impossible', 'error');
      }
    };
    const bBonSign = hote.querySelector('#rdc-bon-signer');
    if (bBonSign) bBonSign.onclick = () => faireSignerBon();
    const bAnnul = hote.querySelector('#rdc-annuler');
    if (bAnnul) bAnnul.onclick = () => { lire(); demandeAnnulation = true; redessiner(() => {
      const c = hote.querySelector('#rdc-annul-motif'); c?.focus();
    }); };
    const bAnnulNon = hote.querySelector('#rdc-annul-non');
    if (bAnnulNon) bAnnulNon.onclick = () => { demandeAnnulation = false; motifAnnulation = ''; redessiner(); };
    const champMotif = hote.querySelector('#rdc-annul-motif');
    // Le motif est retenu hors du champ : le moindre redessin le perdrait.
    if (champMotif) champMotif.oninput = () => { motifAnnulation = champMotif.value; };
    const bAnnulOk = hote.querySelector('#rdc-annul-ok');
    if (bAnnulOk) bAnnulOk.onclick = async () => {
      const motif = (hote.querySelector('#rdc-annul-motif')?.value || '').trim();
      if (!motif) { toast('Dites pourquoi : le motif s’imprime sur la facture', 'error'); return; }
      bAnnulOk.disabled = true;
      try {
        existant = await annulerFacture(existant, motif);
        demandeAnnulation = false; motifAnnulation = '';
        toast(`Facture ${existant.numero || ''} annulée`);
        closeModal(true);
        ouvrirDevisCrm(x, existant, retour);
      } catch (e) {
        bAnnulOk.disabled = false;
        toast(e.message || 'Annulation impossible', 'error');
      }
    };
    const bRetablir = hote.querySelector('#rdc-retablir');
    if (bRetablir) bRetablir.onclick = async () => {
      bRetablir.disabled = true;
      try {
        existant = await retablirFacture(existant);
        toast(`Facture ${existant.numero || ''} rétablie`);
        closeModal(true);
        ouvrirDevisCrm(x, existant, retour);
      } catch (e) {
        bRetablir.disabled = false;
        toast(e.message || 'Rétablissement impossible', 'error');
      }
    };
    // ⚠ ON RELIT LA FACTURE AU RETOUR. Le bon enregistre sa saisie dans la
    // même ligne ; revenir avec la copie qu'on tenait AVANT afficherait
    // « Vierge » sur un bon qu'on vient de remplir.
    const bBonRemplir = hote.querySelector('#rdc-bon-remplir');
    if (bBonRemplir) bBonRemplir.onclick = async () => {
      const { ouvrirBonAttachement } = await import('./rgd-bon-attachement.js');
      closeModal(true);
      ouvrirBonAttachement(x, existant, () => {
        ouvrirDevisCrm(x, db.byId('rgd_devis_crm', existant.id) || existant, retour);
      });
    };
    const bSign = hote.querySelector('#rdc-signer');
    if (bSign) bSign.onclick = async () => {
      const d = await enregistrer();
      if (d) { existant = d; faireSigner(); }
    };
    // ⚠ ON QUITTE LE DEVIS POUR OUVRIR LA FACTURE NEUVE : elle naît en
    // brouillon, et c'est là qu'il faut corriger les écarts du chantier avant
    // de l'émettre. Laisser le devis ouvert aurait fait croire que la facture
    // est déjà prête.
    const bFacturer = hote.querySelector('#rdc-facturer');
    if (bFacturer) bFacturer.onclick = async () => {
      bFacturer.disabled = true;
      try {
        const f = await facturerLeDevis(existant);
        toast(`Facture établie depuis le devis ${existant.numero || ''} — à vérifier avant l’envoi`);
        closeModal(true);
        ouvrirDevisCrm(x, f, retour);
      } catch (e) {
        bFacturer.disabled = false;
        toast(e.message || 'Facture non établie', 'error');
      }
    };
    const bVoirFacture = hote.querySelector('#rdc-voir-facture');
    if (bVoirFacture) bVoirFacture.onclick = () => {
      const f = factureSuite();
      if (!f) { toast('Facture introuvable', 'error'); return; }
      closeModal(true);
      ouvrirDevisCrm(x, f, retour);
    };
    hote.querySelector('#rdc-mail').onclick = async () => {
      const d = signe ? existant : await enregistrer();
      if (d) ouvrirEnvoi(d);
    };
    hote.querySelector('#rdc-pdf').onclick = async () => {
      const d = signe ? existant : await enregistrer();
      if (!d) return;
      imprimer(d);
      closeModal(true);
      ouvrirDevisCrm(x, d, retour);
    };
  }

  // ⚠ L'ENVOI SE PRÉPARE DANS LA MÊME FENÊTRE (29/10/2026, Élodie : « un
  // bouton pour envoyer directement le devis par mail »). Destinataire, objet
  // et message sont pré-remplis et se corrigent ; le PDF est fabriqué au
  // moment d'envoyer, depuis le devis ENREGISTRÉ — ce qui part est ce qui est
  // en base, numéro compris.
  async function ouvrirEnvoi(d) {
    const docs = await import('./rgd-documents.js');
    const qui = docs.donneesDocument(x);
    // Une annulée s'annonce pour ce qu'elle est : le client reçoit une
    // seconde fois le même numéro, et l'objet doit dire pourquoi.
    const sujet = estAnnulee(d)
      ? `Annulation de la facture RGD Renova n° ${d.numero || ''}`
      : `Votre ${dev ? 'devis' : 'facture'} RGD Renova n° ${d.numero || ''}`;
    m.querySelector('.modal-head h2').textContent = `Envoyer ${dev ? 'le devis' : 'la facture'} ${d.numero || ''}`;
    hote.innerHTML = `
      <p class="rdc-aide">${dev ? 'Le devis' : 'La facture'} part en <b>pièce jointe PDF</b>, depuis contact@rgdrenova.fr. La réponse du client arrive à la même adresse.</p>
      <div class="form">
        <div class="field"><label>Destinataire</label>
          <input id="rdc-a" type="email" value="${esc(qui.email || '')}" placeholder="adresse@client.fr" required></div>
        <div class="field"><label>Objet</label>
          <input id="rdc-objet-mail" value="${esc(sujet)}"></div>
        <div class="field"><label>Message</label>
          <textarea id="rdc-message" rows="11">${esc(messageDevisCrm(d, qui.nom))}</textarea></div>
        <div class="field"><label class="check"><input type="checkbox" id="rdc-copie" checked> Garder une copie à contact@rgdrenova.fr</label></div>
      </div>
      <p class="small muted">Pièce jointe : <b>${esc(G.label)} ${esc(d.numero || '')}</b> — ${euros(d.montant_ttc)} TTC.</p>
      <div class="rdc-pied">
        <div class="rdc-totaux"><span>${d.statut === 'brouillon' ? `${dev ? 'Le devis' : 'La facture'} passera en <b>${esc(STATUTS.envoye.label)}</b>.` : ''}</span></div>
        <div class="rdc-boutons">
          <button type="button" class="btn ghost" id="rdc-retour">← Retour ${dev ? 'au devis' : 'à la facture'}</button>
          <button type="button" class="btn" id="rdc-envoyer">Envoyer</button>
        </div>
      </div>`;
    hote.querySelector('#rdc-a').focus();
    hote.querySelector('#rdc-retour').onclick = () => { closeModal(true); ouvrirDevisCrm(x, d, retour); };
    const bouton = hote.querySelector('#rdc-envoyer');
    bouton.onclick = async () => {
      const a = hote.querySelector('#rdc-a').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { toast('Adresse mail du client invalide', 'error'); return; }
      bouton.disabled = true; bouton.textContent = 'Envoi…';
      try {
        const pdf = await docs.pdfDevisCrm(x, d);
        const r = await envoyerDevisCrm(d, {
          a, nom: qui.nom,
          objet: hote.querySelector('#rdc-objet-mail').value.trim() || sujet,
          message: hote.querySelector('#rdc-message').value,
          copie: hote.querySelector('#rdc-copie').checked,
        }, pdf);
        if (!r.ok) throw new Error(r.motif);
        toast(`${G.label} ${d.numero || ''} ${dev ? 'envoyé' : 'envoyée'} à ${a}`);
        closeModal();
      } catch (e) {
        bouton.disabled = false; bouton.textContent = 'Envoyer';
        toast(`Non envoyé — ${String(e.message || e).slice(0, 140)}`, 'error');
      }
    };
  }

  dessine();
}

/**
 * Le choix qui s'ouvre sous « + Factures » (02/11/2026, Élodie : « je voudrais
 * que tu transformes en "+ factures" et avoir la possibilité d'importer une
 * facture qui n'a pas été reliée avec Costructor »).
 *
 * ⚠ UNE FENÊTRE, PAS UN MENU FLOTTANT : la fiche EST déjà une fenêtre, et
 * `openModal` ferme la courante avant d'ouvrir la suivante. Un menu posé en
 * absolu dans la fiche aurait été coupé par son défilement, et il n'y a dans
 * ce dépôt aucun composant de menu flottant à reprendre — en écrire un pour
 * deux entrées serait une pièce de plus à tenir.
 *
 * ⚠ LE RETOUR EST PASSÉ AUX DEUX CHEMINS, PAS SEULEMENT AU CHOIX : chacun
 * ouvre sa propre fenêtre, donc ferme celle-ci sans déclencher son `onClose`
 * (c'est `closeModal(true)`, la fermeture pour remplacement). Sans cela, la
 * fiche ne se reconstruirait plus en sortant du formulaire.
 */
export function choisirFacture(x, retour = null) {
  const m = openModal('Nouveau document', `
    <div class="rdc-choix">
      <button type="button" class="btn" id="rdc-creer">+ Créer une facture</button>
      <p class="small muted">${esc(GENRES.facture.aide)} Depuis la grille des tarifs : on touche les
      prestations, le CRM calcule et sort le PDF. Elle porte « acquittée » dès qu’on la marque réglée.</p>
      <button type="button" class="btn ghost" id="rdc-devis">+ Créer un devis</button>
      <p class="small muted">${esc(GENRES.devis.aide)} Même grille, même PDF, mais il annonce un prix
      au lieu de réclamer une somme. La facture se fera à la fin des travaux, depuis ce devis.</p>
      ${peutImporterFacture() ? `<button type="button" class="btn ghost" id="rdc-importer">↑ Importer une facture</button>
      <p class="small muted">Une facture faite ailleurs — Costructor, le comptable. On dépose
      son PDF et son montant ; elle garde son numéro d’origine.</p>` : ''}
    </div>`, { onClose: () => retour?.() });
  m.querySelector('#rdc-creer').onclick = () => ouvrirDevisCrm(x, null, retour, 'facture');
  m.querySelector('#rdc-devis').onclick = () => ouvrirDevisCrm(x, null, retour, 'devis');
  const imp = m.querySelector('#rdc-importer');
  if (imp) imp.onclick = () => ouvrirImportFacture(x, retour);
}

/** Ce que dit le bouton, qui ouvre toujours un choix depuis le 02/11. */
export const libelleBoutonFacture = () => '+ Facture ou devis';

/** Qui peut faire un devis : toute personne de RGD, dès qu'une grille existe. */
export const peutFaireDevisCrm = () => scope.activityKeys.includes('rgd') && metiersAvecGrille().length > 0;
