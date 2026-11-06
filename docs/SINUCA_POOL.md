# Sinuca / Pool — FutSENAI Cards

Documentação técnica do sistema de sinuca (8-ball) do FutSENAI Cards. Descreve fluxo de desafio, banco de dados, edge function, engine de física, RLS, realtime e como aplicar correções no ambiente de produção.

---

## 1. Visão geral

O sistema de sinuca permite que dois jogadores **amigos** (amizade aceita no banco) criem uma partida de 8-ball, aceitem o convite e joguem turnos alternados. A física é simulada localmente no cliente para feedback imediato e validada de forma autoritativa por uma Edge Function do Supabase que roda a mesma física no servidor.

**Fluxo:**
1. Jogador A clica em "Jogar sinuca" no perfil do amigo (`FriendProfile.tsx`).
2. Cria partida `pending` via RPC `create_pool_match`.
3. Jogador B recebe notificação no sidebar (realtime) e aceita via `accept_pool_match` → status vira `playing`.
4. O jogador da vez define ângulo e força no canvas (`Pool.tsx`) e dispara o tiro.
5. O cliente simula localmente e envia para a Edge Function `pool-shot`.
6. A Edge Function valida turno, deadline, executa física, grava o tiro em `pool_shots`, atualiza `pool_matches` e retorna o estado final.
7. O realtime sincroniza `table_state`, `current_player`, `status` e `winner_id` para ambos os clientes.
8. Quando alguém encaçapa a 8 corretamente (ou com falta com bolas próprias restantes), a partida vira `finished` com `winner_id` preenchido.

---

## 2. Ficha técnica

| Camada | Tecnologia / arquivo | Responsabilidade |
|--------|---------------------|------------------|
| **Frontend** | React 19 + Vite + TypeScript | UI, roteamento, estado local |
| **Página da partida** | `src/pages/Pool.tsx` | Canvas, ângulo/força, tiro local, realtime |
| **Perfil do amigo** | `src/pages/FriendProfile.tsx` | Botão "Jogar sinuca", cria partida, escuta aceite/recusa |
| **Layout / notificações** | `src/components/Layout.tsx` | Sidebar com notificações de sinuca pendente, botão Aceitar/Recusar |
| **Store global** | `src/store/useGame.ts` | Zustand com persistência local |
| **Serviços pool** | `src/lib/services/pool.ts` | Wrappers dos RPCs (`createPoolMatch`, `acceptPoolMatch`, `rejectPoolMatch`, `abandonPoolMatch`, `getPoolMatch`, `submitShot`) |
| **Edge Function** | `supabase/functions/pool-shot/index.ts` | Física autoritativa, validação de turno/deadline, gravação de shots, atualização da partida |
| **Engine física** | `src/engine/pool/physics.ts` | Simulação de bilhar (atrito, colisão bola-bola, colisão parede, pocket) |
| **Regras** | `src/engine/pool/rules.ts` | Detecção de falta, próximo jogador, vencedor |
| **Tipos** | `src/engine/pool/types.ts` | `Ball`, `TableState`, `ShotInput`, `ShotResult`, constantes da mesa |
| **Banco** | Supabase PostgreSQL 17 | Tabelas `pool_matches`, `pool_shots`, RPCs, RLS, realtime |
| **Realtime** | Supabase Realtime | Canais `pool-match-${matchId}` e `pool-invite-${matchId}` |
| **Deploy** | Vercel | Build automático via Git push |

---

## 3. Banco de dados

### Tabelas

**`pool_matches`**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | `uuid` | PK |
| `player1_id` | `uuid` | FK → `profiles(id)` |
| `player2_id` | `uuid` | FK → `profiles(id)` |
| `stake` | `int` | Aposta (moedas), default 0 |
| `status` | `text` | `pending`, `accepted`, `playing`, `finished`, `declined`, `expired`, `forfeited`, `cancelled` |
| `seed` | `int` | Seed aleatória |
| `table_state` | `jsonb` | Estado da mesa (bolas, atribuições, turno, etc.) |
| `current_player` | `int` | 1 ou 2 |
| `turn_deadline` | `timestamptz` | Prazo do turno (30s) |
| `assignments` | `jsonb` | `{"player1": null\|"solid"\|"stripe", "player2": ...}` |
| `winner_id` | `uuid` | FK → `profiles(id)` |
| `payout` | `int` | Pagamento |
| `version` | `int` | Controle de versão da partida |
| `created_at`, `updated_at` | `timestamptz` | Timestamps |

