create schema if not exists pvp_test;

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pvp-test-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pvp-test-2@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'pvp-test-3@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'pvp-test-4@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

create or replace function pvp_test.cards_snapshot(p_first_card integer, p_name text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', p_name,
    'formation', '1-2-1',
    'cards', jsonb_agg(jsonb_build_object(
      'uid', ('00000000-0000-4000-8000-' || lpad((p_first_card + card_no)::text, 12, '0'))::uuid
    ) order by card_no)
  )
  from generate_series(1, 5) as sequence(card_no);
$$;

create or replace function pvp_test.match_result(p_seed bigint, p_mode text default 'pvp')
returns jsonb
language plpgsql
immutable
as $$
declare
  v_home_players jsonb;
  v_away_players jsonb;
  v_stats jsonb;
begin
  select
    jsonb_agg(jsonb_build_object('id', (card ->> 'uid') || '_home')),
    jsonb_object_agg((card ->> 'uid') || '_home', '{}'::jsonb)
  into v_home_players, v_stats
  from jsonb_array_elements(pvp_test.cards_snapshot(10000, 'Home') -> 'cards') as home_cards(card);

  select
    jsonb_agg(jsonb_build_object('id', (card ->> 'uid') || '_away')),
    v_stats || jsonb_object_agg((card ->> 'uid') || '_away', '{}'::jsonb)
  into v_away_players, v_stats
  from jsonb_array_elements(pvp_test.cards_snapshot(20000, 'Away') -> 'cards') as away_cards(card);

  return jsonb_build_object(
    'config', jsonb_build_object(
      'mode', p_mode,
      'seed', p_seed,
      'homeFormation', '1-2-1',
      'awayFormation', '1-2-1',
      'homeName', 'Test Home',
      'awayName', 'Test Away',
      'homePlayers', v_home_players,
      'awayPlayers', v_away_players
    ),
    'frames', jsonb_build_array('{}'::jsonb),
    'playerStats', v_stats,
    'homeScore', 2,
    'awayScore', 1
  );
end;
$$;

create or replace function pvp_test.seed_challenge(
  p_challenge_id uuid,
  p_home_user uuid,
  p_away_user uuid,
  p_claim_token uuid,
  p_status text default 'accepted',
  p_ready boolean default true
)
returns void
language plpgsql
as $$
begin
  insert into public.challenges (
    id, challenger_id, challenged_id, status, seed, challenger_ready, challenged_ready,
    home_snapshot, away_snapshot, challenger_tactic, challenged_tactic,
    simulation_claimed_until, simulation_claim_token, playback_state, updated_at
  )
  values (
    p_challenge_id, p_home_user, p_away_user, p_status, 12345, p_ready, p_ready,
    case when p_ready then pvp_test.cards_snapshot(10000, 'Test Home') else null end,
    case when p_ready then pvp_test.cards_snapshot(20000, 'Test Away') else null end,
    'balanced', 'balanced', now() + interval '10 minutes', p_claim_token,
    '{"status":"waiting","currentFrame":0,"speed":1,"startedAt":null,"pausedAt":null,"serverNow":null}'::jsonb,
    now()
  );
end;
$$;

grant usage on schema pvp_test to service_role;

set request.jwt.claim.role = 'service_role';

do $cleanup$
declare
  v_match record;
begin
  for v_match in
    select id, user_id
    from public.matches
    where challenge_id in (
      '00000000-0000-4000-8000-000000001001',
      '00000000-0000-4000-8000-000000001002',
      '00000000-0000-4000-8000-000000001003',
      '00000000-0000-4000-8000-000000001004',
      '00000000-0000-4000-8000-000000001005',
      '00000000-0000-4000-8000-000000001006',
      '00000000-0000-4000-8000-000000001007',
      '00000000-0000-4000-8000-000000001008',
      '00000000-0000-4000-8000-000000001009'
    )
  loop
    perform set_config('app.pvp_account_anonymization', 'on', false);
    perform set_config('app.pvp_anonymizing_user', v_match.user_id::text, false);
    delete from public.matches where id = v_match.id;
  end loop;
  perform set_config('app.pvp_account_anonymization', 'off', false);
  perform set_config('app.pvp_anonymizing_user', '', false);
end;
$cleanup$;

delete from public.matches
where user_id = '00000000-0000-4000-8000-000000000001'
  and opponent = 'Local AI guard test';

delete from public.challenges
where id in (
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000001002',
  '00000000-0000-4000-8000-000000001003',
  '00000000-0000-4000-8000-000000001004',
  '00000000-0000-4000-8000-000000001005',
  '00000000-0000-4000-8000-000000001006',
  '00000000-0000-4000-8000-000000001007',
  '00000000-0000-4000-8000-000000001008',
  '00000000-0000-4000-8000-000000001009'
);

delete from public.pvp_anonymized_players
where source_user_id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004'
);

delete from public.player_competitive_ratings
where user_id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004'
);

select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000002001'
);
select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001002',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000002002'
);
select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001003',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000002003'
);
select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001004',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000002004'
);
select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001005',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000002005'
);
select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001006',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000002006',
  'accepted',
  false
);
select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001007',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000002007',
  'rejected',
  false
);
select pvp_test.seed_challenge(
  '00000000-0000-4000-8000-000000001008',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000002008'
);

insert into public.challenges (
  id, challenger_id, challenged_id, status, seed, challenger_ready, challenged_ready,
  home_snapshot, away_snapshot, result, home_score, away_score, completed_at, updated_at
)
values (
  '00000000-0000-4000-8000-000000001009',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'completed',
  12346,
  true,
  true,
  pvp_test.cards_snapshot(30000, 'Legacy Home'),
  pvp_test.cards_snapshot(40000, 'Legacy Away'),
  '{"config":{"mode":"pvp","homeName":"Legacy Home","awayName":"Legacy Away"},"homeScore":1,"awayScore":0}'::jsonb,
  1,
  0,
  now() - interval '1 day',
  now() - interval '1 day'
);

reset request.jwt.claim.role;
