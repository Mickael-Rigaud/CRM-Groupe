// Le rapport de visite — BTP Expertise.
//
// À quoi sert cet écran : on rentre de visite avec une check-list remplie, et
// il faut en faire le document qu'on remet au client. Ce n'est pas un
// formulaire vierge : tout ce qui pouvait être su l'est déjà — l'adresse du
// bien est dans la fiche projet, le maître d'ouvrage est son contact, les
// désordres sont dans le relevé, leur gravité est dans l'atlas. L'écran ne
// demande donc que ce qui demande un jugement : l'objet, les limites, les
// hypothèses, les préconisations, les conclusions.
//
// ⚠ AUCUN DÉSORDRE N'EST RECOPIÉ DEPUIS LA CHECK-LIST, ILS SONT LUS. Corriger
// un constat le soir de la visite met le rapport à jour tout seul. La copie
// aurait donné deux vérités, et c'est le document signé qui aurait fini par
// mentir.
//
// ⚠ CE QUI N'A PAS PU ÊTRE VÉRIFIÉ REMONTE DANS LES LIMITES. C'est la pièce la
// plus utile du raccordement : sur place on note « pas pu monter sur le toit »,
// et trois jours plus tard c'est exactement ce qu'on oublie d'écrire. Or dire
// « conforme » de ce qu'on n'a pas regardé est la faute qui engage le cabinet.
//
// ⚠ LA TRAME SUIT LE MODÈLE DU CABINET, dans son ordre et avec ses six
// sections. La numérotation n'est pas décorative : un rapport qu'on relit à
// six mois se cite par section.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, toast, confirm as confirmer, openModal, closeModal } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadreBtp as cadre } from './btp.js';
import { ALERTE } from './btp-atlas.js';
// ⚠ EMPRUNTÉES À LA CHECK-LIST, PAS RECOPIÉES : une planche de l'atlas doit
// s'ouvrir de la même façon dans les deux écrans, et deux copies auraient cessé
// de se ressembler au premier réglage. Aucun cycle : le rapport descend de la
// check-list, jamais l'inverse.
import { boutonFiche, ouvrirPlanche } from './btp-checklist.js';
import { SEAU_RELEVES, bilan } from '../data/btp-releve.js';
import {
  PRIORITES, ORDRE_PRIORITES, OBJET_PROPOSE,
  rapportDe, creerRapport, majRapport, ecrireLigne, ajouterLigneLibre,
  retirerLigne, enTete, desordres, parPriorite, limitesProposees,
  etatRapport, visites,
} from '../data/btp-rapport.js';

const KEY = 'btp';

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

const num = (n) => String(n).padStart(2, '0');

const jour = (d) => {
  if (!d) return '—';
  const [a, m, j] = String(d).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
};

// ⚠ L'ÉTAT VIT DANS L'ADRESSE, comme sur la check-list : un rapport en cours de
// rédaction s'envoie par lien, et le bouton « précédent » du navigateur fait ce
// qu'on attend de lui.
const lireAdresse = () => {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  return { ouvert: p.get('visite') || null, deplie: p.get('d') || null };
};

// `replaceState`, jamais `pushState` : sinon chaque ouverture de section
// empilerait une entrée d'historique.
function ecrireAdresse(etat) {
  const p = new URLSearchParams();
  if (etat.ouvert) p.set('visite', etat.ouvert);
  // ⚠ LE DESORDRE DEPLIE EST DANS L'ADRESSE, comme le point de la check-list :
  // on ouvre la planche de l'atlas par-dessus, on la ferme, et la ligne qu'on
  // renseignait est toujours ouverte. Une variable locale aurait aussi rendu
  // l'etat inatteignable au controle, qui pose l'etat PAR l'adresse.
  if (etat.ouvert && etat.deplie) p.set('d', etat.deplie);
  const q = p.toString();
  const neuve = '#/btp/expertise-rapport' + (q ? '?' + q : '');
  if (location.hash !== neuve) history.replaceState(null, '', neuve);
}

const etat = { ...lireAdresse() };

// --------------------------------------------------------------- les pièces

const jeton = (n, code) =>
  `<span class="rp-jeton rp-jeton-${code || 'neutre'}">${n === null ? '·' : num(n)}</span>`;

const pastilleCode = (code) => code
  ? `<span class="rp-code rp-code-${code}">${esc(ALERTE[code]?.mot || code)}</span>`
  : '<span class="rp-code rp-code-vide" title="Aucune fiche identifiée">—</span>';

const pastillePriorite = (p) => p
  ? `<span class="rp-prio rp-prio-${p}">${esc(PRIORITES[p].mot)}</span>`
  : '<span class="rp-prio rp-prio-vide">à définir</span>';

// ------------------------------------------------------- la liste des visites

