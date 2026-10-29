import { PITCH_ASPECT } from './geometry.js';
import { SCRIPT_LIMITS } from './play-script.js';

// Player action steps: with two players selected the coach picks what the first does with or for the second, and the
// board draws it with the ordinary pass (solid) and run (dashed) arrows, so it prints, undoes, saves and shows in 3D.
// Drawings are annotations; they do not command the CPU simulation.

const DISC_RADIUS = 0.035; // arrows start and stop outside the player discs (board x units)
const PAST_RECEIVER = 0.12; // how far a follow-through run continues beyond the receiver

export const PLAYER_ACTIONS = Object.freeze([
  Object.freeze({ id: 'pass', label: 'Pass', hint: 'The first player passes to the second.' }),
  Object.freeze({ id: 'receive', label: 'Receive from', hint: 'The first player receives a pass from the second.' }),
  Object.freeze({ id: 'run-to', label: 'Run to', hint: 'The first player runs to the second player’s spot.' }),
  Object.freeze({ id: 'pass-and-follow', label: 'Pass and follow', hint: 'The first player passes, then runs on past the receiver.' }),
  Object.freeze({ id: 'swap', label: 'Swap places', hint: 'Both players run to each other’s spot.' }),
]);

// Actions for one selected player, relative to the goal they attack (the home team attacks toward +x).
export const SOLO_ACTIONS = Object.freeze([
  Object.freeze({ id: 'shoot', label: 'Shoot at goal', hint: 'A shot from the player toward the middle of the goal they attack.' }),
  Object.freeze({ id: 'run-forward', label: 'Run forward', hint: 'The player runs toward the goal they attack.' }),
  Object.freeze({ id: 'track-back', label: 'Track back', hint: 'The player runs back toward their own goal.' }),
]);
const RUN_LENGTH = 0.18;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const drawnDistance = (from, to) => Math.hypot(to.x - from.x, (to.y - from.y) * PITCH_ASPECT);

// The point `distance` (board x units, measured as drawn: the pitch is shorter than it is wide) from `from` toward `to`.
function along(from, to, distance) {
  const length = drawnDistance(from, to);
  if (!length) return { x: from.x, y: from.y };
  const t = distance / length;
  return { x: clamp01(from.x + (to.x - from.x) * t), y: clamp01(from.y + (to.y - from.y) * t) };
}

// An arrow between two points, clear of the discs at its ends. Players closer than that get no arrow.
function link(type, from, to, endGap = DISC_RADIUS) {
  if (drawnDistance(from, to) <= DISC_RADIUS + endGap) return null;
  return { type, points: [along(from, to, DISC_RADIUS), along(to, from, endGap)] };
}

/** The drawings (type and points, or null where players are too close) for `actionId` from player `a` toward `b`. */
export function actionDrawings(actionId, a, b) {
  switch (actionId) {
    case 'pass': return [link('arrow', a, b)];
    case 'receive': return [link('arrow', b, a)];
    case 'run-to': return [link('run', a, b)];
    case 'swap': return [link('run', a, b), link('run', b, a)];
    case 'pass-and-follow': {
      const beyond = along(a, b, drawnDistance(a, b) + PAST_RECEIVER);
      return [link('arrow', a, b), link('run', b, beyond, 0)];
    }
    default: return [];
  }
}

/** The drawing (type and points, or null when too short) for a one-player action by `player`. */
export function soloDrawing(actionId, player) {
  const dir = player.team === 'away' ? -1 : 1; // attacking direction along x
  const goal = { x: dir > 0 ? 1 : 0, y: 0.5 };
  const ahead = { x: clamp01(player.x + dir * RUN_LENGTH), y: player.y };
  const back = { x: clamp01(player.x - dir * RUN_LENGTH), y: player.y };
  switch (actionId) {
    case 'shoot': return link('arrow', player, goal, 0);
    case 'run-forward': return link('run', player, ahead, 0);
    case 'track-back': return link('run', player, back, 0);
    default: return null;
  }
}

// The script tasks (js/play-script.js) that make the simulation carry out what the arrows show.
const passTask = (player, to) => ({ type: 'pass', player, to, done: false, sent: false });
const runTask = (player, drawing) => ({ type: 'run', player, point: drawing.points.at(-1), done: false });
const shootTask = (player) => ({ type: 'shoot', player, done: false, sent: false });

/** Draws the arrows and queues the stages (each an array of tasks that run together). Returns the arrows added. */
function addAction(state, drawings, stages) {
  if (!drawings.length || state.script.length + stages.length > SCRIPT_LIMITS.stages) return 0;
  const stamp = Date.now().toString(36);
  drawings.forEach((drawing, index) => state.drawings.push({
    id: `drawing-${stamp}-${state.drawings.length}-${index}`, ...drawing, color: state.drawColor, width: state.drawWidth, source: 'action',
  }));
  stages.forEach((tasks, index) => state.script.push({ id: `stage-${stamp}-${state.script.length}-${index}`, tasks, started: false, age: 0 }));
  return drawings.length;
}

/**
 * Draws a one-player action and queues it in the play script, so the simulation makes the player do it.
 * Returns 1 when added, 0 for an unknown action or player, no room to draw, or a full script.
 */
export function applySoloAction(state, actionId, id) {
  const player = state.players.find((item) => item.id === id && !item.benched);
  const drawing = player && soloDrawing(actionId, player);
  if (!drawing) return 0;
  return addAction(state, [drawing], [[actionId === 'shoot' ? shootTask(id) : runTask(id, drawing)]]);
}

/**
 * Adds the arrows for an action between two on-pitch players, styled with the coach's drawing color and size.
 * Returns the number of drawings added (0 for an unknown action, unknown or benched players, or players too close).
 */
export function applyPlayerAction(state, actionId, firstId, secondId) {
  const find = (id) => state.players.find((player) => player.id === id && !player.benched);
  const [a, b] = [find(firstId), find(secondId)];
  if (!a || !b || a === b) return 0;
  const [first, second] = actionDrawings(actionId, a, b);
  const drawings = [first, second].filter(Boolean);
  const stages = {
    pass: () => first && [[passTask(a.id, b.id)]],
    receive: () => first && [[passTask(b.id, a.id)]],
    'run-to': () => first && [[runTask(a.id, first)]],
    swap: () => [[first && runTask(a.id, first), second && runTask(b.id, second)].filter(Boolean)],
    'pass-and-follow': () => [first && [passTask(a.id, b.id)], second && [runTask(a.id, second)]].filter(Boolean),
  }[actionId]?.() ?? [];
  return addAction(state, drawings, stages.filter((tasks) => tasks.length));
}
