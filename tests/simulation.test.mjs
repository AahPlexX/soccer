import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { ensureCarrier, releaseFormationCarrier, releaseManuallyMovedObject, stepSimulation } from '../js/simulation.js';

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


test('manual placement clears stale possession, pass and restart without moving the ball', () => {
  for (const moved of ['ball-main', 'home-7']) {
    const state = createInitialState();
    Object.assign(state.simulation, {
      carrierId: 'home-7', receiverId: 'home-6', ballTarget: { x: 0.8, y: 0.5 },
      restart: { type: 'kickoff', team: 'home' }, actionClock: 1,
    });
    state.balls[0].x = 0.5;
    state.balls[0].y = 0.1;
    releaseManuallyMovedObject(state, moved);
    assert.equal(state.simulation.carrierId, null);
    assert.equal(state.simulation.receiverId, null);
    assert.equal(state.simulation.ballTarget, null);
    assert.equal(state.simulation.restart, null);
    state.simulation.running = true;
    stepSimulation(state, 1 / 60);
    assert.deepEqual({ x: state.balls[0].x, y: state.balls[0].y }, { x: 0.5, y: 0.1 });
  }
});

test('nearest player runs to a loose ball and collects it rather than teleporting it', () => {
  const state = createInitialState();
  state.balls[0].x = 0.5;
  state.balls[0].y = 0.1;
  state.simulation.running = true;
  const original = { x: state.balls[0].x, y: state.balls[0].y };
  stepSimulation(state, 1 / 60);
  assert.deepEqual({ x: state.balls[0].x, y: state.balls[0].y }, original);
  for (let i = 0; i < 1200 && !state.simulation.carrierId; i++) stepSimulation(state, 1 / 60);
  assert.ok(state.simulation.carrierId, 'a player eventually reaches the loose ball');
});

test('moving an unrelated player does not cancel an active pass', () => {
  const state = createInitialState();
  state.simulation.ballTarget = { x: 0.8, y: 0.5 };
  state.simulation.receiverId = 'home-6';
  releaseManuallyMovedObject(state, 'away-2');
  assert.deepEqual(state.simulation.ballTarget, { x: 0.8, y: 0.5 });
  assert.equal(state.simulation.receiverId, 'home-6');
});

test('a nearby outfield defender wins possession and cooldown prevents immediate reversal', () => {
  for (const team of ['home', 'away']) {
    const state = createInitialState();
    const carrier = state.players.find((player) => player.id === `${team}-7`);
    const otherTeam = team === 'home' ? 'away' : 'home';
    const defender = state.players.find((player) => player.id === `${otherTeam}-7`);
    Object.assign(carrier, { x: 0.5, y: 0.5 });
    Object.assign(defender, { x: 0.5, y: 0.5 });
    Object.assign(state.balls[0], { x: 0.5, y: 0.5 });
    Object.assign(state.simulation, { running: true, carrierId: carrier.id, possessionTeam: team, lastTouchTeam: team });
    stepSimulation(state, 1 / 60);
    assert.equal(state.simulation.carrierId, defender.id);
    assert.equal(state.simulation.possessionTeam, otherTeam);
    assert.equal(state.simulation.lastTouchTeam, otherTeam);
    assert.deepEqual([state.balls[0].x, state.balls[0].y], [defender.x, defender.y]);
    stepSimulation(state, 1 / 60);
    assert.equal(state.simulation.carrierId, defender.id, 'grace period prevents an immediate reversal');
  }
});

test('restart and goalkeeper build-out possession cannot be tackled while held', () => {
  for (const kind of ['kickoff', 'build-out']) {
    const state = createInitialState();
    const carrier = state.players.find((player) => player.id === (kind === 'kickoff' ? 'home-7' : 'home-1'));
    const defender = state.players.find((player) => player.id === 'away-7');
    Object.assign(carrier, { x: kind === 'kickoff' ? 0.5 : 0.1, y: 0.5 });
    Object.assign(defender, { x: carrier.x, y: carrier.y });
    Object.assign(state.balls[0], { x: carrier.x, y: carrier.y });
    Object.assign(state.simulation, { running: true, carrierId: carrier.id, possessionTeam: 'home', lastTouchTeam: 'home',
      restart: kind === 'kickoff' ? { type: 'kickoff', team: 'home' } : null });
    stepSimulation(state, 1 / 60);
    assert.equal(state.simulation.carrierId, carrier.id, `${kind} is protected`);
  }
});

test('a defender outside tackling range does not win possession', () => {
  const state = createInitialState();
  const carrier = state.players.find((player) => player.id === 'home-7');
  state.players.filter((player) => player.team === 'away').forEach((player) => { player.x = 0.95; player.y = 0.05; });
  Object.assign(carrier, { x: 0.5, y: 0.5 });
  Object.assign(state.balls[0], { x: carrier.x, y: carrier.y });
  Object.assign(state.simulation, { running: true, carrierId: carrier.id, possessionTeam: 'home' });
  stepSimulation(state, 1 / 60);
  assert.equal(state.simulation.carrierId, carrier.id);
});

test('post-tackle protection survives a pass reception', () => {
  const state = createInitialState();
  const receiver = state.players.find((player) => player.id === 'home-6');
  Object.assign(state.balls[0], { x: receiver.x, y: receiver.y });
  Object.assign(state.simulation, { running: true, possessionTeam: 'home', carrierId: null,
    receiverId: receiver.id, ballTarget: { x: receiver.x, y: receiver.y }, tackleCooldown: 3 });
  stepSimulation(state, 1 / 60);
  assert.equal(state.simulation.carrierId, receiver.id);
  assert.ok(state.simulation.tackleCooldown > 2.9, 'reception must not shorten the existing grace period');
});


test('reapplying the carrier team releases possession and a held restart at the ball position', () => {
  for (const team of ['home', 'away']) {
    const state = createInitialState();
    Object.assign(state.balls[0], { x: 0.5, y: 0.1 });
    Object.assign(state.simulation, { carrierId: `${team}-7`, restart: { type: 'kickoff', team }, actionClock: 1 });
    releaseFormationCarrier(state, team);
    assert.equal(state.simulation.carrierId, null);
    assert.equal(state.simulation.restart, null);
    state.simulation.running = true;
    stepSimulation(state, 1 / 60);
    assert.deepEqual({ x: state.balls[0].x, y: state.balls[0].y }, { x: 0.5, y: 0.1 });
  }
});

test('reapplying the other team does not release a held restart', () => {
  const state = createInitialState();
  Object.assign(state.simulation, { carrierId: 'home-7', restart: { type: 'kickoff', team: 'home' } });
  releaseFormationCarrier(state, 'away');
  assert.equal(state.simulation.carrierId, 'home-7');
  assert.deepEqual(state.simulation.restart, { type: 'kickoff', team: 'home' });
});
