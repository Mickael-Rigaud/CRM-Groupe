// Le bloc « Campagnes Meta Ads » de l'écran Analyse, onglet Réseaux sociaux
// (22/10/2026, Élodie : « c'est possible d'avoir une analyse des campagnes
// meta ads ? », puis « je voudrais surtout un recap de toutes les campagnes qui
// ont eu lieu avec la durée de la campagne, le coût, impressions, plateforme,
// moyen d'âge »). Les chiffres viennent de l'Edge Function `meta-ads`, qui relève
// chaque matin le compte publicitaire avec une clé en lecture seule.
//
// ⚠ LE CŒUR EST LE RÉCAPITULATIF DE TOUTES LES CAMPAGNES, DEPUIS LEUR LANCEMENT,
// et il ne dépend PAS de la période choisie en haut de l'écran : une campagne
// arrêtée en juillet doit rester lisible en octobre. Seul le bandeau du bas
// (« Sur la période ») suit la période.
//
// ⚠ DEUX MOITIÉS, ET LA SECONDE EST CE QUE META NE PEUT PAS DONNER :
//   — ce que Meta mesure : dépense, impressions, portée, clics, leads, et la
//     répartition par plateforme, âge, sexe, appareil et région ;
//   — ce que le CRM sait : ce que ces leads sont DEVENUS (rendez-vous, devis,
//     signature, chiffre signé), ce qui donne le vrai coût d'un client.
//
// ⚠ LES CHIFFRES DE META SONT SES TOTAUX (`meta_ads_periode`), pas une somme de
// jours : la portée compte des personnes uniques — même règle que les cartes
// Facebook et Instagram du même écran.
//
// ⚠ UN LEAD DU CRM EST RATTACHÉ À SA CAMPAGNE PAR LE JOUR OÙ IL EST ARRIVÉ, faute
// de mieux : le Zap Zapier ne transmet pas le nom de la campagne (`meta_campaign`
// est vide sur les 20 leads Meta au 22/10/2026). Le jour d'arrivée est croisé
// avec les leads que Meta compte ce jour-là, campagne par campagne :
//   — une seule campagne a fait un lead ce jour-là → c'est elle ;
//   — plusieurs → celle qui en a fait le plus, et le rattachement est dit
//     « probable » ;
//   — aucune → la seule campagne qui a dépensé ce jour-là, sinon « non rattaché ».
// Le jour où le Zap transmet la campagne, elle l'emporte et tout devient exact.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ORDRE_ETAPES, etapeDeFiche, joursDeVisite, montantDevisDe } from '../data/rgd-etapes.js';
import { logoReseau } from '../data/logos-reseaux.js';
import { esc } from '../ui.js';

const euros = (n, dec = 0) => (n == null ? '—' : Number(n).toLocaleString('fr-FR',
  { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec }));
