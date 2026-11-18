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
import { coquilleEspace, poserEspace, kpiEspace, archiverFiche, supprimerDefinitivement, estActive } from './espace.js';
import { vivierPage } from './vivier.js';
import { estSimulation, feuDe, carteSimulation, estNouvelle } from './courtage-simulateur.js';
import { nouveauProspectCourtage } from './courtage-nouveau.js';

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
  // « Communication » (12/10/2026, Élodie) : pour l'instant la seule analyse du
  // site lareferencecourtage.fr, les réseaux viendront plus tard. Réservé à la
  // direction, comme chez RGD Renova et BTP Expertise.
  { label: 'Communication', pliable: true, sous: [
    { hash: '#/courtage/analyse', label: 'Analyse' },
  ] },
];
const RESERVES_DIRECTION_COURTAGE = ['#/courtage/analyse'];
const sansDirection = (liste) => liste
  .filter(o => !RESERVES_DIRECTION_COURTAGE.includes(o.hash))
  .map(o => (o.sous ? { ...o, sous: sansDirection(o.sous) } : o))
  .filter(o => !o.sous || o.sous.length);

export const cadreCourtage = (actif, titre, corps) => coquilleEspace({
  actif, titre, corps,
  cle: KEY, marque: act().label, baseline: 'Courtage en crédit immobilier',
  onglets: scope.isDirection ? ONGLETS : sansDirection(ONGLETS),
});
const cadre = cadreCourtage;

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

      // ⚠ L'ACCUEIL A PRIS LA LIGNE DU TABLEAU DE BORD (17/11/2026, Élodie : « quelque
      // chose de plus moderne et dynamique, et que les demandes du simulateur arrivent
      // directement dans le CRM »). Mêmes ingrédients que la To do : fond qui dérive,
      // cartes en verre, compteurs qui comptent, entrée en cascade — tout sous
      // `.ct-accueil`, rien ne bouge dans les espaces RGD et BTP qui partagent la coquille.
      // Les demandes du simulateur passent EN TÊTE : ce sont elles qu'on rappelle le jour même.
      const prenom = String(scope.user?.full_name || '').trim().split(/\s+/)[0];
      const simus = all.filter(estSimulation)
        .sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')));
      const simusOuvertes = simus.filter(d => d.status === 'open');
      const neuves = simus.filter(estNouvelle);
      const parFeu = (f) => simusOuvertes.filter(d => feuDe(d) === f).length;
      const semaine = simus.filter(d => (Date.now() - Date.parse(d.created_at || 0)) < 7 * 86400000).length;
      const phrase = neuves.length
        ? `${neuves.length} demande${neuves.length > 1 ? 's' : ''} à rappeler.`
        : nouveaux.length ? `${nouveaux.length} lead${nouveaux.length > 1 ? 's' : ''} à qualifier.` : 'tout est à jour.';
      const tuile = (cle, n, libelle, sous, href) => `<a class="ct-tuile ${cle}" href="${href}"><b data-compte="${n}">${n}</b><span>${libelle}</span><em>${sous}</em></a>`;
      const contactDe = (d) => (d.contact_id ? db.byId('contacts', d.contact_id) : null);
      const plusGrosse = Math.max(1, ...colonnes.map(c => c.cartes.length));

      root.innerHTML = cadre('#/courtage', "Vue d'ensemble", `
        <div class="ct-accueil">
        <div class="tb-fond" aria-hidden="true"><span class="tb-tache t1"></span><span class="tb-tache t2"></span><span class="tb-tache t3"></span></div>
        <!-- ⚠ LE CIEL DU SITE (17/11/2026, Élodie : « retrouver sur le CRM toute la
             charte graphique de lareferencecourtage.fr ») : même dégradé de ciel, même
             soleil, et le panorama de la Baie des Anges du haut de la page d'accueil,
             repris tel quel du site (assets/courtage/baie.svg). -->
        <header class="ct-hero">
          <span class="ct-soleil" aria-hidden="true"></span>
          <img class="ct-baie" src="assets/courtage/baie.svg" alt="" aria-hidden="true">
          <div class="ct-hero-txt">
            <span class="ct-sourcil"><i></i>Agence de courtage indépendante</span>
            <h1>${prenom ? `Bonjour ${esc(prenom)}, ` : ''}<span>${esc(phrase)}</span></h1>
            <p><i class="tb-vivant"></i>${semaine
              ? `${semaine} simulation${semaine > 1 ? 's' : ''} reçue${semaine > 1 ? 's' : ''} cette semaine`
              : 'Les simulations du site arrivent ici en direct'}</p>
          </div>
          <div class="ct-tuiles">
            ${tuile('leads', nouveaux.length, 'nouveaux leads', 'à qualifier et à appeler', '#/pipeline/courtage')}
            ${tuile('ouverts', open.length, 'dossiers ouverts', `${eur(pondere)} pondérés`, '#/pipeline/courtage')}
            ${tuile('banque', banque.length, 'en banque', 'transmis et offres', '#/pipeline/courtage')}
            ${tuile('relance', sansSuite.length, 'sans action', 'à relancer', '#/pipeline/courtage')}
          </div>
        </header>

        <div class="ct-duo">
          <section class="ct-panneau ct-simu">
            <div class="ct-panneau-tete">
              <h2>Demandes du simulateur</h2>
              <button type="button" class="ct-nouveau" id="ct-nouveau">+ Prospect</button>
              <div class="ct-feux">
                <span class="est-vert" title="Feu vert : projet faisable"><i></i>${parFeu('vert')}</span>
                <span class="est-orange" title="Feu orange : projet à optimiser"><i></i>${parFeu('orange')}</span>
                <span class="est-rouge" title="Feu rouge : projet à étudier"><i></i>${parFeu('rouge')}</span>
              </div>
            </div>
            <div class="cts-liste">${simusOuvertes.slice(0, 6).map(d => carteSimulation(d, contactDe(d))).join('')
              || `<div class="ct-vide"><b>Aucune demande pour l’instant.</b>
                  <span>Chaque simulation faite sur lareferencecourtage.fr arrivera ici avec son verdict, ses chiffres et une tâche de rappel.</span></div>`}</div>
            ${simusOuvertes.length > 6 ? `<a class="ct-plus" href="#/pipeline/courtage">Voir les ${simusOuvertes.length} demandes →</a>` : ''}
          </section>

          <section class="ct-panneau ct-afaire">
            <div class="ct-panneau-tete"><h2>À faire</h2>
              <span class="ct-compte ${retard.length ? 'est-retard' : ''}">${retard.length} en retard · ${jour.length} aujourd’hui</span></div>
            ${[...retard, ...jour].slice(0, 8).map(x => activityRowHtml(x, { showContext: true })).join('')
              || '<div class="ct-vide"><b>Rien d’échu.</b><span>Les prochaines actions sont plus loin dans le temps.</span></div>'}
          </section>
        </div>

        <section class="ct-panneau ct-pipe">
          <div class="ct-panneau-tete"><h2>Pipeline dossiers</h2>
            <span class="ct-compte">${eur(open.reduce((s, d) => s + (Number(d.amount) || 0), 0))} de commissions estimées</span>
            <a class="ct-lien" href="#/pipeline/courtage">Page complète →</a>
          </div>
          <div class="ct-etapes">${colonnes.map(({ s, cartes, somme }, n) => `
            <div class="ct-etape" style="--n:${n}">
              <div class="ct-etape-tete"><b>${esc(s.label)}</b><span>${cartes.length}</span></div>
              <div class="ct-jauge"><i style="width:${Math.round((cartes.length / plusGrosse) * 100)}%"></i></div>
              <div class="ct-etape-somme">${somme ? eur(somme) : '—'}</div>
              <div class="ct-etape-corps">${cartes.map(d => `
                <button type="button" class="ct-dossier ${feuDe(d) ? 'cts-' + feuDe(d) : ''}" data-deal="${d.id}">
                  <b>${esc(estSimulation(d) ? (contactDe(d) ? [contactDe(d).first_name, contactDe(d).last_name].filter(Boolean).join(' ') : d.title.split(' — ').pop()) : d.title)}</b>
                  <span>${esc(estSimulation(d) ? (d.fields?.projet || 'Simulateur') : dealParty(d))}</span>
                  ${d.amount ? `<em>${eur(d.amount)}</em>` : ''}
                </button>`).join('') || '<div class="ct-etape-vide">—</div>'}</div>
            </div>`).join('')}</div>
        </section>

        <section class="ct-panneau ct-recrut">
          <div class="ct-panneau-tete"><h2>Recrutement</h2>
            <span class="ct-compte">${viv.length} profil${viv.length > 1 ? 's' : ''} au vivier</span>
            <a class="ct-lien" href="#/courtage/vivier">Ouvrir le vivier →</a>
          </div>
          <div class="ct-mini-tuiles">
            ${tuile('leads', aContacter, 'à contacter', 'jamais approchés', '#/courtage/vivier')}
            ${tuile('banque', enCours, 'en cours', 'contactés, RDV pris', '#/courtage/vivier')}
            ${tuile('ouverts', recrutes, 'recrutés', 'entrés dans la structure', '#/courtage/vivier')}
            ${tuile('cible', viv.filter(r => ['1', '3'].includes(r.prio)).length, 'mandataires & indép.', `cible directe · ${viv.filter(r => r.prio === '3').length} à vérifier`, '#/courtage/vivier')}
          </div>
        </section>
        </div>`);

      root.querySelectorAll('[data-deal]').forEach(el => {
        el.onclick = (e) => { if (e.target.closest('[data-tel]')) return; openDeal(el.dataset.deal, draw); };
        if (el.tagName !== 'BUTTON') el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDeal(el.dataset.deal, draw); } };
      });
      bindActivityRows(root, draw);
      root.querySelector('#ct-nouveau')?.addEventListener('click', () => nouveauProspectCourtage(draw));
      if (premiere) { premiere = false; animerAccueil(root); }
    };

    let premiere = true;
    draw();
    return { refresh: draw, destroy: coquille.retirer };
  },
};

