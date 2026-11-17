// Les diapositives du cahier des charges — PISTE A, « PLEIN CADRE »
// (11/11/2026). Élodie n'aimait pas la première présentation (calquée sur son
// PowerPoint) : « change totalement le visuel ». Trois pistes lui ont été
// montrées sur la diapositive Cuisine ; elle a choisi la A :
//   · la PHOTO DE LA PIÈCE EN PLEIN ÉCRAN, assombrie à gauche ;
//   · le nom de la pièce en très grand, en blanc (Inter Tight) ;
//   · les travaux dans un PANNEAU translucide, quantités en orange ;
//   · un grand numéro de pièce en filigrane, une barre de progression en bas.
// Ne pas revenir aux pistes B (cartes claires) ni C (éditorial sombre), ni à
// la mise en page du PowerPoint.
//
// ⚠ LA MÊME DIAPOSITIVE SERT À L'ÉCRAN ET AU PDF. `diapos()` rend le HTML ;
// la présentation l'affiche en 16:9, l'impression en A4 à l'italienne. Toutes
// les tailles sont en `cqw` (pour cent de la largeur de la diapositive) : le
// rendu suit la taille, quelle qu'elle soit.
//
// ⚠ LE FOND EST DU CONTENU, PAS UN `background` : la photo est un <img>, le
// noir et le dégradé sont dessinés en SVG. Un fond CSS ne s'imprime que si
// « Graphiques d'arrière-plan » est coché ; une page de texte blanc sur un
// fond qui ne s'imprime pas, c'est une page blanche. (Même règle que les
// autres documents RGD, voir `rgd-documents.js`.)
//
// ⚠ AUCUN PRIX. Une pièce de plus de 9 travaux continue sur une diapositive
// « suite », plutôt que de déborder.
import { esc } from '../ui.js';
import { finDe, dureeLue, versDate, lignesDe } from '../data/rgd-planning.js';
import { piecesDe, pointsDuDetail, elementsDe, FAMILLES } from '../data/rgd-cahier.js';
import { donnees } from './rgd-cahier-doc.js';

