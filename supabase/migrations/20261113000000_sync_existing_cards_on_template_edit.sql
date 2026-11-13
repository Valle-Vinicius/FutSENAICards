alter table public.card_templates
  add column if not exists auto_calculate_overall boolean not null default false;

update public.card_templates t
set auto_calculate_overall = t.base_overall is null
  or t.base_overall = round(case t.position
    when 'GK' then
      coalesce((t.gk_attributes ->> 'reflexes')::numeric, 50) * 0.30
      + coalesce((t.gk_attributes ->> 'positioning')::numeric, 50) * 0.25
      + coalesce((t.attributes ->> 'defending')::numeric, 70) * 0.20
      + coalesce((t.attributes ->> 'passing')::numeric, 70) * 0.10
      + coalesce((t.attributes ->> 'physical')::numeric, 70) * 0.10
      + coalesce((t.attributes ->> 'pace')::numeric, 70) * 0.05
    when 'Fixo' then
      coalesce((t.attributes ->> 'defending')::numeric, 70) * 0.35
      + coalesce((t.attributes ->> 'physical')::numeric, 70) * 0.20
      + coalesce((t.attributes ->> 'passing')::numeric, 70) * 0.20
      + coalesce((t.attributes ->> 'pace')::numeric, 70) * 0.10
      + coalesce((t.attributes ->> 'dribbling')::numeric, 70) * 0.08
      + coalesce((t.attributes ->> 'shooting')::numeric, 70) * 0.07
    when 'Ala' then
      coalesce((t.attributes ->> 'pace')::numeric, 70) * 0.25
      + coalesce((t.attributes ->> 'passing')::numeric, 70) * 0.22
      + coalesce((t.attributes ->> 'dribbling')::numeric, 70) * 0.20
      + coalesce((t.attributes ->> 'shooting')::numeric, 70) * 0.13
      + coalesce((t.attributes ->> 'defending')::numeric, 70) * 0.12
      + coalesce((t.attributes ->> 'physical')::numeric, 70) * 0.08
    else
      coalesce((t.attributes ->> 'shooting')::numeric, 70) * 0.32
      + coalesce((t.attributes ->> 'physical')::numeric, 70) * 0.22
      + coalesce((t.attributes ->> 'dribbling')::numeric, 70) * 0.18
      + coalesce((t.attributes ->> 'passing')::numeric, 70) * 0.12
      + coalesce((t.attributes ->> 'pace')::numeric, 70) * 0.10
      + coalesce((t.attributes ->> 'defending')::numeric, 70) * 0.06
  end)::integer;

drop function public.admin_save_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, integer, text, jsonb
);

