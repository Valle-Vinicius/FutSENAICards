export const AIM_BROADCAST_INTERVAL_MS = 100;
const AIM_BROADCAST_HEARTBEAT_MS = 1_000;

export interface AimBroadcast {
  playerId: string;
  angle: number;
  power: number;
  sentAt: number;
}

export function isAimBroadcastDue(
  previous: AimBroadcast | null,
  next: Omit<AimBroadcast, 'sentAt'>,
  now: number,
): boolean {
  if (!previous || previous.playerId !== next.playerId) return true;

  const unchanged = previous.angle === next.angle && previous.power === next.power;
  const minimumInterval = unchanged
    ? AIM_BROADCAST_HEARTBEAT_MS
    : AIM_BROADCAST_INTERVAL_MS;
  return now - previous.sentAt >= minimumInterval;
}
