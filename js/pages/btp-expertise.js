// La fiche découverte Expertise du manuel opérationnel V5 (§36), et son impression.
//
// CE QUI LA DISTINGUE DE LA FICHE AMO
// Une AMO se chiffre : cinq critères notés de 0 à 2, un score sur 10, un taux. Une
// expertise se qualifie : la grille du §36 G ne s'additionne pas, chaque critère
// désigne directement un niveau — « Livrable : rapport structuré » dit à lui seul
// « expertise avec rapport ». Le manuel s'arrête là et écrit « Niveau retenu » sans
// donner de règle d'arbitrage ; `niveauExpertise` explique ce que le CRM en fait.
//
// L'autre différence tient au métier : l'AMO regarde devant (un projet, un budget, un
// calendrier), l'expertise regarde derrière (un désordre, son apparition, son
// évolution, ce qui a déjà été engagé). D'où la rubrique E, qui n'a pas d'équivalent
// côté AMO et qui décide souvent de l'urgence.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, toast, openModal, closeModal, contactName } from '../ui.js';
import {
  CHANNELS, NIVEAUX_BTP, niveauxExpertiseParCharge, couleurMission, stagesDe,
  FICHE_EXPERTISE, QUALIF_EXPERTISE, niveauExpertise,
} from '../data/schema.js';
import { enteteFiche, piedFiche, signatures, cases, ligne, pageFiche, imprimerPage } from './btp-fiche.js';