const LOGO_CLAIR = new URL('../../assets/logos/rgd-complet-clair.png', import.meta.url).href;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateLongue = (iso) => { if (!iso) return ''; const d = versDate(iso); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
const qte = (p) => [p.quantite, p.unite].filter(Boolean).join(' ');
// ⚠ UNE DIAPOSITIVE SE REMPLIT AU POIDS, PLUS À NEUF TRAVAUX (17/11/2026).
// Tant que les postes n'avaient pas de descriptif, neuf tenaient toujours.
// Depuis que le devis est lu en entier, un seul travail peut porter dix lignes
// de détail : le panneau débordait de la diapositive et le texte était coupé
// net (vu à l'écran avant de corriger). On empile donc les travaux tant que le
// panneau tient, et on passe à la diapositive suivante quand il est plein.
// Le budget d'une diapositive. ⚠ MESURÉ, PAS ESTIMÉ : la presentation à
// l'écran est en 16/9 (`.cp-scene`), plus basse que l'A4 à l'italienne du PDF,
// et c'est donc ELLE qui contraint. Mesure du 17/11/2026, en comptant les
// panneaux qui sortent du cadre : 14 → 28 planches et AUCUN débordement ;
// 16 → 23 planches mais 3 panneaux dehors ; 30 → 16 planches et 8 dehors.
const POIDS_DIAPO = 14;
const LARGEUR_LIGNE = 78;                 // caractères tenant sur une ligne du panneau élargi
const poidsDuPoste = (p) => {
  const titre = 1 + (String(p.designation || '').length > 52 ? 0.5 : 0);
  const lignes = pointsDuDetail(p.detail)
    .reduce((n, x) => n + Math.max(1, Math.ceil(x.length / LARGEUR_LIGNE)), 0);
  return titre + lignes * 0.5;
};
// Les paquets de travaux d'une pièce : jamais vide, jamais au-delà du poids.
function paquets(l) {
  const out = [];
  let cour = [], poids = 0;
  for (const p of l) {
    const w = poidsDuPoste(p);
    if (cour.length && poids + w > POIDS_DIAPO) { out.push(cour); cour = []; poids = 0; }
    cour.push(p); poids += w;
  }
  if (cour.length || !out.length) out.push(cour);
  return out;
}
// Le détail d'un poste, en points — le même découpage que le cahier de
// l'équipe, pour que les deux documents disent la même chose de la même façon.
const detailEnPoints = (detail) => {
  const l = pointsDuDetail(detail);
  return l.length ? `<ul class="cd-points">${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
};

export const POLICES = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=block';

// Le fond : une photo (ou rien), le noir dessous et le voile dégradé dessus,
// tous en contenu. `n` rend les identifiants SVG uniques dans la page.
let compteur = 0;
function fond(url, { voile = 'gauche' } = {}) {
  const id = `cdv${++compteur}`;
  const arrets = voile === 'plein'
    ? '<stop offset="0" stop-color="#0A0806" stop-opacity=".78"/><stop offset="1" stop-color="#0A0806" stop-opacity=".88"/>'
    : '<stop offset="0" stop-color="#0A0806" stop-opacity=".93"/><stop offset=".42" stop-color="#0A0806" stop-opacity=".76"/>'
      + '<stop offset=".75" stop-color="#0A0806" stop-opacity=".16"/><stop offset="1" stop-color="#0A0806" stop-opacity=".36"/>';
  return `<svg class="cd-base" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="100" fill="#14110E"/>
      ${url ? '' : `<radialGradient id="${id}h" cx=".85" cy=".1" r=".9"><stop offset="0" stop-color="#FC5D00" stop-opacity=".35"/><stop offset="1" stop-color="#FC5D00" stop-opacity="0"/></radialGradient>
      <rect width="100" height="100" fill="url(#${id}h)"/>`}</svg>
    ${url ? `<img class="cd-photo" src="${esc(url)}" alt="">` : ''}
    <svg class="cd-voile" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".25">${arrets}</linearGradient></defs>
      <rect width="100" height="100" fill="url(#${id})"/></svg>`;
}

const barres = (n, total) => `<div class="cd-barres">${Array.from({ length: total }, (_, j) =>
  `<i class="${j <= n ? 'on' : ''}"></i>`).join('')}</div>`;

/**
 * Les diapositives, dans l'ordre : couverture, interventions, plan, une (ou
 * plusieurs) par pièce, puis Bon pour accord (client) ou Préparation (équipe).
 * @returns [{ nom, piece?, vignette, html }]
 */
export function diapos(chantier, k, dossier, version, urls) {
  const d = donnees(chantier, k, dossier);
  const equipe = version === 'equipe';
  const postes = Array.isArray(k.postes) ? k.postes : [];
  const pieces = piecesDe(postes);
  const photosDe = (lot) => (k.photos || []).filter(p => (p.lot || '') === lot).map(p => urls[p.chemin]).filter(Boolean);
  // La réserve (photos du NAS non retenues) ne sert jamais de photo de couverture.
  const premiere = (k.photos || []).filter(p => p.lot !== '__reserve__').map(p => urls[p.chemin]).find(Boolean) || null;
  const sur = [k.objet || chantier.titre, d.adresse].filter(Boolean).join(' · ');
  // ⚠ LE CLIENT NE VOIT QUE CE QUI EST COCHÉ « CLIENT », L'ÉQUIPE VOIT TOUT
  // (17/11/2026, Élodie). Une contrainte comme « présence d'amiante » ou
  // « voisin difficile » est utile à l'équipe et n'a pas à être mise sous les
  // yeux du client : la case est décochée par défaut, donc le document du
  // client ne dit rien par accident.
  const elems = elementsDe(k);
  const visibles = (l) => (l || []).filter(e => equipe || e.client);
  const listeElements = (l) => `<ul class="cd-elements">${l.map((e, i) =>
    `<li style="--i:${i}" class="fam-${esc(e.famille)}"><em>${esc(FAMILLES[e.famille].court)}</em>${esc(e.texte)}</li>`).join('')}</ul>`;
  const liste = [];

  liste.push({ nom: 'Couverture', vignette: premiere, html: `
    <div class="cd cd-couv">${fond(premiere)}
      <div class="cd-in">
        <div class="cd-sur"><i></i>${equipe ? 'Version équipe' : 'Cahier des charges'}</div>
        <h1 class="cd-titre">Cahier<br>des charges</h1>
        ${d.adresse ? `<p class="cd-adresse">${esc(d.adresse)}</p>` : ''}
        <div class="cd-pastilles">${[d.typeBien, d.nature, k.devis_numero ? `Devis ${k.devis_numero}` : ''].filter(Boolean)
          .map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="cd-dates"><b>${esc(dateLongue(chantier.date_debut))}</b> → <b>${esc(dateLongue(finDe(chantier)))}</b>
          <span>${esc(dureeLue(chantier).texte)}</span></div>
      </div>
      <img class="cd-logo" src="${LOGO_CLAIR}" alt="RGD Renova">
    </div>` });

  liste.push({ nom: 'Interventions', vignette: null, html: `
    <div class="cd cd-resume">${fond(null)}
      <div class="cd-in">
        <div class="cd-sur"><i></i>${esc(sur)}</div>
        <h2 class="cd-titre moyen">Interventions</h2>
        <p class="cd-sous">${pieces.length} pièce${pieces.length > 1 ? 's' : ''} · ${postes.length} travaux${
          d.nom ? ` · ${esc(d.nom)}` : ''}${equipe && d.telephone ? ` · ${esc(d.telephone)}` : ''}</p>
        <div class="cd-tuiles">${pieces.map((lot, n) => {
          const ph = photosDe(lot)[0];
          const nb = postes.filter(p => (p.lot || '') === lot).length;
          return `<button type="button" class="cd-tuile" style="--i:${n}" data-aller-piece="${esc(lot)}">
            ${ph ? `<img src="${esc(ph)}" alt="">` : '<span class="cd-tuile-vide"></span>'}
            <span class="cd-tuile-voile"></span>
            <em>${String(n + 1).padStart(2, '0')}</em><b>${esc(lot || 'Travaux')}</b><small>${nb} travaux</small></button>`;
        }).join('')}</div>
      </div>
    </div>` });

  // ⚠ LE DÉROULÉ DU CHANTIER (17/11/2026, Élodie, pour le cahier CLIENT :
  // « les dates, l'ordre des pièces, ce qui se passe quand »).
  //
  // ⚠ ON NE DONNE PAS DE DATE PAR PIÈCE, ET C'EST VOULU : le CRM n'en a pas.
  // En répartir sur la durée aurait fabriqué un planning que personne n'a
  // décidé, et un client le lirait comme un engagement. On donne donc ce qui
  // est vrai : le début, la fin, la durée, et l'ORDRE des pièces.
  if (chantier.date_debut) {
    liste.push({ nom: 'Le déroulé', vignette: null, html: `
      <div class="cd cd-resume">${fond(null)}
        <div class="cd-in">
          <div class="cd-sur"><i></i>${esc(sur)}</div>
          <h2 class="cd-titre moyen">Le déroulé</h2>
          <p class="cd-sous">Du ${esc(dateLongue(chantier.date_debut))} au ${esc(dateLongue(finDe(chantier)))}
            · ${esc(dureeLue(chantier).texte)}</p>
          <div class="cd-panneau large"><ol class="cd-etapes">${pieces.map((lot, i) => `
            <li style="--i:${i}"><em>${String(i + 1).padStart(2, '0')}</em>
              <b>${esc(lot || 'Travaux')}</b>
              <span>${(() => { const n2 = postes.filter(p => (p.lot || '') === lot).length;
                return `${n2} ${n2 > 1 ? 'travaux' : 'travail'}`; })()}</span></li>`).join('')}</ol></div>
          <p class="cd-note">Les pièces sont traitées dans cet ordre. Les dates de passage
            pièce par pièce vous seront confirmées au démarrage.</p>
        </div>
      </div>` });
  }

  const elChantier = visibles(elems.chantier);
  if (elChantier.length) {
    liste.push({ nom: 'Technique et contraintes', vignette: null, html: `
      <div class="cd cd-resume">${fond(null)}
        <div class="cd-in">
          <div class="cd-sur"><i></i>${esc(sur)}</div>
          <h2 class="cd-titre moyen">Technique et contraintes</h2>
          <p class="cd-sous">Ce qui encadre le chantier, et ce dont il faut tenir compte.</p>
          <div class="cd-panneau large">${listeElements(elChantier)}</div>
        </div>
      </div>` });
  }

  if (k.plan && urls[k.plan]) {
    liste.push({ nom: 'Plan', vignette: urls[k.plan], html: `
      <div class="cd cd-plan">${fond(null)}
        <div class="cd-in"><div class="cd-sur"><i></i>${esc(sur)}</div><h2 class="cd-titre moyen">Plan</h2>
          <div class="cd-plan-carte"><img src="${esc(urls[k.plan])}" alt="Plan du logement"></div></div>
      </div>` });
  }

  pieces.forEach((lot, n) => {
    const tous = postes.filter(p => (p.lot || '') === lot);
    const ph = photosDe(lot);
    const groupes = paquets(tous);
    groupes.forEach((l, morceau) => {
      const suite = morceau > 0;
      const photo = ph[morceau % Math.max(ph.length, 1)] || null;
      const vignette2 = ph.length > 1 ? ph[(morceau + 1) % ph.length] : null;
      liste.push({ nom: suite ? `${lot || 'Travaux'} (suite)` : (lot || 'Travaux'), piece: suite ? null : lot, vignette: photo, html: `
        <div class="cd cd-piece">${fond(photo)}
          <div class="cd-in">
            <div class="cd-sur"><i></i>Pièce ${n + 1} sur ${pieces.length} · ${esc(k.objet || chantier.titre || '')}</div>
            <h2 class="cd-titre${(lot || '').length > 13 ? ' long' : ''}">${esc(lot || 'Travaux')}${suite ? '<small> suite</small>' : ''}</h2>
            <p class="cd-sous">${tous.length} ${tous.length > 1 ? 'travaux prévus' : 'travail prévu'}${d.adresse ? ` · ${esc(d.adresse)}` : ''}</p>
            <div class="cd-panneau${l.length > 6 ? ' serre' : ''}"><ul class="cd-travaux${equipe ? ' cases' : ''}">${l.map((p, i) => `
              <li style="--i:${i}"><div><b>${esc(p.designation)}</b>${detailEnPoints(p.detail)}</div>${
                qte(p) ? `<span>${esc(qte(p))}</span>` : ''}</li>`).join('')}</ul></div>
            ${(() => { const le = visibles(elems.pieces[lot]);
              return morceau === groupes.length - 1 && le.length
                ? `<div class="cd-panneau large cd-el-piece">${listeElements(le)}</div>` : ''; })()}
            ${barres(n, pieces.length)}
          </div>
          ${vignette2 ? `<div class="cd-vignette"><img src="${esc(vignette2)}" alt=""></div>` : ''}
          <div class="cd-num">${String(n + 1).padStart(2, '0')}</div>
        </div>` });
    });

    // ⚠ LES PHOTOS D'UNE PIÈCE ONT LEUR PLANCHE, EN CLAIR (17/11/2026, Élodie :
    // « je veux rajouter les photos pour les clients »). Elles existaient déjà —
    // son cahier de Gouvieux en porte 19 — mais le document n'en montrait que
    // DEUX par pièce, l'une assombrie en fond de planche, l'autre en vignette.
    // Ici elles sont toutes montrées, à plat, sans voile : c'est la pièce que
    // le client reconnaît, pas un décor.
    //
    // ⚠ RÉSERVÉE AU CLIENT : la version équipe s'imprime sur papier blanc depuis
    // le 17/11, une photo pleine page n'y a plus sa place.
    // ⚠ QUATRE PHOTOS PAR PLANCHE AU PLUS. Au-delà, la grille sortait du cadre
    // sans rien dire : la troisième photo d'une pièce tombait sous le bord de la
    // diapositive (vu à l'écran le 17/11). On ouvre donc une planche de plus.
    if (!equipe && ph.length) {
      for (let d0 = 0, m = 0; d0 < ph.length; d0 += 4, m++) {
        const lot4 = ph.slice(d0, d0 + 4);
        liste.push({ nom: `${lot || 'Travaux'} en images${m ? ' (suite)' : ''}`, vignette: lot4[0], html: `
        <div class="cd cd-galerie">${fond(null, { voile: 'plein' })}
          <div class="cd-in">
            <div class="cd-sur"><i></i>Pièce ${n + 1} sur ${pieces.length} · ${esc(k.objet || chantier.titre || '')}</div>
            <h2 class="cd-titre moyen">${esc(lot || 'Travaux')} <small>en images${m ? ' (suite)' : ''}</small></h2>
            <div class="cd-grille cd-grille-${lot4.length}">${lot4.map((u, i) =>
              `<figure style="--i:${i}"><img src="${esc(u)}" alt="${esc(lot || 'Travaux')}"></figure>`).join('')}</div>
          </div>
        </div>` });
      }
    }
  });

  if (equipe) {
    const bloc = (titre, l) => `<div class="cd-panneau petit"><h3>${titre}</h3>${l.length ? `<ul class="cd-travaux cases">${l.map((x, i) =>
      `<li style="--i:${i}"><div><b>${esc(x.libelle)}</b></div>${x.quantite ? `<span>${esc(x.quantite)}</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="cd-vide">Rien de prévu.</p>'}</div>`;
    const textes = [['Consignes', k.consignes], ['Convenu avec le client', k.precisions], ['Notes du chantier', chantier.notes]].filter(x => x[1]);
    liste.push({ nom: 'Préparation', vignette: null, html: `
      <div class="cd cd-fin">${fond(null)}
        <div class="cd-in">
          <div class="cd-sur"><i></i>${esc(sur)}</div>
          <h2 class="cd-titre moyen">Préparation</h2>
          <div class="cd-prepa">
            <div class="cd-panneau petit">${textes.length ? textes.map(([t, v]) => `<h3>${t}</h3><p class="cd-libre">${esc(v)}</p>`).join('')
              : '<p class="cd-vide">Aucune consigne.</p>'}</div>
            ${bloc('Matériaux', lignesDe(chantier.id, 'materiaux'))}
            ${bloc('Outils', lignesDe(chantier.id, 'outils'))}
          </div>
          <p class="cd-pied">Document interne — ne pas remettre au client</p>
        </div>
      </div>` });
  } else {
    // ⚠ CE QUI RESTE À LA CHARGE DU CLIENT A SA PROPRE PLANCHE (17/11/2026,
    // Élodie : « aujourd'hui c'est noyé dans une seule ligne »). C'était un
    // paragraphe en haut de la page de signature, là où on ne lit plus rien.
    // Le champ existe déjà — « Précisions » du cahier — et il est découpé en
    // points comme les descriptifs du devis.
    const aLui = pointsDuDetail(k.precisions);
    if (aLui.length) {
      liste.push({ nom: 'Ce qui vous revient', vignette: null, html: `
        <div class="cd cd-resume">${fond(null)}
          <div class="cd-in">
            <div class="cd-sur"><i></i>${esc(sur)}</div>
            <h2 class="cd-titre moyen">Ce qui vous revient</h2>
            <p class="cd-sous">Ce que nous attendons de vous pour que le chantier avance sans arrêt.</p>
            <div class="cd-panneau large"><ul class="cd-vous">${aLui.map((x, i) =>
              `<li style="--i:${i}">${esc(x)}</li>`).join('')}</ul></div>
          </div>
        </div>` });
    }
    const signe = k.signature && k.signe_le;
    liste.push({ nom: 'Bon pour accord', vignette: null, html: `
      <div class="cd cd-fin">${fond(null)}
        <div class="cd-in">
          <div class="cd-sur"><i></i>${esc(sur)}</div>
          <h2 class="cd-titre moyen">Bon pour accord</h2>
          <div class="cd-accord">
            <p>Je soussigné(e) déclare avoir pris connaissance du présent cahier des charges et en valider le contenu
              avant le démarrage des travaux. Il complète le devis${k.devis_numero ? ` n° ${esc(k.devis_numero)}` : ''}, qui reste seul à faire foi pour les prix.</p>
            <div class="cd-signature">${signe ? `<img src="${k.signature}" alt="Signature du client">` : ''}</div>
            <p class="cd-signe">${signe ? `Signé par <b>${esc(k.signe_par || 'le client')}</b> le ${esc(new Date(k.signe_le).toLocaleString('fr-FR'))}${
              k.signe_mode === 'a_distance' ? ' (en ligne)' : ''}` : 'Signature du client et date'}</p>
          </div>
        </div>
        <img class="cd-logo" src="${LOGO_CLAIR}" alt="RGD Renova">
      </div>` });
  }
  return liste;
}

// Le style des diapositives, partagé par l'écran et le PDF. Le conteneur
// (`.cd-cadre`) doit être un conteneur de requête (`container-type`).
export const STYLE_DIAPOS = `
.cd { position: absolute; inset: 0; overflow: hidden; color: #fff; font-family: Inter, Arial, sans-serif; background: #14110E;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cd .cd-base, .cd .cd-voile { position: absolute; inset: 0; width: 100%; height: 100%; }
.cd .cd-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cd-in { position: absolute; inset: 0; padding: 4.4cqw 5cqw 4cqw; display: flex; flex-direction: column; }
.cd-sur { display: flex; align-items: center; gap: 1.1cqw; font: 600 1.02cqw/1.2 Inter, Arial, sans-serif; letter-spacing: .18em;
  text-transform: uppercase; color: #F6C08A; }
.cd-sur i { flex: none; width: 2.7cqw; height: .16cqw; background: #FC5D00; }
.cd-titre { font: 800 8.1cqw/.95 'Inter Tight', Inter, Arial, sans-serif; letter-spacing: -.03em; margin: 1.4cqw 0 .8cqw; color: #fff; }
.cd-titre.moyen { font-size: 5.6cqw; }
/* Le nom de la pièce ne passe pas sous la vignette (en haut à droite) : un nom
   long passe à la ligne, en plus petit. */
.cd-piece .cd-titre { max-width: 64cqw; }
.cd-piece .cd-titre.long { font-size: 6cqw; }
.cd-titre small { font-size: .32em; font-weight: 600; letter-spacing: 0; color: #F6C08A; margin-left: 1cqw; }
.cd-sous { font-size: 1.42cqw; color: #D6CFC8; margin: 0 0 2.4cqw; }
/* ⚠ LE PANNEAU D'UNE PIÈCE S'ÉLARGIT À 60cqw depuis que le devis est lu en
   entier (17/11/2026) : à 46cqw, le descriptif d'un seul travail prenait dix
   lignes et la pièce réclamait trois diapositives. La photo garde 40 % du
   cadre, ce qui suffit à reconnaître la pièce. */
.cd-piece .cd-panneau { width: 60cqw; }
.cd-panneau { width: 46cqw; background: rgba(28, 24, 20, .5); border: .08cqw solid rgba(255,255,255,.16); border-radius: 1.7cqw;
  padding: 1.1cqw 1.8cqw; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.cd-panneau.petit { width: auto; }
.cd-panneau.large { width: 62cqw; margin-bottom: 1.6cqw; }
ul.cd-travaux { list-style: none; margin: 0; padding: 0; }
ul.cd-travaux li { display: flex; align-items: baseline; justify-content: space-between; gap: 1.4cqw; padding: .82cqw 0;
  border-bottom: .08cqw solid rgba(255,255,255,.1); font-size: 1.36cqw; }
.cd-panneau.serre ul.cd-travaux li { padding: .6cqw 0; font-size: 1.24cqw; }
ul.cd-travaux li:last-child { border-bottom: 0; }
ul.cd-travaux li b { font-weight: 500; }
ul.cd-travaux li small { display: block; font-size: .82em; color: #BDB4AB; margin-top: .2cqw; }
/* Le descriptif du devis, un point par ligne (17/11/2026) : en pavé il était
   illisible, et les puces que Costructor écrit en « - » se retrouvaient au
   milieu des phrases. */
/* Les éléments techniques et les contraintes (17/11/2026). */
ul.cd-elements { list-style: none; margin: 0; padding: 0; }
ul.cd-elements li { position: relative; padding: .62cqw 0; font-size: 1.28cqw; line-height: 1.4;
  border-bottom: .08cqw solid rgba(255,255,255,.1); }
ul.cd-elements li:last-child { border-bottom: 0; }
ul.cd-elements em { font-style: normal; font-weight: 800; font-size: .72em; letter-spacing: .08em;
  text-transform: uppercase; color: #F6C08A; margin-right: 1.2cqw; }
ul.cd-elements li.fam-technique em { color: #8FC7E8; }
.cd-el-piece { margin-top: 1.4cqw; }

/* Les photos d'une pièce, à plat et sans voile (17/11/2026). La grille suit le
   nombre de photos : une seule occupe le cadre, quatre se rangent en deux
   rangées. Les images sont recadrées (object-fit: cover) pour que la grille
   reste régulière quelles que soient les proportions des prises de vue.
   ⚠ Pas d'accent grave dans ce commentaire : il vit dans un gabarit JS, et
   une paire de backticks y refermerait la chaîne. */
.cd-galerie .cd-grille { display: grid; gap: 1.4cqw; width: 100%; margin-top: 2cqw;
  flex: 1; min-height: 0; }
.cd-galerie .cd-grille-1 { grid-template-columns: 1fr; }
.cd-galerie .cd-grille-2 { grid-template-columns: 1fr 1fr; }
.cd-galerie .cd-grille-3, .cd-galerie .cd-grille-4 { grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr; }
/* Trois photos : la dernière prend toute la largeur, sinon il reste un trou. */
.cd-galerie .cd-grille-3 figure:nth-child(3) { grid-column: span 2; }
.cd-galerie figure { margin: 0; min-height: 0; overflow: hidden; border-radius: 1.2cqw;
  border: .1cqw solid rgba(255, 255, 255, .14); background: #1C1814; }
.cd-galerie figure img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cd-galerie .cd-titre small { font-size: .34em; font-weight: 600; letter-spacing: 0;
  color: #F6C08A; margin-left: 1cqw; }

/* L'ordre des pièces, et ce qui revient au client (17/11/2026). */
ol.cd-etapes { list-style: none; margin: 0; padding: 0; counter-reset: e; }
ol.cd-etapes li { display: flex; align-items: baseline; gap: 1.4cqw; padding: .78cqw 0;
  border-bottom: .08cqw solid rgba(255,255,255,.1); font-size: 1.36cqw; }
ol.cd-etapes li:last-child { border-bottom: 0; }
ol.cd-etapes em { font-style: normal; font-weight: 800; color: #FC5D00; flex: none; }
ol.cd-etapes b { flex: 1; font-weight: 500; }
ol.cd-etapes span { flex: none; color: #BDB4AB; font-size: .85em; }
ul.cd-vous { list-style: none; margin: 0; padding: 0; }
ul.cd-vous li { position: relative; padding: .62cqw 0 .62cqw 2.6cqw; font-size: 1.3cqw; line-height: 1.4;
  border-bottom: .08cqw solid rgba(255,255,255,.1); }
ul.cd-vous li:last-child { border-bottom: 0; }
ul.cd-vous li::before { content: ""; position: absolute; left: .5cqw; top: 1.25cqw;
  width: .95cqw; height: .95cqw; border-radius: 50%; border: .16cqw solid #FC5D00; }
.cd-note { font-size: 1.1cqw; color: #BDB4AB; margin: 1.4cqw 0 0; max-width: 62cqw; }

ul.cd-points { list-style: none; margin: .35cqw 0 0; padding: 0; }
ul.cd-points li { display: block; position: relative; padding: 0 0 0 1.4cqw; border: 0;
  font-size: .74em; line-height: 1.32; color: #BDB4AB; }
ul.cd-points li::before { content: ""; position: absolute; left: 0; top: .62em;
  width: .85cqw; height: .07cqw; background: rgba(255, 255, 255, .42); }
ul.cd-travaux li span { flex: none; color: #FC5D00; font-weight: 700; white-space: nowrap; }
ul.cd-travaux.cases li > div { display: flex; gap: 1cqw; align-items: baseline; flex-wrap: wrap; }
ul.cd-travaux.cases li > div::before { content: ""; flex: none; width: 1.15cqw; height: 1.15cqw; border: .13cqw solid #fff;
  border-radius: .25cqw; transform: translateY(.15cqw); }
ul.cd-travaux.cases li small { flex-basis: 100%; padding-left: 2.15cqw; }
.cd-barres { margin-top: auto; display: flex; gap: .6cqw; }
.cd-barres i { flex: 1; height: .32cqw; border-radius: .32cqw; background: rgba(255,255,255,.18); }
.cd-barres i.on { background: #FC5D00; }
.cd-num { position: absolute; right: 4.4cqw; bottom: -3.4cqw; font: 900 26.5cqw/1 'Inter Tight', Inter, Arial, sans-serif;
  color: rgba(255,255,255,.08); pointer-events: none; }
.cd-vignette { position: absolute; right: 5cqw; top: 4.4cqw; width: 17cqw; height: 12cqw; border-radius: 1.2cqw; overflow: hidden;
  border: .3cqw solid rgba(255,255,255,.85); box-shadow: 0 1.5cqw 3cqw rgba(0,0,0,.4); }
.cd-vignette img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cd-logo { position: absolute; right: 5cqw; bottom: 4cqw; width: 19cqw; }
.cd-adresse { font-size: 2cqw; font-weight: 600; margin: .6cqw 0 1.6cqw; }
.cd-pastilles { display: flex; flex-wrap: wrap; gap: .8cqw; }
.cd-pastilles span { border: .1cqw solid rgba(255,255,255,.35); border-radius: 99cqw; padding: .4cqw 1.2cqw; font-size: 1.15cqw; font-weight: 600; }
.cd-dates { margin-top: auto; font-size: 1.4cqw; color: #D6CFC8; }
.cd-dates b { color: #fff; font-weight: 600; } .cd-dates span { margin-left: 1.2cqw; color: #F6C08A; }
.cd-couv .cd-titre { font-size: 9cqw; }
.cd-tuiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(20cqw, 1fr)); gap: 1.3cqw; }
.cd-tuile { position: relative; height: 11.5cqw; border: 0; border-radius: 1.4cqw; overflow: hidden; padding: 0; cursor: pointer;
  text-align: left; color: #fff; font: inherit; background: #2A231D; }
.cd-tuile img, .cd-tuile .cd-tuile-vide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cd-tuile .cd-tuile-vide { background: #3A2E24; }
.cd-tuile .cd-tuile-voile { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(10,8,6,.85), rgba(10,8,6,.1) 70%); }
.cd-tuile em, .cd-tuile b, .cd-tuile small { position: absolute; left: 1.2cqw; }
.cd-tuile em { top: 1cqw; font: 800 1.2cqw 'Inter Tight', Inter, sans-serif; font-style: normal; color: #FC5D00; }
.cd-tuile b { bottom: 2.6cqw; font: 700 1.75cqw/1.1 'Inter Tight', Inter, sans-serif; right: 1.2cqw; }
.cd-tuile small { bottom: 1.1cqw; font-size: 1.05cqw; color: #D6CFC8; }
.cd-plan-carte { flex: 1; min-height: 0; background: #fff; border-radius: 1.6cqw; padding: 1.6cqw; display: flex; align-items: center; justify-content: center; }
.cd-plan-carte img { max-width: 100%; max-height: 100%; object-fit: contain; }
.cd-prepa { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 1.6cqw; align-items: start; }
.cd h3 { font: 700 1.05cqw Inter, Arial, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #F6C08A; margin: .4cqw 0 .8cqw; }
.cd-libre { white-space: pre-wrap; font-size: 1.3cqw; margin: 0 0 1.2cqw; color: #EDE6DF; }
.cd-vide { font-size: 1.2cqw; color: #9C928A; font-style: italic; margin: 0; }
.cd-pied { margin-top: auto; font-size: 1.05cqw; color: #9C928A; letter-spacing: .08em; text-transform: uppercase; }
.cd-accord { width: 62cqw; background: #fff; color: #1A1714; border-radius: 1.7cqw; padding: 2cqw 2.4cqw; font-size: 1.32cqw; line-height: 1.45; }
.cd-accord p { margin: 0; }
.cd-signature { height: 9cqw; margin: 1.4cqw 0 .6cqw; border-bottom: .1cqw solid #c9c1b9; display: flex; align-items: flex-end; }
.cd-signature img { max-height: 8.6cqw; max-width: 60%; }
.cd-accord .cd-signe { font-size: 1.1cqw; color: #6E6760; }
`;

// Les entrées animées, À L'ÉCRAN SEULEMENT (la présentation ajoute
// `.active` à la diapositive affichée).
export const STYLE_ANIMATIONS = `
.cp-diapo.active .cd-photo { animation: cd-zoom 12s ease-out both; }
.cp-diapo.active .cd-titre { animation: cd-monte .7s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-sur, .cp-diapo.active .cd-sous { animation: cd-monte .6s .08s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-panneau { animation: cd-monte .7s .15s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active ul.cd-travaux li { animation: cd-ligne .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(.3s + var(--i) * 55ms); }
.cp-diapo.active .cd-tuile { animation: cd-monte .55s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(.15s + var(--i) * 70ms); }
.cp-diapo.active .cd-num { animation: cd-num 1.1s .2s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-vignette { animation: cd-glisse .8s .35s cubic-bezier(.2,.8,.2,1) both; }
.cp-diapo.active .cd-barres i.on { animation: cd-barre .6s .3s ease both; transform-origin: left; }
.cd-tuile:hover img { transform: scale(1.06); } .cd-tuile img { transition: transform .5s ease; }
@keyframes cd-zoom { from { transform: scale(1.1); } to { transform: scale(1); } }
@keyframes cd-monte { from { opacity: 0; transform: translateY(1.6cqw); } to { opacity: 1; transform: none; } }
@keyframes cd-ligne { from { opacity: 0; transform: translateX(-1.4cqw); } to { opacity: 1; transform: none; } }
@keyframes cd-num { from { opacity: 0; transform: translateY(6cqw); } to { opacity: 1; transform: none; } }
@keyframes cd-glisse { from { opacity: 0; transform: translateX(4cqw) rotate(3deg); } to { opacity: 1; transform: none; } }
@keyframes cd-barre { from { transform: scaleX(0); } to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .cp-diapo.active * { animation: none !important; } }
`;
