// Espace RGD Renova — la grille des tarifs (29/10/2026)
//
// Demandé par Élodie : « fais l'écran pour que Mickael modifie les prix ». La
// grille vit dans `rgd_tarifs` (migration 20261029140345) et sert à faire les
// devis du CRM, depuis la fiche d'un client.
//
// ⚠ RÉSERVÉ À LA DIRECTION, ET LA BASE LE DIT AVANT L'ÉCRAN : les policies
// d'écriture de `rgd_tarifs` sont en `my_role() = 'direction'`. Franck lit la
// grille (il en a besoin pour chiffrer) mais ne la change pas.
//
// ⚠ CHANGER UN PRIX NE TOUCHE PAS AUX DEVIS DÉJÀ FAITS. Chaque ligne de devis
// porte sa propre copie du libellé et du prix : un devis remis au client dit
// ce qu'il disait. Seuls les devis faits ensuite prennent le nouveau prix.
//
// ⚠ ON RETIRE UNE PRESTATION, ON NE LA SUPPRIME PAS. « Retirer » la cache des
// nouveaux devis (`actif = false`) et la garde dans la liste, prête à revenir.
// Rien ne casse si on la supprimait — les devis ont leur copie —, mais une
// prestation effacée par erreur se retaperait de mémoire, prix compris.
//
// ⚠ LE « DÈS » EST UN PLANCHER : l'écran de devis refuse de descendre en
// dessous. Sans lui, le prix est un prix proposé que Franck peut baisser.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, eur, toast } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { METIERS, nomMetier } from '../data/rgd-devis-crm.js';

