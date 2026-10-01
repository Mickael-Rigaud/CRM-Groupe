// La fiche projet de RGD Renova — un seul formulaire, deux portes d'entrée
//
// ⚠ ELLE REMPLACE `rgd-demande-saisie.js` ET `rgd-fiche-modif.js` (01/10/2026,
// demandé par Mickael : « je voudrais créer une fiche projet pour rgd quand on
// clique sur + nouvelle demande et quand on veut modifier les informations de
// la fiche »). C'est le mouvement fait chez BTP Expertise le 25/09 : trois
// formulaires qui écrivaient dans la même table, trois présentations, et un
// seul d'entre eux savait modifier. Ce que chaque porte ne posait pas et ce que
// ça coûtait est écrit dans `js/data/rgd-projet.js`, qui porte l'écriture.
//
// ⚠ CE QU'ELLE REPREND DE LA FICHE PROJET BTP : la barre d'étapes, la
// circulation dans les deux sens, l'enregistrement disponible à chaque étape,
// les puces à la place des listes déroulantes. Les styles sont les SIENS
// (`.mf-pas`, `.mf-grille`, `.mail-champ`, `.fa-chip`), pas des copies : ils
// retombent déjà sur `--accent` quand `--m` n'est pas posé, et deux fiches
// projet qui se ressemblent s'apprennent une fois.
//
// ⚠ L'ORDRE DES ÉTAPES EST CELUI DE MICKAEL (01/10/2026) : **Le projet · Le
// rendez-vous · Le prospect**. Il remplace « Le prospect · Le projet · Le
// suivi » de la veille, et ce n'est pas un détail de présentation : au
// téléphone on qualifie d'abord — de quoi s'agit-il, où, quel budget —, on
// cale la visite, et on prend les coordonnées à la fin. C'est le même
// retournement que la fiche projet de BTP Expertise le 29/09, pour la même
// raison. Les quatre champs du suivi (connu via, recommandation, apporteur,
// commentaire) **n'ont pas disparu** : Mickael ne les a pas listés, mais les
// supprimer retirerait une saisie qui existe ; ils sont passés sous un trait,
// au bas de « Le prospect », qui est l'étape qui parle de la personne.
//
// ⚠ ELLE REVIENT SUR LE « UN SEUL ÉCRAN, DEUX COLONNES » DU 23/09/2026, et il
// faut dire pourquoi. L'argument d'alors tient toujours : on saisit pendant un
// appel, avec la personne au bout du fil, et un formulaire qui impose son ordre
// fait perdre ce qui vient dans un autre. Ce qui le rendait vrai, c'était le
// « Continuer » du site : des étapes VERROUILLÉES, qu'on ne pouvait franchir
// qu'en remplissant. Ici les trois étapes sont des onglets — toutes cliquables,
// tout le temps, dans les deux sens — et **« Créer la demande » est disponible
// dès la première**. Rien n'est gated : ni la navigation, ni l'enregistrement.
// Seul l'affichage est paginé, ce qui est la condition pour que le même
// formulaire tienne dans la colonne de la fiche, où il remplace deux blocs.
//
// ⚠ PAS DE `confirm()` DE `ui.js` ICI NON PLUS : il appelle `closeModal(true)`
// et REMPLACE la fenêtre courante — sur la porte « Modifier », c'est la fiche
// entière qui disparaîtrait, avec la saisie. Septième occurrence du piège dans
// ce dépôt. Il n'y a donc aucune confirmation : le formulaire n'efface rien.
import { scope } from '../data/scope.js';
import { esc, openModal, closeModal, toast, fmtDate } from '../ui.js';
import { DEMANDEUR, BIEN, RESIDENCE, TRAVAUX, BUDGETS, CONNU, listeTravaux }
  from '../data/rgd-formulaire.js';
import { valeursProjet, valeursSuivi, personneDe, enregistrerProjet, ditCreneau }
  from '../data/rgd-projet.js';
import {
  lireCreneaux, occupationDuJour, placesLibres, hhmm, lundiDe,
  aujourdhuiParis, maintenantParis, DUREES,
} from '../data/rgd-creneaux.js';
import { decale } from '../data/evenements.js';

const ECRANS = ['projet', 'rendezvous', 'prospect'];
const TITRES = { projet: 'Le projet', rendezvous: 'Le rendez-vous', prospect: 'Le prospect' };

