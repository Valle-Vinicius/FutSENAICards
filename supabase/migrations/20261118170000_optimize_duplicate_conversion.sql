create index if not exists idx_cards_user_name
  on public.cards(user_id, name);

create index if not exists idx_challenges_challenger_card
  on public.challenges(challenger_card_id);

create index if not exists idx_challenges_challenged_card
  on public.challenges(challenged_card_id);

create index if not exists idx_pool_matches_p1_card
  on public.pool_matches(player1_card_id);

create index if not exists idx_pool_matches_p2_card
  on public.pool_matches(player2_card_id);

create index if not exists idx_cwe_card
  on public.challenge_wager_escrow(card_id);

create index if not exists idx_pwe_card
  on public.pool_wager_escrow(card_id);

create index if not exists idx_listings_card
  on public.listings(card_id);

create index if not exists idx_squads_user
  on public.squads(user_id);

create index if not exists idx_saved_squads_user
  on public.saved_squads(user_id);

create or replace function public.notify_admin_user_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
as $$
declare
  v_key text := tg_argv[0];
  v_new_user_id uuid;
  v_old_user_id uuid;
  v_notify_setting text;
begin
  if coalesce(pg_catalog.current_setting('app.skip_admin_notify', true), '') = '1' then
    return null;
  end if;

  if tg_op <> 'DELETE' then
    v_new_user_id := (to_jsonb(new) ->> v_key)::uuid;
  end if;
  if tg_op <> 'INSERT' then
    v_old_user_id := (to_jsonb(old) ->> v_key)::uuid;
  end if;

  if v_new_user_id is not null then
    v_notify_setting := 'app.admin_notify_' || replace(v_new_user_id::text, '-', '_');
    if coalesce(pg_catalog.current_setting(v_notify_setting, true), '') <> '1' then
      perform pg_catalog.set_config(v_notify_setting, '1', true);
      perform realtime.send(
        jsonb_build_object('user_id', v_new_user_id),
        'user-updated',
        'admin-users',
        true
      );
    end if;
  end if;

  if v_old_user_id is not null and v_old_user_id is distinct from v_new_user_id then
    v_notify_setting := 'app.admin_notify_' || replace(v_old_user_id::text, '-', '_');
    if coalesce(pg_catalog.current_setting(v_notify_setting, true), '') <> '1' then
      perform pg_catalog.set_config(v_notify_setting, '1', true);
      perform realtime.send(
        jsonb_build_object('user_id', v_old_user_id),
        'user-updated',
        'admin-users',
        true
      );
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists profiles_notify_admin_user_change on public.profiles;
create trigger profiles_notify_admin_user_change
after insert or update of name, coins, xp, level on public.profiles
for each row execute function public.notify_admin_user_change('id');

create or replace function public.convert_duplicates()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
set statement_timeout = '30s'
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
    where c.user_id = v_uid and c.rarity not in ('icon', 'secret') and config.rarity is null
  ) then
    raise exception 'A duplicate conversion value is missing for one of your card rarities';
  end if;

  perform pg_catalog.set_config('app.skip_admin_notify', '1', true);

  with mine as materialized (
    select id, name, rarity, favorite, overall
    from public.cards
    where user_id = v_uid
  ),
  squad_sources as materialized (
    select starters, bench
    from public.squads
    where user_id = v_uid
    union all
    select starters, bench
    from public.saved_squads
    where user_id = v_uid
  ),
  squad_refs as materialized (
    select case pg_catalog.jsonb_typeof(ref.value)
      when 'string' then ref.value #>> '{}'
      when 'object' then ref.value ->> 'uid'
    end as card_id
    from squad_sources s
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(s.starters, '[]'::jsonb) || coalesce(s.bench, '[]'::jsonb)
    ) as ref(value)
  ),
  locked as materialized (
    select card_id from squad_refs where card_id is not null
    union
    select l.card_id::text
    from public.listings l
    join mine m on m.id = l.card_id
    where l.status = 'active'
    union
    select e.card_id::text
    from public.challenge_wager_escrow e
    join mine m on m.id = e.card_id
    union
    select c.challenger_card_id::text
    from public.challenges c
    join mine m on m.id = c.challenger_card_id
    union
    select c.challenged_card_id::text
    from public.challenges c
    join mine m on m.id = c.challenged_card_id
    union
    select p.player1_card_id::text
    from public.pool_matches p
    join mine m on m.id = p.player1_card_id
    union
    select p.player2_card_id::text
    from public.pool_matches p
    join mine m on m.id = p.player2_card_id
    union
    select e.card_id::text
    from public.pool_wager_escrow e
    join mine m on m.id = e.card_id
  ),
  ranked as materialized (
    select m.id, m.name, m.rarity, m.favorite,
      row_number() over (
        partition by m.name
        order by m.favorite desc,
          case m.rarity when 'secret' then 6 when 'icon' then 5 when 'legendary' then 4
                        when 'epic' then 3 when 'rare' then 2 when 'uncommon' then 1 else 0 end desc,
          m.overall desc
      ) as rn
    from mine m
  ),
  eligible as materialized (
    select r.id
    from ranked r
    where r.rn > 1
      and r.rarity not in ('icon', 'secret')
      and not r.favorite
      and not exists (
        select 1 from locked l where l.card_id = r.id::text
      )
    order by r.name, r.rn, r.id
    limit 100
  ),
  deleted as (
    delete from public.cards c
    using eligible e
    where c.id = e.id and c.user_id = v_uid
    returning c.rarity
  )
  select count(*)::integer,
    coalesce(sum(config.duplicate_conversion_coins), 0)::integer
    into v_count, v_coins
  from deleted
  join public.economy_config config on config.rarity = deleted.rarity;

  if v_count > 0 then
    update public.profiles set coins = coins + v_coins where id = v_uid;
    insert into public.transactions (user_id, amount, reason, type)
    values (v_uid, v_coins, 'Conversão de ' || v_count || ' duplicatas', 'earn');

    perform realtime.send(
      jsonb_build_object('user_id', v_uid),
      'user-updated',
      'admin-users',
      true
    );
  end if;

  return jsonb_build_object('count', v_count, 'coins', v_coins);
end;
$$;

revoke all on function public.convert_duplicates() from public, anon;
grant execute on function public.convert_duplicates() to authenticated;

notify pgrst, 'reload schema';
