# FutSENAI Cards - Inventário, Coleção e Mercado

> Documentação sobre o sistema de coleção de cartas, inventário, marketplace, conversão de duplicatas e SBC.

---

## Visão Geral

O sistema de inventário gerencia as cartas dos usuários, permitindo visualização, filtragem, conversão de duplicatas e negociação no marketplace.

---

## Coleção de Cartas

### Exibição

A página `/collection` exibe todas as cartas do usuário em uma grade responsiva:
- 5 colunas em telas grandes
- 4 colunas em telas médias
- 3 colunas em telas pequenas
- 2 colunas em telas muito pequenas

Cada carta exibe:
- Imagem do jogador
- Nome, posição, clube
- Overall (número grande no centro)
- Atributos (VEL, CHU, PAS, DRI, DEF, FÍS - ou REF, POS, HAN para GK)
- Raridade (badge colorido)
- Especial (se houver)
- Marca "NOVA" se nunca visualizada
- Estrela se favorita

### Filtros Disponíveis

| Filtro | Descrição |
|--------|-----------|
| Nome | Busca textual pelo nome do jogador |
| Posição | GK, Fixo, Ala, Pivo |
| Raridade | Comum, Incomum, Rara, Épica, Lendária, Ícone |
| Clube | Filtrar por clube do jogador |
| Ordenação | Overall, Nome, Data |

### Visualização em Álbum

O botão "Álbum" alterna para uma visualização que mostra todos os templates do jogo (não apenas as cartas do usuário). Cartas que o usuário possui são mostradas normalmente; cartas não possuídas mostram um ícone de bloqueio.

---

## Conversão de Duplicatas

### Funcionamento

O usuário pode converter cartas duplicadas (mesmo nome) em moedas (coins). A cada carta convertida, rende 200 coins.

### Regras

1. **Agrupamento:** Cartas são agrupadas por nome (ex: todas as cartas "Pietro Guedes" ficam no mesmo grupo)
2. **Exclusão de Ícones:** Cartas com raridade 'icon' nunca são convertidas
3. **Mínimo:** Só há conversão se houver 2+ cartas do mesmo jogador (não-ícone)
4. **Carta Mantida:** A melhor cópia é mantida com base em:
   - Raridade (maior prioridade)
   - Overall
   - Upgrades + XP
5. **Cartas Protegidas:** Não são removidas se:
   - Estão marcadas como favorita
   - Estão no elenco ativo (squad)
   - Estão no elenco salvo (savedSquads)
   - Estão no marketplace com status 'active'

### Fluxo de Conversão

1. Usuário clica em "Converter duplicatas"
2. Sistema identifica cartas duplicadas não-locked e não-favoritas
3. Chama RPC `delete_owned_cards` para remover do servidor
4. Se o RPC falhar, a conversão é cancelada (sem moedas de graça)
5. Se o RPC tiver sucesso:
   - Adiciona coins: `quantidade × 200`
   - Remove cartas do estado local
   - Atualiza ranking do colecionador
6. Retorna o número de cartas convertidas

### Problemas Conhecidos

| Problema | Causa | Solução |
|----------|-------|---------|
| Conversão não funciona | `delete_owned_cards` falhava por `uuid = text` | Corrigido para `id::text = any(p_card_ids)` |
| Conversão retorna 0 | Todas as duplicatas estão lockadas ou favoritas | Remover do elenco/mercado ou desfavoritar |
| Cartas duplicadas não aparecem | Cartas têm nomes diferentes (ex: com/sem sobrenome) | Verificar se os nomes são exatamente iguais |

---

## Marketplace

### Listagens

Usuários podem colocar cartas à venda no marketplace:

| Campo | Descrição |
|-------|-----------|
| `cardUid` | UID da carta sendo vendida |
| `sellerId` | ID do vendedor |
| `price` | Preço em coins |
| `buyNow` | Preço de compra imediata |
| `expires_at` | Data de expiração |
| `status` | 'active', 'completed', 'cancelled' |

### Funcionalidades

- Listar carta para venda
- Comprar carta por preço fixo
- Cancelar listagem ativa
- Visualizar listagens ativas de outros usuários

### Restrições

- Apenas o vendedor pode cancelar sua listagem
- Apenas o comprador pode comprar
- Listagens expiradas não são mais válidas

---

## SBC (Squad Building Challenges)

### Visão Geral

SBCs são desafios que exigem entregar cartas específicas em troca de recompensas.

### SBCs Disponíveis

| SBC | Descrição | Requisitos | Recompensa | Repetível |
|-----|-----------|------------|------------|-----------|
| Desafio Ouro | 5 cartas com overall mínimo 75 | minOverall: 75, count: 5 | Pacote Ouro | Não |
| Desafio Futsal | 1 GK, 1 Fixo, 2 Alas, 1 Pivo | position: any, count: 5 | 2000 coins | Sim |
| Desafio de Clube | 3 cartas do mesmo clube | count: 3, sameClub: true | Pacote Prata | Sim |

### Fluxo de Conclusão

1. Usuário seleciona cartas do seu inventário
2. Sistema valida se atendem aos requisitos
3. Cartas são removidas do inventário
4. SBC é marcado como completado (`sbc_completions`)
5. Recompensa é concedida (pacote ou coins)
6. Ranking do colecionador é atualizado

---

## Arquivos Relevantes

- `src/pages/Collection.tsx` - Página de coleção com filtros
- `src/pages/CardDetail.tsx` - Detalhe de uma carta
- `src/pages/Marketplace.tsx` - Marketplace de cartas
- `src/pages/SBC.tsx` - SBCs disponíveis
- `src/store/useGame.ts` - convertDuplicates, completeSBC, addCard, addCoins
- `src/lib/services/cards.ts` - getCards, addCard, updateCard, deleteCard
- `src/lib/services/marketplace.ts` - getListings, createListing, cancelListing
- `src/lib/services/sbc.ts` - recordSBCCompletion
- `supabase/migrations/20261106010000_secure_rpcs.sql` - delete_owned_cards RPC

---

## Problemas Conhecidos

### Conversão de Duplicatas
Se a conversão não funcionar, verificar:
1. Se há cartas com o mesmo nome (duplicatas reais)
2. Se as duplicatas não estão no elenco, mercado ou marcadas como favorita
3. Se o RPC `delete_owned_cards` está acessível (verificar migração `20261108000000_fix_delete_owned_cards.sql`)

---

*Documentação gerada em 07/11/2026.*
