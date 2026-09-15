-- =====================================================================
--  CRM Groupe — lot 5 : espace BTP Expertise
--  À exécuter dans Supabase > SQL Editor, après lot4-gestion-locative.sql
--  Idempotent : peut être relancé sans risque.
--
--  Deux référentiels internes, sans donnée personnelle :
--    - dtu_sheets     : fiches DTU consultables pendant une expertise
--    - mail_templates : modèles de mails classés par thématique
-- =====================================================================

-- ---------- Fiches DTU ----------
create table if not exists public.dtu_sheets (
  id uuid primary key default gen_random_uuid(),
  code text not null,                 -- « NF DTU 20.1 »
  title text not null,                -- intitulé officiel
  domain text,                        -- Maçonnerie, Couverture, Plomberie…
  scope_text text,                    -- domaine d'application, en clair
  checkpoints text,                   -- points de contrôle sur le terrain (rédigés par l'équipe)
  link text,                          -- lien vers la norme ou une fiche interne
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists dtu_sheets_code_idx on public.dtu_sheets (lower(code));

-- ---------- Modèles de mails ----------
create table if not exists public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  activity text not null default 'btp' check (activity in ('rgd','btp','courtage','propulsion')),
  theme text not null,                -- thématique : Prospection, Devis, Rapport…
  title text not null,                -- nom du modèle dans la liste
  subject text,                       -- objet du mail
  body text not null default '',      -- corps du mail
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists mail_templates_activity_idx on public.mail_templates (activity, theme);

-- =====================================================================
--  Droits : référentiels de travail, lisibles par toute l'équipe connectée.
--  Écriture réservée à la direction et aux porteurs de l'activité concernée.
-- =====================================================================
alter table public.dtu_sheets     enable row level security;
alter table public.mail_templates enable row level security;

create or replace function public.has_activity(a text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'direction' or a = any(activities) from public.profiles where id = auth.uid()), false)
$$;

drop policy if exists dtu_read on public.dtu_sheets;
create policy dtu_read on public.dtu_sheets for select to authenticated using (true);
drop policy if exists dtu_write on public.dtu_sheets;
create policy dtu_write on public.dtu_sheets for all to authenticated
  using (public.has_activity('btp')) with check (public.has_activity('btp'));

drop policy if exists mails_read on public.mail_templates;
create policy mails_read on public.mail_templates for select to authenticated using (true);
drop policy if exists mails_write on public.mail_templates;
create policy mails_write on public.mail_templates for all to authenticated
  using (public.has_activity(activity)) with check (public.has_activity(activity));

-- =====================================================================
--  Amorce des fiches DTU : les normes les plus souvent citées en expertise.
--  Numéro et intitulé uniquement — les points de contrôle se rédigent dans
--  l'application, ils relèvent de la pratique du cabinet et non de la norme.
--  Liste non exhaustive : à vérifier et compléter au fil des dossiers.
-- =====================================================================
insert into public.dtu_sheets (code, title, domain, position) values
  ('NF DTU 13.1',  'Fondations superficielles',                                             'Fondations',   10),
  ('NF DTU 13.3',  'Dallages — conception, calcul et exécution',                            'Fondations',   20),
  ('NF DTU 14.1',  'Travaux de cuvelage',                                                   'Fondations',   30),
  ('NF DTU 20.1',  'Ouvrages en maçonnerie de petits éléments — parois et murs',            'Maçonnerie',   40),
  ('NF DTU 21',    'Exécution des ouvrages en béton',                                       'Maçonnerie',   50),
  ('NF DTU 23.1',  'Murs en béton banché',                                                  'Maçonnerie',   60),
  ('NF DTU 24.1',  'Travaux de fumisterie',                                                 'Fumisterie',   70),
  ('NF DTU 25.41', 'Ouvrages en plaques de plâtre',                                         'Plâtrerie',    80),
  ('NF DTU 26.1',  'Travaux d''enduits de mortiers',                                        'Plâtrerie',    90),
  ('NF DTU 26.2',  'Chapes et dalles à base de liants hydrauliques',                        'Sols',        100),
  ('NF DTU 31.2',  'Construction de maisons et bâtiments à ossature en bois',               'Bois',        110),
  ('NF DTU 36.5',  'Mise en œuvre des fenêtres et portes extérieures',                      'Menuiseries', 120),
  ('NF DTU 40.11', 'Couverture en ardoises',                                                'Couverture',  130),
  ('NF DTU 40.21', 'Couverture en tuiles de terre cuite à emboîtement ou à glissement',     'Couverture',  140),
  ('NF DTU 43.1',  'Étanchéité des toitures-terrasses — éléments porteurs en maçonnerie',   'Étanchéité',  150),
  ('NF DTU 43.4',  'Toitures avec éléments porteurs en bois et revêtement d''étanchéité',   'Étanchéité',  160),
  ('NF DTU 52.1',  'Revêtements de sol scellés',                                            'Sols',        170),
  ('NF DTU 52.2',  'Pose collée des revêtements céramiques et pierres naturelles',          'Sols',        180),
  ('NF DTU 59.1',  'Travaux de peinture des bâtiments',                                     'Finitions',   190),
  ('NF DTU 60.1',  'Plomberie sanitaire pour bâtiments',                                    'Plomberie',   200),
  ('NF DTU 65.14', 'Exécution de planchers chauffants à eau chaude',                        'Chauffage',   210),
  ('NF DTU 68.3',  'Installations de ventilation mécanique',                                'Ventilation', 220)
on conflict do nothing;
