// Importer une facture faite ailleurs (02/11/2026)
//
// Demandé par Élodie : « la possibilité d'importer une facture qui n'a pas été
// reliée avec Costructor ». On dépose le PDF d'une facture qui EXISTE DÉJÀ et
// on saisit le peu qu'il faut pour qu'elle compte : son numéro, sa date, son
// HT, son TTC. Elle rejoint alors les autres dans l'écran Factures et dans les
// totaux, avec une pastille « Importée » pour qu'on ne la confonde jamais avec
// une facture faite ici.
//
// ⚠ ELLE GARDE SON NUMÉRO D'ORIGINE, ET LA SUITE DU CRM N'EST PAS ENTAMÉE.
// `importe = true` dit au trigger de ne pas numéroter : lui donner un
// `FA2026-…` de plus ferait deux numéros pour un seul document et prendrait un
// rang à une suite qui doit être continue. Le formulaire refuse d'ailleurs un
// numéro qui RESSEMBLE à cette suite, avant même la base — qui le refuse aussi
// (`rgd_devis_crm_importee_hors_suite`), des fois que l'écriture vienne
// d'ailleurs.
//
// ⚠ LES MONTANTS SONT CEUX DU PAPIER, PAS UN CALCUL. On demande le HT ET le
// TTC plutôt qu'un taux de TVA : une facture venue d'ailleurs peut porter
// plusieurs taux, ou un taux hors de notre liste. La TVA se déduit de l'écart,
// et aucun chiffre n'est inventé.
//
// ⚠ LE PDF PASSE PAR LE MÉCANISME DES DOCUMENTS, pas par un rangement à lui :
// même seau, même chemin `<type>/<uuid>/…` que la zone de dépôt de la fiche —
// c'est ce chemin que lisent les trois policies du stockage. Un second
// rangement aurait ses propres droits à tenir à jour, et ils auraient fini par
// diverger. Le document reçoit la catégorie « Facture » et la facture garde
// son identifiant (`document_id`) pour pouvoir le rouvrir d'un clic.
import { db } from '../data/db.js';
import { scope } from '../data/scope.js';
import { esc, openModal, closeModal, toast, isoDay } from '../ui.js';
import { typeDeFiche } from './rgd-docs-fiche.js';

const MAX_MO = 25;

// Le même motif que la contrainte de la base, à la lettre.
const RESSEMBLE_A_LA_SUITE = /^FA\d{4}-\d{4}$/i;

