import { PITCH } from './constants.js';

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (from, to, amount) => from + (to - from) * amount;

/** Shortest distance from `point` to the segment `from`→`to` (to `from` when the segment has no length). */
export function distanceToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared) : 0;
  return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
}

export function moveToward(point, target, maxDistance) {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || length <= maxDistance) return { x: target.x, y: target.y };
  const ratio = maxDistance / length;
  return { x: point.x + dx * ratio, y: point.y + dy * ratio };
}

export function pitchPointFromClient(svg, world, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = world.getScreenCTM();
  if (!matrix) return { x: 0.5, y: 0.5 };
  const local = point.matrixTransform(matrix.inverse());
  return { x: clamp(local.x / 1000), y: clamp(local.y / 680) };
}

export function homeAttackOffsideLimit(players, ball) {
  const awayXs = players.filter((p) => p.team === 'away').map((p) => p.x).sort((a, b) => b - a);
  const secondLastDefender = awayXs[1] ?? PITCH.awayGoalLineX;
  return Math.max(PITCH.awayBuildOutX, ball.x, secondLastDefender);
}

export function awayAttackOffsideLimit(players, ball) {
  const homeXs = players.filter((p) => p.team === 'home').map((p) => p.x).sort((a, b) => a - b);
  const secondLastDefender = homeXs[1] ?? PITCH.homeGoalLineX;
  return Math.min(PITCH.homeBuildOutX, ball.x, secondLastDefender);
}

export function clampSupportForOffside(player, target, players, ball) {
  if (player.role === 'GK') return target;
  if (player.team === 'home') {
    return { ...target, x: Math.min(target.x, homeAttackOffsideLimit(players, ball) - 0.01) };
  }
  return { ...target, x: Math.max(target.x, awayAttackOffsideLimit(players, ball) + 0.01) };
}
