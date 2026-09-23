// Saisir une demande de devis à la main
//
// POURQUOI CE MODULE N'EST PAS `rgd-prospect-saisie.js`
// Celui-là crée une fiche `rgd_clients` de trois champs : nature des travaux,
// budget, note. C'était assez tant que « + Nouvelle demande » servait à noter
// un nom en vitesse. Demandé le 23/09/2026 : que la saisie à la main recueille
// LES MÊMES INFORMATIONS que le formulaire de
// https://www.rgdrenova.fr/demandez-un-devis/ — pour qu'un appel reçu et une
// demande arrivée du site donnent la même fiche, et qu'aucune des deux ne soit
// plus pauvre que l'autre.
//
// ⚠ UN CHAMP QUE LE SITE N'A PAS : « Apporté par ». Le site ne demande pas
// qui a envoyé la personne — il n'a personne à qui le demander. Ici si, et
// c'est même le cas le plus fréquent après le bouche-à-oreille. Ce champ
// existait dans l'ancien sous-onglet « Prospect partenaire », retiré de
// l'écran dans la refonte du 23/09/2026 ; il revient avec sa colonne
// (migration `20260923180000_rgd_demandes_apporteur`).
//
// ⚠ LES MÊMES INFORMATIONS, PAS LE MÊME FORMULAIRE. Première version refusée
// le 23/09/2026 : j'avais recopié le site à l'identique, ses deux étapes, son
// vouvoiement, « Vous êtes », « Le projet concerne ». Or ce sont deux gestes
// qui n'ont rien à voir. Le site parle à un inconnu qu'il faut mettre en
// confiance et qui ne reviendra pas s'il se lasse : il découpe, il explique,
// il ménage. Ici c'est quelqu'un de la maison qui note pendant un appel, avec
// la personne au bout du fil : il lui faut TOUT SOUS LES YEUX D'UN COUP, pour
// remplir dans l'ordre où ça vient et non dans l'ordre qu'on lui impose. Un
// écran, deux colonnes, aucun bouton « Continuer ».
//
// Ce qui est repris du site, ce sont les CHAMPS et les VALEURS de leurs
// listes — là, à la lettre. Une demande saisie et une demande reçue doivent se
// comparer ; « Maison » d'un côté et « Une maison » de l'autre feraient deux
// populations qu'aucun décompte ne réunit.
//
// ⚠ ELLE ÉCRIT DANS `rgd_demandes`, PAS DANS `rgd_clients`, et ce n'est pas un
// détail d'implémentation. `rgd_demandes` est la table du formulaire : elle a
// déjà `type_demandeur`, `type_projet`, `type_intervention`, `superficie`,
// `types_travaux`, `budget`, `comment_connu`, `recommandation`. Les écrire
// dans `rgd_clients` demanderait huit colonnes nouvelles qui doubleraient
// celles-ci — deux endroits pour la même information, et la certitude qu'ils
// divergeront.
//
// ⚠ `source: 'manuel'` ET NON `formulaire_site`. La fiche n'est pas venue du
// site, et le dire fausserait la seule mesure qui compte sur les campagnes :
// combien de demandes le site rapporte. C'est aussi ce qui la fait tomber sur
// la provenance « Direct » quand la personne ne dit pas comment elle nous a
// connus.
//
// ⚠ AUCUN `required` DANS LE GABARIT, et c'est voulu. Le formulaire tient en
// deux écrans dont un est caché : un champ `required` dans une section
// `hidden` bloque l'envoi SANS RIEN AFFICHER — le navigateur refuse de donner
// le focus à un champ invisible et se contente d'un avertissement en console.
// La validation est donc faite à la main, écran par écran.
import { db } from '../data/db.js';
import { openModal, closeModal, toast, esc } from '../ui.js';

// Les libellés viennent du formulaire du site, mot pour mot. Les reformuler
// donnerait deux vocabulaires pour une même question, et le jour où on
// comparera les réponses, personne ne saura si « Maison » et « Une maison »
// sont la même chose.
const DEMANDEUR = ['Propriétaire', 'Futur acquéreur', 'Je me renseigne'];
const BIEN = ['Un appartement', 'Une maison', 'Un immeuble'];
const RESIDENCE = ['Une résidence principale', 'Une résidence secondaire',
  'Un investissement locatif'];
const TRAVAUX = ['Électricité', 'Maçonnerie', 'Isolation', 'Peinture',
  'Plomberie', 'Terrassement', 'Menuiserie PVC'];