function vueListe() {
  const liste = visites();
  if (!liste.length) {
    return `<div class="card"><div class="card-head"><h2>Rapports de visite</h2></div>
      <div class="empty">Aucune visite relevée pour l'instant.<br>
        <span class="small muted">Un rapport part toujours d'une check-list de visite&nbsp;:
        remplissez-en une, elle apparaîtra ici.</span>
        <div class="form-actions" style="justify-content:center">
          <a class="btn primary" href="#/btp/expertise-checklist">Ouvrir la check-list</a>
        </div></div></div>`;
  }

  const carte = (r) => {
    const t = enTete(r, rapportDe(r.id));
    const e = etatRapport(r.id);
    const b = bilan(r.id);
    const reste = e.existe ? (e.sansPreconisation + e.sansPriorite) : 0;
    return `
      <article class="rp-carte" data-ouvrir="${esc(r.id)}" tabindex="0" role="button">
        <div class="rp-carte-h">
          <div>
            <b>${esc(t.maitreOuvrage || t.titre || 'Sans nom')}</b>
            <span class="rp-carte-lieu">${esc(t.bien || 'Adresse non renseignée')}</span>
          </div>
          ${e.existe
            ? `<span class="rp-etat rp-etat-${e.statut}">${e.statut === 'finalise' ? 'Finalisé' : 'Brouillon'}</span>`
            : '<span class="rp-etat rp-etat-absent">À rédiger</span>'}
        </div>
        <div class="rp-carte-c">
          <span><em>Visite</em>${esc(jour(r.date_visite))}</span>
          <span><em>Désordres</em>${e.existe ? e.desordres : b.anomalies}</span>
          <span><em>Photos</em>${b.photos}</span>
          ${b.nv ? `<span><em>Non vérifiés</em>${b.nv}</span>` : ''}
        </div>
        ${e.existe && reste
          ? `<p class="rp-carte-reste">${reste} élément${reste > 1 ? 's' : ''} à compléter
               avant de remettre le rapport</p>`
          : ''}
      </article>`;
  };

  return `
    <div class="card">
      <div class="card-head"><h2>Rapports de visite</h2>
        <span class="muted small">${liste.length} visite${liste.length > 1 ? 's' : ''}</span></div>
      <p class="rp-intro">Chaque rapport reprend tout seul ce que la check-list a relevé&nbsp;:
        les désordres, leurs fiches, leurs photos, et ce qui n'a pas pu être vérifié.
        Il ne reste qu'à rédiger.</p>
      <div class="rp-liste">${liste.map(carte).join('')}</div>
    </div>`;
}

// ------------------------------------------------------------- le rapport

// Les six sections du modèle, et ce qui décide qu'une section est faite. ⚠ LA
// FRISE N'EST PAS UNE DÉCORATION : un rapport se remet quand ses six sections
// tiennent, et l'écran doit dire laquelle manque sans qu'on ait à tout relire.
const SECTIONS = [
  { cle: 'infos',   titre: 'Informations générales',
    fait: (c) => !!(c.t.bien && c.t.maitreOuvrage && c.t.intervenant && c.t.dateVisite) },
  { cle: 'objet',   titre: 'Objet et limites',
    fait: (c) => !!String(c.rap.objet || '').trim() },
  { cle: 'desordres', titre: 'Désordres constatés',
    fait: (c) => c.d.filter(x => x.retenu).every(x => x.constat.trim() && x.priorite) },
  { cle: 'hypotheses', titre: 'Hypothèses sur les causes',
    fait: (c) => !!String(c.rap.hypotheses || '').trim() },
  { cle: 'precos',  titre: 'Préconisations',
    fait: (c) => c.d.filter(x => x.retenu).every(x => x.preconisation.trim()) },
  { cle: 'conclusions', titre: 'Conclusions et signature',
    fait: (c) => !!(String(c.rap.conclusions || '').trim() && c.rap.date_signature) },
];

function frise(ctx) {
  const faits = SECTIONS.filter(s => s.fait(ctx)).length;
  return `
    <div class="rp-frise">
      ${SECTIONS.map((s, i) => `
        <button type="button" class="rp-etape ${s.fait(ctx) ? 'est-faite' : ''}"
                data-aller="rp-s-${s.cle}">
          <span class="rp-etape-n">${i + 1}</span>
          <span class="rp-etape-t">${esc(s.titre)}</span>
        </button>`).join('')}
      <span class="rp-frise-compte">${faits}/6</span>
    </div>`;
}

function bandeau(rel, rap, ctx) {
  const e = etatRapport(rel.id);
  return `
    <div class="rp-tete">
      <div class="rp-tete-h">
        <button type="button" class="rp-retour" data-liste>Toutes les visites</button>
        <span class="rp-etat rp-etat-${rap.statut}">${rap.statut === 'finalise' ? 'Finalisé' : 'Brouillon'}</span>
      </div>
      <h2>${esc(ctx.t.maitreOuvrage || 'Rapport de visite')}</h2>
      <p class="rp-tete-lieu">${esc(ctx.t.bien || 'Adresse non renseignée')}
        <span>·</span> visite du ${esc(jour(rel.date_visite))}</p>
      <div class="rp-tete-c">
        <span><b>${e.desordres}</b> désordre${e.desordres > 1 ? 's' : ''} retenu${e.desordres > 1 ? 's' : ''}</span>
        ${e.ecartes ? `<span class="est-terne"><b>${e.ecartes}</b> écarté${e.ecartes > 1 ? 's' : ''}</span>` : ''}
        <span><b>${e.photos}</b> photo${e.photos > 1 ? 's' : ''}</span>
      </div>
      <div class="rp-tete-b">
        <button type="button" class="btn primary" data-apercu>Aperçu du document</button>
        <a class="btn ghost" href="#/btp/expertise-checklist?visite=${esc(rel.id)}">Ouvrir la check-list</a>
        <button type="button" class="btn ghost" data-statut>${rap.statut === 'finalise'
          ? 'Repasser en brouillon' : 'Marquer comme finalisé'}</button>
      </div>
      ${frise(ctx)}
    </div>`;
}

// Une section du rapport : son numéro, son titre, son corps.
const section = (i, cle, titre, aide, corps) => `
  <section class="rp-sec" id="rp-s-${cle}">
    <div class="rp-sec-h">
      <span class="rp-sec-n">${i}</span>
      <div><h3>${esc(titre)}</h3>${aide ? `<p>${esc(aide)}</p>` : ''}</div>
    </div>
    ${corps}
  </section>`;

