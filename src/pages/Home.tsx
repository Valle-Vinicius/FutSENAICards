import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Check,
  ClipboardList,
  Coins,
  ExternalLink,
  Flame,
  Gift,
  Layers3,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  Swords,
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
import { RARITY_ORDER } from '../types';

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
  const homePageRef = useRef<HTMLDivElement>(null);
  const topCards = [...cards]
    .sort((a, b) => b.overall - a.overall || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))
    .slice(0, 5);
  const featuredCard = topCards[0];
  const animatedCoins = useCountUp(coins);
  const animatedLevel = useCountUp(level);
  const greetingName = userName?.trim() || 'craque';
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
  const noPendingItems = !pending.loading
    && !pending.error
    && pending.counts !== null
    && pending.counts.challenges === 0
    && pending.counts.friendRequests === 0
    && pending.counts.soldListings === 0
    && readyMissionCount === 0
    && newCardUids.length === 0;

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const root = homePageRef.current;
    if (!root || typeof window.IntersectionObserver !== 'function') return;
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const observer = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('home-reveal--visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -24px 0px' });
    root.querySelectorAll<HTMLElement>('[data-home-reveal]').forEach((section, index) => {
      section.style.setProperty('--home-reveal-delay', `${Math.min(index * 45, 180)}ms`);
      section.classList.add('home-reveal');
      observer.observe(section);
    });

    return () => observer.disconnect();
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
    <div className="home-page" ref={homePageRef}>
      <div className="home-container home-page__inner">
        <section className="home-hero" aria-labelledby="home-hero-title" data-home-reveal>
          <div className="home-hero__editorial">
            <p className="home-eyebrow"><span /> FUTSENAI <i>/</i> FUTEBOL ENTRE AMIGOS</p>
            <h1 id="home-hero-title">O seu jogo.<br /><span>O seu clube.</span></h1>
            <p className="home-hero__intro">
              {newCardUids.length > 0
                ? `Bora, ${greetingName}. Tem ${newCardUids.length} carta${newCardUids.length === 1 ? '' : 's'} nova${newCardUids.length === 1 ? '' : 's'} esperando.`
                : `Bora, ${greetingName}. O campo está esperando por você.`}
            </p>
            <div className="home-hero__actions">
              <Link to="/match" className="home-button home-button--primary">
                Entrar em campo <ArrowRight aria-hidden="true" />
              </Link>
              <Link to={openPackHref} className="home-button home-button--text">
                {openPackLabel} <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="home-hero__player">
            <div className="home-hero__circle" />
            <div className="home-hero__card-stage">
              {featuredCard ? (
                featuredCard.uid ? (
                  <Link
                    to={`/card/${featuredCard.uid}`}
                    className="home-hero__featured-card"
                    aria-label={`Ver carta de ${featuredCard.name}`}
                  >
                    <Card card={featuredCard} size="lg" animateHover={false} />
                  </Link>
                ) : (
                  <div className="home-hero__featured-card home-hero__featured-card--static">
                    <Card card={featuredCard} size="lg" animateHover={false} />
                  </div>
                )
              ) : (
                <div className="home-hero__empty">
                  <Sparkles aria-hidden="true" />
                  <strong>Sua coleção começa aqui.</strong>
                  <Link to={openPackHref} className="home-button home-button--primary">
                    {openPackLabel} <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
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
                <span>Conta FUTSENAI</span>
              </div>
            </div>
            <div className="home-account__progress">
              <div><span>Progresso do nível</span><strong>{currentLevelXp} <small>/ {levelXpGoal} XP</small></strong></div>
              <div className="home-progress"><span style={{ width: `${pct}%` }} /></div>
            </div>
            <dl className="home-account__numbers">
              <div><dt><Coins aria-hidden="true" /> Moedas</dt><dd>{animatedCoins.toLocaleString('pt-BR')}</dd></div>
              <div><dt>Nível</dt><dd>{animatedLevel}</dd></div>
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

        <section className="home-club-grid" aria-label="Coleção e missões do clube" data-home-reveal>
          <div className="home-collection">
            <div className="home-section-heading">
              <div>
                <p className="home-eyebrow">SEU ACERVO</p>
                <h2>Cartas em destaque</h2>
              </div>
              <Link to="/collection" className="home-section-link">Ver coleção <ArrowRight aria-hidden="true" /></Link>
            </div>
            <div className={`home-collection__viewport${topCards.length > 1 ? ' home-collection__viewport--scrollable' : ''}`}>
              <div className="home-collection__cards" role="region" aria-label="Cartas em destaque" tabIndex={0}>
                {topCards.map((card, index) => {
                  const key = card.uid || `${card.playerId}-${card.name}-${index}`;
                  const cardClass = `home-collection__card${card.rarity === 'legendary' || card.rarity === 'icon' ? ' home-collection__card--premium' : ''}`;
                  const cardContent = <Card card={card} size="lg" animateHover={false} />;

                  return card.uid ? (
                    <Link key={key} to={`/card/${card.uid}`} className={cardClass}>
                      {cardContent}
                    </Link>
                  ) : (
                    <div key={key} className={`${cardClass} home-collection__card--static`}>
                      {cardContent}
                    </div>
                  );
                })}
                {topCards.length === 0 && <p className="home-empty">Sua coleção ainda está vazia. <Link to="/packs">Abra seu primeiro pacote.</Link></p>}
              </div>
              {topCards.length > 3 && (
                <span className="home-collection__scroll-hint"><ArrowRight aria-hidden="true" /> Deslize para ver mais</span>
              )}
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
              <div className="home-missions__empty">
                <ClipboardList aria-hidden="true" />
                <div>
                  <strong>{missions.length > 0 ? 'Tudo resgatado.' : 'O apito ainda não tocou.'}</strong>
                  <span>{missions.length > 0 ? 'Próximas missões em breve.' : 'Assim que uma missão pintar, ela aparece aqui.'}</span>
                </div>
                <Link to="/missions" aria-label="Ver missões"><ArrowRight aria-hidden="true" /></Link>
              </div>
            )}
          </div>
        </section>

        <section className="home-pending" aria-labelledby="home-pending-title" data-home-reveal>
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
          {noPendingItems ? (
            <p className="home-pending__empty">Nada pendente. Campo livre.</p>
          ) : (
            <div className="home-pending__list">
              <PendingItem to="/match" label="Desafios recebidos" count={pending.counts?.challenges ?? null} loading={pending.loading} icon={Swords} />
              <PendingItem to="/friends" label="Pedidos de amizade" count={pending.counts?.friendRequests ?? null} loading={pending.loading} icon={UserPlus} />
              <PendingItem to="/missions" label="Missões prontas" count={readyMissionCount} loading={false} icon={ClipboardList} />
              <PendingItem to="/market" label="Anúncios vendidos" count={pending.counts?.soldListings ?? null} loading={pending.loading} icon={Store} />
              <PendingItem to="/collection" label="Cartas novas" count={newCardUids.length} loading={false} icon={Sparkles} />
            </div>
          )}
        </section>

        <section className="home-editorial-grid" aria-label="Notícias e atalhos" data-home-reveal>
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
                    className={index === 0 ? 'home-story home-story--lead' : 'home-story home-story--secondary'}
                  >
                    {news.image
                      ? <img src={news.image} alt="" loading="lazy" />
                      : <span className="home-story__image-placeholder" aria-hidden="true"><Calendar /></span>}
                    {index === 0 && <span className="home-story__badge">NOVIDADE</span>}
                    <span className="home-story__meta">
                      <span className="home-story__category">{news.category}</span>
                      <i>·</i>
                      <span>{news.date}</span>
                    </span>
                    <strong>{news.title}</strong>
                    <span className="home-story__summary">{news.summary}</span>
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
              <div className="home-match-promo__pitch" aria-hidden="true"><span /></div>
            </div>
            <div className="home-match-promo__copy">
              <h2>O campo<br />está aberto.</h2>
              <p>Monte seu time e dispute uma partida ou desafie um amigo.</p>
            </div>
            <div className="home-match-promo__actions">
              <Link to="/match" className="home-button home-button--light">
                Jogar partida <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/friends" className="home-match-promo__secondary">Desafiar amigo</Link>
            </div>
          </aside>
        </section>

        <nav className="home-shortcuts" aria-label="Atalhos do clube" data-home-reveal>
          <Link to="/squad"><span className="home-shortcut__number">01</span><span className="home-shortcut__icon"><Shirt aria-hidden="true" /></span><strong>Montar elenco</strong><ArrowRight aria-hidden="true" /></Link>
          <Link to="/collection"><span className="home-shortcut__number">02</span><span className="home-shortcut__icon"><Layers3 aria-hidden="true" /></span><strong>Minhas cartas</strong><ArrowRight aria-hidden="true" /></Link>
          <Link to="/market"><span className="home-shortcut__number">03</span><span className="home-shortcut__icon"><Store aria-hidden="true" /></span><strong>Mercado</strong><ArrowRight aria-hidden="true" /></Link>
          <Link to="/shop"><span className="home-shortcut__number">04</span><span className="home-shortcut__icon"><ShoppingBag aria-hidden="true" /></span><strong>Loja</strong><ArrowRight aria-hidden="true" /></Link>
        </nav>

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
        : <strong className={count === 0 ? 'home-pending-item__count--zero' : count !== null && count > 0 ? 'home-pending-item__count--active' : ''}>{count ?? '—'}</strong>}
    </Link>
  );
}

function useCountUp(value: number) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const motionQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const reducedMotion = motionQuery?.matches ?? false;
    if (reducedMotion || typeof window.requestAnimationFrame !== 'function') {
      const timeoutId = window.setTimeout(() => {
        previousValue.current = value;
        setDisplayValue(value);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const startValue = previousValue.current;
    const startTime = window.performance.now();
    const duration = 420;
    let frameId = 0;
    const onMotionChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      window.cancelAnimationFrame(frameId);
      previousValue.current = value;
      setDisplayValue(value);
    };
    const animate = (time: number) => {
      const progress = Math.min(1, (time - startTime) / duration);
      const easedProgress = 1 - (1 - progress) ** 3;
      const nextValue = Math.round(startValue + (value - startValue) * easedProgress);
      previousValue.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    motionQuery?.addEventListener('change', onMotionChange);
    return () => {
      window.cancelAnimationFrame(frameId);
      motionQuery?.removeEventListener('change', onMotionChange);
    };
  }, [value]);

  return displayValue;
}
