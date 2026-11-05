-- Migration: Add abandon_challenge RPC and allow cancelled status
alter table public.challenges drop constraint if exists challenges_status_check;
alter table public.challenges add constraint challenges_status_check check (status in ('pending', 'accepted', 'rejected', 'completed', 'cancelled', 'abandoned'));

create or replace function public.abandon_challenge(p_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  update public.challenges
  set status = 'cancelled',
      updated_at = now()
  where id = p_challenge_id
    and status in ('pending', 'accepted')
    and (challenger_id = v_uid or challenged_id = v_uid);
  return found;
end;
$$;
