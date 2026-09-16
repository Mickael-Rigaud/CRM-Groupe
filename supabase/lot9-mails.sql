-- =====================================================================
--  CRM Groupe — lot 9 : les modèles de mails portent leur mode d'emploi
--  À exécuter dans Supabase > SQL Editor, après lot5-btp.sql.
--  Idempotent : relançable sans rien perdre.
--
--  Les modèles du cabinet ne sont pas seulement un texte : chacun a un
--  déclencheur (à quel moment on l'envoie) et un mode (parti tout seul, ou
--  à envoyer à la main). Ces deux informations valent autant que le corps.
--
--  Le contenu lui-même s'importe par un script séparé, tenu hors du dépôt :
--  ce sont les séquences commerciales du cabinet, elles n'ont pas à être
--  publiques. Voir BTP-mails-types-PRIVE.sql.
-- =====================================================================

alter table public.mail_templates add column if not exists trigger_text text;
alter table public.mail_templates add column if not exists mode text;

comment on column public.mail_templates.trigger_text is 'Le moment où ce mail part : « après validation du formulaire », « J+3 sans réponse »…';
comment on column public.mail_templates.mode is 'Automatique (envoyé par un outil) ou Manuel (envoyé par le cabinet).';

-- Un même modèle ne doit pas se dupliquer quand on rejoue l'import.
create unique index if not exists mail_templates_cle_idx
  on public.mail_templates (activity, theme, title);
