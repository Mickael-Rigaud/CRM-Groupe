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
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus, toast, confirm } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { statutsDe, statutDoc, estDevis, nomMetier,
  corbeilleFactures, reprendreFacture, purgerFactureJetee,
  jeterFacture, supprimerDevisCrm } from '../data/rgd-devis-crm.js';
import { ouvrirDevisCrm } from './rgd-devis-crm.js';
import { ouvrirPdfImporte } from './rgd-facture-import.js';
import { demandeDe, ficheDe } from './rgd-clients.js';

const euros = (n) => eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Les trois onglets, écrits UNE fois pour les deux sorties de l'écran.
 *
 * ⚠ LA CORBEILLE NE S'AFFICHE QUE SI ELLE CONTIENT QUELQUE CHOSE, sauf quand
 * on y est : un onglet à zéro, en permanence, apprend à ne plus le lire. Et on
 * garde l'onglet visible une fois dedans, sinon vider la corbeille ferait
 * disparaître l'onglet sous les doigts.
 */
const ongletsGenre = (tous, jetees, state) => {
  const g = state.genre || GENRE_PAR_DEFAUT;
  return `<div class="pill-tabs">
    <button type="button" data-genre="facture" class="${g === 'facture' ? 'on' : ''}">Factures<span>${
      tous.filter(d => !estDevis(d)).length}</span></button>
    <button type="button" data-genre="devis" class="${g === 'devis' ? 'on' : ''}">Devis<span>${
      tous.filter(estDevis).length}</span></button>
    ${jetees.length || g === 'corbeille'
      ? `<button type="button" data-genre="corbeille" class="${g === 'corbeille' ? 'on' : ''}">Corbeille<span>${
        jetees.length}</span></button>` : ''}
  </div>`;
};

// L'ordre des pastilles : celui de la vie d'une facture, pas l'alphabet.
const ORDRE = ['brouillon', 'envoye', 'signe', 'refuse'];

