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
import { db } from '../data/db.js';
import { esc, eur, pct, isoDay, fmtDate, daysSince } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, BANDEAU, guard, KEY, clientDe } from './rgd-espace.js';

// L'exercice comptable de RGD Renova : 1er octobre → 30 septembre, aligné sur
// Costructor. Ce n'est pas l'année civile, et s'y tromper décale tout le CA.
const exercice = (d = new Date()) => {
  const a = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 10
    ? { du: `${a}-10-01`, au: `${a + 1}-09-30`, label: `${a}–${a + 1}` }
    : { du: `${a - 1}-10-01`, au: `${a}-09-30`, label: `${a - 1}–${a}` };
};

// Les quatre étapes du pipeline chantier, dans l'ordre du tableau de bord.
const ETAPES = [
  { key: 'signe', label: 'Devis signé' },
  { key: 'demarrage', label: 'Démarrage' },
  { key: 'en_cours', label: 'Chantier en cours' },
  { key: 'termine', label: 'Chantier terminé' },
];

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

      const parEtape = ETAPES.map(e => ({ ...e, items: chantiers.filter(c => c.etat === e.key) }));

      const corps = `
        ${BANDEAU}

        <div class="esp-kpis">
          ${kpiEspace({ label: 'Rentabilité moyenne', valeur: pct(margePct),
            sous: `${eur(margeEur)} HT · ${avecCouts.length} chantier${avecCouts.length > 1 ? 's' : ''} avec coûts connus`,
            icone: '📈', ton: tonMarge, href: '#/rgd' })}
          ${kpiEspace({ label: 'Chantiers en cours', valeur: enCours.length,
            sous: `${eur(caEnCours)} HT`, icone: '🏗', ton: 'accent', href: '#/rgd' })}
          ${kpiEspace({ label: 'Devis en attente', valeur: devisAttente.length,
            sous: `${eur(caDevis)} HT`, icone: '📋', href: '#/rgd/devis' })}
          ${kpiEspace({ label: 'Paiements en retard', valeur: retards.length,
            sous: retards.length ? eur(montantRetard) : 'rien en souffrance',
            icone: '⚠', ton: retards.length ? 'red' : 'green', href: '#/rgd/paiements' })}
        </div>

        <div class="grid c2 pil-haut">
          <section class="card">
            <div class="card-head"><h2>Chiffre d’affaires ${esc(ex.label)}</h2>
              <span class="muted small">exercice du 1<sup>er</sup> octobre au 30 septembre</span></div>
            <div class="pil-ca">${eur(caHt)} <span class="muted">HT</span></div>
            ${corrige ? `<p class="small">
              <span class="chip amber">corrigé à la main</span>
              Le calcul automatique du CRM donne <b>${eur(calculeHt)}</b> : la reprise
              Costructor est incomplète, et le tableau de bord RGD retient donc une
              valeur saisie. C’est elle qui est affichée ici, pour que les deux
              écrans disent la même chose.</p>`
              : '<p class="small muted">Calculé sur les factures de l’exercice, avoirs déduits, annulées exclues.</p>'}
            ${reglage('manual_clients_actifs') !== null ? `<p class="small muted">
              Clients actifs déclarés : <b>${esc(reglage('manual_clients_actifs'))}</b>,
              également saisi à la main côté RGD.</p>` : ''}
          </section>

          <section class="card">
            <div class="card-head"><h2>Aujourd’hui</h2>
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

        <section class="card">
          <div class="card-head"><h2>Pipeline chantiers</h2>
            <span class="muted small">${chantiers.length} chantier${chantiers.length > 1 ? 's' : ''} repris</span></div>
          <div class="pil-pipe">
            ${parEtape.map(e => {
              const somme = e.items.reduce((t, c) => t + (Number(c.montant_ht) || 0), 0);
              return `<div class="pil-col">
                <div class="pil-col-tete"><b>${esc(e.label)}</b><span class="chip">${e.items.length}</span></div>
                <div class="pil-col-ca muted small">${somme ? eur(somme) + ' HT' : '—'}</div>
                ${e.items.slice(0, 6).map(c => {
                  const affaire = c.deal_id ? db.byId('deals', c.deal_id) : null;
                  return `<a class="pil-mini" href="#/rgd">
                    <b>${esc(affaire ? affaire.title : (c.reference || 'Chantier'))}</b>
                    <span class="muted small">${esc(clientDe(affaire, db) || c.ville || '—')}</span>
                  </a>`;
                }).join('')}
                ${e.items.length > 6 ? `<a class="s" href="#/rgd">+ ${e.items.length - 6} autre${e.items.length - 6 > 1 ? 's' : ''}</a>` : ''}
                ${!e.items.length ? '<div class="muted small">aucun</div>' : ''}
              </div>`;
            }).join('')}
          </div>
          ${chantiers.filter(c => !c.etat).length ? `<p class="small muted">
            ${chantiers.filter(c => !c.etat).length} chantier${chantiers.filter(c => !c.etat).length > 1 ? 's n’ont' : ' n’a'}
            aucun état renseigné et n’apparai${chantiers.filter(c => !c.etat).length > 1 ? 'ssent' : 't'} dans aucune colonne.</p>` : ''}
        </section>

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
