# DOCUMENTAÇÃO TÉCNICA — FUTSENAI CARDS

## 1. Resumo executivo

O **FutSENAI Cards** é um jogo de cartas de futebol/futsal no estilo Ultimate Team, construído como aplicação web (React + Vite) com backend gerenciado (Supabase) e hospedagem (Vercel). O jogador abre pacotes, coleciona cartas, monta elencos, simula partidas, negocia no mercado, completa SBCs, missões e conquistas.

Estado atual: autenticação real via Supabase (email/senha + Google OAuth), perfil global, persistência parcial no banco (cartas, squads, partidas, missões, conquistas, SBC, transações, settings, favoritos, compare history, packsOpened, lastDailyClaim, eventos, newCardUids, packConfigs, savedSquads, listings, coins). Marketplace com compras atômicas (Edge Function + RPC). Segurança RLS + GRANTs. Testes Jest (9). Documentação e README.

---

## 2. Arquitetura geral

- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Framer Motion.
- **Estado:** Zustand (persistido em `localStorage` como `futsenai-cards-v3`).
- **Roteamento:** React Router (BrowserRouter) com rotas protegidas.
- **Backend:** Supabase (Postgres, Auth, RLS, Edge Functions, Storage).
- **Deploy:** Vercel (frontend estático, SPA fallback via `vercel.json`).
- **Áudio:** Web Audio API (osciladores sintéticos) + arquivo MP3 (lofi).

Fluxo: Navegador → React (Vite bundle) → Supabase JS Client → Supabase API (REST/RPC/Edge Functions) → Postgres.

```mermaid
graph TD
  A[Usuário] --> B[Vercel Frontend]
  B --> C[Supabase Auth]
  B --> D[Supabase REST/RPC]
  B --> E[Edge Functions]
  D --> F[Postgres]
  E --> F
  C --> F
```

---

## 3. Stack tecnológica

| Tecnologia | Versão | Uso real |
|---|---|---|
| React | 19.3.1 | UI |
| TypeScript | ~6.0.3 | Tipagem |
| Vite | 8.3.4 | Build/dev server |
| Tailwind CSS | 4.3.3 | Estilos |
| Framer Motion | 14.6.0 | Animações |
| Zustand | 5.0.16 | Estado global + persist |
| React Router | 7.18.4 | Rotas (BrowserRouter) |
| Supabase JS | 2.118.0 | Auth, DB, Edge Functions |
| lucide-react | 1.61.0 | Ícones SVG |
| nanoid | 6.0.2 | IDs de cartas/listings |
| clsx | 2.1.1 | Classes condicionais |
| particles.js | 2.0.0 | (não usado; canvas customizado) |
| Jest | 30.5.2 | Testes |
| ts-jest | 29.4.15 | Transform TS para Jest |
| oxlint | 1.88.0 | Lint |
| @tailwindcss/vite | 4.3.3 | Plugin Vite |

Scripts (`package.json`):
- `dev`: `vite`
- `build`: `tsc -b && vite build`
- `test`: `jest`
- `test:watch`: `jest --watch`
- `lint`: `oxlint`
- `preview`: `vite preview`

---

## 4. Estrutura de arquivos

```
src/
  App.tsx              # Rotas, layout, loading, tutorial, toasts
  main.tsx             # Entry point
  index.css            # Estilos globais, animações CSS
  types.ts             # Tipos e metadados
  components/          # Card, Layout, ToastContainer, Tutorial, LoadingScreen, ConfirmModal, Skeleton, Tooltip
  data/players.ts      # Templates de jogadores (futsal)
  engine/match.ts      # Simulação de partidas
  lib/game.ts          # Packs, missões, conquistas, formações, raridade, XP
  lib/sound.ts         # Efeitos sonoros
  lib/supabase.ts      # Cliente Supabase
  lib/profile.ts       # Serviço de perfil
  lib/services/        # auth, cards, squads, matches, marketplace, missions, achievements, sbc, transactions, settings
  pages/               # Home, Packs, OpenPack, Collection, CardDetail, Squad, Match, Compare, Marketplace, SBC, Missions, Shop, Profile, Settings, NotFound, Auth
  store/useGame.ts     # Estado global persistido (Zustand)
  store/toast.ts       # Toasts
  types/images.d.ts    # Declarações de módulos de imagem
  imagens/             # Fotos dos jogadores
  imagens/imagensposes # Poses para login/404
  imagens/login        # Background e logo
  audio/lofi.mp3       # Música de login
supabase/
  functions/delete-account/index.ts
  functions/buy-listing/index.ts
public/
  favicon.png, favicon.svg, icons.svg
```

