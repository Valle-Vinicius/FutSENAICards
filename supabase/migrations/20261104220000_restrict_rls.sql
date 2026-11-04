-- Migration: Restrict sensitive tables to read-only for users
-- Revoke INSERT/UPDATE/DELETE on sensitive tables from authenticated role
-- Only service_role (Edge Functions) can write.

-- Cards: users can only read their own cards
drop policy if exists "own cards" on cards;
drop policy if exists "read own cards" on cards;
create policy "read own cards" on cards for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on cards from authenticated;

-- Missions: users can only read their own missions
drop policy if exists "own missions" on missions;
drop policy if exists "read own missions" on missions;
create policy "read own missions" on missions for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on missions from authenticated;

-- Achievements: users can only read their own achievements
drop policy if exists "own achievements" on achievements;
drop policy if exists "read own achievements" on achievements;
create policy "read own achievements" on achievements for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on achievements from authenticated;

-- Transactions: users can only read their own transactions
drop policy if exists "own transactions" on transactions;
drop policy if exists "read own transactions" on transactions;
create policy "read own transactions" on transactions for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on transactions from authenticated;

-- Matches: users can only read their own matches
drop policy if exists "own matches" on matches;
drop policy if exists "read own matches" on matches;
create policy "read own matches" on matches for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on matches from authenticated;

-- SBC completions: users can only read their own
drop policy if exists "own sbc_completions" on sbc_completions;
drop policy if exists "read own sbc_completions" on sbc_completions;
create policy "read own sbc_completions" on sbc_completions for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on sbc_completions from authenticated;

-- Leaderboard: users can read all, but only service_role can write
drop policy if exists "own leaderboard" on leaderboard;
drop policy if exists "read leaderboard" on leaderboard;
drop policy if exists "read leaderboard" on leaderboard;
create policy "read leaderboard" on leaderboard for select to authenticated using (true);
revoke insert, update, delete on leaderboard from authenticated;

-- Profiles: users can read own, update only name/avatar (not coins/xp/level)
drop policy if exists "own profile" on profiles;
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
-- Note: column-level restrictions need to be enforced via RPC or trigger
-- For now, revoke direct update on sensitive columns
revoke update (coins, xp, level, preferences, packs_opened, last_daily_claim) on profiles from authenticated;

-- Listings: users can read all active, create own, cancel own
drop policy if exists "read listings" on listings;
drop policy if exists "read listings" on listings;
create policy "read listings" on listings for select to authenticated using (true);
drop policy if exists "own listings" on listings;
drop policy if exists "create own listings" on listings;
create policy "create own listings" on listings for insert to authenticated with check (auth.uid() = seller_id);
drop policy if exists "update own listings" on listings;
create policy "update own listings" on listings for update to authenticated
  using (auth.uid() = seller_id) with check (auth.uid() = seller_id);
revoke delete on listings from authenticated;

-- Saved squads: users can CRUD own
drop policy if exists "own saved_squads" on saved_squads;
drop policy if exists "own saved_squads" on saved_squads;
create policy "own saved_squads" on saved_squads for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Squads: users can read/update own
drop policy if exists "own squads" on squads;
drop policy if exists "own squads" on squads;
create policy "own squads" on squads for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recent transfers: users can read own
drop policy if exists "own recent_transfers" on recent_transfers;
drop policy if exists "read own recent_transfers" on recent_transfers;
create policy "read own recent_transfers" on recent_transfers for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on recent_transfers from authenticated;

-- Price history: all can read and insert
drop policy if exists "read price_history" on price_history;
drop policy if exists "read price_history" on price_history;
create policy "read price_history" on price_history for select to authenticated using (true);
drop policy if exists "insert price_history" on price_history;
drop policy if exists "insert price_history" on price_history;
create policy "insert price_history" on price_history for insert to authenticated with check (true);
revoke update, delete on price_history from authenticated;
