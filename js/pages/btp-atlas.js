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
// ⚠ TROIS THÉMATIQUES DEPUIS LE 29/09/2026, ET L'ÉCRAN S'APPELLE « FORMATION »
// (demandé par Mickael). Il ne portait que l'atlas ; il porte maintenant les
// trois choses qui s'apprennent ensemble :
//   1. les FICHES         — reconnaître une pathologie ;
//   2. les SIGNAUX        — savoir quand ce n'est plus son rôle ;
//   3. les VISITES guidées — voir le raisonnement à l'œuvre, de la phrase du
//      client au paragraphe du rapport.
// Elles se tiennent : chaque visite désigne DEUX fiches de l'atlas, celle
// qu'on soupçonne et son « jumeau », et l'écran laisse passer de l'une à
// l'autre. Séparées en trois écrans, ce lien se perdrait.
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

// ⚠ LE TRI EST UNE PRÉFÉRENCE, PAS UNE DONNÉE : il vit dans le navigateur, pas
// en base. Deux personnes ne cherchent pas de la même façon — l'une connaît
// sa famille (« c'est une fissure »), l'autre a un numéro sous les yeux, relevé
// sur une check-list ou cité par un signal d'alerte. Même mécanique que la vue
// de l'agenda RGD ou la période des objectifs BTP.
const CLE_TRI = 'crm_btp_formation_tri';
const lireTri = () => {
  try { return localStorage.getItem(CLE_TRI) === 'numero' ? 'numero' : 'famille'; }
  catch { return 'famille'; }          // navigateur qui refuse le stockage
};
const ecrireTri = (v) => { try { localStorage.setItem(CLE_TRI, v); } catch { /* sans effet */ } };

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

const fiches = () => scope.canBtp ? db.t('btp_atlas_fiches') : [];
const signaux = () => scope.canBtp ? db.t('btp_signaux_alerte') : [];
const visites = () => scope.canBtp ? db.t('btp_visites_guidees') : [];

// Les familles dans l'ordre du document d'origine, pas dans l'ordre
// alphabétique : il va du structurel au cosmétique, et c'est l'ordre dans
// lequel on regarde un bâtiment.
const ORDRE_FAMILLES = [
  'Fissures et lézardes', 'Béton et structure', 'Humidité et infiltrations',
  'Enduits et peintures', 'Sols et revêtements', 'ITE et façades',
  'Toitures et étanchéité',
];
// ⚠ UNE ICÔNE PAR FAMILLE, ET C'EST CE QUI REND LE SOMMAIRE PARCOURABLE.
// À cinquante fiches, les sept en-têtes étaient sept bandeaux identiques : il
// fallait LIRE chaque titre pour trouver sa famille, alors qu'on arrive sur
// cet écran en sachant déjà qu'on cherche une fissure ou de l'humidité. Un
// dessin se repère en balayant la page, un texte non.
//
// ⚠ LA CLÉ EST LE NOM DE LA FAMILLE, tel qu'il est écrit en base : une famille
// qu'on ajouterait demain n'aurait pas d'icône et prendrait le repli, plutôt
// que de faire disparaître son en-tête.
const ICONES_FAMILLE = {
  'Fissures et l\u00e9zardes':      '<path d="M13 3 8.5 10h5L9 21"/><path d="M13.5 10.6 18 13"/>',
  'B\u00e9ton et structure':        '<path d="M4 3h16"/><path d="M4 21h16"/><path d="M8 3v18M16 3v18"/><path d="M8 9h8M8 15h8"/>',
  'Humidit\u00e9 et infiltrations': '<path d="M12 3s5.5 6.2 5.5 10a5.5 5.5 0 0 1-11 0C6.5 9.2 12 3 12 3Z"/>',
  'Enduits et peintures':     '<rect x="3" y="4" width="13" height="6" rx="1.5"/><path d="M16 7h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-7"/><path d="M12 13v3"/><rect x="10" y="16" width="4" height="5" rx="1"/>',
  'Sols et rev\u00eatements':       '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  'ITE et fa\u00e7ades':            '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/><path d="M9 4v8M15 12v8"/>',
  'Toitures et \u00e9tanch\u00e9it\u00e9':   '<path d="M2 12 12 4l10 8"/><path d="M5 11v8h14v-8"/><path d="M9 19v-5h6v5"/>',
};
const iconeFamille = (f) => `<svg class="at-fam-icone" viewBox="0 0 24 24" aria-hidden="true"
  fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
  stroke-linejoin="round">${ICONES_FAMILLE[f] || '<circle cx="12" cy="12" r="8"/>'}</svg>`;

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

