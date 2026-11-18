insert into public.changelog_entries (version, title, body, category)
values (
  '1.4.3',
  'Página de Créditos',
  'Adicionamos uma aba de Créditos à navegação, com fotos e links dos responsáveis pelo FutSENAI Cards, Jornal FutSENAI e FutSENAI Score.',
  'novo'
)
on conflict (version, title) do nothing;