const euros = (n) => eur(n, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const LIBELLE_UNITE = { forfait: 'Forfait', heure: 'À l’heure', m2: 'Au m²' };

// Un code stable pour une prestation créée ici : il ne sert qu'à relier les
// lignes de la grille entre elles (« ajoute aussi »), jamais à l'affichage.
const codeDepuis = (libelle, pris) => {
  const base = String(libelle).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'prestation';
  let c = base; let n = 2;
  while (pris.has(c)) c = `${base}_${n++}`;
  return c;
};

export const rgdTarifsPage = {
  title: () => 'RGD Renova — Tarifs',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // Ce qui est modifié et pas encore enregistré, par identifiant de ligne.
    // Un redessin venu d'ailleurs (temps réel) ne doit pas effacer une saisie.
    const brouillons = new Map();
    const state = { metier: 'electricite', ajout: false };

    const lignes = () => db.t('rgd_tarifs').filter(t => t.metier === state.metier)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    const valeur = (t) => brouillons.get(t.id) || t;

    const ligneHtml = (t0) => {
      const t = valeur(t0);
      const modifie = brouillons.has(t0.id);
      const variantes = t.variantes || [];
      const lies = (t.ajoute_aussi || []).map(c => db.t('rgd_tarifs').find(x => x.metier === t.metier && x.code === c)?.libelle || c);
      return `<tr data-tarif="${esc(t0.id)}" class="${t.actif === false ? 'est-retire' : ''} ${modifie ? 'est-modifie' : ''}">
        <td class="rtf-presta">
          <input data-champ="libelle" value="${esc(t.libelle)}" aria-label="Prestation">
          <input data-champ="precision" value="${esc(t.precision || '')}" placeholder="Précision (facultatif)" aria-label="Précision" class="rtf-precision">
          ${lies.length ? `<small class="muted">Ajoute aussi sur le devis : ${esc(lies.join(', '))}</small>` : ''}
          ${t.actif === false ? '<small class="rtf-retire">Retirée : elle n’est plus proposée sur les nouveaux devis.</small>' : ''}
        </td>
        <td class="rtf-unite"><select data-champ="unite" aria-label="Unité">
          ${Object.entries(LIBELLE_UNITE).map(([k, l]) => `<option value="${k}" ${k === t.unite ? 'selected' : ''}>${l}</option>`).join('')}
        </select></td>
        <td class="rtf-prix">
          ${variantes.length ? `<div class="rtf-variantes">
            ${variantes.map((v, i) => `<div class="rtf-variante">
              <input data-variante="${i}" data-vchamp="libelle" value="${esc(v.libelle)}" aria-label="Variante">
              <span class="rtf-euro"><input type="number" inputmode="decimal" min="0" step="1" data-variante="${i}" data-vchamp="prix_ht" value="${esc(v.prix_ht)}" aria-label="Prix HT de la variante"> €</span>
              <button type="button" class="icon-btn" data-retirer-variante="${i}" aria-label="Retirer la variante">✕</button>
            </div>`).join('')}
          </div>` : `<span class="rtf-euro"><input type="number" inputmode="decimal" min="0" step="1" data-champ="prix_ht" value="${esc(t.prix_ht)}" aria-label="Prix HT"> €${t.unite === 'heure' ? '/h' : t.unite === 'm2' ? '/m²' : ''}</span>`}
          <button type="button" class="lien rtf-ajout-variante" data-ajouter-variante>+ variante</button>
        </td>
        <td class="rtf-des"><label class="check"><input type="checkbox" data-champ="a_partir_de" ${t.a_partir_de ? 'checked' : ''}> Dès</label></td>
        <td class="rtf-actions">
          ${modifie ? `<button type="button" class="btn sm" data-enregistrer>Enregistrer</button>
            <button type="button" class="btn ghost sm" data-annuler>Annuler</button>`
            : `<button type="button" class="btn ghost sm" data-actif>${t.actif === false ? 'Remettre' : 'Retirer'}</button>`}
        </td>
      </tr>`;
    };

    const draw = () => {
      if (!scope.isDirection) {
        root.innerHTML = cadre('#/rgd/tarifs', 'Tarifs',
          '<section class="card"><div class="empty">La grille des tarifs se modifie par la direction.</div></section>');
        return;
      }
      const liste = lignes();
      const metiers = [...new Set([...Object.keys(METIERS), ...db.t('rgd_tarifs').map(t => t.metier)])];
      root.innerHTML = cadre('#/rgd/tarifs', 'Tarifs', `
        <div class="alert rgd-source"><b>i</b><div>Ces prix servent aux <b>devis faits dans le CRM</b>
          (bouton « + Faire un devis » sur la fiche d’un client). Tous les prix sont <b>HT</b>.
          Changer un prix ne modifie <b>pas</b> les devis déjà faits : seuls les suivants le prennent.</div></div>
        <section class="card">
          <div class="card-head"><h2>Grille ${esc(nomMetier(state.metier))}</h2>
            <span class="grow"></span>
            ${metiers.length > 1 ? `<select id="rtf-metier">${metiers.map(m => `<option value="${esc(m)}" ${m === state.metier ? 'selected' : ''}>${esc(nomMetier(m))}</option>`).join('')}</select>` : ''}
            <span class="muted small">${liste.filter(t => t.actif !== false).length} prestation(s)</span></div>
          <div class="table-wrap rtf-table"><table class="tbl-grille">
            <thead><tr><th>Prestation</th><th>Unité</th><th>Prix HT</th><th title="Le prix est un minimum : il se monte sur le devis, il ne se baisse pas">Dès</th><th></th></tr></thead>
            <tbody>${liste.map(ligneHtml).join('')}</tbody>
          </table></div>
          ${state.ajout ? `<form class="form rtf-nouvelle" id="rtf-nouvelle">
            <div class="field"><label>Nouvelle prestation</label><input name="libelle" required placeholder="Pose d’un point lumineux…"></div>
            <div class="field half"><label>Unité</label><select name="unite">${Object.entries(LIBELLE_UNITE).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
            <div class="field half"><label>Prix HT (€)</label><input name="prix_ht" type="number" inputmode="decimal" min="0" step="1" required></div>
            <div class="field"><label class="check"><input type="checkbox" name="a_partir_de"> Prix « dès » (un minimum)</label></div>
            <div class="form-actions"><button type="button" class="btn ghost" id="rtf-ajout-annuler">Annuler</button>
              <button class="btn primary">Ajouter à la grille</button></div>
          </form>` : `<div class="toolbar"><button type="button" class="btn" id="rtf-ajout">+ Ajouter une prestation</button></div>`}
        </section>`);
      lier();
    };

    // Le brouillon d'une ligne : une copie qu'on modifie, posée au premier
    // changement. Le bouton Enregistrer n'apparaît qu'alors.
    const brouillonDe = (id) => {
      if (!brouillons.has(id)) brouillons.set(id, structuredClone(db.byId('rgd_tarifs', id)));
      return brouillons.get(id);
    };
    // Un champ tapé met le brouillon à jour SANS REDESSINER : un redessin
    // ferait perdre le curseur dès la première touche. Au premier changement,
    // seule la case des boutons est refaite, pour faire paraître Enregistrer.
    const touche = (id, maj, tr) => {
      const neuf = !brouillons.has(id);
      maj(brouillonDe(id));
      if (!neuf || !tr) return;
      tr.classList.add('est-modifie');
      tr.querySelector('.rtf-actions').innerHTML = `<button type="button" class="btn sm" data-enregistrer>Enregistrer</button>
        <button type="button" class="btn ghost sm" data-annuler>Annuler</button>`;
      lierActions(tr, id);
    };

    const verifier = (t) => {
      if (!String(t.libelle || '').trim()) return 'Une prestation doit avoir un nom';
      const prix = (t.variantes || []).length ? t.variantes.map(v => Number(v.prix_ht)) : [Number(t.prix_ht)];
      if (prix.some(p => !(p >= 0) || String(p) === 'NaN')) return 'Un prix est vide ou n’est pas un nombre';
      if ((t.variantes || []).some(v => !String(v.libelle || '').trim())) return 'Une variante n’a pas de nom';
      return null;
    };

    const enregistrer = async (id) => {
      const t = brouillons.get(id);
      if (!t) return;
      const motif = verifier(t);
      if (motif) { toast(motif, 'error'); return; }
      const variantes = (t.variantes || []).map(v => ({ libelle: String(v.libelle).trim(), prix_ht: Number(v.prix_ht) }));
      try {
        await db.update('rgd_tarifs', id, {
          libelle: String(t.libelle).trim(),
          precision: String(t.precision || '').trim() || null,
          unite: t.unite,
          // Avec des variantes, le prix de la ligne est la moins chère : c'est
          // celui qu'affiche la grille du devis (« dès 1 090 € »).
          prix_ht: variantes.length ? Math.min(...variantes.map(v => v.prix_ht)) : Number(t.prix_ht),
          variantes,
          a_partir_de: !!t.a_partir_de,
        });
        brouillons.delete(id);
        toast(`« ${String(t.libelle).trim()} » enregistrée`);
        draw();
      } catch (e) { toast(`Non enregistré — ${String(e.message).slice(0, 120)}`, 'error'); }
    };

    function lierActions(tr, id) {
      tr.querySelector('[data-enregistrer]')?.addEventListener('click', () => enregistrer(id));
      tr.querySelector('[data-annuler]')?.addEventListener('click', () => { brouillons.delete(id); draw(); });
    }

    function lier() {
      root.querySelector('#rtf-metier')?.addEventListener('change', (e) => { state.metier = e.target.value; draw(); });
      root.querySelectorAll('tr[data-tarif]').forEach(tr => {
        const id = tr.dataset.tarif;
        tr.querySelectorAll('[data-champ]').forEach(c => {
          const champ = c.dataset.champ;
          const ev = c.type === 'checkbox' || c.tagName === 'SELECT' ? 'change' : 'input';
          c.addEventListener(ev, () => touche(id, (t) => {
            t[champ] = c.type === 'checkbox' ? c.checked : c.value;
          }, tr));
        });
        tr.querySelectorAll('[data-vchamp]').forEach(c => c.addEventListener('input', () => touche(id, (t) => {
          t.variantes[Number(c.dataset.variante)][c.dataset.vchamp] = c.value;
        }, tr)));
        tr.querySelectorAll('[data-retirer-variante]').forEach(b => b.onclick = () => {
          const t = brouillonDe(id);
          const [v] = t.variantes.splice(Number(b.dataset.retirerVariante), 1);
          // La dernière variante retirée rend son prix à la ligne.
          if (!t.variantes.length && v) t.prix_ht = Number(v.prix_ht);
          draw();
        });
        tr.querySelector('[data-ajouter-variante]').onclick = () => {
          const t = brouillonDe(id);
          t.variantes = t.variantes || [];
          // La première variante reprend le prix de la ligne : sinon il
          // disparaîtrait de l'écran au moment même où on le découpe.
          if (!t.variantes.length) t.variantes.push({ libelle: 'Standard', prix_ht: Number(t.prix_ht) || 0 });
          t.variantes.push({ libelle: '', prix_ht: '' });
          draw();
        };
        lierActions(tr, id);
        tr.querySelector('[data-actif]')?.addEventListener('click', async () => {
          const t = db.byId('rgd_tarifs', id);
          try {
            await db.update('rgd_tarifs', id, { actif: t.actif === false });
            toast(t.actif === false ? `« ${t.libelle} » remise dans la grille` : `« ${t.libelle} » retirée des nouveaux devis`);
            draw();
          } catch (e) { toast(`Non enregistré — ${String(e.message).slice(0, 120)}`, 'error'); }
        });
      });
      root.querySelector('#rtf-ajout')?.addEventListener('click', () => { state.ajout = true; draw(); root.querySelector('#rtf-nouvelle [name=libelle]')?.focus(); });
      root.querySelector('#rtf-ajout-annuler')?.addEventListener('click', () => { state.ajout = false; draw(); });
      const form = root.querySelector('#rtf-nouvelle');
      if (form) form.onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const libelle = String(f.get('libelle') || '').trim();
        const prix = Number(f.get('prix_ht'));
        if (!libelle || !(prix >= 0)) { toast('Un nom et un prix sont nécessaires', 'error'); return; }
        const toutes = db.t('rgd_tarifs').filter(t => t.metier === state.metier);
        try {
          await db.insert('rgd_tarifs', {
            metier: state.metier,
            code: codeDepuis(libelle, new Set(toutes.map(t => t.code))),
            ordre: Math.max(0, ...toutes.map(t => t.ordre || 0)) + 10,
            libelle, unite: f.get('unite'), prix_ht: prix, a_partir_de: f.get('a_partir_de') === 'on',
            variantes: [], ajoute_aussi: [], actif: true,
          });
          state.ajout = false;
          toast(`« ${libelle} » ajoutée à la grille`);
          draw();
        } catch (err) { toast(`Non enregistré — ${String(err.message).slice(0, 120)}`, 'error'); }
      };
    }

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};

