// Les documents déposés sur une fiche projet de RGD Renova — d'abord la fiche
// projet et le PV de réception signés, qu'on imprime depuis le CRM, qu'on fait
// signer sur place et qu'on scanne au retour (14/10/2026, demandé par Élodie :
// « je voudrais rajouter une zone de dépôt sur les fiches projet pour mettre
// les fiches projet et PV de réception »).
//
// ⚠ CE N'EST PAS `documentsSection()` DE `documents.js`, ET CE N'EST PAS UN
// OUBLI : ce module supprime derrière le `confirm()` de `ui.js`, qui appelle
// `closeModal(true)` et REMPLACE la fenêtre courante — la fiche entière
// disparaîtrait au moment où l'on demande « êtes-vous sûr ? ». Le piège est
// payé onze fois dans ce dépôt, et la fiche d'affaire BTP l'évite déjà pour la
// même raison. L'écriture, elle, est la même à la lettre : un fichier dans le
// seau, une ligne dans `documents`.
//
// ⚠ LE CHEMIN DU FICHIER EST LE CONTRAT AVEC LA BASE : les trois policies du
// seau `documents` lisent le type et l'identifiant DANS le chemin
// (`split_part(name, '/', 1)` et `split_part(name, '/', 2)`) puis appellent
// `can_document`. Un chemin qui ne commence pas par `<type>/<uuid>/` serait
// refusé par le stockage, sans que rien à l'écran ne dise pourquoi.
//
// ⚠ ET LE TYPE N'EST PAS TOUJOURS `rgd_clients` : une fiche ouverte depuis
// « Nouvelle demande » est une ligne de `rgd_demandes`, qui a ses propres
// droits. `typeDeFiche` est la seule traduction — deux lectures du `genre`
// finiraient par ranger les documents d'une demande sous le type des fiches,
// où la policy ne les retrouverait pas.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, fmtDate, toast, userName, armerCroix } from '../ui.js';

const MAX_MO = 25;

// ⚠ TROIS CATÉGORIES, PAS LES SEIZE DE `DOC_CATEGORIES` : cette liste-là sert
// au patrimoine et au courtage (offre de prêt, bail, état des lieux…) et n'a
// rien à voir avec un chantier. Un menu de seize entrées pour en choisir deux
// fait hésiter à chaque dépôt.
// ⚠ « Autre » EXISTE pour que rien ne reste sans case : une photo de fin de
// chantier ou une attestation n'a pas à être refusée parce qu'elle n'est ni
// l'une ni l'autre.
export const CATEGORIES_FICHE = ['Fiche projet', 'PV de réception', 'Autre'];

export const typeDeFiche = (x) => (x?.genre === 'demande' ? 'rgd_demandes' : 'rgd_clients');

const taille = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

const vignette = (mime = '', nom = '') =>
  (/pdf/.test(mime) || /\.pdf$/i.test(nom) ? '📄'
    : /^image\//.test(mime) ? '🖼'
      : /word|document/.test(mime) || /\.docx?$/i.test(nom) ? '📝' : '📎');

export const documentsDeLaFiche = (type, id) => db.t('documents')
  .filter(d => d.entity_type === type && d.entity_id === id)
  .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

