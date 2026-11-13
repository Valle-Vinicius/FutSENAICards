# FutSENAICards

FutSENAICards é um jogo de cartas de futebol/futsal no estilo Ultimate Team, construído como uma aplicação web moderna. O jogador abre pacotes, coleciona cartas de atletas, monta elencos, simula partidas, negocia no mercado, completa desafios (SBCs), missões e conquistas, evolui cartas e acompanha estatísticas.

Este README documenta o jogo em profundidade: mecânicas, fluxos, arquitetura, dados, estado, animações, rotas, persistência, performance, acessibilidade, comandos e roadmap técnico.

---

## 1. Visão geral

- **Gênero:** card game esportivo / colecionável.
- **Tema:** futebol e futsal brasileiros.
- **Plataforma:** web (desktop e mobile).
- **Persistência:** local (localStorage via Zustand persist).
- **Moeda principal:** moedas.
- **Progressão:** XP, níveis, missões, conquistas, eventos.

O jogo é totalmente client-side. Não há backend; todos os dados vivem no navegador do usuário.

---

## 2. Stack tecnológica

### Frontend
- **React 19** com TypeScript.
- **Vite 8** para build e dev server.
- **Tailwind CSS 4** para estilização.
- **Framer Motion** para animações.
- **Zustand** com middleware `persist` para estado global.
- **React Router** (HashRouter) para navegação.
- **clsx**, **nanoid**, **framer-motion**.

### Qualidade
- **TypeScript** (`tsc -b`) no build.
- **Oxlint** para lint.
- **Vite** para preview e build de produção.

### Áudio
- Web Audio API (osciladores) para efeitos sonoros sintéticos.

---

## 3. Como executar

### Instalar dependências
```bash
npm install
```

### Rodar em desenvolvimento
```bash
npm run dev
```

### Build de produção
```bash
npm run build
```

### Preview do build
```bash
npm run preview
```

### Lint
```bash
npm run lint
```

O dev server normalmente sobe em `http://localhost:5173` (ou próxima porta disponível).

---

## 4. Estrutura do projeto

```
src/
  App.tsx                 # Rotas, layout, loading, tutorial, toasts
  main.tsx                # Entry point
  index.css               # Estilos globais, animações CSS (shimmer, etc.)
  types.ts                # Tipos e metadados (raridades, edições especiais)
  components/
    Card.tsx              # Carta visual
    Layout.tsx            # Shell (sidebar, drawer, bottom nav)
    ToastContainer.tsx    # Notificações
    Tutorial.tsx          # Tutorial inicial
    LoadingScreen.tsx     # Tela de carregamento
    ConfirmModal.tsx      # Modal de confirmação
    Skeleton.tsx          # Placeholders
    Tooltip.tsx           # Tooltips
  data/
    players.ts            # Templates de jogadores, geração de atributos
  engine/
    match.ts              # Simulação de partidas
  lib/
    game.ts               # Packs, missões, conquistas, formações, raridade, XP
    sound.ts              # Efeitos sonoros
  pages/
    Home.tsx
    Packs.tsx
    OpenPack.tsx          # Abertura de pacotes e animações
    Collection.tsx
    CardDetail.tsx
    Squad.tsx
    Match.tsx
    Compare.tsx
    Marketplace.tsx
    SBC.tsx
    Missions.tsx
    Shop.tsx
    Profile.tsx
    Settings.tsx
    NotFound.tsx
  store/
    useGame.ts            # Estado global persistido
    toast.ts              # Toasts
docs/                     # Documentação técnica e de produto
tests/
  engine/                 # Testes de simulação e PvP
  lib/                    # Testes de serviços e utilitários
  pages/                  # Testes de componentes de página
```

`README.md` permanece na raiz para ser exibido pelo GitHub. Os demais documentos
técnicos ficam em `docs/`, e os testes ficam agrupados em `tests/`.

---

## 5. Rotas

HashRouter com as seguintes rotas:

- `/` — Home (visão geral)
- `/packs` — Loja de pacotes
- `/open/:packId` — Abertura de pacote
- `/collection` — Coleção de cartas
- `/card/:uid` — Detalhe da carta
- `/squad` — Montagem de elenco
- `/match` — Partida
- `/compare` — Comparação de jogadores
- `/marketplace` — Mercado
- `/sbc` — Desafios (SBC)
- `/missions` — Missões
- `/shop` — Loja
- `/profile` — Perfil
- `/settings` — Configurações
- `*` — 404

---

## 6. Cartas (PlayerCard)