---

## 5. Ciclo de vida da aplicação

1. Navegador carrega `index.html` + bundle Vite.
2. `main.tsx` monta `<App />`.
3. `App.tsx` exibe `LoadingScreen` até `init()` (exceto 404).
4. `useGame.getState().init()` roda: migra packs, seed events, seedMarket, updateMissionProgress, sync com Supabase se logado.
5. `ProtectedRoute` verifica sessão Supabase; sem sessão redireciona para `/auth`.
6. Rotas renderizam dentro de `Layout` (sidebar, topbar, bottom nav).
7. Navegação via React Router; página principal `<Outlet />`.
8. Dados salvos/atualizados via store (Zustand) + sync Supabase.
9. Logout: `signOut()` + limpa `localStorage` + redirect `/auth`.

Tratamento de erros: try/catch em ações, toasts, mensagens de erro na UI. Carregamento: `LoadingScreen` com progresso. Atualização de sessão: `onAuthStateChange` em `App.tsx` e `ProtectedRoute`.

---

## 6. Autenticação e contas

**Fluxos:**
- Cadastro: `signUp(name, email, password)` → Supabase Auth → trigger `handle_new_user` cria `profiles`.
- Login: `signIn(email, password)` ou `signInWithGoogle()` (OAuth).
- Recuperação: `resetPassword(email)` → email → link com `type=recovery` → `updatePassword(newPassword)`.
- Alteração email/senha: `updateEmail`, `updatePassword` (Profile).
- Exclusão: Edge Function `delete-account` valida JWT, deleta dados e usuário.
- Sessão: restaurada via `supabase.auth.getSession()`; renovação automática.
- Proteção: `ProtectedRoute` bloqueia rotas privadas sem sessão.

**Centralização:** `src/lib/services/auth.ts` concentra todas as funções. `Auth.tsx` e `Profile.tsx` consomem esse módulo.

**Segredos:** apenas publishable key no frontend; service_role apenas nas Edge Functions.

---

## 7. Banco de dados

Tabelas principais (schema real, conforme SQL executado):

| Tabela | Finalidade | Colunas chave |
|---|---|---|
| `profiles` | Conta do usuário | id (PK, FK auth.users), name, avatar_url, coins, xp, level, preferences (jsonb), packs_opened, last_daily_claim, created_at |
| `cards` | Cartas do inventário | id (PK), user_id (FK), player_id, name, position, sport, rarity, edition, special, overall, pace, shooting, passing, dribbling, defending, physical, reflexes, positioning, handling, xp, evo_points, upgrades (jsonb), evolution_log (jsonb), season_stats (jsonb), image, favorite, is_new, obtained_at |
| `squads` | Elenco ativo | id, user_id, formation, starters (jsonb), bench (jsonb), is_primary |
| `saved_squads` | Elencos salvos | id, user_id, name, formation, starters, bench, is_primary, created_at |
| `matches` | Histórico de partidas | id, user_id, sport, home_score, away_score, opponent, played_at |
| `missions` | Missões por usuário | id, user_id, mission_id, title, description, target, progress, reward, reward_xp, type, completed, claimed |
| `achievements` | Conquistas | id, user_id, achievement_id, title, description, unlocked, unlocked_at |
| `listings` | Anúncios do mercado | id, seller_id, card_id, card_name, card_overall, card_position, card_rarity, card_image, card_attributes (jsonb), price, buy_now, expires_at, status |
| `transactions` | Histórico financeiro | id, user_id, amount, reason, type, created_at |
| `price_history` | Histórico de preços | id, card_name, price, created_at |
| `recent_transfers` | Transferências recentes | id, user_id, card_name, price, type, created_at |
| `leaderboard` | Ranking | user_id (PK), name, wins, points, updated_at |
| `sbc_completions` | SBCs concluídos | id, user_id, sbc_id, completed_at |

