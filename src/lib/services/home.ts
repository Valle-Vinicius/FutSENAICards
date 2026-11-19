import { supabase } from '../supabase';

export interface HomePendingCounts {
  challenges: number;
  friendRequests: number;
  soldListings: number;
}

function parseCount(value: unknown): number {
  const count = typeof value === 'string' ? Number(value) : value;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('A RPC de pendências retornou uma contagem inválida.');
  }
  return count;
}

function isHomePendingCountsRow(
  value: unknown,
): value is { challenges: unknown; friend_requests: unknown; sold_listings: unknown } {
  return typeof value === 'object'
    && value !== null
    && 'challenges' in value
    && 'friend_requests' in value
    && 'sold_listings' in value;
}

export async function getHomePendingCounts(): Promise<HomePendingCounts> {
  if (!supabase) throw new Error('Supabase não está configurado.');

  const { data, error } = await supabase.rpc('get_home_pending_counts').single();
  if (error) throw error;
  if (!isHomePendingCountsRow(data)) throw new Error('A RPC de pendências retornou um formato inválido.');
  return {
    challenges: parseCount(data.challenges),
    friendRequests: parseCount(data.friend_requests),
    soldListings: parseCount(data.sold_listings),
  };
}
