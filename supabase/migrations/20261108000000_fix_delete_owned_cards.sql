-- Migration: Corrigir delete_owned_cards para aceitar text[] corretamente
create or replace function public.delete_owned_cards(p_card_ids text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  delete from cards
  where id::text = any(p_card_ids)
    and user_id = v_uid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
