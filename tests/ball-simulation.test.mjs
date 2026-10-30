import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL, GOAL_HEIGHT } from '../js/ball-physics.js';
import { SIMULATION } from '../js/constants.js';
import { classifyBoundaryRestart } from '../js/restarts.js';
import { applyPlayerAction } from '../js/player-actions.js';
import { releaseManuallyMovedObject, stepSimulation } from '../js/simulation.js';
import { createInitialState } from '../js/state.js';

const STEP = 1 / 60;
const player = (state, id) => state.players.find((p) => p.id === id);
const place = (state, id, x, y) => Object.assign(player(state, id), { x, y, anchorX: x, anchorY: y });
const speedOf = (state) => Math.hypot(...Object.values(state.simulation.ballVelocity));

// Two teammates with an opponent in the passing lane, everyone else out of the way.
function laneScenario(blockerY) {
  const state = createInitialState();
  place(state, 'home-6', 0.3, 0.5);
  place(state, 'home-7', 0.62, 0.5);
  place(state, 'away-3', 0.46, blockerY);
  for (const p of state.players) if (p.role !== 'GK' && !['home-6', 'home-7', 'away-3'].includes(p.id)) p.benched = true;
  Object.assign(state.simulation, { running: true, carrierId: 'home-6', possessionTeam: 'home', actionClock: 0 });
  Object.assign(state.balls[0], { x: 0.3, y: 0.5 });
  return state;
}

// `pinned` keeps the blocker standing on the lane so the test measures the ball, not the defender's run.
function flyPass(state, seconds = 4, pinned = null) {
  let peakOverBlocker = 0;
  let maxHeight = 0;
  let intercepted = false;
  for (let i = 0; i < 60 * seconds; i += 1) {
    if (pinned) place(state, 'away-3', pinned.x, pinned.y);
    stepSimulation(state, STEP);
    const ball = state.balls[0];
    maxHeight = Math.max(maxHeight, ball.z - BALL.radius);
    if (Math.abs(ball.x - 0.46) < 0.01 && !state.simulation.carrierId) peakOverBlocker = Math.max(peakOverBlocker, ball.z - BALL.radius);
    const carrier = state.simulation.carrierId;
    if (carrier && carrier !== 'home-6') { intercepted = carrier !== 'home-7'; break; }
  }
  return { peakOverBlocker, maxHeight, intercepted, carrier: state.simulation.carrierId };
}

test('an open lane is a ground pass: it stays low and the receiver takes it', () => {
  const state = laneScenario(0.9);
  applyPlayerAction(state, 'pass', 'home-6', 'home-7');
  const result = flyPass(state, 4, { x: 0.46, y: 0.9 });
  assert.ok(result.maxHeight < 0.5, `a ground pass stays on the grass (peak ${result.maxHeight} m)`);
  assert.equal(result.carrier, 'home-7');
});

test('a blocked lane is lofted over the defender, who cannot reach it, and the receiver still gets it', () => {
  const state = laneScenario(0.5);
  applyPlayerAction(state, 'pass', 'home-6', 'home-7');
  const result = flyPass(state, 4, { x: 0.46, y: 0.5 });
  assert.ok(result.maxHeight > 2, `the pass goes up (peak ${result.maxHeight} m)`);
  assert.ok(result.peakOverBlocker > SIMULATION.controlHeight, `it passes over the defender's reach (${result.peakOverBlocker} m)`);
  assert.equal(result.intercepted, false);
  assert.equal(result.carrier, 'home-7', 'the receiver controls it after it lands');
});

test('a ground ball that runs through a defender is intercepted', () => {
  const state = laneScenario(0.5);
  Object.assign(state.simulation, { carrierId: null, receiverId: 'home-7', ballTarget: { x: 0.62, y: 0.5 }, lastTouchTeam: 'home', ballVelocity: { x: 12, y: 0, z: 0 } });
  const result = flyPass(state);
  assert.equal(result.carrier, 'away-3', 'the defender in the path takes it');
});

test('the kicker cannot take their own ball straight back', () => {
  const state = laneScenario(0.9);
  applyPlayerAction(state, 'pass', 'home-6', 'home-7');
  for (let i = 0; i < 10; i += 1) stepSimulation(state, STEP);
  assert.notEqual(state.simulation.carrierId, 'home-6');
  assert.ok(speedOf(state) > 5, 'the ball is on its way');
});

test('height decides goal versus over the bar: the same line, two heights', () => {
  assert.equal(classifyBoundaryRestart({ x: 1, y: 0.5 }, 'home', 1.0).type, 'kickoff', 'low enough is a goal');
  assert.equal(classifyBoundaryRestart({ x: 1, y: 0.5 }, 'home', GOAL_HEIGHT + 0.5).type, 'goal-kick', 'over the bar is out');
  assert.equal(classifyBoundaryRestart({ x: 1, y: 0.5 }, 'away', GOAL_HEIGHT + 0.5).type, 'corner', 'over the bar off the defender is a corner');
  assert.equal(classifyBoundaryRestart({ x: 0, y: 0.5 }, 'away', 5).type, 'goal-kick');
});

function struckBall(overrides, ballVelocity) {
  const state = createInitialState();
  Object.assign(state.simulation, { running: true, carrierId: null, possessionTeam: 'home', lastTouchTeam: 'home', ballVelocity: { x: 0, y: 0, z: 0, ...ballVelocity } });
  Object.assign(state.balls[0], { x: 0.9, y: 0.5, z: BALL.radius, ...overrides });
  return state;
}

