create table if not exists public.pvp_anonymized_players (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pvp_anonymized_players enable row level security;
revoke all on public.pvp_anonymized_players from public, anon, authenticated, service_role;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conrelid::regclass as table_name,
           constraint_row.conname as constraint_name
    from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
      and constraint_row.conrelid in (
        'public.challenges'::regclass,
        'public.challenge_rewards'::regclass,
        'public.competitive_rating_events'::regclass
      )
  loop
    execute format(
      'alter table %s drop constraint %I',
      v_constraint.table_name,
      v_constraint.constraint_name
    );
  end loop;
end;
$$;

create or replace function public.pvp_subject_exists(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (select 1 from auth.users where id = p_subject_id)
      or exists (select 1 from public.pvp_anonymized_players where id = p_subject_id);
$$;

revoke all on function public.pvp_subject_exists(uuid) from public, anon, authenticated, service_role;

create or replace function public.guard_pvp_subject_references()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name = 'challenges' then
    if not public.pvp_subject_exists(new.challenger_id)
       or not public.pvp_subject_exists(new.challenged_id)
       or new.challenger_id = new.challenged_id then
      raise exception 'Challenge participants must be distinct active or anonymized players';
    end if;
  elsif tg_table_name = 'challenge_rewards' then
    if not public.pvp_subject_exists(new.user_id) then
      raise exception 'Challenge reward participant does not exist';
    end if;
  elsif tg_table_name = 'competitive_rating_events' then
    if not public.pvp_subject_exists(new.user_id)
       or not public.pvp_subject_exists(new.opponent_id)
       or new.user_id = new.opponent_id then
      raise exception 'Rating event participants must be distinct active or anonymized players';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_pvp_subject_references() from public, anon, authenticated, service_role;

drop trigger if exists challenges_guard_subject_references on public.challenges;
create trigger challenges_guard_subject_references
  before insert or update of challenger_id, challenged_id on public.challenges
  for each row execute function public.guard_pvp_subject_references();

drop trigger if exists challenge_rewards_guard_subject_references on public.challenge_rewards;
create trigger challenge_rewards_guard_subject_references
  before insert or update of user_id on public.challenge_rewards
  for each row execute function public.guard_pvp_subject_references();

drop trigger if exists competitive_rating_events_guard_subject_references on public.competitive_rating_events;
create trigger competitive_rating_events_guard_subject_references
  before insert or update of user_id, opponent_id on public.competitive_rating_events
  for each row execute function public.guard_pvp_subject_references();

create or replace function public.prevent_challenge_snapshot_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() = 'service_role'
     and current_setting('app.pvp_account_anonymization', true) = 'on' then
    return new;
  end if;
  if old.home_snapshot is not null and new.home_snapshot is distinct from old.home_snapshot then
    raise exception 'Challenge home snapshot is immutable';
  end if;
  if old.away_snapshot is not null and new.away_snapshot is distinct from old.away_snapshot then
    raise exception 'Challenge away snapshot is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_challenge_snapshot_changes() from public, anon, authenticated, service_role;

create or replace function public.guard_pvp_match_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text := auth.role();
  v_anonymizing_user uuid;
  v_anonymized_subject uuid;
  v_challenge public.challenges%rowtype;
  v_expected_home_score integer;
  v_expected_away_score integer;
begin
  if tg_op = 'DELETE' then
    if old.match_type = 'pvp' or old.challenge_id is not null then
      if v_role is distinct from 'service_role'
         or current_setting('app.pvp_account_anonymization', true) is distinct from 'on'
         or current_setting('app.pvp_anonymizing_user', true) is distinct from old.user_id::text then
        raise exception 'Official PvP match history can only be removed by authenticated account anonymization';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.match_type = 'pvp' or old.challenge_id is not null
       or new.match_type = 'pvp' or new.challenge_id is not null then
      v_anonymizing_user := nullif(current_setting('app.pvp_anonymizing_user', true), '')::uuid;
      v_anonymized_subject := nullif(current_setting('app.pvp_anonymized_subject', true), '')::uuid;

      if v_role = 'service_role'
         and current_setting('app.pvp_account_anonymization', true) = 'on'
         and old.match_type = 'pvp'
         and old.challenge_id is not null
         and new.match_type = old.match_type
         and new.challenge_id = old.challenge_id
         and new.user_id = old.user_id
         and new.opponent = 'Jogador removido'
         and (to_jsonb(new) - 'opponent') is not distinct from (to_jsonb(old) - 'opponent')
         and v_anonymizing_user is not null
         and v_anonymized_subject is not null
         and exists (
           select 1
           from public.challenges challenge
           where challenge.id = old.challenge_id
             and v_anonymized_subject in (challenge.challenger_id, challenge.challenged_id)
         ) then
        return new;
      end if;

      raise exception 'PvP match history is immutable except for account anonymization';
    end if;
    return new;
  end if;

  if new.match_type = 'pvp' or new.challenge_id is not null then
    if v_role in ('anon', 'authenticated') then
      raise exception 'PvP match history can only be written by official challenge completion';
    end if;
    if new.match_type is distinct from 'pvp'
       or new.challenge_id is null
       or new.status is distinct from 'completed' then
      raise exception 'Invalid official PvP match history record';
    end if;

    select *
    into v_challenge
    from public.challenges challenge
    where challenge.id = new.challenge_id
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
      and exists (
        select 1
        from public.challenge_rewards reward
        where reward.challenge_id = challenge.id
          and reward.user_id = new.user_id
      )
    for update;

    if not found
       or new.user_id not in (v_challenge.challenger_id, v_challenge.challenged_id) then
      raise exception 'PvP history must reference an official completed challenge participant';
    end if;

    if new.user_id = v_challenge.challenger_id then
      v_expected_home_score := v_challenge.home_score;
      v_expected_away_score := v_challenge.away_score;
    else
      v_expected_home_score := v_challenge.away_score;
      v_expected_away_score := v_challenge.home_score;
    end if;

    if new.home_score is distinct from v_expected_home_score
       or new.away_score is distinct from v_expected_away_score then
      raise exception 'PvP history score does not match the official challenge result';
    end if;

    if exists (
      select 1
      from public.matches history
      where history.challenge_id = new.challenge_id
        and history.user_id = new.user_id
    ) then
      raise exception 'Official PvP match history already exists for this challenge participant';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_pvp_match_history() from public, anon, authenticated, service_role;

revoke truncate on public.matches from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.matches from service_role;
revoke insert, update, delete, truncate on public.challenges from service_role;
revoke insert, update, delete, truncate on public.challenge_rewards from service_role;
revoke insert, update, delete, truncate on public.player_competitive_ratings from service_role;
revoke insert, update, delete, truncate on public.competitive_rating_events from service_role;

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
  v_name text;
  v_avatar_url text;
  v_has_rating boolean;
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
  v_has_rating := found;

  select profile.name, profile.avatar_url
  into v_name, v_avatar_url
  from public.profiles profile
  where profile.id = p_user_id;
  if not found then
    if exists (select 1 from public.pvp_anonymized_players player where player.id = p_user_id) then
      v_name := 'Jogador removido';
    else
      v_name := 'Jogador';
    end if;
    v_avatar_url := null;
  end if;

  if v_has_rating and v_rating.matches_played > 0 then
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
    'name', v_name,
    'avatarUrl', v_avatar_url,
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
    coalesce(
      profile.name,
      case when anonymized.id is not null then 'Jogador removido' else 'Jogador' end
    ),
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
  left join public.pvp_anonymized_players anonymized on anonymized.id = event.opponent_id
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
  with eligible_h2h as (
    select challenge.challenger_id, challenge.challenged_id
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
  ),
  opponents as (
    select
      profile.id as opponent_id,
      coalesce(profile.name, 'Jogador') as display_name,
      profile.avatar_url as display_avatar,
      ratings.rating as current_rating
    from public.profiles profile
    left join public.player_competitive_ratings ratings on ratings.user_id = profile.id
    where profile.id <> p_user_id
      and lower(profile.name) like lower(btrim(p_search)) || '%'
      and exists (
        select 1 from eligible_h2h history
        where (history.challenger_id = p_user_id and history.challenged_id = profile.id)
           or (history.challenger_id = profile.id and history.challenged_id = p_user_id)
      )

    union all

    select
      anonymized.id,
      'Jogador removido'::text,
      null::text,
      null::integer
    from public.pvp_anonymized_players anonymized
    where anonymized.id <> p_user_id
      and lower('Jogador removido') like lower(btrim(p_search)) || '%'
      and exists (
        select 1 from eligible_h2h history
        where (history.challenger_id = p_user_id and history.challenged_id = anonymized.id)
           or (history.challenger_id = anonymized.id and history.challenged_id = p_user_id)
      )
  )
  select opponent.opponent_id, opponent.display_name, opponent.display_avatar, opponent.current_rating
  from opponents opponent
  order by lower(opponent.display_name), opponent.opponent_id
  limit greatest(1, least(coalesce(p_limit, 10), 20));
end;
$$;

revoke all on function public.competitive_get_profile(uuid) from public, anon;
revoke all on function public.competitive_get_rating_history(uuid, integer, integer) from public, anon;
revoke all on function public.competitive_search_head_to_head_opponents(uuid, text, integer) from public, anon;
grant execute on function public.competitive_get_profile(uuid) to authenticated;
grant execute on function public.competitive_get_rating_history(uuid, integer, integer) to authenticated;
grant execute on function public.competitive_search_head_to_head_opponents(uuid, text, integer) to authenticated;

create or replace function public.delete_account_owned_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_anonymized_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required to delete account data';
  end if;
  if p_user_id is null then
    raise exception 'A user ID is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  perform 1 from auth.users where id = p_user_id for update;
  if not found then
    raise exception 'The authenticated account does not exist';
  end if;

  insert into public.pvp_anonymized_players (source_user_id)
  values (p_user_id)
  on conflict (source_user_id) do nothing;
  select id into strict v_anonymized_id
  from public.pvp_anonymized_players
  where source_user_id = p_user_id;

  perform set_config('app.pvp_account_anonymization', 'on', true);
  perform set_config('app.pvp_anonymizing_user', p_user_id::text, true);
  perform set_config('app.pvp_anonymized_subject', v_anonymized_id::text, true);

  delete from public.challenges challenge
  where p_user_id in (challenge.challenger_id, challenge.challenged_id)
    and not exists (
      select 1
      from public.competitive_rating_events event
      where event.challenge_id = challenge.id
    )
    and not (
      challenge.status = 'completed'
      and challenge.result #>> '{config,mode}' = 'pvp'
      and challenge.challenger_ready
      and challenge.challenged_ready
      and challenge.home_snapshot is not null
      and challenge.away_snapshot is not null
      and challenge.home_score is not null
      and challenge.away_score is not null
      and challenge.result ->> 'homeScore' = challenge.home_score::text
      and challenge.result ->> 'awayScore' = challenge.away_score::text
    );

  update public.challenges challenge
  set challenger_id = case when challenge.challenger_id = p_user_id then v_anonymized_id else challenge.challenger_id end,
      challenged_id = case when challenge.challenged_id = p_user_id then v_anonymized_id else challenge.challenged_id end,
      home_snapshot = case when challenge.home_snapshot is null then null else jsonb_build_object(
        'name', 'Jogador removido',
        'formation', coalesce(challenge.home_snapshot ->> 'formation', '1-2-1'),
        'cards', '[]'::jsonb
      ) end,
      away_snapshot = case when challenge.away_snapshot is null then null else jsonb_build_object(
        'name', 'Jogador removido',
        'formation', coalesce(challenge.away_snapshot ->> 'formation', '1-2-1'),
        'cards', '[]'::jsonb
      ) end,
      result = jsonb_build_object(
        'config', jsonb_build_object(
          'mode', challenge.result #> '{config,mode}',
          'homeName', 'Jogador removido',
          'awayName', 'Jogador removido'
        ),
        'homeScore', challenge.result -> 'homeScore',
        'awayScore', challenge.result -> 'awayScore'
      ),
      playback_state = jsonb_build_object(
        'status', 'finished',
        'currentFrame', 0,
        'speed', 1,
        'startedAt', null,
        'pausedAt', null,
        'serverNow', now()
      )
  where p_user_id in (challenge.challenger_id, challenge.challenged_id)
    and (
      exists (
        select 1
        from public.competitive_rating_events event
        where event.challenge_id = challenge.id
      )
      or (
        challenge.status = 'completed'
        and challenge.result #>> '{config,mode}' = 'pvp'
        and challenge.challenger_ready
        and challenge.challenged_ready
        and challenge.home_snapshot is not null
        and challenge.away_snapshot is not null
        and challenge.home_score is not null
        and challenge.away_score is not null
        and challenge.result ->> 'homeScore' = challenge.home_score::text
        and challenge.result ->> 'awayScore' = challenge.away_score::text
      )
    );

  update public.challenge_rewards reward
  set user_id = v_anonymized_id
  where reward.user_id = p_user_id;

  update public.competitive_rating_events event
  set user_id = case when event.user_id = p_user_id then v_anonymized_id else event.user_id end,
      opponent_id = case when event.opponent_id = p_user_id then v_anonymized_id else event.opponent_id end
  where event.user_id = p_user_id or event.opponent_id = p_user_id;

  update public.matches history
  set opponent = 'Jogador removido'
  where history.match_type = 'pvp'
    and history.challenge_id in (
      select challenge.id
      from public.challenges challenge
      where v_anonymized_id in (challenge.challenger_id, challenge.challenged_id)
    )
    and history.user_id <> p_user_id
    and history.opponent is distinct from 'Jogador removido';

  delete from public.matches where user_id = p_user_id;
  delete from public.player_competitive_ratings where user_id = p_user_id;
  delete from public.cards where user_id = p_user_id;
  delete from public.squads where user_id = p_user_id;
  delete from public.saved_squads where user_id = p_user_id;
  delete from public.leaderboard where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;

  perform set_config('app.pvp_account_anonymization', 'off', true);
  perform set_config('app.pvp_anonymizing_user', '', true);
  perform set_config('app.pvp_anonymized_subject', '', true);
end;
$$;

revoke all on function public.delete_account_owned_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_owned_data(uuid) to service_role;

notify pgrst, 'reload schema';
