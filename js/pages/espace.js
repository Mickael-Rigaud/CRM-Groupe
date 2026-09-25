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
import { scope } from '../data/scope.js';

const DATE_DU_JOUR = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// La barre du CRM n'ayant que deux niveaux, c'est cette coquille qui porte la
// navigation interne de la structure : `onglets` = [{ hash, label }], `actif` = le hash ouvert.
//
// Un onglet peut porter `sous: [{ hash, label }]` : il devient alors un intitulé de
// groupe, et ses écrans s'affichent en retrait sous lui.
//
// ⚠ UN GROUPE PEUT SE REPLIER — `pliable: true` (25/09/2026, demandé par Mickael
// pour le groupe Facturation de RGD : « en mode sous-menu, que nous ne voyons pas,
// pour libérer de l'espace »). Ce fichier affirmait le contraire — « toujours
// dépliés, un accordéon n'y apporterait qu'un clic » —, ce qui était vrai tant
// qu'un groupe tenait en deux lignes. Celui de la facturation en fait cinq.
//
// ⚠ LE GROUPE QUI CONTIENT LA PAGE OUVERTE SE DÉPLIE TOUJOURS, quel que soit le
// réglage mémorisé. Sans cela on ouvre « Devis », le menu reste fermé, et plus
// rien ne dit où l'on se trouve — c'est exactement le défaut que
// `coquilleEspace` signale déjà en console pour un onglet absent du menu.
//
// L'état est gardé PAR NAVIGATEUR (`localStorage`), pas en base : c'est une
// préférence d'affichage, elle n'a rien à faire dans les données du groupe.
//
// Un groupe peut aussi porter `bas: true` : il est alors POUSSÉ EN BAS du menu et
// séparé par un trait. Ce n'est pas de la décoration — c'est ce qui distingue les
// écrans qu'on ouvre tous les jours de ceux qu'on ouvre quand quelque chose cloche.
// Mélangés dans la même colonne, les seconds se lisent comme du travail quotidien.
// Un onglet sans `sous` s'affiche exactement comme avant : l'espace La Référence
// Courtage n'en utilise pas et ne change pas.
//
// L'onglet ouvert se reconnaît à l'égalité stricte de son adresse, et non à un
// préfixe : `#/btp` préfixe toutes les adresses de l'espace, un startsWith allumerait
// le tableau de bord en permanence. Les adresses sont donc plates — `#/btp/expertise`
// et non `#/btp/missions/expertise` —, ce qui tombe bien : le routeur du CRM ne lit
// que deux segments après le croisillon.
// La clé porte la structure ET le groupe : RGD et BTP peuvent replier chacun le
// sien sans se marcher dessus.
const CLE_PLI = (cle, label) => `crm_menu_pli_${cle}_${label}`;
const estReplie = (cle, label) => {
  try { return localStorage.getItem(CLE_PLI(cle, label)) !== 'ouvert'; }
  catch { return true; }   // navigation privée, stockage bloqué : on garde le repli
};

// ⚠ LE PLIAGE EST FAIT À LA MAIN, ET CE N'EST PAS UN CHOIX DE STYLE.
// La première version s'appuyait sur `<details>` : pliage, clavier et état rendus
// par le navigateur, rien à écrire. Mais `<details>` NE SE REPLIE PAS dans le
// navigateur intégré qui sert à éprouver les écrans — vérifié sur un élément
// VIERGE créé hors de l'application, contenu visible fermé comme ouvert. Livrer
// un repli qu'on ne peut pas essayer, c'est livrer une promesse. Un bouton, un
// attribut et une règle CSS marchent partout et se vérifient ici.
//
// `aria-expanded` rend au clavier et aux lecteurs d'écran ce que `<details>`
// donnait gratuitement : le bouton annonce son état, et il est dans l'ordre de
// tabulation parce que c'est un vrai bouton.
//
// ⚠ POSÉ UNE SEULE FOIS, SUR LE DOCUMENT, et pas sur les éléments rendus : le menu
// est réécrit à chaque `draw()` d'un écran, donc un écouteur attaché au bouton
// disparaîtrait au premier redessin — et le réglage cesserait d'être mémorisé sans
// que rien ne le dise.
let plisEcoutes = false;
function ecouterLesPlis() {
  if (plisEcoutes) return;
  plisEcoutes = true;
  document.addEventListener('click', (e) => {
    const bouton = e.target instanceof Element && e.target.closest('.esp-side-titre[data-pli]');
    if (!bouton) return;
    const groupe = bouton.closest('.esp-side-pliable');
    const ouvert = groupe.dataset.ouvert !== '1';
    groupe.dataset.ouvert = ouvert ? '1' : '0';
    bouton.setAttribute('aria-expanded', String(ouvert));
    // Le stockage peut être bloqué (navigation privée) : le pli marche quand
    // même, il ne survit simplement pas au rechargement.
    try { localStorage.setItem(bouton.dataset.pli, ouvert ? 'ouvert' : 'replie'); } catch { /* vide */ }
  });
}

