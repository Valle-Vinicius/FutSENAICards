import { Link } from 'react-router-dom';
import { useGame } from '../store/useGame';

export default function Packs() {
  const packs = useGame(s => s.packConfigs);
  const coins = useGame(s => s.coins);
  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Loja de pacotes</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {packs.map(p => (
          <div key={p.id} className="card-surface p-5 flex flex-col gap-3">
            <div className="text-center">
              <div className="text-5xl mb-2">📦</div>
              <div className="font-semibold text-lg text-[#252733]">{p.name}</div>
              <div className="text-xs text-[#858A98] mt-1">{p.description}</div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between"><span className="text-[#858A98]">Cartas</span><span className="font-medium text-[#252733]">{p.cards}</span></div>
              <div className="flex justify-between"><span className="text-[#858A98]">Preço</span><span className="font-bold text-[#E30613]">{p.price === 0 ? 'Evento' : p.price.toLocaleString('pt-BR') + ' moedas'}</span></div>
            </div>
            <div className="text-xs space-y-1 text-[#858A98]">
              <div className="font-medium text-[#252733]">Probabilidades:</div>
              {Object.entries(p.probabilities).map(([r, v]) => (
                <div key={r} className="flex justify-between">
                  <span className="capitalize">{r}</span>
                  <span>{(v*100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            {!p.unlocked ? (
              <div className="text-center text-xs text-[#858A98] py-2">Bloqueado (complete missões)</div>
            ) : (
              <Link to={`/open/${p.id}`}
                className={`text-center py-2 rounded-xl font-semibold ${coins >= p.price ? 'bg-[#E30613] text-white hover:brightness-110' : 'bg-[#E9EAF0] text-[#858A98] pointer-events-none'}`}>
                {coins >= p.price ? 'ABRIR' : 'Saldo insuficiente'}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