**`pool_shots`**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | `uuid` | PK |
| `match_id` | `uuid` | FK → `pool_matches(id)` |
| `player_id` | `uuid` | FK → `profiles(id)` |
| `seq` | `int` | Sequência do tiro na partida |
| `angle` | `float` | Ângulo em radianos |
| `power` | `float` | Força (0 a 1) |
| `result` | `jsonb` | `{pocketed, foul, nextPlayer, winner}` |
| `shot_id` | `uuid` | Unique (idempotência) |
| `created_at` | `timestamptz` | Timestamp |

### Migrações relevantes

- `supabase/migrations/20261105020000_pool_tables.sql` — Cria tabelas, RLS, índices, realtime.
- `supabase/migrations/20261105030000_pool_match_rpcs.sql` — `create_pool_match`, `abandon_pool_match`.
- `supabase/migrations/20261105040000_pool_challenge_flow.sql` — `accept_pool_match`, `reject_pool_match`.
- `supabase/migrations/20261106000000_pool_integrity.sql` — Coluna `version`, `shot_id` unique, status `cancelled`.

### RPCs (security definer)

| RPC | Params | Retorno | Descrição |
|-----|--------|---------|-----------|
| `create_pool_match` | `p_opponent uuid, p_stake int` | `uuid` | Cria partida `pending`. Exige amizade aceita. Rejeita se já houver partida ativa entre os jogadores. |
| `accept_pool_match` | `p_id uuid` | `boolean` | Apenas `player2`. `pending` → `playing`. Define `turn_deadline` = agora + 30s. |
| `reject_pool_match` | `p_id uuid` | `boolean` | Apenas `player2`. `pending` → `declined`. |
| `abandon_pool_match` | `p_id uuid` | `boolean` | Qualquer participante. `pending/accepted/playing` → `cancelled`. |

### RLS (Row Level Security)

Ambas as tabelas têm RLS habilitado:

- **SELECT**: apenas autenticados que são `player1_id` ou `player2_id` da partida.
- **INSERT/UPDATE/DELETE**: revogados para `authenticated`. Todas as escritas vão via RPCs (security definer) ou Edge Function (service_role).

### Realtime

Tabelas `pool_matches` e `pool_shots` adicionadas à publicação `supabase_realtime`.

---

## 4. Edge Function `pool-shot`

Arquivo: `supabase/functions/pool-shot/index.ts`

Executa com `service_role` (bypassa RLS). Validações:

1. Sessão válida (JWT).
2. `matchId` é UUID válido.
3. `angle` é número finito.
4. `power` é número entre 0 e 1.
5. `ballInHandPos` (opcional) dentro dos limites da mesa.
6. Usuário é participante da partida (`player1_id` ou `player2_id`).
7. Status da partida é `accepted` ou `playing`.
8. É a vez do usuário (`current_player` corresponde ao `player_id`).
9. `turn_deadline` não expirou (30s). Se expirar, o oponente vence por forfeição.

Execução:
- Carrega ou cria o estado inicial da mesa.
- Se a bola branca estiver pocketed e `ballInHandPos` for fornecido, reposiciona a branca.
- Aplica o tiro (ângulo × força × 8 de velocidade).
- Executa a física determinística até todas as bolas pararem (máx. 2400 passos).
- Determina falta, próximo jogador, vencedor e atribuição de lisas/listradas.
- Grava o tiro em `pool_shots` (com `shot_id` para idempotência).
- Atualiza `pool_matches` (`table_state`, `current_player`, `version`, `winner_id`, `status='finished'` se houver vencedor).
- Retorna `{ frames, finalState, pocketed, foul, nextPlayer, winner }`.

---

## 5. Engine de física

### `src/engine/pool/types.ts`

Constantes:
- `TABLE_WIDTH = 2.0`, `TABLE_HEIGHT = 1.0`
- `BALL_RADIUS = 0.025`, `POCKET_RADIUS = 0.045`
- `FRICTION = 0.985`, `RESTITUTION = 0.8`
- `FIXED_DT = 1 / 240`
- `MAX_SIM_STEPS = 2400` (10s max)

### `src/engine/pool/physics.ts`

- `createInitialBalls()` — Cria bola branca + triângulo com 7 sólidas, 7 listradas, 1 eight-ball (id 15).
- `createInitialState()` — Estado inicial vazio.
- `stepPhysics(state)` — Aplica atrito, movimento, colisão parede, colisão bola-bola com separação, detecção de pocket.
- `simulateShot(state, shot)` — Aplica tiro, roda física, determina falta, próximo jogador, vencedor, atribuição de tipos.

### `src/engine/pool/rules.ts`

- `isFoul()` — Sem contato, bola adversária primeiro (se tiver bolas próprias restantes), branca pocketed.
- `determineWinner()` — 8 pocketed com bolas próprias restantes ou falta → oponente vence; 8 pocketed sem falta e sem bolas próprias → jogador atual vence.
- `getNextPlayer()` — Define quem joga a seguir com base em falta, pocket de bola própria, ou fim de turno.

