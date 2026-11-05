import { createInitialState, simulateShot } from '../../src/engine/pool/physics';

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

  it('conservation: total balls remain 16', () => {
    const s = createInitialState();
    const r = simulateShot(s, { angle: 0, power: 0.5 });
    expect(r.finalState.balls.length).toBe(16);
  });
});
