// La fiche d'un contact RGD Renova
//
// CE QU'ELLE REPREND DE BTP EXPERTISE, ET CE QU'ELLE LAISSE
// La fiche d'affaire de BTP sert de modèle pour ce qu'elle CONTIENT — état,
// frise d'étapes, informations, historique — et non pour sa mise en page.
// Trois choses n'y sont pas, et leur absence est un choix :
//
//   « Gagnée » / « Perdue » — chez BTP, gagner est un GESTE indépendant de
//   l'étape. Ici l'étape vient du statut, et « perdu » est une étape comme une
//   autre : deux boutons qui écriraient la même chose que la frise se
//   contrediraient tôt ou tard.
//
//   « Modifier » — l'espace RGD est en lecture seule sauf le statut. Le reste
//   se saisit dans l'application RGD, qui reste la source ; un formulaire ici
//   serait écrasé au relevé suivant.
//
//   Les documents — ils appartiennent aux affaires du CRM, pas aux fiches
//   relevées de Cloudflare, qui n'en ont pas.
//
// ⚠ L'HISTORIQUE S'ATTACHE AU CONTACT, PAS À UNE AFFAIRE — et c'est ce qui a
// permis de le faire sans migration. `events` porte déjà `contact_id` et
// `organisation_id`, tous deux facultatifs. La policy `events_insert` est en
// `with check (true)`, donc rien à changer côté droits.
//
// ⚠ CHAQUE CHANGEMENT D'ÉTAPE S'INSCRIT, avec sa date et son auteur, APRÈS
// l'écriture du statut : une trace de ce qui n'a pas eu lieu est pire que pas
// de trace.
//
// ⚠ NE JAMAIS METTRE D'ACCENT GRAVE DANS UN COMMENTAIRE HTML D'UN GABARIT :
// il referme le gabarit. `node --check` passe, et l'écran reste sur
// « Chargement… » — attrapé le 23/09/2026, en chargeant la page.
//
// LA MISE EN PAGE, REFAITE LE 23/09/2026
// La première version était « trop simple, mal organisée, très fade » : des
// cartes blanches sur fond blanc, des intitulés gris en majuscules, aucun
// repère pour l'oeil. Trois choses la corrigent, par ordre d'importance :
//
//   1. UN EN-TÊTE QUI PORTE LES CHIFFRES. Montant, devis, chantiers,
//      ancienneté — ce qu'on veut savoir avant de lire quoi que ce soit, sur
//      le fond de la marque, pour que l'oeil sache où commencer.
//   2. LA FRISE EN BARRE DE PROGRESSION, et non en rangée de boutons : une
//      barre se lit d'un coup, sept boutons se lisent un par un.
//   3. DES REPÈRES AU LIEU D'INTITULÉS GRIS. Une pastille ronde colorée
//      devant chaque information remplace « TÉLÉPHONE » en petites capitales :
//      on reconnaît une forme plus vite qu'on ne lit un mot.
import { db } from '../data/db.js';
import { esc, eur, fmtDate, fmtDateTime, openModal, toast, userName, daysSince } from '../ui.js';
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
// sur un nom composé donnent une bouillie illisible dans un cercle.
const initiales = (nom) => String(nom || '?').trim().split(/\s+/)
  .filter(m => /[a-zà-ÿ]/i.test(m)).slice(0, 2).map(m => m[0].toUpperCase()).join('') || '?';

const siens = (liste, f) => liste.filter(x =>
  (!!x.contact_id && x.contact_id === f.contact_id)
  || (!!x.organisation_id && x.organisation_id === f.organisation_id));

