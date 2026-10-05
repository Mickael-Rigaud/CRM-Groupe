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
import { toast, openModal, closeModal } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { creerPartenaire, majPartenaire, supprimerPartenaire,
         apportsDe, equipeDe, totauxDe, creerApport, majApport, supprimerApport,
         // Le sens inverse, depuis le 05/10/2026 : ce que RGD a apporté à ses
         // partenaires. Pas de liste d'états à importer — la table porte la même
         // `issue` que sa jumelle, et c'est `ISSUES`, ci-dessous, qui habille
         // les deux.
         sortantsDe, trierSortants, bilanSortantsDe, bilanDesSortants,
         creerSortant, majSortant, supprimerSortant }
  from '../data/rgd-partenaires.js';
// ⚠ LE JOUR COURANT EST IMPORTÉ, pas recalculé : `aujourdhui()` refuse
// `toISOString()`, qui rend de l'UTC — une ligne posée à 23 h serait datée du
// lendemain. Aucune fonction de ce fichier ne déclare ce nom, il n'y a donc pas
// le masquage qui a interdit cet import dans `rgd-projet.js`.
import { aujourdhui } from '../data/rgd-etapes.js';
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

      // ⚠ MÊME PIÈGE QUE DANS LE TABLEAU : `confirm()` remplacerait cette
      // fenêtre, donc renoncer à supprimer ferait perdre la fiche et la saisie
      // en cours. Deux clics sur le même bouton, qui dit ce qu'il emporte.
      const suppr = m.querySelector('#paf-suppr');
      if (suppr) suppr.onclick = async () => {
        const n = apportsDe(a.id).length;
        if (suppr.dataset.arme !== '1') {
          suppr.dataset.arme = '1';
          suppr.classList.add('danger-plein');
          suppr.textContent = `Confirmer la suppression${n ? ` (${n} apport${n > 1 ? 's' : ''})` : ''}`;
          clearTimeout(suppr._t);
          suppr._t = setTimeout(() => {
            suppr.dataset.arme = '';
            suppr.classList.remove('danger-plein');
            suppr.textContent = 'Supprimer';
          }, 4000);
          return;
        }
        clearTimeout(suppr._t);
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

// ------------------------------------------------- le tableau des apports
//
// ⚠ UN VRAI TABLEAU QU'ON REMPLIT, PAS UNE FENÊTRE PAR LIGNE (25/09/2026 :
// « je voudrais vraiment un tableau où l'on peut rajouter des lignes »). La
// version d'avant ouvrait une modale pour chaque apport : six champs et deux
// clics pour une ligne de tableur. Ici chaque cellule est un champ, la ligne
// s'enregistre quand on en sort, et « + Ajouter une ligne » en pose une vide.
//
// ⚠ L'APPORTEUR SE CHOISIT LIBREMENT, et pas seulement celui de la fiche
// ouverte — demandé explicitement. Une nouvelle ligne le propose par défaut
// parce que c'est le cas courant, mais la liste donne tout le monde ; changer
// la colonne DÉPLACE la ligne vers l'autre fiche, et l'écran le dit plutôt que
// de la faire disparaître sans un mot.

// ⚠ PLUS DE LISTE D'APPORTEURS DANS LA LIGNE (corrigé le 25/09/2026 : « c'est
// dans tous les cas l'apporteur de la fiche »). Elle proposait de déplacer un
// apport vers un autre partenaire — un geste que personne ne fait, pour une
// liste déroulante lue à chaque ligne. `apporteur_id` est posé à la création et
// ne se change plus ici ; la colonne ne porte donc que la PERSONNE de l'équipe
// qui a présenté l'affaire, en texte libre, avec les noms déjà employés chez ce
// partenaire en suggestion.
const ligneApport = (x) => `<tr data-ligne="${esc(String(x.id))}">
  <td><input data-champ="apporte_par" list="pa-equipe"
    value="${esc(x.apporte_par || '')}" placeholder="Qui a apporté ?"></td>
  <td><input type="date" data-champ="date_apport" value="${esc(x.date_apport || '')}"></td>
  <td><input data-champ="client" value="${esc(x.client || '')}" placeholder="Nom du client"></td>
  <td><select data-champ="issue">
    <option value=""${x.issue ? '' : ' selected'}>Pas tranché</option>
    <option value="gagne"${x.issue === 'gagne' ? ' selected' : ''}>Gagné</option>
    <option value="perdu"${x.issue === 'perdu' ? ' selected' : ''}>Perdu</option>
  </select></td>
  <td><input type="number" step="100" data-champ="montant_devis"
      value="${x.montant_devis != null ? esc(String(x.montant_devis)) : ''}" placeholder="€"></td>
  <td><input type="number" step="10" data-champ="montant_commission"
      value="${x.montant_commission != null ? esc(String(x.montant_commission)) : ''}" placeholder="€"></td>
  <td><button type="button" class="pat-x" data-suppr title="Supprimer la ligne">✕</button></td>
</tr>`;

const corpsApports = (siens) => siens.map(x => ligneApport(x)).join('')
  || '<tr class="pat-vide"><td colspan="7"><div class="empty">Aucun apport. Ajoutez une ligne pour commencer.</div></td></tr>';


// --------------------------------------- ce que RGD a apporté à ses partenaires
//
// LE SENS INVERSE DU TABLEAU CI-DESSUS (05/10/2026, demandé par Élodie).
//
// ⚠ C'EST UN REGISTRE DE CE QUI A EU LIEU, et c'est une correction du jour
// même : « ce n'est pas "affaires que RGD peut apporter" mais plus "affaires
// que RGD Renova a apporté" ». La première version était tournée vers l'avenir
// — un état « À transmettre » par défaut, un tri qui remontait ce qui n'avait
// pas encore été passé, une date de transmission posée au franchissement.
// **Ne pas y revenir sans en reparler** : ce que RGD aurait PU apporter est une
// autre question, et elle demanderait une autre colonne.
//
// ⚠ LE TABLEAU EST LE JUMEAU DE CELUI DES APPORTS, pas un cousin : même date,
// même client, même `ISSUES` (Gagné · Perdu · Pas tranché), même règle de
// commission. C'est pour ça qu'on réutilise `ISSUES` tel quel — une seconde
// liste d'états aurait fini par ne plus dire la même chose que celle d'en face.
// La seule colonne de plus est « Ce que RGD lui a apporté ».
//
// ⚠ LES CHAMPS SONT LIBRES (demandé le même jour : « je voudrais quelque chose
// de plus libre dans les champs du formulaire »). Seul le partenaire est exigé
// — c'est la clé étrangère. La date se propose à aujourd'hui et se change, le
// reste peut rester vide et se compléter plus tard, et « ce que RGD lui a
// apporté » est une zone de texte qui grandit avec ce qu'on y écrit.
//
// ⚠ LE TABLEAU DE L'ÉCRAN NE S'ÉDITE PAS, CELUI DE LA FICHE SI, et ce n'est pas
// une inégalité de confort : toute écriture appelle `emit()`, donc le `refresh`
// de la page, donc `draw()` — qui reconstruit `root.innerHTML`. Un champ sur
// l'écran disparaîtrait sous le doigt de qui vient d'en sortir. La fiche vit
// dans une modale, hors de `root`, et c'est ce qui lui permet de porter des
// champs. Sur l'écran, un clic sur la ligne ouvre la fiche à son tableau.
//
// ⚠ ET C'EST L'ÉCRAN QUI PORTE LA VUE D'ENSEMBLE, à l'inverse des apports
// entrants qui l'ont quittée le 25/09 (« je le veux dans la fiche partenaire »).
// La raison d'alors ne s'applique pas ici : on lisait une liste commune pour
// savoir ce qu'UN partenaire a rapporté, ce qui demandait de le retrouver
// d'abord. Dans ce sens-ci la question est transversale — qu'est-ce que RGD a
// apporté, et à qui — et elle ne se lit pas fiche par fiche.

const issueOptions = (valeur) => ['<option value=""'
  + (valeur ? '' : ' selected') + '>Pas tranché</option>']
  .concat(Object.entries(ISSUES).map(([k, e]) =>
    `<option value="${k}"${valeur === k ? ' selected' : ''}>${esc(e.label)}</option>`))
  .join('');

// ⚠ UNE ZONE DE TEXTE, PAS UN CHAMP D'UNE LIGNE. Ce qu'on a apporté à quelqu'un
// se raconte en une phrase (« le financement du projet, elle avait un compromis
// signé ») : dans un `input`, tout ce qui dépasse vit derrière un défilement
// horizontal invisible — le texte est là, mais illisible sans cliquer dedans et
// parcourir au clavier. Même défaut, même remède que la colonne Commentaire de
// l'écran Clients le 30/09.
//
// ⚠ ENTRÉE Y FAIT UN RETOUR À LA LIGNE, et l'enregistrement part toujours au
// `change`, donc en quittant le champ.
const ligneSortant = (x) => `<tr data-slig="${esc(String(x.id))}">
  <td><input type="date" data-schamp="date_apport" value="${esc(x.date_apport || '')}"></td>
  <td><input data-schamp="client" value="${esc(x.client || '')}" placeholder="Nom du client"></td>
  <!-- ⚠ LE COMMENTAIRE EST DANS LA MEME CELLULE, SOUS CE QU'ON A APPORTE, et
       ce n'est pas du rangement : le formulaire le propose, donc il doit se
       relire et se corriger quelque part. Un champ qu'on ne voit pas est un
       champ qui n'existe pas, et le premier enregistrement fait de son absence
       une verite. Une colonne a lui aurait coute de la largeur a tout le monde
       pour un texte souvent vide ; dessous, il ne prend la place que lorsqu'il
       porte quelque chose. -->
  <td><textarea class="pas-libre" rows="1" data-schamp="objet"
      placeholder="Ce qu’on lui a apporté…">${esc(x.objet || '')}</textarea>
    <textarea class="pas-libre pas-note" rows="1" data-schamp="notes"
      placeholder="Commentaire…">${esc(x.notes || '')}</textarea></td>
  <td><select data-schamp="issue">${issueOptions(x.issue || '')}</select></td>
  <td><input type="number" step="100" data-schamp="montant_estime"
      value="${x.montant_estime != null ? esc(String(x.montant_estime)) : ''}" placeholder="€"></td>
  <td><input type="number" step="10" data-schamp="commission"
      value="${x.commission != null ? esc(String(x.commission)) : ''}" placeholder="€"></td>
  <td><button type="button" class="pat-x" data-ssuppr title="Supprimer la ligne">✕</button></td>
</tr>`;

const corpsSortants = (lignes) => lignes.map(x => ligneSortant(x)).join('')
  || `<tr class="pat-vide"><td colspan="7"><div class="empty">Rien d’apporté pour l’instant.
       Ajoutez une ligne dès que RGD lui a passé une affaire.</div></td></tr>`;

// La hauteur suit le contenu.
//
// ⚠ `scrollHeight` SE LIT APRÈS AVOIR REMIS LA HAUTEUR À ZÉRO : sans cette
// remise, un champ qu'on raccourcit garderait la hauteur qu'il avait au plus
// long.
//
// ⚠ ET IL FAUT Y AJOUTER LES BORDURES, défaut mesuré à l'écran : `scrollHeight`
// compte le contenu et les marges intérieures, **pas** les bordures, alors que
// la hauteur posée est interprétée en `border-box`, qui les compte. Deux pixels
// manquaient, donc la dernière ligne restait rognée — assez peu pour ne pas se
// voir, assez pour couper les jambages. On lit l'épaisseur plutôt que d'écrire
// « + 2 » : une bordure qui change d'épaisseur un jour ne doit pas rouvrir ce
// défaut.
function calerHauteur(champ) {
  champ.style.height = 'auto';
  const bordures = champ.offsetHeight - champ.clientHeight;
  champ.style.height = `${Math.min(champ.scrollHeight + bordures, 180)}px`;
}

// Le bilan, en une phrase. Ce qui vaut zéro ne s'écrit pas : « 0 € de
// commission attendue » sur une ligne qu'on vient de poser se lit comme un
// reproche.
//
// ⚠ LA PHRASE DU VIDE EST FOURNIE PAR L'APPELANT : la même fonction sert la
// fiche d'UN partenaire et le tableau de TOUS. « Rien d'apporté à ce partenaire »
// s'affichait sur l'écran commun, où il n'y a pas de « ce partenaire ».
const phraseBilan = (b, siVide = 'Rien d’apporté à ce partenaire pour le moment.') => [
  b.apports ? `<b>${b.apports}</b> affaire${b.apports > 1 ? 's' : ''} apportée${b.apports > 1 ? 's' : ''}` : '',
  b.gagnes ? `${b.gagnes} gagnée${b.gagnes > 1 ? 's' : ''}` : '',
  b.estime ? `${esc(eur(b.estime))} estimés` : '',
  b.commission ? `${esc(eur(b.commission))} de commission attendue` : '',
].filter(Boolean).join(' · ') || siVide;

/**
 * Le tableau des apports sortants dans la fiche : mêmes gestes que son jumeau.
 *
 * ⚠ ON NE REDESSINE PAS LA FICHE À CHAQUE CELLULE, même raison que pour les
 * apports : `change` part quand on QUITTE le champ, souvent pour aller au
 * suivant, et un redessin volerait le curseur à celui qu'on vient d'atteindre.
 * Seuls le compteur et la phrase de bilan sont remis à jour, en place.
 */
function brancherSortants(m, a, apres) {
  const corps = m.querySelector('#pa-scorps');
  if (!corps) return;
  const etat = m.querySelector('#pa-setat');
  const dire = (mot) => {
    if (!etat) return;
    etat.textContent = mot;
    setTimeout(() => { if (etat.textContent === mot) etat.textContent = ''; }, 2200);
  };

  const majBilan = () => {
    const b = bilanSortantsDe(a.id);
    const n = m.querySelector('#pa-sn');
    if (n) n.textContent = String(b.apports);
    const p = m.querySelector('#pa-sbilan');
    if (p) p.innerHTML = phraseBilan(b);
  };

  const redessinerCorps = () => {
    corps.innerHTML = corpsSortants(sortantsDe(a.id));
    brancherLignes();
    majBilan();
    apres?.();
  };

  function brancherLignes() {
    corps.querySelectorAll('[data-slig]').forEach(tr => {
      const ligneId = tr.dataset.slig;

      // Les zones de texte prennent leur hauteur au rendu, puis à chaque
      // frappe. ⚠ `querySelectorAll` ET NON `querySelector` : la cellule en
      // porte DEUX depuis que le commentaire s'y lit, et n'en caler qu'une
      // laisserait la seconde rognée à une ligne.
      tr.querySelectorAll('.pas-libre').forEach(libre => {
        calerHauteur(libre);
        libre.oninput = () => calerHauteur(libre);
      });

      tr.querySelectorAll('[data-schamp]').forEach(el => {
        el.onchange = async () => {
          const cle = el.dataset.schamp;
          const brut = String(el.value).trim();
          const valeur = brut === '' ? null
            : (cle === 'montant_estime' || cle === 'commission') ? Number(brut) : brut;

          const r = await majSortant(ligneId, { [cle]: valeur });
          if (!r.ok) return toast(`Non enregistré — ${r.motif}`, 'err');
          dire('Enregistré');
          majBilan();
          apres?.();
        };
      });

      const x = tr.querySelector('[data-ssuppr]');
      if (x) armerCroix(x, async () => {
        const r = await supprimerSortant(ligneId);
        if (!r.ok) return toast(`Non supprimé — ${r.motif}`, 'err');
        redessinerCorps();
      });
    });
  }

  brancherLignes();

  const bAjout = m.querySelector('#pa-sajout');
  if (bAjout) bAjout.onclick = async () => {
    // ⚠ SEULE LA DATE EST PROPOSÉE, et elle se change : c'est le seul champ
    // dont la bonne valeur est devinable. L'issue reste vide — « pas tranché »
    // est l'état d'une affaire qu'on vient de passer.
    const r = await creerSortant({ apporteur_id: a.id, date_apport: aujourdhui() });
    if (!r.ok) return toast(`Ligne non ajoutée — ${r.motif}`, 'err');
    redessinerCorps();
    corps.querySelector(`[data-slig="${CSS.escape(String(r.ligne.id))}"] [data-schamp="client"]`)?.focus();
  };
}

/**
 * Enregistrer une affaire apportée depuis l'écran, pour un partenaire qu'on
 * choisit.
 *
 * ⚠ TOUS LES CHAMPS SONT LÀ ET AUCUN N'EST EXIGÉ, sauf le partenaire (05/10/2026,
 * demandé : « je voudrais quelque chose de plus libre dans les champs du
 * formulaire »). La première version n'en posait que quatre et renvoyait dans
 * la fiche pour le reste : un formulaire qui ne sait pas tout prendre oblige à
 * finir ailleurs ce qu'on avait sous la main.
 *
 * ⚠ UNE FENÊTRE ICI, ET UNE LIGNE VIDE DANS LA FICHE : ce ne sont pas deux
 * façons de faire la même chose. Dans la fiche le partenaire est connu, donc
 * une ligne vide suffit ; depuis l'écran il reste à désigner, et il n'y a pas
 * de cellule où le faire — le tableau de l'écran est en lecture.
 *
 * ⚠ TOUS LES PARTENAIRES SONT PROPOSÉS, fournisseurs compris : on envoie un
 * client chez un fournisseur de cuisines aussi bien que chez un courtier. Les
 * inactifs le sont aussi, et le disent.
 */
function nouveauSortant(apres, apporteurIdDefaut = '') {
  const tous = scope.rgd('rgd_apporteurs').slice()
    .sort((x, y) => nomDe(x).localeCompare(nomDe(y), 'fr'));
  if (!tous.length) return toast('Aucun partenaire à qui apporter une affaire.', 'err');

  const options = tous.map(p => `<option value="${esc(String(p.id))}"${
    String(p.id) === String(apporteurIdDefaut) ? ' selected' : ''}>${esc(nomDe(p))}${
    p.societe || p.raison_sociale ? ` — ${esc(p.societe || p.raison_sociale)}` : ''}${
    estActif(p) ? '' : ' (inactif)'}</option>`).join('');

  const html = `
    <form id="pa-sform" class="paf">
      ${bloc('L’affaire apportée', `
        <label class="paf-champ">
          <span>Partenaire</span>
          <select name="apporteur_id" required>
            <option value="">Choisir…</option>${options}
          </select>
        </label>
        ${champ('date_apport', 'Date de l’apport', aujourdhui(), { type: 'date' })}
        ${champ('client', 'Client', '', { placeholder: 'Nom du client' })}
        <label class="paf-champ est-large"><span>Ce que RGD lui a apporté</span>
          <textarea name="objet" rows="3"
            placeholder="Le financement du projet, des plans, la fourniture de la cuisine… écrivez librement."></textarea></label>`)}

      ${bloc('Où ça en est', `
        ${liste('issue', 'Issue',
          [['', 'Pas tranché']].concat(Object.entries(ISSUES).map(([k, e]) => [k, e.label])), '')}
        ${champ('montant_estime', 'Montant estimé pour lui (€)', '', { type: 'number' })}
        ${champ('commission', 'Commission attendue (€)', '', { type: 'number' })}
        <label class="paf-champ est-large"><span>Commentaire</span>
          <textarea name="notes" rows="2"
            placeholder="Ce qu’il faut se rappeler sur cette affaire."></textarea></label>`)}

      <p class="paf-mot">Seul le <b>partenaire</b> est obligatoire. Tout le reste
        peut rester vide et se compléter plus tard depuis sa fiche.</p>
      <div class="paf-pied">
        <button type="button" class="btn ghost" id="pa-sannuler">Annuler</button>
        <span class="grow"></span>
        <button type="submit" class="btn primary">Enregistrer l’apport</button>
      </div>
    </form>`;

  openModal('Une affaire apportée à un partenaire', html, { wide: true, onOpen: (m) => {
    m.querySelector('#pa-sannuler').onclick = () => closeModal();
    m.querySelector('#pa-sform').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const lu = (k) => String(f.get(k) || '').trim();
      // ⚠ UN CHAMP VIDE PART À `null`, jamais à `''` : une chaîne vide en base
      // ne se distingue plus d'une valeur qu'on n'a jamais remplie. Même règle
      // que le formulaire du partenaire, juste au-dessus.
      const ou = (v) => (v === '' ? null : v);
      const nb = (v) => (v === '' ? null : Number(v));
      const r = await creerSortant({
        apporteur_id: lu('apporteur_id'),
        date_apport: ou(lu('date_apport')),
        client: ou(lu('client')),
        objet: ou(lu('objet')),
        issue: ou(lu('issue')),
        montant_estime: nb(lu('montant_estime')),
        commission: nb(lu('commission')),
        notes: ou(lu('notes')),
      });
      if (!r.ok) return toast(`Non enregistré — ${r.motif}`, 'err');
      closeModal();
      toast('Apport enregistré');
      apres?.();
    };
  } });
}

