// La fiche projet de BTP Expertise — un seul formulaire pour tout l'écran.
//
// ⚠ ELLE REMPLACE LES DEUX FICHES DÉCOUVERTE ET LE FORMULAIRE D'AFFAIRE.
// Avant le 25/09/2026 il y en avait trois : « Fiche découverte — Expertise »,
// « Fiche découverte — AMO », et le formulaire générique d'affaire. Les trois
// écrivaient dans la même table, avec trois présentations, trois vocabulaires
// et trois ensembles de champs — et seul le formulaire générique savait
// MODIFIER. Une mission créée par une fiche découverte se corrigeait donc dans
// un écran qui ne montrait ni sa cotation, ni son taux, ni ses honoraires.
//
// ⚠ LE MÉTIER SE CHOISIT DANS LE FORMULAIRE, à l'étape « Mission », et il
// commande les deux dernières étapes : la grille de qualification de
// l'expertise ou la matrice de complexité de l'AMO. C'est le même parcours,
// avec les outils du métier qu'on a désigné.
//
// ⚠ LES MATRICES SONT CELLES DES ÉCRANS EXPERTISE ET AMO, importées et non
// recopiées : `QUALIF_EXPERTISE`, `CRITERES_V5`, `tauxSuggere`,
// `honorairesAmo`. Une règle du manuel qui bouge doit bouger d'un seul endroit.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, toast, openModal, closeModal, contactName } from '../ui.js';
import {
  CHANNELS, NIVEAUX_BTP, QUALIF_EXPERTISE,
  FICHE_EXPERTISE, FICHE_AMO, CRITERES_V5, coteBudget, coteDuree, coteLots,
  tauxSuggere, honorairesAmo, niveauSuggere, controleTaux, cleNiveau,
  tarifExpertise, TVA_TAUX, couleurMission, stagesDe,
  espacesDuBien, resumeEspaces, GRAVITES, nombreLu,
  MOIS, anneesApparition, litApparition,
} from '../data/schema.js';
import { champsHonoraires, resultatsHonoraires } from './btp-amo.js';
import { planSvg, DESSINES } from '../data/btp-plan.js';
import { DOC_CATEGORIES, docsOf } from '../documents.js';

const KEY = 'btp';
const CANAUX_COURANTS = ['Recommandation client', 'Ancien client', 'Téléphone / autre', 'Site internet direct', 'Prospection directe'];
const TYPES_BIEN = ['Maison', 'Appartement', 'Immeuble', 'Local pro', 'Autre'];
// ⚠ L'ORDRE DE L'OFFRE, PAS CELUI DE LA CHARGE. La prestation se choisit
// maintenant à la première étape, dans la liste telle que le client la voit :
// pré-achat, désordres, réception. `niveauxExpertiseParCharge()` existe pour la
// grille de qualification, qui ne vit plus dans ce formulaire.
const NIVEAUX_EXP = NIVEAUX_BTP.filter(n => n.mission === 'expertise');
const NIVEAUX_AMO = NIVEAUX_BTP.filter(n => n.mission === 'amo');

// L'étape qui DIT que le livrable est parti, par métier. Elle sert à dater le
// rapport sans le ressaisir : si l'affaire est passée par là, la date est celle
// du passage.
const ETAPE_LIVRABLE = { expertise: 'rapport_remis', amo: 'amo_reception' };

