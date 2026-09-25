// Modifier les informations d'une fiche RGD, depuis la fiche elle-même
//
// POURQUOI CE MODULE EXISTE, ALORS QUE L'ESPACE RGD ÉTAIT EN LECTURE SEULE
// L'en-tête de `rgd-fiche.js` disait : « le reste se saisit dans l'application
// RGD, qui reste la source ; un formulaire ici serait écrasé au relevé
// suivant ». C'était exact, et c'est la raison pour laquelle il n'y en avait
// pas. Demandé le 24/09/2026 : « je voudrais avoir la possibilité de modifier
// les informations ».
//
// ⚠ IL A FALLU ÉCRIRE À LA SOURCE JUSQU'AU 25/09/2026, et c'est ce qui
// explique la forme qu'avait ce fichier. `push_rgd_clients` réécrivait
// `nature_travaux`, `budget_travaux`, `adresse_chantier` et l'identité depuis
// D1 à CHAQUE relevé, sans `coalesce` : une valeur posée dans Supabase seul
// survivait moins d'une demi-heure — très exactement la perte signalée le
// 24/09, « quand je refresh, les modifications sont perdues ». Le formulaire
// avait donc DEUX destinations selon l'origine de la fiche.
//
// ⚠ IL N'EN A PLUS QU'UNE. La synchronisation a cessé de reposer ces colonnes
// (`rgd_clients_et_demandes_sortent_du_releve`) : tout s'écrit dans le CRM, qui
// en est la source. Ce qui disparaît avec le détour — le renvoi des champs
// portables vers Costructor — est une décision de Mickael : la base de
// référence est celle du CRM, celle de Costructor « était un peu fausse
// finalement ».
//
// ⚠ UNE DEMANDE VENUE DU SITE SE MODIFIE MAINTENANT, ELLE AUSSI. Elle était
// en lecture seule parce que `routes/leads.js` n'acceptait que `statut`,
// `commentaire_admin` et `traite_par_id` : proposer le formulaire aurait donné
// un enregistrement qui répond « ok » sans rien changer. Cette route n'est plus
// dans la boucle, et `push_rgd_demandes` n'a jamais reposé l'identité ni le
// projet — il ne les écrivait qu'à l'insertion. Le refus n'avait donc plus
// d'objet.
//
// ⚠ LE REFLET LOCAL EST TOUJOURS AVANCÉ À LA MAIN, pour une autre raison que
// le relevé : `db.update` REMPLACE la ligne du cache, et la fiche en garde une
// référence orpheline. Voir `avancerVue` plus bas.
import { db } from '../data/db.js';
import { esc, toast } from '../ui.js';
import { BIEN, RESIDENCE, TRAVAUX, BUDGETS, listeTravaux, texteTravaux }
  from '../data/rgd-formulaire.js';

// La personne derrière la fiche, telle qu'on peut l'écrire. Un particulier est
// un contact, un professionnel une organisation : deux tables, deux jeux de
// colonnes, et le formulaire ne montre que celles qui existent.
const personneDe = (f) => {
  const c = f.contact_id && db.byId('contacts', f.contact_id);
  if (c) return { table: 'contacts', ligne: c, pro: false };
  const o = f.organisation_id && db.byId('organisations', f.organisation_id);
  if (o) return { table: 'organisations', ligne: o, pro: true };
  return null;
};

/**
 * Peut-on modifier cette fiche, et sinon pourquoi ? Rend `null` quand c'est
 * possible, et la raison quand ça ne l'est pas — l'écran l'affiche telle quelle.
 */
export function refusDeModifier(x) {
  // ⚠ IL Y AVAIT UN PREMIER REFUS ICI, RETIRÉ LE 25/09/2026 : une demande venue
  // du formulaire du site était en lecture seule, parce que la route de
  // l'application RGD n'acceptait que son statut et son commentaire. Elle
  // n'est plus dans la boucle. Ne pas le remettre.
  if (!personneDe(x.ligne) && x.genre !== 'demande') {
    return 'Cette fiche n’est rattachée à aucun contact ni à aucune organisation : '
      + 'il n’y a rien à modifier tant que le rattachement n’est pas fait.';
  }
  return null;
}

