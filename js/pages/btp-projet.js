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
} from '../data/schema.js';
import { champsHonoraires, resultatsHonoraires } from './btp-amo.js';

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
    apparition: d.apparition || '', evolution: d.evolution || '', sinistre: d.sinistre || '',
    procedure: d.procedure || '', butoir: d.butoir || '', securite: d.securite || '',
    documents: d.documents || [], controles: d.controles || [],
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
  // ⚠ L'ORDRE A CHANGÉ LE 29/09/2026, demandé par Mickael pour l'expertise :
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
  const chipsUn = (cle, liste) => `<div class="fa-chips" data-chips-un="${cle}">${liste.map(x => `
    <button type="button" class="fa-chip ${v[cle] === x ? 'on' : ''}" data-val="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
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
  // ⚠ LA PRESTATION SE CHOISIT ICI, PAS AU BOUT DU PARCOURS (29/09/2026).
  // Les quatre cartes sont les quatre missions du cabinet : les trois
  // expertises de l'offre commerciale, et l'AMO. En choisir une fixe le METIER
  // et, pour une expertise, la PRESTATION - c'est-a-dire ce qui commande le
  // tarif a l'etape suivante.
  //
  // ⚠ L'ORDRE EST CELUI DE L'OFFRE, pas celui de la charge de travail : c'est
  // la liste que le client a sous les yeux.
  const CHOIX_MISSION = () => [
    ...NIVEAUX_EXP.map(n => ({
      cle: n.key, mission: 'expertise', titre: n.label, txt: n.contenu, note: n.tarif,
    })),
    {
      cle: 'amo', mission: 'amo', titre: 'AMO / accompagnement',
      txt: "Accompagnement du maitre d'ouvrage, de la consultation des entreprises a la reception.",
      note: 'Honoraires en % des travaux',
    },
  ];

  const ecranMission = () => {
    const etapes = etapesDe(v.mission);
    const cleLivrable = ETAPE_LIVRABLE[v.mission];
    const dateAuto = dateLivrable(v.mission);
    const choisi = v.mission === 'amo' ? 'amo' : cleNiveau(v.niveau);
    return `
    <div class="mf-bloc-titre">A. Type de mission</div>
    <div class="mf-niveaux" style="${teinte()}">
      ${CHOIX_MISSION().map(c => `
        <button type="button" class="mf-niveau ${c.cle === choisi ? 'on' : ''}"
          data-choix="${esc(c.cle)}" data-metier="${esc(c.mission)}">
          <span class="mf-niveau-pts">${esc(c.note)}</span>
          <b>${esc(c.titre)}</b>
          <span class="mf-niveau-txt">${esc(c.txt)}</span>
        </button>`).join('')}
    </div>
    ${!choisi ? '<p class="mf-aide attention">Choisissez la mission : c’est elle qui commande la suite du parcours et le tarif.</p>' : ''}

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
      <label class="mail-champ"><span>Rapport envoyé le</span>
        <input type="date" id="fp-rapport" value="${esc(v.date_rapport)}">
        <em class="mf-champ-aide">${dateAuto
          ? `Repris de l’étape « ${esc(etapes.find(e => e.key === cleLivrable)?.label || cleLivrable)} ».`
          : `Se remplit au passage à « ${esc(etapes.find(e => e.key === cleLivrable)?.label || cleLivrable)} ».`}</em></label>
      <label class="mail-champ"><span>Où en est la mission ?</span>
        <select id="fp-stage">${etapes.map(e => `<option value="${e.key}" ${e.key === v.stage ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select></label>
      <label class="mail-champ"><span>Chargé d'affaires</span>
        <select id="fp-owner">${users.map(u => `<option value="${u.id}" ${u.id === v.owner_id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></label>
    </div>

    ${barre()}`;
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

  const ecranDesordreTarif = () => {
    const t = tarifExpertise({ prestation: v.niveau, surface: v.surface, pieces: v.pieces });
    return `
    <div class="mf-bloc-titre">D. Motif de la demande</div>
    ${chips('motifs', FICHE_EXPERTISE.motifs)}
    <div class="mf-grille">
      <label class="mail-champ plein"><span>Description libre du problème</span>
        <textarea id="fp-description" rows="3" placeholder="Ce que le client décrit, dans ses mots.">${esc(v.description)}</textarea></label>
    </div>

    <div class="mf-bloc-titre">E. Historique et urgence</div>
    <div class="mf-grille">
      ${champ('fp-apparition', "Date d'apparition", v.apparition, 'placeholder="Printemps 2025"')}
      ${champ('fp-evolution', 'Évolution observée', v.evolution, 'placeholder="Aggravation depuis l’hiver"')}
      ${champ('fp-sinistre', 'Sinistre déclaré ? à qui ?', v.sinistre, '', true)}
      ${champ('fp-procedure', 'Mise en demeure, expertise ou procédure déjà engagée ?', v.procedure, '', true)}
      ${champ('fp-butoir', 'Date butoir éventuelle', v.butoir, 'type="date"')}
      ${champ('fp-securite', 'Risque sécurité immédiat ?', v.securite, 'placeholder="Aucun constaté"')}
    </div>
    <p class="mf-aide attention">Un risque sécurité ou une date butoir change l'urgence de la visite : à remplir même sommairement.</p>

    <div class="mf-bloc-titre">F. Documents disponibles</div>
    ${chips('documents', FICHE_EXPERTISE.documents)}

    <div class="mf-bloc-titre">G. Tarif de l'expertise</div>
    ${blocTarif()}
    <div class="mf-grille">
      <label class="mail-champ"><span>Montant retenu HT</span>
        <input type="number" id="fp-tarif" min="0" step="50" value="${esc(v.tarif)}">
        ${t ? `<em class="mf-champ-aide">Laisser vide pour retenir ${esc(eur(t.ht))} HT.</em>`
            : '<em class="mf-champ-aide">Choisissez d’abord la prestation.</em>'}</label>
    </div>

    <div class="mf-bloc-titre">H. Contrôles avant attribution</div>
    ${chips('controles', FICHE_EXPERTISE.controles)}

    ${barre()}`;
  };

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
    ${chipsUn('profil', FICHE_EXPERTISE.profils)}
    <p class="mf-aide">Un seul profil : c'est lui qui dit à qui l'on parle, et souvent ce qui est en jeu.</p>

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
      // ⚠ La mission, elle, se vérifie ici : sans prestation choisie, l'écran
      // suivant n'aurait ni tarif ni cotation à montrer.
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
      // ⚠ CHOISIR UNE PRESTATION CHOISIT AUSSI LE METIER. Les trois cartes
      // d'expertise posent `mission = expertise` ET le niveau ; la carte AMO
      // pose le métier et efface le niveau, qui appartient à l'autre déroulé.
      corps.querySelectorAll('[data-choix]').forEach(b => b.onclick = () => {
        const metier = b.dataset.metier;
        const cle = b.dataset.choix;
        // ⚠ CHANGER DE METIER CHANGE LE DEROULE : les étapes de l'expertise
        // n'existent pas côté AMO. On replace l'affaire au départ du nouveau
        // métier plutôt que de la laisser à une étape qui n'a plus de colonne.
        if (v.mission !== metier) {
          v.mission = metier;
          const etapes = etapesDe(metier);
          if (!etapes.some(e => e.key === v.stage)) v.stage = etapes[0].key;
        }
        v.niveau = metier === 'amo' ? null : cle;
        dessine();
      });
      poser('#fp-annee', 'annee'); poser('#fp-surface', 'surface'); poser('#fp-pieces', 'pieces');
      poser('#fp-bien-rue', 'adresse'); poser('#fp-bien-cp', 'code_postal'); poser('#fp-bien-ville', 'ville');
      choisir('#fp-type', 'type_bien'); choisir('#fp-occupation', 'occupation');
      choisir('#fp-visite', 'date_visite'); choisir('#fp-rapport', 'date_rapport');
      choisir('#fp-stage', 'stage'); choisir('#fp-owner', 'owner_id');
      return;
    }

    if (ecran === 'desordre') {
      poser('#fp-description', 'description');
      poser('#fp-apparition', 'apparition'); poser('#fp-evolution', 'evolution');
      poser('#fp-sinistre', 'sinistre'); poser('#fp-procedure', 'procedure');
      poser('#fp-securite', 'securite'); choisir('#fp-butoir', 'butoir');
      poser('#fp-tarif', 'tarif');
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
    } else {
      poser('#fp-tarif', 'tarif');
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
    motifs: v.motifs, description: v.description,
    apparition: v.apparition, evolution: v.evolution, sinistre: v.sinistre,
    procedure: v.procedure, butoir: v.butoir, securite: v.securite,
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
        problematique: (v.mission === 'amo' ? v.travaux : v.motifs).join(', ') || null,
        date_visite: v.date_visite || null,
        date_rapport: v.date_rapport || null,
        montant_travaux: v.mission === 'amo' ? (Number(v.budget_ht) || null) : null,
        taux_amo: v.mission === 'amo' ? tauxRetenu() : null,
        urgence: v.mission === 'expertise' && !!String(v.securite || '').trim() && !/aucun|non|rien/i.test(v.securite),
        decouverte: copie(),
      };
      const titre = `${(v.mission === 'amo' ? v.travaux[0] : v.motifs[0]) || (v.mission === 'amo' ? 'AMO' : 'Expertise')} — ${nomComplet()}`;
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
      if (fermer) closeModal(true);
      apres?.(id);
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  dessine();
  return m;
}
