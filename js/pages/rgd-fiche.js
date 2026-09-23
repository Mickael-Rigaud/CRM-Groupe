// La fiche d'un contact RGD Renova
//
// CE QU'ELLE REPREND DE BTP EXPERTISE, ET CE QU'ELLE LAISSE
// La fiche d'affaire de BTP (`openDeal`) sert de modèle : en-tête avec l'état,
// frise d'étapes cliquable, informations à gauche, historique en dessous.
// Trois choses n'y sont pas, et leur absence est un choix :
//
//   « Gagnée » / « Perdue » — chez BTP, gagner est un GESTE indépendant de
//   l'étape. Ici l'étape vient du statut, et « perdu » est une étape comme une
//   autre : deux boutons qui écriraient la même chose que la frise se
//   contrediraient tôt ou tard.
//
//   « Modifier » — l'espace RGD est en lecture seule sauf le statut et le
//   commentaire. Le reste se saisit dans l'application RGD, qui reste la
//   source ; un formulaire ici serait écrasé au relevé suivant.
//
//   Les documents — ils appartiennent aux affaires du CRM, pas aux fiches
//   relevées de Cloudflare, qui n'en ont pas.
//
// ⚠ L'HISTORIQUE S'ATTACHE AU CONTACT, PAS À UNE AFFAIRE — et c'est ce qui a
// permis de le faire sans migration. `events` porte déjà `contact_id` et
// `organisation_id`, tous deux facultatifs : une fiche RGD n'est pas un
// `deal`, mais elle désigne bien une personne ou une entreprise. La policy
// `events_insert` est en `with check (true)`, donc rien à changer côté droits.
//
// ⚠ CHAQUE CHANGEMENT D'ÉTAPE S'INSCRIT, avec sa date et son auteur. Sans
// cela, on lit « Chantier en cours » sans savoir depuis quand ni qui l'a dit —
// et c'est précisément la question qu'on se pose en rouvrant un dossier trois
// semaines plus tard. L'inscription se fait APRÈS l'écriture du statut : une
// trace de ce qui n'a pas eu lieu est pire que pas de trace.
//
// CE QU'ELLE AJOUTE, ET QUI N'EXISTAIT NULLE PART
// Les devis et les chantiers de la personne, rattachés par la migration
// 20260923120000. Jusqu'ici il fallait ouvrir trois écrans pour savoir si
// quelqu'un avait un devis en attente ; ils sont désormais sur sa fiche.
import { db } from '../data/db.js';
import { esc, eur, fmtDate, fmtDateTime, openModal, toast, userName } from '../ui.js';
import { ETAPES_RGD, ORDRE_ETAPES, STATUT_DE_L_ETAPE, ecrireStatut } from '../data/rgd-etapes.js';
import { scope } from '../data/scope.js';

const ETAT_CHANTIER = {
  demarrage: { label: 'Préparé', ton: 'amber' },
  en_cours: { label: 'En cours', ton: 'green' },
  termine: { label: 'Terminé', ton: 'muted' },
};
const STATUT_DEVIS = {
  signe: { label: 'Signé', ton: 'green' },
  refuse: { label: 'Refusé', ton: 'red' },
  expire: { label: 'Expiré', ton: 'muted' },
  brouillon: { label: 'Brouillon', ton: 'amber' },
};
const dit = (table, cle, defaut) => table[cle] || { label: cle || defaut, ton: 'muted' };
const nomEtape = (cle) => ETAPES_RGD.find(e => e.key === cle)?.label || cle;

// Les initiales, pour la pastille de l'en-tête. Deux lettres au plus : trois
// sur un nom composé donnent une bouillie illisible dans un cercle de 44 px.
const initiales = (nom) => String(nom || '?').trim().split(/\s+/)
  .filter(m => /[a-zà-ÿ]/i.test(m)).slice(0, 2).map(m => m[0].toUpperCase()).join('') || '?';

