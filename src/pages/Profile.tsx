import { useGame } from '../store/useGame';
import Card from '../components/Card';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getProfile, type UserProfile } from '../lib/profile';
import { useEffect, useState } from 'react';

export default function Profile() {
  const coins = useGame(s => s.coins);
  const xp = useGame(s => s.xp);
  const level = useGame(s => s.level);
  const cards = useGame(s => s.cards);
  const packsOpened = useGame(s => s.packsOpened);
  const missions = useGame(s => s.missions);
  const achievements = useGame(s => s.achievements);
  const matchHistory = useGame(s => s.matchHistory);
  const lvlXp = (level - 1) * 500;
  const nextXp = level * 500;
  const pct = Math.min(100, ((xp - lvlXp) / (nextXp - lvlXp)) * 100);
  const wins = matchHistory.filter(m => m.homeScore > m.awayScore).length;
  const rarest = [...cards].sort((a, b) => b.overall - a.overall)[0];
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user?.id) {
        const p = await getProfile(data.session.user.id);
        setProfile(p);
      }
    });
  }, []);
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold text-[#252733]">Perfil do usuário</h1>
      <div className="card-surface p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-[#FFF0F2] flex items-center justify-center text-4xl text-[#E30613] font-bold overflow-hidden">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : level}
        </div>
        <div className="flex-1 space-y-2">
          <div className="text-xl font-semibold text-[#252733]">{profile?.name || 'Jogador Futsenai'}</div>
          <div className="text-sm text-[#858A98]">Nível {level} · {xp} XP</div>
          <div className="h-2 bg-[#E9EAF0] rounded-full overflow-hidden">
            <div className="h-full bg-[#E30613]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-[#858A98]">{xp - lvlXp} / {nextXp - lvlXp} XP para o próximo nível</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Moedas', value: coins.toLocaleString('pt-BR') },
          { label: 'Cartas', value: String(cards.length) },
          { label: 'Pacotes abertos', value: String(packsOpened) },
          { label: 'Missões concluídas', value: String(missions.filter(m => m.completed).length) },
          { label: 'Conquistas', value: String(achievements.filter(a => a.unlocked).length) },
          { label: 'Partidas', value: String(matchHistory.length) },
          { label: 'Vitórias', value: String(wins) },
          { label: 'Cartas raras+', value: String(cards.filter(c => ['rare', 'epic', 'legendary', 'icon'].includes(c.rarity)).length) },
        ].map(s => (
          <div key={s.label} className="card-surface p-3">
            <div className="text-xs text-[#858A98]">{s.label}</div>
            <div className="text-xl font-bold text-[#252733]">{s.value}</div>
          </div>
        ))}
      </div>

      {rarest && (
        <div className="card-surface p-4">
          <div className="text-sm font-medium text-[#858A98] mb-3">Carta mais rara</div>
          <div className="flex justify-center"><Card card={rarest} size="md" /></div>
        </div>
      )}

      <div className="card-surface p-4">
        <button onClick={handleLogout} className="w-full py-3 rounded-xl bg-white border border-red-200 text-red-600 font-bold">
          Sair da conta
        </button>
      </div>
    </div>
  );
}
