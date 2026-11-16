export type AdminUserSummary = {
  user_id: string;
  name: string | null;
  coins: number;
  xp: number;
  level: number;
  last_seen: string | null;
  card_count: number;
  ranked_elo: number;
  ranked_matches: number;
  ranked_wins: number;
  pool_elo: number;
  pool_matches: number;
  pool_wins: number;
};

export const ADMIN_ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isAdminUserOnline(lastSeen: string | null, now = Date.now()): boolean {
  if (!lastSeen) return false;
  const timestamp = Date.parse(lastSeen);
  return Number.isFinite(timestamp) && now - timestamp < ADMIN_ONLINE_WINDOW_MS;
}

export function countActiveAdminUsers(users: AdminUserSummary[], now = Date.now()): number {
  return users.filter(user => isAdminUserOnline(user.last_seen, now)).length;
}

export function sortAdminUsers(users: AdminUserSummary[], now = Date.now()): AdminUserSummary[] {
  const activeCount = countActiveAdminUsers(users, now);
  return [...users].sort((a, b) => {
    const aOnline = isAdminUserOnline(a.last_seen, now);
    const bOnline = isAdminUserOnline(b.last_seen, now);
    if (activeCount > 0 && aOnline !== bOnline) return aOnline ? -1 : 1;
    return (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR', { sensitivity: 'base' });
  });
}
