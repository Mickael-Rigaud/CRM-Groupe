// Espace BTP Expertise : le cabinet pilote son activité ici, sans quitter le CRM.
// Les écrans lisent les données communes (affaires, contacts, activités) filtrées sur
// l'activité « btp », et deux référentiels qui lui appartiennent : fiches DTU et mails types.
import { db } from '../data/db.js';
import { idsDe, urlAgenda, VUES as VUES_CALENDRIER, CLES_AGENDA, modeEmploi } from '../agenda.js';
import { scope } from '../data/scope.js';
import {
  ACTIVITIES, CHANNELS, weightedAmount, stagesDe, missionDe, estNouveauLead, ORIGINE_PAR_CANAL, ORIGINE_DEFAUT, NIVEAUX_BTP, CAPACITE_BTP,
  HONORAIRES_AMO, MISSIONS_BTP, couleurMission, niveauDe, pointsDe,
  MATRICE_AMO, tauxSuggere, honorairesAmo, PHASES_AMO, FRONTIERE_AMO, FICHE_CHARGE_BTP,
  REMUNERATION_BTP, partRemuneration,
  POSITIONNEMENT_EXPERTISE, TYPOLOGIE_EXPERTISE, OFFRE_EXPERTISE_NOTE, QUALIF_EXPERTISE_V6,
  QUALIF_EXPERTISE_REGLE, niveauExpertise, GRAVITE_EXPERTISE, GRAVITE_REGLE, SPECIALISTES_EXPERTISE,
} from '../data/schema.js';
import {
  esc, eur, daysSince, fmtDate, contactName, dealParty, userName, toast,
  openModal, closeModal, confirm, terms, hit,
  searchInput, bindSearch, restoreFocus, csvDownload, marqueResponsable,
} from '../ui.js';
import { openDeal, dealForm, assignerResponsable, candidatsResponsable } from './deal.js';
import { contactForm, openContact } from './contacts.js';
import { orgForm, openOrg } from './organisations.js';
import { coquilleEspace, poserEspace, kpiEspace, archiverFiche, restaurerFiche, supprimerDefinitivement, estActive } from './espace.js';
import {
  CROCHETS, champsDe, remplir, donneesDossier, emailDu,
  mailHtml, URL_LOGO, URL_LOGO_PUBLIC, ouvrirCompose, telechargerEml, copierMiseEnPage,
} from './btp-mail.js';
import { ficheDecouverteAmo, champsHonoraires, resultatsHonoraires } from './btp-amo.js';
import { ficheDecouverteExpertise } from './btp-expertise.js';
import { imprimerFicheDeal } from './btp-fiche.js';

const KEY = 'btp';
const act = () => ACTIVITIES[KEY];
const isBtp = (row) => !!row && (row.activities || []).includes(KEY);
const deals = () => scope.deals().filter(d => d.activity === KEY);
const activities = () => {
  const ids = new Set(deals().map(d => d.id));
  return scope.activities().filter(a => (a.deal_id && ids.has(a.deal_id))
    || isBtp(db.byId('contacts', a.contact_id)) || isBtp(db.byId('organisations', a.organisation_id)));
};

// Les cinq écrans du cabinet, présentés comme le tableau de bord RGD Renova :
// un menu vertical à gauche, le contenu à droite. « BTP Expertise » reste une ligne
// du menu Pilotage du CRM ; cette coquille vit à l'intérieur de la page.
const ONGLETS = [
  { hash: '#/btp', label: 'Tableau de bord' },
  // Deux métiers, deux déroulés : chacun son écran, sous un intitulé commun.
  { label: 'Missions', sous: [
    { hash: '#/btp/expertise', label: 'Expertise' },
    { hash: '#/btp/amo', label: 'AMO' },
  ] },
  { hash: '#/btp/charges', label: "Chargés d'affaires" },
  { hash: '#/btp/base', label: 'Base de données' },
  { hash: '#/btp/dtu', label: 'DTU' },
  { hash: '#/btp/facturation', label: 'Facturation' },
  { hash: '#/btp/mails', label: 'Mails & modèles' },
];
// Enveloppe un écran dans la coquille commune aux espaces de structure.
const cadre = (actif, titre, corps) => coquilleEspace({
  actif, titre, corps,
  cle: KEY, marque: act().label, baseline: 'Expertise et conseil bâtiment', onglets: ONGLETS,
});
const poser = poserEspace;

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

// Ouvrir une affaire depuis n'importe quelle carte, ligne ou pastille de l'écran.
function lierAffaires(root, apres) {
  root.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, apres));
}

// Les commandes de l'agenda : choix de la vue, raccordement et détachement.
function lierAgenda(root, apres) {
  root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { retenirVue(b.dataset.vue); apres(); });
  root.querySelector('#cal-save')?.addEventListener('click', async () => {
    const v = root.querySelector('#cal-id').value.trim();
    if (!v) return toast("Collez l'identifiant du calendrier", 'warn');
    try {
      if (db.setting(CLES_AGENDA.btp) !== undefined) await db.update('settings', CLES_AGENDA.btp, { value: v });
      else await db.insert('settings', { key: CLES_AGENDA.btp, value: v });
      toast('Agenda raccordé'); apres();
    } catch (err) { toast(err.message, 'err'); }
  });
  root.querySelector('#cal-edit')?.addEventListener('click', async () => {
    try { await db.update('settings', CLES_AGENDA.btp, { value: '' }); toast('Calendrier détaché'); apres(); }
    catch (err) { toast(err.message, 'err'); }
  });
}

// Trois blocs : les chiffres clés, la pipeline des missions, l'agenda Google du cabinet.
const kpi = kpiEspace;

// L'agenda du cabinet, tenu dans Google Agenda et affiché ici. L'identifiant du
// calendrier est rangé dans les réglages du CRM, pas dans le code : le dépôt est public.
// Vue semaine par défaut, le choix reste d'une visite à l'autre.
const CLE_VUE = 'crm_btp_agenda_vue';
// Les vues de l'espace BTP : le cabinet raisonne à la semaine, pas à la journée.
const VUES_AGENDA = VUES_CALENDRIER.filter(([v]) => v !== 'DAY');
const TITRES_VUE = { WEEK: 'Agenda de la semaine', MONTH: 'Agenda du mois', AGENDA: 'Prochains rendez-vous' };

const vueChoisie = () => { try { return localStorage.getItem(CLE_VUE) || 'WEEK'; } catch { return 'WEEK'; } };
const retenirVue = (v) => { try { localStorage.setItem(CLE_VUE, v); } catch { /* navigation privée */ } };

const idsAgenda = () => idsDe('btp');

function agenda() {
  const ids = idsAgenda();
  if (!ids.length) {
    return `<div class="card">
      <div class="agenda-head"><span class="agenda-ico">📅</span><h2>Agenda</h2></div>
      <div class="btp-setup">
        <p><b>L&rsquo;agenda Google du cabinet n&rsquo;est pas encore raccordé.</b></p>
        ${modeEmploi()}
        ${scope.isDirection ? `<div class="form">
          <div class="field"><label>Identifiant du calendrier</label><input id="cal-id" placeholder="identifiant@example.com">
            <div class="small muted" style="margin-top:4px">Plusieurs agendas ? Collez leurs identifiants séparés par une virgule — chacun gardera sa couleur.</div></div>
          <div class="form-actions"><button class="btn" id="cal-save">Enregistrer</button></div>
        </div>` : '<p class="muted small">La direction peut le renseigner depuis cet écran.</p>'}
        <p class="muted small">Chaque personne verra l&rsquo;agenda avec son propre compte Google, après avoir été ajoutée au partage. Rien n&rsquo;est rendu public, et aucun mot de passe n&rsquo;est demandé.</p>
      </div>
    </div>`;
  }

  const vue = vueChoisie();
  return `<div class="card agenda-card">
    <div class="agenda-head">
      <span class="agenda-ico">📅</span>
      <h2>${TITRES_VUE[vue] || 'Agenda'}</h2>
      <div class="seg agenda-vues">${VUES_AGENDA.map(([v, l]) => `<button type="button" data-vue="${v}" class="${v === vue ? 'active' : ''}">${l}</button>`).join('')}</div>
      <span class="grow"></span>
      ${scope.isDirection ? '<button type="button" class="btn ghost sm" id="cal-edit">Changer de calendrier</button>' : ''}
      <a class="btn ghost sm" href="https://calendar.google.com/calendar/r/week" target="_blank" rel="noopener">Ouvrir dans Google Agenda ↗</a>
    </div>
    <div class="agenda-cadre agenda-${vue.toLowerCase()}">
      <iframe src="${esc(urlAgenda(ids, vue))}" title="Agenda BTP Expertise" loading="lazy"></iframe>
    </div>
    <p class="muted small">Cet agenda est celui de Google : ce qui est modifié là-bas apparaît ici, et inversement. Si le cadre reste vide, votre adresse n&rsquo;a pas encore été ajoutée au partage du calendrier, ou votre navigateur refuse la mémorisation des sites affichés dans un autre site.</p>
  </div>`;
}

// ---------------------------------------------------------------- Champs de l'espace
// Tous les formulaires du cabinet ont la même allure : des champs en grille, un
// intitulé court en capitales au-dessus, et les petits choix posés sur un segment
// plutôt que cachés dans une liste déroulante — un « Manuel / Automatique » se lit
// et se change d'un geste, pas en deux clics et un déroulé.
//
// La grille reste dans un <form> : la validation du navigateur continue de jouer sur
// les champs requis, et les gestionnaires d'envoi existants n'ont pas à changer.
// `lireGrille` rend le même objet que readForm, aux segments près.

// Un choix tient sur un segment s'il est court et peu nombreux ; au-delà, une liste
// déroulante reste plus lisible qu'une rangée de boutons qui s'enroule.
const tientSurUnSegment = (f) => f.type === 'select'
  && (f.options || []).length <= 3
  && f.options.every(o => String(Array.isArray(o) ? o[1] : o).length <= 16);

