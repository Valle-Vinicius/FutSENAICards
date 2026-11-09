# FutSENAI Cards - Documentação Técnica Completa

> Documentação gerada em 07/11/2026.  
> Projeto: FutSENAI Cards (Supabase ref: `ejtgdnrmnnqjwowfhezc`, região us-east-2, PostgreSQL 17)  
> Deploy: Vercel (produção) + GitHub Pages (fallback)

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Banco de Dados](#banco-de-dados)
4. [Autenticação e Sessão](#autenticação-e-sessão)
5. [Sistema de Cartas e Overall](#sistema-de-cartas-e-overall)
6. [Sistema de Sinuca / Pool](#sistema-de-sinuca--pool)
7. [Painel do Administrador](#painel-do-administrador)
8. [Sistema PvP / Multijogador](#sistema-pvp--multijogador)
9. [Inventário, Coleção e Mercado](#inventário-coleção-e-mercado)
10. [Edge Functions](#edge-functions)
11. [RLS e Segurança](#rls-e-segurança)
12. [Realtime](#realtime)
13. [Deploy e Variáveis de Ambiente](#deploy-e-variáveis-de-ambiente)

---

## Visão Geral

O **FutSENAI Cards** é um aplicativo de colecionáveis de cartas de futebol/futsal (estilo FIFA Ultimate Team) construído com:

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS + Zustand
- **Backend:** Supabase (PostgreSQL 17, Realtime, Edge Functions com Deno)
- **Deploy:** Vercel (principal), GitHub Pages (fallback)

O aplicativo permite ao usuário:
- Abrir pacotes de cartas (com probabilidades por raridade)
- Colecionar cartas de jogadores
- Montar elencos e participar de partidas PvP
- Jogar sinuca (8-ball) contra amigos
- Editar atributos e overall de cartas através do painel admin
- Converter duplicatas em moedas

---

## Arquitetura

```
frontend/          React + Vite + TypeScript
├── src/pages/     Páginas da aplicação
├── src/components/# Componentes reutilizáveis
├── src/store/     Zustand (estado global)
├── src/lib/       Serviços Supabase, utilitários
├── src/data/      Dados estáticos (templates de cartas)
└── src/types/     Tipos TypeScript

supabase/
├── migrations/    Migrações SQL (ordenadas por data)
├── functions/     Edge Functions (Deno)
└── config.toml    Configuração do Supabase CLI
```

---

## Banco de Dados

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `profiles` | Perfis de usuário (coins, xp, nível, avatar) |
| `cards` | Cartas colecionáveis dos usuários |
| `card_templates` | Templates base de cartas (criados pelo admin) |
| `challenges` | Desafios PvP entre jogadores |
| `pool_matches` | Partidas de sinuca |
| `pool_shots` | Tacadas registradas nas partidas de sinuca |
| `friendships` | Amizades entre usuários |
| `listings` | Anúncios do marketplace |
| `transactions` | Histórico de transações de coins |
| `missions` | Missões dos usuários |
| `achievements` | Conquistas desbloqueadas |
| `leaderboard` | Ranking de jogadores |
| `player_competitive_ratings` | Ratings competitivos (Elo) |
| `competitive_rating_events` | Eventos de mudança de rating |
| `squads` | Elencos dos usuários |
| `sbc_completions` | Conclusões de SBC |

### Chaves Estrangeiras Importantes

- Todas as tabelas de usuário referenciam `auth.users(id)` ou `profiles(id)`
- `cards.user_id` → `profiles.id`
- `pool_matches.player1_id/player2_id/winner_id` → `profiles.id`
- `challenges.challenger_id/challenged_id` → `auth.users(id)`

---

## Autenticação e Sessão

O aplicativo usa o Supabase Auth para gerenciamento de sessão.

### Fluxo de Autenticação

1. Usuário faz login via `supabase.auth.signInWithPassword` ou `signInWithOAuth`
2. Sessão é armazenada no `localStorage` pelo Supabase client
3. `App.tsx` verifica a sessão no `useEffect` inicial via `supabase.auth.getSession()`
4. `onAuthStateChange` é usado para detectar login/logout em tempo real

### Proteção de Rotas

O componente `ProtectedRoute.tsx` verifica se o usuário está autenticado antes de renderizar as rotas protegidas. Usuários não autenticados são redirecionados para `/auth`.

```typescript
// Exemplo de uso
supabase.auth.getSession().then(({ data }) => {
  setAuthed(!!data.session);
});
supabase.auth.onAuthStateChange((event, session) => {
  setAuthed(!!session);
});
```

---

## Sistema de Cartas e Overall

### Estrutura de uma Carta (`PlayerCard`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `uid` | string | ID único da carta |
| `playerId` | string | ID do jogador (nome-raridade) |
| `name` | string | Nome do jogador |
| `position` | string | Posição (GK, Fixo, Ala, Pivo) |
| `rarity` | string | Comum, Incomum, Rara, Épica, Lendária, Ícone |
| `overall` | number | Overall (0-99) |
| `pace, shooting, passing, dribbling, defending, physical` | number | Atributos (0-99) |
| `reflexes, positioning, handling` | number | Apenas para GK |
| `special` | string | Nenhuma, Time da Semana, Craque da Rodada, Revelação, Lenda, Futsal |
| `edition` | string | Temporada (ex: 2025/26) |
| `image` | string | URL da imagem |
| `xp, evoPoints` | number | Experiência e pontos de evolução |
| `upgrades` | object | Upgrades aplicados por atributo |

### Cálculo do Overall

O overall é calculado com base nos atributos e na raridade:

```
baseOverall = calcularPorPosicao(atributos)
overallFinal = min(99, baseOverall + RARITY_BONUS[rarity] + SPECIAL_BONUS[special])
```

**Bônus por raridade:**
| Raridade | Multiplicador Atributos | Bônus Overall |
|----------|------------------------|---------------|
| Comum | 0.88× | -2 |
| Incomum | 1.00× | 0 |
| Rara | 1.05× | +2 |
| Épica | 1.10× | +4 |
| Lendária | 1.15× | +6 |
| Ícone | 1.20× | +8 |

**Bônus por especial:**
| Especial | Bônus |
|----------|-------|
| Nenhuma | 0 |
| Time da Semana | +2 |
| Craque da Rodada | +2 |
| Revelação | +1 |
| Lenda | +3 |
| Futsal | +2 |

### Pesos por Posição

| Posição | Atributos Principais |
|---------|---------------------|
| GK | Reflexos 30%, Posicionamento 25%, Defesa 20% |
| Fixo | Defesa 35%, Físico 20%, Passe 20% |
| Ala | Velocidade 25%, Passe 22%, Drible 20% |
| Pivo | Chute 32%, Físico 22%, Drible 18% |

---

## Sistema de Sinuca / Pool

### Fluxo de Partida

1. **Criação:** Jogador A chama `create_pool_match(p_opponent, p_stake)` → partida com status `pending`
2. **Aceitação:** Jogador B chama `accept_pool_match(p_id)` → status vira `playing`, `turn_deadline` = agora + 30s
3. **Taco:** Jogador da vez define ângulo e força, chama edge function `pool-shot`
4. **Validação:** Servidor valida turno, deadline, executa física determinística
5. **Sincronização:** Resultado é gravado em `pool_shots` e `pool_matches` é atualizado via realtime
6. **Término:** Partida vira `finished` quando alguém encaçapa a 8 corretamente ou comete falta

### Tabelas

| Tabela | Chaves Principais |
|--------|------------------|
| `pool_matches` | id, player1_id, player2_id, status, table_state, current_player, turn_deadline, winner_id, version |
| `pool_shots` | id, match_id, player_id, seq, angle, power, result, shot_id (unique) |

### Status de Partida

`pending`, `accepted`, `playing`, `finished`, `declined`, `expired`, `forfeited`, `cancelled`

### RPCs

| RPC | Params | Descrição |
|-----|--------|-----------|
| `create_pool_match` | p_opponent, p_stake | Cria partida pending |
| `accept_pool_match` | p_id | Jogador 2 aceita |
| `reject_pool_match` | p_id | Jogador 2 recusa |
| `abandon_pool_match` | p_id | Qualquer jogador cancela |

### Edge Function: `pool-shot`

Executa com `service_role`. Validações:
- Sessão válida (JWT)
- matchId é UUID válido
- angle é número finito, power entre 0 e 1
- Usuário é participante da partida
- Status é `accepted` ou `playing`
- É a vez do usuário
- turn_deadline não expirou (30s)

Executa física determinística (atrito, colisões bola-bola, colisão parede, pocket) e retorna o estado final da mesa.

### Regras de Física

- Mesa: 2.0 × 1.0 unidades
- Raio da bola: 0.025, raio do buraco: 0.045
- Atrito: 0.985 por passo
- Restituição: 0.8
- Passo fixo: 1/240 segundos
- Máximo: 2400 passos (10s)

### Faltas

- Nenhuma bola toca a borda após contato
- Bola adversária tocada primeiro (se houver bolas próprias restantes)
- Bola branca pocketed
- 8 pocketed com bolas próprias restantes (derrota imediata)

---

## Painel do Administrador

O admin (ID fixo: `35a8dc5f-c5db-4b33-9380-a32739ff6c10`) tem acesso exclusivo ao `/admin`.

### Funcionalidades

#### 1. Criar Carta no Inventário
Cria uma carta diretamente no inventário do admin com atributos, raridade e overall definidos manualmente.

#### 2. Adicionar aos Pacotes
Cria um `card_template` que será sorteado nos pacotes abertos por qualquer jogador.

#### 3. Editar Overall de Qualquer Carta
Lista todas as cartas do banco e permite alterar o overall (0-99) de qualquer carta de qualquer jogador.

#### 4. Editar Templates Base (13 Cartas)
Permite editar todos os atributos das 13 cartas base do jogo:
- Pace, Shooting, Passing, Dribbling, Defending, Physical
- Reflexes, Positioning, Handling (para GK)
- Posição, Raridade Base, Overall Base, Clube
- Preview de OVR calculado em tempo real

As mudanças são salvas via `admin_upsert_template` RPC (upsert por nome) e se aplicam a todos os jogadores.

### Tabelas Envolvidas

- `card_templates` - Templates de pacotes
- `cards` - Cartas dos usuários
- `profiles` - Verificação de admin

---

## Sistema PvP / Multijogador

### Desafios

Jogadores podem desafiar amigos para partidas de futsal. O fluxo é:

1. Desafiador cria `challenges` com status `pending`
2. Desafiado aceita ou recusa
3. Partida é simulada (não em tempo real)
4. Resultado é gravado e ratings são atualizados

### Sistema de Rating (Elo)

Cada jogador tem um `player_competitive_ratings` com:
- rating, peak_rating
- matches_played, wins, losses, draws
- current_streak, best_win_streak

### Tabelas

- `challenges` - Desafios PvP
- `player_competitive_ratings` - Ratings dos jogadores
- `competitive_rating_events` - Histórico de mudanças de rating
- `competitive_config` - Configuração do algoritmo (K-factor, thresholds)

---

## Inventário, Coleção e Mercado

### Coleção

O usuário pode visualizar todas as suas cartas, filtrar por nome, posição, raridade, clube e ordenar por overall, nome ou data.

### Conversão de Duplicatas

O usuário pode converter cartas duplicadas (mesmo nome) em moedas:
- Apenas uma cópia por nome é mantida (a melhor por raridade/overall/upgrades)
- Cartas favoritas, no elenco ou no mercado são preservadas
- Cada carta convertida rende 200 coins
- Cartas ícone (icon) não são convertidas

### Marketplace

Usuários podem listar cartas para venda com preço e opção de compra imediata (buy_now). Listagens expiram após um período.

### SBC (Squad Building Challenges)

Desafios que exigem entregar cartas específicas em troca de recompensas (pacotes ou coins).

---

## Edge Functions

### `pool-shot`

Executa física de sinuca autoritativa. Valida turno, deadline, executa física, grava tiro e atualiza partida.

### Outros RPCs (Security Definer)

| RPC | Descrição |
|-----|-----------|
| `create_card` | Cria carta no inventário (admin only) |
| `create_card_template` | Cria template para pacotes (admin only) |
| `admin_upsert_template` | Atualiza/cria template por nome (admin only) |
| `delete_owned_cards` | Deleta cartas do usuário (usado em conversão de duplicatas) |
| `add_coins` / `spend_coins` | Gerencia saldo de coins |
| `create_pool_match`, `accept_pool_match`, etc. | Gerencia partidas de sinuca |

---

## RLS e Segurança

### Políticas de RLS

| Tabela | Leitura | Escrita |
|--------|---------|---------|
| `pool_matches` | Apenas participantes | Via RPC |
| `pool_shots` | Apenas participantes | Via RPC |
| `cards` | Usuário proprietário | Via RPC |
| `challenges` | Participantes | Via RPC |
| Todas as outras | Usuário autenticado | Via RPC |

Todas as escritas diretas são revogadas para `authenticated`. Qualquer modificação deve passar por RPCs com `security definer`.

### Service Role

Edge functions usam `service_role` que tem acesso total a todas as tabelas (bypass RLS, mas precisa de grants explícitos).

---

## Realtime

As seguintes tabelas estão na publicação `supabase_realtime`:

- `pool_matches` - Sincroniza estado da mesa, turno, vencedor
- `pool_shots` - Sincroniza tacadas realizadas
- `challenges` - Sincroniza estado de desafios

Canais utilizados:
- `pool-match-${matchId}` - Sincronização de partida de sinuca
- `pool-invite-${matchId}` - Notificação de convite de sinuca
- `challenges-notify-${userId}` - Notificações de desafios PvP

---

## Deploy e Variáveis de Ambiente

### Variáveis Necessárias

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima pública do Supabase |

### Migrações Pendentes

As seguintes migrações precisam ser aplicadas no banco remoto (SQL Editor do dashboard Supabase):

1. `20261107000000_fix_create_card_template.sql` - base_overall e base_rarity
2. `20261107010000_fix_create_card_gk_playerid_image.sql` - GK, playerId, imagem
3. `20261107020000_add_nationality_age_club_to_cards.sql` - nacionalidade, idade, clube
4. `20261107030000_grant_select_card_templates.sql` - grant SELECT card_templates
5. `20261107040000_fix_create_card_template_ambiguity.sql` - remover ambiguidade
6. `20261107050000_admin_edit_card_overall.sql` - RPCs de edição de overall
7. `20261107060000_admin_upsert_template.sql` - upsert de templates
8. `20261108000000_fix_delete_owned_cards.sql` - corrigir delete de cartas

### Comando para Aplicar Migrações

No SQL Editor do Supabase (dashboard), cole o conteúdo de cada arquivo `.sql` na ordem listada acima.

---

## Checklist de Funcionalidades

- [x] Autenticação (login/logout/sessão)
- [x] Pacotes de cartas com probabilidades
- [x] Coleção e filtro de cartas
- [x] Conversão de duplicatas
- [x] Marketplace (listings)
- [x] Sistema de sinuca (8-ball) com física autoritativa
- [x] Realtime para sinuca e desafios
- [x] Painel admin (criar cartas, templates, editar overall, editar templates base)
- [x] PvP / Desafios entre amigos
- [x] Rating competitivo (Elo)
- [x] SBC (Squad Building Challenges)
- [x] Missões e conquistas

---

*Documentação gerada automaticamente. Para dúvidas, consulte o código-fonte em `src/` e `supabase/`.*
