import { countActiveAdminUsers, isAdminUserOnline, sortAdminUsers, type AdminUserSummary } from '../../src/lib/adminUsers';

function makeUser(userId: string, name: string, lastSeen: string | null): AdminUserSummary {
  return {
    user_id: userId,
    name,
    coins: 0,
    xp: 0,
    level: 1,
    last_seen: lastSeen,
    card_count: 0,
    ranked_elo: 1000,
    ranked_matches: 0,
    ranked_wins: 0,
    pool_elo: 1000,
    pool_matches: 0,
    pool_wins: 0,
  };
}

describe('admin user ordering', () => {
  const now = Date.parse('2026-11-16T12:00:00.000Z');

  it('puts active users first and sorts names alphabetically within each group', () => {
    const users = [
      makeUser('offline-z', 'Zeca', '2026-11-16T11:00:00.000Z'),
      makeUser('online-b', 'Bia', '2026-11-16T11:59:30.000Z'),
      makeUser('online-a', 'Ana', '2026-11-16T11:59:00.000Z'),
    ];

    expect(countActiveAdminUsers(users, now)).toBe(2);
    expect(sortAdminUsers(users, now).map(user => user.name)).toEqual(['Ana', 'Bia', 'Zeca']);
  });

  it('uses alphabetical order when nobody is active', () => {
    const users = [
      makeUser('z', 'Zeca', '2026-11-16T11:00:00.000Z'),
      makeUser('a', 'Ana', null),
    ];

    expect(countActiveAdminUsers(users, now)).toBe(0);
    expect(sortAdminUsers(users, now).map(user => user.name)).toEqual(['Ana', 'Zeca']);
  });

  it('keeps the online window longer than the five-minute heartbeat', () => {
    expect(isAdminUserOnline('2026-11-16T11:53:00.000Z', now)).toBe(true);
    expect(isAdminUserOnline('2026-11-16T11:49:00.000Z', now)).toBe(false);
  });
});