// 1. Les informations. ⚠ TOUT Y EST DÉJÀ REMPLI : les champs portent la valeur
// déduite en filigrane, et taper dedans ne fait que corriger. Vider reprend la
// fiche projet.
function secInfos(ctx) {
  const l = (cle, label, valeur, filigrane, large) => `
    <label class="rp-champ ${large ? 'est-large' : ''}">
      <span>${esc(label)}</span>
      <input type="text" data-champ="${cle}" value="${esc(valeur || '')}"
             placeholder="${esc(filigrane || '')}">
    </label>`;
  const i = ctx.info;
  const bien = [i.typeBien, i.surface ? i.surface + ' m²' : '', i.annee ? 'construit en ' + i.annee : '']
    .filter(Boolean).join(' · ');
  return section(1, 'infos', 'Informations générales',
    "Reprises de la fiche projet et du relevé. Corrigez ce qui doit l'être pour le document.", `
    <div class="rp-grille">
      ${l('bien', 'Bien / adresse', ctx.rap.bien, i.bien, true)}
      ${l('maitre_ouvrage', 'Maître d’ouvrage', ctx.rap.maitre_ouvrage, i.maitreOuvrage)}
      ${l('intervenant', 'Intervenant', ctx.rap.intervenant, i.intervenant)}
      <label class="rp-champ">
        <span>Date de la visite</span>
        <input type="text" value="${esc(jour(ctx.rel.date_visite))}" readonly
               title="La date vient du relevé : elle se change dans la check-list">
      </label>
      ${l('meteo', 'Conditions météo', ctx.rap.meteo, 'Ex. : temps sec, 14 °C, après trois jours de pluie')}
    </div>
    ${bien ? `<p class="rp-note">Le bien : ${esc(bien)}.</p>` : ''}`);
}

// 2. Objet et limites.
function secObjet(ctx) {
  const nv = limitesProposees(ctx.rel.id);
  const memeQueProposees = String(ctx.rap.limites || '').trim() === nv.trim();
  return section(2, 'objet', 'Objet et limites de la visite',
    'Ce que vous avez observé, et ce qui n’était pas vérifiable. C’est la section qui vous protège.', `
    <label class="rp-bloc">
      <span>Objet de la visite</span>
      <textarea data-champ="objet" rows="4"
        placeholder="${esc(OBJET_PROPOSE.slice(0, 90))}…">${esc(ctx.rap.objet || '')}</textarea>
    </label>
    <label class="rp-bloc">
      <span>Limites
        ${nv ? `<button type="button" class="rp-lien" data-reprendre-nv
                  ${memeQueProposees ? 'disabled' : ''}>Reprendre les points non vérifiés du relevé</button>` : ''}
      </span>
      <textarea data-champ="limites" rows="4"
        placeholder="Ce qui n&rsquo;a pas pu être regardé, et pourquoi">${esc(ctx.rap.limites || '')}</textarea>
    </label>
    ${nv && !String(ctx.rap.limites || '').trim()
      ? `<p class="rp-avert">Le relevé compte des points non vérifiés qui ne figurent pas encore
           dans les limites.</p>` : ''}`);
}

// 3. Le tableau des désordres. Une ligne par pathologie, dans l'ordre de la
// visite — la colonne « N° » suit le parcours, pas la gravité.
function ligneDesordre(d) {
  const ouvert = etat.deplie === d.cle;
  const fiches = d.candidates.length
    ? d.candidates.map(n => boutonFiche(n)).join('')
    : '<span class="muted small">—</span>';
  return `
    <div class="rp-d ${d.retenu ? '' : 'est-ecartee'} ${ouvert ? 'est-ouverte' : ''}" data-cle="${esc(d.cle)}">
      <div class="rp-d-l">
        ${jeton(d.numero, d.code)}
        <div class="rp-d-corps">
          <div class="rp-d-t">
            <b>${esc(d.libelle)}</b>
            <span class="rp-d-piece">${esc(d.piece)}</span>
            ${d.libre ? '<span class="rp-d-libre">ajouté</span>' : ''}
            ${d.retenu ? '' : '<span class="rp-d-hors">écarté du rapport</span>'}
          </div>
          <p class="rp-d-constat">${d.constat
            ? esc(d.constat)
            : '<em>Aucun constat écrit — le relevé n’en portait pas</em>'}</p>
          <div class="rp-d-meta">
            <span class="rp-d-fiches">${fiches}</span>
            ${pastilleCode(d.code)}
            ${pastillePriorite(d.priorite)}
            ${d.photos.length ? `<span class="rp-d-ph">${d.photos.length} photo${d.photos.length > 1 ? 's' : ''}
              ${d.numerosPhotos.length ? `<em>n° ${d.numerosPhotos.join(', ')}</em>` : ''}</span>` : ''}
            ${d.preconisation.trim() ? '<span class="rp-d-ok">préconisation écrite</span>'
              : '<span class="rp-d-manque">préconisation à écrire</span>'}
          </div>
        </div>
        <button type="button" class="rp-d-b" data-deplier="${esc(d.cle)}">${ouvert ? 'Fermer' : 'Compléter'}</button>
      </div>
      ${ouvert ? detailDesordre(d) : ''}
    </div>`;
}

