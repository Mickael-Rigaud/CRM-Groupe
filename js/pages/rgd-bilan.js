// La carte « Bilan commercial » de la vue d'ensemble RGD (05/11/2026).
//
// Une ligne par indicateur, une colonne par exercice comptable (1er octobre →
// 30 septembre), puis « Depuis la création ». Les calculs vivent dans
// `data/rgd-bilan.js` — rien n'est défini ici.
//
// ⚠ SIX LIGNES, CELLES DU BILAN D'ÉLODIE, ET RIEN D'AUTRE (05/11/2026 : « le
// tableau est très complexe, je ne comprends pas tout, il faudrait plus
// simplifier les données et la colonne objectif 2026/2027 n'est pas du tout
// bonne, supprime-la »). Une première version avait onze lignes — demandes,
// rendez-vous, trois taux, panier — une colonne d'objectifs et des
// pourcentages sous chaque cellule. NE PAS les remettre ici.
//
// ⚠ LE TABLEAU EST MIS EN COULEUR, PAS REMPLACÉ (05/11/2026, Élodie : « le
// visuel est très fade », puis, entre trois maquettes — une carte par
// exercice, un bandeau à barres, le tableau en couleur — elle a choisi le
// tableau). Chaque exercice porte sa couleur en tête de colonne ; les deux
// lignes en euros ont une barre proportionnelle au plus grand exercice, pour
// que l'écart se voie avant de se lire ; le taux de signature a sa pastille.
import { esc, eur } from '../ui.js';
import { bilanCommercial } from '../data/rgd-bilan.js';

const nombre = (v) => (v === null || v === undefined ? '—' : String(v));
const pourcent = (v) => (v === null || v === undefined ? '—'
  : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const euros = (v) => (v === null || v === undefined ? '—' : eur(v));

// L'exercice en cours prend la couleur de l'espace ; les clos alternent bleu
// et vert, du plus ancien au plus récent.
const couleurDe = (e, i) => (e.enCours ? 'var(--accent)' : ['var(--blue)', 'var(--green)'][i % 2]);
// Trois paliers, comme les objectifs : on lit une couleur plus vite qu'un nombre.
const tonTaux = (v) => (v === null || v === undefined ? '' : v >= 80 ? 'vert' : v >= 50 ? 'ambre' : 'rouge');

// ⚠ L'ORDRE EST CELUI DU TABLEAU « 1. Historique des exercices » du document
// d'Élodie (05/11/2026 : « reprends l'ordre des lignes que tu retrouves dans le
// premier tableau ») : le CA facturé vient EN DERNIER, comme une conclusion.
const LIGNES = [
  { titre: 'Devis envoyés', champ: 'envoyes', v: nombre },
  { titre: 'Devis signés', champ: 'signes', v: nombre },
  { titre: 'Taux de signature', champ: 'tauxSignature', v: pourcent, pastille: true },
  { titre: 'Montant des devis HT', champ: 'montantDevis', v: euros, barre: true },
  { titre: 'Montant moyen par devis HT', champ: 'moyenDevis', v: euros },
  { titre: 'CA facturé HT', champ: 'ca', v: euros, barre: true, fort: true },
];

// L'objectif de l'exercice en cours, sous sa valeur. ⚠ POUR UN VOLUME OU UN
// MONTANT, LA BARRE DIT LA PART DE L'OBJECTIF ATTEINTE, pas la comparaison aux
// autres exercices : c'est ce qu'on veut lire dans la colonne de l'année en
// cours. Pour un taux, l'objectif est un seuil, pas un total à remplir : pas
// de barre, seulement la cible.
function objectif(l, val, cible, couleur) {
  if (l.pastille) return `<div class="rgd-bil-obj">objectif ${pourcent(cible)}</div>`;
  const part = val > 0 && cible > 0 ? (val / cible) * 100 : 0;
  return `<div class="rgd-bil-obj">objectif ${l.v(cible)} · ${Math.round(part)} %</div>
    <span class="rgd-bil-piste"><i style="width:${Math.min(100, Math.max(part > 0 ? 2 : 0, part)).toFixed(1)}%;background:${couleur}"></i></span>`;
}

function cellule(l, e, couleur, max, cible) {
  const val = e[l.champ];
  const texte = l.v(val);
  if (cible !== undefined && cible !== null) {
    const point = l.pastille && val != null ? `<span class="rgd-bil-point ${tonTaux(val)}"></span>` : '';
    return `${point}<span class="${l.fort ? 'rgd-bil-fort' : ''}">${texte}</span>${objectif(l, val, cible, couleur)}`;
  }
  const barre = l.barre && max > 0 && val != null
    ? `<span class="rgd-bil-piste"><i style="width:${Math.max(val > 0 ? 2 : 0, (val / max) * 100).toFixed(1)}%;background:${couleur}"></i></span>` : '';
  const pastille = l.pastille && val != null ? `<span class="rgd-bil-point ${tonTaux(val)}"></span>` : '';
  return `${pastille}<span class="${l.fort ? 'rgd-bil-fort' : ''}">${texte}</span>${barre}`;
}

export function carteBilan(aujourdhui = new Date()) {
  const b = bilanCommercial(aujourdhui);
  if (!b) return '';
  const { exercices, total, objectifs } = b;
  const couleurs = exercices.map(couleurDe);
  const maxDe = (champ) => Math.max(0, ...exercices.map(e => Number(e[champ]) || 0));

  const entete = exercices.map((e, i) => `<th class="num rgd-bil-ex" style="--ex:${couleurs[i]}">
      <span class="rgd-bil-nom">${esc(e.label)}</span>
      <span class="rgd-bil-etat">${e.enCours ? `en cours · ${e.nbMois} mois` : 'clos'}</span></th>`).join('');

  const corps = LIGNES.map(l => `<tr class="${l.fort ? 'rgd-bil-ca' : ''}">
      <td class="rgd-bil-titre">${esc(l.titre)}</td>
      ${exercices.map((e, i) => `<td class="num">${cellule(l, e, couleurs[i], maxDe(l.champ),
        e.enCours ? objectifs?.[l.champ] : undefined)}</td>`).join('')}
      <td class="num rgd-bil-total">${cellule({ ...l, barre: false }, total, '', 0)}</td>
    </tr>`).join('');

  const closCrm = exercices.filter(e => !e.enCours && e.source === 'crm');

  return `
        <section class="card rgd-bilan">
          <div class="card-head"><h2>Bilan commercial</h2>
            <span class="grow"></span>
            <span class="muted small">exercices du 1<sup>er</sup> octobre au 30 septembre</span></div>
          <div class="table-wrap"><table class="rgd-bil-table">
            <thead><tr><th>Indicateur</th>${entete}
              <th class="num rgd-bil-ex rgd-bil-total" style="--ex:var(--accent-ink)">
                <span class="rgd-bil-nom">Depuis la création</span><span class="rgd-bil-etat">cumul</span></th></tr></thead>
            <tbody>${corps}</tbody>
          </table></div>
          <p class="small muted rgd-bil-pied">
            Exercices clos : chiffres du bilan${closCrm.length
              ? ` (${closCrm.map(e => esc(e.label)).join(', ')} : calcul du CRM, faute de bilan saisi)` : ''}.
            Exercice en cours : calculé en direct, devis réellement envoyés à ce jour seulement (ni brouillons, ni devis en rédaction),
            avec sous chaque chiffre l’objectif de l’exercice (douze fois l’objectif mensuel).
            Les devis se comptent un par un, comme dans le bilan : un client qui a deux devis en compte deux.
          </p>
        </section>`;
}
