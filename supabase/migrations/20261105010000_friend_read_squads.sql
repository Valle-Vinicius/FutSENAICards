-- Migration: Allow authenticated users to read squads and cards of friends
-- (needed for FriendProfile to display squad and collection)

-- Read squads: any authenticated user can read any squad
drop policy if exists "read squads" on public.squads;
create policy "read squads"
  on public.squads
  for select
  to authenticated
  using (true);

-- Read cards: only between accepted friends
drop policy if exists "read friends cards" on public.cards;
create policy "read friends cards"
  on public.cards
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = cards.user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = cards.user_id)
        )
    )
  );
