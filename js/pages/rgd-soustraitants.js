// Espace RGD Renova — sous-traitants
//
// ÉTAPE 4 DE LA MIGRATION, RANG 3 — puis, le 22/09/2026, LE DERNIER VERROU.
// L'écran était en lecture seule. Il ne l'est plus, et pas par goût de
// l'uniformité : les attestations ne se déposaient QUE dans le tableau de bord,
// donc éteindre Surge éteignait le seul endroit où l'on peut prouver qu'un
// artisan est en règle. Le dépôt, la relance et la conversion passent par
// `js/pages/rgd-st-pieces.js`, qui écrit à la SOURCE — D1 — et jamais dans le
// reflet, qu'un relevé de trente minutes écraserait sans un mot.
//
// POURQUOI LES ATTESTATIONS PASSENT AVANT L'ARGENT
// Un sous-traitant sans attestation de vigilance à jour, c'est le donneur
// d'ordre qui répond du travail dissimulé ; sans décennale, c'est RGD Renova
// qui porte le sinistre. Au 21/09/2026, **onze sous-traitants sur treize
// n'ont aucun document enregistré** et une attestation URSSAF est expirée.
// L'écran met donc la conformité en premier et l'argent en second — l'inverse
// de ce qu'on fait d'habitude, et c'est volontaire.
//
// ACTIFS ET POTENTIELS NE SE MÉLANGENT PAS — corrigé le 22/09/2026
// `sous_traitants` de D1 porte DEUX drapeaux qui se ressemblent et ne disent
// pas la même chose :
//
//   `statut_relation`  'actif' = on travaille avec lui ; 'potentiel' = artisan
//                      repéré en prospection, avec qui on n'a jamais rien fait
//   `actif`            le partenaire est-il encore en activité chez nous
//
// Le relevé n'envoyait que le second. Résultat : les onze artisans en
// prospection arrivaient dans le CRM comme des sous-traitants actifs, et
// l'alarme de conformité annonçait « 11 sous-traitants actifs n'ont aucune
// pièce enregistrée » — ce qui était vrai au mot près et faux sur le fond :
// on ne demande pas une attestation de vigilance à quelqu'un qu'on n'a pas
// encore fait travailler. Les deux vrais sous-traitants sont les seuls à
// porter un SIRET, et ce sont des fiches d'essai.
//
// L'écran sépare donc les deux populations, et **la conformité ne regarde que
// les actifs**. Les potentiels sont rangés par corps de métier, comme dans le
// tableau de bord d'origine : on les consulte pour trouver un couvreur, pas
// pour relancer un dossier.
//
// CE QUE LA PASTILLE DIT MAINTENANT (24/09/2026)
// Les pièces vivent dans le CRM depuis que le dépôt y est passé : la liste
// sait donc enfin distinguer une attestation déposée d'une simple DATE venue
// de la synchronisation, qui n'a aucun document derrière. Les deux se
// ressemblaient et ne valent pas la même chose — c'est un document qu'on
// présente en cas de contrôle, pas une date saisie dans un logiciel. D'où la
// pastille « Sans doc. », rouge comme « Absent ».
//
// CE QUI N'EST PAS OUVERT ICI, ET POURQUOI
// Supprimer une pièce déposée : ce geste retire une preuve de conformité, et
// il reste fermé tant que personne n'a dit qui doit pouvoir le faire.
import { scope } from '../data/scope.js';
import { db } from '../data/db.js';
import { esc, eur, fmtDate, fmtDateTime, terms, hit, searchInput, bindSearch, restoreFocus } from '../ui.js';
import { poserEspace, kpiEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { peutEcrire, convertirSt, creerSousTraitant, majSousTraitant,
         activerSousTraitant, remettreEnProspection, supprimerSousTraitant } from '../data/rgd-api.js';
import { toast, openModal, closeModal } from '../ui.js';
import { ouvrirPiecesSt, ouvrirRelanceSt } from './rgd-st-pieces.js';
import { PIECES_ST, piecesDe, etatPiece } from '../data/rgd-pieces.js';

// Les quatre pièces qu'un sous-traitant doit tenir à jour, prises dans la
// liste des huit — une seule déclaration, dans `js/data/rgd-pieces.js`, pour
// que la liste, le panneau et le mail de relance parlent des mêmes documents.
// L'ordre est celui du risque : le travail dissimulé et la décennale d'abord.
const COURT = { vigilance: 'Vig.', decennale: 'Déc.', urssaf: 'URSSAF', kbis: 'Kbis' };
const PIECES = PIECES_ST.filter(p => COURT[p.key]).map(p => ({ ...p, court: COURT[p.key] }));

// L'état d'une pastille. ⚠ IL NE SE LIT PLUS SUR LA SEULE DATE : une date sans
// document derrière n'est pas une attestation, et c'est un document qu'on
// présente en cas de contrôle. `etatPiece` croise donc les deux, et le libellé
// court dit lequel des deux manque.
const COURT_ETAT = { absent: 'Absent', 'sans-doc': 'Sans doc.', expire: 'Expiré',
  'sans-date': 'Sans date', bientot: null, ok: null };
const pastille = (st, pieces, p) => {
  const e = etatPiece(st, pieces, p);
  return { ...e, label: COURT_ETAT[e.cle] || e.texte };
};

// Faire passer un artisan repéré en prospection au rang de sous-traitant.
//
// ⚠ CE GESTE N'EST PAS UN CHANGEMENT D'ÉTIQUETTE. À partir de là, l'absence
// d'attestation de vigilance engage le donneur d'ordre et l'absence de
// décennale met le sinistre à la charge de RGD Renova. La modale le dit avant,
// et propose d'enchaîner sur le dépôt des pièces — c'est le moment où on les
// demande, pas trois mois plus tard.
function formulaireConversion(st, apres) {
  const corps = `
    <div class="alert">
      <b>!</b>
      <div><b>${esc(st.raison_sociale || 'Cet artisan')} deviendra un sous-traitant actif.</b>
      Les obligations de conformité s&rsquo;ouvrent à cet instant : sans attestation de
      vigilance à jour, c&rsquo;est le donneur d&rsquo;ordre qui répond du travail dissimulé ;
      sans décennale, c&rsquo;est RGD Renova qui porte le sinistre.</div>
    </div>
    <form id="cv-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
      <label class="reg-champ"><span>Contact</span><input name="contact_nom" value="${esc(st.contact_nom || '')}"></label>
      <label class="reg-champ"><span>SIRET</span><input name="siret" value="${esc(st.siret || '')}"></label>
      <label class="reg-champ"><span>Email</span><input name="email" type="email" value="${esc(st.email || '')}"></label>
      <label class="reg-champ"><span>Téléphone</span><input name="telephone" value="${esc(st.telephone || '')}"></label>
      <label class="reg-champ" style="grid-column:1/-1">
        <span>Spécialités</span><input name="specialites" value="${esc(st.specialites || '')}"></label>
    </form>
    <p class="small muted">Sans email, aucune relance de documents ne pourra partir :
    l’envoi est refusé faute d’adresse. La fiche reste modifiable ensuite.</p>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn primary" id="cv-ok">Convertir en actif</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <span class="grow"></span><span class="muted small" id="cv-etat"></span>
    </div>`;

  openModal(`Convertir — ${st.raison_sociale || 'sans nom'}`, corps, { onOpen: (m) => {
    m.querySelector('#cv-ok').onclick = async () => {
      const d = Object.fromEntries(new FormData(m.querySelector('#cv-form')).entries());
      // Un champ vide n'est pas envoyé : le worker écrirait une chaîne vide là
      // où l'absence de valeur veut dire « on ne sait pas encore ».
      const champs = {};
      for (const k of ['contact_nom', 'siret', 'email', 'telephone', 'specialites']) {
        if (d[k] && d[k].trim()) champs[k] = d[k].trim();
      }
      const b = m.querySelector('#cv-ok');
      b.disabled = true;
      m.querySelector('#cv-etat').textContent = 'Envoi au tableau de bord…';
      const r = await convertirSt(st.d1_id, champs);
      b.disabled = false;
      m.querySelector('#cv-etat').textContent = '';
      if (!r.ok) {
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : rien n’a été converti.'
          : `Non converti — ${r.motif}`, 'err');
        return;
      }
      // On avance la fiche à l'écran : le relevé mettra jusqu'à trente minutes
      // à la faire changer de table, et la voir rester « en prospection »
      // donnerait envie de recommencer.
      st.statut_relation = 'actif';
      Object.assign(st, champs);
      closeModal();
      toast(`${st.raison_sociale || 'L’artisan'} est maintenant un sous-traitant actif`);
      apres?.();
      // Enchaîner sur les pièces : c'est la suite logique du geste, et le seul
      // moment où on est sûr que quelqu'un s'occupe de ce dossier.
      ouvrirPiecesSt(st);
    };
  } });
}

