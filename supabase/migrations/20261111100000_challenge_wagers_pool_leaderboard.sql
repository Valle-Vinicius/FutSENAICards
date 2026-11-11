alter table public.challenges
  add column if not exists wager_type text,
  add column if not exists coin_amount integer,
  add column if not exists challenger_card_id uuid references public.cards(id) on delete restrict,
  add column if not exists challenged_card_id uuid references public.cards(id) on delete restrict,
  add column if not exists challenger_card_snapshot jsonb,
  add column if not exists challenged_card_snapshot jsonb;

alter table public.challenges
  add constraint challenges_wager_type_check
  check (wager_type is null or wager_type in ('coins', 'card'));

alter table public.challenges
  add constraint challenges_coin_amount_check
  check (coin_amount is null or coin_amount > 0);

create table if not exists public.challenge_wager_escrow (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  card_id uuid references public.cards(id) on delete restrict,
  status text not null default 'held' check (status in ('held', 'settled', 'refunded')),
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id),
  check ((coins > 0 and card_id is null) or (coins = 0 and card_id is not null))
);

create unique index if not exists challenge_wager_escrow_active_card_idx
  on public.challenge_wager_escrow(card_id)
  where status = 'held' and card_id is not null;

create index if not exists challenge_wager_escrow_challenge_status_idx
  on public.challenge_wager_escrow(challenge_id, status);

alter table public.challenge_wager_escrow enable row level security;
revoke all on public.challenge_wager_escrow from public, anon, authenticated;

create table if not exists public.challenge_wager_results (
  challenge_id uuid primary key references public.challenges(id) on delete cascade,
  winner_id uuid references auth.users(id) on delete set null,
  result text not null check (result in ('win', 'draw')),
  settled_at timestamptz not null default now()
);

alter table public.challenge_wager_results enable row level security;
revoke all on public.challenge_wager_results from public, anon, authenticated;

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
  order by c.created_at desc, c.id;
$$;

create or replace function public.challenge_card_snapshot(p_card_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'overall', c.overall,
    'position', c.position,
    'rarity', c.rarity,
    'image', c.image
  )
  from public.cards c
  where c.id = p_card_id;
$$;

create or replace function public.create_challenge_with_wager(
  p_challenged_id uuid,
  p_wager_type text,
  p_coin_amount integer default null,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pair_key text;
  v_existing public.challenges%rowtype;
  v_challenge public.challenges%rowtype;
  v_snapshot jsonb;
begin
  if p_wager_type is null then raise exception 'Choose a wager type'; end if;
  if v_uid is null or p_challenged_id is null or v_uid = p_challenged_id then
    raise exception 'Invalid challenge participants';
  end if;
  if p_wager_type not in ('coins', 'card') then
    raise exception 'Choose a supported wager type';
  end if;
  if p_wager_type = 'coins' and (p_coin_amount is null or p_coin_amount < 1 or p_coin_amount > 1000000 or p_card_id is not null) then
    raise exception 'Invalid coin wager';
  end if;
  if p_wager_type = 'card' and (p_card_id is null or p_coin_amount is not null) then
    raise exception 'Choose a card to wager';
  end if;

  v_pair_key := least(v_uid::text, p_challenged_id::text)
    || ':' || greatest(v_uid::text, p_challenged_id::text);
  perform pg_advisory_xact_lock(hashtextextended(v_pair_key, 0));

  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = v_uid and addressee_id = p_challenged_id)
        or (requester_id = p_challenged_id and addressee_id = v_uid))
  ) then
    raise exception 'An accepted friendship is required to challenge this player';
  end if;

  select * into v_existing
  from public.challenges
  where status in ('pending', 'accepted')
    and ((challenger_id = v_uid and challenged_id = p_challenged_id)
      or (challenger_id = p_challenged_id and challenged_id = v_uid))
  limit 1;
  if found then return null; end if;

  if p_wager_type = 'coins' then
    update public.profiles
    set coins = coins - p_coin_amount
    where id = v_uid and coins >= p_coin_amount;
    if not found then raise exception 'Insufficient coins for this wager'; end if;
  else
    perform 1 from public.cards where id = p_card_id and user_id = v_uid for update;
    if not found then raise exception 'The selected card is not owned by you'; end if;
    if exists (select 1 from public.listings where card_id = p_card_id and status = 'active') then
      raise exception 'Cancel the active listing before wagering this card';
    end if;
    if exists (select 1 from public.challenge_wager_escrow where card_id = p_card_id and status = 'held') then
      raise exception 'This card is already reserved for another wager';
    end if;
    v_snapshot := public.challenge_card_snapshot(p_card_id);
  end if;

  insert into public.challenges (
    challenger_id, challenged_id, status, wager_type, coin_amount,
    challenger_card_id, challenger_card_snapshot
  ) values (
    v_uid, p_challenged_id, 'pending', p_wager_type, p_coin_amount,
    case when p_wager_type = 'card' then p_card_id else null end, v_snapshot
  )
  returning * into v_challenge;

  insert into public.challenge_wager_escrow(challenge_id, user_id, coins, card_id)
  values (
    v_challenge.id,
    v_uid,
    case when p_wager_type = 'coins' then p_coin_amount else 0 end,
    case when p_wager_type = 'card' then p_card_id else null end
  );
  return to_jsonb(v_challenge);
