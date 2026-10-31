import { clamp, distance } from './ai-steering.js';
import { HALF_LENGTH, HALF_MOUTH, HALF_WIDTH, attackDirection, opponentOf } from './rules.js';

// The AI's reading of the pitch: where the opposition's influence is (pressure and open space), whether a pass lane can be
// cut, how good a shot is, and a search for the best spot to run to. Pure. Everything is computed from one per-call context
// that holds each player's position now and a moment ahead.

export const PLAYER_SPEED = 5.2; // m/s the AI assumes a defender can run when judging an interception
export const PASS_SPEED = 11; // m/s a typical ground pass travels at
const LOOK_AHEAD = 0.35;

/** A snapshot for one AI decision pass: every player with their current and predicted position. */
export function makeContext(match) {
  const players = match.players.map((p) => ({
    id: p.id, team: p.team, role: p.role, x: p.x, y: p.y, vx: p.vx, vy: p.vy, down: p.down, heading: p.heading,
    fx: p.x + p.vx * LOOK_AHEAD, fy: p.y + p.vy * LOOK_AHEAD,
  }));
  const byTeam = { home: [], away: [] };
  const byId = new Map();
  for (const p of players) { byTeam[p.team].push(p); byId.set(p.id, p); }
  return { match, ball: match.ball, players, byTeam, byId };
}

/**
 * How much the opposition of `team` crowds the point (x, y): 0 empty, 1 fully covered. Each opponent contributes a Gaussian bump
 * of width `sigma` meters around where they will be in a moment, so it rises smoothly as defenders close in.
 */
export function pressureAt(ctx, team, x, y, sigma = 4) {
  let total = 0;
  for (const foe of ctx.byTeam[opponentOf(team)]) {
    if (foe.down > 0) continue;
    const d2 = (foe.fx - x) ** 2 + (foe.fy - y) ** 2;
    total += Math.exp(-d2 / (2 * sigma * sigma));
  }
  return Math.min(1, total);
}

/** Open space at a point for `team`: 1 minus the pressure there. */
export const openness = (ctx, team, x, y, sigma = 4) => 1 - pressureAt(ctx, team, x, y, sigma);

/**
 * The chance (0..1) that an opponent cuts a ground pass from `from` to `to`: for each opponent compare when the ball gets to the
 * closest point of its lane with when they can run there (a logistic of the time margin), then combine them.
 */
export function laneRisk(ctx, team, from, to, speed = PASS_SPEED) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-6) return 0;
  const length = Math.sqrt(length2);
  let safe = 1;
  for (const foe of ctx.byTeam[opponentOf(team)]) {
    if (foe.down > 0) continue;
    const t = clamp(((foe.x - from.x) * dx + (foe.y - from.y) * dy) / length2, 0, 1);
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    const ballTime = (length * t) / speed;
    const foeTime = Math.max(0, Math.hypot(foe.x - px, foe.y - py) - 0.7) / PLAYER_SPEED;
    const risk = 1 / (1 + Math.exp((foeTime - ballTime + 0.1) / 0.2));
    safe *= 1 - risk;
  }
  return clamp(1 - safe, 0, 1);
}

/**
 * How good a shot is from where `player` stands, 0..1: the angle the goal mouth subtends (bigger near and central), fading with
 * distance, reduced for defenders in the line of fire and for a keeper who covers the better corner.
 */
export function shotQuality(ctx, player) {
  const goalX = attackDirection(player.team) * HALF_LENGTH;
  const dx = Math.abs(goalX - player.x);
  if (dx < 0.5) return Math.abs(player.y) <= HALF_MOUTH ? 0.9 : 0;
  const angle = Math.abs(Math.atan2(HALF_MOUTH - player.y, dx) - Math.atan2(-HALF_MOUTH - player.y, dx));
  let quality = clamp(angle / 0.55, 0, 1) * Math.exp(-dx / 16);
  const target = { x: goalX, y: clamp(player.y, -HALF_MOUTH * 0.6, HALF_MOUTH * 0.6) };
  const foes = ctx.byTeam[opponentOf(player.team)];
  for (const foe of foes) {
    if (foe.role === 'GK') continue;
    const sx = target.x - player.x;
    const sy = target.y - player.y;
    const t = clamp(((foe.x - player.x) * sx + (foe.y - player.y) * sy) / (sx * sx + sy * sy), 0, 1);
    if (t > 0.05 && Math.hypot(foe.x - (player.x + sx * t), foe.y - (player.y + sy * t)) < 1.2) quality *= 0.55;
  }
  const keeper = foes.find((f) => f.role === 'GK');
  if (keeper) {
    const farCorner = keeper.y > 0 ? -HALF_MOUTH * 0.62 : HALF_MOUTH * 0.62;
    quality *= 0.7 + 0.3 * clamp(Math.abs(keeper.y - farCorner) / (HALF_MOUTH * 1.2), 0, 1);
  }
  return clamp(quality, 0, 1);
}

/**
 * Searches a square grid of candidate points around `center` (radius `radius`, spacing `step`, kept inside `bounds`
 * { minX, maxX, minY, maxY }) and returns the best by `score(point)`, as { x, y, score }, or null if none qualifies.
 */
export function searchSpots(center, radius, step, bounds, score) {
  let best = null;
  for (let x = center.x - radius; x <= center.x + radius; x += step) {
    for (let y = center.y - radius; y <= center.y + radius; y += step) {
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      if (distance(center, { x, y }) > radius) continue;
      const value = score({ x, y });
      if (value === null || value === undefined) continue;
      if (!best || value > best.score) best = { x, y, score: value };
    }
  }
  return best;
}

/** The pitch bounds the AI will send players to (a little inside the lines). */
export const PITCH_BOUNDS = Object.freeze({ minX: -HALF_LENGTH + 1.5, maxX: HALF_LENGTH - 1.5, minY: -HALF_WIDTH + 1.5, maxY: HALF_WIDTH - 1.5 });
