-- Migration: Adicionar coluna updated_at à tabela card_templates
-- Necessária para o RPC admin_upsert_template funcionar corretamente
-- (usa updated_at = now() no ON CONFLICT DO UPDATE)

alter table public.card_templates
  add column if not exists updated_at timestamptz not null default now();
