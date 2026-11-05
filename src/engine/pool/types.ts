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
export const FRICTION = 0.985;
export const RESTITUTION = 0.8;
export const FIXED_DT = 1 / 240;
export const MAX_SIM_STEPS = 240 * 10; // 10 seconds max
