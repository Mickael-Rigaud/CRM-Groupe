// Modifier les informations d'une fiche RGD, depuis la fiche elle-même
//
// POURQUOI CE MODULE EXISTE, ALORS QUE L'ESPACE RGD ÉTAIT EN LECTURE SEULE
// L'en-tête de `rgd-fiche.js` disait : « le reste se saisit dans l'application
// RGD, qui reste la source ; un formulaire ici serait écrasé au relevé
// suivant ». C'était exact, et c'est la raison pour laquelle il n'y en avait
// pas. Demandé le 24/09/2026 : « je voudrais avoir la possibilité de modifier
// les informations ».
//
// ⚠ CE QUI REND LA CHOSE POSSIBLE, C'EST D'ÉCRIRE À LA SOURCE.
// `push_rgd_clients` réécrit `nature_travaux`, `budget_travaux`,
// `adresse_chantier` et l'identité depuis D1 à CHAQUE relevé, sans `coalesce`.
// Une valeur posée dans Supabase seul survivrait moins d'une demi-heure — et
// c'est très exactement la perte signalée le même jour : « quand je refresh,
// les modifications sont perdues ». Le formulaire écrit donc chez Cloudflare
// quand la fiche en vient, et le relevé ramène. Ailleurs, il écrit dans
// Supabase, qui est alors la seule source.
//
// ⚠ LE PRIX DE CE SENS UNIQUE : la valeur saisie ne revient de D1 qu'au relevé
// suivant, jusqu'à trente minutes. On met donc le reflet local à jour tout de
// suite — sans quoi le champ reprendrait son ancienne valeur sous les yeux de
// qui vient de le changer. Ce n'est pas un mensonge : la source a bien été
// écrite, c'est la copie qui est en retard.
//
// ⚠ UNE DEMANDE VENUE DU SITE NE SE MODIFIE PAS ICI, et ce n'est pas un oubli.
// `routes/leads.js` du worker n'accepte que `statut`, `commentaire_admin` et
// `traite_par_id` : aucun champ d'identité ni de projet. Proposer le
// formulaire donnerait un enregistrement qui répond « ok » et ne change rien —
// le pire des deux mondes. L'écran le dit au lieu de le cacher.
import { db } from '../data/db.js';
import { esc, toast } from '../ui.js';
import { majChampsClient } from '../data/rgd-api.js';

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
  if (x.genre === 'demande' && x.ligne.d1_id != null) {
    return 'Une demande venue du formulaire du site se modifie dans l’application RGD : '
      + 'le tableau de bord n’accepte d’ici que son statut et son commentaire.';
  }
  if (!personneDe(x.ligne) && x.genre !== 'demande') {
    return 'Cette fiche n’est rattachée à aucun contact ni à aucune organisation : '
      + 'il n’y a rien à modifier tant que le rattachement n’est pas fait.';
  }
  return null;
}

const champ = (cle, libelle, valeur, opts = {}) => `
  <div class="rgdm-champ ${opts.large ? 'est-large' : ''}">
    <label for="rgdm-${cle}">${esc(libelle)}</label>
    <input id="rgdm-${cle}" name="${cle}" type="${opts.type || 'text'}"
      ${opts.step ? `step="${opts.step}"` : ''}
      ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}
      value="${esc(valeur ?? '')}">
  </div>`;

