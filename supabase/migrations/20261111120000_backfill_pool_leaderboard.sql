create or replace function public.apply_pool_competitive_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rating1 integer;
  v_rating2 integer;
  v_actual1 numeric;
  v_delta1 integer;
  v_delta2 integer;
begin
  if new.status not in ('finished', 'forfeited')
     or new.player1_id is null
     or new.player2_id is null
     or new.player1_id = new.player2_id then
    return new;
  end if;
  insert into public.pool_competitive_results(match_id, player1_id, player2_id, winner_id)
  values (new.id, new.player1_id, new.player2_id, new.winner_id)
  on conflict (match_id) do nothing;
  if not found then return new; end if;

  insert into public.pool_competitive_ratings(user_id)
  values (new.player1_id), (new.player2_id)
  on conflict (user_id) do nothing;
  perform 1 from public.pool_competitive_ratings
  where user_id in (new.player1_id, new.player2_id)
  order by user_id for update;
  select rating into v_rating1 from public.pool_competitive_ratings where user_id = new.player1_id;
  select rating into v_rating2 from public.pool_competitive_ratings where user_id = new.player2_id;

  v_actual1 := case
    when new.winner_id = new.player1_id then 1
    when new.winner_id = new.player2_id then 0
    else 0.5
  end;
  v_delta1 := round(32 * (v_actual1 - 1 / (1 + power(10::numeric, (v_rating2 - v_rating1)::numeric / 400))))::integer;
  v_delta2 := -v_delta1;

  update public.pool_competitive_ratings
  set rating = rating + v_delta1,
      peak_rating = greatest(peak_rating, rating + v_delta1),
      matches_played = matches_played + 1,
      wins = wins + case when v_actual1 = 1 then 1 else 0 end,
      losses = losses + case when v_actual1 = 0 then 1 else 0 end,
      draws = draws + case when v_actual1 = 0.5 then 1 else 0 end,
      updated_at = now()
  where user_id = new.player1_id;
  update public.pool_competitive_ratings
  set rating = rating + v_delta2,
      peak_rating = greatest(peak_rating, rating + v_delta2),
      matches_played = matches_played + 1,
      wins = wins + case when v_actual1 = 0 then 1 else 0 end,
      losses = losses + case when v_actual1 = 1 then 1 else 0 end,
      draws = draws + case when v_actual1 = 0.5 then 1 else 0 end,
      updated_at = now()
  where user_id = new.player2_id;
  return new;
end;
$$;

do $$
declare
  v_match record;
begin
  for v_match in
    select id, status
    from public.pool_matches
    where status in ('finished', 'forfeited')
    order by updated_at, id
  loop
    update public.pool_matches
    set status = v_match.status
    where id = v_match.id;
  end loop;
end;
$$;
