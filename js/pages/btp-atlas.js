// Atlas visuel des pathologies — les 50 fiches et les 12 signaux d'alerte.
//
// À quoi sert cet écran : on est devant un mur, on voit une fissure, et il
// faut décider en trente secondes si c'est de l'entretien, une cause à
// chercher, ou un arrêt de chantier. La fiche répond ; le signal d'alerte dit
// quand on n'a plus le droit de répondre soi-même.
//
// ⚠ LE CONTENU NE VIT PAS DANS CE DÉPÔT, ET C'EST POURQUOI L'ÉCRAN VA LE
// CHERCHER EN BASE. L'atlas est un produit commercial tiers repris pour
// l'usage interne du cabinet ; le dépôt du front est PUBLIC. Titres et textes
// sont dans `btp_atlas_fiches` / `btp_signaux_alerte`, les planches dans le
// seau PRIVÉ `btp-atlas`, servies par URL signée d'une heure. Rien de tout
// cela n'est lisible sans un compte qui porte l'activité BTP.
//
// ⚠ LE JEU DE DÉMO EST INVENTÉ DE BOUT EN BOUT, planches comprises (des SVG
// dessinés ici, donc sans réseau). Recopier trois vraies fiches « pour
// montrer » les publierait sur GitHub aussi sûrement que les cinquante.
//
// ⚠ LE NUMÉRO DE FICHE EST UNE CLÉ, PAS UN RANG. La check-list renvoie aux
// fiches par leur numéro imprimé (« 02 · 04 · 25 »), et ces numéros ne suivent
// pas l'ordre des familles : « Fissures » va de 02 à 11, puis 13, 18 et 49.
// L'écran range par famille et AFFICHE le numéro — il ne le recalcule jamais.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, toast } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadreBtp as cadre } from './btp.js';

const KEY = 'btp';
const SEAU = 'btp-atlas';

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

const fiches = () => scope.canBtp ? db.t('btp_atlas_fiches') : [];
const signaux = () => scope.canBtp ? db.t('btp_signaux_alerte') : [];

// Les familles dans l'ordre du document d'origine, pas dans l'ordre
// alphabétique : il va du structurel au cosmétique, et c'est l'ordre dans
// lequel on regarde un bâtiment.
const ORDRE_FAMILLES = [
  'Fissures et lézardes', 'Béton et structure', 'Humidité et infiltrations',
  'Enduits et peintures', 'Sols et revêtements', 'ITE et façades',
  'Toitures et étanchéité',
];
const rangFamille = (f) => {
  const i = ORDRE_FAMILLES.indexOf(f);
  return i < 0 ? ORDRE_FAMILLES.length : i;   // une famille inconnue passe en fin, jamais devant
};

const parFamille = (liste) => {
  const m = new Map();
  for (const f of liste) {
    if (!m.has(f.famille)) m.set(f.famille, []);
    m.get(f.famille).push(f);
  }
  return [...m.entries()]
    .sort((a, b) => rangFamille(a[0]) - rangFamille(b[0]))
    .map(([famille, l]) => [famille, l.sort((x, y) => x.numero - y.numero)]);
};

const num = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------- Le niveau d'alerte
//
// ⚠ LA COULEUR DIT QUOI FAIRE, elle ne classe pas la gravité pour le plaisir :
// les trois phrases sont celles du document, mot pour mot. Les raccourcir en
// « grave / moyen / bénin » ferait dire à l'atlas autre chose que ce qu'il dit.
//
// ⚠ ELLE NE SE DÉDUIT NI DU TITRE NI DE LA FAMILLE, elle vient de la base :
// « Fissures » contient du vert (faïençage) et du rouge (lézardes en X), et deux
// fiches voisines par le sujet n'ont pas le même niveau. Les six familles
// portent toutes deux ou trois couleurs — vérifié en base, pas supposé.
//
// ⚠ UNE FICHE SANS COULEUR N'EST PAS UNE FICHE VERTE : la pastille devient
// grise et le dit. Retomber sur le vert par défaut ferait passer pour
// « à surveiller » une fiche dont personne n'a renseigné le niveau.
const ALERTE = {
  vert:   { mot: 'Vert',   faire: 'surveiller',        phrase: "Surveiller et planifier l'entretien." },
  orange: { mot: 'Orange', faire: 'chercher la cause', phrase: "Investiguer la cause avant d'intervenir." },
  rouge:  { mot: 'Rouge',  faire: 'sécuriser',         phrase: "Sécuriser et appeler un spécialiste." },
};

