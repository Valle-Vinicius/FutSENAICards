-- Migration: Expirar pool_matches pendentes antigos antes de criar nova partida
create or replace function public.create_pool_match(p_opponent uuid, p_stake int default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_opponent = v_uid then raise exception 'Cannot challenge yourself'; end if;
  if not exists (select 1 from public.friendships where status = 'accepted' and ((requester_id = v_uid and addressee_id = p_opponent) or (addressee_id = v_uid and requester_id = p_opponent))) then
    raise exception 'Not friends';
  end if;
  -- expirar convites pendentes antigos do par (mais de 10 minutos sem resposta)
  update public.pool_matches
  set status = 'expired', updated_at = now()
  where status = 'pending'
    and created_at < now() - interval '10 minutes'
    and ((player1_id = v_uid and player2_id = p_opponent) or (player2_id = v_uid and player1_id = p_opponent));
  -- checar partida ativa restante
  if exists (select 1 from public.pool_matches where status in ('pending','accepted','playing') and ((player1_id = v_uid and player2_id = p_opponent) or (player2_id = v_uid and player1_id = p_opponent))) then
    raise exception 'Active match exists';
  end if;
  insert into public.pool_matches (player1_id, player2_id, stake, status, seed, table_state, current_player, turn_deadline)
  values (v_uid, p_opponent, p_stake, 'pending', floor(random() * 1000000)::int, null, 1, now() + interval '10 minutes')
  returning id into v_match_id;
  return v_match_id;
end;
$$;
