create or replace function public.refund_cancelled_challenge_wager()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_escrow public.challenge_wager_escrow%rowtype;
begin
  if new.status not in ('rejected', 'cancelled', 'abandoned')
     or old.status not in ('pending', 'accepted')
     or old.result is not null
     or old.simulation_claim_token is not null then
    return new;
  end if;
  for v_escrow in
    select * from public.challenge_wager_escrow
    where challenge_id = new.id and status = 'held'
  loop
    if v_escrow.coins > 0 then
      update public.profiles set coins = coins + v_escrow.coins where id = v_escrow.user_id;
    end if;
    update public.challenge_wager_escrow set status = 'refunded' where id = v_escrow.id;
  end loop;
  return new;
end;
$$;

do $$
declare
  v_escrow public.challenge_wager_escrow%rowtype;
begin
  for v_escrow in
    select escrow.*
    from public.challenge_wager_escrow escrow
    join public.challenges challenge on challenge.id = escrow.challenge_id
    where escrow.status = 'held'
      and challenge.status in ('rejected', 'cancelled', 'abandoned')
      and challenge.result is null
      and challenge.simulation_claim_token is null
  loop
    if v_escrow.coins > 0 then
      update public.profiles set coins = coins + v_escrow.coins where id = v_escrow.user_id;
    end if;
    update public.challenge_wager_escrow set status = 'refunded' where id = v_escrow.id;
  end loop;
end;
$$;
