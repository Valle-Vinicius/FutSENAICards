import { supabase } from '../supabase';

export interface HomePendingCounts {
  challenges: number;
  friendRequests: number;
  soldListings: number;
}

export async function getHomePendingCounts(userId: string): Promise<HomePendingCounts> {
  if (!supabase) throw new Error('Supabase não está configurado.');

  const [challenges, poolMatches, friendRequests, soldListings] = await Promise.all([
    supabase.from('challenges').select('id', { count: 'exact', head: true }).eq('challenged_id', userId).eq('status', 'pending'),
    supabase.from('pool_matches').select('id', { count: 'exact', head: true }).eq('player2_id', userId).eq('status', 'pending'),
    supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('addressee_id', userId).eq('status', 'pending'),
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', userId).eq('status', 'sold'),
  ]);
  const results = [
    ['challenges', challenges],
    ['pool matches', poolMatches],
    ['friend requests', friendRequests],
    ['sold listings', soldListings],
  ] as const;
  const failed = results.filter(([, result]) => result.error);
  if (failed.length > 0) {
    for (const [source, result] of failed) {
      if (result.error) console.error(`[Home] failed to load ${source} count:`, result.error);
    }
    throw new Error('Não foi possível carregar todas as pendências da conta.');
  }

  return {
    challenges: (challenges.count ?? 0) + (poolMatches.count ?? 0),
    friendRequests: friendRequests.count ?? 0,
    soldListings: soldListings.count ?? 0,
  };
}
