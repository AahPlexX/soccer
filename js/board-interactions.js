import { clamp } from './geometry.js';
import { findObject, isPlayerId } from './board-actions.js';
import { releaseManuallyMovedObject } from './simulation.js';
import { recordPlayerPosition } from './formations.js';

/** Moves a selected unit rigidly, limiting the shared delta at the touchlines. */
export function moveSelection(state, ids, dx, dy) {
  const objects = [...new Set(ids)].map((id) => findObject(state, id)).filter((object) => object && !object.benched);
  if (!objects.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const actualX = clamp(dx, -Math.min(...objects.map((p) => p.x)), 1 - Math.max(...objects.map((p) => p.x)));
  const actualY = clamp(dy, -Math.min(...objects.map((p) => p.y)), 1 - Math.max(...objects.map((p) => p.y)));
  if (!actualX && !actualY) return false;
  objects.forEach((object) => {
    releaseManuallyMovedObject(state, object.id);
    object.x += actualX; object.y += actualY;
    if (isPlayerId(state, object.id)) recordPlayerPosition(object);
  });
  return true;
}

/** A coaching setup action, not a simulated pass. It always pauses before assigning possession. */
export function giveBallToPlayer(state, id) {
  const player = state.players.find((p) => p.id === id && !p.benched);
  if (!player) return false;
  Object.assign(state.balls[0], { x: player.x, y: player.y });
  Object.assign(state.simulation, { running: false, carrierId: id, possessionTeam: player.team,
    lastTouchTeam: player.team, receiverId: null, ballTarget: null, restart: null, actionClock: 0, tackleCooldown: 0 });
  return true;
}
