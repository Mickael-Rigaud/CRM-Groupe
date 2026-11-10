// Espace RGD Renova — réglages
//
// CE QUE CET ÉCRAN REMPLACE, ET CE QU'IL NE REMPLACE PAS
// L'écran « Paramètres » du tableau de bord porte trois choses très
// différentes, et une seule a sa place ici :
//
//   1. Les corrections manuelles du chiffre d'affaires — DE L'INFORMATION
//      MÉTIER, saisie par Mickael. Elle vient ici.
//   2. La clé d'API Costructor — UN SECRET. Il n'a rien à faire dans un écran
//      ni dans une base ; sa place est dans les secrets de la plateforme. Le
//      tableau de bord le rangeait dans `app_settings`, lisible par toute
//      requête qui lit cette table ; c'est aujourd'hui `COSTRUCTOR_API_KEY`,
//      un secret Supabase que les trois fonctions de synchro lisent seules.
//   3. La connexion Google Agenda — elle passait par un parcours OAuth, donc
//      par un serveur capable de recevoir la redirection. Elle passe
//      désormais par un COMPTE DE SERVICE (`GOOGLE_SA_JSON`, secret
//      Supabase) : plus de consentement à redonner, plus d'abonnement à
//      renouveler.
//
// ⚠ « CLIENTS ACTIFS DÉCLARÉS » EST DEVENU UN CHAMP — 28/09/2026. Il était
// listé comme non réglable ici, à changer « dans l'application RGD ». Celle-ci
// est éteinte, et la valeur vit dans `rgd_reglages` comme les deux autres :
// la laisser en lecture seule aurait renvoyé vers une porte qui n'existe plus.
//
// POURQUOI LE CA EST SAISI À LA MAIN
// La reprise Costructor est incomplète : le calcul automatique sous-estime.
// Tant que c'est le cas, la valeur saisie l'emporte — et le CRM l'affiche
// telle quelle, sinon les deux outils annonceraient deux chiffres d'affaires.
//
// ⚠ SAISIR 0 N'ÉCRIT PAS « ZÉRO EURO »
// Cela EFFACE la correction et rend la main au calcul automatique. C'est utile
// le jour où Costructor sera complet, et c'est exactement le genre de chose
// qu'un écran doit dire plutôt que de laisser découvrir.
//
// ⚠ CES TROIS RÉGLAGES SONT PASSÉS À SUPABASE — 22/09/2026, phase 2.
// L'écran écrit maintenant DIRECTEMENT dans `rgd_reglages` : le relevé ne les
// envoie plus, et les réécrire toutes les trente minutes aurait effacé la
// correction à peine saisie.
//
// ⚠ MAIS LA TABLE A DEUX PROPRIÉTAIRES, et c'est la différence avec les
// apporteurs. `costructor_clients_uniques` est CALCULÉ par le worker à partir
// de Costructor : il reste relayé, et cet écran ne doit pas y toucher. Une
// table peut appartenir à deux endroits selon la clé — le croire basculée en
// entier ferait écraser un chiffre qu'on ne sait pas produire ici.
import { scope } from '../data/scope.js';
import { esc, eur, toast, openModal, closeModal } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { db } from '../data/db.js';
import { lienAvis, lienAvisValide, enregistrerLienAvis } from '../data/rgd-avis.js';
import { objectifsMensuels, OBJECTIFS_DEFAUT } from '../data/rgd-objectifs.js';
import { signatureRgd, enregistrerSignatureRgd, retirerSignatureRgd } from '../data/rgd-devis-crm.js';
import { posePadSignature } from '../pad-signature.js';

