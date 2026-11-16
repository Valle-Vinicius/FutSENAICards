import { useState, useEffect } from 'react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import { ArrowDown, ArrowUp, Coins, RotateCcw, Search, SlidersHorizontal, Store, User } from 'lucide-react';
import { getPlayerImage } from '../data/players';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import { getListings, toGameListing, type ListingRecord } from '../lib/services/marketplace';

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
  const [tab, setTab] = useState<'market' | 'mine' | 'targets' | 'history'>('market');
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

  const sel = 'bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm text-[#252733]';
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
        {(['market', 'mine', 'targets', 'history'] as const).map(t => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${tab === t ? 'bg-[#E30613] text-white' : 'text-[#858A98] hover:bg-[#F7F7F9] hover:text-[#252733]'}`}>
            {t === 'market' ? 'Mercado' : t === 'mine' ? 'Minhas vendas' : t === 'targets' ? 'Alvos' : 'Histórico'}
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
        <div className="space-y-4">
          <div className="card-surface p-4 space-y-2">
            <h3 className="font-semibold text-[#252733]">Anunciar carta</h3>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Buscar carta..." className={`w-full ${sel}`} />
                <div className="max-h-48 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {availableToSell.filter(c => c.name.toLowerCase().includes(listSearch.toLowerCase())).sort((a, b) => b.overall - a.overall).map(c => (
                    <button key={c.uid} onClick={() => setListUid(c.uid)} className={`w-full text-left px-2 py-1 rounded-lg text-sm ${listUid === c.uid ? 'bg-[#FFF0F2] text-[#E30613]' : 'hover:bg-[#F7F7F9] text-[#252733]'}`}>
                      {c.name} (OVR {c.overall})
                    </button>
                  ))}
                  {availableToSell.filter(c => c.name.toLowerCase().includes(listSearch.toLowerCase())).length === 0 && (
                    <div className="text-xs text-[#858A98] px-2 py-1">Nenhuma carta encontrada.</div>
                  )}
                </div>
              </div>
              <div className="w-32 shrink-0 flex items-center justify-center">
                {listUid && availableToSell.find(c => c.uid === listUid) ? (
                  <Card card={availableToSell.find(c => c.uid === listUid)!} size="sm" />
                ) : (
                  <div className="text-xs text-[#858A98] text-center">Selecione uma carta</div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <input value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="Preço da carta" className={`flex-1 ${sel}`} />
            </div>
            <button onClick={handleList} disabled={creatingListing} className="btn btn-primary btn-full">{creatingListing ? 'Publicando...' : 'Publicar'}</button>
          </div>
          <div className="space-y-2">
            {listings.filter(l => l.sellerId === userId).map(l => {
              const c = cardOf(l.cardUid);
              const expired = l.status === 'active' && l.expiresAt <= marketNow;
              return (
                <div key={l.id} className="card-surface p-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-[#252733]">{c?.name || l.cardName || 'Carta'} · {listingPrice(l).toLocaleString('pt-BR')} moedas · {expired ? 'expirado' : l.status}</div>
                  {l.status === 'active' && !expired && <button disabled={cancellingListingId !== null} onClick={async () => {
                    if (cancellingListingId) return;
                    setCancellingListingId(l.id);
                    const cancelled = await cancelListing(l.id);
                    if (cancelled) toast.success('Anúncio cancelado.');
                    else toast.error('O anúncio não está mais ativo ou não foi possível cancelá-lo.');
                    setCancellingListingId(null);
                  }} className="btn btn-danger btn-sm">{cancellingListingId === l.id ? 'Cancelando...' : 'Cancelar'}</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'targets' && (
        <div className="card-surface p-4 text-[#858A98] text-sm">
          Cartas favoritas aparecerão aqui. (Funcionalidade em desenvolvimento)
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
