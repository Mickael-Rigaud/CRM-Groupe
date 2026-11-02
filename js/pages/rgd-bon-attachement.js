// Remplir le bon d'attachement à l'écran, et l'envoyer au client (02/11/2026)
//
// Élodie : « je voudrais pouvoir remplir directement depuis l'interface pour
// pouvoir l'envoyer aussi par mail au client ». Le document existait, mais
// sorti À IMPRIMER : ce qu'on constate sur place — heures, contrôles,
// anomalies — s'écrivait au stylo. Un bon envoyé par mail ne peut pas avoir de
// blancs.
//
// ⚠ LES CASES NE SONT PAS ÉCRITES ICI, elles viennent de `GROUPES` dans
// `data/rgd-bon-attachement.js`, que le PDF lit aussi. Voir l'en-tête de ce
// fichier : une case ajoutée d'un seul côté, c'est une observation saisie qui
// n'arrive jamais chez le client.
//
// ⚠ UN SEUL CHOIX SE DÉCOCHE, ET C'EST POUR ÇA QUE TOUT EST EN CASES. Les
// choix uniques auraient pu être des boutons radio : une fois l'un coché, on
// ne peut plus revenir à « rien ». Sur un document qui atteste, se tromper de
// case et ne plus pouvoir l'enlever est pire que de n'avoir rien coché. Les
// cases d'un groupe à choix unique se vident donc les unes les autres, en JS.
//
// ⚠ IL SE REMPLIT APRÈS LA SIGNATURE DE LA FACTURE, et c'est le cas NORMAL :
// on facture à la fin de l'intervention, puis on constate ce qui a été fait.
// L'écriture ne porte que sur `bon_saisie` — voir `enregistrerBonAttachement`,
// qui explique pourquoi envoyer la facture entière la ferait refuser.
import { esc, openModal, closeModal, toast } from '../ui.js';
import { posePadSignature } from '../pad-signature.js';
import {
  GROUPES, COLONNES_MO, FOURNI_PAR, coche, saisieDepart, numeroBon,
  enregistrerBonAttachement, lignesFourniture, totalHeures,
  messageBonAttachement, nomDuResponsable,
} from '../data/rgd-bon-attachement.js';
import { envoyerBonAttachement } from '../data/rgd-devis-crm.js';

const MAX_MO = 12;

