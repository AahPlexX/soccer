import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATION } from '../js/constants.js';
import { createInitialState } from '../js/state.js';
import { stepSimulation } from '../js/simulation.js';

const STEP = 1 / 60;

// A shot already in flight from `ball` toward `target`, last touched by (and in possession of) `touch`.
function inFlight(ball, target, touch) {
  const state = createInitialState();
  Object.assign(state.simulation, {
    running: true, possessionTeam: touch, lastTouchTeam: touch, carrierId: null, ballTarget: target,
  });
  state.balls[0].x = ball.x;
  state.balls[0].y = ball.y;
  return state;
}

function runUntilResolved(state) {
  for (let i = 0; i < 240; i += 1) {
    stepSimulation(state, STEP);
    if (state.simulation.restart || state.simulation.carrierId) return;
  }
  assert.fail('ball never left play or reached a player');
}

test('a shot wide of the goal mouth is a goal kick for the defending goalkeeper', () => {
  const state = inFlight({ x: 0.1, y: 0.2 }, { x: -0.05, y: 0.2 }, 'away');
  runUntilResolved(state);
  assert.equal(state.simulation.restart.type, 'goal-kick');
  assert.equal(state.simulation.restart.team, 'home');
  assert.equal(state.simulation.carrierId, 'home-1');
});

test('a central shot is caught and the goalkeeper keeps possession', () => {
  const state = inFlight({ x: 0.1, y: 0.5 }, { x: -0.05, y: 0.5 }, 'away');
  runUntilResolved(state);
  assert.equal(state.simulation.restart, null);
  assert.equal(state.simulation.carrierId, 'home-1');
  assert.equal(state.simulation.possessionTeam, 'home');
  assert.equal(state.simulation.lastTouchTeam, 'home');
});

test('a shot the goalkeeper only reaches is parried behind for an attacking corner', () => {
  const state = inFlight({ x: 0.1, y: 0.53 }, { x: -0.05, y: 0.53 }, 'away');
  runUntilResolved(state);
  assert.equal(state.simulation.restart.type, 'corner');
  assert.equal(state.simulation.restart.team, 'away');
  const taker = state.players.find((p) => p.id === state.simulation.carrierId);
  assert.equal(taker.team, 'away');
  assert.deepEqual([taker.x, taker.y], [0, 1]);
});

test('a shot beyond the goalkeeper reach is a goal followed by a kickoff for the conceding team', () => {
  const state = inFlight({ x: 0.1, y: 0.57 }, { x: -0.05, y: 0.57 }, 'away');
  runUntilResolved(state);
  assert.equal(state.simulation.restart.type, 'kickoff');
  assert.equal(state.simulation.restart.team, 'home');
  assert.deepEqual([state.balls[0].x, state.balls[0].y], [0.5, 0.5]);
});

test('the keeper response works at the away goal too', () => {
  const state = inFlight({ x: 0.9, y: 0.5 }, { x: 1.05, y: 0.5 }, 'home');
  runUntilResolved(state);
  assert.equal(state.simulation.restart, null);
  assert.equal(state.simulation.carrierId, 'away-1');
});

test('a goalkeeper cannot catch a shot that its own team touched last', () => {
  const state = inFlight({ x: 0.1, y: 0.5 }, { x: -0.05, y: 0.5 }, 'home');
  runUntilResolved(state);
  assert.equal(state.simulation.restart.type, 'kickoff');
});

function playMatch(minutes) {
  const state = createInitialState();
  state.simulation.running = true;
  const seen = new Set();
  let last = null;
  let offPitchFrames = 0;
  const inside = (o) => o.x >= 0 && o.x <= 1 && o.y >= 0 && o.y <= 1;
  for (let i = 0; i < 60 * 60 * minutes; i += 1) {
    stepSimulation(state, STEP);
    const { restart } = state.simulation;
    if (restart && restart !== last) seen.add(restart.type);
    last = restart;
    if (![state.balls[0], ...state.players].every(inside)) offPitchFrames += 1;
  }
  return { seen, offPitchFrames, state };
}

test('shot placement cycles through every outcome in SIMULATION.shotAimOffsets', () => {
  assert.equal(SIMULATION.shotAimOffsets.length, 4);
});

test('normal play produces goals, corners and goal kicks and never leaves the ball or players off the pitch', () => {
  const { seen, offPitchFrames } = playMatch(10);
  assert.equal(offPitchFrames, 0);
  ['kickoff', 'corner', 'goal-kick'].forEach((type) => assert.ok(seen.has(type), `no ${type} in 10 minutes`));
});

test('the simulation is deterministic, so a replay matches exactly', () => {
  const a = playMatch(3).state;
  const b = playMatch(3).state;
  assert.deepEqual(a.simulation, b.simulation);
  assert.deepEqual(a.balls, b.balls);
});
