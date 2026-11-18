// Les demandes du simulateur de faisabilité de lareferencecourtage.fr, lues dans le CRM.
//
// ⚠ ELLES ARRIVENT DÉJÀ TOUTES SEULES : la fonction `simulateur-courtage` (dépôt
// CRM-Groupe-Backend) crée le contact, l'affaire « Nouveau lead » de l'espace
// La Référence Courtage et la tâche de rappel. Ce fichier ne fait que les MONTRER :
// le verdict et les chiffres sont rangés dans `deal.fields` sous les noms de la
// liste blanche du courtage (migration 20261112155800_courtage_simulateur_champs),
// et `act.fields` du schéma n'en déclare aucun — sans ce module, la fiche disait
// qu'une personne avait simulé sans dire ce que valait son projet (17/11/2026,
// Élodie : « je voudrais que les demandes du simulateur arrivent directement
// dans le crm »).
//
// Les nombres arrivent en texte (« 250000 », « 32.5 ») ; le budget, lui, arrive
// déjà écrit (« 250 000 € ») parce qu'il vient du récapitulatif de la page.
import { esc, eur } from '../ui.js';

export const FEUX = {
  vert: { libelle: 'Feu vert', phrase: 'Projet faisable', classe: 'est-vert' },
  orange: { libelle: 'Feu orange', phrase: 'Projet à optimiser', classe: 'est-orange' },
  rouge: { libelle: 'Feu rouge', phrase: 'Projet à étudier', classe: 'est-rouge' },
};

export const estSimulation = (d) => !!d && d.activity === 'courtage'
  && (!!d.fields?.feu || /simulateur/i.test(String(d.fields?.source || '')));

export const feuDe = (d) => {
  const f = String(d?.fields?.feu || '').toLowerCase();
  return FEUX[f] ? f : '';
};

const nombre = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n ? n : null;
};
const euros = (v) => { const n = nombre(v); return n === null ? '' : eur(n); };
const pourcent = (v) => { const n = nombre(v); return n === null ? '' : `${String(n).replace('.', ',')} %`; };
// « a | b | c » : la page sépare ainsi ses raisons et ses leviers.
const liste = (v) => String(v || '').split('|').map(s => s.trim()).filter(Boolean);

// Il y a combien de temps, en mots : c'est ce qui dit s'il faut rappeler maintenant.
export const depuis = (iso) => {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? 'hier' : `il y a ${j} jours`;
};

// Une demande est « nouvelle » tant que personne ne l'a fait avancer, et pas plus
// de deux jours : au-delà, ce n'est plus une nouveauté, c'est un retard.
export const estNouvelle = (d) => d.status === 'open' && d.stage === 'lead'
  && (Date.now() - Date.parse(d.created_at || 0)) < 2 * 86400000;

// Les quatre chiffres qui fondent l'avis, dans l'ordre où un courtier les lit.
export const chiffresDe = (d) => {
  const f = d.fields || {};
  return [
    { k: 'Budget', v: f.budget || euros(f.montant_projet) },
    { k: 'Capacité', v: euros(f.capacite) },
    { k: 'Prêt', v: euros(f.emprunt) },
    { k: 'Endettement', v: pourcent(f.endettement) },
  ].filter(c => c.v);
};

