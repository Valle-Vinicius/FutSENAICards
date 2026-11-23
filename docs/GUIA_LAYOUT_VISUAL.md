# Guia de adoção do novo layout FUTSENAI

**Atualizado em:** 20/11/2026

Este documento registra o padrão visual em adoção, o estado atual das rotas e os cuidados para continuar a migração sem duplicar navegação nem alterar regras de negócio.

## Objetivo e princípios

- Usar uma **topbar global** no lugar da sidebar nas páginas migradas.
- Manter a identidade FUTSENAI: vermelho `#e30613`, fundo claro `#f5f5f7`, branco e texto escuro `#171717`.
- Construir cada página em torno de sua função — não transformar tudo em dashboard genérico.
- Reutilizar dados, hooks, ações e componentes existentes. Uma mudança visual não deve alterar APIs, banco, autenticação, sorteios ou regras de negócio.
- Não criar uma segunda topbar dentro de uma página. O shell global pertence a `src/components/Layout.tsx`.
- Manter responsividade, foco visível e movimento reduzido; não cortar conteúdo nem criar rolagem horizontal.

## Páginas já migradas

Estas rotas usam a topbar da Home e já receberam uma apresentação alinhada ao novo padrão:

| Página | Rota | Implementação |
| --- | --- | --- |
| [Visão geral](../src/pages/Home.tsx) | `/` | Hero editorial com o Mateus, resumo do clube, destaques, pendências, atalhos, missões e notícias. |
| [Loja de pacotes](../src/pages/Packs.tsx) | `/packs` | Seções Clássicos, Especiais e Eventos, artes existentes, preços e probabilidades atuais. |
| [Abertura/revelação](../src/pages/OpenPack.tsx) | `/open/:packId` | Pacote selecionado, detalhes e probabilidades reais, compra existente e apresentação dos resultados retornados pelo sistema. |
| [Minhas cartas](../src/pages/Collection.tsx) | `/collection` | Resumo da coleção, filtros, álbum e cartas em grade responsiva; usa a topbar e não a sidebar. |
| Detalhes da carta | `/card/:uid` | Perfil editorial do atleta com foto existente, overall e dados reais; mantém evolução, ações e carta da coleção. |

O uso da topbar é controlado pela condição `usesHomeTopbar` em [`Layout.tsx`](../src/components/Layout.tsx). A navegação superior e o menu móvel também são definidos ali. A Home, a loja de pacotes, a abertura, a coleção e os detalhes da carta já estão incluídos nessa condição.

## Páginas que ainda precisam ser avaliadas para a nova interface

As rotas abaixo continuam no shell legado do `Layout`: sidebar em desktop e navegação móvel própria. Elas ainda precisam ser avaliadas e, se fizer sentido para seu fluxo, migradas para a topbar e para a linguagem visual atual.

| Página | Rota |
| --- | --- |
| Montar elenco | `/squad` |
| Comparar jogadores | `/compare` |
| Partida | `/match` |
| Sinuca | `/pool/:matchId` |
| Mercado | `/market` |
| Desafios | `/sbc` |
| Missões | `/missions` |
| Loja | `/shop` |
| Perfil | `/profile` |
| Perfil de outro jogador | `/profile/:userId` |
| Configurações | `/settings` |
| Amizades | `/friends` |
| Leaderboard | `/leaderboard` |
| Perfil competitivo | `/leaderboard/player/:userId` |
| Administração | `/admin` |

Partida e sinuca podem precisar de um shell mais imersivo. Antes de migrá-las, verificar se a topbar continua adequada durante o fluxo; não forçar a mesma composição em telas de jogo.

### Rotas fora do shell padrão

- `/about`: usa `Layout` quando autenticado; sem autenticação, renderiza sem o shell.
- `/changelog`: renderiza sem `Layout`.
- `/auth`: tela de autenticação independente.
- `/credits`: redireciona para `/about?aba=creditos`.
- Rota não encontrada: renderiza `NotFound` fora do `Layout`.

