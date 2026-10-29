import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES } from '../js/constants.js';
import { toggleZone } from '../js/board-actions.js';
import { createInitialState, normalizeState } from '../js/state.js';
import { constrainPointToZones } from '../js/zone-constraints.js';

test('the optional Center Channel is the middle third and can be selected and saved', () => {
  assert.ok(Math.abs(ZONES.center.y1 - 1 / 3) < 1e-9 && Math.abs(ZONES.center.y2 - 2 / 3) < 1e-9);
  assert.deepEqual([ZONES.center.x1, ZONES.center.x2], [0, 1]);
  const state = createInitialState();
  assert.equal(toggleZone(state, 'center'), true);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))).selectedZones, ['center']);
});

test('keeping a player inside the Center Channel pulls them to its nearest edge', () => {
  const inside = constrainPointToZones({ x: 0.5, y: 0.5 }, ['center']);
  assert.deepEqual(inside, { x: 0.5, y: 0.5 });
  const pulled = constrainPointToZones({ x: 0.5, y: 0.9 }, ['center']);
  assert.ok(Math.abs(pulled.y - 2 / 3) < 1e-9);
});
