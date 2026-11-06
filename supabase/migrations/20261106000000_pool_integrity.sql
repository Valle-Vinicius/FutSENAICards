-- Migration: Pool integrity (version, shot_id, idempotency)
alter table public.pool_matches add column if not exists version int not null default 0;
alter table public.pool_shots add column if not exists shot_id uuid default gen_random_uuid();
alter table public.pool_shots add constraint pool_shots_shot_id_unique unique (shot_id);

-- Allow cancel status
alter table public.pool_matches drop constraint if exists pool_matches_status_check;
alter table public.pool_matches add constraint pool_matches_status_check
  check (status in ('pending','accepted','playing','finished','declined','expired','forfeited','cancelled'));

-- Abandon pool match RPC (already exists, ensure it's there)
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
  set status = 'cancelled', updated_at = now()
  where id = p_id
    and status in ('pending', 'accepted', 'playing')
    and (player1_id = v_uid or player2_id = v_uid);
  return found;
end;
$$;