Relacionamentos: `profiles.id` → `auth.users.id` (cascade). `cards.user_id`, `squads.user_id`, etc. → `profiles.id` (cascade). `listings.card_id` → `cards.id` (set null). `leaderboard.user_id` → `profiles.id`.

**Diagrama ER (Mermaid):**
```mermaid
erDiagram
  profiles ||--o{ cards : owns
  profiles ||--o{ squads : has
  profiles ||--o{ saved_squads : has
  profiles ||--o{ matches : plays
  profiles ||--o{ missions : tracks
  profiles ||--o{ achievements : unlocks
  profiles ||--o{ listings : sells
  profiles ||--o{ transactions : records
  profiles ||--o{ recent_transfers : records
  profiles ||--|| leaderboard : ranks
  cards ||--o{ listings : listed
```

---

## 8. RLS e permissões

- RLS habilitado em todas as tabelas.
- Policies para `authenticated` com `USING (auth.uid() = user_id)` (ou `id` em profiles).
- Listings: SELECT público para `authenticated`, ALL para dono.
- Price history: SELECT/INSERT para `authenticated`.
- Leaderboard: SELECT público, ALL para dono.
- Grants: `all` para `authenticated` em todas as tabelas; `select` para `anon` em tabelas públicas.
- `sbc_completions` policy para `public` (deveria ser `authenticated` — pendência).

---

## 9. Backend, Edge Functions e RPCs

**Edge Functions:**
1. `delete-account` (`supabase/functions/delete-account/index.ts`): valida JWT, deleta dados do usuário e conta via service_role. CORS habilitado.
2. `buy-listing` (`supabase/functions/buy-listing/index.ts`): valida JWT, chama RPC `buy_listing`.

**RPC:**
- `buy_listing(p_listing_id, p_buyer_id)`: transação atômica — bloqueia anúncio (FOR UPDATE), valida disponibilidade, saldo, vendedor ≠ comprador, debita comprador, credita vendedor, transfere carta, marca anúncio como vendido. Reverte tudo se falhar.

**Validações no servidor:** JWT, saldo, propriedade, status do anúncio, expiração. Preço lido do banco.

---

## 10. Estado global, persistência e sincronização

- **Store:** `useGame` (Zustand) persistido em `localStorage` (`futsenai-cards-v3`).
- **Sincronização:** `syncUserData(userId)` carrega do Supabase ao login; ações (openPack, addCoins, saveSquad, etc.) sincronizam com o banco.
- **Dados locais:** toast (não persistido).
- **Risco de divergência:** mitigado por sync on login; mas ações locais podem não sincronizar em falhas de rede.

---

## 11. Funcionalidades do jogo

- **Cartas:** 11 templates futsal (Pivô, Ala, Fixo, GK), atributos fixos, overall calculado. Raridades: common, uncommon, rare, epic, legendary, icon. Edições especiais: TOTW, POTM, Revelação, Lenda, Futsal.
- **Pacotes:** 8 tipos (Bronze, Prata, Ouro, Premium, Jogadores Raros, Lendas, Goleiros, Escolha Especial). Probabilidades por raridade.
- **Elencos:** formações futsal (1-2-1, 2-2, 3-1, 4-0). Auto-build, salvar/carregar.
- **Partidas:** simulação determinística (seeded), frames 2D, estatísticas.
- **Missões:** 5 tipos (open_packs, collect, rarity, squad, futsal_squad, daily_login).
- **Conquistas:** 6 achievements.
- **SBCs:** 6 desafios com requisitos e recompensas.
- **Mercado:** listagens NPC + usuário, filtros, compra/lance.
- **Coleção:** filtros, ordenação, paginação, álbum, conversão de duplicatas, favoritos.
- **Configurações:** áudio, animações, alto contraste.
- **Evolução:** XP, evoPoints, upgrades de atributos.

