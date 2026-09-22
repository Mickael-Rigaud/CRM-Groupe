// Espace RGD Renova — les pièces administratives d'un sous-traitant
//
// POURQUOI CE PANNEAU EXISTE, ET POURQUOI IL EST LE DERNIER VERROU DE SURGE
// Les attestations d'un sous-traitant ne se déposaient QUE dans le tableau de
// bord. Tant que c'était vrai, éteindre Surge éteignait le seul endroit où l'on
// peut prouver qu'un artisan est en règle — et c'est le donneur d'ordre qui
// répond du travail dissimulé. Le CRM reprend donc le dépôt lui-même. Les
// fichiers, eux, continuent d'aller chez Cloudflare (KV) : les déplacer est la
// phase 3 du plan de sortie, pas ce chantier-ci.
//
// LE PANNEAU LIT À LA SOURCE, PAS DANS LE REFLET — ET C'EST OBLIGATOIRE
// Le relevé ne rapatrie que les DATES d'expiration des quatre pièces de la
// liste. Il ne porte AUCUN des `*_url`, donc le reflet ne sait pas si la pièce
// existe : il sait seulement qu'une date a été saisie. Or c'est précisément la
// question de cet écran. Ouvrir la fiche déclenche donc un appel à D1.
//
// LES HUIT PIÈCES, PAS LES QUATRE DU TABLEAU
// La liste de l'écran montre quatre pastilles — celles qui portent le risque.
// Le panneau en montre huit, parce que c'est sur ces huit que porte l'email de
// relance : en montrer quatre ferait réclamer à un artisan des pièces que le
// CRM ne lui a jamais affichées.
import { esc, fmtDate, daysSince, toast, openModal, closeModal } from '../ui.js';
import { ficheSousTraitant, deposerPieceSt, pieceStFichier,
         apercuRelanceSt, envoyerRelanceSt } from '../data/rgd-api.js';

// Les clés sont celles du worker (`DOC_MAP`). En changer une ici casserait le
// dépôt sans rien dire : la route répondrait « type de document invalide ».
export const PIECES_ST = [
  { key: 'vigilance', label: 'Attestation de vigilance', url: 'attestation_vigilance_url',
    date: 'attestation_vigilance_expire',
    pourquoi: 'sans elle, le donneur d’ordre répond du travail dissimulé' },
  { key: 'decennale', label: 'Assurance décennale', url: 'assurance_decennale_url',
    date: 'assurance_decennale_expire',
    pourquoi: 'sans elle, c’est RGD Renova qui porte le sinistre' },
  { key: 'urssaf', label: 'Attestation URSSAF', url: 'attestation_urssaf_url',
    date: 'attestation_urssaf_expire' },
  { key: 'kbis', label: 'Extrait Kbis', url: 'kbis_url', date: 'kbis_expire' },
  { key: 'rc_pro', label: 'Assurance RC Pro', url: 'rc_pro_url', date: 'rc_pro_expire' },
  { key: 'regularite_fiscale', label: 'Attestation de régularité fiscale',
    url: 'regularite_fiscale_url', date: 'regularite_fiscale_expire' },
  // `contrat_st_date` est une date de SIGNATURE, pas d'expiration : un contrat
  // signé ne périme pas. L'afficher comme une échéance le ferait passer rouge
  // le lendemain de la signature.
  { key: 'contrat_st', label: 'Contrat de sous-traitance signé', url: 'contrat_st_url',
    date: 'contrat_st_date', signature: true },
  { key: 'rib', label: 'RIB', url: 'rib_url', date: null },
];

const MAX_OCTETS = 24 * 1024 * 1024;   // la limite du worker, dite avant l'envoi

// L'état d'une pièce, en connaissant CETTE FOIS le fichier. Trois cas là où la
// liste n'en voyait que deux : la date saisie sans document déposé est le cas
// que le reflet ne peut pas distinguer, et c'est le plus trompeur.
function etat(fiche, p) {
  const fichier = fiche[p.url];
  const quand = p.date ? fiche[p.date] : null;
  if (!fichier && !quand) return { ton: 'red', texte: 'Absente' };
  if (!fichier) return { ton: 'red', texte: 'Date saisie, aucun document' };
  if (p.signature) return { ton: 'green', texte: quand ? `Signé le ${fmtDate(quand)}` : 'Déposé' };
  if (!p.date) return { ton: 'green', texte: 'Déposé' };
  if (!quand) return { ton: 'amber', texte: 'Déposée, sans date de validité' };
  const j = daysSince(quand);            // positif = la date est passée
  if (j > 0) return { ton: 'red', texte: `Expirée le ${fmtDate(quand)}` };
  if (j > -30) return { ton: 'amber', texte: `Expire dans ${-j} j` };
  return { ton: 'green', texte: `Valable jusqu’au ${fmtDate(quand)}` };
}

