# FutSENAI Cards - Painel do Administrador

> Documentação técnica do painel de administração (`/admin`), incluindo criação de cartas, templates de pacotes, edição de overall e edição de templates base.

---

## Visão Geral

O painel de administração (`/admin`) é acessível apenas pelo usuário com ID `35a8dc5f-c5db-4b33-9380-a32739ff6c10`. Ele permite gerenciar cartas, templates de pacotes e editar atributos de qualquer carta no banco.

---

## Acesso

O componente `Admin.tsx` verifica se o `userId` do Supabase Auth corresponde ao `ADMIN_USER_ID` (`35a8dc5f-c5db-4b33-9380-a32739ff6c10`). Usuários não autorizados veem uma mensagem de "Acesso restrito".

---

## Seções do Painel

### 1. Criar Carta

Permite criar uma carta de duas formas:

#### Modo Inventário
Cria uma carta diretamente no inventário do admin via RPC `create_card`.

Campos:
- Nome do jogador
- URL da imagem
- Posição (GK, Fixo, Ala, Pivo)
- Raridade (Comum, Incomum, Rara, Épica, Lendária, Ícone)
- Overall (base)
- Atributos: Velocidade, Chute, Passe, Drible, Defesa, Físico
- (Se GK) Reflexos, Posicionamento, Defesa de Bola
- Edição (sempre '2025/26' no inventário)
- Modo: Calcular OVR automaticamente (usa atributos × raridade) ou Manual

Ao ativar o cálculo automático, a raridade da carta no Inventário — ou a raridade base no modo Pacotes — volta para **Incomum** como padrão. No Inventário, a raridade fica bloqueada enquanto o cálculo automático estiver ativo. O título especial não é escolhido no formulário; nos pacotes, ele é definido pelo sorteio da abertura.

#### Modo Pacotes
Cria um template que será sorteado nos pacotes abertos por qualquer jogador via RPC `create_card_template`.

Campos adicionais:
- Raridade Base (raridade usada como base nos pacotes)
- Overall Base (overall usado nos pacotes)

**Nota:** No modo pacotes, edição e título especial não são definidos pelo template; a temporada é fixa e o título especial é sorteado ao abrir o pacote.

---

### 2. Editar Overall das Cartas

Lista **todas** as cartas do banco de dados e permite editar o overall de qualquer uma.

Funcionamento:
1. Clique em "Atualizar lista" para carregar todas as cartas via RPC `admin_get_all_cards`
2. Clique em "Editar" na carta desejada
3. Digite o novo overall (0-99)
4. Clique em "OK" para salvar via RPC `admin_update_card_overall`

**Validação:** O overall deve estar entre 0 e 99. O RPC retorna erro se estiver fora desse intervalo.

---

### 3. Editar Cartas do Jogo (Templates Base)

Lista as **13 cartas base** do jogo (templates estáticos em `src/data/players.ts`) e permite editar todos os atributos de cada uma.

Funcionamento:
1. Clique em "Editar" em qualquer carta
2. Modifique os atributos desejados
3. O OVR é recalculado em tempo real
4. Clique em "Salvar Template" para salvar via RPC `admin_upsert_template`

**Campos editáveis:**
- Nome, Posição, Nacionalidade, Idade, Clube
- Velocidade, Chute, Passe, Drible, Defesa, Físico
- (Se GK) Reflexos, Posicionamento, Defesa de Bola
- Imagem URL
- Raridade Base
- Overall Base
- Especial

**Preview de OVR:** Calculado em tempo real usando `calcOverallLocal()` com os atributos atuais e a raridade/baseOverall selecionadas.

---

## RPCs do Admin

### `create_card`

Cria uma carta no inventário do admin:
- Params: p_name, p_position, p_rarity, p_overall, p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical, p_reflexes, p_positioning, p_handling, p_edition, p_special, p_image, p_nationality, p_age, p_club
- Retorna: uuid (id da carta criada)
- Segurança: security definer, apenas admin (user_id = 35a8dc5f-...)

