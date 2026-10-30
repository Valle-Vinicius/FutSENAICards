import { supabase } from '../supabase';

export interface Challenge {
  id: string;
  challenger_id: string;
  challenged_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  seed?: number;
  home_formation?: string;
  away_formation?: string;
  home_score?: number;
  away_score?: number;
  result?: any;
  created_at: string;
}

export async function createChallenge(challengerId: string, challengedId: string): Promise<Challenge | null> {
  if (!supabase || challengerId === challengedId) return null;
  // require accepted friendship
  const { data: fr } = await supabase.from('friendships').select('id').eq('status', 'accepted').or(`and(requester_id.eq.${challengerId},addressee_id.eq.${challengedId}),and(requester_id.eq.${challengedId},addressee_id.eq.${challengerId})`);
  if (!fr || fr.length === 0) return null;
  // check existing pending/accepted
  const { data: existing } = await supabase.from('challenges').select('id').or(`and(challenger_id.eq.${challengerId},challenged_id.eq.${challengedId}),and(challenger_id.eq.${challengedId},challenged_id.eq.${challengerId})`).in('status', ['pending', 'accepted']);
  if (existing && existing.length > 0) return null;
  const { data, error } = await supabase.from('challenges').insert({
    challenger_id: challengerId,
    challenged_id: challengedId,
    status: 'pending',
  }).select().single();
  if (error) return null;
  return data;
}

export async function acceptChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('challenges')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select();
  if (error) return false;
  return Array.isArray(data) && data.length === 1;
}

export async function rejectChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('challenges').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

export async function saveChallengeResult(id: string, result: any): Promise<boolean> {
  if (!supabase) return false;
  // guard: only if accepted and no result yet
  const { data: existing } = await supabase.from('challenges').select('status, result').eq('id', id).single();
  if (!existing || existing.status !== 'accepted' || existing.result) return false;
  const { error } = await supabase.from('challenges').update({
    status: 'completed',
    seed: result.seed,
    home_formation: result.homeFormation,
    away_formation: result.awayFormation,
    home_score: result.homeScore,
    away_score: result.awayScore,
    result,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'accepted');
  return !error;
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('challenges').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

export async function getPendingChallenges(userId: string): Promise<Challenge[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('challenges').select('*').eq('challenged_id', userId).eq('status', 'pending');
  if (error) return [];
  return data || [];
}

export function subscribeChallenges(userId: string, onChange: () => void) {
  if (!supabase) return () => {};
  const channel = supabase.channel(`challenges-${userId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, (payload: any) => {
      const row = payload.new || payload.old;
      if (row && (row.challenger_id === userId || row.challenged_id === userId)) onChange();
    })
    .subscribe();
  return () => { if (supabase) supabase.removeChannel(channel); };
}
