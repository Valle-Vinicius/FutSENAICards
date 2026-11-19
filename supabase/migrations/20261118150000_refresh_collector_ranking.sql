create or replace function public.refresh_collector_ranking()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_cards_count integer;
  v_squad_overall integer;
  v_rare_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select coalesce(nullif(profile.name, ''), 'Jogador')
    into v_name
    from public.profiles as profile
    where profile.id = v_user_id;

  v_name := coalesce(v_name, 'Jogador');

  select
    count(*)::integer,
    coalesce(round(avg(card.overall)), 0)::integer,
    count(*) filter (
      where card.rarity in ('rare', 'epic', 'legendary', 'icon', 'secret')
    )::integer
    into v_cards_count, v_squad_overall, v_rare_count
    from public.cards as card
    where card.user_id = v_user_id;

  insert into public.leaderboard (
    user_id,
    name,
    cards_count,
    squad_overall,
    rare_count,
    updated_at
  )
  values (
    v_user_id,
    v_name,
    v_cards_count,
    v_squad_overall,
    v_rare_count,
    now()
  )
  on conflict (user_id) do update
  set
    name = excluded.name,
    cards_count = excluded.cards_count,
    squad_overall = excluded.squad_overall,
    rare_count = excluded.rare_count,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.refresh_collector_ranking() from public, anon;
grant execute on function public.refresh_collector_ranking() to authenticated;
