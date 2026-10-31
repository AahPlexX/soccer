import { arrive, clamp, distance, interceptPoint, unit } from './ai-steering.js';
import { nextRandom } from './match.js';
import { HALF_LENGTH, HALF_MOUTH, PENALTY_DEPTH, PENALTY_HALF_WIDTH, attackDirection, opponentOf } from './rules.js';

// The goalkeeper's behavior when it does not have the ball (with the ball it uses the carrier decision like anyone else, held
// longer). States: track an incoming shot by predicting where it crosses the line; come out for a loose ball in the area; rush
// out to narrow the angle of an attacker running at goal; otherwise stand on the line between the ball and the goal center at a
// depth that grows as the ball gets nearer. Skill scales how well the keeper reads a shot; `seen` is the ball as the keeper
// perceived it (a reaction time ago), so a better keeper reacts faster.

const SHOT_SPEED = 4.5; // m/s toward goal that makes a ball a shot

/** The keeper's state name for a situation (used by the controller and checked in tests). */
export function keeperState(ctx, keeper, seen) {
  const { match } = ctx;
  const dir = attackDirection(keeper.team);
  const goalX = -dir * HALF_LENGTH;
  const speed = Math.hypot(seen.vx, seen.vy);
  const towardGoal = seen.vx * -dir;
  if (towardGoal > SHOT_SPEED && match.lastTouch.team !== keeper.team) {
    const t = (goalX - seen.x) / seen.vx;
    const crossesAt = seen.y + seen.vy * t;
    if (t > 0 && Math.abs(crossesAt) <= HALF_MOUTH + 2) return 'track';
  }
  const inBox = Math.abs(seen.x - goalX) <= PENALTY_DEPTH && Math.abs(seen.y) <= PENALTY_HALF_WIDTH;
  const holder = match.owner ? ctx.byId.get(match.owner) : null;
  if (!holder && inBox && speed < 7 && match.lastTouch.team !== keeper.team) {
    const mine = distance(keeper, seen);
    const foeCloser = ctx.byTeam[opponentOf(keeper.team)].some((f) => f.down <= 0 && distance(f, seen) < mine - 0.5);
    if (!foeCloser) return 'sweep';
  }
  if (holder && holder.team !== keeper.team && Math.abs(holder.x - goalX) <= 14 && Math.abs(holder.y) <= PENALTY_HALF_WIDTH + 2) return 'rush';
  return 'set';
}

/** The keeper's control: { move, sprint, state } for the current state. */
export function keeperControl(ctx, profile, keeper, seen) {
  const dir = attackDirection(keeper.team);
  const goalX = -dir * HALF_LENGTH;
  const goal = { x: goalX, y: 0 };
  const state = keeperState(ctx, keeper, seen);

  if (state === 'track') {
    const t = (goalX - seen.x) / seen.vx;
    const predicted = seen.y + seen.vy * Math.max(0, t) * 0.95;
    const error = (nextRandom(ctx.match) - 0.5) * 2 * (1 - profile.keeperSkill) * 1.6;
    const aimY = clamp(predicted + error, -HALF_MOUTH - 0.5, HALF_MOUTH + 0.5);
    const targetY = keeper.y + (aimY - keeper.y) * (0.55 + 0.45 * profile.keeperSkill);
    return { move: arrive(keeper, { x: goalX + dir * 1.2, y: targetY }, 1, 1), sprint: true, state };
  }
  if (state === 'sweep') {
    const point = interceptPoint(keeper, 5.5, seen, 2.5);
    return { move: arrive(keeper, point, 1, 1), sprint: true, state };
  }
  if (state === 'rush') {
    const holder = ctx.byId.get(ctx.match.owner);
    const gap = distance(holder, goal);
    const out = clamp(gap * 0.35, 1.5, 6);
    const line = unit(holder.x - goal.x, holder.y - goal.y);
    const target = { x: goal.x + line.x * out, y: clamp(goal.y + line.y * out, -HALF_MOUTH * 1.2, HALF_MOUTH * 1.2) };
    return { move: arrive(keeper, target, 1, 1.5), sprint: gap < 10, state };
  }
  // Set: on the line from the goal center to the ball, deeper when the ball is far.
  const toBall = unit(seen.x - goal.x, seen.y - goal.y);
  const depth = clamp(1.5 + distance(seen, goal) * 0.05, 1.5, 4);
  const target = { x: goal.x + toBall.x * depth, y: clamp(toBall.y * depth * 1.8, -HALF_MOUTH * 0.95, HALF_MOUTH * 0.95) };
  return { move: arrive(keeper, target, 0.8, 2), sprint: false, state };
}