function rangees(fiche) {
  return PIECES_ST.map(p => {
    const e = etat(fiche, p);
    const champDate = p.date
      ? `<input type="date" data-date="${esc(p.key)}" value="${esc(fiche[p.date] || '')}"
           aria-label="${p.signature ? 'Date de signature' : 'Date d’expiration'} — ${esc(p.label)}">`
      : '<span class="muted small">sans date</span>';
    return `<tr>
      <td><b>${esc(p.label)}</b>
        ${p.pourquoi ? `<div class="s muted">${p.pourquoi}</div>` : ''}</td>
      <td><span class="chip ${e.ton}">${esc(e.texte)}</span></td>
      <td>${champDate}</td>
      <td class="num">
        ${fiche[p.url] ? `<button type="button" class="btn ghost sm" data-voir="${esc(p.key)}">Télécharger</button>` : ''}
        <button type="button" class="btn ghost sm" data-deposer="${esc(p.key)}">${fiche[p.url] ? 'Remplacer' : 'Déposer'}</button>
      </td>
    </tr>`;
  }).join('');
}

// L'aperçu du mail dans une IFRAME CLOISONNÉE, jamais dans la page.
// Le HTML vient du worker mais porte la raison sociale et le nom du contact,
// c'est-à-dire du texte saisi par quelqu'un : l'injecter en `innerHTML`
// donnerait à une fiche mal nommée le droit d'exécuter du script dans le CRM.
// `sandbox` vide retire tout — script, formulaires, navigation.
function apercuDansCadre(html) {
  return `<iframe sandbox="" class="rst-apercu" srcdoc="${esc(html)}"
    title="Aperçu du mail de relance"></iframe>`;
}

export function ouvrirPiecesSt(st, apresDepot) {
  const titre = `Pièces administratives — ${st.raison_sociale || 'sans nom'}`;
  openModal(titre, '<div class="empty">Lecture de la fiche chez Cloudflare…</div>', { wide: true,
    onOpen: async (m) => {
      const r = await ficheSousTraitant(st.d1_id);
      const corps = m.querySelector('.modal-body');
      if (!r.ok) {
        corps.innerHTML = `<div class="alert"><b>!</b><div>${
          r.motif === 'pas-de-compte'
            ? 'Aucun compte RGD à votre adresse : la fiche ne peut pas être lue.'
            : `Fiche illisible — ${esc(r.motif)}`}</div></div>`;
        return;
      }
      const fiche = r.donnees;

      const dessiner = () => {
        // Un seul `input file`, caché et réutilisé par les huit boutons : poser
        // huit champs invisibles dans la page ne servirait à rien.
        corps.innerHTML = `
          <div class="table-wrap"><table>
            <thead><tr><th>Pièce</th><th>État</th><th>Validité</th><th></th></tr></thead>
            <tbody>${rangees(fiche)}</tbody>
          </table></div>
          <input type="file" id="rst-fichier" accept="application/pdf" hidden>
          <p class="small muted">Les fichiers restent hébergés chez Cloudflare — seul le dépôt
          passe par le CRM. PDF uniquement, 24 Mo au plus. La date saisie à côté d&rsquo;une pièce
          part <b>avec</b> le dépôt ; la changer seule ne l&rsquo;enregistre pas.</p>
          <div class="form-actions">
            ${fiche.email
              ? '<button type="button" class="btn ghost" id="rst-relance">Relancer par email…</button>'
              : '<span class="muted small">Pas d’email sur cette fiche : aucune relance possible.</span>'}
            <span class="grow"></span>
            <button type="button" class="btn ghost" data-close>Fermer</button>
          </div>`;
        brancher();
      };

      const brancher = () => {
        const champ = corps.querySelector('#rst-fichier');

        corps.querySelectorAll('[data-voir]').forEach(b => b.onclick = async () => {
          b.disabled = true;
          const f = await pieceStFichier(st.d1_id, b.dataset.voir);
          b.disabled = false;
          if (!f.ok) { toast(`Téléchargement impossible — ${f.motif}`, 'err'); return; }
          const a = document.createElement('a');
          a.href = f.url;
          a.download = `${b.dataset.voir}-${String(st.raison_sociale || 'st').replace(/[^\w-]+/g, '-')}.pdf`;
          a.click();
          // L'URL d'objet retient le fichier en mémoire tant qu'on ne la rend
          // pas ; une minute laisse le temps au téléchargement de partir.
          setTimeout(() => URL.revokeObjectURL(f.url), 60000);
        });

        corps.querySelectorAll('[data-deposer]').forEach(b => b.onclick = () => {
          const cle = b.dataset.deposer;
          const libelle = b.textContent;
          champ.value = '';
          champ.onchange = async () => {
            const fichier = champ.files[0];
            if (!fichier) return;
            // Le worker refuse déjà les deux cas ; les dire ici évite un
            // aller-retour et une erreur 400 qu'il faudrait traduire.
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
            const res = await deposerPieceSt(st.d1_id, cle, fichier, quand);
            b.disabled = false; b.textContent = libelle;
            if (!res.ok) {
              toast(res.motif === 'pas-de-compte'
                ? 'Aucun compte RGD à votre adresse : rien n’a été déposé.'
                : `Non déposé — ${res.motif}`, 'err');
              return;
            }
            // On avance la fiche en mémoire : le relevé du CRM mettra jusqu'à
            // trente minutes à rapatrier le changement, et personne ne doit
            // lire « absente » juste après avoir déposé la pièce.
            const p = PIECES_ST.find(x => x.key === cle);
            fiche[p.url] = res.donnees?.url || 'depose';
            if (p.date && quand) fiche[p.date] = quand;
            toast(`${p.label} — dépôt enregistré`);
            dessiner();
            apresDepot?.(cle, p.date && quand ? quand : null);
          };
          champ.click();
        });

        const relance = corps.querySelector('#rst-relance');
        if (relance) relance.onclick = () => ouvrirRelanceSt(st, fiche);
      };

      dessiner();
    } });
}