export function blocDocumentsFiche(type, id) {
  const docs = documentsDeLaFiche(type, id);
  return `
    <section class="rgdf-bloc rgdf-docs-fiche" data-docs="${esc(type)}:${esc(id)}">
      <h3>Documents${docs.length ? ` <span class="rgdf-compte">${docs.length}</span>` : ''}</h3>
      <!-- La zone ENTIÈRE est la cible du dépôt, pas seulement son intitulé :
           la classe de survol porte sur elle, et un écouteur pose sur le seul
           bandeau laisserait le glisser sans effet alors que le clic marcherait
           — defaut deja paye sur la fiche projet du cabinet BTP. -->
      <label class="rgdf-zone">
        <input type="file" multiple hidden class="rgdf-fichier">
        <span class="rgdf-zone-t">Glissez un fichier ici, ou cliquez</span>
        <span class="rgdf-zone-s">Fiche projet, PV de réception signé… ${MAX_MO} Mo par fichier</span>
      </label>
      <div class="rgdf-docs-cat">
        <label>Ranger sous
          <select class="rgdf-cat">
            ${CATEGORIES_FICHE.map(c => `<option>${esc(c)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="rgdf-docs-liste">
        ${docs.length ? docs.map(d => `
          <div class="rgdf-doc" data-doc="${esc(d.id)}">
            <span class="rgdf-doc-ico">${vignette(d.mime, d.name)}</span>
            <div class="grow">
              <button type="button" class="rgdf-doc-nom">${esc(d.name)}</button>
              <div class="rgdf-doc-meta">${d.category ? `${esc(d.category)} · ` : ''}${taille(d.size || 0)}
                · ${esc(fmtDate(d.created_at))} · ${esc(userName(d.created_by))}</div>
            </div>
            <button type="button" class="icon-btn rgdf-doc-suppr" title="Retirer ce document">✕</button>
          </div>`).join('')
    : '<p class="rgdf-source">Aucun document déposé pour l’instant.</p>'}
      </div>
    </section>`;
}

export function lierDocumentsFiche(racine, type, id, redessiner) {
  const sec = racine.querySelector(`[data-docs="${type}:${id}"]`);
  if (!sec) return;

  const deposer = async (fichiers) => {
    const liste = [...fichiers];
    if (!liste.length) return;
    const categorie = sec.querySelector('.rgdf-cat')?.value || null;
    let poses = 0;
    for (const f of liste) {
      if (f.size > MAX_MO * 1048576) {
        toast(`${f.name} : trop lourd (${MAX_MO} Mo au plus)`, 'warn');
        continue;
      }
      try {
        // ⚠ LE NOM EST ASSAINI MAIS L'ORIGINAL EST GARDÉ EN BASE : le chemin ne
        // supporte ni accent ni espace, et c'est pourtant le nom d'origine
        // qu'on veut relire dans la liste.
        const chemin = `${type}/${id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
        await db.uploadFile(chemin, f);
        await db.insert('documents', {
          entity_type: type, entity_id: id, name: f.name,
          mime: f.type || null, size: f.size, storage_path: chemin,
          category: categorie, created_by: scope.user?.id || null,
        });
        poses++;
      } catch (e) {
        toast(`${f.name} : ${e.message || 'dépôt impossible'}`, 'error');
      }
    }
    // ⚠ ON REDESSINE MÊME SI UN SEUL EST PASSÉ : la liste doit dire ce qui est
    // vraiment déposé, pas ce qu'on a tenté.
    if (poses) {
      toast(poses > 1 ? `${poses} documents déposés` : 'Document déposé');
      redessiner?.();
    }
  };

  const champ = sec.querySelector('.rgdf-fichier');
  if (champ) champ.onchange = () => deposer(champ.files);

  const zone = sec.querySelector('.rgdf-zone');
  if (zone) {
    // ⚠ `dragover` DOIT ÊTRE ANNULÉ POUR QUE `drop` EXISTE : sans
    // `preventDefault`, le navigateur ouvre le fichier dans l'onglet — et la
    // fiche, avec tout ce qu'on était en train d'y écrire, est perdue.
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('survol'); };
    zone.ondragleave = () => zone.classList.remove('survol');
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove('survol');
      deposer(e.dataTransfer?.files || []);
    };
  }

  sec.querySelectorAll('.rgdf-doc').forEach((ligne) => {
    const d = db.byId('documents', ligne.dataset.doc);
    if (!d) return;

    // ⚠ UNE ADRESSE SIGNÉE SE DEMANDE AU CLIC, JAMAIS D'AVANCE : elle expire,
    // donc une adresse posée au rendu serait morte quand on clique dessus.
    const ouvrir = ligne.querySelector('.rgdf-doc-nom');
    if (ouvrir) ouvrir.onclick = async () => {
      try { window.open(await db.fileUrl(d.storage_path), '_blank', 'noopener'); }
      catch (e) { toast(e.message || 'Document introuvable', 'error'); }
    };

    // ⚠ DEUX CLICS SUR LE MÊME BOUTON, JAMAIS LE `confirm()` DE `ui.js` : il
    // remplacerait la fiche par sa propre fenêtre.
    const suppr = ligne.querySelector('.rgdf-doc-suppr');
    if (suppr) armerCroix(suppr, async () => {
      // Le fichier d'abord : la ligne supprimée sans son fichier laisserait un
      // orphelin dans le seau, que plus rien ne désigne.
      try { await db.deleteFile(d.storage_path); } catch { /* déjà absent */ }
      await db.remove('documents', d.id);
      toast('Document retiré');
      redessiner?.();
    }, { repos: '✕', arme: 'Confirmer' });
  });
}
