export type BallType = 'solid' | 'stripe' | 'eight' | 'cue';

export interface Ball {
  id: number;
  type: BallType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface TableState {
  balls: Ball[];
  assignments: { player1: BallType | null; player2: BallType | null };
  currentPlayer: 1 | 2;
  winner: 1 | 2 | null;
  foul: boolean;
  pocketedThisTurn: number[];
  firstContact: number | null;
  shotInProgress: boolean;
}

export interface ShotInput {
  angle: number; // radians
  power: number; // 0-1
  ballInHandPos?: { x: number; y: number };
}

export interface ShotResult {
  frames: { balls: { x: number; y: number; pocketed: boolean }[] }[];
  finalState: TableState;
  pocketed: number[];
  foul: boolean;
  nextPlayer: 1 | 2;
  winner: 1 | 2 | null;
}

export const TABLE_WIDTH = 2.0;
export const TABLE_HEIGHT = 1.0;
export const BALL_RADIUS = 0.025;
export const POCKET_RADIUS = 0.045;
export const CORNER_POCKET_RADIUS = 0.065;
export const POCKETS: { x: number; y: number; radius: number }[] = [
  { x: 0, y: 0, radius: CORNER_POCKET_RADIUS },
  { x: TABLE_WIDTH / 2, y: 0, radius: POCKET_RADIUS },
  { x: TABLE_WIDTH, y: 0, radius: CORNER_POCKET_RADIUS },
  { x: 0, y: TABLE_HEIGHT, radius: CORNER_POCKET_RADIUS },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT, radius: POCKET_RADIUS },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT, radius: CORNER_POCKET_RADIUS },
];
export const FRICTION = 0.9945;
export const RESTITUTION = 0.8;
export const FIXED_DT = 1 / 240;
export const MAX_SIM_STEPS = 240 * 10; // 10 seconds max
