// Espace RGD Renova — partenaires
//
// SUPABASE EST LA SOURCE DES PARTENAIRES DEPUIS LE 22/09/2026, et la porte
// SQL a été fermée le 25/09 — les deux dates ne disent pas la même chose.
//
// ⚠ LE 22/09, C'EST LE WORKER QUI A CESSÉ D'ENVOYER la charge `apporteurs`
// (`reprise_crm.js`, `compte.apporteurs = null`). Côté Supabase, en revanche,
// `push_rgd_partenaires` gardait son `insert … on conflict do update` sur
// `rgd_apporteurs` : une porte ouverte que plus personne ne franchissait.
// **Aucune donnée n'a été perdue** — vérifié des deux côtés le 25/09, la
// charge ne contient plus la clé du tout. Elle est néanmoins fermée depuis
// (migration `rgd_apports_et_partenaires_supabase`), pour la raison qui vaut
// ici comme pour les sous-traitants : **un ancien worker redéployé ne peut
// pas ressusciter l'écrasement**, et la porte compte désormais ce qu'elle
// jette (`apporteurs_ignores`).
//
// La leçon tient quand même : couper d'un seul côté laisse un piège armé pour
// le jour où quelqu'un redéploie une ancienne version. Voir
// `js/data/rgd-partenaires.js`, qui porte toute la mécanique d'écriture.
//
// TROIS SECTIONS, REFAITES LE 25/09/2026 SUR DEMANDE DE MICKAEL
// Apporteurs d'affaires ACTIFS · Fournisseurs · Apporteurs d'affaires
// INACTIFS. « Autres partenaires » a disparu, et sa seule fiche a rejoint les
// apporteurs. Le rôle « Commercial » est parti avec : personne ne savait le
// distinguer d'un apporteur, et une valeur qu'on ne sait pas définir finit par
// ramasser tout ce qui ne rentre nulle part.
//
// ⚠ L'ACTIF/INACTIF DÉCOUPE LES APPORTEURS, PAS LES FOURNISSEURS. Un
// fournisseur inactif reste un fournisseur — on ne lui apporte rien, on lui
// achète ; le découper en deux blocs ferait trois sections pour cinq fiches.
// Sa ligne est grisée quand il est inactif, comme avant.
//
// LES COLONNES DISENT L'ARGENT, PLUS LES COORDONNÉES (25/09/2026)
// Email et téléphone sont partis, remplacés par **Montant devis** et **Montant
// commissions**. C'est ce qu'on vient chercher dans une liste de partenaires :
// ce qu'ils rapportent. Les coordonnées sont dans la fiche, qu'un clic ouvre.
//
// ⚠ LES DEUX MONTANTS NE PORTENT PAS SUR LA MÊME POPULATION, et `totauxDe` le
// dit : le devis compte dès qu'il est chiffré, quelle que soit l'issue ; la
// commission ne compte QUE sur les affaires gagnées. Les additionner ou en
// tirer un taux donnerait un chiffre faux.
//
// LE TABLEAU DES APPORTS, EN BAS
// Une ligne par affaire présentée : apporteur, date, client, issue, montant du
// devis, montant de la commission. C'est lui qui alimente les deux colonnes
// ci-dessus — `apports_declares`, le compte tenu à la main dans l'application
// RGD, n'est donc plus ni affiché ni modifiable : un compte saisi et un compte
// constaté ne peuvent pas coexister sur le même écran sans qu'on finisse par
// se demander lequel est vrai.
import { scope } from '../data/scope.js';
import { esc, eur, fmtDate, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { toast, openModal, closeModal, confirm } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { creerPartenaire, majPartenaire, supprimerPartenaire,
         apportsDe, totauxDe, creerApport, majApport, supprimerApport }
  from '../data/rgd-partenaires.js';

// Deux rôles, et pas trois. « Commercial » et « autre » ont été retirés le
// 25/09/2026 : une fiche qui les portait est devenue un apporteur.
const ROLES = {
  apporteur: { label: 'Apporteur d’affaires' },
  fournisseur: { label: 'Fournisseur' },
};

// ⚠ `apporteur` ATTRAPE AUSSI LES FICHES SANS RÔLE, et c'est volontaire : une
// fiche sans type n'est pas une fiche sans intérêt, et la laisser hors des
// sections la ferait disparaître de l'écran — le pire résultat possible pour
// un annuaire.
const estApporteur = (a) => (a.type_partenaire || 'apporteur') !== 'fournisseur';
const estActif = (a) => a.actif !== false;

const SECTIONS = [
  { cle: 'apporteur', titre: 'Apporteurs d’affaires actifs',
    bouton: '+ Nouvel apporteur', couleur: 'var(--accent)', montants: true,
    prend: (a) => estApporteur(a) && estActif(a) },
  { cle: 'fournisseur', titre: 'Fournisseurs',
    bouton: '+ Nouveau fournisseur', couleur: 'var(--blue)', montants: false,
    prend: (a) => !estApporteur(a) },
  { cle: 'inactif', titre: 'Apporteurs d’affaires inactifs',
    bouton: '', couleur: 'var(--muted)', montants: true, cree: 'apporteur',
    prend: (a) => estApporteur(a) && !estActif(a) },
];

const ISSUES = {
  gagne: { label: 'Gagné', ton: 'green' },
  perdu: { label: 'Perdu', ton: 'red' },
};

const nomDe = (a) => [a.prenom, a.nom].filter(Boolean).join(' ').trim()
  || a.societe || a.raison_sociale || '—';

// L'adresse d'un partenaire, sur une ligne. Les morceaux absents ne laissent
// pas de virgule derrière eux.
const adresseDe = (a) => [a.adresse, [a.code_postal, a.ville].filter(Boolean).join(' ')]
  .filter(Boolean).join(', ');

// ------------------------------------------------------- le formulaire fiche

const champ = (cle, libelle, valeur, opts = {}) => `
  <label class="paf-champ ${opts.large ? 'est-large' : ''}">
    <span>${esc(libelle)}</span>
    <input name="${cle}" type="${opts.type || 'text'}"
      ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}
      ${opts.required ? 'required' : ''} value="${esc(valeur ?? '')}">
  </label>`;

const liste = (cle, libelle, options, valeur) => `
  <label class="paf-champ">
    <span>${esc(libelle)}</span>
    <select name="${cle}">
      ${options.map(([k, l]) =>
        `<option value="${esc(k)}"${String(valeur) === String(k) ? ' selected' : ''}>${esc(l)}</option>`).join('')}
    </select>
  </label>`;

const bloc = (titre, dedans) => `
  <section class="paf-bloc">
    <h4>${esc(titre)}</h4>
    <div class="paf-grille">${dedans}</div>
  </section>`;

/**
 * Le formulaire d'un partenaire, créer comme modifier.
 *
 * ⚠ REFAIT LE 25/09/2026 — « améliorer le visuel du formulaire à remplir ».
 * C'était une grille de douze champs à plat, sans respiration ni ordre de
 * lecture : le rôle entre le métier et le téléphone, la convention entre la
 * ville et les apports. Trois blocs maintenant, dans l'ordre où l'on remplit
 * une fiche — qui c'est, comment le joindre, ce qui nous lie.
 *
 * ⚠ L'ADRESSE EST COMPLÈTE : la RUE manque depuis toujours (demandé le
 * 25/09/2026). La colonne `adresse` existait en base et n'était affichée ni
 * saisie nulle part — le relevé la reposait, ce qui est justement ce qu'on
 * vient de couper.
 */
function formulairePartenaire(a, apres, typeDefaut = 'apporteur') {
  const creation = !a;
  const v = a || { type_partenaire: typeDefaut, actif: true };

  const corps = `<form id="paf" class="paf">
    ${bloc('Le partenaire', `
      ${champ('nom', 'Nom', v.nom, { required: true })}
      ${champ('prenom', 'Prénom', v.prenom)}
      ${champ('societe', 'Société', v.societe || v.raison_sociale)}
      ${champ('profession', 'Métier', v.profession, { placeholder: 'Courtier, architecte…' })}
      ${liste('type_partenaire', 'Rôle',
        Object.entries(ROLES).map(([k, r]) => [k, r.label]), v.type_partenaire || 'apporteur')}
      ${liste('actif', 'Suivi',
        [['1', 'Actif'], ['0', 'Inactif']], v.actif === false ? '0' : '1')}`)}

    ${bloc('Comment le joindre', `
      ${champ('telephone', 'Téléphone', v.telephone, { type: 'tel' })}
      ${champ('email', 'E-mail', v.email, { type: 'email' })}
      ${champ('adresse', 'Adresse', v.adresse, { large: true, placeholder: 'Numéro et rue' })}
      ${champ('code_postal', 'Code postal', v.code_postal)}
      ${champ('ville', 'Ville', v.ville)}`)}

    ${bloc('Ce qui nous lie', `
      ${liste('partenariat_signe', 'Convention de partenariat',
        [['0', 'Non signée'], ['1', 'Signée']], v.partenariat_signe ? '1' : '0')}
      ${champ('date_signature', 'Date de signature', v.date_signature, { type: 'date' })}
      <label class="paf-champ est-large"><span>Notes</span>
        <textarea name="notes" rows="3">${esc(v.notes || '')}</textarea></label>`)}

    <div class="paf-pied">
      ${creation ? '' : '<button type="button" class="btn ghost danger" id="paf-suppr">Supprimer</button>'}
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn primary" id="paf-ok">${creation ? 'Créer le partenaire' : 'Enregistrer'}</button>
    </div>
  </form>`;

  openModal(creation ? 'Nouveau partenaire' : `Modifier — ${nomDe(v)}`, corps,
    { wide: true, onOpen: (m) => {
      const form = m.querySelector('#paf');

      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const lu = Object.fromEntries(
          [...form.querySelectorAll('[name]')].map(i => [i.name, i.value.trim()]));
        if (!lu.nom && !lu.societe) return toast('Un nom ou une société, au moins', 'warn');

        // ⚠ UN CHAMP VIDE PART À `null`, jamais à `''` : c'est ainsi qu'on
        // efface un e-mail saisi par erreur, et une chaîne vide en base ne se
        // distingue plus d'une valeur qu'on n'a jamais remplie.
        const champs = Object.fromEntries(
          Object.entries(lu).map(([k, x]) => [k, x === '' ? null : x]));
        champs.actif = lu.actif === '1';
        champs.partenariat_signe = lu.partenariat_signe === '1';

        const ok = m.querySelector('#paf-ok');
        ok.disabled = true; ok.textContent = 'Enregistrement…';
        const r = creation ? await creerPartenaire(champs) : await majPartenaire(a.id, champs);
        if (!r.ok) {
          ok.disabled = false; ok.textContent = creation ? 'Créer le partenaire' : 'Enregistrer';
          return toast(`Non enregistré — ${r.motif}`, 'err');
        }
        closeModal();
        toast(creation ? 'Partenaire créé' : 'Partenaire enregistré');
        apres?.();
      };

      const suppr = m.querySelector('#paf-suppr');
      if (suppr) suppr.onclick = async () => {
        const n = apportsDe(a.id).length;
        if (!await confirm(`Supprimer ${nomDe(a)} ?${n ? ` Ses ${n} apport${n > 1 ? 's' : ''} partiront avec.` : ''}`)) return;
        const r = await supprimerPartenaire(a.id);
        if (!r.ok) return toast(`Non supprimé — ${r.motif}`, 'err');
        closeModal();
        toast('Partenaire supprimé');
        apres?.();
      };
    } });
}

