  create or replace function public.open_packs_bulk(
    p_pack_id text,
    p_count integer
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = pg_catalog, public
  as $$
  declare
    v_user_id uuid := auth.uid();
    v_pack_index integer;
    v_pack_rows jsonb;
    v_all_cards jsonb := '[]'::jsonb;
  begin
    if v_user_id is null then
      raise exception 'Not authenticated' using errcode = '28000';
    end if;

    if v_user_id <> '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
      raise exception 'Bulk pack opening is not enabled for this account' using errcode = '42501';
    end if;

    if p_count is null or p_count not in (5, 10, 100) then
      raise exception 'Pack count must be 5, 10, or 100';
    end if;

    if p_pack_id is null or p_pack_id not in (
      'bronze', 'silver', 'gold', 'premium', 'rareplayers',
      'legends', 'position_gk', 'off_sale'
    ) then
      raise exception 'This pack cannot be opened in bulk';
    end if;

    for v_pack_index in 1..p_count loop
      select coalesce(jsonb_agg(to_jsonb(opened)), '[]'::jsonb)
        into v_pack_rows
        from public.open_pack(p_pack_id) as opened;

      if jsonb_array_length(v_pack_rows) = 0 then
        raise exception 'Pack opening returned no cards';
      end if;

      v_all_cards := v_all_cards || v_pack_rows;
    end loop;

    return v_all_cards;
  end;
  $$;

  revoke all on function public.open_packs_bulk(text, integer) from public, anon;
  grant execute on function public.open_packs_bulk(text, integer) to authenticated;
