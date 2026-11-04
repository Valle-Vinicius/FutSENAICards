create table if not exists public.competitive_config (
  id boolean primary key default true check (id),
  initial_rating integer not null check (initial_rating > 0),
  k_factor integer not null check (k_factor > 0),
  algorithm_version text not null,
  division_thresholds jsonb not null
    check (jsonb_typeof(division_thresholds) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.competitive_config (
  id,
  initial_rating,
  k_factor,
  algorithm_version,
  division_thresholds
)
values (
  true,
  1000,
  32,
  'elo-v1',
  '{"Bronze":1000,"Prata":1200,"Ouro":1400,"Platina":1600,"Diamante":1800,"Elite":2000,"Lendário":2200}'::jsonb
)
on conflict (id) do nothing;

create table if not exists public.player_competitive_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating integer not null default 1000,
  peak_rating integer not null default 1000,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  current_streak integer not null default 0,
  best_win_streak integer not null default 0,
  last_match_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_competitive_ratings_nonnegative_stats
    check (matches_played >= 0 and wins >= 0 and losses >= 0 and draws >= 0 and best_win_streak >= 0)
);

create table if not exists public.competitive_rating_events (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid not null references auth.users(id) on delete cascade,
  rating_before integer not null,
  rating_after integer not null,
  rating_change integer not null,
  result text not null check (result in ('win', 'loss', 'draw')),
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  constraint competitive_rating_events_distinct_players check (user_id <> opponent_id),
  constraint competitive_rating_events_rating_delta
    check (rating_after - rating_before = rating_change),
  constraint competitive_rating_events_challenge_user_key unique (challenge_id, user_id)
);

alter table public.competitive_config enable row level security;
alter table public.player_competitive_ratings enable row level security;
alter table public.competitive_rating_events enable row level security;

revoke all on public.competitive_config from public, anon, authenticated;
revoke all on public.player_competitive_ratings from public, anon, authenticated;
revoke all on public.competitive_rating_events from public, anon, authenticated;

create index if not exists player_competitive_ratings_ranking_idx
  on public.player_competitive_ratings (rating desc, user_id)
  where matches_played > 0;

create index if not exists competitive_rating_events_user_created_idx
  on public.competitive_rating_events (user_id, created_at desc, id desc);

create index if not exists competitive_rating_events_challenge_idx
  on public.competitive_rating_events (challenge_id);

alter table public.challenges
  add column if not exists completed_at timestamptz;

create index if not exists challenges_competitive_h2h_idx
  on public.challenges (challenger_id, challenged_id, (coalesce(completed_at, updated_at)) desc)
  where status = 'completed';

create index if not exists challenges_competitive_h2h_reverse_idx
  on public.challenges (challenged_id, challenger_id, (coalesce(completed_at, updated_at)) desc)
  where status = 'completed';

create index if not exists profiles_competitive_name_prefix_idx
  on public.profiles (lower(name) text_pattern_ops);

create or replace function public.competitive_division_for_rating(p_rating integer)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select division.key
    from public.competitive_config config
    cross join lateral jsonb_each_text(config.division_thresholds) as division(key, value)
    where config.id = true
      and division.value::integer <= p_rating
    order by division.value::integer desc
    limit 1
  ), 'Bronze');
$$;

create or replace function public.competitive_calculate_rating_delta(
  p_home_rating integer,
  p_away_rating integer,
  p_home_score numeric,
  p_k_factor integer
)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select round(
    p_k_factor * (
      p_home_score
      - 1 / (1 + power(10::numeric, (p_away_rating - p_home_rating)::numeric / 400))
    )
  )::integer;
$$;