// La semaine affichée par le choix de créneau. Six jours : RGD travaille le
// samedi, pas le dimanche — une colonne vide tous les sept jours ne dit rien
// et prend un sixième de la largeur.
const JOURS_SEMAINE = 6;
const NOMS_JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
// Jusqu'où on peut avancer. `agenda-creneaux` plafonne à 45 jours : proposer
// d'aller au-delà donnerait une semaine vide sans que rien ne le dise.
const SEMAINES_MAX = 6;

// Les puces de RGD prennent la couleur de la structure. `--m` n'est pas posé
// ailleurs dans cet espace, et `.fa-chip` retombe sur `--accent` sans lui ; on
// le pose quand même pour que la barre d'étapes, qui n'a pas ce repli, suive
// la marque au lieu de rester grise.
const TEINTE = '--m:var(--accent);--m-clair:var(--accent-soft);--m-encre:var(--accent-ink)';

/**
 * Le formulaire, monté dans un élément que l'appelant fournit.
 *
 * ⚠ IL NE S'OUVRE PAS LUI-MÊME DANS UNE MODALE, contrairement à la fiche projet
 * BTP, et c'est la porte « Modifier » qui l'impose : elle le rend DANS la
 * fiche, en remplacement de ses deux blocs d'information. `openModal` ferme
 * celle qui est ouverte avant d'ouvrir la suivante — un formulaire par-dessus
 * la fiche l'aurait fait disparaître, et « Annuler » n'aurait eu nulle part où
 * revenir.
 *
 * `cible`  l'instantané de la fiche (`ficheDe`), ou `null` pour une création.
 * `etat`   `{ pas }`, gardé par l'appelant : la fiche se redessine de
 *          l'extérieur (changement d'étape, attribution), et un numéro
 *          d'étape posé ici repartirait à 1 à chaque fois.
 */
