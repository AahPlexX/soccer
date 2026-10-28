import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COLORS } from '../js/constants.js';
import { createInitialState, normalizeState } from '../js/state.js';

test('non-object input and foreign schema versions produce a fresh initial state', () => {
  for (const candidate of [null, undefined, 'board', 42, [], { ...createInitialState(), schemaVersion: 99 }]) {
    assert.deepEqual(normalizeState(candidate), createInitialState());
  }
});

test('a valid state round-trips unchanged and normalization is idempotent', () => {
  assert.deepEqual(normalizeState(createInitialState()), createInitialState());
  const messy = { ...createInitialState(), theme: 'neon', speed: 'fast', selectedZones: ['left', 'nowhere'], cones: [null] };
  const once = normalizeState(messy);
  assert.deepEqual(normalizeState(once), once);
});

test('normalization never mutates its input', () => {
  const candidate = {
    ...createInitialState(),
    speed: Number.NaN,
    selectedZones: ['left', 'left', 7],
    balls: [{ id: 'b', x: 2, y: -1 }],
    simulation: { running: true, carrierId: 'ghost', actionClock: -1 },
  };
  candidate.players[0].x = 1.5;
  const before = structuredClone(candidate);
  normalizeState(candidate);
  assert.deepEqual(candidate, before);
});

test('invalid enumerations fall back to defaults while valid choices are kept', () => {
  const invalid = normalizeState({
    ...createInitialState(),
    theme: 'neon', tool: 'laser', speed: 3, spacingMode: 'chaos', homeFormation: '4-4-2', awayFormation: null, awayVisible: 'yes',
  });
  assert.equal(invalid.theme, 'turf');
  assert.equal(invalid.tool, 'move');
  assert.equal(invalid.speed, 1);
  assert.equal(invalid.spacingMode, 'good');
  assert.equal(invalid.homeFormation, '1-3-2-1');
  assert.equal(invalid.awayFormation, '1-2-3-1');
  assert.equal(invalid.awayVisible, true);

  const valid = normalizeState({
    ...createInitialState(),
    theme: 'field', tool: 'arrow', speed: '0.5', spacingMode: 'swarm', homeFormation: '1-2-3-1', awayFormation: '1-3-2-1', awayVisible: false,
  });
  assert.equal(valid.theme, 'field');
  assert.equal(valid.tool, 'arrow');
  assert.equal(valid.speed, 0.5);
  assert.equal(valid.spacingMode, 'swarm');
  assert.equal(valid.homeFormation, '1-2-3-1');
  assert.equal(valid.awayFormation, '1-3-2-1');
  assert.equal(valid.awayVisible, false);
});

test('zone opacity is clamped to the slider range and zone ids are filtered and de-duplicated', () => {
  const opacity = (zoneOpacity) => normalizeState({ ...createInitialState(), zoneOpacity }).zoneOpacity;
  assert.equal(opacity(5), 0.45);
  assert.equal(opacity(-1), 0.1);
  assert.equal(opacity('abc'), 0.2);
  assert.equal(opacity(0.3), 0.3);

  const zones = normalizeState({ ...createInitialState(), selectedZones: ['left', 'left', 'nowhere', 7, 'awayBox', 'toString'] });
  assert.deepEqual(zones.selectedZones, ['left', 'awayBox']);
});

test('team colors keep only valid hex values for known keys', () => {
  const { colors } = normalizeState({ ...createInitialState(), colors: { home: '#000000', away: 'red', homeGoalkeeper: 42, extra: '#123456' } });
  assert.deepEqual(colors, { ...DEFAULT_COLORS, home: '#000000' });
  assert.deepEqual(normalizeState({ ...createInitialState(), colors: 'blue' }).colors, { ...DEFAULT_COLORS });
});

test('a structurally broken roster falls back to the default players', () => {
  const fallback = createInitialState().players;
  const duplicateId = createInitialState();
  duplicateId.players[1] = { ...duplicateId.players[1], id: duplicateId.players[0].id };
  const unbalanced = createInitialState();
  unbalanced.players[0].team = 'away';
  const nonFinite = createInitialState();
  nonFinite.players[3].x = Number.NaN;
  const missingRole = createInitialState();
  delete missingRole.players[5].role;

  for (const candidate of [duplicateId, unbalanced, nonFinite, missingRole]) {
    assert.deepEqual(normalizeState(candidate).players, fallback);
  }
});

