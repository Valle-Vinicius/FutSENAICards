import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import { useCardViewer } from '../hooks/useCardViewer';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BadgeCheck, CalendarDays, ChevronRight, CircleDollarSign, Clock3, Coins, PencilLine, Plus, RotateCcw, Search, Store, Tag, User, X } from 'lucide-react';
import { getPlayerImage } from '../data/players';
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
import { RARITY_META, type Listing, type PlayerCard, type Position, type Rarity } from '../types';

const EMPTY_TRANSACTION_SUMMARY: MarketplaceTransactionSummary = {
  purchaseCount: 0,
  saleCount: 0,
  spent: 0,
  received: 0,
  volume: 0,
  net: 0,
};
const SELL_CARD_PAGE_SIZE = 48;

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

function listingToCard(listing: Listing): PlayerCard {
  const attributes = listing.cardAttributes;
  const name = listing.cardName || 'Carta';
  return {
    uid: listing.cardUid || listing.id,
    playerId: listing.cardUid || listing.id,
    name,
    position: (listing.cardPosition || 'Ala') as Position,
    sport: 'futsal',
    nationality: '',
    age: 0,
    club: '',
    rarity: (listing.cardRarity || 'common') as Rarity,
    edition: '',
    special: 'none',
    overall: listing.cardOverall ?? 0,
    image: listing.cardImage || getPlayerImage(name),
    pace: attributes?.pace ?? 0,
    shooting: attributes?.shooting ?? 0,
    passing: attributes?.passing ?? 0,
    dribbling: attributes?.dribbling ?? 0,
    defending: attributes?.defending ?? 0,
    physical: attributes?.physical ?? 0,
    reflexes: attributes?.reflexes,
    positioning: attributes?.positioning,
    handling: attributes?.handling,
    obtainedAt: listing.createdAt,
    favorite: false,
    isNew: false,
  };
}

