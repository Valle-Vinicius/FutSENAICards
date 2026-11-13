alter table public.card_templates
  add column if not exists pack_group text not null default 'standard';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.card_templates'::regclass
      and conname = 'card_templates_pack_group_check'
  ) then
    alter table public.card_templates
      add constraint card_templates_pack_group_check
      check (pack_group in ('standard', 'off_sale'));
  end if;
end;
$$;

create index if not exists card_templates_pack_group_idx
  on public.card_templates (pack_group);

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
  p_pack_group text
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

  v_template_id := public.create_card_template(
    p_name, p_position, p_nationality, p_age, p_club,
    p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical,
    p_reflexes, p_positioning, p_handling, p_image, p_special,
    p_base_rarity, p_base_overall
  );

  update public.card_templates
  set pack_group = p_pack_group
  where id = v_template_id;

  if not found then
    raise exception 'Created template could not be assigned to a pack';
  end if;

  return v_template_id;
end;
$$;

revoke all on function public.admin_create_pack_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, text, integer, text
) from public, anon;
grant execute on function public.admin_create_pack_template(
  text, text, text, integer, text, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, text, text, text, integer, text
) to authenticated;

do $$
declare
  v_definition text;
  v_case_anchor text := $anchor$
    else
      raise exception 'Unknown pack';
$anchor$;
  v_case_replacement text := $replacement$
    when 'off_sale' then
      v_pack_price := 500; v_card_count := 3;
      v_common := 0.62; v_uncommon := 0.25; v_rare := 0.10; v_epic := 0.025; v_legendary := 0.004; v_icon := 0.001;
    else
      raise exception 'Unknown pack';
$replacement$;
  v_filter_anchor text := 'where v_position_filter is null or t.position = v_position_filter';
  v_filter_replacement text := $replacement$
where (v_position_filter is null or t.position = v_position_filter)
      and (
        (p_pack_id = 'off_sale' and t.pack_group = 'off_sale')
        or (p_pack_id <> 'off_sale' and t.pack_group = 'standard')
      )
$replacement$;
begin
  v_definition := pg_get_functiondef('public.open_pack(text)'::regprocedure);

  if (length(v_definition) - length(replace(v_definition, v_case_anchor, ''))) / length(v_case_anchor) <> 1 then
    raise exception 'Could not safely locate pack configuration in public.open_pack(text)';
  end if;
  v_definition := replace(v_definition, v_case_anchor, v_case_replacement);

  if (length(v_definition) - length(replace(v_definition, v_filter_anchor, ''))) / length(v_filter_anchor) <> 1 then
    raise exception 'Could not safely locate template selection in public.open_pack(text)';
  end if;
  v_definition := replace(v_definition, v_filter_anchor, v_filter_replacement);

  execute v_definition;
end;
$$;

notify pgrst, 'reload schema';
