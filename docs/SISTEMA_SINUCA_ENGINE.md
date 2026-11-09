# FutSENAI Cards - Engine de Sinuca / Pool (Física)

> Documentação técnica detalhada sobre a engine de física de bilhar, regras de jogo, faltas, atribuição de lisas/listradas e o vencedor.

---

## Visão Geral

A engine de sinuca simula física de bilhar de forma determinística. A simulação roda localmente no cliente para feedback imediato, mas o resultado final é validado por uma Edge Function do servidor (`pool-shot`) para evitar trapaças.

---

## Arquivos da Engine

| Arquivo | Descrição |
|---------|-----------|
| `src/engine/pool/types.ts` | Tipos, constantes e configurações |
| `src/engine/pool/physics.ts` | Simulação física (passo a passo) |
| `src/engine/pool/rules.ts` | Regras de falta, próximo jogador, vencedor |

---

## Constantes da Mesa

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `TABLE_WIDTH` | 2.0 | Largura da mesa (unidades) |
| `TABLE_HEIGHT` | 1.0 | Altura da mesa (unidades) |
| `BALL_RADIUS` | 0.025 | Raio de cada bola |
| `POCKET_RADIUS` | 0.045 | Raio de cada buraco |
| `FRICTION` | 0.985 | Atrito aplicado a cada passo |
| `RESTITUTION` | 0.8 | Coeficiente de restituição (quicada) |
| `FIXED_DT` | 1/240 | Passo de tempo da simulação |
| `MAX_SIM_STEPS` | 2400 | Máximo de passos (≈10 segundos) |

### Posição dos Buracos

6 buracos estão localizados nos cantos e ao meio de cada lado longo da mesa.

---

## Criação Inicial da Mesa (`createInitialBalls`)

A mesa é inicializada com:

1. **Bola branca (id 0):** Posicionada na linha de saída (baixo da mesa)
2. **Triângulo de 15 bolas:**
   - 7 bolas sólidas (ids 1-7)
   - 7 bolas listradas (ids 9-15)
   - 1 bola 8 (id 15) no centro do triângulo

As bolas são dispostas em formação triangular, com a bola 1 no vértice frente.

---

## Simulação Física (`stepPhysics`)

Cada passo de simulação (`FIXED_DT = 1/240` segundos) executa:

### 1. Aplicar Atrito
```
velocidade *= FRICTION
```

### 2. Aplicar Movimento
```
posição += velocidade * dt
```

### 3. Colisão Bola-Parede
Se uma bola atinge a borda da mesa:
- Inverte a componente de velocidade perpendicular à parede
- Aplica restituição (perda de energia)
- Reposiciona a bola para dentro da mesa

### 4. Colisão Bola-Bola
Para cada par de bolas em colisão:
- Calcula vetor normal entre os centros
- Resolve colisão elasticamente com conservação de momento
- Aplica restituição
- Separa bolas sobrepostas para evitar grudar

### 5. Detecção de Buraco
Se uma bola está dentro do raio de um buraco:
- Marca a bola como `pocketed`
- Remove a bola da mesa ativa
- Registra qual bola foi pocketed

### 6. Término da Simulação

A simulação termina quando:
- Todas as bolas pararam (velocidade próxima de zero)
- Ou o número máximo de passos (2400) é atingido

---

## Regras de Jogo (`rules.ts`)

### Atribuição de Lisas/Listradas

Na primeira tacada em que uma bola (não branca) é pocketed:
- Se for sólida → jogador joga sólidas
- Se for listrada → jogador joga listradas
- Se for a 8 → atribuição ainda não definida (joga novamente)

### Detecção de Falta (`isFoul`)

Uma jogada é falta se:

1. **Nenhuma bola tocou a borda após o contato** E nenhuma bola foi pocketed
2. **Bola adversária tocada primeiro** (se o jogador ainda tem bolas próprias restantes)
3. **Bola branca pocketed**

### Próximo Jogador (`getNextPlayer`)

