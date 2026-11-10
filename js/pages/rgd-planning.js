// La page « Planning chantier » de RGD Renova (10/11/2026, demandé par Élodie)
//
// « Un calendrier mensuel où l'on peut ajouter des chantiers et les rattacher
// à des fiches projet/client », avec pour chaque chantier une fiche qui porte
// une liste de matériaux et une liste d'outils — standard mais
// personnalisables, cochables pour savoir ce qu'on a déjà et ce qui a été
// acheté. Date de début + durée, et des chantiers qui se superposent.
//
// Choix d'Élodie le même jour : page juste sous la Vue d'ensemble, durée en
// jours CALENDAIRES, deux cases par ligne (« En stock », « Acheté »),
// direction seule.
//
// ⚠ LA SUPERPOSITION SE DESSINE EN COULOIRS. Dans chaque semaine, un chantier
// prend le premier couloir libre sur toute sa largeur ; deux chantiers qui se
// chevauchent sont donc l'un au-dessus de l'autre, jamais l'un sur l'autre.
// Un chantier qui passe d'une semaine à la suivante se coupe en deux barres,
// et la seconde dit « suite ».
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, toast, openModal, closeModal, confirm } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { etapeDeFiche, etapeDeDemande, joursDeVisite } from '../data/rgd-etapes.js';
import { LISTES, UNITES, joursPour, dureeLue, listesStandard, enregistrerStandard, versDate, versIso, ajouterJours, finDe,
         chantiersPlanifies, lignesDe, resteA, creerChantier, majChantier, supprimerChantier,
         ajouterLigne, ajouterStandard, majLigne, retirerLigne } from '../data/rgd-planning.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
// Des teintes franches et distinctes, lisibles en texte blanc.
const COULEURS = ['#fd7a2d', '#0284c7', '#16a34a', '#7c3aed', '#db2777', '#0d9488', '#ca8a04', '#475569'];
const couleurDe = (c, i = 0) => c.couleur || COULEURS[i % COULEURS.length];

