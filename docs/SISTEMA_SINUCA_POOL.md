# FutSENAI Cards - Sistema de Sinuca / Pool (8-Ball)

> Documentação técnica completa do sistema de sinuca, incluindo fluxo de partidas, engine de física, edge function, RLS, realtime e todas as regras de jogo.

---

## Visão Geral

O sistema de sinuca permite que dois jogadores amigos joguem 8-ball entre si. A física é simulada localmente no cliente para feedback imediato, mas validada de forma autoritativa por uma Edge Function do Supabase.

---

## Fluxo de Partida

### 1. Criação do Desafio

Jogador A clica em "Jogar sinuca" no perfil do amigo (`FriendProfile.tsx`):
- Chama `create_pool_match(userId, 0)` → RPC `create_pool_match`
- Cria partida com status `pending`, seed aleatória, `turn_deadline` = agora + 10 min
- Inscreve no canal realtime `pool-invite-${matchId}`
- Aguarda aceite/recusa do adversário

### 2. Aceitação

Jogador B recebe notificação (sidebar ou canal realtime):
- Chama `accept_pool_match(matchId)` → status vira `playing`
- `turn_deadline` = agora + 30s
- Navega para `/pool/${matchId}`

### 3. Turnos

- Jogador 1 começa (current_player = 1)
- Jogador define ângulo e força no canvas
- Tiro é simulado localmente para feedback imediato
- Chama `submitShot(matchId, angle, power)` (edge function `pool-shot`)
- Servidor valida e executa física determinística
- Resultado é gravado e partida é atualizada via realtime

### 4. Término

Partida vira `finished` quando:
- Alguém encaçapa a 8 corretamente (sem bolas próprias restantes, sem falta)
- Alguém comete falta com a 8 em jogo (adversário vence)
- Turno expira (30s) → adversário vence por forfeição
- Alguém abandona → status `cancelled`

---

## Tabelas

### `pool_matches`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK |
| `player1_id` | uuid | FK → profiles |
| `player2_id` | uuid | FK → profiles |
| `stake` | int | Aposta em coins (default 0) |
| `status` | text | pending, accepted, playing, finished, declined, expired, forfeited, cancelled |
| `seed` | int | Seed aleatória para geração da mesa |
| `table_state` | jsonb | Estado da mesa (bolas, atribuições, turno) |
| `current_player` | int | 1 ou 2 |
| `turn_deadline` | timestamptz | Prazo do turno (30s) |
| `assignments` | jsonb | {"player1": null\|"solid"\|"stripe", "player2": ...} |
| `winner_id` | uuid | FK → profiles |
| `payout` | int | Pagamento ao vencedor |
| `version` | int | Controle de versão |
| `created_at`, `updated_at` | timestamptz | Timestamps |

### `pool_shots`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK |
| `match_id` | uuid | FK → pool_matches |
| `player_id` | uuid | FK → profiles |
| `seq` | int | Sequência do tiro |
| `angle` | float | Ângulo em radianos |
| `power` | float | Força (0-1) |
| `result` | jsonb | {pocketed, foul, nextPlayer, winner} |
| `shot_id` | uuid | Unique (idempotência) |
| `created_at` | timestamptz | Timestamp |

---

## RPCs

### `create_pool_match(p_opponent uuid, p_stake int) → uuid`

Cria partida com status `pending`:
- Exige amizade aceita entre os jogadores
- Rejeita se já houver partida ativa entre eles nas últimas 2h
- Define `turn_deadline = now + 10 min`

### `accept_pool_match(p_id uuid) → boolean`

Apenas `player2` pode aceitar:
- Status deve ser `pending`
- Muda para `playing`
- Define `turn_deadline = now + 30s`

### `reject_pool_match(p_id uuid) → boolean`

Apenas `player2` pode recusar:
- Status deve ser `pending`
- Muda para `declined`

### `abandon_pool_match(p_id uuid) → boolean`

Qualquer participante pode abandonar:
- Status vira `cancelled`

---

## Edge Function: `pool-shot`

**Arquivo:** `supabase/functions/pool-shot/index.ts`  
**Runtime:** Deno com `@supabase/supabase-js` (service role)

### Validações

1. Sessão válida (JWT do usuário)
2. `matchId` é UUID válido
3. `angle` é número finito
4. `power` está entre 0 e 1
5. `ballInHandPos` (opcional) dentro dos limites da mesa
6. Usuário é `player1_id` ou `player2_id` da partida
7. Status da partida é `accepted` ou `playing`
8. É a vez do usuário (`current_player` corresponde)
9. `turn_deadline` não expirou (30s)

### Execução

