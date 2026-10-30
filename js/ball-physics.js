// Ball physics (1.0.20): a small, deterministic, dependency-free rigid-ball model in SI units (meters, seconds, radians).
//
// The pitch frame has its origin at the pitch center: x along the length, y across the width, z up. `z` is the height of
// the ball's CENTER, so the ball rests on the grass at z === BALL.radius. State is a plain object:
//   { x, y, z, vx, vy, vz, wx, wy, wz }   position (m), velocity (m/s), spin (rad/s, right-hand rule)
//
// Forces and contacts, with constants grounded in the sports-aerodynamics literature (wind-tunnel and trajectory studies of
// soccer balls): quadratic air drag whose coefficient falls through the drag crisis (about 0.45 for slow balls to about 0.2
// above about 20 m/s), Magnus lift proportional to the spin parameter, gravity, a bounce whose restitution fades to a dead
// stick at low impact speed, Coulomb sliding friction that couples linear and angular velocity until the ball rolls, constant
// rolling resistance on grass, and sphere-versus-capsule collisions for goal posts and crossbars. The integrator uses a fixed
// 1/240 s substep, so identical inputs always give identical output, and every force is isotropic about the vertical axis:
// rotating a scenario a half turn about it rotates the trajectory with it (the flipped board relies on that).

export const BALL = Object.freeze({ mass: 0.37, radius: 0.105, inertiaFactor: 2 / 3 }); // a size-4 ball, a thin shell
export const WORLD = Object.freeze({
  gravity: 9.81,
  airDensity: 1.2,
  restitution: 0.62, // vertical bounce on firm grass at impact speeds above ~3.6 m/s
  slidingFriction: 0.45,
  rollingDecel: 1.3, // m/s^2 lost to the grass while rolling, on top of air drag
  spinDecay: 0.1, // 1/s, spin lost to the air
  restSpeed: 0.05, // below this speed (m/s) a grounded ball stops
  substep: 1 / 240,
  maxSubstepTravel: 0.03, // meters
});
export const POST = Object.freeze({ radius: 0.06, restitution: 0.6, friction: 0.15 });
export const GOAL_HEIGHT = 2.0; // meters, the underside of the crossbar (the 3D frame is 2.2 yards = 2.0 m)

// Gravity gives a resting ball a small downward speed every substep; only a faster approach counts as an impact (a bounce).
const IMPACT_SPEED = 0.25;
const AREA = Math.PI * BALL.radius * BALL.radius;
const SPIN_INERTIA = BALL.inertiaFactor * BALL.mass * BALL.radius * BALL.radius;

/** A ball at rest on the grass at (x, y). */
export const restingBall = (x = 0, y = 0) => ({ x, y, z: Number(BALL.radius), vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 });

/** Drag coefficient by speed: high while the flow is laminar, low once it is turbulent (the drag crisis, ~10 to ~22 m/s). */
export function dragCoefficient(speed) {
  const t = Math.min(1, Math.max(0, (speed - 10) / 12));
  return 0.45 - 0.23 * t;
}

/** Bounce restitution for a normal impact speed: nothing at a trickle, full above ~3.6 m/s, so bounces die out cleanly. */
export const restitution = (normalSpeed) => WORLD.restitution * Math.min(1, Math.max(0, (normalSpeed - 0.6) / 3));

export const speedOf = (b) => Math.hypot(b.vx, b.vy, b.vz);

/** Kinetic plus potential energy above the grass (joules): used to check that nothing ever gains energy. */
export function ballEnergy(b) {
  const linear = 0.5 * BALL.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const rotational = 0.5 * SPIN_INERTIA * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
  return linear + rotational + BALL.mass * WORLD.gravity * (b.z - BALL.radius);
}

export const isGrounded = (b) => b.z <= BALL.radius + 1e-6;
export const isResting = (b) => isGrounded(b) && Math.hypot(b.vx, b.vy) < WORLD.restSpeed && Math.abs(b.vz) < 1e-3
  && BALL.radius * Math.hypot(b.wx, b.wy, b.wz) < WORLD.restSpeed;

/**
 * Static capsules for the two goals: posts and crossbar, as { a, b, radius } segments.
 * @param {{ halfLength: number, halfMouth: number, height?: number }} goal pitch half length and half goal width (m)
 */
export function goalColliders({ halfLength, halfMouth, height = GOAL_HEIGHT }) {
  const colliders = [];
  for (const x of [-halfLength, halfLength]) {
    colliders.push(
      { a: { x, y: -halfMouth, z: 0 }, b: { x, y: -halfMouth, z: height }, radius: POST.radius },
      { a: { x, y: halfMouth, z: 0 }, b: { x, y: halfMouth, z: height }, radius: POST.radius },
      { a: { x, y: -halfMouth, z: height }, b: { x, y: halfMouth, z: height }, radius: POST.radius },
    );
  }
  return colliders;
}

