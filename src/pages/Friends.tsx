import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Search, UserPlus, Users, X } from 'lucide-react';
import { useGame } from '../store/useGame';
import { supabase } from '../lib/supabase';
import * as friendsService from '../lib/services/friends';
import type { FriendUser } from '../lib/services/friends';

function FriendAvatar({ user, size = 'md' }: { user: FriendUser; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'md' ? 'h-14 w-14 text-lg' : 'h-12 w-12 text-base';
  const status = user.online ? 'Online' : 'Offline';

  return (
    <div className={`${sizeClass} relative shrink-0`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[var(--soft)] font-semibold text-[var(--red)] ring-2 ring-white">
        {user.avatar_url
          ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
          : user.name.charAt(0).toUpperCase()}
      </div>
      <span
        role="img"
        aria-label={status}
        title={status}
        className={`absolute bottom-0 right-0 z-10 h-3.5 w-3.5 rounded-full border-2 border-white ${user.online ? 'bg-green-500' : 'bg-[var(--muted)]'}`}
      />
    </div>
  );
}

function Presence({ online }: { online?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${online ? 'bg-[var(--soft)] text-[var(--red)]' : 'bg-[var(--bg)] text-[var(--muted)]'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-[var(--muted)]'}`} />
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
    <div className="mx-auto max-w-[1440px] space-y-5 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--red)]">
            <Users className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">Amizades</h1>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <nav aria-label="Navegação de amizades" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-1">
            {(['all', 'received', 'sent'] as const).map(t => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => handleTabChange(t)}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${tab === t ? 'bg-[var(--soft)] text-[var(--red)]' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
              >
                {t === 'all' ? 'Todos os amigos' : t === 'received' ? `Solicitações recebidas (${received.length})` : 'Enviadas'}
              </button>
            ))}
          </nav>
          <button
            type="button"
            aria-pressed={tab === 'add'}
            onClick={() => handleTabChange('add')}
            className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors motion-reduce:transition-none sm:w-auto ${tab === 'add' ? 'bg-[var(--text)] text-white' : 'bg-[var(--red)] text-white hover:bg-[var(--text)]'}`}
          >
            <UserPlus className="h-4 w-4" />
            Adicionar amigos
          </button>
        </div>
      </header>
      {tableMissing && (
        <div className="card-surface p-4 text-sm text-[var(--text)]">
          A tabela <code>friendships</code> não existe no Supabase. Rode o SQL de <code>supabase/friends.sql</code> no SQL Editor do Supabase.
        </div>
      )}
      {msg && <div role="status" aria-live="polite" className="card-surface border-[var(--soft)] px-4 py-3 text-sm text-[var(--red)]">{msg}</div>}

      {tab === 'all' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {friends.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => navigate(`/profile/${f.id}`)}
              className="card-surface group flex min-h-24 w-full items-center gap-4 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--red)]/20 motion-reduce:transform-none motion-reduce:transition-none sm:p-5"
              aria-label={`Perfil de ${f.name}, ${f.online ? 'online' : 'offline'}`}
            >
              <FriendAvatar user={f} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--text)]">{f.name}</span>
                <span className="mt-2 block"><Presence online={f.online} /></span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </button>
          ))}
          {friends.length === 0 && (
            <div className="card-surface flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center sm:col-span-2 xl:col-span-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)]"><Users className="h-5 w-5" /></div>
              <div className="text-sm text-[var(--muted)]">Nenhum amigo ainda.</div>
            </div>
          )}
        </div>
      )}

      {tab === 'received' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {received.map(r => (
            <article key={r.friendship.id} className="card-surface flex min-w-0 flex-col gap-4 p-4 transition-shadow hover:border-[var(--red)]/20 motion-reduce:transition-none sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <FriendAvatar user={r.user} size="sm" />
                <button type="button" onClick={() => navigate(`/profile/${r.user.id}`)} className="min-w-0 flex-1 text-left focus-visible:rounded-sm">
                  <span className="block truncate text-sm font-medium text-[var(--text)]">{r.user.name}</span>
                  <span className="mt-1 block"><Presence online={r.user.online} /></span>
                </button>
              </div>
              <div className="mt-auto flex gap-2">
                <button onClick={() => handleAccept(r.friendship.id)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--red)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--text)] motion-reduce:transition-none">
                  <Check className="h-4 w-4" /> Aceitar
                </button>
                <button onClick={() => handleReject(r.friendship.id)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)] motion-reduce:transition-none">
                  <X className="h-4 w-4" /> Recusar
                </button>
              </div>
            </article>
          ))}
          {received.length === 0 && <div className="card-surface p-6 text-center text-sm text-[var(--muted)] sm:col-span-2 xl:col-span-3">Nenhuma solicitação recebida.</div>}
        </div>
      )}

      {tab === 'sent' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sent.map(s => (
            <article key={s.friendship.id} className="card-surface flex min-w-0 flex-col gap-4 p-4 transition-shadow hover:border-[var(--red)]/20 motion-reduce:transition-none sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <FriendAvatar user={s.user} size="sm" />
                <button type="button" onClick={() => navigate(`/profile/${s.user.id}`)} className="min-w-0 flex-1 text-left focus-visible:rounded-sm">
                  <span className="block truncate text-sm font-medium text-[var(--text)]">{s.user.name}</span>
                  <span className="mt-1 block"><Presence online={s.user.online} /></span>
                </button>
              </div>
              <button onClick={() => handleCancel(s.friendship.id)} className="mt-auto inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)] motion-reduce:transition-none">
                <X className="h-4 w-4" /> Cancelar
              </button>
            </article>
          ))}
          {sent.length === 0 && <div className="card-surface p-6 text-center text-sm text-[var(--muted)] sm:col-span-2 xl:col-span-3">Nenhuma solicitação enviada.</div>}
        </div>
      )}

      {tab === 'add' && (
        <div className="space-y-4">
          <div className="card-surface flex flex-col gap-3 p-3 sm:flex-row sm:p-4">
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
            <button onClick={() => void handleSearch()} disabled={addLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--red)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--text)] disabled:opacity-50 motion-reduce:transition-none">
              <Search className="h-4 w-4" /> Buscar
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map(u => (
              <article key={u.id} className="card-surface flex min-w-0 items-center justify-between gap-3 p-4 transition-shadow hover:border-[var(--red)]/20 motion-reduce:transition-none sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <FriendAvatar user={u} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text)]">{u.name}</div>
                    <div className="mt-1"><Presence online={u.online} /></div>
                  </div>
                </div>
                <button onClick={() => handleSend(u.id)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--red)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--text)] motion-reduce:transition-none">
                  <UserPlus className="h-4 w-4" /> Adicionar
                </button>
              </article>
            ))}
          </div>
          {addLoading && <div className="text-sm text-[var(--muted)]">Carregando usuários...</div>}
          {!addLoading && results.length === 0 && <div className="card-surface p-6 text-center text-sm text-[var(--muted)]">{query.trim() ? 'Nenhum usuário encontrado.' : 'Não há usuários disponíveis para adicionar.'}</div>}
          {!query.trim() && addHasMore && (
            <button onClick={() => void loadAddableUsers()} disabled={addLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg)] disabled:opacity-50 motion-reduce:transition-none">
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
