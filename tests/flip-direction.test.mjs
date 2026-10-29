import test from 'node:test';
import assert from 'node:assert/strict';
import { flipBoard, rotateSpatial, zoneRect } from '../js/board-rotation.js';
import { applyTeamFormation, nudgePlayer } from '../js/board-actions.js';
import { applySoloAction, applyPlayerAction } from '../js/player-actions.js';
import { stepSimulation } from '../js/simulation.js';
import { createInitialState, normalizeState } from '../js/state.js';
import { ZONES } from '../js/constants.js';
import { createHistory } from '../js/history.js';

const clone = (state) => normalizeState(JSON.parse(JSON.stringify(state)));
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

function assertMirrored(unflipped, flipped, label) {
  unflipped.players.forEach((p, i) => {
    const q = flipped.players[i];
    near(q.x, 1 - p.x, `${label} ${p.id}.x`);
    near(q.y, 1 - p.y, `${label} ${p.id}.y`);
  });
  near(flipped.balls[0].x, 1 - unflipped.balls[0].x, `${label} ball.x`);
  near(flipped.balls[0].y, 1 - unflipped.balls[0].y, `${label} ball.y`);
  assert.equal(flipped.simulation.carrierId, unflipped.simulation.carrierId, `${label} carrier`);
}

test('rotating twice restores the board, and a flip puts the home team on the right', () => {
  const state = createInitialState();
  const original = clone(state);
  rotateSpatial(state);
  rotateSpatial(state);
  state.players.forEach((p, i) => { near(p.x, original.players[i].x, 'x'); near(p.anchorY, original.players[i].anchorY, 'anchorY'); });
  assert.ok(createInitialState().players.find((p) => p.id === 'home-1').x < 0.5);
  flipBoard(state);
  assert.equal(state.flipped, true);
  assert.ok(state.players.find((p) => p.id === 'home-1').x > 0.5, 'our goalkeeper is on the right');
  assert.ok(state.players.find((p) => p.id === 'away-1').x < 0.5);
  flipBoard(state);
  assert.equal(state.flipped, false);
});

test('team-relative zones follow their team when flipped; flank zones stay on screen', () => {
  assert.deepEqual(zoneRect('homeBuild', false), ZONES.homeBuild);
  const rotated = zoneRect('homeBuild', true);
  near(rotated.x1, 0.65, 'x1'); near(rotated.x2, 1, 'x2');
  assert.deepEqual(zoneRect('left', true), ZONES.left);
  assert.deepEqual(zoneRect('center', true), ZONES.center);
  assert.equal(zoneRect('nowhere', true), undefined);
});

test('a flipped board plays out as an exact half-turn of the unflipped one', () => {
  const a = createInitialState();
  const b = clone(a);
  flipBoard(b);
  a.simulation.running = true;
  b.simulation.running = true;
  for (let i = 0; i < 60 * 25; i += 1) {
    stepSimulation(a, 1 / 60);
    stepSimulation(b, 1 / 60);
    if (i % 120 === 0) assertMirrored(a, b, `step ${i}`);
  }
  assertMirrored(a, b, 'final');
  assert.equal(a.simulation.shotCount, b.simulation.shotCount);
  assert.equal(b.flipped, true, 'the flag survives stepping');
});

test('zone rules and left/right flank selections are symmetric when flipped', () => {
  const a = createInitialState();
  Object.assign(a, { selectedZones: ['right'], zoneRestrictionMode: 'keep-in', zoneRestrictionScope: 'home' });
  const b = clone(a);
  flipBoard(b);
  b.selectedZones = ['left']; // the screen flank rotates with the pitch
  a.simulation.running = true;
  b.simulation.running = true;
  for (let i = 0; i < 60 * 15; i += 1) { stepSimulation(a, 1 / 60); stepSimulation(b, 1 / 60); }
  assertMirrored(a, b, 'zone rule');
  assert.deepEqual(b.selectedZones, ['left'], 'selections are restored after stepping');
});

test('a play script runs identically on a flipped board', () => {
  const a = createInitialState();
  Object.assign(a.players.find((p) => p.id === 'home-6'), { x: 0.3, y: 0.4, anchorX: 0.3, anchorY: 0.4 });
  Object.assign(a.players.find((p) => p.id === 'home-7'), { x: 0.5, y: 0.45, anchorX: 0.5, anchorY: 0.45 });
  applyPlayerAction(a, 'pass-and-follow', 'home-6', 'home-7');
  const b = clone(a);
  flipBoard(b);
  a.simulation.running = true;
  b.simulation.running = true;
  for (let i = 0; i < 60 * 14; i += 1) { stepSimulation(a, 1 / 60); stepSimulation(b, 1 / 60); }
  assertMirrored(a, b, 'script');
  assert.equal(a.script.every((s) => s.tasks.every((t) => t.done)), b.script.every((s) => s.tasks.every((t) => t.done)));
});

test('formations, centering and solo actions respect the board direction', () => {
  const state = createInitialState();
  flipBoard(state);
  applyTeamFormation(state, 'home', '1-2-3-1');
  const gk = state.players.find((p) => p.id === 'home-1');
  assert.ok(gk.x > 0.5 && gk.anchorX > 0.5, 'a reapplied formation stays on our flipped side');
  gk.x = 0.5;
  nudgePlayer(state, 'home-1', 'center');
  assert.ok(gk.x > 0.5, 'centering returns to the flipped formation spot');
  const striker = state.players.find((p) => p.id === 'home-7');
  Object.assign(striker, { x: 0.6, y: 0.4 });
  applySoloAction(state, 'run-forward', 'home-7');
  assert.ok(state.drawings.at(-1).points[1].x < 0.6, 'our team now runs forward toward the left');
});

test('a flip is one undo step and redo restores it', () => {
  const state = createInitialState();
  const history = createHistory();
  history.reset(state);
  flipBoard(state);
  history.record(state);
  assert.equal(history.undo(state), true);
  assert.equal(state.flipped, false);
  assert.ok(state.players.find((p) => p.id === 'home-1').x < 0.5, 'positions come back too');
  assert.equal(history.redo(state), true);
  assert.equal(state.flipped, true);
  assert.ok(state.players.find((p) => p.id === 'home-1').x > 0.5);
});

test('the flag is validated and defaults to unflipped', () => {
  assert.equal(createInitialState().flipped, false);
  assert.equal(normalizeState({ ...createInitialState(), flipped: 'yes' }).flipped, false);
  assert.equal(normalizeState({ ...createInitialState(), flipped: true }).flipped, true);
});
