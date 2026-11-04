import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Crown, Medal, Search, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getCompetitiveLeaderboard,
  getCompetitiveProfile,
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

function Avatar({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base';
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF0F2] font-bold text-[#E30613]`}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function DivisionBadge({ division }: { division: CompetitiveDivision | null }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${divisionStyle(division)}`}>
      {division ?? 'Não classificado'}
    </span>
  );
}

function Podium({ players }: { players: CompetitivePlayer[] }) {
  const order = [players[1], players[0], players[2]];
  return (
    <section className="card-surface p-5 md:p-7">
      <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#252733]">
        <Trophy className="h-4 w-4 text-[#E30613]" /> Pódio global
      </div>
      {players.length === 0 ? (
        <div className="empty-state py-8">Ainda não há jogadores classificados.</div>
      ) : (
        <div className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-3">
          {order.map((player, index) => {
            if (!player) return <div key={`empty-${index}`} />;
            const isFirst = player.position === 1;
            return (
              <motion.div
                key={player.userId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.06 }}
                className={`flex min-w-0 flex-col items-center rounded-2xl border border-[#E9EAF0] bg-white px-2 py-4 text-center ${isFirst ? 'min-h-52 shadow-[0_4px_18px_rgba(37,39,51,0.08)] md:min-h-56' : 'min-h-44 md:min-h-48'}`}
              >
                {isFirst ? <Crown className="mb-2 h-5 w-5 text-[#E30613]" /> : <Medal className="mb-2 h-5 w-5 text-[#858A98]" />}
                <Link to={`/leaderboard/player/${player.userId}`} aria-label={`Perfil competitivo de ${player.name}`}>
                  <Avatar name={player.name} url={player.avatarUrl} size={isFirst ? 'lg' : 'md'} />
                </Link>
                <div className="mt-2 w-full truncate text-sm font-semibold text-[#252733]">{player.name}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-[#E30613]">{player.rating}</div>
                <DivisionBadge division={player.division} />
                <div className="mt-2 text-[10px] font-semibold text-[#858A98]">#{player.position}</div>
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
    <section className="card-surface flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6">
      <div className="flex items-center gap-4">
        <Avatar name={profile.name} url={profile.avatarUrl} size="lg" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#858A98]">Sua classificação</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold text-[#252733]">{profile.name}</span>
            <DivisionBadge division={profile.division} />
          </div>
          <div className="mt-1 text-sm text-[#858A98]">
            {profile.position ? `Posição global #${profile.position}` : 'Ainda sem posição no ranking'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4 md:min-w-[440px]">
        <div><div className="text-2xl font-bold text-[#E30613]">{profile.rating}</div><div className="text-[10px] text-[#858A98]">ELO atual</div></div>
        <div><div className="text-2xl font-bold text-[#252733]">{profile.wins}</div><div className="text-[10px] text-[#858A98]">Vitórias</div></div>
        <div><div className="text-2xl font-bold text-[#252733]">{profile.losses}</div><div className="text-[10px] text-[#858A98]">Derrotas</div></div>
        <div><div className="text-2xl font-bold text-[#252733]">{profile.winRate}%</div><div className="text-[10px] text-[#858A98]">Aproveitamento</div></div>
      </div>
      {profile.matchesPlayed > 0 && (
        <div className="w-full md:max-w-[260px]">
          <div className="flex justify-between text-[10px] text-[#858A98]">
            <span>Melhor ELO: {profile.peakRating}</span>
            <span>{profile.nextDivision ? `${profile.nextDivisionRating! - profile.rating} pts para ${profile.nextDivision}` : 'Divisão máxima'}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#E9EAF0]">
            <div className="h-full rounded-full bg-[#E30613] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

export default function Leaderboard() {
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
    void Promise.all([
      getCompetitiveLeaderboard({ limit: PAGE_SIZE, offset, division: division || null, search: debouncedSearch }),
      getCompetitiveLeaderboard({ limit: 3 }),
      getCompetitiveProfile(userId),
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
  }, [userId, offset, division, debouncedSearch, refreshKey]);

  const changeFilter = (next: CompetitiveDivision | '') => {
    setDivision(next);
    setOffset(0);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] text-[#E30613]">COMPETIÇÃO X1</div>
          <h1 className="mt-1 text-2xl font-semibold text-[#252733] md:text-3xl">LEADERBOARD</h1>
          <p className="mt-1 text-sm text-[#858A98]">Ranking competitivo de partidas PvP oficiais.</p>
        </div>
        <Link to="/leaderboard/player/me" className="text-sm font-medium text-[#E30613] hover:underline">Ver meu perfil competitivo</Link>
      </header>

      {profile && <SelfSummary profile={profile} />}
      {error && (
        <div role="alert" className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-[#E30613]">
          <span>{error}</span>
          <button onClick={() => setRefreshKey(value => value + 1)} className="btn btn-secondary">Tentar novamente</button>
        </div>
      )}

      <Podium players={leaders} />

      <section className="card-surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#E9EAF0] p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-[#252733]">Classificação global</h2>
            <p className="text-xs text-[#858A98]">Somente jogadores com partidas oficiais concluídas.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858A98]" />
              <input value={search} onChange={event => changeSearch(event.target.value)} placeholder="Buscar jogador..." className="w-full rounded-xl border border-[#E9EAF0] bg-[#F7F7F9] py-2 pl-9 pr-3 text-sm text-[#252733] sm:w-52" />
            </label>
            <select value={division} onChange={event => changeFilter(event.target.value as CompetitiveDivision | '')} className="rounded-xl border border-[#E9EAF0] bg-white px-3 py-2 text-sm text-[#252733]">
              <option value="">Todas as divisões</option>
              {DIVISIONS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#F7F7F9] text-[10px] uppercase tracking-wide text-[#858A98]">
              <tr>
                <th className="px-4 py-3">Pos.</th><th className="px-4 py-3">Jogador</th><th className="px-4 py-3">ELO</th>
                <th className="px-4 py-3">Divisão</th><th className="px-4 py-3">Partidas</th><th className="px-4 py-3">V</th>
                <th className="px-4 py-3">D</th><th className="px-4 py-3">Aproveitamento</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {players.map(player => {
                  const winRate = player.matchesPlayed ? Math.round((player.wins / player.matchesPlayed) * 100) : 0;
                  return (
                    <motion.tr key={player.userId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`border-t border-[#E9EAF0] ${player.userId === userId ? 'bg-[#FFF0F2]/60' : 'hover:bg-[#F7F7F9]'}`}>
                      <td className="px-4 py-3 font-semibold text-[#858A98]">#{player.position}</td>
                      <td className="px-4 py-3">
                        <Link to={`/leaderboard/player/${player.userId}`} className="flex items-center gap-3 font-medium text-[#252733] hover:text-[#E30613]">
                          <Avatar name={player.name} url={player.avatarUrl} size="sm" />
                          <span className="max-w-48 truncate">{player.name}{player.userId === userId ? ' (você)' : ''}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums text-[#E30613]">{player.rating}</td>
                      <td className="px-4 py-3"><DivisionBadge division={player.division} /></td>
                      <td className="px-4 py-3 text-[#252733]">{player.matchesPlayed}</td>
                      <td className="px-4 py-3 text-[#252733]">{player.wins}</td>
                      <td className="px-4 py-3 text-[#252733]">{player.losses}</td>
                      <td className="px-4 py-3 text-[#252733]">{winRate}%</td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {!loading && players.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[#858A98]">Nenhum jogador encontrado.</td></tr>
              )}
              {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[#858A98]">Carregando classificação...</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[#E9EAF0] p-3">
          <button onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || loading} className="btn btn-secondary disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Anterior</button>
          <span className="text-xs text-[#858A98]">Página {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <button onClick={() => setOffset(value => value + PAGE_SIZE)} disabled={loading || players.length < PAGE_SIZE} className="btn btn-secondary disabled:opacity-40">Próxima <ChevronRight className="h-4 w-4" /></button>
        </div>
      </section>
    </div>
  );
}
