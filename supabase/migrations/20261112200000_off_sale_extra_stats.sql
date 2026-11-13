alter table public.card_templates
  add column if not exists extra_stats jsonb not null default '[]'::jsonb;

alter table public.cards
  add column if not exists extra_stats jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.card_templates'::regclass
      and conname = 'card_templates_extra_stats_array_check'
  ) then
    alter table public.card_templates
      add constraint card_templates_extra_stats_array_check
      check (jsonb_typeof(extra_stats) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cards'::regclass
      and conname = 'cards_extra_stats_array_check'
  ) then
    alter table public.cards
      add constraint cards_extra_stats_array_check
      check (jsonb_typeof(extra_stats) = 'array');
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
  if p_extra_stats is null
     or jsonb_typeof(p_extra_stats) <> 'array'
     or jsonb_array_length(p_extra_stats) > 10 then
    raise exception 'Extra stats must be an array with at most 10 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_extra_stats) as item(stat)
    where jsonb_typeof(item.stat) <> 'object'
       or jsonb_typeof(item.stat -> 'label') <> 'string'
       or length(btrim(item.stat ->> 'label')) not between 1 and 30
       or jsonb_typeof(item.stat -> 'value') <> 'number'
       or (item.stat ->> 'value') !~ '^(0|[1-9][0-9]?)$'
  ) then
    raise exception 'Each extra stat needs a label and an integer value between 0 and 99';
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

do $$
declare
  v_definition text;
  v_targets text[] := array[
    'image[[:space:]]+text,[[:space:]]+choice_id[[:space:]]+uuid,',
    $target$  v_image text;$target$,
    $target$           t.base_overall, t.special,$target$,
    $target$         v_base_overall, v_template_special,$target$,
    $target$
        'positioning', v_positioning, 'handling', v_handling, 'image', v_image
$target$,
    $target$
             (v_candidate ->> 'handling')::integer, v_candidate ->> 'image', v_choice_id,
$target$,
    $target$
        reflexes, positioning, handling, xp, evo_points, upgrades,
$target$,
    $target$
        v_reflexes, v_positioning, v_handling, 0, 0, null,
$target$,
    $target$
                inserted.positioning, inserted.handling, inserted.image, null::uuid, v_remaining_coins,
$target$
  ];
  v_replacements text[] := array[
    $replacement$
  image text,
  extra_stats jsonb,
  choice_id uuid,
$replacement$,
    $replacement$  v_image text;
  v_extra_stats jsonb;$replacement$,
    $replacement$           t.base_overall, t.special, t.extra_stats,$replacement$,
    $replacement$         v_base_overall, v_template_special, v_extra_stats,$replacement$,
    $replacement$
        'positioning', v_positioning, 'handling', v_handling, 'image', v_image,
        'extra_stats', coalesce(v_extra_stats, '[]'::jsonb)
$replacement$,
    $replacement$
             (v_candidate ->> 'handling')::integer, v_candidate ->> 'image',
             v_candidate -> 'extra_stats', v_choice_id,
$replacement$,
    $replacement$
        reflexes, positioning, handling, extra_stats, xp, evo_points, upgrades,
$replacement$,
    $replacement$
        v_reflexes, v_positioning, v_handling, coalesce(v_extra_stats, '[]'::jsonb), 0, 0, null,
$replacement$,
    $replacement$
                inserted.positioning, inserted.handling, inserted.image, inserted.extra_stats,
                null::uuid, v_remaining_coins,
$replacement$
  ];
  v_index integer;
  v_occurrences integer;
begin
  v_definition := pg_get_functiondef('public.open_pack(text)'::regprocedure);

  for v_index in 1..array_length(v_targets, 1) loop
    if v_index = 1 then
      select count(*) into v_occurrences
      from regexp_matches(v_definition, v_targets[v_index], 'g');
    else
      v_occurrences := (length(v_definition) - length(replace(v_definition, v_targets[v_index], ''))) / length(v_targets[v_index]);
    end if;

    if v_occurrences <> 1 then
      raise exception 'Could not safely update extra-stat field % in public.open_pack(text)', v_index;
    end if;

    if v_index = 1 then
      v_definition := regexp_replace(v_definition, v_targets[v_index], v_replacements[v_index]);
    else
      v_definition := replace(v_definition, v_targets[v_index], v_replacements[v_index]);
    end if;
  end loop;

  drop function public.open_pack(text);
  execute v_definition;
end;
$$;

revoke all on function public.open_pack(text) from public, anon;
grant execute on function public.open_pack(text) to authenticated;

notify pgrst, 'reload schema';