---

## 12. Marketplace e economia

- Anunciar: `listCard` cria listing local + sync Supabase (card_id, seller_id, preço, status).
- Comprar: `buyListing` → Edge Function `buy-listing` → RPC `buy_listing` (atômico).
- Cancelar: `cancelListing` → atualiza status para 'cancelled'.
- Listagens NPC: locais (não persistidas).
- Preço validado no servidor (lido do anúncio).
- Saldo nunca negativo (verificado na RPC).
- Carta não pode ser comprada duas vezes (status condicional).
- Comprador não pode comprar próprio anúncio (verificado na RPC).

---

## 13. Logs, erros e observabilidade

- Uso de `console.log/warn/error` em vários arquivos.
- Sem logger centralizado.
- Sem monitoramento externo (Sentry, etc.).
- Erros exibidos via toasts e mensagens na UI.
- Sem captura de erros globais (window.onerror).
- Risco: logs podem conter dados sensíveis se não filtrados.

---

## 14. Segurança geral

| Risco | Classificação | Evidência |
|---|---|---|
| service_role não exposta | ✅ OK | Apenas publishable key no frontend |
| RLS ativo | ✅ OK | Todas as tabelas |
| Compras atômicas | ✅ OK | RPC + Edge Function |
| Preço validado no servidor | ✅ OK | RPC lê do banco |
| Limitar tentativas de login | ❌ Ausente | Sem rate limiting configurado |
| Testes de segurança | ❌ Ausente | Sem testes de integração |
| Logs de eventos | ❌ Ausente | Sem auditoria |
| Monitoramento | ❌ Ausente | Sem alertas |
| CORS Edge Functions | ✅ OK | Headers configurados |
| Redirects OAuth | ✅ OK | URLs configuradas |
| Dados sensíveis em logs | ⚠️ Risco | console.log pode vazar |

---

## 15. Frontend, rotas e interface

Rotas (BrowserRouter):
- `/` — Home
- `/packs` — Loja de pacotes
- `/open/:packId` — Abertura de pacote
- `/collection` — Coleção
- `/card/:uid` — Detalhe da carta
- `/squad` — Montar elenco
- `/match` — Partida
- `/compare` — Comparação
- `/market` (ou `/marketplace`) — Mercado
- `/sbc` — Desafios
- `/missions` — Missões
- `/shop` — Loja
- `/profile` — Perfil
- `/settings` — Configurações
- `/auth` — Login/cadastro
- `*` — 404

Layout: sidebar (desktop), drawer (mobile), bottom nav (mobile). ProtectedRoute envolve Layout. Auth fora do Layout.

---

## 16. Build, ambientes e deploy

- **Dev:** `npm run dev` (Vite)
- **Build:** `npm run build` (`tsc -b && vite build`)
- **Test:** `npm test` (Jest)
- **Lint:** `npm run lint` (oxlint)
- **Preview:** `npm run preview`
- **Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Vercel:** SPA fallback via `vercel.json`, deploy automático do `main`
- **Supabase:** Edge Functions deployadas via CLI
- **Migrations:** SQL executado manualmente no Supabase SQL Editor

---

## 17. Testes e validação

Testes existentes (Jest):
- `src/lib/__tests__/utils.test.ts`: `levelFromXp`, `rollRarity` (2 testes)
- `src/lib/services/__tests__/profile.test.ts`: `getProfile`, `updateProfile` sem Supabase (2 testes)
- `src/pages/__tests__/Auth.test.tsx`: render login, toggle register, submit, forgot password (4 testes)

Total: 9 testes. Sem testes de integração ou E2E. Sem CI/CD de testes (apenas build/lint no Vercel).

---

## 18. Diagramas de arquitetura e fluxos

**Inicialização:**
```mermaid
sequenceDiagram
  participant U as Usuário
  participant A as App.tsx
  participant S as useGame (Zustand)
  participant SB as Supabase
  U->>A: Abre site
  A->>S: init()
  S->>SB: getSession()
  SB-->>S: session (se logado)
  S->>SB: syncUserData()
  SB-->>S: cards, squads, etc.
  A->>U: Renderiza UI
```

