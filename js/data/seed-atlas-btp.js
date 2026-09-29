// Jeu de démonstration de l'Atlas BTP — INVENTÉ DE BOUT EN BOUT.
//
// ⚠ AUCUNE LIGNE DU VRAI ATLAS N'EST ICI, ET C'EST LA RAISON D'ÊTRE DU
// FICHIER. Le contenu réel est un produit commercial tiers (mention « usage
// personnel ») et ce dépôt est PUBLIC : recopier trois vraies fiches « pour
// montrer » les publierait aussi sûrement que les cinquante. Les six fiches
// et les deux signaux ci-dessous sont des textes écrits pour la démonstration,
// qui ressemblent à ce que l'écran affichera sans rien emprunter.
//
// ⚠ LES PLANCHES SONT DESSINÉES ICI, en SVG encodé dans l'adresse. Le mode
// démo n'a ni seau ni réseau : une image distante ferait un cadre cassé, et
// une vraie planche ferait exactement ce qu'on cherche à éviter. Même principe
// que les photos du jeu de démo des réalisations.

// Une planche factice : le numéro, un titre, et trois bandes qui évoquent la
// mise en page d'une fiche sans en reproduire aucune.
// ⚠ LE BAS DE LA PLANCHE DOIT DIRE LA MÊME CHOSE QUE LA PASTILLE. Les six
// planches annonçaient « VERT · surveiller » en dur : dès que la fiche a porté
// un niveau d'alerte, la vignette contredisait l'index sur quatre fiches sur
// six — et c'est exactement l'écran où l'on vient vérifier ce qu'annonce la
// couleur. En démo comme en production, les deux viennent de la même valeur.
const NIVEAU = {
  vert:   { fond: '#e9f7ee', encre: '#1c7a41', texte: 'VERT · surveiller et planifier' },
  orange: { fond: '#fff4e5', encre: '#a35a00', texte: 'ORANGE · chercher la cause' },
  rouge:  { fond: '#fdecea', encre: '#a32a1f', texte: 'ROUGE · sécuriser, appeler un spécialiste' },
};

const planche = (n, titre, teinte, alerte) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1350" viewBox="0 0 900 1350">
    <rect width="900" height="1350" fill="#ffffff"/>
    <rect width="900" height="150" fill="${teinte}"/>
    <text x="48" y="78" font-family="Arial" font-size="34" font-weight="bold" fill="#ffffff">FICHE ${String(n).padStart(2, '0')}</text>
    <text x="48" y="122" font-family="Arial" font-size="26" fill="#ffffff">${titre}</text>
    <rect x="48" y="200" width="804" height="360" rx="10" fill="#eceff3"/>
    <text x="450" y="390" font-family="Arial" font-size="24" fill="#8a94a6" text-anchor="middle">Planche d'exemple — mode démonstration</text>
    <rect x="48" y="600" width="804" height="120" rx="10" fill="#f6f7f9"/>
    <rect x="48" y="750" width="804" height="120" rx="10" fill="#f6f7f9"/>
    <rect x="48" y="900" width="804" height="200" rx="10" fill="#fff4e5"/>
    <text x="72" y="950" font-family="Arial" font-size="20" font-weight="bold" fill="#a35a00">Le jumeau à écarter</text>
    <rect x="48" y="1140" width="804" height="90" rx="10" fill="${(NIVEAU[alerte] || { fond: '#f0f1f3' }).fond}"/>
    <text x="72" y="1195" font-family="Arial" font-size="20" font-weight="bold" fill="${(NIVEAU[alerte] || { encre: '#6b6f76' }).encre}">${(NIVEAU[alerte] || { texte: "Niveau d'alerte non renseign\u00e9" }).texte}</text>
  </svg>`);

// ⚠ LA FICHE 45 N'A VOLONTAIREMENT AUCUN NIVEAU D'ALERTE. C'est le seul
// endroit où l'état « non renseigné » — pastille grise, planche neutre — peut
// s'éprouver : en production les cinquante fiches en portent un, donc ce cas
// ne se verrait qu'au jour où quelqu'un ajoute une fiche sans le remplir. Ne
// pas « corriger » en lui donnant du vert : ce serait affirmer « à surveiller »
// d'une fiche dont on ne sait rien.
// La photo d'une visite : un cadre paysage, pour que l'\u00e9cran ait la bonne
// proportion \u00e0 l'essai. Aucune image r\u00e9elle ici, m\u00eame raison que les planches.
const photoDemo = (n, titre, teinte) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="933" viewBox="0 0 1400 933">
    <rect width="1400" height="933" fill="#eceff3"/>
    <rect x="60" y="60" width="1280" height="813" rx="18" fill="#ffffff"/>
    <circle cx="700" cy="420" r="150" fill="none" stroke="${teinte}" stroke-width="14"/>
    <text x="700" y="640" font-family="Arial" font-size="34" fill="#8a94a6" text-anchor="middle">Photo d'exemple \u2014 mode d\u00e9monstration</text>
    <text x="700" y="700" font-family="Arial" font-size="28" fill="#b3bac6" text-anchor="middle">Visite ${String(n).padStart(2, '0')} \u00b7 ${titre}</text>
  </svg>`);

