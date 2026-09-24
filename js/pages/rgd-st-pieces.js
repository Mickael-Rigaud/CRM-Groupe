// Espace RGD Renova — les pièces administratives d'un sous-traitant
//
// POURQUOI CE PANNEAU EXISTE
// Les attestations d'un sous-traitant ne se déposaient QUE dans l'application
// d'origine. Tant que c'était vrai, l'éteindre éteignait le seul endroit où
// l'on peut prouver qu'un artisan est en règle — et c'est le donneur d'ordre
// qui répond du travail dissimulé.
//
// ⚠ TOUT SE PASSE DÉSORMAIS DANS LE CRM (24/09/2026). Le fichier va dans le
// stockage privé du CRM, la ligne dans `rgd_st_pieces`, le mail part par la
// fonction d'envoi du CRM. Plus aucun appel à l'application d'origine ici :
// c'est ce qui rend ce panneau indépendant de son extinction.
//
// LE PANNEAU NE LIT PLUS À LA SOURCE, ET IL N'EN A PLUS BESOIN
// Il le faisait parce que la synchronisation ne rapatriait que les DATES
// d'expiration, jamais de quoi savoir si un document existait. Les documents
// vivent maintenant ici : la question se répond sans sortir. Les dates de
// l'autre côté continuent d'arriver et restent affichées — d'où le troisième
// état, « Date connue, aucun document », que le reflet seul ne sait pas voir.
//
// LES HUIT PIÈCES, PAS LES QUATRE DU TABLEAU
// La liste de l'écran montre quatre pastilles — celles qui portent le risque.
// Le panneau en montre huit, parce que c'est sur ces huit que porte l'email de
// relance : en montrer quatre ferait réclamer à un artisan des pièces que le
// CRM ne lui a jamais affichées.
import { esc, fmtDateTime, toast, openModal, closeModal } from '../ui.js';
import { scope } from '../data/scope.js';
import { PIECES_ST, MAX_OCTETS, piecesDe, etatPiece, deposerPiece,
         lienPiece, preparerRelance, envoyerRelance } from '../data/rgd-pieces.js';

// Réexporté pour l'écran de liste, qui s'en sert pour ses quatre pastilles :
// une seule déclaration des pièces, dans `js/data/rgd-pieces.js`.
export { PIECES_ST };

function rangees(st, pieces) {
  return PIECES_ST.map(p => {
    const e = etatPiece(st, pieces, p);
    const doc = pieces[p.key];
    const valeur = doc ? (doc.expire_le || '') : (p.date ? (st[p.date] || '') : '');
    const champDate = p.date
      ? `<input type="date" data-date="${esc(p.key)}" value="${esc(valeur)}"
           aria-label="${p.signature ? 'Date de signature' : 'Date d’expiration'} — ${esc(p.label)}">`
      : '<span class="muted small">sans date</span>';
    return `<tr>
      <td><b>${esc(p.label)}</b>
        ${p.pourquoi ? `<div class="s muted">${p.pourquoi}</div>` : ''}
        ${doc ? `<div class="s muted">Déposée le ${esc(fmtDateTime(doc.deposee_le))}</div>` : ''}</td>
      <td><span class="chip ${e.ton}">${esc(e.texte)}</span></td>
      <td>${champDate}</td>
      <td class="num">
        ${doc ? `<button type="button" class="btn ghost sm" data-voir="${esc(p.key)}">Télécharger</button>` : ''}
        <button type="button" class="btn ghost sm" data-deposer="${esc(p.key)}">${doc ? 'Remplacer' : 'Déposer'}</button>
      </td>
    </tr>`;
  }).join('');
}

// L'aperçu du mail dans une IFRAME CLOISONNÉE, jamais dans la page.
// Le HTML porte la raison sociale et le nom du contact, c'est-à-dire du texte
// saisi par quelqu'un : l'injecter en `innerHTML` donnerait à une fiche mal
// nommée le droit d'exécuter du script dans le CRM. `sandbox` vide retire
// tout — script, formulaires, navigation.
function apercuDansCadre(html) {
  return `<iframe sandbox="" class="rst-apercu" srcdoc="${esc(html)}"
    title="Aperçu du mail de relance"></iframe>`;
}

