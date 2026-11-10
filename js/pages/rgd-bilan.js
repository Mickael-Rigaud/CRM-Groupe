// La carte « Bilan commercial » de la vue d'ensemble RGD (05/11/2026).
//
// Les calculs vivent dans `data/rgd-bilan.js` — rien n'est défini ici.
//
// ⚠ LES QUATRE TUILES ONT QUITTÉ CETTE CARTE LE 10/11/2026, et c'est Élodie
// qui l'a demandé : « j'adore cette présentation et je voudrais que ces
// encadrés soient en dessus de la pipeline », avec trois de plus (demandes,
// rendez-vous, CA encaissé) et le choix mois / exercice. Elles vivent donc
// maintenant dans `pages/rgd-pilotage.js`, carte « Objectifs », où leur vue
// Exercice donne exactement les chiffres qu'elles donnaient ici. Les laisser
// AUSSI dans cette carte aurait mis les mêmes nombres à deux endroits du même
// écran — elle a tranché : « non, juste le tableau ».
//
// ⚠ CE QUI EST PARTI AVEC ELLES : `anneau`, `lirePct`, `tuile` et `part`, qui
// ne servaient qu'à ça. Les deux premières ont été RECOPIÉES dans
// `rgd-pilotage.js`, pas effacées ; le CSS `rgd-bil-tuile` / `rgd-bil-anneau`
// ne bouge pas, c'est là-bas qu'il sert désormais.
//
// ⚠ LE TABLEAU DE TOUS LES EXERCICES EST LE CŒUR DE CETTE CARTE, et l'ancien
// paragraphe ci-dessous dit toujours pourquoi il est fait ainsi :
//
// ⚠ L'HISTORIQUE EN PETIT, SANS OBJECTIF NI BARRE
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

// ⚠ LE VISUEL « PISTE A » (10/11/2026, Élodie : « je voudrais surtout que
// l'on revoie le visuel du bilan commercial, quelque chose de plus moderne et
// dynamique — ne change surtout pas les éléments, tout est correct »). Entre
// trois maquettes (couleurs vives et anneaux, barres comparatives, sombre),
// elle a choisi les couleurs vives : chaque tuile a son dégradé, l'avancement
// se lit dans un anneau, et le tableau s'aère avec des pastilles pour les taux.
// ⚠ AUCUN ÉLÉMENT N'A CHANGÉ : mêmes tuiles, mêmes lignes, mêmes chiffres, mêmes
// clics. Ne pas profiter d'une retouche de forme pour retirer ou ajouter une donnée.

// ⚠ CHAQUE CHIFFRE SE CLIQUE et ouvre la liste qui le compose (`justifier`).
// `data-bil-an` = année de début d'exercice (ou « total »), `data-bil-m` = la mesure.
const cliquable = (an, m) => `data-bil-an="${an}" data-bil-m="${m}" role="button" tabindex="0" title="Voir le détail"`;

// Le tableau de tous les exercices. Années en colonnes, cumul en dernier,
// AUCUNE barre ni objectif : les objectifs n'existaient pas pour les années closes.
const pastille = (v) => (vide(v) ? '' : ` <span class="rgd-bil-pill ${tonTaux(v)}">${pourcent(v)}</span>`);
const LIGNES_PASSE = [
  ['Devis envoyés', 'envoyes', (e) => nombre(e.envoyes)],
  ['Devis signés', 'signes', (e) => (vide(e.signes) ? '—' : `${e.signes}${pastille(e.tauxSignature)}`)],
  ['Chantiers', 'chantiers', (e) => `${nombre(e.chantiers)}${e.chantiersSelonCrm && !vide(e.chantiers) ? '<sup>*</sup>' : ''}`],
  ['Panier moyen par chantier HT', 'panier', (e) => `${euros(e.panier)}${e.chantiersSelonCrm && !vide(e.panier) ? '<sup>*</sup>' : ''}`],
  // Juste au-dessus du CA (Élodie, 05/11/2026) : signé, puis facturé.
  ['Montant des devis signés HT', 'montantSigne', (e) => euros(e.montantSigne)],
  ['CA facturé HT', 'ca', (e) => euros(e.ca), true],
  // ⚠ UNE LIGNE, ET PAS UN SURVOL (10/11/2026, Élodie : « je ne sais pas s'il
  // faut le rajouter en survol sur le CA facturé ou une nouvelle ligne »). Un
  // survol n'existe pas sur un téléphone, et c'est là que ce tableau se lit le
  // plus souvent — le chiffre serait invisible précisément où il est attendu.
  // Une ligne se compare d'un exercice à l'autre d'un coup d'œil, et elle se
  // clique comme les autres pour voir les factures encaissées.
  //
  // ⚠ ENCAISSÉ ET FACTURÉ D'UNE MÊME ANNÉE NE SE RÉPONDENT PAS À L'EURO, et ce
  // n'est pas un écart à corriger : le facturé se date de l'émission,
  // l'encaissé de la réception du paiement. Une facture de septembre payée en
  // octobre change d'exercice.
  //
  // ⚠ L'ASTÉRISQUE N'EST PAS DÉCORATIF : sur un exercice saisi, c'est la seule
  // ligne qui vienne du CRM quand tout le reste de la colonne vient du bilan
  // comptable — lequel ne donne pas l'encaissé. Le pied de carte l'explique.
  ['CA encaissé HT', 'encaisse',
    (e) => `${euros(e.encaisse)}${e.encaisseSelonCrm && !vide(e.encaisse) ? '<sup>*</sup>' : ''}`, true],
];

