-- =====================================================================
--  Lot 3 — Différé total sur les prêts, statut « Résidence principale »,
--  documents (pièces jointes) sur les fiches.
--  À exécuter une seule fois dans Supabase > SQL Editor (après modules-lot2.sql).
-- =====================================================================

-- ---------- Prêts : type de différé, n° de crédit ----------
-- Nouvelle convention : duration_months = durée d'amortissement HORS différé ; le différé s'ajoute.
alter table public.loans add column if not exists deferral_type text not null default 'partial' check (deferral_type in ('partial','total'));
alter table public.loans add column if not exists loan_number text;

-- ---------- Documents ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('properties','loans','leases','contacts','organisations','deals','broker_profiles')),
  entity_id uuid not null,
  name text not null,
  mime text, size bigint,
  storage_path text not null unique,
  category text, notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index if not exists documents_entity_idx on public.documents (entity_type, entity_id);

-- Qui peut voir un document ? Patrimoine : profils direction avec patrimony_access ;
-- affaires : mêmes règles que l'affaire ; contacts / entreprises / vivier : tout utilisateur connecté.
create or replace function public.can_document(et text, eid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when et in ('properties','loans','leases') then public.has_patrimony()
    when et = 'deals' then coalesce((select public.can_see_deal(d) from public.deals d where d.id = eid), public.my_role() = 'direction')
    when et = 'broker_profiles' then public.can_vivier()
    else auth.uid() is not null end
$$;

alter table public.documents enable row level security;
drop policy if exists documents_all on public.documents;
create policy documents_all on public.documents for all to authenticated
  using (public.can_document(entity_type, entity_id)) with check (public.can_document(entity_type, entity_id));

-- ---------- Stockage : bucket privé « documents » ----------
insert into storage.buckets (id, name, public, file_size_limit)
  values ('documents', 'documents', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Le chemin d'un fichier est « <type>/<id>/<nom> » : on applique les mêmes droits que la table.
drop policy if exists documents_storage_select on storage.objects;
drop policy if exists documents_storage_insert on storage.objects;
drop policy if exists documents_storage_delete on storage.objects;
create policy documents_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_document(split_part(name, '/', 1), nullif(split_part(name, '/', 2), '')::uuid));
create policy documents_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.can_document(split_part(name, '/', 1), nullif(split_part(name, '/', 2), '')::uuid));
create policy documents_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_document(split_part(name, '/', 1), nullif(split_part(name, '/', 2), '')::uuid));
