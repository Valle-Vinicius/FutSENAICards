import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Award, CircleDot, Shield, Swords, UserMinus, UserPlus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as friendsService from '../lib/services/friends';
import * as challengesService from '../lib/services/challenges';
import * as poolService from '../lib/services/pool';
import Card from '../components/Card';
import { useCardViewer } from '../hooks/useCardViewer';
import { RARITY_META } from '../types';
import type { PlayerCard } from '../types';
import { FORMATIONS_FUTSAL as FS, normalizeFutsalFormation } from '../lib/game';
import { PRESENCE_ONLINE_WINDOW_MS } from '../lib/presence';
import { useGame } from '../store/useGame';

const COURT_COORDINATES: Record<string, { x: number; y: number }[]> = {
  '1-2-1': [
    { x: 50, y: 88 },
    { x: 50, y: 66 },
    { x: 25, y: 47 },
    { x: 75, y: 47 },
    { x: 50, y: 27 },
  ],
  '2-2': [
    { x: 50, y: 88 },
    { x: 30, y: 65 },
    { x: 70, y: 65 },
    { x: 30, y: 35 },
    { x: 70, y: 35 },
  ],
};

const POSITION_LABELS: Record<string, string> = { GK: 'GOL', Fixo: 'FIXO', Ala: 'ALA', Pivo: 'PIVÔ' };

function mapProfileCard(card: any): PlayerCard {
  return {
    uid: card.id,
    playerId: card.player_id,
    name: card.name,
    position: card.position,
    sport: card.sport,
    nationality: card.nationality,
    age: card.age,
    club: card.club,
    rarity: card.rarity,
    edition: card.edition,
    special: card.special,
    overall: card.overall,
    pace: card.pace,
    shooting: card.shooting,
    passing: card.passing,
    dribbling: card.dribbling,
    defending: card.defending,
    physical: card.physical,
    reflexes: card.reflexes,
    positioning: card.positioning,
    handling: card.handling,
    extraStats: card.extra_stats,
    image: card.image,
    favorite: card.favorite,
    isNew: card.is_new,
    obtainedAt: new Date(card.obtained_at).getTime(),
  };
}

