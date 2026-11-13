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
Cria uma carta nova diretamente no inventário do admin via RPC `create_card`. O jogador, a idade, a imagem e os atributos são preenchidos para essa carta. A nacionalidade é fixa em `Brasil`; o time é sorteado da lista de clubes já usados pelos templates para manter os valores padronizados no filtro da coleção.

Campos:
- Nome do jogador
- URL da imagem
- Idade
- Nacionalidade fixa: Brasil
- Clube (sorteado automaticamente entre os times existentes)
- Posição (GK, Fixo, Ala, Pivo)
- Raridade (Comum, Incomum, Rara, Épica, Lendária, Ícone)
- Overall
- Atributos: Velocidade, Chute, Passe, Drible, Defesa, Físico
- (Se GK) Reflexos, Posicionamento, Defesa de Bola
- Edição (sempre `2025/26`)
- Modo: Calcular OVR automaticamente (usa atributos × raridade) ou Manual

Ao ativar o cálculo automático, a raridade (ou raridade base no modo Pacotes) volta para **Incomum** e fica bloqueada enquanto o cálculo automático estiver ativo. O título especial não é escolhido no formulário; nos pacotes, ele é definido pelo sorteio da abertura. A coleção filtra por clube usando o valor salvo na carta, por isso o clube é sorteado da lista padronizada.

#### Modo Pacotes
Cria um template que será sorteado nos pacotes abertos por qualquer jogador via RPC `create_card_template`.

Campos adicionais:
- Raridade Base (raridade usada como base nos pacotes)
- Overall Base (overall usado nos pacotes)
- Destino: pacotes normais ou exclusivamente o **Pacote Off-Sale (zoeira)**

**Nota:** No modo pacotes, edição e título especial não são definidos pelo template; a temporada é fixa e o título especial é sorteado ao abrir o pacote. A nacionalidade continua fixa em `Brasil` e o clube é sorteado entre os times existentes.

Templates marcados como exclusivos do Off-Sale são gravados com `pack_group = 'off_sale'`. A RPC de abertura filtra esse grupo no servidor, impedindo que apareçam nos pacotes normais. Templates existentes e criados para pacotes normais permanecem no grupo `standard`.

Ao escolher **Somente Pacote Off-Sale (zoeira)**, o admin também pode cadastrar até 10 estatísticas extras, com rótulos de até 30 caracteres e valores inteiros de 0 a 999. Valores acima de 99 usam o destaque colorido das estatísticas de Ícone. Elas aparecem junto aos atributos no detalhe da carta, mas não participam do OVR nem das melhorias de atributos.

---

### 2. Editar Overall das Cartas

O painel não oferece edição de OVR de cartas já pertencentes ao inventário. O OVR base continua editável na seção de templates.

---

### 3. Editar Cartas do Jogo (Templates Base)

Lista os templates base do jogo (templates estáticos em `src/data/players.ts` e templates sincronizados com o banco) e permite editar seus atributos e OVR base.

Funcionamento:
1. Clique em "Editar" em qualquer carta
2. O template é carregado no mesmo formulário de criação, incluindo informações básicas, imagem, posição, raridade, atributos, destino do pacote e estatísticas extras Off-Sale
3. Modifique os campos; o OVR é calculado em tempo real quando essa opção está ativa
4. Clique em "Salvar alterações" para validar e salvar pelo RPC `admin_save_template`

**Campos editáveis:**
- Posição, Nacionalidade, Idade, Clube e Imagem URL (o nome é a chave do template e não pode ser alterado)
- Velocidade, Chute, Passe, Drible, Defesa, Físico
- (Se GK) Reflexos, Posicionamento, Defesa de Bola
- Raridade Base
- Overall Base
- Destino (pacote normal ou Off-Sale)
- (Se Off-Sale) até 10 estatísticas extras, com valores entre 0 e 999

**Preview de OVR:** Calculado em tempo real usando `calcOverallLocal()` com os atributos atuais e a raridade/baseOverall selecionadas.

Para as fórmulas por posição, bônus de raridade/especial e diferenças entre cálculo automático, OVR manual e geração por pacote, consulte [Relatório de cálculo do Overall](./SISTEMA_OVERALL.md).

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

### `admin_create_pack_template`

Cria um template e o associa a um grupo de pacotes:
- Params: mesmos campos de `create_card_template`, mais `p_pack_group` (`standard` ou `off_sale`) e `p_extra_stats` (lista de `{ label, value }`)
- Retorna: uuid (id do template)
- Segurança: security definer, apenas admin

### `admin_save_template`

Atualiza um template por nome e sincroniza o grupo de pacote e as estatísticas extras:
- Params: dados de template, `p_pack_group` (`standard` ou `off_sale`) e `p_extra_stats`
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
2. Os valores do template são carregados no formulário de criação
3. Admin modifica os campos e o destino; as validações são as mesmas da criação
4. Admin clica em "Salvar alterações"
5. O formulário chama `admin_save_template` e atualiza também o grupo e as estatísticas extras
6. Mensagem de sucesso: "Template atualizado com sucesso!"

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
- `supabase/migrations/20261112180000_off_sale_pack.sql` - grupo exclusivo do Pacote Off-Sale e filtro server-side
- `supabase/migrations/20261112200000_off_sale_extra_stats.sql` - estatísticas extras, editor de templates, marcação das cartas Off-Sale e bloqueio no X1

---

## Problemas Conhecidos e Correções

| Problema | Correção |
|----------|----------|
| Reflexo de GK = 0 caía em default 50 | Usar `!== undefined && !== null` |
| playerId com espaços | `replace(lower(name), ' ', '-')` |
| Imagem vazia vira nome | Usar `p_image` diretamente |
| Double-counting de mod de raridade | Passar atributos crus para calcOverall |
| Edição de template diferente do formulário de criação | Edição agora carrega e reutiliza o formulário completo |
| delete_owned_cards falhava (uuid=text) | Corrigido para `id::text = any(p_card_ids)` |

---

*Documentação gerada em 07/11/2026.*
