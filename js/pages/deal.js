// Affaires : fiche détaillée (modale), création / édition, changement d'étape, gagné / perdu.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, CHANNELS, LOST_REASONS, stageOf, stageIndex, stagesDe, missionDe, couleurMission, estNouveauLead, etapeEquivalente, estEtapeFinale, etapeFinale, estEngagee } from '../data/schema.js';
import { esc, eur, openModal, closeModal, renderForm, readForm, refField, bindRefFields, toast, fmtDate, fmtDateTime, userName, marqueResponsable, contactName, dealParty, actBadge, daysSince, confirm } from '../ui.js';
import { documentsSection, bindDocuments } from '../documents.js';
import { estAmoHenrri, blocHenrri, lierHenrri, etatHenrri } from '../henrri.js';
// ⚠ LA PRÉSENTATION EST CELLE DE LA FICHE CLIENT RGD, empruntée et non
// recopiée (25/09/2026, demandé par Mickael : « je veux la même présentation
// que les fiches client de RGD Renova »). `initiales`, `tuile` et `info`
// vivent dans `rgd-fiche.js` et servent aux trois fiches du CRM : trois
// présentations qui se ressemblent s'apprennent une fois.
import { initiales, tuile, info } from './rgd-fiche.js';

// ⚠ TROIS RUBRIQUES, ET LA FACTURATION À PART (25/09/2026 : « sépare bien les
// informations du prospect et du projet et de la mission », « la facturation à
// part dans un onglet pour ne pas trop surcharger la fiche »).
//
// `act.fields` est une liste PLATE : elle dit quoi saisir, pas où le ranger.
// Cette table dit où. ⚠ Un champ qu'elle ne connaît pas tombe dans « Le
// projet » — c'est le repli qui fait que les autres activités (courtage,
// propulsion) gagnent la nouvelle présentation sans qu'il faille les classer
// une à une, et qu'un champ ajouté demain s'affiche au lieu de disparaître.
const RUBRIQUE = {
  // Ce que le prospect nous a dit de lui et d'où il vient.
  urgence: 'prospect',
  // Ce sur quoi on travaille.
  type_bien: 'projet', adresse: 'projet', adresse_chantier: 'projet',
  problematique: 'projet', contexte: 'projet', type_travaux: 'projet',
  montant_travaux: 'projet', budget_annonce: 'projet', delai_souhaite: 'projet',
  // Ce qu'on a vendu et comment on l'exécute.
  type_mission: 'mission', niveau: 'mission', taux_amo: 'mission',
  date_visite: 'mission', date_rapport: 'mission',
  // Et ce qui part dans l'onglet.
  facture_num: 'facture', facture_date: 'facture', paiement_date: 'facture',
  num_devis: 'facture', commission_reelle: 'facture',
};
const rubriqueDe = (cle) => RUBRIQUE[cle] || 'projet';

/**
 * La fiche découverte, remise à jour avant impression.
 *
 * ⚠ `fields.decouverte` EST UNE COPIE FIGÉE DU PREMIER JOUR. La fiche
 * découverte crée trois choses d'un coup — un contact, une affaire, et cette
 * copie du formulaire — et la copie ne bouge plus jamais. Corriger ensuite
 * l'adresse du chantier ou le budget sur l'affaire laissait donc la feuille
 * imprimée sur l'ancienne valeur : la même information à trois endroits, dont
 * deux qui se taisent. C'est ce que Mickael a signalé le 25/09/2026 comme un
 * défaut de synchronisation.
 *
 * ⚠ LA COPIE N'EST PAS SUPPRIMÉE, ET CE N'EST PAS UN OUBLI : elle porte les
 * réponses du questionnaire (occupation, cotations, score, avancement) qui
 * n'ont pas d'autre maison. On repose simplement par-dessus ce dont une source
 * vivante existe — le contact pour la personne, l'affaire pour le projet et
 * l'argent. Ce qui reste vient de la copie, et n'a pas bougé depuis.
 */
export function ficheAJour(deal) {
  const copie = deal?.fields?.decouverte;
  if (!copie) return copie;
  const c = deal.contact_id && db.byId('contacts', deal.contact_id);
  const f = deal.fields || {};
  const garde = (vivant, fige) => (vivant === undefined || vivant === null || vivant === '') ? fige : vivant;
  return {
    ...copie,
    client: garde(c && contactName(c), copie.client),
    telephone: garde(c?.phone, copie.telephone),
    adresse: garde(f.adresse, copie.adresse),
    budget_ht: garde(f.montant_travaux, copie.budget_ht),
    date_debut: garde(f.date_visite, copie.date_debut),
    niveau: garde(f.niveau, copie.niveau),
    honoraires_ht: garde(deal.amount, copie.honoraires_ht),
    etape: garde(stageOf(deal.activity, deal.stage)?.label, copie.etape),
  };
}