// ⚠ LE NUMÉRO EST LA PASTILLE, et non une pastille À CÔTÉ du numéro. La
// première version posait un rond de 9 px devant chaque ligne : deux objets
// pour une seule information, 9 px de couleur à repérer sur cinquante lignes,
// et de la place perdue à gauche. Le jeton teinté se voit d'un coup d'œil et
// ne coûte pas un pixel de plus que le numéro qu'il fallait afficher de toute
// façon.
//
// ⚠ TEINTÉ, PAS EN APLAT PLEIN : cinquante jetons saturés côte à côte font un
// sapin de Noël où plus rien ne ressort — or ce qu'on cherche ici, ce sont les
// quatorze rouges.
//
// ⚠ `title` ET `aria-label` : une couleur seule est illisible pour qui ne
// distingue pas le vert du rouge — un cas fréquent, et l'information porte
// ici sur la sécurité des personnes. Le numéro reste lisible sans la couleur,
// et le niveau s'énonce en toutes lettres à l'ouverture de la fiche.
const jeton = (f) => {
  const a = ALERTE[f.code_couleur];
  const dit = a ? `${a.mot} — ${a.phrase}` : "Niveau d'alerte non renseign\u00e9";
  return `<span class="at-jeton at-jeton-${a ? f.code_couleur : 'nul'}" title="${esc(dit)}"
    aria-label="Fiche ${num(f.numero)}, niveau d'alerte : ${esc(a ? a.mot : 'non renseign\u00e9')}">${num(f.numero)}</span>`;
};

// L'ordre affiché — famille par famille, numéro par numéro — mis à plat. C'est
// lui qui donne la fiche précédente et la suivante : suivre l'ordre des NUMÉROS
// ferait sauter d'une famille à l'autre, alors qu'on compare des voisines.
const aPlat = (liste) => parFamille(liste).flatMap(([, l]) => l);

// ⚠ LE FILTRE EST ÉCRIT UNE SEULE FOIS. Le sommaire et l'index étroit montrent
// la même sélection ; deux filtrages séparés finiraient par ne plus dire la
// même chose, et l'écart ne se verrait que sur une recherche précise.
function filtrer(toutes, etat) {
  const q = etat.q.trim().toLowerCase();
  return toutes.filter(f =>
    (!etat.couleur || f.code_couleur === etat.couleur) &&
    (!q || f.titre.toLowerCase().includes(q) || String(f.numero) === q || num(f.numero) === q));
}

// ---------------------------------------------------------------- La planche
//
// ⚠ L'URL EST SIGNÉE ET EXPIRE EN UNE HEURE : elle se demande à l'ouverture,
// jamais à l'avance pour les cinquante. Charger cinquante URLs signées pour en
// regarder une ferait cinquante appels et six mégaoctets d'images pour rien.
async function ouvrirPlanche(root, fiche, dessine) {
  const zone = root.querySelector('#at-planche');
  if (!zone) return;
  zone.innerHTML = '<div class="empty">Ouverture de la planche…</div>';
  if (!fiche.image) {
    zone.innerHTML = `<div class="empty">La planche de la fiche ${num(fiche.numero)} n'a pas encore été déposée.</div>`;
    return;
  }
  try {
    // ⚠ DEUX SORTES DE VALEURS DANS LA MÊME COLONNE, ET IL FAUT LES DISTINGUER.
    // En production `image` est un CHEMIN dans le seau privé, qu'il faut faire
    // signer. En démonstration c'est une adresse `data:` — une planche dessinée
    // dans le jeu d'exemple, puisqu'il n'y a ni seau ni réseau. Passer la
    // seconde à `fileUrl` la fait chercher dans un magasin de fichiers qui ne
    // la connaît pas : « Fichier introuvable », et le cadre reste vide.
    // Le test porte sur « c'est déjà une adresse », jamais sur « ce n'est pas
    // un chemin » — la seconde formule laisserait passer une URL http un jour.
    const brut = String(fiche.image);
    const url = /^(data:|https?:)/.test(brut) ? brut : await db.fileUrl(brut, { bucket: SEAU });
    zone.innerHTML = `<img src="${esc(url)}" alt="Fiche ${num(fiche.numero)} — ${esc(fiche.titre)}" class="at-img">`;
  } catch (e) {
    // Un cadre vide se lit comme « le CRM n'a pas repris la fiche » alors que
    // c'est le FICHIER qui manque. On dit laquelle des deux — et on n'affiche
    // pas l'adresse entière, qui peut faire plusieurs milliers de caractères.
    zone.innerHTML = `<div class="empty">Planche introuvable dans le stockage
      (${esc(String(fiche.image).slice(0, 60))}).<br>
      <span class="small muted">${esc(e.message || '')}</span></div>`;
  }
}

