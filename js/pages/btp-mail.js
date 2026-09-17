// Un mail du cabinet, mis en page, remis à Outlook classique.
//
// DEUX CHEMINS VERS OUTLOOK, PARCE QU'AUCUN NE SUFFIT SEUL
// Constat relevé sur le poste du cabinet le 17/09/2026 : les liens `mailto:` sont
// confiés au nouvel Outlook (application du Store), qui est la messagerie réellement
// utilisée et qui porte bien contact@btpexpertise.fr. Les fichiers `.eml`, eux,
// vont à Outlook classique, installé mais jamais configuré — il ouvre son assistant
// de première utilisation. Le nouvel Outlook sait pourtant ouvrir un .eml : il le
// déclare dans « Ouvrir avec », sans en être le programme par défaut.
//
// D'où deux commandes :
//   - `ouvrirCompose` ouvre la fenêtre de rédaction par un lien mailto: — donc le
//     bon compte, le bon destinataire, le bon objet, mais sans mise en page : un
//     mailto: ne transporte que du texte brut. La mise en page part en même temps
//     dans le presse-papiers, un Ctrl+V la pose.
//   - `telechargerEml` produit un vrai message HTML complet, à ouvrir avec Outlook.
//     Tout est rempli d'un coup, à condition d'avoir associé les .eml au nouvel
//     Outlook. L'en-tête `X-Unsent: 1` lui demande un brouillon modifiable.
//
// CE QUE CE MODULE NE PEUT PAS FAIRE
// Choisir le compte expéditeur. Outlook part de son compte par défaut ; l'en-tête
// `From` n'est qu'une indication. C'est un réglage d'Outlook, pas du CRM.
import { db } from '../data/db.js';
import { esc, eur, contactName } from '../ui.js';

// ---------------------------------------------------------------- Le cabinet
export const CABINET = {
  nom: 'BTP Expertise',
  metier: 'Expertise technique du bâtiment & Assistance à Maîtrise d’Ouvrage',
  adresse: '18 rue Masséna – Nice',
  telephone: '06 81 65 15 91',
  site: 'https://btpexpertise.fr',
  siteCourt: 'btpexpertise.fr',
  email: 'contact@btpexpertise.fr',
};

// Le bandeau reprend le bleu profond de BTP Expertise plutôt que le cyan clair :
// sur le cyan, la version blanche du logo se délave et sa tour cyan se confond
// avec le fond. Le filet cyan sous le bandeau garde la couleur vive de la marque.
const FOND = '#004B62';
const VIF = '#00BBF6';
const PAPIER = '#F4F6F8';
const ENCRE = '#1F2A37';
const DOUX = '#5B6B7A';
const FILET = '#E3E8EE';
const POLICE = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

// ------------------------------------------------------- Les crochets du modèle
// Les modèles portent des [crochets] de deux sortes : ceux dont la valeur ne
// change jamais, et ceux qui dépendent du dossier. Les premiers sont posés
// d'office, les seconds sont cherchés dans le dossier choisi, et ce qui reste
// se corrige dans l'aperçu.
const CONNUES = {
  'site internet': CABINET.site, 'site': CABINET.site,
  'telephone': CABINET.telephone, 'tel': CABINET.telephone,
  'email': CABINET.email, 'e-mail': CABINET.email, 'mail': CABINET.email,
};
export const CROCHETS = /\[([^\]\n]{1,80})\]/g;
export const cleDe = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Les crochets d'un texte, dans l'ordre, une seule fois chacun même s'il se répète.
export function champsDe(texte, donnees = {}) {
  const vus = new Map();
  for (const [, dedans] of String(texte).matchAll(CROCHETS)) {
    const cle = cleDe(dedans);
    if (CONNUES[cle] !== undefined || donnees[cle] !== undefined || vus.has(cle)) continue;
    vus.set(cle, { cle, label: dedans });
  }
  return [...vus.values()];
}

