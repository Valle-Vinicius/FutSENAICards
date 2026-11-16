drop policy if exists "friends can receive friend presence" on realtime.messages;
create policy "friends can receive friend presence"
on realtime.messages
for select
to authenticated
using (
  extension = 'presence'
  and split_part(realtime.topic(), ':', 1) = 'friends-presence'
  and (
    split_part(realtime.topic(), ':', 2) = (select auth.uid())::text
    or exists (
      select 1
      from public.friendships friendship
      where friendship.status in ('pending', 'accepted')
        and (
          (friendship.requester_id = (select auth.uid())
            and friendship.addressee_id::text = split_part(realtime.topic(), ':', 2))
          or
          (friendship.addressee_id = (select auth.uid())
            and friendship.requester_id::text = split_part(realtime.topic(), ':', 2))
        )
    )
  )
);

drop policy if exists "users can publish own friend presence" on realtime.messages;
create policy "users can publish own friend presence"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'presence'
  and realtime.topic() = 'friends-presence:' || (select auth.uid())::text
);
