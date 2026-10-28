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

// The SVG world is 1000 × 680 (render.js), so one unit of y is shorter on screen than one unit of x.
export const PITCH_ASPECT = 0.68;

/** Distance as drawn on screen: y differences are scaled by the pitch aspect ratio. */
export const spacingDistance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * PITCH_ASPECT);

/**
 * Pushes players apart until none are closer than `minimum` (screen-space distance). Each overlap is split evenly;
 * a player in `fixedIds` stays put and the other yields. Coincident players separate along x. Passes repeat (at most
 * 24, enough for a swarm of 14 around one ball) until nothing moves, which settles chains and pitch-edge clamping; positions stay on the pitch.
 */
export function separatePlayers(players, minimum, fixedIds = []) {
  for (let pass = 0, moved = true; moved && pass < 24; pass += 1) {
    moved = false;
    for (let i = 0; i < players.length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const a = players[i];
        const b = players[j];
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * PITCH_ASPECT;
        const gap = Math.hypot(dx, dy);
        const aFixed = fixedIds.includes(a.id);
        const bFixed = fixedIds.includes(b.id);
        if (gap >= minimum || (aFixed && bFixed)) continue;
        const [ux, uy] = gap ? [dx / gap, dy / gap] : [1, 0];
        moved = true;
        const push = minimum - gap;
        const aShare = aFixed ? 0 : bFixed ? 1 : 0.5;
        const bShare = 1 - aShare;
        a.x = clamp(a.x - ux * push * aShare);
        a.y = clamp(a.y - (uy / PITCH_ASPECT) * push * aShare);
        b.x = clamp(b.x + ux * push * bShare);
        b.y = clamp(b.y + (uy / PITCH_ASPECT) * push * bShare);
      }
    }
  }
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
