// Activités (tâches / RDV) : formulaire, liste, clôture.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITY_TYPES, ACTIVITIES, MODULES_TACHE, STRUCTURES_TACHE,
         PRIORITES } from '../data/schema.js';
import { esc, openModal, closeModal, readForm, toast, isoDay, daysSince, relDay, userName, fmtDate } from '../ui.js';
// ⚠ `valeursProjet` EST LA SEULE TRADUCTION fiche/demande → les champs du
// projet, et elle vit dans un module de DONNÉES : l'importer ici ne crée aucun
// cycle (aucun module de `js/data/` ne dépend d'une page). La recopier aurait
// fait une seconde traduction, et l'écart ne se serait vu que sur un genre de
// fiche — le piège que son propre en-tête décrit.
import { valeursProjet } from '../data/rgd-projet.js';
import { monterElements } from './tache-elements.js';

export const actType = (k) => ACTIVITY_TYPES.find(t => t.key === k) || { label: k, icon: '•' };

// À quelle structure se rattache une tâche : celle choisie sur la tâche, sinon celle
// de l'affaire liée. Une tâche isolée peut donc porter une structure sans affaire.
//
// ⚠ ELLE RECONNAÎT AUSSI LES MODULES — la gestion locative depuis le 05/10/2026
// — et SANS regarder le droit de celui qui lit. Une tâche ne cesse pas d'avoir
// une structure parce qu'on n'a pas le module : elle cesserait d'apparaître, et
// la perte serait muette. C'est à l'écran de décider quelles colonnes il
// propose, pas à cette fonction de décider ce qui existe.
//
// ⚠ L'AFFAIRE, ELLE, RESTE UNE ACTIVITÉ : `deals.activity` n'admet que les
// quatre structures, un module n'a pas d'affaires.
export function structureDe(a) {
  if (a?.activity && STRUCTURES_TACHE[a.activity]) return a.activity;
  const d = a?.deal_id && db.byId('deals', a.deal_id);
  return d?.activity && ACTIVITIES[d.activity] ? d.activity : null;
}

/**
 * Les structures qu'une tâche peut porter, POUR CELUI QUI REGARDE : ses
 * structures, plus les modules dont il a le droit.
 *
 * ⚠ ÉCRITE UNE FOIS, lue par la liste, ses pastilles, le tableau en colonnes et
 * le formulaire de tâche. Quatre copies de « mes structures plus le locatif si
 * j'y ai droit » auraient fini par ne plus s'accorder, et l'écart ne se serait
 * vu que sur un des quatre écrans.
 */
export const structuresDeLUtilisateur = () => [
  ...Object.values(ACTIVITIES).filter(x => scope.activityKeys.includes(x.key)),
  ...Object.values(MODULES_TACHE).filter(m => scope[m.droit] === true),
];

/**
 * Ce que la tâche concerne : la personne, et le projet.
 *
 * Demandé le 01/10/2026, après un essai depuis une fiche projet : « quand je
 * clique sur la tâche ou même en aperçu j'aimerais avoir les informations de la
 * personne concernée et du projet ». Un rappel posé depuis une fiche porte bien
 * son `contact_id`, mais ni la carte ni le formulaire n'en disaient rien — on
 * lisait « Rappeler pour le devis » sans savoir qui rappeler.
 *
 * ⚠ LE TÉLÉPHONE EST LA RAISON D'ÊTRE DE CE BLOC. Une tâche de rappel sans le
 * numéro oblige à ouvrir une autre fiche pour faire la seule chose qu'elle
 * demande.
 *
 * ⚠ LE PROJET N'EST CHERCHÉ QUE POUR RGD, et sans jamais présumer du genre de
 * la ligne : une personne peut être une fiche client ou une demande du site,
 * et les deux ne portent pas les mêmes colonnes — d'où `valeursProjet`.
 */
