# Diagnóstico de Disk I/O — Supabase `fut-senai-cards`

**Data da coleta:** 19/11/2026, aproximadamente 11:27 BRT  
**Projeto:** `fut-senai-cards` (`ejtgdnrmnnqjwowfhezc`)  
**Escopo:** inspeções da CLI e consultas SQL somente leitura ao banco remoto, mais inspeção do código local.  
**Banco durante a coleta inicial:** nenhuma migration, DDL, índice ou dado foi alterado. Depois da coleta, as migrations foram revisadas, corrigidas e aplicadas em produção; o estado final está documentado abaixo.

## Conclusão executiva

O cache do PostgreSQL está saudável: **99,999942% de cache hit** no contador do banco. Portanto, a evidência não aponta para falta de cache ou leitura repetida de páginas de tabela diretamente do disco.

O sinal mais forte de I/O evitável é outro: **páginas profundas da consulta paginada de `cards` derramam em arquivos temporários**, por ordenar por `created_at` sem índice compatível. As métricas acumuladas associam dezenas de GiB temporários à família dessas consultas. Em paralelo, o frontend fazia milhares de sincronizações que reescreviam missões, conquistas e preferências mesmo quando pouco mudava. Uma amostra posterior de `realtime.messages` identificou 113.122 broadcasts `user-updated` em 24 h; o trigger correspondente também dispara ao atualizar `profiles.last_seen`, tornando o heartbeat um contribuinte provável.

**Prioridade proposta:** primeiro corrigir e medir a paginação de cartas; depois reduzir as escritas repetidas de progresso; em paralelo investigar a origem dos broadcasts do Realtime. **Não recomendo começar por upgrade de compute ou remoção de índices.**

## Etapa 1 — Comandos da CLI

As inspeções iniciais foram registradas com `supabase 3.1.0`, autenticada e vinculada ao projeto de produção indicado. Na continuação, `supabase --version` retornou `2.122.0` e avisou que `3.1.0` está disponível; `db query --linked` e `db push --dry-run` confirmaram acesso ao projeto. Todos os comandos `inspect db` abaixo chegaram ao banco. `cache-hit`, `index-usage`, `unused-indexes` e `seq-scans` avisaram que são nomes depreciados; usei também `db-stats`, `index-stats` e `table-stats` como fontes atuais/equivalentes. Para contagem de Seq Scan, o resultado de `table-stats` e a consulta a `pg_stat_user_tables` são mais úteis que a saída do alias depreciado `seq-scans`.

| Comando solicitado | Resultado resumido |
|---|---|
| `supabase inspect db cache-hit --remote` | Migrou para `db-stats`: banco 175 MB, índices 12 MB, tabelas 42 MB, WAL atual 128 MB; index/table hit rate `1.00`. |
| `supabase inspect db index-usage --remote` | 83 índices no relatório. `cards_pkey` teve 312.782 scans e `idx_cards_user_name` 80.799; ambos usados. |
| `supabase inspect db unused-indexes --remote` | 16 índices marcados sem scans, somando aproximadamente 7,87 MB. O maior é `transactions_pkey` (7.816 kB); não se deve removê-lo por ser chave primária. |
| `supabase inspect db seq-scans --remote` | O alias avisou que está depreciado. Usei `table-stats` e `pg_stat_user_tables` para contar Seq Scans por tabela. |
| `supabase inspect db table-stats --remote` | `transactions`: 27 MB; `cards`: 24 MB. `challenges` registra muitos scans para uma tabela ainda pequena. |
| `supabase inspect db bloat --remote` | Maior desperdício estimado: `cards` 4.352 kB; `transactions` 1.992 kB; `profiles` 160 kB. |
| `supabase inspect db vacuum-stats --remote` | Autovacuum/autoanalyze recentes nas tabelas principais; `cards` tinha 1.352 dead tuples para cerca de 50.275 linhas. |
| `supabase inspect db long-running-queries --remote` | Uma sessão `START_REPLICATION` do slot de mensagens do Realtime com 17h56. É um consumidor lógico de longa duração, esperado para replicação ativa; não parece uma query de aplicação travada. |
| `supabase inspect db blocking --remote` | Nenhum bloqueio reportado. |
| `supabase inspect db role-stats --remote` | Limite mostrado de 60 conexões por role; 11 conexões ativas em `supabase_admin`, 4 em `authenticator`, 1 em `postgres`, 1 em `pgbouncer` e 1 da CLI. |
| `supabase inspect db calls --remote` | Topo dominado por `realtime.list_changes`, sincronizações de `profiles.preferences`, RPCs de economia e consultas de cartas. |
| `supabase inspect db outliers --remote` | Um outlier de catálogo/funções teve 302 chamadas e 2m46 acumulados; outro cálculo de contagem de cartas por usuário teve 2 chamadas e 1m54 acumulados. O relatório também inclui consultas internas de catálogo. |

