// Steering behaviors and interception for the Game Mode AI. Pure vector math in meters and seconds; every function returns a
// desired movement vector of length 0..1 (the control `move`) or a point, and never mutates its inputs.

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const unit = (dx, dy) => { const length = Math.hypot(dx, dy); return length < 1e-9 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length }; };

/** Limits a vector to length 1. */
export function capLength(vector) {
  const length = Math.hypot(vector.x, vector.y);
  return length > 1 ? { x: vector.x / length, y: vector.y / length } : vector;
}

/** Head for `target` at `speed` (0..1), easing to a stop inside `slow` meters (the classic "arrive"). */
export function arrive(from, target, speed = 1, slow = 3) {
  const gap = distance(from, target);
  if (gap < 0.3) return { x: 0, y: 0 };
  const scale = Math.min(1, gap / slow) * speed;
  return { x: ((target.x - from.x) / gap) * scale, y: ((target.y - from.y) / gap) * scale };
}

/**
 * Where a ball on the grass will be after `time` seconds, rolling to a stop under friction (about `decel` m/s^2). Height is
 * ignored: callers use it for ground and low balls.
 */
export function ballAt(ball, time, decel = 1.4) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed < 1e-6) return { x: ball.x, y: ball.y };
  const stopTime = speed / decel;
  const t = Math.min(time, stopTime);
  const travelled = speed * t - 0.5 * decel * t * t;
  return { x: ball.x + (ball.vx / speed) * travelled, y: ball.y + (ball.vy / speed) * travelled };
}

/**
 * The earliest point a runner at `chaser` moving at up to `speed` m/s can meet a rolling ball: { x, y, t }. If it can never
 * catch the ball within `horizon` seconds, the point is where the ball ends up and `t` is the time to run there.
 */
export function interceptPoint(chaser, speed, ball, horizon = 3, decel = 1.4) {
  for (let t = 0.05; t <= horizon; t += 0.05) {
    const point = ballAt(ball, t, decel);
    if (distance(chaser, point) <= speed * t) return { x: point.x, y: point.y, t };
  }
  const rest = ballAt(ball, 60, decel);
  return { x: rest.x, y: rest.y, t: distance(chaser, rest) / Math.max(0.1, speed) };
}

/** Push away from nearby teammates (or anyone) closer than `radius`, so players do not clump. Length 0..1. */
export function separation(from, others, radius = 2.2) {
  let x = 0;
  let y = 0;
  for (const other of others) {
    const gap = distance(from, other);
    if (gap > 1e-6 && gap < radius) {
      const weight = (radius - gap) / radius;
      x += ((from.x - other.x) / gap) * weight;
      y += ((from.y - other.y) / gap) * weight;
    }
  }
  return capLength({ x, y });
}

/**
 * Weighted sum of steering vectors, capped to length 1. `parts` is [{ v: { x, y }, w }]. A zero-weight or zero-length part
 * contributes nothing.
 */
export function blend(parts) {
  let x = 0;
  let y = 0;
  for (const { v, w } of parts) { x += v.x * w; y += v.y * w; }
  return capLength({ x, y });
}

/** The point at `fraction` of the way from `a` to `b`. */
export const lerpPoint = (a, b, fraction) => ({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });

/** A point on the side of `target` facing `toward`, `offset` meters from it (for marking goal-side and jockeying). */
export function shadowPoint(target, toward, offset) {
  const direction = unit(toward.x - target.x, toward.y - target.y);
  return { x: target.x + direction.x * offset, y: target.y + direction.y * offset };
}
