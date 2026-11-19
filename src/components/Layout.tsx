import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { LayoutDashboard, Package, CreditCard, Users, Scale, Trophy, Medal, Store, Target, Flag, ShoppingBag, User, Settings as SettingsIcon, Menu, Bell, UserPlus, Shield, Search, X, History, Heart, ChevronDown } from 'lucide-react';
import { useGame } from '../store/useGame';
import { supabase } from '../lib/supabase';
import { toast } from '../store/toast';
import ChangelogPopover from './ChangelogPopover';
import * as challengesService from '../lib/services/challenges';
import * as poolService from '../lib/services/pool';
import * as friendsService from '../lib/services/friends';
import type { FriendUser } from '../lib/services/friends';

const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/packs', label: 'Abrir pacotes', icon: Package },
  { to: '/collection', label: 'Minhas cartas', icon: CreditCard },
  { to: '/squad', label: 'Montar elenco', icon: Users },
  { to: '/compare', label: 'Comparar jogadores', icon: Scale },
  { to: '/match', label: 'Partida', icon: Trophy },
  { to: '/market', label: 'Mercado', icon: Store },
  { to: '/sbc', label: 'Desafios', icon: Target },
  { to: '/missions', label: 'Missões', icon: Flag },
  { to: '/shop', label: 'Loja', icon: ShoppingBag },
  { to: '/profile', label: 'Perfil', icon: User },
  { to: '/settings', label: 'Configurações', icon: SettingsIcon },
  { to: '/friends', label: 'Amizades', icon: UserPlus },
  { to: '/leaderboard', label: 'Leaderboard', icon: Medal },
  { to: '/changelog', label: 'Changelog', icon: History },
];

const HOME_NAV_GROUPS = [
  { label: 'Meu clube', paths: ['/packs', '/collection', '/squad', '/compare'] },
  { label: 'Competir', paths: ['/match', '/sbc', '/missions'] },
  { label: 'Comunidade', paths: ['/market', '/shop', '/friends', '/leaderboard'] },
] as const;

const TITLES: Record<string, string> = {
  '/': 'Visão geral',
  '/packs': 'Abrir pacotes',
  '/collection': 'Minhas cartas',
  '/squad': 'Montar elenco',
  '/compare': 'Comparar jogadores',
  '/match': 'Partida',
  '/market': 'Mercado',
  '/sbc': 'Desafios',
  '/missions': 'Missões',
  '/shop': 'Loja',
  '/profile': 'Perfil',
  '/settings': 'Configurações',
  '/friends': 'Amizades',
  '/leaderboard': 'Leaderboard',
  '/about': 'Sobre',
};