1. Carrega ou cria estado inicial da mesa (`createInitialState`)
2. Se bola branca está pocketed e `ballInHandPos` fornecido, reposiciona a branca
3. Aplica tiro (ângulo × força × 8 de velocidade)
4. Executa física determinística até todas as bolas pararem (máx. 2400 passos)
5. Determina falta, próximo jogador, vencedor, atribuição de lisas/listradas
6. Grava tiro em `pool_shots` (com `shot_id` para idempotência)
7. Atualiza `pool_matches` (`table_state`, `current_player`, `version`, `winner_id`, `status`)
8. Retorna `{ frames, finalState, pocketed, foul, nextPlayer, winner }`

---

## Engine de Física

### Arquivos

- `src/engine/pool/types.ts` - Tipos e constantes
- `src/engine/pool/physics.ts` - Simulação física
- `src/engine/pool/rules.ts` - Regras de falta, próximo jogador, vencedor

### Constantes

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `TABLE_WIDTH` | 2.0 | Largura da mesa |
| `TABLE_HEIGHT` | 1.0 | Altura da mesa |
| `BALL_RADIUS` | 0.025 | Raio da bola |
| `POCKET_RADIUS` | 0.045 | Raio do buraco |
| `FRICTION` | 0.985 | Atrito por passo |
| `RESTITUTION` | 0.8 | Coeficiente de restituição |
| `FIXED_DT` | 1/240 | Passo de tempo |
| `MAX_SIM_STEPS` | 2400 | Máximo de passos (10s) |

### Criação da Mesa (`createInitialBalls`)

- Bola branca (id 0) na posição inicial
- Triângulo com 15 bolas: 7 sólidas (1-7), 7 listradas (9-15), 1 eight-ball (id 15)
- Bola 8 no centro do triângulo

### Física por Passo (`stepPhysics`)

1. Aplica atrito (velocidade *= FRICTION)
2. Aplica movimento (posição += velocidade × dt)
3. Detecção de colisão parede-bola
4. Detecção de colisão bola-bola com separação
5. Detecção de buraco (pocket)
6. Para quando todas as bolas pararem

### Regras de Jogo (`rules.ts`)

#### `isFoul()`
Retorna true se:
- Nenhuma bola tocou a borda após contato e nenhuma foi pocketed
- Bola adversária tocada primeiro (se houver bolas próprias restantes)
- Bola branca foi pocketed

#### `determineWinner()`
- 8 pocketed com bolas próprias restantes → adversário vence
- 8 pocketed sem falta e sem bolas próprias → jogador atual vence
- 8 pocketed com falta → adversário vence

#### `getNextPlayer()`
- Se falta → adversário joga
- Se pocketed bola própria → mesmo jogador continua
- Caso contrário → adversário joga

---

## Realtime

### Tabelas na Publicação

- `pool_matches`
- `pool_shots`

### Canais

| Canal | Evento | Descrição |
|-------|--------|-----------|
| `pool-match-${matchId}` | UPDATE | Sincroniza table_state, status, current_player, winner_id |
| `pool-invite-${matchId}` | UPDATE | Notifica aceite/recusa de convite |

### Polling de Fallback

Como fallback ao realtime, o cliente faz polling a cada 3s para sincronizar o estado da partida.

---

## Problemas Conhecidos e Correções

### 1. `state.balls` undefined
**Problema:** `TypeError: Cannot read properties of undefined (reading 'balls')` ao acessar `state.balls` sem verificar se existe.
**Correção:** Adicionar guarda `!state.balls` antes de acessar `.map`.

### 2. Detecção de bola própria (physics.ts e pool-shot)
**Problema:** Usava `state.balls` (estado original) em vez de `s.balls` (estado simulado) para decidir próximo jogador após pocket.
**Correção:** Usar `s.balls` no estado simulado.

### 3. Falta por não tocar a borda
**Problema:** Regra comentada/vazia - jogadas sem tocar a borda não eram consideradas falta.
**Correção:** Implementar regra completa.

### 4. Reposicionar bola branca
**Problema:** Cliente não enviava `ballInHandPos` quando branca era pocketed.
**Correção:** Adicionar UI e envio de `ballInHandPos` na edge function.

---

## Arquivos Relevantes

- `src/pages/Pool.tsx` - Tela da partida, canvas, tiro, realtime
- `src/pages/FriendProfile.tsx` - Criação de convite, canal de convite
- `src/lib/services/pool.ts` - Wrappers dos RPCs e submitShot
- `src/engine/pool/types.ts` - Tipos e constantes de física
- `src/engine/pool/physics.ts` - Simulação física
- `src/engine/pool/rules.ts` - Regras de falta e vencedor
- `supabase/functions/pool-shot/index.ts` - Edge function autoritativa
- `supabase/migrations/20261105020000_pool_tables.sql` - Tabelas
- `supabase/migrations/20261105030000_pool_match_rpcs.sql` - RPCs
- `supabase/migrations/20261105040000_pool_challenge_flow.sql` - Fluxo de desafio
- `supabase/migrations/20261106000000_pool_integrity.sql` - Integridade (version, shot_id, status cancelled)

---

*Documentação gerada em 07/11/2026.*
