-- =====================================================================
--  Lot 2 — Modules Patrimoine immobilier et Vivier courtiers
--  À exécuter une seule fois dans Supabase > SQL Editor (après schema.sql).
--  Puis exécuter vivier-import.sql pour charger les 338 profils.
-- =====================================================================

-- ---------- Accès patrimoine : drapeau sur le profil ----------
alter table public.profiles add column if not exists patrimony_access boolean not null default false;
-- Mickael (direction) : accès patrimoine
update public.profiles set patrimony_access = true where lower(email) = 'm.rigaud@rgdrenova.fr';

create or replace function public.has_patrimony() returns boolean language sql stable security definer set search_path = public as
  $$ select coalesce((select role = 'direction' and patrimony_access from public.profiles where id = auth.uid()), false) $$;

-- ---------- Biens ----------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'Loué',
  invest_type text, structure text,
  address text, postal_code text, city text,
  surface numeric,
  purchase_date date,
  price numeric, notary_fees numeric, works numeric, other_costs numeric, current_value numeric,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
-- ---------- Prêts ----------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  bank text, label text,
  principal numeric not null, rate numeric not null default 0, duration_months int not null,
  start_date date not null,
  insurance_monthly numeric default 0, deferral_months int default 0, monthly_payment numeric,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
-- ---------- Baux ----------
create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  lot text, tenant text not null, tenant_phone text,
  rent numeric not null default 0, charges numeric default 0, deposit numeric,
  start_date date, end_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
-- ---------- Encaissements de loyers ----------
create table if not exists public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid references public.leases(id) on delete cascade,
  month text not null,              -- 'AAAA-MM'
  amount numeric not null default 0,
  received_at date,
  note text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists rent_payments_lease_month_idx on public.rent_payments (lease_id, month);
-- ---------- Charges ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  category text not null, label text not null,
  amount numeric not null default 0,
  recurrence text not null default 'yearly' check (recurrence in ('monthly','quarterly','yearly','once')),
  date date,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

-- RLS patrimoine : uniquement les profils direction avec patrimony_access
alter table public.properties    enable row level security;
alter table public.loans         enable row level security;
alter table public.leases        enable row level security;
alter table public.rent_payments enable row level security;
alter table public.expenses      enable row level security;
drop policy if exists properties_all on public.properties;       create policy properties_all    on public.properties    for all to authenticated using (public.has_patrimony()) with check (public.has_patrimony());
drop policy if exists loans_all on public.loans;                 create policy loans_all         on public.loans         for all to authenticated using (public.has_patrimony()) with check (public.has_patrimony());
drop policy if exists leases_all on public.leases;               create policy leases_all        on public.leases        for all to authenticated using (public.has_patrimony()) with check (public.has_patrimony());
drop policy if exists rent_payments_all on public.rent_payments; create policy rent_payments_all on public.rent_payments for all to authenticated using (public.has_patrimony()) with check (public.has_patrimony());
drop policy if exists expenses_all on public.expenses;           create policy expenses_all      on public.expenses      for all to authenticated using (public.has_patrimony()) with check (public.has_patrimony());

-- =====================================================================
--  Vivier courtiers (recrutement La Référence Courtage)
-- =====================================================================
create table if not exists public.broker_profiles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,            -- identifiant de l'ancien outil (import)
  prenom text, nom text not null,
  ville text, ville_key text, dep text,
  reseau text, reseau_key text,
  statut text, poste text, exp text, exp_years int,
  orias text, orias_year int,
  email text, email_ok boolean not null default false,
  tel text, tel_type text,
  prio text not null default '2a', cert text not null default 'à vérifier',
  sources text[] not null default '{}',
  suivi text not null default 'new' check (suivi in ('new','contact','rdv','ok','no')),
  notes text, last_contact_at timestamptz,
  archive boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists broker_profiles_dep_idx on public.broker_profiles (dep, prio);

create or replace function public.can_vivier() returns boolean language sql stable security definer set search_path = public as
  $$ select coalesce((select role = 'direction' or 'courtage' = any(activities) from public.profiles where id = auth.uid()), false) $$;

alter table public.broker_profiles enable row level security;
drop policy if exists broker_all on public.broker_profiles;
create policy broker_all on public.broker_profiles for all to authenticated using (public.can_vivier()) with check (public.can_vivier());
