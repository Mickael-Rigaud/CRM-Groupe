-- =====================================================================
--  CRM Groupe — schéma Supabase (PostgreSQL)
--  À exécuter une seule fois dans : Supabase > SQL Editor > New query
--  Crée les tables, les droits (RLS) et la fonction d'entrée des leads.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Profils utilisateurs (1 ligne par compte Auth) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role text not null default 'commercial' check (role in ('direction','propulsion','commercial')),
  activities text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ---------- Organisations (clients, partenaires, banques…) ----------
create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Client',
  partner_job text, zone text,
  phone text, email text, address text, postal_code text, city text, siren text,
  activities text[] not null default '{}',
  owner_id uuid references public.profiles(id),
  last_contact_at timestamptz,
  notes text,
  -- abonnement Propulsion
  client_status text, account_manager_id uuid references public.profiles(id),
  offer text, monthly_amount numeric, commitment_months int, start_date date, renewal_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ---------- Contacts ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text, last_name text,
  phone text, email text, address text, postal_code text, city text,
  organisation_id uuid references public.organisations(id) on delete set null,
  type text not null default 'Prospect',
  activities text[] not null default '{}',
  owner_id uuid references public.profiles(id),
  channel text, campaign text,
  referrer_org_id uuid references public.organisations(id) on delete set null,
  referrer_contact_id uuid references public.contacts(id) on delete set null,
  consent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists contacts_email_idx on public.contacts (lower(email));
create index if not exists contacts_phone_idx on public.contacts (phone);

