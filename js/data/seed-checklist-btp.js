// Jeu de démonstration de la check-list de visite — INVENTÉ DE BOUT EN BOUT.
//
// ⚠ AUCUNE LIGNE DU VRAI RÉFÉRENTIEL N'EST ICI, ET C'EST LA RAISON D'ÊTRE DU
// FICHIER. Les 8 zones et les 54 points viennent d'un produit commercial tiers
// (« Check-list Visuelle de Visite », Atlas Visuel des Pathologies du
// Bâtiment) et ce dépôt est PUBLIC : recopier trois vraies zones « pour
// montrer » les publierait aussi sûrement que les huit. Ce qui suit est écrit
// pour la démonstration et ne reprend rien.
//
// ⚠ CE QUI EST FIDÈLE, EN REVANCHE, C'EST LA FORME : trois zones de tailles
// inégales, des points qui renvoient à des fiches de l'atlas — dont une
// ABSENTE du jeu de démo, pour que l'écran montre qu'il sait le dire —, et
// des « photos à prendre » par zone. Sans cela on éprouverait un écran qui ne
// ressemble pas à celui qui tourne.

export const SEED_CHECKLIST_BTP = {
  btp_checklist_zones: [
    { rang: 1, titre: 'EXTÉRIEURS (démonstration)',
      photos_a_prendre: 'Vue d’ensemble · détail de chaque désordre avec un mètre' },
    { rang: 2, titre: 'INTÉRIEURS (démonstration)',
      photos_a_prendre: 'Chaque mur marqué · angles hauts · pied de mur' },
    { rang: 3, titre: 'ANNEXES (démonstration)',
      photos_a_prendre: 'Accès · sol · murs enterrés' },
  ],

  btp_checklist_points: [
    // Zone 1 — la plus fournie, pour voir une zone qui demande de faire défiler
    { id: 1, zone_rang: 1, rang: 1, libelle: 'Fissures visibles en façade', fiches: [2, 5] },
    { id: 2, zone_rang: 1, rang: 2, libelle: 'Traces d’humidité ou coulures', fiches: [19] },
    { id: 3, zone_rang: 1, rang: 3, libelle: 'Enduit décollé ou sonnant creux', fiches: [34] },
    { id: 4, zone_rang: 1, rang: 4, libelle: 'Couverture : éléments déplacés', fiches: [45] },
    // ⚠ CE POINT RENVOIE À UNE FICHE ABSENTE du jeu de démonstration (la 44) :
    // c'est le seul moyen d'éprouver ce que l'écran affiche alors.
    { id: 5, zone_rang: 1, rang: 5, libelle: 'Évacuations des eaux pluviales', fiches: [44] },

    { id: 6, zone_rang: 2, rang: 1, libelle: 'Fissures aux angles des ouvertures', fiches: [5] },
    { id: 7, zone_rang: 2, rang: 2, libelle: 'Bande humide en pied de mur', fiches: [19] },
    { id: 8, zone_rang: 2, rang: 3, libelle: 'Plafond : bombement ou fragment tombé', fiches: [14] },

    { id: 9, zone_rang: 3, rang: 1, libelle: 'Murs enterrés : humidité ou efflorescences', fiches: [19] },
    { id: 10, zone_rang: 3, rang: 2, libelle: 'Sol : affaissement ou entrée d’eau', fiches: [34] },
  ],
};
