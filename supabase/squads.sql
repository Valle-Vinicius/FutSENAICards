-- Excluir tabelas antigas de elenco (CUIDADO: apaga dados)
drop table if exists public.squads cascade;
drop table if exists public.saved_squads cascade;

-- Criar tabela squads com coluna is_primary
create table public.squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  formation text not null default '1-2-1',
  starters jsonb not null default '[]'::jsonb,
  bench jsonb not null default '[]'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Garantir apenas um elenco principal por usuário
create unique index unique_primary_squad on public.squads (user_id) where is_primary = true;

alter table public.squads enable row level security;

create policy "squads_select_own" on public.squads
  for select to authenticated
  using (auth.uid() = user_id);

create policy "squads_insert_own" on public.squads
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "squads_update_own" on public.squads
  for update to authenticated
  using (auth.uid() = user_id);

create policy "squads_delete_own" on public.squads
  for delete to authenticated
  using (auth.uid() = user_id);

grant all on public.squads to authenticated;

-- Tabela saved_squads (elencos salvos)
create table public.saved_squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  formation text not null default '1-2-1',
  starters jsonb not null default '[]'::jsonb,
  bench jsonb not null default '[]'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.saved_squads enable row level security;

create policy "saved_squads_select_own" on public.saved_squads
  for select to authenticated
  using (auth.uid() = user_id);

create policy "saved_squads_insert_own" on public.saved_squads
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "saved_squads_update_own" on public.saved_squads
  for update to authenticated
  using (auth.uid() = user_id);

create policy "saved_squads_delete_own" on public.saved_squads
  for delete to authenticated
  using (auth.uid() = user_id);

grant all on public.saved_squads to authenticated;

-- Realtime
alter publication supabase_realtime add table public.squads;
alter publication supabase_realtime add table public.saved_squads;

-- Reload schema cache
notify pgrst, 'reload schema';
