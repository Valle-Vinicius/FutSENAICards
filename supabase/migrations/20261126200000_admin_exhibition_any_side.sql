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
    and (challenger_id = v_admin_uid or challenged_id = v_admin_uid)
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

notify pgrst, 'reload schema';
