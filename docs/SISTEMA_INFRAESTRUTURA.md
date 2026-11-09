# FutSENAI Cards - Infraestrutura, Segurança e Deploy

> Documentação sobre RLS (Row Level Security), Realtime, Edge Functions, migrações e deploy.

---

## Visão Geral

O backend do FutSENAI Cards é construído inteiramente no Supabase, utilizando PostgreSQL 17, Realtime, Edge Functions (Deno) e Row Level Security.

---

## Banco de Dados: Supabase

### Projeto
- **Ref:** `ejtgdnrmnnqjwowfhezc`
- **Região:** us-east-2
- **Versão:** PostgreSQL 17
- **Dashboard:** https://supabase.com/dashboard/project/ejtgdnrmnnqjwowfhezc

### Migrações

Todas as migrações estão em `supabase/migrations/` e devem ser aplicadas em ordem cronológica:

| Arquivo | Descrição |
|---------|-----------|
| `20261104013505_pvp_authority_reconciliation.sql` | RPCs de desafio PvP + grants |
| `20261104150000_competitive_leaderboard.sql` - Tabelas de rating competitivo |
| `20261105020000_pool_tables.sql` - Tabelas pool_matches e pool_shots |
| `20261105030000_pool_match_rpcs.sql` - RPCs de partida de sinuca |
| `20261105040000_pool_challenge_flow.sql` - Fluxo de desafio de sinuca |
| `20261106000000_pool_integrity.sql` - version, shot_id, status cancelled |
| `20261106010000_secure_rpcs.sql` - delete_owned_cards e outras RPCs |
| `20261106050000_admin_create_card.sql` - RPC create_card |
| `20261106060000_card_templates.sql` - Tabela card_templates |
| `20261107000000_fix_create_card_template.sql` - base_overall e base_rarity |
| `20261107010000_fix_create_card_gk_playerid_image.sql` - GK, playerId, imagem |
| `20261107020000_add_nationality_age_club_to_cards.sql` - nacionalidade, idade, clube |
| `20261107030000_grant_select_card_templates.sql` - grant SELECT card_templates |
| `20261107040000_fix_create_card_template_ambiguity.sql` - remover ambiguidade |
| `20261107050000_admin_edit_card_overall.sql` - RPCs de edição de overall |
| `20261107060000_admin_upsert_template.sql` - upsert de templates |
| `20261108000000_fix_delete_owned_cards.sql` - corrigir uuid=text |

### Como Aplicar Migrações

No SQL Editor do dashboard do Supabase:
1. Acesse https://supabase.com/dashboard/project/ejtgdnrmnnqjwowfhezc/sql
2. Cole o conteúdo de cada arquivo `.sql` na ordem listada acima
3. Clique em "Run"

---

## Row Level Security (RLS)

### Princípio

Todas as tabelas têm RLS habilitado. Usuários autenticados (`authenticated`) só podem ler/escrever dados que lhes pertencem. Todas as escritas diretas são revogadas; tudo deve passar por RPCs com `security definer`.

### Políticas Principais

| Tabela | Leitura | Escrita |
|--------|---------|---------|
| `profiles` | Usuário próprio | Via auth |
| `cards` | Usuário proprietário | Via RPC |
| `pool_matches` | player1 ou player2 | Via RPC |
| `pool_shots` | player1 ou player2 da partida | Via RPC |
| `challenges` | challenger ou challenged | Via RPC |
| `listings` | Qualquer autenticado (leitura) | Proprietário (escrita) |
| `missions` / `achievements` | Usuário proprietário | Via RPC |
| `squads` / `saved_squads` | Usuário proprietário | Via RPC |

### Exemplo de Policy

```sql
create policy "read pool_matches" on public.pool_matches
  for select to authenticated
  using (auth.uid() = player1_id or auth.uid() = player2_id);
```

### Revogação de Escrita Direta

```sql
revoke insert, update, delete on public.pool_matches from authenticated;
revoke insert, update, delete on public.pool_shots from authenticated;
```

### Service Role

Edge functions usam o `service_role` que tem acesso total a todas as tabelas (bypass RLS). Permissões devem ser concedidas explicitamente:

```sql
grant all on public.pool_matches to service_role;
grant all on public.pool_shots to service_role;
```

---

## Realtime

### Tabelas na Publicação

As seguintes tabelas estão na publicação `supabase_realtime`:

- `pool_matches`
- `pool_shots`

### Canais de Realtime

| Canal | Evento | Uso |
|-------|--------|-----|
| `pool-match-${matchId}` | UPDATE | Sincroniza estado da mesa, turno, vencedor |
| `pool-invite-${matchId}` | UPDATE | Notifica aceite/recusa de convite de sinuca |
| `challenges-notify-${userId}` | INSERT/UPDATE | Notificações de desafios PvP |

### Exemplo de Uso no Cliente

```typescript
const channel = supabase.channel(`pool-match-${matchId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'pool_matches',
    filter: `id=eq.${matchId}`
  }, (payload) => {
    // Atualizar estado local com payload.new
  })
  .subscribe();
```

### Polling de Fallback

Como fallback ao realtime, o cliente faz polling a cada 3s para sincronizar o estado da partida de sinuca.

---

## Edge Functions

### `pool-shot`

**Arquivo:** `supabase/functions/pool-shot/index.ts`  
**Runtime:** Deno com `@supabase/supabase-js` (service role)

**Responsabilidades:**
1. Validar sessão, turno, deadline
2. Executar física determinística de bilhar
3. Gravar tiro em `pool_shots`
4. Atualizar `pool_matches` com resultado
5. Retornar estado final da mesa

**Validações:**
- Sessão válida (JWT)
- matchId é UUID válido
- angle é número finito, power entre 0 e 1
- Usuário é participante da partida
- É a vez do usuário
- turn_deadline não expirou (30s)

---

## Deploy

### Vercel (Produção)

O aplicativo principal é deployado na Vercel automaticamente a cada push no branch `main` do GitHub.

**Variáveis de ambiente necessárias na Vercel:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Build:** `vite build` (usa `tsc -b` para typecheck)

**Configuração de base:**
- `vite.config.ts`: `base: process.env.GITHUB_ACTIONS ? '/FutSENAICards/' : '/'`
- `App.tsx`: `basename='/FutSENAICards'` quando no GitHub Pages

### GitHub Pages (Fallback)

Um workflow do GitHub Actions (`deploy.yml`) faz build e deploy para GitHub Pages em pushes para `main`.

**Problema conhecido:** O `base: './'` quebra em rotas com mais de um nível no GitHub Pages. Corrigido usando `base: '/FutSENAICards/'` quando rodando no GitHub Actions.

---

## Checklist de Deploy

Antes de fazer push para produção:

1. [ ] Todas as migrações SQL aplicadas no banco remoto
2. [ ] Variáveis de ambiente configuradas na Vercel
3. [ ] `vite.config.ts` com `base` correto
4. [ ] TypeScript compila sem erros (`npm run build`)
5. [ ] Testar autenticação, criação de cartas, sinuca e admin

---

## Arquivos de Configuração

| Arquivo | Descrição |
|---------|-----------|
| `vite.config.ts` | Configuração do Vite (base, plugins) |
| `tsconfig.app.json` | TypeScript config para a aplicação |
| `supabase/config.toml` | Configuração do Supabase CLI |
| `.github/workflows/deploy.yml` | Workflow de deploy para GitHub Pages |

---

*Documentação gerada em 07/11/2026.*
