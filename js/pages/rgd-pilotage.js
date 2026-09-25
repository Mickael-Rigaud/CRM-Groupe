// Espace RGD Renova — vue d'ensemble
//
// ÉTAPE 4 DE LA MIGRATION. C'est l'écran d'accueil du tableau de bord RGD,
// refait ici en lecture seule. Il passe avant le rang 6 parce que c'est celui
// que Mickael ouvre le matin.
//
// LES CHIFFRES SONT CEUX DU TABLEAU DE BORD, PAS LES MIENS
// Chaque KPI reprend la définition écrite dans `worker/src/routes/stats.js`,
// pas une définition plus simple qui aurait donné un nombre voisin. Deux écrans
// qui affichent deux vérités différentes sur le même chiffre, c'est pire que
// pas d'écran du tout : personne ne sait plus lequel croire.
//
// LE CA AFFICHÉ EST CELUI QUE LE CRM CALCULE — depuis le 23/09/2026
// `manual_ca_ht_exercice` et `manual_ca_ttc_exercice` (table `rgd_reglages`)
// l'emportent TOUJOURS sur le calcul quand elles portent une valeur, mais
// elles sont désormais VIDES, et c'est délibéré.
//
// ⚠ POURQUOI ON A COUPÉ CETTE CORRECTION, ET CE QU'ELLE A COÛTÉ.
// Elle existait parce que le calcul sous-estimait : la reprise Costructor
// était incomplète. Ce n'est plus vrai — la synchronisation a été réparée le
// 23/09/2026 et le calcul donne exactement le chiffre de Costructor.
//
// Mais elle a coûté cher avant d'être coupée. La synchronisation était en
// panne depuis le 27/07 ; le calcul était donc figé, et la valeur saisie
// aussi, puisqu'elle datait du même moment. **Les deux coïncidaient au
// centime**, ce qui donnait l'air d'une donnée saine — alors qu'il manquait
// 21 000 € et deux mois de factures. Une correction manuelle ne masque pas
// seulement un écart : elle masque le SIGNAL qu'un écart apparaîtrait.
//
// Si quelqu'un en repose une, l'écran le dit et rappelle de vérifier la date
// du dernier relevé avant de se rassurer. Ne pas retirer cet avertissement.
//
// CE QUE CET ÉCRAN NE SAIT PAS
// Les notes Google Keep (jamais reprises, elles vivent chez Google), les
// relances dues et les formations à recycler (tables `relances` et
// `competences`, vides dans D1 au 21/09/2026). Il le dit au lieu d'afficher
// zéro, qui se lirait comme un résultat.
import { scope } from '../data/scope.js';
import { esc, eur, isoDay, fmtDate, daysSince } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard, KEY } from './rgd-espace.js';
import { etapesRgd } from '../data/rgd-etapes.js';

// L'exercice comptable de RGD Renova : 1er octobre → 30 septembre, aligné sur
// Costructor. Ce n'est pas l'année civile, et s'y tromper décale tout le CA.
const exercice = (d = new Date()) => {
  const a = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 10
    ? { du: `${a}-10-01`, au: `${a + 1}-09-30`, label: `${a}–${a + 1}` }
    : { du: `${a - 1}-10-01`, au: `${a}-09-30`, label: `${a - 1}–${a}` };
};