function detailDesordre(d) {
  const choixFiche = d.candidates.length > 1 ? `
    <label class="rp-champ">
      <span>Fiche retenue${d.aChoisir ? ' <em>à choisir</em>' : ''}</span>
      <select data-fiche>
        <option value=""${d.ficheNumero ? '' : ' selected'}>— laquelle des ${d.candidates.length} ?</option>
        ${d.candidates.map(n => {
          const f = db.t('btp_atlas_fiches').find(x => x.numero === n);
          const nom = f ? `${num(n)} — ${f.titre}` : `${num(n)} (non importée)`;
          return `<option value="${n}"${d.ficheNumero === n ? ' selected' : ''}>${esc(nom)}</option>`;
        }).join('')}
      </select>
    </label>` : '';

  return `
    <div class="rp-d-detail">
      <label class="rp-bloc">
        <span>Le désordre, tel qu'il figurera dans le rapport</span>
        <textarea data-constat rows="2"
          placeholder="${esc(d.constatReleve || 'Décrivez le désordre')}">${esc(d.ligne?.desordre || '')}</textarea>
        ${d.constatReleve ? `<em class="rp-d-source">Au relevé : « ${esc(d.constatReleve)} »</em>` : ''}
      </label>
      <div class="rp-grille">
        ${choixFiche}
        <label class="rp-champ">
          <span>Priorité${d.prioriteForcee ? '' : d.code ? ' <em>selon la fiche</em>' : ''}</span>
          <select data-priorite>
            <option value=""${d.ligne?.priorite ? '' : ' selected'}>${d.code
              ? esc('Celle de la fiche : ' + PRIORITES[d.priorite].mot) : '— à définir'}</option>
            ${ORDRE_PRIORITES.map(k => `<option value="${k}"${d.ligne?.priorite === k ? ' selected' : ''}
              >${esc(PRIORITES[k].mot)} — ${esc(PRIORITES[k].faire)}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="rp-bloc">
        <span>Préconisation</span>
        <textarea data-preco rows="3"
          placeholder="Ce qu'il faut faire, et dans quel ordre">${esc(d.preconisation)}</textarea>
      </label>
      ${d.photos.length ? `<div class="rp-d-photos">
        ${d.photos.map((c, i) => `<figure data-photo="${esc(c)}">
          <div class="rp-vign"></div>
          <figcaption>n° ${d.numerosPhotos[i] ?? '—'}</figcaption></figure>`).join('')}
      </div>` : ''}
      <div class="rp-d-actions">
        <button type="button" class="rp-lien" data-retenu>${d.retenu
          ? 'Écarter du rapport' : 'Remettre dans le rapport'}</button>
        ${d.libre ? '<button type="button" class="rp-lien est-danger" data-supprimer>Supprimer cette ligne</button>' : ''}
      </div>
      ${d.retenu ? '' : `<p class="rp-note">Écarté du rapport. Le constat reste dans la check-list&nbsp;:
        la visite continue de dire ce qu'elle a vu.</p>`}
    </div>`;
}

function secDesordres(ctx) {
  const retenus = ctx.d.filter(d => d.retenu).length;
  const corps = ctx.d.length
    ? `<div class="rp-ds">${ctx.d.map(ligneDesordre).join('')}</div>`
    : `<div class="empty">Aucune anomalie dans le relevé.<br>
        <span class="small muted">Un rapport peut très bien conclure « rien à signaler ».
        Vous pouvez aussi ajouter un désordre vu hors check-list.</span></div>`;
  return section(3, 'desordres', 'Désordres constatés',
    `${retenus} retenu${retenus > 1 ? 's' : ''} pour le document, dans l'ordre de la visite.`,
    corps + `<div class="form-actions">
      <button type="button" class="btn ghost" data-ajouter>Ajouter un désordre</button></div>`);
}

// 4. Les hypothèses.
const secHypotheses = (ctx) => section(4, 'hypotheses', 'Hypothèses sur les causes',
  'Ce que vous pensez être à l’origine des désordres. Des hypothèses, pas des conclusions.', `
  <label class="rp-bloc">
    <textarea data-champ="hypotheses" rows="6"
      placeholder="Ex. : la fissuration en pied de façade sud est compatible avec un retrait-gonflement des argiles, aggravé par…">${esc(ctx.rap.hypotheses || '')}</textarea>
  </label>`);

// 5. Les préconisations, regroupées par priorité — les rouges d'abord.
function secPrecos(ctx) {
  const groupes = parPriorite(ctx.d).filter(g => g.lignes.length);
  if (!groupes.length) {
    return section(5, 'precos', 'Préconisations',
      'Par ordre de priorité.', '<div class="empty">Aucun désordre retenu : rien à préconiser.</div>');
  }
  return section(5, 'precos', 'Préconisations',
    'Par ordre de priorité, les plus graves d’abord. Écrivez ici ou depuis chaque désordre.',
    groupes.map(g => `
      <div class="rp-groupe rp-groupe-${g.couleur || 'vide'}">
        <div class="rp-groupe-h">
          <b>${esc(g.mot)}</b><span>${esc(g.faire)}</span>
          <em>${g.lignes.length}</em>
        </div>
        ${g.lignes.map(d => `
          <div class="rp-p" data-cle="${esc(d.cle)}">
            <div class="rp-p-t">${jeton(d.numero, d.code)}
              <div><b>${esc(d.libelle)}</b>
                <span>${esc(d.piece)}${d.constat ? ' · ' + esc(d.constat.slice(0, 80)) : ''}</span></div></div>
            <textarea data-preco-groupe rows="2"
              placeholder="Ce qu'il faut faire">${esc(d.preconisation)}</textarea>
          </div>`).join('')}
      </div>`).join(''));
}

