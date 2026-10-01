// Activités (tâches / RDV) : formulaire, liste, clôture.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITY_TYPES, ACTIVITIES, PRIORITES } from '../data/schema.js';
import { esc, openModal, closeModal, readForm, toast, isoDay, daysSince, relDay, userName, fmtDate } from '../ui.js';
// ⚠ `valeursProjet` EST LA SEULE TRADUCTION fiche/demande → les champs du
// projet, et elle vit dans un module de DONNÉES : l'importer ici ne crée aucun
// cycle (aucun module de `js/data/` ne dépend d'une page). La recopier aurait
// fait une seconde traduction, et l'écart ne se serait vu que sur un genre de
// fiche — le piège que son propre en-tête décrit.
import { valeursProjet } from '../data/rgd-projet.js';

export const actType = (k) => ACTIVITY_TYPES.find(t => t.key === k) || { label: k, icon: '•' };

// À quelle structure se rattache une tâche : celle choisie sur la tâche, sinon celle
// de l'affaire liée. Une tâche isolée peut donc porter une structure sans affaire.
export function structureDe(a) {
  if (a?.activity && ACTIVITIES[a.activity]) return a.activity;
  const d = a?.deal_id && db.byId('deals', a.deal_id);
  return d?.activity && ACTIVITIES[d.activity] ? d.activity : null;
}

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

export function activityForm(link = {}, existing = null, onSaved, onClose = null) {
  // On ne confie une tâche qu'à quelqu'un de ses structures — même règle que la
  // messagerie, imposée côté serveur par le déclencheur `tache_destinataire`
  // (migration 20260918160000). La liste ne propose donc que les collègues
  // joignables ; la direction les porte toutes et reste proposée à tout le
  // monde. `scope.users()` sert ailleurs, là où le cloisonnement ne s'applique
  // pas — nommer le responsable d'une affaire, par exemple.
  const users = scope.collegues();
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
      options: Object.values(ACTIVITIES).filter(a => scope.activityKeys.includes(a.key)).map(a => [a.key, a.label]),
      value: existing?.activity || structureDe({ ...link, ...(existing || {}) }) || '',
      hint: 'À quelle activité du groupe cette tâche appartient.' },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
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

  const corpsForm = `
    ${blocCtx}
    <input class="taf-titre" type="text" name="title" required autocomplete="off"
      value="${esc(val('title'))}" placeholder="Que faut-il faire ?">
    ${ligne('🏷️', 'Type', `<select name="type" required>${selOptions('type')}</select>`)}
    ${ligne('⚡', 'Degré de traitement', pastillesPrio,
      'Ordinaire suffit dans la plupart des cas : la tâche se range alors à son échéance.')}
    ${ligne('👤', 'Responsable', `<select name="assignee_id" required><option value="">—</option>${selOptions('assignee_id')}</select>`)}
    ${ligne('📅', 'Échéance', `<span class="taf-duo">
      <input type="date" name="due_date" required value="${esc(val('due_date'))}">
      <input type="time" name="due_time" value="${esc(val('due_time'))}" title="Heure (optionnel)">
    </span>`)}
    ${ligne('🏢', 'Structure', `<select name="activity"><option value="">—</option>${selOptions('activity')}</select>`,
      'À quelle activité du groupe cette tâche appartient. C’est elle qui décide de sa colonne.')}
    ${ligne('📝', 'Notes', `<textarea name="notes" rows="3" placeholder="Ce qu'il faut savoir avant de s'y mettre…">${esc(val('notes'))}</textarea>`)}`;

  const m = openModal(existing ? 'Modifier la tâche' : 'Nouvelle tâche', `<form class="form taf" id="act-form">${corpsForm}
    <div class="form-actions">${existing ? '<button type="button" class="btn danger left" id="act-del" data-arme="0">Supprimer</button>' : ''}<button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { onClose });
  const form = m.querySelector('#act-form');
  // Les pastilles écrivent dans le champ caché : une seule valeur lue, celle
  // que `readForm` ira chercher.
  form.querySelectorAll('#taf-prio [data-prio]').forEach(b => b.onclick = () => {
    form.querySelector('[name="priority"]').value = b.dataset.prio;
    form.querySelectorAll('#taf-prio [data-prio]').forEach(x => x.classList.toggle('on', x === b));
  });
  form.querySelector('.taf-titre')?.focus();
  // ⚠ IMPORT PARESSEUX : les écrans de fiche importent `activity.js`, les
  // charger ici en tête ferait un cycle. Au clic, le module est déjà là.
  //
  // ⚠ C'EST LA FICHE PROJET QUI S'OUVRE, PAS LA FICHE DE LA PERSONNE
  // (corrigé le 01/10/2026 : « je voudrais que ça ouvre exactement la fiche
  // projet de rgd renova »). La première version appelait `ouvrirFicheRgd`,
  // qui montre le dossier en lecture — alors qu'on vient d'un rappel pour
  // COMPLÉTER le projet. C'est `ficheProjetRgd`, le même formulaire que le
  // bouton « Modifier » de la fiche et que « + Nouvelle demande ».
  //
  // ⚠ IL NE S'OUVRE PAS LUI-MÊME : il se monte dans un élément que l'appelant
  // fournit (voir son en-tête), et c'est à nous d'ouvrir la fenêtre.
  // ⚠ PAS DE `closeModal` AVANT : `openModal` ferme POUR REMPLACEMENT, ce qui
  // n'appelle pas `onClose` — fermer d'abord déclencherait le retour de
  // l'appelant, et sur la to do list cela redessinerait la page sous la
  // fenêtre qu'on est en train d'ouvrir.
  m.querySelector('#taf-ouvrir')?.addEventListener('click', async () => {
    if (ctx.ficheRgd) {
      const { ficheProjetRgd } = await import('./rgd-projet.js');
      const w = openModal(ctx.personne ? `Fiche projet — ${ctx.personne}` : 'Fiche projet',
        '<div id="rgp-hote"></div>', { wide: true });
      ficheProjetRgd({
        dans: w.querySelector('#rgp-hote'),
        cible: ctx.ficheRgd,
        annuler: () => closeModal(),
        apres: () => { closeModal(); toast('Informations enregistrées'); onSaved?.(); },
      });
    } else if (ctx.deal) {
      const { openDeal } = await import('./deal.js');
      openDeal(ctx.deal.id, onSaved);
    }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = readForm(form, spec);
    try {
      if (existing) await db.update('activities', existing.id, v);
      // `link` porte les rattachements (affaire, contact…) ; la saisie prime dessus,
      // sinon une clé absente de `link` écraserait ce que l'on vient de choisir.
      // `created_by` : qui envoie la tache. La colonne a auth.uid() pour defaut
      // cote serveur ; on la pose ici pour que le mode demo se comporte pareil.
      else await db.insert('activities', { ...link, ...v, done: false, created_by: scope.user?.id || null });
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
