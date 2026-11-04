# AUDITORIA DE SEGURANÇA — FUTSENAI CARDS

## 1. Resumo geral

O FutSENAI Cards possui backend real (Supabase/Postgres) com autenticação, RLS e operações atômicas no marketplace. No entanto, **a grande maioria das regras de negócio (moedas, XP, cartas, missões, SBC, partidas) é executada no cliente e sincronizada com o banco via RLS permissiva**, permitindo que um usuário manipule seus próprios dados diretamente via API.

**Classificação geral:** Risco alto para economia virtual e integridade de dados.

---

## 2. Vulnerabilidades encontradas

### CRÍTICAS

**V1 — Cliente controla saldo (coins)**
- **Arquivo:** `src/store/useGame.ts` (`addCoins`, `spendCoins`)
- **Descrição:** O frontend atualiza `profiles.coins` diretamente via Supabase. A policy RLS `own profile` permite `UPDATE` em todas as colunas, incluindo `coins`.
- **Exploração:** Chamada direta à API do Supabase: `PATCH /rest/v1/profiles?id=eq.<uid>` com `{ coins: 999999 }`.
- **Impacto:** Dinheiro infinito.
- **Correção:** Tornar `coins` read-only para o usuário (RLS: `UPDATE` apenas em colunas permitidas via `WITH CHECK` restritivo ou Edge Function exclusiva). Toda alteração de saldo deve passar por RPC/Edge Function.

**V2 — Cliente controla XP e nível**
- **Arquivo:** `src/store/useGame.ts` (`addXp`)
- **Descrição:** `profiles.xp` e `profiles.level` são atualizados diretamente pelo cliente.
- **Exploração:** `PATCH /rest/v1/profiles?id=eq.<uid>` com `{ xp: 999999, level: 99 }`.
- **Impacto:** Nível máximo instantâneo.
- **Correção:** Mesmo padrão da V1 — XP/level apenas via servidor.

**V3 — Cliente cria/altera/exclui cartas**
- **Arquivo:** `src/store/useGame.ts` (`openPack`, `addCard`), `src/lib/services/cards.ts`
- **Descrição:** A policy `own cards` permite `INSERT`/`UPDATE`/`DELETE` em `cards` pelo próprio usuário. O frontend gera cartas localmente e faz `INSERT`.
- **Exploração:** `POST /rest/v1/cards` com `{ user_id: <uid>, name: 'Pietro', rarity: 'icon', overall: 99, ... }`.
- **Impacto:** Cartas lendárias/ícones infinitas.
- **Correção:** Mover geração de pacotes para Edge Function/RPC. Remover permissão de INSERT/UPDATE/DELETE em `cards` para o usuário; apenas `SELECT`.

**V4 — Cliente manipula missões e conquistas**
- **Arquivo:** `src/store/useGame.ts` (`updateMissionProgress`, `claimMission`), `src/lib/services/missions.ts`, `src/lib/services/achievements.ts`
- **Descrição:** Policies `own missions` e `own achievements` permitem UPDATE. O cliente pode setar `completed: true, claimed: true`.
- **Exploração:** `PATCH /rest/v1/missions?user_id=eq.<uid>&mission_id=eq.m1` com `{ completed: true, claimed: true }`.
- **Impacto:** Recompensas infinitas.
- **Correção:** Tornar `missions`/`achievements` read-only para o usuário; progresso via Edge Function/RPC com validação server-side.

**V5 — Cliente manipula transações**
- **Arquivo:** `src/store/useGame.ts` (`addCoins`, `spendCoins`), `src/lib/services/transactions.ts`
- **Descrição:** `own transactions` permite INSERT. O cliente pode inserir transações de ganho.
- **Exploração:** `POST /rest/v1/transactions` com `{ user_id: <uid>, amount: 999999, type: 'earn', reason: 'hack' }`.
- **Impacto:** Falsificação de histórico financeiro.
- **Correção:** INSERT apenas via service_role (Edge Function). Usuário: SELECT only.