end;
$$;

create or replace function public.accept_challenge_with_wager(
  p_challenge_id uuid,
  p_card_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.challenges%rowtype;
  v_snapshot jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_challenge
  from public.challenges
  where id = p_challenge_id and challenged_id = v_uid and status = 'pending'
  for update;
  if not found then return false; end if;
  if not exists (
    select 1 from public.challenge_wager_escrow
    where challenge_id = p_challenge_id and user_id = v_challenge.challenger_id and status = 'held'
  ) then
    raise exception 'The challenge wager is unavailable';
  end if;

  if v_challenge.wager_type = 'coins' then
    if p_card_id is not null then raise exception 'This challenge requires a coin wager'; end if;
    update public.profiles
    set coins = coins - v_challenge.coin_amount
    where id = v_uid and coins >= v_challenge.coin_amount;
    if not found then raise exception 'Insufficient coins to match this wager'; end if;
    insert into public.challenge_wager_escrow(challenge_id, user_id, coins)
    values (p_challenge_id, v_uid, v_challenge.coin_amount);
  elsif v_challenge.wager_type = 'card' then
    if p_card_id is null then raise exception 'Choose a card to match this wager'; end if;
    perform 1 from public.cards where id = p_card_id and user_id = v_uid for update;
    if not found then raise exception 'The selected card is not owned by you'; end if;
    if exists (select 1 from public.listings where card_id = p_card_id and status = 'active') then
      raise exception 'Cancel the active listing before wagering this card';
    end if;
    if exists (select 1 from public.challenge_wager_escrow where card_id = p_card_id and status = 'held') then
      raise exception 'This card is already reserved for another wager';
    end if;
    v_snapshot := public.challenge_card_snapshot(p_card_id);
    insert into public.challenge_wager_escrow(challenge_id, user_id, card_id)
    values (p_challenge_id, v_uid, p_card_id);
    update public.challenges
    set challenged_card_id = p_card_id, challenged_card_snapshot = v_snapshot
    where id = p_challenge_id;
  else
    raise exception 'This challenge has no supported wager';
  end if;

  update public.challenges
  set status = 'accepted',
      seed = floor(random() * 2147483647)::bigint,
      updated_at = now()
  where id = p_challenge_id and status = 'pending';
  return found;
end;
$$;

create or replace function public.abandon_challenge(p_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.challenges
  set status = 'cancelled', updated_at = now()
  where id = p_challenge_id
    and status in ('pending', 'accepted')
    and (challenger_id = auth.uid() or challenged_id = auth.uid())
    and not challenger_ready
    and not challenged_ready
    and result is null
    and simulation_claim_token is null;
  return found;
end;
$$;

create or replace function public.settle_challenge_wager()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_winner_id uuid;
  v_result text;
  v_escrow public.challenge_wager_escrow%rowtype;
  v_total_coins integer;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if new.wager_type is null then return new; end if;
  v_winner_id := case
    when new.home_score > new.away_score then new.challenger_id
    when new.away_score > new.home_score then new.challenged_id
    else null
  end;
  v_result := case when v_winner_id is null then 'draw' else 'win' end;
  insert into public.challenge_wager_results(challenge_id, winner_id, result)
  values (new.id, v_winner_id, v_result)
  on conflict (challenge_id) do nothing;
  if not found then return new; end if;

  if not exists (
    select 1 from public.challenge_wager_escrow
    where challenge_id = new.id and status = 'held'
    having count(*) = 2
  ) then
    raise exception 'Both challenge wagers must be held before settlement';
  end if;

  if new.wager_type = 'coins' then
    select coalesce(sum(coins), 0) into v_total_coins
    from public.challenge_wager_escrow
    where challenge_id = new.id and status = 'held';
    if v_winner_id is null then
      for v_escrow in select * from public.challenge_wager_escrow where challenge_id = new.id and status = 'held'
      loop
        update public.profiles set coins = coins + v_escrow.coins where id = v_escrow.user_id;
      end loop;
    else
      update public.profiles set coins = coins + v_total_coins where id = v_winner_id;
    end if;
    update public.challenge_wager_escrow set status = case when v_winner_id is null then 'refunded' else 'settled' end
    where challenge_id = new.id and status = 'held';
  else
    if v_winner_id is null then
      update public.challenge_wager_escrow set status = 'refunded'
      where challenge_id = new.id and status = 'held';
    else
      update public.challenge_wager_escrow set status = 'settled'
      where challenge_id = new.id and status = 'held';
      update public.cards c
      set user_id = v_winner_id
      from public.challenge_wager_escrow e
      where e.challenge_id = new.id
        and e.user_id <> v_winner_id
        and e.card_id = c.id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.refund_cancelled_challenge_wager()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escrow public.challenge_wager_escrow%rowtype;
begin
  if new.status not in ('rejected', 'cancelled', 'abandoned')
     or old.status not in ('pending', 'accepted')
     or old.challenger_ready or old.challenged_ready
     or old.result is not null then
    return new;
  end if;
  for v_escrow in
    select * from public.challenge_wager_escrow
    where challenge_id = new.id and status = 'held'
  loop
    if v_escrow.coins > 0 then
      update public.profiles set coins = coins + v_escrow.coins where id = v_escrow.user_id;
    end if;
    update public.challenge_wager_escrow set status = 'refunded' where id = v_escrow.id;
  end loop;
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
  ) then
    raise exception 'This card is reserved for an active challenge wager';
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
  ) then
    raise exception 'This card is reserved for an active challenge wager';
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_settle_wager on public.challenges;
create trigger challenges_settle_wager
after update of status on public.challenges
for each row execute function public.settle_challenge_wager();

