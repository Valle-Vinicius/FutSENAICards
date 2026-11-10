# FutSENAI Cards - Sistema de Cartas e Overall

> Documentação técnica detalhada sobre o sistema de cartas, atributos, raridades, especiais, edições e cálculo de overall.

---

## Visão Geral

O sistema de cartas é o núcleo do FutSENAI Cards. Cada carta representa um jogador de futebol/futsal com atributos, raridade, overall e potencial de evolução.

---

## Estrutura da Carta (`PlayerCard`)

```typescript
interface PlayerCard {
  uid: string;                    // ID único (nanoid ou UUID do banco)
  playerId: string;               // ID do jogador (nome-raridade)
  name: string;                   // Nome do jogador
  position: Position;             // GK | Fixo | Ala | Pivo
  sport: string;                  // 'futsal'
  nationality: string;            // Nacionalidade
  age: number;                    // Idade
  club: string;                   // Clube
  rarity: Rarity;                 // Comum, Incomum, Rara, Épica, Lendária, Ícone
  edition: string;                // Temporada (ex: '2025/26')
  special: Special;               // Nenhuma, Time da Semana, etc.
  overall: number;                // Overall (0-99)
  pace: number;                   // Velocidade (0-99)
  shooting: number;               // Chute (0-99)
  passing: number;                // Passe (0-99)
  dribbling: number;              // Drible (0-99)
  defending: number;              // Defesa (0-99)
  physical: number;               // Físico (0-99)
  reflexes?: number;              // Apenas GK
  positioning?: number;           // Apenas GK
  handling?: number;              // Apenas GK
  image?: string;                 // URL da imagem
  xp: number;                     // Experiência
  evoPoints: number;              // Pontos de evolução
  upgrades: { pace, shooting, passing, dribbling, defending, physical }; // Upgrades por atributo (máx 10 cada, 15 total)
  evolutionLog: any[];            // Histórico de evoluções
  seasonStats: { matches, goals, assists };
  favorite: boolean;              // Favorita (não pode ser convertida)
  isNew: boolean;                 // Nunca visualizada
  custom?: boolean;               // Criada pelo admin (não é sobrescrita pelo init)
  obtainedAt: number;             // Timestamp de obtenção
  schemaVersion?: number;         // Versão do esquema (4 = atual)
}
```

---

## Raridades

### Definição

| Raridade | Label | Multiplicador Atributos | Bônus Overall | Min OVR | Max OVR |
|----------|-------|------------------------|---------------|---------|---------|
| common | Comum | 0.88× | -2 | 50 | 69 |
| uncommon | Incomum | 1.00× | 0 | 60 | 74 |
| rare | Rara | 1.05× | +2 | 70 | 79 |
| epic | Épica | 1.10× | +4 | 80 | 87 |
| legendary | Lendária | 1.15× | +6 | 88 | 94 |
| icon | Ícone | 1.20× | +8 | 95 | 99 |

### Validação

A função `validateRarityOverall(rarity, overall)` verifica se o overall está dentro da banda permitida para a raridade. No admin, isso gera um aviso (toast) mas não bloqueia o salvamento, pois o catálogo existente pode ter cartas fora da banda.

---

## Especiais (Special)

| Especial | Label | Bônus Overall |
|----------|-------|---------------|
| none | Nenhuma | 0 |
| totw | Time da Semana | +2 |
| potm | Craque da Rodada | +2 |
| revelation | Revelação | +1 |
| legend | Lenda | +3 |
| futsal | Futsal | +2 |

---

## Edições

| Edição | Label |
|--------|-------|
| none | Sem edição |
| totw | Time da Semana |
| potm | Craque da Rodada |

Nota: As edições totw e potm também existem como especiais. No admin de inventário, a edição é fixada em '2025/26' (temporada atual) e o especial é selecionado separadamente.

---

## Cálculo do Overall

O OVR final segue esta regra:

```
OVR final = limitar(OVR base + bônus de raridade + bônus especial, 0, 99)
```

O OVR base vem de `baseOverall` quando esse valor existe no template; caso contrário, é calculado com os atributos ponderados pela posição. O multiplicador de raridade ajusta os atributos gravados na carta, mas, na abertura de pacotes, não recalcula o OVR base: a raridade contribui por meio de um bônus fixo.

`calculateOverall` e `overallFromAttributes` usam estes pesos:

- **GK:** reflexos 30%, posicionamento 25%, defesa 20%, passe 10%, físico 10%, velocidade 5%
- **Fixo:** defesa 35%, físico 20%, passe 20%, velocidade 10%, drible 8%, chute 7%
- **Ala:** velocidade 25%, passe 22%, drible 20%, chute 13%, defesa 12%, físico 8%
- **Pivo:** chute 32%, físico 22%, drible 18%, passe 12%, velocidade 10%, defesa 6%

O resultado posicional é arredondado para inteiro. Para GK, Defesa de Bola (`handling`) não participa da fórmula; Reflexos e Posicionamento são atributos específicos usados no cálculo.

### Geração de carta

```typescript
generatePlayerCard(t: PlayerTemplate, rarity: Rarity, special?: string, baseOverall?: number): PlayerCard
```

1. Aplica o multiplicador da raridade a cada atributo, arredondando e limitando cada um a 0–99.
2. Resolve o OVR base pela seguinte prioridade: argumento `baseOverall`, `t.baseOverall` e, por fim, `calculateOverall(t)`.
3. Soma ao OVR base os bônus fixos de raridade e especial, limitando o resultado final a 0–99.
4. Gera `uid` via nanoid e `playerId` como `nome-sem-espacos-raridade`.