export default function Layout({ children }: { children?: ReactNode }) {
  const avatarUrl = useGame(s => s.avatarUrl);
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const newCount = useGame(s => s.newCardUids.length);
  const pendingFriends = useGame(s => s.pendingFriends);
  const transactions = useGame(s => s.transactions);
  const missions = useGame(s => s.missions);
  const listings = useGame(s => s.listings);
  const location = useLocation();
  const isHomeRoute = location.pathname === '/';
  const isMatchRoute = location.pathname === '/match';
  const navigate = useNavigate();
  const routeTitle = TITLES[location.pathname]
    || (location.pathname.startsWith('/card/') ? 'Carta'
      : location.pathname.startsWith('/open/') ? 'Abrir pacote'
        : location.pathname.startsWith('/profile/') ? 'Perfil do jogador'
          : location.pathname.startsWith('/pool/') ? 'Sinuca'
            : 'Página');
  const [title, setTitle] = useState(routeTitle);
  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const pct = Math.min(100, ((xp - lvlXp) / (nextXp - lvlXp)) * 100);
  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteFriends, setPaletteFriends] = useState<FriendUser[]>([]);
  const paletteInput = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useLayoutEffect(() => {
    setTitle(routeTitle);
    document.title = `${routeTitle} | FutSENAI Cards`;
  }, [routeTitle, location.pathname]);
  useEffect(() => {
    const titleElement = document.querySelector('title');
    if (!titleElement) return;
    const observer = new MutationObserver(() => {
      if (!document.title.includes(' | ')) return;
      const currentTitle = document.title.split(' | ')[0];
      if (currentTitle) setTitle(currentTitle);
    });
    observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id ?? null;
      setCurrentUserId(userId);
      setIsAdmin(userId === '35a8dc5f-c5db-4b33-9380-a32739ff6c10');
    });
  }, []);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  const [pendingPoolMatchId, setPendingPoolMatchId] = useState<string | null>(null);
  const [pendingChallengesCount, setPendingChallengesCount] = useState(0);
  const [pendingPoolCount, setPendingPoolCount] = useState(0);
  const cards = useGame(s => s.cards);
  const NAV_WITH_ADMIN = [
    ...(isAdmin ? [...NAV, { to: '/admin', label: 'Administrador', icon: Shield }] : NAV),
  ];
  const normalizedPaletteQuery = paletteQuery.trim().toLocaleLowerCase();
  const filteredPages = NAV_WITH_ADMIN.filter(page => !normalizedPaletteQuery
    || page.label.toLocaleLowerCase().includes(normalizedPaletteQuery));
  const filteredCards = normalizedPaletteQuery.length < 2 ? [] : cards
    .filter(card => card.name.toLocaleLowerCase().includes(normalizedPaletteQuery))
    .slice(0, 8);
  const filteredFriends = normalizedPaletteQuery.length < 2 ? [] : paletteFriends
    .filter(friend => friend.name.toLocaleLowerCase().includes(normalizedPaletteQuery))
    .slice(0, 8);
  const missionCount = missions.filter(mission => mission.completed && !mission.claimed).length;
  const soldListingCount = currentUserId
    ? listings.filter(listing => listing.sellerId === currentUserId && listing.status === 'sold').length
    : 0;
  const badges: Record<string, number> = {
    '/collection': newCount,
    '/friends': pendingFriends,
    '/missions': missionCount,
    '/match': pendingChallengesCount + pendingPoolCount,
    '/market': soldListingCount,
  };
  const openCommandPalette = () => {
    setPaletteQuery('');
    setPaletteOpen(true);
  };
  const closeCommandPalette = () => {
    setPaletteOpen(false);
    setPaletteQuery('');
  };
  useEffect(() => {
    if (!paletteOpen) return;
    paletteInput.current?.focus();
    if (!currentUserId) return;
    void friendsService.getFriends(currentUserId).then(setPaletteFriends).catch(error => {
      console.error('[command palette] failed to load friends:', error);
    });
  }, [paletteOpen, currentUserId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
      } else if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let channel: any;
    let interval: any;
    let uid: string | null = null;
    const checkPending = async () => {
      if (!active || !uid || document.visibilityState === 'hidden') return;
      const [{ data: pendings, error: challengeError }, { data: poolPendings, error: poolError }] = await Promise.all([
        supabase!.from('challenges').select('id').eq('challenged_id', uid).eq('status', 'pending'),
        supabase!.from('pool_matches').select('id').eq('player2_id', uid).eq('status', 'pending'),
      ]);
      if (challengeError) console.error('[navigation] failed to load pending challenges:', challengeError);
      if (poolError) console.error('[navigation] failed to load pending pool matches:', poolError);
      if (!active) return;
      setPendingChallengesCount(pendings?.length ?? 0);
      setPendingPoolCount(poolPendings?.length ?? 0);
      setPendingChallengeId(pendings?.[0]?.id ?? null);
      setPendingPoolMatchId(poolPendings?.[0]?.id ?? null);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') void checkPending();
    };
    (async () => {
      const { data } = await supabase.auth.getSession();
      uid = data.session?.user?.id ?? null;
      if (!active || !uid) return;
      document.addEventListener('visibilitychange', onVisibilityChange);
      await checkPending();
      if (!active) return;
      interval = window.setInterval(() => void checkPending(), 30000);
      channel = supabase
        .channel(`challenges-notify-${uid}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `challenged_id=eq.${uid}` }, (payload: any) => {
          const row = payload.new;
          if (row && row.challenged_id === uid && row.status === 'pending') {
            setPendingChallengeId(row.id);
            toast.info('Você foi desafiado para um X1!');
          }
          if (row && row.challenged_id === uid && (row.status === 'rejected' || row.status === 'completed')) {
            setPendingChallengeId(null);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pool_matches', filter: `player2_id=eq.${uid}` }, (payload: any) => {
          const row = payload.new;
          if (row && row.player2_id === uid && row.status === 'pending') {
            setPendingPoolMatchId(row.id);
            toast.info('Você foi desafiado para uma partida de sinuca!');
          }
          if (row && row.player2_id === uid && (row.status === 'declined' || row.status === 'finished')) {
            setPendingPoolMatchId(null);
          }
        })
        .subscribe();
    })();
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (channel && supabase) void supabase.removeChannel(channel);
      if (interval) window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    const client = supabase;
    if (!client || !currentUserId) return;
    const channel = client
      .channel('global-announcements', { config: { private: true } })
      .on('broadcast', { event: 'global-message' }, ({ payload }) => {
        if (typeof payload?.message !== 'string' || !payload.message.trim()) return;
        toast.info(`Aviso da administração: ${payload.message}`);
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[global announcements] subscription failed:', status);
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <div className={isHomeRoute ? 'home-layout' : 'h-[100dvh] flex flex-col md:flex-row bg-[var(--bg)]'}>
      {!isHomeRoute && <aside className="hidden md:flex w-64 flex-col p-4 bg-white border-r border-[var(--border)]">
        <div className="mb-6 px-2">
          <div className="text-xl font-bold tracking-tight text-[var(--text)]">
            <span className="text-[var(--red)]">FUT</span>SENAI
          </div>
          <div className="text-[10px] text-[var(--muted)] tracking-widest mt-0.5">FUTEBOL ENTRE AMIGOS</div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {NAV_WITH_ADMIN.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={async (e) => {
            const params = new URLSearchParams(window.location.search);
            const challengeId = params.get('challenge');
            if (challengeId && window.location.pathname.includes('match') && n.to !== '/match') {
              e.preventDefault();
              await challengesService.abandonChallenge(challengeId);
              navigate(n.to);
            }
            // Pool match abandon
            const poolMatchId = window.location.pathname.match(/\/pool\/([a-f0-9-]+)/)?.[1];
            if (poolMatchId && n.to !== '/pool') {
              e.preventDefault();
              await poolService.abandonPoolMatch(poolMatchId);
              navigate(n.to);
            }
          }}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors motion-reduce:transition-none ${isActive ? 'bg-[var(--soft)] text-[var(--red)]' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r bg-[var(--red)]" />}
                  <n.icon className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  {(badges[n.to] ?? 0) > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--red)] px-1 text-xs text-white">{badges[n.to]}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <Link to="/about?aba=creditos" className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]">
          <Heart className="h-5 w-5 shrink-0" />
          Créditos
        </Link>
        <div className="mt-3 card-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-[var(--muted)]">Nível {level}</div>
            <div className="text-xs text-[var(--muted)]">{xp} / {nextXp} XP</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full rounded-full bg-[var(--red)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--red)]">●</span>
            <span className="font-bold text-[var(--text)]">{coins.toLocaleString('pt-BR')}</span>
            <span className="text-xs text-[var(--muted)]">moedas</span>
          </div>
        </div>
      </aside>}

      {isHomeRoute && (
        <header className="home-topbar">
          <div className="home-container home-topbar__inner">
            <Link to="/" className="home-topbar__brand" aria-label="FUTSENAI, início">
              <span>FUT</span>SENAI<small>FUTEBOL ENTRE AMIGOS</small>
            </Link>
            <nav className="home-topbar__nav" aria-label="Navegação principal">
              <NavLink to="/" end className="home-topbar__link">Visão geral</NavLink>
              {HOME_NAV_GROUPS.map(group => (
                <details key={group.label} className="home-topbar__group">
                  <summary>{group.label}<ChevronDown aria-hidden="true" /></summary>
                  <div className="home-topbar__dropdown">
                    {NAV_WITH_ADMIN.filter(item => group.paths.some(path => path === item.to)).map(item => (
                      <NavLink key={item.to} to={item.to}>
                        <item.icon aria-hidden="true" />{item.label}
                      </NavLink>
                    ))}
                  </div>
                </details>
              ))}
            </nav>
            <button
              type="button"
              className="home-topbar__mobile-toggle"
              aria-expanded={homeMenuOpen}
              onClick={() => setHomeMenuOpen(open => !open)}
            >
              <Menu aria-hidden="true" /> Menu
            </button>
            <div className="home-topbar__tools">
              <button type="button" onClick={openCommandPalette} aria-label="Pesquisar" className="home-topbar__icon-button">
                <Search aria-hidden="true" />
              </button>
              <div className="home-topbar__changelog"><ChangelogPopover /></div>
              <div className="home-topbar__notifications">
                <button
                  type="button"
                  onClick={() => setNotifOpen(open => !open)}
                  aria-label="Notificações"
                  aria-expanded={notifOpen}
                  className="home-topbar__icon-button"
                >
                  <Bell aria-hidden="true" />
                </button>
                {notifOpen && (
                  <div className="home-topbar__notifications-panel">
                    <div className="home-topbar__notifications-title">Notificações</div>
                    {transactions.slice(0, 6).map(transaction => (
                      <div key={transaction.id} className="home-topbar__notification">
                        {transaction.reason} · {transaction.type === 'earn' ? '+' : '-'}{transaction.amount}
                      </div>
                    ))}
                    {transactions.length === 0 && <div className="home-topbar__empty">Sem notificações.</div>}
                  </div>
                )}
              </div>
              <details className="home-topbar__account">
                <summary aria-label={`Perfil, nível ${level}`}>
                  <span className="home-topbar__avatar">
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : <User aria-hidden="true" />}
                  </span>
                  <span className="home-topbar__level">Nível {level}</span>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div className="home-topbar__account-menu">
                  <Link to="/profile"><User aria-hidden="true" />Perfil</Link>
                  <Link to="/settings"><SettingsIcon aria-hidden="true" />Configurações</Link>
                  <Link to="/changelog"><History aria-hidden="true" />Changelog</Link>
                  {isAdmin && <Link to="/admin"><Shield aria-hidden="true" />Administrador</Link>}
                  <Link to="/about?aba=creditos"><Heart aria-hidden="true" />Créditos</Link>
                </div>
              </details>
            </div>
          </div>
          {homeMenuOpen && (
            <nav className="home-mobile-nav" aria-label="Navegação principal">
              <div className="home-mobile-nav__group">
                <NavLink to="/" end onClick={() => setHomeMenuOpen(false)}>
                  <LayoutDashboard aria-hidden="true" />Visão geral
                </NavLink>
              </div>
              {HOME_NAV_GROUPS.map(group => (
                <div key={group.label} className="home-mobile-nav__group">
                  <strong>{group.label}</strong>
                  {NAV_WITH_ADMIN.filter(item => group.paths.some(path => path === item.to)).map(item => (
                    <NavLink key={item.to} to={item.to} onClick={() => setHomeMenuOpen(false)}>
                      <item.icon aria-hidden="true" />{item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          )}
        </header>
      )}

      {!isHomeRoute && <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[var(--border)]">
        <button onClick={() => setDrawerOpen(true)} className="text-2xl text-[var(--text)]" aria-label="Menu"><Menu className="w-5 h-5" /></button>
        <div className="text-lg font-bold"><span className="text-[var(--red)]">FUT</span>SENAI</div>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" onClick={openCommandPalette} aria-label="Buscar cartas, páginas e amigos" className="text-[var(--muted)]"><Search className="h-5 w-5" /></button>
          <ChangelogPopover />
          <span className="text-[var(--red)]">●</span><span className="font-bold">{coins.toLocaleString('pt-BR')}</span>
        </div>
      </header>}

      <div className={isHomeRoute ? 'home-layout__content' : 'flex-1 flex flex-col min-w-0 min-h-0'}>
        {!isHomeRoute && <div className="hidden md:flex items-center justify-between px-6 py-3 bg-white border-b border-[var(--border)]">
          <div className="text-sm text-[var(--muted)]">
            Futsenai <span className="mx-1">/</span> <span className="text-[var(--text)] font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
            <button type="button" onClick={openCommandPalette} aria-label="Buscar cartas, páginas e amigos" className="flex w-40 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-left text-sm text-[var(--muted)]">
              <Search className="h-4 w-4" /> Buscar… <kbd className="ml-auto text-[10px]">Ctrl K</kbd>
            </button>
            <ChangelogPopover />
            <div className="relative flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[var(--soft)] overflow-hidden flex items-center justify-center text-[var(--red)] font-bold text-sm">
                {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <User className="w-4 h-4" />}
              </div>
              <button onClick={() => setNotifOpen(o => !o)} className="w-8 h-8 rounded-full bg-[var(--soft)] flex items-center justify-center text-[var(--red)] font-bold" aria-label="Notificações"><Bell className="w-4 h-4" /></button>
              {notifOpen && (
                <div className="absolute right-0 top-10 w-72 card-surface p-3 z-50 max-h-60 overflow-auto">
                  <div className="text-xs font-semibold text-[var(--muted)] mb-2">Notificações</div>
                  {transactions.slice(0, 6).map(t => (
                    <div key={t.id} className="text-xs text-[var(--text)] py-1 border-b border-[var(--border)] last:border-0">
                      {t.reason} · {t.type === 'earn' ? '+' : '-'}{t.amount}
                    </div>
                  ))}
                  {transactions.length === 0 && <div className="text-xs text-[var(--muted)]">Sem notificações.</div>}
                </div>
              )}
            </div>
            <span>Nível {level}</span>
          </div>
        </div>}

        <main className={`${isHomeRoute ? 'home-layout__main' : 'flex-1 min-w-0 min-h-0 overflow-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0'} ${isMatchRoute ? 'match-route-main' : ''}`}>
          {pendingChallengeId && (
            <div className={isHomeRoute ? 'home-container home-pending-alert' : 'm-4 card-surface p-3 flex items-center justify-between gap-3'}>
              <div className="text-sm text-[var(--text)]">Você foi desafiado para um X1!</div>
              <div className="flex gap-2">
                <button onClick={() => { navigate(`/match?challenge=${pendingChallengeId}`); setPendingChallengeId(null); }} className="px-3 py-1.5 rounded-xl bg-[var(--red)] text-white text-xs font-medium">Aceitar</button>
                <button onClick={() => setPendingChallengeId(null)} className="px-3 py-1.5 rounded-xl bg-white border border-[var(--border)] text-xs font-medium">Depois</button>
              </div>
            </div>
          )}
          {pendingPoolMatchId && (
            <div className={isHomeRoute ? 'home-container home-pending-alert' : 'm-4 card-surface p-3 flex items-center justify-between gap-3'}>
              <div className="text-sm text-[var(--text)]">Você foi desafiado para uma partida de sinuca!</div>
              <div className="flex gap-2">
                <button onClick={() => { navigate(`/pool/${pendingPoolMatchId}`); setPendingPoolMatchId(null); }} className="px-3 py-1.5 rounded-xl bg-[var(--red)] text-white text-xs font-medium">Ver aposta</button>
                <button onClick={() => setPendingPoolMatchId(null)} className="px-3 py-1.5 rounded-xl bg-white border border-[var(--border)] text-xs font-medium">Depois</button>
              </div>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className={isMatchRoute ? 'match-route-content' : ''}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {children ?? <Outlet />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {!isHomeRoute && drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setDrawerOpen(false)}>
          <div className="w-64 h-full overflow-y-auto bg-white p-4" onClick={e => e.stopPropagation()}>
            <div className="text-xl font-bold mb-4"><span className="text-[var(--red)]">FUT</span>SENAI</div>
            {NAV_WITH_ADMIN.map(n => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={async () => { setDrawerOpen(false); const params = new URLSearchParams(window.location.search); const challengeId = params.get('challenge'); if (challengeId && window.location.pathname.includes('match') && n.to !== '/match') { await challengesService.abandonChallenge(challengeId); } const poolMatchId = window.location.pathname.match(/\/pool\/([a-f0-9-]+)/)?.[1]; if (poolMatchId && n.to !== '/pool') { await poolService.abandonPoolMatch(poolMatchId); } }}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none ${isActive ? 'bg-[var(--soft)] text-[var(--red)]' : 'text-[var(--muted)]'}`}>
                 <n.icon className="h-5 w-5 shrink-0" />
                 <span className="min-w-0 flex-1 truncate">{n.label}</span>
                 {(badges[n.to] ?? 0) > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--red)] px-1 text-xs text-white">{badges[n.to]}</span>}
               </NavLink>
            ))}
            <Link to="/about?aba=creditos" onClick={() => setDrawerOpen(false)} className="mt-2 flex items-center gap-3 rounded-xl border-t border-[var(--border)] px-3 py-3 text-sm font-medium text-[var(--muted)]">
              <Heart className="h-5 w-5 shrink-0" />
              Créditos
            </Link>
          </div>
        </div>
      )}

      {!isHomeRoute && <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-stretch border-t border-[var(--border)] bg-white z-40 pb-[env(safe-area-inset-bottom)]">
        {[...NAV_WITH_ADMIN.slice(0, 5), NAV_WITH_ADMIN.find(n => n.to === '/leaderboard')!].map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={async (e) => {
            const params = new URLSearchParams(window.location.search);
            const challengeId = params.get('challenge');
            if (challengeId && window.location.pathname.includes('match') && n.to !== '/match') {
              e.preventDefault();
              await challengesService.abandonChallenge(challengeId);
              navigate(n.to);
            }
            // Pool match abandon
            const poolMatchId = window.location.pathname.match(/\/pool\/([a-f0-9-]+)/)?.[1];
            if (poolMatchId && n.to !== '/pool') {
              e.preventDefault();
              await poolService.abandonPoolMatch(poolMatchId);
              navigate(n.to);
            }
          }}
            className={({ isActive }) =>
              `relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] ${isActive ? 'text-[var(--red)]' : 'text-[var(--muted)]'}`}>
             <n.icon className="h-5 w-5" />
             <span className="block max-w-full truncate">{n.label}</span>
             {(badges[n.to] ?? 0) > 0 && <span className="absolute right-1 top-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--red)] px-1 text-[9px] text-white">{badges[n.to]}</span>}
           </NavLink>
        ))}
      </nav>}
      {paletteOpen && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 p-4 pt-[10vh] md:pt-[15vh]" onMouseDown={closeCommandPalette}>
          <section role="dialog" aria-modal="true" aria-label="Buscar no FutSENAI Cards" className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
              <Search className="h-5 w-5 shrink-0 text-[var(--muted)]" />
              <input ref={paletteInput} value={paletteQuery} onChange={event => setPaletteQuery(event.target.value)} placeholder="Buscar cartas, páginas ou amigos…" aria-label="Buscar cartas, páginas ou amigos" className="h-14 min-w-0 flex-1 bg-transparent text-base text-[var(--text)] outline-none" />
              <button type="button" onClick={closeCommandPalette} aria-label="Fechar busca" className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--bg)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[65dvh] overflow-y-auto p-2">
              {filteredPages.length > 0 && <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Páginas</div>}
              {filteredPages.map(page => (
                <button key={page.to} type="button" onClick={() => { navigate(page.to); closeCommandPalette(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]">
                  <page.icon className="h-4 w-4 text-[var(--muted)]" />{page.label}
                </button>
              ))}
              {filteredCards.length > 0 && <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Cartas</div>}
              {filteredCards.map(card => (
                <button key={card.uid} type="button" onClick={() => { navigate(`/card/${card.uid}`); closeCommandPalette(); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]">
                  <span className="truncate">{card.name}</span><span className="shrink-0 text-xs text-[var(--muted)]">{card.overall} OVR</span>
                </button>
              ))}
              {filteredFriends.length > 0 && <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Amigos</div>}
              {filteredFriends.map(friend => (
                <button key={friend.id} type="button" onClick={() => { navigate(`/profile/${friend.id}`); closeCommandPalette(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--bg)]">
                  <User className="h-4 w-4 text-[var(--muted)]" />{friend.name}
                </button>
              ))}
              {normalizedPaletteQuery.length >= 2 && !filteredPages.length && !filteredCards.length && !filteredFriends.length && <div className="p-6 text-center text-sm text-[var(--muted)]">Nenhum resultado encontrado.</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
