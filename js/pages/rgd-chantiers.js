// Espace RGD Renova — chantiers
//
// ÉTAPE 4 DE LA MIGRATION, RANG 1
// Le premier écran de RGD Renova à vivre dans le CRM plutôt que dans son
// application d'origine. « Clients & prospects » le suivait ici jusqu'au
// 21/09/2026 ; il est parti dans `rgd-clients.js` en gagnant ses trois
// rubriques, et ce fichier est passé de 301 à 150 lignes. La coquille — onglets, cadre, bandeau — est
// partagée avec les écrans des rangs suivants et vit dans `rgd-espace.js`. Ils lisent `rgd_chantiers` et les
// contacts marqués `rgd` — c'est-à-dire le relevé que le worker dépose toutes
// les demi-heures. Les douze autres écrans restent dans l'application, qui
// garde son onglet : la bascule se fait un rang à la fois.
//
// LECTURE SEULE, ET CE N'EST PAS UN OUBLI
// Cloudflare D1 reste la vérité tant que l'étape 5 n'est pas franchie. Écrire
// ici créerait deux sources qui divergent : la modification serait écrasée au
// relevé suivant, sans bruit. Tant que la flèche ne va que dans un sens, on ne
// peut pas se tromper — et le bandeau le dit à celui qui regarde.
//
// L'AFFAIRE ET LE CHANTIER
// Un chantier RGD est deux choses : une affaire qu'on vend, puis des travaux
// qu'on exécute. Le pipeline du CRM porte la vente et s'arrête à
// « Négociation » ; `rgd_chantiers` porte l'exécution. Ces écrans montrent les
// deux ensemble, ce que ni l'un ni l'autre ne sait faire seul.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { openDeal } from './deal.js';
// ⚠ LA FICHE CLIENT VIENT DE « CLIENTS & PROSPECTS », telle quelle.
// Demandé par Mickael le 24/09/2026 : la fiche ouverte depuis Chantiers doit
// être la même qu'ailleurs. En refaire une ici donnerait deux fiches pour une
// même personne, qui divergeraient à la première colonne ajoutée.
import { ouvrirFicheDuClient } from './rgd-clients.js';

import { KEY, act, cadre, guard, clientDe as clientDeAffaire } from './rgd-espace.js';
import { peutEcrire, majStatutChantier, creerChantier } from '../data/rgd-api.js';
import { toast, openModal, closeModal } from '../ui.js';
// La source unique des étapes, partagée avec « Clients & prospects ». Cet
// écran la LIT et l'ÉCRIT : il n'a pas de vocabulaire à lui.
import { etapeDeFiche, STATUT_DE_L_ETAPE, ETAPES_RGD, joursDeVisite,
         ecrireStatut } from '../data/rgd-etapes.js';

// LES DIX STATUTS DU TABLEAU DE BORD, dans son ordre — de la préparation à la
// réception. Ils ne se confondent pas avec `etat`, qui n'en est qu'une
// TRADUCTION en quatre valeurs (`push_rgd`) : `relance_1` et `relance_2`
// donnent le même état, d'où la colonne `statut_d1` qui porte le brut.
const STATUTS_CHANTIER = [
  { key: 'en_preparation',   label: 'En préparation' },
  { key: 'visite_technique', label: 'Visite technique' },
  { key: 'devis_en_cours',   label: 'Devis en cours' },
  { key: 'devis_presente',   label: 'Devis présenté' },
  { key: 'relance_1',        label: 'Relance 1' },
  { key: 'relance_2',        label: 'Relance 2' },
  { key: 'devis_signe',      label: 'Devis signé' },
  { key: 'demarrage',        label: 'Démarrage' },
  { key: 'en_cours',         label: 'Chantier en cours' },
  { key: 'termine',          label: 'Chantier terminé' },
];

// Le client d'une affaire, avec la forme attendue par cet écran.
const clientDe = (affaire) => {
  const nom = clientDeAffaire(affaire, db);
  return nom ? { nom } : null;
};

// Les états d'exécution, dans l'ordre du chantier. `null` = pas encore vendu :
// l'affaire est toujours en discussion, il n'y a pas de travaux.
const ETATS = [
  { key: 'signe', label: 'Signé', ton: 'accent' },
  { key: 'demarrage', label: 'Démarrage', ton: 'amber' },
  { key: 'en_cours', label: 'En cours', ton: 'green' },
  { key: 'termine', label: 'Terminé', ton: 'muted' },
];
const etatDe = (c) => ETATS.find(e => e.key === c.etat) || null;

