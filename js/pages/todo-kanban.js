// To do list — la vue en colonnes de la direction
//
// Demandé par Élodie le 01/10/2026, image à l'appui : « chaque colonne
// représente une structure et comme ça la personne a un visuel sur tous les
// éléments de toutes les structures ». Pour la direction, cette vue REMPLACE
// « Ma to do list » — c'est son choix explicite.
//
// ⚠ ELLE NE MONTRE QUE LES TÂCHES DE CELUI QUI REGARDE. « Chacun la sienne »
// est la règle de cet écran depuis le début (en-tête de `today.js`) : même la
// direction ne voit pas la to do list de son équipe. La première version de ce
// tableau l'avait enfreinte en laissant entrer tout ce que la direction a le
// droit de LIRE — ce qui n'est pas la même question que ce qu'elle doit VOIR
// ici. Le filtre vit dans `today.js` ; ce fichier ne fait que ranger ce qu'on
// lui donne, et il ne doit jamais aller chercher au-delà.
//
// ⚠ UNE COLONNE PAR STRUCTURE, ET UNE DE PLUS. « Sans structure » n'est pas un
// repli technique : une tâche qui n'appartient à aucune activité est une tâche
// qu'on a oublié de ranger, et la voir est précisément l'intérêt du tableau.
// Elle ne s'affiche que si elle porte quelque chose.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { stageOf } from '../data/schema.js';
import { etapeDeFiche, etapeDeDemande, joursDeVisite } from '../data/rgd-etapes.js';
import { esc, daysSince, relDay, userName, fmtDate } from '../ui.js';
import { actType, structureDe, contexteTache, structuresDeLUtilisateur } from './activity.js';

const ecart = (a) => (a.due_date ? daysSince(a.due_date) : null);

// Les initiales d'une personne : un rond coloré vaut mieux qu'un nom tronqué
// dans une carte large de deux cent cinquante pixels.
const initiales = (id) => {
  const n = userName(id) || '';
  const m = n.trim().split(/\s+/);
  return ((m[0]?.[0] || '') + (m[1]?.[0] || '')).toUpperCase() || '?';
};

