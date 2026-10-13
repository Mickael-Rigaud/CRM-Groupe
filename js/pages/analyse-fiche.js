// L'onglet « Fiche Google » de l'écran Analyse (13/10/2026, Élodie : « on
// laisse tomber la fiche le but était d'avoir les performances pour faire une
// analyse », puis « oui vas-y, en troisième onglet »).
//
// ⚠ UN TROISIÈME ONGLET ET NON UN BLOC DANS « SITE INTERNET » : une fiche
// d'établissement n'est ni un réseau social ni le site — elle a ses propres
// grandeurs (des vues dans Maps, des demandes d'itinéraire) qu'aucun des deux
// autres onglets ne sait montrer.
//
// ⚠ LA SAISIE EST MANUELLE, ET C'EST UNE DÉCISION : voir l'en-tête de
// `js/data/fiche-google.js`. Les performances de la fiche sont derrière une
// demande d'autorisation Google qu'Élodie a refusé de déposer.
//
// ⚠ LE SÉLECTEUR DE PÉRIODE EST MASQUÉ SUR CET ONGLET (`sansPeriode`) : les
// deux autres se lisent sur 7, 14 ou 30 jours glissants, celui-ci sur des mois
// calendaires. Un bouton « 7 jours » qui ne filtrerait rien est une question
// posée pour rien — même arbitrage que l'onglet « Réseaux sociaux » absent de
// La Référence Courtage.

import { db } from '../data/db.js';
import { esc, openModal, closeModal, toast, armerCroix } from '../ui.js';
import { INFOS_SITE } from './analyse-site.js';
import {
  COMPTEURS, moisSaisis, ligneDuMois, vuesDe, actionsDe, tauxAction, tauxEstMinimum,
  aDesChiffres, libelleMois, moisCourt, moisAvant, moisProposes, dernierMoisComplet,
  enregistrerMois, supprimerMois,
} from '../data/fiche-google.js';

