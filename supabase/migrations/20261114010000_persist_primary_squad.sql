alter table public.squads
  add column if not exists bench jsonb not null default '[]'::jsonb;

drop function if exists public.set_primary_squad(text, jsonb, jsonb);

create function public.set_primary_squad(
  p_formation text,
  p_starters jsonb,
  p_bench jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_formation is null or p_formation not in ('1-2-1', '2-2', '3-1', '4-0') then
    raise exception 'Unsupported futsal formation';
  end if;
  if jsonb_typeof(p_starters) is distinct from 'array' then
    raise exception 'A futsal squad must have exactly five starter slots';
  end if;
  if jsonb_array_length(p_starters) <> 5 then
    raise exception 'A futsal squad must have exactly five starter slots';
  end if;
  if jsonb_typeof(p_bench) is distinct from 'array' then
    raise exception 'Squad bench must be an array';
  end if;

  delete from public.squads
  where user_id = v_user_id;

  insert into public.squads (user_id, formation, starters, bench, is_primary, updated_at)
  values (v_user_id, p_formation, p_starters, p_bench, true, now());

  return true;
end;
$$;

revoke all on function public.set_primary_squad(text, jsonb, jsonb) from public, anon;
grant execute on function public.set_primary_squad(text, jsonb, jsonb) to authenticated;
