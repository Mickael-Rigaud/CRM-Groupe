# CRM Groupe — consignes pour Claude Code

Application interne de Mickael Rigaud pour piloter 4 activités (RGD Renova, BTP Expertise, La Référence Courtage, Propulsion) + modules transverses (Patrimoine, Gestion locative, Vivier courtiers, Acquisition). Langue de travail : **français** (code, commits, interface).

## Stack (gratuite, sans build)
- SPA vanilla JS en modules ES, routage par hash (`#/page/param`). Aucun bundler, aucun `npm install` : les fichiers sont servis tels quels.
- Hébergement : GitHub Pages sur ce dépôt (branche `main`, racine). Un push sur `main` = mise en production (délai 1–2 min, Ctrl+F5 côté navigateur).
- Backend : Supabase (projet `crm-groupe`, plan gratuit) — Auth, Postgres avec RLS, Storage (bucket privé `documents`, URLs signées 1 h). Client `supabase-js` chargé depuis esm.sh. Chart.js vendu dans `assets/`.
- Mode démo : si `SUPABASE_URL`/`SUPABASE_ANON_KEY` sont vides dans `js/config.js`, `db.js` bascule sur un adaptateur localStorage (`crm_local_v1`) avec un jeu d'exemple (`js/data/seed.js`). Utile pour tester sans toucher à la production.

## Arborescence
- `index.html` — coquille, charge `js/app.js`.
- `js/app.js` — login, mise en page, `NAV` (menu avec règles d'affichage), routeur, formulaires mot de passe.
- `js/pages/*.js` — une page par fichier ; `js/pages/index.js` fait la table `pages` nom → fonction.
- `js/data/db.js` — accès données (Supabase ou local). **Supabase renvoie 1000 lignes max par requête : le chargement est paginé avec `.range()`, ne pas retirer.**
- `js/data/scope.js` — droits côté client (les mêmes règles sont imposées côté serveur par les policies RLS ; les deux doivent rester cohérentes).
- `js/data/finance.js` — calculs de prêts (échéancier, différé partiel/total, CRD, mensualité imposée), types et statuts de biens.
- `js/data/schema.js` — activités, rôles, étapes de pipeline.
- `js/documents.js` — pièces jointes (Storage) par entité.
- `js/ui.js` — helpers de rendu (`renderForm` avec `hint`, modales, tableaux, `esc`) et **filtres partagés** : `terms`/`hit` (recherche insensible aux accents, tous les mots exigés), `searchInput`/`bindSearch`/`restoreFocus` (barre de recherche + curseur conservé après redraw), `pickState`/`pickInit`/`multiPick`/`pickChips`/`bindMultiPick` (sélecteur multiple recherchable, mémorisé en localStorage — clé `crm_locatif_props` pour les biens loués, `crm_patrimoine_props` pour le patrimoine). Toute nouvelle liste filtrable doit réutiliser ces helpers plutôt que refaire un `<select>` ou un `toLowerCase().includes()`.
- `css/app.css` — thème La Référence Courtage (navy / bleu mer / orange). Pas de logo.
- `supabase/*.sql` — scripts à exécuter **à la main** dans Supabase > SQL Editor, dans l'ordre : `schema.sql` → `modules-lot2.sql` → `lot3-documents-prets.sql` → `lot4-gestion-locative.sql`. Tout nouveau changement de schéma = nouveau fichier `supabase/lotN-….sql` idempotent (`if not exists`, `drop policy if exists`…), jamais de modification des anciens.

## Modèle de droits (profiles)
Colonnes : `role` (direction | propulsion | commercial), `activities` (text[] parmi rgd, btp, courtage, propulsion), `patrimony_access`, `rental_access`, `active`.
- Patrimoine (biens, prix, valeurs, prêts) : `role='direction'` **et** `patrimony_access=true` uniquement (`has_patrimony()`).
- Gestion locative : `rental_access=true` quel que soit le rôle, ou direction+patrimoine (`has_rental()`). Ne voit les biens qu'à travers la vue allégée `v_properties_rental` (sans prix ni financement).
- Propulsion : `role='propulsion'` + `'propulsion'` dans `activities` → voit les affaires/contacts/organisations marqués Propulsion + les siens. La ligne « Propulsion » du menu est le pipeline sous « Commercial ».
- Vivier courtiers : direction ou `courtage` dans `activities`.
- Documents : droits de l'entité parente (`can_document(entity_type, id)`).

## Modèles métier à respecter
- **Prêts** : `duration_months` = mois d'amortissement **hors** différé ; `deferral_months` + `deferral_type` (`partial` = intérêts payés, `total` = intérêts capitalisés) ; `monthly_payment` optionnel (mensualité imposée par la banque, prime sur le calcul) ; `start_date` = première échéance. Les 13 prêts en base ont été validés au centime contre les tableaux d'amortissement : ne pas changer les formules de `finance.js` sans re-vérifier.
- **Loyers** : une ligne `rent_payments` par (bail, mois `YYYY-MM`) avec `due`, `apl`, `tenant_paid`, `amount`, `mode`, `adjustment`, `note`. Reçu = `apl + tenant_paid` quand renseignés, sinon `amount`. Solde d'un bail au mois k = Σ (due − reçu + adjustment) sur les mois ≤ k (`balanceOf` dans `locatif.js`). `adjustment` sert à réconcilier avec l'ancien Excel : ne pas le recalculer ni le supprimer. `prepareMonth` crée les lignes du mois pour les baux actifs.
- **Ids déterministes** : les données importées utilisent uuid5 (namespace `6f1c2a7e-3b7d-4c1e-9a55-1f2e3d4c5b6a`, clés `prop|…`, `unit|…`, `lease|…`, `pay|leaseId|month`, `loan|slug|banque`) pour que les scripts soient rejouables (`on conflict do nothing`).
- Contacts : une seule table/écran avec bascule Personne / Entreprise (`kind`) ; l'ancien écran Organisations redirige vers Contacts.

## Règles absolues
- Dépôt **public** : ne jamais committer de données personnelles ou financières (locataires, loyers, prêts, fichiers `*-PRIVE.sql`, exports Excel/PDF). Les scripts d'import privés se lancent à la main et restent hors dépôt.
- Ne jamais mettre la clé `service_role` Supabase dans le code ; seule la clé publishable/anon est dans `js/config.js`.
- Toute nouvelle table ou colonne : RLS activée + policy, et mise à jour de `scope.js` en miroir.
- Pas de dépendance nouvelle nécessitant un build ; rester sur des modules ES chargés par le navigateur.
- Tester en mode démo (servir le dossier avec `python3 -m http.server`, vider `SUPABASE_URL` dans une copie de `config.js`) avant de pousser ; ne pas casser le mode démo.
- Un commit par sujet, message en français à l'impératif court (ex. « Fiche bien : baux en cours uniquement »).

## Ce que Mickael attend
Direct, sans flatterie, une recommandation finale claire. Si une demande est floue mais réalisable sans inventer, avancer avec une hypothèse signalée. Livrer complet en une fois plutôt qu'en versions successives. Ne jamais présenter La Référence Courtage comme appartenant à Pretto.
