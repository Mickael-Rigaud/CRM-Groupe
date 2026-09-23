// Espace RGD Renova — partenaires
//
// ÉTAPE 4 DE LA MIGRATION, RANG 5 — en écriture depuis le 22/09/2026.
//
// Les apporteurs sont passés à Supabase le 22/09/2026, première table de la
// phase 2. L'écran les crée et les modifie EN DIRECT, avec `db.insert` et
// `db.update`, sans traverser le worker et sans traduire un seul nom de champ.
// Le relevé ne les envoie plus, et `d1_id` est devenu nullable : une fiche née
// ici n'a pas d'origine Cloudflare, et n'en a pas besoin.
//
// ⚠ LES ACHATS DE FOURNITURES ONT QUITTÉ CET ÉCRAN le 23/09/2026, sur demande.
// Ils y vivaient sous un onglet parce qu'ils tenaient en une ligne et ne
// remplissaient pas une page à eux. `rgd_fournitures` est vide depuis que ses
// lignes ont été reconnues comme des essais, et ils se saisissent dans
// l'application RGD. **Ils n'ont donc plus aucune porte dans le CRM** : le jour
// où ils reviennent, c'est un écran à eux qu'il leur faut, pas un onglet sur un
// annuaire de contacts. Le formulaire d'achat est parti avec — il vit dans
// l'historique git si on le cherche.
//
// TROIS SECTIONS, CELLES DU TABLEAU DE BORD D'ORIGINE
// Apporteurs d'affaires · Fournisseurs · Autres partenaires, déclarées une
// fois dans `SECTIONS`. Une liste unique avec une colonne « Rôle » disait la
// même chose, mais on ne lit pas une colonne comme on lit un titre.
//
// DEUX COMPTES D'APPORTS, ET C'EST VOULU
// `apports_declares` vient de `nb_prospects_manuel` : quelqu'un l'a saisi à la
// main. « Rattachés » est le nombre de fiches clients qui désignent vraiment ce
// partenaire (`rgd_clients.apporteur_id`), repris au rang 6. Les deux peuvent
// diverger, et c'est une information : un apporteur crédité à la main sans
// aucune fiche rattachée, c'est soit une saisie optimiste, soit un rattachement
// oublié. La colonne « Prospects » porte le déclaré, comme l'original, et
// n'ajoute le rattaché que s'il existe.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { toast, openModal, closeModal } from '../ui.js';

// Les trois rôles que D1 range dans la même table. L'ordre est celui de
// l'intérêt commercial : celui qui apporte des affaires d'abord.
const ROLES = {
  apporteur:  { label: 'Apporteur', ton: 'green' },
  commercial: { label: 'Commercial', ton: 'accent' },
  fournisseur: { label: 'Fournisseur', ton: 'muted' },
};
const role = (k) => ROLES[k] || { label: k || 'Non précisé', ton: 'muted' };

// LES TROIS SECTIONS, reprises du tableau de bord d'origine (demandé par
// Mickael le 23/09/2026). Une liste unique avec une colonne « Rôle » disait la
// même chose, mais on ne lit pas une colonne comme on lit un titre : cherchez
// « qui me vend le carrelage » et vous parcourez cinq lignes au lieu d'aller
// droit à « Fournisseurs ».
//
// ⚠ `apporteur` ATTRAPE AUSSI LES FICHES SANS RÔLE (`|| 'apporteur'`, comme
// l'original). C'est volontaire : une fiche sans type n'est pas une fiche sans
// intérêt, et la laisser hors des trois sections la ferait disparaître de
// l'écran — le pire résultat possible pour un annuaire.
//
// `autre` rejoint `commercial` : deux valeurs, une seule section, parce que
// personne ne saurait dire ce qui les distingue.
//
// Les couleurs passent par les variables du CRM et non par les codes en dur de
// l'original : `--accent` EST déjà l'orange RGD sur cet écran (applyBrand).
// Le vert et le bleu servent ici de repère de catégorie, pas d'état — c'est la
// seule entorse à la règle, et elle est celle du tableau de bord d'origine.
const SECTIONS = [
  { cle: 'apporteur', titre: 'Apporteurs d’affaires', bouton: '+ Nouvel apporteur',
    couleur: 'var(--accent)', prospects: true,
    prend: (t) => (t || 'apporteur') === 'apporteur' },
  { cle: 'fournisseur', titre: 'Fournisseurs', bouton: '+ Nouveau fournisseur',
    couleur: 'var(--blue)', prospects: false,
    prend: (t) => t === 'fournisseur' },
  { cle: 'commercial', titre: 'Autres partenaires', bouton: '+ Nouveau partenaire',
    couleur: 'var(--green)', prospects: false,
    prend: (t) => t === 'commercial' || t === 'autre' },
];

