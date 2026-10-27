import { PITCH, SIMULATION } from './constants.js';
import { clamp, clampSupportForOffside, distance, distanceToSegment, moveToward } from './geometry.js';
import { classifyBoundaryRestart, restartPoint } from './restarts.js';
import { constrainPlayerPositionForZones } from './zone-constraints.js';

function attackingDirection(team) { return team === 'home' ? 1 : -1; }
function opponent(team) { return team === 'home' ? 'away' : 'home'; }
function teamGoalX(team) { return team === 'home' ? 1 : 0; }

function nearestPlayer(players, point, predicate) {
  return players.filter(predicate).sort((a, b) => distance(a, point) - distance(b, point))[0] ?? null;
}

function isBuildOutSituation(state, carrier) {
  if (!carrier || carrier.role !== 'GK') return false;
  return carrier.team === 'home' ? state.balls[0].x <= 0.2 : state.balls[0].x >= 0.8;
}

function retreatTarget(player, possessingTeam) {
  if (player.team === possessingTeam) return null;
  if (possessingTeam === 'home') return { x: Math.max(player.anchorX, PITCH.homeBuildOutX + 0.02), y: player.anchorY };
  return { x: Math.min(player.anchorX, PITCH.awayBuildOutX - 0.02), y: player.anchorY };
}

function supportTarget(player, state, ball) {
  if (state.spacingMode === 'swarm') {
    const sign = player.team === 'home' ? -1 : 1;
    return { x: clamp(ball.x + sign * 0.04), y: clamp(ball.y + ((Number(player.id.split('-')[1]) % 3) - 1) * 0.04) };
  }
  const shifted = {
    x: clamp(player.anchorX + (ball.x - 0.5) * SIMULATION.supportBallShiftX),
    y: clamp(player.anchorY + (ball.y - 0.5) * SIMULATION.supportBallShiftY),
  };
  return clampSupportForOffside(player, shifted, state.players, ball);
}

function movePlayer(state, player, target, maxDistance, applyZoneRule = true) {
  const allowedTarget = applyZoneRule ? constrainPlayerPositionForZones(state, player, target) : target;
  const moved = moveToward(player, allowedTarget, maxDistance);
  const allowedPosition = applyZoneRule ? constrainPlayerPositionForZones(state, player, moved) : moved;
  player.x = clamp(allowedPosition.x);
  player.y = clamp(allowedPosition.y);
}

function choosePassTarget(state, carrier) {
  const direction = attackingDirection(carrier.team);
  const teammates = state.players.filter((p) => p.team === carrier.team && p.id !== carrier.id);
  // Prefer receivers whose lane no opponent blocks; if every lane is blocked, choose among all teammates as before.
  const open = teammates.filter((p) => state.players.every((o) => o.team === carrier.team || distanceToSegment(o, carrier, p) > SIMULATION.passLaneClearance));
  return (open.length ? open : teammates)
    .map((p) => ({ player: p, score: direction * (p.x - carrier.x) * 2 - Math.abs(p.y - carrier.y) - distance(p, carrier) * 0.25 }))
    .sort((a, b) => b.score - a.score)[0]?.player ?? null;
}

function beginPass(state, carrier, target) {
  state.simulation.lastTouchTeam = carrier.team;
  state.simulation.carrierId = null;
  state.simulation.receiverId = target.id;
  state.simulation.ballTarget = { x: target.x, y: target.y };
}

function beginShot(state, carrier) {
  state.simulation.lastTouchTeam = carrier.team;
  state.simulation.carrierId = null;
  state.simulation.receiverId = null;
  const offsets = SIMULATION.shotAimOffsets;
  const offset = offsets[state.simulation.shotCount % offsets.length];
  state.simulation.shotCount += 1;
  // The target is the aim point extended 0.05 past the goal line along the shot's own line: the ball must cross the
  // line (so boundary classification decides the outcome) instead of being collected by the loose-ball pickup
  // radius just before it, and it crosses exactly at the aim y.
  const aimY = 0.5 + offset + (carrier.y - 0.5) * SIMULATION.shotAimSpread;
  const run = teamGoalX(carrier.team) - carrier.x;
  const stretch = 1 + 0.05 / Math.max(Math.abs(run), 0.01);
  state.simulation.ballTarget = {
    x: carrier.x + run * stretch,
    y: carrier.y + (aimY - carrier.y) * stretch,
  };
}

/**
 * A shot crossing the goal line inside the goal mouth meets the defending goalkeeper first: within
 * SIMULATION.keeperCatchReach the keeper holds it (possession, so the build-out rule follows); within
 * keeperParryReach it is deflected behind for an attacking corner. Returns true when the keeper dealt with it.
 */
function keeperResponse(state, goal, exitPoint) {
  const defending = goal.team;
  const keeper = state.players.find((p) => p.team === defending && p.role === 'GK');
  if (!keeper || state.simulation.lastTouchTeam === defending) return false;
  const miss = Math.abs(keeper.y - exitPoint.y);
  if (miss > SIMULATION.keeperParryReach) return false;
  if (miss <= SIMULATION.keeperCatchReach) {
    Object.assign(state.simulation, {
      possessionTeam: defending, lastTouchTeam: defending, carrierId: keeper.id,
      receiverId: null, ballTarget: null, actionClock: 0,
    });
    state.balls[0].x = keeper.x;
    state.balls[0].y = keeper.y;
    return true;
  }
  state.simulation.lastTouchTeam = defending;
  beginRestart(state, { type: 'corner', team: opponent(defending), side: goal.side }, exitPoint);
  return true;
}

