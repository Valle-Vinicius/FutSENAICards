alter table public.cards
  add column if not exists pack_group text not null default 'standard';

update public.cards c
set pack_group = 'off_sale'
from public.card_templates t
where c.pack_group = 'standard'
  and t.pack_group = 'off_sale'
  and lower(t.name) = lower(c.name);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_pack_group_check'
  ) then
    alter table public.cards
      add constraint cards_pack_group_check
      check (pack_group in ('standard', 'off_sale'));
  end if;
end;
$$;

drop function if exists public.admin_create_pack_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, text, integer, text
);

create or replace function public.admin_create_pack_template(
  p_name text,
  p_position text,
  p_nationality text,
  p_age integer,
  p_club text,
  p_pace integer,
  p_shooting integer,
  p_passing integer,
  p_dribbling integer,
  p_defending integer,
  p_physical integer,
  p_reflexes integer,
  p_positioning integer,
  p_handling integer,
  p_image text,
  p_special text,
  p_base_rarity text,
  p_base_overall integer,
  p_pack_group text,
  p_extra_stats jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_template_id uuid;
begin
  if v_uid is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Not authorized';
  end if;
  if p_pack_group is null or p_pack_group not in ('standard', 'off_sale') then
    raise exception 'Invalid pack group';
  end if;
  if p_extra_stats is null or jsonb_typeof(p_extra_stats) is distinct from 'array' then
    raise exception 'Extra stats must be an array';
  end if;
  if jsonb_array_length(p_extra_stats) > 10 then
    raise exception 'Extra stats must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_extra_stats) as item(stat)
    where jsonb_typeof(item.stat) is distinct from 'object'
       or jsonb_typeof(item.stat -> 'label') is distinct from 'string'
       or length(btrim(item.stat ->> 'label')) not between 1 and 30
       or jsonb_typeof(item.stat -> 'value') is distinct from 'number'
       or (item.stat ->> 'value') !~ '^(0|[1-9][0-9]{0,2})$'
  ) then
    raise exception 'Each extra stat needs a label and an integer value between 0 and 999';
  end if;
  if exists (
    select lower(btrim(item.stat ->> 'label'))
    from jsonb_array_elements(p_extra_stats) as item(stat)
    group by lower(btrim(item.stat ->> 'label'))
    having count(*) > 1
  ) then
    raise exception 'Extra stat labels must be unique';
  end if;
  if p_pack_group <> 'off_sale' and jsonb_array_length(p_extra_stats) > 0 then
    raise exception 'Extra stats are only allowed for Off-Sale templates';
  end if;

  v_template_id := public.create_card_template(
    p_name, p_position, p_nationality, p_age, p_club,
    p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical,
    p_reflexes, p_positioning, p_handling, p_image, p_special,
    p_base_rarity, p_base_overall
  );

  update public.card_templates
  set pack_group = p_pack_group,
      extra_stats = p_extra_stats
  where id = v_template_id;

  if not found then
    raise exception 'Created template could not be assigned to its pack';
  end if;

  return v_template_id;
end;
$$;

revoke all on function public.admin_create_pack_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, text, integer, text, jsonb
) from public, anon;
grant execute on function public.admin_create_pack_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, text, integer, text, jsonb
) to authenticated;

