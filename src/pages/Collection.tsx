import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import { Lock } from 'lucide-react';
import bgWhite from '../imagens/background/backgroundbranco.png';
import Card from '../components/Card';
import type { PlayerCard, Rarity } from '../types';
import { RARITY_META } from '../types';
import { allTemplates } from '../data/players';

export default function Collection() {
  const cards = useGame(s => s.cards);
  const markSeen = useGame(s => s.markSeen);
  const convertDuplicates = useGame(s => s.convertDuplicates);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [rar, setRar] = useState('');
  const [club, setClub] = useState('');
  const [sort, setSort] = useState('overall');
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);
  const [album, setAlbum] = useState(false);
  const navigate = useNavigate();

  const deferredQ = useDeferredValue(q);
  const deferredPos = useDeferredValue(pos);
  const deferredRar = useDeferredValue(rar);
  const deferredClub = useDeferredValue(club);
  const deferredSort = useDeferredValue(sort);

  const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'];
  const rankOf = (r: Rarity) => RARITY_ORDER.indexOf(r);

  const filtered = useMemo(() => {
    const query = deferredQ.trim().toLowerCase();
    return [...cards].filter(c => {
      if (query && !c.name.toLowerCase().includes(query)) return false;
      if (deferredPos && c.position !== deferredPos) return false;
      if (deferredRar && c.rarity !== deferredRar) return false;
      if (deferredClub && c.club !== deferredClub) return false;
      return true;
    }).sort((a, b) => {
      if (deferredSort === 'overall') return b.overall - a.overall || rankOf(b.rarity) - rankOf(a.rarity) || a.name.localeCompare(b.name);
      if (deferredSort === 'rarity') return rankOf(b.rarity) - rankOf(a.rarity) || b.overall - a.overall || a.name.localeCompare(b.name);
      if (deferredSort === 'name') return a.name.localeCompare(b.name) || b.overall - a.overall;
      return b.obtainedAt - a.obtainedAt;
    });
  }, [cards, deferredQ, deferredPos, deferredRar, deferredClub, deferredSort]);

  // "únicas" = nomes distintos (mesmo critério do "converter duplicatas")
  const unique = useMemo(() => new Set(cards.map(c => c.name)).size, [cards]);
  const clubs = useMemo(() => [...new Set(cards.map(c => c.club).filter(Boolean))].sort(), [cards]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), [filtered.length]);
  useEffect(() => { setPage(1); }, [deferredQ, deferredPos, deferredRar, deferredClub, deferredSort]);
  // se o total de páginas diminuir (ex.: depois de converter duplicatas), volta para uma página válida
  useEffect(() => { setPage(p => Math.min(p, totalPages)); }, [totalPages]);

  // melhor cópia de cada jogador para o álbum
  const bestByName = useMemo(() => {
    const byName = new Map<string, PlayerCard>();
    for (const c of cards) {
      const cur = byName.get(c.name);
      if (!cur || rankOf(c.rarity) > rankOf(cur.rarity) || (rankOf(c.rarity) === rankOf(cur.rarity) && c.overall > cur.overall)) byName.set(c.name, c);
    }
    return byName;
  }, [cards]);

  const pageCards = useMemo(() => {
    const start = (Math.min(page, totalPages) - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page, totalPages]);

  const openCard = (c: PlayerCard) => {
    if (c.isNew) markSeen([c.uid]);
    navigate(`/card/${c.uid}`);
  };

  const sel = 'bg-white border border-[#E9EAF0] rounded-xl px-3 py-2 text-sm text-[#252733]';

  return (
    <div className="p-4 md:p-8 space-y-4 min-h-screen" style={{ backgroundImage: `url(${bgWhite})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'fixed' }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Minhas cartas</h1>
        <div className="flex gap-2">
          <button onClick={() => setAlbum(a => !a)} className={`px-3 py-1.5 rounded-xl text-sm font-medium ${album ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>
            {album ? 'Ver coleção' : 'Ver álbum'}
          </button>
          <button onClick={async () => { const n = await convertDuplicates(); if (n > 0) toast.success(`${n} duplicatas convertidas em moedas.`); else toast.info('Nenhuma duplicata para converter (cartas favoritas, no elenco ou à venda são mantidas).'); }} className="px-3 py-1.5 rounded-xl text-sm font-medium bg-white border border-[#E9EAF0] text-[#858A98]">
            Converter duplicatas
          </button>
          <div className="text-sm text-[#858A98] self-center">{cards.length} cartas · {unique} únicas · {cards.length - unique} duplicadas</div>
        </div>
      </div>

      <div className="card-surface p-3 flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome..." className={`flex-1 min-w-[160px] ${sel}`} />
        <select value={pos} onChange={e => setPos(e.target.value)} className={sel}>
          <option value="">Posição</option>
          {['GK', 'Fixo', 'Ala', 'Pivo'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={rar} onChange={e => setRar(e.target.value)} className={sel}>
          <option value="">Raridade</option>
          {RARITY_ORDER.map(r => <option key={r} value={r}>{RARITY_META[r].label}</option>)}
        </select>
        <select value={club} onChange={e => setClub(e.target.value)} className={sel}>
          <option value="">Clube</option>
          {clubs.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} className={sel}>
          <option value="overall">Overall</option>
          <option value="rarity">Raridade</option>
          <option value="name">Nome</option>
          <option value="date">Data</option>
        </select>
      </div>

      {album ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {allTemplates().map(t => {
            const owned = bestByName.get(t.name);
            return owned ? (
              <Card key={t.name} card={owned} size="sm" onClick={() => openCard(owned)} />
            ) : (
              <div key={t.name} className="w-32 h-44 rounded-2xl border-2 border-dashed border-[#E9EAF0] bg-white/60 flex flex-col items-center justify-center text-xs text-[#858A98]">
                <div className="text-2xl opacity-30"><Lock className="w-6 h-6" /></div>
                <div className="mt-1">{t.name}</div>
              </div>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-[#858A98] py-12">Nenhuma carta encontrada.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {pageCards.map(c => (
              <Card key={c.uid} card={c} size="sm" onClick={() => openCard(c)} isNew={c.isNew} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-center gap-1 mt-4 flex-wrap items-center">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded-lg text-sm font-medium bg-white border border-[#E9EAF0] text-[#858A98] disabled:opacity-40">‹</button>
              {(() => {
                const pages: (number | string)[] = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (page > 3) pages.push('...');
                  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                  if (page < totalPages - 2) pages.push('...');
                  pages.push(totalPages);
                }
                return pages.map((p, i) => (
                  typeof p === 'number' ? (
                    <button key={i} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium ${p === page ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>
                      {p}
                    </button>
                  ) : (
                    <span key={i} className="px-1 text-[#858A98]">…</span>
                  )
                ));
              })()}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded-lg text-sm font-medium bg-white border border-[#E9EAF0] text-[#858A98] disabled:opacity-40">›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}