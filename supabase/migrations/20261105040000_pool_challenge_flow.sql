-- Migration: Pool match challenge flow (pending/accept/reject)
-- Update create_pool_match to create pending matches
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
  if exists (select 1 from public.pool_matches where status in ('pending','accepted','playing') and ((player1_id = v_uid and player2_id = p_opponent) or (player2_id = v_uid and player1_id = p_opponent))) then
    raise exception 'Active match exists';
  end if;
  insert into public.pool_matches (player1_id, player2_id, stake, status, seed, table_state, current_player, turn_deadline)
  values (v_uid, p_opponent, p_stake, 'pending', floor(random() * 1000000)::int, null, 1, now() + interval '10 minutes')
  returning id into v_match_id;
  return v_match_id;
end;
$$;

-- Accept pool match
create or replace function public.accept_pool_match(p_id uuid)
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
  set status = 'playing',
      turn_deadline = now() + interval '30 seconds',
      updated_at = now()
  where id = p_id
    and status = 'pending'
    and player2_id = v_uid;
  return found;
end;
$$;

-- Reject pool match
create or replace function public.reject_pool_match(p_id uuid)
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
  set status = 'declined',
      updated_at = now()
  where id = p_id
    and status = 'pending'
    and player2_id = v_uid;
  return found;
end;
$$;
