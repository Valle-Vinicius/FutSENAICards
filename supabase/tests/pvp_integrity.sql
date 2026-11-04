do $$
declare
  v_role text;
begin
  if has_table_privilege('authenticated', 'public.challenges', 'INSERT')
     or has_table_privilege('authenticated', 'public.challenges', 'UPDATE')
     or has_table_privilege('authenticated', 'public.challenges', 'DELETE')
     or has_table_privilege('anon', 'public.challenges', 'INSERT')
     or has_table_privilege('anon', 'public.challenges', 'UPDATE')
     or has_table_privilege('anon', 'public.challenges', 'DELETE') then
    raise exception 'Untrusted roles must not write challenge rows directly';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.challenges', 'TRUNCATE')
       or has_table_privilege(v_role, 'public.challenge_rewards', 'INSERT')
       or has_table_privilege(v_role, 'public.challenge_rewards', 'UPDATE')
       or has_table_privilege(v_role, 'public.challenge_rewards', 'DELETE')
       or has_table_privilege(v_role, 'public.challenge_rewards', 'TRUNCATE')
       or has_table_privilege(v_role, 'public.player_competitive_ratings', 'INSERT')
       or has_table_privilege(v_role, 'public.player_competitive_ratings', 'UPDATE')
       or has_table_privilege(v_role, 'public.player_competitive_ratings', 'DELETE')
       or has_table_privilege(v_role, 'public.player_competitive_ratings', 'TRUNCATE')
       or has_table_privilege(v_role, 'public.competitive_rating_events', 'INSERT')
       or has_table_privilege(v_role, 'public.competitive_rating_events', 'UPDATE')
       or has_table_privilege(v_role, 'public.competitive_rating_events', 'DELETE')
       or has_table_privilege(v_role, 'public.competitive_rating_events', 'TRUNCATE') then
      raise exception '% must not write challenges, rewards, ratings, or rating events directly', v_role;
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.matches', 'INSERT')
     or not has_table_privilege('authenticated', 'public.matches', 'DELETE') then
    raise exception 'Legacy local/AI match history writes must remain available to authenticated users';
  end if;
  if has_table_privilege('anon', 'public.matches', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.matches', 'TRUNCATE') then
    raise exception 'Untrusted roles must not bypass match row guards with TRUNCATE';
  end if;
  if has_table_privilege('service_role', 'public.matches', 'INSERT')
     or has_table_privilege('service_role', 'public.matches', 'UPDATE')
     or has_table_privilege('service_role', 'public.matches', 'DELETE')
     or has_table_privilege('service_role', 'public.matches', 'TRUNCATE') then
    raise exception 'service_role must write match history only through SECURITY DEFINER RPCs';
  end if;
  if has_table_privilege('service_role', 'public.challenges', 'INSERT')
     or has_table_privilege('service_role', 'public.challenges', 'UPDATE')
     or has_table_privilege('service_role', 'public.challenges', 'DELETE')
     or has_table_privilege('service_role', 'public.challenges', 'TRUNCATE')
     or has_table_privilege('service_role', 'public.challenge_rewards', 'INSERT')
     or has_table_privilege('service_role', 'public.challenge_rewards', 'UPDATE')
     or has_table_privilege('service_role', 'public.challenge_rewards', 'DELETE')
     or has_table_privilege('service_role', 'public.challenge_rewards', 'TRUNCATE')
     or has_table_privilege('service_role', 'public.player_competitive_ratings', 'INSERT')
     or has_table_privilege('service_role', 'public.player_competitive_ratings', 'UPDATE')
     or has_table_privilege('service_role', 'public.player_competitive_ratings', 'DELETE')
     or has_table_privilege('service_role', 'public.player_competitive_ratings', 'TRUNCATE')
     or has_table_privilege('service_role', 'public.competitive_rating_events', 'INSERT')
     or has_table_privilege('service_role', 'public.competitive_rating_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.competitive_rating_events', 'DELETE')
     or has_table_privilege('service_role', 'public.competitive_rating_events', 'TRUNCATE') then
    raise exception 'service_role must mutate competitive rows only through SECURITY DEFINER RPCs';
  end if;
  if has_table_privilege('anon', 'public.pvp_anonymized_players', 'SELECT')
     or has_table_privilege('authenticated', 'public.pvp_anonymized_players', 'SELECT')
     or has_table_privilege('service_role', 'public.pvp_anonymized_players', 'SELECT') then
    raise exception 'Anonymization mappings must remain private to trusted SECURITY DEFINER functions';
  end if;

  if exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and confrelid = 'auth.users'::regclass
      and conrelid in (
        'public.challenges'::regclass,
        'public.challenge_rewards'::regclass,
        'public.competitive_rating_events'::regclass
      )
  ) then
    raise exception 'Bilateral competitive history must not cascade away with an Auth user';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pvp_anonymized_players'::regclass
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'n'
  ) then
    raise exception 'Deleting an Auth user must destroy its temporary pseudonym mapping';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.matches'::regclass
      and tgname = 'matches_guard_pvp_history'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'PvP match history must be protected by the database trigger';
  end if;
  if position(
       'Official PvP match history already exists' in
       pg_get_functiondef('public.guard_pvp_match_history()'::regprocedure)
     ) = 0
     or position(
       'for update' in lower(pg_get_functiondef('public.guard_pvp_match_history()'::regprocedure))
     ) = 0 then
    raise exception 'Official history writes must be serialized and idempotent by challenge participant';
  end if;

  if has_function_privilege('authenticated', 'public.complete_challenge(uuid, uuid, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.complete_challenge(uuid, uuid, jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.complete_challenge(uuid, uuid, jsonb)', 'EXECUTE') then
    raise exception 'Only service_role may execute official challenge completion';
  end if;

  if has_function_privilege('anon', 'public.delete_account_owned_data(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.delete_account_owned_data(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.delete_account_owned_data(uuid)', 'EXECUTE')
     or not (select prosecdef from pg_proc where oid = 'public.delete_account_owned_data(uuid)'::regprocedure) then
    raise exception 'Account cleanup must be SECURITY DEFINER and executable only by service_role';
  end if;

  if has_function_privilege('anon', 'public.competitive_search_head_to_head_opponents(uuid, text, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.competitive_search_head_to_head_opponents(uuid, text, integer)', 'EXECUTE') then
    raise exception 'Historical H2H search must be available to authenticated users only';
  end if;

  if position(
       'opponent_event' in
       pg_get_functiondef('public.competitive_get_rating_history(uuid, integer, integer)'::regprocedure)
     ) = 0 then
    raise exception 'Competitive rating history must require bilateral rating events';
  end if;
  if position(
       'historical_pvp' in
       pg_get_functiondef('public.competitive_get_head_to_head(uuid, uuid, integer, integer)'::regprocedure)
     ) = 0 then
    raise exception 'H2H must identify the total historical PvP series';
  end if;
  if position(
       'config,mode}' in
       pg_get_functiondef('public.competitive_search_head_to_head_opponents(uuid, text, integer)'::regprocedure)
     ) = 0 then
    raise exception 'Competitive and historical PvP history must be explicitly separated';
  end if;
end;
$$;