create or replace function public.admin_save_template(
  p_name text,
  p_position text,
  p_nationality text,
  p_age integer,
  p_club text,
  p_pace integer,
  p_shooting integer,
  p_passing integer,
  p_dribbling integer,
  p_defending integer,
  p_physical integer,
  p_reflexes integer,
  p_positioning integer,
  p_handling integer,
  p_image text,
  p_base_rarity text,
  p_base_overall integer,
  p_pack_group text,
  p_extra_stats jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_template_id uuid;
begin
  if v_uid is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Not authorized';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80
     or p_position is null or p_position not in ('GK', 'Fixo', 'Ala', 'Pivo')
     or p_nationality is null or length(btrim(p_nationality)) not between 1 and 50
     or p_age is null or p_age not between 14 and 60
     or p_club is null or length(btrim(p_club)) not between 1 and 80
     or p_base_rarity is null or p_base_rarity not in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'icon')
     or p_base_overall is null or p_base_overall not between 0 and 99 then
    raise exception 'Invalid template fields';
  end if;
  if p_pace is null or p_pace not between 0 and 99
     or p_shooting is null or p_shooting not between 0 and 99
     or p_passing is null or p_passing not between 0 and 99
     or p_dribbling is null or p_dribbling not between 0 and 99
     or p_defending is null or p_defending not between 0 and 99
     or p_physical is null or p_physical not between 0 and 99
     or (p_position = 'GK' and (
       p_reflexes is null or p_reflexes not between 0 and 99
       or p_positioning is null or p_positioning not between 0 and 99
       or p_handling is null or p_handling not between 0 and 99
     )) then
    raise exception 'Template attributes must be integers between 0 and 99';
  end if;
  if p_pack_group is null or p_pack_group not in ('standard', 'off_sale') then
    raise exception 'Invalid pack group';
  end if;
  if p_extra_stats is null or jsonb_typeof(p_extra_stats) is distinct from 'array' then
    raise exception 'Extra stats must be an array';
  end if;
  if jsonb_array_length(p_extra_stats) > 10 then
    raise exception 'Extra stats must contain at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_extra_stats) as item(stat)
    where jsonb_typeof(item.stat) is distinct from 'object'
       or jsonb_typeof(item.stat -> 'label') is distinct from 'string'
       or length(btrim(item.stat ->> 'label')) not between 1 and 30
       or jsonb_typeof(item.stat -> 'value') is distinct from 'number'
       or (item.stat ->> 'value') !~ '^(0|[1-9][0-9]{0,2})$'
  ) then
    raise exception 'Each extra stat needs a label and an integer value between 0 and 999';
  end if;
  if exists (
    select lower(btrim(item.stat ->> 'label'))
    from jsonb_array_elements(p_extra_stats) as item(stat)
    group by lower(btrim(item.stat ->> 'label'))
    having count(*) > 1
  ) then
    raise exception 'Extra stat labels must be unique';
  end if;
  if p_pack_group <> 'off_sale' and jsonb_array_length(p_extra_stats) > 0 then
    raise exception 'Extra stats are only allowed for Off-Sale templates';
  end if;

  insert into public.card_templates (
    name, position, nationality, age, club, attributes, gk_attributes,
    image, base_rarity, base_overall, special, created_by, pack_group, extra_stats, updated_at
  ) values (
    btrim(p_name), p_position, btrim(p_nationality), p_age, btrim(p_club),
    jsonb_build_object(
      'pace', p_pace, 'shooting', p_shooting, 'passing', p_passing,
      'dribbling', p_dribbling, 'defending', p_defending, 'physical', p_physical
    ),
    case when p_position = 'GK'
      then jsonb_build_object('reflexes', p_reflexes, 'positioning', p_positioning, 'handling', p_handling)
      else null
    end,
    p_image, p_base_rarity, p_base_overall, 'none', v_uid,
    p_pack_group, p_extra_stats, now()
  )
  on conflict (name) do update set
    position = excluded.position,
    nationality = excluded.nationality,
    age = excluded.age,
    club = excluded.club,
    attributes = excluded.attributes,
    gk_attributes = excluded.gk_attributes,
    image = excluded.image,
    base_rarity = excluded.base_rarity,
    base_overall = excluded.base_overall,
    special = excluded.special,
    pack_group = excluded.pack_group,
    extra_stats = excluded.extra_stats,
    updated_at = now()
  returning id into v_template_id;

  return v_template_id;
end;
$$;

revoke all on function public.admin_save_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, integer, text, jsonb
) from public, anon;
grant execute on function public.admin_save_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, integer, text, jsonb
) to authenticated;

do $$
declare
  v_definition text;
  v_targets text[] := array[
    $pattern$v_image[[:space:]]+text;[[:space:]]+v_extra_stats[[:space:]]+jsonb;$pattern$,
    $pattern$t[.]base_overall,[[:space:]]*t[.]special,[[:space:]]*t[.]extra_stats,$pattern$,
    $pattern$v_base_overall,[[:space:]]*v_template_special,[[:space:]]*v_extra_stats,$pattern$,
    $pattern$reflexes,[[:space:]]*positioning,[[:space:]]*handling,[[:space:]]*extra_stats,[[:space:]]*xp,[[:space:]]*evo_points,[[:space:]]*upgrades,$pattern$,
    $pattern$v_reflexes,[[:space:]]*v_positioning,[[:space:]]*v_handling,[[:space:]]*coalesce[(]v_extra_stats,[[:space:]]*'[^']*'::jsonb[)][[:space:]]*,[[:space:]]*0,[[:space:]]*0,[[:space:]]*null,$pattern$
  ];
  v_replacements text[] := array[
    $replacement$v_image text;
  v_extra_stats jsonb;
  v_template_pack_group text;$replacement$,
    $replacement$t.base_overall, t.special, t.extra_stats, t.pack_group,$replacement$,
    $replacement$v_base_overall, v_template_special, v_extra_stats, v_template_pack_group,$replacement$,
    $replacement$reflexes, positioning, handling, extra_stats, pack_group, xp, evo_points, upgrades,$replacement$,
    $replacement$v_reflexes, v_positioning, v_handling, coalesce(v_extra_stats, '[]'::jsonb),
        v_template_pack_group, 0, 0, null,$replacement$
  ];
  v_occurrences integer;
  v_index integer;
begin
  v_definition := pg_get_functiondef('public.open_pack(text)'::regprocedure);

  if position('v_template_pack_group' in v_definition) > 0 then
    if position('t.pack_group' in v_definition) = 0
       or position('extra_stats, pack_group, xp' in v_definition) = 0
       or position('v_template_pack_group, 0, 0, null' in v_definition) = 0 then
      raise exception 'public.open_pack(text) has an incomplete Off-Sale group update';
    end if;
  else
    for v_index in 1..array_length(v_targets, 1) loop
      select count(*) into v_occurrences
      from regexp_matches(v_definition, v_targets[v_index], 'g');

      if v_occurrences <> 1 then
        raise exception 'Could not safely update pack group field % in public.open_pack(text)', v_index;
      end if;

      v_definition := regexp_replace(
        v_definition,
        v_targets[v_index],
        v_replacements[v_index],
        'g'
      );
    end loop;
  end if;

  execute v_definition;
