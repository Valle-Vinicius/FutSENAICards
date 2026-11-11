-- Repair unstarted tables created with the old, incorrect ball groups.
alter table public.pool_matches add column if not exists finish_reason text;

with eligible_matches as (
  select m.id, m.table_state
  from public.pool_matches m
  where m.status in ('pending', 'accepted', 'playing')
    and m.table_state ? 'balls'
    and coalesce(m.assignments->>'player1', 'null') = 'null'
    and coalesce(m.assignments->>'player2', 'null') = 'null'
    and not exists (
      select 1 from public.pool_shots s where s.match_id = m.id
    )
), corrected_states as (
  select
    e.id,
    jsonb_agg(
      case
        when (ball->>'id')::int = 0 then jsonb_set(ball, '{type}', '"cue"'::jsonb)
        when (ball->>'id')::int between 1 and 7 then jsonb_set(ball, '{type}', '"solid"'::jsonb)
        when (ball->>'id')::int between 8 and 14 then jsonb_set(ball, '{type}', '"stripe"'::jsonb)
        when (ball->>'id')::int = 15 then jsonb_set(ball, '{type}', '"eight"'::jsonb)
        else ball
      end
      order by (ball->>'id')::int
    ) as balls
  from eligible_matches e
  cross join lateral jsonb_array_elements(e.table_state->'balls') as ball
  group by e.id
)
update public.pool_matches m
set table_state = jsonb_set(m.table_state, '{balls}', c.balls, false),
    assignments = '{"player1":null,"player2":null}'::jsonb
from corrected_states c
where m.id = c.id;

-- Reopen games incorrectly finished when the old striped ball 15 was treated as the 8-ball.
with legacy_false_wins as (
  select
    m.id,
    m.table_state,
    case
      when coalesce((m.table_state->>'foul')::boolean, false) then case when m.current_player = 1 then 2 else 1 end
      else m.current_player
    end as next_player
  from public.pool_matches m
  where m.status = 'finished'
    and m.finish_reason is null
    and not exists (
      select 1
      from jsonb_array_elements(m.table_state->'balls') as ball
      where ball->>'type' = 'eight'
    )
    and exists (
      select 1
      from jsonb_array_elements(m.table_state->'balls') as ball
      where ball->>'id' = '15' and ball->>'type' = 'stripe' and ball->>'pocketed' = 'true'
    )
    and exists (
      select 1
      from public.pool_shots s
      where s.match_id = m.id and s.result->'pocketed' @> '[15]'::jsonb
    )
), corrected_false_wins as (
  select
    legacy.id,
    legacy.next_player,
    jsonb_agg(
      case
        when (ball->>'id')::int = 0 then jsonb_set(ball, '{type}', '"cue"'::jsonb)
        when (ball->>'id')::int between 1 and 7 then jsonb_set(ball, '{type}', '"solid"'::jsonb)
        when (ball->>'id')::int between 8 and 14 then jsonb_set(ball, '{type}', '"stripe"'::jsonb)
        when (ball->>'id')::int = 15 then jsonb_set(ball, '{type}', '"eight"'::jsonb)
        else ball
      end
      order by (ball->>'id')::int
    ) as balls
  from legacy_false_wins legacy
  cross join lateral jsonb_array_elements(legacy.table_state->'balls') as ball
  group by legacy.id, legacy.next_player
)
update public.pool_matches m
set status = 'playing',
    winner_id = null,
    finish_reason = null,
    current_player = c.next_player,
    turn_deadline = now() + interval '60 seconds',
    assignments = '{"player1":null,"player2":null}'::jsonb,
    table_state = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(m.table_state, '{balls}', c.balls, false),
          '{assignments}', '{"player1":null,"player2":null}'::jsonb, true
        ),
        '{winner}', 'null'::jsonb, true
      ),
      '{currentPlayer}', to_jsonb(c.next_player), true
    ),
    updated_at = now()
from corrected_false_wins c
where m.id = c.id;

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
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_opponent = v_uid then raise exception 'Cannot challenge yourself'; end if;
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
    and (player1_id = v_uid or player2_id = v_uid);
  return found;
end;
$$;

create or replace function public.reject_pool_match(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_player2 uuid;
  v_status text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select player2_id, status into v_player2, v_status
  from public.pool_matches where id = p_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_status <> 'pending' then raise exception 'Match not pending'; end if;
  if v_uid <> v_player2 then raise exception 'Only the challenged player can reject'; end if;
  update public.pool_matches
  set status = 'declined', finish_reason = 'invite_declined', updated_at = now()
  where id = p_id;
  return true;
end;
$$;
