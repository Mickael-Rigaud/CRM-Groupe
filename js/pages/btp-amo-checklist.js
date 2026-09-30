// La check-list d'une mission AMO — BTP Expertise.
//
// À quoi sert cet écran : une mission AMO dure des mois et se joue sur trente-
// huit gestes répartis en six phases. On l'ouvre au bureau, entre deux
// réunions, pour savoir ce qui reste — et surtout pour voir venir le moment où
// l'on s'apprête à sortir de son rôle.
//
// ⚠ CE N'EST PAS LA CHECK-LIST DE VISITE, ET LA FORME LE DIT. Celle-là se
// remplit debout devant un bâtiment, en une fois, avec des gants : gros
// boutons, trois états d'observation, tout pensé pour le froid. Celle-ci se
// remplit assis, sur plusieurs mois, et ce qu'elle doit montrer d'un coup
// d'œil est autre chose : où en est la mission, ce qui manque avant de
// facturer, et quels points de frontière ont été traités.
//
// ⚠ LA FRONTIÈRE AMO / MAÎTRISE D'ŒUVRE EST LE SUJET DE L'ÉCRAN, pas une
// mention en bas de page. La franchir fait basculer la mission dans la
// responsabilité décennale du constructeur (`FRONTIERE_AMO`, déjà affichée
// sur `#/btp/amo`). Les sept points concernés sont teintés, comptés à part et
// rappelés en tête : les noyer dans les trente et un autres reviendrait à ne
// pas les avoir écrits.
//
// ⚠ LE SUIVI SE RATTACHE À L'AFFAIRE, jamais à un relevé : une mission est une
// durée, pas un moment. Et chaque point garde la DATE DE SON GESTE — le jour
// où un client conteste, ce qu'on cherche est quand l'alerte a été émise.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, toast, confirm as confirmer } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadreBtp as cadre } from './btp.js';
import { ETATS_AMO, FRONTIERE_AMO } from '../data/btp-amo-checklist.js';
import {
  missionsAmo, suiviDe, noterPoint, effacerPoint,
  bilanAmo, phasesAvecPoints, frontiereDe, jalonsAmo,
} from '../data/btp-amo-suivi.js';

const KEY = 'btp';

const guard = (root) => {
  if (scope.activityKeys.includes(KEY)) return false;
  root.innerHTML = '<div class="card"><div class="empty">Vous n&rsquo;avez pas accès à l&rsquo;activité BTP Expertise.</div></div>';
  return true;
};

const jour = (d) => {
  if (!d) return '';
  const [a, m, j] = String(d).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
};

// ⚠ LE MAITRE D'OUVRAGE PEUT ETRE UNE PERSONNE MORALE. Une mission AMO est
// souvent portee par une SCI, une SARL ou une copropriete : l'affaire porte
// alors `organisation_id` et pas `contact_id`. Ne chercher que le contact
// laissait le nom vide sur exactement les dossiers les plus gros.
const nomDe = (deal) => {
  const c = deal.contact_id ? db.byId('contacts', deal.contact_id) : null;
  const nom = c ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() : '';
  if (nom) return nom;
  const o = deal.organisation_id ? db.byId('organisations', deal.organisation_id) : null;
  return o?.name || deal.title || 'Sans nom';
};

// ⚠ ET LE SOUS-TITRE NE REPETE PAS LE TITRE. Sans adresse, il retombait sur
// `deal.title` que le titre affichait deja : le meme texte deux fois, l'un
// sous l'autre. Mieux vaut rien qu'un doublon.
const lieuDe = (deal, titre) => {
  const l = [deal.fields?.adresse, deal.fields?.ville].filter(Boolean).join(', ');
  if (l) return l;
  const t = deal.title || '';
  return t && t !== titre ? t : '';
};

const euros = (n) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';

// ⚠ L'ÉTAT VIT DANS L'ADRESSE, comme sur les deux autres écrans BTP : une
// mission en cours s'envoie par lien, et le bouton « précédent » du navigateur
// fait ce qu'on attend de lui.
const lireAdresse = () => {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
  return { ouvert: p.get('mission') || null, phase: n(p.get('phase')) ?? 1 };
};

