create or replace function public.claim_daily()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_reward integer;
  v_new_coins integer;
  v_xp integer;
  v_level integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select last_daily_claim
  into v_last
  from public.profiles
  where id = v_uid
  for update;
  if not found then raise exception 'Profile not found'; end if;
  if v_last is not null and v_last::date = now()::date then
    raise exception 'Already claimed today';
  end if;

  v_reward := 500 + floor(random() * 501)::integer;
  update public.profiles
  set coins = coins + v_reward,
      last_daily_claim = now(),
      xp = xp + 40
  where id = v_uid
  returning coins, xp, least(99, floor(xp / 500)::integer + 1)
  into v_new_coins, v_xp, v_level;

  update public.profiles set level = v_level where id = v_uid;
  insert into public.transactions (user_id, amount, reason, type)
  values (v_uid, v_reward, 'Recompensa diária', 'earn');

  return json_build_object('amount', v_reward, 'coins', v_new_coins, 'xp', v_xp, 'level', v_level);
end;
$$;

create or replace function public.claim_mission(p_mission_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_new_coins integer;
  v_xp integer;
  v_level integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select *
  into v_mission
  from public.missions
  where user_id = v_uid and mission_id = p_mission_id
  for update;
  if not found then raise exception 'Mission not found'; end if;
  if not v_mission.completed then raise exception 'Mission not completed'; end if;
  if v_mission.claimed then raise exception 'Already claimed'; end if;

  update public.missions
  set claimed = true
  where user_id = v_uid and mission_id = p_mission_id and claimed = false;
  if not found then raise exception 'Already claimed'; end if;

  update public.profiles
  set coins = coins + v_mission.reward,
      xp = xp + v_mission.reward_xp
  where id = v_uid
  returning coins, xp, least(99, floor(xp / 500)::integer + 1)
  into v_new_coins, v_xp, v_level;
  if not found then raise exception 'Profile not found'; end if;

  update public.profiles set level = v_level where id = v_uid;
  insert into public.transactions (user_id, amount, reason, type)
  values (v_uid, v_mission.reward, 'Missão: ' || v_mission.title, 'earn');

  return json_build_object('coins', v_new_coins, 'xp', v_xp, 'level', v_level);
end;
$$;

create or replace function public.convert_duplicates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  with ranked as (
    select c.id,
      row_number() over (
        partition by c.name
        order by c.favorite desc,
          case c.rarity when 'icon' then 5 when 'legendary' then 4 when 'epic' then 3
                        when 'rare' then 2 when 'uncommon' then 1 else 0 end desc,
          c.overall desc
      ) as rn,
      c.rarity,
      c.favorite,
      (
        exists (
          select 1 from public.listings l
          where l.card_id = c.id and l.status = 'active'
        )
        or exists (
          select 1 from public.squads s
          where s.user_id = v_uid
            and (
              coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
            )
        )
        or exists (
          select 1 from public.saved_squads s
          where s.user_id = v_uid
            and (
              coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
            )
        )
      ) as in_use
    from public.cards c
    where c.user_id = v_uid
  ), deleted as (
    delete from public.cards c
    using ranked r
    where c.id = r.id
      and r.rn > 1
      and r.rarity <> 'icon'
      and not r.favorite
      and not r.in_use
    returning c.id
  )
  select count(*) into v_count from deleted;

  if v_count > 0 then
    update public.profiles set coins = coins + v_count * 200 where id = v_uid;
    insert into public.transactions (user_id, amount, reason, type)
    values (v_uid, v_count * 200, 'Conversão de ' || v_count || ' duplicatas', 'earn');
  end if;
  return v_count;
end;
$$;

create or replace function public.complete_sbc(p_sbc_id text, p_card_ids uuid[])
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expected integer;
  v_count integer;
  v_reward integer;
  v_new_coins integer;
  v_xp integer;
  v_level integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;
  if p_card_ids is null or cardinality(p_card_ids) = 0
     or (select count(distinct card_id) from unnest(p_card_ids) as ids(card_id)) <> cardinality(p_card_ids) then
    raise exception 'Invalid card selection';
  end if;

  case p_sbc_id
    when 'sbc1' then v_expected := 5; v_reward := 1000;
    when 'sbc2' then v_expected := 5; v_reward := 2000;
    when 'sbc3' then v_expected := 3; v_reward := 1000;
    else raise exception 'Unknown SBC';
  end case;
  if cardinality(p_card_ids) <> v_expected then raise exception 'Incorrect number of cards'; end if;

  if p_sbc_id = 'sbc1' and exists (
    select 1 from public.sbc_completions where user_id = v_uid and sbc_id = p_sbc_id
  ) then raise exception 'SBC already completed'; end if;

  perform 1
  from public.cards
  where user_id = v_uid and id = any(p_card_ids)
  order by id
  for update;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(p_card_ids) then raise exception 'One or more cards are no longer owned'; end if;

  if exists (
    select 1 from public.listings
    where card_id = any(p_card_ids) and status = 'active'
  ) then raise exception 'A selected card is listed on the market'; end if;

  if exists (
    select 1
    from public.cards c
    join public.squads s on s.user_id = v_uid
    where c.id = any(p_card_ids)
      and (
        coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
      )
  ) or exists (
    select 1
    from public.cards c
    join public.saved_squads s on s.user_id = v_uid
    where c.id = any(p_card_ids)
      and (
        coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
      )
  ) then raise exception 'A selected card is assigned to a squad'; end if;

  if p_sbc_id = 'sbc1' and exists (
    select 1 from public.cards where user_id = v_uid and id = any(p_card_ids) and coalesce(overall, 0) < 75
  ) then raise exception 'Cards do not meet the minimum overall'; end if;
  if p_sbc_id = 'sbc2' and (
    (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'GK') <> 1
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Fixo') <> 1
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Ala') <> 2
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Pivo') <> 1
  ) then raise exception 'Cards do not meet the position requirements'; end if;
  if p_sbc_id = 'sbc3' and (
    select count(distinct club) from public.cards where user_id = v_uid and id = any(p_card_ids)
  ) <> 1 then raise exception 'Cards must be from the same club'; end if;

  delete from public.cards where user_id = v_uid and id = any(p_card_ids);
  get diagnostics v_count = row_count;
  if v_count <> v_expected then raise exception 'Cards could not be consumed'; end if;

  insert into public.sbc_completions (user_id, sbc_id) values (v_uid, p_sbc_id);
  update public.profiles
  set coins = coins + v_reward,
      xp = xp + 100
  where id = v_uid
  returning coins, xp, least(99, floor(xp / 500)::integer + 1)
  into v_new_coins, v_xp, v_level;
  update public.profiles set level = v_level where id = v_uid;
  insert into public.transactions (user_id, amount, reason, type)
  values (v_uid, v_reward, 'SBC: ' || p_sbc_id, 'earn');

  return json_build_object('coins', v_new_coins, 'xp', v_xp, 'level', v_level, 'reward_coins', v_reward);
end;
$$;

create or replace function public.cancel_listing(p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update public.listings
  set status = 'cancelled'
  where id = p_listing_id
    and seller_id = v_uid
    and status = 'active';
  return found;
end;
$$;

create or replace function public.create_listing(
  p_card_id uuid,
  p_price integer,
  p_buy_now integer,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_card public.cards%rowtype;
  v_listing public.listings%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_price is null or p_price <= 0 or p_buy_now is null or p_buy_now < p_price then
    raise exception 'Invalid listing prices';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'Invalid listing expiration';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  select * into v_card
  from public.cards
  where id = p_card_id and user_id = v_uid
  for update;
  if not found then raise exception 'Card is not owned by this user'; end if;

  if exists (
    select 1 from public.listings where card_id = p_card_id and status = 'active'
  ) then raise exception 'Card already has an active listing'; end if;
  if exists (
    select 1 from public.squads s
    where s.user_id = v_uid
      and (
        coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(p_card_id::text)
        or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', p_card_id::text))
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(p_card_id::text)
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', p_card_id::text))
      )
  ) or exists (
    select 1 from public.saved_squads s
    where s.user_id = v_uid
      and (
        coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(p_card_id::text)
        or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', p_card_id::text))
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(p_card_id::text)
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', p_card_id::text))
      )
  ) then raise exception 'Remove the card from squads before listing it'; end if;

  insert into public.listings (
    seller_id, card_id, card_name, card_overall, card_position, card_rarity,
    card_image, card_attributes, price, buy_now, expires_at, status
  ) values (
    v_uid, v_card.id, v_card.name, v_card.overall, v_card.position, v_card.rarity,
    v_card.image,
    jsonb_build_object(
      'pace', v_card.pace,
      'shooting', v_card.shooting,
      'passing', v_card.passing,
      'dribbling', v_card.dribbling,
      'defending', v_card.defending,
      'physical', v_card.physical,
      'reflexes', v_card.reflexes,
      'positioning', v_card.positioning,
      'handling', v_card.handling
    ),
    p_price, p_buy_now, p_expires_at, 'active'
  )
  returning * into v_listing;

  return to_jsonb(v_listing);
end;
$$;

create or replace function public.update_user_preferences(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_preferences jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or p_patch - array['audio', 'animations', 'highContrast'] <> '{}'::jsonb then
    raise exception 'Invalid preferences';
  end if;
  if exists (
    select 1 from jsonb_each(p_patch) as item(key, value)
    where jsonb_typeof(value) <> 'boolean'
  ) then raise exception 'Preference values must be booleans'; end if;

  update public.profiles
  set preferences = coalesce(preferences, '{}'::jsonb) || p_patch
  where id = v_uid
  returning preferences into v_preferences;
  if not found then raise exception 'Profile not found'; end if;
  return v_preferences;
end;
$$;

with ranked_active_listings as (
  select id,
    row_number() over (partition by card_id order by created_at desc, id) as rn
  from public.listings
  where status = 'active' and card_id is not null
)
update public.listings l
set status = 'cancelled'
from ranked_active_listings r
where l.id = r.id and r.rn > 1;

create unique index if not exists listings_one_active_per_card_idx
  on public.listings (card_id)
  where status = 'active' and card_id is not null;

revoke insert on public.listings from authenticated;

drop policy if exists "update own listings" on public.listings;
create policy "update own listings" on public.listings
  for update to authenticated
  using (auth.uid() = seller_id and status = 'active')
  with check (auth.uid() = seller_id and status = 'cancelled');

create or replace function public.guard_listing_updates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and (
    old.status <> 'active'
    or new.status <> 'cancelled'
    or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status')
  ) then
    raise exception 'Sellers may only cancel their active listing';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_listing_updates on public.listings;
create trigger guard_listing_updates
before update on public.listings
for each row execute function public.guard_listing_updates();

revoke all on function public.claim_daily() from public, anon;
revoke all on function public.claim_mission(text) from public, anon;
revoke all on function public.convert_duplicates() from public, anon;
revoke all on function public.complete_sbc(text, uuid[]) from public, anon;
revoke all on function public.cancel_listing(uuid) from public, anon;
revoke all on function public.create_listing(uuid, integer, integer, timestamptz) from public, anon;
revoke all on function public.update_user_preferences(jsonb) from public, anon;
grant execute on function public.claim_daily() to authenticated;
grant execute on function public.claim_mission(text) to authenticated;
grant execute on function public.convert_duplicates() to authenticated;
grant execute on function public.complete_sbc(text, uuid[]) to authenticated;
grant execute on function public.cancel_listing(uuid) to authenticated;
grant execute on function public.create_listing(uuid, integer, integer, timestamptz) to authenticated;
grant execute on function public.update_user_preferences(jsonb) to authenticated;
