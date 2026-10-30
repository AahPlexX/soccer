import { BALL, GOAL_HEIGHT, groundPassSpeed, launchVelocity, lobSpeed } from '../ball-physics.js';
import { attackDirection } from './rules.js';

// How players and the ball interact in Game Mode: control, dribbling touches, passing, shooting, tackling, heading and
// goalkeeper saves. Pure: mutates the player and ball objects it is given (the ball is a ball-physics body in meters).

export const CONTROL = Object.freeze({
  reach: 0.55, // a player controls a ball this close to their feet
  maxHeight: 1.1, // and no higher than this (center height above the grass)
  maxRelativeSpeed: 7, // and moving no faster than this relative to the player
  holdRadius: 0.95, // an owner keeps the ball while it stays this close
  touchInterval: 0.35, // seconds between dribbling touches
  touchLead: 0.6, // how far in front of the feet a dribbled ball is aimed to be at the next touch
  trapKeep: 0.25, // fraction of the ball's relative speed left after a first touch
  tackleReach: 0.9,
  slideReach: 1.6,
  tackleDuration: 0.3,
  slideDuration: 0.9,
  slideSpeed: 7.5,
  lobElevation: 0.75,
  passCone: (35 * Math.PI) / 180,
  shotMinSpeed: 11,
  shotMaxSpeed: 28,
  chargeSeconds: 0.8,
  keeperCatchReach: 1.1,
  keeperCatchSpeed: 13,
  keeperCatchHeight: 1.6,
  keeperParrySpeed: 26,
  keeperHeight: 2.2,
  headerHeight: 2.0,
});

const heading = (player) => ({ x: Math.cos(player.heading), y: Math.sin(player.heading) });
const distance2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ballSpeed3d = (ball) => Math.hypot(ball.vx, ball.vy, ball.vz);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** True if `player` can take the ball now: close, low enough, slow enough relative to them, and on their feet. */
export function canControl(player, ball) {
  if (player.down > 0 || player.action?.type === 'slide') return false;
  if (distance2d(player, ball) > CONTROL.reach) return false;
  if (ball.z - BALL.radius > CONTROL.maxHeight) return false;
  return Math.hypot(ball.vx - player.vx, ball.vy - player.vy) <= CONTROL.maxRelativeSpeed;
}

/** The first touch: the ball loses most of its speed relative to the player and settles at their feet. */
export function trapBall(player, ball) {
  ball.vx = player.vx + (ball.vx - player.vx) * CONTROL.trapKeep;
  ball.vy = player.vy + (ball.vy - player.vy) * CONTROL.trapKeep;
  if (ball.vz > 0) ball.vz *= CONTROL.trapKeep;
}

/**
 * One step of the owner carrying the ball. Standing still the ball is held just ahead of their feet; running, they push it
 * ahead every `touchInterval` seconds and it rolls in between, so a defender can get a foot in. Mutates `ball` and `touch`
 * ({ clock }); returns true if the ball is still owned (it ran too far away otherwise).
 */
export function carryBall(player, ball, touch, dt) {
  const gap = distance2d(player, ball);
  if (gap > CONTROL.holdRadius || ball.z - BALL.radius > CONTROL.maxHeight) return false;
  const facing = heading(player);
  const speed = Math.hypot(player.vx, player.vy);
  touch.clock += dt;
  if (speed < 0.6) {
    // Standing: a soft spring toward a spot in front of the feet.
    const aimX = player.x + facing.x * 0.4;
    const aimY = player.y + facing.y * 0.4;
    ball.vx = player.vx + (aimX - ball.x) * 9;
    ball.vy = player.vy + (aimY - ball.y) * 9;
    touch.clock = 0;
  } else if (touch.clock >= CONTROL.touchInterval) {
    touch.clock = 0;
    // The touch is aimed so the ball is about `touchLead` meters in front of the feet at the next touch, whatever the
    // player's speed (rolling friction slows it a little in between), and sideways drift is brought back onto the line.
    const ox = ball.x - player.x;
    const oy = ball.y - player.y;
    const ahead = ox * facing.x + oy * facing.y;
    const side = -ox * facing.y + oy * facing.x;
    const forward = clamp((CONTROL.touchLead - ahead + 0.08) / CONTROL.touchInterval, 0.2, 3);
    const lateral = clamp(-side / CONTROL.touchInterval, -2, 2);
    ball.vx = player.vx + facing.x * forward - facing.y * lateral;
    ball.vy = player.vy + facing.y * forward + facing.x * lateral;
  }
  return true;
}

