import { HALF_LENGTH, HALF_WIDTH, attackDirection } from './rules.js';

// The Game Mode follow camera. It looks ahead of the ball, ignores small ball movements (a dead zone), eases with a critically
// damped spring so it never jerks or overshoots, keeps the active player in view, and stays inside the pitch plus a margin.
// Pure: it only moves numbers. `view` is { width, height } in CSS pixels. The world is meters; the screen is a 3/4 top-down
// projection: the y axis is squashed by TILT and a ball's height lifts it up the screen.

export const CAMERA = Object.freeze({
  lookAhead: 0.35, // seconds of ball velocity the camera leads by
  maxLead: 8, // meters, the cap on that lead
  attackBias: 2, // meters toward the attacking goal while the human team has the ball
  deadzone: 0.12, // fraction of the visible size the ball may roam from the center before the camera follows
  smoothTime: 0.25, // seconds, the spring's time constant at rest
  margin: 3, // meters of space shown beyond the touchlines and goal lines
  tilt: 0.78, // vertical squash of the 3/4 view
  lift: 0.9, // pixels of screen lift per meter of ball height, relative to the scale
});

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** How many meters of pitch width to show for a viewport aspect ratio (wide screens show more, portrait phones less). */
export function visibleWidthFor(aspect) {
  return clamp(14 + 8 * (Number.isFinite(aspect) ? aspect : 1), 16, 30);
}

/** Pixels per meter for a viewport. */
export function scaleFor(view) {
  return view.width / visibleWidthFor(view.width / Math.max(1, view.height));
}

export function createCamera() {
  return { x: 0, y: 0, vx: 0, vy: 0, scale: 20 };
}

/** The visible half-extents in meters: { hx, hy }. */
export function halfExtents(camera, view) {
  return { hx: view.width / camera.scale / 2, hy: view.height / (camera.scale * CAMERA.tilt) / 2 };
}

/** Projects a world point (meters, with height z) to screen pixels. */
export function project(camera, view, x, y, z = 0) {
  return {
    x: (x - camera.x) * camera.scale + view.width / 2,
    y: (y - camera.y) * camera.scale * CAMERA.tilt + view.height / 2 - z * camera.scale * CAMERA.lift,
  };
}

/** The ground point under a screen pixel (z = 0): the inverse of `project` for a point on the grass. */
export function unproject(camera, view, sx, sy) {
  return {
    x: (sx - view.width / 2) / camera.scale + camera.x,
    y: (sy - view.height / 2) / (camera.scale * CAMERA.tilt) + camera.y,
  };
}

/** Where the camera wants to look: ahead of the ball, nudged toward the active player so both stay on screen. */
export function cameraTarget(match, camera, view) {
  const { ball } = match;
  const lead = { x: ball.vx * CAMERA.lookAhead, y: ball.vy * CAMERA.lookAhead };
  const leadLength = Math.hypot(lead.x, lead.y);
  if (leadLength > CAMERA.maxLead) { lead.x *= CAMERA.maxLead / leadLength; lead.y *= CAMERA.maxLead / leadLength; }
  const holder = match.owner ? match.players.find((p) => p.id === match.owner) : null;
  const bias = holder?.team === match.humanTeam ? attackDirection(match.humanTeam) * CAMERA.attackBias : 0;
  const target = { x: ball.x + lead.x + bias, y: ball.y + lead.y };
  const active = match.players.find((p) => p.id === match.activeId);
  if (active) {
    // If the active player would fall outside 80% of the view, lean toward them just enough to bring them back in.
    const { hx, hy } = halfExtents(camera, view);
    const pullX = Math.max(0, Math.abs(active.x - target.x) - hx * 0.8);
    const pullY = Math.max(0, Math.abs(active.y - target.y) - hy * 0.8);
    target.x += Math.sign(active.x - target.x) * pullX;
    target.y += Math.sign(active.y - target.y) * pullY;
  }
  return target;
}

function smoothDamp(current, target, velocity, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const damping = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  return { value: target + (change + temp) * damping, velocity: (velocity - omega * temp) * damping };
}

/** The camera center is kept so the view stays inside the pitch plus the margin (centered if the view is bigger than that). */
function clampToPitch(camera, view) {
  const { hx, hy } = halfExtents(camera, view);
  const limitX = HALF_LENGTH + CAMERA.margin - hx;
  const limitY = HALF_WIDTH + CAMERA.margin - hy;
  camera.x = limitX > 0 ? clamp(camera.x, -limitX, limitX) : 0;
  camera.y = limitY > 0 ? clamp(camera.y, -limitY, limitY) : 0;
}

/** Moves the camera toward `target` by `dt` seconds. The ball speed shortens the smoothing so a fast ball cannot outrun it. */
export function stepCamera(camera, target, dt, view, ballSpeed = 0) {
  camera.scale = scaleFor(view);
  const { hx, hy } = halfExtents(camera, view);
  // Dead zone: only the part of the offset beyond the zone is followed.
  const follow = (current, goal, half) => {
    const zone = half * 2 * CAMERA.deadzone;
    const offset = goal - current;
    return Math.abs(offset) <= zone ? current : goal - Math.sign(offset) * zone;
  };
  const smooth = CAMERA.smoothTime / (1 + ballSpeed / 10);
  const px = smoothDamp(camera.x, follow(camera.x, target.x, hx), camera.vx, smooth, dt);
  const py = smoothDamp(camera.y, follow(camera.y, target.y, hy), camera.vy, smooth, dt);
  Object.assign(camera, { x: px.value, y: py.value, vx: px.velocity, vy: py.velocity });
  clampToPitch(camera, view);
  return camera;
}

/** Jumps the camera onto a point (a new match, a kickoff after a goal): no easing. */
export function snapCamera(camera, point, view) {
  Object.assign(camera, { x: point.x, y: point.y, vx: 0, vy: 0, scale: scaleFor(view) });
  clampToPitch(camera, view);
  return camera;
}

/** True if a world point is inside the central `fraction` of the view (for tests and for a "where is the ball" warning). */
export function inCentralView(camera, view, point, fraction = 0.8) {
  const { hx, hy } = halfExtents(camera, view);
  return Math.abs(point.x - camera.x) <= hx * fraction && Math.abs(point.y - camera.y) <= hy * fraction;
}
