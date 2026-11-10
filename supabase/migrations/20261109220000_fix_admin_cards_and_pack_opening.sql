drop function if exists public.create_card(
  text, text, text, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, text, text, text
);

drop function if exists public.create_card_template(
  text, text, text, integer, text, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, text, text
);

create or replace function public.create_card(
  p_name text,
  p_position text,
  p_rarity text,
  p_overall integer,
  p_pace integer,
  p_shooting integer,
  p_passing integer,
  p_dribbling integer,
  p_defending integer,
  p_physical integer,
  p_reflexes integer default null,
  p_positioning integer default null,
  p_handling integer default null,
  p_edition text default '2025/26',
  p_special text default 'none',
  p_image text default null,
  p_nationality text default 'Brasil',
  p_age integer default 20,
  p_club text default 'Clube'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
  v_card_id uuid;
begin
  if v_uid is null or v_uid <> v_admin_uid then
    raise exception 'Not authorized';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Player name must contain 1 to 80 characters';
  end if;
  if p_position not in ('GK', 'Fixo', 'Ala', 'Pivo') then
    raise exception 'Invalid player position';
  end if;
  if p_rarity not in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'icon') then
    raise exception 'Invalid card rarity';
  end if;
  if p_special not in ('none', 'totw', 'potm', 'revelation', 'legend', 'futsal') then
    raise exception 'Invalid special edition';
  end if;
  if p_overall is null or p_overall not between 0 and 99
     or exists (
       select 1 from unnest(array[p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical]) as attributes(attr)
       where attr is null or attr not between 0 and 99
     ) then
    raise exception 'Overall and attributes must be between 0 and 99';
  end if;
  if p_age is null or p_age not between 14 and 60 then
    raise exception 'Age must be between 14 and 60';
  end if;
  if p_position = 'GK' and exists (
       select 1 from unnest(array[p_reflexes, p_positioning, p_handling]) as attributes(attr)
       where attr is null or attr not between 0 and 99
     ) then
    raise exception 'Goalkeeper attributes must be between 0 and 99';
  end if;
  if p_image is not null and (
       length(p_image) > 2048
       or (p_image !~* '^https?://' and (left(p_image, 1) <> '/' or left(p_image, 2) = '//'))
     ) then
    raise exception 'Image must be an HTTP(S) URL or a local absolute path';
  end if;

  insert into public.cards (
    user_id, name, position, sport, rarity, edition, special,
    overall, pace, shooting, passing, dribbling, defending, physical,
    reflexes, positioning, handling, xp, evo_points, upgrades,
    evolution_log, season_stats, image, favorite, is_new, obtained_at, schema_version, player_id,
    nationality, age, club
  ) values (
    v_uid, btrim(p_name), p_position, 'futsal', p_rarity, '2025/26', p_special,
    p_overall, p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical,
    p_reflexes, p_positioning, p_handling, 0, 0, null,
    null, '{}'::jsonb, p_image, false, true, now(), 4,
    replace(lower(btrim(p_name)), ' ', '-') || '-' || p_rarity,
    coalesce(nullif(btrim(p_nationality), ''), 'Brasil'), p_age,
    coalesce(nullif(btrim(p_club), ''), 'Clube')
  )
  returning id into v_card_id;
  return v_card_id;
end;
$$;

revoke all on function public.create_card(text, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, text, text, text, integer, text) from public, anon;
grant execute on function public.create_card(text, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, text, text, text, integer, text) to authenticated;

