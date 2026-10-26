import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { ensureCarrier, stepSimulation } from '../js/simulation.js';

test('simulation acquires a carrier for the possession team', () => {
  const state = createInitialState();
  state.balls[0].x = 0.1;
  state.balls[0].y = 0.5;
  state.simulation.possessionTeam = 'home';
  ensureCarrier(state);
  assert.match(state.simulation.carrierId, /^home-/);
});

test('opponents retreat beyond the home build-out line during home goalkeeper possession', () => {
  const state = createInitialState();
  const goalkeeper = state.players.find((player) => player.id === 'home-1');
  state.balls[0].x = goalkeeper.x;
  state.balls[0].y = goalkeeper.y;
  state.simulation.running = true;
  state.simulation.possessionTeam = 'home';
  state.simulation.carrierId = goalkeeper.id;

  for (let i = 0; i < 90; i += 1) stepSimulation(state, 1 / 60);
  const away = state.players.filter((player) => player.team === 'away');
  assert.ok(away.every((player) => player.x >= 0.35));
  assert.equal(goalkeeper.x, goalkeeper.anchorX);
});

test('goalkeeper build-out waits for retreat before releasing the ball', () => {
  const state = createInitialState();
  const goalkeeper = state.players.find((player) => player.id === 'home-1');
  const pressingForward = state.players.find((player) => player.id === 'away-7');
  pressingForward.x = 0.1;
  state.balls[0].x = goalkeeper.x;
  state.balls[0].y = goalkeeper.y;
  state.simulation.running = true;
  state.simulation.possessionTeam = 'home';
  state.simulation.carrierId = goalkeeper.id;
  state.simulation.actionClock = 1.79;

  stepSimulation(state, 1 / 60);
  assert.equal(state.simulation.carrierId, goalkeeper.id);
  assert.equal(state.simulation.ballTarget, null);
});
