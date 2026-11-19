import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Check,
  ClipboardList,
  ExternalLink,
  Flame,
  Gift,
  Sparkles,
  Store,
  Swords,
  Trophy,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { JOURNAL_HOME_URL } from '../data/news';
import { useHomePendingCounts } from '../hooks/useHomePendingCounts';
import { useJournalNews } from '../hooks/useJournalNews';
import { getDailyStreakPreview } from '../lib/dailyRewards';
import { toast } from '../store/toast';
import { useGame } from '../store/useGame';
import Card from '../components/Card';
import Skeleton from '../components/Skeleton';
import MateusHome from '../imagens/MATEUSHOMEPAGE.webp';

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
  const topCards = [...cards].sort((a, b) => b.overall - a.overall).slice(0, 5);
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
    const tick = () => setNow(Date.now());
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
    <div className="home-page">
      <div className="home-page__inner">
        <section className="home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero__editorial">
            <p className="home-eyebrow"><span /> FUTSENAI <i>/</i> FUTEBOL ENTRE AMIGOS</p>
            <h1 id="home-hero-title">O seu jogo.<br /><span>O seu clube.</span></h1>
            <p className="home-hero__intro">
              {userName ? `Bem-vindo de volta, ${userName}.` : 'Monte seu elenco, entre em campo e escreva sua história.'}
            </p>
            <div className="home-hero__actions">
              <Link to="/match" className="home-button home-button--primary">
                Entrar em campo <ArrowRight aria-hidden="true" />
              </Link>
              <Link to={openPackHref} className="home-button home-button--text">
                {openPackLabel} <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="home-hero__edition">FUTEBOL <span>•</span> CARTAS <span>•</span> COMUNIDADE</div>
          </div>

          <div className="home-hero__player">
            <div className="home-hero__circle" />
            <div className="home-hero__player-mark" aria-hidden="true">F</div>
            <img src={MateusHome} alt="Jogador vestindo uniforme vermelho do FUTSENAI" />
            <span className="home-hero__player-caption">PAIXÃO PELO JOGO</span>
          </div>

          <aside className="home-account" aria-label="Resumo da sua conta">
            <div className="home-account__heading">
              <span className="home-eyebrow">SEU CLUBE</span>
              <Link to="/profile" aria-label="Ver perfil">Perfil <ArrowRight aria-hidden="true" /></Link>
            </div>
            <div className="home-account__identity">
              <div className="home-account__avatar">
                {avatarUrl
                  ? <img src={avatarUrl} alt="" />
                  : <span>{(userName || 'J').trim().charAt(0).toUpperCase()}</span>}
              </div>
              <div>
                <strong>{userName || 'Jogador'}</strong>
                <span>Nível {level}</span>
              </div>
            </div>
            <div className="home-account__progress">
              <div><span>Progresso do nível</span><strong>{currentLevelXp} <small>/ {levelXpGoal} XP</small></strong></div>
              <div className="home-progress"><span style={{ width: `${pct}%` }} /></div>
            </div>
            <dl className="home-account__numbers">
              <div><dt>Moedas</dt><dd>{coins.toLocaleString('pt-BR')}</dd></div>
              <div><dt>Cartas</dt><dd>{cards.length}</dd></div>
            </dl>
            <div className="home-streak">
              <div className="home-streak__info">
                <Flame aria-hidden="true" />
                <div>
                  <strong>{streakPreview.activeStreak} {streakPreview.activeStreak === 1 ? 'dia' : 'dias'} seguidos</strong>
                  <span>Próximo bônus: +{streakPreview.nextBonus} moedas</span>
                </div>
              </div>
              {now === null ? (
                <button disabled className="home-button home-button--claim">Verificando...</button>
              ) : dailyAvailable ? (
                <button onClick={handleDaily} disabled={claimingDaily} className="home-button home-button--claim">
                  <Gift aria-hidden="true" /> {claimingDaily ? 'Resgatando...' : 'Resgatar recompensa'}
                </button>
              ) : (
                <div className="home-streak__claimed"><Check aria-hidden="true" /> Recompensa resgatada hoje</div>
              )}
            </div>
          </aside>
        </section>

        <section className="home-pending" aria-labelledby="home-pending-title">
          <div className="home-section-heading">
            <div>
              <p className="home-eyebrow">NO SEU RADAR</p>
              <h2 id="home-pending-title">Pendências</h2>
            </div>
            {pending.loading && <span className="home-updating">Atualizando...</span>}
          </div>
          {pending.error && (
            <div className="home-error" role="alert">
              <span>{pending.error}</span>
              <button type="button" onClick={pending.retry}>Tentar novamente</button>
            </div>
          )}
          <div className="home-pending__list">
            <PendingItem to="/match" label="Desafios recebidos" count={pending.counts?.challenges ?? null} loading={pending.loading} icon={Swords} />
            <PendingItem to="/friends" label="Pedidos de amizade" count={pending.counts?.friendRequests ?? null} loading={pending.loading} icon={UserPlus} />
            <PendingItem to="/missions" label="Missões prontas" count={readyMissionCount} loading={false} icon={ClipboardList} />
            <PendingItem to="/market" label="Anúncios vendidos" count={pending.counts?.soldListings ?? null} loading={pending.loading} icon={Store} />
            <PendingItem to="/collection" label="Cartas novas" count={newCardUids.length} loading={false} icon={Sparkles} />
          </div>
        </section>

        <section className="home-editorial-grid" aria-label="Notícias e atalhos">
          <div className="home-news">
            <div className="home-section-heading">
              <div>
                <p className="home-eyebrow">JORNAL FUTSENAI</p>
                <h2>Radar do SENAI</h2>
              </div>
              <a href={JOURNAL_HOME_URL} target="_blank" rel="noopener noreferrer" className="home-section-link">
                Ver todas <ExternalLink aria-hidden="true" />
              </a>
            </div>
            {journal.error && (
              <div className="home-error" role="alert">
                <span>{journal.error}{journal.news.length > 0 ? ' Exibindo as últimas notícias carregadas.' : ''}</span>
                <button type="button" onClick={journal.retry}>Tentar novamente</button>
              </div>
            )}
            {journal.loading && journal.news.length === 0 ? (
              <div className="home-news__loading">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            ) : journal.news.length > 0 ? (
              <div className="home-news__stories">
                {journal.news.slice(0, 3).map((news, index) => (
                  <a
                    key={news.id}
                    href={news.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={index === 0 ? 'home-story home-story--lead' : 'home-story'}
                  >
                    {news.image && <img src={news.image} alt="" loading="lazy" />}
                    <span className="home-story__meta">{news.category} <i>·</i> {news.date}</span>
                    <strong>{news.title}</strong>
                    {index === 0 && <span className="home-story__summary">{news.summary}</span>}
                    <span className="home-story__read">Ler notícia <ArrowRight aria-hidden="true" /></span>
                  </a>
                ))}
              </div>
            ) : (
              !journal.error && <p className="home-empty">Ainda não há notícias publicadas.</p>
            )}
          </div>

          <aside className="home-match-promo">
            <div className="home-match-promo__top">
              <p className="home-eyebrow">A PRÓXIMA JOGADA É SUA</p>
              <Trophy aria-hidden="true" />
            </div>
            <h2>O campo<br />está aberto.</h2>
            <p>Monte seu time e dispute uma partida ou desafie um amigo.</p>
            <Link to="/match" className="home-button home-button--light">
              Jogar partida <ArrowRight aria-hidden="true" />
            </Link>
            <Link to="/friends" className="home-match-promo__secondary">Desafiar amigo</Link>
          </aside>
        </section>

        <nav className="home-shortcuts" aria-label="Atalhos do clube">
          <Link to="/squad"><span>01</span> Montar elenco <ArrowRight aria-hidden="true" /></Link>
          <Link to="/collection"><span>02</span> Minhas cartas <ArrowRight aria-hidden="true" /></Link>
          <Link to="/market"><span>03</span> Mercado <ArrowRight aria-hidden="true" /></Link>
          <Link to="/shop"><span>04</span> Loja <ArrowRight aria-hidden="true" /></Link>
        </nav>

        <section className="home-club-grid">
          <div className="home-collection">
            <div className="home-section-heading">
              <div>
                <p className="home-eyebrow">SEU ACERVO</p>
                <h2>Cartas em destaque</h2>
              </div>
              <Link to="/collection" className="home-section-link">Ver coleção <ArrowRight aria-hidden="true" /></Link>
            </div>
            <div className="home-collection__cards">
              {topCards.map(card => (
                <Link key={card.uid} to={`/card/${card.uid}`} className="home-collection__card">
                  <Card card={card} size="sm" />
                </Link>
              ))}
              {topCards.length === 0 && <p className="home-empty">Sua coleção ainda está vazia. <Link to="/packs">Abra seu primeiro pacote.</Link></p>}
            </div>
          </div>

          <div className="home-missions">
            {event && (
              <div className="home-event">
                <div className="home-event__heading">
                  <Calendar aria-hidden="true" />
                  <div><p className="home-eyebrow">PRÓXIMO EVENTO</p><h3>{event.name}</h3></div>
                </div>
                <div className="home-event__details">
                  <span>Recompensa: {event.reward}</span>
                  <strong>{countdown}</strong>
                </div>
                <Link to="/shop">Ver eventos <ArrowRight aria-hidden="true" /></Link>
              </div>
            )}
            <div className="home-missions__heading">
              <div>
                <p className="home-eyebrow">SEU PRÓXIMO OBJETIVO</p>
                <h2>Missões em andamento</h2>
              </div>
              <Link to="/missions" className="home-section-link">Todas <ArrowRight aria-hidden="true" /></Link>
            </div>
            {activeMissions.length > 0 ? (
              <div className="home-missions__list">
                {activeMissions.map(mission => (
                  <div key={mission.id} className="home-mission">
                    <div className="home-mission__progress">
                      {mission.completed ? <Check aria-label="Concluída" /> : `${Math.round((mission.progress / mission.target) * 100)}%`}
                    </div>
                    <div className="home-mission__body">
                      <strong>{mission.title}</strong>
                      <div className="home-progress"><span style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }} /></div>
                      <span>{mission.progress}/{mission.target}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="home-empty">Todas as missões foram resgatadas.</p>
            )}
          </div>
        </section>

      </div>
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
    <Link to={to} className="home-pending-item">
      <Icon aria-hidden="true" />
      <span>{label}</span>
      {count === null && loading
        ? <Skeleton className="h-6 w-7" />
        : <strong>{count ?? '—'}</strong>}
    </Link>
  );
}
