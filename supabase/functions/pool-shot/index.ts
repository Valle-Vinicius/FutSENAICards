import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isValidCuePlacement } from '../../../src/engine/pool/rules.ts';
import { createInitialState, simulateShotAnimation } from '../../../src/engine/pool/physics.ts';
import { BALL_RADIUS, TABLE_HEIGHT, TABLE_WIDTH } from '../../../src/engine/pool/types.ts';

// Origem restrita ao domínio da aplicação em produção, mas aceita localhost e previews Vercel
const ALLOWED_ORIGINS = [
  'https://fut-senai-cards.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

const corsHeaders = (origin: string | null) => {
  const allowOrigin = origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
};

const json = (body: unknown, origin: string | null, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

serve(async (req) => {
  const origin = req.headers.get('Origin');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, origin, 405);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    console.log('[pool-shot] 401 unauthorized - missing Authorization header');
    return json({ error: 'unauthorized' }, origin, 401);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);
  const token = authorization.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    console.warn('[pool-shot] 401 invalid session', {
      status: authError?.status,
      code: authError?.code,
      message: authError?.message,
    });
    return json({ error: 'invalid session' }, origin, 401);
  }

  console.log(`[pool-shot] user=${user.id} matchId=?`);

  let body: { matchId?: unknown; angle?: unknown; power?: unknown; ballInHandPos?: unknown };
  try {
    body = await req.json();
  } catch {
    console.log(`[pool-shot] user=${user.id} 400 invalid JSON body`);
    return json({ error: 'invalid JSON body' }, origin, 400);
  }

  const { matchId, angle, power, ballInHandPos } = body;

  // Validate inputs
  if (typeof matchId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(matchId)) {
    console.log(`[pool-shot] user=${user.id} 400 invalid matchId`);
    return json({ error: 'invalid matchId' }, origin, 400);
  }
  if (typeof angle !== 'number' || !isFinite(angle)) {
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} 400 invalid angle`);
    return json({ error: 'invalid angle' }, origin, 400);
  }
  if (typeof power !== 'number' || !isFinite(power) || power < 0 || power > 1) {
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} 400 invalid power`);
    return json({ error: 'invalid power' }, origin, 400);
  }
  if (ballInHandPos !== undefined && ballInHandPos !== null) {
    if (typeof ballInHandPos !== 'object' || typeof (ballInHandPos as any).x !== 'number' || typeof (ballInHandPos as any).y !== 'number') {
      console.log(`[pool-shot] user=${user.id} matchId=${matchId} 400 invalid ballInHandPos`);
      return json({ error: 'invalid ballInHandPos' }, origin, 400);
    }
    const pos = ballInHandPos as { x: number; y: number };
    if (
      !isFinite(pos.x)
      || !isFinite(pos.y)
      || pos.x < BALL_RADIUS
      || pos.x > TABLE_WIDTH - BALL_RADIUS
      || pos.y < BALL_RADIUS
      || pos.y > TABLE_HEIGHT - BALL_RADIUS
    ) {
      console.log(`[pool-shot] user=${user.id} matchId=${matchId} 400 ballInHandPos out of bounds`);
      return json({ error: 'ballInHandPos out of bounds' }, origin, 400);
    }
  }

  // Match and server time are independent reads; overlap their round trips.
  const [matchResult, serverTimeResult] = await Promise.all([
    supabase.from('pool_matches').select('*').eq('id', matchId).single(),
    supabase.rpc('pool_server_time'),
  ]);
  const { data: match, error: matchError } = matchResult;
  if (matchError) {
    if (matchError.code === 'PGRST116') {
      console.log(`[pool-shot] user=${user.id} matchId=${matchId} 404 match not found`);
      return json({ error: 'match not found' }, origin, 404);
    }
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} 500 database error: ${matchError.message}`);
    return json({ error: 'database error: ' + matchError.message }, origin, 500);
  }
  if (!match) {
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} 404 match not found`);
    return json({ error: 'match not found' }, origin, 404);
  }

  console.log(`[pool-shot] user=${user.id} matchId=${matchId} status=${match.status} current_player=${match.current_player} turn_deadline=${match.turn_deadline} player1=${match.player1_id} player2=${match.player2_id}`);

  // Validate participant
  if (match.player1_id !== user.id && match.player2_id !== user.id) {
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} 403 not a participant`);
    return json({ error: 'not a participant' }, origin, 403);
  }

  // Validate status - aceitar tanto 'accepted' quanto 'playing'
  if (match.status !== 'accepted' && match.status !== 'playing') {
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} 400 match not active (status=${match.status})`);
    return json({ error: 'match not active' }, origin, 400);
  }

  // Validate turn
  const currentPlayerId = match.current_player === 1 ? match.player1_id : match.player2_id;
  if (currentPlayerId !== user.id) {
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} 403 not your turn (currentPlayerId=${currentPlayerId})`);
    return json({ error: 'not your turn' }, origin, 403);
  }

  const { data: serverTime, error: serverTimeError } = serverTimeResult;
  if (serverTimeError) {
    console.error(`[pool-shot] user=${user.id} matchId=${matchId} failed to read server time`, serverTimeError.message);
    return json({ error: 'could not validate server time' }, origin, 500);
  }
  const serverNowMs = Date.parse(typeof serverTime === 'string' ? serverTime : String(serverTime));
  if (!Number.isFinite(serverNowMs)) {
    console.error(`[pool-shot] user=${user.id} matchId=${matchId} received invalid server time`);
    return json({ error: 'could not validate server time' }, origin, 500);
  }
  const now = new Date(serverNowMs);
  const staleLockBefore = new Date(now.getTime() - 60_000).toISOString();
  if (match.turn_available_at && new Date(match.turn_available_at).getTime() > now.getTime()) {
    return json({
      error: 'wait for the synchronized shot animation to finish',
      turnAvailableAt: match.turn_available_at,
    }, origin, 409);
  }

  // Validate turn deadline - usar horário do servidor
  if (match.turn_deadline) {
    const deadline = new Date(match.turn_deadline);
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} now=${now.toISOString()} deadline=${deadline.toISOString()}`);
    if (deadline < now) {
      const winnerId = match.current_player === 1 ? match.player2_id : match.player1_id;
      const { data: expiredRows, error: expireError } = await supabase
        .from('pool_matches')
        .update({
          status: 'finished',
          winner_id: winnerId,
          finish_reason: 'turn_expired',
          shot_lock_id: null,
          shot_lock_at: null,
          updated_at: now.toISOString(),
        })
        .eq('id', matchId)
        .eq('version', match.version ?? 0)
        .eq('current_player', match.current_player)
        .in('status', ['accepted', 'playing'])
        .lte('turn_available_at', now.toISOString())
        .or(`shot_lock_id.is.null,shot_lock_at.lt.${staleLockBefore}`)
        .select('id');
      if (expireError) {
        console.error(`[pool-shot] user=${user.id} matchId=${matchId} failed to expire turn`, expireError.message);
        return json({ error: 'could not validate turn deadline' }, origin, 500);
      }
      if (!expiredRows?.length) {
        return json({ error: 'shot already in progress or match changed; refresh and try again' }, origin, 409);
      }
      console.log(`[pool-shot] user=${user.id} matchId=${matchId} 400 turn expired, winner=${winnerId}`);
      return json({ error: 'turn expired', winner: winnerId }, origin, 400);
    }
  } else {
    console.log(`[pool-shot] user=${user.id} matchId=${matchId} WARNING turn_deadline is null`);
  }

  const shotId = crypto.randomUUID();
  const { data: lockRows, error: lockError } = await supabase
    .from('pool_matches')
    .update({ shot_lock_id: shotId, shot_lock_at: now.toISOString() })
    .eq('id', matchId)
    .eq('version', match.version ?? 0)
    .eq('current_player', match.current_player)
    .in('status', ['accepted', 'playing'])
    .or(`shot_lock_id.is.null,shot_lock_at.lt.${staleLockBefore}`)
    .select('id');
  if (lockError) {
    console.error(`[pool-shot] user=${user.id} matchId=${matchId} failed to acquire shot lock`, lockError.message);
    return json({ error: 'could not lock shot' }, origin, 500);
  }
  if (!lockRows?.length) {
    return json({ error: 'shot already in progress or match changed; refresh and try again' }, origin, 409);
  }

  let finalized = false;
  try {
  // Load or create table state
  let state = match.table_state
    ? (typeof match.table_state === 'string' ? JSON.parse(match.table_state) : match.table_state)
    : createInitialState();
  if (!match.table_state) state.currentPlayer = match.current_player;

  // Ball in hand
  const cue = state.balls.find((b: any) => b.id === 0);
  if (cue.pocketed) {
    if (!ballInHandPos) {
      return json({ error: 'place the cue ball before shooting' }, origin, 400);
    }
    const position = ballInHandPos as { x: number; y: number };
    if (!isValidCuePlacement(position, state.balls)) {
      return json({ error: 'invalid cue ball placement' }, origin, 400);
    }
  } else if (ballInHandPos) {
    return json({ error: 'cue ball placement is not available' }, origin, 400);
  }

  const clampedPower = Math.max(0, Math.min(1, power));
  const seq = (match.last_shot_seq ?? 0) + 1;
  const simulation = simulateShotAnimation(state, {
    angle,
    power: clampedPower,
    ballInHandPos: cue.pocketed ? ballInHandPos as { x: number; y: number } : undefined,
  });
  state = simulation.finalState;
  const anim = simulation.animation;

  // Determine foul
  const pocketedIds = state.pocketedThisTurn;
  let foul = false;
  let foulReason: string | null = null;
  if (state.firstContact === null) {
    foul = true;
    foulReason = 'no_contact';
  }
  else {
    const firstBall = state.balls.find((b: any) => b.id === state.firstContact);
    const playerType = state.assignments[`player${state.currentPlayer}`];
    if (playerType && firstBall && firstBall.type !== playerType && firstBall.type !== 'eight') {
      const ownLeft = state.balls.filter((b: any) => b.type === playerType && !b.pocketed).length;
      if (ownLeft > 0) {
        foul = true;
        foulReason = 'wrong_first_ball';
      }
    }
  }
  if (pocketedIds.includes(0)) {
    foul = true;
    foulReason ??= 'cue_pocketed';
  }

  const eightPocketed = state.balls.some((ball: any) => ball.type === 'eight' && pocketedIds.includes(ball.id));
  const ownType = state.assignments[`player${state.currentPlayer}`];
  const ownRemaining = state.balls.filter((b: any) => b.type === ownType && !b.pocketed).length;
  if (eightPocketed) {
    if (ownType === null || ownRemaining > 0 || foul) {
      state.winner = state.currentPlayer === 1 ? 2 : 1;
      foul = true;
      foulReason = 'eight_early';
    } else if (!foul) {
      state.winner = state.currentPlayer;
    }
  }

  // Assign types on first pocket
  if (state.assignments.player1 === null && pocketedIds.length > 0) {
    const firstPocketed = state.balls.find((b: any) => b.id === pocketedIds[0]);
    if (firstPocketed?.type === 'solid') {
      state.assignments.player1 = 'solid';
      state.assignments.player2 = 'stripe';
    } else if (firstPocketed?.type === 'stripe') {
      state.assignments.player1 = 'stripe';
      state.assignments.player2 = 'solid';
    }
  }

  // Determine next player
  let nextPlayer = state.currentPlayer;
  if (state.winner) {
    nextPlayer = state.currentPlayer;
  } else if (foul) {
    nextPlayer = state.currentPlayer === 1 ? 2 : 1;
  } else {
    const pocketedOwn = pocketedIds.some((id: number) => {
      const b = state.balls.find((bb: any) => bb.id === id);
      return b && (b.type === ownType || (ownType === null && b.type !== 'eight'));
    });
    if (!pocketedOwn) nextPlayer = state.currentPlayer === 1 ? 2 : 1;
  }
  state.currentPlayer = nextPlayer;
  state.foul = foul;

  // Persist the authoritative result and animation in one database transaction.
  const turnDeadline = new Date(Date.now() + 60000).toISOString();
  const finishReason = state.winner
    ? eightPocketed && (ownType === null || ownRemaining > 0 || foul) ? 'eight_early' : 'eight_pocketed'
    : null;
  const { data: finalizedShot, error: finalizeError } = await supabase.rpc('finalize_pool_shot', {
    p_match_id: matchId,
    p_player_id: user.id,
    p_shot_id: shotId,
    p_seq: seq,
    p_angle: angle,
    p_power: clampedPower,
    p_result: {
      pocketed: pocketedIds,
      foul,
      foulReason,
      firstContact: state.firstContact,
      nextPlayer,
      winner: state.winner,
      anim,
    },
    p_final_state: state,
    p_current_player: nextPlayer,
    p_turn_deadline: turnDeadline,
    p_winner_id: state.winner ? (state.winner === 1 ? match.player1_id : match.player2_id) : null,
    p_finish_reason: finishReason,
    p_expected_version: match.version ?? 0,
  });
  if (finalizeError || !finalizedShot || finalizedShot.error) {
    console.error(`[pool-shot] user=${user.id} matchId=${matchId} failed to atomically save shot`, finalizeError?.message ?? finalizedShot?.error);
    return json({ error: 'could not save shot state' }, origin, 500);
  }
  finalized = true;

  console.log(`[pool-shot] user=${user.id} matchId=${matchId} success nextPlayer=${nextPlayer} winner=${state.winner} foul=${foul}`);
  return json({
    anim,
    seq,
    shotId,
    playbackAt: finalizedShot.playbackAt,
    turnAvailableAt: finalizedShot.turnAvailableAt,
    version: finalizedShot.version,
    finalState: state,
    pocketed: pocketedIds,
    foul,
    foulReason,
    firstContact: state.firstContact,
    nextPlayer,
    winner: state.winner,
  }, origin, 200);
  } catch (error) {
    console.error(`[pool-shot] user=${user.id} matchId=${matchId} shot processing failed`, error);
    return json({ error: 'shot processing failed' }, origin, 500);
  } finally {
    if (!finalized) {
      const { error: releaseError } = await supabase
        .from('pool_matches')
        .update({ shot_lock_id: null, shot_lock_at: null })
        .eq('id', matchId)
        .eq('shot_lock_id', shotId);
      if (releaseError) {
        console.error(`[pool-shot] user=${user.id} matchId=${matchId} failed to release shot lock`, releaseError.message);
      }
    }
  }
});
