import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState, normalizeState } from '../js/state.js';

test('initial state starts with no mini goals', () => {
  assert.deepEqual(createInitialState().miniGoals, []);
});

test('normalizeState keeps saved mini goals', () => {
  const candidate = { ...createInitialState(), miniGoals: [{ id: 'minigoal-1', x: 0.4, y: 0.6 }] };
  assert.deepEqual(normalizeState(candidate).miniGoals, [{ id: 'minigoal-1', x: 0.4, y: 0.6 }]);
});

test('normalizeState loads older saves that predate mini goals', () => {
  const legacy = createInitialState();
  delete legacy.miniGoals;
  assert.deepEqual(normalizeState(legacy).miniGoals, []);
});

test('normalizeState rejects a non-array mini goal list', () => {
  const candidate = { ...createInitialState(), miniGoals: 'oops' };
  assert.deepEqual(normalizeState(candidate).miniGoals, []);
});
