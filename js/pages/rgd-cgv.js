// L'écran « Conditions générales de vente » de RGD Renova (11/11/2026)
//
// Dans le groupe Costructor du menu. On y écrit les CGV ; elles s'impriment
// aussitôt en dernière page des devis et factures du CRM (dépannage
// électrique). Pour Costructor, dont l'API ne permet pas de les écrire (voir
// `js/data/rgd-cgv.js`), le bouton « Copier pour Costructor » copie le texte
// et ouvre Costructor : on colle dans Réglages > CGV. Direction seule.
import { scope } from '../data/scope.js';
import { esc, toast } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { lireCgv, enregistrerCgv, cgvEnBlocs, COSTRUCTOR_APP } from '../data/rgd-cgv.js';

const quand = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const apercu = (texte) => {
  const blocs = cgvEnBlocs(texte);
  return blocs.length
    ? blocs.map(b => `${b.titre ? `<h4>${esc(b.titre)}</h4>` : ''}${b.texte ? `<p>${esc(b.texte)}</p>` : ''}`).join('')
    : '<p class="muted">L’aperçu apparaît ici dès que vous écrivez.</p>';
};

export const rgdCgvPage = {
  title: () => 'RGD Renova — Conditions générales de vente',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { brouillon: null };

    const draw = () => {
      if (!scope.isDirection) {
        root.innerHTML = cadre('#/rgd/cgv', 'Conditions générales de vente',
          '<div class="card"><div class="empty">Réservé à la direction.</div></div>');
        return;
      }
      const cgv = lireCgv();
      const texte = state.brouillon ?? cgv.texte;
      const corps = `
        <div class="cgv-grille">
          <section class="card cgv-carte">
            <div class="cgv-tete">
              <h3>Le texte</h3>
              <span class="grow"></span>
              ${cgv.maj_le ? `<span class="muted small">Modifiées le ${esc(quand(cgv.maj_le))}${cgv.maj_par ? ` par ${esc(cgv.maj_par)}` : ''}</span>` : ''}
            </div>
            <textarea id="cgv-texte" class="cgv-texte" spellcheck="true"
              placeholder="Collez ou écrivez vos conditions générales de vente.&#10;&#10;Une ligne vide sépare deux paragraphes. Une ligne « Article 1 – Objet » ou écrite en MAJUSCULES devient un titre.">${esc(texte)}</textarea>
            <div class="cgv-actions">
              <span class="muted small" id="cgv-etat">${state.brouillon !== null && state.brouillon !== cgv.texte ? 'Modifications non enregistrées' : ''}</span>
              <span class="grow"></span>
              <button type="button" class="btn primary" id="cgv-enregistrer">Enregistrer</button>
            </div>
          </section>
          <section class="card cgv-carte">
            <div class="cgv-tete"><h3>Aperçu sur les devis et factures</h3></div>
            <div class="cgv-apercu" id="cgv-apercu">${apercu(texte)}</div>
          </section>
        </div>
        <section class="card cgv-costructor">
          <div>
            <h3>Mettre à jour Costructor</h3>
            <p>Costructor ne permet pas au CRM d’écrire ses CGV. Après avoir enregistré ici :</p>
            <ol>
              <li>cliquez sur <b>« Copier pour Costructor »</b> : le texte est copié et Costructor s’ouvre ;</li>
              <li>dans Costructor : <b>Réglages › CGV</b>, choisissez <b>Devis</b> puis <b>Factures</b>,
                « Rédiger les conditions ci-dessous » ;</li>
              <li>collez (<b>Ctrl + V</b>) à la place de l’ancien texte, puis enregistrez.</li>
            </ol>
          </div>
          <button type="button" class="btn primary cgv-copier" id="cgv-copier"${cgv.texte ? '' : ' disabled'}>Copier pour Costructor</button>
        </section>`;
      root.innerHTML = cadre('#/rgd/cgv', 'Conditions générales de vente', corps);

      const zone = root.querySelector('#cgv-texte');
      zone.oninput = () => {
        state.brouillon = zone.value;
        root.querySelector('#cgv-apercu').innerHTML = apercu(zone.value);
        root.querySelector('#cgv-etat').textContent = zone.value !== cgv.texte ? 'Modifications non enregistrées' : '';
      };
      root.querySelector('#cgv-enregistrer').onclick = async () => {
        try {
          await enregistrerCgv(zone.value);
          state.brouillon = null;
          toast('CGV enregistrées : elles s’impriment déjà sur les devis et factures du CRM. Pensez à Costructor.');
          draw();
        } catch (err) { toast(err.message, 'error'); }
      };
      root.querySelector('#cgv-copier').onclick = async () => {
        const { texte: t } = lireCgv();
        if (state.brouillon !== null && state.brouillon !== t) {
          toast('Enregistrez d’abord : c’est le texte enregistré qui part dans Costructor.', 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(t);
          toast('Texte copié. Dans Costructor : Réglages › CGV, puis collez.');
        } catch {
          // Presse-papiers refusé : on sélectionne le texte pour un Ctrl + C.
          zone.focus(); zone.select();
          toast('Copie automatique refusée : le texte est sélectionné, faites Ctrl + C.', 'error');
        }
        window.open(COSTRUCTOR_APP, '_blank', 'noopener');
      };
    };

    draw();
    return { refresh: () => { if (state.brouillon === null) draw(); }, destroy() { coquille.retirer(); } };
  },
};