| Situação | Próximo Jogador |
|----------|-----------------|
| Falta | Adversário |
| Pocketed bola própria | Mesmo jogador |
| Pocketed bola adversária | Adversário |
| Nenhuma bola pocketed | Adversário |

### Vencedor (`determineWinner`)

| Situação | Resultado |
|----------|-----------|
| 8 pocketed com bolas próprias restantes | **Adversário vence** (falta com 8) |
| 8 pocketed sem falta e sem bolas próprias | **Jogador atual vence** |
| 8 pocketed com falta | **Adversário vence** |
| Turno expirou (30s) | **Adversário vence** por forfeição |

---

## Edge Function: `pool-shot`

### Fluxo de Execução

```
1. Validar sessão do usuário
2. Validar matchId, angle, power
3. Validar que usuário é participante
4. Validar que é a vez do usuário
5. Validar turn_deadline não expirou
6. Carregar ou criar estado inicial da mesa
7. Se bola branca pocketed e ballInHandPos fornecido → reposicionar branca
8. Aplicar tiro (ângulo × força × 8)
9. Executar física determinística
10. Determinar falta, próximo jogador, vencedor
11. Gravar tiro em pool_shots (com shot_id para idempotência)
12. Atualizar pool_matches (table_state, current_player, version, winner_id, status)
13. Retornar { frames, finalState, pocketed, foul, nextPlayer, winner }
```

### Validações de Segurança

- Usuário deve estar autenticado (JWT)
- Usuário deve ser player1 ou player2 da partida
- Status da partida deve ser `accepted` ou `playing`
- Turn deadline não pode ter expirado
- Só o jogador da vez pode atirar

---

## Faltas e Consequências

| Falta | Consequência |
|-------|--------------|
| Bola branca pocketed | Adversário joga com bola na mão (pode posicionar em qualquer lugar) |
| Bola adversária primeiro | Adversário joga |
| Nenhuma bola toca borda após contato | Adversário joga |
| 8 pocketed com bolas próprias restantes | Adversário vence a partida |
| 8 pocketed sem bolas próprias | Jogador vence a partida |

---

## Atribuição de Lisas/Listradas

Na primeira tacada legal em que uma bola (não branca) é pocketed:
- Se for bola sólida (1-7) → jogador fica com sólidas
- Se for bola listrada (9-15) → jogador fica com listradas
- A bola 8 (id 15) não define atribuição na primeira tacada

Uma vez atribuído, o jogador deve pocketar todas as bolas do seu tipo antes de tentar a 8.

---

## Problemas Conhecidos e Correções

### 1. `state.balls` undefined
**Problema:** `TypeError: Cannot read properties of undefined (reading 'balls')`
**Correção:** Adicionar guarda `!state.balls` antes de acessar `.map`

### 2. Detecção de bola própria incorreta
**Problema:** Usava `state.balls` (estado original) em vez de `s.balls` (estado simulado)
**Correção:** Usar `s.balls` no estado simulado para decidir próximo jogador

### 3. Falta por não tocar borda
**Problema:** Regra estava comentada/vazia
**Correção:** Implementar detecção completa de falta por não tocar borda

### 4. Reposicionar bola branca
**Problema:** Cliente não enviava `ballInHandPos` quando branca era pocketed
**Correção:** Adicionar envio de `ballInHandPos` na edge function

---

## Arquivos Relevantes

- `src/engine/pool/types.ts` - Tipos, constantes, createInitialBalls
- `src/engine/pool/physics.ts` - stepPhysics, simulateShot
- `src/engine/pool/rules.ts` - isFoul, determineWinner, getNextPlayer
- `src/pages/Pool.tsx` - Canvas, tiro, animação, submitShot
- `src/lib/services/pool.ts` - submitShot wrapper
- `supabase/functions/pool-shot/index.ts` - Edge function autoritativa
- `supabase/migrations/20261105020000_pool_tables.sql` - Tabelas pool
- `supabase/migrations/20261106000000_pool_integrity.sql` - Integridade de dados

---

*Documentação gerada em 07/11/2026.*
