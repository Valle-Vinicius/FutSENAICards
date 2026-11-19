# Guia completo do FutSENAI Cards

> Guia de entrada para manutenção do projeto. Conferido no código e nas migrations locais em **16/11/2026**.
>
> Para qualquer alteração, o código e a migration mais recente são a fonte de verdade; documentação de domínio mais antiga pode descrever estados anteriores.

## 1. Em 60 segundos

O FutSENAI Cards é uma aplicação web de coleção e competição de cartas de futsal. O frontend é React/TypeScript, com navegação protegida por autenticação Supabase. O Supabase fornece PostgreSQL, Auth, RLS, RPCs e Realtime; algumas operações também usam Edge Functions em Deno.

O estado do jogo é mantido em um store Zustand e persistido no `localStorage`, mas isso funciona como cache/continuidade da interface, **não como fonte autoritativa para saldo, propriedade de cartas, compras ou resultados competitivos**. As operações econômicas e competitivas importantes devem ser conferidas no backend.

Pontos para não perder tempo:

- A navegação atual usa `BrowserRouter`, não `HashRouter`.
- A rota do Mercado é `/market`; o histórico de transações é uma aba dentro da página, não uma rota independente.
- As rotas de jogo são protegidas por autenticação.
- O frontend precisa de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O exemplo de `.env` contém apenas placeholders.
- Nunca coloque `service_role`/`SERVICE_ROLE_KEY` no frontend ou em documentação versionada.
- Há 58 migrations no repositório, de `20261104013505` a `20261116150000`. Elas não formam um bootstrap completo de um banco vazio: tabelas centrais já existentes são alteradas pelas migrations, mas sua criação inicial não está toda versionada aqui.
- A migration mais recente registra transações concluídas do Mercado. Operações anteriores a essa implementação não têm histórico reconstruível confiável.
- A publicação Realtime é parcial. Uma assinatura que existe no React não prova que a tabela esteja publicada no banco.

## 2. Stack e comandos

Versões declaradas no `package.json`:

- React 19, React DOM 19 e TypeScript 6.
- Vite 8, plugin React e Tailwind CSS 4.
- Zustand 5 para estado.
- React Router 7 para rotas.
- Supabase JS 2 para Auth, PostgREST, RPC, Edge Functions e Realtime.
- Framer Motion para animações; Lucide React para ícones; clsx para classes.
- Jest 30, Testing Library e Oxlint.

Comandos:

```bash
npm install
npm run dev
npm run build       # tsc -b && vite build
npm run lint        # oxlint
npm test            # Jest
npm run test:postgres
npm run preview
```

`npm run test:postgres` é um teste de integração destrutivo em banco descartável. Exige `DATABASE_URL` apontando para `localhost` nas portas 5432 ou 54322 e `PVP_TEST_ALLOW_RESET=1`; o script valida esses requisitos antes de resetar fixtures. **Não aponte esse teste para produção.**

O workflow [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) dispara em push para `main`/`master`, usa Node 22, executa `npm install` e `npm run build`, e publica `dist` no GitHub Pages. Esse workflow não roda lint nem testes. O Vite usa `/FutSENAICards/` como `base` quando `GITHUB_ACTIONS` está definido. Há referências a domínio Vercel no código de CORS da sinuca; confirme o destino de deploy realmente utilizado antes de alterar domínios ou configuração.

## 3. Estrutura do repositório

