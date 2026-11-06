-- ============================================================================
-- CORREÇÃO RLS + REALTIME para pool_matches e pool_shots (robusto)
-- Rode no SQL Editor do Supabase (dashboard do projeto fut-senai-cards)
-- ============================================================================

-- 1. Habilitar RLS nas duas tabelas (idempotente)
alter table public.pool_matches enable row level security;
alter table public.pool_shots enable row level security;

-- 2. Revogar escritas diretas para authenticated (tudo vai via RPC / edge function)
revoke insert, update, delete on public.pool_matches from authenticated;
revoke insert, update, delete on public.pool_shots from authenticated;

-- 3. Policies de leitura: apenas os dois participantes veem a partida
drop policy if exists "read pool_matches" on public.pool_matches;
create policy "read pool_matches" on public.pool_matches
  for select to authenticated
  using (auth.uid() = player1_id or auth.uid() = player2_id);

drop policy if exists "read pool_shots" on public.pool_shots;
create policy "read pool_shots" on public.pool_shots
  for select to authenticated
  using (exists (
    select 1 from public.pool_matches m
    where m.id = pool_shots.match_id
      and (m.player1_id = auth.uid() or m.player2_id = auth.uid())
  ));

-- 4. Conceder acesso total ao service_role (edge functions usam este role)
grant all on public.pool_matches to service_role;
grant all on public.pool_shots to service_role;

-- 5. Adicionar tabelas ao realtime (ignora se já estiverem)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'pool_matches'
      and schemaname = 'public'
  ) then
    alter publication supabase_realtime add table public.pool_matches;
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'pool_shots'
      and schemaname = 'public'
  ) then
    alter publication supabase_realtime add table public.pool_shots;
  end if;
exception when others then
  null;
end $$;

-- 6. Índices (performance)
create index if not exists idx_pool_matches_player1 on public.pool_matches(player1_id);
create index if not exists idx_pool_matches_player2 on public.pool_matches(player2_id);
create index if not exists idx_pool_matches_status on public.pool_matches(status);
create index if not exists idx_pool_shots_match on public.pool_shots(match_id);

-- ============================================================================
-- Após rodar este SQL:
-- - O erro "permission denied for table pool_matches" some na edge function.
-- - O cliente consegue ler pool_matches/pool_shots (via RLS policy).
-- - O realtime (supabase.channel ... on 'postgres_changes') começa a funcionar.
-- ============================================================================
