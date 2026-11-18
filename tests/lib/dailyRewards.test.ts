import { getDailyStreakPreview } from '../../src/lib/dailyRewards';

describe('getDailyStreakPreview', () => {
  const today = Date.parse('2026-01-03T03:00:00.000Z');
  const yesterday = Date.parse('2026-01-02T03:00:00.000Z');

  it('continues a streak from yesterday and calculates the next bonus', () => {
    expect(getDailyStreakPreview(yesterday, 4, today)).toEqual({
      activeStreak: 4,
      claimStreak: 5,
      nextBonus: 400,
      claimedToday: false,
    });
  });

  it('resets the streak after a missed day and caps the bonus', () => {
    const missedDay = Date.parse('2026-01-01T03:00:00.000Z');
    expect(getDailyStreakPreview(missedDay, 8, today)).toMatchObject({
      activeStreak: 0,
      claimStreak: 1,
      nextBonus: 0,
    });
    expect(getDailyStreakPreview(yesterday, 13, today).nextBonus).toBe(1000);
  });

  it('reports the active streak and tomorrow bonus after claiming today', () => {
    const claimedToday = Date.parse('2026-01-03T12:00:00.000Z');
    expect(getDailyStreakPreview(claimedToday, 5, today)).toEqual({
      activeStreak: 5,
      claimStreak: 5,
      nextBonus: 500,
      claimedToday: true,
    });
  });
});
