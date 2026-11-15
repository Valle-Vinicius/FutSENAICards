import { createInitialState, simulateShot, simulateShotAnimation } from '../../src/engine/pool/physics';
import { calculateShotTrajectory } from '../../src/engine/pool/trajectory';
import { BALL_RADIUS, FIXED_DT, FRICTION, MAX_SIM_STEPS, POCKET_RADIUS, RESTITUTION, TABLE_HEIGHT, TABLE_WIDTH } from '../../src/engine/pool/types';
import { determineWinner, isValidCuePlacement } from '../../src/engine/pool/rules';
import type { ShotInput, TableState } from '../../src/engine/pool/types';

function referenceShot(state: TableState, shot: ShotInput) {
  const result = JSON.parse(JSON.stringify(state)) as TableState;
  const cue = result.balls.find(ball => ball.id === 0)!;
  if (cue.pocketed) {
    if (shot.ballInHandPos) {
      cue.x = Math.max(BALL_RADIUS, Math.min(TABLE_WIDTH - BALL_RADIUS, shot.ballInHandPos.x));
      cue.y = Math.max(BALL_RADIUS, Math.min(TABLE_HEIGHT - BALL_RADIUS, shot.ballInHandPos.y));
    }
    cue.pocketed = false;
  }
  const power = Math.max(0, Math.min(1, shot.power));
  cue.vx = Math.cos(shot.angle) * power * 8;
  cue.vy = Math.sin(shot.angle) * power * 8;
  result.shotInProgress = true;
  result.pocketedThisTurn = [];
  result.firstContact = null;
  result.foul = false;

  const pockets = [
    { x: 0, y: 0 },
    { x: TABLE_WIDTH / 2, y: 0 },
    { x: TABLE_WIDTH, y: 0 },
    { x: 0, y: TABLE_HEIGHT },
    { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
    { x: TABLE_WIDTH, y: TABLE_HEIGHT },
  ];
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const animation: number[][] = [];
  const toRow = () => result.balls.flatMap(ball =>
    ball.pocketed ? [-1, -1] : [Math.round(ball.x * 1000), Math.round(ball.y * 1000)],
  );
  let moving = true;
  let steps = 0;
  while (moving && steps < MAX_SIM_STEPS) {
    moving = false;
    for (const ball of result.balls) {
      if (ball.pocketed) continue;
      ball.x += ball.vx * FIXED_DT;
      ball.y += ball.vy * FIXED_DT;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;
      if (Math.abs(ball.vx) < 0.001) ball.vx = 0;
      if (Math.abs(ball.vy) < 0.001) ball.vy = 0;
      if (ball.vx !== 0 || ball.vy !== 0) moving = true;
      if (ball.x < BALL_RADIUS) { ball.x = BALL_RADIUS; ball.vx = -ball.vx * RESTITUTION; }
      if (ball.x > TABLE_WIDTH - BALL_RADIUS) { ball.x = TABLE_WIDTH - BALL_RADIUS; ball.vx = -ball.vx * RESTITUTION; }
      if (ball.y < BALL_RADIUS) { ball.y = BALL_RADIUS; ball.vy = -ball.vy * RESTITUTION; }
      if (ball.y > TABLE_HEIGHT - BALL_RADIUS) { ball.y = TABLE_HEIGHT - BALL_RADIUS; ball.vy = -ball.vy * RESTITUTION; }
      if (pockets.some(pocket => distance(ball, pocket) < POCKET_RADIUS)) {
        ball.pocketed = true;
        ball.vx = 0;
        ball.vy = 0;
        if (!result.pocketedThisTurn.includes(ball.id)) result.pocketedThisTurn.push(ball.id);
      }
    }
    for (let i = 0; i < result.balls.length; i++) {
      for (let j = i + 1; j < result.balls.length; j++) {
        const a = result.balls[i];
        const b = result.balls[j];
        if (a.pocketed || b.pocketed) continue;
        const d = distance(a, b);
        if (d >= BALL_RADIUS * 2 || d === 0) continue;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        const dot = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (dot <= 0) continue;
        a.vx -= dot * nx;
        a.vy -= dot * ny;
        b.vx += dot * nx;
        b.vy += dot * ny;
        const overlap = BALL_RADIUS * 2 - d;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;
        moving = true;
        if (result.firstContact === null && a.id === 0) result.firstContact = b.id;
        else if (result.firstContact === null && b.id === 0) result.firstContact = a.id;
      }
    }
    if (steps % 4 === 0) animation.push(toRow());
    steps++;
  }
  if (steps > 0 && (steps - 1) % 4 !== 0) animation.push(toRow());
  result.shotInProgress = false;
  return { animation, finalState: result };
}

describe('Pool engine', () => {
  it('shares deterministic shot physics with the server reference for 300 varied shots', () => {
    jest.setTimeout(30_000);
    let seed = 0x71a4c39d;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const compareWithReference = (state: TableState, shot: ShotInput) => {
      const expected = referenceShot(state, shot);
      const actual = simulateShotAnimation(state, shot);
      expect(actual.finalState.balls).toHaveLength(expected.finalState.balls.length);
      actual.finalState.balls.forEach((ball, ballIndex) => {
        const expectedBall = expected.finalState.balls[ballIndex];
        expect(Math.abs(ball.x - expectedBall.x)).toBeLessThanOrEqual(1e-9);
        expect(Math.abs(ball.y - expectedBall.y)).toBeLessThanOrEqual(1e-9);
        expect(ball.pocketed).toBe(expectedBall.pocketed);
      });
      expect(actual.finalState.pocketedThisTurn).toEqual(expected.finalState.pocketedThisTurn);
      expect(actual.finalState.firstContact).toBe(expected.finalState.firstContact);
      expect(actual.animation).toEqual(expected.animation);
    };

    for (let index = 0; index < 300; index++) {
      const state = createInitialState();
      state.balls = state.balls.slice(0, 1);
      const shot: ShotInput = {
        angle: random() * Math.PI * 2,
        power: index % 20 === 0 ? 0.2 + random() * 0.8 : random() * 0.00012,
      };
      if (index % 17 === 0) {
        state.balls[0].pocketed = true;
        shot.ballInHandPos = { x: 0.22 + random() * 0.1, y: 0.4 + random() * 0.2 };
      }
      compareWithReference(state, shot);
    }

    for (let index = 0; index < 25; index++) {
      const state = createInitialState();
      state.balls = state.balls.map(ball => ({
        ...ball,
        x: ball.id === 0 ? ball.x : 0.65 + (ball.id - 1) * 0.15 + random() * 0.03,
        y: ball.id === 0 ? ball.y : (ball.id % 2 === 0 ? 0.35 : 0.65) + random() * 0.04,
        pocketed: ball.id > 4,
      })).slice(0, 5);
      compareWithReference(state, {
        angle: random() * Math.PI * 2,
        power: 0.15 + random() * 0.85,
      });
    }
  });

  it('creates initial state with 16 balls', () => {
    const s = createInitialState();
    expect(s.balls.length).toBe(16);
    expect(s.balls[0].type).toBe('cue');
    expect(s.balls.filter(ball => ball.type === 'eight').map(ball => ball.id)).toEqual([15]);
  });

  it('determinism: same state + same shot = same result', () => {
    const s1 = createInitialState();
    const s2 = createInitialState();
    const shot = { angle: 0, power: 0.5 };
    const r1 = simulateShot(s1, shot);
    const r2 = simulateShot(s2, shot);
    expect(r1.pocketed).toEqual(r2.pocketed);
    expect(r1.foul).toBe(r2.foul);
    expect(r1.winner).toBe(r2.winner);
    expect(r1.frames.length).toBe(r2.frames.length);
  });

  it('cue ball moves after shot', () => {
    const s = createInitialState();
    const r = simulateShot(s, { angle: 0, power: 0.5 });
    expect(r.frames.length).toBeGreaterThan(0);
    const lastFrame = r.frames[r.frames.length - 1];
    expect(lastFrame.balls[0].x).not.toBe(s.balls[0].x);
  });

  it('lets the cue ball roll for several seconds instead of stopping abruptly', () => {
    const r = simulateShot(createInitialState(), { angle: 0, power: 0.5 });
    expect(r.frames.length).toBeGreaterThan(300);
  });

  it('conservation: total balls remain 16', () => {
    const s = createInitialState();
    const r = simulateShot(s, { angle: 0, power: 0.5 });
    expect(r.finalState.balls.length).toBe(16);
  });

  it('predicts a center hit and starts the object-ball line at the collision normal', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const target = { ...cue, id: 1, type: 'solid' as const, x: 0.5, y: 0.5 };
    const trajectory = calculateShotTrajectory([cue, target], 0);

    expect(trajectory?.objectBallId).toBe(target.id);
    expect(trajectory?.cueEnd.x).toBeCloseTo(target.x - BALL_RADIUS * 2);
    expect(trajectory?.cueEnd.y).toBeCloseTo(target.y);
    expect(trajectory?.objectStart).toEqual({ x: target.x, y: target.y });
    expect(trajectory?.objectEnd?.x).toBeGreaterThan(target.x);
    expect(trajectory?.objectEnd?.y).toBeCloseTo(target.y);
    expect(trajectory!.objectEnd!.x - target.x).toBeCloseTo(0.2);
  });

  it('uses the real circle contact point for a glancing hit', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const target = { ...cue, id: 1, type: 'solid' as const, x: 0.45, y: 0.54 };
    const trajectory = calculateShotTrajectory([cue, target], 0);

    expect(trajectory?.objectBallId).toBe(target.id);
    expect(trajectory?.cueEnd.y).toBeCloseTo(cue.y);
    expect(Math.hypot(trajectory!.cueEnd.x - target.x, trajectory!.cueEnd.y - target.y)).toBeCloseTo(BALL_RADIUS * 2);
    expect(trajectory?.objectEnd?.y).toBeGreaterThan(target.y);
  });

  it('continues a clear aiming line to the table boundary without an object line', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const target = { ...cue, id: 1, type: 'solid' as const, x: 0.5, y: 0.56 };
    const trajectory = calculateShotTrajectory([cue, target], 0);

    expect(trajectory?.objectBallId).toBeNull();
    expect(trajectory?.objectEnd).toBeNull();
    expect(trajectory?.cueEnd.x).toBeCloseTo(2 - BALL_RADIUS);
  });

  it('detects the first ball even when it is beyond the former short aim limit', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const target = { ...cue, id: 1, type: 'solid' as const, x: 0.7, y: 0.5 };
    const trajectory = calculateShotTrajectory([cue, target], 0);

    expect(trajectory?.objectBallId).toBe(target.id);
    expect(trajectory?.cueEnd.x).toBeCloseTo(target.x - BALL_RADIUS * 2);
  });

  it('selects the nearest collision along the aiming direction', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const near = { ...cue, id: 1, type: 'solid' as const, x: 0.45, y: 0.5 };
    const far = { ...cue, id: 2, type: 'solid' as const, x: 0.6, y: 0.5 };
    const trajectory = calculateShotTrajectory([cue, far, near], 0);

    expect(trajectory?.objectBallId).toBe(near.id);
  });

  it('only predicts a collision when the chosen power can physically reach it', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const target = { ...cue, id: 1, type: 'solid' as const, x: 1.5, y: 0.5 };
    const lowPower = calculateShotTrajectory([cue, target], 0, 0.1);
    const highPower = calculateShotTrajectory([cue, target], 0, 0.5);

    expect(lowPower?.objectBallId).toBeNull();
    expect(highPower?.objectBallId).toBe(target.id);
  });

  it('lets a 25% shot reach a ball that is within its physical travel distance', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const target = { ...cue, id: 1, type: 'solid' as const, x: 1.4, y: 0.5 };
    const trajectory = calculateShotTrajectory([cue, target], 0, 0.25);

    expect(trajectory?.objectBallId).toBe(target.id);
  });

  it('does not end a game when a non-eight ball is pocketed', () => {
    const state = createInitialState();
    state.assignments.player1 = 'solid';
    state.assignments.player2 = 'stripe';
    state.balls = state.balls.map(ball => ({
      ...ball,
      pocketed: ball.id !== 0 && ball.id !== 1,
      x: ball.id === 0 ? 0.14 : ball.id === 1 ? 0.065 : ball.x,
      y: ball.id === 0 ? 0.14 : ball.id === 1 ? 0.065 : ball.y,
    }));

    const result = simulateShot(state, { angle: Math.PI * 1.25, power: 1 });

    expect(result.pocketed).toContain(1);
    expect(result.finalState.winner).toBeNull();
  });

  it('does not allow winning the 8-ball while the table is still open', () => {
    const state = createInitialState();
    state.balls = state.balls.map(ball => ({
      ...ball,
      pocketed: ball.id !== 0 && ball.id !== 15,
      x: ball.id === 0 ? 0.14 : ball.id === 15 ? 0.065 : ball.x,
      y: ball.id === 0 ? 0.14 : ball.id === 15 ? 0.065 : ball.y,
    }));

    const result = simulateShot(state, { angle: Math.PI * 1.25, power: 1 });

    expect(result.pocketed).toContain(15);
    expect(result.finalState.winner).toBe(2);
    expect(result.foul).toBe(true);
  });

  it('identifies the 8-ball by type rather than mistaking a striped ball ID for it', () => {
    const state = createInitialState();
    state.pocketedThisTurn = [8];
    expect(determineWinner(state, false)).toBeNull();

    state.pocketedThisTurn = [15];
    expect(determineWinner(state, false)).toBe(2);
  });

  it('allows placing the cue ball in a clear area of the table', () => {
    const state = createInitialState();
    expect(isValidCuePlacement({ x: 0.25, y: 0.5 }, state.balls)).toBe(true);
  });

  it('rejects cue placement on another ball, in a pocket, or outside the table', () => {
    const state = createInitialState();
    const target = state.balls.find(ball => ball.id === 1)!;

    expect(isValidCuePlacement({ x: target.x, y: target.y }, state.balls)).toBe(false);
    expect(isValidCuePlacement({ x: 0.01, y: 0.01 }, state.balls)).toBe(false);
    expect(isValidCuePlacement({ x: -0.1, y: 0.5 }, state.balls)).toBe(false);
  });
});