drop trigger if exists challenges_refund_wager on public.challenges;
create trigger challenges_refund_wager
after update of status on public.challenges
for each row execute function public.refund_cancelled_challenge_wager();

drop trigger if exists cards_prevent_reserved_delete on public.cards;
create trigger cards_prevent_reserved_delete
before delete on public.cards
for each row execute function public.prevent_reserved_card_mutation();

drop trigger if exists cards_prevent_reserved_transfer on public.cards;
create trigger cards_prevent_reserved_transfer
before update of user_id on public.cards
for each row
when (old.user_id is distinct from new.user_id)
execute function public.prevent_reserved_card_mutation();

drop trigger if exists listings_prevent_reserved_card on public.listings;
create trigger listings_prevent_reserved_card
before insert or update of card_id on public.listings
for each row execute function public.prevent_reserved_card_listing();

revoke all on function public.create_challenge(uuid) from public, anon, authenticated;
revoke all on function public.accept_challenge(uuid) from public, anon, authenticated;
revoke all on function public.create_challenge_with_wager(uuid, text, integer, uuid) from public, anon;
revoke all on function public.accept_challenge_with_wager(uuid, uuid) from public, anon;
revoke all on function public.abandon_challenge(uuid) from public, anon;
revoke all on function public.challenge_card_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.get_available_wager_card_ids() from public, anon;
revoke all on function public.settle_challenge_wager() from public, anon, authenticated;
revoke all on function public.refund_cancelled_challenge_wager() from public, anon, authenticated;
revoke all on function public.prevent_reserved_card_mutation() from public, anon, authenticated;
revoke all on function public.prevent_reserved_card_listing() from public, anon, authenticated;
grant execute on function public.create_challenge_with_wager(uuid, text, integer, uuid) to authenticated;
grant execute on function public.accept_challenge_with_wager(uuid, uuid) to authenticated;
grant execute on function public.get_available_wager_card_ids() to authenticated;
grant execute on function public.abandon_challenge(uuid) to authenticated;

