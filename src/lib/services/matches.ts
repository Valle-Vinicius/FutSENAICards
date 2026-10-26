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
  const { data, error } = await supabase.from('matches').select('*').eq('user_id', userId).order('played_at', { ascending: false });
  if (error) return [];
  return (data || []).map((m: any) => ({
    id: m.id,
    userId: m.user_id,
    sport: m.sport,
    homeScore: m.home_score,
    awayScore: m.away_score,
    opponent: m.opponent,
    playedAt: m.played_at,
  }));
}

export async function addMatch(userId: string, match: Omit<MatchRecord, 'id' | 'userId' | 'playedAt'>): Promise<MatchRecord | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('matches').insert({
    user_id: userId,
    sport: match.sport,
    home_score: match.homeScore,
    away_score: match.awayScore,
    opponent: match.opponent,
  }).select().single();
  if (error) return null;
  return {
    id: data.id,
    userId: data.user_id,
    sport: data.sport,
    homeScore: data.home_score,
    awayScore: data.away_score,
    opponent: data.opponent,
    playedAt: data.played_at,
  };
}
