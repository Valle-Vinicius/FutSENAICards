drop policy if exists "authenticated can receive global announcements" on realtime.messages;
create policy "authenticated can receive global announcements"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() = 'global-announcements'
);

create or replace function public.admin_broadcast_message(p_message text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, realtime
as $$
declare
  v_message text := pg_catalog.btrim(p_message);
begin
  if auth.uid() is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Only the administrator can send global announcements'
      using errcode = '42501';
  end if;

  if v_message is null or pg_catalog.char_length(v_message) not between 1 and 500 then
    raise exception 'Message must contain between 1 and 500 characters'
      using errcode = '22023';
  end if;

  perform realtime.send(
    jsonb_build_object('message', v_message),
    'global-message',
    'global-announcements',
    true
  );
end;
$$;

revoke all on function public.admin_broadcast_message(text) from public, anon, authenticated;
grant execute on function public.admin_broadcast_message(text) to authenticated;

notify pgrst, 'reload schema';