// 6. Conclusions et signature.
const secConclusions = (ctx) => section(6, 'conclusions', 'Conclusions et signature',
  'Ce que le client doit retenir, en quelques lignes.', `
  <label class="rp-bloc">
    <textarea data-champ="conclusions" rows="5"
      placeholder="Ex. : le bâtiment ne présente pas de désordre structurel mettant en cause sa stabilité. Deux points demandent une intervention…">${esc(ctx.rap.conclusions || '')}</textarea>
  </label>
  <div class="rp-grille">
    <label class="rp-champ">
      <span>Lieu</span>
      <input type="text" data-champ="lieu_signature" value="${esc(ctx.rap.lieu_signature || '')}"
             placeholder="Ville de signature">
    </label>
    <label class="rp-champ">
      <span>Date</span>
      <input type="date" data-champ="date_signature" value="${esc(ctx.rap.date_signature || '')}">
    </label>
    <label class="rp-champ">
      <span>Signé par</span>
      <input type="text" value="${esc(ctx.t.intervenant || '')}" readonly
             title="L'intervenant se corrige dans la section 1">
    </label>
  </div>`);

// ------------------------------------------------------------ le document

// Le document tel qu'il sort à l'impression. ⚠ IL N'EST PAS UNE SECONDE
// VERSION DE L'ÉCRAN : il lit exactement le même calcul (`desordres`), donc il
// ne peut pas en dire autre chose. Ce qui change est ce qu'on retire — les
// boutons, les champs vides, les avertissements de rédaction.
function documentHtml(ctx) {
  const t = ctx.t, rap = ctx.rap;
  const retenus = ctx.d.filter(d => d.retenu);
  const groupes = parPriorite(ctx.d).filter(g => g.lignes.length);
  const lignesTexte = (s) => String(s || '').split('\n').filter(l => l.trim())
    .map(l => `<p>${esc(l)}</p>`).join('');

  const info = (label, valeur) => `
    <tr><th>${esc(label)}</th><td>${valeur ? esc(valeur) : '<span class="rp-doc-vide">—</span>'}</td></tr>`;

  const titreSec = (n, t2) => `<h2 class="rp-doc-sec"><span>${n}</span>${esc(t2)}</h2>`;

  return `
  <article class="rp-doc">
    <header class="rp-doc-tete">
      <div>
        <p class="rp-doc-sur">Rapport de visite</p>
        <h1>${esc(t.maitreOuvrage || 'Rapport de visite')}</h1>
        <p class="rp-doc-lieu">${esc(t.bien || '')}</p>
      </div>
      <div class="rp-doc-date">
        <span>Visite du</span><b>${esc(jour(ctx.rel.date_visite))}</b>
      </div>
    </header>

    ${titreSec(1, 'Informations générales')}
    <table class="rp-doc-infos">
      ${info('Bien / adresse', t.bien)}
      ${info('Maître d’ouvrage', t.maitreOuvrage)}
      ${info('Intervenant', t.intervenant)}
      ${info('Date de la visite', jour(ctx.rel.date_visite))}
      ${info('Conditions météo', rap.meteo)}
    </table>

    ${titreSec(2, 'Objet et limites de la visite')}
    <div class="rp-doc-texte">${lignesTexte(rap.objet) || '<p class="rp-doc-vide">Objet non renseigné.</p>'}</div>
    ${String(rap.limites || '').trim()
      ? `<div class="rp-doc-limites"><b>Limites</b>${lignesTexte(rap.limites)}</div>` : ''}

    ${titreSec(3, 'Désordres constatés')}
    ${retenus.length ? `
      <table class="rp-doc-t">
        <thead><tr><th>N°</th><th>Pièce</th><th>Désordre constaté</th>
          <th>Fiche</th><th>Code</th><th>Photo</th></tr></thead>
        <tbody>
          ${retenus.map(d => `<tr>
            <td class="rp-doc-n">${num(d.numero)}</td>
            <td>${esc(d.piece)}</td>
            <td>${esc(d.constat || d.libelle)}</td>
            <td>${d.ficheNumero ? num(d.ficheNumero) : '—'}</td>
            <td><span class="rp-doc-code rp-doc-code-${d.code || 'vide'}">${d.code
              ? esc(ALERTE[d.code]?.mot || d.code) : '—'}</span></td>
            <td>${d.numerosPhotos.length ? esc(d.numerosPhotos.join(', ')) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`
      : '<p class="rp-doc-rien">Aucun désordre retenu à l’issue de la visite.</p>'}

    ${titreSec(4, 'Hypothèses sur les causes')}
    <div class="rp-doc-texte">${lignesTexte(rap.hypotheses)
      || '<p class="rp-doc-vide">Hypothèses non renseignées.</p>'}</div>

    ${titreSec(5, 'Préconisations (par ordre de priorité)')}
    ${groupes.length ? groupes.map(g => `
      <div class="rp-doc-prio">
        <div class="rp-doc-prio-h rp-doc-code-${g.couleur || 'vide'}">${esc(g.mot)}</div>
        <ol>
          ${g.lignes.map(d => `<li><b>${num(d.numero)} · ${esc(d.libelle)}</b>
            ${d.preconisation.trim()
              ? `<span>${esc(d.preconisation)}</span>`
              : '<span class="rp-doc-vide">Préconisation à écrire.</span>'}</li>`).join('')}
        </ol>
      </div>`).join('') : '<p class="rp-doc-rien">Aucune préconisation.</p>'}

    ${titreSec(6, 'Conclusions')}
    <div class="rp-doc-texte">${lignesTexte(rap.conclusions)
      || '<p class="rp-doc-vide">Conclusions non renseignées.</p>'}</div>

    <div class="rp-doc-signature">
      <div><span>Lieu et date</span><b>${esc([rap.lieu_signature, jour(rap.date_signature)]
        .filter(x => x && x !== '—').join(', ') || '—')}</b></div>
      <div><span>L'intervenant</span><b>${esc(t.intervenant || '—')}</b></div>
    </div>

    ${retenus.some(d => d.photos.length) ? `
      <div class="rp-doc-repo">
        ${titreSec(7, 'Reportage photo')}
        <div class="rp-doc-photos">
          ${retenus.flatMap(d => d.photos.map((c, i) => `
            <figure data-photo="${esc(c)}">
              <div class="rp-vign"></div>
              <figcaption><b>n° ${d.numerosPhotos[i]}</b> ${esc(d.libelle)} — ${esc(d.piece)}</figcaption>
            </figure>`)).join('')}
        </div>
      </div>` : ''}
  </article>`;
}

// ⚠ LES PHOTOS SE CHARGENT APRÈS L'OUVERTURE : leur adresse est signée et se
// demande au serveur, alors que le rendu est synchrone. C'est aussi pourquoi
// l'impression part de l'aperçu — les images y sont déjà résolues, et un
// document imprimé avec des cadres vides est un document à refaire.
async function chargerPhotos(root) {
  const figures = [...root.querySelectorAll('figure[data-photo]')];
  await Promise.all(figures.map(async (f) => {
    const zone = f.querySelector('.rp-vign');
    const brut = f.dataset.photo;
    try {
      const url = /^(data:|https?:)/.test(brut) ? brut : await db.fileUrl(brut, { bucket: SEAU_RELEVES });
      zone.innerHTML = `<img src="${esc(url)}" alt="Photo de visite">`;
    } catch (e) {
      zone.innerHTML = `<span class="rp-vign-ko" title="${esc(e.message || '')}">introuvable</span>`;
    }
  }));
}

function apercu(ctx) {
  const m = openModal('Aperçu du rapport', `
    <div class="rp-apercu">${documentHtml(ctx)}</div>
    <div class="form-actions">
      <button type="button" class="btn ghost" data-close>Fermer</button>
      <button type="button" class="btn primary" id="rp-imprimer">Imprimer / PDF</button>
    </div>`, { wide: true, onOpen: (el) => chargerPhotos(el) });

  m.querySelector('#rp-imprimer').onclick = () => {
    // ⚠ ON RÉUTILISE LA MÉCANIQUE D'IMPRESSION DU CRM (`#print-root` +
    // `body.impression`, déjà en place pour les fiches DTU) : une seconde façon
    // d'imprimer aurait fini par ne plus se comporter comme la première.
    const doc = m.querySelector('.rp-doc');
    const zone = document.getElementById('print-root')
      || Object.assign(document.createElement('div'), { id: 'print-root' });
    zone.innerHTML = '';
    zone.appendChild(doc.cloneNode(true));
    if (!zone.parentNode) document.body.appendChild(zone);

    // ⚠ LES MARGES DE LA FEUILLE SE POSENT ICI, ET PAS DANS LA FEUILLE DE
    // STYLE. Le CRM declare deja `@page { size: A4; margin: 0 }` pour les
    // fiches DTU, qui ont leur propre gabarit pleine page — et `@page` ne sait
    // lire ni une classe ni un parent, donc une seconde regle dans le fichier
    // l'emporterait sur la leur et casserait leur impression. On pose donc la
    // regle le temps du tirage et on la retire apres.
    //
    // Sans elle le rapport sort avec un texte colle aux quatre bords : vu sur
    // le PDF, jamais a l'ecran, et c'est un document qu'on remet a un client.
    const marges = document.createElement('style');
    marges.textContent = '@page { size: A4; margin: 14mm 13mm; }';
    document.head.appendChild(marges);

    document.body.classList.add('impression');
    const fini = () => {
      document.body.classList.remove('impression');
      marges.remove();
      window.removeEventListener('afterprint', fini);
    };
    window.addEventListener('afterprint', fini);
    setTimeout(() => window.print(), 60);
  };
}

