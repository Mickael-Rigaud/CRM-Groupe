// Espace La Référence Courtage : le cabinet de courtage pilote son activité ici.
// Même présentation que RGD Renova et BTP Expertise — menu vertical à gauche, contenu à
// droite, aux couleurs de la structure. Deux écrans : la vue d'ensemble et le vivier
// courtiers, qui est le recrutement de la structure et vit désormais dans son espace.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { ACTIVITIES, weightedAmount } from '../data/schema.js';
import { esc, eur, daysSince, dealParty } from '../ui.js';
import { openDeal } from './deal.js';
import { activityRowHtml, bindActivityRows, nextActivity } from './activity.js';
import { coquilleEspace, poserEspace, kpiEspace } from './espace.js';
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