create or replace function public.create_card_template(
  p_name text,
  p_position text,
  p_nationality text default 'Brasil',
  p_age integer default 20,
  p_club text default 'Clube',
  p_pace integer default 70,
  p_shooting integer default 70,
  p_passing integer default 70,
  p_dribbling integer default 70,
  p_defending integer default 70,
  p_physical integer default 70,
  p_reflexes integer default null,
  p_positioning integer default null,
  p_handling integer default null,
  p_image text default null,
  p_special text default 'none',
  p_base_rarity text default 'uncommon',
  p_base_overall integer default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
  v_template_id uuid;
begin
  if v_uid is null or v_uid <> v_admin_uid then
    raise exception 'Not authorized';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Player name must contain 1 to 80 characters';
  end if;
  if p_position not in ('GK', 'Fixo', 'Ala', 'Pivo') then
    raise exception 'Invalid player position';
  end if;
  if p_base_rarity not in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'icon') then
    raise exception 'Invalid base rarity';
  end if;
  if p_special not in ('none', 'totw', 'potm', 'revelation', 'legend', 'futsal') then
    raise exception 'Invalid special edition';
  end if;
  if exists (
       select 1 from unnest(array[p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical]) as attributes(attr)
       where attr is null or attr not between 0 and 99
     ) or (p_base_overall is not null and p_base_overall not between 0 and 99) then
    raise exception 'Overall and attributes must be between 0 and 99';
  end if;
  if p_age is null or p_age not between 14 and 60 then
    raise exception 'Age must be between 14 and 60';
  end if;
  if p_position = 'GK' and exists (
       select 1 from unnest(array[p_reflexes, p_positioning, p_handling]) as attributes(attr)
       where attr is null or attr not between 0 and 99
     ) then
    raise exception 'Goalkeeper attributes must be between 0 and 99';
  end if;
  if p_image is not null and (
       length(p_image) > 2048
       or (p_image !~* '^https?://' and (left(p_image, 1) <> '/' or left(p_image, 2) = '//'))
     ) then
    raise exception 'Image must be an HTTP(S) URL or a local absolute path';
  end if;

  insert into public.card_templates (
    name, position, nationality, age, club, attributes, gk_attributes,
    image, base_rarity, base_overall, special, created_by
  )
  values (
    btrim(p_name), p_position, coalesce(nullif(btrim(p_nationality), ''), 'Brasil'),
    p_age, coalesce(nullif(btrim(p_club), ''), 'Clube'),
    jsonb_build_object(
      'pace', p_pace, 'shooting', p_shooting, 'passing', p_passing,
      'dribbling', p_dribbling, 'defending', p_defending, 'physical', p_physical
    ),
    case when p_position = 'GK' then jsonb_build_object(
      'reflexes', p_reflexes, 'positioning', p_positioning, 'handling', p_handling
    ) else null end,
    p_image, p_base_rarity, p_base_overall, p_special, v_uid
  )
  returning id into v_template_id;
  return v_template_id;
end;
$$;

revoke all on function public.create_card_template(text, text, text, integer, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, text, text, integer) from public, anon;
grant execute on function public.create_card_template(text, text, text, integer, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, text, text, integer) to authenticated;

