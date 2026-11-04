  alter table public.challenges
    add column if not exists simulation_claimed_until timestamptz,
    add column if not exists simulation_claim_token uuid,
    add column if not exists home_snapshot jsonb,
    add column if not exists away_snapshot jsonb,
    add column if not exists challenger_tactic text not null default 'balanced'
      check (challenger_tactic in ('balanced', 'possession', 'highpress', 'counter', 'compact')),
    add column if not exists challenged_tactic text not null default 'balanced'
      check (challenged_tactic in ('balanced', 'possession', 'highpress', 'counter', 'compact')),
    add column if not exists playback_state jsonb not null default
      '{"status":"waiting","currentFrame":0,"speed":1,"startedAt":null,"pausedAt":null,"serverNow":null}'::jsonb;

  drop policy if exists "challenges_update_parties" on public.challenges;
  drop policy if exists "challenges_insert_own" on public.challenges;
  revoke insert on public.challenges from authenticated;
  revoke update on public.challenges from authenticated;
  drop function if exists public.claim_challenge_simulation(uuid);
  drop function if exists public.release_challenge_simulation(uuid);
  drop function if exists public.complete_challenge(uuid, jsonb);

  create table if not exists public.challenge_rewards (
    challenge_id uuid not null references public.challenges(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (challenge_id, user_id)
  );

  alter table public.challenge_rewards enable row level security;

  create or replace function public.prevent_challenge_snapshot_changes()
  returns trigger
  language plpgsql
  set search_path = public
  as $$
  begin
    if old.home_snapshot is not null and new.home_snapshot is distinct from old.home_snapshot then
      raise exception 'Challenge home snapshot is immutable';
    end if;
    if old.away_snapshot is not null and new.away_snapshot is distinct from old.away_snapshot then
      raise exception 'Challenge away snapshot is immutable';
    end if;
    return new;
  end;
  $$;

  drop trigger if exists challenges_snapshot_immutable on public.challenges;
  create trigger challenges_snapshot_immutable
    before update of home_snapshot, away_snapshot on public.challenges
    for each row execute function public.prevent_challenge_snapshot_changes();

  revoke all on function public.prevent_challenge_snapshot_changes() from public, anon, authenticated;

  create or replace function public.build_challenge_team_snapshot(p_user_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_starters jsonb;
    v_formation text;
    v_cards jsonb;
    v_name text;
    v_card_count integer;
    v_unique_count integer;
    v_goalkeeper_count integer;
  begin
    select starters, formation
    into v_starters, v_formation
    from public.squads
    where user_id = p_user_id
    order by is_primary desc, updated_at desc
    limit 1;

    if v_starters is null then
      raise exception 'Each PvP team must have exactly five starters';
    end if;
    if jsonb_typeof(v_starters) <> 'array' then
      raise exception 'Each PvP team must have exactly five starters';
    end if;
    if jsonb_array_length(v_starters) <> 5 then
      raise exception 'Each PvP team must have exactly five starters';
    end if;

    select
      jsonb_agg(jsonb_build_object(
        'uid', c.id,
        'name', c.name,
        'position', c.position,
        'overall', coalesce(c.overall, 70),
        'pace', coalesce(c.pace, 50),
        'shooting', coalesce(c.shooting, 50),
        'passing', coalesce(c.passing, 50),
        'dribbling', coalesce(c.dribbling, 50),
        'defending', coalesce(c.defending, 50),
        'physical', coalesce(c.physical, 50),
        'reflexes', c.reflexes,
        'positioning', c.positioning,
        'handling', c.handling
      ) order by starter.ordinality),
      count(*),
      count(distinct starter.uid),
      count(*) filter (where c.position = 'GK')
    into v_cards, v_card_count, v_unique_count, v_goalkeeper_count
    from jsonb_array_elements_text(v_starters) with ordinality as starter(uid, ordinality)
    join public.cards c on c.id::text = starter.uid and c.user_id = p_user_id;

    if v_card_count <> 5 or v_unique_count <> 5 or v_goalkeeper_count <> 1 then
      raise exception 'Each PvP team must have five valid starters including exactly one goalkeeper';
    end if;

    select name into v_name from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'name', coalesce(v_name, 'Jogador'),
      'formation', coalesce(v_formation, '1-2-1'),
      'cards', v_cards
    );
  end;
  $$;

  create or replace function public.create_challenge(p_challenged_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_challenger_id uuid := auth.uid();
    v_pair_key text;
    v_existing public.challenges%rowtype;
    v_challenge public.challenges%rowtype;
  begin
    if v_challenger_id is null or p_challenged_id is null or v_challenger_id = p_challenged_id then
      raise exception 'Invalid challenge participants';
    end if;

    v_pair_key := least(v_challenger_id::text, p_challenged_id::text)
      || ':' || greatest(v_challenger_id::text, p_challenged_id::text);
    perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

    if not exists (
      select 1
      from public.friendships
      where status = 'accepted'
        and (
          (requester_id = v_challenger_id and addressee_id = p_challenged_id)
          or (requester_id = p_challenged_id and addressee_id = v_challenger_id)
        )
    ) then
      raise exception 'An accepted friendship is required to challenge this player';
    end if;

    select * into v_existing
    from public.challenges
    where status in ('pending', 'accepted')
      and (
        (challenger_id = v_challenger_id and challenged_id = p_challenged_id)
        or (challenger_id = p_challenged_id and challenged_id = v_challenger_id)
      )
    limit 1;
    if found then return null; end if;

    insert into public.challenges (challenger_id, challenged_id, status)
    values (v_challenger_id, p_challenged_id, 'pending')
    returning * into v_challenge;
    return to_jsonb(v_challenge);
  end;
  $$;

  create or replace function public.accept_challenge(p_challenge_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    update public.challenges
    set status = 'accepted',
        seed = floor(random() * 2147483647)::bigint,
        updated_at = now()
    where id = p_challenge_id
      and challenged_id = auth.uid()
      and status = 'pending';
    return found;
  end;
  $$;

  create or replace function public.set_challenge_ready(p_challenge_id uuid, p_tactic text)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
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
    select * into v_challenge
    from public.challenges
    where id = p_challenge_id
      and status = 'accepted'
      and (challenger_id = auth.uid() or challenged_id = auth.uid())
    for update;
    if not found then return false; end if;

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

  drop function if exists public.set_challenge_ready(uuid);

  create or replace function public.reject_challenge(p_challenge_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    update public.challenges
    set status = 'rejected', updated_at = now()
    where id = p_challenge_id
      and status in ('pending', 'accepted')
      and (challenger_id = auth.uid() or challenged_id = auth.uid())
      and not (challenger_ready and challenged_ready)
      and simulation_claim_token is null;
    return found;
  end;
  $$;

  create or replace function public.claim_challenge_simulation(p_challenge_id uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_challenge public.challenges%rowtype;
    v_claim_token uuid;
  begin
    select * into v_challenge
    from public.challenges
    where id = p_challenge_id
    for update;
    if not found or v_challenge.status <> 'accepted'
       or not v_challenge.challenger_ready or not v_challenge.challenged_ready
       or v_challenge.result is not null
       or (v_challenge.simulation_claimed_until is not null and v_challenge.simulation_claimed_until >= now()) then
      return null;
    end if;

    if (v_challenge.home_snapshot is null) <> (v_challenge.away_snapshot is null) then
      raise exception 'Challenge snapshots are inconsistent';
    end if;
    if v_challenge.home_snapshot is null and v_challenge.away_snapshot is null then
      update public.challenges
      set home_snapshot = public.build_challenge_team_snapshot(v_challenge.challenger_id),
          away_snapshot = public.build_challenge_team_snapshot(v_challenge.challenged_id)
      where id = p_challenge_id;
    end if;

    v_claim_token := gen_random_uuid();
    update public.challenges
    set simulation_claimed_until = now() + interval '10 minutes',
        simulation_claim_token = v_claim_token,
        updated_at = now()
    where id = p_challenge_id;
    return v_claim_token;
  end;
  $$;

  create or replace function public.release_challenge_simulation(p_challenge_id uuid, p_claim_token uuid)
  returns void
  language sql
  security definer
  set search_path = public
  as $$
    update public.challenges
    set simulation_claimed_until = null, simulation_claim_token = null, updated_at = now()
    where id = p_challenge_id
      and simulation_claim_token = p_claim_token
      and status = 'accepted'
      and result is null;
  $$;

  create or replace function public.complete_challenge(p_challenge_id uuid, p_claim_token uuid, p_result jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_result jsonb;
    v_user_id uuid;
    v_player jsonb;
    v_stats jsonb;
    v_player_id text;
    v_card_id uuid;
    v_home_score integer;
    v_away_score integer;
    v_my_score integer;
    v_opponent_score integer;
    v_opponent_name text;
    v_is_home boolean;
    v_player_count integer;
    v_unique_player_count integer;
  begin
    if p_result is null or jsonb_typeof(p_result) is distinct from 'object'
       or jsonb_typeof(p_result -> 'config') is distinct from 'object'
       or jsonb_typeof(p_result -> 'frames') is distinct from 'array'
       or jsonb_typeof(p_result -> 'playerStats') is distinct from 'object'
       or jsonb_typeof(p_result -> 'homeScore') is distinct from 'number'
       or jsonb_typeof(p_result -> 'awayScore') is distinct from 'number'
       or jsonb_typeof(p_result #> '{config,homePlayers}') is distinct from 'array'
       or jsonb_typeof(p_result #> '{config,awayPlayers}') is distinct from 'array' then
      raise exception 'Invalid challenge result structure';
    end if;
    if jsonb_array_length(p_result -> 'frames') = 0
       or jsonb_array_length(p_result #> '{config,homePlayers}') <> 5
       or jsonb_array_length(p_result #> '{config,awayPlayers}') <> 5
       or (p_result ->> 'homeScore')::integer < 0
       or (p_result ->> 'awayScore')::integer < 0 then
      raise exception 'Invalid challenge result values';
    end if;

    for v_is_home in
      select true union all select false
    loop
      if v_is_home then
        select count(*), count(distinct value ->> 'id')
        into v_player_count, v_unique_player_count
        from jsonb_array_elements(p_result #> '{config,homePlayers}');
      else
        select count(*), count(distinct value ->> 'id')
        into v_player_count, v_unique_player_count
        from jsonb_array_elements(p_result #> '{config,awayPlayers}');
      end if;
      if v_player_count <> 5 or v_unique_player_count <> 5 then
        raise exception 'Challenge result contains duplicate or missing players';
      end if;
      for v_player in
        select value
        from jsonb_array_elements(
          case when v_is_home
            then p_result #> '{config,homePlayers}'
            else p_result #> '{config,awayPlayers}'
          end
        )
      loop
        v_player_id := v_player ->> 'id';
        if v_player_id is null
           or v_player_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_(home|away)$'
           or (v_is_home and right(v_player_id, 4) <> 'home')
           or (not v_is_home and right(v_player_id, 4) <> 'away') then
          raise exception 'Challenge result contains an invalid player ID';
        end if;
        if not exists (
          select 1
          from public.challenges challenge
          cross join lateral jsonb_array_elements(
            case when v_is_home
              then challenge.home_snapshot -> 'cards'
              else challenge.away_snapshot -> 'cards'
            end
          ) as snapshot_card(value)
          where challenge.id = p_challenge_id
            and (snapshot_card.value ->> 'uid') || case when v_is_home then '_home' else '_away' end = v_player_id
        ) then
          raise exception 'Challenge result does not match the frozen lineup';
        end if;
      end loop;
    end loop;

    update public.challenges
    set status = 'completed',
        result = p_result,
        seed = (p_result #>> '{config,seed}')::bigint,
        home_formation = p_result #>> '{config,homeFormation}',
        away_formation = p_result #>> '{config,awayFormation}',
        home_score = (p_result ->> 'homeScore')::integer,
        away_score = (p_result ->> 'awayScore')::integer,
        playback_state = jsonb_build_object(
          'status', 'waiting',
          'currentFrame', 0,
          'speed', 1,
          'startedAt', null,
          'pausedAt', null,
          'serverNow', now()
        ),
        simulation_claimed_until = null,
        simulation_claim_token = null,
        updated_at = now()
    where id = p_challenge_id
      and status = 'accepted'
      and result is null
      and challenger_ready
      and challenged_ready
      and simulation_claim_token = p_claim_token
    returning result, home_score, away_score
    into v_result, v_home_score, v_away_score;

    if v_result is null then
      select result into v_result
      from public.challenges
      where id = p_challenge_id and status = 'completed';
      if v_result is null then
        raise exception 'Challenge is not ready to complete';
      end if;
      return v_result;
    end if;

    for v_is_home in
      select true union all select false
    loop
      if v_is_home then
        select challenger_id into v_user_id from public.challenges where id = p_challenge_id;
        v_my_score := v_home_score;
        v_opponent_score := v_away_score;
        v_opponent_name := v_result #>> '{config,awayName}';
      else
        select challenged_id into v_user_id from public.challenges where id = p_challenge_id;
        v_my_score := v_away_score;
        v_opponent_score := v_home_score;
        v_opponent_name := v_result #>> '{config,homeName}';
      end if;

      insert into public.challenge_rewards (challenge_id, user_id)
      values (p_challenge_id, v_user_id)
      on conflict do nothing;

      if found then
        for v_player in
          select value
          from jsonb_array_elements(
            case when v_is_home
              then v_result #> '{config,homePlayers}'
              else v_result #> '{config,awayPlayers}'
            end
          )
        loop
          v_player_id := v_player ->> 'id';
          v_card_id := split_part(v_player_id, '_', 1)::uuid;
          v_stats := v_result #> array['playerStats', v_player_id];

          update public.cards
          set xp = coalesce(xp, 0) + 50 + case when v_my_score > v_opponent_score then 30 else 0 end,
              season_stats = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    coalesce(season_stats, '{}'::jsonb),
                    '{matches}',
                    to_jsonb(coalesce((season_stats ->> 'matches')::integer, 0) + 1),
                    true
                  ),
                  '{goals}',
                  to_jsonb(coalesce((season_stats ->> 'goals')::integer, 0) + coalesce((v_stats ->> 'goals')::integer, 0)),
                  true
                ),
                '{assists}',
                to_jsonb(coalesce((season_stats ->> 'assists')::integer, 0) + coalesce((v_stats ->> 'assists')::integer, 0)),
                true
              )
          where id = v_card_id and user_id = v_user_id;
        end loop;

        insert into public.matches (
          user_id, sport, match_type, challenge_id, status,
          home_score, away_score, opponent
        )
        values (
          v_user_id, 'futsal', 'pvp', p_challenge_id, 'completed',
          v_my_score, v_opponent_score, v_opponent_name
        );
      end if;
    end loop;

    return v_result;
  end;
  $$;

  create or replace function public.update_challenge_playback(
    p_challenge_id uuid,
    p_action text,
    p_speed integer default null
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_challenge public.challenges%rowtype;
    v_state jsonb;
    v_status text;
    v_frame numeric;
    v_speed integer;
    v_frames integer;
    v_started_at timestamptz;
    v_now timestamptz := clock_timestamp();
  begin
    select * into v_challenge
    from public.challenges
    where id = p_challenge_id
      and (challenger_id = auth.uid() or challenged_id = auth.uid())
    for update;

    if not found or v_challenge.status <> 'completed' or v_challenge.result is null then
      raise exception 'Challenge result is unavailable';
    end if;

    v_state := v_challenge.playback_state;
    v_status := v_state ->> 'status';
    if v_status = 'finished' then
      if p_action = 'finish' then return v_state; end if;
      raise exception 'The shared match is already finished';
    end if;
    v_frame := coalesce((v_state ->> 'currentFrame')::numeric, 0);
    v_speed := coalesce((v_state ->> 'speed')::integer, 1);
    v_frames := jsonb_array_length(v_challenge.result -> 'frames');
    v_started_at := nullif(v_state ->> 'startedAt', '')::timestamptz;

    if v_status = 'playing' and v_started_at is not null then
      v_frame := least(v_frames - 1, v_frame + greatest(0, extract(epoch from (v_now - v_started_at))) * 2 * v_speed);
    end if;

    if p_action = 'play' then
      if v_frame >= v_frames - 1 then
        v_status := 'finished';
        v_frame := v_frames - 1;
      else
        v_status := 'playing';
        v_started_at := v_now;
      end if;
    elsif p_action = 'pause' then
      if v_status <> 'playing' then
        raise exception 'Only a playing match can be paused';
      end if;
      v_status := 'paused';
      v_started_at := null;
    elsif p_action = 'speed' then
      if p_speed is null or p_speed not in (1, 2, 4) then
        raise exception 'Unsupported playback speed';
      end if;
      v_speed := p_speed;
      if v_status = 'playing' then
        v_started_at := v_now;
      end if;
    elsif p_action = 'finish' then
      if v_frame < v_frames - 1 then
        raise exception 'The shared match clock has not reached full time';
      end if;
      v_status := 'finished';
      v_frame := v_frames - 1;
      v_started_at := null;
    else
      raise exception 'Unsupported playback action';
    end if;

    v_state := jsonb_build_object(
      'status', v_status,
      'currentFrame', v_frame,
      'speed', v_speed,
      'startedAt', case when v_started_at is null then null else to_jsonb(v_started_at) end,
      'pausedAt', case
        when p_action = 'pause' then to_jsonb(v_now)
        when p_action = 'play' then 'null'::jsonb
        else v_state -> 'pausedAt'
      end,
      'serverNow', to_jsonb(v_now)
    );

    update public.challenges
    set playback_state = v_state, updated_at = v_now
    where id = p_challenge_id;
    return v_state;
  end;
  $$;

  revoke all on function public.accept_challenge(uuid) from public, anon;
  revoke all on function public.create_challenge(uuid) from public, anon;
  revoke all on function public.build_challenge_team_snapshot(uuid) from public, anon, authenticated;
  revoke all on function public.set_challenge_ready(uuid, text) from public, anon;
  revoke all on function public.reject_challenge(uuid) from public, anon;
  revoke all on function public.claim_challenge_simulation(uuid) from public, anon, authenticated;
  revoke all on function public.release_challenge_simulation(uuid, uuid) from public, anon, authenticated;
  revoke all on function public.complete_challenge(uuid, uuid, jsonb) from public, anon, authenticated;
  revoke all on function public.update_challenge_playback(uuid, text, integer) from public, anon;

  grant execute on function public.accept_challenge(uuid) to authenticated;
  grant execute on function public.create_challenge(uuid) to authenticated;
  grant execute on function public.set_challenge_ready(uuid, text) to authenticated;
  grant execute on function public.reject_challenge(uuid) to authenticated;
  grant execute on function public.claim_challenge_simulation(uuid) to service_role;
  grant execute on function public.release_challenge_simulation(uuid, uuid) to service_role;
  grant execute on function public.complete_challenge(uuid, uuid, jsonb) to service_role;
  grant execute on function public.update_challenge_playback(uuid, text, integer) to authenticated;
