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

O usuário pode converter cartas duplicadas (mesmo nome) em moedas (coins), com valor configurado no servidor por raridade.

### Regras

1. **Agrupamento:** Cartas são agrupadas por nome (ex: todas as cartas "Pietro Guedes" ficam no mesmo grupo)
2. **Exclusão de Ícones:** Cartas com raridade 'icon' nunca são convertidas
3. **Mínimo:** Só há conversão se houver 2+ cartas do mesmo jogador (não-ícone)
4. **Carta Mantida:** O servidor mantém a melhor cópia por raridade e overall.
5. **Cartas Protegidas:** Não são removidas se:
   - Estão marcadas como favorita
   - Estão no elenco ativo (squad)
   - Estão no elenco salvo (savedSquads)
   - Estão no marketplace com status 'active'
   - Estão ligadas a desafios, apostas ou partidas de sinuca
   - Ícones nunca são convertidos

### Fluxo de Conversão

1. Usuário clica em "Converter duplicatas"
2. Sistema identifica cartas duplicadas não-locked e não-favoritas
3. Chama o RPC `convert_duplicates`, que revalida proteções e valores no servidor
4. O servidor paga por raridade: comum 50, incomum 100, rara 250, épica 600 e lendária 1500 moedas; ícones não são convertidos
5. O RPC retorna `{ count, coins }`; o cliente atualiza o inventário e saldo a partir do servidor

### Problemas Conhecidos

| Problema | Causa | Solução |
|----------|-------|---------|
| Conversão não funciona | RPC server-side falha | A operação não concede moedas nem remove cartas quando há erro |
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
| Desafio Futsal | 1 GK, 1 Fixo, 2 Alas, 1 Pivo | position: any, count: 5 | 800 coins | Sim, até 3/dia |
| Desafio de Clube | 3 cartas do mesmo clube | count: 3, sameClub: true | 600 coins | Sim, até 3/dia |

Cartas ícone, favoritas, em elencos ativos/salvos, listagens, desafios, escrow de apostas ou partidas de sinuca são protegidas pelo servidor e não podem ser entregues.

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
- `supabase/migrations/20261115000000_authoritative_card_economy.sql` - valores e proteções server-side de conversão/SBC

---

## Problemas Conhecidos

### Conversão de Duplicatas
Se a conversão não funcionar, verificar:
1. Se há cartas com o mesmo nome (duplicatas reais)
2. Se as duplicatas não estão no elenco, mercado ou marcadas como favorita
3. Se o RPC `delete_owned_cards` está acessível (verificar migração `20261108000000_fix_delete_owned_cards.sql`)

---

*Documentação gerada em 07/11/2026.*
