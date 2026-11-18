import { useState, useEffect } from 'react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import { ArrowDown, ArrowDownLeft, ArrowUp, ArrowUpRight, BadgeCheck, Clock3, Coins, RotateCcw, Search, SlidersHorizontal, Store, Tag, User, X } from 'lucide-react';
import { getPlayerImage } from '../data/players';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import {
  getListings,
  getMarketplaceTransactions,
  getMarketplaceTransactionSummary,
  toGameListing,
  type ListingRecord,
  type MarketplaceTransactionRecord,
  type MarketplaceTransactionSummary,
} from '../lib/services/marketplace';
import { RARITY_META, type Listing, type Rarity } from '../types';

const EMPTY_TRANSACTION_SUMMARY: MarketplaceTransactionSummary = {
  purchaseCount: 0,
  saleCount: 0,
  spent: 0,
  received: 0,
  volume: 0,
  net: 0,
};

function applyRemoteListings(remoteListings: ListingRecord[]) {
  useGame.setState(state => ({
    listings: [
      ...remoteListings.map(toGameListing),
      ...state.listings.filter(listing => listing.status !== 'active'),
      ...state.listings
        .filter(listing => listing.status === 'active' && listing.expiresAt <= Date.now())
        .map(listing => ({ ...listing, status: 'expired' as const })),
    ],
  }));
}

function listingStatusLabel(listing: Listing, now: number) {
  if (listing.status === 'active') return listing.expiresAt <= now ? 'Expirado' : 'Ativo';
  if (listing.status === 'sold') return 'Vendido';
  if (listing.status === 'cancelled') return 'Cancelado';
  return 'Expirado';
}

function transactionPeriodLabel(completedAt: string) {
  const date = new Date(completedAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date >= today) return 'Hoje';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= yesterday) return 'Ontem';

  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  if (date >= startOfWeek) return 'Esta semana';
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getRarityLabel(value: string | null) {
  if (!value) return 'Raridade não informada';
  return RARITY_META[value as Rarity]?.label ?? value;
}