function isProfileOnline(lastSeen?: string) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < PRESENCE_ONLINE_WINDOW_MS;
}

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
  const { openCard: openCardViewer, viewer: cardViewer } = useCardViewer();
  const currentCoins = useGame(s => s.coins);
  const myCards = useGame(s => s.cards);
  const syncUserData = useGame(s => s.syncUserData);

  useEffect(() => {
    document.title = `${profile?.name ?? 'Perfil'} | FutSENAI Cards`;
  }, [profile?.name]);

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
        setCards((cs || []).map(mapProfileCard));
        const { data: ms } = await supabase.from('matches').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
        setMatches(ms || []);
        const { data: ach } = await supabase.from('achievements').select('*').eq('user_id', userId).eq('unlocked', true);
        setAchievements(ach || []);
        const { data: sq, error: sqErr } = await supabase.from('squads').select('*').eq('user_id', userId).eq('is_primary', true).maybeSingle();
        if (sqErr) console.error('[FriendProfile] squad error:', sqErr);
        if (sq) {
          const formation = normalizeFutsalFormation(sq.formation);
          const positions = FS[formation];
          const starters = Array.isArray(sq.starters) ? sq.starters : [];
          const normalized = positions.map((position, index) => ({
            position,
            uid: typeof starters[index] === 'string'
              ? starters[index]
              : typeof starters[index]?.uid === 'string' ? starters[index].uid : null,
          }));
          console.log('[FriendProfile] starters raw:', sq.starters);
          console.log('[FriendProfile] starters normalizados:', normalized);
          const uids = normalized.map((s: any) => s.uid).filter(Boolean);
          const cardMap = new Map<string, PlayerCard>();
          if (uids.length > 0) {
            const { data: cs2 } = await supabase.from('cards').select('*').in('id', uids);
            (cs2 || []).forEach((card: any) => cardMap.set(card.id, mapProfileCard(card)));
          }
          console.log('[FriendProfile] cartas encontradas:', cardMap.size, 'de', uids.length);
          setSquad({ ...sq, formation, starters: normalized, cardMap });
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

  if (loading) {
    return (
      <div className="mx-auto flex min-h-64 w-full max-w-[1680px] items-center justify-center p-8 text-sm font-semibold text-[var(--muted)]" aria-busy="true">
        <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--red)]" aria-hidden="true" />
        Carregando perfil do jogador...
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="mx-auto flex min-h-72 w-full max-w-[1680px] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--red)]"><Users className="h-6 w-6" /></div>
        <h1 className="text-xl font-black text-[var(--text)]">Perfil não encontrado</h1>
        <p className="text-sm text-[var(--muted)]">Este perfil não está disponível.</p>
        <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--red)] px-4 text-xs font-black uppercase tracking-wide text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>
    );
  }

  const wins = matches.filter(m => m.home_score > m.away_score).length;
  const losses = matches.filter(m => m.home_score < m.away_score).length;
  const winRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const rareCount = cards.filter(c => ['rare', 'epic', 'legendary', 'icon', 'secret'].includes(c.rarity)).length;
  const specialCount = cards.filter(c => c.special && c.special !== 'none').length;
  const featuredCard = [...cards].sort((a, b) => b.overall - a.overall)[0];
  const level = profile.level ?? 1;
  const xp = profile.xp ?? 0;
  const levelXp = Math.max(0, Math.min(500, xp - (level - 1) * 500));
  const xpProgress = Math.max(0, Math.min(100, (levelXp / 500) * 100));
  const profileOnline = isProfileOnline(profile.last_seen);
  const formation = squad ? normalizeFutsalFormation(squad.formation) : null;
  const coordinates = formation ? COURT_COORDINATES[formation] : undefined;

  const isSelf = currentUserId === userId;
  const isFriend = friendship?.status === 'accepted';
  const isPendingReceived = friendship?.status === 'pending' && friendship.addressee_id === currentUserId;
  const isPendingSent = friendship?.status === 'pending' && friendship.requester_id === currentUserId;

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-7 p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--muted)]">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 transition hover:bg-white hover:text-[var(--red)]">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
        <span aria-hidden="true">/</span>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
          <Link to="/friends" className="transition hover:text-[var(--red)]">Amizades</Link>
          <span aria-hidden="true">/</span>
          <span className="max-w-[50vw] truncate text-[var(--text)]">{profile.name}</span>
        </nav>
      </div>

      <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#17191f] p-4 text-white shadow-[0_18px_44px_rgba(27,30,39,0.15)] sm:p-6 lg:p-8" aria-labelledby="player-profile-title">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-[30rem] w-[30rem] rounded-full border-[42px] border-[#ed1b35]/15" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[-9rem] left-[28%] h-72 w-72 rotate-45 border border-white/[0.08]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 30px, rgba(255,255,255,.28) 31px, transparent 32px)' }} />
        <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.18fr)] xl:gap-10">
          <div className="flex flex-col items-center">
            <div className="mb-3 flex w-full max-w-[19rem] items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/55">Carta em destaque</span>
              {featuredCard && <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-white/70">OVR {featuredCard.overall} · {RARITY_META[featuredCard.rarity]?.label ?? featuredCard.rarity}</span>}
            </div>
            {featuredCard ? (
              <>
                <div className="relative w-full max-w-[19rem] rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_50%_42%,rgba(237,27,53,0.22),rgba(255,255,255,0.035)_52%,transparent_72%)] p-3 sm:p-4">
                  <Card card={featuredCard} size="fluid" onClick={() => openCardViewer(featuredCard)} />
                </div>
                <p className="mt-3 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-white/55">
                  <Activity className="h-3.5 w-3.5 text-[#ff8290]" /> Clique para visualizar em 3D
                </p>
              </>
            ) : (
              <div className="flex min-h-[22rem] w-full max-w-[19rem] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.04] px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.08] text-white/55"><Shield className="h-6 w-6" /></div>
                <p className="mt-4 text-sm font-bold text-white">Nenhuma carta disponível</p>
                <p className="mt-1 text-xs text-white/50">A carta principal será exibida quando fizer parte da coleção.</p>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col justify-center py-1 sm:py-3">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/15 bg-white/[0.08] text-xl font-black uppercase text-white shadow-lg sm:h-20 sm:w-20">
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt={`Avatar de ${profile.name}`} className="h-full w-full object-cover" />
                  : profile.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[9px] font-black uppercase tracking-[0.22em] text-[#ff8290]">Ficha do jogador</p>
                <h1 id="player-profile-title" className="break-words text-3xl font-black uppercase leading-[0.92] tracking-tight text-white sm:text-4xl lg:text-5xl">{profile.name}</h1>
                <span className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${profileOnline ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.06] text-white/55'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${profileOnline ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                  {profileOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Nível do jogador</p>
                  <p className="mt-1 text-4xl font-black leading-none tabular-nums text-white sm:text-5xl">{level}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/45">Experiência total</p>
                  <p className="mt-1 text-lg font-black tabular-nums text-white">{xp.toLocaleString('pt-BR')} <span className="text-xs font-bold text-white/50">XP</span></p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progresso de XP para o próximo nível" aria-valuemin={0} aria-valuemax={500} aria-valuenow={levelXp}>
                <div className="h-full rounded-full bg-gradient-to-r from-[#ed1b35] to-[#ff7887] transition-[width] duration-500" style={{ width: `${xpProgress}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[9px] font-semibold tabular-nums text-white/50">
                <span>{levelXp.toLocaleString('pt-BR')} / 500 XP no nível</span>
                <span>{Math.round(xpProgress)}%</span>
              </div>
            </div>

            {!isSelf && (
              <div className="mt-5 flex flex-wrap gap-2">
                {isFriend && (
                  <>
                    <button type="button" onClick={handleChallenge} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--red)] px-5 text-xs font-black uppercase tracking-[0.12em] text-white shadow-[0_8px_24px_rgba(227,6,19,0.22)] transition hover:-translate-y-0.5 hover:bg-[#bd1026] motion-reduce:transform-none">
                      <Swords className="h-4 w-4" /> Desafiar
                    </button>
                    <button type="button" onClick={handlePool} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 text-xs font-bold text-white transition hover:bg-white/[0.12]">
                      <CircleDot className="h-4 w-4" /> Jogar sinuca
                    </button>
                    <button type="button" onClick={handleRemove} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-white/65 transition hover:border-red-300/30 hover:bg-red-400/10 hover:text-white">
                      <UserMinus className="h-4 w-4" /> Remover amigo
                    </button>
                  </>
                )}
                {isPendingReceived && (
                  <>
                    <button type="button" onClick={handleAccept} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--red)] px-4 text-xs font-black text-white transition hover:bg-[#bd1026]">Aceitar solicitação</button>
                    <button type="button" onClick={handleCancel} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]">Recusar</button>
                  </>
                )}
                {isPendingSent && (
                  <button type="button" onClick={handleCancel} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]">Cancelar solicitação</button>
                )}
                {!friendship && (
                  <button type="button" onClick={handleAdd} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--red)] px-4 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#bd1026]">
                    <UserPlus className="h-4 w-4" /> Adicionar amigo
                  </button>
                )}
              </div>
            )}
            {actionMsg && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs font-semibold text-white/85">{actionMsg}</p>}
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="player-stats-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Números da trajetória</p>
            <h2 id="player-stats-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Estatísticas</h2>
          </div>
          <Activity className="mb-1 h-5 w-5 text-[var(--red)]" aria-hidden="true" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#17191f] text-white shadow-sm">
          <div className="border-b border-white/10 px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/45">Performance</div>
          <div className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: 'Partidas', value: matches.length },
              { label: 'Vitórias', value: wins },
              { label: 'Derrotas', value: losses },
              { label: 'Taxa de vitória', value: `${winRate}%` },
            ].map(stat => (
              <div key={stat.label} className="px-4 py-4 sm:px-5 sm:py-5">
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/45">{stat.label}</p>
                <p className="mt-2 text-3xl font-black leading-none tabular-nums sm:text-4xl">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-4 py-2.5 text-[8px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Coleção e conquistas</div>
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: 'Cartas', value: cards.length },
              { label: 'Cartas raras+', value: rareCount },
              { label: 'Cartas especiais', value: specialCount },
              { label: 'Conquistas', value: achievements.length },
            ].map((stat, index) => (
              <div key={stat.label} className="relative px-4 py-4 sm:px-5 sm:py-5">
                {index === 0 && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--red)]" />}
                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{stat.label}</p>
                <p className="mt-2 text-3xl font-black leading-none tabular-nums text-[var(--text)] sm:text-4xl">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="friend-squad-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Identidade tática</p>
            <h2 id="friend-squad-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Elenco atual</h2>
          </div>
          {formation && <span className="rounded-lg bg-white px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">Formação {formation}</span>}
        </div>
        {squad?.starters?.length ? (
          <div className="grid items-center gap-5 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)] md:p-6 lg:gap-8">
            <div className="mx-auto w-full max-w-[36rem] rounded-[1.35rem] border border-[#dfe8df] bg-[#eef4ef] p-1.5 shadow-inner">
              <div className="relative isolate aspect-[4/5] w-full overflow-hidden rounded-[1rem] border border-white/70 bg-[linear-gradient(140deg,#348550_0%,#277743_48%,#21683b_100%)] shadow-[inset_0_0_45px_rgba(9,42,21,0.22)]" role="group" aria-label={`Elenco de ${profile.name}, formação ${formation}`}>
                <div aria-hidden="true" className="pointer-events-none absolute inset-[3.2%] rounded-[1rem] border border-white/70" />
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-[3.2%] top-1/2 border-t border-white/65" />
                <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[29%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/65" />
                <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                <div aria-hidden="true" className="pointer-events-none absolute left-[31%] top-[3.2%] h-[9%] w-[38%] rounded-b-[18%] border border-t-0 border-white/65" />
                <div aria-hidden="true" className="pointer-events-none absolute bottom-[3.2%] left-[31%] h-[9%] w-[38%] rounded-t-[18%] border border-b-0 border-white/65" />
                <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[1.7%] -translate-x-1/2 text-[7px] font-black tracking-[0.22em] text-white/60 sm:text-[9px]">FUTSENAI · FUTSAL</span>
                {squad.starters.map((slot: any, index: number) => {
                  const uid = typeof slot === 'string' ? slot : slot?.uid;
                  const position = typeof slot === 'string' ? FS[formation ?? '1-2-1'][index] : slot?.position;
                  const card = uid ? (squad.cardMap?.get(uid) ?? cards.find(playerCard => playerCard.uid === uid)) : undefined;
                  const point = coordinates?.[index] ?? { x: 50, y: 50 };
                  const positionLabel = POSITION_LABELS[position] ?? position;
                  return (
                    <div key={`${position}-${index}`} className="absolute z-10 w-[19%] max-w-[112px]" style={{ left: `${point.x}%`, top: `${point.y}%`, transform: 'translate(-50%, -50%)' }}>
                      <span className="mb-1 block rounded bg-[#202a23]/90 px-1 py-1 text-center text-[7px] font-black tracking-[0.08em] text-white shadow sm:text-[9px]">{positionLabel}</span>
                      {card ? (
                        <Card card={card} size="fluid" onClick={() => openCardViewer(card)} />
                      ) : (
                        <div className="flex aspect-[7/10] w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/60 bg-white/[0.12] text-center text-white/80">
                          <span className="text-[8px] font-black uppercase tracking-wide sm:text-[10px]">{positionLabel}</span>
                          <span className="mt-1 text-[6px] font-semibold uppercase tracking-wide text-white/55 sm:text-[8px]">Vazio</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--red)]"><Users className="h-5 w-5" /></div>
              <h3 className="text-lg font-black text-[var(--text)]">{formation ? `Formação ${formation}` : 'Elenco cadastrado'}</h3>
              <p className="text-sm leading-6 text-[var(--muted)]">As cartas titulares refletem o elenco salvo pelo jogador. Selecione uma carta na quadra para abrir a visualização 3D.</p>
              <p className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--red)]">
                <Activity className="h-4 w-4" /> {squad.starters.filter((slot: any) => (typeof slot === 'string' ? slot : slot?.uid)).length} atletas escalados
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-white px-6 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--red)]"><Users className="h-6 w-6" /></div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Nenhum elenco cadastrado</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">O jogador ainda não salvou um elenco principal.</p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="friend-collection-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Cartas do jogador</p>
            <h2 id="friend-collection-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Coleção <span className="text-[var(--red)]">({cards.length})</span></h2>
          </div>
          {cards.length > 0 && <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">Clique em uma carta para visualizar em 3D</span>}
        </div>
        {cards.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {cards.slice(0, 24).map(card => (
              <div key={card.uid} className="mx-auto w-full min-w-0 max-w-[12rem] rounded-2xl border border-[var(--border)] bg-white p-1.5 shadow-sm transition hover:-translate-y-1 hover:shadow-md motion-reduce:transform-none">
                <Card card={card} size="fluid" onClick={() => openCardViewer(card)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)]"><Shield className="h-5 w-5" /></div>
            <div>
              <h3 className="text-base font-black text-[var(--text)]">Coleção vazia</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">Nenhuma carta disponível para exibir.</p>
            </div>
          </div>
        )}
      </section>

      {achievements.length > 0 && (
        <section className="space-y-3" aria-labelledby="friend-achievements-title">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Marcos da carreira</p>
            <h2 id="friend-achievements-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[var(--text)]">Conquistas</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {achievements.map((achievement: any) => (
              <span key={achievement.id} className="inline-flex items-center gap-2 rounded-xl border border-[#e4c66b]/35 bg-[#fff9e8] px-3 py-2 text-xs font-bold text-[#705312]">
                <Award className="h-4 w-4 text-[#b58a25]" />
                {achievement.title || achievement.achievement_id}
              </span>
            ))}
          </div>
        </section>
      )}

      {cardViewer}
      {poolWagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pool-wager-title">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--red)]">Sinuca · desafio com aposta</div>
              <h2 id="pool-wager-title" className="mt-1 text-xl font-bold text-[var(--text)]">Escolha o que apostar contra {profile.name}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">O adversário precisa igualar a aposta para aceitar. O vencedor leva o total; se o convite for cancelado, a aposta é devolvida.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['coins', 'Moedas'],
                ['card', 'Carta'],
              ] as const).map(([type, label]) => (
                <button key={type} type="button" aria-pressed={poolWagerType === type} onClick={() => { setPoolWagerType(type); setActionMsg(''); }} className={`rounded-xl border p-3 text-left text-sm font-semibold ${poolWagerType === type ? 'border-[var(--red)] bg-[var(--soft)] text-[var(--red)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                  Apostar {label.toLowerCase()}
                </button>
              ))}
            </div>
            {poolWagerType === 'coins' ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-[var(--text)]">Valor por jogador</div>
                <div className="flex flex-wrap gap-2">
                  {['500', '1000', '5000', 'custom'].map(value => (
                    <button key={value} type="button" onClick={() => setPoolCoinChoice(value)} className={`rounded-lg border px-3 py-2 text-sm ${poolCoinChoice === value ? 'border-[var(--red)] bg-[var(--soft)] text-[var(--red)]' : 'border-[var(--border)]'}`}>
                      {value === 'custom' ? 'Personalizado' : `${Number(value).toLocaleString('pt-BR')} moedas`}
                    </button>
                  ))}
                </div>
                {poolCoinChoice === 'custom' && <input type="number" min={1} max={1000000} step={1} value={poolCustomCoins} onChange={event => setPoolCustomCoins(event.target.value)} placeholder="Valor personalizado" className="w-full max-w-xs rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />}
                <p className="text-xs text-[var(--muted)]">Sua aposta: {(poolCoinChoice === 'custom' ? Number(poolCustomCoins) : Number(poolCoinChoice)).toLocaleString('pt-BR')} moedas · Saldo: {currentCoins.toLocaleString('pt-BR')}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <input value={poolCardSearch} onChange={event => setPoolCardSearch(event.target.value)} placeholder="Pesquisar sua carta..." className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
                {availableWagerCardIds === null ? (
                  <p className="text-sm text-[var(--muted)]">Carregando cartas disponíveis...</p>
                ) : (
                  <div className="grid grid-cols-2 justify-items-center gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {myCards.filter(card => availableWagerCardIds.includes(card.uid) && card.name.toLowerCase().includes(poolCardSearch.trim().toLowerCase())).map(card => (
                      <div key={card.uid} className={`min-w-0 rounded-2xl p-1 ${poolCardId === card.uid ? 'ring-2 ring-[var(--red)]' : ''}`}>
                        <Card card={card} size="fluid" onClick={() => setPoolCardId(card.uid)} />
                      </div>
                    ))}
                    {myCards.filter(card => availableWagerCardIds.includes(card.uid) && card.name.toLowerCase().includes(poolCardSearch.trim().toLowerCase())).length === 0 && <p className="col-span-full py-4 text-sm text-[var(--muted)]">Sem cartas disponíveis para aposta.</p>}
                  </div>
                )}
              </div>
            )}
            {actionMsg && <p role="alert" className="text-sm text-[var(--red)]">{actionMsg}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={poolSubmitting || (poolWagerType === 'coins' && ((poolCoinChoice === 'custom' ? Number(poolCustomCoins) : Number(poolCoinChoice)) > currentCoins)) || (poolWagerType === 'card' && !poolCardId)} onClick={() => void sendPoolChallenge()} className="rounded-xl bg-[var(--red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {poolSubmitting ? 'Enviando...' : 'Enviar convite de sinuca'}
              </button>
              <button type="button" onClick={() => { setPoolWagerOpen(false); setActionMsg(''); }} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)]">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
