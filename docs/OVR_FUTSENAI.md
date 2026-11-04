# Sistema de Overall (OVR) — Futsenai Cards

## 1. Visão geral

O Overall (OVR) de uma carta é calculado a partir dos atributos técnicos do jogador, ajustados por:
- **Raridade** (modificador multiplicativo sobre atributos e OVR base).
- **Tags especiais** (bônus aditivo ao OVR).
- **Evolução** (melhorias escolhidas pelo usuário).
- **Limites** (máximo 99, mínimo definido pela banda de raridade).

## 2. Atributos base

Cada jogador possui atributos base (valores "puros", carta Incomum):

| Atributo | Abrev. | Descrição |
|----------|--------|-----------|
| Velocidade | VEL | Pace |
| Chute | CHU | Shooting |
| Passe | PAS | Passing |
| Drible | DRI | Dribbling |
| Defesa | DEF | Defending |
| Físico | FIS | Physical |
| Reflexos (GK) | REF | Reflexes |
| Posicionamento (GK) | POS | Positioning |
| Defesa de goleiro (GK) | HAN | Handling |

Esses valores são a referência para a raridade **Incomum** (modificador 1.0).

## 3. Modificador de raridade

Aplicado a cada atributo e ao OVR base:

| Raridade | Modificador | Banda de OVR |
|----------|-------------|--------------|
| Comum | 0.88 | 50–69 |
| Incomum | 1.00 | 60–74 |
| Rara | 1.05 | 70–79 |
| Épica | 1.10 | 80–87 |
| Lendária | 1.15 | 88–94 |
| Ícone | 1.20 | 95–99 |

Fórmula: `atributo_final = round(atributo_base × mod)`, limitado a 0–99.

## 4. Bônus de tags (special)

Adicionado apenas ao OVR (não aos atributos):

| Tag | Bônus OVR |
|-----|-----------|
| Nenhuma | +0 |
| Time da Semana (TOTW) | +2 |
| Craque da Rodada (POTM) | +2 |
| Revelação da Temporada | +1 |
| Lenda do Futebol | +3 |
| Especial Futsal | +2 |

## 5. Cálculo do OVR final

```
OVR = min(99, round(baseOverall × mod_raridade + bonus_tag))
```

- `baseOverall`: overall base do jogador (ex.: Pietro 86).
- `mod_raridade`: modificador da raridade sorteada.
- `bonus_tag`: bônus da tag especial (se houver).

Exemplo: Pietro (base 86) como Rara (1.05) sem tag:
`OVR = round(86 × 1.05) = 90`.

Exemplo: Pietro como Incomum (1.0) com tag Lenda (+3):
`OVR = 86 × 1.0 + 3 = 89`.

## 6. Cálculo de OVR por posição (quando não há baseOverall)

Para jogadores sem `baseOverall` definido, o OVR é calculado pela média ponderada dos atributos:

- **Goleiro (GK)**: REF×0.30 + POS×0.25 + DEF×0.20 + PAS×0.10 + FIS×0.10 + VEL×0.05
- **Fixo**: DEF×0.35 + FIS×0.20 + PAS×0.20 + VEL×0.10 + DRI×0.08 + CHU×0.07
- **Ala**: VEL×0.25 + PAS×0.22 + DRI×0.20 + CHU×0.13 + DEF×0.12 + FIS×0.08
- **Pivô**: CHU×0.32 + FIS×0.22 + DRI×0.18 + PAS×0.12 + VEL×0.10 + DEF×0.06

## 7. Evolução (upgrades)

- Cada carta acumula XP em partidas e missões.
- A cada 100 XP → 1 ponto de evolução.
- O usuário escolhe o atributo (+1 por ponto).
- Limites: 15 melhorias totais por carta, +10 por atributo, OVR máximo 99.
- O OVR é recalculado após cada upgrade (média dos atributos atualizados).
- Histórico de evoluções e estatísticas da temporada são registrados.

## 8. Migração (schema v3)

Cartas antigas (schema < 3) são migradas ao carregar:
- Atributos recalculados com o modificador da raridade da carta.
- OVR recalculado com mod + bônus da tag.
- Persistido no banco (Supabase) e no localStorage.

## 10. Exemplo prático (Pietro Guedes — base 86)

| Raridade | Mod | VEL | CHU | PAS | DRI | DEF | FIS | OVR |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|
| Comum | 0.88 | 71 | 78 | 73 | 69 | 64 | 77 | 76 |
| Incomum | 1.00 | 81 | 88 | 83 | 78 | 73 | 87 | 86 |
| Rara | 1.05 | 85 | 92 | 87 | 82 | 77 | 91 | 90 |
| Épica | 1.10 | 89 | 97 | 91 | 86 | 80 | 96 | 95 |
| Lendária | 1.15 | 93 | 100 | 96 | 90 | 84 | 100 | 99 |
| Ícone | 1.20 | 97 | 100 | 100 | 94 | 88 | 100 | 99 |

Valores arredondados, limitados a 99. OVR inclui modificador (sem tag). Com tag Lenda (+3), somar ao OVR (limitado a 99).

## 9. Resumo

OVR final = (atributos base × modificador de raridade) + bônus de tag + melhorias de evolução, limitado a 99. A raridade afeta tanto os atributos quanto o OVR, evitando que cartas de raridades diferentes tenham o mesmo OVR para o mesmo jogador.
