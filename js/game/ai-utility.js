import { shotElevation } from '../ball-physics.js';
import { laneRisk, openness, pressureAt, shotQuality } from './ai-space.js';
import { clamp, distance, unit } from './ai-steering.js';
import { nextRandom } from './match.js';
import { HALF_LENGTH, HALF_MOUTH, HALF_WIDTH, attackDirection, opponentOf } from './rules.js';

// Utility AI for the player with the ball. Every option (shoot, each pass, eight dribble directions, hold, clear) gets a score
// from the situation (open space, the chance a lane is cut, progress toward goal, shot quality, pressure), weighted by the
// player's role; a little seeded noise (more on easy levels) and a bonus for sticking with the last choice keep it human and
// steady. The best score wins. Pure: it returns a control, it does not touch the match.

/** How much each kind of player likes each kind of action. */
export const ROLE_TRAITS = Object.freeze({
  GK: { shoot: 0, pass: 1, dribble: 0, forward: 0.35 },
  LD: { shoot: 0.25, pass: 1, dribble: 0.6, forward: 0.6 },
  RD: { shoot: 0.25, pass: 1, dribble: 0.6, forward: 0.6 },
  CD: { shoot: 0.2, pass: 1, dribble: 0.45, forward: 0.55 },
  LM: { shoot: 0.8, pass: 1, dribble: 0.95, forward: 0.9 },
  RM: { shoot: 0.8, pass: 1, dribble: 0.95, forward: 0.9 },
  CM: { shoot: 0.7, pass: 1.05, dribble: 0.85, forward: 0.85 },
  ST: { shoot: 1.25, pass: 0.8, dribble: 1, forward: 1.1 },
});
const DEFAULT_TRAITS = ROLE_TRAITS.CM;

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 4), y: Math.sin((i * Math.PI) / 4) }));

/** A shot at the goal from `player`: a corner away from the keeper, an elevation solved to cross the line at a chosen height. */
export function planShot(match, profile, player) {
  const goalX = attackDirection(player.team) * HALF_LENGTH;
  const keeper = match.players.find((p) => p.team === opponentOf(player.team) && p.role === 'GK');
  const corner = keeper && keeper.y > 0 ? -1 : 1;
  const error = (nextRandom(match) - 0.5) * 2 * profile.shotError;
  const aimY = clamp(corner * HALF_MOUTH * 0.8 + error, -HALF_MOUTH - 1.5, HALF_MOUTH + 1.5);
  const meters = Math.max(3, Math.hypot(goalX - player.x, aimY - player.y));
  const power = profile.shotPower ?? 0.72; // harder shots are faster, and past about 0.88 a keeper can only get a hand to them
  const speed = 11 + 17 * power;
  const height = 0.35 + nextRandom(match) * 0.9;
  return { move: unit(goalX - player.x, aimY - player.y), shoot: { power, curl: 0, elevation: shotElevation(speed, meters, height) } };
}

function nearestFoe(ctx, player) {
  let best = { distance: Infinity, foe: null };
  for (const foe of ctx.byTeam[opponentOf(player.team)]) {
    if (foe.down > 0) continue;
    const d = distance(player, foe);
    if (d < best.distance) best = { distance: d, foe };
  }
  return best;
}

function segmentClearance(from, to, foes) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length2 = dx * dx + dy * dy || 1;
  let best = Infinity;
  for (const foe of foes) {
    const t = clamp(((foe.x - from.x) * dx + (foe.y - from.y) * dy) / length2, 0, 1);
    best = Math.min(best, Math.hypot(foe.x - (from.x + dx * t), foe.y - (from.y + dy * t)));
  }
  return best;
}

/**
 * Scores every option for the ball carrier. Returns [{ kind, key, score, control }] (unsorted): `kind` is shoot, pass, dribble,
 * hold or clear and `key` identifies the option (a teammate id, a direction index) for the "stick with it" bonus.
 */
