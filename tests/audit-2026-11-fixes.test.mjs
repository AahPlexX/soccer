import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../js/state.js';
import { eraseDrawingNear, isDegenerateDrawing } from '../js/coaching.js';
import { normalizeSettings } from '../js/game/settings.js';

test('Kids difficulty survives settings normalization', () => {
  assert.equal(normalizeSettings({ difficulty: 'kids' }).difficulty, 'kids');
});

test('one-point drawings are degenerate; two distinct points are not', () => {
  assert.equal(isDegenerateDrawing({ points: [{ x: 0.1, y: 0.1 }] }), true);
  assert.equal(isDegenerateDrawing({ points: [{ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 }] }), true);
  assert.equal(isDegenerateDrawing({ points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }] }), false);
});

test('the eraser leaves play-script arrows alone', () => {
  const state = createInitialState();
  state.drawings = [{ id: 'a', type: 'arrow', source: 'action', points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }] }];
  assert.equal(eraseDrawingNear(state, { x: 0.3, y: 0.2 }), false);
  assert.equal(state.drawings.length, 1);
});
