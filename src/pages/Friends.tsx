import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, Clock3, Search, UserPlus, Users, X } from 'lucide-react';
import { useGame } from '../store/useGame';
import { supabase } from '../lib/supabase';
import * as friendsService from '../lib/services/friends';
import type { FriendUser } from '../lib/services/friends';

function FriendAvatar({ user, size = 'lg' }: { user: FriendUser; size?: 'sm' | 'md' | 'lg' }) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarUrl = user.avatar_url?.trim();
  const sizeClass = size === 'lg' ? 'h-20 w-20 text-2xl' : size === 'md' ? 'h-14 w-14 text-lg' : 'h-12 w-12 text-base';
  const status = user.online ? 'Online' : 'Offline';

  return (
    <div className={`${sizeClass} relative shrink-0`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[var(--soft)] font-black text-[var(--red)] shadow-md">
        {avatarUrl && failedAvatarUrl !== avatarUrl
          ? <img src={avatarUrl} alt="" onError={() => setFailedAvatarUrl(avatarUrl ?? null)} className="h-full w-full object-cover" />
          : <span aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span>}
      </div>
      <span
        role="img"
        aria-label={status}
        title={status}
        className={`absolute bottom-0 right-0 z-10 h-4 w-4 rounded-full border-[3px] border-white ${user.online ? 'bg-emerald-500' : 'bg-slate-400'}`}
      />
    </div>
  );
}

