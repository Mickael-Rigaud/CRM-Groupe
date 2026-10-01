// La fiche d'un contact RGD Renova
//
// CE QU'ELLE REPREND DE BTP EXPERTISE, ET CE QU'ELLE LAISSE
// La fiche d'affaire de BTP sert de modèle pour ce qu'elle CONTIENT — état,
// frise d'étapes, informations, historique — et non pour sa mise en page.
// Deux choses n'y sont pas, et leur absence est un choix :
//
//   « Gagnée » / « Perdue » — chez BTP, gagner est un GESTE indépendant de
//   l'étape. Ici l'étape vient du statut, et « perdu » est une étape comme une
//   autre : deux boutons qui écriraient la même chose que la frise se
//   contrediraient tôt ou tard.
//
//   Les documents — ils appartiennent aux affaires du CRM, pas aux fiches
//   relevées de Cloudflare, qui n'en ont pas.
//
// ⚠ « MODIFIER » OUVRE LA FICHE PROJET DANS SA PROPRE FENÊTRE (01/10/2026,
// demandé par Mickael : « quand on modifie la fiche du projet je voudrais que
// ce soit le formulaire de la fiche projet qui s'ouvre, ce sera plus clair
// visuellement »). Le matin même, le formulaire était rendu DANS la colonne de
// gauche, en remplacement des deux blocs d'information : il y tenait, mesuré
// jusqu'à 340 px, mais il y tenait à l'étroit — la semaine de créneaux et les
// deux colonnes du commentaire et du rappel sont dessinées pour la largeur
// d'une modale, pas pour une demi-fiche.
//
// ⚠ CE QUI RENDAIT LE RENDU EN PLACE NÉCESSAIRE EST LEVÉ, PAS OUBLIÉ.
// `openModal` ferme la fenêtre courante avant d'ouvrir la suivante, donc un
// formulaire par-dessus la fiche la faisait disparaître et « Annuler »
// n'avait nulle part où revenir. La réponse est que la fiche se RECONSTRUIT :
// `dessine()` la rouvre, et elle est de toute façon reconstruite à chaque
// enregistrement. Deux détails qui tiennent le tout :
//   · `closeModal(true)` — la fermeture pour remplacement — N'APPELLE PAS
//     `onClose` : ouvrir le formulaire ne déclenche donc pas le `onChange`
//     de la fiche, et `dessine()` depuis le formulaire ne redessine pas deux
//     fois ;
//   · le formulaire porte `onClose: dessine`, donc la croix et le clic sur le
//     fond ramènent à la fiche au lieu de tout fermer — c'est ce que fait
//     « Annuler », par le même chemin.
//
// ⚠ IL N'Y A PLUS D'ÉTAT À GARDER ICI. L'étape du formulaire vivait dans la
// fiche parce que celle-ci se redessinait par-dessous (attribution, changement
// d'étape) et remontait un formulaire neuf. La fiche n'est plus là pendant la
// saisie : le formulaire garde son étape tout seul, et repart du « Projet » à
// chaque ouverture. La frise n'a plus besoin d'être gelée non plus.
//
// L'en-tête annonçait ici que l'espace RGD était en lecture seule et qu'un
// formulaire serait écrasé au relevé suivant. C'était exact, et c'est
// précisément pour ça que le formulaire écrit À LA SOURCE et non dans le
// reflet — la phrase décrivait le piège, pas une interdiction.
//
// ⚠ L'HISTORIQUE S'ATTACHE AU CONTACT, PAS À UNE AFFAIRE — et c'est ce qui a
// permis de le faire sans migration. `events` porte déjà `contact_id` et
// `organisation_id`, tous deux facultatifs. La policy `events_insert` est en
// `with check (true)`, donc rien à changer côté droits.
//
// ⚠ CHAQUE CHANGEMENT D'ÉTAPE S'INSCRIT, avec sa date et son auteur, APRÈS
// l'écriture du statut : une trace de ce qui n'a pas eu lieu est pire que pas
// de trace.
//
// ⚠ NE JAMAIS METTRE D'ACCENT GRAVE DANS UN COMMENTAIRE HTML D'UN GABARIT :
// il referme le gabarit. `node --check` passe, et l'écran reste sur
// « Chargement… » — attrapé le 23/09/2026, en chargeant la page.
//
// LA MISE EN PAGE, REFAITE LE 23/09/2026
// La première version était « trop simple, mal organisée, très fade » : des
// cartes blanches sur fond blanc, des intitulés gris en majuscules, aucun
// repère pour l'oeil. Trois choses la corrigent, par ordre d'importance :
//
//   1. UN EN-TÊTE QUI PORTE LES CHIFFRES. Montant, devis, chantiers,
//      ancienneté — ce qu'on veut savoir avant de lire quoi que ce soit, sur
//      le fond de la marque, pour que l'oeil sache où commencer.
//   2. LA FRISE EN BARRE DE PROGRESSION, et non en rangée de boutons : une
//      barre se lit d'un coup, sept boutons se lisent un par un.
//   3. DES REPÈRES AU LIEU D'INTITULÉS GRIS. Une pastille ronde colorée
//      devant chaque information remplace « TÉLÉPHONE » en petites capitales :
//      on reconnaît une forme plus vite qu'on ne lit un mot.
import { db } from '../data/db.js';
import { esc, eur, fmtDate, fmtDateTime, openModal, closeModal, toast, userName,
         daysSince } from '../ui.js';
