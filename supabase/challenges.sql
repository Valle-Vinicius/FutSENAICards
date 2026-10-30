create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  challenged_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','accepted','rejected','completed')) default 'pending',
  seed bigint,
  home_formation text,
  away_formation text,
  home_score int,
  away_score int,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_id <> challenged_id)
);

alter table public.challenges enable row level security;

create policy "challenges_select_own" on public.challenges
  for select to authenticated
  using (auth.uid() = challenger_id or auth.uid() = challenged_id);

create policy "challenges_insert_own" on public.challenges
  for insert to authenticated
  with check (auth.uid() = challenger_id and status = 'pending');

create policy "challenges_update_parties" on public.challenges
  for update to authenticated
  using (auth.uid() = challenger_id or auth.uid() = challenged_id);

grant all on public.challenges to authenticated;

alter publication supabase_realtime add table public.challenges;