| Caminho | Responsabilidade |
|---|---|
| `src/App.tsx` | Inicialização, sessão, presença, rotas e limite de erro. |
| `src/main.tsx` | Entrada React; monta a aplicação sob `StrictMode`. |
| `src/components/` | Layout/sidebar, carta visual, modais, tutorial, carregamento, toasts e componentes reutilizáveis. |
| `src/pages/` | Telas da aplicação. |
| `src/store/useGame.ts` | Store Zustand, persistência local e coordenação de sincronização/ações do jogo. |
| `src/store/toast.ts` | Estado e API de notificações toast. |
| `src/lib/supabase.ts` | Inicialização do cliente Supabase no navegador. |
| `src/lib/services/` | Serviços de domínio que consultam tabelas, RPCs, Auth, Realtime e Edge Functions. |
| `src/hooks/useHomePendingCounts.ts` | Atualiza contagens da Home por uma RPC e pausa as consultas com a aba oculta. |
| `src/lib/game.ts` | Defaults e regras compartilhadas de progressão, formação, raridade e cartas. |
| `src/data/` | Templates de jogadores, poses, dados estáticos e economia. |
| `src/engine/match.ts` | Simulação determinística de partidas; não depende de React/DOM. |
| `src/engine/pool/` | Regras, física e tipos do jogo de sinuca. |
| `src/types.ts` | Tipos e metadados compartilhados do domínio do jogo. |
| `supabase/migrations/` | Alterações versionadas de schema, políticas, triggers e funções PostgreSQL. |
| `supabase/functions/` | Implementações das Edge Functions Deno. |
| `supabase/tests/` | Asserções SQL de integridade/leaderboard competitivo. |
| `tests/` | Testes Jest de engines, store, serviços, componentes e páginas. |
| `docs/` | Este guia e documentação complementar por domínio. |
| `scripts/balance.ts` | Script auxiliar de balanceamento, executado por `npm run balance`. |

O projeto não tem `supabase/config.toml` na raiz de `supabase/`. Não assuma que `supabase start` reproduz o backend inteiro localmente.

## 4. Inicialização, autenticação e navegação

### Fluxo de inicialização