const nombre = (v) => {
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Qui peut importer : la direction. Franck fait ses factures, il n'en reprend pas. */
export const peutImporterFacture = () => scope.isDirection;

export function ouvrirImportFacture(x, retour = null) {
  const f = x.ligne || {};
  // ⚠ `.plein` NE S'ÉTEND QUE SUR UN `.mail-champ` : la règle commune est
  // `.mf-grille .mail-champ.plein`, donc un `div` ou un `p` qui le porterait
  // resterait dans UNE colonne — le piège est déjà payé une fois dans ce dépôt
  // (la rangée d'adresse de la fiche projet, 209 px pour trois champs). Le mot
  // d'explication et les boutons vivent donc HORS de la grille.
  const m = openModal(`Importer une facture${x.nom ? ' — ' + x.nom : ''}`, `
    <form id="rfi">
      <div class="mf-grille">
      <label class="mail-champ plein">Le fichier de la facture
        <input type="file" name="fichier" accept="application/pdf,image/*" required>
        <small class="muted">Le PDF reçu, ou sa photo. ${MAX_MO} Mo au plus.</small></label>
      <label class="mail-champ">Numéro de la facture
        <input name="numero" required placeholder="Celui qui est écrit dessus" autocomplete="off"></label>
      <label class="mail-champ">Date de la facture
        <input type="date" name="date_devis" value="${esc(isoDay())}" required></label>
      <label class="mail-champ">Montant HT
        <input name="montant_ht" inputmode="decimal" required placeholder="0,00"></label>
      <label class="mail-champ">Montant TTC
        <input name="montant_ttc" inputmode="decimal" required placeholder="0,00"></label>
      <label class="mail-champ plein">Objet <small class="muted">(facultatif)</small>
        <input name="objet" placeholder="Ce que la facture couvre" autocomplete="off"></label>
      <label class="mail-champ">Où elle en est
        <select name="statut">
          <option value="envoye">Envoyée, pas encore réglée</option>
          <option value="signe">Signée / réglée</option>
        </select></label>
      </div>
      <p class="small muted">Elle rejoindra l’écran <b>Factures</b> avec son numéro d’origine
      et une pastille « Importée ». La suite de numéros du CRM n’est pas entamée.</p>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button type="submit" class="btn" id="rfi-ok">Importer</button>
      </div>
    </form>`, { onClose: () => retour?.() });

  const form = m.querySelector('#rfi');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const fichier = d.get('fichier');
    const numero = String(d.get('numero') || '').trim();
    const ht = nombre(d.get('montant_ht'));
    const ttc = nombre(d.get('montant_ttc'));

    if (!fichier || !fichier.size) { toast('Choisissez le fichier de la facture', 'error'); return; }
    if (fichier.size > MAX_MO * 1048576) { toast(`Trop lourd (${MAX_MO} Mo au plus)`, 'error'); return; }
    if (!numero) { toast('Le numéro de la facture est nécessaire', 'error'); return; }
    // ⚠ CE REFUS EST LE MÊME QUE CELUI DE LA BASE, et il arrive plus tôt pour
    // qu'on comprenne : un numéro de la forme FA2026-0007 pourrait entrer en
    // collision avec un numéro que la séquence attribuera des mois plus tard,
    // et c'est une VRAIE émission qui échouerait alors, loin d'ici.
    if (RESSEMBLE_A_LA_SUITE.test(numero)) {
      toast('Ce numéro est de la forme réservée aux factures du CRM (FA2026-0001). Gardez celui qui est écrit sur la facture.', 'error');
      return;
    }
    if (!Number.isFinite(ht) || !Number.isFinite(ttc)) { toast('Montants illisibles', 'error'); return; }
    if (ttc < ht) { toast('Le TTC ne peut pas être inférieur au HT', 'error'); return; }
    if (db.t('rgd_devis_crm').some(v => String(v.numero || '').toLowerCase() === numero.toLowerCase())) {
      toast(`La facture ${numero} est déjà dans le CRM`, 'error'); return;
    }

    const bouton = form.querySelector('#rfi-ok');
    bouton.disabled = true; bouton.textContent = 'Import…';
    const type = typeDeFiche(x);
    const chemin = `${type}/${f.id}/${Date.now()}-${String(fichier.name).replace(/[^\w.\-]+/g, '_')}`;
    let doc = null;
    try {
      await db.uploadFile(chemin, fichier);
      doc = await db.insert('documents', {
        entity_type: type, entity_id: f.id, name: fichier.name,
        mime: fichier.type || null, size: fichier.size, storage_path: chemin,
        category: 'Facture', created_by: scope.user?.id || null,
      });
      await db.insert('rgd_devis_crm', {
        importe: true,
        numero,
        metier: null,
        objet: String(d.get('objet') || '').trim() || null,
        statut: d.get('statut') || 'envoye',
        date_devis: d.get('date_devis'),
        lignes: [],
        // ⚠ `tva_taux` RESTE VIDE, ET C'EST LE POINT : écrire 10 à côté de
        // montants qui disent autre chose serait un chiffre faux avec l'air
        // d'être vrai. La base l'autorise pour les seules importées.
        tva_taux: null,
        montant_ht: ht, montant_tva: Math.round((ttc - ht) * 100) / 100, montant_ttc: ttc,
        fiche_id: x.genre === 'fiche' ? f.id : null,
        demande_id: x.genre === 'demande' ? f.id : null,
        contact_id: f.contact_id || null,
        organisation_id: f.organisation_id || null,
        owner_id: scope.user?.id || null,
        document_id: doc.id,
      });
      toast(`Facture ${numero} importée`);
      closeModal();
    } catch (err) {
      // ⚠ ON DÉFAIT CE QU'ON A POSÉ : un fichier et une ligne de `documents`
      // sans facture seraient un document qui traîne, que plus rien ne
      // désigne et que personne ne retrouvera pour le retirer.
      if (doc) { try { await db.remove('documents', doc.id); } catch { /* tant pis */ } }
      try { await db.deleteFile(chemin); } catch { /* jamais arrivé là */ }
      bouton.disabled = false; bouton.textContent = 'Importer';
      toast(`Non importée — ${String(err.message || err).slice(0, 140)}`, 'error');
    }
  };
}

/** Ouvrir le PDF d'une facture importée. L'adresse signée se demande AU CLIC : elle expire. */
export async function ouvrirPdfImporte(devis) {
  const doc = devis.document_id && db.byId('documents', devis.document_id);
  if (!doc) { toast('Le fichier de cette facture n’est plus là', 'error'); return; }
  try { window.open(await db.fileUrl(doc.storage_path), '_blank', 'noopener'); }
  catch (e) { toast(e.message || 'Fichier introuvable', 'error'); }
}
