alter table public.challenges
  add column if not exists admin_entertainment boolean not null default false;

create or replace function public.set_admin_challenge_entertainment(
  p_challenge_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
begin
  if auth.uid() is distinct from v_admin_uid then
    raise exception 'Only the administrator can enable entertainment mode';
  end if;
  if p_enabled is null then
    raise exception 'Entertainment mode must be explicitly enabled or disabled';
  end if;

  update public.challenges
  set admin_entertainment = p_enabled,
      updated_at = now()
  where id = p_challenge_id
    and challenger_id = v_admin_uid
    and status = 'accepted'
    and result is null
    and not challenger_ready
    and not challenged_ready
    and wager_type is null;

  return found;
end;
$$;

revoke all on function public.set_admin_challenge_entertainment(uuid, boolean) from public, anon;
grant execute on function public.set_admin_challenge_entertainment(uuid, boolean) to authenticated;

drop trigger if exists challenges_apply_competitive_result on public.challenges;
create trigger challenges_apply_competitive_result
  after update of status on public.challenges
  for each row
  when (
    old.status is distinct from new.status
    and new.status = 'completed'
    and new.admin_entertainment is not true
  )
  execute function public.apply_competitive_challenge_result();

create or replace function public.skip_admin_entertainment_challenge_rewards()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.challenges
    where id = new.challenge_id
      and admin_entertainment
  ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.skip_admin_entertainment_challenge_rewards() from public, anon, authenticated;

drop trigger if exists challenge_rewards_skip_admin_entertainment on public.challenge_rewards;
create trigger challenge_rewards_skip_admin_entertainment
  before insert on public.challenge_rewards
  for each row
  execute function public.skip_admin_entertainment_challenge_rewards();

notify pgrst, 'reload schema';