1. `main.tsx` monta `App` em `StrictMode`.
2. `App.tsx` chama `useGame.getState().init()` e inicia o carregamento de templates do banco.
3. O cliente é criado apenas se `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estiverem definidos; caso contrário, `supabase` é `null`.
4. Com Supabase, `App` carrega a sessão com `auth.getSession()` e acompanha `onAuthStateChange`. Em `SIGNED_IN`, dispara `syncUserData(userId)`.
5. Sem sessão, a rota coringa redireciona para `/auth`. A tela de autenticação oferece login, cadastro, Google e recuperação de senha.
6. Com usuário autenticado, `ProtectedRoute` e `Layout` envolvem as páginas de jogo.
7. Enquanto autenticado, o app atualiza `profiles.last_seen` imediatamente, ao voltar a aba visível e a cada 5 minutos, somente com a aba visível; o indicador baseado em `last_seen` usa janela de 10 minutos e a presença de amigos também acompanha o canal privado.

Auth e proteção de rotas ficam em `src/lib/services/auth.ts`, `src/components/ProtectedRoute.tsx`, `src/pages/Auth.tsx` e `src/App.tsx`. A sessão do SDK Supabase é distinta da persistência do Zustand.

### Rotas atuais

Todas, exceto `/auth`, ficam no grupo autenticado:

| Rota | Página | Responsabilidade |
|---|---|---|
| `/auth` | `Auth` | Entrar, cadastrar e recuperar acesso. |
| `/` | `Home` | Resumo da conta, atividades e atalhos. |
| `/packs` | `Packs` | Catálogo de pacotes. |
| `/open/:packId` | `OpenPack` | Animação e resultado de abertura/seleção. |
| `/collection` | `Collection` | Inventário, filtros e coleção. |
| `/card/:uid` | `CardDetail` | Detalhes/progresso de uma carta. |
| `/squad` | `Squad` | Elenco, formação e titulares/reservas. |
| `/match` | `Match` | Partida amistosa/PvP e desafio por query string. |
| `/pool/:matchId` | `Pool` | Partida de sinuca sincronizada. |
| `/compare` | `Compare` | Comparação de cartas/jogadores. |
| `/market` | `Marketplace` | Anúncios, gerenciamento das vendas e histórico concluído. |
| `/sbc` | `SBC` | Desafios de montagem de elenco. |
| `/missions` | `Missions` | Progresso e resgate de missões. |
| `/shop` | `Shop` | Loja/eventos e recompensas de conta. |
| `/profile` | `Profile` | Perfil próprio e exclusão de conta. |
| `/settings` | `Settings` | Preferências. |
| `/friends` | `Friends` | Amigos, solicitações e presença. |
| `/profile/:userId` | `FriendProfile` | Perfil público de outro jogador, elenco e ações sociais. |
| `/leaderboard` | `Leaderboard` | Classificações competitivas. |
| `/leaderboard/player/:userId` | `CompetitiveProfile` | Perfil competitivo, histórico e confronto direto. |
| `/admin` | `Admin` | Ferramentas administrativas; autorização real é validada no servidor. |

O `BrowserRouter` recebe `basename` `/FutSENAICards` quando o pathname começa com esse prefixo, para suportar o deploy no GitHub Pages.

## 5. Estado do jogo e sincronização

### Zustand e `localStorage`

`src/store/useGame.ts` cria o store com middleware `persist` usando a chave `futsenai-cards-v3`. O estado inclui moedas/XP/nível, cartas, missões, conquistas, formações, pacotes, configurações, anúncios, preferências e históricos locais.

O `merge` de persistência mantém o `sbcs` vindo do estado inicial atual. `init()` também corrige dados antigos de cartas/pacotes e inicializa eventos locais quando necessário. Portanto, **não trate tudo que aparece no store como dado confirmado no servidor**.

### Sincronização com o servidor

`syncUserData(userId)` é serializado por uma promise chain para evitar corridas entre inicialização, login e fluxos de partida. Em alto nível:

- Cartas remotas são consultadas por usuário e são autoritativas para instâncias com UUID do banco. Progresso local compatível é combinado por `mergeCardProgress`.
- Cartas locais ainda não sincronizadas podem ser inseridas no servidor seguindo as regras de migração do store; cartas iniciais locais não são simplesmente duplicadas em uma conta que já possui inventário remoto.
- Elencos salvos, elenco principal, anúncios ativos, missões, conquistas, configurações e campos selecionados de `profiles` são carregados/sincronizados.
- Falhas de leitura de cartas não devem ser interpretadas como inventário vazio; o store preserva dados locais quando a leitura remota falha.

As chamadas de sync aparecem em mais de um fluxo. Há serialização no store para reduzir concorrência, mas não existe um mecanismo global que atualize todos os dados pessoais por Realtime/foco/reconexão. Consulte o diagnóstico de Realtime antes de assumir frescor entre dispositivos.

### Autoridade do dado

- **Autoridade do servidor:** identidade/sessão, saldo de operações confirmadas, propriedade de cartas, anúncios e compra/venda, rewards protegidas, estado competitivo, partidas multiplayer e histórico oficial do mercado.
- **Cache/UX:** `localStorage`, filtros, seleção temporária, animações e partes do estado que ainda podem ser reconciliadas com o banco.
- `GameState.transactions`, `priceHistory` e `recentTransfers` são coleções locais do store; **não substituem** `marketplace_transactions`, que é o ledger de compra/venda efetivamente concluída.
- Ao alterar uma operação de moeda/carta, use a RPC/Edge Function autoritativa já existente ou crie migration/RPC transacional. Não faça o saldo local ser a única validação.

## 6. Domínios do produto

### Cartas, raridades e progresso

`PlayerCard` e enums/metadados estão em `src/types.ts`. Posições: `GK`, `Fixo`, `Ala`, `Pivo`; esporte atual: `futsal`. Raridades incluem `common`, `uncommon`, `rare`, `epic`, `legendary`, `icon` e `secret`. Edições especiais e cores também estão centralizadas em `types.ts`.

Templates e imagens são resolvidos por `src/data/players.ts`; templates do banco podem ser carregados e combinados com os locais. Overall/raridade, evolução, atributos extras e economia têm regras auxiliares em `src/lib/game.ts`, `src/data/economy.ts` e `docs/SISTEMA_OVERALL.md`/`docs/SISTEMA_CARTAS.md`. Antes de modificar cálculo, procure todos os chamadores e testes: atributos/posição influenciam coleção, pacotes, elencos, PvP e visual.

### Pacotes e progressão

O catálogo e defaults são compartilhados entre cliente e backend. A abertura atual do store usa RPC `open_pack`; escolha posterior pode usar `claim_pack_choice`. Outras RPCs encontradas no fluxo incluem `claim_daily`, `claim_mission`, `add_xp`, `spend_coins`, `convert_duplicates` e `complete_sbc`. O frontend aplica resultados retornados pelo servidor e atualiza o store.

Há uma Edge Function chamada `open-pack`, mas não foi encontrado uso do cliente por `functions.invoke('open-pack')`; não a confunda com o fluxo RPC atual sem confirmar os chamadores.

### Elencos e partidas de futsal

`src/engine/match.ts` é uma engine pura com seed determinística, versão de motor (`MATCH_ENGINE_VERSION`) e eventos/frames/estatísticas. `Match.tsx` apresenta o resultado/animação. Desafios PvP congelam snapshots de escalação e tática; RPCs criam/aceitam/marcam pronto e uma Edge Function simula/fecha o desafio. Resultados competitivos alimentam rating e histórico por funções/triggers do banco.

### Sinuca

`src/engine/pool/` contém regras, física e tipos. `Pool.tsx` coordena entrada, estado visual, turnos e conexão. O backend valida usuário/turno/tempo e registra tacadas via `pool-shot`/RPCs; Postgres Changes e Broadcast sincronizam o jogo, com polling apenas quando o canal Realtime está indisponível e a aba está visível. O broadcast de mira é limitado a 10 atualizações por segundo, com heartbeat a cada segundo quando a mira não muda. Há fluxo de convites, apostas/escrow e leaderboard próprio. Consulte `docs/SISTEMA_SINUCA_POOL.md` e `docs/SISTEMA_SINUCA_ENGINE.md`, mas valide no código os intervalos atuais.

### Mercado e histórico oficial

`src/lib/services/marketplace.ts` lê anúncios, cria/cancela anúncios e consulta histórico. `useGame` coordena ações; a tela e suas abas estão em `src/pages/Marketplace.tsx`.

Uma compra real atual chama a Edge Function `buy-listing`, que valida sessão e executa `buy_listing`. A migration `20261116150000_marketplace_transaction_history.sql` atualiza essa RPC para registrar a compra concluída na mesma transação PostgreSQL, protegendo a identidade do comprador e impedindo duplicidade pelo `listing_id`. Uma transação guarda buyer/seller, nomes no momento da compra, carta, preço e `completed_at`; a linha é visível apenas aos participantes via RLS. A RPC `marketplace_transaction_summary` calcula compras, vendas, gasto, recebido, volume e saldo líquido para o usuário autenticado.

A mesma transação aparece como compra para buyer e venda para seller. Anúncio cancelado/expirado não entra no ledger. Compras anteriores ao ledger não têm contraparte/horário confiáveis e não devem ser inventadas ou reconstruídas a partir de anúncios antigos. A tabela nova é adicionada à publicação Realtime pela migration, caso a publicação exista.

### Amizades, perfil e presença

`Friends.tsx` usa `src/lib/services/friends.ts` para amigos/solicitações e presença privada. `App.tsx` envia heartbeat de `profiles.last_seen`; os canais de presença `friends-presence:<userId>` são autorizados por policy específica em `realtime.messages`. Perfis de terceiros podem ser consultados por páginas e funções específicas; use projeções/RPCs mínimas, nunca amplie leitura de dados sensíveis apenas para facilitar a UI.

### Leaderboard competitivo

`leaderboard.ts` expõe RPCs de ranking, perfil, histórico de rating e confronto direto. Há rankings de X1 e sinuca, com rating/tabelas distintas. A UI está em `Leaderboard.tsx` e `CompetitiveProfile.tsx`; os cálculos autoritativos estão nas migrations/triggers, não devem ser reimplementados no componente.

### Admin

O link é exibido no `Layout` para a conta administrativa, mas isso é apenas UX. As RPCs administrativas também checam identidade no servidor. A migration `20261116130000_admin_user_directory.sql` inclui listagem de usuários, atualização de campos de conta/rating, auditoria em `admin_user_audit` e Broadcast privado `admin-users`; `AdminUsersPanel.tsx` escuta invalidações. Faça qualquer alteração administrativa somente pelas operações server-side autorizadas e mantenha o registro de auditoria.

## 7. Supabase: configuração, dados e segurança

### Cliente e segredos

`src/lib/supabase.ts` cria o cliente browser usando somente:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

O arquivo `.env.example` mostra apenas valores fictícios. Configure `.env.local` localmente e não o inclua em commits. A anon/publishable key é pública por natureza, mas o acesso continua dependendo de Auth, grants e RLS. Chaves service-role são privilegiadas e devem existir somente como secrets do backend/Edge Functions.

Os handlers não usam um nome uniforme para a chave privilegiada: `buy-listing`, `delete-account`, `open-pack` e `pool-shot` leem `SERVICE_ROLE_KEY`; `simulate-challenge` e `get-challenge-data` leem `SUPABASE_SERVICE_ROLE_KEY`. Ao configurar/deployar, confira o nome esperado por cada função; não copie valores secretos para este guia.

### Entidades principais

O banco contém mais tabelas do que a lista abaixo. A tabela inicial de várias entidades centrais não está criada pelas 58 migrations versionadas; verifique o banco/migrations históricas antes de reconstruir um projeto vazio.

| Grupo | Entidades mais relevantes | Uso |
|---|---|---|
| Conta e inventário | `profiles`, `cards`, `card_templates`, `secret_card_supply`, `secret_card_drops` | Perfil/progresso, instâncias de cartas, catálogo e raridades especiais. |
| Economia | `transactions`, `economy_config`, `demo_coin_claims`, `pending_pack_choices` | Movimentações/proteções da economia, resgates de demonstração e escolhas pendentes. Não confundir `transactions` com o ledger de cartas. |
| Coleção e progressão | `missions`, `achievements`, `squads`, `saved_squads`, `leaderboard` | Missões, conquistas, elenco e rankings de colecionador. |
| Mercado | `listings`, `marketplace_transactions` | Anúncios e registro oficial de compras concluídas. |
| Social/PvP | `friendships`, `challenges`, `challenge_rewards`, `challenge_wager_escrow`, `challenge_wager_results` | Amizades, desafios, recompensas e apostas/reservas. |
| Sinuca | `pool_matches`, `pool_shots`, `pool_wager_escrow` | Estado de partida, tacadas e reservas de aposta. |
| Ratings competitivos | `player_competitive_ratings`, `competitive_rating_events`, `pool_competitive_ratings`, `pool_competitive_results`, `competitive_config`, `pvp_anonymized_players` | Rating e histórico competitivo de futsal/sinuca. |
| Admin e auditoria | `admin_user_audit` | Registro de alterações administrativas. |

FKs e políticas variam por entidade. Inspecione as migrations e as policies atuais antes de inferir cascatas ou acesso. A proteção real é a combinação de grants, RLS, validação nas RPCs e autorização de Edge Function; esconder botão no React não protege operação.

### RPCs que aparecem com frequência no frontend

Exemplos (não é inventário completo):

- Conta/economia: `spend_coins`, `add_xp`, `claim_daily`, `claim_mission`, `begin_demo_coin_claim`, `finish_demo_coin_claim`.
- Cartas: `open_pack`, `claim_pack_choice`, `convert_duplicates`, `delete_owned_cards`, `set_card_favorite`, `mark_cards_seen`.
- SBC/mercado: `complete_sbc`, `create_listing`, `cancel_listing`, `expire_marketplace_listings`, `marketplace_transaction_summary`.
- Squad: `set_primary_squad`.
- Desafio: `create_challenge`, `accept_challenge`, `set_challenge_ready`, `reject_challenge`, `abandon_challenge`, `update_challenge_playback`.
- Sinuca: `create_pool_match_wager`, `accept_pool_match_wager`, `reject_pool_match`, `abandon_pool_match`, `pool_server_time`.
- Ranking: `competitive_list_players`, `competitive_get_profile`, `competitive_get_rating_history`, `competitive_get_head_to_head`, `pool_competitive_list_players`.
- Admin: `admin_list_users`, `admin_update_user_stats`, `admin_save_template`, `admin_upsert_secret_card`, `create_card`.

Procure o nome de uma RPC no código **e** em `supabase/migrations/` antes de alterá-la. O diagnóstico remoto de 16/11/2026 encontrou algumas RPCs usadas pelo cliente sem definição nas migrations locais (`set_card_favorite`, `mark_cards_seen`); essa divergência deve ser resolvida/versionada, não ignorada.

### Edge Functions

| Função | Finalidade | Observação |
|---|---|---|
| `buy-listing` | Valida sessão e chama `buy_listing` para compra de anúncio. | Fluxo autoritativo da compra do Mercado. |
| `delete-account` | Limpa dados da conta e remove usuário do Auth. | Usa rotina SQL de limpeza e Admin Auth. |
| `get-challenge-data` | Carrega dados oficiais/snapshots de um desafio para participantes. | Confere participação e valida snapshots/elenco. |
| `simulate-challenge` | Simula e conclui desafio PvP no servidor. | Usa lease/claim e engine determinística compartilhada. |
| `pool-shot` | Valida e processa tacada de sinuca. | Verifica jogador, turno, prazo e posição. |
| `open-pack` | Endpoint legado/alternativo para abertura de pacote. | Não foi encontrado chamador no frontend; o fluxo atual usa RPC `open_pack`. |

Funções Deno ficam em `supabase/functions/<nome>/index.ts`; algumas importam engines TypeScript compartilhadas por caminho relativo a `src/`. Não atualize a lógica do servidor ignorando a versão/contrato compartilhado com o browser.

### Migrations e estado remoto

- Diretório: `supabase/migrations/`; nomes têm timestamp e devem ser aplicados em ordem.
- A lista local tem 58 arquivos até `20261116150000_marketplace_transaction_history.sql`.
- O conjunto começa com alterações ao domínio PvP, e não contém criação completa do schema base (`profiles`, `cards`, `listings` etc.). Não é seguro assumir que uma instalação vazia será criada apenas aplicando esse diretório.
- Não há `supabase/config.toml`; o vínculo e credenciais da CLI são específicos da máquina.
- Há divergência histórica entre código/migrations e o projeto Supabase remoto. Uma consulta remota anterior encontrou objetos que não estavam versionados. O arquivo `docs/DIAGNOSTICO_REALTIME_E_CONCORRENCIA.md` registra uma fotografia pontual; depois das migrations de presença, diretório admin e transações do dia 16, revalide o estado remoto antes de fazer afirmações sobre publicação, grants ou políticas.
- Não rode `db push`, SQL manual ou migration remota sem confirmar projeto/ref, status e impacto. Toda mudança persistente deve ser revisada, versionada e testada em banco descartável quando possível.

### Segurança conhecida a observar

- Uma auditoria remota pontual encontrou policy de leitura ampla em `profiles` e `squads`, além de divergência entre políticas locais/remotas. Revalide o estado atual antes de expor ou assinar dados dessas tabelas. Prefira RPC/view com campos mínimos.
- A migration do ledger redefiniu `buy_listing` para exigir que `auth.uid()` corresponda ao comprador informado e retirou execução de `public`/`anon`, mantendo grant para `authenticated`. Não remova essa validação/grant sem redesenhar o caminho da Edge Function.
- Dados financeiros, inventário, sessão, elencos e perfil não devem ser enviados em Broadcast sem necessidade. Realtime não substitui RLS.
- UUID/condição do link Admin no frontend não é autorização suficiente; as RPCs precisam manter a validação server-side.

## 8. Realtime e presença

Realtime está implementado por partes. O código atual usa:

- `friends.ts`: Postgres Changes para `friendships` e Presence privada `friends-presence:<userId>`.
- `Layout.tsx`/`Match.tsx`: mudanças de `challenges`; os fallbacks de consulta de convites pendentes pausam com a aba oculta.
- `get_home_pending_counts`: reúne em uma chamada as contagens de desafios, sinuca pendente, pedidos de amizade e anúncios vendidos da Home.
- `Pool.tsx`: Broadcast de mira, alterações de `pool_matches` e `pool_shots`, além de polling de reconciliação somente como fallback do canal.
- `Marketplace.tsx`: escuta `listings` e novos `marketplace_transactions`, depois recarrega dados de mercado.
- `AdminUsersPanel.tsx`: Broadcast privado de invalidação `user-updated` no tópico `admin-users`.

Pontos críticos:

1. `postgres_changes` só funciona quando a tabela está na publication `supabase_realtime` e a policy permite ao usuário observar a linha.
2. A migration do histórico adiciona `marketplace_transactions` à publication se ela existir. O diagnóstico remoto anterior encontrou `listings` fora da publication, apesar do listener da tela. Confirme se essa publicação foi alterada separadamente; não confunda o evento do ledger com evento de anúncio.
3. Eventos de DELETE podem não conter as colunas antigas completas se `REPLICA IDENTITY` estiver em `DEFAULT`. Prefira invalidar e refazer query, não derivar o estado do registro apagado.
4. Reconnect, status de canal e atualização após retorno de foco variam por tela; Layout e Match retomam consultas ao voltar à aba visível, e Pool trata status/reconciliação com mais robustez que os outros fluxos.
5. Presence é estado transitório; `last_seen` é heartbeat persistido. A definição de “online” da UI depende dos limites usados nos serviços, não apenas da conexão do navegador.

Consulte [DIAGNOSTICO_REALTIME_E_CONCORRENCIA.md](./DIAGNOSTICO_REALTIME_E_CONCORRENCIA.md) para a análise detalhada e datada de canais, polling, RLS e drift. O relatório precede algumas migrations mais recentes, então confirme os pontos alterados.

## 9. Testes e como validar mudanças

`jest.config.cjs` usa `ts-jest`, ambiente `jsdom`, `jest.setup.ts`, mocks de assets e testes em `tests/**/*.test.ts(x)`.

Áreas cobertas:

- `tests/engine/`: engine de partida, Pool e PvP.
- `tests/data/`: economia.
- `tests/store/`: economia de cartas e sincronização de elenco.
- `tests/lib/` e `tests/lib/services/`: utilitários, perfil, amizades/presença, ranking, mercado, squads e serviços.
- `tests/components/` e `tests/pages/`: UI e fluxos.
- `tests/postgres/` + `supabase/tests/`: verificação SQL/concorrência competitiva com PostgreSQL local descartável.

Para mudanças localizadas, rode os testes mais próximos e `npm run build`; execute lint/testes completos quando o escopo afetar múltiplos domínios. Mudanças em RLS/RPC devem ter validação de função/permissões em banco local ou ambiente isolado, não apenas mocks do React.

## 10. Guia rápido para a próxima IA

1. Leia este arquivo, depois confira `git status --short` e a branch; não reverta alterações que já estavam no worktree.
2. Localize rota, página, componente e serviço com busca por símbolo antes de editar. Siga os padrões existentes e mantenha tipos/funções compartilhados.
3. Para schema, leia migrations relacionadas e busque chamadores `.rpc()`/`functions.invoke()` antes de alterar contrato.
4. Para saldo, cartas, compra, recompensas e ratings, preserve a autoridade transacional do banco. Store/localStorage não é ledger.
5. Para Realtime, confira código, publicação, RLS, replica identity e cleanup do canal. Não publique tabelas de perfil/inventário para resolver apenas atualização visual.
6. Para UI, mantenha a identidade Futsenal já existente (fontes, cores, navegação e componentes) e valide desktop/mobile quando possível.
7. Execute validação focada, depois `npm run build` para alterações TypeScript relevantes.
8. Não faça deploy, migração remota, commit ou push sem pedido/necessidade explícita.

### Limites de acesso da sessão

O agente que trabalha no workspace pode ler/editar os arquivos, executar comandos e testes locais disponíveis. Isso **não garante** acesso às credenciais do Supabase, ao Dashboard, aos dados de usuários ou a uma sessão autenticada no navegador. A existência de `.env.example` não dá acesso a valores reais. A chave service-role deve continuar fora do frontend e fora deste documento.

Na sessão em que este guia foi preparado, as telas protegidas não estavam abertas em uma sessão autenticada compartilhada. Para inspeção visual real de páginas protegidas, é necessário que o ambiente forneça uma sessão de teste autorizada; não use contas/dados reais sem necessidade.

## 11. Documentação complementar

Os documentos abaixo são referências por domínio, alguns escritos antes das alterações atuais. Use-os para contexto, mas confira afirmações de status com o código/migrations:

- `SISTEMA_GERAL.md`: arquitetura e visão de domínio; contém um snapshot antigo de deploy/schema.
- `SISTEMA_INFRAESTRUTURA.md`: Supabase, RLS, Realtime, migrations e deploy; precisa de atualização quando a infraestrutura mudar.
- `SISTEMA_AUTH_SESSAO.md`: autenticação e sincronização.
- `SISTEMA_CARTAS.md` e `SISTEMA_OVERALL.md`: cartas e cálculo de overall.
- `SISTEMA_INVENTARIO_MERCADO.md`: coleção, inventário, SBC e Mercado; antecede o ledger oficial de transações.
- `SISTEMA_MULTIPLAYER_PVP.md`: desafios PvP e ratings.
- `SISTEMA_SINUCA_POOL.md` e `SISTEMA_SINUCA_ENGINE.md`: multiplayer e engine de sinuca.
- `SISTEMA_ADMIN.md`: recursos administrativos.
- `DIAGNOSTICO_REALTIME_E_CONCORRENCIA.md`: auditoria de um momento específico; precisa ser lida junto das migrations posteriores.