// Un crochet laissé vide disparaît ; on resserre alors les espaces doubles et
// l'espace resté devant une virgule ou un point. Le point-virgule, les deux-points,
// le point d'exclamation et le point d'interrogation gardent le leur : en français
// c'est la règle typographique.
export function remplir(texte, valeurs = {}) {
  return String(texte)
    .replace(CROCHETS, (brut, dedans) => {
      const cle = cleDe(dedans);
      const v = valeurs[cle] ?? CONNUES[cle];
      return v === undefined ? brut : String(v);
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.])/g, '$1')
    .replace(/\n[ \t]+/g, '\n');
}

// ------------------------------------------------- Ce que le CRM sait du dossier
const dateLongue = (s) => {
  if (!s) return '';
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Une affaire n'a pas de référence propre : le numéro de facture en tient lieu
// quand il existe, sinon on fabrique un repère court et stable à partir de l'id.
const referenceDe = (deal) => deal.fields?.facture_num
  || (deal.id ? 'BTP-' + String(deal.id).replace(/-/g, '').slice(0, 6).toUpperCase() : '');

// Les valeurs que le CRM peut poser lui-même. Un même renseignement porte
// plusieurs noms selon les modèles — « objet », « nature du projet »,
// « problématique » désignent la même chose — d'où les synonymes.
export function donneesDossier(deal) {
  if (!deal) return {};
  const c = deal.contact_id ? db.byId('contacts', deal.contact_id) : null;
  const f = deal.fields || {};
  const sujet = f.problematique || f.besoin || f.detail || '';
  const d = {};
  const poser = (v, ...cles) => { if (v) for (const k of cles) d[k] = String(v); };

  poser(c?.first_name, 'prenom');
  poser(c && contactName(c), 'nom', 'nom du client', 'client');
  poser(f.adresse, 'adresse', 'adresse du bien', 'adresse ou visio');
  poser(referenceDe(deal), 'reference', 'reference dossier', 'nom / reference', 'reference / objet');
  poser(sujet, 'objet', "objet de l'expertise", 'objet de la demande', 'nature du projet',
    'projet', 'nom du projet', 'problematique', 'resume de la problematique');
  poser(dateLongue(f.date_visite), 'date');
  // Les modèles annoncent un montant TTC alors que l'affaire porte un montant HT :
  // on applique 20 %. Si le dossier n'est pas à ce taux, la valeur se corrige dans
  // l'aperçu comme n'importe quelle autre.
  if (Number(deal.amount) > 0) d['xxx € ttc'] = eur(Math.round(Number(deal.amount) * 1.2));
  return d;
}

export const emailDu = (deal) => {
  const c = deal?.contact_id ? db.byId('contacts', deal.contact_id) : null;
  return c?.email || '';
};

// ------------------------------------------------------- Le texte devient du HTML
// Le corps d'un modèle est du texte suivi : des paragraphes, des puces « • », et
// des lignes « Intitulé : valeur » qui méritent un encadré. On les reconnaît pour
// que le mail se lise d'un coup d'œil au lieu d'être un bloc uniforme.
const INFO = /^([^:\n]{2,42})\s:\s(.+)$/;
const PUCE = /^[•\-–]\s*(.+)$/;

// La signature de fin est reprise par le pied de page : on la retire du corps
// pour ne pas l'écrire deux fois.
const SIGNATURE = [
  /^BTP Expertise$/i,
  /^Expertise technique du bâtiment/i,
  /^18 rue Mass[ée]na/i,
  /^[\d\s+().-]{8,}\s*\|\s*\S+$/,
  /^https?:\/\/\S+$/i,
];

const S = {
  p: `margin:0 0 14px;font:15px/1.65 ${POLICE};color:${ENCRE}`,
  ul: `margin:0 0 16px;padding:0 0 0 20px`,
  li: `margin:0 0 6px;font:15px/1.6 ${POLICE};color:${ENCRE}`,
  lbl: `padding:4px 14px 4px 0;font:600 12px/1.5 ${POLICE};color:${DOUX};text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;vertical-align:top`,
  val: `padding:4px 0;font:15px/1.5 ${POLICE};color:${ENCRE};vertical-align:top`,
};

const encadre = (lignes) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#EFF7FB;border-left:3px solid ${VIF};margin:0 0 18px">
  <tr><td style="padding:14px 18px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      ${lignes.map(([l, v]) => `<tr><td style="${S.lbl}">${esc(l)}</td><td style="${S.val}">${esc(v)}</td></tr>`).join('')}
    </table>
  </td></tr>
</table>`;

export function corpsEnHtml(texte) {
  const lignes = String(texte).replace(/\r\n?/g, '\n').split('\n');
  while (lignes.length) {
    const fin = lignes[lignes.length - 1].trim();
    if (fin === '' || SIGNATURE.some(r => r.test(fin))) lignes.pop(); else break;
  }

  const out = [];
  let para = [], puces = [], infos = [];
  const viderPara = () => { if (para.length) { out.push(`<p style="${S.p}">${para.join('<br>')}</p>`); para = []; } };
  const viderPuces = () => { if (puces.length) { out.push(`<ul style="${S.ul}">${puces.map(t => `<li style="${S.li}">${t}</li>`).join('')}</ul>`); puces = []; } };
  const viderInfos = () => { if (infos.length) { out.push(encadre(infos)); infos = []; } };
  const viderTout = () => { viderPara(); viderPuces(); viderInfos(); };

  for (const brute of lignes) {
    const l = brute.trim();
    if (!l) { viderTout(); continue; }
    const puce = l.match(PUCE);
    if (puce) { viderPara(); viderInfos(); puces.push(esc(puce[1])); continue; }
    const info = l.match(INFO);
    // « Points abordés : » seul en fin de ligne annonce une liste, ce n'est pas
    // un renseignement : seule une ligne qui porte une valeur entre dans l'encadré.
    if (info && !l.endsWith(':')) { viderPara(); viderPuces(); infos.push([info[1].trim(), info[2].trim()]); continue; }
    viderPuces(); viderInfos(); para.push(esc(l));
  }
  viderTout();
  return out.join('\n');
}

// ------------------------------------------------------------- Le mail complet
// `srcLogo` vaut `cid:logobtp` dans le fichier .eml, où l'image voyage avec le
// message. L'aperçu affiché dans le CRM, lui, est une page web : il lui faut une
// vraie adresse, sans quoi l'en-tête montre une image cassée.
export const URL_LOGO = new URL('../../assets/logos/btp-mail.png', import.meta.url).href;
// Adresse publique du même logo, pour le mail collé dans Outlook : au collage,
// Outlook télécharge l'image et l'embarque dans le message qu'il enverra. Une
// adresse locale (localhost, file://) ne lui dirait rien.
export const URL_LOGO_PUBLIC = 'https://mickael-rigaud.github.io/CRM-Groupe/assets/logos/btp-mail.png';
export function mailHtml(sujet, corpsTexte, srcLogo = 'cid:logobtp') {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(sujet)}</title></head>
<body style="margin:0;padding:0;background:${PAPIER}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PAPIER}">
 <tr><td align="center" style="padding:24px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid ${FILET}">
   <tr><td align="center" bgcolor="${FOND}" style="background:${FOND};padding:26px 24px">
     <img src="${srcLogo}" width="180" alt="BTP Expertise" style="display:block;width:180px;height:auto;border:0;outline:none;text-decoration:none">
   </td></tr>
   <tr><td bgcolor="${VIF}" style="background:${VIF};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
   <tr><td style="padding:30px 34px 4px">
     <h1 style="margin:0;font:600 20px/1.35 ${POLICE};color:${FOND}">${esc(sujet)}</h1>
   </td></tr>
   <tr><td style="padding:20px 34px 28px">
${corpsEnHtml(corpsTexte)}
   </td></tr>
   <tr><td bgcolor="${FOND}" style="background:${FOND};padding:20px 34px;font:13px/1.65 ${POLICE};color:#B9D7E2">
     <span style="color:#FFFFFF;font-weight:700">${esc(CABINET.nom)}</span><br>
     ${esc(CABINET.metier)}<br>
     ${esc(CABINET.adresse)} · ${esc(CABINET.telephone)}<br>
     <a href="${CABINET.site}" style="color:#7FDCFF;text-decoration:none">${esc(CABINET.siteCourt)}</a>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}

// ------------------------------------------------------------- Le fichier .eml
const b64Octets = (u8) => {
  let s = '';
  const pas = 0x8000;                     // découpé : String.fromCharCode sature sur un gros tableau
  for (let i = 0; i < u8.length; i += pas) s += String.fromCharCode.apply(null, u8.subarray(i, i + pas));
  return btoa(s);
};
const b64Texte = (t) => b64Octets(new TextEncoder().encode(t));
const plier = (s) => (s.match(/.{1,76}/g) || []).join('\r\n');

// Un objet de mail non ASCII se code en « mots encodés » d'au plus 75 signes.
// On découpe sur des frontières de caractère, jamais au milieu d'un accent.
function sujetMime(s) {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const mots = [];
  let bloc = '', octets = 0;
  for (const ch of s) {
    const n = new TextEncoder().encode(ch).length;
    if (octets + n > 30) { mots.push(bloc); bloc = ''; octets = 0; }
    bloc += ch; octets += n;
  }
  if (bloc) mots.push(bloc);
  return mots.map(m => `=?UTF-8?B?${b64Texte(m)}?=`).join('\r\n ');
}

const dateRfc = () => new Date().toUTCString().replace('GMT', '+0000');

export function eml({ de, a, sujet, html, logoB64 }) {
  const sep = '=_btpexpertise_' + Math.random().toString(36).slice(2, 12) + '_';
  const entetes = [
    `From: ${de}`,
    `To: ${a || ''}`,
    `Subject: ${sujetMime(sujet)}`,
    `Date: ${dateRfc()}`,
    'MIME-Version: 1.0',
    'X-Unsent: 1',                        // Outlook ouvre un brouillon, pas un message reçu
    `Content-Type: multipart/related; type="text/html"; boundary="${sep}"`,
  ].join('\r\n');

  const corps = [
    `--${sep}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    plier(b64Texte(html)),
  ];
  if (logoB64) corps.push(
    `--${sep}`,
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <logobtp>',
    'Content-Disposition: inline; filename="btp-expertise.png"',
    '',
    plier(logoB64));
  corps.push(`--${sep}--`, '');

  return `${entetes}\r\n\r\n${corps.join('\r\n')}`;
}

