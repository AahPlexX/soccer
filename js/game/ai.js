import { keeperControl } from './ai-keeper.js';
import { makeContext } from './ai-space.js';
import { arrive, blend, distance, separation, shadowPoint } from './ai-steering.js';
import { ROLE_PRIORITY, planTeam, shapeTarget } from './ai-team.js';
import { chooseCarrierAction } from './ai-utility.js';
import { nextRandom } from './match.js';
import { HALF_LENGTH, attackDirection } from './rules.js';

// The computer's brain for Game Mode, in layers (the standard game-AI stack):
//   perception   each team sees the ball as it was a reaction time ago, so easy teams react late;
//   team plan    ai-team.js reads the phase of play and gives every outfield player a role with a target;
//   role FSM     each player holds a role with a minimum dwell time (hysteresis) so they do not flicker between jobs;
//   utility      ai-utility.js scores every option for the ball carrier (shoot, passes, dribbles, hold, clear);
//   steering     arrive, pursue, separate and interception turn targets into movement; the keeper has its own states.
// Pure and deterministic (it draws from the match's seeded generator). `aiControls` fills a controls map for every player the
// human is not controlling, in the shape `stepMatch` takes. Call it at about 20 Hz.

export const DIFFICULTIES = Object.freeze({
  easy: { speed: 0.82, think: 0.45, reaction: 0.35, passNoise: 0.3, shotError: 3, shotPower: 0.62, decisionNoise: 0.35, pressRadius: 9, keeperSkill: 0.45, tackleChance: 0.3, shootRange: 11, runners: 1, markers: 1, aggression: 0.3, label: 'Easy' },
  normal: { speed: 0.92, think: 0.25, reaction: 0.2, passNoise: 0.14, shotError: 1.6, shotPower: 0.76, decisionNoise: 0.2, pressRadius: 13, keeperSkill: 0.65, tackleChance: 0.55, shootRange: 17, runners: 2, markers: 2, aggression: 0.55, label: 'Normal' },
  hard: { speed: 1, think: 0.12, reaction: 0.08, passNoise: 0.05, shotError: 0.8, shotPower: 0.86, decisionNoise: 0.08, pressRadius: 18, keeperSkill: 0.95, tackleChance: 0.8, shootRange: 18, runners: 3, markers: 3, aggression: 0.85, label: 'Hard' },
});

const HISTORY_SECONDS = 1.2;
const MIN_DWELL = 0.3; // seconds a role is kept against a lower-priority change

const resolve = (key) => (typeof key === 'string' && Object.hasOwn(DIFFICULTIES, key) ? key : 'normal');

/**
 * Fresh AI state. `spec` is a difficulty key (both teams) or { home, away } to give each team its own level (used to measure
 * that a harder AI really beats an easier one). Anything else falls back to normal.
 * @param {string | { home?: string, away?: string }} [spec]
 */
export function createAi(spec = 'normal') {
  const home = resolve(typeof spec === 'object' && spec ? spec.home : spec);
  const away = resolve(typeof spec === 'object' && spec ? spec.away : spec);
  return { difficulty: home, profile: DIFFICULTIES[home], profiles: { home: DIFFICULTIES[home], away: DIFFICULTIES[away] }, brains: {}, history: [] };
}

const brainOf = (ai, id) => (ai.brains[id] ??= { next: 0, coolUntil: 0, heldSince: null, hold: 0, cached: { move: { x: 0, y: 0 }, sprint: false }, last: null, role: null, since: 0, assignment: null });

/** The ball as it was at `time` (falls back to the current ball when the history does not reach back that far). */
function laggedBall(history, time, current) {
  let found = null;
  for (const entry of history) { if (entry.t <= time) found = entry; else break; }
  return found ?? { x: current.x, y: current.y, z: current.z, vx: current.vx, vy: current.vy };
}