create function public.admin_save_template(
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
  p_extra_stats jsonb,
  p_auto_calculate_overall boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_template_id uuid;
  v_base_overall integer;
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
     or p_base_overall is null or p_base_overall not between 0 and 99
     or p_auto_calculate_overall is null then
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

  v_base_overall := case when p_auto_calculate_overall then
    round(case p_position
      when 'GK' then
        p_reflexes * 0.30 + p_positioning * 0.25 + p_defending * 0.20
        + p_passing * 0.10 + p_physical * 0.10 + p_pace * 0.05
      when 'Fixo' then
        p_defending * 0.35 + p_physical * 0.20 + p_passing * 0.20
        + p_pace * 0.10 + p_dribbling * 0.08 + p_shooting * 0.07
      when 'Ala' then
        p_pace * 0.25 + p_passing * 0.22 + p_dribbling * 0.20
        + p_shooting * 0.13 + p_defending * 0.12 + p_physical * 0.08
      else
        p_shooting * 0.32 + p_physical * 0.22 + p_dribbling * 0.18
        + p_passing * 0.12 + p_pace * 0.10 + p_defending * 0.06
    end)::integer
  else p_base_overall end;

  insert into public.card_templates (
    name, position, nationality, age, club, attributes, gk_attributes,
    image, base_rarity, base_overall, special, created_by, pack_group,
    extra_stats, auto_calculate_overall, updated_at
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
    p_image, p_base_rarity, v_base_overall, 'none', v_uid, p_pack_group,
    p_extra_stats, p_auto_calculate_overall, now()
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
    auto_calculate_overall = excluded.auto_calculate_overall,
    updated_at = now()
  returning id into v_template_id;

  with affected as (
    select
      c.id,
      c.special,
      coalesce(c.upgrades, '{}'::jsonb) as upgrades,
      case c.rarity
        when 'common' then 0.88::numeric
        when 'uncommon' then 1.0
        when 'rare' then 1.05
        when 'epic' then 1.10
        when 'legendary' then 1.15
        when 'icon' then 1.20
        else 1.0
      end as rarity_multiplier,
      round(p_pace * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_pace,
      round(p_shooting * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_shooting,
      round(p_passing * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_passing,
      round(p_dribbling * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_dribbling,
      round(p_defending * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_defending,
      round(p_physical * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_physical,
      round(coalesce(p_reflexes, 50) * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_reflexes,
      round(coalesce(p_positioning, 50) * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_positioning,
      round(coalesce(p_handling, 50) * case c.rarity
        when 'common' then 0.88::numeric when 'uncommon' then 1.0
        when 'rare' then 1.05 when 'epic' then 1.10
        when 'legendary' then 1.15 when 'icon' then 1.20 else 1.0
      end)::integer as base_handling
    from public.cards c
    where lower(c.name) = lower(btrim(p_name))
  ),
  adjusted as (
    select
      affected.*,
      least(99, greatest(0, base_pace + coalesce((upgrades ->> 'pace')::integer, 0))) as pace,
      least(99, greatest(0, base_shooting + coalesce((upgrades ->> 'shooting')::integer, 0))) as shooting,
      least(99, greatest(0, base_passing + coalesce((upgrades ->> 'passing')::integer, 0))) as passing,
      least(99, greatest(0, base_dribbling + coalesce((upgrades ->> 'dribbling')::integer, 0))) as dribbling,
      least(99, greatest(0, base_defending + coalesce((upgrades ->> 'defending')::integer, 0))) as defending,
      least(99, greatest(0, base_physical + coalesce((upgrades ->> 'physical')::integer, 0))) as physical,
      least(99, greatest(0, base_reflexes + coalesce((upgrades ->> 'reflexes')::integer, 0))) as reflexes,
      least(99, greatest(0, base_positioning + coalesce((upgrades ->> 'positioning')::integer, 0))) as positioning,
      least(99, greatest(0, base_handling + coalesce((upgrades ->> 'handling')::integer, 0))) as handling
    from affected
  ),
  scored as (
    select
      adjusted.*,
      round(case p_position
        when 'GK' then base_reflexes * 0.30 + base_positioning * 0.25 + base_defending * 0.20
          + base_passing * 0.10 + base_physical * 0.10 + base_pace * 0.05
        when 'Fixo' then base_defending * 0.35 + base_physical * 0.20 + base_passing * 0.20
          + base_pace * 0.10 + base_dribbling * 0.08 + base_shooting * 0.07
        when 'Ala' then base_pace * 0.25 + base_passing * 0.22 + base_dribbling * 0.20
          + base_shooting * 0.13 + base_defending * 0.12 + base_physical * 0.08
        else base_shooting * 0.32 + base_physical * 0.22 + base_dribbling * 0.18
          + base_passing * 0.12 + base_pace * 0.10 + base_defending * 0.06
      end)::integer as base_attributes_overall,
      round(case p_position
        when 'GK' then reflexes * 0.30 + positioning * 0.25 + defending * 0.20
          + passing * 0.10 + physical * 0.10 + pace * 0.05
        when 'Fixo' then defending * 0.35 + physical * 0.20 + passing * 0.20
          + pace * 0.10 + dribbling * 0.08 + shooting * 0.07
        when 'Ala' then pace * 0.25 + passing * 0.22 + dribbling * 0.20
          + shooting * 0.13 + defending * 0.12 + physical * 0.08
        else shooting * 0.32 + physical * 0.22 + dribbling * 0.18
          + passing * 0.12 + pace * 0.10 + defending * 0.06
      end)::integer as upgraded_attributes_overall
    from adjusted
  )
  update public.cards c
  set position = p_position,
      nationality = btrim(p_nationality),
      age = p_age,
      club = btrim(p_club),
      image = p_image,
      pace = scored.pace,
      shooting = scored.shooting,
      passing = scored.passing,
      dribbling = scored.dribbling,
      defending = scored.defending,
      physical = scored.physical,
      reflexes = case when p_position = 'GK' then scored.reflexes else null end,
      positioning = case when p_position = 'GK' then scored.positioning else null end,
      handling = case when p_position = 'GK' then scored.handling else null end,
      overall = least(99, greatest(0,
        v_base_overall
        + case c.rarity
            when 'common' then -2 when 'rare' then 2 when 'epic' then 4
            when 'legendary' then 6 when 'icon' then 8 else 0
          end
        + case coalesce(c.special, 'none')
            when 'totw' then 2 when 'potm' then 2 when 'revelation' then 1
            when 'legend' then 3 when 'futsal' then 2 else 0
          end
        + scored.upgraded_attributes_overall - scored.base_attributes_overall
      )),
      extra_stats = p_extra_stats,
      pack_group = p_pack_group,
      schema_version = 4,
      updated_at = now()
  from scored
  where c.id = scored.id;

  return v_template_id;
end;
$$;

revoke all on function public.admin_save_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, integer, text, jsonb, boolean
) from public, anon;
grant execute on function public.admin_save_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, integer, text, jsonb, boolean
) to authenticated;

notify pgrst, 'reload schema';