// ⚠ UNE ICÔNE PAR THÉMATIQUE, ET C'EST CE QUI LES REND RECONNAISSABLES.
// Les trois cartes étaient trois rectangles blancs avec un chiffre gris : rien
// ne distinguait « Signaux d'alerte » de « Visites guidées » avant d'en avoir
// lu le titre. Un dessin se reconnaît avant d'être lu, et sur un écran qu'on
// rouvre tous les jours c'est ce qui fait gagner le clic.
//
// Dessinées ici, en trait : aucune bibliothèque à charger, elles héritent de
// la couleur du texte (`currentColor`) donc elles suivent l'état de la carte.
const ICONES = {
  // des planches empilées : l'atlas
  fiches: '<rect x="3" y="4" width="13" height="16" rx="2"/><path d="M8 20h11a2 2 0 0 0 2-2V8"/><path d="M7 9h5M7 13h5"/>',
  // le triangle : on s'arrête
  signaux: '<path d="M12 4 2.7 20h18.6L12 4Z"/><path d="M12 10v4"/><path d="M12 17.2v.1"/>',
  // trois jalons reliés : un parcours, pas un catalogue
  visites: '<circle cx="5" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 6.6c3 .6 3 4.2 4.4 9.6M14 17c1.8-5 2-9 4-10.2"/>',
};
const icone = (cle) => `<svg class="fm-icone" viewBox="0 0 24 24" aria-hidden="true"
  fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
  stroke-linejoin="round">${ICONES[cle] || ''}</svg>`;

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
// ⚠ ELLE DOIT RENDRE L'ORDRE RÉELLEMENT AFFICHÉ, sinon « suivante » saute
// ailleurs que sous les yeux : c'est elle qui donne la fiche précédente et la
// suivante aux flèches du bandeau.
const aPlat = (liste, tri) => tri === 'numero'
  ? liste.slice().sort((a, b) => a.numero - b.numero)
  : parFamille(liste).flatMap(([, l]) => l);

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
// ⚠ UNE SEULE FONCTION POUR LES DEUX IMAGES DE L'ÉCRAN — la planche d'une
// fiche et la photo d'une visite. Elles posent exactement le même problème
// (URL signée, valeur `data:` en démo, fichier absent), et deux copies
// finissent toujours par diverger : l'une saurait distinguer une adresse déjà
// faite, l'autre non, et le défaut ne se verrait que dans un seul des deux
// volets.
async function ouvrirImage(root, selecteur, chemin, legende) {
  const zone = root.querySelector(selecteur);
  if (!zone) return;
  zone.innerHTML = '<div class="empty">Ouverture\u2026</div>';
  if (!chemin) {
    zone.innerHTML = `<div class="empty">L'image n'a pas encore \u00e9t\u00e9 d\u00e9pos\u00e9e.</div>`;
    return;
  }
  try {
    // \u26a0 DEUX SORTES DE VALEURS DANS LA M\u00caME COLONNE, ET IL FAUT LES DISTINGUER.
    // En production c'est un CHEMIN dans le seau priv\u00e9, qu'il faut faire
    // signer. En d\u00e9monstration c'est une adresse `data:` \u2014 une image dessin\u00e9e
    // dans le jeu d'exemple, puisqu'il n'y a ni seau ni r\u00e9seau. Passer la
    // seconde \u00e0 `fileUrl` la fait chercher dans un magasin de fichiers qui ne
    // la conna\u00eet pas : \u00ab Fichier introuvable \u00bb, et le cadre reste vide.
    // Le test porte sur \u00ab c'est d\u00e9j\u00e0 une adresse \u00bb, jamais sur \u00ab ce n'est pas
    // un chemin \u00bb \u2014 la seconde formule laisserait passer une URL http un jour.
    const brut = String(chemin);
    const url = /^(data:|https?:)/.test(brut) ? brut : await db.fileUrl(brut, { bucket: SEAU });
    zone.innerHTML = `<img src="${esc(url)}" alt="${esc(legende)}" class="at-img">`;
  } catch (e) {
    // Un cadre vide se lit comme \u00ab le CRM n'a pas repris la fiche \u00bb alors que
    // c'est le FICHIER qui manque. On dit laquelle des deux \u2014 et on n'affiche
    // pas l'adresse enti\u00e8re, qui peut faire plusieurs milliers de caract\u00e8res.
    zone.innerHTML = `<div class="empty">Image introuvable dans le stockage
      (${esc(String(chemin).slice(0, 60))}).<br>
      <span class="small muted">${esc(e.message || '')}</span></div>`;
  }
}