export function ouvrirPiecesSt(st, apresDepot) {
  const titre = `Pièces administratives — ${st.raison_sociale || 'sans nom'}`;
  openModal(titre, '', { wide: true, onOpen: (m) => {
    const corps = m.querySelector('.modal-body');
    if (!scope.canRgd) {
      corps.innerHTML = '<div class="alert"><b>!</b><div>Vous n’avez pas accès à l’activité RGD Renova.</div></div>';
      return;
    }

    const dessiner = () => {
      const pieces = piecesDe(st.id);
      // Un seul `input file`, caché et réutilisé par les huit boutons : poser
      // huit champs invisibles dans la page ne servirait à rien.
      corps.innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Pièce</th><th>État</th><th>Validité</th><th></th></tr></thead>
          <tbody>${rangees(st, pieces)}</tbody>
        </table></div>
        <input type="file" id="rst-fichier" accept="application/pdf" hidden>
        <p class="small muted">PDF uniquement, 24 Mo au plus. La date saisie à côté d&rsquo;une pièce
        part <b>avec</b> le dépôt ; la changer seule ne l&rsquo;enregistre pas.
        Une date sans document derrière vient de l&rsquo;application RGD : elle reste affichée,
        mais elle ne prouve rien — c&rsquo;est le document qu&rsquo;on présente en cas de contrôle.</p>
        <div class="form-actions">
          ${st.email
            ? '<button type="button" class="btn ghost" id="rst-relance">Relancer par email…</button>'
            : '<span class="muted small">Pas d’email sur cette fiche : aucune relance possible.</span>'}
          ${st.derniere_relance_pieces
            ? `<span class="muted small">Dernière relance le ${esc(fmtDateTime(st.derniere_relance_pieces))}</span>`
            : ''}
          <span class="grow"></span>
          <button type="button" class="btn ghost" data-close>Fermer</button>
        </div>`;
      brancher();
    };

    const brancher = () => {
      const champ = corps.querySelector('#rst-fichier');
      const pieces = piecesDe(st.id);

      corps.querySelectorAll('[data-voir]').forEach(b => b.onclick = async () => {
        b.disabled = true;
        const f = await lienPiece(pieces[b.dataset.voir]);
        b.disabled = false;
        if (!f.ok) { toast(`Téléchargement impossible — ${f.motif}`, 'err'); return; }
        // Le lien est signé une heure : on ouvre, on ne le range nulle part.
        window.open(f.url, '_blank', 'noopener');
      });

      corps.querySelectorAll('[data-deposer]').forEach(b => b.onclick = () => {
        const cle = b.dataset.deposer;
        const libelle = b.textContent;
        champ.value = '';
        champ.onchange = async () => {
          const fichier = champ.files[0];
          if (!fichier) return;
          // Le stockage refuse déjà les deux cas ; les dire ici évite un
          // aller-retour et un message d'erreur qu'il faudrait traduire.
          if (fichier.type !== 'application/pdf') {
            toast('Seuls les PDF sont acceptés.', 'err'); return;
          }
          if (fichier.size > MAX_OCTETS) {
            toast(`Fichier trop lourd (${Math.round(fichier.size / 1048576)} Mo) — 24 Mo au plus.`, 'err');
            return;
          }
          const saisie = corps.querySelector(`[data-date="${cle}"]`);
          const quand = saisie ? saisie.value : '';
          b.disabled = true; b.textContent = 'Envoi…';
          const res = await deposerPiece(st, cle, fichier, quand);
          b.disabled = false; b.textContent = libelle;
          if (!res.ok) { toast(`Non déposé — ${res.motif}`, 'err'); return; }
          const p = PIECES_ST.find(x => x.key === cle);
          toast(`${p.label} — dépôt enregistré`);
          dessiner();
          apresDepot?.(cle, quand || null);
        };
        champ.click();
      });

      const relance = corps.querySelector('#rst-relance');
      if (relance) relance.onclick = () => ouvrirRelanceSt(st);
    };

    dessiner();
  } });
}

// La relance : l'aperçu D'ABORD, toujours. Un mail part chez un artisan, il n'y
// a pas de retour en arrière — et c'est l'état des pièces, pas l'écran, qui
// choisit ce qui est réclamé. Envoyer sans avoir lu ce qu'on envoie serait
// signer à l'aveugle.
export function ouvrirRelanceSt(st) {
  const nom = st.raison_sociale || 'ce sous-traitant';
  openModal(`Relance des documents — ${nom}`, '', { wide: true, onOpen: (m) => {
    const corps = m.querySelector('.modal-body');
    const r = preparerRelance(st);
    if (!r.ok) {
      // Pas d'email, ou rien à réclamer. Ce n'est pas une panne, c'est une
      // réponse : on la montre telle quelle.
      corps.innerHTML = `<div class="alert"><b>i</b><div>${esc(r.motif)}</div></div>
        <div class="form-actions"><button type="button" class="btn ghost" data-close>Fermer</button></div>`;
      return;
    }
    const a = r.donnees;
    corps.innerHTML = `
      <p class="small muted">Objet : <b>${esc(a.objet)}</b><br>
      Destinataire : <b>${esc(st.email)}</b> — ${a.expirees.length} pièce(s) à renouveler,
      ${a.manquantes.length} manquante(s).</p>
      ${apercuDansCadre(a.corps)}
      <p class="small muted">L&rsquo;aperçu montre le message sans son en-tête ni son pied de page,
      qui sont ajoutés à l&rsquo;envoi.</p>
      <p class="small muted" id="rst-garde"></p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Ne pas envoyer</button>
        <span class="grow"></span>
        <button type="button" class="btn primary" id="rst-envoyer">Envoyer à ${esc(st.email)}</button>
      </div>`;
    // LA CONFIRMATION EST ICI, PAS DANS UNE SECONDE MODALE.
    // `confirm()` du CRM appelle `closeModal(true)` : elle REMPLACE la modale
    // courante au lieu de se poser dessus. L'aperçu disparaîtrait donc au
    // moment précis où l'on demande « êtes-vous sûr ? » — on confirmerait un
    // texte qu'on ne voit plus. Le garde-fou tient donc en deux clics sur le
    // même bouton, l'aperçu restant sous les yeux.
    const b = corps.querySelector('#rst-envoyer');
    let arme = false;
    b.onclick = async () => {
      if (!arme) {
        arme = true;
        b.classList.add('danger');
        b.textContent = `Confirmer l’envoi à ${st.email}`;
        corps.querySelector('#rst-garde').textContent =
          'Le mail part au prochain clic. « Ne pas envoyer » ferme sans rien faire.';
        return;
      }
      b.disabled = true; b.textContent = 'Envoi…';
      const res = await envoyerRelance(st, { objet: a.objet, corps: a.corps });
      if (!res.ok) {
        b.disabled = false; arme = false;
        b.classList.remove('danger');
        b.textContent = `Envoyer à ${st.email}`;
        corps.querySelector('#rst-garde').textContent = '';
        toast(`Non envoyé — ${res.motif}`, 'err');
        return;
      }
      closeModal();
      toast(`Relance envoyée à ${st.email}`);
    };
  } });
}
