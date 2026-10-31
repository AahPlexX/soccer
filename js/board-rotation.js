import { ZONES } from './constants.js';

// Flip attack direction (COACH-005). Positions are always stored as drawn; `state.flipped` says the home team attacks
// toward the left instead of the right. A flip is a 180 degree rotation of the pitch, not a mirror, so left and right backs
// keep their handedness exactly as the away team's formations already do (js/formations.js). The simulation was written for
// an unflipped board, so it runs on a rotated copy of the spatial fields and rotates them back (js/simulation.js).

/** Zones drawn on the screen (a flank or the middle), not relative to a team's goal; a flip leaves them where they are. */
export const SCREEN_ZONES = Object.freeze(['left', 'right', 'center']);

// A half turn is 1 - v, but `1 - (1 - v)` is not always v in floating point, so a board that is rotated and rotated back every
// simulation step would drift by an ulp each time. Coordinates are snapped to a binary grid (2^-30, under a nanometer of
// pitch) first: scaling by a power of two is exact, so after the first rotation every later half turn is an exact involution.
const GRID = 2 ** 30;
const flip = (v) => (GRID - Math.round(v * GRID)) / GRID;

export const rotateXY = (point) => ({ x: flip(point.x), y: flip(point.y) });

function rotateInPlace(point) {
  point.x = flip(point.x);
  point.y = flip(point.y);
}

/** Rotates every spatial field of the board 180 degrees in place: players, anchors, balls, props, drawings, script runs. */
export function rotateSpatial(state) {
  state.players.forEach((player) => {
    rotateInPlace(player);
    player.anchorX = flip(player.anchorX);
    player.anchorY = flip(player.anchorY);
  });
  [...state.balls, ...state.cones, ...state.miniGoals].forEach(rotateInPlace);
  state.drawings.forEach((drawing) => drawing.points.forEach(rotateInPlace));
  (state.script ?? []).forEach((stage) => stage.tasks.forEach((task) => { if (task.type === 'run') rotateInPlace(task.point); }));
  if (state.simulation.ballTarget) rotateInPlace(state.simulation.ballTarget);
  // A half turn about the vertical axis negates the horizontal parts of velocity and spin and leaves the vertical part.
  const { ballVelocity, ballSpin } = state.simulation;
  for (const vector of [ballVelocity, ballSpin]) if (vector) { vector.x = -vector.x; vector.y = -vector.y; }
  const restart = state.simulation.restart;
  if (restart?.side === 'left' || restart?.side === 'right') restart.side = restart.side === 'left' ? 'right' : 'left'; // 'home'/'away' name a goal, not a flank
}

/** Swaps the left and right flank selections: the simulation sees them rotated along with the pitch. */
export function swapFlankZones(state) {
  state.selectedZones = state.selectedZones.map((id) => (id === 'left' ? 'right' : id === 'right' ? 'left' : id));
}

/** Flips the attack direction: rotates the whole board a half turn and toggles `state.flipped`. */
export function flipBoard(state) {
  rotateSpatial(state);
  state.flipped = !state.flipped;
}

/** The rectangle a zone covers on screen. Team-relative zones follow their team when the board is flipped. */
export function zoneRect(id, flipped = false) {
  const zone = ZONES[id];
  if (!zone || !flipped || SCREEN_ZONES.includes(id)) return zone;
  return { ...zone, x1: 1 - zone.x2, x2: 1 - zone.x1, y1: 1 - zone.y2, y2: 1 - zone.y1 };
}
