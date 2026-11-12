// La page « Planning chantier » de RGD Renova (10/11/2026, demandé par Élodie)
//
// « Un calendrier mensuel où l'on peut ajouter des chantiers et les rattacher
// à des fiches projet/client », avec pour chaque chantier une fiche qui porte
// une liste de matériaux et une liste d'outils — standard mais
// personnalisables, cochables pour savoir ce qu'on a déjà et ce qui a été
// acheté. Date de début + durée, et des chantiers qui se superposent.
//
// Choix d'Élodie le même jour : page juste sous la Vue d'ensemble, durée en
// jours CALENDAIRES, deux cases par ligne (« En stock », « Acheté »),
// direction seule.
//
// ⚠ LA SUPERPOSITION SE DESSINE EN COULOIRS. Dans chaque semaine, un chantier
// prend le premier couloir libre sur toute sa largeur ; deux chantiers qui se
// chevauchent sont donc l'un au-dessus de l'autre, jamais l'un sur l'autre.
// Un chantier qui passe d'une semaine à la suivante se coupe en deux barres,
// et la seconde dit « suite ».
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, toast, openModal, closeModal, confirm } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { etapeDeFiche, etapeDeDemande, joursDeVisite } from '../data/rgd-etapes.js';
import { LISTES, UNITES, joursPour, dureeLue, listesStandard, enregistrerStandard, versDate, versIso, ajouterJours, finDe,
         chantiersPlanifies, lignesDe, resteA, creerChantier, majChantier, supprimerChantier,
         ajouterLigne, ajouterStandard, majLigne, retirerLigne, changerFin, deplacerChantier, estFormation,
         UNITES_FORMATION, ouvresPour, prochainOuvre, finOuvree, plagesOuvrees,
         estTermine, declarerFin, rouvrirChantier, aujourdhuiIso } from '../data/rgd-planning.js';

// ⚠ LE 11/11/2026 : PARTAGE, LECTURE PAR L'ÉQUIPE ET VUE DE L'ANNÉE.
// · Un chantier peut être partagé avec un membre de l'équipe (`partage_avec`).
//   Il le VOIT et peut COCHER / AJOUTER des lignes à ses listes ; les dates,
//   le dossier, le partage et la suppression restent à la direction (choix
//   d'Élodie, tenu aussi côté base par les policies).
// · Une vue « Année » : une frise des douze mois, une ligne par chantier,
//   passés grisés, en cours en couleur vive, à venir en couleur adoucie.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
// Des teintes franches et distinctes, lisibles en texte blanc.
// ⚠ LE VIOLET A QUITTÉ LES CHANTIERS (11/11/2026, Élodie : « les formations
// ont une couleur attitrée, et on supprime cette couleur pour les
// chantiers ») : il se confondait avec l'indigo des formations.
const COULEURS = ['#fd7a2d', '#0284c7', '#16a34a', '#db2777', '#0d9488', '#ca8a04', '#475569'];
// Une formation est TOUJOURS indigo (couleur attitrée, pas de choix) ; un
// chantier ne prend qu'une couleur de sa palette — une couleur enregistrée
// hors palette (l'ancien violet) repasse en automatique.
const COULEUR_FORMATION = '#4f46e5';
const couleurDe = (c, i = 0) => (estFormation(c) ? COULEUR_FORMATION
  : COULEURS.includes(c.couleur) ? c.couleur : COULEURS[i % COULEURS.length]);
// La toque, devant le nom d'une formation (barres, frise, tableau).
const TOQUE = '<svg class="pl-toque" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3zm-6.5 9.6V16c0 1.9 2.9 3.5 6.5 3.5s6.5-1.6 6.5-3.5v-3.4L12 16.2l-6.5-3.6z"/></svg>';
const marque = (c) => (estFormation(c) ? TOQUE : '');