// LE PIPELINE COMMERCIAL — LES SEPT ÉTAPES DE « CLIENTS & PROSPECTS »
//
// ⚠ IL NE CALCULE PLUS RIEN : `etapesRgd()` fait foi (js/data/rgd-etapes.js).
// Avant le 23/09/2026 cet écran reprenait sept étapes d'une route du worker,
// bâties sur `statut_suivi` seul — deux écrans, deux vocabulaires, et des
// nombres qui ne se retrouvaient nulle part.
//
// J'avais d'abord réécrit le calcul ici. C'était l'erreur à ne pas faire :
// « deux écrans qui affichent deux vérités sur le même chiffre valent moins
// que pas d'écran du tout ». Et ma version se trompait déjà — il lui manquait
// le garde qui écarte les fiches Costructor restées au statut par défaut, donc
// les 158 de l'annuaire se seraient déversées dans « Nouvelle demande ».
//
// ⚠ CE N'EST PAS UNE COHORTE. Chaque étape compte ce qui s'y trouve
// AUJOURD'HUI, pas ce qu'est devenue une population arrivée à une date donnée.
// Les nombres ne décroissent donc pas forcément et il n'y a aucun taux de
// passage à en tirer — d'où une frise à colonnes de MÊME largeur, et surtout
// pas un entonnoir qui rétrécit : la forme raconterait ce que les chiffres
// démentent.
const COULEURS = {
  demande: '#9CA3AF', rdv: '#2A6FBF', devis_encours: '#B45C00',
  devis_accepte: '#FD7A2C', chantier_encours: '#22C55E',
  chantier_termine: '#059669', archives: '#B91C1C',
};

/**
 * Ce qui PÈSE à chaque étape : l'argent, et ce qui ne bouge plus.
 *
 * ⚠ SANS ÇA, LA FRISE NE SERT À RIEN. Sept compteurs répètent exactement les
 * onglets de « Clients & prospects » — on les a déjà. Un pipeline répond à
 * deux questions qu'un compteur ne pose pas : OÙ EST L'ARGENT, et QU'EST-CE
 * QUI NE BOUGE PLUS. Mesuré le 23/09/2026 : 41 devis signés pour 721 365 €,
 * dont 39 datent de plus d'un mois, et UN SEUL chantier en cours. Un écran
 * qui affichait « 6 » au lieu de ça taisait l'essentiel.
 *
 * ⚠ LE MONTANT NE COMPTE PAS LES MÊMES OBJETS QUE LA COLONNE, et c'est dit à
 * l'écran. La colonne compte des PERSONNES — la même population que la base ;
 * le montant compte des DEVIS ou des CHANTIERS, dont une personne peut avoir
 * plusieurs. Écrire « 721 365 € » sous un « 6 » sans le préciser laisserait
 * croire que six dossiers pèsent cette somme.
 */
const VIEUX_JOURS = { devis_encours: 30, devis_accepte: 30, chantier_encours: 90 };

function poidsDesEtapes(devis, chantiers, aujourdhui) {
  const jours = (d) => d ? Math.floor((new Date(aujourdhui) - new Date(String(d).slice(0, 10))) / 86400000) : null;
  const bilan = (liste, dateDe, nom, seuil) => {
    if (!liste.length) return null;
    const ages = liste.map(x => jours(dateDe(x))).filter(n => n !== null);
    return {
      n: liste.length, nom,
      montant: liste.reduce((t, x) => t + (Number(x.montant_ht) || 0), 0),
      vieux: seuil ? ages.filter(a => a > seuil).length : 0,
      seuil,
      plusVieux: ages.length ? Math.max(...ages) : null,
    };
  };
  const ouvert = (d) => ['envoye', 'en_cours', 'brouillon'].includes(d.statut);
  const signe = (d) => ['signe', 'accepte'].includes(d.statut);
  return {
    devis_encours: bilan(devis.filter(ouvert), d => d.date_envoi || d.date_creation,
      'devis', VIEUX_JOURS.devis_encours),
    devis_accepte: bilan(devis.filter(signe), d => d.date_signature || d.date_creation,
      'devis', VIEUX_JOURS.devis_accepte),
    chantier_encours: bilan(chantiers.filter(c => c.etat === 'en_cours'),
      c => c.work_start_at || c.date_debut_reelle || c.created_at, 'chantier',
      VIEUX_JOURS.chantier_encours),
    chantier_termine: bilan(chantiers.filter(c => c.etat === 'termine'),
      c => c.date_fin_reelle || c.updated_at, 'chantier', null),
  };
}

