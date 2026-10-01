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
import { esc, openModal, closeModal, toast } from '../ui.js';
import { DEMANDEUR, BIEN, RESIDENCE, TRAVAUX, BUDGETS, CONNU, listeTravaux }
  from '../data/rgd-formulaire.js';
import { valeursProjet, valeursSuivi, personneDe, enregistrerProjet }
  from '../data/rgd-projet.js';

const ECRANS = ['prospect', 'projet', 'suivi'];
const TITRES = { prospect: 'Le prospect', projet: 'Le projet', suivi: 'Le suivi' };

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
  };

  const nomEcran = () => ECRANS[etatPas.pas - 1] || 'prospect';
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
  const ecranProspect = () => `
    <div class="mf-grille">
      ${pro ? champ('raison_sociale', 'Raison sociale', { plein: true })
            : champ('prenom', 'Prénom') + champ('nom', 'Nom')}
      ${champ('telephone', 'Téléphone', { type: 'tel', placeholder: '06 …' })}
      ${champ('email', 'E-mail', { type: 'email', placeholder: 'nom@exemple.fr' })}
      ${champ('adresse', 'Adresse', { plein: true })}
      ${champ('code_postal', 'Code postal')}
      ${champ('ville', 'Ville')}
      ${aLeContexte ? puce('type_demandeur', 'Type de demandeur', DEMANDEUR) : ''}
    </div>`;

  const ecranProjet = () => `
    <div class="mf-grille">
      ${puce('type_projet', 'Type de bien', BIEN)}
      ${puce('type_intervention', 'Usage du bien', RESIDENCE)}
      ${champ('superficie', 'Superficie', { type: 'number', inputmode: 'numeric', placeholder: 'm²' })}
      ${puces('types_travaux', 'Types de travaux', TRAVAUX)}
      ${puce('budget_annonce', 'Budget annoncé', BUDGETS)}
      <!-- L'adresse du chantier n'est pas celle de la personne : un chantier se
           fait souvent ailleurs que chez elle. Elle ne se saisissait qu'en
           modification jusqu'au 01/10/2026. -->
      ${champ('adresse_chantier', 'Adresse du chantier', { plein: true })}
      ${zone('projet_description', 'Ce que la personne demande', 4,
        'Noté pendant l’appel : ce qu’elle veut faire, ses délais, ce qui l’inquiète…')}
    </div>`;

  const ecranSuivi = () => `
    <div class="mf-grille">
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
           a deja le sien, a l'etape d'avant. C'est le meme champ que la colonne
           « Note » du tableau. Et SURTOUT PAS d'accent grave dans ce
           commentaire : il refermerait le gabarit. -->
      ${zone('commentaire', 'Commentaire', 4,
        'Ce qu’il faut savoir sur elle : disponibilités, ton de l’échange, à rappeler quand…')}
      ${aLeContexte ? '' : `<p class="rgp-note plein">Le type de demandeur, le « connu via » et
        la recommandation ne sont posés que sur une demande : cette fiche vient de
        l’application RGD, qui ne les porte pas.</p>`}
    </div>`;

  const RENDU = { prospect: ecranProspect, projet: ecranProjet, suivi: ecranSuivi };

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
      ['raison_sociale', 'prenom', 'nom', 'telephone', 'email', 'adresse',
        'code_postal', 'ville'].forEach(poser);
    } else if (ecran === 'projet') {
      ['superficie', 'adresse_chantier', 'projet_description'].forEach(poser);
    } else {
      ['recommandation', 'commentaire'].forEach(poser);
      const ap = dans.querySelector('#rgp-apporteur_id');
      if (ap) ap.onchange = () => { v.apporteur_id = ap.value; };
    }
  };

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
  // Le premier champ du premier écran : au téléphone, le prénom est ce qui
  // arrive en premier.
  m.querySelector('#rgp-prenom')?.focus();
}
