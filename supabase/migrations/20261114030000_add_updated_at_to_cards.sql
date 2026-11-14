alter table public.cards
  add column if not exists updated_at timestamptz not null default now();