function applyAirForces(b, h) {
  const speed = speedOf(b);
  let ax = 0;
  let ay = 0;
  let az = -WORLD.gravity;
  if (speed > 1e-6) {
    const drag = (0.5 * WORLD.airDensity * dragCoefficient(speed) * AREA * speed) / BALL.mass; // a = -drag * v
    ax -= drag * b.vx;
    ay -= drag * b.vy;
    az -= drag * b.vz;
    const spin = Math.hypot(b.wx, b.wy, b.wz);
    if (spin > 1e-6) {
      const lift = Math.min(0.35, (BALL.radius * spin) / speed); // lift coefficient grows with the spin parameter
      const scale = (0.5 * WORLD.airDensity * AREA * lift * speed) / (BALL.mass * spin); // a = scale * (w x v)
      ax += scale * (b.wy * b.vz - b.wz * b.vy);
      ay += scale * (b.wz * b.vx - b.wx * b.vz);
      az += scale * (b.wx * b.vy - b.wy * b.vx);
    }
  }
  b.vx += ax * h;
  b.vy += ay * h;
  b.vz += az * h;
  const decay = Math.exp(-WORLD.spinDecay * h);
  b.wx *= decay;
  b.wy *= decay;
  b.wz *= decay;
}

// Friction at the grass contact: an impulse (per unit mass) opposite the slip of the contact point, capped by Coulomb's law,
// that changes the linear and the angular velocity together until the ball rolls without slipping.
function applyContactFriction(b, maxImpulse) {
  const slipX = b.vx - BALL.radius * b.wy;
  const slipY = b.vy + BALL.radius * b.wx;
  const slip = Math.hypot(slipX, slipY);
  if (slip < 1e-9) return;
  const stop = slip / (1 + 1 / BALL.inertiaFactor); // the impulse that would just end the slip
  const j = Math.min(maxImpulse, stop);
  const dx = -slipX / slip;
  const dy = -slipY / slip;
  b.vx += j * dx;
  b.vy += j * dy;
  b.wx += (j * dy) / (BALL.inertiaFactor * BALL.radius);
  b.wy -= (j * dx) / (BALL.inertiaFactor * BALL.radius);
}

function contactGround(b, h) {
  if (b.z > BALL.radius) return;
  b.z = BALL.radius;
  if (b.vz < -IMPACT_SPEED) {
    // Impact: bounce with a speed-dependent restitution, and let friction act through the contact during the impact.
    const normal = -b.vz;
    const e = restitution(normal);
    b.vz = e * normal;
    applyContactFriction(b, WORLD.slidingFriction * (1 + e) * normal);
    return;
  }
  // Grounded: no vertical motion, friction toward rolling, then rolling resistance.
  b.vz = 0;
  applyContactFriction(b, WORLD.slidingFriction * WORLD.gravity * h);
  const speed = Math.hypot(b.vx, b.vy);
  const loss = WORLD.rollingDecel * h;
  if (speed <= Math.max(loss, WORLD.restSpeed * 0.5)) {
    b.vx = 0;
    b.vy = 0;
    b.wx = 0;
    b.wy = 0;
    b.wz *= 0.5;
    return;
  }
  const keep = (speed - loss) / speed;
  b.vx *= keep;
  b.vy *= keep;
  // Keep the spin consistent with rolling as the ball slows.
  b.wy = b.vx / BALL.radius;
  b.wx = -b.vy / BALL.radius;
}

function closestOnSegment(p, a, c) {
  const abx = c.x - a.x;
  const aby = c.y - a.y;
  const abz = c.z - a.z;
  const lengthSquared = abx * abx + aby * aby + abz * abz;
  const t = lengthSquared ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lengthSquared)) : 0;
  return { x: a.x + abx * t, y: a.y + aby * t, z: a.z + abz * t };
}

function collide(b, colliders) {
  for (const { a, b: end, radius } of colliders) {
    const closest = closestOnSegment(b, a, end);
    const dx = b.x - closest.x;
    const dy = b.y - closest.y;
    const dz = b.z - closest.z;
    const distance = Math.hypot(dx, dy, dz);
    const reach = BALL.radius + radius;
    if (distance >= reach || distance < 1e-9) continue;
    const nx = dx / distance;
    const ny = dy / distance;
    const nz = dz / distance;
    const push = reach - distance;
    b.x += nx * push;
    b.y += ny * push;
    b.z += nz * push;
    const into = b.vx * nx + b.vy * ny + b.vz * nz;
    if (into >= 0) continue;
    // Reflect the normal part with the post's restitution; the tangential part loses a little to friction.
    const tx = b.vx - into * nx;
    const ty = b.vy - into * ny;
    const tz = b.vz - into * nz;
    const keep = 1 - POST.friction;
    const bounce = -POST.restitution * into;
    b.vx = tx * keep + bounce * nx;
    b.vy = ty * keep + bounce * ny;
    b.vz = tz * keep + bounce * nz;
  }
}

