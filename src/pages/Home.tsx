import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import { JOURNAL_HOME_URL } from '../data/news';
import { ArrowRight, Calendar, Check, ClipboardList, ExternalLink, Flame, Gift, Package, Sparkles, Store, Swords, Trophy, UserPlus, type LucideIcon } from 'lucide-react';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import { useHomePendingCounts } from '../hooks/useHomePendingCounts';
import { useJournalNews } from '../hooks/useJournalNews';
import { getDailyStreakPreview } from '../lib/dailyRewards';

export default function Home() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const userName = useGame(s => s.name);
  const cards = useGame(s => s.cards);
  const avatarUrl = useGame(s => s.avatarUrl);
  const lastDailyClaim = useGame(s => s.lastDailyClaim);
  const dailyStreak = useGame(s => s.dailyStreak);
  const missions = useGame(s => s.missions);
  const events = useGame(s => s.events);
  const newCardUids = useGame(s => s.newCardUids);
  const claimDaily = useGame(s => s.claimDaily);
  const packConfigs = useGame(s => s.packConfigs);
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const pending = useHomePendingCounts();
  const journal = useJournalNews();
  const rarest = [...cards].sort((a, b) => b.overall - a.overall).slice(0, 5);
  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const currentLevelXp = xp - lvlXp;
  const levelXpGoal = nextXp - lvlXp;
  const pct = Math.min(100, Math.max(0, (currentLevelXp / levelXpGoal) * 100));
  const event = now === null
    ? undefined
    : events.filter(item => item.endsAt > now).sort((a, b) => a.endsAt - b.endsAt)[0];
  const streakPreview = getDailyStreakPreview(lastDailyClaim, dailyStreak, now ?? 0);
  const dailyAvailable = now !== null && !streakPreview.claimedToday;
  const eventRemaining = event && now !== null ? event.endsAt - now : 0;
  const countdown = event
    ? `${Math.floor(eventRemaining / 86400000)}d ${Math.floor((eventRemaining % 86400000) / 3600000)}h ${Math.floor((eventRemaining % 3600000) / 60000)}m`
    : '';
  const affordablePack = packConfigs
    .filter(pack => pack.unlocked && pack.price <= coins)
    .sort((a, b) => a.price - b.price)[0];
  const openPackHref = affordablePack ? `/open/${affordablePack.id}` : '/packs';
  const openPackLabel = affordablePack ? `Abrir ${affordablePack.name}` : 'Ver pacotes';
  const activeMissions = missions.filter(mission => !mission.claimed).slice(0, 3);
  const readyMissionCount = missions.filter(mission => mission.completed && !mission.claimed).length;

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleDaily = async () => {
    if (claimingDaily || !dailyAvailable) return;
    setClaimingDaily(true);
    try {
      const result = await claimDaily();
      if (result.ok) {
        const bonusMessage = result.bonus > 0 ? `, bônus +${result.bonus}` : '';
        const dayLabel = result.streak === 1 ? 'dia' : 'dias';
        toast.success(`Recompensa diária: +${result.amount} moedas · ${result.streak} ${dayLabel} de sequência${bonusMessage}`);
      } else if (result.error) toast.error(result.error);
      else toast.info('Recompensa diária já coletada. Volte mais tarde.');
    } finally {
      setClaimingDaily(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <section className="card-surface flex flex-col gap-5 overflow-hidden bg-gradient-to-r from-[var(--soft)] to-white p-4 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--red)] text-lg font-bold text-white">
            {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : level}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-[var(--text)]">{userName || 'Jogador'}</div>
            <div className="text-xs text-[var(--muted)]">Nível {level}</div>
            <div className="mt-2 max-w-xs">
              <div className="mb-1 flex justify-between text-xs text-[var(--muted)]">
                <span>{currentLevelXp} XP</span><span>{levelXpGoal} XP</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full bg-[var(--red)] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-4 md:justify-end md:border-0 md:pt-0">
          <div className="flex gap-6">
            <div>
              <div className="text-xs text-[var(--muted)]">Moedas</div>
              <div className="font-bold text-[var(--text)]">{coins.toLocaleString('pt-BR')}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Cartas</div>
              <div className="font-bold text-[var(--text)]">{cards.length}</div>
            </div>
          </div>
          <div className="min-w-36 text-xs text-[var(--muted)]">
            <div className="flex items-center gap-1 font-semibold text-[var(--text)]">
              <Flame className="h-4 w-4 text-orange-500" />
              {streakPreview.activeStreak} {streakPreview.activeStreak === 1 ? 'dia' : 'dias'} de sequência
            </div>
            <div className="mt-1">Próximo bônus: +{streakPreview.nextBonus} moedas</div>
          </div>
          {now === null ? (
            <button disabled className="btn btn-primary btn-sm">Verificando recompensa...</button>
          ) : dailyAvailable ? (
            <button onClick={handleDaily} disabled={claimingDaily} className="btn btn-primary btn-sm">
              <Gift className="h-4 w-4" />
              {claimingDaily ? 'Resgatando...' : 'Resgatar recompensa'}
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-medium text-[var(--muted)]">
              <Check className="h-4 w-4 text-emerald-600" /> Recompensa resgatada hoje
            </div>
          )}
        </div>
      </section>

      <section className="card-surface p-4 md:p-5" aria-labelledby="home-pending-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="home-pending-title" className="text-lg font-semibold text-[var(--text)]">Pendências</h2>
            <p className="text-sm text-[var(--muted)]">Acompanhe o que precisa da sua atenção.</p>
          </div>
          {pending.loading && <span className="text-xs text-[var(--muted)]">Atualizando...</span>}
        </div>
        {pending.error && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]" role="alert">
            <span>{pending.error}</span>
            <button type="button" className="text-sm font-semibold text-[var(--red)] hover:underline" onClick={pending.retry}>
              Tentar novamente
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <PendingItem to="/match" label="Desafios recebidos" count={pending.counts?.challenges ?? null} loading={pending.loading} icon={Swords} />
          <PendingItem to="/friends" label="Pedidos de amizade" count={pending.counts?.friendRequests ?? null} loading={pending.loading} icon={UserPlus} />
          <PendingItem to="/missions" label="Missões prontas" count={readyMissionCount} loading={false} icon={ClipboardList} />
          <PendingItem to="/market" label="Anúncios vendidos" count={pending.counts?.soldListings ?? null} loading={pending.loading} icon={Store} />
          <PendingItem to="/collection" label="Cartas novas" count={newCardUids.length} loading={false} icon={Sparkles} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card-surface flex flex-col justify-between gap-5 bg-gradient-to-br from-[var(--soft)] to-white p-5 md:p-6">
          <div>
            <Trophy className="mb-3 h-7 w-7 text-[var(--red)]" />
            <h2 className="text-xl font-bold text-[var(--text)]">Jogar agora</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Entre em campo ou desafie um amigo para uma partida.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/match" className="btn btn-primary btn-lg">
              Partida <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/friends" className="btn btn-secondary btn-lg">
              Desafiar amigo
            </Link>
          </div>
        </div>
        <div className="card-surface flex flex-col justify-between gap-5 p-5 md:p-6">
          <div>
            <Package className="mb-3 h-7 w-7 text-[var(--red)]" />
            <h2 className="text-xl font-bold text-[var(--text)]">Novas cartas esperam por você</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {affordablePack ? `${affordablePack.name} · ${affordablePack.price.toLocaleString('pt-BR')} moedas` : 'Confira os pacotes disponíveis na loja.'}
            </p>
          </div>
          <div>
            <Link to={openPackHref} className="btn btn-secondary btn-lg">
              {openPackLabel} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Radar do SENAI</h2>
            <p className="text-sm text-[var(--muted)]">Prévia das notícias do Jornal FutSenai.</p>
          </div>
          <a href={JOURNAL_HOME_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--red)] hover:underline">
            Ver todas <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        {journal.error && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]" role="alert">
            <span>{journal.error}{journal.news.length > 0 ? ' Exibindo as últimas notícias carregadas.' : ''}</span>
            <button type="button" className="text-sm font-semibold text-[var(--red)] hover:underline" onClick={journal.retry}>
              Tentar novamente
            </button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {journal.loading && journal.news.length === 0 && [0, 1, 2].map(index => (
            <div key={index} className="card-surface p-4">
              <Skeleton className="mb-3 h-36 w-full" />
              <Skeleton className="mb-2 h-4 w-1/3" />
              <Skeleton className="mb-2 h-5 w-4/5" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
          {journal.news.slice(0, 3).map((news, index) => (
            <a key={news.id} href={news.url} target="_blank" rel="noopener noreferrer" className="card-surface flex min-w-0 flex-col overflow-hidden transition hover:-translate-y-0.5">
              {news.image
                ? <img src={news.image} alt="" className="h-36 w-full object-cover" loading="lazy" />
                : <div className="flex h-36 items-center justify-center bg-[var(--soft)]"><Calendar className="h-8 w-8 text-[var(--red)]" /></div>}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${index === 0 ? 'bg-[var(--soft)] text-[var(--red)]' : 'bg-[var(--bg)] text-[var(--muted)]'}`}>
                    {news.category}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{news.date}</span>
                </div>
                <h3 className="line-clamp-2 text-sm font-semibold text-[var(--text)]">{news.title}</h3>
                <p className="mt-2 line-clamp-2 flex-1 text-xs text-[var(--muted)]">{news.summary}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--red)]">
                  Ler notícia <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </a>
          ))}
          {!journal.loading && !journal.error && journal.news.length === 0 && (
            <p className="text-sm text-[var(--muted)]">Ainda não há notícias publicadas.</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Cartas com maior overall</h2>
          <Link to="/collection" className="text-sm font-medium text-[var(--red)] hover:underline">Ver coleção</Link>
        </div>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {rarest.map(card => (
            <Link key={card.uid} to={`/card/${card.uid}`} className="shrink-0 snap-start">
              <Card card={card} size="sm" />
            </Link>
          ))}
          {rarest.length === 0 && <div className="text-sm text-[var(--muted)]">Nenhuma carta ainda.</div>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {event && (
          <div className="card-surface flex flex-col gap-4 p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[var(--soft)] p-3"><Calendar className="h-5 w-5 text-[var(--red)]" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[var(--text)]">Próximo evento</h2>
                <div className="mt-2 text-base font-bold text-[var(--text)]">{event.name}</div>
                <div className="text-sm text-[var(--muted)]">Recompensa: {event.reward}</div>
                <div className="mt-1 text-sm font-semibold text-[var(--red)]">{countdown}</div>
              </div>
            </div>
            <Link to="/shop" className="btn btn-secondary btn-sm self-start">
              Ver eventos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <div className="card-surface p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[var(--text)]">Missões em andamento</h2>
            <Link to="/missions" className="text-sm font-medium text-[var(--red)] hover:underline">Ver todas</Link>
          </div>
          <div className="space-y-3">
            {activeMissions.map(mission => (
              <div key={mission.id} className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--soft)] text-xs font-bold text-[var(--red)]">
                  {mission.completed ? <Check className="h-4 w-4" /> : `${Math.round((mission.progress / mission.target) * 100)}%`}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--text)]">{mission.title}</div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                    <div className="h-full bg-[var(--red)]" style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{mission.progress}/{mission.target}</div>
                </div>
              </div>
            ))}
            {activeMissions.length === 0 && <div className="text-sm text-[var(--muted)]">Todas as missões foram resgatadas.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function PendingItem({
  to,
  label,
  count,
  loading,
  icon: Icon,
}: {
  to: string;
  label: string;
  count: number | null;
  loading: boolean;
  icon: LucideIcon;
}) {
  return (
    <Link
      to={to}
      className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-white p-3 transition hover:border-[var(--red)]"
    >
      <Icon className="h-5 w-5 shrink-0 text-[var(--red)]" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-xs font-medium text-[var(--muted)]">{label}</span>
      {count === null && loading
        ? <Skeleton className="h-6 w-7" />
        : <span className="text-lg font-bold text-[var(--text)]">{count ?? '—'}</span>}
    </Link>
  );
}
