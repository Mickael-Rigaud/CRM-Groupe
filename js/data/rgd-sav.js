// Les dossiers SAV de RGD Renova (13/10/2026, Élodie : « dans chantiers
// terminés je voudrais rajouter un statut SAV, ces contacts et fiches projets
// transférés dans un nouvel onglet SAV »).
//
// Une ligne de `rgd_sav` par dossier : une personne peut en avoir plusieurs
// dans le temps. Le dossier pend de la FICHE et, si on le sait, du CHANTIER
// concerné — c'est sa fin de travaux qui dit la garantie.
//
// ⚠ LE STATUT DE LA FICHE SUIT LES DOSSIERS, ET C'EST ICI QU'IL CHANGE, PAS À
// L'ÉCRAN : ouvrir un dossier range la fiche en « SAV », résoudre le dernier
// dossier ouvert la rend à « Chantier terminé » (choix d'Élodie le même jour).
// Deux écrans qui décideraient chacun de leur côté finiraient par laisser une
// fiche en SAV sans dossier ouvert, ou l'inverse.
import { db } from './db.js';
import { scope } from './scope.js';
import { ecrireStatut } from './rgd-etapes.js';

export const STATUTS_SAV = [
  { key: 'ouvert',       label: 'Ouvert',                 ton: 'amber' },
  { key: 'diagnostic',   label: 'Diagnostic',             ton: 'accent' },
  { key: 'intervention', label: 'Intervention planifiée', ton: 'accent' },
  { key: 'resolu',       label: 'Résolu',                 ton: 'green' },
];
export const statutSav = (k) => STATUTS_SAV.find(s => s.key === k) || STATUTS_SAV[0];
export const PRISE_EN_CHARGE = { rgd: 'RGD Renova', sous_traitant: 'Le sous-traitant', client: 'Le client' };

// ⚠ LA LISTE BLANCHE, comme ailleurs : un nom inconnu ferait échouer la requête
// entière — ou pire, écrirait une colonne qu'on ne voulait pas toucher.
const CHAMPS = ['fiche_id', 'contact_id', 'organisation_id', 'chantier_id', 'owner_id',
  'ouvert_le', 'objet', 'urgence', 'statut', 'intervenant', 'sous_traitant_id',
  'intervention_le', 'intervention_heure', 'prise_en_charge', 'cout', 'resolu_le', 'suivi'];
const filtrer = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => CHAMPS.includes(k)));

const jourLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Les dossiers d'une fiche, le plus récent d'abord. */
export function dossiersDe(f) {
  return scope.rgd('rgd_sav')
    .filter(s => (f.id && s.fiche_id === f.id)
      || (!s.fiche_id && ((f.contact_id && s.contact_id === f.contact_id)
        || (f.organisation_id && s.organisation_id === f.organisation_id))))
    .sort((a, b) => String(b.ouvert_le || '').localeCompare(String(a.ouvert_le || '')));
}
export const dossierOuvert = (f) => dossiersDe(f).find(s => s.statut !== 'resolu') || null;

// La fin des travaux d'un chantier : même ordre que `finDeChantierDe` —
// `date_passage_termine` en dernier, c'est le jour du marquage, pas de la fin.
export const finDuChantier = (c) =>
  String(c?.work_end_at || c?.date_fin_prevue || c?.date_passage_termine || '').slice(0, 10);

/**
 * La garantie qui couvre un SAV, calculée et jamais stockée : elle se
 * périmerait le jour où l'on corrige une date de fin de chantier.
 *
 * ⚠ C'EST UNE PÉRIODE, PAS UN VERDICT. La biennale ne couvre que les
 * équipements dissociables, la décennale que ce qui compromet la solidité ou
 * rend l'ouvrage impropre à sa destination : la nature du désordre décide, et
 * l'écran le dit au lieu d'affirmer une prise en charge.
 */
export function garantie(dateFin, ouvertLe = jourLocal()) {
  if (!dateFin) return { cle: 'inconnue', label: 'Fin des travaux inconnue', ton: 'muted' };
  const fin = new Date(dateFin + 'T12:00:00');
  const ans = (n) => { const d = new Date(fin); d.setFullYear(d.getFullYear() + n); return jourLocal(d); };
  const dite = (s) => s.split('-').reverse().join('/');
  if (ouvertLe <= ans(1)) return { cle: 'parfait', ton: 'green',
    label: 'Parfait achèvement', detail: `jusqu’au ${dite(ans(1))} — tous les désordres signalés` };
  if (ouvertLe <= ans(2)) return { cle: 'biennale', ton: 'accent',
    label: 'Biennale ou décennale', detail: `biennale jusqu’au ${dite(ans(2))} pour les équipements, décennale pour le gros œuvre` };
  if (ouvertLe <= ans(10)) return { cle: 'decennale', ton: 'amber',
    label: 'Décennale seulement', detail: `jusqu’au ${dite(ans(10))} — solidité ou usage de l’ouvrage compromis` };
  return { cle: 'hors', ton: 'red', label: 'Hors garanties légales', detail: `décennale échue le ${dite(ans(10))}` };
}

const entree = (texte) => ({ le: new Date().toISOString(), par: scope.user?.id || null, texte });

