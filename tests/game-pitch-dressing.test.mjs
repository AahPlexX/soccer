import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../js/game/renderer.js', import.meta.url), 'utf8');

test('G-19: the goal net is a drawn mesh on the back and both sides, and the frame has a dark edge', () => {
  assert.equal((renderer.match(/grid\(at\(/g) ?? []).length, 4, 'floor, back wall and both side walls get a mesh');
  assert.match(renderer, /postEdge: 'rgba\(0,0,0,0\.5\)'/);
  assert.match(renderer, /const post = \(y\) => line\(at\(x, y, 0\), at\(x, y, GOAL_HEIGHT\)\);/);
});

test('G-20: the area outside the touchlines is close to the grass colour, not a dark band', () => {
  const apron = /apron: '#([0-9a-f]{6})'/.exec(renderer)?.[1];
  const grass = /grassB: '#([0-9a-f]{6})'/.exec(renderer)?.[1];
  assert.ok(apron && grass);
  const green = (hex) => Number.parseInt(hex.slice(2, 4), 16);
  assert.ok(green(grass) - green(apron) <= 0x10, 'the apron is at most a slight step darker than the grass');
});
