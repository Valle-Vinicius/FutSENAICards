revoke all on function public.create_challenge_with_wager(uuid, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.accept_challenge_with_wager(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_challenge(uuid) to authenticated;
grant execute on function public.accept_challenge(uuid) to authenticated;
