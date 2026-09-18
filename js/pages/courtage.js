// Espace La Référence Courtage : le cabinet de courtage pilote son activité ici.
// Même présentation que RGD Renova et BTP Expertise — menu vertical à gauche, contenu à
// droite, aux couleurs de la structure. Trois écrans : la vue d'ensemble, la base de
// données du cabinet, et le vivier courtiers — le recrutement de la structure, qui vit
// désormais dans son espace.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, CHANNELS, weightedAmount } from '../data/schema.js';
import {
  esc, eur, daysSince, fmtDate, contactName, dealParty,
  terms, hit, searchInput, bindSearch, restoreFocus, csvDownload,
} from '../ui.js';
import { openDeal } from './deal.js';
import { contactForm, openContact } from './contacts.js';
import { orgForm, openOrg } from './organisations.js';
import { activityRowHtml, bindActivityRows, nextActivity } from './activity.js';
import { coquilleEspace, poserEspace, kpiEspace, archiverFiche, estActive } from './espace.js';
import { vivierPage } from './vivier.js';

const KEY = 'courtage';
const act = () => ACTIVITIES[KEY];
const deals = () => scope.deals().filter(d => d.activity === KEY);
const activities = () => {
  const ids = new Set(deals().map(d => d.id));
  return scope.activities().filter(a => a.deal_id && ids.has(a.deal_id));
};
const brokers = () => db.t('broker_profiles').filter(r => !r.archive);

const ONGLETS = [
  { hash: '#/courtage', label: "Vue d'ensemble" },
  { hash: '#/courtage/base', label: 'Base de données' },
  { hash: '#/courtage/vivier', label: 'Vivier courtiers' },
];

const cadre = (actif, titre, corps) => coquilleEspace({
  actif, titre, corps,
  cle: KEY, marque: act().label, baseline: 'Courtage en crédit immobilier', onglets: ONGLETS,
});

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité La Référence Courtage.</div></div>';
  return true;
};