const aujourdhui = () => versIso(new Date());
const dateLongue = (iso) => {
  const d = versDate(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
};
const dateCourte = (iso) => {
  const d = versDate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ------------------------------------------------------------ les fiches
// Le rattachement : une fiche client (`rgd_clients`) ou une demande
// (`rgd_demandes`). Le nom et l'adresse se lisent ici, à l'affichage : un nom
// recopié dans le chantier vieillirait dès la première correction de la fiche.
function nomFiche(f) {
  const c = f.contact_id && db.byId('contacts', f.contact_id);
  const o = f.organisation_id && db.byId('organisations', f.organisation_id);
  return [c?.first_name, c?.last_name].filter(Boolean).join(' ') || o?.name || '(fiche sans nom)';
}
const adresseFiche = (f) => [f.adresse_chantier, [f.code_postal_chantier, f.ville_chantier]
  .filter(Boolean).join(' ')].filter(Boolean).join(', ');
const nomDemande = (d) => `${d.prenom || ''} ${d.nom || ''}`.trim() || '(demande sans nom)';
const adresseDemande = (d) => [d.adresse, [d.code_postal, d.ville].filter(Boolean).join(' ')]
  .filter(Boolean).join(', ');

// ⚠ SEULEMENT LES DOSSIERS À L'ÉTAPE « DEVIS EN COURS » (10/11/2026,
// Élodie : « je ne veux pas toute la base de données client », mais « les
// devis en cours de la base de données clients & prospects »). L'étape est
// calculée par les MÊMES fonctions que l'écran Clients & prospects, pour que
// les deux listes ne divergent pas.
//
// ⚠ LE DOSSIER DÉJÀ RATTACHÉ RESTE PROPOSÉ même s'il a changé d'étape depuis
// (devis signé, chantier commencé) : sinon le chantier se rouvrirait sur
// « Aucune » et l'enregistrer effacerait le lien.
//
// ⚠ `db.t` ET NON `scope.rgd` : la page est réservée à la direction, et le
// sélecteur « Vue » mémorisé ailleurs aurait retiré de la liste les dossiers
// d'un chargé d'affaires.
const ETAPE_PROPOSEE = 'devis_encours';
function rattachements(actuel = '') {
  const chantiers = db.t('rgd_chantiers');
  const devis = db.t('rgd_devis');
  const jours = joursDeVisite(db.t('agenda_events'));
  return [
    ...db.t('rgd_clients')
      .filter(f => `fiche:${f.id}` === actuel || etapeDeFiche(f, chantiers, devis, jours) === ETAPE_PROPOSEE)
      .map(f => ({ cle: `fiche:${f.id}`, nom: nomFiche(f), adresse: adresseFiche(f), quoi: 'Client' })),
    ...db.t('rgd_demandes')
      .filter(d => `demande:${d.id}` === actuel || etapeDeDemande(d, devis) === ETAPE_PROPOSEE)
      .map(d => ({ cle: `demande:${d.id}`, nom: nomDemande(d), adresse: adresseDemande(d), quoi: 'Demande' })),
  ].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
const cleDe = (c) => (c.fiche_id ? `fiche:${c.fiche_id}` : c.demande_id ? `demande:${c.demande_id}` : '');
function rattachementDe(c) {
  if (c.fiche_id) { const f = db.byId('rgd_clients', c.fiche_id); return f ? { nom: nomFiche(f), ligne: f, genre: 'fiche' } : null; }
  if (c.demande_id) { const d = db.byId('rgd_demandes', c.demande_id); return d ? { nom: nomDemande(d), ligne: d, genre: 'demande' } : null; }
  return null;
}

// ------------------------------------------------------------ le calendrier
// Les semaines du mois, du lundi au dimanche, débordant sur les mois voisins
// pour que la grille reste rectangulaire.
function semainesDu(annee, mois) {
  const premier = new Date(annee, mois, 1);
  const decalage = (premier.getDay() + 6) % 7;          // lundi = 0
  const debut = new Date(annee, mois, 1 - decalage);
  const dernier = new Date(annee, mois + 1, 0);
  const semaines = [];
  for (let d = new Date(debut); d <= dernier || semaines.length < 4; ) {
    const jours = [];
    for (let i = 0; i < 7; i++) { jours.push(versIso(d)); d.setDate(d.getDate() + 1); }
    semaines.push(jours);
    if (d > dernier) break;
  }
  return semaines;
}

// Les barres d'une semaine, rangées en couloirs.
function barresDe(semaine, chantiers) {
  const [lundi, dimanche] = [semaine[0], semaine[6]];
  const morceaux = chantiers
    .map((c, i) => ({ c, i, fin: finDe(c) }))
    .filter(x => x.c.date_debut <= dimanche && x.fin >= lundi)
    .map(x => {
      const de = x.c.date_debut < lundi ? lundi : x.c.date_debut;
      const a = x.fin > dimanche ? dimanche : x.fin;
      return { ...x, col: semaine.indexOf(de) + 1, fin_col: semaine.indexOf(a) + 2,
        suite: x.c.date_debut < lundi, continue: x.fin > dimanche };
    })
    .sort((p, q) => p.col - q.col || (q.fin_col - q.col) - (p.fin_col - p.col));
  const couloirs = [];                                   // fin_col occupée par couloir
  for (const m of morceaux) {
    let k = couloirs.findIndex(fin => fin <= m.col);
    if (k === -1) { k = couloirs.length; couloirs.push(0); }
    couloirs[k] = m.fin_col;
    m.couloir = k + 2;                                   // ligne 1 = numéros des jours
  }
  return { morceaux, nb: couloirs.length };
}

function calendrier(annee, mois, chantiers) {
  const auj = aujourdhui();
  return `
    <div class="pl-cal">
      <div class="pl-cal-tete">${JOURS.map(j => `<div>${j}</div>`).join('')}</div>
      ${semainesDu(annee, mois).map(semaine => {
        const { morceaux, nb } = barresDe(semaine, chantiers);
        return `
        <div class="pl-sem" style="grid-template-rows: 30px repeat(${Math.max(nb, 1)}, 26px) minmax(10px, 1fr)">
          ${semaine.map((iso, k) => {
            const d = versDate(iso);
            const classes = ['pl-jour', d.getMonth() !== mois ? 'hors' : '', iso === auj ? 'auj' : '',
              k >= 5 ? 'we' : ''].filter(Boolean).join(' ');
            return `<button type="button" class="${classes}" style="grid-column:${k + 1}"
              data-jour="${iso}" title="Planifier un chantier le ${esc(dateLongue(iso))}">
              <span>${d.getDate()}</span></button>`;
          }).join('')}
          ${morceaux.map(m => `<button type="button" class="pl-barre${m.suite ? ' suite' : ''}${m.continue ? ' continue' : ''}"
              style="grid-column:${m.col} / ${m.fin_col}; grid-row:${m.couloir}; --pl-c:${couleurDe(m.c, m.i)}"
              data-chantier="${esc(m.c.id)}"
              title="${esc(`${m.c.titre} — du ${dateLongue(m.c.date_debut)} au ${dateLongue(m.fin)}`)}">
              ${m.suite ? '<i>suite</i> ' : ''}${esc(m.c.titre)}</button>`).join('')}
        </div>`;
      }).join('')}
    </div>`;
}

// ------------------------------------------------------------ la fiche chantier
function formulaire(c, defaut = {}) {
  const actuel = c ? cleDe(c) : '';
  const choix = rattachements(actuel);
  const duree = c ? dureeLue(c) : { nombre: 1, unite: 'jours' };
  const couleur = c?.couleur || '';
  return `
    <form class="pl-form" id="pl-form">
      <label class="pl-champ pl-large"><span>Chantier</span>
        <input name="titre" required value="${esc(c?.titre || '')}" placeholder="Ex. Rénovation salle de bain — Dupont"></label>
      <label class="pl-champ pl-large"><span>Dossier « Devis en cours »</span>
        <select name="rattachement">
          <option value="">${choix.length ? '— Aucun pour l’instant —' : '— Aucun dossier en « Devis en cours » —'}</option>
          ${choix.map(x => `<option value="${esc(x.cle)}"${x.cle === actuel ? ' selected' : ''}
            data-adresse="${esc(x.adresse)}">${esc(x.nom)} · ${esc(x.quoi)}${x.adresse ? ` · ${esc(x.adresse)}` : ''}</option>`).join('')}
        </select></label>
      <label class="pl-champ"><span>Début</span>
        <input type="date" name="date_debut" required value="${esc(c?.date_debut || defaut.date_debut || '')}"></label>
      <div class="pl-champ"><span>Durée</span>
        <div class="pl-duree">
          <input type="number" name="duree_nombre" min="1" max="366" required value="${esc(String(duree.nombre))}" aria-label="Nombre">
          <select name="duree_unite" aria-label="Unité">
            ${Object.entries(UNITES).map(([k, u]) => `<option value="${k}"${duree.unite === k ? ' selected' : ''}>${esc(u.plusieurs)}</option>`).join('')}
          </select>
        </div></div>
      <p class="pl-fin" id="pl-fin"></p>
      <label class="pl-champ pl-large"><span>Adresse du chantier</span>
        <input name="adresse" value="${esc(c?.adresse || '')}" placeholder="Reprise de la fiche si vide"></label>
      <div class="pl-champ pl-large"><span>Couleur</span>
        <div class="pl-couleurs">
          <label class="pl-pastille auto"><input type="radio" name="couleur" value=""${!couleur ? ' checked' : ''}><i></i>Auto</label>
          ${COULEURS.map(k => `<label class="pl-pastille"><input type="radio" name="couleur" value="${k}"${couleur === k ? ' checked' : ''}><i style="background:${k}"></i></label>`).join('')}
        </div></div>
      <label class="pl-champ pl-large"><span>Notes</span>
        <textarea name="notes" rows="2">${esc(c?.notes || '')}</textarea></label>
      <div class="form-actions pl-large">
        ${c ? '<button type="button" class="btn danger ghost" id="pl-suppr">Supprimer le chantier</button>' : ''}
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-close>Fermer</button>
        <button type="submit" class="btn primary">${c ? 'Enregistrer' : 'Créer le chantier'}</button>
      </div>
    </form>`;
}

function blocListe(c, liste) {
  const lignes = lignesDe(c.id, liste);
  const faits = lignes.filter(l => l.deja_la || l.achete).length;
  return `
    <section class="pl-liste" data-liste="${liste}">
      <div class="pl-liste-tete">
        <h3>${esc(LISTES[liste].label)}</h3>
        <span class="pl-liste-compte">${faits} / ${lignes.length} prêts</span>
        <span class="grow"></span>
        <button type="button" class="btn ghost sm" data-standard="${liste}">+ Liste standard</button>
      </div>
      ${lignes.length ? `
      <div class="pl-lignes">
        <div class="pl-ligne pl-ligne-tete"><span>En stock</span><span>Acheté</span><span>${esc(LISTES[liste].label)}</span><span>Quantité</span><span></span></div>
        ${lignes.map(l => `
        <div class="pl-ligne${l.deja_la || l.achete ? ' fait' : ''}" data-ligne="${esc(l.id)}">
          <label class="pl-case" title="On l’a déjà"><input type="checkbox" data-case="deja_la"${l.deja_la ? ' checked' : ''}></label>
          <label class="pl-case" title="Acheté"><input type="checkbox" data-case="achete"${l.achete ? ' checked' : ''}></label>
          <input class="pl-libelle" data-champ="libelle" value="${esc(l.libelle)}" aria-label="Libellé">
          <input class="pl-qte" data-champ="quantite" value="${esc(l.quantite || '')}" placeholder="—" aria-label="Quantité">
          <button type="button" class="icon-btn" data-retirer title="Retirer la ligne">✕</button>
        </div>`).join('')}
      </div>` : `<p class="muted small">Rien pour l’instant : ajoutez la liste standard, ou une ligne ci-dessous.</p>`}
      <form class="pl-ajout" data-ajout="${liste}">
        <input placeholder="Ajouter un ${esc(LISTES[liste].court)}…" aria-label="Ajouter une ligne">
        <button type="submit" class="btn sm">Ajouter</button>
      </form>
    </section>`;
}

function ouvrirChantier(c, apres, jour = null) {
  const r = c && rattachementDe(c);
  const corps = () => `
    ${r ? `<p class="pl-lien">Fiche : <button type="button" class="btn ghost sm" id="pl-fiche">${esc(r.nom)}</button></p>` : ''}
    ${formulaire(c, { date_debut: jour || aujourdhui() })}
    ${c ? `<div class="pl-listes">${blocListe(c, 'materiaux')}${blocListe(c, 'outils')}</div>`
      : '<p class="muted small pl-apres">Les listes matériaux et outils s’ouvrent une fois le chantier créé.</p>'}`;
  const m = openModal(c ? c.titre : 'Nouveau chantier', corps(), { wide: true, onClose: apres });
  brancher(m, c, apres);
}

function brancher(m, c, apres) {
  const form = m.querySelector('#pl-form');
  const fin = m.querySelector('#pl-fin');
  const majFin = () => {
    const d = form.date_debut.value;
    const n = joursPour(d || aujourdhui(), form.duree_nombre.value, form.duree_unite.value);
    fin.textContent = d ? `Fin : ${dateLongue(ajouterJours(d, Math.max(1, n) - 1))} · ${n} jour${n > 1 ? 's' : ''} calendaire${n > 1 ? 's' : ''}` : '';
  };
  form.date_debut.oninput = majFin; form.duree_nombre.oninput = majFin; form.duree_unite.onchange = majFin; majFin();
  // L'adresse se reprend de la fiche choisie, si on n'en a pas tapé une.
  form.rattachement.onchange = () => {
    const opt = form.rattachement.selectedOptions[0];
    if (!form.adresse.value && opt?.dataset.adresse) form.adresse.value = opt.dataset.adresse;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const [genre, id] = (form.rattachement.value || ':').split(':');
    const champs = {
      titre: form.titre.value, date_debut: form.date_debut.value,
      duree_nombre: form.duree_nombre.value, duree_unite: form.duree_unite.value,
      fiche_id: genre === 'fiche' ? id : null, demande_id: genre === 'demande' ? id : null,
      adresse: form.adresse.value, couleur: form.couleur.value, notes: form.notes.value,
    };
    try {
      if (c) { await majChantier(c.id, champs); toast('Chantier enregistré'); closeModal(); }
      else {
        const neuf = await creerChantier(champs);
        toast('Chantier créé — ajoutez ses listes');
        ouvrirChantier(db.byId('rgd_planning', neuf.id) || neuf, apres);
      }
    } catch (err) { toast(err.message, 'error'); }
  };
  const bSuppr = m.querySelector('#pl-suppr');
  if (bSuppr) bSuppr.onclick = async () => {
    if (!await confirm(`Supprimer « ${c.titre} » et ses listes ? C’est définitif.`)) { ouvrirChantier(c, apres); return; }
    try { await supprimerChantier(c.id); toast('Chantier supprimé'); apres?.(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const bFiche = m.querySelector('#pl-fiche');
  if (bFiche) bFiche.onclick = async () => {
    const r = rattachementDe(c);
    const { ouvrirProspectRgd } = await import('./rgd-clients.js');
    ouvrirProspectRgd(r.ligne, r.genre, apres,
      { label: '← Retour au chantier', action: () => ouvrirChantier(db.byId('rgd_planning', c.id), apres) });
  };
  if (!c) return;

  // Les listes : on redessine la seule zone des listes, pas la fenêtre, pour
  // ne pas perdre ce qu'on est en train de taper dans le formulaire du haut.
  const zone = m.querySelector('.pl-listes');
  const redessiner = () => {
    zone.innerHTML = blocListe(c, 'materiaux') + blocListe(c, 'outils');
    brancherListes();
  };
  const brancherListes = () => {
    zone.querySelectorAll('[data-standard]').forEach(b => b.onclick = async () => {
      try {
        const n = await ajouterStandard(c.id, b.dataset.standard);
        toast(n ? `${n} ligne${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''}` : 'La liste standard est déjà là');
        redessiner();
      } catch (err) { toast(err.message, 'error'); }
    });
    zone.querySelectorAll('[data-ajout]').forEach(f => f.onsubmit = async (e) => {
      e.preventDefault();
      const champ = f.querySelector('input');
      try { await ajouterLigne(c.id, f.dataset.ajout, champ.value); redessiner();
        zone.querySelector(`[data-ajout="${f.dataset.ajout}"] input`)?.focus(); }
      catch (err) { toast(err.message, 'error'); }
    });
    zone.querySelectorAll('[data-ligne]').forEach(row => {
      const id = row.dataset.ligne;
      row.querySelectorAll('[data-case]').forEach(cb => cb.onchange = async () => {
        try { await majLigne(id, { [cb.dataset.case]: cb.checked }); redessiner(); }
        catch (err) { cb.checked = !cb.checked; toast(err.message, 'error'); }
      });
      // Le texte s'enregistre en quittant le champ, pas à chaque touche.
      row.querySelectorAll('[data-champ]').forEach(inp => inp.onchange = async () => {
        const v = inp.value.trim();
        if (inp.dataset.champ === 'libelle' && !v) { redessiner(); return; }
        try { await majLigne(id, { [inp.dataset.champ]: v || null }); }
        catch (err) { toast(err.message, 'error'); }
      });
      row.querySelector('[data-retirer]').onclick = async () => {
        try { await retirerLigne(id); redessiner(); } catch (err) { toast(err.message, 'error'); }
      };
    });
  };
  brancherListes();
}

// ------------------------------------------------------------ les listes standard
function ouvrirStandard() {
  const s = listesStandard();
  const m = openModal('Listes standard', `
    <p class="muted small">Le modèle qu’on ajoute à un chantier d’un clic. Une ligne par article.
      Le modifier ne change pas les chantiers déjà préparés.</p>
    <div class="pl-std">
      ${Object.entries(LISTES).map(([k, l]) => `<label class="pl-champ"><span>${esc(l.label)}</span>
        <textarea name="${k}" rows="14">${esc(s[k].join('\n'))}</textarea></label>`).join('')}
    </div>
    <div class="form-actions"><button class="btn ghost" data-close>Annuler</button>
      <button class="btn primary" id="pl-std-ok">Enregistrer</button></div>`, { wide: true });
  m.querySelector('#pl-std-ok').onclick = async () => {
    const lire = (k) => m.querySelector(`textarea[name="${k}"]`).value.split('\n');
    try { await enregistrerStandard({ materiaux: lire('materiaux'), outils: lire('outils') });
      toast('Listes standard enregistrées'); closeModal(); }
    catch (err) { toast(err.message, 'error'); }
  };
}

// ------------------------------------------------------------ la page
export const rgdPlanningPage = {
  title: () => 'RGD Renova — Planning chantier',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const auj = versDate(aujourdhui());
    const state = { annee: auj.getFullYear(), mois: auj.getMonth() };

    const draw = () => {
      if (!scope.isDirection) {
        root.innerHTML = cadre('#/rgd/planning', 'Planning chantier',
          '<div class="card"><div class="empty">Le planning des chantiers est réservé à la direction.</div></div>');
        return;
      }
      const tous = chantiersPlanifies();
      const premier = versIso(new Date(state.annee, state.mois, 1));
      const dernier = versIso(new Date(state.annee, state.mois + 1, 0));
      const duMois = tous.filter(c => c.date_debut <= dernier && finDe(c) >= premier);

      const corps = `
        <div class="pl-barre-outils">
          <div class="pl-nav">
            <button type="button" class="btn ghost" data-pas="-1" aria-label="Mois précédent">‹</button>
            <h2>${esc(MOIS[state.mois])} ${state.annee}</h2>
            <button type="button" class="btn ghost" data-pas="1" aria-label="Mois suivant">›</button>
            <button type="button" class="btn ghost sm" id="pl-auj">Aujourd’hui</button>
          </div>
          <span class="grow"></span>
          <button type="button" class="btn ghost" id="pl-std">Listes standard</button>
          <button type="button" class="btn primary" id="pl-neuf">+ Nouveau chantier</button>
        </div>
        <section class="card pl-carte">
          ${calendrier(state.annee, state.mois, tous)}
          <p class="muted small pl-aide">Cliquez sur un jour pour y planifier un chantier, sur une barre pour ouvrir sa fiche.</p>
        </section>
        <section class="card pl-carte">
          <h3 class="pl-titre">Chantiers de ${esc(MOIS[state.mois])} <span>${duMois.length}</span></h3>
          ${duMois.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Chantier</th><th>Fiche</th><th>Du</th><th>Au</th><th>Durée</th><th>À trouver</th></tr></thead>
            <tbody>${duMois.map(c => {
              const r = rattachementDe(c);
              const reste = resteA(c.id);
              const n = lignesDe(c.id).length;
              return `<tr data-chantier="${esc(c.id)}">
                <td><span class="pl-point" style="background:${couleurDe(c, tous.indexOf(c))}"></span><b>${esc(c.titre)}</b></td>
                <td>${r ? esc(r.nom) : '<span class="muted">—</span>'}</td>
                <td>${esc(dateCourte(c.date_debut))}</td><td>${esc(dateCourte(finDe(c)))}</td>
                <td>${esc(dureeLue(c).texte)}</td>
                <td>${!n ? '<span class="muted">Pas de liste</span>'
                  : reste ? `<span class="chip amber">${reste} à trouver</span>` : '<span class="chip green">Tout est prêt</span>'}</td>
              </tr>`;
            }).join('')}</tbody></table></div>`
            : '<div class="empty">Aucun chantier ce mois-ci.</div>'}
        </section>`;

      root.innerHTML = cadre('#/rgd/planning', 'Planning chantier', corps);
      root.querySelectorAll('[data-pas]').forEach(b => b.onclick = () => {
        const d = new Date(state.annee, state.mois + Number(b.dataset.pas), 1);
        state.annee = d.getFullYear(); state.mois = d.getMonth(); draw();
      });
      root.querySelector('#pl-auj').onclick = () => { state.annee = auj.getFullYear(); state.mois = auj.getMonth(); draw(); };
      root.querySelector('#pl-neuf').onclick = () => ouvrirChantier(null, draw);
      root.querySelector('#pl-std').onclick = ouvrirStandard;
      root.querySelectorAll('[data-jour]').forEach(b => b.onclick = () => ouvrirChantier(null, draw, b.dataset.jour));
      root.querySelectorAll('[data-chantier]').forEach(el => el.onclick = () => {
        const c = db.byId('rgd_planning', el.dataset.chantier);
        if (c) ouvrirChantier(c, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