create table if not exists public.pool_competitive_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating integer not null default 1000,
  peak_rating integer not null default 1000,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now(),
  check (matches_played = wins + losses + draws)
);

create table if not exists public.pool_competitive_results (
  match_id uuid primary key references public.pool_matches(id) on delete cascade,
  player1_id uuid not null references auth.users(id) on delete cascade,
  player2_id uuid not null references auth.users(id) on delete cascade,
  winner_id uuid references auth.users(id) on delete set null,
  settled_at timestamptz not null default now(),
  check (player1_id <> player2_id)
);

alter table public.pool_competitive_ratings enable row level security;
alter table public.pool_competitive_results enable row level security;
revoke all on public.pool_competitive_ratings from public, anon, authenticated;
revoke all on public.pool_competitive_results from public, anon, authenticated;

create index if not exists pool_competitive_ratings_ranking_idx
  on public.pool_competitive_ratings(rating desc, user_id)
  where matches_played > 0;

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
     or new.player1_id is null
     or new.player2_id is null
     or new.player1_id = new.player2_id then
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

  v_actual1 := case
    when new.winner_id = new.player1_id then 1
    when new.winner_id = new.player2_id then 0
    else 0.5
  end;
  v_delta1 := round(32 * (v_actual1 - 1 / (1 + power(10::numeric, (v_rating2 - v_rating1)::numeric / 400))))::integer;
  v_delta2 := -v_delta1;

  update public.pool_competitive_ratings
  set rating = rating + v_delta1,
      peak_rating = greatest(peak_rating, rating + v_delta1),
      matches_played = matches_played + 1,
      wins = wins + case when v_actual1 = 1 then 1 else 0 end,
      losses = losses + case when v_actual1 = 0 then 1 else 0 end,
      draws = draws + case when v_actual1 = 0.5 then 1 else 0 end,
      updated_at = now()
  where user_id = new.player1_id;
  update public.pool_competitive_ratings
  set rating = rating + v_delta2,
      peak_rating = greatest(peak_rating, rating + v_delta2),
      matches_played = matches_played + 1,
      wins = wins + case when v_actual1 = 0 then 1 else 0 end,
      losses = losses + case when v_actual1 = 1 then 1 else 0 end,
      draws = draws + case when v_actual1 = 0.5 then 1 else 0 end,
      updated_at = now()
  where user_id = new.player2_id;
  return new;
end;
$$;

drop trigger if exists pool_matches_competitive_result on public.pool_matches;
create trigger pool_matches_competitive_result
after update of status on public.pool_matches
for each row execute function public.apply_pool_competitive_result();

create or replace function public.pool_competitive_list_players(
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null
)
returns table (
  user_id uuid,
  player_position bigint,
  name text,
  avatar_url text,
  rating integer,
  peak_rating integer,
  matches_played integer,
  wins integer,
  losses integer,
  draws integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      rating.user_id,
      row_number() over (order by rating.rating desc, rating.matches_played desc, rating.user_id) as player_position,
      coalesce(profile.name, 'Jogador') as name,
      profile.avatar_url,
      rating.rating,
      rating.peak_rating,
      rating.matches_played,
      rating.wins,
      rating.losses,
      rating.draws
    from public.pool_competitive_ratings rating
    join public.profiles profile on profile.id = rating.user_id
    where rating.matches_played > 0
      and (nullif(btrim(p_search), '') is null or profile.name ilike '%' || btrim(p_search) || '%')
  )
  select ranked.user_id, ranked.player_position, ranked.name, ranked.avatar_url,
    ranked.rating, ranked.peak_rating, ranked.matches_played, ranked.wins, ranked.losses, ranked.draws
  from ranked
  order by ranked.player_position
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.apply_pool_competitive_result() from public, anon, authenticated;
revoke all on function public.pool_competitive_list_players(integer, integer, text) from public, anon;
grant execute on function public.pool_competitive_list_players(integer, integer, text) to authenticated;