// ---------------------------------------------------------------- Vue d'ensemble
export const courtageHomePage = {
  title: () => 'La Référence Courtage',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);

    const draw = () => {
      const a = act();
      const all = deals();
      const open = all.filter(d => d.status === 'open');
      const pondere = open.reduce((s, d) => s + weightedAmount(d), 0);
      const nouveaux = open.filter(d => ['lead', 'qualifie'].includes(d.stage));
      // À partir de « Transmis banque », le financement est engagé : c'est ce qui se suit de près.
      const banque = open.filter(d => ['banque', 'offre'].includes(d.stage));
      const sansSuite = open.filter(d => !nextActivity(d.id));

      // La pipeline, colonne par colonne, avec les affaires dedans
      const colonnes = a.stages.map(s => {
        const cartes = open.filter(d => d.stage === s.key);
        return { s, cartes, somme: cartes.reduce((t, d) => t + (Number(d.amount) || 0), 0) };
      });

      // Le recrutement, résumé ici et détaillé dans l'onglet Vivier courtiers
      const viv = brokers();
      const parSuivi = (k) => viv.filter(r => (r.suivi || 'new') === k).length;
      const aContacter = parSuivi('new');
      const enCours = viv.filter(r => ['contact', 'rdv'].includes(r.suivi || 'new')).length;
      const recrutes = parSuivi('ok');

      // Les prochaines échéances de l'équipe sur les dossiers de la structure
      const ouvertes = activities().filter(x => !x.done);
      const retard = ouvertes.filter(x => daysSince(x.due_date) > 0).sort((x, y) => x.due_date.localeCompare(y.due_date));
      const jour = ouvertes.filter(x => daysSince(x.due_date) === 0);

      root.innerHTML = cadre('#/courtage', "Vue d'ensemble", `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Nouveaux leads', valeur: nouveaux.length, sous: 'à qualifier et à appeler', icone: '📨', ton: 'accent', href: '#/pipeline/courtage' })}
          ${kpiEspace({ label: 'Dossiers ouverts', valeur: open.length, sous: `${eur(pondere)} de commissions pondérées`, icone: '📂', ton: 'green', href: '#/pipeline/courtage' })}
          ${kpiEspace({ label: 'En banque', valeur: banque.length, sous: 'transmis et offres éditées', icone: '🏦', ton: 'amber', href: '#/pipeline/courtage' })}
          ${kpiEspace({ label: 'Sans prochaine action', valeur: sansSuite.length, sous: 'dossiers à relancer', icone: '⚠', ton: 'red', href: '#/pipeline/courtage' })}
        </div>

        <div class="card">
          <div class="card-head"><h2>Pipeline dossiers</h2>
            <span class="muted small">${eur(open.reduce((s, d) => s + (Number(d.amount) || 0), 0))} de commissions estimées</span>
            <span class="grow"></span>
            <a class="btn ghost sm" href="#/pipeline/courtage">Voir la page complète →</a>
          </div>
          <div class="esp-kanban">${colonnes.map(({ s, cartes, somme }) => `
            <div class="esp-col">
              <div class="esp-col-head"><b>${esc(s.label)}</b><span>${cartes.length}</span></div>
              <div class="esp-col-sum">${somme ? eur(somme) : '—'}</div>
              <div class="esp-col-body">${cartes.map(d => `
                <button type="button" class="esp-card-deal" data-deal="${d.id}">
                  <b>${esc(d.title)}</b>
                  <span class="muted">${esc(dealParty(d))}</span>
                  ${d.amount ? `<span class="esp-card-amount">${eur(d.amount)}</span>` : ''}
                </button>`).join('') || '<div class="esp-col-vide">—</div>'}</div>
            </div>`).join('')}</div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Recrutement</h2>
            <span class="muted small">${viv.length} profil${viv.length > 1 ? 's' : ''} au vivier</span>
            <span class="grow"></span>
            <a class="btn ghost sm" href="#/courtage/vivier">Ouvrir le vivier →</a>
          </div>
          <div class="esp-kpis">
            ${kpiEspace({ label: 'À contacter', valeur: aContacter, sous: 'jamais approchés', icone: '📞', ton: 'accent', href: '#/courtage/vivier' })}
            ${kpiEspace({ label: 'En cours', valeur: enCours, sous: 'contactés, RDV pris', icone: '🤝', ton: 'amber', href: '#/courtage/vivier' })}
            ${kpiEspace({ label: 'Recrutés', valeur: recrutes, sous: 'entrés dans la structure', icone: '✓', ton: 'green', href: '#/courtage/vivier' })}
            ${kpiEspace({ label: 'Mandataires & indépendants', valeur: viv.filter(r => ['1', '3'].includes(r.prio)).length, sous: `cible directe · ${viv.filter(r => r.prio === '3').length} à vérifier`, icone: '🎯', ton: 'accent', href: '#/courtage/vivier' })}
          </div>
        </div>

        ${ouvertes.length ? `<div class="card">
          <div class="card-head"><h2>À faire sur les dossiers</h2>
            <span class="muted small">${retard.length} en retard · ${jour.length} aujourd&rsquo;hui</span>
          </div>
          ${[...retard, ...jour].slice(0, 12).map(x => activityRowHtml(x, { showContext: true })).join('')
            || '<div class="empty">Rien d&rsquo;échu : les prochaines actions sont plus loin dans le temps.</div>'}
        </div>` : ''}`);

      root.querySelectorAll('[data-deal]').forEach(el => el.onclick = () => openDeal(el.dataset.deal, draw));
      bindActivityRows(root, draw);
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Base de données
// Le répertoire du cabinet en trois familles : les particuliers (clients et prospects)
// avec l'état de leur dossier, ceux qui apportent les dossiers, et les banques qui les
// financent. Une ligne ouvre sa fiche — la même que dans Contacts.
const estCourtage = (row) => !!row && (row.activities || []).includes(KEY);

const VUES = [
  { key: 'clients', label: 'Clients' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'apporteurs', label: "Apporteurs d'affaires" },
  { key: 'banques', label: 'Banques' },
  { key: 'tous', label: 'Tous les contacts' },
];

// D'où viennent les demandes : les prospects se regardent par origine, chacune
// regroupant des canaux du CRM. « Autres » ramasse ce qui n'entre dans aucune, pour
// qu'aucun prospect ne devienne invisible.
const ORIGINES = [
  { key: 'site', label: 'Prospect site', canaux: ['Site internet direct', 'Google organique / SEO', 'Google Ads'] },
  { key: 'partenaires', label: 'Prospect partenaire', canaux: ['Partenaire / apporteur', 'Recommandation client', 'Réseau professionnel'] },
  { key: 'meta', label: 'Prospect Meta Ads', canaux: ['Meta Ads', 'Instagram organique', 'Facebook organique'] },
  // Le reste : prospection directe, téléphone, ancien client, LinkedIn… et les fiches
  // sans canal renseigné. La somme des quatre fait donc bien le total des prospects.
  // Mêmes libellés que l'espace BTP Expertise, pour que les deux écrans se lisent pareil.
  { key: 'direct', label: 'Autre prospect', canaux: null },
];
const CANAUX_CLASSES = ORIGINES.flatMap(o => o.canaux || []);
const dansOrigine = (c, o) => (o.canaux ? o.canaux.includes(c.channel) : !CANAUX_CLASSES.includes(c.channel));

// Les métiers qui envoient des dossiers au cabinet ; une organisation marquée
// « Partenaire » compte comme apporteur même sans métier renseigné.
const METIERS_APPORTEURS = ['Agent immobilier', 'Agence immobilière', 'Chasseur immobilier', 'Notaire', 'Syndic', 'Administrateur de biens', 'Investisseur'];
const estBanque = (o) => o.type === 'Banque' || o.partner_job === 'Banque';
const estApporteur = (o) => !estBanque(o) && (o.type === 'Partenaire' || METIERS_APPORTEURS.includes(o.partner_job));

// Le partenaire bancaire est saisi au clavier sur le dossier (champ libre) : le
// rapprochement avec le répertoire se fait sur le nom, accents et casse ignorés.
const cle = (v) => (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const dossiersDeLaBanque = (nom) => { const k = cle(nom); return k ? deals().filter(d => cle(d.fields?.partenaire_banque) === k) : []; };

const FINANCEMENTS = () => act().fields.find(f => f.key === 'type_financement')?.options || [];
const etapeDe = (d) => d.status === 'won' ? 'Signé' : d.status === 'lost' ? 'Perdu' : (act().stages.find(s => s.key === d.stage)?.label || '');
const lien = (href, texte) => texte ? `<a href="${href}${esc(texte)}" onclick="event.stopPropagation()">${esc(texte)}</a>` : '—';

export const courtageBasePage = {
  title: () => 'La Référence Courtage — Base de données',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'clients', q: '', canal: '', fin: '', origine: '', focus: null };

    // Créer depuis cet écran, c'est créer pour La Référence Courtage : l'activité est
    // cochée d'avance et le type suit la vue ouverte, sinon la fiche n'apparaîtrait pas ici.
    const nouveau = () => {
      const surOrg = ['apporteurs', 'banques'].includes(state.vue);
      if (surOrg) orgForm(null, draw, null, state.vue === 'banques' ? 'Banque' : 'Partenaire');
      else contactForm(null, draw);
      const f = document.querySelector(surOrg ? '#o-form' : '#c-form');
      if (!f) return;
      const coche = f.querySelector(`input[name="activities"][value="${KEY}"]`);
      // L'activité est cochée d'office et le champ retiré de la vue : sur l'espace d'une
      // structure, la question ne se pose pas. (.field est en display:flex, d'où le style.)
      if (coche) { coche.checked = true; const champ = coche.closest('.field'); if (champ) champ.style.display = 'none'; }
      if (surOrg && state.vue === 'banques') { const j = f.querySelector('[name="partner_job"]'); if (j) j.value = 'Banque'; }
      if (!surOrg && state.vue !== 'tous') { const t = f.querySelector('[name="type"]'); if (t) t.value = state.vue === 'clients' ? 'Client' : 'Prospect'; }
    };
    const libelleNouveau = () => ({ apporteurs: 'Apporteur', banques: 'Banque', clients: 'Client', prospects: 'Prospect' }[state.vue] || 'Contact');

    const draw = () => {
      const ts = terms(state.q);
      // Les fiches archivées sortent des listes actives. Elles se consultent et se
      // restaurent depuis l'espace BTP, qui porte l'onglet « Archivés ».
      const contacts = scope.contacts().filter(estCourtage).filter(estActive);
      const orgs = scope.orgs().filter(estCourtage).filter(estActive);
      const surOrg = ['apporteurs', 'banques'].includes(state.vue);
      const origineOuverte = ORIGINES.find(o => o.key === state.origine);

      let colonnes = [];
      let lignes = [];

      if (state.vue === 'apporteurs') {
        colonnes = ['Nom', 'Métier', 'Secteur', 'Téléphone', 'Email', 'Dossiers apportés', 'Signés', ''];
        lignes = orgs.filter(estApporteur)
          .filter(o => hit([o.name, o.partner_job, o.city, o.zone, o.email, o.phone], ts))
          .map(o => {
            const apportes = deals().filter(d => d.referrer_org_id === o.id);
            const signes = apportes.filter(d => d.status === 'won');
            const secteur = o.zone || o.city || '';
            return {
              id: o.id, kind: 'org',
              cells: [`<b>${esc(o.name)}</b>`, esc(o.partner_job || o.type || '—'), esc(secteur || '—'),
                lien('tel:', o.phone), lien('mailto:', o.email),
                `<span class="num">${apportes.length}</span>`, `<span class="num">${signes.length}</span>`],
              csv: { nom: o.name, metier: o.partner_job || o.type, secteur, telephone: o.phone, email: o.email, dossiers_apportes: apportes.length, signes: signes.length },
            };
          });
      } else if (state.vue === 'banques') {
        colonnes = ['Nom', 'Secteur', 'Téléphone', 'Email', 'Dossiers en cours', 'Offres éditées', 'Dernier contact', ''];
        lignes = orgs.filter(estBanque)
          .filter(o => hit([o.name, o.city, o.zone, o.email, o.phone], ts))
          .map(o => {
            const tous = dossiersDeLaBanque(o.name);
            const enCours = tous.filter(d => d.status === 'open');
            const offres = tous.filter(d => d.stage === 'offre' || d.status === 'won');
            const secteur = o.zone || o.city || '';
            const lc = o.last_contact_at ? daysSince(o.last_contact_at) : null;
            return {
              id: o.id, kind: 'org',
              cells: [`<b>${esc(o.name)}</b>`, esc(secteur || '—'), lien('tel:', o.phone), lien('mailto:', o.email),
                `<span class="num">${enCours.length}</span>`, `<span class="num">${offres.length}</span>`,
                lc === null ? '<span class="muted">Jamais</span>' : `${fmtDate(o.last_contact_at)} <span class="muted small">(${lc} j)</span>`],
              csv: { nom: o.name, secteur, telephone: o.phone, email: o.email, dossiers_en_cours: enCours.length, offres_editees: offres.length, dernier_contact: fmtDate(o.last_contact_at) },
            };
          });
      } else {
        const filtre = { clients: (c) => c.type === 'Client', prospects: (c) => c.type === 'Prospect', tous: () => true }[state.vue];
        colonnes = ['Nom', 'Type', 'Ville', 'Téléphone', 'Email', 'Canal', 'Financement', 'Dossier', ''];
        lignes = contacts.filter(filtre)
          .filter(c => !state.canal || c.channel === state.canal)
          .filter(c => state.vue !== 'prospects' || !origineOuverte || dansOrigine(c, origineOuverte))
          .map(c => ({ c, d: deals().find(x => x.contact_id === c.id) }))
          .filter(({ d }) => !state.fin || d?.fields?.type_financement === state.fin)
          .filter(({ c, d }) => hit([contactName(c), c.email, c.phone, c.city, c.channel, d?.title, d?.fields?.type_financement], ts))
          .map(({ c, d }) => ({
            id: c.id, kind: 'contact',
            cells: [`<b>${esc(contactName(c))}</b>`, esc(c.type || '—'), esc(c.city || '—'),
              lien('tel:', c.phone), lien('mailto:', c.email), esc(c.channel || '—'),
              esc(d?.fields?.type_financement || '—'),
              d ? `${esc(d.title)}<div class="small muted">${esc(etapeDe(d))}</div>` : '—'],
            csv: { nom: contactName(c), type: c.type, ville: c.city, telephone: c.phone, email: c.email, canal: c.channel, financement: d?.fields?.type_financement, dossier: d?.title, etape: d ? etapeDe(d) : '' },
          }));
      }

      const compte = (v) => {
        if (v === 'apporteurs') return orgs.filter(estApporteur).length;
        if (v === 'banques') return orgs.filter(estBanque).length;
        if (v === 'tous') return contacts.length;
        return contacts.filter(c => c.type === (v === 'clients' ? 'Client' : 'Prospect')).length;
      };

      // Banques citées sur un dossier mais absentes du répertoire : sans fiche, leurs
      // compteurs resteraient à zéro sans qu'on sache pourquoi.
      const sansFiche = state.vue !== 'banques' ? [] :
        [...new Set(deals().map(d => d.fields?.partenaire_banque).filter(Boolean))]
          .filter(n => !orgs.some(o => estBanque(o) && cle(o.name) === cle(n)));

      // Compteurs du second rang, comptés avant le filtre d'origine
      const prospects = contacts.filter(c => c.type === 'Prospect');
      const parOrigine = (o) => prospects.filter(c => dansOrigine(c, o)).length;

      root.innerHTML = cadre('#/courtage/base', 'Base de données', `
        <div class="toolbar">
          <div class="seg">${VUES.map(v => `<button data-vue="${v.key}" class="${state.vue === v.key ? 'active' : ''}">${esc(v.label)} <span class="cnt">${compte(v.key)}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <button class="btn ghost sm" id="c-export">Export CSV</button>
          <button class="btn" id="c-new">+ ${esc(libelleNouveau())}</button>
        </div>
        ${state.vue === 'prospects' ? `<div class="pill-tabs">
          ${ORIGINES.map(o => `<button type="button" data-org="${o.key}" class="${state.origine === o.key ? 'on' : ''}"
            aria-pressed="${state.origine === o.key}"
            title="${o.canaux ? 'Canaux : ' + esc(o.canaux.join(', ')) : 'Tout le reste, y compris les fiches sans canal renseigné'}">${esc(o.label)}<span>${parOrigine(o)}</span></button>`).join('')}
        </div>` : ''}
        <div class="toolbar">
          ${searchInput('c-q', state, surOrg ? 'Rechercher un nom, un secteur, un email…' : 'Rechercher un nom, une ville, un email, un dossier…')}
          ${surOrg || state.vue === 'prospects' ? '' : `<select id="c-canal"><option value="">Tous les canaux</option>${CHANNELS.map(c => `<option ${state.canal === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`}
          ${surOrg ? '' : `<select id="c-fin"><option value="">Tous les financements</option>${FINANCEMENTS().map(f => `<option ${state.fin === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`}
          <span class="muted small">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}</span>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr>${colonnes.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>${lignes.map(r => `<tr class="click" data-row="${r.kind}|${r.id}">${r.cells.map(c => `<td>${c}</td>`).join('')}<td class="num acts"><button type="button" class="btn ghost sm" data-modif="${r.kind}|${r.id}" title="Modifier">&#10000;</button><button type="button" class="btn ghost sm" data-suppr="${r.kind}|${r.id}" title="Archiver : la fiche sort des listes, rien n&rsquo;est supprimé">&#128451;</button></td></tr>`).join('')
              || `<tr><td colspan="${colonnes.length}"><div class="empty">Aucune fiche dans cette vue. Le bouton « + ${esc(libelleNouveau())} » en crée une, déjà rattachée à La Référence Courtage.</div></td></tr>`}</tbody>
          </table></div>
          ${sansFiche.length ? `<p class="muted small" style="margin-top:12px">Citées sur un dossier mais sans fiche au répertoire : ${sansFiche.map(n => esc(n)).join(', ')}. Créez leur fiche avec « + Banque » pour suivre leurs dossiers ici.</p>` : ''}
        </div>`);

      bindSearch(root, 'c-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; state.origine = ''; state.canal = ''; draw(); });
      root.querySelectorAll('[data-org]').forEach(b => b.onclick = () => { state.origine = state.origine === b.dataset.org ? '' : b.dataset.org; draw(); });
      root.querySelector('#c-canal')?.addEventListener('change', e => { state.canal = e.target.value; draw(); });
      root.querySelector('#c-fin')?.addEventListener('change', e => { state.fin = e.target.value; draw(); });
      // La ligne ouvre la fiche complète ; le crayon va droit au formulaire, d'où l'on
      // peut aussi supprimer (le CRM refuse la suppression d'un contact qui porte des affaires).
      root.querySelectorAll('[data-row]').forEach(tr => tr.onclick = (e) => {
        if (e.target.closest('[data-modif], [data-suppr]')) return;
        const [kind, id] = tr.dataset.row.split('|');
        if (kind === 'org') openOrg(id, draw); else openContact(id, draw);
      });
      root.querySelectorAll('[data-modif]').forEach(b => b.onclick = () => {
        const [kind, id] = b.dataset.modif.split('|');
        if (kind === 'org') orgForm(db.byId('organisations', id), draw); else contactForm(db.byId('contacts', id), draw);
      });
      root.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () => {
        const [kind, id] = b.dataset.suppr.split('|');
        archiverFiche(kind === 'org' ? 'organisations' : 'contacts', id, draw);
      });
      root.querySelector('#c-new').onclick = () => nouveau();
      root.querySelector('#c-export').onclick = () => csvDownload(`courtage-${state.vue}.csv`, lignes.map(r => r.csv));
    };

    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// ---------------------------------------------------------------- Vivier courtiers
// L'écran est celui du module Vivier ; il est simplement rendu dans la coquille de la
// structure. `.esp-body` a la même mise en page que `.content`, le rendu est identique.
export const courtageVivierPage = {
  title: () => 'La Référence Courtage — Vivier courtiers',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    root.innerHTML = cadre('#/courtage/vivier', 'Vivier courtiers', '');
    const vue = vivierPage.render(root.querySelector('.esp-body'));
    return {
      refresh: () => vue.refresh?.(),
      destroy: () => { vue.destroy?.(); coquille.retirer(); },
    };
  },
};