create or replace function public.admin_upsert_template(
  p_name text,
  p_position text,
  p_nationality text default 'Brasil',
  p_age integer default 20,
  p_club text default 'Clube',
  p_pace integer default 70,
  p_shooting integer default 70,
  p_passing integer default 70,
  p_dribbling integer default 70,
  p_defending integer default 70,
  p_physical integer default 70,
  p_reflexes integer default null,
  p_positioning integer default null,
  p_handling integer default null,
  p_image text default null,
  p_base_rarity text default 'uncommon',
  p_base_overall integer default null,
  p_special text default 'none'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
  v_template_id uuid;
begin
  if v_uid is null or v_uid <> v_admin_uid then
    raise exception 'Not authorized';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80
     or p_position not in ('GK', 'Fixo', 'Ala', 'Pivo')
     or p_base_rarity not in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'icon')
     or p_special not in ('none', 'totw', 'potm', 'revelation', 'legend', 'futsal')
     or p_age is null or p_age not between 14 and 60
     or (p_base_overall is not null and p_base_overall not between 0 and 99)
     or exists (
       select 1 from unnest(array[p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical]) as attributes(attr)
       where attr is null or attr not between 0 and 99
     ) then
    raise exception 'Invalid template fields';
  end if;
  if p_position = 'GK' and exists (
       select 1 from unnest(array[p_reflexes, p_positioning, p_handling]) as attributes(attr)
       where attr is null or attr not between 0 and 99
     ) then
    raise exception 'Goalkeeper attributes must be between 0 and 99';
  end if;
  if p_image is not null and (
       length(p_image) > 2048
       or (p_image !~* '^https?://' and (left(p_image, 1) <> '/' or left(p_image, 2) = '//'))
     ) then
    raise exception 'Image must be an HTTP(S) URL or a local absolute path';
  end if;

  insert into public.card_templates (
    name, position, nationality, age, club, attributes, gk_attributes,
    image, base_rarity, base_overall, special, created_by
  )
  values (
    btrim(p_name), p_position, coalesce(nullif(btrim(p_nationality), ''), 'Brasil'),
    p_age, coalesce(nullif(btrim(p_club), ''), 'Clube'),
    jsonb_build_object(
      'pace', p_pace, 'shooting', p_shooting, 'passing', p_passing,
      'dribbling', p_dribbling, 'defending', p_defending, 'physical', p_physical
    ),
    case when p_position = 'GK' then jsonb_build_object(
      'reflexes', p_reflexes, 'positioning', p_positioning, 'handling', p_handling
    ) else null end,
    p_image, p_base_rarity, p_base_overall, p_special, v_uid
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
    updated_at = now()
  returning id into v_template_id;
  return v_template_id;
end;
$$;

revoke all on function public.admin_upsert_template(text, text, text, integer, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, text, integer, text) from public, anon;
grant execute on function public.admin_upsert_template(text, text, text, integer, text, integer, integer, integer, integer, integer, integer, integer, integer, integer, text, text, integer, text) to authenticated;

insert into public.card_templates (
  name, position, nationality, age, club, attributes, gk_attributes,
  image, base_rarity, base_overall, special
)
select
  t.name, t.position, 'Brasil', t.age, t.club,
  jsonb_build_object(
    'pace', t.pace, 'shooting', t.shooting, 'passing', t.passing,
    'dribbling', t.dribbling, 'defending', t.defending, 'physical', t.physical
  ),
  case when t.position = 'GK' then jsonb_build_object(
    'reflexes', t.reflexes, 'positioning', t.positioning, 'handling', t.handling
  ) else null end,
  null, t.base_rarity, t.base_overall, 'none'
from (values
  ('Pietro Guedes', 'Pivo', 20, 'Aurora Futsal', 81, 88, 83, 78, 73, 87, null::integer, null::integer, null::integer, 'uncommon', 86),
  ('Muzy', 'Pivo', 21, 'Fênix Futsal', 78, 76, 69, 66, 67, 80, null::integer, null::integer, null::integer, 'uncommon', 75),
  ('Mateus Lopes', 'Pivo', 19, 'Estrela Futsal', 41, 61, 63, 61, 50, 55, null::integer, null::integer, null::integer, 'uncommon', 57),
  ('Thiago Tavares', 'Ala', 24, 'Leões Futsal', 83, 82, 85, 92, 76, 81, null::integer, null::integer, null::integer, 'uncommon', 86),
  ('João Marcos', 'Ala', 23, 'Leões Futsal', 88, 77, 75, 85, 70, 67, null::integer, null::integer, null::integer, 'uncommon', 81),
  ('Rafael Dutra', 'Ala', 21, 'Tigres Futsal', 70, 83, 77, 66, 74, 92, null::integer, null::integer, null::integer, 'uncommon', 76),
  ('Vinícius Assunção', 'Ala', 22, 'Aurora Futsal', 91, 71, 73, 68, 66, 66, null::integer, null::integer, null::integer, 'uncommon', 76),
  ('Enzo Thomas', 'Ala', 19, 'Aurora Futsal', 79, 67, 70, 84, 58, 65, null::integer, null::integer, null::integer, 'uncommon', 74),
  ('Heitor Barbosa', 'Fixo', 22, 'Tigres Futsal', 75, 73, 78, 67, 89, 77, null::integer, null::integer, null::integer, 'uncommon', 82),
  ('Gabriel Ortelan', 'Fixo', 21, 'Estrela Futsal', 58, 45, 60, 52, 80, 80, null::integer, null::integer, null::integer, 'uncommon', 70),
  ('Jonas Daniel', 'GK', 18, 'Aurora Futsal', 45, 42, 57, 40, 70, 75, 74, 64, 72, 'uncommon', 68),
  ('Rafinha', 'GK', 22, 'Aurora Futsal', 60, 30, 70, 40, 86, 62, 82, 90, 80, 'uncommon', 73),
  ('Monteiro', 'Pivo', 20, 'Fênix Futsal', 55, 30, 50, 20, 60, 40, null::integer, null::integer, null::integer, 'uncommon', 68),
  ('Eduardo', 'Ala', 21, 'Aurora Futsal', 80, 80, 70, 70, 60, 85, null::integer, null::integer, null::integer, 'common', 77),
  ('Enzo Antonio', 'GK', 20, 'Aurora Futsal', 60, 30, 70, 40, 70, 70, 78, 80, 75, 'common', 73),
  ('Ricardo', 'Pivo', 22, 'Fênix Futsal', 80, 85, 78, 78, 80, 88, null::integer, null::integer, null::integer, 'common', 77)
) as t(name, position, age, club, pace, shooting, passing, dribbling, defending, physical, reflexes, positioning, handling, base_rarity, base_overall)
on conflict (name) do nothing;

create table if not exists public.pending_pack_choices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidates jsonb not null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

alter table public.pending_pack_choices enable row level security;
revoke all on public.pending_pack_choices from public, anon, authenticated;

drop function if exists public.open_pack(uuid, integer, integer);

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
  v_icon float8;
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
  v_card_id uuid;
  v_i integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  case p_pack_id
    when 'bronze' then
      v_pack_price := 500; v_card_count := 3;
      v_common := 0.62; v_uncommon := 0.25; v_rare := 0.10; v_epic := 0.025; v_legendary := 0.004; v_icon := 0.001;
    when 'silver' then
      v_pack_price := 1500; v_card_count := 5;
      v_common := 0.30; v_uncommon := 0.35; v_rare := 0.22; v_epic := 0.10; v_legendary := 0.025; v_icon := 0.005;
    when 'gold' then
      v_pack_price := 3000; v_card_count := 5;
      v_common := 0.10; v_uncommon := 0.25; v_rare := 0.35; v_epic := 0.22; v_legendary := 0.07; v_icon := 0.01;
    when 'premium' then
      v_pack_price := 7500; v_card_count := 5;
      v_common := 0.05; v_uncommon := 0.15; v_rare := 0.35; v_epic := 0.30; v_legendary := 0.12; v_icon := 0.03;
    when 'rareplayers' then
      v_pack_price := 5000; v_card_count := 3;
      v_common := 0; v_uncommon := 0.10; v_rare := 0.40; v_epic := 0.35; v_legendary := 0.12; v_icon := 0.03;
    when 'legends' then
      v_pack_price := 12000; v_card_count := 4;
      v_common := 0; v_uncommon := 0; v_rare := 0.20; v_epic := 0.40; v_legendary := 0.30; v_icon := 0.10;
    when 'position_gk' then
      v_pack_price := 4000; v_card_count := 3; v_position_filter := 'GK';
      v_common := 0.20; v_uncommon := 0.30; v_rare := 0.30; v_epic := 0.15; v_legendary := 0.04; v_icon := 0.01;
    when 'choice' then
      v_pack_price := 10000; v_card_count := 3; v_is_choice := true;
      v_common := 0; v_uncommon := 0; v_rare := 0.20; v_epic := 0.40; v_legendary := 0.30; v_icon := 0.10;
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
    select t.name, t.position, t.nationality, t.age, t.club, t.image,
           t.base_overall, t.special,
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
         v_base_overall, v_template_special,
         v_pace, v_shooting, v_passing, v_dribbling, v_defending, v_physical,
         v_reflexes, v_positioning, v_handling
    from public.card_templates t
    where v_position_filter is null or t.position = v_position_filter
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

    v_rarity_mult := case v_rarity
      when 'common' then 0.88 when 'uncommon' then 1.0 when 'rare' then 1.05
      when 'epic' then 1.10 when 'legendary' then 1.15 else 1.20 end;
    v_rarity_bonus := case v_rarity
      when 'common' then -2 when 'uncommon' then 0 when 'rare' then 2
      when 'epic' then 4 when 'legendary' then 6 else 8 end;
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
        'positioning', v_positioning, 'handling', v_handling, 'image', v_image
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
             (v_candidate ->> 'handling')::integer, v_candidate ->> 'image', v_choice_id,
             v_remaining_coins, now();
    else
      return query
      insert into public.cards as inserted (
        user_id, name, position, sport, rarity, edition, special,
        overall, pace, shooting, passing, dribbling, defending, physical,
        reflexes, positioning, handling, xp, evo_points, upgrades,
        evolution_log, season_stats, image, favorite, is_new, obtained_at, schema_version, player_id,
        nationality, age, club
      ) values (
        v_uid, v_name, v_card_position, 'futsal', v_rarity, '2025/26', v_special,
        v_overall, v_pace, v_shooting, v_passing, v_dribbling, v_defending, v_physical,
        v_reflexes, v_positioning, v_handling, 0, 0, null,
        null, '{}'::jsonb, v_image, false, true, now(), 4,
        lower(replace(v_name, ' ', '-')) || '-' || v_rarity,
        coalesce(v_nationality, 'Brasil'), coalesce(v_age, 20), coalesce(v_club, 'Clube')
      )
      returning inserted.id, inserted.player_id, inserted.name, inserted.position, inserted.sport,
                inserted.nationality, inserted.age, inserted.club, inserted.rarity, inserted.edition,
                inserted.special, inserted.overall, inserted.pace, inserted.shooting, inserted.passing,
                inserted.dribbling, inserted.defending, inserted.physical, inserted.reflexes,
                inserted.positioning, inserted.handling, inserted.image, null::uuid, v_remaining_coins,
                inserted.created_at;
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

create or replace function public.claim_pack_choice(p_choice_id uuid, p_card_id uuid)
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
  v_candidates jsonb;
  v_candidate jsonb;
  v_remaining_coins integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select pending.candidates
  into v_candidates
  from public.pending_pack_choices pending
  where pending.id = p_choice_id
    and pending.user_id = v_uid
    and pending.expires_at > now()
  for update;
  if not found then raise exception 'Choice expired or already claimed'; end if;

  select item.candidate
  into v_candidate
  from jsonb_array_elements(v_candidates) as item(candidate)
  where item.candidate ->> 'uid' = p_card_id::text;
  if not found then raise exception 'Card is not part of this choice'; end if;

  delete from public.pending_pack_choices
  where id = p_choice_id and user_id = v_uid;

  select profile.coins into v_remaining_coins
  from public.profiles profile
  where profile.id = v_uid;

  return query
  insert into public.cards as inserted (
    user_id, name, position, sport, rarity, edition, special,
    overall, pace, shooting, passing, dribbling, defending, physical,
    reflexes, positioning, handling, xp, evo_points, upgrades,
    evolution_log, season_stats, image, favorite, is_new, obtained_at, schema_version, player_id,
    nationality, age, club
  ) values (
    v_uid, v_candidate ->> 'name', v_candidate ->> 'card_position', 'futsal',
    v_candidate ->> 'rarity', '2025/26', v_candidate ->> 'special',
    (v_candidate ->> 'overall')::integer, (v_candidate ->> 'pace')::integer,
    (v_candidate ->> 'shooting')::integer, (v_candidate ->> 'passing')::integer,
    (v_candidate ->> 'dribbling')::integer, (v_candidate ->> 'defending')::integer,
    (v_candidate ->> 'physical')::integer, (v_candidate ->> 'reflexes')::integer,
    (v_candidate ->> 'positioning')::integer, (v_candidate ->> 'handling')::integer,
    0, 0, null, null, '{}'::jsonb, v_candidate ->> 'image', false, true, now(), 4,
    v_candidate ->> 'player_id', v_candidate ->> 'nationality',
    (v_candidate ->> 'age')::integer, v_candidate ->> 'club'
  )
  returning inserted.id, inserted.player_id, inserted.name, inserted.position, inserted.sport,
            inserted.nationality, inserted.age, inserted.club, inserted.rarity, inserted.edition,
            inserted.special, inserted.overall, inserted.pace, inserted.shooting, inserted.passing,
            inserted.dribbling, inserted.defending, inserted.physical, inserted.reflexes,
            inserted.positioning, inserted.handling, inserted.image, null::uuid, v_remaining_coins,
            inserted.created_at;
end;
$$;

revoke all on function public.claim_pack_choice(uuid, uuid) from public, anon;
grant execute on function public.claim_pack_choice(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
