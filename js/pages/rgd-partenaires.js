// Espace RGD Renova — partenaires
//
// SUPABASE EST LA SOURCE DES PARTENAIRES DEPUIS LE 22/09/2026, et la porte
// SQL a été fermée le 25/09 — les deux dates ne disent pas la même chose.
//
// ⚠ LE 22/09, C'EST LE WORKER QUI A CESSÉ D'ENVOYER la charge `apporteurs`
// (`reprise_crm.js`, `compte.apporteurs = null`). Côté Supabase, en revanche,
// `push_rgd_partenaires` gardait son `insert … on conflict do update` sur
// `rgd_apporteurs` : une porte ouverte que plus personne ne franchissait.
// **Aucune donnée n'a été perdue** — vérifié des deux côtés le 25/09, la
// charge ne contient plus la clé du tout. Elle est néanmoins fermée depuis
// (migration `rgd_apports_et_partenaires_supabase`), pour la raison qui vaut
// ici comme pour les sous-traitants : **un ancien worker redéployé ne peut
// pas ressusciter l'écrasement**, et la porte compte désormais ce qu'elle
// jette (`apporteurs_ignores`).
//
// La leçon tient quand même : couper d'un seul côté laisse un piège armé pour
// le jour où quelqu'un redéploie une ancienne version. Voir
// `js/data/rgd-partenaires.js`, qui porte toute la mécanique d'écriture.
//
// TROIS SECTIONS, REFAITES LE 25/09/2026 SUR DEMANDE DE MICKAEL
// Apporteurs d'affaires ACTIFS · Fournisseurs · Apporteurs d'affaires
// INACTIFS. « Autres partenaires » a disparu, et sa seule fiche a rejoint les
// apporteurs. Le rôle « Commercial » est parti avec : personne ne savait le
// distinguer d'un apporteur, et une valeur qu'on ne sait pas définir finit par
// ramasser tout ce qui ne rentre nulle part.
//
// ⚠ L'ACTIF/INACTIF DÉCOUPE LES APPORTEURS, PAS LES FOURNISSEURS. Un
// fournisseur inactif reste un fournisseur — on ne lui apporte rien, on lui
// achète ; le découper en deux blocs ferait trois sections pour cinq fiches.
// Sa ligne est grisée quand il est inactif, comme avant.
//
// LES COLONNES DISENT L'ARGENT, PLUS LES COORDONNÉES (25/09/2026)
// Email et téléphone sont partis, remplacés par **Montant devis** et **Montant
// commissions**. C'est ce qu'on vient chercher dans une liste de partenaires :
// ce qu'ils rapportent. Les coordonnées sont dans la fiche, qu'un clic ouvre.
//
// ⚠ LES DEUX MONTANTS NE PORTENT PAS SUR LA MÊME POPULATION, et `totauxDe` le
// dit : le devis compte dès qu'il est chiffré, quelle que soit l'issue ; la
// commission ne compte QUE sur les affaires gagnées. Les additionner ou en
// tirer un taux donnerait un chiffre faux.
//
// LE TABLEAU DES APPORTS, EN BAS
// Une ligne par affaire présentée : apporteur, date, client, issue, montant du
// devis, montant de la commission. C'est lui qui alimente les deux colonnes
// ci-dessus — `apports_declares`, le compte tenu à la main dans l'application
// RGD, n'est donc plus ni affiché ni modifiable : un compte saisi et un compte
// constaté ne peuvent pas coexister sur le même écran sans qu'on finisse par
// se demander lequel est vrai.
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { toast, openModal, closeModal, confirm } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { creerPartenaire, majPartenaire, supprimerPartenaire,
         apportsDe, totauxDe, creerApport, majApport, supprimerApport }
  from '../data/rgd-partenaires.js';
// ⚠ LA PRÉSENTATION EST CELLE DE LA FICHE CLIENT, empruntée et non recopiée
// (25/09/2026 : « ajoute de la couleur dans la fiche, c'est trop triste là »).
// L'en-tête sur le fond de la marque, les tuiles de chiffres et les pastilles
// rondes colorées devant chaque information existaient déjà : deux fiches qui
// se ressemblent s'apprennent une fois.
import { initiales, tuile, info } from './rgd-fiche.js';

