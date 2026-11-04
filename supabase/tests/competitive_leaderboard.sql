do $$
begin
  if public.competitive_calculate_rating_delta(1000, 1000, 1, 32) <> 16 then
    raise exception 'Equal-rating win should award 16 points';
  end if;
  if public.competitive_calculate_rating_delta(1000, 1000, 0, 32) <> -16 then
    raise exception 'Equal-rating loss should remove 16 points';
  end if;
  if public.competitive_calculate_rating_delta(1000, 1000, 0.5, 32) <> 0 then
    raise exception 'Equal-rating draw should have zero change';
  end if;
  if public.competitive_calculate_rating_delta(800, 1200, 1, 32) <> 29 then
    raise exception 'Underdog win should use the expected-score formula';
  end if;
  if public.competitive_calculate_rating_delta(1200, 800, 0, 32) <> -29 then
    raise exception 'Opposing result should produce a symmetric rating change';
  end if;
  if public.competitive_calculate_rating_delta(1200, 800, 1, 32) <> 3 then
    raise exception 'Favorite win should use the expected-score formula';
  end if;

  if public.competitive_division_for_rating(1000) <> 'Bronze'
     or public.competitive_division_for_rating(1199) <> 'Bronze'
     or public.competitive_division_for_rating(1200) <> 'Prata'
     or public.competitive_division_for_rating(2200) <> 'Lendário' then
    raise exception 'Competitive division thresholds do not match configuration';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.player_competitive_ratings'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.competitive_rating_events'::regclass) then
    raise exception 'Competitive tables must have RLS enabled';
  end if;
  if has_table_privilege('authenticated', 'public.player_competitive_ratings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.competitive_rating_events', 'INSERT') then
    raise exception 'Authenticated users must not write competitive ratings or events';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.competitive_rating_events'::regclass
      and conname = 'competitive_rating_events_challenge_user_key'
      and contype = 'u'
  ) then
    raise exception 'Competitive ELO ledger must enforce unique (challenge_id, user_id)';
  end if;

  if to_regclass('public.matches_pvp_challenge_user_uidx') is not null then
    raise exception 'Competitive leaderboard must not depend on a unique index over legacy matches';
  end if;
end;
$$;