// ------------------------------------------------- Déposer les 50 planches
//
// ⚠ LE DÉPÔT SE FAIT D'ICI, ET PAS DEPUIS LA CONSOLE DE LA PLATEFORME. Le
// premier jet renvoyait la direction vers Supabase pour y glisser un dossier :
// c'est une porte de plus à connaître, dans un outil que personne n'ouvre, et
// l'atlas est resté vide. Le navigateur de quelqu'un de la direction a
// exactement le droit qu'il faut (policy `btp_atlas_objets_ajout`) — autant
// s'en servir.
//
// ⚠ LE NOM DU FICHIER EST LA CLÉ, ET IL EST VÉRIFIÉ AVANT D'ENVOYER. Une
// planche déposée sous un autre nom que `fiche-NN.jpeg` ne serait rattachée à
// aucune fiche et n'apparaîtrait nulle part — un envoi qui réussit et ne sert
// à rien est pire qu'un refus.
async function deposerPlanches(root, fichiers, dessine) {
  const connues = new Set(fiches().map(f => f.image));
  const bons = [...fichiers].filter(f => connues.has(f.name));
  const ecartes = [...fichiers].length - bons.length;
  if (!bons.length) {
    return toast(`Aucun fichier ne porte un nom attendu (fiche-01.jpeg …). ${ecartes} écarté(s).`, 'warn');
  }
  let ok = 0; const rates = [];
  for (const f of bons) {
    try {
      // `upsert` : redéposer une planche corrigée doit la remplacer, pas
      // échouer — d'où la policy UPDATE sur le seau.
      await db.uploadFile(f.name, f, { bucket: SEAU, upsert: true });
      ok++;
    } catch (e) { rates.push(`${f.name} : ${e.message}`); }
  }
  toast(`${ok} planche${ok > 1 ? 's' : ''} déposée${ok > 1 ? 's' : ''}`
    + (ecartes ? ` · ${ecartes} nom${ecartes > 1 ? 's' : ''} inattendu${ecartes > 1 ? 's' : ''}` : '')
    + (rates.length ? ` · ${rates.length} en échec` : ''), rates.length ? 'warn' : 'ok');
  if (rates.length) console.warn(['Planches non déposées :', ...rates].join(String.fromCharCode(10)));
  dessine();
}

// ---------------------------------------------------------------- L'écran
export const btpAtlasPage = {
  title: () => 'BTP Expertise — Atlas visuels',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // `vue` : 'fiches' ou 'signaux'. `ouverte` : le numéro de fiche affiché.
    // `couleur` : le niveau d'alerte retenu, ou null pour les trois.
    const etat = { vue: 'fiches', ouverte: null, q: '', couleur: null };

    const dessine = () => {
      const toutes = fiches();
      const filtrees = filtrer(toutes, etat);
      const ouverte = toutes.find(f => f.numero === etat.ouverte) || null;

      root.innerHTML = cadre('#/btp/atlas', 'Atlas visuels', `
        <div class="card">
          <div class="card-head">
            <h2>${etat.vue === 'fiches' ? 'Fiches de pathologie' : "Les 12 signaux d'alerte"}</h2>
            <span class="grow"></span>
            <div class="chips">
              <button type="button" class="chip${etat.vue === 'fiches' ? ' on' : ''}" data-vue="fiches">Fiches (${toutes.length})</button>
              <button type="button" class="chip${etat.vue === 'signaux' ? ' on' : ''}" data-vue="signaux">Signaux d'alerte (${signaux().length})</button>
            </div>
            ${scope.isDirection && !db.demo ? `
              <label class="btn ghost sm" style="cursor:pointer;margin-left:8px">
                Déposer les planches
                <input type="file" id="at-depot" accept="image/jpeg,image/png,image/webp" multiple hidden>
              </label>` : ''}
          </div>
          ${etat.vue === 'fiches' ? vueFiches(filtrees, ouverte, etat) : vueSignaux()}
        </div>`);

      lier(root, etat, dessine);
      if (etat.vue === 'fiches' && ouverte) ouvrirPlanche(root, ouverte, dessine);
    };

    dessine();
    return { refresh: dessine, destroy: coquille.retirer };
  },
};

