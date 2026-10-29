import { PITCH, SIMULATION } from './constants.js';
import { clamp, clampSupportForOffside, distance, moveToward, separatePlayers, spacingDistance } from './geometry.js';
import { openPassReceivers } from './pass-options.js';
import { activeStage, pendingBallPlayer, SCRIPT_LIMITS, scriptRunTargets } from './play-script.js';
import { classifyBoundaryRestart, GOAL_MAX_Y, GOAL_MIN_Y, restartPoint } from './restarts.js';
import { constrainPlayerPositionForZones } from './zone-constraints.js';

function attackingDirection(team) { return team === 'home' ? 1 : -1; }
function opponent(team) { return team === 'home' ? 'away' : 'home'; }
function teamGoalX(team) { return team === 'home' ? 1 : 0; }
function keepInOwnHalf(player) {
  player.x = player.team === 'home' ? Math.min(player.x, 0.5) : Math.max(player.x, 0.5);
}

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
  const direction = attackingDirection(player.team);
  const progress = player.team === 'home' ? ball.x : 1 - ball.x;
  // Kickoff anchors are in the team's own half; move the attacking formation
  // up together as the ball advances, keeping its relative width and depth.
  const attackShift = player.team === state.simulation.possessionTeam && player.role !== 'GK'
    ? direction * Math.max(0, progress - 0.2) * SIMULATION.attackSupportAdvance : 0;
  const shifted = {
    x: clamp(player.anchorX + attackShift + (ball.x - 0.5) * SIMULATION.supportBallShiftX),
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

// A shot has no receiver and targets a goal line or beyond. Track its projected line crossing,
// not the current ball position, while keeping the target between the posts and in the keeper's area.
function goalkeeperShotTarget(state, keeper, ball) {
  const { ballTarget, carrierId, receiverId, lastTouchTeam } = state.simulation;
  if (!ballTarget || carrierId || receiverId || lastTouchTeam !== opponent(keeper.team)) return null;
  const goalX = keeper.team === 'home' ? PITCH.homeGoalLineX : PITCH.awayGoalLineX;
  const dx = ballTarget.x - ball.x;
  if (keeper.team === 'home' ? dx >= 0 || ballTarget.x > goalX : dx <= 0 || ballTarget.x < goalX) return null;
  const fraction = (goalX - ball.x) / dx;
  if (fraction < 0 || fraction > 1) return null;
  const crossingY = ball.y + (ballTarget.y - ball.y) * fraction;
  // A path crossing a touchline first is not an incoming shot at the goal line.
  if (!Number.isFinite(crossingY) || crossingY <= 0 || crossingY >= 1) return null;
  return {
    x: keeper.team === 'home'
      ? clamp(keeper.x, PITCH.homeGoalLineX, PITCH.homePenaltyMaxX)
      : clamp(keeper.x, PITCH.awayPenaltyMinX, PITCH.awayGoalLineX),
    y: clamp(crossingY, GOAL_MIN_Y, GOAL_MAX_Y),
  };
}

function choosePassTarget(state, carrier) {
  const direction = attackingDirection(carrier.team);
  const teammates = state.players.filter((p) => p.team === carrier.team && p.id !== carrier.id);
  // Prefer receivers whose lane no opponent blocks; if every lane is blocked, choose among all teammates as before.
  const open = openPassReceivers(state, carrier);
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
  const inOwnArea = defending === 'home' ? keeper.x <= PITCH.homePenaltyMaxX : keeper.x >= PITCH.awayPenaltyMinX;
  if (!inOwnArea || keeper.y < PITCH.penaltyMinY || keeper.y > PITCH.penaltyMaxY) return false;
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
    state.simulation.tackleCooldown = Math.max(state.simulation.tackleCooldown || 0, SIMULATION.receiveProtectionSeconds);
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
  if (distance(ball, state.simulation.ballTarget) < 0.015) {
    acquireLooseBall(state);
    if (!state.simulation.carrierId) { state.simulation.ballTarget = null; state.simulation.receiverId = null; }
  }
}

function beginRestart(state, restart, exitPoint) {
  if (restart.type === 'kickoff') {
    state.players.forEach((player) => {
      player.x = player.anchorX;
      player.y = player.anchorY;
      keepInOwnHalf(player);
    });
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
  if (!taker) state.simulation.restart = null;
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
  const looseBallChaser = !carrier && !state.simulation.ballTarget
    ? nearestPlayer(state.players, ball, () => true) : null;
  const scripted = scriptRunTargets(state);

  state.players.forEach((player) => {
    // The coach's play script overrides the CPU for players it is moving (js/play-script.js).
    const scriptedTarget = scripted.get(player.id);
    if (scriptedTarget) {
      movePlayer(state, player, scriptedTarget, SIMULATION.playerSpeed * (player.id === state.simulation.carrierId ? 0.78 : 1) * dt, false);
      return;
    }
    if (player.id === state.simulation.carrierId) {
      // Legal restart placement and the mandatory U9 goalkeeper build-out hold take precedence over drill constraints.
      if (state.simulation.restart || (buildOut && player.role === 'GK')) return;
      const direction = attackingDirection(player.team);
      const target = { x: clamp(player.x + direction * 0.08), y: clamp(player.y + (0.5 - player.y) * 0.06) };
      movePlayer(state, player, target, SIMULATION.playerSpeed * 0.78 * dt);
      return;
    }

    const retreat = buildOut ? retreatTarget(player, state.simulation.possessionTeam) : null;
    const shotTarget = !retreat && player.role === 'GK' ? goalkeeperShotTarget(state, player, ball) : null;
    if (shotTarget) {
      movePlayer(state, player, shotTarget, SIMULATION.keeperTrackingSpeed * dt);
      return;
    }
    let target = retreat ?? supportTarget(player, state, ball);

    if (!retreat && (player.id === looseBallChaser?.id
      || (player.team !== state.simulation.possessionTeam && player.id === pressingPlayer?.id))) {
      target = { x: ball.x, y: ball.y };
    }

    // Build-out retreat is a mandatory U9 rule and therefore overrides an optional coach-created zone constraint.
    movePlayer(state, player, target, SIMULATION.playerSpeed * dt, !retreat);
    // Kickoff placement takes precedence when a drill zone or support target crosses halfway.
    if (state.simulation.restart?.type === 'kickoff') keepInOwnHalf(player);
  });
}

// Deterministic close-range pressure: an outfield defender wins possession when
// close enough, with a brief grace period so overlapping players do not swap
// possession each frame. A held restart or goalkeeper build-out is protected.
function resolveTackle(state) {
  const sim = state.simulation;
  if (sim.tackleCooldown > 0 || sim.restart || sim.ballTarget) return;
  const carrier = state.players.find((player) => player.id === sim.carrierId);
  if (!carrier || isBuildOutSituation(state, carrier)) return;
  const defender = nearestPlayer(state.players, carrier, (player) => player.team !== carrier.team && player.role !== 'GK');
  if (!defender || spacingDistance(defender, carrier) > SIMULATION.tackleDistance) return;
  Object.assign(sim, {
    carrierId: defender.id,
    possessionTeam: defender.team,
    lastTouchTeam: defender.team,
    actionClock: 0,
    tackleCooldown: SIMULATION.tackleCooldownSeconds,
  });
}

function decideAction(state) {
  const carrier = state.players.find((p) => p.id === state.simulation.carrierId);
  if (!carrier) return;
  if (pendingBallPlayer(state) === carrier.id) return; // the play script decides for them
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

// Carries out the coach's play script after the ball moves and before the CPU decides. Each stage runs its tasks
// together and ends when all are done or it times out; then the next stage starts, and when none are left the CPU is free.
function advanceScript(state, dt) {
  const stage = activeStage(state.script);
  if (!stage) return;
  const sim = state.simulation;
  if (!stage.started) {
    stage.started = true;
    // A pass or shot needs the ball: the stage hands it to that player, like the Give ball action.
    stage.tasks.forEach((task) => {
      const player = task.type === 'run' ? null : state.players.find((p) => p.id === task.player);
      if (!player || sim.carrierId === player.id) return;
      Object.assign(sim, { carrierId: player.id, possessionTeam: player.team, lastTouchTeam: player.team, receiverId: null, ballTarget: null, restart: null, actionClock: 0, tackleCooldown: 0 });
      Object.assign(state.balls[0], { x: player.x, y: player.y });
    });
  }
  stage.age += dt;
  stage.tasks.forEach((task) => {
    if (task.done) return;
    const player = state.players.find((p) => p.id === task.player);
    if (!player) { task.done = true; return; } // benched or removed
    if (task.type === 'run') {
      if (spacingDistance(player, task.point) < SCRIPT_LIMITS.arriveDistance) task.done = true;
      return;
    }
    const target = task.type === 'pass' ? state.players.find((p) => p.id === task.to) : null;
    if (task.type === 'pass' && !target) { task.done = true; return; }
    if (!task.sent) {
      if (sim.carrierId !== player.id || sim.ballTarget) return;
      sim.restart = null;
      if (target) beginPass(state, player, target); else beginShot(state, player);
      task.sent = true;
    } else if (!sim.ballTarget) task.done = true; // received, intercepted, saved or out: the ball is no longer in flight
  });
  if (stage.age >= SCRIPT_LIMITS.timeoutSeconds) stage.tasks.forEach((task) => { task.done = true; });
}

// A coach moving the ball (or its carrier) takes control of the position. Drop the
// previous pass/restart so playback begins from the visible board, not an old target.
export function releaseManuallyMovedObject(state, objectId) {
  if (objectId !== state.balls[0]?.id && objectId !== state.simulation.carrierId) return;
  Object.assign(state.simulation, {
    carrierId: null, receiverId: null, ballTarget: null, restart: null, actionClock: 0, tackleCooldown: 0,
  });
}

// Reapplying a formation moves that team's players. If its carrier is moved,
// leave the ball where it is and release any held restart just like a manual drag.
export function releaseFormationCarrier(state, team) {
  const carrier = state.players.find((player) => player.id === state.simulation.carrierId);
  if (carrier?.team === team) releaseManuallyMovedObject(state, carrier.id);
}

export function ensureCarrier(state) {
  if (state.simulation.ballTarget) return;
  if (state.simulation.carrierId && state.players.some((p) => p.id === state.simulation.carrierId)) return;
  state.simulation.carrierId = null;
  // Do not teleport a loose ball to a distant player. The nearest player collects
  // it only when physically close; otherwise a player runs towards it.
  acquireLooseBall(state);
}

function stepActiveSimulation(state, dt) {
  if (!state.simulation.running) return state;
  ensureCarrier(state);
  state.simulation.actionClock += dt * state.speed;
  const scaledDt = dt * state.speed;
  state.simulation.tackleCooldown = Math.max(0, (Number.isFinite(state.simulation.tackleCooldown) ? state.simulation.tackleCooldown : 0) - scaledDt);
  advancePlayers(state, scaledDt);
  resolveTackle(state);
  advanceBall(state, scaledDt);
  advanceScript(state, scaledDt);
  if (state.simulation.actionClock >= SIMULATION.actionIntervalSeconds) {
    state.simulation.actionClock = 0;
    decideAction(state);
  }
  // Players are physical: no two may overlap, checked last so restart placement above cannot leave overlaps on screen.
  // A held restart taker stands on the spot, so others yield to them; the legal kickoff half still takes precedence.
  separatePlayers(state.players, SIMULATION.playerSpacing, state.simulation.restart ? [state.simulation.carrierId] : []);
  if (state.simulation.restart?.type === 'kickoff') state.players.forEach(keepInOwnHalf);
  // Separation can move the carrier; the ball stays with them.
  const carrier = state.players.find((p) => p.id === state.simulation.carrierId);
  if (carrier) Object.assign(state.balls[0], { x: carrier.x, y: carrier.y });
  return state;
}

// The roster remains intact in saves; only on-pitch participants may affect play.
export function stepSimulation(state, dt) {
  const roster = state.players;
  const active = roster.filter((player) => !player.benched);
  if (!active.length) { state.simulation.running = false; return state; }
  state.players = active;
  try { return stepActiveSimulation(state, dt); }
  finally { state.players = roster; }
}
