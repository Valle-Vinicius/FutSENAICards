import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/useGame';
import { supabase } from '../lib/supabase';
import * as friendsService from '../lib/services/friends';
import type { FriendUser } from '../lib/services/friends';

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
    let interval: ReturnType<typeof setInterval> | null = null;
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
        const updateLastSeen = async () => {
          const { error } = await supabase!.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid);
          if (error) console.error('friend presence update failed', error);
        };
        void updateLastSeen();
        interval = setInterval(() => { void updateLastSeen(); }, 60000);
      } catch (error) {
        console.error('friends page initialization failed', error);
      }
    })();
    return () => {
      active = false;
      unsubscribe();
      if (interval) clearInterval(interval);
    };
  }, [load]);

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
    <div className="p-4 md:p-8 space-y-4">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Amizades</h1>
      {tableMissing && (
        <div className="card-surface p-4 text-sm text-[#252733]">
          A tabela <code>friendships</code> não existe no Supabase. Rode o SQL de <code>supabase/friends.sql</code> no SQL Editor do Supabase.
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'received', 'sent', 'add'] as const).map(t => (
          <button key={t} onClick={() => handleTabChange(t)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${tab === t ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>
            {t === 'all' ? 'Todos os amigos' : t === 'received' ? `Solicitações recebidas (${received.length})` : t === 'sent' ? 'Enviadas' : 'Adicionar amigos'}
          </button>
        ))}
      </div>
      {msg && <div className="text-sm text-[#E30613]">{msg}</div>}

      {tab === 'all' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {friends.map(f => (
            <div key={f.id} onClick={() => navigate(`/profile/${f.id}`)} className="card-surface p-3 flex items-center gap-3 cursor-pointer hover:shadow-md">
              <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold overflow-hidden">
                {f.avatar_url ? <img src={f.avatar_url} alt={f.name} className="w-full h-full object-cover" /> : f.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-[#252733]">{f.name}</div>
                <div className="text-xs text-[#858A98]">{f.online ? 'Online' : 'Offline'}</div>
              </div>
            </div>
          ))}
          {friends.length === 0 && <div className="text-[#858A98]">Nenhum amigo ainda.</div>}
        </div>
      )}

      {tab === 'received' && (
        <div className="space-y-2">
          {received.map(r => (
            <div key={r.friendship.id} className="card-surface p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/profile/${r.user.id}`)}>
                <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold overflow-hidden relative">
                  {r.user.avatar_url ? <img src={r.user.avatar_url} alt={r.user.name} className="w-full h-full object-cover" /> : r.user.name.charAt(0)}
                  {r.user.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
                </div>
                <div className="text-sm text-[#252733]">{r.user.name}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleAccept(r.friendship.id)} className="px-3 py-1.5 rounded-xl bg-[#E30613] text-white text-xs font-medium">Aceitar</button>
                <button onClick={() => handleReject(r.friendship.id)} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-xs font-medium">Recusar</button>
              </div>
            </div>
          ))}
          {received.length === 0 && <div className="text-[#858A98]">Nenhuma solicitação recebida.</div>}
        </div>
      )}

      {tab === 'sent' && (
        <div className="space-y-2">
          {sent.map(s => (
            <div key={s.friendship.id} className="card-surface p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/profile/${s.user.id}`)}>
                <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold overflow-hidden relative">
                  {s.user.avatar_url ? <img src={s.user.avatar_url} alt={s.user.name} className="w-full h-full object-cover" /> : s.user.name.charAt(0)}
                  {s.user.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
                </div>
                <div className="text-sm text-[#252733]">{s.user.name}</div>
              </div>
              <button onClick={() => handleCancel(s.friendship.id)} className="px-3 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-xs font-medium">Cancelar</button>
            </div>
          ))}
          {sent.length === 0 && <div className="text-[#858A98]">Nenhuma solicitação enviada.</div>}
        </div>
      )}

      {tab === 'add' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (!e.target.value.trim()) void loadAddableUsers(true);
              }}
              onKeyDown={e => { if (e.key === 'Enter') void handleSearch(); }}
              placeholder="Buscar usuário..."
              className="flex-1 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm"
            />
            <button onClick={() => void handleSearch()} disabled={addLoading} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium disabled:opacity-50">Buscar</button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map(u => (
              <div key={u.id} className="card-surface p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold overflow-hidden relative">
                    {u.avatar_url ? <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" /> : u.name.charAt(0)}
                    {u.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
                  </div>
                  <div className="text-sm text-[#252733]">{u.name}</div>
                </div>
                <button onClick={() => handleSend(u.id)} className="px-3 py-1.5 rounded-xl bg-[#E30613] text-white text-xs font-medium">Adicionar</button>
              </div>
            ))}
          </div>
          {addLoading && <div className="text-sm text-[#858A98]">Carregando usuários...</div>}
          {!addLoading && results.length === 0 && <div className="text-sm text-[#858A98]">{query.trim() ? 'Nenhum usuário encontrado.' : 'Não há usuários disponíveis para adicionar.'}</div>}
          {!query.trim() && addHasMore && (
            <button onClick={() => void loadAddableUsers()} disabled={addLoading} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium text-[#252733] disabled:opacity-50">
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
