import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Search, Trophy } from 'lucide-react';
import {
  getCompetitiveHeadToHead,
  getCompetitiveProfile,
  getCompetitiveRatingHistory,
  searchCompetitiveHeadToHeadOpponents,
  type CompetitiveDivision,
  type CompetitiveHeadToHead,
  type CompetitiveHeadToHeadOpponent,
  type CompetitiveProfile as CompetitiveProfileData,
  type CompetitiveRatingEvent,
} from '../lib/services/leaderboard';
import { supabase } from '../lib/supabase';

function Avatar({ name, url }: { name: string; url: string | null }) {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF0F2] text-xl font-bold text-[#E30613]">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function DivisionBadge({ division }: { division: CompetitiveDivision | null }) {
  return <span className="rounded-full bg-[#FFF0F2] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#E30613]">{division ?? 'Não classificado'}</span>;
}

function RatingChart({ history }: { history: CompetitiveRatingEvent[] }) {
  const points = useMemo(() => {
    const ordered = [...history].reverse();
    if (ordered.length === 0) return [];
    const ratings = ordered.map(event => event.ratingAfter);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const spread = Math.max(max - min, 1);
    return ratings.map((rating, index) => ({
      x: ordered.length === 1 ? 50 : 8 + (index / (ordered.length - 1)) * 84,
      y: 86 - ((rating - min) / spread) * 70,
    }));
  }, [history]);

  if (points.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-[#858A98]">O histórico de ELO aparecerá após a primeira partida competitiva.</div>;
  }
  const path = points.map(point => `${point.x},${point.y}`).join(' ');
  return (
    <div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Evolução do ELO com base nas partidas oficiais" className="h-48 w-full overflow-visible">
        <line x1="5" y1="88" x2="95" y2="88" stroke="#E9EAF0" strokeWidth="1" />
        <line x1="5" y1="15" x2="5" y2="88" stroke="#E9EAF0" strokeWidth="1" />
        {points.length > 1 && <polyline points={path} fill="none" stroke="#E30613" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((point, index) => <circle key={`${point.x}-${index}`} cx={point.x} cy={point.y} r="1.8" fill="#E30613" />)}
      </svg>
      <div className="text-center text-[10px] text-[#858A98]">{points.length} alteração(ões) oficial(is) de ELO, da mais antiga à mais recente</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CompetitiveProfile() {
  const { userId: routeUserId } = useParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompetitiveProfileData | null>(null);
  const [history, setHistory] = useState<CompetitiveRatingEvent[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opponentSearch, setOpponentSearch] = useState('');
  const [opponents, setOpponents] = useState<CompetitiveHeadToHeadOpponent[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<CompetitiveHeadToHeadOpponent | null>(null);
  const [headToHead, setHeadToHead] = useState<CompetitiveHeadToHead | null>(null);
  const [headToHeadError, setHeadToHeadError] = useState('');
  const [headToHeadLoading, setHeadToHeadLoading] = useState(false);
  const [headToHeadLoadingMore, setHeadToHeadLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setError('O serviço competitivo não está configurado.');
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) throw sessionError;
      const currentId = data.session?.user.id;
      const targetId = routeUserId === 'me' ? currentId : routeUserId;
      if (!targetId) {
        setError('Não foi possível identificar o perfil solicitado.');
        setLoading(false);
        return;
      }
      setUserId(targetId);
    }).catch(cause => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a sessão.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [routeUserId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([
      getCompetitiveProfile(userId),
      getCompetitiveRatingHistory(userId, 50),
    ]).then(([nextProfile, nextHistory]) => {
      if (!active) return;
      setProfile(nextProfile);
      setHistory(nextHistory);
      setHistoryHasMore(nextHistory.length === 50);
    }).catch(cause => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o perfil competitivo.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  const loadMoreHistory = async () => {
    if (!userId || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    setHistoryError('');
    try {
      const next = await getCompetitiveRatingHistory(userId, 50, history.length);
      setHistory(current => [...current, ...next]);
      setHistoryHasMore(next.length === 50);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : 'Não foi possível carregar mais partidas.');
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  useEffect(() => {
    const query = opponentSearch.trim();
    if (!userId || query.length < 2) {
      setOpponents([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchCompetitiveHeadToHeadOpponents(userId, query).then(results => {
        if (active) setOpponents(results);
      }).catch(cause => {
        if (active) setHeadToHeadError(cause instanceof Error ? cause.message : 'Não foi possível buscar jogadores.');
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [opponentSearch, userId]);

  const selectOpponent = async (opponent: CompetitiveHeadToHeadOpponent) => {
    if (!userId) return;
    setSelectedOpponent(opponent);
    setOpponents([]);
    setOpponentSearch(opponent.name);
    setHeadToHead(null);
    setHeadToHeadError('');
    setHeadToHeadLoading(true);
    try {
      setHeadToHead(await getCompetitiveHeadToHead(userId, opponent.userId));
    } catch (cause) {
      setHeadToHeadError(cause instanceof Error ? cause.message : 'Não foi possível carregar os confrontos diretos.');
    } finally {
      setHeadToHeadLoading(false);
    }
  };

  const loadMoreHeadToHead = async () => {
    if (!userId || !selectedOpponent || !headToHead || headToHeadLoadingMore) return;
    setHeadToHeadLoadingMore(true);
    setHeadToHeadError('');
    try {
      const next = await getCompetitiveHeadToHead(userId, selectedOpponent.userId, 20, headToHead.matches.length);
      setHeadToHead(current => current ? { ...current, matches: [...current.matches, ...next.matches] } : current);
    } catch (cause) {
      setHeadToHeadError(cause instanceof Error ? cause.message : 'Não foi possível carregar mais confrontos.');
    } finally {
      setHeadToHeadLoadingMore(false);
    }
  };

  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const draws = profile?.draws ?? 0;
  const winRate = profile?.matchesPlayed ? Math.round((wins / profile.matchesPlayed) * 1000) / 10 : 0;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Link to="/leaderboard" className="text-sm font-medium text-[#E30613] hover:underline">← Voltar ao Leaderboard</Link>
      {error && <div role="alert" className="card-surface p-4 text-sm text-[#E30613]">{error}</div>}
      {loading && <div className="card-surface p-8 text-center text-sm text-[#858A98]">Carregando perfil competitivo...</div>}
      {!loading && profile && (
        <>
          <section className="card-surface flex flex-col gap-5 p-5 md:flex-row md:items-center md:p-7">
            <Avatar name={profile.name} url={profile.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-words text-2xl font-semibold text-[#252733]">{profile.name}</h1>
                <DivisionBadge division={profile.division} />
              </div>
              <div className="mt-1 text-sm text-[#858A98]">
                {profile.position ? `Posição global #${profile.position}` : 'Ainda não classificado — nenhuma partida competitiva registrada'}
              </div>
            </div>
            <div className="text-left md:text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#858A98]">ELO atual</div>
              <div className="text-4xl font-bold tabular-nums text-[#E30613]">{profile.rating}</div>
              <div className="text-xs text-[#858A98]">Melhor: {profile.peakRating}</div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Partidas competitivas', profile.matchesPlayed],
              ['Vitórias', wins],
              ['Derrotas', losses],
              ['Empates', draws],
              ['Aproveitamento', `${winRate}%`],
              ['Sequência atual', profile.currentStreak > 0 ? `${profile.currentStreak}V` : profile.currentStreak < 0 ? `${Math.abs(profile.currentStreak)}D` : '—'],
              ['Melhor sequência', profile.bestWinStreak],
              ['Última partida', profile.lastMatchAt ? formatDate(profile.lastMatchAt) : '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="card-surface p-4">
                <div className="text-xs text-[#858A98]">{label}</div>
                <div className="mt-1 text-xl font-bold text-[#252733]">{value}</div>
              </div>
            ))}
          </section>

          <section className="card-surface p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-[#252733]"><Trophy className="h-4 w-4 text-[#E30613]" /> Evolução do ELO</h2>
            <RatingChart history={history} />
          </section>

          <section className="card-surface overflow-hidden">
            <div className="border-b border-[#E9EAF0] p-4">
              <h2 className="font-semibold text-[#252733]">Últimos resultados competitivos</h2>
              <p className="text-xs text-[#858A98]">Resultado, placar e variação vêm dos eventos oficiais de ELO.</p>
            </div>
            {history.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#858A98]">Nenhum resultado competitivo registrado.</div>
            ) : (
              <div className="divide-y divide-[#E9EAF0]">
                {history.map(event => (
                  <div key={event.challengeId} className="flex flex-wrap items-center gap-3 p-4">
                    <span className={`w-16 rounded-lg px-2 py-1 text-center text-[10px] font-bold uppercase ${event.result === 'win' ? 'bg-[#FFF0F2] text-[#E30613]' : 'bg-[#F7F7F9] text-[#858A98]'}`}>
                      {event.result === 'win' ? 'Vitória' : event.result === 'loss' ? 'Derrota' : 'Empate'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link to={`/leaderboard/player/${event.opponentId}`} className="font-medium text-[#252733] hover:text-[#E30613]">{event.opponentName}</Link>
                      <div className="text-xs text-[#858A98]">{event.scoreFor}–{event.scoreAgainst} · {formatDate(event.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[#858A98]">{event.ratingBefore} → {event.ratingAfter}</div>
                      <div className={`flex items-center justify-end text-sm font-bold ${event.ratingChange > 0 ? 'text-[#E30613]' : event.ratingChange < 0 ? 'text-[#858A98]' : 'text-[#252733]'}`}>
                        {event.ratingChange > 0 ? <ArrowUpRight className="h-4 w-4" /> : event.ratingChange < 0 ? <ArrowDownRight className="h-4 w-4" /> : null}
                        {event.ratingChange > 0 ? '+' : ''}{event.ratingChange} ELO
                      </div>
                    </div>
                    <button onClick={() => void selectOpponent({
                      userId: event.opponentId,
                      name: event.opponentName,
                      avatarUrl: event.opponentAvatarUrl,
                      rating: null,
                    })} className="w-full text-left text-xs font-medium text-[#E30613] hover:underline sm:w-auto">
                      Ver H2H
                    </button>
                  </div>
                ))}
              </div>
            )}
            {historyError && <div role="alert" className="p-3 text-sm text-[#E30613]">{historyError}</div>}
            {historyHasMore && (
              <div className="border-t border-[#E9EAF0] p-3 text-center">
                <button onClick={() => void loadMoreHistory()} disabled={historyLoadingMore} className="btn btn-secondary">
                  {historyLoadingMore ? 'Carregando...' : 'Carregar partidas anteriores'}
                </button>
              </div>
            )}
          </section>

          <section className="card-surface p-5">
            <h2 className="font-semibold text-[#252733]">Histórico PvP total — confrontos diretos</h2>
            <p className="mt-1 text-xs text-[#858A98]">Inclui challenges PvP oficiais anteriores ao ELO; não inclui partidas locais ou contra IA. Os totais podem diferir do histórico competitivo acima.</p>
            <label className="relative mt-3 block max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858A98]" />
              <input value={opponentSearch} onChange={event => {
                setOpponentSearch(event.target.value);
                setSelectedOpponent(null);
                setHeadToHead(null);
              }} placeholder="Buscar adversário..." className="w-full rounded-xl border border-[#E9EAF0] bg-[#F7F7F9] py-2 pl-9 pr-3 text-sm text-[#252733]" />
            </label>
            {opponents.length > 0 && (
              <div className="mt-2 max-w-md overflow-hidden rounded-xl border border-[#E9EAF0] bg-white">
                {opponents.map(opponent => (
                  <button key={opponent.userId} onClick={() => void selectOpponent(opponent)} className="block w-full border-b border-[#E9EAF0] px-3 py-2 text-left text-sm text-[#252733] last:border-0 hover:bg-[#F7F7F9]">
                    {opponent.name} <span className="text-xs text-[#858A98]">{opponent.rating === null ? '· Sem ELO competitivo' : `· ${opponent.rating} ELO`}</span>
                  </button>
                ))}
              </div>
            )}
            {headToHeadError && <div role="alert" className="mt-3 text-sm text-[#E30613]">{headToHeadError}</div>}
            {headToHeadLoading && <div className="mt-3 text-sm text-[#858A98]">Carregando confrontos...</div>}
            {selectedOpponent && headToHead && (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Partidas PvP oficiais (total)', headToHead.totalMatches],
                    [`Vitórias de ${profile.name}`, headToHead.userWins],
                    [`Vitórias de ${selectedOpponent.name}`, headToHead.opponentWins],
                    ['Empates', headToHead.draws],
                  ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[#F7F7F9] p-3"><div className="text-[10px] text-[#858A98]">{label}</div><div className="mt-1 font-bold text-[#252733]">{value}</div></div>)}
                </div>
                <div className="mt-3 text-xs text-[#858A98]">
                  Último confronto: {headToHead.lastMatchAt ? formatDate(headToHead.lastMatchAt) : 'nenhum'}
                </div>
                <div className="mt-3 divide-y divide-[#E9EAF0] rounded-xl border border-[#E9EAF0]">
                  {headToHead.matches.length === 0 ? <div className="p-4 text-sm text-[#858A98]">Nenhum confronto registrado.</div> : headToHead.matches.map(match => (
                    <div key={match.challenge_id} className="flex items-center justify-between p-3 text-sm">
                      <span className="text-[#858A98]">{formatDate(match.updated_at)}</span>
                      <span className="font-semibold text-[#252733]">{match.user_score} – {match.opponent_score}</span>
                      <span className="text-xs text-[#858A98]">{match.result === 'win' ? 'Vitória' : match.result === 'loss' ? 'Derrota' : 'Empate'}</span>
                    </div>
                  ))}
                </div>
                {headToHead.matches.length < headToHead.totalMatches && (
                  <div className="mt-3 text-center">
                    <button onClick={() => void loadMoreHeadToHead()} disabled={headToHeadLoadingMore} className="btn btn-secondary">
                      {headToHeadLoadingMore ? 'Carregando...' : 'Carregar confrontos anteriores'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
