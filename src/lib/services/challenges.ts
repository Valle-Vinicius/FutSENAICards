import { supabase } from '../supabase';
import type { Tactic } from '../../engine/match';

export interface Challenge {
  id: string;
  challenger_id: string;
  challenged_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled' | 'abandoned';
  challenger_ready?: boolean;
  challenged_ready?: boolean;
  home_formation?: string;
  away_formation?: string;
  home_score?: number;
  away_score?: number;
  result?: any;
  playback_state?: MatchPlaybackState;
  challenger_tactic?: Tactic;
  challenged_tactic?: Tactic;
  home_snapshot?: ChallengeTeamSnapshot;
  away_snapshot?: ChallengeTeamSnapshot;
  created_at: string;
}

export interface ChallengeTeamSnapshot {
  name: string;
  formation: string;
  cards: {
    uid: string;
    name: string;
    position: string;
    overall: number;
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physical: number;
    reflexes?: number | null;
    positioning?: number | null;
    handling?: number | null;
  }[];
}

export interface MatchPlaybackState {
  status: 'waiting' | 'playing' | 'paused' | 'finished';
  currentFrame: number;
  speed: 1 | 2 | 4;
  startedAt: string | null;
  pausedAt: string | null;
  serverNow?: string | null;
  receivedAt?: number;
}

export async function createChallenge(challengerId: string, challengedId: string): Promise<Challenge | null> {
  if (!supabase || challengerId === challengedId) return null;
  const { data, error } = await supabase.rpc('create_challenge', {
    p_challenged_id: challengedId,
  });
  if (error) throw error;
  return data;
}

export async function acceptChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: id });
  if (error) return false;
  return data === true;
}

export async function setReady(id: string, tactic: Tactic): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('set_challenge_ready', { p_challenge_id: id, p_tactic: tactic });
  return !error && data === true;
}

export async function abandonChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('abandon_challenge', { p_challenge_id: id });
  return !error && data === true;
}

export async function rejectChallenge(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('reject_challenge', { p_challenge_id: id });
  return !error && data === true;
}

export async function simulateChallenge(id: string): Promise<{ result: any | null; pending: boolean }> {
  if (!supabase) throw new Error('Serviço de partidas indisponível.');
  const { data, error } = await supabase.functions.invoke('simulate-challenge', { body: { challengeId: id } });
  if (error) throw error;
  if (!data || (!data.pending && !data.result)) {
    throw new Error(data?.error || 'O servidor não retornou o resultado oficial.');
  }
  return { result: data.result ?? null, pending: !!data.pending };
}

export async function updateChallengePlayback(
  id: string,
  action: 'play' | 'pause' | 'speed' | 'finish',
  speed?: 1 | 2 | 4,
): Promise<MatchPlaybackState> {
  if (!supabase) throw new Error('Serviço de partidas indisponível.');
  const { data, error } = await supabase.rpc('update_challenge_playback', {
    p_challenge_id: id,
    p_action: action,
    p_speed: speed ?? null,
  });
  if (error) throw error;
  return data as MatchPlaybackState;
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