function Presence({ online }: { online?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

export default function Friends() {
  const [tab, setTab] = useState<'all' | 'received' | 'sent' | 'add'>('all');
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [received, setReceived] = useState<{ friendship: friendsService.Friendship; user: FriendUser }[]>([]);
  const [sent, setSent] = useState<{ friendship: friendsService.Friendship; user: FriendUser }[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendUser[]>([]);
  const [addOffset, setAddOffset] = useState(0);
  const [addLoading, setAddLoading] = useState(false);
  const [addHasMore, setAddHasMore] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();
  const setPendingFriends = useGame(s => s.setPendingFriends);
  const presenceIds = [...new Set([
    ...friends.map(friend => friend.id),
    ...received.map(request => request.user.id),
    ...sent.map(request => request.user.id),
  ])].sort();
  const presenceKey = presenceIds.join(',');

  const load = useCallback(async (uid: string) => {
    setFriends(await friendsService.getFriends(uid));
    const rec = await friendsService.getPendingReceived(uid);
    setReceived(rec);
    setPendingFriends(rec.length);
    setSent(await friendsService.getPendingSent(uid));
  }, [setPendingFriends]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let unsubscribe = () => {};
    void (async () => {
      try {
        const { data, error: sessionError } = await supabase!.auth.getSession();
        if (sessionError) throw sessionError;
        const uid = data.session?.user?.id;
        if (!uid || !active) return;
        const { error: tableError } = await supabase!.from('friendships').select('id').limit(1);
        if (!active) return;
        if (tableError) { setTableMissing(true); return; }
        setUserId(uid);
        await load(uid);
        if (!active) return;
        unsubscribe = friendsService.subscribeFriends(uid, () => { void load(uid); });
      } catch (error) {
        console.error('friends page initialization failed', error);
      }
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [load]);

  useEffect(() => {
    if (!userId || !presenceKey) return;
    return friendsService.subscribeFriendPresence(presenceKey.split(','), (friendId, online) => {
      setFriends(current => current.map(friend => friend.id === friendId ? { ...friend, online } : friend));
      setReceived(current => current.map(request => request.user.id === friendId
        ? { ...request, user: { ...request.user, online } }
        : request));
      setSent(current => current.map(request => request.user.id === friendId
        ? { ...request, user: { ...request.user, online } }
        : request));
    });
  }, [presenceKey, userId]);

  const handleSearch = async () => {
    if (!userId) return;
    if (!query.trim()) {
      await loadAddableUsers(true);
      return;
    }
    setAddLoading(true);
    try {
      const users = await friendsService.searchUsers(query);
      setResults(users);
      setAddHasMore(false);
    } catch (error) {
      console.error('friend discovery search failed', error);
      setMsg('Não foi possível buscar usuários agora.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleTabChange = (nextTab: typeof tab) => {
    setTab(nextTab);
    if (nextTab === 'add' && !query.trim()) void loadAddableUsers(true);
  };

  const loadAddableUsers = async (reset = false) => {
    if (addLoading) return;
    const offset = reset ? 0 : addOffset;
    setAddLoading(true);
    try {
      const users = await friendsService.getAddableUsers(offset);
      setResults(current => reset ? users : [...current, ...users]);
      setAddOffset(offset + users.length);
      setAddHasMore(users.length === 50);
    } catch (error) {
      console.error('friend discovery list failed', error);
      setMsg('Não foi possível carregar usuários para adicionar.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleSend = async (fid: string) => {
    if (!userId) return;
    const ok = await friendsService.sendRequest(userId, fid);
    setMsg(ok ? 'Solicitação enviada!' : 'Já existe uma solicitação ou amizade.');
    if (ok && userId) {
      setResults(current => current.filter(user => user.id !== fid));
      await load(userId);
    }
    setTimeout(() => setMsg(''), 2000);
  };

  const handleAccept = async (id: string) => {
    await friendsService.acceptRequest(id);
    if (userId) await load(userId);
  };
  const handleReject = async (id: string) => {
    await friendsService.rejectRequest(id);
    if (userId) await load(userId);
  };
  const handleCancel = async (id: string) => {
    await friendsService.cancelRequest(id);
    if (userId) await load(userId);
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 lg:p-8">
      <header className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#17191f] px-5 py-6 text-white shadow-[0_16px_40px_rgba(27,30,39,0.12)] sm:px-8 sm:py-8 lg:px-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full border-[30px] border-[#ed1b35]/20" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[-5rem] right-[22%] h-52 w-52 rotate-45 border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.1]" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 25px, rgba(255,255,255,.25) 26px, transparent 27px)' }} />
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-[9px] font-black uppercase tracking-[0.24em] text-[#ff8290]">FUTSENAI · COMUNIDADE</p>
            <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl">Amigos</h1>
            <p className="mt-3 text-sm text-white/65 sm:text-base">Seus amigos no FUTSENAI.</p>
          </div>
          <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-4 py-2.5">
              <Users className="h-5 w-5 text-white/55" />
              <div>
                <p className="text-xl font-black leading-none tabular-nums text-white">{friends.length}</p>
                <p className="mt-1 text-[8px] font-black uppercase tracking-[0.14em] text-white/45">Amigos</p>
              </div>
            </div>
            <button
              type="button"
              aria-pressed={tab === 'add'}
              onClick={() => handleTabChange('add')}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-black uppercase tracking-[0.12em] shadow-sm transition motion-reduce:transition-none ${tab === 'add' ? 'bg-white text-[var(--red)]' : 'bg-[var(--red)] text-white hover:bg-[#bd1026]'}`}
            >
              <UserPlus className="h-4 w-4" />
              Adicionar amigos
            </button>
          </div>
        </div>
      </header>

      {tableMissing && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A tabela <code>friendships</code> não existe no Supabase. Rode o SQL de <code>supabase/friends.sql</code> no SQL Editor do Supabase.
        </div>
      )}
      {msg && <div role="status" aria-live="polite" className="rounded-xl border border-[var(--red)]/15 bg-[var(--soft)] px-4 py-3 text-sm font-semibold text-[var(--red)]">{msg}</div>}

      <nav aria-label="Navegação de amizades" className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5 shadow-sm">
        {(['all', 'received', 'sent'] as const).map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => handleTabChange(t)}
            className={`shrink-0 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-wide transition-colors motion-reduce:transition-none sm:px-5 sm:text-xs ${tab === t ? 'bg-[var(--red)] text-white shadow-sm' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
          >
            {t === 'all' ? 'Todos os amigos' : t === 'received' ? `Solicitações recebidas (${received.length})` : 'Enviadas'}
          </button>
        ))}
      </nav>

      {tab === 'all' && (
        <section aria-label="Todos os amigos" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {friends.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => navigate(`/profile/${f.id}`)}
              className="group relative flex min-h-56 w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[var(--red)]/30 hover:shadow-[0_16px_34px_rgba(27,30,39,0.1)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--red)]/15 motion-reduce:transform-none motion-reduce:transition-none"
              aria-label={`Perfil de ${f.name}, ${f.online ? 'online' : 'offline'}`}
            >
              <span aria-hidden="true" className="absolute right-0 top-0 h-20 w-20 translate-x-7 -translate-y-7 rotate-45 bg-[var(--red)]/[0.06] transition-colors group-hover:bg-[var(--red)]/[0.1]" />
              <span className="relative flex w-full items-start justify-between">
                <FriendAvatar user={f} />
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--muted)] transition-colors group-hover:bg-[var(--soft)] group-hover:text-[var(--red)]">
                  Perfil <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </span>
              </span>
              <span className="mt-4 block min-w-0">
                <span className="block truncate text-lg font-black leading-tight text-[var(--text)]">{f.name}</span>
                <span className="mt-2 block"><Presence online={f.online} /></span>
              </span>
              <span className="mt-auto flex w-full items-center justify-between border-t border-[var(--border)] pt-3">
                <span className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">Abrir perfil do jogador</span>
                <ArrowRight className="h-4 w-4 text-[var(--red)] transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
              </span>
            </button>
          ))}
          {friends.length === 0 && (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center md:col-span-2 lg:col-span-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--red)]"><Users className="h-6 w-6" /></div>
              <div>
                <h2 className="text-base font-black text-[var(--text)]">Sua rede começa aqui</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Adicione jogadores para acompanhar sua comunidade FUTSENAI.</p>
              </div>
              <button type="button" onClick={() => handleTabChange('add')} className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--red)] px-4 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-[#bd1026]">
                <UserPlus className="h-4 w-4" /> Encontrar amigos
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'received' && (
        <section aria-label="Solicitações recebidas" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {received.map(r => (
            <article key={r.friendship.id} className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--red)]/15 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft)] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--red)]">
                  <Clock3 className="h-3 w-3" /> Solicitação recebida
                </span>
                <span role="img" aria-label="Pendente" className="h-2 w-2 shrink-0 rounded-full bg-[var(--red)]" />
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <FriendAvatar user={r.user} size="md" />
                <button type="button" onClick={() => navigate(`/profile/${r.user.id}`)} className="min-w-0 flex-1 text-left focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]/30">
                  <span className="block truncate text-base font-black text-[var(--text)]">{r.user.name}</span>
                  <span className="mt-2 block"><Presence online={r.user.online} /></span>
                </button>
              </div>
              <div className="mt-auto flex gap-2 border-t border-[var(--border)] pt-3">
                <button type="button" onClick={() => handleAccept(r.friendship.id)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--red)] px-3 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-[#bd1026] motion-reduce:transition-none">
                  <Check className="h-4 w-4" /> Aceitar
                </button>
                <button type="button" onClick={() => handleReject(r.friendship.id)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-[10px] font-black uppercase tracking-wide text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)] motion-reduce:transition-none">
                  <X className="h-4 w-4" /> Recusar
                </button>
              </div>
            </article>
          ))}
          {received.length === 0 && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center md:col-span-2 lg:col-span-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)]"><Check className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-black text-[var(--text)]">Tudo em dia</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Nenhuma solicitação recebida.</p>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'sent' && (
        <section aria-label="Solicitações enviadas" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sent.map(s => (
            <article key={s.friendship.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--red)]/20 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none sm:p-5">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--bg)] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                <Clock3 className="h-3 w-3" /> Solicitação enviada
              </span>
              <div className="flex min-w-0 items-center gap-3">
                <FriendAvatar user={s.user} size="md" />
                <button type="button" onClick={() => navigate(`/profile/${s.user.id}`)} className="min-w-0 flex-1 text-left focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]/30">
                  <span className="block truncate text-base font-black text-[var(--text)]">{s.user.name}</span>
                  <span className="mt-2 block"><Presence online={s.user.online} /></span>
                </button>
              </div>
              <button type="button" onClick={() => handleCancel(s.friendship.id)} className="mt-auto inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-[10px] font-black uppercase tracking-wide text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)] motion-reduce:transition-none">
                <X className="h-4 w-4" /> Cancelar
              </button>
            </article>
          ))}
          {sent.length === 0 && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center md:col-span-2 lg:col-span-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)]"><UserPlus className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-black text-[var(--text)]">Nenhum convite pendente</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">As solicitações que você enviar vão aparecer aqui.</p>
              </div>
              <button type="button" onClick={() => handleTabChange('add')} className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-[10px] font-black uppercase tracking-wide text-[var(--red)] transition-colors hover:bg-[var(--soft)]">
                Encontrar amigos <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'add' && (
        <section aria-label="Adicionar amigos" className="space-y-5">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--red)]">Encontre sua próxima conexão</p>
              <h2 className="mt-1 text-lg font-black uppercase tracking-tight text-[var(--text)] sm:text-xl">Adicionar amigos</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Busque jogadores da comunidade FUTSENAI.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    if (!e.target.value.trim()) void loadAddableUsers(true);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSearch(); }}
                  placeholder="Buscar usuário..."
                  aria-label="Buscar usuário"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-10 pr-3 text-sm text-[var(--text)] transition-colors focus:border-[var(--red)] focus:outline-none focus:ring-4 focus:ring-[var(--red)]/10"
                />
              </label>
              <button type="button" onClick={() => void handleSearch()} disabled={addLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--red)] px-5 text-[10px] font-black uppercase tracking-wide text-white transition-colors hover:bg-[#bd1026] disabled:opacity-50 motion-reduce:transition-none">
                <Search className="h-4 w-4" /> Buscar
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map(u => (
              <article key={u.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--red)]/20 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <FriendAvatar user={u} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-[var(--text)]">{u.name}</div>
                    <div className="mt-2"><Presence online={u.online} /></div>
                  </div>
                </div>
                <button type="button" onClick={() => handleSend(u.id)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--red)] px-3 text-[9px] font-black uppercase tracking-wide text-white transition-colors hover:bg-[#bd1026] motion-reduce:transition-none">
                  <UserPlus className="h-4 w-4" /> Adicionar
                </button>
              </article>
            ))}
          </div>
          {addLoading && <div role="status" aria-live="polite" className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)]">Carregando usuários...</div>}
          {!addLoading && results.length === 0 && (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)]"><Search className="h-5 w-5" /></div>
              <div>
                <h3 className="text-base font-black text-[var(--text)]">{query.trim() ? 'Nenhum jogador encontrado' : 'Nenhum jogador disponível'}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{query.trim() ? 'Tente buscar por outro nome.' : 'Volte mais tarde para encontrar novos jogadores.'}</p>
              </div>
            </div>
          )}
          {!query.trim() && addHasMore && (
            <button type="button" onClick={() => void loadAddableUsers()} disabled={addLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-[10px] font-black uppercase tracking-wide text-[var(--text)] transition-colors hover:bg-[var(--bg)] disabled:opacity-50 motion-reduce:transition-none">
              Carregar mais <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </section>
      )}
    </div>
  );
}
