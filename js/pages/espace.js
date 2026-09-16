// Coquille commune aux espaces de structure (BTP Expertise, La Référence Courtage).
// Menu vertical à gauche sur --accent-ink, en-tête et contenu à droite : la présentation
// du tableau de bord RGD Renova, aux couleurs de la structure ouverte.
//
// Aucune couleur en dur : --accent / --accent-ink / --accent-soft / --on-accent sont
// posées par applyBrand() (js/app.js) d'après l'activité de l'entrée de menu ouverte.
// Un espace prend donc sa couleur tout seul, à condition que son entrée du NAV porte
// `activity: '<clé>'`.
import { db } from '../data/db.js';
import { esc, confirm, toast } from '../ui.js';

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

// Supprimer une fiche et tout ce qui ne tient qu'à elle.
// Le formulaire du CRM refuse de supprimer un contact qui porte des affaires — c'est
// une sécurité utile sur un client suivi, mais elle bloque le cas courant du lead
// arrivé d'un formulaire : le contact et son affaire sont la même chose. Ici on
// annonce tout ce qui va partir, et on l'emporte d'un coup.
export async function supprimerFiche(table, id, apres) {
  const fiche = db.byId(table, id);
  if (!fiche) return;
  const surOrg = table === 'organisations';
  const nom = surOrg ? fiche.name : `${fiche.first_name || ''} ${fiche.last_name || ''}`.trim() || fiche.email || 'cette fiche';
  const champ = surOrg ? 'organisation_id' : 'contact_id';

  const affaires = db.t('deals').filter(d => d[champ] === id);
  const idsAffaires = new Set(affaires.map(d => d.id));
  // Tout ce qui pend à la fiche ou à ses affaires. On le supprime nous-mêmes plutôt que
  // de compter sur la cascade du serveur : en mode démo elle n'existe pas, et une tâche
  // orpheline continuerait d'apparaître dans la to-do.
  const taches = db.t('activities').filter(a => a[champ] === id || idsAffaires.has(a.deal_id));
  const echanges = db.t('events').filter(e => e[champ] === id || idsAffaires.has(e.deal_id));

  const detail = [
    affaires.length && `${affaires.length} affaire${affaires.length > 1 ? 's' : ''}`,
    taches.length && `${taches.length} tâche${taches.length > 1 ? 's' : ''}`,
    echanges.length && `${echanges.length} échange${echanges.length > 1 ? 's' : ''} d'historique`,
  ].filter(Boolean);

  const message = detail.length
    ? `Supprimer ${nom} ainsi que ${detail.join(', ')} ? C'est définitif.`
    : `Supprimer ${nom} ? C'est définitif.`;
  if (!await confirm(message)) return;

  try {
    for (const a of taches) await db.remove('activities', a.id);
    for (const e of echanges) await db.remove('events', e.id);
    for (const d of affaires) await db.remove('deals', d.id);
    await db.remove(table, id);
    toast(`${nom} supprimé${surOrg ? 'e' : ''}`);
    apres?.();
  } catch (err) {
    // Les policies du serveur peuvent refuser : un commercial ne supprime que ce qu'il porte.
    toast(err.message || 'Suppression refusée', 'err');
    apres?.();
  }
}
