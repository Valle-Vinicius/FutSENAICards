# Overall — FutSENAI Cards

Documentação técnica do sistema de overall (OVR) de cartas do FutSENAI Cards. Explica como o overall é calculado ao gerar uma carta, como raridades e especiais afetam o valor, como atributos são modificados, e como evoluções alteram o overall ao longo do tempo.

---

## 1. Visão geral

O overall (OVR) de uma carta varia de **0 a 99** e é calculado com base em:

1. **Atributos base** da carta (pace, shooting, passing, dribbling, defending, physical — e reflexes/positioning/handling para GK).
2. **Posição** do jogador (GK, Fixo, Ala, Pivo), cada uma com pesos diferentes nos atributos.
3. **Raridade** da carta (aplica um multiplicador nos atributos e um bônus fixo de OVR).
4. **Edição especial** (special) — adiciona um bônus fixo de OVR.
5. **Evoluções/upgrades** — o jogador pode aumentar atributos individualmente, recalculando o OVR como média dos atributos.

---

## 2. Arquivos envolvidos

| Arquivo | Função |
|---------|--------|
| `src/data/players.ts` | Templates de jogadores, cálculo de overall base, geração de cartas, bônus por raridade/especial |
| `src/lib/game.ts` | Validação de overall por raridade, migração de cartas persistidas |
| `src/lib/services/cards.ts` | Migração e recálculo de overall ao carregar do banco |
| `src/store/useGame.ts` | Upgrade de atributos (evolução), recálculo de OVR, squad overall, marketplace |
| `src/types.ts` | Tipos `PlayerCard`, `Rarity`, `RARITY_META` |

---

## 3. Constantes de raridade

### `RARITY_MODIFIER` — multiplicador aplicado nos atributos

Arquivo: `src/data/players.ts:34-41`

| Raridade | Multiplicador | Efeito nos atributos |
|----------|---------------|----------------------|
| common | 0.88 | -12% |
| uncommon | 1.00 | sem alteração |
| rare | 1.05 | +5% |
| epic | 1.10 | +10% |
| legendary | 1.15 | +15% |
| icon | 1.20 | +20% |

Função `applyModifier(value, mod)`: `Math.max(0, Math.min(99, Math.round(value * mod)))`.

### `RARITY_OVR_BONUS` — bônus fixo de overall por raridade

Arquivo: `src/data/players.ts:43-50`

| Raridade | Bônus OVR |
|----------|-----------|
| common | -2 |
| uncommon | 0 |
| rare | +2 |
| epic | +4 |
| legendary | +6 |
| icon | +8 |

### `SPECIAL_OVR_BONUS` — bônus fixo de overall por edição especial

Arquivo: `src/data/players.ts:52-59`

| Special | Bônus OVR |
|---------|-----------|
| none | 0 |
| totw | +2 |
| potm | +2 |
| revelation | +1 |
| legend | +3 |
| futsal | +2 |

---

## 4. Cálculo do overall base por posição

Arquivo: `src/data/players.ts:86-96` — função `calculateOverall(t)`

Se o template tem `baseOverall` definido, esse valor é usado diretamente. Caso contrário, o overall base é calculado pela média ponderada dos atributos conforme a posição:

### Goleiro (GK)
```
reflexes   × 0.30
positioning × 0.25
defending   × 0.20
passing     × 0.10
physical    × 0.10
pace        × 0.05
```
Usa também `gkAttributes` (reflexes, positioning, handling) se disponível.

### Fixo
```
defending   × 0.35
physical    × 0.20
passing     × 0.20
pace        × 0.10
dribbling   × 0.08
shooting    × 0.07
```

### Ala
```
pace        × 0.25
passing     × 0.22
dribbling   × 0.20
shooting    × 0.13
defending   × 0.12
physical    × 0.08
```

### Pivo (posição padrão / outras)
```
shooting    × 0.32
physical    × 0.22
dribbling   × 0.18
passing     × 0.12
pace        × 0.10
defending   × 0.06
```

Resultado arredondado com `Math.round()`.

---

## 5. Geração da carta e overall final

Arquivo: `src/data/players.ts:98-145` — função `generatePlayerCard(t, rarity, special)`

O overall final segue esta fórmula:

```
overall = Math.min(99, baseOverall + RARITY_OVR_BONUS[rarity] + SPECIAL_OVR_BONUS[special])
```

Onde `baseOverall` = `t.baseOverall ?? calculateOverall(t)`.

Exemplo prático:
- Template "Pietro Guedes": baseOverall = 86, posição Pivo
- Gerado como **rare**: 86 + 2 = **88**
- Gerado como **epic**: 86 + 4 = **90**
- Gerado como **legendary**: 86 + 6 = **92**
- Gerado como **icon**: 86 + 8 = **94**
- Gerado como **common**: 86 - 2 = **84**

