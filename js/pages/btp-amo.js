// La fiche découverte AMO du manuel opérationnel V5 (§40), et son impression.
//
// POURQUOI UN FORMULAIRE À PART
// Une expertise se saisit en quelques champs : un désordre, un bien, une date. Une
// AMO se découvre en rendez-vous — le projet, son budget, son avancement, ce que le
// client attend, ce qui va coincer. Le manuel en a fait une fiche de cinq rubriques
// parce que ces réponses commandent la suite : le §41 en tire le taux d'honoraires,
// le §42 le niveau de mission et donc les points de charge.
//
// Ce qui est coché ici n'est donc pas de la documentation : c'est le calcul du devis.
// D'où la dernière étape, qui montre le score se former et le taux en découler.
//
// L'IMPRESSION
// Pas de bibliothèque PDF : la fiche est une page HTML mise en page pour l'A4, rendue
// dans un cadre invisible et confiée à l'impression du navigateur. « Enregistrer au
// format PDF » y est une destination comme une autre. Un cadre plutôt qu'une fenêtre
// séparée : une fenêtre s'ouvre au bon vouloir du bloqueur de publicités, un cadre
// non.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, toast, openModal, closeModal, contactName } from '../ui.js';
import {
  CHANNELS, NIVEAUX_BTP, HONORAIRES_AMO, honorairesAmo, TVA_TAUX, couleurMission, stagesDe, tauxSuggere,
  FICHE_AMO, MATRICE_AMO, CRITERES_V5, coteBudget, coteDuree, coteLots, niveauSuggere, controleTaux,
} from '../data/schema.js';
import { enteteFiche, piedFiche, signatures, cases, ligne, pageFiche, imprimerPage } from './btp-fiche.js';

const KEY = 'btp';
const C = couleurMission('amo');
const teinte = `--m:${C.couleur};--m-clair:${C.clair};--m-encre:${C.encre}`;
const CANAUX_COURANTS = ['Recommandation client', 'Ancien client', 'Téléphone / autre', 'Site internet direct', 'Prospection directe'];

const TYPES_BIEN = ['Maison', 'Appartement', 'Immeuble', 'Local pro', 'Autre'];

// ------------------------------------------------------- Le calculateur d'honoraires
// Deux saisies libres — le montant des travaux TTC et le taux — et trois résultats :
// honoraires HT, TVA, honoraires TTC. Le taux n'est pas enfermé dans les quatre
// valeurs de la matrice : elle en suggère un, le manuel prévoit lui-même d'en retenir
// un autre, et un devis peut se négocier à 6,5 %.
//
// Les champs et les résultats sont rendus séparément, exprès : la frappe ne redessine
// que les résultats, sinon le curseur sauterait du champ à chaque chiffre saisi.

