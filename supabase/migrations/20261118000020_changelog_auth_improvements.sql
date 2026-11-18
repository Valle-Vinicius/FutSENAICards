insert into public.changelog_entries (version, title, body, category, published_at)
values (
  '1.4.1',
  'Aprimoramentos na autenticação',
  'Agora é possível mostrar ou ocultar a senha, os campos usam preenchimento automático adequado e os erros de autenticação têm mensagens mais claras. A música da tela de login pode ser silenciada, e as partículas pausam quando a aba fica oculta.',
  'melhoria',
  '2026-11-18T00:00:20-03:00'
)
on conflict (version, title) do nothing;
