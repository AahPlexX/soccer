import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE } from '../js/constants.js';
import { addProp } from '../js/board-actions.js';
import { DRAWING_TYPES, TOOLS, createInitialState, normalizeState } from '../js/state.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the run arrow (PRD 7.1) is a tool and a persisted drawing type', () => {
  assert.ok(TOOLS.includes('run'));
  assert.ok(DRAWING_TYPES.includes('run'));
  const saved = { ...createInitialState(), tool: 'run', drawings: [
    { id: 'd1', type: 'run', points: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.4 }] },
    { id: 'd2', type: 'wavy', points: [{ x: 0.1, y: 0.1 }] },
  ] };
  const state = normalizeState(saved);
  assert.equal(state.tool, 'run');
  assert.deepEqual(state.drawings.map((d) => [d.id, d.type]), [['d1', 'run'], ['d2', 'freehand']]);
});

test('the run arrow is drawn dashed and offered in the toolbar', () => {
  assert.match(read('../styles.css'), /\.drawing-run\s*\{[^}]*stroke-dasharray/);
  assert.ok(read('../js/render.js').includes('drawing-run'));
  assert.ok(read('../index.html').includes('data-tool="run"'));
});

test('cones take the chosen cone color (PRD 7.2), orange by default', () => {
  const state = createInitialState();
  assert.equal(state.coneColor, PALETTE.orange);
  addProp(state, 'cone', { x: 0.2, y: 0.3 });
  state.coneColor = PALETTE.blue;
  addProp(state, 'cone', { x: 0.4, y: 0.3 });
  assert.deepEqual(state.cones.map((cone) => cone.color), [PALETTE.orange, PALETTE.blue]);
});

test('coneColor survives a reload and an invalid stored value falls back to orange', () => {
  assert.equal(normalizeState({ ...createInitialState(), coneColor: PALETTE.purple }).coneColor, PALETTE.purple);
  for (const bad of ['red', '#12', 42, null, undefined, '#gggggg']) {
    assert.equal(normalizeState({ ...createInitialState(), coneColor: bad }).coneColor, PALETTE.orange, String(bad));
  }
  const older = createInitialState();
  delete older.coneColor;
  assert.equal(normalizeState(older).coneColor, PALETTE.orange);
});

test('the cone color picker exists in the toolbar', () => {
  assert.ok(read('../index.html').includes('id="cone-color"'));
});
