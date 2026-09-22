// Espace RGD Renova — sous-traitants
//
// ÉTAPE 4 DE LA MIGRATION, RANG 3 — puis, le 22/09/2026, LE DERNIER VERROU.
// L'écran était en lecture seule. Il ne l'est plus, et pas par goût de
// l'uniformité : les attestations ne se déposaient QUE dans le tableau de bord,
// donc éteindre Surge éteignait le seul endroit où l'on peut prouver qu'un
// artisan est en règle. Le dépôt, la relance et la conversion passent par
// `js/pages/rgd-st-pieces.js`, qui écrit à la SOURCE — D1 — et jamais dans le
// reflet, qu'un relevé de trente minutes écraserait sans un mot.
//
// POURQUOI LES ATTESTATIONS PASSENT AVANT L'ARGENT
// Un sous-traitant sans attestation de vigilance à jour, c'est le donneur
// d'ordre qui répond du travail dissimulé ; sans décennale, c'est RGD Renova
// qui porte le sinistre. Au 21/09/2026, **onze sous-traitants sur treize
// n'ont aucun document enregistré** et une attestation URSSAF est expirée.
// L'écran met donc la conformité en premier et l'argent en second — l'inverse
// de ce qu'on fait d'habitude, et c'est volontaire.
//
// ACTIFS ET POTENTIELS NE SE MÉLANGENT PAS — corrigé le 22/09/2026
// `sous_traitants` de D1 porte DEUX drapeaux qui se ressemblent et ne disent
// pas la même chose :
//
//   `statut_relation`  'actif' = on travaille avec lui ; 'potentiel' = artisan
//                      repéré en prospection, avec qui on n'a jamais rien fait
//   `actif`            le partenaire est-il encore en activité chez nous
//
// Le relevé n'envoyait que le second. Résultat : les onze artisans en
// prospection arrivaient dans le CRM comme des sous-traitants actifs, et
// l'alarme de conformité annonçait « 11 sous-traitants actifs n'ont aucune
// pièce enregistrée » — ce qui était vrai au mot près et faux sur le fond :
// on ne demande pas une attestation de vigilance à quelqu'un qu'on n'a pas
// encore fait travailler. Les deux vrais sous-traitants sont les seuls à
// porter un SIRET, et ce sont des fiches d'essai.
//
// L'écran sépare donc les deux populations, et **la conformité ne regarde que
// les actifs**. Les potentiels sont rangés par corps de métier, comme dans le
// tableau de bord d'origine : on les consulte pour trouver un couvreur, pas
// pour relancer un dossier.
//
// CE QUE LA LISTE NE PEUT PAS SAVOIR
// Le relevé ne rapatrie que les DATES d'expiration — pas les `*_url`, qui
// disent si la pièce a été déposée. La liste ne distingue donc pas « attestation
// déposée, valable jusqu'au… » d'« une date saisie, aucun document derrière ».
// Le panneau des pièces, lui, lit la fiche à la source et fait la différence :
// c'est la raison pour laquelle il fait un appel au lieu de se servir du reflet.
// Les fichiers restent hébergés chez Cloudflare (KV) ; les déplacer vers
// Storage est la phase 3 du plan de sortie, pas ce chantier-ci.
//
// CE QUI N'EST PAS OUVERT ICI, ET POURQUOI
// Créer un artisan en prospection, et supprimer une pièce déposée. Le premier
// est une saisie d'annuaire qui n'a rien d'urgent ; le second retire une preuve
// de conformité, et ce geste-là reste dans l'application d'origine tant que
// personne n'a dit qui doit pouvoir le faire.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, eur, fmtDate, fmtDateTime, daysSince, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { peutEcrire, convertirSt } from '../data/rgd-api.js';
import { toast, openModal, closeModal } from '../ui.js';
import { ouvrirPiecesSt, ouvrirRelanceSt } from './rgd-st-pieces.js';