// L'entrée de l'accueil : cascade des cartes et compteurs qui comptent.
// ⚠ VISIBLE PAR DÉFAUT, comme la To do : ce script pose `.anime` puis la retire.
// S'il ne part pas, tout est simplement là. Et rien pour qui demande moins d'animations.
function animerAccueil(root) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const page = root.querySelector('.ct-accueil');
  if (!page) return;
  const morceaux = [...page.querySelectorAll('.ct-tuile, .ct-panneau, .cts-carte, .ct-etape')];
  morceaux.forEach((el, i) => el.style.setProperty('--i', Math.min(i, 24)));
  page.classList.add('anime');
  requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('vu')));
  setTimeout(() => { page.classList.remove('anime', 'vu'); morceaux.forEach(el => el.style.removeProperty('--i')); }, 1700);
  page.querySelectorAll('[data-compte]').forEach(b => {
    const finale = Number(b.dataset.compte) || 0;
    if (finale < 2) return;
    const t0 = performance.now();
    const pas = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      b.textContent = Math.round(finale * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  });
}

// ---------------------------------------------------------------- Base de données
// Le répertoire du cabinet en trois familles : les particuliers (clients et prospects)
// avec l'état de leur dossier, ceux qui apportent les dossiers, et les banques qui les
// financent. Une ligne ouvre sa fiche — la même que dans Contacts.
const estCourtage = (row) => !!row && (row.activities || []).includes(KEY);

