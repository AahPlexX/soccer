import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_PRESETS } from '../js/builtins.js';
import {
  addProp, applyTeamFormation, DIALOG_NUDGE_STEP, findObject, isPlayerId, keyboardNudge, KEYBOARD_NUDGE_STEP,
  KEYBOARD_NUDGE_STEP_LARGE, loadPresetState, moveObjectBy, nudgePlayer, removeSelectedProp, resetBoardState,
  settlePlayers, toggleZone, updatePlayerDetails, updateTeamColors,
} from '../js/board-actions.js';
import { DEFAULT_COLORS } from '../js/constants.js';
import { formationPosition } from '../js/formations.js';
import { createInitialState } from '../js/state.js';

const playerById = (state, id) => state.players.find((player) => player.id === id);

test('findObject locates every object kind and isPlayerId recognises only players', () => {
  const state = createInitialState();
  state.cones.push({ id: 'cone-a', x: 0.2, y: 0.2 });
  state.miniGoals.push({ id: 'minigoal-a', x: 0.3, y: 0.3 });
  assert.equal(findObject(state, 'home-3').id, 'home-3');
  assert.equal(findObject(state, 'ball-main').id, 'ball-main');
  assert.equal(findObject(state, 'cone-a').id, 'cone-a');
  assert.equal(findObject(state, 'minigoal-a').id, 'minigoal-a');
  assert.equal(findObject(state, 'nothing'), null);
  assert.equal(findObject(state, null), null);
  assert.equal(isPlayerId(state, 'away-7'), true);
  assert.equal(isPlayerId(state, 'cone-a'), false);
});

test('addProp places and selects each prop kind, and ignores non-prop tools', () => {
  const state = createInitialState();
  const cone = addProp(state, 'cone', { x: 0.2, y: 0.3 });
  assert.equal(cone.message, 'Cone added');
  assert.deepEqual(state.cones, [{ id: cone.id, x: 0.2, y: 0.3, color: '#ff8c1a' }]);
  assert.equal(state.selectedObjectId, cone.id);

  const ball = addProp(state, 'ball', { x: 1.5, y: -1 });
  assert.equal(ball.message, 'Extra ball added');
  assert.deepEqual(state.balls.at(-1), { id: ball.id, x: 1, y: 0, primary: false });

  const goal = addProp(state, 'minigoal', { x: 0.6, y: 0.6 });
  assert.equal(goal.message, 'Mini goal added');
  assert.match(goal.id, /^minigoal-/);

  const before = structuredClone(state);
  for (const tool of ['move', 'draw', 'arrow', 'toString', undefined]) assert.equal(addProp(state, tool, { x: 0.5, y: 0.5 }), null);
  assert.deepEqual(state, before);
});

test('removeSelectedProp protects players and the primary ball and removes props', () => {
  const state = createInitialState();
  assert.equal(removeSelectedProp(state), 'none-selected');

  for (const protectedId of ['home-4', 'ball-main']) {
    state.selectedObjectId = protectedId;
    assert.equal(removeSelectedProp(state), 'protected');
    assert.equal(state.selectedObjectId, protectedId);
  }
  assert.equal(state.balls.length, 1);

  const { id } = addProp(state, 'cone', { x: 0.4, y: 0.4 });
  assert.equal(removeSelectedProp(state), 'removed');
  assert.equal(state.cones.length, 0);
  assert.equal(state.selectedObjectId, null);

  const extra = addProp(state, 'ball', { x: 0.4, y: 0.4 });
  assert.notEqual(extra.id, id);
  assert.equal(removeSelectedProp(state), 'removed');
  assert.deepEqual(state.balls.map((ball) => ball.id), ['ball-main']);
});

test('toggleZone toggles known zones and rejects unknown ids', () => {
  const state = createInitialState();
  assert.equal(toggleZone(state, 'left'), true);
  assert.deepEqual(state.selectedZones, ['left']);
  assert.equal(toggleZone(state, 'awayBox'), true);
  assert.equal(toggleZone(state, 'left'), true);
  assert.deepEqual(state.selectedZones, ['awayBox']);
  assert.equal(toggleZone(state, 'nowhere'), false);
  assert.equal(toggleZone(state, 'toString'), false);
  assert.deepEqual(state.selectedZones, ['awayBox']);
});

test('keyboardNudge maps arrow keys to small or large steps and ignores other keys', () => {
  assert.deepEqual(keyboardNudge('ArrowLeft'), [-KEYBOARD_NUDGE_STEP, 0]);
  assert.deepEqual(keyboardNudge('ArrowDown'), [0, KEYBOARD_NUDGE_STEP]);
  assert.deepEqual(keyboardNudge('ArrowRight', true), [KEYBOARD_NUDGE_STEP_LARGE, 0]);
  assert.deepEqual(keyboardNudge('ArrowUp', true), [0, -KEYBOARD_NUDGE_STEP_LARGE]);
  assert.equal(keyboardNudge('Enter'), null);
  assert.equal(keyboardNudge('constructor'), null);
});

test('moveObjectBy keeps objects on the pitch, records anchors, selects, and releases the carrier', () => {
  const state = createInitialState();
  state.simulation.carrierId = 'home-7';
  assert.equal(moveObjectBy(state, 'home-7', 2, 0), true);
  const striker = playerById(state, 'home-7');
  assert.equal(striker.x, 1);
  assert.equal(striker.anchorX, 1);
  assert.equal(state.selectedObjectId, 'home-7');
  assert.equal(state.simulation.carrierId, null);

  assert.equal(moveObjectBy(state, 'ball-main', 0, -2), true);
  assert.equal(state.balls[0].y, 0);
  assert.equal('anchorY' in state.balls[0], false);

  assert.equal(moveObjectBy(state, 'missing', 0.1, 0.1), false);
});