-- ---------- Affaires (opportunités) ----------
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  activity text not null check (activity in ('rgd','btp','courtage','propulsion')),
  stage text not null,
  status text not null default 'open' check (status in ('open','won','lost')),
  lost_reason text,
  contact_id uuid references public.contacts(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  owner_id uuid references public.profiles(id),
  amount numeric,
  channel text, campaign text,
  referrer_org_id uuid references public.organisations(id) on delete set null,
  referrer_contact_id uuid references public.contacts(id) on delete set null,
  fields jsonb not null default '{}'::jsonb,
  stage_history jsonb not null default '[]'::jsonb,
  stage_changed_at timestamptz not null default now(),
  won_at timestamptz, lost_at timestamptz, closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists deals_activity_status_idx on public.deals (activity, status);
create index if not exists deals_owner_idx on public.deals (owner_id);

-- ---------- Activités (tâches, RDV, appels…) ----------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  type text not null default 'appel',
  title text not null,
  due_date date, due_time text,
  done boolean not null default false, done_at timestamptz,
  assignee_id uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists activities_assignee_due_idx on public.activities (assignee_id, done, due_date);

-- ---------- Historique (notes, changements d'étape) ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  kind text not null default 'note',
  body text not null,
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Dépenses publicitaires (pour CPL, CAC, ROAS) ----------
create table if not exists public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  activity text not null,
  channel text not null,
  campaign text,
  month date not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ---------- Réglages (jeton d'entrée des leads…) ----------
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz
);

-- =====================================================================
--  Droits d'accès (Row Level Security)
--  direction  : tout
--  propulsion : tout ce qui touche à l'activité Propulsion + ce dont il est responsable
--  commercial : uniquement ce dont il est responsable
-- =====================================================================
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
  $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.can_see_deal(d public.deals) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'direction' then true
    when d.owner_id = auth.uid() then true
    when public.my_role() = 'propulsion' and d.activity = 'propulsion' then true
    else false end
$$;

alter table public.profiles      enable row level security;
alter table public.organisations enable row level security;
alter table public.contacts      enable row level security;
alter table public.deals         enable row level security;
alter table public.activities    enable row level security;
alter table public.events        enable row level security;
alter table public.ad_spend      enable row level security;
alter table public.settings      enable row level security;

-- Profils : lisibles par tous les connectés (pour afficher les noms), modifiables par la direction
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all to authenticated using (public.my_role() = 'direction') with check (public.my_role() = 'direction');

-- Organisations
drop policy if exists orgs_select on public.organisations;
create policy orgs_select on public.organisations for select to authenticated using (
  public.my_role() = 'direction' or owner_id = auth.uid() or account_manager_id = auth.uid()
  or (public.my_role() = 'propulsion' and 'propulsion' = any(activities))
  or exists (select 1 from public.deals d where (d.organisation_id = organisations.id or d.referrer_org_id = organisations.id) and public.can_see_deal(d))
);
drop policy if exists orgs_write on public.organisations;
create policy orgs_write on public.organisations for insert to authenticated with check (true);
drop policy if exists orgs_update on public.organisations;
create policy orgs_update on public.organisations for update to authenticated using (
  public.my_role() = 'direction' or owner_id = auth.uid() or account_manager_id = auth.uid() or (public.my_role() = 'propulsion' and 'propulsion' = any(activities))
);
drop policy if exists orgs_delete on public.organisations;
create policy orgs_delete on public.organisations for delete to authenticated using (public.my_role() = 'direction' or owner_id = auth.uid());

-- Contacts
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated using (
  public.my_role() = 'direction' or owner_id = auth.uid()
  or (public.my_role() = 'propulsion' and 'propulsion' = any(activities))
  or exists (select 1 from public.deals d where d.contact_id = contacts.id and public.can_see_deal(d))
);
drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert to authenticated with check (true);
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated using (
  public.my_role() = 'direction' or owner_id = auth.uid() or (public.my_role() = 'propulsion' and 'propulsion' = any(activities))
  or exists (select 1 from public.deals d where d.contact_id = contacts.id and public.can_see_deal(d))
);
drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated using (public.my_role() = 'direction' or owner_id = auth.uid());

-- Affaires
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals for select to authenticated using (public.can_see_deal(deals));
drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals for insert to authenticated with check (
  public.my_role() = 'direction' or owner_id = auth.uid() or (public.my_role() = 'propulsion' and activity = 'propulsion')
);
drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals for update to authenticated using (public.can_see_deal(deals));
drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals for delete to authenticated using (public.my_role() = 'direction' or owner_id = auth.uid());

-- Activités
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (
  public.my_role() = 'direction' or assignee_id = auth.uid()
  or exists (select 1 from public.deals d where d.id = activities.deal_id and public.can_see_deal(d))
  or (public.my_role() = 'propulsion' and (exists (select 1 from public.organisations o where o.id = activities.organisation_id and 'propulsion' = any(o.activities))
                                        or exists (select 1 from public.contacts c where c.id = activities.contact_id and 'propulsion' = any(c.activities))))
);
drop policy if exists activities_write on public.activities;
create policy activities_write on public.activities for insert to authenticated with check (true);
drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update to authenticated using (
  public.my_role() = 'direction' or assignee_id = auth.uid() or exists (select 1 from public.deals d where d.id = activities.deal_id and public.can_see_deal(d))
);
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete to authenticated using (public.my_role() = 'direction' or assignee_id = auth.uid());

-- Historique
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (
  public.my_role() = 'direction' or author_id = auth.uid()
  or exists (select 1 from public.deals d where d.id = events.deal_id and public.can_see_deal(d))
  or exists (select 1 from public.contacts c where c.id = events.contact_id and (c.owner_id = auth.uid() or (public.my_role() = 'propulsion' and 'propulsion' = any(c.activities))))
);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (true);
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated using (public.my_role() = 'direction' or author_id = auth.uid());

-- Dépenses pub et réglages : direction uniquement (lecture des réglages pour tous)
drop policy if exists ad_spend_all on public.ad_spend;
create policy ad_spend_all on public.ad_spend for all to authenticated using (public.my_role() = 'direction') with check (public.my_role() = 'direction');
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated using (public.my_role() = 'direction') with check (public.my_role() = 'direction');

-- =====================================================================
--  Création automatique du profil à l'inscription d'un compte Auth
--  (rôle "commercial" par défaut ; la direction ajuste ensuite dans la table profiles)
-- =====================================================================
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- =====================================================================
--  Entrée automatique des leads (formulaires de sites, Meta Lead Ads via Make)
--  Appel HTTP : POST https://<projet>.supabase.co/rest/v1/rpc/intake_lead
--  En-têtes : apikey: <clé anon>, Authorization: Bearer <clé anon>, Content-Type: application/json
--  Corps    : { "token": "<intake_token>", "activity": "rgd", "first_name": "...", "last_name": "...",
--               "phone": "...", "email": "...", "city": "...", "message": "...",
--               "channel": "Meta Ads", "campaign": "RGD-Renov-Sept26", "owner_email": "mickael@..." }
--  Crée (ou retrouve) le contact, crée l'affaire à l'étape "lead" et la tâche "Appeler le prospect" à J+1.
-- =====================================================================
create or replace function public.intake_lead(payload jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text; v_contact uuid; v_deal uuid; v_owner uuid; v_activity text; v_title text;
  v_phone text := nullif(trim(payload->>'phone'), ''); v_email text := nullif(lower(trim(payload->>'email')), '');
  v_default_owner uuid;
begin
  select value into v_token from public.settings where key = 'intake_token';
  if v_token is null or payload->>'token' is distinct from v_token then
    raise exception 'jeton invalide' using errcode = '28000';
  end if;
  v_activity := coalesce(payload->>'activity', 'rgd');
  if v_activity not in ('rgd','btp','courtage','propulsion') then raise exception 'activité inconnue'; end if;

  -- responsable : par email, sinon le premier profil "direction"
  select id into v_owner from public.profiles where lower(email) = lower(payload->>'owner_email') limit 1;
  if v_owner is null then select id into v_owner from public.profiles where role = 'direction' and active order by created_at limit 1; end if;

  -- contact existant (même email ou téléphone) ?
  select id into v_contact from public.contacts
   where (v_email is not null and lower(email) = v_email) or (v_phone is not null and regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
   limit 1;
  if v_contact is null then
    insert into public.contacts (first_name, last_name, phone, email, city, postal_code, address, type, activities, owner_id, channel, campaign, consent, notes)
    values (payload->>'first_name', coalesce(payload->>'last_name', payload->>'name', 'Inconnu'), v_phone, v_email, payload->>'city', payload->>'postal_code', payload->>'address',
            'Prospect', array[v_activity], v_owner, coalesce(payload->>'channel', 'Site internet direct'), payload->>'campaign', true, payload->>'message')
    returning id into v_contact;
  else
    update public.contacts set activities = (select array_agg(distinct x) from unnest(activities || array[v_activity]) x) where id = v_contact;
  end if;

  v_title := coalesce(payload->>'title', initcap(v_activity) || ' — ' || coalesce(payload->>'last_name', payload->>'name', v_email, v_phone, 'lead'));
  insert into public.deals (title, activity, stage, status, contact_id, owner_id, channel, campaign, fields, stage_history)
  values (v_title, v_activity, 'lead', 'open', v_contact, v_owner, coalesce(payload->>'channel', 'Site internet direct'), payload->>'campaign',
          coalesce(payload->'fields', '{}'::jsonb) || jsonb_build_object('message', payload->>'message'),
          jsonb_build_array(jsonb_build_object('stage', 'lead', 'at', now())))
  returning id into v_deal;

  insert into public.activities (deal_id, contact_id, type, title, due_date, assignee_id)
  values (v_deal, v_contact, 'appel', 'Appeler le prospect (lead entrant)', current_date + 1, v_owner);

  insert into public.events (deal_id, contact_id, kind, body, author_id)
  values (v_deal, v_contact, 'system', 'Lead créé automatiquement — ' || coalesce(payload->>'channel', 'site') || coalesce(' / ' || (payload->>'campaign'), ''), v_owner);

  return jsonb_build_object('ok', true, 'contact_id', v_contact, 'deal_id', v_deal);
end $$;
grant execute on function public.intake_lead(jsonb) to anon, authenticated;

-- Jeton initial (à changer depuis Paramètres > Entrée automatique des leads)
insert into public.settings (key, value) values ('intake_token', 'changez-moi-' || substr(md5(random()::text), 1, 16)) on conflict (key) do nothing;

-- =====================================================================
--  Vue pratique pour Claude / Make / Looker : affaires avec noms lisibles
-- =====================================================================
create or replace view public.v_deals as
  select d.id, d.title, d.activity, d.stage, d.status, d.lost_reason, d.amount, d.channel, d.campaign, d.created_at, d.won_at, d.lost_at, d.stage_changed_at,
         c.first_name || ' ' || c.last_name as contact, c.phone as contact_phone, c.email as contact_email,
         o.name as organisation, r.name as apporteur, p.full_name as responsable
  from public.deals d
  left join public.contacts c on c.id = d.contact_id
  left join public.organisations o on o.id = d.organisation_id
  left join public.organisations r on r.id = d.referrer_org_id
  left join public.profiles p on p.id = d.owner_id;
