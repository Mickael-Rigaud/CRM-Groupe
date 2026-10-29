// Faire un devis depuis la fiche RGD, avec la grille des tarifs (29/10/2026)
//
// Demandé par Élodie pour Franck : choisir les prestations dans la grille,
// les quantités, et sortir un devis numéroté en PDF. Voir l'en-tête de
// `data/rgd-devis-crm.js` pour ce qui est calculé où et pourquoi ces devis ne
// sont pas ceux de Costructor.
//
// CE QUE LA GRILLE IMPOSE À L'ÉCRAN
//   — un prix « Dès » se monte, il ne se baisse pas : le champ refuse moins
//     que le plancher, et le dit ;
//   — une prestation à variantes (le tableau en 1, 2 ou 3 rangées) porte un
//     choix, qui pose son prix ;
//   — un prix au m² part de la superficie de la fiche ;
//   — le diagnostic appelle la main-d'œuvre à l'heure (`ajoute_aussi`), qu'on
//     ajoute une fois, pas à chaque clic.
//
// ⚠ PAS DE `confirm()` ICI : il ouvre sa propre fenêtre et ferme celle du
// devis, avec tout ce qui était saisi. La suppression se confirme par un
// second clic sur le même bouton.
import { esc, eur, toast, openModal, closeModal, fmtDate } from '../ui.js';
import { scope } from '../data/scope.js';
import { valeursProjet } from '../data/rgd-projet.js';
import {
  TVA, TVA_DEFAUT, STATUTS_DEVIS_CRM, UNITES, PAR_UNITE, nomMetier, tarifsDe, metiersAvecGrille,
  totaux, plancher, ligneDepuisTarif, parCategorie, messageDevisCrm, envoyerDevisCrm, enregistrerDevisCrm, changerStatutDevisCrm, supprimerDevisCrm,
} from '../data/rgd-devis-crm.js';

const euros = (n) => eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Le bloc de la fiche : les devis du CRM et le bouton pour en faire un. */
export function blocDevisCrm(devis, peutFaire) {
  if (!devis.length && !peutFaire) return '';
  return `<section class="rgdf-bloc rdc-bloc">
    <h3>Devis du CRM ${devis.length ? `<span class="rgdf-compte">${devis.length}</span>` : ''}
      ${peutFaire ? '<button type="button" class="btn sm rdc-nouveau" id="rdc-nouveau">+ Faire un devis</button>' : ''}</h3>
    ${devis.length ? `<div class="rgdf-tableau"><table><tbody>
      ${devis.map(v => { const e = STATUTS_DEVIS_CRM[v.statut] || STATUTS_DEVIS_CRM.brouillon;
        return `<tr class="rdc-ligne" data-devis-crm="${esc(v.id)}" tabindex="0">
          <td><b>${esc(v.numero || '—')}</b>
            <div class="s muted">${esc(v.objet || nomMetier(v.metier))} · ${esc(fmtDate(v.date_devis || v.created_at))}</div></td>
          <td class="num">${euros(v.montant_ttc)} <span class="s muted">TTC</span></td>
          <td class="rgdf-fin"><span class="chip ${e.ton}">${esc(e.label)}</span></td>
        </tr>`; }).join('')}
    </tbody></table></div>`
    : '<p class="rgdf-rien">Aucun devis fait dans le CRM pour ce dossier.</p>'}
  </section>`;
}

