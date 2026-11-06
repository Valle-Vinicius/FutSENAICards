-- Migration: Correção definitiva do sistema multiplayer de sinuca (pool_match)
-- Garante que create_pool_match inicializa table_state e current_player no servidor,
-- e que accept_pool_match é atômico, valida player2 e impede o criador de aceitar.

-- table_state inicial idêntico ao createInitialState() do cliente (engine/pool/physics.ts)
-- para que ambos os navegadores recebam exatamente o mesmo estado inicial da mesa.
create or replace function public.create_pool_match(p_opponent uuid, p_stake int default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id uuid;
  v_table_state jsonb := '{"balls":[{"id":0,"type":"cue","x":0.5,"y":0.5,"vx":0,"vy":0,"pocketed":false},{"id":1,"type":"solid","x":1.5,"y":0.5,"vx":0,"vy":0,"pocketed":false},{"id":2,"type":"solid","x":1.5525,"y":0.47375,"vx":0,"vy":0,"pocketed":false},{"id":3,"type":"solid","x":1.5525,"y":0.52625,"vx":0,"vy":0,"pocketed":false},{"id":4,"type":"solid","x":1.605,"y":0.45,"vx":0,"vy":0,"pocketed":false},{"id":5,"type":"solid","x":1.605,"y":0.5,"vx":0,"vy":0,"pocketed":false},{"id":6,"type":"solid","x":1.605,"y":0.5525,"vx":0,"vy":0,"pocketed":false},{"id":7,"type":"solid","x":1.6575,"y":0.42125,"vx":0,"vy":0,"pocketed":false},{"id":8,"type":"solid","x":1.6575,"y":0.47375,"vx":0,"vy":0,"pocketed":false},{"id":9,"type":"solid","x":1.6575,"y":0.52625,"vx":0,"vy":0,"pocketed":false},{"id":10,"type":"solid","x":1.6575,"y":0.57875,"vx":0,"vy":0,"pocketed":false},{"id":11,"type":"stripe","x":1.71,"y":0.395,"vx":0,"vy":0,"pocketed":false},{"id":12,"type":"stripe","x":1.71,"y":0.4475,"vx":0,"vy":0,"pocketed":false},{"id":13,"type":"stripe","x":1.71,"y":0.5,"vx":0,"vy":0,"pocketed":false},{"id":14,"type":"stripe","x":1.71,"y":0.5525,"vx":0,"vy":0,"pocketed":false},{"id":15,"type":"stripe","x":1.71,"y":0.605,"vx":0,"vy":0,"pocketed":false}],"assignments":{"player1":null,"player2":null},"currentPlayer":1,"winner":null,"foul":false,"pocketedThisTurn":[],"firstContact":null,"shotInProgress":false}';
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_opponent = v_uid then raise exception 'Cannot challenge yourself'; end if;
  if not exists (select 1 from public.friendships where status = 'accepted' and ((requester_id = v_uid and addressee_id = p_opponent) or (addressee_id = v_uid and requester_id = p_opponent))) then
    raise exception 'Not friends';
  end if;
  -- expira convites pendentes antigos (mais de 10 minutos) do par
  update public.pool_matches
  set status = 'expired', updated_at = now()
  where status in ('pending', 'accepted')
    and created_at < now() - interval '10 minutes'
    and ((player1_id = v_uid and player2_id = p_opponent) or (player2_id = v_uid and player1_id = p_opponent));
  if exists (select 1 from public.pool_matches where status in ('pending','accepted','playing') and ((player1_id = v_uid and player2_id = p_opponent) or (player2_id = v_uid and player1_id = p_opponent))) then
    raise exception 'Active match exists';
  end if;
  insert into public.pool_matches (player1_id, player2_id, stake, status, seed, table_state, current_player, turn_deadline)
  values (v_uid, p_opponent, p_stake, 'pending', floor(random() * 1000000)::int, v_table_state, 1, now() + interval '10 minutes')
  returning id into v_match_id;
  return v_match_id;
end;
$$;

-- Accept pool match: apenas o player2 pode aceitar, apenas quando pending, de forma atômica.
-- Bloqueia a linha (FOR UPDATE) para impedir que dois usuários aceitem simultaneamente.
create or replace function public.accept_pool_match(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_player1 uuid;
  v_player2 uuid;
  v_status text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select player1_id, player2_id, status
  into v_player1, v_player2, v_status
  from public.pool_matches
  where id = p_id
  for update;
  if not found then raise exception 'Match not found'; end if;
  if v_status <> 'pending' then raise exception 'Match not pending'; end if;
  if v_uid = v_player1 then raise exception 'Creator cannot accept own challenge'; end if;
  if v_uid <> v_player2 then raise exception 'Only the challenged player can accept'; end if;
  update public.pool_matches
  set status = 'playing',
      current_player = 1,
      turn_deadline = now() + interval '30 seconds',
      updated_at = now()
  where id = p_id;
  return true;
end;
$$;

-- Reject pool match: apenas o player2 pode recusar, apenas quando pending
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
  set status = 'declined', updated_at = now()
  where id = p_id;
  return true;
end;
$$;
