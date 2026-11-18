create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  version text not null check (
    char_length(version) <= 20
    and version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
  ),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  category text not null check (category in ('novo', 'melhoria', 'correcao', 'seguranca', 'balanceamento')),
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version, title)
);

create index if not exists changelog_entries_published_at_idx
  on public.changelog_entries (published_at desc, id desc);

alter table public.changelog_entries enable row level security;
revoke all on public.changelog_entries from public, anon, authenticated;
grant select (id, version, title, body, category, published_at) on public.changelog_entries to anon, authenticated;

drop policy if exists "changelog entries are public" on public.changelog_entries;
create policy "changelog entries are public"
  on public.changelog_entries
  for select
  to anon, authenticated
  using (true);

create or replace function public.admin_save_changelog_entry(
  p_id uuid,
  p_version text,
  p_title text,
  p_body text,
  p_category text,
  p_published_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_version text := btrim(p_version);
  v_title text := btrim(p_title);
  v_body text := btrim(p_body);
begin
  if v_uid is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Not authorized';
  end if;
  if v_version is null or char_length(v_version) > 20
     or v_version !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' then
    raise exception 'Version must use semantic versioning (x.y.z) and contain at most 20 characters';
  end if;
  if v_title is null or char_length(v_title) not between 1 and 120 then
    raise exception 'Title must contain between 1 and 120 characters';
  end if;
  if v_body is null or char_length(v_body) not between 1 and 4000 then
    raise exception 'Body must contain between 1 and 4000 characters';
  end if;
  if p_category is null or p_category not in ('novo', 'melhoria', 'correcao', 'seguranca', 'balanceamento') then
    raise exception 'Invalid changelog category';
  end if;

  insert into public.changelog_entries (id, version, title, body, category, published_at, created_by)
  values (v_id, v_version, v_title, v_body, p_category, coalesce(p_published_at, now()), v_uid)
  on conflict (id) do update
  set version = excluded.version,
      title = excluded.title,
      body = excluded.body,
      category = excluded.category,
      published_at = excluded.published_at,
      updated_at = now();

  return v_id;
end;
$$;

create or replace function public.admin_delete_changelog_entry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is distinct from '35a8dc5f-c5db-4b33-9380-a32739ff6c10'::uuid then
    raise exception 'Not authorized';
  end if;
  if p_id is null then
    raise exception 'Entry is required';
  end if;

  delete from public.changelog_entries where id = p_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.admin_save_changelog_entry(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_delete_changelog_entry(uuid) from public, anon, authenticated;
grant execute on function public.admin_save_changelog_entry(uuid, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_delete_changelog_entry(uuid) to authenticated;

-- Realtime payloads must not include created_by or other private columns.
do $$
declare
  v_columns text[];
  v_is_published boolean;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1
      from pg_publication p
      where p.pubname = 'supabase_realtime'
        and (
          p.puballtables
          or exists (
            select 1
            from pg_publication_namespace pn
            join pg_namespace n on n.oid = pn.pnnspid
            where pn.pnpubid = p.oid
              and n.nspname = 'public'
          )
        )
    ) then
      raise exception 'supabase_realtime publishes all public columns; changelog_entries requires a column-restricted publication';
    end if;

    select exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'changelog_entries'
    ) into v_is_published;

    if not v_is_published then
      execute 'alter publication supabase_realtime add table public.changelog_entries (id, version, title, body, category, published_at)';
    else
      select columns into v_columns
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'changelog_entries';

      if v_columns is null then
        execute 'alter publication supabase_realtime drop table public.changelog_entries';
        execute 'alter publication supabase_realtime add table public.changelog_entries (id, version, title, body, category, published_at)';
      elsif not (v_columns <@ array['id', 'version', 'title', 'body', 'category', 'published_at']) then
        execute 'alter publication supabase_realtime drop table public.changelog_entries';
        execute 'alter publication supabase_realtime add table public.changelog_entries (id, version, title, body, category, published_at)';
      end if;
    end if;
  end if;
end;
$$;

insert into public.changelog_entries (version, title, body, category, published_at)
values
  (
    '1.3.1',
    'Melhorias nos filtros do mercado',
    'O mercado recebeu ajustes de navegação e filtros para facilitar a busca de cartas e anúncios. (Commit `ecd0f5a`.)',
    'melhoria',
    '2026-11-16T13:45:35-03:00'
  ),
  (
    '1.3.2',
    'Gestão de vendas mais clara',
    'A área de vendas foi reorganizada para destacar anúncios ativos e o histórico de cartas negociadas. (Commit `ffd6616`.)',
    'melhoria',
    '2026-11-16T13:51:10-03:00'
  ),
  (
    '1.3.3',
    'Histórico de transações',
    'Adicionamos o histórico de compras e vendas, com paginação e dados resumidos das transferências. (Commit `59d013e`.)',
    'novo',
    '2026-11-16T14:14:06-03:00'
  ),
  (
    '1.3.4',
    'Guia completo e abertura de pacotes',
    'O guia do projeto foi ampliado e a experiência visual de abertura de pacotes recebeu uma atualização. (Commit `ceb04d8`.)',
    'melhoria',
    '2026-11-16T22:34:27-03:00'
  ),
  (
    '1.3.5',
    'Ajuste no tamanho das cartas reveladas',
    'Corrigimos o dimensionamento das cartas durante a revelação para manter atributos e conteúdo legíveis. (Commit `1e17f24`.)',
    'correcao',
    '2026-11-16T22:40:13-03:00'
  ),
  (
    '1.3.6',
    'Aprimoramentos na tela de abertura',
    'Ajustes de estilo e comportamento foram aplicados à experiência de abrir pacotes. (Commit `7138ecb`.)',
    'melhoria',
    '2026-11-16T22:53:21-03:00'
  ),
  (
    '1.3.7',
    'Restauração do modelo original de pacotes',
    'A tela de abertura voltou ao modelo visual anterior, preservando a apresentação original dos pacotes. (Commit `357b467`.)',
    'correcao',
    '2026-11-16T22:59:04-03:00'
  ),
  (
    '1.3.8',
    'Tabela de usuários no admin',
    'A tabela administrativa passou a usar melhor o espaço disponível e exibir a última vez que cada pessoa esteve online. (Commit `f486ed8`.)',
    'melhoria',
    '2026-11-16T23:07:21-03:00'
  ),
  (
    '1.3.9',
    'Melhorias para dispositivos móveis',
    'Ajustamos proporções das cartas, abertura de pacotes, grades e navegação para telas pequenas. (Commit `f15dec5`.)',
    'melhoria',
    '2026-11-16T23:44:02-03:00'
  ),
  (
    '1.4.0',
    'Recursos globais e instalação como app',
    'Atualizamos metadados e títulos, carregamento sob demanda, busca global, notificações, cores e suporte à instalação como PWA. (Commit `ba2b509`.)',
    'novo',
    '2026-11-17T23:41:11-03:00'
  )
on conflict (version, title) do nothing;

notify pgrst, 'reload schema';
