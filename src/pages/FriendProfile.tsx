import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import * as friendsService from '../lib/services/friends';
import * as challengesService from '../lib/services/challenges';
import * as poolService from '../lib/services/pool';
import Card from '../components/Card';
import type { PlayerCard } from '../types';
import { FORMATIONS_FUTSAL as FS } from '../lib/game';
import { useGame } from '../store/useGame';

export default function FriendProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [squad, setSquad] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friendship, setFriendship] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [poolWagerOpen, setPoolWagerOpen] = useState(false);
  const [poolWagerType, setPoolWagerType] = useState<'coins' | 'card'>('coins');
  const [poolCoinChoice, setPoolCoinChoice] = useState('500');
  const [poolCustomCoins, setPoolCustomCoins] = useState('');
  const [poolCardId, setPoolCardId] = useState('');
  const [poolCardSearch, setPoolCardSearch] = useState('');
  const [availableWagerCardIds, setAvailableWagerCardIds] = useState<string[] | null>(null);
  const [poolSubmitting, setPoolSubmitting] = useState(false);
  const currentCoins = useGame(s => s.coins);
  const myCards = useGame(s => s.cards);
  const syncUserData = useGame(s => s.syncUserData);

  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return; }
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const me = sess.session?.user?.id ?? null;
        setCurrentUserId(me);
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
        setProfile(prof);
        const { data: cs } = await supabase.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
        setCards((cs || []).map((c: any) => ({
          uid: c.id, playerId: c.player_id, name: c.name, position: c.position, sport: c.sport,
          nationality: c.nationality, age: c.age, club: c.club,
          rarity: c.rarity, edition: c.edition, special: c.special, overall: c.overall,
          pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling,
          defending: c.defending, physical: c.physical, reflexes: c.reflexes,
          positioning: c.positioning, handling: c.handling, image: c.image,
          favorite: c.favorite, isNew: c.is_new, obtainedAt: new Date(c.obtained_at).getTime(),
        })));
        const { data: ms } = await supabase.from('matches').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
        setMatches(ms || []);
        const { data: ach } = await supabase.from('achievements').select('*').eq('user_id', userId).eq('unlocked', true);
        setAchievements(ach || []);
        const { data: sq, error: sqErr } = await supabase.from('squads').select('*').eq('user_id', userId).eq('is_primary', true).maybeSingle();
        if (sqErr) console.error('[FriendProfile] squad error:', sqErr);
        if (sq) {
          const positions = (FS as any)[sq.formation] || (FS as any)['1-2-1'];
          const normalized = (sq.starters || []).map((uid: string | null, i: number) => ({
            position: positions[i] || 'Ala',
            uid: uid || null,
          }));
          console.log('[FriendProfile] starters raw:', sq.starters);
          console.log('[FriendProfile] starters normalizados:', normalized);
          const uids = normalized.map((s: any) => s.uid).filter(Boolean);
          let cardMap = new Map();
          if (uids.length > 0) {
            const { data: cs2 } = await supabase.from('cards').select('*').in('id', uids);
            (cs2 || []).forEach((c: any) => cardMap.set(c.id, c));
          }
          console.log('[FriendProfile] cartas encontradas:', cardMap.size, 'de', uids.length);
          setSquad({ ...sq, starters: normalized, cardMap });
        }
        if (me && me !== userId) {
          const { data: f } = await supabase.from('friendships').select('*')
            .or(`and(requester_id.eq.${me},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${me})`);
          setFriendship(f && f.length > 0 ? f[0] : null);
        }
      } catch (error) {
        console.error('[FriendProfile] load failed', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!poolWagerOpen) return;
    let active = true;
    void poolService.getAvailableWagerCardIds().then(ids => {
      if (active) setAvailableWagerCardIds(ids);
    }).catch(error => {
      console.error('pool wager cards load failed', error);
      if (active) {
        setAvailableWagerCardIds([]);
        setActionMsg('Não foi possível carregar as cartas disponíveis para aposta.');
      }
    });
    return () => { active = false; };
  }, [poolWagerOpen]);

  const reloadFriendship = async () => {
    if (!currentUserId || !userId || !supabase) return;
    const { data: f } = await supabase.from('friendships').select('*')
      .or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${currentUserId})`);
    setFriendship(f && f.length > 0 ? f[0] : null);
  };

  const handleAdd = async () => {
    if (!currentUserId || !userId) return;
    const ok = await friendsService.sendRequest(currentUserId, userId);
    setActionMsg(ok ? 'Solicitação enviada!' : 'Já existe uma solicitação ou amizade.');
    await reloadFriendship();
    setTimeout(() => setActionMsg(''), 2000);
  };
  const handleAccept = async () => {
    if (!friendship) return;
    await friendsService.acceptRequest(friendship.id);
    await reloadFriendship();
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
  const handleChallenge = async () => {
    if (!currentUserId || !userId) return;
    try {
      const challenge = await challengesService.createChallenge(currentUserId, userId);
      if (challenge) navigate(`/match?challenge=${challenge.id}`);
      else setActionMsg('Já existe um desafio ativo entre vocês.');
    } catch (error) {
      console.error('challenge creation failed', error);
      setActionMsg('Não foi possível criar o desafio. Verifique a amizade e tente novamente.');
    }
  };

  const handlePool = async () => {
    if (!currentUserId || !userId) return;
    setActionMsg('');
    setAvailableWagerCardIds(null);
    setPoolWagerOpen(true);
  };

  const sendPoolChallenge = async () => {
    if (!userId || !currentUserId) return;
    const stake = poolCoinChoice === 'custom' ? Number(poolCustomCoins) : Number(poolCoinChoice);
    if (poolWagerType === 'coins' && (!Number.isInteger(stake) || stake < 1 || stake > 1000000)) {
      setActionMsg('Informe uma aposta inteira entre 1 e 1.000.000 moedas.');
      return;
    }
    if (poolWagerType === 'card' && !poolCardId) {
      setActionMsg('Selecione uma carta para apostar.');
      return;
    }
    setPoolSubmitting(true);
    setActionMsg('');
    try {
      const result = await poolService.createPoolMatch(
        userId,
        poolWagerType === 'coins'
          ? { type: 'coins', amount: stake }
          : { type: 'card', cardId: poolCardId },
      );
      if (!result.matchId) {
        const msg = result.error?.includes('Active match exists')
          ? 'Já existe uma partida de sinuca ativa entre vocês. Termine ou cancele esse convite antes de enviar outro.'
          : result.error || 'Não foi possível criar a partida de sinuca.';
        setActionMsg(msg);
        return;
      }
      void syncUserData(currentUserId).catch(error => {
        console.error('pool wager wallet sync failed', error);
      });
      setPoolWagerOpen(false);
      setActionMsg('Convite de sinuca com aposta enviado. Aguardando aceite...');
      if (supabase) {
        const channel = supabase!.channel(`pool-invite-${result.matchId}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pool_matches', filter: `id=eq.${result.matchId}` }, (payload: any) => {
            if (payload.new?.status === 'accepted' || payload.new?.status === 'playing') {
              setActionMsg('');
              navigate(`/pool/${result.matchId}`);
              supabase!.removeChannel(channel);
            }
            if (['declined','cancelled','forfeited','finished','expired'].includes(payload.new?.status)) {
              setActionMsg('Convite de sinuca não pôde ser aceito (' + payload.new?.status + ').');
              supabase!.removeChannel(channel);
            }
          })
          .subscribe();
      }
    } catch (error) {
      console.error('pool creation failed', error);
      setActionMsg(error instanceof Error ? error.message : 'Erro ao criar partida de sinuca.');
    } finally {
      setPoolSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-[#858A98]">Carregando...</div>;
  if (!profile) return <div className="p-8 text-[#858A98]">Perfil não encontrado. <button onClick={() => navigate(-1)} className="text-[#E30613]">Voltar</button></div>;

  const wins = matches.filter(m => m.home_score > m.away_score).length;
  const losses = matches.filter(m => m.home_score < m.away_score).length;
  const winRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const rareCount = cards.filter(c => ['rare', 'epic', 'legendary', 'icon'].includes(c.rarity)).length;
  const specialCount = cards.filter(c => c.special && c.special !== 'none').length;
  const rarest = [...cards].sort((a, b) => b.overall - a.overall)[0];

  const isSelf = currentUserId === userId;
  const isFriend = friendship?.status === 'accepted';
  const isPendingReceived = friendship?.status === 'pending' && friendship.addressee_id === currentUserId;
  const isPendingSent = friendship?.status === 'pending' && friendship.requester_id === currentUserId;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-[#858A98] hover:text-[#252733]">← Voltar</button>

      {/* Cabeçalho */}
      <div className="card-surface p-4 md:p-6 flex flex-col md:flex-row items-center gap-4 md:gap-6">
        <div className="w-24 h-24 rounded-full bg-[#FFF0F2] flex items-center justify-center text-3xl text-[#E30613] font-bold overflow-hidden shrink-0">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : (profile.level ?? 1)}
        </div>
        <div className="flex-1 min-w-0 text-center md:text-left space-y-1">
          <div className="text-xl font-bold text-[#252733] truncate">{profile.name}</div>
          <div className="text-sm text-[#858A98]">Nível {profile.level ?? 1} · {profile.xp ?? 0} XP</div>
          <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden max-w-xs mx-auto md:mx-0">
            <div className="h-full bg-[#E30613]" style={{ width: `${Math.min(100, (((profile.xp ?? 0) - ((profile.level ?? 1) - 1) * 500) / 500) * 100)}%` }} />
          </div>
          <div className="text-xs text-[#858A98]">{(profile.xp ?? 0) - ((profile.level ?? 1) - 1) * 500} / 500 XP para o próximo nível</div>
          {!isSelf && (
            <div className="flex flex-wrap gap-2 mt-2 justify-center md:justify-start">
              {isFriend && (
                <>
                  <button onClick={handleRemove} className="px-4 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium text-[#252733]">Remover amigo</button>
                  <button onClick={handleChallenge} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Desafiar</button>
                <button onClick={handlePool} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Jogar sinuca</button>
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
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Partidas', value: matches.length, icon: null },
          { label: 'Vitórias', value: wins, icon: null },
          { label: 'Derrotas', value: losses, icon: null },
          { label: 'Taxa de vitória', value: `${winRate}%`, icon: null },
          { label: 'Cartas', value: cards.length, icon: null },
          { label: 'Cartas raras+', value: rareCount, icon: null },
          { label: 'Cartas especiais', value: specialCount, icon: null },
          { label: 'Conquistas', value: achievements.length, icon: null },
        ].map(s => (
          <div key={s.label} className="card-surface p-3">
            <div className="text-xs text-[#858A98]">{s.label}</div>
            <div className="text-xl font-bold text-[#252733]">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Elenco atual */}
      {squad && squad.starters && squad.starters.some((s: any) => (typeof s === 'string' ? s : s?.uid)) && (
        <div className="card-surface p-4 space-y-2">
          <div className="text-sm font-medium text-[#858A98]">Elenco atual · Formação {squad.formation}</div>
          <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
            {squad.starters.slice(0, 3).map((s: any, i: number) => {
              const uid = typeof s === 'string' ? s : s?.uid;
              const card = cards.find((c: any) => c.uid === uid);
              return (
                <div key={i} className="flex flex-col items-center">
                  {card ? <Card card={card} size="sm" /> : <div className="w-32 h-44 rounded-xl border-2 border-dashed border-[#E9EAF0] flex items-center justify-center text-xs text-[#858A98]">{typeof s === 'string' ? 'Slot' : s?.position}</div>}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
            <div />
            {squad.starters.slice(3, 5).map((s: any, i: number) => {
              const uid = typeof s === 'string' ? s : s?.uid;
              const card = cards.find((c: any) => c.uid === uid);
              return (
                <div key={i} className="flex flex-col items-center">
                  {card ? <Card card={card} size="sm" /> : <div className="w-32 h-44 rounded-xl border-2 border-dashed border-[#E9EAF0] flex items-center justify-center text-xs text-[#858A98]">{typeof s === 'string' ? 'Slot' : s?.position}</div>}
                </div>
              );
            })}
            <div />
          </div>
        </div>
      )}

      {/* Carta mais rara */}
      {rarest && (
        <div className="card-surface p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="shrink-0">
            <Card card={rarest} size="lg" />
          </div>
          <div className="space-y-2 text-center md:text-left">
            <div className="text-sm font-medium text-[#858A98]">Carta mais rara</div>
            <div className="text-2xl font-bold text-[#252733]">{rarest.name}</div>
            <div className="text-lg text-[#E30613] font-bold">OVR {rarest.overall} · {rarest.rarity}</div>
            <div className="text-sm text-[#858A98]">{rarest.position} · {rarest.club}</div>
          </div>
        </div>
      )}

      {/* Coleção */}
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
      {poolWagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pool-wager-title">
          <div className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#E30613]">Sinuca · desafio com aposta</div>
              <h2 id="pool-wager-title" className="mt-1 text-xl font-bold text-[#252733]">Escolha o que apostar contra {profile.name}</h2>
              <p className="mt-1 text-sm text-[#858A98]">O adversário precisa igualar a aposta para aceitar. O vencedor leva o total; se o convite for cancelado, a aposta é devolvida.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['coins', 'Moedas'],
                ['card', 'Carta'],
              ] as const).map(([type, label]) => (
                <button key={type} type="button" aria-pressed={poolWagerType === type} onClick={() => { setPoolWagerType(type); setActionMsg(''); }} className={`rounded-xl border p-3 text-left text-sm font-semibold ${poolWagerType === type ? 'border-[#E30613] bg-[#FFF0F2] text-[#E30613]' : 'border-[#E9EAF0] text-[#252733]'}`}>
                  Apostar {label.toLowerCase()}
                </button>
              ))}
            </div>
            {poolWagerType === 'coins' ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-[#252733]">Valor por jogador</div>
                <div className="flex flex-wrap gap-2">
                  {['500', '1000', '5000', 'custom'].map(value => (
                    <button key={value} type="button" onClick={() => setPoolCoinChoice(value)} className={`rounded-lg border px-3 py-2 text-sm ${poolCoinChoice === value ? 'border-[#E30613] bg-[#FFF0F2] text-[#E30613]' : 'border-[#E9EAF0]'}`}>
                      {value === 'custom' ? 'Personalizado' : `${Number(value).toLocaleString('pt-BR')} moedas`}
                    </button>
                  ))}
                </div>
                {poolCoinChoice === 'custom' && <input type="number" min={1} max={1000000} step={1} value={poolCustomCoins} onChange={event => setPoolCustomCoins(event.target.value)} placeholder="Valor personalizado" className="w-full max-w-xs rounded-xl border border-[#E9EAF0] px-3 py-2 text-sm" />}
                <p className="text-xs text-[#858A98]">Sua aposta: {(poolCoinChoice === 'custom' ? Number(poolCustomCoins) : Number(poolCoinChoice)).toLocaleString('pt-BR')} moedas · Saldo: {currentCoins.toLocaleString('pt-BR')}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={poolCardSearch} onChange={event => setPoolCardSearch(event.target.value)} placeholder="Pesquisar sua carta..." className="w-full rounded-xl border border-[#E9EAF0] px-3 py-2 text-sm" />
                {availableWagerCardIds === null ? (
                  <p className="text-sm text-[#858A98]">Carregando cartas disponíveis...</p>
                ) : (
                  <div className="grid grid-cols-2 justify-items-center gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {myCards.filter(card => availableWagerCardIds.includes(card.uid) && card.name.toLowerCase().includes(poolCardSearch.trim().toLowerCase())).map(card => (
                      <div key={card.uid} className={`rounded-2xl p-1 ${poolCardId === card.uid ? 'ring-2 ring-[#E30613]' : ''}`}>
                        <Card card={card} size="sm" onClick={() => setPoolCardId(card.uid)} />
                      </div>
                    ))}
                    {myCards.filter(card => availableWagerCardIds.includes(card.uid) && card.name.toLowerCase().includes(poolCardSearch.trim().toLowerCase())).length === 0 && <p className="col-span-full py-4 text-sm text-[#858A98]">Sem cartas disponíveis para aposta.</p>}
                  </div>
                )}
              </div>
            )}
            {actionMsg && <p role="alert" className="text-sm text-[#E30613]">{actionMsg}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={poolSubmitting || (poolWagerType === 'coins' && ((poolCoinChoice === 'custom' ? Number(poolCustomCoins) : Number(poolCoinChoice)) > currentCoins)) || (poolWagerType === 'card' && !poolCardId)} onClick={() => void sendPoolChallenge()} className="rounded-xl bg-[#E30613] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {poolSubmitting ? 'Enviando...' : 'Enviar convite de sinuca'}
              </button>
              <button type="button" onClick={() => { setPoolWagerOpen(false); setActionMsg(''); }} className="rounded-xl border border-[#E9EAF0] px-4 py-2 text-sm font-medium text-[#252733]">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
