-- Migration: Conceder SELECT em card_templates para authenticated
grant select on public.card_templates to authenticated;
