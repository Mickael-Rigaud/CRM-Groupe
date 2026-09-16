-- =====================================================================
--  Lot 11 — Chiffres poussés par les outils externes (tableau de bord RGD Renova)
--
--  Le tableau de bord RGD Renova vit en dehors du CRM, avec ses propres
--  connexions (Costructor, NAS Ugreen, Meta Ads). On n'y touche pas : il dépose
--  simplement quelques chiffres ici, et la vue d'ensemble du CRM les affiche.
--
--  Sens unique, écriture seule, aucune lecture des données du CRM : si l'appel
--  échoue, rien ne casse — la vue d'ensemble retombe sur ses propres calculs.
--
--  À exécuter dans Supabase > SQL Editor, après lot10-mails-ref.sql.
-- =====================================================================

create table if not exists public.structure_stats (
  activity   text primary key check (activity in ('rgd','btp','courtage','propulsion')),
  prospects  integer,                      -- null = « non renseigné », affiché tel quel
  revenue    jsonb not null default '[]',  -- [{"month":"2026-09","amount":12000,"deals":3}, …]
                                           -- CA HT signé par mois ; « deals » (facultatif) = nombre
                                           -- d'affaires signées, seul moyen d'afficher le panier moyen
  source     text,                         -- d'où vient le chiffre, pour l'afficher au survol
  updated_at timestamptz not null default now()
);

alter table public.structure_stats enable row level security;

-- Lecture pour tout utilisateur connecté ; l'écriture passe uniquement par la
-- fonction ci-dessous, protégée par le jeton — jamais par la clé publique.
drop policy if exists stats_read on public.structure_stats;
create policy stats_read on public.structure_stats for select to authenticated using (true);
drop policy if exists stats_write on public.structure_stats;
create policy stats_write on public.structure_stats for all to authenticated
  using (public.my_role() = 'direction') with check (public.my_role() = 'direction');

-- Jeton dédié : ni celui des leads, ni une clé Supabase. Le régénérer ici le
-- révoque immédiatement côté outil externe.
insert into public.settings (key, value)
  values ('stats_token', 'changez-moi-' || substr(md5(random()::text), 1, 16))
  on conflict (key) do nothing;

-- =====================================================================
--  Appel depuis le tableau de bord RGD Renova
--    POST https://<projet>.supabase.co/rest/v1/rpc/push_structure_stats
--    En-têtes : apikey: <clé anon>, Authorization: Bearer <clé anon>,
--               Content-Type: application/json
--    Corps    : { "token": "<stats_token>", "activity": "rgd",
--                 "prospects": 42,
--                 "revenue": [{"month":"2026-08","amount":18400,"deals":2},
--                             {"month":"2026-09","amount":25600,"deals":3}],
--                 "source": "Tableau de bord RGD Renova" }
--
--  « revenue » remplace l'historique envoyé précédemment : envoyer les douze
--  derniers mois à chaque fois, c'est le plus simple et ça se répare tout seul.
--  « deals » est facultatif ; sans lui la colonne « Panier moyen » affiche « — »
--  plutôt que de diviser un CA externe par un nombre d'affaires interne.
-- =====================================================================
create or replace function public.push_structure_stats(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token text; v_activity text;
begin
  select value into v_token from public.settings where key = 'stats_token';
  if v_token is null or payload->>'token' is distinct from v_token then
    raise exception 'jeton invalide' using errcode = '28000';
  end if;

  v_activity := payload->>'activity';
  if v_activity not in ('rgd','btp','courtage','propulsion') then
    raise exception 'activité inconnue : %', coalesce(v_activity, 'null');
  end if;

  insert into public.structure_stats (activity, prospects, revenue, source, updated_at)
  values (v_activity,
          nullif(payload->>'prospects', '')::integer,
          coalesce(payload->'revenue', '[]'::jsonb),
          nullif(payload->>'source', ''),
          now())
  on conflict (activity) do update
    set prospects  = excluded.prospects,
        revenue    = excluded.revenue,
        source     = coalesce(excluded.source, public.structure_stats.source),
        updated_at = now();

  return jsonb_build_object('ok', true, 'activity', v_activity);
end $$;

revoke all on function public.push_structure_stats(jsonb) from public;
grant execute on function public.push_structure_stats(jsonb) to anon, authenticated;
