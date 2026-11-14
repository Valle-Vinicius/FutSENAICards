alter table public.challenges
  add column if not exists engine_version integer not null default 1;

alter table public.challenges
  alter column engine_version set default 2;

create or replace function public.claim_challenge_simulation_for_version(
  p_challenge_id uuid,
  p_engine_version integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.challenges%rowtype;
  v_claim_token uuid;
begin
  select * into v_challenge
  from public.challenges
  where id = p_challenge_id
  for update;
  if not found or v_challenge.engine_version <> p_engine_version
     or v_challenge.status <> 'accepted'
     or not v_challenge.challenger_ready or not v_challenge.challenged_ready
     or v_challenge.result is not null
     or (v_challenge.simulation_claimed_until is not null and v_challenge.simulation_claimed_until >= now()) then
    return null;
  end if;

  if (v_challenge.home_snapshot is null) <> (v_challenge.away_snapshot is null) then
    raise exception 'Challenge snapshots are inconsistent';
  end if;
  if v_challenge.home_snapshot is null and v_challenge.away_snapshot is null then
    update public.challenges
    set home_snapshot = public.build_challenge_team_snapshot(v_challenge.challenger_id),
        away_snapshot = public.build_challenge_team_snapshot(v_challenge.challenged_id)
    where id = p_challenge_id;
    select * into v_challenge from public.challenges where id = p_challenge_id;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_challenge.home_snapshot -> 'cards', '[]'::jsonb)) as item(card)
    join public.cards c on c.id::text = (item.card ->> 'uid')
    where c.pack_group = 'off_sale'
       or exists (
         select 1
         from public.card_templates t
         where t.pack_group = 'off_sale'
           and lower(t.name) = lower(c.name)
       )
  ) or exists (
    select 1
    from jsonb_array_elements(coalesce(v_challenge.away_snapshot -> 'cards', '[]'::jsonb)) as item(card)
    join public.cards c on c.id::text = (item.card ->> 'uid')
    where c.pack_group = 'off_sale'
       or exists (
         select 1
         from public.card_templates t
         where t.pack_group = 'off_sale'
           and lower(t.name) = lower(c.name)
       )
  ) then
    raise exception 'Off-Sale cards cannot be used in PvP';
  end if;

  v_claim_token := gen_random_uuid();
  update public.challenges
  set simulation_claimed_until = now() + interval '10 minutes',
      simulation_claim_token = v_claim_token,
      updated_at = now()
  where id = p_challenge_id;
  return v_claim_token;
end;
$$;

create or replace function public.claim_challenge_simulation(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_engine_version integer;
begin
  select engine_version into v_engine_version
  from public.challenges
  where id = p_challenge_id;
  if not found then return null; end if;
  if v_engine_version <> 1 then
    raise exception 'Challenge uses engine version %, expected version 1', v_engine_version;
  end if;
  return public.claim_challenge_simulation_for_version(p_challenge_id, 1);
end;
$$;

create or replace function public.claim_challenge_simulation_v2(p_challenge_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.claim_challenge_simulation_for_version(p_challenge_id, 2);
$$;

revoke all on function public.claim_challenge_simulation_for_version(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_challenge_simulation(uuid) from public, anon, authenticated;
revoke all on function public.claim_challenge_simulation_v2(uuid) from public, anon, authenticated;
grant execute on function public.claim_challenge_simulation(uuid) to service_role;
grant execute on function public.claim_challenge_simulation_v2(uuid) to service_role;

notify pgrst, 'reload schema';