// ---------------------------------------------------------------- le feu d'un dossier
// ⚠ TOUS LES DOSSIERS ONT UN FEU (18/11/2026, Mickael : « rajouter les feux rouge,
// jaune et vert dans la pipeline et la base de données des prospects »). Une
// demande du simulateur porte celui de son verdict ; un dossier saisi dans le CRM
// le tire de son taux d'endettement, au repère des banques : vert jusqu'à 35 %,
// jaune jusqu'à 38 %, rouge au-delà. Sans ce chiffre, pas de feu.
// (La clé reste `orange`, celle du simulateur ; c'est la lumière du milieu.)
export const feuDossier = (d) => {
  const f = feuDe(d);
  if (f) return f;
  const e = nombre(d?.fields?.endettement);
  if (e === null) return '';
  return e <= 35 ? 'vert' : e <= 38 ? 'orange' : 'rouge';
};
// ---------------------------------------------------------------- la fiche
// Le bloc « Le simulateur » de la fiche d'une affaire. Rien si l'affaire n'en vient pas.
export function blocSimulateurFiche(d, { toujours = false } = {}) {
  if (!estSimulation(d)) return blocProjetSaisi(d, { toujours });
  // Ce qu'on a complété à la main par « Modifier » s'affiche sous le verdict.
  const complements = blocProjetSaisi(d, { simulation: true });
  const f = d.fields || {};
  const feu = feuDe(d);
  const F = FEUX[feu];
  const ligne = (k, v) => v ? `<div class="cts-ligne"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : '';
  const puces = (titre, l, classe) => l.length
    ? `<div class="cts-puces ${classe}"><h4>${esc(titre)}</h4><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const ptz = [f.ptz_statut, f.ptz_montant, f.ptz_zone ? `zone ${f.ptz_zone}` : ''].filter(Boolean).join(' · ');
  // ⚠ LA FICHE EN QUATRE PARTIES (18/11/2026) : une simulation se range comme un
  // dossier saisi — « 1 Le projet » (verdict, projet, leviers) et « 2 Les
  // chiffres » (calculs, budget, apport, emprunteurs) —, et ce qu'on a complété
  // par « Modifier » se fond dans les deux parties au lieu de s'empiler dessous.
  if (toujours) {
    const fin = f.type_financement === 'Crédit professionnel' ? 'Financement professionnel' : f.type_financement;
    const mens = (x) => (euros(x) ? `${euros(x)} / mois` : '');
    const n = (k) => `<span class="lrc-num-partie">${k}</span>`;
    return `
    <section class="rgdf-bloc cts-fiche lrc-partie ${F ? F.classe : ''}">
      <h3>${n(1)}Le projet <span class="cts-source">via le simulateur</span></h3>
      <div class="cts-verdict">
        <span class="cts-feu" aria-hidden="true"></span>
        <div><b>${esc(F ? F.libelle : 'Simulation reçue')}</b>${F ? `<em>${esc(F.phrase)}</em>` : ''}</div>
        ${f.relance_mois && feu === 'rouge' ? `<span class="cts-relance">À reprendre dans ${esc(f.relance_mois)} mois</span>` : ''}
      </div>
      <div class="cts-lignes">
        ${ligne('Financement', fin)}
        ${ligne('Projet', f.objectif || f.projet)}
        ${ligne('Type de bien', f.type_bien)}
        ${ligne('Où', [f.ville, f.region].filter(Boolean).join(' · '))}
        ${ligne('Où en est-il', f.avancement)}
        ${ligne('Primo-accédant', f.primo)}
        ${ligne('Travaux', f.travaux)}
        ${ligne('Ce qu’il a dit', f.message)}
      </div>
      ${puces('Ce qui bloque', liste(f.blocages), 'est-bloque')}
      ${puces('Les leviers', liste(f.leviers), 'est-levier')}
    </section>
    <section class="rgdf-bloc cts-fiche lrc-partie">
      <h3>${n(2)}Les chiffres</h3>
      <div class="cts-chiffres">
        ${[
          { k: 'Mensualité estimée', v: euros(f.mensualite) },
          { k: 'Taux d’endettement', v: pourcent(f.endettement) },
          { k: 'Capacité d’emprunt', v: euros(f.capacite) },
        ].filter(c => c.v).map(c => `<div><b>${esc(c.v)}</b><span>${esc(c.k)}</span></div>`).join('')}
      </div>
      <div class="cts-lignes">
        ${ligne('Budget', f.budget || euros(f.montant_projet))}
        ${ligne('Apport', euros(f.apport) || f.apport)}
        ${ligne('Montant à financer', euros(f.montant_financement) || euros(f.emprunt))}
        ${ligne('Revenus du foyer', mens(f.revenus_foyer))}
        ${ligne('Crédits en cours', mens(f.credits_en_cours) || f.credits_en_cours)}
        ${ligne('Durée souhaitée', f.duree)}
        ${ligne('Emprunteurs', f.emprunteurs)}
        ${ligne('Emprunteur 1', f.emprunteur_1)}
        ${ligne('Emprunteur 2', f.emprunteur_2)}
        ${ligne('Revenus locatifs', f.revenus_locatifs)}
        ${ligne('Prêt à taux zéro', ptz)}
      </div>
    </section>`;
  }
  return `
    <section class="rgdf-bloc cts-fiche ${F ? F.classe : ''}">
      <h3>Le simulateur</h3>
      <div class="cts-verdict">
        <span class="cts-feu" aria-hidden="true"></span>
        <div><b>${esc(F ? F.libelle : 'Simulation reçue')}</b>${F ? `<em>${esc(F.phrase)}</em>` : ''}</div>
        ${f.relance_mois && feu === 'rouge' ? `<span class="cts-relance">À reprendre dans ${esc(f.relance_mois)} mois</span>` : ''}
      </div>
      <div class="cts-chiffres">
        ${[
          { k: 'Capacité d’emprunt', v: euros(f.capacite) },
          { k: 'Montant à financer', v: euros(f.emprunt) },
          { k: 'Mensualité estimée', v: euros(f.mensualite) },
          { k: 'Taux d’endettement', v: pourcent(f.endettement) },
        ].filter(c => c.v).map(c => `<div><b>${esc(c.v)}</b><span>${esc(c.k)}</span></div>`).join('')}
      </div>
      ${puces('Ce qui bloque', liste(f.blocages), 'est-bloque')}
      ${puces('Les leviers', liste(f.leviers), 'est-levier')}
      <div class="cts-lignes">
        ${ligne('Projet', f.projet)}
        ${ligne('Type de bien', f.type_bien)}
        ${ligne('Où', [f.ville, f.region].filter(Boolean).join(' · '))}
        ${ligne('Avancement', f.avancement)}
        ${ligne('Primo-accédant', f.primo)}
        ${ligne('Budget', f.budget)}
        ${ligne('Travaux', f.travaux)}
        ${ligne('Apport', f.apport)}
        ${ligne('Durée souhaitée', f.duree)}
        ${ligne('Emprunteur 1', f.emprunteur_1)}
        ${ligne('Emprunteur 2', f.emprunteur_2)}
        ${ligne('Crédits en cours', f.credits_en_cours)}
        ${ligne('Revenus locatifs', f.revenus_locatifs)}
        ${ligne('Prêt à taux zéro', ptz)}
      </div>
    </section>${complements}`;
}