// Les devis et chantiers d'une personne. Un professionnel se rattache par son
// organisation, un particulier par son contact — les deux sont possibles.
const siens = (liste, f) => liste.filter(x =>
  (!!x.contact_id && x.contact_id === f.contact_id)
  || (!!x.organisation_id && x.organisation_id === f.organisation_id));

export function ouvrirFicheRgd(x, onChange) {
  // `x` est la ligne normalisée de l'écran : { genre, ligne, cible, provenance,
  // provenanceLabel, etape, nom, email, tel, ville, adresse, projet, budget,
  // recu, type }.
  let etapeCourante = x.etape;
  const f = x.ligne;

  // L'historique suit la PERSONNE, donc il survit à tout : changement
  // d'étape, de statut, et même à la disparition d'une affaire.
  const clefs = { contact_id: f.contact_id || null, organisation_id: f.organisation_id || null };
  const aUneAncre = !!(clefs.contact_id || clefs.organisation_id);

  const historique = () => db.t('events')
    .filter(e => (clefs.contact_id && e.contact_id === clefs.contact_id)
      || (clefs.organisation_id && e.organisation_id === clefs.organisation_id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const inscrire = (kind, body) => aUneAncre
    ? db.insert('events', { ...clefs, deal_id: null, kind, body, author_id: scope.user?.id || null })
    : Promise.resolve();

  const dessine = () => {
    const devis = x.genre === 'fiche' ? siens(scope.rgd('rgd_devis'), f) : [];
    const chantiers = x.genre === 'fiche'
      ? siens(scope.rgd('rgd_chantiers'), f).filter(c => c.etat || c.date_debut_prevue)
      : [];
    const i = ORDRE_ETAPES.indexOf(etapeCourante);
    const perdu = etapeCourante === 'archives';
    const evs = historique();
    const commentaireSource = (x.genre === 'demande' ? f.commentaire_admin : f.notes) || '';

    // ⚠ UNE LIGNE VIDE NE S'AFFICHE PAS. Un « — » en face de six intitulés
    // donne une fiche qui a l'air pleine et ne dit rien ; mieux vaut trois
    // lignes vraies et un bloc plus court.
    const info = (t, v) => v ? `<div class="rgdf-info"><dt>${esc(t)}</dt><dd>${v}</dd></div>` : '';

    const html = `
      <div class="rgdf-entete">
        <div class="rgdf-avatar">${esc(initiales(x.nom))}</div>
        <div class="rgdf-identite">
          <h2>${esc(x.nom || '(sans nom)')}</h2>
          <div class="rgdf-meta">
            <span class="chip prov prov-${esc(x.provenance)}">${esc(x.provenanceLabel || x.provenance)}</span>
            <span class="chip ${perdu ? 'red' : 'green'}">${esc(perdu ? 'Perdu' : nomEtape(etapeCourante))}</span>
            <span class="muted small">${x.recu ? 'Reçu le ' + esc(fmtDate(x.recu)) : 'Date de réception inconnue'}${
              x.genre === 'demande' ? ' · formulaire du site' : ''}</span>
          </div>
        </div>
      </div>

      <!-- ⚠ LA FRISE EST LE SEUL LEVIER : cliquer une étape écrit le statut.
           Pas de bouton « enregistrer » — il laisserait croire qu'on peut
           changer d'avis, alors que l'écriture part à la source aussitôt. -->
      <div class="stage-steps rgdf-etapes">
        ${ETAPES_RGD.filter(e => e.key !== 'archives').map((e, n) => `
          <button data-etape="${e.key}" title="${esc(e.titre)}"
            class="${e.key === etapeCourante ? 'cur' : (i >= 0 && n < i) ? 'past' : ''}">${esc(e.label)}</button>`).join('')}
        <button data-etape="archives" title="Perdu ou mis de côté"
          class="rgdf-perdu ${perdu ? 'cur' : ''}">Perdu</button>
      </div>

      <div class="rgdf-corps">
        <div class="rgdf-colonne">
          <!-- ⚠ DEUX CARTES, PAS UNE LISTE : « qui est-ce » et « que veut-il »
               sont deux questions, et on n'a presque jamais les deux en tête
               en même temps. Les mêler en une seule liste de sept intitulés
               oblige à relire chaque ligne pour trouver celle qu'on cherche. -->
          <section class="rgdf-carte">
            <h3><span class="rgdf-pict">👤</span> Le prospect</h3>
            <dl class="rgdf-infos">
              ${info('Téléphone', x.tel ? `<a href="tel:${esc(x.tel)}">${esc(x.tel)}</a>` : '')}
              ${info('Email', x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : '')}
              ${info('Adresse', esc(x.adresse || ''))}
              ${info('Ville', esc(x.ville || ''))}
              ${info('Nature', esc(x.type || ''))}
            </dl>
            ${!x.tel && !x.email ? '<p class="small muted">Aucun moyen de contact renseigné.</p>' : ''}
          </section>

          <section class="rgdf-carte">
            <h3><span class="rgdf-pict">🏗</span> Le projet</h3>
            <dl class="rgdf-infos">
              ${info('Nature des travaux', esc(x.projet || ''))}
              ${info('Budget annoncé', esc(String(x.budget || '').trim()))}
              ${info('Provenance', esc(x.provenanceLabel || x.provenance))}
              ${info('Devis', devis.length ? `${devis.length}` : '')}
              ${info('Chantiers', chantiers.length ? `${chantiers.length}` : '')}
            </dl>
            ${!x.projet && !x.budget ? '<p class="small muted">Le projet n’a pas encore été décrit.</p>' : ''}
          </section>

          ${devis.length ? `<section class="rgdf-carte">
            <h3><span class="rgdf-pict">📄</span> Devis <span class="rgdf-compte">${devis.length}</span></h3>
            <div class="table-wrap"><table>
              <thead><tr><th>Numéro</th><th>Objet</th><th class="num">Montant HT</th><th>État</th></tr></thead>
              <tbody>${devis.map(v => { const e = dit(STATUT_DEVIS, v.statut, 'En cours');
                return `<tr>
                  <td><b>${esc(v.numero || '—')}</b>${v.date_creation ? `<div class="s muted">${esc(fmtDate(v.date_creation))}</div>` : ''}</td>
                  <td class="muted">${esc(v.objet || '—')}</td>
                  <td class="num">${eur(v.montant_ht)}</td>
                  <td><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}</tbody>
            </table></div>
          </section>` : ''}

          ${chantiers.length ? `<section class="rgdf-carte">
            <h3><span class="rgdf-pict">🧱</span> Chantiers <span class="rgdf-compte">${chantiers.length}</span></h3>
            <div class="table-wrap"><table>
              <thead><tr><th>Référence</th><th>Période prévue</th><th>État</th></tr></thead>
              <tbody>${chantiers.map(c => { const e = dit(ETAT_CHANTIER, c.etat, 'Inconnu');
                return `<tr>
                  <td><b>${esc(c.reference || c.description || '—')}</b>
                      ${c.ville ? `<div class="s muted">${esc(c.ville)}</div>` : ''}</td>
                  <td class="muted small">${c.date_debut_prevue ? esc(fmtDate(c.date_debut_prevue)) : '—'}
                      ${c.date_fin_prevue ? ' → ' + esc(fmtDate(c.date_fin_prevue)) : ''}</td>
                  <td><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}</tbody>
            </table></div>
          </section>` : ''}

          ${devis.length || chantiers.length ? `<p class="small muted">Devis et chantiers viennent de
            Costructor, relevés toutes les 30 minutes. Ils se modifient dans
            l’<a href="#/rgd/app">application RGD</a>.</p>` : ''}
        </div>

        <div class="rgdf-colonne">
          <!-- ⚠ LE COMMENTAIRE DE CLOUDFLARE, EN LECTURE SEULE, ET À PART.
               Il vient du tableau de bord RGD, qui en est la source ; le
               modifier ici serait écrasé au relevé suivant. Il est distinct de
               l'historique en dessous : celui-ci porte ce qu'on écrit depuis le
               CRM, celui-là ce qui a été saisi dans l'application. Les fondre
               ferait croire qu'on peut répondre à l'un depuis l'autre.
               Les champs s'appellent commentaire_admin et notes, pas
               commentaire et note : la premiere version lisait les mauvais et
               affichait un commentaire vide sur des lignes qui en ont un. -->
          ${commentaireSource ? `<section class="rgdf-carte rgdf-commentaire">
            <h3><span class="rgdf-pict">📝</span> Commentaire</h3>
            <p class="rgdf-texte">${esc(commentaireSource)}</p>
            <p class="small muted">Saisi dans l’<a href="#/rgd/app">application RGD</a>, qui en reste la source.</p>
          </section>` : ''}

          <section class="rgdf-carte rgdf-suivi">
            <h3><span class="rgdf-pict">🕑</span> Historique</h3>
            ${aUneAncre ? `
              <form id="rgdf-note" class="rgdf-ajout">
                <input name="body" class="filter-input" required
                  placeholder="Ajouter une note (appel, échange, décision…)">
                <button class="btn sm" type="submit">Ajouter</button>
              </form>` : `<p class="small muted">Cette ligne n’est rattachée à aucun contact :
                l’historique ne peut pas s’y accrocher.</p>`}
            <div class="timeline rgdf-fil">
              ${evs.length ? evs.map(e => `
                <div class="tl ${esc(e.kind)}">
                  <div class="meta">${esc(fmtDateTime(e.created_at))} · ${esc(userName(e.author_id))}</div>
                  ${esc(e.body)}
                </div>`).join('')
                : '<div class="empty">Rien d’enregistré pour l’instant.</div>'}
            </div>
          </section>
        </div>
      </div>`;

    const m = openModal('', html, { wide: true, onClose: () => onChange?.() });
    // Le titre de la modale est vide : l'en-tête de la fiche porte déjà le nom,
    // et l'afficher deux fois l'un au-dessus de l'autre fait bégayer l'écran.
    m.classList.add('rgdf');

    m.querySelectorAll('[data-etape]').forEach(b => b.onclick = async () => {
      const vers = b.dataset.etape;
      if (vers === etapeCourante) return;
      // « Nouvelle demande » n'a pas de statut unique — cinq y mènent. On pose
      // « contacté » plutôt que « nouveau prospect » : y revenir est une
      // décision, et `nouveau_prospect` signifie « personne n'a rien dit ».
      const statut = vers === 'demande' ? 'a_contacter' : STATUT_DE_L_ETAPE[vers];
      m.querySelectorAll('[data-etape]').forEach(o => { o.disabled = true; });
      const avant = etapeCourante;
      const r = await ecrireStatut({ d1Id: f.d1_id, uuid: f.id, cible: x.cible, statut });
      if (r.ok) {
        etapeCourante = vers;
        x.etape = vers;
        // ⚠ APRÈS l'écriture, jamais avant : une trace de ce qui n'a pas eu
        // lieu est pire que pas de trace du tout.
        await inscrire('stage', `Étape : ${nomEtape(avant)} → ${nomEtape(vers)}`);
        toast('Étape mise à jour');
        dessine();
        onChange?.();
      } else {
        m.querySelectorAll('[data-etape]').forEach(o => { o.disabled = false; });
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : l’étape n’a pas été changée.'
          : `Étape non enregistrée — ${r.motif}`, 'err');
      }
    });

    const form = m.querySelector('#rgdf-note');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const champ = form.elements.body;
      const texte = champ.value.trim();
      if (!texte) return;
      champ.disabled = true;
      try {
        await inscrire('note', texte);
        champ.value = '';
        dessine();
      } catch (err) {
        toast(String(err.message || err).slice(0, 90), 'err');
      } finally {
        champ.disabled = false;
      }
    };
  };

  dessine();
}
