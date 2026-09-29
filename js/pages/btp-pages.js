// Les cinq écrans neufs de BTP Expertise : check-list et rapport pour chacun
// des deux métiers, et l'atlas visuel.
//
// ⚠ ILS SONT CRÉÉS VIDES, ET C'EST DÉLIBÉRÉ (29/09/2026). Mickael a demandé le
// découpage du menu « exactement » tel qu'il l'a écrit, parce qu'il veut y
// ajouter des pages. Le contenu, lui, n'est pas arrivé — et il ne s'invente
// pas : une check-list d'expertise ou la trame d'un rapport engagent le
// cabinet, et se tromper d'un point est pire que de ne rien écrire.
//
// Ce que fait donc chaque écran : il EXISTE, il porte son titre, il est dans
// le menu, et il dit en une phrase ce qu'il attend. Un menu qui promet une
// page absente est un défaut ; une page qui dit ce qu'elle attend est une
// invitation à la remplir.
//
// ⚠ LES ADRESSES SONT PLATES, ET CE N'EST PAS UN CHOIX D'ESTHÉTIQUE. Le
// routeur du CRM ne lit que DEUX segments après le croisillon (`route()` dans
// `js/app.js` : `hash.split('/')` puis `pages['btp_' + param]`), donc
// `#/btp/expertise/checklist` tomberait sur l'accueil de l'activité, en
// silence. Le menu s'emboîte sur trois niveaux, l'adresse reste à deux :
// `#/btp/expertise-checklist`.
import { scope } from '../data/scope.js';
import { esc } from '../ui.js';
import { poserEspace } from './espace.js';
// ⚠ LA COQUILLE VIENT DE `btp.js`, ELLE N'EST PAS RECOPIÉE. Elle porte le menu,
// et deux listes d'onglets auraient cessé de se ressembler au premier ajout —
// l'écart ne se voyant que le jour où un écran n'allume plus rien dans la
// colonne. Aucun cycle d'import : `btp.js` ne connaît pas ce fichier.
import { cadreBtp as cadre } from './btp.js';

const KEY = 'btp';

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

// L'écran en attente de son contenu. Il nomme ce qu'il attend plutôt que de
// dire « bientôt » : quelqu'un qui ouvre la page doit comprendre en une
// seconde ce qu'elle portera, et pouvoir décider de l'écrire.
const enAttente = (quoi, aQuoiCaSert, exemples) => `
  <div class="card">
    <div class="card-head"><h2>${esc(quoi)}</h2></div>
    <div class="empty" style="text-align:left;max-width:640px;margin:0 auto;padding:26px 4px">
      <p style="margin:0 0 12px"><b>Cette page attend son contenu.</b></p>
      <p style="margin:0 0 12px">${esc(aQuoiCaSert)}</p>
      <p style="margin:0 0 6px" class="muted small">Ce qu'on y mettra, par exemple&nbsp;:</p>
      <ul style="margin:0;padding-left:20px" class="muted small">
        ${exemples.map(x => `<li style="margin:3px 0">${esc(x)}</li>`).join('')}
      </ul>
    </div>
  </div>`;

// Une page se réduit à son titre et à son contenu : la coquille, le garde et
// le cycle de vie sont les mêmes pour les cinq, on ne les écrit qu'une fois.
// ⚠ `title` N'EST PAS FACULTATIF : le routeur l'APPELLE (`page.title(param)`)
// pour nommer l'onglet du navigateur et pour les lecteurs d'écran. Sans lui,
// `page.title is not a function` est levé AVANT `render`, et l'écran précédent
// reste à l'affichage — on croit à un lien mort alors que la page existe.
// Constaté sur les cinq écrans d'un coup, dans la console et nulle part ailleurs.
const page = (actif, titre, corps) => ({
  title: () => titre,
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    root.innerHTML = cadre(actif, titre, corps);
    return { destroy: coquille.retirer };
  },
});

export const btpChecklistExpertisePage = page('#/btp/expertise-checklist',
  'BTP Expertise — Check-list expertise',
  enAttente(
    'Check-list expertise',
    "Ce qu'il faut avoir fait, vu ou emporté sur une mission d'expertise — pour que rien ne se perde entre la prise de rendez-vous et la remise du rapport.",
    ['Ce qu\'on prépare avant la visite (pièces à demander au client, matériel)',
     'Ce qu\'on relève sur place, poste par poste',
     'Ce qu\'on vérifie avant d\'envoyer le rapport'],
  ));

export const btpRapportExpertisePage = page('#/btp/expertise-rapport',
  'BTP Expertise — Rapport expertise',
  enAttente(
    'Rapport expertise',
    "La trame du rapport d'expertise : les parties attendues, dans l'ordre, et ce que chacune doit contenir.",
    ['Le plan type du rapport',
     'Les formulations de référence du cabinet',
     'Ce qui ne doit jamais y figurer'],
  ));

export const btpChecklistAmoPage = page('#/btp/amo-checklist',
  'BTP Expertise — Check-list AMO',
  enAttente(
    'Check-list AMO',
    "Ce qu'il faut avoir fait à chaque phase d'une mission d'assistance à maîtrise d'ouvrage — le déroulé est long, et c'est là que des étapes s'oublient.",
    ['Ce qu\'on réunit au cadrage',
     'Ce qu\'on contrôle à la consultation des entreprises',
     'Ce qu\'on vérifie à la réception'],
  ));

export const btpRapportAmoPage = page('#/btp/amo-rapport',
  'BTP Expertise — Rapport AMO',
  enAttente(
    'Rapport AMO',
    "La trame des documents remis au client au fil d'une mission AMO.",
    ['Le compte rendu de réunion de chantier',
     'Le rapport d\'avancement',
     'Le procès-verbal de réception et ses réserves'],
  ));

export const btpAtlasPage = page('#/btp/atlas',
  'BTP Expertise — Atlas visuels',
  enAttente(
    'Atlas visuels',
    "Les images de référence du cabinet : un désordre qu'on reconnaît d'un coup d'œil vaut mieux qu'un paragraphe qui le décrit.",
    ['Des photos de désordres classées par nature (fissures, humidité, charpente…)',
     'Ce que chacune montre, et ce qu\'elle ne prouve pas',
     'Les schémas repris dans les rapports'],
  ));