// ---------------------------------------------------------------- Pipeline
// LES QUATRE COLONNES, reprises du tableau de bord RGD à l'identique, couleurs
// comprises. Ce n'est pas l'inventaire des chantiers : c'est ceux sur lesquels
// il reste quelque chose à faire. Voir `rangerEnPipeline` pour ce qui en sort.
//
// ⚠ CHAQUE COLONNE EST UNE ÉTAPE DU CYCLE COMMUN, et c'est tout le sujet du
// 24/09/2026. Cet écran s'était fabriqué ses propres règles à partir de
// `statut_d1`, donc sa propre vérité : un dossier pouvait être en
// « Nouvelle demande » dans « Clients & prospects » et en « Visite technique »
// ici, au même instant. Deux écrans qui montrent deux états d'un même dossier
// valent moins qu'un seul écran.
//
// La correspondance n'est donc PAS une table de traduction posée à côté : le
// champ `etape` nomme la clé de `js/data/rgd-etapes.js`, qui est la source
// unique. Changer une étape là-bas change cet écran, sans rien à recopier.
//
//   Visite technique  = RDV planifié
//   Démarrage         = Devis accepté   (préparé, pas encore commencé)
//   Chantier en cours = Chantier en cours
//   Chantier terminé  = Chantier terminé
//
// Les trois étapes qui manquent — Nouvelle demande, Devis en cours, Archivés —
// ne sont pas des oublis : il n'y a pas de chantier à suivre avant qu'un devis
// soit accepté, et un dossier perdu n'est plus du travail.
const PIPELINE_ETAPES = [
  { key: 'visite_technique', etape: 'rdv',              label: 'Visite technique',  couleur: '#93C5FD' },
  { key: 'demarrage',        etape: 'devis_accepte',    label: 'Démarrage',         couleur: '#FFB877' },
  { key: 'en_cours',         etape: 'chantier_encours', label: 'Chantier en cours', couleur: '#FF9A3D' },
  { key: 'termine',          etape: 'chantier_termine', label: 'Chantier terminé',  couleur: '#FF8A00' },
];
const COLONNE_DE_L_ETAPE = Object.fromEntries(PIPELINE_ETAPES.map(e => [e.etape, e.key]));
// Le nom que « Clients & prospects » donne à l'étape, pris à la source : on
// l'affiche sous le titre de la colonne pour que la correspondance se lise
// sans avoir à la connaître.
const ETAPE_LABEL = Object.fromEntries(ETAPES_RGD.map(e => [e.key, e.label]));

// Trois mois sans rien qui bouge : le chantier quitte la pipeline. Il reste
// entier dans la liste et dans la fiche.
//
// ⚠ CETTE BORNE VAUT POUR LES QUATRE COLONNES, et c'est une correction du
// 24/09/2026. Elle ne s'appliquait d'abord qu'aux chantiers terminés, ce qui
// laissait dormir indéfiniment ceux d'avant : le plus gros du portefeuille
// restait en « Démarrage » quatre mois et demi après son dernier mouvement, un
// autre y était depuis **quinze mois**. Une pipeline qui garde les vieux cesse
// d'être une liste de travail.
const JOURS_SANS_MOUVEMENT = 90;

// Ce que le tableau de bord calculait côté serveur et renvoyait tout mâché
// (`nb_devis_signes`, `total_recu_ht`…). Ici les devis et les factures sont
// déjà en mémoire : on les compte sur place, ce qui évite une table de plus à
// tenir à jour — et surtout évite qu'elle se désynchronise.
function mesure(c) {
  const devis = scope.rgd('rgd_devis').filter(d => d.deal_id === c.deal_id);
  const factures = scope.rgd('rgd_paiements').filter(p => p.deal_id === c.deal_id);
  const signes = devis.filter(d => d.statut === 'signe');
  // ⚠ Un avoir et une facture annulée ne seront jamais « reçus ». Les compter
  // comme dues empêcherait tout chantier de sortir de la pipeline.
  const reelles = factures.filter(p => p.type !== 'remboursement' && p.statut !== 'annule');
  const recues = reelles.filter(p => p.statut === 'recu');
  const somme = (l, ch) => l.reduce((t, x) => t + (Number(x[ch]) || 0), 0);
  // ⚠ LE DERNIER SIGNE DE VIE, et il ne se lit pas que dans la facturation.
  // Un chantier peut avoir un devis signé récent sans facture encore émise, ou
  // des travaux qui viennent de finir : trois repères, on garde le plus récent.
  const reperes = [
    ...factures.map(p => p.date_reception || p.date_facturation),
    ...signes.map(d => d.date_signature),
    c.work_end_at || c.date_fin_prevue,
  ].filter(Boolean).sort();
  return {
    signes: signes.length,
    factures: reelles.length,
    soldesRecus: reelles.filter(p => p.type === 'solde' && p.statut === 'recu').length,
    // ⚠ CE QUI RESTE DÛ SE MESURE SUR LE FACTURÉ, PAS SUR LE SIGNÉ.
    // Corrigé le 24/09/2026. La première version comptait « devis signés moins
    // encaissé », ce qui inventait une créance là où il n'y en a pas : un
    // chantier de 2025 dont TOUTES les factures ont été annulées ou remboursées
    // réclamait le montant entier de son devis — une opération annulée, pas un
    // impayé.
    // Ce qu'on réclame à un client, c'est une facture qu'il n'a pas payée. Du
    // signé pas encore facturé n'est dû par personne.
    resteADevoir: somme(reelles, 'montant_ht') - somme(recues, 'montant_ht'),
    dernierSigne: reperes.length ? reperes[reperes.length - 1] : null,
  };
}

