import { supabase } from '../supabase';

export interface CollectorRanking {
  userId: string;
  name: string;
  cardsCount: number;
  squadOverall: number;
  rareCount: number;
  updatedAt: string;
}

export async function updateCollectorRanking(userId: string, name: string, cardsCount: number, squadOverall: number, rareCount: number): Promise<void> {
  if (!supabase) return;
  await supabase.from('leaderboard').upsert({
    user_id: userId,
    name,
    cards_count: cardsCount,
    squad_overall: squadOverall,
    rare_count: rareCount,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function getCollectorRanking(limit = 10): Promise<CollectorRanking[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('leaderboard').select('*').order('cards_count', { ascending: false }).limit(limit);
  if (error) return [];
  return (data || []).map((r: any) => ({
    userId: r.user_id,
    name: r.name,
    cardsCount: r.cards_count ?? 0,
    squadOverall: r.squad_overall ?? 0,
    rareCount: r.rare_count ?? 0,
    updatedAt: r.updated_at,
  }));
}