// ------------------------------------------------------------------ l'écran

export const btpRapportPage = {
  title: () => 'BTP Expertise — Rapport expertise',

  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    Object.assign(etat, lireAdresse());

    // Le contexte : tout ce dont les sections ont besoin, calculé une fois.
    const contexte = (rel, rap) => ({
      rel, rap, t: enTete(rel, rap), info: enTete(rel, null),
      d: desordres(rel.id, rap),
    });

    const q = (s) => [...root.querySelectorAll(s)];

    function dessine() {
      ecrireAdresse(etat);

      const rel = etat.ouvert ? db.byId('btp_releves', etat.ouvert) : null;
      if (etat.ouvert && !rel) {
        // Une visite qui n'existe pas ramène à la liste : un écran vide se lit
        // comme une panne.
        etat.ouvert = null;
        toast('Cette visite n’existe pas ou ne vous est pas accessible', 'warn');
        return dessine();
      }

      if (!rel) {
        root.innerHTML = cadre('#/btp/expertise-rapport', 'Rapport expertise', vueListe());
        brancherListe();
        return;
      }

      const rap = rapportDe(rel.id);
      if (!rap) {
        root.innerHTML = cadre('#/btp/expertise-rapport', 'Rapport expertise', vueDemarrer(rel));
        q('[data-demarrer]').forEach(b => b.onclick = async () => {
          b.disabled = true;
          try { await creerRapport(rel.id); toast('Rapport ouvert'); dessine(); }
          catch (e) {
            b.disabled = false;
            // ⚠ « relation "public.btp_rapports" does not exist » NE DIT RIEN À
            // QUI OUVRE L'ÉCRAN. Les tables du rapport s'installent par une
            // migration, et tant qu'elle n'est pas passée le reste du CRM
            // fonctionne (une table absente est chargée vide, `db.load` le dit
            // en console et continue) : seul CE bouton échoue. Il doit donc
            // nommer la cause au lieu de renvoyer le message de la base.
            const brut = String(e.message || '');
            toast(/does not exist|schema cache/i.test(brut)
              ? "Les rapports ne sont pas encore installés sur cet espace. Prévenez Mickael : la mise à jour de la base n'est pas passée."
              : brut, 'err');
          }
        });
        q('[data-liste]').forEach(b => b.onclick = () => { etat.ouvert = null; dessine(); });
        return;
      }

      const ctx = contexte(rel, rap);
      root.innerHTML = cadre('#/btp/expertise-rapport', 'Rapport expertise', `
        ${bandeau(rel, rap, ctx)}
        <div class="rp-corps">
          ${secInfos(ctx)}
          ${secObjet(ctx)}
          ${secDesordres(ctx)}
          ${secHypotheses(ctx)}
          ${secPrecos(ctx)}
          ${secConclusions(ctx)}
        </div>`);
      brancherRapport(ctx);
      chargerPhotos(root);
    }

    // ------------------------------------------------------ les branchements

    function brancherListe() {
      q('[data-ouvrir]').forEach(c => {
        const aller = () => { etat.ouvert = c.dataset.ouvrir; etat.deplie = null; dessine(); };
        c.onclick = aller;
        c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aller(); } };
      });
    }

    // ⚠ LES CHAMPS S'ENREGISTRENT AU `change`, JAMAIS À LA FRAPPE, et le redessin
    // qui suit est PARTIEL : réécrire l'écran entier à chaque caractère ferait
    // perdre le curseur au milieu d'une phrase — c'est l'erreur qu'on a déjà
    // payée sur la check-list.
    function brancherRapport(ctx) {
      const rap = ctx.rap;

      const enregistrer = async (champs, quoi) => {
        try { await majRapport(rap.id, champs); rafraichirTete(); }
        catch (e) { toast(e.message, 'err'); return; }
        if (quoi) toast(quoi, 'ok');
      };

      // La frise et les compteurs bougent à chaque saisie ; on ne réécrit qu'eux.
      const rafraichirTete = () => {
        const frais = contexte(ctx.rel, rapportDe(ctx.rel.id));
        const tete = root.querySelector('.rp-tete');
        if (!tete) return;
        tete.outerHTML = bandeau(frais.rel, frais.rap, frais);
        brancherTete(frais);
      };

      const brancherTete = (c) => {
        q('[data-apercu]').forEach(b => b.onclick = () => apercu(contexte(c.rel, rapportDe(c.rel.id))));
        q('[data-liste]').forEach(b => b.onclick = () => { etat.ouvert = null; etat.deplie = null; dessine(); });
        q('[data-aller]').forEach(b => b.onclick = () => {
          root.querySelector('#' + b.dataset.aller)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        q('[data-statut]').forEach(b => b.onclick = async () => {
          const r = rapportDe(c.rel.id);
          const vers = r.statut === 'finalise' ? 'brouillon' : 'finalise';
          if (vers === 'finalise') {
            const e = etatRapport(c.rel.id);
            const manque = [
              e.sansPriorite ? `${e.sansPriorite} désordre(s) sans priorité` : '',
              e.sansPreconisation ? `${e.sansPreconisation} désordre(s) sans préconisation` : '',
              String(r.conclusions || '').trim() ? '' : 'pas de conclusions',
            ].filter(Boolean);
            // ⚠ ON PRÉVIENT, ON N'INTERDIT PAS : un rapport peut être finalisé
            // sans préconisation (« rien à signaler »), et bloquer forcerait à
            // écrire n'importe quoi pour passer.
            if (manque.length && !await confirmer(
              `Il reste : ${manque.join(', ')}. Marquer quand même comme finalisé ?`)) return;
          }
          await majRapport(r.id, { statut: vers });
          toast(vers === 'finalise' ? 'Rapport finalisé' : 'Repassé en brouillon', 'ok');
          dessine();
        });
      };
      brancherTete(ctx);

      // Les champs de l'en-tête et des sections de texte.
      q('[data-champ]').forEach(ch => {
        ch.onchange = () => enregistrer({ [ch.dataset.champ]: ch.value.trim() || null });
      });

      q('[data-reprendre-nv]').forEach(b => b.onclick = async () => {
        const txt = limitesProposees(ctx.rel.id);
        const zone = root.querySelector('[data-champ="limites"]');
        const deja = String(zone.value || '').trim();
        // On AJOUTE à ce qui est écrit plutôt que de l'écraser : un expert a
        // souvent déjà noté une limite que le relevé ne connaît pas.
        zone.value = deja && !deja.includes(txt.split('\n')[0]) ? deja + '\n' + txt : txt;
        await enregistrer({ limites: zone.value }, 'Points non vérifiés repris');
        dessine();
      });

      // ---- les désordres
      const ecrire = async (d, champs) => {
        try {
          if (d.libre) await db.update('btp_rapport_lignes', d.ligne.id, champs);
          else await ecrireLigne(rap.id, d.cle, champs);
        } catch (e) { toast(e.message, 'err'); return false; }
        return true;
      };
      const parCle = (cle) => ctx.d.find(x => x.cle === cle);

      q('[data-deplier]').forEach(b => b.onclick = () => {
        etat.deplie = etat.deplie === b.dataset.deplier ? null : b.dataset.deplier;
        dessine();
      });

      q('.rp-d.est-ouverte').forEach(bloc => {
        const d = parCle(bloc.dataset.cle);
        if (!d) return;
        const t = (s) => bloc.querySelector(s);

        t('[data-constat]').onchange = (e) =>
          ecrire(d, { desordre: e.target.value.trim() || null }).then(() => dessine());
        t('[data-preco]').onchange = (e) =>
          ecrire(d, { preconisation: e.target.value.trim() || null }).then(() => dessine());
        t('[data-priorite]').onchange = (e) =>
          ecrire(d, { priorite: e.target.value || null }).then(() => dessine());
        t('[data-fiche]')?.addEventListener('change', (e) =>
          ecrire(d, { fiche_numero: e.target.value ? Number(e.target.value) : null }).then(() => dessine()));
        t('[data-retenu]').onclick = async () => {
          if (await ecrire(d, { retenu: !d.retenu })) dessine();
        };
        t('[data-supprimer]')?.addEventListener('click', async () => {
          if (!await confirmer('Supprimer cette ligne ajoutée au rapport ?')) return;
          try { await retirerLigne(d.ligne.id); etat.deplie = null; dessine(); }
          catch (e) { toast(e.message, 'err'); }
        });
      });

      // La préconisation se saisit aussi depuis la section 5, où on les rédige
      // toutes d'affilée — c'est le geste réel, et il faut deux portes.
      q('[data-preco-groupe]').forEach(z => {
        const d = parCle(z.closest('.rp-p').dataset.cle);
        z.onchange = () => ecrire(d, { preconisation: z.value.trim() || null }).then(() => dessine());
      });

      q('[data-ajouter]').forEach(b => b.onclick = () => ajouterDesordre(rap.id, dessine));

      // Les planches de l'atlas s'ouvrent par-dessus, comme dans la check-list.
      q('[data-planche]').forEach(b => b.onclick = () => ouvrirPlanche(Number(b.dataset.planche)));
    }

    dessine();
    return { destroy: coquille.retirer };
  },
};

