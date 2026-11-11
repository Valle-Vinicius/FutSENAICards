import { BALL_RADIUS, FIXED_DT, FRICTION, TABLE_HEIGHT, TABLE_WIDTH } from './types';
import type { Ball } from './types';

export interface TrajectoryPoint {
  x: number;
  y: number;
}

export interface ShotTrajectory {
  cueEnd: TrajectoryPoint;
  objectBallId: number | null;
  objectStart: TrajectoryPoint | null;
  objectEnd: TrajectoryPoint | null;
}

const MAX_OBJECT_TRAJECTORY = 0.2;
const MIN_VELOCITY = 0.001;

function rayCircleDistance(
  origin: TrajectoryPoint,
  direction: TrajectoryPoint,
  center: TrajectoryPoint,
): number | null {
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const projection = dx * direction.x + dy * direction.y;
  const perpendicularSquared = dx * dx + dy * dy - projection * projection;
  const collisionRadius = BALL_RADIUS * 2;
  const discriminant = collisionRadius * collisionRadius - perpendicularSquared;
  if (projection <= 0 || discriminant < 0) return null;

  const distance = projection - Math.sqrt(discriminant);
  return distance >= 0 ? distance : null;
}

function distanceToRail(origin: TrajectoryPoint, direction: TrajectoryPoint): number {
  const min = BALL_RADIUS;
  const maxX = TABLE_WIDTH - BALL_RADIUS;
  const maxY = TABLE_HEIGHT - BALL_RADIUS;
  let distance = Number.POSITIVE_INFINITY;

  if (direction.x > 0) distance = Math.min(distance, (maxX - origin.x) / direction.x);
  else if (direction.x < 0) distance = Math.min(distance, (min - origin.x) / direction.x);
  if (direction.y > 0) distance = Math.min(distance, (maxY - origin.y) / direction.y);
  else if (direction.y < 0) distance = Math.min(distance, (min - origin.y) / direction.y);

  return Math.max(0, distance);
}

function pointAlong(origin: TrajectoryPoint, direction: TrajectoryPoint, distance: number): TrajectoryPoint {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
  };
}

function shotTravelDistance(power: number): number {
  const initialVelocity = Math.max(0, Math.min(1, power)) * 8;
  if (initialVelocity <= MIN_VELOCITY) return 0;
  const steps = Math.ceil(Math.log(MIN_VELOCITY / initialVelocity) / Math.log(FRICTION));
  return initialVelocity * FIXED_DT * (1 - Math.pow(FRICTION, steps)) / (1 - FRICTION);
}

export function calculateShotTrajectory(balls: Ball[], angle: number, power = 1): ShotTrajectory | null {
  const cue = balls.find(ball => ball.type === 'cue');
  if (!cue || cue.pocketed) return null;

  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const maxCueDistance = Math.min(distanceToRail(cue, direction), shotTravelDistance(power));
  let hit: { ball: Ball; distance: number } | null = null;

  for (const ball of balls) {
    if (ball.pocketed || ball.id === cue.id) continue;
    const distance = rayCircleDistance(cue, direction, ball);
    if (distance === null || distance > maxCueDistance) continue;
    if (!hit || distance < hit.distance) hit = { ball, distance };
  }

  if (!hit) {
    return {
      cueEnd: pointAlong(cue, direction, maxCueDistance),
      objectBallId: null,
      objectStart: null,
      objectEnd: null,
    };
  }

  const cueAtImpact = pointAlong(cue, direction, hit.distance);
  const normalX = hit.ball.x - cueAtImpact.x;
  const normalY = hit.ball.y - cueAtImpact.y;
  const normalLength = Math.hypot(normalX, normalY);
  const normal = normalLength > 0
    ? { x: normalX / normalLength, y: normalY / normalLength }
    : direction;
  const objectStart = { x: hit.ball.x, y: hit.ball.y };
  const maxObjectDistance = Math.min(MAX_OBJECT_TRAJECTORY, distanceToRail(objectStart, normal));
  let objectDistance = maxObjectDistance;

  for (const ball of balls) {
    if (ball.pocketed || ball.id === cue.id || ball.id === hit.ball.id) continue;
    const distance = rayCircleDistance(objectStart, normal, ball);
    if (distance !== null && distance <= objectDistance) objectDistance = distance;
  }

  return {
    cueEnd: pointAlong(cue, direction, hit.distance),
    objectBallId: hit.ball.id,
    objectStart,
    objectEnd: pointAlong(objectStart, normal, objectDistance),
  };
}