const passSpeeds = new Map();
function memo(key, make) {
  if (!passSpeeds.has(key)) passSpeeds.set(key, make());
  return passSpeeds.get(key);
}

/** Kicks the ball from where it is toward `target` ({ x, y } in meters), as a ground pass or (`lob`) a lofted one. */
export function kickPass(ball, target, { lob = false } = {}) {
  const dx = target.x - ball.x;
  const dy = target.y - ball.y;
  const meters = Math.max(0.5, Math.round(Math.hypot(dx, dy) * 4) / 4);
  const angle = Math.atan2(dy, dx);
  const launch = lob
    ? { elevation: CONTROL.lobElevation, speed: memo(`lob-${meters}`, () => lobSpeed(meters * 0.93, CONTROL.lobElevation)) }
    : { elevation: 0, speed: memo(`ground-${meters}`, () => groundPassSpeed(meters)) };
  const v = launchVelocity(launch.speed, angle, launch.elevation);
  Object.assign(ball, { vx: v.vx, vy: v.vy, vz: v.vz, wx: 0, wy: 0, wz: 0 });
  if (lob) ball.z = BALL.radius + 0.02;
  return { speed: launch.speed, lob };
}

/**
 * Where to aim a pass at `mate` so it meets them: a ground pass leads a running teammate by the time the ball takes to get
 * there (one refinement is enough at these speeds).
 */
export function leadTarget(ball, mate, lob = false) {
  const meters = Math.hypot(mate.x - ball.x, mate.y - ball.y);
  const speed = lob ? 9 : Math.max(6, groundPassSpeed(Math.max(0.5, Math.round(meters * 4) / 4)) * 0.7);
  const time = meters / speed;
  return { x: mate.x + mate.vx * time * 0.8, y: mate.y + mate.vy * time * 0.8 };
}

/**
 * The teammate a pass should go to. With a held `direction` ({ x, y }, any length) it is the best teammate inside the pass
 * cone around it; with none, the best open teammate in front. Returns the player or null.
 */
export function bestPassTarget(passer, teammates, direction, opponents = []) {
  const held = Math.hypot(direction.x, direction.y) > 0.3;
  const aim = held ? Math.atan2(direction.y, direction.x) : passer.heading;
  const forward = attackDirection(passer.team);
  let best = null;
  let bestScore = -Infinity;
  for (const mate of teammates) {
    if (mate.id === passer.id || mate.down > 0) continue;
    const dx = mate.x - passer.x;
    const dy = mate.y - passer.y;
    const meters = Math.hypot(dx, dy);
    if (meters < 2) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - aim), Math.cos(Math.atan2(dy, dx) - aim)));
    if (held && off > CONTROL.passCone) continue;
    // Openness: the nearest opponent to the passing lane (the closer, the riskier).
    let clearance = 99;
    for (const foe of opponents) {
      const t = clamp(((foe.x - passer.x) * dx + (foe.y - passer.y) * dy) / (meters * meters), 0, 1);
      clearance = Math.min(clearance, Math.hypot(foe.x - (passer.x + dx * t), foe.y - (passer.y + dy * t)));
    }
    const score = (held ? -off * 6 : 0) + Math.min(clearance, 5) * 1.2 + (dx * forward) * 0.15 - Math.abs(meters - 12) * 0.12;
    if (score > bestScore) { bestScore = score; best = mate; }
  }
  return best;
}

/**
 * Strikes the ball for a shot. `power` is 0..1 (the charge), `aim` a unit { x, y }, `curl` -1..1 sideways bend. A bigger
 * charge is both faster and higher, so a full-power shot can go over the bar.
 */
export function kickShot(ball, power, aim, curl = 0) {
  const charge = clamp(power, 0, 1);
  const speed = CONTROL.shotMinSpeed + (CONTROL.shotMaxSpeed - CONTROL.shotMinSpeed) * charge;
  const elevation = 0.03 + 0.42 * charge * charge;
  const v = launchVelocity(speed, Math.atan2(aim.y, aim.x), elevation);
  Object.assign(ball, { vx: v.vx, vy: v.vy, vz: v.vz, wx: 0, wy: 0, wz: clamp(curl, -1, 1) * 60 });
  ball.z = Math.max(ball.z, BALL.radius + 0.02);
  return { speed, elevation };
}