export default function Marketplace() {
  const listings = useGame(s => s.listings);
  const cards = useGame(s => s.cards);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketNow, setMarketNow] = useState(() => Date.now());
  const [tab, setTab] = useState<'market' | 'mine' | 'history'>('market');
  const [historyKind, setHistoryKind] = useState<'all' | 'buy' | 'sell'>('all');
  const [historyPeriod, setHistoryPeriod] = useState<'all' | '7d' | '30d'>('all');
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [historyRows, setHistoryRows] = useState<MarketplaceTransactionRecord[]>([]);
  const [historySummary, setHistorySummary] = useState(EMPTY_TRANSACTION_SUMMARY);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<MarketplaceTransactionRecord | null>(null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [rar, setRar] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('price_asc');
  const [listUid, setListUid] = useState<string | null>(null);
  const [listPrice, setListPrice] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [confirmBuy, setConfirmBuy] = useState<string | null>(null);
  const [buyingAnim, setBuyingAnim] = useState<string | null>(null);
  const [cancellingListingId, setCancellingListingId] = useState<string | null>(null);
  const [creatingListing, setCreatingListing] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setMarketNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase!.channel('marketplace-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        getListings().then(listings => {
          if (listings !== null) applyRemoteListings(listings);
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'marketplace_transactions' }, () => {
        setHistoryRefreshKey(key => key + 1);
      })
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, []);

  useEffect(() => {
    getListings().then(listings => {
      if (listings !== null) applyRemoteListings(listings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistorySearch(historySearchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [historySearchInput]);

  useEffect(() => {
    if (tab !== 'history') return;
    if (!supabase || !userId) return;
    let active = true;
    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(false);
      const since = historyPeriod === 'all'
        ? undefined
        : new Date(Date.now() - (historyPeriod === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString();
      try {
        const [page, summary] = await Promise.all([
          getMarketplaceTransactions(userId, {
            kind: historyKind,
            search: historySearch,
            since,
            offset: 0,
            limit: 25,
          }),
          getMarketplaceTransactionSummary(),
        ]);
        if (!active) return;
        setHistoryRows(page.rows);
        setHistoryTotal(page.total);
        setHistorySummary(summary);
      } catch (error) {
        console.error('[marketplace] transaction history load failed:', error);
        if (active) setHistoryError(true);
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => { active = false; };
  }, [tab, userId, historyKind, historyPeriod, historySearch, historyRefreshKey]);
  const buyListing = useGame(s => s.buyListing);
  const listCard = useGame(s => s.listCard);
  const cancelListing = useGame(s => s.cancelListing);
  const recordTransfer = useGame(s => s.recordTransfer);
  const recordPrice = useGame(s => s.recordPrice);

  const cardOf = (uid: string) => cards.find(c => c.uid === uid);
  const listingPrice = (listing: typeof listings[number]) => listing.buyNow > 0 ? listing.buyNow : listing.price;

  const activeListings = listings.filter(l => l.status === 'active' && l.expiresAt > marketNow).filter(l => {
    const c = cardOf(l.cardUid);
    if (q && c && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (pos && c && c.position !== pos) return false;
    if (rar && c && c.rarity !== rar) return false;
    if (minPrice && listingPrice(l) < Number(minPrice)) return false;
    if (maxPrice && listingPrice(l) > Number(maxPrice)) return false;
    return true;
  }).sort((a, b) => {
    const ca = cardOf(a.cardUid), cb = cardOf(b.cardUid);
    if (sort === 'price_asc') return listingPrice(a) - listingPrice(b);
    if (sort === 'price_desc') return listingPrice(b) - listingPrice(a);
    if (sort === 'overall') return (cb?.overall ?? 0) - (ca?.overall ?? 0);
    if (sort === 'name') return (ca?.name ?? '').localeCompare(cb?.name ?? '');
    return 0;
  });

  const prices = activeListings.map(listingPrice);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const avgP = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

  const clearFilters = () => { setQ(''); setPos(''); setRar(''); setMinPrice(''); setMaxPrice(''); setSort('price_asc'); };

  const handleBuy = (id: string) => {
    setConfirmBuy(id);
  };

  const confirmBuyNow = () => {
    if (!confirmBuy) return;
    const listing = listings.find(l => l.id === confirmBuy);
    const c = listing ? cardOf(listing.cardUid) : null;
    setBuyingAnim(confirmBuy);
    setTimeout(async () => {
      const ok = await buyListing(confirmBuy);
      if (ok) {
        if (c) { recordTransfer(c.name, listingPrice(listing!), 'buy'); recordPrice(c.name, listingPrice(listing!)); }
        toast.success('Compra realizada!');
      } else {
        const failedListing = useGame.getState().listings.find(l => l.id === confirmBuy);
        toast.error(failedListing?.status === 'expired' || (failedListing && failedListing.expiresAt <= Date.now())
          ? 'Esse anúncio expirou e não está mais disponível.'
          : 'Saldo insuficiente ou indisponível.');
      }
      setBuyingAnim(null);
      setConfirmBuy(null);
    }, 900);
  };

  const handleList = async () => {
    if (creatingListing) return;
    if (!listUid || !listPrice) { toast.error('Selecione carta e preço.'); return; }
    setCreatingListing(true);
    try {
      const id = await listCard(listUid, Number(listPrice), 24);
      if (id) { toast.success('Carta anunciada!'); setListUid(null); setListPrice(''); }
      else if (!supabase) toast.error('Carta indisponível para anúncio.');
    } finally {
      setCreatingListing(false);
    }
  };

  const availableToSell = cards.filter(c => !listings.some(l => l.cardUid === c.uid && l.status === 'active' && l.expiresAt > marketNow));
  const matchingSellCards = availableToSell
    .filter(c => c.name.toLowerCase().includes(listSearch.toLowerCase()))
    .sort((a, b) => b.overall - a.overall);
  const selectedSellCard = availableToSell.find(c => c.uid === listUid);
  const myListings = listings.filter(l => l.sellerId === userId);
  const myActiveListings = myListings
    .filter(l => l.status === 'active' && l.expiresAt > marketNow)
    .sort((a, b) => b.createdAt - a.createdAt);
  const myListingHistory = myListings
    .filter(l => l.status !== 'active' || l.expiresAt <= marketNow)
    .sort((a, b) => b.createdAt - a.createdAt);
  const historySince = historyPeriod === 'all'
    ? undefined
    : new Date(marketNow - (historyPeriod === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString();
  const historyGroups = historyRows.reduce<{ label: string; rows: MarketplaceTransactionRecord[] }[]>((groups, transaction) => {
    const label = transactionPeriodLabel(transaction.completedAt);
    const latestGroup = groups[groups.length - 1];
    if (latestGroup?.label === label) latestGroup.rows.push(transaction);
    else groups.push({ label, rows: [transaction] });
    return groups;
  }, []);

  const marketControl = 'h-11 w-full min-w-0 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] transition-colors focus:border-[var(--red)] focus:outline-none focus:ring-4 focus:ring-[var(--red)]/10';

  const clearHistoryFilters = () => {
    setHistoryKind('all');
    setHistoryPeriod('all');
    setHistorySearchInput('');
    setHistorySearch('');
  };

  const loadMoreHistory = async () => {
    if (!userId || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    try {
      const page = await getMarketplaceTransactions(userId, {
        kind: historyKind,
        search: historySearch,
        since: historySince,
        offset: historyRows.length,
        limit: 25,
      });
      setHistoryRows(rows => {
        const uniqueRows = new Map(rows.map(row => [row.id, row]));
        page.rows.forEach(row => uniqueRows.set(row.id, row));
        return [...uniqueRows.values()];
      });
      setHistoryTotal(page.total);
    } catch (error) {
      console.error('[marketplace] transaction history pagination failed:', error);
      setHistoryError(true);
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--red)]">
            <Store className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text)] md:text-3xl">Transferências</h1>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-white p-1">
        {(['market', 'mine', 'history'] as const).map(t => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${tab === t ? 'bg-[var(--red)] text-white' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}>
            {t === 'market' ? 'Mercado' : t === 'mine' ? 'Minhas vendas' : 'Histórico'}
          </button>
        ))}
        </div>
      </header>

      {tab === 'market' && (
        <>
          <section className="card-surface p-4 md:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
              <SlidersHorizontal className="h-4 w-4 text-[var(--red)]" />
              Filtrar anúncios
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
              <label className="relative min-w-0 sm:col-span-2 xl:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jogador..." aria-label="Buscar jogador" className={`${marketControl} pl-10`} />
              </label>
              <select aria-label="Filtrar por posição" value={pos} onChange={e => setPos(e.target.value)} className={marketControl}>
              <option value="">Posição</option>
              {[...new Set(cards.map(c => c.position))].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select aria-label="Filtrar por raridade" value={rar} onChange={e => setRar(e.target.value)} className={marketControl}>
              <option value="">Raridade</option>
              {['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon', 'secret'].map(r => <option key={r} value={r}>{r === 'secret' ? 'Secreta' : r}</option>)}
              </select>
              <input aria-label="Preço mínimo" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Preço min" className={marketControl} />
              <input aria-label="Preço máximo" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Preço max" className={marketControl} />
              <select aria-label="Ordenar anúncios" value={sort} onChange={e => setSort(e.target.value)} className={marketControl}>
              <option value="price_asc">Preço ↑</option>
              <option value="price_desc">Preço ↓</option>
              <option value="overall">Overall</option>
              <option value="name">Nome</option>
              </select>
              <button onClick={clearFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--soft)] hover:text-[var(--red)] motion-reduce:transition-none">
                <RotateCcw className="h-4 w-4" /> Limpar
              </button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="card-surface flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--soft)] text-[var(--red)]"><ArrowDown className="h-4 w-4" /></span>
              <div><div className="text-xs text-[var(--muted)]">Preço mín</div><div className="text-lg font-bold tabular-nums text-[var(--text)]">{minP.toLocaleString('pt-BR')}</div></div>
            </div>
            <div className="card-surface flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg)] text-[var(--muted)]"><Coins className="h-4 w-4" /></span>
              <div><div className="text-xs text-[var(--muted)]">Preço médio</div><div className="text-lg font-bold tabular-nums text-[var(--text)]">{avgP.toLocaleString('pt-BR')}</div></div>
            </div>
            <div className="card-surface flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--soft)] text-[var(--red)]"><ArrowUp className="h-4 w-4" /></span>
              <div><div className="text-xs text-[var(--muted)]">Preço máx</div><div className="text-lg font-bold tabular-nums text-[var(--text)]">{maxP.toLocaleString('pt-BR')}</div></div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {loading && <div className="card-surface col-span-full p-8 text-center text-sm text-[var(--muted)]">Carregando mercado...</div>}
            {activeListings.map(l => {
              const c = cardOf(l.cardUid) || {
                uid: l.cardUid || l.id,
                playerId: l.cardUid || l.id,
                name: l.cardName || 'Carta',
                position: (l.cardPosition || 'Ala') as any,
                sport: 'futsal',
                nationality: 'Brasil',
                age: 20,
                club: 'Mercado',
                rarity: (l.cardRarity || 'common') as any,
                edition: '2025/26',
                special: 'none',
                overall: l.cardOverall || 70,
                image: getPlayerImage(l.cardName || '') || l.cardImage,
                pace: l.cardAttributes?.pace ?? l.cardOverall ?? 70,
                shooting: l.cardAttributes?.shooting ?? l.cardOverall ?? 70,
                passing: l.cardAttributes?.passing ?? l.cardOverall ?? 70,
                dribbling: l.cardAttributes?.dribbling ?? l.cardOverall ?? 70,
                defending: l.cardAttributes?.defending ?? l.cardOverall ?? 70,
                physical: l.cardAttributes?.physical ?? l.cardOverall ?? 70,
                reflexes: l.cardAttributes?.reflexes ?? l.cardOverall ?? 70,
                positioning: l.cardAttributes?.positioning ?? l.cardOverall ?? 70,
                handling: l.cardAttributes?.handling ?? l.cardOverall ?? 70,
                obtainedAt: l.createdAt,
                favorite: false,
                isNew: true,
                xp: 0,
                evoPoints: 0,
                upgrades: { pace:0, shooting:0, passing:0, dribbling:0, defending:0, physical:0 },
              } as any;
              return (
                <article key={l.id} aria-busy={buyingAnim === l.id} className={`card-surface group flex min-w-0 flex-col overflow-hidden p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--red)]/20 motion-reduce:transform-none motion-reduce:transition-none sm:p-4 ${buyingAnim === l.id ? 'scale-95 opacity-60' : ''}`}>
                  <div className="flex flex-1 items-center justify-center rounded-xl bg-[var(--bg)] p-3">
                    <div className="mx-auto w-full max-w-[232px]">
                      <Card card={c} size="fluid" />
                    </div>
                  </div>
                  <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--red)]"><User className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <div className="text-xs text-[var(--muted)]">Vendedor</div>
                        <div className="truncate text-sm font-medium text-[var(--text)]" title={l.sellerName}>{l.sellerName}</div>
                      </div>
                    </div>
                    <div className="min-w-0 max-w-full shrink text-right">
                      <div className="text-xs text-[var(--muted)]">Preço</div>
                      <div className="break-words text-lg font-bold tabular-nums text-[var(--red)]">{listingPrice(l).toLocaleString('pt-BR')} <span className="text-xs font-medium">moedas</span></div>
                    </div>
                  </div>
                  <button onClick={() => handleBuy(l.id)} className="btn btn-primary btn-full btn-lg mt-3 transition-transform hover:scale-[1.01] motion-reduce:transition-none">
                    Comprar
                  </button>
                </article>
              );
            })}
            {!loading && activeListings.length === 0 && <div className="card-surface col-span-full flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--muted)]"><Store className="h-6 w-6 text-[var(--muted)]" />Nenhuma listagem.</div>}
          </div>
        </>
      )}

      {tab === 'mine' && (
        <div className="space-y-6">
          <section className="card-surface overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--red)]">
                  <Tag className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-[var(--text)]">Anunciar carta</h2>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">Escolha uma carta da coleção e defina o preço.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-4 md:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="min-w-0 space-y-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={listSearch}
                    onChange={e => setListSearch(e.target.value)}
                    placeholder="Buscar carta pelo nome..."
                    aria-label="Buscar carta para anunciar"
                    className={`${marketControl} pl-10`}
                  />
                </label>

                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {matchingSellCards.map(c => {
                    const rarity = RARITY_META[c.rarity];
                    const image = c.image || getPlayerImage(c.name);
                    const selected = listUid === c.uid;
                    return (
                      <button
                        key={c.uid}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setListUid(c.uid)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors motion-reduce:transition-none ${selected ? 'border-[var(--red)]/40 bg-[var(--soft)]' : 'border-[var(--border)] bg-white hover:border-[var(--red)]/20 hover:bg-[var(--bg)]'}`}
                      >
                        <span className="flex h-[68px] w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg)]" style={{ border: `1px solid ${rarity.color}` }}>
                          {image ? <img src={image} alt="" className="h-full w-full object-cover object-top" /> : <User className="h-5 w-5 text-[var(--muted)]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--text)]">{c.name}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                            <span>OVR {c.overall}</span>
                            <span aria-hidden="true">·</span>
                            <span>{c.position}</span>
                            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: rarity.color, color: rarity.color }}>{rarity.label}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${selected ? 'bg-[var(--red)] text-white' : 'bg-[var(--bg)] text-[var(--muted)]'}`}>
                          {selected ? 'Selecionada' : 'Selecionar'}
                        </span>
                      </button>
                    );
                  })}
                  {matchingSellCards.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                      {availableToSell.length === 0 ? 'Nenhuma carta disponível para anunciar.' : 'Nenhuma carta encontrada.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 rounded-2xl bg-[var(--bg)] p-4 md:p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Prévia do anúncio</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">Confira a carta antes de publicar.</p>
                </div>

                <div className="flex min-h-52 flex-col items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-white p-4 sm:flex-row sm:justify-start">
                  {selectedSellCard ? (
                    <>
                      <Card card={selectedSellCard} size="sm" />
                      <div className="min-w-0 text-center sm:text-left">
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Carta selecionada</p>
                        <h4 className="mt-1 break-words text-lg font-semibold text-[var(--text)]">{selectedSellCard.name}</h4>
                        <p className="mt-2 text-sm text-[var(--muted)]">{selectedSellCard.position} · Overall {selectedSellCard.overall}</p>
                        <span className="mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: RARITY_META[selectedSellCard.rarity].color, color: RARITY_META[selectedSellCard.rarity].color }}>
                          {RARITY_META[selectedSellCard.rarity].label}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-[var(--muted)]">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg)]"><Tag className="h-5 w-5" /></span>
                      Selecione uma carta para ver a prévia.
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <label htmlFor="listing-price" className="text-sm font-medium text-[var(--text)]">Preço do anúncio</label>
                  <div className="relative">
                    <Coins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      id="listing-price"
                      value={listPrice}
                      onChange={e => setListPrice(e.target.value)}
                      placeholder="Valor em moedas"
                      aria-label="Preço da carta em moedas"
                      className={`${marketControl} pl-10`}
                    />
                  </div>
                  <button onClick={handleList} disabled={creatingListing} className="btn btn-primary btn-full btn-lg">
                    {creatingListing ? 'Publicando...' : 'Publicar anúncio'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Anúncios ativos</h2>
                <p className="mt-0.5 text-sm text-[var(--muted)]">Gerencie as cartas disponíveis no mercado.</p>
              </div>
              <span className="rounded-full bg-[var(--soft)] px-3 py-1 text-xs font-semibold text-[var(--red)]">{myActiveListings.length} ativos</span>
            </div>

            {myActiveListings.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {myActiveListings.map(l => {
                  const c = cardOf(l.cardUid);
                  const name = c?.name || l.cardName || 'Carta';
                  const rarity = c ? RARITY_META[c.rarity] : null;
                  const image = c?.image || l.cardImage || getPlayerImage(name);
                  return (
                    <article key={l.id} className="card-surface flex min-w-0 items-center gap-3 p-3 transition-colors hover:border-[var(--red)]/20 sm:gap-4 sm:p-4">
                      <span className="flex h-24 w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--bg)]" style={rarity ? { border: `1px solid ${rarity.color}` } : undefined}>
                        {image ? <img src={image} alt={name} className="h-full w-full object-cover object-top" /> : <User className="h-6 w-6 text-[var(--muted)]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-[var(--text)]" title={name}>{name}</h3>
                          <span className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--red)]">Ativo</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-[var(--muted)]">
                          {c ? `${c.position} · OVR ${c.overall}` : `OVR ${l.cardOverall ?? '—'}`}
                          {rarity ? ` · ${rarity.label}` : l.cardRarity ? ` · ${l.cardRarity}` : ''}
                        </p>
                        <p className="mt-2 text-base font-bold tabular-nums text-[var(--red)]">
                          {listingPrice(l).toLocaleString('pt-BR')} <span className="text-xs font-medium">moedas</span>
                        </p>
                        <button
                          disabled={cancellingListingId !== null}
                          onClick={async () => {
                            if (cancellingListingId) return;
                            setCancellingListingId(l.id);
                            const cancelled = await cancelListing(l.id);
                            if (cancelled) toast.success('Anúncio cancelado.');
                            else toast.error('O anúncio não está mais ativo ou não foi possível cancelá-lo.');
                            setCancellingListingId(null);
                          }}
                          className="btn btn-danger btn-sm mt-2"
                        >
                          {cancellingListingId === l.id ? 'Cancelando...' : 'Cancelar anúncio'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="card-surface flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
                <Store className="h-5 w-5 text-[var(--muted)]" />
                <p className="text-sm font-medium text-[var(--text)]">Nenhum anúncio ativo</p>
                <p className="text-xs text-[var(--muted)]">As cartas que você publicar aparecerão aqui.</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[var(--muted)]" />
                <h2 className="text-lg font-semibold text-[var(--text)]">Histórico de anúncios</h2>
              </div>
              <p className="mt-0.5 text-sm text-[var(--muted)]">Anúncios expirados, vendidos ou cancelados.</p>
            </div>
            {myListingHistory.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {myListingHistory.map(l => {
                  const c = cardOf(l.cardUid);
                  const name = c?.name || l.cardName || 'Carta';
                  const image = c?.image || l.cardImage || getPlayerImage(name);
                  return (
                    <article key={l.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-white p-3 opacity-90">
                      <span className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg)]">
                        {image ? <img src={image} alt={name} className="h-full w-full object-cover object-top" /> : <User className="h-4 w-4 text-[var(--muted)]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-[var(--text)]" title={name}>{name}</h3>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">{listingPrice(l).toLocaleString('pt-BR')} moedas</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--bg)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                        {listingStatusLabel(l, marketNow)}
                      </span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                Nenhum anúncio no histórico.
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--muted)]">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Este extrato registra negociações confirmadas a partir da ativação do histórico. As transações anteriores não têm comprador e horário de conclusão registrados e não podem ser reconstruídas com segurança.</p>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="card-surface p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-[var(--muted)]">Compras realizadas</span><ArrowDownLeft className="h-4 w-4 text-[var(--muted)]" /></div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{historySummary.purchaseCount.toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{historySummary.spent.toLocaleString('pt-BR')} moedas gastas</p>
            </article>
            <article className="card-surface p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-[var(--muted)]">Vendas concluídas</span><ArrowUpRight className="h-4 w-4 text-[var(--red)]" /></div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{historySummary.saleCount.toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{historySummary.received.toLocaleString('pt-BR')} moedas recebidas</p>
            </article>
            <article className="card-surface p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-[var(--muted)]">Volume movimentado</span><Coins className="h-4 w-4 text-[var(--muted)]" /></div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{historySummary.volume.toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">moedas em negociações</p>
            </article>
            <article className="card-surface p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-[var(--muted)]">Saldo líquido</span><BadgeCheck className="h-4 w-4 text-[var(--red)]" /></div>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${historySummary.net < 0 ? 'text-[var(--muted)]' : 'text-[var(--red)]'}`}>
                {historySummary.net > 0 ? '+' : historySummary.net < 0 ? '-' : ''}{Math.abs(historySummary.net).toLocaleString('pt-BR')}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">moedas recebidas menos gastas</p>
            </article>
          </section>

          <section className="card-surface space-y-4 p-4 md:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Histórico de transações</h2>
                <p className="mt-0.5 text-sm text-[var(--muted)]">Compras e vendas concluídas, da mais recente à mais antiga.</p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1" role="group" aria-label="Tipo de movimentação">
                {([
                  ['all', 'Todas'],
                  ['buy', 'Compras'],
                  ['sell', 'Vendas'],
                ] as const).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={historyKind === kind}
                    onClick={() => setHistoryKind(kind)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${historyKind === kind ? 'bg-white text-[var(--red)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_auto_auto]">
              <label className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  value={historySearchInput}
                  onChange={event => setHistorySearchInput(event.target.value)}
                  placeholder="Buscar jogador..."
                  aria-label="Buscar no histórico por jogador"
                  className={`${marketControl} pl-10`}
                />
              </label>
              <select aria-label="Filtrar histórico por período" value={historyPeriod} onChange={event => setHistoryPeriod(event.target.value as typeof historyPeriod)} className={marketControl}>
                <option value="all">Todo o período</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
              </select>
              <button
                type="button"
                onClick={() => setHistoryRefreshKey(key => key + 1)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg)]"
              >
                <RotateCcw className="h-4 w-4" /> Atualizar
              </button>
              <button
                type="button"
                onClick={clearHistoryFilters}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)]"
              >
                Limpar filtros
              </button>
            </div>

            {!supabase ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-6 text-center text-sm text-[var(--muted)]">O histórico de transações precisa de conexão com o servidor.</div>
            ) : historyError ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-6 text-center">
                <p className="text-sm font-medium text-[var(--text)]">Não foi possível carregar o histórico.</p>
                <button type="button" onClick={() => setHistoryRefreshKey(key => key + 1)} className="mt-3 text-sm font-semibold text-[var(--red)] hover:underline">Tentar novamente</button>
              </div>
            ) : (historyLoading || !userId) && historyRows.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">Carregando transações confirmadas...</div>
            ) : historyRows.length === 0 ? (
              historyKind === 'all' && !historySearch && historyPeriod === 'all' ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)]/60 px-5 py-10 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--soft)] text-[var(--red)]"><Store className="h-7 w-7" /></span>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--text)]">Nenhuma movimentação ainda</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Compras e vendas concluídas serão exibidas aqui. As movimentações anteriores à ativação do extrato não podem ser recuperadas com os dados existentes.</p>
                  <button type="button" onClick={() => setTab('market')} className="btn btn-primary mt-5">Ir para o Mercado</button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <p className="text-sm font-medium text-[var(--text)]">Nenhuma movimentação encontrada</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Tente ajustar a busca ou os filtros selecionados.</p>
                  <button type="button" onClick={clearHistoryFilters} className="mt-3 text-sm font-semibold text-[var(--red)] hover:underline">Limpar filtros</button>
                </div>
              )
            ) : (
              <div className="space-y-5">
                {historyGroups.map(group => (
                  <section key={group.label} className="space-y-2">
                    <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{group.label}</h3>
                    <div className="space-y-2">
                      {group.rows.map(transaction => {
                        const isPurchase = transaction.buyerId === userId;
                        const opponent = isPurchase ? transaction.sellerName : transaction.buyerName;
                        const image = transaction.cardImage || getPlayerImage(transaction.cardName);
                        return (
                          <button
                            key={transaction.id}
                            type="button"
                            onClick={() => setSelectedTransaction(transaction)}
                            className="card-surface flex w-full min-w-0 items-center gap-3 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--red)]/20 hover:shadow-sm motion-reduce:transform-none motion-reduce:transition-none sm:gap-4 sm:p-4"
                          >
                            <span className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                              {image ? <img src={image} alt={transaction.cardName} className="h-full w-full object-cover object-top" /> : <User className="h-5 w-5 text-[var(--muted)]" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="max-w-full truncate text-sm font-semibold text-[var(--text)]">{transaction.cardName}</span>
                                {transaction.cardOverall !== null && <span className="rounded-md bg-[var(--bg)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">OVR {transaction.cardOverall}</span>}
                              </span>
                              <span className="mt-1 block truncate text-xs text-[var(--muted)]">{getRarityLabel(transaction.cardRarity)} · {isPurchase ? 'Comprado de' : 'Vendido para'} {opponent}</span>
                              <span className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isPurchase ? 'bg-[var(--bg)] text-[var(--muted)]' : 'bg-[var(--soft)] text-[var(--red)]'}`}>{isPurchase ? 'Compra' : 'Venda'}</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]"><BadgeCheck className="h-3 w-3" /> Concluída</span>
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className={`block text-base font-bold tabular-nums sm:text-lg ${isPurchase ? 'text-[var(--muted)]' : 'text-[var(--red)]'}`}>{isPurchase ? '-' : '+'}{transaction.price.toLocaleString('pt-BR')}</span>
                              <span className="block text-[11px] text-[var(--muted)]">moedas</span>
                              <span className="mt-1 hidden text-[11px] text-[var(--muted)] sm:block">{new Date(transaction.completedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--border)] pt-4 sm:flex-row">
                  <p className="text-xs text-[var(--muted)]">Exibindo {historyRows.length.toLocaleString('pt-BR')} de {historyTotal.toLocaleString('pt-BR')} transações</p>
                  {historyRows.length < historyTotal && (
                    <button type="button" onClick={loadMoreHistory} disabled={historyLoadingMore} className="btn btn-secondary btn-sm">
                      {historyLoadingMore ? 'Carregando...' : 'Carregar mais'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {selectedTransaction && userId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--text)]/50 p-4" role="presentation" onMouseDown={() => setSelectedTransaction(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketplace-transaction-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xl"
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]"><BadgeCheck className="h-3.5 w-3.5" /> Transação concluída</span>
                <h2 id="marketplace-transaction-title" className="mt-3 text-xl font-semibold text-[var(--text)]">Detalhes da negociação</h2>
              </div>
              <button type="button" onClick={() => setSelectedTransaction(null)} aria-label="Fechar detalhes" className="rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)]"><X className="h-5 w-5" /></button>
            </header>
            <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(150px,0.7fr)_minmax(0,1.3fr)]">
              <div className="flex justify-center rounded-xl bg-[var(--bg)] p-4">
                {(() => {
                  const image = selectedTransaction.cardImage || getPlayerImage(selectedTransaction.cardName);
                  return image
                    ? <img src={image} alt={selectedTransaction.cardName} className="aspect-[7/10] w-full max-w-48 rounded-xl border border-[var(--border)] object-cover object-top shadow-sm" />
                    : <div className="flex aspect-[7/10] w-full max-w-48 items-center justify-center rounded-xl border border-[var(--border)] bg-white"><User className="h-8 w-8 text-[var(--muted)]" /></div>;
                })()}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-[var(--text)]">{selectedTransaction.cardName}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{selectedTransaction.cardOverall !== null ? `Overall ${selectedTransaction.cardOverall}` : 'Overall não informado'} · {getRarityLabel(selectedTransaction.cardRarity)}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[var(--bg)] p-3"><p className="text-xs text-[var(--muted)]">Comprador</p><p className="mt-1 truncate text-sm font-medium text-[var(--text)]">{selectedTransaction.buyerName}</p></div>
                  <div className="rounded-xl bg-[var(--bg)] p-3"><p className="text-xs text-[var(--muted)]">Vendedor</p><p className="mt-1 truncate text-sm font-medium text-[var(--text)]">{selectedTransaction.sellerName}</p></div>
                </div>
                <dl className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2"><dt className="text-sm text-[var(--muted)]">Preço final</dt><dd className="text-base font-bold tabular-nums text-[var(--text)]">{selectedTransaction.price.toLocaleString('pt-BR')} moedas</dd></div>
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2"><dt className="text-sm text-[var(--muted)]">Tipo</dt><dd className="text-sm font-semibold text-[var(--text)]">{selectedTransaction.buyerId === userId ? 'Compra' : 'Venda'}</dd></div>
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2"><dt className="text-sm text-[var(--muted)]">Concluída em</dt><dd className="text-right text-sm font-medium text-[var(--text)]">{new Date(selectedTransaction.completedAt).toLocaleString('pt-BR')}</dd></div>
                  <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-sm text-[var(--muted)]">ID da transação</dt><dd className="break-all text-right font-mono text-xs text-[var(--muted)]">{selectedTransaction.id}</dd></div>
                </dl>
              </div>
            </div>
          </section>
        </div>
      )}

      <ConfirmModal
        open={!!confirmBuy}
        title="Confirmar compra"
        message={confirmBuy ? `Comprar por ${(listings.find(l => l.id === confirmBuy)?.buyNow || listings.find(l => l.id === confirmBuy)?.price || 0).toLocaleString('pt-BR')} moedas?` : ''}
        onConfirm={confirmBuyNow}
        onCancel={() => setConfirmBuy(null)}
      />
    </div>
  );
}
