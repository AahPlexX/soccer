import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMATION_NAMES } from '../js/constants.js';
import { createTeamPlayers, formationAnchors } from '../js/formations.js';
import { createHistory } from '../js/history.js';
import { formationSlots } from '../js/game/rules.js';
import { createInitialState, normalizeState } from '../js/state.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../board-ui.css', import.meta.url), 'utf8');

test('C-48: the undo history holds 200 steps, and drops the oldest first beyond that', () => {
  const state = createInitialState();
  const history = createHistory();
  history.reset(state);
  for (let i = 1; i <= 230; i += 1) { state.players[0].x = i / 1000; history.record(state); }
  let steps = 0;
  while (history.undo(state)) steps += 1;
  assert.equal(steps, 200, 'exactly the last 200 edits can be undone');
  assert.ok(Math.abs(state.players[0].x - 30 / 1000) < 1e-9, 'and the oldest 30 are gone: undo stops at edit 30');
});

test('C-19: every formation gives seven players per team inside the pitch with a goalkeeper and no two on top of each other', () => {
  assert.deepEqual([...FORMATION_NAMES], ['1-3-2-1', '1-2-3-1', '1-2-2-2', '1-3-1-2']);
  for (const name of FORMATION_NAMES) {
    for (const team of ['home', 'away']) {
      const anchors = formationAnchors(team, name);
      assert.equal(anchors.length, 7, `${name} ${team}`);
      assert.equal(anchors.filter(([role]) => role === 'GK').length, 1, `${name} ${team}: one goalkeeper`);
      for (const [, x, y] of anchors) assert.ok(x > 0 && x < 1 && y > 0 && y < 1, `${name} ${team}: on the pitch`);
      for (let i = 0; i < anchors.length; i += 1) for (let j = i + 1; j < anchors.length; j += 1) {
        assert.ok(Math.hypot(anchors[i][1] - anchors[j][1], (anchors[i][2] - anchors[j][2]) * 0.6) > 0.05, `${name} ${team}: players ${i + 1} and ${j + 1} are apart`);
      }
    }
    const home = formationAnchors('home', name);
    const away = formationAnchors('away', name);
    home.forEach(([role, x, y], i) => { assert.ok(Math.abs(away[i][1] - (1 - x)) < 1e-9 && Math.abs(away[i][2] - (1 - y)) < 1e-9, `${name}: the away side mirrors the home side (${role})`); });
    assert.equal(createTeamPlayers('home', name).length, 7);
  }
});

test('C-19: the board accepts and keeps every formation, and both selects offer them', () => {
  for (const name of FORMATION_NAMES) {
    const state = createInitialState();
    state.homeFormation = name;
    state.awayFormation = name;
    const normalized = normalizeState(JSON.parse(JSON.stringify(state)));
    assert.equal(normalized.homeFormation, name);
    assert.equal(normalized.awayFormation, name);
    assert.equal((html.match(new RegExp(`<option value="${name}"`, 'g')) ?? []).length, 2, `${name} is in both the "Our shape" and "Their shape" selects`);
  }
  assert.equal(normalizeState({ ...createInitialState(), homeFormation: 'nonsense' }).homeFormation, '1-3-2-1', 'an unknown shape still falls back');
});

test('C-19: Game Mode starts from the same formations rather than silently falling back to the default', () => {
  const fallback = formationSlots('home', 'no-such-shape').map((s) => `${s.role}${s.x.toFixed(2)}${s.y.toFixed(2)}`).join();
  for (const name of FORMATION_NAMES) {
    const slots = formationSlots('home', name);
    assert.equal(slots.length, 7);
    assert.equal(slots.filter((s) => s.role === 'GK').length, 1);
    if (name !== '1-3-2-1') assert.notEqual(slots.map((s) => `${s.role}${s.x.toFixed(2)}${s.y.toFixed(2)}`).join(), fallback, `${name} is its own shape in the game`);
  }
});

test('C-01 and C-03: Undo and Redo are shown on touch screens, and the selection bar wraps instead of hiding actions', () => {
  assert.match(css, /@media \(max-width: 1099px\) \{ #undo, #redo \{ display: inline-flex/, 'Undo/Redo come back below 1100 px');
  assert.match(css, /\.selection-actions \{ flex-wrap: wrap; overflow-x: visible;/, 'the phone selection bar wraps');
});

test('C-24 and C-23: one name for each action: Reset setup, Capture step, Step forward 1 s', () => {
  assert.match(html, /<button id="return-start" type="button">Reset setup<\/button>/);
  assert.match(html, /<button id="quick-capture" type="button">Capture step<\/button>/);
  assert.match(html, /Step forward 1 s<\/button>/);
  assert.doesNotMatch(html, /Capture teaching step|Return to starting setup/);
});

test('C-46: the scrim behind the tools drawer is hidden from screen readers so only one control is named "Close board tools"', () => {
  assert.match(html, /<button id="panel-scrim" type="button" aria-hidden="true" tabindex="-1">/);
  assert.equal((html.match(/aria-label="Close board tools"/g) ?? []).length, 1);
});

test('C-50: the ball can be grabbed with a thumb (its tap circle is larger than the old 22 px)', () => {
  const render = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');
  assert.match(render, /el\('circle', \{ r: 30, class: 'ball-hit' \}\)/);
});

test('C-47: when the browser will not save, the coach is told (a warning element and a way to export)', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /saveAutosave\(state\) === false/);
  assert.match(app, /storage-warning/);
  assert.match(app, /Export backup/);
  assert.match(css, /#storage-warning \{/);
});
