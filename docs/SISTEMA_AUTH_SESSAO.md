# FutSENAI Cards - Autenticação e Sessão

> Documentação sobre o sistema de autenticação, gerenciamento de sessão e proteção de rotas.

---

## Visão Geral

O aplicativo usa **Supabase Auth** para gerenciamento de usuários e sessões. A autenticação é baseada em email/senha e OAuth, com sessões persistidas no `localStorage` pelo cliente do Supabase.

---

## Fluxo de Autenticação

### 1. Login/Cadastro

O componente `Auth.tsx` (página `/auth`) permite:
- Login com email e senha
- Cadastro de novo usuário
- Login via OAuth (se configurado)

Após o sucesso, o Supabase armazena o token de sessão no `localStorage` e o usuário é redirecionado para a página inicial.

### 2. Verificação de Sessão

No `App.tsx`, o `useEffect` inicial verifica a sessão existente:

```typescript
supabase.auth.getSession().then(({ data }) => {
  setUserId(data.session?.user?.id ?? null);
  setLoading(false);
});
```

Se houver uma sessão válida, o usuário é considerado autenticado e tem acesso às rotas protegidas.

### 3. Mudanças de Estado de Auth

O ouvinte `onAuthStateChange` detecta login, logout e mudança de token em tempo real:

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  setAuthed(!!session);
  if (event === 'SIGNED_IN' && session?.user?.id) {
    useGame.getState().syncUserData(session.user.id);
  }
});
```

Ao fazer login, o estado do jogo é sincronizado com o banco de dados via `syncUserData()`.

---

## Proteção de Rotas (`ProtectedRoute.tsx`)

O componente `ProtectedRoute` envolve todas as rotas que requerem autenticação:

```typescript
export default function ProtectedRoute() {
  const [ready, setReady] = useState(!supabase);
  const [authed, setAuthed] = useState(!supabase);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      setAuthed(false);
      return;
    }
    const resolveSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setAuthed(!!data.session);
      } catch {
        setAuthed(false);
      } finally {
        setReady(true);
      }
    };
    resolveSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div>Carregando…</div>;
  if (!authed) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
```

**Comportamento:**
- Enquanto a sessão está sendo verificada: exibe "Carregando…"
- Se não autenticado: redireciona para `/auth`
- Se autenticado: renderiza o conteúdo das rotas filhas (`<Outlet />`)

---

## Rotas Protegidas

Todas as rotas exceto `/auth` requerem autenticação:

| Rota | Descrição | Protegida |
|------|-----------|-----------|
| `/auth` | Login/Cadastro | Não |
| `/` | Página inicial | Sim |
| `/packs` | Abrir pacotes | Sim |
| `/collection` | Coleção de cartas | Sim |
| `/card/:uid` | Detalhe da carta | Sim |
| `/squad` | Montar elenco | Sim |
| `/match` | Partida de futsal | Sim |
| `/pool/:matchId` | Partida de sinuca | Sim |
| `/admin` | Painel admin | Sim (apenas admin) |
| `/profile` | Perfil próprio | Sim |
| `/profile/:userId` | Perfil de amigo | Sim |
| `/friends` | Lista de amigos | Sim |
| `/market` | Marketplace | Sim |
| `/sbc` | SBC | Sim |
| `/missions` | Missões | Sim |
| `/shop` | Loja | Sim |
| `/settings` | Configurações | Sim |
| `/leaderboard` | Ranking | Sim |

---

## Sincronização de Usuário (`syncUserData`)

Quando o usuário faz login, a função `syncUserData(uid)` é chamada para sincronizar todos os dados do banco com o estado local:

1. Carrega cartas do usuário (`getCards`)
2. Carrega squad salvo (`getSavedSquads`)
3. Carrega squad primário (`getPrimarySquadService`)
4. Carrega listagens do marketplace (`getListings`)
5. Carrega missões (`getMissions`)
6. Carrega conquistas (`getAchievements`)
7. Carrega configurações (`getSettings`)
8. Carrega dados do perfil (`profiles`): coins, xp, nível, avatar, packs_opened

### Sincronização de Cartas

As cartas locais e remotas são mescladas:
- Cartas locais que não existem no servidor são enviadas via `addCard()`
- Cartas remotas que não existem localmente são adicionadas
- Cartas em ambos os lados usam a versão remota
- Cartas marcadas como `custom: true` (criadas pelo admin) não são sobrescritas pelo `init()`

---

## Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase | `https://ejtgdnrmnnqjwowfhezc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima pública | `eyJ...` |

---

## Arquivos Relevantes

- `src/App.tsx` - Verificação de sessão e roteamento protegido
- `src/components/ProtectedRoute.tsx` - Componente de proteção de rotas
- `src/lib/supabase.ts` - Cliente Supabase configurado
- `src/store/useGame.ts` - `syncUserData()`, `init()`
- `src/pages/Auth.tsx` - Página de login/cadastro

---

## Problemas Conhecidos

### Tela Branca ao Recarregar
**Causa:** O `base: './'` no `vite.config.ts` fazia com que assets relativos quebrassem em rotas com mais de um nível (ex: `/profile/123`).
**Correção:** Alterado para `base: '/'` no Vite e `basename='/FutSENAICards'` no BrowserRouter para GitHub Pages.

### Sessão Não Persistente
Se o `localStorage` for limpo ou o cookie expirar, o usuário precisa fazer login novamente. Não há refresh automático de token além do que o Supabase client gerencia.

---

*Documentação gerada em 07/11/2026.*