/** Le formulaire, en remplacement des deux blocs d'information. */
export function formulaireModif(x) {
  const f = x.ligne;
  const p = personneDe(f);
  const l = p?.ligne || {};
  const estDemande = x.genre === 'demande';

  // Une demande porte son identité EN DOUBLE : sur le contact et sur ses
  // propres colonnes, parce que la table a la forme de D1. On montre celle du
  // contact quand il existe — c'est elle que le reste du CRM lit.
  const nom = p?.pro ? '' : (l.last_name ?? f.nom ?? '');
  const prenom = p?.pro ? '' : (l.first_name ?? f.prenom ?? '');

  return `<form id="rgdm" class="rgdm">
    <section class="rgdf-bloc">
      <h3>Le prospect</h3>
      <div class="rgdm-grille">
        ${p?.pro
          ? champ('raison_sociale', 'Raison sociale', l.name, { large: true })
          : champ('prenom', 'Prénom', prenom) + champ('nom', 'Nom', nom)}
        ${champ('telephone', 'Téléphone', l.phone ?? f.telephone, { type: 'tel' })}
        ${champ('email', 'E-mail', l.email ?? f.email, { type: 'email' })}
        ${champ('adresse', 'Adresse', l.address ?? f.adresse, { large: true })}
        ${champ('code_postal', 'Code postal', l.postal_code ?? f.code_postal)}
        ${champ('ville', 'Ville', l.city ?? f.ville)}
      </div>
    </section>

    <section class="rgdf-bloc">
      <h3>Le projet</h3>
      <div class="rgdm-grille">
        ${champ('nature_travaux', 'Nature des travaux',
          estDemande ? f.type_projet : f.nature_travaux, { large: true })}
        ${champ('budget_travaux', 'Budget annoncé (€)',
          estDemande ? f.budget : f.budget_travaux, { type: 'number', step: '100' })}
        ${champ('type_bien', 'Type de bien', estDemande ? f.type_projet : f.type_bien)}
        <!-- L'adresse du chantier n'est pas celle de la personne : un chantier
             se fait souvent ailleurs que chez elle. Elle existait en base et
             ne s'affichait nulle part avant le 24/09/2026. -->
        ${champ('adresse_chantier', 'Adresse du chantier',
          estDemande ? '' : f.adresse_chantier, { large: true })}
      </div>
      ${estDemande ? '' : `<p class="rgdf-source">Enregistré dans le tableau de bord RGD,
        qui reste la source. La fiche se met à jour ici tout de suite ; les autres
        écrans suivront au prochain relevé.</p>`}
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
  const nombre = (v) => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };

  if (x.genre !== 'demande' && f.d1_id != null) {
    const r = await majChampsClient(f.d1_id, {
      nom: texte(valeurs.nom), prenom: texte(valeurs.prenom),
      raison_sociale: texte(valeurs.raison_sociale),
      email: texte(valeurs.email), telephone: texte(valeurs.telephone),
      adresse: texte(valeurs.adresse), code_postal: texte(valeurs.code_postal),
      ville: texte(valeurs.ville),
      nature_travaux: texte(valeurs.nature_travaux),
      budget_travaux: nombre(valeurs.budget_travaux),
      adresse_chantier: texte(valeurs.adresse_chantier),
      type_bien: texte(valeurs.type_bien),
    });
    if (!r.ok) {
      return { ok: false, motif: r.motif === 'pas-de-compte'
        ? 'Aucun compte RGD à votre adresse : rien n’a été enregistré.'
        : r.motif };
    }
    // Le reflet local, pour que l'écran ne revienne pas en arrière pendant la
    // demi-heure qui précède le relevé. La base Supabase, elle, sera corrigée
    // par le relevé — on ne l'écrit pas ici, ce serait une seconde vérité.
    if (p) majRefletPersonne(p, valeurs);
    avancerVue(x, valeurs);
    return { ok: true };
  }

  // Née ici : Supabase est la source, on écrit vraiment.
  try {
    if (x.genre === 'demande') {
      await db.update('rgd_demandes', f.id, {
        nom: texte(valeurs.nom), prenom: texte(valeurs.prenom),
        email: texte(valeurs.email), telephone: texte(valeurs.telephone),
        adresse: texte(valeurs.adresse), code_postal: texte(valeurs.code_postal),
        ville: texte(valeurs.ville),
        type_projet: texte(valeurs.type_bien) || texte(valeurs.nature_travaux),
        budget: texte(valeurs.budget_travaux),
      });
    } else {
      await db.update('rgd_clients', f.id, {
        nature_travaux: texte(valeurs.nature_travaux),
        budget_travaux: nombre(valeurs.budget_travaux),
        adresse_chantier: texte(valeurs.adresse_chantier),
        type_bien: texte(valeurs.type_bien),
      });
    }
    if (p) {
      await db.update(p.table, p.ligne.id, p.pro
        ? { name: texte(valeurs.raison_sociale), email: texte(valeurs.email),
            phone: texte(valeurs.telephone), address: texte(valeurs.adresse),
            postal_code: texte(valeurs.code_postal), city: texte(valeurs.ville) }
        : { first_name: texte(valeurs.prenom), last_name: texte(valeurs.nom),
            email: texte(valeurs.email), phone: texte(valeurs.telephone),
            address: texte(valeurs.adresse), postal_code: texte(valeurs.code_postal),
            city: texte(valeurs.ville) });
    }
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
  const n = (y) => { const c = Number(y); return Number.isFinite(c) && String(y).trim() !== '' ? c : null; };

  if (x.genre === 'demande') {
    f.nom = t(v.nom); f.prenom = t(v.prenom);
    f.email = t(v.email); f.telephone = t(v.telephone);
    f.adresse = t(v.adresse); f.code_postal = t(v.code_postal); f.ville = t(v.ville);
    f.budget = t(v.budget_travaux);
  } else {
    f.nature_travaux = t(v.nature_travaux);
    f.budget_travaux = n(v.budget_travaux);
    f.adresse_chantier = t(v.adresse_chantier);
    f.type_bien = t(v.type_bien);
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

// Le reflet de la personne, quand l'écriture est partie chez Cloudflare. Les
// noms de colonnes sont ceux du CRM, pas ceux de D1 : c'est la copie locale
// qu'on avance, pas la source.
function majRefletPersonne(p, v) {
  const t = (x) => { const s = String(x ?? '').trim(); return s === '' ? null : s; };
  const l = p.ligne;
  if (p.pro) { l.name = t(v.raison_sociale) ?? l.name; }
  else { l.first_name = t(v.prenom); l.last_name = t(v.nom); }
  l.email = t(v.email); l.phone = t(v.telephone);
  l.address = t(v.adresse); l.postal_code = t(v.code_postal); l.city = t(v.ville);
}

/** Les valeurs saisies, lues sur le formulaire. */
export const lireModif = (form) => Object.fromEntries(
  [...form.querySelectorAll('input[name]')].map(i => [i.name, i.value]));