export const SEED_ATLAS_BTP = {
  btp_atlas_fiches: [
    { numero: 2, famille: 'Fissures et lézardes', titre: 'Micro-fissures en réseau sur enduit',
      image: planche(2, 'Micro-fissures en réseau sur enduit', '#4b5bd6', 'vert'), code_couleur: 'vert' },
    { numero: 5, famille: 'Fissures et lézardes', titre: 'Fissure horizontale en partie basse',
      image: planche(5, 'Fissure horizontale en partie basse', '#4b5bd6', 'orange'), code_couleur: 'orange' },
    { numero: 14, famille: 'Béton et structure', titre: 'Plafond qui perd des fragments',
      image: planche(14, 'Plafond qui perd des fragments', '#b4541f', 'rouge'), code_couleur: 'rouge' },
    { numero: 19, famille: 'Humidité et infiltrations', titre: 'Bande humide en pied de mur',
      image: planche(19, 'Bande humide en pied de mur', '#1d7fa3', 'orange'), code_couleur: 'orange' },
    { numero: 34, famille: 'Sols et revêtements', titre: 'Carrelage qui sonne creux',
      image: planche(34, 'Carrelage qui sonne creux', '#6b6f76', 'vert'), code_couleur: 'vert' },
    { numero: 45, famille: 'Toitures et étanchéité', titre: 'Tuiles déplacées après coup de vent',
      image: planche(45, 'Tuiles déplacées après coup de vent', '#2f7d4f', null) },
  ],
  // \u26a0 DEUX VISITES INVENT\u00c9ES, de bout en bout comme le reste du fichier.
  // Elles suffisent \u00e0 \u00e9prouver l'\u00e9cran : les six \u00e9tapes, le renvoi vers une
  // fiche PR\u00c9SENTE (02) et vers une fiche ABSENTE du jeu de d\u00e9mo (07), les
  // deux sens du filtre par couleur, et la photo.
  btp_visites_guidees: [
    { numero: 1, titre: 'La fissure qui suit le linteau', ville: 'Ville-Exemple',
      contexte: 'Maison de d\u00e9monstration, murs en ma\u00e7onnerie',
      demande: "Une fissure est apparue au-dessus d'une porte. Je peux repeindre ?",
      observations: ['Fissure fine partant de l\u2019angle de l\u2019ouverture.',
                     'Longueur stable, bords nets.',
                     'Aucune autre fissure dans la pi\u00e8ce.'],
      fiche_soupcon: 2, soupcon_titre: 'Micro-fissures en r\u00e9seau sur enduit',
      fiche_jumeau: 7, jumeau_titre: 'Fiche absente du jeu de d\u00e9monstration',
      detail: "Le jumeau d\u00e9signe ici une fiche que la d\u00e9monstration ne contient pas : c'est volontaire, l'\u00e9cran doit le dire au lieu d'offrir un lien mort.",
      verifications: ['Rep\u00e8res au crayon dat\u00e9s aux extr\u00e9mit\u00e9s.',
                      'Contr\u00f4le six semaines plus tard : aucun allongement.'],
      code_couleur: 'vert',
      diagnostic: 'Fissure de concentration de contraintes sur le linteau, stable.',
      intervention: 'Rebouchage avec treillis diagonal \u00e0 l\u2019angle.',
      erreur: 'Refermer avant d\u2019avoir mesur\u00e9 : si elle travaillait, elle se rouvrirait apr\u00e8s les travaux.',
      lecon: 'On ne referme rien avant d\u2019avoir mesur\u00e9 deux fois, \u00e0 six semaines d\u2019intervalle.',
      extrait_rapport: 'Lors de la visite du [date], on observe une fissure en biais \u00e0 l\u2019angle sup\u00e9rieur de l\u2019ouverture. La surveillance sur six semaines n\u2019a mis en \u00e9vidence aucune variation. La fissure est consid\u00e9r\u00e9e comme non \u00e9volutive.',
      image: photoDemo(1, 'La fissure qui suit le linteau', '#2e9e5b') },
    { numero: 2, titre: 'Le plafond qui perd des morceaux', ville: 'Ville-Exemple',
      contexte: 'Immeuble de d\u00e9monstration, plancher \u00e0 entrevous',
      demande: "Un morceau est tomb\u00e9 du plafond. Je rebouche ?",
      observations: ['Cratère d\u2019une trentaine de centim\u00e8tres au plafond.',
                     'Fragments de terre cuite au sol, pas seulement de l\u2019enduit.',
                     'Deux autres zones l\u00e9g\u00e8rement bomb\u00e9es.'],
      fiche_soupcon: 14, soupcon_titre: 'Plafond qui perd des fragments',
      fiche_jumeau: 2, jumeau_titre: 'Micro-fissures en r\u00e9seau sur enduit',
      detail: 'Un simple d\u00e9collement d\u2019enduit laisse voir un support intact ; ici, le mat\u00e9riau tomb\u00e9 est le fond du bloc lui-m\u00eame.',
      verifications: ['Sondage de tout le plafond : trois zones creuses.',
                      'Pi\u00e8ce occup\u00e9e en dessous.'],
      code_couleur: 'rouge',
      diagnostic: 'Rupture des fonds d\u2019entrevous, avec d\u2019autres zones \u00e0 risque de chute.',
      intervention: 'Dispositif anti-chute certifi\u00e9 apr\u00e8s mise en s\u00e9curit\u00e9.',
      erreur: 'Refermer le trou \u00e0 l\u2019enduit : on cache ce qui peut retomber.',
      lecon: 'Regardez toujours dans le trou : le mat\u00e9riau tomb\u00e9 dit de quelle pathologie il s\u2019agit.',
      extrait_rapport: 'On rel\u00e8ve la chute du fond de plusieurs entrevous du plancher. Le sondage met en \u00e9vidence d\u2019autres zones \u00e0 risque. Il est recommand\u00e9 d\u2019interdire l\u2019usage de la pi\u00e8ce jusqu\u2019\u00e0 la pose d\u2019un syst\u00e8me anti-chute certifi\u00e9.',
      image: photoDemo(2, 'Le plafond qui perd des morceaux', '#c8483c') },
  ],

  btp_signaux_alerte: [
    { numero: 1, titre: "Fragments tombés d'un plafond", fiches: [14],
      pourquoi: "D'autres morceaux peuvent tomber sans prévenir : la zone en dessous n'est plus sûre.",
      tout_de_suite: "Interdire la pièce et retirer ce qui s'y trouve.",
      a_noter: 'Position et étendue de la zone · photo du plafond et des débris · date et heure.',
      dire_au_client: "Personne ne reste dessous tant que le plafond n'a pas été contrôlé." },
    { numero: 5, titre: "Fissure qui s'élargit d'une visite à l'autre", fiches: [5],
      pourquoi: "Une fissure qui bouge signale une cause encore active : la reboucher ne règle rien.",
      tout_de_suite: 'Poser un témoin daté et remettre la réparation à plus tard.',
      a_noter: 'Largeur du jour, date, photo avec un mètre — à refaire les semaines suivantes.',
      dire_au_client: "Avant de réparer, il faut savoir si elle bouge encore : on la mesure quelques semaines." },
  ],
};