### `create_card_template`

Cria um template para pacotes:
- Params: p_name, p_position, p_nationality, p_age, p_club, p_pace, p_shooting, p_passing, p_dribbling, p_defending, p_physical, p_reflexes, p_positioning, p_handling, p_image, p_special, p_base_rarity, p_base_overall
- Retorna: uuid (id do template)
- Segurança: security definer, apenas admin

### `admin_upsert_template`

Cria ou atualiza um template por nome (upsert):
- Params: Mesmo que `create_card_template`
- Retorna: uuid (id do template)
- Segurança: security definer, apenas admin
- Usa `ON CONFLICT (name) DO UPDATE` para atualizar se já existir

### `admin_get_all_cards`

Retorna todas as cartas do banco:
- Params: Nenhum
- Retorna: setof public.cards (todas as colunas)
- Segurança: security definer, apenas admin

### `admin_update_card_overall`

Atualiza o overall de uma carta específica:
- Params: p_card_id (uuid), p_overall (integer)
- Retorna: boolean
- Valida: overall entre 0 e 99
- Segurança: security definer, apenas admin

---

## Fluxo de Edição de Template

1. Admin clica em "Editar" em um template (ex: Pietro Guedes)
2. `loadTemplateAttrs(t)` carrega os atributos atuais do template no estado
3. Admin modifica os atributos desejados
4. `calcTemplateOverall()` recalcula o OVR em tempo real
5. Admin clica em "Salvar Template"
6. `handleSaveTemplate()` chama `admin_upsert_template` com todos os parâmetros
7. O template é atualizado no banco
8. Mensagem de sucesso: "Template atualizado! Recarregue a página para ver as mudanças."

---

## Regras de Negócio

### Cartas Customizadas
Cartas criadas pelo admin no modo Inventário são marcadas com `custom: true`. A função `init()` do Zustand **não sobrescreve** essas cartas quando o nome coincide com um template estático.

### Templates do Banco
Templates criados/atualizados pelo admin são salvos na tabela `card_templates`. Quando o app carrega via `loadDbTemplates()`, esses templates substituem os estáticos de mesmo nome em `allTemplates()`.

### Validação de Overall
A função `validateRarityOverall(rarity, overall)` verifica se o overall está dentro da banda típica para a raridade. No admin, isso gera um aviso (toast warning) mas **não bloqueia** o salvamento, pois o catálogo existente pode ter cartas fora da banda.

---

## Arquivos Relevantes

- `src/pages/Admin.tsx` - Interface completa do admin
- `src/data/players.ts` - Templates estáticos (TEMPLATES), calculateOverall, generatePlayerCard
- `src/lib/game.ts` - validateRarityOverall, DEFAULT_PACKS
- `src/store/useGame.ts` - addLocalCard, syncUserData, init (pula cartas customizadas)
- `src/lib/services/cards.ts` - addCard, getCards
- `supabase/migrations/20261106050000_admin_create_card.sql` - RPC create_card
- `supabase/migrations/20261107000000_fix_create_card_template.sql` - base_overall/base_rarity
- `supabase/migrations/20261107060000_admin_upsert_template.sql` - upsert por nome

---

## Problemas Conhecidos e Correções

| Problema | Correção |
|----------|----------|
| Reflexo de GK = 0 caía em default 50 | Usar `!== undefined && !== null` |
| playerId com espaços | `replace(lower(name), ' ', '-')` |
| Imagem vazia vira nome | Usar `p_image` diretamente |
| Double-counting de mod de raridade | Passar atributos crus para calcOverall |
| Sem edição de template existente | Criado `admin_upsert_template` com ON CONFLICT |
| delete_owned_cards falhava (uuid=text) | Corrigido para `id::text = any(p_card_ids)` |

---

*Documentação gerada em 07/11/2026.*