// ⚠ LA COULEUR D'UN ROND VIENT DU NOM, PAS DU HASARD : la même personne garde
// la même teinte d'une colonne à l'autre et d'un jour à l'autre. Un hasard
// recalculé à chaque rendu ferait clignoter le tableau.
const TEINTES = ['#4f46c8', '#0e7c66', '#b3261e', '#9a6412', '#6d28d9', '#0369a1', '#be185d'];
const teinteDe = (id) => {
  const s = String(id || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return TEINTES[n % TEINTES.length];
};

// Une carte. Elle dit, dans cet ordre : ce qu'il faut faire, pour quel dossier,
// quand, et par qui. L'échéance porte sa couleur avant son texte.
// ⚠ `recentes` VIENT DE L'APPELANT : c'est `today.js` qui tient les minuteurs
// des quinze secondes, et une seconde copie ici aurait fait disparaitre les
// cartes a un autre moment que les lignes. On ne le recalcule pas, on le lit.
function carte(a, recentes) {
  const j = ecart(a);
  const t = actType(a.type);
  const d = a.deal_id && db.byId('deals', a.deal_id);
  const c = a.contact_id && db.byId('contacts', a.contact_id);
  const o = a.organisation_id && db.byId('organisations', a.organisation_id);
  // Le dossier d'abord, la personne ensuite : sur une tâche d'affaire c'est
  // l'affaire qu'on cherche, sur un rappel c'est la personne.
  const ligneCtx = d ? d.title
    : c ? `${c.first_name || ''} ${c.last_name || ''}`.trim()
    : o ? o.name : '';
  // ⚠ LE NUMÉRO EST SUR LA CARTE, pas seulement dans la tâche ouverte : « même
  // en aperçu j'aimerais avoir les informations de la personne ». Une tâche de
  // rappel qu'il faut ouvrir pour trouver le numéro demande un clic de plus
  // pour la seule chose qu'elle sert à faire.
  const ctx = contexteTache(a);
  const sousTaches = Array.isArray(a.checklist) ? a.checklist : [];
  const faites = sousTaches.filter(x => x && x.f).length;

  return `<article class="kb-carte ${a.done ? 'est-faite' : ''} ${!a.done && a.priority === 'urgent' ? 'est-urgente' : ''}"
    data-tache="${esc(a.id)}" tabindex="0">
    <label class="kb-case" title="${a.done ? 'Rouvrir' : 'Marquer comme fait'}">
      <input type="checkbox" ${a.done ? 'checked' : ''} data-toggle="${esc(a.id)}"><span></span></label>
    <div class="kb-corps">
      <p class="kb-titre">${t.icon} ${esc(a.title)}</p>
      ${recentes && recentes.has(a.id) ? `<button type="button" class="todo-annuler kb-annuler"
        data-annuler="${esc(a.id)}" title="Décocher : la tâche revient">↩ Annuler</button>` : ''}
      ${ligneCtx ? `<p class="kb-ctx">${esc(ligneCtx)}</p>` : ''}
      ${ctx && ctx.tel ? `<p class="kb-tel"><a href="tel:${esc(String(ctx.tel).replace(/\s+/g, ''))}"
        onclick="event.stopPropagation()">📞 ${esc(ctx.tel)}</a></p>` : ''}
      ${sousTaches.length ? `<p class="kb-checklist ${faites === sousTaches.length ? 'est-complete' : ''}">
        ☑ ${faites}/${sousTaches.length}</p>` : ''}
      <div class="kb-pied">
        ${a.priority === 'urgent' ? '<span class="kb-etiq urgent">Urgent</span>' : ''}
        ${a.priority === 'retard' ? '<span class="kb-etiq retard">En retard</span>' : ''}
        <span class="kb-quand ${!a.done && j > 0 ? 'est-tard' : ''} ${!a.done && j === 0 ? 'est-aujourdhui' : ''}">${
          a.due_date ? (j === 0 ? "Aujourd’hui" : esc(relDay(a.due_date))) : '—'}${
          a.due_time ? ' · ' + esc(a.due_time) : ''}</span>
        <span class="grow"></span>
        <span class="kb-qui" style="background:${teinteDe(a.assignee_id)}"
          title="${esc(userName(a.assignee_id) || 'Sans responsable')}">${esc(initiales(a.assignee_id))}</span>
        ${a.shared_with ? `<span class="kb-qui kb-partage" style="background:${teinteDe(a.shared_with)}"
          title="${esc('Partagée avec ' + userName(a.shared_with))}">${esc(initiales(a.shared_with))}</span>` : ''}
      </div>
    </div>
  </article>`;
}

// ———————————————————————————————————————————————————————————————————————————
// LES DOSSIERS QUI ATTENDENT UNE ÉCRITURE
//
// Demandé par Mickael le 06/10/2026 : « je voudrais que les "devis en cours" de
// clients & prospects du tableau de bord rgd renova soient dans la to do list du
// crm groupe dans la colonne rgd renova », « que les fiches dans "rédaction en
// cours" de expertise soient […] dans la colonne btp expertise en violet », « que
// les fiches dans "rédaction mission AMO" soient […] en jaune ».
//
// ⚠ CE NE SONT PAS DES TÂCHES, ET ON N'EN CRÉE AUCUNE. Écrire une ligne dans
// `activities` à chaque dossier arrivé à l'étape aurait demandé de désigner un
// destinataire que personne n'a nommé, aurait fait un doublon au second passage
// par l'étape, et aurait laissé une tâche morte derrière chaque dossier qui
// avance. Un ÉTAT n'est pas une tâche : il se relit à chaque rendu, depuis les
// dossiers eux-mêmes. Rien n'est écrit, donc rien ne se périme.
//
// ⚠ ELLES NE SE COCHENT PAS, et c'est la raison de la carte à part. On ne « fait »
// pas un devis en cours : on l'envoie, et c'est le changement d'étape — depuis la
// fiche, où il s'écrit déjà — qui le retire d'ici. Une case à cocher aurait promis
// un geste qui n'existe pas.
//
// ⚠ CE QUI ENTRE EST CE QU'ON A LE DROIT DE VOIR, pas ce dont on est responsable.
// C'est le seul endroit du tableau où « chacun la sienne » ne s'applique pas, et
// ce n'est pas un relâchement : cette règle vise les TÂCHES, le pense-bête
// personnel. Un dossier au stade du devis est un état d'affaire, que le pipeline
// montre déjà à qui peut le lire — le cacher ici aurait vidé l'encadré pour celui
// qui l'a demandé. `scope.rgd()` et `scope.deals()` sont les miroirs des policies :
// un chargé d'affaires n'y voit toujours que son portefeuille.
//
// ⚠ LES DEUX TEINTES SONT ÉCRITES ICI ET NON PRISES DANS LES VARIABLES DU CRM :
// `--violet` y vaut #E24C86, qui est un rose, et `--amber` #A96C10, qui est un
// brun. Ni l'un ni l'autre ne dit « violet » ni « jaune ».
const VIOLET = '#6D28D9';
const JAUNE = '#C98A00';

// Les deux étapes BTP suivies, et la couleur demandée pour chacune. Elles vivent
// dans la MÊME colonne : c'est la couleur qui les distingue, l'intitulé venant de
// `stageOf` et donc du pipeline — renommer une étape renomme la carte.
const SUIVIS_BTP = { mission_realisee: VIOLET, amo_cadrage: JAUNE };

// Le nom derrière une ligne RGD : un particulier est un contact, un professionnel
// une organisation, et une demande du site porte ses propres colonnes quand ni
// l'un ni l'autre n'a été créé.
const nomDeFiche = (f) => {
  const c = f.contact_id && db.byId('contacts', f.contact_id);
  if (c) return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sans nom';
  const o = f.organisation_id && db.byId('organisations', f.organisation_id);
  if (o) return o.name || 'Sans nom';
  return `${f.prenom || ''} ${f.nom || ''}`.trim() || 'Fiche sans nom';
};

// ⚠ L'ÉTAPE SE RECALCULE, ON NE LIT PAS `statut_suivi`. L'écran Clients & prospects
// range ses onglets par l'ÉTAPE — « quand les faits ont pris de l'avance, c'est
// l'étape qui dit vrai » — et lire la valeur brute ferait apparaître ici des fiches
// que l'onglet « Devis en cours » ne montre pas, et manquer celles qu'il montre.
// Une seule définition, celle de `rgd-etapes.js`.
function dossiersRgd() {
  if (!scope.canRgd) return [];
  const chantiers = scope.rgd('rgd_chantiers');
  const devis = scope.rgd('rgd_devis');
  const jours = joursDeVisite(scope.rgd('agenda_events'));
  const couleur = '#FD7A2D';
  const cartes = [];
  // ⚠ AUCUNE ANCIENNETÉ SUR UNE FICHE CLIENT : `rgd_clients` n'a ni `created_at`
  // ni `updated_at` — vérifié colonne par colonne. `synced_at` est l'heure du
  // dernier relevé, pas celle du passage au devis : l'afficher ferait lire « depuis
  // 0 j » sur un dossier qui traîne depuis trois semaines. Mieux vaut ne rien dire
  // que dire faux. La date de la demande, elle, existe.
  for (const f of scope.rgd('rgd_clients')) {
    if (etapeDeFiche(f, chantiers, devis, jours) !== 'devis_encours') continue;
    cartes.push({ id: f.id, genre: 'client', nom: nomDeFiche(f), libelle: 'Devis en cours', couleur });
  }
  for (const d of scope.rgd('rgd_demandes')) {
    if (etapeDeDemande(d) !== 'devis_encours') continue;
    cartes.push({ id: d.id, genre: 'demande', nom: nomDeFiche(d), libelle: 'Devis en cours', couleur });
  }
  return cartes;
}

// Une affaire PERDUE OU GAGNÉE ne figure pas : elle n'attend plus rien, et une
// mission gagnée dont l'étape est restée en rédaction remonterait pour toujours.
const dossiersBtp = () => scope.deals()
  .filter(d => d.activity === 'btp' && d.status === 'open' && SUIVIS_BTP[d.stage])
  .map(d => ({ id: d.id, genre: 'deal', nom: d.title || 'Affaire sans titre',
               libelle: stageOf(d.activity, d.stage)?.label || d.stage, couleur: SUIVIS_BTP[d.stage],
               depuis: d.stage_changed_at || d.created_at }));

export const dossiersDe = (cle) => (cle === 'rgd' ? dossiersRgd() : cle === 'btp' ? dossiersBtp() : []);

// ⚠ L'ANCIENNETÉ EST LA MOITIÉ DE L'INFORMATION QUAND ON L'A : une mission en
// rédaction depuis trois jours ne se lit pas comme une mission en rédaction depuis
// trois semaines, et c'est la seconde qu'on vient chercher ici. Elle passe en ambre
// au-delà de deux semaines, le même seuil que la colonne « Dernière relance » de
// l'écran Clients. Une carte sans date exacte n'en affiche aucune — voir plus haut.
export function carteDossier(x) {
  const j = x.depuis ? daysSince(x.depuis) : null;
  const vieux = j !== null && j > 14;
  return `<article class="kb-dossier${vieux ? ' est-vieux' : ''}" style="--d:${x.couleur}"
    data-dossier="${esc(x.genre)}" data-dossier-id="${esc(x.id)}" tabindex="0"
    title="${esc(x.libelle)}${x.depuis ? ` — depuis le ${fmtDate(x.depuis)}` : ''}">
    <p class="kb-d-nom">${esc(x.nom)}</p>
    <p class="kb-d-etat">${esc(x.libelle)}${
      j !== null ? ` <span class="kb-d-age">· depuis ${j <= 0 ? "aujourd’hui" : `${j} j`}</span>` : ''}</p>
  </article>`;
}

/**
 * Le tableau entier. Rend le HTML ; le branchement est fait par l'appelant,
 * qui tient déjà les gestionnaires de coche et de modification.
 *
 * `taches` est déjà filtré (recherche, « ce qui est fait ») par l'appelant :
 * cette fonction range, elle ne décide pas de ce qui entre.
 */
export function kanbanHtml(taches, recentes) {
  // ⚠ LES COLONNES VIENNENT DE `structuresDeLUtilisateur`, PAS DE `ACTIVITIES` :
  // depuis le 05/10/2026 une tâche peut appartenir à un MODULE — la gestion
  // locative — qui n'est pas une activité et n'a ni espace ni pipeline. La
  // liste est écrite une seule fois, dans `activity.js`, et sert aussi aux
  // pastilles de « Ma to do list » et au formulaire de tâche.
  const colonnes = structuresDeLUtilisateur()
    .map(a => ({ cle: a.key, nom: a.label, court: a.short, couleur: a.color, encre: a.accent,
                 l: taches.filter(t => structureDe(t) === a.key),
                 d: dossiersDe(a.key) }));
  // ⚠ « SANS STRUCTURE » RAMASSE TOUT CE QU'AUCUNE COLONNE N'A PRIS, et plus
  // seulement les tâches sans structure du tout. Le test d'avant — `!structureDe`
  // — laissait DISPARAÎTRE une tâche rangée dans une structure que celui qui
  // regarde ne porte pas : elle n'entrait dans aucune colonne et n'était pas
  // orpheline. Muet, et d'autant plus probable maintenant qu'un module s'ajoute
  // aux quatre structures.
  const placees = new Set(colonnes.flatMap(c => c.l));
  const orphelines = taches.filter(t => !placees.has(t));
  if (orphelines.length) {
    colonnes.push({ cle: '', nom: 'Sans structure', court: '—', couleur: '#8a8fa3', encre: '#5b6070', l: orphelines, d: [] });
  }

  const tri = (l) => l.slice().sort((x, y) => {
    // L'urgent remonte, puis le retard, puis l'échéance. Une colonne se lit du
    // haut : ce qui brûle doit y être.
    const poids = (a) => (a.done ? 3 : a.priority === 'urgent' ? 0 : (ecart(a) ?? -1) > 0 ? 1 : 2);
    return poids(x) - poids(y)
      || (x.due_date || '9999').localeCompare(y.due_date || '9999')
      || (x.due_time || '99').localeCompare(y.due_time || '99');
  });

  return `<div class="kb-plateau">
    ${colonnes.map(c => {
      const ouvertes = c.l.filter(t => !t.done);
      const tard = ouvertes.filter(t => ecart(t) > 0).length;
      return `<section class="kb-col" data-col="${esc(c.cle)}" style="--c:${c.couleur};--ci:${c.encre}">
        <header class="kb-tete">
          <div class="kb-tete-haut">
            <h3>${esc(c.nom)}</h3>
            <button type="button" class="kb-plus" data-col-neuve="${esc(c.cle)}"
              title="Nouvelle tâche dans ${esc(c.nom)}">+</button>
          </div>
          <p class="kb-compte">${ouvertes.length} tâche${ouvertes.length > 1 ? 's' : ''}${
            c.d.length ? ` · ${c.d.length} dossier${c.d.length > 1 ? 's' : ''}` : ''}${
            tard ? ` · <b class="est-tard">${tard} en retard</b>` : ''}</p>
        </header>
        <div class="kb-pile">
          ${c.d.length ? `<p class="kb-sous-titre">Dossiers en attente</p>${c.d.map(carteDossier).join('')}` : ''}
          ${c.l.length
            ? `${c.d.length ? '<p class="kb-sous-titre">Tâches</p>' : ''}${tri(c.l).map(t => carte(t, recentes)).join('')}`
            : (c.d.length ? '' : '<p class="kb-vide">Rien ici.</p>')}
        </div>
      </section>`;
    }).join('')}
  </div>
  <p class="kb-note muted small">Vos tâches, rangées par structure.
    Chacun a la sienne : personne ne voit celle des autres, direction comprise —
    sauf une tâche qu'on vous a partagée, marquée d'un second rond.
    Pour confier une tâche, l'onglet « Envoyées » la suit sans la perdre de vue.
    Les <b>dossiers en attente</b> ne sont pas des tâches : ce sont les affaires arrêtées
    à une étape d'écriture, relues à chaque ouverture. Elles ne se cochent pas —
    un clic ouvre la fiche, et c'est l'étape qui les retire d'ici.</p>`;
}