// Le formulaire d'un sous-traitant — création et modification, actif comme en
// prospection. Les champs sont ceux du formulaire « potentiel » d'origine :
// corps de métier, nom, téléphone, mail, adresse, commentaires. Pas les huit
// dates de pièces, qui se déposent par le panneau « Pièces » et se datent
// depuis le document lui-même : les retaper ici ouvrirait la porte à une date
// sans document derrière, exactement l'état que l'écran passe son temps à
// dénoncer.
//
// ⚠ Les noms des champs sont les mêmes de part et d'autre (`raison_sociale`,
// `specialites`, `telephone`, `email`, `adresse`, `notes`, `statut_relation`) :
// c'est l'exception dans cet espace, et `rgd-api.js` le dit. Le worker ignore
// en silence un champ qu'il ne connaît pas et répond quand même `{ ok: true }`,
// donc une faute de frappe se lirait « enregistré » sans rien enregistrer.
function formulaireSousTraitant(st, apres, statutDefaut) {
  const creation = !st;
  const v = st || {};
  const statut = statutDefaut || v.statut_relation || 'actif';
  const potentiel = statut === 'potentiel';
  const corps = `
    <form id="st-form" class="reg-grille" style="grid-template-columns:1fr 1fr">
      <label class="reg-champ"><span>Corps de métier</span>
        <input name="specialites" value="${esc(v.specialites || '')}"
               placeholder="Couverture, Maçonnerie, Fenêtres…"></label>
      <label class="reg-champ"><span>Nom de l’artisan / société *</span>
        <input name="raison_sociale" required value="${esc(v.raison_sociale || '')}"></label>
      <label class="reg-champ"><span>Téléphone</span>
        <input name="telephone" value="${esc(v.telephone || '')}"></label>
      <label class="reg-champ"><span>Email</span>
        <input name="email" type="email" value="${esc(v.email || '')}"></label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Adresse complète</span>
        <input name="adresse" value="${esc(v.adresse || '')}"></label>
      <label class="reg-champ" style="grid-column:1/-1"><span>Commentaires</span>
        <textarea name="notes" rows="2">${esc(v.notes || '')}</textarea></label>
    </form>
    <p class="small muted">${potentiel
      ? 'Un artisan en prospection n’a aucune pièce à fournir : on ne demande une attestation qu’à quelqu’un qu’on fait travailler. Le bouton <b>Convertir en actif</b> s’en charge le moment venu.'
      : 'Les attestations se déposent ensuite par le bouton <b>Pièces</b>, au bout de sa ligne.'}</p>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" class="btn primary" id="st-ok">${creation ? 'Ajouter' : 'Enregistrer'}</button>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <span class="grow"></span><span class="muted small" id="st-etat"></span>
    </div>`;

  const titre = creation
    ? (potentiel ? 'Ajouter un artisan en prospection' : 'Nouveau sous-traitant')
    : `Modifier — ${v.raison_sociale || 'artisan'}`;

  openModal(titre, corps, { onOpen: (m) => {
    m.querySelector('#st-ok').onclick = async () => {
      const f = m.querySelector('#st-form');
      if (!f.reportValidity()) return;
      const d = Object.fromEntries(new FormData(f).entries());
      const champs = { raison_sociale: d.raison_sociale.trim() };
      // Même règle que partout : à la création un champ vide n'est pas envoyé,
      // à la modification il part à `null` — c'est ainsi qu'on efface un
      // numéro saisi par erreur, et ne pas l'envoyer rendrait l'effacement
      // impossible.
      for (const k of ['specialites', 'telephone', 'email', 'adresse', 'notes']) {
        if (d[k] && d[k].trim()) champs[k] = d[k].trim();
        else if (!creation) champs[k] = null;
      }
      // Le statut ne se change QUE par « Convertir en actif », jamais par ce
      // formulaire : la conversion a ses propres effets côté worker, et deux
      // chemins vers le même changement finissent par diverger.
      if (creation) champs.statut_relation = statut;

      const b = m.querySelector('#st-ok');
      b.disabled = true;
      m.querySelector('#st-etat').textContent = 'Envoi au tableau de bord…';
      const r = creation ? await creerSousTraitant(champs) : await majSousTraitant(v.d1_id, champs);
      b.disabled = false;
      m.querySelector('#st-etat').textContent = '';
      if (!r.ok) {
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : rien n’a été enregistré.'
          : `Non enregistré — ${r.motif}`, 'err');
        return;
      }
      // Une modification avance à l'écran ; une création ne le peut pas — le
      // CRM ne connaît pas le `d1_id` que le worker vient d'attribuer, et une
      // ligne sans lui n'aurait ni bouton Pièces ni bouton Convertir.
      if (!creation) Object.assign(v, champs);
      closeModal();
      toast(creation
        ? 'Artisan ajouté — visible ici au prochain relevé'
        : 'Artisan enregistré dans le tableau de bord');
      apres?.();
    };
  } });
}