// LA RÈGLE DE LA PIPELINE, reprise du tableau de bord. Elle ne lit PAS `etat` :
// elle regarde les faits — devis signés, factures, encaissements — sauf quand
// un statut a été posé à la main, qui l'emporte.
//
// ⚠ UN CHANTIER EN SORT, ET C'EST VOULU. Trois cas :
//   · plus rien ne bouge depuis trois mois — quelle que soit sa colonne ;
//   · tout ce qui a été facturé est encaissé — il n'y a plus rien à suivre ;
//   · « démarrage » sans la moindre facture — fantôme d'un vieux devis signé
//     il y a longtemps, que personne ne considère plus actif.
// « Chantier terminé » ne veut donc pas dire « archivé » : cette colonne
// montre les travaux finis dont il RESTE DE L'ARGENT À ENCAISSER. C'est une
// colonne de relance, pas un cimetière — d'où le zéro qu'on y voit souvent.
function rangerEnPipeline(tous) {
  const limite = new Date(Date.now() - JOURS_SANS_MOUVEMENT * 86400000)
    .toISOString().slice(0, 10);
  const paniers = Object.fromEntries(PIPELINE_ETAPES.map(e => [e.key, []]));

  // Les tables lues UNE FOIS pour tout le lot : `etapeDeFiche` les reçoit en
  // argument justement pour ne pas les relire à chaque ligne.
  const fiches = scope.rgd('rgd_clients');
  const chantiers = scope.rgd('rgd_chantiers');
  const devis = scope.rgd('rgd_devis');
  // L'agenda a son mot à dire : une visite technique tient tant que le
  // rendez-vous y figure. Calculé une fois pour tout le lot.
  const joursVisite = joursDeVisite(scope.rgd('agenda_events'));
  const parContact = new Map(fiches.filter(f => f.contact_id).map(f => [f.contact_id, f]));
  const parOrganisation = new Map(fiches.filter(f => f.organisation_id).map(f => [f.organisation_id, f]));

  for (const c of tous) {
    // ⚠ L'ÉTAPE VIENT DE LA FICHE DE LA PERSONNE, PAS DU CHANTIER.
    // C'est ce qui rend les deux écrans solidaires : le statut de suivi que
    // l'on pose dans « Clients & prospects » décide de la colonne ici, et
    // déplacer une carte ici écrit ce même statut là-bas. Il n'y a qu'un
    // curseur, vu de deux endroits.
    const f = (c.contact_id && parContact.get(c.contact_id))
      || (c.organisation_id && parOrganisation.get(c.organisation_id));
    // Sans fiche, on ne sait pas où en est le dossier : on n'invente pas.
    if (!f) continue;
    const colonne = COLONNE_DE_L_ETAPE[etapeDeFiche(f, chantiers, devis, joursVisite)];
    // Nouvelle demande, devis en cours, archivé : ce n'est pas du chantier.
    if (!colonne) continue;

    const m = mesure(c);

    // ⚠ LA BORNE D'ÂGE VAUT POUR LES QUATRE COLONNES, mais seulement s'il
    // existe une date à comparer : une visite technique posée ce matin n'a ni
    // devis ni facture, l'écarter la ferait disparaître le jour même.
    if (m.dernierSigne && m.dernierSigne < limite) continue;
    // Terminé et tout encaissé : il n'y a plus rien à réclamer.
    if (colonne === 'termine' && m.resteADevoir <= 0) continue;

    paniers[colonne].push({ ...c, m, fiche: f });
  }
  return paniers;
}