const BUDGETS = ['Moins de 20 000€', '20 000€ - 35 000€', '35 000€ - 50 000€',
  '50 000€ - 80 000€', '80 000€ - 120 000€', 'Plus de 120 000€'];
const CONNU = ['Recommandation', 'Recherche Google', 'Réseaux sociaux',
  'Publicité (flyer, affichage, panneaux...)', 'Chantier vu sur place',
  'BNI ou réseau professionnel'];

// ⚠ EN SVG, PAS EN ÉMOJI. Un émoji change de dessin et de couleur selon le
// système : deux postes n'afficheraient pas le même formulaire, et aucun ne
// prendrait la teinte qu'on lui demande. Ceux-ci héritent de celle du rond
// qui les porte.
const ICONES = {
  prospect: 'M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7.5a6 6 0 0 1 12 0',
  projet: 'M3 17h14M5 17V9l5-4 5 4v8M8 17v-4h4v4',
};
const titre = (cle, texte) => `<h3><span class="ndf-rond">
  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="${ICONES[cle]}"/></svg>
</span>${esc(texte)}</h3>`;

const champ = (cle, libelle, dedans, { large = false } = {}) =>
  `<div class="ndf-champ ${large ? 'est-large' : ''}" data-champ="${cle}">
     <label for="ndf-${cle}">${esc(libelle)}</label>${dedans}
   </div>`;

const texte = (cle, libelle, opts = {}) => champ(cle, libelle,
  `<input id="ndf-${cle}" name="${cle}" type="${opts.type || 'text'}"
     ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}
     ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ''}>`, opts);

const liste = (cle, libelle, options, opts = {}) => champ(cle, libelle,
  `<select id="ndf-${cle}" name="${cle}">
     <option value="">—</option>
     ${options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
   </select>`, opts);

// Le même, mais dont les valeurs sont des identifiants et non le texte
// affiché. Une liste déroulante d'apporteurs ne peut pas enregistrer un nom :
// deux partenaires peuvent s'appeler pareil, et un nom qui change casserait
// le lien — c'est l'`id` qui part en base.
const listeRef = (cle, libelle, couples, opts = {}) => champ(cle, libelle,
  `<select id="ndf-${cle}" name="${cle}">
     <option value="">—</option>
     ${couples.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}
   </select>`, opts);

// Les cases à cocher et les boutons radio deviennent des PUCES : le vrai champ
// reste dans le gabarit (il fait le travail, et le clavier le voit), c'est son
// étiquette qui se dessine. Sept cases à cocher alignées se lisent mal ; sept
// puces se lisent d'un coup et se cliquent au doigt.
const puces = (cle, libelle, options, type) => champ(cle, libelle,
  `<div class="ndf-puces">${options.map((o, i) => `
     <label class="ndf-puce">
       <input type="${type}" name="${cle}" id="ndf-${cle}-${i}" value="${esc(o)}">
       <span>${esc(o)}</span>
     </label>`).join('')}</div>`, { large: true });

// Un champ vide ne part pas : écrire une chaîne vide là où `null` a du sens
// remplit la base de blancs qu'on ne distingue plus d'une valeur saisie.
const vide = (o) => Object.fromEntries(
  Object.entries(o).filter(([, v]) => v !== '' && v != null));

