import test from 'node:test';
import assert from 'node:assert/strict';
import { EDIT_KEYS, createHistory } from '../js/history.js';
import { createInitialState } from '../js/state.js';

function setup() {
  const state = createInitialState();
  const history = createHistory();
  history.reset(state);
  return { state, history };
}

test('a recorded edit can be undone and redone', () => {
  const { state, history } = setup();
  const original = state.players[0].x;
  state.players[0].x = 0.3;
  assert.equal(history.record(state), true);
  assert.equal(history.canUndo, true);
  assert.equal(history.undo(state), true);
  assert.equal(state.players[0].x, original);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo(state), true);
  assert.equal(state.players[0].x, 0.3);
});

test('changing the tool, theme, speed, or selection is not an undo step', () => {
  const { state, history } = setup();
  Object.assign(state, { tool: 'run', theme: 'dark', speed: 2, selectedObjectId: 'home-3' });
  assert.equal(history.record(state), false);
  assert.equal(history.canUndo, false);
  assert.ok(!EDIT_KEYS.includes('tool') && !EDIT_KEYS.includes('simulation') && !EDIT_KEYS.includes('selectedObjectId'));
});

test('props, drawings, zones, and colors are covered, and one edit is one step', () => {
  const { state, history } = setup();
  state.cones.push({ id: 'c1', x: 0.2, y: 0.2, color: '#ff8c1a' });
  state.drawings.push({ id: 'd1', type: 'run', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
  state.selectedZones = ['left'];
  state.colors = { ...state.colors, home: '#1769ff' };
  assert.equal(history.record(state), true);
  assert.equal(history.record(state), false, 'recording the same content twice adds nothing');
  history.undo(state);
  assert.deepEqual([state.cones, state.drawings, state.selectedZones], [[], [], []]);
  assert.equal(history.canUndo, false);
});

test('a new edit after an undo clears the redo steps', () => {
  const { state, history } = setup();
  state.players[0].x = 0.31; history.record(state);
  state.players[0].x = 0.32; history.record(state);
  history.undo(state);
  assert.equal(history.canRedo, true);
  state.players[0].y = 0.9; history.record(state);
  assert.equal(history.canRedo, false);
});

test('rebase adopts the simulation moving players without creating a step', () => {
  const { state, history } = setup();
  state.players[0].x = 0.4;
  history.rebase(state);
  assert.equal(history.canUndo, false);
  assert.equal(history.record(state), false);
  state.players[0].x = 0.45;
  assert.equal(history.record(state), true);
  history.undo(state);
  assert.equal(state.players[0].x, 0.4);
});

test('later edits to the live board do not corrupt stored steps', () => {
  const { state, history } = setup();
  const original = state.players[0].y;
  state.players[0].y = 0.1; history.record(state);
  state.players[0].y = 0.2; history.record(state);
  state.players[0].y = 0.99; // an unrecorded in-place mutation
  history.undo(state);
  assert.equal(state.players[0].y, 0.1);
  history.undo(state);
  assert.equal(state.players[0].y, original);
});

test('history is capped so memory stays bounded', () => {
  const state = createInitialState();
  const history = createHistory(3);
  history.reset(state);
  for (let i = 1; i <= 6; i += 1) { state.players[0].x = i / 10; history.record(state); }
  let undone = 0;
  while (history.undo(state)) undone += 1;
  assert.equal(undone, 3);
  assert.equal(state.players[0].x, 0.3);
});

test('undo and redo with nothing to do report false and leave the board alone', () => {
  const { state, history } = setup();
  const before = JSON.stringify(state.players);
  assert.equal(history.undo(state), false);
  assert.equal(history.redo(state), false);
  assert.equal(JSON.stringify(state.players), before);
});