export default function Marketplace() {
  const listings = useGame(s => s.listings);
  const cards = useGame(s => s.cards);
  const coins = useGame(s => s.coins);
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
  const [salesSummaryReady, setSalesSummaryReady] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<MarketplaceTransactionRecord | null>(null);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [rar, setRar] = useState('');
  const [minOverall, setMinOverall] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('price_asc');
  const [listUid, setListUid] = useState<string | null>(null);
  const [listPrice, setListPrice] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [sellCardPage, setSellCardPage] = useState(0);
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [confirmBuy, setConfirmBuy] = useState<string | null>(null);
  const [editingPriceFor, setEditingPriceFor] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [buyingAnim, setBuyingAnim] = useState<string | null>(null);
  const [cancellingListingId, setCancellingListingId] = useState<string | null>(null);
  const [creatingListing, setCreatingListing] = useState(false);
  const { openCard: openCardViewer, viewer: cardViewer } = useCardViewer();
  const deferredListSearch = useDeferredValue(listSearch);
  useEffect(() => {
    if (!sellDialogOpen && !confirmBuy && !editingPriceFor) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || buyingAnim) return;
      if (confirmBuy) setConfirmBuy(null);
      if (sellDialogOpen) setSellDialogOpen(false);
      if (editingPriceFor) {
        setEditingPriceFor(null);
        setEditPrice('');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sellDialogOpen, confirmBuy, editingPriceFor, buyingAnim]);

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
  useEffect(() => {
    if (tab !== 'mine' || !supabase || !userId) return;
    let active = true;
    getMarketplaceTransactionSummary()
      .then(summary => {
        if (!active) return;
        setHistorySummary(summary);
        setSalesSummaryReady(true);
      })
      .catch(error => {
        console.error('[marketplace] sales summary load failed:', error);
      });
    return () => { active = false; };
  }, [tab, userId, historyRefreshKey]);
  const buyListing = useGame(s => s.buyListing);
  const listCard = useGame(s => s.listCard);
  const cancelListing = useGame(s => s.cancelListing);
  const updateListingPrice = useGame(s => s.updateListingPrice);
  const recordTransfer = useGame(s => s.recordTransfer);
  const recordPrice = useGame(s => s.recordPrice);

  const cardsByUid = useMemo(() => new Map(cards.map(card => [card.uid, card])), [cards]);
  const cardOf = (uid: string) => cardsByUid.get(uid);
  const listingPrice = (listing: typeof listings[number]) => listing.buyNow > 0 ? listing.buyNow : listing.price;
  const allActiveListings = useMemo(
    () => listings.filter(listing => listing.status === 'active' && listing.expiresAt > marketNow),
    [listings, marketNow],
  );

  const activeListings = useMemo(() => allActiveListings.filter(listing => {
    const card = cardsByUid.get(listing.cardUid);
    const name = card?.name || listing.cardName || '';
    const position = card?.position || listing.cardPosition;
    const rarity = card?.rarity || listing.cardRarity;
    const overall = card?.overall ?? listing.cardOverall ?? 0;
    if (q && !name.toLocaleLowerCase().includes(q.toLocaleLowerCase())) return false;
    if (pos && position !== pos) return false;
    if (rar && rarity !== rar) return false;
    if (minOverall && overall < Number(minOverall)) return false;
    if (minPrice && listingPrice(listing) < Number(minPrice)) return false;
    if (maxPrice && listingPrice(listing) > Number(maxPrice)) return false;
    return true;
  }).sort((a, b) => {
    const ca = cardsByUid.get(a.cardUid), cb = cardsByUid.get(b.cardUid);
    if (sort === 'price_asc') return listingPrice(a) - listingPrice(b);
    if (sort === 'price_desc') return listingPrice(b) - listingPrice(a);
    if (sort === 'overall') return (cb?.overall ?? b.cardOverall ?? 0) - (ca?.overall ?? a.cardOverall ?? 0);
    if (sort === 'name') return (ca?.name ?? a.cardName ?? '').localeCompare(cb?.name ?? b.cardName ?? '');
    return 0;
  }), [allActiveListings, cardsByUid, q, pos, rar, minOverall, minPrice, maxPrice, sort]);

  const prices = activeListings.map(listingPrice);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const avgP = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

  const clearFilters = () => { setQ(''); setPos(''); setRar(''); setMinOverall(''); setMinPrice(''); setMaxPrice(''); setSort('price_asc'); };

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
    if (!Number.isInteger(Number(listPrice)) || Number(listPrice) <= 0) { toast.error('Informe um preço inteiro maior que zero.'); return; }
    setCreatingListing(true);
    try {
      const id = await listCard(listUid, Number(listPrice), 24);
      if (id) { toast.success('Carta anunciada!'); setListUid(null); setListPrice(''); setSellDialogOpen(false); }
      else if (!supabase) toast.error('Carta indisponível para anúncio.');
    } finally {
      setCreatingListing(false);
    }
  };

  const handleUpdateListingPrice = async (listingId: string) => {
    const price = Number(editPrice);
    if (!Number.isInteger(price) || price <= 0) {
      toast.error('Informe um preço inteiro maior que zero.');
      return;
    }
    setSavingPrice(true);
    try {
      const updated = await updateListingPrice(listingId, price);
      if (!updated) {
        toast.error('O anúncio não está mais ativo ou não foi possível atualizar o preço.');
        return;
      }
      toast.success('Preço do anúncio atualizado.');
      setEditingPriceFor(null);
      setEditPrice('');
    } catch (error) {
      console.error('[marketplace] listing price update failed:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o preço.');
    } finally {
      setSavingPrice(false);
    }
  };

  const activeListingUids = useMemo(
    () => new Set(allActiveListings.map(listing => listing.cardUid)),
    [allActiveListings],
  );
  const availableToSell = useMemo(
    () => cards.filter(card => !activeListingUids.has(card.uid)),
    [cards, activeListingUids],
  );
  const sortedSellCards = useMemo(
    () => sellDialogOpen
      ? [...availableToSell].sort((a, b) => b.overall - a.overall)
      : [],
    [availableToSell, sellDialogOpen],
  );
  const matchingSellCards = useMemo(() => {
    const search = deferredListSearch.trim().toLocaleLowerCase();
    return sortedSellCards.filter(card => !search || card.name.toLocaleLowerCase().includes(search));
  }, [sortedSellCards, deferredListSearch]);
  const totalSellCardPages = Math.max(1, Math.ceil(matchingSellCards.length / SELL_CARD_PAGE_SIZE));
  const currentSellCardPage = Math.min(sellCardPage, totalSellCardPages - 1);
  const visibleSellCards = matchingSellCards.slice(
    currentSellCardPage * SELL_CARD_PAGE_SIZE,
    (currentSellCardPage + 1) * SELL_CARD_PAGE_SIZE,
  );
  const selectedSellCard = listUid && !activeListingUids.has(listUid) ? cardsByUid.get(listUid) : undefined;
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
  const confirmingListing = confirmBuy ? listings.find(listing => listing.id === confirmBuy) : undefined;
  const confirmingPrice = confirmingListing ? listingPrice(confirmingListing) : 0;
  const confirmingCard = confirmingListing
    ? cardOf(confirmingListing.cardUid) || listingToCard(confirmingListing)
    : undefined;
  const confirmingRarity = confirmingCard
    ? RARITY_META[confirmingCard.rarity] ?? RARITY_META.common
    : undefined;

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
    <div className="mx-auto max-w-[1720px] space-y-5 p-4 md:p-6 lg:p-8">
      <header className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#17191f] px-5 py-7 text-white shadow-[0_16px_40px_rgba(27,30,39,0.12)] sm:px-8 sm:py-9 lg:px-11">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-32 h-80 w-80 rounded-full border-[34px] border-[#ed1b35]/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-[18%] h-72 w-72 rotate-45 border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute right-8 top-2 hidden select-none text-[10rem] font-black leading-none text-white/[0.035] md:block">FUT</div>
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#ff8290]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ed1b35]" />
              FUTSENAI · CENTRAL DE TRANSFERÊNCIAS
            </p>
            <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-tight sm:text-5xl lg:text-6xl">Transferências</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/65 sm:text-base">Encontre jogadores, acompanhe preços e monte sua coleção.</p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 sm:self-auto">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#ed1b35] text-white"><ArrowLeftRight className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Mercado ao vivo</p>
              <p className="mt-0.5 text-lg font-black tabular-nums">{allActiveListings.length} <span className="text-xs font-semibold text-white/60">anúncios</span></p>
            </div>
          </div>
        </div>
      </header>

      <nav className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-1.5 shadow-sm sm:w-fit" aria-label="Seções de transferências">
        {(['market', 'mine', 'history'] as const).map(section => (
          <button
            key={section}
            type="button"
            aria-pressed={tab === section}
            onClick={() => setTab(section)}
            className={`min-w-[7rem] rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wide transition-colors motion-reduce:transition-none sm:min-w-[9rem] ${tab === section ? 'bg-[var(--red)] text-white shadow-md shadow-[var(--red)]/20' : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]'}`}
          >
            {section === 'market' ? 'Mercado' : section === 'mine' ? 'Minhas vendas' : 'Histórico'}
          </button>
        ))}
      </nav>

      {tab === 'market' && (
        <>
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] bg-[linear-gradient(90deg,rgba(239,35,55,0.07),transparent_58%)] px-4 py-4 sm:px-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Busca de jogadores</p>
              <h2 className="mt-1 text-lg font-black uppercase tracking-tight text-[var(--text)] sm:text-xl">Encontre seu próximo jogador</h2>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12 sm:p-5">
              <label className="relative min-w-0 sm:col-span-2 lg:col-span-4 xl:col-span-4">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--red)]" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jogador..." aria-label="Buscar jogador" className={`${marketControl} h-12 border-[var(--red)]/20 pl-10 shadow-sm`} />
              </label>
              <select aria-label="Filtrar por posição" value={pos} onChange={e => setPos(e.target.value)} className={marketControl}>
                <option value="">Todas as posições</option>
                {[...new Set(allActiveListings.map(listing => cardOf(listing.cardUid)?.position || listing.cardPosition).filter((position): position is string => !!position))].sort().map(position => <option key={position} value={position}>{position}</option>)}
              </select>
              <select aria-label="Filtrar por raridade" value={rar} onChange={e => setRar(e.target.value)} className={marketControl}>
                <option value="">Todas as raridades</option>
                {['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon', 'secret'].map(rarity => <option key={rarity} value={rarity}>{rarity === 'secret' ? 'Secreta' : RARITY_META[rarity as Rarity].label}</option>)}
              </select>
              <input type="number" min="0" aria-label="Overall mínimo" value={minOverall} onChange={e => setMinOverall(e.target.value)} placeholder="OVR mínimo" className={marketControl} />
              <input type="number" min="0" aria-label="Preço mínimo" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Preço mínimo" className={marketControl} />
              <input type="number" min="0" aria-label="Preço máximo" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Preço máximo" className={marketControl} />
              <select aria-label="Ordenar anúncios" value={sort} onChange={e => setSort(e.target.value)} className={marketControl}>
                <option value="price_asc">Menor preço</option>
                <option value="price_desc">Maior preço</option>
                <option value="overall">Maior overall</option>
                <option value="name">Nome do jogador</option>
              </select>
              <button onClick={clearFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-bold uppercase tracking-wide text-[var(--text)] transition-colors hover:border-[var(--red)]/30 hover:bg-[var(--soft)] hover:text-[var(--red)] motion-reduce:transition-none">
                <RotateCcw className="h-4 w-4" /> Limpar filtros
              </button>
            </div>
          </section>

          <section className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-white sm:grid-cols-4 sm:divide-y-0">
            <div className="px-3 py-3 sm:px-4"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Anúncios encontrados</p><p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">{activeListings.length}</p></div>
            <div className="px-3 py-3 sm:px-4"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Menor preço</p><p className="mt-1 text-lg font-black tabular-nums text-[var(--red)]">{minP.toLocaleString('pt-BR')}</p></div>
            <div className="px-3 py-3 sm:px-4"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Preço médio</p><p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">{avgP.toLocaleString('pt-BR')}</p></div>
            <div className="px-3 py-3 sm:px-4"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Maior preço</p><p className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">{maxP.toLocaleString('pt-BR')}</p></div>
          </section>

          <section aria-label="Cartas anunciadas" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 sm:gap-4">
            {loading && <div className="card-surface col-span-full p-8 text-center text-sm text-[var(--muted)]">Carregando mercado...</div>}
            {activeListings.map(l => {
              const card = cardOf(l.cardUid) || listingToCard(l);
              const snapshotAttributes = l.cardAttributes ? undefined : [];
              return (
                <article key={l.id} aria-busy={buyingAnim === l.id} className={`group flex min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-white p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[var(--red)]/35 hover:shadow-[0_14px_32px_rgba(27,30,39,0.12)] motion-reduce:transform-none motion-reduce:transition-none sm:p-3 ${buyingAnim === l.id ? 'scale-95 opacity-60' : ''}`}>
                  <button type="button" onClick={() => openCardViewer(card)} className="flex w-full justify-center rounded-xl bg-[linear-gradient(145deg,#f3f4f6,#e8e9ed)] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)]" aria-label={`Visualizar carta: ${card.name}, overall ${card.overall}`}>
                    <div className="w-full max-w-[190px] transition-transform duration-200 group-hover:scale-[1.015] motion-reduce:transform-none motion-reduce:transition-none">
                      <Card card={card} size="fluid" attributes={snapshotAttributes} />
                    </div>
                  </button>
                  <div className="min-w-0 px-1 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[10px] font-semibold text-[var(--muted)]"><User className="h-3 w-3 shrink-0" />{l.sellerName}</span>
                      <span className="shrink-0 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--muted)]">{card.position}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-extrabold text-[var(--text)]" title={card.name}>{card.name}</p>
                    <div className="mt-2 flex items-end justify-between gap-1">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Preço</p>
                        <p className="truncate text-lg font-black leading-tight tabular-nums text-[var(--red)] group-hover:scale-[1.03] group-hover:origin-left">{listingPrice(l).toLocaleString('pt-BR')} <span className="text-[9px] font-bold uppercase">moedas</span></p>
                      </div>
                      <span className="mb-0.5 shrink-0 text-[10px] font-black text-[var(--text)]">OVR {card.overall}</span>
                    </div>
                  </div>
                  <button onClick={() => handleBuy(l.id)} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--red)] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm transition-all hover:bg-[#bd1026] hover:shadow-md motion-reduce:transition-none">
                    Comprar <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
            })}
            {!loading && activeListings.length === 0 && <div className="card-surface col-span-full flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--muted)]"><Store className="h-6 w-6 text-[var(--muted)]" />Nenhuma listagem.</div>}
          </section>
        </>
      )}

      {tab === 'mine' && (
        <div className="space-y-5">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Seu mercado</p>
              <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">Minhas vendas</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Acompanhe seus anúncios e coloque novas cartas na vitrine.</p>
            </div>
            <button type="button" onClick={() => setSellDialogOpen(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--red)] px-5 text-xs font-black uppercase tracking-[0.12em] text-white shadow-md shadow-[var(--red)]/20 transition hover:bg-[#bd1026]">
              <Plus className="h-4 w-4" /> Colocar carta à venda
            </button>
          </header>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Anúncios ativos</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-[var(--text)]">{myActiveListings.length}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">cartas no mercado</p>
            </article>
            <article className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Cartas vendidas</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-[var(--text)]">{salesSummaryReady ? historySummary.saleCount : '—'}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">negociações concluídas</p>
            </article>
            <article className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Moedas recebidas</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-[var(--red)]">{salesSummaryReady ? historySummary.received.toLocaleString('pt-BR') : '—'}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">total das transferências</p>
            </article>
            <article className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Disponíveis para venda</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-[var(--text)]">{availableToSell.length}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">cartas da sua coleção</p>
            </article>
          </section>

          {sellDialogOpen && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#111318]/65 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={() => setSellDialogOpen(false)}>
          <section className="max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]" role="dialog" aria-modal="true" aria-labelledby="marketplace-sell-title" onMouseDown={event => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--soft)] text-[var(--red)]">
                  <Tag className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="marketplace-sell-title" className="font-black uppercase tracking-wide text-[var(--text)]">Nova transferência</h2>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">Escolha uma carta da coleção e defina o preço do anúncio.</p>
                </div>
              </div>
              <button type="button" onClick={() => setSellDialogOpen(false)} aria-label="Fechar anúncio" className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--text)]"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
              <div className="min-w-0 space-y-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={listSearch}
                    onChange={e => {
                      setListSearch(e.target.value);
                      setSellCardPage(0);
                    }}
                    placeholder="Buscar carta pelo nome..."
                    aria-label="Buscar carta para anunciar"
                    className={`${marketControl} pl-10`}
                  />
                </label>

                <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3">
                  {visibleSellCards.map(c => {
                    const rarity = RARITY_META[c.rarity];
                    const selected = listUid === c.uid;
                    return (
                      <button
                        key={c.uid}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setListUid(c.uid)}
                        className={`min-w-0 rounded-xl border p-2 text-left transition-all motion-reduce:transition-none ${selected ? 'border-[var(--red)] bg-[var(--soft)] shadow-sm' : 'border-[var(--border)] bg-white hover:-translate-y-0.5 hover:border-[var(--red)]/30 hover:shadow-sm'}`}
                      >
                        <span className="mx-auto block w-full max-w-[112px]"><Card card={c} size="fluid" /></span>
                        <span className="mt-2 block truncate text-xs font-bold text-[var(--text)]" title={c.name}>{c.name}</span>
                        <span className="mt-1 flex items-center justify-between gap-1">
                          <span className="truncate text-[10px] font-semibold text-[var(--muted)]">{c.position} · OVR {c.overall}</span>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: rarity.color }} aria-label={rarity.label} title={rarity.label} />
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
                {matchingSellCards.length > 0 && (
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-[var(--muted)]" aria-live="polite">
                      {currentSellCardPage * SELL_CARD_PAGE_SIZE + 1}–{Math.min((currentSellCardPage + 1) * SELL_CARD_PAGE_SIZE, matchingSellCards.length)} de {matchingSellCards.length} cartas
                    </p>
                    {totalSellCardPages > 1 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSellCardPage(page => Math.max(0, page - 1))}
                          disabled={currentSellCardPage === 0}
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-40"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => setSellCardPage(page => Math.min(totalSellCardPages - 1, page + 1))}
                          disabled={currentSellCardPage >= totalSellCardPages - 1}
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text)] disabled:opacity-40"
                        >
                          Próximas
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 rounded-2xl bg-[var(--bg)] p-4 md:p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Prévia do anúncio</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">Confira a carta antes de publicar.</p>
                </div>

                <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-white p-4">
                  {selectedSellCard ? (
                    <>
                      <Card card={selectedSellCard} size="md" onClick={() => openCardViewer(selectedSellCard)} />
                      <div className="min-w-0 text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Carta selecionada</p>
                        <h4 className="mt-1 break-words text-lg font-black text-[var(--text)]">{selectedSellCard.name}</h4>
                        <p className="mt-1 text-sm text-[var(--muted)]">{selectedSellCard.position} · Overall {selectedSellCard.overall}</p>
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
                  <label htmlFor="listing-price" className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text)]">Preço do anúncio</label>
                  <div className="relative">
                    <Coins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      id="listing-price"
                      type="number"
                      min="1"
                      step="1"
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
            </div>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-black uppercase tracking-wide text-[var(--text)]">Anúncios ativos</h2>
                <p className="mt-0.5 text-sm text-[var(--muted)]">Cartas que seguem disponíveis para negociação.</p>
              </div>
              <span className="rounded-full bg-[var(--soft)] px-3 py-1 text-xs font-semibold text-[var(--red)]">{myActiveListings.length} ativos</span>
            </div>

            {myActiveListings.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 sm:gap-4">
                {myActiveListings.map(l => {
                  const card = cardOf(l.cardUid) || listingToCard(l);
                  const rarity = RARITY_META[card.rarity] ?? RARITY_META.common;
                  const isEditing = editingPriceFor === l.id;
                  return (
                    <article key={l.id} className="group flex min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-white p-2.5 shadow-sm transition-all hover:-translate-y-1 hover:border-[var(--red)]/30 hover:shadow-md sm:p-3">
                      <div className="flex justify-center rounded-xl bg-[var(--bg)] p-2">
                        <div className="w-full max-w-[174px]"><Card card={card} size="fluid" attributes={l.cardAttributes ? undefined : []} onClick={() => openCardViewer(card)} /></div>
                      </div>
                      <div className="min-w-0 px-1 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: rarity.color }}>{rarity.label}</span>
                          <span className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-[9px] font-black uppercase text-[var(--red)]">Ativo</span>
                        </div>
                        <h3 className="mt-1 truncate text-sm font-black text-[var(--text)]" title={card.name}>{card.name}</h3>
                        <p className="mt-1 truncate text-[10px] font-semibold text-[var(--muted)]">{card.position} · OVR {card.overall}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Preço</span>
                          <span className="text-base font-black tabular-nums text-[var(--red)]">{listingPrice(l).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-[9px] font-medium text-[var(--muted)]">
                          <CalendarDays className="h-3 w-3 shrink-0" />
                          <span className="truncate">Expira {new Date(l.expiresAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                      {isEditing ? (
                        <div className="mt-3 space-y-2 rounded-xl bg-[var(--bg)] p-2">
                          <label htmlFor={`edit-price-${l.id}`} className="text-[9px] font-black uppercase tracking-wide text-[var(--muted)]">Novo preço</label>
                          <input id={`edit-price-${l.id}`} type="number" min="1" step="1" value={editPrice} onChange={event => setEditPrice(event.target.value)} className={`${marketControl} h-10`} />
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" disabled={savingPrice} onClick={() => handleUpdateListingPrice(l.id)} className="h-9 rounded-lg bg-[var(--red)] px-2 text-[9px] font-black uppercase text-white disabled:opacity-60">{savingPrice ? 'Salvando...' : 'Salvar'}</button>
                            <button type="button" disabled={savingPrice} onClick={() => { setEditingPriceFor(null); setEditPrice(''); }} className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-[9px] font-black uppercase text-[var(--muted)]">Voltar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => { setEditingPriceFor(l.id); setEditPrice(String(listingPrice(l))); }} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[var(--border)] px-2 text-[9px] font-black uppercase text-[var(--text)] transition hover:border-[var(--red)]/30 hover:text-[var(--red)]"><PencilLine className="h-3 w-3" /> Editar</button>
                          <button
                            type="button"
                            disabled={cancellingListingId !== null}
                            onClick={async () => {
                              if (cancellingListingId) return;
                              setCancellingListingId(l.id);
                              try {
                                const cancelled = await cancelListing(l.id);
                                if (cancelled) toast.success('Anúncio cancelado.');
                                else toast.error('O anúncio não está mais ativo ou não foi possível cancelá-lo.');
                              } finally {
                                setCancellingListingId(null);
                              }
                            }}
                            className="h-9 rounded-lg border border-[#d63749]/20 bg-[#fff4f5] px-2 text-[9px] font-black uppercase text-[#c41e35] disabled:opacity-60"
                          >
                            {cancellingListingId === l.id ? 'Removendo...' : 'Remover'}
                          </button>
                        </div>
                      )}
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
          <header>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Todas as negociações</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-[var(--text)] sm:text-3xl">Histórico de transferências</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Compras e vendas confirmadas na sua trajetória.</p>
          </header>
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
                <h2 className="text-lg font-black uppercase tracking-wide text-[var(--text)]">Movimentações</h2>
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
                        const transactionRarity = RARITY_META[(transaction.cardRarity || 'common') as Rarity] ?? RARITY_META.common;
                        return (
                          <button
                            key={transaction.id}
                            type="button"
                            onClick={() => setSelectedTransaction(transaction)}
                            className="card-surface flex w-full min-w-0 items-center gap-3 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--red)]/20 hover:shadow-sm motion-reduce:transform-none motion-reduce:transition-none sm:gap-4 sm:p-4"
                          >
                            <span className="relative flex aspect-[7/10] w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[var(--bg)] shadow-sm" style={{ borderColor: transactionRarity.color }}>
                              {image ? <img src={image} alt={transaction.cardName} className="absolute inset-0 h-full w-full object-cover object-top" /> : <User className="h-5 w-5 text-[var(--muted)]" />}
                              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                              {transaction.cardOverall !== null && <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[8px] font-black text-white">{transaction.cardOverall}</span>}
                              <span className="absolute bottom-1 left-1 right-1 line-clamp-2 text-[7px] font-black leading-tight text-white">{transaction.cardName}</span>
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
                              <span className="block text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">{isPurchase ? 'Debitadas' : 'Recebidas'}</span>
                              <span className="mt-1 block text-[9px] leading-tight text-[var(--muted)]">{new Date(transaction.completedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
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

      {confirmBuy && confirmingListing && confirmingCard && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#111318]/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => buyingAnim !== confirmBuy && setConfirmBuy(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketplace-buy-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-white p-4 shadow-2xl sm:p-6"
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--red)]">Confirmação de transferência</p>
                <h2 id="marketplace-buy-title" className="mt-1 text-xl font-black uppercase text-[var(--text)]">Confirmar compra</h2>
              </div>
              <button type="button" disabled={buyingAnim === confirmBuy} onClick={() => setConfirmBuy(null)} aria-label="Fechar confirmação de compra" className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--bg)] disabled:opacity-40"><X className="h-5 w-5" /></button>
            </header>
            <div className="mt-5 grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex justify-center rounded-xl bg-[var(--bg)] p-2">
                <Card card={confirmingCard} size="sm" attributes={confirmingListing.cardAttributes ? undefined : []} animateHover={false} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-[var(--text)]" title={confirmingCard.name}>{confirmingCard.name}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{confirmingCard.position} · Overall {confirmingCard.overall}</p>
                <span className="mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase" style={{ borderColor: confirmingRarity?.color, color: confirmingRarity?.color }}>
                  {confirmingRarity?.label}
                </span>
                <dl className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
                  <div className="flex justify-between gap-3 text-xs"><dt className="text-[var(--muted)]">Vendedor</dt><dd className="max-w-[65%] truncate font-bold text-[var(--text)]">{confirmingListing.sellerName}</dd></div>
                  <div className="flex justify-between gap-3 text-xs"><dt className="text-[var(--muted)]">Seu saldo</dt><dd className="font-bold tabular-nums text-[var(--text)]">{coins.toLocaleString('pt-BR')} moedas</dd></div>
                  <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-2 text-xs"><dt className="text-[var(--muted)]">Saldo após a compra</dt><dd className={`font-black tabular-nums ${coins >= confirmingPrice ? 'text-[var(--text)]' : 'text-[var(--red)]'}`}>{(coins - confirmingPrice).toLocaleString('pt-BR')} moedas</dd></div>
                </dl>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--soft)] px-3 py-3">
                  <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[var(--text)]"><CircleDollarSign className="h-4 w-4 text-[var(--red)]" /> Valor total</span>
                  <strong className="text-xl font-black tabular-nums text-[var(--red)]">{confirmingPrice.toLocaleString('pt-BR')} <span className="text-[9px] uppercase">moedas</span></strong>
                </div>
                {coins < confirmingPrice && <p className="mt-2 text-xs font-semibold text-[var(--red)]">Saldo insuficiente para concluir esta compra.</p>}
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={buyingAnim === confirmBuy} onClick={() => setConfirmBuy(null)} className="h-11 rounded-xl border border-[var(--border)] px-4 text-xs font-bold uppercase text-[var(--muted)] hover:bg-[var(--bg)] disabled:opacity-50">Voltar</button>
              <button type="button" disabled={buyingAnim === confirmBuy} onClick={confirmBuyNow} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--red)] px-5 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-[#bd1026] disabled:opacity-60">
                {buyingAnim === confirmBuy ? 'Confirmando...' : 'Confirmar compra'} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      )}
      {cardViewer}
    </div>
  );
}