O comando `supabase functions --help` não oferece subcomando de logs. `supabase functions list --project-ref ejtgdnrmnnqjwowfhezc` listou 7 Edge Functions ativas, mas não trouxe contagem de invocações. Para frequência de funções sem operação SQL, é necessário consultar os logs/analytics do Dashboard ou exportação de logs.

## Etapa 2 — Evidências e respostas

### 1. Cache hit está abaixo de 99%?

**Não. Está muito acima:** `pg_stat_database` retornou:

- `blks_hit`: 3.161.386.093
- `blks_read`: 1.823
- `cache_hit_pct`: **99,999942%**
- `stats_reset`: 02/10/2026

Consulta somente leitura usada:

```sql
select stats_reset, blks_read, blks_hit,
       round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 6) as cache_hit_pct,
       temp_bytes, blk_read_time, blk_write_time
from pg_stat_database
where datname = current_database();
```

`blk_read_time` e `blk_write_time` vieram como zero; portanto, esta coleta não oferece tempos confiáveis de espera de I/O. Os blocos e bytes temporários abaixo são evidência mais útil. Importante: cache hit alto **não** elimina I/O de arquivos temporários nem de escrita/WAL.

### 2. Queries com maior tempo total e maior leitura de blocos

O `pg_stat_statements` está no schema `extensions`. Seu contador foi reiniciado em **25/10/2026 17:17 UTC**. O nome da query foi abreviado para identificar a operação; valores são acumulados, não uma taxa instantânea.

Consulta usada para o ranking por tempo:

```sql
select queryid, calls, total_exec_time, mean_exec_time,
       shared_blks_read, shared_blks_hit, temp_blks_read, temp_blks_written, query
from extensions.pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
order by total_exec_time desc
limit 10;
```

**Top 10 por tempo total** (`total_exec_time` convertido para minutos):

| # | Query/fingerprint | Chamadas | Tempo total | Média | Blocos lidos / hit |
|---:|---|---:|---:|---:|---:|
| 1 | `realtime.list_changes` (WAL/Realtime) | 1.478.339 | 186,2 min | 7,56 ms | 0 / 2.491.546.488 |
| 2 | `cards` por `user_id`, ordenação `created_at DESC, id ASC`, paginada | 13.291 | 31,3 min | 141,4 ms | 12 / 29.530.400 |
| 3 | RPC `open_pack` | 27.154 | 19,5 min | 43,1 ms | 4 / 6.628.503 |
| 4 | RPC `admin_list_users` | 3.410 | 15,4 min | 270,5 ms | 46 / 222.520.809 |
| 5 | `realtime.authorize` | 42.558 | 15,1 min | 21,3 ms | 30 / 787.341 |
| 6 | RPC `finish_demo_coin_claim` | 109.895 | 10,8 min | 5,9 ms | 0 / 3.145.516 |
| 7 | RPC `spend_coins` | 42.915 | 8,1 min | 11,3 ms | 0 / 1.806.153 |
| 8 | `UPDATE profiles.preferences` | 61.795 | 7,2 min | 7,0 ms | 1 / 1.014.014 |
| 9 | RPC `refresh_collector_ranking` | 5.787 | 6,5 min | 67,3 ms | 11 / 9.495.750 |
| 10 | Segunda forma de paginação/ordenação de `cards` | 5.105 | 6,2 min | 73,1 ms | 0 / 7.674.529 |

**Top 10 por blocos físicos (`shared_blks_read`)**:

| # | Query/fingerprint resumido | Chamadas | Blocos lidos | Blocos em cache | Observação |
|---:|---|---:|---:|---:|---|
| 1 | Consulta de catálogo/tipos PostgreSQL | 188 | 263 | 386.341 | Maior leitura individual, ainda ~2,1 MB. |
| 2 | Outra consulta de catálogo/tipos | 188 | 75 | 231.859 | ~0,6 MB. |
| 3 | RPC `admin_list_users` | 3.410 | 46 | 222.520.809 | Muito acesso lógico em cache; pouca leitura física observada. |
| 4 | Verificação de schema Auth | 1 | 44 | 1.195 | DDL/catalog, uma chamada. |
| 5 | `realtime.authorize` | 42.558 | 30 | 787.341 | Baixo volume físico ante o número de hits. |
| 6 | Alteração de tabela Auth | 1 | 29 | 463 | DDL/catalog, uma chamada. |
| 7 | `DELETE auth.users` | 7 | 29 | 7.158 | Baixo volume de chamadas. |
| 8 | Criação/consulta inicial de `profiles` | 1 | 23 | 1.456 | DDL/catalog. |
| 9 | Consulta de catálogo de PK/FK | 188 | 16 | 50.822 | Consulta de metadados. |
| 10 | Trigger/evento de catálogo RLS | 1 | 13 | 131 | DDL/catalog, uma chamada. |

Esses rankings mostram que **as queries de aplicação não estão causando muitas leituras físicas de blocos compartilhados**. O destaque negativo está no I/O temporário da query de cartas:

| Fingerprint da consulta de cartas | Chamadas | Temp read | Temp written | Total de blocos temporários |
|---|---:|---:|---:|---:|
| Ordena por `created_at DESC, id ASC`, `LIMIT/OFFSET` | 13.291 | 1.499.781 | 1.762.866 | 3.262.647 (~24,9 GiB em blocos de 8 KiB) |
| Outra variante `created_at DESC, id ASC` | 1.770 | 146.987 | 175.272 | 322.259 |
| Variante `created_at DESC` | 7.344 | 127.574 | 145.989 | 273.563 |
| Outras duas variantes paginadas de cartas | 5.348 | 211.597 | 226.498 | 438.095 |

Somadas, as variantes de paginação de cartas no ranking representam aproximadamente **4,3 milhões de blocos temporários (~32,8 GiB de leitura+escrita temporária)** desde o reset de `pg_stat_statements`. O `pg_stat_database.temp_bytes` acumulado desde 02/10 foi **59.039.319.538 bytes (~59 GB decimais)**. Os períodos de reset são diferentes, então não se deve somar os dois números como se fossem a mesma janela.

**Confirmação adicional com `EXPLAIN (ANALYZE, BUFFERS)` somente leitura**, executado em produção em 19/11/2026, aproximadamente 11:49 BRT. Para não expor um identificador de usuário, a consulta escolheu internamente o usuário com mais cartas; a página final simulada foi `OFFSET 8000`:

```sql
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY ON)
SELECT *
FROM public.cards
WHERE user_id = (
  SELECT user_id
  FROM public.cards
  GROUP BY user_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
ORDER BY created_at DESC, id ASC
LIMIT 1000 OFFSET 8000;
```

Resultado resumido: o usuário selecionado tinha 9.347 cartas; o plano usou `Bitmap Index Scan` em `idx_cards_user_name`, seguido de `Bitmap Heap Scan` e `Sort`. O sort precisou ordenar 9.000 linhas para atender ao offset e executou `Sort Method: external merge  Disk: 3432kB`; `Buffers` registrou `temp read=427 written=431`, `shared hit=34282`, nenhuma leitura física compartilhada; tempo de execução 108,816 ms. Como controle, a primeira página (`OFFSET 0`) usou `top-N heapsort` em memória (938 kB) e não teve blocos temporários. Assim, o spill foi reproduzido na página profunda, não na primeira página. O teste confirma o problema de ordenação/paginação, embora não teste o plano após criar o índice proposto.

### 3. Há queries com frequência extrema?

Não há evidência de milhares de chamadas por minuto no agregado. Usando a janela do `pg_stat_statements` (cerca de 35,8 mil minutos):

- `realtime.list_changes`: ~41 chamadas/min em média global.
- `begin_demo_coin_claim` / `finish_demo_coin_claim`: ~3 chamadas/min cada.
- `profiles.preferences` update: ~1,7/min.
- Upserts de missões e conquistas: ~1,6/min cada.
- Query paginada principal de cartas: ~0,37/min.

Isso não exclui picos por usuário. O `realtime.list_changes` é infraestrutura do Supabase, não um loop explícito do frontend. Entre os mecanismos de polling visíveis no código estão:

- [useHomePendingCounts.ts](../src/hooks/useHomePendingCounts.ts): a cada 30 s, consulta quatro contagens em paralelo enquanto a Home está visível.
- [Layout.tsx](../src/components/Layout.tsx): a cada 30 s, consulta desafios e convites de sinuca pendentes.
- [Match.tsx](../src/pages/Match.tsx): fallback de desafio a cada 4 s durante estados ativos.
- [Pool.tsx](../src/pages/Pool.tsx): durante uma partida, polling de tiros a cada 1 s e reconsulta de partida/histórico a cada 3 s.

O polling de Pool termina no cleanup do efeito. O de Home/Layout tem intervalo limpo no unmount. Não encontrei um `useEffect` de aplicação que execute as queries acima em cada render sem dependências.

### 4. Seq Scan e índices

`table-stats`/`pg_stat_user_tables` mostraram:

| Tabela | Seq Scans | Linhas estimadas | Tamanho | Leitura |
|---|---:|---:|---:|---|
| `challenges` | 646.766 | 229 | 4,7 MB | Muitas consultas sobre poucos registros; filtros pendentes por `challenged_id,status` são candidatos a `EXPLAIN`. |
| `pool_matches` | 521.902 | 89 | 232 kB | Alto número de scans, tabela pequena. Há índices individuais para `player2_id` e `status`. |
| `squads` | 456.787 | 30 | 104 kB | Pequena; scans podem ser mais baratos que índices. |
| `saved_squads` | 454.238 | 37 | 176 kB | Pequena; avaliar plano antes de adicionar índice. |
| `pool_wager_escrow` | 321.124 | 48 | 80 kB | Pequena; já existem índices de `card_id` e match/user. |
| `card_templates` | 280.263 | 29 | 104 kB | Catálogo minúsculo, scan sequencial é esperado. |
| `listings` | 159.497 | 58 | 192 kB | Pequena; filtros de expiração/card já têm índices. |
| `cards` | 96.231 | ~51.677 | 24 MB | Mais relevante; query paginada também derrama para temporários. |

Essas contagens são acumuladas e não provam, isoladamente, falta de índice: o planejador prefere Seq Scan em tabelas pequenas. A tabela `cards` já tem `idx_cards_user_name(user_id,name)`, que não atende a ordenação por `created_at,id`.

### 5. Índices não usados

O relatório marcou 16 índices e ~7,87 MB como “unused”. O maior é `transactions_pkey` (7,8 MB); outros são principalmente índices/constraints de 8–40 kB. **Não recomendo remover nenhum nesta fase**: índices de PK/unique podem ser necessários para integridade e os demais representam pouca economia comparada ao I/O temporário das cartas.

### 6. Bloat, dead tuples e autovacuum

- `cards`: 1.352 dead tuples (~2,7% das linhas estimadas), autovacuum em 18/11; bloat estimado 4,3 MB.
- `missions`: 106 dead / 430 live; autovacuum em 18/11; autoanalyze recente.
- `transactions`: 0 dead na amostra; 186.866 linhas e 27 MB total.
- Partições `realtime.messages_2026_11_17` e `_18`: 578 e 4.604 dead tuples, respectivamente; houve autovacuum nessas partições.

O autovacuum está funcionando. Os níveis de bloat observados não explicam sozinhos o alerta. `cards` teve 247.867 deletes e 230.984 inserts nos contadores da tabela, indicando churn que vale acompanhar, mas a estimativa de desperdício é moderada.

### 7. Maiores relações

Consulta de catálogo usada: `pg_total_relation_size` sobre tabelas/partições fora de `pg_catalog` e `information_schema`.

| Relação | Tamanho total | Linhas vivas/estimadas | Evidência adicional |
|---|---:|---:|---|
| `realtime.messages_2026_11_17` | 42 MB | 120.287 | 126.043 inserts |
| `realtime.messages_2026_11_18` | 40 MB | 111.712 | 138.826 inserts, 4.604 dead |
| `public.transactions` | 27 MB | 186.866 | 187.891 inserts; sem deletes no contador observado |
| `public.cards` | 24 MB | 51.677 | 230.984 inserts e 247.867 deletes |
| `realtime.messages_2026_11_19` | 9,2 MB | 26.218 | 35.885 inserts até a coleta |
| `realtime.messages_2026_11_16` | 7,1 MB | 19.220 | 23.636 inserts |
| `public.challenges` | 4,7 MB | 229 | 1.532 updates |
| `public.pool_shots` | 2,9 MB | 434 | 434 inserts |
| `public.profiles` | 552 kB | 44 | 384.568 updates |
| `realtime.subscription` | 344 kB | 3 | 15.781 deletes |

