create or replace function public.create_challenge(p_challenged_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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

  update public.challenges
  set status = 'cancelled',
      updated_at = now()
  where status in ('pending', 'accepted')
    and updated_at < now() - interval '10 minutes'
    and result is null
    and simulation_claim_token is null
    and (
      (challenger_id = v_challenger_id and challenged_id = p_challenged_id)
      or (challenger_id = p_challenged_id and challenged_id = v_challenger_id)
    );

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

create or replace function public.create_pool_match(p_opponent uuid, p_stake int default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id uuid;
  v_balls jsonb := '[]'::jsonb;
  v_table_state jsonb;
  v_row int;
  v_col int;
  v_ball_id int := 1;
  v_type text;
  v_x numeric;
  v_y numeric;
  v_pair_key text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_opponent is null then raise exception 'Opponent is required'; end if;
  if p_opponent = v_uid then raise exception 'Cannot challenge yourself'; end if;

  v_pair_key := least(v_uid::text, p_opponent::text)
    || ':' || greatest(v_uid::text, p_opponent::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = v_uid and addressee_id = p_opponent)
        or (addressee_id = v_uid and requester_id = p_opponent))
  ) then
    raise exception 'Not friends';
  end if;

  update public.pool_matches
  set status = 'expired', finish_reason = 'invite_expired', updated_at = now()
  where status in ('pending', 'accepted')
    and created_at < now() - interval '10 minutes'
    and ((player1_id = v_uid and player2_id = p_opponent)
      or (player2_id = v_uid and player1_id = p_opponent));

  update public.pool_matches
  set shot_lock_id = null, shot_lock_at = null
  where status in ('accepted', 'playing')
    and shot_lock_at < now() - interval '60 seconds'
    and ((player1_id = v_uid and player2_id = p_opponent)
      or (player2_id = v_uid and player1_id = p_opponent));

  update public.pool_matches
  set status = 'finished',
      winner_id = case when current_player = 1 then player2_id else player1_id end,
      finish_reason = 'turn_expired',
      updated_at = now()
  where status in ('accepted', 'playing')
    and turn_deadline <= now()
    and (turn_available_at is null or turn_available_at <= now())
    and shot_lock_id is null
    and ((player1_id = v_uid and player2_id = p_opponent)
      or (player2_id = v_uid and player1_id = p_opponent));

  if exists (
    select 1 from public.pool_matches
    where status in ('pending', 'accepted', 'playing')
      and ((player1_id = v_uid and player2_id = p_opponent)
        or (player2_id = v_uid and player1_id = p_opponent))
  ) then
    raise exception 'Active match exists';
  end if;

  for v_row in 0..4 loop
    for v_col in 0..v_row loop
      if v_ball_id <= 7 then v_type := 'solid';
      elsif v_ball_id <= 14 then v_type := 'stripe';
      else v_type := 'eight';
      end if;
      v_x := 1.5 + v_row * 0.05;
      v_y := 0.5 + (v_col - v_row / 2.0) * 0.0525;
      v_balls := v_balls || jsonb_build_array(jsonb_build_object(
        'id', v_ball_id,
        'type', v_type,
        'x', v_x,
        'y', v_y,
        'vx', 0,
        'vy', 0,
        'pocketed', false
      ));
      v_ball_id := v_ball_id + 1;
    end loop;
  end loop;

  v_table_state := jsonb_build_object(
    'balls', jsonb_build_array(jsonb_build_object(
      'id', 0, 'type', 'cue', 'x', 0.5, 'y', 0.5,
      'vx', 0, 'vy', 0, 'pocketed', false
    )) || v_balls,
    'assignments', jsonb_build_object('player1', null, 'player2', null),
    'currentPlayer', 1,
    'winner', null,
    'foul', false,
    'pocketedThisTurn', jsonb_build_array(),
    'firstContact', null,
    'shotInProgress', false
  );

  insert into public.pool_matches (
    player1_id, player2_id, stake, status, seed, table_state,
    current_player, turn_deadline
  )
  values (
    v_uid, p_opponent, p_stake, 'pending', floor(random() * 1000000)::int,
    v_table_state, 1, now() + interval '10 minutes'
  )
  returning id into v_match_id;
  return v_match_id;
end;
$$;

revoke all on function public.create_pool_match(uuid, integer) from public, anon, authenticated;
