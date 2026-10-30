import { PITCH_METERS } from '../constants.js';
import { classifyBoundaryRestart, restartPoint, GOAL_MAX_Y, GOAL_MIN_Y } from '../restarts.js';

// Pitch geometry and restart rules for Game Mode, in meters from the pitch center (x along the pitch, y across it).
// The home team defends x = -HALF_LENGTH and attacks +x, exactly like the coach simulation.

export const HALF_LENGTH = PITCH_METERS.length / 2;
export const HALF_WIDTH = PITCH_METERS.width / 2;
export const HALF_MOUTH = ((GOAL_MAX_Y - GOAL_MIN_Y) / 2) * PITCH_METERS.width;
export const PENALTY_DEPTH = 9;
export const PENALTY_HALF_WIDTH = 10;

export const attackDirection = (team) => (team === 'home' ? 1 : -1);
export const opponentOf = (team) => (team === 'home' ? 'away' : 'home');

const toBoard = (point) => ({ x: point.x / PITCH_METERS.length + 0.5, y: point.y / PITCH_METERS.width + 0.5 });
const fromBoard = (point) => ({ x: (point.x - 0.5) * PITCH_METERS.length, y: (point.y - 0.5) * PITCH_METERS.width });

/** Where a moving ball first left the pitch between `before` and `after` (both { x, y, z } in meters), or null. */
export function exitCrossing(before, after) {
  const outside = (p) => Math.abs(p.x) >= HALF_LENGTH || Math.abs(p.y) >= HALF_WIDTH;
  if (!outside(after)) return null;
  const fraction = (from, to, limit) => (to === from ? Infinity : (Math.sign(to) * limit - from) / (to - from));
  const tx = Math.abs(after.x) >= HALF_LENGTH ? fraction(before.x, after.x, HALF_LENGTH) : Infinity;
  const ty = Math.abs(after.y) >= HALF_WIDTH ? fraction(before.y, after.y, HALF_WIDTH) : Infinity;
  const t = Math.min(1, Math.max(0, Math.min(tx, ty)));
  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    z: before.z + (after.z - before.z) * t,
  };
}

/** The restart a ball leaving the pitch causes (see restarts.js), with its placement in meters, or null while in play. */
export function boundaryRestart(exit, lastTouchTeam) {
  const restart = classifyBoundaryRestart(toBoard(exit), lastTouchTeam, exit.z);
  if (!restart) return null;
  const spot = fromBoard(restartPoint(restart, toBoard(exit)));
  // A throw-in or corner is taken just inside the line so the ball is not immediately out again.
  const inset = 0.05;
  return {
    ...restart,
    spot: { x: Math.max(-HALF_LENGTH + inset, Math.min(HALF_LENGTH - inset, spot.x)), y: Math.max(-HALF_WIDTH + inset, Math.min(HALF_WIDTH - inset, spot.y)) },
  };
}

/** True if a point (meters) is inside `team`'s own penalty area, where its goalkeeper may handle the ball. */
export function inPenaltyArea(team, point) {
  const goalX = -attackDirection(team) * HALF_LENGTH;
  return Math.abs(point.y) <= PENALTY_HALF_WIDTH && Math.abs(point.x - goalX) <= PENALTY_DEPTH;
}

/** 7v7 formation slots for `team` in meters: a goalkeeper plus three lines, as [role, depth fraction of the own half, lateral fraction]. */
const FORMATIONS = {
  '1-3-2-1': [['GK', 0.02, 0], ['LD', 0.22, -0.62], ['CD', 0.2, 0], ['RD', 0.22, 0.62], ['LM', 0.45, -0.5], ['RM', 0.45, 0.5], ['ST', 0.68, 0]],
  '1-2-3-1': [['GK', 0.02, 0], ['LD', 0.22, -0.5], ['RD', 0.22, 0.5], ['LM', 0.45, -0.7], ['CM', 0.42, 0], ['RM', 0.45, 0.7], ['ST', 0.68, 0]],
};

export function formationSlots(team, name = '1-3-2-1') {
  const slots = FORMATIONS[name] ?? FORMATIONS['1-3-2-1'];
  const sign = attackDirection(team);
  return slots.map(([role, depth, lateral], index) => ({
    id: `${team}-${index + 1}`,
    team,
    role,
    // depth 0 is the own goal line and 1 the halfway line (kickoff positions are all in the own half); lateral spans the width
    x: sign * (-HALF_LENGTH + depth * HALF_LENGTH * 0.96 + (role === 'GK' ? 1.2 : 0)),
    y: lateral * HALF_WIDTH * 0.8 * sign,
  }));
}
