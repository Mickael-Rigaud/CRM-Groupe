// La fiche d'un contact RGD Renova
//
// CE QU'ELLE REPREND DE BTP EXPERTISE, ET CE QU'ELLE LAISSE
// La fiche d'affaire de BTP (`openDeal`) sert de modèle : en-tête avec l'état,
// frise d'étapes cliquable, informations à gauche, le reste à droite. Trois
// choses n'y sont pas, et leur absence est un choix :
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
//   Les activités et les documents — ils appartiennent aux affaires du CRM,
//   pas aux fiches relevées de Cloudflare, qui n'en ont pas.
//
// CE QU'ELLE AJOUTE, ET QUI N'EXISTAIT NULLE PART
// Les devis et les chantiers de la personne, rattachés par la migration
// 20260923120000. Jusqu'ici il fallait ouvrir trois écrans pour savoir si
// quelqu'un avait un devis en attente ; ils sont désormais sur sa fiche.
import { db } from '../data/db.js';
import { esc, eur, fmtDate, fmtDateTime, openModal, closeModal, toast } from '../ui.js';
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

// Les devis et chantiers d'une personne. Un professionnel se rattache par son
// organisation, un particulier par son contact — les deux sont possibles.
const siens = (liste, f) => liste.filter(x =>
  (!!x.contact_id && x.contact_id === f.contact_id)
  || (!!x.organisation_id && x.organisation_id === f.organisation_id));

export function ouvrirFicheRgd(x, onChange) {
  // `x` est la ligne normalisée de l'écran : { genre, ligne, cible, provenance,
  // etape, nom, email, tel, ville, adresse, projet, budget, recu, statut }.
  let etapeCourante = x.etape;

  const dessine = () => {
    const f = x.ligne;
    const devis = x.genre === 'fiche' ? siens(scope.rgd('rgd_devis'), f) : [];
    const chantiers = x.genre === 'fiche'
      ? siens(scope.rgd('rgd_chantiers'), f).filter(c => c.etat || c.date_debut_prevue)
      : [];
    const i = ORDRE_ETAPES.indexOf(etapeCourante);
    const perdu = etapeCourante === 'archives';

    const ligneInfo = (t, v) => v ? `<dt>${esc(t)}</dt><dd>${v}</dd>` : '';

    const html = `
      <div class="rgdf-tete">
        <div>
          <span class="chip prov prov-${esc(x.provenance)}">${esc(x.provenanceLabel || x.provenance)}</span>
          ${perdu ? '<span class="chip red">Perdu</span>'
            : `<span class="chip green">${esc(ETAPES_RGD.find(e => e.key === etapeCourante)?.label || '')}</span>`}
          <div class="muted small" style="margin-top:4px">
            ${x.recu ? `Reçu le ${esc(fmtDate(x.recu))}` : 'Date de réception inconnue'}
            ${x.genre === 'demande' ? ' · demande du formulaire du site' : ''}
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

      <div class="detail">
        <div>
          <div class="section"><h3>Informations</h3><dl>
            ${ligneInfo('Téléphone', x.tel ? `<a href="tel:${esc(x.tel)}">${esc(x.tel)}</a>` : '')}
            ${ligneInfo('Email', x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : '')}
            ${ligneInfo('Adresse', esc(x.adresse || ''))}
            ${ligneInfo('Ville', esc(x.ville || ''))}
            ${ligneInfo('Projet', esc(x.projet || ''))}
            ${ligneInfo('Budget annoncé', esc(String(x.budget || '').trim()))}
            ${ligneInfo('Type', esc(x.type || ''))}
          </dl></div>

          <div class="section"><h3>Commentaire</h3>
            <textarea id="rgdf-note" class="filter-input" rows="3"
              placeholder="Le commentaire se saisit dans l’application RGD.">${esc(
                x.genre === 'demande' ? (f.commentaire || '') : (f.note || ''))}</textarea>
            <p class="small muted">Lu depuis le tableau de bord RGD, qui reste la source.</p>
          </div>
        </div>

        <div>
          <div class="section"><h3>Devis <span class="muted small">${devis.length}</span></h3>
            ${devis.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Numéro</th><th>Objet</th><th class="num">Montant HT</th><th>État</th></tr></thead>
              <tbody>${devis.map(v => { const e = dit(STATUT_DEVIS, v.statut, 'En cours');
                return `<tr>
                  <td><b>${esc(v.numero || '—')}</b>${v.date_creation ? `<div class="s muted">${esc(fmtDate(v.date_creation))}</div>` : ''}</td>
                  <td class="muted">${esc(v.objet || '—')}</td>
                  <td class="num">${eur(v.montant_ht)}</td>
                  <td><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}</tbody>
            </table></div>` : '<div class="empty">Aucun devis rattaché.</div>'}
          </div>

          <div class="section"><h3>Chantiers <span class="muted small">${chantiers.length}</span></h3>
            ${chantiers.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Référence</th><th>Période prévue</th><th>État</th></tr></thead>
              <tbody>${chantiers.map(c => { const e = dit(ETAT_CHANTIER, c.etat, 'Inconnu');
                return `<tr>
                  <td><b>${esc(c.reference || c.description || '—')}</b>
                      ${c.ville ? `<div class="s muted">${esc(c.ville)}</div>` : ''}</td>
                  <td class="muted small">${c.date_debut_prevue ? esc(fmtDate(c.date_debut_prevue)) : '—'}
                      ${c.date_fin_prevue ? ' → ' + esc(fmtDate(c.date_fin_prevue)) : ''}</td>
                  <td><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}</tbody>
            </table></div>` : '<div class="empty">Aucun chantier rattaché.</div>'}
          </div>

          <p class="small muted">Devis et chantiers viennent de Costructor, relevés
            toutes les 30 minutes. Ils se modifient dans l’<a href="#/rgd/app">application RGD</a>.</p>
        </div>
      </div>`;

    const m = openModal(x.nom || '(sans nom)', html, { wide: true, onClose: () => onChange?.() });

    m.querySelectorAll('[data-etape]').forEach(b => b.onclick = async () => {
      const vers = b.dataset.etape;
      if (vers === etapeCourante) return;
      // « Nouvelle demande » n'a pas de statut unique — cinq y mènent. On pose
      // « contacté » plutôt que « nouveau prospect » : y revenir est une
      // décision, et `nouveau_prospect` signifie « personne n'a rien dit ».
      const statut = vers === 'demande' ? 'a_contacter' : STATUT_DE_L_ETAPE[vers];
      m.querySelectorAll('[data-etape]').forEach(x2 => { x2.disabled = true; });
      const r = await ecrireStatut({
        d1Id: f.d1_id, uuid: f.id, cible: x.cible, statut,
      });
      if (r.ok) {
        etapeCourante = vers;
        x.etape = vers;
        toast('Étape mise à jour');
        dessine();
        onChange?.();
      } else {
        m.querySelectorAll('[data-etape]').forEach(x2 => { x2.disabled = false; });
        toast(r.motif === 'pas-de-compte'
          ? 'Aucun compte RGD à votre adresse : l’étape n’a pas été changée.'
          : `Étape non enregistrée — ${r.motif}`, 'err');
      }
    });
  };

  dessine();
}