// La barre d'avancement des travaux, sur la seule colonne « en cours ».
// Ailleurs elle n'aurait rien à mesurer.
function barreAvancement(debut, fin) {
  const j = 86400000;
  const d = new Date(debut + 'T12:00:00'), f = new Date(fin + 'T12:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let pct = 0, ton = 'avant';
  if (today < d) { pct = 0; ton = 'avant'; }
  else if (today > f) { pct = 100; ton = 'retard'; }
  else { pct = Math.round(((today - d) / (f - d)) * 100); ton = pct > 80 ? 'fin' : 'cours'; }
  const restants = Math.ceil((f - today) / j);
  const mot = ton === 'avant' ? `Démarre dans ${Math.ceil((d - today) / j)} j`
    : ton === 'retard' ? `Retard ${Math.abs(restants)} j`
    : `${restants} j restants`;
  return `<div class="rch-avance rch-avance-${ton}">
    <div class="rch-piste"><i style="width:${pct}%"></i><b style="left:${pct}%"></b></div>
    <div class="rch-avance-bas">
      <span>${fmtDate(debut)} → ${fmtDate(fin)}</span>
      <span class="rch-pct">${pct} %</span>
    </div>
    <div class="rch-reste">${esc(mot)}</div>
  </div>`;
}

function carteChantier(c, colonne, ecriture) {
  const cl = clientDe(c.affaire);
  const debut = c.work_start_at || c.date_debut_prevue;
  const fin = c.work_end_at || c.date_fin_prevue;
  // ⚠ LE GRAND CHIFFRE EST LE TTC, le petit le HT. Le tableau de bord
  // affichait `montant_ht` aux DEUX places : les deux lignes d'une carte y
  // montrent le même nombre, dont l'une étiquetée « HT ». Corrigé ici.
  const ttc = Number(c.montant_ttc) || Number(c.montant_ht) || 0;
  const ht = Number(c.montant_ht) || 0;
  // La couleur vient de la COLONNE, pas du statut brut du chantier : c'est
  // l'étape qui range la carte, elle doit aussi la teinter.
  const ton = PIPELINE_ETAPES.find(e => e.key === colonne)?.couleur || '#FF9A3D';
  return `<article class="dcard rch-carte" data-chantier-id="${esc(String(c.id))}"
      data-affaire="${esc(String(c.affaire.id))}"
      ${c.fiche ? `data-fiche="${esc(String(c.fiche.id))}"` : ''}
      ${ecriture && c.fiche ? 'draggable="true"' : ''}
      style="--c:${esc(ton)}">
    <div class="rch-client">${esc(cl ? cl.nom : '—')}</div>
    <div class="t">${esc(c.affaire.title || c.reference || 'Chantier')}</div>
    ${c.ville ? `<div class="p">${esc(c.ville)}</div>` : ''}
    ${colonne === 'en_cours' && debut && fin ? barreAvancement(debut, fin) : ''}
    <div class="rch-sous">
      <div class="rch-ttc">${eur(ttc)}</div>
      ${ht ? `<div class="rch-ht">${eur(ht)} HT</div>` : ''}
    </div>
    <div class="foot">
      <span class="muted">${debut ? fmtDate(debut) : ''}</span>
      <span class="muted s">${c.m.signes} devis · ${c.m.factures} fact.</span>
    </div>
  </article>`;
}

function pipeline(tous, state) {
  const paniers = rangerEnPipeline(tous);
  const dedans = PIPELINE_ETAPES.reduce((t, e) => t + paniers[e.key].length, 0);
  return `
    <section class="rch-pipeline kanban">
      ${PIPELINE_ETAPES.map(e => {
        const cartes = paniers[e.key];
        const total = cartes.reduce((t, c) => t + (Number(c.montant_ht) || 0), 0);
        return `<div class="col rch-col" data-cible="${esc(e.key)}"
            style="border-top:3px solid ${esc(e.couleur)}">
          <div class="rch-tete">
            <b>${esc(e.label)}</b>
            <a class="rch-renvoi" href="#/rgd/clients"
               title="Voir ces dossiers dans Clients &amp; prospects">${esc(ETAPE_LABEL[e.etape] || e.etape)}</a>
            <div class="rch-tete-bas">
              <span class="rch-n">${cartes.length}</span>
              <span class="rch-total">${eur(total)}</span>
            </div>
          </div>
          <div class="rch-cartes">
            ${cartes.map(c => carteChantier(c, e.key, state.ecriture)).join('')
              || '<div class="empty s">—</div>'}
          </div>
        </div>`;
      }).join('')}
    </section>
    ${dedans === 0 && tous.length ? `<div class="alert amber rch-note">
      <b>i</b>
      <div>Aucun de ces ${tous.length} chantiers n'est suivi ici, et ce n'est pas
      une panne : <b>la colonne d'un chantier est l'étape de son dossier</b>. Tant
      qu'un dossier est en « Nouvelle demande » ou « Devis en cours », il n'y a
      pas encore de chantier à suivre — il est dans <b>Clients &amp; prospects</b>,
      à son étape. Un chantier entièrement encaissé, ou dont plus rien n'a bougé
      depuis trois mois, en est sorti. <b>Ils sont tous dans la liste.</b></div>
    </div>` : ''}
    <p class="small muted rch-note">
      ${dedans} chantier${dedans > 1 ? 's' : ''} suivi${dedans > 1 ? 's' : ''} sur ${tous.length}.
      <b>Chaque colonne est une étape de « Clients &amp; prospects »</b> — Visite
      technique = RDV planifié, Démarrage = Devis accepté, et les deux dernières
      portent le même nom des deux côtés. Changer l'étape d'un dossier le déplace
      ici, et déplacer une carte change son étape là-bas : c'est le même curseur.
      Un dossier revenu en <b>Nouvelle demande</b> quitte donc la pipeline.
      <b>Chantier terminé</b> ne veut pas dire archivé — cette colonne montre les
      travaux finis dont il <b>reste une facture à encaisser</b>.
      <b>Un chantier dont plus rien n'a bougé depuis trois mois en sort</b>,
      quelle que soit sa colonne, comme celui qui est entièrement réglé. Les uns
      et les autres restent entiers dans la liste.
      ${state.ecriture ? '' : ' <i>Lecture seule : l’étape se change depuis la fiche.</i>'}
    </p>`;
}

// Le glisser-déposer. Il n'existe que si l'écriture est possible ET si le
// chantier porte son `d1_id` : c'est lui que le tableau de bord attend.
function brancherPipeline(root, state, draw) {
  root.querySelectorAll('.rch-carte').forEach(carte => {
    carte.onclick = (e) => {
      if (e.target.closest('a')) return;
      // La carte ouvre la fiche de la PERSONNE, pas l'affaire : c'est d'elle
      // qu'on a besoin quand on regarde un chantier — ses coordonnées, ses
      // devis, son historique. L'affaire reste joignable depuis la liste.
      const f = carte.dataset.fiche
        && scope.rgd('rgd_clients').find(x => x.id === carte.dataset.fiche);
      if (f) ouvrirFicheDuClient(f, draw);
      else openDeal(carte.dataset.affaire, draw);
    };
    if (!carte.draggable) return;
    carte.addEventListener('dragstart', (e) => {
      // C'est la FICHE qu'on déplace, pas le chantier : son statut de suivi
      // est le curseur commun aux deux écrans.
      e.dataTransfer.setData('text/plain', carte.dataset.fiche);
      carte.classList.add('dragging');
    });
    carte.addEventListener('dragend', () => carte.classList.remove('dragging'));
  });

  if (!state.ecriture) return;
  // Une même fiche ne se déplace qu'une fois par rendu : deux cartes peuvent
  // appartenir à la même personne, et le second dépôt écrirait par-dessus le
  // premier sans que rien ne le dise.
  const dejaBouge = new Set();
  root.querySelectorAll('.rch-col').forEach(col => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const uuid = e.dataTransfer.getData('text/plain');
      const colonne = PIPELINE_ETAPES.find(x => x.key === col.dataset.cible);
      if (!uuid || !colonne || dejaBouge.has(uuid)) return;
      const f = scope.rgd('rgd_clients').find(x => x.id === uuid);
      if (!f) return;
      // ⚠ DÉPLACER UNE CARTE ÉCRIT LE STATUT DE SUIVI DE LA PERSONNE, celui
      // que « Clients & prospects » affiche. C'est ce qui tient les deux
      // écrans ensemble : la pipeline n'a aucun état à elle, donc rien qui
      // puisse diverger. `ecrireStatut` est la seule porte — elle choisit
      // seule entre la source et le reflet selon l'origine de la fiche.
      const statut = STATUT_DE_L_ETAPE[colonne.etape];
      if (!statut || f.statut_suivi === statut) return;

      // On avance l'affichage avant la réponse, et on revient si elle est
      // mauvaise : une carte qui reste sous le doigt pendant l'aller-retour
      // donne l'impression que le geste n'a pas pris, et on le refait.
      const avant = f.statut_suivi;
      f.statut_suivi = statut;
      dejaBouge.add(uuid);
      draw();
      const r = await ecrireStatut({ d1Id: f.d1_id, uuid: f.id, cible: 'client', statut });
      if (r.ok) {
        toast(`Déplacé vers « ${colonne.label} » — le dossier suit dans Clients & prospects`);
      } else {
        f.statut_suivi = avant;
        draw();
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : le statut n’a pas été changé.'
          : `Statut non enregistré — ${r.motif}`, 'err');
      }
    });
  });
}