// Les centimes ne s'affichent que lorsqu'il y en a : « 6 000 € » plutôt que
// « 6 000,00 € », mais « 6 787,50 € » quand le taux tombe juste.
const euro = (n) => (Number.isInteger(n)
  ? eur(n)
  : eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function champsHonoraires({ travaux, taux, idTravaux = 'hono-travaux', idTaux = 'hono-taux' }) {
  return `<div class="hono-saisie">
    <label class="mail-champ"><span>Montant des travaux TTC</span>
      <!-- ⚠ PAS DE MONTANT D'EXEMPLE ICI (25/09/2026, demandé par Mickael :
           « on a l'impression que c'est déjà rempli »). Dans un champ de nombre,
           un texte d'exemple grisé se lit comme une valeur saisie — et celui-ci
           ouvre un simulateur d'honoraires, où croire qu'un montant est posé
           fait lire un résultat qui n'existe pas. -->
      <input type="number" id="${idTravaux}" min="0" step="1000" inputmode="decimal"
        value="${esc(travaux ?? '')}"></label>
    <label class="mail-champ"><span>Taux d'honoraires</span>
      <span class="hono-pct">
        <input type="number" id="${idTaux}" min="0" max="100" step="0.1" inputmode="decimal"
          value="${esc(taux ?? '')}" placeholder="5"><b>%</b>
      </span></label>
  </div>`;
}

export function resultatsHonoraires(travaux, taux, suggere) {
  const montant = Number(travaux) || 0;
  const t = Number(taux) || 0;
  const h = honorairesAmo(montant, t);
  const pret = montant > 0 && t > 0;
  return `
    ${suggere && Number(suggere) !== t
      ? `<p class="hono-note">La cotation suggère <button type="button" class="hono-sug" data-taux="${suggere}">${suggere} %</button>.</p>`
      : ''}
    <table class="hono-tab"><tbody>
      <tr><th>Honoraires HT</th><td>${pret ? euro(h.ht) : '—'}</td></tr>
      <tr><th>TVA ${TVA_TAUX} %</th><td>${pret ? euro(h.tva) : '—'}</td></tr>
      <tr class="ttc"><th>Honoraires TTC</th><td>${pret ? euro(h.ttc) : '—'}</td></tr>
    </tbody></table>
    ${!pret ? '<p class="hono-note">Renseignez le montant des travaux et le taux.</p>' : ''}
    ${h.sousMinimum
      ? `<p class="hono-note alerte">${euro(h.ht)} HT : sous le minimum d'honoraires du cabinet, ${eur(HONORAIRES_AMO.minimum)} HT.</p>`
      : ''}`;
}
// ------------------------------------------------------------------ L'impression
// La fiche decouverte AMO a ete RETIREE le 25/09/2026 : elle est remplacee par la
// fiche projet (`btp-projet.js`), qui porte les deux metiers en un seul parcours.
// Ce fichier garde le calculateur d'honoraires et la mise en page imprimee, tous
// deux appeles depuis la fiche projet et l'ecran AMO.
export function ficheHtml(f) {
  const sections = [
    ['B. Travaux envisagés', FICHE_AMO.travaux, f.travaux],
    ["C. État d'avancement", FICHE_AMO.avancement, f.avancement],
    ["D. Besoin d'accompagnement", FICHE_AMO.besoins, f.besoins],
    ['E. Risques et contraintes', FICHE_AMO.risques, f.risques],
  ];
  const corps = `
${enteteFiche({
    titre: "Fiche de mission — Assistance à Maîtrise d'Ouvrage",
    sous: 'Fiche découverte client, manuel opérationnel V5 (§40)',
    droite: `Établie le ${esc(fmtDate(f.etablie_le))}<br>Étape : ${esc(f.etape)}<br>Chargé d'affaires : ${esc(f.charge)}`,
  })}

<h2>A. Client et projet</h2>
<table class="i">
  ${ligne('Nom / société', f.client)}
  ${ligne('Téléphone', f.telephone)}
  ${ligne('E-mail', f.email)}
  ${ligne('Adresse du projet', f.adresse)}
  ${ligne('Type de bien', f.type_bien)}
  ${ligne('Surface', f.surface)}
  ${ligne('Occupation pendant travaux', f.occupation)}
  ${ligne('Origine du lead', f.canal)}
</table>

${sections.map(([titre, liste, retenus]) => `
  <h2>${esc(titre)}</h2>
  <div class="cases">${cases(liste, retenus || [])}</div>`).join('')}

${f.description ? `<h2>Description du projet</h2><div class="desc">${esc(f.description)}</div>` : ''}

<h2>Budget et calendrier</h2>
<table class="i">
  ${ligne('Budget travaux TTC estimé', f.budget_ht ? eur(f.budget_ht) : '')}
  ${ligne('Budget maximum client', f.budget_max ? eur(f.budget_max) : '')}
  ${ligne('Démarrage souhaité', f.date_debut ? fmtDate(f.date_debut) : '')}
  ${ligne('Fin souhaitée', f.date_fin ? fmtDate(f.date_fin) : '')}
</table>

<div class="p2">
<h2>Score de complexité — règle V5 (§41)</h2>
<table class="s">
  <thead><tr><th>Critère</th><th>0 point</th><th>1 point</th><th>2 points</th></tr></thead>
  <tbody>${(f.cotes || []).map(c => `<tr><th>${esc(c.label)}</th>${c.valeurs.map((lbl, n) =>
    `<td class="${c.cote === n ? 'on' : ''}">${esc(lbl)}</td>`).join('')}</tr>`).join('')}</tbody>
</table>

<div class="bilan">
  <div><span>Score</span><b>${f.score} / 10</b></div>
  <div><span>Taux suggéré</span><b>${f.taux_suggere} %</b></div>
  <div><span>Taux retenu</span><b>${f.taux_final} %</b></div>
</div>
<div class="bilan fort">
  <div><span>Honoraires HT</span><b>${(f.honoraires_ht ?? f.honoraires) != null ? eur(f.honoraires_ht ?? f.honoraires) : '—'}</b></div>
  <div><span>TVA ${TVA_TAUX} %</span><b>${f.tva != null ? eur(f.tva) : '—'}</b></div>
  <div><span>Honoraires TTC</span><b>${f.honoraires_ttc != null ? eur(f.honoraires_ttc) : '—'}</b></div>
</div>
<div class="bilan">
  <div><span>Niveau de mission</span><b>${esc(f.niveau)}</b></div>
  <div><span>Points de charge</span><b>${f.points}</b></div>
</div>
${f.sous_minimum ? `<p class="note">Honoraires inférieurs au minimum du cabinet (${eur(HONORAIRES_AMO.minimum)} HT).</p>` : ''}
${f.motif ? `<p class="note">Dérogation au taux suggéré — motif : ${esc(f.motif)}</p>` : ''}
${f.taux_final < 5 ? '<p class="note">Taux inférieur à 5 % : validation de la direction obligatoire.</p>' : ''}

${signatures("Le chargé d'affaires", "Le maître d'ouvrage")}
${piedFiche()}
</div>`;
  return pageFiche({ titre: `Fiche de mission AMO — ${f.client}`, couleurs: C, corps });
}
