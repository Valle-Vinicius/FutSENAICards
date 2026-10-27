import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import { NEWS } from '../data/news';
import { ExternalLink, Calendar, Trophy, Users, Package, Target, Store } from 'lucide-react';
import Card from '../components/Card';
import enzoImg from '../imagens/enzothomas.jpg';

export default function Home() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const cards = useGame(s => s.cards);
  const missions = useGame(s => s.missions);
  const events = useGame(s => s.events);
  const claimDaily = useGame(s => s.claimDaily);
  const rarest = [...cards].sort((a, b) => b.overall - a.overall).slice(0, 5);
  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const pct = Math.min(100, ((xp - lvlXp) / (nextXp - lvlXp)) * 100);
  const event = events[0];
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!event) return;
    const tick = () => {
      const diff = event.endsAt - Date.now();
      if (diff <= 0) { setCountdown('Encerrado'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${d}d ${h}h ${m}m`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [event]);

  const handleDaily = () => {
    const r = claimDaily();
    if (r.ok) toast.alert(`Recompensa diária: +${r.amount} moedas`);
    else toast.alert('Recompensa diária já coletada. Volte mais tarde.');
  };

  const packConfigs = useGame(s => s.packConfigs);
  const packs = packConfigs.filter(p => p.unlocked).slice(0, 1);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Banner principal */}
      <div className="card-surface overflow-hidden relative flex flex-col md:flex-row items-center gap-4 p-6 bg-gradient-to-r from-[#FFF0F2] to-white">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-20 h-20 rounded-full bg-[#E30613] text-white flex items-center justify-center text-2xl font-bold shrink-0">
            {level}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold text-[#252733]">Jogador Futsenai</div>
            <div className="text-sm text-[#858A98]">Nível {level}</div>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-[#858A98] mb-1"><span>{xp} XP</span><span>{nextXp} XP</span></div>
              <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
                <div className="h-full bg-[#E30613] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="hidden md:flex items-center justify-center w-48 h-32">
          <img src={enzoImg} alt="Jogador" className="h-full object-contain" />
        </div>
        <div className="absolute bottom-4 right-6 text-right hidden md:block">
          <div className="text-sm font-semibold text-[#252733]">Colecione, monte seu time e mostre o seu talento!</div>
        </div>
        <div className="w-full flex justify-around mt-4 md:mt-0 pt-4 border-t border-[#E9EAF0] md:border-0">
          <button onClick={handleDaily} className="px-4 py-2 rounded-xl bg-[#E30613] text-white text-xs font-bold">Recompensa diária</button>
          <div className="text-center">
            <div className="text-xs text-[#858A98]">Moedas</div>
            <div className="font-bold text-[#252733]">{coins.toLocaleString('pt-BR')}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[#858A98]">XP</div>
            <div className="font-bold text-[#252733]">{xp}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[#858A98]">Cartas</div>
            <div className="font-bold text-[#252733]">{cards.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna central */}
        <div className="lg:col-span-2 space-y-6">
          {/* Últimas notícias */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#252733]">Últimas notícias</h2>
              <a href="https://pietro-guedes.github.io/FutSenai-Jornal/" target="_blank" rel="noopener noreferrer" className="text-sm text-[#E30613] font-medium hover:underline flex items-center gap-1">
                Ver todas <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Notícia principal */}
              <div className="card-surface p-4 space-y-2">
                <div className="relative">
                  {NEWS[0].image && <img src={NEWS[0].image} alt={NEWS[0].title} className="w-full h-40 object-cover rounded-xl" />}
                  <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E30613] text-white">DESTAQUE</span>
                </div>
                <div className="text-sm font-semibold text-[#252733] line-clamp-2">{NEWS[0].title}</div>
                <div className="text-xs text-[#858A98] line-clamp-3">{NEWS[0].summary}</div>
                <a href={NEWS[0].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#E30613] font-medium hover:underline">
                  Ler matéria completa <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {/* Notícias secundárias */}
              <div className="space-y-3">
                {NEWS.slice(1).map(n => (
                  <div key={n.id} className="card-surface p-3 flex gap-3">
                    {n.image && <img src={n.image} alt={n.title} className="w-16 h-16 object-cover rounded-lg shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#252733] line-clamp-2">{n.title}</div>
                      <div className="text-[10px] text-[#858A98] mt-1">{n.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Cartas em destaque */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#252733]">Seus cards em destaque</h2>
              <Link to="/collection" className="text-sm text-[#E30613] font-medium hover:underline">Ver coleção</Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {rarest.map(c => (
                <Link key={c.uid} to={`/card/${c.uid}`} className="shrink-0">
                  <Card card={c} size="sm" />
                </Link>
              ))}
              {rarest.length === 0 && <div className="text-[#858A98] text-sm">Nenhuma carta ainda.</div>}
            </div>
          </section>

          {/* Cartões de acesso rápido */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-[#252733]">Acesso rápido</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link to="/market" className="card-surface p-4 text-center hover:border-[#E30613]/40 transition">
                <Store className="w-8 h-8 mx-auto text-[#E30613] mb-2" />
                <div className="text-sm font-semibold text-[#252733]">Mercado</div>
                <div className="text-xs text-[#858A98] mt-1">Compre e venda cartas</div>
                <div className="mt-2 text-xs text-[#E30613] font-medium">Acessar</div>
              </Link>
              <Link to="/sbc" className="card-surface p-4 text-center hover:border-[#E30613]/40 transition">
                <Target className="w-8 h-8 mx-auto text-[#E30613] mb-2" />
                <div className="text-sm font-semibold text-[#252733]">SBC</div>
                <div className="text-xs text-[#858A98] mt-1">Desafios e recompensas</div>
                <div className="mt-2 text-xs text-[#E30613] font-medium">Acessar</div>
              </Link>
              <Link to="/squad" className="card-surface p-4 text-center hover:border-[#E30613]/40 transition">
                <Users className="w-8 h-8 mx-auto text-[#E30613] mb-2" />
                <div className="text-sm font-semibold text-[#252733]">Elenco</div>
                <div className="text-xs text-[#858A98] mt-1">Monte seu time</div>
                <div className="mt-2 text-xs text-[#E30613] font-medium">Acessar</div>
              </Link>
              <Link to="/packs" className="card-surface p-4 text-center hover:border-[#E30613]/40 transition">
                <Package className="w-8 h-8 mx-auto text-[#E30613] mb-2" />
                <div className="text-sm font-semibold text-[#252733]">Packs</div>
                <div className="text-xs text-[#858A98] mt-1">Abra pacotes</div>
                <div className="mt-2 text-xs text-[#E30613] font-medium">Acessar</div>
              </Link>
            </div>
          </section>
        </div>

        {/* Coluna direita */}
        <div className="space-y-6">
          {/* Próximo evento */}
          {event && (
            <div className="card-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#252733]">Próximo Evento</h3>
                <Calendar className="w-5 h-5 text-[#E30613]" />
              </div>
              <div className="text-sm font-bold text-[#252733]">{event.name}</div>
              <div className="text-xs text-[#858A98]">{event.reward}</div>
              <div className="text-xs text-[#E30613] font-bold">{countdown}</div>
              <Trophy className="w-12 h-12 mx-auto text-[#f5c542]" />
              <button className="w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold">Ver detalhes</button>
            </div>
          )}

          {/* Missões em andamento */}
          <div className="card-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#252733]">Missões em andamento</h3>
              <Link to="/missions" className="text-xs text-[#E30613] font-medium hover:underline">Ver todas</Link>
            </div>
            {missions.filter(m => !m.claimed).slice(0, 4).map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FFF0F2] flex items-center justify-center text-[#E30613] text-xs font-bold shrink-0">
                  {m.completed ? '✓' : Math.round((m.progress / m.target) * 100) + '%'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#252733] truncate">{m.title}</div>
                  <div className="h-1.5 bg-[#E9EAF0] rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-[#E30613]" style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }} />
                  </div>
                  <div className="text-[10px] text-[#858A98] mt-0.5">{m.progress}/{m.target}</div>
                </div>
              </div>
            ))}
            {missions.filter(m => !m.claimed).length === 0 && <div className="text-xs text-[#858A98]">Todas as missões concluídas!</div>}
          </div>

          {/* Loja */}
          <div className="card-surface p-4 space-y-3">
            <h3 className="font-semibold text-[#252733]">Loja</h3>
            {packs.map(p => (
              <div key={p.id} className="space-y-2">
                <div className="text-sm font-semibold text-[#252733]">{p.name}</div>
                <div className="text-xs text-[#858A98]">{p.description}</div>
                <div className="text-xs text-[#858A98]">{p.cards} cartas · {p.price.toLocaleString('pt-BR')} moedas</div>
                <Link to="/packs" className="block w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold text-center">Comprar</Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <footer className="card-surface p-4 text-center space-y-2">
        <div className="text-sm font-bold text-[#252733]">FutSENAI Cards</div>
        <div className="text-xs text-[#858A98]">Colecione, monte seu time e mostre o seu talento!</div>
        <div className="flex justify-center gap-4 text-xs text-[#858A98]">
          <Link to="/settings" className="hover:text-[#E30613]">Termos de uso</Link>
          <Link to="/settings" className="hover:text-[#E30613]">Privacidade</Link>
          <Link to="/settings" className="hover:text-[#E30613]">Suporte</Link>
        </div>
      </footer>
    </div>
  );
}
