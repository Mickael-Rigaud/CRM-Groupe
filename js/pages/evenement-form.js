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
import { creerEvenement } from '../data/evenements.js';

// ---------------------------------------------------------------- l'heure
// ⚠ CES DEUX FONCTIONS SONT LA CORRECTION D'UN DÉFAUT VÉCU, pas des utilitaires
// de confort (25/09/2026, signalé par Mickael : « Google Agenda : The specified
// time range is empty »).
//
// ⚠ NE JAMAIS CALCULER UNE FIN AVEC `new Date(...).toISOString()`. Une chaîne
// sans fuseau — « 2026-09-25T18:00:00 » — est lue par le navigateur comme de
// l'heure LOCALE, puis `toISOString()` la rend en UTC : 18:00 à Paris devenait
// « 17:00 ». Or le serveur envoie cette chaîne à Google **étiquetée
// Europe/Paris**, sans la reconvertir. La fin partait donc une heure AVANT le
// début, deux en été, et Google appelle ça une plage vide.
//
// ⚠ PAS D'ARITHMÉTIQUE SUR UN `Date` NON PLUS : « une heure » sur un agenda
// veut dire 18:00 → 19:00, y compris la nuit du changement d'heure, où soixante
// minutes réelles déplaceraient la pendule de deux heures. On compte en minutes
// de pendule, et on change de jour si l'on passe minuit — `decale` s'en charge,
// lui est ancré à midi UTC et ne dérive pas.
export const decale = (jour, n) =>
  new Date(new Date(jour + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

const p2 = (n) => String(n).padStart(2, '0');

export const finApres = (jour, heure, minutes) => {
  const [h, m] = String(heure || '09:00').split(':').map(Number);
  const total = h * 60 + m + minutes;
  const jours = Math.floor(total / 1440);
  const reste = ((total % 1440) + 1440) % 1440;
  return `${jours ? decale(jour, jours) : jour}T${p2(Math.floor(reste / 60))}:${p2(reste % 60)}:00`;
};

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
 */
export function formulaireEvenement({
  jour, activite = 'rgd', structure = 'RGD Renova', metiers = null,
  pied = 'Créé dans <b>Google Agenda</b>, puis relu aussitôt : il apparaît dans la grille dès la fermeture de cette fenêtre.',
  avis = '', apres = null,
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

  const corps = `
    <div class="ev">
      <input class="ev-titre" name="titre" required placeholder="Ajouter un titre"
             aria-label="Titre du rendez-vous">
      ${choixMetier}

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
    </div>`;

  openModal('Nouveau rendez-vous', corps, { onOpen: (m) => {
    const q = (s) => m.querySelector(s);
    const champ = (n) => m.querySelector(`[name="${n}"]`);

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
    champ('heure').onchange = refaitFins;
    champ('date').onchange = refaitFins;

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

    champ('titre').focus();
  } });
}