As quatro partições diárias de mensagens listadas ocupam aproximadamente 98 MB. `pg_cron` não está instalado e `cron.job` não existe; a retenção dessas partições não foi confirmada nesta coleta.

### 8. Realtime e WAL

A publication `supabase_realtime` contém: `challenges`, `changelog_entries`, `friendships`, `marketplace_transactions`, `pool_matches`, `pool_shots`, `saved_squads` e `squads`.

No código há listeners de `challenges`, `friendships`, `pool_matches`, `pool_shots`, `changelog_entries`, `listings` e `marketplace_transactions`. **`listings` não está na publication**, então a assinatura atual da tela do Mercado não recebe Postgres Changes. Não encontrei listener de Postgres Changes para `squads` ou `saved_squads`, embora ambas estejam publicadas; são candidatas a remoção após confirmar que nenhum cliente externo depende delas.

O contador `realtime.list_changes` teve 1,48 milhão de chamadas, ~186 minutos acumulados, zero `shared_blks_read` e mais de 2,49 bilhões de `shared_blks_hit`. A replicação lógica ativa de longa duração é compatível com o serviço Realtime. As partições `realtime.messages` têm centenas de milhares de inserts; é um sinal de tráfego Realtime/broadcast, mas a coleta não agrupou eventos por tipo e **não prova que uma função específica do app seja a origem**.

**Amostra complementar de 24 h, agrupada sem ler payloads:** `broadcast/user-updated` teve **113.122 mensagens** e `broadcast/global-message`, 11; não apareceu `aim_update`. `user-updated` é enviado por `notify_admin_user_change`, trigger de `profiles` que também dispara em alterações de `last_seen`. Isso torna o heartbeat um contribuinte provável do volume, embora a amostra não permita atribuir cada mensagem a uma coluna específica. O throttle de mira do Pool é uma redução de tráfego preventivo, mas não explica o evento dominante observado.

Em [Pool.tsx](../src/pages/Pool.tsx), um timer roda a cada 50 ms, mas deduplica broadcasts de mira para no máximo aproximadamente uma emissão por segundo quando o canal está ativo. É um candidato a investigar, não uma causa confirmada dos inserts medidos.

### 9. Policies RLS

Há policies com subqueries:

- `cards`: verifica amizade aceita em `friendships`; existe índice único para o par requester/addressee.
- `pool_shots`: consulta `pool_matches` pela chave primária da partida.

Essas dependências têm suporte de índices. Várias policies usam `auth.uid()` diretamente, em vez de `(select auth.uid())`; isso pode aumentar custo por linha em consultas grandes, mas os dados atuais não indicam que seja a principal origem dos temporários.

### 10. `SELECT *`, limites e paginação

- Na versão observada durante a coleta, [cards.ts](../src/lib/services/cards.ts) fazia `select('*')` por usuário, ordenava por `created_at DESC, id ASC` e paginava com `range` dentro de um `while`. O código usa agora keyset pagination e projeção explícita; o índice compatível foi aplicado e validado no banco.
- Na versão observada durante a coleta, [Match.tsx](../src/pages/Match.tsx) carregava o inventário completo do adversário. O código commitado agora busca apenas os IDs do elenco titular e os campos necessários.
- [FriendProfile.tsx](../src/pages/FriendProfile.tsx) carrega `profiles.*` para uma única linha; deve selecionar só os campos mostrados.
- [marketplace.ts](../src/lib/services/marketplace.ts) lista todas as listagens ativas sem paginação. O volume atual é baixo (58 linhas na amostra), portanto é prevenção de crescimento, não o principal culpado atual.

### 11. Triggers e escritas em cascata

O maior sinal de escritas repetidas está no progresso do jogo:

- `missions`: 590.692 updates para ~430 linhas.
- `achievements`: 354.132 updates para ~258 linhas.
- `profiles`: 384.568 updates para 44 linhas; esse total também inclui o heartbeat `last_seen`, não apenas preferências.
- O `pg_stat_statements` registrou 59.065 chamadas de upsert de missões, 59.065 de conquistas e 61.795 updates de `profiles.preferences`.