**V6 — Cliente manipula leaderboard**
- **Arquivo:** `src/lib/services/leaderboard.ts` (`updateCollectorRanking`)
- **Descrição:** `own leaderboard` permite ALL. Usuário pode setar `points`, `wins`, `cards_count`, etc.
- **Exploração:** `PATCH /rest/v1/leaderboard?user_id=eq.<uid>` com `{ points: 999999, wins: 999 }`.
- **Impacto:** Manipulação de ranking.
- **Correção:** Leaderboard apenas atualizado por Edge Function/server.

**V7 — Cliente manipula SBC completions**
- **Arquivo:** `src/store/useGame.ts` (`completeSBC`), `src/lib/services/sbc.ts`
- **Descrição:** `own sbc_completions` permite ALL. Usuário pode inserir conclusões falsas.
- **Impacto:** Recompensas de SBC sem completar.
- **Correção:** SBC completion apenas via Edge Function.

**V8 — Cliente manipula match history**
- **Arquivo:** `src/store/useGame.ts` (`addMatchHistory`), `src/lib/services/matches.ts`
- **Descrição:** `own matches` permite ALL. Usuário pode inserir partidas falsas.
- **Impacto:** Falsificação de estatísticas.
- **Correção:** Match history apenas via Edge Function/server.

**V9 — Marketplace: listagem sem verificação de propriedade**
- **Arquivo:** `src/store/useGame.ts` (`listCard`), `src/lib/services/marketplace.ts` (`createListing`)
- **Descrição:** `createListing` insere listing com `card_id` sem verificar se o vendedor possui a carta.
- **Exploração:** Listar uma carta que não possui.
- **Impacto:** Venda de cartas inexistentes.
- **Correção:** Edge Function deve verificar ownership antes de criar listing.

**V10 — Marketplace: cancelamento sem verificação de vendedor**
- **Arquivo:** `src/lib/services/marketplace.ts` (`cancelListing`)
- **Descrição:** `cancelListing` usa `.eq('id', id)` sem verificar seller_id. RLS `own listings` protege, mas se RLS for bypassado, permite cancelar de outros.
- **Impacto:** Cancelamento de anúncios de outros usuários.
- **Correção:** Adicionar `.eq('seller_id', userId)` no serviço.

**V11 — Concorrência em compras (TOCTOU)**
- **Arquivo:** `src/store/useGame.ts` (`buyListing`)
- **Descrição:** O frontend verifica `listing.status !== 'active'` e `coins < cost` antes de chamar a Edge Function. Se dois compradores clicarem simultaneamente, ambos passam na validação local.
- **Mitigação:** A RPC `buy_listing` usa `FOR UPDATE` e `status = 'active'` condicional, o que impede compra duplicada no banco. Mas o frontend ainda atualiza o estado local antes da resposta.
- **Impacto:** UI pode mostrar compra bem-sucedida para ambos, mas apenas uma é persistida.
- **Correção:** O frontend já aguarda a resposta da Edge Function antes de atualizar (implementado). O RPC é atômico. OK, mas garantir que o frontend não aplique mudanças antes da confirmação (já feito).

**V12 — Duplicação de recompensas (missões)**
- **Arquivo:** `src/store/useGame.ts` (`claimMission`)
- **Descrição:** `claimMission` verifica `m.claimed` localmente. Se o usuário chamar duas vezes rapidamente, pode passar na validação antes do sync.
- **Impacto:** Recompensa duplicada.
- **Correção:** Idempotency key ou constraint UNIQUE em `(user_id, mission_id, claimed)` + validação server-side.

**V13 — Duplicação de recompensa diária**
- **Arquivo:** `src/store/useGame.ts` (`claimDaily`)
- **Descrição:** `lastDailyClaim` é local; pode ser manipulado.
- **Impacto:** Recompensa diária infinita.
- **Correção:** Validar no servidor com timestamp do banco.