export function formulaireDemande(apporteurs, apresEnregistrement) {
  // On montre la société quand elle existe, sinon la personne : c'est sous ce
  // nom-là qu'un partenaire se désigne au téléphone.
  const choixApporteurs = (apporteurs || [])
    .map(a => [a.id, a.societe || a.raison_sociale
      || [a.prenom, a.nom].filter(Boolean).join(' ') || '(sans nom)'])
    .sort((x, y) => x[1].localeCompare(y[1], 'fr'));

  // ⚠ LA PERSONNE AVANT LE PROJET, et c'est l'inverse du site. Le site
  // commence par le projet parce qu'il doit accrocher avant d'oser demander
  // un numéro. Au téléphone, le nom et le numéro sont ce qui arrive en
  // premier, et ce sont eux qu'on perd si l'appel coupe.
  const m = openModal('Nouvelle demande', `<form id="ndf" class="ndf" novalidate>
    <div class="ndf-colonnes">
      <section class="ndf-bloc est-prospect">
        ${titre('prospect', 'Le prospect')}
        <div class="ndf-grille">
          ${texte('prenom', 'Prénom')}
          ${texte('nom', 'Nom')}
          ${texte('telephone', 'Téléphone', { type: 'tel', placeholder: '06 …' })}
          ${texte('email', 'E-mail', { type: 'email', placeholder: 'nom@exemple.fr' })}
          ${texte('adresse', 'Adresse', { large: true })}
          ${texte('code_postal', 'Code postal')}
          ${texte('ville', 'Ville')}
          ${liste('type_demandeur', 'Type de demandeur', DEMANDEUR)}
          ${liste('comment_connu', 'Connu via', CONNU)}
          <!-- ⚠ L'APPORTEUR PASSE DEVANT LE « CONNU VIA » DANS LA DECISION DE
               PROVENANCE : un nom coche ici est un fait, « Recommandation »
               dans la liste d'a cote est une categorie. -->
          ${listeRef('apporteur_id', 'Apporté par', choixApporteurs, { large: true })}
          <!-- Ce champ ne sert que si la reponse precedente est une
               recommandation ; le reste du temps il encombre. -->
          <div class="ndf-champ est-large" data-champ="recommandation" hidden>
            <label for="ndf-recommandation">Recommandé par</label>
            <input id="ndf-recommandation" name="recommandation" type="text"
              placeholder="Nom de la personne ou du partenaire">
          </div>
          <!-- ⚠ CE COMMENTAIRE-LA PARLE DE LA PERSONNE, pas du projet : ce
               qu'on retient d'elle, son humeur, l'heure a laquelle la
               rappeler. Le projet a deja le sien, juste en face. Il part dans
               commentaire_admin, la meme colonne que lit la fiche. Et SURTOUT
               PAS d'accent grave dans ce commentaire : il refermerait le
               gabarit. Refait le coup le 23/09/2026 — node --check passe et
               l'ecran reste sur « Chargement ». -->
          ${champ('commentaire_admin', 'Commentaire',
            `<textarea id="ndf-commentaire_admin" name="commentaire_admin" rows="3"
               placeholder="Ce qu'il faut savoir sur elle : disponibilités, ton de l'échange, à rappeler quand…"></textarea>`,
            { large: true })}
        </div>
      </section>

      <section class="ndf-bloc est-projet">
        ${titre('projet', 'Le projet')}
        <div class="ndf-grille">
          ${liste('type_projet', 'Type de bien', BIEN)}
          ${liste('type_intervention', 'Usage du bien', RESIDENCE)}
          ${texte('superficie', 'Superficie', { type: 'number', inputmode: 'numeric', placeholder: 'm²' })}
          ${puces('types_travaux', 'Types de travaux', TRAVAUX, 'checkbox')}
          ${puces('budget', 'Budget annoncé', BUDGETS, 'radio')}
          ${champ('projet_description', 'Ce que la personne demande',
            `<textarea id="ndf-projet_description" name="projet_description" rows="4"
               placeholder="Noté pendant l'appel : ce qu'elle veut faire, ses délais, ce qui l'inquiète…"></textarea>`,
            { large: true })}
        </div>
      </section>
    </div>

    <div class="ndf-pied">
      <span class="ndf-note">Créée <b>dans le CRM</b> : elle apparaît tout de suite,
        et aucune synchronisation ne l’écrasera.</span>
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn" id="ndf-creer">Créer la demande</button>
    </div>
  </form>`, { wide: true });

  const form = m.querySelector('#ndf');
  const creer = form.querySelector('#ndf-creer');

  // Signaler un manque là où il est, pas dans un message en bas : une liste
  // d'erreurs oblige à chercher le champ dont elle parle.
  const exige = (cles) => {
    let premier = null;
    form.querySelectorAll('.ndf-champ').forEach(c => c.classList.remove('est-manquant'));
    for (const cle of cles) {
      const v = String(form.querySelector(`[name="${cle}"]:checked`)?.value
        ?? form.querySelector(`[name="${cle}"]`)?.value ?? '').trim();
      if (v) continue;
      const bloc = form.querySelector(`[data-champ="${cle}"]`);
      bloc?.classList.add('est-manquant');
      premier = premier || bloc;
    }
    premier?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return !premier;
  };

  // La recommandation ne se demande qu'apres la reponse qui l'appelle.
  const connu = form.querySelector('[name="comment_connu"]');
  const blocReco = form.querySelector('[data-champ="recommandation"]');
  connu.onchange = () => {
    blocReco.hidden = !/recommand/i.test(connu.value);
    if (blocReco.hidden) blocReco.querySelector('input').value = '';
  };

  // Le compte des travaux cochés, à côté de son intitulé : sept puces cochées
  // au hasard se recomptent sinon à l'oeil.
  const blocTravaux = form.querySelector('[data-champ="types_travaux"]');
  const etiquette = blocTravaux.querySelector('label');
  const socle = etiquette.textContent;
  blocTravaux.addEventListener('change', () => {
    const n = blocTravaux.querySelectorAll('input:checked').length;
    etiquette.textContent = n ? `${socle} · ${n} sélectionné${n > 1 ? 's' : ''}` : socle;
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    // ⚠ UN GROUPE DE BOUTONS RADIO NE SE LIT PAS COMME UN CHAMP. `querySelector`
    // rend le PREMIER bouton du groupe, et `.value` rend SA valeur à lui, pas
    // celle qui est cochée : le budget partait toujours à « Moins de 20 000 € »
    // quelle que soit la puce choisie. Attrapé en relisant la ligne écrite,
    // pas à l'écran — la puce cochée s'affichait bien.
    const lire = (cle) => {
      const premier = form.querySelector(`[name="${cle}"]`);
      const el = premier?.type === 'radio'
        ? form.querySelector(`[name="${cle}"]:checked`) : premier;
      return String(el?.value || '').trim();
    };
    // ⚠ LE NOM ET UN MOYEN DE RAPPEL, RIEN DE PLUS. Le site exige onze champs
    // parce qu'il parle à un inconnu qu'il ne pourra pas relancer. Ici c'est
    // quelqu'un de la maison qui saisit, souvent pendant l'appel : refuser la
    // fiche faute de superficie perdrait le prospect pour de bon. Le nom seul
    // ne suffit pas non plus — une fiche qu'on ne peut pas rappeler n'est pas
    // un prospect, c'est une ligne.
    if (!exige(['nom'])) return toast('Le nom est obligatoire', 'warn');
    const email = lire('email');
    const tel = lire('telephone');
    if (!email && !tel) {
      exige(['email', 'telephone']);
      return toast('Un e-mail ou un téléphone, au moins : sans quoi la demande ne se rappelle pas', 'warn');
    }

    // ⚠ LES TRAVAUX SE RANGENT EN TEXTE SÉPARÉ PAR DES VIRGULES, comme les
    // lignes écrites par l'Edge Function `formulaire-site`. Les anciennes
    // lignes venues de D1 portent un tableau JSON — deux formes cohabitent
    // déjà dans la colonne, et on écrit celle du chemin vivant.
    const travaux = [...form.querySelectorAll('[name="types_travaux"]:checked')]
      .map(i => i.value).join(', ');

    creer.disabled = true; creer.textContent = 'Création…';
    try {
      // 1. Le contact. `activities: ['rgd']` est ce qui le rend visible aux
      //    comptes RGD : sans lui, la fiche serait créée et invisible.
      const contact = await db.insert('contacts', vide({
        first_name: lire('prenom'), last_name: lire('nom'),
        email, phone: tel,
        address: lire('adresse'), postal_code: lire('code_postal'), city: lire('ville'),
        type: 'Prospect', channel: 'Saisie manuelle', activities: ['rgd'],
      }));

      // 2. La demande. Pas de `d1_id` : elle naît ici, le relevé Cloudflare ne
      //    la verra jamais et ne pourra donc jamais l'écraser.
      await db.insert('rgd_demandes', vide({
        contact_id: contact.id,
        date_demande: new Date().toISOString(),
        source: 'manuel', statut: 'nouveau_prospect',
        // `rgd_demandes` porte l'identité EN DOUBLE du contact : c'est une
        // table en forme de D1, et la liste lit ses colonnes à elle. Ne pas
        // les remplir donnerait une ligne sans nom à l'écran.
        nom: lire('nom'), prenom: lire('prenom'), email, telephone: tel,
        adresse: lire('adresse'), code_postal: lire('code_postal'), ville: lire('ville'),
        type_demandeur: lire('type_demandeur'), type_projet: lire('type_projet'),
        type_intervention: lire('type_intervention'), superficie: lire('superficie'),
        types_travaux: travaux, budget: lire('budget'),
        projet_description: lire('projet_description'),
        comment_connu: lire('comment_connu'), recommandation: lire('recommandation'),
        apporteur_id: lire('apporteur_id') || null,
        commentaire_admin: lire('commentaire_admin'),
      }));

      closeModal();
      toast('Demande créée');
      apresEnregistrement?.();
    } catch (err) {
      creer.disabled = false; creer.textContent = 'Créer la demande';
      toast(`Création impossible : ${String(err.message || err).slice(0, 120)}`, 'warn');
    }
  };

  form.querySelector('[name="prenom"]').focus();
}
