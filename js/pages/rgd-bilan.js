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
// pourcentages sous chaque cellule. NE PAS les remettre ici : les objectifs ont
// leur carte au-dessus, et le bilan ne fait que reprendre le document
// comptable (devis, signatures, montants, CA facturé).
//
// ⚠ PAS DE NOUVEAU STYLE : c'est le `table` générique du CRM (`td.num`,
// `.table-wrap` qui défile sur téléphone).
import { esc, eur } from '../ui.js';
import { bilanCommercial } from '../data/rgd-bilan.js';

const nombre = (v) => (v === null || v === undefined ? '—' : String(v));
const pourcent = (v) => (v === null || v === undefined ? '—'
  : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const euros = (v) => (v === null || v === undefined ? '—' : eur(v));
const SOUS = 'text-transform:none;letter-spacing:0;font-weight:500';

const LIGNES = [
  { titre: 'Devis envoyés', v: e => nombre(e.envoyes) },
  { titre: 'Devis signés', v: e => nombre(e.signes) },
  { titre: 'Taux de signature', v: e => pourcent(e.tauxSignature) },
  { titre: 'Montant des devis HT', v: e => euros(e.montantDevis) },
  { titre: 'Montant moyen par devis HT', v: e => euros(e.moyenDevis) },
  { titre: 'CA facturé HT', v: e => euros(e.ca), fort: true },
];

export function carteBilan(aujourdhui = new Date()) {
  const b = bilanCommercial(aujourdhui);
  if (!b) return '';
  const { exercices, total } = b;

  const gras = (l, t) => (l.fort ? `<b>${t}</b>` : t);
  const entete = exercices.map(e => `<th class="num">${esc(e.label)}<div class="small muted" style="${SOUS}">${
    e.enCours ? `en cours · ${e.nbMois} mois` : 'clos'}</div></th>`).join('');
  const corps = LIGNES.map(l => `<tr>
      <td>${gras(l, esc(l.titre))}</td>
      ${exercices.map(e => `<td class="num">${gras(l, l.v(e))}</td>`).join('')}
      <td class="num" style="background:var(--card-2)"><b>${l.v(total)}</b></td>
    </tr>`).join('');

  const closCrm = exercices.filter(e => !e.enCours && e.source === 'crm');

  return `
        <section class="card rgd-bilan">
          <div class="card-head"><h2>Bilan commercial</h2>
            <span class="grow"></span>
            <span class="muted small">exercices du 1<sup>er</sup> octobre au 30 septembre</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Indicateur</th>${entete}<th class="num">Depuis la création</th></tr></thead>
            <tbody>${corps}</tbody>
          </table></div>
          <p class="small muted" style="margin:10px 0 0">
            Exercices clos : chiffres du bilan${closCrm.length
              ? ` (${closCrm.map(e => esc(e.label)).join(', ')} : calcul du CRM, faute de bilan saisi)` : ''}.
            Exercice en cours : calculé en direct, devis réellement envoyés seulement.
            Les devis se comptent un par un, comme dans le bilan : un client qui a deux devis en compte deux.
          </p>
        </section>`;
}