/**
 * La fiche d'un partenaire.
 *
 * ⚠ ELLE REMPLACE LE FORMULAIRE SEC. Cliquer une ligne ouvrait directement les
 * champs de saisie : pour lire un numéro de téléphone il fallait entrer en
 * modification. La fiche MONTRE d'abord — en-tête coloré, chiffres, pastilles
 * rondes —, et « Modifier les informations » cède la place au formulaire EN
 * PLACE : `openModal` ferme celle qui est ouverte avant d'ouvrir la suivante,
 * donc un formulaire par-dessus aurait fait disparaître la fiche.
 *
 * ⚠ DEUX COLONNES, PUIS LE TABLEAU EN PLEINE LARGEUR (corrigé le 25/09 :
 * « tout est à gauche et c'est vide à droite »). `.rgdf-corps` EST une grille à
 * deux colonnes — n'y poser qu'un seul `.rgdf-colonne` laissait la moitié
 * droite vide sans que rien ne le signale. Les sept colonnes du tableau, elles,
 * ne tiennent pas dans une demi-largeur : il prend la ligne entière.
 */
function ouvrirFichePartenaire(id, apres, opts = {}) {
  let enModification = false;
  // ⚠ ON NE SE POSE SUR LE TABLEAU DES SORTANTS QU'À LA PREMIÈRE OUVERTURE :
  // `dessine()` est rappelé à chaque enregistrement, et refaire défiler la
  // fenêtre à ce moment-là déplacerait la fiche sous la main de qui vient de
  // modifier un champ en haut.
  let aPositionner = opts.vers === 'sortants';

  // ⚠ CHAQUE REDESSIN ROUVRE LA MODALE, il n'écrase pas son contenu :
  // `openModal` construit l'en-tête ET le corps, donc un `innerHTML` posé sur
  // la fenêtre emporterait la croix de fermeture. `closeModal(true)`, qu'il
  // appelle en tête, ne déclenche pas `onClose` — c'est ce qui permet de
  // redessiner sans faire croire à une fermeture.
  const dessine = () => {
    const tous = scope.rgd('rgd_apporteurs');
    const a = tous.find(x => String(x.id) === String(id));
    if (!a) { closeModal(); return; }
    const t = totauxDe(a.id);
    const siens = apportsDe(a.id);
    // Le sens inverse : ce que RGD lui apporte. Deux lectures séparées parce
    // que les deux tableaux ne portent ni les mêmes colonnes ni les mêmes
    // totaux — les mélanger ferait un chiffre qui change de nature d'une ligne
    // à l'autre.
    const sortants = sortantsDe(a.id);
    const bil = bilanSortantsDe(a.id);
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
        ${enModification ? `<div class="rgdf-colonne rgdf-large">${corpsFormulaire(a, false)}</div>` : `
        <div class="rgdf-colonne">
          <section class="rgdf-bloc">
            <h3>Comment le joindre</h3>
            ${info('tel', 'Téléphone', a.telephone ? `<a href="tel:${esc(a.telephone)}">${esc(a.telephone)}</a>` : '', 'est-vert')}
            ${info('mail', 'E-mail', a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : '', 'est-bleu')}
            ${info('lieu', 'Adresse', esc(adresseDe(a)), 'est-gris')}
            ${!a.telephone && !a.email ? '<p class="rgdf-rien">Aucun moyen de contact renseigné.</p>' : ''}
          </section>
        </div>
        <div class="rgdf-colonne">
          <section class="rgdf-bloc">
            <h3>Le partenariat</h3>
            ${info('personne', 'Métier', esc(a.profession || ''), 'est-orange')}
            ${info('source', 'Société', esc(a.societe || a.raison_sociale || ''), 'est-violet')}
            ${info('regle', 'Convention',
              a.partenariat_signe
                ? 'Signée' + (a.date_signature ? ` le ${esc(fmtDate(a.date_signature))}` : '')
                : 'Non signée', a.partenariat_signe ? 'est-vert' : 'est-gris')}
            ${info('texte', 'Notes', esc(a.notes || ''), 'est-gris')}
          </section>
        </div>`}

        <section class="rgdf-bloc rgdf-large">
          <h3>Ses apports <span class="rgdf-compte" id="pa-n">${siens.length}</span></h3>
          <div class="table-wrap pat-wrap">
            <datalist id="pa-equipe">${equipeDe(a.id)
              .map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
            <table class="pat">
              <thead><tr><th>Apporté par</th><th>Date</th><th>Client</th><th>Issue</th>
                <th class="num">Montant devis</th><th class="num">Commission</th><th></th></tr></thead>
              <tbody id="pa-corps">${corpsApports(siens)}</tbody>
            </table>
          </div>
          ${ecriture ? `<div class="pat-pied">
            <button type="button" class="btn sm" id="pa-ajout">+ Ajouter une ligne</button>
            <span class="grow"></span>
            <span class="small muted" id="pa-etat"></span>
          </div>` : ''}
          <p class="rgdf-source">Chaque cellule s’enregistre quand vous en sortez.
            La commission n’entre dans les totaux que sur une affaire <b>gagnée</b>.
            Changer l’apporteur d’une ligne la déplace vers sa fiche.</p>
        </section>

        <section class="rgdf-bloc rgdf-large" id="pa-sortants">
          <h3>Ce que RGD lui a apporté <span class="rgdf-compte" id="pa-sn">${sortants.length}</span></h3>
          <p class="pas-bilan" id="pa-sbilan">${phraseBilan(bil)}</p>
          <div class="table-wrap pat-wrap">
            <table class="pat pas">
              <!-- « Commission » tout court : l'en-tête entier (« Commission
                   attendue ») ne se coupe pas et imposait 169 px, ce qui
                   poussait la table au-delà de la fenêtre et mettait la croix
                   de suppression derrière un défilement. Ce qu'il voulait dire
                   est écrit sous le tableau. Sur l'écran, où la place existe,
                   l'intitulé reste entier. AUCUN ACCENT GRAVE ICI : il
                   refermerait le gabarit, et l'écran resterait blanc. -->
              <thead><tr><th>Date</th><th>Client</th><th>Ce que RGD lui a apporté</th>
                <th>Issue</th><th class="num">Montant estimé</th>
                <th class="num">Commission</th><th></th></tr></thead>
              <tbody id="pa-scorps">${corpsSortants(sortants)}</tbody>
            </table>
          </div>
          ${ecriture ? `<div class="pat-pied">
            <button type="button" class="btn sm" id="pa-sajout">+ Ajouter une ligne</button>
            <span class="grow"></span>
            <span class="small muted" id="pa-setat"></span>
          </div>` : ''}
          <p class="rgdf-source">Chaque cellule s’enregistre quand vous en sortez.
            « Ce que RGD lui a apporté » et le <b>commentaire</b> juste dessous s’écrivent
            librement, sur autant de lignes qu’il faut. L’issue peut rester sur
            <b>Pas tranché</b> : on note l’apport le jour où on le fait, avant de savoir.
            La commission n’entre dans le bilan que sur une affaire <b>gagnée</b> par lui.</p>
        </section>
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

    if (ecriture && !enModification) brancherTableau(m, a, apres);
    if (ecriture && !enModification) brancherSortants(m, a, apres);

    if (aPositionner && !enModification) {
      aPositionner = false;
      m.querySelector('#pa-sortants')?.scrollIntoView({ block: 'center' });
    }
  };

  dessine();
}