// `replaceState`, jamais `pushState` : cocher vingt points empilerait vingt
// entrées d'historique.
function ecrireAdresse(etat) {
  const p = new URLSearchParams();
  if (etat.ouvert) p.set('mission', etat.ouvert);
  if (etat.ouvert && etat.phase) p.set('phase', String(etat.phase));
  const q = p.toString();
  const neuve = '#/btp/amo-checklist' + (q ? '?' + q : '');
  if (location.hash !== neuve) history.replaceState(null, '', neuve);
}

const etat = { ...lireAdresse() };

// ------------------------------------------------------ la liste des missions

function vueListe() {
  const liste = missionsAmo();
  if (!liste.length) {
    return `<div class="card"><div class="card-head"><h2>Missions AMO</h2></div>
      <div class="empty">Aucune mission AMO pour l'instant.<br>
        <span class="small muted">Une mission apparaît ici dès que sa fiche projet
        est enregistrée en AMO.</span></div></div>`;
  }

  const carte = (d) => {
    const b = bilanAmo(d.id);
    const f = frontiereDe(d.id);
    const nom = nomDe(d);
    const lieu = lieuDe(d, nom);
    return `
      <article class="am-carte" data-ouvrir="${esc(d.id)}" tabindex="0" role="button">
        <div class="am-carte-h">
          <div>
            <b>${esc(nom)}</b>
            ${lieu ? `<span>${esc(lieu)}</span>` : ''}
          </div>
          <span class="am-part">${b.pourcent}<em>%</em></span>
        </div>
        <div class="am-jauge"><span style="width:${b.pourcent}%"></span></div>
        <div class="am-carte-c">
          <span><em>Traités</em>${b.traites}/${b.attendus}</span>
          ${b.alertes ? `<span class="est-alerte"><em>Vigilance</em>${b.alertes}</span>` : ''}
          ${b.horsJeu ? `<span class="est-terne"><em>Sans objet</em>${b.horsJeu}</span>` : ''}
          <span class="${f.traites < f.total ? 'est-frontiere' : ''}"><em>Frontière</em>${f.traites}/${f.total}</span>
        </div>
      </article>`;
  };

  return `
    <div class="card">
      <div class="card-head"><h2>Missions AMO</h2>
        <span class="muted small">${liste.length} mission${liste.length > 1 ? 's' : ''}</span></div>
      <p class="am-intro">Trente-huit points, six phases. Les points de
        <b>frontière</b> sont ceux sur lesquels une mission bascule dans la
        responsabilité du constructeur&nbsp;: ils se comptent à part.</p>
      <div class="am-liste">${liste.map(carte).join('')}</div>
    </div>`;
}

// ---------------------------------------------------------- une mission

function bandeau(deal, b, f) {
  const nom = nomDe(deal);
  const lieu = lieuDe(deal, nom);
  return `
    <div class="am-tete">
      <div class="am-tete-h">
        <button type="button" class="am-retour" data-liste>Toutes les missions</button>
        <span class="am-part-grand">${b.pourcent}<em>%</em></span>
      </div>
      <h2>${esc(nom)}</h2>
      ${lieu ? `<p class="am-tete-lieu">${esc(lieu)}</p>` : ''}
      <div class="am-jauge est-grande"><span style="width:${b.pourcent}%"></span></div>
      <div class="am-tete-c">
        <span><b>${b.traites}</b> sur ${b.attendus} traités</span>
        ${b.alertes ? `<span class="est-alerte"><b>${b.alertes}</b> point${b.alertes > 1 ? 's' : ''} de vigilance</span>` : ''}
        ${b.horsJeu ? `<span class="est-terne"><b>${b.horsJeu}</b> sans objet</span>` : ''}
      </div>
      ${f.traites < f.total ? `
        <p class="am-garde">
          <b>${f.total - f.traites} point${f.total - f.traites > 1 ? 's' : ''} de frontière non traité${f.total - f.traites > 1 ? 's' : ''}.</b>
          ${esc(FRONTIERE_AMO.regles[0])}
        </p>` : ''}
    </div>`;
}