const aujourdhui = () => versIso(new Date());
const dateLongue = (iso) => {
  const d = versDate(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
};
const dateCourte = (iso) => {
  const d = versDate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ------------------------------------------------------------ les fiches
// Le rattachement : une fiche client (`rgd_clients`) ou une demande
// (`rgd_demandes`). Le nom et l'adresse se lisent ici, à l'affichage : un nom
// recopié dans le chantier vieillirait dès la première correction de la fiche.
function nomFiche(f) {
  const c = f.contact_id && db.byId('contacts', f.contact_id);
  const o = f.organisation_id && db.byId('organisations', f.organisation_id);
  return [c?.first_name, c?.last_name].filter(Boolean).join(' ') || o?.name || '(fiche sans nom)';
}
const assembler = (rue, cp, ville) => [rue, [cp, ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
// ⚠ L'ADRESSE DU CHANTIER D'ABORD, PUIS CELLE DE LA PERSONNE (11/11/2026) :
// mesuré ce jour-là, 5 fiches clients sur 201 seulement portent une adresse
// de chantier ; sans repli, choisir un dossier ne remplissait presque jamais
// l'adresse. Le contact (ou l'organisation) a la sienne.
function adresseFiche(f) {
  const chantier = assembler(f.adresse_chantier, f.code_postal_chantier, f.ville_chantier);
  if (chantier) return chantier;
  const c = f.contact_id && db.byId('contacts', f.contact_id);
  const o = f.organisation_id && db.byId('organisations', f.organisation_id);
  return assembler(c?.address, c?.postal_code, c?.city) || assembler(o?.address, o?.postal_code, o?.city);
}
const nomDemande = (d) => `${d.prenom || ''} ${d.nom || ''}`.trim() || '(demande sans nom)';
const adresseDemande = (d) => assembler(d.adresse_chantier, d.code_postal_chantier, d.ville_chantier)
  || assembler(d.adresse, d.code_postal, d.ville);

// ⚠ LES DOSSIERS DES TROIS ÉTAPES DU DEVIS (10/11/2026, Élodie : « je veux
// que l'on puisse rattacher un dossier devis en cours, devis envoyé, devis
// accepté », et pas toute la base). Une première version ne proposait que
// « Devis en cours » : c'était un malentendu, ne pas y revenir. L'étape est
// calculée par les MÊMES fonctions que l'écran Clients & prospects, pour que
// les deux ne divergent pas, et les dossiers sont rangés par étape puis par nom.
//
// ⚠ LE DOSSIER DÉJÀ RATTACHÉ RESTE PROPOSÉ même s'il a changé d'étape depuis
// (chantier commencé, terminé) : sinon l'enregistrer effacerait le lien. Il
// est rangé sous « Déjà rattaché ».
//
// ⚠ `db.t` ET NON `scope.rgd` : la page est réservée à la direction, et le
// sélecteur « Vue » mémorisé ailleurs aurait retiré de la liste les dossiers
// d'un chargé d'affaires.
const ETAPES_PROPOSEES = [
  ['devis_encours', 'Devis en cours'],
  ['devis_envoye', 'Devis envoyé'],
  ['devis_accepte', 'Devis accepté'],
];
const projetFiche = (f) => f.meta_type_projet || f.nature_travaux || f.types_travaux || f.projet_description || '';
const projetDemande = (d) => d.type_projet || d.projet_description || '';
function rattachements(actuel = '') {
  const chantiers = db.t('rgd_chantiers');
  const devis = db.t('rgd_devis');
  const jours = joursDeVisite(db.t('agenda_events'));
  const tous = [
    ...db.t('rgd_clients').map(f => ({ cle: `fiche:${f.id}`, nom: nomFiche(f), adresse: adresseFiche(f),
      projet: projetFiche(f), etape: etapeDeFiche(f, chantiers, devis, jours) })),
    ...db.t('rgd_demandes').map(d => ({ cle: `demande:${d.id}`, nom: nomDemande(d), adresse: adresseDemande(d),
      projet: projetDemande(d), etape: etapeDeDemande(d, devis) })),
  ];
  const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr');
  const groupes = ETAPES_PROPOSEES.map(([k, label]) => ({ label, dossiers: tous.filter(x => x.etape === k).sort(parNom) }));
  const lie = tous.find(x => x.cle === actuel && !ETAPES_PROPOSEES.some(([k]) => k === x.etape));
  if (lie) groupes.unshift({ label: 'Déjà rattaché', dossiers: [lie] });
  return groupes.filter(g => g.dossiers.length);
}
const cleDe = (c) => (c.fiche_id ? `fiche:${c.fiche_id}` : c.demande_id ? `demande:${c.demande_id}` : '');
function rattachementDe(c) {
  if (c.fiche_id) { const f = db.byId('rgd_clients', c.fiche_id); return f ? { nom: nomFiche(f), ligne: f, genre: 'fiche' } : null; }
  if (c.demande_id) { const d = db.byId('rgd_demandes', c.demande_id); return d ? { nom: nomDemande(d), ligne: d, genre: 'demande' } : null; }
  return null;
}

// ------------------------------------------------------------ le calendrier
// Les semaines du mois, du lundi au dimanche, débordant sur les mois voisins
// pour que la grille reste rectangulaire.
function semainesDu(annee, mois) {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;          // lundi = 0
  const debut = new Date(annee, mois, 1 - decalage);
  const dernier = new Date(annee, mois + 1, 0);
  const semaines = [];
  for (let d = new Date(debut); d <= dernier || semaines.length < 4; ) {
    const jours = [];
    for (let i = 0; i < 7; i++) { jours.push(versIso(d)); d.setDate(d.getDate() + 1); }
    semaines.push(jours);
    if (d > dernier) break;
  }
  return semaines;
}

// Les barres d'une semaine, rangées en couloirs.
// Les tronçons à dessiner entre deux dates : un seul pour un chantier, un par
// plage de jours ouvrés pour une formation.
//
// ⚠ LE REPLI EXISTE POUR QU'UNE LIGNE NE DISPARAISSE JAMAIS DU PLANNING. Une
// formation posée entièrement sur des jours non ouvrés — une ligne ancienne,
// saisie avant la règle du 11/11, ou un samedi au dimanche — n'a aucune plage
// ouvrée : sans ce repli elle n'aurait plus une seule barre, et son absence se
// lirait comme une suppression. On la montre alors d'un tenant.
const tronconsDe = (c, de, a) => {
  if (!estFormation(c)) return [[de, a]];
  const p = plagesOuvrees(de, a);
  return p.length ? p : [[de, a]];
};

function barresDe(semaine, chantiers) {
  const [lundi, dimanche] = [semaine[0], semaine[6]];
  const morceaux = chantiers
    .map((c, i) => ({ c, i, fin: finDe(c) }))
    .filter(x => x.c.date_debut <= dimanche && x.fin >= lundi)
    // ⚠ UNE FORMATION SE COUPE SUR LES JOURS NON OUVRÉS (11/11/2026, Élodie :
    // « si la formation dure 4 jours du jeudi au mardi enlève la barre de
    // suivi sur le week-end, ça porte à confusion »). Un morceau par plage de
    // jours ouvrés, au lieu d'un seul qui irait jusqu'au dimanche. Un chantier
    // garde sa barre d'un seul tenant : on y travaille le samedi.
    .flatMap(x => {
      const de = x.c.date_debut < lundi ? lundi : x.c.date_debut;
      const a = x.fin > dimanche ? dimanche : x.fin;
      const avant = x.c.date_debut < lundi, apres = x.fin > dimanche;
      if (!estFormation(x.c)) {
        return [{ ...x, col: semaine.indexOf(de) + 1, fin_col: semaine.indexOf(a) + 2,
          suite: avant, continue: apres }];
      }
      const plages = tronconsDe(x.c, de, a);
      // ⚠ `suite` ET `continue` NE DISENT PLUS SEULEMENT « LA SEMAINE
      // D'AVANT / D'APRÈS » : ils disent « ce bord n'est pas le bout de la
      // barre ». C'est ce qui coupe l'arrondi entre deux plages et, surtout,
      // ce qui empêche une POIGNÉE de pousser au milieu d'une formation —
      // tirer depuis un bord intérieur aurait changé la fin sans qu'on voie
      // quel bout on tenait.
      return plages.map(([p0, p1], n) => ({ ...x,
        col: semaine.indexOf(p0) + 1, fin_col: semaine.indexOf(p1) + 2,
        suite: n > 0 || avant,
        continue: n < plages.length - 1 ? true : apres }));
    })
    .sort((p, q) => p.col - q.col || (q.fin_col - q.col) - (p.fin_col - p.col));
  const couloirs = [];                                   // fin_col occupée par couloir
  // ⚠ LES MORCEAUX D'UNE MÊME LIGNE RESTENT SUR LE MÊME COULOIR : sans ça, les
  // deux bouts d'une formation coupée par un week-end pouvaient tomber sur
  // deux rangs différents et se lire comme deux formations.
  const couloirDe = new Map();
  for (const m of morceaux) {
    const deja = couloirDe.get(m.c.id);
    if (deja !== undefined) { m.couloir = deja; couloirs[deja - 2] = m.fin_col; continue; }
    let k = couloirs.findIndex(fin => fin <= m.col);
    if (k === -1) { k = couloirs.length; couloirs.push(0); }
    couloirs[k] = m.fin_col;
    m.couloir = k + 2;                                   // ligne 1 = numéros des jours
    couloirDe.set(m.c.id, m.couloir);
  }
  return { morceaux, nb: couloirs.length };
}

// ⚠ LE CALENDRIER DU MOIS A REÇU LE MÊME VISUEL QUE LA FRISE (11/11/2026,
// Élodie : « pour le planning mois je voudrais aussi que ce soit moderne et
// dynamique ») : pilules en dégradé qui s'allongent à l'ouverture, terminés
// en gris, à venir hachurés, jour courant surligné, « + » au survol d'un jour.
// Et une POIGNÉE au bout droit de chaque barre (direction seule) pour tirer
// la fin du chantier à la souris.
function calendrier(annee, mois, chantiers) {
  const auj = aujourdhui();
  const direction = scope.isDirection;
  let k = 0;
  return `
    <div class="pl-cal pl-entree">
      <div class="pl-cal-tete">${JOURS.map(j => `<div>${j}</div>`).join('')}</div>
      ${semainesDu(annee, mois).map(semaine => {
        const { morceaux, nb } = barresDe(semaine, chantiers);
        return `
        <div class="pl-sem" style="grid-template-rows: 30px repeat(${Math.max(nb, 1)}, 26px) minmax(10px, 1fr)">
          ${semaine.map((iso, k) => {
            const d = versDate(iso);
            const classes = ['pl-jour', d.getMonth() !== mois ? 'hors' : '', iso === auj ? 'auj' : '',
              k >= 5 ? 'we' : ''].filter(Boolean).join(' ');
            return `<button type="button" class="${classes}" style="grid-column:${k + 1}"
              data-jour="${iso}" title="Planifier un chantier le ${esc(dateLongue(iso))}">
              <span>${d.getDate()}</span></button>`;
          }).join('')}
          ${morceaux.map(m => {
            // ⚠ L'AVANCÉE JOUR PAR JOUR (11/11/2026, Élodie : « un curseur qui
            // se remplit jour par jour pour voir l'avancée des travaux »). Chaque
            // morceau de barre se remplit jusqu'à aujourd'hui inclus : plein =
            // jours passés, éclairci = jours à venir, un trait blanc marque le
            // bord. Le morceau qui contient aujourd'hui porte « jour n / total ».
            const e = etatDe(m.c);
            const debutSeg = semaine[m.col - 1], finSeg = semaine[m.fin_col - 2];
            const longueur = m.fin_col - m.col;
            const faits = auj < debutSeg ? 0 : auj > finSeg ? longueur
              : Math.round((versDate(auj) - versDate(debutSeg)) / 86400000) + 1;
            const av = e.cle === 'encours' ? Math.round(faits / longueur * 100) : e.cle === 'passe' ? 100 : 0;
            const total = Math.max(1, Number(m.c.duree_jours) || 1);
            const jourN = Math.round((versDate(auj) - versDate(m.c.date_debut)) / 86400000) + 1;
            const ici = e.cle === 'encours' && auj >= debutSeg && auj <= finSeg;
            return `<button type="button" class="pl-barre est-${e.cle}${estFormation(m.c) ? ' formation' : ''}${m.suite ? ' suite' : ''}${m.continue ? ' continue' : ''}"
              style="grid-column:${m.col} / ${m.fin_col}; grid-row:${m.couloir}; --pl-c:${couleurDe(m.c, m.i)}; --k:${k++}; --pl-av:${av}%"
              data-chantier="${esc(m.c.id)}"
              title="${esc(`${m.c.titre} — du ${dateLongue(m.c.date_debut)} au ${dateLongue(m.fin)}${
                e.cle === 'encours' ? ` — jour ${jourN} sur ${total} (${Math.round(jourN / total * 100)} %)` : ''}`)}">
              <span class="pl-barre-texte">${m.suite ? '<i>suite</i> ' : ''}${marque(m.c)}${esc(m.c.titre)}</span>${
              ici ? `<em class="pl-barre-jour">J${jourN}/${total}</em>` : ''}${
              direction && !m.continue ? `<span class="pl-poignee" data-poignee="${esc(m.c.id)}" title="Tirer pour changer la fin"></span>` : ''}</button>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>`;
}

// ------------------------------------------------------------ la vue de l'année
// Passé, en cours, à venir : lu sur les dates, au jour près.
function etatDe(c) {
  const auj = aujourdhui();
  if (finDe(c) < auj) return { cle: 'passe', label: 'Terminé' };
  if (c.date_debut > auj) return { cle: 'futur', label: 'À venir' };
  return { cle: 'encours', label: 'En cours' };
}

// ⚠ UNE FRISE CONTINUE QU'ON FAIT GLISSER, PAS UNE ANNÉE (11/11/2026, Élodie :
// « je voudrais que le calendrier annuel puisse se glisser de la gauche vers
// la droite, et je ne veux pas classer par année »). La première version
// montrait janvier → décembre d'une année et changeait d'année aux flèches :
// refusée, ne pas y revenir.
//
// La frise va du mois du plus ancien chantier (au moins 3 mois avant
// aujourd'hui) au mois du plus lointain (au moins 6 mois après), à largeur
// fixe par jour (6 px) : on la fait glisser à la souris, au doigt, ou avec les
// flèches. Elle s'ouvre centrée sur aujourd'hui. La colonne des noms reste
// collée à gauche pendant le glissement.
const PX_JOUR = 6;                                      // ≈ 180 px par mois
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];                                      // ≈ 120 px par mois
const debutDuMois = (iso) => `${iso.slice(0, 7)}-01`;
function bornesFrise(tous) {
  const auj = versDate(aujourdhui());
  let de = versIso(new Date(auj.getFullYear(), auj.getMonth() - 3, 1));
  let a = versIso(new Date(auj.getFullYear(), auj.getMonth() + 7, 0));
  for (const c of tous) {
    if (c.date_debut < de) de = debutDuMois(c.date_debut);
    const f = finDe(c);
    if (f > a) { const d = versDate(f); a = versIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  }
  return { de, a };
}

// Le numéro de semaine ISO (celui des agendas français : la semaine 1 est
// celle qui contient le premier jeudi de janvier).
function semaineIso(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const debutAn = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - debutAn) / 86400000 + 1) / 7);
}

function frise(tous) {
  const { de, a } = bornesFrise(tous);
  const pos = (iso) => Math.round((versDate(iso) - versDate(de)) / 86400000);
  const largeur = (pos(a) + 1) * PX_JOUR;
  const auj = aujourdhui();
  const moisCourant = auj.slice(0, 7);
  const mois = [], bandes = [];
  for (let d = versDate(de); versIso(d) <= a; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const x = pos(versIso(d)) * PX_JOUR;
    const w = (pos(versIso(new Date(d.getFullYear(), d.getMonth() + 1, 1))) - pos(versIso(d))) * PX_JOUR;
    const janvier = d.getMonth() === 0;
    const courant = versIso(d).slice(0, 7) === moisCourant;
    // Une bande par mois, une sur deux teintée : l'œil suit les mois sans
    // lire les traits.
    bandes.push(`<i class="${mois.length % 2 ? 'pair' : ''}${janvier ? ' janvier' : ''}${courant ? ' courant' : ''}" style="left:${x}px; width:${w}px"></i>`);
    mois.push(`<div class="pl-frise-mois${courant ? ' courant' : ''}" style="left:${x}px; width:${w}px"><span>${
      esc(MOIS_COURTS[d.getMonth()])}${janvier || mois.length === 0 ? ` <small>${d.getFullYear()}</small>` : ''}</span></div>`);
  }
  // Les chantiers en cours d'abord, puis à venir, puis terminés : c'est
  // l'ordre dans lequel on les cherche.
  const rang = { encours: 0, futur: 1, passe: 2 };
  const lignes = tous.map((c, i) => ({ c, i, fin: finDe(c), e: etatDe(c) }))
    .sort((x, y) => rang[x.e.cle] - rang[y.e.cle] || String(x.c.date_debut).localeCompare(String(y.c.date_debut)));
  const xAuj = pos(auj) * PX_JOUR + PX_JOUR / 2;
  // ⚠ LA FRISE S'OUVRE TROIS SEMAINES AVANT LA SEMAINE EN COURS (11/11/2026,
  // Élodie : « que l'affichage commence 3 semaines avant la semaine en cours
  // de la date du jour ; là ça commence en août, c'est trop ancien »). Le bord
  // gauche visible est le lundi de la semaine en cours moins 21 jours. On peut
  // toujours la faire glisser vers les chantiers plus anciens.
  const lundiAuj = versDate(auj);
  lundiAuj.setDate(lundiAuj.getDate() - ((lundiAuj.getDay() + 6) % 7) - 21);
  const xDepart = Math.max(0, pos(versIso(lundiAuj)) * PX_JOUR);
  // ⚠ LES NUMÉROS DE SEMAINE (11/11/2026, Élodie : « sur la frise de tous les
  // chantiers je voudrais avoir le numéro des semaines »). Une case par
  // semaine, du lundi au dimanche, sous la ligne des mois ; la semaine en
  // cours est surlignée, et un trait léger marque chaque lundi dans la frise.
  const semaines = [], lundis = [];
  const premierLundi = versDate(de);
  premierLundi.setDate(premierLundi.getDate() - ((premierLundi.getDay() + 6) % 7));
  for (let d = new Date(premierLundi); versIso(d) <= a; d.setDate(d.getDate() + 7)) {
    const x = pos(versIso(d)) * PX_JOUR;
    const n = semaineIso(d);
    const dimanche = new Date(d); dimanche.setDate(d.getDate() + 6);
    const courante = auj >= versIso(d) && auj <= versIso(dimanche);
    semaines.push(`<div class="pl-frise-sem${courante ? ' courante' : ''}" style="left:${x}px; width:${7 * PX_JOUR}px"
      title="Semaine ${n} — du ${esc(dateCourte(versIso(d)))} au ${esc(dateCourte(versIso(dimanche)))}">S${n}</div>`);
    if (x > 0) lundis.push(`<b style="left:${x}px"></b>`);
  }
  return `
    <div class="pl-frise-defile" data-auj="${xAuj}" data-depart="${xDepart}">
      <div class="pl-frise" style="--pl-larg:${largeur}px">
        <div class="pl-frise-ligne pl-frise-tete"><div class="pl-frise-nom"><span>${lignes.length} au planning</span></div>
          <div class="pl-frise-piste">${mois.join('')}
            <div class="pl-frise-semaines">${semaines.join('')}</div>
            <div class="pl-frise-auj-pastille" style="left:${xAuj}px">Aujourd’hui</div></div></div>
        ${lignes.length ? lignes.map((x, k) => {
          const jours = pos(x.fin) - pos(x.c.date_debut) + 1;
          const w = jours * PX_JOUR;
          // En cours : la part déjà écoulée se lit dans la barre.
          const ecoule = x.e.cle === 'encours' ? Math.min(100, Math.round((pos(auj) - pos(x.c.date_debut) + 1) / jours * 100)) : 0;
          const etiquette = x.e.cle === 'encours' ? `${ecoule} %` : x.e.cle === 'futur'
            ? `dans ${pos(x.c.date_debut) - pos(auj)} j` : 'terminé';
          // ⚠ UNE FORMATION EST DESSINÉE EN UNE PILULE PAR PLAGE DE JOURS
          // OUVRÉS (11/11/2026, Élodie). Le week-end n'est plus barré : on voit
          // « deux jours, puis deux jours » au lieu d'une barre de six qui
          // laissait croire qu'on se forme le samedi.
          const plages = tronconsDe(x.c, x.c.date_debut, x.fin);
          // Le nom ne s'écrit qu'une fois, sur la plage la plus large : répété
          // sur chaque bout il se lirait comme plusieurs formations.
          const large = plages.reduce((meilleur, p, n) =>
            (pos(p[1]) - pos(p[0])) > (pos(plages[meilleur][1]) - pos(plages[meilleur][0])) ? n : meilleur, 0);
          return `<div class="pl-frise-ligne" style="--k:${k}">
          <div class="pl-frise-nom"><b><i class="pl-frise-puce est-${x.e.cle}" style="--pl-c:${couleurDe(x.c, x.i)}"></i>${marque(x.c)}${esc(x.c.titre)}</b>
            <span>${esc(dateCourte(x.c.date_debut))} → ${esc(dateCourte(x.fin))} · ${esc(dureeLue(x.c).texte)}</span></div>
          <div class="pl-frise-piste">
            ${plages.map(([p0, p1], n) => {
              const jp = pos(p1) - pos(p0) + 1;
              const wp = jp * PX_JOUR;
              // L'avancée se lit plage par plage : celle qui est passée est
              // pleine, celle qui vient est vide, même un samedi entre les deux.
              const av = x.e.cle === 'encours'
                ? Math.max(0, Math.min(100, Math.round((pos(auj) - pos(p0) + 1) / jp * 100))) : 0;
              const porteNom = n === large;
              // ⚠ LA POIGNÉE NE VA QUE SUR LE DERNIER BOUT : au milieu d'une
              // formation, tirer aurait changé la fin sans qu'on voie quel
              // bord on tenait.
              const derniere = n === plages.length - 1;
              return `<button type="button" class="pl-frise-barre est-${x.e.cle}${estFormation(x.c) ? ' formation' : ''}${wp < 70 || !porteNom ? ' etroite' : ''}"
              style="left:${pos(p0) * PX_JOUR}px; width:${wp}px; --pl-c:${couleurDe(x.c, x.i)}; --pl-av:${av}%"
              data-chantier="${esc(x.c.id)}" title="${esc(`${x.c.titre} — ${x.e.label.toLowerCase()} — du ${dateLongue(x.c.date_debut)} au ${dateLongue(x.fin)}`)}">
              ${porteNom ? `<span class="pl-frise-texte">${marque(x.c)}${esc(x.c.titre)}</span>` : ''}${
              porteNom && wp >= 160 ? `<em>${esc(etiquette)}</em>` : ''}${
              scope.isDirection && derniere ? `<span class="pl-poignee" data-poignee="${esc(x.c.id)}" title="Tirer pour changer la fin"></span>` : ''}</button>`;
            }).join('')}
          </div></div>`;
        }).join('')
          : '<div class="pl-frise-ligne"><div class="pl-frise-nom"><span>Aucun chantier planifié.</span></div><div class="pl-frise-piste"></div></div>'}
        <div class="pl-frise-fond">${bandes.join('')}${lundis.join('')}<div class="pl-frise-auj" style="left:${xAuj}px"></div></div>
      </div>
    </div>`;
}

// ⚠ LA FRISE DÉFILE À LA MOLETTE DE LA SOURIS (11/11/2026, Élodie : « je
// voudrais défiler les mois de la frise avec la souris »). La molette, qui
// fait d'ordinaire monter et descendre, fait glisser la frise de gauche à
// droite tant que le pointeur est dessus ; arrivée au bout, elle rend la main
// à la page. Le défilement est animé ici (et non par `behavior: 'smooth'`,
// que certains navigateurs ignorent).
// Le glissement « clic maintenu » reste possible, et au doigt le navigateur
// fait défiler tout seul. Un glissement de plus de 5 px n'ouvre pas la barre
// sur laquelle on a lâché.
// La position de la frise survit au redessin (après un étirement, une
// modification) : la recentrer sur aujourd'hui ferait perdre l'endroit où
// l'on travaillait. Elle ne se centre qu'à la première ouverture.
let friseGauche = null;
function brancherFrise(root, centrer) {
  const boite = root.querySelector('.pl-frise-defile');
  if (!boite) return;
  boite.addEventListener('scroll', () => { friseGauche = boite.scrollLeft; }, { passive: true });
  if (friseGauche !== null && !centrer) boite.scrollLeft = friseGauche;
  const max = () => boite.scrollWidth - boite.clientWidth;
  let cible = boite.scrollLeft, anim = 0;
  const glisserVers = (x) => {
    cible = Math.max(0, Math.min(max(), x));
    if (anim) return;
    const pas = () => {
      const ecart = cible - boite.scrollLeft;
      if (Math.abs(ecart) < 1) { boite.scrollLeft = cible; anim = 0; return; }
      boite.scrollLeft += ecart * 0.22;
      anim = requestAnimationFrame(pas);
    };
    anim = requestAnimationFrame(pas);
  };
  boite.glisserVers = glisserVers;
  if (centrer) { boite.scrollLeft = Number(boite.dataset.depart); cible = boite.scrollLeft; }

  boite.addEventListener('wheel', (e) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const base = anim ? cible : boite.scrollLeft;
    const auBout = (delta < 0 && base <= 0) || (delta > 0 && base >= max() - 1);
    if (auBout) return;                                  // la page reprend la main
    e.preventDefault();
    glisserVers(base + delta * (e.deltaMode === 1 ? 40 : 1.4));
  }, { passive: false });

  let depart = null;
  boite.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('[data-poignee]')) return;      // on étire une barre, on ne fait pas glisser
    if (scope.isDirection && e.target.closest('.pl-frise-barre')) return;   // on déplace une barre
    cancelAnimationFrame(anim); anim = 0;
    depart = { x: e.clientX, gauche: boite.scrollLeft, bouge: false };
    boite.classList.add('saisie');
  });
  boite.addEventListener('pointermove', (e) => {
    if (!depart) return;
    const dx = e.clientX - depart.x;
    // La capture n'est prise qu'une fois le glissement commencé : prise dès
    // l'appui, elle volerait le clic aux barres.
    if (Math.abs(dx) > 5 && !depart.bouge) { depart.bouge = true; boite.setPointerCapture(e.pointerId); }
    boite.scrollLeft = depart.gauche - dx;
    cible = boite.scrollLeft;
  });
  boite.addEventListener('pointerup', () => {
    if (!depart) return;
    if (depart.bouge) boite.dataset.glisse = '1';
    depart = null;
    boite.classList.remove('saisie');
    setTimeout(() => { delete boite.dataset.glisse; }, 0);
  });
}

