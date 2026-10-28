-- Friends system
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;

-- Users can see friendships they are part of
create policy "friendships_select_own" on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Users can send requests (as requester, status pending)
create policy "friendships_insert_own" on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

-- Addressee can accept/reject; requester can cancel (delete) pending
create policy "friendships_update_addressee" on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

create policy "friendships_delete_own" on public.friendships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

grant all on public.friendships to authenticated;

-- Realtime
alter publication supabase_realtime add table public.friendships;