export function ficheProjet(existing = null, presets = {}, apres = null, onClose = null) {
  // ⚠ Seuls les membres de BTP Expertise portent une mission BTP. Le porteur
  // actuel est rajouté s'il n'en est plus : sans ça, corriger une adresse le
  // retirerait de l'affaire au passage.
  const users = scope.users().filter(u => (u.activities || []).includes(KEY));
  if (existing?.owner_id && !users.some(u => u.id === existing.owner_id)) {
    const p = db.byId('profiles', existing.owner_id); if (p) users.push(p);
  }

  const f = { ...(existing?.fields || {}), ...(presets.fields || {}) };
  const d = f.decouverte || {};
  const contact = existing?.contact_id ? db.byId('contacts', existing.contact_id)
    : presets.contact_id ? db.byId('contacts', presets.contact_id) : null;
  const mission0 = f.type_mission === 'amo' ? 'amo' : 'expertise';
  const etapesDe = (m) => stagesDe(KEY, m);

  // ⚠ LA DATE DE VISITE VIENT DE GOOGLE AGENDA. `agenda_events` est le reflet
  // du calendrier ; le rapprochement se fait par le NOM du client, faute
  // d'identifiant d'affaire côté Google. Le champ reste saisissable : l'agenda
  // peut n'avoir rien à dire, et une visite se cale parfois avant d'être posée.
  const rdvAgenda = () => {
    const nom = contact ? contactName(contact) : '';
    const cherche = String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (cherche.length < 3) return null;
    return db.t('agenda_events')
      .filter(e => e.activity === KEY && e.title
        && String(e.title).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(cherche))
      .sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')))[0] || null;
  };
  const agenda = rdvAgenda();

  // La date du livrable, lue dans l'historique des étapes.
  const dateLivrable = (m) => {
    const cle = ETAPE_LIVRABLE[m];
    const passage = (existing?.stage_history || []).find(h => h.stage === cle);
    return passage ? String(passage.at).slice(0, 10) : '';
  };

  const v = {
    pas: 1,
    mission: mission0,
    contact_id: contact?.id || '',
    nom: contact?.last_name || d.client || '',
    prenom: contact?.first_name || '',
    telephone: contact?.phone || d.telephone || '',
    email: contact?.email || d.email || '',
    cl_adresse: contact?.address || '',
    cl_cp: contact?.postal_code || '',
    cl_ville: contact?.city || '',
    profil: d.profil || f.contexte || '',
    canal: existing?.channel || presets.channel || 'Recommandation client',

    type_bien: f.type_bien || '',
    annee: d.annee || '', surface: d.surface || '', pieces: d.pieces || '',
    occupation: d.occupation || '',
    adresse: f.adresse || '', code_postal: f.code_postal || '', ville: f.ville || '',
    date_visite: f.date_visite || agenda?.day || '',
    date_rapport: f.date_rapport || dateLivrable(mission0),

    // expertise
    motifs: d.motifs || (f.problematique ? String(f.problematique).split(', ') : []),
    description: d.description || f.detail || '',
    apparition: d.apparition || '', evolution: d.evolution || '',
    // ⚠ « Sinistre déclaré » EST PASSÉ DE TEXTE LIBRE À Oui/Non (30/09/2026),
    // et « procédure » de texte libre à une liste de cases. Les valeurs déjà
    // saisies ne rentrent dans ni l'un ni l'autre : elles restent dans `v` et
    // l'écran les MONTRE sous le champ. Les convertir au jugé réécrirait ce que
    // quelqu'un a constaté au téléphone.
    sinistre: ['Oui', 'Non'].includes(d.sinistre) ? d.sinistre : '',
    sinistre_libre: ['Oui', 'Non'].includes(d.sinistre) ? '' : (d.sinistre || ''),
    sinistre_aupres: d.sinistre_aupres || '',
    procedure: Array.isArray(d.procedure) ? d.procedure
      : (FICHE_EXPERTISE.procedures.includes(d.procedure) ? [d.procedure] : []),
    procedure_libre: Array.isArray(d.procedure) || FICHE_EXPERTISE.procedures.includes(d.procedure)
      ? '' : (d.procedure || ''),
    butoir: d.butoir || '', securite: d.securite || '',
    documents: d.documents || [], controles: d.controles || [],
    // ⚠ LE SCHÉMA REPREND LES MOTIFS DÉJÀ ENREGISTRÉS PLUTÔT QUE DE LES
    // JETER (29/09/2026). Avant lui, les désordres étaient une liste à plat sur
    // l'affaire, sans endroit ; repartir d'un schéma vierge aurait effacé en
    // silence ce qui avait été saisi sur toutes les missions en cours. Ils
    // atterrissent dans un espace « Non localisé », qui DIT que l'information
    // manque au lieu de l'inventer à un endroit plausible.
    espaces: d.espaces || null,
    espaceOuvert: null,
    // ⚠ LES FICHIERS ATTENDENT L'ENREGISTREMENT, TOUJOURS, même sur une affaire
    // qui existe déjà. Les téléverser au dépôt donnerait deux comportements
    // selon qu'on crée ou qu'on modifie, et laisserait des fichiers rattachés à
    // une affaire qu'on finit par annuler. Une affaire neuve n'a de toute façon
    // pas encore d'identifiant auquel les rattacher.
    fichiers: [],
    cotes: d.cotesBrutes || {},
    niveau: cleNiveau(f.niveau) || null,
    tarif: existing?.amount ?? '',

    // AMO
    travaux: d.travaux || [], budget_ht: f.montant_travaux ?? d.budget_ht ?? '',
    budget_max: d.budget_max || '', date_debut: d.date_debut || '', date_fin: d.date_fin || '',
    avancement: d.avancement || [], besoins: d.besoins || [], risques: d.risques || [],
    cotesAmo: d.cotesAmo || { budget: null, lots: null, duree: null, intensite: null, contraintes: null },
    taux_final: f.taux_amo ?? null, motif: d.motif || '',

    stage: existing?.stage || etapesDe(mission0)[0].key,
    owner_id: existing?.owner_id || presets.owner_id || scope.user.id,
  };

  const teinte = () => { const C = couleurMission(v.mission); return `--m:${C.couleur};--m-clair:${C.clair};--m-encre:${C.encre}`; };

  const m = openModal(existing ? 'Fiche projet' : 'Nouvelle fiche projet', '<div id="fp-corps"></div>', { wide: true, onClose });
  const corps = m.querySelector('#fp-corps');

  // ---------------------------------------------------------------- le calcul
  // ⚠ PLUS DE NIVEAU DEVINÉ : la prestation est CHOISIE à l'étape Mission
  // (29/09/2026). La grille de qualification proposait un niveau à partir de
  // six critères de complexité ; elle répondait à « quelle lourdeur » quand la
  // vraie question est « quelle prestation ». Elle reste consultable sur
  // l'écran Expertise, où elle est à sa place.
  const niveauExp = () => NIVEAUX_EXP.find(n => n.key === cleNiveau(v.niveau)) || null;

  const autoAmo = {
    budget: () => coteBudget(v.budget_ht),
    lots: () => coteLots(v.travaux.length),
    duree: () => coteDuree(v.date_debut, v.date_fin),
    intensite: () => null, contraintes: () => null,
  };
  const coteAmo = (cle) => (v.cotesAmo[cle] ?? autoAmo[cle]());
  const scoreAmo = () => CRITERES_V5.reduce((t, c) => t + (coteAmo(c.key) ?? 0), 0);
  const cotesFaitesAmo = () => CRITERES_V5.filter(c => coteAmo(c.key) !== null).length;
  const tauxSug = () => tauxSuggere(scoreAmo()).taux;
  const tauxRetenu = () => (v.taux_final ?? tauxSug());
  // ⚠ PAS DE NIVEAU PAR DEFAUT SUR UN FORMULAIRE VIERGE : sans cotation, le
  // niveau suggere serait le plus leger, affiche comme retenu et ENREGISTRE
  // comme tel. Un niveau que personne n'a choisi vaut moins que pas de niveau.
  const niveauAmo = () => NIVEAUX_AMO.find(n => n.key === v.niveau)
    || (cotesFaitesAmo() ? niveauSuggere(scoreAmo()) : null);
  const niveauRetenu = () => (v.mission === 'amo' ? niveauAmo() : niveauExp());
  // ⚠ `honorairesAmo` rend { ht, tva, ttc } : c'est `ht` qu'on garde, parce que
  // `amount` d'une affaire BTP est un montant HT (voir `amountLabel`). Ecrire
  // `.honoraires` — qui n'existe pas — posait `undefined` sans rien casser :
  // l'affaire s'enregistrait, simplement sans montant.
  // ⚠ LE MONTANT SAISI L'EMPORTE SUR LA GRILLE, jamais l'inverse : la grille
  // propose, l'humain tranche. Laissé vide, on retient le HT qui découle du
  // tarif de la prestation — sinon une expertise partirait sans montant alors
  // que son prix est affiché juste au-dessus.
  const montant = () => {
    if (v.mission === 'amo') return honorairesAmo(v.budget_ht, tauxRetenu()).ht || null;
    const saisi = Number(v.tarif);
    if (saisi) return saisi;
    return tarifExpertise({ prestation: v.niveau, surface: v.surface, pieces: v.pieces })?.ht || null;
  };

  const nomComplet = () => [v.prenom, v.nom].filter(Boolean).join(' ').trim();

  // ------------------------------------------------------------- les briques
  // ⚠ L'ORDRE A CHANGÉ LE 29/09/2026, demandé pour l'expertise :
  // Mission → Le désordre & tarif → Identification. On qualifie d'abord, on
  // prend les coordonnées à la fin.
  //
  // ⚠ MISSION EST FORCÉMENT LA PREMIÈRE ÉTAPE, ET CE N'EST PAS UN CHOIX DE
  // PRÉSENTATION : c'est là qu'on choisit le métier, et le métier commande la
  // suite du parcours. Mettre l'identification devant obligerait à afficher un
  // premier écran avant de savoir lequel des deux déroulés on suit.
  //
  // ⚠ L'AMO SUIT LE MÊME MOUVEMENT, par conséquence : son identification passe
  // en dernier elle aussi. Mickael n'a parlé que de l'expertise, mais laisser
  // l'identification en tête côté AMO aurait demandé deux premiers écrans
  // différents pour un choix qui n'est pas encore fait.
  //
  // ⚠ ON RAISONNE EN NOMS D'ÉCRAN, PLUS EN NUMÉROS : le numéro 3 désigne
  // l'identification en expertise et la cotation en AMO. Un `v.pas === 3` dans
  // `lier()` aurait branché les champs du mauvais écran.
  const ECRANS = () => (v.mission === 'amo'
    ? ['mission', 'amo-fond', 'amo-cote', 'identification']
    : ['mission', 'desordre', 'identification']);
  const TITRES = {
    mission: 'Mission',
    desordre: 'Le désordre & tarif',
    'amo-fond': 'Travaux et besoin',
    'amo-cote': 'Complexité et honoraires',
    identification: 'Identification',
  };
  const nomEcran = () => ECRANS()[v.pas - 1] || 'mission';
  const PAS = () => ECRANS().map((n, i) => [TITRES[n], i + 1]);

  const enTete = () => `
    <div class="mf-pas" style="${teinte()}">
      ${PAS().map(([lbl, n]) => `
        <div class="mf-pas-item ${v.pas === n ? 'on' : ''} ${v.pas > n ? 'fait' : ''}" data-pas="${n}">
          <span class="mf-pas-num">${v.pas > n ? '✓' : n}</span>${esc(lbl)}
        </div>`).join('<i class="mf-pas-lien"></i>')}
    </div>`;

  const chips = (cle, liste) => `<div class="fa-chips" data-chips="${cle}">${liste.map(x => `
    <button type="button" class="fa-chip ${v[cle].includes(x) ? 'on' : ''}" data-val="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  // ⚠ `horsListe` FAIT SURVIVRE UNE VALEUR QUE LA LISTE NE PROPOSE PLUS, et le
  // cas est réel : deux affaires portent « Particulier », venu du formulaire
  // générique d'avant la fiche projet, qui n'a jamais figuré dans les profils.
  // Sans ce rattrapage, aucune pastille n'est allumée en rouvrant la fiche — on
  // croit le champ vide, et le premier enregistrement le rend vrai. Elle est
  // ajoutée en bout de liste, COCHÉE, en trait discontinu : même remède que les
  // budgets hors tranches de la fiche client RGD.
  const chipsUn = (cle, liste, horsListe = false) => {
    const valeur = v[cle];
    const tout = horsListe && valeur && !liste.includes(valeur) ? [...liste, valeur] : liste;
    return `<div class="fa-chips" data-chips-un="${cle}">${tout.map(x => `
      <button type="button" class="fa-chip ${valeur === x ? 'on' : ''}${liste.includes(x) ? '' : ' est-hors-liste'}"
        data-val="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  };
  const champ = (id, label, valeur, attrs = '', plein = false) =>
    `<label class="mail-champ ${plein ? 'plein' : ''}"><span>${esc(label)}</span><input id="${id}" value="${esc(valeur ?? '')}" ${attrs}></label>`;

  // ⚠ UNE ADRESSE TIENT SUR UNE SEULE LIGNE : rue, code postal, ville (demande
  // du 25/09/2026). `mf-adresse` donne à la rue la place de deux champs, pour
  // que le code postal n'ait pas la même largeur qu'une rue.
  const adresse = (prefixe, titre, rue, cp, ville) => `
    <div class="mf-adresse">
      ${champ(prefixe + '-rue', titre, rue, 'placeholder="14 avenue des Platanes"')}
      ${champ(prefixe + '-cp', 'Code postal', cp, 'placeholder="06000" inputmode="numeric"')}
      ${champ(prefixe + '-ville', 'Ville', ville, 'placeholder="Nice"')}
    </div>`;

  // ⚠ LES INTITULÉS DES BOUTONS VIENNENT DU PARCOURS, ils ne sont plus écrits
  // dans chaque écran : l'ordre change d'un métier à l'autre, et deux libellés
  // recopiés finissent par annoncer une étape qui n'est pas la suivante.
  const barre = () => {
    const liste = PAS();
    const i = v.pas - 1;
    const gauche = i > 0 ? liste[i - 1][0] : null;
    const droite = i < liste.length - 1 ? liste[i + 1][0] : null;
    return `
    <div class="form-actions">
      ${gauche ? `<button type="button" class="btn ghost left" id="fp-retour">← ${esc(gauche)}</button>` : ''}
      <button type="button" class="btn ghost" data-close>Annuler</button>
      ${existing ? '<button type="button" class="btn ghost" id="fp-enregistrer">Enregistrer</button>' : ''}
      ${droite
        ? `<button type="button" class="btn" id="fp-suite">${esc(droite)} →</button>`
        : `<button type="button" class="btn" id="fp-creer">${existing ? 'Enregistrer et fermer' : 'Créer la mission'}</button>`}
    </div>`;
  };

  // ------------------------------------------------------------ 1. la mission
  // ⚠ LE CHOIX SE FAIT EN DEUX TEMPS CÔTÉ EXPERTISE, EN UN SEUL CÔTÉ AMO
  // (29/09/2026). Le METIER se choisit ici pour les deux ; la PRESTATION ne se
  // choisit ici que pour l'expertise.
  //
  // ⚠ CE N'EST PAS UNE ASYMÉTRIE GRATUITE : les trois expertises sont des
  // missions de NATURE différente, que seul l'humain peut trancher et dont
  // dépend le tarif de l'écran suivant. Les trois niveaux d'AMO sont des
  // DEGRÉS DE CHARGE, et ils ont déjà leur place à l'étape « Complexité et
  // honoraires », où la matrice les propose à partir du budget, des lots et de
  // la durée. Les poser ici aussi aurait fait DEUX ENDROITS POUR UNE MÊME
  // DÉCISION, et le premier aurait fait choisir un degré de charge avant de
  // connaître ce qui le détermine.
  const PRESTATIONS = () => NIVEAUX_EXP;

  // ⚠ « RAPPORT ENVOYÉ LE » A QUITTÉ CET ÉCRAN LE 29/09/2026, ET LA DONNÉE
  // RESTE : `v.date_rapport` est toujours initialisé depuis `dateLivrable()` et
  // toujours enregistré dans `fields.date_rapport`. Le champ demandait, sur le
  // premier écran d'une mission qui commence, la date d'un livrable qui n'est
  // pas écrit — et il se remplit tout seul au passage à l'étape
  // (`ETAPE_LIVRABLE`), ce que son propre texte d'aide disait.
  // ⚠ NE PAS EN CONCLURE QUE `dateLivrable` OU `ETAPE_LIVRABLE` SONT MORTS :
  // les deux servent encore, à l'initialisation de `v` juste au-dessus.
  // ⚠ CONSÉQUENCE À CONNAÎTRE : la date ne se CORRIGE plus à la main nulle
  // part. Elle reste affichée sur la fiche d'affaire (`act.fields`, rubrique
  // « mission ») et se déduit de `stage_history` à chaque ouverture du
  // formulaire ; c'est le passage à l'étape qui la pose, pas une saisie.
  const ecranMission = () => {
    const etapes = etapesDe(v.mission);
    const choisi = cleNiveau(v.niveau);
    return `
    <div class="mf-bloc-titre">A. Type de mission</div>
    <div class="mf-seg mf-seg-large" style="${teinte()}">
      <button type="button" class="${v.mission === 'expertise' ? 'on' : ''}" data-metier="expertise">Expertise</button>
      <button type="button" class="${v.mission === 'amo' ? 'on' : ''}" data-metier="amo">AMO / accompagnement</button>
    </div>
    <p class="mf-aide">${v.mission === 'amo'
      ? 'Accompagnement du maître d’ouvrage : les honoraires sont un pourcentage des travaux, et le niveau de mission se définit à l’étape « Complexité et honoraires ».'
      : 'Expertise technique : le tarif part du plancher de la prestation choisie.'}</p>

    ${v.mission === 'amo' ? '' : `
      <div class="mf-sous-titre">Quelle expertise ?</div>
      <div class="mf-niveaux" style="${teinte()}">
        ${PRESTATIONS().map(n => `
          <button type="button" class="mf-niveau ${n.key === choisi ? 'on' : ''}" data-choix="${esc(n.key)}">
            <span class="mf-niveau-pts">${esc(n.tarif)}</span>
            <b>${esc(n.label)}</b>
            <span class="mf-niveau-txt">${esc(n.contenu)}</span>
          </button>`).join('')}
      </div>
      ${choisi ? '' : '<p class="mf-aide attention">Choisissez la prestation : c’est elle qui commande le tarif.</p>'}`}

    <div class="mf-bloc-titre">B. Le bien</div>
    <div class="mf-grille mf-grille-serree">
      <label class="mail-champ"><span>Type de bien</span>
        <select id="fp-type"><option value="">—</option>${TYPES_BIEN.map(t => `<option ${t === v.type_bien ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      ${champ('fp-annee', 'Année de construction', v.annee, 'placeholder="1972"')}
      ${champ('fp-surface', 'Surface approximative', v.surface, 'placeholder="95 m²"')}
      ${champ('fp-pieces', 'Nombre de pièces', v.pieces, 'placeholder="4" inputmode="numeric"')}
      <label class="mail-champ"><span>${v.mission === 'amo' ? 'Occupation pendant travaux' : 'Occupation actuelle'}</span>
        <select id="fp-occupation"><option value="">—</option>${(v.mission === 'amo' ? FICHE_AMO.occupation : FICHE_EXPERTISE.occupation)
          .map(o => `<option ${o === v.occupation ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
    </div>
    ${adresse('fp-bien', 'Adresse du bien', v.adresse, v.code_postal, v.ville)}

    <div class="mf-bloc-titre">C. Dates et suivi</div>
    <div class="mf-grille">
      <label class="mail-champ"><span>Date de visite</span>
        <input type="date" id="fp-visite" value="${esc(v.date_visite)}">
        ${agenda ? `<em class="mf-champ-aide">Google Agenda : ${esc(agenda.title)}${agenda.day ? ` le ${esc(agenda.day)}` : ''}</em>`
          : '<em class="mf-champ-aide">Aucun rendez-vous à ce nom dans l’agenda.</em>'}</label>
      <label class="mail-champ"><span>Où en est la mission ?</span>
        <select id="fp-stage">${etapes.map(e => `<option value="${e.key}" ${e.key === v.stage ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select></label>
      <label class="mail-champ"><span>Chargé d'affaires</span>
        <select id="fp-owner">${users.map(u => `<option value="${u.id}" ${u.id === v.owner_id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></label>
    </div>

    ${barre()}`;
  };

  // ------------------------------------------------------ le schéma du bien
  // ⚠ LES ESPACES SE FABRIQUENT AU RENDU, PAS À L'OUVERTURE : le nombre de
  // pièces se saisit à l'étape Mission, le schéma se lit à l'étape suivante.
  // Les figer à l'ouverture aurait montré le bien d'avant la saisie.
  //
  // ⚠ ON N'AJOUTE QUE, ON NE RETIRE JAMAIS CE QUI PORTE QUELQUE CHOSE. Passer
  // le bien de 5 à 3 pièces après avoir repéré un désordre dans la chambre 4
  // effacerait ce désordre sans un mot — et une faute de frappe dans un champ
  // numérique est vite arrivée. Un espace VIDE en trop disparaît, lui : il n'y
  // a rien à perdre, et laisser des chambres fantômes allonge le schéma.
  const espacesAJour = () => {
    const voulus = espacesDuBien({ pieces: v.pieces, type_bien: v.type_bien });
    if (!v.espaces) {
      v.espaces = voulus;
      // La reprise des anciennes saisies : voir le commentaire de `espaces`.
      if (v.motifs.length) {
        v.espaces.push({ nom: 'Non localisé', groupe: 'annexe', repris: true,
          desordres: [...v.motifs], gravite: '', note: '' });
      }
      return v.espaces;
    }
    const parNom = new Map(v.espaces.map(e => [e.nom, e]));
    const garde = e => e.desordres?.length || e.note?.trim() || e.ajoute || e.repris;
    const suite = voulus.map(e => parNom.get(e.nom) || e);
    v.espaces.forEach(e => { if (!suite.includes(e) && garde(e)) suite.push(e); });
    v.espaces = suite;
    return v.espaces;
  };

  // Les désordres de l'affaire sont l'UNION de ceux des espaces, jamais une
  // seconde liste. ⚠ `fields.problematique` en découle, et il est lu par la
  // recherche et par les mails types : deux listes auraient fini par ne plus
  // dire la même chose, et c'est celle-ci qui sort du CRM.
  const motifsDesEspaces = () => [...new Set((v.espaces || []).flatMap(e => e.desordres || []))];

  const compteEspaces = () => {
    const touches = (v.espaces || []).filter(e => e.desordres?.length);
    return { espaces: touches.length, desordres: touches.reduce((n, e) => n + e.desordres.length, 0) };
  };

  const carteEspace = (e, i) => {
    const n = e.desordres?.length || 0;
    return `<button type="button" class="fp-espace ${n ? 'a-desordre' : ''} ${v.espaceOuvert === i ? 'ouvert' : ''}"
      data-espace="${i}" aria-expanded="${v.espaceOuvert === i}">
      <span class="fp-espace-nom">${esc(e.nom)}</span>
      ${n ? `<span class="fp-espace-pastille">${n}</span>` : ''}
      ${n ? `<span class="fp-espace-liste">${esc(e.desordres.join(', '))}</span>` : ''}
      ${e.gravite ? `<span class="fp-espace-grav g-${esc(e.gravite.toLowerCase())}">${esc(e.gravite)}</span>` : ''}
    </button>`;
  };

  // ⚠ LE PANNEAU S'OUVRE DANS LA PAGE, JAMAIS EN MODALE : `openModal` ferme
  // celle qui est ouverte avant d'ouvrir la suivante, donc une fenêtre par
  // espace ferait disparaître le formulaire entier au premier clic. Le piège
  // est déjà écrit trois fois dans ce dépôt.
  const panneauEspace = () => {
    const i = v.espaceOuvert;
    const e = v.espaces[i];
    if (!e) return '';
    return `
    <div class="fp-panneau" style="${teinte()}">
      <div class="fp-panneau-tete">
        <b>${esc(e.nom)}</b>
        <button type="button" class="fp-panneau-x" data-fermer-espace aria-label="Fermer">×</button>
      </div>
      <div class="fa-chips" data-desordres="${i}">
        ${FICHE_EXPERTISE.motifs.map(m => `
          <button type="button" class="fa-chip ${e.desordres.includes(m) ? 'on' : ''}" data-val="${esc(m)}">${esc(m)}</button>`).join('')}
      </div>
      <div class="fp-panneau-bas">
        <div class="fa-chips" data-gravite="${i}">
          <span class="fp-panneau-lbl">Gravité</span>
          ${GRAVITES.map(g => `
            <button type="button" class="fa-chip ${e.gravite === g ? 'on' : ''}" data-val="${esc(g)}">${esc(g)}</button>`).join('')}
        </div>
        <label class="mail-champ plein"><span>Ce qu'on observe ici</span>
          <input id="fp-note-espace" value="${esc(e.note || '')}"
            placeholder="Fissure en escalier au-dessus de la fenêtre, 1,5 m"></label>
      </div>
    </div>`;
  };

  // ⚠ LE DESSIN NE PORTE QUE LES ESPACES QU'IL CONNAIT, et le reste tombe en
  // cartes sous lui. Un espace ajouté à la main ou repris d'une ancienne saisie
  // (« Non localisé ») n'a aucune place dans une coupe de maison : lui en
  // inventer une le poserait à un endroit que personne n'a dit.
  const blocPlan = () => {
    const espaces = espacesAJour();
    const c = compteEspaces();
    const dessines = DESSINES(v.type_bien);
    // ⚠ LES PRINCIPALES ET LES SERVICES SONT DESSINÉS PAR LEUR GROUPE, les
    // annexes par leur NOM : un filtre sur le seul nom aurait fait tomber TOUTES
    // les pièces dans « hors du schéma », c'est-à-dire le dessin vide et la
    // liste entière en dessous.
    const hors = espaces.map((e, i) => ({ e, i }))
      .filter(({ e }) => e.groupe === 'annexe' && !dessines.includes(e.nom));
    return `
    <div class="fp-plan-tete">
      <span>${v.pieces ? `${esc(v.pieces)} pièce${nombreLu(v.pieces) > 1 ? 's' : ''}` : 'Nombre de pièces non renseigné'}${
        v.surface ? ` · ${esc(v.surface)}` : ''} · ${esc(v.type_bien || 'type de bien non renseigné')}</span>
      <span class="fp-plan-compte">${c.desordres
        ? `${c.desordres} désordre${c.desordres > 1 ? 's' : ''} dans ${c.espaces} espace${c.espaces > 1 ? 's' : ''}`
        : 'Aucun désordre repéré'}</span>
    </div>
    <div class="fp-dessin" style="${teinte()}">${planSvg(espaces, v.type_bien)}</div>
    ${hors.length ? `
      <div class="fp-plan-groupe">Hors du schéma</div>
      <div class="fp-plan" style="${teinte()}">${hors.map(({ e, i }) => carteEspace(e, i)).join('')}</div>` : ''}
    <div class="fp-plan-pied">
      <button type="button" class="btn ghost" id="fp-ajout-espace">+ Ajouter un espace</button>
      <em class="mf-champ-aide">${v.pieces
        ? 'Schéma de repérage : il situe les désordres, il ne représente pas le plan du bien.'
        : 'Renseignez le nombre de pièces à l’étape Mission pour que les chambres apparaissent.'}</em>
    </div>
    ${v.espaceOuvert !== null ? panneauEspace() : ''}`;
  };

  // ------------------------------------------------ le dépôt de documents
  // ⚠ CE N'EST PAS `documentsSection()` DE `documents.js`, ET CE N'EST PAS UN
  // OUBLI. Ce module-là supprime un document derrière le `confirm()` de
  // `ui.js`, qui appelle `closeModal(true)` et REMPLACE la fenêtre courante :
  // le formulaire entier disparaîtrait, avec la saisie en cours. Le piège est
  // déjà écrit cinq fois dans ce dépôt. Ici on ne supprime rien : on RETIRE de
  // la liste d'attente, ce qui n'efface aucun fichier et ne demande donc aucune
  // confirmation. La suppression d'un document déjà rattaché reste sur la fiche
  // d'affaire, qui porte le vrai bloc Documents.
  const MAX_MO = 25;
  const poids = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

  // ⚠ UNE ZONE DE DÉPÔT PAR TYPE COCHÉ (30/09/2026, demandé : « je voudrais
  // vraiment une zone de dépôts pour les documents que l'on sélectionne juste
  // avant »). Première version : les puces déclaraient ce que le client A, et
  // une zone unique en dessous recevait les fichiers avec une liste déroulante
  // de catégorie. Cocher « Devis » ne permettait donc PAS de déposer le devis,
  // et il fallait rechoisir la catégorie à la main entre deux dépôts.
  //
  // ⚠ LA CATÉGORIE EST LE LIBELLÉ DE LA PUCE, pas une valeur de
  // `DOC_CATEGORIES` : « PV de réception » et « Constat commissaire de
  // justice » n'y existent pas, et `documents.category` est du texte libre.
  // Une table de correspondance entre les deux listes se périmerait au premier
  // ajout, et traduire « PV de réception » en « Autre » perdrait justement ce
  // que la personne venait de dire.
  //
  // ⚠ « AUTRES DOCUMENTS » EST TOUJOURS LÀ : sans elle, rien ne se dépose tant
  // qu'aucune puce n'est cochée, et un fichier qui n'entre dans aucun type
  // n'aurait nulle part où aller.
  const ZONES = () => [
    ...FICHE_EXPERTISE.documents.filter(d => v.documents.includes(d)).map(nom => ({ nom, cle: nom })),
    { nom: 'Autres documents', cle: '' },
  ];

  const ligneFichier = (f, i) => `
    <div class="fp-fichier en-attente">
      <span class="fp-fichier-nom">${esc(f.file.name)}</span>
      <span class="fp-fichier-info">${esc(poids(f.file.size))}</span>
      <button type="button" class="fp-fichier-x" data-retirer="${i}" aria-label="Retirer">×</button>
    </div>`;

  const ligneDoc = (d) => `
    <div class="fp-fichier">
      <a href="#" class="fp-fichier-nom" data-ouvrir="${esc(d.id)}">${esc(d.name)}</a>
      <span class="fp-fichier-info">${esc(poids(d.size || 0))} · déjà rattaché</span>
    </div>`;

  const blocDepot = () => {
    const zones = ZONES();
    const typesOuverts = zones.slice(0, -1).map(z => z.cle);
    const dejaLa = existing ? docsOf('deals', existing.id) : [];
    // Un document dont la catégorie n'a plus de zone (la puce a été décochée,
    // ou il vient d'ailleurs) tombe dans « Autres » plutôt que de disparaître.
    const pourZone = (cle) => (cle
      ? { attente: v.fichiers.map((f, i) => ({ f, i })).filter(({ f }) => f.categorie === cle),
          docs: dejaLa.filter(d => d.category === cle) }
      : { attente: v.fichiers.map((f, i) => ({ f, i })).filter(({ f }) => !typesOuverts.includes(f.categorie)),
          docs: dejaLa.filter(d => !typesOuverts.includes(d.category || '')) });
    const total = v.fichiers.length;
    return `
    <div class="fp-depot" id="fp-depot">
      ${zones.map((z, n) => {
        const { attente, docs } = pourZone(z.cle);
        return `
        <div class="fp-zone ${z.cle ? '' : 'est-autres'}" data-zone="${n}">
          <label class="fp-zone-tete">
            <input type="file" multiple hidden data-input="${n}">
            <span class="fp-zone-nom">${esc(z.nom)}</span>
            <span class="fp-zone-action">Déposer ou choisir…</span>
          </label>
          ${attente.length || docs.length ? `
            <div class="fp-depot-liste">
              ${attente.map(({ f, i }) => ligneFichier(f, i)).join('')}
              ${docs.map(ligneDoc).join('')}
            </div>` : ''}
        </div>`;
      }).join('')}
      <em class="mf-champ-aide">${total
        ? `${total} fichier${total > 1 ? 's' : ''} partira${total > 1 ? 'ont' : ''} à l’enregistrement. ${MAX_MO} Mo par fichier.`
        : `Glissez vos fichiers sur la ligne du type correspondant, ou cliquez dessus. ${MAX_MO} Mo par fichier.`}</em>
      ${existing ? '<em class="mf-champ-aide">Pour supprimer un document déjà rattaché, passez par la fiche de l’affaire.</em>' : ''}
    </div>`;
  };

  // ⚠ LE DÉPÔT NE REDESSINE QUE SON PROPRE BLOC quand c'est possible : un
  // `dessine()` complet ferme le panneau d'espace ouvert et remonte la page au
  // milieu d'une saisie. Ici il n'y a pas de champ en cours de frappe dans le
  // bloc, donc le redessin local suffit et coûte moins.
  const redessineDepot = () => {
    const bloc = corps.querySelector('#fp-depot');
    if (!bloc) return dessine();
    bloc.outerHTML = blocDepot();
    lierDepot();
  };

  const ajouteFichiers = (liste, categorie) => {
    let refuses = 0;
    [...liste].forEach(file => {
      if (file.size > MAX_MO * 1048576) { refuses += 1; return; }
      v.fichiers.push({ file, categorie });
    });
    if (refuses) toast(`${refuses} fichier${refuses > 1 ? 's' : ''} trop lourd${refuses > 1 ? 's' : ''} (${MAX_MO} Mo max)`, 'warn');
    redessineDepot();
  };

  function lierDepot() {
    const zones = ZONES();
    corps.querySelectorAll('[data-zone]').forEach(zone => {
      const n = Number(zone.dataset.zone);
      const cle = zones[n]?.cle ?? '';
      const input = zone.querySelector(`[data-input="${n}"]`);
      if (input) input.onchange = () => { ajouteFichiers(input.files, cle); input.value = ''; };
      // ⚠ IL FAUT ANNULER `dragover` POUR QUE `drop` EXISTE : sans
      // `preventDefault`, le navigateur ouvre le fichier dans l'onglet et on
      // perd le formulaire entier.
      ['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, ev => {
        ev.preventDefault(); zone.classList.add('survol');
      }));
      ['dragleave', 'drop'].forEach(e => zone.addEventListener(e, ev => {
        ev.preventDefault(); zone.classList.remove('survol');
      }));
      zone.addEventListener('drop', ev => ajouteFichiers(ev.dataTransfer?.files || [], cle));
    });
    corps.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      v.fichiers.splice(Number(b.dataset.retirer), 1);
      redessineDepot();
    });
    corps.querySelectorAll('[data-ouvrir]').forEach(a => a.onclick = async (e) => {
      e.preventDefault();
      const doc = db.byId('documents', a.dataset.ouvrir);
      try { window.open(await db.fileUrl(doc.storage_path), '_blank', 'noopener'); }
      catch (err) { toast(err.message, 'err'); }
    });
  }

  // ⚠ LE TÉLÉVERSEMENT N'EMPÊCHE PAS L'ENREGISTREMENT D'AVOIR EU LIEU : un
  // fichier qui échoue est dit, l'affaire reste enregistrée. Refuser la fiche
  // entière parce qu'une photo de 24 Mo a coupé ferait reperdre quatre écrans
  // de saisie.
  async function envoyerFichiers(dealId) {
    if (!v.fichiers.length) return;
    let ok = 0;
    for (const { file, categorie } of v.fichiers) {
      try {
        const chemin = `deals/${dealId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
        await db.uploadFile(chemin, file);
        await db.insert('documents', {
          entity_type: 'deals', entity_id: dealId, name: file.name,
          mime: file.type || null, size: file.size, storage_path: chemin,
          category: categorie || null, created_by: scope.user?.id || null,
        });
        ok += 1;
      } catch (err) { toast(`${file.name} : ${err.message}`, 'err'); }
    }
    if (ok) toast(`${ok} document${ok > 1 ? 's' : ''} déposé${ok > 1 ? 's' : ''}`);
    v.fichiers = [];
  }

  // ------------------------------------------- l'historique et l'urgence
  // ⚠ LA SAISIE LIBRE D'AVANT EST MONTRÉE, PAS EFFACÉE. Trois de ces champs
  // étaient du texte libre jusqu'au 30/09/2026 ; une valeur qui ne rentre pas
  // dans les nouvelles cases s'affiche sous le champ, en clair. Un formulaire
  // qui repart vide sur une fiche déjà remplie fait croire que rien n'a jamais
  // été saisi, et le premier enregistrement le rend vrai.
  const repris = (valeur) => (valeur
    ? `<em class="mf-champ-aide est-repris">Saisi auparavant : ${esc(valeur)}</em>` : '');

  const blocHistorique = () => {
    const ap = litApparition(v.apparition);
    return `
    <div class="mf-grille">
      <label class="mail-champ"><span>Date d’apparition</span>
        <div class="fp-duo">
          <select id="fp-ap-mois">
            <option value="">Mois</option>
            ${MOIS.map(m => `<option ${ap?.mois === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
          <select id="fp-ap-annee">
            <option value="">Année</option>
            ${anneesApparition().map(a => `<option ${ap?.annee === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
          </select>
        </div>
        ${ap ? '' : repris(v.apparition)}</label>

      <label class="mail-champ"><span>Date butoir éventuelle</span>
        <input type="date" id="fp-butoir" value="${esc(v.butoir)}">
        <em class="mf-champ-aide">Une date butoir marque la mission urgente.</em></label>
    </div>

    <div class="mf-sous-titre">Sinistre déclaré ?</div>
    <div class="fp-ligne">
      ${chipsUn('sinistre', ['Oui', 'Non'])}
      ${v.sinistre === 'Oui' ? `
        <label class="mail-champ fp-aqui"><span>À qui ?</span>
          <select id="fp-sinistre-aupres">
            <option value="">—</option>
            ${FICHE_EXPERTISE.sinistre_aupres.map(a => `
              <option ${a === v.sinistre_aupres ? 'selected' : ''}>${esc(a)}</option>`).join('')}
          </select></label>` : ''}
    </div>
    ${repris(v.sinistre_libre)}

    <div class="mf-sous-titre">Procédure déjà engagée ?</div>
    ${chips('procedure', FICHE_EXPERTISE.procedures)}
    ${repris(v.procedure_libre)}`;
  };

  // ------------------------------------------------- 2. le desordre et le tarif
  // ⚠ LE TARIF SE CALCULE, IL NE SE DEVINE PAS. `tarifExpertise` lit la
  // prestation, la surface et le nombre de pieces, et rend `null` tant qu'aucune
  // prestation n'est choisie. La grille detaillee n'existe pas encore : tant
  // qu'elle est vide, le prix affiche est le PLANCHER de l'offre, et le bloc le
  // dit - un « a partir de » presente comme un devis ferait annoncer un prix
  // qu'on ne tiendra pas.
  const blocTarif = () => {
    const t = tarifExpertise({ prestation: v.niveau, surface: v.surface, pieces: v.pieces });
    if (!t) {
      return `<div class="fp-tarif est-vide"><p class="fp-tarif-note">
        Le tarif s’affichera dès qu’une prestation sera choisie à l’étape <b>Mission</b>.</p></div>`;
    }
    const nom = niveauExp()?.label || '';
    return `<div class="fp-tarif" style="${teinte()}">
      <div class="fp-tarif-prix"><b>${esc(eur(t.ttc))}</b><span>TTC</span></div>
      <p class="fp-tarif-note">${esc(nom)} — ${t.plancher
        ? '<b>tarif plancher</b> de l’offre ; la grille détaillée n’est pas encore renseignée.'
        : 'd’après la grille tarifaire.'}
        Soit environ <b>${esc(eur(t.ht))} HT</b> au taux de ${TVA_TAUX} %.</p>
    </div>`;
  };

  const ecranDesordreTarif = () => `
    <div class="mf-bloc-titre">D. Où sont les désordres ?</div>
    ${blocPlan()}
    <div class="mf-grille">
      <label class="mail-champ plein"><span>Description libre du problème</span>
        <textarea id="fp-description" rows="3" placeholder="Ce que le client décrit, dans ses mots.">${esc(v.description)}</textarea></label>
    </div>

    <div class="mf-bloc-titre">E. Historique et urgence</div>
    ${blocHistorique()}

    <div class="mf-bloc-titre">F. Documents</div>
    ${chips('documents', FICHE_EXPERTISE.documents)}
    ${blocDepot()}

    <div class="mf-bloc-titre">G. Tarif de l'expertise</div>
    ${blocTarif()}

    ${barre()}`;

  // --------------------------------------------------- 2 bis. le fond, cote AMO
  const ecran3Amo = () => `
    <div class="mf-bloc-titre">D. Travaux envisagés</div>
    ${chips('travaux', FICHE_AMO.travaux)}
    <p class="mf-aide">${v.travaux.length
      ? `${v.travaux.length} poste${v.travaux.length > 1 ? 's' : ''} retenu${v.travaux.length > 1 ? 's' : ''} — sert à coter le nombre de lots.`
      : 'Cochez les postes concernés : ils servent à coter le nombre de lots.'}</p>

    <div class="mf-grille">
      <label class="mail-champ plein"><span>Description du projet</span>
        <textarea id="fp-description" rows="3" placeholder="Ce que le client veut obtenir, dans ses mots.">${esc(v.description)}</textarea></label>
      <label class="mail-champ"><span>Budget travaux TTC estimé *</span>
        <input type="number" id="fp-budget" min="0" step="1000" value="${esc(v.budget_ht)}" placeholder="200000"></label>
      <label class="mail-champ"><span>Budget maximum client</span>
        <input type="number" id="fp-budgetmax" min="0" step="1000" value="${esc(v.budget_max)}" placeholder="230000"></label>
      <label class="mail-champ"><span>Démarrage souhaité</span>
        <input type="date" id="fp-debut" value="${esc(v.date_debut)}"></label>
      <label class="mail-champ"><span>Fin souhaitée</span>
        <input type="date" id="fp-fin" value="${esc(v.date_fin)}"></label>
    </div>

    <div class="mf-bloc-titre">E. État d'avancement</div>
    ${chips('avancement', FICHE_AMO.avancement)}
    <div class="mf-bloc-titre">F. Besoin d'accompagnement</div>
    ${chips('besoins', FICHE_AMO.besoins)}
    <div class="mf-bloc-titre">G. Risques et contraintes</div>
    ${chips('risques', FICHE_AMO.risques)}

    ${barre()}`;

  // ------------------------------------------------------- 3. l'identification
  // ⚠ ELLE EST PASSEE EN DERNIER (29/09/2026). On qualifie la mission, puis on
  // prend les coordonnees - l'ordre d'un appel, pas celui d'un fichier.
  const ecranIdentification = () => `
    <div class="mf-bloc-titre">${v.mission === 'amo' ? 'I' : 'I'}. Identification</div>
    <div class="mf-grille">
      ${champ('fp-nom', 'Nom *', v.nom, 'placeholder="Dupont, ou SCI Les Oliviers"')}
      ${champ('fp-prenom', 'Prénom', v.prenom, 'placeholder="Marie"')}
      ${champ('fp-tel', 'Téléphone', v.telephone, 'placeholder="06 12 34 56 78"')}
      ${champ('fp-email', 'E-mail', v.email, 'type="email" placeholder="contact@exemple.fr"')}
      <label class="mail-champ"><span>Origine du lead</span>
        <select id="fp-canal">
          ${CANAUX_COURANTS.map(x => `<option ${x === v.canal ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          <optgroup label="Autres canaux">${CHANNELS.filter(x => !CANAUX_COURANTS.includes(x)).map(x => `<option ${x === v.canal ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>
        </select></label>
    </div>
    ${adresse('fp-cl', 'Adresse du client', v.cl_adresse, v.cl_cp, v.cl_ville)}
    ${v.contact_id ? `<p class="mf-aide">Rattaché à la fiche contact de <b>${esc(contactName(db.byId('contacts', v.contact_id) || {}))}</b> — ce qui est corrigé ici y est reporté.</p>` : ''}

    <div class="mf-bloc-titre">J. Profil du demandeur</div>
    ${chipsUn('profil', FICHE_EXPERTISE.profils, true)}
    <p class="mf-aide">Un seul profil : c'est lui qui dit à qui l'on parle, et souvent ce qui est en jeu.
    Acquéreur et vendeur n'attendent pas le même rapport.</p>

    ${barre()}`;

  const ecran4Amo = () => {
    const score = scoreAmo();
    const faites = cotesFaitesAmo();
    const complet = faites === CRITERES_V5.length;

    // ⚠ TANT QUE RIEN N'EST COTE, ON N'AFFICHE AUCUN CHIFFRE (28/09/2026,
    // demande de Mickael). L'ecran s'ouvrait sur « 0 points sur 10 » et
    // « 5 % de taux suggéré », avec le champ du taux déjà rempli à 5 — une
    // suggestion présentée comme acquise alors qu'elle ne repose sur rien. On
    // lit alors un resultat qui n'existe pas, et pire : le taux se serait
    // enregistré tel quel sans que personne ne l'ait choisi.
    //
    // ⚠ « AUCUNE COTE » N'EST PAS « AUCUN CLIC » : budget, lots et durée se
    // DÉDUISENT de l'étape précédente. Des que l'un d'eux est connu, la
    // cotation existe et les chiffres reviennent — c'est `cotesFaitesAmo` qui
    // le dit, et c'est la meme fonction qui compte les criteres a l'ecran.
    //
    // Meme regle que la tuile de rentabilite du tableau de bord RGD : ne rien
    // savoir et valoir zero ne sont pas la meme chose.
    const aucuneCote = faites === 0;
    const sug = aucuneCote ? null : tauxSug();
    const taux = aucuneCote ? v.taux_final : tauxRetenu();
    // Sans cotation il n'y a pas d'ecart a justifier : `controleTaux` comparerait
    // le taux a un suggere inexistant et reclamerait un motif de derogation sur
    // un formulaire vierge.
    const ctrl = aucuneCote
      ? { ecart: false, motifManquant: false, validationDirection: false }
      : controleTaux(sug, taux, v.motif);
    const niv = niveauAmo();
    return `
    <div class="mf-bloc-titre">J. Score de complexité</div>
    <div class="table-wrap"><table class="btp-matrice fa-matrice">
      <thead><tr><th>Critère</th><th>0 point</th><th>1 point</th><th>2 points</th></tr></thead>
      <tbody>${CRITERES_V5.map(c => {
        const cote = coteAmo(c.key);
        const deduit = (v.cotesAmo[c.key] === null || v.cotesAmo[c.key] === undefined) && cote !== null;
        return `<tr>
          <th scope="row">${esc(c.label)}${deduit ? '<em class="fa-deduit">déduit</em>' : ''}
            ${c.aide ? `<em class="btp-crit-aide">${esc(c.aide)}</em>` : ''}</th>
          ${c.valeurs.map((lbl, n) => `<td class="choix ${cote === n ? 'on' : ''}" data-crit="${c.key}" data-score="${n}"
            role="radio" aria-checked="${cote === n}" tabindex="0"><span class="btp-coche"></span>${esc(lbl)}</td>`).join('')}
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="mf-aide">${complet ? 'Les cinq critères sont cotés.'
      : `${CRITERES_V5.length - faites} critère${CRITERES_V5.length - faites > 1 ? 's' : ''} à coter. Budget, lots et durée se déduisent de l’étape précédente.`}</p>

    <div class="btp-score" style="${teinte()}">
      <div class="btp-score-val ${complet ? 'plein' : ''}"><b>${aucuneCote ? '—' : score}</b><span>${
        aucuneCote ? 'à coter' : 'points sur 10'}</span></div>
      <span class="btp-score-fleche" aria-hidden="true">→</span>
      <div class="btp-score-taux"><b>${aucuneCote ? '—' : sug + ' %'}</b><span>taux suggéré</span></div>
    </div>

    <div class="mf-bloc-titre">Taux retenu et honoraires</div>
    <div class="fa-taux" style="${teinte()}">
      ${champsHonoraires({ travaux: v.budget_ht, taux, idTravaux: 'fp-travaux2', idTaux: 'fp-taux' })}
      <div id="fp-hono">${resultatsHonoraires(v.budget_ht, taux, sug)}</div>
    </div>
    ${ctrl.ecart ? `
      <label class="mail-champ plein" style="margin-bottom:10px"><span>Motif de la dérogation *</span>
        <input id="fp-motif" value="${esc(v.motif)}" placeholder="Ex. opération importante, décision commerciale validée"></label>` : ''}
    ${ctrl.validationDirection ? '<p class="mf-aide attention">Taux inférieur à 5 % : validation de la direction obligatoire.</p>' : ''}

    <div class="mf-bloc-titre">Niveau de mission</div>
    <div class="mf-niveaux" style="${teinte()}">
      ${NIVEAUX_AMO.map(n => `
        <button type="button" class="mf-niveau ${niv && n.key === niv.key ? 'on' : ''}" data-niveau="${n.key}">
          <span class="mf-niveau-pts">${n.points} pts</span>
          <b>${esc(n.label)}${!aucuneCote && niveauSuggere(score).key === n.key ? '<em class="fa-suggere">suggéré</em>' : ''}</b>
          <span class="mf-niveau-txt">${esc(n.contenu)}</span>
        </button>`).join('')}
    </div>

    ${barre()}`;
  };

  // ------------------------------------------------------------- le dessin
  const RENDU = {
    mission: () => ecranMission(),
    desordre: () => ecranDesordreTarif(),
    'amo-fond': () => ecran3Amo(),
    'amo-cote': () => ecran4Amo(),
    identification: () => ecranIdentification(),
  };

  const dessine = () => {
    corps.innerHTML = enTete() + RENDU[nomEcran()]();
    lier();
  };

  const poser = (sel, cle) => { const el = corps.querySelector(sel); if (el) el.oninput = () => { v[cle] = el.value; }; };
  const choisir = (sel, cle) => { const el = corps.querySelector(sel); if (el) el.onchange = () => { v[cle] = el.value; }; };

  const lier = () => {
    // ⚠ ON PEUT ALLER DANS LES DEUX SENS (demande du 25/09/2026 : « avoir la
    // possibilité de passer d'une étape à une autre »). Les fiches découverte
    // ne laissaient revenir qu'en arrière ; corriger une adresse depuis la
    // dernière étape obligeait à tout reparcourir.
    corps.querySelectorAll('[data-pas]').forEach(b => b.onclick = () => { v.pas = Number(b.dataset.pas); dessine(); });
    corps.querySelector('#fp-retour')?.addEventListener('click', () => { v.pas -= 1; dessine(); });
    corps.querySelector('#fp-suite')?.addEventListener('click', () => {
      // ⚠ PLUS DE CONTRÔLE DU NOM ICI : l'identification est passée en
      // DERNIER, il n'y a plus d'écran après elle. C'est `enregistrer` qui
      // exige le nom, et qui ramène sur la bonne étape s'il manque.
      // ⚠ LA PRESTATION SE VÉRIFIE ICI, ET CÔTÉ EXPERTISE SEULEMENT : c'est
      // elle qui commande le tarif de l'écran suivant, il n'y aurait rien à
      // montrer sans elle. Côté AMO le niveau se DÉDUIT de la cotation, et
      // l'exiger dès le premier écran ferait choisir un degré de charge avant
      // de connaître le budget, les lots et la durée.
      if (nomEcran() === 'mission' && v.mission !== 'amo' && !cleNiveau(v.niveau)) {
        return toast('Choisissez la prestation', 'warn');
      }
      v.pas += 1; dessine();
    });
    corps.querySelector('#fp-enregistrer')?.addEventListener('click', () => enregistrer(false));
    corps.querySelector('#fp-creer')?.addEventListener('click', () => enregistrer(true));

    corps.querySelectorAll('[data-chips]').forEach(g => {
      const cle = g.dataset.chips;
      g.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
        const x = b.dataset.val;
        v[cle] = v[cle].includes(x) ? v[cle].filter(y => y !== x) : [...v[cle], x];
        dessine();
      });
    });
    corps.querySelectorAll('[data-chips-un]').forEach(g => {
      const cle = g.dataset.chipsUn;
      g.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => { v[cle] = v[cle] === b.dataset.val ? '' : b.dataset.val; dessine(); });
    });

    const ecran = nomEcran();

    if (ecran === 'identification') {
      poser('#fp-nom', 'nom'); poser('#fp-prenom', 'prenom'); poser('#fp-tel', 'telephone');
      poser('#fp-email', 'email'); poser('#fp-cl-rue', 'cl_adresse'); poser('#fp-cl-cp', 'cl_cp');
      poser('#fp-cl-ville', 'cl_ville'); choisir('#fp-canal', 'canal');
      return;
    }

    if (ecran === 'mission') {
      corps.querySelectorAll('[data-metier]').forEach(b => b.onclick = () => {
        const metier = b.dataset.metier;
        if (v.mission === metier) return;
        v.mission = metier;
        // ⚠ CHANGER DE METIER CHANGE LE DEROULE : les étapes de l'expertise
        // n'existent pas côté AMO. On replace l'affaire au départ du nouveau
        // métier plutôt que de la laisser à une étape qui n'a plus de colonne.
        const etapes = etapesDe(metier);
        if (!etapes.some(e => e.key === v.stage)) v.stage = etapes[0].key;
        // ⚠ LE NIVEAU APPARTIENT AU METIER : `exp_preachat` n'existe pas côté
        // AMO, le garder afficherait une prestation absente de la rangée et
        // ferait chercher un tarif dans la mauvaise grille.
        v.niveau = null;
        dessine();
      });
      // La prestation — CÔTÉ EXPERTISE SEULEMENT, la rangée n'existe pas en
      // AMO. Un second clic sur la carte retenue la désélectionne : c'est le
      // seul moyen de revenir à « rien de choisi » après s'être trompé.
      corps.querySelectorAll('[data-choix]').forEach(b => b.onclick = () => {
        v.niveau = cleNiveau(v.niveau) === b.dataset.choix ? null : b.dataset.choix;
        dessine();
      });
      poser('#fp-annee', 'annee'); poser('#fp-surface', 'surface'); poser('#fp-pieces', 'pieces');
      poser('#fp-bien-rue', 'adresse'); poser('#fp-bien-cp', 'code_postal'); poser('#fp-bien-ville', 'ville');
      choisir('#fp-type', 'type_bien'); choisir('#fp-occupation', 'occupation');
      choisir('#fp-visite', 'date_visite');
      choisir('#fp-stage', 'stage'); choisir('#fp-owner', 'owner_id');
      return;
    }

    if (ecran === 'desordre') {
      // ⚠ OUVRIR UN ESPACE REDESSINE L'ÉCRAN, donc on relit d'abord la note en
      // cours de frappe : `poser` n'écrit qu'au `input`, mais le panneau
      // disparaît avec le redessin et la saisie partirait avec lui.
      const noteCourante = () => {
        const ch = corps.querySelector('#fp-note-espace');
        if (ch && v.espaces[v.espaceOuvert]) v.espaces[v.espaceOuvert].note = ch.value;
      };
      corps.querySelectorAll('[data-espace]').forEach(b => b.onclick = () => {
        noteCourante();
        const i = Number(b.dataset.espace);
        v.espaceOuvert = v.espaceOuvert === i ? null : i;
        dessine();
      });
      corps.querySelector('[data-fermer-espace]')?.addEventListener('click', () => {
        noteCourante(); v.espaceOuvert = null; dessine();
      });
      const grille = corps.querySelector('[data-desordres]');
      if (grille) {
        const e = v.espaces[Number(grille.dataset.desordres)];
        grille.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
          noteCourante();
          const m = b.dataset.val;
          e.desordres = e.desordres.includes(m) ? e.desordres.filter(x => x !== m) : [...e.desordres, m];
          dessine();
        });
      }
      const grav = corps.querySelector('[data-gravite]');
      if (grav) {
        const e = v.espaces[Number(grav.dataset.gravite)];
        grav.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
          noteCourante();
          e.gravite = e.gravite === b.dataset.val ? '' : b.dataset.val;
          dessine();
        });
      }
      const note = corps.querySelector('#fp-note-espace');
      if (note) note.oninput = () => { v.espaces[v.espaceOuvert].note = note.value; };
      corps.querySelector('#fp-ajout-espace')?.addEventListener('click', () => {
        noteCourante();
        // `ajoute: true` le protège du ménage : un espace créé à la main est
        // voulu, même vide, et le regenerer ne le retrouverait pas.
        v.espaces.push({ nom: `Espace ${v.espaces.length + 1}`, groupe: 'annexe',
          ajoute: true, desordres: [], gravite: '', note: '' });
        v.espaceOuvert = v.espaces.length - 1;
        dessine();
        corps.querySelector('#fp-note-espace')?.focus();
      });
      poser('#fp-description', 'description');
      // ⚠ LE LIBELLÉ SE FABRIQUE ICI à partir des deux listes : c'est lui qu'on
      // enregistre (« Mars 2025 »), pas un format machine — voir `litApparition`.
      const majApparition = () => {
        const m = corps.querySelector('#fp-ap-mois')?.value || '';
        const a = corps.querySelector('#fp-ap-annee')?.value || '';
        // Un mois sans année ne désigne rien : on attend l'année.
        v.apparition = a ? [m, a].filter(Boolean).join(' ') : '';
      };
      corps.querySelector('#fp-ap-mois')?.addEventListener('change', majApparition);
      corps.querySelector('#fp-ap-annee')?.addEventListener('change', majApparition);
      choisir('#fp-sinistre-aupres', 'sinistre_aupres');
      choisir('#fp-butoir', 'butoir');
      lierDepot();
      return;
    }

    if (ecran === 'amo-fond') {
      poser('#fp-description', 'description');
      poser('#fp-budget', 'budget_ht'); poser('#fp-budgetmax', 'budget_max');
      choisir('#fp-debut', 'date_debut'); choisir('#fp-fin', 'date_fin');
      return;
    }

    // Reste l'écran de cotation AMO : les matrices.
    corps.querySelectorAll('[data-crit]').forEach(td => {
      const coter = () => {
        const cle = td.dataset.crit; const n = Number(td.dataset.score);
        v.cotesAmo[cle] = v.cotesAmo[cle] === n ? null : n;
        dessine();
      };
      td.onclick = coter;
      td.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coter(); } };
    });
    corps.querySelectorAll('[data-niveau]').forEach(b => b.onclick = () => { v.niveau = b.dataset.niveau; dessine(); });
    if (v.mission === 'amo') {
      poser('#fp-motif', 'motif');
      // ⚠ LA FRAPPE NE REDESSINE QUE LES RESULTATS.
      //
      // Redessiner tout l'ecran a chaque caractere detruit le champ et en
      // recree un autre : le curseur part avec l'ancien, et on ne peut plus
      // saisir qu'un chiffre a la fois. Signale par Mickael le 28/09/2026 sur
      // le montant des travaux TTC, qu'il fallait retaper dix fois.
      //
      // ⚠ LE REDESSIN COMPLET ATTEND LA SORTIE DU CHAMP (`change`), et il est
      // necessaire : c'est lui qui met a jour la cotation DEDUITE du budget
      // dans la matrice, le score, le taux suggere et le motif de derogation.
      // Se contenter de `input` laisserait la matrice affirmer une cotation
      // que le montant ne justifie plus.
      //
      // C'est la mecanique que l'ecran AMO portait depuis l'origine ; je l'ai
      // perdue en ecrivant la fiche projet. Ne pas la resimplifier.
      // ⚠ LA MEME REGLE QUE LE RENDU, sinon les deux se contredisent sous les
      // yeux : pendant la frappe les honoraires annonçaient 10 000 € calculés
      // sur un taux de 5 % que le champ ne montrait pas et que le score disait
      // « — ». `coteBudget` rend null tant que le montant vaut zéro, donc dès le
      // premier chiffre tapé la cotation existe et les résultats reviennent
      // d'eux-mêmes — sans attendre la sortie du champ.
      const majHono = () => {
        const z = corps.querySelector('#fp-hono');
        if (!z) return;
        const rien = cotesFaitesAmo() === 0;
        z.innerHTML = resultatsHonoraires(v.budget_ht,
          rien ? v.taux_final : tauxRetenu(), rien ? null : tauxSug());
      };
      const chTrav = corps.querySelector('#fp-travaux2');
      if (chTrav) {
        chTrav.oninput = () => { v.budget_ht = chTrav.value; majHono(); };
        chTrav.onchange = () => dessine();
      }
      const chTaux = corps.querySelector('#fp-taux');
      if (chTaux) {
        chTaux.oninput = () => { v.taux_final = chTaux.value === '' ? null : Number(chTaux.value); majHono(); };
        chTaux.onchange = () => dessine();
      }
    }
  };

  // ------------------------------------------------------- l'enregistrement
  // La copie complète de ce qui a été saisi. ⚠ Elle sert à REMPLIR le
  // formulaire la fois suivante, donc elle garde les cotations brutes : sans
  // elles, rouvrir la fiche repartirait d'une matrice vierge et le niveau
  // choisi n'aurait plus de justification visible.
  const copie = () => ({
    metier: v.mission,
    client: nomComplet() || '—', telephone: v.telephone, email: v.email,
    adresse_client: [v.cl_adresse, v.cl_cp, v.cl_ville].filter(Boolean).join(', '),
    canal: v.canal, profil: v.profil,
    type_bien: v.type_bien, annee: v.annee, surface: v.surface, pieces: v.pieces,
    occupation: v.occupation,
    adresse: [v.adresse, v.code_postal, v.ville].filter(Boolean).join(', '),
    motifs: motifsDesEspaces(), description: v.description,
    espaces: v.espaces || [], espaces_resume: resumeEspaces(v.espaces || []),
    apparition: v.apparition, evolution: v.evolution,
    sinistre: v.sinistre || v.sinistre_libre, sinistre_aupres: v.sinistre_aupres,
    procedure: v.procedure.length ? v.procedure : v.procedure_libre,
    butoir: v.butoir, securite: v.securite,
    documents: v.documents, controles: v.controles,
    cotesBrutes: { ...v.cotes },
    cotes: QUALIF_EXPERTISE.map(c => ({ label: c.label, valeurs: c.valeurs, cote: v.cotes[c.key] ?? null })),
    travaux: v.travaux, budget_ht: v.budget_ht, budget_max: v.budget_max,
    date_debut: v.date_debut, date_fin: v.date_fin,
    avancement: v.avancement, besoins: v.besoins, risques: v.risques,
    cotesAmo: { ...v.cotesAmo }, motif: v.motif,
    niveau: niveauRetenu()?.label || '—', points: niveauRetenu()?.points || 0,
    tarif: montant(),
    date_visite: v.date_visite,
    charge: users.find(u => u.id === v.owner_id)?.full_name || '—',
    etape: etapesDe(v.mission).find(e => e.key === v.stage)?.label || v.stage,
    etablie_le: new Date().toISOString().slice(0, 10),
  });

  async function enregistrer(fermer) {
    if (!v.nom.trim()) {
      // ⚠ PAS « v.pas = 1 » : l'identification n'est plus la première étape.
      // On revient sur l'écran qui porte le champ manquant, quel que soit
      // son rang dans le métier courant.
      v.pas = ECRANS().indexOf('identification') + 1;
      dessine(); return toast('Le nom du client est nécessaire', 'warn');
    }
    const niv = niveauRetenu();
    const champsClient = {
      last_name: v.nom.trim() || null, first_name: v.prenom.trim() || null,
      phone: v.telephone.trim() || null, email: v.email.trim() || null,
      address: v.cl_adresse.trim() || null, postal_code: v.cl_cp.trim() || null, city: v.cl_ville.trim() || null,
    };
    try {
      // ⚠ LE CONTACT NE REÇOIT QUE CE QUI A CHANGÉ. Réécrire les sept champs à
      // chaque enregistrement effacerait en silence ce qu'un autre écran a
      // rempli entre-temps.
      let contactId = v.contact_id;
      if (contactId) {
        const avant = db.byId('contacts', contactId) || {};
        const ecart = {};
        for (const [k, val] of Object.entries(champsClient)) if ((val || '') !== (avant[k] || '')) ecart[k] = val;
        if (!(avant.activities || []).includes(KEY)) ecart.activities = [...(avant.activities || []), KEY];
        if (Object.keys(ecart).length) await db.update('contacts', contactId, ecart);
      } else {
        const neuf = await db.insert('contacts', { ...champsClient, type: 'Prospect', activities: [KEY], channel: v.canal, owner_id: v.owner_id });
        contactId = neuf.id; v.contact_id = neuf.id;
      }

      const fiches = {
        type_mission: v.mission,
        niveau: niv?.key || null,
        type_bien: v.type_bien || null,
        contexte: v.profil || null,
        adresse: v.adresse.trim() || null,
        code_postal: v.code_postal.trim() || null,
        ville: v.ville.trim() || null,
        detail: v.description.trim() || null,
        problematique: (v.mission === 'amo' ? v.travaux : motifsDesEspaces()).join(', ') || null,
        date_visite: v.date_visite || null,
        date_rapport: v.date_rapport || null,
        montant_travaux: v.mission === 'amo' ? (Number(v.budget_ht) || null) : null,
        taux_amo: v.mission === 'amo' ? tauxRetenu() : null,
        // ⚠ L'URGENCE SE LIT SUR LA DATE BUTOIR DEPUIS LE 30/09/2026. Elle se
        // lisait sur « Risque sécurité immédiat ? », champ retiré de l'écran :
        // la laisser dessus l'aurait figée à « non » pour toujours, sans que
        // rien ne le dise. Le texte d'aide citait déjà les deux signaux, il n'en
        // reste qu'un.
        urgence: v.mission === 'expertise' && !!v.butoir,
        decouverte: copie(),
      };
      const titre = `${(v.mission === 'amo' ? v.travaux[0] : motifsDesEspaces()[0]) || (v.mission === 'amo' ? 'AMO' : 'Expertise')} — ${nomComplet()}`;
      const maintenant = new Date().toISOString();

      let id;
      if (existing) {
        // ⚠ `fields` est remplacé en bloc : on repart de l'existant, sinon la
        // facturation déjà saisie disparaîtrait à chaque enregistrement.
        const courant = db.byId('deals', existing.id);
        const patch = { contact_id: contactId, owner_id: v.owner_id, channel: v.canal,
          amount: montant(), fields: { ...courant.fields, ...fiches } };
        if (v.stage !== courant.stage) {
          Object.assign(patch, { stage: v.stage, stage_changed_at: maintenant,
            stage_history: [...(courant.stage_history || []), { stage: v.stage, at: maintenant }] });
        }
        await db.update('deals', existing.id, patch);
        id = existing.id;
        toast('Fiche projet enregistrée');
      } else {
        const deal = await db.insert('deals', {
          title: titre, activity: KEY, stage: v.stage, status: 'open',
          contact_id: contactId, owner_id: v.owner_id, channel: v.canal,
          amount: montant(), fields: fiches,
          stage_history: [{ stage: v.stage, at: maintenant }], stage_changed_at: maintenant,
        });
        id = deal.id;
        toast(v.mission === 'amo' ? 'Mission AMO créée' : 'Mission d’expertise créée');
      }
      // ⚠ LES FICHIERS PARTENT APRÈS L'AFFAIRE, jamais avant : ils se rattachent
      // à `id`, qui n'existe pas tant que l'insertion n'a pas eu lieu.
      await envoyerFichiers(id);
      if (fermer) closeModal(true);
      // Sans fermeture, le bloc doit montrer les fichiers désormais rattachés et
      // ne plus annoncer une attente qui n'a plus lieu.
      else redessineDepot();
      apres?.(id);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  dessine();
  return m;
}