Decidir explicitamente se essas telas devem manter a apresentação independente ou adotar a topbar. Não as considerar migradas só por compartilharem cores ou tipografia.

## Padrão técnico do shell

### Topbar e navegação

- [`src/components/Layout.tsx`](../src/components/Layout.tsx) é a fonte única do shell e da navegação.
- Para migrar uma rota, incluí-la deliberadamente em `usesHomeTopbar`. Não remover a sidebar das demais rotas por efeito colateral.
- Os itens de navegação vêm de `NAV`; os grupos desktop e móveis vêm de `HOME_NAV_GROUPS`. Toda rota migrada deve continuar alcançável por esses menus ou por uma ação contextual existente.
- A topbar troca os grupos por um botão **Menu** em telas de até 1120 px. O menu móvel deve ser verificado após adicionar ou reorganizar links.
- A conta, busca, notificações e changelog são recursos do shell; evitar duplicá-los dentro da página.

### Layout, largura e rolagem

- [`src/pages/Home.css`](../src/pages/Home.css) define `.home-layout`, `.home-topbar`, `.home-container` e `.home-layout__main`.
- O container compartilhado usa largura máxima de 1440 px, centralização e padding horizontal de 24 px; em telas menores o padding é reduzido para 16 px.
- A topbar permanece no topo. O conteúdo rola em `.home-layout__main`.
- A loja `/packs` tem classes próprias (`home-layout--packs`, `home-layout__content--packs` e `home-layout__main--packs`) para manter a rolagem da loja dentro do layout. Preservar essa distinção ao alterar o shell.
- Cada página deve continuar controlando sua própria composição e altura. Não aplicar `overflow: hidden` globalmente para corrigir a rolagem de uma única rota.

### CSS e componentes

- Preferir os padrões já usados pela página: classes escopadas por tela (por exemplo, `.collection-*` e `.open-pack-*`) ou Tailwind quando o componente já usa essa abordagem.
- Evitar seletores globais que alterem outras páginas. [`Collection.css`](../src/pages/Collection.css) é carregado por [`main.tsx`](../src/main.tsx) e escopado sob `.collection-*`.
- Reutilizar artes e dados que já existem; nunca inventar cartas, resultados, chances ou progresso.
- Para cartões, preservar o componente e as imagens originais quando o pedido for apenas visual.

### Acessibilidade e responsividade

- Verificar pelo menos 375 px (celular) e 1440 px (desktop); testar larguras intermediárias quando o layout muda de colunas.
- Garantir que números longos, nomes e botões não invadam colunas vizinhas nem sejam cortados.
- Alvos interativos devem ter pelo menos 44 px quando possível; manter `:focus-visible` evidente.
- Respeitar `prefers-reduced-motion` em animações e transições da página e de seus componentes.
- Confirmar que menus, dropdowns e conteúdo continuam acessíveis por teclado e toque.

## Checklist para a próxima migração

1. Ler a página e identificar suas ações, dados e estado vazio antes de alterar o visual.
2. Decidir se ela pode usar a topbar padrão ou se requer um shell específico de jogo.
3. Migrar pelo `Layout.tsx`; não inserir uma navegação paralela na página.
4. Garantir que a rota permaneça acessível nos menus desktop/móvel ou por um fluxo contextual claro.
5. Escopar estilos e preservar lógica, integrações, permissões e conteúdo real.
6. Conferir rolagem, foco, movimento reduzido e ausência de overflow em celular e desktop.
7. Rodar os testes focados da página e do layout, além do build e do lint correspondente.

## Validação habitual

```powershell
npm test -- --runInBand tests/pages/<Pagina>.test.tsx tests/components/Layout.test.tsx
npm run build
npx oxlint src/pages/<Pagina>.tsx src/components/Layout.tsx tests/pages/<Pagina>.test.tsx
```

Adapte os caminhos de teste aos arquivos existentes. Não é necessário criar testes de página inexistentes para uma alteração exclusivamente documental ou visual trivial; adicione cobertura quando o comportamento de navegação ou interação mudar.
