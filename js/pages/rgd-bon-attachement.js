// Remplir le bon d'attachement à l'écran, et l'envoyer au client (02/11/2026)
//
// Élodie : « je voudrais pouvoir remplir directement depuis l'interface pour
// pouvoir l'envoyer aussi par mail au client ». Le document existait, mais
// sorti À IMPRIMER : ce qu'on constate sur place — heures, contrôles,
// anomalies — s'écrivait au stylo. Un bon envoyé par mail ne peut pas avoir de
// blancs.
//
// ⚠ ET IL PEUT N'AVOIR AUCUNE FACTURE (même jour, « si jamais on ne suit pas la
// suite logique… »). Franck intervient sous garantie, en sous-traitance, ou
// sur un chantier que le comptable facturera ailleurs : le bon se crée seul,
// depuis la fiche. Sans facture, rien ne le pré-remplit — ni heures, ni
// fournitures — et l'écran le dit au lieu d'inventer.
//
// ⚠ LES CASES NE SONT PAS ÉCRITES ICI, elles viennent de `GROUPES` dans
// `data/rgd-bon-attachement.js`, que le PDF lit aussi. Voir l'en-tête de ce
// fichier : une case ajoutée d'un seul côté, c'est une observation saisie qui
// n'arrive jamais chez le client.
//
// ⚠ UN SEUL CHOIX SE DÉCOCHE, ET C'EST POUR ÇA QUE TOUT EST EN CASES. Les
// choix uniques auraient pu être des boutons radio : une fois l'un coché, on
// ne peut plus revenir à « rien ». Sur un document qui atteste, se tromper de
// case et ne plus pouvoir l'enlever est pire que de n'avoir rien coché.
//
// ⚠ LE BON N'EST CRÉÉ EN BASE QU'AU PREMIER ENREGISTREMENT. Le créer à
// l'ouverture aurait laissé une ligne numérotée derrière chaque fenêtre
// ouverte puis refermée — des bons vides dans une suite qui doit se lire.
import { esc, openModal, closeModal, toast, fmtDate } from '../ui.js';
import { posePadSignature } from '../pad-signature.js';
import {
  GROUPES, COLONNES_MO, FOURNI_PAR, coche, saisieDepart, numeroBon,
  enregistrerBonAttachement, creerBon, bonDuDevis, signerBonAttachement, supprimerBon,
  totalHeures, messageBonAttachement, nomDuResponsable,
} from '../data/rgd-bon-attachement.js';
import { envoyerBonAttachement, UNITES } from '../data/rgd-devis-crm.js';

const MAX_MO = 12;
const MAX_FOURNITURES = 30;

/** Le bon d'une facture : on le retrouve, ou on l'ouvre neuf. */
export function ouvrirBonDeLaFacture(x, devis, retour = null) {
  ouvrirBonAttachement(x, { bon: bonDuDevis(devis), devis }, retour);
}

/** Un bon sans facture, créé depuis la fiche. */
export function ouvrirBonNeuf(x, retour = null) {
  ouvrirBonAttachement(x, { bon: null, devis: null }, retour);
}

