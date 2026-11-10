create table if not exists public.demo_coin_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claim_token uuid,
  finish_after timestamptz,
  locked_until timestamptz
);

alter table public.demo_coin_claims enable row level security;
revoke all on public.demo_coin_claims from public, anon, authenticated;

create or replace function public.begin_demo_coin_claim()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  insert into public.demo_coin_claims (user_id, claim_token, finish_after, locked_until)
  values (v_uid, gen_random_uuid(), now() + interval '1.8 seconds', now() + interval '15 seconds')
  on conflict (user_id) do update
  set claim_token = excluded.claim_token,
      finish_after = excluded.finish_after,
      locked_until = excluded.locked_until
  where demo_coin_claims.locked_until is null
     or demo_coin_claims.locked_until <= now()
  returning claim_token into v_token;

  if v_token is null then raise exception 'Demo coin purchase already in progress'; end if;
  return v_token;
end;
$$;

create or replace function public.finish_demo_coin_claim(p_claim_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token uuid;
  v_finish_after timestamptz;
  v_locked_until timestamptz;
  v_new_coins integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select claim_token, finish_after, locked_until
  into v_token, v_finish_after, v_locked_until
  from public.demo_coin_claims
  where user_id = v_uid
  for update;
  if not found or v_token is distinct from p_claim_token then
    raise exception 'Demo coin purchase lock is invalid';
  end if;
  if v_locked_until is null or v_locked_until <= now() then
    update public.demo_coin_claims
    set claim_token = null, finish_after = null, locked_until = null
    where user_id = v_uid;
    raise exception 'Demo coin purchase lock expired';
  end if;
  if v_finish_after is null or now() < v_finish_after then
    raise exception 'Demo coin purchase delay has not elapsed';
  end if;

  update public.profiles
  set coins = coins + 10000
  where id = v_uid
  returning coins into v_new_coins;
  if not found then raise exception 'Profile not found'; end if;

  insert into public.transactions (user_id, amount, reason, type)
  values (v_uid, 10000, 'Pacote de moedas (demo)', 'earn');

  update public.demo_coin_claims
  set claim_token = null, finish_after = null, locked_until = null
  where user_id = v_uid;

  return json_build_object('coins', v_new_coins);
end;
$$;

revoke all on function public.begin_demo_coin_claim() from public, anon;
revoke all on function public.finish_demo_coin_claim(uuid) from public, anon;
revoke all on function public.add_coins(integer, text) from public, anon, authenticated;
grant execute on function public.begin_demo_coin_claim() to authenticated;
grant execute on function public.finish_demo_coin_claim(uuid) to authenticated;