// ⚠ LES DEVIS ET LES FACTURES NE SE MÉLANGENT PAS DANS CETTE LISTE
// (02/11/2026, Élodie : « je voudrais distinguer deux choses »). Et ce n'est
// pas qu'une affaire de lisibilité : les totaux en haut de page s'en
// trouveraient FAUX. Un devis de 3 800 € accepté n'est pas 3 800 € facturés —
// les travaux n'ont pas eu lieu, rien n'est exigible, et la TVA n'est pas due.
// L'écran s'ouvre donc sur les factures, les devis ont leur onglet, et les
// chiffres d'argent ne comptent jamais que des factures.
const GENRE_PAR_DEFAUT = 'facture';

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
    const state = { genre: GENRE_PAR_DEFAUT, statut: '', qui: '', q: '', focus: null };

    const draw = () => {
      // ⚠ LE FILTRE PAR PERSONNE S'APPLIQUE AVANT LES TOTAUX, PAS APRÈS : on
      // veut « les chiffres de Franck » quand on choisit Franck, pas ceux de
      // l'équipe avec sa seule liste en dessous.
      const genre = state.genre || GENRE_PAR_DEFAUT;
      const dev = genre === 'devis';
      const corb = genre === 'corbeille';
      const jetees = corbeilleFactures();
      const STATUTS = statutsDe(genre);
      const tous = db.t('rgd_devis_crm').filter(d => !state.qui || d.owner_id === state.qui);
      const toutes = tous
        .filter(d => (estDevis(d) ? 'devis' : 'facture') === genre)
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
      // Les devis qui attendent encore une réponse : ce sont eux qui donnent
      // le travail à venir, et ils n'ont rien à faire dans un total facturé.
      const devisOuverts = tous.filter(d => estDevis(d) && d.statut === 'envoye');

      // ⚠ CE QUI COMPTE DANS L'ARGENT, ET CE QUI N'Y COMPTE PAS.
      // Un BROUILLON n'a même pas de numéro : il n'est parti chez personne, le
      // compter ferait un chiffre d'affaires d'intentions. Une ANNULÉE est de
      // l'argent qui ne viendra pas. Les deux se voient, aucune des deux ne
      // s'additionne — c'est la règle déjà tenue sur les encaissements.
      const mois = new Date().toISOString().slice(0, 7);
      // ⚠ « CE MOIS-CI » NE COMPTE QUE DES FACTURES, quel que soit l'onglet
      // ouvert : c'est du chiffre facturé, pas du chiffre espéré.
      const duMois = tous.filter(d => !estDevis(d) && ['envoye', 'signe'].includes(d.statut)
        && String(d.date_devis || d.created_at || '').slice(0, 7) === mois);

      // ── L'onglet « Corbeille » ──────────────────────────────────
      // ⚠ IL A SA PROPRE SORTIE, et ne passe pas par l'écran du dessous : les
      // chiffres en tête comptent de l'argent facturé, les pastilles de statut
      // trient des factures vivantes, le filtre « Responsable » lit une table
      // qui n'a plus ces lignes. Tout cela n'a rien à dire d'une corbeille, et
      // le laisser en place aurait montré des totaux à côté d'une liste qui ne
      // les alimente pas.
      //
      // ⚠ CET ÉCRAN EST DÉJÀ RÉSERVÉ À LA DIRECTION (`directionOnly`), donc
      // l'onglet l'est aussi sans rien ajouter — c'est la même main qui jette
      // et qui reprend.
      if (corb) {
        const lignes = jetees.filter(r => hit([r.numero, r.nom, r.objet], ts));
        root.innerHTML = cadre('#/rgd/factures', 'Factures & devis', `
          ${ongletsGenre(tous, jetees, state)}
          <div class="toolbar">
            ${searchInput('rfa-q', state, 'Rechercher un numéro, un client, un objet…')}
            <span class="grow"></span>
            <span class="muted small">${lignes.length} document${lignes.length > 1 ? 's' : ''} jeté${
              lignes.length > 1 ? 's' : ''}</span>
          </div>
          <section class="card table-wrap">
            <table>
              <thead><tr><th>Numéro</th><th>Jetée le</th><th>Client</th><th>Objet</th>
                <th class="num">Montant TTC</th><th></th></tr></thead>
              <tbody>${lignes.map(r => `<tr>
                <td><b>${esc(r.numero || '—')}</b>${r.numero ? '' : '<div class="s muted">brouillon</div>'}
                  ${(r.bons || []).length ? '<div class="s muted">avec son bon</div>' : ''}</td>
                <td>${esc(fmtDate(String(r.supprime_le || '').slice(0, 10)))}</td>
                <td>${esc(r.nom || '—')}</td>
                <td class="muted">${esc(r.objet || '—')}</td>
                <td class="num">${euros(r.montant_ttc)}</td>
                <td class="rgdf-fin">
                  <button type="button" class="btn ghost sm" data-remettre="${esc(r.id)}">Remettre</button>
                  <button type="button" class="btn ghost sm rfa-purge" data-purger="${esc(r.id)}">Supprimer définitivement</button>
                </td>
              </tr>`).join('') || `<tr><td colspan="6"><div class="empty">${jetees.length
                ? 'Aucun document jeté ne correspond.'
                : 'La corbeille est vide — aucune facture n’a été supprimée.'}</div></td></tr>`}</tbody>
            </table>
            <p class="small muted">Une facture supprimée vient ici avec son bon d’attachement, et
            <b>se remet</b> telle quelle. Son <b>numéro</b> lui revient aussi, sauf s’il a été
            redonné à une autre facture entre-temps — dans ce cas la reprise le dit et refuse,
            plutôt que de mettre deux documents sous un même numéro.
            <b>Supprimer définitivement</b> détruit la copie : après, il n’y a plus rien à reprendre.</p>
          </section>`);
        bindSearch(root, 'rfa-q', state, draw); restoreFocus(root, state);
        root.querySelectorAll('[data-genre]').forEach(b => b.onclick = () => {
          state.genre = b.dataset.genre; state.statut = ''; draw();
        });
        root.querySelectorAll('[data-remettre]').forEach(b => b.onclick = async () => {
          const r = jetees.find(x => x.id === b.dataset.remettre);
          if (!r) return;
          if (!await confirm(`Remettre la facture ${r.numero || 'sans numéro'} ?${
            (r.bons || []).length ? ' Son bon d’attachement revient avec elle.' : ''}`)) return;
          const rep = await reprendreFacture(r.id);
          if (!rep.ok) return toast(`Reprise impossible : ${rep.motif}`, 'error');
          await db.recharger('rgd_devis_crm');
          await db.recharger('rgd_bons').catch(() => {});
          await db.recharger('rgd_factures_corbeille').catch(() => {});
          toast(`Facture ${r.numero || ''} remise`);
          draw();
        });
        // ⚠ LA PURGE DEMANDE EN NOMMANT CE QUI DISPARAÎT, et dit que c'est
        // sans retour : la corbeille était le filet, on retire le filet.
        root.querySelectorAll('[data-purger]').forEach(b => b.onclick = async () => {
          const r = jetees.find(x => x.id === b.dataset.purger);
          if (!r) return;
          if (!await confirm(`Supprimer définitivement la facture ${r.numero || 'sans numéro'} ?`
            + ` Sa copie${(r.bons || []).length ? ' et celle de son bon' : ''} disparaît.`
            + ' Elle ne pourra plus être remise : c’est irréversible.')) return;
          const rep = await purgerFactureJetee(r.id);
          if (!rep.ok) return toast(`Suppression impossible : ${rep.motif}`, 'error');
          await db.recharger('rgd_factures_corbeille').catch(() => {});
          toast('Facture supprimée définitivement');
          draw();
        });
        return;
      }

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: dev ? 'Acceptés' : 'Signées', valeur: signees.length,
            sous: signees.length ? `${euros(somme(signees))} TTC` : (dev ? 'aucun devis accepté' : 'aucune facture signée'),
            icone: '✍', ton: 'green', href: '#/rgd/factures' })}
          ${dev
            ? kpiEspace({ label: 'Envoyés, sans réponse', valeur: envoyees.length,
              sous: envoyees.length ? `${euros(somme(envoyees))} TTC proposés` : 'rien en attente',
              icone: '⏳', ton: 'amber', href: '#/rgd/factures' })
            : kpiEspace({ label: 'Envoyées, en attente', valeur: envoyees.length,
              sous: envoyees.length ? `${euros(somme(envoyees))} TTC à encaisser` : 'rien en attente',
              icone: '⏳', ton: 'amber', href: '#/rgd/factures' })}
          ${kpiEspace({ label: 'Brouillons', valeur: brouillons.length,
            sous: brouillons.length ? 'sans numéro, non envoyés' : 'aucun brouillon',
            icone: '✎', ton: 'muted', href: '#/rgd/factures' })}
          ${dev
            ? kpiEspace({ label: 'Devis sans réponse', valeur: devisOuverts.length,
              sous: `${euros(somme(devisOuverts))} TTC en jeu`, icone: '📄', href: '#/rgd/factures' })
            : kpiEspace({ label: 'Ce mois-ci', valeur: duMois.length,
              sous: `${euros(somme(duMois))} TTC facturés`, icone: '📅', href: '#/rgd/factures' })}
        </div>

        ${ongletsGenre(tous, jetees, state)}

        <div class="pill-tabs">
          <button type="button" data-statut="" class="${state.statut ? '' : 'on'}">${dev ? 'Tous' : 'Toutes'}<span>${toutes.length}</span></button>
          ${ORDRE.filter(k => toutes.some(d => d.statut === k)).map(k =>
            `<button type="button" data-statut="${k}" class="${state.statut === k ? 'on' : ''}">${esc(STATUTS[k].label)}<span>${par(k).length}</span></button>`).join('')}
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
          <span class="muted small">${vues.length} ${dev ? 'devis' : `facture${vues.length > 1 ? 's' : ''}`}</span>
        </div>

        <section class="card table-wrap">
          <table>
            ${'' /* ⚠ UNE COLONNE D'ACTION DEPUIS LE 12/11/2026 (Élodie :
               « oui ajoute-le dans la liste aussi »). Le bouton existait
               depuis la veille, mais SEULEMENT dans la fiche : il fallait
               ouvrir chaque facture pour le trouver, et elle a redemandé la
               fonctionnalité en croyant qu'elle manquait. Un geste qu'on ne
               trouve pas n'existe pas. */}
            <thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th>Objet</th>
              <th>Responsable</th><th class="num">Montant TTC</th><th>Statut</th><th></th></tr></thead>
            <tbody>${vues.map(d => {
              const e = statutDoc(d);
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
                ${'' /* ⚠ LA MÊME RÈGLE QUE DANS LA FICHE, PAS UNE AUTRE : un
                   brouillon s'efface pour de bon (pas de numéro, personne ne
                   l'a vu), un document numéroté part à la corbeille. Et cet
                   écran est déjà réservé à la direction, donc rien à ajouter
                   sur le droit — c'est la même main qui jette et qui reprend. */}
                <td class="rgdf-fin"><button type="button" class="btn ghost sm rfa-jeter"
                  data-jeter="${esc(String(d.id))}"
                  title="${d.statut === 'brouillon' ? 'Supprimer ce brouillon'
                    : 'Mettre à la corbeille'}">Supprimer</button></td>
              </tr>`;
            }).join('') || `<tr><td colspan="8"><div class="empty">${toutes.length
              ? `Aucun${dev ? '' : 'e'} ${dev ? 'devis' : 'facture'} ne correspond.`
              : `Aucun${dev ? '' : 'e'} ${dev ? 'devis' : 'facture'} pour l’instant. On en fait un depuis la fiche d’un client, bouton « + Facture ou devis ».`}</div></td></tr>`}</tbody>
          </table>
          <p class="small muted">${dev
            ? `Un <b>devis</b> annonce un prix pour des travaux à venir : rien n’est dû tant qu’ils
              n’ont pas eu lieu, et c’est pourquoi il ne compte pas dans le chiffre facturé. Quand
              les travaux sont faits, on ouvre le devis accepté et on en tire la facture — les deux
              documents restent, chacun avec son numéro.`
            : `Une facture <b>importée</b> — faite ailleurs, déposée en PDF — garde son numéro
              d’origine et compte comme les autres ; on l’ouvre pour voir son PDF.
              Les totaux ne comptent que les factures <b>envoyées</b> et <b>signées</b> : un
              brouillon n’a pas de numéro et n’est parti chez personne, une facture annulée est de
              l’argent qui ne viendra pas. Les deux se voient ici, aucune des deux ne s’additionne.`}</p>
        </section>`;

      root.innerHTML = cadre('#/rgd/factures', 'Factures & devis', corps);
      bindSearch(root, 'rfa-q', state, draw); restoreFocus(root, state);

      root.querySelectorAll('[data-statut]').forEach(b => b.onclick = () => {
        state.statut = b.dataset.statut; draw();
      });
      // ⚠ CHANGER D'ONGLET REMET LE FILTRE DE STATUT À ZÉRO : « Annulée » et
      // « Refusé » sont la même clé en base mais pas le même mot, et un filtre
      // hérité de l'autre onglet aurait montré une liste vide sous une pastille
      // qui n'existe pas de ce côté.
      root.querySelectorAll('[data-genre]').forEach(b => b.onclick = () => {
        state.genre = b.dataset.genre; state.statut = ''; draw();
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

      // ⚠ LE BOUTON ARRÊTE LE CLIC DE LA LIGNE : sans `stopPropagation`, le
      // même geste supprimerait la facture ET ouvrirait son éditeur derrière
      // la demande de confirmation. On ne voit pas le défaut, on voit une
      // fenêtre inattendue.
      root.querySelectorAll('[data-jeter]').forEach(b => {
        b.onclick = async (ev) => {
          ev.stopPropagation();
          const d = db.byId('rgd_devis_crm', b.dataset.jeter);
          if (!d) return;
          const quoi = estDevis(d) ? 'le devis' : 'la facture';
          const nom = d.numero ? ` ${d.numero}` : '';
          // ⚠ DEUX GESTES SOUS UN MÊME BOUTON, COMME DANS LA FICHE. Un
          // BROUILLON s'efface pour de bon : pas de numéro, personne ne l'a
          // vu, une copie gardée n'aurait rien à reprendre. Un document
          // NUMÉROTÉ part à la corbeille — lui, on peut regretter.
          // La phrase de confirmation dit lequel des deux va se produire.
          const message = d.statut === 'brouillon'
            ? `Supprimer ce brouillon ? C’est définitif, il n’ira pas à la corbeille.`
            : `Mettre ${quoi}${nom} à la corbeille ? Elle se remet de là, et son numéro `
              + `revient à la suite.`;
          if (!await confirm(message)) return;
          try {
            if (d.statut === 'brouillon') {
              await supprimerDevisCrm(d);
              toast('Brouillon supprimé');
            } else {
              const r = await jeterFacture(d);
              if (!r.ok) { toast(`Suppression impossible : ${r.motif}`, 'error'); return; }
              // ⚠ LA FONCTION DE BASE ÉCRIT HORS DU CACHE : sans ces
              // rechargements, la liste continuerait d'afficher une facture
              // que la base ne connaît plus, et la corbeille serait vide.
              await db.recharger('rgd_devis_crm');
              await db.recharger('rgd_bons').catch(() => {});
              await db.recharger('rgd_factures_corbeille').catch(() => {});
              toast(`${d.numero || 'Document'} à la corbeille${
                r.donnees?.numero_rendu ? ' — son numéro revient à la suite' : ''}`);
            }
            draw();
          } catch (e) { toast(e.message || 'Suppression impossible', 'error'); }
        };
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
