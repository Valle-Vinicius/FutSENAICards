import { supabase } from '../supabase';

export interface CollectorRanking {
  userId: string;
  name: string;
  cardsCount: number;
  squadOverall: number;
  rareCount: number;
  updatedAt: string;
}

export type CompetitiveDivision = 'Bronze' | 'Prata' | 'Ouro' | 'Platina' | 'Diamante' | 'Elite' | 'Lendário';
export type CompetitiveResult = 'win' | 'loss' | 'draw';

export interface CompetitiveProfile {
  userId: string;
  name: string;
  avatarUrl: string | null;
  position: number | null;
  rating: number;
  peakRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestWinStreak: number;
  lastMatchAt: string | null;
  division: CompetitiveDivision | null;
  divisionRating: number | null;
  nextDivision: CompetitiveDivision | null;
  nextDivisionRating: number | null;
  winRate: number;
}

export interface CompetitivePlayer extends Pick<
  CompetitiveProfile,
  'userId' | 'name' | 'avatarUrl' | 'rating' | 'peakRating' | 'matchesPlayed' | 'wins' | 'losses' | 'draws' | 'division'
> {
  position: number;
}

export interface CompetitiveRatingEvent {
  challengeId: string;
  opponentId: string;
  opponentName: string;
  opponentAvatarUrl: string | null;
  result: CompetitiveResult;
  scoreFor: number;
  scoreAgainst: number;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  division: CompetitiveDivision | null;
  createdAt: string;
}

export interface CompetitiveHeadToHead {
  historyType: 'historical_pvp';
  userId: string;
  opponentId: string;
  totalMatches: number;
  userWins: number;
  opponentWins: number;
  draws: number;
  lastMatchAt: string | null;
  matches: {
    challenge_id: string;
    user_score: number;
    opponent_score: number;
    result: CompetitiveResult;
    updated_at: string;
  }[];
}

export interface CompetitiveHeadToHeadOpponent {
  userId: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
}

export async function getCompetitiveLeaderboard(options: {
  limit?: number;
  offset?: number;
  division?: CompetitiveDivision | null;
  search?: string;
} = {}): Promise<CompetitivePlayer[]> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('competitive_list_players', {
    p_limit: options.limit ?? 20,
    p_offset: options.offset ?? 0,
    p_division: options.division ?? null,
    p_search: options.search?.trim() || null,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    userId: String(row.user_id),
    position: Number(row.position),
    name: String(row.name ?? 'Jogador'),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    rating: Number(row.rating),
    peakRating: Number(row.peak_rating),
    matchesPlayed: Number(row.matches_played),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
    division: (row.division as CompetitiveDivision | null) ?? null,
  }));
}

export async function getPoolCompetitiveLeaderboard(options: {
  limit?: number;
  offset?: number;
  search?: string;
} = {}): Promise<CompetitivePlayer[]> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('pool_competitive_list_players', {
    p_limit: options.limit ?? 20,
    p_offset: options.offset ?? 0,
    p_search: options.search?.trim() || null,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    userId: String(row.user_id),
    position: Number(row.player_position),
    name: String(row.name ?? 'Jogador'),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    rating: Number(row.rating),
    peakRating: Number(row.peak_rating),
    matchesPlayed: Number(row.matches_played),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
    division: null,
  }));
}

export async function searchCompetitiveHeadToHeadOpponents(
  userId: string,
  search: string,
): Promise<CompetitiveHeadToHeadOpponent[]> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const query = search.trim();
  if (query.length < 2) return [];
  const { data, error } = await supabase.rpc('competitive_search_head_to_head_opponents', {
    p_user_id: userId,
    p_search: query,
    p_limit: 10,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    userId: String(row.user_id),
    name: String(row.name ?? 'Jogador'),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    rating: typeof row.rating === 'number' ? row.rating : null,
  }));
}

export async function getCompetitiveProfile(userId: string): Promise<CompetitiveProfile> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('competitive_get_profile', { p_user_id: userId });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('O perfil competitivo não foi encontrado.');
  const row = data as Record<string, unknown>;
  return {
    userId: String(row.userId),
    name: String(row.name ?? 'Jogador'),
    avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : null,
    position: typeof row.position === 'number' ? row.position : null,
    rating: Number(row.rating),
    peakRating: Number(row.peakRating),
    matchesPlayed: Number(row.matchesPlayed),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
    currentStreak: Number(row.currentStreak),
    bestWinStreak: Number(row.bestWinStreak),
    lastMatchAt: typeof row.lastMatchAt === 'string' ? row.lastMatchAt : null,
    division: (row.division as CompetitiveDivision | null) ?? null,
    divisionRating: typeof row.divisionRating === 'number' ? row.divisionRating : null,
    nextDivision: (row.nextDivision as CompetitiveDivision | null) ?? null,
    nextDivisionRating: typeof row.nextDivisionRating === 'number' ? row.nextDivisionRating : null,
    winRate: Number(row.winRate),
  };
}

export async function getCompetitiveRatingHistory(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<CompetitiveRatingEvent[]> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('competitive_get_rating_history', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    challengeId: String(row.challenge_id),
    opponentId: String(row.opponent_id),
    opponentName: String(row.opponent_name ?? 'Jogador'),
    opponentAvatarUrl: typeof row.opponent_avatar_url === 'string' ? row.opponent_avatar_url : null,
    result: row.result as CompetitiveResult,
    scoreFor: Number(row.score_for),
    scoreAgainst: Number(row.score_against),
    ratingBefore: Number(row.rating_before),
    ratingAfter: Number(row.rating_after),
    ratingChange: Number(row.rating_change),
    division: (row.division as CompetitiveDivision | null) ?? null,
    createdAt: String(row.created_at),
  }));
}

export async function getCompetitiveHeadToHead(
  userId: string,
  opponentId: string,
  limit = 20,
  offset = 0,
): Promise<CompetitiveHeadToHead> {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('competitive_get_head_to_head', {
    p_user_id: userId,
    p_opponent_id: opponentId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('O histórico de confrontos não foi retornado.');
  const row = data as Record<string, unknown>;
  if (row.historyType !== 'historical_pvp') throw new Error('O tipo do histórico de confrontos retornado é inválido.');
  return {
    historyType: row.historyType,
    userId: String(row.userId),
    opponentId: String(row.opponentId),
    totalMatches: Number(row.totalMatches),
    userWins: Number(row.userWins),
    opponentWins: Number(row.opponentWins),
    draws: Number(row.draws),
    lastMatchAt: typeof row.lastMatchAt === 'string' ? row.lastMatchAt : null,
    matches: Array.isArray(row.matches) ? row.matches as CompetitiveHeadToHead['matches'] : [],
  };
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