// Les quatre pièces qu'un sous-traitant doit tenir à jour. L'ordre est celui
// du risque : le travail dissimulé et la décennale d'abord.
// `doc` est la clé du worker (`DOC_MAP`), celle que le panneau de dépôt
// renvoie. La déduire de `key` par une comparaison de chaînes marchait, mais
// se serait tue le jour où une colonne change de nom — et une pastille qui ne
// s'actualise pas ressemble à un dépôt qui a échoué.
const PIECES = [
  { key: 'attestation_vigilance_expire', doc: 'vigilance', label: 'Vigilance', court: 'Vig.' },
  { key: 'assurance_decennale_expire', doc: 'decennale', label: 'Décennale', court: 'Déc.' },
  { key: 'attestation_urssaf_expire', doc: 'urssaf', label: 'URSSAF', court: 'URSSAF' },
  { key: 'kbis_expire', doc: 'kbis', label: 'Kbis', court: 'Kbis' },
];

// L'état d'une pièce. `null` n'est pas « à jour » : c'est « on ne sait pas »,
// ce qui est pire qu'expiré puisque personne ne l'a jamais demandée.
const etatPiece = (valeur) => {
  if (!valeur) return { key: 'absent', label: 'Absent', ton: 'red', poids: 0 };
  const j = daysSince(valeur);      // positif = la date est passée
  if (j > 0) return { key: 'expire', label: 'Expiré', ton: 'red', poids: 1 };
  if (j > -30) return { key: 'bientot', label: `Expire dans ${-j} j`, ton: 'amber', poids: 2 };
  return { key: 'ok', label: fmtDate(valeur), ton: 'green', poids: 3 };
};

// Faire passer un artisan repéré en prospection au rang de sous-traitant.
//
// ⚠ CE GESTE N'EST PAS UN CHANGEMENT D'ÉTIQUETTE. À partir de là, l'absence
// d'attestation de vigilance engage le donneur d'ordre et l'absence de
// décennale met le sinistre à la charge de RGD Renova. La modale le dit avant,
// et propose d'enchaîner sur le dépôt des pièces — c'est le moment où on les
// demande, pas trois mois plus tard.
function formulaireConversion(st, apres) {
  const corps = `
    <div class="alert">
      <b>!</b>
      <div><b>${esc(st.raison_sociale || 'Cet artisan')} deviendra un sous-traitant actif.</b>
      Les obligations de conformité s&rsquo;ouvrent à cet instant : sans attestation de
      vigilance à jour, c&rsquo;est le donneur d&rsquo;ordre qui répond du travail dissimulé ;
      sans décennale, c&rsquo;est RGD Renova qui porte le sinistre.</div>
    </div>
    <form id="cv-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
      <label class="reg-champ"><span>Contact</span><input name="contact_nom" value="${esc(st.contact_nom || '')}"></label>
      <label class="reg-champ"><span>SIRET</span><input name="siret" value="${esc(st.siret || '')}"></label>
      <label class="reg-champ"><span>Email</span><input name="email" type="email" value="${esc(st.email || '')}"></label>
      <label class="reg-champ"><span>Téléphone</span><input name="telephone" value="${esc(st.telephone || '')}"></label>
      <label class="reg-champ" style="grid-column:1/-1">
        <span>Spécialités</span><input name="specialites" value="${esc(st.specialites || '')}"></label>
    </form>
    <p class="small muted">Sans email, aucune relance de documents ne pourra partir —
    le worker la refuse. La fiche reste modifiable ensuite.</p>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn primary" id="cv-ok">Convertir en actif</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <span class="grow"></span><span class="muted small" id="cv-etat"></span>
    </div>`;

  openModal(`Convertir — ${st.raison_sociale || 'sans nom'}`, corps, { onOpen: (m) => {
    m.querySelector('#cv-ok').onclick = async () => {
      const d = Object.fromEntries(new FormData(m.querySelector('#cv-form')).entries());
      // Un champ vide n'est pas envoyé : le worker écrirait une chaîne vide là
      // où l'absence de valeur veut dire « on ne sait pas encore ».
      const champs = {};
      for (const k of ['contact_nom', 'siret', 'email', 'telephone', 'specialites']) {
        if (d[k] && d[k].trim()) champs[k] = d[k].trim();
      }
      const b = m.querySelector('#cv-ok');
      b.disabled = true;
      m.querySelector('#cv-etat').textContent = 'Envoi au tableau de bord…';
      const r = await convertirSt(st.d1_id, champs);
      b.disabled = false;
      m.querySelector('#cv-etat').textContent = '';
      if (!r.ok) {
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : rien n’a été converti.'
          : `Non converti — ${r.motif}`, 'err');
        return;
      }
      // On avance la fiche à l'écran : le relevé mettra jusqu'à trente minutes
      // à la faire changer de table, et la voir rester « en prospection »
      // donnerait envie de recommencer.
      st.statut_relation = 'actif';
      Object.assign(st, champs);
      closeModal();
      toast(`${st.raison_sociale || 'L’artisan'} est maintenant un sous-traitant actif`);
      apres?.();
      // Enchaîner sur les pièces : c'est la suite logique du geste, et le seul
      // moment où on est sûr que quelqu'un s'occupe de ce dossier.
      ouvrirPiecesSt(st);
    };
  } });
}

