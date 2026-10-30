import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import * as friendsService from '../lib/services/friends';
import Card from '../components/Card';
import type { PlayerCard } from '../types';

export default function FriendProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [squad, setSquad] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendship, setFriendship] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (!supabase || !userId) return;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const me = sess.session?.user?.id ?? null;
      setCurrentUserId(me);

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
      setProfile(prof);

      const { data: cs } = await supabase.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
      setCards((cs || []).map((c: any) => ({
        uid: c.id, playerId: c.player_id, name: c.name, position: c.position, sport: c.sport,
        nationality: c.nationality, age: c.age, club: c.club,
        rarity: c.rarity, edition: c.edition, special: c.special, overall: c.overall,
        pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling,
        defending: c.defending, physical: c.physical, reflexes: c.reflexes,
        positioning: c.positioning, handling: c.handling, image: c.image,
        favorite: c.favorite, isNew: c.is_new, obtainedAt: new Date(c.obtained_at).getTime(),
      })));

      const { data: sq } = await supabase.from('squads').select('*').eq('user_id', userId).eq('is_primary', true).maybeSingle();
      setSquad(sq);

      const { data: ms } = await supabase.from('matches').select('*').eq('user_id', userId).order('played_at', { ascending: false }).limit(20);
      setMatches(ms || []);

      const { data: ach } = await supabase.from('achievements').select('*').eq('user_id', userId).eq('unlocked', true);
      setAchievements(ach || []);

      // friendship status
      if (me && me !== userId) {
        const { data: f } = await supabase.from('friendships').select('*')
          .or(`and(requester_id.eq.${me},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${me})`);
        setFriendship(f && f.length > 0 ? f[0] : null);
      }

      setLoading(false);
    })();
  }, [userId]);

  const handleAdd = async () => {
    if (!currentUserId || !userId) return;
    const ok = await friendsService.sendRequest(currentUserId, userId);
    setActionMsg(ok ? 'Solicitação enviada!' : 'Já existe uma solicitação ou amizade.');
    // reload friendship
    const { data: f } = await supabase!.from('friendships').select('*').or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${currentUserId})`);
    setFriendship(f && f.length > 0 ? f[0] : null);
    setTimeout(() => setActionMsg(''), 2000);
  };
  const handleAccept = async () => {
    if (!friendship) return;
    await friendsService.acceptRequest(friendship.id);
    const { data: f } = await supabase!.from('friendships').select('*').eq('id', friendship.id).single();
    setFriendship(f);
  };
  const handleCancel = async () => {
    if (!friendship) return;
    await friendsService.cancelRequest(friendship.id);
    setFriendship(null);
  };
  const handleRemove = async () => {
    if (!friendship) return;
    await friendsService.removeFriend(friendship.id);
    setFriendship(null);
  };

  if (loading) return <div className="p-8 text-[#858A98]">Carregando...</div>;
  if (!profile) return <div className="p-8 text-[#858A98]">Perfil não encontrado. <button onClick={() => navigate(-1)} className="text-[#E30613]">Voltar</button></div>;

  const wins = matches.filter(m => m.home_score > m.away_score).length;
  const losses = matches.filter(m => m.home_score < m.away_score).length;
  const winRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const rareCount = cards.filter(c => ['rare', 'epic', 'legendary', 'icon'].includes(c.rarity)).length;
  const specialCount = cards.filter(c => c.special && c.special !== 'none').length;

  const isSelf = currentUserId === userId;
  const isFriend = friendship?.status === 'accepted';
  const isPendingReceived = friendship?.status === 'pending' && friendship.addressee_id === currentUserId;
  const isPendingSent = friendship?.status === 'pending' && friendship.requester_id === currentUserId;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-[#858A98] hover:text-[#252733]">← Voltar</button>

      <div className="card-surface p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold text-3xl">
          {(profile.name || '?').charAt(0)}
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-2xl font-semibold text-[#252733]">{profile.name}</div>
          <div className="text-sm text-[#858A98]">
            Nível {profile.level ?? 1} · {profile.xp ?? 0} XP · {profile.coins ?? 0} moedas
          </div>
          <div className="text-xs text-[#858A98]">
            Entrou em: {profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}
          </div>
          <div className="text-xs text-[#858A98]">{profile.online ? 'Online' : 'Offline'}</div>
        </div>
        {!isSelf && (
          <div className="flex flex-col gap-2">
            {isFriend && (
              <>
                <button onClick={handleRemove} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium text-[#252733]">Remover amigo</button>
                <button onClick={() => navigate(`/match?opponent=${userId}`)} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Desafiar</button>
              </>
            )}
            {isPendingReceived && (
              <>
                <button onClick={handleAccept} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Aceitar</button>
                <button onClick={handleCancel} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium">Recusar</button>
              </>
            )}
            {isPendingSent && (
              <button onClick={handleCancel} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium">Cancelar solicitação</button>
            )}
            {!friendship && (
              <button onClick={handleAdd} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Adicionar amigo</button>
            )}
            {actionMsg && <div className="text-xs text-[#E30613]">{actionMsg}</div>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Partidas', value: matches.length },
          { label: 'Vitórias', value: wins },
          { label: 'Derrotas', value: losses },
          { label: 'Taxa de vitória', value: `${winRate}%` },
          { label: 'Cartas', value: cards.length },
          { label: 'Cartas raras+', value: rareCount },
          { label: 'Cartas especiais', value: specialCount },
          { label: 'Conquistas', value: achievements.length },
        ].map(s => (
          <div key={s.label} className="card-surface p-3">
            <div className="text-xs text-[#858A98]">{s.label}</div>
            <div className="text-xl font-bold text-[#252733]">{s.value}</div>
          </div>
        ))}
      </div>

      {squad && (
        <div className="card-surface p-4 space-y-2">
          <h2 className="text-lg font-semibold text-[#252733]">Elenco principal</h2>
          <div className="text-sm text-[#858A98]">Formação: {squad.formation}</div>
          <div className="text-sm text-[#252733]">Overall: <span className="font-bold text-[#E30613]">{Math.round((squad.starters || []).filter((s: any) => s).map((uid: string) => cards.find(c => c.uid === uid)?.overall ?? 0).reduce((a: number, b: number) => a + b, 0) / Math.max(1, (squad.starters || []).filter(Boolean).length)) || 0}</span></div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-[#252733] mb-3">Coleção ({cards.length})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {cards.slice(0, 24).map(c => <Card key={c.uid} card={c} size="sm" />)}
        </div>
        {cards.length === 0 && <div className="text-[#858A98]">Sem cartas.</div>}
      </div>

      {achievements.length > 0 && (
        <div className="card-surface p-4">
          <h2 className="text-lg font-semibold text-[#252733] mb-3">Conquistas</h2>
          <div className="flex flex-wrap gap-2">
            {achievements.map((a: any) => (
              <span key={a.id} className="px-3 py-1 rounded-full bg-[#FFF0F2] text-[#E30613] text-xs font-medium">{a.title || a.achievement_id}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