/**
 * La fenêtre du devis. `retour` est rappelé à la fermeture, quelle qu'en soit
 * la cause : la fiche se redessine derrière (même règle que « Modifier »).
 *
 * ⚠ ON SAISIT LÀ OÙ L'ON CHOISIT (29/10/2026, Élodie : « pas du tout
 * intuitif… quand on sélectionne un élément je voudrais que l'on voit
 * directement qu'il est sélectionné et pouvoir remplir directement les
 * informations pour ne pas avoir à descendre la page »). La première version
 * posait la grille en haut et un tableau des lignes en bas : un clic ajoutait
 * une ligne hors de la vue, sans que le bouton ne change. Désormais chaque
 * prestation est une rangée qui se coche ; cochée, elle s'ouvre sur place avec
 * sa quantité, son prix et sa précision. Le total reste collé en bas.
 *
 * ⚠ RE-TOUCHER UNE RANGÉE COCHÉE NE LA DÉCOCHE PAS : on y perdrait ce qu'on
 * vient de taper. On la retire par son bouton « Retirer ».
 */
export function ouvrirDevisCrm(x, existant = null, retour = null) {
  const metiers = metiersAvecGrille();
  if (!existant && !metiers.length) { toast('Aucune grille de tarifs n’est en place', 'error'); return; }
  const surface = Number(valeursProjet(x).superficie) || null;
  const signe = existant?.statut === 'signe';
  const etat = {
    metier: existant?.metier || metiers[0],
    objet: existant?.objet || '',
    tva_taux: existant ? Number(existant.tva_taux) : TVA_DEFAUT,
    validite_jours: existant?.validite_jours || 30,
    notes: existant?.notes || '',
    lignes: structuredClone(existant?.lignes || []),
  };
  let confirmerSuppr = false;

  const titre = existant ? `Devis ${existant.numero || ''}` : `Nouveau devis${x.nom ? ' — ' + x.nom : ''}`;
  const m = openModal(titre, '<div id="rdc-hote" class="rdc"></div>', { wide: true, onClose: () => retour?.() });
  const hote = m.querySelector('#rdc-hote');

  const totalLigne = (l) => (Number(l.quantite) || 0) * (Number(l.prix_ht) || 0);
  const dis = signe ? 'disabled' : '';

  // Les champs d'une ligne, sous la prestation cochée. Une ligne libre porte
  // en plus sa désignation, qu'aucune grille ne lui donne.
  const saisie = (l, i, libre) => {
    const t = l.code ? tarifsDe(l.metier || etat.metier).find(g => g.code === l.code) : null;
    const variantes = t?.variantes || [];
    const mini = plancher(l);
    return `<div class="rdc-saisie" data-i="${i}">
      ${libre ? `<label class="rdc-champ rdc-large"><span>Désignation</span>
        <input data-champ="libelle" value="${esc(l.libelle)}" ${dis}></label>` : ''}
      ${variantes.length ? `<label class="rdc-champ"><span>Choix</span>
        <select data-champ="variante" ${dis}>${variantes.map(v => `<option value="${esc(v.libelle)}" ${v.libelle === l.variante ? 'selected' : ''}>${esc(v.libelle)} — ${euros(v.prix_ht)}</option>`).join('')}</select></label>` : ''}
      <label class="rdc-champ rdc-court"><span>Quantité</span>
        <span class="rdc-unite"><input type="number" inputmode="decimal" min="0" step="${l.unite === 'forfait' ? '1' : '0.5'}" data-champ="quantite" value="${esc(l.quantite)}" ${dis}><i>${esc(UNITES[l.unite] || '')}</i></span></label>
      <label class="rdc-champ rdc-court"><span>Prix unitaire HT</span>
        <span class="rdc-unite"><input type="number" inputmode="decimal" min="${mini}" step="1" data-champ="prix_ht" value="${esc(l.prix_ht)}" ${dis}><i>€</i></span>
        ${mini && t?.a_partir_de ? `<small class="rdc-plancher ${Number(l.prix_ht) < mini ? 'rdc-alerte' : ''}">minimum ${euros(mini)}</small>` : ''}</label>
      <label class="rdc-champ rdc-large"><span>Précision, imprimée sur le devis</span>
        <input data-champ="precision" value="${esc(l.precision || '')}" placeholder="Facultatif : pièce, détail…" ${dis}></label>
      <div class="rdc-champ rdc-court rdc-sous"><span>Total HT</span><b class="rdc-total">${euros(totalLigne(l))}</b></div>
      ${signe ? '' : `<button type="button" class="btn ghost sm rdc-retirer" data-retirer="${i}">Retirer</button>`}
    </div>`;
  };

  const dessine = () => {
    const t = totaux(etat.lignes, etat.tva_taux);
    const grille = tarifsDe(etat.metier);
    const codesGrille = new Set(grille.map(g => g.code));
    // Les lignes par prestation, avec leur index réel dans `etat.lignes`.
    const lignesDe = (code) => etat.lignes.map((l, i) => ({ l, i })).filter(({ l }) => l.code === code);
    const horsGrille = etat.lignes.map((l, i) => ({ l, i })).filter(({ l }) => !l.code || !codesGrille.has(l.code));
    const nbChoisies = etat.lignes.length;

    const familles = parCategorie(grille, g => g.categorie).map(({ categorie, items }) => {
      const rangées = items.map(({ item: g }) => {
        const siennes = lignesDe(g.code);
        const choisie = siennes.length > 0;
        if (signe && !choisie) return '';
        return `<div class="rdc-presta ${choisie ? 'est-choisie' : ''}">
          <button type="button" class="rdc-presta-tete" data-tarif="${esc(g.code)}" aria-pressed="${choisie}" ${signe ? 'disabled' : ''}>
            <span class="rdc-coche" aria-hidden="true">${choisie ? '✓' : '+'}</span>
            <span class="rdc-presta-nom">${g.reference ? `<small>${esc(g.reference)}</small>` : ''}${esc(g.libelle)}</span>
            <b class="rdc-presta-prix">${g.a_partir_de ? 'dès ' : ''}${euros(g.prix_ht)}${PAR_UNITE[g.unite] || ''}</b>
          </button>
          ${siennes.map(({ l, i }) => saisie(l, i, false)).join('')}
        </div>`;
      }).join('');
      if (!rangées.trim()) return '';
      const n = items.filter(({ item: g }) => lignesDe(g.code).length).length;
      return `<section class="rdc-famille">
        <h4 class="rdc-cat">${esc(categorie)}${n ? `<span class="rdc-compte">${n} choisie${n > 1 ? 's' : ''}</span>` : ''}</h4>
        ${rangées}
      </section>`;
    }).join('');

    hote.innerHTML = `
      ${signe ? '<p class="rdc-note">Ce devis est signé : son contenu ne se modifie plus. Seul son statut peut encore changer.</p>'
        : '<p class="rdc-aide"><b>1.</b> Touchez les prestations à facturer <b>2.</b> Réglez quantité et prix juste en dessous <b>3.</b> Enregistrez ou sortez le PDF, en bas</p>'}
      <div class="form rdc-entete">
        <div class="field"><label>Objet du devis</label>
          <input id="rdc-objet" value="${esc(etat.objet)}" placeholder="Dépannage électrique, mise aux normes du tableau…" ${dis}></div>
        ${metiers.length > 1 && !existant ? `<div class="field half"><label>Grille</label>
          <select id="rdc-metier">${metiers.map(k => `<option value="${esc(k)}" ${k === etat.metier ? 'selected' : ''}>${esc(nomMetier(k))}</option>`).join('')}</select></div>` : ''}
        <div class="field half"><label>TVA</label>
          <select id="rdc-tva" ${dis}>${TVA.map(v => `<option value="${v}" ${v === etat.tva_taux ? 'selected' : ''}>${String(v).replace('.', ',')} %${v === 10 ? ' — logement de plus de 2 ans' : v === 20 ? ' — neuf ou local professionnel' : ' — rénovation énergétique'}</option>`).join('')}</select></div>
        <div class="field half"><label>Validité</label>
          <select id="rdc-validite" ${dis}>${[15, 30, 60, 90].map(j => `<option value="${j}" ${j === Number(etat.validite_jours) ? 'selected' : ''}>${j} jours</option>`).join('')}</select></div>
      </div>

      ${familles}

      ${horsGrille.length || !signe ? `<section class="rdc-famille">
        <h4 class="rdc-cat">Hors grille${horsGrille.length ? `<span class="rdc-compte">${horsGrille.length}</span>` : ''}</h4>
        ${horsGrille.map(({ l, i }) => `<div class="rdc-presta est-choisie">
          <div class="rdc-presta-tete est-fixe"><span class="rdc-coche" aria-hidden="true">✓</span>
            <span class="rdc-presta-nom">${esc(l.libelle || 'Ligne libre')}</span></div>
          ${saisie(l, i, true)}
        </div>`).join('')}
        ${signe ? '' : '<button type="button" class="rdc-presta-tete rdc-libre" data-tarif=""><span class="rdc-coche" aria-hidden="true">+</span><span class="rdc-presta-nom">Ajouter une ligne libre (fournitures, prestation hors grille…)</span></button>'}
      </section>` : ''}

      <div class="form"><div class="field"><label>Remarques — imprimées sur le devis</label>
        <textarea id="rdc-notes" rows="2" placeholder="Délai d’intervention, fournitures comprises…" ${dis}>${esc(etat.notes)}</textarea></div></div>

      ${existant ? `<div class="rdc-statut"><span class="muted small">Statut</span>
        ${Object.entries(STATUTS_DEVIS_CRM).map(([k, s]) => `<button type="button" class="chip ${k === existant.statut ? s.ton : ''}" data-statut="${k}">${esc(s.label)}</button>`).join('')}
        ${existant.statut === 'brouillon' ? `<button type="button" class="btn ghost sm rdc-suppr" id="rdc-suppr">${confirmerSuppr ? 'Confirmer la suppression' : 'Supprimer le brouillon'}</button>` : ''}
      </div>` : ''}

      <div class="rdc-pied">
        <div class="rdc-totaux">
          <span class="rdc-nb">${nbChoisies} ligne${nbChoisies > 1 ? 's' : ''}</span>
          <span>HT <b data-total="ht">${euros(t.ht)}</b></span>
          <span>TVA ${String(etat.tva_taux).replace('.', ',')} % <b data-total="tva">${euros(t.tva)}</b></span>
          <span class="rdc-ttc">TTC <b data-total="ttc">${euros(t.ttc)}</b></span>
        </div>
        <div class="rdc-boutons">
          <button type="button" class="btn ghost" data-close>Fermer</button>
          ${signe ? '' : '<button type="button" class="btn ghost" id="rdc-enregistrer">Enregistrer</button>'}
          <button type="button" class="btn ghost" id="rdc-mail">Envoyer par mail</button>
          <button type="button" class="btn" id="rdc-pdf">${signe ? 'Imprimer le PDF' : 'Enregistrer et PDF'}</button>
        </div>
      </div>`;
    lier();
  };

  // Redessiner sans faire sauter la page : la fenêtre garde sa position.
  const conteneurs = () => [m, m.querySelector('.modal-body'), document.getElementById('modal')].filter(Boolean);
  const redessiner = (puis) => {
    const pos = conteneurs().map(c => c.scrollTop);
    dessine();
    conteneurs().forEach((c, k) => { c.scrollTop = pos[k]; });
    puis?.();
  };

  // Ce qui est dans les champs passe dans `etat` sans redessiner : on ne perd
  // ni le curseur ni ce qu'on est en train de taper.
  const lire = () => {
    etat.objet = hote.querySelector('#rdc-objet')?.value ?? etat.objet;
    etat.notes = hote.querySelector('#rdc-notes')?.value ?? etat.notes;
  };

  const majTotaux = () => {
    const t = totaux(etat.lignes, etat.tva_taux);
    hote.querySelector('[data-total="ht"]').textContent = euros(t.ht);
    hote.querySelector('[data-total="tva"]').textContent = euros(t.tva);
    hote.querySelector('[data-total="ttc"]').textContent = euros(t.ttc);
  };

  // On met le curseur dans la quantité de ce qu'on vient d'ajouter : c'est
  // le prochain geste, et il est sous les yeux.
  const viser = (i) => {
    const champ = hote.querySelector(`.rdc-saisie[data-i="${i}"] [data-champ="${etat.lignes[i]?.code ? 'quantite' : 'libelle'}"]`);
    if (!champ) return;
    champ.focus({ preventScroll: true });
    if (champ.select) champ.select();
    // ⚠ PAS DE `scrollIntoView` : il ignore le pied collant, et la rangée
    // ouverte finissait dessous (mesuré : 85 px masqués). On fait défiler la
    // fenêtre juste de quoi la montrer au-dessus du pied.
    const rangee = champ.closest('.rdc-presta');
    const pied = hote.querySelector('.rdc-pied');
    // Ce qui défile n'est pas le même partout : le fond de la fenêtre sur
    // ordinateur, son corps sur téléphone (mobile.css). On prend le premier
    // parent qui défile vraiment.
    let defile = rangee?.parentElement;
    while (defile && !(/(auto|scroll)/.test(getComputedStyle(defile).overflowY) && defile.scrollHeight > defile.clientHeight)) defile = defile.parentElement;
    if (!rangee || !pied || !defile) return;
    const bas = rangee.getBoundingClientRect().bottom - pied.getBoundingClientRect().top + 12;
    const haut = rangee.getBoundingClientRect().top - defile.getBoundingClientRect().top - 12;
    if (bas > 0) defile.scrollTop += Math.min(bas, Math.max(0, haut));
  };

  const ajouter = (code) => {
    lire();
    if (!code) {
      etat.lignes.push({ code: null, metier: null, libelle: '', precision: '', variante: null, unite: 'forfait', quantite: 1, prix_ht: 0 });
      const i = etat.lignes.length - 1;
      return redessiner(() => viser(i));
    }
    const existante = etat.lignes.findIndex(l => l.code === code);
    if (existante >= 0) return viser(existante);
    const grille = tarifsDe(etat.metier);
    const t = grille.find(g => g.code === code);
    if (!t) return;
    etat.lignes.push(ligneDepuisTarif(t, { surface }));
    const i = etat.lignes.length - 1;
    for (const autre of t.ajoute_aussi || []) {
      const a = grille.find(g => g.code === autre);
      if (a && !etat.lignes.some(l => l.code === autre)) etat.lignes.push(ligneDepuisTarif(a, { surface }));
    }
    redessiner(() => viser(i));
  };

  const verifier = () => {
    lire();
    if (!etat.lignes.length) return 'Choisissez au moins une prestation';
    for (const l of etat.lignes) {
      if (!String(l.libelle || '').trim()) return 'Une ligne libre n’a pas de désignation';
      if (!(Number(l.quantite) > 0)) return `« ${l.libelle} » : la quantité doit être supérieure à zéro`;
      const mini = plancher(l);
      if (mini && Number(l.prix_ht) < mini) return `« ${l.libelle} » : la grille ne descend pas sous ${euros(mini)} HT`;
    }
    return null;
  };

  const enregistrer = async () => {
    const motif = verifier();
    if (motif) { toast(motif, 'error'); return null; }
    try {
      const d = await enregistrerDevisCrm(x, etat, existant);
      existant = d;
      toast(`Devis ${d.numero || ''} enregistré`);
      return d;
    } catch (e) {
      toast(e.message || 'Enregistrement impossible', 'error');
      return null;
    }
  };

  const imprimer = async (d) => {
    try {
      const mod = await import('./rgd-documents.js');
      mod.imprimerDevisCrm(x, d);
    } catch (e) {
      toast(e.message || 'Impression impossible', 'error');
    }
  };

  function lier() {
    hote.querySelectorAll('[data-tarif]').forEach(b => b.onclick = () => ajouter(b.dataset.tarif));
    hote.querySelector('#rdc-metier')?.addEventListener('change', (e) => { lire(); etat.metier = e.target.value; redessiner(); });
    hote.querySelector('#rdc-tva')?.addEventListener('change', (e) => { etat.tva_taux = Number(e.target.value); lire(); redessiner(); });
    hote.querySelector('#rdc-validite')?.addEventListener('change', (e) => { etat.validite_jours = Number(e.target.value); });
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      lire(); etat.lignes.splice(Number(b.dataset.retirer), 1); redessiner();
    });
    hote.querySelectorAll('.rdc-saisie[data-i]').forEach(bloc => {
      const l = etat.lignes[Number(bloc.dataset.i)];
      const total = bloc.querySelector('.rdc-total');
      const recompter = () => { total.textContent = euros(totalLigne(l)); majTotaux(); };
      bloc.querySelectorAll('[data-champ]').forEach(c => {
        const champ = c.dataset.champ;
        if (champ === 'variante') {
          c.onchange = () => {
            const t = tarifsDe(l.metier || etat.metier).find(g => g.code === l.code);
            const v = (t?.variantes || []).find(y => y.libelle === c.value);
            l.variante = c.value;
            if (v) {
              l.prix_ht = Number(v.prix_ht);
              bloc.querySelector('[data-champ="prix_ht"]').value = l.prix_ht;
              const p = bloc.querySelector('.rdc-plancher');
              if (p) { p.textContent = `minimum ${euros(l.prix_ht)}`; p.classList.remove('rdc-alerte'); }
            }
            recompter();
          };
          return;
        }
        c.oninput = () => {
          l[champ] = c.value;
          if (champ === 'quantite' || champ === 'prix_ht') recompter();
          if (champ === 'libelle') {
            const nom = bloc.closest('.rdc-presta')?.querySelector('.rdc-presta-nom');
            if (nom) nom.textContent = c.value || 'Ligne libre';
          }
        };
        // Le plancher se signale en quittant le champ, pas à chaque chiffre
        // tapé : « 1 » en route vers « 150 » n'est pas une erreur.
        if (champ === 'prix_ht') c.onchange = () => {
          const mini = plancher(l);
          bloc.querySelector('.rdc-plancher')?.classList.toggle('rdc-alerte', !!mini && Number(l.prix_ht) < mini);
        };
      });
    });
    hote.querySelectorAll('[data-statut]').forEach(b => b.onclick = async () => {
      if (!existant || b.dataset.statut === existant.statut) return;
      try {
        existant = await changerStatutDevisCrm(existant, b.dataset.statut);
        toast(`Devis ${existant.numero || ''} : ${STATUTS_DEVIS_CRM[existant.statut].label.toLowerCase()}`);
        closeModal(true);
        ouvrirDevisCrm(x, existant, retour);
      } catch (e) { toast(e.message || 'Changement impossible', 'error'); }
    });
    const suppr = hote.querySelector('#rdc-suppr');
    if (suppr) suppr.onclick = async () => {
      if (!confirmerSuppr) { lire(); confirmerSuppr = true; redessiner(); return; }
      try {
        await supprimerDevisCrm(existant);
        toast(`Brouillon ${existant.numero || ''} supprimé`);
        closeModal();
      } catch (e) { toast(e.message || 'Suppression impossible', 'error'); }
    };
    const bEnr = hote.querySelector('#rdc-enregistrer');
    if (bEnr) bEnr.onclick = async () => {
      const d = await enregistrer();
      if (d) { closeModal(true); ouvrirDevisCrm(x, d, retour); }
    };
    hote.querySelector('#rdc-mail').onclick = async () => {
      const d = signe ? existant : await enregistrer();
      if (d) ouvrirEnvoi(d);
    };
    hote.querySelector('#rdc-pdf').onclick = async () => {
      const d = signe ? existant : await enregistrer();
      if (!d) return;
      imprimer(d);
      closeModal(true);
      ouvrirDevisCrm(x, d, retour);
    };
  }

  // ⚠ L'ENVOI SE PRÉPARE DANS LA MÊME FENÊTRE (29/10/2026, Élodie : « un
  // bouton pour envoyer directement le devis par mail »). Destinataire, objet
  // et message sont pré-remplis et se corrigent ; le PDF est fabriqué au
  // moment d'envoyer, depuis le devis ENREGISTRÉ — ce qui part est ce qui est
  // en base, numéro compris.
  async function ouvrirEnvoi(d) {
    const docs = await import('./rgd-documents.js');
    const qui = docs.donneesDocument(x);
    m.querySelector('.modal-head h2').textContent = `Envoyer le devis ${d.numero || ''}`;
    hote.innerHTML = `
      <p class="rdc-aide">Le devis part en <b>pièce jointe PDF</b>, depuis contact@rgdrenova.fr. La réponse du client arrive à la même adresse.</p>
      <div class="form">
        <div class="field"><label>Destinataire</label>
          <input id="rdc-a" type="email" value="${esc(qui.email || '')}" placeholder="adresse@client.fr" required></div>
        <div class="field"><label>Objet</label>
          <input id="rdc-objet-mail" value="${esc(`Votre devis RGD Renova n° ${d.numero || ''}`)}"></div>
        <div class="field"><label>Message</label>
          <textarea id="rdc-message" rows="11">${esc(messageDevisCrm(d, qui.nom))}</textarea></div>
        <div class="field"><label class="check"><input type="checkbox" id="rdc-copie" checked> Garder une copie à contact@rgdrenova.fr</label></div>
      </div>
      <p class="small muted">Pièce jointe : <b>Devis ${esc(d.numero || '')}</b> — ${euros(d.montant_ttc)} TTC.</p>
      <div class="rdc-pied">
        <div class="rdc-totaux"><span>${d.statut === 'brouillon' ? 'Le devis passera en <b>Envoyé</b>.' : ''}</span></div>
        <div class="rdc-boutons">
          <button type="button" class="btn ghost" id="rdc-retour">← Retour au devis</button>
          <button type="button" class="btn" id="rdc-envoyer">Envoyer</button>
        </div>
      </div>`;
    hote.querySelector('#rdc-a').focus();
    hote.querySelector('#rdc-retour').onclick = () => { closeModal(true); ouvrirDevisCrm(x, d, retour); };
    const bouton = hote.querySelector('#rdc-envoyer');
    bouton.onclick = async () => {
      const a = hote.querySelector('#rdc-a').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) { toast('Adresse mail du client invalide', 'error'); return; }
      bouton.disabled = true; bouton.textContent = 'Envoi…';
      try {
        const pdf = await docs.pdfDevisCrm(x, d);
        const r = await envoyerDevisCrm(d, {
          a, nom: qui.nom,
          objet: hote.querySelector('#rdc-objet-mail').value.trim() || `Votre devis RGD Renova n° ${d.numero || ''}`,
          message: hote.querySelector('#rdc-message').value,
          copie: hote.querySelector('#rdc-copie').checked,
        }, pdf);
        if (!r.ok) throw new Error(r.motif);
        toast(`Devis ${d.numero || ''} envoyé à ${a}`);
        closeModal();
      } catch (e) {
        bouton.disabled = false; bouton.textContent = 'Envoyer';
        toast(`Non envoyé — ${String(e.message || e).slice(0, 140)}`, 'error');
      }
    };
  }

  dessine();
}

/** Qui peut faire un devis : toute personne de RGD, dès qu'une grille existe. */
export const peutFaireDevisCrm = () => scope.activityKeys.includes('rgd') && metiersAvecGrille().length > 0;
