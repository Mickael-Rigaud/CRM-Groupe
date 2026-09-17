-- =====================================================================
--  Lot 12 — Agenda du groupe : les rendez-vous Google recopiés dans le CRM
--
--  Pourquoi recopier plutôt que lire Google à chaque affichage : sans cette
--  table, chaque personne doit se connecter à Google et ne voit que les
--  calendriers partagés avec elle. En recopiant, tout le monde voit la même
--  journée, sans connexion Google, et le CRM peut trier, colorer et mélanger
--  ces rendez-vous avec ses propres tâches.
--
--  Sens de la copie : Google reste la référence. Cette table est un reflet,
--  jamais l'original — un rendez-vous se crée et se modifie dans Google.
--  Une synchronisation efface puis réécrit la journée concernée : ainsi un
--  rendez-vous annulé chez Google disparaît vraiment ici.
--
--  À faire passer par le dépôt CRM-Groupe-Backend (migration versionnée),
--  pas à exécuter à la main en production.
-- =====================================================================

create table if not exists public.agenda_events (
  -- Identifiant déterministe « <calendrier>|<id google> » : rejouer une
  -- synchronisation ne crée pas de doublon.
  id           text primary key,
  activity     text not null check (activity in ('rgd','btp','courtage','propulsion')),
  calendar_id  text not null,
  google_id    text not null,
  title        text,
  location     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  attendees    integer,
  link         text,
  -- Jour local du rendez-vous (Europe/Paris) : c'est par jour qu'on
  -- synchronise et qu'on affiche, l'index doit donc porter là-dessus.
  day          date not null,
  synced_at    timestamptz not null default now(),
  synced_by    uuid references public.profiles(id)
);

create index if not exists agenda_events_day_idx on public.agenda_events (day, starts_at);
create index if not exists agenda_events_activity_idx on public.agenda_events (activity, day);

alter table public.agenda_events enable row level security;

-- Lecture : direction voit tout ; chacun voit les structures inscrites dans son
-- profil. Mêmes règles que le reste du CRM, et miroir de scope.js côté client.
drop policy if exists agenda_read on public.agenda_events;
create policy agenda_read on public.agenda_events for select to authenticated using (
  public.my_role() = 'direction'
  or activity = any (coalesce((select activities from public.profiles where id = auth.uid()), '{}'))
);

-- Écriture : direction seulement. C'est le poste qui tient les agendas Google
-- et qui alimente la table ; personne d'autre n'a à y écrire.
drop policy if exists agenda_write on public.agenda_events;
create policy agenda_write on public.agenda_events for all to authenticated
  using (public.my_role() = 'direction') with check (public.my_role() = 'direction');

-- =====================================================================
--  Remplacement d'une journée, en une seule opération
--
--  Le CRM lit les agendas Google du jour, puis appelle cette fonction avec
--  ce qu'il a trouvé. Effacer d'abord, réécrire ensuite, dans la même
--  transaction : un rendez-vous supprimé chez Google disparaît, et l'écran
--  ne peut jamais tomber sur une journée à moitié réécrite.
--
--  Seuls les calendriers passés en argument sont touchés : synchroniser RGD
--  n'efface pas les rendez-vous BTP du même jour.
-- =====================================================================
create or replace function public.remplacer_agenda(
  p_jour date, p_calendriers text[], p_evenements jsonb
) returns integer
language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  if public.my_role() is distinct from 'direction' then
    raise exception 'réservé à la direction' using errcode = '42501';
  end if;

  delete from public.agenda_events
   where day = p_jour and calendar_id = any (p_calendriers);

  insert into public.agenda_events
    (id, activity, calendar_id, google_id, title, location,
     starts_at, ends_at, all_day, attendees, link, day, synced_by)
  select e->>'id', e->>'activity', e->>'calendar_id', e->>'google_id',
         nullif(e->>'title',''), nullif(e->>'location',''),
         (e->>'starts_at')::timestamptz, nullif(e->>'ends_at','')::timestamptz,
         coalesce((e->>'all_day')::boolean, false),
         nullif(e->>'attendees','')::integer, nullif(e->>'link',''),
         p_jour, auth.uid()
    from jsonb_array_elements(coalesce(p_evenements, '[]'::jsonb)) as e
  on conflict (id) do update
    set title = excluded.title, location = excluded.location,
        starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        all_day = excluded.all_day, attendees = excluded.attendees,
        link = excluded.link, synced_at = now(), synced_by = auth.uid();

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.remplacer_agenda(date, text[], jsonb) from public;
grant execute on function public.remplacer_agenda(date, text[], jsonb) to authenticated;

-- Ménage : au-delà de deux mois, un rendez-vous passé n'intéresse plus personne
-- et la table n'a pas vocation à devenir un historique.
create or replace function public.purger_agenda() returns integer
language sql security definer set search_path = public as $$
  with supprimes as (
    delete from public.agenda_events where day < current_date - interval '60 days' returning 1
  ) select count(*)::integer from supprimes;
$$;
