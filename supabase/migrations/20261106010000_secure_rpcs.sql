-- Migration: Secure RPCs for game operations (server-side authority)

-- RPC: add coins (server-side)
create or replace function public.add_coins(p_amount int, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new_coins int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  update profiles set coins = coins + p_amount where id = v_uid returning coins into v_new_coins;
  insert into transactions (user_id, amount, reason, type) values (v_uid, p_amount, p_reason, 'earn');
  return v_new_coins;
end;
$$;

-- RPC: spend coins (server-side, atomic)
create or replace function public.spend_coins(p_amount int, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current int;
  v_new int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  select coins into v_current from profiles where id = v_uid for update;
  if v_current is null or v_current < p_amount then raise exception 'Insufficient coins'; end if;
  update profiles set coins = coins - p_amount where id = v_uid returning coins into v_new;
  insert into transactions (user_id, amount, reason, type) values (v_uid, p_amount, p_reason, 'spend');
  return v_new;
end;
$$;

-- RPC: add XP (server-side)
create or replace function public.add_xp(p_amount int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_xp int;
  v_level int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  update profiles set xp = xp + p_amount where id = v_uid returning xp into v_xp;
  v_level := floor(v_xp / 500) + 1;
  if v_level > 99 then v_level := 99; end if;
  update profiles set level = v_level where id = v_uid;
  return json_build_object('xp', v_xp, 'level', v_level);
end;
$$;

-- RPC: claim mission (server-side, idempotent)
create or replace function public.claim_mission(p_mission_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mission record;
  v_new_coins int;
  v_xp int;
  v_level int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_mission from missions where user_id = v_uid and mission_id = p_mission_id;
  if not found then raise exception 'Mission not found'; end if;
  if not v_mission.completed then raise exception 'Mission not completed'; end if;
  if v_mission.claimed then raise exception 'Already claimed'; end if;
  update missions set claimed = true where user_id = v_uid and mission_id = p_mission_id;
  update profiles set coins = coins + v_mission.reward where id = v_uid returning coins into v_new_coins;
  update profiles set xp = xp + v_mission.reward_xp where id = v_uid returning xp into v_xp;
  v_level := floor(v_xp / 500) + 1;
  if v_level > 99 then v_level := 99; end if;
  update profiles set level = v_level where id = v_uid;
  insert into transactions (user_id, amount, reason, type) values (v_uid, v_mission.reward, 'Missão: ' || v_mission.title, 'earn');
  return json_build_object('coins', v_new_coins, 'xp', v_xp, 'level', v_level);
end;
$$;

-- RPC: claim daily (server-side, idempotent by day)
create or replace function public.claim_daily()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_reward int;
  v_xp_reward int := 40;
  v_new_coins int;
  v_xp int;
  v_level int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select last_daily_claim into v_last from profiles where id = v_uid;
  if v_last is not null and v_last::date = now()::date then raise exception 'Already claimed today'; end if;
  v_reward := 500 + floor(random() * 501)::int;
  update profiles set coins = coins + v_reward, last_daily_claim = now() where id = v_uid returning coins into v_new_coins;
  update profiles set xp = xp + v_xp_reward where id = v_uid returning xp into v_xp;
  v_level := floor(v_xp / 500) + 1;
  if v_level > 99 then v_level := 99; end if;
  update profiles set level = v_level where id = v_uid;
  insert into transactions (user_id, amount, reason, type) values (v_uid, v_reward, 'Recompensa diária', 'earn');
  return json_build_object('amount', v_reward, 'coins', v_new_coins, 'xp', v_xp, 'level', v_level);
end;
$$;

-- RPC: update profile (name/avatar only)
create or replace function public.update_profile(p_name text, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update profiles set name = p_name, avatar_url = p_avatar_url, updated_at = now() where id = v_uid;
end;
$$;