No fluxo de pacotes usado atualmente, a geração e o cálculo são executados pelo RPC `open_pack` no Supabase. O servidor usa `base_overall` quando preenchido ou calcula o valor pelos atributos base; em seguida soma os bônus de raridade e especial. O multiplicador da raridade ajusta os atributos retornados, independentemente do cálculo do OVR.

No Admin, o cálculo automático fixa a raridade em Incomum. Para cartas no Inventário, o OVR é calculado a partir dos atributos ajustados pela raridade; para templates de Pacotes, o OVR calculado pelos atributos sem multiplicador é salvo como OVR base. O modo manual salva o OVR digitado.

Para as fórmulas completas, exemplos e diferenças entre os fluxos, consulte [Relatório de cálculo do Overall](./SISTEMA_OVERALL.md).

---

## Templates de Cartas

### Templates Estáticos (`TEMPLATES`)

Definidos em `src/data/players.ts`. São 13 cartas base com atributos pré-definidos.

### Templates do Banco (`card_templates`)

Criados pelo admin via `create_card_template` ou `admin_upsert_template`. Sobrescrevem templates estáticos de mesmo nome quando carregados via `loadDbTemplates()`.

### Função `allTemplates()`

Retorna `[...TEMPLATES, ...dbTemplates]`. Templates do banco têm prioridade sobre estáticos de mesmo nome.

---

## Evolução de Cartas

### Sistema de Upgrades

O usuário pode gastar `evoPoints` para melhorar atributos individuais:

- Cada atributo: máximo 10 upgrades (0-99)
- Total: máximo 15 upgrades por carta
- Custo: 1 evoPoint por upgrade
- Ganho: +1 no atributo selecionado

Após cada upgrade, a variação do OVR é calculada pela diferença entre os OVRs posicionais antes e depois do aumento de atributo. Essa diferença é somada ao OVR atual, preservando bônus de raridade/especial, e o resultado é limitado a 99:

```
delta = overallFromAttributes(atributosApós) - overallFromAttributes(atributosAntes)
newOverall = min(99, overallAtual + delta)
```

### Log de Evolução

Cada upgrade é registrado em `evolutionLog` com:
- Atributo melhorado
- Timestamp da evolução

---

## Geração de Cartas nos Pacotes

### Fluxo `openPack`

1. Sorteia raridade baseado nas probabilidades do pacote
2. Sorteia especial (15% chance de ser especial)
3. Sorteia template de `allTemplates()` (filtra por posição se o pacote for específico)
4. Chama `generatePlayerCard(t, rarity, special, t.baseRarity, t.baseOverall)`
5. Adiciona cartas ao estado local e sincroniza com Supabase

### Probabilidades de Raridade

Definidas em `DEFAULT_PACKS`. Cada pacote tem suas próprias probabilidades para common, uncommon, rare, epic, legendary, icon.

---

## Problemas Conhecidos e Correções

### 1. Reflexo de Goleiro = 0
**Problema:** `attrs.reflexes ? ...` é falso quando valor é 0, caindo nos defaults de 50.
**Correção:** Usar `attrs.reflexes !== undefined && !== null`.

### 2. playerId com Espaços
**Problema:** SQL gerava `lower(name)-rarity` mantendo espaços, cliente usava hífens.
**Correção:** `replace(lower(p_name), ' ', '-') || '-' || p_rarity`.

### 3. Imagem Vazia Vira Nome
**Problema:** `coalesce(p_image, p_name)` gravava o nome em `image`.
**Correção:** Usar `p_image` diretamente (pode ser null).

### 4. Raridade Fixada em Incomum
**Problema:** `base_raria` era hardcoded em 'uncommon' no `loadDbTemplates`.
**Correção:** Usar `t.base_rarity` do banco.

### 5. Double-Counting de Mod de Raridade
**Problema:** `generatePlayerCard` aplicava `applyMod` nos atributos E somava bônus de rarity duas vezes.
**Correção:** Passar atributos crus para `calcOverall`; aplicar `applyMod` apenas para exibição/armazenamento.

### 6. Edição de Template por Nome
**Problema:** Não havia forma de atualizar template existente.
**Correção:** Criado `admin_upsert_template` com `ON CONFLICT (name) DO UPDATE`.

### 7. Permissão de `delete_owned_cards`
**Problema:** `id = any(p_card_ids)` falhava porque `id` é uuid e `p_card_ids` é text[].
**Correção:** Usar `id::text = any(p_card_ids)`.

---

## Arquivos Relevantes

- `src/data/players.ts` - Templates, RARITY_MODIFIER, calculateOverall, generatePlayerCard
- `src/lib/game.ts` - validateRarityOverall, rollRarity, DEFAULT_PACKS
- `src/types.ts` - Tipos PlayerCard, Rarity, RARITY_META, SPECIAL_META
- `src/store/useGame.ts` - openPack, upgradePlayer, convertDuplicates, seedCards
- `src/lib/services/cards.ts` - getCards, addCard, updateCard, deleteCard
- `supabase/migrations/20261106050000_admin_create_card.sql` - RPC create_card
- `supabase/migrations/20261107000000_fix_create_card_template.sql` - base_overall/base_rarity
- `supabase/migrations/20261107060000_admin_upsert_template.sql` - upsert de templates

---

*Documentação gerada em 07/11/2026. Para dúvidas, consulte o código-fonte.*
