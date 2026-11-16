create table if not exists public.marketplace_transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique,
  card_id uuid,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid references auth.users(id) on delete set null,
  buyer_name text not null,
  seller_name text not null,
  card_name text not null,
  card_overall integer,
  card_rarity text,
  card_image text,
  price integer not null check (price >= 0),
  completed_at timestamptz not null default now()
);

create index if not exists marketplace_transactions_buyer_completed_idx
  on public.marketplace_transactions (buyer_id, completed_at desc);

create index if not exists marketplace_transactions_seller_completed_idx
  on public.marketplace_transactions (seller_id, completed_at desc);

alter table public.marketplace_transactions enable row level security;
revoke all on public.marketplace_transactions from public, anon, authenticated;
grant select on public.marketplace_transactions to authenticated;

drop policy if exists "marketplace transaction participants can read" on public.marketplace_transactions;
create policy "marketplace transaction participants can read"
  on public.marketplace_transactions
  for select
  to authenticated
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

create or replace function public.buy_listing(p_listing_id uuid, p_buyer_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing record;
  v_price integer;
  v_seller_id uuid;
  v_card_id uuid;
  v_buyer_coins integer;
  v_buyer_name text;
  v_seller_name text;
begin
  if auth.uid() is distinct from p_buyer_id then
    raise exception 'Authenticated buyer does not match request';
  end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then return json_build_object('ok', false, 'error', 'listing not found'); end if;
  if v_listing.status <> 'active' then return json_build_object('ok', false, 'error', 'not active'); end if;
  if v_listing.expires_at < now() then return json_build_object('ok', false, 'error', 'expired'); end if;
  if v_listing.seller_id = p_buyer_id then return json_build_object('ok', false, 'error', 'own listing'); end if;

  v_price := case when v_listing.buy_now > 0 then v_listing.buy_now else v_listing.price end;
  v_seller_id := v_listing.seller_id;
  v_card_id := v_listing.card_id;

  select coins into v_buyer_coins
  from public.profiles
  where id = p_buyer_id
  for update;

  if v_buyer_coins is null or v_buyer_coins < v_price then
    return json_build_object('ok', false, 'error', 'insufficient coins');
  end if;

  update public.profiles set coins = coins - v_price where id = p_buyer_id;
  if v_seller_id is not null then
    update public.profiles set coins = coins + v_price where id = v_seller_id;
  end if;
  if v_card_id is not null then
    update public.cards set user_id = p_buyer_id where id = v_card_id;
  end if;

  update public.listings
  set status = 'sold'
  where id = p_listing_id and status = 'active';

  if not found then return json_build_object('ok', false, 'error', 'concurrent purchase'); end if;

  select coalesce(name, 'Usuário')
  into v_buyer_name
  from public.profiles
  where id = p_buyer_id;
  v_buyer_name := coalesce(v_buyer_name, 'Usuário');

  if v_seller_id is null then
    v_seller_name := 'Mercado';
  else
    select coalesce(name, 'Usuário')
    into v_seller_name
    from public.profiles
    where id = v_seller_id;
    v_seller_name := coalesce(v_seller_name, 'Usuário');
  end if;

  insert into public.marketplace_transactions (
    listing_id,
    card_id,
    buyer_id,
    seller_id,
    buyer_name,
    seller_name,
    card_name,
    card_overall,
    card_rarity,
    card_image,
    price
  ) values (
    v_listing.id,
    v_card_id,
    p_buyer_id,
    v_seller_id,
    v_buyer_name,
    v_seller_name,
    v_listing.card_name,
    v_listing.card_overall,
    v_listing.card_rarity,
    v_listing.card_image,
    v_price
  );

  return json_build_object('ok', true, 'price', v_price);
end;
$$;

revoke all on function public.buy_listing(uuid, uuid) from public, anon;
grant execute on function public.buy_listing(uuid, uuid) to authenticated;

create or replace function public.marketplace_transaction_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'purchaseCount', count(*) filter (where buyer_id = auth.uid()),
    'saleCount', count(*) filter (where seller_id = auth.uid()),
    'spent', coalesce(sum(price) filter (where buyer_id = auth.uid()), 0),
    'received', coalesce(sum(price) filter (where seller_id = auth.uid()), 0),
    'volume', coalesce(sum(price), 0),
    'net', coalesce(sum(price) filter (where seller_id = auth.uid()), 0)
      - coalesce(sum(price) filter (where buyer_id = auth.uid()), 0)
  )
  from public.marketplace_transactions
  where buyer_id = auth.uid() or seller_id = auth.uid();
$$;

revoke all on function public.marketplace_transaction_summary() from public, anon;
grant execute on function public.marketplace_transaction_summary() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'marketplace_transactions'
     ) then
    execute 'alter publication supabase_realtime add table public.marketplace_transactions';
  end if;
end;
$$;

notify pgrst, 'reload schema';
