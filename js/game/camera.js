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
  return clamp(22 + 10 * (Number.isFinite(aspect) ? aspect : 1), 22, 42);
}

/** Pixels per meter for a viewport. */
export function scaleFor(view) {
  return view.width / visibleWidthFor(view.width / Math.max(1, view.height));
}

export function createCamera() {
  return { x: 0, y: 0, vx: 0, vy: 0, scale: 20, vs: 0 };
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
  target.width = targetWidth(match, view);
  return target;
}

/**
 * How many meters of pitch width to show: the normal width for the screen, widened when the ball and the active player are far
 * apart so both stay in view (up to the whole pitch plus margins), never narrower than normal.
 */
export function targetWidth(match, view) {
  const normal = visibleWidthFor(view.width / Math.max(1, view.height));
  const active = match.players.find((p) => p.id === match.activeId);
  if (!active) return normal;
  const spanX = Math.abs(match.ball.x - active.x) + 8;
  const spanY = Math.abs(match.ball.y - active.y) + 6;
  // Convert the vertical span into the width that would show it (the view is wider than tall by view.width / (view.height / tilt)).
  const widthForY = (spanY / 0.8) * (view.width / (view.height / CAMERA.tilt));
  return clamp(Math.max(normal, spanX / 0.8, widthForY), normal, Math.max(normal, HALF_LENGTH * 2 + 2 * CAMERA.margin));
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
  // Zoom eases to the wanted width (slower than panning, so a pass does not make the view pump in and out).
  const wantedScale = view.width / (target.width ?? visibleWidthFor(view.width / Math.max(1, view.height)));
  const zoom = smoothDamp(camera.scale, wantedScale, camera.vs ?? 0, 0.6, dt);
  camera.scale = zoom.value;
  camera.vs = zoom.velocity;
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

/**
 * A copy of the camera whose position sits on the device-pixel grid, so everything drawn through it lands on whole pixels
 * (a smoothly moving camera would otherwise make pixel art shimmer). `ratio` is the device pixel ratio.
 */
export function snapToPixels(camera, ratio = 1) {
  const stepX = 1 / (camera.scale * ratio);
  const stepY = 1 / (camera.scale * CAMERA.tilt * ratio);
  return { ...camera, x: Math.round(camera.x / stepX) * stepX, y: Math.round(camera.y / stepY) * stepY };
}

/** A pixel size rounded to a whole number of device pixels (never below one), so scaled pixel art keeps even pixels. */
export function wholePixels(size, ratio = 1) {
  return Math.max(1, Math.round(size * ratio)) / ratio;
}

/**
 * Where to draw an edge marker for a world point that is off screen: { x, y, angle } on the border of the view (inset by
 * `inset` pixels) pointing toward the point, or null while the point is on screen. `z` lifts a ball in the air.
 */
export function edgeIndicator(camera, view, point, inset = 30, z = 0) {
  const screen = project(camera, view, point.x, point.y, z);
  if (screen.x >= 0 && screen.x <= view.width && screen.y >= 0 && screen.y <= view.height) return null;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const dx = screen.x - cx;
  const dy = screen.y - cy;
  const scale = Math.min((cx - inset) / Math.max(1e-9, Math.abs(dx)), (cy - inset) / Math.max(1e-9, Math.abs(dy)));
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx) };
}