export function scoreOptions(ctx, profile, player, { held = 0 } = {}) {
  const dir = attackDirection(player.team);
  const traits = ROLE_TRAITS[player.role] ?? DEFAULT_TRAITS;
  const foes = ctx.byTeam[opponentOf(player.team)].filter((f) => f.down <= 0);
  const near = nearestFoe(ctx, player);
  const pressure = clamp(1 - near.distance / 4.5, 0, 1);
  const urgent = near.distance < 1.3;
  const minHold = player.role === 'GK' ? 1.2 : urgent ? 0.12 : 0.45;
  const options = [];

  // Shoot.
  const goalX = dir * HALF_LENGTH;
  const toGoal = Math.abs(goalX - player.x);
  if (traits.shoot > 0 && toGoal <= profile.shootRange * 1.3 && held >= 0.15) {
    const quality = shotQuality(ctx, player);
    if (quality > 0.07) options.push({ kind: 'shoot', key: 'shoot', score: traits.shoot * (0.35 + 3.4 * quality), control: null });
  }

  // Passes.
  if (held >= minHold) {
    for (const mate of ctx.byTeam[player.team]) {
      if (mate.id === player.id || mate.down > 0) continue;
      const d = distance(player, mate);
      if (d < 2.5) continue;
      if (mate.role === 'GK' && player.role !== 'GK' && pressure < 0.7) continue; // a back pass only when pressed
      const receiver = { x: mate.fx, y: mate.fy };
      const progress = clamp(((mate.x - player.x) * dir) / 18, -1, 1);
      const space = openness(ctx, player.team, receiver.x, receiver.y);
      const groundRisk = laneRisk(ctx, player.team, player, receiver);
      const lob = groundRisk > 0.45 && d > 8;
      const risk = lob ? Math.min(groundRisk, 0.2 + 0.3 * pressureAt(ctx, player.team, receiver.x, receiver.y)) : groundRisk;
      let value = 0.3 + 0.95 * (1 - risk) + 0.55 * space + traits.forward * 0.75 * progress - (lob ? 0.12 : 0);
      if (progress < 0 && pressure < 0.45) value -= 0.35;
      if (d > 26) value -= 0.25;
      if (mate.vx * dir > 2) value += 0.15; // a teammate already running onto it
      options.push({ kind: 'pass', key: mate.id, score: Math.max(0, traits.pass * value), control: { mate, lob } });
    }
  }

  // Dribbles in eight directions, plus straight at goal.
  if (traits.dribble > 0) {
    const goalward = unit(goalX - player.x, -player.y * 0.25);
    [...DIRECTIONS, goalward].forEach((v, index) => {
      const target = { x: player.x + v.x * 4.5, y: player.y + v.y * 4.5 };
      if (Math.abs(target.x) > HALF_LENGTH - 0.5 || Math.abs(target.y) > HALF_WIDTH - 0.5) return;
      const space = openness(ctx, player.team, target.x, target.y);
      const blocked = foes.length ? clamp(1 - segmentClearance(player, target, foes) / 1.3, 0, 1) : 0;
      const progress = v.x * dir;
      let value = 0.18 + 0.75 * space + traits.forward * 0.55 * progress - 1.0 * blocked;
      if (Math.abs(target.y) > HALF_WIDTH - 2.5) value -= 0.3;
      if (Math.abs(target.x) > HALF_LENGTH - 2.5) value -= 0.5;
      options.push({ kind: 'dribble', key: `d${index}`, score: traits.dribble * value, control: { v, space } });
    });
  }

  // Hold the ball (shield it) when nothing else is any good; clear it from danger in the own third.
  options.push({ kind: 'hold', key: 'hold', score: 0.15, control: null });
  if (player.x * dir < -HALF_LENGTH * 0.35 && pressure > 0.55) {
    options.push({ kind: 'clear', key: 'clear', score: 0.55 + 0.9 * pressure, control: null });
  }
  return options;
}

/** Turns a chosen option into a control for `stepMatch`. */
function controlFor(ctx, profile, player, option, near) {
  const match = ctx.match;
  const dir = attackDirection(player.team);
  switch (option.kind) {
    case 'shoot':
      return planShot(match, profile, player);
    case 'pass': {
      const { mate, lob } = option.control;
      const error = (nextRandom(match) - 0.5) * 2 * profile.passNoise;
      return { move: unit(mate.x - player.x, mate.y - player.y), pass: lob ? 'lob' : 'tap', passTo: mate.id, passError: error };
    }
    case 'dribble':
      return { move: option.control.v, sprint: near.distance > 3 && option.control.space > 0.35 };
    case 'clear': {
      const forwardMost = ctx.byTeam[player.team].filter((m) => m.id !== player.id && m.role !== 'GK').sort((a, b) => b.x * dir - a.x * dir)[0];
      if (forwardMost) return { move: unit(forwardMost.x - player.x, forwardMost.y - player.y), pass: 'lob', passTo: forwardMost.id, passError: (nextRandom(match) - 0.5) * 2 * profile.passNoise };
      return { move: { x: dir, y: -Math.sign(player.y) * 0.5 }, pass: 'lob' };
    }
    default: {
      // Shield: turn the body away from the nearest defender.
      if (!near.foe || near.distance > 3) return { move: { x: 0, y: 0 }, sprint: false };
      const away = unit(player.x - near.foe.x, player.y - near.foe.y);
      return { move: { x: away.x * 0.35, y: away.y * 0.35 }, sprint: false };
    }
  }
}

/**
 * The carrier's decision. `brain` keeps the last choice (`brain.last = { kind, key, time }`) for hysteresis; `held` is how long
 * they have had the ball. Returns { control, kind, key, score, options } where `options` is the scored list (for tests and debugging).
 */
export function chooseCarrierAction(ctx, profile, player, brain, held) {
  const match = ctx.match;
  const options = scoreOptions(ctx, profile, player, { held });
  const near = nearestFoe(ctx, player);
  let best = null;
  for (const option of options) {
    let value = option.score + (nextRandom(match) - 0.5) * 2 * profile.decisionNoise;
    if (brain.last && brain.last.kind === option.kind && brain.last.key === option.key && match.time - brain.last.time < 0.8) value += 0.18;
    if (!best || value > best.value) best = { option, value };
  }
  const { option } = best;
  brain.last = { kind: option.kind, key: option.key, time: match.time };
  return { control: controlFor(ctx, profile, player, option, near), kind: option.kind, key: option.key, score: option.score, options };
}
