import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_ACTIONS, SOLO_ACTIONS, actionDrawings, applyPlayerAction, applySoloAction, soloDrawing } from '../js/player-actions.js';
import { spacingDistance } from '../js/geometry.js';
import { createInitialState } from '../js/state.js';

const A = { x: 0.2, y: 0.5 };
const B = { x: 0.6, y: 0.5 };

test('every listed action draws something between two separated players', () => {
  for (const { id } of PLAYER_ACTIONS) {
    const drawings = actionDrawings(id, A, B).filter(Boolean);
    assert.ok(drawings.length > 0, id);
    drawings.forEach((d) => assert.ok(['arrow', 'run'].includes(d.type) && d.points.length === 2));
  }
  assert.deepEqual(actionDrawings('nope', A, B), []);
});

test('a pass is a solid arrow from the passer toward the receiver, clear of both discs', () => {
  const [pass] = actionDrawings('pass', A, B);
  assert.equal(pass.type, 'arrow');
  assert.ok(pass.points[0].x > A.x && pass.points[1].x < B.x);
  assert.ok(spacingDistance(pass.points[0], A) > 0.03 && spacingDistance(pass.points[1], B) > 0.03);
});

test('receive reverses the pass, swap draws two opposite runs, pass-and-follow continues past the receiver', () => {
  const [receive] = actionDrawings('receive', A, B);
  assert.ok(receive.points[0].x > B.x - 0.1 && receive.points[1].x < A.x + 0.1, 'points from B toward A');
  const swap = actionDrawings('swap', A, B);
  assert.deepEqual(swap.map((d) => d.type), ['run', 'run']);
  assert.ok(swap[0].points[1].x > swap[1].points[1].x);
  const [pass, follow] = actionDrawings('pass-and-follow', A, B);
  assert.equal(pass.type, 'arrow');
  assert.equal(follow.type, 'run');
  assert.ok(follow.points[1].x > B.x);
});

test('players that are too close get no arrow, and arrows stay on the pitch', () => {
  assert.deepEqual(actionDrawings('pass', A, { x: 0.21, y: 0.5 }), [null]);
  const [edge] = actionDrawings('run-to', { x: 0.9, y: 0.95 }, { x: 1, y: 1 });
  assert.ok(!edge || edge.points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
});

test('solo actions point toward the goal each team attacks and stay on the pitch', () => {
  const home = { team: 'home', x: 0.4, y: 0.3 };
  const away = { team: 'away', x: 0.6, y: 0.3 };
  const shot = soloDrawing('shoot', home);
  assert.equal(shot.type, 'arrow');
  assert.ok(shot.points[1].x === 1 && shot.points[1].y === 0.5);
  assert.equal(soloDrawing('shoot', away).points[1].x, 0);
  const forward = soloDrawing('run-forward', home);
  assert.equal(forward.type, 'run');
  assert.ok(forward.points[1].x > home.x);
  assert.ok(soloDrawing('run-forward', away).points[1].x < away.x);
  assert.ok(soloDrawing('track-back', home).points[1].x < home.x);
  const cornered = soloDrawing('run-forward', { team: 'home', x: 1, y: 0.5 });
  assert.equal(cornered, null, 'no room to run past the goal line');
  assert.equal(soloDrawing('nope', home), null);
  assert.equal(SOLO_ACTIONS.length, 3);
});

test('applySoloAction draws for an on-pitch player and refuses benched or unknown ones', () => {
  const state = createInitialState();
  state.drawColor = '#7b4dff';
  assert.equal(applySoloAction(state, 'run-forward', 'home-6'), 1);
  assert.equal(state.drawings.at(-1).color, '#7b4dff');
  assert.equal(applySoloAction(state, 'run-forward', 'missing'), 0);
  state.players.find((p) => p.id === 'home-6').benched = true;
  assert.equal(applySoloAction(state, 'run-forward', 'home-6'), 0);
  assert.equal(state.drawings.length, 1);
});

test('applyPlayerAction appends styled drawings for on-pitch players only', () => {
  const state = createInitialState();
  state.drawColor = '#ef3340';
  state.drawWidth = 'thick';
  const [first, second] = ['home-6', 'home-7'];
  Object.assign(state.players.find((p) => p.id === first), A);
  Object.assign(state.players.find((p) => p.id === second), B);
  assert.equal(applyPlayerAction(state, 'pass-and-follow', first, second), 2);
  assert.equal(state.drawings.length, 2);
  assert.ok(state.drawings.every((d) => d.color === '#ef3340' && d.width === 'thick' && d.id));
  assert.equal(new Set(state.drawings.map((d) => d.id)).size, 2);
  assert.equal(applyPlayerAction(state, 'pass', first, first), 0);
  assert.equal(applyPlayerAction(state, 'pass', first, 'missing'), 0);
  state.players.find((p) => p.id === second).benched = true;
  assert.equal(applyPlayerAction(state, 'pass', first, second), 0);
  assert.equal(state.drawings.length, 2);
});