// L'écran d'un relevé qui n'a pas encore de rapport : on dit ce que le rapport
// va reprendre AVANT de le créer, pour que le bouton soit une décision et non
// un saut dans le vide.
function vueDemarrer(rel) {
  const t = enTete(rel, null);
  const b = bilan(rel.id);
  const nv = limitesProposees(rel.id);
  return `
    <div class="card">
      <div class="card-head"><h2>Rapport de visite</h2>
        <button type="button" class="rp-retour" data-liste>Toutes les visites</button></div>
      <div class="rp-demarrer">
        <p class="rp-demarrer-t"><b>${esc(t.maitreOuvrage || 'Sans nom')}</b>
          ${esc(t.bien || '')} · visite du ${esc(jour(rel.date_visite))}</p>
        <p>Le rapport reprendra tout seul&nbsp;:</p>
        <ul>
          <li><b>${b.anomalies}</b> désordre${b.anomalies > 1 ? 's' : ''} relevé${b.anomalies > 1 ? 's' : ''},
            avec leur fiche, leur code couleur et leurs photos</li>
          <li><b>${b.photos}</b> photo${b.photos > 1 ? 's' : ''}, numérotée${b.photos > 1 ? 's' : ''} pour le reportage</li>
          <li>l'adresse du bien, le maître d'ouvrage et l'intervenant, depuis la fiche projet</li>
          ${nv ? `<li><b>${b.nv}</b> point${b.nv > 1 ? 's' : ''} non vérifié${b.nv > 1 ? 's' : ''},
            proposé${b.nv > 1 ? 's' : ''} dans les limites de la visite</li>` : ''}
        </ul>
        <div class="form-actions">
          <a class="btn ghost" href="#/btp/expertise-checklist?visite=${esc(rel.id)}">Revoir la check-list</a>
          <button type="button" class="btn primary" data-demarrer>Rédiger le rapport</button>
        </div>
      </div>
    </div>`;
}