/**
 * La croix de suppression d'une ligne de tableau : deux clics sur la même.
 *
 * ⚠ PAS DE `confirm()` ICI, ET C'EST UN BUG CORRIGÉ LE 25/09/2026 : « quand je
 * supprime une ligne ça me ferme la fiche partenaire ». Le `confirm()` du CRM
 * appelle `closeModal(true)` et REMPLACE la fenêtre courante par la sienne — la
 * fiche partait donc avant même la réponse, et elle ne revenait pas. Le premier
 * clic arme (la croix devient rouge et dit « Confirmer »), le second supprime.
 *
 * ⚠ ELLE SE DÉSARME SEULE AU BOUT DE QUATRE SECONDES, pour qu'une croix rouge
 * oubliée ne piège pas le clic suivant.
 *
 * ⚠ ÉCRIT UNE SEULE FOIS, et c'est le but de cette fonction (05/10/2026) : les
 * deux tableaux de la fiche — ce qu'il apporte, ce que RGD lui apporte — ont la
 * même croix, et deux copies d'un garde-fou n'en restent une que jusqu'au jour
 * où l'on n'en corrige qu'une.
 */
function armerCroix(x, agir) {
  x.onclick = async () => {
    if (x.dataset.arme !== '1') {
      x.dataset.arme = '1';
      x.classList.add('est-arme');
      x.textContent = 'Confirmer';
      x.title = 'Cliquez à nouveau pour supprimer';
      clearTimeout(x._t);
      x._t = setTimeout(() => {
        x.dataset.arme = '';
        x.classList.remove('est-arme');
        x.textContent = '✕';
        x.title = 'Supprimer la ligne';
      }, 4000);
      return;
    }
    clearTimeout(x._t);
    await agir();
  };
}

