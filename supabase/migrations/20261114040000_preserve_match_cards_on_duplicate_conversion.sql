create or replace function public.convert_duplicates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform 1 from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  with ranked as (
    select c.id,
      row_number() over (
        partition by c.name
        order by c.favorite desc,
          case c.rarity when 'icon' then 5 when 'legendary' then 4 when 'epic' then 3
                        when 'rare' then 2 when 'uncommon' then 1 else 0 end desc,
          c.overall desc
      ) as rn,
      c.rarity,
      c.favorite,
      (
        exists (
          select 1 from public.listings l
          where l.card_id = c.id and l.status = 'active'
        )
        or exists (
          select 1 from public.squads s
          where s.user_id = v_uid
            and (
              coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
            )
        )
        or exists (
          select 1 from public.saved_squads s
          where s.user_id = v_uid
            and (
              coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.starters, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(c.id::text)
              or coalesce(s.bench, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', c.id::text))
            )
        )
        or exists (
          select 1 from public.challenge_wager_escrow e
          where e.card_id = c.id
        )
        or exists (
          select 1 from public.challenges ch
          where ch.challenger_card_id = c.id
             or ch.challenged_card_id = c.id
        )
        or exists (
          select 1 from public.pool_matches m
          where m.player1_card_id = c.id
             or m.player2_card_id = c.id
        )
        or exists (
          select 1 from public.pool_wager_escrow e
          where e.card_id = c.id
        )
      ) as in_use
    from public.cards c
    where c.user_id = v_uid
  ), deleted as (
    delete from public.cards c
    using ranked r
    where c.id = r.id
      and r.rn > 1
      and r.rarity <> 'icon'
      and not r.favorite
      and not r.in_use
    returning c.id
  )
  select count(*) into v_count from deleted;

  if v_count > 0 then
    update public.profiles set coins = coins + v_count * 200 where id = v_uid;
    insert into public.transactions (user_id, amount, reason, type)
    values (v_uid, v_count * 200, 'Conversão de ' || v_count || ' duplicatas', 'earn');
  end if;
  return v_count;
end;
$$;

revoke all on function public.convert_duplicates() from public, anon;
grant execute on function public.convert_duplicates() to authenticated;