// Les jalons de facturation : ce qui devait être fait avant d'appeler l'argent.
function blocJalons(deal) {
  const jalons = jalonsAmo(deal);
  if (!jalons.length) return '';
  return `
    <div class="am-jalons">
      <h3>Avant de facturer</h3>
      <div class="am-jalons-l">
        ${jalons.map(j => `
          <div class="am-jalon ${j.pret ? 'est-pret' : ''} ${j.atteinte ? 'est-atteinte' : ''}">
            <div class="am-jalon-h">
              <b>${esc(j.label)}</b>
              <span>${esc(euros(j.montant))}</span>
            </div>
            <p>${esc(j.phases.join(' · '))}</p>
            <span class="am-jalon-e">${j.pret
              ? 'Tout est traité'
              : `${j.reste} point${j.reste > 1 ? 's' : ''} à traiter`}</span>
          </div>`).join('')}
      </div>
      <p class="am-note">L'écran prévient, il n'interdit rien&nbsp;: une facture peut
        partir sur une phase incomplète, en le sachant.</p>
    </div>`;
}

const pastille = (ligne) => {
  if (!ligne) return '<span class="am-etat am-etat-vide">À faire</span>';
  const e = ETATS_AMO[ligne.etat];
  return `<span class="am-etat am-etat-${ligne.etat}">${esc(e?.mot || ligne.etat)}</span>`;
};

function unPoint(p) {
  const auteur = p.ligne?.auteur_id ? db.byId('profiles', p.ligne.auteur_id) : null;
  return `
    <div class="am-p ${p.frontiere ? 'est-frontiere' : ''} ${p.ligne ? 'est-traite' : ''}
                ${p.ligne?.etat === 'alerte' ? 'est-alerte' : ''}" data-point="${p.id}">
      <div class="am-p-h">
        <div class="am-p-t">
          <b>${esc(p.libelle)}</b>
          ${p.frontiere ? '<span class="am-f">frontière</span>' : ''}
          ${p.aide ? `<p>${esc(p.aide)}</p>` : ''}
        </div>
        ${pastille(p.ligne)}
      </div>
      <div class="am-p-b">
        ${Object.entries(ETATS_AMO).map(([cle, e]) => `
          <button type="button" class="am-b am-b-${cle} ${p.ligne?.etat === cle ? 'on' : ''}"
                  data-etat="${cle}" title="${esc(e.aide)}">${esc(e.mot)}</button>`).join('')}
        ${p.ligne ? '<button type="button" class="am-b am-b-annule" data-annule>Remettre à faire</button>' : ''}
      </div>
      ${p.ligne ? `
        <div class="am-p-d">
          <label class="am-champ">
            <span>Le ${jour(p.ligne.fait_le)}${auteur ? ' · ' + esc(auteur.full_name) : ''}</span>
            <input type="date" data-date value="${esc(p.ligne.fait_le || '')}">
          </label>
          <label class="am-champ est-large">
            <span>Note</span>
            <textarea data-note rows="2"
              placeholder="${p.frontiere
                ? 'Ce qui a été dit au client, et par quel écrit'
                : 'Précision utile plus tard'}">${esc(p.ligne.note || '')}</textarea>
          </label>
        </div>` : ''}
    </div>`;
}