// ⚠ LES PROSPECTS D'ABORD (17/11/2026, Élodie : « mettre d'abord les prospects »).
// C'est là qu'arrivent les demandes du site et du simulateur : l'écran s'ouvre dessus.
const VUES = [
  { key: 'prospects', label: 'Prospects' },
  { key: 'clients', label: 'Clients' },
  { key: 'apporteurs', label: "Apporteurs d'affaires" },
  { key: 'banques', label: 'Banques' },
  { key: 'tous', label: 'Tous les contacts' },
];

// D'où viennent les demandes, chaque origine regroupant des canaux du CRM.
// ⚠ PLUS DE SOUS-ONGLETS PAR ORIGINE (17/11/2026, Élodie : « enlever le sous-menu
// site, partenaire etc., ce sera dans le statut du dossier ») : l'origine se lit
// désormais en pastille dans la colonne « Dossier », à côté de l'étape. Le filtre
// par canal reste disponible dans la liste déroulante.
// Le simulateur du site a sa propre origine : ses demandes portent le canal
// « Simulateur du site », posé par la fonction `simulateur-courtage`.
const ORIGINES = [
  { key: 'simulateur', label: 'Simulateur', canaux: ['Simulateur du site'] },
  { key: 'site', label: 'Site', canaux: ['Site internet direct', 'Google organique / SEO', 'Google Ads'] },
  { key: 'partenaires', label: 'Partenaire', canaux: ['Partenaire / apporteur', 'Recommandation client', 'Réseau professionnel'] },
  { key: 'meta', label: 'Meta Ads', canaux: ['Meta Ads', 'Instagram organique', 'Facebook organique'] },
  // Le reste : prospection directe, téléphone, ancien client, LinkedIn… et les fiches
  // sans canal renseigné. La somme des origines fait donc bien le total des prospects.
  // Mêmes libellés que l'espace BTP Expertise, pour que les deux écrans se lisent pareil.
  { key: 'direct', label: 'Autre', canaux: null },
];
const origineDe = (c) => ORIGINES.find(o => dansOrigine(c, o));
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

