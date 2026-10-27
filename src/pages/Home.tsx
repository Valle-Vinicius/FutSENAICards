import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../store/useGame';
import { toast } from '../store/toast';
import { NEWS } from '../data/news';
import { ExternalLink, Calendar, Trophy, Users, Package, Target, Store } from 'lucide-react';
import Card from '../components/Card';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/profile';

export default function Home() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const cards = useGame(s => s.cards);
  const missions = useGame(s => s.missions);
  const events = useGame(s => s.events);
  const claimDaily = useGame(s => s.claimDaily);
  const packConfigs = useGame(s => s.packConfigs);
  const rarest = [...cards].sort((a, b) => b.overall - a.overall).slice(0, 5);
  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const pct = Math.min(100, ((xp - lvlXp) / (nextXp - lvlXp)) * 100);
  const event = events[0];
  const [countdown, setCountdown] = useState('');
  const [userName, setUserName] = useState('Jogador');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id;
      if (uid) {
        const p = await getProfile(uid);
        if (p?.name) setUserName(p.name);
      }
    });
  }, []);
  const packs = packConfigs.filter(p => p.unlocked).slice(0, 1);

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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="card-surface overflow-hidden flex flex-col md:flex-row items-center gap-4 p-4 bg-gradient-to-r from-[#FFF0F2] to-white">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-14 h-14 rounded-full bg-[#E30613] text-white flex items-center justify-center text-lg font-bold shrink-0">
            {level}
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-[#252733] truncate">{userName}</div>
            <div className="text-[10px] text-[#858A98]">Nível {level}</div>
            <div className="mt-1 w-36">
              <div className="flex justify-between text-[9px] text-[#858A98] mb-0.5"><span>{xp} XP</span><span>{nextXp} XP</span></div>
              <div className="h-1.5 bg-[#E9EAF0] rounded-full overflow-hidden">
                <div className="h-full bg-[#E30613] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="w-full md:w-auto flex justify-around md:justify-end md:gap-6 pt-3 md:pt-0 border-t border-[#E9EAF0] md:border-0">
          <div className="text-center">
            <div className="text-[10px] text-[#858A98]">Moedas</div>
            <div className="font-bold text-[#252733] text-sm">{coins.toLocaleString('pt-BR')}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#858A98]">XP</div>
            <div className="font-bold text-[#252733] text-sm">{xp}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[#858A98]">Cartas</div>
            <div className="font-bold text-[#252733] text-sm">{cards.length}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleDaily} className="px-3 py-1.5 rounded-xl bg-[#E30613] text-white text-xs font-bold">Recompensa diária</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Coluna central */}
        <div className="lg:col-span-4 space-y-4">
          {/* Últimas notícias */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-[#252733]">Últimas notícias</h2>
              <a href="https://pietro-guedes.github.io/FutSenai-Jornal/" target="_blank" rel="noopener noreferrer" className="text-sm text-[#E30613] font-medium hover:underline flex items-center gap-1">
                Ver todas <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-3">
              {/* Notícia principal (55%) */}
              <div className="card-surface p-3 space-y-2 h-full flex flex-col">
                <div className="relative shrink-0">
                  {NEWS[0].image && <img src={NEWS[0].image} alt={NEWS[0].title} className="w-full h-32 object-cover rounded-xl" />}
                  <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E30613] text-white">DESTAQUE</span>
                </div>
                <div className="text-sm font-semibold text-[#252733] line-clamp-2">{NEWS[0].title}</div>
                <div className="text-xs text-[#858A98] line-clamp-2 flex-1">{NEWS[0].summary}</div>
                <div className="text-[10px] text-[#858A98]">Turma: {NEWS[0].turma} · {NEWS[0].date}</div>
                <a href={NEWS[0].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#E30613] font-medium hover:underline shrink-0">
                  Ler matéria completa <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {/* Notícias secundárias (45%) */}
              <div className="grid grid-rows-2 gap-3 h-full">
                {NEWS.slice(1).map(n => (
                  <div key={n.id} className="card-surface p-3 flex gap-2 min-w-0">
                    {n.image && <img src={n.image} alt={n.title} className="w-16 h-full object-cover rounded-lg shrink-0" />}
                    <div className="min-w-0 flex flex-col justify-between">
                      <div className="text-xs font-semibold text-[#252733] line-clamp-2">{n.title}</div>
                      <div className="text-[10px] text-[#858A98] mt-1">{n.date} · {n.turma}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Cartas em destaque */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-[#252733]">Seus cards em destaque</h2>
              <Link to="/collection" className="text-sm text-[#E30613] font-medium hover:underline">Ver coleção</Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {rarest.map(c => (
                <Link key={c.uid} to={`/card/${c.uid}`} className="shrink-0">
                  <Card card={c} size="sm" />
                </Link>
              ))}
              {rarest.length === 0 && <div className="text-[#858A98] text-sm">Nenhuma carta ainda.</div>}
            </div>
          </section>

          {/* Acesso rápido */}
          <section>
            <h2 className="text-lg font-semibold mb-2 text-[#252733]">Acesso rápido</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Link to="/market" className="card-surface p-3 text-center hover:border-[#E30613]/40 transition">
                <Store className="w-6 h-6 mx-auto text-[#E30613] mb-1" />
                <div className="text-xs font-semibold text-[#252733]">Mercado</div>
                <div className="text-[10px] text-[#858A98]">Compre e venda</div>
              </Link>
              <Link to="/sbc" className="card-surface p-3 text-center hover:border-[#E30613]/40 transition">
                <Target className="w-6 h-6 mx-auto text-[#E30613] mb-1" />
                <div className="text-xs font-semibold text-[#252733]">SBC</div>
                <div className="text-[10px] text-[#858A98]">Desafios</div>
              </Link>
              <Link to="/squad" className="card-surface p-3 text-center hover:border-[#E30613]/40 transition">
                <Users className="w-6 h-6 mx-auto text-[#E30613] mb-1" />
                <div className="text-xs font-semibold text-[#252733]">Elenco</div>
                <div className="text-[10px] text-[#858A98]">Monte seu time</div>
              </Link>
              <Link to="/packs" className="card-surface p-3 text-center hover:border-[#E30613]/40 transition">
                <Package className="w-6 h-6 mx-auto text-[#E30613] mb-1" />
                <div className="text-xs font-semibold text-[#252733]">Packs</div>
                <div className="text-[10px] text-[#858A98]">Abra pacotes</div>
              </Link>
            </div>
          </section>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          {/* Próximo evento */}
          {event && (
            <div className="card-surface p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#E30613]" />
                <h3 className="font-semibold text-[#252733]">Próximo Evento</h3>
              </div>
              <div className="flex items-center gap-3">
                <Trophy className="w-10 h-10 text-[#f5c542] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#252733] truncate">{event.name}</div>
                  <div className="text-xs text-[#858A98]">{event.reward}</div>
                  <div className="text-xs text-[#E30613] font-bold">{countdown}</div>
                </div>
              </div>
              <button className="w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold">Ver detalhes</button>
            </div>
          )}

          {/* Missões em andamento */}
          <div className="card-surface p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#252733]">Missões em andamento</h3>
              <Link to="/missions" className="text-xs text-[#E30613] font-medium hover:underline">Ver todas</Link>
            </div>
            <div className="space-y-2">
              {missions.filter(m => !m.claimed).slice(0, 5).map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#FFF0F2] flex items-center justify-center text-[#E30613] text-[10px] font-bold shrink-0">
                    {m.completed ? '✓' : Math.round((m.progress / m.target) * 100) + '%'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[#252733] truncate">{m.title}</div>
                    <div className="h-1 bg-[#E9EAF0] rounded-full overflow-hidden mt-0.5">
                      <div className="h-full bg-[#E30613]" style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }} />
                    </div>
                    <div className="text-[9px] text-[#858A98] mt-0.5">{m.progress}/{m.target}</div>
                  </div>
                </div>
              ))}
              {missions.filter(m => !m.claimed).length === 0 && <div className="text-xs text-[#858A98]">Todas as missões concluídas!</div>}
            </div>
          </div>

          {/* Loja */}
          <div className="card-surface p-4 space-y-2">
            <h3 className="font-semibold text-[#252733]">Loja</h3>
            {packs.map(p => (
              <div key={p.id} className="space-y-1">
                <div className="text-sm font-semibold text-[#252733]">{p.name}</div>
                <div className="text-xs text-[#858A98]">{p.description}</div>
                <div className="text-xs text-[#858A98]">{p.cards} cartas · {p.price.toLocaleString('pt-BR')} moedas</div>
                <Link to="/packs" className="block w-full py-2 rounded-xl bg-[#E30613] text-white text-sm font-bold text-center">Comprar</Link>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
