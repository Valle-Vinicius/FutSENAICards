import { supabase } from '../supabase';

export interface MatchRecord {
  id: string;
  userId: string;
  sport: string;
  homeScore: number;
  awayScore: number;
  opponent: string;
  playedAt: string;
}

export async function getMatches(userId: string): Promise<MatchRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('matches').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map((m: any) => ({
    id: m.id,
    userId: m.user_id,
    sport: m.sport ?? 'futsal',
    homeScore: m.home_score,
    awayScore: m.away_score,
    opponent: m.opponent,
    playedAt: m.played_at ?? m.created_at,
  }));
}

export async function addMatch(userId: string, match: Omit<MatchRecord, 'id' | 'userId' | 'playedAt'>): Promise<MatchRecord | null> {
  if (!supabase) return null;
  const payload: any = {
    user_id: userId,
    home_score: match.homeScore,
    away_score: match.awayScore,
    opponent: match.opponent,
  };
  // try including sport if column exists
  try {
    const { data, error } = await supabase.from('matches').insert({ ...payload, sport: match.sport }).select().single();
    if (!error) {
      return {
        id: data.id,
        userId: data.user_id,
        sport: data.sport ?? match.sport,
        homeScore: data.home_score,
        awayScore: data.away_score,
        opponent: data.opponent,
        playedAt: data.played_at ?? data.created_at,
      };
    }
  } catch {}
  // fallback without sport
  const { data, error } = await supabase.from('matches').insert(payload).select().single();
  if (error) return null;
  return {
    id: data.id,
    userId: data.user_id,
    sport: data.sport ?? match.sport,
    homeScore: data.home_score,
    awayScore: data.away_score,
    opponent: data.opponent,
    playedAt: data.played_at ?? data.created_at,
  };
}