### Campos principais
- `uid`: identificador único da instância.
- `playerId`: identificador do template.
- `name`, `position`, `nationality`, `age`, `club`.
- `rarity`: common, uncommon, rare, epic, legendary, icon.
- `edition`: temporada (ex.: 2025/26).
- `special`: none, totw, potm, revelation, legend, futsal.
- `overall`: OVR geral.
- Atributos: pace, shooting, passing, dribbling, defending, physical.
- Goleiros: reflexes, positioning, handling (além dos base).
- `xp`, `evoPoints`, `upgrades`, `evolutionLog`.
- `seasonStats`: matches, goals, assists.
- `photo`, `image`.
- `obtainedAt`, `favorite`, `isNew`.

### Raridades
| Raridade | Label | Cor | OVR mín | OVR máx |
|---|---|---|---|---|
| common | Comum | #9ca3af | 50 | 69 |
| uncommon | Incomum | #b6ff3b | 60 | 74 |
| rare | Rara | #3b82f6 | 70 | 79 |
| epic | Épica | #a855f7 | 80 | 87 |
| legendary | Lendária | #f5c542 | 88 | 94 |
| icon | Ícone | #fbbf24 | 95 | 99 |

### Edições especiais
- Time da Semana (TOTW)
- Craque da Rodada (POTM)
- Revelação da Temporada
- Lenda do Futebol
- Especial Futsal

### Favoritos e novas cartas
- `favorite`: marca carta como favorita (estrela).
- `isNew`: badge "NOVA" até ser visualizada.

---

## 7. Pacotes (Packs)

### Tipos de pacote (exemplos)
- Bronze, Prata, Ouro, Premium.
- Pacote de Jogadores Raros.
- Pacote Lendas.
- Pacote Goleiros.
- Escolha Especial (choice).
- Pacote Off-Sale, com cartas zoeiras cadastradas exclusivamente pelo admin.

### Propriedades
- `id`, `name`, `price`, `cards`.
- `probabilities`: chance por raridade.
- `legendaryOnly`, `unlocked`.
- `color`, `description`.
- `choice`: escolher 1 entre N.
- `position`: pacote por posição.

### Abertura
- Verifica saldo.
- Deduz moedas.
- Gera cartas com raridade sorteada.
- Aplica edição especial (15% chance).
- Adiciona XP.
- Atualiza missões/conquistas.

### Animação de abertura (OpenPack)
Fluxo:
1. **Idle:** pacote flutuando, botão "ABRIR PACOTE", opções "Pular animação" e "Modo rápido".
2. **Charging:** tremor crescente, raios de luz, barra de progresso, som crescente.
3. **Burst:** flash branco, partículas (quantidade por raridade), 💥, "PACOTE ABERTO!".
4. **Rarity reveal:** silhuetas com cor da raridade, posição e label.
5. **Reveal:** FlipCard 3D; clique para revelar; brilho por raridade.
6. **Summary:** pop-up das cartas, melhor carta destacada, duplicatas, valor estimado.

Controles:
- Pular animação.
- Modo rápido.
- `prefers-reduced-motion`.

---

## 8. Progressão e economia

### Moedas
- Ganho: partidas, missões, SBCs, conversão de duplicatas, recompensa diária, mercado.
- Gasto: pacotes, mercado, upgrades.

### XP e níveis
- `addXp(n)` aumenta XP e recalcula nível (`levelFromXp`).
- 500 XP por nível (base).

### Recompensa diária
- Disponível a cada 20h.
- 500–1000 moedas + 40 XP.
- Completa missão diária.

### Transações
- Log de ganhos/gastos (até 50).

---

## 9. Missões

Tipos:
- `open_packs`: abrir pacotes.
- `collect`: colecionar cartas.
- `rarity`: obter raridade específica.
- `squad`: montar elenco de futebol.
- `futsal_squad`: montar elenco de futsal.
- `daily_login`: login diário.

Cada missão tem alvo, progresso, recompensa em moedas e XP, estado concluído/reivindicado.

Desbloqueio de pacote lendário após 3 missões concluídas.

---

## 10. Conquistas

Exemplos:
- Primeira carta.
- 20 cartas.
- 10.000 moedas.
- Elenco completo.
- Carta lendária/ícone.

---

## 11. Elencos (Squads)

### Esportes
- Futebol.
- Futsal.

### Formações
- Futebol: 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 5-3-2 (configurável em `lib/game.ts`).
- Futsal: 1-2-1, 2-2, 1-1-2, 2-1-1.

### Funcionalidades
- Atribuir cartas a slots (titulares/banco).
- Trocar formação (remapeia posições).
- Auto-build por critério.
- Análise de elenco.
- Salvar/carregar/duplicar elencos.
- Definir elenco principal.

### Persistência de elenco
- `SavedSquad` armazena UIDs dos titulares/banco e formação.

---

## 12. Partidas

