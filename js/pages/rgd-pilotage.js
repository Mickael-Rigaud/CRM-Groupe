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
// LE CA AFFICHÉ EST SAISI À LA MAIN, ET C'EST VOULU
// `manual_ca_ht_exercice` et `manual_ca_ttc_exercice` (table `rgd_reglages`)
// l'emportent sur le calcul automatique, exactement comme côté RGD. La
// correction existe parce que la reprise Costructor est incomplète : le calcul
// sous-estime. L'écran affiche donc le chiffre corrigé ET dit qu'il l'est,
// avec le calculé en regard — cacher l'écart reviendrait à faire croire que le
// CRM a compté ce qu'il n'a pas compté.
//
// CE QUE CET ÉCRAN NE SAIT PAS
// Les notes Google Keep (jamais reprises, elles vivent chez Google), les
// relances dues et les formations à recycler (tables `relances` et
// `competences`, vides dans D1 au 21/09/2026). Il le dit au lieu d'afficher
// zéro, qui se lirait comme un résultat.
import { scope } from '../data/scope.js';
import { esc, eur, pct, isoDay, fmtDate, daysSince } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, BANDEAU, guard, KEY } from './rgd-espace.js';

// L'exercice comptable de RGD Renova : 1er octobre → 30 septembre, aligné sur
// Costructor. Ce n'est pas l'année civile, et s'y tromper décale tout le CA.
const exercice = (d = new Date()) => {
  const a = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 10
    ? { du: `${a}-10-01`, au: `${a + 1}-09-30`, label: `${a}–${a + 1}` }
    : { du: `${a - 1}-10-01`, au: `${a}-09-30`, label: `${a - 1}–${a}` };
};

// LE PIPELINE COMMERCIAL, sept étapes, celui de `/api/stats/pipeline-detail`
// du worker RGD. Il remplace sur cet écran le kanban des chantiers, qui vit
// entier sur `#/rgd/chantiers` : ici on veut voir d'un coup d'œil où en est
// l'activité, pas manipuler des cartes.
//
// ⚠ CE N'EST PAS UNE COHORTE, contrairement à l'entonnoir du groupe : chaque
// étape compte ce qui s'y trouve AUJOURD'HUI, pas ce qu'est devenue une
// population arrivée à une date donnée. Les nombres ne décroissent donc pas
// forcément, et il n'y a pas de taux de passage à en tirer.
const PIPELINE = [
  // Un nouveau prospect ne compte QUE s'il a un apporteur : sans lui, la ligne
  // vient d'un import et non d'une démarche. C'est la règle du worker.
  { cle: 'nouveau', label: 'Nouveaux prospects', couleur: '#9CA3AF',
    n: (d) => d.clients.filter(c => c.statut_suivi === 'nouveau_prospect' && c.apporteur_id).length },
  { cle: 'contacter', label: 'À contacter', couleur: '#95720F',
    n: (d) => d.clients.filter(c => c.statut_suivi === 'a_contacter').length },
  { cle: 'rdv', label: 'RDV planifiés', couleur: '#2A6FBF',
    n: (d) => d.clients.filter(c => c.statut_suivi === 'rdv_planifie').length },
  { cle: 'devis', label: 'Devis envoyés', couleur: '#B45C00',
    n: (d) => d.devis.filter(x => x.statut === 'envoye').length },
  { cle: 'accepte', label: 'Devis acceptés', couleur: '#FD7A2C',
    n: (d) => d.devis.filter(x => ['signe', 'accepte'].includes(x.statut)).length },
  { cle: 'chantier', label: 'Chantiers en cours', couleur: '#22C55E',
    n: (d) => d.chantiers.filter(c => ['demarrage', 'en_cours'].includes(c.etat)).length },
  { cle: 'livre', label: 'Chantiers terminés', couleur: '#059669',
    n: (d) => d.chantiers.filter(c => c.etat === 'termine').length },
];


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
 * La courbe du CA : une barre par mois, une ligne pour le suivre.
 * ⚠ PAS DE BIBLIOTHÈQUE. Chart.js est vendu dans le CRM, mais douze valeurs ne
 * justifient pas de le charger sur l'écran qui s'ouvre le matin.
 */
