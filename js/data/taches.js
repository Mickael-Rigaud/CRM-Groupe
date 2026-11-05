// À QUI APPARTIENT UNE TÂCHE. Deux lignes, et un fichier à elles seules.
//
// ⚠ ELLE VIVAIT DANS `pages/today.js`, QUE `rappels.js` IMPORTAIT POUR ÇA.
// Les rappels se montent à l'ouverture de l'application : l'écran To do list
// partait donc dans chaque chargement, et avec lui `deal.js`, `rgd-fiche.js`,
// `rgd-projet.js` et `rgd-devis-crm.js` — près de 300 Ko pour un prédicat.
//
// ⚠ NE PAS LA RECOPIER AILLEURS, c'est tout l'intérêt de ce fichier : la
// règle qui dit « cette tâche est à moi » doit être la MÊME à l'écran et dans
// le rappel qui sonne. `today.js` la réexporte pour qui l'y cherchait.
export const estMaTache = (a, moi) => a.assignee_id === moi || a.shared_with === moi
  || (!a.assignee_id && a.created_by === moi);