---

## 6. Fluxo de jogo detalhado

### Criação de partida (`FriendProfile.tsx:116-141`)

```typescript
const matchId = await poolService.createPoolMatch(userId, 0);
```

- Chama RPC `create_pool_match` com `p_stake = 0`.
- Inscreve no canal `pool-invite-${matchId}` escutando `UPDATE` em `pool_matches`.
- Se `status === 'accepted'` → navega para `/pool/${matchId}`.
- Se `status === 'declined'` → mostra "Convite recusado."

### Recebimento do convite (`Layout.tsx`)

- Polling de 5s em `pool_matches` onde `player2_id = uid` e `status = 'pending'`.
- Canal realtime `challenges-notify-${uid}` também escuta `pool_matches`.
- Mostra toast "Você foi desafiado para uma partida de sinuca!" com botões Aceitar/Recusar.

### Aceite (`services/pool.ts`)

```typescript
await poolService.acceptPoolMatch(matchId);
```

- Chama RPC `accept_pool_match`. Apenas `player2` pode aceitar.
- Status vira `playing`, `turn_deadline` = agora + 30s.

### Tiro (`Pool.tsx:109-146`)

1. Cliente verifica se é a vez (`myNumber === state.currentPlayer`).
2. Simula localmente com `simulateShot(state, { angle, power })`.
3. Anima frame a frame via `requestAnimationFrame` para feedback imediato.
4. Chama `submitShot(match.id, angle, power)` (Edge Function).
5. Se o servidor retornar `finalState`, aplica no estado local.
6. Se falhar, recarrega a partida via `getPoolMatch`.

### Realtime sincronização (`Pool.tsx:148-171`)

- Canal `pool-match-${matchId}` escuta `UPDATE` em `pool_matches`.
- Atualiza `table_state`, `status`, `currentPlayer`, `turnDeadline`, `winnerId`.
- Polling de fallback de 3s caso realtime não esteja disponível.

### Encerramento

- Partida vira `finished` quando:
  - Alguém encaçapa a 8 corretamente (sem falta e sem bolas próprias restantes).
  - Alguém comete falta com a 8 (oponente vence).
  - Turno expira (oponente vence por forfeição).
  - Alguém abandona (`cancelled`).

---

## 7. Como aplicar correções no banco de produção

Se o erro `permission denied for table pool_matches` aparecer na Edge Function, rode o arquivo `supabase/fix_pool_rls_realtime.sql` no **SQL Editor** do dashboard do Supabase (projeto `fut-senai-cards`):

```bash
# No dashboard do Supabase > SQL Editor, cole e rode o conteúdo de:
supabase/fix_pool_rls_realtime.sql
```

O que esse SQL faz:
1. Habilita RLS em `pool_matches` e `pool_shots`.
2. Revoga escritas diretas para `authenticated`.
3. Cria policies de leitura para participantes da partida.
4. Concede acesso total ao `service_role` (usado pela Edge Function).
5. Adiciona as tabelas ao `supabase_realtime` (se ainda não estiverem).
6. Cria índices de performance.

---

## 8. Problemas conhecidos e correções aplicadas

| Problema | Sintoma | Correção |
|----------|---------|----------|
| Tela branca no F5 em rotas como `/profile/:id` | `Failed to load module script: ... MIME type of "text/html"` | `vite.config.ts`: `base: './'` → `base: '/'` (commit `e63c024`) |
| `permission denied for table pool_matches` | Edge Function `pool-shot` retorna 500 | Rode `supabase/fix_pool_rls_realtime.sql` no SQL Editor |
| `create_pool_match` 400 na segunda tentativa | Já existe partida ativa entre os jogadores | `services/pool.ts` retorna erro detalhado; `FriendProfile.tsx` mostra "Já existe uma partida de sinuca ativa entre vocês." |
| `TypeError: Cannot read properties of undefined (reading 'balls')` | Tela branca ao abrir partida | `Pool.tsx`: guarda `!state.balls` antes de acessar `.map` |
| Realtime não dispara | Canais não recebem atualizações | Tabelas devem estar na publicação `supabase_realtime` (ver step 7) |

---

## 9. Testes

- `tests/engine/pool.test.ts` — Testes da engine de física.
- `supabase/tests/pvp_integrity.sql` — Testes de integridade do banco.

---

## 10. Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon pública do Supabase |
| `SERVICE_ROLE_KEY` | Chave de serviço (usada na Edge Function) |

---

*Documentação gerada em 06/11/2026. Projeto: FutSENAI Cards (ref: `ejtgdnrmnnqjwowfhezc`, região us-east-2).*