function vueMission(deal) {
  const b = bilanAmo(deal.id);
  const f = frontiereDe(deal.id);
  const phases = phasesAvecPoints(deal.id);
  const courante = phases.find(p => p.num === etat.phase) || phases[0];

  return `
    ${bandeau(deal, b, f)}
    <div class="am-corps">
      <div class="am-barre">
        ${phases.map(p => `
          <button type="button" class="am-phase ${p.num === courante.num ? 'on' : ''}
                  ${p.complete ? 'est-complete' : ''} ${p.alertes ? 'est-alerte' : ''}"
                  data-phase="${p.num}">
            <span class="am-phase-n">${p.num}</span>
            <span class="am-phase-t">${esc(p.label)}</span>
            <span class="am-phase-c">${p.traites}/${p.attendus}</span>
          </button>`).join('')}
      </div>

      <section class="am-sec">
        <div class="am-sec-h">
          <div>
            <h3>${courante.num}. ${esc(courante.label)}</h3>
            <p>${esc(courante.contenu)}</p>
          </div>
          <span class="am-poids" title="Part de la mission, selon le manuel">${courante.poids}<em>%</em></span>
        </div>
        <div class="am-points">${courante.points.map(unPoint).join('')}</div>
      </section>

      ${blocJalons(deal)}
    </div>`;
}

// ------------------------------------------------------------------ l'écran

export const btpAmoChecklistPage = {
  title: () => 'BTP Expertise — Check-list AMO',

  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    Object.assign(etat, lireAdresse());
    const q = (s) => [...root.querySelectorAll(s)];

    function dessine() {
      ecrireAdresse(etat);
      const deal = etat.ouvert ? db.byId('deals', etat.ouvert) : null;

      if (etat.ouvert && !deal) {
        // Une mission qui n'existe pas ramène à la liste : un écran vide se lit
        // comme une panne.
        etat.ouvert = null;
        toast('Cette mission n’existe pas ou ne vous est pas accessible', 'warn');
        return dessine();
      }

      root.innerHTML = cadre('#/btp/amo-checklist', 'Check-list AMO',
        deal ? vueMission(deal) : vueListe());

      if (!deal) {
        q('[data-ouvrir]').forEach(c => {
          const aller = () => { etat.ouvert = c.dataset.ouvrir; etat.phase = 1; dessine(); };
          c.onclick = aller;
          c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aller(); } };
        });
        return;
      }

      q('[data-liste]').forEach(b => b.onclick = () => { etat.ouvert = null; dessine(); });
      q('[data-phase]').forEach(b => b.onclick = () => {
        etat.phase = Number(b.dataset.phase); dessine();
      });

      q('.am-p').forEach(bloc => {
        const id = Number(bloc.dataset.point);
        const ligne = suiviDe(deal.id).find(s => s.point_id === id) || null;

        bloc.querySelectorAll('[data-etat]').forEach(b => b.onclick = async () => {
          try {
            await noterPoint(deal.id, id, { etat: b.dataset.etat });
            dessine();
          } catch (e) {
            // ⚠ « relation … does not exist » ne dit rien à qui ouvre l'écran :
            // la table arrive par une migration, et tant qu'elle n'est pas
            // passée seul ce bouton échoue.
            const brut = String(e.message || '');
            toast(/does not exist|schema cache/i.test(brut)
              ? "La check-list AMO n'est pas encore installée sur cet espace. Prévenez Mickael : la mise à jour de la base n'est pas passée."
              : brut, 'err');
          }
        });

        bloc.querySelector('[data-annule]')?.addEventListener('click', async () => {
          if (!ligne) return;
          if (!await confirmer('Remettre ce point « à faire » ? La date et la note seront perdues.')) return;
          try { await effacerPoint(ligne.id); dessine(); }
          catch (e) { toast(e.message, 'err'); }
        });

        // ⚠ AU `change`, JAMAIS À LA FRAPPE : réécrire l'écran à chaque
        // caractère ferait perdre le curseur au milieu d'une phrase.
        bloc.querySelector('[data-date]')?.addEventListener('change', async (e) => {
          try { await noterPoint(deal.id, id, { fait_le: e.target.value || null }); dessine(); }
          catch (err) { toast(err.message, 'err'); }
        });
        bloc.querySelector('[data-note]')?.addEventListener('change', async (e) => {
          try { await noterPoint(deal.id, id, { note: e.target.value.trim() || null }); }
          catch (err) { toast(err.message, 'err'); }
        });
      });
    }

    dessine();
    return { destroy: coquille.retirer };
  },
};