/**
 * La frise du pipeline : une colonne par étape, cliquable vers son onglet.
 * ⚠ MÊME LARGEUR POUR TOUTES — voir plus haut : ce n'est pas un entonnoir.
 */
function frisePipeline(etapes, poids) {
  const max = Math.max(1, ...etapes.map(e => e.n));
  const total = etapes.filter(e => !e.hors).reduce((t, e) => t + e.n, 0);
  // ⚠ Le pluriel ne s’ajoute pas aveuglément : « devis » est invariable, on
  // avait « 3 deviss ». Seuls les mots qui ne finissent pas par s le prennent.
  // ⚠ « 3 devis » est écrit en toutes lettres à côté du montant : sans ce mot,
  // on lirait le montant comme celui des personnes comptées au-dessus.
  const poidsCarte = (p) => !p ? '<span class="rgd-et-poids"></span>' : `<span class="rgd-et-poids">
    <b>${esc(eur(p.montant))}</b>
    <em>${p.n} ${esc(p.nom)}${p.n > 1 && !p.nom.endsWith('s') ? 's' : ''}</em>
    ${p.vieux ? `<u title="Rien n'a bougé depuis plus de ${p.seuil} jours">${p.vieux} dormant${p.vieux > 1 ? 's' : ''}</u>` : ''}
  </span>`;
  const carte = (e) => `<a class="rgd-et${e.hors ? ' hors' : ''}"
      href="#/rgd/clients?vue=${esc(e.cle)}" style="--c:${esc(e.couleur)}"
      title="${esc(e.titre || e.label)} — ouvrir dans Clients &amp; prospects">
    <span class="rgd-et-n">${e.n}</span>
    <span class="rgd-et-label">${esc(e.label)}</span>
    <span class="rgd-et-piste"><i style="height:${Math.round((e.n / max) * 100)}%"></i></span>
    ${poidsCarte(poids?.[e.cle])}
    <span class="rgd-et-part">${total && !e.hors ? Math.round((e.n / total) * 100) + ' %' : ''}</span>
  </a>`;
  return `<div class="rgd-frise">
    ${etapes.filter(e => !e.hors).map(carte).join('')}
    <span class="rgd-frise-sep" aria-hidden="true"></span>
    ${etapes.filter(e => e.hors).map(carte).join('')}
  </div>`;
}


/**
 * Le CA facturé mois par mois sur l'exercice.
 * ⚠ LES MOIS À VENIR NE SONT PAS RENDUS : une barre à zéro pour un mois qui
 * n'a pas eu lieu se lit comme un mois sans activité.
 */
function caParMois(paiements, d = new Date()) {
  const debut = d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1;
  const mois = [];
  for (let i = 0; i < 12; i++) {
    const m = new Date(debut, 9 + i, 1);
    if (m > d) break;
    const cle = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    mois.push({
      cle, label: m.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      ht: paiements.filter(p => p.statut !== 'annule' && String(p.date_facturation || '').slice(0, 7) === cle)
        .reduce((t, p) => t + (Number(p.montant_ht) || 0), 0),
    });
  }
  return mois;
}

/**
 * La courbe du CA : une barre par mois, une ligne pour la suivre, et le montant
 * du mois au survol.
 *
 * ⚠ PAS DE BIBLIOTHÈQUE. Chart.js est vendu dans le CRM, mais douze valeurs ne
 * justifient pas de le charger sur l'écran qu'on ouvre le matin.
 *
 * ⚠ LE SURVOL EST EN CSS, PAS EN JAVASCRIPT. Chaque mois est un `<g>` qui
 * porte une zone de capture invisible sur TOUTE la hauteur : on n'a pas à
 * viser la barre, qui est minuscule les mois creux — août fait 4 518 € contre
 * 67 000 € en mai. Sans cette zone, le mois le plus intéressant à survoler
 * serait le plus difficile à atteindre.
 *
 * ⚠ LA BULLE EST RECADRÉE AUX BORDS. Centrée sur le premier ou le dernier
 * mois, elle sortirait du cadre et serait coupée — un SVG ne déborde pas.
 */