/** Ouvrir un dossier : la fiche passe en « SAV ». */
export async function ouvrirSav(fiche, champs) {
  try {
    const ligne = await db.insert('rgd_sav', filtrer({
      ...champs,
      fiche_id: fiche.id, contact_id: fiche.contact_id || null,
      organisation_id: fiche.organisation_id || null,
      // Le dossier prend le propriétaire de la fiche : le chargé d'affaires
      // suit les SAV de ses clients. Une fiche sans propriétaire est à la
      // direction, et le dossier aussi.
      owner_id: fiche.owner_id || null,
      statut: 'ouvert',
      suivi: [entree('Dossier ouvert')],
    }));
    if (fiche.statut_suivi !== 'sav') await ecrireStatut({ uuid: fiche.id, cible: 'client', statut: 'sav' });
    return { ok: true, ligne };
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 120) }; }
}

/**
 * Modifier un dossier. Un changement de statut s'inscrit au fil tout seul ;
 * le dernier dossier résolu rend la fiche à « Chantier terminé ».
 */
export async function majSav(sav, champs, commentaire = '') {
  try {
    const patch = filtrer(champs);
    const suivi = [...(sav.suivi || [])];
    if (patch.statut && patch.statut !== sav.statut) {
      suivi.push(entree(`Statut : ${statutSav(sav.statut).label} → ${statutSav(patch.statut).label}`));
      if (patch.statut === 'resolu' && !patch.resolu_le) patch.resolu_le = jourLocal();
      if (patch.statut !== 'resolu') patch.resolu_le = null;
    }
    if (String(commentaire || '').trim()) suivi.push(entree(String(commentaire).trim()));
    patch.suivi = suivi;
    const ligne = await db.update('rgd_sav', sav.id, patch);

    // ⚠ LA FICHE NE QUITTE « SAV » QUE QUAND PLUS RIEN N'Y EST OUVERT : deux
    // dossiers en cours, et en résoudre un ne doit pas la renvoyer ailleurs.
    const fiche = sav.fiche_id ? db.byId('rgd_clients', sav.fiche_id) : null;
    if (fiche) {
      const encore = dossiersDe(fiche).some(s => s.statut !== 'resolu');
      if (!encore && fiche.statut_suivi === 'sav') {
        await ecrireStatut({ uuid: fiche.id, cible: 'client', statut: 'chantier_termine' });
      } else if (encore && fiche.statut_suivi !== 'sav') {
        await ecrireStatut({ uuid: fiche.id, cible: 'client', statut: 'sav' });
      }
    }
    return { ok: true, ligne };
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 120) }; }
}

/**
 * Sortir une fiche du SAV vers N'IMPORTE QUEL statut de Clients & prospects
 * (13/10/2026, Élodie : « retirer un projet du SAV pour le remettre dans
 * n'importe quel statut »).
 *
 * ⚠ SES DOSSIERS ENCORE OUVERTS SONT CLOS, avec une ligne au suivi qui dit
 * pourquoi. Sinon la règle de `majSav` — un dossier ouvert range la fiche en
 * « SAV » — la ramènerait ici à la prochaine modification d'un dossier. Ils ne
 * sont PAS supprimés : l'historique reste, et le projet compte toujours comme
 * ayant eu un SAV. Un dossier ouvert par erreur se supprime depuis sa fenêtre.
 */
export async function retirerDuSav(fiche, statut, libelle = statut) {
  try {
    for (const s of dossiersDe(fiche).filter(s => s.statut !== 'resolu')) {
      await db.update('rgd_sav', s.id, {
        statut: 'resolu', resolu_le: jourLocal(),
        suivi: [...(s.suivi || []), entree(`Fiche sortie du SAV, remise en « ${libelle} » — dossier clos`)],
      });
    }
    const r = await ecrireStatut({ uuid: fiche.id, cible: 'client', statut });
    return r.ok ? { ok: true } : r;
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 120) }; }
}

/** Supprimer un dossier ouvert par erreur. Ses pièces partent avec lui. */
export async function supprimerSav(sav) {
  try {
    for (const d of db.t('documents').filter(x => x.entity_type === 'rgd_sav' && x.entity_id === sav.id)) {
      try { await db.deleteFile(d.storage_path); } catch { /* déjà absent */ }
      await db.remove('documents', d.id);
    }
    await db.remove('rgd_sav', sav.id);
    const fiche = sav.fiche_id ? db.byId('rgd_clients', sav.fiche_id) : null;
    if (fiche && fiche.statut_suivi === 'sav' && !dossiersDe(fiche).some(s => s.statut !== 'resolu')) {
      await ecrireStatut({ uuid: fiche.id, cible: 'client', statut: 'chantier_termine' });
    }
    return { ok: true };
  } catch (e) { return { ok: false, motif: String(e.message || e).slice(0, 120) }; }
}

/** Déposer des photos ou pièces : un fichier dans le seau, une ligne dans `documents`. */
export async function deposerPiecesSav(savId, fichiers) {
  let n = 0;
  for (const f of fichiers) {
    const chemin = `rgd_sav/${savId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
    await db.uploadFile(chemin, f);
    await db.insert('documents', {
      entity_type: 'rgd_sav', entity_id: savId, name: f.name, mime: f.type || null,
      size: f.size, storage_path: chemin, category: 'Photo', created_by: scope.user?.id || null,
    });
    n++;
  }
  return n;
}
export const piecesSav = (savId) => db.t('documents')
  .filter(d => d.entity_type === 'rgd_sav' && d.entity_id === savId);