export function contexteTache(a) {
  if (!a) return null;
  const c = a.contact_id ? db.byId('contacts', a.contact_id) : null;
  const o = a.organisation_id ? db.byId('organisations', a.organisation_id) : null;
  const d = a.deal_id ? db.byId('deals', a.deal_id) : null;

  const personne = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : (o?.name || '');
  const tel = c?.phone || o?.phone || '';
  const mail = c?.email || o?.email || '';

  // La fiche RGD de cette personne, s'il y en a une. On regarde les deux
  // tables : une demande du site n'a pas encore de fiche client.
  let projet = '';
  let fiche = null;
  if (c || o) {
    const colle = (l) => (c && l.contact_id === a.contact_id) || (o && l.organisation_id === a.organisation_id);
    const cli = (db.t('rgd_clients') || []).find(colle);
    const dem = cli ? null : (db.t('rgd_demandes') || []).find(colle);
    fiche = cli ? { genre: 'fiche', ligne: cli } : dem ? { genre: 'demande', ligne: dem } : null;
    if (fiche) {
      const v = valeursProjet(fiche);
      // `types_travaux` arrive en tableau, en JSON ou en texte selon l'âge de
      // la ligne : on ne suppose pas, on regarde.
      const travaux = Array.isArray(v.types_travaux) ? v.types_travaux.join(', ')
        : String(v.types_travaux || '').replace(/^\[|\]$/g, '').replace(/"/g, '').replace(/,/g, ', ');
      projet = [v.type_projet, travaux, v.budget_annonce, v.ville_chantier]
        .map(x => String(x || '').trim()).filter(Boolean).join(' · ');
    }
  }

  return {
    personne, tel, mail, projet,
    ville: c?.city || '',
    affaire: d ? d.title : '',
    // De quoi ouvrir la bonne fiche au clic, sans que ce module ait à
    // connaître les écrans : l'appelant décide quoi en faire.
    ficheRgd: fiche, contact: c, organisation: o, deal: d,
    aQuelqueChose: !!(personne || projet || d),
  };
}

/**
 * Les deux petites marques d'une tâche, communes à la liste et au tableau :
 * l'avancement des sous-tâches et le partage. Le partage dit l'AUTRE personne —
 * « avec X » pour qui l'a partagée, « de X » pour qui la reçoit.
 */
export function marquesTache(a) {
  const l = Array.isArray(a.checklist) ? a.checklist : [];
  const faites = l.filter(x => x?.f === true).length;
  const moi = scope.user?.id;
  const avec = !a.shared_with ? ''
    : a.shared_with === moi ? `de ${userName(a.assignee_id || a.created_by)}` : `avec ${userName(a.shared_with)}`;
  return (l.length ? ` <span class="todo-sous ${faites === l.length ? 'est-complete' : ''}" title="Sous-tâches faites">☑ ${faites}/${l.length}</span>` : '')
    + (avec ? ` <span class="todo-partage" title="Tâche partagée">🤝 ${esc(avec)}</span>` : '');
}

export function activityForm(link = {}, existing = null, onSaved, onClose = null) {
  // On ne confie une tâche qu'à quelqu'un de ses structures — même règle que la
  // messagerie, imposée côté serveur par le déclencheur `tache_destinataire`
  // (migration 20260918160000). La liste ne propose donc que les collègues
  // joignables ; la direction les porte toutes et reste proposée à tout le
  // monde. `scope.users()` sert ailleurs, là où le cloisonnement ne s'applique
  // pas — nommer le responsable d'une affaire, par exemple.
  const users = scope.collegues();
  // ⚠ UNE PERSONNE DÉJÀ POSÉE RESTE PROPOSÉE, même hors de la liste : sinon le
  // `<select>` n'aurait pas son option, et l'enregistrement effacerait en
  // silence un partage que quelqu'un a choisi.
  for (const id of [existing?.assignee_id, existing?.shared_with]) {
    if (id && !users.some(u => u.id === id)) users.push({ id, full_name: userName(id) });
  }
  const spec = [
    { key: 'type', label: 'Type', type: 'select', required: true, half: true, value: 'appel',
      options: [...new Set(ACTIVITY_TYPES.map(t => t.groupe))].map(g => ({
        groupe: g, options: ACTIVITY_TYPES.filter(t => t.groupe === g).map(t => [t.key, `${t.icon} ${t.label}`]),
      })) },
    // Comme pour la structure, un contexte qui désigne déjà quelqu'un (la colonne
    // d'une personne dans la to do list) l'emporte sur le responsable par défaut.
    { key: 'assignee_id', label: 'Responsable', type: 'select', options: users.map(u => [u.id, u.full_name]), required: true, half: true, // Une valeur donnee explicitement fait foi, meme vide : « Envoyer une tache »
    // passe une chaine vide pour forcer le choix du destinataire au lieu de
    // proposer l'utilisateur connecte, ce qui serait le contraire du bouton.
    value: 'assignee_id' in link ? link.assignee_id : scope.user.id },
    { key: 'title', label: 'Intitulé', type: 'text', required: true, placeholder: 'Ex. Relancer le devis' },
    // Le degré de traitement ; vide = tâche ordinaire, rangée à son échéance.
    { key: 'priority', label: 'Degré de traitement', type: 'select', half: true,
      options: PRIORITES.map(p => [p.key, `${p.icon} ${p.label}`]),
      hint: 'À laisser vide pour une tâche ordinaire : elle se range alors à son échéance.' },
    { key: 'due_date', label: 'Échéance', type: 'date', required: true, half: true, value: isoDay() },
    { key: 'due_time', label: 'Heure (optionnel)', type: 'time', half: true },
    { key: 'activity', label: 'Structure', type: 'select', half: true,
      options: structuresDeLUtilisateur().map(a => [a.key, a.label]),
      value: existing?.activity || structureDe({ ...link, ...(existing || {}) }) || '',
      hint: 'À quelle activité du groupe cette tâche appartient.' },
    // ⚠ LE PARTAGE N'EST PAS UN SECOND RESPONSABLE (06/10/2026, demandé par
    // Mickael) : le partagé voit la tâche et peut la modifier — cocher ses
    // sous-tâches —, mais elle reste comptée chez le responsable, et il ne peut
    // pas la supprimer (`peut_supprimer_activity` côté base). Même liste que le
    // responsable, pour la même raison : on ne partage qu'avec quelqu'un de ses
    // structures.
    { key: 'shared_with', label: 'Partagée avec', type: 'select', options: users.map(u => [u.id, u.full_name]) },
    // ⚠ « Notes » N'EST PLUS UN CHAMP : les notes sont devenues des sous-tâches.
    // Une note qui existe encore est portée par `monterElements`, qui la rend à
    // l'enregistrement — sans lui, `readForm` lirait un champ absent et
    // écrirait une note vide.
  ];
  // ⚠ « SUPPRIMER » ET « ANNULER » ÉTAIENT À DIX PIXELS L'UN DE L'AUTRE, DANS
  // LE MÊME HABILLAGE — fond blanc, même bordure, même encre. Mesuré le
  // 01/10/2026 : Supprimer de 16 à 118 px, Annuler de 128 à 213. L'un ferme la
  // fenêtre, l'autre DÉTRUIT la tâche, et il le faisait **sans aucune
  // confirmation**. C'est la cause des tâches « qui s'effacent toutes seules » :
  // il n'y avait pas de hasard, il y avait dix pixels.
  //
  // Trois choses changent, et aucune n'est décorative : le bouton est ROUGE,
  // il est SÉPARÉ des deux autres, et il demande DEUX CLICS.
  // ⚠ LA MISE EN PAGE EST ÉCRITE ICI, LA LECTURE RESTE À `readForm`. C'est la
  // condition pour moderniser sans rien casser : tous les champs gardent leur
  // `name` et leur `required`, donc `readForm(form, spec)` et la validation du
  // navigateur fonctionnent exactement comme avant. `spec` reste la source de
  // vérité de ce qui est lu — on ne fait que le dessiner autrement.
  //
  // ⚠ C'EST LA FORME DU FORMULAIRE DE RENDEZ-VOUS, reprise à dessein (voir
  // `evenement-form.js`, 25/09/2026) : un titre nu en tête, puis des lignes à
  // icône. Deux formulaires du même outil qui posent les mêmes questions dans
  // deux présentations différentes font hésiter à chaque fois.
  const v0 = existing || {};
  const val = (k) => {
    const f = spec.find(x => x.key === k);
    return v0[k] ?? f?.value ?? '';
  };
  const selOptions = (k) => {
    const f = spec.find(x => x.key === k) || {};
    const v = val(k);
    const opt = (o) => {
      const [x, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(x)}" ${String(v) === String(x) ? 'selected' : ''}>${esc(l)}</option>`;
    };
    return (f.options || []).map(o => (o && o.groupe)
      ? `<optgroup label="${esc(o.groupe)}">${(o.options || []).map(opt).join('')}</optgroup>`
      : opt(o)).join('');
  };
  // ⚠ LES TEXTES D'AIDE SONT REVENUS : la première version de cette mise en
  // page les avait perdus en chemin. Ils ne décorent pas — « à laisser vide
  // pour une tâche ordinaire » est la seule phrase qui explique un champ dont
  // la valeur par défaut est l'absence de valeur.
  const ligne = (icone, titre, corps, aide = '') => `<div class="taf-ligne">
    <span class="taf-ico" aria-hidden="true">${icone}</span>
    <div class="taf-champ"><span class="taf-lab">${esc(titre)}</span>${corps}
      ${aide ? `<p class="taf-aide">${esc(aide)}</p>` : ''}</div></div>`;

  // ⚠ LE DEGRÉ DE TRAITEMENT EST EN PASTILLES, PAS EN LISTE DÉROULANTE : il n'a
  // que trois valeurs et c'est le choix qu'on refait le plus souvent. Un
  // `input hidden` porte la valeur, pour que `readForm` ne voie aucune
  // différence avec un `select`.
  // ⚠ « À FAIRE » N'EST PAS PROPOSÉ, ET CE N'EST PAS UN OUBLI : il se range
  // exactement au même endroit qu'une tâche sans degré — `GROUPES` de
  // `today.js` attrape les deux dans le même rang. Offrir deux façons de dire
  // la même chose fait hésiter pour rien. Une tâche qui le porte DÉJÀ le garde,
  // en pastille marquée : on n'efface pas en silence ce que quelqu'un a choisi.
  // Même remède que les budgets hors tranches de la fiche client RGD.
  const prio = val('priority');
  const degres = PRIORITES.filter(x => x.key !== 'afaire' || prio === 'afaire');
  const pastillesPrio = `<input type="hidden" name="priority" value="${esc(prio)}">
    <div class="taf-chips" id="taf-prio">
      <button type="button" class="taf-chip ${!prio ? 'on' : ''}" data-prio="">Ordinaire</button>
      ${degres.map(x => `<button type="button" class="taf-chip p-${esc(x.key)} ${prio === x.key ? 'on' : ''} ${
        x.key === 'afaire' ? 'est-hors-liste' : ''}" data-prio="${esc(x.key)}">${esc(x.icon)} ${esc(x.label)}</button>`).join('')}
    </div>`;

  // ⚠ IL S'AFFICHE AU-DESSUS DU TITRE, pas en bas : on ouvre une tâche de
  // rappel pour savoir QUI rappeler, pas pour relire son intitulé.
  const ctx = existing ? contexteTache(existing) : null;
  const blocCtx = ctx && ctx.aQuelqueChose ? `<section class="taf-ctx">
    ${ctx.personne ? `<p class="taf-ctx-l"><span>👤</span><b>${esc(ctx.personne)}</b>${
      ctx.ville ? ` <span class="muted">${esc(ctx.ville)}</span>` : ''}</p>` : ''}
    ${ctx.tel || ctx.mail ? `<p class="taf-ctx-l"><span>📞</span>${
      ctx.tel ? `<a href="tel:${esc(String(ctx.tel).replace(/\s+/g, ''))}">${esc(ctx.tel)}</a>` : ''}${
      ctx.tel && ctx.mail ? ' · ' : ''}${
      ctx.mail ? `<a href="mailto:${esc(ctx.mail)}">${esc(ctx.mail)}</a>` : ''}</p>` : ''}
    ${ctx.projet ? `<p class="taf-ctx-l"><span>🏠</span>${esc(ctx.projet)}</p>` : ''}
    ${ctx.affaire ? `<p class="taf-ctx-l"><span>📁</span>${esc(ctx.affaire)}</p>` : ''}
    ${ctx.ficheRgd || ctx.deal ? '<button type="button" class="taf-ctx-ouvrir" id="taf-ouvrir">Ouvrir la fiche →</button>' : ''}
  </section>` : '';

  // Miroir de `peut_supprimer_activity` : celui qui n'est là QUE par le partage
  // ne supprime pas — on n'offre pas un bouton que la base refuserait.
  const moi = scope.user?.id;
  const peutSupprimer = !existing || !(existing.shared_with === moi
    && existing.assignee_id !== moi && existing.created_by !== moi);

  const corpsForm = `
    ${blocCtx}
    <input class="taf-titre" type="text" name="title" required autocomplete="off"
      value="${esc(val('title'))}" placeholder="Que faut-il faire ?">
    ${ligne('🏷️', 'Type', `<select name="type" required>${selOptions('type')}</select>`)}
    ${ligne('⚡', 'Degré de traitement', pastillesPrio,
      'Ordinaire suffit dans la plupart des cas : la tâche se range alors à son échéance.')}
    ${ligne('👤', 'Responsable · partagée avec', `<span class="taf-duo taf-duo-egal">
      <select name="assignee_id" required title="Responsable"><option value="">—</option>${selOptions('assignee_id')}</select>
      <select name="shared_with" title="Partagée avec"><option value="">Pas de partage</option>${selOptions('shared_with')}</select>
    </span>`, 'Le partage donne à voir et à modifier la tâche, pas à la supprimer. Elle reste comptée chez le responsable.')}
    ${ligne('📅', 'Échéance', `<span class="taf-duo">
      <input type="date" name="due_date" required value="${esc(val('due_date'))}">
      <input type="time" name="due_time" value="${esc(val('due_time'))}" title="Heure (optionnel)">
    </span>`)}
    ${ligne('🏢', 'Structure', `<select name="activity"><option value="">—</option>${selOptions('activity')}</select>`,
      'À quelle activité du groupe cette tâche appartient. C’est elle qui décide de sa colonne.')}
    <div id="taf-elements" class="taf-elements"></div>
    ${existing ? '' : '<p class="taf-aide taf-apres">Les commentaires s’ouvrent une fois la tâche créée.</p>'}`;

  const m = openModal(existing ? 'Modifier la tâche' : 'Nouvelle tâche', `<form class="form taf" id="act-form">${corpsForm}
    <div class="form-actions">${existing && peutSupprimer ? '<button type="button" class="btn danger left" id="act-del" data-arme="0">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { onClose });
  const form = m.querySelector('#act-form');
  // Les pastilles écrivent dans le champ caché : une seule valeur lue, celle
  // que `readForm` ira chercher.
  form.querySelectorAll('#taf-prio [data-prio]').forEach(b => b.onclick = () => {
    form.querySelector('[name="priority"]').value = b.dataset.prio;
    form.querySelectorAll('#taf-prio [data-prio]').forEach(x => x.classList.toggle('on', x === b));
  });
  // ⚠ LES BLOCS S'OUVRENT AUSSI À LA CRÉATION depuis le 06/10/2026 : sous-tâches
  // et pièces jointes s'y saisissent, les fichiers attendent l'insertion
  // (`envoyerPieces`). Seuls les commentaires restent fermés.
  const elements = monterElements(m.querySelector('#taf-elements'), existing || {});

  form.querySelector('.taf-titre')?.focus();
  // ⚠ IMPORT PARESSEUX : les écrans de fiche importent `activity.js`, les
  // charger ici en tête ferait un cycle. Au clic, le module est déjà là.
  //
  // ⚠ CÔTÉ RGD, C'EST LA FICHE QUI S'OUVRE, PAS LE FORMULAIRE. J'avais lu
  // « la fiche projet de RGD Renova » comme le formulaire de saisie, puis
  // comme la fiche : c'est la **fiche** — celle qui montre le prospect, le
  // projet, les rappels, l'historique et la frise des sept étapes. On arrive
  // d'un rappel pour SAVOIR où en est le dossier ; corriger un champ est un
  // second geste, et la fiche porte déjà son bouton « Modifier ».
  //
  // ⚠ UNE DEMANDE DU SITE ET UNE FICHE CLIENT N'ONT NI LES MÊMES COLONNES NI
  // LA MÊME ÉTAPE : `ouvrirProspectRgd` tranche, et c'est lui qui sait. Cet
  // écran ne charge pas quatre tables pour ouvrir une fenêtre.
  //
  // ⚠ IMPORT PARESSEUX : les écrans de fiche importent `activity.js`, les
  // charger ici en tête ferait un cycle. Au clic, le module est déjà là.
  m.querySelector('#taf-ouvrir')?.addEventListener('click', async () => {
    if (ctx.ficheRgd) {
      const { ouvrirProspectRgd } = await import('./rgd-clients.js');
      // ⚠ LA TÂCHE EST RELUE À L'INSTANT DU RETOUR, pas capturée maintenant :
      // on a pu la modifier entre-temps depuis la fiche (un rappel coché, par
      // exemple), et rouvrir la copie d'il y a deux minutes réafficherait un
      // état périmé. Si elle a disparu, on ne rouvre rien.
      ouvrirProspectRgd(ctx.ficheRgd.ligne, ctx.ficheRgd.genre, onSaved, {
        label: 'Retour à la tâche',
        action: () => {
          const frais = db.byId('activities', existing.id);
          if (frais) activityForm({}, frais, onSaved, onClose);
          else closeModal();
        },
      });
    } else if (ctx.deal) {
      const { openDeal } = await import('./deal.js');
      openDeal(ctx.deal.id, onSaved);
    }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(form, spec);
    // Une colonne uuid ne prend pas la chaîne vide ; et partager avec le
    // responsable lui-même ne veut rien dire.
    if (!v.shared_with || v.shared_with === v.assignee_id) v.shared_with = null;
    v.checklist = elements.checklist();
    v.notes = elements.notes();
    try {
      // ⚠ LA CHECKLIST PART AVEC LE FORMULAIRE, et pas à chaque coche : on
      // coche trois cases d'affilée, écrire à chaque clic ferait trois appels.
      // Les commentaires et les pièces jointes, eux, sont déjà partis — ce sont
      // des ajouts, pas des corrections.
      if (existing) await db.update('activities', existing.id, v);
      // `link` porte les rattachements (affaire, contact…) ; la saisie prime dessus,
      // sinon une clé absente de `link` écraserait ce que l'on vient de choisir.
      // `created_by` : qui envoie la tache. La colonne a auth.uid() pour defaut
      // cote serveur ; on la pose ici pour que le mode demo se comporte pareil.
      else {
        const cree = await db.insert('activities', { ...link, ...v, done: false, created_by: scope.user?.id || null });
        // ⚠ APRÈS l'insertion, jamais avant : un fichier a besoin de
        // l'identifiant. Un dépôt qui échoue est dit, la tâche reste créée.
        const n = await elements.envoyerPieces(cree?.id);
        if (n) toast(`${n} document${n > 1 ? 's joints' : ' joint'}`);
      }
      closeModal(true); toast('Activité enregistrée'); onSaved?.();
    } catch (err) { toast(err.message, 'err'); }
  };
  // ⚠ DEUX CLICS SUR LE MÊME BOUTON, PAS DE `confirm()` : celui de `ui.js`
  // appelle `closeModal(true)` et REMPLACE la fenêtre courante — le formulaire
  // disparaîtrait avec la saisie en cours. Huitième occurrence du piège dans ce
  // dépôt. Le bouton se désarme seul au bout de quatre secondes, pour qu'un
  // bouton rouge oublié ne piège pas le clic suivant.
  const suppr = m.querySelector('#act-del');
  if (suppr) suppr.addEventListener('click', async () => {
    if (suppr.dataset.arme !== '1') {
      suppr.dataset.arme = '1';
      suppr.textContent = 'Confirmer la suppression';
      suppr.classList.add('arme');
      setTimeout(() => {
        if (!suppr.isConnected || suppr.dataset.arme !== '1') return;
        suppr.dataset.arme = '0';
        suppr.textContent = 'Supprimer';
        suppr.classList.remove('arme');
      }, 4000);
      return;
    }
    await db.remove('activities', existing.id);
    closeModal(true); toast('Tâche supprimée'); onSaved?.();
  });
}

export async function toggleActivity(id, done) {
  const a = db.byId('activities', id);
  await db.update('activities', id, { done, done_at: done ? new Date().toISOString() : null });
  // Cocher une tache est une action du dossier, pas un detail d'affichage : la
  // direction doit pouvoir relire ce qu'un charge d'affaires a fait, et quand.
  // Sans cette trace, l'historique montrait les changements d'etape et les
  // notes, mais pas le travail entre les deux.
  //
  // L'evenement s'ecrit ici plutot que dans deal.js : ce module y est deja
  // importe, l'inverse creerait un cycle.
  if (a?.deal_id) {
    await db.insert('events', {
      deal_id: a.deal_id, contact_id: a.contact_id || null, organisation_id: a.organisation_id || null,
      kind: 'system', author_id: scope.user.id,
      body: `${done ? 'Fait' : 'Rouverte'} : ${actType(a.type).label} — ${a.title}`,
    });
  }
}

export function activityRowHtml(a, { showContext = false } = {}) {
  const late = !a.done && a.due_date && daysSince(a.due_date) > 0;
  const t = actType(a.type);
  const struct = structureDe(a);
  let ctx = '';
  if (showContext) {
    const d = a.deal_id && db.byId('deals', a.deal_id);
    const c = a.contact_id && db.byId('contacts', a.contact_id);
    const o = a.organisation_id && db.byId('organisations', a.organisation_id);
    ctx = [d && `<a href="#" data-open-deal="${d.id}">${esc(d.title)}</a>`, c && `${esc(c.first_name)} ${esc(c.last_name)}${c.phone ? ' · ' + esc(c.phone) : ''}`, o && esc(o.name)].filter(Boolean).join(' — ');
  }
  return `<div class="act-row ${a.done ? 'done' : ''} ${struct ? 'struct' : ''}" data-act="${a.id}" ${struct ? `style="--c:${ACTIVITIES[struct].color}"` : ''}>
    <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${a.id}" title="Marquer comme fait">
    <div style="flex:1">
      <div><b>${t.icon} ${esc(a.title)}</b>${struct ? ` <span class="act-struct">${esc(ACTIVITIES[struct].short)}</span>` : ''} <span class="muted small">· ${esc(userName(a.assignee_id))}</span></div>
      ${ctx ? `<div class="small muted">${ctx}</div>` : ''}
      ${a.notes ? `<div class="small muted">${esc(a.notes)}</div>` : ''}
      ${a.shared_with ? `<div class="small muted">🤝 Partagée avec ${esc(userName(a.shared_with))}</div>` : ''}
      <div class="when ${late ? 'late' : ''}">${fmtDate(a.due_date)}${a.due_time ? ' ' + esc(a.due_time) : ''} · ${relDay(a.due_date)}</div>
    </div>
    <button class="icon-btn" data-edit-act="${a.id}" title="Modifier">✎</button>
  </div>`;
}

// Attache les gestionnaires (cocher, modifier) sur un conteneur qui contient des act-row.
export function bindActivityRows(container, onChange, onClose = null) {
  container.querySelectorAll('[data-toggle]').forEach(cb => cb.onchange = async () => { await toggleActivity(cb.dataset.toggle, cb.checked); onChange?.(); });
  container.querySelectorAll('[data-edit-act]').forEach(b => b.onclick = (e) => { e.stopPropagation(); const a = db.byId('activities', b.dataset.editAct); activityForm({}, a, onChange, onClose); });
}

// Prochaine activité ouverte d'une affaire.
export function nextActivity(dealId) {
  return db.t('activities').filter(a => a.deal_id === dealId && !a.done).sort((x, y) => (x.due_date || '').localeCompare(y.due_date || ''))[0] || null;
}