Na versão observada durante a coleta, [useGame.ts](../src/store/useGame.ts) sincronizava preferências e fazia upsert do conjunto completo de conquistas e missões durante `updateMissionProgress()` e no `init()`. A versão atual compara snapshots, envia somente as linhas alteradas em uma RPC com debounce de 3 s e não grava defaults durante a inicialização. A RPC foi aplicada; ainda não há métrica pós-deploy porque o frontend não foi implantado.

### 12. Cron e Edge Functions

`pg_cron` não aparece em `pg_extension`; `to_regclass('cron.job')` retornou `NULL`. A CLI listou 7 Edge Functions ativas, mas não disponibiliza logs/contagem de invocações no subcomando `functions`. As métricas SQL mostram alta frequência de RPCs do jogo; não permitem contar chamadas de funções que só acessam serviços externos.

### 13–14. Roles, conexões e pooler

No instante da consulta, `pg_stat_activity` tinha 2 conexões `active`, 16 `idle` e 7 sem `state` (workers/background). Não parece excesso contra o limite reportado de 60 por role.

O frontend usa Supabase JS/PostgREST, não uma string PostgreSQL direta; não há indicação de porta `6543` no runtime do app. O teste PostgreSQL usa `DATABASE_URL`, mas não é tráfego de produção. A CLI conectada ao banco não permite inferir qual porta o pooler do projeto usa internamente.

### 15. Escritas pequenas que podem ser agregadas

Sim: o candidato mais claro era a sincronização completa de progresso em cada chamada de `updateMissionProgress()`. O código agora persiste somente mudanças, e a RPC está aplicada. O heartbeat de [App.tsx](../src/App.tsx) foi alterado de 1 para 5 minutos e só grava com a aba visível; o indicador baseado em `last_seen` agora usa janela de 10 minutos.

## Principais culpados e status das correções

As correções dos nove itens de otimização foram implementadas no código e as migrations correspondentes foram aplicadas; as métricas posteriores ao deploy do frontend ainda estão pendentes. A proposta de retenção de `transactions` abaixo continua dependendo de decisão de produto.

### P0 — Sort/paginação de `cards` com spill para temporários

**Impacto estimado:** muito alto e confirmado pelos contadores acumulados e pelo `EXPLAIN ANALYZE` de `OFFSET 8000`. O índice existente é `(user_id,name)`, mas a consulta filtra por `user_id` e ordena por `created_at DESC,id ASC`. A primeira página isolada não derramou; páginas profundas sim.

