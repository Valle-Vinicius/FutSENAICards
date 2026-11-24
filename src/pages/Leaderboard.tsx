import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Crown, Medal, Search, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getCompetitiveLeaderboard,
  getCompetitiveProfile,
  getPoolCompetitiveLeaderboard,
  type CompetitiveDivision,
  type CompetitivePlayer,
  type CompetitiveProfile,
} from '../lib/services/leaderboard';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 20;
const DIVISIONS: CompetitiveDivision[] = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Elite', 'Lendário'];

function divisionStyle(division: CompetitiveDivision | null): string {
  if (division === 'Lendário' || division === 'Elite') return 'bg-[var(--soft)] text-[var(--red)]';
  if (division === 'Diamante') return 'bg-[var(--bg)] text-[#3b82f6]';
  if (division === 'Platina') return 'bg-[var(--bg)] text-[var(--muted)]';
  if (division === 'Ouro') return 'bg-[var(--bg)] text-[#f5c542]';
  if (division === 'Prata') return 'bg-[var(--bg)] text-[var(--muted)]';
  if (division === 'Bronze') return 'bg-[var(--soft)] text-[var(--muted)]';
  return 'bg-[var(--bg)] text-[var(--muted)]';
}

function Avatar({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizeClass = size === 'xl'
    ? 'h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl'
    : size === 'lg'
      ? 'h-14 w-14 text-lg sm:h-16 sm:w-16 sm:text-xl'
      : size === 'sm'
        ? 'h-9 w-9 text-sm'
        : 'h-11 w-11 text-base';
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--soft)] font-bold text-[var(--red)]`}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function DivisionBadge({ division }: { division: CompetitiveDivision | null }) {
  return (
    <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-center text-[10px] font-bold uppercase leading-tight tracking-wide ${divisionStyle(division)}`}>
      {division ?? 'Não classificado'}
    </span>
  );
}