/** « 9,4 % », et « au moins 9,4 % » quand une interaction n'est pas connue. */
function taux(ligne) {
  const t = tauxAction(ligne);
  if (t == null) return null;
  const n = `${t.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  return tauxEstMinimum(ligne) ? `≥ ${n}` : n;
}

const NOMS = { rgd: 'RGD Renova', btp: 'BTP Expertise', courtage: 'La Référence Courtage' };
const nombre = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));

/** L'écart d'un mois à l'autre. Repris de l'onglet site, même lecture. */
function ecart(actuel, avant) {
  if (actuel == null || avant == null || avant === 0) return '';
  const p = Math.round(((actuel - avant) / avant) * 100);
  if (!p) return '<span class="as-ecart">= mois d’avant</span>';
  return `<span class="as-ecart ${p > 0 ? 'bon' : 'mauvais'}">${p > 0 ? '▲ +' : '▼ '}${p} %</span>`;
}

/* ------------------------------------------------------------ les graphiques */

/**
 * Les vues mois par mois, en barres.
 *
 * ⚠ ON NE TRACE QUE LES MOIS SAISIS, et on ne comble pas les trous par des
 * zéros : un mois non relevé n'est pas un mois sans visite. Les deux parts
 * (recherche et Maps) sont empilées, donc un mois dont une seule est connue
 * afficherait une barre trop courte — il est hachuré et son infobulle le dit.
 */
function barres(lignes) {
  const avec = lignes.filter(aDesChiffres).slice(-12);
  if (!avec.length) return '';
  const haut = Math.max(1, ...avec.map(l => vuesDe(l).valeur || 0));
  return `<div class="fg-barres" role="img" aria-label="Vues de la fiche mois par mois">
    ${avec.map((l) => {
      const v = vuesDe(l);
      const rech = Number(l.vues_recherche || 0), maps = Number(l.vues_maps || 0);
      const h = ((v.valeur || 0) / haut) * 100;
      const partMaps = v.valeur ? (maps / v.valeur) * 100 : 0;
      const titre = v.valeur == null
        ? `${libelleMois(l.mois)} : aucune vue saisie`
        : `${libelleMois(l.mois)} : ${nombre(v.valeur)} vues${v.partiel ? ' (une des deux sources manque)' : ` — ${nombre(rech)} recherche, ${nombre(maps)} Maps`}`;
      return `<div class="fg-barre${v.partiel ? ' est-partielle' : ''}" title="${esc(titre)}">
        <span class="fg-barre-pile" style="height:${h.toFixed(1)}%">
          <i class="fg-part-maps" style="height:${partMaps.toFixed(1)}%"></i>
        </span>
        <b>${v.valeur == null ? '—' : nombre(v.valeur)}</b>
        <span class="fg-barre-mois">${esc(moisCourt(l.mois))}</span>
      </div>`;
    }).join('')}
  </div>
  <div class="fg-legende">
    <span><i class="fg-pastille-rech"></i> Recherche Google</span>
    <span><i class="fg-pastille-maps"></i> Google Maps</span>
  </div>`;
}

/** Où va le geste : appels, itinéraires, clics, messages, en parts du total. */
function actions(ligne) {
  const liste = COMPTEURS.filter(c => c.action && ligne?.[c.cle] != null)
    .map(c => [c.label, Number(ligne[c.cle])])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!liste.length) return '<div class="as-vide">Aucune interaction saisie pour ce mois.</div>';
  const max = Math.max(...liste.map(([, n]) => n));
  return `<ol class="as-classement fg-actions">${liste.map(([nom, n], i) => `<li>
      <span class="as-rang">${i + 1}</span>
      <span class="as-classement-nom">${esc(nom)}</span>
      <span class="as-classement-piste"><i style="width:${(n / max) * 100}%"></i></span>
      <b>${nombre(n)}</b></li>`).join('')}</ol>`;
}

/**
 * Le site sur le MÊME mois, quand on sait le dire.
 *
 * ⚠ ON NE COMPARE PAS À SEARCH CONSOLE NI À ANALYTICS, ET CE N'EST PAS UN
 * OUBLI : `site_google_periode` ne porte que des fenêtres de 7, 14 ou 30 jours
 * GLISSANTS, alors qu'ici le mois est calendaire — et le mois saisi est le
 * précédent, donc décalé d'un mois entier par rapport aux « 30 derniers
 * jours ». Mettre les deux côte à côte donnerait une comparaison fausse qui a
 * l'air juste. Le compteur sans cookie, lui, porte une ligne par JOUR : on peut
 * en tirer un vrai mois calendaire.
 *
 * ⚠ ET IL N'EST PAS ENCORE DÉPOSÉ SUR rgdrenova.fr : les trois fichiers
 * attendent le FTP (voir `site-rgd-a-deposer/assets`). La carte dit donc ce qui
 * manque au lieu d'afficher un zéro, et elle apparaîtra d'elle-même le jour du
 * dépôt — rien à rebrancher.
 */
function faceAuSite(cle, mois, ligne) {
  const site = INFOS_SITE[cle]?.site;
  if (!site || !mois) return '';
  const lignes = db.t('site_stats_jour').filter(l => l.site === site);
  const premier = lignes.map(l => l.jour).sort()[0];
  const [a, m] = mois.split('-').map(Number);
  const debut = `${mois}-01`;
  const fin = `${mois}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
  const couvre = premier && premier <= debut;

  const clics = ligne?.clics_site;
  const entete = `<header><h3>Et par le site, le même mois</h3>
    <span class="small muted">${esc(libelleMois(mois))} · ${esc(site)}</span></header>`;

  if (!couvre) {
    // ⚠ PAS `as-vide` ICI : cette classe centre son texte, ce qui convient à un
    // tiret et pas à deux phrases — mesuré à l'écran, elles se lisaient mal.
    return `<section class="as-carte as-large">${entete}
      <p class="fg-manque">La mesure d’audience de ${esc(site)} ne couvre pas encore ${esc(libelleMois(mois))} : il n’y a pas de quoi en tirer un mois entier sans en compter la moitié.
      ${clics != null ? `La fiche, elle, a envoyé <b>${nombre(clics)}</b> personne${clics > 1 ? 's' : ''} vers le site ce mois-là.` : ''}</p>
      <p class="small muted">Les chiffres du site sur les 7, 14 ou 30 derniers jours sont dans l’onglet « Site internet ».</p>
    </section>`;
  }

  const dans = lignes.filter(l => l.jour >= debut && l.jour <= fin);
  const visites = dans.reduce((s, l) => s + (l.visites || 0), 0);
  const part = visites && clics != null ? Math.round((clics / visites) * 100) : null;
  return `<section class="as-carte as-large">${entete}
    <div class="fg-face">
      <div><span>Visites du site</span><b>${nombre(visites)}</b><span class="small muted">toutes provenances</span></div>
      <div><span>Venues de la fiche</span><b>${nombre(clics)}</b>${part != null ? `<span class="small muted">${part} % des visites</span>` : ''}</div>
    </div>
    ${clics == null ? '<p class="small muted">Saisissez les clics vers le site pour ce mois : la part se calculera.</p>' : ''}
  </section>`;
}

