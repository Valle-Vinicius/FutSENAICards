import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TABLE_WIDTH = 2.0;
const TABLE_HEIGHT = 1.0;
const BALL_RADIUS = 0.025;
const POCKET_RADIUS = 0.045;
const FRICTION = 0.985;
const RESTITUTION = 0.8;
const FIXED_DT = 1 / 240;
const MAX_SIM_STEPS = 240 * 10;

const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH / 2, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: 0, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function createInitialBalls() {
  const balls: any[] = [];
  balls.push({ id: 0, type: 'cue', x: TABLE_WIDTH * 0.25, y: TABLE_HEIGHT / 2, vx: 0, vy: 0, pocketed: false });
  const rackX = TABLE_WIDTH * 0.75;
  const rackY = TABLE_HEIGHT / 2;
  const rows = 5;
  let ballId = 1;
  const types: string[] = [];
  for (let i = 0; i < 7; i++) types.push('solid');
  for (let i = 0; i < 7; i++) types.push('stripe');
  types.push('eight');
  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= row; col++) {
      if (ballId > 15) break;
      const x = rackX + row * BALL_RADIUS * 2;
      const y = rackY + (col - row / 2) * BALL_RADIUS * 2 * 1.05;
      const t = types[idx % types.length];
      idx++;
      balls.push({ id: ballId, type: t, x, y, vx: 0, vy: 0, pocketed: false });
      ballId++;
    }
  }
  return balls;
}

