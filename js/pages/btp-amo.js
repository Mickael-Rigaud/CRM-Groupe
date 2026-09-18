// La fiche découverte AMO du manuel opérationnel V5 (§40), et son impression.
//
// POURQUOI UN FORMULAIRE À PART
// Une expertise se saisit en quelques champs : un désordre, un bien, une date. Une
// AMO se découvre en rendez-vous — le projet, son budget, son avancement, ce que le
// client attend, ce qui va coincer. Le manuel en a fait une fiche de cinq rubriques
// parce que ces réponses commandent la suite : le §41 en tire le taux d'honoraires,
// le §42 le niveau de mission et donc les points de charge.
//
// Ce qui est coché ici n'est donc pas de la documentation : c'est le calcul du devis.
// D'où la dernière étape, qui montre le score se former et le taux en découler.
//
// L'IMPRESSION
// Pas de bibliothèque PDF : la fiche est une page HTML mise en page pour l'A4, rendue
// dans un cadre invisible et confiée à l'impression du navigateur. « Enregistrer au
// format PDF » y est une destination comme une autre. Un cadre plutôt qu'une fenêtre
// séparée : une fenêtre s'ouvre au bon vouloir du bloqueur de publicités, un cadre
// non.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, toast, openModal, closeModal, contactName } from '../ui.js';
import {
  CHANNELS, NIVEAUX_BTP, HONORAIRES_AMO, honorairesAmo, couleurMission, stagesDe, tauxSuggere,
  FICHE_AMO, MATRICE_AMO, CRITERES_V5, coteBudget, coteDuree, coteLots, niveauSuggere, controleTaux,
} from '../data/schema.js';
import { enteteFiche, piedFiche, signatures, cases, ligne, pageFiche, imprimerPage } from './btp-fiche.js';

const KEY = 'btp';
const C = couleurMission('amo');
const teinte = `--m:${C.couleur};--m-clair:${C.clair};--m-encre:${C.encre}`;
const CANAUX_COURANTS = ['Recommandation client', 'Ancien client', 'Téléphone / autre', 'Site internet direct', 'Prospection directe'];

const TYPES_BIEN = ['Maison', 'Appartement', 'Immeuble', 'Local pro', 'Autre'];

// ------------------------------------------------------- Le calcul des honoraires
// Le plancher de 3 500 € HT écrase le calcul sous 43 750 € de travaux : à 5, 6, 7 ou
// 8 %, le résultat est le même. L'arithmétique est juste — elle retombe sur les sept
// lignes du barème du manuel — mais à l'écran le calculateur a l'air d'ignorer le
// pourcentage. Montrer les quatre taux et leur résultat règle la question : on voit
// le montant varier, on voit où le plancher mord, et pourquoi.
//
// Le tableau sert aussi de sélecteur : cliquer une ligne retient ce taux. Un seul
// objet à l'écran plutôt qu'un choix d'un côté et un résultat de l'autre.
export const TAUX_AMO = MATRICE_AMO.paliers.map(p => p.taux);