// Deux rôles, et pas trois. « Commercial » et « autre » ont été retirés le
// 25/09/2026 : une fiche qui les portait est devenue un apporteur.
const ROLES = {
  apporteur: { label: 'Apporteur d’affaires' },
  fournisseur: { label: 'Fournisseur' },
};

// ⚠ `apporteur` ATTRAPE AUSSI LES FICHES SANS RÔLE, et c'est volontaire : une
// fiche sans type n'est pas une fiche sans intérêt, et la laisser hors des
// sections la ferait disparaître de l'écran — le pire résultat possible pour
// un annuaire.
const estApporteur = (a) => (a.type_partenaire || 'apporteur') !== 'fournisseur';
const estActif = (a) => a.actif !== false;

const SECTIONS = [
  { cle: 'apporteur', titre: 'Apporteurs d’affaires actifs',
    bouton: '+ Nouvel apporteur', couleur: 'var(--accent)', montants: true,
    prend: (a) => estApporteur(a) && estActif(a) },
  { cle: 'fournisseur', titre: 'Fournisseurs',
    bouton: '+ Nouveau fournisseur', couleur: 'var(--blue)', montants: false,
    prend: (a) => !estApporteur(a) },
  { cle: 'inactif', titre: 'Apporteurs d’affaires inactifs',
    bouton: '', couleur: 'var(--muted)', montants: true, cree: 'apporteur',
    prend: (a) => estApporteur(a) && !estActif(a) },
];

const ISSUES = {
  gagne: { label: 'Gagné', ton: 'green' },
  perdu: { label: 'Perdu', ton: 'red' },
};

const nomDe = (a) => [a.prenom, a.nom].filter(Boolean).join(' ').trim()
  || a.societe || a.raison_sociale || '—';

// L'adresse d'un partenaire, sur une ligne. Les morceaux absents ne laissent
// pas de virgule derrière eux.
const adresseDe = (a) => [a.adresse, [a.code_postal, a.ville].filter(Boolean).join(' ')]
  .filter(Boolean).join(', ');

// ------------------------------------------------------- le formulaire fiche

const champ = (cle, libelle, valeur, opts = {}) => `
  <label class="paf-champ ${opts.large ? 'est-large' : ''}">
    <span>${esc(libelle)}</span>
    <input name="${cle}" type="${opts.type || 'text'}"
      ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}
      ${opts.required ? 'required' : ''} value="${esc(valeur ?? '')}">
  </label>`;