const nombreDe = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const rgdReglagesPage = {
  title: () => 'RGD Renova — Réglages',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    // La policy `rgd_reglages_acces` est en `has_activity('rgd')` : il n'y a
    // plus de compte sur le tableau de bord à exiger, puisqu'on n'y va plus.
    const state = { ecriture: scope.canRgd };

    const draw = () => {
      const avis = lienAvis();
      const sig = signatureRgd();
      const obj = objectifsMensuels();

      const champ = (id, label, valeur) => `
        <label class="reg-champ">
          <span>${esc(label)}</span>
          <input type="text" id="${id}" value="${valeur != null ? esc(valeur) : ''}"
                 inputmode="decimal" placeholder="laisser vide pour ne pas changer"
                 ${state.ecriture ? '' : 'disabled'}>
        </label>`;

      // ⚠ LA CARTE « CHIFFRE D'AFFAIRES DE L'EXERCICE » A ÉTÉ RETIRÉE LE
      // 10/11/2026 (Élodie : « corrige les deux réglages inertes »). Elle portait
      // trois champs — CA HT saisi, CA TTC saisi, clients actifs déclarés — que
      // PLUS AUCUN ÉCRAN NE LISAIT depuis que la carte « Chiffre d'affaires » de
      // la vue d'ensemble a disparu, le matin même. Un champ qui s'enregistre
      // sans que rien ne change est pire qu'un champ absent : on saisit une
      // correction, l'écran dit « Enregistré », et le chiffre reste le même —
      // on en conclut que le CRM est cassé.
      //
      // ⚠ ET SON BANDEAU AFFIRMAIT UNE CHOSE FAUSSE : « elles l'emportent sur le
      // calcul automatique, parce que la reprise Costructor est incomplète et que
      // le calcul sous-estime ». Ce n'est plus vrai depuis le 23/09/2026, date où
      // la synchronisation a été réparée : le calcul donne exactement le chiffre
      // de Costructor. C'est même la raison pour laquelle la correction a été
      // vidée — elle masquait le SIGNAL qu'un écart apparaîtrait.
      //
      // ⚠ LES LIGNES RESTENT EN BASE, elles ne sont pas effacées : `manual_ca_*`
      // sont vides et `manual_clients_actifs` porte encore le 34 déclaré. Rien ne
      // les lit, elles ne gênent personne, et les supprimer ferait perdre une
      // trace sans rien gagner. Le tableau du bas le dit à qui les chercherait.
      const corps = `
        <!-- Les objectifs mensuels de la vue d'ensemble (04/11/2026, Elodie).
             Une seule cle, « objectifs_mensuels », qui porte un objet JSON :
             les cinq nombres bougent ensemble et n'ont aucun sens separement.
             Cinq cles auraient fait cinq ecritures et cinq occasions d'en
             oublier une. -->
        <section class="card">
          <div class="card-head"><h2>Objectifs mensuels</h2>
            <span class="muted small">la carte « Objectifs du mois »</span></div>
          ${/* ⚠ CE MOT SUIVAIT LA CARTE RETIRÉE, il ne devait pas partir avec
                elle : sans lui, un écran dont tous les champs sont grisés ne dit
                pas POURQUOI, et on cherche la panne. */ ''}
          ${state.ecriture ? '' : `<p class="small muted">
            Lecture seule : aucun compte RGD Renova n’est associé à votre adresse,
            ou vous êtes en mode démonstration.</p>`}
          <div class="reg-grille">
            ${champ('reg-ob-dem', 'Nouvelles demandes', obj.demandes)}
            ${champ('reg-ob-rdv', 'Rendez-vous', obj.rdv)}
            ${'' /* ⚠ « Devis envoyés » SE SAISIT DEPUIS LE 10/11/2026 : il était
                 déjà LU par le bilan commercial (10 par mois, 120 par an), mais
                 nulle part modifiable. La tuile « Devis envoyés » de la vue
                 d'ensemble affiche cet objectif : sans ce champ, elle aurait
                 montré un repère que personne ne pouvait bouger. */}
            ${champ('reg-ob-env', 'Devis envoyés', obj.envoyes)}
            ${champ('reg-ob-dev', 'Chantiers / devis signés', obj.devis)}
            ${champ('reg-ob-ca', 'Chiffre d’affaires HT (€)', obj.ca)}
          </div>
          <p class="small muted">Ils servent de repère sur la vue d’ensemble : la part
          atteinte, la couleur de chaque mois et le trait en pointillés des frises.
          <b>Saisir 0 remet la valeur d’origine</b> (${OBJECTIFS_DEFAUT.demandes} demandes,
          ${OBJECTIFS_DEFAUT.rdv} rendez-vous, ${OBJECTIFS_DEFAUT.envoyes} devis envoyés,
          ${OBJECTIFS_DEFAUT.devis} chantiers,
          ${OBJECTIFS_DEFAUT.ca.toLocaleString('fr-FR')} €).
          Changer un objectif ne change aucun chiffre réel — seulement la barre à côté.</p>
          ${state.ecriture ? `<div class="toolbar">
            <button type="button" class="btn primary" id="reg-ob-ok">Enregistrer</button>
            <span class="muted small" id="reg-ob-etat"></span>
          </div>` : ''}
        </section>

        <!-- ATTENTION : le lien d'avis vit dans la table des reglages
             generiques, pas dans une table neuve (13/10/2026) : une cle, une
             valeur, et des policies qui existent deja (lecture pour tous,
             ecriture direction). Aucune migration. Il commande le bouton
             « Demander un avis » de la fiche client : tant qu'il est vide, le
             bouton n'existe pas, plutot que d'ouvrir une fenetre qui ne sait
             rien envoyer.
             (Pas d'accent grave ici : dans un commentaire HTML pose au milieu
             d'un gabarit, il FERME le gabarit, sans un mot.) -->
        <section class="card">
          <div class="card-head"><h2>Avis Google</h2>
            <span class="muted small">le lien envoyé aux clients</span></div>
          <div class="reg-grille">
            <label class="field reg-large" for="reg-avis">
              <span>Lien de demande d’avis</span>
              <input id="reg-avis" type="url" value="${esc(avis)}"
                placeholder="https://g.page/r/…/review" ${state.ecriture ? '' : 'disabled'}>
            </label>
          </div>
          <p class="small muted">Dans votre fiche d’établissement Google, bouton
            <b>« Demander des avis »</b> : Google y donne un lien court à copier ici.
            <b>Ne le fabriquez pas à la main</b> — un lien approximatif enverrait vos
            clients vers la fiche de quelqu’un d’autre, et personne ne s’en apercevrait.</p>
          <p class="small muted">Une fois réglé, un bouton <b>« ★ Demander un avis »</b>
            apparaît sur la fiche d’un client <b>dont le chantier est terminé</b> —
            et seulement à ce moment-là.</p>
          ${state.ecriture ? `<div class="toolbar">
            <button type="button" class="btn primary" id="reg-avis-ok">Enregistrer le lien</button>
            <button type="button" class="btn ghost" id="reg-avis-essai"${avis ? '' : ' disabled'}>Ouvrir pour vérifier</button>
            <span class="muted small" id="reg-avis-etat"></span>
          </div>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><h2>Signature sur les factures</h2>
            <span class="muted small">apposée d’avance sur le PDF</span></div>
          ${sig ? `<div class="reg-signature">
            <img src="${esc(sig.image)}" alt="Signature enregistrée">
            <div><b>${esc(sig.nom || '')}</b><br>
              <span class="muted small">enregistrée le ${esc(sig.le ? new Date(sig.le).toLocaleDateString('fr-FR') : '')}</span></div>
          </div>` : `<p class="small muted"><b>Aucune signature enregistrée.</b> Les factures sortent
            avec un trait vide à côté de « Pour RGD Renova » — et sur un PDF envoyé par mail,
            ce trait ne se remplit jamais.</p>`}
          <p class="small muted">Elle apparaît dans le bloc <b>« Pour RGD Renova »</b> de
            <b>toutes</b> les factures, y compris celles que Franck envoie depuis son téléphone.</p>
          <p class="small muted">Ce n’est <b>pas</b> la signature du client : celle-là se trace
            sur place, à la fin de l’intervention, et appartient à la facture qu’il a signée.</p>
          ${state.ecriture ? `<div class="toolbar">
            <button type="button" class="btn primary" id="reg-sign-ok">${sig ? 'Refaire la signature' : 'Enregistrer une signature'}</button>
            ${sig ? '<button type="button" class="btn ghost" id="reg-sign-off">Retirer</button>' : ''}
          </div>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><h2>Ce qui n’est pas réglable ici</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Réglage</th><th>Valeur</th><th>Pourquoi</th></tr></thead>
            <tbody>
              <tr>
                <td><b>Clé d’API Costructor</b></td>
                <td class="muted">masquée</td>
                <td class="muted">C’est un <b>secret</b>. Il est rangé dans les secrets de la
                    plateforme, pas dans un écran ni dans une table que toute requête peut lire.</td>
              </tr>
              ${/* ⚠ LA TRACE DES DEUX RÉGLAGES RETIRÉS EST ICI, et c'est le seul
                    endroit où les chercher a un sens : c'est la page où l'on vient
                    quand on se demande « mais où je change ça ? ». Sans ces deux
                    lignes, un champ disparaît sans un mot et on le croit perdu. */ ''}
              <tr>
                <td><b>Correction manuelle du chiffre d’affaires</b></td>
                <td class="muted">retirée le 10/11/2026</td>
                <td class="muted">Elle existait parce que le calcul sous-estimait : la reprise
                    Costructor était incomplète. <b>Ce n’est plus vrai depuis le 23/09/2026</b> —
                    la synchronisation a été réparée et le calcul donne le chiffre de Costructor
                    à l’euro. Une correction à la main ne masque pas seulement un écart, elle
                    masque le <b>signal</b> qu’un écart apparaîtrait. Le CA de l’exercice se lit
                    dans <a href="#/rgd">les objectifs</a>, vue Exercice.</td>
              </tr>
              <tr>
                <td><b>Clients actifs déclarés</b></td>
                <td class="muted">retiré le 10/11/2026</td>
                <td class="muted">Ce nombre ne s’affichait que sur la carte « Chiffre
                    d’affaires » de la vue d’ensemble, retirée le 10/11/2026. Les clients se
                    comptent désormais là où ils vivent, dans
                    <a href="#/rgd/clients">Clients &amp; prospects</a>.</td>
              </tr>
              <tr>
                <td><b>Connexion Google Agenda</b></td>
                <td class="muted">active</td>
                <td class="muted">Elle passe par un compte de service, lui aussi rangé dans les
                    secrets : il n’y a aucune autorisation à redonner ni à renouveler.</td>
              </tr>
            </tbody>
          </table></div>
        </section>`;

      root.innerHTML = cadre('#/rgd/reglages', 'Réglages', corps);

      // ⚠ LE LIEN A SON PROPRE BOUTON, et ce n'est pas du rangement : celui du
      // dessus écrit dans `rgd_reglages`, celui-ci dans `settings`. Deux tables,
      // deux droits, deux échecs possibles — les confondre ferait dire « tout est
      // enregistré » alors qu'une moitié seulement est passée.
      const bAvis = root.querySelector('#reg-avis-ok');
      if (bAvis) bAvis.onclick = async () => {
        const champAvis = root.querySelector('#reg-avis');
        const etatAvis = root.querySelector('#reg-avis-etat');
        const v = champAvis.value.trim();
        // ⚠ VIDER LE CHAMP RETIRE LE LIEN, et c'est le seul moyen de faire
        // disparaître le bouton de la fiche. On ne refuse donc pas le vide.
        if (v) {
          const ok = lienAvisValide(v);
          if (!ok.ok) { toast(ok.motif, 'err'); return; }
        }
        bAvis.disabled = true;
        etatAvis.textContent = 'Enregistrement…';
        try {
          await enregistrerLienAvis(v);
          etatAvis.textContent = v ? 'Lien enregistré' : 'Lien retiré';
          toast(v ? 'Lien d’avis enregistré' : 'Lien d’avis retiré');
          draw();
        } catch (e) {
          bAvis.disabled = false;
          etatAvis.textContent = '';
          toast(e.message || 'Enregistrement impossible', 'err');
        }
      };
      // ⚠ « OUVRIR POUR VÉRIFIER » EST LE SEUL CONTRÔLE QUI VAILLE : un lien peut
      // être bien formé et pointer sur la fiche d'un autre. Aucune vérification
      // automatique ne peut dire « c'est bien RGD Renova » — seul l'œil le peut.
      const bEssai = root.querySelector('#reg-avis-essai');
      if (bEssai) bEssai.onclick = () => {
        const v = root.querySelector('#reg-avis').value.trim();
        if (v) window.open(v, '_blank', 'noopener');
      };

      // ⚠ LE PAD VIT DANS SA PROPRE FENÊTRE, pas dans la carte : tracer une
      // signature au doigt demande de la place, et sur téléphone une carte est
      // large de trois centimètres.
      const bSign = root.querySelector('#reg-sign-ok');
      if (bSign) bSign.onclick = () => {
        const fen = openModal('Signature de RGD Renova', '<div id="reg-pad"></div>', { wide: true });
        posePadSignature(fen.querySelector('#reg-pad'), {
          aide: 'Tracez la signature au doigt, ou <b>importez le cachet de l\u2019entreprise</b> (PNG ou JPEG). Elle sera apposée sur les factures, au nom de RGD Renova.',
          nom: scope.user?.full_name || '',
          labelNom: 'Signée par',
          libelleValider: 'Enregistrer',
          importAutorise: true,
          surAnnuler: () => closeModal(true),
          // ⚠ ON FAIT SUIVRE `w` ET `h`. Les oublier ici ne cassait rien
          // visiblement : la signature s'enregistrait, l'aperçu s'affichait, et
          // le document la rendait à la hauteur de REPLI — un cachet carré
          // réduit à un timbre de 15 mm, sans le moindre message. Constaté le
          // 02/11/2026 en relisant la ligne enregistrée, pas l'écran.
          surValider: async ({ image, nom, w, h }) => {
            await enregistrerSignatureRgd({ image, nom, w, h });
            closeModal(true);
            toast('Signature enregistrée');
            draw();
          },
        });
      };
      const bSignOff = root.querySelector('#reg-sign-off');
      if (bSignOff) bSignOff.onclick = async () => {
        bSignOff.disabled = true;
        try {
          await retirerSignatureRgd();
          toast('Signature retirée');
          draw();
        } catch (e) {
          bSignOff.disabled = false;
          toast(`Non retirée — ${String(e.message).slice(0, 120)}`, 'err');
        }
      };

      // ⚠ LES CINQ OBJECTIFS PARTENT ENSEMBLE, DANS UNE SEULE VALEUR JSON.
      // Un champ laissé vide garde ce qui y était ; 0 rend la valeur d'origine.
      // On relit donc les cinq à chaque enregistrement — écrire l'objet avec
      // un seul champ effacerait les quatre autres sans un mot.
      const boutonObj = root.querySelector('#reg-ob-ok');
      if (boutonObj) boutonObj.onclick = async () => {
        const etat = root.querySelector('#reg-ob-etat');
        const lu = (id, actuel, defaut) => {
          const v = root.querySelector(id).value.trim();
          if (v === '') return actuel;
          const num = nombreDe(v);
          if (num === null) return NaN;
          return num === 0 ? defaut : num;
        };
        const neuf = {
          demandes: lu('#reg-ob-dem', obj.demandes, OBJECTIFS_DEFAUT.demandes),
          rdv: lu('#reg-ob-rdv', obj.rdv, OBJECTIFS_DEFAUT.rdv),
          envoyes: lu('#reg-ob-env', obj.envoyes, OBJECTIFS_DEFAUT.envoyes),
          devis: lu('#reg-ob-dev', obj.devis, OBJECTIFS_DEFAUT.devis),
          ca: lu('#reg-ob-ca', obj.ca, OBJECTIFS_DEFAUT.ca),
        };
        if (Object.values(neuf).some(v => !Number.isFinite(v) || v <= 0)) {
          toast('Un objectif n’est pas un nombre positif', 'err'); return;
        }
        boutonObj.disabled = true;
        etat.textContent = 'Enregistrement…';
        try {
          const valeur = JSON.stringify(neuf);
          const ligne = scope.rgd('rgd_reglages').find(x => x.cle === 'objectifs_mensuels');
          if (ligne) {
            const maj = await db.update('rgd_reglages', 'objectifs_mensuels', { valeur });
            ligne.valeur = maj?.valeur ?? valeur;
          } else {
            scope.rgd('rgd_reglages').push(await db.insert('rgd_reglages', { cle: 'objectifs_mensuels', valeur }));
          }
          toast('Objectifs enregistrés');
          draw();
        } catch (e) {
          boutonObj.disabled = false;
          etat.textContent = '';
          toast(`Non enregistré — ${String(e.message).slice(0, 120)}`, 'err');
        }
      };

    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