/* ---------------------------------------------------------------- la saisie */

/**
 * Le formulaire d'un mois.
 *
 * ⚠ AUCUN `confirm()` DE `ui.js` ICI : il appelle `closeModal(true)` et
 * REMPLACE la fenêtre courante — le formulaire disparaîtrait avec la saisie en
 * cours. Onzième occurrence du piège dans ce dépôt. Deux clics sur le même
 * bouton, qui se désarme seul au bout de quatre secondes.
 */
function formulaireMois(cle, mois, apres) {
  const deja = ligneDuMois(cle, mois);
  const dispo = moisProposes(12);
  // Le mois en cours de modification reste proposé même s'il est déjà saisi ;
  // les autres mois déjà saisis le sont aussi, pour pouvoir les corriger.
  const choix = [...new Set([...dispo, ...moisSaisis(cle).map(l => l.mois)])]
    .sort((x, y) => y.localeCompare(x));

  const champ = (c) => `<label class="mail-champ">
    <span>${esc(c.label)}</span>
    <input type="number" min="0" step="1" inputmode="numeric" name="${c.cle}"
      value="${deja?.[c.cle] ?? ''}" placeholder="—" title="${esc(c.aide)}">
  </label>`;

  const html = `<form class="fg-form" novalidate>
    <label class="mail-champ">
      <span>Mois</span>
      <select name="mois" ${deja ? 'disabled' : ''}>
        ${choix.map(m => `<option value="${m}"${m === mois ? ' selected' : ''}>${esc(libelleMois(m))}${ligneDuMois(cle, m) && m !== mois ? ' — déjà saisi' : ''}</option>`).join('')}
      </select>
    </label>
    <p class="small muted">Dans l’appli Google Business Profile : <b>Performances</b>, puis le mois.
      Laissez vide ce que vous ne lisez pas — un champ vide reste vide, il ne compte pas pour zéro.</p>
    <div class="fg-groupe"><h4>Vues</h4><div class="mf-grille">${COMPTEURS.filter(c => c.vue).map(champ).join('')}</div></div>
    <div class="fg-groupe"><h4>Ce que les gens ont fait</h4><div class="mf-grille">${COMPTEURS.filter(c => c.action).map(champ).join('')}</div></div>
    <label class="mail-champ plein">
      <span>Notes du mois</span>
      <textarea name="note" rows="3" placeholder="Les recherches qui reviennent, un avis reçu, une opération en cours…">${esc(deja?.note || '')}</textarea>
    </label>

    <div class="form-actions">
      ${deja ? '<button type="button" class="btn danger fg-suppr">Supprimer ce mois</button>' : ''}
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn">${deja ? 'Enregistrer' : 'Ajouter le mois'}</button>
    </div>
  </form>`;

  const m = openModal(deja ? `Fiche Google — ${libelleMois(mois)}` : 'Saisir un mois', html);
  const f = m.querySelector('form');
  const ok = f.querySelector('button[type="submit"]');

  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    // ⚠ UN `<select disabled>` N'ENTRE PAS DANS LE FormData : sur une
    // modification, le mois vient donc du paramètre et non du champ.
    const cible = deja ? mois : d.mois;
    ok.disabled = true;
    try {
      await enregistrerMois(cle, cible, d);
      closeModal();
      toast(deja ? 'Mois enregistré' : `${libelleMois(cible)} ajouté`);
      apres(cible);
    } catch (err) {
      ok.disabled = false;
      toast(err.message || 'Enregistrement impossible', 'error');
    }
  };

  const sup = f.querySelector('.fg-suppr');
  if (sup && deja) armerCroix(sup, async () => {
    try {
      await supprimerMois(deja.id);
      closeModal();
      toast(`${libelleMois(mois)} supprimé`);
      apres(null);
    } catch (err) { toast(err.message || 'Suppression impossible', 'error'); }
  }, { repos: 'Supprimer ce mois', arme: 'Confirmer la suppression', titre: 'Supprimer ce mois' });
}

