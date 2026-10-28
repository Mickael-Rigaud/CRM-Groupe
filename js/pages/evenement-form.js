// Le formulaire « Nouveau rendez-vous », partagé par les structures
//
// ⚠ IL VIVAIT DANS `rgd-agenda.js` JUSQU'AU 30/09/2026 ; il en est SORTI, pas
// recopié (demandé par Mickael : « je voudrais avoir la possibilité de rajouter
// un rdv directement depuis le google agenda du tableau de bord » de BTP
// Expertise). Deux formulaires qui posent les mêmes questions finissent par ne
// plus les poser pareil, et le défaut ne se voit alors que sur une structure —
// c'est exactement ce qui s'était produit avec les trois formulaires de BTP,
// dont un seul savait modifier.
//
// ⚠ LA FORME EST CELLE DE GOOGLE AGENDA (25/09/2026, demandé par Mickael :
// « je voudrais reprendre les informations demandées comme sur Google, la même
// présentation si possible »). Un titre nu en tête, puis des lignes à icône —
// horaire, invités, lieu, description. On y saisit un rendez-vous dix fois par
// semaine, et deux outils qui posent les mêmes questions dans deux ordres
// différents font hésiter à chaque fois.
//
// ⚠ CE QUI N'EST PAS REPRIS, ET POURQUOI. Les onglets « Tâche », « Absent du
// bureau » et « Planning des rendez-vous » sont des objets Google que le CRM ne
// sait pas créer ; « Google Meet », « Occupé / Visibilité » et « notification
// 10 minutes avant » ne passent pas par la fonction serveur. Les afficher
// grisés ferait un formulaire à moitié mort, et les afficher actifs ferait
// perdre la saisie. On montre ce qui marche.
import { esc, openModal, closeModal, toast } from '../ui.js';
import { creerEvenement, decale, finApres } from '../data/evenements.js';
// La semaine de la personne, à côté du formulaire (28/10/2026) : les mêmes
// briques que l'écran rendez-vous de la fiche projet — lues chez Google, pas
// dans le reflet, pour la raison écrite en tête de `rgd-creneaux.js`.
import {
  lireCreneaux, occupationDuJour, placesLibres, hhmm, lundiDe,
  aujourdhuiParis, maintenantParis,
} from '../data/rgd-creneaux.js';

// ⚠ `decale` ET `finApres` ONT QUITTÉ CE FICHIER LE 01/10/2026 pour
// `js/data/evenements.js`. Ils comptaient en minutes de pendule pour un
// formulaire ; ils servent maintenant aussi au choix de créneau de la fiche
// projet RGD, qui est un module de DONNÉES et ne peut pas importer une page.
// Les recopier là-bas aurait fait deux exemplaires d'une correction — très
// exactement ce que l'en-tête de ce fichier interdit pour le formulaire.
const p2 = (n) => String(n).padStart(2, '0');

/**
 * Ouvre le formulaire et crée le rendez-vous dans Google Agenda.
 *
 * - `jour`       : la date proposée (AAAA-MM-JJ).
 * - `activite`   : la structure dont c'est l'agenda ; « rgd » par défaut, comme
 *                  côté serveur, pour que l'écran RGD n'ait rien eu à changer.
 * - `structure`  : son nom, affiché sous les invités — ils recevront un mail à
 *                  son nom, autant qu'il soit écrit avant d'envoyer.
 * - `metiers`    : `[[clé, libellé], …]` quand la structure tient plusieurs
 *                  agendas. ⚠ Le serveur EXIGE alors le métier : voir plus bas.
 * - `pied`       : ce qui se passe une fois enregistré, qui n'est pas le même
 *                  d'un écran à l'autre — une grille dessinée par le CRM se
 *                  remplit seule, un cadre Google doit être rechargé.
 * - `avis`       : une conséquence à annoncer AVANT d'enregistrer, s'il y en a.
 * - `apres`      : appelé après un enregistrement réussi.
 * - `agendas`    : `[[valeur, libellé], …]` — la direction choisit DANS QUEL
 *                  AGENDA poser (28/10/2026) ; `valeur` part en `pour` vers le
 *                  serveur, qui revérifie le droit. Absent pour les autres.
 * - `agenda`     : la valeur cochée d'office.
 */
