# CRM Groupe — RGD Renova · BTP Expertise · La Référence Courtage · Propulsion

CRM sur-mesure, 100 % gratuit à exploiter : une application web statique (HTML / CSS / JavaScript, sans étape de build) + une base Supabase (offre gratuite) + Make (offre gratuite) pour l'entrée automatique des leads.

## Ce que fait la v1

- **Base contacts et organisations commune** aux 4 activités, avec canal d'origine, campagne, apporteur et consentement RGPD.
- **4 pipelines** (kanban, glisser-déposer) avec les étapes, probabilités et champs propres à chaque activité — définis dans un seul fichier : `js/data/schema.js`.
- **Activités / tâches** : chaque affaire ouverte doit avoir une prochaine action datée ; la vue « À faire aujourd'hui » regroupe retards, jour, semaine.
- **Vue d'ensemble dirigeant** : leads, RDV, affaires en cours, CA potentiel pondéré, CA signé, transformation, panier moyen, délai moyen — par activité, période, responsable, canal.
- **Pilotage de l'acquisition** : dépense → leads → joignables → RDV → ventes → CA par canal et campagne, avec CPL, coût par RDV, CAC, ROAS.
- **Partenaires et apporteurs** : leads, ventes et CA apportés par chacun, dernier contact, relances.
- **Suivi Propulsion** : abonnements, revenu mensuel récurrent, renouvellements à 45 jours.
- **Droits** : direction (tout), Propulsion (Stéphanie, Élodie), chargé d'affaires (ses dossiers).
- **Import CSV** de contacts, exports CSV et JSON.
- **Automatisations intégrées** : tâche « Contacter le prospect » à la création, tâche de suite à la signature (Costructor / mission / commission / onboarding), clôture des tâches à la perte, alerte « sans prochaine action », alerte « affaire qui dort », alerte renouvellement.
- **Entrée automatique des leads** (formulaires des sites, Meta Lead Ads) via la fonction `intake_lead`.

## 1. Tester tout de suite (mode démo)

Ouvrez le dossier avec un petit serveur local (les modules JavaScript ne se chargent pas en double-cliquant sur `index.html`) :

```
cd crm
python -m http.server 8080
```

puis http://localhost:8080. Le mode démo stocke des données d'exemple dans le navigateur ; choisissez un profil (Mickael, Stéphanie, Élodie, chargé d'affaires) pour vérifier ce que chacun voit. « Paramètres → Réinitialiser la démo » remet l'exemple.

## 2. Mise en production (≈ 30 minutes)

### 2.1 Supabase (base de données + comptes)

1. Créez un projet sur https://supabase.com (offre gratuite), région **Paris (eu-west-3)** ou Francfort.
2. **SQL Editor → New query** : collez tout le contenu de `supabase/schema.sql`, exécutez. Cela crée les tables, les droits (RLS), la fonction d'entrée des leads et un jeton initial.
3. **Authentication → Providers → Email** : laissez Email activé ; désactivez « Confirm email » si vous créez les comptes vous-même.
4. **Authentication → Users → Add user** : créez les comptes (Mickael, Stéphanie, Élodie…) avec email + mot de passe. Un profil est créé automatiquement.
5. **Table Editor → profiles** : pour chaque ligne, renseignez `full_name`, `role` (`direction`, `propulsion` ou `commercial`) et `activities` (ex. `{rgd,btp,courtage,propulsion}` pour la direction, `{propulsion}` pour Stéphanie et Élodie).
6. **Project Settings → API** : copiez l'**URL du projet** et la clé **anon public**.

### 2.2 Configuration de l'application

