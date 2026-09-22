// Espace RGD Renova — partenaires et achats
//
// ÉTAPE 4 DE LA MIGRATION, RANG 5 — en écriture depuis le 22/09/2026.
//
// ⚠ LES DEUX MOITIÉS DE CET ÉCRAN N'ÉCRIVENT PLUS AU MÊME ENDROIT.
//
// **Les apporteurs sont passés à Supabase** le 22/09/2026 — première table de
// la phase 2. L'écran les crée et les modifie EN DIRECT, avec `db.insert` et
// `db.update`, sans traverser le worker et sans traduire un seul nom de champ.
// Le relevé ne les envoie plus, et `d1_id` est devenu nullable : une fiche née
// ici n'a pas d'origine Cloudflare, et n'en a pas besoin.
//
// **Les achats, eux, passent encore par le worker** (`PATCH /api/fournitures/:id`),
// parce que `rgd_fournitures` porte un `chantier_id` qui désigne un chantier de
// D1 : la basculer avant les chantiers laisserait un achat rattaché à une
// référence que Supabase ne saurait pas résoudre. Ils suivront.
//
// D'où deux styles dans le même fichier. Ce n'est pas une incohérence, c'est
// une bascule en cours — et la retenir vaut mieux que de l'uniformiser trop
// tôt dans un sens ou dans l'autre.
//
// POURQUOI LES DEUX SUR LE MÊME ÉCRAN
// Un apporteur envoie du travail, un fournisseur en vend la matière : ce sont
// deux faces de la même question, « avec qui on travaille ». Et surtout, les
// achats tiennent aujourd'hui en UNE ligne — leur consacrer un écran entier
// ferait une page vide avec un titre dessus.
//
// DEUX COMPTES D'APPORTS, ET C'EST VOULU
// `apports_declares` vient de `nb_prospects_manuel` : quelqu'un l'a saisi à la
// main. « Rattachés » est le nombre de fiches clients qui désignent vraiment ce
// partenaire (`rgd_clients.apporteur_id`), repris au rang 6.
//
// Jusqu'au rang 6, cet écran affichait « le CRM ne sait pas rattacher une
// affaire à son apporteur ». C'était vrai, mais la raison n'était pas celle
// qu'on croyait : le lien existait dans D1 depuis le début, il n'était
// simplement pas relevé. La phrase est tombée avec la colonne.
//
// Les deux comptes peuvent diverger, et c'est une information : un apporteur
// crédité à la main sans aucune fiche rattachée, c'est soit une saisie
// optimiste, soit un rattachement oublié. L'écran montre les deux plutôt que
// d'en choisir un.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { peutEcrire, creerFourniture, majFourniture } from '../data/rgd-api.js';
import { toast, openModal, closeModal } from '../ui.js';

// Les trois rôles que D1 range dans la même table. L'ordre est celui de
// l'intérêt commercial : celui qui apporte des affaires d'abord.
const ROLES = {
  apporteur:  { label: 'Apporteur', ton: 'green' },
  commercial: { label: 'Commercial', ton: 'accent' },
  fournisseur: { label: 'Fournisseur', ton: 'muted' },
};
const role = (k) => ROLES[k] || { label: k || 'Non précisé', ton: 'muted' };

const nomDe = (a) => [a.prenom, a.nom].filter(Boolean).join(' ').trim() || a.societe || '—';