function champBtp(f, vals) {
  const v = vals[f.key] ?? f.value ?? '';
  const classe = `mail-champ ${f.half ? '' : 'plein'}`;
  const titre = `<span>${esc(f.label)}${f.required ? ' *' : ''}</span>`;
  const aide = f.hint ? `<em class="mf-champ-aide">${esc(f.hint)}</em>` : '';
  const seg = (options, actif) => `<div class="mf-seg" data-seg="${esc(f.key)}">${options.map(([val, lbl]) =>
    `<button type="button" data-val="${esc(val)}" class="${String(val) === String(actif) ? 'on' : ''}">${esc(lbl)}</button>`).join('')}</div>`;

  if (f.type === 'checkbox') return `<div class="${classe}">${titre}${seg([['1', 'Oui'], ['', 'Non']], v ? '1' : '')}${aide}</div>`;
  if (tientSurUnSegment(f)) {
    return `<div class="${classe}">${titre}${seg(f.options.map(o => (Array.isArray(o) ? o : [o, o])), v)}${aide}</div>`;
  }
  if (f.type === 'select') {
    return `<label class="${classe}">${titre}
      <select name="${esc(f.key)}" ${f.required ? 'required' : ''}>
        <option value="">—</option>
        ${(f.options || []).map(o => { const [val, lbl] = Array.isArray(o) ? o : [o, o];
          return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lbl)}</option>`; }).join('')}
      </select>${aide}</label>`;
  }
  if (f.type === 'textarea') {
    return `<label class="${classe}">${titre}
      <textarea name="${esc(f.key)}" rows="${f.rows || 3}" ${f.required ? 'required' : ''}
        ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${esc(v)}</textarea>${aide}</label>`;
  }
  return `<label class="${classe}">${titre}
    <input type="${f.type || 'text'}" name="${esc(f.key)}" value="${esc(v)}" ${f.required ? 'required' : ''}
      ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${aide}</label>`;
}

const grilleBtp = (spec, vals = {}) => `<div class="mf-grille">${spec.map(f => champBtp(f, vals)).join('')}</div>`;

// Les segments ne sont pas des champs de formulaire : il faut les rendre cliquables,
// et les relire à part.
function lierSegments(racine) {
  racine.querySelectorAll('[data-seg]').forEach(groupe => {
    groupe.querySelectorAll('button').forEach(b => b.onclick = () => {
      groupe.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  });
}

function lireGrille(racine, spec) {
  const out = {};
  for (const f of spec) {
    const choisi = racine.querySelector(`[data-seg="${f.key}"] button.on`);
    if (choisi) {
      out[f.key] = f.type === 'checkbox' ? choisi.dataset.val === '1' : choisi.dataset.val;
      continue;
    }
    const el = racine.querySelector(`[name="${f.key}"]`);
    if (!el) continue;
    out[f.key] = f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
  }
  return out;
}

// ---------------------------------------------------------------- Le réseau et ses missions
// Les affaires vivantes : ouvertes, plus les gagnées encore en réalisation. C'est ce
// qui occupe réellement le réseau — une affaire perdue ou livrée ne pèse plus rien.
const vivantes = () => {
  const a = act();
  const all = deals();
  return all.filter(d => d.status === 'open')
    .concat(all.filter(d => d.status === 'won' && a.stages.find(x => x.key === d.stage)?.delivery))
    .filter((d, i, t) => t.indexOf(d) === i);
};

// Une pipeline par métier : l'expertise et l'AMO n'ont pas le même déroulé, les mélanger
// dans un seul kanban donnerait des colonnes vides une fois sur deux.
const pipelineDe = (mission) => {
  const siennes = vivantes().filter(d => missionDe(d) === mission);
  const colonnes = stagesDe(KEY, mission).map(st => {
    const cartes = siennes.filter(d => d.stage === st.key);
    return { st, cartes, somme: cartes.reduce((t, d) => t + (Number(d.amount) || 0), 0) };
  });
  const ouvertes = siennes.filter(d => d.status === 'open');
  return {
    siennes, colonnes,
    // Deux lectures du même portefeuille : le total des montants, et ce même total
    // pondéré par la probabilité de chaque étape. Les deux libellés ne se confondent pas.
    potentiel: ouvertes.reduce((t, d) => t + (Number(d.amount) || 0), 0),
    pondere: ouvertes.reduce((t, d) => t + weightedAmount(d), 0),
  };
};

// Expertise et AMO se distinguent a l'oeil partout ou elles se cotoient : le bleu de
// la structure pour l'expertise, le vert pour l'AMO. Meme code sur les cartes, les
// listes, les pastilles et la repartition du CA.
const carteAffaire = (d) => {
  const n = niveauDe(d);
  return `<button type="button" class="esp-card-deal btp-mission" style="${teinteMission(missionDe(d))}" data-deal="${d.id}">
    <b>${esc(d.title)}</b>
    <span class="muted">${esc(dealParty(d))}</span>
    ${n ? `<span class="btp-niveau">${esc(n.label)} · ${n.points} pt${n.points > 1 ? 's' : ''}</span>` : ''}
    ${d.amount ? `<span class="esp-card-amount">${eur(d.amount)}</span>` : ''}
  </button>`;
};

// La pastille d'un metier, a poser devant un intitule.
const marqueMission = (m) => `<i class="btp-puce" style="background:${couleurMission(m).couleur}" title="${esc(couleurMission(m).label)}"></i>`;
// Les couleurs d'un metier, posees en variables pour que le CSS s'en serve.
const teinteMission = (m) => { const c = couleurMission(m); return `--m:${c.couleur};--m-clair:${c.clair};--m-encre:${c.encre}`; };

const kanbanHtml = (colonnes) => `<div class="esp-kanban">${colonnes.map(({ st, cartes, somme }) => `
  <div class="esp-col">
    <div class="esp-col-head"><b>${esc(st.label)}</b><span>${cartes.length}</span></div>
    <div class="esp-col-sum">${somme ? eur(somme) : '—'}</div>
    <div class="esp-col-body">${cartes.map(carteAffaire).join('') || '<div class="esp-col-vide">—</div>'}</div>
  </div>`).join('')}</div>`;

const MISSIONS = {
  expertise: { titre: 'Expertise', hash: '#/btp/expertise' },
  amo: { titre: 'AMO', hash: '#/btp/amo' },
};

// La charge d'un chargé d'affaires, au sens du manuel : la somme des points de ses
// missions vivantes. Le plafond est structurel — il dit ce que la personne porte, pas
// ce qu'elle fait aujourd'hui.
function chargeDe(userId) {
  const siennes = vivantes().filter(d => d.owner_id === userId);
  const points = siennes.reduce((t, d) => t + pointsDe(d), 0);
  const amo = siennes.filter(d => missionDe(d) === 'amo');
  const anneeEnCours = String(new Date().getFullYear());
  const ca = deals().filter(d => d.owner_id === userId && d.status !== 'lost'
    && (d.won_at || d.stage_changed_at || d.created_at || '').slice(0, 4) === anneeEnCours
    && act().stages.find(x => x.key === d.stage)?.delivery)
    .reduce((t, d) => t + (Number(d.amount) || 0), 0);
  const sature = points >= CAPACITE_BTP.points || amo.length >= CAPACITE_BTP.amoActives;
  // Sans niveau renseigné, une mission ne pèse aucun point : on le signale plutôt que
  // d'afficher une charge faussement basse.
  const sansNiveau = siennes.filter(d => !niveauDe(d)).length;
  const expertises = siennes.filter(d => missionDe(d) === 'expertise');
  const pointsDeLot = (lot) => lot.reduce((t, d) => t + pointsDe(d), 0);
  return {
    siennes, points, amo, ca, sature, sansNiveau,
    expertises: expertises.length,
    ptsExpertise: pointsDeLot(expertises),
    ptsAmo: pointsDeLot(amo),
  };
}

const chargesDAffaires = () => scope.users().filter(u => (u.activities || []).includes(KEY));

// ---------------------------------------------------------------- Tableau de bord
export const btpHomePage = {
  title: () => 'BTP Expertise',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);

    const draw = () => {
      const a = act();
      const all = deals();
      const open = all.filter(d => d.status === 'open');
      const enCours = all.filter(d => a.stages.find(s => s.key === d.stage)?.delivery && d.status !== 'lost');
      const nouveaux = all.filter(d => ['lead', 'rdv1'].includes(d.stage) && d.status === 'open');
      const anneeEnCours = String(new Date().getFullYear());
      const gagnees = all.filter(d => d.status !== 'lost' && a.stages.find(x => x.key === d.stage)?.delivery
        && (d.won_at || d.stage_changed_at || d.created_at || '').slice(0, 4) === anneeEnCours);
      const caAnnee = gagnees.reduce((s, d) => s + (Number(d.amount) || 0), 0);

      // Le CA signé par métier : c'est la question que pose le manuel — ce que pèse
      // l'AMO à côté de l'expertise, maintenant que le cabinet mène les deux.
      const caDe = (m) => gagnees.filter(d => missionDe(d) === m).reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const caExp = caDe('expertise');
      const caAmo = caDe('amo');
      const part = (v) => (caAnnee ? Math.round((v / caAnnee) * 100) : 0);

      // Le récapitulatif d'une pipeline : ses étapes en une ligne, et le lien vers l'écran
      // du métier, où elle se déplie en entier.
      const recap = (mission) => {
        const { siennes, colonnes, potentiel } = pipelineDe(mission);
        const m = MISSIONS[mission];
        return `<div class="card btp-recap">
          <div class="card-head"><h2>Pipeline ${esc(m.titre)}</h2>
            <span class="grow"></span>
            <a class="btn ghost sm" href="${m.hash}">Voir tout →</a>
          </div>
          <div class="btp-recap-etapes">${colonnes.map(({ st, cartes }) => `
            <a class="btp-recap-etape" href="${m.hash}">
              <span>${esc(st.label)}</span><b>${cartes.length}</b>
            </a>`).join('')}</div>
          <div class="btp-recap-pied">${siennes.length} mission${siennes.length > 1 ? 's' : ''} en cours · ${eur(potentiel)} de CA potentiel HT</div>
        </div>`;
      };

      const gens = chargesDAffaires().map(u => ({ u, ...chargeDe(u.id) }))
        .sort((x, y) => y.points - x.points || x.u.full_name.localeCompare(y.u.full_name, 'fr'));

      root.innerHTML = cadre('#/btp', 'Tableau de bord', `
        <div class="esp-kpis">
          ${kpi({ label: 'Nouvelles demandes', valeur: nouveaux.length, sous: 'nouveau et RDV 1', icone: '📨', ton: 'accent', href: '#/pipeline/btp' })}
          ${kpi({ label: `CA signé ${anneeEnCours}`, valeur: eur(caAnnee), sous: `${gagnees.length} mission${gagnees.length > 1 ? 's' : ''} engagée${gagnees.length > 1 ? 's' : ''}`, icone: '📈', ton: 'green', href: '#/btp/facturation' })}
          ${kpi({ label: 'Missions en cours', valeur: enCours.length, sous: 'expertise et AMO confondues', icone: '🏗', ton: 'amber', href: '#/btp/expertise' })}
          ${kpi({ label: 'Charge du réseau', valeur: `${gens.reduce((t, g) => t + g.points, 0)} / ${gens.length * CAPACITE_BTP.points}`, sous: `${gens.length} chargé${gens.length > 1 ? 's' : ''} d'affaires`, icone: '🎯', ton: 'accent', href: '#/btp/charges' })}
        </div>

        <div class="btp-duo">${recap('expertise')}${recap('amo')}</div>

        <div class="btp-duo">
          <div class="card">
            <div class="card-head"><h2>Charge des chargés d'affaires</h2>
              <span class="grow"></span>
              <a class="btn ghost sm" href="#/btp/charges">Voir l'équipe →</a>
            </div>
            <div class="table-wrap"><table>
              <thead><tr>
                <th>Chargé d'affaires</th><th>Charge</th>
                <th class="num" style="color:${couleurMission('expertise').encre}">${marqueMission('expertise')}Expertise</th>
                <th class="num" style="color:${couleurMission('amo').encre}">${marqueMission('amo')}AMO</th>
                <th class="num">CA ${esc(anneeEnCours)}</th>
              </tr></thead>
              <tbody>${gens.map(g => ligneCharge(g)).join('')
                || `<tr><td colspan="5"><div class="empty">Aucun chargé d'affaires sur BTP Expertise. Cochez l'activité sur leur profil, dans Paramètres.</div></td></tr>`}</tbody>
            </table></div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Répartition du CA ${esc(anneeEnCours)}</h2></div>
            <div class="btp-ca">
              ${anneau(caExp, caAmo, caAnnee)}
              <div class="btp-ca-parts">
                ${[['expertise', caExp], ['amo', caAmo]].map(([m, v]) => `
                  <div class="btp-ca-part" style="${teinteMission(m)}">
                    <div class="btp-ca-lbl">${marqueMission(m)}${esc(couleurMission(m).label)}<span class="grow"></span><b>${eur(v)}</b><em>${part(v)} %</em></div>
                    <div class="btp-ca-bar"><i style="width:${part(v)}%;background:var(--m)"></i></div>
                  </div>`).join('')}
              </div>
            </div>
            ${!caAnnee ? '<p class="muted small">Aucune mission engagée cette année : la répartition apparaîtra dès la première.</p>' : ''}
          </div>
        </div>

        ${agenda()}`);

      lierAffaires(root, draw);
      lierAgenda(root, draw);
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// L'anneau de repartition, en SVG : deux arcs dont la longueur suit la part de chaque
// metier. Pas de bibliotheque — c'est un cercle et deux traits, et ca evite de charger
// Chart.js pour deux valeurs.
function anneau(caExp, caAmo, total) {
  const R = 52, C = 2 * Math.PI * R;
  const pExp = total ? caExp / total : 0;
  const cE = couleurMission('expertise').couleur;
  const cA = couleurMission('amo').couleur;
  return `<svg class="btp-anneau" viewBox="0 0 130 130" role="img" aria-label="Répartition du chiffre d'affaires entre expertise et AMO">
    <circle cx="65" cy="65" r="${R}" fill="none" stroke="var(--card-2)" stroke-width="16"></circle>
    ${total ? `
      <circle cx="65" cy="65" r="${R}" fill="none" stroke="${cA}" stroke-width="16"
              stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 65 65)"></circle>
      <circle cx="65" cy="65" r="${R}" fill="none" stroke="${cE}" stroke-width="16"
              stroke-dasharray="${C * pExp} ${C}" stroke-dashoffset="0" transform="rotate(-90 65 65)"
              stroke-linecap="${pExp > 0 && pExp < 1 ? 'butt' : 'round'}"></circle>` : ''}
    <text x="65" y="61" text-anchor="middle" class="btp-anneau-val">${total ? eur(total) : '—'}</text>
    <text x="65" y="78" text-anchor="middle" class="btp-anneau-lbl">signé</text>
  </svg>`;
}

// Une ligne du tableau de charge : la jauge dit d'un coup d'œil qui peut encore prendre.
function ligneCharge(g) {
  const pct = (v) => Math.min(100, (v / CAPACITE_BTP.points) * 100);
  return `<tr>
    <td><b>${esc(g.u.full_name)}</b></td>
    <td class="btp-col-charge">
      <div class="btp-jauge-val">${g.points} / ${CAPACITE_BTP.points} pts${g.sansNiveau ? ` <span class="muted small" title="${g.sansNiveau} mission(s) sans niveau renseigné : elles ne pèsent aucun point">· ${g.sansNiveau} sans niveau</span>` : ''}</div>
      <div class="btp-jauge btp-jauge-duo">
        <i style="width:${pct(g.ptsExpertise)}%;background:${couleurMission('expertise').couleur}" title="Expertise : ${g.ptsExpertise} pts"></i>
        <i style="width:${pct(g.ptsAmo)}%;background:${couleurMission('amo').couleur}" title="AMO : ${g.ptsAmo} pts"></i>
      </div>
    </td>
    <td class="num"><span class="btp-compteur" style="${teinteMission('expertise')}">${g.expertises}<em>${g.ptsExpertise} pts</em></span></td>
    <td class="num"><span class="btp-compteur ${g.amo.length >= CAPACITE_BTP.amoActives ? 'plein' : ''}" style="${teinteMission('amo')}">${g.amo.length} / ${CAPACITE_BTP.amoActives}<em>${g.ptsAmo} pts</em></span></td>
    <td class="num">${g.ca ? eur(g.ca) : '—'}</td>
  </tr>`;
}

// ---------------------------------------------------------------- Le référentiel AMO
// Le manuel opérationnel V5 porte la doctrine du cabinet : le catalogue, la façon de
// fixer un taux, le déroulé d'une mission, la limite à ne pas franchir. Elle n'avait
// aucune place dans le CRM — il fallait rouvrir le PDF. Ces blocs la mettent sous les
// yeux là où on s'en sert, sur l'écran des missions AMO.

// 3. Le catalogue : les trois niveaux d'AMO et ce qu'ils pèsent. Les honoraires n'y
// figurent pas — ils ne se lisent pas par niveau mais par montant de travaux, et le
// calculateur plus bas y répond mieux qu'une colonne répétée trois fois.
const catalogueAmo = () => {
  const lignes = NIVEAUX_BTP.filter(n => n.mission === 'amo');
  return `<div class="card btp-ref" style="${teinteMission('amo')}">
    <div class="card-head"><h2>Catalogue AMO</h2>
      <span class="grow"></span>
      <span class="muted small">Manuel V5 &middot; §3</span>
    </div>
    <p class="btp-ref-sous">Les trois niveaux de mission, et ce que chacun pèse dans la capacité d'un chargé d'affaires.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Niveau interne</th><th>Profil de mission</th><th class="num">Points</th></tr></thead>
      <tbody>${lignes.map(n => `<tr>
        <td>${marqueMission('amo')}<b>${esc(n.label)}</b></td>
        <td class="small">${esc(n.contenu)}</td>
        <td class="num"><b class="btp-pts">${n.points}</b></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="btp-ref-phrase">« Honoraires de ${esc(HONORAIRES_AMO.taux)}, selon le montant, la durée, la complexité
      et le niveau d'accompagnement. Minimum d'honoraires : ${eur(HONORAIRES_AMO.minimum)} HT. »</p>
  </div>`;
};

// 4. La matrice. Un tableau ne dit pas de lui-même qu'il se clique : chaque case porte
// donc une pastille à cocher, et la consigne est posée en tête, pas en légende.
const matriceAmo = (scores) => {
  const choisis = scores.filter(v => v !== null).length;
  const total = MATRICE_AMO.criteres.length;
  return `<div class="card btp-ref" style="${teinteMission('amo')}">
    <div class="card-head"><h2>Matrice interne des critères</h2>
      <span class="grow"></span>
      <span class="muted small">Manuel V5 &middot; §4</span>
    </div>
    <p class="btp-ref-sous">${esc(MATRICE_AMO.intro)}</p>
    <p class="btp-ref-action">
      <b>Cochez une case par ligne</b> — le score et le taux se calculent juste en dessous.
      <span>${choisis} sur ${total}</span>
    </p>
    <div class="table-wrap"><table class="btp-matrice">
      <thead><tr><th>Critère</th><th>0 point</th><th>1 point</th><th>2 points</th></tr></thead>
      <tbody>${MATRICE_AMO.criteres.map((c, i) => `<tr class="${scores[i] === null ? 'a-coter' : ''}">
        <th scope="row">${esc(c.label)}</th>
        ${c.valeurs.map((v, n) => `<td class="choix ${scores[i] === n ? 'on' : ''}" data-crit="${i}" data-score="${n}"
          role="radio" aria-checked="${scores[i] === n}" tabindex="0">
          <span class="btp-coche"></span>${esc(v)}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">${choisis ? "Recliquer une case cochée l'annule." : `Les ${total} lignes sont à coter.`}</p>
  </div>`;
};

// 4 bis. Le score, le taux qu'il commande, et ce que ce taux donne en euros. Le barème
// d'exemples du manuel a disparu au profit du calculateur : il répond à la même
// question avec le vrai montant du dossier plutôt qu'avec sept montants ronds.
const scoreComplexite = (scores, travaux, tauxChoisi) => {
  const totalPts = scores.reduce((t, v) => t + (v ?? 0), 0);
  const choisis = scores.filter(v => v !== null).length;
  const complet = choisis === MATRICE_AMO.criteres.length;
  const manque = MATRICE_AMO.criteres.length - choisis;
  const palier = tauxSuggere(totalPts);
  return `<div class="card btp-ref" style="${teinteMission('amo')}">
    <div class="card-head"><h2>Score de complexité</h2>
      <span class="grow"></span>
      ${choisis ? '<button type="button" class="btn ghost sm" id="mx-raz">Effacer la cotation</button>' : ''}
      <span class="muted small">Manuel V5 &middot; §4</span>
    </div>

    <div class="btp-score">
      <div class="btp-score-val ${complet ? 'plein' : ''}">
        <b>${totalPts}</b><span>points de complexité sur 10</span>
      </div>
      <span class="btp-score-fleche" aria-hidden="true">→</span>
      <div class="btp-score-taux">
        ${choisis ? `<b>${palier.taux} %</b><span>${esc(palier.regle)}</span>`
          : '<b class="muted">—</b><span>Cotez les critères ci-dessus</span>'}
      </div>
    </div>
    ${choisis && !complet ? `<p class="btp-ref-manque">${manque} critère${manque > 1 ? 's' : ''} encore à coter : ce taux n'est pas définitif.</p>` : ''}

    <div class="btp-score-duo">
      <div class="table-wrap"><table>
        <thead><tr><th class="num">Score</th><th class="num">Taux</th><th>Règle</th></tr></thead>
        <tbody>${MATRICE_AMO.paliers.map(p => `<tr class="${choisis && p === palier ? 'btp-palier-on' : ''}">
          <td class="num">${p.min} à ${p.max}</td>
          <td class="num"><b>${p.taux} %</b></td>
          <td class="small">${esc(p.regle)}</td>
        </tr>`).join('')}</tbody>
      </table></div>

      <div class="btp-calc">
        <h3 class="btp-ref-titre">Calculateur d'honoraires</h3>
        ${champsHonoraires({ travaux, taux: tauxChoisi ?? (scores.some(x => x !== null) ? tauxSuggere(scores.reduce((t, x) => t + (x ?? 0), 0)).taux : '') })}
        <div id="hono-res">${resultatHonoraires(scores, travaux, tauxChoisi)}</div>
      </div>
    </div>
    <p class="btp-ref-garde">${esc(MATRICE_AMO.reserve)}</p>
  </div>`;
};

// Le résultat seul : il se redessine à chaque frappe, sans refaire toute la page —
// sans quoi le champ perdrait le curseur à chaque chiffre saisi.
// Le taux suit la cotation tant qu'on n'y touche pas ; il reste libre ensuite, comme
// le manuel le prévoit avec son taux final distinct du taux suggéré.
function resultatHonoraires(scores, travaux, tauxChoisi) {
  const cotes = scores.filter(v => v !== null).length;
  const sug = cotes ? tauxSuggere(scores.reduce((t, v) => t + (v ?? 0), 0)).taux : null;
  return resultatsHonoraires(travaux, tauxChoisi ?? sug, sug);
}

// 5. Les phases. Le poids sert aussi de clé de facturation, d'où la barre : on voit
// tout de suite que l'accompagnement travaux pèse le tiers de la mission.
const phasesAmo = () => `<div class="card btp-ref" style="${teinteMission('amo')}">
  <div class="card-head"><h2>Phases d'accompagnement</h2>
    <span class="grow"></span>
    <span class="muted small">Manuel V5 &middot; §5</span>
  </div>
  <ol class="btp-phases">${PHASES_AMO.map(p => {
    const et = p.etape && act().stages.find(s => s.key === p.etape);
    return `<li class="btp-phase">
      <span class="btp-phase-num">${p.num}</span>
      <div class="btp-phase-corps">
        <b>${esc(p.label)}</b>
        ${et ? `<span class="btp-phase-etape">Étape du pipeline&nbsp;: ${esc(et.label)}</span>` : ''}
        <span class="btp-phase-txt">${esc(p.contenu)}</span>
      </div>
      <div class="btp-phase-poids">
        <b>${p.poids}&nbsp;%</b>
        <i style="width:${(p.poids / 35) * 100}%"></i>
      </div>
    </li>`;
  }).join('')}</ol>
  <p class="muted small">Les six poids font 100 % : ils servent de clé de facturation par phase.</p>
</div>`;

// 6. La limite à ne pas franchir. Elle est ici parce qu'elle se joue au moment du
// devis, pas au moment du litige.
const frontiereAmo = () => `<div class="card btp-ref btp-garde" style="${teinteMission('amo')}">
  <div class="card-head"><h2>Frontière AMO / maîtrise d'œuvre</h2>
    <span class="grow"></span>
    <span class="muted small">Manuel V5 &middot; §6</span>
  </div>
  <ul class="btp-regles">${FRONTIERE_AMO.regles.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
  <p class="btp-ref-garde"><b>Référence de travail&nbsp;:</b> ${esc(FRONTIERE_AMO.reference)}</p>
</div>`;

// 13. Le partage des honoraires. Deux clés selon l'origine du dossier : un client que
// le cabinet a apporté ne se partage pas comme un client que le chargé d'affaires
// amène lui-même — et c'est toujours l'apporteur qui prend la plus grosse part.
// Les taux et les montants viennent tous de REMUNERATION_BTP : rien n'est écrit en
// dur ici, changer la clé dans schema.js suffit à refaire le tableau.
const modeleRemuneration = () => {
  const o = REMUNERATION_BTP.origines;
  return `<div class="card btp-ref">
    <div class="card-head"><h2>Modèle de rémunération</h2>
      <span class="grow"></span>
      <span class="muted small">Manuel V5 &middot; §13</span>
    </div>
    <p class="btp-ref-sous">Ce qui revient au chargé d'affaires indépendant, et ce qui reste au cabinet, selon l'origine du dossier.</p>

    <div class="btp-remu-cles">
      ${o.map(x => `<div class="btp-remu-cle">
        <span>${esc(x.label)}</span>
        <b>${x.independant} %</b><em>indépendant</em>
        <b class="cab">${x.cabinet} %</b><em>cabinet</em>
      </div>`).join('')}
    </div>

    <div class="table-wrap"><table class="btp-remu">
      <thead>
        <tr><th rowspan="2">Honoraires HT</th>
          ${o.map(x => `<th colspan="2" class="groupe">${esc(x.court)}</th>`).join('')}</tr>
        <tr>${o.map(x => `<th class="num">Indép. ${x.independant} %</th><th class="num cab">Cabinet ${x.cabinet} %</th>`).join('')}</tr>
      </thead>
      <tbody>${REMUNERATION_BTP.exemples.map(h => `<tr>
        <th scope="row">${eur(h)}</th>
        ${o.map(x => `<td class="num"><b>${eur(partRemuneration(h, x.independant))}</b></td>
          <td class="num cab">${eur(partRemuneration(h, x.cabinet))}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>

    <p class="btp-ref-garde"><b>Règle :</b> ${esc(REMUNERATION_BTP.regle)}</p>
  </div>`;
};

// 8. La fiche métier, sur l'écran du réseau : ce qu'on attend de quelqu'un avant de
// l'habiliter, et ce qu'on lui demande une fois qu'il l'est.
const ficheMetier = () => `<div class="card btp-ref">
  <div class="card-head"><h2>Fiche métier</h2>
    <span class="grow"></span>
    <span class="muted small">Manuel V5 &middot; §8</span>
  </div>
  <p class="btp-ref-phrase">${esc(FICHE_CHARGE_BTP.intitule)}</p>
  <div class="btp-duo">
    <div class="table-wrap"><table>
      <thead><tr><th>Dimension</th><th>Attendu</th></tr></thead>
      <tbody>${FICHE_CHARGE_BTP.dimensions.map(([d, a]) => `<tr>
        <td><b>${esc(d)}</b></td><td class="small">${esc(a)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div>
      <h3 class="btp-ref-titre">Missions principales</h3>
      <ul class="btp-regles">${FICHE_CHARGE_BTP.missions.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
    </div>
  </div>
</div>`;

// ---------------------------------------------------------------- Le référentiel Expertise
// Le manuel V6, propre au pôle Expertise, dit ce que le cabinet est, ce qu'il sait
// faire, comment il qualifie une mission et où il passe la main. Comme pour l'AMO,
// cette doctrine est posée sur l'écran où l'on s'en sert.

// 1. Le positionnement, et la chaîne de rédaction qui en découle.
const positionnementExpertise = () => `<div class="card btp-ref" style="${teinteMission('expertise')}">
  <div class="card-head"><h2>Positionnement du pôle Expertise</h2>
    <span class="grow"></span>
    <span class="muted small">Manuel V6 &middot; §1</span>
  </div>
  <p class="btp-ref-phrase">${esc(POSITIONNEMENT_EXPERTISE.intro)}</p>
  <div class="table-wrap"><table>
    <tbody>${POSITIONNEMENT_EXPERTISE.principes.map(([k, v], i) => `<tr${i === POSITIONNEMENT_EXPERTISE.principes.length - 1 ? ' class="exp-limite"' : ''}>
      <th scope="row">${esc(k)}</th><td class="small">${esc(v)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <div class="mf-bloc-titre" style="margin-top:16px">Principe de rédaction — chaque maillon reste séparé</div>
  <div class="exp-chaine">${POSITIONNEMENT_EXPERTISE.redaction.map(x => `<span>${esc(x)}</span>`).join('<i>→</i>')}</div>
</div>`;

// 2. Ce qu'on sait faire, rangé par famille.
const typologieExpertise = () => `<div class="card btp-ref" style="${teinteMission('expertise')}">
  <div class="card-head"><h2>Typologie des missions</h2>
    <span class="grow"></span>
    <span class="muted small">Manuel V6 &middot; §2</span>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Famille</th><th>Exemples de missions</th></tr></thead>
    <tbody>${TYPOLOGIE_EXPERTISE.map(([f, ex]) => `<tr>
      <td>${marqueMission('expertise')}<b>${esc(f)}</b></td><td class="small">${esc(ex)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
</div>`;

// 3. L'offre : les trois niveaux, leur contenu, leur tarif de travail et leur poids.
const offreExpertise = () => {
  const lignes = NIVEAUX_BTP.filter(n => n.mission === 'expertise');
  return `<div class="card btp-ref" style="${teinteMission('expertise')}">
    <div class="card-head"><h2>Offre commerciale</h2>
      <span class="grow"></span>
      <span class="muted small">Manuel V6 &middot; §3</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Niveau</th><th>Contenu indicatif</th><th>Tarif de travail HT</th><th class="num">Points</th></tr></thead>
      <tbody>${lignes.map(n => `<tr>
        <td>${marqueMission('expertise')}<b>${esc(n.label)}</b></td>
        <td class="small">${esc(n.contenu)}</td>
        <td class="small">${esc(n.tarif)}</td>
        <td class="num"><b class="btp-pts">${n.points}</b></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="btp-ref-garde">${esc(OFFRE_EXPERTISE_NOTE)}</p>
  </div>`;
};

// 4. La qualification. Comme la matrice AMO, elle se coche ; mais rien ne s'additionne :
// chaque critère désigne un niveau, et le plus souvent désigné l'emporte.
const qualificationExpertise = (cotes) => {
  const niveaux = NIVEAUX_BTP.filter(n => n.mission === 'expertise');
  const sug = niveauExpertise(cotes, QUALIF_EXPERTISE_V6);
  const faits = QUALIF_EXPERTISE_V6.filter(c => cotes[c.key] !== undefined).length;
  return `<div class="card btp-ref" style="${teinteMission('expertise')}">
    <div class="card-head"><h2>Qualification interne du niveau</h2>
      <span class="grow"></span>
      ${faits ? '<button type="button" class="btn ghost sm" id="qx-raz">Effacer</button>' : ''}
      <span class="muted small">Manuel V6 &middot; §4</span>
    </div>
    <p class="btp-ref-action">
      <b>Cochez une case par ligne</b> — chaque critère désigne un niveau, le plus souvent retenu est proposé.
      <span>${faits} sur ${QUALIF_EXPERTISE_V6.length}</span>
    </p>
    <div class="table-wrap"><table class="btp-matrice fa-matrice">
      <thead><tr><th>Critère</th>${niveaux.map(n => `<th>${esc(n.label.replace('Expertise ', '').replace(/^./, c => c.toUpperCase()))} — ${n.points} pt${n.points > 1 ? 's' : ''}</th>`).join('')}</tr></thead>
      <tbody>${QUALIF_EXPERTISE_V6.map(c => `<tr>
        <th scope="row">${esc(c.label)}</th>
        ${c.valeurs.map((lbl, n) => `<td class="choix ${cotes[c.key] === n ? 'on' : ''}" data-qx="${c.key}" data-score="${n}"
          role="radio" aria-checked="${cotes[c.key] === n}" tabindex="0"><span class="btp-coche"></span>${esc(lbl)}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>
    ${sug ? `<div class="btp-score" style="${teinteMission('expertise')}">
      <div class="btp-score-val plein"><b>${sug.comptes[0]} · ${sug.comptes[1]} · ${sug.comptes[2]}</b><span>critères vers simple · rapport · complexe</span></div>
      <span class="btp-score-fleche" aria-hidden="true">→</span>
      <div class="btp-score-taux"><b>${esc(sug.niveau.label)}</b><span>${sug.niveau.points} point${sug.niveau.points > 1 ? 's' : ''} de charge · ${esc(sug.niveau.tarif)}</span></div>
    </div>` : ''}
    <p class="btp-ref-garde">${esc(QUALIF_EXPERTISE_REGLE)}</p>
  </div>`;
};

// 5. La gravité : elle commande l'urgence de la visite et le ton de l'alerte.
const graviteExpertise = () => `<div class="card btp-ref" style="${teinteMission('expertise')}">
  <div class="card-head"><h2>Gravité et urgence</h2>
    <span class="grow"></span>
    <span class="muted small">Manuel V6 &middot; §17</span>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Niveau</th><th>Définition interne</th><th>Action</th></tr></thead>
    <tbody>${GRAVITE_EXPERTISE.map(g => `<tr>
      <td><span class="pill ${g.ton}">${esc(g.code)}</span></td>
      <td class="small">${esc(g.definition)}</td>
      <td class="small">${esc(g.action)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <p class="btp-ref-garde">${esc(GRAVITE_REGLE)}</p>
</div>`;

// 6. Où l'expertise s'arrête. Le pendant de la frontière AMO / maîtrise d'œuvre.
const specialistesExpertise = () => `<div class="card btp-ref btp-garde" style="${teinteMission('expertise')}">
  <div class="card-head"><h2>Quand passer la main</h2>
    <span class="grow"></span>
    <span class="muted small">Manuel V6 &middot; §18</span>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Situation</th><th>Orientation</th></tr></thead>
    <tbody>${SPECIALISTES_EXPERTISE.map(([s, o]) => `<tr>
      <td class="small"><b>${esc(s)}</b></td><td class="small">${esc(o)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
</div>`;

// ---------------------------------------------------------------- Missions, par métier
// Un écran par métier : la pipeline entière, et la liste de ce qui la remplit.
const pageMission = (mission) => ({
  title: () => `BTP Expertise — ${MISSIONS[mission].titre}`,
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    // La cotation de la matrice de taux vit dans l'état de la page : elle survit aux
    // redessins, et rien n'est enregistré — c'est une aide au devis, pas une donnée.
    const state = { q: '', focus: null, scores: MATRICE_AMO.criteres.map(() => null), travaux: '', taux: null, cotesExp: {} };

    const draw = () => {
      const { siennes, colonnes, potentiel } = pipelineDe(mission);
      const ts = terms(state.q);
      const liste = siennes.filter(d => hit([d.title, dealParty(d), d.notes], ts))
        .sort((x, y) => (y.amount || 0) - (x.amount || 0));
      const points = siennes.reduce((t, d) => t + pointsDe(d), 0);

      root.innerHTML = cadre(MISSIONS[mission].hash, `Missions — ${MISSIONS[mission].titre}`, `
        <div class="btp-page-mission" style="${teinteMission(mission)}">
        <div class="btp-bandeau">${marqueMission(mission)}<b>${esc(couleurMission(mission).label)}</b><span>${esc(mission === 'amo' ? HONORAIRES_AMO.taux + ', minimum ' + eur(HONORAIRES_AMO.minimum) + ' HT' : 'Constat, analyse et rapport')}</span></div>
        <div class="esp-kpis">
          ${kpi({ label: 'Missions en cours', valeur: siennes.length, sous: `${points} point${points > 1 ? 's' : ''} de charge`, icone: '🏗', ton: 'accent', href: MISSIONS[mission].hash })}
          ${kpi({ label: 'CA potentiel HT', valeur: eur(potentiel), sous: 'sur les missions ouvertes', icone: '📈', ton: 'green', href: MISSIONS[mission].hash })}
          ${kpi({ label: 'Sans niveau', valeur: siennes.filter(d => !niveauDe(d)).length, sous: 'ne pèsent aucun point', icone: '⚠', ton: 'amber', href: MISSIONS[mission].hash })}
        </div>

        <div class="card">
          <div class="card-head"><h2>Pipeline ${esc(MISSIONS[mission].titre)}</h2>
            <span class="grow"></span>
            <button class="btn" id="m-new">+ Fiche découverte ${esc(couleurMission(mission).label)}</button>
          </div>
          ${kanbanHtml(colonnes)}
        </div>

        <div class="card">
          <div class="card-head"><h2>Les missions</h2>
            ${searchInput('m-q', state, 'Rechercher une mission, un client…')}
            <span class="muted small">${liste.length} ligne${liste.length > 1 ? 's' : ''}</span>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Mission</th><th>Client</th><th>Étape</th><th>Niveau</th><th class="num">Points</th><th>Chargé d'affaires</th><th class="num">Montant HT</th><th></th></tr></thead>
            <tbody>${liste.map(d => {
              const n = niveauDe(d);
              return `<tr class="click" data-deal="${d.id}">
                <td>${marqueMission(missionDe(d))}<b>${esc(d.title)}</b></td>
                <td>${esc(dealParty(d))}</td>
                <td>${esc(act().stages.find(s => s.key === d.stage)?.label || d.stage)}</td>
                <td>${n ? esc(n.label) : '<span class="muted">à renseigner</span>'}</td>
                <td class="num">${n ? n.points : '—'}</td>
                <td>${marqueResponsable(d.owner_id)}</td>
                <td class="num">${d.amount ? eur(d.amount) : '—'}</td>
                <td class="num">${d.fields?.decouverte
                  ? `<button type="button" class="btn ghost sm" data-fiche="${d.id}" title="Imprimer la fiche de mission">Fiche</button>`
                  : ''}</td>
              </tr>`;
            }).join('') || `<tr><td colspan="8"><div class="empty">Aucune mission ${esc(MISSIONS[mission].titre)} en cours.</div></td></tr>`}</tbody>
          </table></div>
        </div>

        ${mission === 'amo' ? [
          `<div class="btp-duo btp-duo-cat">${catalogueAmo()}${phasesAmo()}</div>`,
          matriceAmo(state.scores),
          scoreComplexite(state.scores, state.travaux, state.taux),
          frontiereAmo(),
        ].join('') : [
          positionnementExpertise(),
          `<div class="btp-duo btp-duo-cat">${offreExpertise()}${typologieExpertise()}</div>`,
          qualificationExpertise(state.cotesExp),
          `<div class="btp-duo">${graviteExpertise()}${specialistesExpertise()}</div>`,
        ].join('')}
        </div>`);

      bindSearch(root, 'm-q', state, draw); restoreFocus(root, state);
      lierAffaires(root, draw);
      root.querySelectorAll('[data-fiche]').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const d = db.byId('deals', b.dataset.fiche);
        if (d?.fields?.decouverte) imprimerFicheDeal(d.fields.decouverte);
      });
      // Une mission saisie ici naît dans son métier : le formulaire ouvre avec le type
      // déjà choisi, le reste (contact, montant) se remplit comme partout ailleurs.
      root.querySelector('#m-new').onclick = () => (mission === 'amo'
        ? ficheDecouverteAmo(draw)
        : ficheDecouverteExpertise(draw));

      // Une case cliquée cote son critère ; la recliquer l'annule, pour repartir d'un
      // devis sans avoir à tout effacer.
      const coter = (td) => {
        const i = Number(td.dataset.crit);
        const n = Number(td.dataset.score);
        state.scores[i] = state.scores[i] === n ? null : n;
        state.taux = null;        // on repasse au taux que la cotation suggère
        draw();
      };
      root.querySelectorAll('[data-crit]').forEach(td => {
        td.onclick = () => coter(td);
        td.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coter(td); } };
      });
      root.querySelector('#mx-raz')?.addEventListener('click', () => {
        state.scores = MATRICE_AMO.criteres.map(() => null);
        state.taux = null;
        draw();
      });

      // La grille du V6 ne s'additionne pas : recliquer une case l'annule, et le
      // niveau proposé suit le compte des critères.
      root.querySelectorAll('[data-qx]').forEach(td => {
        const coter = () => {
          const cle = td.dataset.qx;
          const n = Number(td.dataset.score);
          if (state.cotesExp[cle] === n) delete state.cotesExp[cle]; else state.cotesExp[cle] = n;
          draw();
        };
        td.onclick = coter;
        td.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coter(); } };
      });
      root.querySelector('#qx-raz')?.addEventListener('click', () => { state.cotesExp = {}; draw(); });

      // Seuls les résultats se redessinent à la frappe : les deux champs gardent leur
      // curseur. Le raccourci vers le taux suggéré est recréé à chaque mise à jour.
      const champTravaux = root.querySelector('#hono-travaux');
      const champTaux = root.querySelector('#hono-taux');
      const majHonoraires = () => {
        const res = root.querySelector('#hono-res');
        if (!res) return;
        res.innerHTML = resultatHonoraires(state.scores, state.travaux, state.taux);
        res.querySelectorAll('[data-taux]').forEach(b => b.onclick = () => {
          state.taux = Number(b.dataset.taux);
          if (champTaux) champTaux.value = state.taux;
          majHonoraires();
        });
      };
      majHonoraires();
      if (champTravaux) champTravaux.oninput = () => { state.travaux = champTravaux.value; majHonoraires(); };
      if (champTaux) champTaux.oninput = () => {
        state.taux = champTaux.value === '' ? null : Number(champTaux.value);
        majHonoraires();
      };
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
});

export const btpExpertisePage = pageMission('expertise');
export const btpAmoPage = pageMission('amo');

// ---------------------------------------------------------------- Chargés d'affaires
// Le réseau se déclare à la main : une fiche peut exister avant que la personne ait un
// compte CRM. `profile_id` fait le lien quand elle en a un — et c'est ce lien qui
// permet de calculer sa charge, puisque les missions portent un owner_id.
const TABLE_CHARGES = 'btp_charges_affaires';
const fichesReseau = () => db.t(TABLE_CHARGES).slice()
  .sort((a, b) => (b.actif !== false) - (a.actif !== false) || String(a.nom).localeCompare(String(b.nom), 'fr'));

// La fiche d'un chargé d'affaires, sur le même principe que le formulaire de mission :
// qui est la personne, puis ce qu'elle peut porter. Les deux écrans se redessinent
// depuis un seul état, donc rien ne se perd en passant de l'un à l'autre.
//
// ⚠ `existante` peut arriver SANS id : c'est le cas quand on crée la fiche d'un
// utilisateur du CRM déjà connu, avec ses coordonnées pré-remplies. Seule la présence
// d'un id distingue une modification d'une création — s'en remettre à la seule
// existence de l'objet ferait passer une création pour une mise à jour.
const STATUTS_CHARGE = ['Indépendant', 'Salarié', 'En cours de recrutement', 'Autre'];

function ficheCharge(existante, apres) {
  const edition = !!existante?.id;
  const users = scope.users();
  const v = {
    pas: 1,
    nom: existante?.nom || '',
    statut: existante?.statut || STATUTS_CHARGE[0],
    email: existante?.email || '',
    telephone: existante?.telephone || '',
    profile_id: existante?.profile_id || '',
    points_max: existante?.points_max ?? CAPACITE_BTP.points,
    amo_max: existante?.amo_max ?? CAPACITE_BTP.amoActives,
    objectif_ca: existante?.objectif_ca ?? '',
    actif: existante?.actif !== false,
    notes: existante?.notes || '',
  };

  const m = openModal(edition ? esc(existante.nom) : "Nouveau chargé d'affaires",
    '<div id="ca-corps"></div>', { wide: true });
  const corps = m.querySelector('#ca-corps');
  m.querySelector('.modal-head')?.setAttribute('style', `${teinteMission('expertise')};border-bottom:3px solid var(--m)`);

  const enTete = () => `
    <div class="mf-pas" style="${teinteMission('expertise')}">
      ${[['La personne', 1], ['Sa capacité', 2]].map(([lbl, n]) => `
        <div class="mf-pas-item ${v.pas === n ? 'on' : ''} ${v.pas > n ? 'fait' : ''}" data-pas="${n}">
          <span class="mf-pas-num">${v.pas > n ? '✓' : n}</span>${esc(lbl)}
        </div>`).join('<i class="mf-pas-lien"></i>')}
    </div>`;

  const ecranPersonne = () => `
    <div class="mf-bloc-titre">Statut</div>
    <div class="mf-seg mf-seg-large">
      ${STATUTS_CHARGE.map(st => `<button type="button" class="${st === v.statut ? 'on' : ''}" data-statut="${esc(st)}">${esc(st)}</button>`).join('')}
    </div>

    <div class="mf-grille">
      <label class="mail-champ plein"><span>Nom et prénom *</span>
        <input id="c-nom" value="${esc(v.nom)}" placeholder="Camille Ferrand"></label>
      <label class="mail-champ"><span>E-mail</span>
        <input id="c-email" type="email" value="${esc(v.email)}" placeholder="camille@exemple.fr"></label>
      <label class="mail-champ"><span>Téléphone</span>
        <input id="c-tel" value="${esc(v.telephone)}" placeholder="06 12 34 56 78"></label>
    </div>

    <div class="mf-bloc-titre">Compte CRM</div>
    <label class="mail-champ" style="margin-bottom:8px"><span>Utilisateur relié</span>
      <select id="c-profil">
        <option value="">— aucun pour l'instant —</option>
        ${users.map(u => `<option value="${u.id}" ${u.id === v.profile_id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}
      </select></label>
    <p class="mf-aide ${v.profile_id ? 'ok' : 'attention'}">${v.profile_id
      ? 'Ses missions seront comptées dans sa charge.'
      : "Sans compte relié, sa charge restera à zéro : les missions portent l'identifiant d'un utilisateur du CRM. Une fiche peut tout de même exister avant l'ouverture du compte."}</p>

    <div class="form-actions">
      ${edition ? '<button type="button" class="btn ghost left" id="ca-del">Supprimer la fiche</button>' : ''}
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="c-suite">Continuer →</button>
    </div>`;

  const ecranCapacite = () => `
    <div class="mf-bloc-titre">Ce qu'il ou elle peut porter</div>
    <div class="mf-grille">
      <label class="mail-champ"><span>Capacité en points</span>
        <input type="number" id="c-points" min="1" step="1" value="${esc(v.points_max)}"></label>
      <label class="mail-champ"><span>AMO actives au maximum</span>
        <input type="number" id="c-amo" min="0" step="1" value="${esc(v.amo_max)}"></label>
      <label class="mail-champ"><span>Objectif de CA annuel (€ HT)</span>
        <input type="number" id="c-objectif" min="0" step="1000" value="${esc(v.objectif_ca)}" placeholder="120000"></label>
    </div>
    <p class="mf-aide">${esc(portee(v.points_max))}</p>

    <div class="mf-bloc-titre">État de la fiche</div>
    <div class="mf-seg">
      <button type="button" class="${v.actif ? 'on' : ''}" data-actif="1">Active</button>
      <button type="button" class="${v.actif ? '' : 'on'}" data-actif="0">En sommeil</button>
    </div>
    <p class="mf-aide">Mettre en sommeil plutôt que supprimer : le réseau garde sa mémoire et les missions passées restent lisibles.</p>

    <div class="mf-grille" style="margin-top:16px">
      <label class="mail-champ plein"><span>Notes</span>
        <textarea id="c-notes" rows="2" placeholder="Zone d'intervention, spécialités, points d'attention…">${esc(v.notes)}</textarea></label>
    </div>

    <div class="form-actions">
      <button type="button" class="btn ghost left" id="c-retour">← La personne</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="c-ok">${edition ? 'Enregistrer' : 'Créer la fiche'}</button>
    </div>`;

  // Ce que vaut une capacité, dit en missions plutôt qu'en points : « 18 » ne parle
  // qu'à celui qui connaît le barème par cœur.
  function portee(points) {
    const n = Number(points) || 0;
    // La plus grosse AMO qui tient dans la capacité : annoncer « 0 AMO importante »
    // ne renseigne personne.
    const gros = NIVEAUX_BTP.filter(x => x.mission === 'amo' && x.points <= n).sort((a, b) => b.points - a.points)[0];
    const petit = NIVEAUX_BTP.filter(x => x.mission === 'expertise').sort((a, b) => a.points - b.points)[0];
    if (n <= 0) return 'Capacité nulle : aucune mission ne pourra lui être attribuée sans dépassement.';
    // « AMO » est un sigle : il ne prend ni minuscule ni accord. Les autres mots, si.
    const dit = (niveau, combien) => niveau.label.split(' ')
      .map(mot => (mot === mot.toUpperCase() ? mot : (combien > 1 ? mot + 's' : mot).toLowerCase()))
      .join(' ');
    const b = Math.floor(n / petit.points);
    if (!gros) {
      const plancher = NIVEAUX_BTP.filter(x => x.mission === 'amo').sort((x, y) => x.points - y.points)[0];
      return `${n} points : de quoi porter ${b} ${dit(petit, b)}, mais aucune AMO — la plus légère en vaut ${plancher.points}.`;
    }
    const a = Math.floor(n / gros.points);
    return `${n} points, c'est par exemple ${a} ${dit(gros, a)}, ou ${b} ${dit(petit, b)}.`;
  }

  const dessine = () => { corps.innerHTML = enTete() + (v.pas === 1 ? ecranPersonne() : ecranCapacite()); lier(); };

  const lier = () => {
    corps.querySelectorAll('[data-pas]').forEach(b => b.onclick = () => {
      const n = Number(b.dataset.pas);
      if (n < v.pas) { v.pas = n; dessine(); }
    });

    if (v.pas === 1) {
      corps.querySelectorAll('[data-statut]').forEach(b => b.onclick = () => { v.statut = b.dataset.statut; dessine(); });
      const poser = (sel, cle) => { const el = corps.querySelector(sel); if (el) el.oninput = () => { v[cle] = el.value; }; };
      poser('#c-nom', 'nom'); poser('#c-email', 'email'); poser('#c-tel', 'telephone');
      const pr = corps.querySelector('#c-profil');
      if (pr) pr.onchange = () => { v.profile_id = pr.value; dessine(); };
      corps.querySelector('#c-suite').onclick = () => {
        if (!v.nom.trim()) return toast('Le nom est nécessaire', 'warn');
        v.pas = 2; dessine();
      };
      corps.querySelector('#ca-del')?.addEventListener('click', supprimer);
      return;
    }

    const pt = corps.querySelector('#c-points');
    if (pt) pt.oninput = () => {
      v.points_max = pt.value;
      const aide = corps.querySelector('.mf-aide');
      if (aide) aide.textContent = portee(v.points_max);
    };
    const am = corps.querySelector('#c-amo'); if (am) am.oninput = () => { v.amo_max = am.value; };
    const ob = corps.querySelector('#c-objectif'); if (ob) ob.oninput = () => { v.objectif_ca = ob.value; };
    const nt = corps.querySelector('#c-notes'); if (nt) nt.oninput = () => { v.notes = nt.value; };
    corps.querySelectorAll('[data-actif]').forEach(b => b.onclick = () => { v.actif = b.dataset.actif === '1'; dessine(); });
    corps.querySelector('#c-retour').onclick = () => { v.pas = 1; dessine(); };
    corps.querySelector('#c-ok').onclick = enregistrer;
  };

  async function enregistrer() {
    const bouton = corps.querySelector('#c-ok');
    bouton.disabled = true;
    const ligne = {
      nom: v.nom.trim(),
      statut: v.statut,
      email: v.email.trim() || null,
      telephone: v.telephone.trim() || null,
      profile_id: v.profile_id || null,
      points_max: Number(v.points_max) || CAPACITE_BTP.points,
      amo_max: Number(v.amo_max) || 0,
      objectif_ca: v.objectif_ca === '' ? null : Number(v.objectif_ca),
      actif: v.actif,
      notes: v.notes.trim() || null,
    };
    try {
      if (edition) await db.update(TABLE_CHARGES, existante.id, { ...ligne, updated_at: new Date().toISOString() });
      else await db.insert(TABLE_CHARGES, ligne);
      closeModal(true);
      toast(edition ? 'Fiche mise à jour' : `${ligne.nom} rejoint le réseau`);
      apres();
    } catch (err) {
      bouton.disabled = false;
      toast(err.message, 'err');
    }
  }

  async function supprimer() {
    if (!await confirm(`Supprimer la fiche de ${existante.nom} ? Ses missions ne sont pas touchées.`)) return;
    try { await db.remove(TABLE_CHARGES, existante.id); closeModal(true); toast('Fiche supprimée'); apres(); }
    catch (err) { toast(err.message, 'err'); }
  }

  dessine();
}


export const btpChargesPage = {
  title: () => "BTP Expertise — Chargés d'affaires",
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);

    const draw = () => {
      // Une ligne par fiche du réseau, sa charge lue sur le compte CRM quand il existe.
      const lignes = fichesReseau().map(f => {
        const charge = f.profile_id ? chargeDe(f.profile_id) : null;
        const max = f.points_max || CAPACITE_BTP.points;
        const amoMax = f.amo_max || CAPACITE_BTP.amoActives;
        return {
          f, charge, max, amoMax,
          points: charge ? charge.points : 0,
          sature: charge ? (charge.points >= max || charge.amo.length >= amoMax) : false,
        };
      });
      // Les utilisateurs du CRM rattachés à BTP qui n'ont pas encore de fiche : on les
      // montre plutôt que de les oublier, avec de quoi créer leur fiche d'un clic.
      const sansFiche = chargesDAffaires().filter(u => !fichesReseau().some(f => f.profile_id === u.id));

      root.innerHTML = cadre('#/btp/charges', "Chargés d'affaires", `
        <div class="card">
          <div class="card-head"><h2>Le réseau</h2>
            <span class="muted small">Capacité et objectif se règlent fiche par fiche</span>
            <span class="grow"></span>
            <button class="btn" id="ca-new">+ Chargé d'affaires</button>
          </div>
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Chargé d'affaires</th>
              <th>Charge structurelle</th>
              <th class="num" style="color:${couleurMission('expertise').encre}">${marqueMission('expertise')}Expertise</th>
              <th class="num" style="color:${couleurMission('amo').encre}">${marqueMission('amo')}AMO</th>
              <th class="num">CA produit</th><th>Statut</th><th></th>
            </tr></thead>
            <tbody>${lignes.map(l => ligneReseau(l)).join('')
              || `<tr><td colspan="7"><div class="empty">Aucun chargé d'affaires déclaré. « + Chargé d'affaires » crée la première fiche — une personne peut y figurer avant d'avoir un compte CRM.</div></td></tr>`}</tbody>
          </table></div>
          ${sansFiche.length ? `<p class="muted small" style="margin-top:12px">Sur le CRM sans fiche de réseau : ${sansFiche.map(u => `<button type="button" class="btn ghost sm" data-creer="${u.id}">+ ${esc(u.full_name)}</button>`).join(' ')}</p>` : ''}
        </div>

        <div class="btp-duo">${['expertise', 'amo'].map(m => tableauPoints(m)).join('')}</div>

        <div class="card">
          <div class="card-head"><h2>Règles de capacité</h2></div>
          <ul class="btp-regles">
            <li><b>${CAPACITE_BTP.points} points</b> structurels par défaut, ajustables sur chaque fiche.</li>
            <li><b>${CAPACITE_BTP.amoActives} AMO actives</b> au maximum en même temps.</li>
            <li>La <b>charge structurelle</b> est la responsabilité totale du portefeuille ; la charge du moment peut être moindre.</li>
            <li>Les points d'une <b>expertise se libèrent à sa clôture</b> ; ceux d'une <b>AMO occupent la capacité longtemps</b>.</li>
            <li>Une fiche <b>sans compte CRM</b> n'a pas de charge calculée : ses missions ne peuvent pas lui être rattachées.</li>
          </ul>
        </div>

        ${modeleRemuneration()}
        ${ficheMetier()}`);

      lierAffaires(root, draw);
      root.querySelector('#ca-new').onclick = () => ficheCharge(null, draw);
      root.querySelectorAll('[data-fiche-ca]').forEach(b => b.onclick = () => ficheCharge(db.byId(TABLE_CHARGES, b.dataset.ficheCa), draw));
      // Fiche pré-remplie depuis un compte du CRM : pas d'id, donc une création.
      root.querySelectorAll('[data-creer]').forEach(b => b.onclick = () => {
        const u = db.byId('profiles', b.dataset.creer);
        ficheCharge({ nom: u.full_name, email: u.email, profile_id: u.id, actif: true }, draw);
      });
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// Un tableau par métier plutôt qu'un seul melange : on cherche « combien pese une AMO
// etendue », pas « quel est le bareme general ».
function tableauPoints(mission) {
  const c = couleurMission(mission);
  const lignes = NIVEAUX_BTP.filter(n => n.mission === mission);
  return `<div class="card btp-bareme" style="${teinteMission(mission)}">
    <div class="card-head">
      <h2>${marqueMission(mission)}${esc(c.label)}</h2>
      <span class="grow"></span>
      <a class="btn ghost sm" href="${MISSIONS[mission].hash}">Voir les missions →</a>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Niveau</th><th>Ce qu'il comprend</th><th>Tarif de travail</th><th class="num">Points</th></tr></thead>
      <tbody>${lignes.map(n => `<tr>
        <td><b>${esc(n.label.replace(/^(Expertise|AMO) ?/, '')) || esc(n.label)}</b></td>
        <td class="small">${esc(n.contenu)}</td>
        <td class="small">${esc(n.tarif)}</td>
        <td class="num"><b class="btp-pts">${n.points}</b></td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${mission === 'amo'
      ? `<p class="muted small" style="margin-top:10px">Honoraires : ${esc(HONORAIRES_AMO.taux)}, minimum ${eur(HONORAIRES_AMO.minimum)} HT.</p>`
      : '<p class="muted small" style="margin-top:10px">Les points se libèrent à la clôture de la mission.</p>'}
  </div>`;
}

// Une ligne du réseau : la jauge, les compteurs, et le détail des missions portées.
function ligneReseau({ f, charge, max, amoMax, points, sature }) {
  const pct = (v) => (max ? Math.min(100, (v / max) * 100) : 0);
  const objectif = Number(f.objectif_ca) || 0;
  const cExp = couleurMission('expertise');
  const cAmo = couleurMission('amo');
  // Deux segments dans la meme jauge : ce que pesent les expertises, ce que pesent les
  // AMO. On lit d'un coup la charge ET sa composition, ce qu'un total seul cachait.
  const jauge = `<div class="btp-jauge btp-jauge-duo">
    <i style="width:${pct(charge ? charge.ptsExpertise : 0)}%;background:${cExp.couleur}" title="Expertise : ${charge ? charge.ptsExpertise : 0} pts"></i>
    <i style="width:${pct(charge ? charge.ptsAmo : 0)}%;background:${cAmo.couleur}" title="AMO : ${charge ? charge.ptsAmo : 0} pts"></i>
  </div>`;
  return `<tr class="${f.actif === false ? 'btp-sommeil' : ''}">
    <td>
      <b>${esc(f.nom)}</b>
      <div class="small muted">${esc(f.statut || '—')}${f.email ? ' · ' + esc(f.email) : ''}</div>
      ${!f.profile_id ? '<div class="small muted">Pas de compte CRM : charge non calculée</div>' : ''}
    </td>
    <td class="btp-col-charge">
      <div class="btp-jauge-val">${points} / ${max} pts${sature ? ' <span class="pill bad sm">saturé</span>' : ''}${charge && charge.sansNiveau ? ` <span class="muted" title="${charge.sansNiveau} mission(s) sans niveau : elles ne pèsent aucun point">· ${charge.sansNiveau} sans niveau</span>` : ''}</div>
      ${jauge}
    </td>
    <td class="num"><span class="btp-compteur" style="${teinteMission('expertise')}">${charge ? charge.expertises : 0}<em>${charge ? charge.ptsExpertise : 0} pts</em></span></td>
    <td class="num"><span class="btp-compteur ${charge && charge.amo.length >= amoMax ? 'plein' : ''}" style="${teinteMission('amo')}">${charge ? charge.amo.length : 0} / ${amoMax}<em>${charge ? charge.ptsAmo : 0} pts</em></span></td>
    <td class="num">${charge && charge.ca ? eur(charge.ca) : '—'}${objectif ? `<div class="small muted">sur ${eur(objectif)}</div>` : ''}</td>
    <td>${f.actif === false ? '<span class="pill">En sommeil</span>'
      : sature ? '<span class="pill bad">Saturé</span>' : '<span class="pill ok">Disponible</span>'}</td>
    <td class="num"><button type="button" class="icon-btn" data-fiche-ca="${f.id}" title="Modifier la fiche">✎</button></td>
  </tr>
  ${charge && charge.siennes.length ? `<tr class="btp-detail"><td colspan="7">
    ${charge.siennes.map(d => {
      const n = niveauDe(d);
      return `<button type="button" class="btp-chip" style="${teinteMission(missionDe(d))}" data-deal="${d.id}" title="${esc(d.title)}">
        <i></i>${esc(d.title)}<span>${n ? n.points + ' pt' + (n.points > 1 ? 's' : '') : 'sans niveau'}</span>
      </button>`;
    }).join('')}
  </td></tr>` : ''}`;
}

// ---------------------------------------------------------------- Base de données
// L'onglet « Prospects » a disparu : il désignait exactement la même population que
// « Nouveaux leads ». L'origine d'un lead ne se devine donc plus depuis le canal du
// contact — elle se lit sur l'affaire, colonne « Origine » de la pile.

// « Nouveaux leads » et « Prospects » designent les memes personnes : ce qui les
// separe est le moment, pas la nature. Un prospect reste un NOUVEAU LEAD tant que
// l'entretien d'appel n'a pas eu lieu ; une fois cette etape passee, il entre dans
// la base definitive et ne reparait plus dans la pile.
//
// D'ou le critere : les deux premieres etapes du pipeline BTP — « Nouveau » et
// « RDV 1 » — sont l'avant-entretien. Elles sont communes aux deux metiers du
// cabinet et garanties en tete de liste (voir ACTIVITIES.btp dans schema.js), ce
// qui rend la regle valable pour une expertise comme pour une AMO.
//
// Ce n'est PAS « sans responsable » : un lead attribue reste un nouveau lead tant
// que l'appel n'a pas eu lieu, et c'est bien ce qu'on veut suivre.
//
// Les etapes concernees sont declarees sur l'activite (`avantEntretien` dans
// schema.js) et lues par `estNouveauLead` : moveStage s'en sert aussi, pour
// promouvoir le contact en client quand l'affaire quitte la pile. Une seule
// definition, sinon les deux ecrans finiraient par ne plus dire la meme chose.

// D'ou vient le lead. Trois provenances possibles, dans cet ordre de precision :
//   - un apporteur nomme — partenaire, courtier, ou un contact : c'est le plus
//     precis, et c'est ce qu'on veut lire en premier ;
//   - le formulaire du site, qui ecrit `fields.origine` (« Formulaire btpexpertise.fr ») ;
//   - a defaut le canal CRM, pour une affaire saisie a la main.
// On montre la mention la plus precise disponible, sans inventer celle qui manque.
const origineDe = (d) => {
  const org = d.referrer_org_id && db.byId('organisations', d.referrer_org_id);
  if (org) return `${org.partner_job === 'Courtier' ? 'Courtier' : 'Partenaire'} · ${org.name}`;
  const c = d.referrer_contact_id && db.byId('contacts', d.referrer_contact_id);
  if (c) return `Partenaire · ${contactName(c)}`;
  // Canal « apporteur » sans apporteur nomme : on le dit quand meme, sans inventer
  // un nom que personne n'a saisi.
  if (d.channel === 'Partenaire / apporteur') return 'Partenaire';
  return ORIGINE_PAR_CANAL[d.channel] || ORIGINE_DEFAUT;
};

// Transmettre le rendez-vous au charge d'affaires.
//
// LE CRM N'A PAS RECU LE MAIL D'ORIGINE : la confirmation part du site vers le
// client, elle ne passe pas par ici, il n'y a donc rien a « faire suivre » au sens
// strict. Ce que le CRM peut faire — et qui revient au meme pour le destinataire —
// c'est preparer le message avec les memes informations, deja adresse a la bonne
// personne. `mailto:` ouvre la messagerie du poste ; rien n'est envoye sans que
// la personne clique sur Envoyer, et le CRM n'a besoin d'aucun serveur de mail.
const mailTransfert = (d) => {
  const p = d.owner_id && db.byId('profiles', d.owner_id);
  if (!p?.email) return null;
  const c = d.contact_id && db.byId('contacts', d.contact_id);
  const r = rdvTelephonique(d);
  const lignes = [
    `Bonjour ${p.full_name.split(/\s+/)[0]},`, '',
    'Je te transmets ce rendez-vous, tu en es le chargé d\'affaires.', '',
    `Rendez-vous téléphonique : ${r.texte || 'à planifier'}`,
    `Demande : ${d.title}`,
    `Origine : ${origineDe(d)}`,
    c ? `Client : ${contactName(c)}` : null,
    c?.phone ? `Téléphone : ${c.phone}` : null,
    c?.email ? `E-mail : ${c.email}` : null,
    d.fields?.problematique ? `Problématique : ${d.fields.problematique}` : null,
    d.fields?.type_bien ? `Type de bien : ${d.fields.type_bien}` : null,
    d.fields?.adresse ? `Ville / adresse : ${d.fields.adresse}` : null,
    '', `L'affaire dans le CRM : ${location.origin}${location.pathname}#/pipeline/${d.activity}`,
  ].filter(x => x !== null);
  return `mailto:${encodeURIComponent(p.email)}`
    + `?subject=${encodeURIComponent(`RDV — ${d.title}`)}`
    + `&body=${encodeURIComponent(lignes.join('\n'))}`;
};

// Le rendez-vous telephonique : quand l'appel est prevu.
//
// La date vit a deux endroits et ils ne disent pas la meme chose. `fields.date_visite`
// ne porte QUE le jour ; c'est la TACHE de type « rdv » creee avec le lead qui porte
// l'heure (`due_time`), parce que c'est elle qui alimente « Ma journee ». On lit donc
// la tache en premier, et on retombe sur le champ du formulaire si elle a disparu —
// une date sans heure vaut mieux que rien.
//
// `passe` sert a signaler un appel dont l'heure est depassee alors que le lead n'a
// pas bouge : c'est exactement le cas qu'on veut voir dans la pile.
const rdvTelephonique = (d) => {
  const t = db.t('activities')
    .filter(a => a.deal_id === d.id && a.type === 'rdv' && a.due_date)
    .sort((a, b) => (a.due_date + (a.due_time || '')).localeCompare(b.due_date + (b.due_time || '')))[0];
  const jour = t?.due_date || d.fields?.date_visite || null;
  if (!jour) return { texte: '', passe: false };
  const heure = t?.due_time || '';
  const quand = new Date(`${jour}T${heure || '23:59'}`);
  return { texte: `${fmtDate(jour)}${heure ? ` à ${heure}` : ''}`, passe: quand < new Date() };
};

const VUES = [
  { key: 'leads', label: 'Nouveaux leads' },
  { key: 'clients', label: 'Clients' },
  { key: 'partenaires', label: 'Partenaires' },
  { key: 'courtiers', label: 'Courtiers' },
  { key: 'tous', label: 'Dossiers clos' },
  { key: 'archives', label: 'Archivés' },
];

export const btpBasePage = {
  title: () => 'BTP Expertise — Base de données',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    // On ouvre sur les nouveaux leads s'il y en a : c'est ce qui demande une action.
    const aTraiter = () => deals().filter(estNouveauLead);
    const vues = () => VUES;
    // Les trois onglets se suivent dans le temps et ne se chevauchent JAMAIS :
    //   Nouveaux leads   affaire ouverte, entretien d'appel pas encore passé
    //   Clients          affaire ouverte, entretien passé — le dossier vit
    //   Tous les contacts  plus aucune affaire en cours : gagnée, perdue, ou
    //                      aucun dossier. C'est l'après, pas un fourre-tout.
    // Le calcul se fait sur l'ETAT DE L'AFFAIRE et non sur `contacts.type` :
    // l'état ne peut pas mentir, alors que le type est une saisie qui peut
    // rester en arrière (c'est exactement ce qui s'était produit).
    const clientActif = (c) => deals().some(d =>
      d.contact_id === c.id && d.status === 'open' && !estNouveauLead(d));
    const enPile = (c) => deals().some(d => d.contact_id === c.id && estNouveauLead(d));
    const state = { vue: aTraiter().length ? 'leads' : 'clients', q: '', canal: '', focus: null };

    // Créer depuis cet écran, c'est créer pour BTP Expertise : l'activité est cochée
    // d'avance, et le type suit la vue ouverte. Sans cela la fiche n'apparaîtrait pas ici.
    const nouveau = () => {
      const surOrg = ['partenaires', 'courtiers'].includes(state.vue);
      if (surOrg) orgForm(null, draw, null, 'Partenaire'); else contactForm(null, draw);
      const f = document.querySelector(surOrg ? '#o-form' : '#c-form');
      if (!f) return;
      const coche = f.querySelector(`input[name="activities"][value="${KEY}"]`);
      if (coche) coche.checked = true;
      // On est dans l'espace du cabinet : l'activité est décidée, inutile de la demander.
      coche?.closest('.field')?.setAttribute('hidden', '');
      if (surOrg && state.vue === 'courtiers') { const j = f.querySelector('[name="partner_job"]'); if (j) j.value = 'Courtier'; }
      if (!surOrg && state.vue !== 'tous') { const t = f.querySelector('[name="type"]'); if (t) t.value = state.vue === 'clients' ? 'Client' : 'Prospect'; }
    };

    const draw = () => {
      const ts = terms(state.q);
      // Les archives ne se mélangent à rien : elles ont leur onglet, et elles
      // sortent de tous les autres. C'est la seule raison d'être de l'archivage.
      const tousContacts = scope.contacts().filter(isBtp);
      const toutesOrgs = scope.orgs().filter(isBtp);
      const contacts = tousContacts.filter(estActive);
      const orgs = toutesOrgs.filter(estActive);
      const surOrg = ['partenaires', 'courtiers'].includes(state.vue);
      const surLeads = state.vue === 'leads';
      const surArchives = state.vue === 'archives';

      let lignes = [];
      let colonnes = [];
      if (surLeads) {
        lignes = aTraiter()
          .filter(d => hit([d.title, dealParty(d), d.fields?.problematique, origineDe(d)], ts))
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .map(d => {
            const r = rdvTelephonique(d);
            return { id: d.id, lead: true, recu: d.created_at, origine: origineDe(d), nom: d.title,
                     client: dealParty(d), rdv: r.texte, rdvPasse: r.passe,
                     responsable: userName(d.owner_id), mission: missionDe(d), activity: d.activity,
                     ownerId: d.owner_id, detailOrigine: d.fields?.origine || d.channel || '',
                     mail: mailTransfert(d) };
          });
        // Les coordonnées ne sont plus ici : elles vivent dans la fiche du contact,
        // qu'un clic sur la ligne ouvre. Ce que la pile doit montrer, c'est quand
        // l'appel est prévu — c'est lui qui fait sortir le lead de la pile.
        colonnes = ['Reçu', 'Origine', 'Demande', 'Client', 'RDV téléphonique', "Chargé d'affaires", ''];
      } else if (surArchives) {
        lignes = [
          ...tousContacts.filter(c => !estActive(c)).map(c => ({
            id: c.id, org: false, nom: contactName(c), detail: c.type, ville: c.city,
            tel: c.phone, mail: c.email, archive: c.archived_at,
          })),
          ...toutesOrgs.filter(o => !estActive(o)).map(o => ({
            id: o.id, org: true, nom: o.name, detail: o.partner_job || o.type, ville: o.city,
            tel: o.phone, mail: o.email, archive: o.archived_at,
          })),
        ].filter(r => hit([r.nom, r.detail, r.ville, r.mail, r.tel], ts))
         .sort((a, b) => (b.archive || '').localeCompare(a.archive || ''));
        colonnes = ['Nom', 'Type', 'Ville', 'Téléphone', 'Email', 'Archivé le'];
      } else if (surOrg) {
        const filtre = state.vue === 'courtiers' ? (o) => o.partner_job === 'Courtier' : (o) => o.type === 'Partenaire';
        lignes = orgs.filter(filtre)
          .filter(o => hit([o.name, o.partner_job, o.city, o.email, o.phone], ts))
          .map(o => ({
            id: o.id, org: true, nom: o.name, detail: o.partner_job || o.type, ville: o.city,
            tel: o.phone, mail: o.email, apports: deals().filter(d => d.referrer_org_id === o.id).length,
          }));
        colonnes = ['Nom', 'Métier', 'Ville', 'Téléphone', 'Email', 'Affaires apportées'];
      } else {
        const filtre = {
          clients: clientActif,
          tous: (c) => !clientActif(c) && !enPile(c),
        }[state.vue];
        lignes = contacts.filter(filtre)
          .filter(c => !state.canal || c.channel === state.canal)
          .filter(c => hit([contactName(c), c.email, c.phone, c.city, c.channel], ts))
          .map(c => {
            const d = deals().find(x => x.contact_id === c.id);
            return {
              id: c.id, nom: contactName(c), detail: c.type, ville: c.city, tel: c.phone, mail: c.email,
              canal: c.channel || '—', affaire: d ? d.title : null, dealId: d ? d.id : null,
              responsable: d ? userName(d.owner_id) : '', ownerId: d ? d.owner_id : null,
            };
          });
        colonnes = ['Nom', "Chargé d'affaires", 'Type', 'Ville', 'Téléphone', 'Email', 'Canal', 'Affaire'];
      }

      // Le choix du responsable, partout ou il a un sens. Sans affaire rattachee il
      // n'y a rien a attribuer ; hors direction on affiche le nom sans le modifier,
      // la distribution restant un acte de la direction.
      const choixResponsable = (dealId, ownerId, activity = KEY) => {
        if (!dealId) return '<span class="muted">—</span>';
        if (!scope.isDirection) return ownerId ? esc(userName(ownerId)) : '<span class="pill warn">À attribuer</span>';
        return `<select data-attr="${dealId}" aria-label="Chargé d'affaires">
          <option value="">${ownerId ? '—' : 'À attribuer…'}</option>
          ${candidatsResponsable(activity).map(u => `<option value="${u.id}" ${u.id === ownerId ? 'selected' : ''}>${esc(u.full_name)}${u.role === 'direction' ? ' (direction)' : ''}</option>`).join('')}
        </select>`;
      };

      const compte = (v) => {
        if (v === 'leads') return aTraiter().length;
        if (v === 'archives') return tousContacts.filter(c => !estActive(c)).length + toutesOrgs.filter(o => !estActive(o)).length;
        if (v === 'partenaires') return orgs.filter(o => o.type === 'Partenaire').length;
        if (v === 'courtiers') return orgs.filter(o => o.partner_job === 'Courtier').length;
        if (v === 'tous') return contacts.filter(c => !clientActif(c) && !enPile(c)).length;
        return contacts.filter(clientActif).length;
      };

      root.innerHTML = cadre('#/btp/base', "Base de données", `
        <div class="toolbar">
          <div class="seg">${vues().map(v => `<button data-vue="${v.key}" class="${state.vue === v.key ? 'active' : ''}">${v.label} <span class="cnt">${compte(v.key)}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <button class="btn ghost sm" id="b-export">Export CSV</button>
          ${surLeads ? '<button class="btn" id="b-lead">+ Nouveau lead</button>'
            : surArchives ? ''
            : `<button class="btn" id="b-new">+ ${surOrg ? (state.vue === 'courtiers' ? 'Courtier' : 'Partenaire') : 'Contact'}</button>`}
        </div>
        ${surArchives ? `<p class="muted small" style="margin:-4px 0 12px">Les fiches mises de côté. <b>Rien n'a été supprimé</b>&nbsp;: affaires, tâches et historique sont intacts, et une fiche restaurée revient exactement là où elle était.${scope.canSupprimerFiche ? ' La suppression définitive, elle, n\'est possible que d\'ici et n\'appartient qu\'à la direction.' : ''}</p>` : ''}
        ${surLeads ? `<p class="muted small" style="margin:-4px 0 12px">Les demandes dont le premier entretien téléphonique n'a pas encore eu lieu&nbsp;: formulaire du site, apport d'un partenaire ou d'un courtier, ou saisie à la main. Choisissez un chargé d'affaires pour la confier ; le lead quitte cette pile une fois l'entretien passé, et son contact devient client.</p>` : ''}
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un nom, une ville, un email…')}
          ${surOrg || surLeads ? '' : `<select id="b-canal"><option value="">Tous les canaux</option>${CHANNELS.map(c => `<option ${state.canal === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`}
          <span class="muted small">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}</span>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr>${colonnes.map(c => `<th>${c}</th>`).join('')}${surLeads ? '' : '<th></th>'}</tr></thead>
            <tbody>${surLeads ? lignes.map(r => `<tr class="click" data-lead="${r.id}">
              <td class="small">${esc(fmtDate(r.recu))}</td>
              <td class="small"${r.detailOrigine ? ` title="${esc(r.detailOrigine)}"` : ''}>${r.origine ? esc(r.origine) : '<span class="muted">—</span>'}</td>
              <td>${marqueMission(r.mission)}<b>${esc(r.nom)}</b></td>
              <td>${esc(r.client || '—')}</td>
              <td class="${r.rdvPasse ? 'status-lost' : ''}">${r.rdv ? esc(r.rdv) : '<span class="pill warn">À planifier</span>'}</td>
              <td>${choixResponsable(r.id, r.ownerId, r.activity)}</td>
              <td class="num acts">${r.mail
                ? `<a class="btn ghost sm" href="${esc(r.mail)}" title="Préparer le message de transmission au chargé d'affaires">✉</a>`
                : `<span class="muted small" title="${r.ownerId ? "Ce chargé d'affaires n'a pas d'adresse e-mail dans son profil" : 'Attribuez le lead pour pouvoir le transmettre'}">—</span>`}</td>
            </tr>`).join('') || `<tr><td colspan="7"><div class="empty">Aucun lead en attente. Tout est distribué.</div></td></tr>` : lignes.map(r => `<tr class="click" data-fiche="${r.id}">
              <td><b>${esc(r.nom)}</b></td>
              ${r.org || surArchives ? '' : `<td>${choixResponsable(r.dealId, r.ownerId)}</td>`}
              <td>${esc(r.detail || '—')}</td>
              <td>${esc(r.ville || '—')}</td>
              <td>${r.tel ? `<a href="tel:${esc(r.tel)}">${esc(r.tel)}</a>` : '—'}</td>
              <td>${r.mail ? `<a href="mailto:${esc(r.mail)}">${esc(r.mail)}</a>` : '—'}</td>
              ${surArchives ? `<td class="small">${esc(fmtDate(r.archive))}</td>`
                : r.org ? `<td class="num">${r.apports}</td>`
                : `<td>${esc(r.canal)}</td><td>${r.affaire ? esc(r.affaire) : '—'}</td>`}
              <td class="num acts">${surArchives
                ? `<button type="button" class="btn ghost sm" data-restaurer="${r.id}" data-org="${r.org ? 1 : ''}" title="Remettre cette fiche dans les listes actives">↩ Restaurer</button>${scope.canSupprimerFiche
                    ? `<button type="button" class="btn ghost sm danger" data-suppr="${r.id}" data-org="${r.org ? 1 : ''}" title="Supprimer définitivement, avec ses affaires et son historique">🗑</button>` : ''}`
                : `<button type="button" class="btn ghost sm" data-modif="${r.id}" title="Modifier">✎</button><button type="button" class="btn ghost sm" data-archiver="${r.id}" title="Archiver : la fiche sort des listes, rien n'est supprimé">🗄</button>${scope.canSupprimerFiche
                    ? `<button type="button" class="btn ghost sm danger" data-suppr="${r.id}" data-org="${r.org ? 1 : ''}" title="Supprimer définitivement, avec ses affaires et son historique">🗑</button>` : ''}`}</td>
            </tr>`).join('') || `<tr><td colspan="${colonnes.length + 1}"><div class="empty">Aucune fiche dans cette vue.</div></td></tr>`}</tbody>
          </table></div>
        </div>`);

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });
      root.querySelector('#b-canal')?.addEventListener('change', e => { state.canal = e.target.value; draw(); });
      // La ligne ouvre la fiche complète ; le crayon va droit au formulaire, d'où l'on
      // peut aussi supprimer (le CRM refuse la suppression d'un contact qui porte des affaires).
      // Attribuer depuis la liste : un choix dans le selecteur suffit, la ligne
      // quitte la pile au redessin. Meme chemin que le bouton de la fiche
      // d'affaire — responsable, taches orphelines et trace dans l'historique.
      root.querySelectorAll('[data-attr]').forEach(sel => sel.onchange = async () => {
        const id = sel.value; if (!id) return;
        const d = db.byId('deals', sel.dataset.attr);
        sel.disabled = true;
        try { await assignerResponsable(d, id); toast(`« ${d.title} » attribué à ${userName(id)}`); }
        catch (e) { sel.disabled = false; return toast(e.message, 'err'); }
        draw();
      });
      // La ligne ouvre l'affaire, sauf si l'on vise le selecteur.
      root.querySelectorAll('[data-lead]').forEach(tr => tr.onclick = (e) => {
        // Le sélecteur et le lien de transmission vivent leur vie : ouvrir la
        // fiche par-dessus les avalerait.
        if (e.target.closest('select, a')) return;
        openDeal(tr.dataset.lead, draw);
      });
      root.querySelectorAll('[data-fiche]').forEach(tr => tr.onclick = (e) => {
        if (e.target.closest('[data-modif], [data-archiver], [data-restaurer], [data-suppr]')) return;
        // Dans les archives les deux natures cohabitent : c'est la ligne qui dit
        // laquelle, pas l'onglet.
        const org = surArchives ? !!db.byId('organisations', tr.dataset.fiche) : surOrg;
        org ? openOrg(tr.dataset.fiche, draw) : openContact(tr.dataset.fiche, draw);
      });
      root.querySelectorAll('[data-modif]').forEach(b => b.onclick = () => (surOrg
        ? orgForm(db.byId('organisations', b.dataset.modif), draw)
        : contactForm(db.byId('contacts', b.dataset.modif), draw)));
      root.querySelectorAll('[data-archiver]').forEach(b => b.onclick = () =>
        archiverFiche(surOrg ? 'organisations' : 'contacts', b.dataset.archiver, draw));
      root.querySelectorAll('[data-restaurer]').forEach(b => b.onclick = () =>
        restaurerFiche(b.dataset.org ? 'organisations' : 'contacts', b.dataset.restaurer, draw));
      root.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () =>
        supprimerDefinitivement(b.dataset.org ? 'organisations' : 'contacts', b.dataset.suppr, draw));
      root.querySelector('#b-new')?.addEventListener('click', () => nouveau());
      // Une affaire neuve nait a la premiere etape du pipeline : elle atterrit
      // donc dans cette pile, exactement comme un lead venu du site.
      root.querySelector('#b-lead')?.addEventListener('click', () => dealForm(KEY, null, {}, draw));
      root.querySelector('#b-export').onclick = () => csvDownload(`btp-${state.vue}.csv`, lignes.map(({ id, org, dealId, lead, activity, ownerId, mail, rdvPasse, ...reste }) => reste));
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Fiches DTU
// Présentation reprise du centre de ressources du tableau de bord RGD Renova :
// les fiches sont rangées en chapitres par domaine, et une fiche s'ouvre en pleine
// page — hero, points clés à maîtriser, erreurs fréquentes à éviter.
// Les teintes ci-dessous appartiennent au contenu (le domaine du bâtiment), pas à
// l'interface : l'accent du CRM reste celui de la structure ouverte.
const DOMAINES = {
  'Maçonnerie': { icon: '🧱', tint: '#a26a3c', tagline: 'Murs porteurs, chaînages, dallages et enduits — le squelette du bâtiment' },
  'Bois': { icon: '🪵', tint: '#8e6c3c', tagline: 'Ossature, charpente, panneaux — la structure qui travaille avec l’humidité' },
  'Charpente': { icon: '🪵', tint: '#8e6c3c', tagline: 'Structures bois, ossatures et façades — la colonne vertébrale' },
  'Couverture': { icon: '🏠', tint: '#d9472b', tagline: 'Tuiles, ardoises, zinc — la première ligne de défense contre les intempéries' },
  'Étanchéité': { icon: '💧', tint: '#3b9eae', tagline: 'Toitures-terrasses, planchers extérieurs — zéro tolérance à l\'infiltration' },
  'Façades': { icon: '🏛️', tint: '#a89478', tagline: 'Enduits, revêtements, chapes — la peau visible du bâti' },
  'Fondations': { icon: '⛰️', tint: '#7a6a55', tagline: 'Semelles, dallages, cuvelage — ce sur quoi tout repose' },
  'Plâtrerie': { icon: '🧰', tint: '#9a9a9a', tagline: 'Cloisons sèches, doublages, plafonds — le plus utilisé en rénovation' },
  'Isolation': { icon: '🧥', tint: '#d9a527', tagline: 'ITI, combles, planchers — au cœur de la rénovation énergétique' },
  'Plomberie': { icon: '🚿', tint: '#3b9eae', tagline: 'Alimentation, évacuation, ANC — hygiène et confort quotidien' },
  'Chauffage': { icon: '🔥', tint: '#FD7A2C', tagline: 'Chaudières, planchers chauffants — la performance thermique' },
  'Ventilation': { icon: '🌀', tint: '#5b8def', tagline: 'VMC simple et double flux — évacuation de l\'humidité intérieure' },
  'Sols': { icon: '🟫', tint: '#8e6c3c', tagline: 'Parquets, PVC, résines — le sol qui vit tous les jours' },
  'Carrelage': { icon: '◼️', tint: '#4a4a4a', tagline: 'Sols scellés et collés — un des DTU les plus expertisés' },
  'Parquet': { icon: '🪵', tint: '#8e6c3c', tagline: 'Cloué, collé, flottant — trois familles, trois DTU distincts' },
  'Peinture': { icon: '🎨', tint: '#FD7A2C', tagline: 'Peintures, papiers peints, revêtements muraux — la finition visible' },
  'Finitions': { icon: '🎨', tint: '#FD7A2C', tagline: 'Peintures et revêtements muraux — la finition visible' },
  'Menuiseries': { icon: '🪟', tint: '#5b8def', tagline: 'Fenêtres et portes — étanchéité à l\'air et à l\'eau critique' },
  'Électricité': { icon: '⚡', tint: '#d9a527', tagline: 'NF C 15-100 — la sécurité des personnes' },
  'Fumisterie': { icon: '🔥', tint: '#b0553a', tagline: 'Conduits de fumée et raccordements — risque incendie et monoxyde' },
};
const domaineMeta = (d) => DOMAINES[d] || { icon: '📐', tint: '#7a8794', tagline: 'Normes techniques du domaine' };

const DTU_FORM = [
  { key: 'code', label: 'Numéro', required: true, half: true, placeholder: 'NF DTU 20.1' },
  { key: 'domain', label: 'Domaine', half: true, placeholder: 'Maçonnerie' },
  { key: 'title', label: 'Intitulé', required: true },
  { key: 'summary', label: 'Ce que couvre la norme', type: 'textarea', rows: 3 },
  { key: 'key_points', label: 'Points clés à maîtriser', type: 'textarea', rows: 8, hint: 'Une ligne par point, sous la forme « Titre :: explication ».' },
  { key: 'common_errors', label: 'Erreurs fréquentes à éviter', type: 'textarea', rows: 6, hint: 'Même forme : « Titre :: ce qu\'on observe ».' },
  { key: 'checkpoints', label: 'Points de contrôle du cabinet', type: 'textarea', rows: 6, hint: 'Votre pratique de terrain, une ligne par point.' },
  { key: 'link', label: 'Lien vers la norme', half: true, placeholder: 'https://…' },
  { key: 'essential', label: 'Marquer « Top 10 »', type: 'checkbox', half: true },
  { key: 'notes', label: 'Notes internes', type: 'textarea', rows: 3 },
];

// Les listes {titre, detail} s'éditent en texte : une ligne, deux points doubles.
const listeVersTexte = (l) => (Array.isArray(l) ? l : []).map(p => `${p.titre} :: ${p.detail}`).join('\n');
const texteVersListe = (t) => String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.indexOf('::');
  return i === -1 ? { titre: l, detail: '' } : { titre: l.slice(0, i).trim(), detail: l.slice(i + 2).trim() };
});
const asListe = (v) => Array.isArray(v) ? v : [];
const enClair = (t) => esc(t).replace(/\n/g, '<br>');

export const btpDtuPage = {
  title: () => 'BTP Expertise — DTU',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { q: '', domaine: '', essentiels: false, fiche: null, focus: null };

    const editer = (f, apres) => {
      const valeurs = f ? { ...f, key_points: listeVersTexte(f.key_points), common_errors: listeVersTexte(f.common_errors) } : {};
      const m = openModal(f ? `Fiche ${f.code}` : 'Nouvelle fiche', `<form class="form" id="dtu-form">${grilleBtp(DTU_FORM, valeurs)}
        <div class="form-actions">${f ? '<button type="button" class="btn ghost" id="dtu-del">Supprimer</button>' : ''}
        <button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`, { wide: true });
      lierSegments(m);
      m.querySelector('#dtu-form').onsubmit = async (e) => {
        e.preventDefault();
        const v = lireGrille(e.target, DTU_FORM);
        v.key_points = texteVersListe(v.key_points);
        v.common_errors = texteVersListe(v.common_errors);
        try {
          if (f) await db.update('dtu_sheets', f.id, v); else await db.insert('dtu_sheets', { ...v, position: 999 });
          closeModal(true); toast('Fiche enregistrée'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
      m.querySelector('#dtu-del')?.addEventListener('click', async () => {
        if (!await confirm(`Supprimer la fiche ${f.code} ?`)) return;
        await db.remove('dtu_sheets', f.id); closeModal(true); toast('Fiche supprimée'); state.fiche = null; apres();
      });
    };

    // ---- Une fiche, en pleine page
    const section = (titre, kicker, icone, items, type, tint) => asListe(items).length ? `
      <section class="fiche-section ${type}">
        <div class="fiche-section-head">
          <span class="fiche-section-icon" style="background:${tint}1e;color:${tint}">${icone}</span>
          <div><div class="fiche-section-kicker">${kicker}</div><h2>${esc(titre)}</h2></div>
        </div>
        <div class="fiche-points">${asListe(items).map((p, i) => `
          <div class="fiche-point">
            <span class="fiche-point-num" style="background:${tint}1e;color:${tint}">${i + 1}</span>
            <div><div class="fiche-point-title">${esc(p.titre)}</div>${p.detail ? `<div class="fiche-point-detail">${enClair(p.detail)}</div>` : ''}</div>
          </div>`).join('')}</div>
      </section>` : '';

    const ficheHtml = (f) => {
      const meta = domaineMeta(f.domain);
      const perso = (f.checkpoints || '').split('\n').filter(Boolean);
      return `
        <div class="fiche-topbar">
          <button type="button" class="btn ghost sm" id="f-back">← Toutes les fiches</button>
          <span class="grow"></span>
          ${f.link ? `<a class="btn ghost sm" href="${esc(f.link)}" target="_blank" rel="noopener">Voir la norme ↗</a>` : ''}
          <button type="button" class="btn ghost sm" id="f-pdf">⬇ PDF</button>
          <button type="button" class="btn sm" id="f-edit">Modifier</button>
        </div>
        <article class="fiche-detail">
          <header class="fiche-hero" style="background:linear-gradient(135deg,${meta.tint}18 0%,${meta.tint}08 100%)">
            <div class="fiche-hero-icon" style="background:${meta.tint}25;color:${meta.tint}">${meta.icon}</div>
            <div>
              <div class="fiche-hero-meta">
                <span class="fiche-hero-eyebrow" style="color:${meta.tint}">Normes DTU</span>
                ${f.domain ? `<span class="fiche-hero-sep">·</span><span>${esc(f.domain)}</span>` : ''}
                ${f.essential ? '<span class="fiche-hero-badge">★ Top 10</span>' : ''}
              </div>
              <h1 class="fiche-hero-title"><span style="color:${meta.tint}">${esc(f.code)}</span> — ${esc(f.title)}</h1>
              ${f.summary ? `<p class="fiche-hero-resume">${enClair(f.summary)}</p>` : ''}
            </div>
          </header>
          <div class="fiche-content">
            ${section('Points clés à maîtriser', 'À MAÎTRISER', '✓', f.key_points, 'ok', meta.tint)}
            ${section('Erreurs fréquentes à éviter', 'À ÉVITER', '⚠', f.common_errors, 'err', 'var(--red)')}
            ${section('Points de contrôle du cabinet', 'SUR PLACE', '☑', perso.map(l => ({ titre: l, detail: '' })), 'perso', 'var(--accent)')}
            ${!perso.length ? '<div class="card"><div class="empty">Aucun point de contrôle du cabinet. « Modifier » pour y mettre votre pratique de terrain.</div></div>' : ''}
            ${f.notes ? `<section class="fiche-section"><div class="fiche-section-head"><div><div class="fiche-section-kicker">INTERNE</div><h2>Notes</h2></div></div><p>${enClair(f.notes)}</p></section>` : ''}
          </div>
        </article>`;
    };

    // ---- La liste, en chapitres par domaine
    const carte = (f) => {
      const meta = domaineMeta(f.domain);
      const pts = asListe(f.key_points).length, errs = asListe(f.common_errors).length;
      const perso = (f.checkpoints || '').split('\n').filter(Boolean).length;
      return `<button type="button" class="fiche-card" data-f="${f.id}" style="--tint:${meta.tint}">
        <span class="fiche-card-accent"></span>
        <div class="fiche-card-head">
          <span class="fiche-card-code">${esc(f.code)}</span>
          ${f.essential ? '<span class="fiche-card-badge">★ Top 10</span>' : ''}
        </div>
        <div class="fiche-card-title">${esc(f.title)}</div>
        ${f.summary ? `<div class="fiche-card-resume">${esc(f.summary)}</div>` : ''}
        <div class="fiche-card-foot">
          <span class="muted small">${pts ? `${pts} point${pts > 1 ? 's' : ''} clé${pts > 1 ? 's' : ''}` : 'à documenter'}${errs ? ` · ${errs} erreur${errs > 1 ? 's' : ''}` : ''}${perso ? ` · ${perso} contrôle${perso > 1 ? 's' : ''}` : ''}</span>
          <span class="fiche-card-arrow">Lire la fiche →</span>
        </div>
      </button>`;
    };

    // Export : mise en page reprise de l'export PDF du tableau de bord RGD Renova.
    // Chaque fiche est un tableau : le thead et le tfoot se répètent sur chaque page
    // (seule méthode fiable en impression), d'où le bandeau de pied sur toutes les
    // pages. @page sans marge supprime les mentions automatiques du navigateur.
    const exporter = (fiches) => {
      const SAUT = String.fromCharCode(10);
      const jour = new Date().toLocaleDateString('fr-FR');
      // Groupées par domaine pour que les fiches d'un même métier se suivent
      const noms = [...new Set(fiches.map(f => f.domain || 'Sans domaine'))];
      const groupes = noms.map(d => [d, domaineMeta(d), fiches.filter(f => (f.domain || 'Sans domaine') === d)]);

      const section = (kicker, titre, icone, cls, items) => asListe(items).length ? `
        <section class="pdf-section">
          <div class="pdf-section-header">
            <div class="pdf-section-icon ${cls}-icon">${icone}</div>
            <div>
              <div class="pdf-section-kicker ${cls}-kicker">${kicker}</div>
              <h2 class="pdf-section-title">${esc(titre)}</h2>
            </div>
          </div>
          <div class="pdf-points">${asListe(items).map((p, i) => `
            <div class="pdf-point">
              <span class="pdf-point-num ${cls}-num">${String(i + 1).padStart(2, '0')}</span>
              <div class="pdf-point-body">
                <div class="pdf-point-title">${esc(p.titre)}</div>
                ${p.detail ? `<div class="pdf-point-detail">${enClair(p.detail)}</div>` : ''}
              </div>
            </div>`).join('')}</div>
        </section>` : '';

      const page = (f, meta) => {
        const perso = (f.checkpoints || '').split(SAUT).filter(Boolean);
        return `<table class="pdf-doc" style="--t:${meta.tint}">
          <thead><tr><td><div class="pdf-header-spacer"></div></td></tr></thead>
          <tfoot><tr><td>
            <div class="pdf-footer">
              <span class="pdf-footer-logo-wrap"><img class="pdf-footer-logo" src="assets/logos/btp.png" alt="BTP Expertise" onerror="this.remove()"></span>
              <span class="pdf-footer-text"><strong>Document interne</strong><br>${esc(f.code)} · édité le ${jour}</span>
            </div>
          </td></tr></tfoot>
          <tbody><tr><td>
            <div class="pdf-hero">
              <div class="pdf-hero-icon">${meta.icon}</div>
              <div class="pdf-hero-body">
                <div class="pdf-hero-kicker">NORMES DTU${f.domain ? ` · ${esc(f.domain.toUpperCase())}` : ''}${f.essential ? ' · ★ TOP 10' : ''}</div>
                <h1 class="pdf-hero-title"><span class="pdf-hero-code">${esc(f.code)}</span> — ${esc(f.title)}</h1>
                ${f.summary ? `<p class="pdf-hero-resume">${enClair(f.summary)}</p>` : ''}
              </div>
            </div>
            <div class="pdf-content-inner">
              ${section('À MAÎTRISER', 'Points clés à maîtriser', '✓', 'pdf-check', f.key_points)}
              ${section('À ÉVITER', 'Erreurs fréquentes à éviter', '⚠', 'pdf-warn', f.common_errors)}
              ${section('SUR PLACE', 'Points de contrôle du cabinet', '☑', 'pdf-site', perso.map(l => ({ titre: l, detail: '' })))}
              ${f.link ? `<p class="pdf-lien">Texte officiel : ${esc(f.link)}</p>` : ''}
            </div>
          </td></tr></tbody>
        </table>`;
      };

      const zone = document.getElementById('print-root') || Object.assign(document.createElement('div'), { id: 'print-root' });
      // Le document commence directement par la première fiche : ni couverture ni
      // sommaire, ils ne faisaient qu'ajouter des pages à faire défiler.
      zone.innerHTML = groupes.map(([, meta, l]) => l.map(f => page(f, meta)).join('')).join('');

      if (!zone.parentNode) document.body.appendChild(zone);
      document.body.classList.add('impression');
      const fini = () => { document.body.classList.remove('impression'); window.removeEventListener('afterprint', fini); };
      window.addEventListener('afterprint', fini);
      setTimeout(() => window.print(), 60);
    };

    const draw = () => {
      const toutes = db.t('dtu_sheets').slice()
        .sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.code).localeCompare(String(b.code)));

      if (state.fiche) {
        const f = db.byId('dtu_sheets', state.fiche);
        if (!f) { state.fiche = null; return draw(); }
        root.innerHTML = cadre('#/btp/dtu', 'DTU', ficheHtml(f));
        root.querySelector('#f-back').onclick = () => { state.fiche = null; draw(); };
        root.querySelector('#f-edit').onclick = () => editer(f, draw);
        root.querySelector('#f-pdf').onclick = () => exporter([f]);
        return;
      }

      const ts = terms(state.q);
      const domaines = [...new Set(toutes.map(f => f.domain).filter(Boolean))];
      const liste = toutes
        .filter(f => !state.domaine || f.domain === state.domaine)
        .filter(f => !state.essentiels || f.essential)
        .filter(f => hit([f.code, f.title, f.domain, f.summary, f.checkpoints, f.notes,
          listeVersTexte(f.key_points), listeVersTexte(f.common_errors)], ts));
      const parDomaine = domaines
        .map(d => [d, liste.filter(f => f.domain === d)])
        .concat([['Sans domaine', liste.filter(f => !f.domain)]])
        .filter(([, l]) => l.length);

      root.innerHTML = cadre('#/btp/dtu', 'DTU', `
        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher un numéro, un mot du titre, un point de contrôle…')}
          <select id="b-dom"><option value="">Tous les domaines</option>${domaines.slice().sort().map(d => `<option ${state.domaine === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
          <button type="button" class="btn ghost sm ${state.essentiels ? 'on' : ''}" id="b-ess" aria-pressed="${state.essentiels}">★ Top 10</button>
          <span class="muted small">${liste.length} fiche${liste.length > 1 ? 's' : ''}</span>
          <span class="grow"></span>
          <button class="btn ghost sm" id="b-pdf">⬇ Exporter en PDF</button>
          <button class="btn" id="b-new">+ Fiche</button>
        </div>
        ${parDomaine.map(([d, l], i) => {
          const meta = domaineMeta(d);
          return `<section class="domaine-section">
            <div class="domaine-chapter" style="background:linear-gradient(135deg,${meta.tint}12 0%,${meta.tint}03 100%)">
              <div class="domaine-chapter-num" style="color:${meta.tint}">${String(i + 1).padStart(2, '0')}</div>
              <div class="domaine-chapter-icon" style="background:${meta.tint}22;color:${meta.tint}">${meta.icon}</div>
              <div class="domaine-chapter-body">
                <div class="domaine-chapter-kicker" style="color:${meta.tint}">CHAPITRE ${String(i + 1).padStart(2, '0')}</div>
                <h2>${esc(d)}</h2>
                <p>${esc(meta.tagline)}</p>
              </div>
              <div class="domaine-chapter-count" style="background:${meta.tint}">${l.length}</div>
            </div>
            <div class="fiches-grid">${l.map(carte).join('')}</div>
          </section>`;
        }).join('') || '<div class="card"><div class="empty">Aucune fiche. Lancez <code>supabase/lot7-btp-dtu.sql</code> pour charger le référentiel, ou créez la première.</div></div>'}`);

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelector('#b-dom').onchange = e => { state.domaine = e.target.value; draw(); };
      root.querySelector('#b-ess').onclick = () => { state.essentiels = !state.essentiels; draw(); };
      root.querySelector('#b-new').onclick = () => editer(null, draw);
      root.querySelector('#b-pdf').onclick = () => exporter(liste);
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { state.fiche = b.dataset.f; draw(); });
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Mails & modèles
// Les séquences du cabinet, rangées comme dans le dossier d'origine : trois
// dossiers, chacun sa couleur, et à l'intérieur la chronologie des envois avec
// la référence de chaque mail (C1…C5, E1…E14, B1…B14).
const SEQUENCES = [
  { theme: 'Avant le rendez-vous téléphonique', court: 'Avant le RDV', icon: '☎', tint: '#D97B1E',
    sous: 'De la prise de rendez-vous au premier échange' },
  { theme: 'Séquence expertise', court: 'Expertise', icon: '🔍', tint: '#0D6E9E',
    sous: 'Du devis à la remise du rapport' },
  { theme: 'Séquence AMO', court: 'AMO', icon: '🏗', tint: '#7B4FAE',
    sous: "De la proposition d'accompagnement au suivi post-mission" },
];
const sequenceDe = (theme) => SEQUENCES.find(s => s.theme === theme)
  || { theme, court: theme, icon: '✉', tint: '#7a8794', sous: '' };

const MAIL_FORM = [
  { key: 'theme', label: 'Séquence', type: 'select', options: SEQUENCES.map(s => s.theme), required: true, half: true },
  { key: 'ref', label: 'Référence', half: true, placeholder: 'E7' },
  { key: 'title', label: 'Nom du modèle', required: true },
  { key: 'trigger_text', label: 'Quand l\'envoyer', half: true, placeholder: 'Trois jours après le devis, sans réponse' },
  { key: 'mode', label: 'Mode', type: 'select', options: ['Manuel', 'Automatique'], half: true },
  { key: 'subject', label: 'Objet du mail' },
  { key: 'body', label: 'Corps du mail', type: 'textarea', rows: 16, required: true },
];

export const btpMailsPage = {
  title: () => 'BTP Expertise — Mails & modèles',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { seq: SEQUENCES[0].theme, q: '', modele: null, focus: null, dossier: null, dest: '', saisie: {} };

    const editer = (m0, apres) => {
      const m = openModal(m0 ? `${m0.ref ? m0.ref + ' — ' : ''}${m0.title}` : 'Nouveau modèle',
        `<form class="form" id="mail-form">${grilleBtp(MAIL_FORM, m0 || { theme: state.seq })}
          <div class="form-actions">${m0 ? '<button type="button" class="btn ghost" id="mail-del">Supprimer</button>' : ''}
          <button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div></form>`,
        { wide: true });
      lierSegments(m);
      m.querySelector('#mail-form').onsubmit = async (e) => {
        e.preventDefault();
        const v = lireGrille(e.target, MAIL_FORM);
        try {
          if (m0) await db.update('mail_templates', m0.id, v);
          else await db.insert('mail_templates', { ...v, activity: KEY, position: 999 });
          closeModal(true); toast('Modèle enregistré'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
      m.querySelector('#mail-del')?.addEventListener('click', async () => {
        if (!await confirm(`Supprimer le modèle « ${m0.title} » ?`)) return;
        await db.remove('mail_templates', m0.id); closeModal(true); toast('Modèle supprimé');
        state.modele = null; apres();
      });
    };

    const auto = (m) => (m.mode || '').toLowerCase() === 'automatique';

    // ---- Composer un mail à partir d'un modèle
    // Les crochets du modèle ne se demandent plus dans une fenêtre qui bloque :
    // on choisit le dossier, le CRM y prend ce qu'il sait (prénom, adresse,
    // référence, montant, date de visite), et ce qui reste se saisit au-dessus de
    // l'aperçu, qui se met à jour à mesure. Ce qu'on voit est ce qui part.
    const dossiersBtp = () => db.t('deals')
      .filter(d => d.activity === KEY)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const dossierCourant = () => (state.dossier ? db.byId('deals', state.dossier) : null);
    const valeursDe = () => ({ ...donneesDossier(dossierCourant()), ...state.saisie });

    const sujetFinal = (m) => remplir(m.subject || '', valeursDe());
    const htmlFinal = (m, logo) => mailHtml(sujetFinal(m), remplir(m.body || '', valeursDe()), logo);

    // Dans l'aperçu seulement, les crochets encore vides sont surlignés. Le mail
    // envoyé ne porte évidemment pas ce surlignage.
    const htmlApercu = (m) => mailHtml(sujetFinal(m), remplir(m.body || '', valeursDe()), URL_LOGO).replace(CROCHETS,
      (brut) => `<span style="background:#FFE9A8;color:#7A5B00;border-radius:3px;padding:0 3px">${brut}</span>`);

    const trousDe = (m) => champsDe(`${m.subject || ''}\n${m.body || ''}`, donneesDossier(dossierCourant()));

    const texteFinal = (m) => {
      const v = valeursDe();
      const s = remplir(m.subject || '', v);
      return s ? `${s}\n\n${remplir(m.body || '', v)}` : remplir(m.body || '', v);
    };

    // ---- Un modèle, en pleine page
    const vueModele = (m) => {
      const s = sequenceDe(m.theme);
      const dossiers = dossiersBtp();
      const trous = trousDe(m);
      return `
      <div class="fiche-topbar">
        <button type="button" class="btn ghost sm" id="m-back">← ${esc(s.court)}</button>
        <span class="grow"></span>
        <button type="button" class="btn ghost sm" id="m-eml" title="Télécharge le mail entier, mise en page comprise ; à ouvrir avec Outlook">Fichier .eml</button>
        <button type="button" class="btn sm" id="m-open">Ouvrir dans Outlook</button>
        <button type="button" class="btn ghost sm" id="m-edit">Modifier</button>
      </div>
      <article class="card mail-envoi" style="--t:${s.tint}">
        <header class="mail-vue-tete">
          <span class="mail-vue-ref">${esc(m.ref || '—')}</span>
          <div class="mail-vue-corps">
            <div class="mail-vue-seq">${esc(s.icon)} ${esc(m.theme)}</div>
            <h2>${esc(m.title)}</h2>
            ${m.trigger_text ? `<p class="mail-vue-quand"><b>Quand&nbsp;:</b> ${esc(m.trigger_text)}</p>` : ''}
          </div>
          <span class="mail-mode ${auto(m) ? 'auto' : ''}">${esc(m.mode || 'Manuel')}</span>
        </header>

        <div class="mail-envoi-champs">
          <label class="mail-champ"><span>Dossier</span>
            <select id="m-dossier">
              <option value="">— aucun dossier —</option>
              ${dossiers.map(d => `<option value="${d.id}" ${d.id === state.dossier ? 'selected' : ''}>${esc(d.title || 'Sans titre')}</option>`).join('')}
            </select>
          </label>
          <label class="mail-champ"><span>Destinataire</span>
            <input type="email" id="m-dest" value="${esc(state.dest || '')}" placeholder="client@exemple.fr">
          </label>
          ${trous.map(c => `
            <label class="mail-champ trou"><span>${esc(c.label)}</span>
              <input type="text" data-trou="${esc(c.cle)}" value="${esc(state.saisie[c.cle] || '')}" placeholder="à compléter">
            </label>`).join('')}
        </div>
        <p class="mail-envoi-note muted small">${dossiers.length
          ? (state.dossier
            ? `Le CRM a rempli ce qu'il sait de ce dossier. ${trous.length ? `${trous.length} champ${trous.length > 1 ? 's' : ''} à compléter ci-dessus.` : 'Rien ne manque.'}`
            : `Choisissez un dossier pour que le CRM remplisse prénom, adresse, référence et montant.${trous.length ? ` ${trous.length} champs sont à compléter à la main pour l'instant.` : ''}`)
          : "Aucune affaire BTP dans le CRM pour l'instant : les champs se saisissent à la main."}</p>
      </article>

      <div class="mail-apercu"><iframe id="m-apercu" title="Aperçu du mail"></iframe></div>`;
    };

    // L'aperçu vit dans un cadre isolé : les styles du CRM ne doivent pas déteindre
    // sur le mail, ni l'inverse. On règle sa hauteur sur son contenu après chargement.
    let minuteur = null;
    const rafraichirApercu = (m) => {
      const vitre = root.querySelector("#m-apercu");
      if (!vitre) return;
      vitre.onload = () => {
        const d = vitre.contentDocument;
        if (d) vitre.style.height = Math.max(320, d.body.scrollHeight + 8) + 'px';
      };
      vitre.srcdoc = htmlApercu(m);
    };
    const rafraichirPlusTard = (m) => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => rafraichirApercu(m), 250);
    };

    const draw = () => {
      const tous = db.t('mail_templates').filter(m => m.activity === KEY);
      const ordre = (a, b) => (a.position || 0) - (b.position || 0) || String(a.ref || '').localeCompare(String(b.ref || ''));

      if (state.modele) {
        const m = db.byId('mail_templates', state.modele);
        if (!m) { state.modele = null; return draw(); }
        root.innerHTML = cadre('#/btp/mails', 'Mails & modèles', vueModele(m));
        rafraichirApercu(m);

        root.querySelector('#m-back').onclick = () => { state.seq = m.theme; state.modele = null; draw(); };
        root.querySelector('#m-edit').onclick = () => editer(m, draw);

        root.querySelector('#m-dossier').onchange = (e) => {
          state.dossier = e.target.value || null;
          state.dest = emailDu(dossierCourant()) || state.dest || '';
          draw();
        };
        root.querySelector('#m-dest').oninput = (e) => { state.dest = e.target.value; };
        root.querySelectorAll('[data-trou]').forEach(champ => champ.oninput = () => {
          state.saisie[champ.dataset.trou] = champ.value;
          rafraichirPlusTard(m);
        });

        const restantsDe = () => trousDe(m).filter(c => !String(state.saisie[c.cle] || '').trim()).length;
        const alerteRestants = (n) => { if (n) toast(`${n} champ${n > 1 ? 's restent' : ' reste'} entre crochets`, 'warn'); };

        // Un seul geste : la mise en page part au presse-papiers et la fenêtre de
        // rédaction s'ouvre. L'ordre compte — voir ouvrirCompose dans btp-mail.js.
        root.querySelector('#m-open').onclick = () => {
          const copie = copierMiseEnPage(htmlFinal(m, URL_LOGO_PUBLIC), texteFinal(m))
            .then(() => true).catch(() => false);
          ouvrirCompose({ a: state.dest, sujet: sujetFinal(m) });
          copie.then(ok => {
            toast(ok
              ? 'Outlook s\'ouvre — posez la mise en page avec Ctrl+V'
              : 'Outlook s\'ouvre — la copie a été refusée, utilisez le fichier .eml', ok ? undefined : 'warn');
            alerteRestants(restantsDe());
          });
        };

        root.querySelector('#m-eml').onclick = async () => {
          try {
            await telechargerEml({
              a: state.dest, sujet: sujetFinal(m), html: htmlFinal(m),
              nom: `${m.ref || 'mail'}-${sujetFinal(m)}`,
            });
            toast('Mail téléchargé — ouvrez-le avec Outlook');
            alerteRestants(restantsDe());
          } catch (err) { toast(err.message, 'err'); }
        };
        return;
      }

      // Les séquences connues d'abord, puis celles qu'on aurait ajoutées à la main
      const autres = [...new Set(tous.map(m => m.theme))].filter(t => !SEQUENCES.some(s => s.theme === t));
      const dossiers = [...SEQUENCES, ...autres.map(sequenceDe)]
        .map(s => ({ ...s, mails: tous.filter(m => m.theme === s.theme).sort(ordre) }))
        .filter(d => d.mails.length);

      const ts = terms(state.q);
      const recherche = state.q.trim().length > 0;
      const trouves = tous.filter(m => hit([m.ref, m.title, m.theme, m.subject, m.body, m.trigger_text], ts)).sort(ordre);
      const courant = dossiers.find(d => d.theme === state.seq) || dossiers[0];

      const ligne = (m, s) => `
        <button type="button" class="mail-etape" data-m="${m.id}" style="--t:${s.tint}">
          <span class="mail-etape-ref">${esc(m.ref || '·')}</span>
          <span class="mail-etape-corps">
            <b>${esc(m.title)}</b>
            ${m.subject ? `<span class="mail-etape-objet">${esc(m.subject)}</span>` : ''}
            ${m.trigger_text ? `<span class="mail-etape-quand">${esc(m.trigger_text)}</span>` : ''}
          </span>
          <span class="mail-mode ${auto(m) ? 'auto' : ''}">${auto(m) ? 'Auto' : 'Manuel'}</span>
          <span class="mail-etape-act" data-envoi="${m.id}" role="button" tabindex="0" title="Ouvrir dans Outlook">Ouvrir</span>
        </button>`;

      root.innerHTML = cadre('#/btp/mails', 'Mails & modèles', `
        <div class="mail-dossiers">${dossiers.map(d => `
          <button type="button" class="mail-dossier ${d.theme === courant?.theme && !recherche ? 'on' : ''}" data-seq="${esc(d.theme)}" style="--t:${d.tint}">
            <span class="mail-dossier-ico">${esc(d.icon)}</span>
            <span class="mail-dossier-corps">
              <b>${esc(d.court)}</b>
              <span>${esc(d.sous)}</span>
            </span>
            <span class="mail-dossier-cnt">${d.mails.length}</span>
          </button>`).join('')}</div>

        <div class="toolbar">
          ${searchInput('b-q', state, 'Rechercher dans tous les mails…')}
          <span class="muted small">${recherche ? `${trouves.length} résultat${trouves.length > 1 ? 's' : ''} sur ${tous.length}` : `${courant ? courant.mails.length : 0} mail${courant && courant.mails.length > 1 ? 's' : ''} dans cette séquence`}</span>
          <span class="grow"></span>
          <button class="btn" id="b-new">+ Modèle</button>
        </div>

        ${recherche
          ? `<div class="card"><div class="mail-suite">${trouves.map(m => ligne(m, sequenceDe(m.theme))).join('') || '<div class="empty">Aucun modèle ne correspond.</div>'}</div></div>`
          : courant ? `<div class="card mail-seq" style="--t:${courant.tint}">
              <div class="mail-seq-tete">
                <span class="mail-seq-ico">${esc(courant.icon)}</span>
                <div><h2>${esc(courant.theme)}</h2><p>${esc(courant.sous)}</p></div>
              </div>
              <div class="mail-suite">${courant.mails.map(m => ligne(m, courant)).join('')}</div>
            </div>`
          : '<div class="card"><div class="empty">Aucun modèle. Lancez le script d&rsquo;import des séquences du cabinet, ou créez le premier.</div></div>'}`);

      bindSearch(root, 'b-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-seq]').forEach(b => b.onclick = () => { state.seq = b.dataset.seq; state.q = ''; draw(); });
      root.querySelector('#b-new').onclick = () => editer(null, draw);
      root.querySelectorAll('[data-m]').forEach(l => l.onclick = (e) => {
        if (e.target.closest('[data-envoi]')) return;
        state.modele = l.dataset.m; draw();
      });
      root.querySelectorAll('[data-envoi]').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const m = db.byId('mail_templates', b.dataset.envoi);
        if (m) envoyer(m);
      });
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Facturation
// En attendant Stripe, la facturation se suit sur l'affaire elle-même : trois champs
// (n° de facture, facturée le, payée le) rangés dans `fields`, comme les autres champs
// métier de l'activité. Le jour où Stripe est raccordé, ces colonnes deviendront le
// reflet des factures Stripe sans que l'écran change de forme.
const FACTU_FORM = [
  { key: 'facture_num', label: 'N° de facture', half: true, placeholder: '2026-014' },
  { key: 'facture_date', label: 'Facturée le', type: 'date', half: true },
  { key: 'paiement_date', label: 'Payée le', type: 'date', half: true },
];

const FACTU_VUES = [
  { key: 'a_facturer', label: 'À facturer' },
  { key: 'impayees', label: 'En attente de paiement' },
  { key: 'payees', label: 'Payées' },
  { key: 'toutes', label: 'Toutes' },
];

// Une mission est facturable dès que la prestation est engagée : à partir du RDV sur place.
const facturables = () => {
  const a = act();
  return deals().filter(d => d.status !== 'lost' && a.stages.find(s => s.key === d.stage)?.delivery);
};
const champ = (d, k) => ((d.fields || {})[k] || '').toString().trim();

export const btpFacturationPage = {
  title: () => 'BTP Expertise — Facturation',
  render(root) {
    if (guard(root)) return {};
    const coquille = poser(root);
    const state = { vue: 'a_facturer', q: '', focus: null };

    const saisir = (d, apres) => {
      const m = openModal(`Facturation — ${d.title}`,
        `<form class="form" id="factu-form">${grilleBtp(FACTU_FORM, d.fields || {})}
          <p class="small muted" style="flex-basis:100%;margin:0">Montant de la mission : <b>${d.amount ? eur(d.amount) : 'non renseigné'}</b> HT. Il se modifie sur la fiche de l&rsquo;affaire.</p>
          <div class="form-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
        </form>`);
      lierSegments(m);
      m.querySelector('#factu-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await db.update('deals', d.id, { fields: { ...(d.fields || {}), ...lireGrille(e.target, FACTU_FORM) } });
          closeModal(true); toast('Facturation enregistrée'); apres();
        } catch (err) { toast(err.message, 'err'); }
      };
    };

    const draw = () => {
      const a = act();
      const toutes = facturables();
      const anneeEnCours = String(new Date().getFullYear());

      const aFacturer = toutes.filter(d => !champ(d, 'facture_date'));
      const impayees = toutes.filter(d => champ(d, 'facture_date') && !champ(d, 'paiement_date'));
      const payees = toutes.filter(d => champ(d, 'paiement_date'));
      const somme = (l) => l.reduce((s, d) => s + (Number(d.amount) || 0), 0);
      const encaisse = somme(payees.filter(d => champ(d, 'paiement_date').slice(0, 4) === anneeEnCours));

      const listes = { a_facturer: aFacturer, impayees, payees, toutes };
      const lignes = (listes[state.vue] || toutes)
        .filter(d => hit([d.title, dealParty(d), champ(d, 'facture_num')], terms(state.q)))
        .sort((x, y) => (champ(y, 'facture_date') || y.stage_changed_at || '').localeCompare(champ(x, 'facture_date') || x.stage_changed_at || ''));

      root.innerHTML = cadre('#/btp/facturation', 'Facturation', `
        <div class="esp-kpis">
          ${kpi({ label: 'À facturer', valeur: eur(somme(aFacturer)), sous: `${aFacturer.length} mission${aFacturer.length > 1 ? 's' : ''} livrée${aFacturer.length > 1 ? 's' : ''} sans facture`, icone: '🧾', ton: 'accent', href: '#/btp/facturation' })}
          ${kpi({ label: 'En attente de paiement', valeur: eur(somme(impayees)), sous: `${impayees.length} facture${impayees.length > 1 ? 's' : ''} émise${impayees.length > 1 ? 's' : ''}`, icone: '⏳', ton: 'amber', href: '#/btp/facturation' })}
          ${kpi({ label: `Encaissé en ${anneeEnCours}`, valeur: eur(encaisse), sous: `${payees.length} mission${payees.length > 1 ? 's' : ''} payée${payees.length > 1 ? 's' : ''} au total`, icone: '✅', ton: 'green', href: '#/btp/facturation' })}
        </div>

        <div class="card btp-stripe">
          <div class="agenda-head"><span class="agenda-ico">💳</span><h2>Stripe</h2><span class="grow"></span><span class="badge-soft">pas encore raccordé</span></div>
          <p class="small muted" style="margin:0">En attendant, les trois colonnes ci-dessous se remplissent à la main : numéro de facture, date d&rsquo;émission, date de paiement. Une fois Stripe raccordé, elles suivront les factures automatiquement — l&rsquo;écran ne changera pas de forme, il cessera simplement d&rsquo;être tenu à la main.</p>
        </div>

        <div class="toolbar">
          <div class="seg">${FACTU_VUES.map(v => `<button data-vue="${v.key}" class="${state.vue === v.key ? 'active' : ''}">${v.label} <span class="cnt">${(listes[v.key] || []).length}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <button class="btn ghost sm" id="f-export">Export CSV</button>
        </div>
        <div class="toolbar">
          ${searchInput('f-q', state, 'Rechercher une mission, un client, un n° de facture…')}
          <span class="muted small">${lignes.length} ligne${lignes.length > 1 ? 's' : ''} · ${eur(somme(lignes))} HT</span>
        </div>

        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr><th>Mission</th><th>Client</th><th>Étape</th><th class="num">Montant HT</th><th>N° facture</th><th>Facturée le</th><th>Payée le</th><th></th></tr></thead>
            <tbody>${lignes.map(d => {
              const num = champ(d, 'facture_num'), fait = champ(d, 'facture_date'), paye = champ(d, 'paiement_date');
              const retard = fait && !paye && daysSince(fait) > 30;
              return `<tr>
                <td><b>${esc(d.title)}</b></td>
                <td>${esc(dealParty(d))}</td>
                <td>${esc(a.stages.find(s => s.key === d.stage)?.label || d.stage)}</td>
                <td class="num">${d.amount ? eur(d.amount) : '—'}</td>
                <td>${num ? esc(num) : '—'}</td>
                <td>${fait ? fmtDate(fait) : '<span class="muted">à émettre</span>'}</td>
                <td>${paye ? fmtDate(paye) : (fait ? `<span class="${retard ? 'retard' : 'muted'}">en attente${retard ? ` · ${daysSince(fait)} j` : ''}</span>` : '—')}</td>
                <td class="num"><button type="button" class="btn ghost sm" data-factu="${d.id}">Saisir</button></td>
              </tr>`;
            }).join('') || '<tr><td colspan="8"><div class="empty">Aucune mission dans cette vue.</div></td></tr>'}</tbody>
          </table></div>
        </div>`);

      bindSearch(root, 'f-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });
      root.querySelectorAll('[data-factu]').forEach(b => b.onclick = () => saisir(db.byId('deals', b.dataset.factu), draw));
      root.querySelector('#f-export').onclick = () => csvDownload('btp-facturation.csv', lignes.map(d => ({
        mission: d.title, client: dealParty(d), etape: a.stages.find(s => s.key === d.stage)?.label,
        montant_ht: d.amount, n_facture: champ(d, 'facture_num'), facturee_le: champ(d, 'facture_date'), payee_le: champ(d, 'paiement_date'),
      })));
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};
