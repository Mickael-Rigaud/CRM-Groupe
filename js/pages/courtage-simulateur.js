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
// Un montant qui se lit par mois — revenus, loyer, crédits. Rien si la valeur
// n'est pas un nombre : « aucun » ne devient pas « 0 € / mois ».
const mensuel = (v) => (euros(v) ? `${euros(v)} / mois` : '');
const pourcent = (v) => { const n = nombre(v); return n === null ? '' : `${String(n).replace('.', ',')} %`; };
// « a | b | c » : la page sépare ainsi ses raisons et ses leviers.
// ⚠ ET LE TIRET CADRATIN SEUL N'EST PAS UNE VALEUR : c'est ainsi que le
// simulateur écrit « rien à signaler ». Sans ce filtre, un feu vert affichait
// « CE QUI BLOQUE · — » et « LES LEVIERS · — », deux titres en capitales pour
// dire qu'il n'y a rien à dire (18/11/2026).
const liste = (v) => String(v || '').split('|').map(s => s.trim())
  .filter(s => s && s !== '—' && s !== '-');

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
// ⚠ LE FEU EN GRAND DANS LA FICHE (18/11/2026, Mickael : « que les feux
// ressortent mieux dans la fiche projet »). Un vrai feu tricolore — trois
// lumières dans leur boîtier, celle du dossier allumée — en tête de « Les
// chiffres », avec le verdict en toutes lettres et ce qui le fonde. Sans feu,
// le boîtier reste éteint et dit ce qu'il manque pour l'allumer.
const PHRASES_FEU = { vert: 'Projet faisable', orange: 'Projet à optimiser', rouge: 'Projet à étudier' };
export function verdictFeu(d) {
  const f = d?.fields || {};
  const feu = feuDossier(d);
  const e = nombre(f.endettement);
  const pct = e !== null ? `${String(e).replace('.', ',')} % d’endettement` : '';
  const source = feuDe(d) ? 'verdict du simulateur' : pct ? 'calculé sur le taux d’endettement' : '';
  const manque = !nombre(f.montant_financement) && !nombre(f.emprunt)
    ? 'Montant à financer et revenus du foyer à compléter' : 'Revenus du foyer à compléter';
  return `<div class="lrc-verdict ${feu ? 'est-' + feu : 'est-eteint'}">
    <span class="lrc-feu-boitier" aria-hidden="true"><i class="r"></i><i class="o"></i><i class="v"></i></span>
    <div class="lrc-verdict-texte">
      <b>${feu ? esc(FEUX[feu].libelle) : 'Feu éteint'}</b>
      <span>${feu ? esc(PHRASES_FEU[feu]) + (pct ? ` · ${esc(pct)}` : '') : esc(manque)}</span>
      ${source ? `<em>${esc(source)}</em>` : '<em>« Modifier » → étape 2, « Les chiffres »</em>'}
    </div>
    ${f.relance_mois && feu === 'rouge' ? `<span class="cts-relance">À reprendre dans ${esc(f.relance_mois)} mois</span>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- deux noms pour une adresse
// ⚠ LA FICHE PEUT NE PAS PORTER LE NOM DE CELUI QUI A SIMULÉ (18/11/2026,
// Christophe : « j'ai fait un test au nom de pierre dupont mais sur le crm
// c'est elodie carré qui ressort […] et du coup ça me reprit les anciennes
// informations de Elodie Carré »).
//
// Ce n'est pas une panne, c'est une règle : `intake_lead_v2` retrouve un
// contact par son adresse et ne l'écrase JAMAIS — un formulaire public ne doit
// pas pouvoir renommer quelqu'un ni effacer son adresse postale. Mais quand
// deux personnes partagent une boîte mail (un couple, un essai), la fiche
// garde le nom du premier et le courtier décroche en appelant la mauvaise
// personne. La divergence était bien tracée, dans l'historique, sous une
// dizaine d'événements : autant dire nulle part.
//
// Elle se dit donc ici, en tête du dossier. On compare sur les lettres seules,
// accents et casse mis à plat : « Élodie CARRÉ » et « elodie carre » sont la
// même personne, et un bandeau qui crie pour rien n'est plus lu.
const aplat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function alerteNomDiverge(d, contact) {
  const saisi = String(d?.fields?.client_declare || '').trim();
  const fiche = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : '';
  if (!saisi || !fiche || aplat(saisi) === aplat(fiche)) return '';
  return `<div class="cts-alerte-nom" role="status">
    <b>Le simulateur a été rempli au nom de ${esc(saisi)}.</b>
    <span>La fiche est celle de ${esc(fiche)}, déjà connue à cette adresse e-mail —
    elle n’a pas été renommée, et ses coordonnées (adresse, ville) sont les
    siennes, pas celles saisies ici. Vérifiez à qui vous parlez avant d’appeler.</span>
  </div>`;
}

// ---------------------------------------------------------------- le récapitulatif
// Le texte complet que la page a composé, tel qu'il part par mail.
// ⚠ IL NE S'AFFICHE PLUS COMME UNE VALEUR DE LIGNE (18/11/2026, Christophe :
// « la ligne "ce qu'il a dit" sur le crm ne va pas du tout, j'ai toutes les
// infos en mode brouillon »). C'est un document de trente lignes, avec ses
// colonnes et ses séparateurs : coulé dans un `<b>` justifié, il devenait une
// bouillie. Il est replié, et respecte ses retours à la ligne quand on l'ouvre.
// Tout ce qu'il contient est par ailleurs rangé en lignes propres ci-dessus :
// il ne sert plus qu'à relire la simulation mot pour mot.
function blocRecap(f) {
  // ⚠ `message` EST LE REPLI DES AFFAIRES D'AVANT LE 18/11/2026 : le
  // récapitulatif y arrivait jusque-là. Le lire ici évite que la correction
  // vide les fiches déjà enregistrées de ce qu'elles portaient.
  const t = String(f.recap_simulateur || f.message || '').trim();
  if (!t) return '';
  return `<details class="cts-recap">
    <summary>Le récapitulatif complet du simulateur</summary>
    <pre>${esc(t)}</pre>
  </details>`;
}

// ---------------------------------------------------------------- la fiche
// Le bloc « Le simulateur » de la fiche d'une affaire. Rien si l'affaire n'en vient pas.
export function blocSimulateurFiche(d, { toujours = false, contact = null } = {}) {
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
    const n = (k) => `<span class="lrc-num-partie">${k}</span>`;
    return `
    <section class="rgdf-bloc cts-fiche lrc-partie ${F ? F.classe : ''}">
      <h3>${n(1)}Le projet <span class="cts-source">via le simulateur</span></h3>
      ${alerteNomDiverge(d, contact)}
      <div class="cts-lignes">
        ${ligne('Financement', fin)}
        ${ligne('Projet', f.objectif || f.projet)}
        ${ligne('Type de bien', f.type_bien)}
        ${ligne('Où', [f.ville, f.region].filter(Boolean).join(' · '))}
        ${ligne('Où en est-il', f.avancement)}
        ${ligne('Primo-accédant', f.primo)}
        ${ligne('Travaux', f.travaux)}
      </div>
      ${puces('Ce qui bloque', liste(f.blocages), 'est-bloque')}
      ${puces('Les leviers', liste(f.leviers), 'est-levier')}
      ${blocRecap(f)}
    </section>
    <section class="rgdf-bloc cts-fiche lrc-partie">
      <h3>${n(2)}Les chiffres</h3>
      ${verdictFeu(d)}
      <div class="cts-chiffres">
        ${[
          { k: 'Mensualité estimée', v: euros(f.mensualite) },
          { k: 'Taux d’endettement', v: pourcent(f.endettement) },
          { k: 'Capacité d’emprunt', v: euros(f.capacite) },
        ].filter(c => c.v).map(c => `<div><b>${esc(c.v)}</b><span>${esc(c.k)}</span></div>`).join('')}
      </div>
      <!-- ⚠ L'ORDRE EST CELUI D'UN MONTAGE BANCAIRE, pas celui du formulaire :
           ce qu'on finance, avec quoi, ce qui entre, ce qui sort, qui emprunte.
           Les lignes ajoutées le 18/11/2026 (épargne, autres revenus, pension,
           logement actuel, enfants, assurance, détail du crédit) étaient dans
           le mail interne depuis toujours et manquaient ici : c'est ce que
           Christophe ne « retrouvait pas » entre le simulateur et le CRM. -->
      <div class="cts-lignes">
        ${ligne('Budget', f.budget || euros(f.montant_projet))}
        ${ligne('Apport', euros(f.apport) || f.apport)}
        ${ligne('Épargne restante', euros(f.epargne_restante) || f.epargne_restante)}
        ${ligne('Montant à financer', euros(f.montant_financement) || euros(f.emprunt))}
        ${ligne('Revenus du foyer', mensuel(f.revenus_foyer))}
        ${ligne('Autres revenus', f.autres_revenus)}
        ${ligne('Revenus locatifs', f.revenus_locatifs)}
        ${ligne('Crédits en cours', mensuel(f.credits_en_cours) || f.credits_en_cours)}
        ${ligne('Détail du crédit', f.detail_credits)}
        ${ligne('Pension versée', f.pension_versee)}
        ${ligne('Logement actuel', f.logement_actuel)}
        ${ligne('Loyer actuel', mensuel(f.loyer_actuel) || f.loyer_actuel)}
        ${ligne('Durée souhaitée', f.duree)}
        ${ligne('Emprunteurs', f.emprunteurs)}
        ${ligne('Enfants à charge', f.enfants_a_charge)}
        ${ligne('Emprunteur 1', f.emprunteur_1)}
        ${ligne('Emprunteur 2', f.emprunteur_2)}
        <!-- Hors taux d'endettement : le simulateur l'estime à part, et un
             courtier qui lirait ce taux assurance comprise se tromperait. -->
        ${ligne('Assurance estimée', f.assurance)}
        ${ligne('Prêt à taux zéro', ptz)}
      </div>
    </section>`;
  }
  return `
    <section class="rgdf-bloc cts-fiche ${F ? F.classe : ''}">
      <h3>Le simulateur</h3>
      ${alerteNomDiverge(d, contact)}
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
        ${ligne('Épargne restante', f.epargne_restante)}
        ${ligne('Revenus du foyer', mensuel(f.revenus_foyer))}
        ${ligne('Autres revenus', f.autres_revenus)}
        ${ligne('Durée souhaitée', f.duree)}
        ${ligne('Emprunteurs', f.emprunteurs)}
        ${ligne('Enfants à charge', f.enfants_a_charge)}
        ${ligne('Emprunteur 1', f.emprunteur_1)}
        ${ligne('Emprunteur 2', f.emprunteur_2)}
        ${ligne('Crédits en cours', f.credits_en_cours)}
        ${ligne('Détail du crédit', f.detail_credits)}
        ${ligne('Pension versée', f.pension_versee)}
        ${ligne('Logement actuel', f.logement_actuel)}
        ${ligne('Loyer actuel', f.loyer_actuel)}
        ${ligne('Revenus locatifs', f.revenus_locatifs)}
        ${ligne('Assurance estimée', f.assurance)}
        ${ligne('Prêt à taux zéro', ptz)}
      </div>
      ${blocRecap(f)}
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
  const montants = [
    ['Montant du projet', euros(f.montant_projet)], ['Apport', euros(f.apport)],
    ['Montant à financer', euros(f.montant_financement)], ['Revenus du foyer', mensuel(f.revenus_foyer)],
    ['Crédits en cours', mensuel(f.credits_en_cours)], ['Durée', f.duree], ['Emprunteurs', f.emprunteurs],
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
      ${toujours ? verdictFeu(d) : ''}
      ${!montants.length && !calc.length ? vide : ''}
      ${calc.length ? `<div class="cts-chiffres">${calc.map(([k, v, t]) => `<div class="${t}"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>` : ''}
      <div class="cts-lignes">${montants.map(([k, v]) => `<div class="cts-ligne"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
    </section>` : ''}`;
}
