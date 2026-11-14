create or replace function public.add_compare_history(p_a_uid text, p_b_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_preferences jsonb;
  v_history jsonb;
  v_previous jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_a_uid is null or p_a_uid = '' or p_b_uid is null or p_b_uid = '' or p_a_uid = p_b_uid then
    raise exception 'Invalid comparison pair';
  end if;

  select coalesce(preferences, '{}'::jsonb)
  into v_preferences
  from public.profiles
  where id = v_uid
  for update;
  if not found then raise exception 'Profile not found'; end if;

  v_history := v_preferences -> 'compareHistory';
  if jsonb_typeof(v_history) <> 'array' then v_history := '[]'::jsonb; end if;
  v_previous := v_history -> 0;
  if (v_previous ->> 'aUid' = p_a_uid and v_previous ->> 'bUid' = p_b_uid)
    or (v_previous ->> 'aUid' = p_b_uid and v_previous ->> 'bUid' = p_a_uid) then
    return v_history;
  end if;

  v_history := jsonb_build_array(jsonb_build_object(
    'aUid', p_a_uid,
    'bUid', p_b_uid,
    'at', floor(extract(epoch from clock_timestamp()) * 1000)
  )) || v_history;

  select coalesce(jsonb_agg(entry order by ordinal), '[]'::jsonb)
  into v_history
  from (
    select entry, ordinal
    from jsonb_array_elements(v_history) with ordinality as history(entry, ordinal)
    where ordinal <= 20
  ) recent;

  update public.profiles
  set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{compareHistory}', v_history, true)
  where id = v_uid;

  return v_history;
end;
$$;

revoke all on function public.add_compare_history(text, text) from public, anon;
grant execute on function public.add_compare_history(text, text) to authenticated;

notify pgrst, 'reload schema';
