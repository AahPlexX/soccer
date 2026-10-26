import { PITCH, SIMULATION } from './constants.js';
import { clamp, clampSupportForOffside, distance, moveToward } from './geometry.js';

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

function choosePassTarget(state, carrier) {
  const direction = attackingDirection(carrier.team);
  const teammates = state.players.filter((p) => p.team === carrier.team && p.id !== carrier.id);
  return teammates
    .map((p) => ({ player: p, score: direction * (p.x - carrier.x) * 2 - Math.abs(p.y - carrier.y) - distance(p, carrier) * 0.25 }))
    .sort((a, b) => b.score - a.score)[0]?.player ?? null;
}

function beginPass(state, carrier, target) {
  state.simulation.carrierId = null;
  state.simulation.receiverId = target.id;
  state.simulation.ballTarget = { x: target.x, y: target.y };
}

function beginShot(state, carrier) {
  state.simulation.carrierId = null;
  state.simulation.receiverId = null;
  state.simulation.ballTarget = { x: teamGoalX(carrier.team), y: 0.5 };
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
  ball.x = clamp(next.x);
  ball.y = clamp(next.y);
  if (distance(ball, state.simulation.ballTarget) < 0.015) {
    if (ball.x <= 0.005 || ball.x >= 0.995) {
      resetAfterGoal(state, ball.x >= 0.995 ? 'away' : 'home');
      return;
    }
    acquireLooseBall(state);
  }
}

function resetAfterGoal(state, possessionTeam) {
  state.players.forEach((p) => { p.x = p.anchorX; p.y = p.anchorY; });
  const ball = state.balls[0];
  ball.x = 0.5; ball.y = 0.5;
  state.simulation.possessionTeam = possessionTeam;
  state.simulation.carrierId = nearestPlayer(state.players, ball, (p) => p.team === possessionTeam)?.id ?? null;
  state.simulation.receiverId = null;
  state.simulation.ballTarget = null;
  state.simulation.actionClock = 0;
}

function advancePlayers(state, dt) {
  const ball = state.balls[0];
  const carrier = state.players.find((p) => p.id === state.simulation.carrierId);
  const buildOut = isBuildOutSituation(state, carrier);
  const defendingTeam = opponent(state.simulation.possessionTeam);
  const pressingPlayer = nearestPlayer(state.players, ball, (p) => p.team === defendingTeam && p.role !== 'GK');

  state.players.forEach((player) => {
    if (player.id === state.simulation.carrierId) {
      // A goalkeeper holding the ball for a build-out restart stays put until opponents retreat.
      if (buildOut && player.role === 'GK') return;
      const direction = attackingDirection(player.team);
      const target = { x: clamp(player.x + direction * 0.08), y: clamp(player.y + (0.5 - player.y) * 0.06) };
      const moved = moveToward(player, target, SIMULATION.playerSpeed * 0.78 * dt);
      player.x = moved.x; player.y = moved.y;
      return;
    }

    const retreat = buildOut ? retreatTarget(player, state.simulation.possessionTeam) : null;
    let target = retreat ?? supportTarget(player, state, ball);

    if (!retreat && player.team !== state.simulation.possessionTeam && player.id === pressingPlayer?.id) {
      target = { x: ball.x, y: ball.y };
    }

    const moved = moveToward(player, target, SIMULATION.playerSpeed * dt);
    player.x = clamp(moved.x); player.y = clamp(moved.y);
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

  const attackingX = carrier.team === 'home' ? carrier.x : 1 - carrier.x;
  if (attackingX > 0.82 && Math.abs(carrier.y - 0.5) < 0.28) {
    beginShot(state, carrier);
    return;
  }
  const target = choosePassTarget(state, carrier);
  if (target) beginPass(state, carrier, target);
}

export function ensureCarrier(state) {
  if (state.simulation.carrierId && state.players.some((p) => p.id === state.simulation.carrierId)) return;
  const ball = state.balls[0];
  const nearest = nearestPlayer(state.players, ball, (p) => p.team === state.simulation.possessionTeam);
  state.simulation.carrierId = nearest?.id ?? null;
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