test('nudgePlayer steps a player, returns them to their formation spot, and ignores unknown input', () => {
  const state = createInitialState();
  const player = playerById(state, 'home-5');
  const startX = player.x;
  assert.equal(nudgePlayer(state, 'home-5', 'right'), true);
  assert.ok(Math.abs(player.x - (startX + DIALOG_NUDGE_STEP)) < 1e-12);
  assert.equal(player.anchorX, player.x);

  player.y = 0.05;
  assert.equal(nudgePlayer(state, 'home-5', 'center'), true);
  assert.deepEqual({ x: player.x, y: player.y }, formationPosition(state.players, player, state.homeFormation));
  assert.equal(player.anchorY, player.y);

  const before = structuredClone(state);
  assert.equal(nudgePlayer(state, 'home-5', 'diagonal'), false);
  assert.equal(nudgePlayer(state, 'nobody', 'left'), false);
  assert.deepEqual(state, before);
});

test('applyTeamFormation applies an approved shape and rejects anything else without side effects', () => {
  const state = createInitialState();
  state.currentPresetId = 'preset-1';
  state.simulation.carrierId = 'home-7';

  const before = structuredClone(state);
  assert.equal(applyTeamFormation(state, 'home', '4-4-2'), false);
  assert.equal(applyTeamFormation(state, 'referees', '1-2-3-1'), false);
  assert.deepEqual(state, before);

  assert.equal(applyTeamFormation(state, 'home', '1-2-3-1'), true);
  assert.equal(state.homeFormation, '1-2-3-1');
  assert.equal(playerById(state, 'home-3').role, 'CD');
  assert.equal(playerById(state, 'home-3').label, 'CD');
  assert.equal(state.currentPresetId, null);
  assert.equal(state.simulation.carrierId, null);
  assert.equal(state.awayFormation, '1-2-3-1');
});

test('updatePlayerDetails validates the jersey number and normalizes label and color', () => {
  const state = createInitialState();
  assert.equal(updatePlayerDetails(state, 'nobody', { number: 5 }), 'missing');
  for (const number of [0, 100, 7.5, Number.NaN]) {
    assert.equal(updatePlayerDetails(state, 'home-2', { number, label: 'X' }), 'invalid-number');
  }
  assert.equal(playerById(state, 'home-2').number, 2);

  assert.equal(updatePlayerDetails(state, 'home-2', { number: 12, label: '  Sam  ', colorOverride: '#7b4dff' }), 'updated');
  assert.deepEqual(
    (({ number, label, colorOverride }) => ({ number, label, colorOverride }))(playerById(state, 'home-2')),
    { number: 12, label: 'Sam', colorOverride: '#7b4dff' },
  );

  assert.equal(updatePlayerDetails(state, 'home-2', { number: 12, label: '   ', colorOverride: '' }), 'updated');
  assert.equal(playerById(state, 'home-2').label, playerById(state, 'home-2').role);
  assert.equal(playerById(state, 'home-2').colorOverride, null);
});

test('updateTeamColors applies valid hex colors only', () => {
  const state = createInitialState();
  updateTeamColors(state, { home: '#000000', away: 'red', homeGoalkeeper: 7, extra: '#123456' });
  assert.deepEqual(state.colors, { ...DEFAULT_COLORS, home: '#000000' });
});

test('settlePlayers keeps the selected player in place and re-anchors the players it displaces', () => {
  const state = createInitialState();
  Object.assign(playerById(state, 'home-7'), { x: 0.5, y: 0.5 });
  Object.assign(playerById(state, 'away-7'), { x: 0.5, y: 0.5 });
  state.selectedObjectId = 'home-7';
  settlePlayers(state);
  const home = playerById(state, 'home-7');
  const away = playerById(state, 'away-7');
  assert.deepEqual({ x: home.x, y: home.y }, { x: 0.5, y: 0.5 });
  assert.notDeepEqual({ x: away.x, y: away.y }, { x: 0.5, y: 0.5 });
  assert.deepEqual({ x: away.anchorX, y: away.anchorY }, { x: away.x, y: away.y });
});

test('resetBoardState returns a detached baseline that keeps the theme and preset identity', () => {
  const snapshot = createInitialState();
  snapshot.players[0].x = 0.11;
  const current = createInitialState();
  current.theme = 'field';
  current.currentPresetId = 'preset-9';
  current.simulation.running = true;

  const next = resetBoardState(snapshot, current);
  assert.equal(next.theme, 'field');
  assert.equal(next.currentPresetId, 'preset-9');
  assert.equal(next.simulation.running, false);
  assert.equal(next.players[0].x, 0.11);
  next.players[0].x = 0.99;
  assert.equal(snapshot.players[0].x, 0.11);
});

test('loadPresetState returns a detached, tagged board for built-in and saved presets', () => {
  const preset = BUILT_IN_PRESETS.find((item) => item.id === 'builtin-goal-kick-build-out');
  const loaded = loadPresetState(preset.createState(), preset.id);
  assert.equal(loaded.currentPresetId, preset.id);
  assert.equal(loaded.simulation.carrierId, 'home-1');

  const saved = createInitialState();
  const fromSaved = loadPresetState(saved, 'preset-3');
  fromSaved.players[0].x = 0.77;
  assert.notEqual(saved.players[0].x, 0.77);
  assert.equal(fromSaved.currentPresetId, 'preset-3');
});