end;
$$;

create or replace function public.build_challenge_team_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starters jsonb;
  v_formation text;
  v_cards jsonb;
  v_name text;
  v_card_count integer;
  v_unique_count integer;
  v_goalkeeper_count integer;
begin
  select starters, formation
  into v_starters, v_formation
  from public.squads
  where user_id = p_user_id
  order by is_primary desc, updated_at desc
  limit 1;

  if v_starters is null then
    raise exception 'Each PvP team must have exactly five starters';
  end if;
  if jsonb_typeof(v_starters) is distinct from 'array' then
    raise exception 'Each PvP team must have exactly five starters';
  end if;
  if jsonb_array_length(v_starters) <> 5 then
    raise exception 'Each PvP team must have exactly five starters';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_starters) as starter(uid)
    join public.cards c on c.id::text = starter.uid and c.user_id = p_user_id
    where c.pack_group = 'off_sale'
       or exists (
         select 1
         from public.card_templates t
         where t.pack_group = 'off_sale'
           and lower(t.name) = lower(c.name)
       )
  ) then
    raise exception 'Off-Sale cards cannot be used in PvP';
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'uid', c.id,
      'name', c.name,
      'position', c.position,
      'overall', coalesce(c.overall, 70),
      'pace', coalesce(c.pace, 50),
      'shooting', coalesce(c.shooting, 50),
      'passing', coalesce(c.passing, 50),
      'dribbling', coalesce(c.dribbling, 50),
      'defending', coalesce(c.defending, 50),
      'physical', coalesce(c.physical, 50),
      'reflexes', c.reflexes,
      'positioning', c.positioning,
      'handling', c.handling
    ) order by starter.ordinality),
    count(*),
    count(distinct starter.uid),
    count(*) filter (where c.position = 'GK')
  into v_cards, v_card_count, v_unique_count, v_goalkeeper_count
  from jsonb_array_elements_text(v_starters) with ordinality as starter(uid, ordinality)
  join public.cards c on c.id::text = starter.uid and c.user_id = p_user_id;

  if v_card_count <> 5 or v_unique_count <> 5 or v_goalkeeper_count <> 1 then
    raise exception 'Each PvP team must have five valid starters including exactly one goalkeeper';
  end if;

  select name into v_name from public.profiles where id = p_user_id;
  return jsonb_build_object(
    'name', coalesce(v_name, 'Jogador'),
    'formation', coalesce(v_formation, '1-2-1'),
    'cards', v_cards
  );
end;
$$;

create or replace function public.claim_challenge_simulation(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.challenges%rowtype;
  v_claim_token uuid;
begin
  select * into v_challenge
  from public.challenges
  where id = p_challenge_id
  for update;
  if not found or v_challenge.status <> 'accepted'
     or not v_challenge.challenger_ready or not v_challenge.challenged_ready
     or v_challenge.result is not null
     or (v_challenge.simulation_claimed_until is not null and v_challenge.simulation_claimed_until >= now()) then
    return null;
  end if;

  if (v_challenge.home_snapshot is null) <> (v_challenge.away_snapshot is null) then
    raise exception 'Challenge snapshots are inconsistent';
  end if;
  if v_challenge.home_snapshot is null and v_challenge.away_snapshot is null then
    update public.challenges
    set home_snapshot = public.build_challenge_team_snapshot(v_challenge.challenger_id),
        away_snapshot = public.build_challenge_team_snapshot(v_challenge.challenged_id)
    where id = p_challenge_id;
    select * into v_challenge from public.challenges where id = p_challenge_id;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_challenge.home_snapshot -> 'cards', '[]'::jsonb)) as item(card)
    join public.cards c on c.id::text = (item.card ->> 'uid')
    where c.pack_group = 'off_sale'
       or exists (
         select 1
         from public.card_templates t
         where t.pack_group = 'off_sale'
           and lower(t.name) = lower(c.name)
       )
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(v_challenge.away_snapshot -> 'cards', '[]'::jsonb)) as item(card)
    join public.cards c on c.id::text = (item.card ->> 'uid')
    where c.pack_group = 'off_sale'
       or exists (
         select 1
         from public.card_templates t
         where t.pack_group = 'off_sale'
           and lower(t.name) = lower(c.name)
       )
  ) then
    raise exception 'Off-Sale cards cannot be used in PvP';
  end if;

  v_claim_token := gen_random_uuid();
  update public.challenges
  set simulation_claimed_until = now() + interval '10 minutes',
      simulation_claim_token = v_claim_token,
      updated_at = now()
  where id = p_challenge_id;
  return v_claim_token;
end;
$$;

notify pgrst, 'reload schema';