// ⚠ DEUX PRÉSENTATIONS, ET NON DEUX COLONNES TOUT LE TEMPS (29/09/2026,
// demandé par Mickael : « tu me mets le menu + le sommaire, ça fait doublon »).
// C'était vrai : la colonne de gauche listait les cinquante fiches par famille,
// et le panneau de droite affichait un sommaire qui listait les mêmes cinquante
// par les mêmes familles. Deux fois le même index, côte à côte.
//
// L'atlas papier ne fait pas cela : il ouvre sur UNE page d'index en pleine
// page, puis on tourne à la fiche. L'écran suit.
//   - aucune fiche ouverte : le sommaire SEUL, sur toute la largeur ;
//   - une fiche ouverte    : l'index étroit à gauche, la planche à droite.
//
// ⚠ L'INDEX ÉTROIT NE DISPARAÎT PAS POUR AUTANT, et c'est la raison d'être des
// deux colonnes : devant un mur on compare deux ou trois fiches voisines avant
// de trancher, la planche doit rester en place pendant qu'on saute de l'une à
// l'autre. Le supprimer obligerait à repasser par le sommaire à chaque essai.
function vueFiches(liste, ouverte, etat) {
  if (!fiches().length) {
    return `<div class="empty">Aucune fiche. Le contenu de l'atlas s'importe à la main :
      il n'est pas dans le dépôt, c'est un document sous licence.</div>`;
  }
  if (!ouverte) return sommaire(liste, etat);

  // ⚠ LES VOISINES SE PRENNENT DANS LA LISTE FILTRÉE, pas dans les cinquante :
  // quand on a demandé « les rouges », « suivante » doit donner la rouge
  // suivante. Sinon le filtre ne vaudrait que pour la liste et pas pour le
  // parcours, ce qui est précisément ce qu'on est en train de faire.
  const ordre = aPlat(liste);
  const i = ordre.findIndex(f => f.numero === ouverte.numero);
  const avant = i > 0 ? ordre[i - 1] : null;
  const apres = i >= 0 && i < ordre.length - 1 ? ordre[i + 1] : null;
  const a = ALERTE[ouverte.code_couleur];

  return `
    <div class="at-corps">
      <div class="at-index">
        <button type="button" class="at-retour" data-sommaire="1">← Sommaire des ${fiches().length} fiches</button>
        ${barreRecherche(etat, true)}
        ${liste.length ? parFamille(liste).map(([famille, l]) => `
          <div class="at-fam">
            <div class="at-fam-titre">${esc(famille)}</div>
            ${l.map(f => `
              <button type="button" class="at-ligne${f.numero === etat.ouverte ? ' on' : ''}" data-fiche="${f.numero}">
                ${jeton(f)}
                <span class="at-titre">${esc(f.titre)}</span>
              </button>`).join('')}
          </div>`).join('') : '<div class="empty">Aucune fiche ne correspond.</div>'}
      </div>

      <div class="at-droite">
        <!-- ⚠ LA PLANCHE EST UNE IMAGE : elle ne peut ni être cherchée, ni lue à
             voix haute, ni résumée. Ce bandeau redit en TEXTE ce qu'elle montre
             — le numéro, le titre, le niveau d'alerte et ce qu'il commande —
             pour qu'on sache où l'on est avant même qu'elle soit chargée. -->
        <div class="at-bandeau${a ? ' est-' + ouverte.code_couleur : ''}">
          ${jeton(ouverte)}
          <div class="at-bandeau-t">
            <b>${esc(ouverte.titre)}</b>
            <span>${esc(ouverte.famille)}</span>
          </div>
          ${a ? `<span class="at-niveau at-niveau-${ouverte.code_couleur}">
                   ${esc(a.mot)} · ${esc(a.phrase)}</span>` : ''}
          <span class="grow"></span>
          <!-- Les flèches se GRISENT aux bouts au lieu de disparaître : un bouton
               qui s'efface fait sauter les autres sous la souris. -->
          <div class="at-nav">
            <button type="button" class="at-fleche" data-voisine="${avant ? avant.numero : ''}"
              ${avant ? `title="${esc(num(avant.numero) + ' · ' + avant.titre)}"` : 'disabled'}>‹</button>
            <button type="button" class="at-fleche" data-voisine="${apres ? apres.numero : ''}"
              ${apres ? `title="${esc(num(apres.numero) + ' · ' + apres.titre)}"` : 'disabled'}>›</button>
          </div>
        </div>
        <div class="at-planche" id="at-planche"></div>
      </div>
    </div>`;
}