const boite = (cle, libelle, dedans, opts = {}) => `
  <div class="rgdm-champ ${opts.large ? 'est-large' : ''}" data-champ="${cle}">
    <label for="rgdm-${cle}">${esc(libelle)}</label>${dedans}
  </div>`;

const champ = (cle, libelle, valeur, opts = {}) => boite(cle, libelle, `
    <input id="rgdm-${cle}" name="${cle}" type="${opts.type || 'text'}"
      ${opts.step ? `step="${opts.step}"` : ''}
      ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}
      value="${esc(valeur ?? '')}">`, opts);

// ⚠ UNE VALEUR DÉJÀ EN BASE QUI N'EST PAS DANS LA LISTE Y EST AJOUTÉE, cochée.
// Sans ça, elle ne s'afficherait nulle part dans le formulaire et le premier
// enregistrement l'EFFACERAIT en silence. Le cas est réel, pas théorique : une
// demande du jeu d'essai porte « Menuiseries » là où la liste dit « Menuiserie
// PVC », et un budget « 15 000 € » qui ne correspond à aucune tranche. Le
// vocabulaire a bougé avec le temps, et ce n'est pas au formulaire de trancher.
// On la marque `est-hors-liste` : elle se voit, elle se décoche, mais elle ne
// disparaît pas toute seule.
const avecLesValeursPresentes = (options, presentes) => [
  ...options,
  ...presentes.filter(v => v && !options.includes(v)),
];