// Une couleur par exercice clos, puis celle de l'espace pour l'exercice en
// cours. ⚠ L'EXERCICE EN COURS EST DANS LE TABLEAU (05/11/2026, « dans le
// tableau rajoute juste l'année en cours ») : ses chiffres, sans objectif.
// ⚠ PAS LES COULEURS DES TUILES (10/11/2026, Élodie : « mets d'autres couleurs
// que celles d'en haut, on a l'impression que les données correspondent entre
// elles alors que ce ne sont pas les mêmes »). Les tuiles sont orange, bleu,
// vert, violet ; les années prennent sarcelle, framboise, olive, et l'exercice
// en cours l'ardoise. Ne pas rapprocher ces deux palettes.
const COULEURS_ANNEES = ['#0e9aa7', '#d6457a', '#8a7a1c'];
const COULEUR_EN_COURS = '#475569';
function tableauPasse(clos, total, ec) {
  const cols = [
    ...clos.map((e, i) => [e.label, e, COULEURS_ANNEES[i % COULEURS_ANNEES.length], e.annee, '']),
    ...(ec ? [[ec.label, ec, COULEUR_EN_COURS, ec.annee, ' (en cours)']] : []),
    ['Depuis la création', total, '', 'total', ''],
  ];
  const td = (c, contenu, an, m, fort) => `<td class="num rgd-bil-clic${an === 'total' ? ' rgd-bil-total' : ''}${fort ? ' rgd-bil-fort' : ''}"
      ${c ? `style="--ex:${c}"` : ''} ${cliquable(an, m)}>${contenu}</td>`;
  return `<div class="table-wrap"><table class="rgd-bil-table">
      <thead><tr><th>Tous les exercices</th>${cols.map(([nom, , c, an, suite]) => `<th class="num${an === 'total' ? ' rgd-bil-total' : ''}">
        ${c ? `<span class="rgd-bil-an" style="--ex-c:${c}"><i style="background:${c}"></i>${esc(nom)}${suite ? `<small>${esc(suite)}</small>` : ''}</span>` : esc(nom)}</th>`).join('')}</tr></thead>
      <tbody>${LIGNES_PASSE.map(([titre, m, f, fort]) => `<tr${fort ? ' class="rgd-bil-ca"' : ''}><td class="rgd-bil-titre">${titre}</td>${cols.map(([, e, c, an]) => td(c, f(e), an, m, fort)).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

// ⚠ SUR TÉLÉPHONE, UN TABLEAU PAR EXERCICE (10/11/2026, Élodie : « pour le
// bilan commercial, ce n'est pas du tout lisible comme ça et je voudrais
// plutôt que tu fasses un tableau avec tous les éléments par exercice »).
// Le grand tableau, années en colonnes, devenait sous 820 px une suite de
// fiches où « Tous les exercices » se répétait à chaque ligne. Ici chaque
// exercice a son bloc, de sa couleur, avec ses six lignes. Mêmes lignes
// (`LIGNES_PASSE`), mêmes chiffres, mêmes clics : seule la disposition change.
// ⚠ PAS DE `.table-wrap` NI DE `th` : `etiqueterColonnes` transformerait
// encore ces tableaux en fiches.
function tableauxParExercice(clos, total, ec) {
  const blocs = [
    ...(ec ? [[ec.label, ec, COULEUR_EN_COURS, ec.annee, 'en cours']] : []),
    ...clos.slice().reverse().map((e) => [e.label, e, COULEURS_ANNEES[clos.indexOf(e) % COULEURS_ANNEES.length], e.annee, '']),
    ['Depuis la création', total, '#1f2937', 'total', ''],
  ];
  return `<div class="rgd-bil-mobile">${blocs.map(([nom, e, c, an, suite]) => `
    <div class="rgd-bil-ex" style="--ex:${c}">
      <div class="rgd-bil-ex-tete">${esc(nom)}${suite ? ` <small>${esc(suite)}</small>` : ''}</div>
      <table class="rgd-bil-ex-t"><tbody>${LIGNES_PASSE.map(([titre, m, f, fort]) => `<tr${fort ? ' class="rgd-bil-ca"' : ''}>
        <td>${titre}</td><td class="num rgd-bil-clic${fort ? ' rgd-bil-fort' : ''}" ${cliquable(an, m)}>${f(e)}</td></tr>`).join('')}</tbody></table>
    </div>`).join('')}</div>`;
}

// ⚠ `pied` EST POSÉ PAR L'APPELANT, ET IL SERT DÉJÀ (10/11/2026) : la carte
// « Chiffre d'affaires » de la vue d'ensemble a été retirée, et l'alerte de
// synchronisation Costructor qu'elle était SEULE à porter descend ici, au pied
// du bilan — c'est le choix d'Élodie. Une chaîne vide ne change rien.
export function carteBilan(aujourdhui = new Date(), pied = '') {
  const b = bilanCommercial(aujourdhui);
  if (!b) return '';
  const { exercices, total } = b;
  const ec = exercices.find(e => e.enCours);
  const clos = exercices.filter(e => !e.enCours);
  const selonCrm = clos.some(e => e.chantiersSelonCrm) || total.chantiersSelonCrm;
  const encSelonCrm = clos.some(e => e.encaisseSelonCrm) || total.encaisseSelonCrm;

  // ⚠ L'EXERCICE EN COURS RESTE ANNONCÉ EN UNE LIGNE, même sans ses tuiles :
  // le tableau le porte dans sa colonne « en cours », et le nombre de mois
  // écoulés est ce qui empêche de lire cette colonne comme une année pleine.
  const enTete = ec ? `<div class="rgd-bil-annee">Exercice en cours <b>${esc(ec.label)}</b>
          · depuis le 1<sup>er</sup> octobre (${ec.nbMois} mois) · le détail mois par mois
          est dans <a href="#/rgd">les objectifs</a>, juste au-dessus</div>` : '';

  return `
        <section class="card rgd-bilan">
          <div class="card-head"><h2>Bilan commercial</h2>
            <span class="grow"></span>
            <span class="muted small">exercices du 1<sup>er</sup> octobre au 30 septembre</span></div>
          ${enTete}
          <div class="rgd-bil-passe">
            ${tableauPasse(clos, total, ec)}
          </div>
          ${tableauxParExercice(clos, total, ec)}
          ${selonCrm || encSelonCrm ? `<p class="small muted rgd-bil-pied"><sup>*</sup> Selon le CRM, qui n’a pas tout l’historique Costructor.${selonCrm ? `
            Un client qui signe plusieurs devis compte pour un chantier.` : ''}${encSelonCrm ? `
            Le <b>CA encaissé</b> en vient toujours : le bilan comptable ne le donne pas.` : ''}</p>` : ''}
          <p class="small muted rgd-bil-pied">Clique sur un chiffre pour voir les devis ou les factures qui le composent.
            Le <b>CA encaissé</b> compte l’argent reçu pendant l’exercice, le <b>CA facturé</b> les factures
            émises : une facture de septembre payée en octobre n’est pas dans le même exercice des deux côtés.</p>
          ${pied}
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