// ⚠ LES SIGNAUX NE SONT PAS DES FICHES, et l'écran ne doit pas les présenter
// comme telles. Une fiche explique ; un signal interrompt. D'où quatre blocs
// nommés par ce qu'on doit FAIRE — tout de suite, noter, dire — et la phrase
// au client rendue telle quelle : elle est écrite pour éviter à la fois
// l'alarmisme et la promesse imprudente, la reformuler perdrait les deux.
function vueSignaux() {
  const l = signaux().slice().sort((a, b) => a.numero - b.numero);
  if (!l.length) {
    return `<div class="empty">Les douze signaux s'importent avec le contenu de l'atlas.</div>`;
  }
  return `
    <!-- \u26a0 LA PHRASE D'AVERTISSEMENT EST ENCADR\u00c9E, PAS SEULEMENT COLOR\u00c9E. En
         texte orange nu elle se lisait comme une coquetterie de mise en page ;
         ici elle occupe un bloc, ce qui correspond \u00e0 ce qu'elle dit. -->
    <div class="at-avert">
      <span class="at-avert-pic" aria-hidden="true">!</span>
      <p>Ces douze-l\u00e0 ne se r\u00e8glent pas avec une fiche : le risque n'est pas esth\u00e9tique,
        il porte sur la stabilit\u00e9 ou la s\u00e9curit\u00e9 des personnes.
        <b>On s'arr\u00eate, on s\u00e9curise, on documente, et on fait intervenir un sp\u00e9cialiste.</b></p>
    </div>
    <div class="at-signaux">
      ${l.map(s => `
        <div class="at-signal">
          <div class="at-signal-tete">
            <span class="at-signal-num">${num(s.numero)}</span>
            <b>${esc(s.titre)}</b>
            <span class="grow"></span>
            ${(s.fiches || []).map(n => `<button type="button" class="at-signal-fiche" data-vers-fiche="${n}">Fiche ${num(n)} \u2192</button>`).join(' ')}
          </div>
          <!-- \u26a0 TROIS COLONNES SUR UN GRAND \u00c9CRAN, empil\u00e9es en dessous : ces
               trois consignes se lisent D'UN COUP devant le mur, et non l'une
               apr\u00e8s l'autre en faisant d\u00e9filer. -->
          <div class="at-signal-corps">
            ${s.pourquoi ? `<p class="at-signal-l"><em>Pourquoi c'est grave</em>${esc(s.pourquoi)}</p>` : ''}
            ${s.tout_de_suite ? `<p class="at-signal-l"><em>\u00c0 faire tout de suite</em>${esc(s.tout_de_suite)}</p>` : ''}
            ${s.a_noter ? `<p class="at-signal-l"><em>\u00c0 noter et photographier</em>${esc(s.a_noter)}</p>` : ''}
          </div>
          ${s.dire_au_client ? `<p class="at-signal-dire">\u00ab\u00a0${esc(s.dire_au_client)}\u00a0\u00bb</p>` : ''}
        </div>`).join('')}
    </div>`;
}

