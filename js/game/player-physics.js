import { HALF_LENGTH, HALF_WIDTH } from './rules.js';

// Player motion for Game Mode: acceleration-limited running, turn-rate-limited facing, sprint stamina and separation.
// Pure: it only mutates the player objects it is given. Units are meters and seconds.

export const PLAYER = Object.freeze({
  radius: 0.35,
  topSpeed: 5.5,
  sprintSpeed: 6.8,
  acceleration: 14,
  turnRate: (540 * Math.PI) / 180, // radians per second
  ballSpeedFactor: 0.92, // a player with the ball runs at this fraction of their speed
  staminaDrain: 0.18, // per second while sprinting
  staminaRegen: 0.12, // per second otherwise
  staminaFloor: 0.05, // below this a sprint is refused until the player recovers
  margin: 2, // players may stand this far outside the lines (taking a throw-in or chasing the ball)
});

const TWO_PI = Math.PI * 2;
const wrap = (angle) => ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;

/** Turns `heading` toward `target` by at most `maxStep` radians along the shorter way. */
export function turnToward(heading, target, maxStep) {
  const difference = wrap(target - heading);
  return Math.abs(difference) <= maxStep ? target : wrap(heading + Math.sign(difference) * maxStep);
}

export function createPlayer(slot, heading = 0) {
  return {
    id: slot.id, team: slot.team, role: slot.role,
    x: slot.x, y: slot.y, vx: 0, vy: 0, heading,
    stamina: 1, down: 0, // seconds left lying on the grass after a hard tackle
    action: null, // { type: 'tackle' | 'slide' | 'kick', t, duration } while an action animation runs
    home: { x: slot.x, y: slot.y },
  };
}

/**
 * Advances one player by `dt`. `wish` is { x, y, sprint }: the desired direction (length 0..1) and whether sprint is held.
 * `hasBall` slows the player slightly; `speedScale` is the AI difficulty or fatigue factor.
 */
export function stepPlayer(player, wish, dt, { hasBall = false, speedScale = 1 } = {}) {
  if (player.down > 0) {
    player.down = Math.max(0, player.down - dt);
    player.vx *= Math.max(0, 1 - 8 * dt);
    player.vy *= Math.max(0, 1 - 8 * dt);
  } else {
    const length = Math.hypot(wish.x, wish.y);
    const unit = length > 1 ? { x: wish.x / length, y: wish.y / length } : { x: wish.x, y: wish.y };
    const intent = Math.min(1, length);
    const sprinting = Boolean(wish.sprint) && intent > 0.1 && player.stamina > PLAYER.staminaFloor;
    const sliding = player.action?.type === 'slide';
    const top = (sprinting ? PLAYER.sprintSpeed : PLAYER.topSpeed) * (hasBall ? PLAYER.ballSpeedFactor : 1) * speedScale;
    // A slide carries its momentum: no steering, only friction.
    const desiredX = sliding ? player.vx * 0.9 : unit.x * top;
    const desiredY = sliding ? player.vy * 0.9 : unit.y * top;
    const dx = desiredX - player.vx;
    const dy = desiredY - player.vy;
    const change = Math.hypot(dx, dy);
    const limit = PLAYER.acceleration * dt;
    const scale = change > limit ? limit / change : 1;
    player.vx += dx * scale;
    player.vy += dy * scale;
    if (intent > 0.1 && !sliding) player.heading = turnToward(player.heading, Math.atan2(unit.y, unit.x), PLAYER.turnRate * dt);
    player.stamina = sprinting
      ? Math.max(0, player.stamina - PLAYER.staminaDrain * dt)
      : Math.min(1, player.stamina + PLAYER.staminaRegen * dt);
  }
  player.x = Math.max(-HALF_LENGTH - PLAYER.margin, Math.min(HALF_LENGTH + PLAYER.margin, player.x + player.vx * dt));
  player.y = Math.max(-HALF_WIDTH - PLAYER.margin, Math.min(HALF_WIDTH + PLAYER.margin, player.y + player.vy * dt));
  if (player.action) {
    player.action.t += dt;
    if (player.action.t >= player.action.duration) player.action = null;
  }
}

/** Pushes overlapping players apart (equal masses). A player lying down is not pushed. */
export function separatePlayers(players) {
  const minimum = PLAYER.radius * 2;
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= minimum) continue;
      // Coincident players are separated along a fixed axis so the result stays deterministic.
      const nx = distance > 1e-9 ? dx / distance : 1;
      const ny = distance > 1e-9 ? dy / distance : 0;
      const push = (minimum - distance) / 2;
      const shareA = a.down > 0 ? 0 : b.down > 0 ? 2 : 1;
      const shareB = b.down > 0 ? 0 : a.down > 0 ? 2 : 1;
      a.x -= nx * push * shareA;
      a.y -= ny * push * shareA;
      b.x += nx * push * shareB;
      b.y += ny * push * shareB;
    }
  }
}
