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
// La route du worker efface la correction et rend la main au calcul. C'est
// utile le jour où Costructor sera complet, et c'est exactement le genre de
// chose qu'un écran doit dire plutôt que de laisser découvrir.
import { scope } from '../data/scope.js';
import { esc, eur, toast } from '../ui.js';
import { poserEspace } from './espace.js';
import { cadre, guard } from './rgd-espace.js';
import { peutEcrire, majCaManuel } from '../data/rgd-api.js';

const nombreDe = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const rgdReglagesPage = {
  title: () => 'RGD Renova — Réglages',
  render(root) {
    if (guard(root)) return {};
    const coquille = poserEspace(root);
    const state = { ecriture: false };
    peutEcrire().then(ok => { if (ok !== state.ecriture) { state.ecriture = ok; draw(); } });

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
          <div>Ces valeurs vivent dans le <b>tableau de bord RGD</b> et y sont écrites
          directement : ce n&rsquo;est pas une copie locale. Elles l&rsquo;emportent sur le
          calcul automatique du chiffre d&rsquo;affaires, parce que la reprise Costructor
          est incomplète et que le calcul sous-estime.</div>
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
          est effacée et le tableau de bord recalcule à partir des factures. C’est ce
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
        root.querySelector('#reg-etat').textContent = 'Envoi au tableau de bord…';
        const r = await majCaManuel(corpsMaj);
        bouton.disabled = false;

        if (!r.ok) {
          root.querySelector('#reg-etat').textContent = '';
          toast(r.motif === 'pas-de-compte'
            ? 'Aucun compte RGD à votre adresse : rien n’a été changé.'
            : `Non enregistré — ${r.motif}`, 'err');
          return;
        }
        // On avance le reflet local : le relevé confirmera, mais l'écran ne
        // doit pas réafficher l'ancienne valeur entre-temps.
        const poser = (cle, val) => {
          const l = scope.rgd('rgd_reglages').find(x => x.cle === cle);
          if (l) l.valeur = val === 0 ? null : String(val);
        };
        if (corpsMaj.ht !== undefined) poser('manual_ca_ht_exercice', corpsMaj.ht);
        if (corpsMaj.ttc !== undefined) poser('manual_ca_ttc_exercice', corpsMaj.ttc);
        toast('Enregistré dans le tableau de bord RGD');
        draw();
      };
    };

    draw();
    return { refresh: draw, destroy() { coquille.retirer(); } };
  },
};
