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
  // y 0.57 is inside the goal mouth but beyond the goalkeeper's reach; a shot at the keeper is caught (tests/shots.test.mjs).
  setupLooseBall(state, { x: 0.998, y: 0.57 }, { x: 1, y: 0.57 }, 'home');

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

test('kickoff places both teams in their own half and keeps them there until the restart', () => {
  for (const scoringTeam of ['home', 'away']) {
    const state = createInitialState();
    // Customized anchors can be on the opposing half; keep the defending keeper away from the shot.
    for (const player of state.players) {
      player.anchorX = player.team === 'home' ? 0.85 : 0.15;
      if (player.role === 'GK') player.y = 0.1;
    }
    // The away team's optional zone conflicts with its mandatory kickoff half.
    state.zoneRestrictionMode = 'keep-in';
    state.zoneRestrictionScope = 'away';
    state.selectedZones = ['homeBuild'];
    const goalX = scoringTeam === 'home' ? 1 : 0;
    setupLooseBall(state, { x: goalX === 1 ? 0.998 : 0.002, y: 0.57 }, { x: goalX, y: 0.57 }, scoringTeam);
    stepSimulation(state, 1 / 60);
    assert.equal(state.simulation.restart?.type, 'kickoff');
    for (let i = 0; i < 30; i++) {
      for (const player of state.players) {
        assert.ok(player.team === 'home' ? player.x <= 0.5 : player.x >= 0.5, `${player.id} crossed halfway before kickoff`);
      }
      stepSimulation(state, 1 / 60);
      assert.equal(state.simulation.restart?.type, 'kickoff');
    }
    for (let i = 0; i < 100 && state.simulation.restart; i++) stepSimulation(state, 1 / 60);
    assert.equal(state.simulation.restart, null, 'the kickoff is eventually released');
  }
});
