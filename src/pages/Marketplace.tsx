import { useState, useEffect } from 'react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';

export default function Marketplace() {
  const listings = useGame(s => s.listings);
  const cards = useGame(s => s.cards);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);
  const seedMarket = useGame(s => s.seedMarket);
  const buyListing = useGame(s => s.buyListing);
  const bidListing = useGame(s => s.bidListing);
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
  const [listBuyNow, setListBuyNow] = useState('');
  const [confirmBuy, setConfirmBuy] = useState<string | null>(null);
  const [buyingAnim, setBuyingAnim] = useState<string | null>(null);

  useEffect(() => { seedMarket(); }, [seedMarket]);

  const cardOf = (uid: string) => cards.find(c => c.uid === uid);

  const activeListings = listings.filter(l => l.status === 'active').filter(l => {
    const c = cardOf(l.cardUid);
    if (q && c && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (pos && c && c.position !== pos) return false;
    if (rar && c && c.rarity !== rar) return false;
    if (minPrice && l.price < Number(minPrice)) return false;
    if (maxPrice && l.price > Number(maxPrice)) return false;
    return true;
  }).sort((a, b) => {
    const ca = cardOf(a.cardUid), cb = cardOf(b.cardUid);
    if (sort === 'price_asc') return a.price - b.price;
    if (sort === 'price_desc') return b.price - a.price;
    if (sort === 'overall') return (cb?.overall ?? 0) - (ca?.overall ?? 0);
    if (sort === 'name') return (ca?.name ?? '').localeCompare(cb?.name ?? '');
    return 0;
  });

  const prices = activeListings.map(l => l.price);
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
        if (c) { recordTransfer(c.name, listing!.buyNow > 0 ? listing!.buyNow : listing!.price, 'buy'); recordPrice(c.name, listing!.buyNow > 0 ? listing!.buyNow : listing!.price); }
        toast.success('Compra realizada!');
      } else {
        toast.error('Saldo insuficiente ou indisponível.');
      }
      setBuyingAnim(null);
      setConfirmBuy(null);
    }, 900);
  };

  const handleBid = (id: string) => {
    const amt = prompt('Valor do lance:');
    if (!amt) return;
    const ok = bidListing(id, Number(amt));
    if (ok) toast.success('Lance registrado!'); else toast.error('Lance inválido ou saldo insuficiente.');
  };

  const handleList = () => {
    if (!listUid || !listPrice) { toast.error('Selecione carta e preço.'); return; }
    const id = listCard(listUid, Number(listPrice), Number(listBuyNow) || Number(listPrice) * 2, 24);
    if (id) { toast.success('Carta anunciada!'); setListUid(null); setListPrice(''); setListBuyNow(''); }
    else toast.error('Erro ao anunciar.');
  };

  const availableToSell = cards.filter(c => !listings.some(l => l.cardUid === c.uid && l.status === 'active'));

  const sel = 'bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm text-[#252733]';

  return (
    <div className="p-4 md:p-8 space-y-4">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Transferências</h1>
      <div className="flex gap-2 flex-wrap">
        {(['market', 'mine', 'targets', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${tab === t ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>
            {t === 'market' ? 'Mercado' : t === 'mine' ? 'Minhas vendas' : t === 'targets' ? 'Alvos' : 'Histórico'}
          </button>
        ))}
      </div>

      {tab === 'market' && (
        <>
          <div className="card-surface p-3 flex flex-wrap gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar jogador..." className={`flex-1 min-w-[140px] ${sel}`} />
            <select value={pos} onChange={e => setPos(e.target.value)} className={sel}>
              <option value="">Posição</option>
              {[...new Set(cards.map(c => c.position))].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={rar} onChange={e => setRar(e.target.value)} className={sel}>
              <option value="">Raridade</option>
              {['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Preço min" className="w-24 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
            <input value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Preço max" className="w-24 bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm" />
            <select value={sort} onChange={e => setSort(e.target.value)} className={sel}>
              <option value="price_asc">Preço ↑</option>
              <option value="price_desc">Preço ↓</option>
              <option value="overall">Overall</option>
              <option value="name">Nome</option>
            </select>
            <button onClick={clearFilters} className="px-3 py-2 rounded-xl bg-white border border-[#E9EAF0] text-sm font-medium">Limpar</button>
          </div>

          <div className="card-surface p-3 flex flex-wrap gap-4 text-sm text-[#252733]">
            <div>Preço mín: <span className="font-bold text-[#E30613]">{minP}</span></div>
            <div>Preço médio: <span className="font-bold text-[#E30613]">{avgP}</span></div>
            <div>Preço máx: <span className="font-bold text-[#E30613]">{maxP}</span></div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                image: l.cardImage,
                pace: l.cardOverall || 70,
                shooting: l.cardOverall || 70,
                passing: l.cardOverall || 70,
                dribbling: l.cardOverall || 70,
                defending: l.cardOverall || 70,
                physical: l.cardOverall || 70,
                reflexes: l.cardOverall || 70,
                positioning: l.cardOverall || 70,
                handling: l.cardOverall || 70,
                obtainedAt: l.createdAt,
                favorite: false,
                isNew: true,
                xp: 0,
                evoPoints: 0,
                upgrades: { pace:0, shooting:0, passing:0, dribbling:0, defending:0, physical:0 },
              } as any;
              return (
                <div key={l.id} className={`card-surface p-3 space-y-2 transition ${buyingAnim === l.id ? 'scale-95 opacity-60' : ''}`}>
                  <Card card={c} size="sm" />
                  <div className="text-xs text-[#858A98]">Vendedor: {l.sellerName}</div>
                  <div className="text-sm text-[#252733]">Preço: <span className="font-bold text-[#E30613]">{l.price}</span> · Compra imediata: <span className="font-bold">{l.buyNow}</span></div>
                  <div className="flex gap-2">
                    <button onClick={() => handleBuy(l.id)} className="flex-1 px-2 py-1.5 rounded-xl bg-[#E30613] text-white text-xs font-medium">Comprar</button>
                    <button onClick={() => handleBid(l.id)} className="flex-1 px-2 py-1.5 rounded-xl bg-white border border-[#E9EAF0] text-xs font-medium">Lance</button>
                  </div>
                </div>
              );
            })}
            {activeListings.length === 0 && <div className="text-[#858A98]">Nenhuma listagem.</div>}
          </div>
        </>
      )}

      {tab === 'mine' && (
        <div className="space-y-4">
          <div className="card-surface p-4 space-y-2">
            <h3 className="font-semibold text-[#252733]">Anunciar carta</h3>
            <select value={listUid ?? ''} onChange={e => setListUid(e.target.value || null)} className={`w-full ${sel}`}>
              <option value="">Selecione uma carta</option>
              {availableToSell.map(c => <option key={c.uid} value={c.uid}>{c.name} (OVR {c.overall})</option>)}
            </select>
            <div className="flex gap-2">
              <input value={listPrice} onChange={e => setListPrice(e.target.value)} placeholder="Preço inicial" className={`flex-1 ${sel}`} />
              <input value={listBuyNow} onChange={e => setListBuyNow(e.target.value)} placeholder="Compra imediata" className={`flex-1 ${sel}`} />
            </div>
            <button onClick={handleList} className="w-full px-3 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Publicar</button>
          </div>
          <div className="space-y-2">
            {listings.filter(l => l.sellerId === userId).map(l => {
              const c = cardOf(l.cardUid);
              return (
                <div key={l.id} className="card-surface p-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-[#252733]">{c?.name} · {l.price} moedas · {l.status}</div>
                  {l.status === 'active' && <button onClick={() => cancelListing(l.id)} className="px-2 py-1 text-xs rounded-lg text-red-600 border border-red-200">Cancelar</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'targets' && (
        <div className="card-surface p-4 text-[#858A98] text-sm">
          Cartas favoritas e lances em andamento aparecerão aqui. (Funcionalidade em desenvolvimento)
        </div>
      )}

      {tab === 'history' && (
        <div className="card-surface p-4 space-y-2 max-h-96 overflow-auto">
          <h3 className="font-semibold text-[#252733]">Transferências recentes</h3>
          {recentTransfers.map((t, i) => (
            <div key={i} className="text-sm text-[#252733] py-1 border-b border-[#E9EAF0] last:border-0">
              {t.type === 'buy' ? 'Compra' : 'Venda'} · {t.cardName} · {t.price} moedas · {new Date(t.at).toLocaleString('pt-BR')}
            </div>
          ))}
          {recentTransfers.length === 0 && <div className="text-[#858A98] text-sm">Sem histórico.</div>}
        </div>
      )}

      <ConfirmModal
        open={!!confirmBuy}
        title="Confirmar compra"
        message={confirmBuy ? `Comprar por ${listings.find(l => l.id === confirmBuy)?.buyNow || listings.find(l => l.id === confirmBuy)?.price} moedas?` : ''}
        onConfirm={confirmBuyNow}
        onCancel={() => setConfirmBuy(null)}
      />
    </div>
  );
}
