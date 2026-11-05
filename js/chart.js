// Chart.js, chargé seulement quand un écran en a besoin.
//
// ⚠ IL ÉTAIT DANS L'EN-TÊTE DE `index.html`, EN SCRIPT BLOQUANT : 201 Ko
// (68 Ko compressés) télé­chargés et exécutés avant le premier pixel, à chaque
// ouverture, pour TROIS écrans — le tableau de bord du groupe, l'accueil et le
// Patrimoine. Ni la vue d'ensemble de RGD, ni BTP, ni aucun écran de travail
// quotidien ne s'en sert : les graphiques du CRM sont dessinés à la main en
// SVG. 68 Ko compressés, c'est plus que la moitié de la feuille de style.
//
// ⚠ LES TROIS ÉCRANS SAVENT DÉJÀ SE PASSER DE LUI (`if (!window.Chart) return`)
// et gardent cette garde : si le fichier manque — hors ligne la toute première
// fois, ou réseau coupé — l'écran s'affiche sans son graphique au lieu de
// tomber en panne.
//
// ⚠ L'ADRESSE EST CALCULÉE DEPUIS CELLE DE CE MODULE, pas écrite en dur :
// le CRM est servi sous `/CRM-Groupe/` sur GitHub Pages et à la racine en
// local. Un chemin absolu marcherait d'un côté et pas de l'autre.
let promesse = null;

export function chargerChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!promesse) {
    promesse = new Promise((ok, non) => {
      const s = document.createElement('script');
      s.src = new URL('../assets/chart.umd.js', import.meta.url).href;
      s.onload = () => ok(window.Chart);
      // On oublie la promesse en cas d'échec : le prochain écran qui en a
      // besoin retentera, au lieu de rester bloqué sur un refus définitif.
      s.onerror = () => { promesse = null; non(new Error('Chart.js n’a pas pu être chargé')); };
      document.head.appendChild(s);
    });
  }
  return promesse;
}
