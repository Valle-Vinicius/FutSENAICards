alter table public.card_templates
  drop constraint if exists card_templates_pack_group_check,
  drop constraint if exists card_templates_base_rarity_check,
  drop constraint if exists card_templates_secret_rarity_check;

alter table public.card_templates
  add constraint card_templates_pack_group_check
    check (pack_group in ('standard', 'off_sale', 'secret')),
  add constraint card_templates_base_rarity_check
    check (base_rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'icon', 'secret')),
  add constraint card_templates_secret_rarity_check
    check (
      (pack_group = 'secret') = (base_rarity = 'secret')
      and (pack_group <> 'secret' or (special = 'none' and coalesce(jsonb_array_length(extra_stats), -1) = 0))
    );

alter table public.cards
  drop constraint if exists cards_rarity_check;

alter table public.cards
  add constraint cards_rarity_check
    check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'icon', 'secret'));

create table if not exists public.secret_card_supply (
  template_id uuid primary key references public.card_templates(id) on delete restrict,
  drop_chance numeric not null check (drop_chance between 0.000001 and 0.05),
  max_supply integer not null check (max_supply >= 1),
  minted integer not null default 0 check (minted >= 0 and minted <= max_supply),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.secret_card_drops (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.card_templates(id) on delete restrict,
  user_id uuid not null,
  card_id uuid not null,
  pack_id text not null check (pack_id in ('bronze', 'silver', 'gold', 'premium', 'rareplayers', 'legends', 'position_gk')),
  dropped_at timestamptz not null default now()
);

create index if not exists secret_card_drops_template_dropped_idx
  on public.secret_card_drops(template_id, dropped_at desc);

alter table public.secret_card_supply enable row level security;
alter table public.secret_card_drops enable row level security;

revoke all on public.secret_card_supply, public.secret_card_drops from public, anon, authenticated;
grant select on public.secret_card_supply, public.secret_card_drops to authenticated;

drop policy if exists secret_card_supply_admin_read on public.secret_card_supply;
create policy secret_card_supply_admin_read
  on public.secret_card_supply for select to authenticated
  using (auth.uid() = '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid);

drop policy if exists secret_card_drops_admin_read on public.secret_card_drops;
create policy secret_card_drops_admin_read
  on public.secret_card_drops for select to authenticated
  using (auth.uid() = '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid);

drop policy if exists card_templates_read_all on public.card_templates;
create policy card_templates_read_all
  on public.card_templates for select to authenticated
  using (
    auth.uid() = '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid
    or pack_group <> 'secret'
  );

create or replace function public.guard_secret_template_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.pack_group = 'secret'
     and (new.pack_group <> 'secret' or new.base_rarity <> 'secret')
     and current_setting('app.secret_template_rpc', true) is distinct from 'on' then
    raise exception 'Secret templates must be changed through admin_upsert_secret_card';
  end if;

  if (new.pack_group = 'secret' or new.base_rarity = 'secret')
     and current_setting('app.secret_template_rpc', true) is distinct from 'on' then
    raise exception 'Secret templates must be changed through admin_upsert_secret_card';
  end if;

  if new.pack_group = 'secret'
     and (new.base_rarity <> 'secret' or new.special <> 'none' or coalesce(jsonb_array_length(new.extra_stats), -1) <> 0) then
    raise exception 'Secret templates must use only the secret rarity, no special edition, and no extra stats';
  end if;

  return new;
end;
$$;

drop trigger if exists card_templates_guard_secret_write on public.card_templates;
create trigger card_templates_guard_secret_write
  before insert or update on public.card_templates
  for each row execute function public.guard_secret_template_write();

create or replace function public.guard_secret_template_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_minted integer;
begin
  if old.pack_group <> 'secret' then
    return old;
  end if;

  select minted into v_minted
  from public.secret_card_supply
  where template_id = old.id
  for update;

  if coalesce(v_minted, 0) > 0 then
    raise exception 'Secret templates with emitted cards cannot be deleted';
  end if;

  delete from public.secret_card_supply where template_id = old.id;
  return old;
end;
$$;

drop trigger if exists card_templates_guard_secret_delete on public.card_templates;
create trigger card_templates_guard_secret_delete
  before delete on public.card_templates
  for each row execute function public.guard_secret_template_delete();

create or replace function public.admin_upsert_secret_card(
  p_template_id uuid,
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
  p_base_overall integer,
  p_auto_calculate_overall boolean,
  p_drop_chance numeric,
  p_max_supply integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_id uuid;
  v_existing_group text;
  v_template_id uuid;
  v_minted integer := 0;
begin
  if v_uid is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Not authorized';
  end if;
  if p_drop_chance is null or p_drop_chance not between 0.000001 and 0.05 then
    raise exception 'Chance must be between 0.0001%% and 5%% per card';
  end if;
  if p_max_supply is null or p_max_supply < 1 then
    raise exception 'Maximum supply must be at least 1';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Name must contain between 1 and 80 characters';
  end if;

  select id, pack_group
  into v_existing_id, v_existing_group
  from public.card_templates
  where lower(name) = lower(btrim(p_name))
  for update;

  if p_template_id is null then
    if found then
      raise exception 'A template with this name already exists';
    end if;
  elsif not found or v_existing_id <> p_template_id or v_existing_group <> 'secret' then
    raise exception 'Secret template not found';
  end if;

  if p_template_id is not null then
    select minted into v_minted
    from public.secret_card_supply
    where template_id = p_template_id
    for update;
    if not found then
      raise exception 'Secret supply configuration not found';
    end if;
    if p_max_supply < v_minted then
      raise exception 'Maximum supply cannot be lower than the % cards already emitted', v_minted;
    end if;
  end if;

  perform set_config('app.secret_template_rpc', 'on', true);
  v_template_id := public.admin_save_template(
    btrim(p_name), p_position, btrim(p_nationality), p_age, btrim(p_club),
    p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical,
    p_reflexes, p_positioning, p_handling, p_image, 'uncommon',
    p_base_overall, 'standard', '[]'::jsonb, p_auto_calculate_overall
  );

  if p_template_id is not null and v_template_id <> p_template_id then
    raise exception 'Secret template identity changed unexpectedly';
  end if;

  update public.card_templates
  set base_rarity = 'secret',
      pack_group = 'secret',
      special = 'none',
      extra_stats = '[]'::jsonb,
      updated_at = now()
  where id = v_template_id;

  insert into public.secret_card_supply(template_id, drop_chance, max_supply)
  values (v_template_id, p_drop_chance, p_max_supply)
  on conflict (template_id) do update
  set drop_chance = excluded.drop_chance,
      max_supply = excluded.max_supply,
      updated_at = now()
  returning minted into v_minted;

  perform set_config('app.secret_template_rpc', 'off', true);
  return jsonb_build_object(
    'template_id', v_template_id,
    'drop_chance', p_drop_chance,
    'max_supply', p_max_supply,
    'minted', v_minted
  );
end;
$$;

revoke all on function public.admin_upsert_secret_card(
  uuid, text, text, text, integer, text, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, text, integer, boolean, numeric, integer
) from public, anon;
grant execute on function public.admin_upsert_secret_card(
  uuid, text, text, text, integer, text, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, text, integer, boolean, numeric, integer
) to authenticated;

create or replace function public.open_pack(p_pack_id text)
returns table(
  uid uuid,
  player_id text,
  name text,
  card_position text,
  sport text,
  nationality text,
  age integer,
  club text,
  rarity text,
  edition text,
  special text,
  overall integer,
  pace integer,
  shooting integer,
  passing integer,
  dribbling integer,
  defending integer,
  physical integer,
  reflexes integer,
  positioning integer,
  handling integer,
  image text,
  extra_stats jsonb,
  choice_id uuid,
  remaining_coins integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_pack_price integer;
  v_card_count integer;
  v_position_filter text;
  v_is_choice boolean := false;
  v_common float8;
  v_uncommon float8;
  v_rare float8;
  v_epic float8;
  v_legendary float8;
  v_remaining_coins integer;
  v_choice_id uuid;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate jsonb;
  v_roll float8;
  v_rarity text;
  v_special text;
  v_rarity_mult float8;
  v_rarity_bonus integer;
  v_special_bonus integer;
  v_name text;
  v_card_position text;
  v_nationality text;
  v_age integer;
  v_club text;
  v_image text;
  v_extra_stats jsonb;
  v_template_pack_group text;
  v_card_pack_group text;
  v_base_overall integer;
  v_overall integer;
  v_pace integer;
  v_shooting integer;
  v_passing integer;
  v_dribbling integer;
  v_defending integer;
  v_physical integer;
  v_reflexes integer;
  v_positioning integer;
  v_handling integer;
  v_template_special text;
  v_secret_template_id uuid;
  v_secret_selected boolean := false;
  v_is_secret boolean;
  v_secret record;
  v_inserted public.cards%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  case p_pack_id
    when 'bronze' then
      v_pack_price := 500; v_card_count := 3;
      v_common := 0.62; v_uncommon := 0.25; v_rare := 0.10; v_epic := 0.025; v_legendary := 0.004;
    when 'silver' then
      v_pack_price := 1500; v_card_count := 5;
      v_common := 0.30; v_uncommon := 0.35; v_rare := 0.22; v_epic := 0.10; v_legendary := 0.025;
    when 'gold' then
      v_pack_price := 3000; v_card_count := 5;
      v_common := 0.10; v_uncommon := 0.25; v_rare := 0.35; v_epic := 0.22; v_legendary := 0.07;
    when 'premium' then
      v_pack_price := 7500; v_card_count := 5;
      v_common := 0.05; v_uncommon := 0.15; v_rare := 0.35; v_epic := 0.30; v_legendary := 0.12;
    when 'rareplayers' then
      v_pack_price := 5000; v_card_count := 3;
      v_common := 0; v_uncommon := 0.10; v_rare := 0.40; v_epic := 0.35; v_legendary := 0.12;
    when 'legends' then
      v_pack_price := 12000; v_card_count := 4;
      v_common := 0; v_uncommon := 0; v_rare := 0.20; v_epic := 0.40; v_legendary := 0.30;
    when 'position_gk' then
      v_pack_price := 4000; v_card_count := 3; v_position_filter := 'GK';
      v_common := 0.20; v_uncommon := 0.30; v_rare := 0.30; v_epic := 0.15; v_legendary := 0.04;
    when 'choice' then
      v_pack_price := 10000; v_card_count := 3; v_is_choice := true;
      v_common := 0; v_uncommon := 0; v_rare := 0.20; v_epic := 0.40; v_legendary := 0.30;
    when 'off_sale' then
      v_pack_price := 500; v_card_count := 3;
      v_common := 0.62; v_uncommon := 0.25; v_rare := 0.10; v_epic := 0.025; v_legendary := 0.004;
    else
      raise exception 'Unknown pack';
  end case;

  delete from public.pending_pack_choices
  where user_id = v_uid and expires_at <= now();

  update public.profiles
  set coins = coins - v_pack_price,
      packs_opened = coalesce(packs_opened, 0) + 1
  where id = v_uid and coins >= v_pack_price
  returning coins into v_remaining_coins;
  if not found then raise exception 'Insufficient coins'; end if;

  insert into public.transactions (user_id, amount, reason, type)
  values (v_uid, v_pack_price, 'Abertura pacote ' || p_pack_id, 'spend');

  if v_is_choice then
    v_choice_id := gen_random_uuid();
  end if;

  for v_i in 1..v_card_count loop
    v_is_secret := false;
    v_secret_template_id := null;

    if not v_secret_selected
       and p_pack_id in ('bronze', 'silver', 'gold', 'premium', 'rareplayers', 'legends', 'position_gk') then
      for v_secret in
        select s.template_id, s.drop_chance, t.name, t.position, t.nationality, t.age,
               t.club, t.image, t.base_overall, t.special, t.extra_stats,
               coalesce((t.attributes ->> 'pace')::integer, 70) as pace,
               coalesce((t.attributes ->> 'shooting')::integer, 70) as shooting,
               coalesce((t.attributes ->> 'passing')::integer, 70) as passing,
               coalesce((t.attributes ->> 'dribbling')::integer, 70) as dribbling,
               coalesce((t.attributes ->> 'defending')::integer, 70) as defending,
               coalesce((t.attributes ->> 'physical')::integer, 70) as physical,
               coalesce((t.gk_attributes ->> 'reflexes')::integer, 50) as reflexes,
               coalesce((t.gk_attributes ->> 'positioning')::integer, 50) as positioning,
               coalesce((t.gk_attributes ->> 'handling')::integer, 50) as handling
        from public.secret_card_supply s
        join public.card_templates t on t.id = s.template_id
        where s.minted < s.max_supply
          and (v_position_filter is null or t.position = v_position_filter)
        order by random()
      loop
        if random() < v_secret.drop_chance then
          update public.secret_card_supply
          set minted = minted + 1, updated_at = now()
          where template_id = v_secret.template_id
            and minted < max_supply
          returning template_id into v_secret_template_id;

          if found then
            v_is_secret := true;
            v_secret_selected := true;
            v_name := v_secret.name;
            v_card_position := v_secret.position;
            v_nationality := v_secret.nationality;
            v_age := v_secret.age;
            v_club := v_secret.club;
            v_image := v_secret.image;
            v_base_overall := v_secret.base_overall;
            v_template_special := v_secret.special;
            v_extra_stats := coalesce(v_secret.extra_stats, '[]'::jsonb);
            v_template_pack_group := 'secret';
            v_pace := v_secret.pace;
            v_shooting := v_secret.shooting;
            v_passing := v_secret.passing;
            v_dribbling := v_secret.dribbling;
            v_defending := v_secret.defending;
            v_physical := v_secret.physical;
            v_reflexes := v_secret.reflexes;
            v_positioning := v_secret.positioning;
            v_handling := v_secret.handling;
            exit;
          end if;
        end if;
      end loop;
    end if;

    if not v_is_secret then
      select t.name, t.position, t.nationality, t.age, t.club, t.image,
             t.base_overall, t.special, t.extra_stats, t.pack_group,
             coalesce((t.attributes ->> 'pace')::integer, 70),
             coalesce((t.attributes ->> 'shooting')::integer, 70),
             coalesce((t.attributes ->> 'passing')::integer, 70),
             coalesce((t.attributes ->> 'dribbling')::integer, 70),
             coalesce((t.attributes ->> 'defending')::integer, 70),
             coalesce((t.attributes ->> 'physical')::integer, 70),
             coalesce((t.gk_attributes ->> 'reflexes')::integer, 50),
             coalesce((t.gk_attributes ->> 'positioning')::integer, 50),
             coalesce((t.gk_attributes ->> 'handling')::integer, 50)
      into v_name, v_card_position, v_nationality, v_age, v_club, v_image,
           v_base_overall, v_template_special, v_extra_stats, v_template_pack_group,
           v_pace, v_shooting, v_passing, v_dribbling, v_defending, v_physical,
           v_reflexes, v_positioning, v_handling
      from public.card_templates t
      where (v_position_filter is null or t.position = v_position_filter)
        and (
          (p_pack_id = 'off_sale' and t.pack_group = 'off_sale')
          or (p_pack_id <> 'off_sale' and t.pack_group = 'standard')
        )
      order by random()
      limit 1;
      if not found then
        raise exception 'No card templates are configured for this pack';
      end if;

      v_roll := random();
      if v_roll < v_common then v_rarity := 'common';
      elsif v_roll < v_common + v_uncommon then v_rarity := 'uncommon';
      elsif v_roll < v_common + v_uncommon + v_rare then v_rarity := 'rare';
      elsif v_roll < v_common + v_uncommon + v_rare + v_epic then v_rarity := 'epic';
      elsif v_roll < v_common + v_uncommon + v_rare + v_epic + v_legendary then v_rarity := 'legendary';
      else v_rarity := 'icon';
      end if;

      v_roll := random();
      if v_roll < 0.85 then v_special := 'none';
      elsif v_roll < 0.88 then v_special := 'totw';
      elsif v_roll < 0.91 then v_special := 'potm';
      elsif v_roll < 0.94 then v_special := 'revelation';
      elsif v_roll < 0.97 then v_special := 'legend';
      else v_special := 'futsal';
      end if;
      if v_template_special is not null and v_template_special <> 'none' then
        v_special := v_template_special;
      end if;

      v_base_overall := coalesce(v_base_overall, case v_card_position
        when 'GK' then round(v_reflexes * 0.30 + v_positioning * 0.25 + v_defending * 0.20 + v_passing * 0.10 + v_physical * 0.10 + v_pace * 0.05)::integer
        when 'Fixo' then round(v_defending * 0.35 + v_physical * 0.20 + v_passing * 0.20 + v_pace * 0.10 + v_dribbling * 0.08 + v_shooting * 0.07)::integer
        when 'Ala' then round(v_pace * 0.25 + v_passing * 0.22 + v_dribbling * 0.20 + v_shooting * 0.13 + v_defending * 0.12 + v_physical * 0.08)::integer
        else round(v_shooting * 0.32 + v_physical * 0.22 + v_dribbling * 0.18 + v_passing * 0.12 + v_pace * 0.10 + v_defending * 0.06)::integer
      end);
    else
      v_rarity := 'secret';
      v_special := 'none';
      v_base_overall := coalesce(v_base_overall, case v_card_position
        when 'GK' then round(v_reflexes * 0.30 + v_positioning * 0.25 + v_defending * 0.20 + v_passing * 0.10 + v_physical * 0.10 + v_pace * 0.05)::integer
        when 'Fixo' then round(v_defending * 0.35 + v_physical * 0.20 + v_passing * 0.20 + v_pace * 0.10 + v_dribbling * 0.08 + v_shooting * 0.07)::integer
        when 'Ala' then round(v_pace * 0.25 + v_passing * 0.22 + v_dribbling * 0.20 + v_shooting * 0.13 + v_defending * 0.12 + v_physical * 0.08)::integer
        else round(v_shooting * 0.32 + v_physical * 0.22 + v_dribbling * 0.18 + v_passing * 0.12 + v_pace * 0.10 + v_defending * 0.06)::integer
      end);
    end if;

    v_rarity_mult := case v_rarity
      when 'common' then 0.88 when 'uncommon' then 1.0 when 'rare' then 1.05
      when 'epic' then 1.10 when 'legendary' then 1.15 when 'secret' then 1.0 else 1.20 end;
    v_rarity_bonus := case v_rarity
      when 'common' then -2 when 'uncommon' then 0 when 'rare' then 2
      when 'epic' then 4 when 'legendary' then 6 when 'secret' then 0 else 8 end;
    v_special_bonus := case v_special
      when 'totw' then 2 when 'potm' then 2 when 'revelation' then 1
      when 'legend' then 3 when 'futsal' then 2 else 0 end;

    v_pace := least(99, greatest(0, round(v_pace * v_rarity_mult)::integer));
    v_shooting := least(99, greatest(0, round(v_shooting * v_rarity_mult)::integer));
    v_passing := least(99, greatest(0, round(v_passing * v_rarity_mult)::integer));
    v_dribbling := least(99, greatest(0, round(v_dribbling * v_rarity_mult)::integer));
    v_defending := least(99, greatest(0, round(v_defending * v_rarity_mult)::integer));
    v_physical := least(99, greatest(0, round(v_physical * v_rarity_mult)::integer));
    v_reflexes := least(99, greatest(0, round(v_reflexes * v_rarity_mult)::integer));
    v_positioning := least(99, greatest(0, round(v_positioning * v_rarity_mult)::integer));
    v_handling := least(99, greatest(0, round(v_handling * v_rarity_mult)::integer));
    v_overall := least(99, greatest(0, v_base_overall + v_rarity_bonus + v_special_bonus));

    if v_is_choice then
      v_candidate := jsonb_build_object(
        'uid', gen_random_uuid(), 'player_id', lower(replace(v_name, ' ', '-')) || '-' || v_rarity,
        'name', v_name, 'card_position', v_card_position, 'sport', 'futsal',
        'nationality', coalesce(v_nationality, 'Brasil'), 'age', coalesce(v_age, 20), 'club', coalesce(v_club, 'Clube'),
        'rarity', v_rarity, 'edition', '2025/26', 'special', v_special, 'overall', v_overall,
        'pace', v_pace, 'shooting', v_shooting, 'passing', v_passing, 'dribbling', v_dribbling,
        'defending', v_defending, 'physical', v_physical, 'reflexes', v_reflexes,
        'positioning', v_positioning, 'handling', v_handling, 'image', v_image,
        'extra_stats', coalesce(v_extra_stats, '[]'::jsonb)
      );
      v_candidates := v_candidates || jsonb_build_array(v_candidate);
      return query
      select (v_candidate ->> 'uid')::uuid, v_candidate ->> 'player_id', v_candidate ->> 'name',
             v_candidate ->> 'card_position', v_candidate ->> 'sport', v_candidate ->> 'nationality',
             (v_candidate ->> 'age')::integer, v_candidate ->> 'club', v_candidate ->> 'rarity',
             v_candidate ->> 'edition', v_candidate ->> 'special', (v_candidate ->> 'overall')::integer,
             (v_candidate ->> 'pace')::integer, (v_candidate ->> 'shooting')::integer,
             (v_candidate ->> 'passing')::integer, (v_candidate ->> 'dribbling')::integer,
             (v_candidate ->> 'defending')::integer, (v_candidate ->> 'physical')::integer,
             (v_candidate ->> 'reflexes')::integer, (v_candidate ->> 'positioning')::integer,
             (v_candidate ->> 'handling')::integer, v_candidate ->> 'image',
             coalesce(v_candidate -> 'extra_stats', '[]'::jsonb), v_choice_id,
             v_remaining_coins, now();
    else
      v_card_pack_group := case when v_is_secret then 'standard' else v_template_pack_group end;
      insert into public.cards as inserted (
        user_id, name, position, sport, rarity, edition, special,
        overall, pace, shooting, passing, dribbling, defending, physical,
        reflexes, positioning, handling, xp, evo_points, upgrades,
        evolution_log, season_stats, image, extra_stats, pack_group,
        favorite, is_new, obtained_at, schema_version, player_id,
        nationality, age, club
      ) values (
        v_uid, v_name, v_card_position, 'futsal', v_rarity, '2025/26', v_special,
        v_overall, v_pace, v_shooting, v_passing, v_dribbling, v_defending, v_physical,
        v_reflexes, v_positioning, v_handling, 0, 0, null,
        null, '{}'::jsonb, v_image, coalesce(v_extra_stats, '[]'::jsonb), v_card_pack_group,
        false, true, now(), 4, lower(replace(v_name, ' ', '-')) || '-' || v_rarity,
        coalesce(v_nationality, 'Brasil'), coalesce(v_age, 20), coalesce(v_club, 'Clube')
      )
      returning * into v_inserted;

      if v_is_secret then
        insert into public.secret_card_drops(template_id, user_id, card_id, pack_id)
        values (v_secret_template_id, v_uid, v_inserted.id, p_pack_id);
      end if;

      return query
      select v_inserted.id, v_inserted.player_id, v_inserted.name, v_inserted.position,
             v_inserted.sport, v_inserted.nationality, v_inserted.age, v_inserted.club,
             v_inserted.rarity, v_inserted.edition, v_inserted.special, v_inserted.overall,
             v_inserted.pace, v_inserted.shooting, v_inserted.passing, v_inserted.dribbling,
             v_inserted.defending, v_inserted.physical, v_inserted.reflexes, v_inserted.positioning,
             v_inserted.handling, v_inserted.image, v_inserted.extra_stats, null::uuid,
             v_remaining_coins, v_inserted.created_at;
    end if;
  end loop;

  if v_is_choice then
    insert into public.pending_pack_choices (id, user_id, candidates)
    values (v_choice_id, v_uid, v_candidates);
  end if;
end;
$$;

revoke all on function public.open_pack(text) from public, anon;
grant execute on function public.open_pack(text) to authenticated;

create or replace function public.convert_duplicates()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_coins integer := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  if (select count(*) from public.economy_config) <> 5 then
    raise exception 'Duplicate conversion values are not configured for every rarity';
  end if;
  if exists (
    select 1
    from public.cards c
    left join public.economy_config config on config.rarity = c.rarity
    where c.user_id = v_uid and c.rarity not in ('icon', 'secret') and config.rarity is null
  ) then
    raise exception 'A duplicate conversion value is missing for one of your card rarities';
  end if;

  with ranked as (
    select c.id,
      row_number() over (
        partition by c.name
        order by c.favorite desc,
          case c.rarity when 'secret' then 6 when 'icon' then 5 when 'legendary' then 4
                        when 'epic' then 3 when 'rare' then 2 when 'uncommon' then 1 else 0 end desc,
          c.overall desc
      ) as rn,
      c.rarity,
      c.favorite,
      (
        exists (
          select 1 from public.listings l
          where l.card_id = c.id and l.status = 'active'
        )
        or exists (
          select 1 from public.squads s
          where s.user_id = v_uid
            and (
              coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
            )
        )
        or exists (
          select 1 from public.saved_squads s
          where s.user_id = v_uid
            and (
              coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
            )
        )
        or exists (
          select 1 from public.challenge_wager_escrow e
          where e.card_id = c.id
        )
        or exists (
          select 1 from public.challenges ch
          where ch.challenger_card_id = c.id
             or ch.challenged_card_id = c.id
        )
        or exists (
          select 1 from public.pool_matches m
          where m.player1_card_id = c.id
             or m.player2_card_id = c.id
        )
        or exists (
          select 1 from public.pool_wager_escrow e
          where e.card_id = c.id
        )
      ) as in_use
    from public.cards c
    where c.user_id = v_uid
  ), deleted as (
    delete from public.cards c
    using ranked r
    where c.id = r.id
      and r.rn > 1
      and r.rarity not in ('icon', 'secret')
      and not r.favorite
      and not r.in_use
    returning c.rarity
  )
  select count(*)::integer, coalesce(sum(config.duplicate_conversion_coins), 0)::integer
  into v_count, v_coins
  from deleted
  join public.economy_config config on config.rarity = deleted.rarity;

  if v_count > 0 then
    update public.profiles set coins = coins + v_coins where id = v_uid;
    insert into public.transactions (user_id, amount, reason, type)
    values (v_uid, v_coins, 'Conversão de ' || v_count || ' duplicatas', 'earn');
  end if;

  return jsonb_build_object('count', v_count, 'coins', v_coins);
end;
$$;

create or replace function public.complete_sbc(p_sbc_id text, p_card_ids uuid[])
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_expected integer;
  v_count integer;
  v_reward integer;
  v_new_coins integer;
  v_xp integer;
  v_level integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;
  if p_card_ids is null or cardinality(p_card_ids) = 0
     or (select count(distinct card_id) from unnest(p_card_ids) as ids(card_id)) <> cardinality(p_card_ids) then
    raise exception 'Invalid card selection';
  end if;

  case p_sbc_id
    when 'sbc1' then v_expected := 5; v_reward := 1000;
    when 'sbc2' then v_expected := 5; v_reward := 800;
    when 'sbc3' then v_expected := 3; v_reward := 600;
    else raise exception 'Unknown SBC';
  end case;
  if cardinality(p_card_ids) <> v_expected then raise exception 'Incorrect number of cards'; end if;

  if p_sbc_id = 'sbc1' and exists (
    select 1 from public.sbc_completions where user_id = v_uid and sbc_id = p_sbc_id
  ) then raise exception 'This SBC has already been completed'; end if;

  if p_sbc_id in ('sbc2', 'sbc3') and (
    select count(*) from public.sbc_completions
    where user_id = v_uid and sbc_id = p_sbc_id
      and created_at >= date_trunc('day', now())
  ) >= 3 then
    raise exception 'Daily limit reached: this SBC can be completed at most 3 times per day';
  end if;

  perform 1
  from public.cards
  where user_id = v_uid and id = any(p_card_ids)
  order by id
  for update;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(p_card_ids) then
    raise exception 'One or more selected cards are no longer owned by you';
  end if;

  if exists (
    select 1 from public.cards
    where user_id = v_uid and id = any(p_card_ids) and rarity in ('icon', 'secret')
  ) then raise exception 'Icon and secret cards cannot be submitted to an SBC'; end if;
  if exists (
    select 1 from public.cards
    where user_id = v_uid and id = any(p_card_ids) and favorite
  ) then raise exception 'Favorite cards cannot be submitted to an SBC'; end if;

  if exists (
    select 1 from public.listings
    where card_id = any(p_card_ids) and status = 'active'
  ) then raise exception 'Cancel the active market listing before submitting this card'; end if;

  if exists (
    select 1
    from public.cards c
    join public.squads s on s.user_id = v_uid
    where c.id = any(p_card_ids)
      and (
        coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
      )
  ) or exists (
    select 1
    from public.cards c
    join public.saved_squads s on s.user_id = v_uid
    where c.id = any(p_card_ids)
      and (
        coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
        or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
      )
  ) then raise exception 'Remove selected cards from active and saved squads first'; end if;

  if exists (
    select 1 from public.challenge_wager_escrow e
    where e.card_id = any(p_card_ids)
  ) then raise exception 'A selected card is reserved in a challenge wager'; end if;
  if exists (
    select 1 from public.challenges ch
    where ch.challenger_card_id = any(p_card_ids)
       or ch.challenged_card_id = any(p_card_ids)
  ) then raise exception 'A selected card is linked to a challenge'; end if;
  if exists (
    select 1 from public.pool_matches m
    where m.player1_card_id = any(p_card_ids)
       or m.player2_card_id = any(p_card_ids)
  ) then raise exception 'A selected card is linked to a pool match'; end if;
  if exists (
    select 1 from public.pool_wager_escrow e
    where e.card_id = any(p_card_ids)
  ) then raise exception 'A selected card is reserved in a pool wager'; end if;

  if p_sbc_id = 'sbc1' and exists (
    select 1 from public.cards where user_id = v_uid and id = any(p_card_ids) and coalesce(overall, 0) < 75
  ) then raise exception 'SBC Ouro requires cards with overall 75 or higher'; end if;
  if p_sbc_id = 'sbc2' and (
    (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'GK') <> 1
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Fixo') <> 1
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Ala') <> 2
    or (select count(*) from public.cards where user_id = v_uid and id = any(p_card_ids) and position = 'Pivo') <> 1
  ) then raise exception 'SBC Futsal requires 1 goalkeeper, 1 fixo, 2 alas, and 1 pivô'; end if;
  if p_sbc_id = 'sbc3' and (
    select count(distinct club) from public.cards where user_id = v_uid and id = any(p_card_ids)
  ) <> 1 then raise exception 'SBC de Clube requires all selected cards to be from the same club'; end if;

  delete from public.cards where user_id = v_uid and id = any(p_card_ids);
  get diagnostics v_count = row_count;
  if v_count <> v_expected then raise exception 'Cards could not be consumed'; end if;

  insert into public.sbc_completions (user_id, sbc_id) values (v_uid, p_sbc_id);
  update public.profiles
  set coins = coins + v_reward,
      xp = xp + 100
  where id = v_uid
  returning coins, xp, least(99, floor(xp / 500)::integer + 1)
  into v_new_coins, v_xp, v_level;
  update public.profiles set level = v_level where id = v_uid;
  insert into public.transactions (user_id, amount, reason, type)
  values (v_uid, v_reward, 'SBC: ' || p_sbc_id, 'earn');

  return json_build_object('coins', v_new_coins, 'xp', v_xp, 'level', v_level, 'reward_coins', v_reward);
end;
$$;

revoke all on function public.convert_duplicates() from public, anon;
revoke all on function public.complete_sbc(text, uuid[]) from public, anon;
grant execute on function public.convert_duplicates() to authenticated;
grant execute on function public.complete_sbc(text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