// ------------------------------------------------------------ tirer la fin à la souris
// Un appui sur la poignée, on tire, on lâche : la nouvelle fin s'enregistre.
// Pendant le geste, une bulle dit la date de fin et la durée, et :
//   · dans le MOIS, les jours couverts s'éclairent (on vise un jour de la
//     grille, d'une semaine à l'autre) ;
//   · dans la FRISE, la barre s'allonge au jour près (6 px par jour).
// Le clic qui suit un étirement n'ouvre pas la fiche.
function brancherPoignees(root, apres) {
  const bulle = document.createElement('div');
  bulle.className = 'pl-bulle';
  root.querySelectorAll('[data-poignee]').forEach(h => {
    h.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); });
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const c = db.byId('rgd_planning', h.dataset.poignee);
      if (!c) return;
      const barre = h.closest('[data-chantier]');
      const enFrise = !!barre.closest('.pl-frise');
      const finInitiale = finDe(c);
      const x0 = e.clientX, largeur0 = barre.offsetWidth;
      let fin = finInitiale;
      try { h.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      document.body.appendChild(bulle);
      document.body.classList.add('pl-etire');
      barre.classList.add('etiree');
      const jours = () => Math.round((versDate(fin) - versDate(c.date_debut)) / 86400000) + 1;
      const montrer = (ev) => {
        const n = jours();
        bulle.innerHTML = `<b>Fin : ${esc(dateLongue(fin))}</b><span>${n} jour${n > 1 ? 's' : ''}</span>`;
        bulle.style.left = `${ev.clientX + 14}px`; bulle.style.top = `${ev.clientY + 16}px`;
      };
      const eclairer = () => root.querySelectorAll('[data-jour]').forEach(j =>
        j.classList.toggle('apercu', j.dataset.jour >= c.date_debut && j.dataset.jour <= fin));
      const bouger = (ev) => {
        if (enFrise) {
          const dj = Math.round((ev.clientX - x0) / PX_JOUR);
          fin = ajouterJours(finInitiale, dj);
          if (fin < c.date_debut) fin = c.date_debut;
          barre.style.width = `${Math.max(PX_JOUR, largeur0 + (Math.round((versDate(fin) - versDate(finInitiale)) / 86400000)) * PX_JOUR)}px`;
        } else {
          const sous = document.elementsFromPoint(ev.clientX, ev.clientY).find(el => el.dataset && el.dataset.jour);
          if (sous) fin = sous.dataset.jour < c.date_debut ? c.date_debut : sous.dataset.jour;
          eclairer();
        }
        montrer(ev);
      };
      const lacher = async () => {
        h.removeEventListener('pointermove', bouger);
        h.removeEventListener('pointerup', lacher);
        h.removeEventListener('pointercancel', lacher);
        bulle.remove();
        document.body.classList.remove('pl-etire');
        barre.classList.remove('etiree');
        root.querySelectorAll('.apercu').forEach(j => j.classList.remove('apercu'));
        if (fin === finInitiale) { if (enFrise) barre.style.width = `${largeur0}px`; return; }
        try {
          await changerFin(c, fin);
          const n = jours();
          toast(`« ${c.titre} » : fin le ${dateLongue(fin)} (${n} jour${n > 1 ? 's' : ''})`);
        } catch (err) { toast(err.message, 'error'); }
        apres();
      };
      h.addEventListener('pointermove', bouger);
      h.addEventListener('pointerup', lacher);
      h.addEventListener('pointercancel', lacher);
      montrer(e);
      if (!enFrise) eclairer();
    });
  });
}