// La relance : l'aperçu D'ABORD, toujours. Un mail part chez un artisan, il n'y
// a pas de retour en arrière — et c'est le worker, pas l'écran, qui choisit les
// pièces réclamées. Envoyer sans avoir lu ce qu'on envoie serait signer à
// l'aveugle.
export function ouvrirRelanceSt(st, fiche = null) {
  const nom = st.raison_sociale || 'ce sous-traitant';
  openModal(`Relance des documents — ${nom}`, '<div class="empty">Préparation du mail…</div>',
    { wide: true, onOpen: async (m) => {
      const corps = m.querySelector('.modal-body');
      const r = await apercuRelanceSt(st.d1_id);
      if (!r.ok) {
        // 400 = rien à relancer, ou pas d'email sur la fiche. Ce n'est pas une
        // panne, c'est une réponse : on la montre telle quelle.
        corps.innerHTML = `<div class="alert"><b>i</b><div>${esc(
          r.motif === 'pas-de-compte'
            ? 'Aucun compte RGD à votre adresse : aucune relance ne peut partir.'
            : r.motif)}</div></div>
          <div class="form-actions"><button type="button" class="btn ghost" data-close>Fermer</button></div>`;
        return;
      }
      const a = r.donnees;
      const dest = fiche?.email || st.email || '';
      corps.innerHTML = `
        <p class="small muted">Objet : <b>${esc(a.subject || '')}</b><br>
        Destinataire : <b>${esc(dest)}</b> — ${a.docsExpires?.length || 0} pièce(s) expirée(s),
        ${a.docsManquants?.length || 0} manquante(s).</p>
        ${apercuDansCadre(a.html || '')}
        <p class="small muted" id="rst-garde"></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-close>Ne pas envoyer</button>
          <span class="grow"></span>
          <button type="button" class="btn primary" id="rst-envoyer">Envoyer à ${esc(dest)}</button>
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
          b.textContent = `Confirmer l’envoi à ${dest}`;
          corps.querySelector('#rst-garde').textContent =
            'Le mail part au prochain clic. « Ne pas envoyer » ferme sans rien faire.';
          return;
        }
        b.disabled = true; b.textContent = 'Envoi…';
        const res = await envoyerRelanceSt(st.d1_id);
        if (!res.ok) {
          b.disabled = false; arme = false;
          b.classList.remove('danger');
          b.textContent = `Envoyer à ${dest}`;
          corps.querySelector('#rst-garde').textContent = '';
          toast(res.motif === 'pas-de-compte'
            ? 'Aucun compte RGD à votre adresse : aucun mail n’est parti.'
            : `Non envoyé — ${res.motif}`, 'err');
          return;
        }
        closeModal();
        toast(`Relance envoyée à ${dest}`);
      };
    } });
}