export function tableauHonoraires(travaux, retenu, suggere) {
  const montant = Number(travaux) || 0;
  const h = honorairesAmo(montant, retenu);
  return `
    <div class="hono-total ${h.plancher ? 'plancher' : ''}">
      <span>Honoraires HT</span>
      <b>${montant ? eur(h.retenu) : '—'}</b>
    </div>
    <table class="hono-tab"><tbody>${TAUX_AMO.map(t => {
      const x = honorairesAmo(montant, t);
      return `<tr class="${t === Number(retenu) ? 'on' : ''}" data-taux="${t}" role="button" tabindex="0"
        title="Retenir ${t} %">
        <th>${t} %${t === Number(suggere) ? '<em>suggéré</em>' : ''}</th>
        <td>${montant ? eur(x.retenu) : '—'}</td>
        <td class="min">${montant && x.plancher ? 'minimum' : ''}</td>
      </tr>`;
    }).join('')}</tbody></table>
    ${!montant
      ? '<p class="hono-note">Saisissez le montant des travaux HT.</p>'
      : h.plancher
        ? `<p class="hono-note alerte">${retenu} % de ${eur(montant)} donnerait ${eur(h.brut)} : le minimum de ${eur(HONORAIRES_AMO.minimum)} HT s'applique.</p>`
        : ''}
    ${montant && montant < Math.round(HONORAIRES_AMO.minimum / (Math.max(...TAUX_AMO) / 100))
      ? `<p class="hono-note">Sous ${eur(Math.round(HONORAIRES_AMO.minimum / (Math.max(...TAUX_AMO) / 100)))} de travaux, le minimum s'applique quel que soit le taux : le pourcentage ne change plus rien.</p>`
      : ''}`;
}

// ------------------------------------------------------------------ Le formulaire
export function ficheDecouverteAmo(apres) {
  const users = scope.users();
  const contacts = scope.contacts();
  const etapes = stagesDe(KEY, 'amo');

  const v = {
    pas: 1,
    nouveau: true, contact_id: '',
    nom: '', telephone: '', email: '',
    adresse: '', type_bien: '', surface: '', occupation: '', canal: 'Recommandation client',
    travaux: [], description: '', budget_ht: '', budget_max: '', date_debut: '', date_fin: '',
    avancement: [], besoins: [], risques: [],
    cotes: { budget: null, lots: null, duree: null, intensite: null, contraintes: null },
    taux_final: null, motif: '',
    niveau: null,
    owner_id: scope.user.id,
    stage: etapes[0].key,
  };

  const m = openModal('Fiche découverte — AMO', '<div id="fa-corps"></div>', { wide: true });
  const corps = m.querySelector('#fa-corps');
  m.querySelector('.modal-head')?.setAttribute('style', `${teinte};border-bottom:3px solid var(--m)`);

  // ---- ce que le CRM déduit tout seul
  const auto = {
    budget: () => coteBudget(v.budget_ht),
    lots: () => coteLots(v.travaux.length),
    duree: () => coteDuree(v.date_debut, v.date_fin),
    intensite: () => null,
    contraintes: () => null,
  };
  const coteDe = (cle) => (v.cotes[cle] ?? auto[cle]());
  const scoreTotal = () => CRITERES_V5.reduce((t, c) => t + (coteDe(c.key) ?? 0), 0);
  const cotesFaites = () => CRITERES_V5.filter(c => coteDe(c.key) !== null).length;
  const suggere = () => tauxSuggere(scoreTotal()).taux;
  const tauxRetenu = () => (v.taux_final ?? suggere());
  const honos = () => honorairesAmo(v.budget_ht, tauxRetenu());
  const niveauRetenu = () => NIVEAUX_BTP.find(n => n.key === v.niveau) || niveauSuggere(scoreTotal());
  const nomClient = () => (v.nouveau ? v.nom.trim() : contactName(db.byId('contacts', v.contact_id)));

  const PAS = [['Client et projet', 1], ['Travaux et budget', 2], ['Accompagnement', 3], ['Taux et niveau', 4]];

  const enTete = () => `
    <div class="mf-pas" style="${teinte}">
      ${PAS.map(([lbl, n]) => `
        <div class="mf-pas-item ${v.pas === n ? 'on' : ''} ${v.pas > n ? 'fait' : ''}" data-pas="${n}">
          <span class="mf-pas-num">${v.pas > n ? '✓' : n}</span>${esc(lbl)}
        </div>`).join('<i class="mf-pas-lien"></i>')}
    </div>`;

  // Une liste à cocher du manuel devient une rangée d'étiquettes : on voit tout, et
  // ce qui est retenu se lit d'un coup d'œil.
  const chips = (cle, liste) => `<div class="fa-chips" data-chips="${cle}">${liste.map(x => `
    <button type="button" class="fa-chip ${v[cle].includes(x) ? 'on' : ''}" data-val="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;

  const champ = (id, label, valeur, attrs = '') =>
    `<label class="mail-champ"><span>${esc(label)}</span><input id="${id}" value="${esc(valeur ?? '')}" ${attrs}></label>`;

  const ecran1 = () => `
    <div class="mf-bloc-titre">A. Client</div>
    <div class="mf-seg">
      <button type="button" class="${v.nouveau ? 'on' : ''}" data-mode="1">Nouveau client</button>
      <button type="button" class="${v.nouveau ? '' : 'on'}" data-mode="0">Déjà dans le CRM</button>
    </div>
    ${v.nouveau
      ? `<div class="mf-grille">
          ${champ('fa-nom', 'Nom / société *', v.nom, 'placeholder="Dupont, ou SCI Les Oliviers"')}
          ${champ('fa-tel', 'Téléphone', v.telephone, 'placeholder="06 12 34 56 78"')}
          ${champ('fa-email', 'E-mail', v.email, 'type="email" placeholder="contact@exemple.fr"')}
        </div>`
      : `<div class="mf-grille"><label class="mail-champ plein"><span>Client *</span>
          <select id="fa-contact"><option value="">— choisir —</option>
            ${contacts.map(x => `<option value="${x.id}" ${x.id === v.contact_id ? 'selected' : ''}>${esc(contactName(x))}${x.city ? ` · ${esc(x.city)}` : ''}</option>`).join('')}
          </select></label></div>`}

    <div class="mf-bloc-titre">Le bien</div>
    <div class="mf-grille">
      <label class="mail-champ plein"><span>Adresse du projet</span>
        <input id="fa-adresse" value="${esc(v.adresse)}" placeholder="14 avenue des Platanes, Nice"></label>
      <label class="mail-champ"><span>Type de bien</span>
        <select id="fa-type"><option value="">—</option>${TYPES_BIEN.map(t => `<option ${t === v.type_bien ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      ${champ('fa-surface', 'Surface', v.surface, 'placeholder="120 m²"')}
      <label class="mail-champ"><span>Occupation pendant travaux</span>
        <select id="fa-occupation"><option value="">—</option>${FICHE_AMO.occupation.map(o => `<option ${o === v.occupation ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <label class="mail-champ"><span>Origine du lead</span>
        <select id="fa-canal">
          ${CANAUX_COURANTS.map(x => `<option ${x === v.canal ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          <optgroup label="Autres canaux">${CHANNELS.filter(x => !CANAUX_COURANTS.includes(x)).map(x => `<option ${x === v.canal ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>
        </select></label>
    </div>

    <div class="form-actions">
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="fa-suite">Continuer →</button>
    </div>`;

  const ecran2 = () => `
    <div class="mf-bloc-titre">B. Travaux envisagés</div>
    ${chips('travaux', FICHE_AMO.travaux)}
    <p class="mf-aide">${v.travaux.length
      ? `${v.travaux.length} poste${v.travaux.length > 1 ? 's' : ''} retenu${v.travaux.length > 1 ? 's' : ''} — servira à coter le nombre de lots.`
      : 'Cochez les postes concernés : ils servent à coter le nombre de lots.'}</p>

    <div class="mf-grille">
      <label class="mail-champ plein"><span>Description du projet</span>
        <textarea id="fa-description" rows="3" placeholder="Ce que le client veut obtenir, dans ses mots.">${esc(v.description)}</textarea></label>
      <label class="mail-champ"><span>Budget travaux HT estimé *</span>
        <input type="number" id="fa-budget" min="0" step="1000" value="${esc(v.budget_ht)}" placeholder="200000"></label>
      <label class="mail-champ"><span>Budget maximum client</span>
        <input type="number" id="fa-budgetmax" min="0" step="1000" value="${esc(v.budget_max)}" placeholder="230000"></label>
      <label class="mail-champ"><span>Démarrage souhaité</span>
        <input type="date" id="fa-debut" value="${esc(v.date_debut)}"></label>
      <label class="mail-champ"><span>Fin souhaitée</span>
        <input type="date" id="fa-fin" value="${esc(v.date_fin)}"></label>
    </div>

    <div class="mf-bloc-titre">C. État d'avancement</div>
    ${chips('avancement', FICHE_AMO.avancement)}

    <div class="form-actions">
      <button type="button" class="btn ghost left" id="fa-retour">← Client</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="fa-suite">Continuer →</button>
    </div>`;

  const ecran3 = () => `
    <div class="mf-bloc-titre">D. Besoin d'accompagnement</div>
    ${chips('besoins', FICHE_AMO.besoins)}
    <p class="mf-aide">Ce qui est retenu ici décrit le périmètre de la mission : c'est ce que reprendra la lettre de mission.</p>

    <div class="mf-bloc-titre">E. Risques et contraintes</div>
    ${chips('risques', FICHE_AMO.risques)}
    <p class="mf-aide">${v.risques.length
      ? `${v.risques.length} contrainte${v.risques.length > 1 ? 's' : ''} relevée${v.risques.length > 1 ? 's' : ''} — à garder en tête pour coter les interfaces.`
      : "Aucune contrainte relevée pour l'instant."}</p>

    <div class="form-actions">
      <button type="button" class="btn ghost left" id="fa-retour">← Travaux</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="fa-suite">Continuer →</button>
    </div>`;

  const ecran4 = () => {
    const score = scoreTotal();
    const faites = cotesFaites();
    const complet = faites === CRITERES_V5.length;
    const sug = suggere();
    const taux = tauxRetenu();
    const ctrl = controleTaux(sug, taux, v.motif);
    const h = honos();
    const niv = niveauRetenu();
    return `
    <div class="mf-bloc-titre">Score de complexité — règle V5</div>
    <div class="table-wrap"><table class="btp-matrice fa-matrice">
      <thead><tr><th>Critère</th><th>0 point</th><th>1 point</th><th>2 points</th></tr></thead>
      <tbody>${CRITERES_V5.map(c => {
        const cote = coteDe(c.key);
        const deduit = v.cotes[c.key] === null && cote !== null;
        return `<tr>
          <th scope="row">${esc(c.label)}${deduit ? '<em class="fa-deduit">déduit</em>' : ''}</th>
          ${c.valeurs.map((lbl, n) => `<td class="choix ${cote === n ? 'on' : ''}" data-crit="${c.key}" data-score="${n}"
            role="radio" aria-checked="${cote === n}" tabindex="0"><span class="btp-coche"></span>${esc(lbl)}</td>`).join('')}
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="mf-aide">${complet
      ? 'Les cinq critères sont cotés.'
      : `${CRITERES_V5.length - faites} critère${CRITERES_V5.length - faites > 1 ? 's' : ''} à coter. Budget, lots et durée se déduisent de l'étape précédente.`}</p>

    <div class="btp-score" style="${teinte}">
      <div class="btp-score-val ${complet ? 'plein' : ''}"><b>${score}</b><span>points sur 10</span></div>
      <span class="btp-score-fleche" aria-hidden="true">→</span>
      <div class="btp-score-taux"><b>${sug} %</b><span>taux suggéré</span></div>
    </div>

    <div class="mf-bloc-titre">Taux retenu et honoraires</div>
    <div class="fa-taux" style="${teinte}">
      ${tableauHonoraires(v.budget_ht, taux, sug)}
    </div>
    ${ctrl.ecart ? `
      <label class="mail-champ plein" style="margin-bottom:10px"><span>Motif de la dérogation *</span>
        <input id="fa-motif" value="${esc(v.motif)}" placeholder="Ex. opération importante, décision commerciale validée"></label>` : ''}
    ${ctrl.validationDirection ? '<p class="mf-aide attention">Taux inférieur à 5 % : validation de la direction obligatoire.</p>' : ''}

    <div class="mf-bloc-titre">Niveau de mission</div>
    <div class="mf-niveaux" style="${teinte}">
      ${NIVEAUX_BTP.filter(n => n.mission === 'amo').map(n => {
        const parDefaut = niveauSuggere(score).key === n.key;
        return `<button type="button" class="mf-niveau ${n.key === niv.key ? 'on' : ''}" data-niveau="${n.key}">
          <span class="mf-niveau-pts">${n.points} pts</span>
          <b>${esc(n.label)}${parDefaut ? '<em class="fa-suggere">suggéré</em>' : ''}</b>
          <span class="mf-niveau-txt">${esc(n.contenu)}</span>
        </button>`;
      }).join('')}
    </div>

    <div class="mf-grille">
      <label class="mail-champ"><span>Où en est la mission ?</span>
        <select id="fa-stage">${etapes.map(e => `<option value="${e.key}" ${e.key === v.stage ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select></label>
      <label class="mail-champ"><span>Chargé d'affaires</span>
        <select id="fa-owner">${users.map(u => `<option value="${u.id}" ${u.id === v.owner_id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></label>
    </div>

    <div class="form-actions">
      <button type="button" class="btn ghost left" id="fa-retour">← Accompagnement</button>
      <button type="button" class="btn ghost" id="fa-pdf">Aperçu / PDF</button>
      <button type="button" class="btn" id="fa-creer">Créer la mission</button>
    </div>`;
  };

  const dessine = () => {
    corps.innerHTML = enTete() + [ecran1, ecran2, ecran3, ecran4][v.pas - 1]();
    lier();
  };

  const lier = () => {
    corps.querySelectorAll('[data-pas]').forEach(b => b.onclick = () => {
      const n = Number(b.dataset.pas);
      if (n < v.pas) { v.pas = n; dessine(); }
    });
    corps.querySelector('#fa-retour')?.addEventListener('click', () => { v.pas -= 1; dessine(); });
    corps.querySelectorAll('[data-chips]').forEach(groupe => {
      const cle = groupe.dataset.chips;
      groupe.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
        const x = b.dataset.val;
        v[cle] = v[cle].includes(x) ? v[cle].filter(y => y !== x) : [...v[cle], x];
        dessine();
      });
    });
    const poser = (sel, cle) => { const el = corps.querySelector(sel); if (el) el.oninput = () => { v[cle] = el.value; }; };
    const choisir = (sel, cle) => { const el = corps.querySelector(sel); if (el) el.onchange = () => { v[cle] = el.value; }; };

    if (v.pas === 1) {
      corps.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { v.nouveau = b.dataset.mode === '1'; dessine(); });
      poser('#fa-nom', 'nom'); poser('#fa-tel', 'telephone'); poser('#fa-email', 'email'); poser('#fa-adresse', 'adresse');
      poser('#fa-surface', 'surface');
      choisir('#fa-contact', 'contact_id'); choisir('#fa-type', 'type_bien');
      choisir('#fa-occupation', 'occupation'); choisir('#fa-canal', 'canal');
      corps.querySelector('#fa-suite').onclick = () => {
        if (v.nouveau && !v.nom.trim()) return toast('Le nom du client est nécessaire', 'warn');
        if (!v.nouveau && !v.contact_id) return toast('Choisissez le client', 'warn');
        v.pas = 2; dessine();
      };
      return;
    }
    if (v.pas === 2) {
      poser('#fa-description', 'description'); poser('#fa-budget', 'budget_ht'); poser('#fa-budgetmax', 'budget_max');
      choisir('#fa-debut', 'date_debut'); choisir('#fa-fin', 'date_fin');
      corps.querySelector('#fa-suite').onclick = () => {
        if (!Number(v.budget_ht)) return toast('Le budget travaux HT commande le taux : il est nécessaire', 'warn');
        v.pas = 3; dessine();
      };
      return;
    }
    if (v.pas === 3) {
      corps.querySelector('#fa-suite').onclick = () => { v.pas = 4; dessine(); };
      return;
    }

    corps.querySelectorAll('[data-crit]').forEach(td => {
      const coter = () => {
        const cle = td.dataset.crit;
        const n = Number(td.dataset.score);
        v.cotes[cle] = v.cotes[cle] === n ? null : n;
        dessine();
      };
      td.onclick = coter;
      td.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coter(); } };
    });
    corps.querySelectorAll('[data-taux]').forEach(b => {
      const retenir = () => { v.taux_final = Number(b.dataset.taux); dessine(); };
      b.onclick = retenir;
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); retenir(); } };
    });
    corps.querySelectorAll('[data-niveau]').forEach(b => b.onclick = () => { v.niveau = b.dataset.niveau; dessine(); });
    poser('#fa-motif', 'motif');
    choisir('#fa-stage', 'stage'); choisir('#fa-owner', 'owner_id');
    corps.querySelector('#fa-pdf').onclick = () => imprimerPage(ficheHtml(pourImpression()));
    corps.querySelector('#fa-creer').onclick = creer;
  };

  // Ce qu'on garde de la fiche, et ce qu'on imprime : même objet, pour que le papier
  // dise exactement ce que la base contient.
  const pourImpression = () => ({
    client: nomClient() || '—',
    telephone: v.telephone, email: v.email,
    adresse: v.adresse, type_bien: v.type_bien, surface: v.surface,
    occupation: v.occupation, canal: v.canal,
    travaux: v.travaux, description: v.description,
    budget_ht: v.budget_ht, budget_max: v.budget_max,
    date_debut: v.date_debut, date_fin: v.date_fin,
    avancement: v.avancement, besoins: v.besoins, risques: v.risques,
    cotes: CRITERES_V5.map(c => ({ label: c.label, valeurs: c.valeurs, cote: coteDe(c.key) })),
    score: scoreTotal(), taux_suggere: suggere(), taux_final: tauxRetenu(), motif: v.motif,
    honoraires: Number(v.budget_ht) ? honos().retenu : null,
    plancher: Number(v.budget_ht) ? honos().plancher : false,
    niveau: niveauRetenu().label, points: niveauRetenu().points,
    charge: scope.users().find(u => u.id === v.owner_id)?.full_name || '—',
    etape: etapes.find(e => e.key === v.stage)?.label || v.stage,
    etablie_le: new Date().toISOString().slice(0, 10),
    metier: 'amo',
  });

  async function creer() {
    if (cotesFaites() < CRITERES_V5.length) return toast('Les cinq critères doivent être cotés', 'warn');
    const ctrl = controleTaux(suggere(), tauxRetenu(), v.motif);
    if (ctrl.motifManquant) return toast('Taux différent du taux suggéré : le motif est obligatoire', 'warn');
    const bouton = corps.querySelector('#fa-creer');
    bouton.disabled = true;
    try {
      let contactId = v.contact_id;
      if (v.nouveau) {
        const neuf = await db.insert('contacts', {
          last_name: v.nom.trim(), email: v.email.trim() || null, phone: v.telephone.trim() || null,
          city: v.adresse.trim() || null, activities: [KEY], type: 'Prospect', channel: v.canal,
        });
        contactId = neuf.id;
      } else {
        const x = db.byId('contacts', contactId);
        if (x && !(x.activities || []).includes(KEY)) {
          await db.update('contacts', contactId, { activities: [...(x.activities || []), KEY] });
        }
      }

      const fiche = pourImpression();
      const maintenant = new Date().toISOString();
      const deal = await db.insert('deals', {
        title: `${v.travaux[0] || 'AMO'} — ${nomClient()}${v.adresse ? ` (${v.adresse})` : ''}`,
        activity: KEY, stage: v.stage, status: 'open',
        contact_id: contactId, owner_id: v.owner_id, channel: v.canal,
        amount: fiche.honoraires,
        fields: {
          type_mission: 'amo',
          niveau: niveauRetenu().key,
          problematique: v.travaux.join(', ') || 'AMO',
          type_bien: v.type_bien || null,
          adresse: v.adresse.trim() || null,
          detail: v.description.trim() || null,
          montant_travaux: Number(v.budget_ht) || null,
          taux_amo: tauxRetenu(),
          date_visite: v.date_debut || null,
          decouverte: fiche,          // la fiche entière, pour la réimprimer plus tard
        },
        stage_history: [{ stage: v.stage, at: maintenant }],
        stage_changed_at: maintenant,
      });

      await db.insert('activities', {
        deal_id: deal.id, contact_id: contactId, type: 'rdv',
        title: 'Cadrer le besoin avec le maître d’ouvrage',
        due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        assignee_id: v.owner_id, done: false,
      });

      closeModal(true);
      toast('Mission AMO créée, fiche découverte enregistrée');
      apres?.(deal.id);
    } catch (err) {
      bouton.disabled = false;
      toast(err.message, 'err');
    }
  }

  dessine();
}

// ------------------------------------------------------------------ L'impression
// La feuille tient en deux pages : les rubriques du manuel d'abord, la qualification
// et les signatures ensuite. La coupure est posée, pas subie — voir btp-fiche.js.
export function ficheHtml(f) {
  const sections = [
    ['B. Travaux envisagés', FICHE_AMO.travaux, f.travaux],
    ["C. État d'avancement", FICHE_AMO.avancement, f.avancement],
    ["D. Besoin d'accompagnement", FICHE_AMO.besoins, f.besoins],
    ['E. Risques et contraintes', FICHE_AMO.risques, f.risques],
  ];
  const corps = `
${enteteFiche({
    titre: "Fiche de mission — Assistance à Maîtrise d'Ouvrage",
    sous: 'Fiche découverte client, manuel opérationnel V5 (§40)',
    droite: `Établie le ${esc(fmtDate(f.etablie_le))}<br>Étape : ${esc(f.etape)}<br>Chargé d'affaires : ${esc(f.charge)}`,
  })}

<h2>A. Client et projet</h2>
<table class="i">
  ${ligne('Nom / société', f.client)}
  ${ligne('Téléphone', f.telephone)}
  ${ligne('E-mail', f.email)}
  ${ligne('Adresse du projet', f.adresse)}
  ${ligne('Type de bien', f.type_bien)}
  ${ligne('Surface', f.surface)}
  ${ligne('Occupation pendant travaux', f.occupation)}
  ${ligne('Origine du lead', f.canal)}
</table>

${sections.map(([titre, liste, retenus]) => `
  <h2>${esc(titre)}</h2>
  <div class="cases">${cases(liste, retenus || [])}</div>`).join('')}

${f.description ? `<h2>Description du projet</h2><div class="desc">${esc(f.description)}</div>` : ''}

<h2>Budget et calendrier</h2>
<table class="i">
  ${ligne('Budget travaux HT estimé', f.budget_ht ? eur(f.budget_ht) : '')}
  ${ligne('Budget maximum client', f.budget_max ? eur(f.budget_max) : '')}
  ${ligne('Démarrage souhaité', f.date_debut ? fmtDate(f.date_debut) : '')}
  ${ligne('Fin souhaitée', f.date_fin ? fmtDate(f.date_fin) : '')}
</table>

<div class="p2">
<h2>Score de complexité — règle V5 (§41)</h2>
<table class="s">
  <thead><tr><th>Critère</th><th>0 point</th><th>1 point</th><th>2 points</th></tr></thead>
  <tbody>${(f.cotes || []).map(c => `<tr><th>${esc(c.label)}</th>${c.valeurs.map((lbl, n) =>
    `<td class="${c.cote === n ? 'on' : ''}">${esc(lbl)}</td>`).join('')}</tr>`).join('')}</tbody>
</table>

<div class="bilan">
  <div><span>Score</span><b>${f.score} / 10</b></div>
  <div><span>Taux suggéré</span><b>${f.taux_suggere} %</b></div>
  <div><span>Taux retenu</span><b>${f.taux_final} %</b></div>
</div>
<div class="bilan fort">
  <div><span>Honoraires HT</span><b>${f.honoraires ? eur(f.honoraires) : '—'}</b></div>
  <div><span>Niveau de mission</span><b>${esc(f.niveau)}</b></div>
  <div><span>Points de charge</span><b>${f.points}</b></div>
</div>
${f.plancher ? `<p class="note">Minimum d'honoraires de ${eur(HONORAIRES_AMO.minimum)} HT appliqué.</p>` : ''}
${f.motif ? `<p class="note">Dérogation au taux suggéré — motif : ${esc(f.motif)}</p>` : ''}
${f.taux_final < 5 ? '<p class="note">Taux inférieur à 5 % : validation de la direction obligatoire.</p>' : ''}

${signatures("Le chargé d'affaires", "Le maître d'ouvrage")}
${piedFiche()}
</div>`;
  return pageFiche({ titre: `Fiche de mission AMO — ${f.client}`, couleurs: C, corps });
}
