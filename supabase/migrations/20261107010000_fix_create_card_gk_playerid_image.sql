-- Migration: Corrigir create_card para goleiro (reflexes=0), playerId, imagem e campos faltantes
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
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
  v_card_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_uid <> v_admin_uid then raise exception 'Not authorized'; end if;
  insert into public.cards (
    user_id, name, position, sport, rarity, edition, special,
    overall, pace, shooting, passing, dribbling, defending, physical,
    reflexes, positioning, handling, xp, evo_points, upgrades,
    evolution_log, season_stats, image, favorite, is_new, obtained_at, schema_version, player_id,
    nationality, age, club
  ) values (
    v_uid, p_name, p_position, 'futsal', p_rarity, p_edition, p_special,
    p_overall, p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical,
    p_reflexes, p_positioning, p_handling, 0, 0, null,
    null, '{}'::jsonb, p_image, false, true, now(), 4,
    replace(lower(p_name), ' ', '-') || '-' || p_rarity,
    p_nationality, p_age, p_club
  )
  returning id into v_card_id;
  return v_card_id;
end;
$$;