**V14 — Evolução de cartas sem validação**
- **Arquivo:** `src/store/useGame.ts` (`upgradePlayer`, `addPlayerXp`)
- **Descrição:** Atributos e XP são atualizados localmente e sincronizados. Usuário pode setar XP/atributos arbitrários.
- **Impacto:** Cartas com stats 99.
- **Correção:** Validação server-side de pontos de evolução.

**V15 — Exposição de segredos**
- **Arquivo:** `.env.example` (placeholders), `src/lib/supabase.ts`
- **Descrição:** Apenas publishable key no frontend. Service_role apenas em Edge Functions. ✅ OK.
- **Risco:** Nenhum segredo real exposto no código.

**V16 — CORS nas Edge Functions**
- **Arquivo:** `supabase/functions/delete-account/index.ts`, `supabase/functions/buy-listing/index.ts`
- **Descrição:** `Access-Control-Allow-Origin: '*'`. Permite qualquer origem.
- **Impacto:** CSRF potencial (mitigado por JWT, mas não ideal).
- **Correção:** Restringir ao domínio do Vercel.

**V17 — Rate limiting**
- **Descrição:** Sem rate limiting configurado nas Edge Functions ou no Supabase Auth.
- **Impacto:** Brute force, abuso.
- **Correção:** Configurar rate limits no Supabase (Auth → Rate Limits).

**V18 — Logs de eventos**
- **Descrição:** Sem auditoria de operações sensíveis (compras, vendas, exclusão de conta).
- **Impacto:** Impossível rastrear abuso.
- **Correção:** Criar tabela `audit_log` e registrar operações.

**V19 — Testes de segurança**
- **Descrição:** 9 testes unitários/componente. Sem testes de integração ou E2E.
- **Impacto:** Regressões de segurança não detectadas.
- **Correção:** Adicionar testes de RLS, concorrência e idempotência.

**V20 — `sbc_completions` policy para `public`**
- **Arquivo:** SQL migration
- **Descrição:** Policy `own sbc_completions` aplicada ao role `public` (anon), não `authenticated`.
- **Impacto:** Usuários anônimos podem inserir conclusões de SBC.
- **Correção:** Recriar policy com `to authenticated`.

---

## 3. Áreas auditadas

- ✅ Autenticação (Supabase Auth, JWT, OAuth)
- ✅ RLS e policies (todas as tabelas)
- ✅ Edge Functions (delete-account, buy-listing)
- ✅ RPC (buy_listing)
- ✅ Frontend (stores, services, páginas)
- ✅ Marketplace (listings, compras, vendas)
- ✅ Economia (coins, XP, cartas, missões, SBC)
- ✅ Persistência (Zustand + Supabase)
- ✅ Deploy (Vercel, Supabase)

## 4. Áreas não verificadas

- ❌ Testes de concorrência real (não executados)
- ❌ Auditoria de logs de produção
- ❌ Verificação de segredos em histórico Git
- ❌ Análise de dependências vulneráveis (npm audit)
- ❌ Teste de carga/performance

## 5. Priorização

**P0 — Crítico (corrigir imediatamente):**
- V1 (coins), V2 (XP/level), V3 (cards), V4 (missions/achievements), V5 (transactions), V6 (leaderboard), V7 (SBC), V8 (match history)

**P1 — Alto:**
- V9 (listagem sem ownership), V10 (cancelamento), V11 (concorrência), V12 (missões duplicadas), V13 (recompensa diária), V14 (evolução), V20 (sbc_completions policy)

**P2 — Médio:**
- V15 (segredos — OK), V16 (CORS), V17 (rate limiting), V18 (logs), V19 (testes)

---

## 6. Recomendação

Mover toda a lógica de negócio (moedas, XP, cartas, missões, SBC, partidas) para Edge Functions/RPCs com validação server-side. Restringir RLS de tabelas sensíveis a `SELECT` only para usuários (updates via service_role). Implementar idempotency keys para operações financeiras. Adicionar testes de integração para RLS e concorrência.

**Não modifique o código agora — esta é uma auditoria.** Quando autorizar, comece pelos itens P0.
