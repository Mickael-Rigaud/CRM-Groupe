// La fiche découverte Expertise du manuel opérationnel V5 (§36), et son impression.
//
// CE QUI LA DISTINGUE DE LA FICHE AMO
// Une AMO se chiffre : cinq critères notés de 0 à 2, un score sur 10, un taux. Une
// expertise se qualifie : la grille du §36 G ne s'additionne pas, chaque critère
// désigne directement un niveau — « Livrable : rapport structuré » dit à lui seul
// « expertise avec rapport ». Le manuel s'arrête là et écrit « Niveau retenu » sans
// donner de règle d'arbitrage ; `niveauExpertise` explique ce que le CRM en fait.
//
// L'autre différence tient au métier : l'AMO regarde devant (un projet, un budget, un
// calendrier), l'expertise regarde derrière (un désordre, son apparition, son
// évolution, ce qui a déjà été engagé). D'où la rubrique E, qui n'a pas d'équivalent
// côté AMO et qui décide souvent de l'urgence.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, toast, openModal, closeModal, contactName } from '../ui.js';
import {
  CHANNELS, NIVEAUX_BTP, niveauxExpertiseParCharge, couleurMission, stagesDe,
  FICHE_EXPERTISE, QUALIF_EXPERTISE, niveauExpertise,
} from '../data/schema.js';
import { enteteFiche, piedFiche, signatures, cases, ligne, pageFiche, imprimerPage } from './btp-fiche.js';

const KEY = 'btp';
const C = couleurMission('expertise');
const teinte = `--m:${C.couleur};--m-clair:${C.clair};--m-encre:${C.encre}`;
const CANAUX_COURANTS = ['Recommandation client', 'Ancien client', 'Téléphone / autre', 'Site internet direct', 'Prospection directe'];
const TYPES_BIEN = ['Maison', 'Appartement', 'Immeuble', 'Local pro', 'Autre'];
// ⚠ PAR CHARGE, du plus léger au plus lourd : c'est l'ordre des colonnes de la
// grille de qualification, et il n'est pas celui de la grille tarifaire.
const NIVEAUX = niveauxExpertiseParCharge();
// « Expertise pré-achat » devient « Pré-achat » en tête de colonne : le mot
// « Expertise » est déjà dans le titre du tableau, et la majuscule ne se perd
// pas au passage.
const courtNiveau = (n) => { const t = n.label.replace(/^Expertise /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };

// ------------------------------------------------------------------ L'impression
// La fiche decouverte Expertise a ete RETIREE le 25/09/2026, remplacee par la
// fiche projet (`btp-projet.js`). Ce fichier ne garde que la mise en page
// imprimee, appelee par `imprimerFicheDeal`.
export function ficheHtml(f) {
  const corps = `
${enteteFiche({
    titre: 'Fiche de mission — Expertise technique du bâtiment',
    sous: 'Fiche découverte client, manuel opérationnel V5 (§36)',
    droite: `Établie le ${esc(fmtDate(f.etablie_le))}<br>Étape : ${esc(f.etape)}<br>Chargé d'affaires : ${esc(f.charge)}`,
  })}

<h2>A. Identification</h2>
<table class="i">
  ${ligne('Nom / prénom ou société', f.client)}
  ${ligne('Téléphone', f.telephone)}
  ${ligne('E-mail', f.email)}
  ${ligne('Adresse du bien', f.adresse)}
  ${ligne('Adresse de facturation', f.adresse_facturation)}
  ${ligne('Origine du lead', f.canal)}
</table>

<h2>B. Profil du demandeur</h2>
<div class="cases">${cases(FICHE_EXPERTISE.profils, f.profil ? [f.profil] : [])}</div>

<h2>C. Bien concerné</h2>
<table class="i">
  ${ligne('Type de bien', f.type_bien)}
  ${ligne('Année de construction', f.annee)}
  ${ligne('Surface approximative', f.surface)}
  ${ligne('Occupation actuelle', f.occupation)}
  ${ligne('Travaux récents et dates', f.travaux_recents)}
  ${ligne('Entreprises intervenues', f.entreprises)}
</table>

<h2>D. Motif de la demande</h2>
<div class="cases">${cases(FICHE_EXPERTISE.motifs, f.motifs || [])}</div>
${f.description ? `<div class="desc">${esc(f.description)}</div>` : ''}

<h2>E. Historique et urgence</h2>
<table class="i">
  ${ligne("Date d'apparition", f.apparition)}
  ${ligne('Évolution observée', f.evolution)}
  ${ligne('Sinistre déclaré', f.sinistre)}
  ${ligne('Procédure déjà engagée', f.procedure)}
  ${ligne('Date butoir', f.butoir ? fmtDate(f.butoir) : '')}
  ${ligne('Risque sécurité immédiat', f.securite)}
</table>

<div class="p2">
<h2>F. Documents disponibles</h2>
<div class="cases">${cases(FICHE_EXPERTISE.documents, f.documents || [])}</div>

<h2>G. Qualification interne (§36)</h2>
<table class="s">
  <thead><tr><th>Critère</th>${NIVEAUX.map(n => `<th>${esc(courtNiveau(n))} — ${n.points} pt${n.points > 1 ? 's' : ''}</th>`).join('')}</tr></thead>
  <tbody>${(f.cotes || []).map(c => `<tr><th>${esc(c.label)}</th>${c.valeurs.map((lbl, n) =>
    `<td class="${c.cote === n ? 'on' : ''}">${esc(lbl)}</td>`).join('')}</tr>`).join('')}</tbody>
</table>

<div class="bilan fort">
  <div><span>Niveau retenu</span><b>${esc(f.niveau)}</b></div>
  <div><span>Points de charge</span><b>${f.points}</b></div>
  <div><span>Tarif proposé HT</span><b>${f.tarif ? eur(f.tarif) : '—'}</b></div>
</div>
<table class="i" style="margin-top:9px">
  ${ligne('Date de visite proposée', f.date_visite ? fmtDate(f.date_visite) : '')}
  ${ligne("Chargé d'affaires pressenti", f.charge)}
</table>

<h2>Contrôles avant attribution</h2>
<div class="cases">${cases(FICHE_EXPERTISE.controles, f.controles || [])}</div>

${signatures("Le chargé d'affaires", 'Le client')}
${piedFiche()}
</div>`;
  return pageFiche({ titre: `Fiche de mission Expertise — ${f.client}`, couleurs: C, corps });
}
