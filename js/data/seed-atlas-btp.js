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
const planche = (n, titre, teinte) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
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
    <rect x="48" y="1140" width="804" height="90" rx="10" fill="#e9f7ee"/>
    <text x="72" y="1195" font-family="Arial" font-size="20" font-weight="bold" fill="#1c7a41">VERT · surveiller et planifier</text>
  </svg>`);

export const SEED_ATLAS_BTP = {
  btp_atlas_fiches: [
    { numero: 2, famille: 'Fissures et lézardes', titre: 'Micro-fissures en réseau sur enduit',
      image: planche(2, 'Micro-fissures en réseau sur enduit', '#4b5bd6') },
    { numero: 5, famille: 'Fissures et lézardes', titre: 'Fissure horizontale en partie basse',
      image: planche(5, 'Fissure horizontale en partie basse', '#4b5bd6') },
    { numero: 14, famille: 'Béton et structure', titre: 'Plafond qui perd des fragments',
      image: planche(14, 'Plafond qui perd des fragments', '#b4541f') },
    { numero: 19, famille: 'Humidité et infiltrations', titre: 'Bande humide en pied de mur',
      image: planche(19, 'Bande humide en pied de mur', '#1d7fa3') },
    { numero: 34, famille: 'Sols et revêtements', titre: 'Carrelage qui sonne creux',
      image: planche(34, 'Carrelage qui sonne creux', '#6b6f76') },
    { numero: 45, famille: 'Toitures et étanchéité', titre: 'Tuiles déplacées après coup de vent',
      image: planche(45, 'Tuiles déplacées après coup de vent', '#2f7d4f') },
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
