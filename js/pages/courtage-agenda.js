// L'agenda de La Référence Courtage — le même écran que celui de RGD Renova.
//
// 19/11/2026, Élodie : « on peut rajouter l'agenda google sur le crm de la
// référence courtage ? », puis « je veux l'agenda de la référence courtage
// SEULEMENT pour le crm de la référence courtage ».
//
// ⚠ IL N'Y A PAS DEUX ÉCRANS, IL Y EN A UN, PARAMÉTRÉ. Tout vit dans
// `rgd-agenda.js` — la semaine, la pose d'un rendez-vous, le relevé à la
// demande, les créneaux. Le recopier aurait fabriqué un second agenda qui
// aurait divergé au premier correctif ; ce qui change d'une structure à
// l'autre tient en quatre valeurs, et les voici.
//
// ⚠ LE CLOISONNEMENT TIENT À LA CLÉ `courtage`. Les rendez-vous des deux
// structures vivent dans la MÊME table `agenda_events` ; c'est
// `activity === cle` qui fait qu'un rendez-vous de courtage n'apparaît jamais
// chez RGD, et l'inverse. Le robot qui fabrique des fiches depuis l'agenda
// filtre `activity = 'rgd'` de son côté, et `rendezVousDeLaFiche` aussi
// depuis le même jour.
//
// ⚠ L'AGENDA GOOGLE LU EST `lareferencecourtage@gmail.com`, déclaré dans le
// réglage `courtage_calendar_id` — celui où arrivent déjà les rendez-vous pris
// sur lareferencecourtage.fr. Il est partagé avec `m.rigaud@rgdrenova.fr`,
// l'identité sous laquelle le relevé interroge Google : sans ce partage, la
// fonction `relever-agenda` rendrait l'agenda en échec et la page resterait
// vide sans dire pourquoi.
import { pageAgenda } from './rgd-agenda.js';
import { cadreCourtage, guardCourtage } from './courtage.js';

export const courtageAgendaPage = pageAgenda({
  cle: 'courtage',
  cadre: cadreCourtage,
  guard: guardCourtage,
  hash: '#/courtage/agenda',
  titre: 'La Référence Courtage — Agenda',
  // ⚠ L'AZUR D'ABORD (19/11/2026, Élodie : « mets les rendez-vous de cet agenda
  // en bleu clair »). La palette commune ouvre sur `var(--accent)`, et dans cet
  // espace `--accent` VAUT L'ORANGE de la charte : un agenda à un seul
  // calendrier y sortait donc orange vif. `--lrc-azur` est le bleu clair de La
  // Référence Courtage, celui des pastilles et des liens de l'espace — la
  // barre de gauche le porte plein, le fond à 14 %.
  //
  // Les suivantes servent le jour où plusieurs courtiers auront chacun leur
  // agenda : elles restent distinctes entre elles, et de l'azur.
  teintes: ['var(--lrc-azur)', 'var(--violet)', 'var(--green)', 'var(--amber)', 'var(--sea)'],
});
