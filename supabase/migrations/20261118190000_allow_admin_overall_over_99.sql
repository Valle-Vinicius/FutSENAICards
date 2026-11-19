drop function if exists public.create_card(
  text, text, text, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, text, text, text, text, integer, text
);

create function public.create_card(
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
  p_club text default 'Clube',
  p_allow_overall_over_99 boolean default false
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
  v_max_overall integer := case when coalesce(p_allow_overall_over_99, false) then 999 else 99 end;
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
  if p_overall is null or p_overall not between 0 and v_max_overall
     or exists (
       select 1 from unnest(array[p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical]) as attributes(attr)
       where attr is null or attr not between 0 and 99
     ) then
    raise exception 'Overall must be between 0 and %, and attributes between 0 and 99', v_max_overall;
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

revoke all on function public.create_card(
  text, text, text, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, text, text, text, text, integer, text, boolean
) from public, anon;
grant execute on function public.create_card(
  text, text, text, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, text, text, text, text, integer, text, boolean
) to authenticated;