// ------------------------------------------------------------ déplacer à la souris
// On attrape une barre et on la tire : le chantier se décale, sa durée ne
// change pas. Le geste ne démarre qu'au-delà de 5 px, sinon c'est un clic qui
// ouvre la fiche. Pendant le geste, une bulle dit « du … au … » et :
//   · dans le MOIS, on vise un jour de la grille (le jour attrapé dans la
//     barre suit le pointeur), et les jours couverts s'éclairent ;
//   · dans la FRISE, la barre suit la souris au jour près.
function brancherDeplacement(root, apres) {
  const bulle = document.createElement('div');
  bulle.className = 'pl-bulle';
  const jourSous = (x, y) => document.elementsFromPoint(x, y).find(el => el.dataset && el.dataset.jour)?.dataset.jour || null;
  const ecart = (de, a) => Math.round((versDate(a) - versDate(de)) / 86400000);
  root.querySelectorAll('[data-chantier].pl-barre, [data-chantier].pl-frise-barre').forEach(barre => {
    barre.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('[data-poignee]')) return;
      const c = db.byId('rgd_planning', barre.dataset.chantier);
      if (!c) return;
      e.stopPropagation();
      const enFrise = barre.classList.contains('pl-frise-barre');
      const duree = Math.max(1, Number(c.duree_jours) || 1);
      const x0 = e.clientX, gauche0 = barre.offsetLeft;
      // Dans le mois : quel jour du chantier a-t-on attrapé ?
      const attrape = enFrise ? null : jourSous(e.clientX, e.clientY);
      const decalage = attrape ? ecart(c.date_debut, attrape) : 0;
      let debut = c.date_debut, parti = false;
      // ⚠ AU DOIGT, UN APPUI COURT ARME LE GESTE (11/11/2026, Élodie : « je
      // veux pouvoir déplacer avec le doigt mais il faut rester appuyé
      // longtemps et ça sélectionne le texte »). Le doigt qui glisse tout de
      // suite fait défiler la page, comme partout ; resté posé un quart de
      // seconde, il attrape la barre (petite vibration, la barre se soulève)
      // et le défilement est bloqué jusqu'au lâcher. La sélection de texte et
      // le menu de l'appui long sont coupés dans `css/mobile.css`.
      const auDoigt = e.pointerType && e.pointerType !== 'mouse';
      let pret = !auDoigt;
      const minuteur = auDoigt ? setTimeout(() => {
        pret = true;
        barre.classList.add('attrapee');
        try { navigator.vibrate?.(12); } catch { /* pas de vibreur */ }
      }, 250) : null;
      const bloquerDefilement = (ev) => { if (pret) ev.preventDefault(); };
      if (auDoigt) document.addEventListener('touchmove', bloquerDefilement, { passive: false });
      const montrer = (ev) => {
        const fin = ajouterJours(debut, duree - 1);
        bulle.innerHTML = `<b>Du ${esc(dateLongue(debut))}</b><span>au ${esc(dateLongue(fin))} · ${duree} jour${duree > 1 ? 's' : ''}</span>`;
        bulle.style.left = `${ev.clientX + 14}px`; bulle.style.top = `${ev.clientY + 16}px`;
      };
      const eclairer = () => {
        const fin = ajouterJours(debut, duree - 1);
        root.querySelectorAll('[data-jour]').forEach(j => j.classList.toggle('apercu', j.dataset.jour >= debut && j.dataset.jour <= fin));
      };
      const bouger = (ev) => {
        if (!parti) {
          if (Math.abs(ev.clientX - x0) < 6 && Math.abs(ev.clientY - e.clientY) < 6) return;
          // Le doigt a bougé avant d'avoir attrapé la barre : c'est un
          // défilement, on le laisse faire et on abandonne le geste.
          if (!pret) { ranger(); return; }
          parti = true;
          try { barre.setPointerCapture(ev.pointerId); } catch { /* pointeur relâché */ }
          document.body.appendChild(bulle);
          document.body.classList.add('pl-deplace');
          barre.classList.add('deplacee');
        }
        if (enFrise) {
          const dj = Math.round((ev.clientX - x0) / PX_JOUR);
          debut = ajouterJours(c.date_debut, dj);
          barre.style.left = `${gauche0 + dj * PX_JOUR}px`;
        } else {
          const j = jourSous(ev.clientX, ev.clientY);
          if (j) debut = ajouterJours(j, -decalage);
          eclairer();
        }
        montrer(ev);
      };
      const ranger = () => {
        clearTimeout(minuteur);
        barre.classList.remove('attrapee');
        document.removeEventListener('touchmove', bloquerDefilement);
        window.removeEventListener('pointermove', bouger);
        window.removeEventListener('pointerup', lacher);
        window.removeEventListener('pointercancel', lacher);
      };
      const lacher = async () => {
        ranger();
        if (!parti) return;                              // un simple clic : la fiche s'ouvre
        root.dataset.deplace = '1';
        setTimeout(() => { delete root.dataset.deplace; }, 0);
        bulle.remove();
        document.body.classList.remove('pl-deplace');
        barre.classList.remove('deplacee');
        root.querySelectorAll('.apercu').forEach(j => j.classList.remove('apercu'));
        if (debut === c.date_debut) { if (enFrise) barre.style.left = `${gauche0}px`; return; }
        try {
          await deplacerChantier(c, debut);
          toast(`« ${c.titre} » : du ${dateLongue(debut)} au ${dateLongue(ajouterJours(debut, duree - 1))}`);
        } catch (err) { toast(err.message, 'error'); }
        apres();
      };
      window.addEventListener('pointermove', bouger);
      window.addEventListener('pointerup', lacher);
      window.addEventListener('pointercancel', lacher);
    });
  });
}

