-- =====================================================================
--  CRM Groupe — lot 10 : la référence d'ordre des modèles de mails
--  À exécuter dans Supabase > SQL Editor, après lot9-mails.sql.
--  Idempotent.
--
--  Les modèles du cabinet portent une référence — C1 à C5 avant le rendez-vous
--  téléphonique, E1 à E14 pour l'expertise, B1 à B14 pour l'AMO. C'est l'ordre
--  chronologique de chaque séquence, celui du dossier d'origine : on le garde,
--  il dit à quel moment du parcours chaque mail intervient.
-- =====================================================================

alter table public.mail_templates add column if not exists ref text;
comment on column public.mail_templates.ref is 'Référence d''ordre dans la séquence : C1, E7, B12…';