// ⚠ LES PICTOGRAMMES SONT EN SVG, PAS EN ÉMOJI. Un émoji change de dessin et
// de couleur selon le système : deux postes n'afficheraient pas la même fiche,
// et aucun ne prendrait la couleur qu'on lui demande. Ceux-ci héritent de la
// couleur du texte qui les porte.
const ICONES = {
  tel: 'M4 3h3l1.5 4-2 1.5a12 12 0 0 0 5 5L13 11l4 1.5V16a1 1 0 0 1-1.1 1A14 14 0 0 1 3 4.1 1 1 0 0 1 4 3Z',
  mail: 'M2 5h16v10H2V5Zm0 0 8 6 8-6',
  lieu: 'M10 2a5.5 5.5 0 0 1 5.5 5.5C15.5 12 10 18 10 18S4.5 12 4.5 7.5A5.5 5.5 0 0 1 10 2Zm0 3.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z',
  travaux: 'M3 17h14M5 17V9l5-4 5 4v8M8 17v-4h4v4',
  euro: 'M13 5.5A5 5 0 0 0 5.5 10 5 5 0 0 0 13 14.5M3.5 8.5h6M3.5 11.5h6',
  source: 'M10 2.5 12.4 7l5 .7-3.6 3.5.9 5-4.7-2.5L5.3 16l.9-5L2.6 7.7l5-.7L10 2.5Z',
  personne: 'M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 7.5a6 6 0 0 1 12 0',
  maison: 'M2.5 9 10 3l7.5 6M4.5 8v9h11V8M8.5 17v-5h3v5',
  regle: 'M2.5 12.5 12.5 2.5l5 5-10 10-5-5Zm3 3 1.5-1.5m1 4 1.5-1.5m1 4 1.5-1.5',
  texte: 'M4 4h12M4 8h12M4 12h8M4 16h5',
};
const pict = (cle) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${ICONES[cle]}"/></svg>`;