/**
 * Le tableau éditable : enregistrer une cellule, ajouter et retirer une ligne.
 *
 * ⚠ ON NE REDESSINE PAS LA FICHE À CHAQUE CELLULE. L'événement `change` part
 * quand on QUITTE le champ — souvent pour aller au suivant. Un redessin à ce
 * moment-là volerait le curseur au champ qu'on vient d'atteindre. Seuls les
 * chiffres de l'en-tête sont remis à jour, en place.
 */
function brancherTableau(m, a, apres) {
  const corps = m.querySelector('#pa-corps');
  const etat = m.querySelector('#pa-etat');
  const dire = (mot) => {
    if (!etat) return;
    etat.textContent = mot;
    setTimeout(() => { if (etat.textContent === mot) etat.textContent = ''; }, 2200);
  };

  // La liste de suggestions de l'équipe, reconstruite en place.
  const majSuggestions = () => {
    const dl = m.querySelector('#pa-equipe');
    if (dl) dl.innerHTML = equipeDe(a.id).map(n => `<option value="${esc(n)}"></option>`).join('');
  };

  // Les tuiles, recalculées sans toucher au reste de la fenêtre.
  const majChiffres = () => {
    const t = totauxDe(a.id);
    const tuiles = m.querySelectorAll('.rgdf-tuile b');
    if (tuiles[0]) tuiles[0].textContent = t.devis ? eur(t.devis) : '—';
    if (tuiles[1]) tuiles[1].textContent = t.commission ? eur(t.commission) : '—';
    if (tuiles[2]) tuiles[2].textContent = String(t.apports);
    if (tuiles[3]) tuiles[3].textContent = String(t.gagnes);
    const n = m.querySelector('#pa-n');
    if (n) n.textContent = String(t.apports);
  };

  const redessinerCorps = () => {
    corps.innerHTML = corpsApports(apportsDe(a.id));
    brancherLignes();
    majSuggestions();
    majChiffres();
    apres?.();
  };

  function brancherLignes() {
    corps.querySelectorAll('[data-ligne]').forEach(tr => {
      const ligneId = tr.dataset.ligne;

      tr.querySelectorAll('[data-champ]').forEach(el => {
        el.onchange = async () => {
          const cle = el.dataset.champ;
          const brut = String(el.value).trim();
          const valeur = brut === '' ? null
            : (cle === 'montant_devis' || cle === 'montant_commission') ? Number(brut) : brut;

          const r = await majApport(ligneId, { [cle]: valeur });
          if (!r.ok) return toast(`Non enregistré — ${r.motif}`, 'err');
          dire('Enregistré');

          // Un nom d'équipe neuf rejoint les suggestions des autres lignes,
          // sans redessiner le tableau : on est peut-être déjà dans la cellule
          // suivante.
          if (cle === 'apporte_par') majSuggestions();
          majChiffres();
          apres?.();
        };
      });

      const x = tr.querySelector('[data-suppr]');
      if (x) armerCroix(x, async () => {
        const r = await supprimerApport(ligneId);
        if (!r.ok) return toast(`Non supprimé — ${r.motif}`, 'err');
        redessinerCorps();
      });
    });
  }

  brancherLignes();

  const bAjout = m.querySelector('#pa-ajout');
  if (bAjout) bAjout.onclick = async () => {
    // Une ligne neuve porte l'apporteur de la fiche et la date du jour : c'est
    // le cas courant, et les deux se changent dans la ligne même.
    const r = await creerApport({
      apporteur_id: a.id,
      // ⚠ `aujourdhui()` et non `toISOString()` : ce dernier rend de l'UTC,
      // donc une ligne ajoutée à 23 h était datée du lendemain. Corrigé en
      // passant, le 05/10/2026.
      date_apport: aujourdhui(),
    });
    if (!r.ok) return toast(`Ligne non ajoutée — ${r.motif}`, 'err');
    redessinerCorps();
    // Le curseur va droit dans « Client » de la nouvelle ligne : c'est le
    // premier champ qu'on remplit, et le seul que la création ne devine pas.
    corps.querySelector(`[data-ligne="${CSS.escape(String(r.ligne.id))}"] [data-champ="client"]`)?.focus();
  };
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

      // ⚠ LA VISIBILITÉ D'UNE LIGNE VIENT DE SON PARTENAIRE, jamais d'elle-même :
      // `scope.rgd` range `rgd_apports_sortants` sous `apporteur` dans
      // `RGD_PORTEFEUILLE`, miroir exact de la policy. Un `db.t()` direct aurait
      // rendu le cache entier, donc les affaires de partenaires qu'un chargé
      // d'affaires n'a pas à voir.
      //
      // ⚠ LA RECHERCHE ATTRAPE AUSSI LE CLIENT ET CE QU'ON LUI A APPORTÉ, pas
      // seulement le partenaire : on cherche « Chevalier » pour retrouver à qui
      // on l'a passée. Une ligne peut donc apparaître ici alors que son
      // partenaire ne figure dans aucune des trois sections du dessus — c'est
      // voulu, la question posée n'est pas la même.
      const sectionSortants = () => {
        const parId = new Map(tous.map(p => [String(p.id), p]));
        const vusIds = new Set(vus.map(p => String(p.id)));
        const lignes = trierSortants(scope.rgd('rgd_apports_sortants')).filter(x => {
          if (!parId.has(String(x.apporteur_id))) return false;
          return vusIds.has(String(x.apporteur_id)) || hit([x.client, x.objet], ts);
        });
        // Rien à résumer, rien à écrire : le message du tableau vide dit déjà
        // à quoi sert ce bloc, et une phrase de bilan au-dessus de lui ferait
        // deux fois la même annonce.
        const resume = phraseBilan(bilanDesSortants(lignes), '');

        const ligneS = (x) => {
          const p = parId.get(String(x.apporteur_id));
          // ⚠ PAS D'ISSUE SE DIT « Pas tranché », jamais un tiret : on saisit
          // l'apport le jour où on le fait, avant de savoir — c'est une réponse,
          // pas une case oubliée. Même convention qu'en face.
          const e = ISSUES[x.issue];
          const issue = e
            ? `<span class="chip ${e.ton}">${esc(e.label)}</span>`
            : '<span class="chip muted">Pas tranché</span>';
          // ⚠ LA COMMISSION S'AFFICHE EN GRIS QUAND ELLE NE COMPTE PAS. Une
          // affaire pas encore gagnée peut déjà porter le montant convenu : le
          // cacher ferait croire qu'il n'a pas été noté, le mettre en gras le
          // ferait lire comme un dû. Le total, lui, ne prend que les gagnées.
          const com = x.commission
            ? (x.issue === 'gagne'
              ? `<b>${esc(eur(x.commission))}</b>`
              : `<span class="muted">${esc(eur(x.commission))}</span>`)
            : '<span class="muted">—</span>';
          return `<tr data-vers-sortants="${esc(String(x.apporteur_id))}">
            <td><b>${esc(nomDe(p))}</b>${p.profession
              ? `<div class="s muted">${esc(p.profession)}</div>` : ''}</td>
            <td class="pa-serre">${x.date_apport
              ? esc(fmtDate(x.date_apport)) : '<span class="muted">—</span>'}</td>
            <td>${x.client ? esc(x.client) : '<span class="muted">—</span>'}</td>
            <td>${x.objet ? esc(x.objet) : '<span class="muted">—</span>'}${x.notes
              ? `<div class="s muted">${esc(x.notes)}</div>` : ''}</td>
            <td class="pa-serre">${issue}</td>
            <td class="num">${x.montant_estime
              ? esc(eur(x.montant_estime)) : '<span class="muted">—</span>'}</td>
            <td class="num">${com}</td>
          </tr>`;
        };

        // ⚠ ELLE S'AFFICHE MÊME VIDE, à l'inverse de la section des inactifs :
        // c'est un tableau qu'on vient de demander, et le faire disparaître
        // faute de ligne ferait chercher où il est passé. Son message dit à quoi
        // il sert, ce qu'un bloc absent ne dit pas.
        return `
        <section class="card pa-sect" style="--pa-trait:var(--green)">
          <div class="pa-head">
            <h3>Affaires apportées par RGD Renova</h3>
            <span class="pa-compte" style="background:var(--green)">${lignes.length}</span>
            <span class="grow"></span>
            ${state.ecriture
              ? '<button type="button" class="btn primary" id="pa-reperer">+ Une affaire apportée</button>'
              : ''}
          </div>
          ${resume ? `<p class="pa-note">${resume}</p>` : ''}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Partenaire</th><th>Date</th><th>Client</th>
                <th>Ce que RGD lui a apporté</th><th>Issue</th>
                <th class="num">Montant estimé</th><th class="num">Commission attendue</th></tr></thead>
              <tbody>${lignes.map(ligneS).join('')
                || `<tr><td colspan="7"><div class="empty">${state.q
                  ? 'Aucune affaire apportée ne correspond à cette recherche.'
                  : 'Rien d’enregistré pour l’instant. Notez ici les affaires que RGD a '
                    + 'passées à un partenaire — un financement à un courtier, des plans à '
                    + 'un architecte, une cuisine à un fournisseur.'}</div></td></tr>`}</tbody>
            </table>
          </div>
          <p class="pa-note">La commission n’entre dans le total que sur une affaire
            <b>gagnée</b> par le partenaire. ${state.ecriture
              ? 'Un clic sur une ligne ouvre la fiche du partenaire, où elles se modifient.'
              : 'Lecture seule.'}</p>
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
        ${SECTIONS.map(section).join('')}
        ${sectionSortants()}`;

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

      // ⚠ UN ATTRIBUT À PART, ET PAS `data-partenaire` : la même fiche s'ouvre,
      // mais posée sur le tableau des sortants. Arriver en haut de la fiche
      // après avoir cliqué une ligne d'affaire obligerait à faire défiler pour
      // retrouver celle qu'on vient de désigner.
      root.querySelectorAll('[data-vers-sortants]').forEach(tr => tr.onclick = () =>
        ouvrirFichePartenaire(tr.dataset.versSortants, draw, { vers: 'sortants' }));

      const bRep = root.querySelector('#pa-reperer');
      if (bRep) bRep.onclick = () => nouveauSortant(draw);
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