/* ------------------------------------------------------------------- la vue */

/**
 * `mois` est le mois REGARDÉ, tenu par l'écran appelant : la vue est
 * reconstruite à chaque enregistrement, et un mois gardé ici repartirait au
 * plus récent sous les yeux de qui venait d'en ouvrir un autre.
 */
export function vueFiche(cle, mois) {
  const lignes = moisSaisis(cle);
  const nom = NOMS[cle] || cle;

  if (!lignes.length) {
    return `<section class="as-carte as-large fg-accueil">
      <header><h3>La fiche Google de ${esc(nom)}</h3></header>
      <p>Les performances de la fiche — vues, appels, demandes d’itinéraire, clics vers le site — se lisent dans l’appli <b>Google Business Profile</b>, section <b>Performances</b>. Saisissez-les ici une fois par mois : le CRM en fait la courbe, les écarts et la part des vues qui mènent à un geste.</p>
      <p class="small muted"><b>Pourquoi à la main :</b> le relevé automatique passe par une API dont Google n’ouvre l’accès que sur demande, déposée par un propriétaire de la fiche. Ce raccordement a été écarté pour ne pas exposer la fiche à un examen.</p>
      <p class="small muted"><b>Google ne garde que six mois</b> de performances : un mois non saisi à temps est perdu.</p>
      <p><button type="button" class="btn primary" id="fg-ajouter">+ Saisir un mois</button></p>
    </section>`;
  }

  const courant = lignes.find(l => l.mois === mois) || lignes[lignes.length - 1];
  const avant = ligneDuMois(cle, moisAvant(courant.mois));
  // ⚠ PAS DE `const taux` ICI : `taux` est déjà la fonction d'affichage de ce
  // module, et un const local la masquerait dans toute la fonction — « taux is
  // not a function » au rendu, que ni la syntaxe ni la relecture ne montrent.
  // Le piège s'est déjà payé dans ce dépôt avec un `const qui`.
  const v = vuesDe(courant), a = actionsDe(courant);
  const vAvant = vuesDe(avant), aAvant = actionsDe(avant);

  const chiffre = (classe, libelle, valeur, detail, aide = '') => `<div class="as-chiffre ${classe}" title="${esc(aide)}">
    <span class="as-chiffre-l">${esc(libelle)}</span><b>${valeur}</b>${detail || ''}</div>`;

  const retard = courant.mois !== dernierMoisComplet() && !ligneDuMois(cle, dernierMoisComplet())
    ? `<p class="fg-retard">${esc(libelleMois(dernierMoisComplet()))} n’est pas encore saisi. Google ne garde que six mois de performances.</p>`
    : '';

  const hero = `<section class="as-hero fg-hero">
    <div class="fg-ecusson" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="40" height="40"><path d="M12 22s7-6.3 7-12a7 7 0 10-14 0c0 5.7 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
    </div>
    <div class="as-hero-texte">
      <span class="as-pastille-ligne"><i></i> Fiche d’établissement</span>
      <h2>${esc(nom)}</h2>
      <p>${esc(libelleMois(courant.mois))}${avant ? ` · comparé à ${esc(libelleMois(avant.mois))}` : ' · premier mois saisi'}</p>
      <div class="as-hero-chiffres">
        ${chiffre('vif', 'Vues de la fiche', nombre(v.valeur), ecart(v.valeur, vAvant.valeur), 'Recherche Google + Maps')}
        ${chiffre('google', 'Passages à l’action', nombre(a.valeur), ecart(a.valeur, aAvant.valeur), 'Appels, itinéraires, clics vers le site, messages')}
      </div>
    </div>
    <div class="fg-commandes">
      <select id="fg-mois" title="Mois regardé">
        ${[...lignes].reverse().map(l => `<option value="${l.mois}"${l.mois === courant.mois ? ' selected' : ''}>${esc(libelleMois(l.mois))}</option>`).join('')}
      </select>
      <button type="button" class="btn ghost" id="fg-modifier">Modifier ce mois</button>
      <button type="button" class="btn primary" id="fg-ajouter">+ Saisir un mois</button>
    </div>
  </section>`;

  const tuiles = `<div class="as-tuiles">
    ${chiffre('t1', 'Vues sur la recherche', nombre(courant.vues_recherche), ecart(courant.vues_recherche, avant?.vues_recherche))}
    ${chiffre('t2', 'Vues sur Maps', nombre(courant.vues_maps), ecart(courant.vues_maps, avant?.vues_maps))}
    ${chiffre('t3', 'Appels', nombre(courant.appels), ecart(courant.appels, avant?.appels))}
    ${chiffre('t4', 'Vues qui mènent à un geste', taux(courant) || '—',
      tauxAction(courant) == null ? '<span class="as-ecart">il manque des vues</span>'
        : tauxEstMinimum(courant) ? '<span class="as-ecart">une interaction n’est pas saisie</span>' : '',
      'Appels, itinéraires, clics et messages rapportés au nombre de vues')}
  </div>`;

  const histoire = `<section class="as-carte as-large">
    <header><h3>Vues mois par mois</h3><span class="small muted">douze derniers mois saisis</span></header>
    ${barres(lignes) || '<p class="as-vide">Aucun chiffre saisi pour l’instant.</p>'}
  </section>`;

  const gestes = `<section class="as-carte">
    <header><h3>Ce que les gens ont fait</h3><span class="small muted">${esc(libelleMois(courant.mois))}</span></header>
    ${actions(courant)}
  </section>`;

  const note = `<section class="as-carte">
    <header><h3>Notes du mois</h3></header>
    ${courant.note ? `<p class="fg-note">${esc(courant.note)}</p>` : '<div class="as-vide">Rien de noté pour ce mois.</div>'}
  </section>`;

  const table = `<section class="as-carte as-large">
    <header><h3>Tous les mois saisis</h3><span class="small muted">un clic sur une ligne pour la corriger</span></header>
    <div class="table-wrap"><table class="as-table fg-table">
      <thead><tr><th>Mois</th><th>Recherche</th><th>Maps</th><th>Appels</th><th>Itinéraires</th><th>Clics site</th><th>Messages</th><th>Geste / vues</th></tr></thead>
      <tbody>${[...lignes].reverse().map(l => `<tr data-mois="${l.mois}" class="${l.mois === courant.mois ? 'est-courant' : ''}" tabindex="0">
          <td class="nowrap"><b>${esc(libelleMois(l.mois))}</b></td>
          ${COMPTEURS.map(c => `<td>${nombre(l[c.cle])}</td>`).join('')}
          <td>${taux(l) || '—'}</td>
        </tr>`).join('')}</tbody>
    </table></div>
  </section>`;

  return `${retard}${hero}${tuiles}
    <div class="as-grille">
      ${histoire}
      ${gestes}
      ${note}
      ${faceAuSite(cle, courant.mois, courant)}
      ${table}
    </div>
    <p class="small muted ana-note">Ces chiffres sont saisis à la main depuis l’appli Google Business Profile : le relevé automatique demande une autorisation Google qui n’a pas été demandée, pour ne pas exposer la fiche à un examen. Google ne garde que six mois de performances.</p>`;
}