// ------------------------------------------------------- le formulaire apport

/**
 * Un apport d'affaires : qui l'a présenté, quand, pour qui, et ce qu'il a
 * rapporté. Demandé le 25/09/2026.
 *
 * ⚠ L'ISSUE PEUT RESTER VIDE. Mickael a demandé « gagné ou perdu » ; mais on
 * saisit la ligne le jour de l'apport, avant de savoir. Forcer le choix ferait
 * inscrire « perdu » par défaut sur une affaire en cours — l'option « Pas
 * encore tranché » est là pour ça, et la commission ne compte pas tant qu'elle
 * est choisie.
 */
function formulaireApport(apport, partenaires, apres, apporteurDefaut = '') {
  const creation = !apport;
  const v = apport || { apporteur_id: apporteurDefaut, date_apport: new Date().toISOString().slice(0, 10) };
  const choix = partenaires
    .filter(estApporteur)
    .sort((x, y) => nomDe(x).localeCompare(nomDe(y), 'fr'))
    .map(p => [p.id, nomDe(p) + (estActif(p) ? '' : ' (inactif)')]);

  const corps = `<form id="pap" class="paf">
    <div class="paf-grille">
      ${liste('apporteur_id', 'Apporteur', [['', '— Choisir —'], ...choix], v.apporteur_id || '')}
      ${champ('date_apport', 'Date', v.date_apport, { type: 'date' })}
      ${champ('client', 'Client', v.client, { large: true, placeholder: 'Nom du client présenté' })}
      ${liste('issue', 'Issue',
        [['', 'Pas encore tranché'], ['gagne', 'Gagné'], ['perdu', 'Perdu']], v.issue || '')}
      ${champ('montant_devis', 'Montant du devis (€ HT)', v.montant_devis, { type: 'number' })}
      ${champ('montant_commission', 'Commission (€)', v.montant_commission, { type: 'number' })}
    </div>
    <p class="small muted">La commission n’entre dans le total du partenaire que
      si l’affaire est <b>gagnée</b> : le montant du devis, lui, compte dès qu’il est chiffré.</p>
    <div class="paf-pied">
      ${creation ? '' : '<button type="button" class="btn ghost danger" id="pap-suppr">Supprimer</button>'}
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn primary" id="pap-ok">${creation ? 'Ajouter l’apport' : 'Enregistrer'}</button>
    </div>
  </form>`;

  openModal(creation ? 'Nouvel apport' : 'Modifier l’apport', corps, { onOpen: (m) => {
    const form = m.querySelector('#pap');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const lu = Object.fromEntries(
        [...form.querySelectorAll('[name]')].map(i => [i.name, i.value.trim()]));
      if (!lu.apporteur_id) return toast('Choisissez l’apporteur', 'warn');

      const nombre = (x) => x === '' ? null : Number(x);
      const champs = {
        apporteur_id: lu.apporteur_id,
        date_apport: lu.date_apport || null,
        client: lu.client || null,
        issue: lu.issue || null,
        montant_devis: nombre(lu.montant_devis),
        montant_commission: nombre(lu.montant_commission),
      };
      const ok = m.querySelector('#pap-ok');
      ok.disabled = true; ok.textContent = 'Enregistrement…';
      const r = creation ? await creerApport(champs) : await majApport(apport.id, champs);
      if (!r.ok) {
        ok.disabled = false; ok.textContent = creation ? 'Ajouter l’apport' : 'Enregistrer';
        return toast(`Non enregistré — ${r.motif}`, 'err');
      }
      closeModal(); toast(creation ? 'Apport ajouté' : 'Apport enregistré'); apres?.();
    };

    const suppr = m.querySelector('#pap-suppr');
    if (suppr) suppr.onclick = async () => {
      if (!await confirm('Supprimer cet apport ?')) return;
      const r = await supprimerApport(apport.id);
      if (!r.ok) return toast(`Non supprimé — ${r.motif}`, 'err');
      closeModal(); toast('Apport supprimé'); apres?.();
    };
  } });
}