const ouvrirPlanche = (root, fiche) =>
  ouvrirImage(root, '#at-planche', fiche.image,
              `Fiche ${num(fiche.numero)} \u2014 ${fiche.titre}`);

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
  // Les planches de l'atlas ET les photos des visites : même seau, même
  // droit, même bouton. Deux boutons pour le même geste feraient chercher
  // lequel prend quoi.
  const connues = new Set([...fiches().map(f => f.image), ...visites().map(v => v.image)]);
  const bons = [...fichiers].filter(f => connues.has(f.name));
  const ecartes = [...fichiers].length - bons.length;
  if (!bons.length) {
    return toast(`Aucun fichier ne porte un nom attendu (fiche-01.jpeg, visite-01.jpeg …). ${ecartes} écarté(s).`, 'warn');
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
  toast(`${ok} image${ok > 1 ? 's' : ''} déposée${ok > 1 ? 's' : ''}`
    + (ecartes ? ` · ${ecartes} nom${ecartes > 1 ? 's' : ''} inattendu${ecartes > 1 ? 's' : ''}` : '')
    + (rates.length ? ` · ${rates.length} en échec` : ''), rates.length ? 'warn' : 'ok');
  if (rates.length) console.warn(['Planches non déposées :', ...rates].join(String.fromCharCode(10)));
  dessine();
}

