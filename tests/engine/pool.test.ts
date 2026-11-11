import { createInitialState, simulateShot } from '../../src/engine/pool/physics';
import { calculateShotTrajectory } from '../../src/engine/pool/trajectory';
import { BALL_RADIUS } from '../../src/engine/pool/types';

describe('Pool engine', () => {
  it('creates initial state with 16 balls', () => {
    const s = createInitialState();
    expect(s.balls.length).toBe(16);
    expect(s.balls[0].type).toBe('cue');
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
    expect(trajectory?.cueEnd.x).toBeCloseTo(target.x - BALL_RADIUS);
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
    expect(trajectory?.cueEnd.y).toBeLessThan(target.y);
    expect(Math.hypot(trajectory!.cueEnd.x - target.x, trajectory!.cueEnd.y - target.y)).toBeCloseTo(BALL_RADIUS);
    expect(trajectory?.objectEnd?.y).toBeGreaterThan(target.y);
  });

  it('limits a clear aiming line and omits the object line when no circle is hit', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const target = { ...cue, id: 1, type: 'solid' as const, x: 0.5, y: 0.56 };
    const trajectory = calculateShotTrajectory([cue, target], 0);

    expect(trajectory?.objectBallId).toBeNull();
    expect(trajectory?.objectEnd).toBeNull();
    expect(trajectory?.cueEnd.x).toBeCloseTo(cue.x + 0.28);
  });

  it('selects the nearest collision along the aiming direction', () => {
    const cue = { ...createInitialState().balls[0], x: 0.2, y: 0.5 };
    const near = { ...cue, id: 1, type: 'solid' as const, x: 0.45, y: 0.5 };
    const far = { ...cue, id: 2, type: 'solid' as const, x: 0.6, y: 0.5 };
    const trajectory = calculateShotTrajectory([cue, far, near], 0);

    expect(trajectory?.objectBallId).toBe(near.id);
  });
});
