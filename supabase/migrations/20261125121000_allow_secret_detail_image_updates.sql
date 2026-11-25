create or replace function public.admin_save_template_detail_image(
  p_name text,
  p_detail_image text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_admin_uid uuid := '35a8dc5f-c5db-4b33-9380-a32739ff6c10';
  v_detail_image text := nullif(btrim(p_detail_image), '');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_uid <> v_admin_uid then raise exception 'Not authorized'; end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Template name is required';
  end if;
  if v_detail_image is not null and length(v_detail_image) > 2048 then
    raise exception 'Detail image URL must be at most 2048 characters';
  end if;
  if v_detail_image is not null and not (
    v_detail_image ~* '^https?://'
    or (left(v_detail_image, 1) = '/' and left(v_detail_image, 2) <> '//')
  ) then
    raise exception 'Detail image must be an HTTP(S) URL or a local absolute path';
  end if;

  perform set_config('app.secret_template_rpc', 'on', true);

  update public.card_templates
  set detail_image = v_detail_image,
      updated_at = now()
  where name = btrim(p_name);

  if not found then raise exception 'Template not found'; end if;
end;
$$;

revoke all on function public.admin_save_template_detail_image(text, text) from public, anon;
grant execute on function public.admin_save_template_detail_image(text, text) to authenticated;

notify pgrst, 'reload schema';