// Le formulaire d'un partenaire. Il sert à créer comme à modifier : le worker
// a deux routes mais les mêmes champs, et deux formulaires jumeaux finissent
// toujours par diverger sur un détail.
function formulairePartenaire(a, apres) {
  const creation = !a;
  const v = a || {};
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

// Le formulaire d'un achat. ⚠ `chantier_id` est EXIGÉ par le worker à la
// création (400 sans lui), alors que le relevé accepte une fourniture sans
// chantier : on ne peut donc pas créer ici un achat non rattaché, et la modale
// le dit plutôt que de le laisser découvrir.
function formulaireAchat(f0, chantiers, apres) {
  const creation = !f0;
  const v = f0 || {};
  const mats = Array.isArray(v.materiau) ? v.materiau : [];
  const corps = `
    <form id="ac-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
      <label class="reg-champ" style="grid-column:1/-1">
        <span>Chantier ${creation ? '*' : ''}</span>
        <select name="chantier" ${creation ? 'required' : ''}>
          <option value="">${creation ? 'Choisir un chantier…' : 'Ne pas changer'}</option>
          ${chantiers.map(c => `<option value="${esc(String(c.d1_id))}" ${
            !creation && c.deal_id && c.deal_id === v.deal_id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}
        </select>
      </label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Libellé *</span>
        <input name="libelle" required value="${esc(v.libelle || '')}"></label>
      <label class="reg-champ"><span>Fournisseur</span>
        <input name="fournisseur" value="${esc(v.fournisseur || '')}"></label>
      <label class="reg-champ"><span>Date d’achat</span>
        <input name="date_achat" type="date" value="${esc(v.date_achat || '')}"></label>
      <label class="reg-champ"><span>Montant HT (€)</span>
        <input name="montant_ht" inputmode="decimal" value="${v.montant_ht != null ? esc(String(v.montant_ht)) : ''}"></label>
      <label class="reg-champ"><span>Montant TTC (€)</span>
        <input name="montant_ttc" inputmode="decimal" value="${v.montant_ttc != null ? esc(String(v.montant_ttc)) : ''}"></label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Matériaux</span>
        <input name="materiau" value="${esc(mats.join(', '))}" placeholder="Béton, Charpente bois"></label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Référence facture</span>
        <input name="reference_facture" value="${esc(v.reference_facture || '')}"></label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Notes</span>
        <textarea name="notes" rows="2">${esc(v.notes || '')}</textarea></label>
    </form>
    <p class="small muted">Les <b>matériaux</b> se séparent par des virgules.
    ${creation ? 'Un achat créé ici doit être rattaché à un chantier : le tableau de bord le refuse sans. ' : ''}
    La ligne apparaîtra dans cette liste au prochain relevé.</p>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn primary" id="ac-ok">${creation ? 'Créer l’achat' : 'Enregistrer'}</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <span class="grow"></span><span class="muted small" id="ac-etat"></span>
    </div>`;

  openModal(creation ? 'Nouvel achat' : `Modifier — ${v.libelle || 'achat'}`, corps, { onOpen: (m) => {
    m.querySelector('#ac-ok').onclick = async () => {
      const form = m.querySelector('#ac-form');
      if (!form.reportValidity()) return;
      const d = Object.fromEntries(new FormData(form).entries());
      const champs = { libelle: d.libelle.trim() };
      if (d.chantier) champs.chantier_id = Number(d.chantier);
      for (const k of ['fournisseur', 'reference_facture', 'notes']) {
        if (d[k] && d[k].trim()) champs[k] = d[k].trim();
        else if (!creation) champs[k] = null;
      }
      if (d.date_achat) champs.date_achat = d.date_achat;
      else if (!creation) champs.date_achat = null;
      // Une liste vide s'envoie comme une liste vide — c'est ainsi qu'on RETIRE
      // les matériaux d'un achat. Mais il n'y a rien à retirer d'un achat qui
      // n'existe pas encore : à la création, un champ vide ne part pas.
      const mats = d.materiau.split(',').map(x => x.trim()).filter(Boolean);
      if (mats.length || !creation) champs.materiau = mats;
      for (const k of ['montant_ht', 'montant_ttc']) {
        const brut = String(d[k] || '').trim();
        if (!brut) { if (!creation) champs[k] = null; continue; }
        const n = Number(brut.replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(n)) {
          toast(`Le ${k === 'montant_ht' ? 'montant HT' : 'montant TTC'} n’est pas un nombre`, 'err');
          return;
        }
        champs[k] = n;
      }

      const b = m.querySelector('#ac-ok');
      b.disabled = true;
      m.querySelector('#ac-etat').textContent = 'Envoi au tableau de bord…';
      const r = creation ? await creerFourniture(champs) : await majFourniture(v.d1_id, champs);
      b.disabled = false;
      m.querySelector('#ac-etat').textContent = '';
      if (!r.ok) {
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : rien n’a été enregistré.'
          : `Non enregistré — ${r.motif}`, 'err');
        return;
      }
      if (!creation) {
        Object.assign(v, champs);
        // `chantier_id` est le nom de D1 ; la ligne du CRM porte `deal_id`.
        // Le laisser là afficherait un chantier faux jusqu'au relevé.
        delete v.chantier_id;
      }
      closeModal();
      toast(creation
        ? 'Achat créé — visible ici au prochain relevé'
        : 'Achat enregistré dans le tableau de bord');
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
    const state = { vue: 'partenaires', q: '', focus: null,
                    ecriture: false, ecritureLocale: scope.canRgd };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

    const draw = () => {
      const tous = scope.rgd('rgd_apporteurs');
      const achats = scope.rgd('rgd_fournitures');
      // Les chantiers, pour rattacher un achat. On envoie le `d1_id` — celui
      // de Cloudflare —, jamais l'uuid de l'affaire, que le worker ne connaît
      // pas. Un chantier sans `d1_id` ne peut donc pas être proposé.
      const chantiers = scope.rgd('rgd_chantiers')
        .filter(c => c.d1_id)
        .map(c => ({ d1_id: c.d1_id, deal_id: c.deal_id,
                     nom: (c.deal_id && db.byId('deals', c.deal_id)?.title) || `Chantier ${c.d1_id}` }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      const fiches = scope.rgd('rgd_clients');
      const rattaches = (a) => fiches.filter(c => c.apporteur_id === a.id).length;
      const actifs = tous.filter(a => a.actif !== false);
      const declares = tous.reduce((t, a) => t + (Number(a.apports_declares) || 0), 0);
      const signes = tous.filter(a => a.partenariat_signe).length;
      const totalAchats = achats.reduce((t, f) => t + (Number(f.montant_ht) || 0), 0);

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

      const corps = `
        <div class="esp-kpis">
          ${kpiEspace({ label: 'Partenaires actifs', valeur: actifs.length,
            sous: tous.length > actifs.length ? `${tous.length - actifs.length} inactif${tous.length - actifs.length > 1 ? 's' : ''}` : 'tous actifs',
            icone: '🤝', href: '#/rgd/partenaires' })}
          ${kpiEspace({ label: 'Clients apportés', valeur: tous.reduce((t, a) => t + rattaches(a), 0),
            sous: `${declares} déclaré${declares > 1 ? 's' : ''} à la main côté RGD`, icone: '↗',
            ton: 'accent', href: '#/rgd/partenaires' })}
          ${kpiEspace({ label: 'Partenariats signés', valeur: signes,
            sous: signes < tous.length ? `${tous.length - signes} sans convention` : 'tous signés',
            icone: '✍', ton: signes ? 'green' : 'amber', href: '#/rgd/partenaires' })}
          ${kpiEspace({ label: 'Achats fournisseurs', valeur: eur(totalAchats),
            sous: `${achats.length} achat${achats.length > 1 ? 's' : ''} enregistré${achats.length > 1 ? 's' : ''}`,
            icone: '🧾', href: '#/rgd/partenaires' })}
        </div>

        ${signes === 0 && tous.length ? `<div class="alert">
          <b>!</b>
          <div><b>Aucun partenariat n’est signé.</b> Les ${tous.length} partenaires
          travaillent sans convention enregistrée — ce qui ne les empêche pas
          d’apporter des affaires, mais ne fixe rien sur la rémunération de
          l’apport. ${state.ecritureLocale
            ? 'La convention se note sur la fiche du partenaire, bouton <b>Modifier</b> au bout de la ligne.'
            : 'Les conventions se saisissent dans l’<a href="#/rgd/app">application RGD</a>.'}</div>
        </div>` : ''}

        <div class="pill-tabs">
          <button type="button" data-vue="partenaires" class="${state.vue === 'partenaires' ? 'on' : ''}">Partenaires<span>${tous.length}</span></button>
          <button type="button" data-vue="achats" class="${state.vue === 'achats' ? 'on' : ''}">Achats<span>${achats.length}</span></button>
        </div>

        ${state.vue === 'partenaires' ? `
        <div class="toolbar">
          ${searchInput('rpa-q', state, 'Rechercher un partenaire, un métier, une ville…')}
          <span class="grow"></span>
          <span class="muted small">ceux qui apportent le plus en premier</span>
          ${state.ecritureLocale ? '<button type="button" class="btn primary" id="rpa-nouveau">+ Nouveau partenaire</button>' : ''}
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Partenaire</th><th>Rôle</th><th>Métier</th><th>Ville</th>
              <th>Contact</th><th>Convention</th>
              <th class="num" title="Fiches clients qui désignent ce partenaire">Rattachés</th>
              <th class="num" title="Compté à la main dans l’application RGD">Déclarés</th>
              ${state.ecritureLocale ? '<th></th>' : ''}</tr></thead>
            <tbody>${vus.map(a => { const r = role(a.type_partenaire); return `<tr class="${a.actif === false ? 'muted' : ''}">
              <td><b>${esc(nomDe(a))}</b>
                  ${a.actif === false ? '<span class="chip">Inactif</span>' : ''}
                  ${a.societe ? `<div class="s muted">${esc(a.societe)}</div>` : ''}</td>
              <td><span class="chip ${r.ton}">${esc(r.label)}</span></td>
              <td class="muted">${esc(a.profession || '—')}</td>
              <td class="muted">${esc([a.ville, a.code_postal].filter(Boolean).join(' · ') || '—')}</td>
              <td>${a.telephone ? esc(a.telephone) : '<span class="muted">—</span>'}
                  ${a.email ? `<div class="s muted">${esc(a.email)}</div>` : ''}</td>
              <td>${a.partenariat_signe
                ? `<span class="chip green">Signée${a.date_signature ? ' · ' + esc(fmtDate(a.date_signature)) : ''}</span>`
                : '<span class="chip amber">Non signée</span>'}</td>
              <td class="num">${rattaches(a) || '<span class="muted">—</span>'}</td>
              <td class="num muted">${Number(a.apports_declares) ? esc(String(a.apports_declares)) : '—'}</td>
              ${state.ecritureLocale ? `<td class="num">
                <button type="button" class="btn ghost sm" data-partenaire="${esc(String(a.id))}">Modifier</button>
              </td>` : ''}
            </tr>`; }).join('') || `<tr><td colspan="${state.ecritureLocale ? 9 : 8}"><div class="empty">Aucun partenaire ne correspond.</div></td></tr>`}</tbody>
          </table>
          <p class="small muted"><b>Rattachés</b> compte les fiches clients qui désignent
          vraiment ce partenaire ; <b>Déclarés</b> est le compte tenu à la main dans
          l&rsquo;application RGD. Un écart entre les deux n&rsquo;est pas une erreur du CRM :
          c&rsquo;est soit une saisie optimiste, soit un rattachement oublié à la création
          du client.</p>
        </section>` : `
        <div class="toolbar">
          <span class="muted small">${achats.length} achat${achats.length > 1 ? 's' : ''}
          pour ${eur(totalAchats)} HT</span>
          <span class="grow"></span>
          ${state.ecriture && chantiers.length ? '<button type="button" class="btn primary" id="rpa-achat">+ Nouvel achat</button>' : ''}
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Achat</th><th>Fournisseur</th><th>Chantier</th>
              <th>Matériaux</th><th class="num">Montant HT</th>
              ${state.ecriture ? '<th></th>' : ''}</tr></thead>
            <tbody>${achats.slice()
              .sort((a, b) => String(b.date_achat || '').localeCompare(String(a.date_achat || '')))
              .map(f => {
                const affaire = f.deal_id ? db.byId('deals', f.deal_id) : null;
                // `materiau` est la liste que D1 stocke en JSON. Une liste vide
                // et une liste absente se disent pareil à l'écran : rien.
                const mats = Array.isArray(f.materiau) ? f.materiau : [];
                return `<tr>
                  <td>${f.date_achat ? fmtDate(f.date_achat) : '<span class="muted">—</span>'}</td>
                  <td><b>${esc(f.libelle || '—')}</b>
                      ${f.reference_facture ? `<div class="s muted">Facture ${esc(f.reference_facture)}</div>` : ''}</td>
                  <td>${esc(f.fournisseur || '—')}</td>
                  <td>${affaire ? esc(affaire.title) : '<span class="muted small">sans chantier</span>'}</td>
                  <td>${mats.length ? mats.map(m => `<span class="chip">${esc(m)}</span>`).join(' ') : '<span class="muted">—</span>'}</td>
                  <td class="num">${eur(f.montant_ht)}</td>
                  ${state.ecriture ? `<td class="num">${f.d1_id
                    ? `<button type="button" class="btn ghost sm" data-achat="${esc(String(f.d1_id))}">Modifier</button>`
                    : ''}</td>` : ''}
                </tr>`;
              }).join('') || `<tr><td colspan="${state.ecriture ? 7 : 6}"><div class="empty">Aucun achat enregistré.</div></td></tr>`}</tbody>
          </table>
        </section>`}`;

      root.innerHTML = cadre('#/rgd/partenaires', 'Partenaires', corps);
      if (state.vue === 'partenaires') { bindSearch(root, 'rpa-q', state, draw); restoreFocus(root, state); }
      root.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { state.vue = b.dataset.vue; draw(); });

      const nouveau = root.querySelector('#rpa-nouveau');
      if (nouveau) nouveau.onclick = () => formulairePartenaire(null, draw);
      const achat = root.querySelector('#rpa-achat');
      if (achat) achat.onclick = () => formulaireAchat(null, chantiers, draw);

      // La clé est `id`, l'uuid du CRM — plus `d1_id`, qui n'existe pas sur une
      // fiche créée ici et n'est donc plus un identifiant utilisable.
      root.querySelectorAll('[data-partenaire]').forEach(b => b.onclick = () => {
        const a = tous.find(x => String(x.id) === b.dataset.partenaire);
        if (a) formulairePartenaire(a, draw);
      });
      root.querySelectorAll('[data-achat]').forEach(b => b.onclick = () => {
        const f = achats.find(x => String(x.d1_id) === b.dataset.achat);
        if (f) formulaireAchat(f, chantiers, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