export function ficheProjetRgd({ dans, cible = null, apporteurs = null,
                                 propose = {}, etat = null, apres, annuler } = {}) {
  const x = cible;
  const f = x?.ligne || {};
  const p = x ? personneDe(f) : null;
  const l = p?.ligne || {};
  const pro = !!p?.pro;
  const estDemande = x?.genre === 'demande';
  const proj = x ? valeursProjet(x) : {};
  const suivi = x ? valeursSuivi(x) : { aLeContexte: true };
  // ⚠ UNE CRÉATION ÉCRIT UNE DEMANDE, donc elle a le contexte. Les trois
  // champs d'origine (type de demandeur, connu via, recommandation) n'existent
  // que sur `rgd_demandes` : voir `valeursSuivi`.
  const aLeContexte = suivi.aLeContexte;

  // On montre la société quand elle existe, sinon la personne : c'est sous ce
  // nom-là qu'un partenaire se désigne au téléphone.
  const choixApporteurs = (apporteurs || scope.rgd('rgd_apporteurs') || [])
    .map(a => [a.id, a.societe || a.raison_sociale
      || [a.prenom, a.nom].filter(Boolean).join(' ') || '(sans nom)'])
    .sort((a, b) => a[1].localeCompare(b[1], 'fr'));

  const etatPas = etat || { pas: 1 };
  const v = {
    prenom: pro ? '' : (l.first_name ?? f.prenom ?? ''),
    nom: pro ? '' : (l.last_name ?? f.nom ?? ''),
    raison_sociale: pro ? (l.name || '') : '',
    telephone: l.phone || f.telephone || propose.telephone || '',
    email: l.email ?? f.email ?? '',
    adresse: l.address ?? f.adresse ?? '',
    code_postal: l.postal_code ?? f.code_postal ?? '',
    ville: l.city ?? f.ville ?? '',
    type_demandeur: suivi.type_demandeur || '',
    type_projet: proj.type_projet || '',
    type_intervention: proj.type_intervention || '',
    superficie: proj.superficie || '',
    types_travaux: listeTravaux(proj.types_travaux),
    budget_annonce: proj.budget_annonce || '',
    adresse_chantier: proj.adresse_chantier || '',
    projet_description: proj.projet_description || '',
    comment_connu: suivi.comment_connu || '',
    recommandation: suivi.recommandation || '',
    apporteur_id: suivi.apporteur_id || '',
    commentaire: suivi.commentaire || '',
    // Le créneau retenu. Vide tant qu'on n'a rien choisi — prendre un
    // rendez-vous n'est pas obligatoire pour noter une demande.
    rdv_jour: '', rdv_heure: '', rdv_duree: 60,
  };

  // ⚠ CE QUI EST LU CHEZ GOOGLE NE VIT PAS DANS `v` : `v` est la saisie, ceci
  // est une lecture. La confondre avec la saisie ferait repartir une requête à
  // chaque frappe, et enregistrer l'agenda de la semaine avec la fiche.
  const agenda = {
    semaine: lundiDe(aujourdhuiParis()),
    occupes: null, lu_a: null, demo: false, erreur: null, charge: false,
  };

  // Les visites déjà posées pour cette fiche. Elles viennent des chantiers, pas
  // de l'agenda : c'est le chantier qui relie un rendez-vous à une personne.
  const visitesDejaLa = () => {
    if (!x) return [];
    const cid = f.contact_id;
    const oid = f.organisation_id;
    if (!cid && !oid) return [];
    return (scope.rgd('rgd_chantiers') || [])
      .filter(c => c.statut_d1 === 'visite_technique'
        && ((cid && c.contact_id === cid) || (oid && c.organisation_id === oid))
        && c.date_debut_prevue)
      .sort((a, b) => String(b.date_debut_prevue).localeCompare(String(a.date_debut_prevue)));
  };

  const nomEcran = () => ECRANS[etatPas.pas - 1] || 'projet';
  const nomDit = () => (v.raison_sociale || [v.prenom, v.nom].filter(Boolean).join(' ')).trim();

  // ------------------------------------------------------------- les briques
  const champ = (cle, libelle, opts = {}) => `
    <label class="mail-champ ${opts.plein ? 'plein' : ''}" data-champ="${cle}">
      <span>${esc(libelle)}</span>
      <input id="rgp-${cle}" name="${cle}" type="${opts.type || 'text'}"
        ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ''}
        ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}
        value="${esc(v[cle] ?? '')}"></label>`;

  const zone = (cle, libelle, lignes, placeholder) => `
    <label class="mail-champ plein" data-champ="${cle}">
      <span>${esc(libelle)}</span>
      <textarea id="rgp-${cle}" name="${cle}" rows="${lignes}"
        placeholder="${esc(placeholder)}">${esc(v[cle] ?? '')}</textarea></label>`;

  // ⚠ UNE VALEUR DÉJÀ EN BASE QUI N'EST PAS DANS LA LISTE Y EST AJOUTÉE,
  // COCHÉE, en trait discontinu. Sans ça elle ne s'afficherait nulle part et le
  // premier enregistrement l'EFFACERAIT en silence. Le cas est réel, pas
  // théorique : des demandes portent « Menuiseries » là où la liste dit
  // « Menuiserie PVC », et un budget « 15 000 € » qui n'est dans aucune
  // tranche. Le vocabulaire a bougé avec le temps, ce n'est pas au formulaire
  // de trancher.
  const avecLesPresentes = (liste, presentes) =>
    [...liste, ...presentes.filter(y => y && !liste.includes(y))];

  const bloc = (cle, libelle, liste, retenues, multi) => `
    <div class="mail-champ plein" data-champ="${cle}">
      <span>${esc(libelle)}${multi && retenues.length ? ` · ${retenues.length} sélectionné${retenues.length > 1 ? 's' : ''}` : ''}</span>
      <div class="fa-chips" data-${multi ? 'puces' : 'puce'}="${cle}">
        ${avecLesPresentes(liste, retenues).map(o => `
          <button type="button" class="fa-chip ${retenues.includes(o) ? 'on' : ''}${liste.includes(o) ? '' : ' est-hors-liste'}"
            data-val="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
    </div>`;

  const puces = (cle, libelle, liste) => bloc(cle, libelle, liste, v[cle], true);
  const puce = (cle, libelle, liste) => bloc(cle, libelle, liste, v[cle] ? [v[cle]] : [], false);

  // ------------------------------------------------------------- les écrans
  // ⚠ L'ORDRE DES CHAMPS EST CELUI QUE MICKAEL A ÉCRIT (01/10/2026), y compris
  // « Détails du projet » AVANT le budget : on décrit ce qu'il y a à faire,
  // puis ce que ça peut coûter. L'inverse fait annoncer un prix sur un projet
  // qu'on n'a pas fini d'entendre.
  const ecranProjet = () => `
    <div class="mf-grille">
      ${puce('type_projet', 'Type de bien', BIEN)}
      ${puce('type_intervention', 'Usage du bien', RESIDENCE)}
      ${champ('superficie', 'Superficie', { type: 'number', inputmode: 'numeric', placeholder: 'm²' })}
      ${puces('types_travaux', 'Types de travaux', TRAVAUX)}
      <!-- ⚠ « DÉTAILS DU PROJET », pas « Ce que la personne demande » : c'est le
           nom que Mickael lui donne, et c'est la MÊME colonne en base. En créer
           une seconde aurait donné deux textes libres que personne ne saurait
           départager. (Pas d'accent grave dans un commentaire HTML pose au
           milieu d'un gabarit : il FERME le gabarit, et node --check ne le voit
           pas — refait ici le 01/10/2026, vu au premier chargement.) -->
      ${zone('projet_description', 'Détails du projet', 4,
        'Ce qu’il y a à faire, pièce par pièce : l’état actuel, ce que la personne veut obtenir, ses délais, ce qui l’inquiète…')}
      ${puce('budget_annonce', 'Budget annoncé', BUDGETS)}
      <!-- L'adresse du chantier n'est pas celle de la personne : un chantier se
           fait souvent ailleurs que chez elle. Elle ne se saisissait qu'en
           modification jusqu'au 01/10/2026. -->
      ${champ('adresse_chantier', 'Adresse du chantier', { plein: true })}
    </div>`;

  // ⚠ L'ADRESSE TIENT SUR UNE SEULE LIGNE (demandé le 01/10/2026) : rue, code
  // postal, ville. Dans une `.mf-grille` en `auto-fit`, les trois champs
  // tombaient où la place les menait — le code postal sous la rue, la ville
  // toute seule à la ligne suivante. `.rgp-adresse` les tient en 3fr / 1fr / 2fr.
  const ecranProspect = () => `
    <div class="mf-grille">
      ${pro ? champ('raison_sociale', 'Raison sociale', { plein: true })
            : champ('nom', 'Nom') + champ('prenom', 'Prénom')}
      ${champ('telephone', 'Téléphone', { type: 'tel', placeholder: '06 …' })}
      ${champ('email', 'E-mail', { type: 'email', placeholder: 'nom@exemple.fr' })}
      <div class="rgp-adresse plein">
        ${champ('adresse', 'Adresse')}
        ${champ('code_postal', 'Code postal')}
        ${champ('ville', 'Ville')}
      </div>
      ${aLeContexte ? puce('type_demandeur', 'Type de demandeur', DEMANDEUR) : ''}

      <!-- ⚠ CE QUI SUIT N'ÉTAIT PAS DANS LA LISTE DE MICKAEL, ET N'EST PAS
           SUPPRIMÉ POUR AUTANT. Les quatre champs du suivi sont la seule façon
           de corriger un apporteur ou un commentaire — c'est précisément le
           trou que la fiche projet venait de boucher la veille. Les retirer
           parce qu'ils ne sont pas cités le rouvrirait. Ils passent sous un
           trait : on les voit, ils ne s'imposent pas. -->
      <div class="rgp-second plein">
        <span>Provenance et suivi</span>
      </div>
      ${aLeContexte ? puce('comment_connu', 'Connu via', CONNU) : ''}
      ${aLeContexte && /recommand/i.test(v.comment_connu)
        ? champ('recommandation', 'Recommandé par',
            { plein: true, placeholder: 'Nom de la personne ou du partenaire' })
        : ''}
      <!-- ⚠ L'APPORTEUR PASSE DEVANT LE « CONNU VIA » DANS LA DECISION DE
           PROVENANCE : un nom choisi ici est un fait, « Recommandation » dans
           la liste d'a cote est une categorie. -->
      <label class="mail-champ plein" data-champ="apporteur_id">
        <span>Apporté par</span>
        <select id="rgp-apporteur_id" name="apporteur_id">
          <option value="">—</option>
          ${choixApporteurs.map(([id, nom]) => `
            <option value="${esc(id)}"${id === v.apporteur_id ? ' selected' : ''}>${esc(nom)}</option>`).join('')}
        </select></label>
      <!-- ⚠ CE COMMENTAIRE-LA PARLE DE LA PERSONNE, pas du projet : ce qu'on
           retient d'elle, son humeur, l'heure a laquelle la rappeler. Le projet
           a deja le sien, a la premiere etape. C'est le meme champ que la
           colonne « Note » du tableau. Et SURTOUT PAS d'accent grave dans ce
           commentaire : il refermerait le gabarit. -->
      ${zone('commentaire', 'Commentaire', 3,
        'Ce qu’il faut savoir sur elle : disponibilités, ton de l’échange, à rappeler quand…')}
      ${aLeContexte ? '' : `<p class="rgp-note plein">Le type de demandeur, le « connu via » et
        la recommandation ne sont posés que sur une demande : cette fiche vient de
        l’application RGD, qui ne les porte pas.</p>`}
    </div>`;

  // ---------------------------------------------------- l'écran rendez-vous
  //
  // ⚠ CE QUI EST MONTRÉ EST LU CHEZ GOOGLE À L'INSTANT, pas dans le reflet du
  // CRM : voir l'en-tête de `data/rgd-creneaux.js`. Un rendez-vous pris ce
  // matin pour la semaine prochaine n'est pas dans le reflet avant demain, et
  // c'est exactement celui par-dessus lequel on poserait une visite.
  //
  // ⚠ ON MONTRE CE QUI OCCUPE, PAS SEULEMENT CE QUI RESTE. Une colonne qui
  // n'afficherait que les heures libres ne dirait pas POURQUOI le mardi
  // après-midi manque — et on ne saurait pas si ça vaut la peine de décaler.
  const ecranRendezVous = () => {
    const aujourdhui = aujourdhuiParis();
    const jours = Array.from({ length: JOURS_SEMAINE }, (_, i) => decale(agenda.semaine, i));
    const premiereSemaine = lundiDe(aujourdhui);
    const derniereSemaine = decale(premiereSemaine, 7 * SEMAINES_MAX);
    const dejaLa = visitesDejaLa();

    const tete = `
      <div class="rgp-cal-tete">
        <div class="rgp-cal-nav">
          <button type="button" class="btn ghost sm" id="rgp-sem-prec"
            ${agenda.semaine <= premiereSemaine ? 'disabled' : ''}>‹</button>
          <b>${esc(libelleSemaine(jours[0], jours[jours.length - 1]))}</b>
          <button type="button" class="btn ghost sm" id="rgp-sem-suiv"
            ${agenda.semaine >= derniereSemaine ? 'disabled' : ''}>›</button>
        </div>
        <div class="rgp-cal-duree">
          <span>Durée</span>
          ${DUREES.map(([m, lbl]) => `
            <button type="button" class="fa-chip ${Number(v.rdv_duree) === m ? 'on' : ''}"
              data-duree="${m}">${esc(lbl)}</button>`).join('')}
        </div>
      </div>`;

    if (agenda.erreur) {
      return `${tete}<p class="rgp-cal-vide">L’agenda n’a pas pu être lu — ${esc(agenda.erreur)}.
        <br>La demande s’enregistre quand même, le rendez-vous se posera depuis l’écran Agenda.</p>
        ${piedRdv(dejaLa)}`;
    }
    if (!agenda.occupes) {
      return `${tete}<p class="rgp-cal-vide">Lecture de l’agenda…</p>${piedRdv(dejaLa)}`;
    }

    const colonnes = jours.map((jour, i) => {
      const occ = occupationDuJour(agenda.occupes, jour);
      const libres = placesLibres(occ, {
        duree: Number(v.rdv_duree) || 60,
        // ⚠ PAS DE CRÉNEAU DANS LE PASSÉ : seulement pour aujourd'hui, et
        // seulement aujourd'hui — borner les autres jours sur l'heure courante
        // masquerait toutes les matinées à partir de midi.
        avant: jour === aujourdhui ? maintenantParis() : null,
      });
      const passe = jour < aujourdhui;
      return `
        <div class="rgp-jour ${passe ? 'est-passe' : ''}">
          <div class="rgp-jour-tete">
            <b>${esc(NOMS_JOURS[i] || '')}</b>
            <span>${esc(String(Number(jour.slice(8, 10))))}/${esc(jour.slice(5, 7))}</span>
          </div>
          ${occ.length ? `<ul class="rgp-occupe">${occ.map(o => `
            <li title="${esc(o.titre)}">${o.journee ? 'journée'
              : `${esc(hhmm(o.debut))}`} · ${esc(o.titre)}</li>`).join('')}</ul>` : ''}
          ${passe ? '<p class="rgp-jour-rien">passé</p>'
            : libres.length ? `<div class="rgp-libres">${libres.map(t => `
                <button type="button" class="rgp-creneau ${v.rdv_jour === jour && v.rdv_heure === hhmm(t) ? 'on' : ''}"
                  data-jour="${jour}" data-heure="${esc(hhmm(t))}">${esc(hhmm(t))}</button>`).join('')}</div>`
              : '<p class="rgp-jour-rien">complet</p>'}
        </div>`;
    }).join('');

    const source = agenda.demo
      ? '<span class="rgp-cal-source est-demo">Jeu d’exemple — en vrai, l’agenda est lu chez Google à l’ouverture.</span>'
      : `<span class="rgp-cal-source">Agenda lu à l’instant${agenda.lu_a
          ? ` (${esc(new Date(agenda.lu_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))})` : ''}.</span>`;

    return `${tete}<div class="rgp-cal">${colonnes}</div>${source}${piedRdv(dejaLa)}`;
  };

  const libelleSemaine = (du, au) => {
    const m = (j) => new Date(`${j}T12:00:00Z`)
      .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    return `${m(du)} → ${m(au)}`;
  };

  // ⚠ CE QUI EST DIT SOUS LA GRILLE EST LA MOITIÉ UTILE DE L'ÉCRAN : sans
  // créneau choisi, il faut écrire que la fiche s'enregistre quand même —
  // sinon on cherche le bouton qui n'existe pas.
  const piedRdv = (dejaLa) => `
    ${dejaLa.length ? `<div class="rgp-rdv-deja">
      <span>Déjà prévu</span>
      <ul>${dejaLa.slice(0, 3).map(c => `<li>Visite technique du ${esc(fmtDate(c.date_debut_prevue))}</li>`).join('')}</ul>
    </div>` : ''}
    <div class="rgp-rdv-choix ${v.rdv_jour ? 'est-pris' : ''}">
      ${v.rdv_jour
        ? `<b>Visite le ${esc(ditCreneau(v))}</b>
           <button type="button" class="btn ghost sm" id="rgp-rdv-retirer">Retirer</button>
           <p>Le rendez-vous sera créé dans l’agenda à l’enregistrement, et le
              client recevra une confirmation par e-mail${v.email ? '.'
                : ' <b>— mais aucune adresse e-mail n’est renseignée pour l’instant.</b>'}</p>`
        : `<b>Aucun créneau choisi</b>
           <p>La demande s’enregistre très bien sans rendez-vous : on rappelle, on
              cale la visite plus tard.</p>`}
    </div>`;

  const RENDU = { projet: ecranProjet, rendezvous: ecranRendezVous, prospect: ecranProspect };

  const pied = () => `
    <div class="rgp-pied">
      <button type="button" class="btn ghost" id="rgp-annuler">Annuler</button>
      <span class="grow"></span>
      ${etatPas.pas > 1 ? '<button type="button" class="btn ghost" id="rgp-retour">← Retour</button>' : ''}
      ${etatPas.pas < ECRANS.length ? '<button type="button" class="btn ghost" id="rgp-suite">Suivant →</button>' : ''}
      <!-- ⚠ ENREGISTRER EST DISPONIBLE À CHAQUE ÉTAPE, et ce n'est pas un
           confort : on saisit pendant un appel, et un appel se coupe. Le
           formulaire a trois écrans, il n'a pas trois conditions. -->
      <button type="button" class="btn" id="rgp-ok">${x ? 'Enregistrer' : 'Créer la demande'}</button>
    </div>`;

  const dessine = () => {
    dans.innerHTML = `
      <div class="rgp" style="${TEINTE}">
        <div class="mf-pas rgp-pas">
          ${ECRANS.map((nom, i) => `
            <div class="mf-pas-item ${etatPas.pas === i + 1 ? 'on' : 'fait'}" data-pas="${i + 1}">
              <span class="mf-pas-num">${i + 1}</span>${esc(TITRES[nom])}
            </div>`).join('<i class="mf-pas-lien"></i>')}
        </div>
        ${RENDU[nomEcran()]()}
        ${x ? '' : `<p class="rgp-note">Créée <b>dans le CRM</b> : elle apparaît tout de suite,
          et aucune synchronisation ne l’écrasera.</p>`}
        ${pied()}
      </div>`;
    lier();
  };

  // Un champ texte écrit dans `v` à la frappe : le redessin d'un clic sur une
  // puce détruit le champ, et ce qui n'est pas déjà dans `v` partirait avec lui.
  const poser = (cle) => {
    const el = dans.querySelector(`#rgp-${cle}`);
    if (el) el.oninput = () => { v[cle] = el.value; };
  };

  const marque = (cles) => {
    dans.querySelectorAll('.mail-champ').forEach(c => c.classList.remove('est-manquant'));
    let premier = null;
    for (const cle of cles) {
      if (String(v[cle] ?? '').trim()) continue;
      const b = dans.querySelector(`[data-champ="${cle}"]`);
      b?.classList.add('est-manquant');
      premier = premier || b;
    }
    premier?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return !premier;
  };

  const lier = () => {
    // ⚠ LES TROIS ÉTAPES SONT TOUTES CLIQUABLES, TOUT LE TEMPS. C'est ce qui
    // remplace le « tout sous les yeux » de l'écran unique : on ne franchit
    // rien, on choisit ce qu'on regarde — et on y revient d'un clic quand la
    // personne au téléphone change de sujet.
    dans.querySelectorAll('[data-pas]').forEach(b => b.onclick = () => {
      etatPas.pas = Number(b.dataset.pas); dessine();
    });
    dans.querySelector('#rgp-retour')?.addEventListener('click', () => { etatPas.pas -= 1; dessine(); });
    dans.querySelector('#rgp-suite')?.addEventListener('click', () => { etatPas.pas += 1; dessine(); });
    dans.querySelector('#rgp-annuler')?.addEventListener('click', () => annuler?.());
    dans.querySelector('#rgp-ok')?.addEventListener('click', enregistrer);

    dans.querySelectorAll('[data-puces]').forEach(g => {
      const cle = g.dataset.puces;
      g.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
        const y = b.dataset.val;
        v[cle] = v[cle].includes(y) ? v[cle].filter(z => z !== y) : [...v[cle], y];
        dessine();
      });
    });
    dans.querySelectorAll('[data-puce]').forEach(g => {
      const cle = g.dataset.puce;
      g.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
        // Un second clic sur la puce retenue la désélectionne : c'est le seul
        // moyen de revenir à « rien de choisi » après s'être trompé.
        v[cle] = v[cle] === b.dataset.val ? '' : b.dataset.val;
        dessine();
      });
    });

    const ecran = nomEcran();
    if (ecran === 'prospect') {
      // Les champs du suivi vivent sur cet écran depuis le 01/10 : voir le
      // bloc « Provenance et suivi » dans `ecranProspect`.
      ['raison_sociale', 'prenom', 'nom', 'telephone', 'email', 'adresse',
        'code_postal', 'ville', 'recommandation', 'commentaire'].forEach(poser);
      const ap = dans.querySelector('#rgp-apporteur_id');
      if (ap) ap.onchange = () => { v.apporteur_id = ap.value; };
      return;
    }
    if (ecran === 'projet') {
      ['superficie', 'adresse_chantier', 'projet_description'].forEach(poser);
      return;
    }

    // --- l'écran rendez-vous
    dans.querySelector('#rgp-sem-prec')?.addEventListener('click', () => {
      agenda.semaine = decale(agenda.semaine, -7); chargerAgenda(true);
    });
    dans.querySelector('#rgp-sem-suiv')?.addEventListener('click', () => {
      agenda.semaine = decale(agenda.semaine, 7); chargerAgenda(true);
    });
    // ⚠ CHANGER LA DURÉE NE RELIT PAS L'AGENDA : ce qui est occupé ne dépend
    // pas de la durée qu'on cherche, seules les places libres se recalculent.
    // Relire ferait un appel réseau à chaque clic sur « 1 h 30 ».
    dans.querySelectorAll('[data-duree]').forEach(b2 => b2.onclick = () => {
      v.rdv_duree = Number(b2.dataset.duree);
      // ⚠ UN CRÉNEAU RETENU PEUT NE PLUS TENIR : passer de 1 h à 2 h sur un
      // 17:30 déborderait la fermeture, ou mordrait sur le rendez-vous
      // suivant. On le relâche plutôt que d'enregistrer un horaire impossible.
      if (v.rdv_jour && !encorePossible()) { v.rdv_jour = ''; v.rdv_heure = ''; }
      dessine();
    });
    dans.querySelectorAll('[data-jour][data-heure]').forEach(b2 => b2.onclick = () => {
      const meme = v.rdv_jour === b2.dataset.jour && v.rdv_heure === b2.dataset.heure;
      v.rdv_jour = meme ? '' : b2.dataset.jour;
      v.rdv_heure = meme ? '' : b2.dataset.heure;
      dessine();
    });
    dans.querySelector('#rgp-rdv-retirer')?.addEventListener('click', () => {
      v.rdv_jour = ''; v.rdv_heure = ''; dessine();
    });
    chargerAgenda(false);
  };

  /** Le créneau retenu tient-il encore, à la durée courante ? */
  const encorePossible = () => {
    if (!agenda.occupes || !v.rdv_jour || !v.rdv_heure) return true;
    const occ = occupationDuJour(agenda.occupes, v.rdv_jour);
    const [h, m] = v.rdv_heure.split(':').map(Number);
    return placesLibres(occ, { duree: Number(v.rdv_duree) || 60 }).includes(h * 60 + m);
  };

  /**
   * Va lire l'agenda, puis redessine.
   *
   * ⚠ ON NE REDESSINE QUE SI L'ÉCRAN EST ENCORE CELUI-LÀ : la lecture prend une
   * seconde, et pendant ce temps on peut être reparti sur « Le prospect ». Un
   * redessin aveugle y ramènerait la grille, en effaçant un nom en train d'être
   * tapé.
   */
  async function chargerAgenda(force) {
    if (agenda.charge && !force) return;
    if (!force && agenda.occupes) return;
    agenda.charge = true;
    if (force) { agenda.occupes = null; agenda.erreur = null; dessine(); }
    const du = agenda.semaine;
    const r = await lireCreneaux({ du, au: decale(du, JOURS_SEMAINE - 1) });
    // La semaine a pu changer pendant l'appel : on jette une réponse périmée
    // plutôt que d'afficher les créneaux d'une autre semaine.
    if (agenda.semaine !== du) return;
    agenda.charge = false;
    if (r.ok) {
      agenda.occupes = r.occupes; agenda.lu_a = r.lu_a; agenda.demo = !!r.demo; agenda.erreur = null;
    } else {
      agenda.occupes = []; agenda.erreur = r.motif;
    }
    if (nomEcran() === 'rendezvous') dessine();
  }

  async function enregistrer() {
    // ⚠ LE NOM ET UN MOYEN DE RAPPEL, RIEN DE PLUS, ET SEULEMENT À LA CRÉATION.
    // Le site exige onze champs parce qu'il parle à un inconnu qu'il ne pourra
    // pas relancer. Ici c'est quelqu'un de la maison qui saisit, souvent pendant
    // l'appel : refuser la fiche faute de superficie perdrait le prospect pour
    // de bon. Le nom seul ne suffit pas non plus — une fiche qu'on ne peut pas
    // rappeler n'est pas un prospect, c'est une ligne.
    //
    // ⚠ AUCUNE EXIGENCE NOUVELLE EN MODIFICATION : l'ancien formulaire n'en
    // avait pas, et en ajouter une bloquerait l'enregistrement de fiches qui se
    // corrigent très bien aujourd'hui.
    if (!x) {
      const cleNom = pro ? 'raison_sociale' : 'nom';
      if (!String(v[cleNom] ?? '').trim()) {
        etatPas.pas = 1; dessine(); marque([cleNom]);
        return toast('Le nom est obligatoire', 'warn');
      }
      if (!v.email.trim() && !v.telephone.trim()) {
        etatPas.pas = 1; dessine(); marque(['email', 'telephone']);
        return toast('Un e-mail ou un téléphone, au moins : sans quoi la demande ne se rappelle pas', 'warn');
      }
    }
    const ok = dans.querySelector('#rgp-ok');
    const libelle = ok.textContent;
    ok.disabled = true; ok.textContent = x ? 'Enregistrement…' : 'Création…';
    const r = await enregistrerProjet(x, v);
    if (!r.ok) {
      ok.disabled = false; ok.textContent = libelle;
      return toast(`Non enregistré — ${r.motif}`, 'err');
    }
    // ⚠ CE QUE LE RENDEZ-VOUS A DONNÉ SE DIT, MÊME QUAND TOUT VA BIEN : poser
    // une visite envoie un mail à un client et crée une ligne dans l'agenda de
    // quelqu'un. Un « Enregistré » muet laisserait se demander si c'est parti.
    if (r.rdv) {
      if (!r.rdv.ok) {
        toast(`Fiche enregistrée, mais le rendez-vous n’a pas pu être pris — ${r.rdv.motif}`, 'warn');
      } else if (r.rdv.manques?.length) {
        toast(`Rendez-vous pris — ${r.rdv.manques.join(' ; ')}`, 'warn');
      } else {
        toast(`Rendez-vous pris${r.rdv.mail ? ' et confirmation envoyée' : ''}`);
      }
    }
    apres?.(r);
  }

  dessine();
  return { nomDit };
}

/**
 * « + Nouvelle demande » — la même fiche projet, dans sa propre fenêtre.
 *
 * ⚠ C'EST LA SEULE DIFFÉRENCE ENTRE LES DEUX PORTES : ici une modale, là un
 * morceau de la fiche. Le formulaire, lui, est le même objet — c'était tout le
 * sujet de la demande.
 */
export function nouvelleDemandeRgd(apporteurs, apres) {
  const m = openModal('Nouvelle demande', '<div id="rgp-hote"></div>', { wide: true });
  ficheProjetRgd({
    dans: m.querySelector('#rgp-hote'),
    apporteurs,
    annuler: () => closeModal(),
    apres: () => { closeModal(); toast('Demande créée'); apres?.(); },
  });
  // Le premier champ du premier écran. Ce n'est plus le prénom depuis le
  // 01/10 : la première étape est « Le projet », et son premier champ est une
  // rangée de puces — il n'y a donc rien à focaliser, et `?.` suffit.
  m.querySelector('#rgp-prenom')?.focus();
}
