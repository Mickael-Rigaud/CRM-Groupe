-- =====================================================================
--  Lot 4 — Gestion locative (lots, baux, locataires, suivi des loyers)
--  À exécuter une seule fois dans Supabase > SQL Editor (après lot3-documents-prets.sql).
--  Puis, si fourni, exécuter le fichier d'import PRIVÉ des loyers (à ne jamais déposer sur GitHub).
-- =====================================================================

-- ---------- Droit « gestion locative » sur le profil ----------
alter table public.profiles add column if not exists rental_access boolean not null default false;
create or replace function public.has_rental() returns boolean language sql stable security definer set search_path = public as
  $$ select coalesce((select rental_access or (role = 'direction' and patrimony_access) from public.profiles where id = auth.uid()), false) $$;

-- ---------- Biens : détenteur ----------
alter table public.properties add column if not exists holding_name text;   -- ex. SCI Bardock

-- ---------- Lots (logements / locaux d'un bien) ----------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,                  -- « A », « 3 », « 290 bis »
  unit_type text,                      -- Studio, T2, T3, Local commercial, Bureaux…
  surface numeric,
  dpe text, ges text,
  water_flat boolean,                  -- forfait eau inclus
  sort_order int default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists units_property_idx on public.units (property_id);

-- ---------- Baux : compléments ----------
alter table public.leases add column if not exists unit_id uuid references public.units(id) on delete set null;
alter table public.leases add column if not exists lease_type text default 'vide';        -- vide, meublé, commercial, professionnel, colocation
alter table public.leases add column if not exists tenant_email text;
alter table public.leases add column if not exists guardian_name text;                    -- tutelle / curatelle / garant
alter table public.leases add column if not exists guardian_phone text;
alter table public.leases add column if not exists guardian_email text;
alter table public.leases add column if not exists apl numeric default 0;                 -- part versée par la CAF
alter table public.leases add column if not exists payment_mode text;                     -- Virement, Chèque, Espèce
alter table public.leases add column if not exists payment_day int;
alter table public.leases add column if not exists revision_date date;                    -- prochaine révision IRL
alter table public.leases add column if not exists irl_ref text;                          -- trimestre de référence
alter table public.leases add column if not exists comments text;                         -- consignes (ex. « appeler les parents »)

-- ---------- Encaissements : détail mensuel ----------
alter table public.rent_payments add column if not exists due numeric default 0;          -- loyer + charges dus ce mois
alter table public.rent_payments add column if not exists apl numeric default 0;          -- reçu CAF
alter table public.rent_payments add column if not exists tenant_paid numeric default 0;  -- reçu du locataire
alter table public.rent_payments add column if not exists mode text;
alter table public.rent_payments add column if not exists adjustment numeric default 0;   -- correction manuelle du solde (+ = dette en plus)
create unique index if not exists rent_payments_lease_month_uidx on public.rent_payments (lease_id, month);

-- ---------- Droits : patrimoine OU gestion locative ----------
drop policy if exists leases_all on public.leases;
create policy leases_all on public.leases for all to authenticated using (public.has_rental()) with check (public.has_rental());
drop policy if exists rent_payments_all on public.rent_payments;
create policy rent_payments_all on public.rent_payments for all to authenticated using (public.has_rental()) with check (public.has_rental());
alter table public.units enable row level security;
drop policy if exists units_all on public.units;
create policy units_all on public.units for all to authenticated using (public.has_rental()) with check (public.has_rental());

-- Biens : la gestion locative ne voit qu'une vue allégée (sans prix, valeur, financement)
create or replace view public.v_properties_rental with (security_invoker = false) as
  select id, name, status, invest_type, address, postal_code, city, surface, holding_name, created_at
  from public.properties where public.has_rental();
grant select on public.v_properties_rental to authenticated;

-- Documents des lots et baux accessibles à la gestion locative
create or replace function public.can_document(et text, eid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when et in ('leases','units') then public.has_rental()
    when et in ('properties','loans') then public.has_patrimony()
    when et = 'deals' then coalesce((select public.can_see_deal(d) from public.deals d where d.id = eid), public.my_role() = 'direction')
    when et = 'broker_profiles' then public.can_vivier()
    else auth.uid() is not null end
$$;
alter table public.documents drop constraint if exists documents_entity_type_check;
alter table public.documents add constraint documents_entity_type_check check (entity_type in ('properties','loans','leases','units','contacts','organisations','deals','broker_profiles'));

-- Stéphanie : accès gestion locative (adapter l'email si besoin)
-- update public.profiles set rental_access = true where lower(email) = 'stephanie@...';