/** Nudges a shot direction onto the goal when it is already roughly aimed there (within about 20 degrees). */
export function assistedAim(player, direction) {
  const length = Math.hypot(direction.x, direction.y);
  const aim = length > 0.1 ? { x: direction.x / length, y: direction.y / length } : heading(player);
  const goalX = attackDirection(player.team) * 27.432;
  const toGoal = Math.atan2(clamp(player.y, -2.5, 2.5) - player.y, goalX - player.x);
  const wanted = Math.atan2(aim.y, aim.x);
  const off = Math.atan2(Math.sin(wanted - toGoal), Math.cos(wanted - toGoal));
  if (Math.abs(off) > (20 * Math.PI) / 180) return aim;
  const blend = toGoal + off * 0.4;
  return { x: Math.cos(blend), y: Math.sin(blend) };
}

/** Starts a tackle: a quick stand tackle, or (with a direction held) a long slide that commits the player to the move. */
export function startTackle(player, { slide = false } = {}) {
  if (player.action || player.down > 0) return false;
  if (slide) {
    player.action = { type: 'slide', t: 0, duration: CONTROL.slideDuration };
    const facing = heading(player);
    player.vx = facing.x * CONTROL.slideSpeed;
    player.vy = facing.y * CONTROL.slideSpeed;
  } else {
    player.action = { type: 'tackle', t: 0, duration: CONTROL.tackleDuration };
  }
  return true;
}

/**
 * While `tackler` is mid-tackle, what it touches: 'ball' (it dislodges the ball), 'foul' (a slide that hit a player who did not
 * have the ball), or null. Mutates the ball when it is won.
 */
export function tackleContact(tackler, ball, opponents, ballOwnerId) {
  const action = tackler.action;
  if (!action || (action.type !== 'tackle' && action.type !== 'slide') || action.t < 0.05 || action.t > action.duration * 0.85) return null;
  const reach = action.type === 'slide' ? CONTROL.slideReach : CONTROL.tackleReach;
  const facing = heading(tackler);
  const toBall = { x: ball.x - tackler.x, y: ball.y - tackler.y };
  const gap = Math.hypot(toBall.x, toBall.y);
  if (gap <= reach && ball.z - BALL.radius <= 0.6 && (gap < 0.3 || (toBall.x * facing.x + toBall.y * facing.y) / gap > 0.2)) {
    const push = 4.5;
    ball.vx = facing.x * push + tackler.vx * 0.3;
    ball.vy = facing.y * push + tackler.vy * 0.3;
    for (const foe of opponents) if (foe.id === ballOwnerId) foe.down = Math.max(foe.down, 0.35);
    action.t = Math.max(action.t, action.duration * 0.85);
    return 'ball';
  }
  if (action.type === 'slide') {
    for (const foe of opponents) {
      if (foe.id === ballOwnerId || foe.down > 0) continue;
      if (distance2d(tackler, foe) <= 0.75) { foe.down = 0.6; action.t = action.duration; return 'foul'; }
    }
  }
  return null;
}

/** A header: a ball at head height close to a player is redirected along their heading, weaker than a kick. */
export function headerContact(player, ball) {
  const height = ball.z - BALL.radius;
  if (player.down > 0 || height < CONTROL.maxHeight || height > CONTROL.headerHeight) return false;
  if (distance2d(player, ball) > 0.6 || ballSpeed3d(ball) > 14) return false;
  const facing = heading(player);
  const speed = ballSpeed3d(ball) * 0.6 + 3.5;
  Object.assign(ball, { vx: facing.x * speed, vy: facing.y * speed, vz: 1.2 });
  return true;
}

/**
 * A goalkeeper against the ball: 'catch' (slow and low enough to hold), 'parry' (pushed away: faster or higher), or null.
 * Mutates the ball on a parry; the caller gives the keeper possession on a catch.
 */
export function keeperContact(keeper, ball) {
  const height = ball.z - BALL.radius;
  if (keeper.down > 0 || height > CONTROL.keeperHeight || distance2d(keeper, ball) > CONTROL.keeperCatchReach) return null;
  const speed = ballSpeed3d(ball);
  if (speed <= CONTROL.keeperCatchSpeed && height <= CONTROL.keeperCatchHeight) return 'catch';
  if (speed <= CONTROL.keeperParrySpeed) {
    const out = attackDirection(keeper.team);
    const side = ball.y >= keeper.y ? 1 : -1;
    Object.assign(ball, { vx: out * Math.max(3, speed * 0.3), vy: side * Math.max(3, speed * 0.25), vz: 2 });
    return 'parry';
  }
  return null;
}

/** True if a ball at `z` crossing a goal line is below the crossbar (a shot that is still a goal chance). */
export const underBar = (z) => z <= GOAL_HEIGHT;
