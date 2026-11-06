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

async function getActivePoolMatchBetween(player1Id: string, player2Id: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('pool_matches')
    .select('id, status, player1_id, player2_id')
    .or(`and(player1_id.eq.${player1Id},player2_id.eq.${player2Id}),and(player1_id.eq.${player2Id},player2_id.eq.${player1Id})`)
    .in('status', ['pending', 'accepted', 'playing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function createPoolMatch(opponentId: string, stake: number): Promise<{ matchId: string | null; error: string | null }> {
  if (!supabase) return { matchId: null, error: 'Supabase não configurado' };
  const { data, error } = await supabase.rpc('create_pool_match', { p_opponent: opponentId, p_stake: stake });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('Active match exists')) {
      // tentar abandonar a partida travada e criar novamente
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        const activeId = uid ? await getActivePoolMatchBetween(uid, opponentId) : null;
        if (activeId) {
          await supabase.rpc('abandon_pool_match', { p_id: activeId });
        }
        const retry = await supabase.rpc('create_pool_match', { p_opponent: opponentId, p_stake: stake });
        if (retry.error) return { matchId: null, error: retry.error.message };
        return { matchId: retry.data as string, error: null };
      } catch (e: any) {
        return { matchId: null, error: e?.message || msg };
      }
    }
    return { matchId: null, error: msg };
  }
  return { matchId: data as string, error: null };
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
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json(); if (b?.error) msg = b.error; } catch {}
    console.error('[pool-shot]', msg);
    return { error: msg };
  }
  return data;
}
