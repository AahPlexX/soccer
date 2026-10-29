import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { PALETTE } from '../js/constants.js';
import { buildBoardScene } from '../js/board-scene.js';
import { createInitialState, normalizeState } from '../js/state.js';

test('zone color and drawing style default sensibly and reject invalid values', () => {
  const state = createInitialState();
  assert.deepEqual([state.zoneColor, state.drawColor, state.drawWidth], [PALETTE.yellow, PALETTE.yellow, 'medium']);
  const bad = normalizeState({ ...state, zoneColor: 'red', drawColor: 5, drawWidth: 'huge' });
  assert.deepEqual([bad.zoneColor, bad.drawColor, bad.drawWidth], [PALETTE.yellow, PALETTE.yellow, 'medium']);
  const good = normalizeState({ ...state, zoneColor: PALETTE.blue, drawColor: PALETTE.red, drawWidth: 'thick' });
  assert.deepEqual([good.zoneColor, good.drawColor, good.drawWidth], [PALETTE.blue, PALETTE.red, 'thick']);
});

test('drawings keep a valid color and width and drop invalid ones', () => {
  const points = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }];
  const { drawings } = normalizeState({
    ...createInitialState(),
    drawings: [
      { id: 'a', type: 'arrow', points, color: PALETTE.red, width: 'thin' },
      { id: 'b', type: 'arrow', points, color: 'javascript:1', width: 'wide' },
      { id: 'c', type: 'run', points },
    ],
  });
  assert.deepEqual([drawings[0].color, drawings[0].width], [PALETTE.red, 'thin']);
  assert.ok(!('color' in drawings[1]) && !('width' in drawings[1]));
  assert.ok(!('color' in drawings[2]));
});

test('3D zone overlays and drawings use the chosen colors', () => {
  const state = createInitialState();
  state.zoneColor = PALETTE.purple;
  state.selectedZones = ['left'];
  state.drawings = [{ id: 'd1', type: 'arrow', points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }], color: PALETTE.red }];
  const board = buildBoardScene(THREE);
  board.sync(state);
  const overlay = board.scene.children.find((c) => c.material?.transparent && c.geometry.type === 'PlaneGeometry' && c.visible);
  assert.equal(overlay.material.color.getHexString(), PALETTE.purple.slice(1));
  const line = board.objectFor('d1').children[0].children[0];
  assert.equal(line.material.color.getHexString(), PALETTE.red.slice(1));
});