const lienOnglet = (o, actif) => {
  const ouvert = o.hash === actif;
  return `<a href="${o.hash}" class="${ouvert ? 'on' : ''}" ${ouvert ? 'aria-current="page"' : ''}>${esc(o.label)}</a>`;
};

// `data-espace` permet de styler UNE structure sans toucher aux trois autres :
// cette coquille est partagée par RGD, BTP, le courtage et Propulsion, et une
// couleur changée ici les repeindrait toutes.
export function coquilleEspace({ cle, marque, baseline = '', onglets, actif, titre, corps }) {
  // Un écran qui désigne un onglet inexistant n'échoue pas : il s'affiche avec
  // un menu où RIEN n'est marqué, et personne ne sait plus où il se trouve.
  // C'est arrivé le 21/09/2026 — la vue d'ensemble RGD déclarait
  // `#/rgd/pilotage` quand le menu proposait `#/rgd` — et rien ne l'a signalé.
  // Un avertissement en console coûte une ligne et fait gagner la recherche.
  if (actif && !onglets.some(o => o.hash === actif || (o.sous || []).some(x => x.hash === actif))) {
    console.warn(`coquilleEspace : l'onglet « ${actif} » n'existe pas dans le menu de ${cle} — aucun repère ne sera marqué.`);
  }
  return `
  <div class="esp-app" data-espace="${esc(cle)}">
    <aside class="esp-side">
      <div class="esp-side-brand"><img src="assets/logos/${esc(cle)}.png" alt="" onerror="this.remove()"><span>${esc(marque)}</span></div>
      <nav class="esp-side-nav" aria-label="Écrans ${esc(marque)}">
        ${onglets.map(o => {
          if (!o.sous) return lienOnglet(o, actif);
          const classes = `esp-side-groupe${o.bas ? ' esp-side-bas' : ''}`;
          const liens = o.sous.map(x => lienOnglet(x, actif)).join('');
          if (!o.pliable) {
            return `<div class="${classes}">
               <span class="esp-side-titre">${esc(o.label)}</span>${liens}</div>`;
          }
          // Le groupe de la page ouverte se déplie, réglage ou pas.
          const ici = o.sous.some(x => x.hash === actif);
          const ouvert = ici || !estReplie(cle, o.label);
          // Les liens vivent dans leur propre boîte : c'est elle que le repli
          // masque, et le titre reste visible pour pouvoir rouvrir.
          return `<div class="${classes} esp-side-pliable" data-ouvert="${ouvert ? 1 : 0}">
            <button type="button" class="esp-side-titre"
                data-pli="${esc(CLE_PLI(cle, o.label))}"
                aria-expanded="${ouvert}">${esc(o.label)}</button>
            <div class="esp-side-plis">${liens}</div></div>`;
        }).join('')}
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
  // C'est ici, et pas dans `coquilleEspace`, parce que celle-ci rend une CHAÎNE :
  // au moment où elle s'exécute, le menu n'est pas encore dans le document.
  ecouterLesPlis();
  return { retirer() { root.classList.remove('flush'); } };
}

// Indicateur : libellé à gauche, icône en pastille à droite, valeur en gros.
// Le grand chiffre prend --accent-ink et non --accent : certaines couleurs de marque
// sont trop claires pour être lues sur blanc.
// `note` est une seconde ligne, facultative : ce que le chiffre veut dire POUR CELUI
// QUI REGARDE, quand ce n'est pas la même chose pour tout le monde. Absente par
// défaut, donc aucun indicateur existant ne change.
export const kpiEspace = ({ label, valeur, sous, note, icone, ton = 'accent', href }) => `
  <a class="esp-kpi" href="${href}" style="--t:var(--${ton === 'accent' ? 'accent-ink' : ton});--ts:var(--${ton}-soft, var(--accent-soft))">
    <span class="esp-kpi-top"><span class="esp-kpi-lbl">${esc(label)}</span><span class="esp-kpi-ico">${icone}</span></span>
    <span class="esp-kpi-val">${valeur}</span>
    <span class="esp-kpi-sub">${esc(sous)}</span>
    ${note ? `<span class="esp-kpi-note">${esc(note)}</span>` : ''}
  </a>`;

// Supprimer une fiche et tout ce qui ne tient qu'à elle.
// ---------- Archiver, jamais supprimer ----------
//
// Une fiche supprimée emporte avec elle ce qu'on ne saura jamais avoir perdu :
// un nom déjà rencontré, un numéro déjà appelé, le fait qu'un prospect était
// déjà venu il y a deux ans. Le cabinet veut une base complète, donc on range
// au lieu de jeter — `archived_at` sur la fiche, et rien d'autre ne bouge.
//
// Ce qui pend à la fiche — affaires, tâches, historique — reste EN PLACE. C'est
// toute la différence avec l'ancienne suppression, qui emportait la grappe
// entière : archiver ne détruit rien, donc il n'y a rien à annoncer ni à
// reconstruire pour revenir en arrière.
const nomFiche = (table, f) => (table === 'organisations'
  ? f.name
  : `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.email || 'cette fiche');

