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

import { KEY, act, cadre, guard, clientDe as clientDeAffaire } from './rgd-espace.js';
import { peutEcrire, majStatutChantier, creerChantier } from '../data/rgd-api.js';
import { toast, openModal, closeModal } from '../ui.js';

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
const PIPELINE_ETAPES = [
  { key: 'visite_technique', label: 'Visite technique',  couleur: '#93C5FD' },
  { key: 'demarrage',        label: 'Démarrage',         couleur: '#FFB877' },
  { key: 'en_cours',         label: 'Chantier en cours', couleur: '#FF9A3D' },
  { key: 'termine',          label: 'Chantier terminé',  couleur: '#FF8A00' },
];

// Trois mois sans le moindre mouvement de facturation : on ne relance plus, le
// chantier quitte la pipeline. Il reste entier dans la liste et dans la fiche.
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
  const dates = factures.map(p => p.date_reception || p.date_facturation).filter(Boolean).sort();
  return {
    signes: signes.length,
    factures: reelles.length,
    soldesRecus: reelles.filter(p => p.type === 'solde' && p.statut === 'recu').length,
    // Ce qui reste dû : le signé moins l'encaissé. Pas « les factures en
    // attente » — il peut rester du signé pas encore facturé du tout.
    resteADevoir: somme(signes, 'montant_ht') - somme(recues, 'montant_ht'),
    dernierMouvement: dates.length ? dates[dates.length - 1] : null,
  };
}