// Ajouter un désordre que la check-list ne demandait pas.
function ajouterDesordre(rapportId, apres) {
  const m = openModal('Ajouter un désordre', `
    <div class="rp-grille">
      <label class="rp-champ est-large"><span>Désordre constaté</span>
        <input type="text" id="ad-lib" placeholder="Ex. : linteau de garage fissuré sur toute sa longueur"></label>
      <label class="rp-champ"><span>Pièce / zone</span>
        <input type="text" id="ad-piece" placeholder="Ex. : garage"></label>
      <label class="rp-champ"><span>Fiche de l'atlas (facultatif)</span>
        <input type="number" id="ad-fiche" min="1" max="99" placeholder="N°"></label>
      <label class="rp-champ"><span>Priorité</span>
        <select id="ad-prio">
          <option value="">— à définir</option>
          ${ORDRE_PRIORITES.map(k => `<option value="${k}">${esc(PRIORITES[k].mot)}</option>`).join('')}
        </select></label>
    </div>
    <div class="form-actions">
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="button" class="btn primary" id="ad-ok">Ajouter</button>
    </div>`);

  m.querySelector('#ad-ok').onclick = async () => {
    const lib = m.querySelector('#ad-lib').value.trim();
    if (!lib) return toast('Décrivez le désordre', 'warn');
    const n = Number(m.querySelector('#ad-fiche').value) || null;
    const f = n ? db.t('btp_atlas_fiches').find(x => x.numero === n) : null;
    try {
      await ajouterLigneLibre(rapportId, {
        desordre_libre: lib,
        piece: m.querySelector('#ad-piece').value.trim() || null,
        fiche_numero: n,
        code_couleur: f?.code_couleur || null,
        priorite: m.querySelector('#ad-prio').value || null,
      });
      closeModal(); toast('Désordre ajouté', 'ok'); apres();
    } catch (e) { toast(e.message, 'err'); }
  };
}