/**
 * Branche les commandes de l'onglet. `redessine(mois)` est fourni par l'écran
 * Analyse : c'est lui qui tient le mois regardé, pour la raison écrite sur
 * `vueFiche`.
 */
export function lierFiche(root, cle, mois, redessine) {
  const sel = root.querySelector('#fg-mois');
  // ⚠ LE MOIS AFFICHÉ SE LIT DANS LE SÉLECTEUR, PAS DANS `mois` : celui-ci vaut
  // `null` tant que personne n'a choisi — la vue montre alors le plus récent
  // saisi, et « Modifier ce mois » doit ouvrir CELUI-LÀ. Le déduire une seconde
  // fois ici ferait deux façons de désigner le même mois.
  const affiche = sel?.value || mois || null;

  const ajouter = root.querySelector('#fg-ajouter');
  if (ajouter) ajouter.onclick = () => formulaireMois(cle, dernierMoisComplet(), (m) => redessine(m));
  const modifier = root.querySelector('#fg-modifier');
  if (modifier && affiche) modifier.onclick = () => formulaireMois(cle, affiche, (m) => redessine(m));
  if (sel) sel.onchange = () => redessine(sel.value);
  root.querySelectorAll('.fg-table tbody tr[data-mois]').forEach(tr => {
    const ouvrir = () => formulaireMois(cle, tr.dataset.mois, (m) => redessine(m));
    tr.onclick = ouvrir;
    tr.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ouvrir(); } };
  });
}
