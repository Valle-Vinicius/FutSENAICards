alter table public.pool_matches
  add column if not exists wager_type text,
  add column if not exists player1_card_id uuid references public.cards(id) on delete restrict,
  add column if not exists player2_card_id uuid references public.cards(id) on delete restrict,
  add column if not exists player1_card_snapshot jsonb,
  add column if not exists player2_card_snapshot jsonb;

alter table public.pool_matches
  add constraint pool_matches_wager_type_check
  check (wager_type is null or wager_type in ('coins', 'card'));

create table if not exists public.pool_wager_escrow (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.pool_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  card_id uuid references public.cards(id) on delete restrict,
  status text not null default 'held' check (status in ('held', 'settled', 'refunded')),
  created_at timestamptz not null default now(),
  unique (match_id, user_id),
  check ((coins > 0 and card_id is null) or (coins = 0 and card_id is not null))
);

create unique index if not exists pool_wager_escrow_active_card_idx
  on public.pool_wager_escrow(card_id)
  where status = 'held' and card_id is not null;

alter table public.pool_wager_escrow enable row level security;
revoke all on public.pool_wager_escrow from public, anon, authenticated;

create or replace function public.get_available_wager_card_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id
  from public.cards c
  where c.user_id = auth.uid()
    and not exists (
      select 1 from public.listings l where l.card_id = c.id and l.status = 'active'
    )
    and not exists (
      select 1 from public.challenge_wager_escrow e where e.card_id = c.id and e.status = 'held'
    )
    and not exists (
      select 1 from public.pool_wager_escrow e where e.card_id = c.id and e.status = 'held'
    )
  order by c.created_at desc, c.id;
$$;