import { ETAPES_RGD, ORDRE_ETAPES, STATUT_DE_L_ETAPE, ecrireStatut,
         montantDevisDe, etapeAvecMontant, COL_RELANCE, derniereRelance,
         aujourdhui } from '../data/rgd-etapes.js';
import { scope } from '../data/scope.js';
import { refusDeProjet, valeursProjet, valeursSuivi } from '../data/rgd-projet.js';
import { ficheProjetRgd } from './rgd-projet.js';
import { listeTravaux } from '../data/rgd-formulaire.js';
import { rendezVousDeLaFiche, coordonneesDuRendezVous } from '../data/rgd-rdv.js';
import { attribuerFicheRgd, proprietaireDeLaFiche } from './rgd-attribuer.js';

const ETAT_CHANTIER = {
  demarrage: { label: 'Préparé', ton: 'amber' },
  en_cours: { label: 'En cours', ton: 'green' },
  termine: { label: 'Terminé', ton: 'muted' },
};
const STATUT_DEVIS = {
  signe: { label: 'Signé', ton: 'green' },
  refuse: { label: 'Refusé', ton: 'red' },
  expire: { label: 'Expiré', ton: 'muted' },
  brouillon: { label: 'Brouillon', ton: 'amber' },
};
const dit = (table, cle, defaut) => table[cle] || { label: cle || defaut, ton: 'muted' };
const nomEtape = (cle) => ETAPES_RGD.find(e => e.key === cle)?.label || cle;

// Les initiales, pour la pastille de l'en-tête. Deux lettres au plus : trois
// sur un nom composé donnent une bouillie illisible dans un cercle.
export const initiales = (nom) => String(nom || '?').trim().split(/\s+/)
  .filter(m => /[a-zà-ÿ]/i.test(m)).slice(0, 2).map(m => m[0].toUpperCase()).join('') || '?';

const siens = (liste, f) => liste.filter(x =>
  (!!x.contact_id && x.contact_id === f.contact_id)
  || (!!x.organisation_id && x.organisation_id === f.organisation_id));

// ⚠ LES PICTOGRAMMES SONT EN SVG, PAS EN ÉMOJI. Un émoji change de dessin et
// de couleur selon le système : deux postes n'afficheraient pas la même fiche,
// et aucun ne prendrait la couleur qu'on lui demande. Ceux-ci héritent de la
// couleur du texte qui les porte.
const ICONES = {
  tel: 'M4 3h3l1.5 4-2 1.5a12 12 0 0 0 5 5L13 11l4 1.5V16a1 1 0 0 1-1.1 1A14 14 0 0 1 3 4.1 1 1 0 0 1 4 3Z',
  mail: 'M2 5h16v10H2V5Zm0 0 8 6 8-6',
  lieu: 'M10 2a5.5 5.5 0 0 1 5.5 5.5C15.5 12 10 18 10 18S4.5 12 4.5 7.5A5.5 5.5 0 0 1 10 2Zm0 3.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z',
  travaux: 'M3 17h14M5 17V9l5-4 5 4v8M8 17v-4h4v4',
  euro: 'M13 5.5A5 5 0 0 0 5.5 10 5 5 0 0 0 13 14.5M3.5 8.5h6M3.5 11.5h6',
  source: 'M10 2.5 12.4 7l5 .7-3.6 3.5.9 5-4.7-2.5L5.3 16l.9-5L2.6 7.7l5-.7L10 2.5Z',
  personne: 'M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7.5a6 6 0 0 1 12 0',
  maison: 'M2.5 9 10 3l7.5 6M4.5 8v9h11V8M8.5 17v-5h3v5',
  regle: 'M2.5 12.5 12.5 2.5l5 5-10 10-5-5Zm3 3 1.5-1.5m1 4 1.5-1.5m1 4 1.5-1.5',
  texte: 'M4 4h12M4 8h12M4 12h8M4 16h5',
};
const pict = (cle) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${ICONES[cle]}"/></svg>`;

// ⚠ `tuile` ET `info` SONT SORTIS DE `dessine()` POUR ÊTRE PARTÂGÉS avec la
// fiche partenaire (25/09/2026). Ils ne fermaient sur rien ; les recopier
// là-bas aurait fabriqué deux présentations qui se ressemblent le premier jour
// et divergent au premier ajustement — et c'est précisément la couleur de ces
// blocs que Mickael est venu chercher.
export const tuile = (valeur, quoi) => `<div class="rgdf-tuile">
  <b>${esc(String(valeur))}</b><span>${esc(quoi)}</span></div>`;

// ⚠ UNE LIGNE VIDE NE S'AFFICHE PAS. Un tiret en face de six intitulés donne
// une fiche qui a l'air pleine et ne dit rien.
export const info = (icone, quoi, valeur, teinte) => valeur
  ? `<div class="rgdf-ligne ${teinte || ''}">
       <span class="rgdf-rond">${pict(icone)}</span>
       <div><span class="rgdf-quoi">${esc(quoi)}</span><div class="rgdf-valeur">${valeur}</div></div>
     </div>` : '';

