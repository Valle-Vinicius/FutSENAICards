-- Align matches table with app expectations
alter table public.matches
  add column if not exists sport text default 'futsal',
  add column if not exists match_type text default 'friendly',
  add column if not exists challenge_id uuid,
  add column if not exists status text default 'completed';

-- Reload schema cache
notify pgrst, 'reload schema';
