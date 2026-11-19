import { isAimBroadcastDue, type AimBroadcast } from '../../src/lib/poolAim';

describe('Pool aim broadcast throttling', () => {
  const previous: AimBroadcast = {
    playerId: 'player-1',
    angle: 0.5,
    power: 0.7,
    sentAt: 1_000,
  };

  it('limits changed aim updates to one every 100 ms', () => {
    const changedAim = { playerId: 'player-1', angle: 0.6, power: 0.7 };

    expect(isAimBroadcastDue(previous, changedAim, 1_099)).toBe(false);
    expect(isAimBroadcastDue(previous, changedAim, 1_100)).toBe(true);
  });

  it('sends an unchanged aim heartbeat at most once per second', () => {
    const sameAim = { playerId: 'player-1', angle: 0.5, power: 0.7 };

    expect(isAimBroadcastDue(previous, sameAim, 1_999)).toBe(false);
    expect(isAimBroadcastDue(previous, sameAim, 2_000)).toBe(true);
  });

  it('allows the new active player to broadcast immediately', () => {
    expect(isAimBroadcastDue(previous, {
      playerId: 'player-2',
      angle: 0.5,
      power: 0.7,
    }, 1_001)).toBe(true);
  });
});
