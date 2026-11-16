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
  if (division === 'Lendário' || division === 'Elite') return 'bg-[#FFF0F2] text-[#E30613]';
  if (division === 'Diamante') return 'bg-[#F7F7F9] text-[#3b82f6]';
  if (division === 'Platina') return 'bg-[#F7F7F9] text-[#858A98]';
  if (division === 'Ouro') return 'bg-[#F7F7F9] text-[#f5c542]';
  if (division === 'Prata') return 'bg-[#F7F7F9] text-[#858A98]';
  if (division === 'Bronze') return 'bg-[#FFF0F2] text-[#858A98]';
  return 'bg-[#F7F7F9] text-[#858A98]';
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
    <div className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF0F2] font-bold text-[#E30613]`}>
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
    <section className="card-surface overflow-hidden p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#252733]">
            <Trophy className="h-4 w-4 text-[#E30613]" /> Pódio global
          </div>
          <p className="mt-1 text-xs text-[#858A98]">Os três melhores jogadores da classificação.</p>
        </div>
        {players.length > 0 && <span className="rounded-full bg-[#F7F7F9] px-3 py-1 text-xs font-semibold text-[#858A98]">TOP 3</span>}
      </div>
      {players.length === 0 ? (
        <div className="empty-state rounded-2xl bg-[#F7F7F9] py-10">Ainda não há jogadores classificados.</div>
      ) : (
        <div className="mx-auto grid max-w-5xl grid-cols-3 items-end gap-2 sm:gap-4 md:gap-6">
          {order.map((player, index) => {
            if (!player) return <div key={`empty-${index}`} />;
            const isFirst = player.position === 1;
            return (
              <motion.div
                key={player.userId}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : index * 0.06 }}
                className={`flex min-w-0 flex-col items-center rounded-2xl border border-[#E9EAF0] px-2 py-3 text-center transition-shadow motion-reduce:transition-none sm:px-4 sm:py-5 ${isFirst ? 'min-h-[250px] bg-[#FFF0F2] shadow-[0_6px_20px_rgba(37,39,51,0.08)] md:min-h-[280px]' : 'min-h-[220px] bg-white md:min-h-[240px]'}`}
              >
                <div className={`mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${isFirst ? 'text-[#E30613]' : 'text-[#858A98]'}`}>
                  {isFirst ? <Crown className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
                  {isFirst ? '1º lugar' : player.position === 2 ? '2º lugar' : '3º lugar'}
                </div>
                <Link to={isPool ? `/profile/${player.userId}` : `/leaderboard/player/${player.userId}`} aria-label={`Perfil de ${player.name}`} className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613]">
                  <Avatar name={player.name} url={player.avatarUrl} size={isFirst ? 'xl' : 'lg'} />
                </Link>
                <div className="mt-3 w-full truncate text-sm font-semibold text-[#252733]" title={player.name}>{player.name}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className={`font-bold tabular-nums text-[#E30613] ${isFirst ? 'text-2xl' : 'text-xl'}`}>{player.rating}</span>
                  <span className="text-[10px] font-medium text-[#858A98]">ELO</span>
                </div>
                <div className="mt-2"><DivisionBadge division={player.division} /></div>
                <div className={`mt-auto w-full rounded-lg py-1.5 text-xs font-semibold ${isFirst ? 'bg-white/80 text-[#E30613]' : 'bg-[#F7F7F9] text-[#858A98]'}`}>
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
  return (
    <section className="card-surface overflow-hidden p-4 md:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_170px_minmax(300px,1.4fr)] lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={profile.name} url={profile.avatarUrl} size="lg" />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#858A98]">Sua classificação</div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <span className="max-w-full truncate text-xl font-bold text-[#252733] md:text-2xl" title={profile.name}>{profile.name}</span>
              <DivisionBadge division={profile.division} />
            </div>
            <div className="mt-1 text-sm text-[#858A98]">
              {profile.position ? `Posição global #${profile.position}` : 'Ainda sem posição no ranking'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#FFF0F2] px-4 py-3 lg:block lg:px-5 lg:py-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#858A98]">ELO atual</div>
          <div className="text-3xl font-bold tabular-nums text-[#E30613] md:text-4xl">{profile.rating}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl bg-[#F7F7F9] px-2 py-3 text-center sm:px-3">
            <div className="text-xl font-bold tabular-nums text-[#252733] md:text-2xl">{profile.wins}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#858A98]">Vitórias</div>
          </div>
          <div className="rounded-xl bg-[#F7F7F9] px-2 py-3 text-center sm:px-3">
            <div className="text-xl font-bold tabular-nums text-[#252733] md:text-2xl">{profile.losses}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#858A98]">Derrotas</div>
          </div>
          <div className="rounded-xl bg-[#F7F7F9] px-2 py-3 text-center sm:px-3">
            <div className="text-xl font-bold tabular-nums text-[#252733] md:text-2xl">{profile.winRate}%</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#858A98]">Aproveitamento</div>
          </div>
        </div>
      </div>

      {profile.matchesPlayed > 0 && (
        <div className="mt-5 border-t border-[#E9EAF0] pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#858A98]">
            <span>Melhor ELO: <strong className="font-semibold text-[#252733]">{profile.peakRating}</strong></span>
            <span>{profile.nextDivision ? `${profile.nextDivisionRating! - profile.rating} pts para ${profile.nextDivision}` : 'Divisão máxima'}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#E9EAF0]">
            <div className="h-full rounded-full bg-[#E30613] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
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
    <div className="mx-auto max-w-[1440px] space-y-5 p-3 sm:p-4 lg:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] text-[#E30613]">COMPETIÇÃO X1</div>
          <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#252733] md:text-3xl">LEADERBOARD</h1>
          <p className="mt-1 text-sm text-[#858A98]">{mode === 'pvp' ? 'Ranking competitivo de partidas PvP oficiais.' : 'Ranking competitivo de partidas oficiais de sinuca.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-[#F7F7F9] p-1">
            <button type="button" aria-pressed={mode === 'pvp'} onClick={() => { setMode('pvp'); setDivision(''); setOffset(0); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613] ${mode === 'pvp' ? 'bg-white text-[#E30613]' : 'text-[#858A98] hover:text-[#252733]'}`}>X1 PvP</button>
            <button type="button" aria-pressed={mode === 'pool'} onClick={() => { setMode('pool'); setDivision(''); setOffset(0); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613] ${mode === 'pool' ? 'bg-white text-[#E30613]' : 'text-[#858A98] hover:text-[#252733]'}`}>Sinuca</button>
          </div>
          {mode === 'pvp' && (
            <Link to="/leaderboard/player/me" className="inline-flex min-h-10 items-center rounded-xl border border-[#E9EAF0] px-3 text-sm font-medium text-[#E30613] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613] hover:bg-[#FFF0F2]">
              Ver meu perfil competitivo
            </Link>
          )}
        </div>
      </header>

      {mode === 'pvp' && profile && <SelfSummary profile={profile} />}
      {error && (
        <div role="alert" className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-[#E30613]">
          <span>{error}</span>
          <button onClick={() => setRefreshKey(value => value + 1)} className="btn btn-secondary">Tentar novamente</button>
        </div>
      )}

      <Podium players={leaders} isPool={mode === 'pool'} />

      <section className="card-surface overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[#E9EAF0] p-4 md:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#252733]">Classificação global</h2>
            <p className="mt-1 text-xs text-[#858A98]">Somente jogadores com partidas oficiais concluídas.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <label className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858A98]" />
              <input
                value={search}
                onChange={event => changeSearch(event.target.value)}
                placeholder="Buscar jogador..."
                aria-label="Buscar jogador"
                className="h-10 w-full rounded-xl border border-[#E9EAF0] bg-[#F7F7F9] py-2 pl-9 pr-3 text-sm text-[#252733] transition focus:border-[#E30613] focus:outline-none focus:ring-4 focus:ring-[#E30613]/10"
              />
            </label>
            {mode === 'pvp' && (
              <select
                value={division}
                onChange={event => changeFilter(event.target.value as CompetitiveDivision | '')}
                aria-label="Filtrar por divisão"
                className="h-10 rounded-xl border border-[#E9EAF0] bg-white px-3 text-sm text-[#252733] transition focus:border-[#E30613] focus:outline-none focus:ring-4 focus:ring-[#E30613]/10"
              >
                <option value="">Todas as divisões</option>
                {DIVISIONS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#F7F7F9] text-[10px] uppercase tracking-wide text-[#858A98]">
              <tr>
                <th className="w-20 px-4 py-3.5">Pos.</th>
                <th className="px-4 py-3.5">Jogador</th>
                <th className="w-28 px-4 py-3.5 text-right">{mode === 'pool' ? 'ELO sinuca' : 'ELO'}</th>
                {mode === 'pvp' && <th className="w-32 px-4 py-3.5 text-center">Divisão</th>}
                <th className="w-28 px-4 py-3.5 text-right">{mode === 'pool' ? 'Sinucas' : 'Partidas'}</th>
                <th className="w-20 px-4 py-3.5 text-right">V</th>
                <th className="w-20 px-4 py-3.5 text-right">D</th>
                <th className="w-32 px-4 py-3.5 text-right">Aproveitamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9EAF0]">
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
                      className={`transition-colors duration-200 motion-reduce:transition-none ${player.userId === userId ? 'bg-[#FFF0F2]/60' : 'hover:bg-[#F7F7F9]'}`}
                    >
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex min-w-10 justify-center rounded-lg px-2 py-1 font-bold tabular-nums ${player.position <= 3 ? 'bg-[#FFF0F2] text-[#E30613]' : 'text-[#858A98]'}`}>
                          #{player.position}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link to={mode === 'pool' ? `/profile/${player.userId}` : `/leaderboard/player/${player.userId}`} className="flex min-w-0 items-center gap-3 font-medium text-[#252733] transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613] hover:text-[#E30613]">
                          <Avatar name={player.name} url={player.avatarUrl} size="sm" />
                          <span className="max-w-48 truncate" title={player.name}>{player.name}{player.userId === userId ? ' (você)' : ''}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold tabular-nums text-[#E30613]">{player.rating}</td>
                      {mode === 'pvp' && <td className="px-4 py-3.5 text-center"><DivisionBadge division={player.division} /></td>}
                      <td className="px-4 py-3.5 text-right tabular-nums text-[#252733]">{player.matchesPlayed}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[#252733]">{player.wins}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[#252733]">{player.losses}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-[#252733]">{winRate}%</td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {!loading && players.length === 0 && (
                <tr><td colSpan={mode === 'pvp' ? 8 : 7} className="px-4 py-12 text-center text-sm text-[#858A98]">Nenhum jogador encontrado.</td></tr>
              )}
              {loading && <tr><td colSpan={mode === 'pvp' ? 8 : 7} className="px-4 py-12 text-center text-sm text-[#858A98]">Carregando classificação...</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#E9EAF0] bg-[#F7F7F9]/60 p-3 sm:p-4">
          <button onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="btn btn-secondary min-w-28 justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button>
          <span className="text-xs font-semibold text-[#858A98]">Página {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <button onClick={() => setOffset(value => value + PAGE_SIZE)} disabled={loading || players.length < PAGE_SIZE} className="btn btn-secondary min-w-28 justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613] disabled:opacity-40">Próxima <ChevronRight className="h-4 w-4" /></button>
        </div>
      </section>
    </div>
  );
}
