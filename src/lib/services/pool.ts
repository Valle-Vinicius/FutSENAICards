import { supabase } from '../supabase';

export interface PoolMatch {
  id: string;
  player1Id: string;
  player2Id: string;
  stake: number;
  status: string;
  seed: number;
  tableState: any;
  currentPlayer: number;
  turnDeadline: string | null;
  assignments: { player1: string | null; player2: string | null };
  winnerId: string | null;
  payout: number;
  createdAt: string;
}

export async function createPoolMatch(opponentId: string, stake: number): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('create_pool_match', { p_opponent: opponentId, p_stake: stake });
  if (error) return null;
  return data as string;
}

export async function acceptPoolMatch(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('accept_pool_match', { p_id: id });
  return !error && data === true;
}

export async function rejectPoolMatch(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('reject_pool_match', { p_id: id });
  return !error && data === true;
}

export async function abandonPoolMatch(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('abandon_pool_match', { p_id: id });
  return !error && data === true;
}

export async function getPoolMatch(id: string): Promise<PoolMatch | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('pool_matches').select('*').eq('id', id).single();
  if (error) return null;
  return {
    id: data.id,
    player1Id: data.player1_id,
    player2Id: data.player2_id,
    stake: data.stake,
    status: data.status,
    seed: data.seed,
    tableState: data.table_state,
    currentPlayer: data.current_player,
    turnDeadline: data.turn_deadline,
    assignments: data.assignments,
    winnerId: data.winner_id,
    payout: data.payout,
    createdAt: data.created_at,
  };
}

export async function submitShot(matchId: string, angle: number, power: number, ballInHandPos?: { x: number; y: number }): Promise<any> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('pool-shot', { body: { matchId, angle, power, ballInHandPos } });
  if (error) return null;
  return data;
}
