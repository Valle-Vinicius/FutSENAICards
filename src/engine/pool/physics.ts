import { TABLE_WIDTH, TABLE_HEIGHT, BALL_RADIUS, POCKET_RADIUS, FRICTION, RESTITUTION, FIXED_DT, MAX_SIM_STEPS, type Ball, type TableState, type ShotInput, type ShotResult } from './types';

const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH / 2, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: 0, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

export function createInitialBalls(): Ball[] {
  const balls: Ball[] = [];
  // cue ball
  balls.push({ id: 0, type: 'cue', x: TABLE_WIDTH * 0.25, y: TABLE_HEIGHT / 2, vx: 0, vy: 0, pocketed: false });
  // 8-ball and solids/stripes in triangle
  const rackX = TABLE_WIDTH * 0.75;
  const rackY = TABLE_HEIGHT / 2;
  const rows = 5;
  let ballId = 1;
  const types: ('solid' | 'stripe' | 'eight')[] = [];
  // 7 solids, 7 stripes, 1 eight
  for (let i = 0; i < 7; i++) types.push('solid');
  for (let i = 0; i < 7; i++) types.push('stripe');
  types.push('eight');
  // shuffle deterministically (simple rotation)
  // place in triangle rows
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

export function createInitialState(): TableState {
  return {
    balls: createInitialBalls(),
    assignments: { player1: null, player2: null },
    currentPlayer: 1,
    winner: null,
    foul: false,
    pocketedThisTurn: [],
    firstContact: null,
    shotInProgress: false,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isPocketed(ball: Ball): number {
  for (let i = 0; i < POCKETS.length; i++) {
    if (dist(ball, POCKETS[i]) < POCKET_RADIUS) return i;
  }
  return -1;
}

function stepPhysics(state: TableState): boolean {
  let moving = false;
  const balls = state.balls;
  // apply friction and move
  for (const b of balls) {
    if (b.pocketed) continue;
    b.x += b.vx * FIXED_DT;
    b.y += b.vy * FIXED_DT;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.abs(b.vx) < 0.001) b.vx = 0;
    if (Math.abs(b.vy) < 0.001) b.vy = 0;
    if (b.vx !== 0 || b.vy !== 0) moving = true;
    // wall collision
    if (b.x < BALL_RADIUS) { b.x = BALL_RADIUS; b.vx = -b.vx * RESTITUTION; }
    if (b.x > TABLE_WIDTH - BALL_RADIUS) { b.x = TABLE_WIDTH - BALL_RADIUS; b.vx = -b.vx * RESTITUTION; }
    if (b.y < BALL_RADIUS) { b.y = BALL_RADIUS; b.vy = -b.vy * RESTITUTION; }
    if (b.y > TABLE_HEIGHT - BALL_RADIUS) { b.y = TABLE_HEIGHT - BALL_RADIUS; b.vy = -b.vy * RESTITUTION; }
    // pocket
    const pk = isPocketed(b);
    if (pk >= 0) {
      b.pocketed = true;
      b.vx = 0; b.vy = 0;
      if (!state.pocketedThisTurn.includes(b.id)) state.pocketedThisTurn.push(b.id);
    }
  }
  // ball-ball collision
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
          a.vx -= dot * nx;
          a.vy -= dot * ny;
          b.vx += dot * nx;
          b.vy += dot * ny;
          // separate
          const overlap = BALL_RADIUS * 2 - d;
          a.x -= nx * overlap / 2;
          a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2;
          b.y += ny * overlap / 2;
          moving = true;
          // first contact
          if (state.firstContact === null && a.id === 0) {
            state.firstContact = b.id;
          } else if (state.firstContact === null && b.id === 0) {
            state.firstContact = a.id;
          }
        }
      }
    }
  }
  return moving;
}