// ------------------------------------------------------- La barre de recherche
//
// Écrite une seule fois : elle sert au sommaire ET à l'index étroit. Deux
// champs séparés ne porteraient pas le même `id`, et la reprise du curseur
// après redessin — qui cherche `#at-q` — casserait sur l'un des deux.
//
// ⚠ SEUL LE TEXTE DE SUBSTITUTION SE RACCOURCIT DANS LA COLONNE ÉTROITE
// (296 px) : « Chercher un symptôme ou un numéro… » y était coupé au milieu
// d'un mot. L'`aria-label`, lui, reste entier des deux côtés — c'est ce que
// lit un lecteur d'écran, et il n'a pas de largeur.
const barreRecherche = (etat, court = false) => `
  <div class="at-quete">
    <svg class="at-loupe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input class="at-q" id="at-q" type="search"
           placeholder="${court ? 'Chercher\u2026' : 'Chercher un sympt\u00f4me ou un num\u00e9ro\u2026'}"
           value="${esc(etat.q)}" aria-label="Chercher une fiche par sympt\u00f4me ou par num\u00e9ro">
    ${etat.q ? '<button type="button" class="at-vider" data-vider="1" title="Effacer la recherche">\u00d7</button>' : ''}
  </div>`;

// ---------------------------------------------------------------- Le sommaire
//
// ⚠ C'EST LA PREMIÈRE CHOSE QU'ON VOIT, ET CE N'ÉTAIT PAS LE CAS (29/09/2026,
// demandé par Mickael : « je veux retrouver le sommaire du début »). L'écran
// s'ouvrait sur « Choisissez une fiche dans l'index » et une colonne étroite
// qu'il fallait faire défiler : l'atlas papier, lui, commence par une page qui
// montre les cinquante d'un coup, rangées par famille. C'est ainsi qu'on trouve
// un symptôme dont on ne connaît pas encore le nom.
//
// ⚠ IL NE PORTE AUCUN CONTENU NEUF : familles, numéros, titres et couleurs
// viennent des mêmes lignes que l'index de gauche. Rien à importer, rien à
// tenir à jour en double — une fiche ajoutée en base paraît aux deux endroits.
//
// ⚠ IL REÇOIT LA LISTE DÉJÀ FILTRÉE, il ne relit pas `fiches()` : la recherche
// et le filtre par niveau vivent DANS le sommaire. Le total, lui, reste celui
// de la base — « Sommaire des 50 fiches » ne doit pas devenir « des 3 fiches ».
function sommaire(liste, etat) {
  const toutes = fiches();
  const compte = (c) => toutes.filter(f => f.code_couleur === c).length;
  const parts = ['vert', 'orange', 'rouge'].map(c => [c, compte(c)]);
  const connus = parts.reduce((s, [, n]) => s + n, 0);
  const filtre = etat.couleur || etat.q;

  return `
    <div class="at-somm">
      <div class="at-somm-tete">
        <div class="at-somm-titre">
          <h3>Sommaire des ${toutes.length} fiches</h3>
          <!-- ⚠ LA LÉGENDE EST DEVENUE UN FILTRE (29/09/2026). Elle disait déjà
               ce que veut dire chaque couleur ; en la rendant cliquable, elle
               répond en plus à la question qu'on se pose vraiment devant un
               atlas — « montre-moi les rouges ». Une légende qui ne fait
               qu'expliquer occupe la même place sans rien faire.
               ⚠ LES COMPTES PORTENT SUR LES CINQUANTE, jamais sur la sélection :
               sinon cliquer « Vert » mettrait Orange et Rouge à zéro, et plus
               rien ne permettrait d'en sortir. -->
          <div class="at-somm-code" role="group" aria-label="Filtrer par niveau d'alerte">
            ${parts.map(([c, n]) => `
              <button type="button" class="at-code at-code-${c}${etat.couleur === c ? ' on' : ''}"
                data-couleur="${c}" aria-pressed="${etat.couleur === c}"
                title="${esc(ALERTE[c].phrase)}${etat.couleur === c ? ' — cliquer pour tout revoir' : ''}">
                <span class="at-past at-past-${c}"></span>${esc(ALERTE[c].mot)} · ${esc(ALERTE[c].faire)}
                <b>${n}</b>
              </button>`).join('')}
          </div>
        </div>

        <!-- ⚠ LA BARRE N'EST PAS UNE DÉCORATION : elle dit d'un coup d'œil ce
             qu'un atlas de cinquante fiches contient — ici deux tiers d'orange,
             c'est-à-dire deux tiers de cas où il faut chercher la cause avant de
             toucher. Trois nombres en ligne ne donnent pas cette proportion. -->
        ${connus ? `
          <div class="at-barre" role="img"
               aria-label="${parts.map(([c, n]) => `${n} ${ALERTE[c].mot}`).join(', ')}">
            ${parts.filter(([, n]) => n).map(([c, n]) => `
              <span class="at-barre-part at-barre-${c}" style="flex:${n}"></span>`).join('')}
          </div>` : ''}

        <div class="at-somm-outils">
          ${barreRecherche(etat)}
          <p class="muted small at-somm-aide">
            ${filtre
              ? `${liste.length} fiche${liste.length > 1 ? 's' : ''} sur ${toutes.length}`
              : 'Cliquez un sympt\u00f4me pour ouvrir sa planche. Elle restera affich\u00e9e pendant que vous en comparez d\u2019autres.'}
          </p>
          ${filtre ? '<button type="button" class="at-raz" data-raz="1">Tout revoir</button>' : ''}
        </div>
      </div>

      ${liste.length ? `
        <div class="at-somm-grille">
          ${parFamille(liste).map(([famille, fs], i) => `
            <div class="at-somm-fam" style="--rang:${i}">
              <div class="at-somm-fam-titre">${esc(famille)} <span>${fs.length}</span></div>
              ${fs.map(f => `
                <button type="button" class="at-somm-ligne" data-fiche="${f.numero}">
                  ${jeton(f)}
                  <span class="at-somm-t">${esc(f.titre)}</span>
                </button>`).join('')}
            </div>`).join('')}
        </div>`
      : `<div class="empty">Aucune fiche ne correspond${etat.q ? ` \u00e0 \u00ab ${esc(etat.q)} \u00bb` : ''}${
          etat.couleur ? ` en niveau ${esc(ALERTE[etat.couleur].mot.toLowerCase())}` : ''}.</div>`}
    </div>`;
}

