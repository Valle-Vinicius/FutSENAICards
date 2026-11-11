create or replace function public.discover_addable_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select profile.id, coalesce(profile.name, 'Jogador'), profile.avatar_url, profile.last_seen
  from public.profiles profile
  where auth.uid() is not null
    and profile.id <> auth.uid()
    and (
      nullif(btrim(p_search), '') is null
      or profile.name ilike '%' || btrim(p_search) || '%'
    )
    and not exists (
      select 1
      from public.friendships friendship
      where friendship.status in ('pending', 'accepted')
        and (
          (friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id)
          or (friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id)
        )
    )
  order by lower(coalesce(profile.name, 'Jogador')), profile.id
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.discover_addable_users(text, integer, integer) from public, anon;
grant execute on function public.discover_addable_users(text, integer, integer) to authenticated;

create or replace function public.get_visible_friend_profiles()
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select profile.id, coalesce(profile.name, 'Jogador'), profile.avatar_url, profile.last_seen
  from public.profiles profile
  where auth.uid() is not null
    and (
      profile.id = auth.uid()
      or exists (
        select 1
        from public.friendships friendship
        where friendship.status in ('pending', 'accepted')
          and (
            (friendship.requester_id = auth.uid() and friendship.addressee_id = profile.id)
            or (friendship.addressee_id = auth.uid() and friendship.requester_id = profile.id)
          )
      )
    )
  order by lower(coalesce(profile.name, 'Jogador')), profile.id;
$$;

revoke all on function public.get_visible_friend_profiles() from public, anon;
grant execute on function public.get_visible_friend_profiles() to authenticated;

create or replace function public.apply_competitive_challenge_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config public.competitive_config%rowtype;
  v_user_id uuid;
  v_home_rating integer;
  v_away_rating integer;
  v_home_score numeric;
  v_rating_delta integer;
  v_home_after integer;
  v_away_after integer;
  v_existing_events integer;
  v_home_result text;
  v_away_result text;
  v_winner_side text;
