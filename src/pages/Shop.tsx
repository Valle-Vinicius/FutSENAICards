import { useEffect, useState } from 'react';
import { useGame } from '../store/useGame';

export default function Shop() {
  const events = useGame(s => s.events);
  const coins = useGame(s => s.coins);
  const addCoins = useGame(s => s.addCoins);
  const [now, setNow] = useState(Date.now());
  const [buying, setBuying] = useState(false);
  const [bought, setBought] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const handleBuyCoins = () => {
    setBuying(true);
    setTimeout(() => {
      addCoins(10000, 'Pacote de moedas (demo)');
      setBuying(false);
      setBought(true);
      setTimeout(() => setBought(false), 3000);
    }, 1800);
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
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Loja e eventos</h1>
      <div className="card-surface p-4 text-sm text-[#252733]">
        Saldo atual: <span className="font-bold text-[#E30613]">{coins.toLocaleString('pt-BR')} moedas</span>
      </div>

      <div className="card-surface p-4 space-y-3">
        <h2 className="text-lg font-semibold text-[#252733]">Pacote de moedas (demo)</h2>
        <p className="text-sm text-[#858A98]">Receba 10.000 moedas virtuais para testar a loja. Sem pagamento real.</p>
        <button
          onClick={handleBuyCoins}
          disabled={buying}
          className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium disabled:opacity-60"
        >
          {buying ? 'Processando...' : bought ? 'Concluído! +10.000' : 'Comprar 10.000 moedas (demo)'}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 text-[#252733]">Eventos temporários</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {events.map(e => (
            <div key={e.id} className="card-surface p-4">
              <div className="font-medium text-[#252733]">{e.name}</div>
              <div className="text-xs text-[#858A98] mt-1">Recompensa: {e.reward}</div>
              <div className="mt-2 text-sm text-[#252733]">
                Termina em: <span className="font-mono text-[#E30613]">{fmt(e.endsAt - now)}</span>
              </div>
            </div>
          ))}
          {events.length === 0 && <div className="text-[#858A98]">Nenhum evento ativo.</div>}
        </div>
      </div>

      <div className="card-surface p-4 text-xs text-[#858A98]">
        Esta versão utiliza moedas virtuais de demonstração. Não há compras com dinheiro real.
      </div>
    </div>
  );
}