export function ouvrirBonAttachement(x, devis, retour = null) {
  let courant = devis;
  let s = null;        // la saisie en cours, jamais écrite tant qu'on n'enregistre pas
  let docs = null;     // `rgd-documents.js`, chargé à la demande

  const m = openModal(`Bon d’attachement ${numeroBon(devis)}`,
    '<div id="rba" class="rba"></div>', { wide: true, onClose: () => retour?.() });
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

  // `titre: false` quand le titre de section dit deja la meme chose : le lire
  // deux fois de suite fait chercher la difference entre les deux.
  const groupe = (nom, { titre = true } = {}) => {
    const g = GROUPES[nom];
    return `<div class="field">${titre ? `<label>${esc(g.titre)}${g.mode === 'plusieurs' ? ' <span class="muted small">(plusieurs possibles)</span>' : ''}</label>` : ''}
      <div class="checks">${g.options.map(o => `<label class="check">
        <input type="checkbox" data-groupe="${nom}" data-code="${o.c}" ${coche(s, nom, o.c) ? 'checked' : ''}>
        <span>${esc(o.l)}</span>
        ${o.aussi ? `<input class="rba-aussi" data-cle="${o.aussi}" value="${esc(s[o.aussi] ?? '')}"
          placeholder="${esc(o.unite || 'à préciser')}" autocomplete="off">${o.unite ? ` <span class="muted small">${esc(o.unite)}</span>` : ''}` : ''}
      </label>`).join('')}</div></div>`;
  };

  const rangeeMo = (r, i) => `<div class="rba-rangee">
    <div class="mf-grille mf-grille-serree">
      ${COLONNES_MO.map(c => `<label class="mail-champ">${esc(c.l)}
        <input data-mo="${i}" data-col="${c.c}" ${c.type ? `type="${c.type}"` : ''}
          ${c.num ? 'inputmode="decimal"' : ''} value="${esc(r[c.c] ?? '')}" autocomplete="off"></label>`).join('')}
    </div>
    ${(s.mo || []).length > 1 ? `<button type="button" class="btn ghost sm" data-mo-suppr="${i}">Retirer cette rangée</button>` : ''}
  </div>`;

  const blocFournitures = () => {
    const l = lignesFourniture(courant);
    if (!l.length) {
      return '<p class="small muted">Aucune fourniture sur cette facture : elle ne porte que de la main-d’œuvre.</p>';
    }
    return `<p class="small muted">Les désignations et les quantités viennent de la facture.
      Ici, on ajoute ce qu’elle ne sait pas : la marque exacte et qui a fourni.</p>
      ${l.map((ligne, i) => {
        const f = (s.fournitures && s.fournitures[i]) || {};
        return `<div class="rba-rangee">
          <div class="rba-titre-rangee">${esc(ligne.libelle || 'Ligne')}${ligne.variante ? ' — ' + esc(ligne.variante) : ''}
            <span class="muted small">${esc(String(ligne.quantite ?? '').replace('.', ','))} ${esc(ligne.unite === 'forfait' ? 'u' : ligne.unite || '')}</span></div>
          <div class="mf-grille mf-grille-serree">
            <label class="mail-champ">Marque / référence
              <input data-four="${i}" data-col="reference" value="${esc(f.reference ?? '')}" autocomplete="off"></label>
            <label class="mail-champ">Fourni par
              <select data-four="${i}" data-col="fourni_par">
                <option value="">—</option>
                ${FOURNI_PAR.map(o => `<option value="${esc(o.c)}" ${f.fourni_par === o.c ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
              </select></label>
          </div>
        </div>`;
      }).join('')}`;
  };

  const dessine = () => {
    const heures = totalHeures(s);
    hote.innerHTML = `
      <p class="rdc-aide">Ce bon constate les <b>temps passés</b> et les <b>fournitures posées</b>.
      Il accompagne la facture ${esc(courant.numero || '')} et ne réclame aucun règlement.
      Ce qui reste vide reste vide sur le PDF : rien n’est coché à votre place.</p>

      <h4 class="rba-section">Client et lieu d’intervention</h4>
      <div class="mf-grille">
        ${champ('lieu_cp_ville', 'Code postal / ville')}
        ${champ('lieu_batiment', 'Bât. / étage / lot')}
        ${champ('lieu_acces', 'Accès / code')}
        ${champ('lieu_contact', 'Contact sur place')}
      </div>
      ${groupe('client_type')}
      ${groupe('lieu_type')}

      <h4 class="rba-section">Nature de l’intervention</h4>
      ${groupe('nature', { titre: false })}
      ${groupe('regime')}

      <h4 class="rba-section">Constat et travaux réalisés</h4>
      <div class="mf-grille">
        ${zone('constat', 'Ce qui a été constaté et fait', { lignes: 4, aide: 'Une ligne par observation : elles s’impriment ligne par ligne.' })}
      </div>

      <h4 class="rba-section">Main-d’œuvre <span class="muted small">— total ${esc(String(heures).replace('.', ','))} h</span></h4>
      <div id="rba-mo">${(s.mo || []).map(rangeeMo).join('')}</div>
      <button type="button" class="btn ghost sm" id="rba-mo-plus">+ Une rangée d’heures</button>
      ${groupe('deplacement')}
      <div class="mf-grille">${champ('deplacement_nb', 'Nombre de déplacements')}</div>

      <h4 class="rba-section">Fournitures posées</h4>
      ${blocFournitures()}
      ${groupe('materiel')}

      <h4 class="rba-section">Contrôles avant remise sous tension</h4>
      ${groupe('controles', { titre: false })}
      ${groupe('sous_tension')}

      <h4 class="rba-section">Anomalies et suite à donner</h4>
      <div class="mf-grille">
        ${zone('anomalies', 'Anomalies constatées hors intervention', { lignes: 2, aide: 'Ce qui est signalé ici et non traité reste sous la responsabilité du client.' })}
      </div>
      ${groupe('suite')}
      ${groupe('reception')}

      <h4 class="rba-section">Signatures</h4>
      <div class="mf-grille">${champ('intervenant', 'Intervenant RGD Renova', { aide: 'Le nom qui s’imprime sous la signature.' })}</div>
      <div class="rdc-statut"><span class="muted small">Intervenant</span>
        ${s.signature_rgd
          ? `<span class="chip green">Signé</span>
             <button type="button" class="btn ghost sm" id="rba-sign-off">Retirer la signature</button>`
          : '<button type="button" class="btn ghost sm" id="rba-signer">Signer</button>'}
      </div>
      <div class="rdc-statut"><span class="muted small">Client</span>
        ${courant.bon_signature
          ? `<span class="chip green">Signé${courant.bon_signe_par ? ' par ' + esc(courant.bon_signe_par) : ''}</span>`
          : '<span class="muted small">Pas encore signé — le client signe depuis la facture, sur place.</span>'}
      </div>

      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Fermer</button>
        <button type="button" class="btn ghost" id="rba-imprimer">Imprimer</button>
        <button type="button" class="btn ghost" id="rba-mail">Envoyer par mail</button>
        <button type="button" class="btn" id="rba-enregistrer">Enregistrer</button>
      </div>`;
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

    hote.querySelectorAll('[data-groupe]').forEach(el => {
      el.onchange = () => {
        const nom = el.dataset.groupe;
        const code = el.dataset.code;
        if (GROUPES[nom].mode === 'une') {
          // ⚠ ON DÉCOCHE LES AUTRES À LA MAIN. Avec des boutons radio, le
          // navigateur l'aurait fait — mais on ne pourrait plus revenir à
          // « rien coché » (voir l'en-tête).
          s[nom] = el.checked ? code : '';
          hote.querySelectorAll(`[data-groupe="${nom}"]`).forEach(a => {
            if (a !== el) a.checked = false;
          });
        } else {
          const liste = Array.isArray(s[nom]) ? s[nom].filter(c => c !== code) : [];
          s[nom] = el.checked ? [...liste, code] : liste;
        }
      };
    });

    hote.querySelectorAll('[data-mo]').forEach(el => {
      el.oninput = () => {
        const r = s.mo[Number(el.dataset.mo)];
        if (r) r[el.dataset.col] = el.value;
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

    const bSigner = hote.querySelector('#rba-signer');
    if (bSigner) bSigner.onclick = () => faireSigner();
    const bSignOff = hote.querySelector('#rba-sign-off');
    if (bSignOff) bSignOff.onclick = () => {
      delete s.signature_rgd; delete s.signature_rgd_le;
      redessiner();
    };

    hote.querySelector('#rba-enregistrer').onclick = async () => {
      if (await enregistrer()) { closeModal(); }
    };
    hote.querySelector('#rba-imprimer').onclick = async () => {
      if (!await enregistrer()) return;
      (await charger()).imprimerBonAttachement(x, courant);
    };
    hote.querySelector('#rba-mail').onclick = async () => {
      if (await enregistrer()) ouvrirEnvoi();
    };
  }

  /**
   * ⚠ ON ENREGISTRE AVANT D'IMPRIMER ET AVANT D'ENVOYER. Le PDF se fabrique
   * depuis la ligne EN BASE, pas depuis les champs à l'écran : sans cet
   * enregistrement, on enverrait au client un bon sans ce qu'on vient de
   * saisir, et on ne s'en apercevrait pas.
   */
  async function enregistrer() {
    const bouton = hote.querySelector('#rba-enregistrer');
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Enregistrement…'; }
    try {
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
      nom: s.intervenant || nomDuResponsable(courant),
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
          <textarea id="rba-message" rows="11">${esc(messageBonAttachement(courant, d.nom))}</textarea></div>
        <div class="field"><label class="check"><input type="checkbox" id="rba-copie" checked> Garder une copie à contact@rgdrenova.fr</label></div>
      </div>
      <p class="small muted">Pièce jointe : <b>Bon d’attachement ${esc(numeroBon(courant))}</b> — recto et verso.
      ${courant.bon_signature ? 'Il porte la signature du client.' : '<b>Le client ne l’a pas encore signé.</b>'}</p>
      <div class="form-actions">
        <button type="button" class="btn ghost" id="rba-retour">← Retour au bon</button>
        <button type="button" class="btn" id="rba-envoyer">Envoyer</button>
      </div>`;
    hote.querySelector('#rba-a').focus();
    hote.querySelector('#rba-retour').onclick = () => {
      m.querySelector('.modal-head h2').textContent = `Bon d’attachement ${numeroBon(courant)}`;
      redessiner();
    };
    const bouton = hote.querySelector('#rba-envoyer');
    bouton.onclick = async () => {
      const a = hote.querySelector('#rba-a').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { toast('Adresse mail du client invalide', 'error'); return; }
      bouton.disabled = true; bouton.textContent = 'Envoi…';
      try {
        const pdf = await (await charger()).pdfBonAttachement(x, courant);
        const r = await envoyerBonAttachement(courant, {
          a, nom: d.nom,
          objet: hote.querySelector('#rba-objet').value.trim() || sujet,
          message: hote.querySelector('#rba-message').value,
          copie: hote.querySelector('#rba-copie').checked,
        }, pdf);
        if (!r.ok) throw new Error(r.motif);
        toast(`Bon d’attachement ${numeroBon(courant)} envoyé à ${a}`);
        closeModal();
      } catch (e) {
        bouton.disabled = false; bouton.textContent = 'Envoyer';
        toast(`Non envoyé — ${String(e.message || e).slice(0, 140)}`, 'error');
      }
    };
  }

  // Le pré-remplissage demande les données du dossier (le code postal du
  // chantier) : on charge le module des documents avant de dessiner.
  charger().then((mod) => {
    s = saisieDepart(courant, mod.donneesDocument(x), courant.bon_saisie);
    dessine();
  }).catch((e) => {
    hote.innerHTML = `<p class="empty">Bon d’attachement indisponible — ${esc(String(e.message || e))}</p>`;
  });
}