create or replace function public.create_pool_match_wager(
  p_opponent uuid,
  p_wager_type text,
  p_stake integer default null,
  p_card_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id uuid;
  v_snapshot jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_wager_type is null or p_wager_type not in ('coins', 'card') then
    raise exception 'Escolha moedas ou carta para apostar';
  end if;
  if p_wager_type = 'coins' and (p_stake is null or p_stake < 1 or p_stake > 1000000 or p_card_id is not null) then
    raise exception 'Valor de aposta inválido';
  end if;
  if p_wager_type = 'card' and (p_card_id is null or p_stake is not null) then
    raise exception 'Selecione uma carta para apostar';
  end if;

  if p_wager_type = 'coins' then
    update public.profiles
    set coins = coins - p_stake
    where id = v_uid and coins >= p_stake;
    if not found then raise exception 'Saldo insuficiente para essa aposta'; end if;
  else
    perform 1 from public.cards where id = p_card_id and user_id = v_uid for update;
    if not found then raise exception 'A carta selecionada não pertence a você'; end if;
    if exists (select 1 from public.listings where card_id = p_card_id and status = 'active') then
      raise exception 'Cancele o anúncio ativo antes de apostar essa carta';
    end if;
    if exists (
      select 1 from public.challenge_wager_escrow
      where card_id = p_card_id and status = 'held'
    ) or exists (
      select 1 from public.pool_wager_escrow
      where card_id = p_card_id and status = 'held'
    ) then
      raise exception 'Essa carta já está reservada em outra aposta';
    end if;
    v_snapshot := public.challenge_card_snapshot(p_card_id);
  end if;

  v_match_id := public.create_pool_match(p_opponent, case when p_wager_type = 'coins' then p_stake else 0 end);

  update public.pool_matches
  set wager_type = p_wager_type,
      player1_card_id = case when p_wager_type = 'card' then p_card_id else null end,
      player1_card_snapshot = case when p_wager_type = 'card' then v_snapshot else null end
  where id = v_match_id;

  insert into public.pool_wager_escrow(match_id, user_id, coins, card_id)
  values (
    v_match_id,
    v_uid,
    case when p_wager_type = 'coins' then p_stake else 0 end,
    case when p_wager_type = 'card' then p_card_id else null end
  );
  return v_match_id;
end;
$$;

create or replace function public.accept_pool_match_wager(p_id uuid, p_card_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.pool_matches%rowtype;
  v_snapshot jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_match
  from public.pool_matches
  where id = p_id and player2_id = v_uid and status = 'pending'
  for update;
  if not found then return false; end if;
  if not exists (
    select 1 from public.pool_wager_escrow
    where match_id = p_id and user_id = v_match.player1_id and status = 'held'
  ) then
    raise exception 'A aposta do desafiante não está mais disponível';
  end if;

  if v_match.wager_type = 'coins' then
    if p_card_id is not null then raise exception 'Este convite exige uma aposta em moedas'; end if;
    update public.profiles
    set coins = coins - v_match.stake
    where id = v_uid and coins >= v_match.stake;
    if not found then raise exception 'Saldo insuficiente para igualar a aposta'; end if;
    insert into public.pool_wager_escrow(match_id, user_id, coins)
    values (p_id, v_uid, v_match.stake);
  elsif v_match.wager_type = 'card' then
    if p_card_id is null then raise exception 'Selecione uma carta para igualar a aposta'; end if;
    perform 1 from public.cards where id = p_card_id and user_id = v_uid for update;
    if not found then raise exception 'A carta selecionada não pertence a você'; end if;
    if exists (select 1 from public.listings where card_id = p_card_id and status = 'active') then
      raise exception 'Cancele o anúncio ativo antes de apostar essa carta';
    end if;
    if exists (
      select 1 from public.challenge_wager_escrow
      where card_id = p_card_id and status = 'held'
    ) or exists (
      select 1 from public.pool_wager_escrow
      where card_id = p_card_id and status = 'held'
    ) then
      raise exception 'Essa carta já está reservada em outra aposta';
    end if;
    v_snapshot := public.challenge_card_snapshot(p_card_id);
    insert into public.pool_wager_escrow(match_id, user_id, card_id)
    values (p_id, v_uid, p_card_id);
    update public.pool_matches
    set player2_card_id = p_card_id, player2_card_snapshot = v_snapshot
    where id = p_id;
  elsif p_card_id is not null then
    raise exception 'Este convite não possui uma aposta';
  end if;

  update public.pool_matches
  set status = 'playing',
      turn_deadline = now() + interval '30 seconds',
      updated_at = now()
  where id = p_id and status = 'pending';
  return found;
end;
$$;

create or replace function public.settle_pool_wager()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.pool_wager_escrow%rowtype;
  v_total_coins integer;
begin
  if new.status not in ('finished', 'forfeited', 'declined', 'expired')
     or old.status not in ('pending', 'accepted', 'playing') then
    return new;
  end if;
  if new.wager_type is null then return new; end if;

  if new.winner_id is not null and (new.status = 'finished' or new.status = 'forfeited') then
    if new.winner_id not in (new.player1_id, new.player2_id) then
      raise exception 'O vencedor informado não pertence à partida';
    end if;
    if (select count(*) from public.pool_wager_escrow where match_id = new.id and status = 'held') <> 2 then
      raise exception 'As duas apostas precisam estar reservadas antes da liquidação';
    end if;

    if new.wager_type = 'coins' then
      select coalesce(sum(coins), 0) into v_total_coins
      from public.pool_wager_escrow
      where match_id = new.id and status = 'held';
      update public.profiles set coins = coins + v_total_coins where id = new.winner_id;
      update public.pool_wager_escrow set status = 'settled'
      where match_id = new.id and status = 'held';
      update public.pool_matches set payout = v_total_coins where id = new.id;
    else
      update public.pool_wager_escrow set status = 'settled'
      where match_id = new.id and status = 'held';
      update public.cards card
      set user_id = new.winner_id
      from public.pool_wager_escrow escrow
      where escrow.match_id = new.id
        and escrow.user_id <> new.winner_id
        and escrow.card_id = card.id;
    end if;
  else
    for v_entry in
      select * from public.pool_wager_escrow
      where match_id = new.id and status = 'held'
    loop
      if v_entry.coins > 0 then
        update public.profiles set coins = coins + v_entry.coins where id = v_entry.user_id;
      end if;
      update public.pool_wager_escrow set status = 'refunded' where id = v_entry.id;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_reserved_card_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.challenge_wager_escrow
    where card_id = old.id and status = 'held'
  ) or exists (
    select 1 from public.pool_wager_escrow
    where card_id = old.id and status = 'held'
  ) then
    raise exception 'This card is reserved for an active wager';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.prevent_reserved_card_listing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.challenge_wager_escrow
    where card_id = new.card_id and status = 'held'
  ) or exists (
    select 1 from public.pool_wager_escrow
    where card_id = new.card_id and status = 'held'
  ) then
    raise exception 'This card is reserved for an active wager';
  end if;
  return new;