begin
  if old.status is distinct from 'accepted' or new.status <> 'completed' then
    raise exception 'Competitive result must transition from an accepted challenge';
  end if;
  if new.challenger_id is null
     or new.challenged_id is null
     or new.challenger_id = new.challenged_id
     or not new.challenger_ready
     or not new.challenged_ready
     or new.home_snapshot is null
     or new.away_snapshot is null
     or new.result is null
     or new.home_score is null
     or new.away_score is null then
    raise exception 'Competitive result is missing eligible participants, snapshots, or scores';
  end if;
  if new.result #>> '{config,mode}' is distinct from 'pvp' then
    raise exception 'Only server-simulated PvP results are eligible for competitive rating';
  end if;
  if jsonb_typeof(new.home_snapshot -> 'cards') is distinct from 'array'
     or jsonb_typeof(new.away_snapshot -> 'cards') is distinct from 'array'
     or jsonb_array_length(new.home_snapshot -> 'cards') <> 5
     or jsonb_array_length(new.away_snapshot -> 'cards') <> 5 then
    raise exception 'Competitive result contains an invalid frozen lineup';
  end if;
  if (new.result ->> 'homeScore')::integer is distinct from new.home_score
     or (new.result ->> 'awayScore')::integer is distinct from new.away_score then
    raise exception 'Competitive result score does not match the official challenge score';
  end if;

  if new.home_score = new.away_score then
    v_winner_side := new.result ->> 'winnerSide';
    if v_winner_side is null
       or v_winner_side not in ('home', 'away')
       or jsonb_typeof(new.result -> 'penalties') is distinct from 'object'
       or new.result #>> '{penalties,winnerSide}' is distinct from v_winner_side
       or nullif(new.result #>> '{penalties,homeScore}', '') is null
       or nullif(new.result #>> '{penalties,awayScore}', '') is null
       or (new.result #>> '{penalties,homeScore}')::integer = (new.result #>> '{penalties,awayScore}')::integer then
      raise exception 'A tied PvP score must have a decisive penalty shootout';
    end if;
    v_home_score := case when v_winner_side = 'home' then 1 else 0 end;
  else
    v_home_score := case when new.home_score > new.away_score then 1 else 0 end;
  end if;

  select * into v_config
  from public.competitive_config
  where id = true;
  if not found or v_config.k_factor <= 0 or v_config.initial_rating <= 0 then
    raise exception 'Competitive rating configuration is unavailable or invalid';
  end if;

  select count(*) into v_existing_events
  from public.competitive_rating_events
  where challenge_id = new.id;
  if v_existing_events <> 0 then
    raise exception 'Competitive rating events already exist for challenge %', new.id;
  end if;

  for v_user_id in
    select participant from unnest(array[new.challenger_id, new.challenged_id]) as participant order by participant
  loop
    insert into public.player_competitive_ratings (user_id, rating, peak_rating)
    values (v_user_id, v_config.initial_rating, v_config.initial_rating)
    on conflict (user_id) do nothing;
  end loop;

  for v_user_id in
    select participant from unnest(array[new.challenger_id, new.challenged_id]) as participant order by participant
  loop
    perform 1 from public.player_competitive_ratings where user_id = v_user_id for update;
  end loop;

  select rating into v_home_rating
  from public.player_competitive_ratings where user_id = new.challenger_id;
  select rating into v_away_rating
  from public.player_competitive_ratings where user_id = new.challenged_id;

  v_rating_delta := public.competitive_calculate_rating_delta(
    v_home_rating, v_away_rating, v_home_score, v_config.k_factor
  );
  v_home_after := v_home_rating + v_rating_delta;
  v_away_after := v_away_rating - v_rating_delta;

  if v_home_score = 1 then
    v_home_result := 'win';
    v_away_result := 'loss';
  else
    v_home_result := 'loss';
    v_away_result := 'win';
  end if;

  update public.player_competitive_ratings
  set rating = v_home_after,
      peak_rating = greatest(peak_rating, v_home_after),
      matches_played = matches_played + 1,
      wins = wins + case when v_home_result = 'win' then 1 else 0 end,
      losses = losses + case when v_home_result = 'loss' then 1 else 0 end,
      current_streak = case
        when v_home_result = 'win' then greatest(current_streak, 0) + 1
        else least(current_streak, 0) - 1
      end,
      best_win_streak = case
        when v_home_result = 'win' then greatest(best_win_streak, greatest(current_streak, 0) + 1)
        else best_win_streak
      end,
      last_match_at = new.updated_at,
      updated_at = now()
  where user_id = new.challenger_id;

  update public.player_competitive_ratings
  set rating = v_away_after,
      peak_rating = greatest(peak_rating, v_away_after),
      matches_played = matches_played + 1,
      wins = wins + case when v_away_result = 'win' then 1 else 0 end,
      losses = losses + case when v_away_result = 'loss' then 1 else 0 end,
      current_streak = case
        when v_away_result = 'win' then greatest(current_streak, 0) + 1
        else least(current_streak, 0) - 1
      end,
      best_win_streak = case
        when v_away_result = 'win' then greatest(best_win_streak, greatest(current_streak, 0) + 1)
        else best_win_streak
      end,
      last_match_at = new.updated_at,
      updated_at = now()
  where user_id = new.challenged_id;

  insert into public.competitive_rating_events (
    challenge_id, user_id, opponent_id, rating_before, rating_after,
    rating_change, result, algorithm_version
  )
  values
    (new.id, new.challenger_id, new.challenged_id, v_home_rating, v_home_after,
      v_rating_delta, v_home_result, v_config.algorithm_version),
    (new.id, new.challenged_id, new.challenger_id, v_away_rating, v_away_after,
      -v_rating_delta, v_away_result, v_config.algorithm_version);
  return new;
end;
$$;

create or replace function public.settle_challenge_wager()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_winner_id uuid;
  v_result text;
  v_escrow public.challenge_wager_escrow%rowtype;
  v_total_coins integer;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if new.wager_type is null then return new; end if;

  if new.home_score > new.away_score then
    v_winner_id := new.challenger_id;
  elsif new.away_score > new.home_score then
    v_winner_id := new.challenged_id;
  elsif new.result ->> 'winnerSide' = 'home' then
    v_winner_id := new.challenger_id;
  elsif new.result ->> 'winnerSide' = 'away' then
    v_winner_id := new.challenged_id;
  else
    v_winner_id := null;
  end if;
  v_result := case when v_winner_id is null then 'draw' else 'win' end;

  insert into public.challenge_wager_results(challenge_id, winner_id, result)
  values (new.id, v_winner_id, v_result)
  on conflict (challenge_id) do nothing;
  if not found then return new; end if;

  if not exists (
    select 1 from public.challenge_wager_escrow
    where challenge_id = new.id and status = 'held'
    having count(*) = 2
  ) then
    raise exception 'Both challenge wagers must be held before settlement';
  end if;

  if new.wager_type = 'coins' then
    select coalesce(sum(coins), 0) into v_total_coins
    from public.challenge_wager_escrow
    where challenge_id = new.id and status = 'held';
    if v_winner_id is null then
      for v_escrow in select * from public.challenge_wager_escrow where challenge_id = new.id and status = 'held'
      loop
        update public.profiles set coins = coins + v_escrow.coins where id = v_escrow.user_id;
      end loop;
    else
      update public.profiles set coins = coins + v_total_coins where id = v_winner_id;
    end if;
    update public.challenge_wager_escrow set status = case when v_winner_id is null then 'refunded' else 'settled' end
    where challenge_id = new.id and status = 'held';
  elsif v_winner_id is null then
    update public.challenge_wager_escrow set status = 'refunded'
    where challenge_id = new.id and status = 'held';
  else
    update public.challenge_wager_escrow set status = 'settled'
    where challenge_id = new.id and status = 'held';
    update public.cards card
    set user_id = v_winner_id
    from public.challenge_wager_escrow escrow
    where escrow.challenge_id = new.id
      and escrow.user_id <> v_winner_id
      and escrow.card_id = card.id;
  end if;
  return new;
end;
$$;

create or replace function public.competitive_get_head_to_head(
  p_user_id uuid,
  p_opponent_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := p_user_id;
  v_total integer;
  v_wins integer;
  v_losses integer;
  v_draws integer;
  v_last_match_at timestamptz;
  v_matches jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_user_id is null or p_opponent_id is null or p_opponent_id = v_user_id then
    raise exception 'A different opponent ID is required';
  end if;

  with pair_matches as (
    select challenge.id,
      coalesce(challenge.completed_at, challenge.updated_at) as updated_at,
      case
        when challenge.result ->> 'winnerSide' = 'home' then challenge.challenger_id
        when challenge.result ->> 'winnerSide' = 'away' then challenge.challenged_id
        when challenge.home_score > challenge.away_score then challenge.challenger_id
        when challenge.away_score > challenge.home_score then challenge.challenged_id
        else null
      end as winner_id
    from public.challenges challenge
    where challenge.status = 'completed'
      and challenge.result is not null
      and challenge.result #>> '{config,mode}' = 'pvp'
      and challenge.challenger_ready
      and challenge.challenged_ready
      and challenge.home_snapshot is not null
      and challenge.away_snapshot is not null
      and challenge.home_score is not null
      and challenge.away_score is not null
      and challenge.result ->> 'homeScore' = challenge.home_score::text
      and challenge.result ->> 'awayScore' = challenge.away_score::text
      and (
        (challenge.challenger_id = v_user_id and challenge.challenged_id = p_opponent_id)
        or (challenge.challenger_id = p_opponent_id and challenge.challenged_id = v_user_id)
      )
  )
  select count(*)::integer,
    count(*) filter (where winner_id = v_user_id)::integer,
    count(*) filter (where winner_id = p_opponent_id)::integer,
    count(*) filter (where winner_id is null)::integer,
    max(updated_at)
  into v_total, v_wins, v_losses, v_draws, v_last_match_at
  from pair_matches;

  select coalesce(jsonb_agg(to_jsonb(page_match) order by page_match.updated_at desc, page_match.challenge_id), '[]'::jsonb)
  into v_matches
  from (
    select challenge.id as challenge_id,
      case when challenge.challenger_id = v_user_id then challenge.home_score else challenge.away_score end as user_score,
      case when challenge.challenger_id = v_user_id then challenge.away_score else challenge.home_score end as opponent_score,
      case
        when (
          case
            when challenge.result ->> 'winnerSide' = 'home' then challenge.challenger_id
            when challenge.result ->> 'winnerSide' = 'away' then challenge.challenged_id
            when challenge.home_score > challenge.away_score then challenge.challenger_id
            when challenge.away_score > challenge.home_score then challenge.challenged_id
            else null
          end
        ) = v_user_id then 'win'
        when (
          case
            when challenge.result ->> 'winnerSide' = 'home' then challenge.challenger_id
            when challenge.result ->> 'winnerSide' = 'away' then challenge.challenged_id
            when challenge.home_score > challenge.away_score then challenge.challenger_id
            when challenge.away_score > challenge.home_score then challenge.challenged_id
            else null
          end
        ) = p_opponent_id then 'loss'
        else 'draw'
      end as result,
      coalesce(challenge.completed_at, challenge.updated_at) as updated_at
    from public.challenges challenge
    where challenge.status = 'completed'
      and challenge.result is not null
      and challenge.result #>> '{config,mode}' = 'pvp'
      and challenge.challenger_ready
      and challenge.challenged_ready
      and challenge.home_snapshot is not null
      and challenge.away_snapshot is not null
      and challenge.home_score is not null
      and challenge.away_score is not null
      and challenge.result ->> 'homeScore' = challenge.home_score::text
      and challenge.result ->> 'awayScore' = challenge.away_score::text
      and (
        (challenge.challenger_id = v_user_id and challenge.challenged_id = p_opponent_id)
        or (challenge.challenger_id = p_opponent_id and challenge.challenged_id = v_user_id)
      )
    order by coalesce(challenge.completed_at, challenge.updated_at) desc, challenge.id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(coalesce(p_offset, 0), 0)
  ) page_match;

  return jsonb_build_object(
    'historyType', 'historical_pvp',
    'userId', v_user_id,
    'opponentId', p_opponent_id,
    'totalMatches', coalesce(v_total, 0),
    'userWins', coalesce(v_wins, 0),
    'opponentWins', coalesce(v_losses, 0),
    'draws', coalesce(v_draws, 0),
    'lastMatchAt', v_last_match_at,
    'matches', v_matches
  );
end;
$$;

revoke all on function public.apply_competitive_challenge_result() from public, anon, authenticated;
revoke all on function public.settle_challenge_wager() from public, anon, authenticated;