// Une confirmation qui nomme son bouton. `confirm()` de `ui.js` ne prend qu'une
// chaîne et répond toujours « Confirmer » : sur cet écran, trois gestes très
// différents se suivent — désactiver, remettre en prospection, supprimer — et
// c'est le libellé du bouton qui dit lequel on est en train de faire.
//
// ⚠ Pas de seconde modale par-dessus une première : `closeModal(true)` remplace
// la modale courante, comme le rappelle déjà le panneau des pièces. Ces
// confirmations partent donc toutes d'un écran nu, jamais d'un formulaire ouvert.
function confirmerGeste({ titre, texte, ok, danger = false }) {
  return new Promise(res => {
    let repondu = false;
    const rendre = (v) => { if (!repondu) { repondu = true; res(v); } };
    const m = openModal(titre, `${texte}
      <div class="toolbar" style="margin-top:14px">
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" id="cg-ok">${esc(ok)}</button>
        <button type="button" class="btn ghost" data-close>Annuler</button>
      </div>`, { onClose: () => rendre(false) });
    // ⚠ RÉPONDRE AVANT DE FERMER : closeModal() déclenche onClose, qui
    // répondrait "false" en premier. Le garde \`repondu\` fait que le premier
    // appel gagne — dans le mauvais ordre, le bouton OK annulerait.
    m.querySelector('#cg-ok').onclick = () => { rendre(true); closeModal(); };
  });
}

