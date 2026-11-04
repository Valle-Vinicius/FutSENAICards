drop policy if exists "challenges_insert_own" on public.challenges;
drop policy if exists "challenges_update_parties" on public.challenges;
revoke insert, update, delete, truncate on public.challenges from public, anon, authenticated;

revoke insert, update, delete, truncate on public.challenge_rewards from public, anon, authenticated;
revoke truncate on public.matches from public, anon, authenticated;

create or replace function public.guard_pvp_match_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text := auth.role();
  v_challenge public.challenges%rowtype;
  v_expected_home_score integer;
  v_expected_away_score integer;
begin
  if tg_op = 'DELETE' then
    if (old.match_type = 'pvp' or old.challenge_id is not null)
       and v_role is distinct from 'service_role' then
      raise exception 'Official PvP match history can only be deleted by the service role';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.match_type = 'pvp' or old.challenge_id is not null
       or new.match_type = 'pvp' or new.challenge_id is not null then
      raise exception 'PvP match history is immutable';
    end if;
    return new;
  end if;

  if new.match_type = 'pvp' or new.challenge_id is not null then
    if v_role in ('anon', 'authenticated') then
      raise exception 'PvP match history can only be written by official challenge completion';
    end if;
    if new.match_type is distinct from 'pvp'
       or new.challenge_id is null
       or new.status is distinct from 'completed' then
      raise exception 'Invalid official PvP match history record';
    end if;

    select *
    into v_challenge
    from public.challenges challenge
    where challenge.id = new.challenge_id
      and challenge.status = 'completed'
      and challenge.result #>> '{config,mode}' = 'pvp'
      and challenge.challenger_ready
      and challenge.challenged_ready
      and challenge.home_snapshot is not null
      and challenge.away_snapshot is not null
      and challenge.home_score is not null
      and challenge.away_score is not null
      and challenge.result ->> 'homeScore' = challenge.home_score::text
      and challenge.result ->> 'awayScore' = challenge.away_score::text
      and exists (
        select 1
        from public.challenge_rewards reward
        where reward.challenge_id = challenge.id
          and reward.user_id = new.user_id
      )
    for update;

    if not found
       or new.user_id not in (v_challenge.challenger_id, v_challenge.challenged_id) then
      raise exception 'PvP history must reference an official completed challenge participant';
    end if;

    if new.user_id = v_challenge.challenger_id then
      v_expected_home_score := v_challenge.home_score;
      v_expected_away_score := v_challenge.away_score;
    else
      v_expected_home_score := v_challenge.away_score;
      v_expected_away_score := v_challenge.home_score;
    end if;

    if v_challenge.result ->> 'homeScore' is distinct from v_challenge.home_score::text
       or v_challenge.result ->> 'awayScore' is distinct from v_challenge.away_score::text
       or new.home_score is distinct from v_expected_home_score
       or new.away_score is distinct from v_expected_away_score then
      raise exception 'PvP history score does not match the official challenge result';
    end if;

    if exists (
      select 1
      from public.matches history
      where history.challenge_id = new.challenge_id
        and history.user_id = new.user_id
    ) then
      raise exception 'Official PvP match history already exists for this challenge participant';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_pvp_match_history() from public, anon, authenticated;

drop trigger if exists matches_guard_pvp_history on public.matches;
create trigger matches_guard_pvp_history
  before insert or update or delete on public.matches
  for each row
  execute function public.guard_pvp_match_history();

create or replace function public.delete_account_owned_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role is required to delete account data';
  end if;
  if p_user_id is null then
    raise exception 'A user ID is required';
  end if;

  delete from public.matches where user_id = p_user_id;
  delete from public.cards where user_id = p_user_id;
  delete from public.squads where user_id = p_user_id;
  delete from public.saved_squads where user_id = p_user_id;
  delete from public.leaderboard where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.delete_account_owned_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_owned_data(uuid) to service_role;

notify pgrst, 'reload schema';