// ------------------------------------------------------------ la fiche chantier
function formulaire(c, defaut = {}) {
  // Une formation (11/11/2026) : même fiche, sans dossier client ni listes ;
  // l'organisme ou le lieu à la place du dossier, des participants à la
  // place du partage.
  const formation = c ? estFormation(c) : defaut.genre === 'formation';
  const actuel = c ? cleDe(c) : '';
  const choix = formation ? [] : rattachements(actuel);
  const retenu = choix.flatMap(g => g.dossiers).find(x => x.cle === actuel);
  // L'équipe avec qui partager : les membres RGD qui ne sont pas la direction
  // (chargés d'affaires, ouvrier). La direction voit tout, la cocher n'a pas de sens.
  // Pour une formation, toute l'équipe, direction comprise : on note qui y va.
  const equipe = formation ? scope.candidatsRgd() : scope.chargesRgd();
  const partage = new Set(c?.partage_avec || []);
  const duree = c ? dureeLue(c) : { nombre: 1, unite: 'jours' };
  const couleur = c?.couleur || '';
  const nom = formation ? 'la formation' : 'le chantier';
  return `
    ${'' /* ⚠ FORMULAIRE RESSERRÉ (11/11/2026, Élodie : « remonter toutes les
       infos pour laisser de la place en bas » — la place servira aux cahiers
       des charges ouvriers / clients). Trois rangs : Chantier + Dossier ;
       Début + Durée + Couleur ; Notes + Partage. L'adresse n'est plus un
       champ : elle est reprise du dossier choisi (champ caché), et reste
       affichée sous le nom du dossier. */}
    <form class="pl-form${formation ? ' est-formation' : ''}" id="pl-form">
      <input type="hidden" name="genre" value="${formation ? 'formation' : 'chantier'}">
      ${formation ? `
      <div class="pl-rang pl-rang-1">
      <label class="pl-champ"><span>Formation</span>
        <input name="titre" required value="${esc(c?.titre || '')}" placeholder="Ex. Habilitation électrique B1V"></label>
      <label class="pl-champ"><span>Organisme / lieu</span>
        <input name="adresse" value="${esc(c?.adresse || '')}" placeholder="Ex. AFPA Compiègne"></label>
      <input type="hidden" name="rattachement" value="">
      </div>` : `
      <input type="hidden" name="adresse" value="${esc(c?.adresse || '')}">
      <div class="pl-rang pl-rang-1">
      <label class="pl-champ"><span>Chantier</span>
        <input name="titre" required value="${esc(c?.titre || '')}" placeholder="Ex. Rénovation salle de bain — Dupont"></label>
      <div class="pl-champ"><span>Dossier client</span>
        <input type="hidden" name="rattachement" value="${esc(actuel)}">
        ${'' /* ⚠ LE SÉLECTEUR SE REPLIE UNE FOIS UN DOSSIER CHOISI (11/11/2026,
           Élodie : « lorsque l'on clique sur un dossier client, la liste
           déroulante se ferme »). Replié, il montre le dossier retenu et
           deux boutons : Changer, Retirer. */}
        <div class="pl-choix${retenu ? ' replie' : ''}">
          <div class="pl-choix-retenu">
            <div><b>${esc(retenu?.nom || '')}</b>${retenu?.projet ? `<span>${esc(retenu.projet)}</span>` : ''}${
              retenu?.adresse ? `<em>${esc(retenu.adresse)}</em>` : ''}</div>
            <button type="button" class="btn ghost sm" data-changer>Changer</button>
            <button type="button" class="btn ghost sm" data-aucun>Retirer</button>
          </div>
          <div class="pl-choix-tete">
            <input type="search" class="pl-cherche" placeholder="Rechercher un client ou un projet…" aria-label="Rechercher un dossier">
          </div>
          <div class="pl-choix-liste">
            ${choix.length ? choix.map(g => `
            <div class="pl-groupe">
              <div class="pl-groupe-titre">${esc(g.label)} <span>${g.dossiers.length}</span></div>
              ${g.dossiers.map(x => `<button type="button" class="pl-dossier${x.cle === actuel ? ' choisi' : ''}"
                  data-cle="${esc(x.cle)}" data-adresse="${esc(x.adresse)}" data-nom="${esc(x.nom)}" data-projet="${esc(x.projet)}"
                  data-texte="${esc(`${x.nom} ${x.projet} ${x.adresse}`.toLowerCase())}">
                <b>${esc(x.nom)}</b>${x.projet ? `<span>${esc(x.projet)}</span>` : ''}${x.adresse ? `<em>${esc(x.adresse)}</em>` : ''}
              </button>`).join('')}
            </div>`).join('')
            : '<p class="muted small">Aucun dossier en « Devis en cours », « Devis envoyé » ou « Devis accepté ».</p>'}
            <p class="muted small pl-rien" hidden>Aucun dossier ne correspond à cette recherche.</p>
          </div>
        </div></div>
      </div>`}
      <div class="pl-rang pl-rang-2">
      <label class="pl-champ"><span>Début</span>
        <input type="date" name="date_debut" required value="${esc(c?.date_debut || defaut.date_debut || '')}"></label>
      <div class="pl-champ"><span>Durée</span>
        <div class="pl-duree">
          <input type="number" name="duree_nombre" min="1" max="366" required value="${esc(String(duree.nombre))}" aria-label="Nombre">
          ${'' /* ⚠ UNE FORMATION SE COMPTE EN JOURS OUVRÉS OU EN SEMAINES
             (11/11/2026, Élodie). « Mois » a quitté son menu : un mois de
             formation en jours ouvrés n'a pas de définition qui tienne — 20
             jours ? 22 ? Quatre semaines le disent sans ambiguïté. */}
          <select name="duree_unite" aria-label="Unité">
            ${Object.entries(UNITES).filter(([k]) => !formation || UNITES_FORMATION.includes(k))
              .map(([k, u]) => `<option value="${k}"${duree.unite === k ? ' selected' : ''}>${
                esc(formation && k === 'jours' ? 'jours ouvrés' : u.plusieurs)}</option>`).join('')}
          </select>
        </div></div>
      <div class="pl-champ"><span>Couleur</span>
        ${formation ? `<div class="pl-couleurs"><input type="hidden" name="couleur" value="">
          <span class="pl-pastille"><i style="background:${COULEUR_FORMATION}"></i>Couleur des formations</span></div>` : `
        <div class="pl-couleurs">
          <label class="pl-pastille auto" title="Automatique"><input type="radio" name="couleur" value=""${!COULEURS.includes(couleur) ? ' checked' : ''}><i style="background:conic-gradient(${COULEURS.slice(0, 4).join(', ')}, ${COULEURS[0]})"></i></label>
          ${COULEURS.map(k => `<label class="pl-pastille"><input type="radio" name="couleur" value="${k}"${couleur === k ? ' checked' : ''}><i style="background:${k}"></i></label>`).join('')}
        </div>`}</div>
      <p class="pl-fin" id="pl-fin"></p>
      </div>
      <div class="pl-rang pl-rang-3">
      <label class="pl-champ"><span>Notes</span>
        <textarea name="notes" rows="2">${esc(c?.notes || '')}</textarea></label>
      <div class="pl-champ"><span>${formation ? 'Participants' : 'Partager avec'}</span>
        ${equipe.length ? `<div class="pl-partage">
          ${equipe.map(u => `<label class="pl-membre"><input type="checkbox" name="partage" value="${esc(u.id)}"${
            partage.has(u.id) ? ' checked' : ''}><span>${esc(u.full_name || u.email || 'Sans nom')}</span></label>`).join('')}
        </div>
        <small class="muted">${formation
          ? 'La formation apparaît dans le planning de chaque participant.'
          : 'La personne voit ce chantier dans son planning et peut cocher ses listes ; elle ne change ni les dates ni le dossier.'}</small>`
        : '<small class="muted">Personne dans l’équipe RGD à qui le partager.</small>'}
      </div>
      </div>
      <div class="form-actions">
        ${c ? `<button type="button" class="btn danger ghost" id="pl-suppr">Supprimer ${nom}</button>` : ''}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-close>Fermer</button>
        <button type="submit" class="btn primary">${c ? 'Enregistrer' : `Créer ${nom}`}</button>
      </div>
    </form>`;
}

function blocListe(c, liste) {
  const lignes = lignesDe(c.id, liste);
  const faits = lignes.filter(l => l.deja_la || l.achete).length;
  return `
    <section class="pl-liste" data-liste="${liste}">
      <div class="pl-liste-tete">
        <h3>${esc(LISTES[liste].label)}</h3>
        <span class="pl-liste-compte">${faits} / ${lignes.length} prêts</span>
        <span class="grow"></span>
        <button type="button" class="btn ghost sm" data-standard="${liste}">+ Liste standard</button>
      </div>
      ${lignes.length ? `
      <div class="pl-lignes">
        <div class="pl-ligne pl-ligne-tete"><span>En stock</span><span>Acheté</span><span>${esc(LISTES[liste].label)}</span><span>Quantité</span><span></span></div>
        ${lignes.map(l => `
        <div class="pl-ligne${l.deja_la || l.achete ? ' fait' : ''}" data-ligne="${esc(l.id)}">
          <label class="pl-case" title="On l’a déjà"><input type="checkbox" data-case="deja_la"${l.deja_la ? ' checked' : ''}></label>
          <label class="pl-case" title="Acheté"><input type="checkbox" data-case="achete"${l.achete ? ' checked' : ''}></label>
          <input class="pl-libelle" data-champ="libelle" value="${esc(l.libelle)}" aria-label="Libellé">
          <input class="pl-qte" data-champ="quantite" value="${esc(l.quantite || '')}" placeholder="—" aria-label="Quantité">
          ${scope.isDirection ? '<button type="button" class="icon-btn" data-retirer title="Retirer la ligne">✕</button>' : '<span></span>'}
        </div>`).join('')}
      </div>` : `<p class="muted small">Rien pour l’instant : ajoutez la liste standard, ou une ligne ci-dessous.</p>`}
      <form class="pl-ajout" data-ajout="${liste}">
        <input placeholder="Ajouter un ${esc(LISTES[liste].court)}…" aria-label="Ajouter une ligne">
        <button type="submit" class="btn sm">Ajouter</button>
      </form>
    </section>`;
}

