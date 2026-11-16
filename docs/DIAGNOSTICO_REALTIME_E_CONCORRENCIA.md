# Diagnóstico de Realtime, mercado e sincronização

**Data da verificação:** 16/11/2026  
**Escopo:** leitura do código local e consultas somente de leitura ao projeto Supabase vinculado. Nenhum código de aplicação ou configuração foi alterado para este diagnóstico.  
**Como ler as evidências:** referências de código apontam para arquivos e linhas; resultados identificados como “banco remoto” vieram de `supabase db query --linked`. A definição integral de `buy_listing` foi consultada, mas não reproduzida aqui porque a RPC está executável por `anon` e a reprodução integral facilitaria abuso de uma operação financeira. O que foi verificado e a ação recomendada estão descritos abaixo.

## Resumo executivo

1. **A causa mais direta de “só atualiza com F5” no mercado é confirmada:** `listings` não está na publicação `supabase_realtime`, embora [Marketplace.tsx](../src/pages/Marketplace.tsx#L39) assine essa tabela. A assinatura não substitui o fetch inicial.
2. `cards`, `profiles`, `card_templates`, `missions`, `achievements`, `transactions`, `leaderboard` e tabelas de ranking competitivo também não estão publicados. Suas telas dependem de sincronização inicial, fetch ao entrar ou chamadas específicas.
3. Há uma **falha de autorização de alto risco**: no banco remoto `buy_listing(uuid,uuid)` é `SECURITY DEFINER`, pode ser executada por `anon` e `authenticated`, e recebe o ID do comprador como parâmetro. A Edge Function valida o usuário antes de chamar a RPC, mas a permissão pública permite contornar essa camada. Restrinja a execução à Edge Function/`service_role` ou faça a própria RPC derivar e validar `auth.uid()`.
4. As policies remotas de `profiles` e `squads` incluem SELECT `true`. Isso permite que qualquer usuário autenticado leia linhas alheias — e, em `profiles`, as colunas da linha inteira, incluindo saldo/preferências, salvo eventual restrição de coluna que não foi identificada.
5. Todos os cinco itens consultados em `relreplident` estão em `d` (default), não `f` (full). Não use payload DELETE de Postgres Changes para inferir o estado antigo.
6. `pg_cron`/`cron.job` não foi encontrado. A expiração de anúncios é uma varredura invocada por fetch/criação; não há expiração agendada comprovada.
7. As migrations do repositório não contêm definições para `buy_listing`, `set_card_favorite` nem `mark_cards_seen`, embora todas existam no remoto. A origem dessas definições não pode ser atribuída com certeza ao painel: pode ser aplicação manual ou outro pipeline fora do repositório.

---

## A. Configuração real do Realtime no banco

### 1. Publicação atual e tabelas ausentes

Consulta executada:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by 2;
```

Resultado remoto:

| schema | tabela |
|---|---|
| public | challenges |
| public | friendships |
| public | pool_matches |
| public | pool_shots |
| public | saved_squads |
| public | squads |

Logo, da lista solicitada, **não estão publicadas**: `listings`, `cards`, `profiles`, `card_templates`, `leaderboard`, `transactions`, `missions`, `achievements` e as tabelas competitivas (`player_competitive_ratings`, `competitive_rating_events`, `pool_competitive_ratings`, `pool_competitive_results`). `friendships` e `challenges` estão publicadas. Também estão publicadas as duas tabelas de sinuca e as duas de elencos.

As migrations versionadas só mostram a inclusão explícita de `pool_matches` e `pool_shots` em [20261105020000_pool_tables.sql](../supabase/migrations/20261105020000_pool_tables.sql#L51). As demais inclusões da publicação remota não têm uma inclusão correspondente encontrada nas migrations. Isso é evidência de divergência entre estado remoto e repositório, não prova de que a mudança foi feita especificamente pelo painel.

### 2. Replica identity

Consulta executada:

```sql
select c.relname, c.relreplident
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('listings','cards','profiles','challenges','friendships');
```

| tabela | `relreplident` | significado |
|---|---:|---|
| cards | d | default |
| challenges | d | default |
| friendships | d | default |
| listings | d | default |
| profiles | d | default |

Nenhuma está em `f` (FULL). Em particular, eventos DELETE não devem ser tratados como se contivessem a linha antiga completa; com default, o dado antigo disponível é limitado à identidade replicada (normalmente PK).

### 3. Realtime habilitado e limites

**Habilitação funcional:** a publicação `supabase_realtime` contém tabelas, e o banco retorna `wal_level=logical`; as queries ao banco e as migrations confirmam uso do Realtime. Isso confirma a infraestrutura de publicação no banco, mas não verifica por si só cada toggle/limite do painel.

**Limites:** `supabase projects list` retornou o projeto como ativo e PostgreSQL 17, mas não expõe o plano nem os limites de Realtime. `max_connections=60` e `max_wal_senders=5` foram lidos no PostgreSQL; são parâmetros do banco e **não equivalem** a limite de conexões simultâneas nem de eventos/s do Realtime. Não consegui confirmar no painel uma configuração de eventos por segundo ou conexões simultâneas. Plano e cotas precisam ser verificados em Dashboard → Organization/Project → Billing/Realtime.

### 4. Policies SELECT remotas e privacidade

Resultado de `pg_policies` no banco remoto, resumido para as tabelas pedidas e todas as tabelas atualmente publicadas:

| tabela | policy(s) aplicável(is) a SELECT | `qual`/alcance |
|---|---|---|
| listings | `read listings` (SELECT); `own listings` (ALL) | `true` em leitura; anúncios são públicos |
| cards | `own cards` (ALL); `read friends cards` (SELECT) | proprietário **ou amigo aceito** |
| profiles | `own profile` (ALL); `read all profiles` (SELECT) | existe policy SELECT `true` para todos os autenticados |
| card_templates | `card_templates_read_all` (SELECT); `card_templates_admin_write` (ALL) | admin ou `pack_group <> 'secret'` |
| leaderboard | `read leaderboard` (SELECT); `own leaderboard` (ALL) | SELECT `true` |
| friendships | `friendships_select_own` | requester ou addressee |
| challenges | `challenges_select_own` | challenger ou challenged |
| transactions | `own transactions` (ALL) | apenas dono |
| missions | `own missions` (ALL) | apenas dono |
| achievements | `own achievements` (ALL) | apenas dono |
| player_competitive_ratings | nenhuma policy SELECT encontrada | acesso via funções/RPCs privilegiadas |
| competitive_rating_events | nenhuma policy SELECT encontrada | acesso via funções/RPCs privilegiadas |
| pool_competitive_ratings/results | nenhuma policy SELECT encontrada | acesso via funções/RPCs privilegiadas |
| pool_matches | `read pool_matches` | player1 ou player2 |
| pool_shots | `read pool_shots` | participante da partida relacionada |
| squads | `read squads` (SELECT); `squads_select_own` (SELECT); `own squads` (ALL) | `read squads` é `true` |
| saved_squads | `saved_squads_select_own` (SELECT); `own saved_squads` (ALL) | apenas dono |

Policies permissivas PostgreSQL são combinadas por OR. Portanto, `read all profiles` e `read squads` deixam qualquer usuário autenticado ler linhas de terceiros, apesar das policies “own”. `profiles` inclui saldo e preferências em uma única linha; isso é uma exposição de dados mesmo sem Realtime. As tabelas `profiles` e `squads` não estão atualmente publicadas, mas a policy continua relevante para consultas PostgREST e para uma futura publicação.

`listings` e `leaderboard` são públicos por design aparente. `cards` amplia a leitura a amigos aceitos. As tabelas publicadas de amizade, desafio e sinuca têm policies limitadas a participantes, exceto `squads`, cuja policy pública é uma exceção importante. Resultados integrais da consulta podem ser repetidos com o SQL acima e `pg_policies`.

---

## B. Compra e concorrência

### 5. `buy_listing`: definição, transação e concorrência

Consulta remota executada:

```sql
select p.oid::regprocedure, pg_get_functiondef(p.oid)
from pg_proc p
where p.proname = 'buy_listing';
```

Assinatura encontrada: `public.buy_listing(p_listing_id uuid, p_buyer_id uuid)`, `SECURITY DEFINER`. A definição completa foi obtida. Seu fluxo confirmado é:

1. seleciona o anúncio com `FOR UPDATE`;
2. valida existência, `status='active'`, expiração e compra pelo próprio vendedor;
3. calcula o preço e trava a linha do perfil do comprador;
4. debita o comprador, credita o vendedor quando existe, transfere `cards.user_id` e marca o anúncio vendido;
5. retorna sucesso.

As alterações feitas dentro da chamada PL/pgSQL são atômicas na transação do RPC. O `FOR UPDATE` serializa compradores do mesmo anúncio: o segundo aguarda o primeiro e, ao prosseguir, encontra o anúncio já não ativo e retorna erro sem fazer uma segunda compra. Há ainda um `UPDATE ... WHERE status='active'` final seguido de `FOUND`, embora, sob o lock da linha e validação anterior, a disputa normal já tenha sido serializada.

**Problema mais importante que a concorrência:** o catálogo remoto mostra `anon_can_execute=true` e `authenticated_can_execute=true` para a função; a assinatura aceita `p_buyer_id` fornecido pelo chamador e a função não deriva o comprador de `auth.uid()`. A Edge Function é uma barreira no caminho normal, mas não é uma barreira se o RPC pode ser chamado diretamente. Ação prioritária: revogar execução de `anon`/`authenticated` e manter apenas `service_role`, ou reescrever a função para validar internamente o usuário autenticado e remover o parâmetro de comprador. Não publicar a implementação integral em repositório público antes dessa correção.

### 6. Auto-compra, estado e saldo

O código remoto valida explicitamente anúncio inexistente, estado diferente de `active`, expiração e vendedor igual ao comprador; também bloqueia perfil ausente/saldo insuficiente antes do débito. As verificações estão dentro de `buy_listing`, não apenas no React. Observação de borda: a função usa comparação de expiração estrita `< now()`, enquanto a rotina de expiração usa `<= clock_timestamp()`.

### 7. Serviço `buyListing` de update direto

[marketplace.ts](../src/lib/services/marketplace.ts#L122) ainda exporta `buyListing`, que faz `UPDATE listings SET status='sold'` direto. Busca global encontrou **zero chamadas** a essa função: a compra da tela passa por [useGame.ts](../src/store/useGame.ts#L1204), que chama `supabase.functions.invoke('buy-listing')`. Ela é código legado não usado pelo fluxo atual. Não deve ser reativada: marca vendido sem cobrar, creditar ou transferir a carta atomicamente.

### 8. Expiração de anúncios

No banco remoto, `to_regclass('cron.job')` retornou `NULL`; não há relação/job `cron.job` disponível, e não foi encontrada extensão `pg_cron`. Também não há trigger de expiração entre os triggers de `listings`. A função remota `expire_marketplace_listings()` marca todos os anúncios `active` com `expires_at <= clock_timestamp()` como `expired`.

Ela é chamada por `getListings()` e `createListing()` em [marketplace.ts](../src/lib/services/marketplace.ts#L45) e [marketplace.ts](../src/lib/services/marketplace.ts#L87), não por cron comprovado. Até uma chamada de varredura, a linha expirada pode continuar `status='active'` no banco. A consulta de mercado também filtra `expires_at > now()`, então ela deixa de aparecer mesmo antes da atualização do status. A carta permanece do vendedor enquanto listada; a compra transfere sua propriedade. Expirar não exige “devolução” da carta porque o anúncio não transfere sua propriedade ao criar.

### 9. Duplicidade de anúncio ativo

Confirmado no banco remoto: índice único parcial `listings_one_active_per_card_idx` em `card_id` para `status='active'` e `card_id IS NOT NULL`. A constraint/índice impede duas linhas ativas para a mesma carta, mesmo se o cliente tentar concorrentemente. A validação local de `listCard` é uma proteção de UX adicional, não a autoridade. Referência da migration: [20261110180000_atomic_game_rewards.sql](../supabase/migrations/20261110180000_atomic_game_rewards.sql#L407).

---

## C. Estado local e cache no frontend

### 10. Persistência do Zustand

O persist usa a chave `futsenai-cards-v3` em [useGame.ts](../src/store/useGame.ts#L1417). Não há `partialize`; o middleware persiste o estado serializável completo (por exemplo `cards`, `coins`, `missions`, `achievements`, `transactions`, `listings`, `events`, histórico, configurações e preferências). Funções não são JSON serializáveis. A estratégia `merge` preserva o estado hidratado e força `sbcs` para o valor atual.

`listings` fica salvo no localStorage. Ele pode ser lido do store antes do fetch remoto. Em Marketplace, `loading` começa `true`, e a tela faz fetch no mount ([Marketplace.tsx](../src/pages/Marketplace.tsx#L28), [Marketplace.tsx](../src/pages/Marketplace.tsx#L49)); isso evita tratar o cache como confirmação do servidor durante o carregamento, mas não elimina o cache obsoleto no store nem o problema de atualizações cross-user sem canal funcional.

### 11. Escritas de `listings`, `coins`, `cards`, `missions`, `achievements`, `events`

Principais escritores do store (cada número é uma linha de referência no código):

| estado | escritores/fluxos |
|---|---|
| `listings` | hidratação inicial no `initialState`; sincronização remota em `syncUserData` (368); fetch da tela via `applyRemoteListings` ([Marketplace.tsx](../src/pages/Marketplace.tsx#L11)); anúncio confirmado e modo offline (`useGame.ts` 1157, 1177); cancelamento confirmado (1201); expiração local (1213); compra (1225, 1233); reset (1412). |
| `coins` | carregamento do perfil remoto (388); moedas demo offline e resposta do RPC (411, 434); `spendCoins` desconta localmente e depois chama RPC (448–458); abertura de pacote usa `remaining_coins` oficial (519); recompensa diária e missão (564, 578, 705, 720); conversão (1047, 1091); compra de listing reconsulta perfil do comprador (1223); openPack alternativo/choice (1266); SBC RPC e modo offline (1379, 1391). |
| `cards` | migração local (292); sincronização remota com merge e cartas locais não sincronizadas (340–355); abertura de pacote (517); fav/seen/delete/progresso/evolução/estatísticas; conversão (1045/1089); anúncio altera `isNew` após confirmação (1157); compra reconsulta inventário do comprador (1221); SBC e outras recompensas. Não existe assinatura Realtime para `cards`. |
| `missions` | defaults (249); `syncUserData` substitui quando a consulta remota retorna lista não vazia (378), caso contrário chama `upsertMissions` com o estado corrente (379); progresso/claim local ou RPC (569, 583, 708, 723); `updateMissionProgress` persiste no serviço remoto. |
| `achievements` | defaults (250); sync só substitui se a consulta remota vier não vazia (381); desbloqueios locais em pacotes/partidas/progresso (ex.: 534–546, 671–676); `updateMissionProgress` faz upsert. |
| `events` | inicia vazio; `init()` cria eventos com `Date.now()` se vazios (309); `syncUserData` substitui pelos `profiles.preferences.events` quando presentes (398); atualização de preferências salva eventos em `profiles` (663). Não são eventos globais do servidor. |
| `transactions` | inicia vazio; o store adiciona registros locais em demo, gasto, pacote, recompensas e SBC (ex.: 412, 450, 520, 568, 709, 1092, 1267, 1382, 1394). O sync global não consulta `transactions`; há serviço de leitura próprio, mas não é usado para popular a barra de notificações da sessão. |

Sobrescritas e possíveis dados velhos:

- Cartas: o servidor é a fonte de identidade/dados base no sync, mas `mergeCardProgress` pode preferir a carta inteira local se ela parecer mais evoluída (pergunta 14).
- Listagens: `syncUserData` substitui as ativas pelo fetch remoto e mantém as antigas não ativas. `applyRemoteListings` faz merge semelhante. Sem publicação/canal real de `listings`, essas substituições só acontecem em fetch explícito.
- Missões: se `getMissions` retorna vazio (inclusive em falha, conforme o serviço), `syncUserData` envia o estado local para `upsertMissions`; isso pode ressuscitar estado local obsoleto. O serviço de missões deve distinguir “sem linhas” de “erro de leitura”.
- Eventos: preferências remotas vencem no sync se existirem; caso contrário, eventos gerados localmente continuam por usuário/dispositivo.
- Saldo: `spendCoins` desconta antes da confirmação; se RPC falha, exibe toast mas não reverte saldo local nem transação. Isso é uma sobrescrita otimista sem rollback.

### 12. Quando `syncUserData` roda

- `App` chama `init()` no mount; `init()` consulta sessão e, se autenticada, chama `syncUserData` ([useGame.ts](../src/store/useGame.ts#L319)).
- `App` chama novamente em `SIGNED_IN` ([App.tsx](../src/App.tsx#L73)).
- O store serializa syncs em cadeia para evitar concorrência ([useGame.ts](../src/store/useGame.ts#L323)).
- `Match` sincroniza após resultado confirmado ([Match.tsx](../src/pages/Match.tsx#L729)).
- `Pool` sincroniza em alguns fluxos de aposta/saldo ([Pool.tsx](../src/pages/Pool.tsx#L421), [Pool.tsx](../src/pages/Pool.tsx#L1322)).
- `Admin` sincroniza após criar carta no inventário (Admin.tsx:505); FriendProfile sincroniza em ação de aposta (FriendProfile.tsx:185).

Não há um listener global de alterações de `profiles`, `cards` ou `listings` que invoque `syncUserData` quando outro dispositivo os modifica. `TOKEN_REFRESHED` não chama explicitamente `syncUserData`.

### 13. `allTemplates()` / `getPlayerImage`

`dbTemplates` é variável de módulo em [players.ts](../src/data/players.ts#L192); `setDbTemplates` altera essa variável, mas não publica estado React. `allTemplates()` e `getPlayerImage()` só leem o valor ([players.ts](../src/data/players.ts#L240)).

Chamadores incluem `Card`, `PvpResultScreen`, `Marketplace`, `Collection`, `Admin`, os serviços de cartas/mercado e `useGame` (ver `rg` em `src`). Eles re-renderizam apenas por outros updates React/store. A carga feita por `App` não dispara por si só re-render dos consumidores; cartas que dependem do fallback de imagem podem continuar sem imagem correta até outro render. `card_templates` também não está publicada.

### 14. `mergeCardProgress`

[game.ts](../src/lib/game.ts#L133) preserva:

- se soma local de upgrades > remota **ou** XP local > remoto: devolve praticamente o objeto local inteiro, sobrescrevendo apenas `favorite` e `isNew` com o valor remoto;
- senão, se partidas locais > remotas: usa a carta remota, mas mantém `seasonStats` local;
- senão, usa a carta remota.

O ramo “carta local inteira” preserva também `xp`, `evoPoints`, `upgrades`, `evolutionLog`, `seasonStats`, mas igualmente pode preservar campos base velhos (overall/atributos/imagem etc.). Não há assinatura atual de Realtime em `cards`; ainda há risco de merge local maior ocultar estado remoto em sincronizações seguintes. Progresso local ainda não enviado ao servidor não deve ser tratado como autoridade sem uma política explícita de versionamento.

### 15. Otimismo e chegada do Realtime antes da resposta

| operação | otimista? | corrida/evento antes da resposta |
|---|---|---|
| `listCard` | não no caminho remoto: espera `create_listing` retornar antes do `set`; offline é local | se `listings` fosse publicado, o handler refaz `getListings`; a resposta posterior também insere localmente. Hoje `listings` não está publicado. |
| `cancelListing` | não: espera RPC `cancel_listing` confirmar | aplica status local depois. |
| compra | não: espera Edge Function; depois reconsulta cartas e saldo | handler de `listings` não recebe evento hoje; concorrência é decidida no banco. |
| `spendCoins` | sim: desconta antes do RPC | erro não reverte valor/transação; evento `profiles` não chega hoje (e policy é ampla). |
| `openPack` | não: espera RPC `open_pack`, usa cartas e saldo do resultado | server é autoridade; tabelas relevantes não publicadas. |
| `toggleFavorite` / `markSeen` | sim; chama persistência remota sem esperar/rollback | cards não publicados; falha pode deixar UI divergente até sync. |
| “addCoins” | não há ação pública `addCoins` no store; créditos são feitos por `claimDaily`, `claimMission`, demo, openPack/SBC, etc. | as ações remotas geralmente atualizam após o RPC; offline usa update local. |

---

## D. Assinaturas Realtime existentes

### 16. Canais, filtros e cleanup

| canal/local | assunto e filtro | cleanup/status |
|---|---|---|
| `challenges-notify-*`, [Layout.tsx](../src/components/Layout.tsx#L94) | Postgres Changes `*` em `challenges`, sem filtro; também `pool_matches`, sem filtro | remove channel e interval no cleanup; sem callback de status. Há `await getSession()` antes de criar channel/interval, sem flag de cancelamento; em unmount durante essa espera (inclusive StrictMode dev) pode criar recurso após o cleanup. |
| `marketplace-realtime`, [Marketplace.tsx](../src/pages/Marketplace.tsx#L39) | Postgres Changes `*` em `listings`, sem filtro | remove no cleanup; não trata status. A tabela não está na publicação remota. |
| `pool-match-${matchId}`, [Pool.tsx](../src/pages/Pool.tsx#L1051) | Broadcast `aim_update`/`aim_clear`; `UPDATE pool_matches` filtrado por `id`; `INSERT` e `UPDATE pool_shots` filtrados por `match_id` | remove channel e os dois intervals no cleanup. Trata `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`; no reconnect reconcilia previsões. |
| `match-challenge-*`, [Match.tsx](../src/pages/Match.tsx#L749) | `UPDATE challenges` filtrado por ID | remove no cleanup; sem status callback. |
| `friends-changes-*`, [friends.ts](../src/lib/services/friends.ts#L207) | `* friendships`, sem filtro; cliente filtra IDs no callback | retorna função que remove channel; a tela Friends a chama no cleanup. |
| `challenges-${userId}-*`, [challenges.ts](../src/lib/services/challenges.ts#L135) | `* challenges`, sem filtro; callback filtra IDs | retorna cleanup. Busca no projeto não encontrou chamador; serviço aparentemente não usado. |
| `pool-invite-${matchId}`, [FriendProfile.tsx](../src/pages/FriendProfile.tsx#L192) | `UPDATE pool_matches` filtrado pelo ID | remove nos estados terminais; nenhum cleanup por unmount/time-out visível, então convite não terminal pode deixar canal. |

`main.tsx` monta a aplicação sob `<StrictMode>` ([main.tsx](../src/main.tsx#L7)). O StrictMode executa efeitos adicionais em desenvolvimento. Canais com cleanup síncrono são removidos entre montagens; a exceção provável é o efeito de Layout, que cria o canal depois de `await getSession()` sem cancelar a continuação. Friends também cria o canal após operação assíncrona; deve ser conferido no fluxo de cleanup/active flag em [Friends.tsx](../src/pages/Friends.tsx#L32).

### 17. Canais sem filtro e RLS

Sim, Layout assina challenges e pool_matches de toda a tabela, sem filtro. Para Postgres Changes, o servidor aplica a visibilidade SELECT do usuário. No estado remoto:

- `challenges_select_own`: somente challenger/challenged;
- `read pool_matches`: somente player1/player2;
- `read pool_shots`: somente participante da partida.

Então o SELECT dessas três tabelas limita as linhas recebidas. A ressalva é `squads`: está publicada e a policy `read squads USING (true)` permite a qualquer autenticado ler alterações de qualquer squad. Layout não assina squads, mas a combinação de publicação e policy é ampla.

### 18. Polling e razão documentada

- Layout verifica convites pendentes imediatamente e a cada **5 s** ([Layout.tsx](../src/components/Layout.tsx#L84)).
- Match tem comentário explícito “fallback polling in case realtime is not enabled for the table” e busca desafio a cada **4 s** ([Match.tsx](../src/pages/Match.tsx#L625)). Hoje a tabela `challenges` está publicada, então o comentário descreve fallback/configuração histórica, não o estado remoto atual.
- Pool usa polling a cada **1 s** para recuperar tiros faltantes; atualiza histórico a cada terceiro tick (~3 s) e também reconsulta partida a cada terceiro tick ([Pool.tsx](../src/pages/Pool.tsx#L1168)). A documentação [SISTEMA_SINUCA_POOL.md](./SISTEMA_SINUCA_POOL.md#L218) diz polling a cada 3 s, portanto está desatualizada em relação ao código.
- `SISTEMA_GERAL.md` e `SISTEMA_INFRAESTRUTURA.md` registram Realtime de PvP/sinuca. O comentário de Match é a justificativa explícita de fallback encontrada. Polling é apropriado como recuperação de perda/reconexão, não prova de que Realtime esteja desligado.

### 19. `subscribeFriends` / `subscribeChallenges`

`subscribeFriends` é usado em [Friends.tsx](../src/pages/Friends.tsx#L49), e ao evento dispara reload de amizades e pedidos. Funciona para INSERT/UPDATE porque `friendships` está publicada e o SELECT policy deixa os participantes lerem a linha. Para DELETE, com identidade default, o payload antigo pode ter somente ID; o handler tenta localizar `requester_id`/`addressee_id`, portanto pode não disparar reload. A UI pode ficar velha até nova carga.

`subscribeChallenges` existe em [challenges.ts](../src/lib/services/challenges.ts#L135), mas não tem chamadores encontrados. As telas usam canais próprios (`Layout`, `Match`) e polling. Se `challenges` saísse da publication, esses canais deixariam de receber mudanças; polling de Match e Layout continuaria fazendo refetch.

### 20. Status de canal e ressincronização

Tratamento explícito de status existe no canal Pool. Marketplace, Friends, Layout e Match chamam `.subscribe()` sem callback de status. Pool reconsulta/reconcilia ao `SUBSCRIBED` e tem polling como fallback; Layout tem polling de convites; Match tem polling de desafio. Não foi encontrado listener global de `online`, `focus` ou `visibilitychange` que refaça `syncUserData` ao voltar a rede/aba. `Collection` usa `visibilitychange` para marcar cartas vistas, não para sincronizar a conta.

### 21. Renovação de token

O app registra `onAuthStateChange` em [App.tsx](../src/App.tsx#L70), mas trata `SIGNED_IN` para `syncUserData`, não `TOKEN_REFRESHED`. A versão instalada do `@supabase/supabase-js` atualiza internamente o token do Realtime: [SupabaseClient.ts](../node_modules/@supabase/supabase-js/src/SupabaseClient.ts#L724) chama `realtime.setAuth(token)` para `TOKEN_REFRESHED`, `SIGNED_IN` e `INITIAL_SESSION`. Assim, não há necessidade normal de um `setAuth` manual. Se o refresh falhar/sessão expirar, a conexão não deve ser considerada autorizada; não existe resync global de dados na renovação.

---

## E. Funcionalidades compartilhadas (o que pode exigir F5)

### 22. Matriz de telas e atualização

| tela | fonte e quando busca | precisa de tempo real? | evidência / motivo |
|---|---|---|---|
| Home | store hidratado + `syncUserData` global; busca nome via `getProfile` no mount; countdown local | Não para dados pessoais se refetch ao voltar; opcional para saldo/convites | [Home.tsx](../src/pages/Home.tsx#L48), [App.tsx](../src/App.tsx#L53) |
| Marketplace | `getListings()` no mount; `listings`/cards do store; tenta refetch no evento `listings` | **Sim** para compras/anúncios de outros, ou refetch periódico/de focus | [Marketplace.tsx](../src/pages/Marketplace.tsx#L37); table não publicada |
| Collection | cartas do store; sync global no início; config de conversão consultada no mount | Realtime opcional; refetch de cards no foco é suficiente para alterações pontuais | [Collection.tsx](../src/pages/Collection.tsx#L42), [useGame.ts](../src/store/useGame.ts#L323) |
| Squad | cartas/elencos do store; primary/saved squads vêm do sync; serviço pode salvar/definir primary | Sim para refletir alteração de elenco em FriendProfile/partida; hoje são fetch sob demanda | [Squad.tsx](../src/pages/Squad.tsx#L1), [squads.ts](../src/lib/services/squads.ts#L15) |
| Packs | `packConfigs` e saldo do store; sem fetch de pacote na tela | Não; dados são configuração estática/conta | [Packs.tsx](../src/pages/Packs.tsx#L1) |
| OpenPack | carrega pela ação `open_pack` somente quando o usuário abre | Não para abertura do próprio pacote; resultado autoritativo é RPC | [useGame.ts](../src/store/useGame.ts#L479) |
| Missions | lista `missions` do store sincronizada no boot; progresso/claim local+RPC | Não precisa stream contínuo; precisa resync ao voltar para outro dispositivo | [Missions.tsx](../src/pages/Missions.tsx#L12), [useGame.ts](../src/store/useGame.ts#L378) |
| SBC | cartas do store e definições SBC locais; conclusão RPC | Não para a própria ação; fetch para atualizar cartas após alteração externa | [SBC.tsx](../src/pages/SBC.tsx#L1), [useGame.ts](../src/store/useGame.ts#L1370) |
| Shop | eventos e moedas do store; sessão no mount; countdown local | Não para eventos locais; saldo externo exige resync | [Shop.tsx](../src/pages/Shop.tsx#L14) |
| Profile | `getProfile` no mount e ações de update/delete | Não é obrigatório para perfil próprio em uma aba; útil multi-device | [Profile.tsx](../src/pages/Profile.tsx#L40) |
| FriendProfile | profile/cards/matches/achievements/squad/friendship consultados no mount por `userId`; canal efêmero para convite de sinuca | Sim se a tela precisa refletir atividade contínua do amigo; hoje quase tudo é snapshot | [FriendProfile.tsx](../src/pages/FriendProfile.tsx#L36) |
| Friends | carga inicial de amizades/pedidos e subscription em friendships; presença via `last_seen` | Sim para pedidos/aceites; subscription existe e a tabela está publicada | [Friends.tsx](../src/pages/Friends.tsx#L32) |
| Leaderboard | RPCs de ranking no mount e ao mudar busca/filtros/paginação | Não para navegação; polling/refetch periódico se exige ranking “ao vivo” | [Leaderboard.tsx](../src/pages/Leaderboard.tsx#L167) |
| CompetitiveProfile | RPC de perfil e histórico no mount/paginação; H2H por seleção | Não continuamente; resync sob demanda é suficiente | [CompetitiveProfile.tsx](../src/pages/CompetitiveProfile.tsx#L108) |
| Admin | templates e `secret_card_supply` no mount; RPCs após salvar | Sim somente para propagação a usuários online; hoje não há subscription de template/card | [Admin.tsx](../src/pages/Admin.tsx#L120), [Admin.tsx](../src/pages/Admin.tsx#L137) |
| Match | snapshot via Edge Function e refetch; realtime UPDATE challenge + fallback 4 s; depois sync de recompensa | **Sim** durante o match (já implementado) | [Match.tsx](../src/pages/Match.tsx#L614), [Match.tsx](../src/pages/Match.tsx#L625), [Match.tsx](../src/pages/Match.tsx#L749) |
| Pool | `getPoolMatch`, shots e perfis na entrada; Realtime por partida + polling de recuperação 1 s | **Sim**, crítico para estado autoritativo/turno; já implementado | [Pool.tsx](../src/pages/Pool.tsx#L445), [Pool.tsx](../src/pages/Pool.tsx#L1051), [Pool.tsx](../src/pages/Pool.tsx#L1168) |

### 23. O que o vendedor vê após a compra

No servidor: o anúncio vira `sold`, `cards.user_id` muda para comprador e o saldo do comprador/vendedor é atualizado dentro do RPC. No cliente comprador, após a Edge Function, `buyListing` recarrega suas cartas e saldo.

No cliente vendedor: **não há mecanismo confiável atual de atualização/notificação imediata**. `listings`, `cards` e `profiles` não estão publicados; o canal da tela Marketplace assina `listings`, mas por isso não receberá esses eventos. O saldo, a carta e o anúncio podem permanecer velhos até `syncUserData`/fetch posterior, navegação que recarregue, ou F5. Não foi encontrado canal de notificação do vendedor.

### 24. Alterações do admin vistas por usuários online

- Criar/editar template: altera `card_templates`; não publicada. Clientes não recebem mudança automática. `allTemplates()` também não notifica React.
- Alterar overall: a RPC do admin atualiza a carta no banco, mas `cards` não está publicada; proprietário online mantém o objeto do store até sync.
- Criar carta para conta: `create_card` salva no servidor. Se criação ocorrer para o próprio admin, Admin chama `syncUserData`; para outro usuário não há notificação automática.
- Conclusão: os usuários online não veem automaticamente a mudança nessas telas; carregamento/sync posterior é necessário.

### 25. Eventos da Shop

Sim. `useGame.init()` cria os dois eventos de demonstração usando `Date.now()` quando `events` está vazio ([useGame.ts](../src/store/useGame.ts#L305)). Não foi encontrada tabela global de eventos. O estado pode ser persistido em `profiles.preferences.events` ([useGame.ts](../src/store/useGame.ts#L663)), então é por conta quando sincronizado, não uma agenda global autoritativa idêntica para todos. Usuários/instalações com preferências diferentes podem receber `endsAt` diferentes.

### 26. Rankings, triggers e volume Realtime

- Ranking de colecionadores: tabela `leaderboard`, atualizada por `updateCollectorRanking` via upsert do cliente após alguns fluxos (ex.: abrir pacote/converter duplicatas); SELECT público. Não é view materializada. O código de serviço está em [leaderboard.ts](../src/lib/services/leaderboard.ts#L246).
- PvP competitivo: tabelas `player_competitive_ratings` e `competitive_rating_events`; o trigger remoto `challenges_apply_competitive_result` executa quando `challenges.status` muda para `completed`, atualizando ratings e gravando dois eventos de rating.
- Sinuca competitiva: trigger remoto `pool_matches_competitive_result` chama `apply_pool_competitive_result` em atualização de status de partida.
- Os quatro objetos de ranking **não estão na publication**, portanto seus writes não geram eventos `postgres_changes` para clientes hoje. Uma conclusão PvP gera um UPDATE em `challenges` visível só aos participantes; uma partida Pool gera UPDATE em `pool_matches` visível aos participantes e INSERTs na `pool_shots` durante tacadas. O número/segundo máximo não pode ser calculado sem limite de partidas/ritmo de uso; um update por partida não implica evento em tabelas de rating publicadas porque elas não estão publicadas.

### 27. Perfis de terceiros e nome do vendedor

Perfis de terceiros aparecem em FriendProfile, Friends, rankings e anúncios. A policy remota `read all profiles USING (true)` permite leitura de perfis para todos os autenticados. Em `getListings`, o serviço faz join `profiles:seller_id(name)` e define fallback “Usuário” caso o join não retorne nome ([marketplace.ts](../src/lib/services/marketplace.ts#L51), [marketplace.ts](../src/lib/services/marketplace.ts#L70)). Como a policy atual é pública, o nome normalmente pode ser retornado. O `select('*')` de FriendProfile consulta perfil inteiro, mais amplo do que a tela precisa.

### 28. Alterações de moedas fora da aba

Saldo pode mudar por outro dispositivo, compra/venda, recompensa, admin ou uso simultâneo. Recarregamentos identificados:

- `syncUserData`: boot/auth, conclusão de Match e alguns fluxos Pool/Admin/FriendProfile;
- compra: saldo e cartas do comprador são consultados após a Edge Function;
- abrir pacote/claim diário/claim missão/SBC: usa valor retornado pela RPC;
- converter duplicatas: consulta saldo do perfil ao concluir.

Não há subscription de `profiles` e, portanto, não há atualização espontânea do saldo por venda/recompensa em outro dispositivo. `spendCoins` local é a principal exceção otimista sem rollback.

---

## F. Segurança e privacidade

### 29. Risco de eventos entre usuários

**Estado atual:** `cards`, `profiles`, `transactions`, `missions` e `achievements` não estão publicados, então não emitem Postgres Changes hoje. Se publicados:

- `cards`: policy permite próprio + amigos aceitos; isso expõe coleção a amigos (intencional conforme policy), não a qualquer usuário.
- `profiles`: policy `read all profiles=true`; qualquer autenticado pode ler a linha/updates de terceiro, incluindo colunas sensíveis.
- `transactions`, `missions`, `achievements`: policy de SELECT é do dono.
- `leaderboard`: SELECT público por design.

Para tabelas Postgres Changes, a visibilidade RLS do SELECT restringe eventos de linhas; isso não transforma uma policy `true` em privada. Evite publicar linhas que misturam campos públicos e secretos (especialmente `profiles`); exponha view/RPC com colunas públicas em vez de uma tabela inteira.

### 30. DELETE e dados removidos

O projeto remove cartas em `delete_owned_cards` ([20261106010000_secure_rpcs.sql](../supabase/migrations/20261106010000_secure_rpcs.sql#L186)), conversão de duplicatas e SBC ([20261115100000_secret_rarity.sql](../supabase/migrations/20261115100000_secret_rarity.sql#L603)), além de rotinas de remoção/anonymização de conta. A tela de amizade também apaga linhas de `friendships` ao rejeitar/cancelar/remover ([friends.ts](../src/lib/services/friends.ts#L160)).

`cards` não está publicada; logo esses deletes de carta não são transmitidos por Postgres Changes hoje. `friendships` está publicada e está em identidade `d`: não conte com atributos antigos no payload DELETE. O handler de `subscribeFriends` usa `payload.old` e espera requester/addressee; com apenas PK, pode não reconhecer o usuário e não refazer a consulta. Para tabelas sensíveis, preferir RPC/fetch de reconciliação após evento, sem publicar deletes indiscriminadamente. Não foi executado teste de rede/packet para caracterizar o fan-out exato dos DELETEs.

### 31. Edge Function `buy-listing`

`createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } })` seguido por `auth.getUser()` é uma forma válida de validar o JWT encaminhado: o header global faz a consulta de auth verificar a identidade do usuário, enquanto o cliente mantém service-role para a RPC.

Pontos confirmados em [index.ts](../supabase/functions/buy-listing/index.ts#L14):

- exige header Authorization e valida usuário com `getUser()`;
- não valida método além de `OPTIONS`;
- faz `await req.json()` sem tratamento de JSON inválido;
- não valida formato/UUID de `listingId` no handler; deixa o cast/erro do RPC/PostgREST tratar;
- encaminha `user.id` como `p_buyer_id`.

Essa validação da Edge Function é correta isoladamente, mas **não protege o endpoint se `buy_listing` também permite `anon`/`authenticated` diretamente** (pergunta 5). A correção deve existir no banco, não só na Edge Function.

### 32. Admin e validação no servidor

O UUID fixo em [Layout.tsx](../src/components/Layout.tsx#L70) controla apenas a exibição do link Admin; não é controle de segurança suficiente. As migrations das RPCs administrativas verificam `auth.uid()` contra o UUID fixo e lançam “Not authorized” (ex.: [admin_update_card_overall](../supabase/migrations/20261107050000_admin_edit_card_overall.sql#L13), [admin_save_template](../supabase/migrations/20261113000000_sync_existing_cards_on_template_edit.sql#L75), [admin_upsert_secret_card](../supabase/migrations/20261115100000_secret_rarity.sql#L167)). A RLS de escrita de `card_templates` também restringe ao UUID. Para RPCs administrativas existentes no repositório, a validação é server-side; o link cliente é só UX.

---

## G. Riscos e limites

### 33. Usuários simultâneos esperados

O repositório não define um número de usuários simultâneos e não recebi estimativa do produto. Para turma/colégio com dezenas ou poucas centenas, `postgres_changes` com filtros e poucas tabelas é uma escolha razoável para mudanças persistentes. Para muitos observadores ou streams frequentes (presença/mira), usar Broadcast com autorização e payload mínimo; manter fetch autoritativo/debounce para dados de baixa frequência. A decisão final precisa de uma meta de concorrência e medição de mensagens/egress.

### 34. Plano e cotas Supabase

Não confirmado. `supabase projects list` não trouxe plano, conexões Realtime nem quota de mensagens. O valor SQL `max_connections=60` é apenas limite do PostgreSQL nesta instância e não permite inferir Free/Pro ou limite de websocket. Verificar no Dashboard de billing/Realtime antes de estimar carga.

### 35. Testes relacionados

Existem testes de fluxo/serviço, mas não encontrei cobertura de integração de Realtime para sync entre dois usuários:

- [marketplace.test.ts](../tests/lib/services/marketplace.test.ts): verifica chamada de expiração e filtragem de anúncios; não testa `buy_listing` concorrente nem seller realtime.
- [squadSync.test.ts](../tests/store/squadSync.test.ts): testa `syncUserData`/elenco e mock de listings.
- [cardEconomy.test.ts](../tests/store/cardEconomy.test.ts): proteção econômica no store.
- [Squad.test.tsx](../tests/pages/Squad.test.tsx): cartas em anúncio não podem ir ao elenco.
- [Match.test.tsx](../tests/pages/Match.test.tsx) e [pool.test.ts](../tests/engine/pool.test.ts): comportamento de partida/engine, não o conjunto real de publication/RLS.
- Não encontrei teste cobrindo policies remotas, subscription `listings`, reconnect, StrictMode/leak ou o caso de `payload.old` DELETE incompleto.

### 36. RPC chamadas sem definição versionada

Comparei os `.rpc(...)` em `src`/Edge Function com as migrations locais e funções no catálogo remoto:

| chamada encontrada no código | existe no banco remoto? | definição em `supabase/migrations`? |
|---|---:|---:|
| `buy_listing` (Edge Function) | sim | **não encontrada** |
| `set_card_favorite` (cards service) | sim | **não encontrada** |
| `mark_cards_seen` (cards service/store) | sim | **não encontrada** |
| `spend_coins` | sim | sim |
| `add_xp`, `claim_daily`, `claim_mission`, `open_pack`, `claim_pack_choice`, `complete_sbc`, `convert_duplicates` | sim | sim |
| `begin_demo_coin_claim`, `finish_demo_coin_claim` | sim | sim |
| `create_listing`, `cancel_listing`, `expire_marketplace_listings` | sim | sim |
| `admin_upsert_secret_card`, `admin_save_template`, `create_card` | sim | sim |
| funções de `friends`, squads, compare, challenges, pool e ranking | sim | encontradas em migrations correspondentes |

`add_coins` existe no catálogo remoto, mas não foi encontrado como chamada `.rpc()` em `src`; portanto não entra na lista “chamada pelo código sem definição local”. O catálogo mostra-a sem EXECUTE para `anon`/`authenticated` (ACL restrita). O fato de uma função existir remotamente e faltar no histórico versionado é uma fonte de drift e risco de deploy/reprodução.

---

## H. Decisão final

### 37a. Causa mais provável por funcionalidade

1. **Mercado/anúncios/compra do vendedor:** `listings` não publicado; UI faz fetch só no mount e subscribe inválido/inoperante para a publication atual. `cards`/`profiles` sem subscription deixam inventário e saldo do vendedor velhos também.
2. **Saldo em outro dispositivo/recompensas/venda:** `profiles` não publicada; `syncUserData` roda em eventos específicos, não em foco/reconnect global. `spendCoins` otimista sem rollback também produz divergência local.
3. **Coleção/cartas/admin editando template ou overall:** `cards` e `card_templates` não publicados, e `allTemplates` é store de módulo sem notificação React.
4. **Friends/pedidos:** canal funciona porque `friendships` está publicado e RLS seleciona participantes; DELETE pode não provocar reload porque o handler espera colunas removidas.
5. **Challenges:** tabela está publicada; Match tem Realtime e polling de 4 s. Se atraso persistir, inspecionar subscription status/filtros de usuário/RLS e manter polling como fallback.
6. **Pool:** realtime está implementado para jogo; polling de tiros de 1 s cobre perda/reabertura. Falhas restantes são mais provavelmente reconnect/ordenação/cache/render que ausência total de realtime.
7. **Leaderboard/ranking competitivo:** tabelas não estão publicadas; telas buscam RPCs quando montam/filtros mudam. Sem refetch, usuários não veem posições de outros em tempo real.
8. **Missões/conquistas:** armazenadas por usuário e sincronizadas em boot/ações, sem realtime. `getMissions` vazio pode causar upsert de estado local antigo.
9. **Shop/eventos:** não são tabela global; eventos são seeded com relógio local e gravados em preferências por conta.

### 37b. Escolha de transporte

- **`postgres_changes` com RLS + filtros:** `listings` (evento mínimo seguido de refetch público), friendships, estado de challenge/match e updates persistentes de partidas. Adicionar apenas tabelas necessárias à publication; revisar policies antes. Para `listings`, preferir payload mínimo ou broadcast de invalidação, seguido de `getListings()` com debounce.
- **Broadcast autorizado:** mira/presença/estado transitório e alto fan-out; Pool já usa Broadcast para mira. Não transmitir saldo, perfil completo ou inventário privado.
- **Refetch + debounce:** `profiles` próprias, cartas e progresso, templates, missões, conquistas, rankings e detalhes de tela. Preferir invalidar cache/consultar apenas o usuário certo ao focar ou reconectar; não publicar tabela com colunas privadas para resolver freshness.
- **Polling como fallback:** manter no Pool e Match com backoff/visibilidade para recuperação; não usar polling permanente agressivo em todas as telas.
- Antes de publicar `cards`, `profiles`, `transactions`, `missions` ou `achievements`, testar RLS com dois usuários e considerar DELETE/colunas antigas. Realtime não substitui autorização de consultas, RPC ou Edge Function.

### 37c. Cinco maiores riscos de quebrar ao implementar

1. **Compra financeira concorrente/segurança:** RPC `buy_listing` está executável por `anon` e aceita comprador fornecido; restringir grants e validar identidade sem quebrar a Edge Function; manter a transação única e locks.
2. **Vazamento por RLS:** `profiles` SELECT true expõe linha completa; `squads` SELECT true expõe elencos. Publicar tabelas antes de corrigir policies amplia a superfície.
3. **Duplicidade/eventos fora de ordem:** Realtime pode disparar antes da resposta RPC, duplicar refetch/toast e exibir estado velho; handlers devem ser idempotentes e reconciliar por versão/ID.
4. **DELETE e cache:** payload antigo limitado pela replica identity `d`; handlers que dependem de colunas do objeto excluído falham, e broad publication pode expor identificadores.
5. **Drift de schema e ciclo de vida:** três RPCs usadas não têm definição versionada; StrictMode/cleanup assíncrono pode deixar canais/intervals duplicados; migração de publication e novos RLS devem ser testados e incluídos no repositório.

### Ordem recomendada

1. Corrigir autorização de `buy_listing` e remover SELECT público de campos privados em `profiles`; decidir se `squads` é realmente público.
2. Versionar no repositório as definições remotas faltantes (`buy_listing`, `set_card_favorite`, `mark_cards_seen`) e confirmar grants.
3. Implementar refresh/resync por foco/reconnect para store pessoal, com controle para não sobrescrever progresso local não sincronizado.
4. Publicar `listings` apenas após revisar policy e escolher payload; testar compra/expiração com dois clientes.
5. Corrigir handling de DELETE de amizades, cleanup assíncrono/StrictMode, e alinhar docs do polling Pool.
6. Medir carga e confirmar plano/cotas do Supabase antes de adicionar mais tabelas/canais.

