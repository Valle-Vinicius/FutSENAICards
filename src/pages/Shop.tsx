import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame';
import { supabase } from '../lib/supabase';

interface DemoCoinLock {
  owner: string;
  expiresAt: number;
}

const INITIAL_NOW = Date.now();

function readDemoCoinLock(key: string): DemoCoinLock | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const lock = JSON.parse(raw) as DemoCoinLock;
    return lock.expiresAt > Date.now() ? lock : null;
  } catch {
    return null;
  }
}

export default function Shop() {
  const events = useGame(s => s.events);
  const coins = useGame(s => s.coins);
  const claimDemoCoins = useGame(s => s.claimDemoCoins);
  const [now, setNow] = useState(INITIAL_NOW);
  const [buying, setBuying] = useState(false);
  const [bought, setBought] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState(0);
  const lockKey = `futsenai-demo-coins-lock:${userId ?? 'guest'}`;
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('[demo-coins] failed to read session:', error);
      if (active) setUserId(data.session?.user?.id ?? null);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const syncLock = () => setLockUntil(readDemoCoinLock(lockKey)?.expiresAt ?? 0);
    syncLock();
    const interval = setInterval(syncLock, 500);
    window.addEventListener('storage', syncLock);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', syncLock);
    };
  }, [lockKey]);

  const handleBuyCoins = async () => {
    if (buying || lockUntil > Date.now()) return;
    const owner = crypto.randomUUID();
    const expiresAt = Date.now() + 15000;
    const lock = { owner, expiresAt };
    localStorage.setItem(lockKey, JSON.stringify(lock));
    setLockUntil(expiresAt);
    setBuying(true);
    try {
      if (await claimDemoCoins()) {
        setBought(true);
        setTimeout(() => setBought(false), 3000);
      }
    } finally {
      if (readDemoCoinLock(lockKey)?.owner === owner) localStorage.removeItem(lockKey);
      setLockUntil(readDemoCoinLock(lockKey)?.expiresAt ?? 0);
      setBuying(false);
    }
  };

  const fmt = (ms: number) => {
    if (ms <= 0) return 'Encerrado';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text)]">Loja e eventos</h1>
      <div className="card-surface p-4 text-sm text-[var(--text)]">
        Saldo atual: <span className="font-bold text-[var(--red)]">{coins.toLocaleString('pt-BR')} moedas</span>
      </div>

      <div className="card-surface p-4 space-y-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">Pacote de moedas (demo)</h2>
        <p className="text-sm text-[var(--muted)]">Receba 10.000 moedas virtuais para testar a loja. Sem pagamento real.</p>
        <button
          onClick={handleBuyCoins}
          disabled={buying || lockUntil > now || (supabase !== null && userId === null)}
          className="px-4 py-2 rounded-xl bg-[var(--red)] text-white text-sm font-medium disabled:opacity-60"
        >
          {buying || lockUntil > now ? 'Processando...' : bought ? 'Concluído! +10.000' : 'Comprar 10.000 moedas (demo)'}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 text-[var(--text)]">Eventos temporários</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {events.map(e => (
            <div key={e.id} className="card-surface p-4">
              <div className="font-medium text-[var(--text)]">{e.name}</div>
              <div className="text-xs text-[var(--muted)] mt-1">Recompensa: {e.reward}</div>
              <div className="mt-2 text-sm text-[var(--text)]">
                Termina em: <span className="font-mono text-[var(--red)]">{fmt(e.endsAt - now)}</span>
              </div>
            </div>
          ))}
          {events.length === 0 && <div className="text-[var(--muted)]">Nenhum evento ativo.</div>}
        </div>
      </div>

      <div className="card-surface p-4 text-xs text-[var(--muted)]">
        Esta versão utiliza moedas virtuais de demonstração. Não há compras com dinheiro real.
      </div>
    </div>
  );
}