// LA RÈGLE DE LA PIPELINE, reprise du tableau de bord. Elle ne lit PAS `etat` :
// elle regarde les faits — devis signés, factures, encaissements — sauf quand
// un statut a été posé à la main, qui l'emporte.
//
// ⚠ UN CHANTIER EN SORT, ET C'EST VOULU. Trois cas :
//   · entièrement encaissé — il n'y a plus rien à suivre ;
//   · plus aucun mouvement depuis trois mois — le recouvrement est abandonné ;
//   · « démarrage » sans la moindre facture — fantôme d'un vieux devis
//     Costructor signé il y a longtemps, que personne ne considère plus actif.
// « Chantier terminé » ne veut donc pas dire « archivé » : cette colonne
// montre les travaux finis dont il RESTE DE L'ARGENT À ENCAISSER. C'est une
// colonne de relance, pas un cimetière — d'où le zéro qu'on y voit souvent.
function rangerEnPipeline(tous) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() - JOURS_SANS_MOUVEMENT * 86400000)
    .toISOString().slice(0, 10);
  const paniers = Object.fromEntries(PIPELINE_ETAPES.map(e => [e.key, []]));

  for (const c of tous) {
    const m = mesure(c);
    const fiche = { ...c, m };
    // Fantôme Costructor : annoncé démarré, jamais facturé.
    if (c.statut_d1 === 'demarrage' && m.factures === 0) continue;
    const abandonne = m.dernierMouvement && m.dernierMouvement < limite;

    if (c.statut_d1 === 'termine') {
      if (m.resteADevoir <= 0 || abandonne) continue;
      paniers.termine.push(fiche); continue;
    }
    if (m.soldesRecus > 0) {
      if (m.resteADevoir <= 0 || abandonne) continue;
      paniers.termine.push(fiche); continue;
    }
    // Posé à la main : il l'emporte sur les faits, c'est une décision.
    if (c.statut_d1 === 'visite_technique') { paniers.visite_technique.push(fiche); continue; }
    // Sans devis signé il n'y a pas de chantier, seulement une affaire.
    if (m.signes === 0) continue;
    const debut = c.work_start_at || c.date_debut_prevue;
    (debut && debut <= aujourdhui ? paniers.en_cours : paniers.demarrage).push(fiche);
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

function carteChantier(c, ecriture) {
  const cl = clientDe(c.affaire);
  const debut = c.work_start_at || c.date_debut_prevue;
  const fin = c.work_end_at || c.date_fin_prevue;
  // ⚠ LE GRAND CHIFFRE EST LE TTC, le petit le HT. Le tableau de bord
  // affichait `montant_ht` aux DEUX places : les deux lignes d'une carte y
  // montrent le même nombre, dont l'une étiquetée « HT ». Corrigé ici.
  const ttc = Number(c.montant_ttc) || Number(c.montant_ht) || 0;
  const ht = Number(c.montant_ht) || 0;
  return `<article class="dcard rch-carte" data-chantier-id="${esc(String(c.id))}"
      data-affaire="${esc(String(c.affaire.id))}"
      ${ecriture && c.d1_id ? `draggable="true" data-d1="${esc(String(c.d1_id))}"` : ''}
      style="--c:${esc(PIPELINE_ETAPES.find(e => e.key === c.statut_d1)?.couleur || '#FF9A3D')}">
    <div class="rch-client">${esc(cl ? cl.nom : '—')}</div>
    <div class="t">${esc(c.affaire.title || c.reference || 'Chantier')}</div>
    ${c.ville ? `<div class="p">${esc(c.ville)}</div>` : ''}
    ${c.statut_d1 === 'en_cours' && debut && fin ? barreAvancement(debut, fin) : ''}
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
            <div class="rch-tete-bas">
              <span class="rch-n">${cartes.length}</span>
              <span class="rch-total">${eur(total)}</span>
            </div>
          </div>
          <div class="rch-cartes">
            ${cartes.map(c => carteChantier(c, state.ecriture)).join('')
              || '<div class="empty s">—</div>'}
          </div>
        </div>`;
      }).join('')}
    </section>
    ${dedans === 0 && tous.length ? `<div class="alert amber rch-note">
      <b>i</b>
      <div>Aucun de ces ${tous.length} chantiers n'est suivi ici, et ce n'est pas
      une panne : la pipeline ne montre que ceux où il reste quelque chose à
      faire. Un chantier sans devis signé n'y entre pas encore ; un chantier
      entièrement encaissé en est sorti. <b>Ils sont tous dans la liste.</b></div>
    </div>` : ''}
    <p class="small muted rch-note">
      ${dedans} chantier${dedans > 1 ? 's' : ''} suivi${dedans > 1 ? 's' : ''} sur ${tous.length}.
      Les étapes suivent les faits : un devis signé met le chantier en
      <b>Démarrage</b>, la date de début atteinte le passe <b>En cours</b>.
      <b>Chantier terminé</b> ne veut pas dire archivé — cette colonne montre les
      travaux finis dont il <b>reste de l'argent à encaisser</b>. Un chantier
      entièrement réglé, ou sans le moindre mouvement depuis trois mois, sort de
      la pipeline ; il reste entier dans la liste.
      ${state.ecriture ? '' : ' <i>Lecture seule : le statut se change depuis la liste.</i>'}
    </p>`;
}

// Le glisser-déposer. Il n'existe que si l'écriture est possible ET si le
// chantier porte son `d1_id` : c'est lui que le tableau de bord attend.
function brancherPipeline(root, state, draw) {
  root.querySelectorAll('.rch-carte').forEach(carte => {
    carte.onclick = (e) => {
      if (e.target.closest('a')) return;
      openDeal(carte.dataset.affaire, draw);
    };
    if (!carte.draggable) return;
    carte.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', carte.dataset.d1);
      carte.classList.add('dragging');
    });
    carte.addEventListener('dragend', () => carte.classList.remove('dragging'));
  });

  if (!state.ecriture) return;
  root.querySelectorAll('.rch-col').forEach(col => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const d1 = e.dataTransfer.getData('text/plain');
      const cible = col.dataset.cible;
      if (!d1 || !cible) return;
      const ligne = scope.rgd('rgd_chantiers').find(x => String(x.d1_id) === d1);
      if (!ligne || ligne.statut_d1 === cible) return;
      // ⚠ ON REDESSINE AVANT LA RÉPONSE, et on revient en arrière si elle est
      // mauvaise. Une carte qui reste sous le doigt pendant l'aller-retour
      // réseau donne l'impression que le geste n'a pas pris, et on le refait.
      const avant = ligne.statut_d1;
      ligne.statut_d1 = cible;
      draw();
      const r = await majStatutChantier(d1, cible);
      if (r.ok) {
        toast(`Déplacé vers « ${PIPELINE_ETAPES.find(x => x.key === cible)?.label || cible} »`);
      } else {
        ligne.statut_d1 = avant;
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
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Chantiers en cours', valeur: enCours.length,
            sous: `${eur(somme(enCours))} HT engagés`, icone: '🏗', href: '#/rgd' })}
          ${kpiEspace({ label: 'Terminés', valeur: tous.filter(c => c.etat === 'termine').length,
            sous: `${eur(somme(tous.filter(c => c.etat === 'termine')))} HT réalisés`, icone: '✅', ton: 'green', href: '#/rgd' })}
          ${kpiEspace({ label: 'En discussion', valeur: aVendre.length,
            sous: aVendre.length ? 'affaires pas encore signées' : 'aucune affaire ouverte', icone: '💬', ton: 'amber', href: '#/rgd' })}
          ${kpiEspace({ label: 'Total suivi', valeur: tous.length,
            sous: `${eur(somme(tous))} HT tous chantiers`, icone: '📋', href: '#/rgd' })}
        </div>

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
                <td>${cl ? esc(cl.nom) : '<span class="muted">—</span>'}</td>
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
