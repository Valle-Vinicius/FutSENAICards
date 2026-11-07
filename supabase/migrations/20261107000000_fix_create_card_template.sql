-- Migration: Corrigir create_card_template para gravar base_overall e base_rarity
-- Adiciona parâmetros faltantes e grava corretamente na tabela card_templates

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
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
  v_template_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_uid <> v_admin_uid then raise exception 'Not authorized'; end if;
  insert into public.card_templates (name, position, nationality, age, club, attributes, gk_attributes, image, base_rarity, base_overall, special, created_by)
  values (
    p_name, p_position, p_nationality, p_age, p_club,
    jsonb_build_object('pace', p_pace, 'shooting', p_shooting, 'passing', p_passing, 'dribbling', p_dribbling, 'defending', p_defending, 'physical', p_physical),
    case when p_reflexes is not null then jsonb_build_object('reflexes', p_reflexes, 'positioning', p_positioning, 'handling', p_handling) else null end,
    p_image, p_base_rarity, p_base_overall, p_special, v_uid
  )
  returning id into v_template_id;
  return v_template_id;
end;
$$;