const KEY = 'btp';
const C = couleurMission('expertise');
const teinte = `--m:${C.couleur};--m-clair:${C.clair};--m-encre:${C.encre}`;
const CANAUX_COURANTS = ['Recommandation client', 'Ancien client', 'Téléphone / autre', 'Site internet direct', 'Prospection directe'];
const TYPES_BIEN = ['Maison', 'Appartement', 'Immeuble', 'Local pro', 'Autre'];
// ⚠ PAR CHARGE, du plus léger au plus lourd : c'est l'ordre des colonnes de la
// grille de qualification, et il n'est pas celui de la grille tarifaire.
const NIVEAUX = niveauxExpertiseParCharge();
// « Expertise pré-achat » devient « Pré-achat » en tête de colonne : le mot
// « Expertise » est déjà dans le titre du tableau, et la majuscule ne se perd
// pas au passage.
const courtNiveau = (n) => { const t = n.label.replace(/^Expertise /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };

export function ficheDecouverteExpertise(apres) {
  const users = scope.users();
  const contacts = scope.contacts();
  const etapes = stagesDe(KEY, 'expertise');

  const v = {
    pas: 1,
    nouveau: true, contact_id: '',
    nom: '', telephone: '', email: '',
    adresse: '', adresse_facturation: '', canal: 'Recommandation client',
    profil: '', type_bien: '', annee: '', surface: '', occupation: '',
    travaux_recents: '', entreprises: '',
    motifs: [], description: '',
    apparition: '', evolution: '', sinistre: '', procedure: '', butoir: '', securite: '',
    documents: [],
    cotes: {}, niveau: null, tarif: '',
    controles: [],
    date_visite: '',
    owner_id: scope.user.id,
    stage: etapes[0].key,
  };

  const m = openModal('Fiche découverte — Expertise bâtiment', '<div id="fe-corps"></div>', { wide: true });
  const corps = m.querySelector('#fe-corps');
  m.querySelector('.modal-head')?.setAttribute('style', `${teinte};border-bottom:3px solid var(--m)`);

  const suggestion = () => niveauExpertise(v.cotes);
  const niveauRetenu = () => NIVEAUX.find(n => n.key === v.niveau) || suggestion()?.niveau || null;
  const nomClient = () => (v.nouveau ? v.nom.trim() : contactName(db.byId('contacts', v.contact_id)));

  const PAS = [['Identification', 1], ['Le bien', 2], ['Le désordre', 3], ['Qualification', 4]];

  const enTete = () => `
    <div class="mf-pas" style="${teinte}">
      ${PAS.map(([lbl, n]) => `
        <div class="mf-pas-item ${v.pas === n ? 'on' : ''} ${v.pas > n ? 'fait' : ''}" data-pas="${n}">
          <span class="mf-pas-num">${v.pas > n ? '✓' : n}</span>${esc(lbl)}
        </div>`).join('<i class="mf-pas-lien"></i>')}
    </div>`;

  const chips = (cle, liste) => `<div class="fa-chips" data-chips="${cle}">${liste.map(x => `
    <button type="button" class="fa-chip ${v[cle].includes(x) ? 'on' : ''}" data-val="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;

  // Le profil du demandeur est un choix unique : on est propriétaire OU acquéreur OU
  // syndic. Le manuel l'écrit en cases à cocher, mais il n'y en a qu'une à cocher.
  const chipsUn = (cle, liste) => `<div class="fa-chips" data-chips-un="${cle}">${liste.map(x => `
    <button type="button" class="fa-chip ${v[cle] === x ? 'on' : ''}" data-val="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;

  const champ = (id, label, valeur, attrs = '', plein = false) =>
    `<label class="mail-champ ${plein ? 'plein' : ''}"><span>${esc(label)}</span><input id="${id}" value="${esc(valeur ?? '')}" ${attrs}></label>`;

  const ecran1 = () => `
    <div class="mf-bloc-titre">A. Identification</div>
    <div class="mf-seg">
      <button type="button" class="${v.nouveau ? 'on' : ''}" data-mode="1">Nouveau client</button>
      <button type="button" class="${v.nouveau ? '' : 'on'}" data-mode="0">Déjà dans le CRM</button>
    </div>
    ${v.nouveau
      ? `<div class="mf-grille">
          ${champ('fe-nom', 'Nom / prénom ou société *', v.nom, 'placeholder="Dupont, ou SCI Les Oliviers"')}
          ${champ('fe-tel', 'Téléphone', v.telephone, 'placeholder="06 12 34 56 78"')}
          ${champ('fe-email', 'E-mail', v.email, 'type="email" placeholder="contact@exemple.fr"')}
        </div>`
      : `<div class="mf-grille"><label class="mail-champ plein"><span>Client *</span>
          <select id="fe-contact"><option value="">— choisir —</option>
            ${contacts.map(x => `<option value="${x.id}" ${x.id === v.contact_id ? 'selected' : ''}>${esc(contactName(x))}${x.city ? ` · ${esc(x.city)}` : ''}</option>`).join('')}
          </select></label></div>`}

    <div class="mf-grille">
      ${champ('fe-adresse', 'Adresse du bien', v.adresse, 'placeholder="14 avenue des Platanes, Nice"', true)}
      ${champ('fe-facturation', 'Adresse de facturation si différente', v.adresse_facturation, '', true)}
      <label class="mail-champ"><span>Origine du lead</span>
        <select id="fe-canal">
          ${CANAUX_COURANTS.map(x => `<option ${x === v.canal ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          <optgroup label="Autres canaux">${CHANNELS.filter(x => !CANAUX_COURANTS.includes(x)).map(x => `<option ${x === v.canal ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>
        </select></label>
    </div>

    <div class="mf-bloc-titre">B. Profil du demandeur</div>
    ${chipsUn('profil', FICHE_EXPERTISE.profils)}
    <p class="mf-aide">Un seul profil : c'est lui qui dit à qui l'on parle, et souvent ce qui est en jeu.</p>

    <div class="form-actions">
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="fe-suite">Continuer →</button>
    </div>`;

  const ecran2 = () => `
    <div class="mf-bloc-titre">C. Bien concerné</div>
    <div class="mf-grille">
      <label class="mail-champ"><span>Type de bien</span>
        <select id="fe-type"><option value="">—</option>${TYPES_BIEN.map(t => `<option ${t === v.type_bien ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      ${champ('fe-annee', 'Année approximative de construction', v.annee, 'placeholder="1972"')}
      ${champ('fe-surface', 'Surface approximative', v.surface, 'placeholder="95 m²"')}
      <label class="mail-champ"><span>Occupation actuelle</span>
        <select id="fe-occupation"><option value="">—</option>${FICHE_EXPERTISE.occupation.map(o => `<option ${o === v.occupation ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <label class="mail-champ plein"><span>Travaux récents et dates</span>
        <textarea id="fe-travaux" rows="2" placeholder="Ravalement en 2023, reprise de toiture en 2024…">${esc(v.travaux_recents)}</textarea></label>
      <label class="mail-champ plein"><span>Entreprises intervenues</span>
        <textarea id="fe-entreprises" rows="2" placeholder="Qui est intervenu, et sur quoi.">${esc(v.entreprises)}</textarea></label>
    </div>

    <div class="form-actions">
      <button type="button" class="btn ghost left" id="fe-retour">← Identification</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="fe-suite">Continuer →</button>
    </div>`;

  const ecran3 = () => `
    <div class="mf-bloc-titre">D. Motif de la demande</div>
    ${chips('motifs', FICHE_EXPERTISE.motifs)}
    <div class="mf-grille">
      <label class="mail-champ plein"><span>Description libre du problème</span>
        <textarea id="fe-description" rows="3" placeholder="Ce que le client décrit, dans ses mots.">${esc(v.description)}</textarea></label>
    </div>

    <div class="mf-bloc-titre">E. Historique et urgence</div>
    <div class="mf-grille">
      ${champ('fe-apparition', "Date d'apparition", v.apparition, 'placeholder="Printemps 2025"')}
      ${champ('fe-evolution', 'Évolution observée', v.evolution, 'placeholder="Aggravation depuis l’hiver"')}
      ${champ('fe-sinistre', 'Sinistre déclaré ? à qui ?', v.sinistre, '', true)}
      ${champ('fe-procedure', 'Mise en demeure, expertise ou procédure déjà engagée ?', v.procedure, '', true)}
      ${champ('fe-butoir', 'Date butoir éventuelle', v.butoir, 'type="date"')}
      ${champ('fe-securite', 'Risque sécurité immédiat ?', v.securite, 'placeholder="Aucun constaté"')}
    </div>
    <p class="mf-aide attention">Un risque sécurité ou une date butoir change l'urgence de la visite : à remplir même sommairement.</p>

    <div class="form-actions">
      <button type="button" class="btn ghost left" id="fe-retour">← Le bien</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn" id="fe-suite">Continuer →</button>
    </div>`;

  const ecran4 = () => {
    const sug = suggestion();
    const niv = niveauRetenu();
    const faites = QUALIF_EXPERTISE.filter(c => v.cotes[c.key] !== undefined).length;
    return `
    <div class="mf-bloc-titre">F. Documents disponibles</div>
    ${chips('documents', FICHE_EXPERTISE.documents)}

    <div class="mf-bloc-titre">G. Qualification interne</div>
    <p class="btp-ref-action" style="${teinte}">
      <b>Cochez une case par ligne</b> — chaque critère désigne un niveau, le plus souvent retenu est proposé.
      <span>${faites} sur ${QUALIF_EXPERTISE.length}</span>
    </p>
    <div class="table-wrap"><table class="btp-matrice fa-matrice">
      <thead><tr><th>Critère</th>${NIVEAUX.map(n => `<th>${esc(courtNiveau(n))} — ${n.points} pt${n.points > 1 ? 's' : ''}</th>`).join('')}</tr></thead>
      <tbody>${QUALIF_EXPERTISE.map(c => `<tr>
        <th scope="row">${esc(c.label)}</th>
        ${c.valeurs.map((lbl, n) => `<td class="choix ${v.cotes[c.key] === n ? 'on' : ''}" data-crit="${c.key}" data-score="${n}"
          role="radio" aria-checked="${v.cotes[c.key] === n}" tabindex="0"><span class="btp-coche"></span>${esc(lbl)}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table></div>

    <div class="mf-bloc-titre">Niveau retenu</div>
    <div class="mf-niveaux" style="${teinte}">
      ${NIVEAUX.map(n => `
        <button type="button" class="mf-niveau ${niv && n.key === niv.key ? 'on' : ''}" data-niveau="${n.key}">
          <span class="mf-niveau-pts">${n.points} pt${n.points > 1 ? 's' : ''}</span>
          <b>${esc(n.label)}${sug && sug.niveau.key === n.key ? '<em class="fa-suggere">suggéré</em>' : ''}</b>
          <span class="mf-niveau-txt">${esc(n.contenu)}</span>
        </button>`).join('')}
    </div>
    ${sug ? `<p class="mf-aide">Les critères cotés désignent ${sug.comptes.map((n, i) =>
      n ? `${n} fois « ${courtNiveau(NIVEAUX[i])} »` : null).filter(Boolean).join(', ')}. En cas d'égalité, le niveau supérieur est proposé.</p>` : ''}

    <div class="mf-grille">
      <label class="mail-champ"><span>Tarif proposé HT</span>
        <input type="number" id="fe-tarif" min="0" step="50" value="${esc(v.tarif)}" placeholder="1200">
        ${niv ? `<em class="mf-champ-aide">Tarif de travail du niveau : ${esc(niv.tarif)}</em>` : ''}</label>
      <label class="mail-champ"><span>Date de visite proposée</span>
        <input type="date" id="fe-visite" value="${esc(v.date_visite)}"></label>
      <label class="mail-champ"><span>Où en est la mission ?</span>
        <select id="fe-stage">${etapes.map(e => `<option value="${e.key}" ${e.key === v.stage ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select></label>
      <label class="mail-champ"><span>Chargé d'affaires</span>
        <select id="fe-owner">${users.map(u => `<option value="${u.id}" ${u.id === v.owner_id ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></label>
    </div>

    <div class="mf-bloc-titre">Contrôles avant attribution</div>
    ${chips('controles', FICHE_EXPERTISE.controles)}

    <div class="form-actions">
      <button type="button" class="btn ghost left" id="fe-retour">← Le désordre</button>
      <button type="button" class="btn ghost" id="fe-pdf">Aperçu / PDF</button>
      <button type="button" class="btn" id="fe-creer">Créer la mission</button>
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
    corps.querySelector('#fe-retour')?.addEventListener('click', () => { v.pas -= 1; dessine(); });
    corps.querySelectorAll('[data-chips]').forEach(groupe => {
      const cle = groupe.dataset.chips;
      groupe.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
        const x = b.dataset.val;
        v[cle] = v[cle].includes(x) ? v[cle].filter(y => y !== x) : [...v[cle], x];
        dessine();
      });
    });
    corps.querySelectorAll('[data-chips-un]').forEach(groupe => {
      const cle = groupe.dataset.chipsUn;
      groupe.querySelectorAll('.fa-chip').forEach(b => b.onclick = () => {
        v[cle] = v[cle] === b.dataset.val ? '' : b.dataset.val;
        dessine();
      });
    });
    const poser = (sel, cle) => { const el = corps.querySelector(sel); if (el) el.oninput = () => { v[cle] = el.value; }; };
    const choisir = (sel, cle) => { const el = corps.querySelector(sel); if (el) el.onchange = () => { v[cle] = el.value; }; };

    if (v.pas === 1) {
      corps.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { v.nouveau = b.dataset.mode === '1'; dessine(); });
      poser('#fe-nom', 'nom'); poser('#fe-tel', 'telephone'); poser('#fe-email', 'email');
      poser('#fe-adresse', 'adresse'); poser('#fe-facturation', 'adresse_facturation');
      choisir('#fe-contact', 'contact_id'); choisir('#fe-canal', 'canal');
      corps.querySelector('#fe-suite').onclick = () => {
        if (v.nouveau && !v.nom.trim()) return toast('Le nom du client est nécessaire', 'warn');
        if (!v.nouveau && !v.contact_id) return toast('Choisissez le client', 'warn');
        v.pas = 2; dessine();
      };
      return;
    }
    if (v.pas === 2) {
      poser('#fe-annee', 'annee'); poser('#fe-surface', 'surface');
      poser('#fe-travaux', 'travaux_recents'); poser('#fe-entreprises', 'entreprises');
      choisir('#fe-type', 'type_bien'); choisir('#fe-occupation', 'occupation');
      corps.querySelector('#fe-suite').onclick = () => { v.pas = 3; dessine(); };
      return;
    }
    if (v.pas === 3) {
      poser('#fe-description', 'description'); poser('#fe-apparition', 'apparition');
      poser('#fe-evolution', 'evolution'); poser('#fe-sinistre', 'sinistre');
      poser('#fe-procedure', 'procedure'); poser('#fe-securite', 'securite');
      choisir('#fe-butoir', 'butoir');
      corps.querySelector('#fe-suite').onclick = () => {
        if (!v.motifs.length) return toast('Le motif de la demande est nécessaire', 'warn');
        v.pas = 4; dessine();
      };
      return;
    }

    corps.querySelectorAll('[data-crit]').forEach(td => {
      const coter = () => {
        const cle = td.dataset.crit;
        const n = Number(td.dataset.score);
        if (v.cotes[cle] === n) delete v.cotes[cle]; else v.cotes[cle] = n;
        dessine();
      };
      td.onclick = coter;
      td.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coter(); } };
    });
    corps.querySelectorAll('[data-niveau]').forEach(b => b.onclick = () => { v.niveau = b.dataset.niveau; dessine(); });
    poser('#fe-tarif', 'tarif');
    choisir('#fe-visite', 'date_visite'); choisir('#fe-stage', 'stage'); choisir('#fe-owner', 'owner_id');
    corps.querySelector('#fe-pdf').onclick = () => imprimerPage(ficheHtml(pourImpression()));
    corps.querySelector('#fe-creer').onclick = creer;
  };

  const pourImpression = () => {
    const niv = niveauRetenu();
    return {
      metier: 'expertise',
      client: nomClient() || '—',
      telephone: v.telephone, email: v.email,
      adresse: v.adresse, adresse_facturation: v.adresse_facturation, canal: v.canal,
      profil: v.profil,
      type_bien: v.type_bien, annee: v.annee, surface: v.surface, occupation: v.occupation,
      travaux_recents: v.travaux_recents, entreprises: v.entreprises,
      motifs: v.motifs, description: v.description,
      apparition: v.apparition, evolution: v.evolution, sinistre: v.sinistre,
      procedure: v.procedure, butoir: v.butoir, securite: v.securite,
      documents: v.documents,
      cotes: QUALIF_EXPERTISE.map(c => ({ label: c.label, valeurs: c.valeurs, cote: v.cotes[c.key] ?? null })),
      niveau: niv ? niv.label : '—', points: niv ? niv.points : 0,
      tarif: Number(v.tarif) || null,
      controles: v.controles,
      date_visite: v.date_visite,
      charge: users.find(u => u.id === v.owner_id)?.full_name || '—',
      etape: etapes.find(e => e.key === v.stage)?.label || v.stage,
      etablie_le: new Date().toISOString().slice(0, 10),
    };
  };

  async function creer() {
    if (!niveauRetenu()) return toast('Cotez la grille, ou choisissez un niveau', 'warn');
    const bouton = corps.querySelector('#fe-creer');
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
      const niv = niveauRetenu();
      const maintenant = new Date().toISOString();
      const deal = await db.insert('deals', {
        title: `${v.motifs[0] || 'Expertise'} — ${nomClient()}${v.adresse ? ` (${v.adresse})` : ''}`,
        activity: KEY, stage: v.stage, status: 'open',
        contact_id: contactId, owner_id: v.owner_id, channel: v.canal,
        amount: fiche.tarif,
        fields: {
          type_mission: 'expertise',
          niveau: niv.key,
          problematique: v.motifs.join(', ') || 'Expertise',
          type_bien: v.type_bien || null,
          contexte: v.profil || null,
          adresse: v.adresse.trim() || null,
          detail: v.description.trim() || null,
          date_visite: v.date_visite || null,
          urgence: !!String(v.securite || '').trim() && !/aucun|non|rien/i.test(v.securite),
          decouverte: fiche,
        },
        stage_history: [{ stage: v.stage, at: maintenant }],
        stage_changed_at: maintenant,
      });

      await db.insert('activities', {
        deal_id: deal.id, contact_id: contactId, type: 'appel',
        title: 'Organiser la visite d’expertise',
        due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        assignee_id: v.owner_id, done: false,
      });

      closeModal(true);
      toast('Mission d’expertise créée, fiche découverte enregistrée');
      apres?.(deal.id);
    } catch (err) {
      bouton.disabled = false;
      toast(err.message, 'err');
    }
  }

  dessine();
}

// ------------------------------------------------------------------ L'impression
export function ficheHtml(f) {
  const corps = `
${enteteFiche({
    titre: 'Fiche de mission — Expertise technique du bâtiment',
    sous: 'Fiche découverte client, manuel opérationnel V5 (§36)',
    droite: `Établie le ${esc(fmtDate(f.etablie_le))}<br>Étape : ${esc(f.etape)}<br>Chargé d'affaires : ${esc(f.charge)}`,
  })}

<h2>A. Identification</h2>
<table class="i">
  ${ligne('Nom / prénom ou société', f.client)}
  ${ligne('Téléphone', f.telephone)}
  ${ligne('E-mail', f.email)}
  ${ligne('Adresse du bien', f.adresse)}
  ${ligne('Adresse de facturation', f.adresse_facturation)}
  ${ligne('Origine du lead', f.canal)}
</table>

<h2>B. Profil du demandeur</h2>
<div class="cases">${cases(FICHE_EXPERTISE.profils, f.profil ? [f.profil] : [])}</div>

<h2>C. Bien concerné</h2>
<table class="i">
  ${ligne('Type de bien', f.type_bien)}
  ${ligne('Année de construction', f.annee)}
  ${ligne('Surface approximative', f.surface)}
  ${ligne('Occupation actuelle', f.occupation)}
  ${ligne('Travaux récents et dates', f.travaux_recents)}
  ${ligne('Entreprises intervenues', f.entreprises)}
</table>

<h2>D. Motif de la demande</h2>
<div class="cases">${cases(FICHE_EXPERTISE.motifs, f.motifs || [])}</div>
${f.description ? `<div class="desc">${esc(f.description)}</div>` : ''}

<h2>E. Historique et urgence</h2>
<table class="i">
  ${ligne("Date d'apparition", f.apparition)}
  ${ligne('Évolution observée', f.evolution)}
  ${ligne('Sinistre déclaré', f.sinistre)}
  ${ligne('Procédure déjà engagée', f.procedure)}
  ${ligne('Date butoir', f.butoir ? fmtDate(f.butoir) : '')}
  ${ligne('Risque sécurité immédiat', f.securite)}
</table>

<div class="p2">
<h2>F. Documents disponibles</h2>
<div class="cases">${cases(FICHE_EXPERTISE.documents, f.documents || [])}</div>

<h2>G. Qualification interne (§36)</h2>
<table class="s">
  <thead><tr><th>Critère</th>${NIVEAUX.map(n => `<th>${esc(courtNiveau(n))} — ${n.points} pt${n.points > 1 ? 's' : ''}</th>`).join('')}</tr></thead>
  <tbody>${(f.cotes || []).map(c => `<tr><th>${esc(c.label)}</th>${c.valeurs.map((lbl, n) =>
    `<td class="${c.cote === n ? 'on' : ''}">${esc(lbl)}</td>`).join('')}</tr>`).join('')}</tbody>
</table>

<div class="bilan fort">
  <div><span>Niveau retenu</span><b>${esc(f.niveau)}</b></div>
  <div><span>Points de charge</span><b>${f.points}</b></div>
  <div><span>Tarif proposé HT</span><b>${f.tarif ? eur(f.tarif) : '—'}</b></div>
</div>
<table class="i" style="margin-top:9px">
  ${ligne('Date de visite proposée', f.date_visite ? fmtDate(f.date_visite) : '')}
  ${ligne("Chargé d'affaires pressenti", f.charge)}
</table>

<h2>Contrôles avant attribution</h2>
<div class="cases">${cases(FICHE_EXPERTISE.controles, f.controles || [])}</div>

${signatures("Le chargé d'affaires", 'Le client')}
${piedFiche()}
</div>`;
  return pageFiche({ titre: `Fiche de mission Expertise — ${f.client}`, couleurs: C, corps });
}