// Ce que voit un membre de l'équipe avec qui le chantier est partagé : le
// chantier en lecture, puis les listes (qu'il peut cocher).
function resume(c) {
  const r = rattachementDe(c);
  const ligne = (q, v) => (v ? `<div><span>${esc(q)}</span><b>${esc(v)}</b></div>` : '');
  const formation = estFormation(c);
  const qui = formation ? (c.partage_avec || []).map(id => scope.users().find(u => u.id === id))
    .filter(Boolean).map(u => u.full_name || u.email).join(', ') : '';
  return `<div class="pl-resume">
    ${formation ? '' : ligne('Dossier', r?.nom)}
    ${ligne('Du', dateLongue(c.date_debut))}${ligne('Au', dateLongue(finDe(c)))}
    ${ligne('Durée', dureeLue(c).texte)}${ligne(formation ? 'Organisme / lieu' : 'Adresse', c.adresse)}${
    ligne('Participants', qui)}${ligne('Notes', c.notes)}
  </div>`;
}

function ouvrirChantier(c, apres, jour = null, genre = 'chantier') {
  const formation = c ? estFormation(c) : genre === 'formation';
  if (c && !scope.isDirection) {
    const m = openModal(c.titre, `${resume(c)}
      ${formation ? '' : `<div class="pl-listes">${blocListe(c, 'materiaux')}${blocListe(c, 'outils')}</div>`}
      <div class="form-actions">${formation ? '' : '<button type="button" class="btn ghost" id="pl-cahier">Cahier des charges</button>'}<span class="grow"></span><button type="button" class="btn ghost" data-close>Fermer</button></div>`,
      { wide: true, onClose: apres });
    if (!formation) brancherListesDe(m, c);
    brancherCahier(m, c, apres);
    return;
  }
  const r = c && rattachementDe(c);
  // ⚠ « CHANTIER TERMINÉ » EST UNE ACTION, PAS UN CHAMP (12/11/2026, Élodie :
  // « un bouton pour déclarer la fin du chantier et déclencher le SMS des avis
  // google »). Il vit donc dans le bandeau du haut, avec le cahier des
  // charges, et non parmi les cases du formulaire : une case à cocher
  // « terminé » se serait enregistrée avec le reste, en silence, alors que ce
  // geste envoie un SMS chez un client.
  //
  // ⚠ DIRECTION SEULEMENT, comme les dates : un chargé d'affaires voit le
  // chantier partagé, il ne décide pas qu'il est fini ni n'écrit au client.
  // ⚠ ET PAS SUR UNE FORMATION : on ne demande pas d'avis Google à un
  // organisme de formation.
  const finissable = c && !formation && scope.isDirection;
  const corps = () => `
    ${r || (c && !formation) ? `<p class="pl-lien">${r ? `Fiche : <button type="button" class="btn ghost sm" id="pl-fiche">${esc(r.nom)}</button>` : ''}
      ${c && !formation ? '<button type="button" class="btn sm pl-btn-cahier" id="pl-cahier">Cahier des charges</button>' : ''}
      ${'' /* ⚠ « Chantier terminé » EST POUSSÉ À DROITE ET IL EST VERT
         (12/11/2026, Élodie : « je voudrais qu'il soit en haut à droite et
         d'un design qui se distingue des autres boutons »). Il n'ouvre pas un
         écran de plus comme ses voisins : il CLÔT le chantier et écrit à un
         client. Le ranger à côté d'eux, dans la même teinte, le faisait lire
         comme un onglet. Le vert plutôt que l'orange, déjà pris par les
         actions de création, et plutôt que le rouge, qui annoncerait un
         danger là où il n'y a qu'une fin. */}
      ${finissable ? `<span class="pl-pousse"></span>${estTermine(c)
        ? `<span class="muted small">Terminé le ${esc(dateCourte(c.fin_reelle))}${
            c.avis_demande ? ' · avis demandé' : ''}</span>
           <button type="button" class="btn ghost sm" id="pl-rouvrir">Rouvrir</button>`
        : '<button type="button" class="btn sm green pl-btn-fini" id="pl-fini">✓ Chantier terminé</button>'}` : ''}</p>` : ''}
    ${formulaire(c, { date_debut: jour || aujourdhui(), genre })}
    ${formation ? '' : c ? `<div class="pl-listes">${blocListe(c, 'materiaux')}${blocListe(c, 'outils')}</div>`
      : '<p class="muted small pl-apres">Les listes matériaux et outils s’ouvrent une fois le chantier créé.</p>'}`;
  const m = openModal(c ? c.titre : formation ? 'Nouvelle formation' : 'Nouveau chantier', corps(), { wide: true, onClose: apres });
  brancher(m, c, apres);
  brancherCahier(m, c, apres);
  brancherFin(m, c, apres);
}

// ⚠ DÉCLARER LA FIN OUVRE UNE FENÊTRE, PAS UN `confirm()` (12/11/2026). Ce
// geste fait DEUX choses d'un coup — il ferme le chantier ET écrit à un client
// — et la seconde ne se rattrape pas. On montre donc le jour, le destinataire
// et le texte exact avant, pas un « Êtes-vous sûr ? ».
//
// ⚠ LA CASE EST COCHÉE PAR DÉFAUT MAIS ELLE SE DÉCOCHE, et c'est le point :
// un chantier peut se terminer mal, ou chez un client qu'on ne veut pas
// solliciter. Sans elle, il faudrait choisir entre ne pas clore le chantier et
// envoyer un SMS qu'on regrette.
function brancherFin(m, c, apres) {
  const rouvrir = m.querySelector('#pl-rouvrir');
  if (rouvrir) {
    rouvrir.onclick = async () => {
      if (!await confirm(`Rouvrir « ${c.titre} » ? Le chantier redevient en cours. `
        + 'Un SMS déjà parti ne se rappelle pas.')) return;
      try { await rouvrirChantier(c); toast('Chantier rouvert'); closeModal(); apres?.(); }
      catch (e) { toast(e.message || 'Impossible de rouvrir', 'erreur'); }
    };
  }
  const b = m.querySelector('#pl-fini');
  if (!b || !c) return;
  b.onclick = () => {
    const r = rattachementDe(c);
    // ⚠ LE TÉLÉPHONE SE LIT COMME LE SERVEUR LE LIRA : le contact d'abord,
    // l'organisation ensuite, le numéro saisi sur la demande en dernier — la
    // fiche est tenue à jour, la demande est un instantané du formulaire.
    // Montrer ici un numéro que la fonction ne trouverait pas ferait promettre
    // un SMS qui ne partirait jamais.
    //
    // ⚠ UNE DEMANDE DU SITE EST UN DOSSIER COMME UN AUTRE (12/11/2026, corrigé
    // après l'essai d'Élodie : son chantier de test, rattaché à une demande,
    // s'entendait répondre « pas de demande d'avis possible »). Le sélecteur du
    // planning propose les deux ; n'en accepter qu'un condamnait au silence une
    // partie des dossiers sans l'annoncer au moment de les rattacher.
    const f = r?.ligne || null;
    const ct = f?.contact_id ? db.byId('contacts', f.contact_id) : null;
    const og = f?.organisation_id ? db.byId('organisations', f.organisation_id) : null;
    const tel = ct?.phone || og?.phone || f?.telephone || '';
    const prenom = String(ct?.first_name || f?.prenom || '').trim();
    const apercu = `Bonjour${prenom ? ' ' + prenom : ''}, votre chantier est terminé `
      + 'et on espère que le résultat vous plait. Votre avis compte beaucoup pour nous : '
      + '<lien Google> Merci ! Mickael, RGD Renova';
    // ⚠ CE QUI MANQUE SE DIT ICI, PAS APRÈS L'ENVOI : sans dossier rattaché ou
    // sans mobile, le SMS ne partira jamais. Le découvrir dans un bilan après
    // coup ferait croire à une panne.
    // ⚠ CE QUI MANQUE SE DIT ICI, AVEC LE GESTE QUI LE RÉPARE. Un motif qui
    // nomme seulement le défaut (« aucun téléphone ») laisse chercher où le
    // saisir ; les trois cas possibles sont donc dits en toutes lettres.
    const empeche = !f ? 'ce chantier n’est rattaché à aucun dossier'
      : !(f.contact_id || f.organisation_id)
        ? 'ce dossier n’a ni contact ni entreprise — le client ne peut pas être identifié'
      : !tel ? 'aucun numéro de mobile sur ce dossier — ajoutez-le sur la fiche du contact'
      : null;
    const fen = openModal('Chantier terminé', `
      <div class="ca">
        <p>Déclarer la fin de <b>${esc(c.titre)}</b>${r ? ` — ${esc(r.nom)}` : ''}.</p>
        <label class="pl-champ"><span>Dernier jour du chantier</span>
          <input type="date" id="pf-jour" value="${esc(aujourdhuiIso())}" max="${esc(aujourdhuiIso())}"></label>
        ${empeche
          ? `<p class="muted small">Pas de demande d’avis possible : ${esc(empeche)}.
             Le chantier sera simplement clos.</p>`
          : `<label class="pl-membre"><input type="checkbox" id="pf-avis" checked>
               <span>Demander l’avis Google par SMS au client</span></label>
             <p class="muted small">Au <b>${esc(tel)}</b> — 2 SMS, 0,09 €. Entre 9 h et 19 h il part
               tout de suite ; sinon il partira demain à 11 h.</p>
             <p class="muted small">« ${esc(apercu)} »</p>
             <p class="muted small">Le serveur peut encore l’écarter : facture impayée, dossier SAV
               ouvert, ou client déjà sollicité. Il dira lequel.</p>`}
        <div class="form-actions"><span class="grow"></span>
          <button type="button" class="btn ghost" data-close>Annuler</button>
          <button type="button" class="btn primary" id="pf-ok">Déclarer la fin</button></div>
      </div>`, { wide: true });
    fen.querySelector('#pf-ok').onclick = async () => {
      const jour = fen.querySelector('#pf-jour').value || aujourdhuiIso();
      const avis = !empeche && fen.querySelector('#pf-avis')?.checked;
      const bouton = fen.querySelector('#pf-ok');
      bouton.disabled = true;                    // deux clics = deux SMS
      try {
        const res = await declarerFin(c, { avis, jour });
        closeModal();
        toast(messageDeFin(res));
        apres?.();
      } catch (e) {
        bouton.disabled = false;
        toast(e.message || 'Impossible de déclarer la fin', 'erreur');
      }
    };
  };
}