const nomDe = (a) => [a.prenom, a.nom].filter(Boolean).join(' ').trim() || a.societe || '—';

// Le formulaire d'un partenaire. Il sert à créer comme à modifier : le worker
// a deux routes mais les mêmes champs, et deux formulaires jumeaux finissent
// toujours par diverger sur un détail.
// `typeDefaut` vient de la section depuis laquelle on a cliqué : créer un
// fournisseur depuis la section « Fournisseurs » ne doit pas demander de
// re-choisir le rôle qu'on vient d'indiquer en cliquant.
function formulairePartenaire(a, apres, typeDefaut = 'apporteur') {
  const creation = !a;
  const v = a || (creation ? { type_partenaire: typeDefaut } : {});
  const corps = `
    <form id="pa-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
      <label class="reg-champ"><span>Nom *</span><input name="nom" required value="${esc(v.nom || '')}"></label>
      <label class="reg-champ"><span>Prénom</span><input name="prenom" value="${esc(v.prenom || '')}"></label>
      <label class="reg-champ"><span>Société</span><input name="societe" value="${esc(v.societe || '')}"></label>
      <label class="reg-champ"><span>Métier</span><input name="profession" value="${esc(v.profession || '')}"></label>
      <label class="reg-champ">
        <span>Rôle</span>
        <select name="type_partenaire">
          ${Object.entries(ROLES).map(([k, r]) =>
            `<option value="${esc(k)}" ${v.type_partenaire === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
        </select>
      </label>
      <label class="reg-champ"><span>Téléphone</span><input name="telephone" value="${esc(v.telephone || '')}"></label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Email</span>
        <input name="email" type="email" value="${esc(v.email || '')}"></label>
      <label class="reg-champ"><span>Code postal</span><input name="code_postal" value="${esc(v.code_postal || '')}"></label>
      <label class="reg-champ"><span>Ville</span><input name="ville" value="${esc(v.ville || '')}"></label>
      <label class="reg-champ">
        <span>Convention de partenariat</span>
        <select name="partenariat_signe">
          <option value="0" ${v.partenariat_signe ? '' : 'selected'}>Non signée</option>
          <option value="1" ${v.partenariat_signe ? 'selected' : ''}>Signée</option>
        </select>
      </label>
      <label class="reg-champ"><span>Date de signature</span>
        <input name="date_signature" type="date" value="${esc(v.date_signature || '')}"></label>
      <label class="reg-champ"><span>Apports déclarés</span>
        <input name="apports_declares" inputmode="numeric" value="${v.apports_declares != null ? esc(String(v.apports_declares)) : ''}"></label>
      <label class="reg-champ">
        <span>Partenaire</span>
        <select name="actif">
          <option value="1" ${v.actif === false ? '' : 'selected'}>Actif</option>
          <option value="0" ${v.actif === false ? 'selected' : ''}>Inactif</option>
        </select>
      </label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Notes</span>
        <textarea name="notes" rows="2">${esc(v.notes || '')}</textarea></label>
    </form>
    <p class="small muted"><b>Apports déclarés</b> est un compte tenu à la main : il ne
    remplace pas la colonne « Rattachés », qui compte les fiches clients désignant
    vraiment ce partenaire. Les deux coexistent, et leur écart est une information.</p>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn primary" id="pa-ok">${creation ? 'Créer le partenaire' : 'Enregistrer'}</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <span class="grow"></span><span class="muted small" id="pa-etat"></span>
    </div>`;

  openModal(creation ? 'Nouveau partenaire' : `Modifier — ${nomDe(v)}`, corps, { onOpen: (m) => {
    m.querySelector('#pa-ok').onclick = async () => {
      const f = m.querySelector('#pa-form');
      if (!f.reportValidity()) return;
      const d = Object.fromEntries(new FormData(f).entries());
      const champs = {
        nom: d.nom.trim(),
        partenariat_signe: d.partenariat_signe === '1',
        actif: d.actif === '1',
      };
      for (const k of ['prenom', 'societe', 'profession', 'type_partenaire',
                       'telephone', 'email', 'code_postal', 'ville', 'notes']) {
        // À la création, un champ vide n'est pas envoyé. À la modification il
        // l'est, à null : c'est ainsi qu'on EFFACE une valeur, et ne pas
        // l'envoyer rendrait impossible de retirer un email saisi par erreur.
        if (d[k] && d[k].trim()) champs[k] = d[k].trim();
        else if (!creation) champs[k] = null;
      }
      // Même règle que les autres champs : à la création on n'envoie rien,
      // à la modification on envoie `null` pour effacer. Poser `null` dans un
      // INSERT marche ici, mais c'est l'habitude qui compte — c'est ce réflexe
      // qui a fait écrire `null` dans une colonne `not null default` ailleurs.
      if (d.date_signature) champs.date_signature = d.date_signature;
      else if (!creation) champs.date_signature = null;
      if (d.apports_declares.trim()) {
        const n = Number(d.apports_declares.replace(/\s/g, ''));
        if (!Number.isFinite(n) || n < 0) { toast('Les apports déclarés ne sont pas un nombre', 'err'); return; }
        champs.apports_declares = n;
      } else if (!creation) champs.apports_declares = null;

      const b = m.querySelector('#pa-ok');
      b.disabled = true;
      m.querySelector('#pa-etat').textContent = 'Enregistrement…';
      try {
        // Écriture directe : `rgd_apporteurs` est à nous. Les noms sont ceux du
        // CRM, les booléens sont des booléens, et il n'y a pas de `d1_id` à
        // inventer — la colonne accepte `null` depuis la bascule.
        if (creation) {
          const cree = await db.insert('rgd_apporteurs', champs);
          scope.rgd('rgd_apporteurs').push(cree);
        } else {
          const maj = await db.update('rgd_apporteurs', v.id, champs);
          Object.assign(v, maj);
        }
      } catch (e) {
        b.disabled = false;
        m.querySelector('#pa-etat').textContent = '';
        toast(`Non enregistré — ${String(e.message).slice(0, 120)}`, 'err');
        return;
      }
      b.disabled = false;
      m.querySelector('#pa-etat').textContent = '';
      closeModal();
      // Plus d'attente : la ligne est là tout de suite, création comprise.
      // C'est la différence concrète entre écrire chez soi et écrire ailleurs.
      toast(creation ? 'Partenaire créé' : 'Partenaire enregistré');
      apres?.();
    };
  } });
}

export const rgdPartenairesPage = {
  title: () => 'RGD Renova — Partenaires',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // ⚠ DEUX PORTES, ET ELLES NE S'OUVRENT PAS AVEC LA MÊME CLÉ.
    // `ecriture` = un compte RGD existe au même email, ce qu'exige le worker —
    // et donc ce qu'exigent les ACHATS, qui passent encore par lui.
    // `ecritureLocale` = l'activité RGD dans le CRM, ce qu'exige la policy
    // `rgd_apporteurs_acces` — et donc ce qu'exigent les APPORTEURS, qui
    // s'écrivent maintenant en direct.
    // Les confondre priverait d'un droit qu'on a : quelqu'un de l'équipe RGD
    // sans compte sur le tableau de bord peut modifier un partenaire.
    // Une seule porte depuis que les achats sont partis : les apporteurs
    // s'écrivent en direct dans Supabase, ce qu'autorise la policy
    // `rgd_apporteurs_acces`. Plus besoin de demander au worker s'il existe un
    // compte RGD au même email — c'était la clé des achats, pas la nôtre.
    const state = { q: '', focus: null, ecritureLocale: scope.canRgd };

    const draw = () => {
      const tous = scope.rgd('rgd_apporteurs');
      const fiches = scope.rgd('rgd_clients');
      const rattaches = (a) => fiches.filter(c => c.apporteur_id === a.id).length;
      const actifs = tous.filter(a => a.actif !== false);
      const declares = tous.reduce((t, a) => t + (Number(a.apports_declares) || 0), 0);

      const ts = terms(state.q);
      const vus = tous
        .filter(a => hit([nomDe(a), a.societe, a.profession, a.ville, a.email, a.telephone], ts))
        .slice()
        // Les actifs d'abord, puis ceux qui apportent le plus : c'est une liste
        // de gens à rappeler, pas un annuaire alphabétique.
        .sort((a, b) => (a.actif === false) - (b.actif === false)
          || rattaches(b) - rattaches(a)
          || (Number(b.apports_declares) || 0) - (Number(a.apports_declares) || 0)
          || String(nomDe(a)).localeCompare(String(nomDe(b)), 'fr'));

      // Une ligne de partenaire. Les colonnes sont celles du tableau de bord
      // d'origine — Nom · Prénom · Société · Profession · Email · Téléphone —
      // et rien de plus : ville, convention et notes vivent dans la fiche, que
      // le clic sur la ligne ouvre. Un annuaire qu'on élargit à chaque champ
      // utile finit illisible.
      const ligne = (a, sec) => `<tr class="${a.actif === false ? 'muted' : ''}"
          ${state.ecritureLocale ? `data-partenaire="${esc(String(a.id))}"` : ''}>
        <td><b>${esc(a.nom || nomDe(a))}</b>
            ${a.actif === false ? ' <span class="chip">Inactif</span>' : ''}</td>
        <td>${esc(a.prenom || '—')}</td>
        <td class="pa-bleu">${esc(a.societe || a.raison_sociale || '—')}</td>
        <td class="pa-bleu">${esc(a.profession || '—')}</td>
        <td class="pa-bleu">${a.email ? esc(a.email) : '<span class="muted">—</span>'}</td>
        <td>${a.telephone ? esc(a.telephone) : '<span class="muted">—</span>'}</td>
        ${sec.prospects ? `<td class="num"><b>${Number(a.apports_declares) || 0}</b>${
          // Le rattaché ne s'affiche QUE s'il existe. Les deux comptes ne
          // mesurent pas la même chose (l'un est saisi, l'autre constaté) et
          // leur écart est une information — mais une colonne de plus pour
          // afficher zéro partout n'en est pas une.
          rattaches(a) ? `<div class="s muted" title="Fiches clients qui désignent ce partenaire">${rattaches(a)} rattaché${rattaches(a) > 1 ? 's' : ''}</div>` : ''
        }</td>` : ''}
      </tr>`;

      const section = (sec) => {
        const lignes = vus.filter(a => sec.prend(a.type_partenaire));
        const cols = sec.prospects ? 7 : 6;
        return `
        <section class="card pa-sect" style="--pa-trait:${sec.couleur}">
          <div class="pa-head">
            <h3>${esc(sec.titre)}</h3>
            <span class="pa-compte" style="background:${sec.couleur}">${lignes.length}</span>
            <span class="grow"></span>
            ${state.ecritureLocale
              ? `<button type="button" class="btn primary" data-nouveau="${esc(sec.cle)}">${esc(sec.bouton)}</button>`
              : ''}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Prénom</th><th>Société</th><th>Profession</th>
                <th>Email</th><th>Téléphone</th>
                ${sec.prospects ? '<th class="num" title="Apports comptés à la main">Prospects</th>' : ''}</tr></thead>
              <tbody>${lignes.map(a => ligne(a, sec)).join('')
                || `<tr><td colspan="${cols}"><div class="empty">${
                  state.q ? 'Aucun résultat dans cette catégorie.'
                    : `Aucun ${sec.titre.toLowerCase().replace(/s$/, '')} pour le moment.`}</div></td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
      };

      // Ni alerte de convention, ni onglet « Achats » : retirés le 23/09/2026
      // à la demande de Mickael. L'alerte disait qu'aucun partenariat n'était
      // signé — vrai des cinq fiches, donc permanente, et une alerte qui ne
      // s'éteint jamais cesse d'être lue ; la convention reste dans la fiche.
      // ⚠ LES ACHATS DE FOURNITURES N'ONT PLUS DE PORTE DANS LE CRM. La table
      // `rgd_fournitures` est vide (vérifié le 23/09/2026 — ses lignes étaient
      // des essais, effacées) et ils se saisissent dans l'application RGD. Le
      // jour où ils reviennent, c'est un écran à eux qu'il leur faut, pas un
      // onglet sur l'annuaire des partenaires.
      const corps = `
        <div class="toolbar">
          ${searchInput('rpa-q', state, 'Rechercher un partenaire, un métier, une ville…')}
          <span class="grow"></span>
          <span class="muted small">${state.ecritureLocale
            ? 'Cliquez sur une ligne pour ouvrir la fiche'
            : `${actifs.length} actif${actifs.length > 1 ? 's' : ''} · ${declares} apport${declares > 1 ? 's' : ''} déclaré${declares > 1 ? 's' : ''}`}</span>
        </div>

        ${SECTIONS.map(section).join('')}`;

      root.innerHTML = cadre('#/rgd/partenaires', 'Partenaires', corps);
      bindSearch(root, 'rpa-q', state, draw);
      restoreFocus(root, state);

      // Un bouton par section, qui porte déjà le rôle à créer.
      root.querySelectorAll('[data-nouveau]').forEach(b => b.onclick = () =>
        formulairePartenaire(null, draw, b.dataset.nouveau));

      // C'est la LIGNE ENTIÈRE qui ouvre la fiche, comme dans le tableau de
      // bord d'origine : la colonne de boutons « Modifier » a disparu avec les
      // colonnes d'origine, et un bouton par ligne pour une seule action ne
      // valait pas la largeur qu'il prenait.
      // La clé est `id`, l'uuid du CRM — plus `d1_id`, qui n'existe pas sur une
      // fiche créée ici et n'est donc plus un identifiant utilisable.
      root.querySelectorAll('[data-partenaire]').forEach(tr => tr.onclick = () => {
        const a = tous.find(x => String(x.id) === tr.dataset.partenaire);
        if (a) formulairePartenaire(a, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
