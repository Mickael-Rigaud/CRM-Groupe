// =====================================================================
//  Facturation Henrri — missions AMO de BTP Expertise
// ---------------------------------------------------------------------
//  PÉRIMÈTRE. AMO uniquement. Une expertise garde ses champs manuels et
//  ira sur Stripe ; les trois autres structures n'ont rien à voir ici.
//
//  RIEN NE PART D'ICI VERS HENRRI. Le navigateur ne connaît aucune clé :
//  il appelle l'Edge Function `henrri-amo`, qui porte le secret et refait
//  la vérification des droits côté serveur. Un bouton retiré de cet écran
//  ne serait pas un droit retiré — c'est la fonction qui fait foi.
//
//  LE CRM NE SAISIT PAS DE FACTURE. La table `henrri_documents` n'a
//  aucune policy d'écriture : ce qui s'affiche ici vient de Henrri et
//  seulement de lui. L'écran ne peut donc pas mentir sur ce qu'il contient.
// =====================================================================
import { CONFIG } from './config.js';
import { db } from './data/db.js';
import { missionDe, stageOf } from './data/schema.js';
import { esc, eur, fmtDate, toast } from './ui.js';

/**
 * Une affaire relève-t-elle de Henrri ? Seules les AMO de BTP Expertise, et
 * seulement **à partir de « Mission AMO signée »**.
 *
 * Le seuil n'est pas écrit ici : c'est `delivery`, le drapeau qui dit que le
 * travail commence et que la mission devient facturable. En AMO il est posé sur
 * « Mission AMO signée » et sur tout ce qui suit — il n'y a donc rien à tenir à
 * jour le jour où une étape est renommée ou intercalée. Avant ce seuil il n'y a
 * pas de mission, seulement un prospect : un bloc de facturation sur un lead
 * qu'on n'a pas encore appelé n'a aucun sens.
 *
 * ⚠ Conséquence assumée : reculer une mission avant « Mission AMO signée » fait
 * disparaître le bloc. Rien n'est perdu — les documents restent chez Henrri et
 * dans `henrri_documents` —, ils réapparaissent dès que l'étape est rétablie.
 */
export const estAmoHenrri = (d) => d?.activity === 'btp' && missionDe(d) === 'amo'
  && !!stageOf(d.activity, d.stage)?.delivery;

/**
 * Appel de l'Edge Function, avec le jeton de la session en cours : c'est
 * lui qui permet au serveur de vérifier que la personne a bien accès à
 * cette affaire. En mode démo il n'y a pas de session — donc pas d'appel.
 */
