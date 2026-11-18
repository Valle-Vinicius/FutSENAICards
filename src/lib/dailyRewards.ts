export const DAILY_STREAK_BONUS_PER_DAY = 100;
export const DAILY_STREAK_BONUS_CAP = 1000;

function localDateKey(timestamp: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const previousDate = new Date(Date.UTC(year, month - 1, day - 1));
  return `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}-${String(previousDate.getUTCDate()).padStart(2, '0')}`;
}

export function getDailyStreakPreview(
  lastClaim: number | null,
  currentStreak: number,
  now: number,
): { activeStreak: number; claimStreak: number; nextBonus: number; claimedToday: boolean } {
  const todayKey = localDateKey(now);
  const yesterdayKey = previousDateKey(todayKey);
  const lastClaimKey = lastClaim === null ? null : localDateKey(lastClaim);
  const claimedToday = lastClaimKey === todayKey;
  const activeStreak = lastClaimKey === todayKey || lastClaimKey === yesterdayKey
    ? currentStreak
    : 0;
  const claimStreak = claimedToday ? currentStreak : activeStreak + 1;
  const nextStreak = claimedToday ? currentStreak + 1 : claimStreak;

  return {
    activeStreak,
    claimStreak,
    nextBonus: Math.min((nextStreak - 1) * DAILY_STREAK_BONUS_PER_DAY, DAILY_STREAK_BONUS_CAP),
    claimedToday,
  };
}
