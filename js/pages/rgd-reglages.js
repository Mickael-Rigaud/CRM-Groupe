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
import { lireCompteSumUp, appairerLecteurSumUp, estPilotable,
  lecteurSumUp, choisirLecteurSumUp } from '../data/rgd-sumup.js';

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
    // ⚠ L'INTERROGATION DE SUMUP N'EST PAS AUTOMATIQUE : c'est un appel vers
    // l'extérieur, au chargement d'un écran qu'on ouvre pour tout autre chose.
    // On le déclenche à la demande, et on garde la réponse dans `state` pour
    // que le redessin ne la reperde pas.
    const sumup = { etat: 'repos', info: null, motif: null, code: '' };

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
      /**
       * Ce que SumUp répond, mis en français.
       *
       * ⚠ LE MODÈLE DU LECTEUR EST LE SEUL CHIFFRE QUI COMPTE ICI. `solo` et
       * `go` se pilotent depuis le CRM ; un `air`, un `solo lite`, un `3G` se
       * jumellent en Bluetooth à l'application SumUp et aucune API ne les
       * atteint. L'écran le dit en toutes lettres plutôt que d'afficher un nom
       * de modèle et de laisser deviner — c'est cette distinction qui décide
       * si Franck tendra le terminal ou tapera le montant à la main.
       */
      function blocSumUp() {
        if (sumup.etat === 'repos') {
          return `<p class="small muted">Les deux clés SumUp sont posées dans les secrets du CRM,
            jamais dans cette page. Interrogez SumUp pour voir le compte et les lecteurs reliés.</p>
            <div class="toolbar"><button type="button" class="btn primary" id="reg-su-info">Interroger SumUp</button></div>`;
        }
        if (sumup.etat === 'attente') {
          return '<p class="small muted">Interrogation de SumUp…</p>';
        }
        if (sumup.etat === 'echec') {
          return `<p class="reg-su-mal"><b>SumUp n’a pas répondu.</b> ${esc(sumup.motif || '')}</p>
            <p class="small muted">Si le message parle d’une clé absente, elle n’est pas posée
            dans les secrets du CRM. S’il parle d’un 401, la clé est là mais SumUp la refuse —
            vérifiez qu’il s’agit de la clé <b>secrète</b> et non de la publique, et qu’aucun
            espace ne traîne au bout.</p>
            <div class="toolbar"><button type="button" class="btn" id="reg-su-info">Réessayer</button></div>`;
        }
        const d = sumup.info || {};
        const lecteurs = d.lecteurs || [];
        const retenu = lecteurSumUp();
        // ⚠ LE LECTEUR MIS EN AVANT EST CELUI QUE LE CRM ADRESSE, pas le
        // premier pilotable de la liste : sur un compte d'entreprise, le
        // premier de la liste n'est celui de personne en particulier.
        const pilotable = (retenu && lecteurs.find(l => l.id === retenu.id && estPilotable(l.modele)))
          || lecteurs.find(l => estPilotable(l.modele));
        return `<div class="reg-su-compte">
            <span><b>${esc(d.marchand?.nom || 'Compte SumUp')}</b></span>
            <span class="muted small">code marchand ${esc(d.marchand?.code || '—')}${
              d.marchand?.pays ? ' · ' + esc(d.marchand.pays) : ''}</span>
          </div>
          ${/* ⚠ UNE COLONNE « UTILISÉ », PARCE QUE LE COMPTE EST CELUI DE
                L'ENTREPRISE (11/11/2026, Élodie). Plusieurs personnes peuvent
                y relier leur terminal ; le CRM n'en adresse qu'un, et envoyer
                un montant sur le mauvais ferait sonner la carte à l'autre
                bout du département. Le choix est explicite. */ ''}
          ${lecteurs.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Lecteur</th><th>Modèle</th><th>État</th><th>Pilotable par le CRM</th><th></th></tr></thead>
            <tbody>${lecteurs.map(l => `<tr>
              <td><b>${esc(l.nom || '—')}</b></td>
              <td>${esc(l.modele || '—')}</td>
              <td>${esc(l.statut || '—')}</td>
              <td>${estPilotable(l.modele)
                ? '<span class="chip green">Oui</span>'
                : '<span class="chip amber">Non — appli SumUp seule</span>'}</td>
              <td class="rgdf-fin">${!estPilotable(l.modele) ? ''
                : (retenu && retenu.id === l.id)
                  ? '<span class="chip green">Utilisé par le CRM</span>'
                  : (state.ecriture ? `<button type="button" class="btn ghost sm"
                      data-su-choisir="${esc(l.id)}">Utiliser celui-ci</button>` : '')}</td>
            </tr>`).join('')}</tbody>
          </table></div>`
          : '<p class="reg-su-mal"><b>Aucun lecteur n’est relié au compte.</b> Tant qu’il n’y en a pas, le CRM ne peut rien pousser sur un terminal.</p>'}
          ${pilotable
            ? `<p class="small muted">✓ <b>${esc(pilotable.nom || 'Le lecteur')}</b> est un
              <b>${esc(pilotable.modele)}</b> : le CRM pourra lui envoyer le montant d’une facture,
              et la marquer encaissée tout seul quand le client aura payé.${
                retenu && retenu.id === pilotable.id ? '' :
                ' <b>Reste à dire au CRM de l’utiliser</b>, avec le bouton de sa ligne.'}</p>`
            : `<p class="small muted">Seuls les lecteurs <b>Solo</b> (et <b>Go</b>, qui n’est pas
              vendu en France) acceptent d’être pilotés à distance. Un <b>Air</b>, un
              <b>Solo Lite</b>, un <b>3G</b> ou un <b>PIN+</b> ne parlent qu’à l’application
              SumUp : le CRM enregistrera alors le paiement après coup, sans le déclencher.</p>`}
          ${state.ecriture ? `<div class="reg-su-appairer">
            <p class="small muted"><b>Relier un lecteur Solo :</b> sur l’appareil <b>déconnecté</b>,
            ouvrez <b>Connexions → API → Connecter</b>. Un code apparaît — il expire en
            <b>cinq minutes</b>.</p>
            <div class="toolbar">
              <input type="text" id="reg-su-code" placeholder="code affiché sur le lecteur"
                autocomplete="off" spellcheck="false">
              <input type="text" id="reg-su-nom" class="reg-su-nom" placeholder="nom de l’appareil (ex. Franck)"
                autocomplete="off">
              <button type="button" class="btn" id="reg-su-appairer">Relier</button>
              <span class="muted small" id="reg-su-etat"></span>
            </div>
          </div>` : ''}
          <div class="toolbar"><button type="button" class="btn ghost" id="reg-su-info">Rafraîchir</button></div>`;
      }

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

        <!-- ⚠ L'ENCAISSEMENT PAR CARTE (11/11/2026, Élodie). Cette carte ne
             contient AUCUNE clé : les deux vivent dans les secrets de la
             fonction sumup, côté serveur. Une clé API SumUp permet
             d'encaisser — la poser dans une page qui part dans le navigateur
             reviendrait à la donner. L'écran ne fait que PARLER à la fonction,
             avec la session du CRM.
             ⚠ ET PAS D'ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un
             gabarit de chaîne JavaScript, où un accent grave ferme la chaîne.
             Payé à l'instant. -->
        <section class="card">
          <div class="card-head"><h2>Encaissement par carte</h2>
            <span class="muted small">le compte SumUp de RGD Renova</span></div>
          ${blocSumUp()}
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

      // ── SumUp ──────────────────────────────────────────────
      const brancherSumUp = () => {
        const bInfo = root.querySelector('#reg-su-info');
        if (bInfo) bInfo.onclick = async () => {
          sumup.etat = 'attente'; draw();
          const r = await lireCompteSumUp();
          if (r.ok) { sumup.etat = 'lu'; sumup.info = r.donnees; sumup.motif = null; }
          else { sumup.etat = 'echec'; sumup.motif = r.motif; }
          draw();
        };
        root.querySelectorAll('[data-su-choisir]').forEach(b => b.onclick = async () => {
          const l = (sumup.info?.lecteurs || []).find(x => String(x.id) === b.dataset.suChoisir);
          if (!l) return;
          b.disabled = true;
          try {
            await choisirLecteurSumUp({ ...l, marchand: sumup.info?.marchand?.code || null });
            toast(`Le CRM enverra les montants sur « ${l.nom || l.modele} »`);
            draw();
          } catch (e) {
            b.disabled = false;
            toast(e.message || 'Choix non enregistré', 'error');
          }
        });
        const bApp = root.querySelector('#reg-su-appairer');
        if (bApp) bApp.onclick = async () => {
          const champ = root.querySelector('#reg-su-code');
          const etat = root.querySelector('#reg-su-etat');
          const code = (champ?.value || '').trim();
          if (!code) { toast('Entrez le code affiché sur le lecteur', 'error'); return; }
          bApp.disabled = true; if (etat) etat.textContent = 'Appairage…';
          // Le nom sert à reconnaître l'appareil dans la liste du compte : on
          // le demande plutôt que de le deviner, puisque plusieurs personnes
          // peuvent relier le leur.
          const nom = (root.querySelector('#reg-su-nom')?.value || '').trim();
          const r = await appairerLecteurSumUp(code, nom || 'Lecteur RGD');
          bApp.disabled = false;
          if (!r.ok) {
            if (etat) etat.textContent = '';
            // ⚠ LE CODE EXPIRÉ EST LE CAS LE PLUS FRÉQUENT, et le message de
            // SumUp ne le dit pas toujours : on le rappelle plutôt que de
            // laisser chercher.
            toast(`Appairage impossible : ${r.motif} — le code expire en cinq minutes, refaites-en un`, 'error');
            return;
          }
          if (champ) champ.value = '';
          await db.recharger('rgd_reglages').catch(() => {});
          toast('Lecteur relié au CRM');
          const info = await lireCompteSumUp();
          if (info.ok) { sumup.etat = 'lu'; sumup.info = info.donnees; }
          draw();
        };
      };

      root.innerHTML = cadre('#/rgd/reglages', 'Réglages', corps);

      brancherSumUp();

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
