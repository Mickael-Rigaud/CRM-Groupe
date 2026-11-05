// La carte « Bilan commercial » de la vue d'ensemble RGD (05/11/2026).
//
// Les calculs vivent dans `data/rgd-bilan.js` — rien n'est défini ici.
//
// ⚠ QUATRE COMPTEURS POUR L'EXERCICE EN COURS, L'HISTORIQUE EN PETIT DESSOUS
// (05/11/2026). La carte répond à UNE question, celle qu'Élodie a choisie :
// « où j'en suis cette année ». Avant d'arriver ici on est passé par un tableau
// à onze lignes, un tableau en couleur avec intertitres, puis un parcours en
// entonnoir — tous refusés (« beaucoup d'infos qui se mélangent », « je ne
// trouve pas cela intuitif »). Le défaut commun : résultats passés, chiffres en
// direct et objectifs dans la même grille. Ici, les objectifs ne vivent que
// dans les tuiles de l'année ; les années closes sont dessous, dans un petit
// tableau à part, sans objectif ni barre (« en 2024/2025 et 2025/2026 il n'y
// avait pas d'objectif »). NE PAS remettre l'année en cours dans ce tableau.
//
// ⚠ « CLIENTS SIGNATAIRES », PAS « CHANTIERS » : « chantiers » se lisait comme
// des chantiers EN COURS. Un client qui signe plusieurs devis compte une fois.
// Elle a demandé de GARDER clients signataires et panier moyen par client.
import { esc, eur } from '../ui.js';
import { bilanCommercial } from '../data/rgd-bilan.js';

const vide = (v) => v === null || v === undefined;
const nombre = (v) => (vide(v) ? '—' : String(v));
const pourcent = (v) => (vide(v) ? '—'
  : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const euros = (v) => (vide(v) ? '—' : eur(v));
// Trois paliers : on lit une couleur plus vite qu'un nombre.
const tonTaux = (v) => (vide(v) ? '' : v >= 80 ? 'vert' : v >= 50 ? 'ambre' : 'rouge');

function jauge(val, cible) {
  const part = val > 0 && cible > 0 ? (val / cible) * 100 : 0;
  return `<span class="rgd-bil-piste" title="${Math.round(part)} % de l’objectif de l’année"><i style="width:${Math.min(100, Math.max(part > 0 ? 2 : 0, part)).toFixed(1)}%"></i></span>`;
}

function tuile(titre, gros, sur, bas) {
  return `<div class="rgd-bil-tuile">
      <div class="rgd-bil-lib">${titre}</div>
      <div class="rgd-bil-gros">${gros}</div>
      ${sur}
      ${bas ? `<div class="rgd-bil-bas">${bas}</div>` : ''}
    </div>`;
}

// « sur 120 cette année » et la jauge ; rien si l'objectif n'est pas réglé.
const surObjectif = (val, cible, format) => (vide(cible) ? ''
  : `<div class="rgd-bil-sur">sur ${format(cible)} cette année</div>${jauge(val, cible)}`);

// Le petit tableau des années passées (Élodie l'a choisi parmi trois : carte
// par année, tableau simple, barres côte à côte). Années en colonnes, cumul en
// dernier, AUCUNE barre ni objectif : les objectifs n'existaient pas alors.
const LIGNES_PASSE = [
  ['Devis envoyés', (e) => nombre(e.envoyes)],
  ['Devis signés', (e) => (vide(e.signes) ? '—' : `${e.signes} <span class="muted">(${pourcent(e.tauxSignature)})</span>`)],
  ['Clients signataires', (e) => `${nombre(e.chantiers)}${e.chantiersSelonCrm && !vide(e.chantiers) ? '<sup>*</sup>' : ''}`],
  ['Panier moyen par client HT', (e) => `${euros(e.panier)}${e.chantiersSelonCrm && !vide(e.panier) ? '<sup>*</sup>' : ''}`],
  ['CA facturé HT', (e) => `<b>${euros(e.ca)}</b>`],
];

function tableauPasse(clos, total) {
  const cols = [...clos.map(e => [e.label, e]), ['Depuis la création', total]];
  return `<div class="table-wrap"><table class="rgd-bil-table">
      <thead><tr><th></th>${cols.map(([nom], i) => `<th class="num${i === cols.length - 1 ? ' rgd-bil-total' : ''}">${esc(nom)}</th>`).join('')}</tr></thead>
      <tbody>${LIGNES_PASSE.map(([titre, f]) => `<tr><td class="rgd-bil-titre">${titre}</td>${cols.map(([, e], i) => `<td class="num${i === cols.length - 1 ? ' rgd-bil-total' : ''}">${f(e)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

export function carteBilan(aujourdhui = new Date()) {
  const b = bilanCommercial(aujourdhui);
  if (!b) return '';
  const { exercices, total, objectifs: o = {} } = b;
  const ec = exercices.find(e => e.enCours);
  const clos = exercices.filter(e => !e.enCours);
  const selonCrm = clos.some(e => e.chantiersSelonCrm) || total.chantiersSelonCrm;

  const tuiles = ec ? `
          <div class="rgd-bil-annee"><b>${esc(ec.label)}</b> · en cours depuis ${ec.nbMois} mois</div>
          <div class="rgd-bil-tuiles">
            ${tuile('Devis envoyés', nombre(ec.envoyes), surObjectif(ec.envoyes, o.envoyes, nombre),
              vide(ec.montantDevis) ? '' : `${euros(ec.montantDevis)} HT`)}
            ${tuile('Devis signés', nombre(ec.signes),
              vide(ec.tauxSignature) ? '' : `<div class="rgd-bil-sur"><span class="rgd-bil-point ${tonTaux(ec.tauxSignature)}"></span>${pourcent(ec.tauxSignature)} des devis envoyés</div>`,
              vide(o.tauxSignature) ? '' : `objectif ${pourcent(o.tauxSignature)}`)}
            ${tuile('Clients signataires', nombre(ec.chantiers), surObjectif(ec.chantiers, o.chantiers, nombre),
              vide(ec.panier) ? '' : `panier moyen ${euros(ec.panier)} HT${vide(o.panier) ? '' : ` · objectif ${euros(o.panier)}`}`)}
            ${tuile('CA facturé HT', euros(ec.ca), surObjectif(ec.ca, o.ca, euros), '')}
          </div>` : '';

  return `
        <section class="card rgd-bilan">
          <div class="card-head"><h2>Bilan commercial</h2>
            <span class="grow"></span>
            <span class="muted small">exercices du 1<sup>er</sup> octobre au 30 septembre</span></div>
          ${tuiles}
          <div class="rgd-bil-passe">
            <div class="rgd-bil-lib">Années passées</div>
            ${tableauPasse(clos, total)}
          </div>
          ${selonCrm ? `<p class="small muted rgd-bil-pied"><sup>*</sup> Selon le CRM, qui n’a pas tout l’historique Costructor.
            Un client signataire compte une fois, quel que soit son nombre de devis.</p>` : ''}
        </section>`;
}
