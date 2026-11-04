import type { MatchEvent, MatchPlayer, MatchResult, PlayerStats } from './match';
import type { ChallengeTeamSnapshot } from '../lib/services/challenges';

export interface RatedPvpPlayer {
  player: MatchPlayer;
  stats: PlayerStats;
  rating: number;
  side: 'home' | 'away';
  snapshotCard: ChallengeTeamSnapshot['cards'][number] | null;
}

export interface PvpAward {
  id: string;
  title: string;
  player: RatedPvpPlayer;
  detail: string;
}

const CARD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function snapshotCardIdForPlayer(playerId: string, side: 'home' | 'away'): string | null {
  const suffix = `_${side}`;
  if (!playerId.endsWith(suffix)) return null;
  const cardId = playerId.slice(0, -suffix.length);
  return CARD_ID_PATTERN.test(cardId) ? cardId : null;
}

export function ratePvpPlayer(stats: Partial<PlayerStats>): number {
  const passes = safeCount(stats.passes);
  const passCompleted = safeCount(stats.passCompleted);
  const shots = safeCount(stats.shots);
  const shotsOnTarget = safeCount(stats.shotsOnTarget);
  const failedPasses = Math.max(0, passes - passCompleted);
  const missedShots = Math.max(0, shots - shotsOnTarget);
  const rawRating = 6
    + safeCount(stats.goals) * 1.4
    + safeCount(stats.assists) * 0.8
    + safeCount(stats.saves) * 0.35
    + safeCount(stats.tackles) * 0.18
    + passCompleted * 0.025
    + shotsOnTarget * 0.1
    - failedPasses * 0.08
    - missedShots * 0.15
    - safeCount(stats.fouls) * 0.2
    - safeCount(stats.yellow) * 0.5;

  return Math.round(Math.max(0, Math.min(10, rawRating)) * 10) / 10;
}

function safeCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizePlayerStats(stats: Partial<PlayerStats>): PlayerStats {
  return {
    playerId: stats.playerId ?? '',
    passes: safeCount(stats.passes),
    passCompleted: safeCount(stats.passCompleted),
    shots: safeCount(stats.shots),
    shotsOnTarget: safeCount(stats.shotsOnTarget),
    goals: safeCount(stats.goals),
    assists: safeCount(stats.assists),
    tackles: safeCount(stats.tackles),
    saves: safeCount(stats.saves),
    fouls: safeCount(stats.fouls),
    yellow: safeCount(stats.yellow),
    distance: typeof stats.distance === 'number' && Number.isFinite(stats.distance) ? stats.distance : 0,
  };
}

export function getRatedPvpPlayers(
  result: MatchResult,
  snapshots: { home: ChallengeTeamSnapshot | null; away: ChallengeTeamSnapshot | null },
): RatedPvpPlayer[] {
  const sides: Array<{ side: 'home' | 'away'; players: MatchPlayer[]; snapshot: ChallengeTeamSnapshot | null }> = [
    { side: 'home', players: result.config.homePlayers, snapshot: snapshots.home },
    { side: 'away', players: result.config.awayPlayers, snapshot: snapshots.away },
  ];

  return sides.flatMap(({ side, players, snapshot }) => players.flatMap(player => {
    const stats = result.playerStats?.[player.id];
    if (!stats) return [];

    const snapshotCardId = snapshotCardIdForPlayer(player.id, side);
    const snapshotCard = snapshotCardId
      ? snapshot?.cards?.find(card => card.uid === snapshotCardId) ?? null
      : null;

    return [{
      player,
      stats: normalizePlayerStats(stats),
      rating: ratePvpPlayer(stats),
      side,
      snapshotCard,
    }];
  }));
}

function comparePerformance(a: RatedPvpPlayer, b: RatedPvpPlayer): number {
  return b.rating - a.rating
    || b.stats.goals - a.stats.goals
    || b.stats.assists - a.stats.assists
    || b.stats.saves - a.stats.saves
    || b.stats.tackles - a.stats.tackles
    || b.stats.passCompleted - a.stats.passCompleted
    || a.player.id.localeCompare(b.player.id);
}

export function getPvpAwards(
  result: MatchResult,
  snapshots: { home: ChallengeTeamSnapshot | null; away: ChallengeTeamSnapshot | null },
): { mvp: RatedPvpPlayer | null; worst: RatedPvpPlayer | null; awards: PvpAward[] } {
  const players = getRatedPvpPlayers(result, snapshots);
  const ranked = [...players].sort(comparePerformance);
  const mvp = ranked[0] ?? null;
  const worst = [...players].sort((a, b) => a.rating - b.rating || a.player.id.localeCompare(b.player.id))
    .find(player => players.length === 1 || player.player.id !== mvp?.player.id) ?? null;

  const awards: PvpAward[] = [];
  const addAward = (
    id: string,
    title: string,
    eligible: RatedPvpPlayer[],
    value: (player: RatedPvpPlayer) => number,
    detail: (player: RatedPvpPlayer) => string,
  ) => {
    const winner = [...eligible].sort((a, b) => value(b) - value(a) || comparePerformance(a, b))[0];
    if (winner && value(winner) > 0) awards.push({ id, title, player: winner, detail: detail(winner) });
  };

  addAward('goalkeeper', 'Muralha', players.filter(({ player }) => player.position === 'GK'), ({ stats }) => stats.saves, ({ stats }) => `${stats.saves} defesas`);
  addAward('scorer', 'Artilheiro', players, ({ stats }) => stats.goals, ({ stats }) => `${stats.goals} gols`);
  addAward('playmaker', 'Maestro', players, ({ stats }) => stats.passCompleted, ({ stats }) => `${stats.passCompleted} passes completos`);
  addAward('defender', 'Destaque defensivo', players, ({ stats }) => stats.tackles, ({ stats }) => `${stats.tackles} desarmes`);

  return { mvp, worst, awards };
}

export function getEventPlayerName(event: MatchEvent, result: MatchResult): string | null {
  if (!event.playerId) return null;
  return [...result.config.homePlayers, ...result.config.awayPlayers]
    .find(player => player.id === event.playerId)?.name ?? null;
}
