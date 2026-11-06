-- Migration: Tabela de templates de cartas (para cartas criadas pelo admin que aparecem em pacotes)
create table if not exists public.card_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text not null default 'Ala',
  nationality text not null default 'Brasil',
  age integer not null default 20,
  club text not null default 'Clube',
  attributes jsonb not null default '{}'::jsonb,
  gk_attributes jsonb,
  image text,
  base_rarity text not null default 'uncommon',
  base_overall integer,
  special text not null default 'none',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.card_templates enable row level security;

drop policy if exists "card_templates_read_all" on public.card_templates;
create policy "card_templates_read_all" on public.card_templates for select to authenticated using (true);

drop policy if exists "card_templates_admin_write" on public.card_templates;
create policy "card_templates_admin_write" on public.card_templates for all to authenticated using (auth.uid() = '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid) with check (auth.uid() = '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid);

-- RPC: criar template de carta (apenas admin)
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
  p_special text default 'none'
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
  insert into public.card_templates (name, position, nationality, age, club, attributes, gk_attributes, image, base_rarity, special, created_by)
  values (
    p_name, p_position, p_nationality, p_age, p_club,
    jsonb_build_object('pace', p_pace, 'shooting', p_shooting, 'passing', p_passing, 'dribbling', p_dribbling, 'defending', p_defending, 'physical', p_physical),
    case when p_reflexes is not null then jsonb_build_object('reflexes', p_reflexes, 'positioning', p_positioning, 'handling', p_handling) else null end,
    p_image, 'uncommon', p_special, v_uid
  )
  returning id into v_template_id;
  return v_template_id;
end;
$$;
