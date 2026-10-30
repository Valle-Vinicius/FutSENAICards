# Documentação Técnica — X1 (PvP) entre Amigos

## 1. Visão geral

O modo X1 permite que dois amigos disputem uma partida simulada usando seus próprios elencos. A simulação é determinística (mesma seed → mesmo resultado) e roda no cliente; o resultado oficial é salvo no Supabase.

## 2. Tabelas envolvidas

### `challenges`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | Identificador |
| challenger_id | uuid (FK auth.users) | Quem desafiou |
| challenged_id | uuid (FK auth.users) | Quem foi desafiado |
| status | text | pending / accepted / rejected / completed |
| seed | bigint | Seed compartilhada |
| challenger_ready | boolean | Pronto do desafiante |
| challenged_ready | boolean | Pronto do desafiado |
| home_formation | text | Formação do desafiante |
| away_formation | text | Formação do desafiado |
| home_score, away_score | int | Placar final |
| result | jsonb | Resultado completo (frames, eventos, stats) |
| created_at, updated_at | timestamptz | Timestamps |

### `squads`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | uuid (PK) | |
| user_id | uuid (FK) | Dono |
| formation | text | Ex.: 1-2-1 |
| starters | jsonb (array de uuid) | IDs das cartas titulares |
| bench | jsonb (array de uuid) | Reservas |
| is_primary | boolean | Elenco principal |
| created_at, updated_at | timestamptz | |

### `cards`
Fonte dos atributos. Campos: id, user_id, name, position, overall, pace, shooting, passing, dribbling, defending, physical, reflexes, positioning, handling, image, rarity, etc.

### `friendships`
status: pending / accepted / rejected. RLS garante que só participantes veem.

## 3. Fluxo completo

### 3.1. Criar desafio
- Usuário A (autenticado) clica "Desafiar" no perfil do amigo B.
- `createChallenge(A, B)` verifica: não é si mesmo, amizade aceita, sem desafio pendente/aceito entre a dupla.
- Insere em `challenges` com status `pending`, challenger=A, challenged=B.
- Navega A para `/match?challenge=<id>`.

### 3.2. Notificação
- B recebe banner/toast via polling (5s) + realtime (INSERT/UPDATE em challenges).
- Banner "Você foi desafiado" com botões Aceitar/Depois.

### 3.3. Aceitar/Recusar
- B clica Aceitar → `acceptChallenge(id)` faz UPDATE atômico (`WHERE status='pending'`), seta seed. Retorna true só se 1 linha afetada.
- B é redirecionado para `/match?challenge=<id>`.
- Se recusar → status `rejected`, A vê mensagem.

### 3.4. Ready-up
- Ambos veem as escalações (home = desafiante, away = desafiado).
- Cada um clica "Estou pronto" → `setReady(id, side)` seta `challenger_ready`/`challenged_ready`.
- Quando ambos prontos → fade 1.5s → inicia simulação.

### 3.5. Simulação
- `simulateMatch(config)` roda a engine determinística com seed compartilhada.
- Ambos os clientes executam a mesma simulação → mesmo resultado.
- Exibe campo 2D, placar, eventos, stats, controles de pausa/velocidade.

### 3.6. Resultado
- Desafiante salva resultado via `saveChallengeResult` (guard: só se accepted e sem resultado).
- Status → `completed`. Resultado armazenado em `result` (jsonb).
- Desafiado lê o resultado salvo (ou computa localmente).
- Ambos veem a tela de resultado.

### 3.7. Histórico
- Partida registrada em `matches` (user_id, home_score, away_score, opponent, status).
- Aparece no perfil e no histórico.

## 4. Arquivos envolvidos

- `src/lib/services/challenges.ts` — CRUD + realtime
- `src/lib/services/friends.ts` — amizades
- `src/lib/services/squads.ts` — elencos
- `src/lib/services/cards.ts` — cartas
- `src/lib/services/matches.ts` — histórico
- `src/engine/match.ts` — engine determinística
- `src/pages/Match.tsx` — UI da partida
- `src/pages/Friends.tsx` — UI de amizades
- `src/pages/FriendProfile.tsx` — perfil + desafiar
- `src/components/Layout.tsx` — notificação de desafio
- `supabase/challenges.sql` — schema

## 5. Segurança (RLS)

- `challenges`: SELECT para participantes; INSERT apenas como requester; UPDATE para ambas as partes.
- `squads`, `cards`, `friendships`: RLS por user_id.
- Resultado oficial: idealmente salvo server-side (atualmente cliente salva, com guard de status).

## 6. Testes

- `src/engine/__tests__/match.test.ts`: determinismo, stats, makeAwayTeam (3 testes).
- Jest: 13 testes passando.

## 7. Pendências

- RLS completo e server-side result (recomendado para PvP competitivo).
- Expiração de desafios.
- Snapshot imutável de elencos.
- Testes de concorrência (múltiplas abas).
- Monitoramento.

## 8. Pré-requisitos

- Rodar `supabase/challenges.sql` e `supabase/squads.sql` no Supabase.
- Usuários devem ter elenco principal salvo (Montar elenco → Salvar).
- Amizade aceita entre os dois.
