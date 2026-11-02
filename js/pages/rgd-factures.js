// Espace RGD Renova — toutes les factures du CRM (02/11/2026)
//
// Demandé par Élodie : « je voudrais que la direction y ait accès aussi ».
// La direction avait DÉJÀ le droit de faire et de lire les factures — le
// bouton « + Faire une facture » est sur chaque fiche, et la policy de lecture
// est `direction ou propriétaire`. Ce qui manquait, c'était un ENDROIT : pour
// voir une facture il fallait ouvrir la fiche du client, donc savoir d'avance
// chez qui chercher. Cet écran est cette liste-là.
//
// ⚠ IL NE CRÉE RIEN, ET C'EST VOULU. Une facture part d'un client : sans fiche,
// elle n'aurait ni destinataire, ni adresse, ni chantier, et le PDF se ferait
// sur du vide. On fait une facture depuis la fiche ; on la RETROUVE ici.
//
// ⚠ RÉSERVÉ À LA DIRECTION (`RESERVES_DIRECTION` dans rgd-espace.js). Franck
// voit les siennes sur les fiches de ses clients, et la base le lui impose de
// toute façon : `rgd_voit_ligne(owner_id)` ne lui rend que ce qu'il porte. Une
// liste « toutes les factures » qui n'en montrerait qu'une partie serait un
// titre qui ment.
//
// ⚠ LE SÉLECTEUR DE VUE DE L'ESPACE EST RETIRÉ ICI (`SANS_VUE`), ET C'EST
// MESURÉ, PAS UNE PRÉFÉRENCE. Il ouvre par défaut sur la vue « direction »
// (décidée le 07/10/2026) : sur cet écran, la page des factures s'ouvrait donc
// sur les SEULES factures de Mickael — deux sur quatre à l'essai, celles de
// Franck invisibles, et les totaux à zéro. Une page qui s'appelle « Factures »
// et qui en cache la moitié dès l'ouverture se lit comme « il n'y en a pas ».
// Elle a donc son propre filtre par personne, qui s'ouvre sur tout le monde.
//
// ⚠ ET ELLE LIT `db.t`, PAS `scope.rgd()`, pour la même raison : `scope.rgd()`
// applique cette vue. La base reste le vrai garde — `rgd_voit_ligne(owner_id)`
// ne rend à personne ce qu'il n'a pas le droit de voir —, et l'écran est de
// toute façon fermé à qui n'est pas de la direction (`directionOnly`).
//
// La colonne « Responsable » reste sur chaque ligne et le bandeau de vue
// s'efface (`SANS_BANDEAU`), comme sur Clients & prospects : la colonne dit à
// qui est chaque ligne, mieux qu'une phrase en tête.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { STATUTS_DEVIS_CRM, nomMetier } from '../data/rgd-devis-crm.js';
import { ouvrirDevisCrm } from './rgd-devis-crm.js';
import { ouvrirPdfImporte } from './rgd-facture-import.js';
import { demandeDe, ficheDe } from './rgd-clients.js';

const euros = (n) => eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// L'ordre des pastilles : celui de la vie d'une facture, pas l'alphabet.
const ORDRE = ['brouillon', 'envoye', 'signe', 'refuse'];

/**
 * Le client d'une facture. On prend le contact d'abord : c'est lui que la
 * facture porte en propre (`contact_id`), et il survit à une fiche archivée.
 * La demande et l'organisation sont les deux replis, dans cet ordre.
 */
