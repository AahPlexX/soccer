import { shotElevation } from '../ball-physics.js';
import { bestPassTarget } from './ball-control.js';
import { nextRandom, playerById, teamOf } from './match.js';
import { HALF_LENGTH, HALF_MOUTH, HALF_WIDTH, attackDirection, opponentOf } from './rules.js';

// The computer's brain for Game Mode: positioning from the formation, support runs, pressing, passing, shooting and a goalkeeper.
// Pure and deterministic (it draws from the match's own seeded generator). `aiControls` fills a controls map for every player
// the human is not controlling, in the shape `stepMatch` takes. Difficulty changes reaction time, speed, accuracy and pressing.

export const DIFFICULTIES = Object.freeze({
  easy: { speed: 0.82, think: 0.45, passNoise: 0.3, shotError: 3, pressRadius: 9, keeperSkill: 0.45, tackleChance: 0.3, shootRange: 11, label: 'Easy' },
  normal: { speed: 0.92, think: 0.25, passNoise: 0.14, shotError: 1.6, pressRadius: 13, keeperSkill: 0.75, tackleChance: 0.55, shootRange: 15, label: 'Normal' },
  hard: { speed: 1, think: 0.12, passNoise: 0.05, shotError: 0.8, pressRadius: 18, keeperSkill: 0.95, tackleChance: 0.8, shootRange: 18, label: 'Hard' },
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const unit = (dx, dy) => { const length = Math.hypot(dx, dy); return length < 1e-9 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length }; };

/** Fresh AI state for a match; `difficulty` is a key of DIFFICULTIES (anything else falls back to normal). */
export function createAi(difficulty = 'normal') {
  const key = Object.hasOwn(DIFFICULTIES, difficulty) ? difficulty : 'normal';
  return { difficulty: key, profile: DIFFICULTIES[key], brains: {} };
}

const brainOf = (ai, id) => (ai.brains[id] ??= { next: 0, cool: 0, heldSince: null, hold: 0, wish: { x: 0, y: 0 }, sprint: false });

const goalPoint = (team) => ({ x: attackDirection(team) * HALF_LENGTH, y: 0 });

/** Where a player stands for the shape of the game: the formation slot, drifting with the ball and pushing up when attacking. */
function shapeTarget(match, player, attacking) {
  const dir = attackDirection(player.team);
  const ball = match.ball;
  let x = player.home.x + ball.x * (attacking ? 0.55 : 0.3);
  const lineLimit = attacking ? HALF_LENGTH - 4 : HALF_LENGTH - 8;
  if (player.role === 'ST' && attacking) x += dir * 6;
  // Defenders stay goal side of the ball by a margin.
  if (['LD', 'RD', 'CD'].includes(player.role)) {
    const limit = ball.x - dir * (attacking ? -8 : 4);
    x = dir > 0 ? Math.min(x, limit) : Math.max(x, limit);
  }
  x = clamp(x, -lineLimit, lineLimit);
  const y = clamp(player.home.y + (ball.y - player.home.y) * 0.28, -HALF_WIDTH + 2, HALF_WIDTH - 2);
  return { x, y };
}

function toward(player, target, speed = 1, sprint = false, slow = 3) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const gap = Math.hypot(dx, dy);
  if (gap < 0.4) return { move: { x: 0, y: 0 }, sprint: false };
  const ease = Math.min(1, gap / slow) * speed;
  return { move: { x: (dx / gap) * ease, y: (dy / gap) * ease }, sprint };
}

/** A shot at the goal from `player`: aimed at a corner away from the keeper, with a solved elevation, noise by difficulty. */
function planShot(match, ai, player) {
  const goal = goalPoint(player.team);
  const keeper = teamOf(match, opponentOf(player.team)).find((p) => p.role === 'GK');
  const corner = keeper && keeper.y > 0 ? -1 : 1;
  const error = (nextRandom(match) - 0.5) * 2 * ai.profile.shotError;
  const aimY = clamp(corner * HALF_MOUTH * 0.62 + error, -HALF_MOUTH - 1.5, HALF_MOUTH + 1.5);
  const meters = Math.max(3, Math.hypot(goal.x - player.x, aimY - player.y));
  const power = 0.72;
  const speed = 11 + 17 * power;
  const height = 0.35 + nextRandom(match) * 0.9;
  return { move: unit(goal.x - player.x, aimY - player.y), shoot: { power, curl: 0, elevation: shotElevation(speed, meters, height) } };
}

function laneBlocked(from, to, foes, clearance = 1.1) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return foes.some((foe) => {
    const t = clamp(((foe.x - from.x) * dx + (foe.y - from.y) * dy) / (length * length), 0, 1);
    return Math.hypot(foe.x - (from.x + dx * t), foe.y - (from.y + dy * t)) < clearance;
  });
}

