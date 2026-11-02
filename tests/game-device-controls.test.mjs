import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTouchDevice } from '../js/game/touch-controls.js';

const menus = readFileSync(new URL('../js/game/menus.js', import.meta.url), 'utf8');
const gameMode = readFileSync(new URL('../js/game/game-mode.js', import.meta.url), 'utf8');

function withEnvironment(environment, run) {
  const saved = { matchMedia: globalThis.matchMedia, ontouchstart: Object.getOwnPropertyDescriptor(globalThis, 'ontouchstart') };
  if ('matchMedia' in environment) globalThis.matchMedia = environment.matchMedia; else delete globalThis.matchMedia;
  if (environment.ontouchstart) globalThis.ontouchstart = null; else delete globalThis.ontouchstart;
  try { return run(); } finally {
    if (saved.matchMedia) globalThis.matchMedia = saved.matchMedia; else delete globalThis.matchMedia;
    if (saved.ontouchstart) Object.defineProperty(globalThis, 'ontouchstart', saved.ontouchstart); else delete globalThis.ontouchstart;
  }
}
const pointer = (coarse) => (query) => ({ matches: query === '(pointer: coarse)' ? coarse : false });

test('a phone or tablet (primary pointer is a finger) is a touch device', () => {
  assert.equal(withEnvironment({ matchMedia: pointer(true), ontouchstart: true }, isTouchDevice), true);
});

test('a laptop is a keyboard device even when its touchscreen exposes ontouchstart', () => {
  assert.equal(withEnvironment({ matchMedia: pointer(false), ontouchstart: true }, isTouchDevice), false, 'a touchscreen laptop has a trackpad as its primary pointer');
  assert.equal(withEnvironment({ matchMedia: pointer(false), ontouchstart: false }, isTouchDevice), false);
});

test('without matchMedia the ontouchstart signal is the fallback', () => {
  assert.equal(withEnvironment({ ontouchstart: true }, isTouchDevice), true);
  assert.equal(withEnvironment({ ontouchstart: false }, isTouchDevice), false);
});

test('the title and pause menus say View controls, and the title shows the controls for the detected device without asking', () => {
  assert.equal((menus.match(/button\('View controls'/g) ?? []).length, 2, 'title menu and pause menu');
  assert.doesNotMatch(menus, /button\('Controls'/);
  assert.match(menus, /element\('p', 'g-controls-line', controlsLine\(\)\)/);
  assert.match(menus, /if \(touch\) return 'Left thumb moves/);
});

test('a finger on a laptop quietly brings up the on-screen pad during play, without a prompt', () => {
  assert.match(gameMode, /event\.pointerType === 'touch' && !touch && session\.mode === 'playing'\) touch = mountTouchControls/);
});