// La colonne « Dossier » : le nom du dossier, puis son statut en pastilles —
// l'étape, le feu du simulateur s'il y en a un, et l'origine de la demande.
const statutDossier = (c, d) => {
  const o = origineDe(c);
  const pastilleOrigine = o ? `<span class="ct-orig est-${o.key}" title="${esc(c.channel || 'Canal non renseigné')}">${esc(o.label)}</span>` : '';
  if (!d) return `<div class="ct-statut">${pastilleOrigine || '—'}</div>`;
  const feu = feuDe(d);
  // Le titre du dossier n'est plus redit ici (18/11/2026) : le nom et le projet ont
  // leurs colonnes, la cellule ne porte que le statut.
  return `<div class="ct-statut"><span class="ct-etape-pastille">${feu ? `<i class="cts-feu est-${feu}"></i>` : ''}${esc(etapeDe(d))}</span>${pastilleOrigine}</div>`;
};

// Les cellules d'une ligne Prospects / Clients, tirées du contact et de son dossier.
// Une simulation range ses chiffres sous d'autres noms (`emprunt`, `budget`) :
// on lit l'un ou l'autre, comme la fiche.
const nb = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && n ? n : null; };
const sousLigne = (t) => (t ? `<div class="small muted">${t}</div>` : '');
const ligneDossier = (c, d) => {
  const f = d?.fields || {};
  const lieu = [c.postal_code, c.city].filter(Boolean).join(' ');
  const fin = f.type_financement === 'Crédit professionnel' ? 'Financement professionnel' : f.type_financement;
  const projet = f.objectif || f.projet || '';
  const aFinancer = nb(f.montant_financement) ?? nb(f.emprunt);
  const total = nb(f.montant_projet) ?? nb(f.budget);
  const apport = nb(f.apport);
  const endet = nb(f.endettement);
  const feu = d ? feuDe(d) : '';
  const ton = feu ? `est-${feu}` : endet === null ? '' : endet <= 35 ? 'est-vert' : endet <= 38 ? 'est-orange' : 'est-rouge';
  // Le prochain rendez-vous ou la prochaine action datée du dossier.
  const prochaine = d ? db.t('activities').filter(a => a.deal_id === d.id && !a.done && a.due_date)
    .sort((x, y) => (x.due_date + (x.due_time || '')).localeCompare(y.due_date + (y.due_time || '')))[0] : null;
  const retard = prochaine && daysSince(prochaine.due_date) > 0;
  return {
    prospect: `<b>${esc(contactName(c))}</b>${sousLigne(lieu ? esc(lieu) : '<span class="ct-manque">Ville à compléter</span>')}`,
    coordonnees: `${c.phone ? lien('tel:', c.phone) : '<span class="ct-manque">Pas de téléphone</span>'}${sousLigne(c.email ? lien('mailto:', c.email) : '')}`,
    projet: fin || projet ? `<b class="ct-fin">${esc(fin || projet)}</b>${sousLigne(fin && projet ? esc(projet) : '')}` : '<span class="ct-manque">À compléter</span>',
    montant: aFinancer ? `<b class="num">${esc(eur(aFinancer))}</b>${sousLigne(total ? `sur ${esc(eur(total))}${apport && total ? ` · apport ${Math.round((apport / total) * 100)} %` : ''}` : '')}` : '—',
    faisabilite: endet !== null || feu
      ? `<span class="ct-faisa ${ton}"><i></i>${endet !== null ? `${String(endet).replace('.', ',')} %` : esc(FEUX_LIB[feu] || '')}</span>${sousLigne(endet !== null ? 'd’endettement' : '')}`
      // Le montant est là mais pas les revenus : c'est la seule chose qui manque au
      // calcul, on le dit (18/11/2026, Mickael : « Revenus à compléter »).
      : d && aFinancer && !nb(f.revenus_foyer) ? '<span class="ct-manque est-orange">Revenus à compléter</span>' : '—',
    rdv: prochaine
      ? `<span class="ct-rdv ${retard ? 'est-retard' : ''}">${esc(fmtDate(prochaine.due_date))}${prochaine.due_time ? ` · ${esc(prochaine.due_time)}` : ''}</span>${sousLigne(esc(prochaine.title))}`
      : d && d.status === 'open' ? '<span class="ct-manque est-orange">À programmer</span>' : '—',
    csv: {
      nom: contactName(c), type: c.type, adresse: c.address, code_postal: c.postal_code, ville: c.city,
      telephone: c.phone, email: c.email, origine: c.channel,
      financement: fin, projet, montant_projet: total, apport, a_financer: aFinancer,
      endettement: endet, mensualite: nb(f.mensualite), capacite: nb(f.capacite),
      prochain_rdv: prochaine ? `${prochaine.due_date} ${prochaine.due_time || ''}`.trim() : '',
      dossier: d?.title, etape: d ? etapeDe(d) : '',
    },
  };
};
const FEUX_LIB = { vert: 'Feu vert', orange: 'Feu orange', rouge: 'Feu rouge' };

