import { type Ball, type TableState } from './types';

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
  const eightPocketed = state.pocketedThisTurn.includes(8);
  if (!eightPocketed) return null;
  const playerType = getPlayerType(state, state.currentPlayer);
  const ownRemaining = state.balls.filter(b => b.type === playerType && !b.pocketed).length;
  if (ownRemaining > 0 || foul) {
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
