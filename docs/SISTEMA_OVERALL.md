# Relatório: cálculo do Overall (OVR)

> Guia técnico do cálculo de OVR no FutSENAI Cards. Descreve as fórmulas e os fluxos usados pelo jogo e pelo painel Admin.

## Resumo

O OVR final de uma carta é formado por:

```text
OVR final = limitar(OVR base + bônus de raridade + bônus especial, 0, 99)
```

O OVR base pode vir de um valor salvo no template ou ser calculado a partir dos atributos e da posição. Nos pacotes, o multiplicador de raridade altera os atributos gravados na carta, mas o OVR é calculado separadamente: o sistema soma bônus fixos de raridade e especial ao OVR base.

## OVR calculado pelos atributos

Quando não existe um `baseOverall` definido, o sistema calcula uma soma ponderada dos atributos, de acordo com a posição. O resultado é arredondado para o inteiro mais próximo.

| Posição | Fórmula do OVR base |
|---|---|
| Goleiro (`GK`) | Reflexos × 30% + Posicionamento × 25% + Defesa × 20% + Passe × 10% + Físico × 10% + Velocidade × 5% |
| Fixo | Defesa × 35% + Físico × 20% + Passe × 20% + Velocidade × 10% + Drible × 8% + Chute × 7% |
| Ala | Velocidade × 25% + Passe × 22% + Drible × 20% + Chute × 13% + Defesa × 12% + Físico × 8% |
| Pivô (`Pivo`) | Chute × 32% + Físico × 22% + Drible × 18% + Passe × 12% + Velocidade × 10% + Defesa × 6% |

Para goleiros, o cálculo usa Reflexos e Posicionamento; não usa o atributo de Defesa de Bola (`handling`) no OVR base. Se os atributos específicos de goleiro não estiverem disponíveis no cálculo do cliente, Reflexos, Posicionamento e Defesa de Bola assumem 50; somente os dois primeiros entram na fórmula.

### Exemplo: Ala

Para um Ala com Velocidade 80, Passe 70, Drible 75, Chute 60, Defesa 50 e Físico 65:

```text
80 × 0,25 + 70 × 0,22 + 75 × 0,20 + 60 × 0,13 + 50 × 0,12 + 65 × 0,08
= 69,4
OVR base = 69
```

## Bônus de raridade e especial

O bônus é somado ao OVR base. O resultado final é limitado ao intervalo de 0 a 99.

| Raridade | Multiplicador dos atributos | Bônus de OVR |
|---|---:|---:|
| Comum (`common`) | 0,88× | -2 |
| Incomum (`uncommon`) | 1,00× | 0 |
| Rara (`rare`) | 1,05× | +2 |
| Épica (`epic`) | 1,10× | +4 |
| Lendária (`legendary`) | 1,15× | +6 |
| Ícone (`icon`) | 1,20× | +8 |

| Especial | Bônus de OVR |
|---|---:|
| Nenhum (`none`) | 0 |
| Time da Semana (`totw`) | +2 |
| Craque da Rodada (`potm`) | +2 |
| Revelação (`revelation`) | +1 |
| Lenda (`legend`) | +3 |
| Futsal (`futsal`) | +2 |

O multiplicador de raridade é aplicado a cada atributo e o valor é arredondado e limitado a 0–99. Esse ajuste dos atributos **não é aplicado novamente ao OVR base** durante a geração dos pacotes; o efeito da raridade no OVR acontece pelo bônus fixo da tabela.

### Exemplo completo

Usando o Ala do exemplo anterior:

```text
OVR base: 69
Raridade Épica: +4
Especial Time da Semana: +2
OVR final: 69 + 4 + 2 = 75
```

Os atributos exibidos nessa carta são multiplicados por 1,10 e arredondados individualmente, sem recalcular o OVR 75 a partir desses novos valores.

## De onde vem o OVR base

1. **Template com `baseOverall`:** esse valor é a referência do OVR base; ele prevalece sobre o cálculo pelos atributos.
2. **Template sem `baseOverall`:** o sistema calcula o OVR base pela fórmula da posição.
3. **Carta criada manualmente no Admin:** o OVR informado é salvo como digitado. O aviso sobre a faixa típica da raridade não bloqueia a criação.
4. **Carta criada no Admin com cálculo automático:** o OVR é calculado pelos atributos e posição. O modo fixa a raridade em Incomum, cujo multiplicador é 1,00× e cujo bônus de OVR é zero. No modo Inventário, o Admin envia os atributos já ajustados pelo multiplicador selecionado.
5. **Template criado no Admin com cálculo automático:** o OVR calculado é salvo como OVR base do template, usando os atributos sem multiplicador de raridade.

O modo automático do template é persistido em `card_templates.auto_calculate_overall`. Ao editar um template, o checkbox é carregado com esse valor. Templates antigos sem o indicador são considerados automáticos quando o OVR base coincide com a fórmula posicional (ou quando o OVR base está ausente). Ao salvar mudanças no template, as cartas existentes de mesmo nome recebem os novos dados; o OVR é recalculado com o OVR base escolhido, os bônus de raridade/especial e o delta das evoluções da carta.

Ao abrir pacotes, o servidor usa `base_overall` do template, quando preenchido; se estiver nulo, aplica a fórmula posicional aos atributos base. Depois soma os bônus da raridade sorteada e do especial sorteado ou configurado no template.

## Evolução de atributos

Ao comprar um upgrade, o jogo calcula a diferença entre o OVR posicional antes e depois do aumento de um ponto no atributo:

```text
variação = OVR calculado(após upgrade) - OVR calculado(antes do upgrade)
novo OVR = min(99, OVR atual da carta + variação)
```

Esse método preserva no OVR atual o efeito que já existia de raridade e especial. Como cada cálculo posicional é arredondado, alguns aumentos de atributo podem não alterar imediatamente o OVR; um upgrade também pode aumentar o OVR em mais de um ponto dependendo do peso e do arredondamento.

## Faixas de raridade

As faixas são usadas para validação e avisos no Admin; não substituem a fórmula nem impedem salvar uma carta fora da faixa.

| Raridade | OVR mínimo | OVR máximo |
|---|---:|---:|
| Comum | 50 | 69 |
| Incomum | 60 | 74 |
| Rara | 70 | 79 |
| Épica | 80 | 87 |
| Lendária | 88 | 94 |
| Ícone | 95 | 99 |

## Código relacionado

- `src/data/players.ts`: pesos por posição, multiplicadores e bônus, `calculateOverall`, `generatePlayerCard`.
- `src/pages/Admin.tsx`: cálculo automático e envio de OVR/atributos na criação de cartas e templates.
- `src/store/useGame.ts`: aplicação de bônus incremental de OVR ao evoluir atributos.
- `supabase/migrations/20261109220000_fix_admin_cards_and_pack_opening.sql`: cálculo do OVR na abertura de pacotes no servidor.

Consulte também [Sistema de Cartas](./SISTEMA_CARTAS.md) e [Sistema Admin](./SISTEMA_ADMIN.md).