// Ce qu'on dit à Élodie après le clic. ⚠ ON NE DIT JAMAIS « SMS envoyé » SANS
// L'AVOIR LU DANS LA RÉPONSE : le serveur peut avoir mis la demande en file
// (soirée) ou l'avoir écartée (facture impayée), et annoncer un envoi qui n'a
// pas eu lieu est pire que de ne rien annoncer.
function messageDeFin(res) {
  if (!res.sms) return 'Chantier terminé';
  if (!res.sms.ok) {
    return res.sms.rattrapable
      ? 'Chantier terminé · demande enregistrée, le SMS partira à 11 h'
      : `Chantier terminé · ${res.sms.motif}`;
  }
  // ⚠ LA RÉPONSE EST CELLE DE LA TÂCHE, PAS UN « ok » : le volet `avis` porte
  // un bilan et un `detail` d'une ligne par chantier, chacune avec `ecarte` et
  // son motif, ou `envoye` vrai/faux. On lit cette ligne-là plutôt que de
  // déduire d'un code HTTP 200 que le SMS est parti — il vaut « la tâche a
  // tourné », pas « le client a reçu ».
  const a = res.sms.rep?.avis || {};
  if (a.en_file) return 'Chantier terminé · le SMS partira demain à 11 h';
  if (a.actif === false) return `Chantier terminé · pas de SMS : ${a.motif || 'envoi inactif'}`;
  const ligne = (a.detail || [])[0];
  if (!ligne) return 'Chantier terminé · demande enregistrée, le SMS partira à 11 h';
  if (ligne.ecarte) return `Chantier terminé · pas de SMS : ${ligne.motif}`;
  if (ligne.envoye === true) return 'Chantier terminé · demande d’avis envoyée';
  if (ligne.envoye === false) return 'Chantier terminé · l’envoi a échoué, nouvel essai demain à 11 h';
  return 'Chantier terminé · demande enregistrée';
}

// Le cahier des charges du chantier (11/11/2026) : il s'ouvre à la place de la
// fiche, et « Retour au chantier » la rouvre. Chargé à la demande : il tire
// le module des documents imprimés.
function brancherCahier(m, c, apres) {
  const b = m.querySelector('#pl-cahier');
  if (!b || !c) return;
  b.onclick = async () => {
    const { ouvrirCahier } = await import('./rgd-cahier.js');
    const chantier = db.byId('rgd_planning', c.id) || c;
    ouvrirCahier(chantier, rattachementDe(chantier), () => ouvrirChantier(db.byId('rgd_planning', c.id) || c, apres));
  };
}