const nombre = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const pourcent = (a, b) => (b ? `${(a / b * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—');
const parLead = (depense, leads) => (leads ? euros(depense / leads, 2) : '—');

// L'écart à la période d'avant. Pour une DÉPENSE ou un COÛT, monter n'est pas
// une bonne nouvelle : `inverse` retourne la couleur, jamais le signe.
function ecart(actuel, avant, inverse = false) {
  if (actuel == null || avant == null) return '';
  if (avant === 0) return actuel > 0 ? '<span class="ana-ecart">nouveau</span>' : '';
  const p = Math.round(((actuel - avant) / avant) * 100);
  if (p === 0) return '<span class="ana-ecart">=</span>';
  const bon = inverse ? p < 0 : p > 0;
  return `<span class="ana-ecart ${bon ? 'hausse' : 'baisse'}">${p > 0 ? '+' : ''}${p} %</span>`;
}

// Le jour de Paris d'un horodatage : le compte publicitaire est réglé sur Paris,
// ses jours aussi.
const jourParis = (s) => (s ? new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(s)) : null);

/** La campagne d'un lead du CRM, et la certitude du rattachement. */
export function campagneDuLead(f, campagnes, jours) {
  const nom = String(f.meta_campaign || '').trim().toLowerCase();
  if (nom) {
    const c = campagnes.find(x => String(x.nom || '').trim().toLowerCase() === nom);
    if (c) return { id: c.campagne_id, sur: 'exact' };
  }
  const j = jourParis(f.meta_received_at);
  if (!j) return { id: null, sur: null };
  const ceJour = jours.filter(x => x.jour === j);
  const avecLeads = ceJour.filter(x => (x.leads || 0) > 0).sort((a, b) => b.leads - a.leads);
  if (avecLeads.length === 1) return { id: avecLeads[0].campagne_id, sur: 'jour' };
  if (avecLeads.length > 1) return { id: avecLeads[0].campagne_id, sur: 'probable' };
  const actives = ceJour.filter(x => Number(x.depense) > 0);
  if (actives.length === 1) return { id: actives[0].campagne_id, sur: 'probable' };
  return { id: null, sur: null };
}

// Les libellés des valeurs que Meta rend en anglais.
const LIBELLES = {
  plateformes: { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads' },
  sexes: { male: 'Hommes', female: 'Femmes', unknown: 'Non renseigné' },
  appareils: { mobile_app: 'Mobile (appli)', mobile_web: 'Mobile (web)', desktop: 'Ordinateur' },
};
const AXES = [['plateformes', 'Plateformes'], ['ages', 'Âges'], ['sexes', 'Sexe'], ['appareils', 'Appareils'], ['regions', 'Régions']];
const libelle = (axe, cle) => LIBELLES[axe]?.[cle] || (String(cle).toLowerCase() === 'unknown' ? 'Non renseigné' : cle || '—');

// La valeur qui pèse le plus sur un axe, en part des impressions.
function principal(c, axe) {
  const l = c.repartition?.[axe] || [];
  const tot = l.reduce((s, x) => s + (x.impressions || 0), 0);
  if (!l.length || !tot) return null;
  return { cle: libelle(axe, l[0].cle), part: Math.round(l[0].impressions / tot * 100) };
}

// Une barre par valeur, en part des impressions, avec ses leads.
function barres(c, axe) {
  const l = c.repartition?.[axe] || [];
  const tot = l.reduce((s, x) => s + (x.impressions || 0), 0);
  if (!l.length || !tot) return '<p class="small muted">Meta ne donne pas ce détail pour cette campagne.</p>';
  return l.map(x => {
    const part = x.impressions / tot * 100;
    const leads = x.leads ? ` · <b>${x.leads}</b> lead${x.leads > 1 ? 's' : ''}` : '';
    return `<div class="mads-barre" title="${esc(libelle(axe, x.cle))} : ${nombre(x.impressions)} impressions, ${euros(x.depense, 2)}">
      <span class="mads-barre-nom">${esc(libelle(axe, x.cle))}</span>
      <span class="mads-barre-piste"><i style="width:${part.toFixed(1)}%"></i></span>
      <span class="mads-barre-val">${Math.round(part)} %${leads}</span>
    </div>`;
  }).join('');
}

const STATUTS = { ACTIVE: ['Active', 'green'], PAUSED: ['En pause', 'muted'], CAMPAIGN_PAUSED: ['En pause', 'muted'],
  ARCHIVED: ['Archivée', 'muted'], DELETED: ['Supprimée', 'muted'], IN_PROCESS: ['En cours d’examen', 'amber'],
  WITH_ISSUES: ['À vérifier', 'red'] };
const pastille = (s) => { const [l, t] = STATUTS[s] || [s || '—', 'muted']; return `<span class="chip ${t}">${esc(l)}</span>`; };
const fmtJour = (j) => (j ? j.split('-').reverse().join('/') : '—');
const dureeJours = (du, au) => (du && au ? Math.round((Date.parse(au) - Date.parse(du)) / 86400000) + 1 : null);
const OBJECTIFS = { OUTCOME_LEADS: 'prospects', OUTCOME_TRAFFIC: 'trafic', OUTCOME_AWARENESS: 'notoriété',
  OUTCOME_ENGAGEMENT: 'interactions', OUTCOME_SALES: 'ventes' };

/**
 * Le bloc, ou une chaîne vide quand la structure n'a aucune campagne relevée —
 * un bloc vide se lirait comme « nos publicités n'ont rien donné ».
 */
export function blocMetaAds(cle, periode) {
  const campagnes = db.t('meta_ads_campagnes').filter(c => c.activity === cle);
  if (!campagnes.length) return '';
  const totaux = db.t('meta_ads_periode').filter(t => t.activity === cle);
  const jours = db.t('meta_ads_jour').filter(j => j.activity === cle);
  const compte = totaux.find(t => t.campagne_id === '*' && Number(t.periode) === periode);
  const depuis = totaux.find(t => t.campagne_id === '*' && Number(t.periode) === 0);
  const prec = compte?.precedent || {};
  const dernier = [...campagnes, ...totaux].map(x => x.releve_le).filter(Boolean).sort().pop();

  // La fenêtre du bas : celle de Meta si elle est relevée, sinon la même que le
  // reste de l'écran (jusqu'à hier).
  const hier = new Date(Date.now() - 86400000);
  const au = compte?.au || hier.toISOString().slice(0, 10);
  const du = compte?.du || new Date(hier.getTime() - (periode - 1) * 86400000).toISOString().slice(0, 10);

  // ---------- le CRM : les leads Meta, et ce qu'ils sont devenus
  // ⚠ `db.t` ET NON `scope.rgd` : l'écran Analyse est réservé à la direction et
  // n'a pas de vue par personne (`SANS_VUE`), mais `scope.rgd` applique quand
  // même la vue mémorisée — « la direction » par défaut — et retirait donc les
  // leads confiés à un chargé d'affaires. Une campagne a coûté la même chose
  // quel que soit celui qui a rappelé ses leads. Constaté en démo : 0 lead.
  const chantiers = db.t('rgd_chantiers');
  const devis = db.t('rgd_devis');
  const jv = joursDeVisite(db.t('agenda_events'));
  const rang = (e) => (e === 'sav' ? ORDRE_ETAPES.length : ORDRE_ETAPES.indexOf(e));
  const RDV = ORDRE_ETAPES.indexOf('rdv'), DEVIS = ORDRE_ETAPES.indexOf('devis_encours'), SIGNE = ORDRE_ETAPES.indexOf('devis_accepte');
  const tousLeads = (cle === 'rgd' && scope.isDirection ? db.t('rgd_clients') : [])
    .filter(f => f.source === 'meta_ads')
    .map(f => {
      const j = jourParis(f.meta_received_at);
      const r = rang(etapeDeFiche(f, chantiers, devis, jv));
      return { f, j, r, ...campagneDuLead(f, campagnes, jours),
        ca: r >= SIGNE ? montantDevisDe(f, devis, 'devis_accepte') : 0 };
    })
    .filter(x => x.j);
  const bilan = (l) => ({ leads: l.length, rdv: l.filter(x => x.r >= RDV).length,
    devis: l.filter(x => x.r >= DEVIS).length, signes: l.filter(x => x.r >= SIGNE).length,
    ca: l.reduce((s, x) => s + (x.ca || 0), 0) });
  const crm = bilan(tousLeads.filter(x => x.j >= du && x.j <= au));
  const nonRattaches = tousLeads.filter(x => !x.id).length;
  const probables = tousLeads.filter(x => x.sur === 'probable').length;

  // ---------- le récapitulatif : toutes les campagnes, la plus récente en tête
  const recap = campagnes.map(c => ({ c, t: totaux.find(x => x.campagne_id === c.campagne_id && Number(x.periode) === 0),
    k: bilan(tousLeads.filter(x => x.id === c.campagne_id)) }))
    .sort((a, b) => String(b.c.diffusion_du || b.c.debut || '').localeCompare(String(a.c.diffusion_du || a.c.debut || '')));

  const tuile = (lib, valeur, aide) => `<div class="ana-tuile" title="${esc(aide)}"><span>${esc(lib)}</span><b>${valeur}</b></div>`;
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  const lignes = recap.map(({ c, t, k }) => {
    const dj = dureeJours(c.diffusion_du, c.diffusion_au);
    const pf = principal(c, 'plateformes');
    const ag = principal(c, 'ages');
    const diffusion = c.diffusion_du
      ? `${esc(fmtJour(c.diffusion_du))} → ${esc(fmtJour(c.diffusion_au))}<br><span class="small muted">${pluriel(dj, 'jour')}</span>`
      : '<span class="muted">Jamais diffusée</span>';
    const crmTxt = k.leads
      ? ` · dans le CRM : ${pluriel(k.leads, 'lead')}, ${k.rdv} rendez-vous, ${k.devis} devis, ${pluriel(k.signes, 'signé')}${
        k.ca ? ` pour ${euros(k.ca)} HT` : ''}${t?.depense && k.signes ? ` — ${euros(t.depense / k.signes)} par client signé` : ''}`
      : '';
    return `<tr class="mads-ligne" data-mads="${esc(c.campagne_id)}" tabindex="0">
        <td><span class="mads-fleche" aria-hidden="true">›</span><b>${esc(c.nom || 'Sans nom')}</b><br>${pastille(c.statut_effectif || c.statut)}</td>
        <td class="nowrap">${diffusion}</td>
        <td class="num"><b>${euros(t?.depense)}</b></td><td class="num">${nombre(t?.impressions)}</td>
        <td class="num">${nombre(t?.clics)}</td>
        <td class="num"><b>${nombre(t?.leads)}</b></td><td class="num">${parLead(t?.depense, t?.leads)}</td>
        <td>${pf ? `${esc(pf.cle)} <span class="small muted">${pf.part} %</span>` : '—'}</td>
        <td>${ag ? `${esc(ag.cle)} <span class="small muted">${ag.part} %</span>` : '—'}</td>
        <td class="num">${k.leads}${k.signes ? ` <span class="small">· <b>${k.signes}</b> signé${k.signes > 1 ? 's' : ''}</span>` : ''}</td>
      </tr>
      <tr class="mads-detail" data-mads-detail="${esc(c.campagne_id)}" hidden><td colspan="10">
        <div class="mads-axes">${AXES.map(([axe, titre]) => `<div class="mads-axe"><p>${esc(titre)}</p>${barres(c, axe)}</div>`).join('')}</div>
        <p class="small muted">${nombre(t?.portee)} personnes touchées · taux de clic ${pourcent(t?.clics || 0, t?.impressions || 0)} · répartition des impressions depuis le lancement${
          c.objectif ? ` · objectif Meta : ${esc(OBJECTIFS[c.objectif] || c.objectif)}` : ''}${crmTxt}.</p>
      </td></tr>`;
  }).join('');

  return `<section class="ana-carte mads" style="--rs:#0866FF">
    <header>${logoReseau('facebook', 30)}<h3>Campagnes Meta Ads</h3>
      <span class="ana-abonnes"><b>${campagnes.length}</b> campagne${campagnes.length > 1 ? 's' : ''}${
        depuis?.du ? `<em>depuis le ${esc(fmtJour(depuis.du))}</em>` : ''}</span>
    </header>
    ${depuis ? `<div class="ana-tuiles mads-tuiles">
      ${tuile('Dépensé', euros(depuis.depense), 'Budget total dépensé depuis la première campagne')}
      ${tuile('Impressions', nombre(depuis.impressions), 'Nombre de fois où les publicités ont été affichées')}
      ${tuile('Personnes touchées', nombre(depuis.portee), 'Personnes uniques touchées, calculé par Meta')}
      ${tuile('Clics', nombre(depuis.clics), 'Clics sur les publicités')}
      ${tuile('Leads', nombre(depuis.leads), 'Formulaires remplis, comptés par Meta')}
      ${tuile('Coût par lead', parLead(depuis.depense, depuis.leads), 'Dépense divisée par le nombre de leads')}
    </div>` : ''}
    <p class="mads-titre">Récapitulatif des campagnes <span class="small muted">— depuis leur lancement · touchez une ligne pour le détail</span></p>
    <div class="table-wrap"><table class="ana-table mads-table">
      <thead><tr><th>Campagne</th><th>Diffusion</th><th class="num">Dépensé</th><th class="num">Impressions</th>
        <th class="num">Clics</th>
        <th class="num">Leads</th><th class="num">Coût / lead</th><th>Plateforme</th><th>Âge</th>
        <th class="num" title="Leads arrivés dans le CRM rattachés à cette campagne, et combien ont signé">CRM</th></tr></thead>
      <tbody>${lignes}</tbody></table></div>
    <div class="mads-crm">
      <p class="mads-crm-titre">Sur la période — du ${esc(fmtJour(du))} au ${esc(fmtJour(au))}</p>
      <div class="mads-entonnoir">
        <div><b>${compte ? euros(compte.depense) : '—'}</b><span>dépensés ${ecart(compte ? Number(compte.depense) : null, prec.depense, true)}</span></div>
        <div><b>${compte ? nombre(compte.leads) : '—'}</b><span>leads Meta ${ecart(compte?.leads ?? null, prec.leads)}</span></div>
        <div><b>${crm.leads}</b><span>arrivés dans le CRM</span></div>
        <div><b>${crm.rdv}</b><span>rendez-vous</span></div>
        <div><b>${crm.signes}</b><span>signés</span></div>
        <div class="mads-ca"><b>${euros(crm.ca)}</b><span>signés HT</span></div>
      </div>
    </div>
    <p class="small muted ana-note">Les leads du CRM sont rattachés à leur campagne par leur jour d’arrivée, croisé avec les leads que Meta compte ce jour-là : le formulaire Facebook ne transmet pas le nom de la campagne.${
      probables ? ` ${pluriel(probables, 'rattachement')} ${probables > 1 ? 'sont probables' : 'est probable'} (plusieurs campagnes tournaient le même jour).` : ''}${
      nonRattaches ? ` ${pluriel(nonRattaches, 'lead')} sans campagne retrouvée.` : ''}${
      dernier ? ` Relevé chaque matin — dernier relevé le ${esc(new Date(dernier).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}.` : ''}</p>
  </section>`;
}

/**
 * Ouvrir et fermer le détail d'une campagne. En place, sans redessin : le reste
 * de l'écran ne bouge pas, et une ligne ouverte le reste quand on en ouvre une
 * autre — on compare deux campagnes l'une sous l'autre.
 * ⚠ PAS DE `<details>` : il ne se replie pas dans le navigateur intégré qui sert
 * à éprouver les écrans (constaté sur le menu replié de l'espace RGD).
 */
export function lierMetaAds(root) {
  root.querySelectorAll('.mads-ligne').forEach(tr => {
    const basculer = () => {
      const d = root.querySelector(`[data-mads-detail="${CSS.escape(tr.dataset.mads)}"]`);
      if (!d) return;
      d.hidden = !d.hidden;
      tr.classList.toggle('est-ouvert', !d.hidden);
    };
    tr.onclick = basculer;
    tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(); } };
  });
}
