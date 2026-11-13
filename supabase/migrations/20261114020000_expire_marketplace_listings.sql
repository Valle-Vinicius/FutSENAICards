create index if not exists listings_active_expiration_idx
  on public.listings (expires_at)
  where status = 'active';

update public.listings
set status = 'expired'
where status = 'active'
  and expires_at <= now();

create or replace function public.expire_marketplace_listings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_expired_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.listings
  set status = 'expired'
  where status = 'active'
    and expires_at <= clock_timestamp();
  get diagnostics v_expired_count = row_count;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_marketplace_listings() from public, anon;
grant execute on function public.expire_marketplace_listings() to authenticated;