export const rgdSousTraitantsPage = {
  title: () => 'RGD Renova — Sous-traitants',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // `actif` est le filtre de l'original : Actifs (défaut) · Inactifs · Tous.
    // Il ne porte que sur le tableau des actifs — un artisan en prospection
    // n'est ni actif ni inactif chez nous, il n'a pas encore travaillé.
    const state = { q: '', focus: null, ecriture: false };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

    const draw = () => {
      const tous = scope.rgd('rgd_sous_traitants');
      const paiements = scope.rgd('rgd_st_paiements');
      const commissions = scope.rgd('rgd_st_commissions');
      const missions = scope.rgd('rgd_missions');

      // Un sous-traitant est en défaut dès qu'une pièce manque ou est expirée.
      // ⚠ « Une date connue sans document » COMPTE comme un défaut (poids 1) :
      // c'est le cas le plus trompeur, il a l'air d'une attestation valide.
      const defautsDe = (st) => PIECES.map(p => etatPiece(st, piecesDe(st.id), p))
        .filter(e => e.poids <= 1).length;

      // Le partage. `statut_relation` vaut 'actif' par défaut côté D1 : une
      // fiche qui ne le porte pas est donc un sous-traitant, jamais un
      // prospect — c'est le bon défaut, il ne fabrique pas de prospects.
      const estPotentiel = (st) => st.statut_relation === 'potentiel';
      const potentiels = tous.filter(estPotentiel);
      const surLesquels = tous.filter(st => !estPotentiel(st));
      // Tant que le relevé n'envoie pas la colonne, AUCUNE fiche ne la porte :
      // on le dit, plutôt que de laisser croire qu'il n'y a pas de prospects.
      const relaisMuet = tous.length > 0 && tous.every(st => st.statut_relation == null);
      // ZERO PROSPECT NE VEUT PAS DIRE LA MEME CHOSE SELON LE MOMENT : il peut
      // n'y en avoir aucun, ou le relevé peut n'avoir pas encore tourné depuis
      // que le worker sait les envoyer. Sans date, les deux se ressemblent —
      // constaté le 22/09/2026, l'écran semblait n'avoir pas changé.
      const dernierReleve = tous.reduce((m, st) =>
        st.updated_at && st.updated_at > m ? st.updated_at : m, '');

      // TROIS POPULATIONS, et un écran par bloc (23/09/2026). `statut_relation`
      // dit si on travaille avec lui ; `actif` dit s'il est encore en service.
      // Les croiser donne trois cas qui n'appellent pas les mêmes gestes :
      // un ACTIF qu'on relance, un POTENTIEL qu'on qualifie, un INACTIF qu'on
      // garde en mémoire sans plus rien lui demander. Le menu « Actifs /
      // Inactifs / Tous » de l'original est parti avec : il cachait derrière un
      // choix ce que trois blocs montrent d'un coup.
      const actifs = surLesquels.filter(st => st.actif !== false);
      const inactifs = surLesquels.filter(st => st.actif === false);
      const enDefaut = actifs.filter(st => defautsDe(st) > 0);
      const sansAucun = actifs.filter(st => !Object.keys(piecesDe(st.id)).length);
      const bientot = actifs.filter(st =>
        PIECES.some(p => etatPiece(st, piecesDe(st.id), p).cle === 'bientot'));

      // Les potentiels, rangés par corps de métier. La clé est comparée sans
      // casse ni accents pour que « couverture » et « Couverture » ne fassent
      // qu'un groupe ; l'intitulé affiché reste celui qui a été saisi.
      const parMetier = () => {
        const groupes = new Map();
        for (const st of potentiels) {
          const brut = String(st.specialites || '').trim() || 'Non renseigné';
          const cle = brut.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (!groupes.has(cle)) groupes.set(cle, { titre: brut, lignes: [] });
          groupes.get(cle).lignes.push(st);
        }
        return [...groupes.values()]
          .map(g => ({ ...g, lignes: g.lignes.slice().sort((a, b) =>
            String(a.raison_sociale || '').localeCompare(String(b.raison_sociale || ''), 'fr')) }))
          // « Non renseigné » en dernier : c'est une case vide, pas un métier.
          .sort((a, b) => (a.titre === 'Non renseigné') - (b.titre === 'Non renseigné')
            || a.titre.localeCompare(b.titre, 'fr'));
      };

      const somme = (l) => l.reduce((t, x) => t + (Number(x.montant_ht) || 0), 0);

      const ts = terms(state.q);
      // Les plus en défaut d'abord : c'est la liste d'un travail à faire, pas
      // un annuaire.
      const vus = actifs
        .filter(st => hit([st.raison_sociale, st.contact_nom, st.email, st.specialites], ts))
        .slice()
        // Les actifs d'abord, et parmi eux les plus en défaut. Un sous-traitant
        // inactif à qui il manque tout remonterait sinon en tête d'une liste
        // qui sert à savoir qui relancer — or on ne relance pas quelqu'un
        // avec qui on ne travaille plus.
        .sort((a, b) => (a.actif === false) - (b.actif === false)
          || defautsDe(b) - defautsDe(a)
          || String(a.raison_sociale || '').localeCompare(String(b.raison_sociale || ''), 'fr'));

      // LA PRÉSENTATION EST CELLE DU TABLEAU DE BORD D'ORIGINE (23/09/2026,
      // demandée par Mickael) : deux blocs annoncés par un bandeau de couleur
      // — les actifs en vert « Signés », les potentiels en orange « En
      // prospection » —, un séparateur entre eux, et les prospects rangés en
      // une carte par corps de métier. Les onglets « Conformité / Règlements »
      // ont disparu : l'original n'en a pas, et ils cachaient la moitié de
      // l'écran derrière un clic. Les règlements ferment la page.
      //
      // ⚠ LES CHIFFRES CLÉS EN TÊTE SONT PARTIS, comme sur Clients et
      // Partenaires : sur un écran qui sert à retrouver quelqu'un, quatre
      // grandes cartes repoussent la liste sous la ligne de flottaison.
      // L'alarme de conformité, elle, RESTE — et ce n'est pas un oubli : elle
      // ne décore pas, elle dit qui peut engager la responsabilité de RGD
      // Renova. Elle est seulement passée SOUS le bandeau des actifs, qui est
      // la population qu'elle concerne.
      const corps = `
        <section class="st-tete st-tete-actifs">
          <div>
            <h2>Sous-traitants actifs <span class="chip green">✓ Signés</span></h2>
            <p class="muted small">Partenaires signés — attestations, chantiers, paiements</p>
          </div>
          ${state.ecriture ? '<button type="button" class="btn primary" id="rst-nouveau">+ Nouveau sous-traitant</button>' : ''}
        </section>

        ${sansAucun.length ? `<div class="alert">
          <b>!</b>
          <div><b>${sansAucun.length} sous-traitant${sansAucun.length > 1 ? 's actifs n’ont' : ' actif n’a'}
          aucune pièce enregistrée.</b> Sans attestation de vigilance à jour, le donneur d&rsquo;ordre
          répond du travail dissimulé ; sans décennale, c&rsquo;est RGD Renova qui porte le sinistre.
          Les pièces se déposent ici, bouton <b>Pièces</b> au bout de la ligne.
          Les artisans en prospection ne sont pas comptés ici : on ne leur demande rien
          tant qu&rsquo;on ne les a pas fait travailler.</div>
        </div>` : ''}

        ${relaisMuet ? `<div class="alert">
          <b>i</b>
          <div><b>Le relevé n&rsquo;envoie pas encore la distinction actif / prospect.</b>
          Les ${tous.length} fiches sont donc toutes présentées comme des sous-traitants.
          L’information existe dans l’application RGD ; elle sera reprise dès que le
          relevé la transmettra.</div>
        </div>` : ''}

        <div class="toolbar">
          ${searchInput('rst-q', state, 'Recherche raison sociale, spécialité…')}
          <span class="grow"></span>
          <span class="muted small">les dossiers incomplets en premier</span>
        </div>

        <section class="card table-wrap">
          <table>
            <thead><tr><th>Raison sociale</th><th>Contact</th><th>Spécialités</th>
              ${PIECES.map(p => `<th title="${esc(p.label)}">${esc(p.court)}</th>`).join('')}
              <th class="num">Versé</th><th></th></tr></thead>
            <tbody>${vus.map(st => {
              const verse = somme(paiements.filter(p => p.sous_traitant_id === st.id));
              return `<tr class="${st.actif === false ? 'muted' : ''}">
                <td><b>${esc(st.raison_sociale || '—')}</b>
                    ${st.actif === false ? '<span class="chip">Inactif</span>' : ''}
                    ${st.siret ? `<div class="s muted">SIRET ${esc(st.siret)}</div>` : ''}</td>
                <td>${esc(st.contact_nom || '—')}
                    ${st.telephone ? `<div class="s muted">${esc(st.telephone)}</div>` : ''}</td>
                <td class="muted">${esc(st.specialites || '—')}</td>
                ${PIECES.map(p => { const e = pastille(st, piecesDe(st.id), p);
                  return `<td><span class="chip ${e.ton}" title="${esc(p.label)} — ${esc(e.texte)}">${esc(e.label)}</span></td>`; }).join('')}
                <td class="num">${verse ? eur(verse) : '<span class="muted">—</span>'}</td>
                <td class="num st-actions">
                  <button type="button" class="btn ghost sm" data-pieces="${esc(st.id)}">Pièces</button>
                  ${st.email ? `<button type="button" class="btn ghost sm" data-relance="${esc(st.id)}">Relancer</button>` : ''}
                  ${state.ecriture ? `
                  <button type="button" class="btn ghost sm" data-prospection="${esc(String(st.d1_id))}"
                          title="Le remettre parmi les artisans en prospection">En prospection</button>
                  <button type="button" class="btn ghost sm danger" data-desactiver="${esc(String(st.d1_id))}"
                          title="On ne travaille plus avec lui">Désactiver</button>` : ''}
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="9"><div class="empty">
              <b>Aucun résultat</b><br>Modifiez les filtres ou créez un nouvel élément.</div></td></tr>`}</tbody>
          </table>
        </section>

        <div class="st-separation"></div>

        <section class="st-tete st-tete-potentiels">
          <div>
            <h2>Sous-traitants potentiels <span class="chip amber">○ En prospection</span></h2>
            <p class="muted small">${potentiels.length} artisan${potentiels.length > 1 ? 's' : ''} à qualifier —
            prospection, salons, recommandations</p>
          </div>
          ${state.ecriture ? '<button type="button" class="btn primary" id="rst-potentiel">+ Ajouter un potentiel</button>' : ''}
        </section>

        ${potentiels.length ? parMetier().map(g => `
          <section class="card table-wrap st-metier">
            <div class="card-head">
              <h2>${esc(g.titre)}</h2>
              <span class="grow"></span>
              <span class="st-compte">${g.lignes.length} artisan${g.lignes.length > 1 ? 's' : ''}</span>
            </div>
            <table>
              <thead><tr><th>Nom</th><th>Téléphone</th><th>Mail</th><th>Adresse</th><th>Commentaires</th>
                ${state.ecriture ? '<th></th>' : ''}</tr></thead>
              <tbody>${g.lignes.map(st => `<tr>
                <td><b>${esc(st.raison_sociale || '—')}</b></td>
                <td>${st.telephone ? esc(st.telephone) : '<span class="muted">—</span>'}</td>
                <td>${st.email ? `<a href="mailto:${esc(st.email)}">${esc(st.email)}</a>` : '<span class="muted">—</span>'}</td>
                <td class="s">${st.adresse ? esc(st.adresse) : '<span class="muted">—</span>'}</td>
                <td class="s muted">${st.notes ? esc(st.notes) : '—'}</td>
                ${state.ecriture ? `<td class="num st-actions">
                  <button type="button" class="btn primary sm" data-convertir="${esc(String(st.d1_id))}">Convertir en actif</button>
                  <button type="button" class="btn ghost sm" data-modifier="${esc(String(st.d1_id))}">Modifier</button>
                  <button type="button" class="btn ghost sm danger" data-supprimer="${esc(String(st.d1_id))}"
                          title="Supprimer définitivement">🗑</button>
                </td>` : ''}
              </tr>`).join('')}</tbody>
            </table>
          </section>`).join('') : `<section class="card"><div class="empty">
            <b>Aucun sous-traitant potentiel</b><br>
            ${state.ecriture
              ? 'Ajoutez les artisans repérés en salon, en recommandation ou en annuaire.'
              : `Ils se saisissent dans l’<a href="#/rgd/app">application RGD</a>${dernierReleve ? ' — dernier relevé ' + fmtDateTime(dernierReleve) : ''}.`}
          </div></section>`}

        <div class="st-separation"></div>

        <section class="st-tete st-tete-inactifs">
          <div>
            <h2>Sous-traitants inactifs <span class="chip red">■ Hors service</span></h2>
            <p class="muted small">${inactifs.length} artisan${inactifs.length > 1 ? 's' : ''} avec qui on ne travaille plus —
            gardés en mémoire, plus rien ne leur est demandé</p>
          </div>
        </section>

        ${inactifs.length ? `
        <section class="card table-wrap">
          <table>
            <thead><tr><th>Raison sociale</th><th>Contact</th><th>Spécialités</th>
              <th class="num">Versé</th>${state.ecriture ? '<th></th>' : ''}</tr></thead>
            <tbody>${inactifs.slice()
              .sort((a, b) => String(a.raison_sociale || '').localeCompare(String(b.raison_sociale || ''), 'fr'))
              .map(st => {
                const verse = somme(paiements.filter(p => p.sous_traitant_id === st.id));
                return `<tr class="muted">
                  <td><b>${esc(st.raison_sociale || '—')}</b>
                      ${st.siret ? `<div class="s muted">SIRET ${esc(st.siret)}</div>` : ''}</td>
                  <td>${esc(st.contact_nom || '—')}
                      ${st.telephone ? `<div class="s muted">${esc(st.telephone)}</div>` : ''}</td>
                  <td class="muted">${esc(st.specialites || '—')}</td>
                  <td class="num">${verse ? eur(verse) : '<span class="muted">—</span>'}</td>
                  ${state.ecriture ? `<td class="num st-actions">
                    <button type="button" class="btn ghost sm" data-reactiver="${esc(String(st.d1_id))}">Réactiver</button>
                  </td>` : ''}
                </tr>`;
              }).join('')}</tbody>
          </table>
          <p class="small muted">Les pièces de conformité ne sont pas montrées ici, et ce n’est pas un oubli :
          on ne réclame pas une attestation à jour à quelqu’un qu’on ne fait plus travailler. Elles
          réapparaissent dès qu’il est réactivé.</p>
        </section>` : `<section class="card"><div class="empty">
          Aucun sous-traitant désactivé.</div></section>`}

        <div class="st-separation"></div>

        <section class="card table-wrap st-argent">
          <div class="card-head">
            <h2>Règlements et commissions</h2>
            <span class="grow"></span>
            <span class="muted small">${paiements.length} règlement${paiements.length > 1 ? 's' : ''} (${eur(somme(paiements))})
            et ${commissions.length} commission${commissions.length > 1 ? 's' : ''} (${eur(somme(commissions))})</span>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Nature</th><th>Sous-traitant</th><th>Chantier</th>
              <th>Libellé</th><th class="num">Taux</th><th class="num">Montant HT</th></tr></thead>
            <tbody>${[...paiements.map(x => ({ ...x, nature: 'Règlement', quand: x.date_paiement })),
                      ...commissions.map(x => ({ ...x, nature: 'Commission', quand: x.date_commission }))]
              .sort((a, b) => String(b.quand || '').localeCompare(String(a.quand || '')))
              .map(x => {
                const st = tous.find(s => s.id === x.sous_traitant_id);
                const affaire = x.deal_id ? db.byId('deals', x.deal_id) : null;
                return `<tr>
                  <td>${x.quand ? fmtDate(x.quand) : '<span class="muted">—</span>'}</td>
                  <td>${esc(x.nature)}</td>
                  <td>${esc(st?.raison_sociale || '—')}</td>
                  <td>${affaire ? esc(affaire.title) : '<span class="muted small">sans chantier</span>'}</td>
                  <td class="muted">${esc(x.libelle || '—')}</td>
                  <td class="num muted">${x.taux != null ? esc(String(x.taux)) + ' %' : '—'}</td>
                  <td class="num">${eur(x.montant_ht)}</td>
                </tr>`;
              }).join('') || '<tr><td colspan="7"><div class="empty">Aucun règlement enregistré.</div></td></tr>'}</tbody>
          </table>
          ${paiements.every(p => !p.deal_id) && paiements.length ? `<p class="small muted">
            Aucun de ces règlements n&rsquo;est rattaché à un chantier dans l&rsquo;application RGD — la colonne reste donc vide.</p>` : ''}
        </section>

        ${missions.length ? `<section class="card">
          <div class="card-head"><h2>Missions confiées</h2><span class="grow"></span>
            <span class="muted small">${missions.length} mission${missions.length > 1 ? 's' : ''}</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Sous-traitant</th><th>Chantier</th><th>Description</th><th>Statut</th>
              <th class="num">Dû</th><th class="num">Payé</th></tr></thead>
            <tbody>${missions.map(m => {
              const st = tous.find(s => s.id === m.sous_traitant_id);
              const affaire = m.deal_id ? db.byId('deals', m.deal_id) : null;
              return `<tr>
                <td>${esc(st?.raison_sociale || '—')}</td>
                <td>${affaire ? esc(affaire.title) : '<span class="muted small">—</span>'}</td>
                <td class="muted">${esc(m.description || '—')}</td>
                <td>${esc(m.statut || '—')}</td>
                <td class="num">${eur(m.montant_ht_du)}</td>
                <td class="num">${eur(m.montant_ht_paye)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
        </section>` : ''}`;

      root.innerHTML = cadre('#/rgd/soustraitants', 'Sous-traitants', corps);
      bindSearch(root, 'rst-q', state, draw);
      restoreFocus(root, state);

      const nouveau = root.querySelector('#rst-nouveau');
      if (nouveau) nouveau.onclick = () => formulaireSousTraitant(null, draw, 'actif');
      const potentiel = root.querySelector('#rst-potentiel');
      if (potentiel) potentiel.onclick = () => formulaireSousTraitant(null, draw, 'potentiel');

      const parD1 = (id) => tous.find(x => String(x.d1_id) === String(id));

      root.querySelectorAll('[data-modifier]').forEach(b => b.onclick = () => {
        const st = parD1(b.dataset.modifier);
        if (st) formulaireSousTraitant(st, draw);
      });

      // ⚠ CES DEUX-LÀ SONT DÉSIGNÉS PAR L'UUID DU CRM, pas par l'identifiant de
      // l'application RGD : depuis le 24/09/2026 le dépôt et la relance vivent
      // ici, et ils s'adressent à la fiche du CRM. Ils ne dépendent donc plus
      // du droit d'écrire là-bas (`state.ecriture`) — les cacher pour cette
      // raison fermerait la conformité à quelqu'un à qui la base l'ouvre.
      const parId = (id) => tous.find(x => x.id === id);

      root.querySelectorAll('[data-pieces]').forEach(b => b.onclick = () => {
        const st = parId(b.dataset.pieces);
        // Le dépôt s'écrit dans le CRM : `draw()` relit la table et la pastille
        // suit dans la seconde. Rien à avancer à la main.
        if (st) ouvrirPiecesSt(st, () => draw());
      });

      root.querySelectorAll('[data-relance]').forEach(b => b.onclick = () => {
        const st = parId(b.dataset.relance);
        if (st) ouvrirRelanceSt(st);
      });

      root.querySelectorAll('[data-convertir]').forEach(b => b.onclick = () => {
        const st = parD1(b.dataset.convertir);
        if (st) formulaireConversion(st, draw);
      });

      // LES TROIS BASCULES. Chacune avance à l'écran avant que le relevé ne
      // passe — sinon la ligne resterait au même endroit trente minutes après
      // le clic, et on cliquerait une seconde fois. Si l'écriture échoue, la
      // valeur revient, avec le motif : c'est la règle de tout l'espace.
      const basculer = async (st, champ, valeur, appel, message) => {
        const avant = st[champ];
        st[champ] = valeur;
        draw();
        const r = await appel();
        if (!r.ok) {
          st[champ] = avant;
          draw();
          toast(r.motif === 'pas-de-compte'
            ? 'Aucun compte RGD à votre adresse : rien n’a été enregistré.'
            : `Non enregistré — ${r.motif}`, 'err');
          return;
        }
        toast(message);
      };

      root.querySelectorAll('[data-desactiver]').forEach(b => b.onclick = async () => {
        const st = parD1(b.dataset.desactiver);
        if (!st) return;
        if (!await confirmerGeste({
          titre: 'Désactiver ce sous-traitant ?',
          texte: `<p><b>${esc(st.raison_sociale || 'Cet artisan')}</b> passera dans les inactifs.
            Rien n’est effacé — ses règlements, ses missions et ses pièces restent en place, et
            il se réactive d’un clic. On cesse simplement de lui réclamer ses attestations.</p>`,
          ok: 'Désactiver', danger: true,
        })) return;
        basculer(st, 'actif', false, () => activerSousTraitant(st.d1_id, false),
          `${st.raison_sociale || 'L’artisan'} est désactivé`);
      });

      root.querySelectorAll('[data-reactiver]').forEach(b => b.onclick = () => {
        const st = parD1(b.dataset.reactiver);
        if (st) basculer(st, 'actif', true, () => activerSousTraitant(st.d1_id, true),
          `${st.raison_sociale || 'L’artisan'} est de nouveau actif`);
      });

      root.querySelectorAll('[data-prospection]').forEach(b => b.onclick = async () => {
        const st = parD1(b.dataset.prospection);
        if (!st) return;
        if (!await confirmerGeste({
          titre: 'Remettre en prospection ?',
          texte: `<p><b>${esc(st.raison_sociale || 'Cet artisan')}</b> rejoindra les sous-traitants
            potentiels, rangé sous son corps de métier. <b>Il sortira du suivi de conformité</b> :
            ses attestations ne seront plus réclamées ni comptées dans l’alerte, parce qu’on ne
            demande rien à quelqu’un qu’on n’a pas encore fait travailler. Ses dates restent
            enregistrées et reviennent s’il est reconverti en actif.</p>`,
          ok: 'Remettre en prospection',
        })) return;
        basculer(st, 'statut_relation', 'potentiel', () => remettreEnProspection(st.d1_id),
          `${st.raison_sociale || 'L’artisan'} est repassé en prospection`);
      });

      // ⚠ LA SUPPRESSION EST DÉFINITIVE ET SE FAIT DES DEUX CÔTÉS — voir
      // `supprimerSousTraitant`. Elle n'est offerte que sur un POTENTIEL : un
      // actif porte des règlements, des missions et des pièces de conformité,
      // et « désactiver » est la bonne réponse pour lui.
      root.querySelectorAll('[data-supprimer]').forEach(b => b.onclick = async () => {
        const st = parD1(b.dataset.supprimer);
        if (!st) return;
        if (!await confirmerGeste({
          titre: 'Supprimer définitivement ?',
          texte: `<p><b>${esc(st.raison_sociale || 'Cet artisan')}</b> sera effacé du tableau de bord
            ET du CRM. <b>C’est irréversible</b> — il n’y a pas de corbeille.</p>
            <p class="small muted">Pour le mettre simplement de côté sans le perdre, convertissez-le
            en actif puis désactivez-le : il restera dans le bloc des inactifs.</p>`,
          ok: 'Supprimer définitivement', danger: true,
        })) return;
        const r = await supprimerSousTraitant(st.d1_id, st.id);
        if (!r.ok) {
          toast(r.motif === 'pas-de-compte'
            ? 'Aucun compte RGD à votre adresse : rien n’a été supprimé.'
            : `Non supprimé — ${r.motif}`, 'err');
          return;
        }
        // La ligne est retirée de la liste en mémoire : le relevé n'efface
        // jamais rien, donc rien ne la ferait disparaître d'ici autrement.
        const i = tous.indexOf(st);
        if (i >= 0) tous.splice(i, 1);
        toast(`${st.raison_sociale || 'L’artisan'} a été supprimé`);
        draw();
      });
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
