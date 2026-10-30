import { GOAL_HEIGHT } from './ball-physics.js';

const GOAL_WIDTH_RATIO = (18.5 / 3) / 40;
export const GOAL_MIN_Y = (1 - GOAL_WIDTH_RATIO) / 2;
export const GOAL_MAX_Y = 1 - GOAL_MIN_Y;

const opponent = (team) => team === 'home' ? 'away' : 'home';
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * The restart a ball leaving the pitch causes, or null while it is in play. `height` is the ball center's height in meters:
 * a ball crossing the goal line inside the posts but above the crossbar is not a goal, it is out like any other.
 */
export function classifyBoundaryRestart(point, lastTouchTeam, height = 0) {
  if (lastTouchTeam !== 'home' && lastTouchTeam !== 'away') return null;

  if (point.y <= 0 || point.y >= 1) {
    return {
      type: 'throw-in',
      team: opponent(lastTouchTeam),
      side: point.y <= 0 ? 'left' : 'right',
    };
  }

  if (point.x <= 0 || point.x >= 1) {
    const side = point.x <= 0 ? 'home' : 'away';
    const defendingTeam = side;
    const attackingTeam = opponent(defendingTeam);
    const insideGoal = point.y >= GOAL_MIN_Y && point.y <= GOAL_MAX_Y && height <= GOAL_HEIGHT;

    if (insideGoal) {
      return {
        type: 'kickoff',
        team: defendingTeam,
        side,
        scoredBy: attackingTeam,
      };
    }

    return lastTouchTeam === defendingTeam
      ? { type: 'corner', team: attackingTeam, side }
      : { type: 'goal-kick', team: defendingTeam, side };
  }

  return null;
}

export function restartPoint(restart, exitPoint) {
  if (!restart) return null;

  if (restart.type === 'kickoff') return { x: 0.5, y: 0.5 };
  if (restart.type === 'throw-in') {
    return { x: clamp01(exitPoint.x), y: restart.side === 'left' ? 0 : 1 };
  }
  if (restart.type === 'corner') {
    return { x: restart.side === 'home' ? 0 : 1, y: exitPoint.y < 0.5 ? 0 : 1 };
  }
  if (restart.type === 'goal-kick') {
    return { x: restart.team === 'home' ? 0.08 : 0.92, y: 0.5 };
  }

  return null;
}