/** The decision for the player with the ball. */
function withBall(match, ai, player, brain) {
  const profile = ai.profile;
  const dir = attackDirection(player.team);
  const goal = goalPoint(player.team);
  const mates = teamOf(match, player.team);
  const foes = teamOf(match, opponentOf(player.team));
  const toGoal = distance(player, goal);
  const nearestFoe = foes.reduce((best, foe) => Math.min(best, distance(player, foe)), Infinity);

  // Shoot from range with a reasonably clear line.
  if (player.role !== 'GK' && toGoal <= profile.shootRange && !laneBlocked(player, goal, foes.filter((f) => f.role !== 'GK'), 1.0) && nextRandom(match) < 0.7) {
    return planShot(match, ai, player);
  }
  // Pass when pressed, when a teammate is clearly better placed, or from the back by the goalkeeper.
  const pressed = nearestFoe < 2.4;
  const progressive = mates.some((m) => m.id !== player.id && (m.x - player.x) * dir > 8 && !laneBlocked(player, m, foes));
  // Nobody passes the instant they receive: a carrier holds the ball a moment first (longer for the keeper).
  const minHold = player.role === 'GK' ? 1.2 : 0.55;
  const wantPass = brain.hold > minHold && (player.role === 'GK' || pressed || (progressive && nextRandom(match) < 0.35));
  if (wantPass) {
    const mate = bestPassTarget(player, mates, pressed ? { x: 0, y: 0 } : { x: dir, y: 0 }, foes);
    if (mate) {
      const blocked = laneBlocked(player, mate, foes, 0.9);
      const lob = blocked && distance(player, mate) > 8;
      if (!blocked || lob) {
        const error = (nextRandom(match) - 0.5) * 2 * profile.passNoise;
        return { move: unit(mate.x - player.x, mate.y - player.y), pass: lob ? 'lob' : 'tap', passTo: mate.id, passError: error };
      }
    }
  }
  if (player.role === 'GK') return { move: { x: 0, y: 0 }, sprint: false };
  // Dribble toward goal, steering around defenders ahead.
  const heading = unit(goal.x - player.x, goal.y - player.y);
  let steerX = heading.x;
  let steerY = heading.y;
  for (const foe of foes) {
    const gap = distance(player, foe);
    if (gap < 4 && (foe.x - player.x) * dir > -1) {
      const away = unit(player.x - foe.x, player.y - foe.y);
      const weight = ((4 - gap) / 4) * 1.6;
      steerX += away.x * weight;
      steerY += away.y * weight;
    }
  }
  return { move: unit(steerX, steerY), sprint: nearestFoe > 4 };
}

function goalkeeper(match, ai, keeper) {
  const dir = attackDirection(keeper.team);
  const ball = match.ball;
  const goalX = -dir * HALF_LENGTH;
  const incoming = ball.vx * -dir > 5 && match.lastTouch.team !== keeper.team;
  if (incoming) {
    const time = (goalX - ball.x) / ball.vx;
    const predicted = ball.y + ball.vy * Math.max(0, time);
    const aimY = clamp(predicted, -HALF_MOUTH - 0.5, HALF_MOUTH + 0.5);
    const targetY = keeper.y + (aimY - keeper.y) * ai.profile.keeperSkill;
    return toward(keeper, { x: goalX + dir * 1.4, y: targetY }, 1, true, 1.2);
  }
  const loose = !match.owner && Math.abs(ball.x - goalX) < 7 && Math.abs(ball.y) < 9 && Math.hypot(ball.vx, ball.vy) < 6;
  if (loose && match.lastTouch.team !== keeper.team) return toward(keeper, ball, 1, true, 1);
  return toward(keeper, { x: goalX + dir * 1.5, y: clamp(ball.y * 0.35, -HALF_MOUTH * 0.8, HALF_MOUTH * 0.8) }, 0.8, false, 2);
}

/**
 * Fills `controls` (and returns it) for every player except the human's active one. The AI re-decides the ball carrier at most
 * every `profile.think` seconds (its reaction time); in between they keep doing what they last decided. Call it at about 20 Hz.
 */
export function aiControls(match, ai, controls = {}) {
  const profile = ai.profile;
  const holder = match.owner ? playerById(match, match.owner) : null;
  const ball = match.ball;
  const predicted = { x: ball.x + ball.vx * 0.3, y: ball.y + ball.vy * 0.3 };

  // The two players of the defending team nearest the ball press; with a loose ball the nearest player of each team collects.
  const chasers = new Set();
  for (const team of ['home', 'away']) {
    const outfield = teamOf(match, team).filter((p) => p.role !== 'GK' && p.id !== match.activeId && p.down <= 0);
    outfield.sort((a, b) => distance(a, ball) - distance(b, ball) || (a.id < b.id ? -1 : 1));
    if (holder?.team !== team) outfield.slice(0, 2).forEach((p) => { if (distance(p, ball) < profile.pressRadius) chasers.add(p.id); });
    if (!holder && outfield[0]) chasers.add(outfield[0].id);
  }

  for (const player of match.players) {
    if (player.id === match.activeId) continue;
    const brain = brainOf(ai, player.id);
    brain.cool = Math.max(0, brain.cool - 0.05);
    const ours = holder?.team === player.team;
    let control;
    if (player.id === match.owner) {
      brain.heldSince ??= match.time;
      brain.hold = match.time - brain.heldSince;
      if (match.time >= brain.next) {
        brain.next = match.time + profile.think;
        control = withBall(match, ai, player, brain);
        brain.wish = control.move ?? brain.wish;
        brain.sprint = Boolean(control.sprint);
      } else {
        control = { move: brain.wish, sprint: brain.sprint };
      }
    } else {
      brain.heldSince = null;
      brain.hold = 0;
      if (player.role === 'GK') control = goalkeeper(match, ai, player);
      else if (match.passTarget === player.id) control = toward(player, predicted, 1, true, 1);
      else if (chasers.has(player.id)) {
        const target = holder && holder.team !== player.team ? { x: holder.x + holder.vx * 0.3, y: holder.y + holder.vy * 0.3 } : predicted;
        control = toward(player, target, 1, distance(player, target) > 3, 1.2);
        if (holder && holder.team !== player.team && distance(player, holder) < 1.1 && brain.cool <= 0 && nextRandom(match) < profile.tackleChance) {
          control.tackle = 'stand';
          brain.cool = 1.2;
        }
      } else {
        control = toward(player, shapeTarget(match, player, ours), 0.85, false, 3);
      }
    }
    control.speedScale = profile.speed;
    controls[player.id] = control;
  }
  return controls;
}