function lier(root, etat, dessine) {
  const depot = root.querySelector('#at-depot');
  if (depot) depot.onchange = () => {
    if (depot.files?.length) deposerPlanches(root, depot.files, dessine);
  };
  root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
    etat.vue = b.dataset.vue; dessine();
  });
  root.querySelectorAll('[data-fiche]').forEach(b => b.onclick = () => {
    etat.ouverte = Number(b.dataset.fiche); dessine();
  });
  // Revenir au sommaire, c'est refermer la fiche : il n'y a pas d'autre état.
  const retour = root.querySelector('[data-sommaire]');
  if (retour) retour.onclick = () => { etat.ouverte = null; dessine(); };

  // ⚠ UN SECOND CLIC SUR LE NIVEAU DÉJÀ CHOISI LE RETIRE. Sans cela, le seul
  // moyen de revoir les cinquante serait de trouver « Tout revoir » ailleurs
  // sur l'écran, alors que le doigt est déjà sur le bouton qui a filtré.
  root.querySelectorAll('[data-couleur]').forEach(b => b.onclick = () => {
    etat.couleur = etat.couleur === b.dataset.couleur ? null : b.dataset.couleur;
    dessine();
  });
  const raz = root.querySelector('[data-raz]');
  if (raz) raz.onclick = () => { etat.couleur = null; etat.q = ''; dessine(); };
  const vider = root.querySelector('[data-vider]');
  if (vider) vider.onclick = () => { etat.q = ''; dessine(); };

  // Passer à la fiche voisine sans repasser par la liste : c'est le geste de
  // quelqu'un qui compare, et il doit coûter un clic.
  root.querySelectorAll('[data-voisine]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.voisine);
    if (n) { etat.ouverte = n; dessine(); }
  });
  // Depuis un signal, on saute à sa fiche : c'est le geste naturel — on vient
  // de lire « Fiche 14 », on veut la voir.
  root.querySelectorAll('[data-vers-fiche]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.versFiche);
    if (!fiches().some(f => f.numero === n)) return toast(`La fiche ${num(n)} n'est pas encore importée`, 'warn');
    etat.vue = 'fiches'; etat.ouverte = n; etat.q = ''; dessine();
  });
  // ⚠ LA RECHERCHE NE REDESSINE PAS À CHAQUE FRAPPE LE CHAMP LUI-MÊME : on
  // relit, on redessine, puis on replace le curseur — sinon il saute au début
  // au deuxième caractère.
  const q = root.querySelector('#at-q');
  if (q) {
    q.oninput = () => {
      etat.q = q.value;
      const pos = q.selectionStart;
      dessine();
      const neuf = root.querySelector('#at-q');
      if (neuf) { neuf.focus(); neuf.setSelectionRange(pos, pos); }
    };
  }
}
