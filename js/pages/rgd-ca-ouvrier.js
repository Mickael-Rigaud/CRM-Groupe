// Le chiffre d'affaires de l'ouvrier, sur sa vue d'ensemble RGD.
//
// Demandé par Élodie le 28/10/2026 : « en dessous de "mes dossiers" je veux un
// encadré "Chiffre d'affaires" qui sera relié à la facturation que l'on va
// mettre en place dans quelques jours à partir du tableau des prestations et
// des tarifs » — calculé sur le MOIS EN COURS (choisi le même jour, de
// préférence à l'exercice du 1er octobre).
//
// ⚠ LA FACTURATION N'EXISTE PAS ENCORE, ET L'ENCADRÉ LE DIT. Au 28/10/2026 il
// n'y a ni tableau des prestations, ni tarifs, ni factures d'intervention : la
// fiche projet ne porte qu'un texte libre (`intervention_electrique`, migration
// 20261028094008), fait pour céder la place au tableau. Afficher « 0 € » serait
// lu comme un mois sans travail ; on affiche ce qui est vrai — la facturation
// arrive.
//
// ⚠ LE JOUR OÙ ELLE EXISTE, C'EST ICI ET NULLE PART AILLEURS QU'ON LA BRANCHE.
// `facturesDuMois` reçoit les factures de l'ouvrier ; tant qu'aucune source
// n'existe, l'appelant passe `null` (« pas de facturation »), qui n'est pas
// `[]` (« facturation en place, rien ce mois-ci »). Les deux ne disent pas la
// même chose et ne s'affichent pas pareil.
import { esc, eur } from '../ui.js';

const MOIS = (d = new Date()) => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export function encadreCaOuvrier(facturesDuMois = null, d = new Date()) {
  const titre = `<div class="card-head"><h2>Chiffre d’affaires</h2>
      <span class="grow"></span>
      <span class="muted small">${esc(MOIS(d))}</span></div>`;
  if (facturesDuMois === null) {
    return `<section class="card rgd-ca-ouvrier">${titre}
      <div class="empty">La facturation arrive : votre chiffre d’affaires du mois
      s’affichera ici dès les premières factures établies à partir des prestations
      et de leurs tarifs.</div>
    </section>`;
  }
  const ht = facturesDuMois.reduce((t, f) => t + (Number(f.montant_ht) || 0), 0);
  return `<section class="card rgd-ca-ouvrier">${titre}
    <div class="rgd-ca-ligne"><b class="rgd-ca-montant">${esc(eur(ht))}</b><span class="muted">HT</span></div>
    <p class="small muted">${facturesDuMois.length
      ? `${facturesDuMois.length} facture${facturesDuMois.length > 1 ? 's' : ''} ce mois-ci.`
      : 'Aucune facture ce mois-ci pour le moment.'}</p>
  </section>`;
}