Se também tiver special `totw`: soma +2 a mais.

Os atributos (pace, shooting, etc.) são multiplicados pelo `RARITY_MODIFIER` da raridade, limitados entre 0 e 99.

---

## 6. Templates de jogadores

Arquivo: `src/data/players.ts:61-78` — array `TEMPLATES`

Cada template define: nome, posição, nacionalidade, idade, clube, atributos (6 ou 9 para GK), imagem, `baseRarity` e `baseOverall` opcional.

Exemplo:
```ts
{ name: 'Pietro Guedes', position: 'Pivo', baseOverall: 86, baseRarity: 'uncommon', attributes: { pace: 81, shooting: 88, ... } }
```

Templates podem ser carregados também do banco (`card_templates`) via `loadDbTemplates()`.

---

## 7. Validação de overall por raridade

Arquivo: `src/lib/game.ts:110-113` — função `validateRarityOverall(rarity, overall)`

Verifica se o overall está dentro do intervalo permitido para a raridade, definido em `RARITY_META` (tipos.ts):

```ts
return overall >= m.minOvr && overall <= m.maxOvr;
```

---

## 8. Migração e recálculo ao carregar do banco

### No Zustand store (`src/store/useGame.ts:init`)

Quando o app inicia, cartas persistidas localmente são migradas: o overall é recalculado com base na raridade e special da carta, aplicando os bônus de rarity e special sobre o `baseOverall` do template.

### Em `syncUserData` (`src/store/useGame.ts:182-246`)

Ao sincronizar com o Supabase, cartas remotas também passam pelo mesmo recálculo de overall baseado em raridade/special.

### Em `cards.ts` (`src/lib/services/cards.ts:39-40`)

Ao adicionar/migrar cartas no banco, o overall é recalculado da mesma forma e salvo com `schema_version: 4`.

---

## 9. Evolução / Upgrade de carta

Arquivo: `src/store/useGame.ts:681-706` — função `upgradePlayer(uid, attr)`

O jogador pode gastar `evoPoints` para aumentar um atributo em +1 (limite de 10 por atributo, 15 no total). Após o upgrade:

1. O atributo escolhido aumenta +1 (máximo 99).
2. O overall é recalculado como **média simples dos 6 atributos**:

```
newOverall = Math.round((pace + shooting + passing + dribbling + defending + physical) / 6)
```

3. `evoPoints` diminui em 1.
4. O log de evolução é registrado.

---

## 10. Squad overall

Arquivo: `src/store/useGame.ts:903-908` — função `squadOverall(squad, cards)`

```
squadOverall = Math.round(soma dos OVR dos 5 titulares / 5)
```

Usado no `Layout.tsx`, `Match.tsx`, `Leaderboard.tsx` e `PvpResultScreen.tsx`.

---

## 11. Onde o overall é exibido / usado

| Contexto | Arquivo | Uso |
|----------|---------|-----|
| Card da coleção | `src/components/Card.tsx:49` | Exibe OVR grande no centro |
| Detalhe da carta | `src/pages/CardDetail.tsx:38` | Linha "Overall" |
| Comparação | `src/pages/Compare.tsx` | Ordena e exibe diferença de OVR |
| Coleção | `src/pages/Collection.tsx` | Ordena por OVR |
| Squad/elenco | `src/store/useGame.ts` | Squad overall (média titulares) |
| Marketplace | `src/store/useGame.ts:779` | `cardOverall` no anúncio |
| SBC | `src/store/useGame.ts:903` | Requisito `minOverall` |
| Leaderboard | `src/store/useGame.ts:366,779` | `squad_overall` no ranking |
| Perfil do amigo | `src/pages/FriendProfile.tsx:151` | Carta mais rara mostra OVR |
| PvP Result | `src/components/PvpResultScreen.tsx` | OVR no snapshot das cartas |

---

## 12. Resumo da fórmula

```
ATRIBUTOS MODIFICADOS = atributo_base × RARITY_MODIFIER[rarity]  (0-99)

OVERALL_BASE = template.baseOverall ?? calcularPorPosicao(atributos)

OVERALL_FINAL = min(99, OVERALL_BASE + RARITY_OVR_BONUS[rarity] + SPECIAL_OVR_BONUS[special])

APÓS EVOLUÇÃO: OVERALL = round((pace+shooting+passing+dribbling+defending+physical)/6)
```

---

*Documentação gerada em 07/11/2026. Projeto: FutSENAI Cards.*
