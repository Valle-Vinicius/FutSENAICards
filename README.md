# FutSENAI Cards

Aplicação web de cartas de futsal: coleção, pacotes, elencos, partidas PvP e sinuca, amizades, rankings, missões, desafios e Mercado. O frontend usa React/TypeScript; autenticação, dados persistentes e operações autoritativas usam Supabase.

> **Para entender a arquitetura, o fluxo de dados, o banco, as Edge Functions, o Realtime, os testes e os limites de acesso, comece pelo [Guia completo do projeto](docs/GUIA_COMPLETO_PROJETO.md).**
>
> Código e migrations atuais são a fonte de verdade. Documentos por domínio podem conter snapshots anteriores.

## Requisitos

- Node.js 22 (alinhado ao workflow de deploy).
- npm.
- Configuração Supabase para autenticar e usar as telas protegidas.

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie `.env.local` com as variáveis do projeto Supabase. O `.env.example` contém placeholders:

   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
   ```

   Não coloque uma chave `service_role` no frontend, em `.env` versionado ou neste repositório.

3. Inicie o servidor:

   ```bash
   npm run dev
   ```

Sem as variáveis Supabase, o cliente fica desativado e o login não funciona; a configuração local não equivale a uma instalação completa do backend.

## Comandos

```bash
npm run dev          # Vite
npm run build        # TypeScript + build de produção
npm run lint         # Oxlint
npm test             # Jest
npm run test:postgres
npm run preview      # Preview do build
npm run balance      # Script auxiliar de balanceamento
```

`npm run test:postgres` exige PostgreSQL **descartável em localhost** e `PVP_TEST_ALLOW_RESET=1`. O script recusa hosts/portas remotos e suas fixtures resetam IDs fixos; nunca aponte para produção.

## Estrutura principal

- `src/pages/`: telas.
- `src/components/`: layout e componentes reutilizáveis.
- `src/store/useGame.ts`: Zustand, persistência local e sincronização.
- `src/lib/services/`: serviços e acesso Supabase por domínio.
- `src/engine/`: engines de partida e sinuca.
- `src/data/`: templates, conteúdo e economia.
- `supabase/migrations/`: migrations SQL versionadas.
- `supabase/functions/`: Edge Functions em Deno.
- `tests/`: testes Jest e fixtures PostgreSQL.
- `docs/`: documentação técnica.

O roteamento usa `BrowserRouter`. As rotas de jogo são protegidas por autenticação; a rota do Mercado é `/market`. O workflow `.github/workflows/deploy.yml` publica no GitHub Pages após build em push para `main` ou `master`.

## Documentação por domínio

- [Guia completo do projeto](docs/GUIA_COMPLETO_PROJETO.md)
- [Autenticação e sessão](docs/SISTEMA_AUTH_SESSAO.md)
- [Cartas](docs/SISTEMA_CARTAS.md) e [Overall](docs/SISTEMA_OVERALL.md)
- [Inventário e Mercado](docs/SISTEMA_INVENTARIO_MERCADO.md)
- [PvP](docs/SISTEMA_MULTIPLAYER_PVP.md)
- [Sinuca: multiplayer](docs/SISTEMA_SINUCA_POOL.md) e [engine](docs/SISTEMA_SINUCA_ENGINE.md)
- [Admin](docs/SISTEMA_ADMIN.md)
- [Diagnóstico de Realtime e concorrência](docs/DIAGNOSTICO_REALTIME_E_CONCORRENCIA.md)
