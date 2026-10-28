import test from 'node:test';
import assert from 'node:assert/strict';
import { pickObject } from '../js/board-actions.js';
import { fromWorld, toWorld } from '../js/board-scene.js';
import { createInitialState } from '../js/state.js';

test('fromWorld inverts toWorld and clamps points off the pitch', () => {
  for (const [x, y] of [[0, 0], [0.25, 0.8], [0.5, 0.5], [1, 1]]) {
    const world = toWorld(x, y);
    const back = fromWorld(world.x, world.z);
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9);
  }
  assert.deepEqual(fromWorld(1000, -1000), { x: 1, y: 0 });
});

test('pickObject returns the nearest movable object under a point, or null', () => {
  const state = createInitialState();
  const player = state.players.find((p) => p.id === 'home-7');
  assert.equal(pickObject(state, { x: player.x, y: player.y }), 'home-7');
  assert.equal(pickObject(state, { x: player.x + 0.005, y: player.y }), 'home-7');
  assert.equal(pickObject(state, { x: 0.01, y: 0.01 }), null);
});

test('pickObject ignores benched players and finds props', () => {
  const state = createInitialState();
  const player = state.players.find((p) => p.id === 'home-7');
  player.benched = true;
  assert.notEqual(pickObject(state, { x: player.x, y: player.y }), 'home-7');
  state.cones.push({ id: 'c1', x: 0.3, y: 0.3, color: '#ff8c1a' });
  state.miniGoals.push({ id: 'm1', x: 0.7, y: 0.7 });
  assert.equal(pickObject(state, { x: 0.3, y: 0.3 }), 'c1');
  assert.equal(pickObject(state, { x: 0.7, y: 0.7 }), 'm1');
});