export async function archiverFiche(table, id, apres) {
  const fiche = db.byId(table, id);
  if (!fiche) return;
  const nom = nomFiche(table, fiche);
  const ouvertes = db.t('deals').filter(d =>
    d[table === 'organisations' ? 'organisation_id' : 'contact_id'] === id && d.status === 'open').length;

  // Archiver une fiche dont une affaire est en cours est presque toujours une
  // erreur de manipulation : on le dit, on ne l'interdit pas.
  const message = ouvertes
    ? `Archiver ${nom} ? ${ouvertes} affaire${ouvertes > 1 ? 's sont' : ' est'} encore en cours. La fiche sort des listes actives mais rien n'est supprimé : affaires, tâches et historique restent, et vous pourrez la restaurer.`
    : `Archiver ${nom} ? La fiche sort des listes actives. Rien n'est supprimé, et vous pourrez la restaurer.`;
  if (!await confirm(message)) return;

  try {
    await db.update(table, id, { archived_at: new Date().toISOString() });
    toast(`${nom} archivé${table === 'organisations' ? 'e' : ''}`);
  } catch (err) {
    toast(err.message || 'Archivage refusé', 'err');
  }
  apres?.();
}

export async function restaurerFiche(table, id, apres) {
  const fiche = db.byId(table, id);
  if (!fiche) return;
  try {
    await db.update(table, id, { archived_at: null });
    toast(`${nomFiche(table, fiche)} restauré${table === 'organisations' ? 'e' : ''}`);
  } catch (err) {
    toast(err.message || 'Restauration refusée', 'err');
  }
  apres?.();
}

// ---------- Supprimer définitivement : la direction, depuis les archives ----------
//
// L'archivage est la règle, la suppression l'exception. Deux garde-fous, et ils
// se cumulent :
//   - la DIRECTION seule, en miroir des policies `contacts_delete` et
//     `orgs_delete` (migration 20260918200000) — le serveur refuse le reste ;
//   - depuis les ARCHIVES uniquement : il faut avoir rangé avant de jeter, donc
//     une fiche vivante ne peut pas disparaître d'un clic distrait.
//
// Contrairement à l'archivage, celle-ci emporte la grappe entière — affaires,
// tâches, historique —, et on le dit avant. La suppression se fait ici plutôt
// que de compter sur une cascade du serveur : en mode démo elle n'existe pas,
// et une tâche orpheline continuerait d'apparaître dans la to-do.
export async function supprimerDefinitivement(table, id, apres) {
  const fiche = db.byId(table, id);
  if (!fiche) return;
  if (!scope.canSupprimerFiche) return toast('Seule la direction peut supprimer une fiche', 'warn');

  const nom = nomFiche(table, fiche);
  const champ = table === 'organisations' ? 'organisation_id' : 'contact_id';
  const affaires = db.t('deals').filter(d => d[champ] === id);
  const idsAffaires = new Set(affaires.map(d => d.id));
  const taches = db.t('activities').filter(a => a[champ] === id || idsAffaires.has(a.deal_id));
  const echanges = db.t('events').filter(e => e[champ] === id || idsAffaires.has(e.deal_id));

  const detail = [
    affaires.length && `${affaires.length} affaire${affaires.length > 1 ? 's' : ''}`,
    taches.length && `${taches.length} tâche${taches.length > 1 ? 's' : ''}`,
    echanges.length && `${echanges.length} échange${echanges.length > 1 ? 's' : ''} d'historique`,
  ].filter(Boolean);

  if (!await confirm(detail.length
    ? `Supprimer définitivement ${nom}, ainsi que ${detail.join(', ')} ? Cette fois rien n'est conservé et c'est irréversible.`
    : `Supprimer définitivement ${nom} ? Cette fois rien n'est conservé et c'est irréversible.`)) return;

  try {
    for (const a of taches) await db.remove('activities', a.id);
    for (const e of echanges) await db.remove('events', e.id);
    for (const d of affaires) await db.remove('deals', d.id);
    await db.remove(table, id);
    toast(`${nom} supprimé${table === 'organisations' ? 'e' : ''} définitivement`);
  } catch (err) {
    toast(err.message || 'Suppression refusée', 'err');
  }
  apres?.();
}

// Une fiche est active tant qu'elle n'a pas été archivée. Les écrans lisent ceci
// plutôt que de tester `archived_at` eux-mêmes : le jour où la règle change, elle
// ne change qu'ici.
export const estActive = (f) => !f?.archived_at;