export const rgdSousTraitantsPage = {
  title: () => 'RGD Renova — Sous-traitants',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'conformite', q: '', focus: null, ecriture: false };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

    const draw = () => {
      const tous = scope.rgd('rgd_sous_traitants');
      const paiements = scope.rgd('rgd_st_paiements');
      const commissions = scope.rgd('rgd_st_commissions');
      const missions = scope.rgd('rgd_missions');

      // Un sous-traitant est en défaut dès qu'une pièce manque ou est expirée.
      const defautsDe = (st) => PIECES.map(p => etatPiece(st[p.key])).filter(e => e.poids <= 1).length;

      // Le partage. `statut_relation` vaut 'actif' par défaut côté D1 : une
      // fiche qui ne le porte pas est donc un sous-traitant, jamais un
      // prospect — c'est le bon défaut, il ne fabrique pas de prospects.
      const estPotentiel = (st) => st.statut_relation === 'potentiel';
      const potentiels = tous.filter(estPotentiel);
      const surLesquels = tous.filter(st => !estPotentiel(st));
      // Tant que le relevé n'envoie pas la colonne, AUCUNE fiche ne la porte :
      // on le dit, plutôt que de laisser croire qu'il n'y a pas de prospects.
      const relaisMuet = tous.length > 0 && tous.every(st => st.statut_relation == null);
      // ZERO PROSPECT NE VEUT PAS DIRE LA MEME CHOSE SELON LE MOMENT : il peut
      // n'y en avoir aucun, ou le relevé peut n'avoir pas encore tourné depuis
      // que le worker sait les envoyer. Sans date, les deux se ressemblent —
      // constaté le 22/09/2026, l'écran semblait n'avoir pas changé.
      const dernierReleve = tous.reduce((m, st) =>
        st.updated_at && st.updated_at > m ? st.updated_at : m, '');

      const actifs = surLesquels.filter(st => st.actif !== false);
      const enDefaut = actifs.filter(st => defautsDe(st) > 0);
      const sansAucun = actifs.filter(st => PIECES.every(p => !st[p.key]));
      const bientot = actifs.filter(st => PIECES.some(p => etatPiece(st[p.key]).key === 'bientot'));

      // Les potentiels, rangés par corps de métier. La clé est comparée sans
      // casse ni accents pour que « couverture » et « Couverture » ne fassent
      // qu'un groupe ; l'intitulé affiché reste celui qui a été saisi.
      const parMetier = () => {
        const groupes = new Map();
        for (const st of potentiels) {
          const brut = String(st.specialites || '').trim() || 'Non renseigné';
          const cle = brut.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (!groupes.has(cle)) groupes.set(cle, { titre: brut, lignes: [] });
          groupes.get(cle).lignes.push(st);
        }
        return [...groupes.values()]
          .map(g => ({ ...g, lignes: g.lignes.slice().sort((a, b) =>
            String(a.raison_sociale || '').localeCompare(String(b.raison_sociale || ''), 'fr')) }))
          // « Non renseigné » en dernier : c'est une case vide, pas un métier.
          .sort((a, b) => (a.titre === 'Non renseigné') - (b.titre === 'Non renseigné')
            || a.titre.localeCompare(b.titre, 'fr'));
      };

      const somme = (l) => l.reduce((t, x) => t + (Number(x.montant_ht) || 0), 0);

      const ts = terms(state.q);
      // Les plus en défaut d'abord : c'est la liste d'un travail à faire, pas
      // un annuaire.
      const vus = surLesquels
        .filter(st => hit([st.raison_sociale, st.contact_nom, st.email, st.specialites], ts))
        .slice()
        // Les actifs d'abord, et parmi eux les plus en défaut. Un sous-traitant
        // inactif à qui il manque tout remonterait sinon en tête d'une liste
        // qui sert à savoir qui relancer — or on ne relance pas quelqu'un
        // avec qui on ne travaille plus.
        .sort((a, b) => (a.actif === false) - (b.actif === false)
          || defautsDe(b) - defautsDe(a)
          || String(a.raison_sociale || '').localeCompare(String(b.raison_sociale || ''), 'fr'));

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Sous-traitants actifs', valeur: actifs.length,
            sous: `${surLesquels.length - actifs.length} inactif${surLesquels.length - actifs.length > 1 ? 's' : ''}`, icone: '🔧', href: '#/rgd/soustraitants' })}
          ${kpiEspace({ label: 'Artisans en prospection', valeur: potentiels.length,
            sous: potentiels.length ? `${parMetier().length} corps de métier` : 'aucun artisan repéré',
            icone: '🔎', href: '#/rgd/soustraitants' })}
          ${kpiEspace({ label: 'Dossiers incomplets', valeur: enDefaut.length,
            sous: sansAucun.length ? `dont ${sansAucun.length} sans aucune pièce` : 'pièces manquantes ou expirées',
            icone: '⚠', ton: enDefaut.length ? 'red' : 'green', href: '#/rgd/soustraitants' })}
          ${kpiEspace({ label: 'À renouveler sous 30 j', valeur: bientot.length,
            sous: bientot.length ? 'à relancer maintenant' : 'rien à relancer', icone: '⏰',
            ton: bientot.length ? 'amber' : 'green', href: '#/rgd/soustraitants' })}
          ${kpiEspace({ label: 'Versé aux sous-traitants', valeur: eur(somme(paiements)),
            sous: `${paiements.length} règlement${paiements.length > 1 ? 's' : ''} · ${eur(somme(commissions))} de commissions`,
            icone: '💶', href: '#/rgd/soustraitants' })}
        </div>

        ${sansAucun.length ? `<div class="alert">
          <b>!</b>
          <div><b>${sansAucun.length} sous-traitant${sansAucun.length > 1 ? 's actifs n’ont' : ' actif n’a'}
          aucune pièce enregistrée.</b> Sans attestation de vigilance à jour, le donneur d&rsquo;ordre
          répond du travail dissimulé ; sans décennale, c&rsquo;est RGD Renova qui porte le sinistre.
          ${state.ecriture
            ? 'Les pièces se déposent ici, bouton <b>Pièces</b> au bout de la ligne.'
            : 'Les pièces se déposent dans l&rsquo;<a href="#/rgd/app">application RGD</a>.'}
          Les artisans en prospection ne sont pas comptés ici : on ne leur demande rien
          tant qu&rsquo;on ne les a pas fait travailler.</div>
        </div>` : ''}

        ${relaisMuet ? `<div class="alert">
          <b>i</b>
          <div><b>Le relevé n&rsquo;envoie pas encore la distinction actif / prospect.</b>
          Les ${tous.length} fiches sont donc toutes présentées comme des sous-traitants.
          Le champ <code>statut_relation</code> existe côté Cloudflare ; il sera relayé
          au prochain déploiement du worker.</div>
        </div>` : ''}

        <div class="pill-tabs">
          <button type="button" data-vue="conformite" class="${state.vue === 'conformite' ? 'on' : ''}">Conformité<span>${surLesquels.length}</span></button>
          <button type="button" data-vue="argent" class="${state.vue === 'argent' ? 'on' : ''}">Règlements<span>${paiements.length + commissions.length}</span></button>
        </div>

        ${state.vue === 'conformite' ? `
        <div class="toolbar">
          ${searchInput('rst-q', state, 'Rechercher un sous-traitant, une spécialité…')}
          <span class="grow"></span>
          <span class="muted small">les dossiers incomplets en premier</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Sous-traitant</th><th>Contact</th><th>Spécialités</th>
              ${PIECES.map(p => `<th title="${esc(p.label)}">${esc(p.court)}</th>`).join('')}
              <th class="num">Versé</th>${state.ecriture ? '<th></th>' : ''}</tr></thead>
            <tbody>${vus.map(st => {
              const verse = somme(paiements.filter(p => p.sous_traitant_id === st.id));
              return `<tr class="${st.actif === false ? 'muted' : ''}">
                <td><b>${esc(st.raison_sociale || '—')}</b>
                    ${st.actif === false ? '<span class="chip">Inactif</span>' : ''}
                    ${st.siret ? `<div class="s muted">SIRET ${esc(st.siret)}</div>` : ''}</td>
                <td>${esc(st.contact_nom || '—')}
                    ${st.telephone ? `<div class="s muted">${esc(st.telephone)}</div>` : ''}</td>
                <td class="muted">${esc(st.specialites || '—')}</td>
                ${PIECES.map(p => { const e = etatPiece(st[p.key]);
                  return `<td><span class="chip ${e.ton}" title="${esc(p.label)}">${esc(e.label)}</span></td>`; }).join('')}
                <td class="num">${verse ? eur(verse) : '<span class="muted">—</span>'}</td>
                ${state.ecriture ? `<td class="num">
                  <button type="button" class="btn ghost sm" data-pieces="${esc(String(st.d1_id))}">Pièces</button>
                  ${st.email ? `<button type="button" class="btn ghost sm" data-relance="${esc(String(st.d1_id))}">Relancer</button>` : ''}
                </td>` : ''}
              </tr>`;
            }).join('') || `<tr><td colspan="${state.ecriture ? 9 : 8}"><div class="empty">Aucun sous-traitant ne correspond.</div></td></tr>`}</tbody>
          </table>
        </section>

        ${!potentiels.length && !relaisMuet ? `<p class="small muted" style="margin-top:14px">
          Aucun artisan en prospection dans le dernier relevé${dernierReleve ? ' (' + fmtDateTime(dernierReleve) + ')' : ''}.
          Ils se saisissent dans l&rsquo;<a href="#/rgd/app">application RGD</a> et apparaissent ici au relevé suivant.</p>` : ''}

        ${potentiels.length ? `
        <section class="rst-potentiels">
          <div class="rst-tete">
            <div>
              <h2>Sous-traitants potentiels <span class="chip amber">En prospection</span></h2>
              <p class="muted small">${potentiels.length} artisan${potentiels.length > 1 ? 's' : ''} à qualifier —
              prospection, salons, recommandations. Aucune pièce n&rsquo;est demandée à ce stade.</p>
            </div>
            <a class="btn ghost sm" href="#/rgd/app">Ajouter un artisan dans l&rsquo;application RGD</a>
          </div>

          <div class="rst-metiers">
            ${parMetier().map(g => `
              <section class="card table-wrap">
                <div class="card-head">
                  <h2>${esc(g.titre)}</h2>
                  <span class="muted small">${g.lignes.length} artisan${g.lignes.length > 1 ? 's' : ''}</span>
                </div>
                <table>
                  <thead><tr><th>Nom</th><th>Téléphone</th><th>Mail</th><th>Adresse</th><th>Commentaires</th>
                    ${state.ecriture ? '<th></th>' : ''}</tr></thead>
                  <tbody>${g.lignes.map(st => `<tr>
                    <td><b>${esc(st.raison_sociale || '—')}</b></td>
                    <td>${st.telephone ? esc(st.telephone) : '<span class="muted">—</span>'}</td>
                    <td>${st.email ? `<a href="mailto:${esc(st.email)}">${esc(st.email)}</a>` : '<span class="muted">—</span>'}</td>
                    <td class="s">${st.adresse ? esc(st.adresse) : '<span class="muted">—</span>'}</td>
                    <td class="s muted">${st.notes ? esc(st.notes) : '—'}</td>
                    ${state.ecriture ? `<td class="num">
                      <button type="button" class="btn ghost sm" data-convertir="${esc(String(st.d1_id))}">Convertir en actif</button>
                    </td>` : ''}
                  </tr>`).join('')}</tbody>
                </table>
              </section>`).join('')}
          </div>
        </section>` : ''}` : `
        <div class="toolbar">
          <span class="muted small">${paiements.length} règlement${paiements.length > 1 ? 's' : ''} (${eur(somme(paiements))})
          et ${commissions.length} commission${commissions.length > 1 ? 's' : ''} (${eur(somme(commissions))})</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Nature</th><th>Sous-traitant</th><th>Chantier</th>
              <th>Libellé</th><th class="num">Taux</th><th class="num">Montant HT</th></tr></thead>
            <tbody>${[...paiements.map(x => ({ ...x, nature: 'Règlement', quand: x.date_paiement })),
                      ...commissions.map(x => ({ ...x, nature: 'Commission', quand: x.date_commission }))]
              .sort((a, b) => String(b.quand || '').localeCompare(String(a.quand || '')))
              .map(x => {
                const st = tous.find(s => s.id === x.sous_traitant_id);
                const affaire = x.deal_id ? db.byId('deals', x.deal_id) : null;
                return `<tr>
                  <td>${x.quand ? fmtDate(x.quand) : '<span class="muted">—</span>'}</td>
                  <td>${esc(x.nature)}</td>
                  <td>${esc(st?.raison_sociale || '—')}</td>
                  <td>${affaire ? esc(affaire.title) : '<span class="muted small">sans chantier</span>'}</td>
                  <td class="muted">${esc(x.libelle || '—')}</td>
                  <td class="num muted">${x.taux != null ? esc(String(x.taux)) + ' %' : '—'}</td>
                  <td class="num">${eur(x.montant_ht)}</td>
                </tr>`;
              }).join('') || '<tr><td colspan="7"><div class="empty">Aucun règlement enregistré.</div></td></tr>'}</tbody>
          </table>
          ${paiements.every(p => !p.deal_id) && paiements.length ? `<p class="small muted">
            Aucun de ces règlements n&rsquo;est rattaché à un chantier côté Cloudflare — la colonne reste donc vide.</p>` : ''}
        </section>
        ${missions.length ? `<section class="card">
          <div class="card-head"><h2>Missions confiées</h2><span class="muted small">${missions.length} mission${missions.length > 1 ? 's' : ''}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Sous-traitant</th><th>Chantier</th><th>Description</th><th>Statut</th>
              <th class="num">Dû</th><th class="num">Payé</th></tr></thead>
            <tbody>${missions.map(m => {
              const st = tous.find(s => s.id === m.sous_traitant_id);
              const affaire = m.deal_id ? db.byId('deals', m.deal_id) : null;
              return `<tr>
                <td>${esc(st?.raison_sociale || '—')}</td>
                <td>${affaire ? esc(affaire.title) : '<span class="muted small">—</span>'}</td>
                <td class="muted">${esc(m.description || '—')}</td>
                <td>${esc(m.statut || '—')}</td>
                <td class="num">${eur(m.montant_ht_du)}</td>
                <td class="num">${eur(m.montant_ht_paye)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </section>` : ''}`}`;

      root.innerHTML = cadre('#/rgd/soustraitants', 'Sous-traitants', corps);
      if (state.vue === 'conformite') { bindSearch(root, 'rst-q', state, draw); restoreFocus(root, state); }
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });

      const parD1 = (id) => tous.find(x => String(x.d1_id) === String(id));

      root.querySelectorAll('[data-pieces]').forEach(b => b.onclick = () => {
        const st = parD1(b.dataset.pieces);
        if (!st) return;
        // Le dépôt écrit dans D1 ; le reflet du CRM mettra jusqu'à trente
        // minutes à le rapatrier. On avance donc la ligne à l'écran, sinon la
        // pastille resterait rouge juste après le dépôt et on déposerait deux
        // fois la même attestation.
        ouvrirPiecesSt(st, (cle, quand) => {
          const p = PIECES.find(x => x.doc === cle);
          if (p && quand) { st[p.key] = quand; draw(); }
        });
      });

      root.querySelectorAll('[data-relance]').forEach(b => b.onclick = () => {
        const st = parD1(b.dataset.relance);
        if (st) ouvrirRelanceSt(st);
      });

      root.querySelectorAll('[data-convertir]').forEach(b => b.onclick = () => {
        const st = parD1(b.dataset.convertir);
        if (st) formulaireConversion(st, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
