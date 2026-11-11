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
  finishReason: string | null;
  payout: number;
  createdAt: string;
}

export interface PoolShotEvent {
  seq: number;
  playerId: string;
  angle: number;
  power: number;
  anim: number[][] | null;
  pocketed: number[];
  foul: boolean | null;
  foulReason: string | null;
  firstContact: number | null;
  nextPlayer: number | null;
  winner: number | null;
}

function mapPoolShot(shot: any): PoolShotEvent {
  const result = shot.result ?? {};
  return {
    seq: shot.seq,
    playerId: shot.player_id,
    angle: shot.angle,
    power: shot.power,
    anim: Array.isArray(result.anim) ? result.anim : null,
    pocketed: Array.isArray(result.pocketed) ? result.pocketed : [],
    foul: typeof result.foul === 'boolean' ? result.foul : null,
    foulReason: typeof result.foulReason === 'string' ? result.foulReason : null,
    firstContact: typeof result.firstContact === 'number' ? result.firstContact : null,
    nextPlayer: typeof result.nextPlayer === 'number' ? result.nextPlayer : null,
    winner: typeof result.winner === 'number' ? result.winner : null,
  };
}

export async function getLatestPoolShotSeq(matchId: string): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('pool_shots')
    .select('seq')
    .eq('match_id', matchId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.seq ?? 0;
}

export async function getPoolShotsAfter(matchId: string, seq: number): Promise<PoolShotEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pool_shots')
    .select('seq, player_id, angle, power, result')
    .eq('match_id', matchId)
    .gt('seq', seq)
    .order('seq', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapPoolShot);
}

export async function getRecentPoolShots(matchId: string, limit = 12): Promise<PoolShotEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pool_shots')
    .select('seq, player_id, angle, power, result')
    .eq('match_id', matchId)
    .order('seq', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapPoolShot).reverse();
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
    finishReason: data.finish_reason,
    payout: data.payout,
    createdAt: data.created_at,
  };
}

function isHttpResponse(value: unknown): value is Pick<Response, 'status' | 'clone'> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { status?: unknown; clone?: unknown };
  return typeof candidate.status === 'number' && typeof candidate.clone === 'function';
}

export async function submitShot(matchId: string, angle: number, power: number, ballInHandPos?: { x: number; y: number }): Promise<any> {
  if (!supabase) return null;
  const body = { matchId, angle, power, ballInHandPos };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { error: sessionError.message };
  if (!sessionData.session) return { error: 'Sua sessão expirou. Entre novamente.' };

  const invoke = (accessToken: string) => supabase!.functions.invoke('pool-shot', {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let { data, error } = await invoke(sessionData.session.access_token);
  const context = error ? (error as { context?: unknown }).context : null;
  if (isHttpResponse(context) && context.status === 401) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshedData.session) {
      return { error: 'Sua sessão expirou. Entre novamente.' };
    }
    ({ data, error } = await invoke(refreshedData.session.access_token));
  }

  if (error) {
    let msg = error.message;
    try {
      const errorContext = (error as { context?: unknown }).context;
      if (isHttpResponse(errorContext)) {
        const body = await errorContext.clone().json();
        if (body?.error) msg = body.error;
      }
    } catch {}
    console.error('[pool-shot]', msg);
    return { error: msg };
  }
  return data;
}