end;
$$;

create or replace function public.apply_pool_competitive_result()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rating1 integer;
  v_rating2 integer;
  v_actual1 numeric;
  v_delta1 integer;
  v_delta2 integer;
begin
  if new.status not in ('finished', 'forfeited')
     or old.status in ('finished', 'forfeited')
     or new.winner_id is null
     or new.player1_id is null
     or new.player2_id is null
     or new.player1_id = new.player2_id
     or new.winner_id not in (new.player1_id, new.player2_id) then
    return new;
  end if;
  insert into public.pool_competitive_results(match_id, player1_id, player2_id, winner_id)
  values (new.id, new.player1_id, new.player2_id, new.winner_id)
  on conflict (match_id) do nothing;
  if not found then return new; end if;

  insert into public.pool_competitive_ratings(user_id)
  values (new.player1_id), (new.player2_id)
  on conflict (user_id) do nothing;
  perform 1 from public.pool_competitive_ratings
  where user_id in (new.player1_id, new.player2_id)
  order by user_id for update;
  select rating into v_rating1 from public.pool_competitive_ratings where user_id = new.player1_id;
  select rating into v_rating2 from public.pool_competitive_ratings where user_id = new.player2_id;

  v_actual1 := case when new.winner_id = new.player1_id then 1 else 0 end;
  v_delta1 := round(32 * (v_actual1 - 1 / (1 + power(10::numeric, (v_rating2 - v_rating1)::numeric / 400))))::integer;
  v_delta2 := -v_delta1;

  update public.pool_competitive_ratings
  set rating = rating + v_delta1,
      peak_rating = greatest(peak_rating, rating + v_delta1),
      matches_played = matches_played + 1,
      wins = wins + case when v_actual1 = 1 then 1 else 0 end,
      losses = losses + case when v_actual1 = 0 then 1 else 0 end,
      updated_at = now()
  where user_id = new.player1_id;
  update public.pool_competitive_ratings
  set rating = rating + v_delta2,
      peak_rating = greatest(peak_rating, rating + v_delta2),
      matches_played = matches_played + 1,
      wins = wins + case when v_actual1 = 0 then 1 else 0 end,
      losses = losses + case when v_actual1 = 1 then 1 else 0 end,
      updated_at = now()
  where user_id = new.player2_id;
  return new;
end;
$$;

drop trigger if exists pool_matches_settle_wager on public.pool_matches;
create trigger pool_matches_settle_wager
after update of status on public.pool_matches
for each row execute function public.settle_pool_wager();

revoke all on function public.create_pool_match_wager(uuid, text, integer, uuid) from public, anon;
revoke all on function public.accept_pool_match_wager(uuid, uuid) from public, anon;
revoke all on function public.settle_pool_wager() from public, anon, authenticated;
revoke all on function public.get_available_wager_card_ids() from public, anon;
revoke all on function public.create_pool_match(uuid, integer) from public, anon, authenticated;
revoke all on function public.accept_pool_match(uuid) from public, anon, authenticated;
grant execute on function public.get_available_wager_card_ids() to authenticated;
grant execute on function public.create_pool_match_wager(uuid, text, integer, uuid) to authenticated;
grant execute on function public.accept_pool_match_wager(uuid, uuid) to authenticated;
