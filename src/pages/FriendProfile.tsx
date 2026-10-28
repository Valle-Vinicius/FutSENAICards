import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Card from '../components/Card';
import type { PlayerCard } from '../types';

export default function FriendProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [cards, setCards] = useState<PlayerCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !userId) return;
    (async () => {
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single();
      setProfile(prof);
      const { data: cs } = await supabase.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
      setCards((cs || []).map((c: any) => ({
        uid: c.id, playerId: c.player_id, name: c.name, position: c.position, sport: c.sport,
        nationality: c.nationality, age: c.age, club: c.club,
        rarity: c.rarity, edition: c.edition, special: c.special, overall: c.overall,
        pace: c.pace, shooting: c.shooting, passing: c.passing, dribbling: c.dribbling,
        defending: c.defending, physical: c.physical, reflexes: c.reflexes,
        positioning: c.positioning, handling: c.handling, image: c.image,
        favorite: c.favorite, isNew: c.is_new, obtainedAt: new Date(c.obtained_at).getTime(),
      })));
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div className="p-8 text-[#858A98]">Carregando...</div>;
  if (!profile) return <div className="p-8 text-[#858A98]">Perfil não encontrado. <button onClick={() => navigate(-1)} className="text-[#E30613]">Voltar</button></div>;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-[#858A98] hover:text-[#252733]">← Voltar</button>
      <div className="card-surface p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#E30613] font-bold text-2xl">
          {(profile.name || '?').charAt(0)}
        </div>
        <div>
          <div className="text-xl font-semibold text-[#252733]">{profile.name}</div>
          <div className="text-sm text-[#858A98]">Nível {profile.level ?? 1} · {profile.xp ?? 0} XP · {profile.coins ?? 0} moedas</div>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[#252733] mb-3">Cartas ({cards.length})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {cards.map(c => <Card key={c.uid} card={c} size="sm" />)}
        </div>
        {cards.length === 0 && <div className="text-[#858A98]">Sem cartas.</div>}
      </div>
    </div>
  );
}
