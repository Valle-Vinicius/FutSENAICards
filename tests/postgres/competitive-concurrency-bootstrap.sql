create extension if not exists pgcrypto;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$roles$;

alter role service_role bypassrls;
create schema if not exists auth;
grant usage on schema public, auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Player',
  position text not null default 'GK',
  overall integer,
  pace integer,
  shooting integer,
  passing integer,
  dribbling integer,
  defending integer,
  physical integer,
  reflexes integer,
  positioning integer,
  handling integer,
  xp integer not null default 0,
  season_stats jsonb not null default '{}'::jsonb
);

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  formation text not null default '1-2-1',
  starters jsonb not null default '[]'::jsonb,
  is_primary boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Saved',
  formation text not null default '1-2-1',
  starters jsonb not null default '[]'::jsonb
);

create table if not exists public.leaderboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  score integer not null default 0
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sport text default 'futsal',
  match_type text default 'friendly',
  challenge_id uuid,
  status text default 'completed',
  home_score integer,
  away_score integer,
  opponent text,
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;
drop policy if exists matches_select_own on public.matches;
drop policy if exists matches_insert_own on public.matches;
drop policy if exists matches_update_own on public.matches;
drop policy if exists matches_delete_own on public.matches;
create policy matches_select_own on public.matches for select to authenticated using (auth.uid() = user_id);
create policy matches_insert_own on public.matches for insert to authenticated with check (auth.uid() = user_id);
create policy matches_update_own on public.matches for update to authenticated using (auth.uid() = user_id);
create policy matches_delete_own on public.matches for delete to authenticated using (auth.uid() = user_id);
grant all on public.matches to authenticated, service_role;

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  challenged_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'rejected', 'completed')) default 'pending',
  seed bigint,
  challenger_ready boolean not null default false,
  challenged_ready boolean not null default false,
  home_formation text,
  away_formation text,
  home_score integer,
  away_score integer,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_id <> challenged_id)
);

alter table public.challenges enable row level security;
drop policy if exists challenges_select_own on public.challenges;
create policy challenges_select_own on public.challenges
  for select to authenticated using (auth.uid() = challenger_id or auth.uid() = challenged_id);
grant all on public.challenges to authenticated;

create table if not exists public.friendships (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles to authenticated, service_role;
grant all on public.cards, public.squads, public.saved_squads, public.leaderboard to service_role;
grant select, insert, update, delete on auth.users to service_role;