### Simulação
- Determinística (seeded) para reprodutibilidade.
- Duração: 45/90 min (futebol) ou 40 min (futsal).
- Táticas e dificuldade.
- Frames 2D para replay.
- Estatísticas por jogador.
- Pós-jogo: XP, estatísticas, histórico.

### Eventos
- Gols, assistências, cartões, substituições (planejado).

---

## 13. Mercado

### Funcionalidades
- Listagens NPC e do usuário.
- Filtros e ordenação.
- Compra imediata / lance.
- Cancelamento de listagem.
- Histórico de preços.
- Transferências recentes.
- Aba "alvos" (placeholder).

### Observação técnica
- Listagens NPC criam cartas no inventário global (demo).
- Transferência real de propriedade é melhoria planejada.

---

## 14. SBC (Desafios)

### Regras
- Requisitos: minOverall, position, rarity, count, sameClub.
- Recompensas: pacote, moedas, carta.
- Repeatable ou único.

### Validações
- Contagem mínima.
- Overall mínimo.
- Mesmo clube.
- (Melhoria: validar posição/raridade).

### Recompensa
- Moedas ou pacote (equivalente em moedas na versão atual).

---

## 15. Comparação

- Comparar dois jogadores.
- Barras de atributos.
- Análise automática.
- Histórico de comparações.

---

## 16. Coleção

- Filtros por posição, raridade, clube.
- Ordenação.
- Paginação.
- Visão álbum.
- Detalhe da carta.
- Conversão de duplicatas.
- Favoritos.

---

## 17. Configurações

- Áudio (on/off).
- Animações (on/off).
- Alto contraste.
- Persistidas no estado.

---

## 18. Estado global (Zustand)

### Persistência
- Chave: `futsenai-cards-v3`.
- Armazena todo `GameState`.
- `resetAll` restaura estado inicial.

### Ações principais
- `init`, `addCoins`, `spendCoins`, `addXp`.
- `openPack`, `previewPack`, `claimPreviewedCard`.
- `assignSlot`, `clearSlot`, `setFormation`.
- `saveSquad`, `deleteSquad`, `setPrimarySquad`, `loadSquad`.
- `listCard`, `cancelListing`, `buyListing`, `bidListing`.
- `completeSBC`.
- `convertDuplicates`, `upgradePlayer`, `addPlayerXp`.
- `updateSettings`, `claimDaily`.

---

## 19. Dados e geração

### Templates de jogadores
- 11 jogadores brasileiros com fotos.
- Geração de atributos por posição e raridade.
- Goleiros usam reflexos/posicionamento/handling.

### Formações
- Definidas em `lib/game.ts`.
- Mapas de posições.

### Sorteio de raridade
- `rollRarity(probabilities)`.

---

## 20. Animações e áudio

### Framer Motion
- Transições de fase.
- Flip 3D.
- Partículas em canvas.
- Entrada escalonada.

### Áudio
- `playTone`, `playBurst`, `playCharge`, `playFlip`, `playRareReveal`.
- Contexto de áudio reutilizado.
- Respeita `settings.audio`.

---

## 21. Performance

- Memoização recomendada para filtros.
- Virtualização para coleção grande.
- Otimização de imagens.
- Áudio com contexto único.

---

## 22. Acessibilidade

- Navegação por teclado em cartas (Enter/Espaço).
- ARIA labels.
- `prefers-reduced-motion`.
- Alto contraste.

---

## 23. Persistência e migrações

- Estado versionado (chave v3).
- Migrações recomendadas para futuras versões.
- `resetAll` para limpar.

---

## 24. Testes e qualidade

- Build: `tsc -b && vite build`.
- Lint: `oxlint`.
- Sem testes automatizados atualmente (recomendado adicionar).

---

## 25. Roadmap técnico

- Implementar transferência real de cartas no mercado.
- Validar SBC por posição/raridade e entregar pacote.
- Corrigir carregamento de elencos.
- Melhorar engine de partidas (fadiga, substituições, assistências).
- Adicionar migrações de estado.
- Implementar aba "alvos" do mercado.
- Adicionar testes unitários (store/engine).
- Virtualizar coleção e otimizar imagens.
- Adicionar leaderboard/estatísticas.

---

## 26. Detalhes extras

- O jogo usa HashRouter para funcionar em hosts estáticos.
- Imagens de jogadores são assets locais.
- Pacotes podem ser por posição.
- Escolha especial permite selecionar 1 entre 3.
- Duplicatas podem ser convertidas em moedas.
- Cartas podem ser evoluídas com pontos de evolução.
- Estatísticas de temporada são registradas em partidas.

---

## 27. Licença e créditos

Projeto educacional FutSENAI. Imagens e nomes são fictícios/educacionais.

---

## 28. Comandos rápidos

```bash
npm install
npm run dev
npm run build
npm run preview
npm run lint
```

---

Fim.
