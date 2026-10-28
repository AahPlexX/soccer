import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePlayerDetails, settlePlayers } from '../js/board-actions.js';
import { openPassReceivers } from '../js/pass-options.js';
import { stepSimulation } from '../js/simulation.js';
import { createInitialState, normalizeState } from '../js/state.js';

const player = (state, id) => state.players.find((p) => p.id === id);
const bench = (state, id, benched = true) => {
  const p = player(state, id);
  return updatePlayerDetails(state, id, { number: p.number, label: p.label, colorOverride: '', benched });
};

test('players start on the pitch and old saves without the flag normalize to on-pitch', () => {
  const state = createInitialState();
  assert.ok(state.players.every((p) => p.benched === false));
  const legacy = JSON.parse(JSON.stringify(state));
  legacy.players.forEach((p) => delete p.benched);
  assert.ok(normalizeState(legacy).players.every((p) => p.benched === false));
  legacy.players[0].benched = 'yes';
  assert.equal(normalizeState(legacy).players[0].benched, false);
});

test('benching and returning a player round-trips through updatePlayerDetails and normalization', () => {
  const state = createInitialState();
  assert.equal(bench(state, 'home-4'), 'updated');
  assert.equal(player(normalizeState(JSON.parse(JSON.stringify(state))), 'home-4').benched, true);
  bench(state, 'home-4', false);
  assert.equal(player(state, 'home-4').benched, false);
});

test('benching the ball carrier releases the ball in place', () => {
  const state = createInitialState();
  state.simulation.carrierId = 'home-7';
  bench(state, 'home-7');
  assert.notEqual(state.simulation.carrierId, 'home-7');
});

test('a benched player is not simulated, is not a pass receiver, and never takes the ball', () => {
  const state = createInitialState();
  bench(state, 'home-6');
  const before = { x: player(state, 'home-6').x, y: player(state, 'home-6').y };
  state.simulation.running = true;
  for (let i = 0; i < 60 * 60; i += 1) {
    stepSimulation(state, 1 / 60);
    assert.notEqual(state.simulation.carrierId, 'home-6');
  }
  assert.equal(state.players.length, 14, 'the roster is restored after every step');
  assert.deepEqual({ x: player(state, 'home-6').x, y: player(state, 'home-6').y }, before);
  assert.ok(!openPassReceivers(state, player(state, 'home-7')).some((p) => p.id === 'home-6'));
});

test('a benched player does not push others aside when the board settles', () => {
  const state = createInitialState();
  const other = player(state, 'home-3');
  Object.assign(player(state, 'home-4'), { x: other.x, y: other.y, benched: true });
  const { x, y } = other;
  state.selectedObjectId = null;
  settlePlayers(state);
  assert.deepEqual([other.x, other.y], [x, y]);
});