export function simulateShot(state: TableState, shot: ShotInput): ShotResult {
  const s: TableState = JSON.parse(JSON.stringify(state));
  const cue = s.balls.find(b => b.id === 0)!;
  if (cue.pocketed) {
    // ball in hand
    if (shot.ballInHandPos) {
      cue.x = Math.max(BALL_RADIUS, Math.min(TABLE_WIDTH - BALL_RADIUS, shot.ballInHandPos.x));
      cue.y = Math.max(BALL_RADIUS, Math.min(TABLE_HEIGHT - BALL_RADIUS, shot.ballInHandPos.y));
    }
    cue.pocketed = false;
  }
  // apply shot
  const power = Math.max(0, Math.min(1, shot.power));
  cue.vx = Math.cos(shot.angle) * power * 8;
  cue.vy = Math.sin(shot.angle) * power * 8;
  s.shotInProgress = true;
  s.pocketedThisTurn = [];
  s.firstContact = null;
  s.foul = false;

  const frames: ShotResult['frames'] = [];
  let moving = true;
  let steps = 0;
  while (moving && steps < MAX_SIM_STEPS) {
    moving = stepPhysics(s);
    frames.push({ balls: s.balls.map(b => ({ x: b.x, y: b.y, pocketed: b.pocketed })) });
    steps++;
  }
  s.shotInProgress = false;

  // determine foul and next player
  const pocketedIds = s.pocketedThisTurn;

  // first contact foul
  let foul = false;
  if (s.firstContact === null) foul = true; // no contact
  else {
    const firstBall = s.balls.find(b => b.id === s.firstContact)!;
    // check if first contact is opponent's or 8 too early
    const currentPlayerType = s.assignments[`player${s.currentPlayer}` as 'player1' | 'player2'];
    if (currentPlayerType && firstBall.type !== currentPlayerType && firstBall.type !== 'eight') {
      // hitting opponent ball first (unless no own balls left)
      const ownLeft = s.balls.filter(b => b.type === currentPlayerType && !b.pocketed).length;
      if (ownLeft > 0) foul = true;
    }
  }
  // no ball hit cushion/pocket after contact
  if (pocketedIds.length === 0 && !foul) {
    // check if any ball moved to cushion
    // simplified: if no pocket and cue stopped, check if any ball touched wall
    // we'll treat as foul if nothing pocketed and no ball hit wall (simplified)
  }

  // 8-ball pocketed early
  const eightPocketed = s.balls.some(ball => ball.type === 'eight' && pocketedIds.includes(ball.id));
  const ownType = s.assignments[`player${s.currentPlayer}` as 'player1' | 'player2'];
  const ownRemaining = s.balls.filter(b => b.type === ownType && !b.pocketed).length;

  if (eightPocketed) {
    if (ownType === null || ownRemaining > 0 || foul) {
      // lose
      s.winner = (s.currentPlayer === 1 ? 2 : 1) as 1 | 2;
      foul = true;
    } else if (!foul) {
      s.winner = s.currentPlayer;
    }
  }

  // determine next player
  let nextPlayer: 1 | 2 = s.currentPlayer;
  if (s.winner) {
    nextPlayer = s.currentPlayer;
  } else if (foul) {
    nextPlayer = s.currentPlayer === 1 ? 2 : 1;
  } else if (pocketedIds.some(id => {
    const b = state.balls.find(bb => bb.id === id)!;
    return b.type === ownType || (ownType === null && b.type !== 'eight');
  })) {
    // pocketed own ball, play again
    nextPlayer = s.currentPlayer;
  } else {
    nextPlayer = s.currentPlayer === 1 ? 2 : 1;
  }

  s.currentPlayer = nextPlayer;
  s.foul = foul;

  // assign types on first pocket
  if (s.assignments.player1 === null && pocketedIds.length > 0) {
    const firstPocketed = s.balls.find(b => b.id === pocketedIds[0])!;
    if (firstPocketed.type === 'solid') {
      s.assignments.player1 = 'solid';
      s.assignments.player2 = 'stripe';
    } else if (firstPocketed.type === 'stripe') {
      s.assignments.player1 = 'stripe';
      s.assignments.player2 = 'solid';
    }
  }

  return {
    frames,
    finalState: s,
    pocketed: pocketedIds,
    foul,
    nextPlayer,
    winner: s.winner,
  };
}