// ---------------------------------------------------------------- L'écran
export const btpAtlasPage = {
  title: () => 'BTP Expertise — Formation',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // `vue` : 'fiches' ou 'signaux'. `ouverte` : le numéro de fiche affiché.
    // `vue` : 'fiches' | 'signaux' | 'visites'. `ouverte` : le numéro affiché
    // — une fiche ou une visite selon la vue, jamais les deux à la fois.
    // `couleur` : le niveau d'alerte retenu, ou null pour les trois.
    const etat = { vue: 'fiches', ouverte: null, q: '', couleur: null, tri: lireTri() };

    // ⚠ UNE FICHE S'OUVRE PAR L'ADRESSE : `#/btp/atlas?fiche=14`. C'est ce qui
    // permet à la check-list de visite de renvoyer VRAIMENT sur la planche au
    // lieu de déposer l'utilisateur sur le sommaire avec un numéro à chercher.
    // Le routeur retire déjà la chaîne de requête du nom de page (`route()` dans
    // `app.js`), l'écran la relit lui-même — même mécanique que les fiches de
    // poste RGD.
    //
    // ⚠ UNE FICHE NON IMPORTÉE EST IGNORÉE plutôt que suivie : on se poserait
    // sinon sur un panneau vide dont rien ne dirait pourquoi.
    const demande = new URLSearchParams(location.hash.split('?')[1] || '');
    const nFiche = Number(demande.get('fiche'));
    if (nFiche && fiches().some(f => f.numero === nFiche)) {
      etat.vue = 'fiches'; etat.ouverte = nFiche;
    }
    const nVisite = Number(demande.get('visite'));
    if (nVisite && visites().some(v => v.numero === nVisite)) {
      etat.vue = 'visites'; etat.ouverte = nVisite;
    }

    const dessine = () => {
      const toutes = fiches();
      const filtrees = filtrer(toutes, etat);
      const ouverte = toutes.find(f => f.numero === etat.ouverte) || null;

      // ⚠ LES TROIS THÉMATIQUES SONT DES CARTES, PAS DES PASTILLES. Elles
      // étaient deux petites étiquettes dans un coin de l'en-tête ; à trois,
      // chacune porte son rôle en une phrase, parce que « Signaux d'alerte »
      // et « Visites guidées » ne disent pas d'eux-mêmes ce qu'on y trouve.
      // C'est un écran de FORMATION : il commence par dire ce qu'on y apprend.
      const THEMES = [
        { cle: 'fiches',  titre: 'Fiches Atlas visuels', n: toutes.length,
          quoi: 'Reconna\u00eetre une pathologie sur la planche' },
        { cle: 'signaux', titre: "Signaux d'alerte", n: signaux().length,
          quoi: 'Savoir quand ce n\u2019est plus votre r\u00f4le' },
        { cle: 'visites', titre: 'Les visites techniques guid\u00e9es', n: visites().length,
          quoi: 'Le raisonnement complet, du client au rapport' },
      ];
      const corps = etat.vue === 'signaux' ? vueSignaux()
                  : etat.vue === 'visites' ? vueVisites(etat)
                  : vueFiches(filtrees, ouverte, etat);

      root.innerHTML = cadre('#/btp/atlas', 'Formation', `
        <!-- \u26a0 LE CHOIX SE FAIT SUR FOND PROFOND, LE CONTENU SUR FOND CLAIR.
             L'\u00e9cran \u00e9tait uniform\u00e9ment blanc : trois cartes p\u00e2les au-dessus
             d'une quatri\u00e8me, rien ne disait o\u00f9 l'on choisissait et o\u00f9 l'on
             lisait. Deux zones de valeur oppos\u00e9e donnent cette lecture sans
             un mot, et la carte du contenu vient \u00e0 cheval dessus. -->
        <div class="fm-barre">
          <div class="fm-themes" role="tablist" aria-label="Th\u00e9matiques de la formation">
            ${THEMES.map(o => `
              <button type="button" class="fm-theme${etat.vue === o.cle ? ' on' : ''}"
                data-vue="${o.cle}" role="tab" aria-selected="${etat.vue === o.cle}">
                ${icone(o.cle)}
                <span class="fm-theme-t">
                  <b>${esc(o.titre)}</b>
                  <span>${esc(o.quoi)}</span>
                </span>
                <span class="fm-theme-n">${o.n}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="card fm-contenu">
          ${scope.isDirection && !db.demo ? `
            <div class="card-head">
              <span class="grow"></span>
              <label class="btn ghost sm" style="cursor:pointer">
                D\u00e9poser des images
                <input type="file" id="at-depot" accept="image/jpeg,image/png,image/webp" multiple hidden>
              </label>
            </div>` : ''}
          ${corps}
        </div>`);

      lier(root, etat, dessine);
      if (etat.vue === 'fiches' && ouverte) ouvrirPlanche(root, ouverte);
      if (etat.vue === 'visites' && etat.ouverte) {
        const v = visites().find(x => x.numero === etat.ouverte);
        if (v) ouvrirImage(root, '#vg-photo', v.image, `Visite ${num(v.numero)} — ${v.titre}`);
      }
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
  const ordre = aPlat(liste, etat.tri);
  const i = ordre.findIndex(f => f.numero === ouverte.numero);
  const avant = i > 0 ? ordre[i - 1] : null;
  const apres = i >= 0 && i < ordre.length - 1 ? ordre[i + 1] : null;
  const a = ALERTE[ouverte.code_couleur];

  return `
    <div class="at-corps">
      <div class="at-index">
        <button type="button" class="at-retour" data-sommaire="1">← Sommaire des ${fiches().length} fiches</button>
        ${barreRecherche(etat, true)}
        <!-- \u26a0 L'INDEX SUIT LE M\u00caME ORDRE QUE LE SOMMAIRE. Choisir \u00ab par
             num\u00e9ro \u00bb puis ouvrir une planche et retrouver l'index rang\u00e9 par
             famille ferait chercher deux fois : c'est le m\u00eame r\u00e9glage, il vaut
             pour les deux. Les fl\u00e8ches \u2039 \u203a suivent aussi, par aPlat. -->
        ${!liste.length ? '<div class="empty">Aucune fiche ne correspond.</div>'
          : etat.tri === 'numero' ? liste.slice().sort((a, b) => a.numero - b.numero).map(f => `
              <button type="button" class="at-ligne${f.numero === etat.ouverte ? ' on' : ''}"
                      data-fiche="${f.numero}" title="${esc(f.famille)}">
                ${jeton(f)}
                <span class="at-titre">${esc(f.titre)}</span>
              </button>`).join('')
          : parFamille(liste).map(([famille, l]) => `
          <div class="at-fam">
            <div class="at-fam-titre">${iconeFamille(famille)}${esc(famille)}</div>
            ${l.map(f => `
              <button type="button" class="at-ligne${f.numero === etat.ouverte ? ' on' : ''}" data-fiche="${f.numero}">
                ${jeton(f)}
                <span class="at-titre">${esc(f.titre)}</span>
              </button>`).join('')}
          </div>`).join('')}
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
          <!-- \u26a0 DEUX FA\u00c7ONS DE CHERCHER, ET AUCUNE N'EST LA BONNE POUR TOUT LE
               MONDE. Par famille quand on part du sympt\u00f4me (\u00ab c'est une
               fissure \u00bb) ; par num\u00e9ro quand on en a un sous les yeux \u2014 relev\u00e9
               sur une check-list, cit\u00e9 par un signal d'alerte ou par une visite
               guid\u00e9e. Le choix est m\u00e9moris\u00e9 : on ne le refait pas chaque matin. -->
          <div class="at-tri" role="group" aria-label="Ordre du sommaire">
            <button type="button" class="at-tri-b${etat.tri === 'famille' ? ' on' : ''}"
              data-tri="famille" aria-pressed="${etat.tri === 'famille'}">Par famille</button>
            <button type="button" class="at-tri-b${etat.tri === 'numero' ? ' on' : ''}"
              data-tri="numero" aria-pressed="${etat.tri === 'numero'}">Par num\u00e9ro</button>
          </div>
          <p class="muted small at-somm-aide">
            ${filtre
              ? `${liste.length} fiche${liste.length > 1 ? 's' : ''} sur ${toutes.length}`
              : 'Cliquez un sympt\u00f4me pour ouvrir sa planche. Elle restera affich\u00e9e pendant que vous en comparez d\u2019autres.'}
          </p>
          ${filtre ? '<button type="button" class="at-raz" data-raz="1">Tout revoir</button>' : ''}
        </div>
      </div>

      ${liste.length ? (etat.tri === 'numero' ? `
        <!-- \u26a0 PAR NUM\u00c9RO, LA FAMILLE NE DISPARA\u00ceT PAS, elle passe \u00e0 droite en
             ic\u00f4ne : on a choisi de ne plus ranger par famille, pas de ne plus
             savoir de laquelle il s'agit. Sans elle, une fiche trouv\u00e9e par son
             num\u00e9ro ne dirait plus dans quel chapitre la relire. -->
        <div class="at-somm-suite">
          ${liste.slice().sort((a, b) => a.numero - b.numero).map(f => `
            <button type="button" class="at-somm-ligne est-suite" data-fiche="${f.numero}"
                    title="${esc(f.famille)}">
              ${jeton(f)}
              <span class="at-somm-t">${esc(f.titre)}</span>
              <span class="at-somm-fam-mini">${iconeFamille(f.famille)}</span>
            </button>`).join('')}
        </div>` : `
        <div class="at-somm-grille">
          ${parFamille(liste).map(([famille, fs], i) => `
            <div class="at-somm-fam" style="--rang:${i}">
              <div class="at-somm-fam-titre">
                ${iconeFamille(famille)}${esc(famille)}
                <span>${fs.length}</span>
              </div>
              ${fs.map(f => `
                <button type="button" class="at-somm-ligne" data-fiche="${f.numero}">
                  ${jeton(f)}
                  <span class="at-somm-t">${esc(f.titre)}</span>
                </button>`).join('')}
            </div>`).join('')}
        </div>`)
      : `<div class="empty">Aucune fiche ne correspond${etat.q ? ` \u00e0 \u00ab ${esc(etat.q)} \u00bb` : ''}${
          etat.couleur ? ` en niveau ${esc(ALERTE[etat.couleur].mot.toLowerCase())}` : ''}.</div>`}
    </div>`;
}

// --------------------------------------------- Les visites techniques guidées
//
// ⚠ UNE VISITE N'EST PAS UNE FICHE DE PLUS, et la présenter comme telle
// viderait le volet de son sens. Une fiche décrit un désordre hors contexte ;
// une visite montre QUELQU'UN QUI RÉFLÉCHIT — il entend une phrase, il
// observe, il soupçonne, il écarte le jumeau, il tranche, il écrit. C'est la
// séquence qu'on vient apprendre, donc l'écran la déroule dans l'ordre, du
// haut vers le bas, et numérote les étapes.
//
// ⚠ LA LISTE MONTRE LA VILLE ET LE BIEN, pas seulement le titre : « la
// fissure au-dessus de la porte » ne dit pas si c'est une maison des années
// 70 ou un parking des années 60, et c'est précisément ce qui fait qu'on
// reconnaît son propre chantier dans le cas.
function vueVisites(etat) {
  const toutes = visites();
  if (!toutes.length) {
    return `<div class="empty">Aucune visite. Le contenu s'importe \u00e0 la main :
      il n'est pas dans le d\u00e9p\u00f4t, c'est un document sous licence.</div>`;
  }
  const q = etat.q.trim().toLowerCase();
  const liste = toutes
    .filter(v => (!etat.couleur || v.code_couleur === etat.couleur)
      && (!q || [v.titre, v.ville, v.contexte, v.demande, v.diagnostic]
            .some(x => (x || '').toLowerCase().includes(q))
          || String(v.numero) === q || num(v.numero) === q))
    .sort((a, b) => a.numero - b.numero);
  const ouverte = toutes.find(v => v.numero === etat.ouverte) || null;

  if (ouverte) return unCas(ouverte, liste, etat);

  const compte = (c) => toutes.filter(v => v.code_couleur === c).length;
  return `
    <div class="at-somm">
      <div class="at-somm-tete">
        <div class="at-somm-titre">
          <h3>Les ${toutes.length} visites guid\u00e9es</h3>
          <div class="at-somm-code" role="group" aria-label="Filtrer par niveau d'alerte">
            ${['vert', 'orange', 'rouge'].map(c => `
              <button type="button" class="at-code at-code-${c}${etat.couleur === c ? ' on' : ''}"
                data-couleur="${c}" aria-pressed="${etat.couleur === c}"
                title="${esc(ALERTE[c].phrase)}">
                <span class="at-past at-past-${c}"></span>${esc(ALERTE[c].mot)}<b>${compte(c)}</b>
              </button>`).join('')}
          </div>
        </div>
        <div class="at-somm-outils">
          ${barreRecherche(etat)}
          <p class="muted small at-somm-aide">
            ${etat.couleur || etat.q ? `${liste.length} visite${liste.length > 1 ? 's' : ''} sur ${toutes.length}`
              : 'Six \u00e9tapes \u00e0 chaque fois : la demande, ce qu\u2019on observe, le jumeau \u00e0 \u00e9carter, les v\u00e9rifications, la d\u00e9cision, ce qu\u2019on \u00e9crit.'}
          </p>
          ${etat.couleur || etat.q ? '<button type="button" class="at-raz" data-raz="1">Tout revoir</button>' : ''}
        </div>
      </div>
      ${liste.length ? `
        <div class="vg-grille">
          ${liste.map((v, i) => `
            <button type="button" class="vg-carte est-${esc(v.code_couleur || 'nul')}"
                    data-visite="${v.numero}" style="--rang:${i}">
              <!-- Le num\u00e9ro en filigrane : il donne \u00e0 la carte un point
                   d'accroche et rappelle qu'on parcourt une s\u00e9rie. Il est
                   d\u00e9coratif, le jeton lisible reste au-dessus. -->
              <span class="vg-fond" aria-hidden="true">${num(v.numero)}</span>
              <span class="vg-carte-tete">
                ${jeton(v)}
                <span class="vg-lieu">${esc(v.ville || '')}</span>
              </span>
              <b class="vg-carte-t">${esc(v.titre)}</b>
              <span class="vg-carte-c">${esc(v.contexte || '')}</span>
              <!-- Les deux fiches en pied : c'est la promesse du cas, et ce
                   qui le relie \u00e0 l'atlas. -->
              <span class="vg-carte-vs">
                <span>fiche ${num(v.fiche_soupcon)}</span> contre
                <span>fiche ${num(v.fiche_jumeau)}</span>
              </span>
            </button>`).join('')}
        </div>`
      : `<div class="empty">Aucune visite ne correspond.</div>`}
    </div>`;
}

// ⚠ LES SIX ÉTAPES SONT NUMÉROTÉES ET DANS L'ORDRE, jamais réorganisées « pour
// que ça tienne mieux à l'écran » : l'ordre EST l'enseignement. Mettre le
// diagnostic en haut, par exemple, donnerait la réponse avant la question et
// réduirait le cas à une fiche.
function unCas(v, liste, etat) {
  const i = liste.findIndex(x => x.numero === v.numero);
  const avant = i > 0 ? liste[i - 1] : null;
  const apres = i >= 0 && i < liste.length - 1 ? liste[i + 1] : null;
  const a = ALERTE[v.code_couleur];
  // \u26a0 LES SIX \u00c9TAPES SONT UNE FRISE, PAS SIX ENCADR\u00c9S. Six cartes
  // identiques empil\u00e9es se lisent comme six rubriques ind\u00e9pendantes ; un
  // trait qui les relie dit qu'elles se SUIVENT \u2014 et c'est tout ce que la
  // m\u00e9thode enseigne. Le trait est port\u00e9 par le conteneur, pas par les
  // \u00e9tapes : sur la derni\u00e8re il s'arr\u00eaterait au milieu du num\u00e9ro.
  const etape = (n, titre, corps, classe = '') => `
    <section class="vg-etape ${classe}">
      <div class="vg-etape-tete">
        <span class="vg-etape-n">${n}</span>
        <h4>${esc(titre)}</h4>
      </div>
      <div class="vg-etape-corps">${corps}</div>
    </section>`;
  const puces = (l) => `<ul class="vg-puces">${(l || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  // ⚠ UN RENVOI VERS UNE FICHE NON IMPORTÉE NE DOIT PAS ÊTRE UN LIEN MORT :
  // on l'affiche en clair plutôt que de promettre une planche absente.
  const versFiche = (n, titre, role) => {
    const existe = fiches().some(f => f.numero === n);
    return `<div class="vg-fiche vg-fiche-${role}">
      <span class="vg-fiche-role">${role === 'soupcon' ? 'On soup\u00e7onne' : '\u00c0 \u00e9carter'}</span>
      ${existe
        ? `<button type="button" class="vg-fiche-lien" data-vers-fiche="${n}">Fiche ${num(n)} \u2014 ${esc(titre || '')} \u2192</button>`
        : `<span class="vg-fiche-lien est-absente">Fiche ${num(n)} \u2014 ${esc(titre || '')} <em>(non import\u00e9e)</em></span>`}
    </div>`;
  };

  return `
    <div class="vg-cas">
      <div class="at-bandeau${a ? ' est-' + v.code_couleur : ''}">
        ${jeton(v)}
        <div class="at-bandeau-t">
          <b>${esc(v.titre)}</b>
          <span>${esc(v.ville || '')}${v.contexte ? ' \u00b7 ' + esc(v.contexte) : ''}</span>
        </div>
        <span class="grow"></span>
        <div class="at-nav">
          <button type="button" class="at-fleche" data-voisine-visite="${avant ? avant.numero : ''}"
            ${avant ? `title="${esc(num(avant.numero) + ' \u00b7 ' + avant.titre)}"` : 'disabled'}>\u2039</button>
          <button type="button" class="at-fleche" data-voisine-visite="${apres ? apres.numero : ''}"
            ${apres ? `title="${esc(num(apres.numero) + ' \u00b7 ' + apres.titre)}"` : 'disabled'}>\u203a</button>
        </div>
        <button type="button" class="at-retour" data-sommaire="1">\u2190 Les ${visites().length} visites</button>
      </div>

      <div class="vg-corps">
        <div class="vg-colonne vg-frise">
          ${etape(1, 'La demande',
            `<blockquote class="vg-citation">${esc(v.demande || '')}</blockquote>
             <p class="vg-note">Les mots du client : ils contiennent souvent d\u00e9j\u00e0 l\u2019indice d\u00e9cisif.</p>`)}
          ${etape(2, "Ce que j'ai observ\u00e9", puces(v.observations))}
          ${etape(3, "Le jumeau \u00e0 \u00e9carter", `
            <div class="vg-jumeaux">
              ${versFiche(v.fiche_soupcon, v.soupcon_titre, 'soupcon')}
              <span class="vg-vs">contre</span>
              ${versFiche(v.fiche_jumeau, v.jumeau_titre, 'jumeau')}
            </div>
            ${v.detail ? `<p class="vg-detail"><em>Le d\u00e9tail qui les s\u00e9pare</em>${esc(v.detail)}</p>` : ''}`)}
          ${etape(4, 'Les v\u00e9rifications', puces(v.verifications))}
        </div>

        <div class="vg-colonne">
          <!-- ⚠ LA PHOTO EST HORS DE LA FRISE : ce n'est pas une étape du
               raisonnement, et le trait qui relie les étapes la longeait sur
               toute sa hauteur comme si elle en était une. -->
          ${v.image ? `<div class="vg-photo" id="vg-photo"></div>` : ''}
          <div class="vg-frise">
          ${etape(5, 'Le diagnostic', `
            ${a ? `<span class="at-niveau at-niveau-${v.code_couleur}">${esc(a.mot)} \u00b7 ${esc(a.phrase)}</span>` : ''}
            <p>${esc(v.diagnostic || '')}</p>
            ${v.intervention ? `<p class="vg-inter"><em>Intervention conseill\u00e9e</em>${esc(v.intervention)}</p>` : ''}`,
            'est-' + (v.code_couleur || 'nul'))}
          ${etape(6, 'Ce qu\u2019on \u00e9crit au client', `
            <blockquote class="vg-rapport">${esc(v.extrait_rapport || '')}</blockquote>
            <button type="button" class="at-raz vg-copier" data-copier="${v.numero}">Copier ce paragraphe</button>`)}
          </div>
          <div class="vg-double">
            ${v.erreur ? `<div class="vg-erreur"><em>L\u2019erreur \u00e0 ne pas faire</em>${esc(v.erreur)}</div>` : ''}
            ${v.lecon ? `<div class="vg-lecon"><em>La le\u00e7on</em>${esc(v.lecon)}</div>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

function lier(root, etat, dessine) {
  const depot = root.querySelector('#at-depot');
  if (depot) depot.onchange = () => {
    if (depot.files?.length) deposerPlanches(root, depot.files, dessine);
  };
  // ⚠ CHANGER DE THÉMATIQUE REFERME CE QUI ÉTAIT OUVERT : `ouverte` porte un
  // numéro, et le 14 désigne la fiche 14 d'un côté, la visite 14 de l'autre.
  // Le garder ferait s'ouvrir un objet qu'on n'a pas demandé.
  root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
    if (etat.vue !== b.dataset.vue) { etat.vue = b.dataset.vue; etat.ouverte = null; etat.q = ''; }
    dessine();
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
  root.querySelectorAll('[data-tri]').forEach(b => b.onclick = () => {
    if (etat.tri === b.dataset.tri) return;      // deja choisi : rien à faire
    etat.tri = b.dataset.tri; ecrireTri(etat.tri); dessine();
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
  root.querySelectorAll('[data-visite]').forEach(b => b.onclick = () => {
    etat.ouverte = Number(b.dataset.visite); dessine();
  });
  root.querySelectorAll('[data-voisine-visite]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.voisineVisite);
    if (n) { etat.ouverte = n; dessine(); }
  });
  // ⚠ LE PARAGRAPHE DU RAPPORT SE COPIE : c'est son usage, il est écrit pour
  // être collé dans un rapport et adapté. Le sélectionner à la souris dans
  // une citation de dix lignes rate un mot une fois sur deux.
  const copier = root.querySelector('[data-copier]');
  if (copier) copier.onclick = async () => {
    const v = visites().find(x => x.numero === Number(copier.dataset.copier));
    try {
      await navigator.clipboard.writeText(v?.extrait_rapport || '');
      toast('Paragraphe copi\u00e9', 'ok');
    } catch { toast('Copie refus\u00e9e par le navigateur', 'warn'); }
  };
  // Depuis un signal, on saute à sa fiche : c'est le geste naturel — on vient
  // de lire « Fiche 14 », on veut la voir.
  // Depuis un signal OU depuis une visite : on saute à la fiche, ce qui veut
  // dire changer de thématique. Le filtre par couleur tombe aussi — sinon la
  // fiche demandée peut ne pas être dans la sélection et l'index s'ouvre sans
  // elle.
  root.querySelectorAll('[data-vers-fiche]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.versFiche);
    if (!fiches().some(f => f.numero === n)) return toast(`La fiche ${num(n)} n'est pas encore importée`, 'warn');
    etat.vue = 'fiches'; etat.ouverte = n; etat.q = ''; etat.couleur = null; dessine();
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
