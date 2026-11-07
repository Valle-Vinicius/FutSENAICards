-- Migration: RPCs para admin editar overall de qualquer carta
create or replace function public.admin_get_all_cards()
returns setof public.cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_uid <> v_admin_uid then raise exception 'Not authorized'; end if;
  return query select * from public.cards order by created_at desc;
end;
$$;

create or replace function public.admin_update_card_overall(
  p_card_id uuid,
  p_overall integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_uid <> v_admin_uid then raise exception 'Not authorized'; end if;
  if p_overall < 0 or p_overall > 99 then raise exception 'Overall deve estar entre 0 e 99'; end if;
  update public.cards set overall = p_overall, updated_at = now() where id = p_card_id;
  return found;
end;
$$;
