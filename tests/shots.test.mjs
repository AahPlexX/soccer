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

test('each defending goalkeeper tracks the projected crossing point of an incoming shot', () => {
  for (const [team, touch, ball, target] of [
    ['home', 'away', { x: 0.2, y: 0.42 }, { x: -0.05, y: 0.62 }],
    ['away', 'home', { x: 0.8, y: 0.42 }, { x: 1.05, y: 0.62 }],
  ]) {
    const state = inFlight(ball, target, touch);
    const keeper = state.players.find((player) => player.id === `${team}-1`);
    const startX = keeper.x;
    stepSimulation(state, STEP);
    assert.ok(keeper.y > 0.5, `${team} keeper should move toward the upper projected goal crossing`);
    assert.equal(keeper.x, startX, `${team} keeper already in the box should track laterally`);
  }
});

test('a pass to a receiver does not trigger shot tracking', () => {
  const state = inFlight({ x: 0.2, y: 0.42 }, { x: 0, y: 0.62 }, 'away');
  state.simulation.receiverId = 'away-2';
  const keeper = state.players.find((player) => player.id === 'home-1');
  stepSimulation(state, STEP);
  assert.ok(keeper.y < 0.5, 'keeper should use ordinary support positioning during a pass');
});

test('zone restrictions also apply while a goalkeeper tracks a shot', () => {
  const state = inFlight({ x: 0.2, y: 0.42 }, { x: -0.05, y: 0.62 }, 'away');
  state.zoneRestrictionMode = 'keep-in';
  state.zoneRestrictionScope = 'home';
  state.selectedZones = ['left'];
  const keeper = state.players.find((player) => player.id === 'home-1');
  for (let i = 0; i < 15; i += 1) stepSimulation(state, STEP);
  assert.ok(keeper.y <= 0.5);
});

test('a goalkeeper far outside the penalty area cannot make a remote save at either goal', () => {
  for (const [defending, touch, ballX, targetX] of [
    ['home', 'away', 0.002, -0.05], ['away', 'home', 0.998, 1.05],
  ]) {
    const state = inFlight({ x: ballX, y: 0.5 }, { x: targetX, y: 0.5 }, touch);
    const keeper = state.players.find((player) => player.id === `${defending}-1`);
    keeper.x = 0.5;
    stepSimulation(state, STEP);
    assert.equal(state.simulation.restart?.type, 'kickoff');
    assert.equal(state.simulation.restart?.team, defending);
  }
});

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

test('the generated shot cycle produces a catch, parry, goal and miss at both ends and all speeds', () => {
  for (const team of ['home', 'away']) {
    for (const speed of [0.5, 1, 2]) {
      for (const [index, outcome] of ['catch', 'corner', 'kickoff', 'goal-kick'].entries()) {
        const state = createInitialState();
        const shooter = state.players.find((player) => player.id === `${team}-7`);
        shooter.x = team === 'home' ? 0.9 : 0.1;
        shooter.y = 0.5;
        Object.assign(state.balls[0], { x: shooter.x, y: shooter.y });
        state.speed = speed;
        Object.assign(state.simulation, {
          running: true, possessionTeam: team, lastTouchTeam: team,
          carrierId: shooter.id, actionClock: SIMULATION.actionIntervalSeconds, shotCount: index,
        });
        stepSimulation(state, STEP);
        assert.equal(state.simulation.shotCount, index + 1);
        assert.ok(state.simulation.ballTarget, 'shot must be in flight');
        runUntilResolved(state);
        const actual = state.simulation.restart?.type ?? 'catch';
        assert.equal(actual, outcome, `${team} at ${speed}×, shot ${index + 1}`);
        if (outcome === 'catch') {
          assert.equal(state.simulation.carrierId, team === 'home' ? 'away-1' : 'home-1');
        }
      }
    }
  }
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
