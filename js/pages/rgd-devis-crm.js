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
  totaux, plancher, ligneDepuisTarif, parCategorie, enregistrerDevisCrm, changerStatutDevisCrm, supprimerDevisCrm,
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

  const ligneHtml = (l, i) => {
    const t = l.code ? tarifsDe(l.metier || etat.metier).find(x => x.code === l.code) : null;
    const variantes = t?.variantes || [];
    const mini = plancher(l);
    const sousMini = mini && Number(l.prix_ht) < mini;
    return `<tr data-i="${i}">
      <td class="rdc-designation">
        <input class="rdc-libelle" data-champ="libelle" value="${esc(l.libelle)}" ${signe ? 'disabled' : ''} aria-label="Désignation">
        ${variantes.length ? `<select data-champ="variante" ${signe ? 'disabled' : ''} aria-label="Variante">
          ${variantes.map(v => `<option value="${esc(v.libelle)}" ${v.libelle === l.variante ? 'selected' : ''}>${esc(v.libelle)} — ${euros(v.prix_ht)}</option>`).join('')}
        </select>` : ''}
        <input class="rdc-precision" data-champ="precision" value="${esc(l.precision || '')}" placeholder="Précision (facultatif)" ${signe ? 'disabled' : ''} aria-label="Précision">
      </td>
      <td class="rdc-qte"><input type="number" inputmode="decimal" min="0" step="${l.unite === 'forfait' ? '1' : '0.5'}" data-champ="quantite" value="${esc(l.quantite)}" ${signe ? 'disabled' : ''} aria-label="Quantité"><span>${esc(UNITES[l.unite] || '')}</span></td>
      <td class="rdc-pu"><input type="number" inputmode="decimal" min="${mini}" step="1" data-champ="prix_ht" value="${esc(l.prix_ht)}" ${signe ? 'disabled' : ''} aria-label="Prix unitaire HT">
        ${mini && t?.a_partir_de ? `<small class="${sousMini ? 'rdc-alerte' : 'muted'}">dès ${euros(mini)}</small>` : ''}</td>
      <td class="num rdc-total">${euros((Number(l.quantite) || 0) * (Number(l.prix_ht) || 0))}</td>
      <td>${signe ? '' : `<button type="button" class="icon-btn" data-retirer="${i}" aria-label="Retirer la ligne">✕</button>`}</td>
    </tr>`;
  };

  const dessine = () => {
    const t = totaux(etat.lignes, etat.tva_taux);
    const grille = tarifsDe(etat.metier);
    hote.innerHTML = `
      ${signe ? '<p class="rdc-note">Ce devis est signé : son contenu ne se modifie plus. Seul son statut peut encore changer.</p>' : ''}
      <div class="form rdc-entete">
        <div class="field"><label>Objet</label>
          <input id="rdc-objet" value="${esc(etat.objet)}" placeholder="Dépannage électrique, mise aux normes du tableau…" ${signe ? 'disabled' : ''}></div>
        ${metiers.length > 1 && !existant ? `<div class="field half"><label>Grille</label>
          <select id="rdc-metier">${metiers.map(k => `<option value="${esc(k)}" ${k === etat.metier ? 'selected' : ''}>${esc(nomMetier(k))}</option>`).join('')}</select></div>` : ''}
        <div class="field half"><label>TVA</label>
          <select id="rdc-tva" ${signe ? 'disabled' : ''}>${TVA.map(v => `<option value="${v}" ${v === etat.tva_taux ? 'selected' : ''}>${String(v).replace('.', ',')} %${v === 10 ? ' — logement de plus de 2 ans' : v === 20 ? ' — neuf ou local professionnel' : ' — rénovation énergétique'}</option>`).join('')}</select></div>
        <div class="field half"><label>Validité</label>
          <select id="rdc-validite" ${signe ? 'disabled' : ''}>${[15, 30, 60, 90].map(j => `<option value="${j}" ${j === Number(etat.validite_jours) ? 'selected' : ''}>${j} jours</option>`).join('')}</select></div>
      </div>

      ${signe ? '' : `<div class="rdc-grille">
        <p class="rdc-grille-titre">Ajouter une prestation <span class="muted">— grille ${esc(nomMetier(etat.metier))}, prix HT</span></p>
        ${parCategorie(grille, g => g.categorie).map(({ categorie, items }) => `
          <div class="rdc-famille">
            <p class="rdc-cat">${esc(categorie)}</p>
            <div class="rdc-tarifs">
              ${items.map(({ item: g }) => `<button type="button" class="rdc-tarif" data-tarif="${esc(g.code)}">
                <span>${g.reference ? `<small class="muted">${esc(g.reference)}</small> ` : ''}${esc(g.libelle)}</span>
                <b>${g.a_partir_de ? 'dès ' : ''}${euros(g.prix_ht)}${PAR_UNITE[g.unite] || ''}</b>
              </button>`).join('')}
            </div>
          </div>`).join('')}
        <div class="rdc-famille">
          <p class="rdc-cat">Hors grille</p>
          <div class="rdc-tarifs">
            <button type="button" class="rdc-tarif rdc-libre" data-tarif=""><span>Ligne libre</span><b>prix à saisir</b></button>
          </div>
        </div>
      </div>`}

      <div class="rdc-lignes">
        ${etat.lignes.length ? `<table>
          <thead><tr><th>Désignation</th><th>Qté</th><th>PU HT</th><th class="num">Total HT</th><th></th></tr></thead>
          ${parCategorie(etat.lignes).map(({ categorie, items }) => `<tbody class="rdc-groupe">
            <tr class="rdc-cat-ligne"><th colspan="5">${esc(categorie)}</th></tr>
            ${items.map(({ item, i }) => ligneHtml(item, i)).join('')}
          </tbody>`).join('')}
        </table>` : '<p class="rgdf-rien">Aucune prestation pour l’instant : choisissez-en dans la grille ci-dessus.</p>'}
      </div>

      <div class="rdc-totaux">
        <div><span>Total HT</span><b>${euros(t.ht)}</b></div>
        <div><span>TVA ${String(etat.tva_taux).replace('.', ',')} %</span><b>${euros(t.tva)}</b></div>
        <div class="rdc-ttc"><span>Total TTC</span><b>${euros(t.ttc)}</b></div>
      </div>

      <div class="form"><div class="field"><label>Remarques — imprimées sur le devis</label>
        <textarea id="rdc-notes" rows="2" placeholder="Délai d’intervention, fournitures comprises…" ${signe ? 'disabled' : ''}>${esc(etat.notes)}</textarea></div></div>

      ${existant ? `<div class="rdc-statut"><span class="muted small">Statut</span>
        ${Object.entries(STATUTS_DEVIS_CRM).map(([k, s]) => `<button type="button" class="chip ${k === existant.statut ? s.ton : ''}" data-statut="${k}">${esc(s.label)}</button>`).join('')}
      </div>` : ''}

      <div class="form-actions">
        ${existant && existant.statut === 'brouillon' ? `<button type="button" class="btn ghost left" id="rdc-suppr">${confirmerSuppr ? 'Confirmer la suppression' : 'Supprimer le brouillon'}</button>` : ''}
        <button type="button" class="btn ghost" data-close>Fermer</button>
        ${signe ? '' : '<button type="button" class="btn ghost" id="rdc-enregistrer">Enregistrer</button>'}
        <button type="button" class="btn" id="rdc-pdf">${signe ? 'Imprimer le PDF' : 'Enregistrer et sortir le PDF'}</button>
      </div>`;
    lier();
  };

  // Ce qui est dans les champs passe dans `etat` sans redessiner : on ne perd
  // ni le curseur ni ce qu'on est en train de taper.
  const lire = () => {
    etat.objet = hote.querySelector('#rdc-objet')?.value ?? etat.objet;
    etat.notes = hote.querySelector('#rdc-notes')?.value ?? etat.notes;
  };

  const majTotaux = () => {
    const t = totaux(etat.lignes, etat.tva_taux);
    const b = hote.querySelectorAll('.rdc-totaux b');
    if (b.length === 3) { b[0].textContent = euros(t.ht); b[1].textContent = euros(t.tva); b[2].textContent = euros(t.ttc); }
  };

  const ajouter = (code) => {
    lire();
    if (!code) {
      etat.lignes.push({ code: null, metier: null, libelle: 'Fournitures', precision: '', variante: null, unite: 'forfait', quantite: 1, prix_ht: 0 });
    } else {
      const grille = tarifsDe(etat.metier);
      const t = grille.find(g => g.code === code);
      if (!t) return;
      etat.lignes.push(ligneDepuisTarif(t, { surface }));
      for (const autre of t.ajoute_aussi || []) {
        const a = grille.find(g => g.code === autre);
        if (a && !etat.lignes.some(l => l.code === autre)) etat.lignes.push(ligneDepuisTarif(a, { surface }));
      }
    }
    dessine();
  };

  const verifier = () => {
    lire();
    if (!etat.lignes.length) return 'Ajoutez au moins une prestation';
    for (const l of etat.lignes) {
      if (!String(l.libelle || '').trim()) return 'Une ligne n’a pas de désignation';
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
    hote.querySelector('#rdc-metier')?.addEventListener('change', (e) => { lire(); etat.metier = e.target.value; dessine(); });
    hote.querySelector('#rdc-tva')?.addEventListener('change', (e) => { etat.tva_taux = Number(e.target.value); lire(); dessine(); });
    hote.querySelector('#rdc-validite')?.addEventListener('change', (e) => { etat.validite_jours = Number(e.target.value); });
    hote.querySelectorAll('[data-retirer]').forEach(b => b.onclick = () => {
      lire(); etat.lignes.splice(Number(b.dataset.retirer), 1); dessine();
    });
    hote.querySelectorAll('tr[data-i]').forEach(tr => {
      const l = etat.lignes[Number(tr.dataset.i)];
      tr.querySelectorAll('[data-champ]').forEach(c => {
        const champ = c.dataset.champ;
        if (champ === 'variante') {
          c.onchange = () => {
            lire();
            const t = tarifsDe(l.metier || etat.metier).find(g => g.code === l.code);
            const v = (t?.variantes || []).find(x => x.libelle === c.value);
            l.variante = c.value;
            if (v) l.prix_ht = Number(v.prix_ht);
            dessine();
          };
          return;
        }
        c.oninput = () => {
          l[champ] = champ === 'quantite' || champ === 'prix_ht' ? c.value : c.value;
          if (champ === 'quantite' || champ === 'prix_ht') {
            const total = tr.querySelector('.rdc-total');
            if (total) total.textContent = euros((Number(l.quantite) || 0) * (Number(l.prix_ht) || 0));
            majTotaux();
          }
        };
        // Le plancher se signale en quittant le champ, pas à chaque chiffre
        // tapé : « 1 » en route vers « 150 » n'est pas une erreur.
        if (champ === 'prix_ht') c.onchange = () => { lire(); dessine(); };
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
      if (!confirmerSuppr) { lire(); confirmerSuppr = true; dessine(); return; }
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
    hote.querySelector('#rdc-pdf').onclick = async () => {
      const d = signe ? existant : await enregistrer();
      if (!d) return;
      imprimer(d);
      closeModal(true);
      ouvrirDevisCrm(x, d, retour);
    };
  }

  dessine();
}

/** Qui peut faire un devis : toute personne de RGD, dès qu'une grille existe. */
export const peutFaireDevisCrm = () => scope.activityKeys.includes('rgd') && metiersAvecGrille().length > 0;
