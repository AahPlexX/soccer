import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_PRESETS } from '../js/builtins.js';

const allowed = new Set(['1-3-2-1', '1-2-3-1']);

test('all four required teaching presets are present and load valid board states', () => {
  assert.equal(BUILT_IN_PRESETS.length, 4);
  for (const preset of BUILT_IN_PRESETS) {
    const state = preset.createState();
    assert.equal(state.players.length, 14);
    assert.equal(state.balls.length >= 1, true);
    assert.ok(allowed.has(state.homeFormation));
    assert.ok(allowed.has(state.awayFormation));
  }
});

test('goal-kick preset starts from home goalkeeper possession', () => {
  const preset = BUILT_IN_PRESETS.find((item) => item.id === 'builtin-goal-kick-build-out');
  const state = preset.createState();
  assert.equal(state.simulation.carrierId, 'home-1');
  assert.equal(state.simulation.possessionTeam, 'home');
  assert.ok(state.selectedZones.includes('homeBuild'));
});