Ouvrez `js/config.js` et renseignez :

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJ...',
```

La clé « anon » est publique par conception : la sécurité repose sur les droits RLS du schéma, pas sur le secret de cette clé. Ne mettez **jamais** la clé `service_role` dans l'application.

### 2.3 Hébergement (gratuit)

Le dossier est un site statique : déployez-le comme le dashboard RGD Renova.

- **Surge** : `npx surge ./crm votre-nom.surge.sh`
- ou **Netlify / Cloudflare Pages / GitHub Pages** : glissez le dossier ou connectez le dépôt GitHub.

Rien d'autre à installer : Chart.js est inclus dans `assets/`, la bibliothèque Supabase se charge depuis un CDN.

### 2.4 Sécuriser le jeton d'entrée des leads

Dans l'application, **Paramètres → Entrée automatique des leads → Générer → Enregistrer**. Ce jeton sera copié dans Make (jamais sur un site).

## 3. Entrée automatique des leads (Make gratuit)

Un seul scénario Make suffit pour tous les sites et les Meta Lead Ads (l'offre gratuite permet 2 scénarios actifs, 1 000 opérations/mois).

1. **Déclencheur** : module *Webhooks → Custom webhook* (pour les formulaires des sites : Élodie fait pointer chaque formulaire vers cette URL, ou utilise le module natif du constructeur de site) ; pour les publicités, module *Facebook Lead Ads → Watch leads*.
2. **Action** : module *HTTP → Make a request*
   - URL : `https://<projet>.supabase.co/rest/v1/rpc/intake_lead`
   - Méthode : POST
   - En-têtes : `apikey: <clé anon>`, `Authorization: Bearer <clé anon>`, `Content-Type: application/json`
   - Corps (JSON) :
     ```json
     { "payload": { "token": "<jeton>", "activity": "rgd",
       "first_name": "{{prenom}}", "last_name": "{{nom}}", "phone": "{{tel}}", "email": "{{email}}",
       "city": "{{ville}}", "message": "{{message}}",
       "channel": "Site internet direct", "campaign": "{{utm_campaign}}" } }
     ```
   - `activity` : `rgd`, `btp`, `courtage` ou `propulsion` (un routeur Make peut l'attribuer selon le site ou la campagne). Pour Meta : `"channel": "Meta Ads"` et `"campaign": "{{campaign_name}}"`.
3. Le CRM crée ou retrouve le contact, crée l'affaire à l'étape « Nouveau lead » et la tâche « Appeler le prospect » à J+1 assignée au responsable (`owner_email` facultatif, sinon la direction).

Pour capter la campagne d'origine sur les sites : un champ caché `utm_campaign` dans chaque formulaire, rempli par le script standard de lecture des paramètres d'URL.

## 4. Exploitation

- **Chaque matin** : « À faire aujourd'hui ». Règle d'or : pas d'affaire ouverte sans prochaine action datée (le compteur rouge la fait respecter).
- **Chaque semaine (direction)** : Vue d'ensemble + affaires qui dorment + activités en retard ; Partenaires sans contact depuis 60 jours.
- **Chaque mois** : saisir les dépenses Meta / Google dans « Acquisition » (une ligne par mois, canal, campagne — nom de campagne identique à celui des affaires) pour obtenir CPL, CAC et ROAS.
- **Sauvegarde** : Paramètres → « Exporter toute la base (JSON) » une fois par semaine vers le NAS ou le Drive, ou planifier une exportation automatique depuis Supabase (Database → Backups, quotidien sur l'offre gratuite pendant 7 jours).
- **Projet Supabase gratuit** : il se met en pause après 7 jours sans requête. Un usage quotidien suffit ; sinon un scénario Make hebdomadaire qui appelle `GET /rest/v1/settings?select=key` maintient le projet actif.

## 5. Faire évoluer

- **Étapes, probabilités, champs, canaux, motifs de perte** : `js/data/schema.js` (aucune modification de base de données nécessaire, les champs spécifiques sont stockés en JSON).
- **Nouveau rôle ou règle de visibilité** : `js/data/scope.js` (côté écran) **et** les politiques RLS dans `supabase/schema.sql` (côté serveur — c'est lui qui fait foi).
- **Nouvelle page** : un fichier dans `js/pages/` exporté dans `js/pages/index.js` et une entrée dans `NAV` (`js/app.js`).
- **Claude** : la vue `v_deals` et l'API REST Supabase permettent de lire le pipeline pour des synthèses hebdomadaires ou des relances rédigées automatiquement.

Hors périmètre v1 (prévu ensuite) : synchronisation Gmail (adresse BCC via Make), Google Calendar, pont Costructor (chantier terminé → demande d'avis).

## Arborescence

```
crm/
├── index.html              page unique
├── css/app.css             styles (charte RGD Renova)
├── assets/chart.umd.js     Chart.js (graphiques)
├── js/config.js            URL et clé Supabase (vide = mode démo)
├── js/app.js               connexion, navigation, mise en page
├── js/ui.js                composants (modales, formulaires, formats)
├── js/data/schema.js       référentiel métier : pipelines, champs, canaux
├── js/data/db.js           accès données (navigateur ou Supabase)
├── js/data/scope.js        droits côté écran
├── js/data/seed.js         données de démonstration
├── js/pages/               dashboard, today, pipeline, deal, activity, contacts, organisations, acquisition, settings
└── supabase/schema.sql     tables, droits RLS, fonction intake_lead, vue v_deals
```
