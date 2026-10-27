import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, normalizeState } from '../js/state.js';
import { stepSimulation } from '../js/simulation.js';

function setupLooseBall(state, point, target, lastTouchTeam) {
  state.simulation.running = true;
  state.simulation.carrierId = null;
  state.simulation.receiverId = null;
  state.simulation.possessionTeam = lastTouchTeam;
  state.simulation.lastTouchTeam = lastTouchTeam;
  state.simulation.ballTarget = target;
  state.balls[0].x = point.x;
  state.balls[0].y = point.y;
}

test('shot entering the away goal creates an explicit away kickoff state', () => {
  const state = createInitialState();
  setupLooseBall(state, { x: 0.998, y: 0.5 }, { x: 1, y: 0.5 }, 'home');

  stepSimulation(state, 1 / 60);

  assert.equal(state.simulation.restart?.type, 'kickoff');
  assert.equal(state.simulation.restart?.team, 'away');
  assert.deepEqual({ x: state.balls[0].x, y: state.balls[0].y }, { x: 0.5, y: 0.5 });
  assert.match(state.simulation.carrierId, /^away-/);
});

test('wide attacking touch over the away goal line creates an away goal kick', () => {
  const state = createInitialState();
  setupLooseBall(state, { x: 0.998, y: 0.12 }, { x: 1, y: 0.12 }, 'home');

  stepSimulation(state, 1 / 60);

  assert.equal(state.simulation.restart?.type, 'goal-kick');
  assert.equal(state.simulation.restart?.team, 'away');
  assert.equal(state.simulation.carrierId, 'away-1');
  assert.deepEqual({ x: state.balls[0].x, y: state.balls[0].y }, { x: 0.92, y: 0.5 });
});

test('defending touch over the away goal line creates a home corner', () => {
  const state = createInitialState();
  setupLooseBall(state, { x: 0.998, y: 0.88 }, { x: 1, y: 0.88 }, 'away');

  stepSimulation(state, 1 / 60);

  assert.equal(state.simulation.restart?.type, 'corner');
  assert.equal(state.simulation.restart?.team, 'home');
  assert.deepEqual({ x: state.balls[0].x, y: state.balls[0].y }, { x: 1, y: 1 });
  assert.match(state.simulation.carrierId, /^home-/);
});

test('touchline exit creates an opponent throw-in at the exit x-coordinate', () => {
  const state = createInitialState();
  setupLooseBall(state, { x: 0.42, y: 0.998 }, { x: 0.42, y: 1 }, 'home');

  stepSimulation(state, 1 / 60);

  assert.equal(state.simulation.restart?.type, 'throw-in');
  assert.equal(state.simulation.restart?.team, 'away');
  assert.deepEqual({ x: state.balls[0].x, y: state.balls[0].y }, { x: 0.42, y: 1 });
  assert.match(state.simulation.carrierId, /^away-/);
});

test('a pass in flight is not immediately reacquired by ensureCarrier', () => {
  const state = createInitialState();
  state.simulation.running = true;
  state.simulation.possessionTeam = 'home';
  state.simulation.lastTouchTeam = 'home';
  state.simulation.carrierId = null;
  state.simulation.receiverId = 'home-7';
  state.simulation.ballTarget = { x: 0.6, y: 0.5 };
  state.balls[0].x = 0.5;
  state.balls[0].y = 0.5;

  stepSimulation(state, 1 / 60);

  assert.equal(state.simulation.carrierId, null);
  assert.ok(state.balls[0].x > 0.5);
});

test('older saved simulation state gains restart defaults without a schema bump', () => {
  const older = createInitialState();
  delete older.simulation.lastTouchTeam;
  delete older.simulation.restart;

  const normalized = normalizeState(older);

  assert.equal(normalized.simulation.lastTouchTeam, 'home');
  assert.equal(normalized.simulation.restart, null);
});
