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
//      tableau de bord le range aujourd'hui dans `app_settings`, ce qui le
//      rend lisible par toute requête qui lit cette table.
//   3. La connexion Google Agenda — UN PARCOURS OAuth, qui exige un serveur
//      capable de recevoir la redirection. Il restera côté worker jusqu'à ce
//      qu'une Edge Function le reprenne.
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
import { esc, eur, toast } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { db } from '../data/db.js';

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
      const lire = (cle) => scope.rgd('rgd_reglages').find(r => r.cle === cle)?.valeur ?? null;
      const ht = lire('manual_ca_ht_exercice');
      const ttc = lire('manual_ca_ttc_exercice');
      const clients = lire('manual_clients_actifs');

      const champ = (id, label, valeur) => `
        <label class="reg-champ">
          <span>${esc(label)}</span>
          <input type="text" id="${id}" value="${valeur != null ? esc(valeur) : ''}"
                 inputmode="decimal" placeholder="laisser vide pour ne pas changer"
                 ${state.ecriture ? '' : 'disabled'}>
        </label>`;

      const corps = `
        <div class="alert rgd-source">
          <b>i</b>
          <div>Ces corrections sont <b>enregistrées ici</b>, et c&rsquo;est le CRM qui en
          est la source depuis le 22/09/2026 — elles ne sont plus recopiées depuis le
          tableau de bord. Elles l&rsquo;emportent sur le calcul automatique du chiffre
          d&rsquo;affaires, parce que la reprise Costructor est incomplète et que le
          calcul sous-estime.</div>
        </div>

        <section class="card">
          <div class="card-head"><h2>Chiffre d’affaires de l’exercice</h2>
            <span class="muted small">1<sup>er</sup> octobre → 30 septembre</span></div>

          ${state.ecriture ? '' : `<p class="small muted">
            Lecture seule : aucun compte RGD Renova n’est associé à votre adresse,
            ou vous êtes en mode démonstration.</p>`}

          <div class="reg-grille">
            ${champ('reg-ht', 'CA HT saisi (€)', ht)}
            ${champ('reg-ttc', 'CA TTC saisi (€)', ttc)}
          </div>

          <p class="small muted"><b>Saisir 0 n’écrit pas « zéro euro »</b> : la correction
          est effacée et le CRM réaffiche le calcul à partir des factures. C’est ce
          qu’il faudra faire le jour où la reprise Costructor sera complète.</p>

          ${state.ecriture ? `<div class="toolbar">
            <button type="button" class="btn primary" id="reg-ok">Enregistrer</button>
            <span class="muted small" id="reg-etat"></span>
          </div>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><h2>Ce qui n’est pas réglable ici</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Réglage</th><th>Valeur</th><th>Pourquoi</th></tr></thead>
            <tbody>
              <tr>
                <td><b>Clients actifs déclarés</b></td>
                <td>${clients != null ? esc(clients) : '<span class="muted">—</span>'}</td>
                <td class="muted">Le tableau de bord n’expose pas de route pour l’écrire —
                    il se change dans l’<a href="#/rgd/app">application RGD</a>.</td>
              </tr>
              <tr>
                <td><b>Clé d’API Costructor</b></td>
                <td class="muted">masquée</td>
                <td class="muted">C’est un <b>secret</b>. Sa place est dans les secrets de la
                    plateforme, pas dans un écran ni dans une table que toute requête peut lire.</td>
              </tr>
              <tr>
                <td><b>Connexion Google Agenda</b></td>
                <td class="muted">active</td>
                <td class="muted">Elle passe par un parcours d’autorisation Google qui exige
                    un serveur : elle reste dans l’application RGD jusqu’à sa reprise.</td>
              </tr>
            </tbody>
          </table></div>
        </section>`;

      root.innerHTML = cadre('#/rgd/reglages', 'Réglages', corps);

      const bouton = root.querySelector('#reg-ok');
      if (bouton) bouton.onclick = async () => {
        const vHt = root.querySelector('#reg-ht').value.trim();
        const vTtc = root.querySelector('#reg-ttc').value.trim();
        // Un champ laissé vide n'est pas envoyé : vide veut dire « je n'y
        // touche pas », alors que 0 veut dire « efface ». Les confondre
        // effacerait une valeur qu'on n'a pas voulu toucher.
        const corpsMaj = {};
        if (vHt !== '') corpsMaj.ht = nombreDe(vHt);
        if (vTtc !== '') corpsMaj.ttc = nombreDe(vTtc);
        if (!Object.keys(corpsMaj).length) { toast('Rien à enregistrer', 'err'); return; }
        if (Object.values(corpsMaj).some(v => v === null)) {
          toast('Un des montants n’est pas un nombre', 'err'); return;
        }

        bouton.disabled = true;
        root.querySelector('#reg-etat').textContent = 'Enregistrement…';

        // 0 EFFACE la correction : on écrit `null`, pas « 0 ». Écrire la chaîne
        // « 0 » ferait afficher un chiffre d'affaires de zéro euro au lieu de
        // rendre la main au calcul — l'écran promet l'inverse trois lignes
        // plus haut.
        const poser = async (cle, val) => {
          const valeur = val === 0 ? null : String(val);
          const ligne = scope.rgd('rgd_reglages').find(x => x.cle === cle);
          // La ligne peut ne pas exister : une correction jamais saisie n'a
          // jamais été relevée. On la crée alors, au lieu d'échouer sur une
          // mise à jour sans cible.
          if (ligne) {
            const maj = await db.update('rgd_reglages', cle, { valeur });
            ligne.valeur = maj?.valeur ?? valeur;
          } else {
            scope.rgd('rgd_reglages').push(await db.insert('rgd_reglages', { cle, valeur }));
          }
        };

        try {
          if (corpsMaj.ht !== undefined) await poser('manual_ca_ht_exercice', corpsMaj.ht);
          if (corpsMaj.ttc !== undefined) await poser('manual_ca_ttc_exercice', corpsMaj.ttc);
        } catch (e) {
          bouton.disabled = false;
          root.querySelector('#reg-etat').textContent = '';
          toast(`Non enregistré — ${String(e.message).slice(0, 120)}`, 'err');
          return;
        }
        bouton.disabled = false;
        root.querySelector('#reg-etat').textContent = '';
        toast('Enregistré');
        draw();
      };
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