// ------------------------------------------------------------------- l'écran

export const rgdPartenairesPage = {
  title: () => 'RGD Renova — Partenaires',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // Une seule porte : la policy `rgd_apporteurs_acces`, dont `scope.canRgd`
    // est le miroir exact. Plus aucun compte de l'application RGD n'est exigé.
    const state = { q: '', focus: null, ecriture: scope.canRgd };

    const draw = () => {
      const tous = scope.rgd('rgd_apporteurs');
      const ts = terms(state.q);
      const vus = tous.filter(a =>
        hit([nomDe(a), a.societe, a.raison_sociale, a.profession, a.ville, adresseDe(a)], ts));

      const ligne = (a, sec) => {
        const t = totauxDe(a.id);
        return `<tr ${state.ecriture ? `data-partenaire="${esc(String(a.id))}"` : ''}>
          <td><b>${esc(a.nom || nomDe(a))}</b></td>
          <td>${esc(a.prenom || '—')}</td>
          <td class="pa-bleu">${esc(a.societe || a.raison_sociale || '—')}</td>
          <td class="pa-bleu">${esc(a.profession || '—')}</td>
          ${sec.montants ? `
          <td class="num">${t.devis ? esc(eur(t.devis)) : '<span class="muted">—</span>'}
            ${t.apports ? `<div class="s muted">${t.apports} apport${t.apports > 1 ? 's' : ''}${
              t.gagnes ? ` · ${t.gagnes} gagné${t.gagnes > 1 ? 's' : ''}` : ''}</div>` : ''}</td>
          <td class="num">${t.commission ? `<b>${esc(eur(t.commission))}</b>` : '<span class="muted">—</span>'}</td>`
          : '<td class="muted">—</td><td class="muted">—</td>'}
        </tr>`;
      };

      const section = (sec) => {
        const lignes = vus.filter(sec.prend);
        // ⚠ LA SECTION DES INACTIFS NE S'AFFICHE QUE SI ELLE PORTE QUELQU'UN.
        // Un bloc vide intitulé « Apporteurs inactifs » occupe une place et
        // n'apprend rien ; il réapparaît au premier partenaire désactivé.
        if (sec.cle === 'inactif' && !lignes.length && !state.q) return '';
        return `
        <section class="card pa-sect" style="--pa-trait:${sec.couleur}">
          <div class="pa-head">
            <h3>${esc(sec.titre)}</h3>
            <span class="pa-compte" style="background:${sec.couleur}">${lignes.length}</span>
            <span class="grow"></span>
            ${state.ecriture && sec.bouton
              ? `<button type="button" class="btn primary" data-nouveau="${esc(sec.cle)}">${esc(sec.bouton)}</button>`
              : ''}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>Prénom</th><th>Société</th><th>Profession</th>
                <th class="num">Montant devis</th><th class="num">Montant commissions</th></tr></thead>
              <tbody>${lignes.map(a => ligne(a, sec)).join('')
                || `<tr><td colspan="6"><div class="empty">${
                  state.q ? 'Aucun résultat dans cette catégorie.'
                    : 'Personne pour le moment.'}</div></td></tr>`}</tbody>
            </table>
          </div>
        </section>`;
      };

      // Le tableau des apports, en bas : une ligne par affaire présentée.
      const apports = scope.rgd('rgd_apports')
        .slice()
        .sort((a, b) => String(b.date_apport || '').localeCompare(String(a.date_apport || '')));
      const parId = new Map(tous.map(a => [a.id, a]));
      const totalDevis = apports.reduce((t, a) => t + (Number(a.montant_devis) || 0), 0);
      const totalCom = apports.reduce((t, a) =>
        t + (a.issue === 'gagne' ? (Number(a.montant_commission) || 0) : 0), 0);

      const tableauApports = () => `
        <section class="card pa-sect" style="--pa-trait:var(--green)">
          <div class="pa-head">
            <h3>Apports d’affaires</h3>
            <span class="pa-compte" style="background:var(--green)">${apports.length}</span>
            <span class="grow"></span>
            ${state.ecriture ? '<button type="button" class="btn primary" id="pa-apport">+ Nouvel apport</button>' : ''}
          </div>
          ${apports.length ? `<div class="rcl-total">
            <span>Total des apports
              <span class="s muted">· ${apports.length} affaire${apports.length > 1 ? 's' : ''} présentée${apports.length > 1 ? 's' : ''}</span></span>
            <span><b>${esc(eur(totalDevis))}</b> <span class="s muted">de devis ·</span>
              <b>${esc(eur(totalCom))}</b> <span class="s muted">de commissions</span></span>
          </div>` : ''}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Apporteur</th><th>Date</th><th>Client</th><th>Issue</th>
                <th class="num">Montant devis</th><th class="num">Commission</th></tr></thead>
              <tbody>${apports.map(x => {
                const p = parId.get(x.apporteur_id);
                const i = ISSUES[x.issue];
                return `<tr ${state.ecriture ? `data-apport="${esc(String(x.id))}"` : ''}>
                  <td><b>${esc(p ? nomDe(p) : '—')}</b></td>
                  <td class="small">${x.date_apport ? esc(fmtDate(x.date_apport)) : '<span class="muted">—</span>'}</td>
                  <td>${esc(x.client || '—')}</td>
                  <td>${i ? `<span class="chip ${i.ton}">${esc(i.label)}</span>`
                          : '<span class="muted small">Pas encore tranché</span>'}</td>
                  <td class="num">${x.montant_devis != null ? esc(eur(x.montant_devis)) : '<span class="muted">—</span>'}</td>
                  <td class="num">${x.montant_commission != null
                    ? `<span class="${x.issue === 'gagne' ? '' : 'muted'}">${esc(eur(x.montant_commission))}</span>`
                    : '<span class="muted">—</span>'}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="6"><div class="empty">Aucun apport enregistré pour le moment.</div></td></tr>`}</tbody>
            </table>
          </div>
          <p class="small muted">La commission ne compte dans les totaux que sur une
            affaire <b>gagnée</b> — elle reste grisée tant que l’issue n’est pas tranchée.</p>
        </section>`;

      const corps = `
        <div class="toolbar">
          ${searchInput('rpa-q', state, 'Rechercher un partenaire, un métier, une ville…')}
          <span class="grow"></span>
          <span class="muted small">${state.ecriture
            ? 'Cliquez sur une ligne pour ouvrir la fiche'
            : 'Lecture seule'}</span>
        </div>
        ${SECTIONS.map(section).join('')}
        ${tableauApports()}`;

      root.innerHTML = cadre('#/rgd/partenaires', 'Partenaires', corps);
      bindSearch(root, 'rpa-q', state, draw);
      restoreFocus(root, state);

      root.querySelectorAll('[data-nouveau]').forEach(b => b.onclick = () => {
        const sec = SECTIONS.find(s => s.cle === b.dataset.nouveau);
        formulairePartenaire(null, draw, sec?.cree || sec?.cle || 'apporteur');
      });
      root.querySelectorAll('[data-partenaire]').forEach(tr => tr.onclick = () => {
        const a = tous.find(x => String(x.id) === tr.dataset.partenaire);
        if (a) formulairePartenaire(a, draw);
      });

      const bApport = root.querySelector('#pa-apport');
      if (bApport) bApport.onclick = () => formulaireApport(null, tous, draw);
      root.querySelectorAll('[data-apport]').forEach(tr => tr.onclick = () => {
        const x = apports.find(y => String(y.id) === tr.dataset.apport);
        if (x) formulaireApport(x, tous, draw);
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