function Podium({ players, isPool }: { players: CompetitivePlayer[]; isPool: boolean }) {
  const reduceMotion = useReducedMotion();
  const order = [players[1], players[0], players[2]];
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#e5e1d8] bg-[#f4f3ef] p-4 md:p-6">
      <div className="mb-5 flex items-end justify-between gap-3 border-b border-[#dedbd2] pb-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--red)]">Disputa pelo topo</div>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">
            <Trophy className="h-5 w-5 text-[var(--red)]" /> Pódio global
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
            {isPool ? 'Os três melhores do ranking de sinuca.' : 'Os três melhores da competição X1.'}
          </p>
        </div>
        {players.length > 0 && (
          <span className="hidden border-b-2 border-[var(--red)] px-1 pb-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--text)] sm:inline-flex">
            Top 3
          </span>
        )}
      </div>
      {players.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d6d2c8] bg-white/70 py-10 text-center text-sm text-[var(--muted)]">
          Ainda não há jogadores classificados.
        </div>
      ) : (
        <div className="mx-auto grid max-w-5xl grid-cols-3 items-end gap-2 sm:gap-4 md:gap-6">
          {order.map((player, index) => {
            if (!player) return <div key={`empty-${index}`} />;
            const isFirst = player.position === 1;
            const placeStyle = isFirst
              ? 'border-[#c9a754] bg-[#202127] text-white shadow-[0_16px_34px_rgba(30,31,37,0.18)]'
              : player.position === 2
                ? 'border-[#c9cdd1] bg-[#fdfdfc] text-[var(--text)]'
                : 'border-[#c99c7a] bg-[#f8eee7] text-[var(--text)]';
            const placeAccent = isFirst
              ? 'text-[#e7c56e]'
              : player.position === 2 ? 'text-[#7c8792]' : 'text-[#a76d49]';
            return (
              <motion.div
                key={player.userId}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : index * 0.06 }}
                className={`relative flex min-w-0 flex-col items-center overflow-hidden rounded-xl border-x border-b border-t-4 px-1.5 py-3 text-center sm:px-4 sm:py-5 ${placeStyle} ${isFirst ? 'min-h-[255px] sm:min-h-[290px]' : 'min-h-[220px] sm:min-h-[245px]'}`}
              >
                {isFirst && <div aria-hidden="true" className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#a91f32]/20 blur-2xl" />}
                <div className={`relative mb-3 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.12em] sm:text-xs sm:tracking-wide ${placeAccent}`}>
                  {isFirst ? <Crown className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
                  {isFirst ? '1º lugar' : player.position === 2 ? '2º lugar' : '3º lugar'}
                </div>
                <Link to={isPool ? `/profile/${player.userId}` : `/leaderboard/player/${player.userId}`} aria-label={`Perfil de ${player.name}`} className="relative rounded-full ring-2 ring-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--red)]">
                  <Avatar name={player.name} url={player.avatarUrl} size={isFirst ? 'xl' : 'lg'} />
                </Link>
                <div className="relative mt-3 w-full truncate text-xs font-bold sm:text-sm" title={player.name}>{player.name}</div>
                <div className="relative mt-1 flex items-baseline gap-1.5">
                  <span className={`font-black tabular-nums ${isFirst ? 'text-3xl text-[#f1cf75] sm:text-4xl' : 'text-2xl text-[var(--red)]'}`}>{player.rating}</span>
                  <span className={`text-[9px] font-bold tracking-wider ${isFirst ? 'text-white/60' : 'text-[var(--muted)]'}`}>ELO</span>
                </div>
                <div className="relative mt-2"><DivisionBadge division={player.division} /></div>
                <div className={`relative mt-auto w-full border-t pt-2 text-[10px] font-bold uppercase tracking-wider sm:text-xs ${isFirst ? 'border-white/15 text-white/70' : 'border-black/10 text-[var(--muted)]'}`}>
                  Posição #{player.position}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SelfSummary({ profile }: { profile: CompetitiveProfile }) {
  const progress = profile.division && profile.nextDivisionRating && profile.divisionRating
    ? Math.max(0, Math.min(100, ((profile.rating - profile.divisionRating) / (profile.nextDivisionRating - profile.divisionRating)) * 100))
    : profile.division ? 100 : 0;
  const nextDivisionLabel = profile.nextDivision && profile.nextDivisionRating != null
    ? `${profile.nextDivisionRating - profile.rating} pts para ${profile.nextDivision}`
    : profile.division ? 'Divisão máxima' : 'Jogue partidas oficiais para conquistar uma divisão';
  return (
    <section aria-label="Sua classificação competitiva" className="relative isolate overflow-hidden rounded-2xl bg-[#202127] p-4 text-white shadow-[0_12px_30px_rgba(30,31,37,0.12)] sm:p-6 lg:p-7">
      <div aria-hidden="true" className="absolute -right-14 -top-16 -z-10 h-64 w-64 rounded-full bg-[#a91f32]/20 blur-3xl" />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ed8790]">Seu status competitivo</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Temporada oficial</div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(230px,1fr)_minmax(150px,0.7fr)_minmax(280px,1.3fr)] lg:items-center lg:gap-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="rounded-full ring-2 ring-[var(--red)] ring-offset-4 ring-offset-[#202127]">
            <Avatar name={profile.name} url={profile.avatarUrl} size="lg" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Sua classificação</div>
            <div className="mt-1 truncate text-lg font-black leading-tight sm:text-xl" title={profile.name}>{profile.name}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DivisionBadge division={profile.division} />
              <span className="text-xs font-semibold text-white/65">
              {profile.position ? `Posição global #${profile.position}` : 'Ainda sem posição no ranking'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between border-y border-white/10 py-3 lg:block lg:border-y-0 lg:border-l lg:py-1 lg:pl-7">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">ELO atual</div>
          <div className="text-5xl font-black leading-none tracking-tight tabular-nums text-white sm:text-6xl">{profile.rating}</div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-white/10">
          {[
            { label: 'Partidas', value: profile.matchesPlayed },
            { label: 'Vitórias', value: profile.wins },
            { label: 'Derrotas', value: profile.losses },
            { label: 'Aproveit.', value: `${profile.winRate}%` },
          ].map(stat => (
            <div key={stat.label} className="min-w-0 px-1.5 text-center first:pl-0 last:pr-0 sm:px-3">
              <div className="text-lg font-black leading-none tabular-nums sm:text-2xl">{stat.value}</div>
              <div className="mt-2 truncate text-[8px] font-bold uppercase tracking-wide text-white/50 sm:text-[10px]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-white/60">Melhor ELO <strong className="ml-1 font-black text-white">{profile.peakRating}</strong></span>
          <span className="font-semibold text-white/75">{nextDivisionLabel}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-label="Progresso até a próxima divisão"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-full rounded-full bg-[var(--red)] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}

export default function Leaderboard() {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<'pvp' | 'pool'>('pvp');
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<CompetitiveProfile | null>(null);
  const [leaders, setLeaders] = useState<CompetitivePlayer[]>([]);
  const [players, setPlayers] = useState<CompetitivePlayer[]>([]);
  const [division, setDivision] = useState<CompetitiveDivision | ''>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setError('O serviço de ranking não está configurado.');
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      const id = data.session?.user.id;
      if (!id) {
        setError('Entre na sua conta para consultar o ranking.');
        setLoading(false);
        return;
      }
      setUserId(id);
    }).catch(cause => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível verificar a sessão.');
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError('');
    const getPlayers = mode === 'pool' ? getPoolCompetitiveLeaderboard : getCompetitiveLeaderboard;
    void Promise.all([
      mode === 'pool'
        ? getPoolCompetitiveLeaderboard({ limit: PAGE_SIZE, offset, search: debouncedSearch })
        : getCompetitiveLeaderboard({ limit: PAGE_SIZE, offset, division: division || null, search: debouncedSearch }),
      getPlayers({ limit: 3 }),
      mode === 'pvp' ? getCompetitiveProfile(userId) : Promise.resolve(null),
    ]).then(([page, top, ownProfile]) => {
      if (!active) return;
      setPlayers(page);
      setLeaders(top);
      setProfile(ownProfile);
    }).catch(cause => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o ranking.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [userId, mode, offset, division, debouncedSearch, refreshKey]);

  const changeFilter = (next: CompetitiveDivision | '') => {
    setDivision(next);
    setOffset(0);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-3 sm:p-4 lg:p-6">
      <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="border-l-4 border-[var(--red)] pl-4 sm:pl-5">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--red)] sm:text-xs">
            Competição X1 <span aria-hidden="true" className="h-px w-8 bg-[var(--red)]/50 sm:w-12" />
          </div>
          <h1 className="mt-2 text-4xl font-black leading-[0.92] tracking-[-0.045em] text-[var(--text)] sm:text-6xl lg:text-7xl">LEADERBOARD</h1>
          <p className="mt-3 max-w-xl text-sm text-[var(--muted)] sm:text-base">
            {mode === 'pvp' ? 'Ranking competitivo de partidas PvP oficiais.' : 'Ranking competitivo de partidas oficiais de sinuca.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          <div className="inline-flex w-fit rounded-lg border border-[#dedbd2] bg-white p-1">
            <button type="button" aria-pressed={mode === 'pvp'} onClick={() => { setMode('pvp'); setDivision(''); setOffset(0); }} className={`rounded-md px-4 py-2 text-sm font-bold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red)] ${mode === 'pvp' ? 'bg-[#202127] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}>X1 PvP</button>
            <button type="button" aria-pressed={mode === 'pool'} onClick={() => { setMode('pool'); setDivision(''); setOffset(0); }} className={`rounded-md px-4 py-2 text-sm font-bold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red)] ${mode === 'pool' ? 'bg-[#202127] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}>Sinuca</button>
          </div>
          {mode === 'pvp' && (
            <Link to="/leaderboard/player/me" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--red)] px-4 text-sm font-bold text-white transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red)] hover:bg-[#921b2b]">
              Ver meu perfil competitivo
            </Link>
          )}
        </div>
      </header>

      {mode === 'pvp' && profile && <SelfSummary profile={profile} />}
      {error && (
        <div role="alert" className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-[var(--red)]">
          <span>{error}</span>
          <button onClick={() => setRefreshKey(value => value + 1)} className="btn btn-secondary">Tentar novamente</button>
        </div>
      )}

      <Podium players={leaders} isPool={mode === 'pool'} />

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] bg-[#fbfaf8] p-4 md:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Ranking completo</div>
            <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Classificação global</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Somente jogadores com partidas oficiais concluídas.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <label className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={search}
                onChange={event => changeSearch(event.target.value)}
                placeholder="Buscar jogador..."
                aria-label="Buscar jogador"
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-9 pr-3 text-sm text-[var(--text)] transition focus:border-[var(--red)] focus:outline-none focus:ring-4 focus:ring-[var(--red)]/10"
              />
            </label>
            {mode === 'pvp' && (
              <select
                value={division}
                onChange={event => changeFilter(event.target.value as CompetitiveDivision | '')}
                aria-label="Filtrar por divisão"
                className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] transition focus:border-[var(--red)] focus:outline-none focus:ring-4 focus:ring-[var(--red)]/10"
              >
                <option value="">Todas as divisões</option>
                {DIVISIONS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[#f4f3ef] text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              <tr>
                <th className="sticky left-0 z-20 w-20 bg-[#f4f3ef] px-4 py-3.5">Pos.</th>
                <th className="px-4 py-3.5">Jogador</th>
                <th className="w-28 px-4 py-3.5 text-right">{mode === 'pool' ? 'ELO sinuca' : 'ELO'}</th>
                {mode === 'pvp' && <th className="w-32 px-4 py-3.5 text-center">Divisão</th>}
                <th className="w-28 px-4 py-3.5 text-right">{mode === 'pool' ? 'Sinucas' : 'Partidas'}</th>
                <th className="w-20 px-4 py-3.5 text-right">V</th>
                <th className="w-20 px-4 py-3.5 text-right">D</th>
                <th className="w-32 px-4 py-3.5 text-right">Aproveitamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eeece6]">
              <AnimatePresence mode="wait">
                {players.map(player => {
                  const winRate = player.matchesPlayed ? Math.round((player.wins / player.matchesPlayed) * 100) : 0;
                  return (
                    <motion.tr
                      key={player.userId}
                      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                      transition={{ duration: reduceMotion ? 0 : 0.18 }}
                      className={`transition-colors duration-200 motion-reduce:transition-none ${player.userId === userId ? 'bg-[#fff2f1] font-semibold' : 'hover:bg-[#faf9f6]'}`}
                    >
                      <td className="sticky left-0 z-10 bg-[inherit] px-4 py-3.5">
                        <span className={`inline-flex min-w-10 justify-center border-l-2 px-2 py-1 font-black tabular-nums ${player.position === 1 ? 'border-[#c9a754] text-[#927121]' : player.position === 2 ? 'border-[#9aa3aa] text-[#68747d]' : player.position === 3 ? 'border-[#a76d49] text-[#a76d49]' : 'border-transparent text-[var(--muted)]'}`}>
                          #{player.position}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link to={mode === 'pool' ? `/profile/${player.userId}` : `/leaderboard/player/${player.userId}`} className="flex min-w-0 items-center gap-3 font-medium text-[var(--text)] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red)] hover:text-[var(--red)]">
                          <Avatar name={player.name} url={player.avatarUrl} size="sm" />
                          <span className={`max-w-48 truncate ${player.userId === userId ? 'font-black text-[var(--red)]' : 'font-bold'}`} title={player.name}>{player.name}{player.userId === userId ? ' (você)' : ''}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-right text-base font-black tabular-nums text-[var(--red)]">{player.rating}</td>
                      {mode === 'pvp' && <td className="px-4 py-3.5 text-center"><DivisionBadge division={player.division} /></td>}
                      <td className="px-4 py-3.5 text-right tabular-nums text-[var(--text)]">{player.matchesPlayed}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[var(--text)]">{player.wins}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[var(--text)]">{player.losses}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[var(--text)]">{winRate}%</td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {!loading && players.length === 0 && (
                <tr><td colSpan={mode === 'pvp' ? 8 : 7} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Nenhum jogador encontrado.</td></tr>
              )}
              {loading && <tr><td colSpan={mode === 'pvp' ? 8 : 7} className="px-4 py-12 text-center text-sm text-[var(--muted)]">Carregando classificação...</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[#fbfaf8] p-3 sm:p-4">
          <button onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="btn btn-secondary min-w-28 justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red)] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button>
          <span className="text-xs font-semibold text-[var(--muted)]">Página {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <button onClick={() => setOffset(value => value + PAGE_SIZE)} disabled={loading || players.length < PAGE_SIZE} className="btn btn-secondary min-w-28 justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--red)] disabled:opacity-40">Próxima <ChevronRight className="h-4 w-4" /></button>
        </div>
      </section>
    </div>
  );
}
