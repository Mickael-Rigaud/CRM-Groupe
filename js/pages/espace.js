// Coquille commune aux espaces de structure (BTP Expertise, La Référence Courtage).
// Menu vertical à gauche sur --accent-ink, en-tête et contenu à droite : la présentation
// du tableau de bord RGD Renova, aux couleurs de la structure ouverte.
//
// Aucune couleur en dur : --accent / --accent-ink / --accent-soft / --on-accent sont
// posées par applyBrand() (js/app.js) d'après l'activité de l'entrée de menu ouverte.
// Un espace prend donc sa couleur tout seul, à condition que son entrée du NAV porte
// `activity: '<clé>'`.
import { esc } from '../ui.js';

const DATE_DU_JOUR = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// La barre du CRM n'ayant que deux niveaux, c'est cette coquille qui porte la
// navigation interne de la structure : `onglets` = [{ hash, label }], `actif` = le hash ouvert.
export function coquilleEspace({ cle, marque, baseline = '', onglets, actif, titre, corps }) {
  return `
  <div class="esp-app">
    <aside class="esp-side">
      <div class="esp-side-brand"><img src="assets/logos/${esc(cle)}.png" alt="" onerror="this.remove()"><span>${esc(marque)}</span></div>
      <nav class="esp-side-nav" aria-label="Écrans ${esc(marque)}">
        ${onglets.map(o => `<a href="${o.hash}" class="${o.hash === actif ? 'on' : ''}" ${o.hash === actif ? 'aria-current="page"' : ''}>${esc(o.label)}</a>`).join('')}
      </nav>
      <div class="esp-side-foot"><b>${esc(marque)}</b>${baseline ? `<span>${esc(baseline)}</span>` : ''}</div>
    </aside>
    <div class="esp-main">
      <header class="esp-head">
        <h1>${esc(titre)}</h1>
        <div class="datepill"><span>Aujourd&rsquo;hui</span>${DATE_DU_JOUR()}</div>
      </header>
      <div class="esp-body">${corps}</div>
    </div>
  </div>`;
}

// La coquille occupe toute la hauteur restante : .content.flush enlève les marges
// du CRM et s'étire, le menu et le contenu se partagent la surface. Le couple
// `.content.flush` + `.esp-app { flex: 1 }` est ce qui donne la pleine hauteur.
// À rendre dans le `destroy` de la page, sinon l'écran suivant hérite de la mise en page.
export function poserEspace(root) {
  root.classList.add('flush');
  return { retirer() { root.classList.remove('flush'); } };
}

// Indicateur : libellé à gauche, icône en pastille à droite, valeur en gros.
// Le grand chiffre prend --accent-ink et non --accent : certaines couleurs de marque
// sont trop claires pour être lues sur blanc.
export const kpiEspace = ({ label, valeur, sous, icone, ton = 'accent', href }) => `
  <a class="esp-kpi" href="${href}" style="--t:var(--${ton === 'accent' ? 'accent-ink' : ton});--ts:var(--${ton}-soft, var(--accent-soft))">
    <span class="esp-kpi-top"><span class="esp-kpi-lbl">${esc(label)}</span><span class="esp-kpi-ico">${icone}</span></span>
    <span class="esp-kpi-val">${valeur}</span>
    <span class="esp-kpi-sub">${esc(sous)}</span>
  </a>`;