function courbeCa(mois) {
  if (!mois.length) return '<div class="empty">Aucune facture sur cet exercice.</div>';
  const L = 960, H = 210, bas = H - 26, gauche = 54, droite = 12;
  const large = L - gauche - droite, pas = large / mois.length;
  const max = Math.max(1, ...mois.map(m => m.ht));
  const y = (v) => bas - (v / max) * (bas - 14);
  const x = (i) => gauche + pas * i + pas / 2;
  const graduations = [0, 0.25, 0.5, 0.75, 1].map(f => `<g>
    <line x1="${gauche}" x2="${L - droite}" y1="${y(max * f)}" y2="${y(max * f)}" class="rgd-grille"></line>
    <text x="${gauche - 8}" y="${y(max * f) + 4}" class="rgd-axe" text-anchor="end">${Math.round(max * f / 1000)}k€</text></g>`).join('');
  const barres = mois.map((m, i) => `<rect x="${gauche + pas * i + pas * 0.22}" y="${y(m.ht)}"
    width="${pas * 0.56}" height="${Math.max(0, bas - y(m.ht))}" rx="3" class="rgd-barre"></rect>`).join('');
  const trait = mois.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.ht).toFixed(1)}`).join(' ');
  const points = mois.map((m, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(m.ht).toFixed(1)}" r="4" class="rgd-point">
    <title>${esc(m.label)} · ${esc(eur(m.ht))} HT</title></circle>`).join('');
  const legendes = mois.map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" class="rgd-axe" text-anchor="middle">${esc(m.label)}</text>`).join('');
  return `<svg class="rgd-courbe" viewBox="0 0 ${L} ${H}" role="img"
    aria-label="Chiffre d'affaires HT facturé mois par mois sur l'exercice">
    ${graduations}${barres}<path d="${trait}" class="rgd-trait"></path>${points}${legendes}</svg>`;
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
      const missions = scope.rgd('rgd_missions');
      const fournitures = scope.rgd('rgd_fournitures');
      const sousTraitants = scope.rgd('rgd_sous_traitants');
      const demandes = scope.rgd('rgd_demandes');
      const rdv = scope.rgd('agenda_events').filter(e => e.activity === KEY && e.day === aujourdhui);
      const reglage = (cle) => scope.rgd('rgd_reglages').find(r => r.cle === cle)?.valeur ?? null;

      const pourChantier = (c, liste) => liste.filter(x => x.deal_id && x.deal_id === c.deal_id);

      // « CHANTIER EN COURS » — la définition du tableau de bord, mot pour mot :
      // un devis signé, au moins un paiement, des travaux déjà commencés, et
      // ni marqué terminé ni entièrement soldé. Le seul `etat = 'en_cours'`
      // donnerait un autre nombre.
      const enCours = chantiers.filter(c => {
        if (c.date_passage_termine) return false;
        const p = pourChantier(c, paiements);
        const solde = p.some(x => x.type === 'solde' && x.statut === 'recu');
        const reste = p.some(x => x.statut !== 'recu');
        if (solde && !reste) return false;
        if (!pourChantier(c, devis).some(d => d.statut === 'signe')) return false;
        if (!p.length) return false;
        return !!c.work_start_at && c.work_start_at <= aujourdhui;
      });
      const caEnCours = enCours.reduce((t, c) => t + (Number(c.montant_ht) || 0), 0);

      // Devis en attente : tout sauf tranché. Même règle que l'écran Devis.
      const devisAttente = devis.filter(d => !['signe', 'refuse', 'expire'].includes(d.statut));
      const caDevis = devisAttente.reduce((t, d) => t + (Number(d.montant_ht) || 0), 0);

      const retards = paiements.filter(p => ['attendu', 'facture', 'partiel'].includes(p.statut)
        && p.date_echeance && p.date_echeance < aujourdhui);
      const montantRetard = retards.reduce((t, p) => t + (Number(p.montant_ttc) || 0), 0);

      // RENTABILITÉ — seulement les chantiers dont on connaît VRAIMENT les
      // coûts. Un chantier sans coût saisi afficherait 100 % de marge et
      // tirerait la moyenne vers le haut : il est écarté, pas compté à zéro.
      const avecCouts = chantiers.filter(c =>
        ['en_cours', 'termine'].includes(c.etat)
        && (pourChantier(c, missions).some(m => Number(m.montant_ht_paye) > 0)
          || pourChantier(c, fournitures).some(f => Number(f.montant_ht) > 0)));
      const caRenta = avecCouts.reduce((t, c) =>
        t + pourChantier(c, devis).filter(d => d.statut === 'signe')
          .reduce((s, d) => s + (Number(d.montant_ht) || 0), 0), 0);
      const coutRenta = avecCouts.reduce((t, c) =>
        t + pourChantier(c, missions).reduce((s, m) => s + (Number(m.montant_ht_paye) || 0), 0)
          + pourChantier(c, fournitures).reduce((s, f) => s + (Number(f.montant_ht) || 0), 0), 0);
      const margeEur = caRenta - coutRenta;
      const margePct = caRenta > 0 ? (margeEur / caRenta) * 100 : 0;
      const tonMarge = margePct >= 20 ? 'green' : margePct >= 10 ? 'amber' : 'red';

      // CA DE L'EXERCICE — calculé, puis la correction manuelle par-dessus.
      // Les deux sont montrés : l'écart dit à quel point Costructor est en retard.
      const calculeHt = paiements
        .filter(p => p.statut !== 'annule' && p.date_facturation
          && p.date_facturation >= ex.du && p.date_facturation <= ex.au)
        .reduce((t, p) => t + (Number(p.montant_ht) || 0), 0);
      const corrigeHt = reglage('manual_ca_ht_exercice');
      const caHt = corrigeHt !== null ? Number(corrigeHt) : calculeHt;
      const corrige = corrigeHt !== null && Math.round(Number(corrigeHt)) !== Math.round(calculeHt);

      // Pièces de sous-traitants qui expirent sous 30 jours ou sont déjà passées.
      const docsSt = sousTraitants.filter(st => st.actif !== false
        && ['attestation_urssaf_expire', 'attestation_vigilance_expire', 'assurance_decennale_expire']
          .some(k => st[k] && daysSince(st[k]) > -30));

      const leads = demandes.filter(d => !d.statut || d.statut === 'nouvelle' || d.statut === 'en_attente');

      const clients = scope.rgd('rgd_clients');
      const mois = caParMois(paiements);
      const moyenne = mois.length ? Math.round(caHt / mois.length) : 0;
      const etapes = PIPELINE.map(e => ({ ...e, n: e.n({ clients, devis, chantiers }) }));
      const maxEtape = Math.max(1, ...etapes.map(e => e.n));
      const totalEtapes = etapes.reduce((t, e) => t + e.n, 0);

      // L'ORDRE DE LA PAGE, arrêté par Mickael le 21/09/2026 : le chiffre
      // d'affaires de l'exercice d'abord — c'est ce qu'on vient voir —, les
      // chiffres clés ensuite, puis le pipeline qui résume l'activité. La
      // journée et les alertes ferment l'écran.
      const corps = `
        ${BANDEAU}

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
            Le calcul automatique du CRM donne <b>${eur(calculeHt)}</b> : la reprise
            Costructor est incomplète, et le tableau de bord RGD retient donc une
            valeur saisie. C’est elle qui est affichée ici, pour que les deux
            écrans disent la même chose.
            <b>La courbe, elle, montre le calculé</b> — mois par mois, il n’existe pas
            de saisie manuelle, et lisser la correction sur douze mois inventerait
            une répartition que personne n’a constatée.</p>`
            : '<p class="small muted">Calculé sur les factures de l’exercice, avoirs déduits, annulées exclues.</p>'}
          ${reglage('manual_clients_actifs') !== null ? `<p class="small muted">
            Clients actifs déclarés : <b>${esc(reglage('manual_clients_actifs'))}</b>,
            également saisi à la main côté RGD.</p>` : ''}
        </section>

        <div class="esp-kpis">
          ${kpiEspace({ label: 'Rentabilité moyenne', valeur: pct(margePct),
            sous: `${eur(margeEur)} HT · ${avecCouts.length} chantier${avecCouts.length > 1 ? 's' : ''} avec coûts connus`,
            icone: '📈', ton: tonMarge, href: '#/rgd' })}
          ${kpiEspace({ label: 'Chantiers en cours', valeur: enCours.length,
            sous: `${eur(caEnCours)} HT`, icone: '🏗', ton: 'accent', href: '#/rgd/chantiers' })}
          ${kpiEspace({ label: 'Devis en attente', valeur: devisAttente.length,
            sous: `${eur(caDevis)} HT`, icone: '📋', href: '#/rgd/devis' })}
          ${kpiEspace({ label: 'Paiements en retard', valeur: retards.length,
            sous: retards.length ? eur(montantRetard) : 'rien en souffrance',
            icone: '⚠', ton: retards.length ? 'red' : 'green', href: '#/rgd/paiements' })}
        </div>

        <section class="card rgd-pipe">
          <div class="card-head"><h2>Pipeline</h2>
            <span class="grow"></span>
            <a class="btn ghost sm" href="#/rgd/chantiers">Voir les chantiers →</a></div>
          <table class="rgd-pipe-table"><tbody>${etapes.map(e => `<tr>
            <th>${esc(e.label)}</th>
            <td class="rgd-pipe-barre"><div class="rgd-pipe-piste">
              <i style="width:${(e.n / maxEtape) * 100}%;background:${esc(e.couleur)}"></i></div></td>
            <td class="rgd-pipe-n">${e.n}</td>
          </tr>`).join('')}</tbody></table>
          <p class="small muted rgd-pipe-pied">${totalEtapes
            ? `${totalEtapes} affaire${totalEtapes > 1 ? 's' : ''} suivie${totalEtapes > 1 ? 's' : ''}, toutes étapes confondues.`
            : 'Aucune affaire à suivre pour le moment.'}
            Chaque étape compte ce qui s’y trouve <b>aujourd’hui</b> : ce n’est pas une
            cohorte, les nombres ne décroissent donc pas forcément et il n’y a pas de
            taux de passage à en tirer.
            ${chantiers.filter(c => !c.etat).length ? `${chantiers.filter(c => !c.etat).length} chantier${chantiers.filter(c => !c.etat).length > 1 ? 's n’ont' : ' n’a'}
              aucun état renseigné et ne compte${chantiers.filter(c => !c.etat).length > 1 ? 'nt' : ''} dans aucune étape.` : ''}</p>
        </section>

        <section class="card">
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

        ${docsSt.length || leads.length ? `<div class="pil-alertes">
          ${leads.length ? `<a class="pil-alerte" href="#/rgd/clients">
            <b>${leads.length}</b><span>demande${leads.length > 1 ? 's' : ''} de devis à traiter</span></a>` : ''}
          ${docsSt.length ? `<a class="pil-alerte warn" href="#/rgd/soustraitants">
            <b>${docsSt.length}</b><span>document${docsSt.length > 1 ? 's' : ''} sous-traitants à renouveler</span></a>` : ''}
        </div>` : ''}

        <p class="small muted">Deux indicateurs du tableau de bord RGD manquent ici :
        les <b>relances à envoyer</b> et les <b>formations à recycler</b>. Leurs tables
        (<code>relances</code>, <code>competences</code>) sont vides côté Cloudflare, donc
        rien n’a été repris — afficher zéro laisserait croire qu’il n’y a rien à faire,
        alors que le CRM n’en sait rien.</p>`;

      root.innerHTML = cadre('#/rgd', 'Vue d’ensemble', corps);
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
