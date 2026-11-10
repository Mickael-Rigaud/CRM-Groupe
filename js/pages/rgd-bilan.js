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

// ⚠ LE VISUEL « PISTE A » (10/11/2026, Élodie : « je voudrais surtout que
// l'on revoie le visuel du bilan commercial, quelque chose de plus moderne et
// dynamique — ne change surtout pas les éléments, tout est correct »). Entre
// trois maquettes (couleurs vives et anneaux, barres comparatives, sombre),
// elle a choisi les couleurs vives : chaque tuile a son dégradé, l'avancement
// se lit dans un anneau, et le tableau s'aère avec des pastilles pour les taux.
// ⚠ AUCUN ÉLÉMENT N'A CHANGÉ : mêmes tuiles, mêmes lignes, mêmes chiffres, mêmes
// clics. Ne pas profiter d'une retouche de forme pour retirer ou ajouter une donnée.

// ⚠ LE POURCENTAGE SE LIT DANS L'ANNEAU (05/11/2026, « en dessous de chaque
// curseur je veux le pourcentage d'avancement de l'objectif », puis l'anneau
// du 10/11). À l'entier, sauf sous 1 % (« 0,4 % »), pour qu'un début d'année
// ne s'affiche pas « 0 % » alors que tout n'est pas nul.
const lirePct = (part) => (part > 0 && part < 1
  ? part.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : String(Math.round(part)));

function anneau(part, legende) {
  const p = Math.max(0, part || 0);
  const trace = Math.min(100, p > 0 ? Math.max(2, p) : 0);
  return `<svg class="rgd-bil-anneau" viewBox="0 0 36 36" role="img" aria-label="${lirePct(p)} % ${esc(legende)}">
      <circle cx="18" cy="18" r="15" class="fond"></circle>
      ${trace > 0 ? `<circle cx="18" cy="18" r="15" class="plein" pathLength="100"
        stroke-dasharray="${trace.toFixed(1)} ${(100 - trace).toFixed(1)}" transform="rotate(-90 18 18)"></circle>` : ''}
      <text x="18" y="18.5" text-anchor="middle" class="pct">${lirePct(p)} %</text>
      <text x="18" y="25" text-anchor="middle" class="leg">${esc(legende)}</text>
    </svg>`;
}

// ⚠ CHAQUE CHIFFRE SE CLIQUE et ouvre la liste qui le compose (`justifier`).
// `data-bil-an` = année de début d'exercice (ou « total »), `data-bil-m` = la mesure.
const cliquable = (an, m) => `data-bil-an="${an}" data-bil-m="${m}" role="button" tabindex="0" title="Voir le détail"`;

function tuile(teinte, titre, gros, sur, rond, bas, an, m) {
  return `<div class="rgd-bil-tuile ${teinte} rgd-bil-clic" ${cliquable(an, m)}>
      <div class="rgd-bil-lib">${titre}</div>
      <div class="rgd-bil-ligne">
        <div><div class="rgd-bil-gros">${gros}</div>${sur ? `<div class="rgd-bil-sur">${sur}</div>` : ''}</div>
        ${rond}
      </div>
      <div class="rgd-bil-bas">${bas || '&nbsp;'}</div>
    </div>`;
}

const part = (val, cible) => (val > 0 && cible > 0 ? (val / cible) * 100 : 0);

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

export function carteBilan(aujourdhui = new Date()) {
  const b = bilanCommercial(aujourdhui);
  if (!b) return '';
  const { exercices, total, objectifs: o = {} } = b;
  const ec = exercices.find(e => e.enCours);
  const clos = exercices.filter(e => !e.enCours);
  const selonCrm = clos.some(e => e.chantiersSelonCrm) || total.chantiersSelonCrm;

  const sur = (cible, format) => (vide(cible) ? '' : `sur ${format(cible)} cette année`);
  const tuiles = ec ? `
          <div class="rgd-bil-annee"><b>${esc(ec.label)}</b> · depuis le 1<sup>er</sup> octobre (${ec.nbMois} mois)</div>
          <div class="rgd-bil-tuiles">
            ${tuile('t-orange', 'Devis envoyés', nombre(ec.envoyes), sur(o.envoyes, nombre),
              vide(o.envoyes) ? '' : anneau(part(ec.envoyes, o.envoyes), 'de l’objectif'),
              vide(ec.montantDevis) ? '' : `${euros(ec.montantDevis)} HT`, ec.annee, 'envoyes')}
            ${tuile('t-bleu', 'Devis signés', nombre(ec.signes),
              vide(ec.tauxSignature) ? '' : `${pourcent(ec.tauxSignature)} des devis envoyés`,
              vide(ec.tauxSignature) ? '' : anneau(ec.tauxSignature, 'signés'),
              vide(o.tauxSignature) ? '' : `objectif ${pourcent(o.tauxSignature)}`, ec.annee, 'signes')}
            ${tuile('t-vert', 'Chantiers', nombre(ec.chantiers), sur(o.chantiers, nombre),
              vide(o.chantiers) ? '' : anneau(part(ec.chantiers, o.chantiers), 'de l’objectif'),
              // Le panier réalisé est retiré de la tuile (Élodie : « retire le panier
              // moyen, garde juste objectif 20 000 € ») : il est dans le tableau.
              vide(o.panier) ? '' : `objectif ${euros(o.panier)} par chantier`, ec.annee, 'chantiers')}
            ${tuile('t-violet', 'CA facturé HT', euros(ec.ca), sur(o.ca, euros),
              vide(o.ca) ? '' : anneau(part(ec.ca, o.ca), 'de l’objectif'), '', ec.annee, 'ca')}
          </div>` : '';

  return `
        <section class="card rgd-bilan">
          <div class="card-head"><h2>Bilan commercial</h2>
            <span class="grow"></span>
            <span class="muted small">exercices du 1<sup>er</sup> octobre au 30 septembre</span></div>
          ${tuiles}
          <div class="rgd-bil-passe">
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