function acquireLooseBall(state) {
  const ball = state.balls[0];
  const receiver = state.simulation.receiverId ? state.players.find((p) => p.id === state.simulation.receiverId) : null;
  const candidate = receiver && distance(receiver, ball) < 0.055
    ? receiver
    : nearestPlayer(state.players, ball, () => true);
  if (candidate && distance(candidate, ball) < 0.055) {
    state.simulation.carrierId = candidate.id;
    state.simulation.possessionTeam = candidate.team;
    state.simulation.lastTouchTeam = candidate.team;
    state.simulation.receiverId = null;
    state.simulation.ballTarget = null;
    ball.x = candidate.x;
    ball.y = candidate.y;
  }
}

function advanceBall(state, dt) {
  const ball = state.balls[0];
  const carrier = state.players.find((p) => p.id === state.simulation.carrierId);
  if (carrier) {
    ball.x = carrier.x;
    ball.y = carrier.y;
    return;
  }
  if (!state.simulation.ballTarget) {
    acquireLooseBall(state);
    return;
  }
  const next = moveToward(ball, state.simulation.ballTarget, SIMULATION.ballSpeed * dt);
  const restart = classifyBoundaryRestart(next, state.simulation.lastTouchTeam);
  if (restart) {
    if (restart.type === 'kickoff' && keeperResponse(state, restart, next)) return;
    beginRestart(state, restart, next);
    return;
  }
  ball.x = clamp(next.x);
  ball.y = clamp(next.y);
  if (distance(ball, state.simulation.ballTarget) < 0.015) acquireLooseBall(state);
}

function beginRestart(state, restart, exitPoint) {
  if (restart.type === 'kickoff') {
    state.players.forEach((player) => { player.x = player.anchorX; player.y = player.anchorY; });
  }

  const point = restartPoint(restart, exitPoint);
  const ball = state.balls[0];
  ball.x = point.x;
  ball.y = point.y;
  state.simulation.possessionTeam = restart.team;
  state.simulation.lastTouchTeam = restart.team;
  state.simulation.restart = restart;
  state.simulation.receiverId = null;
  state.simulation.ballTarget = null;
  state.simulation.actionClock = 0;

  const taker = restart.type === 'goal-kick'
    ? state.players.find((player) => player.team === restart.team && player.role === 'GK')
    : nearestPlayer(state.players, point, (player) => player.team === restart.team);
  state.simulation.carrierId = taker?.id ?? null;
  if (taker) {
    taker.x = point.x;
    taker.y = point.y;
  }
}

function advancePlayers(state, dt) {
  const ball = state.balls[0];
  const carrier = state.players.find((p) => p.id === state.simulation.carrierId);
  const buildOut = isBuildOutSituation(state, carrier);
  const defendingTeam = opponent(state.simulation.possessionTeam);
  const pressingPlayer = nearestPlayer(state.players, ball, (p) => p.team === defendingTeam && p.role !== 'GK');

  state.players.forEach((player) => {
    if (player.id === state.simulation.carrierId) {
      // Legal restart placement and the mandatory U9 goalkeeper build-out hold take precedence over drill constraints.
      if (state.simulation.restart || (buildOut && player.role === 'GK')) return;
      const direction = attackingDirection(player.team);
      const target = { x: clamp(player.x + direction * 0.08), y: clamp(player.y + (0.5 - player.y) * 0.06) };
      movePlayer(state, player, target, SIMULATION.playerSpeed * 0.78 * dt);
      return;
    }

    const retreat = buildOut ? retreatTarget(player, state.simulation.possessionTeam) : null;
    let target = retreat ?? supportTarget(player, state, ball);

    if (!retreat && player.team !== state.simulation.possessionTeam && player.id === pressingPlayer?.id) {
      target = { x: ball.x, y: ball.y };
    }

    // Build-out retreat is a mandatory U9 rule and therefore overrides an optional coach-created zone constraint.
    movePlayer(state, player, target, SIMULATION.playerSpeed * dt, !retreat);
  });
}

function decideAction(state) {
  const carrier = state.players.find((p) => p.id === state.simulation.carrierId);
  if (!carrier) return;
  if (isBuildOutSituation(state, carrier)) {
    const allRetreated = state.players.filter((p) => p.team !== carrier.team).every((p) =>
      carrier.team === 'home' ? p.x >= PITCH.homeBuildOutX : p.x <= PITCH.awayBuildOutX,
    );
    if (!allRetreated) return;
  }

  if (state.simulation.restart) {
    const target = choosePassTarget(state, carrier);
    if (target) {
      beginPass(state, carrier, target);
      state.simulation.restart = null;
    }
    return;
  }

  const attackingX = carrier.team === 'home' ? carrier.x : 1 - carrier.x;
  if (attackingX > 0.82 && Math.abs(carrier.y - 0.5) < 0.28) {
    beginShot(state, carrier);
    return;
  }
  const target = choosePassTarget(state, carrier);
  if (target) beginPass(state, carrier, target);
}

export function ensureCarrier(state) {
  if (state.simulation.ballTarget) return;
  if (state.simulation.carrierId && state.players.some((p) => p.id === state.simulation.carrierId)) return;
  const ball = state.balls[0];
  const nearest = nearestPlayer(state.players, ball, (p) => p.team === state.simulation.possessionTeam);
  state.simulation.carrierId = nearest?.id ?? null;
  if (nearest) state.simulation.lastTouchTeam = nearest.team;
}

export function stepSimulation(state, dt) {
  if (!state.simulation.running) return state;
  ensureCarrier(state);
  state.simulation.actionClock += dt * state.speed;
  const scaledDt = dt * state.speed;
  advancePlayers(state, scaledDt);
  advanceBall(state, scaledDt);
  if (state.simulation.actionClock >= SIMULATION.actionIntervalSeconds) {
    state.simulation.actionClock = 0;
    decideAction(state);
  }
  return state;
}