// Un chantier, vu avec son affaire. Les deux vont toujours ensemble : sans
// l'affaire on ne sait pas à qui c'est, sans le chantier on ne sait pas où ça
// en est.
function chantiers() {
  const affaires = new Map(scope.deals().filter(d => d.activity === KEY).map(d => [d.id, d]));
  return scope.rgd('rgd_chantiers')
    .map(c => ({ ...c, affaire: affaires.get(c.deal_id) || null }))
    // Un chantier dont l'affaire ne nous est pas visible ne nous regarde pas.
    .filter(c => c.affaire)
    .sort((a, b) => String(b.date_debut_prevue || '').localeCompare(String(a.date_debut_prevue || '')));
}

// ---------------------------------------------------------------- Chantiers
// La cellule « Statut ». Un menu quand l'écriture est possible ET que le
// statut brut est connu : sans lui, on ne saurait pas quoi présélectionner, et
// un menu qui s'ouvre sur la mauvaise valeur est pire qu'un texte.
function statutCellule(c, ecriture) {
  const st = STATUTS_CHANTIER.find(x => x.key === c.statut_d1);
  if (!ecriture || !c.statut_d1) {
    return st ? `<span class="chip">${esc(st.label)}</span>`
      : `<span class="muted">${esc(etapeLabel(c.affaire))}</span>`;
  }
  return `<select class="statut-menu" data-chantier="${esc(String(c.d1_id))}"
    data-avant="${esc(c.statut_d1)}" aria-label="Statut du chantier">
    ${STATUTS_CHANTIER.map(x => `<option value="${esc(x.key)}" ${x.key === c.statut_d1 ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
  </select>`;
}

// Le formulaire de création. Volontairement court : `client_id` et `nom`
// suffisent au worker, le reste se complète ensuite dans la fiche. Un
// formulaire qui exige douze champs pour ouvrir un chantier fait qu'on ouvre
// le chantier ailleurs.
function formulaireChantier(apresCreation) {
  const clients = scope.rgd('rgd_clients')
    .map(f => {
      const c = f.contact_id && db.byId('contacts', f.contact_id);
      const o = f.organisation_id && db.byId('organisations', f.organisation_id);
      const nom = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : (o ? o.name : null);
      return nom && f.d1_id ? { d1_id: f.d1_id, nom, ville: c?.city || o?.city || '' } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const corps = `
    <form id="ch-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
      <label class="reg-champ" style="grid-column:1/-1">
        <span>Client *</span>
        <select name="client_id" required>
          <option value="">Choisir un client…</option>
          ${clients.map(c => `<option value="${esc(String(c.d1_id))}">${esc(c.nom)}${c.ville ? ` — ${esc(c.ville)}` : ''}</option>`).join('')}
        </select>
      </label>
      <label class="reg-champ" style="grid-column:1/-1">
        <span>Intitulé du chantier *</span>
        <input name="nom" required placeholder="Ex. Rénovation salle de bain — Dupont">
      </label>
      <label class="reg-champ" style="grid-column:1/-1">
        <span>Adresse</span><input name="adresse">
      </label>
      <label class="reg-champ"><span>Code postal</span><input name="code_postal"></label>
      <label class="reg-champ"><span>Ville</span><input name="ville"></label>
      <label class="reg-champ"><span>Montant HT (€)</span><input name="montant_ht" inputmode="decimal"></label>
      <label class="reg-champ"><span>Début prévu</span><input name="date_debut_prevue" type="date"></label>
      <label class="reg-champ" style="grid-column:1/-1">
        <span>Statut de départ</span>
        <select name="statut">
          ${STATUTS_CHANTIER.map(x => `<option value="${esc(x.key)}" ${x.key === 'en_preparation' ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
        </select>
      </label>
    </form>
    <div class="alert" style="margin-top:14px">
      <b>i</b>
      <div>Le chantier est créé <b>dans le tableau de bord RGD</b>, pas ici : il
      apparaîtra dans cette liste au prochain relevé, d&rsquo;ici trente minutes.
      Si le client a été apporté par un partenaire, <b>celui-ci sera averti par
      email</b> que son dossier passe en chantier.</div>
    </div>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn primary" id="ch-ok">Créer le chantier</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <span class="grow"></span><span class="muted small" id="ch-etat"></span>
    </div>`;

  openModal('Nouveau chantier', corps, { onOpen: (m) => {
    m.querySelector('#ch-ok').onclick = async () => {
      const f = m.querySelector('#ch-form');
      if (!f.reportValidity()) return;
      const d = Object.fromEntries(new FormData(f).entries());
      // Un champ vide n'est pas envoyé : le worker écrirait une chaîne vide là
      // où l'absence de valeur veut dire « on ne sait pas encore ».
      const champs = { client_id: Number(d.client_id), nom: d.nom.trim() };
      for (const k of ['adresse', 'code_postal', 'ville', 'date_debut_prevue', 'statut']) {
        if (d[k]) champs[k] = d[k];
      }
      if (d.montant_ht) {
        const n = Number(String(d.montant_ht).replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(n)) { toast('Le montant n’est pas un nombre', 'err'); return; }
        champs.montant_ht = n;
      }

      const b = m.querySelector('#ch-ok');
      b.disabled = true;
      m.querySelector('#ch-etat').textContent = 'Envoi au tableau de bord…';
      const r = await creerChantier(champs);
      b.disabled = false;
      m.querySelector('#ch-etat').textContent = '';

      if (!r.ok) {
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : le chantier n’a pas été créé.'
          : `Non créé — ${r.motif}`, 'err');
        return;
      }
      closeModal();
      toast('Chantier créé dans le tableau de bord — visible ici au prochain relevé');
      apresCreation?.();
    };
  } });
}

export const rgdChantiersPage = {
  title: () => 'RGD Renova — Chantiers',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // La vue choisie survit au rechargement : on revient sur l'écran qu'on
    // avait quitté, pas sur celui que le code préfère.
    let vue = 'liste';
    try { vue = localStorage.getItem('rgd_chantiers_vue') || 'pipeline'; } catch { vue = 'pipeline'; }
    const state = { etat: '', q: '', focus: null, ecriture: false, vue };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

    const draw = () => {
      const tous = chantiers();
      const ts = terms(state.q);
      const vus = tous
        .filter(c => !state.etat || (state.etat === '—' ? !c.etat : c.etat === state.etat))
        .filter(c => hit([c.affaire?.title, c.ville, c.reference, clientDe(c.affaire)?.nom], ts));

      const enCours = tous.filter(c => c.etat === 'en_cours' || c.etat === 'demarrage');
      const somme = (l) => l.reduce((t, c) => t + (Number(c.montant_ht) || 0), 0);
      const aVendre = tous.filter(c => !c.etat);

      const corps = `
        <div class="pill-tabs">
          <button type="button" data-vue="pipeline" class="${state.vue === 'pipeline' ? 'on' : ''}">Pipeline</button>
          <button type="button" data-vue="liste" class="${state.vue === 'liste' ? 'on' : ''}">Liste<span>${tous.length}</span></button>
        </div>

        ${state.vue === 'pipeline' ? pipeline(tous, state) : `
        <div class="pill-tabs">
          <button type="button" data-etat="" class="${state.etat ? '' : 'on'}">Tous<span>${tous.length}</span></button>
          ${ETATS.map(e => `<button type="button" data-etat="${e.key}" class="${state.etat === e.key ? 'on' : ''}">${esc(e.label)}<span>${tous.filter(c => c.etat === e.key).length}</span></button>`).join('')}
          ${aVendre.length ? `<button type="button" data-etat="—" class="${state.etat === '—' ? 'on' : ''}">En discussion<span>${aVendre.length}</span></button>` : ''}
        </div>

        <div class="toolbar">
          ${searchInput('rc-q', state, 'Rechercher un chantier, une ville, un client…')}
          <span class="grow"></span>
          <span class="muted small">${vus.length} chantier${vus.length > 1 ? 's' : ''}</span>
          ${state.ecriture ? '<button type="button" class="btn primary" id="rc-nouveau">+ Nouveau chantier</button>' : ''}
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr>
              <th>Chantier</th><th>Client</th><th>Ville</th>
              <th>État</th><th>Statut</th><th class="num">Montant HT</th><th>Début prévu</th>
            </tr></thead>
            <tbody>${vus.map(c => {
              const cl = clientDe(c.affaire);
              const e = etatDe(c);
              return `<tr>
                <td><a href="#" data-affaire="${c.affaire.id}"><b>${esc(c.affaire.title)}</b></a>
                    ${c.reference ? `<div class="s muted">${esc(c.reference)}</div>` : ''}</td>
                <td>${cl ? `<a href="#" data-fiche-client="${esc(String(c.contact_id || c.organisation_id || ''))}">${esc(cl.nom)}</a>`
                  : '<span class="muted">—</span>'}</td>
                <td>${esc(c.ville || '—')}</td>
                <td>${e ? `<span class="chip ${e.ton}">${esc(e.label)}</span>` : '<span class="muted small">pas encore vendu</span>'}</td>
                <td>${statutCellule(c, state.ecriture)}</td>
                <td class="num">${c.montant_ht ? eur(c.montant_ht) : '<span class="muted">—</span>'}</td>
                <td>${c.date_debut_prevue ? fmtDate(c.date_debut_prevue) : '<span class="muted">—</span>'}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="7"><div class="empty">Aucun chantier ne correspond.</div></td></tr>'}</tbody>
          </table>
          ${state.ecriture ? `<p class="small muted">Le statut se change ici et part
          directement dans le tableau de bord RGD. <b>Si le chantier vient d'un prospect
          apporté, son apporteur en est averti par email.</b> L'état et l'étape
          commerciale ci-contre sont des traductions recalculées au relevé suivant :
          ils rattraperont dans la demi-heure.</p>` : ''}
        </section>`}`;

      root.innerHTML = cadre('#/rgd/chantiers', 'Chantiers', corps);
      bindSearch(root, 'rc-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => {
        state.vue = b.dataset.vue;
        try { localStorage.setItem('rgd_chantiers_vue', state.vue); } catch { /* navigation privée */ }
        draw();
      });
      if (state.vue === 'pipeline') brancherPipeline(root, state, draw);
      root.querySelectorAll('[data-etat]').forEach(b => b.onclick = () => {
        state.etat = state.etat === b.dataset.etat ? '' : b.dataset.etat; draw();
      });

      // On ne redessine pas après coup : le menu qu'on vient d'ouvrir
      // disparaîtrait sous la main. Seule la cellule concernée est reprise.
      const nouveau = root.querySelector('#rc-nouveau');
      if (nouveau) nouveau.onclick = () => formulaireChantier(draw);

      root.querySelectorAll('[data-chantier]').forEach(m => {
        m.onchange = async () => {
          const avant = m.dataset.avant, apres = m.value;
          if (avant === apres) return;
          m.disabled = true;
          const r = await majStatutChantier(m.dataset.chantier, apres);
          m.disabled = false;
          if (r.ok) {
            m.dataset.avant = apres;
            const ligne = scope.rgd('rgd_chantiers').find(x => String(x.d1_id) === m.dataset.chantier);
            if (ligne) ligne.statut_d1 = apres;
            toast('Statut envoyé au tableau de bord RGD');
          } else {
            m.value = avant;
            toast(r.motif === 'pas-de-compte'
              ? 'Aucun compte RGD à votre adresse : le statut n’a pas été changé.'
              : `Statut non enregistré — ${r.motif}`, 'err');
          }
        };
      });
      root.querySelectorAll('[data-affaire]').forEach(a => a.onclick = (e) => {
        e.preventDefault(); openDeal(a.dataset.affaire, draw);
      });
      // Le nom du client ouvre SA fiche, la même que dans « Clients &
      // prospects ». Le chantier, lui, garde son lien vers l'affaire : ce sont
      // deux choses différentes et la ligne en porte les deux.
      root.querySelectorAll('[data-fiche-client]').forEach(a => a.onclick = (e) => {
        e.preventDefault();
        const cle = a.dataset.ficheClient;
        const f = scope.rgd('rgd_clients')
          .find(x => x.contact_id === cle || x.organisation_id === cle);
        if (f) ouvrirFicheDuClient(f, draw);
        else toast('Aucune fiche client rattachée à ce chantier');
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};

// L'étape commerciale telle que le CRM la nomme, pas telle que Cloudflare la code.
function etapeLabel(affaire) {
  if (!affaire) return '—';
  if (affaire.status === 'won') return 'Gagnée';
  if (affaire.status === 'lost') return 'Perdue';
  const st = (act().stages || []).find(s => s.key === affaire.stage);
  return st ? st.label : (affaire.stage || '—');
}