/**
 * Les rendez-vous de l'affaire, lus dans l'agenda relevé de Google.
 *
 * ⚠ LE RAPPROCHEMENT SE FAIT PAR LE NOM, faute de mieux : `agenda_events` est
 * un reflet de Google et ne porte aucun identifiant d'affaire. On se limite
 * donc aux événements de la MÊME activité — le calendrier de BTP Expertise
 * pour une mission BTP — et on exige un nom d'au moins trois lettres, sinon
 * une initiale accrocherait toute la semaine.
 *
 * ⚠ CE N'EST PAS LA MÊME CHOSE QUE `fields.date_visite`, qui est une date
 * SAISIE à la main. Les deux s'affichent : l'agenda dit ce qui est posé, le
 * champ dit ce qui était prévu, et leur écart est une information.
 */
function rendezVousDeLAffaire(deal, contact) {
  const nom = contact ? contactName(contact) : '';
  const cherche = String(nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  if (cherche.length < 3) return [];
  return db.t('agenda_events')
    .filter(e => e.activity === deal.activity && e.title
      && String(e.title).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().includes(cherche))
    .sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')));
}

const contactLabel = c => `${contactName(c)}${c.city ? ' (' + c.city + ')' : ''}`;
const orgLabel = o => o.name;

async function logEvent(deal, kind, body) {
  await db.insert('events', { deal_id: deal.id, contact_id: deal.contact_id || null, organisation_id: deal.organisation_id || null, kind, body, author_id: scope.user.id });
}

// ---------- Attribuer une affaire a un charge d'affaires ----------
// Un lead venu d'un formulaire du site arrive SANS responsable : la regle
// d'acces le rend alors invisible a tout charge d'affaires, seule la direction
// le voit. C'est elle qui distribue, et c'est ici qu'elle le fait — sans passer
// par le formulaire complet de l'affaire.
//
// L'attribution s'inscrit dans l'historique : sans cela, personne ne peut dire
// plus tard qui a confie quoi, ni quand. C'est tout l'interet de la manoeuvre.
//
// Le coeur de l'attribution, partage par la fiche d'affaire et par l'onglet
// « Nouveaux leads » : les deux doivent produire exactement le meme resultat,
// trace comprise. Renvoie l'affaire mise a jour.
export async function assignerResponsable(deal, ownerId) {
  if (!ownerId || ownerId === deal.owner_id) return deal;
  const avant = deal.owner_id && db.byId('profiles', deal.owner_id);
  const u = await db.update('deals', deal.id, { owner_id: ownerId });
  // Les taches que personne ne porte suivent l'affaire : une tache sans
  // destinataire est invisible elle aussi. Celles deja confiees a quelqu'un ne
  // bougent pas — on ne reprend pas le travail d'un tiers au passage.
  for (const a of db.t('activities').filter(a => a.deal_id === deal.id && !a.done && !a.assignee_id)) {
    await db.update('activities', a.id, { assignee_id: ownerId });
  }
  await logEvent(u, 'system', avant
    ? `Responsable : ${avant.full_name} → ${userName(ownerId)}`
    : `Affaire attribuée à ${userName(ownerId)}`);
  return u;
}

// Qui peut porter une affaire : la direction, et les personnes dont le profil
// porte l'activite concernee.
export const candidatsResponsable = (activity) => scope.users().filter(u =>
  u.role === 'direction' || (u.activities || []).includes(activity));

export function attribuerDeal(deal, onDone, onClose = null) {
  const candidats = candidatsResponsable(deal.activity);
  const actuel = deal.owner_id && db.byId('profiles', deal.owner_id);
  const orphelines = db.t('activities').filter(a => a.deal_id === deal.id && !a.done && !a.assignee_id).length;

  const m = openModal(actuel ? 'Changer de responsable' : 'Attribuer cette affaire', `<form class="form" id="attr-form">
    ${renderForm([{ key: 'owner_id', label: "Chargé d'affaires", type: 'select',
      options: candidats.map(u => [u.id, `${u.full_name}${u.role === 'direction' ? ' (direction)' : ''}`]),
      required: true, value: deal.owner_id || '' }])}
    <p class="muted small">${actuel
      ? `Actuellement : <b>${esc(actuel.full_name)}</b>. Le changement est inscrit dans l'historique de l'affaire.`
      : `Personne n'en est responsable : elle n'apparaît aujourd'hui que pour la direction.${orphelines ? ` Les ${orphelines} tâche${orphelines > 1 ? 's' : ''} sans destinataire suivront.` : ''}`}</p>
    <div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">${actuel ? 'Changer' : 'Attribuer'}</button></div>
  </form>`, { onClose });

  m.querySelector('#attr-form').onsubmit = async e => {
    e.preventDefault();
    const id = new FormData(e.target).get('owner_id');
    if (!id || id === deal.owner_id) { closeModal(true); return onDone?.(); }
    await assignerResponsable(deal, id);
    closeModal(true);
    toast(`Attribuée à ${userName(id)}`);
    onDone?.();
  };
}

// Un lead qui passe le premier entretien n'est plus un prospect : son contact
// devient client. Ce n'est pas cosmetique — l'onglet « Prospects » de la base BTP
// a disparu, donc un contact qui quitte la pile des nouveaux leads sans devenir
// client ne se retrouve plus que dans « Tous les contacts ». Il disparaitrait
// du parcours.
//
// On ne redescend jamais : reculer une affaire d'une etape ne « declasse » pas
// un client en prospect, ce serait absurde vu du client.
async function promouvoirClient(avant, apres) {
  if (!apres?.contact_id) return;
  if (!estNouveauLead(avant) || estNouveauLead(apres)) return;
  const c = db.byId('contacts', apres.contact_id);
  if (c && c.type !== 'Client') await db.update('contacts', c.id, { type: 'Client' });
}

export async function moveStage(deal, stageKey, { silent = false } = {}) {
  const act = ACTIVITIES[deal.activity]; const st = stageOf(deal.activity, stageKey);
  if (!st || deal.stage === stageKey) return;
  const patch = { stage: stageKey, stage_changed_at: new Date().toISOString(), stage_history: [...(deal.stage_history || []), { stage: stageKey, at: new Date().toISOString() }] };
  // ARRIVER À LA DERNIÈRE ÉTAPE NE FAIT PAS GAGNER. Une mission posée sur « Réception
  // chantiers » est encore en cours tant que la réception n'est pas faite : aucune
  // étape ne déclenche donc le gain chez BTP Expertise, il se déclare par `setWon`
  // quand le travail est réellement fini. Une activité qui ne déclare pas d'étape
  // finale (`gain`) garde l'ancienne règle — toute étape de réalisation gagne —, ce
  // qui laisse Propulsion intacte.
  // Le RECUL, lui, reste automatique : une affaire gagnée qu'on ramène avant sa
  // dernière étape se rouvre, sans quoi le CA compterait une victoire qui n'a plus
  // lieu. Gagner est une décision, ne plus l'être est une conséquence.
  const finale = estEtapeFinale(deal.activity, stageKey);
  const gainAutomatique = !ACTIVITIES[deal.activity]?.gain;
  if (finale && gainAutomatique && deal.status !== 'won') Object.assign(patch, { status: 'won', won_at: new Date().toISOString(), closed_at: new Date().toISOString(), lost_reason: null });
  else if (!finale && deal.status === 'won') Object.assign(patch, { status: 'open', won_at: null, closed_at: null });
  const updated = await db.update('deals', deal.id, patch);
  await promouvoirClient(deal, updated);
  const mention = patch.status === 'won' ? ' (affaire gagnée)' : patch.status === 'open' ? ' (affaire remise en cours)' : '';
  await logEvent(updated, 'stage', `Étape → ${st.label}${mention}`);
  if (!silent) toast(`Étape : ${st.label}`);
  return updated;
}

export async function setWon(deal) {
  const act = ACTIVITIES[deal.activity];
  // « Marquer gagnée » est LE geste qui gagne une affaire chez BTP Expertise : il dit
  // que la dernière étape est terminée — réception faite en AMO, dossier clôturé et
  // facturé en expertise. Il emmène l'affaire à cette étape si elle n'y est pas encore.
  const gain = etapeFinale(deal.activity, missionDe(deal));
  const patch = { status: 'won', won_at: new Date().toISOString(), closed_at: new Date().toISOString(), lost_reason: null };
  if (gain && stageIndex(deal.activity, deal.stage) < stageIndex(deal.activity, gain)) {
    Object.assign(patch, { stage: gain, stage_changed_at: new Date().toISOString(), stage_history: [...(deal.stage_history || []), { stage: gain, at: new Date().toISOString() }] });
  }
  const u = await db.update('deals', deal.id, patch);
  await promouvoirClient(deal, u);
  await logEvent(u, 'stage', '🎉 Affaire gagnée');
  // Tâche de suite automatique selon l'activité
  const follow = { rgd: 'Créer le client et le chantier dans Costructor', btp: 'Planifier la mission', courtage: 'Suivre le déblocage et facturer la commission', propulsion: 'Lancer l\'onboarding et renseigner l\'abonnement sur l\'organisation' }[deal.activity];
  if (follow) await db.insert('activities', { deal_id: deal.id, contact_id: deal.contact_id || null, organisation_id: deal.organisation_id || null, type: 'appel', title: follow, due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), assignee_id: deal.owner_id || scope.user.id, done: false });
  toast('Affaire gagnée 🎉');
  return u;
}

export function setLost(deal, onDone, onClose = null) {
  const m = openModal('Affaire perdue', `<form class="form" id="lost-form">
    ${renderForm([{ key: 'lost_reason', label: 'Motif de perte', type: 'select', options: LOST_REASONS, required: true }, { key: 'note', label: 'Commentaire', type: 'textarea', rows: 2 }])}
    <div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn danger" type="submit">Marquer perdue</button></div></form>`, { onClose });
  m.querySelector('#lost-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const u = await db.update('deals', deal.id, { status: 'lost', lost_reason: f.get('lost_reason'), lost_at: new Date().toISOString(), closed_at: new Date().toISOString() });
    await logEvent(u, 'stage', `Affaire perdue — ${f.get('lost_reason')}${f.get('note') ? ' : ' + f.get('note') : ''}`);
    // Les tâches ouvertes n'ont plus de sens
    for (const a of db.t('activities').filter(a => a.deal_id === deal.id && !a.done)) await db.update('activities', a.id, { done: true, done_at: new Date().toISOString() });
    closeModal(true); toast('Affaire marquée perdue'); onDone?.();
  };
}

export async function reopen(deal) {
  const u = await db.update('deals', deal.id, { status: 'open', won_at: null, lost_at: null, closed_at: null, lost_reason: null });
  await logEvent(u, 'stage', 'Affaire réouverte'); toast('Affaire réouverte');
}

// ---------- Formulaire création / édition ----------
export function dealForm(activityKey, existing = null, presets = {}, onSaved, onClose = null) {
  const act = ACTIVITIES[activityKey];
  const users = scope.users();
  const contacts = scope.contacts(); const orgs = scope.orgs();
  const base = [
    { key: 'title', label: "Intitulé de l'affaire", type: 'text', required: true, placeholder: 'Ex. Rénovation appartement — Dupont' },
    { key: 'owner_id', label: 'Responsable', type: 'select', options: users.map(u => [u.id, u.full_name]), required: true, half: true, value: scope.user.id },
    { key: 'amount', label: act.amountLabel, type: 'number', half: true, step: '1' },
    { key: 'channel', label: "Canal d'origine", type: 'select', options: CHANNELS, required: true, half: true },
    { key: 'campaign', label: 'Campagne (nom exact Meta / Google)', type: 'text', half: true },
  ];
  const specific = act.fields.map(f => ({ ...f, half: f.type !== 'textarea' }));
  const vals = existing ? { ...existing, ...(existing.fields || {}) } : { ...presets, ...(presets.fields || {}) };
  // ⚠ LE FORMULAIRE EST EN BLOCS COLORÉS depuis le 25/09/2026 (« modernise
  // aussi le formulaire avec des couleurs pour un peu plus de dynamisme »).
  // C'était une pile de quinze champs à plat, sans respiration ni ordre de
  // lecture. Trois blocs, dans l'ordre où l'on remplit : l'affaire, qui elle
  // concerne, ce qu'il y a à en dire.
  //
  // ⚠ LE LISERÉ PREND LA COULEUR DE LA STRUCTURE (`--dlg-teinte`), pas une
  // couleur en dur : le même formulaire sert à BTP, au courtage et à
  // Propulsion, et trois formulaires bleus ne diraient plus dans lequel on est.
  const bloc = (titre, dedans) => `
    <section class="dlg-bloc"><h4>${esc(titre)}</h4>${dedans}</section>`;

  const html = `<form class="form dlg" id="deal-form" style="--dlg-teinte:${esc(act.color || act.accent)}">
    ${bloc("L’affaire", renderForm(base, vals))}
    ${bloc('Qui elle concerne', `
      ${refField('contact_id', 'Contact', contacts, contactLabel, vals.contact_id)}
      ${refField('organisation_id', 'Entreprise / structure', orgs, orgLabel, vals.organisation_id)}
      ${refField('referrer_org_id', 'Apporteur (organisation)', orgs, orgLabel, vals.referrer_org_id)}
      ${refField('referrer_contact_id', 'Apporteur (contact)', contacts, contactLabel, vals.referrer_contact_id)}`)}
    ${bloc(`Informations ${act.label}`, renderForm(specific, vals))}
    <div class="form-actions">${existing ? '<button type="button" class="btn ghost left danger" id="deal-del">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div>
  </form>`;
  const m = openModal(existing ? "Modifier l'affaire" : `Nouvelle affaire — ${act.label}`, html, { wide: true, onClose });
  const form = m.querySelector('#deal-form');
  bindRefFields(form, { contact_id: { rows: contacts, labelFn: contactLabel }, organisation_id: { rows: orgs, labelFn: orgLabel }, referrer_org_id: { rows: orgs, labelFn: orgLabel }, referrer_contact_id: { rows: contacts, labelFn: contactLabel } });
  form.onsubmit = async e => {
    e.preventDefault();
    const b = readForm(form, base); const s = readForm(form, specific);
    const refs = {};
    for (const k of ['contact_id', 'organisation_id', 'referrer_org_id', 'referrer_contact_id']) refs[k] = form.querySelector(`[name="${k}"]`).value || null;
    if (!refs.contact_id && !refs.organisation_id) return toast('Indiquez au moins un contact ou une organisation', 'warn');
    if (activityKey === 'propulsion' && !b.amount && s.montant_mensuel && s.duree_mois) b.amount = s.montant_mensuel * s.duree_mois;
    if (b.channel === 'Partenaire / apporteur' && !refs.referrer_org_id && !refs.referrer_contact_id) return toast("Canal « Partenaire / apporteur » : indiquez l'apporteur", 'warn');
    try {
      if (existing) {
        const patch = { ...b, ...refs, fields: s };
        // CHANGER DE MÉTIER, C'EST CHANGER DE PIPELINE. Chez BTP Expertise, chaque étape
        // appartient à l'expertise OU à l'AMO. Basculer `type_mission` sans toucher à
        // l'étape laissait l'affaire à une étape de l'autre métier : elle disparaissait
        // de son pipeline — aucune colonne ne l'accueillait — tout en restant comptée
        // dans le pied de page. Silencieux, et constaté en production le 19/09/2026.
        // On replace donc l'affaire au même rang dans le déroulé du nouveau métier, et
        // on le dit : à l'écran, et dans l'historique.
        const apres = { ...existing, fields: s };
        const equivalente = etapeEquivalente(existing.activity, existing.stage, missionDe(apres));
        if (equivalente) {
          const quand = new Date().toISOString();
          Object.assign(patch, { stage: equivalente, stage_changed_at: quand,
            stage_history: [...(existing.stage_history || []), { stage: equivalente, at: quand }] });
        }
        const maj = await db.update('deals', existing.id, patch);
        if (equivalente) {
          // Les deux métiers ont des étapes de même nom (« Qualifié » des deux côtés) :
          // sans nommer le métier, l'historique dirait « Qualifié » remplacé par
          // « Qualifié » et ne voudrait rien dire.
          const nom = (m) => couleurMission(m).label;
          const avant = stageOf(existing.activity, existing.stage)?.label || existing.stage;
          const vers = stageOf(existing.activity, equivalente)?.label || equivalente;
          await logEvent(maj, 'stage', `Métier : ${nom(missionDe(existing))} → ${nom(missionDe(apres))}. `
            + `Étape « ${avant} » replacée au même rang : « ${vers} ».`);
          toast(`Métier changé : l'affaire rejoint le pipeline ${nom(missionDe(apres))}, étape « ${vers} »`);
        } else toast('Affaire mise à jour');
        closeModal(true); onSaved?.(existing.id);
      }
      else {
        const stage = act.stages[0].key;
        const d = await db.insert('deals', { ...b, ...refs, activity: activityKey, stage, status: 'open', fields: s, stage_history: [{ stage, at: new Date().toISOString() }], stage_changed_at: new Date().toISOString() });
        // Activité concernée ajoutée sur le contact / l'organisation
        for (const [t, id] of [['contacts', refs.contact_id], ['organisations', refs.organisation_id]]) {
          if (!id) continue; const r = db.byId(t, id); if (r && !(r.activities || []).includes(activityKey)) await db.update(t, id, { activities: [...(r.activities || []), activityKey] });
        }
        await db.insert('activities', { deal_id: d.id, contact_id: refs.contact_id, organisation_id: refs.organisation_id, type: 'appel', title: 'Contacter le prospect', due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), assignee_id: b.owner_id, done: false });
        toast('Affaire créée avec une première action « Contacter le prospect »'); closeModal(true); onSaved?.(d.id);
      }
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#deal-del')?.addEventListener('click', async () => {
    if (!await confirm('Supprimer définitivement cette affaire et ses activités ?')) return;
    for (const a of db.t('activities').filter(a => a.deal_id === existing.id)) await db.remove('activities', a.id);
    for (const ev of db.t('events').filter(a => a.deal_id === existing.id)) await db.remove('events', ev.id);
    await db.remove('deals', existing.id); closeModal(true); toast('Affaire supprimée'); onSaved?.(null);
  });
}

// ---------- Fiche affaire ----------
export function openDeal(id, onChange) {
  // L'état chez Henrri est distant : on ne peut pas le lire pendant le rendu,
  // qui est synchrone. Il est donc gardé ici, à côté de la fiche, et le bloc
  // se redessine quand la réponse arrive. Seules les missions AMO le lisent —
  // les autres affaires n'appellent jamais Henrri.
  let etatCourant = null;
  const render = () => {
    const d = db.byId('deals', id); if (!d) return closeModal();
    const act = ACTIVITIES[d.activity];
    const events = db.t('events').filter(e => e.deal_id === id).sort((x, y) => y.created_at.localeCompare(x.created_at));
    const contact = d.contact_id && db.byId('contacts', d.contact_id);
    const org = d.organisation_id && db.byId('organisations', d.organisation_id);
    const refOrg = d.referrer_org_id && db.byId('organisations', d.referrer_org_id);
    const refC = d.referrer_contact_id && db.byId('contacts', d.referrer_contact_id);
    // Le fil des etapes, et la position dedans : tous deux sur la liste du metier
    // de l'affaire, sinon l'etape courante serait reperee au mauvais rang.
    const etapes = stagesDe(d.activity, missionDe(d));
    const curIdx = etapes.findIndex(s => s.key === d.stage);
    const status = d.status === 'won' ? `<span class="status-won">GAGNÉE ${fmtDate(d.won_at)}</span>` : d.status === 'lost' ? `<span class="status-lost">PERDUE — ${esc(d.lost_reason || '')}</span>` : `<span class="pill info">En cours · ${daysSince(d.stage_changed_at) ?? 0} j dans l'étape</span>`;
    // ⚠ LE MONTANT SOUS LE NOM CHANGE DE NATURE À L'ENGAGEMENT (25/09/2026 :
    // « rajoute le budget entre les étapes nouveau et lettre de mission, et à
    // partir de lettre de mission je veux les chiffres de la facture »). Le
    // seuil n'est pas recopié ici : c'est `estEngagee`, donc « Lettre de
    // mission » côté expertise et « Mission AMO signée » côté AMO, déclaré une
    // seule fois dans `schema.js`. Avant, on regarde ce que le client a
    // annoncé ; après, ce qu'on lui a facturé — le budget n'a plus d'usage.
    const rdvs = rendezVousDeLAffaire(d, contact);
    const engagee = estEngagee(d);
    const budget = Number(d.fields?.montant_travaux ?? d.fields?.budget_annonce) || 0;
    const factureNum = d.fields?.facture_num;
    const ligneArgent = engagee
      ? `<b>${esc(eur(d.amount))}</b> <span>${esc(act.amountLabel.replace(/\s*\(€\)/, ''))}</span>`
        + (factureNum
            ? ` <span class="rgdf-tag">Facture ${esc(factureNum)}${d.fields?.facture_date ? ' · ' + esc(fmtDate(d.fields.facture_date)) : ''}</span>`
            : ' <span class="rgdf-tag est-perdu">Pas encore facturée</span>')
        + (d.fields?.paiement_date ? ` <span class="rgdf-tag est-etape">Payée le ${esc(fmtDate(d.fields.paiement_date))}</span>` : '')
      : budget
        ? `<b>${esc(eur(budget))}</b> <span>de budget annoncé</span>`
        : '<span class="muted">Budget non renseigné</span>';

    // Les champs de l'activité, rangés par rubrique. Une rubrique vide ne
    // s'affiche pas : un titre suivi de rien fait chercher ce qui manque.
    const champsDe = (rub) => act.fields
      .filter(fl => rubriqueDe(fl.key) === rub)
      .map(fl => {
        const v = d.fields?.[fl.key];
        if (v === undefined || v === '' || v === null || v === false) return '';
        const texte = fl.type === 'checkbox' ? 'Oui'
          : fl.type === 'date' ? fmtDate(v)
          : fl.type === 'number' && /€/.test(fl.label) ? eur(v)
          : String(v);
        return info('regle', fl.label, esc(texte), 'est-gris');
      }).join('');

    const blocSi = (titre, dedans, vide) => dedans || vide
      ? `<section class="rgdf-bloc"><h3>${esc(titre)}</h3>${dedans || `<p class="rgdf-rien">${esc(vide)}</p>`}</section>`
      : '';

    const html = `
      <div class="rgdf-hero">
        <div class="rgdf-hero-haut">
          <div class="rgdf-avatar">${esc(initiales(contact ? contactName(contact) : d.title))}</div>
          <div class="rgdf-identite">
            <h2>${esc(d.title)}</h2>
            <div class="rgdf-argent">${ligneArgent}</div>
            <div class="rgdf-meta">
              <span class="rgdf-tag">${esc(act.label)}</span>
              <span class="rgdf-tag ${d.status === 'lost' ? 'est-perdu' : 'est-etape'}">${
                d.status === 'won' ? 'Gagnée le ' + esc(fmtDate(d.won_at))
                : d.status === 'lost' ? 'Perdue' + (d.lost_reason ? ' — ' + esc(d.lost_reason) : '')
                : esc(etapes[curIdx]?.label || d.stage)}</span>
              ${d.status === 'open' ? `<span class="rgdf-tag">${daysSince(d.stage_changed_at) ?? 0} j dans l’étape</span>` : ''}
              <span class="rgdf-tag">Créée le ${esc(fmtDate(d.created_at))}</span>
            </div>
          </div>

          <!-- ⚠ LE COIN HAUT DROIT NE PORTE QUE L ISSUE DE L AFFAIRE, plus
               les rendez-vous. Les commandes ordinaires - fiche de mission,
               responsable, modifier, supprimer - RESTENT dans leur rangee sous
               l en-tete, avec leurs intitules entiers. Les avoir entassees
               dans le coin obligeait a les abreger : un bouton nomme par une
               seule icone se devine, il ne se lit pas.

               ⚠ GAGNEE ET PERDUE FORMENT UNE PAIRE : meme forme, meme poids,
               deux teintes. Ce sont les deux issues du meme choix, pas deux
               commandes de plus. Teintees au repos, pleines au survol, pour
               qu on voie ce qu on declare avant de cliquer - le gros bouton
               rouge plein au milieu de la fiche se cliquait par accident.

               ⚠ GAGNEE RESTE SUR TOUTES LES ETAPES OUVERTES, et ce n est pas
               un oubli : c est une demande retiree par Mickael lui-meme le
               25/09/2026. Une version intermediaire ne l affichait qu a la
               derniere etape ; elle a ete retiree parce que setWon sait aussi
               declarer gagnee une affaire qui n y est pas encore et la
               DEPLACER a l etape finale. Restreindre l affichage fermait donc
               ce chemin-la sans le dire. -->
          <div class="rgdf-coin">
            <div class="rgdf-issues">
              ${d.status === 'open'
                ? '<button class="rgdf-issue est-gagne" id="d-won">✓ Gagnée</button>'
                  + '<button class="rgdf-issue est-perdu" id="d-lost">✕ Perdue</button>'
                : '<button class="rgdf-issue est-rouvre" id="d-reopen">↺ Réouvrir</button>'}
            </div>
            ${rdvs.length ? `<div class="rgdf-rdv">
              <span class="rgdf-rdv-titre">${rdvs.length > 1 ? `Rendez-vous <b>${rdvs.length}</b>` : 'Rendez-vous'}</span>
              <ul>${rdvs.slice(0, 4).map(e => {
                const passe = String(e.day || '') < new Date().toISOString().slice(0, 10);
                const quand = e.all_day || !e.starts_at ? fmtDate(e.day) : fmtDateTime(e.starts_at);
                return `<li class="${passe ? 'est-passe' : ''}"><b>${esc(quand)}</b></li>`;
              }).join('')}</ul>
            </div>` : ''}
          </div>
        </div>

        <div class="rgdf-actions">
          ${d.fields?.decouverte ? '<button class="btn ghost sm" id="d-fiche">🖨 Fiche de mission</button>' : ''}
          ${scope.isDirection ? `<button class="btn ghost sm" id="d-attr">👤 ${d.owner_id ? 'Changer de responsable' : 'Attribuer'}</button>` : ''}
          <button class="btn ghost sm" id="d-edit">✎ Modifier</button>
          <button class="btn ghost sm danger" id="d-del">🗑 Supprimer</button>
        </div>
      </div>

      <!-- La frise EST le levier : cliquer une etape la change. Elle etait deja
           la, mais noyee sous la barre de boutons ; elle passe sous l'en-tete,
           a la place qu'elle a sur la fiche client RGD. -->
      <div class="rgdf-piste ${d.status === 'lost' ? 'est-perdu' : ''}">
        <div class="rgdf-jalons">
          <div class="rgdf-rail"><span style="width:${curIdx <= 0 ? 0
            : Math.round((curIdx / Math.max(1, etapes.length - 1)) * 100)}%"></span></div>
          ${etapes.map((st, i) => `
            <button data-stage="${esc(st.key)}" title="${esc(estEtapeFinale(d.activity, st.key)
                ? 'Derniere etape. Y etre ne suffit pas : l affaire se gagne avec « Gagnee ».'
                : st.delivery ? 'Etape de realisation — la mission tourne, elle n est pas encore gagnee'
                : 'Probabilite ' + st.p + ' %')}"
              class="${i === curIdx ? 'cur' : i < curIdx ? 'past' : ''}">
              <i></i><span>${esc(st.label)}</span>
            </button>`).join('')}
        </div>
      </div>

      <!-- ⚠ LA FACTURATION EST DERRIERE UN ONGLET, pas supprimee : six lignes de
           chiffres et le bloc Henrri au milieu du dossier noyaient le projet. -->
      <div class="pill-tabs rgdf-onglets" role="tablist">
        <button type="button" data-onglet="fiche" class="on">Le dossier</button>
        <button type="button" data-onglet="facture">Facturation</button>
      </div>

      <div class="rgdf-corps" data-vue="fiche">
        <div class="rgdf-colonne">
          ${blocSi('Le prospect', `
            ${info('personne', 'Contact', contact ? `<a href="#/contacts/${esc(contact.id)}" data-close>${esc(contactName(contact))}</a>` : '', 'est-orange')}
            ${info('tel', 'Téléphone', contact?.phone ? `<a href="tel:${esc(contact.phone)}">${esc(contact.phone)}</a>` : '', 'est-vert')}
            ${info('mail', 'E-mail', contact?.email ? `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : '', 'est-bleu')}
            ${info('maison', 'Entreprise', org ? `<a href="#/contacts/${esc(org.id)}" data-close>${esc(org.name)}</a>` : '', 'est-bleu')}
            ${info('source', 'Canal', esc(d.channel || ''), 'est-violet')}
            ${info('personne', 'Apporteur', refOrg ? esc(refOrg.name) : refC ? esc(contactName(refC)) : '', 'est-vert')}
            ${info('personne', 'Responsable', marqueResponsable(d.owner_id), 'est-gris')}
            ${champsDe('prospect')}`, 'Aucune coordonnée renseignée.')}

          ${blocSi('Le projet', champsDe('projet'), 'Le projet n’a pas encore été décrit.')}
          ${blocSi('La mission', champsDe('mission'), '')}
        </div>

        <!-- ⚠ L'HISTORIQUE PASSE A DROITE (demande du 25/09), au-dessus des
             actions a venir, qui RESTENT : elles portent les relances. -->
        <div class="rgdf-colonne">
          <section class="rgdf-bloc rgdf-suivi">
            <h3>Historique <span class="rgdf-compte">${events.length}</span></h3>
            <form id="note-form" class="rgdf-ajout">
              <input name="body" required placeholder="Noter un appel, un échange, une décision…">
              <button class="btn sm" type="submit">Ajouter</button>
            </form>
            <div class="timeline">${events.length
              ? events.map(e => `<div class="tl ${esc(e.kind)}"><div class="meta">${esc(fmtDateTime(e.created_at))} · ${esc(userName(e.author_id))}</div>${esc(e.body)}</div>`).join('')
              : '<p class="rgdf-rien">Aucun échange enregistré.</p>'}</div>
          </section>

          ${documentsSection('deals', id)}
        </div>
      </div>

      <div class="rgdf-corps" data-vue="facture" hidden>
        <div class="rgdf-colonne rgdf-large">
          ${blocSi('Facturation', champsDe('facture')
            + info('euro', act.amountLabel.replace(/\s*\(€\)/, ''), esc(eur(d.amount)), 'est-orange'),
            '')}
          ${estAmoHenrri(d) ? blocHenrri(d, etatCourant) : ''}
          ${!estAmoHenrri(d) && !champsDe('facture')
            ? '<p class="rgdf-rien">Rien de facturé pour le moment.</p>' : ''}
        </div>
      </div>`;
    // Le titre est dans l'en-tête de la fiche : le repasser à `openModal` le
    // ferait lire deux fois, à deux tailles différentes.
    const m = openModal('', html, { wide: true, onClose: () => onChange?.() });
    m.classList.add('rgdf');
    const refresh = () => { render(); onChange?.(); };

    // ⚠ LES ONGLETS NE RECHARGENT RIEN : ils montrent et cachent deux blocs
    // déjà rendus. Redessiner à chaque clic perdrait la note en cours de
    // frappe dans l'historique, et rouvrirait la modale pour rien.
    m.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => {
      m.querySelectorAll('[data-onglet]').forEach(x => x.classList.toggle('on', x === b));
      m.querySelectorAll('[data-vue]').forEach(v => { v.hidden = v.dataset.vue !== b.dataset.onglet; });
    });
    m.querySelectorAll('[data-stage]').forEach(b => b.onclick = async () => { const dd = db.byId('deals', id); const st = stageOf(dd.activity, b.dataset.stage); if (dd.status === 'lost') return toast('Réouvrez l\'affaire avant de changer d\'étape', 'warn'); if (dd.status === 'won' && !st.delivery) return toast('Affaire gagnée : réouvrez-la pour revenir à une étape commerciale', 'warn'); await moveStage(dd, b.dataset.stage); refresh(); });
    m.querySelector('#d-won')?.addEventListener('click', async () => { await setWon(db.byId('deals', id)); refresh(); });
    m.querySelector('#d-lost')?.addEventListener('click', () => setLost(db.byId('deals', id), refresh, render));
    m.querySelector('#d-reopen')?.addEventListener('click', async () => { await reopen(db.byId('deals', id)); refresh(); });
    m.querySelector('#d-fiche')?.addEventListener('click', async () => {
      try {
        const { imprimerFicheDeal } = await import('./btp-fiche.js');
        // La feuille imprimee reprend les valeurs COURANTES, pas celles du jour
        // ou la fiche decouverte a ete remplie.
        await imprimerFicheDeal(ficheAJour(db.byId('deals', id)));
      } catch (err) { toast(err.message, 'err'); }
    });
    m.querySelector('#d-attr')?.addEventListener('click', () => attribuerDeal(db.byId('deals', id), refresh, render));
    m.querySelector('#d-edit').onclick = () => dealForm(d.activity, db.byId('deals', id), {}, (nid) => { if (nid) refresh(); else { onChange?.(); } }, render);
        m.querySelector('#d-del').onclick = async () => {
      const dd = db.byId('deals', id);
      if (!await confirm(`Supprimer définitivement l'affaire « ${dd.title} » ? Ses activités et ses notes seront supprimées avec elle. Le contact, lui, est conservé.`)) return;
      for (const a of db.t('activities').filter(x => x.deal_id === id)) await db.remove('activities', a.id);
      for (const e of db.t('events').filter(x => x.deal_id === id)) await db.remove('events', e.id);
      await db.remove('deals', id);
      closeModal(true);
      toast('Affaire supprimée');
      onChange?.();
    };
    m.querySelector('#note-form').onsubmit = async e => { e.preventDefault(); const body = e.target.body.value.trim(); if (!body) return; await logEvent(d, 'note', body); refresh(); };
    bindDocuments(m, 'deals', id, render);

    // Henrri, pour les seules missions AMO. La lecture est gratuite chez eux,
    // donc on relit à chaque ouverture ; l'écriture, elle, part d'un clic.
    if (estAmoHenrri(d)) {
      lierHenrri(m, d, () => { etatCourant = null; render(); });
      if (!etatCourant) {
        etatHenrri(id)
          .then(e => { etatCourant = e; render(); })
          .catch(e => {
            // NE PAS ACCUSER HENRRI D'OFFICE. Cette lecture ne sort même pas
            // chez Henrri — elle interroge la base — donc un échec ici est le
            // plus souvent local (session expirée, plomberie). Dire « Henrri
            // injoignable » envoyait chercher la panne au mauvais endroit.
            const zone = m.querySelector('#henrri-attente');
            if (zone) zone.textContent = `Facturation illisible : ${e.message}`;
          });
      }
    }
  };
  render();
}