export function formulaireEvenement({
  jour, activite = 'rgd', structure = 'RGD Renova', metiers = null,
  pied = 'Créé dans <b>Google Agenda</b>, puis relu aussitôt : il apparaît dans la grille dès la fermeture de cette fenêtre.',
  avis = '', apres = null, agendas = null, agenda = '',
} = {}) {
  // L'état vit ici et non dans le DOM : la ligne des invités se redessine à
  // chaque ajout, et une saisie en cours ailleurs ne doit pas partir avec.
  const etat = { invites: [] };

  // Les fins proposées, comme chez Google : toutes les 15 minutes à partir du
  // début, avec la durée entre parenthèses. ⚠ La liste se REFAIT quand le début
  // change — figée, elle proposerait des fins antérieures au début, ce qui est
  // très exactement le défaut corrigé une heure plus tôt.
  const optionsFin = (date, debut) => {
    const out = [];
    for (let m = 15; m <= 8 * 60; m += 15) {
      const h = finApres(date, debut, m).slice(11, 16);
      const lib = m < 60 ? `${m} min`
        : m % 60 === 0 ? `${m / 60} h`
        : `${Math.floor(m / 60)} h ${m % 60}`;
      out.push(`<option value="${esc(String(m))}"${m === 60 ? ' selected' : ''}>${esc(h)} (${esc(lib)})</option>`);
    }
    return out.join('');
  };

  // ⚠ LE MÉTIER EST UN SEGMENT, PAS UNE LISTE DÉROULANTE, et il est en TÊTE du
  // formulaire : il décide de l'agenda où part le rendez-vous, donc de tout ce
  // qui suit. Caché dans un déroulé en bas, il se laisserait oublier — et sa
  // valeur par défaut déciderait à la place de la personne.
  const choixMetier = metiers ? `
      <div class="ev-ligne">
        <span class="ev-ico" aria-hidden="true">🗂</span>
        <div class="ev-champ">
          <div class="seg ev-metiers" role="group" aria-label="Agenda">
            ${metiers.map(([k, l], i) => `<button type="button" data-metier="${esc(k)}"
              class="${i === 0 ? 'active' : ''}">${esc(l)}</button>`).join('')}
          </div>
        </div>
      </div>` : '';

  // ⚠ LA LISTE DES AGENDAS EST EN TÊTE AUSSI, pour la même raison que le
  // métier : elle décide où part le rendez-vous, donc qui le recevra.
  // ⚠ DES BOUTONS, PAS UNE LISTE DÉROULANTE (28/10/2026, Élodie : « je ne veux
  // pas de liste déroulante pour "dans l'agenda de", je veux des éléments que
  // l'on peut sélectionner »). Toutes les personnes se voient d'un coup, comme
  // les boutons au-dessus de la grille de l'Agenda. La valeur choisie vit dans
  // un champ caché du même nom : le reste du formulaire la lit comme avant.
  const choixAgenda = agendas?.length ? `
      <div class="ev-ligne">
        <span class="ev-ico" aria-hidden="true">📅</span>
        <div class="ev-champ">
          <span class="ev-agenda-lib">Dans l’agenda de</span>
          <input type="hidden" name="pour" value="${esc(agenda || agendas[0][0])}">
          <div class="ev-agendas" role="group" aria-label="Agenda">${agendas.map(([k, l]) =>
            `<button type="button" class="ev-agenda-b${k === (agenda || agendas[0][0]) ? ' on' : ''}"
              data-pour="${esc(k)}" aria-pressed="${k === (agenda || agendas[0][0])}">${esc(l)}</button>`).join('')}</div>
        </div>
      </div>` : '';

  // ⚠ LA SEMAINE N'APPARAÎT QUE QUAND ON CHOISIT UN AGENDA, c'est-à-dire pour
  // la direction (28/10/2026, Élodie : « pour caler un rendez-vous dans
  // l'agenda de quelqu'un d'autre je voudrais que ce soit plus ergonomique et
  // avoir une vue d'ensemble sur le calendrier de la personne »). Choisie entre
  // trois maquettes : le formulaire à gauche, la semaine à droite ; un clic
  // sur un créneau libre remplit la date et l'heure. Pour les autres, rien ne
  // change — ils posent dans leur propre agenda, qu'ils ont déjà sous les yeux.
  const avecSemaine = !!agendas?.length;

  const corps = `${avecSemaine ? '<div class="ev-deux">' : ''}
    <div class="ev">
      <input class="ev-titre" name="titre" required placeholder="Ajouter un titre"
             aria-label="Titre du rendez-vous">
      ${choixMetier}
      ${choixAgenda}

      <div class="ev-ligne">
        <span class="ev-ico" aria-hidden="true">🕐</span>
        <div class="ev-champ">
          <div class="ev-horaire">
            <input name="date" type="date" required value="${esc(jour)}" aria-label="Date">
            <input name="heure" type="time" value="09:00" aria-label="Heure de début">
            <span class="ev-tiret" aria-hidden="true">–</span>
            <select name="duree" aria-label="Heure de fin">${optionsFin(jour, '09:00')}</select>
          </div>
          <label class="ev-jour"><input type="checkbox" name="journee"> Journée entière</label>
        </div>
      </div>

      <div class="ev-ligne">
        <span class="ev-ico" aria-hidden="true">👥</span>
        <div class="ev-champ">
          <div class="ev-puces" id="ev-invites"></div>
          <input class="ev-nu" id="ev-invite" type="email" placeholder="Ajouter des invités"
                 aria-label="Adresse d’un invité">
          <p class="ev-note" id="ev-note-invites" hidden>
            Ils recevront une invitation par mail au nom de ${esc(structure)}.</p>
        </div>
      </div>

      <div class="ev-ligne">
        <span class="ev-ico" aria-hidden="true">📍</span>
        <div class="ev-champ">
          <input class="ev-nu" name="lieu" placeholder="Ajouter un lieu" aria-label="Lieu"></div>
      </div>

      <div class="ev-ligne">
        <span class="ev-ico" aria-hidden="true">☰</span>
        <div class="ev-champ">
          <textarea class="ev-nu" name="description" rows="2"
                    placeholder="Ajouter une description" aria-label="Description"></textarea></div>
      </div>

      ${avis ? `<p class="ev-avis">${avis}</p>` : ''}
      <p class="ev-pied">${pied}</p>

      <div class="ev-actions">
        <span class="muted small" id="ev-etat"></span>
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button type="button" class="btn primary" id="ev-ok">Enregistrer</button>
      </div>
    </div>${avecSemaine ? `
    <aside class="ev-semaine" id="ev-semaine" aria-label="Agenda de la personne"></aside>
    </div>` : ''}`;

  openModal('Nouveau rendez-vous', corps, { wide: avecSemaine, onOpen: (m) => {
    const q = (s) => m.querySelector(s);
    const champ = (n) => m.querySelector(`[name="${n}"]`);

    // ── la semaine de la personne ──────────────────────────────────────────
    // ⚠ L'ÉTAT DE LA LECTURE VIT ICI, PAS DANS LE FORMULAIRE : changer de
    // personne ou de semaine relit Google ; changer l'heure ou la durée ne fait
    // que redessiner — ce qui est pris ne dépend pas de ce qu'on cherche.
    const cal = { semaine: lundiDe(jour || aujourdhuiParis()), occupes: null, erreur: null, lu: 0 };
    const JOURS = 6;
    const NOMS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    const dureeVoulue = () => (champ('journee')?.checked ? 60 : Number(champ('duree')?.value) || 60);

    const dessineSemaine = () => {
      const hote = q('#ev-semaine');
      if (!hote) return;
      const qui = m.querySelector('.ev-agenda-b.on')?.textContent.trim() || '';
      const jours = Array.from({ length: JOURS }, (_, i) => decale(cal.semaine, i));
      const auj = aujourdhuiParis();
      const m2 = (j) => new Date(`${j}T12:00:00Z`)
        .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
      const tete = `
        <div class="ev-sem-tete">
          <b>${champ('pour')?.value === 'commun' ? 'Agenda commun' : `Agenda de ${esc(qui)}`}</b>
          <div class="rgp-cal-nav">
            <button type="button" class="btn ghost sm" data-sem="-7"
              ${cal.semaine <= lundiDe(auj) ? 'disabled' : ''} aria-label="Semaine précédente">‹</button>
            <span>${esc(m2(jours[0]))} → ${esc(m2(jours[JOURS - 1]))}</span>
            <button type="button" class="btn ghost sm" data-sem="7" aria-label="Semaine suivante">›</button>
          </div>
        </div>`;
      if (cal.erreur) {
        hote.innerHTML = `${tete}<p class="rgp-cal-vide">L’agenda n’a pas pu être lu — ${esc(cal.erreur)}.</p>`;
      } else if (!cal.occupes) {
        hote.innerHTML = `${tete}<p class="rgp-cal-vide">Lecture de l’agenda…</p>`;
      } else {
        const choisi = `${champ('date').value} ${champ('heure').value}`;
        const colonnes = jours.map((j, i) => {
          const occ = occupationDuJour(cal.occupes, j);
          const passe = j < auj;
          const libres = passe ? [] : placesLibres(occ, {
            duree: dureeVoulue(), avant: j === auj ? maintenantParis() : null,
          });
          return `
            <div class="rgp-jour ${passe ? 'est-passe' : ''}${j === champ('date').value ? ' est-choisi' : ''}">
              <div class="rgp-jour-tete"><b>${esc(NOMS[i])}</b>
                <span>${esc(String(Number(j.slice(8, 10))))}/${esc(j.slice(5, 7))}</span></div>
              ${occ.length ? `<ul class="rgp-occupe">${occ.map(o => `
                <li title="${esc(o.titre)}">${o.journee ? 'journée' : esc(hhmm(o.debut))} · ${esc(o.titre)}</li>`).join('')}</ul>` : ''}
              ${passe ? '<p class="rgp-jour-rien">passé</p>'
                : libres.length ? `<div class="rgp-libres">${libres.map(t => `
                    <button type="button" class="rgp-creneau ${choisi === `${j} ${hhmm(t)}` ? 'on' : ''}"
                      data-cr-jour="${j}" data-cr-heure="${esc(hhmm(t))}">${esc(hhmm(t))}</button>`).join('')}</div>`
                : '<p class="rgp-jour-rien">complet</p>'}
            </div>`;
        }).join('');
        hote.innerHTML = `${tete}<div class="rgp-cal ev-sem-cal">${colonnes}</div>
          <p class="ev-note">Un clic sur une heure libre remplit la date et l’heure du rendez-vous.</p>`;
      }
      hote.querySelectorAll('[data-sem]').forEach(b => b.onclick = () => {
        cal.semaine = decale(cal.semaine, Number(b.dataset.sem));
        chargeSemaine();
      });
      hote.querySelectorAll('[data-cr-jour]').forEach(b => b.onclick = () => {
        champ('journee').checked = false;
        champ('journee').onchange?.();
        champ('date').value = b.dataset.crJour;
        champ('heure').value = b.dataset.crHeure;
        refaitFins();
        dessineSemaine();
      });
    };

    // ⚠ UNE RÉPONSE PÉRIMÉE EST JETÉE : la lecture prend une seconde, et on a
    // pu changer de personne ou de semaine entre-temps. Afficher les créneaux
    // de l'ancienne ferait poser le rendez-vous sur une place prise.
    const chargeSemaine = async () => {
      if (!avecSemaine) return;
      const n = ++cal.lu;
      cal.occupes = null; cal.erreur = null;
      dessineSemaine();
      const r = await lireCreneaux({ activite, du: cal.semaine, au: decale(cal.semaine, JOURS - 1),
        pour: champ('pour')?.value || null });
      if (n !== cal.lu) return;
      if (r.ok) cal.occupes = r.occupes; else { cal.occupes = []; cal.erreur = r.motif; }
      dessineSemaine();
    };

    // ── le métier ──────────────────────────────────────────────────────────
    // Le premier proposé est le choix courant, mais il n'est pas un défaut
    // silencieux : le segment le montre coché, à l'écran, avant d'enregistrer.
    let metier = metiers ? metiers[0][0] : null;
    if (metiers) {
      m.querySelectorAll('[data-metier]').forEach(b => b.onclick = () => {
        metier = b.dataset.metier;
        m.querySelectorAll('[data-metier]').forEach(x => x.classList.toggle('active', x === b));
      });
    }

    // ── les invités ────────────────────────────────────────────────────────
    // ⚠ UNE ADRESSE MAL FORMÉE FAIT REFUSER TOUT L'ÉVÉNEMENT par Google : on la
    // retient ici plutôt que de perdre le rendez-vous entier. Le serveur
    // revérifie — l'écran est un garde-fou, pas une garantie.
    const valide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

    const dessineInvites = () => {
      q('#ev-invites').innerHTML = etat.invites.map((e, i) =>
        `<span class="ev-puce">${esc(e)}<button type="button" data-oter="${i}"
           aria-label="Retirer ${esc(e)}">×</button></span>`).join('');
      q('#ev-note-invites').hidden = !etat.invites.length;
      q('#ev-invites').querySelectorAll('[data-oter]').forEach(b => b.onclick = () => {
        etat.invites.splice(Number(b.dataset.oter), 1);
        dessineInvites();
      });
    };

    const ajouteInvite = () => {
      const i = q('#ev-invite');
      const v = i.value.trim().toLowerCase();
      if (!v) return true;
      if (!valide(v)) { toast(`« ${v} » n’est pas une adresse email`, 'warn'); return false; }
      if (etat.invites.includes(v)) { i.value = ''; return true; }
      if (etat.invites.length >= 20) { toast('Vingt invités au maximum', 'warn'); return false; }
      etat.invites.push(v); i.value = ''; dessineInvites();
      return true;
    };

    // Entrée, virgule et point-virgule valident l'adresse, comme chez Google.
    // ⚠ `preventDefault` sur Entrée : sans lui, la touche enverrait le
    // formulaire au lieu d'ajouter l'invité qu'on vient de taper.
    q('#ev-invite').onkeydown = (e) => {
      if (['Enter', ',', ';'].includes(e.key)) { e.preventDefault(); ajouteInvite(); }
    };
    // Quitter le champ retient aussi ce qui y est resté : on ne perd pas une
    // adresse tapée puis abandonnée pour aller cliquer sur « Enregistrer ».
    q('#ev-invite').onblur = () => ajouteInvite();

    // ── l'horaire ──────────────────────────────────────────────────────────
    const refaitFins = () => {
      const garde = champ('duree').value;
      champ('duree').innerHTML = optionsFin(champ('date').value, champ('heure').value);
      champ('duree').value = garde;
    };
    champ('heure').onchange = () => { refaitFins(); dessineSemaine(); };
    // Une date hors de la semaine affichée fait aller la chercher.
    champ('date').onchange = () => {
      refaitFins();
      const d = champ('date').value;
      if (avecSemaine && d && lundiDe(d) !== cal.semaine) { cal.semaine = lundiDe(d); chargeSemaine(); }
      else dessineSemaine();
    };
    // La durée change les places assez larges, pas ce qui est pris.
    champ('duree').onchange = () => dessineSemaine();
    m.querySelectorAll('[data-pour]').forEach(b => b.onclick = () => {
      if (champ('pour').value === b.dataset.pour) return;
      champ('pour').value = b.dataset.pour;
      m.querySelectorAll('[data-pour]').forEach(x => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      chargeSemaine();
    });

    champ('journee').onchange = () => {
      const j = champ('journee').checked;
      m.querySelector('.ev-horaire').classList.toggle('est-journee', j);
      champ('heure').disabled = j;
      champ('duree').disabled = j;
    };

    // ── enregistrer ────────────────────────────────────────────────────────
    q('#ev-ok').onclick = async () => {
      if (!ajouteInvite()) return;
      const titre = champ('titre').value.trim();
      if (!titre) { champ('titre').focus(); toast('Un titre est nécessaire', 'warn'); return; }
      const date = champ('date').value;
      if (!date) { champ('date').focus(); toast('Une date est nécessaire', 'warn'); return; }

      const journee = champ('journee').checked;
      const heure = champ('heure').value || '09:00';
      const duree = Number(champ('duree').value) || 60;
      // ⚠ UNE JOURNÉE ENTIÈRE VA DE MINUIT AU LENDEMAIN MINUIT : côté Google la
      // fin est EXCLUSIVE, donc le même jour donnerait une plage vide — l'erreur
      // rencontrée le 25/09 sur l'heure de fin, pour une autre raison.
      const debut = journee ? `${date}T00:00:00` : `${date}T${heure}:00`;
      const fin = journee ? `${decale(date, 1)}T00:00:00` : finApres(date, heure, duree);

      const champs = { titre, date_debut: debut, date_fin: fin, all_day: journee ? 1 : 0, activite };
      if (metier) champs.metier = metier;
      if (agendas?.length && champ('pour')?.value) champs.pour = champ('pour').value;
      const lieu = champ('lieu').value.trim();
      const desc = champ('description').value.trim();
      if (lieu) champs.lieu = lieu;
      if (desc) champs.description = desc;
      if (etat.invites.length) champs.invites = [...etat.invites];

      const b = q('#ev-ok');
      b.disabled = true;
      q('#ev-etat').textContent = 'Création dans Google Agenda…';
      const r = await creerEvenement(champs);
      b.disabled = false;
      q('#ev-etat').textContent = '';
      if (!r.ok) { toast(`Non créé — ${r.motif}`, 'err'); return; }

      closeModal();
      // ⚠ `releve: false` N'EST PAS UN ÉCHEC : le rendez-vous est dans Google,
      // seule sa relecture immédiate a manqué. Le dire comme une erreur ferait
      // recommencer, donc créer deux fois.
      const n = r.donnees?.invites || 0;
      const avec = n ? ` — ${n} invitation${n > 1 ? 's' : ''} envoyée${n > 1 ? 's' : ''}` : '';
      toast(r.donnees?.releve === false
        ? `Rendez-vous créé dans Google Agenda${avec} — il apparaîtra ici au prochain relevé`
        : `Rendez-vous créé dans Google Agenda${avec}`);
      apres?.();
    };

    chargeSemaine();
    champ('titre').focus();
  } });
}
