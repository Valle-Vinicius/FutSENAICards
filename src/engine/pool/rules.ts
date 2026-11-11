import { BALL_RADIUS, POCKET_RADIUS, TABLE_HEIGHT, TABLE_WIDTH, type Ball, type TableState } from './types.ts';

const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH / 2, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: 0, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

export function isValidCuePlacement(position: { x: number; y: number }, balls: Ball[]): boolean {
  if (
    position.x < BALL_RADIUS
    || position.x > TABLE_WIDTH - BALL_RADIUS
    || position.y < BALL_RADIUS
    || position.y > TABLE_HEIGHT - BALL_RADIUS
  ) return false;

  if (POCKETS.some(pocket => Math.hypot(position.x - pocket.x, position.y - pocket.y) < POCKET_RADIUS)) {
    return false;
  }

  return balls.every(ball =>
    ball.type === 'cue'
    || ball.pocketed
    || Math.hypot(position.x - ball.x, position.y - ball.y) >= BALL_RADIUS * 2,
  );
}

export function getBallType(ballId: number, state: TableState): Ball['type'] {
  return state.balls.find(b => b.id === ballId)?.type ?? 'solid';
}

export function getPlayerType(state: TableState, player: 1 | 2): Ball['type'] | null {
  return state.assignments[`player${player}` as 'player1' | 'player2'];
}

export function isFoul(state: TableState, shot: { firstContact: number | null; pocketed: number[]; noCushion: boolean }): boolean {
  if (shot.firstContact === null) return true; // no contact
  const firstBall = state.balls.find(b => b.id === shot.firstContact);
  if (!firstBall) return true;
  const playerType = getPlayerType(state, state.currentPlayer);
  if (playerType && firstBall.type !== playerType && firstBall.type !== 'eight') {
    const ownLeft = state.balls.filter(b => b.type === playerType && !b.pocketed).length;
    if (ownLeft > 0) return true;
  }
  if (shot.pocketed.includes(0)) return true; // cue pocketed
  return false;
}

export function determineWinner(state: TableState, foul: boolean): 1 | 2 | null {
  const eightPocketed = state.pocketedThisTurn.some(ballId => getBallType(ballId, state) === 'eight');
  if (!eightPocketed) return null;
  const playerType = getPlayerType(state, state.currentPlayer);
  const ownRemaining = state.balls.filter(b => b.type === playerType && !b.pocketed).length;
  if (!playerType || ownRemaining > 0 || foul) {
    return state.currentPlayer === 1 ? 2 : 1;
  }
  return state.currentPlayer;
}

export function getNextPlayer(state: TableState, foul: boolean, pocketedOwn: boolean): 1 | 2 {
  if (state.winner) return state.currentPlayer;
  if (foul) return state.currentPlayer === 1 ? 2 : 1;
  if (pocketedOwn) return state.currentPlayer;
  return state.currentPlayer === 1 ? 2 : 1;
}