// Les rendez-vous, en haut à droite de l'en-tête
//
// ⚠ EN HAUT À DROITE, ET PAS DANS LE CORPS (25/09/2026, demandé par Mickael).
// La date du rendez-vous est ce qu'on cherche en ouvrant la fiche de quelqu'un
// qu'on doit rappeler : elle se lit sans faire défiler, à côté du nom.
//
// ⚠ TOUS SONT LISTÉS, pas seulement le prochain — « si il y en a eu plusieurs
// je voudrais les retrouver ». Une personne revue deux fois a deux lignes, la
// plus récente en tête ; les rendez-vous PASSÉS sont grisés plutôt que cachés,
// parce que c'est précisément l'historique qu'on vient chercher.
//
// ⚠ UNE JOURNÉE ENTIÈRE N'A PAS D'HEURE, et en inventer une (00:00) ferait
// croire à un rendez-vous à minuit. `all_day` le dit, on affiche le jour seul.
//
// ⚠ « VOIR » MÈNE À L'AGENDA DU CRM, PAS À GOOGLE (25/09/2026, demandé par
// Mickael). Le lien ouvrait `agenda_events.link`, c'est-à-dire un autre outil
// dans un autre onglet, pour une information que l'écran Agenda affiche déjà —
// avec les autres rendez-vous du jour autour, ce que Google seul ne donne pas
// dans le contexte du dossier.
function blocRendezVous(rdvs) {
  if (!rdvs.length) return '';
  // Le jour vient de `aujourdhui()`, pas de `toISOString()`. Deux raisons : ce
  // dernier rend de l'UTC, donc avant 2 h du matin un rendez-vous du jour se
  // comparait a la veille ; et un `const aujourdhui` local masquait dans cette
  // fonction la fonction importee du meme nom — deux choses homonymes de types
  // differents dans un fichier, c'est le genre d'ecart qui se paie plus tard.
  const lignes = rdvs.map((e) => {
    const passe = String(e.day || '') < aujourdhui();
    const quand = e.all_day || !e.starts_at
      ? fmtDate(e.day)
      : fmtDateTime(e.starts_at);
    return `<li class="${passe ? 'est-passe' : ''}">
      <b>${esc(quand)}</b>
      ${e.day ? `<a href="#/rgd/agenda?jour=${esc(e.day)}">Voir</a>` : ''}
    </li>`;
  }).join('');
  return `<div class="rgdf-rdv">
    <span class="rgdf-rdv-titre">${rdvs.length > 1 ? `Rendez-vous <b>${rdvs.length}</b>` : 'Rendez-vous'}</span>
    <ul>${lignes}</ul>
  </div>`;
}