**SQL aplicada em produção:**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_user_created_id
ON public.cards (user_id, created_at DESC, id ASC);
```

O índice foi aplicado com `CREATE INDEX CONCURRENTLY` e `indisvalid=true`. A paginação por cursor já está no código. Um `EXPLAIN (ANALYZE, BUFFERS)` da página profunda keyset usou `idx_cards_user_created_id` em dois Bitmap Index Scans, retornou 1.000 linhas em 14,700 ms, com 481 shared hits e sem blocos temporários. O plano ainda fez quicksort em memória (745 kB); portanto, a evidência confirma a eliminação do spill, não a eliminação total do sort.

### P1 — Upserts integrais repetidos de missão/conquista/preferências

**Impacto estimado:** alto para WAL e escrita de heap/índices. A evidência são ~59 mil upserts em cada tabela e ~62 mil updates de preferências, além dos contadores de centenas de milhares de row updates.

**Correção aplicada:** o frontend envia apenas IDs de missões alteradas; a RPC deriva progresso e conclusão de `profiles`, `cards` e do elenco persistido, usa recompensas canônicas do servidor e mantém debounce de 3 s com flush ao ocultar/fechar a página. `claim_mission` valida novamente a condição antes de creditar e não confia em recompensas da linha. A tabela `missions` agora aceita leitura própria, mas não escrita direta pelo cliente. O código do frontend ainda precisa ser implantado.

### P1 — Escritas de `realtime.messages` e tráfego de broadcast

**Impacto estimado:** médio. A amostra de `realtime.messages` encontrou 113.122 broadcasts `user-updated` em 24 h, com trigger de `profiles` que inclui `last_seen`; ainda não é possível determinar qual proporção veio do heartbeat. A mira do Pool não apareceu nessa amostra.

**Correção preparada no frontend:** heartbeat menos frequente e somente com aba visível; Pool mantém polling apenas como fallback do canal Realtime e limita alterações de mira a 10/s, com heartbeat a cada segundo. O frontend ainda não foi implantado; confirmar a redução de `user-updated` e queries de Pool com novos snapshots após o deploy.

**Redução aplicada à publication**, após confirmar que não havia listeners Postgres Changes correspondentes no repositório:

```sql
ALTER PUBLICATION supabase_realtime DROP TABLE public.squads;
ALTER PUBLICATION supabase_realtime DROP TABLE public.saved_squads;
```

As duas tabelas foram removidas da publication; a consulta posterior confirmou zero membros restantes com esses nomes. Consultas REST continuam funcionando. Consumidores externos futuros não podem ser descartados por inspeção local. Não remover `challenges`, `friendships`, `pool_matches`, `pool_shots`, `marketplace_transactions` ou `changelog_entries` sem validar seus fluxos.

### P2 — Crescimento e churn de `transactions`/`cards`

`transactions` tem ~187 mil linhas e 27 MB; `cards` tem ~51,7 mil linhas, 24 MB, e churn elevado de inserts/deletes. O volume ainda é pequeno para justificar upgrade, mas cresce continuamente.

**Correção proposta:** definir retenção/arquivamento para o histórico de transações somente após decisão de produto e backup; revisar se os eventos locais duplicam o ledger oficial. Não apagar registros nem remover `transactions_pkey` sem aprovação e análise de dependências.

### Candidato de CPU, não de leitura física — `admin_list_users`

O RPC apareceu com 3.410 chamadas, média de 270 ms e 222 milhões de hits em cache, mas só 46 blocos físicos lidos. A função em [admin_user_directory.sql](../supabase/migrations/20261116130000_admin_user_directory.sql) conta cartas por perfil com subquery correlacionada. Se o painel Admin for usado com frequência, testar uma agregação única por `cards.user_id` e join; não é prioridade para o Disk I/O Budget enquanto as leituras físicas permanecerem baixas.

## Respostas de custo e recomendação de compute

Há ações prováveis **sem upgrade**: corrigir o índice/ordenação da paginação, migrar para keyset pagination, eliminar upserts sem mudança, reduzir broadcasts desnecessários e criar política de retenção deliberada. Hoje o banco tem ~175 MB, cache hit praticamente perfeito, sem bloqueios e sem sinal de conexões no limite. O custo de índices não usados é pequeno, e o bloat observado é moderado.

**Não há evidência suficiente para recomendar upgrade de compute antes dessas correções.** Também não é possível garantir que o alerta suma apenas com otimizações: o Dashboard não foi consultado para ver o percentual/limite do Disk I/O Budget e `track_io_timing` não forneceu tempos. Se o orçamento continuar esgotando depois de corrigir os temporários e reduzir writes, ou se o consumo ficar acima da capacidade durante tráfego normal, aí faz sentido comparar o tier de compute e o perfil de uso.

## Como monitorar depois

1. Os snapshots pré-mudança registrados abaixo foram coletados desde `pg_stat_statements_info.stats_reset = 2026-10-25 17:17:15 UTC`. Após o deploy do frontend, comparar deltas na mesma janela de 1 h/24 h e com tráfego semelhante; não comparar contadores acumulados sem considerar `stats_reset`.
3. Confirmar no plano que a paginação usa o índice novo e não cria sort com spill; observar `temp_blks_read/written` do fingerprint de cartas.
4. Acompanhar `missions`, `achievements`, `profiles` e WAL: reduzir updates por ação sem perder recompensas nem estado.
5. No Dashboard Supabase, acompanhar Disk I/O Budget, CPU, memória, WAL e Realtime messages por pelo menos 24–48 h após a alteração.
6. Medir broadcasts por evento/canal antes de remover publicação ou limitar frequência.

## Estado das nove otimizações

As migrations das otimizações foram aplicadas em produção por lotes, respeitando a ordem de implantação; o dry-run imediatamente após esse lote informou que o banco estava atualizado. Depois do `fetch` de novos commits em `origin/main`, foram encontrados seis migrations locais anteriores a 19/11 sem registro remoto. O dry-run atual falha com `DbPushMissingRemoteError`; consultas somente leitura confirmaram que os objetos correspondentes já existem no banco (índices, RPCs, trigger e changelog). Não reapliquei esses migrations nem alterei o histórico com `migration repair`. Reconcilie o histórico antes do próximo `db push`. **O frontend ainda não foi implantado.** Como `missions` agora bloqueia escrita direta, publique o frontend atualizado para evitar falhas no cliente antigo.

| Item | Commit(s) | Alteração e evidência posterior |
|---:|---|---|
| 1 | `e148759` | `20261119115300_cards_user_created_id_index.sql` aplicada. `indisvalid=true`, `indisready=true`. Antes, `OFFSET 8000`: external merge, 3.432 kB em disco, `temp read=427/written=431`, 108,816 ms. Depois, página keyset profunda: Bitmap Index Scans no novo índice, 1.000 linhas, 14,700 ms, 481 shared hits, sem temporários; quicksort em memória de 745 kB. |
| 2 | `e77f88c` | Keyset pagination e projeção explícita; o plano pós-índice usa o novo índice. O sort continua em memória, sem spill. |
| 3 | `de66d16` | Match carrega apenas IDs/campos das cartas titulares. Plano representativo anterior usou `cards_pkey`; não é benchmark controlado contra a consulta antiga. |
| 4 | `7ebda97`, `bfe3c01` | Diff de progresso, RPC única/debounce 3 s, sem defaults no `init()`, flush em `visibilitychange` e `pagehide`. RPC usa definições/recompensas canônicas e deriva progresso do banco. `claim_mission` valida elegibilidade no servidor. Escrita direta em `missions` foi revogada. |
| 5 | `0d5b6ae` | Heartbeat de 5 min e somente aba visível; fingerprint prévio: 14.697 calls, 240.543,5 ms, 608.006 hits, zero reads físicos. Sem snapshot pós-deploy. |
| 6 | `a4f3b03` | Polling de Home/Layout/Match pausa em aba oculta e Home usa RPC. Baseline: 123.676 consultas de desafios, 96.687 de pool, 3.201 de pedidos e 729 de listagens vendidas. Plano representativo: 17,269 ms, 62 shared hits, zero reads. |
| 7 | `b9dfed3` | Pool usa polling como fallback do Realtime e limita mira a 10/s. Baseline de `pool_shots`: fingerprints com 20.016 e 6.470 calls, zero reads físicos. Sem snapshot pós-deploy. |
| 8 | `bdd869d` | `20261119130000_remove_squads_realtime.sql` aplicada; consulta posterior confirmou zero membros `squads`/`saved_squads` na publication. |
| 9 | `a90273f` | `20261119133000_rls_auth_uid_initplans.sql` aplicada. Antes: 43 policies públicas, 35 contendo `auth.uid()` e nenhuma já embrulhada. Depois: as mesmas 43 policies e o mesmo hash estrutural (`6fb9ecf034cc44d4b6754848434ef9ce`), 35 com initplan e zero chamadas diretas. A alteração intencional da policy/grants de `missions` ocorreu separadamente no item 4. |

### Correção adicional descoberta na validação de RLS

O teste inicial revelou que `public.missions` tinha RLS desativado, apesar da policy existir: um usuário autenticado conseguia contar 430 linhas. A migration adicional `20261119140000_enable_missions_rls.sql` (commit `be7969c`) habilitou RLS. Repetidos os testes com dois usuários existentes: cada um viu suas 10 linhas e zero linhas do outro. Após a correção, `authenticated` mantém `SELECT`, mas `INSERT`, `UPDATE`, `DELETE` e `TRUNCATE` estão revogados. `sync_game_progress` e `claim_mission` são `SECURITY DEFINER`, têm `search_path` vazio e só são executáveis por `authenticated`; `get_home_pending_counts` é `SECURITY INVOKER`.

Validação final de código: `npm test -- --runInBand` passou com 41 suítes/191 testes; `npm run build` passou. O build mantém o aviso de chunk acima de 500 kB; o lint focado manteve um aviso preexistente `react(set-state-in-effect)` em `App.tsx`. `supabase db lint --local` continua indisponível sem PostgreSQL/Docker local. As métricas de Disk I/O após o deploy do frontend ainda precisam ser coletadas por 24–48 h; não há alegação de redução confirmada dos contadores de produção além do plano keyset medido.

**Limite da comparação:** os planos e snapshots posteriores são validações locais ou de consultas equivalentes, não medições da aplicação após deploy. Para comparar efeito real no Disk I/O Budget, primeiro revisar os diffs e aprovar explicitamente as migrations; depois medir os mesmos fingerprints e janelas por 24–48 h.

**Limite adicional da coleta:** os contadores são cumulativos e não substituem séries temporais do Dashboard, logs de invocações das Edge Functions, nem `EXPLAIN ANALYZE` em staging.
