insert into public.changelog_entries (version, title, body, category)
values (
  '1.4.2',
  'Pendências e notícias dinâmicas na Home',
  'A Home agora reúne desafios recebidos, pedidos de amizade, missões prontas, anúncios vendidos e cartas novas. A recompensa diária ganhou sequência com bônus progressivo de moedas, e o nome do perfil é carregado pelo store. O Radar do SENAI atualiza prévias do Jornal FutSenai a cada 30 segundos e direciona a leitura completa para o site do Jornal. (Commit `d2db387`.)',
  'novo'
)
on conflict (version, title) do nothing;
