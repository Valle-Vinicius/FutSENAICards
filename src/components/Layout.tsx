import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useGame } from '../store/useGame';

const NAV = [
  { to: '/', label: 'Visão geral', icon: '📊' },
  { to: '/packs', label: 'Abrir pacotes', icon: '📦' },
  { to: '/collection', label: 'Minhas cartas', icon: '🃏' },
  { to: '/squad', label: 'Montar elenco', icon: '⚽' },
  { to: '/compare', label: 'Comparar jogadores', icon: '⚖️' },
  { to: '/match', label: 'Partida', icon: '🏟️' },
  { to: '/market', label: 'Mercado', icon: '💱' },
  { to: '/sbc', label: 'Desafios', icon: '🏆' },
  { to: '/missions', label: 'Missões', icon: '🎯' },
  { to: '/shop', label: 'Loja', icon: '🛒' },
  { to: '/profile', label: 'Perfil', icon: '👤' },
  { to: '/settings', label: 'Configurações', icon: '⚙️' },
];

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
};

export default function Layout() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const newCount = useGame(s => s.newCardUids.length);
  const transactions = useGame(s => s.transactions);
  const location = useLocation();
  const navigate = useNavigate();
  const title = TITLES[location.pathname] || 'Futsenai';
  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const pct = Math.min(100, ((xp - lvlXp) / (nextXp - lvlXp)) * 100);
  const [notifOpen, setNotifOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cards = useGame(s => s.cards);
  const searchResults = search.trim().length < 2 ? [] : cards.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawerOpen(false); setNotifOpen(false); setSearchOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="h-screen flex flex-col md:flex-row bg-[#F7F7F9] overflow-hidden">
      <aside className="hidden md:flex w-64 flex-col p-4 bg-white border-r border-[#E9EAF0]">
        <div className="mb-6 px-2">
          <div className="text-xl font-bold tracking-tight text-[#252733]">
            <span className="text-[#E30613]">FUT</span>SENAI
          </div>
          <div className="text-[10px] text-[#858A98] tracking-widest mt-0.5">FUTEBOL ENTRE AMIGOS</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'bg-[#FFF0F2] text-[#E30613]' : 'text-[#858A98] hover:bg-[#F7F7F9] hover:text-[#252733]'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#E30613] rounded-r" />}
                  <span className="text-base">{n.icon}</span>
                  <span>{n.label}</span>
                  {n.to === '/collection' && newCount > 0 && <span className="ml-auto text-xs bg-[#E30613] text-white rounded-full px-2">{newCount}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto card-surface p-3">
          <div className="text-xs text-[#858A98]">Nível {level}</div>
          <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden mt-1">
            <div className="h-full bg-[#E30613]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-[#858A98] mt-1">{xp} / {nextXp} XP</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[#E30613]">●</span>
            <span className="font-bold text-[#252733]">{coins.toLocaleString('pt-BR')}</span>
            <span className="text-xs text-[#858A98]">moedas</span>
          </div>
        </div>
      </aside>

      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#E9EAF0]">
        <button onClick={() => setDrawerOpen(true)} className="text-2xl text-[#252733]" aria-label="Menu">☰</button>
        <div className="text-lg font-bold"><span className="text-[#E30613]">FUT</span>SENAI</div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#E30613]">●</span><span className="font-bold">{coins.toLocaleString('pt-BR')}</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="hidden md:flex items-center justify-between px-6 py-3 bg-white border-b border-[#E9EAF0]">
          <div className="text-sm text-[#858A98]">
            Futsenai <span className="mx-1">/</span> <span className="text-[#252733] font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#858A98]">
            <div className="relative">
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                placeholder="Buscar..."
                className="w-40 bg-[#F7F7F9] border border-[#E9EAF0] rounded-xl px-3 py-1.5 text-sm text-[#252733]"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute right-0 top-9 w-64 card-surface p-2 z-50 max-h-60 overflow-auto">
                  {searchResults.map(c => (
                    <button key={c.uid} onClick={() => { navigate(`/card/${c.uid}`); setSearch(''); setSearchOpen(false); }} className="w-full text-left px-2 py-1 text-sm text-[#252733] hover:bg-[#F7F7F9] rounded-lg">
                      {c.name} <span className="text-[#858A98] text-xs">({c.overall})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setNotifOpen(o => !o)} className="w-8 h-8 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold" aria-label="Notificações">🔔</button>
              {notifOpen && (
                <div className="absolute right-0 top-10 w-72 card-surface p-3 z-50 max-h-60 overflow-auto">
                  <div className="text-xs font-semibold text-[#858A98] mb-2">Notificações</div>
                  {transactions.slice(0, 6).map(t => (
                    <div key={t.id} className="text-xs text-[#252733] py-1 border-b border-[#E9EAF0] last:border-0">
                      {t.reason} · {t.type === 'earn' ? '+' : '-'}{t.amount}
                    </div>
                  ))}
                  {transactions.length === 0 && <div className="text-xs text-[#858A98]">Sem notificações.</div>}
                </div>
              )}
            </div>
            <span>Nível {level}</span>
            <span className="w-8 h-8 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold">{level}</span>
          </div>
        </div>

        <main className="flex-1 min-w-0 overflow-auto pb-20 md:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setDrawerOpen(false)}>
          <div className="w-64 h-full bg-white p-4" onClick={e => e.stopPropagation()}>
            <div className="text-xl font-bold mb-4"><span className="text-[#E30613]">FUT</span>SENAI</div>
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-1 ${isActive ? 'bg-[#FFF0F2] text-[#E30613]' : 'text-[#858A98]'}`}>
                <span>{n.icon}</span>{n.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around border-t border-[#E9EAF0] bg-white z-40">
        {NAV.slice(0, 5).map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 px-1 text-[10px] ${isActive ? 'text-[#E30613]' : 'text-[#858A98]'}`}>
            <span className="text-lg">{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