export function ouvrirFicheRgd(x, onChange) {
  let etapeCourante = x.etape;
  const f = x.ligne;

  const clefs = { contact_id: f.contact_id || null, organisation_id: f.organisation_id || null };
  const aUneAncre = !!(clefs.contact_id || clefs.organisation_id);

  const historique = () => db.t('events')
    .filter(e => (clefs.contact_id && e.contact_id === clefs.contact_id)
      || (clefs.organisation_id && e.organisation_id === clefs.organisation_id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const inscrire = (kind, body) => aUneAncre
    ? db.insert('events', { ...clefs, deal_id: null, kind, body, author_id: scope.user?.id || null })
    : Promise.resolve();

  // ------------------------------------------------------- les relances
  // ⚠ L'ENCADRÉ « RELANCES » A QUITTÉ LA FICHE LE 01/10/2026, demandé par
  // Mickael — et les trois dates se CORRIGENT MAINTENANT DANS LA FICHE PROJET,
  // à l'étape « Le prospect ». Les retirer sans les remettre ailleurs aurait
  // fermé le seul chemin qui rattrape une R1 jamais datée : le tableau ne
  // propose que la relance EN COURS, les deux autres s'y lisent sans se
  // modifier. Ici il ne reste qu'une ligne, en lecture, dans le récapitulatif.
  //
  // ⚠ LA PORTE D'ÉCRITURE RESTE `majDateRelance`, où qu'on la pousse : la date
  // se pose toute seule dans `ecrireStatut`, le tableau en corrige une, le
  // formulaire les trois. Trois écrans, une seule fonction — cet écran s'était
  // déjà fabriqué un second chemin pour le statut, et les deux ont vécu
  // séparément trois jours.
  const relancesDites = () => {
    const posees = COL_RELANCE
      .map((c, i) => (f[c] ? `R${i + 1} ${fmtDate(f[c])}` : null)).filter(Boolean);
    if (!posees.length) return '';
    const d = derniereRelance(f);
    const depuis = !d ? '' : d.jours <= 0 ? "aujourd’hui"
      : d.jours < 0 ? `dans ${-d.jours} j` : `il y a ${d.jours} j`;
    return `${esc(posees.join(' · '))}${depuis ? ` <span class="muted">· ${esc(depuis)}</span>` : ''}`;
  };

  // ⚠ LES RAPPELS SONT UNE ÉCRITURE DU FORMULAIRE, DONC ILS SE LISENT ICI
  // (01/10/2026 : « je veux bien évidemment toutes les infos qui ont été
  // enregistrées dans le formulaire »). Ils vivent dans `activities`, la vraie
  // to-do du CRM — c'est là qu'on les coche, et la fiche ne fait que les
  // montrer. Sans cette liste, poser un rappel depuis la fiche ne laissait
  // aucune trace sur la fiche elle-même.
  const rappelsOuverts = () => {
    if (!aUneAncre) return [];
    return (scope.rgd('activities') || [])
      .filter(a => !a.done && a.due_date
        && ((clefs.contact_id && a.contact_id === clefs.contact_id)
          || (clefs.organisation_id && a.organisation_id === clefs.organisation_id)))
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  };

  const blocRappels = () => {
    const liste = rappelsOuverts();
    if (!liste.length) return '';
    return `<section class="rgdf-bloc rgdf-rappels">
      <h3>Rappels <span class="rgdf-compte">${liste.length}</span></h3>
      <ul>${liste.slice(0, 6).map(a => `<li>
        <span class="rgdf-quand">${esc(fmtDate(a.due_date))}${a.due_time ? ` à ${esc(a.due_time)}` : ''}</span>
        <span class="rgdf-dit">${esc(a.title || 'Rappel')}</span>
      </li>`).join('')}</ul>
      <p class="rgdf-source">Ils se cochent dans la to-do du CRM.</p>
    </section>`;
  };

  const dessine = () => {
    const devis = x.genre === 'fiche' ? siens(scope.rgd('rgd_devis'), f) : [];
    const chantiers = x.genre === 'fiche'
      ? siens(scope.rgd('rgd_chantiers'), f).filter(c => c.etat || c.date_debut_prevue)
      : [];
    const i = ORDRE_ETAPES.indexOf(etapeCourante);
    const perdu = etapeCourante === 'archives';
    // Qui porte la fiche, et qui a le droit de le changer. Seules les fiches
    // du portefeuille RGD — une demande du site, un client — se confient ; les
    // autres écrans qui ouvrent cette même fiche n'ont pas de propriétaire à
    // montrer, d'où le test sur la cible plutôt qu'un `scope.isDirection` seul.
    const responsable = proprietaireDeLaFiche(f);
    const peutAttribuer = scope.isDirection
      && (x.cible === 'demande' || x.cible === 'client');
    const evs = historique();
    // ⚠ LE RENDEZ-VOUS GOOGLE PORTE CE QUE PERSONNE N'A RESAISI. Sa description
    // contient le téléphone et le détail du projet, tels que Mickael les a notés
    // en prenant l'appel. Jusqu'ici ça vivait dans l'agenda et nulle part
    // ailleurs : la fiche ouvrait sur une personne dont on ne savait rien.
    //
    // ⚠ LE NUMÉRO VA DANS LE CHAMP TÉLÉPHONE, LE RESTE DANS LE COMMENTAIRE,
    // et il n'y a PAS de bloc à part (demandé le 24/09/2026 : « je veux pas que
    // tu recrées un encadré »). Un encadré de plus obligeait à lire la fiche à
    // deux endroits pour connaître un numéro, alors que la ligne qui l'attend
    // était juste au-dessus, vide.
    // ⚠ AVANT « DEVIS EN COURS », NI DEVIS NI CHANTIER À L'ÉCRAN (25/09/2026,
    // demandé par Mickael). Sur un prospect qu'on vient d'appeler, ces deux
    // encadrés ne portaient que des lignes venues de Costructor sans rapport
    // avec l'affaire en cours — d'anciens chantiers de la même personne — et
    // ils poussaient le projet sous la ligne de flottaison. Les compteurs des
    // tuiles suivent le même seuil : compter ce qu'on ne montre pas invite à
    // chercher une liste qui n'est pas là.
    const auDevis = i >= ORDRE_ETAPES.indexOf('devis_encours');
    const rdvs = rendezVousDeLaFiche(f, chantiers, scope.rgd('agenda_events'), x.nom);
    const rdv = rdvs[0] || null;
    // ⚠ LA DESCRIPTION LUE EST CELLE DU PLUS RÉCENT, pas la concaténation des
    // trois : ce sont des notes d'appel, pas un journal, et les empiler
    // ferait remonter un téléphone périmé avant le bon.
    const duRdv = coordonneesDuRendezVous(rdv?.description, x.nom);

    // ⚠ LA MENTION « SAISI DANS L'APPLICATION RGD » NE VAUT QUE POUR LES
    // LIGNES RELEVÉES. Une demande créée ici porte le commentaire noté pendant
    // l'appel, dans la même colonne : renvoyer vers l'application RGD pour le
    // corriger enverrait chercher une fiche qui n'y existe pas. On reconnaît
    // les deux à `d1_id` — nul, la ligne est née dans le CRM.
    // ⚠ LA NOTE AUTOMATIQUE N'EST PAS UN COMMENTAIRE. « Créé automatiquement
    // depuis Google Agenda le … » est déjà dit en toutes lettres dans le bloc
    // du projet : la répéter sous le titre « Commentaire » ferait passer pour un
    // mot de Mickael une phrase écrite par un robot.
    const noteBrute = (x.genre === 'demande' ? f.commentaire_admin : f.notes) || '';
    const noteEcrite = /^\s*Créé automatiquement depuis Google Agenda/i.test(noteBrute)
      ? '' : noteBrute;
    const commentaireSource = [duRdv.commentaire, noteEcrite].filter(Boolean).join('\n\n');
    const jours = x.recu ? daysSince(x.recu) : null;
    // ⚠ TROIS SOURCES POUR LE BUDGET, ET L'ORDRE EST CELUI DE LA CERTITUDE.
    // `budget_travaux` est le budget SAISI dans le CRM : il n'existe que sur une
    // fiche `rgd_clients`, et c'est le seul des trois qu'on puisse renseigner
    // soi-même. Il passe donc avant `x.budget`, qui vient du formulaire Meta ou
    // du site — une déclaration de la personne, pas une estimation faite après
    // l'avoir eue au téléphone.
    const budgetSaisi = Number(f.budget_travaux) > 0 ? eur(Number(f.budget_travaux)) : '';
    const budgetTuile = valeursProjet(x).budget_annonce || budgetSaisi
      || String(x.budget || '').trim() || '—';

    // ⚠ À PARTIR DE « DEVIS EN COURS », LE MONTANT HT REMPLACE LE BUDGET ANNONCÉ.
    // Arbitré par Mickael le 25/09/2026 après avoir vu les deux côte à côte :
    // deux chiffres d'argent voisins se confondent au premier coup d'oeil, et
    // dès qu'un devis existe c'est lui qu'on vient lire, pas ce que la personne
    // annonçait au téléphone.
    //
    // ⚠ LE SEUIL EST CELUI DU TABLEAU DE `#/rgd/clients`, et il a été aligné
    // dessus le même jour : la tuile basculait à « Devis accepté » quand la
    // colonne commençait à « Devis en cours », donc le même dossier affichait
    // son montant dans la liste et son budget dans la fiche. `etapeAvecMontant`
    // décide pour les deux.
    //
    // ⚠ IL DIT « — » quand l'étape y est sans qu'aucun devis ne soit relevé :
    // ne rien savoir et valoir zéro ne sont pas la même chose.
    const surMontant = etapeAvecMontant(etapeCourante);
    const montantEtape = montantDevisDe(f, devis, etapeCourante);

    // ⚠ LES RÉPONSES PASSENT PAR `valeursProjet` ET `valeursSuivi`, les mêmes
    // traductions que le formulaire. Deux lectures séparées auraient fini par
    // ne plus dire la même chose, et l'écart ne se serait vu que sur un genre
    // de fiche — une demande ou un client, jamais les deux.
    //
    // ⚠ TROIS DES CINQ CHAMPS DE SUIVI N'EXISTENT QUE SUR UNE DEMANDE : une
    // fiche `rgd_clients` n'a pas de colonne pour le type de demandeur, le
    // « connu via » ni la recommandation. `valeursSuivi` rend alors des chaînes
    // vides, et `info()` n'affiche pas une ligne vide — la fiche ne montre donc
    // que ce qu'elle a. Elle lisait `f` directement jusqu'ici, ce qui faisait
    // une seconde traduction à tenir.
    const proj = valeursProjet(x);
    const suivi = valeursSuivi(x);
    // Le bien : « Une maison · Une résidence principale » du formulaire, ou le
    // `meta_type_bien` d'un lead Meta, qui répond dans son propre vocabulaire.
    const bien = [proj.type_projet, proj.type_intervention].filter(Boolean).join(' · ')
      || f.meta_type_bien || '';
    const travaux = listeTravaux(proj.types_travaux)
      .map(t => `<span class="chip">${esc(t)}</span>`).join(' ');
    // ⚠ LE BUDGET A TROIS SOURCES ET L'ORDRE EST CELUI DE LA CERTITUDE : la
    // tranche choisie ici, puis le montant chiffré de l'application RGD, puis ce
    // que la personne avait répondu à Facebook ou au site. Le premier est le
    // seul qu'on puisse corriger soi-même, il passe donc devant.
    const budgetDit = proj.budget_annonce || budgetSaisi || String(x.budget || '').trim();

    // ⚠ L'ADRESSE DU CHANTIER EST EN TROIS COLONNES DEPUIS LE 01/10/2026, et la
    // fiche n'en montrait que la première : un chantier saisi « 9 rue des
    // Lilas / 95100 / Argenteuil » s'affichait « 9 rue des Lilas », sans la
    // commune — c'est-à-dire sans ce qui dit où l'on va.
    const unLieu = (rue, cp, ville) =>
      [rue, [cp, ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const chantierDit = unLieu(proj.adresse_chantier, proj.code_postal_chantier,
      proj.ville_chantier);
    // `adresseDe` rend « — » quand elle n'a rien : laissé tel quel, `info()` le
    // prend pour une valeur et affiche une ligne « Adresse : — », exactement ce
    // qu'elle est faite pour éviter.
    const adresseLue = x.adresse && x.adresse !== '—' ? x.adresse : (x.ville || '');

    // ⚠ NE PAS REPETER LE MEME MOT DEUX FOIS. La provenance est DEDUITE du
    // « comment nous avez-vous connus », donc quand la personne a repondu
    // « Recommandation » les deux valeurs sont le meme mot — la ligne
    // affichait « Recommandation · Recommandation · par Mme Perrot ».
    // L'apporteur : le partenaire qui a envoyé la personne. Il vit sur les deux
    // tables — `rgd_clients` depuis l'origine, `rgd_demandes` depuis la
    // migration `20260923180000`.
    const apporteur = f.apporteur_id
      ? scope.rgd('rgd_apporteurs').find(a => a.id === f.apporteur_id) : null;
    const nomApporteur = apporteur
      ? (apporteur.societe || apporteur.raison_sociale
         || [apporteur.prenom, apporteur.nom].filter(Boolean).join(' ') || '')
      : '';

    // ⚠ NÉE D'UN RENDEZ-VOUS, ET ÇA NE SE LIT NULLE PART AUTREMENT.
    // La provenance reste « Direct » — c'est exact, personne n'a apporté ce
    // prospect. Mais savoir que la fiche existe parce qu'un « Visite technique »
    // a été posé dans l'agenda change la façon de la lire : rien n'a été saisi
    // à la main, et le nom vient du titre de l'événement, pas d'un formulaire.
    //
    // L'information vivait dans le commentaire, noyée au milieu de ce que
    // l'utilisateur y écrit lui-même. Elle a sa place ici.
    const neeDuCalendrier = f.source === 'google_calendar';
    // La date se lit dans la note que le worker dépose — la seule trace
    // datée dont on dispose ; la fiche elle-même n'a pas de date de création.
    const dateDeCreation = neeDuCalendrier
      ? (String(f.notes || '').match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null
      : null;

    const provenance = (() => {
      const deduite = x.provenanceLabel || x.provenance;
      const dite = String(suivi.comment_connu || '').trim();
      const memeMot = dite.toLowerCase() === String(deduite).toLowerCase();
      // ⚠ QUAND IL Y A UN APPORTEUR, IL A SA PROPRE LIGNE juste au-dessus :
      // remettre son nom ici ferait lire deux fois la même chose.
      return [deduite, memeMot ? '' : dite,
        !nomApporteur && suivi.recommandation ? `par ${suivi.recommandation}` : '']
        .filter(Boolean).join(' · ');
    })();


    const html = `
      <div class="rgdf-hero">
        <div class="rgdf-hero-haut">
          <div class="rgdf-avatar">${esc(initiales(x.nom))}</div>
          <div class="rgdf-identite">
            <h2>${esc(x.nom || '(sans nom)')}</h2>
            <div class="rgdf-meta">
              <span class="rgdf-tag">${esc(x.provenanceLabel || x.provenance)}</span>
              <span class="rgdf-tag ${perdu ? 'est-perdu' : 'est-etape'}">${esc(perdu ? 'Perdu' : nomEtape(etapeCourante))}</span>
              ${x.recu ? `<span class="rgdf-tag">Reçu le ${esc(fmtDate(x.recu))}</span>` : ''}
              <!-- Qui porte la fiche. « À attribuer » plutôt qu'un tiret : un
                   tiret ne dit pas qu'il y a quelque chose à faire — c'est la
                   même règle que SANS_RESPONSABLE sur les cartes du pipeline.
                   (Pas d'accent grave ici : dans un commentaire HTML posé au
                   milieu d'un gabarit, il FERME le gabarit, sans un mot.) -->
              ${responsable
                ? `<span class="rgdf-tag">${esc(responsable.full_name)}</span>`
                : '<span class="rgdf-tag est-perdu">À attribuer</span>'}
            </div>
          </div>
          ${blocRendezVous(rdvs)}
        </div>
        ${refusDeProjet(x)
          ? `<p class="rgdf-origine" title="${esc(refusDeProjet(x))}">Lecture seule</p>`
          : '<button type="button" class="btn ghost sm rgdf-modifier" id="rgdf-modifier">Modifier les informations</button>'}
        <!-- Attribuer ne dépend pas de refusDeProjet : une fiche en lecture
             seule (un reflet de l'application RGD) se confie tout de même, car
             c'est le CRM qui décide qui la porte, pas le relevé. -->
        ${peutAttribuer
          ? `<button type="button" class="btn ghost sm rgdf-attribuer" id="rgdf-attribuer">${responsable ? 'Changer de responsable' : 'Attribuer à quelqu\'un'}</button>`
          : ''}
        <div class="rgdf-tuiles">
          ${surMontant
            ? tuile(montantEtape > 0 ? eur(montantEtape) : '—', 'Montant HT')
            : tuile(budgetTuile, 'Budget annoncé')}
          ${auDevis ? tuile(devis.length, 'Devis') : ''}
          ${auDevis ? tuile(chantiers.length, chantiers.length > 1 ? 'Chantiers' : 'Chantier') : ''}
          ${tuile(jours == null ? '—' : (jours <= 0 ? "Aujourd'hui" : jours + ' j'), 'Dans la base')}
        </div>
      </div>

      <!-- La frise est le seul levier : cliquer une etape ecrit le statut.
           Pas de bouton « enregistrer », il laisserait croire qu'on peut
           changer d'avis alors que l'ecriture part a la source aussitot. -->
      <div class="rgdf-piste ${perdu ? 'est-perdu' : ''}">
        <div class="rgdf-jalons">
          <div class="rgdf-rail"><span style="width:${i <= 0 ? 0
            : Math.round((i / (ORDRE_ETAPES.length - 1)) * 100)}%"></span></div>
          ${ETAPES_RGD.filter(e => e.key !== 'archives').map((e, n) => `
            <button data-etape="${e.key}" title="${esc(e.titre)}"
              class="${e.key === etapeCourante ? 'cur' : (i >= 0 && n < i) ? 'past' : ''}">
              <i></i><span>${esc(e.label)}</span>
            </button>`).join('')}
        </div>
        <button data-etape="archives" class="rgdf-bouton-perdu ${perdu ? 'cur' : ''}"
          title="Perdu ou mis de côté">Perdu</button>
      </div>

      <div class="rgdf-corps">
        <div class="rgdf-colonne">
          <!-- ⚠ LE RÉCAPITULATIF DOIT MONTRER TOUT CE QUE LE FORMULAIRE
               ENREGISTRE (01/10/2026, demande du jour). Trois manques
               trouvés en le relisant champ par champ contre
               enregistrerProjet : le code postal et la ville du chantier,
               qui venaient d'etre separes le matin meme ; les relances,
               dont l'encadre partait ; et les rappels, que le formulaire
               pose dans la to-do sans que la fiche en dise rien. -->
          <section class="rgdf-bloc">
            <h3>Le prospect</h3>
            ${(() => { const t = x.tel || duRdv.telephone;
              return info('tel', 'Téléphone', t ? `<a href="tel:${esc(t)}">${esc(t)}</a>` : '', 'est-vert'); })()}
            ${info('mail', 'Email', x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : '', 'est-bleu')}
            ${info('lieu', 'Adresse', esc(adresseLue), 'est-gris')}
            ${info('personne', 'Type de demandeur', esc(suivi.type_demandeur || ''), 'est-gris')}
            ${info('personne', 'Nature', esc(x.type || ''), 'est-gris')}
            ${info('tel', 'Relances', relancesDites(), 'est-gris')}
            ${!x.tel && !duRdv.telephone && !x.email ? '<p class="rgdf-rien">Aucun moyen de contact renseigné.</p>' : ''}
          </section>

          <section class="rgdf-bloc">
            <h3>Le projet</h3>
            ${info('travaux', 'Types de travaux', travaux, 'est-orange')}
            ${info('euro', 'Budget annoncé', esc(budgetDit), 'est-orange')}
            ${info('maison', 'Le bien', esc(bien), 'est-bleu')}
            ${info('lieu', 'Adresse du chantier', esc(chantierDit), 'est-bleu')}
            ${info('regle', 'Superficie', proj.superficie ? esc(proj.superficie) + ' m²' : '', 'est-bleu')}
            ${info('texte', 'Détails du projet', esc(proj.projet_description), 'est-gris')}
            ${info('personne', 'Apporté par', esc(nomApporteur), 'est-vert')}
            ${info('source', 'Provenance', esc(provenance), 'est-violet')}
            ${neeDuCalendrier ? `<p class="rgdf-origine">
              <b>Cette fiche a été créée depuis Google Agenda</b>${dateDeCreation ? `, le ${fmtDate(dateDeCreation)}` : ''} —
              un rendez-vous « Visite technique » l'a fait naître, avec son chantier.
            </p>` : ''}
            ${!travaux && !budgetDit && !bien && !chantierDit
              && !proj.superficie && !proj.projet_description
              ? '<p class="rgdf-rien">Le projet n’a pas encore été décrit.</p>' : ''}
          </section>

          ${auDevis && devis.length ? `<section class="rgdf-bloc">
            <h3>Devis <span class="rgdf-compte">${devis.length}</span></h3>
            <div class="rgdf-tableau"><table><tbody>
              ${devis.map(v => { const e = dit(STATUT_DEVIS, v.statut, 'En cours');
                return `<tr>
                  <td><b>${esc(v.numero || '—')}</b>
                      <div class="s muted">${esc(v.objet || '—')}${v.date_creation ? ' · ' + esc(fmtDate(v.date_creation)) : ''}</div></td>
                  <td class="num">${eur(v.montant_ht)}</td>
                  <td class="rgdf-fin"><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}
            </tbody></table></div>
          </section>` : ''}

          ${auDevis && chantiers.length ? `<section class="rgdf-bloc">
            <h3>Chantiers <span class="rgdf-compte">${chantiers.length}</span></h3>
            <div class="rgdf-tableau"><table><tbody>
              ${chantiers.map(c => { const e = dit(ETAT_CHANTIER, c.etat, 'Inconnu');
                return `<tr>
                  <td><b>${esc(c.reference || c.description || '—')}</b>
                      <div class="s muted">${c.date_debut_prevue ? esc(fmtDate(c.date_debut_prevue)) : '—'}${
                        c.date_fin_prevue ? ' → ' + esc(fmtDate(c.date_fin_prevue)) : ''}${
                        c.ville ? ' · ' + esc(c.ville) : ''}</div></td>
                  <td class="rgdf-fin"><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}
            </tbody></table></div>
          </section>` : ''}

          ${devis.length || chantiers.length ? `<p class="rgdf-source">Devis et chantiers viennent de
            Costructor, relevés toutes les 30 minutes. Ils se modifient dans
            l’application RGD.</p>` : ''}
        </div>

        <div class="rgdf-colonne">
          ${commentaireSource ? `<section class="rgdf-bloc rgdf-commentaire">
            <h3>Commentaire</h3>
            <p class="rgdf-texte">${esc(commentaireSource)}</p>
            ${duRdv.commentaire ? `<p class="rgdf-source">Noté dans le rendez-vous
              « ${esc(rdv?.title || '')} »${rdv?.day ? ' du ' + esc(fmtDate(rdv.day)) : ''} —
              il se corrige dans Google Agenda.</p>`
              : f.d1_id != null ? `<p class="rgdf-source">Saisi dans l’application RGD,
              qui en reste la source.</p>` : ''}
          </section>` : ''}

          ${blocRappels()}

          <section class="rgdf-bloc rgdf-suivi">
            <h3>Historique <span class="rgdf-compte">${evs.length}</span></h3>
            ${aUneAncre ? `
              <form id="rgdf-note" class="rgdf-ajout">
                <input name="body" required placeholder="Noter un appel, un échange, une décision…">
                <button class="btn sm" type="submit">Ajouter</button>
              </form>` : '<p class="rgdf-rien">Cette ligne n’est rattachée à aucun contact : l’historique ne peut pas s’y accrocher.</p>'}
            <ol class="rgdf-fil">
              ${evs.length ? evs.map(e => `
                <li class="${e.kind === 'stage' ? 'est-etape' : ''}">
                  <div class="rgdf-quand">${esc(fmtDateTime(e.created_at))} · ${esc(userName(e.author_id))}</div>
                  <div class="rgdf-dit">${esc(e.body)}</div>
                </li>`).join('')
                : '<li class="rgdf-vide">Rien d’enregistré pour l’instant.</li>'}
            </ol>
          </section>
        </div>
      </div>`;

    const m = openModal('', html, { wide: true, onClose: () => onChange?.() });
    m.classList.add('rgdf');

    // ⚠ LE FORMULAIRE S'OUVRE DANS SA PROPRE FENÊTRE, ET LA FICHE SE
    // RECONSTRUIT DERRIÈRE : voir l'en-tête du fichier. `onClose` ramène à la
    // fiche quand on referme par la croix ou par le fond — sans lui, les deux
    // gestes qu'on fait sans y penser feraient disparaître la fiche aussi.
    const bModifier = m.querySelector('#rgdf-modifier');
    if (bModifier) bModifier.onclick = () => {
      const w = openModal(x.nom ? `Fiche projet — ${x.nom}` : 'Fiche projet',
        '<div id="rgp-hote"></div>', { wide: true, onClose: () => dessine() });
      ficheProjetRgd({
        dans: w.querySelector('#rgp-hote'), cible: x,
        propose: { telephone: duRdv.telephone },
        annuler: () => closeModal(),
        apres: async () => {
          // ⚠ L'HISTORIQUE DIT QU'ON A TOUCHÉ, PAS CE QU'ON A ÉCRIT. Recopier
          // les valeurs y mettrait des téléphones et des adresses, dans un fil
          // que tout l'espace RGD peut lire — et la fiche les montre déjà.
          await inscrire('note', 'Informations de la fiche modifiées');
          toast('Informations enregistrées');
          // ⚠ `dessine()` ET PAS `closeModal()` : `openModal` ferme pour
          // REMPLACEMENT, ce qui n'appelle pas `onClose` — la fiche ne se
          // redessine donc qu'une fois. Fermer d'abord la tirerait deux fois.
          dessine();
          onChange?.();
        },
      });
    };

    const bAttribuer = m.querySelector('#rgdf-attribuer');
    // `dessine()` après coup, et pas seulement `onChange` : la fiche reste
    // ouverte devant la personne, il faut qu'elle voie le nouveau nom.
    if (bAttribuer) bAttribuer.onclick = () => attribuerFicheRgd(x, () => { dessine(); onChange?.(); }, dessine);

    m.querySelectorAll('[data-etape]').forEach(b => b.onclick = async () => {
      const vers = b.dataset.etape;
      if (vers === etapeCourante) return;
      // « Nouvelle demande » n'a pas de statut unique — cinq y mènent. On pose
      // « contacté » : y revenir est une décision, et `nouveau_prospect`
      // signifie « personne n'a rien dit ».
      const statut = vers === 'demande' ? 'a_contacter' : STATUT_DE_L_ETAPE[vers];
      m.querySelectorAll('[data-etape]').forEach(o => { o.disabled = true; });
      const avant = etapeCourante;
      const r = await ecrireStatut({ uuid: f.id, cible: x.cible, statut });
      if (r.ok) {
        etapeCourante = vers;
        x.etape = vers;
        await inscrire('stage', `Étape : ${nomEtape(avant)} → ${nomEtape(vers)}`);
        toast('Étape mise à jour');
        dessine();
        onChange?.();
      } else {
        m.querySelectorAll('[data-etape]').forEach(o => { o.disabled = false; });
        toast(`Étape non enregistrée — ${r.motif}`, 'err');
      }
    });

    const form = m.querySelector('#rgdf-note');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const champ = form.elements.body;
      const texte = champ.value.trim();
      if (!texte) return;
      champ.disabled = true;
      try {
        await inscrire('note', texte);
        champ.value = '';
        dessine();
      } catch (err) {
        toast(String(err.message || err).slice(0, 90), 'err');
      } finally {
        champ.disabled = false;
      }
    };
  };

  dessine();
}
