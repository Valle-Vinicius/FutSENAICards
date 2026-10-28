import { useEffect, useState } from 'react';
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
  const [userId, setUserId] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [msg, setMsg] = useState('');
  const setPendingFriends = useGame(s => s.setPendingFriends);

  const load = async (uid: string) => {
    setFriends(await friendsService.getFriends(uid));
    const rec = await friendsService.getPendingReceived(uid);
    setReceived(rec);
    setPendingFriends(rec.length);
    setSent(await friendsService.getPendingSent(uid));
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }: { data: any }) => {
      const uid = data.session?.user?.id;
      if (!uid) return;
      // check table exists
      if (!supabase) return;
      const { error: tErr } = await supabase.from('friendships').select('id').limit(1);
      if (tErr) { setTableMissing(true); return; }
      setUserId(uid);
      await load(uid);
      const unsub = friendsService.subscribeFriends(uid, () => load(uid));
      return () => unsub();
    });
  }, []);

  const handleSearch = async () => {
    if (!userId || query.trim().length < 2) return;
    setResults(await friendsService.searchUsers(query.trim(), userId));
  };

  const handleSend = async (fid: string) => {
    if (!userId) return;
    const ok = await friendsService.sendRequest(userId, fid);
    setMsg(ok ? 'Solicitação enviada!' : 'Já existe uma solicitação ou amizade.');
    if (ok && userId) await load(userId);
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
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${tab === t ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>
            {t === 'all' ? 'Todos os amigos' : t === 'received' ? `Solicitações recebidas (${received.length})` : t === 'sent' ? 'Enviadas' : 'Adicionar amigos'}
          </button>
        ))}
      </div>
      {msg && <div className="text-sm text-[#E30613]">{msg}</div>}

      {tab === 'all' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {friends.map(f => (
            <div key={f.id} className="card-surface p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold">
                {f.name.charAt(0)}
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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold">{r.user.name.charAt(0)}</div>
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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold">{s.user.name.charAt(0)}</div>
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
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar usuário..." className="flex-1 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
            <button onClick={handleSearch} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Buscar</button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map(u => (
              <div key={u.id} className="card-surface p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold">{u.name.charAt(0)}</div>
                  <div className="text-sm text-[#252733]">{u.name}</div>
                </div>
                <button onClick={() => handleSend(u.id)} className="px-3 py-1.5 rounded-xl bg-[#E30613] text-white text-xs font-medium">Adicionar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