**Compra no marketplace:**
```mermaid
sequenceDiagram
  participant F as Frontend
  participant E as Edge Function (buy-listing)
  participant R as RPC (buy_listing)
  participant DB as Postgres
  F->>E: POST { listingId }
  E->>E: Valida JWT
  E->>R: rpc buy_listing
  R->>DB: FOR UPDATE listing
  R->>DB: Verifica saldo, vendedor
  R->>DB: Debita comprador, credita vendedor
  R->>DB: Transfere carta
  R->>DB: Marca listing sold
  R-->>E: { ok, price }
  E-->>F: { ok, price }
  F->>F: Atualiza UI
```

---

## 19. Problemas, dívida técnica e pendências

| # | Problema | Evidência | Impacto | Prioridade |
|---|---|---|---|---|
| 1 | Camada de auth não centralizada | `Auth.tsx` e `Profile.tsx` chamam Supabase diretamente | Médio | Médio |
| 2 | Missões/conquistas/SBC ainda parcialmente locais | `updateMissionProgress`, `completeSBC` sincronizam mas não carregam no init | Médio | Médio |
| 3 | Marketplace: compras atômicas implementadas mas não testadas | `buy-listing` Edge Function + RPC | Alto | Alto |
| 4 | Limitar tentativas de login | Sem rate limiting configurado | Médio | Médio |
| 5 | Testes insuficientes | 9 testes, sem integração/E2E | Alto | Alto |
| 6 | Logs podem vazar dados sensíveis | `console.log` em vários arquivos | Médio | Médio |
| 7 | Sem monitoramento | Sem Sentry, alertas | Baixo | Baixo |
| 8 | `sbc_completions` policy para `public` | Deveria ser `authenticated` | Baixo | Baixo |
| 9 | Bundle grande (>500KB) | Vite warning | Baixo | Baixo |
| 10 | Assets grandes (MP3 8MB, PNGs 2MB) | Build output | Baixo | Baixo |

---

## 20. Glossário técnico

- **RLS:** Row Level Security — políticas de acesso por linha no Postgres.
- **JWT:** JSON Web Token — token de autenticação.
- **Edge Function:** função serverless no Supabase (Deno).
- **RPC:** Remote Procedure Call — função SQL chamável via API.
- **Zustand:** gerenciador de estado React.
- **Persist:** middleware do Zustand para salvar em localStorage.
- **HashRouter/BrowserRouter:** roteadores do React Router.
- **Vercel:** plataforma de deploy frontend.
- **Supabase:** backend-as-a-service (Postgres + Auth + Edge Functions).

---

## 21. Checklist de verificação

- [x] Autenticação (email/senha + Google)
- [x] Confirmação de email
- [x] Recuperação de senha
- [x] Alteração de email/senha
- [x] Exclusão de conta
- [x] Perfil global com trigger
- [x] Formulário de edição de perfil
- [x] RLS em todas as tabelas
- [x] GRANT de privilégios
- [x] Migração de cartas, squads, partidas, listings, missões, conquistas, SBC, transações, settings, favoritos, compareHistory, packsOpened, lastDailyClaim, XP/nível, eventos, newCardUids, packConfigs, savedSquads
- [x] Compras atômicas (Edge Function + RPC)
- [x] Testes Jest (9)
- [ ] Camada de auth centralizada (parcial)
- [ ] Testes de integração/E2E
- [ ] Monitoramento e alertas
- [ ] Limitar tentativas de login

---

## 22. Conclusão

O Futsenai Cards é um projeto de card game de futsal com backend real (Supabase), autenticação completa, persistência de dados do jogo, marketplace com compras atômicas e interface moderna. A arquitetura é sólida, com RLS e policies adequadas. As principais pendências são: centralização da camada de auth, testes de integração, monitoramento e otimização de bundle/assets. O projeto está em estado funcional e pronto para evolução.
