import { Link } from 'react-router-dom';
import { NEWS } from '../data/news';
import { ExternalLink } from 'lucide-react';
import { Coins, Layers, Sparkles, Trophy, Package } from 'lucide-react';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import Card from '../components/Card';

export default function Home() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const cards = useGame(s => s.cards);
  const claimDaily = useGame(s => s.claimDaily);
  const transactions = useGame(s => s.transactions);
  const rarest = [...cards].sort((a,b) => b.overall - a.overall)[0];
  const recent = cards.slice(0, 6);
  const lvlXp = (level-1)*500; const nextXp = level*500; const pct = Math.min(100, ((xp-lvlXp)/(nextXp-lvlXp))*100);
  const rareCount = cards.filter(c => ['rare','epic','legendary','icon'].includes(c.rarity)).length;

  const handleDaily = () => {
    const r = claimDaily();
    if (r.ok) toast.alert(`Recompensa diária: +${r.amount} moedas`);
    else toast.alert('Recompensa diária já coletada. Volte mais tarde.');
  };

  const indicators = [
    { label: 'Moedas disponíveis', value: coins.toLocaleString('pt-BR'), icon: Coins },
    { label: 'Cartas coletadas', value: String(cards.length), icon: Layers },
    { label: 'Cartas raras', value: String(rareCount), icon: Sparkles },
    { label: 'Nível do jogador', value: String(level), icon: Trophy },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-semibold text-[#252733]">Sua coleção começa aqui.</h1>
          <p className="text-[#858A98] mt-1">Abra pacotes, descubra craques e monte seu time.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDaily} className="px-4 py-2 rounded-xl border border-[#E9EAF0] bg-white text-[#252733] font-medium hover:bg-[#F7F7F9]">
            Recompensa diária
          </button>
          <Link to="/packs" className="px-5 py-2 rounded-xl bg-[#E30613] text-white font-semibold hover:brightness-110">
            Abrir pacotes
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {indicators.map(ind => (
          <div key={ind.label} className="card-surface p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFF0F2] flex items-center justify-center text-[#E30613]"><ind.icon className="w-5 h-5" /></div>
            <div>
              <div className="text-xs text-[#858A98]">{ind.label}</div>
              <div className="text-xl font-bold text-[#252733]">{ind.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card-surface p-4">
        <div className="flex justify-between text-sm mb-1"><span className="font-medium">Nível {level}</span><span className="text-[#858A98]">{xp}/{nextXp} XP</span></div>
        <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
          <div className="h-full bg-[#E30613] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {rarest && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-[#252733]">Cartas em destaque</h2>
          <div className="card-surface p-4 flex justify-center">
            <Card card={rarest} size="md" />
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-[#252733]">Radar do SENAI</h2>
            <p className="text-xs text-[#858A98]">As últimas notícias, polêmicas e acontecimentos do universo FutSenai.</p>
          </div>
          <a href="https://pietro-guedes.github.io/FutSenai-Jornal/" target="_blank" rel="noopener noreferrer" className="text-sm text-[#E30613] font-medium hover:underline flex items-center gap-1">
            Ver todas as notícias <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {NEWS.map(n => (
            <div key={n.id} className="card-surface p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${n.category === 'BOMBA' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>{n.category}</span>
                <span className="text-[10px] text-[#858A98]">{n.date}</span>
              </div>
              <div className="text-sm font-semibold text-[#252733] line-clamp-2">{n.title}</div>
              <div className="text-xs text-[#858A98] line-clamp-3">{n.summary}</div>
              <div className="text-[10px] text-[#858A98]">Turma: {n.turma} · Fonte: Jornal FutSenai</div>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#E30613] font-medium hover:underline">
                Ler matéria original <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 text-[#252733]">Pacotes disponíveis</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {useGame.getState().packConfigs.filter(p=>p.unlocked).slice(0,3).map(p => (
            <Link key={p.id} to="/packs" className="card-surface p-4 hover:border-[#E30613]/40 transition">
              <div className="text-3xl mb-2"><Package className="w-8 h-8" /></div>
              <div className="font-semibold text-[#252733]">{p.name}</div>
              <div className="text-xs text-[#858A98] mt-1">{p.cards} cartas · {p.price === 0 ? 'Evento' : p.price.toLocaleString('pt-BR') + ' moedas'}</div>
            </Link>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-[#252733]">Últimas cartas conquistadas</h2>
          <div className="card-surface p-4 flex gap-3 overflow-x-auto pb-2">
            {recent.map(c => <Card key={c.uid} card={c} size="sm" />)}
          </div>
        </section>
      )}

      {transactions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-[#252733]">Histórico de moedas</h2>
          <div className="card-surface p-4 space-y-1 max-h-40 overflow-auto text-xs">
            {transactions.slice(0, 8).map(t => (
              <div key={t.id} className="flex justify-between">
                <span className="text-[#858A98]">{t.reason}</span>
                <span className={t.type === 'earn' ? 'text-[#E30613] font-semibold' : 'text-[#252733]'}>{t.type === 'earn' ? '+' : '-'}{t.amount}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
