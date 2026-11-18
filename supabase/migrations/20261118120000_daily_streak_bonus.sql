alter table public.profiles
  add column if not exists daily_streak integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_daily_streak_nonnegative'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_daily_streak_nonnegative check (daily_streak >= 0);
  end if;
end;
$$;

revoke update (daily_streak) on public.profiles from authenticated;

create or replace function public.claim_daily()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_last_day date;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_previous_streak integer;
  v_streak integer;
  v_bonus integer;
  v_reward integer;
  v_new_coins integer;
  v_xp integer;
  v_level integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select last_daily_claim, daily_streak
  into v_last, v_previous_streak
  from public.profiles
  where id = v_uid
  for update;
  if not found then raise exception 'Profile not found'; end if;

  if v_last is not null then
    v_last_day := (v_last at time zone 'America/Sao_Paulo')::date;
    if v_last_day = v_today then raise exception 'Already claimed today'; end if;
  end if;

  v_streak := case
    when v_last_day = v_today - 1 then v_previous_streak + 1
    else 1
  end;
  v_bonus := least((v_streak - 1) * 100, 1000);
  v_reward := 500 + floor(random() * 501)::integer + v_bonus;

  update public.profiles
  set coins = coins + v_reward,
      last_daily_claim = now(),
      daily_streak = v_streak,
      xp = xp + 40
  where id = v_uid
  returning coins, xp, least(99, floor(xp / 500)::integer + 1)
  into v_new_coins, v_xp, v_level;

  update public.profiles set level = v_level where id = v_uid;
  insert into public.transactions (user_id, amount, reason, type)
  values (v_uid, v_reward, 'Recompensa diária', 'earn');

  return json_build_object(
    'amount', v_reward,
    'bonus', v_bonus,
    'streak', v_streak,
    'coins', v_new_coins,
    'xp', v_xp,
    'level', v_level
  );
end;
$$;

revoke all on function public.claim_daily() from public, anon;
grant execute on function public.claim_daily() to authenticated;
