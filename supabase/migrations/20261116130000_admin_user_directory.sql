create table if not exists public.admin_user_audit (
  id bigint generated always as identity primary key,
  changed_by uuid not null,
  target_user_id uuid not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.admin_user_audit enable row level security;
revoke all on public.admin_user_audit from public, anon, authenticated;

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  name text,
  coins integer,
  xp integer,
  level integer,
  last_seen timestamptz,
  card_count integer,
  ranked_elo integer,
  ranked_matches integer,
  ranked_wins integer,
  pool_elo integer,
  pool_matches integer,
  pool_wins integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Not authorized';
  end if;

  return query
  select
    profile.id,
    profile.name,
    profile.coins,
    profile.xp,
    profile.level,
    profile.last_seen,
    (select count(*)::integer from public.cards card where card.user_id = profile.id),
    coalesce(ranked.rating, 1000),
    coalesce(ranked.matches_played, 0),
    coalesce(ranked.wins, 0),
    coalesce(pool.rating, 1000),
    coalesce(pool.matches_played, 0),
    coalesce(pool.wins, 0)
  from public.profiles profile
  left join public.player_competitive_ratings ranked on ranked.user_id = profile.id
  left join public.pool_competitive_ratings pool on pool.user_id = profile.id
  order by lower(coalesce(profile.name, '')), profile.id;
end;
$$;

create or replace function public.admin_update_user_stats(
  p_user_id uuid,
  p_name text,
  p_coins integer,
  p_xp integer,
  p_ranked_elo integer,
  p_pool_elo integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
begin
  if v_uid is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Not authorized';
  end if;
  if p_user_id is null then
    raise exception 'User is required';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Name must contain between 1 and 80 characters';
  end if;
  if p_coins is null or p_coins < 0 then
    raise exception 'Coins must be a non-negative integer';
  end if;
  if p_xp is null or p_xp < 0 then
    raise exception 'XP must be a non-negative integer';
  end if;
  if p_ranked_elo is null or p_ranked_elo not between 0 and 10000 then
    raise exception 'Ranked rating must be between 0 and 10000';
  end if;
  if p_pool_elo is null or p_pool_elo not between 0 and 10000 then
    raise exception 'Pool rating must be between 0 and 10000';
  end if;

  select jsonb_build_object(
    'name', profile.name,
    'coins', profile.coins,
    'xp', profile.xp,
    'ranked_elo', coalesce(ranked.rating, 1000),
    'pool_elo', coalesce(pool.rating, 1000)
  )
  into v_before
  from public.profiles profile
  left join public.player_competitive_ratings ranked on ranked.user_id = profile.id
  left join public.pool_competitive_ratings pool on pool.user_id = profile.id
  where profile.id = p_user_id
  for update of profile;
  if not found then
    raise exception 'User not found';
  end if;

  update public.profiles
  set name = btrim(p_name),
      coins = p_coins,
      xp = p_xp,
      level = least(99, floor(p_xp::numeric / 500)::integer + 1),
      updated_at = now()
  where id = p_user_id;
  update public.leaderboard
  set name = btrim(p_name)
  where user_id = p_user_id;

  insert into public.player_competitive_ratings(user_id, rating, peak_rating)
  values (p_user_id, p_ranked_elo, greatest(1000, p_ranked_elo))
  on conflict (user_id) do update
  set rating = excluded.rating,
      peak_rating = greatest(public.player_competitive_ratings.peak_rating, excluded.rating),
      updated_at = now();

  insert into public.pool_competitive_ratings(user_id, rating, peak_rating)
  values (p_user_id, p_pool_elo, greatest(1000, p_pool_elo))
  on conflict (user_id) do update
  set rating = excluded.rating,
      peak_rating = greatest(public.pool_competitive_ratings.peak_rating, excluded.rating),
      updated_at = now();

  v_after := jsonb_build_object(
    'name', btrim(p_name),
    'coins', p_coins,
    'xp', p_xp,
    'ranked_elo', p_ranked_elo,
    'pool_elo', p_pool_elo
  );

  insert into public.admin_user_audit(changed_by, target_user_id, changes)
  values (v_uid, p_user_id, jsonb_build_object('before', v_before, 'after', v_after));
end;
$$;

revoke all on function public.admin_list_users() from public, anon, authenticated;
revoke all on function public.admin_update_user_stats(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user_stats(uuid, text, integer, integer, integer, integer) to authenticated;

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
begin
  if tg_op <> 'DELETE' then
    v_new_user_id := (to_jsonb(new) ->> v_key)::uuid;
  end if;
  if tg_op <> 'INSERT' then
    v_old_user_id := (to_jsonb(old) ->> v_key)::uuid;
  end if;

  if v_new_user_id is not null then
    perform realtime.send(
      jsonb_build_object('user_id', v_new_user_id),
      'user-updated',
      'admin-users',
      true
    );
  end if;
  if v_old_user_id is not null and v_old_user_id is distinct from v_new_user_id then
    perform realtime.send(
      jsonb_build_object('user_id', v_old_user_id),
      'user-updated',
      'admin-users',
      true
    );
  end if;

  return null;
end;
$$;

revoke all on function public.notify_admin_user_change() from public, anon, authenticated;

drop trigger if exists profiles_notify_admin_user_change on public.profiles;
create trigger profiles_notify_admin_user_change
after insert or update of name, coins, xp, level, last_seen on public.profiles
for each row execute function public.notify_admin_user_change('id');

drop trigger if exists profiles_notify_admin_user_delete on public.profiles;
create trigger profiles_notify_admin_user_delete
after delete on public.profiles
for each row execute function public.notify_admin_user_change('id');

drop trigger if exists cards_notify_admin_user_change on public.cards;
create trigger cards_notify_admin_user_change
after insert or update or delete on public.cards
for each row execute function public.notify_admin_user_change('user_id');

drop trigger if exists ranked_notify_admin_user_change on public.player_competitive_ratings;
create trigger ranked_notify_admin_user_change
after insert or update or delete on public.player_competitive_ratings
for each row execute function public.notify_admin_user_change('user_id');

drop trigger if exists pool_ranked_notify_admin_user_change on public.pool_competitive_ratings;
create trigger pool_ranked_notify_admin_user_change
after insert or update or delete on public.pool_competitive_ratings
for each row execute function public.notify_admin_user_change('user_id');

drop policy if exists "admin can receive admin user updates" on realtime.messages;
create policy "admin can receive admin user updates"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'admin-users'
  and (select auth.uid()) = '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid
);