/** Turns a role and its target into a movement control with steering. */
function execute(ctx, profile, player, assignment, brain) {
  const { match } = ctx;
  const goal = { x: -attackDirection(player.team) * HALF_LENGTH, y: 0 };
  const mates = ctx.byTeam[player.team].filter((m) => m.id !== player.id);
  const push = separation(player, mates, 2.2);
  const gap = distance(player, assignment.target);
  const go = (speed, sprint, slow = 3, spread = 0.5) => ({ move: blend([{ v: arrive(player, assignment.target, speed, slow), w: 1 }, { v: push, w: spread }]), sprint });

  switch (assignment.role) {
    case 'press': {
      const carrier = ctx.byId.get(assignment.carrierId);
      if (!carrier) return go(1, false);
      const d = distance(player, carrier);
      // Far away: run at where they are going. Close: jockey, staying goal side and shepherding instead of diving in.
      const control = d > 4
        ? { move: arrive(player, { x: carrier.fx, y: carrier.fy }, 1, 1), sprint: d > 6 }
        : { move: arrive(player, shadowPoint(carrier, goal, 1.4), 0.9, 1.5), sprint: false };
      if (d < 1.15 && match.time >= brain.coolUntil) {
        const loose = distance(carrier, match.ball) > 0.7; // the ball has run away from their feet: a good moment to go in
        if (nextRandom(match) < profile.tackleChance * (loose ? 1.6 : 0.6) * 0.25) { control.tackle = 'stand'; brain.coolUntil = match.time + 1; }
      } else if (d >= 1.4 && d <= 2.1 && profile.aggression > 0.6 && Math.hypot(carrier.vx, carrier.vy) > 4 && match.time >= brain.coolUntil && nextRandom(match) < 0.08) {
        control.tackle = 'slide';
        brain.coolUntil = match.time + 1.5;
      }
      return control;
    }
    case 'chase':
    case 'receive':
    case 'intercept':
      return go(1, gap > 2.5, 1, 0.2);
    case 'run':
      return go(1, gap > 5, 3, 0.3);
    case 'mark':
    case 'cover':
    case 'recover':
      return go(1, gap > 8, 3, 0.4);
    case 'support':
      return go(0.9, gap > 9, 3, 0.4);
    default:
      return go(0.85, false, 3, 0.5);
  }
}

/** Fills `controls` (and returns it) for every player except the human's active one. Call at about 20 Hz. */
export function aiControls(match, ai, controls = {}) {
  const ctx = makeContext(match);
  ai.history.push({ t: match.time, x: match.ball.x, y: match.ball.y, z: match.ball.z, vx: match.ball.vx, vy: match.ball.vy });
  while (ai.history.length > 1 && ai.history[0].t < match.time - HISTORY_SECONDS) ai.history.shift();
  const seen = { home: laggedBall(ai.history, match.time - ai.profiles.home.reaction, match.ball), away: laggedBall(ai.history, match.time - ai.profiles.away.reaction, match.ball) };
  const plans = { home: planTeam(ctx, ai.profiles.home, 'home', seen.home, match.activeId), away: planTeam(ctx, ai.profiles.away, 'away', seen.away, match.activeId) };

  for (const player of match.players) {
    if (player.id === match.activeId) continue;
    const brain = brainOf(ai, player.id);
    const profile = ai.profiles[player.team];
    const mine = ctx.byId.get(player.id);
    let control;

    if (player.id === match.owner) {
      brain.heldSince ??= match.time;
      brain.hold = match.time - brain.heldSince;
      brain.role = 'carry';
      if (match.time >= brain.next) {
        brain.next = match.time + profile.think;
        control = chooseCarrierAction(ctx, profile, mine, brain, brain.hold).control;
        brain.cached = { move: control.move ?? { x: 0, y: 0 }, sprint: Boolean(control.sprint) };
      } else {
        control = { ...brain.cached }; // between decisions keep doing what was decided (one-shot actions are not repeated)
      }
    } else {
      brain.heldSince = null;
      brain.hold = 0;
      if (player.role === 'GK') {
        control = keeperControl(ctx, profile, mine, seen[player.team]);
        brain.role = 'keeper';
      } else {
        const planned = plans[player.team].assignments.get(player.id) ?? { role: 'hold', target: shapeTarget({ ...mine, home: player.home }, seen[player.team], player.team, false) };
        let assignment = planned;
        // Hysteresis: a recent, more important role is kept for a moment against a less important change.
        if (brain.role && brain.assignment && brain.role !== planned.role && match.time - brain.since < MIN_DWELL && (ROLE_PRIORITY[brain.role] ?? 0) > (ROLE_PRIORITY[planned.role] ?? 0)) {
          assignment = brain.assignment;
        } else if (brain.role !== planned.role) {
          brain.role = planned.role;
          brain.since = match.time;
        }
        brain.assignment = assignment;
        control = execute(ctx, profile, mine, assignment, brain);
      }
    }
    control.speedScale = profile.speed * (player.role === 'GK' ? 1 + 0.12 * profile.keeperSkill : 1);
    controls[player.id] = control;
  }
  return controls;
}
