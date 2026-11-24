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

function Avatar({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'sm' | 'md' | 'xl' }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--soft)] font-bold text-[var(--red)] ${size === 'xl' ? 'h-24 w-24 text-3xl sm:h-28 sm:w-28' : size === 'sm' ? 'h-10 w-10 text-sm' : 'h-16 w-16 text-xl'}`}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function DivisionBadge({ division }: { division: CompetitiveDivision | null }) {
  return <span className="rounded-full bg-[var(--soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--red)]">{division ?? 'Não classificado'}</span>;
}

function RatingChart({ history }: { history: CompetitiveRatingEvent[] }) {
  const chart = useMemo(() => {
    const ordered = [...history].reverse();
    if (ordered.length === 0) return null;
    const samples = [
      { rating: ordered[0].ratingBefore, createdAt: ordered[0].createdAt },
      ...ordered.map(event => ({ rating: event.ratingAfter, createdAt: event.createdAt })),
    ];
    const ratings = samples.map(sample => sample.rating);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const spread = max - min || Math.max(Math.abs(max) * 0.05, 20);
    const padding = spread * 0.12;
    const lowerBound = min - padding;
    const upperBound = max + padding;
    const points = samples.map((sample, index) => ({
      ...sample,
      x: samples.length === 1 ? 420 : 68 + (index / (samples.length - 1)) * 720,
      y: 228 - ((sample.rating - lowerBound) / (upperBound - lowerBound)) * 174,
    }));
    return {
      points,
      ordered,
      lowerBound,
      upperBound,
      ratingChange: ordered[ordered.length - 1].ratingAfter - ordered[0].ratingBefore,
    };
  }, [history]);

  if (!chart) {
    return <div className="flex min-h-[280px] items-center justify-center border-y border-[var(--border)] text-center text-sm text-[var(--muted)]">O histórico de ELO aparecerá após a primeira partida competitiva.</div>;
  }
  const path = chart.points.map(point => `${point.x},${point.y}`).join(' ');
  const dateLabel = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Trajetória por partidas oficiais</div>
          <div className={`mt-1 text-2xl font-black tabular-nums ${chart.ratingChange > 0 ? 'text-[var(--red)]' : 'text-[var(--text)]'}`}>
            {chart.ratingChange > 0 ? '+' : ''}{chart.ratingChange} <span className="text-sm font-bold">ELO</span>
          </div>
        </div>
        <div className="text-right text-[10px] text-[var(--muted)]">Variação no histórico exibido · {chart.ordered.length} partidas</div>
      </div>
      <div className="overflow-x-auto overscroll-x-contain">
        <svg viewBox="0 0 820 300" role="img" aria-label="Evolução do ELO com base nas partidas oficiais" className="h-[280px] min-w-[620px] w-full sm:h-[340px]">
          {[0, 0.5, 1].map((fraction, index) => {
            const y = 54 + fraction * 174;
            const value = Math.round(chart.upperBound - fraction * (chart.upperBound - chart.lowerBound));
            return (
              <g key={index}>
                <line x1="58" y1={y} x2="790" y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={index === 2 ? undefined : '3 6'} />
                <text x="48" y={y + 4} textAnchor="end" fill="var(--muted)" fontSize="11" fontWeight="600">{value}</text>
              </g>
            );
          })}
          <line x1="58" y1="228" x2="790" y2="228" stroke="var(--border)" strokeWidth="1" />
          {chart.points.length > 1 && <polyline points={path} fill="none" stroke="var(--red)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
          {chart.points.map((point, index) => (
            <g key={`${point.x}-${index}`}>
              <circle cx={point.x} cy={point.y} r={index === chart.points.length - 1 ? 5 : 3.5} fill="white" stroke="var(--red)" strokeWidth="2.5" />
              {(index === 0 || index === chart.points.length - 1) && (
                <text x={point.x} y={point.y - 12} textAnchor={index === 0 ? 'start' : 'end'} fill="var(--text)" fontSize="11" fontWeight="700">
                  {point.rating}
                </text>
              )}
            </g>
          ))}
          <text x="68" y="266" fill="var(--muted)" fontSize="10" fontWeight="600">{dateLabel(chart.ordered[0].createdAt)}</text>
          <text x="790" y="266" textAnchor="end" fill="var(--muted)" fontSize="10" fontWeight="600">{dateLabel(chart.ordered[chart.ordered.length - 1].createdAt)}</text>
        </svg>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-[10px] text-[var(--muted)]">
        <span>Partida mais antiga exibida</span>
        <span className="text-right">Partida mais recente exibida</span>
      </div>
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
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-7 xl:p-9">
      <Link to="/leaderboard" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition-colors hover:text-[var(--red)]">
        <span aria-hidden="true">←</span> Voltar ao Leaderboard
      </Link>
      {error && <div role="alert" className="card-surface border-l-4 border-[var(--red)] p-4 text-sm text-[var(--red)]">{error}</div>}
      {loading && <div className="card-surface p-8 text-center text-sm text-[var(--muted)]">Carregando perfil competitivo...</div>}
      {!loading && profile && (
        <>
          <section aria-label="Perfil competitivo" className="relative isolate overflow-hidden rounded-2xl bg-[#202127] p-5 text-white sm:p-7 lg:p-9">
            <div aria-hidden="true" className="absolute -right-20 -top-24 -z-10 h-80 w-80 rounded-full bg-[var(--red)]/20 blur-3xl" />
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ed8790] sm:text-xs">Carreira competitiva</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">FUTSENAI · X1 PvP</div>
            </div>
            <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_minmax(190px,0.55fr)] md:items-center">
              <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
                <div className="w-fit rounded-full ring-2 ring-[var(--red)] ring-offset-4 ring-offset-[#202127]">
                  <Avatar name={profile.name} url={profile.avatarUrl} size="xl" />
                </div>
                <div className="min-w-0">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Perfil do competidor</div>
                  <h1 className="break-words text-3xl font-black uppercase leading-[0.98] tracking-tight sm:text-4xl lg:text-5xl">{profile.name}</h1>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <DivisionBadge division={profile.division} />
                    <span className="text-sm font-semibold text-white/65">
                      {profile.position ? `Posição global #${profile.position}` : 'Ainda não classificado — nenhuma partida competitiva registrada'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="border-t border-white/15 pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">ELO atual</div>
                <div className="mt-1 text-6xl font-black leading-none tracking-[-0.05em] tabular-nums text-white sm:text-7xl">{profile.rating}</div>
                <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
                  <span className="h-1 w-6 bg-[var(--red)]" />
                  Melhor ELO <strong className="font-black text-white">{profile.peakRating}</strong>
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Desempenho competitivo" className="overflow-hidden border-y border-[var(--border)] bg-white">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Números da carreira</div>
                <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Desempenho competitivo</h2>
              </div>
              <span className="text-xs text-[var(--muted)]">Partidas oficiais</span>
            </div>
            <div className="grid lg:grid-cols-[1.4fr_0.8fr]">
              <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)] px-2 py-5 sm:px-5 lg:border-b-0 lg:border-r">
                {[
                  ['Partidas', profile.matchesPlayed, 'total disputado'],
                  ['Vitórias', wins, 'resultados positivos'],
                  ['Derrotas', losses, 'resultados negativos'],
                ].map(([label, value, caption]) => (
                  <div key={String(label)} className="min-w-0 px-2 sm:px-4">
                    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-[10px]">{label}</div>
                    <div className="mt-2 text-3xl font-black leading-none tabular-nums text-[var(--text)] sm:text-4xl">{value}</div>
                    <div className="mt-2 hidden truncate text-[10px] text-[var(--muted)] sm:block">{caption}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-7">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--muted)]">Aproveitamento</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Vitórias sobre partidas disputadas</div>
                </div>
                <div className="text-4xl font-black leading-none tabular-nums text-[var(--red)] sm:text-5xl">{winRate}<span className="text-2xl">%</span></div>
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-[var(--border)] sm:grid-cols-4">
              {[
                ['Empates', draws],
                ['Sequência atual', profile.currentStreak > 0 ? `${profile.currentStreak}V` : profile.currentStreak < 0 ? `${Math.abs(profile.currentStreak)}D` : '—'],
                ['Melhor sequência', profile.bestWinStreak],
                ['Última partida', profile.lastMatchAt ? formatDate(profile.lastMatchAt) : '—'],
              ].map(([label, value], index) => (
                <div key={String(label)} className={`border-b border-[var(--border)] px-4 py-3 sm:border-b-0 sm:px-5 ${index % 2 === 0 ? 'border-r' : ''} ${index > 1 ? 'border-b-0' : ''} sm:border-r ${index === 3 ? 'sm:border-r-0' : ''}`}>
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-[10px]">{label}</div>
                  <div className="mt-1 truncate text-sm font-bold text-[var(--text)] sm:text-base">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card-surface p-4 sm:p-6 lg:p-7">
            <div className="mb-4 border-b border-[var(--border)] pb-4 sm:mb-5">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Trajetória</div>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">
                <Trophy className="h-5 w-5 text-[var(--red)]" /> Evolução do ELO
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Acompanhe a variação de rating ao longo dos confrontos oficiais.</p>
            </div>
            <RatingChart history={history} />
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] bg-[#fbfaf8] p-4 sm:p-5">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Registro de partidas</div>
              <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Últimos resultados competitivos</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Resultado, placar e variação vêm dos eventos oficiais de ELO.</p>
            </div>
            {history.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--muted)]">Nenhum resultado competitivo registrado.</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {history.map(event => {
                  const resultStyle = event.result === 'win'
                    ? 'border-l-[var(--red)] bg-[#fff9f8]'
                    : event.result === 'draw'
                      ? 'border-l-[#b48a3c] bg-[#fffdf8]'
                      : 'border-l-[#969ba3] bg-white';
                  const resultLabel = event.result === 'win' ? 'Vitória' : event.result === 'loss' ? 'Derrota' : 'Empate';
                  return (
                    <div key={event.challengeId} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-l-4 px-3 py-4 md:grid-cols-[auto_minmax(170px,1fr)_auto_minmax(145px,auto)_auto] md:gap-5 md:px-5 ${resultStyle}`}>
                      <span className={`min-w-[66px] px-2 py-1 text-center text-[10px] font-black uppercase tracking-wide ${event.result === 'win' ? 'text-[var(--red)]' : event.result === 'draw' ? 'text-[#927121]' : 'text-[var(--muted)]'}`}>
                        {resultLabel}
                      </span>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={event.opponentName} url={event.opponentAvatarUrl} size="sm" />
                        <div className="min-w-0">
                          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Adversário</div>
                          <Link to={`/leaderboard/player/${event.opponentId}`} className="block truncate text-sm font-bold text-[var(--text)] hover:text-[var(--red)]">{event.opponentName}</Link>
                          <div className="text-[10px] text-[var(--muted)]">{formatDate(event.createdAt)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">Placar</div>
                        <div className="text-xl font-black tabular-nums text-[var(--text)]">{event.scoreFor}<span className="px-1 text-[var(--muted)]">–</span>{event.scoreAgainst}</div>
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-3 border-t border-black/5 pt-2 md:col-span-1 md:block md:border-0 md:pt-0 md:text-right">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">ELO antes → depois</div>
                          <div className="text-xs font-bold tabular-nums text-[var(--text)]">{event.ratingBefore} → {event.ratingAfter}</div>
                        </div>
                        <div className={`flex items-center text-sm font-black tabular-nums ${event.ratingChange > 0 ? 'text-[var(--red)]' : event.ratingChange < 0 ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>
                          {event.ratingChange > 0 ? <ArrowUpRight className="h-4 w-4" /> : event.ratingChange < 0 ? <ArrowDownRight className="h-4 w-4" /> : null}
                          {event.ratingChange > 0 ? '+' : ''}{event.ratingChange} ELO
                        </div>
                      </div>
                      <button onClick={() => void selectOpponent({
                        userId: event.opponentId,
                        name: event.opponentName,
                        avatarUrl: event.opponentAvatarUrl,
                        rating: null,
                      })} className="col-start-3 row-start-2 inline-flex min-h-9 items-center justify-end text-xs font-bold text-[var(--red)] hover:underline md:col-auto md:row-auto">
                        Ver H2H
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {historyError && <div role="alert" className="p-3 text-sm text-[var(--red)]">{historyError}</div>}
            {historyHasMore && (
              <div className="border-t border-[var(--border)] p-3 text-center">
                <button onClick={() => void loadMoreHistory()} disabled={historyLoadingMore} className="btn btn-secondary">
                  {historyLoadingMore ? 'Carregando...' : 'Carregar partidas anteriores'}
                </button>
              </div>
            )}
          </section>

          <section className="card-surface p-5">
            <h2 className="font-semibold text-[var(--text)]">Histórico PvP total — confrontos diretos</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Inclui challenges PvP oficiais anteriores ao ELO; não inclui partidas locais ou contra IA. Os totais podem diferir do histórico competitivo acima.</p>
            <label className="relative mt-3 block max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input value={opponentSearch} onChange={event => {
                setOpponentSearch(event.target.value);
                setSelectedOpponent(null);
                setHeadToHead(null);
              }} placeholder="Buscar adversário..." className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--text)]" />
            </label>
            {opponents.length > 0 && (
              <div className="mt-2 max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-white">
                {opponents.map(opponent => (
                  <button key={opponent.userId} onClick={() => void selectOpponent(opponent)} className="block w-full border-b border-[var(--border)] px-3 py-2 text-left text-sm text-[var(--text)] last:border-0 hover:bg-[var(--bg)]">
                    {opponent.name} <span className="text-xs text-[var(--muted)]">{opponent.rating === null ? '· Sem ELO competitivo' : `· ${opponent.rating} ELO`}</span>
                  </button>
                ))}
              </div>
            )}
            {headToHeadError && <div role="alert" className="mt-3 text-sm text-[var(--red)]">{headToHeadError}</div>}
            {headToHeadLoading && <div className="mt-3 text-sm text-[var(--muted)]">Carregando confrontos...</div>}
            {selectedOpponent && headToHead && (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Partidas PvP oficiais (total)', headToHead.totalMatches],
                    [`Vitórias de ${profile.name}`, headToHead.userWins],
                    [`Vitórias de ${selectedOpponent.name}`, headToHead.opponentWins],
                    ['Empates', headToHead.draws],
                  ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[var(--bg)] p-3"><div className="text-[10px] text-[var(--muted)]">{label}</div><div className="mt-1 font-bold text-[var(--text)]">{value}</div></div>)}
                </div>
                <div className="mt-3 text-xs text-[var(--muted)]">
                  Último confronto: {headToHead.lastMatchAt ? formatDate(headToHead.lastMatchAt) : 'nenhum'}
                </div>
                <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                  {headToHead.matches.length === 0 ? <div className="p-4 text-sm text-[var(--muted)]">Nenhum confronto registrado.</div> : headToHead.matches.map(match => (
                    <div key={match.challenge_id} className="flex items-center justify-between p-3 text-sm">
                      <span className="text-[var(--muted)]">{formatDate(match.updated_at)}</span>
                      <span className="font-semibold text-[var(--text)]">{match.user_score} – {match.opponent_score}</span>
                      <span className="text-xs text-[var(--muted)]">{match.result === 'win' ? 'Vitória' : match.result === 'loss' ? 'Derrota' : 'Empate'}</span>
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