// ⚠ UN PROSPECT DEVIENT CLIENT À L'OFFRE ÉDITÉE (18/11/2026, Mickael). En base,
// c'est le déclencheur `courtage_offre_rend_client` qui passe `contacts.type` à
// « Client » (migration 20261118150000). L'écran applique la même règle sans
// attendre de relire la fiche : la ligne change d'onglet au moment même où le
// dossier passe à « Offre éditée ». À sens unique, comme en base.
const estClient = (c) => c.type === 'Client'
  || deals().some(d => d.contact_id === c.id && (d.stage === 'offre' || d.status === 'won'));

// Le dossier de courtage d'un contact : l'ouvert le plus récent, sinon le plus récent.
const dossierDe = (contactId) => {
  const l = deals().filter(d => d.contact_id === contactId)
    .sort((x, y) => (x.status === 'open') === (y.status === 'open')
      ? String(y.created_at || '').localeCompare(String(x.created_at || ''))
      : (x.status === 'open' ? -1 : 1));
  return l[0] || null;
};

export const courtageBasePage = {
  title: () => 'La Référence Courtage — Base de données',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { vue: 'prospects', q: '', canal: '', fin: '', focus: null };

    // Créer depuis cet écran, c'est créer pour La Référence Courtage : l'activité est
    // cochée d'avance et le type suit la vue ouverte, sinon la fiche n'apparaîtrait pas ici.
    const nouveau = () => {
      // ⚠ UN PROSPECT SE SAISIT PAR LE FORMULAIRE EN ÉTAPES (17/11/2026) : projet,
      // chiffres, prospect, rendez-vous — il crée le contact ET son dossier. Les
      // clients, apporteurs et banques gardent la fiche simple.
      if (state.vue === 'prospects') { nouveauProspectCourtage(draw); return; }
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
        const filtre = { clients: estClient, prospects: (c) => c.type === 'Prospect' && !estClient(c), tous: () => true }[state.vue];
        // ⚠ LES COLONNES SUIVENT LE FORMULAIRE (18/11/2026, Mickael : « revoir les
        // colonnes du tableau avec les informations remplies »). Une ligne dit ce
        // qu'un courtier regarde avant d'appeler : qui et où, comment le joindre,
        // ce qu'il veut financer, combien, si c'est faisable, quand on le rappelle,
        // où en est le dossier. Le type ne sert que dans « Tous les contacts ».
        colonnes = ['Prospect', 'Coordonnées', 'Projet', 'À financer', 'Faisabilité', 'Prochain rendez-vous', 'Statut', ''];
        if (state.vue === 'tous') colonnes.splice(1, 0, 'Type');
        lignes = contacts.filter(filtre)
          .filter(c => !state.canal || c.channel === state.canal)
          .map(c => ({ c, d: dossierDe(c.id) }))
          .filter(({ d }) => !state.fin || d?.fields?.type_financement === state.fin)
          .filter(({ c, d }) => hit([contactName(c), c.email, c.phone, c.city, c.channel, d?.title, d?.fields?.type_financement], ts))
          .map(({ c, d }) => {
            const l = ligneDossier(c, d);
            const cells = [l.prospect, l.coordonnees, l.projet, l.montant, l.faisabilite, l.rdv, statutDossier(c, d)];
            if (state.vue === 'tous') cells.splice(1, 0, esc(estClient(c) ? 'Client' : (c.type || '—')));
            return { id: c.id, kind: 'contact', cells, csv: l.csv };
          });
      }

      const compte = (v) => {
        if (v === 'apporteurs') return orgs.filter(estApporteur).length;
        if (v === 'banques') return orgs.filter(estBanque).length;
        if (v === 'tous') return contacts.length;
        return contacts.filter(v === 'clients' ? estClient : (c) => c.type === 'Prospect' && !estClient(c)).length;
      };

      // Banques citées sur un dossier mais absentes du répertoire : sans fiche, leurs
      // compteurs resteraient à zéro sans qu'on sache pourquoi.
      const sansFiche = state.vue !== 'banques' ? [] :
        [...new Set(deals().map(d => d.fields?.partenaire_banque).filter(Boolean))]
          .filter(n => !orgs.some(o => estBanque(o) && cle(o.name) === cle(n)));


      root.innerHTML = cadre('#/courtage/base', 'Base de données', `
        <div class="toolbar">
          <div class="seg">${VUES.map(v => `<button data-vue="${v.key}" class="${state.vue === v.key ? 'active' : ''}">${esc(v.label)} <span class="cnt">${compte(v.key)}</span></button>`).join('')}</div>
          <span class="grow"></span>
          <button class="btn ghost sm" id="c-export">Export CSV</button>
          <button class="btn" id="c-new">+ ${esc(libelleNouveau())}</button>
        </div>
        <div class="toolbar">
          ${searchInput('c-q', state, surOrg ? 'Rechercher un nom, un secteur, un email…' : 'Rechercher un nom, une ville, un email, un dossier…')}
          ${surOrg ? '' : `<select id="c-canal"><option value="">Tous les canaux</option>${CHANNELS.map(c => `<option ${state.canal === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`}
          ${surOrg ? '' : `<select id="c-fin"><option value="">Tous les financements</option>${FINANCEMENTS().map(f => `<option ${state.fin === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`}
          <span class="muted small">${lignes.length} ligne${lignes.length > 1 ? 's' : ''}</span>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr>${colonnes.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>${lignes.map(r => `<tr class="click" data-row="${r.kind}|${r.id}">${r.cells.map(c => `<td>${c}</td>`).join('')}<td class="num acts"><button type="button" class="btn ghost sm" data-modif="${r.kind}|${r.id}" title="Modifier">&#10000;</button><button type="button" class="btn ghost sm" data-archiver="${r.kind}|${r.id}" title="Archiver : la fiche sort des listes, rien n&rsquo;est supprimé">&#128451;</button>${scope.canSupprimerFiche ? `<button type="button" class="btn ghost sm danger" data-suppr="${r.kind}|${r.id}" title="Supprimer définitivement, avec ses affaires et son historique">&#128465;</button>` : ''}</td></tr>`).join('')
              || `<tr><td colspan="${colonnes.length}"><div class="empty">Aucune fiche dans cette vue. Le bouton « + ${esc(libelleNouveau())} » en crée une, déjà rattachée à La Référence Courtage.</div></td></tr>`}</tbody>
          </table></div>
          ${sansFiche.length ? `<p class="muted small" style="margin-top:12px">Citées sur un dossier mais sans fiche au répertoire : ${sansFiche.map(n => esc(n)).join(', ')}. Créez leur fiche avec « + Banque » pour suivre leurs dossiers ici.</p>` : ''}
        </div>`);

      bindSearch(root, 'c-q', state, draw); restoreFocus(root, state);
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; state.canal = ''; draw(); });
      root.querySelector('#c-canal')?.addEventListener('change', e => { state.canal = e.target.value; draw(); });
      root.querySelector('#c-fin')?.addEventListener('change', e => { state.fin = e.target.value; draw(); });
      // La ligne ouvre la fiche complète ; le crayon va droit au formulaire, d'où l'on
      // peut aussi supprimer (le CRM refuse la suppression d'un contact qui porte des affaires).
      root.querySelectorAll('[data-row]').forEach(tr => tr.onclick = (e) => {
        if (e.target.closest('[data-modif], [data-archiver], [data-suppr]')) return;
        const [kind, id] = tr.dataset.row.split('|');
        // ⚠ UN PROSPECT OU UN CLIENT OUVRE SON DOSSIER (18/11/2026, Mickael : « que
        // la fiche soit la même dans la base de données et la pipeline dossiers ») :
        // la fiche du dossier porte le prospect, le projet et les chiffres, la
        // fiche contact seule n'en montrait que les coordonnées. Sans dossier,
        // c'est la fiche contact.
        if (kind === 'org') openOrg(id, draw);
        else { const d = dossierDe(id); if (d) openDeal(d.id, draw); else openContact(id, draw); }
      });
      root.querySelectorAll('[data-modif]').forEach(b => b.onclick = () => {
        const [kind, id] = b.dataset.modif.split('|');
        // Le crayon d'un prospect qui a un dossier rouvre le formulaire en étapes, rempli.
        const d = kind === 'contact' ? dossierDe(id) : null;
        if (kind === 'org') orgForm(db.byId('organisations', id), draw);
        else if (d) nouveauProspectCourtage(draw, { dealId: d.id });
        else contactForm(db.byId('contacts', id), draw);
      });
      root.querySelectorAll('[data-archiver]').forEach(b => b.onclick = () => {
        const [kind, id] = b.dataset.archiver.split('|');
        archiverFiche(kind === 'org' ? 'organisations' : 'contacts', id, draw);
      });
      root.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () => {
        const [kind, id] = b.dataset.suppr.split('|');
        supprimerDefinitivement(kind === 'org' ? 'organisations' : 'contacts', id, draw);
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