const liste = (cle, libelle, options, valeur, opts = {}) => boite(cle, libelle, `
    <select id="rgdm-${cle}" name="${cle}">
      <option value="">—</option>
      ${avecLesValeursPresentes(options, [valeur]).map(o => `
        <option value="${esc(o)}"${o === valeur ? ' selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`, opts);

const zone = (cle, libelle, valeur, opts = {}) => boite(cle, libelle, `
    <textarea id="rgdm-${cle}" name="${cle}" rows="${opts.rows || 3}"
      ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}>${esc(valeur ?? '')}</textarea>`,
  { large: true });

// ⚠ LES PUCES SONT LES MÊMES QU'À LA SAISIE D'UNE DEMANDE, y compris la règle
// « plusieurs travaux, un seul budget » (checkbox contre radio) : deux écrans qui
// posent la même question doivent l'offrir de la même façon, sinon on croit que
// ce ne sont pas les mêmes données.
const puces = (cle, libelle, options, type, cochees) => boite(cle, libelle, `
    <div class="rgdm-puces">${avecLesValeursPresentes(options, cochees).map((o, i) => `
      <label class="rgdm-puce ${options.includes(o) ? '' : 'est-hors-liste'}">
        <input type="${type}" name="${cle}" id="rgdm-${cle}-${i}" value="${esc(o)}"
          ${cochees.includes(o) ? 'checked' : ''}>
        <span>${esc(o)}</span>
      </label>`).join('')}</div>`, { large: true });

/**
 * Les six réponses « projet » d'une fiche, d'où qu'elle vienne.
 *
 * ⚠ UNE SEULE TRADUCTION, LUE PAR LE FORMULAIRE ET PAR LA FICHE. Les deux
 * écrans montraient les mêmes questions à partir de colonnes différentes selon
 * le genre de la ligne ; deux traductions auraient fini par ne plus dire la
 * même chose, et le défaut ne se serait vu que sur un genre de fiche.
 *
 * ⚠ ON NE PRÉ-REMPLIT PAS DEPUIS LES COLONNES `meta_*`. Un lead Facebook
 * répond dans SON vocabulaire : sa valeur ne figure pas forcément dans les
 * listes d'ici, la puce resterait décochée, et enregistrer effacerait ce que la
 * personne avait répondu. La fiche en lecture les affiche toujours, en repli.
 */
export function valeursProjet(x) {
  const f = x.ligne;
  if (x.genre === 'demande') return {
    type_projet: f.type_projet || '',
    type_intervention: f.type_intervention || '',
    superficie: f.superficie || '',
    types_travaux: f.types_travaux || '',
    budget_annonce: f.budget || '',
    projet_description: f.projet_description || '',
    adresse_chantier: '',
  };
  return {
    type_projet: f.type_bien || '',
    type_intervention: f.type_intervention || '',
    superficie: f.superficie || '',
    types_travaux: f.types_travaux || '',
    budget_annonce: f.budget_annonce || '',
    projet_description: f.projet_description || '',
    adresse_chantier: f.adresse_chantier || '',
  };
}

/**
 * Le formulaire, en remplacement des deux blocs d'information.
 *
 * ⚠ `propose` PRÉ-REMPLIT SANS AVOIR RIEN ENREGISTRÉ. Le téléphone lu dans la
 * description du rendez-vous n'existe nulle part en base : l'afficher en
 * lecture seule obligerait à le recopier à la main pour qu'il devienne une
 * coordonnée. Posé dans le champ, un seul « Enregistrer » suffit — et il reste
 * modifiable, ce qui compte : la lecture d'un numéro écrit à la main peut se
 * tromper, et c'est à l'humain de trancher, pas à une expression régulière.
 */
export function formulaireModif(x, propose = {}) {
  const f = x.ligne;
  const p = personneDe(f);
  const l = p?.ligne || {};
  const estDemande = x.genre === 'demande';

  // Une demande porte son identité EN DOUBLE : sur le contact et sur ses
  // propres colonnes, parce que la table a la forme de D1. On montre celle du
  // contact quand il existe — c'est elle que le reste du CRM lit.
  const nom = p?.pro ? '' : (l.last_name ?? f.nom ?? '');
  const prenom = p?.pro ? '' : (l.first_name ?? f.prenom ?? '');
  const v = valeursProjet(x);

  return `<form id="rgdm" class="rgdm">
    <section class="rgdf-bloc">
      <h3>Le prospect</h3>
      <div class="rgdm-grille">
        ${p?.pro
          ? champ('raison_sociale', 'Raison sociale', l.name, { large: true })
          : champ('prenom', 'Prénom', prenom) + champ('nom', 'Nom', nom)}
        ${champ('telephone', 'Téléphone',
          l.phone || f.telephone || propose.telephone || '', { type: 'tel' })}
        ${champ('email', 'E-mail', l.email ?? f.email, { type: 'email' })}
        ${champ('adresse', 'Adresse', l.address ?? f.adresse, { large: true })}
        ${champ('code_postal', 'Code postal', l.postal_code ?? f.code_postal)}
        ${champ('ville', 'Ville', l.city ?? f.ville)}
      </div>
    </section>

    <section class="rgdf-bloc">
      <h3>Le projet</h3>
      <div class="rgdm-grille">
        ${liste('type_projet', 'Type de bien', BIEN, v.type_projet)}
        ${liste('type_intervention', 'Usage du bien', RESIDENCE, v.type_intervention)}
        ${champ('superficie', 'Superficie', v.superficie, { type: 'number', placeholder: 'm²' })}
        ${puces('types_travaux', 'Types de travaux', TRAVAUX, 'checkbox', listeTravaux(v.types_travaux))}
        ${puces('budget_annonce', 'Budget annoncé', BUDGETS, 'radio', [v.budget_annonce])}
        <!-- L'adresse du chantier n'est pas celle de la personne : un chantier
             se fait souvent ailleurs que chez elle. Elle existait en base et
             ne s'affichait nulle part avant le 24/09/2026. -->
        ${champ('adresse_chantier', 'Adresse du chantier', v.adresse_chantier, { large: true })}
        ${zone('projet_description', 'Ce que la personne demande', v.projet_description,
          { rows: 4, placeholder: 'Noté pendant l’appel : ce qu’elle veut faire, ses délais, ce qui l’inquiète…' })}
      </div>
    </section>

    <div class="rgdm-pied">
      <button type="button" class="btn ghost" id="rgdm-annuler">Annuler</button>
      <button type="submit" class="btn" id="rgdm-ok">Enregistrer</button>
    </div>
  </form>`;
}

/**
 * Enregistre. Rend `{ ok: true }` ou `{ ok: false, motif }`.
 *
 * ⚠ DEUX DESTINATIONS, ET C'EST L'ORIGINE DE LA FICHE QUI DÉCIDE — la même
 * règle que `ecrireStatut`. Une fiche venue de Cloudflare s'écrit là-bas, sans
 * quoi le relevé suivant rétablirait l'ancienne valeur ; une fiche née ici n'y
 * existe pas, et Supabase est sa seule adresse.
 */
export async function enregistrerModif(x, valeurs) {
  const f = x.ligne;
  const p = personneDe(f);
  const texte = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };
  const travaux = texte(texteTravaux(valeurs.types_travaux));

  // Les cinq réponses que le relevé ne connaît pas, et qui n'existent donc que
  // dans le CRM (migration `rgd_clients_champs_du_formulaire_projet`).
  const auCrm = {
    type_intervention: texte(valeurs.type_intervention),
    superficie: texte(valeurs.superficie),
    types_travaux: travaux,
    projet_description: texte(valeurs.projet_description),
    budget_annonce: texte(valeurs.budget_annonce),
  };

  const identite = (avec) => avec.pro
    ? { name: texte(valeurs.raison_sociale), email: texte(valeurs.email),
        phone: texte(valeurs.telephone), address: texte(valeurs.adresse),
        postal_code: texte(valeurs.code_postal), city: texte(valeurs.ville) }
    : { first_name: texte(valeurs.prenom), last_name: texte(valeurs.nom),
        email: texte(valeurs.email), phone: texte(valeurs.telephone),
        address: texte(valeurs.adresse), postal_code: texte(valeurs.code_postal),
        city: texte(valeurs.ville) };

  try {
    if (x.genre === 'demande') {
      // Une demande porte déjà toutes ces colonnes : elle a la forme du
      // formulaire du site, c'est de là qu'elle vient.
      await db.update('rgd_demandes', f.id, {
        nom: texte(valeurs.nom), prenom: texte(valeurs.prenom),
        email: texte(valeurs.email), telephone: texte(valeurs.telephone),
        adresse: texte(valeurs.adresse), code_postal: texte(valeurs.code_postal),
        ville: texte(valeurs.ville),
        type_projet: texte(valeurs.type_projet),
        type_intervention: texte(valeurs.type_intervention),
        superficie: texte(valeurs.superficie),
        types_travaux: travaux,
        projet_description: texte(valeurs.projet_description),
        budget: texte(valeurs.budget_annonce),
      });
    } else {
      // ⚠ UNE SEULE DESTINATION DEPUIS LE 25/09/2026. Il y en avait deux :
      // `type_bien`, `adresse_chantier`, `nature_travaux` et l'identité
      // partaient dans l'application RGD parce que le relevé les y reprenait
      // à chaque passage, sans `coalesce` ; les cinq autres colonnes, qu'il ne
      // connaît pas, restaient ici. Il ne repose plus rien de tout cela.
      //
      // ⚠ `nature_travaux` REÇOIT TOUJOURS LA MÊME LISTE QUE `types_travaux`,
      // et ce n'est pas devenu inutile : c'est la colonne que lisent les
      // écrans venus du tableau de bord, la laisser en arrière ferait dire deux
      // choses différentes à deux endroits du CRM.
      await db.update('rgd_clients', f.id, {
        ...auCrm,
        nature_travaux: travaux,
        adresse_chantier: texte(valeurs.adresse_chantier),
        type_bien: texte(valeurs.type_projet),
      });
    }
    if (p) await db.update(p.table, p.ligne.id, identite(p));
    avancerVue(x, valeurs);
    return { ok: true };
  } catch (e) {
    return { ok: false, motif: String(e.message || e).slice(0, 120) };
  }
}

/**
 * Reporte les valeurs enregistrées sur l'objet que la fiche a sous la main.
 *
 * ⚠ CE N'EST PAS UN CONFORT D'AFFICHAGE, C'EST CE QUI REND L'ÉCRAN EXACT.
 * `db.update` ne modifie pas la ligne, il la REMPLACE dans le cache
 * (`this.cache[table][i] = r`) : la fiche garde donc une référence orpheline,
 * et redessiner après un enregistrement réussi rendait les ANCIENNES valeurs.
 * Constaté à l'essai : budget passé à 52 000, tuile toujours à 45 000, avec
 * « Informations enregistrées » affiché par-dessus — le pire des deux mondes,
 * puisque la base était juste et l'écran faux.
 *
 * ⚠ `x` EST UN INSTANTANÉ, PAS LA LIGNE. `ficheDe()` a recopié le téléphone,
 * le mail et l'adresse depuis le contact au moment de l'ouverture ; avancer
 * `x.ligne` seul laisserait le bloc « Le prospect » sur les anciennes
 * coordonnées. Les deux sont donc avancés ensemble.
 */
function avancerVue(x, v) {
  const f = x.ligne;
  const t = (y) => { const c = String(y ?? '').trim(); return c === '' ? null : c; };

  const travaux = t(texteTravaux(v.types_travaux));
  f.type_intervention = t(v.type_intervention);
  f.superficie = t(v.superficie);
  f.types_travaux = travaux;
  f.projet_description = t(v.projet_description);

  if (x.genre === 'demande') {
    f.nom = t(v.nom); f.prenom = t(v.prenom);
    f.email = t(v.email); f.telephone = t(v.telephone);
    f.adresse = t(v.adresse); f.code_postal = t(v.code_postal); f.ville = t(v.ville);
    f.type_projet = t(v.type_projet);
    f.budget = t(v.budget_annonce);
  } else {
    f.nature_travaux = travaux;
    f.budget_annonce = t(v.budget_annonce);
    f.adresse_chantier = t(v.adresse_chantier);
    f.type_bien = t(v.type_projet);
  }

  x.tel = t(v.telephone) || '';
  x.email = t(v.email) || '';
  x.ville = t(v.ville) || '';
  x.adresse = [t(v.adresse), [t(v.code_postal), t(v.ville)].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const nomComplet = t(v.raison_sociale)
    || [t(v.prenom), t(v.nom)].filter(Boolean).join(' ');
  if (nomComplet) x.nom = nomComplet;
}

// ⚠ `majRefletPersonne` A DISPARU LE 25/09/2026, et il n'y a rien à remettre.
// Elle avançait la copie locale du contact quand l'écriture partait chez
// Cloudflare sans passer par `db.update` — cas qui n'existe plus. Le contact
// s'écrit maintenant par `db.update`, qui remet la ligne dans le cache, et la
// fiche la relit par `db.byId` à chaque rendu.

/**
 * Les valeurs saisies, lues sur le formulaire.
 *
 * ⚠ NE PAS REVENIR À `querySelectorAll('input[name]')` + `.value`. Le
 * formulaire porte désormais des listes déroulantes, une zone de texte, des
 * cases à cocher et des boutons radio : lire `.value` sur une case rend son
 * libellé qu'elle soit cochée ou non, et sept travaux auraient été enregistrés
 * à chaque fois. C'est la faute qui avait déjà fait enregistrer « Moins de
 * 20 000 € » pour tous les budgets à la saisie d'une demande.
 *
 * Les cases rendent un TABLEAU (plusieurs travaux), les radios une chaîne (un
 * seul budget) — et une chaîne vide quand rien n'est coché, sans quoi on ne
 * pourrait jamais effacer un budget choisi par erreur.
 */
export function lireModif(form) {
  const valeurs = {};
  for (const el of form.querySelectorAll('[name]')) {
    const cle = el.name;
    if (el.type === 'checkbox') {
      if (!Array.isArray(valeurs[cle])) valeurs[cle] = [];
      if (el.checked) valeurs[cle].push(el.value);
    } else if (el.type === 'radio') {
      if (el.checked) valeurs[cle] = el.value;
      else if (!(cle in valeurs)) valeurs[cle] = '';
    } else {
      valeurs[cle] = el.value;
    }
  }
  return valeurs;
}