function clientDuDevis(d) {
  const c = d.contact_id && db.byId('contacts', d.contact_id);
  if (c) return `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(contact sans nom)';
  const dem = d.demande_id && db.byId('rgd_demandes', d.demande_id);
  if (dem) return `${dem.prenom || ''} ${dem.nom || ''}`.trim() || '(demande sans nom)';
  const o = d.organisation_id && db.byId('organisations', d.organisation_id);
  return o ? o.name : '';
}

/**
 * La fiche d'où part une facture, reconstruite pour `ouvrirDevisCrm`.
 *
 * ⚠ ELLE PEUT MANQUER, et l'écran doit le supporter : `fiche_id` et
 * `demande_id` sont en `on delete set null`, donc une facture survit à la
 * suppression de sa fiche — avec son numéro, ses lignes et son montant, qui
 * sont exactement ce qu'une facture ne doit jamais perdre. On ouvre alors la
 * facture sur une fiche minimale : elle se relit et se renvoie, elle ne se
 * raccroche simplement à rien.
 */
function ficheDuDevis(d) {
  if (d.demande_id) {
    const l = db.byId('rgd_demandes', d.demande_id);
    if (l) return demandeDe(l);
  }
  if (d.fiche_id) {
    const l = db.byId('rgd_clients', d.fiche_id);
    // `ficheDe` attend de quoi dire l'étape ; ici on ne l'affiche pas.
    if (l) return ficheDe(l, () => '');
  }
  return { genre: 'fiche', ligne: {}, nom: clientDuDevis(d) };
}

export const rgdFacturesPage = {
  title: () => 'RGD Renova — Factures',
  // ⚠ GARDÉ PAR LE ROUTEUR, PAS SEULEMENT PAR LE MENU. Retirer l'entrée suffit
  // à ne pas la proposer ; elle ne suffit pas à fermer l'adresse, qui circule
  // dans un signet ou un lien. Et `scope.rgd()` rendrait alors à un chargé
  // d'affaires ses seules factures sous un titre qui en promet toutes.
  directionOnly: true,
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { statut: '', qui: '', q: '', focus: null };

    const draw = () => {
      // ⚠ LE FILTRE PAR PERSONNE S'APPLIQUE AVANT LES TOTAUX, PAS APRÈS : on
      // veut « les chiffres de Franck » quand on choisit Franck, pas ceux de
      // l'équipe avec sa seule liste en dessous.
      const toutes = db.t('rgd_devis_crm')
        .filter(d => !state.qui || d.owner_id === state.qui)
        .sort((a, b) => String(b.date_devis || b.created_at || '').localeCompare(String(a.date_devis || a.created_at || '')));
      const ts = terms(state.q);
      const vues = toutes
        .filter(d => !state.statut || d.statut === state.statut)
        .filter(d => hit([d.numero, d.objet, clientDuDevis(d), nomMetier(d.metier)], ts));
      // Les gens qui PORTENT une facture, pas tout le répertoire : une liste de
      // noms dont la moitié ne rendrait jamais rien n'aide personne.
      const porteurs = [...new Set(db.t('rgd_devis_crm').map(d => d.owner_id).filter(Boolean))]
        .map(id => scope.users().find(u => u.id === id)).filter(Boolean)
        .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));

      const somme = (l) => l.reduce((t, d) => t + (Number(d.montant_ttc) || 0), 0);
      const par = (k) => toutes.filter(d => d.statut === k);
      const signees = par('signe');
      const envoyees = par('envoye');
      const brouillons = par('brouillon');

      // ⚠ CE QUI COMPTE DANS L'ARGENT, ET CE QUI N'Y COMPTE PAS.
      // Un BROUILLON n'a même pas de numéro : il n'est parti chez personne, le
      // compter ferait un chiffre d'affaires d'intentions. Une ANNULÉE est de
      // l'argent qui ne viendra pas. Les deux se voient, aucune des deux ne
      // s'additionne — c'est la règle déjà tenue sur les encaissements.
      const mois = new Date().toISOString().slice(0, 7);
      const duMois = toutes.filter(d => ['envoye', 'signe'].includes(d.statut)
        && String(d.date_devis || d.created_at || '').slice(0, 7) === mois);

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Signées', valeur: signees.length,
            sous: signees.length ? `${euros(somme(signees))} TTC` : 'aucune facture signée',
            icone: '✍', ton: 'green', href: '#/rgd/factures' })}
          ${kpiEspace({ label: 'Envoyées, en attente', valeur: envoyees.length,
            sous: envoyees.length ? `${euros(somme(envoyees))} TTC à encaisser` : 'rien en attente',
            icone: '⏳', ton: 'amber', href: '#/rgd/factures' })}
          ${kpiEspace({ label: 'Brouillons', valeur: brouillons.length,
            sous: brouillons.length ? 'sans numéro, non envoyés' : 'aucun brouillon',
            icone: '✎', ton: 'muted', href: '#/rgd/factures' })}
          ${kpiEspace({ label: 'Ce mois-ci', valeur: duMois.length,
            sous: `${euros(somme(duMois))} TTC facturés`, icone: '📅', href: '#/rgd/factures' })}
        </div>

        <div class="pill-tabs">
          <button type="button" data-statut="" class="${state.statut ? '' : 'on'}">Toutes<span>${toutes.length}</span></button>
          ${ORDRE.filter(k => toutes.some(d => d.statut === k)).map(k =>
            `<button type="button" data-statut="${k}" class="${state.statut === k ? 'on' : ''}">${esc(STATUTS_DEVIS_CRM[k].label)}<span>${par(k).length}</span></button>`).join('')}
        </div>

        <div class="toolbar">
          ${searchInput('rfa-q', state, 'Rechercher un numéro, un client, un objet…')}
          ${porteurs.length > 1 ? `<label class="esp-vue${state.qui ? ' est-filtree' : ''}">
            <span>Responsable</span>
            <select id="rfa-qui" aria-label="Filtrer par responsable">
              <option value=""${state.qui ? '' : ' selected'}>Tout le monde</option>
              ${porteurs.map(u => `<option value="${esc(u.id)}"${state.qui === u.id ? ' selected' : ''}>${
                esc(u.full_name || u.email || 'sans nom')}</option>`).join('')}
            </select></label>` : ''}
          <span class="grow"></span>
          <span class="muted small">${vues.length} facture${vues.length > 1 ? 's' : ''}</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th>Objet</th>
              <th>Responsable</th><th class="num">Montant TTC</th><th>Statut</th></tr></thead>
            <tbody>${vues.map(d => {
              const e = STATUTS_DEVIS_CRM[d.statut] || STATUTS_DEVIS_CRM.brouillon;
              const qui = d.owner_id ? scope.users().find(u => u.id === d.owner_id) : null;
              const client = clientDuDevis(d);
              return `<tr class="rfa-ligne" data-facture="${esc(String(d.id))}" tabindex="0">
                <td><b>${esc(d.numero || '—')}</b>${d.numero ? '' : '<div class="s muted">brouillon</div>'}
                  ${d.importe ? '<div class="s muted">importée</div>' : ''}</td>
                <td>${fmtDate(d.date_devis || d.created_at)}</td>
                <td>${client ? esc(client) : '<span class="muted small">sans client</span>'}</td>
                <td class="muted">${esc(d.objet || nomMetier(d.metier) || 'Facture importée')}</td>
                <td>${qui ? esc(qui.full_name) : '<span class="muted small">—</span>'}</td>
                <td class="num">${euros(d.montant_ttc)}</td>
                <td><span class="chip ${e.ton}">${esc(e.label)}</span></td>
              </tr>`;
            }).join('') || `<tr><td colspan="7"><div class="empty">${toutes.length
              ? 'Aucune facture ne correspond.'
              : 'Aucune facture pour l’instant. On en fait une depuis la fiche d’un client, bouton « + Faire une facture ».'}</div></td></tr>`}</tbody>
          </table>
          <p class="small muted">Une facture <b>importée</b> — faite ailleurs, déposée en PDF —
          garde son numéro d’origine et compte comme les autres ; on l’ouvre pour voir son PDF.
          Les totaux ne comptent que les factures <b>envoyées</b> et
          <b>signées</b> : un brouillon n’a pas de numéro et n’est parti chez personne, une
          facture annulée est de l’argent qui ne viendra pas. Les deux se voient ici, aucune
          des deux ne s’additionne.</p>
        </section>`;

      root.innerHTML = cadre('#/rgd/factures', 'Factures', corps);
      bindSearch(root, 'rfa-q', state, draw); restoreFocus(root, state);

      root.querySelectorAll('[data-statut]').forEach(b => b.onclick = () => {
        state.statut = b.dataset.statut; draw();
      });
      const qui = root.querySelector('#rfa-qui');
      if (qui) qui.onchange = () => { state.qui = qui.value; draw(); };

      // Ouvrir la facture elle-même, pas la fiche du client : on vient ici pour
      // la relire, la renvoyer ou l'imprimer. `draw` en retour, pour que la
      // liste reprenne le statut si l'envoi vient de le changer.
      const ouvrir = (tr) => {
        const d = db.byId('rgd_devis_crm', tr.dataset.facture);
        if (!d) return;
        // ⚠ UNE IMPORTÉE N'A PAS DE LIGNES : l'éditeur montrerait un
        // formulaire vide là où il existe une vraie facture. Son PDF EST la
        // facture, c'est lui qu'on ouvre.
        if (d.importe) { ouvrirPdfImporte(d); return; }
        ouvrirDevisCrm(ficheDuDevis(d), d, draw);
      };
      root.querySelectorAll('.rfa-ligne').forEach(tr => {
        tr.onclick = () => ouvrir(tr);
        tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(tr); } };
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
