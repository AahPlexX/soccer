import { clamp } from './geometry.js';

// A play script is the coach's authored plan for the simulation: an ordered list of stages, each holding tasks that run
// together. A stage finishes when all its tasks finish (or after a timeout), then the next begins; when the script ends
// the CPU plays freely again. js/simulation.js carries tasks out; js/player-actions.js builds them from the action dialog.
//   pass:  `player` passes to `to`          run:   `player` runs to `point`          shoot: `player` shoots at goal
// Progress (`started`, `age`, `done`, `sent`) lives in the script itself, so saving, undo and reset all see it.

export const SCRIPT_TASK_TYPES = Object.freeze(['pass', 'run', 'shoot']);
export const SCRIPT_LIMITS = Object.freeze({ stages: 24, tasksPerStage: 4, timeoutSeconds: 10, arriveDistance: 0.02 });

const text = (value) => (typeof value === 'string' && value.length > 0 && value.length <= 40 ? value : null);
const isPoint = (value) => value && typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y);

function normalizeTask(task) {
  if (!task || typeof task !== 'object' || !SCRIPT_TASK_TYPES.includes(task.type) || !text(task.player)) return null;
  const base = { type: task.type, player: task.player, done: task.done === true };
  if (task.type === 'pass') return text(task.to) ? { ...base, to: task.to, sent: task.sent === true } : null;
  if (task.type === 'run') return isPoint(task.point) ? { ...base, point: { x: clamp(task.point.x), y: clamp(task.point.y) } } : null;
  return { ...base, sent: task.sent === true };
}

function normalizeStage(stage, index) {
  if (!stage || typeof stage !== 'object' || !Array.isArray(stage.tasks)) return null;
  const tasks = stage.tasks.slice(0, SCRIPT_LIMITS.tasksPerStage).map(normalizeTask).filter(Boolean);
  if (!tasks.length) return null;
  return {
    id: text(stage.id) ?? `stage-${index}`,
    tasks,
    started: stage.started === true,
    age: Number.isFinite(stage.age) && stage.age > 0 ? stage.age : 0,
  };
}

/** A validated copy of a stored script; anything malformed is dropped, so a hand-edited save cannot break playback. */
export function normalizeScript(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, SCRIPT_LIMITS.stages).map(normalizeStage).filter(Boolean);
}

/** The same script with all progress cleared, ready to play from the first stage. */
export function resetScript(script) {
  return normalizeScript(script).map((stage) => ({
    ...stage,
    started: false,
    age: 0,
    tasks: stage.tasks.map((task) => ({ ...task, done: false, ...(task.type === 'run' ? {} : { sent: false }) })),
  }));
}

/** The first stage that still has unfinished tasks, or null when the script is finished (or empty). */
export const activeStage = (script) => (Array.isArray(script) ? script.find((stage) => stage.tasks.some((task) => !task.done)) ?? null : null);

/** Where each player with an unfinished run task in the active stage must go: Map of player id to point. */
export function scriptRunTargets(state) {
  const targets = new Map();
  activeStage(state.script)?.tasks.forEach((task) => {
    if (task.type === 'run' && !task.done && state.players.some((player) => player.id === task.player)) targets.set(task.player, task.point);
  });
  return targets;
}

/** The player who must still pass or shoot in the active stage (the CPU must not act for them), or null. */
export function pendingBallPlayer(state) {
  return activeStage(state.script)?.tasks.find((task) => task.type !== 'run' && !task.done)?.player ?? null;
}
