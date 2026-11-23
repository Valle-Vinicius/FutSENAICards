import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CalendarDays, Coins, Gift, Trophy } from 'lucide-react';
import { useGame } from '../store/useGame';
import { supabase } from '../lib/supabase';
import iconCardArt from '../imagens/cartas/icone.png';
import legendsPackArt from '../imagens/pacotes/lendas.png';

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

function getEventArtwork(reward: string) {
  const normalized = reward.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  if (normalized.includes('icone')) return iconCardArt;
  if (normalized.includes('pacote') && normalized.includes('lendario')) return legendsPackArt;
  return undefined;
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
  const activeEvents = events.filter(event => event.endsAt > now);
  const endedEvents = events.filter(event => event.endsAt <= now);
  const renderEventCard = (event: typeof events[number], index: number, ended: boolean) => {
    const artwork = getEventArtwork(event.reward);
    const gridSpan = ended
      ? ''
      : activeEvents.length === 1
        ? 'lg:col-span-12'
        : index === 0
          ? 'lg:col-span-7'
          : index === 1
            ? 'lg:col-span-5'
            : 'lg:col-span-6';
    return (
      <article
        key={event.id}
        className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 motion-reduce:transition-none ${ended
          ? 'border-[var(--border)] opacity-80 grayscale'
          : 'border-[var(--border)] hover:-translate-y-1 hover:border-[var(--red)]/30 hover:shadow-[0_16px_34px_rgba(27,30,39,0.12)]'} ${gridSpan}`}
      >
        <div className={`relative isolate flex min-h-48 items-center overflow-hidden px-5 py-5 sm:min-h-56 sm:px-7 ${ended ? 'bg-[#353941]' : 'bg-[#17191f]'}`}>
          <div aria-hidden="true" className={`pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full border-[28px] ${ended ? 'border-white/[0.05]' : 'border-[#ed1b35]/20'}`} />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0, transparent 18px, rgba(255,255,255,.28) 19px, transparent 20px)' }} />
          <div className="relative z-10 max-w-[62%]">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/75">
              <span className={`h-1.5 w-1.5 rounded-full ${ended ? 'bg-white/35' : 'bg-[#ff5367]'}`} />
              {ended ? 'Encerrado' : 'Evento ativo'}
            </div>
            <h3 className="text-xl font-black uppercase leading-tight tracking-tight text-white sm:text-2xl">{event.name}</h3>
            <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">Recompensa</p>
            <p className="mt-0.5 max-w-sm text-sm font-bold leading-snug text-white/90 sm:text-base">{event.reward}</p>
          </div>
          <div className="absolute inset-y-0 right-0 flex w-[43%] items-center justify-center sm:w-[38%]">
            {artwork ? (
              <img src={artwork} alt={event.reward} className="relative z-10 h-[82%] max-h-52 w-auto max-w-[88%] object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" />
            ) : (
              <div aria-hidden="true" className="relative flex aspect-square w-28 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] sm:w-36">
                <span className="absolute inset-2 rounded-full border border-dashed border-white/20" />
                <Trophy className="h-9 w-9 text-[#ff6475] sm:h-12 sm:w-12" strokeWidth={1.5} />
                <span className="absolute -bottom-2 rounded-full bg-[#ed1b35] px-3 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-white">FUTSENAI</span>
              </div>
            )}
          </div>
          <span aria-hidden="true" className="absolute bottom-1 right-5 select-none text-5xl font-black uppercase text-white/[0.04] sm:text-7xl">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-start gap-2.5">
            {ended ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" /> : <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[var(--red)]" />}
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{ended ? 'Período do evento' : 'Termina em'}</p>
              <p className={`mt-0.5 text-xs font-bold tabular-nums ${ended ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>
                {ended ? new Date(event.endsAt).toLocaleDateString('pt-BR') : fmt(event.endsAt - now)}
              </p>
            </div>
          </div>
          <span className={`inline-flex w-fit items-center rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-wide ${ended ? 'bg-[var(--bg)] text-[var(--muted)]' : 'bg-[var(--soft)] text-[var(--red)]'}`}>
            {ended ? 'Evento encerrado' : 'Em andamento'}
          </span>
        </div>
      </article>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-7 p-4 md:p-6 lg:p-8">
      <header className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#17191f] px-5 py-7 text-white shadow-[0_16px_40px_rgba(27,30,39,0.12)] sm:px-8 sm:py-9 lg:px-11">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-28 h-80 w-80 rounded-full border-[34px] border-[#ed1b35]/20" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[-7rem] right-[22%] h-64 w-64 rotate-45 border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute right-8 top-2 hidden select-none text-[10rem] font-black leading-none text-white/[0.035] md:block">STORE</div>
        <div className="relative z-10 flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-[#ff8290]">FUTSENAI · LOJA OFICIAL</p>
            <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-5xl lg:text-6xl">Loja</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/65 sm:text-base">Pacotes, moedas e eventos do FUTSENAI.</p>
            <Link to="/packs" className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--red)] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-[#bd1026] hover:shadow-md">
              Explorar pacotes <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative flex w-full max-w-sm items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-4 sm:p-5 md:w-auto">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#f5c542]/40 bg-[#f5c542]/10 text-[#f5c542]">
              <Coins className="h-7 w-7" strokeWidth={1.6} />
              <span aria-hidden="true" className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#17191f] bg-[#f5c542]" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/50">Seu saldo</p>
              <p className="mt-1 break-all text-2xl font-black leading-none tabular-nums text-white sm:text-3xl">{coins.toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#f5c542]">moedas FUTSENAI</p>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-3" aria-labelledby="coin-product-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Reforce seu saldo</p>
            <h2 id="coin-product-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Moedas</h2>
          </div>
          <span className="hidden text-[10px] font-semibold text-[var(--muted)] sm:block">Créditos virtuais de demonstração</span>
        </div>
        <article className="relative isolate grid overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm md:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="relative flex min-h-56 items-center gap-5 overflow-hidden bg-[linear-gradient(120deg,#fff7e2,#fff_75%)] p-5 sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-60 w-60 rounded-full border-[24px] border-[#e8b73c]/10" />
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center sm:h-32 sm:w-32">
              <span aria-hidden="true" className="absolute left-1 top-8 h-14 w-14 rounded-full border-[5px] border-[#c59119] bg-[#e8b73c] shadow-md sm:left-2 sm:top-10 sm:h-[4.5rem] sm:w-[4.5rem]" />
              <span aria-hidden="true" className="absolute right-0 top-3 h-16 w-16 rounded-full border-[5px] border-[#f3cd68] bg-[#ffd976] shadow-lg sm:h-20 sm:w-20" />
              <Coins className="relative z-10 h-9 w-9 text-[#9a6b0d] sm:h-11 sm:w-11" strokeWidth={1.7} />
            </div>
            <div className="relative z-10 min-w-0">
              <span className="inline-flex rounded-full border border-[#d6a52d]/30 bg-white/80 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-[#9a6b0d]">Pacote de moedas · Demo</span>
              <p className="mt-3 text-3xl font-black leading-none tabular-nums text-[#2b2619] sm:text-4xl">10.000</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#9a6b0d]">moedas virtuais</p>
            </div>
          </div>
          <div className="flex flex-col justify-center border-t border-[var(--border)] p-5 sm:p-7 md:border-l md:border-t-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--red)]">Oferta de demonstração</p>
            <h3 className="mt-1 text-lg font-black text-[var(--text)]">Pacote de moedas</h3>
            <p className="mt-2 max-w-md text-xs leading-5 text-[var(--muted)]">Receba 10.000 moedas virtuais para testar a loja. Sem pagamento real.</p>
            <button
              onClick={handleBuyCoins}
              disabled={buying || lockUntil > now || (supabase !== null && userId === null)}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--red)] px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-[#bd1026] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              aria-live="polite"
            >
              {buying || lockUntil > now ? 'Processando...' : bought ? 'Concluído! +10.000' : 'Comprar 10.000 moedas (demo)'}
              {!buying && lockUntil <= now && !bought && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </article>
      </section>

      <section className="space-y-4" aria-labelledby="shop-events-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Tempo limitado</p>
            <h2 id="shop-events-title" className="mt-1 text-xl font-black uppercase tracking-tight text-[var(--text)] sm:text-2xl">Eventos</h2>
          </div>
          {activeEvents.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--soft)] px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-[var(--red)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--red)]" /> {activeEvents.length} {activeEvents.length === 1 ? 'evento ativo' : 'eventos ativos'}
            </span>
          )}
        </div>
        {activeEvents.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-12">
            {activeEvents.map((event, index) => renderEventCard(event, index, false))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-5 py-8 text-center text-sm text-[var(--muted)]">
            {endedEvents.length > 0 ? 'Todos os eventos temporários estão encerrados.' : 'Nenhum evento temporário disponível.'}
          </div>
        )}
      </section>

      {endedEvents.length > 0 && (
        <section className="space-y-4" aria-labelledby="ended-events-title">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Arquivo</p>
            <h2 id="ended-events-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[var(--text)]">Eventos encerrados</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {endedEvents.map((event, index) => renderEventCard(event, index, true))}
          </div>
        </section>
      )}

      <footer className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[var(--red)]" />
        Esta versão utiliza moedas virtuais de demonstração. Não há compras com dinheiro real.
      </footer>
    </div>
  );
}