// Le logo voyage dans le fichier plutôt qu'en lien : Outlook bloque les images
// distantes tant qu'on ne les autorise pas, et un mail dont l'en-tête est vide
// à l'ouverture donne mauvaise impression.
let logoPromesse = null;
export function logoBase64() {
  if (!logoPromesse) {
    logoPromesse = fetch(new URL('../../assets/logos/btp-mail.png', import.meta.url))
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('logo introuvable'))))
      .then(buf => b64Octets(new Uint8Array(buf)))
      .catch(() => null);                 // sans logo, le mail part quand même
  }
  return logoPromesse;
}

const nomFichier = (t) => (t || 'mail').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'mail';

export async function telechargerEml({ a, sujet, html, nom }) {
  const fichier = eml({ de: `${CABINET.nom} <${CABINET.email}>`, a, sujet, html, logoB64: await logoBase64() });
  const url = URL.createObjectURL(new Blob([fichier], { type: 'message/rfc822' }));
  const el = document.createElement('a');
  el.href = url; el.download = `${nomFichier(nom || sujet)}.eml`;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Ouvre la fenêtre de rédaction d'Outlook, destinataire et objet posés.
//
// À APPELER SANS `await` AVANT ELLE. Les navigateurs n'autorisent l'ouverture d'un
// programme extérieur que pendant le geste de l'utilisateur ; le moindre `await`
// avant cet appel consomme cette autorisation et le lien est refusé en silence —
// c'est exactement ce qui faisait croire que « rien ne s'ouvre ».
export function ouvrirCompose({ a, sujet }) {
  const p = new URLSearchParams();
  if (sujet) p.set('subject', sujet);
  const suite = p.toString();
  window.location.href = `mailto:${encodeURIComponent(a || '')}${suite ? '?' + suite : ''}`;
}

// Le second chemin : coller la mise en page dans un message Outlook déjà ouvert.
export async function copierMiseEnPage(html, texte) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    await navigator.clipboard.writeText(texte);
    return 'texte';
  }
  await navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([texte], { type: 'text/plain' }),
  })]);
  return 'html';
}
