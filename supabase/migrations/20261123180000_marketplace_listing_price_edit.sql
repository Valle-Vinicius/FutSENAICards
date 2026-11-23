create or replace function public.update_listing_price(
  p_listing_id uuid,
  p_price integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Listing price must be greater than zero';
  end if;

  update public.listings
  set price = p_price,
      buy_now = p_price
  where id = p_listing_id
    and seller_id = v_uid
    and status = 'active'
    and expires_at > now();

  return found;
end;
$$;

revoke all on function public.update_listing_price(uuid, integer) from public, anon;
grant execute on function public.update_listing_price(uuid, integer) to authenticated;