function courbeCa(mois) {
  if (!mois.length) return '<div class="empty">Aucune facture sur cet exercice.</div>';
  const L = 960, H = 260, bas = H - 34, gauche = 56, droite = 14;
  const large = L - gauche - droite, pas = large / mois.length;
  const max = Math.max(1, ...mois.map(m => m.ht));
  const y = (v) => bas - (v / max) * (bas - 30);
  const x = (i) => gauche + pas * i + pas / 2;

  const graduations = [0, 0.25, 0.5, 0.75, 1].map(f => `<g>
    <line x1="${gauche}" x2="${L - droite}" y1="${y(max * f)}" y2="${y(max * f)}" class="rgd-grille"></line>
    <text x="${gauche - 10}" y="${y(max * f) + 4}" class="rgd-axe" text-anchor="end">${Math.round(max * f / 1000)}k€</text></g>`).join('');

  // L'aire sous la courbe, en dégradé : elle donne le volume que douze barres
  // seules ne montrent pas, et se referme sur la ligne du zéro.
  const aire = `M${x(0).toFixed(1)},${bas} `
    + mois.map((m, i) => `L${x(i).toFixed(1)},${y(m.ht).toFixed(1)}`).join(' ')
    + ` L${x(mois.length - 1).toFixed(1)},${bas} Z`;
  const trait = mois.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.ht).toFixed(1)}`).join(' ');

  const LARGE_BULLE = 108, HAUT_BULLE = 40;
  const colonnes = mois.map((m, i) => {
    const cx = x(i);
    // Recadrage : la bulle reste entière dans le cadre.
    const bx = Math.min(Math.max(cx - LARGE_BULLE / 2, 2), L - LARGE_BULLE - 2);
    // Au-dessus du point, sauf quand le point est trop haut : elle passe dessous.
    const haut = y(m.ht) - HAUT_BULLE - 10;
    const by = haut < 2 ? y(m.ht) + 12 : haut;
    return `<g class="rgd-mois">
      <rect class="rgd-zone" x="${(gauche + pas * i).toFixed(1)}" y="0" width="${pas.toFixed(1)}" height="${bas}"></rect>
      <rect class="rgd-barre" x="${(gauche + pas * i + pas * 0.24).toFixed(1)}" y="${y(m.ht).toFixed(1)}"
        width="${(pas * 0.52).toFixed(1)}" height="${Math.max(0, bas - y(m.ht)).toFixed(1)}" rx="4"></rect>
      <circle class="rgd-point" cx="${cx.toFixed(1)}" cy="${y(m.ht).toFixed(1)}" r="4.5"></circle>
      <g class="rgd-info" transform="translate(${bx.toFixed(1)},${by.toFixed(1)})">
        <rect width="${LARGE_BULLE}" height="${HAUT_BULLE}" rx="8" class="rgd-bulle"></rect>
        <text x="${LARGE_BULLE / 2}" y="16" text-anchor="middle" class="rgd-bulle-mois">${esc(m.label)}</text>
        <text x="${LARGE_BULLE / 2}" y="32" text-anchor="middle" class="rgd-bulle-ca">${esc(eur(m.ht))}</text>
      </g>
      <title>${esc(m.label)} · ${esc(eur(m.ht))} HT</title>
    </g>`;
  }).join('');

  const legendes = mois.map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="rgd-axe" text-anchor="middle">${esc(m.label)}</text>`).join('');

  return `<svg class="rgd-courbe" viewBox="0 0 ${L} ${H}" role="img"
    aria-label="Chiffre d'affaires HT facturé mois par mois sur l'exercice">
    <defs><linearGradient id="rgd-aire" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity=".28"></stop>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"></stop>
    </linearGradient></defs>
    ${graduations}
    <path d="${aire}" fill="url(#rgd-aire)"></path>
    <path d="${trait}" class="rgd-trait"></path>
    ${colonnes}${legendes}</svg>`;
}

