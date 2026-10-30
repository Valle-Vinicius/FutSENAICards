import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import { Lock } from 'lucide-react';
import bgWhite from '../imagens/background/backgroundbranco.png';
import Card from '../components/Card';
import type { PlayerCard } from '../types';
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

  const filtered = cards.filter(c => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (pos && c.position !== pos) return false;
    if (rar && c.rarity !== rar) return false;
    if (club && c.club !== club) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'overall') return b.overall - a.overall;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return b.obtainedAt - a.obtainedAt;
  });

  const unique = new Set(cards.map(c => c.playerId.split('-')[0])).size;
  const clubs = [...new Set(cards.map(c => c.club))];
  useEffect(() => { setPage(1); }, [q, pos, rar, club, sort]);

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
            {album ? 'Álbum' : 'Coleção'}
          </button>
          <button onClick={async () => { const n = await convertDuplicates(); toast.alert(n > 0 ? `${n} duplicatas convertidas em moedas.` : 'Sem duplicatas.'); }} className="px-3 py-1.5 rounded-xl text-sm font-medium bg-white border border-[#E9EAF0] text-[#858A98]">
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
          {['common', 'uncommon', 'rare', 'epic', 'legendary', 'icon'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={club} onChange={e => setClub(e.target.value)} className={sel}>
          <option value="">Clube</option>
          {clubs.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} className={sel}>
          <option value="overall">Overall</option>
          <option value="name">Nome</option>
          <option value="date">Data</option>
        </select>
      </div>

      {album ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {allTemplates().map(t => {
            const owned = cards.find(c => c.name === t.name);
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
            {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(c => (
              <Card key={c.uid} card={c} size="sm" onClick={() => openCard(c)} isNew={c.isNew} />
            ))}
          </div>
          {Math.ceil(filtered.length / PAGE_SIZE) > 1 && (
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              {Array.from({ length: Math.ceil(filtered.length / PAGE_SIZE) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium ${p === page ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E9EAF0] text-[#858A98]'}`}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