function stepPhysics(state: any): boolean {
  let moving = false;
  const balls = state.balls;
  for (const b of balls) {
    if (b.pocketed) continue;
    b.x += b.vx * FIXED_DT;
    b.y += b.vy * FIXED_DT;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.abs(b.vx) < 0.001) b.vx = 0;
    if (Math.abs(b.vy) < 0.001) b.vy = 0;
    if (b.vx !== 0 || b.vy !== 0) moving = true;
    if (b.x < BALL_RADIUS) { b.x = BALL_RADIUS; b.vx = -b.vx * RESTITUTION; }
    if (b.x > TABLE_WIDTH - BALL_RADIUS) { b.x = TABLE_WIDTH - BALL_RADIUS; b.vx = -b.vx * RESTITUTION; }
    if (b.y < BALL_RADIUS) { b.y = BALL_RADIUS; b.vy = -b.vy * RESTITUTION; }
    if (b.y > TABLE_HEIGHT - BALL_RADIUS) { b.y = TABLE_HEIGHT - BALL_RADIUS; b.vy = -b.vy * RESTITUTION; }
    for (let i = 0; i < POCKETS.length; i++) {
      if (dist(b, POCKETS[i]) < POCKET_RADIUS) {
        b.pocketed = true;
        b.vx = 0; b.vy = 0;
        if (!state.pocketedThisTurn.includes(b.id)) state.pocketedThisTurn.push(b.id);
      }
    }
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (a.pocketed || b.pocketed) continue;
      const d = dist(a, b);
      if (d < BALL_RADIUS * 2 && d > 0) {
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const dot = dvx * nx + dvy * ny;
        if (dot > 0) {
          a.vx -= dot * nx; a.vy -= dot * ny;
          b.vx += dot * nx; b.vy += dot * ny;
          const overlap = BALL_RADIUS * 2 - d;
          a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2; b.y += ny * overlap / 2;
          moving = true;
          if (state.firstContact === null && a.id === 0) state.firstContact = b.id;
          else if (state.firstContact === null && b.id === 0) state.firstContact = a.id;
        }
      }
    }
  }
  return moving;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

  const { matchId, angle, power, ballInHandPos } = await req.json();

  // Load match
  const { data: match, error: matchError } = await supabase.from('pool_matches').select('*').eq('id', matchId).single();
  if (matchError || !match) return new Response(JSON.stringify({ error: 'Partida não encontrada.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Validate turn
  const currentPlayerId = match.current_player === 1 ? match.player1_id : match.player2_id;
  if (currentPlayerId !== user.id) return new Response(JSON.stringify({ error: 'Não é sua vez.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Validate turn deadline
  if (match.turn_deadline && new Date(match.turn_deadline) < new Date()) {
    // W.O. - current player loses
    const winnerId = match.current_player === 1 ? match.player2_id : match.player1_id;
    await supabase.from('pool_matches').update({ status: 'finished', winner_id: winnerId, updated_at: new Date().toISOString() }).eq('id', matchId);
    return new Response(JSON.stringify({ error: 'Tempo esgotado. W.O.', winner: winnerId }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Load or create table state
  let state = match.table_state ? JSON.parse(match.table_state) : null;
  if (!state) {
    state = { balls: createInitialBalls(), assignments: { player1: null, player2: null }, currentPlayer: match.current_player, winner: null, foul: false, pocketedThisTurn: [], firstContact: null, shotInProgress: false };
  }

  // Apply ball in hand
  const cue = state.balls.find((b: any) => b.id === 0);
  if (cue.pocketed && ballInHandPos) {
    cue.x = Math.max(0.025, Math.min(1.975, ballInHandPos.x));
    cue.y = Math.max(0.025, Math.min(0.975, ballInHandPos.y));
    cue.pocketed = false;
  }

  // Apply shot
  const clampedPower = Math.max(0, Math.min(1, power));
  cue.vx = Math.cos(angle) * clampedPower * 8;
  cue.vy = Math.sin(angle) * clampedPower * 8;
  state.shotInProgress = true;
  state.pocketedThisTurn = [];
  state.firstContact = null;
  state.foul = false;

  const frames: any[] = [];
  let moving = true;
  let steps = 0;
  while (moving && steps < MAX_SIM_STEPS) {
    moving = stepPhysics(state);
    frames.push({ balls: state.balls.map((b: any) => ({ x: b.x, y: b.y, pocketed: b.pocketed })) });
    steps++;
  }
  state.shotInProgress = false;

  // Determine foul
  const pocketedIds = state.pocketedThisTurn;
  let foul = false;
  if (state.firstContact === null) foul = true;
  else {
    const firstBall = state.balls.find((b: any) => b.id === state.firstContact);
    const playerType = state.assignments[`player${state.currentPlayer}`];
    if (playerType && firstBall && firstBall.type !== playerType && firstBall.type !== 'eight') {
      const ownLeft = state.balls.filter((b: any) => b.type === playerType && !b.pocketed).length;
      if (ownLeft > 0) foul = true;
    }
  }
  if (pocketedIds.includes(0)) foul = true;

  // 8-ball pocketed
  const eightPocketed = pocketedIds.includes(8);
  const ownType = state.assignments[`player${state.currentPlayer}`];
  const ownRemaining = state.balls.filter((b: any) => b.type === ownType && !b.pocketed).length;
  if (eightPocketed) {
    if (ownRemaining > 0 || foul) {
      state.winner = state.currentPlayer === 1 ? 2 : 1;
      foul = true;
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

  // Save shot
  const { data: shotCount } = await supabase.from('pool_shots').select('seq').eq('match_id', matchId).order('seq', { ascending: false }).limit(1);
  const seq = shotCount && shotCount.length > 0 ? shotCount[0].seq + 1 : 1;
  await supabase.from('pool_shots').insert({
    match_id: matchId,
    player_id: user.id,
    seq,
    angle,
    power,
    result: { pocketed: pocketedIds, foul, nextPlayer, winner: state.winner },
  });

  // Update match state
  const updateData: any = {
    table_state: JSON.stringify(state),
    current_player: nextPlayer,
    turn_deadline: new Date(Date.now() + 30000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (state.winner) {
    updateData.status = 'finished';
    updateData.winner_id = state.winner === 1 ? match.player1_id : match.player2_id;
  }
  await supabase.from('pool_matches').update(updateData).eq('id', matchId);

  return new Response(JSON.stringify({ frames, finalState: state, pocketed: pocketedIds, foul, nextPlayer, winner: state.winner }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