export const rgdPilotagePage = {
  title: () => 'RGD Renova — Vue d’ensemble',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);

    const draw = () => {
      const aujourdhui = isoDay();
      const ex = exercice();

      const chantiers = scope.rgd('rgd_chantiers');
      const devis = scope.rgd('rgd_devis');
      const paiements = scope.rgd('rgd_paiements');
      const sousTraitants = scope.rgd('rgd_sous_traitants');
      const demandes = scope.rgd('rgd_demandes');
      const rdv = scope.rgd('agenda_events').filter(e => e.activity === KEY && e.day === aujourdhui);
      const reglage = (cle) => scope.rgd('rgd_reglages').find(r => r.cle === cle)?.valeur ?? null;

      // CA DE L'EXERCICE — calculé, puis la correction manuelle par-dessus.
      // Les deux sont montrés : l'écart dit à quel point Costructor est en retard.
      const calculeHt = paiements
        .filter(p => p.statut !== 'annule' && p.date_facturation
          && p.date_facturation >= ex.du && p.date_facturation <= ex.au)
        .reduce((t, p) => t + (Number(p.montant_ht) || 0), 0);
      const corrigeHt = reglage('manual_ca_ht_exercice');
      const caHt = corrigeHt !== null ? Number(corrigeHt) : calculeHt;
      const corrige = corrigeHt !== null && Math.round(Number(corrigeHt)) !== Math.round(calculeHt);

      // DE QUAND DATE CE CA. Le CA calculé ne vaut que ce que vaut le dernier
      // relevé des encaissements Costructor, et ça, l'écran ne le disait pas :
      // la synchronisation des paiements s'est arrêtée le 24/07/2026 sans que
      // rien ne le signale, et deux mois plus tard le chiffre affiché était
      // toujours celui de juillet — avec l'air d'être à jour. Une donnée vieille
      // est plus dangereuse qu'une donnée absente, parce qu'elle se lit comme
      // fraîche : c'est la seule raison d'être de ce bloc.
      const syncPaiements = scope.rgd('rgd_costructor_etat').find(e => e.ressource === 'payments');
      const ageSync = syncPaiements?.dernier_succes ? daysSince(syncPaiements.dernier_succes) : null;
      const syncKo = ageSync === null || ageSync > 2;
      const dernierEncaissement = paiements
        .map(p => p.date_facturation).filter(Boolean).sort().at(-1) || null;

      // Pièces de sous-traitants qui expirent sous 30 jours ou sont déjà passées.
      const docsSt = sousTraitants.filter(st => st.actif !== false
        && ['attestation_urssaf_expire', 'attestation_vigilance_expire', 'assurance_decennale_expire']
          .some(k => st[k] && daysSince(st[k]) > -30));

      const leads = demandes.filter(d => !d.statut || d.statut === 'nouvelle' || d.statut === 'en_attente');

      const clients = scope.rgd('rgd_clients');
      const mois = caParMois(paiements);
      const moyenne = mois.length ? Math.round(caHt / mois.length) : 0;
      // Les sept étapes viennent du module commun : le pipeline et la liste
      // comptent forcément les mêmes personnes, y compris les gardes.
      const etapes = etapesRgd().map(e => ({
        ...e, cle: e.key, couleur: COULEURS[e.key] || 'var(--accent)',
        hors: e.key === 'archives',
      }));
      const totalEtapes = etapes.filter(e => !e.hors).reduce((t, e) => t + e.n, 0);

      // L'ORDRE DE LA PAGE, REVU PAR MICKAEL LE 25/09/2026 : le pipeline
      // d'abord, puis le chiffre d'affaires et la journée côte à côte, les
      // alertes en bas.
      //
      // Il remplace l'ordre du 21/09 — chiffre d'affaires, quatre chiffres
      // clés, pipeline. Ce que le changement dit : on n'ouvre pas cet écran
      // le matin pour lire un montant, mais pour voir où en sont les affaires.
      // Le CA de l'exercice ne bouge pas d'un jour à l'autre ; le pipeline, si.
      //
      // ⚠ LES QUATRE CHIFFRES CLÉS SONT RETIRÉS, comme sur Clients, Partenaires,
      // Sous-traitants, Réalisations et Chantiers avant eux — c'est la cinquième
      // fois que la demande revient, et toujours pour la même raison : une
      // rangée de grandes cartes repousse sous la ligne de flottaison ce qu'on
      // est venu voir. Ne pas les remettre.
      //
      // ⚠ CE QUI EST PARTI AVEC EUX, ET C'EST VOULU : une cinquantaine de lignes
      // de calcul que plus rien ne lisait — rentabilité moyenne, chantiers en
      // cours au sens strict du tableau de bord, devis en attente, paiements en
      // retard — plus les lectures de `rgd_missions` et `rgd_fournitures` qui
      // n'alimentaient qu'eux. Les garder « au cas où » aurait refait ici le
      // défaut que le tableau de bord d'origine traîne dans `overview.js` :
      // cinq cents lignes mortes et quatre appels d'API que personne ne lit.
      // Elles restent dans l'historique Git, qui est fait pour ça.
      const corps = `

        <section class="card rgd-pipe">
          <div class="card-head"><h2>Pipeline</h2>
            <span class="grow"></span>
            <a class="btn ghost sm" href="#/rgd/clients">Ouvrir la base →</a></div>
          ${frisePipeline(etapes, poidsDesEtapes(devis, chantiers, aujourdhui))}
          <p class="small muted rgd-pipe-pied">${totalEtapes
            ? `${totalEtapes} affaire${totalEtapes > 1 ? 's' : ''} suivie${totalEtapes > 1 ? 's' : ''}, toutes étapes confondues.`
            : 'Aucune affaire à suivre pour le moment.'}
            Chaque étape compte ce qui s’y trouve <b>aujourd’hui</b> : ce n’est pas une
            cohorte, les nombres ne décroissent donc pas forcément et il n’y a pas de
            taux de passage à en tirer.
            Chaque colonne mène à son onglet dans <a href="#/rgd/clients">Clients &amp; prospects</a>,
            où l’on retrouve exactement les mêmes personnes.
            Le montant sous chaque étape compte les <b>devis</b> ou les <b>chantiers</b>
            qui s’y trouvent — pas les personnes, dont une seule peut en avoir plusieurs.
            <b class="rgd-dormant">Dormant</b> veut dire que rien n’a bougé depuis plus de
            30 jours sur un devis, 90 sur un chantier.</p>
        </section>

        <div class="rgd-duo">

        <section class="card rgd-ca">
          <div class="card-head"><h2>Chiffre d’affaires ${esc(ex.label)}</h2>
            <span class="grow"></span>
            <span class="muted small">exercice du 1<sup>er</sup> octobre au 30 septembre</span></div>
          <div class="rgd-ca-ligne">
            <b class="rgd-ca-montant">${eur(caHt)}</b>
            <span class="muted">HT</span>
            ${corrige ? '<span class="chip amber">corrigé à la main</span>' : ''}
          </div>
          <p class="small muted rgd-ca-sous">Moyenne mensuelle ${eur(moyenne)} HT sur
            ${mois.length} mois écoulé${mois.length > 1 ? 's' : ''}.</p>
          ${courbeCa(mois)}
          ${corrige ? `<p class="small">
            <b>Ce chiffre est saisi à la main</b> et masque le calcul, qui donne
            ${eur(calculeHt)}. Tant qu’une correction existe, l’écran ne peut plus
            signaler que la synchronisation Costructor est en retard : c’est
            exactement ce qui a caché deux mois de factures absentes jusqu’au
            23/09/2026. Si les deux valeurs se ressemblent, vérifiez la date du
            dernier relevé avant de conclure que tout va bien.
            Pour rendre la main au calcul : saisir <b>0</b> dans les
            <a href="#/rgd/reglages">réglages</a>.
            <b>La courbe, elle, montre le calculé</b> — mois par mois, il n’existe pas
            de saisie manuelle, et lisser la correction sur douze mois inventerait
            une répartition que personne n’a constatée.</p>`
            : '<p class="small muted">Calculé sur les factures de l’exercice, avoirs déduits, annulées exclues.</p>'}
          ${reglage('manual_clients_actifs') !== null ? `<p class="small muted">
            Clients actifs déclarés : <b>${esc(reglage('manual_clients_actifs'))}</b>,
            également saisi à la main côté RGD.</p>` : ''}
          <p class="rgd-ca-frais small ${syncKo ? 'ko' : 'ok'}">
            <span class="chip ${syncKo ? 'red' : 'green'}">${syncKo ? 'Encaissements en retard' : 'Encaissements à jour'}</span>
            <span class="grow">${syncPaiements?.dernier_succes
              ? `Dernier relevé Costructor des paiements ${esc(fmtDate(syncPaiements.dernier_succes))}${ageSync > 2
                ? `, il y a ${ageSync} jours : <b>le CA calculé est celui de cette date</b>, pas celui d’aujourd’hui.` : '.'}`
              : 'Aucun relevé Costructor des paiements n’est enregistré : rien ne dit de quand date ce CA.'}
            ${dernierEncaissement ? ` Dernière facture connue : ${esc(fmtDate(dernierEncaissement))}.` : ''}</span>
            <a href="#/rgd/costructor">Voir la synchronisation</a>
          </p>
        </section>

        <section class="card rgd-jour">
          <div class="card-head"><h2>Aujourd’hui</h2>
            <span class="grow"></span>
            <span class="muted small">${fmtDate(aujourdhui)}</span></div>
          ${rdv.length ? `<ul class="pil-liste">${rdv
            .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
            .map(e => `<li>
              <b>${e.all_day ? 'journée' : esc(new Date(e.starts_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</b>
              <span>${esc(e.title || '(sans titre)')}</span>
              ${e.location ? `<span class="muted small">${esc(e.location)}</span>` : ''}
            </li>`).join('')}</ul>`
            : '<div class="empty">Aucun rendez-vous relevé aujourd’hui.</div>'}
          <p class="small muted">Relevé depuis Google Agenda. Les notes Google Keep du
          tableau de bord ne sont pas reprises : elles vivent chez Google et le CRM
          ne les lit pas.</p>
        </section>

        </div>




        ${docsSt.length || leads.length ? `<div class="pil-alertes">
          ${leads.length ? `<a class="pil-alerte" href="#/rgd/clients">
            <b>${leads.length}</b><span>demande${leads.length > 1 ? 's' : ''} de devis à traiter</span></a>` : ''}
          ${docsSt.length ? `<a class="pil-alerte warn" href="#/rgd/soustraitants">
            <b>${docsSt.length}</b><span>document${docsSt.length > 1 ? 's' : ''} sous-traitants à renouveler</span></a>` : ''}
        </div>` : ''}

        <p class="small muted">Deux indicateurs de l’application RGD manquent ici :
        les <b>relances à envoyer</b> et les <b>formations à recycler</b>. Ces deux listes
        y sont vides, donc rien n’a été repris — afficher zéro laisserait croire qu’il n’y
        a rien à faire, alors que le CRM n’en sait rien.</p>`;

      root.innerHTML = cadre('#/rgd', 'Vue d’ensemble', corps);
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
