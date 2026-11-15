create table if not exists public.economy_config (
  rarity text primary key check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  duplicate_conversion_coins integer not null check (duplicate_conversion_coins >= 0)
);

alter table public.economy_config enable row level security;
drop policy if exists "authenticated can read economy config" on public.economy_config;
create policy "authenticated can read economy config"
  on public.economy_config for select to authenticated using (true);
revoke all on public.economy_config from public, anon, authenticated;
grant select on public.economy_config to authenticated;

insert into public.economy_config (rarity, duplicate_conversion_coins)
values
  ('common', 50),
  ('uncommon', 100),
  ('rare', 250),
  ('epic', 600),
  ('legendary', 1500)
on conflict (rarity) do update
set duplicate_conversion_coins = excluded.duplicate_conversion_coins;

alter table public.sbc_completions
  add column if not exists created_at timestamptz;
update public.sbc_completions set created_at = 'epoch'::timestamptz where created_at is null;
alter table public.sbc_completions
  alter column created_at set default now(),
  alter column created_at set not null;
create index if not exists sbc_completions_daily_limit_idx
  on public.sbc_completions(user_id, sbc_id, created_at);

drop function if exists public.convert_duplicates();

create or replace function public.convert_duplicates()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_coins integer := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  if (select count(*) from public.economy_config) <> 5 then
    raise exception 'Duplicate conversion values are not configured for every rarity';
  end if;
  if exists (
    select 1
    from public.cards c
    left join public.economy_config config on config.rarity = c.rarity
    where c.user_id = v_uid and c.rarity is distinct from 'icon' and config.rarity is null
  ) then
    raise exception 'A duplicate conversion value is missing for one of your card rarities';
  end if;

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
        or exists (
          select 1 from public.challenge_wager_escrow e
          where e.card_id = c.id
        )
        or exists (
          select 1 from public.challenges ch
          where ch.challenger_card_id = c.id
             or ch.challenged_card_id = c.id
        )
        or exists (
          select 1 from public.pool_matches m
          where m.player1_card_id = c.id
             or m.player2_card_id = c.id
        )
        or exists (
          select 1 from public.pool_wager_escrow e
          where e.card_id = c.id
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
    returning c.rarity
  )
  select count(*)::integer, coalesce(sum(config.duplicate_conversion_coins), 0)::integer
  into v_count, v_coins
  from deleted
  join public.economy_config config on config.rarity = deleted.rarity;

  if v_count > 0 then
    update public.profiles set coins = coins + v_coins where id = v_uid;
    insert into public.transactions (user_id, amount, reason, type)
    values (v_uid, v_coins, 'Conversão de ' || v_count || ' duplicatas', 'earn');
  end if;

  return jsonb_build_object('count', v_count, 'coins', v_coins);
end;
$$;

create or replace function public.complete_sbc(p_sbc_id text, p_card_ids uuid[])
returns json
language plpgsql
security definer
set search_path = public, pg_temp
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
    when 'sbc2' then v_expected := 5; v_reward := 800;
    when 'sbc3' then v_expected := 3; v_reward := 600;
    else raise exception 'Unknown SBC';
  end case;
  if cardinality(p_card_ids) <> v_expected then raise exception 'Incorrect number of cards'; end if;

  if p_sbc_id = 'sbc1' and exists (
    select 1 from public.sbc_completions where user_id = v_uid and sbc_id = p_sbc_id
  ) then raise exception 'This SBC has already been completed'; end if;

  if p_sbc_id in ('sbc2', 'sbc3') and (
    select count(*) from public.sbc_completions
    where user_id = v_uid and sbc_id = p_sbc_id
      and created_at >= date_trunc('day', now())
  ) >= 3 then
    raise exception 'Daily limit reached: this SBC can be completed at most 3 times per day';
  end if;

  perform 1
  from public.cards
  where user_id = v_uid and id = any(p_card_ids)
  order by id
  for update;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(p_card_ids) then
    raise exception 'One or more selected cards are no longer owned by you';
  end if;

  if exists (
    select 1 from public.cards
    where user_id = v_uid and id = any(p_card_ids) and rarity = 'icon'
  ) then raise exception 'Icon cards cannot be submitted to an SBC'; end if;
  if exists (
    select 1 from public.cards
    where user_id = v_uid and id = any(p_card_ids) and favorite
  ) then raise exception 'Favorite cards cannot be submitted to an SBC'; end if;

  if exists (
    select 1 from public.listings
    where card_id = any(p_card_ids) and status = 'active'
  ) then raise exception 'Cancel the active market listing before submitting this card'; end if;

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
  ) then raise exception 'Remove selected cards from active and saved squads first'; end if;

  if exists (
    select 1 from public.challenge_wager_escrow e
    where e.card_id = any(p_card_ids)
  ) then raise exception 'A selected card is reserved in a challenge wager'; end if;
  if exists (
    select 1 from public.challenges ch
    where ch.challenger_card_id = any(p_card_ids)
       or ch.challenged_card_id = any(p_card_ids)
  ) then raise exception 'A selected card is linked to a challenge'; end if;
  if exists (
    select 1 from public.pool_matches m
    where m.player1_card_id = any(p_card_ids)
       or m.player2_card_id = any(p_card_ids)
  ) then raise exception 'A selected card is linked to a pool match'; end if;
  if exists (
    select 1 from public.pool_wager_escrow e
    where e.card_id = any(p_card_ids)
  ) then raise exception 'A selected card is reserved in a pool wager'; end if;

  if p_sbc_id = 'sbc1' and exists (
    select 1 from public.cards where user_id = v_uid and id = any(p_card_ids) and coalesce(overall, 0) < 75
  ) then raise exception 'SBC Ouro requires cards with overall 75 or higher'; end if;
  if p_sbc_id = 'sbc2' and (
    (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'GK') <> 1
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Fixo') <> 1
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Ala') <> 2
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Pivo') <> 1
  ) then raise exception 'SBC Futsal requires 1 goalkeeper, 1 fixo, 2 alas, and 1 pivô'; end if;
  if p_sbc_id = 'sbc3' and (
    select count(distinct club) from public.cards where user_id = v_uid and id = any(p_card_ids)
  ) <> 1 then raise exception 'SBC de Clube requires all selected cards to be from the same club'; end if;

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

revoke all on function public.convert_duplicates() from public, anon;
revoke all on function public.complete_sbc(text, uuid[]) from public, anon;
grant execute on function public.convert_duplicates() to authenticated;
grant execute on function public.complete_sbc(text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
