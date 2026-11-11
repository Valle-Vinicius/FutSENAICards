alter table public.pool_matches
  add column if not exists shot_lock_id uuid,
  add column if not exists shot_lock_at timestamptz,
  add column if not exists last_shot_seq integer not null default 0;

alter table public.pool_shots
  add column if not exists playback_at timestamptz;

create unique index if not exists pool_shots_match_seq_unique
  on public.pool_shots (match_id, seq);

update public.pool_matches m
set last_shot_seq = coalesce((
  select max(s.seq)
  from public.pool_shots s
  where s.match_id = m.id
), 0);

create or replace function public.pool_server_time()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select clock_timestamp();
$$;

revoke all on function public.pool_server_time() from public, anon;
grant execute on function public.pool_server_time() to authenticated;

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
  v_playback_at timestamptz := clock_timestamp() + interval '2 seconds';
  v_version integer := p_expected_version + 1;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required';
  end if;

  if p_seq < 1
    or p_current_player not in (1, 2)
    or jsonb_typeof(p_result) <> 'object'
    or jsonb_typeof(p_final_state) <> 'object'
  then
    raise exception 'invalid shot finalization data';
  end if;

  update public.pool_matches
  set table_state = p_final_state,
      current_player = p_current_player,
      turn_deadline = p_turn_deadline,
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
      'version', v_version
    ),
    v_playback_at
  );

  return jsonb_build_object(
    'seq', p_seq,
    'playbackAt', v_playback_at,
    'version', v_version
  );
end;
$$;

revoke all on function public.finalize_pool_shot(
  uuid, uuid, uuid, integer, double precision, double precision, jsonb, jsonb,
  integer, timestamptz, uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.finalize_pool_shot(
  uuid, uuid, uuid, integer, double precision, double precision, jsonb, jsonb,
  integer, timestamptz, uuid, text, integer
) to service_role;

create or replace function public.abandon_pool_match(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update public.pool_matches
  set status = 'forfeited',
      finish_reason = case when status = 'pending' then 'invite_cancelled' else 'forfeit' end,
      winner_id = case
        when status in ('accepted', 'playing') then
          case when player1_id = v_uid then player2_id else player1_id end
        else null
      end,
      updated_at = now()
  where id = p_id
    and status in ('pending', 'accepted', 'playing')
    and shot_lock_id is null
    and (player1_id = v_uid or player2_id = v_uid);
  return found;
end;
$$;

revoke all on function public.abandon_pool_match(uuid) from public, anon;
grant execute on function public.abandon_pool_match(uuid) to authenticated;

drop policy if exists "pool match participants can receive broadcasts" on realtime.messages;
create policy "pool match participants can receive broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.pool_matches m
    where ('pool-match-' || m.id::text) = (select realtime.topic())
      and (m.player1_id = (select auth.uid()) or m.player2_id = (select auth.uid()))
  )
);

drop policy if exists "pool match participants can send broadcasts" on realtime.messages;
create policy "pool match participants can send broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.pool_matches m
    where ('pool-match-' || m.id::text) = (select realtime.topic())
      and (m.player1_id = (select auth.uid()) or m.player2_id = (select auth.uid()))
  )
);
