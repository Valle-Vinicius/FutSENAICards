import { createInitialState, simulateShot } from '../../src/engine/pool/physics';
import { calculateShotTrajectory } from '../../src/engine/pool/trajectory';
import { BALL_RADIUS } from '../../src/engine/pool/types';
import { determineWinner } from '../../src/engine/pool/rules';

describe('Pool engine', () => {
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
});
