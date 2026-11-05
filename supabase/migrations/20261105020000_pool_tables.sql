-- Migration: Pool (sinuca) tables
create table if not exists pool_matches (
  id uuid primary key default gen_random_uuid(),
  player1_id uuid references profiles on delete cascade,
  player2_id uuid references profiles on delete cascade,
  stake int not null default 0,
  status text not null default 'pending' check (status in ('pending','accepted','playing','finished','declined','expired','forfeited')),
  seed int not null default 0,
  table_state jsonb,
  current_player int not null default 1,
  turn_deadline timestamptz,
  assignments jsonb default '{"player1":null,"player2":null}',
  winner_id uuid references profiles on delete set null,
  payout int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_pool_matches_player1 on pool_matches(player1_id);
create index if not exists idx_pool_matches_player2 on pool_matches(player2_id);
create index if not exists idx_pool_matches_status on pool_matches(status);

create table if not exists pool_shots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references pool_matches on delete cascade,
  player_id uuid references profiles on delete cascade,
  seq int not null,
  angle float not null,
  power float not null,
  result jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_pool_shots_match on pool_shots(match_id);

-- RLS
alter table pool_matches enable row level security;
alter table pool_shots enable row level security;

drop policy if exists "read pool_matches" on pool_matches;
create policy "read pool_matches" on pool_matches for select to authenticated
  using (auth.uid() = player1_id or auth.uid() = player2_id);

drop policy if exists "read pool_shots" on pool_shots;
create policy "read pool_shots" on pool_shots for select to authenticated
  using (exists (select 1 from pool_matches m where m.id = pool_shots.match_id and (m.player1_id = auth.uid() or m.player2_id = auth.uid())));

-- No direct writes for authenticated
revoke insert, update, delete on pool_matches from authenticated;
revoke insert, update, delete on pool_shots from authenticated;

-- Add to realtime
alter publication supabase_realtime add table pool_matches;
alter publication supabase_realtime add table pool_shots;
