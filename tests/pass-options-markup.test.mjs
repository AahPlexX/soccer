import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('pass-option overlay assets are loaded by the app shell HTML', () => {
  const html = read('index.html');
  assert.match(html, /href="\.\/pass-options\.css"/);
  assert.match(html, /type="module" src="\.\/js\/pass-options-ui\.js"/);
});

test('pass-option toggle is a pressed-state button controlling the pitch', () => {
  const source = read('js/pass-options-ui.js');
  assert.match(source, /button\.type = 'button'/);
  assert.match(source, /setAttribute\('aria-pressed', 'false'\)/);
  assert.match(source, /setAttribute\('aria-controls', 'pitch'\)/);
  assert.match(source, /dataset\.passOptions/);
});

test('pass-option toggle requests an immediate redraw while paused', () => {
  const ui = read('js/pass-options-ui.js');
  const renderer = read('js/render.js');
  assert.match(ui, /dispatchEvent\(new Event\('pass-options-change'\)\)/);
  assert.match(renderer, /addEventListener\('pass-options-change'/);
  assert.match(renderer, /renderPassOptions\(latestPassOptionSvg, latestPassOptionState\)/);
});

test('renderer preallocates six noninteractive pass-line slots', () => {
  const source = read('js/render.js');
  assert.match(source, /id: 'pass-option-layer'/);
  assert.match(source, /index < 6/);
  assert.match(source, /availablePassOptions\(state\)/);
});

test('pass-option lines use dashed non-scaling strokes and never capture pointer input', () => {
  const css = read('pass-options.css');
  assert.match(css, /stroke-dasharray:/);
  assert.match(css, /vector-effect: non-scaling-stroke/);
  assert.match(css, /pointer-events: none/);
});