function brancher(m, c, apres) {
  const form = m.querySelector('#pl-form');
  const fin = m.querySelector('#pl-fin');
  // ⚠ LA PHRASE DE FIN DIT AUSSI LE REPORT DU DÉBUT (11/11/2026). Une
  // formation posée un samedi ou un jour férié commence le premier jour ouvré
  // suivant : la date change, donc elle s'annonce AVANT d'enregistrer. Une
  // date corrigée en silence se découvre une fois le planning imprimé.
  const estFormulaireFormation = form.genre.value === 'formation';
  const majFin = () => {
    const d = form.date_debut.value;
    if (!d) { fin.textContent = ''; return; }
    if (!estFormulaireFormation) {
      const n = joursPour(d, form.duree_nombre.value, form.duree_unite.value);
      fin.textContent = `Fin : ${dateLongue(ajouterJours(d, Math.max(1, n) - 1))} · ${n} jour${n > 1 ? 's' : ''} calendaire${n > 1 ? 's' : ''}`;
      return;
    }
    const debut = prochainOuvre(d);
    const n = ouvresPour(form.duree_nombre.value, form.duree_unite.value);
    const report = debut !== d ? `Début reporté au ${dateLongue(debut)} (le ${dateLongue(d)} n’est pas un jour ouvré). ` : '';
    fin.textContent = `${report}Fin : ${dateLongue(finOuvree(debut, n))} · ${n} jour${n > 1 ? 's' : ''} ouvré${n > 1 ? 's' : ''}`;
  };
  form.date_debut.oninput = majFin; form.duree_nombre.oninput = majFin; form.duree_unite.onchange = majFin; majFin();
  // Le choix du dossier : un clic le retient, la liste se replie sur lui
  // (11/11/2026) et l'ADRESSE DU CHANTIER EST REMPLIE PAR CELLE DU DOSSIER —
  // remplacée, pas seulement complétée : changer de dossier doit changer
  // l'adresse. Depuis le 11/11/2026 ce n'est plus un champ visible.
  // Ouverte, la liste flotte sous la recherche (classe `ouvert`) au lieu de
  // pousser le reste du formulaire vers le bas.
  // La recherche porte sur le nom, le projet et l'adresse.
  const boite = m.querySelector('.pl-choix');
  // Une formation n'a pas de dossier : pas de sélecteur.
  if (boite) {
    const choisir = (bouton) => {
      const cle = bouton ? bouton.dataset.cle : '';
      form.rattachement.value = cle;
      m.querySelectorAll('.pl-dossier').forEach(b => b.classList.toggle('choisi', b.dataset.cle === cle));
      if (bouton) {
        const retenu = boite.querySelector('.pl-choix-retenu > div');
        retenu.innerHTML = `<b>${esc(bouton.dataset.nom)}</b>${bouton.dataset.projet ? `<span>${esc(bouton.dataset.projet)}</span>` : ''}${
          bouton.dataset.adresse ? `<em>${esc(bouton.dataset.adresse)}</em>` : ''}`;
        form.adresse.value = bouton.dataset.adresse || '';
      } else form.adresse.value = '';
      boite.classList.toggle('replie', !!cle);
      boite.classList.remove('ouvert');
    };
    const ouvrir = () => boite.classList.add('ouvert');
    const surDehors = (e) => { if (!boite.isConnected) document.removeEventListener('pointerdown', surDehors);
      else if (!boite.contains(e.target)) boite.classList.remove('ouvert'); };
    document.addEventListener('pointerdown', surDehors);
    m.querySelectorAll('.pl-dossier').forEach(b => b.onclick = () => choisir(b));
    m.querySelector('[data-aucun]').onclick = () => choisir(null);
    m.querySelector('[data-changer]').onclick = () => {
      boite.classList.remove('replie');
      ouvrir();
      m.querySelector('.pl-cherche').focus();
    };
    const cherche = m.querySelector('.pl-cherche');
    cherche.onfocus = ouvrir; cherche.onclick = ouvrir;
    cherche.oninput = () => {
      ouvrir();
      const mots = cherche.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean);
      let vus = 0;
      m.querySelectorAll('.pl-groupe').forEach(g => {
        let n = 0;
        g.querySelectorAll('.pl-dossier').forEach(b => {
          const t = b.dataset.texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const ok = mots.every(w => t.includes(w));
          b.hidden = !ok; if (ok) n++;
        });
        g.hidden = !n; vus += n;
      });
      const rien = m.querySelector('.pl-rien'); if (rien) rien.hidden = !!vus || !mots.length;
    };
    // Entrée dans la recherche ne doit pas enregistrer le chantier.
    cherche.onkeydown = (e) => { if (e.key === 'Enter') e.preventDefault();
      if (e.key === 'Escape' && boite.classList.contains('ouvert')) { e.stopPropagation(); boite.classList.remove('ouvert'); } };
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const [genre, id] = (form.rattachement.value || ':').split(':');
    const champs = {
      genre: form.genre.value,
      titre: form.titre.value, date_debut: form.date_debut.value,
      duree_nombre: form.duree_nombre.value, duree_unite: form.duree_unite.value,
      fiche_id: genre === 'fiche' ? id : null, demande_id: genre === 'demande' ? id : null,
      adresse: form.adresse.value, couleur: form.couleur.value, notes: form.notes.value,
      partage_avec: [...form.querySelectorAll('input[name="partage"]:checked')].map(x => x.value),
    };
    try {
      const formation = champs.genre === 'formation';
      if (c) { await majChantier(c.id, champs); toast(formation ? 'Formation enregistrée' : 'Chantier enregistré'); closeModal(); }
      else if (formation) { await creerChantier(champs); toast('Formation ajoutée au planning'); closeModal(); }
      else {
        const neuf = await creerChantier(champs);
        toast('Chantier créé — ajoutez ses listes');
        ouvrirChantier(db.byId('rgd_planning', neuf.id) || neuf, apres);
      }
    } catch (err) { toast(err.message, 'error'); }
  };
  const bSuppr = m.querySelector('#pl-suppr');
  if (bSuppr) bSuppr.onclick = async () => {
    const formation = estFormation(c);
    if (!await confirm(formation ? `Supprimer la formation « ${c.titre} » ? C’est définitif.`
      : `Supprimer « ${c.titre} » et ses listes ? C’est définitif.`)) { ouvrirChantier(c, apres); return; }
    try { await supprimerChantier(c.id); toast(formation ? 'Formation supprimée' : 'Chantier supprimé'); apres?.(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const bFiche = m.querySelector('#pl-fiche');
  if (bFiche) bFiche.onclick = async () => {
    const r = rattachementDe(c);
    const { ouvrirProspectRgd } = await import('./rgd-clients.js');
    ouvrirProspectRgd(r.ligne, r.genre, apres,
      { label: '← Retour au chantier', action: () => ouvrirChantier(db.byId('rgd_planning', c.id), apres) });
  };
  if (!c) return;
  brancherListesDe(m, c);
}

// Les listes : on redessine la seule zone des listes, pas la fenêtre, pour
// ne pas perdre ce qu'on est en train de taper dans le formulaire du haut.
function brancherListesDe(m, c) {
  const zone = m.querySelector('.pl-listes');
  const redessiner = () => {
    zone.innerHTML = blocListe(c, 'materiaux') + blocListe(c, 'outils');
    brancherListes();
  };
  const brancherListes = () => {
    zone.querySelectorAll('[data-standard]').forEach(b => b.onclick = async () => {
      try {
        const n = await ajouterStandard(c.id, b.dataset.standard);
        toast(n ? `${n} ligne${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}` : 'La liste standard est déjà là');
        redessiner();
      } catch (err) { toast(err.message, 'error'); }
    });
    zone.querySelectorAll('[data-ajout]').forEach(f => f.onsubmit = async (e) => {
      e.preventDefault();
      const champ = f.querySelector('input');
      try { await ajouterLigne(c.id, f.dataset.ajout, champ.value); redessiner();
        zone.querySelector(`[data-ajout="${f.dataset.ajout}"] input`)?.focus(); }
      catch (err) { toast(err.message, 'error'); }
    });
    zone.querySelectorAll('[data-ligne]').forEach(row => {
      const id = row.dataset.ligne;
      row.querySelectorAll('[data-case]').forEach(cb => cb.onchange = async () => {
        try { await majLigne(id, { [cb.dataset.case]: cb.checked }); redessiner(); }
        catch (err) { cb.checked = !cb.checked; toast(err.message, 'error'); }
      });
      // Le texte s'enregistre en quittant le champ, pas à chaque touche.
      row.querySelectorAll('[data-champ]').forEach(inp => inp.onchange = async () => {
        const v = inp.value.trim();
        if (inp.dataset.champ === 'libelle' && !v) { redessiner(); return; }
        try { await majLigne(id, { [inp.dataset.champ]: v || null }); }
        catch (err) { toast(err.message, 'error'); }
      });
      const bRetirer = row.querySelector('[data-retirer]');
      if (bRetirer) bRetirer.onclick = async () => {
        try { await retirerLigne(id); redessiner(); } catch (err) { toast(err.message, 'error'); }
      };
    });
  };
  brancherListes();
}

// ------------------------------------------------------------ les listes standard
function ouvrirStandard() {
  const s = listesStandard();
  const m = openModal('Listes standard', `
    <p class="muted small">Le modèle qu’on ajoute à un chantier d’un clic. Une ligne par article.
      Le modifier ne change pas les chantiers déjà préparés.</p>
    <div class="pl-std">
      ${Object.entries(LISTES).map(([k, l]) => `<label class="pl-champ"><span>${esc(l.label)}</span>
        <textarea name="${k}" rows="14">${esc(s[k].join('\n'))}</textarea></label>`).join('')}
    </div>
    <div class="form-actions"><button class="btn ghost" data-close>Annuler</button>
      <button class="btn primary" id="pl-std-ok">Enregistrer</button></div>`, { wide: true });
  m.querySelector('#pl-std-ok').onclick = async () => {
    const lire = (k) => m.querySelector(`textarea[name="${k}"]`).value.split('\n');
    try { await enregistrerStandard({ materiaux: lire('materiaux'), outils: lire('outils') });
      toast('Listes standard enregistrées'); closeModal(); }
    catch (err) { toast(err.message, 'error'); }
  };
}

// ------------------------------------------------------------ la page
export const rgdPlanningPage = {
  title: () => 'RGD Renova — Planning chantier',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const auj = versDate(aujourdhui());
    let vueMemo = '';
    try { vueMemo = localStorage.getItem('rgd_planning_vue') || ''; } catch { /* navigation privée */ }
    const state = { annee: auj.getFullYear(), mois: auj.getMonth(), vue: vueMemo === 'annee' ? 'annee' : 'mois' };

    const draw = () => {
      const direction = scope.isDirection;
      const tous = chantiersPlanifies();
      const enAnnee = state.vue === 'annee';
      const premier = versIso(new Date(state.annee, state.mois, 1));
      const dernier = versIso(new Date(state.annee, state.mois + 1, 0));
      // En frise, le tableau montre TOUS les chantiers (pas d'année) : en
      // cours, puis à venir, puis terminés.
      const rangEtat = { encours: 0, futur: 1, passe: 2 };
      const periode = enAnnee
        ? tous.slice().sort((x, y) => rangEtat[etatDe(x).cle] - rangEtat[etatDe(y).cle]
          || String(x.date_debut).localeCompare(String(y.date_debut)))
        : tous.filter(c => c.date_debut <= dernier && finDe(c) >= premier);
      const nomPeriode = enAnnee ? 'Tous les chantiers' : `${MOIS[state.mois]} ${state.annee}`;

      const corps = `
        <div class="pl-barre-outils">
          <div class="pl-bascule" role="tablist">
            <button type="button" role="tab" data-vue="mois" class="${!enAnnee ? 'on' : ''}">Mois</button>
            <button type="button" role="tab" data-vue="annee" class="${enAnnee ? 'on' : ''}">Frise</button>
          </div>
          <div class="pl-nav">
            <button type="button" class="btn ghost" data-pas="-1" aria-label="${enAnnee ? 'Glisser vers le passé' : 'Mois précédent'}">‹</button>
            <h2${enAnnee ? ' class="pl-h2-libre"' : ''}>${esc(nomPeriode)}</h2>
            <button type="button" class="btn ghost" data-pas="1" aria-label="${enAnnee ? 'Glisser vers l’avenir' : 'Mois suivant'}">›</button>
            <button type="button" class="btn ghost sm" id="pl-auj">Aujourd’hui</button>
          </div>
          <span class="grow"></span>
          ${direction ? `<button type="button" class="btn ghost" id="pl-std">Listes standard</button>
          <button type="button" class="btn ghost pl-btn-formation" id="pl-formation">+ Formation</button>
          <button type="button" class="btn primary" id="pl-neuf">+ Nouveau chantier</button>` : ''}
        </div>
        ${!direction ? '<p class="muted small">Les chantiers que la direction a partagés avec vous. Vous pouvez cocher leurs listes de matériaux et d’outils.</p>' : ''}
        <section class="card pl-carte">
          ${enAnnee ? frise(tous) : calendrier(state.annee, state.mois, tous)}
          <p class="muted small pl-aide">${enAnnee
            ? 'La molette de la souris fait défiler les mois (ou cliquez-glissez). En couleur vive : en cours, avec la part écoulée. Hachurés : à venir. Gris : terminés. Cliquez sur une barre pour ouvrir le chantier.'
            : direction ? 'Cliquez sur un jour pour y planifier un chantier, sur une barre pour ouvrir sa fiche.'
            : 'Cliquez sur une barre pour ouvrir le chantier.'}</p>
        </section>
        <section class="card pl-carte">
          <h3 class="pl-titre">${enAnnee ? 'Tous les chantiers' : `Chantiers de ${esc(nomPeriode)}`} <span>${periode.length}</span></h3>
          ${periode.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Chantier / formation</th><th>État</th><th>Fiche</th><th>Du</th><th>Au</th><th>Durée</th><th>À trouver</th></tr></thead>
            <tbody>${periode.map(c => {
              const r = rattachementDe(c);
              const f = estFormation(c);
              const reste = resteA(c.id);
              const n = lignesDe(c.id).length;
              const e = etatDe(c);
              return `<tr data-chantier="${esc(c.id)}">
                <td><span class="pl-point" style="background:${couleurDe(c, tous.indexOf(c))}"></span>${marque(c)}<b>${esc(c.titre)}</b></td>
                <td><span class="pl-etat est-${e.cle}">${esc(e.label)}</span></td>
                <td>${f ? `<span class="pl-etiquette-formation">Formation</span>${c.adresse ? ` <span class="muted small">${esc(c.adresse)}</span>` : ''}`
                  : r ? esc(r.nom) : '<span class="muted">—</span>'}</td>
                <td>${esc(enAnnee ? dateLongue(c.date_debut) : dateCourte(c.date_debut))}</td><td>${esc(enAnnee ? dateLongue(finDe(c)) : dateCourte(finDe(c)))}</td>
                <td>${esc(dureeLue(c).texte)}</td>
                <td>${f ? '<span class="muted">—</span>' : !n ? '<span class="muted">Pas de liste</span>'
                  : reste ? `<span class="chip amber">${reste} à trouver</span>` : '<span class="chip green">Tout est prêt</span>'}</td>
              </tr>`;
            }).join('')}</tbody></table></div>`
            : `<div class="empty">${enAnnee ? 'Aucun chantier planifié.' : 'Aucun chantier ce mois-ci.'}</div>`}
        </section>`;

      root.innerHTML = cadre('#/rgd/planning', 'Planning chantier', corps);
      const boiteFrise = root.querySelector('.pl-frise-defile');
      brancherFrise(root, friseGauche === null);
      if (direction) { brancherPoignees(root, draw); brancherDeplacement(root, draw); }
      root.querySelectorAll('[data-pas]').forEach(b => b.onclick = () => {
        // En frise, les flèches font glisser de trois mois.
        if (boiteFrise) { boiteFrise.glisserVers(boiteFrise.scrollLeft + Number(b.dataset.pas) * 90 * PX_JOUR); return; }
        const d = new Date(state.annee, state.mois + Number(b.dataset.pas), 1);
        state.annee = d.getFullYear(); state.mois = d.getMonth(); draw();
      });
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        state.vue = b.dataset.vue;
        try { localStorage.setItem('rgd_planning_vue', state.vue); } catch { /* navigation privée */ }
        draw();
      });
      root.querySelector('#pl-auj').onclick = () => {
        if (boiteFrise) { boiteFrise.glisserVers(Number(boiteFrise.dataset.depart)); return; }
        state.annee = auj.getFullYear(); state.mois = auj.getMonth(); draw();
      };
      const bNeuf = root.querySelector('#pl-neuf');
      if (bNeuf) bNeuf.onclick = () => ouvrirChantier(null, draw);
      const bFormation = root.querySelector('#pl-formation');
      if (bFormation) bFormation.onclick = () => ouvrirChantier(null, draw, null, 'formation');
      const bStd = root.querySelector('#pl-std');
      if (bStd) bStd.onclick = ouvrirStandard;
      if (direction) root.querySelectorAll('[data-jour]').forEach(b => b.onclick = () => ouvrirChantier(null, draw, b.dataset.jour));
      else root.querySelectorAll('[data-jour]').forEach(b => { b.disabled = true; b.removeAttribute('title'); });
      root.querySelectorAll('[data-chantier]').forEach(el => el.onclick = () => {
        if (boiteFrise?.dataset.glisse) return;              // c'était un glissement
        if (root.dataset.deplace) return;                     // c'était un déplacement
        const c = db.byId('rgd_planning', el.dataset.chantier);
        if (c) ouvrirChantier(c, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
