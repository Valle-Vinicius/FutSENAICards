# FutSENAI Cards - Sistema PvP / Multijogador

> Documentação técnica sobre desafios entre amigos, partidas de futsal, rating competitivo (Elo) e sistema de ranking.

---

## Visão Geral

O sistema PvP permite que jogadores desafiem amigos para partidas de futsal. Diferente da sinuca (que é jogada em tempo real com física), as partidas de futsal são simuladas com base em ratings e estatísticas.

---

## Desafios (Challenges)

### Fluxo de Desafio

1. **Criação:** Jogador A chama `create_challenge(challenged_id, ...)` → cria partida com status `pending`
2. **Aceitação:** Jogador B chama `accept_challenge(challenge_id)` → status vira `accepted`
3. **Recusa:** Jogador B chama `reject_challenge(challenge_id)` → status vira `rejected`
4. **Simulação:** Partida é simulada com base nos elencos e rating dos jogadores
5. **Resultado:** Partida vira `completed` com placar e vencedor

### Tabela: `challenges`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK |
| `challenger_id` | uuid | Quem desafiou |
| `challenged_id` | uuid | Quem foi desafiado |
| `status` | text | pending, accepted, rejected, completed, cancelled, abandoned |
| `seed` | bigint | Seed para simulação |
| `home_formation` / `away_formation` | text | Formação tática |
| `home_score` / `away_score` | integer | Placar |
| `result` | jsonb | Resultado detalhado |
| `challenger_ready` / `challenged_ready` | boolean | Pronto para simular |
| `challenger_tactic` / `challenged_tactic` | text | Tática (balanced, possession, highpress, counter, compact) |
| `completed_at` | timestamptz | Quando terminou |
| `created_at`, `updated_at` | timestamptz | Timestamps |

---

## Sistema de Rating Competitivo (Elo)

### Elegibilidade de cartas

Cartas do Pacote Off-Sale não podem ser usadas em desafios PvP/X1. A regra é verificada ao carregar o elenco e novamente no servidor ao congelar os snapshots e solicitar a simulação, portanto não depende apenas da interface. Cartas Off-Sale já existentes são identificadas e marcadas durante a migration pelo nome do template.

### Tabela: `player_competitive_ratings`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `user_id` | uuid | PK → auth.users |
| `rating` | integer | Rating atual (default 1000) |
| `peak_rating` | integer | Maior rating alcançado |
| `matches_played` | integer | Total de partidas |
| `wins` / `losses` / `draws` | integer | Vitórias/derrotas/empates |
| `current_streak` | integer | Sequência atual |
| `best_win_streak` | integer | Melhor sequência de vitórias |
| `last_match_at` | timestamptz | Última partida |
| `created_at`, `updated_at` | timestamptz | Timestamps |

### Tabela: `competitive_rating_events`

Registra cada mudança de rating com:
- `challenge_id` → challenges
- `user_id` / `opponent_id` → auth.users
- `rating_before` / `rating_after` / `rating_change`
- `result` (win/loss/draw)
- `algorithm_version`

### Configuração (`competitive_config`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `initial_rating` | integer | Rating inicial (default 1000) |
| `k_factor` | integer | Fator K do algoritmo Elo |
| `algorithm_version` | text | Versão do algoritmo |
| `division_thresholds` | jsonb | Limites de divisão |

---

## Sistema de Rating (Algoritmo)

O rating segue o sistema Elo:

```
expected_score = 1 / (1 + 10^((opponent_rating - player_rating) / 400))
rating_change = k_factor * (actual_score - expected_score)
new_rating = rating + rating_change
```

Onde `actual_score` é 1 (vitória), 0.5 (empate) ou 0 (derrota).

---

## RPCs do PvP

| RPC | Params | Descrição |
|-----|--------|-----------|
| `create_challenge` | p_challenged, p_formation, p_tactic | Cria desafio pendente |
| `accept_challenge` | p_challenge_id | Aceita desafio |
| `reject_challenge` | p_challenge_id | Recusa desafio |
| `set_challenge_ready` | p_challenge_id, p_ready | Marca como pronto |
| `update_challenge_playback` | p_challenge_id, p_status, p_frame | Atualiza simulação |

---

## Arquivos Relevantes

- `src/pages/Match.tsx` - Página de partida PvP
- `src/pages/Leaderboard.tsx` - Ranking de jogadores
- `src/pages/CompetitiveProfile.tsx` - Perfil competitivo
- `src/pages/Challenges.tsx` (se existir) - Desafios pendentes
- `src/lib/services/challenges.ts` - Serviços de desafios
- `src/lib/services/leaderboard.ts` - Serviços de ranking
- `supabase/migrations/20261104013505_pvp_authority_reconciliation.sql` - RPCs de desafio
- `supabase/migrations/20261104150000_competitive_leaderboard.sql` - Tabelas de rating

---

## Problemas Conhecidos

### Rating Não Atualiza
Se o rating não mudar após uma partida, verificar:
1. Se a partida foi marcada como `completed`
2. Se o evento de rating foi gravado em `competitive_rating_events`
3. Se o RPC de atualização de rating foi executado com sucesso

---

*Documentação gerada em 07/11/2026.*
