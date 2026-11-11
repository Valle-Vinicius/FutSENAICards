alter table public.pool_matches
  add column if not exists turn_available_at timestamptz not null default now();

grant execute on function public.pool_server_time() to service_role;

create or replace function public.finalize_pool_shot(
  p_match_id uuid,
  p_player_id uuid,
  p_shot_id uuid,
  p_seq integer,
  p_angle double precision,
  p_power double precision,
  p_result jsonb,
  p_final_state jsonb,
  p_current_player integer,
  p_turn_deadline timestamptz,
  p_winner_id uuid,
  p_finish_reason text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frame_count integer;
  v_playback_at timestamptz;
  v_turn_available_at timestamptz;
  v_version integer := p_expected_version + 1;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required';
  end if;

  if p_seq < 1
    or p_current_player not in (1, 2)
    or jsonb_typeof(p_result) is distinct from 'object'
    or jsonb_typeof(p_result->'anim') is distinct from 'array'
    or jsonb_typeof(p_final_state) is distinct from 'object'
  then
    raise exception 'invalid shot finalization data';
  end if;

  v_frame_count := jsonb_array_length(p_result->'anim');
  v_playback_at := clock_timestamp() + interval '2 seconds';
  v_turn_available_at := v_playback_at
    + make_interval(secs => greatest(v_frame_count - 1, 0)::double precision / 48.0)
    + interval '500 milliseconds';

  update public.pool_matches
  set table_state = p_final_state,
      current_player = p_current_player,
      turn_available_at = v_turn_available_at,
      turn_deadline = v_turn_available_at + interval '60 seconds',
      status = case when p_winner_id is null then status else 'finished' end,
      winner_id = p_winner_id,
      finish_reason = p_finish_reason,
      version = v_version,
      last_shot_seq = p_seq,
      shot_lock_id = null,
      shot_lock_at = null,
      updated_at = clock_timestamp()
  where id = p_match_id
    and (player1_id = p_player_id or player2_id = p_player_id)
    and shot_lock_id = p_shot_id
    and version = p_expected_version
    and last_shot_seq = p_seq - 1
    and status in ('accepted', 'playing')
    and (
      (current_player = 1 and player1_id = p_player_id)
      or (current_player = 2 and player2_id = p_player_id)
    );

  if not found then
    return jsonb_build_object('error', 'stale_match');
  end if;

  insert into public.pool_shots (
    match_id, player_id, seq, angle, power, shot_id, result, playback_at
  )
  values (
    p_match_id,
    p_player_id,
    p_seq,
    p_angle,
    p_power,
    p_shot_id,
    p_result || jsonb_build_object(
      'status', 'complete',
      'finalState', p_final_state,
      'playbackAt', v_playback_at,
      'turnAvailableAt', v_turn_available_at,
      'version', v_version
    ),
    v_playback_at
  );

  return jsonb_build_object(
    'seq', p_seq,
    'playbackAt', v_playback_at,
    'turnAvailableAt', v_turn_available_at,
    'version', v_version
  );
end;
$$;