test('recoverable player fields are repaired individually and extra fields are preserved', () => {
  const candidate = createInitialState();
  const home = candidate.players[0];
  home.x = 1.4;
  delete home.anchorX;
  home.number = 0;
  home.label = '';
  home.colorOverride = 'pink';
  home.note = 'captain';
  candidate.players[1].colorOverride = '#7b4dff';

  const [first, second] = normalizeState(candidate).players;
  assert.equal(first.x, 1);
  assert.equal(first.anchorX, 1);
  assert.equal(first.number, 1);
  assert.equal(first.label, first.role);
  assert.equal(first.colorOverride, null);
  assert.equal(first.note, 'captain');
  assert.equal(second.colorOverride, '#7b4dff');
});

test('exactly one primary ball is kept first, invalid balls are dropped, and an empty list restores the centre ball', () => {
  const { balls } = normalizeState({
    ...createInitialState(),
    balls: [
      { id: 'extra', x: 0.2, y: 0.2, primary: false },
      { id: 'ball-main', x: 0.5, y: 0.5, primary: true },
      null,
      { id: 'extra', x: 0.3, y: 0.3 },
    ],
  });
  assert.deepEqual(balls.map((ball) => [ball.id, ball.primary]), [['ball-main', true], ['extra', false]]);

  const promoted = normalizeState({ ...createInitialState(), balls: [{ id: 'a', x: 0.1, y: 0.1 }] }).balls;
  assert.deepEqual(promoted, [{ id: 'a', x: 0.1, y: 0.1, primary: true }]);

  assert.deepEqual(normalizeState({ ...createInitialState(), balls: [null] }).balls, createInitialState().balls);
});

test('props drop invalid and duplicate entries but keep their own fields', () => {
  const { cones } = normalizeState({
    ...createInitialState(),
    cones: [
      { id: 'c1', x: 0.1, y: 0.1, color: '#ff8c1a' },
      { id: 'c1', x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.3 },
      { id: 'c2', x: Number.NaN, y: 0.1 },
    ],
  });
  assert.deepEqual(cones, [{ id: 'c1', x: 0.1, y: 0.1, color: '#ff8c1a' }]);
});

test('drawings without usable points are dropped and unknown drawing types become freehand', () => {
  const { drawings } = normalizeState({
    ...createInitialState(),
    drawings: [
      { id: 'd1', type: 'arrow', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
      { id: 'd2', points: [] },
      { id: 'd3', points: [null] },
      { id: 'd4', type: 'spiral', points: [{ x: 0.5, y: 0.5 }] },
      'junk',
    ],
  });
  assert.deepEqual(drawings.map((drawing) => [drawing.id, drawing.type]), [['d1', 'arrow'], ['d4', 'freehand']]);
});

test('simulation state is never restored running and dangling or invalid references are cleared', () => {
  const { simulation } = normalizeState({
    ...createInitialState(),
    simulation: {
      running: true,
      possessionTeam: 'nobody',
      carrierId: 'ghost',
      receiverId: 'home-6',
      ballTarget: { x: 1.04, y: 0.55 },
      actionClock: -3,
      tackleCooldown: 'x',
      shotCount: 2.5,
      restart: { type: 'penalty', team: 'home' },
    },
  });
  assert.equal(simulation.running, false);
  assert.equal(simulation.possessionTeam, 'home');
  assert.equal(simulation.carrierId, null);
  assert.equal(simulation.receiverId, 'home-6');
  assert.deepEqual(simulation.ballTarget, { x: 1.04, y: 0.55 }, 'shot targets past the goal line are not clamped');
  assert.equal(simulation.actionClock, 0);
  assert.equal(simulation.tackleCooldown, 0);
  assert.equal(simulation.shotCount, 0);
  assert.equal(simulation.restart, null);

  const restart = { type: 'corner', team: 'away', side: 'home' };
  assert.deepEqual(normalizeState({ ...createInitialState(), simulation: { restart } }).simulation.restart, restart);
  assert.deepEqual(normalizeState({ ...createInitialState(), simulation: 'oops' }).simulation, createInitialState().simulation);
});

test('identifier fields accept only non-empty strings and unknown top-level keys survive', () => {
  const normalized = normalizeState({ ...createInitialState(), currentPresetId: 42, selectedObjectId: {}, futureFeature: { enabled: true } });
  assert.equal(normalized.currentPresetId, null);
  assert.equal(normalized.selectedObjectId, null);
  assert.deepEqual(normalized.futureFeature, { enabled: true });
  assert.equal(normalizeState({ ...createInitialState(), currentPresetId: 'preset-1' }).currentPresetId, 'preset-1');
});