// ---------------------------------------------------------------- l'accueil
// Une carte de la colonne « Demandes du simulateur ».
export function carteSimulation(d, contact) {
  const f = d.fields || {};
  const feu = feuDe(d);
  const F = FEUX[feu];
  const nom = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : '';
  // Le titre de l'affaire est « Simulateur Feu vert — projet faisable — Prénom Nom » :
  // le nom est son dernier morceau.
  const titre = nom || String(d.title || '').split(' — ').pop();
  const ou = [f.projet, f.ville || f.region].filter(Boolean).join(' · ');
  const tel = contact?.phone;
  return `
    <article class="cts-carte ${F ? F.classe : ''}" data-deal="${esc(d.id)}" tabindex="0" role="button">
      <span class="cts-feu" title="${esc(F ? `${F.libelle} — ${F.phrase}` : 'Sans verdict')}"></span>
      <div class="cts-carte-tete">
        <b>${esc(titre)}</b>
        ${estNouvelle(d) ? '<span class="cts-neuf">Nouveau</span>' : ''}
        <time>${esc(depuis(d.created_at))}</time>
      </div>
      ${ou ? `<p class="cts-ou">${esc(ou)}</p>` : ''}
      <div class="cts-mini">${chiffresDe(d).slice(0, 3).map(c => `<span><em>${esc(c.k)}</em>${esc(c.v)}</span>`).join('')}</div>
      <div class="cts-carte-pied">
        <span class="cts-avis">${esc(F ? F.phrase : 'Simulation reçue')}</span>
        ${tel ? `<a class="cts-appel" href="tel:${esc(tel)}" data-tel>Appeler</a>` : ''}
      </div>
    </article>`;
}