export function ouvrirFicheRgd(x, onChange) {
  let etapeCourante = x.etape;
  const f = x.ligne;

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
    const jours = x.recu ? daysSince(x.recu) : null;
    const signes = devis.filter(v => v.statut === 'signe');
    // ⚠ LE MONTANT QUI COMPTE EST CELUI DES DEVIS SIGNÉS ; à défaut seulement,
    // le budget annoncé par la personne. Les additionner mélangerait un
    // engagement et une intention, et la tuile dit laquelle des deux elle
    // montre.
    const montant = signes.length
      ? { valeur: eur(signes.reduce((t, v) => t + (Number(v.montant_ht) || 0), 0)), quoi: 'Signé HT' }
      : { valeur: String(x.budget || '').trim() || '—', quoi: 'Budget annoncé' };

    // ⚠ CES CHAMPS N'EXISTENT QUE SUR UNE DEMANDE. Une fiche `rgd_clients` a
    // ses équivalents Meta et rien d'autre ; `d` vaut alors un objet vide, et
    // `info()` n'affiche pas une ligne vide — la fiche ne montre donc que ce
    // qu'elle a.
    const d = x.genre === 'demande' ? f : {};
    // Le bien : « Une maison · Une résidence principale » du formulaire du
    // site, ou le `meta_type_bien` d'un lead Meta. C'est la colonne « Bien »
    // que la refonte du 23/09/2026 avait laissée en route en fusionnant les
    // trois tableaux en un seul.
    const bien = [d.type_projet, d.type_intervention].filter(Boolean).join(' · ')
      || f.meta_type_bien || f.type_bien || '';
    // ⚠ DEUX FORMES COHABITENT DANS `types_travaux` : un tableau JSON pour les
    // lignes venues de D1, du texte séparé par des virgules pour celles
    // qu'écrivent l'Edge Function et la saisie à la main. Afficher la première
    // telle quelle donnerait `["Peinture","Plomberie"]` à l'écran.
    const listeTravaux = (() => {
      const brut = String(d.types_travaux || '').trim();
      if (!brut) return [];
      if (brut.startsWith('[')) { try { return JSON.parse(brut); } catch { return [brut]; } }
      return brut.split(',').map(t => t.trim()).filter(Boolean);
    })();
    // ⚠ PAS DE REPLI SUR `x.projet` POUR UNE DEMANDE. Là, `x.projet` vaut
    // `type_projet` — « Une maison » — qui est le BIEN et non les travaux.
    // L'afficher ici mettrait « Une maison » en face de « Nature des travaux »
    // et la même valeur deux lignes plus bas.
    const travaux = listeTravaux.length
      ? listeTravaux.map(t => `<span class="chip">${esc(t)}</span>`).join(' ')
      : (x.genre === 'demande' ? '' : esc(x.projet || ''));

    // ⚠ NE PAS REPETER LE MEME MOT DEUX FOIS. La provenance est DEDUITE du
    // « comment nous avez-vous connus », donc quand la personne a repondu
    // « Recommandation » les deux valeurs sont le meme mot — la ligne
    // affichait « Recommandation · Recommandation · par Mme Perrot ».
    const provenance = (() => {
      const deduite = x.provenanceLabel || x.provenance;
      const dite = String(d.comment_connu || '').trim();
      const memeMot = dite.toLowerCase() === String(deduite).toLowerCase();
      return [deduite, memeMot ? '' : dite, d.recommandation && `par ${d.recommandation}`]
        .filter(Boolean).join(' · ');
    })();

    const tuile = (valeur, quoi) => `<div class="rgdf-tuile">
      <b>${esc(String(valeur))}</b><span>${esc(quoi)}</span></div>`;

    // ⚠ UNE LIGNE VIDE NE S'AFFICHE PAS. Un tiret en face de six intitulés
    // donne une fiche qui a l'air pleine et ne dit rien.
    const info = (icone, quoi, valeur, teinte) => valeur
      ? `<div class="rgdf-ligne ${teinte || ''}">
           <span class="rgdf-rond">${pict(icone)}</span>
           <div><span class="rgdf-quoi">${esc(quoi)}</span><div class="rgdf-valeur">${valeur}</div></div>
         </div>` : '';

    const html = `
      <div class="rgdf-hero">
        <div class="rgdf-hero-haut">
          <div class="rgdf-avatar">${esc(initiales(x.nom))}</div>
          <div class="rgdf-identite">
            <h2>${esc(x.nom || '(sans nom)')}</h2>
            <div class="rgdf-meta">
              <span class="rgdf-tag">${esc(x.provenanceLabel || x.provenance)}</span>
              <span class="rgdf-tag ${perdu ? 'est-perdu' : 'est-etape'}">${esc(perdu ? 'Perdu' : nomEtape(etapeCourante))}</span>
              ${x.recu ? `<span class="rgdf-tag">Reçu le ${esc(fmtDate(x.recu))}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="rgdf-tuiles">
          ${tuile(montant.valeur, montant.quoi)}
          ${tuile(devis.length, 'Devis')}
          ${tuile(chantiers.length, chantiers.length > 1 ? 'Chantiers' : 'Chantier')}
          ${tuile(jours == null ? '—' : (jours <= 0 ? "Aujourd'hui" : jours + ' j'), 'Dans la base')}
        </div>
      </div>

      <!-- La frise est le seul levier : cliquer une etape ecrit le statut.
           Pas de bouton « enregistrer », il laisserait croire qu'on peut
           changer d'avis alors que l'ecriture part a la source aussitot. -->
      <div class="rgdf-piste ${perdu ? 'est-perdu' : ''}">
        <div class="rgdf-jalons">
          <div class="rgdf-rail"><span style="width:${i <= 0 ? 0
            : Math.round((i / (ORDRE_ETAPES.length - 1)) * 100)}%"></span></div>
          ${ETAPES_RGD.filter(e => e.key !== 'archives').map((e, n) => `
            <button data-etape="${e.key}" title="${esc(e.titre)}"
              class="${e.key === etapeCourante ? 'cur' : (i >= 0 && n < i) ? 'past' : ''}">
              <i></i><span>${esc(e.label)}</span>
            </button>`).join('')}
        </div>
        <button data-etape="archives" class="rgdf-bouton-perdu ${perdu ? 'cur' : ''}"
          title="Perdu ou mis de côté">Perdu</button>
      </div>

      <div class="rgdf-corps">
        <div class="rgdf-colonne">
          <section class="rgdf-bloc">
            <h3>Le prospect</h3>
            ${info('tel', 'Téléphone', x.tel ? `<a href="tel:${esc(x.tel)}">${esc(x.tel)}</a>` : '', 'est-vert')}
            ${info('mail', 'Email', x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : '', 'est-bleu')}
            ${info('lieu', 'Adresse', esc(x.adresse || x.ville || ''), 'est-gris')}
            ${info('personne', 'Nature', esc(x.type || ''), 'est-gris')}
            ${!x.tel && !x.email ? '<p class="rgdf-rien">Aucun moyen de contact renseigné.</p>' : ''}
          </section>

          <section class="rgdf-bloc">
            <h3>Le projet</h3>
            ${info('travaux', 'Nature des travaux', travaux, 'est-orange')}
            ${info('euro', 'Budget annoncé', esc(String(x.budget || '').trim()), 'est-orange')}
            ${info('maison', 'Le bien', esc(bien), 'est-bleu')}
            ${info('regle', 'Superficie', d.superficie ? esc(d.superficie) + ' m²' : '', 'est-bleu')}
            ${info('personne', 'Le demandeur', esc(d.type_demandeur || ''), 'est-gris')}
            ${info('texte', 'Ce qui est demandé', esc(d.projet_description || ''), 'est-gris')}
            ${info('source', 'Provenance', esc(provenance), 'est-violet')}
            ${!x.projet && !x.budget && !bien ? '<p class="rgdf-rien">Le projet n’a pas encore été décrit.</p>' : ''}
          </section>

          ${devis.length ? `<section class="rgdf-bloc">
            <h3>Devis <span class="rgdf-compte">${devis.length}</span></h3>
            <div class="rgdf-tableau"><table><tbody>
              ${devis.map(v => { const e = dit(STATUT_DEVIS, v.statut, 'En cours');
                return `<tr>
                  <td><b>${esc(v.numero || '—')}</b>
                      <div class="s muted">${esc(v.objet || '—')}${v.date_creation ? ' · ' + esc(fmtDate(v.date_creation)) : ''}</div></td>
                  <td class="num">${eur(v.montant_ht)}</td>
                  <td class="rgdf-fin"><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}
            </tbody></table></div>
          </section>` : ''}

          ${chantiers.length ? `<section class="rgdf-bloc">
            <h3>Chantiers <span class="rgdf-compte">${chantiers.length}</span></h3>
            <div class="rgdf-tableau"><table><tbody>
              ${chantiers.map(c => { const e = dit(ETAT_CHANTIER, c.etat, 'Inconnu');
                return `<tr>
                  <td><b>${esc(c.reference || c.description || '—')}</b>
                      <div class="s muted">${c.date_debut_prevue ? esc(fmtDate(c.date_debut_prevue)) : '—'}${
                        c.date_fin_prevue ? ' → ' + esc(fmtDate(c.date_fin_prevue)) : ''}${
                        c.ville ? ' · ' + esc(c.ville) : ''}</div></td>
                  <td class="rgdf-fin"><span class="chip ${e.ton}">${esc(e.label)}</span></td>
                </tr>`; }).join('')}
            </tbody></table></div>
          </section>` : ''}

          ${devis.length || chantiers.length ? `<p class="rgdf-source">Devis et chantiers viennent de
            Costructor, relevés toutes les 30 minutes. Ils se modifient dans
            l’<a href="#/rgd/app">application RGD</a>.</p>` : ''}
        </div>

        <div class="rgdf-colonne">
          ${commentaireSource ? `<section class="rgdf-bloc rgdf-commentaire">
            <h3>Commentaire</h3>
            <p class="rgdf-texte">${esc(commentaireSource)}</p>
            <p class="rgdf-source">Saisi dans l’<a href="#/rgd/app">application RGD</a>, qui en reste la source.</p>
          </section>` : ''}

          <section class="rgdf-bloc rgdf-suivi">
            <h3>Historique <span class="rgdf-compte">${evs.length}</span></h3>
            ${aUneAncre ? `
              <form id="rgdf-note" class="rgdf-ajout">
                <input name="body" required placeholder="Noter un appel, un échange, une décision…">
                <button class="btn sm" type="submit">Ajouter</button>
              </form>` : '<p class="rgdf-rien">Cette ligne n’est rattachée à aucun contact : l’historique ne peut pas s’y accrocher.</p>'}
            <ol class="rgdf-fil">
              ${evs.length ? evs.map(e => `
                <li class="${e.kind === 'stage' ? 'est-etape' : ''}">
                  <div class="rgdf-quand">${esc(fmtDateTime(e.created_at))} · ${esc(userName(e.author_id))}</div>
                  <div class="rgdf-dit">${esc(e.body)}</div>
                </li>`).join('')
                : '<li class="rgdf-vide">Rien d’enregistré pour l’instant.</li>'}
            </ol>
          </section>
        </div>
      </div>`;

    const m = openModal('', html, { wide: true, onClose: () => onChange?.() });
    m.classList.add('rgdf');

    m.querySelectorAll('[data-etape]').forEach(b => b.onclick = async () => {
      const vers = b.dataset.etape;
      if (vers === etapeCourante) return;
      // « Nouvelle demande » n'a pas de statut unique — cinq y mènent. On pose
      // « contacté » : y revenir est une décision, et `nouveau_prospect`
      // signifie « personne n'a rien dit ».
      const statut = vers === 'demande' ? 'a_contacter' : STATUT_DE_L_ETAPE[vers];
      m.querySelectorAll('[data-etape]').forEach(o => { o.disabled = true; });
      const avant = etapeCourante;
      const r = await ecrireStatut({ d1Id: f.d1_id, uuid: f.id, cible: x.cible, statut });
      if (r.ok) {
        etapeCourante = vers;
        x.etape = vers;
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
