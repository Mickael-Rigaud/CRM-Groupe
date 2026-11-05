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

// ⚠ DEUX BLOCS TITRÉS, PUIS LE CA EN DERNIER (05/11/2026, Élodie : « mets
// d'abord les devis envoyés, après les devis signés avec le panier moyen
// devis / chantier signé, et après le CA facturé HT »). Le jour même on était
// passé par l'ordre du document (CA en dernier, sans blocs) puis par le CA en
// tête : c'est cette version-ci qu'elle a fixée. « Montant des devis HT » ne
// disait pas qu'il s'agissait des devis ENVOYÉS : d'où les intertitres. Le
// libellé court (« Nombre ») ne se lit qu'avec son intertitre : ne pas sortir
// une ligne de son bloc sans lui rendre un libellé complet.
//
// ⚠ DEVIS ET CHANTIERS SONT DEUX LIGNES, et c'est le cœur de la demande : un
// chantier peut porter plusieurs devis. Le taux de signature reste en DEVIS
// (signés / envoyés, comme le bilan) ; le panier se calcule par CHANTIER.
const LIGNES = [
  { bloc: 'Devis envoyés' },
  { titre: 'Nombre de devis', champ: 'envoyes', v: nombre },
  { titre: 'Montant total HT', champ: 'montantDevis', v: euros, barre: true },
  { titre: 'Montant moyen par devis HT', champ: 'moyenDevis', v: euros },
  { bloc: 'Devis signés' },
  { titre: 'Nombre de devis', champ: 'signes', v: nombre },
  { titre: 'Nombre de chantiers', champ: 'chantiers', v: nombre, selonCrm: true },
  { titre: 'Taux de signature', champ: 'tauxSignature', v: pourcent, pastille: true },
  { titre: 'Panier moyen par chantier signé HT', champ: 'panier', v: euros, selonCrm: true, seuil: true },
  { bloc: 'Chiffre d’affaires' },
  { titre: 'CA facturé HT', champ: 'ca', v: euros, barre: true, fort: true },
];

// L'objectif de l'exercice en cours, sous sa valeur. ⚠ POUR UN VOLUME OU UN
// MONTANT, LA BARRE DIT LA PART DE L'OBJECTIF ATTEINTE, pas la comparaison aux
// autres exercices : c'est ce qu'on veut lire dans la colonne de l'année en
// cours. Pour un taux, l'objectif est un seuil, pas un total à remplir : pas
// de barre, seulement la cible.
function objectif(l, val, cible, couleur, mensuel) {
  if (l.pastille || l.seuil) return `<div class="rgd-bil-obj">objectif ${l.v(cible)}</div>`;
  const part = val > 0 && cible > 0 ? (val / cible) * 100 : 0;
  // Le mensuel sur sa ligne, l'annuel et la part atteinte sur la suivante : sur
  // une seule, « 35 000 € / mois · 420 000 € / an · 1 % » élargissait la colonne.
  return `${mensuel != null ? `<div class="rgd-bil-obj">objectif ${l.v(mensuel)} / mois</div>` : ''}
    <div class="rgd-bil-obj">${mensuel != null ? '' : 'objectif '}${l.v(cible)} / an · ${Math.round(part)} %</div>
    <span class="rgd-bil-piste"><i style="width:${Math.min(100, Math.max(part > 0 ? 2 : 0, part)).toFixed(1)}%;background:${couleur}"></i></span>`;
}

function cellule(l, e, couleur, max, cible, mensuel) {
  const val = e[l.champ];
  const texte = l.v(val);
  if (cible !== undefined && cible !== null) {
    const point = l.pastille && val != null ? `<span class="rgd-bil-point ${tonTaux(val)}"></span>` : '';
    return `${point}<span class="${l.fort ? 'rgd-bil-fort' : ''}">${texte}</span>${objectif(l, val, cible, couleur, mensuel)}`;
  }
  // Sous un chiffre tiré du CRM sur un exercice clos dont le bilan ne le donne pas.
  const selon = l.selonCrm && e.chantiersSelonCrm && val != null
    ? '<div class="rgd-bil-obj">selon le CRM</div>' : '';
  const barre = l.barre && max > 0 && val != null
    ? `<span class="rgd-bil-piste"><i style="width:${Math.max(val > 0 ? 2 : 0, (val / max) * 100).toFixed(1)}%;background:${couleur}"></i></span>` : '';
  const pastille = l.pastille && val != null ? `<span class="rgd-bil-point ${tonTaux(val)}"></span>` : '';
  return `${pastille}<span class="${l.fort ? 'rgd-bil-fort' : ''}">${texte}</span>${selon}${barre}`;
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

  const corps = LIGNES.map(l => l.bloc
    ? `<tr class="rgd-bil-bloc"><td colspan="${exercices.length + 2}">${esc(l.bloc)}</td></tr>`
    : `<tr class="${l.fort ? 'rgd-bil-ca' : 'rgd-bil-sous'}">
      <td class="rgd-bil-titre">${esc(l.titre)}</td>
      ${exercices.map((e, i) => `<td class="num">${cellule(l, e, couleurs[i], maxDe(l.champ),
        e.enCours ? objectifs?.[l.champ] : undefined,
        e.enCours ? objectifs?.mensuel?.[l.champ] : undefined)}</td>`).join('')}
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
            avec sous chaque chiffre l’objectif du mois et celui de l’exercice (douze fois le mensuel), et la part de l’objectif annuel déjà atteinte.
            Les devis se comptent un par un, comme dans le bilan ; un chantier correspond à un client, quel que soit son nombre de devis.
            Sur les exercices clos, chantiers et panier sont ceux que voit le CRM, qui n’a pas tout l’historique Costructor.
          </p>
        </section>`;
}