create or replace function public.set_challenge_ready(
  p_challenge_id uuid,
  p_tactic text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge public.challenges%rowtype;
  v_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_tactic is null or p_tactic not in ('balanced', 'possession', 'highpress', 'counter', 'compact') then
    raise exception 'Unsupported tactic';
  end if;

  select *
  into v_challenge
  from public.challenges
  where id = p_challenge_id
    and status = 'accepted'
    and (challenger_id = auth.uid() or challenged_id = auth.uid())
  for update;

  if not found then
    return false;
  end if;

  if auth.uid() = v_challenge.challenger_id then
    if v_challenge.challenger_ready then
      if v_challenge.home_snapshot is null then
        raise exception 'Ready challenger is missing its frozen snapshot';
      end if;
      return true;
    end if;
    v_snapshot := public.build_challenge_team_snapshot(v_challenge.challenger_id);
    if v_challenge.challenged_ready and v_challenge.away_snapshot is null then
      raise exception 'Ready challenged player is missing its frozen snapshot';
    end if;
    update public.challenges
    set challenger_ready = true,
        challenger_tactic = p_tactic,
        home_snapshot = v_snapshot,
        updated_at = now()
    where id = p_challenge_id;
  else
    if v_challenge.challenged_ready then
      if v_challenge.away_snapshot is null then
        raise exception 'Ready challenged player is missing its frozen snapshot';
      end if;
      return true;
    end if;
    v_snapshot := public.build_challenge_team_snapshot(v_challenge.challenged_id);
    if v_challenge.challenger_ready and v_challenge.home_snapshot is null then
      raise exception 'Ready challenger is missing its frozen snapshot';
    end if;
    update public.challenges
    set challenged_ready = true,
        challenged_tactic = p_tactic,
        away_snapshot = v_snapshot,
        updated_at = now()
    where id = p_challenge_id;
  end if;

  return true;
end;
$$;

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

  select *
  into v_config
  from public.competitive_config
  where id = true;
  if not found or v_config.k_factor <= 0 or v_config.initial_rating <= 0 then
    raise exception 'Competitive rating configuration is unavailable or invalid';
  end if;

  select count(*)
  into v_existing_events
  from public.competitive_rating_events
  where challenge_id = new.id;
  if v_existing_events <> 0 then
    raise exception 'Competitive rating events already exist for challenge %', new.id;
  end if;

  for v_user_id in
    select participant
    from unnest(array[new.challenger_id, new.challenged_id]) as participant
    order by participant
  loop
    insert into public.player_competitive_ratings (user_id, rating, peak_rating)
    values (v_user_id, v_config.initial_rating, v_config.initial_rating)
    on conflict (user_id) do nothing;
  end loop;

  for v_user_id in
    select participant
    from unnest(array[new.challenger_id, new.challenged_id]) as participant
    order by participant
  loop
    perform 1
    from public.player_competitive_ratings
    where user_id = v_user_id
    for update;
  end loop;

  select rating
  into v_home_rating
  from public.player_competitive_ratings
  where user_id = new.challenger_id;
  select rating
  into v_away_rating
  from public.player_competitive_ratings
  where user_id = new.challenged_id;

  v_home_score := case
    when new.home_score > new.away_score then 1
    when new.home_score = new.away_score then 0.5
    else 0
  end;
  v_rating_delta := public.competitive_calculate_rating_delta(
    v_home_rating,
    v_away_rating,
    v_home_score,
    v_config.k_factor
  );
  v_home_after := v_home_rating + v_rating_delta;
  v_away_after := v_away_rating - v_rating_delta;

  if new.home_score > new.away_score then
    v_home_result := 'win';
    v_away_result := 'loss';
  elsif new.home_score < new.away_score then
    v_home_result := 'loss';
    v_away_result := 'win';
  else
    v_home_result := 'draw';
    v_away_result := 'draw';
  end if;

  update public.player_competitive_ratings
  set rating = v_home_after,
      peak_rating = greatest(peak_rating, v_home_after),
      matches_played = matches_played + 1,
      wins = wins + case when v_home_result = 'win' then 1 else 0 end,
      losses = losses + case when v_home_result = 'loss' then 1 else 0 end,
      draws = draws + case when v_home_result = 'draw' then 1 else 0 end,
      current_streak = case
        when v_home_result = 'win' then greatest(current_streak, 0) + 1
        when v_home_result = 'loss' then least(current_streak, 0) - 1
        else 0
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
      draws = draws + case when v_away_result = 'draw' then 1 else 0 end,
      current_streak = case
        when v_away_result = 'win' then greatest(current_streak, 0) + 1
        when v_away_result = 'loss' then least(current_streak, 0) - 1
        else 0
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

create or replace function public.set_challenge_completed_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from 'completed' and new.status = 'completed' then
    new.completed_at := coalesce(old.completed_at, clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function public.set_challenge_completed_at() from public, anon, authenticated;

drop trigger if exists challenges_set_completed_at on public.challenges;
create trigger challenges_set_completed_at
  before update of status on public.challenges
  for each row
  when (old.status is distinct from new.status and new.status = 'completed')
  execute function public.set_challenge_completed_at();

drop trigger if exists challenges_apply_competitive_result on public.challenges;
create trigger challenges_apply_competitive_result
  after update of status on public.challenges
  for each row
  when (old.status is distinct from new.status and new.status = 'completed')
  execute function public.apply_competitive_challenge_result();

create or replace function public.competitive_list_players(
  p_limit integer default 20,
  p_offset integer default 0,
  p_division text default null,
  p_search text default null
)
returns table (
  "position" bigint,
  user_id uuid,
  name text,
  avatar_url text,
  rating integer,
  peak_rating integer,
  matches_played integer,
  wins integer,
  losses integer,
  draws integer,
  division text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  with ranked as (
    select
      row_number() over (order by ratings.rating desc, ratings.user_id) as rank_position,
      ratings.user_id as ranked_user_id,
      coalesce(profile.name, 'Jogador') as display_name,
      profile.avatar_url as display_avatar,
      ratings.rating as current_rating,
      ratings.peak_rating as highest_rating,
      ratings.matches_played as played,
      ratings.wins as won,
      ratings.losses as lost,
      ratings.draws as tied,
      public.competitive_division_for_rating(ratings.rating) as current_division
    from public.player_competitive_ratings ratings
    left join public.profiles profile on profile.id = ratings.user_id
    where ratings.matches_played > 0
  )
  select
    ranked.rank_position,
    ranked.ranked_user_id,
    ranked.display_name,
    ranked.display_avatar,
    ranked.current_rating,
    ranked.highest_rating,
    ranked.played,
    ranked.won,
    ranked.lost,
    ranked.tied,
    ranked.current_division
  from ranked
  where (p_division is null or ranked.current_division = p_division)
    and (
      nullif(btrim(p_search), '') is null
      or lower(ranked.display_name) like lower(btrim(p_search)) || '%'
    )
  order by ranked.rank_position
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.competitive_get_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rating public.player_competitive_ratings%rowtype;
  v_config public.competitive_config%rowtype;
  v_position bigint;
  v_division text;
  v_division_threshold integer;
  v_next_division text;
  v_next_threshold integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_user_id is null then
    raise exception 'A player ID is required';
  end if;

  select * into v_config from public.competitive_config where id = true;
  select * into v_rating
  from public.player_competitive_ratings
  where user_id = p_user_id;

  if found and v_rating.matches_played > 0 then
    select count(*) + 1
    into v_position
    from public.player_competitive_ratings other_rating
    where other_rating.matches_played > 0
      and (other_rating.rating > v_rating.rating
        or (other_rating.rating = v_rating.rating and other_rating.user_id < p_user_id));
    select division.key, division.value::integer
    into v_division, v_division_threshold
    from jsonb_each_text(v_config.division_thresholds) as division(key, value)
    where division.value::integer <= v_rating.rating
    order by division.value::integer desc
    limit 1;
    if v_division is null then
      v_division := 'Bronze';
      select (v_config.division_thresholds ->> 'Bronze')::integer
      into v_division_threshold;
    end if;

    select division.key, division.value::integer
    into v_next_division, v_next_threshold
    from jsonb_each_text(v_config.division_thresholds) as division(key, value)
    where division.value::integer > v_division_threshold
    order by division.value::integer
    limit 1;
  else
    v_position := null;
    v_division := null;
    v_division_threshold := null;
    v_next_division := null;
    v_next_threshold := null;
  end if;

  return jsonb_build_object(
    'userId', p_user_id,
    'name', (select coalesce(profile.name, 'Jogador') from public.profiles profile where profile.id = p_user_id),
    'avatarUrl', (select profile.avatar_url from public.profiles profile where profile.id = p_user_id),
    'position', v_position,
    'rating', coalesce(v_rating.rating, v_config.initial_rating),
    'peakRating', coalesce(v_rating.peak_rating, v_config.initial_rating),
    'matchesPlayed', coalesce(v_rating.matches_played, 0),
    'wins', coalesce(v_rating.wins, 0),
    'losses', coalesce(v_rating.losses, 0),
    'draws', coalesce(v_rating.draws, 0),
    'currentStreak', coalesce(v_rating.current_streak, 0),
    'bestWinStreak', coalesce(v_rating.best_win_streak, 0),
    'lastMatchAt', v_rating.last_match_at,
    'division', v_division,
    'divisionRating', v_division_threshold,
    'nextDivision', v_next_division,
    'nextDivisionRating', v_next_threshold,
    'winRate', case when coalesce(v_rating.matches_played, 0) = 0 then 0
      else round(100.0 * v_rating.wins / v_rating.matches_played, 1) end
  );
end;
$$;

create or replace function public.competitive_get_rating_history(
  p_user_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  challenge_id uuid,
  opponent_id uuid,
  opponent_name text,
  opponent_avatar_url text,
  result text,
  score_for integer,
  score_against integer,
  rating_before integer,
  rating_after integer,
  rating_change integer,
  division text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    event.challenge_id,
    event.opponent_id,
    coalesce(profile.name, 'Jogador'),
    profile.avatar_url,
    event.result,
    case when challenge.challenger_id = event.user_id then challenge.home_score else challenge.away_score end,
    case when challenge.challenger_id = event.user_id then challenge.away_score else challenge.home_score end,
    event.rating_before,
    event.rating_after,
    event.rating_change,
    public.competitive_division_for_rating(event.rating_after),
    event.created_at
  from public.competitive_rating_events event
  join public.challenges challenge on challenge.id = event.challenge_id
  join public.competitive_rating_events opponent_event
    on opponent_event.challenge_id = event.challenge_id
   and opponent_event.user_id = event.opponent_id
   and opponent_event.opponent_id = event.user_id
  left join public.profiles profile on profile.id = event.opponent_id
  where event.user_id = p_user_id
    and challenge.status = 'completed'
    and challenge.result #>> '{config,mode}' = 'pvp'
    and challenge.challenger_ready
    and challenge.challenged_ready
    and challenge.home_snapshot is not null
    and challenge.away_snapshot is not null
    and challenge.home_score is not null
    and challenge.away_score is not null
    and challenge.result ->> 'homeScore' = challenge.home_score::text
    and challenge.result ->> 'awayScore' = challenge.away_score::text
  order by event.created_at desc, event.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if v_user_id is null or p_opponent_id is null or p_opponent_id = v_user_id then
    raise exception 'A different opponent ID is required';
  end if;

  with pair_matches as (
    select
      challenge.id,
      coalesce(challenge.completed_at, challenge.updated_at) as updated_at,
      case when challenge.challenger_id = v_user_id
        then challenge.home_score else challenge.away_score end as user_score,
      case when challenge.challenger_id = v_user_id
        then challenge.away_score else challenge.home_score end as opponent_score
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
  select
    count(*)::integer,
    count(*) filter (where user_score > opponent_score)::integer,
    count(*) filter (where user_score < opponent_score)::integer,
    count(*) filter (where user_score = opponent_score)::integer,
    max(updated_at)
  into v_total, v_wins, v_losses, v_draws, v_last_match_at
  from pair_matches;

  select coalesce(jsonb_agg(to_jsonb(page_match) order by page_match.updated_at desc, page_match.challenge_id), '[]'::jsonb)
  into v_matches
  from (
    select
      challenge.id as challenge_id,
      case when challenge.challenger_id = v_user_id
        then challenge.home_score else challenge.away_score end as user_score,
      case when challenge.challenger_id = v_user_id
        then challenge.away_score else challenge.home_score end as opponent_score,
      case
        when (case when challenge.challenger_id = v_user_id then challenge.home_score else challenge.away_score end)
          > (case when challenge.challenger_id = v_user_id then challenge.away_score else challenge.home_score end) then 'win'
        when (case when challenge.challenger_id = v_user_id then challenge.home_score else challenge.away_score end)
          < (case when challenge.challenger_id = v_user_id then challenge.away_score else challenge.home_score end) then 'loss'
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

create or replace function public.competitive_search_head_to_head_opponents(
  p_user_id uuid,
  p_search text,
  p_limit integer default 10
)
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  rating integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_user_id is null or length(btrim(coalesce(p_search, ''))) < 2 then
    return;
  end if;

  return query
  select
    profile.id,
    coalesce(profile.name, 'Jogador'),
    profile.avatar_url,
    ratings.rating
  from public.profiles profile
  left join public.player_competitive_ratings ratings on ratings.user_id = profile.id
  where profile.id <> p_user_id
    and lower(profile.name) like lower(btrim(p_search)) || '%'
    and exists (
      select 1
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
          (challenge.challenger_id = p_user_id and challenge.challenged_id = profile.id)
          or (challenge.challenger_id = profile.id and challenge.challenged_id = p_user_id)
        )
    )
  order by lower(profile.name) nulls last, profile.id
  limit greatest(1, least(coalesce(p_limit, 10), 20));
end;
$$;

revoke all on function public.competitive_division_for_rating(integer) from public, anon, authenticated;
revoke all on function public.competitive_calculate_rating_delta(integer, integer, numeric, integer) from public, anon, authenticated;
revoke all on function public.apply_competitive_challenge_result() from public, anon, authenticated;
revoke all on function public.competitive_list_players(integer, integer, text, text) from public, anon;
revoke all on function public.competitive_get_profile(uuid) from public, anon;
revoke all on function public.competitive_get_rating_history(uuid, integer, integer) from public, anon;
revoke all on function public.competitive_get_head_to_head(uuid, uuid, integer, integer) from public, anon;
revoke all on function public.competitive_search_head_to_head_opponents(uuid, text, integer) from public, anon;

grant execute on function public.competitive_list_players(integer, integer, text, text) to authenticated;
grant execute on function public.competitive_get_profile(uuid) to authenticated;
grant execute on function public.competitive_get_rating_history(uuid, integer, integer) to authenticated;
grant execute on function public.competitive_get_head_to_head(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.competitive_search_head_to_head_opponents(uuid, text, integer) to authenticated;

revoke all on function public.set_challenge_ready(uuid, text) from public, anon;
grant execute on function public.set_challenge_ready(uuid, text) to authenticated;
