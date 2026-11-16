import { useState, useEffect } from 'react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import { ArrowDown, ArrowUp, Clock3, Coins, RotateCcw, Search, SlidersHorizontal, Store, Tag, User } from 'lucide-react';
import { getPlayerImage } from '../data/players';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import { getListings, toGameListing, type ListingRecord } from '../lib/services/marketplace';
import { RARITY_META, type Listing } from '../types';

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

export default function Marketplace() {
  const listings = useGame(s => s.listings);
  const cards = useGame(s => s.cards);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketNow, setMarketNow] = useState(() => Date.now());
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
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, []);

  useEffect(() => {
    getListings().then(listings => {
      if (listings !== null) applyRemoteListings(listings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  const buyListing = useGame(s => s.buyListing);
  const listCard = useGame(s => s.listCard);
  const cancelListing = useGame(s => s.cancelListing);
  const recordTransfer = useGame(s => s.recordTransfer);
  const recordPrice = useGame(s => s.recordPrice);
  const recentTransfers = useGame(s => s.recentTransfers);
  const [tab, setTab] = useState<'market' | 'mine' | 'history'>('market');
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

  const marketControl = 'h-11 w-full min-w-0 rounded-xl border border-[#E9EAF0] bg-white px-3 text-sm text-[#252733] transition-colors focus:border-[#E30613] focus:outline-none focus:ring-4 focus:ring-[#E30613]/10';

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0F2] text-[#E30613]">
            <Store className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold text-[#252733] md:text-3xl">Transferências</h1>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-[#E9EAF0] bg-white p-1">
        {(['market', 'mine', 'history'] as const).map(t => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${tab === t ? 'bg-[#E30613] text-white' : 'text-[#858A98] hover:bg-[#F7F7F9] hover:text-[#252733]'}`}>
            {t === 'market' ? 'Mercado' : t === 'mine' ? 'Minhas vendas' : 'Histórico'}
          </button>
        ))}
        </div>
      </header>

      {tab === 'market' && (
        <>
          <section className="card-surface p-4 md:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#252733]">
              <SlidersHorizontal className="h-4 w-4 text-[#E30613]" />
              Filtrar anúncios
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
              <label className="relative min-w-0 sm:col-span-2 xl:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858A98]" />
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
              <button onClick={clearFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E9EAF0] bg-[#F7F7F9] px-3 text-sm font-medium text-[#252733] transition-colors hover:bg-[#FFF0F2] hover:text-[#E30613] motion-reduce:transition-none">
                <RotateCcw className="h-4 w-4" /> Limpar
              </button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="card-surface flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF0F2] text-[#E30613]"><ArrowDown className="h-4 w-4" /></span>
              <div><div className="text-xs text-[#858A98]">Preço mín</div><div className="text-lg font-bold tabular-nums text-[#252733]">{minP.toLocaleString('pt-BR')}</div></div>
            </div>
            <div className="card-surface flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F7F7F9] text-[#858A98]"><Coins className="h-4 w-4" /></span>
              <div><div className="text-xs text-[#858A98]">Preço médio</div><div className="text-lg font-bold tabular-nums text-[#252733]">{avgP.toLocaleString('pt-BR')}</div></div>
            </div>
            <div className="card-surface flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF0F2] text-[#E30613]"><ArrowUp className="h-4 w-4" /></span>
              <div><div className="text-xs text-[#858A98]">Preço máx</div><div className="text-lg font-bold tabular-nums text-[#252733]">{maxP.toLocaleString('pt-BR')}</div></div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {loading && <div className="card-surface col-span-full p-8 text-center text-sm text-[#858A98]">Carregando mercado...</div>}
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
                <article key={l.id} aria-busy={buyingAnim === l.id} className={`card-surface group flex min-w-0 flex-col overflow-hidden p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#E30613]/20 motion-reduce:transform-none motion-reduce:transition-none sm:p-4 ${buyingAnim === l.id ? 'scale-95 opacity-60' : ''}`}>
                  <div className="flex flex-1 items-center justify-center rounded-xl bg-[#F7F7F9] p-3">
                    <div className="w-full max-w-[232px]">
                      <Card card={c} size="fluid" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E9EAF0] pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF0F2] text-[#E30613]"><User className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <div className="text-xs text-[#858A98]">Vendedor</div>
                        <div className="truncate text-sm font-medium text-[#252733]" title={l.sellerName}>{l.sellerName}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-[#858A98]">Preço</div>
                      <div className="text-lg font-bold tabular-nums text-[#E30613]">{listingPrice(l).toLocaleString('pt-BR')} <span className="text-xs font-medium">moedas</span></div>
                    </div>
                  </div>
                  <button onClick={() => handleBuy(l.id)} className="btn btn-primary btn-full btn-lg mt-3 transition-transform hover:scale-[1.01] motion-reduce:transition-none">
                    Comprar
                  </button>
                </article>
              );
            })}
            {!loading && activeListings.length === 0 && <div className="card-surface col-span-full flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[#858A98]"><Store className="h-6 w-6 text-[#858A98]" />Nenhuma listagem.</div>}
          </div>
        </>
      )}

      {tab === 'mine' && (
        <div className="space-y-6">
          <section className="card-surface overflow-hidden">
            <div className="border-b border-[#E9EAF0] px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0F2] text-[#E30613]">
                  <Tag className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-[#252733]">Anunciar carta</h2>
                  <p className="mt-0.5 text-sm text-[#858A98]">Escolha uma carta da coleção e defina o preço.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-4 md:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="min-w-0 space-y-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858A98]" />
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
                        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors motion-reduce:transition-none ${selected ? 'border-[#E30613]/40 bg-[#FFF0F2]' : 'border-[#E9EAF0] bg-white hover:border-[#E30613]/20 hover:bg-[#F7F7F9]'}`}
                      >
                        <span className="flex h-[68px] w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F7F7F9]" style={{ border: `1px solid ${rarity.color}` }}>
                          {image ? <img src={image} alt="" className="h-full w-full object-cover object-top" /> : <User className="h-5 w-5 text-[#858A98]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#252733]">{c.name}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#858A98]">
                            <span>OVR {c.overall}</span>
                            <span aria-hidden="true">·</span>
                            <span>{c.position}</span>
                            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: rarity.color, color: rarity.color }}>{rarity.label}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${selected ? 'bg-[#E30613] text-white' : 'bg-[#F7F7F9] text-[#858A98]'}`}>
                          {selected ? 'Selecionada' : 'Selecionar'}
                        </span>
                      </button>
                    );
                  })}
                  {matchingSellCards.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[#E9EAF0] px-4 py-8 text-center text-sm text-[#858A98]">
                      {availableToSell.length === 0 ? 'Nenhuma carta disponível para anunciar.' : 'Nenhuma carta encontrada.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 rounded-2xl bg-[#F7F7F9] p-4 md:p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-[#252733]">Prévia do anúncio</h3>
                  <p className="mt-1 text-xs text-[#858A98]">Confira a carta antes de publicar.</p>
                </div>

                <div className="flex min-h-52 flex-col items-center justify-center gap-4 rounded-xl border border-[#E9EAF0] bg-white p-4 sm:flex-row sm:justify-start">
                  {selectedSellCard ? (
                    <>
                      <Card card={selectedSellCard} size="sm" />
                      <div className="min-w-0 text-center sm:text-left">
                        <p className="text-xs font-medium uppercase tracking-wide text-[#858A98]">Carta selecionada</p>
                        <h4 className="mt-1 break-words text-lg font-semibold text-[#252733]">{selectedSellCard.name}</h4>
                        <p className="mt-2 text-sm text-[#858A98]">{selectedSellCard.position} · Overall {selectedSellCard.overall}</p>
                        <span className="mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: RARITY_META[selectedSellCard.rarity].color, color: RARITY_META[selectedSellCard.rarity].color }}>
                          {RARITY_META[selectedSellCard.rarity].label}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-[#858A98]">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F7F7F9]"><Tag className="h-5 w-5" /></span>
                      Selecione uma carta para ver a prévia.
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <label htmlFor="listing-price" className="text-sm font-medium text-[#252733]">Preço do anúncio</label>
                  <div className="relative">
                    <Coins className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858A98]" />
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
                <h2 className="text-lg font-semibold text-[#252733]">Anúncios ativos</h2>
                <p className="mt-0.5 text-sm text-[#858A98]">Gerencie as cartas disponíveis no mercado.</p>
              </div>
              <span className="rounded-full bg-[#FFF0F2] px-3 py-1 text-xs font-semibold text-[#E30613]">{myActiveListings.length} ativos</span>
            </div>

            {myActiveListings.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {myActiveListings.map(l => {
                  const c = cardOf(l.cardUid);
                  const name = c?.name || l.cardName || 'Carta';
                  const rarity = c ? RARITY_META[c.rarity] : null;
                  const image = c?.image || l.cardImage || getPlayerImage(name);
                  return (
                    <article key={l.id} className="card-surface flex min-w-0 items-center gap-3 p-3 transition-colors hover:border-[#E30613]/20 sm:gap-4 sm:p-4">
                      <span className="flex h-24 w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F7F7F9]" style={rarity ? { border: `1px solid ${rarity.color}` } : undefined}>
                        {image ? <img src={image} alt={name} className="h-full w-full object-cover object-top" /> : <User className="h-6 w-6 text-[#858A98]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-[#252733]" title={name}>{name}</h3>
                          <span className="rounded-full bg-[#FFF0F2] px-2 py-0.5 text-[11px] font-medium text-[#E30613]">Ativo</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-[#858A98]">
                          {c ? `${c.position} · OVR ${c.overall}` : `OVR ${l.cardOverall ?? '—'}`}
                          {rarity ? ` · ${rarity.label}` : l.cardRarity ? ` · ${l.cardRarity}` : ''}
                        </p>
                        <p className="mt-2 text-base font-bold tabular-nums text-[#E30613]">
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
                <Store className="h-5 w-5 text-[#858A98]" />
                <p className="text-sm font-medium text-[#252733]">Nenhum anúncio ativo</p>
                <p className="text-xs text-[#858A98]">As cartas que você publicar aparecerão aqui.</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[#858A98]" />
                <h2 className="text-lg font-semibold text-[#252733]">Histórico de anúncios</h2>
              </div>
              <p className="mt-0.5 text-sm text-[#858A98]">Anúncios expirados, vendidos ou cancelados.</p>
            </div>
            {myListingHistory.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {myListingHistory.map(l => {
                  const c = cardOf(l.cardUid);
                  const name = c?.name || l.cardName || 'Carta';
                  const image = c?.image || l.cardImage || getPlayerImage(name);
                  return (
                    <article key={l.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#E9EAF0] bg-white p-3 opacity-90">
                      <span className="flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F7F7F9]">
                        {image ? <img src={image} alt={name} className="h-full w-full object-cover object-top" /> : <User className="h-4 w-4 text-[#858A98]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-[#252733]" title={name}>{name}</h3>
                        <p className="mt-0.5 text-xs text-[#858A98]">{listingPrice(l).toLocaleString('pt-BR')} moedas</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#F7F7F9] px-2.5 py-1 text-xs font-medium text-[#858A98]">
                        {listingStatusLabel(l, marketNow)}
                      </span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#E9EAF0] px-4 py-6 text-center text-sm text-[#858A98]">
                Nenhum anúncio no histórico.
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'history' && (
        <div className="card-surface p-4 space-y-2 max-h-96 overflow-auto">
          <h3 className="font-semibold text-[#252733]">Transferências recentes</h3>
          {recentTransfers.map((t, i) => (
            <div key={i} className="text-sm text-[#252733] py-1 border-b border-[#E9EAF0] last:border-0">
              {t.type === 'buy' ? 'Compra' : 'Venda'} · {t.cardName} · {t.price.toLocaleString('pt-BR')} moedas · {new Date(t.at).toLocaleString('pt-BR')}
            </div>
          ))}
          {recentTransfers.length === 0 && <div className="text-[#858A98] text-sm">Sem histórico.</div>}
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