export function ouvrirBonAttachement(x, { bon = null, devis = null } = {}, retour = null) {
  let courant = bon;
  let s = null;        // la saisie en cours, jamais écrite tant qu'on n'enregistre pas
  // ⚠ PAS DE `confirm()` : il ouvre sa propre fenêtre et ferme celle du bon,
  // avec tout ce qui était saisi. On confirme par un second clic sur le même
  // bouton — même procédé que la suppression d'un brouillon de facture.
  let confirmerSuppr = false;
  let docs = null;     // `rgd-documents.js`, chargé à la demande

  const titre = () => `Bon d’attachement${courant?.numero ? ' ' + courant.numero : ''}`;
  const m = openModal(titre(), '<div id="rba" class="rba"></div>',
    { wide: true, onClose: () => retour?.() });
  const hote = m.querySelector('#rba');

  const charger = async () => {
    if (!docs) docs = await import('./rgd-documents.js');
    return docs;
  };

  // ------------------------------------------------------------- le gabarit
  const champ = (cle, label, { type = 'text', aide = '', plein = false, placeholder = '' } = {}) =>
    `<label class="mail-champ${plein ? ' plein' : ''}">${esc(label)}
      <input data-cle="${cle}" type="${type}" value="${esc(s[cle] ?? '')}"
        placeholder="${esc(placeholder)}" autocomplete="off">
      ${aide ? `<small class="muted">${esc(aide)}</small>` : ''}</label>`;

  const zone = (cle, label, { lignes = 3, aide = '' } = {}) =>
    `<label class="mail-champ plein">${esc(label)}
      <textarea data-cle="${cle}" rows="${lignes}">${esc(s[cle] ?? '')}</textarea>
      ${aide ? `<small class="muted">${esc(aide)}</small>` : ''}</label>`;

  // ⚠ DEUX FAÇONS DE COCHER, ET CE N'EST PAS UNE COQUETTERIE (11/11/2026,
  // Élodie : « pour les contrôles avant remise sous tension, je voudrais que ce
  // soit sous forme de check-list »). En ligne, c'est bien pour des étiquettes
  // qu'on lit d'un coup d'œil — la nature des travaux, le régime. Mais une
  // vérification se POINTE, une par une, souvent le téléphone dans une main :
  // elle veut une rangée par ligne, large, qu'on touche sans viser, et qui se
  // teinte quand c'est fait. C'est la différence entre une liste de mots et
  // une liste de tâches.
  // ⚠ CE SONT LES CARTES DE LA FACTURE, PAS UNE FORME DE PLUS (11/11/2026,
  // Élodie, pour la troisième fois : « je voudrais quelque chose de plus
  // moderne et dynamique quand on remplit le bon d'attachement, COMME LA
  // FACTURE, là c'est trop fade »). `rdc-presta`, `rdc-presta-tete`,
  // `rdc-coche` et `rdc-presta-nom` sont les classes de l'écran de facturation :
  // une rangée qu'on touche, une pastille ronde qui se remplit d'orange, le
  // libellé qui passe en gras. Rien n'est inventé ici — c'est exactement ce
  // qu'elle aime déjà, appliqué à un autre formulaire.
  //
  // ⚠ ET LA PRÉCISION VIT SOUS SA CARTE, pas à côté : « Résistance de terre »
  // n'ouvre son champ Ω qu'une fois prise. C'est la mécanique de la facture,
  // où la quantité n'apparaît que sous une prestation choisie — et c'est elle
  // qui vide l'écran de tout ce qui ne sert pas encore.
  //
  // ⚠ LES CASES EN LIGNE ONT DISPARU. Elles tenaient moins de place, mais sur
  // un téléphone une case de 13 px au milieu d'une phrase se rate une fois sur
  // trois, et quarante d'affilée donnent la page « fade » qu'elle décrit.
  // ⚠ DEUX TAILLES DE CARTE, ET C'EST CE QUI DÉCIDE DE LA LONGUEUR DE L'ÉCRAN.
  // Tout mettre en rangées pleine largeur donnait, pour le seul premier bloc,
  // vingt-et-une rangées à faire défiler — plus long qu'avant, alors qu'on
  // cherchait l'inverse. Vu à l'écran, corrigé :
  //   • EN PASTILLES ce qui se choisit d'un coup d'œil parmi quatre mots courts
  //     (type de client, nature du lieu, conditions…) : elles s'alignent et se
  //     replient, trois rangées au lieu de dix ;
  //   • EN RANGÉES PLEINES les contrôles, parce qu'Élodie les veut en
  //     check-list et qu'une vérification se pointe une par une, le téléphone
  //     dans une main.
  // Dans les deux cas c'est la même pastille ronde qui se remplit d'orange :
  // le vocabulaire de la facture, à deux échelles.
  const EN_LISTE = ['controles'];
  const groupe = (nom, { titre: avecTitre = true } = {}) => {
    const g = GROUPES[nom];
    const prises = g.options.filter(o => coche(s, nom, o.c)).length;
    const liste = EN_LISTE.includes(nom);
    const option = (o) => {
      const prise = coche(s, nom, o.c);
      const tete = `<button type="button" class="${liste ? 'rdc-presta-tete' : 'rba-chip'}${
          !liste && prise ? ' est-choisie' : ''}" data-groupe="${nom}" data-code="${o.c}"
          aria-pressed="${prise}">
          <span class="rdc-coche" aria-hidden="true">${prise ? '✓' : '+'}</span>
          <span class="rdc-presta-nom">${esc(o.l)}</span>
        </button>`;
      const precision = prise && o.aussi ? `<div class="rba-precision">
          <label class="mail-champ">${esc(o.unite ? `Valeur en ${o.unite}` : 'À préciser')}
            <input class="rba-aussi" data-cle="${o.aussi}" value="${esc(s[o.aussi] ?? '')}"
              placeholder="${esc(o.unite || 'à préciser')}" autocomplete="off"></label>
        </div>` : '';
      return liste
        ? `<div class="rdc-presta${prise ? ' est-choisie' : ''}">${tete}${precision}</div>`
        : tete + precision;
    };
    return `<div class="rba-groupe">${avecTitre
      ? `<h5 class="rdc-cat">${esc(g.titre)}${prises
          ? `<span class="rdc-compte">${prises} choisi${prises > 1 ? 's' : ''}</span>` : ''}</h5>` : ''}
      <div class="${liste ? '' : 'rba-chips'}" data-liste="${nom}">${g.options.map(option).join('')}</div></div>`;
  };

  const rangeeMo = (r, i) => `<div class="rba-rangee">
    <div class="mf-grille mf-grille-serree">
      ${COLONNES_MO.map(c => `<label class="mail-champ">${esc(c.l)}
        <input data-mo="${i}" data-col="${c.c}" ${c.type ? `type="${c.type}"` : ''}
          ${c.num ? 'inputmode="decimal"' : ''} value="${esc(r[c.c] ?? '')}" autocomplete="off"></label>`).join('')}
    </div>
    ${(s.mo || []).length > 1 ? `<button type="button" class="btn ghost sm" data-mo-suppr="${i}">Retirer cette rangée</button>` : ''}
  </div>`;

  // ⚠ UNE FOURNITURE PORTE TOUT CE QUI S'IMPRIME, et se saisit entièrement
  // quand il n'y a pas de facture : désignation, unité, quantité. Avec une
  // facture, ces trois-là sont déjà remplies — on les laisse modifiables,
  // parce que ce qui a été posé sur le chantier peut différer de ce qui a été
  // chiffré, et que c'est le bon qui dit la vérité du chantier.
  const rangeeFourniture = (f, i) => `<div class="rba-rangee">
    <div class="mf-grille mf-grille-serree">
      <label class="mail-champ plein">Désignation
        <input data-four="${i}" data-col="designation" value="${esc(f.designation ?? '')}" autocomplete="off"></label>
      <label class="mail-champ">Marque / référence
        <input data-four="${i}" data-col="reference" value="${esc(f.reference ?? '')}" autocomplete="off"></label>
      <label class="mail-champ">Unité
        <select data-four="${i}" data-col="unite">
          ${Object.entries(UNITES).map(([k, v]) => `<option value="${esc(k)}" ${(f.unite || 'forfait') === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
        </select></label>
      <label class="mail-champ">Quantité
        <input data-four="${i}" data-col="quantite" inputmode="decimal" value="${esc(f.quantite ?? '')}" autocomplete="off"></label>
      <label class="mail-champ">Fourni par
        <select data-four="${i}" data-col="fourni_par">
          <option value="">—</option>
          ${FOURNI_PAR.map(o => `<option value="${esc(o.c)}" ${f.fourni_par === o.c ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
        </select></label>
    </div>
    <button type="button" class="btn ghost sm" data-four-suppr="${i}">Retirer cette fourniture</button>
  </div>`;

  // ⚠ TROIS BLOCS, UN SEUL OUVERT (11/11/2026, Élodie : « il y a beaucoup
  // d'informations, on s'y perd »). Les huit sections restent TOUTES là — rien
  // n'est supprimé, ce sont des mentions de sécurité électrique et la pièce
  // qu'on ressort en cas de litige — mais on n'en voit qu'une à la fois, et
  // chaque bloc dit en une ligne ce qu'il porte déjà. Ce qu'on cherche en
  // ouvrant ce formulaire, ce n'est pas « tout », c'est « où j'en suis ».
  //
  // ⚠ `<details>` PLUTÔT QU'UN ACCORDÉON ÉCRIT À LA MAIN : le navigateur sait
  // déjà ouvrir, fermer, et le dire aux lecteurs d'écran. On ne garde que le
  // nom du bloc ouvert, pour le retrouver après un redessin.
  let blocOuvert = 'ou';
  const bloc = (cle, titre, resume, dedans) => `
    <details class="rba-bloc"${blocOuvert === cle ? ' open' : ''} data-bloc="${cle}">
      <summary class="rba-bloc-tete">
        <span class="rba-bloc-titre">${esc(titre)}</span>
        <span class="rba-bloc-resume">${resume}</span>
      </summary>
      <div class="rba-bloc-corps">${dedans}</div>
    </details>`;

  const dessine = () => {
    const heures = totalHeures(s);
    // ⚠ LES DEUX SIGNATURES, PAS UNE : celle de l'intervenant vit dans la
    // SAISIE (`s.signature_rgd`, elle se refait tant que le bon n'est pas
    // signé), celle du client dans le BON enregistré (`courant.signature`,
    // qui le fige). Les chercher au même endroit était l'erreur à ne pas faire.
    const manquent = [];
    if (!s.signature_rgd) manquent.push('la signature de l’intervenant');
    if (!courant?.signature) manquent.push('la signature du client');
    const pretAEnvoyer = manquent.length === 0;
    const manqueSignature = manquent.join(' et ');
    const fournitures = Array.isArray(s.fournitures) ? s.fournitures : [];
    // Ce que chaque bloc annonce dans son en-tête : du concret, pas un état
    // d'avancement en pourcentage. « 3 h · 2 fournitures » se vérifie d'un
    // coup d'œil ; « 60 % rempli » ne se vérifie pas du tout.
    const motsDe = (nom) => GROUPES[nom].options
      .filter(o => coche(s, nom, o.c)).map(o => o.l);
    const bout = (l, n = 2) => (l.length > n ? `${l.slice(0, n).join(', ')} +${l.length - n}` : l.join(', '));
    const resumeOu = [s.lieu_cp_ville, bout(motsDe('client_type'), 1), bout(motsDe('nature'))]
      .filter(Boolean).join(' · ') || 'à compléter';
    const resumeFait = [
      heures ? `${String(heures).replace('.', ',')} h` : null,
      fournitures.length ? `${fournitures.length} fourniture${fournitures.length > 1 ? 's' : ''}` : null,
      coche(s, 'deplacement', 'forfait') ? 'déplacement forfait' : null,
    ].filter(Boolean).join(' · ') || 'à compléter';
    const nCtrl = motsDe('controles').length;
    const resumeFin = [
      `${nCtrl} contrôle${nCtrl > 1 ? 's' : ''} sur ${GROUPES.controles.options.length}`,
      pretAEnvoyer ? 'signé des deux côtés' : `il manque ${manqueSignature}`,
    ].join(' · ');

    hote.innerHTML = `
      <p class="rdc-aide">Ce bon constate les <b>temps passés</b> et les <b>fournitures posées</b>.
      ${devis
        ? `Il accompagne la facture ${esc(devis.numero || '')} et ne réclame aucun règlement.`
        : '<b>Il n’est rattaché à aucune facture</b> : rien ne le pré-remplit, et il ne porte aucun montant.'}
      Ce qui reste vide reste vide sur le PDF : rien n’est coché à votre place.</p>

      ${bloc('ou', 'Où, chez qui, pour quoi', esc(resumeOu), `
        <div class="mf-grille">
          ${devis ? '' : champ('objet', 'Objet de l’intervention', { plein: true, placeholder: 'Dépannage, mise en sécurité…' })}
          ${champ('lieu_cp_ville', 'Code postal / ville')}
          ${champ('lieu_batiment', 'Bât. / étage / lot')}
          ${champ('lieu_acces', 'Accès / code')}
          ${champ('lieu_contact', 'Contact sur place')}
        </div>
        ${groupe('client_type')}
        ${groupe('lieu_type')}
        ${groupe('nature')}
        ${groupe('regime')}`)}

      ${bloc('fait', 'Ce qui a été fait', esc(resumeFait), `
        <div class="mf-grille">
          ${zone('constat', 'Ce qui a été constaté et fait', { lignes: 4, aide: 'Repris de la facture, une ligne par prestation — corrigez ce qui a changé sur place.' })}
        </div>
        <h5 class="rdc-cat">Main-d’œuvre<span class="rdc-compte">total <b id="rba-heures">${
          esc(String(heures).replace('.', ','))}</b> h</span></h5>
        <div id="rba-mo">${(s.mo || []).map(rangeeMo).join('')}</div>
        <button type="button" class="btn ghost sm" id="rba-mo-plus">+ Une rangée d’heures</button>
        ${groupe('deplacement')}
        <div class="mf-grille">${champ('deplacement_nb', 'Nombre de déplacements')}</div>
        <h5 class="rdc-cat">Fournitures posées${fournitures.length
          ? `<span class="rdc-compte">${fournitures.length}</span>` : ''}</h5>
        <p class="small muted">${devis
          ? 'Reprises de la facture, modifiables : c’est ce bon qui dit ce qui a réellement été posé.'
          : 'Aucune facture ne les donne : elles se saisissent une par une.'}</p>
        <div id="rba-four">${fournitures.map(rangeeFourniture).join('')}</div>
        <button type="button" class="btn ghost sm" id="rba-four-plus">+ Une fourniture</button>
        ${groupe('materiel')}`)}

      ${bloc('fin', 'Contrôles, réserves et signatures', esc(resumeFin), `
        ${groupe('controles')}
        ${groupe('sous_tension')}
        <div class="mf-grille">
          ${zone('anomalies', 'Anomalies constatées hors intervention', { lignes: 2, aide: 'Ce qui est signalé ici et non traité reste sous la responsabilité du client.' })}
        </div>
        ${groupe('suite')}
        ${groupe('reception')}
        ${pretAEnvoyer ? '' : `<p class="rba-manque">Pour envoyer ce bon au client, il manque
          <b>${esc(manqueSignature)}</b>. Les deux signatures font la valeur du document.</p>`}
        <h5 class="rdc-cat">Signatures</h5>
        <div class="mf-grille">${champ('intervenant', 'Intervenant RGD Renova', { aide: 'Le nom qui s’imprime sous la signature.' })}</div>
        <div class="rdc-statut"><span class="muted small">Intervenant</span>
          ${s.signature_rgd
            ? `<span class="chip green">Signé</span>
               <button type="button" class="btn ghost sm" id="rba-sign-off">Retirer la signature</button>`
            : '<button type="button" class="btn ghost sm" id="rba-signer">Signer</button>'}
        </div>
        <div class="rdc-statut"><span class="muted small">Client</span>
          ${courant?.signature
            ? `<span class="chip green">Signé${courant.signe_par ? ' par ' + esc(courant.signe_par) : ''}${
                courant.signe_a ? ' le ' + esc(fmtDate(courant.signe_a)) : ''}</span>`
            : '<button type="button" class="btn ghost sm" id="rba-signer-client">Faire signer le client</button>'}
        </div>`)}

      <div class="form-actions">
        ${courant && !courant.signature
          ? `<button type="button" class="btn ghost danger left" id="rba-suppr">${
              confirmerSuppr ? 'Confirmer la suppression' : 'Supprimer ce bon'}</button>`
          : ''}
        <button type="button" class="btn ghost" data-close>Fermer</button>
        <button type="button" class="btn ghost" id="rba-imprimer">Imprimer</button>
        ${/* ⚠ UN BON SANS SES DEUX SIGNATURES NE S'ENVOIE PAS (11/11/2026,
              Élodie : « on doit ne pas pouvoir l'envoyer si le client ne l'a pas
              signé ni l'intervenant »). Ce document ne vaut que par elles : c'est
              la pièce qu'on ressort quand des heures sont contestées, et un
              constat non signé ne constate rien. L'envoyer quand même, c'était
              laisser croire au client que l'affaire était documentée.
              ⚠ L'IMPRESSION, ELLE, RESTE OUVERTE : on imprime justement pour
              faire signer sur papier quand l'écran ne s'y prête pas. */ ''}
        <button type="button" class="btn ghost" id="rba-mail"${pretAEnvoyer ? '' : ' disabled'}
          title="${pretAEnvoyer ? 'Envoyer le bon au client'
            : esc('Il manque ' + manqueSignature)}">Envoyer par mail</button>
        <button type="button" class="btn" id="rba-enregistrer">Enregistrer</button>
      </div>`;
    m.querySelector('.modal-head h2').textContent = titre();
    lier();
  };

  // Redessiner sans faire sauter la fenêtre : elle est longue, et on y revient
  // après avoir ajouté une rangée au milieu.
  const conteneurs = () => [m, m.querySelector('.modal-body'), document.getElementById('modal')].filter(Boolean);
  const redessiner = () => {
    const pos = conteneurs().map(c => c.scrollTop);
    dessine();
    conteneurs().forEach((c, k) => { c.scrollTop = pos[k]; });
  };

  // ------------------------------------------------------------- les gestes
  function lier() {
    // Un champ libre écrit dans la saisie SANS redessiner : on ne perd ni le
    // curseur ni ce qu'on est en train de taper.
    hote.querySelectorAll('[data-cle]').forEach(el => {
      el.oninput = () => { s[el.dataset.cle] = el.value; };
    });

    // ⚠ UN BOUTON, PLUS UNE CASE À COCHER (11/11/2026) : la carte EST le
    // bouton, comme sur la facture. On lit donc l'état dans la saisie, pas
    // dans un `checked` qui n'existe plus.
    hote.querySelectorAll('button[data-groupe]').forEach(el => {
      el.onclick = () => {
        const nom = el.dataset.groupe;
        const code = el.dataset.code;
        const prise = coche(s, nom, code);
        if (GROUPES[nom].mode === 'une') {
          // ⚠ ON PEUT REVENIR À « RIEN COCHÉ » : toucher la carte déjà prise
          // la relâche. Des boutons radio l'auraient interdit — voir l'en-tête.
          s[nom] = prise ? '' : code;
        } else {
          const liste = Array.isArray(s[nom]) ? s[nom].filter(c => c !== code) : [];
          s[nom] = prise ? liste : [...liste, code];
        }
        // ⚠ ON REDESSINE, MAIS SANS BOUGER : une carte prise ouvre son champ de
        // précision sous elle, et les résumés des blocs changent — ça ne se
        // bricole pas à la main sur trois classes. `redessiner()` garde la
        // position de défilement, c'est tout son objet.
        redessiner();
      };
    });

    // ⚠ UN SEUL BLOC OUVERT À LA FOIS, et on retient lequel : sans ça, le
    // premier ajout d'une rangée d'heures refermerait le bloc qu'on remplit.
    // Le navigateur ouvre tout seul ; nous ne faisons que fermer les autres.
    hote.querySelectorAll('details[data-bloc]').forEach(d => {
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        blocOuvert = d.dataset.bloc;
        hote.querySelectorAll('details[data-bloc]').forEach(a => { if (a !== d) a.open = false; });
      });
    });

    const majHeures = () => {
      const t = hote.querySelector('#rba-heures');
      if (t) t.textContent = String(totalHeures(s)).replace('.', ',');
    };
    hote.querySelectorAll('[data-mo]').forEach(el => {
      el.oninput = () => {
        const r = s.mo[Number(el.dataset.mo)];
        if (r) r[el.dataset.col] = el.value;
        if (el.dataset.col === 'duree') majHeures();
      };
    });
    hote.querySelectorAll('[data-four]').forEach(el => {
      const ecrire = () => {
        const i = Number(el.dataset.four);
        s.fournitures[i] = { ...(s.fournitures[i] || {}), [el.dataset.col]: el.value };
      };
      el.oninput = ecrire; el.onchange = ecrire;
    });

    hote.querySelector('#rba-mo-plus').onclick = () => {
      if ((s.mo || []).length >= MAX_MO) { toast(`${MAX_MO} rangées au plus`, 'error'); return; }
      s.mo = [...(s.mo || []), {
        date: '', qui: s.intervenant || '', habilitation: '', arrivee: '', depart: '', pause: '', duree: '',
      }];
      redessiner();
    };
    hote.querySelectorAll('[data-mo-suppr]').forEach(b => {
      b.onclick = () => {
        s.mo = s.mo.filter((_, k) => k !== Number(b.dataset.moSuppr));
        redessiner();
      };
    });
    hote.querySelector('#rba-four-plus').onclick = () => {
      const l = Array.isArray(s.fournitures) ? s.fournitures : [];
      if (l.length >= MAX_FOURNITURES) { toast(`${MAX_FOURNITURES} fournitures au plus`, 'error'); return; }
      s.fournitures = [...l, { designation: '', unite: 'forfait', quantite: '', reference: '', fourni_par: '' }];
      redessiner();
    };
    hote.querySelectorAll('[data-four-suppr]').forEach(b => {
      b.onclick = () => {
        s.fournitures = s.fournitures.filter((_, k) => k !== Number(b.dataset.fourSuppr));
        redessiner();
      };
    });

    const bSigner = hote.querySelector('#rba-signer');
    if (bSigner) bSigner.onclick = () => faireSigner();
    const bSignOff = hote.querySelector('#rba-sign-off');
    if (bSignOff) bSignOff.onclick = () => {
      delete s.signature_rgd; delete s.signature_rgd_le;
      redessiner();
    };
    const bClient = hote.querySelector('#rba-signer-client');
    if (bClient) bClient.onclick = () => faireSignerClient();

    const bSuppr = hote.querySelector('#rba-suppr');
    if (bSuppr) bSuppr.onclick = async () => {
      // ⚠ UN BON SIGNÉ NE S'EFFACE PAS, et le bouton n'existe alors même pas :
      // c'est la pièce qu'on ressort quand des heures sont contestées, et le
      // client l'a reconnue. La base refuse aussi, de son côté.
      if (!confirmerSuppr) { confirmerSuppr = true; redessiner(); return; }
      bSuppr.disabled = true;
      try {
        await supprimerBon(courant);
        toast('Bon d’attachement supprimé');
        closeModal();
      } catch (e) {
        bSuppr.disabled = false; confirmerSuppr = false;
        toast(`Non supprimé — ${String(e.message || e).slice(0, 140)}`, 'error');
        redessiner();
      }
    };
    // ⚠ UN BOUTON QUI ATTEND SE VERROUILLE. Chacun de ces trois-là enregistre
    // d'abord — donc CRÉE le bon s'il n'existe pas. Deux appuis rapprochés,
    // le temps que l'écriture revienne, et c'étaient deux bons : le garde lit
    // le cache, qui n'est pas encore à jour. Sur un téléphone, retoucher
    // pendant l'attente est le geste normal, pas une maladresse.
    const pendant = (bouton, action) => {
      if (!bouton) return;
      const mot = bouton.textContent;
      bouton.onclick = async () => {
        bouton.disabled = true;
        try { await action(); } finally {
          const vivant = hote.contains(bouton);
          if (vivant) { bouton.disabled = false; bouton.textContent = mot; }
        }
      };
    };
    pendant(hote.querySelector('#rba-enregistrer'), async () => {
      if (await enregistrer()) closeModal();
    });
    pendant(hote.querySelector('#rba-imprimer'), async () => {
      if (!await enregistrer()) return;
      (await charger()).imprimerBonAttachement(x, courant, devis);
    });
    pendant(hote.querySelector('#rba-mail'), async () => {
      if (await enregistrer()) ouvrirEnvoi();
    });
  }

  /**
   * ⚠ ON ENREGISTRE AVANT D'IMPRIMER, D'ENVOYER ET DE FAIRE SIGNER. Le PDF se
   * fabrique depuis la ligne EN BASE, pas depuis les champs à l'écran : sans
   * cet enregistrement, on enverrait au client un bon sans ce qu'on vient de
   * saisir, et on ne s'en apercevrait pas.
   *
   * C'est aussi ici que le bon NAÎT, au premier enregistrement.
   */
  async function enregistrer() {
    const bouton = hote.querySelector('#rba-enregistrer');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Enregistrement…'; }
    try {
      // ⚠ ON RELIT AVANT DE CRÉER. Entre l'ouverture de la fenêtre et le
      // premier enregistrement, le bon de cette facture a pu naître
      // ailleurs — l'autre téléphone, l'impression. La base refuse le
      // doublon (un bon par facture), mais mieux vaut rejoindre celui qui
      // existe que montrer une erreur de clé dupliquée.
      if (!courant && devis) courant = bonDuDevis(devis);
      if (!courant) courant = await creerBon(x, devis, s.objet);
      courant = await enregistrerBonAttachement(courant, s);
      return true;
    } catch (e) {
      toast(`Non enregistré — ${String(e.message || e).slice(0, 140)}`, 'error');
      return false;
    } finally {
      if (bouton) { bouton.disabled = false; bouton.textContent = 'Enregistrer'; }
    }
  }

  /**
   * La signature de l'intervenant, au doigt.
   *
   * ⚠ CE N'EST PAS LA SIGNATURE ENREGISTRÉE DE L'ENTREPRISE. Celle-là est
   * apposée d'avance sur les factures ; la poser ici ferait signer un bon de
   * chantier à quelqu'un qui n'y était pas. Celui qui est intervenu signe.
   */
  function faireSigner() {
    posePadSignature(hote, {
      aide: 'Signature de l’intervenant qui a réalisé les travaux. Elle s’imprime sur le bon, '
        + 'en face de celle du client.',
      nom: s.intervenant || nomDuResponsable(courant || devis),
      labelNom: 'Nom de l’intervenant',
      surAnnuler: () => redessiner(),
      surValider: ({ image, nom }) => {
        s.signature_rgd = image;
        s.signature_rgd_le = new Date().toISOString();
        if (nom) s.intervenant = nom;
        redessiner();
      },
    });
  }

  /**
   * La signature du CLIENT, sur place, à la fin de l'intervention.
   *
   * ⚠ ELLE SE FAIT DEPUIS CE FORMULAIRE DEPUIS LE 02/11/2026. Elle ne vivait
   * que dans la fenêtre de la facture : un bon sans facture n'aurait jamais pu
   * être signé, c'est-à-dire n'aurait servi à rien.
   *
   * ⚠ ET ON ENREGISTRE AVANT DE TENDRE LE TÉLÉPHONE : le client doit signer ce
   * qui est écrit, pas une version d'il y a dix minutes.
   */
  function faireSignerClient() {
    posePadSignature(hote, {
      aide: 'Signature de <b>' + esc(x.nom || 'la personne présente') + '</b> sur le '
        + '<b>bon d’attachement</b>. Signer vaut reconnaissance des temps passés et des '
        + 'fournitures posées.',
      nom: x.nom || '',
      surAnnuler: () => redessiner(),
      surValider: async ({ image, nom }) => {
        if (!await enregistrer()) return;
        courant = await signerBonAttachement(courant, { signature: image, nom });
        toast('Bon d’attachement signé');
        redessiner();
      },
    });
  }

  /**
   * L'envoi, dans la même fenêtre — comme pour la facture.
   *
   * ⚠ LE MAIL NE PARLE PAS D'ARGENT, et le texte par défaut le dit
   * explicitement. Voir `messageBonAttachement` : un bon qui annoncerait un
   * montant serait lu comme une seconde facture.
   */
  async function ouvrirEnvoi() {
    const d = (await charger()).donneesDocument(x);
    const sujet = `Votre bon d’attachement RGD Renova n° ${numeroBon(courant)}`;
    m.querySelector('.modal-head h2').textContent = `Envoyer le bon ${numeroBon(courant)}`;
    hote.innerHTML = `
      <p class="rdc-aide">Le bon part en <b>pièce jointe PDF</b>, depuis contact@rgdrenova.fr.
      La réponse du client arrive à la même adresse.</p>
      <div class="form">
        <div class="field"><label>Destinataire</label>
          <input id="rba-a" type="email" value="${esc(d.email || '')}" placeholder="adresse@client.fr" required></div>
        <div class="field"><label>Objet</label>
          <input id="rba-objet" value="${esc(sujet)}"></div>
        <div class="field"><label>Message</label>
          <textarea id="rba-message" rows="11">${esc(messageBonAttachement(courant, devis, d.nom))}</textarea></div>
        <div class="field"><label class="check"><input type="checkbox" id="rba-copie" checked> Garder une copie à contact@rgdrenova.fr</label></div>
      </div>
      <p class="small muted">Pièce jointe : <b>Bon d’attachement ${esc(numeroBon(courant))}</b> — recto et verso.
      ${courant?.signature ? 'Il porte la signature du client.' : '<b>Le client ne l’a pas encore signé.</b>'}</p>
      <div class="form-actions">
        <button type="button" class="btn ghost" id="rba-retour">← Retour au bon</button>
        <button type="button" class="btn" id="rba-envoyer">Envoyer</button>
      </div>`;
    // ⚠ PAS DE CURSEUR D'OFFICE AU DOIGT (12/11/2026, Élodie : « quand on va pour
    // envoyer, je ne veux pas que le clavier apparaisse, sinon on ne voit pas
    // les boutons retour et envoyer »). L'adresse est déjà remplie ; on touche
    // le champ si on veut la changer. À la souris, le curseur y va toujours.
    if (!matchMedia('(pointer: coarse)').matches) hote.querySelector('#rba-a').focus();
    hote.querySelector('#rba-retour').onclick = () => redessiner();
    const bouton = hote.querySelector('#rba-envoyer');
    bouton.onclick = async () => {
      const a = hote.querySelector('#rba-a').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { toast('Adresse mail du client invalide', 'error'); return; }
      bouton.disabled = true; bouton.textContent = 'Envoi…';
      try {
        const pdf = await (await charger()).pdfBonAttachement(x, courant, devis);
        const r = await envoyerBonAttachement(courant, {
          a, nom: d.nom,
          objet: hote.querySelector('#rba-objet').value.trim() || sujet,
          message: hote.querySelector('#rba-message').value,
          copie: hote.querySelector('#rba-copie').checked,
        }, pdf);
        if (!r.ok) throw new Error(r.motif);
        toast(`Bon d’attachement ${numeroBon(courant)} envoyé à ${a}`);
        // ⚠ LE PARCOURS NE S'ARRÊTAIT PAS LÀ, IL S'INTERROMPAIT (11/11/2026,
        // Élodie : « une fois que le bon d'attachement est envoyé, il se passe
        // quoi après ??? Il faut l'encaissement »). La fenêtre se fermait sur
        // une facture encore due, et plus rien ne demandait jamais comment le
        // client avait payé. On enchaîne donc ici, là où Franck est encore chez
        // lui — et « Plus tard » reste une réponse.
        const { proposerEncaissement } = await import('./rgd-encaissement.js');
        proposerEncaissement(x, devis, retour);
      } catch (e) {
        bouton.disabled = false; bouton.textContent = 'Envoyer';
        toast(`Non envoyé — ${String(e.message || e).slice(0, 140)}`, 'error');
      }
    };
  }

  // Le pré-remplissage demande les données du dossier (le code postal du
  // chantier) : on charge le module des documents avant de dessiner.
  charger().then((mod) => {
    s = saisieDepart({ bon: courant, devis, d: mod.donneesDocument(x) });
    dessine();
  }).catch((e) => {
    hote.innerHTML = `<p class="empty">Bon d’attachement indisponible — ${esc(String(e.message || e))}</p>`;
  });
}
