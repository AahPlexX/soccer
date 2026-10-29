import { PITCH_ASPECT } from './geometry.js';

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

/**
 * Adds the arrows for an action between two on-pitch players, styled with the coach's drawing color and size.
 * Returns the number of drawings added (0 for an unknown action, unknown or benched players, or players too close).
 */
export function applyPlayerAction(state, actionId, firstId, secondId) {
  const find = (id) => state.players.find((player) => player.id === id && !player.benched);
  const [a, b] = [find(firstId), find(secondId)];
  if (!a || !b || a === b) return 0;
  const drawings = actionDrawings(actionId, a, b).filter(Boolean);
  const stamp = Date.now().toString(36);
  drawings.forEach((drawing, index) => state.drawings.push({
    id: `drawing-${stamp}-${state.drawings.length}-${index}`, ...drawing, color: state.drawColor, width: state.drawWidth,
  }));
  return drawings.length;
}