// ---------------------------------------------------------------- saisie à la main
// Un dossier saisi dans le CRM (formulaire « + Prospect », courtage-nouveau.js) :
// « Le projet » puis « Les chiffres », rangés comme les étapes du formulaire,
// pour qu'on retrouve sur la fiche ce qu'on y a saisi, au même endroit.
// ⚠ C'EST LA FICHE DU DOSSIER QUI S'OUVRE DES DEUX CÔTÉS (18/11/2026) : la
// pipeline et la base de données montrent donc exactement ce bloc.
// Les avancements du formulaire du CRM (ceux du simulateur sont libellés autrement).
const AVANCEMENTS_CRM = ['Se renseigne', 'Cherche activement', 'Offre faite', 'Offre acceptée', 'Compromis signé'];
export function blocProjetSaisi(d, { simulation = false, toujours = false } = {}) {
  if (!d || d.activity !== 'courtage') return '';
  const f = d.fields || {};
  const fin = f.type_financement === 'Crédit professionnel' ? 'Financement professionnel' : f.type_financement;
  const lignes = [
    // Pour une simulation, le projet, la ville et le budget sont déjà dans le bloc du simulateur.
    ['Financement', fin], ['Projet', simulation ? f.objectif : (f.objectif || f.projet)], ['Où en est-il', AVANCEMENTS_CRM.includes(f.avancement) || !simulation ? f.avancement : ''],
    ['Ville du projet', simulation ? '' : f.ville], ['Ce qu’il a dit', f.message],
  ].filter(([, v]) => v);
  const mens = (x) => (euros(x) ? `${euros(x)} / mois` : '');
  const montants = [
    ['Montant du projet', euros(f.montant_projet)], ['Apport', euros(f.apport)],
    ['Montant à financer', euros(f.montant_financement)], ['Revenus du foyer', mens(f.revenus_foyer)],
    ['Crédits en cours', mens(f.credits_en_cours)], ['Durée', f.duree], ['Emprunteurs', f.emprunteurs],
  ].filter(([, v]) => v);
  const e = nombre(f.endettement);
  const ton = e === null ? '' : e <= 35 ? 'est-vert' : e <= 38 ? 'est-orange' : 'est-rouge';
  const calc = simulation ? [] : [
    ['Mensualité estimée', euros(f.mensualite), ''], ['Taux d’endettement', pourcent(f.endettement), ton],
    ['Capacité d’emprunt', euros(f.capacite), ''],
  ].filter(([, v]) => v);
  // `toujours` : la fiche en quatre parties montre « Le projet » et « Les
  // chiffres » même vides, avec une invitation à compléter (18/11/2026).
  if (!toujours && !lignes.length && !montants.length && !calc.length) return '';
  const num = (n) => (toujours ? `<span class="lrc-num-partie">${n}</span>` : '');
  const vide = '<p class="rgdf-rien lrc-a-completer">À compléter avec « Modifier ».</p>';
  return `
    ${lignes.length || toujours ? `<section class="rgdf-bloc cts-fiche lrc-partie">
      <h3>${num(1)}Le projet</h3>
      ${lignes.length ? `<div class="cts-lignes">${lignes.map(([k, v]) => `<div class="cts-ligne"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : vide}
    </section>` : ''}
    ${montants.length || calc.length || toujours ? `<section class="rgdf-bloc cts-fiche lrc-partie">
      <h3>${num(2)}Les chiffres</h3>
      ${!montants.length && !calc.length ? vide : ''}
      ${calc.length ? `<div class="cts-chiffres">${calc.map(([k, v, t]) => `<div class="${t}"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : ''}
      <div class="cts-lignes">${montants.map(([k, v]) => `<div class="cts-ligne"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
    </section>` : ''}`;
}
