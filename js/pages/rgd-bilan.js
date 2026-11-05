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
// ⚠ « CHANTIERS SIGNÉS » (05/11/2026). On est passé par « Nombre de chantiers »
// (lu comme des chantiers EN COURS), puis par « Clients signataires », qu'Élodie
// n'aimait pas ; elle a choisi de revenir à « chantiers ». Le mot « signés » lève
// l'ambiguïté. Un client qui signe plusieurs devis = un chantier.
//
// ⚠ LES TUILES PORTENT L'EXERCICE ENTIER, DEPUIS LE 1ER OCTOBRE (05/11/2026).
// On a basculé un moment « Devis envoyés » et « Devis signés » sur le mois en
// cours ; Élodie s'était trompée et a demandé le retour : « remets les infos de
// l'année en cours : devis envoyés, devis signés, chantiers signés depuis le
// 1er octobre ». Ne pas remettre le mois en cours ici : c'est le rôle de la
// carte « Objectifs du mois », juste au-dessus.
import { esc, eur, fmtDate, openModal } from '../ui.js';
import { bilanCommercial, justifier } from '../data/rgd-bilan.js';

const vide = (v) => v === null || v === undefined;
const nombre = (v) => (vide(v) ? '—' : String(v));
const pourcent = (v) => (vide(v) ? '—'
  : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const euros = (v) => (vide(v) ? '—' : eur(v));
// Trois paliers : on lit une couleur plus vite qu'un nombre.
const tonTaux = (v) => (vide(v) ? '' : v >= 80 ? 'vert' : v >= 50 ? 'ambre' : 'rouge');

// ⚠ LE POURCENTAGE EST ÉCRIT SOUS LA BARRE (05/11/2026, Élodie : « en dessous
// de chaque curseur je veux le pourcentage d'avancement de l'objectif ») : une
// barre de 3 % ne se lit pas à l'œil. À l'entier, sauf sous 1 % (« 0,4 % »),
// pour qu'un début d'année ne s'affiche pas « 0 % » alors que tout n'est pas nul.
function jauge(val, cible) {
  const part = val > 0 && cible > 0 ? (val / cible) * 100 : 0;
  const lu = part > 0 && part < 1 ? part.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : String(Math.round(part));
  return `<span class="rgd-bil-piste"><i style="width:${Math.min(100, Math.max(part > 0 ? 2 : 0, part)).toFixed(1)}%"></i></span>
    <div class="rgd-bil-avance">${lu} % de l’objectif</div>`;
}

// ⚠ CHAQUE CHIFFRE SE CLIQUE et ouvre la liste qui le compose (`justifier`).
// `data-bil-an` = année de début d'exercice (ou « total »), `data-bil-m` = la mesure.
const cliquable = (an, m) => `data-bil-an="${an}" data-bil-m="${m}" role="button" tabindex="0" title="Voir le détail"`;

function tuile(titre, gros, sur, bas, an, m) {
  return `<div class="rgd-bil-tuile rgd-bil-clic" ${cliquable(an, m)}>
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
  ['Devis envoyés', 'envoyes', (e) => nombre(e.envoyes)],
  ['Devis signés', 'signes', (e) => (vide(e.signes) ? '—' : `${e.signes} <span class="muted">(${pourcent(e.tauxSignature)})</span>`)],
  ['Chantiers', 'chantiers', (e) => `${nombre(e.chantiers)}${e.chantiersSelonCrm && !vide(e.chantiers) ? '<sup>*</sup>' : ''}`],
  ['Panier moyen par chantier HT', 'panier', (e) => `${euros(e.panier)}${e.chantiersSelonCrm && !vide(e.panier) ? '<sup>*</sup>' : ''}`],
  // Juste au-dessus du CA (Élodie, 05/11/2026) : signé, puis facturé.
  ['Montant des devis signés HT', 'montantSigne', (e) => euros(e.montantSigne)],
  ['CA facturé HT', 'ca', (e) => `<b>${euros(e.ca)}</b>`],
];

// ⚠ EN COULEUR (05/11/2026, « rajoute un peu de couleurs ») : chaque année
// porte la sienne (bleu, vert, en alternance) en tête et en fond de colonne ;
// l'exercice en cours prend la couleur de l'espace, le cumul une teinte foncée.
// ⚠ L'EXERCICE EN COURS EST AUSSI DANS LE TABLEAU (05/11/2026, « dans le
// tableau rajoute juste l'année en cours ») : ses chiffres, SANS objectif —
// les objectifs restent dans les tuiles du dessus.
function tableauPasse(clos, total, ec) {
  const cols = [
    ...clos.map((e, i) => [e.label, e, ['var(--blue)', 'var(--green)'][i % 2], e.annee]),
    ...(ec ? [[`${ec.label} (en cours)`, ec, 'var(--accent)', ec.annee]] : []),
    ['Depuis la création', total, 'var(--accent-ink)', 'total'],
  ];
  const td = (c, contenu, an, m) => `<td class="num rgd-bil-col rgd-bil-clic" style="--ex:${c}" ${cliquable(an, m)}>${contenu}</td>`;
  return `<div class="table-wrap"><table class="rgd-bil-table">
      <thead><tr><th></th>${cols.map(([nom, , c]) => `<th class="num rgd-bil-ex" style="--ex:${c}">${esc(nom)}</th>`).join('')}</tr></thead>
      <tbody>${LIGNES_PASSE.map(([titre, m, f]) => `<tr><td class="rgd-bil-titre">${titre}</td>${cols.map(([, e, c, an]) => td(c, f(e), an, m)).join('')}</tr>`).join('')}</tbody>
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
          <div class="rgd-bil-annee"><b>${esc(ec.label)}</b> · depuis le 1<sup>er</sup> octobre (${ec.nbMois} mois)</div>
          <div class="rgd-bil-tuiles">
            ${tuile('Devis envoyés', nombre(ec.envoyes), surObjectif(ec.envoyes, o.envoyes, nombre),
              vide(ec.montantDevis) ? '' : `${euros(ec.montantDevis)} HT`, ec.annee, 'envoyes')}
            ${tuile('Devis signés', nombre(ec.signes),
              vide(ec.tauxSignature) ? '' : `<div class="rgd-bil-sur"><span class="rgd-bil-point ${tonTaux(ec.tauxSignature)}"></span>${pourcent(ec.tauxSignature)} des devis envoyés</div>`,
              vide(o.tauxSignature) ? '' : `objectif ${pourcent(o.tauxSignature)}`, ec.annee, 'signes')}
            ${tuile('Chantiers', nombre(ec.chantiers), surObjectif(ec.chantiers, o.chantiers, nombre),
              // Le panier réalisé est retiré de la tuile (Élodie : « retire le panier
              // moyen, garde juste objectif 20 000 € ») : il est dans le tableau.
              vide(o.panier) ? '' : `objectif ${euros(o.panier)} par chantier`, ec.annee, 'chantiers')}
            ${tuile('CA facturé HT', euros(ec.ca), surObjectif(ec.ca, o.ca, euros), '', ec.annee, 'ca')}
          </div>` : '';

  return `
        <section class="card rgd-bilan">
          <div class="card-head"><h2>Bilan commercial</h2>
            <span class="grow"></span>
            <span class="muted small">exercices du 1<sup>er</sup> octobre au 30 septembre</span></div>
          ${tuiles}
          <div class="rgd-bil-passe">
            <div class="rgd-bil-lib">Tous les exercices</div>
            ${tableauPasse(clos, total, ec)}
          </div>
          ${selonCrm ? `<p class="small muted rgd-bil-pied"><sup>*</sup> Selon le CRM, qui n’a pas tout l’historique Costructor.
            Un client qui signe plusieurs devis compte pour un chantier.</p>` : ''}
          <p class="small muted rgd-bil-pied">Clique sur un chiffre pour voir les devis ou les factures qui le composent.</p>
        </section>`;
}

// ---------------------------------------------------------------- La fenêtre de détail
function fenetre(j) {
  const notes = j.note.map(n => `<p class="rgd-bil-note">${esc(n)}</p>`).join('');
  let corps;
  if (j.groupes) {
    corps = `<div class="table-wrap"><table class="rgd-bil-detail">
      <thead><tr><th>Client</th><th>Chantier</th><th>Devis signés</th><th class="num">Montant HT</th></tr></thead>
      <tbody>${j.groupes.map(g => `<tr><td>${esc(g.client)}</td><td>${esc(g.chantier || '—')}</td>
        <td>${g.devis.map(esc).join(', ')}</td><td class="num">${eur(g.montant, { maximumFractionDigits: 2 })}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3"><b>${j.groupes.length} chantier${j.groupes.length > 1 ? 's' : ''}</b>
        · ${j.groupes.reduce((t, g) => t + g.devis.length, 0)} devis</td>
        <td class="num"><b>${eur(j.total, { maximumFractionDigits: 2 })}</b></td></tr></tfoot>
    </table></div>`;
  } else if (j.lignes.length) {
    corps = `<div class="table-wrap"><table class="rgd-bil-detail">
      <thead><tr><th>N°</th><th>Client</th><th>Chantier</th><th>Date</th><th class="num">Montant HT</th></tr></thead>
      <tbody>${j.lignes.map(l => `<tr><td>${esc(l.numero)}</td><td>${esc(l.client)}</td><td>${esc(l.chantier || '—')}</td>
        <td>${fmtDate(l.date)}</td><td class="num">${eur(l.montant, { maximumFractionDigits: 2 })}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4"><b>${j.lignes.length} ligne${j.lignes.length > 1 ? 's' : ''}</b></td>
        <td class="num"><b>${eur(j.total, { maximumFractionDigits: 2 })}</b></td></tr></tfoot>
    </table></div>`;
  } else {
    corps = '<div class="empty">Aucune ligne dans le CRM pour cette période.</div>';
  }
  return `<p class="muted small">Source de la liste : ${esc(j.source)}.</p>
    ${j.calcul ? `<p class="rgd-bil-calcul">${esc(j.calcul)}</p>` : ''}${notes}${corps}`;
}

function ouvrir(el) {
  const j = justifier(el.dataset.bilAn, el.dataset.bilM);
  if (!j) return;
  openModal(`${j.titre} · ${j.periode}`, fenetre(j), { wide: true });
}

// Un seul écouteur pour toute la page : la carte est redessinée à chaque
// rafraîchissement, l'écouteur, lui, ne bouge pas.
if (typeof document !== 'undefined' && !window.__rgdBilanClic) {
  window.__rgdBilanClic = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-bil-m]');
    if (el) ouvrir(el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('[data-bil-m]');
    if (el) { e.preventDefault(); ouvrir(el); }
  });
}
