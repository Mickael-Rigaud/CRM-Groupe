-- =====================================================================
--  Lot 12 — Messagerie interne
--
--  Deux formes de conversation, une seule table :
--   · les CANAUX, ouverts, un par structure plus un canal « Groupe ». On n'y
--     entre pas : on y a accès parce que la structure est inscrite sur son
--     profil (mêmes droits que les affaires et les pipelines), la direction
--     voit tout. Ils sont créés ici une fois pour toutes.
--   · les conversations PRIVÉES entre deux personnes, créées à la demande.
--     L'accès y est nominatif (table des membres).
--
--  À ne pas confondre avec la table `events` : celle-ci porte l'historique
--  d'un client ou d'une affaire (« appelé le 12, a rappelé le 14 ») et se
--  supprime avec la fiche. Ici, ce sont les échanges de l'équipe entre elle :
--  rien n'est rattaché à un contact, rien ne disparaît quand un client part.
--
--  Les pièces jointes (documents, photos) réutilisent la table `documents`
--  et le bucket privé du même nom, avec entity_type = 'messages'.
--
--  À exécuter dans Supabase > SQL Editor, après lot11-stats-structures.sql.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('canal', 'prive')),
  slug       text unique,        -- 'groupe', 'rgd', … pour les canaux ; null pour les privées
  activity   text check (activity in ('rgd', 'btp', 'courtage', 'propulsion')),
                                 -- null sur le canal « Groupe » : il n'appartient à personne
  title      text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint conversations_canal_slug check (kind <> 'canal' or slug is not null)
);

-- L'identifiant propre n'est pas de la décoration : le CRM adresse toutes ses
-- lignes par `id` (db.update, db.remove). Le couple reste unique.
create table if not exists public.conversation_members (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade,
  body            text,          -- peut être vide : un message qui ne porte qu'une photo
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);
create index if not exists idx_messages_conv on public.messages (conversation_id, created_at);

-- Où chacun en est de sa lecture. Une ligne par personne et par conversation ;
-- c'est ce qui fait la pastille « non lus » du menu.
create table if not exists public.message_reads (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  unique (conversation_id, user_id)
);

-- ---------- Les canaux, créés une fois ----------
insert into public.conversations (kind, slug, activity, title) values
  ('canal', 'groupe',     null,         'Groupe'),
  ('canal', 'rgd',        'rgd',        'RGD Renova'),
  ('canal', 'btp',        'btp',        'BTP Expertise'),
  ('canal', 'courtage',   'courtage',   'La Référence Courtage'),
  ('canal', 'propulsion', 'propulsion', 'Propulsion')
on conflict (slug) do nothing;

-- ---------- Droits ----------
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_reads        enable row level security;

-- Qui a accès à une conversation. En security definer : la fonction lit
-- `conversations` et `conversation_members` sans repasser par leurs propres
-- politiques, sinon la règle s'appellerait elle-même.
create or replace function public.can_see_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.kind = 'canal' and c.activity is null then auth.uid() is not null
      when c.kind = 'canal' then public.has_activity(c.activity)
      else exists (select 1 from public.conversation_members m
                   where m.conversation_id = c.id and m.user_id = auth.uid())
    end
    from public.conversations c where c.id = cid), false)
$$;

-- Le « ou créée par moi » n'est pas une faveur : sans lui, l'insertion d'une
-- conversation privée échouerait sur sa propre clause RETURNING, puisqu'à cet
-- instant précis elle n'a encore aucun membre.
drop policy if exists conversations_read on public.conversations;
create policy conversations_read on public.conversations for select to authenticated
  using (public.can_see_conversation(id) or (kind = 'prive' and created_by = auth.uid()));

-- On ne crée que des conversations privées : les canaux sont posés par ce script.
drop policy if exists conversations_new on public.conversations;
create policy conversations_new on public.conversations for insert to authenticated
  with check (kind = 'prive' and created_by = auth.uid());

drop policy if exists conversations_drop on public.conversations;
create policy conversations_drop on public.conversations for delete to authenticated
  using (kind = 'prive' and created_by = auth.uid());

-- Même raison : la toute première ligne insérée est la sienne, et à cet instant
-- la conversation n'a pas encore de membre pour justifier l'accès.
drop policy if exists members_read on public.conversation_members;
create policy members_read on public.conversation_members for select to authenticated
  using (user_id = auth.uid() or public.can_see_conversation(conversation_id));

-- Celui qui ouvre la conversation y met les deux participants ; ensuite il faut
-- déjà en être membre pour ajouter quelqu'un. Personne ne s'invite tout seul.
drop policy if exists members_add on public.conversation_members;
create policy members_add on public.conversation_members for insert to authenticated
  with check (
    public.can_see_conversation(conversation_id)
    or (select c.created_by from public.conversations c where c.id = conversation_id) = auth.uid()
  );

drop policy if exists members_leave on public.conversation_members;
create policy members_leave on public.conversation_members for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (public.can_see_conversation(conversation_id));

drop policy if exists messages_write on public.messages;
create policy messages_write on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_conversation(conversation_id));

-- On corrige et on supprime ce qu'on a écrit soi-même ; la direction peut faire le ménage.
drop policy if exists messages_edit on public.messages;
create policy messages_edit on public.messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists messages_drop on public.messages;
create policy messages_drop on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.my_role() = 'direction');

-- Sa propre position de lecture, et rien d'autre.
drop policy if exists reads_own on public.message_reads;
create policy reads_own on public.message_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Pièces jointes ----------
-- Une pièce jointe suit le message qui la porte : mêmes droits, et donc les
-- mêmes sur le fichier dans le bucket (le chemin est « messages/<id>/<nom> »).
create or replace function public.can_document(et text, eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when et = 'messages' then coalesce((select public.can_see_conversation(m.conversation_id)
                                        from public.messages m where m.id = eid), false)
    when et in ('leases','units') then public.has_rental()
    when et in ('properties','loans') then public.has_patrimony()
    when et = 'deals' then coalesce((select public.can_see_deal(d) from public.deals d where d.id = eid), public.my_role() = 'direction')
    when et = 'broker_profiles' then public.can_vivier()
    else auth.uid() is not null end
$$;

alter table public.documents drop constraint if exists documents_entity_type_check;
alter table public.documents add constraint documents_entity_type_check
  check (entity_type in ('properties','loans','leases','units','contacts','organisations','deals','broker_profiles','messages'));

-- Une pièce jointe n'a pas de raison de survivre à son message. `documents`
-- n'ayant pas de clé étrangère (elle sert à plusieurs tables), on nettoie ici.
create or replace function public.purge_documents_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.documents where entity_type = 'messages' and entity_id = old.id;
  return old;
end $$;

drop trigger if exists messages_purge_documents on public.messages;
create trigger messages_purge_documents after delete on public.messages
  for each row execute function public.purge_documents_message();