async function appeler(action, corps = {}) {
  if (CONFIG.DEMO) throw new Error('Mode démo : Henrri n’est pas joignable.');
  // Par la façade, jamais par `db.client` : le client Supabase n'est pas exposé
  // hors de `db.js`. C'est ce raccourci qui donnait « Cannot read properties of
  // undefined (reading 'auth') » — une erreur de plomberie affichée comme un
  // refus de Henrri, alors que Henrri n'avait même pas été appelé.
  const jeton = await db.accessToken();
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.');

  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/henrri-amo`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...corps }),
  });
  const rep = await r.json().catch(() => ({}));
  // La fonction fait remonter le message de Henrri tel quel (« exige un
  // contact nommé »…) : c'est lui qui dit quoi corriger, on l'affiche.
  if (!r.ok || rep.ok === false) throw new Error(rep.erreur || `Erreur ${r.status}`);
  return rep;
}

// ---------------------------------------------------------------- lecture
// Les quatre montants de la mission. Le RESTE À ENCAISSER se calcule ici et
// ne se range jamais en base : il se périmerait au premier règlement.
// ⚠ Sans la portée « Payment » chez Henrri, l'encaissé est un TOUT OU RIEN :
// `paye` dit payé / pas payé, pas combien. Une facture à moitié réglée
// compte donc pour zéro. L'écran doit le dire, pas le masquer.
export function totauxHenrri(documents = []) {
  const factures = documents.filter(x => x.type === 'facture');
  const facture = factures.reduce((t, x) => t + (Number(x.montant_ttc) || 0), 0);
  const encaisse = factures.filter(x => x.paye).reduce((t, x) => t + (Number(x.montant_ttc) || 0), 0);
  return {
    ht: documents.filter(x => x.type === 'facture').reduce((t, x) => t + (Number(x.montant_ht) || 0), 0),
    facture,
    encaisse,
    reste: facture - encaisse,
    partiel: factures.some(x => x.montant_paye != null),   // vrai le jour où la portée arrive
  };
}

const ligneDoc = (x) => `<tr>
  <td><b>${x.type === 'facture' ? 'Facture' : x.type === 'avoir' ? 'Avoir' : 'Devis'}</b>
    ${x.numero ? `<span class="muted small"> ${esc(x.numero)}</span>` : ''}</td>
  <td>${x.date_emission ? fmtDate(x.date_emission) : '—'}</td>
  <td><span class="pill ${x.paye ? 'ok' : x.finalise ? 'info' : ''}">${esc(x.statut || '—')}</span></td>
  <td class="num">${x.montant_ht != null ? eur(x.montant_ht) : '—'}</td>
  <td class="num">${x.montant_ttc != null ? eur(x.montant_ttc) : '—'}</td>
  <td class="num"><button type="button" class="btn ghost sm" data-henrri-pdf="${esc(x.henrri_id)}"
      title="Demande à Henrri un lien de téléchargement">Ouvrir</button></td>
</tr>`;

/** Le bloc, à poser dans la fiche d'une mission AMO. */
export function blocHenrri(deal, etat) {
  if (CONFIG.DEMO) {
    return `<div class="section"><h3>Facturation Henrri</h3>
      <div class="empty">Mode démo : Henrri n’est pas joignable. Le bloc apparaît sur l’application en ligne.</div></div>`;
  }
  if (!etat) {
    return `<div class="section"><h3>Facturation Henrri</h3>
      <div class="empty" id="henrri-attente">Lecture en cours…</div></div>`;
  }
  const t = totauxHenrri(etat.documents);
  const bac = etat.environnement !== 'production'
    ? '<span class="pill" title="Aucune écriture dans vos données réelles">Bac à sable</span>' : '';

  return `<div class="section">
    <h3 style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span>Facturation Henrri ${bac}</span>
      <span class="toolbar">
        <button class="btn ghost sm" id="henrri-refresh" title="Relit les documents chez Henrri (sans coût)">↻</button>
        <button class="btn sm" id="henrri-devis">+ Devis</button>
        <button class="btn sm" id="henrri-facture">+ Facture</button>
      </span>
    </h3>

    <div class="tb-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px">
      ${[['Montant HT', eur(Number(deal.amount) || 0), 'de la mission'],
         ['Facturé', eur(t.facture), 'TTC, toutes factures'],
         ['Encaissé', eur(t.encaisse), 'factures marquées payées'],
         ['Reste à encaisser', eur(t.reste), 'facturé moins encaissé']]
        .map(([l, v, s]) => `<div class="card" style="padding:10px 12px">
           <div class="muted small" style="text-transform:uppercase;letter-spacing:.04em">${l}</div>
           <div style="font-family:var(--font-display);font-size:20px;font-weight:700">${v}</div>
           <div class="muted small">${s}</div></div>`).join('')}
    </div>

    ${!t.partiel ? `<p class="muted small" style="margin:0 0 10px">
      ⚠ Henrri ne donne ici que <b>payé / non payé</b>, pas le montant réglé : la portée « Payment »
      n’est pas accordée à la clé. Une facture partiellement réglée compte donc pour zéro.</p>` : ''}

    ${etat.documents.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Document</th><th>Date</th><th>Statut</th><th class="num">HT</th><th class="num">TTC</th><th></th></tr></thead>
      <tbody>${etat.documents.map(ligneDoc).join('')}</tbody>
    </table></div>` : `<div class="empty">Aucun document dans Henrri pour cette mission.
      ${etat.client_henrri ? '' : ' Le client y sera créé au premier devis.'}</div>`}

    <p class="muted small" style="margin:10px 0 0">
      ${etat.client_henrri
        ? `Client Henrri n° ${esc(etat.client_henrri)}.`
        : 'Client pas encore synchronisé.'}
      Un devis ou une facture se crée ici et vit ensuite dans Henrri : le CRM n’en est que le reflet.</p>
  </div>`;
}

/** Branche les commandes du bloc. `redessiner` relit et réaffiche. */
export function lierHenrri(racine, deal, redessiner) {
  if (CONFIG.DEMO) return;
  const agir = async (bouton, action, corps, message) => {
    if (!bouton) return;
    bouton.onclick = async () => {
      bouton.disabled = true;
      try {
        const r = await appeler(action, { deal_id: deal.id, ...corps });
        if (r.sans_montant) toast('Document créé sans ligne : la mission n’a pas de montant HT.', 'warn');
        else toast(message);
        redessiner();
      } catch (e) {
        toast(e.message, 'err');
        bouton.disabled = false;
      }
    };
  };
  agir(racine.querySelector('#henrri-devis'), 'devis', {}, 'Devis créé dans Henrri');
  agir(racine.querySelector('#henrri-facture'), 'facture', {}, 'Facture créée dans Henrri');
  agir(racine.querySelector('#henrri-refresh'), 'rafraichir', {}, 'Documents relus');

  // Le lien d'ouverture est TEMPORAIRE : il se demande au clic, jamais à
  // l'avance. Stocké, il serait mort à la première consultation.
  racine.querySelectorAll('[data-henrri-pdf]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      const r = await appeler('pdf', { deal_id: deal.id, henrri_id: b.dataset.henrriPdf });
      const url = typeof r.url === 'string' ? r.url : null;
      if (!url) throw new Error('Henrri n’a pas rendu de lien pour ce document.');
      window.open(url, '_blank', 'noopener');
    } catch (e) { toast(e.message, 'err'); }
    b.disabled = false;
  });
}

/** L'état courant chez Henrri, pour une affaire. Lecture seule. */
export const etatHenrri = (dealId) => appeler('etat', { deal_id: dealId });