const liste = (cle, libelle, options, valeur) => `
  <label class="paf-champ">
    <span>${esc(libelle)}</span>
    <select name="${cle}">
      ${options.map(([k, l]) =>
        `<option value="${esc(k)}"${String(valeur) === String(k) ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select>
  </label>`;

const bloc = (titre, dedans) => `
  <section class="paf-bloc">
    <h4>${esc(titre)}</h4>
    <div class="paf-grille">${dedans}</div>
  </section>`;

/**
 * Le formulaire d'un partenaire, créer comme modifier.
 *
 * ⚠ REFAIT LE 25/09/2026 — « améliorer le visuel du formulaire à remplir ».
 * C'était une grille de douze champs à plat, sans respiration ni ordre de
 * lecture : le rôle entre le métier et le téléphone, la convention entre la
 * ville et les apports. Trois blocs maintenant, dans l'ordre où l'on remplit
 * une fiche — qui c'est, comment le joindre, ce qui nous lie.
 *
 * ⚠ L'ADRESSE EST COMPLÈTE : la RUE manque depuis toujours (demandé le
 * 25/09/2026). La colonne `adresse` existait en base et n'était affichée ni
 * saisie nulle part — le relevé la reposait, ce qui est justement ce qu'on
 * vient de couper.
 */
function corpsFormulaire(v, creation) {
  return `<form id="paf" class="paf">
    ${bloc('Le partenaire', `
      ${champ('nom', 'Nom', v.nom, { required: true })}
      ${champ('prenom', 'Prénom', v.prenom)}
      ${champ('societe', 'Société', v.societe || v.raison_sociale)}
      ${champ('profession', 'Métier', v.profession, { placeholder: 'Courtier, architecte…' })}
      ${liste('type_partenaire', 'Rôle',
        Object.entries(ROLES).map(([k, r]) => [k, r.label]), v.type_partenaire || 'apporteur')}
      ${liste('actif', 'Suivi',
        [['1', 'Actif'], ['0', 'Inactif']], v.actif === false ? '0' : '1')}`)}

    ${bloc('Comment le joindre', `
      ${champ('telephone', 'Téléphone', v.telephone, { type: 'tel' })}
      ${champ('email', 'E-mail', v.email, { type: 'email' })}
      ${champ('adresse', 'Adresse', v.adresse, { large: true, placeholder: 'Numéro et rue' })}
      ${champ('code_postal', 'Code postal', v.code_postal)}
      ${champ('ville', 'Ville', v.ville)}`)}

    ${bloc('Ce qui nous lie', `
      ${liste('partenariat_signe', 'Convention de partenariat',
        [['0', 'Non signée'], ['1', 'Signée']], v.partenariat_signe ? '1' : '0')}
      ${champ('date_signature', 'Date de signature', v.date_signature, { type: 'date' })}
      <label class="paf-champ est-large"><span>Notes</span>
        <textarea name="notes" rows="3">${esc(v.notes || '')}</textarea></label>`)}

    <div class="paf-pied">
      ${creation ? '' : '<button type="button" class="btn ghost danger" id="paf-suppr">Supprimer</button>'}
      <span class="grow"></span>
      <button type="button" class="btn ghost" id="paf-annuler">Annuler</button>
      <button type="submit" class="btn primary" id="paf-ok">${creation ? 'Créer le partenaire' : 'Enregistrer'}</button>
    </div>
  </form>`;
}

/**
 * Brancher le formulaire une fois posé dans le DOM.
 *
 * @param {Element} hote   l'élément qui porte le `<form id="paf">`
 * @param {object|null} a  la fiche à modifier, ou `null` pour une création
 * @param {function} apres ce qu'on fait après un enregistrement réussi
 * @param {function} [annuler] ce qu'on fait sur « Annuler » ; ferme la modale à défaut
 */
function brancherFormulaire(hote, a, apres, annuler) {
      const creation = !a;
      const m = hote;
      const form = m.querySelector('#paf');
      m.querySelector('#paf-annuler').onclick = () => (annuler || closeModal)();

      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const lu = Object.fromEntries(
          [...form.querySelectorAll('[name]')].map(i => [i.name, i.value.trim()]));
        if (!lu.nom && !lu.societe) return toast('Un nom ou une société, au moins', 'warn');

        // ⚠ UN CHAMP VIDE PART À `null`, jamais à `''` : c'est ainsi qu'on
        // efface un e-mail saisi par erreur, et une chaîne vide en base ne se
        // distingue plus d'une valeur qu'on n'a jamais remplie.
        const champs = Object.fromEntries(
          Object.entries(lu).map(([k, x]) => [k, x === '' ? null : x]));
        champs.actif = lu.actif === '1';
        champs.partenariat_signe = lu.partenariat_signe === '1';

        const ok = m.querySelector('#paf-ok');
        ok.disabled = true; ok.textContent = 'Enregistrement…';
        const r = creation ? await creerPartenaire(champs) : await majPartenaire(a.id, champs);
        if (!r.ok) {
          ok.disabled = false; ok.textContent = creation ? 'Créer le partenaire' : 'Enregistrer';
          return toast(`Non enregistré — ${r.motif}`, 'err');
        }
        toast(creation ? 'Partenaire créé' : 'Partenaire enregistré');
        apres?.(r.ligne);
      };

      const suppr = m.querySelector('#paf-suppr');
      if (suppr) suppr.onclick = async () => {
        const n = apportsDe(a.id).length;
        if (!await confirm(`Supprimer ${nomDe(a)} ?${n ? ` Ses ${n} apport${n > 1 ? 's' : ''} partiront avec.` : ''}`)) return;
        const r = await supprimerPartenaire(a.id);
        if (!r.ok) return toast(`Non supprimé — ${r.motif}`, 'err');
        closeModal();
        toast('Partenaire supprimé');
        apres?.(null);
      };
}

/** Créer un partenaire : le formulaire seul, dans sa propre fenêtre. */
function nouveauPartenaire(apres, typeDefaut = 'apporteur') {
  const v = { type_partenaire: typeDefaut, actif: true };
  openModal('Nouveau partenaire', corpsFormulaire(v, true), { wide: true, onOpen: (m) => {
    brancherFormulaire(m, null, () => { closeModal(); apres?.(); });
  } });
}

// ------------------------------------------------------- le formulaire apport

/**
 * Un apport d'affaires : qui l'a présenté, quand, pour qui, et ce qu'il a
 * rapporté. Demandé le 25/09/2026.
 *
 * ⚠ L'ISSUE PEUT RESTER VIDE. Mickael a demandé « gagné ou perdu » ; mais on
 * saisit la ligne le jour de l'apport, avant de savoir. Forcer le choix ferait
 * inscrire « perdu » par défaut sur une affaire en cours — l'option « Pas
 * encore tranché » est là pour ça, et la commission ne compte pas tant qu'elle
 * est choisie.
 */
function formulaireApport(apport, partenaires, apres, apporteurDefaut = '') {
  const creation = !apport;
  const v = apport || { apporteur_id: apporteurDefaut, date_apport: new Date().toISOString().slice(0, 10) };
  const choix = partenaires
    .filter(estApporteur)
    .sort((x, y) => nomDe(x).localeCompare(nomDe(y), 'fr'))
    .map(p => [p.id, nomDe(p) + (estActif(p) ? '' : ' (inactif)')]);

  const corps = `<form id="pap" class="paf">
    <div class="paf-grille">
      ${liste('apporteur_id', 'Apporteur', [['', '— Choisir —'], ...choix], v.apporteur_id || '')}
      ${champ('date_apport', 'Date', v.date_apport, { type: 'date' })}
      ${champ('client', 'Client', v.client, { large: true, placeholder: 'Nom du client présenté' })}
      ${liste('issue', 'Issue',
        [['', 'Pas encore tranché'], ['gagne', 'Gagné'], ['perdu', 'Perdu']], v.issue || '')}
      ${champ('montant_devis', 'Montant du devis (€ HT)', v.montant_devis, { type: 'number' })}
      ${champ('montant_commission', 'Commission (€)', v.montant_commission, { type: 'number' })}
    </div>
    <p class="small muted">La commission n’entre dans le total du partenaire que
      si l’affaire est <b>gagnée</b> : le montant du devis, lui, compte dès qu’il est chiffré.</p>
    <div class="paf-pied">
      ${creation ? '' : '<button type="button" class="btn ghost danger" id="pap-suppr">Supprimer</button>'}
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn primary" id="pap-ok">${creation ? 'Ajouter l’apport' : 'Enregistrer'}</button>
    </div>
  </form>`;

  // ⚠ `onClose` RAMÈNE À LA FICHE, y compris sur « Annuler » et sur la croix.
  // Cette fenêtre REMPLACE celle de la fiche (`openModal` ferme la précédente) :
  // sans retour, renoncer à saisir un apport refermerait la fiche qu'on était en
  // train de lire. Sur un enregistrement réussi, `apres` rouvre la fiche et
  // `closeModal(true)` qu'il déclenche ne rejoue pas `onClose` — donc pas de
  // double retour.
  openModal(creation ? 'Nouvel apport' : 'Modifier l’apport', corps,
    { onClose: () => apres?.(), onOpen: (m) => {
    const form = m.querySelector('#pap');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const lu = Object.fromEntries(
        [...form.querySelectorAll('[name]')].map(i => [i.name, i.value.trim()]));
      if (!lu.apporteur_id) return toast('Choisissez l’apporteur', 'warn');

      const nombre = (x) => x === '' ? null : Number(x);
      const champs = {
        apporteur_id: lu.apporteur_id,
        date_apport: lu.date_apport || null,
        client: lu.client || null,
        issue: lu.issue || null,
        montant_devis: nombre(lu.montant_devis),
        montant_commission: nombre(lu.montant_commission),
      };
      const ok = m.querySelector('#pap-ok');
      ok.disabled = true; ok.textContent = 'Enregistrement…';
      const r = creation ? await creerApport(champs) : await majApport(apport.id, champs);
      if (!r.ok) {
        ok.disabled = false; ok.textContent = creation ? 'Ajouter l’apport' : 'Enregistrer';
        return toast(`Non enregistré — ${r.motif}`, 'err');
      }
      toast(creation ? 'Apport ajouté' : 'Apport enregistré'); apres?.();
    };

    const suppr = m.querySelector('#pap-suppr');
    if (suppr) suppr.onclick = async () => {
      if (!await confirm('Supprimer cet apport ?')) return;
      const r = await supprimerApport(apport.id);
      if (!r.ok) return toast(`Non supprimé — ${r.motif}`, 'err');
      toast('Apport supprimé'); apres?.();
    };
  } });
}

// ------------------------------------------------------------- la fiche

const ligneApport = (x, ecriture) => {
  const i = ISSUES[x.issue];
  return `<tr ${ecriture ? `data-apport="${esc(String(x.id))}"` : ''}>
    <td class="small">${x.date_apport ? esc(fmtDate(x.date_apport)) : '<span class="muted">—</span>'}</td>
    <td><b>${esc(x.client || '—')}</b></td>
    <td>${i ? `<span class="chip ${i.ton}">${esc(i.label)}</span>`
            : '<span class="muted small">Pas encore tranché</span>'}</td>
    <td class="num">${x.montant_devis != null ? esc(eur(x.montant_devis)) : '<span class="muted">—</span>'}</td>
    <td class="num">${x.montant_commission != null
      ? `<span class="${x.issue === 'gagne' ? '' : 'muted'}">${esc(eur(x.montant_commission))}</span>`
      : '<span class="muted">—</span>'}</td>
  </tr>`;
};

/**
 * La fiche d'un partenaire.
 *
 * ⚠ ELLE REMPLACE LE FORMULAIRE SEC (25/09/2026). Cliquer une ligne ouvrait
 * directement les champs de saisie : pour lire un numéro de téléphone il
 * fallait entrer en modification, et l'écran était « trop triste ». La fiche
 * MONTRE d'abord — en-tête coloré, chiffres, pastilles rondes —, et « Modifier
 * les informations » cède la place au formulaire EN PLACE.
 *
 * ⚠ EN PLACE, ET PAS DANS UNE SECONDE FENÊTRE : `openModal` ferme celle qui
 * est ouverte avant d'ouvrir la suivante, donc un formulaire par-dessus la
 * fiche l'aurait fait disparaître et « Annuler » n'aurait eu nulle part où
 * revenir. C'est la règle déjà posée sur la fiche client.
 *
 * ⚠ LE TABLEAU DES APPORTS EST ICI, et non plus en bas de l'écran (demandé le
 * 25/09) : les apports d'un partenaire se lisent en face de ce qu'il a
 * rapporté, pas dans une liste commune où il faut d'abord retrouver son nom.
 */
function ouvrirFichePartenaire(id, apres) {
  let enModification = false;

  // ⚠ CHAQUE REDESSIN ROUVRE LA MODALE, il n'écrase pas son contenu.
  // `openModal` construit l'en-tête ET le corps ; poser un `innerHTML` sur la
  // fenêtre emporterait la croix de fermeture. `closeModal(true)`, qu'il appelle
  // en tête, ne déclenche pas `onClose` — c'est ce qui permet de redessiner sans
  // faire croire à une fermeture. Même mécanique que la fiche client.
  const dessine = () => {
    const a = scope.rgd('rgd_apporteurs').find(x => String(x.id) === String(id));
    if (!a) { closeModal(); return; }
    const t = totauxDe(a.id);
    const siens = apportsDe(a.id);
    const r = ROLES[a.type_partenaire] || ROLES.apporteur;
    const ecriture = scope.canRgd;

    const html = `
      <div class="rgdf-hero">
        <div class="rgdf-hero-haut">
          <div class="rgdf-avatar">${esc(initiales(nomDe(a)))}</div>
          <div class="rgdf-identite">
            <h2>${esc(nomDe(a))}</h2>
            <div class="rgdf-meta">
              <span class="rgdf-tag">${esc(r.label)}</span>
              <span class="rgdf-tag ${estActif(a) ? 'est-etape' : 'est-perdu'}">${estActif(a) ? 'Actif' : 'Inactif'}</span>
              ${a.partenariat_signe ? '<span class="rgdf-tag">Convention signée</span>' : ''}
            </div>
          </div>
        </div>
        ${!enModification && ecriture
          ? '<button type="button" class="btn ghost sm rgdf-modifier" id="pa-modifier">Modifier les informations</button>'
          : ''}
        <div class="rgdf-tuiles">
          ${tuile(t.devis ? eur(t.devis) : '—', 'Montant devis')}
          ${tuile(t.commission ? eur(t.commission) : '—', 'Commissions')}
          ${tuile(t.apports, t.apports > 1 ? 'Apports' : 'Apport')}
          ${tuile(t.gagnes, t.gagnes > 1 ? 'Gagnés' : 'Gagné')}
        </div>
      </div>

      <div class="rgdf-corps">
        <div class="rgdf-colonne">
          ${enModification ? corpsFormulaire(a, false) : `
          <section class="rgdf-bloc">
            <h3>Comment le joindre</h3>
            ${info('tel', 'Téléphone', a.telephone ? `<a href="tel:${esc(a.telephone)}">${esc(a.telephone)}</a>` : '', 'est-vert')}
            ${info('mail', 'E-mail', a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : '', 'est-bleu')}
            ${info('lieu', 'Adresse', esc(adresseDe(a)), 'est-gris')}
            ${!a.telephone && !a.email ? '<p class="rgdf-rien">Aucun moyen de contact renseigné.</p>' : ''}
          </section>

          <section class="rgdf-bloc">
            <h3>Le partenariat</h3>
            ${info('personne', 'Métier', esc(a.profession || ''), 'est-orange')}
            ${info('source', 'Société', esc(a.societe || a.raison_sociale || ''), 'est-violet')}
            ${info('regle', 'Convention',
              a.partenariat_signe
                ? 'Signée' + (a.date_signature ? ` le ${esc(fmtDate(a.date_signature))}` : '')
                : 'Non signée', a.partenariat_signe ? 'est-vert' : 'est-gris')}
            ${info('texte', 'Notes', esc(a.notes || ''), 'est-gris')}
          </section>`}

          <section class="rgdf-bloc">
            <h3>Ses apports <span class="rgdf-compte">${siens.length}</span></h3>
            ${siens.length ? `<div class="rgdf-tableau"><table>
              <thead><tr><th>Date</th><th>Client</th><th>Issue</th>
                <th class="num">Devis</th><th class="num">Commission</th></tr></thead>
              <tbody>${siens.map(x => ligneApport(x, ecriture)).join('')}</tbody>
            </table></div>`
            : '<p class="rgdf-rien">Aucun apport enregistré pour ce partenaire.</p>'}
            ${ecriture ? `<div class="rgdf-ajout" style="margin-top:10px">
              <button type="button" class="btn sm" id="pa-apport">+ Nouvel apport</button>
            </div>` : ''}
            <p class="rgdf-source">La commission n’entre dans les totaux que sur une
              affaire <b>gagnée</b> : le montant du devis, lui, compte dès qu’il est chiffré.</p>
          </section>
        </div>
      </div>`;

    const m = openModal('', html, { wide: true, onClose: () => apres?.() });
    m.classList.add('rgdf');

    if (enModification) {
      brancherFormulaire(m, a, (ligne) => {
        if (ligne === null) return;          // suppression : la modale est déjà fermée
        enModification = false; dessine(); apres?.();
      }, () => { enModification = false; dessine(); });
    }
    const bMod = m.querySelector('#pa-modifier');
    if (bMod) bMod.onclick = () => { enModification = true; dessine(); };

    // ⚠ APRÈS UN APPORT, ON REVIENT SUR LA FICHE. `formulaireApport` ouvre sa
    // propre fenêtre, qui REMPLACE celle-ci ; sans ce retour, enregistrer un
    // apport refermerait la fiche qu'on était en train de lire.
    const revenir = () => { dessine(); apres?.(); };
    const bApp = m.querySelector('#pa-apport');
    if (bApp) bApp.onclick = () =>
      formulaireApport(null, scope.rgd('rgd_apporteurs'), revenir, a.id);

    m.querySelectorAll('[data-apport]').forEach(tr => tr.onclick = () => {
      const x = siens.find(y => String(y.id) === tr.dataset.apport);
      if (x) formulaireApport(x, scope.rgd('rgd_apporteurs'), revenir, a.id);
    });
  };

  dessine();
}

// ------------------------------------------------------------------- l'écran

export const rgdPartenairesPage = {
  title: () => 'RGD Renova — Partenaires',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // Une seule porte : la policy `rgd_apporteurs_acces`, dont `scope.canRgd`
    // est le miroir exact. Plus aucun compte de l'application RGD n'est exigé.
    const state = { q: '', focus: null, ecriture: scope.canRgd };

    const draw = () => {
      const tous = scope.rgd('rgd_apporteurs');
      const ts = terms(state.q);
      const vus = tous.filter(a =>
        hit([nomDe(a), a.societe, a.raison_sociale, a.profession, a.ville, adresseDe(a)], ts));

      const ligne = (a, sec) => {
        const t = totauxDe(a.id);
        return `<tr ${state.ecriture ? `data-partenaire="${esc(String(a.id))}"` : ''}>
          <td><b>${esc(a.nom || nomDe(a))}</b></td>
          <td>${esc(a.prenom || '—')}</td>
          <td class="pa-bleu">${esc(a.societe || a.raison_sociale || '—')}</td>
          <td class="pa-bleu">${esc(a.profession || '—')}</td>
          ${sec.montants ? `
          <td class="num">${t.devis ? esc(eur(t.devis)) : '<span class="muted">—</span>'}
            ${t.apports ? `<div class="s muted">${t.apports} apport${t.apports > 1 ? 's' : ''}${
              t.gagnes ? ` · ${t.gagnes} gagné${t.gagnes > 1 ? 's' : ''}` : ''}</div>` : ''}</td>
          <td class="num">${t.commission ? `<b>${esc(eur(t.commission))}</b>` : '<span class="muted">—</span>'}</td>`
          : '<td class="muted">—</td><td class="muted">—</td>'}
        </tr>`;
      };

      const section = (sec) => {
        const lignes = vus.filter(sec.prend);
        // ⚠ LA SECTION DES INACTIFS NE S'AFFICHE QUE SI ELLE PORTE QUELQU'UN.
        // Un bloc vide intitulé « Apporteurs inactifs » occupe une place et
        // n'apprend rien ; il réapparaît au premier partenaire désactivé.
        if (sec.cle === 'inactif' && !lignes.length && !state.q) return '';
        return `
        <section class="card pa-sect" style="--pa-trait:${sec.couleur}">
          <div class="pa-head">
            <h3>${esc(sec.titre)}</h3>
            <span class="pa-compte" style="background:${sec.couleur}">${lignes.length}</span>
            <span class="grow"></span>
            ${state.ecriture && sec.bouton
              ? `<button type="button" class="btn primary" data-nouveau="${esc(sec.cle)}">${esc(sec.bouton)}</button>`
              : ''}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Prénom</th><th>Société</th><th>Profession</th>
                <th class="num">Montant devis</th><th class="num">Montant commissions</th></tr></thead>
              <tbody>${lignes.map(a => ligne(a, sec)).join('')
                || `<tr><td colspan="6"><div class="empty">${
                  state.q ? 'Aucun résultat dans cette catégorie.'
                    : 'Personne pour le moment.'}</div></td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
      };

      // ⚠ LE TABLEAU DES APPORTS A QUITTÉ CET ÉCRAN le 25/09/2026 : « je le veux
      // dans la fiche partenaire ». Une liste commune obligeait à retrouver le nom
      // de quelqu'un avant de lire ce qu'il a rapporté ; dans sa fiche, les deux
      // sont en face l'un de l'autre. Les colonnes de ce tableau-ci portent déjà
      // les totaux, ce qui suffit à comparer les partenaires entre eux.

      const corps = `
        <div class="toolbar">
          ${searchInput('rpa-q', state, 'Rechercher un partenaire, un métier, une ville…')}
          <span class="grow"></span>
          <span class="muted small">${state.ecriture
            ? 'Cliquez sur une ligne pour ouvrir la fiche'
            : 'Lecture seule'}</span>
        </div>
        ${SECTIONS.map(section).join('')}`;

      root.innerHTML = cadre('#/rgd/partenaires', 'Partenaires', corps);
      bindSearch(root, 'rpa-q', state, draw);
      restoreFocus(root, state);

      root.querySelectorAll('[data-nouveau]').forEach(b => b.onclick = () => {
        const sec = SECTIONS.find(s => s.cle === b.dataset.nouveau);
        nouveauPartenaire(draw, sec?.cree || sec?.cle || 'apporteur');
      });
      // Le clic ouvre la FICHE, pas le formulaire : on vient d'abord lire.
      root.querySelectorAll('[data-partenaire]').forEach(tr => tr.onclick = () =>
        ouvrirFichePartenaire(tr.dataset.partenaire, draw));
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