test('a shot that is still rising over the crossbar when it reaches the line is a goal kick, not a goal', () => {
  const state = struckBall({ z: 2.6 }, { x: 24, y: 0, z: 1 });
  for (let i = 0; i < 60 && !state.simulation.restart; i += 1) stepSimulation(state, STEP);
  assert.equal(state.simulation.restart?.type, 'goal-kick');
  assert.equal(state.simulation.restart?.team, 'away');
});

test('a low shot through the mouth is a goal; one at the keeper is held, but a high one cannot be held', () => {
  const goal = struckBall({ y: 0.55, z: 0.6 }, { x: 24, y: 0, z: 0 });
  place(goal, 'away-1', 0.5, 0.95);
  for (let i = 0; i < 60 && !goal.simulation.restart; i += 1) stepSimulation(goal, STEP);
  assert.equal(goal.simulation.restart?.type, 'kickoff', 'a low shot just inside the mouth beats a keeper who is elsewhere');

  const held = struckBall({ y: 0.5, z: 0.5 }, { x: 24, y: 0, z: 0 });
  place(held, 'away-1', 0.97, 0.5);
  for (let i = 0; i < 60 && !held.simulation.restart && held.simulation.carrierId !== 'away-1'; i += 1) stepSimulation(held, STEP);
  assert.equal(held.simulation.carrierId, 'away-1', 'a low shot straight at the keeper is held');

  const high = struckBall({ y: 0.5, z: 2.5 }, { x: 24, y: 0, z: 0 });
  place(high, 'away-1', 0.97, 0.5);
  for (let i = 0; i < 60 && !high.simulation.restart && high.simulation.carrierId !== 'away-1'; i += 1) stepSimulation(high, STEP);
  assert.equal(high.simulation.restart?.type, 'goal-kick', 'a shot above the keeper\'s reach and the bar is simply out, not held');
});

test('a ball hitting the crossbar comes back into play', () => {
  const state = struckBall({ y: 0.5, z: GOAL_HEIGHT + 0.2 }, { x: 24, y: 0, z: 0 });
  place(state, 'away-1', 0.5, 0.9);
  let rebounded = false;
  for (let i = 0; i < 120; i += 1) {
    stepSimulation(state, STEP);
    if (state.simulation.ballVelocity.x < 0) { rebounded = true; break; }
    if (state.simulation.restart) break;
  }
  assert.ok(rebounded, 'a ball that strikes the bar bounces back out');
});

test('the carried ball sits on the grass, and moving it by hand puts it back down at rest', () => {
  const state = createInitialState();
  Object.assign(state.simulation, { running: true, carrierId: 'home-7' });
  Object.assign(state.balls[0], { z: 3 });
  state.simulation.ballVelocity = { x: 9, y: 2, z: 4 };
  stepSimulation(state, STEP);
  assert.equal(state.balls[0].z, BALL.radius);
  assert.deepEqual(state.simulation.ballVelocity, { x: 0, y: 0, z: 0 });

  const lofted = struckBall({ z: 4 }, { x: 5, y: 0, z: 3 });
  releaseManuallyMovedObject(lofted, lofted.balls[0].id);
  assert.equal(lofted.balls[0].z, BALL.radius);
  assert.deepEqual(lofted.simulation.ballVelocity, { x: 0, y: 0, z: 0 });
});

test('the physics keeps a long match deterministic, on the pitch, and inside the physical envelope', () => {
  const run = () => {
    const state = createInitialState();
    state.simulation.running = true;
    let maxHeight = 0;
    let maxSpeed = 0;
    for (let i = 0; i < 60 * 120; i += 1) {
      stepSimulation(state, STEP);
      const ball = state.balls[0];
      assert.ok(ball.z >= BALL.radius - 1e-9 && Number.isFinite(ball.z), 'the ball is never underground or NaN');
      assert.ok(ball.x >= 0 && ball.x <= 1 && ball.y >= 0 && ball.y <= 1, 'the ball is always on the pitch');
      maxHeight = Math.max(maxHeight, ball.z);
      maxSpeed = Math.max(maxSpeed, speedOf(state));
    }
    return { state, maxHeight, maxSpeed };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.state.simulation, b.state.simulation);
  assert.deepEqual(a.state.balls, b.state.balls);
  assert.ok(a.maxHeight < 20 && a.maxSpeed < 45, 'nothing leaves the physical envelope');
});

test('a restart taker with nobody to pass to plays on instead of freezing the match', () => {
  const state = createInitialState();
  for (const p of state.players) if (p.team === 'home' && p.id !== 'home-7') p.benched = true;
  Object.assign(state.simulation, { running: true, carrierId: 'home-7', possessionTeam: 'home', lastTouchTeam: 'home', restart: { type: 'throw-in', team: 'home', side: 'left' } });
  place(state, 'home-7', 0.5, 0.02);
  Object.assign(state.balls[0], { x: 0.5, y: 0.02 });
  for (let i = 0; i < 180 && state.simulation.restart; i += 1) stepSimulation(state, STEP);
  assert.equal(state.simulation.restart, null);
});

test('flipping the board swaps flank sides but leaves goal sides alone', async () => {
  const { rotateSpatial } = await import('../js/board-rotation.js');
  for (const [side, expected] of [['left', 'right'], ['right', 'left'], ['home', 'home'], ['away', 'away']]) {
    const state = createInitialState();
    state.simulation.restart = { type: 'corner', team: 'home', side };
    rotateSpatial(state);
    assert.equal(state.simulation.restart.side, expected, side);
  }
});
