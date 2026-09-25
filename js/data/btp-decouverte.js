// Ce que la fiche projet enregistre, et où la fiche d'affaire doit le montrer.
//
// ⚠ LA FICHE PROJET SAISIT BEAUCOUP PLUS QUE `act.fields`. Le formulaire écrit
// une douzaine de champs dans `deals.fields` — ceux que le CRM sait trier,
// filtrer et compter — et dépose TOUT LE RESTE dans `fields.decouverte`, la
// copie de ce qui a été rempli : le profil du demandeur, l'année du bien, les
// motifs, l'historique du désordre, les postes de travaux, le budget, les
// documents, les contrôles. Jusqu'au 25/09/2026 la fiche n'affichait que la
// douzaine de champs, donc **la plus grande partie de ce qu'on venait de saisir
// n'apparaissait nulle part** — on remplissait quatre écrans pour en relire un.
//
// ⚠ CETTE TABLE NE RÉPÈTE PAS `act.fields`. Chaque ligne ici est une chose que
// la copie porte ET que les champs structurés ne portent pas ; en doubler une
// afficherait deux fois la même information sous deux intitulés.
//
// ⚠ ELLE DIT AUSSI LA RUBRIQUE, comme `RUBRIQUE` dans `deal.js` : le prospect,
// le projet, la mission. Une ligne sans rubrique tomberait dans « Le projet »,
// ce qui est le bon repli mais un mauvais rangement quand on peut choisir.
export const CHAMPS_DECOUVERTE = [
  { cle: 'profil', label: 'Profil du demandeur', rubrique: 'prospect' },

  // Le bien, tel qu'il a été décrit au téléphone.
  { cle: 'annee', label: 'Année de construction', rubrique: 'projet' },
  { cle: 'surface', label: 'Surface', rubrique: 'projet' },
  { cle: 'occupation', label: 'Occupation', rubrique: 'projet' },

  // Ce qu'on vient traiter. `motifs` côté expertise, `travaux` côté AMO : les
  // deux ne coexistent jamais sur une même affaire, d'où deux lignes et non un
  // intitulé commun qui ne dirait ni l'un ni l'autre.
  { cle: 'motifs', label: 'Motifs de la demande', rubrique: 'projet', liste: true },
  { cle: 'travaux', label: 'Travaux envisagés', rubrique: 'projet', liste: true },
  { cle: 'description', label: 'Description', rubrique: 'projet', long: true },

  // L'historique du désordre — côté expertise. Ce sont les six questions qui
  // décident de l'urgence de la visite.
  { cle: 'apparition', label: 'Date d’apparition', rubrique: 'projet' },
  { cle: 'evolution', label: 'Évolution observée', rubrique: 'projet' },
  { cle: 'sinistre', label: 'Sinistre déclaré', rubrique: 'projet' },
  { cle: 'procedure', label: 'Procédure engagée', rubrique: 'projet' },
  { cle: 'butoir', label: 'Date butoir', rubrique: 'projet', date: true },
  { cle: 'securite', label: 'Risque sécurité', rubrique: 'projet' },

  // L'opération — côté AMO.
  { cle: 'budget_ht', label: 'Budget travaux TTC', rubrique: 'projet', euros: true },
  { cle: 'budget_max', label: 'Budget maximum client', rubrique: 'projet', euros: true },
  { cle: 'date_debut', label: 'Démarrage souhaité', rubrique: 'projet', date: true },
  { cle: 'date_fin', label: 'Fin souhaitée', rubrique: 'projet', date: true },
  { cle: 'avancement', label: 'État d’avancement', rubrique: 'projet', liste: true },
  { cle: 'besoins', label: 'Besoin d’accompagnement', rubrique: 'mission', liste: true },
  { cle: 'risques', label: 'Risques et contraintes', rubrique: 'projet', liste: true },

  // Ce qui encadre la mission.
  { cle: 'documents', label: 'Documents disponibles', rubrique: 'mission', liste: true },
  { cle: 'controles', label: 'Contrôles avant attribution', rubrique: 'mission', liste: true },
  { cle: 'motif', label: 'Motif de la dérogation de taux', rubrique: 'mission', long: true },
];

// ⚠ UNE VALEUR VIDE N'A PAS QU'UNE FORME : la copie porte des chaînes, des
// tableaux et des nombres, et un tableau vide n'est pas falsy. Les trois cas
// sont traités ici plutôt que dans chaque écran.
export const estVide = (v) => v === undefined || v === null || v === ''
  || v === false || (Array.isArray(v) && v.length === 0);

/**
 * Les lignes à afficher pour une rubrique, prêtes à rendre.
 * `deja` sont les clés que les champs structurés couvrent déjà : la copie
 * porte souvent la même chose sous un autre nom (`description` / `detail`), et
 * l'afficher deux fois ferait douter de laquelle est la bonne.
 */
export function lignesDecouverte(deal, rubrique, deja = []) {
  const f = deal?.fields?.decouverte;
  if (!f) return [];
  return CHAMPS_DECOUVERTE
    .filter(c => c.rubrique === rubrique && !deja.includes(c.cle))
    .map(c => ({ ...c, valeur: f[c.cle] }))
    .filter(c => !estVide(c.valeur));
}