/** Advances the ball by `dt` seconds in fixed substeps. Mutates and returns `b`. */
export function stepBall(b, dt, colliders = []) {
  // A fast ball must not cross a thin post inside one substep, or the contact normal is unreliable: cap the travel per substep.
  const travel = Math.hypot(b.vx, b.vy, b.vz) * dt;
  const steps = Math.max(1, Math.ceil(dt / WORLD.substep - 1e-9), Math.ceil(travel / WORLD.maxSubstepTravel - 1e-9));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    applyAirForces(b, h);
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    if (colliders.length) collide(b, colliders);
    contactGround(b, h);
  }
  return b;
}

/** A launch velocity from a horizontal speed, a heading (radians from +x toward +y) and an elevation above the ground. */
export function launchVelocity(speed, heading, elevation) {
  const horizontal = speed * Math.cos(elevation);
  return { vx: horizontal * Math.cos(heading), vy: horizontal * Math.sin(heading), vz: speed * Math.sin(elevation) };
}

// A ball launched from the grass along +x at `speed` and `elevation`, nudged just off the ground so it is airborne.
function launched(speed, elevation, spin = 0) {
  const ball = { ...restingBall(0, 0), ...launchVelocity(speed, 0, elevation), wy: spin };
  ball.z = BALL.radius + 1e-4;
  return ball;
}

/**
 * Flies a ball launched from the grass along +x and reports where it is once it has covered `distance` meters horizontally:
 * { height, speed, time } for the ball center, or null if it lands (or, for a ground ball, stops) first.
 */
export function flightAt(speed, elevation, distance, spin = 0) {
  const ball = launched(speed, elevation, spin);
  const h = 1 / 120;
  for (let t = 0, fall = 0; t < 8; t += h, fall = ball.vz) {
    stepBall(ball, h);
    if (ball.x >= distance) return { height: ball.z, speed: speedOf(ball), time: t + h };
    // Landing is the downward velocity turning upward (or to rest): a bounce lifts the ball off the grass again within one step.
    const landed = elevation > 0 && t > 0.05 && fall < 0 && ball.vz >= 0;
    if (landed || (elevation === 0 && Math.hypot(ball.vx, ball.vy) < WORLD.restSpeed)) return null;
  }
  return null;
}

/** The launch speed for a ground pass that reaches `distance` m still rolling at `arriveSpeed` m/s, clamped to [minSpeed, maxSpeed]. */
export function groundPassSpeed(distance, arriveSpeed = 6, minSpeed = 7, maxSpeed = 30) {
  let low = 0.1;
  let high = maxSpeed;
  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    const reached = flightAt(mid, 0, distance);
    if (reached && reached.speed >= arriveSpeed) high = mid; else low = mid;
  }
  return Math.min(maxSpeed, Math.max(minSpeed, high));
}

/** How far (m) a ball launched at `speed` and `elevation` travels before its first landing, or the cap if it never lands in 8 s. */
export function landingRange(speed, elevation) {
  const ball = launched(speed, elevation);
  const h = 1 / 120;
  for (let t = 0, fall = 0; t < 8; t += h, fall = ball.vz) {
    stepBall(ball, h);
    if (t > 0.05 && fall < 0 && ball.vz >= 0) return ball.x;
  }
  return ball.x;
}

/** The launch speed that lands a ball launched at `elevation` (radians) `distance` m away, clamped to [minSpeed, maxSpeed]. */
export function lobSpeed(distance, elevation, minSpeed = 6, maxSpeed = 36) {
  let low = minSpeed;
  let high = maxSpeed;
  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    if (landingRange(mid, elevation) < distance) low = mid; else high = mid;
  }
  return Math.min(maxSpeed, Math.max(minSpeed, high));
}

/** The elevation (radians) that makes a ball launched at `speed` pass height `targetHeight` after `distance` m, in [0, maxElevation]. */
export function shotElevation(speed, distance, targetHeight, maxElevation = 0.9) {
  let low = 0;
  let high = maxElevation;
  for (let i = 0; i < 30; i += 1) {
    const mid = (low + high) / 2;
    const reached = flightAt(speed, mid, distance);
    if (!reached || reached.height < targetHeight) low = mid; else high = mid; // landing short means the shot was too low
  }
  return high;
}
