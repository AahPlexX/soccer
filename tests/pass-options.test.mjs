import test from 'node:test';
import assert from 'node:assert/strict';
import { availablePassOptions } from '../js/pass-options.js';

function stateWith(players, carrierId = 'home-1') {
  return {
    players,
    awayVisible: true,
    simulation: { carrierId, ballTarget: null },
  };
}

test('available pass options require a current stationary carrier', () => {
  const players = [{ id: 'home-1', team: 'home', x: 0.2, y: 0.5 }, { id: 'home-2', team: 'home', x: 0.5, y: 0.5 }];
  assert.deepEqual(availablePassOptions(stateWith(players, null)), []);
  const moving = stateWith(players);
  moving.simulation.ballTarget = { x: 0.5, y: 0.5 };
  assert.deepEqual(availablePassOptions(moving), []);
});

test('clear teammates are returned and blocked lanes are omitted', () => {
  const state = stateWith([
    { id: 'home-1', team: 'home', x: 0.2, y: 0.5 },
    { id: 'home-2', team: 'home', x: 0.7, y: 0.5 },
    { id: 'home-3', team: 'home', x: 0.55, y: 0.2 },
    { id: 'away-1', team: 'away', x: 0.45, y: 0.5 },
  ]);

  assert.deepEqual(availablePassOptions(state).map((player) => player.id), ['home-3']);
});

test('hidden opponent team produces no decision lines for an away carrier', () => {
  const state = stateWith([
    { id: 'away-1', team: 'away', x: 0.8, y: 0.5 },
    { id: 'away-2', team: 'away', x: 0.6, y: 0.3 },
    { id: 'home-1', team: 'home', x: 0.4, y: 0.8 },
  ], 'away-1');
  state.awayVisible = false;
  assert.deepEqual(availablePassOptions(state), []);
});
